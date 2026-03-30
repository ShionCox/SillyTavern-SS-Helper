import { escapeHtml } from '../editorShared';
import {
    resolveEntryTypeLabel,
    resolveWorldEntityFieldLabel,
    resolveWorldEntityText,
} from '../workbenchLocale';
import {
    escapeAttr,
    formatDisplayValue,
    formatTimestamp,
    toRecord,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';
import type { MemoryEntry } from '../../types';

const WORLD_ENTITY_TYPES: string[] = [
    'nation',
    'city',
    'organization',
    'location',
    'world_core_setting',
    'world_hard_rule',
    'world_global_state',
];

/**
 * 功能：判断条目是否属于世界实体分类。
 * @param entry 记忆条目。
 * @returns 是否为世界实体条目。
 */
function isWorldEntityEntry(entry: MemoryEntry): boolean {
    return WORLD_ENTITY_TYPES.includes(String(entry.entryType ?? '').trim());
}

/**
 * 功能：构建世界实体筛选后的列表。
 * @param entries 全部条目。
 * @param state 工作台状态。
 * @returns 过滤后的世界实体列表。
 */
function getFilteredWorldEntities(entries: MemoryEntry[], state: WorkbenchState): MemoryEntry[] {
    const query = String(state.entryQuery ?? '').trim().toLowerCase();
    return entries
        .filter((entry: MemoryEntry): boolean => isWorldEntityEntry(entry))
        .filter((entry: MemoryEntry): boolean => {
            if (!query) {
                return true;
            }
            return [
                entry.title,
                entry.summary,
                entry.detail,
                entry.entryType,
                entry.category,
                ...(entry.tags ?? []),
            ].join(' ').toLowerCase().includes(query);
        })
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt);
}

/**
 * 功能：解析世界实体页签应显示的当前条目。
 * @param entities 世界实体列表。
 * @param state 工作台状态。
 * @returns 当前选中的条目或空值。
 */
function resolveSelectedWorldEntity(entities: MemoryEntry[], state: WorkbenchState): MemoryEntry | null {
    if (entities.length <= 0) {
        return null;
    }
    const selected = entities.find((entry: MemoryEntry): boolean => entry.entryId === state.selectedEntryId) ?? null;
    return selected ?? entities[0] ?? null;
}

/**
 * 功能：生成实体列表项摘要说明。
 * @param entry 世界实体条目。
 * @returns 短摘要文本。
 */
function buildEntityListSummary(entry: MemoryEntry): string {
    const summary = String(entry.summary ?? '').trim();
    if (summary) {
        return summary;
    }
    const detail = String(entry.detail ?? '').trim();
    if (detail) {
        return detail;
    }
    return resolveWorldEntityText('no_summary');
}

/**
 * 功能：构建世界实体左侧列表。
 * @param entities 世界实体列表。
 * @param selectedEntry 当前选中条目。
 * @returns 列表 HTML。
 */
