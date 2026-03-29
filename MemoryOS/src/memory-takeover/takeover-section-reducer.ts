import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
} from '../types';
import type {
    DomainReduceResult,
    PipelineBudgetPolicy,
    PipelineConflictRecord,
    PipelineDomain,
    PipelineDomainLedgerRecord,
    PipelineSectionDigestRecord,
} from '../pipeline/pipeline-types';

/**
 * 功能：构建旧聊天接管的分段摘要。
 * @param jobId 任务标识。
 * @param batchResults 批次结果。
 * @param budget 预算策略。
 * @returns 分段摘要列表。
 */
export function buildTakeoverSectionDigests(
    jobId: string,
    batchResults: MemoryTakeoverBatchResult[],
    budget: PipelineBudgetPolicy,
): PipelineSectionDigestRecord[] {
    const records: PipelineSectionDigestRecord[] = [];
    for (let index = 0; index < batchResults.length; index += budget.maxSectionBatchCount) {
        const sectionBatches = batchResults.slice(index, index + budget.maxSectionBatchCount);
        records.push({
            jobId,
            sectionId: `${jobId}:section:${String(records.length + 1).padStart(4, '0')}`,
            batchIds: sectionBatches.map((item: MemoryTakeoverBatchResult): string => item.batchId),
            summary: sectionBatches.map((item: MemoryTakeoverBatchResult): string => item.summary).join('\n').slice(0, budget.maxSectionDigestChars),
            actors: sectionBatches.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverActorCardCandidate[] => item.actorCards ?? []),
            entities: sectionBatches.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverEntityCardCandidate[] => item.entityCards ?? []),
            relationships: sectionBatches.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationshipCard[] => item.relationships ?? []),
            tasks: sectionBatches.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverTaskTransition[] => item.taskTransitions ?? []),
            worldChanges: sectionBatches.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverWorldStateChange[] => item.worldStateChanges ?? []),
            unresolvedConflicts: [],
        });
    }
    return records;
}

