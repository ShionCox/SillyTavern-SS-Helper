import sys

content = """                        ${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `
                            <button class="stx-memory-workbench__list-item${entry.entryId === state.selectedEntryId ? ' is-active' : ''}" data-select-entry="${escapeAttr(entry.entryId)}">
                                <h4>${escapeHtml(entry.title)}</h4>
                                <div class="stx-memory-workbench__meta">${escapeHtml(typeMap.get(entry.entryType)?.label || entry.entryType)} · ${escapeHtml(entry.category)}</div>
                                <div class="stx-memory-workbench__detail-clamp">${escapeHtml(entry.summary || entry.detail || '暂无内容')}</div>
                                <div class="stx-memory-workbench__badge-row">
                                    ${(entry.tags ?? []).slice(0, 3).map((tag: string): string => `<span class="stx-memory-workbench__badge">${escapeHtml(tag)}</span>`).join('')}
                                    ${(entry.tags ?? []).length > 3 ? `<span class="stx-memory-workbench__badge">+${entry.tags!.length - 3}</span>` : ''}
                                </div>
                            </button>
                        `).join('') : '<div class="stx-memory-workbench__empty">没有找到匹配的记忆条目。</div>'}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden;">
                    <div style="display:flex; flex-direction:row; height:100%; width:100%;">
                        <!-- 主编辑区（左侧） -->
                        <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
                            <div class="stx-memory-workbench__field" style="margin-bottom:0;">
                                <input class="stx-memory-workbench__input" id="stx-memory-entry-title" value="${escapeAttr(entryDraft.title ?? '')}" style="font-size:20px; font-weight:700; border:none; background:transparent; padding:0; border-bottom: 2px solid var(--mw-line);" placeholder="输入条目标题…">
                            </div>
                            <div class="stx-memory-workbench__field-stack">
                                <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">摘要速览</label>
                                <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-summary" style="min-height:72px" placeholder="用于快速浏览和回忆的短摘要">${escapeHtml(entryDraft.summary ?? '')}</textarea>
                            </div>
                            <div class="stx-memory-workbench__field-stack" style="flex:1;">
                                <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">正文细节</label>
                                <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-detail" style="flex:1; min-height:240px;" placeholder="用于记录更完整、更可信的现实细节">${escapeHtml(entryDraft.detail ?? '')}</textarea>
                            </div>
                            ${dynamicFields ? `<div class="stx-memory-workbench__card" style="margin-top:0;"><div class="stx-memory-workbench__panel-title" style="margin-bottom:8px;">结构化事实编辑</div><div class="stx-memory-workbench__form-grid">${dynamicFields}</div></div>` : ''}
                        </div>

                        <!-- 元数据侧边栏（右侧） -->
                        <div style="width:340px; background:rgba(17, 19, 24, 0.4); border-left:1px solid var(--mw-line); display:flex; flex-direction:column;">
                            <div class="stx-memory-workbench__toolbar" style="padding:16px; border-bottom:1px solid var(--mw-line); justify-content:flex-end; background:rgba(0,0,0,0.2);">
                                <button class="stx-memory-workbench__button" data-action="save-entry" data-entry-id="${escapeAttr(selectedEntry?.entryId ?? '')}"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
                                ${selectedEntry ? `<button class="stx-memory-workbench__ghost-btn is-warn" style="color:var(--mw-warn); border-color:transparent;" data-action="delete-entry" data-entry-id="${escapeAttr(selectedEntry.entryId)}"><i class="fa-solid fa-trash"></i> 移除</button>` : ''}
                            </div>
                            <div style="padding:16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
                                <div class="stx-memory-workbench__card">
                                    <div class="stx-memory-workbench__panel-title">系统属性</div>
                                    <div class="stx-memory-workbench__form-grid" style="grid-template-columns:1fr; gap:12px;">
                                        <div class="stx-memory-workbench__field-stack">
                                            <label>类型 (Type)</label>
                                            <select class="stx-memory-workbench__select" id="stx-memory-entry-type">
                                                ${snapshot.entryTypes.map((item: MemoryEntryType): string => `<option value="${escapeAttr(item.key)}"${item.key === (entryDraft.entryType ?? selectedEntryType?.key ?? 'other') ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                                            </select>
                                        </div>
                                        <div class="stx-memory-workbench__field-stack">
                                            <label>分类 (Category)</label>
                                            <input class="stx-memory-workbench__input" id="stx-memory-entry-category" value="${escapeAttr(entryDraft.category ?? selectedEntryType?.category ?? '其他')}" placeholder="输入分类">
                                        </div>
                                        <div class="stx-memory-workbench__field-stack">
                                            <label>标签 (Tags)</label>
                                            <input class="stx-memory-workbench__input" id="stx-memory-entry-tags" value="${escapeAttr((entryDraft.tags ?? []).join(', '))}" placeholder="多个标签请用逗号分隔">
                                        </div>
                                    </div>
                                </div>
                                <div class="stx-memory-workbench__card">
                                    <div class="stx-memory-workbench__panel-title">角色引用</div>
                                    <div class="stx-memory-workbench__stack">
                                        ${bindingRows || '<div class="stx-memory-workbench__empty">此条目为孤立节点，尚未被任何真实角色绑定。</div>'}
                                    </div>
                                </div>
                                <div class="stx-memory-workbench__card">
                                    <div class="stx-memory-workbench__panel-title">数据检视</div>
                                    ${selectedEntry ? `
                                        <div class="stx-memory-workbench__info-list">
                                            <div class="stx-memory-workbench__info-row"><span>条目 ID</span><strong style="font-family:monospace; font-size:11px;">${escapeHtml(selectedEntry.entryId)}</strong></div>
                                            <div class="stx-memory-workbench__info-row"><span>最近更新</span><strong>${escapeHtml(formatTimestamp(selectedEntry.updatedAt))}</strong></div>
                                            <div class="stx-memory-workbench__info-row"><span>来源总结</span><strong>${escapeHtml(selectedEntry.sourceSummaryIds.length > 0 ? selectedEntry.sourceSummaryIds.join('、') : '暂无')}</strong></div>
                                            <div class="stx-memory-workbench__info-row"><span>结构层事实</span><strong>${escapeHtml(summarizeDetailPayload(selectedEntry.detailPayload))}</strong></div>
                                        </div>
                                        <div class="stx-memory-workbench__stack" style="margin-top:12px; border-top:1px dashed var(--mw-line); padding-top:12px;">
                                            ${inspectorMarkup}
                                        </div>
                                        <details style="margin-top:12px; cursor:pointer;" title="点击展开以查看底层对象">
                                            <summary style="font-size:11px; color:var(--mw-muted); user-select:none;">查看原始 JSON</summary>
                                            <pre style="margin-top:8px; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; overflow-x:auto;">${escapeHtml(stringifyData(selectedEntry))}</pre>
                                        </details>
                                    ` : '<div class="stx-memory-workbench__empty">新建状态下在左侧填写完毕并保存后，此处将自动解析出实体的检视信息。</div>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}"""

