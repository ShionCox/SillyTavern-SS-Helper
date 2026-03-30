import type { MemoryEntry } from '../types';

/**
 * 功能：定义记忆图边账本记录。
 */
export interface MemoryGraphEdgeRecord {
    edgeId: string;
    sourceEntryId: string;
    targetEntryId: string;
    relationType: string;
    confidence: number;
    sourceKinds: string[];
    status: 'active' | 'inactive';
    sourceBatchIds: string[];
    semanticLabel: string;
    debugSummary: string;
    reasonCodes: string[];
}

/**
 * 功能：从条目集合构建稳定图边账本。
 * @param entries 记忆条目列表。
 * @returns 图边账本记录列表。
 */
export function buildMemoryGraphEdgeLedger(entries: MemoryEntry[]): MemoryGraphEdgeRecord[] {
    const aliasIndex = buildEntryAliasIndex(entries);
    const records = new Map<string, MemoryGraphEdgeRecord>();

    for (const entry of entries) {
        const payload = toRecord(entry.detailPayload);
        const fields = toRecord(payload.fields);
        const sourceBatchIds = toStringArray(payload.sourceBatchIds ?? payload.takeover?.sourceBatchIds ?? entry.sourceSummaryIds);

        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'belongs_to_organization',
            semanticLabel: '隶属',
            debugSummary: '字段绑定 -> organization',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.organization, fields.affiliation, fields.orgName],
        });
        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'located_in_city',
            semanticLabel: '位于',
            debugSummary: '字段绑定 -> city',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.city, fields.baseCity, fields.locationCity],
        });
        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'located_in_nation',
            semanticLabel: '位于国家',
            debugSummary: '字段绑定 -> nation',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.nation, fields.country, fields.regionNation],
        });
        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'occurs_at_location',
            semanticLabel: '发生于',
            debugSummary: '字段绑定 -> location',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.location, fields.baseLocation, fields.targetLocation],
        });
        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'relates_to_task',
            semanticLabel: '关联任务',
            debugSummary: '字段绑定 -> task',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.task, fields.taskTitle, fields.relatedTask],
        });
        appendResolvedEdge(records, aliasIndex, {
            entry,
            relationType: 'relates_to_event',
            semanticLabel: '关联事件',
            debugSummary: '字段绑定 -> event',
            sourceKinds: ['field_binding'],
            sourceBatchIds,
            targetHints: [fields.event, fields.eventTitle, fields.relatedEvent],
        });

        const participants = dedupeStrings([
            ...toStringArray(payload.participants),
            ...toStringArray(fields.participants),
        ]);
        for (const participant of participants) {
            const targetEntry = aliasIndex.get(normalizeLookupKey(participant));
            if (!targetEntry || targetEntry.entryId === entry.entryId) {
                continue;
            }
            pushEdgeRecord(records, {
                edgeId: buildEdgeId(entry.entryId, targetEntry.entryId, 'participant'),
                sourceEntryId: entry.entryId,
                targetEntryId: targetEntry.entryId,
                relationType: 'participant',
                confidence: 0.66,
                sourceKinds: ['explicit_participant'],
                status: 'active',
                sourceBatchIds,
                semanticLabel: '参与',
                debugSummary: `participants 命中 ${participant}`,
                reasonCodes: ['participants_match'],
            });
        }
    }

    return [...records.values()];
}

/**
 * 功能：按目标字段提示尝试追加可解析图边。
 * @param records 图边账本映射。
 * @param aliasIndex 条目别名索引。
 * @param input 构建输入。
 */
function appendResolvedEdge(
    records: Map<string, MemoryGraphEdgeRecord>,
    aliasIndex: Map<string, MemoryEntry>,
    input: {
        entry: MemoryEntry;
        relationType: string;
        semanticLabel: string;
        debugSummary: string;
        sourceKinds: string[];
        sourceBatchIds: string[];
        targetHints: unknown[];
    },
): void {
    for (const targetHint of input.targetHints) {
        const targetEntry = aliasIndex.get(normalizeLookupKey(String(targetHint ?? '')));
        if (!targetEntry || targetEntry.entryId === input.entry.entryId) {
            continue;
        }
        pushEdgeRecord(records, {
            edgeId: buildEdgeId(input.entry.entryId, targetEntry.entryId, input.relationType),
            sourceEntryId: input.entry.entryId,
            targetEntryId: targetEntry.entryId,
            relationType: input.relationType,
            confidence: 0.72,
            sourceKinds: input.sourceKinds,
            status: 'active',
            sourceBatchIds: input.sourceBatchIds,
            semanticLabel: input.semanticLabel,
            debugSummary: input.debugSummary,
            reasonCodes: ['field_binding_match'],
        });
        return;
    }
}

/**
 * 功能：把图边记录写入账本映射并做去重合并。
 * @param records 图边账本映射。
 * @param record 新图边记录。
 */
function pushEdgeRecord(records: Map<string, MemoryGraphEdgeRecord>, record: MemoryGraphEdgeRecord): void {
    const existing = records.get(record.edgeId);
    if (!existing) {
        records.set(record.edgeId, record);
        return;
    }
    records.set(record.edgeId, {
        ...existing,
        confidence: Math.max(existing.confidence, record.confidence),
        sourceKinds: dedupeStrings([...existing.sourceKinds, ...record.sourceKinds]),
        sourceBatchIds: dedupeStrings([...existing.sourceBatchIds, ...record.sourceBatchIds]),
        reasonCodes: dedupeStrings([...existing.reasonCodes, ...record.reasonCodes]),
    });
}

/**
 * 功能：构建条目标题/别名索引。
 * @param entries 条目列表。
 * @returns 别名索引。
 */
function buildEntryAliasIndex(entries: MemoryEntry[]): Map<string, MemoryEntry> {
    const index = new Map<string, MemoryEntry>();
    for (const entry of entries) {
        const payload = toRecord(entry.detailPayload);
        const fields = toRecord(payload.fields);
        const aliases = dedupeStrings([
            entry.title,
            ...toStringArray(payload.aliases),
            ...toStringArray(fields.aliases),
            String(payload.compareKey ?? ''),
            String(fields.compareKey ?? ''),
        ]);
        for (const alias of aliases) {
            const key = normalizeLookupKey(alias);
            if (key && !index.has(key)) {
                index.set(key, entry);
            }
        }
    }
    return index;
}

/**
 * 功能：构建图边唯一 ID。
 * @param sourceEntryId 源条目 ID。
 * @param targetEntryId 目标条目 ID。
 * @param relationType 关系类型。
 * @returns 图边 ID。
 */
function buildEdgeId(sourceEntryId: string, targetEntryId: string, relationType: string): string {
    return `${sourceEntryId}:${targetEntryId}:${relationType}`;
}

/**
 * 功能：规范化索引查询键。
 * @param value 原始文本。
 * @returns 归一化查询键。
 */
function normalizeLookupKey(value: string): string {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * 功能：规范化对象。
 * @param value 原始值。
 * @returns 安全对象。
 */
function toRecord(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, any>;
}

/**
 * 功能：规范化字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
}

/**
 * 功能：字符串数组去重。
 * @param values 原始数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
