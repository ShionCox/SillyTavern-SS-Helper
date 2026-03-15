import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { request, subscribe, broadcast, logger, toast } from '../index';
import { getHealthSnapshot, onHealthChange, refreshHealthSnapshot, setAiModeEnabled } from '../llm/ai-health-center';
import { runAiSelfTests, runSingleSelfTest } from '../llm/ai-self-test';
import type { AiSelfTestResult } from '../llm/ai-self-test';
import type { MemoryAiHealthSnapshot, MemoryAiTaskId } from '../llm/ai-health-types';
import type { RoutePreviewSnapshot } from '../../../SDK/stx';
import { openRecordEditor } from './recordEditor';
import { buildSharedSelectField, hydrateSharedSelects, refreshSharedSelectOptions } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { applyTailwindScopeToNode } from '../../../SDK/tailwind';
import { mountThemeHost, unmountThemeHost, initThemeKernel, subscribeTheme } from '../../../SDK/theme';
import { filterRecordText, normalizeRecordFilterSettings } from '../core/record-filter';
import { ensureChatStrategyPanel, initializeChatStrategyPanel } from './chatStrategyPanel';


let MEMORYOS_THEME_BINDING_READY = false;


// UI 组件的唯一命名空间
const NAMESPACE = 'stx-memoryos';

// 解析生成更新日志 HTML
const generateChangelogHtml = (): string => {
    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';

    return changelogData.map(log => `
      <div class="stx-ui-changelog-entry">
        <div class="stx-ui-changelog-head">
            <span class="stx-ui-changelog-version">${log.version}</span>
            ${log.date ? `<span class="stx-ui-changelog-date">${log.date}</span>` : ''}
        </div>
        <ul class="stx-ui-changelog-list">
          ${log.changes.map((c: string) => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
};

const IDS: MemoryOSSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'Memory OS',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabMainId: `${NAMESPACE}-tab-main`,
    tabAiId: `${NAMESPACE}-tab-ai`,
    tabDbId: `${NAMESPACE}-tab-db`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelAiId: `${NAMESPACE}-panel-ai`,
    panelDbId: `${NAMESPACE}-panel-db`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    aiModeEnabledId: `${NAMESPACE}-ai-mode`,
    aiModeStatusLightId: `${NAMESPACE}-ai-mode-status-light`,
    testPingBtnId: `${NAMESPACE}-test-ping-btn`,
    testHelloBtnId: `${NAMESPACE}-test-hello-btn`,
    autoCompactionId: `${NAMESPACE}-auto-compaction`,
    compactionThresholdId: `${NAMESPACE}-compaction-threshold`,
    dbCompactionDividerId: `${NAMESPACE}-db-divider-compaction`,
    contextMaxTokensId: `${NAMESPACE}-context-max-tokens`,
    recordFilterEnabledId: `${NAMESPACE}-record-filter-enabled`,
    recordFilterSectionId: `${NAMESPACE}-record-filter-section`,
    recordFilterDetailWrapId: `${NAMESPACE}-record-filter-detail-wrap`,
    recordFilterLevelId: `${NAMESPACE}-record-filter-level`,
    recordFilterTypeHtmlId: `${NAMESPACE}-record-filter-type-html`,
    recordFilterTypeXmlId: `${NAMESPACE}-record-filter-type-xml`,
    recordFilterTypeJsonId: `${NAMESPACE}-record-filter-type-json`,
    recordFilterTypeCodeblockId: `${NAMESPACE}-record-filter-type-codeblock`,
    recordFilterTypeMarkdownId: `${NAMESPACE}-record-filter-type-markdown`,
    recordFilterCustomCodeblockEnabledId: `${NAMESPACE}-record-filter-custom-codeblock-enabled`,
    recordFilterCustomCodeblockTagsId: `${NAMESPACE}-record-filter-custom-codeblock-tags`,
    recordFilterJsonModeId: `${NAMESPACE}-record-filter-json-mode`,
    recordFilterJsonKeysId: `${NAMESPACE}-record-filter-json-keys`,
    recordFilterPureCodePolicyId: `${NAMESPACE}-record-filter-pure-policy`,
    recordFilterPlaceholderId: `${NAMESPACE}-record-filter-placeholder`,
    recordFilterCustomRegexEnabledId: `${NAMESPACE}-record-filter-custom-enabled`,
    recordFilterCustomRegexRulesId: `${NAMESPACE}-record-filter-custom-rules`,
    recordFilterMaxTextLengthId: `${NAMESPACE}-record-filter-max-length`,
    recordFilterMinEffectiveCharsId: `${NAMESPACE}-record-filter-min-effective`,
    recordFilterPreviewInputId: `${NAMESPACE}-record-filter-preview-input`,
    recordFilterPreviewBtnId: `${NAMESPACE}-record-filter-preview-btn`,
    recordFilterPreviewOutputId: `${NAMESPACE}-record-filter-preview-output`,

    dbCompactBtnId: `${NAMESPACE}-db-compact-btn`,
    dbExportBtnId: `${NAMESPACE}-db-export-btn`,
    dbImportBtnId: `${NAMESPACE}-db-import-btn`,
    dbClearBtnId: `${NAMESPACE}-db-clear-btn`,
    // 世界模板
    tabTemplateId: `${NAMESPACE}-tab-template`,
    panelTemplateId: `${NAMESPACE}-panel-template`,
    templateListId: `${NAMESPACE}-template-list`,
    templateRefreshBtnId: `${NAMESPACE}-template-refresh`,
    templateForceRebuildBtnId: `${NAMESPACE}-template-force-rebuild`,
    templateActiveSelectId: `${NAMESPACE}-template-active-select`,
    templateSetActiveBtnId: `${NAMESPACE}-template-active-apply`,
    templateLockId: `${NAMESPACE}-template-lock`,
    // 审计面板
    tabAuditId: `${NAMESPACE}-tab-audit`,
    panelAuditId: `${NAMESPACE}-panel-audit`,
    auditListId: `${NAMESPACE}-audit-list`,
    auditCreateSnapshotBtnId: `${NAMESPACE}-audit-snapshot`,
    auditRefreshBtnId: `${NAMESPACE}-audit-refresh`,
    // 世界书写回
    wiPreviewId: `${NAMESPACE}-wi-preview`,
    wiPreviewBtnId: `${NAMESPACE}-wi-preview-btn`,
    wiWritebackBtnId: `${NAMESPACE}-wi-writeback`,
    wiWriteSummaryBtnId: `${NAMESPACE}-wi-write-summary`,
    // 逻辑表可编辑
    logicTableEntitySelectId: `${NAMESPACE}-logic-table-entity`,
    logicTableRefreshBtnId: `${NAMESPACE}-logic-table-refresh`,
    logicTableContainerId: `${NAMESPACE}-logic-table-container`,
    recordEditorBtnId: `${NAMESPACE}-record-editor-btn`,
    // AI 诊断面板
    aiDiagOverviewId: `${NAMESPACE}-ai-diag-overview`,
    aiDiagCapabilitiesId: `${NAMESPACE}-ai-diag-capabilities`,
    aiDiagRecentTasksId: `${NAMESPACE}-ai-diag-recent-tasks`,
    aiDiagRefreshBtnId: `${NAMESPACE}-ai-diag-refresh`,
    aiRoutePreviewId: `${NAMESPACE}-ai-route-preview`,
    aiSelfTestSelectId: `${NAMESPACE}-ai-self-test-select`,
    aiSelfTestRunBtnId: `${NAMESPACE}-ai-self-test-run`,
    aiSelfTestAllBtnId: `${NAMESPACE}-ai-self-test-all`,
    aiSelfTestResultsId: `${NAMESPACE}-ai-self-test-results`,
    aiSelfTestDetailId: `${NAMESPACE}-ai-self-test-detail`,
};

/**
 * 功能：为 MemoryOS 设置面板应用 tooltip 目录并执行兜底补齐。
 * 参数：无。
 * 返回：void。
 */
function applySettingsTooltips(): void {
    ensureSharedTooltip();
}

/**
 * 功能：确保 MemoryOS 设置面板会在全局主题切换后重新应用主题。
 * 参数：无。
 * 返回：void。
 */
function ensureThemeBinding(): void {
    if (MEMORYOS_THEME_BINDING_READY) return;
    MEMORYOS_THEME_BINDING_READY = true;

    subscribeTheme((): void => {
        const cardRoot = document.getElementById(IDS.cardId);
        if (cardRoot) {
            unmountThemeHost(cardRoot);
        }
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) {
            mountThemeHost(contentRoot);
        }
        document
            .querySelectorAll<HTMLElement>('.stx-record-editor-overlay, .stx-memory-chat-strategy-overlay')
            .forEach((overlay: HTMLElement) => {
                mountThemeHost(overlay);
            });
    });
}

/**
 * 等待元素出现在 DOM 中
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver((_mutations, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

/**
 * 功能：转义 HTML 文本，避免将测试结果中的原始内容直接注入页面。
 * 参数：
 *   input：待转义的原始文本。
 * 返回：
 *   string：可安全插入 HTML 的文本。
 */
function escapeHtml(input: string): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：将设置面板中的原生选择框替换为共享选择框。
 * 参数：
 *   root：设置面板根节点。
 * 返回：
 *   void：无返回值。
 */
function upgradeSettingsSelects(root: HTMLElement): void {
    const selectIds: string[] = [
        IDS.recordFilterLevelId,
        IDS.recordFilterJsonModeId,
        IDS.recordFilterPureCodePolicyId,
    ];

    selectIds.forEach((selectId: string): void => {
        const nativeSelect = root.querySelector<HTMLSelectElement>(`select#${selectId}`);
        if (!nativeSelect) return;
        if (nativeSelect.closest('[data-ui="shared-select"]')) return;

        const dataTip = nativeSelect.getAttribute('data-tip') || undefined;
        const nextMarkup = buildSharedSelectField({
            id: nativeSelect.id,
            value: nativeSelect.value,
            containerClassName: 'stx-ui-shared-select stx-ui-shared-select-inline',
            selectClassName: 'stx-ui-input',
            triggerClassName: 'stx-ui-input-full',
            triggerAttributes: dataTip ? { 'data-tip': dataTip } : undefined,
            options: Array.from(nativeSelect.options).map((option: HTMLOptionElement) => ({
                value: option.value,
                label: option.textContent?.trim() || '',
                disabled: option.disabled,
            })),
        });

        const fragment = document.createElement('div');
        fragment.innerHTML = nextMarkup.trim();
        const nextRoot = fragment.firstElementChild;
        if (!(nextRoot instanceof HTMLElement)) return;

        const nextNativeSelect = nextRoot.querySelector<HTMLSelectElement>('select');
        if (nextNativeSelect) {
            nextNativeSelect.disabled = nativeSelect.disabled;
        }

        nativeSelect.replaceWith(nextRoot);
    });
}

/**
 * 在设定的拓展面板 (Extensions) 中渲染 MemoryOS 设置卡片
 */
