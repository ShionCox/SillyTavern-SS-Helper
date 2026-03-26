import { escapeHtml } from '../editorShared';
import type { MemoryEntryType } from '../../types';
import { escapeAttr, formatTypeFieldsJson, type WorkbenchSnapshot, type WorkbenchState } from './shared';

/**
 * 构建类型工坊视图。
 */
export function buildTypesViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState, selectedType: MemoryEntryType | null): string {
    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'types' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">类型工坊 / <span>TYPES</span></div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-type"><i class="fa-solid fa-plus"></i> 新建架构</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__type-list">
                    ${snapshot.entryTypes.map((item: MemoryEntryType): string => `
                        <button class="stx-memory-workbench__list-item${item.key === state.selectedTypeKey ? ' is-active' : ''}" data-select-type="${escapeAttr(item.key)}">
                            <h4>${escapeHtml(item.label)}</h4>
                            <div class="stx-memory-workbench__meta">${item.key} · UID: SYS/USR</div>
                            <div class="stx-memory-workbench__badge-row">
                                <span class="stx-memory-workbench__badge">${item.injectToSystem ? '系统核入' : '独立存取'}</span>
                                ${item.builtIn ? '<span class="stx-memory-workbench__badge" style="border-color:#38bdf8;color:#38bdf8">预置核心</span>' : '<span class="stx-memory-workbench__badge is-warn">客制类型</span>'}
                            </div>
                        </button>
                    `).join('')}
                </div>
                <div class="stx-memory-workbench__editor">
                    <div class="stx-memory-workbench__toolbar" style="justify-content:flex-end;">
                        <button class="stx-memory-workbench__button" data-action="save-type"><i class="fa-solid fa-floppy-disk"></i> 保存架构约束</button>
                        ${selectedType && !selectedType.builtIn ? `<button class="stx-memory-workbench__ghost-btn" data-action="delete-type" data-type-key="${escapeAttr(selectedType.key)}"><i class="fa-solid fa-trash"></i> 销毁架构</button>` : ''}
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>架构键 (Key)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-key" value="${escapeAttr(selectedType?.key ?? '')}" ${selectedType?.builtIn ? 'readonly' : ''} placeholder="如: faction">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>展示层名 (Label)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-label" value="${escapeAttr(selectedType?.label ?? '')}" placeholder="如: 派系">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>继承分类 (Category)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-category" value="${escapeAttr(selectedType?.category ?? '其他')}" placeholder="体系分类">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>界面标识 (Icon)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-icon" value="${escapeAttr(selectedType?.icon ?? '')}" placeholder="FontAwesome">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>能量特征色 (Accent Color)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-color" value="${escapeAttr(selectedType?.accentColor ?? '')}" placeholder="十六进制色值">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>架构职能 (Description)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-description" value="${escapeAttr(selectedType?.description ?? '')}" placeholder="此类型的系统功能">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__card" style="margin-top:8px;">
                        <div class="stx-memory-workbench__panel-title">底层运作约束 / SYSTEM RULES</div>
                        <div style="display:flex;gap:16px;font-size:12px;margin-top:8px;">
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="stx-memory-type-system"${selectedType?.injectToSystem ? ' checked' : ''}> 绝对注入主 prompt system 层</label>
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="stx-memory-type-bindable"${selectedType?.bindableToRole !== false ? ' checked' : ''}> 允许子进程 (角色) 主动绑定</label>
                        </div>
                    </div>
                    <div class="stx-memory-workbench__field-stack" style="margin-top:8px;">
                        <label>动态约束字段 / JSON SCHEMA</label>
                        <textarea class="stx-memory-workbench__textarea" style="font-family:monospace" id="stx-memory-type-fields" placeholder='[{"key":"region","label":"所属区域","kind":"text"}]'>${escapeHtml(formatTypeFieldsJson(selectedType?.fields ?? []))}</textarea>
                    </div>
                </div>
            </div>
        </section>
    `;
}