/**
 * 功能：归约角色卡片。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverActors(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<MemoryTakeoverActorCardCandidate> {
    const group = new Map<string, MemoryTakeoverActorCardCandidate[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverActorCardCandidate[] => item.actorCards ?? [])) {
        const actorKey = String(record.actorKey ?? '').trim().toLowerCase();
        if (!actorKey || actorKey === 'user') {
            continue;
        }
        const current = group.get(actorKey) ?? [];
        current.push(record);
        group.set(actorKey, current);
    }
    const canonicalRecords: MemoryTakeoverActorCardCandidate[] = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [actorKey, records] of group) {
        canonicalRecords.push(mergeActorCards(records));
        const names = new Set(records.map((item: MemoryTakeoverActorCardCandidate): string => String(item.displayName ?? '').trim()).filter(Boolean));
        if (names.size > 1) {
            unresolvedConflicts.push({
                bucketId: `actor/display_name_collision/${sanitizeBucketKey(actorKey)}`,
                domain: 'actor',
                conflictType: 'display_name_collision',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约实体卡片。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverEntities(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<MemoryTakeoverEntityCardCandidate> {
    const compareKeyMap = new Map<string, MemoryTakeoverEntityCardCandidate[]>();
    const titleMap = new Map<string, MemoryTakeoverEntityCardCandidate[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverEntityCardCandidate[] => item.entityCards ?? [])) {
        const compareKey = String(record.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        const byCompareKey = compareKeyMap.get(compareKey) ?? [];
        byCompareKey.push(record);
        compareKeyMap.set(compareKey, byCompareKey);
        const titleKey = `${record.entityType}:${String(record.title ?? '').trim()}`;
        const byTitle = titleMap.get(titleKey) ?? [];
        byTitle.push(record);
        titleMap.set(titleKey, byTitle);
    }
    const canonicalRecords = [...compareKeyMap.values()].map((records: MemoryTakeoverEntityCardCandidate[]): MemoryTakeoverEntityCardCandidate => mergeEntityCards(records));
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [titleKey, records] of titleMap) {
        const compareKeys = new Set(records.map((item: MemoryTakeoverEntityCardCandidate): string => String(item.compareKey ?? '').trim()).filter(Boolean));
        if (compareKeys.size > 1) {
            unresolvedConflicts.push({
                bucketId: `entity/title_collision/${sanitizeBucketKey(titleKey)}`,
                domain: 'entity',
                conflictType: 'title_collision',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约关系卡片。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverRelationships(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<MemoryTakeoverRelationshipCard> {
    const pairMap = new Map<string, MemoryTakeoverRelationshipCard[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationshipCard[] => item.relationships ?? [])) {
        const pairKey = `${String(record.sourceActorKey ?? '').trim().toLowerCase()}::${String(record.targetActorKey ?? '').trim().toLowerCase()}`;
        if (!pairKey || pairKey === '::') {
            continue;
        }
        const current = pairMap.get(pairKey) ?? [];
        current.push(record);
        pairMap.set(pairKey, current);
    }
    const canonicalRecords: MemoryTakeoverRelationshipCard[] = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [pairKey, records] of pairMap) {
        canonicalRecords.push(mergeRelationshipCards(records));
        const values = new Set(records.map((item: MemoryTakeoverRelationshipCard): string => `${item.relationTag}::${item.state}::${item.summary}`));
        if (values.size > 1) {
            unresolvedConflicts.push({
                bucketId: `relationship/state_divergence/${sanitizeBucketKey(pairKey)}`,
                domain: 'relationship',
                conflictType: 'state_divergence',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约任务状态。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverTasks(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<{ task: string; state: string }> {
    const taskMap = new Map<string, MemoryTakeoverTaskTransition[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverTaskTransition[] => item.taskTransitions ?? [])) {
        const task = String(record.task ?? '').trim();
        if (!task) {
            continue;
        }
        const current = taskMap.get(task) ?? [];
        current.push(record);
        taskMap.set(task, current);
    }
    const canonicalRecords: Array<{ task: string; state: string }> = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [taskKey, records] of taskMap) {
        canonicalRecords.push({
            task: taskKey,
            state: String(records[records.length - 1]?.to ?? '').trim(),
        });
        const states = new Set(records.map((item: MemoryTakeoverTaskTransition): string => String(item.to ?? '').trim()).filter(Boolean));
        if (states.size > 1) {
            unresolvedConflicts.push({
                bucketId: `task/stage_divergence/${sanitizeBucketKey(taskKey)}`,
                domain: 'task',
                conflictType: 'stage_divergence',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约世界状态。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverWorld(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<{ key: string; value: string }> {
    const worldMap = new Map<string, MemoryTakeoverWorldStateChange[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverWorldStateChange[] => item.worldStateChanges ?? [])) {
        const key = String(record.key ?? '').trim();
        if (!key) {
            continue;
        }
        const current = worldMap.get(key) ?? [];
        current.push(record);
        worldMap.set(key, current);
    }
    const canonicalRecords: Array<{ key: string; value: string }> = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [worldKey, records] of worldMap) {
        canonicalRecords.push({
            key: worldKey,
            value: String(records[records.length - 1]?.value ?? '').trim(),
        });
        const values = new Set(records.map((item: MemoryTakeoverWorldStateChange): string => String(item.value ?? '').trim()).filter(Boolean));
        if (values.size > 1) {
            unresolvedConflicts.push({
                bucketId: `world/value_divergence/${sanitizeBucketKey(worldKey)}`,
                domain: 'world',
                conflictType: 'value_divergence',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：映射为账本记录。
 * @param jobId 任务标识。
 * @param domain 领域。
 * @param records 记录列表。
 * @param conflicts 冲突列表。
 * @returns 账本记录列表。
 */
export function mapTakeoverRecordsToLedger<TRecord>(
    jobId: string,
    domain: PipelineDomain,
    records: TRecord[],
    conflicts: PipelineConflictRecord[],
): PipelineDomainLedgerRecord<TRecord>[] {
    const unresolvedKeys = new Set(
        conflicts.flatMap((item: PipelineConflictRecord): string[] => item.records.map((record: unknown): string => resolveLedgerKey(domain, record))),
    );
    return records.map((record: TRecord): PipelineDomainLedgerRecord<TRecord> => ({
        jobId,
        domain,
        ledgerKey: resolveLedgerKey(domain, record),
        canonicalRecord: record,
        sourceBatchIds: [],
        conflictState: unresolvedKeys.has(resolveLedgerKey(domain, record)) ? 'unresolved' : 'none',
        updatedAt: Date.now(),
    }));
}

/**
 * 功能：合并角色卡片。
 * @param records 原始记录。
 * @returns 合并后的角色卡片。
 */
function mergeActorCards(records: MemoryTakeoverActorCardCandidate[]): MemoryTakeoverActorCardCandidate {
    return records.reduce((merged: MemoryTakeoverActorCardCandidate, current: MemoryTakeoverActorCardCandidate): MemoryTakeoverActorCardCandidate => ({
        actorKey: String(current.actorKey ?? merged.actorKey ?? '').trim().toLowerCase(),
        displayName: String(current.displayName ?? '').trim() || merged.displayName,
        aliases: dedupeStrings([...(merged.aliases ?? []), ...(current.aliases ?? [])]),
        identityFacts: dedupeStrings([...(merged.identityFacts ?? []), ...(current.identityFacts ?? [])]),
        originFacts: dedupeStrings([...(merged.originFacts ?? []), ...(current.originFacts ?? [])]),
        traits: dedupeStrings([...(merged.traits ?? []), ...(current.traits ?? [])]),
    }), {
        actorKey: String(records[0]?.actorKey ?? '').trim().toLowerCase(),
        displayName: String(records[0]?.displayName ?? '').trim(),
        aliases: [],
        identityFacts: [],
        originFacts: [],
        traits: [],
    });
}

