import { escapeHtml } from '../editorShared';
import type { ActorMemoryProfile, MemoryEntry, MemoryEntryType, RoleEntryMemory } from '../../types';
import {
    escapeAttr,
    formatDisplayValue,
    formatTimestamp,
    readRecordPath,
    stringifyData,
    summarizeDetailPayload,
    toRecord,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';

interface InspectorSection {
    title: string;
    rows: Array<{ label: string; value: unknown }>;
}

/**
 * 功能：构建条目中心视图。
 * @param filteredEntries 过滤后的条目列表。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param typeMap 类型映射。
 * @param entryDraft 条目草稿。
 * @param selectedEntry 当前选中条目。
 * @param selectedEntryType 当前选中类型。
 * @param dynamicFields 动态字段 HTML。
 * @returns 页面 HTML。
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
    const bindingRows = buildEntryBindingRows(snapshot, selectedEntry);
    const inspectorSections = selectedEntry ? buildInspectorSections(selectedEntry) : [];
    const inspectorMarkup = selectedEntry
        ? inspectorSections.map((section: InspectorSection): string => renderInspectorSection(section)).join('')
        : '<div class="stx-memory-workbench__empty">保存条目后，这里会显示结构化事实层、角色引用和时间信息。</div>';

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'entries' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">条目中心</div>
                <div class="stx-memory-workbench__toolbar">
                    <input class="stx-memory-workbench__input" id="stx-memory-entry-query" placeholder="搜索标题、摘要、正文或标签" style="width:240px" value="${escapeAttr(state.entryQuery)}">
                    <button class="stx-memory-workbench__button" data-action="create-entry"><i class="fa-solid fa-plus"></i> 新建条目</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack">
                    <div class="stx-memory-workbench__list" data-entry-list-scroll="true">
                        ${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `
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
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:row;">
                        <!-- 主编辑区（左侧） -->
                        <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
                            <div class="stx-memory-workbench__field" style="margin-bottom:0;">
                                <input class="stx-memory-workbench__input" id="stx-memory-entry-title" value="${escapeAttr(entryDraft.title ?? '')}" style="font-size:20px; font-weight:700; border:none; background:transparent; padding:0; border-bottom: 2px solid var(--mw-line);" placeholder="输入条目标题…">
                            </div>
                            <div class="stx-memory-workbench__field-stack">
                                <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">摘要速览</label>
                                <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-summary" style="min-height:72px" placeholder="用于快速浏览和回忆的短摘要">${escapeHtml(entryDraft.summary ?? '')}</textarea>
                            </div>
                            <div class="stx-memory-workbench__field-stack">
                                <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">正文细节</label>
                                <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-detail" style="min-height:120px;" placeholder="用于记录更完整、更可信的现实细节">${escapeHtml(entryDraft.detail ?? '')}</textarea>
                            </div>
                            ${dynamicFields ? `<div class="stx-memory-workbench__card" style="margin-top:0;"><div class="stx-memory-workbench__panel-title" style="margin-bottom:8px;">结构化事实编辑</div><div class="stx-memory-workbench__form-grid">${dynamicFields}</div></div>` : ''}
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

                        <!-- 元数据侧边栏（右侧） -->
                        <div style="width:340px; background:rgba(17, 19, 24, 0.4); border-left:1px solid var(--mw-line); display:flex; flex-direction:column;">
                            <div class="stx-memory-workbench__toolbar" style="padding:16px; border-bottom:1px solid var(--mw-line); justify-content:flex-end; background:rgba(0,0,0,0.2);">
                                <button class="stx-memory-workbench__button" data-action="save-entry" data-entry-id="${escapeAttr(selectedEntry?.entryId ?? '')}"><i class="fa-solid fa-floppy-disk"></i> 保存</button>
                                ${selectedEntry ? `<button class="stx-memory-workbench__ghost-btn is-warn" style="color:var(--mw-warn); border-color:transparent;" data-action="delete-entry" data-entry-id="${escapeAttr(selectedEntry.entryId)}"><i class="fa-solid fa-trash"></i> 移除</button>` : ''}
                            </div>
                            <div style="padding:16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:16px; min-height:0;">
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
                            </div>
                        </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：构建条目的角色绑定列表。
 * @param snapshot 工作台快照。
 * @param selectedEntry 当前条目。
 * @returns 绑定列表 HTML。
 */
function buildEntryBindingRows(snapshot: WorkbenchSnapshot, selectedEntry: MemoryEntry | null): string {
    if (!selectedEntry) {
        return '';
    }
    const actorMap = new Map(snapshot.actors.map((actor: ActorMemoryProfile): [string, ActorMemoryProfile] => [actor.actorKey, actor]));
    const bindings = snapshot.roleMemories.filter((memory: RoleEntryMemory): boolean => memory.entryId === selectedEntry.entryId);
    return bindings.map((binding: RoleEntryMemory): string => {
        const actor = actorMap.get(binding.actorKey);
        return `
            <article class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(actor?.displayName || binding.actorKey)}</div>
                <div class="stx-memory-workbench__info-list">
                    <div class="stx-memory-workbench__info-row"><span>角色键</span><strong>${escapeHtml(binding.actorKey)}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>当前记忆强度</span><strong>${escapeHtml(String(binding.memoryPercent))}%</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>遗忘状态</span><strong>${escapeHtml(binding.forgotten ? '已遗忘' : '活跃')}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>最近更新时间</span><strong>${escapeHtml(formatTimestamp(binding.updatedAt))}</strong></div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * 功能：构建结构化检视分组。
 * @param entry 当前条目。
 * @returns 分组列表。
 */
function buildInspectorSections(entry: MemoryEntry): InspectorSection[] {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const sections: InspectorSection[] = [];

    if (entry.entryType === 'relationship') {
        sections.push({
            title: '关系事实层',
            rows: [
                { label: '源角色', value: payload.sourceActorKey ?? fields.sourceActorKey },
                { label: '目标角色', value: payload.targetActorKey ?? fields.targetActorKey },
                { label: '关系标签', value: fields.relationTag },
                { label: '参与角色', value: payload.participants ?? fields.participants },
                { label: '关系现状', value: payload.state ?? fields.state },
                { label: '信任度', value: payload.trust },
                { label: '亲近度', value: payload.affection },
                { label: '紧张度', value: payload.tension },
                { label: '未解冲突', value: payload.unresolvedConflict ?? fields.unresolvedConflict },
                { label: '关键节点', value: payload.milestones ?? fields.milestones },
            ],
        });
    } else if (entry.entryType === 'actor_profile') {
        sections.push({
            title: '角色画像',
            rows: [
                { label: '别名', value: readRecordPath(fields, 'aliases') || payload.aliases },
                { label: '身份事实', value: readRecordPath(fields, 'identityFacts') || payload.identityFacts },
                { label: '来源事实', value: readRecordPath(fields, 'originFacts') || payload.originFacts },
                { label: '长期特征', value: readRecordPath(fields, 'traits') || payload.traits },
            ],
        });
    } else if (entry.entryType === 'world_core_setting' || entry.entryType === 'world_hard_rule' || entry.entryType === 'world_global_state') {
        sections.push({
            title: '世界事实层',
            rows: [
                { label: '作用范围', value: payload.scope ?? fields.scope },
                { label: '当前状态', value: payload.state ?? fields.state },
                { label: '替代线索', value: payload.supersededBy ?? fields.supersededBy },
                { label: '影响说明', value: payload.impact ?? fields.impact },
            ],
        });
    } else if (entry.entryType === 'scene_shared_state') {
        sections.push({
            title: '场景共享状态',
            rows: [
                { label: '地点', value: payload.location ?? readRecordPath(fields, 'location') },
                { label: '可见范围', value: payload.visibilityScope ?? readRecordPath(fields, 'visibilityScope') },
                { label: '参与者', value: payload.participants ?? readRecordPath(fields, 'participants') },
            ],
        });
    } else if (entry.entryType === 'actor_visible_event') {
        sections.push({
            title: '可见事件',
            rows: [
                { label: '参与者', value: payload.participants ?? readRecordPath(fields, 'participants') },
                { label: '地点', value: payload.location ?? readRecordPath(fields, 'location') },
                { label: '结果', value: payload.outcome ?? readRecordPath(fields, 'outcome') },
            ],
        });
    }

    sections.push({
        title: '通用事实层',
        rows: [
            { label: '摘要', value: entry.summary },
            { label: '正文', value: entry.detail },
            { label: '标签', value: entry.tags },
            { label: 'sourceSummaryIds', value: entry.sourceSummaryIds },
        ],
    });

    return sections;
}

/**
 * 功能：渲染结构化检视分组。
 * @param section 分组信息。
 * @returns 分组 HTML。
 */
function renderInspectorSection(section: InspectorSection): string {
    const rows = section.rows
        .filter((row): boolean => {
            if (Array.isArray(row.value)) {
                return row.value.length > 0;
            }
            if (row.value && typeof row.value === 'object') {
                return Object.keys(toRecord(row.value)).length > 0;
            }
            return String(row.value ?? '').trim().length > 0;
        })
        .map((row): string => `
            <div class="stx-memory-workbench__info-row">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(formatDisplayValue(row.value))}</strong>
            </div>
        `)
        .join('');

    if (!rows) {
        return '';
    }

    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(section.title)}</div>
            <div class="stx-memory-workbench__info-list">${rows}</div>
        </div>
    `;
}
