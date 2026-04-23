/**
 * 功能：渲染「内容拆分台」五模式工作台。
 */

import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';
import { DEFAULT_CONTENT_SPLIT_RULES, type ContentSplitMode, type ContentSplitRule } from '../../config/content-tag-registry';
import type { ClassifiedContentBlock } from '../../memory-takeover/content-block-classifier';
import { escapeHtml } from '../editorShared';
import { escapeAttr, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import {
    resolveContentLabKindLabel,
    resolveContentLabRoleLabel,
    resolveContentLabSourceLabel,
    resolveContentLabText,
} from '../workbenchLocale';

const CONTENT_SPLIT_MODES: Array<{ mode: ContentSplitMode; label: string; icon: string }> = [
    { mode: 'xml', label: 'XML', icon: 'fa-code' },
    { mode: 'delimiter', label: '分隔符', icon: 'fa-link' },
    { mode: 'regex', label: '正则', icon: 'fa-wand-magic-sparkles' },
    { mode: 'markdown', label: 'Markdown', icon: 'fa-list' },
    { mode: 'jsonpath', label: 'JSONPath', icon: 'fa-route' },
];

/**
 * 功能：渲染内容拆分台整体视图。
 */
export function buildContentLabViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const lab = snapshot.contentLabSnapshot;
    if (!lab.loaded) {
        return `
            <section class="stx-memory-workbench__view stx-content-lab"${state.currentView !== 'content-lab' ? ' hidden' : ''}>
                <div class="stx-memory-workbench__view-head">
                    <div class="stx-memory-workbench__section-title">${escapeHtml(resolveContentLabText('section_title'))}</div>
                </div>
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__empty">${state.contentLabTabLoading ? '正在加载内容实验室配置与楼层快照...' : '进入本页后将按需加载内容拆分规则与聊天楼层。'}</div>
                </div>
            </section>
        `;
    }

    return `
        <section class="stx-memory-workbench__view stx-content-lab"${state.currentView !== 'content-lab' ? ' hidden' : ''}>
            <input id="stx-content-lab-mode" type="hidden" value="${escapeAttr(state.contentLabSplitMode)}">
            ${buildModeTabs(state)}
            <div class="stx-content-lab__workspace">
                <div class="stx-content-lab__pane stx-content-lab__pane--source">
                    ${buildSourcePanel(lab.availableFloors, state, lab.previewFloor)}
                </div>
                <div class="stx-content-lab__pane stx-content-lab__pane--rules">
                    ${buildRulePanel(state)}
                </div>
                <div class="stx-content-lab__pane stx-content-lab__pane--preview">
                    ${buildResultPreview(state, lab.previewFloor)}
                    ${buildValidationPanel(state)}
                </div>
            </div>
            ${buildBlockTable(state)}
        </section>
    `;
}

function buildModeTabs(state: WorkbenchState): string {
    return `
        <div class="stx-content-lab__topbar">
            <div class="stx-content-lab__mode-tabs" role="tablist">
                ${CONTENT_SPLIT_MODES.map((item) => `
                    <button class="stx-content-lab__mode-tab${state.contentLabSplitMode === item.mode ? ' is-active' : ''}" data-action="content-lab-set-mode" data-mode="${escapeAttr(item.mode)}">
                        <i class="fa-solid ${escapeAttr(item.icon)}"></i>
                        <span>${escapeHtml(item.label)}</span>
                    </button>
                `).join('')}
                <span class="stx-content-lab__mode-hint"><i class="fa-solid fa-sparkles"></i> 支持多种内容切分策略</span>
            </div>
            <label class="stx-content-lab__global-switch">
                ${buildSharedBoxCheckbox({
                    id: 'stx-content-lab-enable-content-split',
                    appearance: 'check',
                    inputAttributes: { checked: state.contentLabEnableContentSplit },
                })}
                <span class="stx-content-lab__global-switch-text">
                    <strong>${escapeHtml(resolveContentLabText('floor_split_switch'))}</strong>
                    <small>${escapeHtml(resolveContentLabText('floor_split_switch_desc'))}</small>
                </span>
            </label>
        </div>
    `;
}

