import { buildSharedButton } from '../../../../../_Components/sharedButton';
import { buildSharedInputField } from '../../../../../_Components/sharedInput';
import { buildSharedSelectField, hydrateSharedSelects } from '../../../../../_Components/sharedSelect';
import type { MemorySDKImpl } from '../../../sdk/memory-sdk';
import type {
    EditorExperienceSnapshot,
    MemoryLifecycleState,
    OwnedMemoryState,
    PersonaMemoryProfile,
} from '../../../../../SDK/stx';
import type { RecordEditorViewMeta } from '../types';

interface MemoryPageRecallLogEntry {
    recordKey: string;
    loggedAt?: number | null;
}

interface MemoryPageActorFilter {
    key: string;
    label: string;
}

interface MemoryPageCardOptions {
    icon: string;
    eyebrow: string;
    value: string;
    detail?: string;
    meta?: string;
    tone?: 'gold' | 'azure' | 'crimson' | 'slate';
}

interface MemoryPagePersonaCardOptions {
    active?: boolean;
    extraActionsHtml?: string;
}

interface MemoryPageRenderHelpers {
    escapeHtml(text: string): string;
    buildTipAttr(text: string): string;
    formatTimeLabel(value: number): string;
    formatActorKeyLabel(actorKey: string): string;
    formatMemorySubtypeLabel(memorySubtype: string): string;
    resolveActorDisplayLabel(actorKey: string, actorLabel: string): string;
    buildMemoryRecordHeadline(
        recordKey: string,
        lifecycle: MemoryLifecycleState | undefined,
        owned: OwnedMemoryState,
    ): string;
    parseImportanceInput(input: string, fallback: number): number | null;
    renderMemoryDashboardCardMarkup(options: MemoryPageCardOptions): string;
    buildRecallSummaryCardsMarkup(experience: EditorExperienceSnapshot): string;
    buildSuppressedRecallListMarkup(experience: EditorExperienceSnapshot): string;
    renderPersonaProfileCardMarkup(
        actorKey: string,
        actorLabel: string,
        profile: PersonaMemoryProfile,
        options?: MemoryPagePersonaCardOptions,
    ): string;
    renderMemoryRecordCardMarkup(
        owned: OwnedMemoryState,
        lifecycle: MemoryLifecycleState | undefined,
        recall: { count: number; lastAt: number } | undefined,
        actorLabelMap: Map<string, string>,
        activeActorKey: string | null,
        eventTitleMap: Map<string, string>,
    ): string;
}

interface MemoryPageRenderOptions {
    contentArea: HTMLElement;
    currentMemoryActorKey: string;
    currentMemorySearchQuery: string;
    setCurrentMemoryActorKey(nextActorKey: string): void;
    setCurrentMemorySearchQuery(nextQuery: string): void;
    ensureRecordMemory(): Promise<MemorySDKImpl | null>;
    rerender(): Promise<void>;
    showSuccess(message: string): void;
    showError(message: string): void;
    memorySubtypeOptions: string[];
    experience: EditorExperienceSnapshot;
    ownedStates: OwnedMemoryState[];
    lifecycleList: MemoryLifecycleState[];
    recallLog: MemoryPageRecallLogEntry[];
    personaProfiles: Record<string, PersonaMemoryProfile>;
    activeActorKey: string | null;
    helpers: MemoryPageRenderHelpers;
}

/**
 * 功能：提供角色记忆页的展示元数据。
 */
export const MEMORY_PAGE_META: RecordEditorViewMeta = {
    label: '角色记忆',
    icon: 'fa-solid fa-user-helmet-safety',
    title: '角色记忆面板',
    subtitle: '用 RPG 角色卡方式查看记忆、遗忘、重大事件影响和角色画像。',
    tip: '查看每个角色的记忆状态、遗忘阶段、主视角与重大事件影响。',
};

/**
 * 功能：判断角色记忆条目是否命中当前检索词。
 * @param owned 角色记忆状态。
 * @param actorLabelMap 角色标签映射。
 * @param lifecycle 生命周期信息。
 * @param query 当前检索词。
 * @param helpers 页面渲染工具。
 * @returns 是否命中。
 */
