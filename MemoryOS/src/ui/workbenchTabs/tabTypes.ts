import { escapeHtml } from '../editorShared';
import { resolveTypesWorkbenchText } from '../workbenchLocale';
import type { MemoryEntryType } from '../../types';
import { escapeAttr, formatTypeFieldsJson, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';

/**
 * 功能：构建类型工坊视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedType 当前选中类型。
 * @returns 页面 HTML。
 */
export function buildTypesViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState, selectedType: MemoryEntryType | null): string {
    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'types' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveTypesWorkbenchText('section_title'))}</div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-type"><i class="fa-solid fa-plus"></i> ${escapeHtml(resolveTypesWorkbenchText('create_type'))}</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__type-list" data-type-list-scroll="true">
                    ${snapshot.entryTypes.map((item: MemoryEntryType): string => `
                        <button class="stx-memory-workbench__list-item${item.key === state.selectedTypeKey ? ' is-active' : ''}" data-select-type="${escapeAttr(item.key)}">
                            <h4>${escapeHtml(item.label)}</h4>
                            <div class="stx-memory-workbench__meta">${escapeHtml(resolveTypesWorkbenchText('key_name'))}：${escapeHtml(item.key)} · ${escapeHtml(item.builtIn ? resolveTypesWorkbenchText('built_in') : resolveTypesWorkbenchText('user_defined'))}</div>
                            <div class="stx-memory-workbench__badge-row">
                                <span class="stx-memory-workbench__badge">${escapeHtml(item.injectToSystem ? resolveTypesWorkbenchText('inject_to_system') : resolveTypesWorkbenchText('record_only'))}</span>
                                ${item.builtIn
            ? `<span class="stx-memory-workbench__badge" style="border-color:#38bdf8;color:#38bdf8">${escapeHtml(resolveTypesWorkbenchText('preset_core_type'))}</span>`
            : `<span class="stx-memory-workbench__badge is-warn">${escapeHtml(resolveTypesWorkbenchText('custom_type'))}</span>`}
                            </div>
                        </button>
                    `).join('')}
                </div>
                <div class="stx-memory-workbench__editor">
                    <div class="stx-memory-workbench__toolbar" style="justify-content:flex-end;">
                        <button class="stx-memory-workbench__button" data-action="save-type"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(resolveTypesWorkbenchText('save_type'))}</button>
                        ${selectedType && !selectedType.builtIn ? `<button class="stx-memory-workbench__ghost-btn" data-action="delete-type" data-type-key="${escapeAttr(selectedType.key)}"><i class="fa-solid fa-trash"></i> ${escapeHtml(resolveTypesWorkbenchText('delete_type'))}</button>` : ''}
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_key'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-key" value="${escapeAttr(selectedType?.key ?? '')}" ${selectedType?.builtIn ? 'readonly' : ''} placeholder="${escapeAttr(resolveTypesWorkbenchText('type_key_placeholder'))}">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_label'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-label" value="${escapeAttr(selectedType?.label ?? '')}" placeholder="${escapeAttr(resolveTypesWorkbenchText('type_label_placeholder'))}">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_category'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-category" value="${escapeAttr(selectedType?.category ?? '其他')}" placeholder="${escapeAttr(resolveTypesWorkbenchText('type_category_placeholder'))}">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_icon'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-icon" value="${escapeAttr(selectedType?.icon ?? '')}" placeholder="${escapeAttr(resolveTypesWorkbenchText('type_icon_placeholder'))}">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_color'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-color" value="${escapeAttr(selectedType?.accentColor ?? '')}" placeholder="${escapeAttr(resolveTypesWorkbenchText('type_color_placeholder'))}">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>${escapeHtml(resolveTypesWorkbenchText('type_description'))}</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-description" value="${escapeAttr(selectedType?.description ?? '')}" placeholder="${escapeAttr(resolveTypesWorkbenchText('type_description_placeholder'))}">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__card" style="margin-top:8px;">
                        <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTypesWorkbenchText('system_rule'))}</div>
                        <div class="stx-memory-workbench__checkbox-group" style="margin-top:8px;">
                            <div class="stx-memory-workbench__checkbox-row">
                                ${buildSharedBoxCheckbox({
                                    id: 'stx-memory-type-system',
                                    appearance: 'check',
                                    inputAttributes: {
                                        checked: selectedType?.injectToSystem === true,
                                    },
                                })}
                                <label for="stx-memory-type-system">${escapeHtml(resolveTypesWorkbenchText('inject_to_system_prompt'))}</label>
                            </div>
                            <div class="stx-memory-workbench__checkbox-row">
                                ${buildSharedBoxCheckbox({
                                    id: 'stx-memory-type-bindable',
                                    appearance: 'check',
                                    inputAttributes: {
                                        checked: selectedType?.bindableToRole !== false,
                                    },
                                })}
                                <label for="stx-memory-type-bindable">${escapeHtml(resolveTypesWorkbenchText('bind_to_actor'))}</label>
                            </div>
                        </div>
                    </div>
                    <div class="stx-memory-workbench__field-stack" style="margin-top:8px;">
                        <label>${escapeHtml(resolveTypesWorkbenchText('dynamic_fields'))}</label>
                        <textarea class="stx-memory-workbench__textarea" style="font-family:monospace" id="stx-memory-type-fields" placeholder="${escapeAttr(resolveTypesWorkbenchText('field_schema_placeholder'))}">${escapeHtml(formatTypeFieldsJson(selectedType?.fields ?? []))}</textarea>
                    </div>
                </div>
            </div>
        </section>
    `;
}
