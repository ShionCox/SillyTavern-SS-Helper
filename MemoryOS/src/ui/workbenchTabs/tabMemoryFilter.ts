import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';
import { escapeHtml } from '../editorShared';
import type { WorkbenchSnapshot, WorkbenchState } from './shared';
import { escapeAttr } from './shared';

interface MemoryFilterModeMeta {
    key: string;
    label: string;
    icon: string;
}

interface MemoryFilterChannelMeta {
    key: 'memory' | 'context' | 'excluded';
    title: string;
    subtitle: string;
    className: string;
    icon: string;
}

interface MemoryFilterPreviewStats {
    memoryChars: number;
    contextChars: number;
    excludedChars: number;
    totalChars: number;
}

const MODE_LABELS: MemoryFilterModeMeta[] = [
    { key: 'xml', label: 'XML 标签', icon: '<>' },
    { key: 'delimiter', label: '分隔符', icon: '◇' },
    { key: 'regex', label: '正则', icon: '◈' },
    { key: 'markdown', label: 'Markdown', icon: 'M' },
    { key: 'json', label: 'JSON 字段', icon: '{}' },
];

const CHANNEL_LABELS: MemoryFilterChannelMeta[] = [
    { key: 'memory', title: '进入记忆', subtitle: '将被写入长期记忆并用于后续生成', className: 'is-memory', icon: '♜' },
    { key: 'context', title: '仅作参考', subtitle: '不会写入记忆，但可用于当前生成参考', className: 'is-context', icon: '◆' },
    { key: 'excluded', title: '完全排除', subtitle: '将被忽略，不参与任何后续处理', className: 'is-excluded', icon: '✦' },
];

const SCOPE_LABELS: Array<{ key: string; label: string }> = [
    { key: 'summary', label: '自动总结' },
    { key: 'takeover', label: '旧聊天接管' },
    { key: 'dreamRecall', label: '梦境召回' },
    { key: 'vectorIndex', label: '向量索引' },
    { key: 'promptInjection', label: 'Prompt 注入' },
];