function matchesMemorySearch(
    owned: OwnedMemoryState,
    actorLabelMap: Map<string, string>,
    lifecycle: MemoryLifecycleState | undefined,
    query: string,
    helpers: MemoryPageRenderHelpers,
): boolean {
    const normalizedQuery = String(query ?? '').trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }
    const ownerLabel = owned.ownerActorKey ? (actorLabelMap.get(owned.ownerActorKey) || owned.ownerActorKey) : '世界 未归属';
    const haystack = [
        owned.recordKey,
        owned.memoryType,
        owned.memorySubtype,
        owned.sourceScope,
        owned.recordKind,
        ownerLabel,
        helpers.buildMemoryRecordHeadline(owned.recordKey, lifecycle, owned),
    ]
        .map((item: unknown): string => String(item ?? '').trim().toLowerCase())
        .join('\n');
    return haystack.includes(normalizedQuery);
}

/**
 * 功能：渲染角色记忆页主体并绑定页面交互。
 * @param options 页面渲染所需的上下文与工具集合。
 * @returns 无返回值。
 */
export async function renderMemoryPage(options: MemoryPageRenderOptions): Promise<void> {
    const {
        contentArea,
        ensureRecordMemory,
        rerender,
        showSuccess,
        showError,
        memorySubtypeOptions,
        experience,
        ownedStates,
        lifecycleList,
        recallLog,
        personaProfiles,
        activeActorKey,
        helpers,
    } = options;

    const lifecycleMap = new Map<string, MemoryLifecycleState>(
        lifecycleList.map((item: MemoryLifecycleState): [string, MemoryLifecycleState] => [item.recordKey, item]),
    );
    const recallStats = recallLog.reduce<Map<string, { count: number; lastAt: number }>>((map, entry) => {
        const current = map.get(entry.recordKey) ?? { count: 0, lastAt: 0 };
        current.count += 1;
        current.lastAt = Math.max(current.lastAt, Number(entry.loggedAt ?? 0));
        map.set(entry.recordKey, current);
        return map;
    }, new Map<string, { count: number; lastAt: number }>());

    const actorLabelMap = new Map<string, string>();
    experience.canon.characters.forEach((character): void => {
        const actorKey = String(character.actorKey ?? '').trim();
        if (!actorKey) {
            return;
        }
        actorLabelMap.set(actorKey, helpers.resolveActorDisplayLabel(actorKey, String(character.displayName ?? actorKey).trim() || actorKey));
    });

    const seedActorKey = String(experience.semanticSeed?.identitySeed?.roleKey ?? '').trim();
    const seedActorName = String(experience.semanticSeed?.identitySeed?.displayName ?? '').trim();
    if (seedActorKey) {
        actorLabelMap.set(seedActorKey, helpers.resolveActorDisplayLabel(seedActorKey, seedActorName || actorLabelMap.get(seedActorKey) || seedActorKey));
    }

    ownedStates.forEach((item: OwnedMemoryState): void => {
        const ownerActorKey = String(item.ownerActorKey ?? '').trim();
        if (ownerActorKey && !actorLabelMap.has(ownerActorKey)) {
            actorLabelMap.set(ownerActorKey, helpers.formatActorKeyLabel(ownerActorKey));
        }
    });

    Object.keys(personaProfiles ?? {}).forEach((actorKey: string): void => {
        if (actorKey && !actorLabelMap.has(actorKey)) {
            actorLabelMap.set(actorKey, helpers.formatActorKeyLabel(actorKey));
        }
    });

    const actorFilters: MemoryPageActorFilter[] = [
        { key: '__all__', label: '全部记忆' },
        { key: '__world__', label: '世界 / 未归属' },
        ...Array.from(actorLabelMap.entries()).map(([key, label]: [string, string]) => ({ key, label })),
    ];

    let currentMemoryActorKey = options.currentMemoryActorKey;
    let currentMemorySearchQuery = String(options.currentMemorySearchQuery ?? '');
    if (!actorFilters.some((item: MemoryPageActorFilter): boolean => item.key === currentMemoryActorKey)) {
        currentMemoryActorKey = '__all__';
        options.setCurrentMemoryActorKey(currentMemoryActorKey);
    }

    const actorMemoryCountMap = ownedStates.reduce<Map<string, number>>((map, item: OwnedMemoryState): Map<string, number> => {
        const ownerActorKey = String(item.ownerActorKey ?? '').trim();
        if (!ownerActorKey) {
            return map;
        }
        map.set(ownerActorKey, (map.get(ownerActorKey) ?? 0) + 1);
        return map;
    }, new Map<string, number>());

    const worldMemoryCount = ownedStates.filter((item: OwnedMemoryState): boolean => !item.ownerActorKey || item.sourceScope === 'world' || item.sourceScope === 'system').length;
    const actorScopedOwned = ownedStates.filter((item: OwnedMemoryState): boolean => {
        if (currentMemoryActorKey === '__all__') {
            return true;
        }
        if (currentMemoryActorKey === '__world__') {
            return !item.ownerActorKey || item.sourceScope === 'world' || item.sourceScope === 'system';
        }
        return item.ownerActorKey === currentMemoryActorKey;
    });
    const filteredOwned = actorScopedOwned.filter((item: OwnedMemoryState): boolean => {
        return matchesMemorySearch(
            item,
            actorLabelMap,
            lifecycleMap.get(item.recordKey),
            currentMemorySearchQuery,
            helpers,
        );
    });
    const filteredLifecycles = filteredOwned
        .map((item: OwnedMemoryState): MemoryLifecycleState | null => lifecycleMap.get(item.recordKey) ?? null)
        .filter((item: MemoryLifecycleState | null): item is MemoryLifecycleState => Boolean(item));

    const eventTitleMap = new Map<string, string>();
    ownedStates.forEach((item: OwnedMemoryState): void => {
        if (item.memorySubtype !== 'major_plot_event') {
            return;
        }
        eventTitleMap.set(item.recordKey, helpers.buildMemoryRecordHeadline(item.recordKey, lifecycleMap.get(item.recordKey), item));
    });

    const stageCounts = {
        clear: filteredLifecycles.filter((item: MemoryLifecycleState): boolean => item.stage === 'clear').length,
        blur: filteredLifecycles.filter((item: MemoryLifecycleState): boolean => item.stage === 'blur').length,
        distorted: filteredLifecycles.filter((item: MemoryLifecycleState): boolean => item.stage === 'distorted').length,
        forgotten: filteredOwned.filter((item: OwnedMemoryState): boolean => item.forgotten === true).length,
    };
    const majorEventCount = filteredOwned.filter((item: OwnedMemoryState): boolean => item.memorySubtype === 'major_plot_event').length;
    const reinforcedCount = filteredOwned.filter((item: OwnedMemoryState): boolean => (item.reinforcedByEventIds?.length ?? 0) > 0).length;
    const invalidatedCount = filteredOwned.filter((item: OwnedMemoryState): boolean => (item.invalidatedByEventIds?.length ?? 0) > 0).length;
    const recentAffectedCount = filteredOwned.filter((item: OwnedMemoryState): boolean => (item.reinforcedByEventIds?.length ?? 0) > 0 || (item.invalidatedByEventIds?.length ?? 0) > 0).length;
    const topSubtypeRates = Array.from(filteredOwned.reduce<Map<string, { total: number; forgotten: number }>>((map, item: OwnedMemoryState) => {
        const key = item.memorySubtype || 'other';
        const current = map.get(key) ?? { total: 0, forgotten: 0 };
        current.total += 1;
        if (item.forgotten) {
            current.forgotten += 1;
        }
        map.set(key, current);
        return map;
    }, new Map<string, { total: number; forgotten: number }>()).entries())
        .sort((left, right): number => right[1].forgotten - left[1].forgotten || right[1].total - left[1].total)
        .slice(0, 6);

    const sortedPersonaProfiles = Object.entries(personaProfiles ?? {})
        .sort((left: [string, PersonaMemoryProfile], right: [string, PersonaMemoryProfile]): number => {
            const leftLabel = actorLabelMap.get(left[0]) || left[0];
            const rightLabel = actorLabelMap.get(right[0]) || right[0];
            return leftLabel.localeCompare(rightLabel, 'zh-CN');
        });
    const actorScopedPersonaEntries = currentMemoryActorKey.startsWith('__')
        ? sortedPersonaProfiles
        : sortedPersonaProfiles.filter(([actorKey]: [string, PersonaMemoryProfile]): boolean => actorKey === currentMemoryActorKey);
    const selectedPersonaEntries = actorScopedPersonaEntries.filter(([actorKey]: [string, PersonaMemoryProfile]): boolean => {
        const query = String(currentMemorySearchQuery ?? '').trim().toLowerCase();
        if (!query) {
            return true;
        }
        const actorLabel = String(actorLabelMap.get(actorKey) || actorKey).toLowerCase();
        return actorLabel.includes(query) || actorKey.toLowerCase().includes(query);
    });

    const personaPanelHtml = selectedPersonaEntries.length > 0
        ? `<div class="stx-re-memory-persona-panel">${selectedPersonaEntries.map(([actorKey, profile]: [string, PersonaMemoryProfile]): string => {
            const actorLabel = actorLabelMap.get(actorKey) || actorKey;
            const extraActionsHtml = [
                `<button class="stx-re-btn ${actorKey === activeActorKey ? 'save' : ''}" data-memory-persona-set-active="${helpers.escapeHtml(actorKey)}"${helpers.buildTipAttr(actorKey === activeActorKey ? '当前已经是主视角角色。' : '将这个角色设为当前主视角。')}>${actorKey === activeActorKey ? '当前主视角' : '设为主视角'}</button>`,
                `<button class="stx-re-btn" data-memory-actor-focus="${helpers.escapeHtml(actorKey)}"${helpers.buildTipAttr('只显示这个角色的记忆与画像。')}>只看该角色</button>`,
            ].join('');
            return helpers.renderPersonaProfileCardMarkup(actorKey, actorLabel, profile, {
                active: actorKey === activeActorKey,
                extraActionsHtml,
            });
        }).join('')}</div>`
        : '<div class="stx-re-empty">当前筛选下没有角色画像。</div>';

    const activeActorLabel = activeActorKey ? (actorLabelMap.get(activeActorKey) || activeActorKey) : '自动 / 未指定';
    const currentFilterLabel = actorFilters.find((item: MemoryPageActorFilter): boolean => item.key === currentMemoryActorKey)?.label || '全部记忆';
    const searchSummaryLabel = currentMemorySearchQuery.trim()
        ? `检索：${currentMemorySearchQuery.trim()}`
        : '检索：未启用';

    const searchInputMarkup = buildSharedInputField({
        id: 'stx-re-memory-search-input',
        type: 'search',
        value: currentMemorySearchQuery,
        className: 'stx-re-memory-search-input',
        attributes: {
            placeholder: '搜索条目 / 角色 / 细分 / recordKey',
            'data-tip': '按角色名、记忆标题、细分类型或内部键快速过滤记忆卡。',
        },
    });
    const actorSelectMarkup = buildSharedSelectField({
        id: 'stx-re-memory-actor-select',
        containerClassName: 'stx-shared-select-fluid',
        value: currentMemoryActorKey,
        triggerClassName: 'stx-re-memory-actor-select-trigger stx-shared-select-trigger-input stx-shared-select-trigger-36',
        listClassName: 'stx-re-memory-actor-select-list',
        optionClassName: 'stx-re-memory-actor-select-option',
        options: actorFilters.map((item: MemoryPageActorFilter) => {
            const iconClassName = item.key === '__all__'
                ? 'fa-solid fa-layer-group'
                : item.key === '__world__'
                    ? 'fa-solid fa-globe'
                    : item.key === activeActorKey
                        ? 'fa-solid fa-crown'
                        : 'fa-solid fa-user';
            return {
                value: item.key,
                label: item.label,
                media: {
                    type: 'icon' as const,
                    iconClassName,
                },
            };
        }),
    });
    const recomputeButtonMarkup = buildSharedButton({
        label: '重算画像',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
        className: 'stx-re-memory-toolbar-btn',
        attributes: {
            'data-memory-persona-recompute': 'true',
        },
    });
    const clearActiveButtonMarkup = buildSharedButton({
        label: '主视角自动',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-compass',
        className: 'stx-re-memory-toolbar-btn',
        attributes: {
            'data-memory-persona-clear-active': 'true',
        },
    });
    const resetFilterButtonMarkup = buildSharedButton({
        label: '重置筛选',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate-left',
        className: 'stx-re-memory-toolbar-btn',
        attributes: {
            'data-memory-reset-filters': 'true',
        },
    });

    const memoryRowsHtml = filteredOwned.length <= 0
        ? `<div class="stx-re-empty">${currentMemorySearchQuery.trim() ? '当前检索条件下没有命中的角色记忆。' : '当前筛选下还没有角色记忆。'}</div>`
        : `<div class="stx-re-memory-entry-list">${filteredOwned.map((owned: OwnedMemoryState): string => helpers.renderMemoryRecordCardMarkup(
            owned,
            lifecycleMap.get(owned.recordKey),
            recallStats.get(owned.recordKey),
            actorLabelMap,
            activeActorKey,
            eventTitleMap,
        )).join('')}</div>`;

    const actorButtonsHtml = actorFilters.map((item: MemoryPageActorFilter): string => {
        const count = item.key === '__all__'
            ? ownedStates.length
            : item.key === '__world__'
                ? worldMemoryCount
                : (actorMemoryCountMap.get(item.key) ?? 0);
        const iconClassName = item.key === '__all__'
            ? 'fa-layer-group'
            : item.key === '__world__'
                ? 'fa-globe'
                : (item.key === activeActorKey ? 'fa-crown' : 'fa-user');
        const subLabel = item.key === '__all__'
            ? '浏览全部角色与世界记忆'
            : item.key === '__world__'
                ? '查看世界与未归属条目'
                : (item.key === activeActorKey ? '当前主视角角色' : '切换到该角色记忆');
        return `
            <button class="stx-re-memory-actor-btn${item.key === currentMemoryActorKey ? ' is-active' : ''}${item.key === activeActorKey ? ' is-focus' : ''}" data-memory-actor="${helpers.escapeHtml(item.key)}"${helpers.buildTipAttr(`筛选为 ${item.label} 的角色记忆。`)}>
                <span class="stx-re-memory-actor-icon"><i class="fa-solid ${iconClassName}" aria-hidden="true"></i></span>
                <span class="stx-re-memory-actor-copy">
                    <span class="stx-re-memory-actor-name">${helpers.escapeHtml(item.label)}</span>
                    <span class="stx-re-memory-actor-sub">${helpers.escapeHtml(subLabel)}</span>
                </span>
                <span class="stx-re-memory-actor-count">${helpers.escapeHtml(String(count))}</span>
            </button>
        `;
    }).join('');

    const subtypeRateHtml = topSubtypeRates.length > 0
        ? `<div class="stx-re-memory-threat-list">${topSubtypeRates.map(([key, stats]: [string, { total: number; forgotten: number }]): string => `
            <div class="stx-re-memory-threat-row">
                <span>${helpers.escapeHtml(helpers.formatMemorySubtypeLabel(key))}</span>
                <span>${helpers.escapeHtml(String(stats.forgotten))}/${helpers.escapeHtml(String(stats.total))}</span>
            </div>
        `).join('')}</div>`
        : '<div class="stx-re-empty">暂无可统计项目。</div>';

    contentArea.innerHTML = `
        <div class="stx-re-memory-shell">
            <section class="stx-re-panel-card stx-re-memory-console">
                <div class="stx-re-memory-console-grid">
                    <div class="stx-re-memory-console-main">
                        <div class="stx-re-memory-console-kicker">记忆卡检索台</div>
                        <div class="stx-re-memory-console-title">以 RPG 指挥台方式巡检角色记忆、主视角与召回风险</div>
                        <div class="stx-re-memory-console-subtitle">用更紧凑的检索条快速锁定观察对象，再沿着卡片查看遗忘、事件联动和角色画像。</div>
                        <div class="stx-re-memory-console-ledger">
                            <span class="stx-re-memory-chip is-hero-chip">当前对象 ${helpers.escapeHtml(currentFilterLabel)}</span>
                            <span class="stx-re-memory-chip is-hero-chip">主视角 ${helpers.escapeHtml(activeActorLabel)}</span>
                            <span class="stx-re-memory-chip is-hero-chip">${helpers.escapeHtml(searchSummaryLabel)}</span>
                            <span class="stx-re-memory-chip is-hero-chip">命中 ${helpers.escapeHtml(String(filteredOwned.length))} / ${helpers.escapeHtml(String(actorScopedOwned.length))}</span>
                        </div>
                    </div>
                    <div class="stx-re-memory-console-controls">
                        <label class="stx-re-memory-console-field">
                            <span class="stx-re-memory-console-field-label">检索词</span>
                            ${searchInputMarkup}
                        </label>
                        <label class="stx-re-memory-console-field">
                            <span class="stx-re-memory-console-field-label">观察对象</span>
                            ${actorSelectMarkup}
                        </label>
                        <div class="stx-re-memory-console-actions">
                            ${resetFilterButtonMarkup}
                            ${clearActiveButtonMarkup}
                            ${recomputeButtonMarkup}
                        </div>
                    </div>
                </div>
                <div class="stx-re-memory-console-strip">
                    <div class="stx-re-memory-console-cell">
                        <span class="stx-re-memory-console-cell-label">记忆命中</span>
                        <strong>${helpers.escapeHtml(String(filteredOwned.length))}</strong>
                        <small>总量 ${helpers.escapeHtml(String(actorScopedOwned.length))}</small>
                    </div>
                    <div class="stx-re-memory-console-cell">
                        <span class="stx-re-memory-console-cell-label">画像命中</span>
                        <strong>${helpers.escapeHtml(String(selectedPersonaEntries.length))}</strong>
                        <small>候选 ${helpers.escapeHtml(String(actorScopedPersonaEntries.length))}</small>
                    </div>
                    <div class="stx-re-memory-console-cell">
                        <span class="stx-re-memory-console-cell-label">重大事件</span>
                        <strong>${helpers.escapeHtml(String(majorEventCount))}</strong>
                        <small>影响 ${helpers.escapeHtml(String(recentAffectedCount))}</small>
                    </div>
                    <div class="stx-re-memory-console-cell">
                        <span class="stx-re-memory-console-cell-label">遗忘警报</span>
                        <strong>${helpers.escapeHtml(String(stageCounts.forgotten + stageCounts.distorted))}</strong>
                        <small>清晰 ${helpers.escapeHtml(String(stageCounts.clear))}</small>
                    </div>
                </div>
            </section>

            <div class="stx-re-memory-dashboard-grid">
                ${helpers.renderMemoryDashboardCardMarkup({
                    icon: 'fa-solid fa-crosshairs',
                    eyebrow: '当前筛选',
                    value: currentFilterLabel,
                    detail: `共 ${filteredOwned.length} 条角色记忆`,
                    meta: `当前主视角：${activeActorLabel}`,
                    tone: 'gold',
                })}
                ${helpers.renderMemoryDashboardCardMarkup({
                    icon: 'fa-solid fa-hourglass-half',
                    eyebrow: '遗忘分布',
                    value: `清晰 ${stageCounts.clear} / 模糊 ${stageCounts.blur}`,
                    detail: `偏差 ${stageCounts.distorted} / 已遗忘 ${stageCounts.forgotten}`,
                    meta: '清晰度越低，维护优先级越高',
                    tone: 'crimson',
                })}
                ${helpers.renderMemoryDashboardCardMarkup({
                    icon: 'fa-solid fa-users',
                    eyebrow: '角色名册',
                    value: `可切换 ${Math.max(0, actorFilters.length - 2)} 个角色`,
                    detail: `当前主视角：${activeActorLabel}`,
                    meta: '左侧名册可快速切换观察对象',
                    tone: 'azure',
                })}
                ${helpers.renderMemoryDashboardCardMarkup({
                    icon: 'fa-solid fa-star',
                    eyebrow: '事件联动',
                    value: `重大事件 ${majorEventCount} 条`,
                    detail: `已影响 ${recentAffectedCount} 条 / 强化 ${reinforcedCount} 条`,
                    meta: `覆盖或冲淡 ${invalidatedCount} 条`,
                    tone: 'slate',
                })}
            </div>

            <section class="stx-re-panel-card stx-re-memory-section">
                <div class="stx-re-memory-section-head">
                    <div>
                        <div class="stx-re-memory-section-kicker">召回战况</div>
                        <div class="stx-re-memory-section-title">最近一轮检索与长期记忆维护</div>
                    </div>
                </div>
                ${helpers.buildRecallSummaryCardsMarkup(experience)}
            </section>

            <section class="stx-re-panel-card stx-re-memory-section">
                <div class="stx-re-memory-section-head">
                    <div>
                        <div class="stx-re-memory-section-kicker">边界压制</div>
                        <div class="stx-re-memory-section-title">最近被主视角边界压制的候选记忆</div>
                    </div>
                </div>
                ${helpers.buildSuppressedRecallListMarkup(experience)}
            </section>

            <div class="stx-re-memory-layout">
                <aside class="stx-re-memory-sidebar">
                    <section class="stx-re-panel-card stx-re-memory-side-card">
                        <div class="stx-re-memory-section-kicker">角色名册</div>
                        <div class="stx-re-memory-side-title">按角色快速切换视角</div>
                        <div class="stx-re-memory-actor-list">${actorButtonsHtml}</div>
                    </section>

                        <section class="stx-re-panel-card stx-re-memory-side-card">
                            <div class="stx-re-memory-section-kicker">画像控制</div>
                            <div class="stx-re-memory-side-title">主视角和画像调整</div>
                            <div class="stx-re-memory-side-toolbar">
                                ${clearActiveButtonMarkup}
                                ${recomputeButtonMarkup}
                            </div>
                        </section>

                    <section class="stx-re-panel-card stx-re-memory-side-card">
                        <div class="stx-re-memory-section-kicker">高风险细分</div>
                        <div class="stx-re-memory-side-title">遗忘率较高的记忆类型</div>
                        ${subtypeRateHtml}
                    </section>
                </aside>

                <div class="stx-re-memory-main">
                    <section class="stx-re-panel-card stx-re-memory-section">
                        <div class="stx-re-memory-section-head">
                            <div>
                                <div class="stx-re-memory-section-kicker">角色画像</div>
                                <div class="stx-re-memory-section-title">像角色面板一样看每个角色的记忆倾向</div>
                            </div>
                        </div>
                        ${personaPanelHtml}
                    </section>

                    <section class="stx-re-panel-card stx-re-memory-section">
                        <div class="stx-re-memory-section-head">
                            <div>
                                <div class="stx-re-memory-section-kicker">角色记忆列表</div>
                                <div class="stx-re-memory-section-title">按条维护重要度、归属与遗忘状态</div>
                            </div>
                        </div>
                        ${memoryRowsHtml}
                    </section>
                </div>
            </div>
        </div>
    `;

    hydrateSharedSelects(contentArea);

    const searchInput = contentArea.querySelector('#stx-re-memory-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (): void => {
        const nextQuery = String(searchInput.value ?? '');
        const nextSelectionStart = searchInput.selectionStart ?? nextQuery.length;
        const nextSelectionEnd = searchInput.selectionEnd ?? nextQuery.length;
        options.setCurrentMemorySearchQuery(nextQuery);
        void rerender().then((): void => {
            const nextInput = contentArea.querySelector('#stx-re-memory-search-input') as HTMLInputElement | null;
            if (!nextInput) {
                return;
            }
            nextInput.focus();
            const start = Math.min(nextSelectionStart, nextInput.value.length);
            const end = Math.min(nextSelectionEnd, nextInput.value.length);
            nextInput.setSelectionRange(start, end);
        });
    });

    const actorSelect = contentArea.querySelector('#stx-re-memory-actor-select') as HTMLSelectElement | null;
    actorSelect?.addEventListener('change', (): void => {
        options.setCurrentMemoryActorKey(String(actorSelect.value ?? '__all__'));
        void rerender();
    });

    contentArea.querySelectorAll('[data-memory-actor]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            options.setCurrentMemoryActorKey(String((button as HTMLElement).dataset.memoryActor ?? '__all__'));
            void rerender();
        });
    });

    contentArea.querySelectorAll('[data-memory-actor-focus]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            options.setCurrentMemoryActorKey(String((button as HTMLElement).dataset.memoryActorFocus ?? '__all__'));
            void rerender();
        });
    });

    contentArea.querySelector('[data-memory-reset-filters]')?.addEventListener('click', (): void => {
        options.setCurrentMemoryActorKey('__all__');
        options.setCurrentMemorySearchQuery('');
        void rerender();
    });

    contentArea.querySelectorAll('[data-memory-persona-recompute]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.chatState.recomputePersonaMemoryProfiles();
                await rerender();
                showSuccess('角色画像已重算');
            }).catch((error: unknown): void => {
                showError(`重算角色画像失败: ${String(error)}`);
            });
        });
    });

    contentArea.querySelectorAll('[data-memory-persona-clear-active]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.chatState.setActiveActorKey(null);
                await rerender();
                showSuccess('主视角已切回自动模式');
            }).catch((error: unknown): void => {
                showError(`切换主视角失败: ${String(error)}`);
            });
        });
    });

    contentArea.querySelectorAll('[data-memory-persona-set-active]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            const actorKey = String((button as HTMLElement).dataset.memoryPersonaSetActive ?? '').trim();
            if (!actorKey) {
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.chatState.setActiveActorKey(actorKey);
                await rerender();
                showSuccess('主视角已更新');
            }).catch((error: unknown): void => {
                showError(`切换主视角失败: ${String(error)}`);
            });
        });
    });

    contentArea.querySelectorAll('[data-memory-action]').forEach((button: Element): void => {
        button.addEventListener('click', (): void => {
            const element = button as HTMLElement;
            const action = String(element.dataset.memoryAction ?? '').trim();
            const recordKey = String(element.dataset.recordKey ?? '').trim();
            const targetOwned = filteredOwned.find((item: OwnedMemoryState): boolean => item.recordKey === recordKey);
            if (!action || !recordKey || !targetOwned) {
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                if (action === 'toggle-forgotten') {
                    await memoryInstance.chatState.updateOwnedMemoryState(recordKey, {
                        forgotten: !targetOwned.forgotten,
                        forgottenReasonCodes: [targetOwned.forgotten ? 'manual_restore' : 'manual_mark_forgotten'],
                    });
                    showSuccess(targetOwned.forgotten ? '记忆已恢复' : '已标记为遗忘');
                } else if (action === 'change-owner') {
                    const ownerGuide = actorFilters
                        .filter((item: MemoryPageActorFilter): boolean => !item.key.startsWith('__'))
                        .map((item: MemoryPageActorFilter): string => `${item.key} = ${item.label}`)
                        .join('\n');
                    const input = prompt(`请输入新的角色归属键，留空表示归到世界或未归属：\n\n${ownerGuide}`, targetOwned.ownerActorKey ?? '');
                    if (input === null) {
                        return;
                    }
                    const nextOwner = String(input ?? '').trim() || null;
                    await memoryInstance.chatState.updateOwnedMemoryState(recordKey, {
                        ownerActorKey: nextOwner,
                    });
                    showSuccess('记忆归属已更新');
                } else if (action === 'change-subtype') {
                    const subtypeGuide = memorySubtypeOptions.map((item: string): string => `${item} = ${helpers.formatMemorySubtypeLabel(item)}`).join('\n');
                    const input = prompt(`请输入新的记忆细分类型：\n\n${subtypeGuide}`, targetOwned.memorySubtype ?? 'other');
                    if (input === null) {
                        return;
                    }
                    const nextSubtype = String(input ?? '').trim();
                    if (!memorySubtypeOptions.includes(nextSubtype)) {
                        alert('输入的细分类型不在允许列表中。');
                        return;
                    }
                    await memoryInstance.chatState.updateOwnedMemoryState(recordKey, {
                        memorySubtype: nextSubtype as OwnedMemoryState['memorySubtype'],
                    });
                    showSuccess('记忆细分已更新');
                } else if (action === 'change-importance') {
                    const input = prompt('请输入新的重要度（支持 0-1 或 0-100）：', String(Math.round((targetOwned.importance ?? 0) * 100)));
                    if (input === null) {
                        return;
                    }
                    const nextImportance = helpers.parseImportanceInput(input, targetOwned.importance ?? 0);
                    if (nextImportance == null) {
                        alert('请输入有效数字。');
                        return;
                    }
                    await memoryInstance.chatState.updateOwnedMemoryState(recordKey, {
                        importance: nextImportance,
                    });
                    showSuccess('记忆重要度已更新');
                } else if (action === 'recompute') {
                    await memoryInstance.chatState.recomputeOwnedMemoryState(recordKey);
                    showSuccess('遗忘概率已重新计算');
                }
                await rerender();
            }).catch((error: unknown): void => {
                showError(`角色记忆操作失败: ${String(error)}`);
            });
        });
    });
}