function buildSourcePanel(
    floors: Array<{ floor: number; role: string; charCount: number }>,
    state: WorkbenchState,
    previewFloor?: import('../../memory-takeover/content-block-pipeline').RawFloorRecord,
): string {
    const rawText = previewFloor?.originalText ?? '';
    return `
        <div class="stx-content-lab__panel">
            <div class="stx-content-lab__panel-head">
                <strong>源内容</strong>
                <div class="stx-content-lab__mini-actions">
                    <button class="stx-content-lab__icon-btn" data-action="content-lab-import-rules" title="导入配置"><i class="fa-solid fa-upload"></i></button>
                    <button class="stx-content-lab__icon-btn" data-action="content-lab-export-rules" title="导出配置"><i class="fa-solid fa-download"></i></button>
                    <button class="stx-content-lab__icon-btn" data-action="content-lab-reset-rules" title="重置"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="stx-content-lab__source-toolbar">
                <select class="stx-memory-workbench__select" id="stx-content-lab-preview-source-mode">
                    <option value="content"${state.contentLabPreviewSourceMode === 'content' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('preview_source_content'))}</option>
                    <option value="raw_visible_text"${state.contentLabPreviewSourceMode === 'raw_visible_text' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('preview_source_raw_visible_text'))}</option>
                </select>
                <input class="stx-memory-workbench__input" id="stx-content-lab-start-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('start_floor_placeholder'))}" value="${escapeAttr(state.contentLabStartFloor)}">
                <input class="stx-memory-workbench__input" id="stx-content-lab-end-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('end_floor_placeholder'))}" value="${escapeAttr(state.contentLabEndFloor)}">
                <input class="stx-memory-workbench__input" id="stx-content-lab-selected-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('selected_floor_placeholder'))}" value="${escapeAttr(state.contentLabSelectedFloor)}">
            </div>
            <div class="stx-content-lab__source-actions">
                <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-preview-floor"${state.contentLabPreviewLoading ? ' disabled' : ''}>
                    <i class="fa-solid fa-eye"></i> ${escapeHtml(state.contentLabPreviewLoading ? resolveContentLabText('preview_loading') : resolveContentLabText('preview_floor'))}
                </button>
                <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-preview-range"${state.contentLabPreviewLoading ? ' disabled' : ''}>
                    <i class="fa-solid fa-layer-group"></i> ${escapeHtml(state.contentLabPreviewLoading ? resolveContentLabText('preview_range_loading') : resolveContentLabText('preview_range'))}
                </button>
                <button class="stx-content-lab__icon-btn" data-action="content-lab-refresh-preview" title="刷新最新拆分结果"${state.contentLabPreviewLoading ? ' disabled' : ''}>
                    <i class="fa-solid fa-arrows-rotate"></i>
                </button>
            </div>
            <pre class="stx-content-lab__source-code">${escapeHtml(rawText || resolveContentLabText('raw_content_empty'))}</pre>
            <div class="stx-content-lab__source-stats">
                <span>总字符 ${escapeHtml(String(rawText.length))}</span>
                <span>总行数 ${escapeHtml(String(rawText ? rawText.split('\n').length : 0))}</span>
                <span>${floors.length > 0 ? `可用楼层 ${floors[0]!.floor}-${floors[floors.length - 1]!.floor}` : resolveContentLabText('load_chat_hint')}</span>
            </div>
        </div>
    `;
}

function buildRulePanel(state: WorkbenchState): string {
    const allRules = Array.isArray(state.contentLabRules) ? state.contentLabRules : DEFAULT_CONTENT_SPLIT_RULES;
    const modeRules = allRules.filter((rule: ContentSplitRule): boolean => rule.mode === state.contentLabSplitMode);
    return `
        <div class="stx-content-lab__panel">
            <div class="stx-content-lab__panel-head">
                <strong>拆分规则配置</strong>
                <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-add-split-rule"><i class="fa-solid fa-plus"></i> ${escapeHtml(resolveContentLabText('add_rule'))}</button>
            </div>
            <div class="stx-content-lab__rule-list">
                ${modeRules.length > 0 ? modeRules.map((rule: ContentSplitRule) => buildRuleEditor(rule)).join('') : `<div class="stx-memory-workbench__empty">当前模式暂无规则。</div>`}
            </div>
            ${buildCleanupPanel(state)}
        </div>
    `;
}

