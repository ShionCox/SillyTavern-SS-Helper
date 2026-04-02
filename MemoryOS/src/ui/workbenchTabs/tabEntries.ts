import { escapeHtml } from '../editorShared';
import {
    resolveEntriesWorkbenchText,
    resolveEntryTypeLabel,
} from '../workbenchLocale';
import type { ActorMemoryProfile, MemoryEntry, MemoryEntryType, RoleEntryMemory } from '../../types';
import {
    escapeAttr,
    formatDisplayValue,
    formatTimestamp,
    stringifyData,
    summarizeDetailPayload,
    toRecord,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';
import { sanitizeWorkbenchDisplayText } from './shared/workbench-text';

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
        : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveEntriesWorkbenchText('empty_after_save'))}</div>`;

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'entries' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveEntriesWorkbenchText('section_title'))}</div>
                <div class="stx-memory-workbench__toolbar">
                    <input class="stx-memory-workbench__input" id="stx-memory-entry-query" placeholder="${escapeAttr(resolveEntriesWorkbenchText('search_placeholder'))}" style="width:240px" value="${escapeAttr(state.entryQuery)}">
                    <button class="stx-memory-workbench__button" data-action="create-entry"><i class="fa-solid fa-plus"></i> ${escapeHtml(resolveEntriesWorkbenchText('create_entry'))}</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack">
                    <div class="stx-memory-workbench__list" data-entry-list-scroll="true">
                        ${filteredEntries.length > 0 ? filteredEntries.map((entry: MemoryEntry): string => `
                            <button class="stx-memory-workbench__list-item${entry.entryId === state.selectedEntryId ? ' is-active' : ''}" data-select-entry="${escapeAttr(entry.entryId)}">
                                <h4>${escapeHtml(sanitizeWorkbenchDisplayText(entry.title, '未命名词条'))}</h4>
                                <div class="stx-memory-workbench__meta">${escapeHtml(typeMap.get(entry.entryType)?.label || resolveEntryTypeLabel(entry.entryType))} · ${escapeHtml(entry.category)}</div>
                                <div class="stx-memory-workbench__detail-clamp">${escapeHtml(sanitizeWorkbenchDisplayText(entry.summary || entry.detail, resolveEntriesWorkbenchText('empty_content')))}</div>
                                <div class="stx-memory-workbench__badge-row">
                                    ${(entry.tags ?? []).slice(0, 3).map((tag: string): string => `<span class="stx-memory-workbench__badge">${escapeHtml(tag)}</span>`).join('')}
                                    ${(entry.tags ?? []).length > 3 ? `<span class="stx-memory-workbench__badge">+${entry.tags.length - 3}</span>` : ''}
                                </div>
                            </button>
                        `).join('') : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveEntriesWorkbenchText('empty_not_found'))}</div>`}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:row;">
                    <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
                        <div class="stx-memory-workbench__field" style="margin-bottom:0;">
                            <input class="stx-memory-workbench__input" id="stx-memory-entry-title" value="${escapeAttr(entryDraft.title ?? '')}" style="font-size:20px; font-weight:700; border:none; background:transparent; padding:0; border-bottom: 2px solid var(--mw-line);" placeholder="${escapeAttr(resolveEntriesWorkbenchText('title_placeholder'))}">
                        </div>
                        <div class="stx-memory-workbench__field-stack">
                            <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">${escapeHtml(resolveEntriesWorkbenchText('summary_label'))}</label>
                            <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-summary" style="min-height:72px" placeholder="${escapeAttr(resolveEntriesWorkbenchText('summary_placeholder'))}">${escapeHtml(entryDraft.summary ?? '')}</textarea>
                        </div>
                        <div class="stx-memory-workbench__field-stack">
                            <label style="font-size:12px; font-weight:600; color:var(--mw-accent-cyan);">${escapeHtml(resolveEntriesWorkbenchText('detail_label'))}</label>
                            <textarea class="stx-memory-workbench__textarea" id="stx-memory-entry-detail" style="min-height:120px;" placeholder="${escapeAttr(resolveEntriesWorkbenchText('detail_placeholder'))}">${escapeHtml(entryDraft.detail ?? '')}</textarea>
                        </div>
                        ${dynamicFields ? `<div class="stx-memory-workbench__card" style="margin-top:0;"><div class="stx-memory-workbench__panel-title" style="margin-bottom:8px;">${escapeHtml(resolveEntriesWorkbenchText('structured_facts'))}</div><div class="stx-memory-workbench__form-grid">${dynamicFields}</div></div>` : ''}
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveEntriesWorkbenchText('data_inspector'))}</div>
                            ${selectedEntry ? `
                                <div class="stx-memory-workbench__info-list">
                                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('entry_id'))}</span><strong style="font-family:monospace; font-size:11px;">${escapeHtml(selectedEntry.entryId)}</strong></div>
                                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('updated_at'))}</span><strong>${escapeHtml(formatTimestamp(selectedEntry.updatedAt))}</strong></div>
                                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('source_summaries'))}</span><strong>${escapeHtml(selectedEntry.sourceSummaryIds.length > 0 ? selectedEntry.sourceSummaryIds.join('、') : resolveEntriesWorkbenchText('empty_content'))}</strong></div>
                                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('structured_facts_summary'))}</span><strong>${escapeHtml(summarizeDetailPayload(selectedEntry.detailPayload))}</strong></div>
                                </div>
                                <div class="stx-memory-workbench__stack" style="margin-top:12px; border-top:1px dashed var(--mw-line); padding-top:12px;">
                                    ${inspectorMarkup}
                                </div>
                                <details style="margin-top:12px; cursor:pointer;" title="${escapeAttr(resolveEntriesWorkbenchText('raw_data_hint'))}">
                                    <summary style="font-size:11px; color:var(--mw-muted); user-select:none;">${escapeHtml(resolveEntriesWorkbenchText('raw_data_title'))}</summary>
                                    <pre style="margin-top:8px; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; overflow-x:auto;">${escapeHtml(stringifyData(selectedEntry))}</pre>
                                </details>
                            ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveEntriesWorkbenchText('empty_new_entry'))}</div>`}
                        </div>
                    </div>
                    <div style="width:340px; background:rgba(17, 19, 24, 0.4); border-left:1px solid var(--mw-line); display:flex; flex-direction:column;">
                        <div class="stx-memory-workbench__toolbar" style="padding:16px; border-bottom:1px solid var(--mw-line); justify-content:flex-end; background:rgba(0,0,0,0.2);">
                            <button class="stx-memory-workbench__button" data-action="save-entry" data-entry-id="${escapeAttr(selectedEntry?.entryId ?? '')}"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(resolveEntriesWorkbenchText('save'))}</button>
                            ${selectedEntry ? `<button class="stx-memory-workbench__ghost-btn is-warn" style="color:var(--mw-warn); border-color:transparent;" data-action="delete-entry" data-entry-id="${escapeAttr(selectedEntry.entryId)}"><i class="fa-solid fa-trash"></i> ${escapeHtml(resolveEntriesWorkbenchText('remove'))}</button>` : ''}
                        </div>
                        <div style="padding:16px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:16px; min-height:0;">
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveEntriesWorkbenchText('system_fields'))}</div>
                                <div class="stx-memory-workbench__form-grid" style="grid-template-columns:1fr; gap:12px;">
                                    <div class="stx-memory-workbench__field-stack">
                                        <label>${escapeHtml(resolveEntriesWorkbenchText('type'))}</label>
                                        <select class="stx-memory-workbench__select" id="stx-memory-entry-type">
                                            ${snapshot.entryTypes.map((item: MemoryEntryType): string => `<option value="${escapeAttr(item.key)}"${item.key === (entryDraft.entryType ?? selectedEntryType?.key ?? 'other') ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="stx-memory-workbench__field-stack">
                                        <label>${escapeHtml(resolveEntriesWorkbenchText('category'))}</label>
                                        <input class="stx-memory-workbench__input" id="stx-memory-entry-category" value="${escapeAttr(entryDraft.category ?? selectedEntryType?.category ?? '其他')}" placeholder="${escapeAttr(resolveEntriesWorkbenchText('category_placeholder'))}">
                                    </div>
                                    <div class="stx-memory-workbench__field-stack">
                                        <label>${escapeHtml(resolveEntriesWorkbenchText('tags'))}</label>
                                        <input class="stx-memory-workbench__input" id="stx-memory-entry-tags" value="${escapeAttr((entryDraft.tags ?? []).join(', '))}" placeholder="${escapeAttr(resolveEntriesWorkbenchText('tags_placeholder'))}">
                                    </div>
                                </div>
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveEntriesWorkbenchText('actor_bindings'))}</div>
                                <div class="stx-memory-workbench__stack">
                                    ${bindingRows || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveEntriesWorkbenchText('actor_bindings_empty'))}</div>`}
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
                <div class="stx-memory-workbench__panel-title">${escapeHtml(sanitizeWorkbenchDisplayText(actor?.displayName || binding.actorKey, '未命名角色'))}</div>
                <div class="stx-memory-workbench__info-list">
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('actor_key'))}</span><strong>${escapeHtml(binding.actorKey)}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('memory_strength'))}</span><strong>${escapeHtml(String(binding.memoryPercent))}%</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('forgotten_state'))}</span><strong>${escapeHtml(binding.forgotten ? resolveEntriesWorkbenchText('forgotten') : resolveEntriesWorkbenchText('active'))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveEntriesWorkbenchText('updated_at'))}</span><strong>${escapeHtml(formatTimestamp(binding.updatedAt))}</strong></div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * 功能：构建结构化检视分组。
 * @param entry 当前条目。
 * @param snapshot 工作台快照。
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
            title: resolveEntriesWorkbenchText('task_card'),
            rows: [
                { label: resolveEntriesWorkbenchText('task_title'), value: entry.title },
                { label: resolveEntriesWorkbenchText('task_summary'), value: entry.summary },
                { label: resolveEntriesWorkbenchText('current_goal'), value: fields.objective ?? payload.objective },
                { label: resolveEntriesWorkbenchText('current_status'), value: fields.status ?? payload.status },
                { label: resolveEntriesWorkbenchText('stage'), value: fields.stage ?? payload.stage },
                { label: resolveEntriesWorkbenchText('blocker'), value: fields.blocker ?? payload.blocker },
                { label: resolveEntriesWorkbenchText('completion_criteria'), value: fields.completionCriteria ?? payload.completionCriteria },
                { label: resolveEntriesWorkbenchText('last_change'), value: fields.lastChange ?? payload.lastChange },
                { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
            ],
        });
    }

    if (entry.entryType === 'event' || entry.entryType === 'actor_visible_event') {
        sections.push({
            title: resolveEntriesWorkbenchText('event_card'),
            rows: [
                { label: resolveEntriesWorkbenchText('task_title'), value: entry.title },
                { label: resolveEntriesWorkbenchText('overview'), value: entry.summary },
                { label: resolveEntriesWorkbenchText('lifecycle_state'), value: fields.lifecycle ?? fields.status ?? payload.status },
                { label: resolveEntriesWorkbenchText('participants'), value: fields.participants ?? payload.participants },
                { label: resolveEntriesWorkbenchText('location'), value: fields.location ?? payload.location },
                { label: resolveEntriesWorkbenchText('result'), value: fields.result ?? fields.outcome ?? payload.result ?? payload.outcome },
                { label: resolveEntriesWorkbenchText('impact'), value: fields.impact ?? payload.impact },
                { label: resolveEntriesWorkbenchText('related_tasks'), value: bindings.tasks },
            ],
        });
    }

    if (false && entry.entryType === 'relationship') {
        const sourceActorKey = String(payload.sourceActorKey ?? fields.sourceActorKey ?? '').trim();
        const targetActorKey = String(payload.targetActorKey ?? fields.targetActorKey ?? '').trim();
        sections.push({
            title: resolveEntriesWorkbenchText('relationship_fact'),
            rows: [
                { label: resolveEntriesWorkbenchText('source_actor'), value: resolveRelationshipActorLabel(sourceActorKey, actorMap, payload, fields, 'source') },
                { label: resolveEntriesWorkbenchText('target_actor'), value: resolveRelationshipActorLabel(targetActorKey, actorMap, payload, fields, 'target') },
                { label: resolveEntriesWorkbenchText('relationship_tag'), value: fields.relationTag },
                { label: resolveEntriesWorkbenchText('relationship_state'), value: payload.state ?? fields.state },
                { label: resolveEntriesWorkbenchText('unresolved_conflict'), value: payload.unresolvedConflict ?? fields.unresolvedConflict },
                { label: resolveEntriesWorkbenchText('milestones'), value: payload.milestones ?? fields.milestones },
                { label: resolveEntriesWorkbenchText('source_actor_key'), value: sourceActorKey || resolveEntriesWorkbenchText('empty_content') },
                { label: resolveEntriesWorkbenchText('target_actor_key'), value: targetActorKey || resolveEntriesWorkbenchText('empty_content') },
            ],
        });
    }

    if (entry.entryType === 'organization' || entry.entryType === 'city' || entry.entryType === 'nation' || entry.entryType === 'location') {
        sections.push({
            title: resolveEntriesWorkbenchText('entity_relations'),
            rows: [
                { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
                { label: resolveEntriesWorkbenchText('aliases'), value: fields.aliases ?? payload.aliases },
                { label: resolveEntriesWorkbenchText('related_organizations'), value: bindings.organizations },
                { label: resolveEntriesWorkbenchText('related_cities'), value: bindings.cities },
                { label: resolveEntriesWorkbenchText('related_locations'), value: bindings.locations },
                { label: resolveEntriesWorkbenchText('related_nations'), value: bindings.nations },
            ],
        });
    }

    sections.push({
        title: resolveEntriesWorkbenchText('debug_info'),
        rows: [
            { label: 'compareKey', value: payload.compareKey ?? fields.compareKey },
            { label: resolveEntriesWorkbenchText('reason_codes'), value: payload.reasonCodes },
            { label: resolveEntriesWorkbenchText('source_batches'), value: payload.sourceBatchIds ?? toRecord(payload.takeover).sourceBatchIds },
            { label: resolveEntriesWorkbenchText('bindings'), value: bindings },
            { label: resolveEntriesWorkbenchText('source_summary_list'), value: entry.sourceSummaryIds },
        ],
    });

    sections.push({
        title: resolveEntriesWorkbenchText('common_facts'),
        rows: [
            { label: resolveEntriesWorkbenchText('summary'), value: entry.summary },
            { label: resolveEntriesWorkbenchText('detail'), value: entry.detail },
            { label: resolveEntriesWorkbenchText('tags'), value: entry.tags },
        ],
    });

    return sections;
}

/**
 * 功能：解析关系条目里的角色显示名。
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
        return actorMap.get('user') || resolveEntriesWorkbenchText('user_actor');
    }
    if (!actorKey) {
        return resolveEntriesWorkbenchText('unnamed_actor');
    }
    const fallbackLabel = actorKey
        .replace(/^actor_+/i, '')
        .replace(/_/g, ' ')
        .trim();
    return actorMap.get(actorKey) || fallbackLabel || resolveEntriesWorkbenchText('unnamed_actor');
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