export function buildMemoryFilterViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const legacyState = state as unknown as Record<string, unknown>;
    const legacySnapshot = snapshot as unknown as {
        memoryFilterSnapshot?: {
            loaded: boolean;
            availableFloors: Array<{ floor: number; role: string; charCount: number }>;
            settings?: {
                scope?: Record<string, boolean>;
                unknownPolicy?: string;
            };
        };
    };
    const loaded = legacySnapshot.memoryFilterSnapshot?.loaded === true;
    const enabled = legacyState.memoryFilterEnabled === true;
    const mode = String(legacyState.memoryFilterMode ?? 'xml');
    const rules = Array.isArray(legacyState.memoryFilterRules) ? legacyState.memoryFilterRules as Array<Record<string, unknown>> : [];
    const currentMode = mode === 'jsonpath' ? 'json' : mode;
    const visibleRules = rules.filter((rule: Record<string, unknown>): boolean => String(rule.mode ?? 'xml') === currentMode);
    const memoryRules = visibleRules.filter((rule) => normalizeChannel(rule.channel) === 'memory' || normalizeChannel(rule.channel) === 'primary');
    const contextRules = visibleRules.filter((rule) => normalizeChannel(rule.channel) === 'context' || normalizeChannel(rule.channel) === 'hint');
    const excludedRules = visibleRules.filter((rule) => normalizeChannel(rule.channel) === 'excluded');
    const memoryText = String(legacyState.memoryFilterMemoryPreview ?? '').trim();
    const contextText = String(legacyState.memoryFilterContextPreview ?? '').trim();
    const excludedText = String(legacyState.memoryFilterExcludedPreview ?? '').trim();
    const availableFloors = legacySnapshot.memoryFilterSnapshot?.availableFloors ?? [];
    const scope = legacySnapshot.memoryFilterSnapshot?.settings?.scope ?? {};
    const unknownPolicy = String(legacyState.memoryFilterUnknownPolicy ?? legacySnapshot.memoryFilterSnapshot?.settings?.unknownPolicy ?? 'memory');
    const loading = legacyState.memoryFilterPreviewLoading === true;
    const stats = buildPreviewStats(memoryText, contextText, excludedText);
    const floorRange = availableFloors.length > 0
        ? `${escapeHtml(String(availableFloors[0]!.floor))}-${escapeHtml(String(availableFloors[availableFloors.length - 1]!.floor))}`
        : '暂无快照';

    return `
        <section class="stx-memory-workbench__view stx-memory-filter"${state.currentView !== 'memory-filter' ? ' hidden' : ''}>
            <input id="stx-memory-filter-mode" type="hidden" value="${escapeAttr(mode)}">
            <input id="stx-memory-filter-min-length" type="hidden" value="${escapeAttr(legacyState.memoryFilterCleanupMinBlockLength ?? '0')}">
            <div class="stx-memory-filter__hero">
                <div class="stx-memory-filter__brand">
                    <span class="stx-memory-filter__brand-icon">✺</span>
                    <div class="stx-memory-filter__hero-copy">
                        <div class="stx-memory-filter__hero-title">记忆过滤器</div>
                        <p>在内容进入记忆系统前进行筛选与分类，控制哪些信息被保留、参考或排除。</p>
                    </div>
                </div>
                <label class="stx-memory-filter__switch-card">
                    <span>过滤功能</span>
                    <b>${enabled ? '已开启' : '已关闭'}</b>
                    <span class="stx-memory-filter__toggle-shell">
                        ${buildSharedBoxCheckbox({
                            id: 'stx-memory-filter-enabled',
                            inputAttributes: { checked: enabled },
                        })}
                    </span>
                </label>
            </div>

            ${loaded ? '' : `<div class="stx-memory-workbench__empty">进入本页后将按需加载记忆过滤配置与聊天楼层。</div>`}

            <div class="stx-memory-filter__scope-row">
                <div class="stx-memory-filter__scope-title">生效范围</div>
                <div class="stx-memory-filter__scope">
                    ${SCOPE_LABELS.map((item) => `
                        <label class="stx-memory-filter__scope-pill${scope[item.key] === false ? '' : ' is-on'}">
                            <input id="stx-memory-filter-scope-${escapeAttr(item.key)}" type="checkbox"${scope[item.key] === false ? '' : ' checked'}>
                            <span class="stx-memory-filter__scope-dot"></span>
                            <span>${escapeHtml(item.label)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="stx-memory-filter__main">
                <aside class="stx-memory-filter__left">
                    <section class="stx-memory-filter__card">
                        <div class="stx-memory-filter__card-title">过滤方式 <span>ⓘ</span></div>
                        <div class="stx-memory-filter__mode-list">
                            ${MODE_LABELS.map((item) => buildModeButton(item, mode)).join('')}
                        </div>
                    </section>

                    <section class="stx-memory-filter__card">
                        <div class="stx-memory-filter__card-title">策略设置 <span>⚙</span></div>
                        <label class="stx-memory-filter__field">
                            <span>未知标签处理</span>
                            <select class="stx-memory-workbench__select" id="stx-memory-filter-unknown-policy">
                                <option value="memory"${unknownPolicy === 'memory' ? ' selected' : ''}>当作正文进入记忆</option>
                                <option value="context"${unknownPolicy === 'context' ? ' selected' : ''}>仅作参考</option>
                                <option value="excluded"${unknownPolicy === 'excluded' ? ' selected' : ''}>完全排除</option>
                            </select>
                        </label>
                        <div class="stx-memory-filter__check-grid">
                            <label>${buildSharedBoxCheckbox({ id: 'stx-memory-filter-cleanup-strip-wrapper', appearance: 'check', inputAttributes: { checked: legacyState.memoryFilterCleanupStripWrapper !== false } })}<span>去除外层标签</span></label>
                            <label>${buildSharedBoxCheckbox({ id: 'stx-memory-filter-cleanup-drop-empty', appearance: 'check', inputAttributes: { checked: legacyState.memoryFilterCleanupDropEmptyBlocks !== false } })}<span>删除空段</span></label>
                        </div>
                        <label class="stx-memory-filter__field">
                            <span>最大分段长度</span>
                            <input class="stx-memory-workbench__input" id="stx-memory-filter-max-length" type="number" min="0" value="${escapeAttr(legacyState.memoryFilterCleanupMaxBlockLength ?? '1200')}">
                        </label>
                    </section>
                </aside>

                <section class="stx-memory-filter__rules">
                    <div class="stx-memory-filter__section-head">
                        <div>
                            <div class="stx-memory-filter__section-title">规则管理</div>
                            <p>配置标签或片段的归类规则</p>
                        </div>
                    </div>
                    <div class="stx-memory-filter__rule-grid">
                        ${buildRuleColumn(CHANNEL_LABELS[0]!, memoryRules, String(legacyState.memoryFilterSelectedRuleId ?? ''))}
                        ${buildRuleColumn(CHANNEL_LABELS[1]!, contextRules, String(legacyState.memoryFilterSelectedRuleId ?? ''))}
                        ${buildRuleColumn(CHANNEL_LABELS[2]!, excludedRules, String(legacyState.memoryFilterSelectedRuleId ?? ''))}
                    </div>
                    <div class="stx-memory-filter__priority-note">ⓘ 规则按优先级生效：<b>完全排除</b> &gt; <b>进入记忆</b> &gt; <b>仅作参考</b></div>
                    ${buildRuleEditor(visibleRules.find((rule: Record<string, unknown>): boolean => String(rule.id ?? '') === String(legacyState.memoryFilterSelectedRuleId ?? '')) ?? null)}
                </section>

                <section class="stx-memory-filter__preview">
                    <section class="stx-memory-filter__test-card">
                        <div class="stx-memory-filter__test-head">
                            <div>
                                <div class="stx-memory-filter__test-title">测试过滤</div>
                                <p>选择楼层后即时刷新右侧预览</p>
                            </div>
                            <div class="stx-memory-filter__test-actions">
                                <button class="stx-memory-filter__primary-btn" data-action="memory-filter-preview-range">${loading ? '处理中...' : '预览最终内容'} <span>→</span></button>
                                <button class="stx-memory-filter__ghost-btn" data-action="memory-filter-preview-floor">单层</button>
                                <button class="stx-memory-filter__ghost-btn" data-action="memory-filter-refresh-preview">刷新</button>
                            </div>
                        </div>
                        <div class="stx-memory-filter__test-controls">
                            <label class="stx-memory-filter__test-field">
                                <span>内容来源</span>
                                <select class="stx-memory-workbench__select" id="stx-memory-filter-preview-source-mode">
                                    <option value="content"${legacyState.memoryFilterPreviewSourceMode === 'raw_visible_text' ? '' : ' selected'}>当前聊天楼层</option>
                                    <option value="raw_visible_text"${legacyState.memoryFilterPreviewSourceMode === 'raw_visible_text' ? ' selected' : ''}>可见文本</option>
                                </select>
                            </label>
                            <label class="stx-memory-filter__test-field is-range">
                                <span>范围预览</span>
                                <div>
                                    <input class="stx-memory-workbench__input" id="stx-memory-filter-start-floor" type="number" min="1" placeholder="起始" value="${escapeAttr(legacyState.memoryFilterStartFloor ?? '')}">
                                    <i>至</i>
                                    <input class="stx-memory-workbench__input" id="stx-memory-filter-end-floor" type="number" min="1" placeholder="结束" value="${escapeAttr(legacyState.memoryFilterEndFloor ?? '')}">
                                </div>
                            </label>
                            <label class="stx-memory-filter__test-field">
                                <span>单层测试</span>
                                <input class="stx-memory-workbench__input" id="stx-memory-filter-selected-floor" type="number" min="1" placeholder="楼层" value="${escapeAttr(legacyState.memoryFilterSelectedFloor ?? '')}">
                            </label>
                        </div>
                    </section>
                    <div class="stx-memory-filter__preview-head">
                        <div>
                            <div class="stx-memory-filter__section-title">最终送模预览</div>
                            <p>查看经过过滤与归类后的内容及统计</p>
                        </div>
                        <div class="stx-memory-filter__stat-row">
                            ${buildStatCard('进入记忆', stats.memoryChars, 'is-memory')}
                            ${buildStatCard('仅作参考', stats.contextChars, 'is-context')}
                            ${buildStatCard('完全排除', stats.excludedChars, 'is-excluded')}
                            ${buildStatCard('总计', stats.totalChars, 'is-total')}
                        </div>
                    </div>
                    <div class="stx-memory-filter__preview-scroll">
                        <div class="stx-memory-filter__preview-stack">
                            ${buildPreviewColumn(CHANNEL_LABELS[0]!, memoryText, stats.memoryChars)}
                            ${buildPreviewColumn(CHANNEL_LABELS[1]!, contextText, stats.contextChars)}
                            ${buildPreviewColumn(CHANNEL_LABELS[2]!, excludedText, stats.excludedChars)}
                        </div>
                        <div class="stx-memory-filter__source-line">可用楼层：${floorRange}</div>
                    </div>
                </section>
            </div>

            <div class="stx-memory-filter__flow">
                <div>
                    <div class="stx-memory-filter__flow-title">统一接入流程</div>
                    <p>内容从聊天到成为干净记忆的完整流程</p>
                </div>
                ${buildFlowNode('●', '聊天楼层', '原始对话内容')}
                <span class="stx-memory-filter__flow-arrow">→</span>
                ${buildFlowNode('▼', '记忆过滤器', '筛选与分类处理', true)}
                <span class="stx-memory-filter__flow-arrow">→</span>
                ${buildFlowNode('⌘', '自动总结 / 接管 / 梦境 / 向量 / Prompt', '多通道处理与利用')}
                <span class="stx-memory-filter__flow-arrow">→</span>
                ${buildFlowNode('▣', '干净记忆', '结构化长期存储')}
            </div>
        </section>
    `;
}

/**
 * 功能：构建过滤模式按钮。
 * @param item 模式元信息。
 * @param currentMode 当前模式。
 * @returns 模式按钮 HTML。
 */
function buildModeButton(item: MemoryFilterModeMeta, currentMode: string): string {
    const active = currentMode === item.key || (currentMode === 'jsonpath' && item.key === 'json');
    return `
        <button class="stx-memory-filter__mode${active ? ' is-active' : ''}" data-action="memory-filter-set-mode" data-mode="${escapeAttr(item.key)}">
            <span>${escapeHtml(item.icon)}</span>
            <b>${escapeHtml(item.label)}</b>
        </button>
    `;
}

/**
 * 功能：构建规则分栏。
 * @param meta 分栏元信息。
 * @param rules 当前分栏规则。
 * @returns 规则分栏 HTML。
 */
function buildRuleColumn(meta: MemoryFilterChannelMeta, rules: Array<Record<string, unknown>>, selectedRuleId: string): string {
    const visibleRules = rules.length > 0 ? rules : [];
    return `
        <section class="stx-memory-filter__rule-column ${escapeAttr(meta.className)}">
            <div class="stx-memory-filter__rule-head">
                <span>${escapeHtml(meta.title)}</span>
                <b>${visibleRules.length}</b>
                <button type="button" data-action="memory-filter-add-rule" data-channel="${escapeAttr(meta.key)}" aria-label="添加规则">＋ 添加</button>
            </div>
            <div class="stx-memory-filter__rule-list">
                ${visibleRules.length > 0 ? visibleRules.map((rule) => buildRuleItem(rule, meta.key, selectedRuleId)).join('') : '<div class="stx-memory-filter__rule-empty">暂无规则</div>'}
            </div>
        </section>
    `;
}

/**
 * 功能：构建单条规则。
 * @param rule 规则配置。
 * @param channel 当前分栏通道。
 * @returns 规则项 HTML。
 */
function buildRuleItem(rule: Record<string, unknown>, channel: MemoryFilterChannelMeta['key'], selectedRuleId: string): string {
    const id = String(rule.id ?? rule.name ?? rule.tagName ?? 'rule').trim();
    const name = String(rule.name ?? rule.label ?? rule.tagName ?? rule.id ?? '规则').trim();
    const mode = String(rule.mode ?? 'xml').trim();
    const priority = Number(rule.priority ?? 0);
    const enabled = rule.enabled !== false;
    const selected = id === selectedRuleId;
    return `
        <div class="stx-memory-filter__rule-item${selected ? ' is-selected' : ''}" data-content-split-rule data-rule-id="${escapeAttr(id)}" data-rule-mode="${escapeAttr(mode)}">
            <input data-rule-field="enabled" type="checkbox" style="display:none"${enabled ? ' checked' : ''}>
            <input data-rule-field="name" type="hidden" style="display:none" value="${escapeAttr(name)}">
            <input data-rule-field="channel" type="hidden" style="display:none" value="${escapeAttr(channel)}">
            <input data-rule-field="priority" type="hidden" style="display:none" value="${escapeAttr(priority)}">
            ${buildRuleModeFields(rule, mode)}
            <button class="stx-memory-filter__rule-name" type="button" data-action="memory-filter-select-rule" data-rule-id="${escapeAttr(id)}">${escapeHtml(name)}</button>
            <button class="stx-memory-filter__rule-more" type="button" data-action="memory-filter-toggle-rule" data-rule-id="${escapeAttr(id)}" aria-label="启用或停用规则">${enabled ? '●' : '○'}</button>
            <button class="stx-memory-filter__rule-remove" type="button" data-action="memory-filter-delete-rule" data-rule-id="${escapeAttr(id)}" aria-label="删除规则">×</button>
        </div>
    `;
}

/**
 * 功能：构建规则详情编辑器。
 * @param rule 当前选中规则。
 * @returns 规则详情编辑器 HTML。
 */
function buildRuleEditor(rule: Record<string, unknown> | null): string {
    if (!rule) {
        return '';
    }
    const id = String(rule.id ?? '').trim();
    const mode = String(rule.mode ?? 'xml').trim();
    const channel = normalizeChannel(rule.channel);
    return `
        <section class="stx-memory-filter__rule-editor" data-edit-rule-id="${escapeAttr(id)}" data-edit-rule-mode="${escapeAttr(mode)}">
            <div class="stx-memory-filter__rule-editor-head">
                <div>
                    <div class="stx-memory-filter__rule-editor-title">规则详情</div>
                    <p>${escapeHtml(resolveModeEditorHint(mode))}</p>
                </div>
                <button class="stx-memory-filter__primary-btn" data-action="memory-filter-save-rule" data-rule-id="${escapeAttr(id)}">保存规则</button>
            </div>
            <div class="stx-memory-filter__rule-editor-grid">
                <label>
                    <span>规则名称</span>
                    <input class="stx-memory-workbench__input" data-edit-rule-field="name" value="${escapeAttr(rule.name ?? '')}">
                </label>
                <label>
                    <span>归类目标</span>
                    <select class="stx-memory-workbench__select" data-edit-rule-field="channel">
                        <option value="memory"${channel === 'memory' ? ' selected' : ''}>进入记忆</option>
                        <option value="context"${channel === 'context' ? ' selected' : ''}>仅作参考</option>
                        <option value="excluded"${channel === 'excluded' ? ' selected' : ''}>完全排除</option>
                    </select>
                </label>
                <label>
                    <span>优先级</span>
                    <input class="stx-memory-workbench__input" data-edit-rule-field="priority" type="number" value="${escapeAttr(rule.priority ?? '0')}">
                </label>
                <label class="stx-memory-filter__rule-editor-check">
                    <span>启用规则</span>
                    ${buildSharedBoxCheckbox({ id: `stx-memory-filter-editor-enabled-${escapeAttr(id)}`, appearance: 'check', inputAttributes: { 'data-edit-rule-field': 'enabled', checked: rule.enabled !== false } })}
                </label>
                ${buildModeEditorFields(rule, mode)}
            </div>
        </section>
    `;
}

/**
 * 功能：构建不同模式的规则编辑字段。
 * @param rule 当前规则。
 * @param mode 当前模式。
 * @returns 编辑字段 HTML。
 */
function buildModeEditorFields(rule: Record<string, unknown>, mode: string): string {
    if (mode === 'delimiter') {
        return `
            <label class="is-wide">
                <span>分隔符列表</span>
                <input class="stx-memory-workbench__input" data-edit-rule-field="delimiters" value="${escapeAttr(Array.isArray(rule.delimiters) ? rule.delimiters.join(', ') : '')}" placeholder="例如：---, ###">
            </label>
            <label class="stx-memory-filter__rule-editor-check">
                <span>保留分隔符</span>
                ${buildSharedBoxCheckbox({ id: `stx-memory-filter-editor-keep-${escapeAttr(rule.id ?? '')}`, appearance: 'check', inputAttributes: { 'data-edit-rule-field': 'keepDelimiter', checked: rule.keepDelimiter === true } })}
            </label>
        `;
    }
    if (mode === 'regex') {
        return `
            <label class="is-wide">
                <span>正则表达式</span>
                <input class="stx-memory-workbench__input" data-edit-rule-field="regex" value="${escapeAttr(rule.regex ?? '')}" placeholder="填写正则表达式">
            </label>
            <label>
                <span>标志</span>
                <input class="stx-memory-workbench__input" data-edit-rule-field="flags" value="${escapeAttr(rule.flags ?? 'g')}">
            </label>
            <label>
                <span>捕获组</span>
                <input class="stx-memory-workbench__input" data-edit-rule-field="captureGroup" type="number" min="0" value="${escapeAttr(rule.captureGroup ?? '0')}">
            </label>
        `;
    }
    if (mode === 'markdown') {
        return `
            <label class="is-wide">
                <span>Markdown 策略</span>
                <select class="stx-memory-workbench__select" data-edit-rule-field="markdownStrategy">
                    <option value="heading_or_hr"${rule.markdownStrategy === 'heading_or_hr' ? ' selected' : ''}>标题或分隔线</option>
                    <option value="heading"${rule.markdownStrategy === 'heading' ? ' selected' : ''}>标题块</option>
                    <option value="hr"${rule.markdownStrategy === 'hr' ? ' selected' : ''}>分隔线块</option>
                </select>
            </label>
        `;
    }
    if (mode === 'json') {
        return `
            <label class="is-wide">
                <span>JSON 路径</span>
                <input class="stx-memory-workbench__input" data-edit-rule-field="jsonPath" value="${escapeAttr(rule.jsonPath ?? '$')}" placeholder="例如：$ 或 $.content">
            </label>
        `;
    }
    return `
        <label>
            <span>标签名</span>
            <input class="stx-memory-workbench__input" data-edit-rule-field="tagName" value="${escapeAttr(rule.tagName ?? rule.name ?? '')}" placeholder="例如：story">
        </label>
        <label>
            <span>别名</span>
            <input class="stx-memory-workbench__input" data-edit-rule-field="aliases" value="${escapeAttr(Array.isArray(rule.aliases) ? rule.aliases.join(', ') : '')}" placeholder="逗号分隔">
        </label>
        <label>
            <span>匹配模式</span>
            <select class="stx-memory-workbench__select" data-edit-rule-field="patternMode">
                <option value=""${rule.patternMode ? '' : ' selected'}>无</option>
                <option value="prefix"${rule.patternMode === 'prefix' ? ' selected' : ''}>前缀</option>
                <option value="regex"${rule.patternMode === 'regex' ? ' selected' : ''}>正则</option>
            </select>
        </label>
        <label class="is-wide">
            <span>额外匹配</span>
            <input class="stx-memory-workbench__input" data-edit-rule-field="pattern" value="${escapeAttr(rule.pattern ?? '')}" placeholder="可选，配合匹配模式使用">
        </label>
    `;
}

/**
 * 功能：解析不同模式的编辑提示。
 * @param mode 当前模式。
 * @returns 编辑提示。
 */
function resolveModeEditorHint(mode: string): string {
    if (mode === 'delimiter') return '配置用于切分内容的分隔符。';
    if (mode === 'regex') return '配置正则表达式、标志和捕获组。';
    if (mode === 'markdown') return '配置 Markdown 标题或分隔线的切分策略。';
    if (mode === 'json') return '配置从 JSON 中读取内容的路径。';
    return '配置 XML 标签名、别名和可选匹配条件。';
}

/**
 * 功能：构建不同过滤模式需要保存的隐藏字段。
 * @param rule 规则配置。
 * @param mode 过滤模式。
 * @returns 隐藏字段 HTML。
 */
function buildRuleModeFields(rule: Record<string, unknown>, mode: string): string {
    if (mode === 'delimiter') {
        const delimiters = Array.isArray(rule.delimiters) ? rule.delimiters.join(', ') : '';
        return `
            <input data-rule-field="delimiters" type="hidden" style="display:none" value="${escapeAttr(delimiters)}">
            <input data-rule-field="keepDelimiter" type="checkbox" style="display:none"${rule.keepDelimiter === true ? ' checked' : ''}>
        `;
    }
    if (mode === 'regex') {
        return `
            <input data-rule-field="regex" type="hidden" style="display:none" value="${escapeAttr(rule.regex ?? '')}">
            <input data-rule-field="flags" type="hidden" style="display:none" value="${escapeAttr(rule.flags ?? 'g')}">
            <input data-rule-field="captureGroup" type="hidden" style="display:none" value="${escapeAttr(rule.captureGroup ?? '0')}">
        `;
    }
    if (mode === 'markdown') {
        return `<input data-rule-field="markdownStrategy" type="hidden" style="display:none" value="${escapeAttr(rule.markdownStrategy ?? 'heading_or_hr')}">`;
    }
    if (mode === 'json') {
        return `<input data-rule-field="jsonPath" type="hidden" style="display:none" value="${escapeAttr(rule.jsonPath ?? '$')}">`;
    }
    return `
        <input data-rule-field="tagName" type="hidden" style="display:none" value="${escapeAttr(rule.tagName ?? rule.name ?? '')}">
        <input data-rule-field="aliases" type="hidden" style="display:none" value="${escapeAttr(Array.isArray(rule.aliases) ? rule.aliases.join(', ') : '')}">
        <input data-rule-field="pattern" type="hidden" style="display:none" value="${escapeAttr(rule.pattern ?? '')}">
        <input data-rule-field="patternMode" type="hidden" style="display:none" value="${escapeAttr(rule.patternMode ?? '')}">
    `;
}

/**
 * 功能：构建预览分区。
 * @param meta 分区元信息。
 * @param text 预览文本。
 * @param charCount 字符数。
 * @returns 预览分区 HTML。
 */
function buildPreviewColumn(meta: MemoryFilterChannelMeta, text: string, charCount: number): string {
    const segmentCount = text ? text.split(/\n{2,}/).filter(Boolean).length : 0;
    return `
        <section class="stx-memory-filter__preview-card ${escapeAttr(meta.className)}">
            <div class="stx-memory-filter__preview-title">
                <span>${escapeHtml(meta.icon)}</span>
                <div>
                    <b>${escapeHtml(meta.title)}</b>
                    <small>${escapeHtml(meta.subtitle)}</small>
                </div>
                <em>${escapeHtml(String(charCount))} 字 · ${escapeHtml(String(segmentCount))} 段落</em>
            </div>
            <pre>${escapeHtml(text || '点击测试过滤后，这里会显示对应分类的内容。')}</pre>
        </section>
    `;
}

/**
 * 功能：构建统计卡片。
 * @param label 标签文本。
 * @param value 字符数。
 * @param className 样式类名。
 * @returns 统计卡片 HTML。
 */
function buildStatCard(label: string, value: number, className: string): string {
    return `
        <div class="stx-memory-filter__stat ${escapeAttr(className)}">
            <span>${escapeHtml(label)}</span>
            <b>${escapeHtml(String(value))} 字</b>
        </div>
    `;
}

/**
 * 功能：构建流程节点。
 * @param icon 节点图标。
 * @param title 节点标题。
 * @param subtitle 节点说明。
 * @param active 是否为当前节点。
 * @returns 流程节点 HTML。
 */
function buildFlowNode(icon: string, title: string, subtitle: string, active: boolean = false): string {
    return `
        <div class="stx-memory-filter__flow-node${active ? ' is-active' : ''}">
            <span>${escapeHtml(icon)}</span>
            <div>
                <b>${escapeHtml(title)}</b>
                <small>${escapeHtml(subtitle)}</small>
            </div>
        </div>
    `;
}

/**
 * 功能：统计预览内容字符数。
 * @param memoryText 进入记忆文本。
 * @param contextText 仅作参考文本。
 * @param excludedText 完全排除文本。
 * @returns 预览统计。
 */
function buildPreviewStats(memoryText: string, contextText: string, excludedText: string): MemoryFilterPreviewStats {
    const memoryChars = memoryText.length;
    const contextChars = contextText.length;
    const excludedChars = excludedText.length;
    return {
        memoryChars,
        contextChars,
        excludedChars,
        totalChars: memoryChars + contextChars + excludedChars,
    };
}

function normalizeChannel(value: unknown): string {
    const channel = String(value ?? '').trim();
    if (channel === 'primary') return 'memory';
    if (channel === 'hint') return 'context';
    return channel;
}