export async function renderSettingsUi() {
    try {
        initThemeKernel();
        // SillyTavern 插件设置面板通常挂载在 #extensions_settings
        const container = await waitForElement('#extensions_settings');

        // 1. 注入 CSS
        const styleId = `${IDS.cardId}-styles`;
        const nextStyleText = buildSettingsCardStylesTemplate(IDS.cardId);
        const existingStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (existingStyleEl) {
            if (existingStyleEl.innerHTML !== nextStyleText) {
                existingStyleEl.innerHTML = nextStyleText;
            }
        } else {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = nextStyleText;
            document.head.appendChild(styleEl);
        }

        // 2. 注入 HTML 卡片
        let cardWrapper = document.getElementById(IDS.cardId);
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);

            // 寻找或创建专用的容器
            let ssContainer = document.getElementById('ss-helper-plugins-container');
            if (!ssContainer) {
                ssContainer = document.createElement('div');
                ssContainer.id = 'ss-helper-plugins-container';
                ssContainer.className = 'ss-helper-plugins-container';
                container.prepend(ssContainer);
            }
            ssContainer.appendChild(cardWrapper);
        }
        const aiPanel = document.getElementById(IDS.panelAiId);
        if (aiPanel instanceof HTMLElement) {
            ensureChatStrategyPanel(aiPanel);
        }
        upgradeSettingsSelects(cardWrapper);
        hydrateSharedSelects(cardWrapper);
        unmountThemeHost(cardWrapper);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) {
            mountThemeHost(contentRoot);
        }
        ensureThemeBinding();
        applyTailwindScopeToNode(cardWrapper);

        // 3. 绑定内部交互逻辑 (展开、切换 Tab)
        bindUiEvents();
        await initializeChatStrategyPanel();
        applySettingsTooltips();
    } catch (error) {
        console.error(`[MemoryOS] UI 渲染失败:`, error);
    }
}

/**
 * 绑定设置卡片的交互事件
 */