function buildEntityListMarkup(entities: MemoryEntry[], selectedEntry: MemoryEntry | null): string {
    if (entities.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('no_entities'))}</div>`;
    }
    return entities.map((entry: MemoryEntry): string => {
        const isActive = selectedEntry?.entryId === entry.entryId;
        const summary = buildEntityListSummary(entry);
        const typeLabel = resolveEntryTypeLabel(entry.entryType) || entry.entryType || resolveWorldEntityText('uncategorized');
        return `
            <button class="stx-memory-workbench__list-item${isActive ? ' is-active' : ''}" data-select-entry="${escapeAttr(entry.entryId)}" style="gap:8px; padding:12px;">
                <div class="stx-memory-workbench__split-head" style="align-items:center;">
                    <h4 style="margin:0;">${escapeHtml(entry.title || resolveWorldEntityText('unnamed_entity'))}</h4>
                    <span class="stx-memory-workbench__badge">${escapeHtml(typeLabel)}</span>
                </div>
                <div class="stx-memory-workbench__meta">${escapeHtml(entry.category || resolveWorldEntityText('uncategorized'))}</div>
                <div class="stx-memory-workbench__detail-clamp">${escapeHtml(summary)}</div>
            </button>
        `;
    }).join('');
}

/**
 * 功能：构建实体基础信息卡片。
 * @param entry 当前条目。
 * @returns 信息卡片 HTML。
 */
function buildEntityOverviewMarkup(entry: MemoryEntry): string {
    const typeLabel = resolveEntryTypeLabel(entry.entryType) || entry.entryType || resolveWorldEntityText('uncategorized');
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__split-head">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(entry.title || resolveWorldEntityText('unnamed_entity'))}</div>
                <span class="stx-memory-workbench__badge">${escapeHtml(typeLabel)}</span>
            </div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('overview_title_id'))}</span><strong>${escapeHtml(entry.entryId)}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('overview_title_category'))}</span><strong>${escapeHtml(entry.category || resolveWorldEntityText('uncategorized'))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('overview_title_created_at'))}</span><strong>${escapeHtml(formatTimestamp(entry.createdAt))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('overview_title_updated_at'))}</span><strong>${escapeHtml(formatTimestamp(entry.updatedAt))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('overview_title_tags'))}</span><strong>${escapeHtml((entry.tags ?? []).join('、') || resolveWorldEntityText('empty_tags'))}</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：构建实体摘要与详情卡片。
 * @param entry 当前条目。
 * @returns 内容卡片 HTML。
 */
function buildEntityContentMarkup(entry: MemoryEntry): string {
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('summary_title'))}</div>
            <div class="stx-memory-workbench__detail-block">${escapeHtml(entry.summary || resolveWorldEntityText('no_summary'))}</div>
        </div>
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('detail_title'))}</div>
            <div class="stx-memory-workbench__detail-block">${escapeHtml(entry.detail || resolveWorldEntityText('no_detail'))}</div>
        </div>
    `;
}

/**
 * 功能：构建实体结构化字段列表。
 * @param entry 当前条目。
 * @returns 字段列表 HTML。
 */
