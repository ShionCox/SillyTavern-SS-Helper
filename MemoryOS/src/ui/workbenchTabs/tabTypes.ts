import { escapeHtml } from '../editorShared';
import type { MemoryEntryType } from '../../types';
import { escapeAttr, formatTypeFieldsJson, type WorkbenchSnapshot, type WorkbenchState } from './shared';

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
                <div class="stx-memory-workbench__section-title">类型工坊</div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-type"><i class="fa-solid fa-plus"></i> 新建类型</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__type-list">
                    ${snapshot.entryTypes.map((item: MemoryEntryType): string => `
                        <button class="stx-memory-workbench__list-item${item.key === state.selectedTypeKey ? ' is-active' : ''}" data-select-type="${escapeAttr(item.key)}">
                            <h4>${escapeHtml(item.label)}</h4>
                            <div class="stx-memory-workbench__meta">键名：${escapeHtml(item.key)} · ${item.builtIn ? '系统内置' : '用户自定义'}</div>
                            <div class="stx-memory-workbench__badge-row">
                                <span class="stx-memory-workbench__badge">${item.injectToSystem ? '注入系统上下文' : '仅作条目记录'}</span>
                                ${item.builtIn ? '<span class="stx-memory-workbench__badge" style="border-color:#38bdf8;color:#38bdf8">预置核心类型</span>' : '<span class="stx-memory-workbench__badge is-warn">自定义类型</span>'}
                            </div>
                        </button>
                    `).join('')}
                </div>
                <div class="stx-memory-workbench__editor">
                    <div class="stx-memory-workbench__toolbar" style="justify-content:flex-end;">
                        <button class="stx-memory-workbench__button" data-action="save-type"><i class="fa-solid fa-floppy-disk"></i> 保存类型</button>
                        ${selectedType && !selectedType.builtIn ? `<button class="stx-memory-workbench__ghost-btn" data-action="delete-type" data-type-key="${escapeAttr(selectedType.key)}"><i class="fa-solid fa-trash"></i> 删除类型</button>` : ''}
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>类型键</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-key" value="${escapeAttr(selectedType?.key ?? '')}" ${selectedType?.builtIn ? 'readonly' : ''} placeholder="请输入类型键名">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>显示名称</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-label" value="${escapeAttr(selectedType?.label ?? '')}" placeholder="例如：派系">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>分类</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-category" value="${escapeAttr(selectedType?.category ?? '其他')}" placeholder="输入分类">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>图标</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-icon" value="${escapeAttr(selectedType?.icon ?? '')}" placeholder="请输入图标类名">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>强调色</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-color" value="${escapeAttr(selectedType?.accentColor ?? '')}" placeholder="十六进制颜色值">
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>说明</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-type-description" value="${escapeAttr(selectedType?.description ?? '')}" placeholder="描述该类型的用途">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__card" style="margin-top:8px;">
                        <div class="stx-memory-workbench__panel-title">系统规则</div>
                        <div style="display:flex;gap:16px;font-size:12px;margin-top:8px;">
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="stx-memory-type-system"${selectedType?.injectToSystem ? ' checked' : ''}> 注入到系统提示词</label>
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="stx-memory-type-bindable"${selectedType?.bindableToRole !== false ? ' checked' : ''}> 允许绑定到角色</label>
                        </div>
                    </div>
                    <div class="stx-memory-workbench__field-stack" style="margin-top:8px;">
                        <label>动态字段定义</label>
                        <textarea class="stx-memory-workbench__textarea" style="font-family:monospace" id="stx-memory-type-fields" placeholder='[{"key":"区域","label":"所属区域","kind":"text"}]'>${escapeHtml(formatTypeFieldsJson(selectedType?.fields ?? []))}</textarea>
                    </div>
                </div>
            </div>
        </section>
    `;
}