/**
 * 功能：合并实体卡片。
 * @param records 原始记录。
 * @returns 合并后的实体卡片。
 */
function mergeEntityCards(records: MemoryTakeoverEntityCardCandidate[]): MemoryTakeoverEntityCardCandidate {
    return records.reduce((merged: MemoryTakeoverEntityCardCandidate, current: MemoryTakeoverEntityCardCandidate): MemoryTakeoverEntityCardCandidate => ({
        entityType: current.entityType ?? merged.entityType,
        compareKey: String(current.compareKey ?? merged.compareKey ?? '').trim(),
        title: String(current.title ?? '').trim() || merged.title,
        aliases: dedupeStrings([...(merged.aliases ?? []), ...(current.aliases ?? [])]),
        summary: String(current.summary ?? '').trim() || merged.summary,
        fields: {
            ...(merged.fields ?? {}),
            ...(current.fields ?? {}),
        },
        confidence: Math.max(Number(merged.confidence) || 0, Number(current.confidence) || 0),
    }), {
        entityType: records[0]?.entityType ?? 'organization',
        compareKey: String(records[0]?.compareKey ?? '').trim(),
        title: String(records[0]?.title ?? '').trim(),
        aliases: [],
        summary: '',
        fields: {},
        confidence: 0,
    });
}

/**
 * 功能：合并关系卡片。
 * @param records 原始记录。
 * @returns 合并后的关系卡片。
 */
function mergeRelationshipCards(records: MemoryTakeoverRelationshipCard[]): MemoryTakeoverRelationshipCard {
    return records.reduce((merged: MemoryTakeoverRelationshipCard, current: MemoryTakeoverRelationshipCard): MemoryTakeoverRelationshipCard => ({
        sourceActorKey: String(current.sourceActorKey ?? merged.sourceActorKey ?? '').trim().toLowerCase(),
        targetActorKey: String(current.targetActorKey ?? merged.targetActorKey ?? '').trim().toLowerCase(),
        participants: dedupeStrings([...(merged.participants ?? []), ...(current.participants ?? [])]),
        relationTag: String(current.relationTag ?? '').trim() || merged.relationTag,
        state: String(current.state ?? '').trim() || merged.state,
        summary: String(current.summary ?? '').trim() || merged.summary,
        trust: Math.max(Number(merged.trust) || 0, Number(current.trust) || 0),
        affection: Math.max(Number(merged.affection) || 0, Number(current.affection) || 0),
        tension: Math.max(Number(merged.tension) || 0, Number(current.tension) || 0),
    }), {
        sourceActorKey: String(records[0]?.sourceActorKey ?? '').trim().toLowerCase(),
        targetActorKey: String(records[0]?.targetActorKey ?? '').trim().toLowerCase(),
        participants: [],
        relationTag: '',
        state: '',
        summary: '',
        trust: 0,
        affection: 0,
        tension: 0,
    });
}

/**
 * 功能：创建归约结果。
 * @param inputCount 输入数量。
 * @param canonicalRecords 规范记录。
 * @param unresolvedConflicts 冲突列表。
 * @returns 归约结果。
 */
function createReduceResult<TCanonical>(
    inputCount: number,
    canonicalRecords: TCanonical[],
    unresolvedConflicts: PipelineConflictRecord[],
): DomainReduceResult<TCanonical> {
    return {
        canonicalRecords,
        unresolvedConflicts,
        stats: {
            inputCount,
            canonicalCount: canonicalRecords.length,
            unresolvedCount: unresolvedConflicts.length,
        },
    };
}

/**
 * 功能：生成账本键。
 * @param domain 领域。
 * @param record 记录。
 * @returns 账本键。
 */
function resolveLedgerKey(domain: PipelineDomain, record: unknown): string {
    const row = (record && typeof record === 'object') ? record as Record<string, unknown> : {};
    if (domain === 'actor') {
        return String(row.actorKey ?? '').trim();
    }
    if (domain === 'entity') {
        return String(row.compareKey ?? '').trim();
    }
    if (domain === 'relationship') {
        return `${String(row.sourceActorKey ?? '').trim()}::${String(row.targetActorKey ?? '').trim()}`;
    }
    if (domain === 'task') {
        return String(row.task ?? '').trim();
    }
    if (domain === 'world') {
        return String(row.key ?? '').trim();
    }
    return JSON.stringify(row);
}

/**
 * 功能：去重字符串列表。
 * @param values 原始字符串列表。
 * @returns 去重后的字符串列表。
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

/**
 * 功能：清洗桶键。
 * @param value 原始文本。
 * @returns 可用桶键。
 */
function sanitizeBucketKey(value: string): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