function buildEntityFieldsMarkup(entry: MemoryEntry): string {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const displayFields = Object.keys(fields).length > 0 ? fields : payload;
    const rows = Object.entries(displayFields).map(([key, value]: [string, unknown]): string => {
        const label = resolveWorldEntityFieldLabel(key);
        return `
            <div class="stx-memory-workbench__info-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatDisplayValue(value))}</strong>
            </div>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('structured_title'))}</div>
            ${rows
                ? `<div class="stx-memory-workbench__info-list">${rows}</div>`
                : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('structured_empty'))}</div>`}
        </div>
    `;
}

/**
 * 功能：构建实体绑定关系卡片，让详情页与图谱关系保持一致。
 * @param entry 当前条目。
 * @returns 绑定关系 HTML。
 */
function buildEntityBindingsMarkup(entry: MemoryEntry): string {
    const payload = toRecord(entry.detailPayload);
    const bindings = toRecord(payload.bindings);
    const rows = Object.entries(bindings)
        .filter(([, value]: [string, unknown]): boolean => Array.isArray(value) && value.length > 0)
        .map(([key, value]: [string, unknown]): string => {
            return `
                <div class="stx-memory-workbench__info-row">
                    <span>${escapeHtml(resolveBindingLabel(key))}</span>
                    <strong>${escapeHtml(formatDisplayValue(value))}</strong>
                </div>
            `;
        })
        .join('');
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">绑定关系</div>
            ${rows
                ? `<div class="stx-memory-workbench__info-list">${rows}</div>`
                : `<div class="stx-memory-workbench__empty">当前实体还没有稳定绑定关系。</div>`}
        </div>
    `;
}

/**
 * 功能：构建世界实体概览统计。
 * @param entities 世界实体列表。
 * @returns 统计区域 HTML。
 */
function buildEntityStatsMarkup(entities: MemoryEntry[]): string {
    const counts = new Map<string, number>();
    entities.forEach((entry: MemoryEntry): void => {
        const type = String(entry.entryType ?? '').trim() || 'other';
        counts.set(type, (counts.get(type) ?? 0) + 1);
    });
    const chips = Array.from(counts.entries())
        .sort((left: [string, number], right: [string, number]): number => right[1] - left[1])
        .map(([type, count]: [string, number]): string => {
            const label = resolveEntryTypeLabel(type) || type;
            return `<span class="stx-memory-workbench__badge">${escapeHtml(label)} ${escapeHtml(String(count))}</span>`;
        }).join('');

    return `
        <div class="stx-memory-workbench__card" style="padding: 12px;">
            <div class="stx-memory-workbench__panel-title" style="margin-bottom: 8px;">${escapeHtml(resolveWorldEntityText('stats_title'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('stats_total'))}</span><strong>${escapeHtml(String(entities.length))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('stats_capability'))}</span><strong>${escapeHtml(resolveWorldEntityText('stats_capability_value'))}</strong></div>
            </div>
            <div class="stx-memory-workbench__badge-row" style="margin-top: 10px;">
                ${chips || `<span class="stx-memory-workbench__meta">${escapeHtml(resolveWorldEntityText('stats_empty'))}</span>`}
            </div>
        </div>
    `;
}

/**
 * 功能：构建结构化摘要卡片内容。
 * @param detailPayload 条目的结构化数据。
 * @returns 摘要区域 HTML。
 */
function buildStructuredSummaryMarkup(detailPayload: Record<string, unknown> | undefined): string {
    const payload = toRecord(detailPayload);
    const sections: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [];

    const appendSection = (title: string, record: Record<string, unknown>): void => {
        const rows = Object.entries(record)
            .filter(([, value]: [string, unknown]): boolean => value !== undefined && value !== null && value !== '')
            .slice(0, 6)
            .map(([key, value]: [string, unknown]) => ({
                label: resolveWorldEntityFieldLabel(key),
                value: formatDisplayValue(value),
            }));
        if (rows.length > 0) {
            sections.push({ title, rows });
        }
    };

    const fields = toRecord(payload.fields);
    if (Object.keys(fields).length > 0) {
        appendSection(resolveWorldEntityText('structured_title'), fields);
    }

    const extraSections = Object.entries(payload)
        .filter(([key]: [string, unknown]): boolean => key !== 'fields')
        .filter(([, value]: [string, unknown]): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
        .slice(0, 3);

    extraSections.forEach(([key, value]: [string, unknown]): void => {
        appendSection(resolveWorldEntityFieldLabel(key), toRecord(value));
    });

    if (sections.length <= 0) {
        const flatRows = Object.entries(payload)
            .filter(([, value]: [string, unknown]): boolean => typeof value !== 'object' || value === null)
            .slice(0, 6)
            .map(([key, value]: [string, unknown]) => ({
                label: resolveWorldEntityFieldLabel(key),
                value: formatDisplayValue(value),
            }));
        if (flatRows.length > 0) {
            sections.push({
                title: resolveWorldEntityText('structured_title'),
                rows: flatRows,
            });
        }
    }

    if (sections.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('structured_summary_empty'))}</div>`;
    }

    return `
        <div style="display:flex; flex-direction:column; gap:12px;">
            ${sections.map((section) => `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div class="stx-memory-workbench__mini-title">${escapeHtml(section.title)}</div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:8px;">
                        ${section.rows.map((row) => `
                            <div style="border:1px solid var(--mw-line); background:rgba(255,255,255,0.03); padding:10px; border-radius:6px; min-width:0;">
                                <div style="font-size:11px; color:var(--mw-muted); margin-bottom:4px;">${escapeHtml(row.label)}</div>
                                <div style="font-size:12px; line-height:1.6; color:var(--mw-text); white-space:pre-wrap; word-break:break-word;">${escapeHtml(row.value)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 功能：构建当前实体的补充说明。
 * @param entry 当前条目。
 * @returns 补充说明 HTML。
 */
function buildEntityNotesMarkup(entry: MemoryEntry | null): string {
    if (!entry) {
        return `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('notes_title'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('notes_empty'))}</div>
            </div>
        `;
    }
    const detailPayload = entry.detailPayload ?? {};
    const rawPayload = JSON.stringify(detailPayload, null, 2);
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('structured_summary_title'))}</div>
            ${buildStructuredSummaryMarkup(detailPayload)}
        </div>
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('raw_payload_title'))}</div>
            <pre style="max-height: 320px; overflow: auto;">${escapeHtml(rawPayload)}</pre>
        </div>
    `;
}

/**
 * 功能：构建实体详情主区域。
 * @param entry 当前条目。
 * @returns 详情区域 HTML。
 */
function buildEntityDetailMarkup(entry: MemoryEntry | null): string {
    if (!entry) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('select_entity_first'))}</div>`;
    }
    return `
        <div class="stx-memory-workbench__stack">
            ${buildEntityOverviewMarkup(entry)}
            ${buildEntityContentMarkup(entry)}
            ${buildEntityFieldsMarkup(entry)}
            ${buildEntityBindingsMarkup(entry)}
        </div>
    `;
}