function buildRuleEditor(rule: ContentSplitRule): string {
    return `
        <div class="stx-content-lab__rule-card" data-content-split-rule="true" data-rule-id="${escapeAttr(rule.id)}" data-rule-mode="${escapeAttr(rule.mode)}">
            <div class="stx-content-lab__rule-head stx-content-lab__rule-head--${escapeAttr(rule.mode)}">
                ${fieldInput('规则名', 'label', rule.label)}
                ${fieldSelect('默认通道', 'channel', buildChannelOptions(rule.channel))}
                ${fieldInput('优先级', 'priority', String(rule.priority ?? 0), 'number', 'stx-content-lab__priority-input')}
                ${buildModeFields(rule)}
                ${buildSharedBoxCheckbox({
                    id: `stx-content-rule-enabled-${rule.id}`,
                    appearance: 'check',
                    containerClassName: 'stx-content-lab__rule-enabled',
                    inputAttributes: { 'data-rule-field': 'enabled', checked: rule.enabled },
                })}
                <button class="stx-content-lab__icon-btn" data-action="content-lab-delete-split-rule" data-rule-id="${escapeAttr(rule.id)}" title="删除规则"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

function buildModeFields(rule: ContentSplitRule): string {
    if (rule.mode === 'xml') {
        return `
            ${fieldInput('XML 节点', 'tagName', rule.tagName ?? '')}
            ${fieldInput('别名', 'aliases', (rule.aliases ?? []).join(', '))}
            ${fieldInput('模式', 'pattern', rule.pattern ?? '')}
            <label class="stx-content-lab__field"><span>模式类型</span><select class="stx-memory-workbench__select" data-rule-field="patternMode">
                <option value="">无</option>
                <option value="prefix"${rule.patternMode === 'prefix' ? ' selected' : ''}>前缀</option>
                <option value="regex"${rule.patternMode === 'regex' ? ' selected' : ''}>正则</option>
            </select></label>
        `;
    }
    if (rule.mode === 'delimiter') {
        return `
            ${fieldInput('分隔符列表', 'delimiters', (rule.delimiters ?? []).join(', '))}
            <label class="stx-content-lab__checkbox-field">
                ${buildSharedBoxCheckbox({
                    id: `stx-content-rule-keep-${rule.id}`,
                    appearance: 'check',
                    inputAttributes: { 'data-rule-field': 'keepDelimiter', checked: rule.keepDelimiter },
                })}
                <span>保留分隔符</span>
            </label>
        `;
    }
    if (rule.mode === 'regex') {
        return `
            ${fieldInput('表达式', 'regex', rule.regex ?? '')}
            ${fieldInput('Flags', 'flags', rule.flags ?? 'g')}
            ${fieldInput('捕获组', 'captureGroup', String(rule.captureGroup ?? 0), 'number')}
        `;
    }
    if (rule.mode === 'markdown') {
        return `
            <label class="stx-content-lab__field"><span>切分方式</span><select class="stx-memory-workbench__select" data-rule-field="markdownStrategy">
                <option value="heading_or_hr"${rule.markdownStrategy !== 'heading' && rule.markdownStrategy !== 'hr' ? ' selected' : ''}>标题或分隔线</option>
                <option value="heading"${rule.markdownStrategy === 'heading' ? ' selected' : ''}>标题</option>
                <option value="hr"${rule.markdownStrategy === 'hr' ? ' selected' : ''}>分隔线</option>
            </select></label>
        `;
    }
    return fieldInput('JSONPath', 'jsonPath', rule.jsonPath ?? '$');
}

function buildCleanupPanel(state: WorkbenchState): string {
    return `
        <div class="stx-content-lab__advanced">
            <div class="stx-content-lab__cleanup-grid">
                ${cleanupSwitch('stx-content-lab-cleanup-trim', '忽略空白', state.contentLabCleanupTrimWhitespace)}
                ${cleanupSwitch('stx-content-lab-cleanup-strip-wrapper', '去除包裹', state.contentLabCleanupStripWrapper)}
                ${cleanupSwitch('stx-content-lab-cleanup-drop-empty', '过滤空段', state.contentLabCleanupDropEmptyBlocks)}
                <label><span>最大分段长度</span><input class="stx-memory-workbench__input" id="stx-content-lab-max-length" type="number" min="0" value="${escapeAttr(state.contentLabCleanupMaxBlockLength)}"></label>
                <label><span>最小分段长度</span><input class="stx-memory-workbench__input" id="stx-content-lab-min-length" type="number" min="0" value="${escapeAttr(state.contentLabCleanupMinBlockLength)}"></label>
            </div>
        </div>
    `;
}

function buildResultPreview(state: WorkbenchState, previewFloor?: import('../../memory-takeover/content-block-pipeline').RawFloorRecord): string {
    const blocks = state.contentLabBlocks;
    const validRate = blocks.length > 0
        ? Math.round((blocks.filter((block: ClassifiedContentBlock): boolean => !block.diagnostics?.length).length / blocks.length) * 100)
        : 0;
    return `
        <div class="stx-content-lab__panel">
            <div class="stx-content-lab__panel-head"><strong>拆分结果预览</strong></div>
            <div class="stx-content-lab__summary-grid">
                <div><span>预计生成</span><strong>${escapeHtml(String(blocks.length))}</strong><small>段</small></div>
                <div><span>平均长度</span><strong>${escapeHtml(String(resolveAverageLength(blocks)))}</strong></div>
                <div><span>有效率</span><strong class="is-good">${escapeHtml(String(validRate))}%</strong></div>
            </div>
            <div class="stx-content-lab__result-list">
                ${blocks.length > 0 ? blocks.map((block: ClassifiedContentBlock, index: number) => buildResultCard(block, index, state.contentLabSplitMode)).join('') : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveContentLabText('block_preview_empty'))}</div>`}
            </div>
            ${previewFloor ? `<div class="stx-content-lab__floor-meta">楼层 ${escapeHtml(String(previewFloor.floor))} / ${escapeHtml(resolveContentLabRoleLabel(previewFloor.originalRole))} / ${escapeHtml(resolveContentLabSourceLabel(previewFloor.originalTextSource || 'unknown'))}</div>` : ''}
        </div>
    `;
}