function bindUiEvents() {

    // 3.1 抽屉展开/折叠 (移除手动监听，交由 SillyTavern 核心的 .inline-drawer-toggle 自动处理)

    // 3.2 标签页切换
    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabAiId, panelId: IDS.panelAiId },
        { tabId: IDS.tabDbId, panelId: IDS.panelDbId },
        { tabId: IDS.tabTemplateId, panelId: IDS.panelTemplateId },
        { tabId: IDS.tabAuditId, panelId: IDS.panelAuditId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;

        tabEl.addEventListener('click', () => {
            // 隐藏所有面板，移除所有 tab 的 active 态
            tabs.forEach(t => {
                const tEl = document.getElementById(t.tabId);
                const pEl = document.getElementById(t.panelId);
                if (tEl) tEl.classList.remove('is-active');
                if (pEl) pEl.setAttribute('hidden', 'true');
            });

            // 激活当前点选的面板
            const targetPanel = document.getElementById(panelId);
            tabEl.classList.add('is-active');
            if (targetPanel) {
                targetPanel.removeAttribute('hidden');
            }
        });
    });

    // 3.3 搜索过滤 (简单文本匹配)
    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = (e.target as HTMLInputElement).value.toLowerCase().trim();
            const searchableItems = document.querySelectorAll(`[data-stx-ui-search]`);

            searchableItems.forEach(el => {
                const keywords = el.getAttribute('data-stx-ui-search') || '';
                if (!term || keywords.toLowerCase().includes(term)) {
                    el.classList.remove('is-hidden-by-search');
                } else {
                    el.classList.add('is-hidden-by-search');
                }
            });
            syncDbCompactionDividerVisibility();
        });
    }

    // ==== 在此处可继续添加针对具体配置项的 change 监听与保存逻辑 ====

    type STContextSnapshot = {
        extensionSettings?: Record<string, Record<string, any>>;
        saveSettingsDebounced?: () => void;
    } | null;

    /**
     * 功能：获取最新 SillyTavern 上下文，避免闭包持有过期对象。
     * 参数：无。
     * 返回：上下文对象或 null。
     */
    const getStContext = (): STContextSnapshot => {
        return (window as any).SillyTavern?.getContext?.() || null;
    };
    const SETTINGS_NAMESPACE = 'stx_memory_os';

    /**
     * 功能：确保 MemoryOS 设置对象存在并返回引用。
     * 参数：ctx 当前 ST 上下文。
     * 返回：`stx_memory_os` 对应设置对象。
     */
    const ensureMemorySettings = (ctx: STContextSnapshot): Record<string, any> => {
        if (!ctx) return {};
        if (!ctx.extensionSettings) {
            ctx.extensionSettings = {};
        }
        const currentSettings = ctx.extensionSettings[SETTINGS_NAMESPACE];
        if (currentSettings && typeof currentSettings === 'object') {
            return currentSettings as Record<string, any>;
        }

        const created: Record<string, any> = {};
        ctx.extensionSettings[SETTINGS_NAMESPACE] = created;
        return created;
    };
    const readSettingBoolean = (settingKey: string): boolean => {
        const ctx = getStContext();
        const settings = ensureMemorySettings(ctx);
        return settings[settingKey] === true;
    };

    const syncCardDisabledState = (isEnabled: boolean): void => {
        const cardEl = document.getElementById(IDS.cardId);
        if (!cardEl) return;
        if (isEnabled) {
            cardEl.classList.remove('is-card-disabled');
        } else {
            cardEl.classList.add('is-card-disabled');
        }
    };

    syncCardDisabledState(readSettingBoolean('enabled'));

    type RecordFilterUiSettings = ReturnType<typeof normalizeRecordFilterSettings>;

    /**
     * 功能：读取记录过滤设置并补齐默认值。
     * 参数：无。
     * 返回：完整记录过滤设置。
     */
    const readRecordFilterSettings = (): RecordFilterUiSettings => {
        const ctx = getStContext();
        const settings = ensureMemorySettings(ctx);
        return normalizeRecordFilterSettings(settings.recordFilter || {});
    };

    /**
     * 功能：写入记录过滤设置。
     * 参数：
     *   nextPartial：待写入的局部配置。
     * 返回：写入后的完整配置。
     */
    const saveRecordFilterSettings = (nextPartial: Partial<RecordFilterUiSettings>): RecordFilterUiSettings => {
        const ctx = getStContext();
        const merged = normalizeRecordFilterSettings({
            ...(readRecordFilterSettings() || {}),
            ...(nextPartial || {}),
        });
        if (!ctx) {
            return merged;
        }
        const settings = ensureMemorySettings(ctx);
        settings.recordFilter = { ...merged };
        ctx.saveSettingsDebounced?.();
        return merged;
    };

    /**
     * 功能：读取数字设置。
     * 参数：
     *   settingKey：设置键。
     *   defaultValue：默认值。
     * 返回：数字值。
     */
    const readSettingNumber = (settingKey: string, defaultValue: number): number => {
        const ctx = getStContext();
        const settings = ensureMemorySettings(ctx);
        const parsed = Number(settings[settingKey]);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    };

    // 辅助防呆并初始化开关绑定持久化
    const bindToggle = (toggleId: string, settingKey: string, onToggleCallback?: (val: boolean) => void) => {
        const toggleEl = document.getElementById(toggleId) as HTMLInputElement;
        if (!toggleEl) return;

        // 初始化读取状态
        toggleEl.checked = readSettingBoolean(settingKey);

        toggleEl.addEventListener('change', () => {
            const checked = toggleEl.checked;
            const currentContext = getStContext();
            if (currentContext) {
                const currentSettings = ensureMemorySettings(currentContext);
                currentSettings[settingKey] = checked;
                currentContext.saveSettingsDebounced?.();
            }
            if (onToggleCallback) onToggleCallback(checked);
        });
    };

    /**
     * 功能：绑定数字输入设置项。
     * 参数：
     *   inputId：输入框 ID。
     *   settingKey：设置键名。
     *   defaultValue：默认值。
     *   min：最小值。
     *   max：最大值。
     * 返回：无。
     */
    const bindNumberInput = (
        inputId: string,
        settingKey: string,
        defaultValue: number,
        min: number,
        max: number
    ): void => {
        const inputEl = document.getElementById(inputId) as HTMLInputElement | null;
        if (!inputEl) return;
        inputEl.value = String(readSettingNumber(settingKey, defaultValue));
        const persist = (): void => {
            const raw = Number(inputEl.value);
            const safe = Math.min(max, Math.max(min, Number.isFinite(raw) ? raw : defaultValue));
            inputEl.value = String(safe);
            const currentContext = getStContext();
            if (!currentContext) return;
            const currentSettings = ensureMemorySettings(currentContext);
            currentSettings[settingKey] = safe;
            currentContext.saveSettingsDebounced?.();
        };
        inputEl.addEventListener('change', persist);
        inputEl.addEventListener('blur', persist);
    };

    // 绑定总开关
    bindToggle(IDS.enabledId, 'enabled', (val) => {
        syncCardDisabledState(!!val);
        broadcast(
            'plugin:broadcast:state_changed',
            {
                pluginId: 'stx_memory_os',
                isEnabled: !!val,
            },
            'stx_memory_os'
        );
        if (val) {
            const plugin = (window as any).MemoryOSPlugin as {
                refreshCurrentChatBinding?: () => Promise<void>;
            };
            plugin?.refreshCurrentChatBinding?.().catch((error: unknown) => {
                logger.error('启用后立即初始化当前聊天失败', error);
            });
        }
    });
    bindNumberInput(IDS.contextMaxTokensId, 'contextMaxTokens', 1200, 500, 8000);
    bindNumberInput(IDS.compactionThresholdId, 'compactionThreshold', 5000, 500, 20000);

    const recordFilterEnabledEl = document.getElementById(IDS.recordFilterEnabledId) as HTMLInputElement | null;
    const recordFilterLevelEl = document.getElementById(IDS.recordFilterLevelId) as HTMLSelectElement | null;
    const recordFilterTypeHtmlEl = document.getElementById(IDS.recordFilterTypeHtmlId) as HTMLInputElement | null;
    const recordFilterTypeXmlEl = document.getElementById(IDS.recordFilterTypeXmlId) as HTMLInputElement | null;
    const recordFilterTypeJsonEl = document.getElementById(IDS.recordFilterTypeJsonId) as HTMLInputElement | null;
    const recordFilterTypeCodeblockEl = document.getElementById(IDS.recordFilterTypeCodeblockId) as HTMLInputElement | null;
    const recordFilterTypeMarkdownEl = document.getElementById(IDS.recordFilterTypeMarkdownId) as HTMLInputElement | null;
    const recordFilterCustomCodeblockEnabledEl = document.getElementById(IDS.recordFilterCustomCodeblockEnabledId) as HTMLInputElement | null;
    const recordFilterCustomCodeblockTagsEl = document.getElementById(IDS.recordFilterCustomCodeblockTagsId) as HTMLTextAreaElement | null;
    const recordFilterJsonModeEl = document.getElementById(IDS.recordFilterJsonModeId) as HTMLSelectElement | null;
    const recordFilterJsonKeysEl = document.getElementById(IDS.recordFilterJsonKeysId) as HTMLInputElement | null;
    const recordFilterPureCodePolicyEl = document.getElementById(IDS.recordFilterPureCodePolicyId) as HTMLSelectElement | null;
    const recordFilterPlaceholderEl = document.getElementById(IDS.recordFilterPlaceholderId) as HTMLInputElement | null;
    const recordFilterCustomRegexEnabledEl = document.getElementById(IDS.recordFilterCustomRegexEnabledId) as HTMLInputElement | null;
    const recordFilterCustomRegexRulesEl = document.getElementById(IDS.recordFilterCustomRegexRulesId) as HTMLTextAreaElement | null;
    const recordFilterMaxTextLengthEl = document.getElementById(IDS.recordFilterMaxTextLengthId) as HTMLInputElement | null;
    const recordFilterMinEffectiveCharsEl = document.getElementById(IDS.recordFilterMinEffectiveCharsId) as HTMLInputElement | null;
    const recordFilterPreviewInputEl = document.getElementById(IDS.recordFilterPreviewInputId) as HTMLTextAreaElement | null;
    const recordFilterPreviewBtn = document.getElementById(IDS.recordFilterPreviewBtnId) as HTMLButtonElement | null;
    const recordFilterPreviewOutputEl = document.getElementById(IDS.recordFilterPreviewOutputId) as HTMLElement | null;
    const panelAiEl = document.getElementById(IDS.panelAiId) as HTMLElement | null;
    const panelDbEl = document.getElementById(IDS.panelDbId) as HTMLElement | null;

    /**
     * 功能：当“数据压缩与清理”分组下没有可见条目时，自动隐藏该分组标题。
     * 参数：无。
     * 返回：无。
     */
    function syncDbCompactionDividerVisibility(): void {
        if (!panelDbEl) {
            return;
        }
        const dbCompactionDividerEl = document.getElementById(IDS.dbCompactionDividerId) as HTMLElement | null;
        if (!dbCompactionDividerEl) {
            return;
        }

        const isDbItemVisible = (el: HTMLElement): boolean => {
            let cursor: HTMLElement | null = el;
            while (cursor && cursor !== panelDbEl) {
                if (cursor.hidden || cursor.classList.contains('is-hidden-by-search')) {
                    return false;
                }
                cursor = cursor.parentElement as HTMLElement | null;
            }
            return true;
        };

        const hasVisibleItem = Array.from(
            panelDbEl.querySelectorAll('.stx-ui-search-item[data-stx-db-group="compaction"]')
        )
            .some((item) => isDbItemVisible(item as HTMLElement));
        dbCompactionDividerEl.hidden = !hasVisibleItem;
    }

    /**
     * 功能：将“记录过滤”区块从 AI 面板迁移到数据管理面板，避免与 AI 规则混放。
     * 参数：无。
     * 返回：记录过滤详情容器节点；若缺少关键节点则返回 null。
     */
    const mountRecordFilterSectionToDbPanel = (): HTMLElement | null => {
        if (!panelAiEl || !panelDbEl || !recordFilterEnabledEl) {
            return null;
        }

        const enabledItem = recordFilterEnabledEl.closest('.stx-ui-item') as HTMLElement | null;
        if (!enabledItem) {
            return null;
        }
        const divider = enabledItem.previousElementSibling as HTMLElement | null;
        const strategyItem = recordFilterLevelEl?.closest('.stx-ui-item') as HTMLElement | null;
        const typeItem = recordFilterTypeHtmlEl?.closest('.stx-ui-item') as HTMLElement | null;
        const detailItem = recordFilterJsonKeysEl?.closest('.stx-ui-item') as HTMLElement | null;
        const previewItem = recordFilterPreviewInputEl?.closest('.stx-ui-item') as HTMLElement | null;

        let sectionEl = document.getElementById(IDS.recordFilterSectionId) as HTMLElement | null;
        if (!sectionEl) {
            sectionEl = document.createElement('section');
            sectionEl.id = IDS.recordFilterSectionId;
        }

        let detailWrapEl = document.getElementById(IDS.recordFilterDetailWrapId) as HTMLElement | null;
        if (!detailWrapEl) {
            detailWrapEl = document.createElement('div');
            detailWrapEl.id = IDS.recordFilterDetailWrapId;
        }
        detailWrapEl.classList.add('stx-ui-filter-group');

        if (divider && divider.classList.contains('stx-ui-divider')) {
            sectionEl.appendChild(divider);
        }
        sectionEl.appendChild(enabledItem);

        [strategyItem, typeItem, detailItem, previewItem].forEach((node) => {
            if (!node) return;
            detailWrapEl!.appendChild(node);
        });
        sectionEl.appendChild(detailWrapEl);

        const dbCompactionDividerEl = document.getElementById(IDS.dbCompactionDividerId);
        if (dbCompactionDividerEl && dbCompactionDividerEl.parentElement === panelDbEl) {
            panelDbEl.insertBefore(sectionEl, dbCompactionDividerEl);
        } else {
            panelDbEl.prepend(sectionEl);
        }
        return detailWrapEl;
    };
    const recordFilterDetailWrapEl = mountRecordFilterSectionToDbPanel();
    syncDbCompactionDividerVisibility();

    /**
     * 功能：把记录过滤设置写入表单。
     * 参数：
     *   settings：完整过滤设置。
     * 返回：无。
     */
    const applyRecordFilterFormValues = (settings: RecordFilterUiSettings): void => {
        if (recordFilterEnabledEl) recordFilterEnabledEl.checked = settings.enabled;
        if (recordFilterDetailWrapEl) {
            const shouldShow = settings.enabled === true;
            if (!shouldShow) {
                recordFilterDetailWrapEl.hidden = true;
                recordFilterDetailWrapEl.classList.remove('is-reveal-animating');
            } else {
                const wasHidden = recordFilterDetailWrapEl.hidden;
                recordFilterDetailWrapEl.hidden = false;
                if (wasHidden) {
                    recordFilterDetailWrapEl.classList.remove('is-reveal-animating');
                    void recordFilterDetailWrapEl.offsetWidth;
                    recordFilterDetailWrapEl.classList.add('is-reveal-animating');
                }
            }
        }
        if (recordFilterLevelEl) recordFilterLevelEl.value = settings.level;
        if (recordFilterTypeHtmlEl) recordFilterTypeHtmlEl.checked = settings.filterTypes.includes('html');
        if (recordFilterTypeXmlEl) recordFilterTypeXmlEl.checked = settings.filterTypes.includes('xml');
        if (recordFilterTypeJsonEl) recordFilterTypeJsonEl.checked = settings.filterTypes.includes('json');
        if (recordFilterTypeCodeblockEl) recordFilterTypeCodeblockEl.checked = settings.filterTypes.includes('codeblock');
        if (recordFilterTypeMarkdownEl) recordFilterTypeMarkdownEl.checked = settings.filterTypes.includes('markdown');
        if (recordFilterCustomCodeblockEnabledEl) {
            recordFilterCustomCodeblockEnabledEl.checked = settings.customCodeblockEnabled === true;
            recordFilterCustomCodeblockEnabledEl.disabled = settings.filterTypes.includes('codeblock') !== true;
        }
        if (recordFilterCustomCodeblockTagsEl) {
            recordFilterCustomCodeblockTagsEl.value = settings.customCodeblockTags.join(',');
            recordFilterCustomCodeblockTagsEl.disabled = !(
                settings.filterTypes.includes('codeblock') === true &&
                settings.customCodeblockEnabled === true
            );
        }
        if (recordFilterJsonModeEl) recordFilterJsonModeEl.value = settings.jsonExtractMode;
        if (recordFilterJsonKeysEl) recordFilterJsonKeysEl.value = settings.jsonExtractKeys.join(',');
        if (recordFilterPureCodePolicyEl) recordFilterPureCodePolicyEl.value = settings.pureCodePolicy;
        if (recordFilterPlaceholderEl) {
            recordFilterPlaceholderEl.value = settings.placeholderText;
            recordFilterPlaceholderEl.disabled = settings.pureCodePolicy !== 'placeholder';
        }
        if (recordFilterCustomRegexEnabledEl) recordFilterCustomRegexEnabledEl.checked = settings.customRegexEnabled;
        if (recordFilterCustomRegexRulesEl) {
            recordFilterCustomRegexRulesEl.value = settings.customRegexRules;
            recordFilterCustomRegexRulesEl.disabled = settings.customRegexEnabled !== true;
        }
        if (recordFilterMaxTextLengthEl) recordFilterMaxTextLengthEl.value = String(settings.maxTextLength);
        if (recordFilterMinEffectiveCharsEl) recordFilterMinEffectiveCharsEl.value = String(settings.minEffectiveChars);
        if (recordFilterJsonKeysEl) {
            recordFilterJsonKeysEl.disabled = settings.jsonExtractMode === 'off';
        }
        syncDbCompactionDividerVisibility();
    };

    /**
     * 功能：从表单读取记录过滤设置。
     * 参数：无。
     * 返回：完整过滤设置。
     */
    const collectRecordFilterFormValues = (): RecordFilterUiSettings => {
        const current = readRecordFilterSettings();
        const filterTypes: string[] = [];
        if (recordFilterTypeHtmlEl?.checked) filterTypes.push('html');
        if (recordFilterTypeXmlEl?.checked) filterTypes.push('xml');
        if (recordFilterTypeJsonEl?.checked) filterTypes.push('json');
        if (recordFilterTypeCodeblockEl?.checked) filterTypes.push('codeblock');
        if (recordFilterTypeMarkdownEl?.checked) filterTypes.push('markdown');
        return normalizeRecordFilterSettings({
            ...current,
            enabled: recordFilterEnabledEl?.checked ?? current.enabled,
            level: recordFilterLevelEl?.value || current.level,
            filterTypes,
            customCodeblockEnabled: recordFilterCustomCodeblockEnabledEl?.checked ?? current.customCodeblockEnabled,
            customCodeblockTags: (recordFilterCustomCodeblockTagsEl?.value || '')
                .split(/[,\n]/)
                .map((item: string) => item.trim())
                .filter(Boolean),
            jsonExtractMode: recordFilterJsonModeEl?.value || current.jsonExtractMode,
            jsonExtractKeys: (recordFilterJsonKeysEl?.value || '').split(',').map((item: string) => item.trim()).filter(Boolean),
            pureCodePolicy: recordFilterPureCodePolicyEl?.value || current.pureCodePolicy,
            placeholderText: recordFilterPlaceholderEl?.value || current.placeholderText,
            customRegexEnabled: recordFilterCustomRegexEnabledEl?.checked ?? current.customRegexEnabled,
            customRegexRules: recordFilterCustomRegexRulesEl?.value || '',
            maxTextLength: Number(recordFilterMaxTextLengthEl?.value || current.maxTextLength),
            minEffectiveChars: Number(recordFilterMinEffectiveCharsEl?.value || current.minEffectiveChars),
        });
    };

    /**
     * 功能：保存记录过滤表单并刷新控件状态。
     * 参数：无。
     * 返回：无。
     */
    const persistRecordFilterForm = (): void => {
        const next = collectRecordFilterFormValues();
        const saved = saveRecordFilterSettings(next);
        applyRecordFilterFormValues(saved);
    };

    applyRecordFilterFormValues(readRecordFilterSettings());

    [
        recordFilterEnabledEl,
        recordFilterLevelEl,
        recordFilterTypeHtmlEl,
        recordFilterTypeXmlEl,
        recordFilterTypeJsonEl,
        recordFilterTypeCodeblockEl,
        recordFilterTypeMarkdownEl,
        recordFilterCustomCodeblockEnabledEl,
        recordFilterCustomCodeblockTagsEl,
        recordFilterJsonModeEl,
        recordFilterJsonKeysEl,
        recordFilterPureCodePolicyEl,
        recordFilterPlaceholderEl,
        recordFilterCustomRegexEnabledEl,
        recordFilterCustomRegexRulesEl,
        recordFilterMaxTextLengthEl,
        recordFilterMinEffectiveCharsEl,
    ].forEach((element: Element | null) => {
        if (!element) return;
        element.addEventListener('change', persistRecordFilterForm);
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.addEventListener('blur', persistRecordFilterForm);
        }
    });

    if (recordFilterPreviewBtn && recordFilterPreviewInputEl && recordFilterPreviewOutputEl) {
        recordFilterPreviewBtn.addEventListener('click', () => {
            const currentSettings = collectRecordFilterFormValues();
            const result = filterRecordText(recordFilterPreviewInputEl.value, currentSettings);
            const lines: string[] = [
                `状态: ${result.dropped ? '将丢弃' : '可入库'}`,
                `原因: ${result.reasonCode}`,
                `规则: ${result.appliedRules.join(', ') || '(无)'}`,
                '结果:',
                result.filteredText || '(空)',
            ];
            recordFilterPreviewOutputEl.textContent = lines.join('\n');
        });
    }

    // ==========================================
    // ==== [P0-4] 微服务通讯三态连接灯与逻辑接管 ====
    // ==========================================
    const aiToggleEl = document.getElementById(IDS.aiModeEnabledId) as HTMLInputElement;
    const aiLightEl = document.getElementById(IDS.aiModeStatusLightId);

    // 初始化 UI 开关
    if (aiToggleEl) {
        const initContext = getStContext();
        const initSettings = ensureMemorySettings(initContext);
        aiToggleEl.checked = initSettings['aiMode'] === true;
    }

    // 更新界面状态灯（提供明确的诊断级别文案）
    const updateLinkStatus = (alive: boolean, isEnabled: boolean) => {
        if (!aiLightEl || !aiToggleEl) return;
        if (alive && isEnabled) {
            const snapshot = getHealthSnapshot();
            if (snapshot.diagnosisLevel === 'fully_operational') {
                aiLightEl.className = 'fa-solid fa-link';
                aiLightEl.style.color = 'var(--stx-memory-success)';
                aiLightEl.setAttribute('data-tip', snapshot.diagnosisText);
            } else if (snapshot.diagnosisLevel === 'online_partial_capabilities') {
                aiLightEl.className = 'fa-solid fa-link';
                aiLightEl.style.color = 'var(--stx-memory-warning, #ff9800)';
                aiLightEl.setAttribute('data-tip', snapshot.diagnosisText);
            } else {
                aiLightEl.className = 'fa-solid fa-link';
                aiLightEl.style.color = 'var(--stx-memory-success)';
                aiLightEl.setAttribute('data-tip', 'LLMHub 通信正常。');
            }
            aiLightEl.removeAttribute('title');
            aiToggleEl.disabled = false;
        } else {
            const snapshot = getHealthSnapshot();
            aiLightEl.className = 'fa-solid fa-link-slash';
            aiLightEl.style.color = 'var(--stx-memory-danger-contrast)';
            aiLightEl.setAttribute(
                'data-tip',
                snapshot.diagnosisText || (alive
                    ? 'LLMHub 已关闭，AI 模式不可用。'
                    : '未检测到 LLMHub，AI 模式不可用。')
            );
            aiLightEl.removeAttribute('title');
            aiToggleEl.checked = false;
            aiToggleEl.disabled = true; // 强力闭锁
            const currentContext = getStContext();
            if (currentContext) {
                const currentSettings = ensureMemorySettings(currentContext);
                currentSettings['aiMode'] = false; // 联动存表
                currentContext.saveSettingsDebounced?.();
            }
        }
    };

    // 1. 初始化时主动侦测 Ping (跨插件加载可能存在异步时差，必须重试补偿)
    const checkLLMHubStatus = (retries = 5) => {
        request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub', timeoutMs: 2000 })
            .then(res => updateLinkStatus(res.alive, res.isEnabled))
            .catch(e => {
                if (retries > 0) {
                    logger.warn(`[Network] LLMHub 仍未接管通讯总线 (${e.message})，等候重试... 剩余次数: ${retries}`);
                    setTimeout(() => checkLLMHubStatus(retries - 1), 2500);
                } else {
                    logger.error('[Network] 彻底放弃探寻 LLMHub 实例', e);
                    updateLinkStatus(false, false);
                }
            });
    };
    checkLLMHubStatus();

    // 2. 长程订阅广播：如果探测途中对方开关发生变化，实时追随打断操作！
    // P0-5 防漏回收：我们将其绑定在内部单例生命周期（由于暂且没有显式销毁，跟随页面生存）
    subscribe('plugin:broadcast:state_changed', (data: any) => {
        // 如果开关开启，我们假定活着；如果是关闭那也直接设死
        updateLinkStatus(true, !!data?.isEnabled);
    }, { from: 'stx_llmhub' });

    // 3. 用户主观点击操作反馈
    if (aiToggleEl) {
        aiToggleEl.addEventListener('change', (e) => {
            if (aiToggleEl.disabled) {
                e.preventDefault();
                aiToggleEl.checked = false;
                toast.warning('微服务桥接失败：LLMHub 尚未启用或运行异常，无法使用 AI 集成功能。');
                return;
            }

            const currentContext = getStContext();
            if (currentContext) {
                const currentSettings = ensureMemorySettings(currentContext);
                currentSettings['aiMode'] = aiToggleEl.checked;
                setAiModeEnabled(aiToggleEl.checked);
                currentContext.saveSettingsDebounced?.();
            }
        });
    }

    // ==========================================
    // ==== [P2-3] 微服务通讯自检台 (Bus Inspector) ====
    // ==========================================
    const pingBtn = document.getElementById(IDS.testPingBtnId);
    if (pingBtn) {
        pingBtn.addEventListener('click', async () => {
            pingBtn.textContent = '探测中...';
            try {
                const res = await request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub' });
                toast.success('网络 Ping 通成功！耗时及详情已打印至控制台。');
                logger.info('[Bus Inspector Ping]', res);
            } catch (e: any) {
                toast.error('网络探测不通，错误详情看控制台。');
                logger.error('[Bus Inspector Error]', e);
            } finally {
                pingBtn.textContent = '发送连通测试';
            }
        });
    }

    const helloBtn = document.getElementById(IDS.testHelloBtnId);
    if (helloBtn) {
        helloBtn.addEventListener('click', async () => {
            helloBtn.textContent = '呼叫中...';
            try {
                const res = await request('plugin:request:hello', { testPayload: 'From MemoryOS Inspector' }, 'stx_memory_os', { to: 'stx_llmhub' });
                toast.success('双向握手完成 (Hello OK)。详情见控制台。');
                logger.success('[Bus Inspector Hello Reply]', res);
            } catch (e: any) {
                toast.error('请求 LLM 枢纽被拒绝或超时，详见控制台。');
                logger.error('[Bus Inspector Error]', e);
            } finally {
                helloBtn.textContent = '向 LLMHub 打招呼';
            }
        });
    }

    // ==========================================
    // ==== AI 诊断面板 ====
    // ==========================================

    const aiDiagOverviewEl = document.getElementById(IDS.aiDiagOverviewId);
    const aiRoutePreviewEl = document.getElementById(IDS.aiRoutePreviewId);
    const aiDiagCapabilitiesEl = document.getElementById(IDS.aiDiagCapabilitiesId);
    const aiDiagRecentTasksEl = document.getElementById(IDS.aiDiagRecentTasksId);
    const aiDiagRefreshBtn = document.getElementById(IDS.aiDiagRefreshBtnId) as HTMLButtonElement | null;
    const aiSelfTestSelectEl = document.getElementById(IDS.aiSelfTestSelectId) as HTMLSelectElement | null;
    const aiSelfTestRunBtn = document.getElementById(IDS.aiSelfTestRunBtnId) as HTMLButtonElement | null;
    const aiSelfTestAllBtn = document.getElementById(IDS.aiSelfTestAllBtnId) as HTMLButtonElement | null;
    const aiSelfTestResultsEl = document.getElementById(IDS.aiSelfTestResultsId);
    const aiSelfTestDetailEl = document.getElementById(IDS.aiSelfTestDetailId);

    const TASK_ORDER: MemoryAiTaskId[] = [
        'memory.summarize',
        'memory.extract',
        'world.template.build',
        'memory.vector.embed',
        'memory.search.rerank',
    ];
    const TASK_LABELS: Record<MemoryAiTaskId, string> = {
        'memory.summarize': '摘要',
        'memory.extract': '抽取',
        'world.template.build': '模板构建',
        'memory.vector.embed': '向量化',
        'memory.search.rerank': '重排',
    };
    const RESOLVED_BY_LABELS: Record<NonNullable<RoutePreviewSnapshot['resolvedBy']>, string> = {
        route_hint: '路由提示',
        user_task_override: '任务覆盖',
        plugin_task_recommend: '插件推荐',
        user_plugin_default: '插件默认',
        user_global_default: '全局默认',
        builtin_tavern_fallback: '内置酒馆回退',
        fallback: '回退路由',
    };

    let lastAiSelfTestResults: AiSelfTestResult[] = [];
    let lastAiSelfTestDetail: AiSelfTestResult | null = null;
    let aiSingleTestRunning = false;
    let aiBatchTestRunning = false;

    /**
     * 功能：读取当前单项自测下拉框中选中的任务。
     * 参数：无。
     * 返回：
     *   MemoryAiTaskId：当前选中的任务 ID。
     */
    function getSelectedAiSelfTestTaskId(): MemoryAiTaskId {
        const fallbackTaskId: MemoryAiTaskId = 'memory.summarize';
        const currentValue = String(aiSelfTestSelectEl?.value || fallbackTaskId);
        return (TASK_ORDER.find((taskId: MemoryAiTaskId) => taskId === currentValue) || fallbackTaskId) as MemoryAiTaskId;
    }

    /**
     * 功能：将路由命中来源转换成更易读的中文标签。
     * 参数：
     *   resolvedBy：路由命中来源。
     * 返回：
     *   string：中文说明文本。
     */
    function formatResolvedBy(resolvedBy?: RoutePreviewSnapshot['resolvedBy']): string {
        if (!resolvedBy) return '未命中';
        return RESOLVED_BY_LABELS[resolvedBy] || resolvedBy;
    }

    /**
     * 功能：将资源来源转换为中文显示文本。
     * 参数：
     *   source：资源来源类型。
     * 返回：
     *   string：中文来源说明。
     */
    function formatResourceSource(source?: AiSelfTestResult['source']): string {
        if (source === 'tavern') return '酒馆';
        if (source === 'custom') return '自定义';
        return '未知';
    }

    /**
     * 功能：格式化资源显示名称，优先显示标签，必要时补上资源 ID。
     * 参数：
     *   resourceId：资源 ID。
     *   resourceLabel：资源显示名称。
     * 返回：
     *   string：格式化后的资源文本。
     */
    function formatResourceText(resourceId?: string, resourceLabel?: string): string {
        if (resourceLabel && resourceId && resourceLabel !== resourceId) {
            return `${resourceLabel} (${resourceId})`;
        }
        return resourceLabel || resourceId || '未分配';
    }

    /**
     * 功能：对测试结果数组按固定任务顺序排序，便于稳定展示。
     * 参数：
     *   results：原始测试结果数组。
     * 返回：
     *   AiSelfTestResult[]：排序后的结果数组。
     */
    function sortAiSelfTestResults(results: AiSelfTestResult[]): AiSelfTestResult[] {
        return [...results].sort((left: AiSelfTestResult, right: AiSelfTestResult): number => {
            return TASK_ORDER.indexOf(left.taskId) - TASK_ORDER.indexOf(right.taskId);
        });
    }

    /**
     * 功能：格式化单条路由预览文本。
     * 参数：
     *   label：路由名称。
     *   route：路由预览结果。
     * 返回：
     *   string：可直接写入预格式化容器的文本。
     */
    function formatRoutePreview(label: string, route: RoutePreviewSnapshot | null): string {
        if (!route) {
            return `
                <div style="background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:4px; opacity:0.8; display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600; font-size:12px;">${label}</span>
                    <span style="font-size:10px; padding:1px 4px; border-radius:4px; font-weight:normal; background:rgba(255,255,255,0.1);">未获得预览</span>
                </div>
            `;
        }

        const isOk = route.available;
        const statusColor = isOk ? 'var(--stx-memory-success, #4caf50)' : 'var(--stx-memory-danger-contrast, #f44336)';
        const statusBg = isOk ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)';
        const statusText = isOk ? '可用' : '不可用';
        
        const resourceStr = formatResourceText(route.resourceId, route.resourceLabel);
        const typeStr = route.resourceType ? (route.resourceType === 'generation' ? '生成' : route.resourceType === 'embedding' ? '向量化' : '重排列') : '未知';
        const modelStr = route.model || '未设置';
        const sourceStr = formatResourceSource(route.source);
        const resolvedByStr = formatResolvedBy(route.resolvedBy);
        
        let blockHtml = '';
        if (route.blockedReason) {
             blockHtml = `<div style="width:100%; margin-top:2px; color:var(--stx-memory-danger-contrast, #f44336); font-size:10px;">阻塞原因：${route.blockedReason}</div>`;
        }
        
        return `
            <div style="background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:4px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; line-height:1;">
                    <span style="font-weight:600; font-size:12px;">${label}</span>
                    <span style="font-size:10px; padding:1px 4px; border-radius:4px; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBg}; min-width:max-content;">${statusText}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:4px 12px; font-size:11px; opacity:0.85;">
                    <div>资源：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${resourceStr}</strong></div>
                    <div>模型：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${modelStr}</strong></div>
                    <div>类型：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${typeStr}</strong></div>
                    <div>规则：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${resolvedByStr}</strong></div>
                    <div>来源：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${sourceStr}</strong></div>
                    ${blockHtml}
                </div>
            </div>
        `;
    }

    /**
     * 功能：在“当前测试路由”区域渲染三类能力的命中结果。
     * 参数：
     *   snapshot：当前健康快照。
     * 返回：
     *   void：无返回值。
     */
    function renderAiRoutePreview(snapshot: MemoryAiHealthSnapshot): void {
        if (!aiRoutePreviewEl) return;
        const html = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                ${formatRoutePreview('生成路由', snapshot.routeOverview.generation)}
                ${formatRoutePreview('向量路由', snapshot.routeOverview.embedding)}
                ${formatRoutePreview('重排路由', snapshot.routeOverview.rerank)}
            </div>
        `;
        aiRoutePreviewEl.innerHTML = html;
    }

    /**
     * 功能：渲染单项测试的详情区，展示返回预览、资源与错误信息。
     * 参数：
     *   result：当前要展示的测试结果。
     *   snapshot：最新健康快照。
     * 返回：
     *   void：无返回值。
     */
    function renderAiSelfTestDetail(
        result: AiSelfTestResult | null,
        snapshot: MemoryAiHealthSnapshot,
    ): void {
        if (!aiSelfTestDetailEl) return;
        const selectedTaskId = getSelectedAiSelfTestTaskId();
        const selectedRoute = snapshot.taskRoutes[selectedTaskId];

        const buildBlockHtml = (title: string, detailsHtml: string, preHtml: string, isOk: boolean | null) => {
            const statusColor = isOk === true ? 'var(--stx-memory-success, #4caf50)' : isOk === false ? 'var(--stx-memory-danger-contrast, #f44336)' : 'var(--ss-theme-text, #ccc)';
            const statusBg = isOk === true ? 'rgba(76, 175, 80, 0.15)' : isOk === false ? 'rgba(244, 67, 54, 0.15)' : 'rgba(255, 255, 255, 0.1)';
            const statusText = isOk === true ? '成功' : isOk === false ? '失败' : '未运行';

            return `
                <div style="background:rgba(255,255,255,0.05); padding:6px 10px; border-radius:4px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                        <span style="font-weight:600; font-size:12px;">${title}</span>
                        <span style="font-size:10px; padding:1px 4px; border-radius:4px; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBg}; min-width:max-content;">${statusText}</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px 12px; font-size:11px; opacity:0.85; margin-bottom:8px;">
                        ${detailsHtml}
                    </div>
                    <div style="font-size:11px; opacity:0.9;">
                        <div style="font-weight:600; margin-bottom:4px; font-size:10px; opacity:0.6;">返回预览：</div>
                        <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; font-family:monospace; white-space:pre-wrap; word-break:break-all;">${preHtml}</div>
                    </div>
                </div>
            `;
        };

        if (!result) {
            const detailsHtml = `
                <div>可测：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${selectedRoute?.available ? '是' : '否'}</strong></div>
                <div>资源：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${formatResourceText(selectedRoute?.route?.resourceId, selectedRoute?.route?.resourceLabel)}</strong></div>
                <div>模型：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${selectedRoute?.route?.model || '未设'}</strong></div>
                <div>规则：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${formatResolvedBy(selectedRoute?.route?.resolvedBy)}</strong></div>
                ${selectedRoute?.blockedReason ? `<div style="width:100%; color:var(--stx-memory-danger-contrast, #f44336); margin-top:2px;">阻塞原因：${selectedRoute.blockedReason}</div>` : ''}
            `;
            aiSelfTestDetailEl.innerHTML = buildBlockHtml(`任务：${TASK_LABELS[selectedTaskId]}`, detailsHtml, '尚未运行该测试。', null);
            return;
        }

        const detailsHtml = `
            <div>耗时：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${result.durationMs}ms</strong></div>
            <div>资源：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${formatResourceText(result.resourceId, result.resourceLabel)}</strong></div>
            <div>模型：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${result.model || '未设'}</strong></div>
            <div>规则：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${formatResolvedBy(result.resolvedBy as RoutePreviewSnapshot['resolvedBy'])}</strong></div>
            <div>来源：<strong style="color:var(--stx-memory-text, inherit);font-weight:500;">${formatResourceSource(result.source)}</strong></div>
            ${result.detail ? `<div style="width:100%; margin-top:2px;">说明：${result.detail}</div>` : ''}
            ${result.blockedReason ? `<div style="width:100%; margin-top:2px; color:var(--stx-memory-danger-contrast, #f44336);">阻塞原因：${result.blockedReason}</div>` : ''}
            ${result.error ? `<div style="width:100%; margin-top:2px; color:var(--stx-memory-danger-contrast, #f44336);">错误：${result.error}</div>` : ''}
        `;
        aiSelfTestDetailEl.innerHTML = buildBlockHtml(`任务：${TASK_LABELS[result.taskId]}`, detailsHtml, escapeHtml(result.responsePreview || '本次测试没有可展示的返回内容。'), result.ok);
    }

    /**
     * 功能：渲染自测结果列表，并允许用户点击某项查看详情。
     * 参数：
     *   results：最近一次要展示的结果数组。
     * 返回：
     *   void：无返回值。
     */
    function renderAiSelfTestResults(results: AiSelfTestResult[]): void {
        if (!aiSelfTestResultsEl) return;
        if (!results.length) {
            aiSelfTestResultsEl.textContent = '尚未运行自测。请选择单项测试，或点击“运行全部自测”。';
            return;
        }
        const passCount = results.filter((result: AiSelfTestResult) => result.ok).length;
        const summaryHtml = `<div style="margin-bottom:10px;font-size:12px;color:var(--ss-theme-text, #ccc);">最近一次测试：${passCount}/${results.length} 项成功。点击下方条目可查看详情。</div>`;
        const itemsHtml = results.map((result: AiSelfTestResult, index: number): string => {
            const isActive = lastAiSelfTestDetail === result;
            const metaParts: string[] = [
                `${result.durationMs}ms`,
                formatResourceText(result.resourceId, result.resourceLabel),
                result.model || '未设模型',
            ];
            const subText = result.error || result.blockedReason || result.detail || '执行完成';
            return `
                <button
                    type="button"
                    data-ai-self-test-index="${index}"
                    style="width:100%;text-align:left;display:flex;flex-direction:column;gap:4px;padding:6px 10px;border-radius:6px;border:1px solid ${isActive ? 'rgba(88, 166, 255, 0.6)' : 'rgba(255,255,255,0.08)'};background:${isActive ? 'rgba(88,166,255,0.12)' : 'rgba(255,255,255,0.04)'};color:var(--ss-theme-text, #ddd);margin-bottom:4px;cursor:pointer;"
                >
                    <span style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                        <span>${result.ok ? '✅' : '❌'} ${escapeHtml(TASK_LABELS[result.taskId])}</span>
                        <span style="font-size:11px;opacity:0.82;">${escapeHtml(metaParts.join(' · '))}</span>
                    </span>
                    <span style="font-size:11px;opacity:0.82;">${escapeHtml(subText)}</span>
                </button>
            `;
        }).join('');
        aiSelfTestResultsEl.innerHTML = `<div style="display:flex; flex-direction:column; gap:4px;">${summaryHtml}${itemsHtml}</div>`;
    }

    /**
     * 功能：根据当前健康快照与运行状态，更新测试按钮的禁用态。
     * 参数：
     *   snapshot：当前健康快照。
     * 返回：
     *   void：无返回值。
     */
    function updateAiTestButtonState(snapshot: MemoryAiHealthSnapshot): void {
        const selectedTaskId = getSelectedAiSelfTestTaskId();
        const selectedRoute = snapshot.taskRoutes[selectedTaskId];
        const hasAvailableTask = TASK_ORDER.some((taskId: MemoryAiTaskId): boolean => {
            return Boolean(snapshot.taskRoutes[taskId]?.available);
        });

        if (aiSelfTestRunBtn) {
            const blockedReason = selectedRoute?.blockedReason || snapshot.diagnosisText;
            aiSelfTestRunBtn.disabled = aiSingleTestRunning || !selectedRoute?.available;
            aiSelfTestRunBtn.title = aiSelfTestRunBtn.disabled ? blockedReason : '运行当前选中的单项测试';
        }
        if (aiSelfTestAllBtn) {
            aiSelfTestAllBtn.disabled = aiBatchTestRunning || !hasAvailableTask;
            aiSelfTestAllBtn.title = aiSelfTestAllBtn.disabled
                ? '当前没有任何可运行的测试，请先完成 LLM 资源分配。'
                : '依次运行全部自测任务';
        }
    }

    /**
     * 功能：刷新 AI 诊断区域的全部内容，可选触发一次健康快照重算。
     * 参数：
     *   forceRefresh：是否先主动刷新健康快照。
     * 返回：
     *   Promise<void>：异步刷新完成。
     */
    async function refreshAiDiagnostics(forceRefresh: boolean): Promise<void> {
        if (forceRefresh) {
            await refreshHealthSnapshot();
        }
        const snapshot: MemoryAiHealthSnapshot = getHealthSnapshot();

        if (aiDiagOverviewEl) {
            const isFull = snapshot.diagnosisLevel === 'fully_operational';
            const isPartial = snapshot.diagnosisLevel === 'online_partial_capabilities';
            const isMounted = snapshot.diagnosisLevel === 'mounted_not_registered';
            
            const diagColor = isFull ? 'var(--stx-memory-success, #4caf50)'
                : (isPartial || isMounted) ? 'var(--stx-memory-warning, #ff9800)'
                : 'var(--stx-memory-danger-contrast, #f44336)';
            
            const diagIcon = isFull ? 'fa-circle-check'
                : (isPartial || isMounted) ? 'fa-exclamation-triangle'
                : 'fa-circle-xmark';

            const html = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="font-weight:600; font-size:13px; color:${diagColor}; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid ${diagIcon}"></i>
                        <span>${escapeHtml(snapshot.diagnosisText)}</span>
                    </div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:11px; opacity:0.85;">
                        <span style="background:rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px;">
                            LLMHub 挂载：<strong style="margin-left:2px; color:var(--stx-memory-text, inherit);">${snapshot.llmHubMounted ? '是' : '否'}</strong>
                        </span>
                        <span style="background:rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px;">
                            Consumer 注册：<strong style="margin-left:2px; color:var(--stx-memory-text, inherit);">${snapshot.consumerRegistered ? '已注册' : '未注册'}</strong>
                        </span>
                        <span style="background:rgba(255,255,255,0.08); padding:3px 8px; border-radius:4px;">
                            AI 模式：<strong style="margin-left:2px; color:var(--stx-memory-text, inherit);">${snapshot.aiModeEnabled ? '启用' : '关闭'}</strong>
                        </span>
                    </div>
                </div>`;
            aiDiagOverviewEl.innerHTML = html;
        }

        renderAiRoutePreview(snapshot);

        if (aiDiagCapabilitiesEl) {
            aiDiagCapabilitiesEl.innerHTML = snapshot.capabilities.map((cap) => {
                const color = cap.state === 'available' ? 'var(--stx-memory-success, #4caf50)'
                    : cap.state === 'degraded' ? 'var(--stx-memory-warning, #ff9800)'
                    : 'var(--stx-memory-danger-contrast, #f44336)';
                const icon = cap.state === 'available' ? 'fa-circle-check'
                    : cap.state === 'degraded' ? 'fa-exclamation-triangle'
                    : 'fa-circle-xmark';
                return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.2);font-size:12px;">
                  <i class="fa-solid ${icon}" style="color:${color};font-size:11px;"></i>
                  <span>${escapeHtml(cap.capability)}</span>
                </span>`;
            }).join('');
        }

        if (aiDiagRecentTasksEl) {
            const taskIds = Object.keys(snapshot.tasks) as MemoryAiTaskId[];
            if (taskIds.length === 0) {
                aiDiagRecentTasksEl.textContent = '暂无任务记录';
            } else {
                const lines: string[] = [];
                for (const tid of taskIds) {
                    const status = snapshot.tasks[tid];
                    const label = TASK_LABELS[tid] || tid;
                    const stateText = status.state === 'idle' ? '空闲'
                        : status.state === 'running' ? '运行中'
                        : status.state === 'success' ? '成功'
                        : '失败';
                    const stateIcon = status.state === 'success' ? '✅'
                        : status.state === 'failed' ? '❌'
                        : status.state === 'running' ? '⏳'
                        : '⬜';
                    let line = `${stateIcon} ${label}: ${stateText}`;
                    if (status.state === 'running') {
                        line += ` <span class="stx-running-dots"><span class="stx-dot"></span><span class="stx-dot"></span><span class="stx-dot"></span></span>`;
                    }
                    if (status.lastRecord) {
                        const time = new Date(status.lastRecord.ts).toLocaleTimeString();
                        line += ` (${time}, ${status.lastRecord.durationMs}ms)`;
                        if (!status.lastRecord.ok && status.lastRecord.error) {
                            line += `<br>   → ${status.lastRecord.error}`;
                        }
                    }
                    lines.push(line);
                }
                if (snapshot.recentRecords.length > 0) {
                    lines.push('');
                    lines.push('── 最近执行记录 ──');
                    for (const rec of snapshot.recentRecords.slice(0, 10)) {
                        const icon = rec.ok ? '✅' : '❌';
                        const time = new Date(rec.ts).toLocaleTimeString();
                        const label = TASK_LABELS[rec.taskId] || rec.taskId;
                        let line = `${icon} ${time} ${label} ${rec.durationMs}ms`;
                        if (!rec.ok && rec.error) {
                            line += ` - ${rec.error}`;
                        }
                        if (rec.note) {
                            line += ` (${rec.note})`;
                        }
                        lines.push(line);
                    }
                }
                aiDiagRecentTasksEl.innerHTML = lines.join('<br>');
            }
        }

        renderAiSelfTestResults(lastAiSelfTestResults);
        renderAiSelfTestDetail(lastAiSelfTestDetail, snapshot);
        updateAiTestButtonState(snapshot);
    }

    if (aiSelfTestSelectEl && !aiSelfTestSelectEl.value) {
        aiSelfTestSelectEl.value = TASK_ORDER[0];
    }

    if (aiSelfTestResultsEl && aiSelfTestResultsEl.dataset.bound !== '1') {
        aiSelfTestResultsEl.dataset.bound = '1';
        aiSelfTestResultsEl.addEventListener('click', (event: Event): void => {
            const target = event.target as HTMLElement | null;
            const trigger = target?.closest<HTMLElement>('[data-ai-self-test-index]');
            if (!trigger) return;
            const index = Number(trigger.dataset.aiSelfTestIndex ?? '');
            if (!Number.isFinite(index)) return;
            const nextResult = lastAiSelfTestResults[Math.floor(index)];
            if (!nextResult) return;
            lastAiSelfTestDetail = nextResult;
            renderAiSelfTestResults(lastAiSelfTestResults);
            renderAiSelfTestDetail(nextResult, getHealthSnapshot());
        });
    }

    void refreshAiDiagnostics(true);

    onHealthChange((): void => {
        void refreshAiDiagnostics(false);
    });

    if (aiDiagRefreshBtn) {
        aiDiagRefreshBtn.addEventListener('click', async (): Promise<void> => {
            await refreshAiDiagnostics(true);
            toast.success('诊断信息已刷新');
        });
    }

    if (aiSelfTestSelectEl) {
        aiSelfTestSelectEl.addEventListener('change', (): void => {
            const selectedTaskId = getSelectedAiSelfTestTaskId();
            lastAiSelfTestDetail = lastAiSelfTestResults.find((result: AiSelfTestResult): boolean => {
                return result.taskId === selectedTaskId;
            }) || null;
            void refreshAiDiagnostics(false);
        });
    }

    if (aiSelfTestRunBtn) {
        aiSelfTestRunBtn.addEventListener('click', async (): Promise<void> => {
            const taskId = getSelectedAiSelfTestTaskId();
            aiSingleTestRunning = true;
            aiSelfTestRunBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp;测试中...';
            if (aiSelfTestDetailEl) {
                aiSelfTestDetailEl.textContent = `正在运行 ${TASK_LABELS[taskId]} 测试，请稍候...`;
            }
            updateAiTestButtonState(getHealthSnapshot());
            try {
                const result = await runSingleSelfTest(taskId);
                lastAiSelfTestResults = sortAiSelfTestResults([
                    result,
                    ...lastAiSelfTestResults.filter((item: AiSelfTestResult): boolean => item.taskId !== taskId),
                ]);
                lastAiSelfTestDetail = result;
                renderAiSelfTestResults(lastAiSelfTestResults);
                renderAiSelfTestDetail(lastAiSelfTestDetail, getHealthSnapshot());
                await refreshAiDiagnostics(true);
                toast[result.ok ? 'success' : 'warning'](`${TASK_LABELS[taskId]}测试${result.ok ? '成功' : '失败'}`);
            } catch (error: unknown) {
                const errorText = String((error as Error)?.message || error);
                if (aiSelfTestDetailEl) {
                    aiSelfTestDetailEl.textContent = `单项测试异常：${errorText}`;
                }
                toast.error(`单项测试异常：${errorText}`);
            } finally {
                aiSingleTestRunning = false;
                aiSelfTestRunBtn.innerHTML = '<i class="fa-solid fa-vial-circle-check"></i>&nbsp;运行所选测试';
                await refreshAiDiagnostics(false);
            }
        });
    }

    if (aiSelfTestAllBtn) {
        aiSelfTestAllBtn.addEventListener('click', async (): Promise<void> => {
            aiBatchTestRunning = true;
            aiSelfTestAllBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp;自测中...';
            if (aiSelfTestResultsEl) {
                aiSelfTestResultsEl.textContent = '正在运行全部自测，请稍候...';
            }
            if (aiSelfTestDetailEl) {
                aiSelfTestDetailEl.textContent = '测试进行中，完成后会在这里展示返回预览。';
            }
            updateAiTestButtonState(getHealthSnapshot());

            try {
                const results = sortAiSelfTestResults(await runAiSelfTests());
                lastAiSelfTestResults = results;
                lastAiSelfTestDetail = results.find((item: AiSelfTestResult): boolean => !item.ok) || results[0] || null;
                renderAiSelfTestResults(results);
                renderAiSelfTestDetail(lastAiSelfTestDetail, getHealthSnapshot());
                await refreshAiDiagnostics(true);
                const passCount = results.filter((item: AiSelfTestResult): boolean => item.ok).length;
                toast.success(`全部自测完成：${passCount}/${results.length} 项成功`);
            } catch (error: unknown) {
                const errorText = String((error as Error)?.message || error);
                if (aiSelfTestResultsEl) {
                    aiSelfTestResultsEl.textContent = `全部自测异常：${errorText}`;
                }
                if (aiSelfTestDetailEl) {
                    aiSelfTestDetailEl.textContent = `全部自测异常：${errorText}`;
                }
                toast.error(`全部自测异常：${errorText}`);
            } finally {
                aiBatchTestRunning = false;
                aiSelfTestAllBtn.innerHTML = '<i class="fa-solid fa-vial"></i>&nbsp;运行全部自测';
                await refreshAiDiagnostics(false);
            }
        });
    }

    let autoCompactionTimer: ReturnType<typeof setInterval> | null = null;
    const applyAutoCompactionScheduler = (enabled: boolean): void => {
        if (autoCompactionTimer) {
            clearInterval(autoCompactionTimer);
            autoCompactionTimer = null;
        }
        if (!enabled) {
            return;
        }
        autoCompactionTimer = setInterval(async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.compaction?.needsCompaction || !memory?.compaction?.compact) {
                return;
            }
            try {
                const check = await memory.compaction.needsCompaction();
                if (check?.needed) {
                    await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
                }
            } catch (error) {
                logger.warn('自动压缩任务执行失败', error);
            }
        }, 60_000);
    };

    bindToggle(IDS.autoCompactionId, 'autoCompaction', (enabled) => {
        applyAutoCompactionScheduler(enabled);
    });
    const autoCompactionEnabled = readSettingBoolean('autoCompaction');
    applyAutoCompactionScheduler(autoCompactionEnabled);

    setTimeout(() => {
        const enabled = readSettingBoolean('enabled');
        broadcast(
            'plugin:broadcast:state_changed',
            {
                pluginId: 'stx_memory_os',
                isEnabled: enabled,
            },
            'stx_memory_os'
        );
    }, 300);

    // ===== 世界模板面板交互 =====
    const refreshTemplatesUI = async (): Promise<void> => {
        const listEl = document.getElementById(IDS.templateListId);
        const activeSelectEl = document.getElementById(IDS.templateActiveSelectId) as HTMLSelectElement | null;
        const lockEl = document.getElementById(IDS.templateLockId) as HTMLInputElement | null;
        if (!listEl) return;
        const memory = (window as any).STX?.memory;
        if (!memory?.template?.listByChatKey) {
            listEl.textContent = '暂无可用模板，请先启动会话并开启 AI 模式。';
            return;
        }
        try {
            const [templates, binding, activeTemplateId] = await Promise.all([
                memory.template.listByChatKey(),
                memory.template.getBinding?.(),
                memory.getActiveTemplateId?.(),
            ]);

            if (activeSelectEl) {
                activeSelectEl.innerHTML = '<option value="">选择要激活的模板...</option>';
                for (const template of templates) {
                    const option = document.createElement('option');
                    option.value = template.templateId;
                    option.textContent = `${template.name} (${template.worldType})`;
                    activeSelectEl.appendChild(option);
                }
                if (activeTemplateId) {
                    activeSelectEl.value = activeTemplateId;
                }
            }
            refreshSharedSelectOptions(document.getElementById(IDS.cardId) || document.body);
            if (lockEl) {
                lockEl.checked = binding?.isLocked === true;
            }

            if (templates.length === 0) {
                listEl.textContent = '未找到绑定模板。';
                return;
            }

            listEl.textContent = templates.map((template: any) => {
                const isActive = activeTemplateId && template.templateId === activeTemplateId;
                const mark = isActive ? '★' : ' ';
                const hash = template.worldInfoRef?.hash || '(无 hash)';
                return `${mark}[模板] ${template.name} (${template.worldType})\n实体表: ${Object.keys(template.entities || {}).join(', ')}\nFactTypes: ${(template.factTypes || []).map((item: any) => item.type).join(', ') || '(空)'}\nHash: ${hash}\nID: ${template.templateId}`;
            }).join('\n\n');
        } catch (e) {
            listEl.textContent = '读取模板失败: ' + String(e);
        }
    };

    // 点击世界模板 Tab 时自动刺新
    const templateTabEl = document.getElementById(IDS.tabTemplateId);
    if (templateTabEl) {
        templateTabEl.addEventListener('click', refreshTemplatesUI);
    }

    // 手动刷新按鈕
    const refreshBtn = document.getElementById(IDS.templateRefreshBtnId);
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshTemplatesUI);
    }

    // 强制重建按钮：直接调用 template.rebuildFromWorldInfo()
    const forceRebuildBtn = document.getElementById(IDS.templateForceRebuildBtnId);
    if (forceRebuildBtn) {
        forceRebuildBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.template?.rebuildFromWorldInfo) {
                alert('请先启动 Memory OS');
                return;
            }
            if (!confirm('将强制读取世界书并重建模板，确定吗？')) return;
            try {
                const templateId = await memory.template.rebuildFromWorldInfo();
                await refreshTemplatesUI();
                alert(templateId ? `重建成功，当前模板: ${templateId}` : '未生成新模板，请检查世界书或 LLM 配置');
            } catch (error) {
                alert('重建失败：' + String(error));
            }
        });
    }

    const templateSetActiveBtn = document.getElementById(IDS.templateSetActiveBtnId);
    if (templateSetActiveBtn) {
        templateSetActiveBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            const activeSelectEl = document.getElementById(IDS.templateActiveSelectId) as HTMLSelectElement | null;
            const lockEl = document.getElementById(IDS.templateLockId) as HTMLInputElement | null;
            if (!memory?.template?.setActive || !activeSelectEl) {
                alert('模板管理器未就绪。');
                return;
            }
            const templateId = activeSelectEl.value;
            if (!templateId) {
                alert('请先选择一个模板。');
                return;
            }
            try {
                await memory.template.setActive(templateId, { lock: lockEl?.checked === true });
                if (memory.template.setLock && lockEl) {
                    await memory.template.setLock(lockEl.checked);
                }
                await refreshTemplatesUI();
                alert('模板切换成功。');
            } catch (error) {
                alert('模板切换失败：' + String(error));
            }
        });
    }

    // ===== 数据库操作按钮联通 =====

    // 立即压缩：调用 compaction.compact() 并显示压缩结果
    const dbCompactBtn = document.getElementById(IDS.dbCompactBtnId);
    if (dbCompactBtn) {
        dbCompactBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.compaction) {
                alert('Memory OS 尚未就绪，请刷新后重试。');
                return;
            }
            dbCompactBtn.setAttribute('disabled', 'true');
            dbCompactBtn.textContent = '正在压缩...';
            try {
                // 先检查是否真的需要压缩
                const check = await memory.compaction.needsCompaction();
                if (!check.needed && check.eventCount !== undefined && check.eventCount < 100) {
                    alert(`当前事件数量仅 ${check.eventCount} 条，无需压缩。`);
                    return;
                }
                const result = await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
                alert(`压缩完成！\n生成摘要：${result.summariesCreated} 条\n归档事件：${result.eventsArchived} 条`);
            } catch (e) {
                alert('压缩失败：' + String(e));
            } finally {
                dbCompactBtn.removeAttribute('disabled');
                dbCompactBtn.textContent = '立即压缩';
            }
        });
    }

    // 导出记忆包：把核心数据序列化成 JSON 并触发下载
    const dbExportBtn = document.getElementById(IDS.dbExportBtnId);
    if (dbExportBtn) {
        dbExportBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            try {
                const chatKey = memory.getChatKey?.() ?? 'unknown';
                const { db } = await import('../db/db');
                const [events, facts, state, summaries, templates, meta, binding] = await Promise.all([
                    memory.events?.query({ limit: 5000 }) ?? [],
                    memory.facts?.query({ limit: 5000 }) ?? [],
                    db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).toArray(),
                    memory.summaries?.query({ limit: 1000 }) ?? [],
                    db.templates.where('[chatKey+createdAt]').between([chatKey, 0], [chatKey, Infinity]).toArray(),
                    db.meta.get(chatKey),
                    db.template_bindings.get(chatKey),
                ]);
                const exportData = {
                    exportedAt: new Date().toISOString(),
                    schemaVersion: meta?.schemaVersion ?? 1,
                    chatKey,
                    events,
                    facts,
                    state,
                    summaries,
                    templates,
                    meta,
                    binding,
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `stx_memory_os_export_${chatKey}_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                alert('导出失败：' + String(e));
            }
        });
    }

    const dbImportBtn = document.getElementById(IDS.dbImportBtnId);
    if (dbImportBtn) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json,.json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        dbImportBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async () => {
            const memory = (window as any).STX?.memory;
            const file = fileInput.files?.[0];
            if (!memory || !file) {
                return;
            }

            try {
                const text = await file.text();
                const payload = JSON.parse(text);
                const currentChatKey = memory.getChatKey?.();
                if (!currentChatKey) {
                    throw new Error('当前 chatKey 不可用');
                }

                const importedChatKey = String(payload.chatKey || '');
                if (importedChatKey && importedChatKey !== currentChatKey) {
                    const shouldContinue = confirm(`导入包属于 [${importedChatKey}]，当前聊天是 [${currentChatKey}]。\n确定继续并映射到当前聊天吗？`);
                    if (!shouldContinue) {
                        return;
                    }
                }

                const { db, clearMemoryChatData } = await import('../db/db');
                const events = Array.isArray(payload.events) ? payload.events : [];
                const facts = Array.isArray(payload.facts) ? payload.facts : [];
                const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];
                const mode = confirm('导入模式：确定=replace 全量替换，取消=merge 合并导入。') ? 'replace' : 'merge';
                const state = Array.isArray(payload.state) ? payload.state : [];
                const templates = Array.isArray(payload.templates) ? payload.templates : [];
                const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : null;
                const binding = payload.binding && typeof payload.binding === 'object' ? payload.binding : null;
                if (mode === 'replace') {
                    await clearMemoryChatData(currentChatKey);
                }

                await db.transaction('rw', [db.events, db.facts, db.world_state, db.summaries, db.templates, db.meta, db.template_bindings], async () => {
                    if (events.length > 0) {
                        await db.events.bulkPut(events.map((event: any) => ({
                            ...event,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (facts.length > 0) {
                        await db.facts.bulkPut(facts.map((fact: any) => ({
                            ...fact,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (summaries.length > 0) {
                        await db.summaries.bulkPut(summaries.map((summary: any) => ({
                            ...summary,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (state.length > 0) {
                        await db.world_state.bulkPut(state.map((item: any) => ({
                            ...item,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (templates.length > 0) {
                        await db.templates.bulkPut(templates.map((item: any) => ({
                            ...item,
                            chatKey: currentChatKey,
                        })));
                    }
                    await db.meta.put({
                        ...(meta || {}),
                        chatKey: currentChatKey,
                        schemaVersion: Number(meta?.schemaVersion ?? payload.schemaVersion ?? 1),
                    });
                    if (binding) {
                        await db.template_bindings.put({
                            ...binding,
                            bindingKey: currentChatKey,
                            chatKey: currentChatKey,
                        });
                    }
                });

                alert(`导入完成(${mode})：events=${events.length}, facts=${facts.length}, state=${state.length}, summaries=${summaries.length}, templates=${templates.length}`);
            } catch (error) {
                alert('导入失败：' + String(error));
            } finally {
                fileInput.value = '';
            }
        });
    }

    // 清空当前聊天数据：通过 db 直接清理
    const dbClearBtn = document.getElementById(IDS.dbClearBtnId);
    if (dbClearBtn) {
        dbClearBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            const chatKey = memory.getChatKey?.() ?? '(未知)';
            if (!confirm(`确定要清空 [${chatKey}] 的所有记忆数据吗？\n此操作不可撤销！`)) return;
            try {
                // 通过 IndexedDB 的 db 单例直接按 chatKey 批量删除
                const { clearMemoryChatData } = await import('../db/db');
                await clearMemoryChatData(chatKey);
                alert(`已清空 [${chatKey}] 的所有记忆数据。`);
            } catch (e) {
                alert('清空失败：' + String(e));
            }
        });
    }

    // 记录编辑器按钮绑定
    const recordEditorBtn = document.getElementById(IDS.recordEditorBtnId);
    if (recordEditorBtn) {
        recordEditorBtn.addEventListener('click', () => {
            openRecordEditor();
        });
    }

    // ===== 审计历史 & 快照回滚面板 =====

    /** 渲染审计列表到 #auditList 容器 */
    const renderAuditList = async () => {
        const listEl = document.getElementById(IDS.auditListId);
        if (!listEl) return;
        const memory = (window as any).STX?.memory;
        if (!memory?.audit) {
            listEl.textContent = 'Memory OS 尚未就绪。';
            return;
        }
        listEl.textContent = '加载中...';
        try {
            const records = await memory.audit.list({ limit: 50 });
            if (records.length === 0) {
                listEl.textContent = '暂无审计记录。';
                return;
            }
            listEl.innerHTML = '';
            for (const r of records) {
                const isSnapshot = r.action === 'snapshot';
                const time = new Date(r.ts).toLocaleString();
                const note = r.after?.note ? ` — ${r.after.note}` : '';
                const row = document.createElement('div');
                row.className = 'stx-ui-audit-row';
                row.innerHTML = `
                    <span class="stx-ui-audit-main">
                        <b class="stx-ui-audit-action${isSnapshot ? ' is-snapshot' : ''}">[${r.action}]</b>
                        <span class="stx-ui-audit-time">${time}</span>
                        <span>${note}</span>
                    </span>
                    ${isSnapshot ? `<button class="stx-ui-audit-rollback" data-snapshot-id="${r.auditId}" data-tip="回滚到这个快照。">回滚</button>` : ''}
                `;
                // 绑定回滚按钮
                if (isSnapshot) {
                    const rollbackBtn = row.querySelector<HTMLButtonElement>(`[data-snapshot-id="${r.auditId}"]`);
                    rollbackBtn?.addEventListener('click', async () => {
                        if (!confirm(`确定回滚到快照 [${time}] 的状态吗？\n当前 facts/state/summaries 将被覆盖！`)) return;
                        rollbackBtn.disabled = true;
                        rollbackBtn.textContent = '回滚中...';
                        try {
                            await memory.audit.rollbackToSnapshot(r.auditId);
                            alert(`✅ 已成功回滚到 [${time}] 的状态。`);
                            await renderAuditList();
                        } catch (e) {
                            alert('回滚失败：' + String(e));
                            rollbackBtn.disabled = false;
                            rollbackBtn.textContent = '回滚';
                        }
                    });
                }
                listEl.appendChild(row);
            }
        } catch (e) {
            listEl.textContent = '加载失败：' + String(e);
        }
    };

    // 创建快照按钮
    const auditSnapshotBtn = document.getElementById(IDS.auditCreateSnapshotBtnId);
    if (auditSnapshotBtn) {
        auditSnapshotBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.audit) { alert('Memory OS 尚未就绪。'); return; }
            const note = prompt('为这个快照添加备注（可留空）：') ?? undefined;
            auditSnapshotBtn.setAttribute('disabled', 'true');
            try {
                const snapshotId = await memory.audit.createSnapshot(note);
                alert(`✅ 快照已创建！\nID: ${snapshotId}`);
                await renderAuditList();
            } catch (e) {
                alert('创建快照失败：' + String(e));
            } finally {
                auditSnapshotBtn.removeAttribute('disabled');
            }
        });
    }

    // 刷新审计记录按钮
    const auditRefreshBtn = document.getElementById(IDS.auditRefreshBtnId);
    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', renderAuditList);
    }

    // 切换到审计 Tab 时自动刷新
    const auditTabBtn = document.getElementById(IDS.tabAuditId);
    if (auditTabBtn) {
        auditTabBtn.addEventListener('click', renderAuditList);
    }

    // ===== 世界书写回 =====

    const wiPreviewEl = document.getElementById(IDS.wiPreviewId);

    const wiPreviewBtn = document.getElementById(IDS.wiPreviewBtnId);
    if (wiPreviewBtn) {
        wiPreviewBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) { alert('Memory OS 尚未就绪。'); return; }
            if (!wiPreviewEl) return;
            wiPreviewEl.textContent = '预览中...';
            try {
                const items = await memory.worldInfo.preview();
                if (items.length === 0) { wiPreviewEl.textContent = '暂无可写回的内容（facts/summaries 为空）。'; return; }
                wiPreviewEl.textContent = items.map((i: any) => `[${i.entry}] 关键词: ${i.keywords.join(', ')} | ${i.contentLength} 字`).join('\n');
            } catch (e) { wiPreviewEl.textContent = '预览失败：' + String(e); }
        });
    }

    const bindWriteback = (btnId: string, mode: 'all' | 'summaries') => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) { alert('Memory OS 尚未就绪。'); return; }
            if (!confirm(`确定将 ${mode === 'all' ? '事实+摘要' : '摘要'} 写回到 SillyTavern WorldInfo？\n已有旧条目将被替换。`)) return;
            btn.setAttribute('disabled', 'true');
            try {
                const result = await memory.worldInfo.writeback(mode);
                alert(`✅ 写回完成！\n世界书名: ${result.bookName}\n成功写入: ${result.written} 条`);
                if (wiPreviewEl) wiPreviewEl.textContent = '';
            } catch (e) { alert('写回失败：' + String(e)); }
            finally { btn.removeAttribute('disabled'); }
        });
    };

    bindWriteback(IDS.wiWritebackBtnId, 'all');
    bindWriteback(IDS.wiWriteSummaryBtnId, 'summaries');

    // ===== 逻辑表可编辑 =====

    const logicTableSelect = document.getElementById(IDS.logicTableEntitySelectId) as HTMLSelectElement;
    const logicTableContainer = document.getElementById(IDS.logicTableContainerId);

    /** 从当前激活模板的 entities 中构建实体类型列表 */
    const populateEntityTypes = async () => {
        const memory = (window as any).STX?.memory;
        if (!memory?.template || !logicTableSelect) return;
        const activeTemplate = await memory.template.getActive?.();
        const templates = await memory.template.listByChatKey();
        const fallbackTemplate = Array.isArray(templates) && templates.length > 0
            ? templates[templates.length - 1]
            : null;
        const targetTemplate = activeTemplate || fallbackTemplate;
        if (!targetTemplate) return;
        const entities = targetTemplate.entities || {};
        const prevVal = logicTableSelect.value;
        // 清空并填充新 options
        logicTableSelect.innerHTML = '<option value="">选择实体类型...</option>';
        for (const entityType of Object.keys(entities)) {
            const opt = document.createElement('option');
            opt.value = entityType;
            opt.textContent = entityType;
            logicTableSelect.appendChild(opt);
        }
        if (prevVal) logicTableSelect.value = prevVal;
        refreshSharedSelectOptions(document.getElementById(IDS.cardId) || document.body);
    };

    /** 渲染逻辑表内容（按选中的实体类型加载 facts） */
    const renderLogicTable = async (entityType: string) => {
        if (!logicTableContainer) return;
        if (!entityType) { logicTableContainer.innerHTML = '<span class="stx-ui-empty-hint">请选择实体类型查看。</span>'; return; }
        const memory = (window as any).STX?.memory;
        if (!memory?.worldInfo) { logicTableContainer.textContent = 'Memory OS 尚未就绪。'; return; }
        logicTableContainer.textContent = '加载中...';
        try {
            const facts = await memory.worldInfo.getLogicTable(entityType);
            if (!facts?.length) {
                logicTableContainer.innerHTML = `<span class="stx-ui-empty-hint">暂无 ${entityType} 类型的事实记录。</span>`;
                return;
            }
            logicTableContainer.innerHTML = '';
            for (const fact of facts) {
                const row = document.createElement('div');
                row.className = 'stx-logic-row';

                const entityLabel = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}]` : '';
                const valueStr = typeof fact.value === 'object' ? JSON.stringify(fact.value) : String(fact.value);

                row.innerHTML = `
                    <span class="stx-logic-entity">${entityLabel}</span>
                    <span class="stx-logic-path">${fact.path || '(无路径)'}：</span>
                    <span class="stx-logic-value" contenteditable="false"
                        data-fact-key="${fact.factKey}" data-type="${fact.type}"
                        data-entity-kind="${fact.entity?.kind ?? ''}" data-entity-id="${fact.entity?.id ?? ''}"
                        data-path="${fact.path ?? ''}"
                        data-tip="双击可编辑。"
                        >${valueStr}</span>
                `;
                // 双击转为编辑模式
                    const valueEl = row.querySelector<HTMLElement>('.stx-logic-value');
                    if (valueEl) {
                        valueEl.addEventListener('dblclick', () => {
                            valueEl.contentEditable = 'true';
                            valueEl.classList.remove('is-saved', 'is-error');
                            valueEl.classList.add('is-editing');
                            valueEl.focus();
                        });
                        valueEl.addEventListener('blur', async () => {
                            if (valueEl.contentEditable !== 'true') return;
                            valueEl.contentEditable = 'false';
                            valueEl.classList.remove('is-editing');
                            const newValueStr = valueEl.textContent?.trim() ?? '';
                            let newValue: any;
                            try { newValue = JSON.parse(newValueStr); } catch { newValue = newValueStr; }
                            try {
                                await memory.worldInfo.updateFact(
                                valueEl.dataset.factKey || undefined,
                                valueEl.dataset.type ?? entityType,
                                { kind: valueEl.dataset.entityKind ?? '', id: valueEl.dataset.entityId ?? '' },
                                    valueEl.dataset.path ?? '',
                                    newValue
                                );
                                valueEl.classList.remove('is-error');
                                valueEl.classList.add('is-saved');
                                setTimeout(() => { valueEl.classList.remove('is-saved'); }, 800);
                            } catch {
                                valueEl.classList.remove('is-saved');
                                valueEl.classList.add('is-error');
                            }
                        });
                    }
                logicTableContainer.appendChild(row);
            }
        } catch (e) {
            logicTableContainer.textContent = '加载失败：' + String(e);
        }
    };

    if (logicTableSelect) {
        logicTableSelect.addEventListener('change', () => renderLogicTable(logicTableSelect.value));
    }

    const logicTableRefreshBtn = document.getElementById(IDS.logicTableRefreshBtnId);
    if (logicTableRefreshBtn) {
        logicTableRefreshBtn.addEventListener('click', async () => {
            await populateEntityTypes();
            if (logicTableSelect?.value) await renderLogicTable(logicTableSelect.value);
        });
    }

    // 世界模板 Tab 激活时刷新实体类型列表
    const templateTabBtn = document.getElementById(IDS.tabTemplateId);
    if (templateTabBtn) {
        templateTabBtn.addEventListener('click', populateEntityTypes);
    }

}