/**
 * 功能：构建实体右侧辅助信息。
 * @param entry 当前条目。
 * @returns 辅助信息 HTML。
 */
function buildEntitySidebarMarkup(entry: MemoryEntry | null): string {
    if (!entry) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveWorldEntityText('sidebar_empty'))}</div>`;
    }
    const typeLabel = resolveEntryTypeLabel(entry.entryType) || entry.entryType || resolveWorldEntityText('uncategorized');
    return `
        <div class="stx-memory-workbench__stack">
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveWorldEntityText('quick_info_title'))}</div>
                <div class="stx-memory-workbench__info-list">
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('quick_info_type'))}</span><strong>${escapeHtml(typeLabel)}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('quick_info_category'))}</span><strong>${escapeHtml(entry.category || resolveWorldEntityText('uncategorized'))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('quick_info_updated_at'))}</span><strong>${escapeHtml(formatTimestamp(entry.updatedAt))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveWorldEntityText('quick_info_tag_count'))}</span><strong>${escapeHtml(String((entry.tags ?? []).length))}</strong></div>
                </div>
            </div>
            ${buildEntityNotesMarkup(entry)}
        </div>
    `;
}

/**
 * 功能：解析绑定字段的展示标签。
 * @param key 绑定字段键名。
 * @returns 展示标签。
 */
function resolveBindingLabel(key: string): string {
    const labels: Record<string, string> = {
        actors: '关联角色',
        organizations: '关联组织',
        cities: '关联城市',
        locations: '关联地点',
        nations: '关联国家',
        tasks: '关联任务',
        events: '关联事件',
    };
    return labels[key] ?? key;
}

/**
 * 功能：构建世界实体页签。
 * @param snapshot 工作台快照。
 * @param state 工作台状态。
 * @returns 页签 HTML。
 */
export function buildWorldEntitiesViewMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
): string {
    const entities = getFilteredWorldEntities(snapshot.entries, state);
    const selectedEntry = resolveSelectedWorldEntity(entities, state);

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'world-entities' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveWorldEntityText('section_title'))}</div>
                <div class="stx-memory-workbench__meta">${escapeHtml(resolveWorldEntityText('section_desc'))}</div>
            </div>
            <div style="display:grid; grid-template-columns: 320px minmax(0, 1fr) 320px; gap: 12px; min-height: 0; flex: 1;">
                <div class="stx-memory-workbench__stack" style="min-height: 0; gap: 8px;">
                    ${buildEntityStatsMarkup(entities)}
                    <div class="stx-memory-workbench__card" style="padding: 12px; min-height: 0;">
                        <div class="stx-memory-workbench__panel-title" style="margin-bottom: 8px;">${escapeHtml(resolveWorldEntityText('list_title'))}</div>
                        <div class="stx-memory-workbench__meta">${escapeHtml(resolveWorldEntityText('list_desc'))}</div>
                        <div class="stx-memory-workbench__list" data-entry-list-scroll="true" style="margin-top: 10px; min-height: 0;">
                            ${buildEntityListMarkup(entities, selectedEntry)}
                        </div>
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="min-height: 0;">
                    ${buildEntityDetailMarkup(selectedEntry)}
                </div>
                <div class="stx-memory-workbench__stack" style="min-height: 0;">
                    ${buildEntitySidebarMarkup(selectedEntry)}
                </div>
            </div>
        </section>
    `;
}