import pathlib

file_path = pathlib.Path(r'g:\vue\SS-Helper\MemoryOS\src\ui\workbenchTabs\tabEntries.ts')
old_text = file_path.read_text(encoding='utf-8')

# Find exactly what's broken at the end of the `buildEntriesViewMarkup` function.
# Look for the last matching parts.
marker = "${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `"
if marker in old_text:
    parts = old_text.split(marker)
    # We want to keep the FIRST part, and replace from marker to `}\n` with our new content.
    # Actually wait, the file has other functions AFTER buildEntriesViewMarkup!
    # Let's inspect old_text.
    part1 = parts[0]
    part2 = parts[1]
    
    # In part2, we need to find the `\n}` that closes the function, or rather:
    #                     </div>
    #                 </div>
    #             </div>
    #         </section>
    #     `;
    # }
    
    # We can just do a regex or explicit string replace.
    target_str = '''                        ${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `
                    </div>
                </div>
            </div>
        </section>
    `;
}'''
    target_str_crlf = target_str.replace('\\n', '\\r\\n')
    
    if target_str in old_text:
        new_text = old_text.replace(target_str, content)
        file_path.write_text(new_text, encoding='utf-8')
        print("Success: Replaced using LF standard")
    elif target_str_crlf in old_text:
        new_text = old_text.replace(target_str_crlf, content)
        file_path.write_text(new_text, encoding='utf-8')
        print("Success: Replaced using CRLF standard")
    else:
        # manual replace
        end_idx = old_text.find("}\\n/**\\n * 功能：构建条目的角色绑定列表。")
        if end_idx == -1:
            end_idx = old_text.find("}\\r\\n/**\\r\\n * 功能：构建条目的角色绑定列表。")
            
        if end_idx != -1:
            # We want to replace from parts[0] + marker to end_idx + 1 (to include the bracket)
            new_text = old_text[:old_text.find(marker)] + content + old_text[end_idx+1:]
            file_path.write_text(new_text, encoding='utf-8')
            print("Success: Replaced using boundary markers")
        else:
            print("Could not find the end of the function.")
else:
    print("Marker not found in file")