function buildResultCard(block: ClassifiedContentBlock, index: number, mode: ContentSplitMode): string {
    return `
        <div class="stx-content-lab__result-card" data-content-block-index="${escapeAttr(String(index))}" data-block-start="${escapeAttr(String(block.startOffset))}" data-block-end="${escapeAttr(String(block.endOffset))}">
            <div class="stx-content-lab__result-head">
                <strong>#${escapeHtml(String(index + 1).padStart(3, '0'))} ${escapeHtml(block.title || block.blockId)}</strong>
                <span class="stx-content-lab__channel-badge is-${escapeAttr(resolveChannelClass(block))}">${escapeHtml(resolveBlockChannelLabel(block))}</span>
                <span>长度 ${escapeHtml(String(block.rawText.length))}</span>
            </div>
            <p>${escapeHtml(block.rawText)}</p>
            <div class="stx-content-lab__result-actions">
                <button type="button" data-action="content-lab-toggle-block-view" data-block-index="${escapeAttr(String(index))}"><i class="fa-solid fa-eye"></i> 查看</button>
                <button type="button" data-action="content-lab-copy-block" data-block-index="${escapeAttr(String(index))}"><i class="fa-regular fa-copy"></i> 复制</button>
                <button type="button" data-action="content-lab-locate-block" data-block-index="${escapeAttr(String(index))}"><i class="fa-solid fa-location-crosshairs"></i> 定位原文</button>
            </div>
        </div>
    `;
}

function buildValidationPanel(state: WorkbenchState): string {
    const diagnostics = state.contentLabBlocks.flatMap((block: ClassifiedContentBlock): string[] => block.diagnostics ?? []);
    return `
        <div class="stx-content-lab__panel stx-content-lab__panel--compact">
            <div class="stx-content-lab__panel-head"><strong>规则验证 / 调试</strong></div>
            <div class="stx-content-lab__debug-list">
                ${diagnostics.length > 0
                    ? diagnostics.map((item: string) => `<div class="is-warn">${escapeHtml(item)}</div>`).join('')
                    : `<div class="is-pass">当前预览未发现规则错误。</div>`}
            </div>
        </div>
    `;
}

