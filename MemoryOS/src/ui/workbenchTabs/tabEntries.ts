import { escapeHtml } from '../editorShared';
import type { MemoryEntry, MemoryEntryType } from '../../types';
import { escapeAttr, type WorkbenchSnapshot, type WorkbenchState } from './shared';

/**
 * 构建条目中心视图。
 */
export function buildEntriesViewMarkup(
    filteredEntries: MemoryEntry[],
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    typeMap: Map<string, MemoryEntryType>,
    entryDraft: Partial<MemoryEntry>,
    selectedEntry: MemoryEntry | null,
    selectedEntryType: MemoryEntryType | null,
    dynamicFields: string,
): string {
    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'entries' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">条目中心 / <span>ENTRIES</span></div>
                <div class="stx-memory-workbench__toolbar">
                    <input class="stx-memory-workbench__input" id="stx-memory-entry-query" placeholder="搜索关键词..." style="width:200px" value="${escapeAttr(state.entryQuery)}">
                    <button class="stx-memory-workbench__button" data-action="create-entry"><i class="fa-solid fa-plus"></i> 新建</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack">
                    <div class="stx-memory-workbench__list">
                        ${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `
                            <button class="stx-memory-workbench__list-item${entry.entryId === state.selectedEntryId ? ' is-active' : ''}" data-select-entry="${escapeAttr(entry.entryId)}">
                                <h4>${escapeHtml(entry.title)}</h4>
                                <div class="stx-memory-workbench__meta">${escapeHtml(typeMap.get(entry.entryType)?.label || entry.entryType)} · ${escapeHtml(entry.category)}</div>
                                <div class="stx-memory-workbench__badge-row">
                                    ${(entry.tags ?? []).slice(0, 3).map((tag: string): string => `<span class="stx-memory-workbench__badge">${escapeHtml(tag)}</span>`).join('')}
                                    ${(entry.tags ?? []).length > 3 ? `<span class="stx-memory-workbench__badge">+${entry.tags!.length - 3}</span>` : ''}
                                </div>
                            </button>
                        `).join('') : `<div class="stx-memory-workbench__empty">没有找到任何匹配记录。</div>`}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor">
                    <div class="stx-memory-workbench__toolbar" style="justify-content:flex-end;">
                        <button class="stx-memory-workbench__button" data-action="save-entry" data-entry-id="${escapeAttr(selectedEntry?.entryId ?? '')}"><i class="fa-solid fa-floppy-disk"></i> 写入存储块</button>
                        ${selectedEntry ? `<button class="stx-memory-workbench__ghost-btn" data-action="delete-entry" data-entry-id="${escapeAttr(selectedEntry.entryId)}"><i class="fa-solid fa-trash"></i> 彻底格式化</button>` : ''}
                    </div>
                    <div class="stx-memory-workbench__field" style="margin-bottom:12px;">
                        <label>主体标识 (Title)</label>
                        <input class="stx-memory-workbench__input" id="stx-memory-entry-title" value="${escapeAttr(entryDraft.title ?? '')}" style="font-size:16px; font-weight:700;" placeholder="索引名称">
                    </div>
                    <div class="stx-memory-workbench__form-grid">
                        <div class="stx-memory-workbench__field">
                            <label>协议类型 (Type)</label>
                            <select class="stx-memory-workbench__select" id="stx-memory-entry-type">
                                ${snapshot.entryTypes.map((item: MemoryEntryType): string => `<option value="${escapeAttr(item.key)}"${item.key === (entryDraft.entryType ?? selectedEntryType?.key ?? 'other') ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="stx-memory-workbench__field">
                            <label>分类 (Category)</label>
                            <input class="stx-memory-workbench__input" id="stx-memory-entry-category" value="${escapeAttr(entryDraft.category ?? selectedEntryType?.category ?? '其他')}" placeholder="设定层级">
                        </div>
                    </div>
                    <div class="stx-memory-workbench__field">
                        <label>关联标签 (Tags)</label>
                        <input class="stx-memory-workbench__input" id="stx-memory-entry-tags" value="${escapeAttr((entryDraft.tags ?? []).join(', '))}" placeholder="多个标签逗号分割">
                    </div>
                    <div class="stx-memory-workbench__field-stack">
                        <label>轻量摘要 (Summary)</label>
                        <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-summary" style="min-height:48px" placeholder="供前端快速扫描和提取的最简摘要">${escapeHtml(entryDraft.summary ?? '')}</textarea>
                    </div>
                    <div class="stx-memory-workbench__field-stack">
                        <label>深度载荷 (Detail Payload)</label>
                        <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-detail" placeholder="用于角色获取详细情节或设定的长本文块">${escapeHtml(entryDraft.detail ?? '')}</textarea>
                    </div>
                    ${dynamicFields ? `<div class="stx-memory-workbench__card"><div class="stx-memory-workbench__panel-title" style="margin-bottom:8px;">类型约束项</div><div class="stx-memory-workbench__form-grid">${dynamicFields}</div></div>` : ''}
                </div>
            </div>
        </section>
    `;
}
