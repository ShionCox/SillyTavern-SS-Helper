import { escapeHtml } from '../editorShared';
import {
    resolveActorsWorkbenchText,
    resolveEntryTypeLabel,
} from '../workbenchLocale';
import { escapeAttr, formatTimestamp, isUserActorKey, summarizeDetailPayload, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import { sanitizeWorkbenchDisplayText } from './shared/workbench-text';
import type { ActorMemoryProfile, MemoryEntry, MemoryEntryType, RoleEntryMemory, SummarySnapshot } from '../../types';

/**
 * 功能：构建角色页签子视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 子视图 HTML。
 */
function buildActorSubView(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    if (state.currentActorTab === 'attributes') {
        return buildActorAttributesMarkup(selectedActor);
    }
    if (state.currentActorTab === 'memory') {
        return buildActorMemoryMarkup(snapshot, selectedActor, selectedActorMemories, typeMap, entryOptions);
    }
    if (state.currentActorTab === 'items') {
        return buildActorItemsMarkup();
    }
    return buildActorRelationshipsMarkup(snapshot, selectedActor, selectedActorMemories);
}

/**
 * 功能：构建角色基础资料页。
 * @param selectedActor 当前角色。
 * @returns 页面 HTML。
 */
function buildActorAttributesMarkup(selectedActor: ActorMemoryProfile | null): string {
    const isUserActor = isUserActorKey(selectedActor?.actorKey);
    return `
        <div class="stx-memory-workbench__form-grid">
            <div class="stx-memory-workbench__field-stack">
                <label>${escapeHtml(resolveActorsWorkbenchText('actor_key'))}</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-key" value="${escapeAttr(selectedActor?.actorKey ?? '')}" placeholder="${escapeAttr(resolveActorsWorkbenchText('actor_key_placeholder'))}" />
            </div>
            <div class="stx-memory-workbench__field-stack">
                <label>${escapeHtml(resolveActorsWorkbenchText('display_name'))}</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-label" value="${escapeAttr(selectedActor?.displayName ?? '')}" placeholder="${escapeAttr(resolveActorsWorkbenchText('actor_label_placeholder'))}" />
            </div>
            ${isUserActor ? `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('user_actor_note_title'))}</div>
                <div class="stx-memory-workbench__detail-block">${escapeHtml(resolveActorsWorkbenchText('user_actor_note_text'))}</div>
            </div>
            ` : `
            <div class="stx-memory-workbench__field-stack">
                <label>${escapeHtml(resolveActorsWorkbenchText('memory_stat'))}</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-stat" type="number" min="0" max="100" value="${escapeAttr(String(selectedActor?.memoryStat ?? 60))}" />
            </div>
            `}
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('current_profile'))}</div>
                <div class="stx-memory-workbench__info-list">
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('actor_key'))}</span><strong>${escapeHtml(selectedActor?.actorKey ?? resolveActorsWorkbenchText('not_created'))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('display_name'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(selectedActor?.displayName, resolveActorsWorkbenchText('unnamed')))}</strong></div>
                    ${isUserActor ? '' : `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('memory_stat_badge'))}</span><strong>${escapeHtml(String(selectedActor?.memoryStat ?? 60))}</strong></div>`}
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('created_at'))}</span><strong>${escapeHtml(formatTimestamp(selectedActor?.createdAt))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('updated_at'))}</span><strong>${escapeHtml(formatTimestamp(selectedActor?.updatedAt))}</strong></div>
                </div>
            </div>
        </div>
        <div class="stx-memory-workbench__toolbar" style="margin-top:16px;">
            <button class="stx-memory-workbench__button" data-action="save-actor"><i class="fa-solid fa-floppy-disk"></i> ${escapeHtml(resolveActorsWorkbenchText('save_actor'))}</button>
        </div>
    `;
}

/**
 * 功能：构建角色深层记忆页。
 * @param snapshot 工作台快照。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 页面 HTML。
 */
