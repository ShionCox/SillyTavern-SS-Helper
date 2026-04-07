/**
 * 功能：渲染「内容拆分实验室」Tab 视图。
 * 左侧：规则编辑区；右侧：预览区。
 */

import { escapeHtml } from '../editorShared';
import {
    escapeAttr,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';
import type { ContentBlockPolicy } from '../../config/content-tag-registry';
import type { ClassifiedContentBlock } from '../../memory-takeover/content-block-classifier';
import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';
import {
    resolveContentLabKindLabel,
    resolveContentLabReasonCodeLabel,
    resolveContentLabRoleLabel,
    resolveContentLabSourceLabel,
    resolveContentLabText,
} from '../workbenchLocale';

/**
 * 功能：渲染内容拆分实验室整体视图。
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
    const registry = lab.tagRegistry;
    const floors = lab.availableFloors;

    return `
        <section class="stx-memory-workbench__view stx-content-lab"${state.currentView !== 'content-lab' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveContentLabText('section_title'))}</div>
            </div>
            <div class="stx-memory-workbench__split stx-content-lab__split">
                <!-- 左侧：规则编辑区 -->
                <div class="stx-content-lab__column stx-content-lab__column--editor">
                    ${buildTagRegistryTable(registry, state)}
                    ${buildUnknownTagPolicyEditor(state)}
                    ${buildClassifierToggles(state)}
                    <div class="stx-memory-workbench__toolbar" style="margin-top:12px;gap:8px;">
                        <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-add-rule">
                            <i class="fa-solid fa-plus"></i> ${escapeHtml(resolveContentLabText('add_rule'))}
                        </button>
                        <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-reset-rules">
                            <i class="fa-solid fa-rotate-left"></i> ${escapeHtml(resolveContentLabText('reset_rules'))}
                        </button>
                        <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-export-rules">
                            <i class="fa-solid fa-download"></i> ${escapeHtml(resolveContentLabText('export_rules'))}
                        </button>
                        <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-import-rules">
                            <i class="fa-solid fa-upload"></i> ${escapeHtml(resolveContentLabText('import_rules'))}
                        </button>
                    </div>
                </div>
                <!-- 右侧：预览区 -->
                <div class="stx-content-lab__column stx-content-lab__column--preview">
                    ${buildFloorSelector(floors, state)}
                    ${buildRawContentPreview(state, lab.previewFloor)}
                    ${buildBlockPreview(state)}
                    ${buildChannelPreview(state)}
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：渲染标签规则表。
 */
function buildTagRegistryTable(registry: ContentBlockPolicy[], state: WorkbenchState): string {
    if (registry.length === 0) {
        return `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('tag_registry'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveContentLabText('no_tag_rules'))}</div>
            </div>
        `;
    }
    const kindOptions: ContentBlockPolicy['kind'][] = ['story_primary', 'story_secondary', 'summary', 'tool_artifact', 'thought', 'meta_commentary', 'instruction', 'unknown'];
    const rows = registry.map((rule, idx) => {
        const isEditing = state.contentLabEditingRuleIndex === idx;
        const kindSelect = `
            <select class="stx-memory-workbench__select stx-content-lab__table-select" data-rule-kind="${idx}">
                ${kindOptions.map((kind) => `<option value="${escapeAttr(kind)}"${rule.kind === kind ? ' selected' : ''}>${escapeHtml(resolveContentLabKindLabel(kind))}</option>`).join('')}
            </select>
        `;
        const patternModeValue = rule.patternMode === 'regex' || rule.patternMode === 'prefix'
            ? rule.patternMode
            : '';
        const patternModeSelect = `
            <select class="stx-memory-workbench__select stx-content-lab__table-select" data-rule-pattern-mode="${idx}">
                <option value="">${escapeHtml(resolveContentLabText('pattern_mode_none'))}</option>
                <option value="prefix"${patternModeValue === 'prefix' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('pattern_mode_prefix'))}</option>
                <option value="regex"${patternModeValue === 'regex' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('pattern_mode_regex'))}</option>
            </select>
        `;
        const primaryCheckboxId = `stx-content-lab-rule-primary-${idx}`;
        const hintCheckboxId = `stx-content-lab-rule-hint-${idx}`;
        return `
            <tr>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? `<input class="stx-memory-workbench__input stx-content-lab__table-input" data-rule-tag-name="${idx}" value="${escapeAttr(rule.tagName)}">`
                    : `<span class="stx-content-lab__table-text">${escapeHtml(rule.tagName)}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? `<input class="stx-memory-workbench__input stx-content-lab__table-input" data-rule-aliases="${idx}" value="${escapeAttr(rule.aliases.join(', '))}">`
                    : `<span class="stx-content-lab__table-text">${escapeHtml(rule.aliases.join(', '))}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? kindSelect
                    : `<span class="stx-memory-workbench__badge">${escapeHtml(resolveContentLabKindLabel(rule.kind))}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? `<input class="stx-memory-workbench__input stx-content-lab__table-input" data-rule-pattern="${idx}" value="${escapeAttr(rule.pattern ?? '')}" placeholder="^think(?:[_-].+)?$ / tableedit">`
                    : `<span class="stx-content-lab__table-text">${escapeHtml(rule.pattern || resolveContentLabText('empty_value'))}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? patternModeSelect
                    : `<span class="stx-memory-workbench__badge">${escapeHtml(resolveContentLabText(rule.patternMode === 'prefix' ? 'pattern_mode_prefix' : rule.patternMode === 'regex' ? 'pattern_mode_regex' : 'pattern_mode_none'))}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? `<input class="stx-memory-workbench__input stx-content-lab__table-input" data-rule-priority="${idx}" type="number" value="${escapeAttr(String(rule.priority ?? 0))}">`
                    : `<span class="stx-content-lab__table-text">${escapeHtml(String(rule.priority ?? 0))}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell stx-content-lab__table-cell--toggle">
                        ${isEditing
                    ? buildSharedBoxCheckbox({
                        id: primaryCheckboxId,
                        appearance: 'check',
                        containerClassName: 'stx-content-lab__table-checkbox',
                        inputAttributes: {
                            'data-rule-primary': idx,
                            checked: rule.includeInPrimaryExtraction,
                        },
                    })
                    : `<span class="stx-content-lab__table-flag">${rule.includeInPrimaryExtraction ? '✅' : '❌'}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell stx-content-lab__table-cell--toggle">
                        ${isEditing
                    ? buildSharedBoxCheckbox({
                        id: hintCheckboxId,
                        appearance: 'check',
                        containerClassName: 'stx-content-lab__table-checkbox',
                        inputAttributes: {
                            'data-rule-hint': idx,
                            checked: rule.includeAsHint,
                        },
                    })
                    : `<span class="stx-content-lab__table-flag">${rule.includeAsHint ? '✅' : '❌'}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell">
                        ${isEditing
                    ? `<input class="stx-memory-workbench__input stx-content-lab__table-input" data-rule-notes="${idx}" value="${escapeAttr(rule.notes)}">`
                    : `<span class="stx-content-lab__table-text">${escapeHtml(rule.notes)}</span>`}
                    </div>
                </td>
                <td>
                    <div class="stx-content-lab__table-cell stx-content-lab__table-actions">
                        <button class="stx-memory-workbench__ghost-btn" data-action="${isEditing ? 'content-lab-save-rule' : 'content-lab-edit-rule'}" data-rule-index="${idx}" style="padding:2px 8px;">
                            <i class="fa-solid ${isEditing ? 'fa-floppy-disk' : 'fa-pen'}"></i> ${escapeHtml(resolveContentLabText(isEditing ? 'save' : 'edit'))}
                        </button>
                        <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-delete-rule" data-rule-index="${idx}" style="padding:2px 8px;border-color:rgba(239,68,68,0.35);color:var(--mw-warn);">
                            <i class="fa-solid fa-trash"></i> ${escapeHtml(resolveContentLabText('delete'))}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('tag_registry'))}</div>
            <div class="stx-content-lab__table-scroll">
                <table class="stx-memory-workbench__table stx-content-lab__table">
                    <colgroup>
                        <col style="width:160px;">
                        <col style="width:220px;">
                        <col style="width:150px;">
                        <col style="width:240px;">
                        <col style="width:140px;">
                        <col style="width:110px;">
                        <col style="width:120px;">
                        <col style="width:120px;">
                        <col style="width:220px;">
                        <col style="width:180px;">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>${escapeHtml(resolveContentLabText('tag_name'))}</th>
                            <th>${escapeHtml(resolveContentLabText('aliases'))}</th>
                            <th>${escapeHtml(resolveContentLabText('kind'))}</th>
                            <th>${escapeHtml(resolveContentLabText('pattern'))}</th>
                            <th>${escapeHtml(resolveContentLabText('pattern_mode'))}</th>
                            <th>${escapeHtml(resolveContentLabText('priority'))}</th>
                            <th>${escapeHtml(resolveContentLabText('primary_extraction'))}</th>
                            <th>${escapeHtml(resolveContentLabText('hint'))}</th>
                            <th>${escapeHtml(resolveContentLabText('notes'))}</th>
                            <th>${escapeHtml(resolveContentLabText('actions'))}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染未知标签策略编辑区。
 */
function buildUnknownTagPolicyEditor(state: WorkbenchState): string {
    const kindOptions = ['unknown', 'meta_commentary', 'story_secondary', 'story_primary', 'summary', 'tool_artifact', 'thought', 'instruction'];
    const optionsHtml = kindOptions.map((k) =>
        `<option value="${escapeAttr(k)}"${state.contentLabUnknownTagDefaultKind === k ? ' selected' : ''}>${escapeHtml(resolveContentLabKindLabel(k))}</option>`
    ).join('');

    return `
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('unknown_tag_policy'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row">
                    <span>${escapeHtml(resolveContentLabText('default_kind'))}</span>
                    <select class="stx-memory-workbench__select" id="stx-content-lab-unknown-kind" style="width:180px;">
                        ${optionsHtml}
                    </select>
                </div>
                <div class="stx-memory-workbench__checkbox-row">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-content-lab-unknown-hint',
                        appearance: 'check',
                        inputAttributes: {
                            checked: state.contentLabUnknownTagAllowHint,
                        },
                    })}
                    <label for="stx-content-lab-unknown-hint">${escapeHtml(resolveContentLabText('unknown_allow_hint'))}</label>
                </div>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染分类器开关。
 */
function buildClassifierToggles(state: WorkbenchState): string {
    return `
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('classifier_toggles'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__checkbox-row">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-content-lab-enable-rule',
                        appearance: 'check',
                        inputAttributes: {
                            checked: state.contentLabEnableRuleClassifier,
                        },
                    })}
                    <label for="stx-content-lab-enable-rule">${escapeHtml(resolveContentLabText('enable_rule_classifier'))}</label>
                </div>
                <div class="stx-memory-workbench__checkbox-row">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-content-lab-enable-meta',
                        appearance: 'check',
                        inputAttributes: {
                            checked: state.contentLabEnableMetaKeywordDetection,
                        },
                    })}
                    <label for="stx-content-lab-enable-meta">${escapeHtml(resolveContentLabText('enable_meta_detection'))}</label>
                </div>
                <div class="stx-memory-workbench__checkbox-row">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-content-lab-enable-tool',
                        appearance: 'check',
                        inputAttributes: {
                            checked: state.contentLabEnableToolArtifactDetection,
                        },
                    })}
                    <label for="stx-content-lab-enable-tool">${escapeHtml(resolveContentLabText('enable_tool_detection'))}</label>
                </div>
                <div class="stx-memory-workbench__checkbox-row">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-content-lab-enable-ai',
                        appearance: 'check',
                        inputAttributes: {
                            checked: state.contentLabEnableAIClassifier,
                        },
                    })}
                    <label for="stx-content-lab-enable-ai">${escapeHtml(resolveContentLabText('enable_ai_classifier'))}</label>
                </div>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染楼层选择器。
 */
function buildFloorSelector(floors: Array<{ floor: number; role: string; charCount: number }>, state: WorkbenchState): string {
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('floor_selector'))}</div>
            <div class="stx-content-lab__toolbar-scroll">
                <div class="stx-memory-workbench__toolbar stx-content-lab__toolbar-line">
                <select class="stx-memory-workbench__select" id="stx-content-lab-preview-source-mode" style="width:180px;">
                    <option value="content"${state.contentLabPreviewSourceMode === 'content' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('preview_source_content'))}</option>
                    <option value="raw_visible_text"${state.contentLabPreviewSourceMode === 'raw_visible_text' ? ' selected' : ''}>${escapeHtml(resolveContentLabText('preview_source_raw_visible_text'))}</option>
                </select>
                <input class="stx-memory-workbench__input" id="stx-content-lab-start-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('start_floor_placeholder'))}" value="${escapeAttr(state.contentLabStartFloor)}" style="width:110px;">
                <input class="stx-memory-workbench__input" id="stx-content-lab-end-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('end_floor_placeholder'))}" value="${escapeAttr(state.contentLabEndFloor)}" style="width:110px;">
                <input class="stx-memory-workbench__input" id="stx-content-lab-selected-floor" type="number" min="1" placeholder="${escapeAttr(resolveContentLabText('selected_floor_placeholder'))}" value="${escapeAttr(state.contentLabSelectedFloor)}" style="width:110px;">
                <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-preview-floor"${state.contentLabPreviewLoading ? ' disabled' : ''}>
                    <i class="fa-solid fa-eye"></i> ${escapeHtml(state.contentLabPreviewLoading ? resolveContentLabText('preview_loading') : resolveContentLabText('preview_floor'))}
                </button>
                <button class="stx-memory-workbench__ghost-btn" data-action="content-lab-preview-range"${state.contentLabPreviewLoading ? ' disabled' : ''}>
                    <i class="fa-solid fa-layer-group"></i> ${escapeHtml(state.contentLabPreviewLoading ? resolveContentLabText('preview_range_loading') : resolveContentLabText('preview_range'))}
                </button>
                </div>
            </div>
            ${floors.length > 0 ? `
                <div style="margin-top:8px;font-size:12px;opacity:.7;">
                    ${escapeHtml(resolveContentLabText('available_floors'))}：${floors.length} ${escapeHtml(resolveContentLabText('floor_unit'))}（${floors[0]!.floor} - ${floors[floors.length - 1]!.floor}）
                </div>
            ` : `<div class="stx-memory-workbench__empty" style="margin-top:8px;">${escapeHtml(resolveContentLabText('load_chat_hint'))}</div>`}
        </div>
    `;
}

/**
 * 功能：渲染原始内容预览。
 */
function buildRawContentPreview(state: WorkbenchState, previewFloor?: import('../../memory-takeover/content-block-pipeline').RawFloorRecord): string {
    if (!previewFloor) {
        return `
            <div class="stx-memory-workbench__card" style="margin-top:12px;">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('raw_content'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveContentLabText('raw_content_empty'))}</div>
            </div>
        `;
    }
    return `
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('raw_content'))}</div>
            <div class="stx-content-lab__metrics-scroll">
                <div class="stx-content-lab__metrics-grid">
                    ${buildMetricCard(resolveContentLabText('floor_number'), String(previewFloor.floor))}
                    ${buildMetricCard(resolveContentLabText('role'), resolveContentLabRoleLabel(previewFloor.originalRole))}
                    ${buildMetricCard(resolveContentLabText('raw_text_basis'), escapeHtml(resolveContentLabText(previewFloor.originalTextMode === 'raw_visible_text' ? 'preview_source_raw_visible_text' : 'preview_source_content')), true)}
                    ${buildMetricCard(resolveContentLabText('source'), resolveContentLabSourceLabel(previewFloor.originalTextSource || 'unknown'))}
                    ${buildMetricCard(resolveContentLabText('char_count'), String(previewFloor.originalText.length))}
                    ${buildMetricCard(resolveContentLabText('block_count'), String(previewFloor.parsedBlocks.length))}
                    ${buildMetricCard(resolveContentLabText('has_primary_story'), previewFloor.hasPrimaryStory ? '是' : '否')}
                    ${buildMetricCard(resolveContentLabText('hint_only'), previewFloor.hasHintOnly ? '是' : '否')}
                    ${buildMetricCard(resolveContentLabText('excluded_only'), previewFloor.hasExcludedOnly ? '是' : '否')}
                </div>
            </div>
            <details class="stx-memory-workbench__details" style="margin-top:8px;">
                <summary>${escapeHtml(resolveContentLabText('raw_text'))}</summary>
                <pre style="white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;font-size:12px;">${escapeHtml(previewFloor.originalText)}</pre>
            </details>
        </div>
    `;
}

/**
 * 功能：渲染分块预览。
 */
function buildBlockPreview(state: WorkbenchState): string {
    const blocks = state.contentLabBlocks;
    if (blocks.length === 0) {
        return `
            <div class="stx-memory-workbench__card" style="margin-top:12px;">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('block_preview'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveContentLabText('block_preview_empty'))}</div>
            </div>
        `;
    }

    const blockRows = blocks.map((block) => {
        const color = resolveBlockColor(block);
        const textPreview = block.rawText.length > 120 ? block.rawText.substring(0, 120) + '…' : block.rawText;
        return `
            <div class="stx-memory-workbench__card" style="border-left:3px solid ${color};margin-bottom:8px;">
                <div class="stx-content-lab__metrics-scroll">
                    <div class="stx-content-lab__metrics-grid stx-content-lab__metrics-grid--blocks">
                        ${buildMetricCard(resolveContentLabText('block_id'), block.blockId)}
                        ${block.rawTagName ? buildMetricCard(resolveContentLabText('tag'), block.rawTagName) : ''}
                        ${buildMetricCard(resolveContentLabText('resolved_kind'), `<span class="stx-memory-workbench__badge" style="background:${color};color:#fff;">${escapeHtml(resolveContentLabKindLabel(block.resolvedKind))}</span>`, true)}
                        ${buildMetricCard(resolveContentLabText('primary_extraction'), block.includeInPrimaryExtraction ? '是' : '否')}
                        ${buildMetricCard(resolveContentLabText('hint'), block.includeAsHint ? '是' : '否')}
                        ${buildMetricCard(resolveContentLabText('reason'), block.reasonCodes.map(resolveContentLabReasonCodeLabel).join('、'))}
                    </div>
                </div>
                <div style="margin-top:4px;font-size:12px;opacity:.8;white-space:pre-wrap;word-break:break-all;">${escapeHtml(textPreview)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('block_preview'))}（${blocks.length} ${escapeHtml(resolveContentLabText('block_preview_title_suffix'))}）</div>
            <div style="max-height:400px;overflow-y:auto;">${blockRows}</div>
        </div>
    `;
}

/**
 * 功能：渲染送模三通道预览。
 */
function buildChannelPreview(state: WorkbenchState): string {
    if (!state.contentLabPrimaryPreview && !state.contentLabHintPreview && !state.contentLabExcludedPreview) {
        return `
            <div class="stx-memory-workbench__card" style="margin-top:12px;">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('channel_preview'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveContentLabText('channel_preview_empty'))}</div>
            </div>
        `;
    }

    return `
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveContentLabText('channel_preview'))}</div>
            <details class="stx-memory-workbench__details" open>
                <summary style="color:#22c55e;">${escapeHtml(resolveContentLabText('primary_channel'))}</summary>
                <pre style="white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;font-size:12px;border-left:2px solid #22c55e;padding-left:8px;margin-left:2px;">${escapeHtml(state.contentLabPrimaryPreview || `（${resolveContentLabText('empty_value')}）`)}</pre>
            </details>
            <details class="stx-memory-workbench__details" style="margin-top:8px;">
                <summary style="color:#eab308;">${escapeHtml(resolveContentLabText('hint_channel'))}</summary>
                <pre style="white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;font-size:12px;border-left:2px solid #eab308;padding-left:8px;margin-left:2px;">${escapeHtml(state.contentLabHintPreview || `（${resolveContentLabText('empty_value')}）`)}</pre>
            </details>
            <details class="stx-memory-workbench__details" style="margin-top:8px;">
                <summary style="color:#ef4444;">${escapeHtml(resolveContentLabText('excluded_channel'))}</summary>
                <pre style="white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;font-size:12px;border-left:2px solid #ef4444;padding-left:8px;margin-left:2px;">${escapeHtml(state.contentLabExcludedPreview || `（${resolveContentLabText('empty_value')}）`)}</pre>
            </details>
        </div>
    `;
}

/**
 * 功能：渲染内容实验室指标卡。
 * @param label 标签。
 * @param value 值。
 * @param allowHtml 是否允许值包含 HTML。
 * @returns HTML 片段。
 */
function buildMetricCard(label: string, value: string, allowHtml = false): string {
    return `
        <div class="stx-content-lab__metric-card">
            <span class="stx-content-lab__metric-label">${escapeHtml(label)}</span>
            <strong class="stx-content-lab__metric-value">${allowHtml ? value : escapeHtml(value)}</strong>
        </div>
    `;
}

/**
 * 功能：根据 block 分类返回对应颜色。
 */
function resolveBlockColor(block: ClassifiedContentBlock): string {
    if (block.includeInPrimaryExtraction) return '#22c55e';
    if (block.includeAsHint) return '#eab308';
    return '#ef4444';
}