function buildBlockTable(state: WorkbenchState): string {
    const rows = state.contentLabBlocks.map((block: ClassifiedContentBlock, index: number) => `
        <tr>
            <td>${escapeHtml(String(index + 1))}</td>
            <td>${escapeHtml(block.title || block.blockId)}</td>
            <td><span class="stx-memory-workbench__badge">${escapeHtml(String(block.splitMode || state.contentLabSplitMode).toUpperCase())}</span></td>
            <td>${escapeHtml(String(block.startOffset))}</td>
            <td>${escapeHtml(String(block.endOffset))}</td>
            <td>${escapeHtml(String(block.rawText.length))}</td>
            <td>${escapeHtml(resolveContentLabKindLabel(block.resolvedKind))}</td>
            <td>${state.contentLabSplitMode === 'delimiter' ? buildBlockChannelSelect(block, index) : `<span class="stx-content-lab__channel-badge is-${escapeAttr(resolveChannelClass(block))}">${escapeHtml(resolveBlockChannelLabel(block))}</span>`}</td>
        </tr>
    `).join('');
    return `
        <div class="stx-content-lab__table-panel">
            <div class="stx-content-lab__table-head">
                <strong>拆分片段明细</strong>
                <span>${escapeHtml(String(state.contentLabBlocks.length))} 段</span>
            </div>
            <div class="stx-content-lab__table-scroll">
                <table class="stx-memory-workbench__table stx-content-lab__block-table">
                    <thead><tr><th>#</th><th>标题</th><th>模式</th><th>起始位置</th><th>结束位置</th><th>长度</th><th>元数据</th><th>状态</th></tr></thead>
                    <tbody>${rows || `<tr><td colspan="8">${escapeHtml(resolveContentLabText('block_preview_empty'))}</td></tr>`}</tbody>
                </table>
            </div>
        </div>
    `;
}

function fieldInput(label: string, field: string, value: string, type = 'text', className = ''): string {
    return `<label class="stx-content-lab__field"><span>${escapeHtml(label)}</span><input class="stx-memory-workbench__input ${escapeAttr(className)}" data-rule-field="${escapeAttr(field)}" type="${escapeAttr(type)}" value="${escapeAttr(value)}"></label>`;
}

function fieldSelect(label: string, field: string, options: string): string {
    return `<label class="stx-content-lab__field"><span>${escapeHtml(label)}</span><select class="stx-memory-workbench__select" data-rule-field="${escapeAttr(field)}">${options}</select></label>`;
}

function buildBlockChannelSelect(block: ClassifiedContentBlock, index: number): string {
    const channel = resolveChannelClass(block) as 'primary' | 'hint' | 'excluded';
    const blockIndex = resolveLocalBlockIndex(block, index);
    return `
        <select class="stx-memory-workbench__select stx-content-lab__block-channel-select" data-content-block-channel="true" data-block-index="${escapeAttr(String(blockIndex))}" aria-label="分块通道">
            ${buildChannelOptions(channel)}
        </select>
    `;
}

function resolveLocalBlockIndex(block: ClassifiedContentBlock, fallbackIndex: number): number {
    const match = String(block.blockId ?? '').match(/_(\d+)$/);
    if (!match) {
        return fallbackIndex;
    }
    return Math.max(0, Number(match[1]) - 1);
}

function cleanupSwitch(id: string, label: string, checked: boolean): string {
    return `
        <label class="stx-content-lab__checkbox-field">
            ${buildSharedBoxCheckbox({ id, appearance: 'check', inputAttributes: { checked } })}
            <span>${escapeHtml(label)}</span>
        </label>
    `;
}

function buildChannelOptions(channel: string | undefined): string {
    return `
        <option value="primary"${channel === 'primary' || !channel ? ' selected' : ''}>主正文</option>
        <option value="hint"${channel === 'hint' ? ' selected' : ''}>辅助上下文</option>
        <option value="excluded"${channel === 'excluded' ? ' selected' : ''}>排除</option>
    `;
}

function resolveAverageLength(blocks: ClassifiedContentBlock[]): number {
    if (blocks.length === 0) {
        return 0;
    }
    return Math.round(blocks.reduce((sum: number, block: ClassifiedContentBlock): number => sum + block.rawText.length, 0) / blocks.length);
}

function resolveChannelClass(block: ClassifiedContentBlock): string {
    if (block.includeInPrimaryExtraction) return 'primary';
    if (block.includeAsHint) return 'hint';
    return 'excluded';
}

function resolveBlockChannelLabel(block: ClassifiedContentBlock): string {
    if (block.includeInPrimaryExtraction) return '主正文';
    if (block.includeAsHint) return '辅助';
    return '排除';
}
