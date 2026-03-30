import { escapeHtml } from '../editorShared';
import { resolveEntryTypeLabel } from '../workbenchLocale';
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
    const inspectorSections = selectedEntry ? buildInspectorSections(selectedEntry, snapshot) : [];
    const inspectorMarkup = selectedEntry
        ? inspectorSections.map((section: InspectorSection): string => renderInspectorSection(section)).join('')
        : '<div class="stx-memory-workbench__empty">保存条目后，这里会显示结构化事实、绑定关系和调试信息。</div>';

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
                                <div class="stx-memory-workbench__meta">${escapeHtml(typeMap.get(entry.entryType)?.label || resolveEntryTypeLabel(entry.entryType))} · ${escapeHtml(entry.category)}</div>
                                <div class="stx-memory-workbench__detail-clamp">${escapeHtml(entry.summary || entry.detail || '暂无内容')}</div>
                                <div class="stx-memory-workbench__badge-row">
                                    ${(entry.tags ?? []).slice(0, 3).map((tag: string): string => `<span class="stx-memory-workbench__badge">${escapeHtml(tag)}</span>`).join('')}
                                    ${(entry.tags ?? []).length > 3 ? `<span class="stx-memory-workbench__badge">+${entry.tags.length - 3}</span>` : ''}
                                </div>
                            </button>
                        `).join('') : '<div class="stx-memory-workbench__empty">没有找到匹配的记忆条目。</div>'}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:row;">
                    <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
                        <div class="stx-memory-workbench__field" style="margin-bottom:0;">
                            <input class="stx-memory-workbench__input" id="stx-memory-entry-title" value="${escapeAttr(entryDraft.title ?? '')}" style="font-size:20px; font-weight:700; border:none; background:transparent; padding:0; border-bottom: 2px solid var(--mw-line);" placeholder="输入条目标题">
                        </div>
                        <div class="stx-memory-workbench__field-stack">
                            <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">摘要速览</label>
                            <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-summary" style="min-height:72px" placeholder="用于快速浏览和回忆的短摘要">${escapeHtml(entryDraft.summary ?? '')}</textarea>
                        </div>
                        <div class="stx-memory-workbench__field-stack">
                            <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">正文细节</label>
                            <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-detail" style="min-height:120px;" placeholder="用于记录更完整、更可信的细节">${escapeHtml(entryDraft.detail ?? '')}</textarea>
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
                                <details style="margin-top:12px; cursor:pointer;" title="点击展开查看底层对象">
                                    <summary style="font-size:11px; color:var(--mw-muted); user-select:none;">查看原始数据</summary>
                                    <pre style="margin-top:8px; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; overflow-x:auto;">${escapeHtml(stringifyData(selectedEntry))}</pre>
                                </details>
                            ` : '<div class="stx-memory-workbench__empty">新建状态下在左侧填写完毕并保存后，此处将自动解析出条目的检视信息。</div>'}
                        </div>
                    </div>
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
                                        <label>类型</label>
                                        <select class="stx-memory-workbench__select" id="stx-memory-entry-type">
                                            ${snapshot.entryTypes.map((item: MemoryEntryType): string => `<option value="${escapeAttr(item.key)}"${item.key === (entryDraft.entryType ?? selectedEntryType?.key ?? 'other') ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="stx-memory-workbench__field-stack">
                                        <label>分类</label>
                                        <input class="stx-memory-workbench__input" id="stx-memory-entry-category" value="${escapeAttr(entryDraft.category ?? selectedEntryType?.category ?? '其他')}" placeholder="输入分类">
                                    </div>
                                    <div class="stx-memory-workbench__field-stack">
                                        <label>标签</label>
                                        <input class="stx-memory-workbench__input" id="stx-memory-entry-tags" value="${escapeAttr((entryDraft.tags ?? []).join(', '))}" placeholder="多个标签请用逗号分隔">
                                    </div>
                                </div>
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__panel-title">角色引用</div>
                                <div class="stx-memory-workbench__stack">
                                    ${bindingRows || '<div class="stx-memory-workbench__empty">此条目尚未被任何角色绑定。</div>'}
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
 * 功能：构建条目绑定列表。
 * @param snapshot 工作台快照。
 * @param selectedEntry 当前条目。
 * @returns HTML。
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
function buildInspectorSections(entry: MemoryEntry, snapshot: WorkbenchSnapshot): InspectorSection[] {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const bindings = toRecord(payload.bindings);
    const sections: InspectorSection[] = [];
    const actorMap = new Map(snapshot.actors.map((actor: ActorMemoryProfile): [string, string] => [actor.actorKey, actor.displayName]));

    if (entry.entryType === 'task') {
        sections.push({
            title: '任务卡片',
            rows: [
                { label: '任务标题', value: entry.title },
                { label: '任务摘要', value: entry.summary },
                { label: '当前目标', value: fields.objective ?? payload.objective },
                { label: '当前状态', value: fields.status ?? payload.status },
                { label: '阶段', value: fields.stage ?? payload.stage },
                { label: '阻碍', value: fields.blocker ?? payload.blocker },
                { label: '完成条件', value: fields.completionCriteria ?? payload.completionCriteria },
                { label: '最近变化', value: fields.lastChange ?? payload.lastChange },
                { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
            ],
        });
    }

    if (entry.entryType === 'event' || entry.entryType === 'actor_visible_event') {
        sections.push({
            title: '事件卡片',
            rows: [
                { label: '事件标题', value: entry.title },
                { label: '概述', value: entry.summary },
                { label: '生命周期状态', value: fields.lifecycle ?? fields.status ?? payload.status },
                { label: '参与者', value: fields.participants ?? payload.participants },
                { label: '地点', value: fields.location ?? payload.location },
                { label: '结果', value: fields.result ?? fields.outcome ?? payload.result ?? payload.outcome },
                { label: '影响', value: fields.impact ?? payload.impact },
                { label: '关联任务', value: bindings.tasks },
            ],
        });
    }

    if (entry.entryType === 'relationship') {
        const sourceActorKey = String(payload.sourceActorKey ?? fields.sourceActorKey ?? '').trim();
        const targetActorKey = String(payload.targetActorKey ?? fields.targetActorKey ?? '').trim();
        sections.push({
            title: '关系事实',
            rows: [
                { label: '源角色', value: resolveRelationshipActorLabel(sourceActorKey, actorMap, payload, fields, 'source') },
                { label: '目标角色', value: resolveRelationshipActorLabel(targetActorKey, actorMap, payload, fields, 'target') },
                { label: '关系标签', value: fields.relationTag },
                { label: '关系现状', value: payload.state ?? fields.state },
                { label: '未解冲突', value: payload.unresolvedConflict ?? fields.unresolvedConflict },
                { label: '关键节点', value: payload.milestones ?? fields.milestones },
                { label: '源角色键', value: sourceActorKey || '暂无' },
                { label: '目标角色键', value: targetActorKey || '暂无' },
            ],
        });
    }

    if (entry.entryType === 'organization' || entry.entryType === 'city' || entry.entryType === 'nation' || entry.entryType === 'location') {
        sections.push({
            title: '实体关系',
            rows: [
                { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
                { label: '别名', value: fields.aliases ?? payload.aliases },
                { label: '关联组织', value: bindings.organizations },
                { label: '关联城市', value: bindings.cities },
                { label: '关联地点', value: bindings.locations },
                { label: '关联国家', value: bindings.nations },
            ],
        });
    }

    sections.push({
        title: '调试信息',
        rows: [
            { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
            { label: '原因码', value: payload.reasonCodes },
            { label: '来源批次', value: payload.sourceBatchIds ?? toRecord(payload.takeover).sourceBatchIds },
            { label: '绑定关系', value: bindings },
            { label: '来源总结列表', value: entry.sourceSummaryIds },
        ],
    });

    sections.push({
        title: '通用事实层',
        rows: [
            { label: '摘要', value: entry.summary },
            { label: '正文', value: entry.detail },
            { label: '标签', value: entry.tags },
        ],
    });

    return sections;
}

/**
 * 功能：解析关系条目里的角色显示名，避免在检视面板直接暴露内部 key。
 * @param actorKey 角色键。
 * @param actorMap 当前角色显示名映射。
 * @param payload 条目 payload。
 * @param fields 条目 fields。
 * @param side 关系端点方向。
 * @returns 可展示的角色名。
 */
function resolveRelationshipActorLabel(
    actorKey: string,
    actorMap: Map<string, string>,
    payload: Record<string, unknown>,
    fields: Record<string, unknown>,
    side: 'source' | 'target',
): string {
    const explicitDisplayName = String(payload[`${side}DisplayName`] ?? fields[`${side}DisplayName`] ?? '').trim();
    if (explicitDisplayName) {
        return explicitDisplayName;
    }
    if (actorKey === 'user') {
        return actorMap.get('user') || '你';
    }
    if (!actorKey) {
        return '未命名角色';
    }
    const fallbackLabel = actorKey
        .replace(/^char_+/i, '')
        .replace(/^actor_+/i, '')
        .replace(/_/g, ' ')
        .trim();
    return actorMap.get(actorKey) || fallbackLabel || '未命名角色';
}

/**
 * 功能：渲染结构化检视分组。
 * @param section 分组信息。
 * @returns HTML。
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