function buildActorMemoryMarkup(
    snapshot: WorkbenchSnapshot,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    const memoryRows = selectedActorMemories.map((item: RoleEntryMemory): string => {
        const entry = snapshot.entries.find((row: MemoryEntry): boolean => row.entryId === item.entryId);
        const typeLabel = typeMap.get(entry?.entryType ?? '')?.label || resolveEntryTypeLabel(entry?.entryType ?? '') || '未分类';
        return `
            <article class="stx-memory-workbench__card" style="padding: 12px;">
                <div class="stx-memory-workbench__split-head" style="margin-bottom: 8px;">
                    <div>
                        <div class="stx-memory-workbench__panel-title" style="margin-bottom: 2px;">${escapeHtml(entry?.title ?? item.entryId)}</div>
                        <div class="stx-memory-workbench__meta">${escapeHtml(typeLabel)} · ${escapeHtml(resolveActorsWorkbenchText('signal'))} ${escapeHtml(String(item.memoryPercent))}% · ${escapeHtml(item.forgotten ? '已遗忘' : '活跃')}</div>
                    </div>
                    <div class="stx-memory-workbench__toolbar">
                        <button class="stx-memory-workbench__ghost-btn" style="padding: 4px 8px; font-size: 11px;" data-action="unbind-entry" data-entry-id="${escapeAttr(item.entryId)}">
                            <i class="fa-solid fa-link-slash"></i> ${escapeHtml(resolveActorsWorkbenchText('unbind'))}
                        </button>
                    </div>
                </div>
                <div class="stx-memory-workbench__detail-block" style="margin-bottom: 8px;">${escapeHtml(sanitizeWorkbenchDisplayText(entry?.summary || entry?.detail, resolveActorsWorkbenchText('no_detail')))}</div>
                <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid var(--mw-line);">
                    <span style="color: var(--mw-muted);">${escapeHtml(resolveActorsWorkbenchText('structured_facts'))}：</span>
                    <span style="color: var(--mw-accent-cyan); font-family: monospace; line-height: 1.4;">${escapeHtml(summarizeDetailPayload(entry?.detailPayload))}</span>
                </div>
            </article>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__form-grid" style="align-items:flex-end;">
            <div class="stx-memory-workbench__field-stack">
                <label>${escapeHtml(resolveActorsWorkbenchText('bind_new_entry'))}</label>
                <select class="stx-memory-workbench__select" id="stx-memory-bind-entry">${entryOptions}</select>
            </div>
            <div class="stx-memory-workbench__toolbar" style="margin-bottom:2px;">
                <button class="stx-memory-workbench__button" data-action="bind-entry"><i class="fa-solid fa-link"></i> ${escapeHtml(resolveActorsWorkbenchText('bind_current_actor'))}</button>
            </div>
        </div>
        <div class="stx-memory-workbench__section-title" style="margin-top:16px;">${escapeHtml(resolveActorsWorkbenchText('deep_memory'))}</div>
        <div class="stx-memory-workbench__meta">${escapeHtml(resolveActorsWorkbenchText('current_actor_prefix'))}：${escapeHtml(sanitizeWorkbenchDisplayText(selectedActor?.displayName, '未选择角色'))}，共 ${selectedActorMemories.length} ${escapeHtml(resolveActorsWorkbenchText('real_binding_count_suffix'))}</div>
        <div class="stx-memory-workbench__stack" style="margin-top:8px;">
            ${memoryRows || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveActorsWorkbenchText('no_real_memory'))}</div>`}
        </div>
    `;
}

/**
 * 功能：构建装备终端空态页。
 * @returns 页面 HTML。
 */
function buildActorItemsMarkup(): string {
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('item_terminal'))}</div>
            <div class="stx-memory-workbench__detail-block">
                ${escapeHtml(resolveActorsWorkbenchText('item_terminal_text'))}
            </div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('access_state'))}</span><strong>${escapeHtml(resolveActorsWorkbenchText('not_connected'))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('current_strategy'))}</span><strong>${escapeHtml(resolveActorsWorkbenchText('readonly_empty'))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('future_condition'))}</span><strong>${escapeHtml(resolveActorsWorkbenchText('future_condition_text'))}</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：构建真实关系拓扑页。
 * @param snapshot 工作台快照。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @returns 页面 HTML。
 */
function buildActorRelationshipsMarkup(
    snapshot: WorkbenchSnapshot,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
): string {
    const isUserActor = isUserActorKey(selectedActor?.actorKey);
    const actorKey = selectedActor?.actorKey ?? '';
    const graphLinks = snapshot.actorGraph.links.filter((link): boolean => link.source === actorKey || link.target === actorKey);
    const graphNode = snapshot.actorGraph.nodes.find((node): boolean => node.id === actorKey) ?? null;
    const summaryRows = snapshot.summaries.filter((summary: SummarySnapshot): boolean => summary.actorKeys.includes(actorKey)).slice(0, 4);
    const memoryIndex = new Map(selectedActorMemories.map((item: RoleEntryMemory): [string, RoleEntryMemory] => [item.entryId, item]));

    const relatedRoles = graphLinks.map((link) => {
        const otherKey = link.source === actorKey ? link.target : link.source;
        const otherNode = snapshot.actorGraph.nodes.find((node) => node.id === otherKey);
        const entry = snapshot.entries.find((row: MemoryEntry) => row.entryId === link.entryId);
        return { otherNode, link, entry };
    }).filter((row) => row.otherNode && row.entry);

    const relationList = relatedRoles.map((rel): string => {
        const { otherNode, link, entry } = rel;
        const memoryRow = memoryIndex.get(entry!.entryId);
        const typeColor = link.type === 'ally' ? '#22c55e' : (link.type === 'enemy' ? '#ef4444' : '#94a3b8');
        const roleName = otherNode?.label || otherNode?.id || '未知角色';

        return `
            <article class="stx-memory-workbench__card" style="padding: 12px; border-left: 2px solid ${typeColor};">
                <div class="stx-memory-workbench__split-head" style="margin-bottom: 4px;">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('relation_to_prefix'))}${escapeHtml(roleName)}${escapeHtml(resolveActorsWorkbenchText('relation_to_suffix'))}</div>
                    <div class="stx-memory-workbench__meta" style="color: ${typeColor}; font-weight: bold; text-wrap-mode: nowrap;">${escapeHtml(link.label || '关系')}</div>
                </div>
                <div class="stx-memory-workbench__meta" style="margin-bottom: 8px;">${escapeHtml(resolveActorsWorkbenchText('signal'))} ${escapeHtml(memoryRow ? String(memoryRow.memoryPercent) + '%' : resolveActorsWorkbenchText('not_bound'))}</div>
                <div class="stx-memory-workbench__detail-block" style="margin-bottom: 8px;">${escapeHtml(sanitizeWorkbenchDisplayText(link.summary || link.label, resolveActorsWorkbenchText('no_detail')))}</div>
            </article>
        `;
    }).join('');

    const summaryList = summaryRows.map((summary: SummarySnapshot): string => {
        return `
            <article class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(sanitizeWorkbenchDisplayText(summary.title, '未命名总结'))}</div>
                <div class="stx-memory-workbench__meta">${escapeHtml(resolveActorsWorkbenchText('updated_at'))} ${escapeHtml(formatTimestamp(summary.updatedAt))}</div>
                <div class="stx-memory-workbench__detail-block">${escapeHtml(sanitizeWorkbenchDisplayText(summary.content, resolveActorsWorkbenchText('no_detail')))}</div>
            </article>
        `;
    }).join('');

    return `
        <div class="stx-workbench-topology" style="position: relative; width: 100%; height: 600px; display: flex; overflow: hidden; border: 1px solid var(--mw-line);">
            <div class="stx-workbench-topology__graph" style="position: absolute; inset: 0; width: 100%; height: 100%;">
                <div id="stx-rpg-graph-container" class="stx-workbench-topology__graph-canvas" style="width: 100%; height: 100%; background: var(--mw-bg);">
                    <div class="stx-memory-workbench__empty">${escapeHtml(resolveActorsWorkbenchText('relation_loading'))}</div>
                </div>
            </div>

            <div class="stx-rpg-rel-header" style="position: absolute; right: 16px; top: 16px; background: rgba(17, 19, 24, 0.7); backdrop-filter: blur(4px); border: 1px solid var(--mw-line); padding: 8px 16px; border-radius: 6px; z-index: 10; text-align: right; pointer-events: none;">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('relation_network'))}</div>
                <div class="stx-memory-workbench__meta">${escapeHtml(resolveActorsWorkbenchText('drag_zoom_hint'))}</div>
            </div>

            <aside class="stx-workbench-topology__panel" style="position: absolute; left: 16px; top: 16px; bottom: 16px; width: 350px; background: rgba(17, 19, 24, 0.9); backdrop-filter: blur(8px); border: 1px solid var(--mw-line-strong); box-shadow: 4px 0 24px rgba(0,0,0,0.5); z-index: 10; display: flex; flex-direction: column; overflow-y: auto;">
                <div class="stx-memory-workbench__card" style="border: none; border-bottom: 1px solid var(--mw-line); border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('actor_attributes'))}</div>
                    <div class="stx-memory-workbench__info-list">
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('actor_key'))}</span><strong>${escapeHtml(selectedActor?.actorKey ?? resolveActorsWorkbenchText('not_selected'))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('display_name'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(selectedActor?.displayName, resolveActorsWorkbenchText('unnamed')))}</strong></div>
                        ${isUserActor ? '' : `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('memory_stat_badge'))}</span><strong>${escapeHtml(String(selectedActor?.memoryStat ?? 0))}</strong></div>`}
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('real_relation_count'))}</span><strong>${escapeHtml(String(graphNode?.relationCount ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveActorsWorkbenchText('bind_new_entry'))}</span><strong>${escapeHtml(String(selectedActorMemories.length))}</strong></div>
                    </div>
                </div>
                <div class="stx-memory-workbench__card" style="border: none; border-bottom: 1px solid var(--mw-line); border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('relation_status'))}</div>
                    <div class="stx-memory-workbench__stack">
                        ${relationList || `<div class="stx-memory-workbench__empty" style="font-size:11px;">${escapeHtml(resolveActorsWorkbenchText('no_related_actor'))}</div>`}
                    </div>
                </div>
                <div class="stx-memory-workbench__card" style="border: none; border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorsWorkbenchText('recent_summaries'))}</div>
                    <div class="stx-memory-workbench__stack">
                        ${summaryList || `<div class="stx-memory-workbench__empty" style="font-size:11px;">${escapeHtml(resolveActorsWorkbenchText('no_hit_summary'))}</div>`}
                    </div>
                </div>
            </aside>
        </div>
    `;
}

/**
 * 功能：构建角色页整体视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 页面 HTML。
 */
export function buildActorsViewMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    const allTags = new Set<string>();
    const actorTagsMap = new Map<string, Set<string>>();

    snapshot.actors.forEach((actor: ActorMemoryProfile): void => {
        const actorTags = new Set<string>();
        const boundEntryIds = snapshot.roleMemories
            .filter((row: RoleEntryMemory): boolean => row.actorKey === actor.actorKey)
            .map((row: RoleEntryMemory): string => row.entryId);

        snapshot.entries
            .filter((entry: MemoryEntry): boolean => boundEntryIds.includes(entry.entryId))
            .forEach((entry: MemoryEntry): void => {
                if (Array.isArray(entry.tags)) {
                    entry.tags.forEach((tag: string): void => {
                        if (tag) {
                            actorTags.add(tag);
                            allTags.add(tag);
                        }
                    });
                }
            });
        actorTagsMap.set(actor.actorKey, actorTags);
    });

    const tagOptions = Array.from(allTags)
        .sort()
        .map((tag: string): string => `<option value="${escapeAttr(tag)}"${state.actorTagFilter === tag ? ' selected' : ''}>${escapeHtml(tag)}</option>`)
        .join('');

    let displayActors = [...snapshot.actors];

    if (state.actorQuery) {
        const query = state.actorQuery.toLowerCase();
        displayActors = displayActors.filter((actor: ActorMemoryProfile): boolean => actor.displayName.toLowerCase().includes(query) || actor.actorKey.toLowerCase().includes(query));
    }

    if (state.actorTagFilter) {
        displayActors = displayActors.filter((actor: ActorMemoryProfile): boolean => actorTagsMap.get(actor.actorKey)?.has(state.actorTagFilter) === true);
    }

    displayActors.sort((left: ActorMemoryProfile, right: ActorMemoryProfile): number => {
        if (state.actorSortOrder === 'stat-asc') {
            if (isUserActorKey(left.actorKey) && !isUserActorKey(right.actorKey)) return 1;
            if (!isUserActorKey(left.actorKey) && isUserActorKey(right.actorKey)) return -1;
            return left.memoryStat - right.memoryStat;
        }
        if (state.actorSortOrder === 'stat-desc') {
            if (isUserActorKey(left.actorKey) && !isUserActorKey(right.actorKey)) return 1;
            if (!isUserActorKey(left.actorKey) && isUserActorKey(right.actorKey)) return -1;
            return right.memoryStat - left.memoryStat;
        }
        if (state.actorSortOrder === 'name-asc') return left.displayName.localeCompare(right.displayName);
        if (state.actorSortOrder === 'name-desc') return right.displayName.localeCompare(left.displayName);
        return 0;
    });

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'actors' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveActorsWorkbenchText('section_title'))}</div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-actor"><i class="fa-solid fa-plus"></i> ${escapeHtml(resolveActorsWorkbenchText('create_actor'))}</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack" style="gap: 8px;">
                    <div style="display: flex; gap: 4px; padding: 0 4px;">
                        <input type="text" class="stx-memory-workbench__input" id="stx-memory-actor-query" placeholder="${escapeAttr(resolveActorsWorkbenchText('search_placeholder'))}" value="${escapeAttr(state.actorQuery || '')}" style="flex: 1;" />
                    </div>
                    <div style="display: flex; gap: 4px; padding: 0 4px;">
                        <select class="stx-memory-workbench__select" id="stx-memory-actor-tag-filter" style="flex: 1;">
                            <option value="">${escapeHtml(resolveActorsWorkbenchText('all_tags'))}</option>
                            ${tagOptions}
                        </select>
                        <select class="stx-memory-workbench__select" id="stx-memory-actor-sort" style="flex: 1;">
                            <option value="stat-desc"${state.actorSortOrder === 'stat-desc' || !state.actorSortOrder ? ' selected' : ''}>${escapeHtml(resolveActorsWorkbenchText('stat_desc'))}</option>
                            <option value="stat-asc"${state.actorSortOrder === 'stat-asc' ? ' selected' : ''}>${escapeHtml(resolveActorsWorkbenchText('stat_asc'))}</option>
                            <option value="name-asc"${state.actorSortOrder === 'name-asc' ? ' selected' : ''}>${escapeHtml(resolveActorsWorkbenchText('name_asc'))}</option>
                            <option value="name-desc"${state.actorSortOrder === 'name-desc' ? ' selected' : ''}>${escapeHtml(resolveActorsWorkbenchText('name_desc'))}</option>
                        </select>
                    </div>
                    <div class="stx-memory-workbench__list">
                        ${displayActors.length > 0 ? displayActors.map((item: ActorMemoryProfile): string => `
                            <button class="stx-memory-workbench__list-item${item.actorKey === state.selectedActorKey ? ' is-active' : ''}" data-select-actor="${escapeAttr(item.actorKey)}">
                                <h4>${escapeHtml(sanitizeWorkbenchDisplayText(item.displayName || item.actorKey, '未命名角色'))}</h4>
                                <div class="stx-memory-workbench__meta">${escapeHtml(item.actorKey)}</div>
                                <div style="font-size: 10px; color: var(--mw-muted); margin-top: 2px;">
                                    ${Array.from(actorTagsMap.get(item.actorKey) || []).slice(0, 3).map((tag: string) => `<span style="background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 4px; margin-right: 4px;">${escapeHtml(tag)}</span>`).join('')}
                                    ${(actorTagsMap.get(item.actorKey)?.size || 0) > 3 ? '...' : ''}
                                </div>
                                <div class="stx-memory-workbench__badge-row" style="margin-top:4px;">
                                    ${isUserActorKey(item.actorKey) ? '' : `<span class="stx-memory-workbench__badge">${escapeHtml(resolveActorsWorkbenchText('memory_stat_badge'))} ${item.memoryStat}</span>`}
                                    <span class="stx-memory-workbench__badge">${snapshot.actorGraph.links.filter((link): boolean => link.source === item.actorKey || link.target === item.actorKey).length} ${escapeHtml(resolveActorsWorkbenchText('real_relation_count'))}</span>
                                </div>
                            </button>
                        `).join('') : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveActorsWorkbenchText('no_matched_actor'))}</div>`}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:column;">
                    <div class="stx-memory-workbench__sub-nav">
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'attributes' ? ' is-active' : ''}" data-actor-tab="attributes">
                            ${escapeHtml(resolveActorsWorkbenchText('tab_attributes'))}
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'memory' ? ' is-active' : ''}" data-actor-tab="memory">
                            ${escapeHtml(resolveActorsWorkbenchText('tab_memory'))}
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'items' ? ' is-active' : ''}" data-actor-tab="items">
                            ${escapeHtml(resolveActorsWorkbenchText('tab_items'))}
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'relationships' ? ' is-active' : ''}" data-actor-tab="relationships">
                            ${escapeHtml(resolveActorsWorkbenchText('tab_relationships'))}
                        </button>
                    </div>
                    <div class="stx-memory-workbench__sub-view-container" style="padding:16px; overflow-y:auto;">
                        ${buildActorSubView(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                    </div>
                </div>
            </div>
        </section>
    `;
}
