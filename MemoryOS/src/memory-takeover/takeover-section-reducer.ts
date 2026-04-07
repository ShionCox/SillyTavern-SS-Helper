import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverStableFact,
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
import type { MemoryTimeContext } from '../memory-time/time-types';

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
 * 功能：归约角色卡片（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
 * LLM 只处理本函数无法自动决议的部分。
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
 * 功能：归约实体卡片（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
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
 * 功能：归约关系卡片（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
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
 * 功能：归约长期稳定事实（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverFacts(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<MemoryTakeoverStableFact> {
    const factMap = new Map<string, MemoryTakeoverStableFact[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts ?? [])) {
        const factKey = String(record.compareKey ?? '').trim() || buildStableFactKey(record);
        if (!factKey) {
            continue;
        }
        const current = factMap.get(factKey) ?? [];
        current.push(record);
        factMap.set(factKey, current);
    }
    const canonicalRecords: MemoryTakeoverStableFact[] = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [factKey, records] of factMap) {
        canonicalRecords.push(mergeStableFacts(records));
        const values = new Set(records.map((item: MemoryTakeoverStableFact): string => String(item.value ?? '').trim()).filter(Boolean));
        if (values.size > 1) {
            unresolvedConflicts.push({
                bucketId: `fact/value_divergence/${sanitizeBucketKey(factKey)}`,
                domain: 'fact',
                conflictType: 'value_divergence',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约任务状态（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverTasks(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<{
    task: string;
    state: string;
    title?: string;
    summary?: string;
    description?: string;
    goal?: string;
    entityKey?: string;
    compareKey?: string;
    schemaVersion?: string;
    canonicalName?: string;
    matchKeys?: string[];
    legacyCompareKeys?: string[];
    bindings?: MemoryTakeoverTaskTransition['bindings'];
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}> {
    const taskMap = new Map<string, MemoryTakeoverTaskTransition[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverTaskTransition[] => item.taskTransitions ?? [])) {
        const compareKey = String(record.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        const current = taskMap.get(compareKey) ?? [];
        current.push(record);
        taskMap.set(compareKey, current);
    }
    const canonicalRecords: Array<{
        task: string;
        state: string;
        title?: string;
        summary?: string;
        description?: string;
        goal?: string;
        entityKey?: string;
        compareKey?: string;
        schemaVersion?: string;
        canonicalName?: string;
        matchKeys?: string[];
        legacyCompareKeys?: string[];
        bindings?: MemoryTakeoverTaskTransition['bindings'];
        reasonCodes?: string[];
        timeContext?: MemoryTimeContext;
        firstObservedAt?: MemoryTimeContext;
        lastObservedAt?: MemoryTimeContext;
        validFrom?: MemoryTimeContext;
        validTo?: MemoryTimeContext;
        ongoing?: boolean;
    }> = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [taskCompareKey, records] of taskMap) {
        const latest = records[records.length - 1];
        const taskKey = String(latest?.task ?? '').trim() || String(latest?.title ?? '').trim();
        canonicalRecords.push({
            task: taskKey,
            state: String(latest?.status ?? latest?.to ?? '').trim(),
            title: String(latest?.title ?? taskKey).trim(),
            summary: String(latest?.summary ?? '').trim(),
            description: String(latest?.description ?? '').trim(),
            goal: String(latest?.goal ?? '').trim(),
            entityKey: String(latest?.entityKey ?? '').trim() || undefined,
            compareKey: String(latest?.compareKey ?? '').trim(),
            schemaVersion: String(latest?.schemaVersion ?? '').trim() || undefined,
            canonicalName: String(latest?.canonicalName ?? '').trim() || undefined,
            matchKeys: Array.isArray(latest?.matchKeys) ? dedupeStrings(latest.matchKeys) : [],
            legacyCompareKeys: Array.isArray(latest?.legacyCompareKeys) ? dedupeStrings(latest.legacyCompareKeys) : [],
            bindings: latest?.bindings,
            reasonCodes: Array.isArray(latest?.reasonCodes) ? latest.reasonCodes : [],
            timeContext: latest?.timeContext,
            firstObservedAt: latest?.firstObservedAt,
            lastObservedAt: latest?.lastObservedAt,
            validFrom: latest?.validFrom,
            validTo: latest?.validTo,
            ongoing: latest?.ongoing,
        });
        const states = new Set(records.map((item: MemoryTakeoverTaskTransition): string => String(item.to ?? '').trim()).filter(Boolean));
        if (states.size > 1) {
            unresolvedConflicts.push({
                bucketId: `task/stage_divergence/${sanitizeBucketKey(taskCompareKey)}`,
                domain: 'task',
                conflictType: 'stage_divergence',
                records,
            });
        }
    }
    return createReduceResult(batchResults.length, canonicalRecords, unresolvedConflicts);
}

/**
 * 功能：归约世界状态（主链核心 — 本地归约层）。
 * 本函数在最终 LLM 裁决前执行，归约结果直接参与最终输出构建。
 * @param batchResults 批次结果。
 * @returns 归约结果。
 */
export function reduceTakeoverWorld(batchResults: MemoryTakeoverBatchResult[]): DomainReduceResult<MemoryTakeoverWorldStateChange> {
    const worldMap = new Map<string, MemoryTakeoverWorldStateChange[]>();
    for (const record of batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverWorldStateChange[] => item.worldStateChanges ?? [])) {
        const compareKey = String(record.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        const current = worldMap.get(compareKey) ?? [];
        current.push(record);
        worldMap.set(compareKey, current);
    }
    const canonicalRecords: MemoryTakeoverWorldStateChange[] = [];
    const unresolvedConflicts: PipelineConflictRecord[] = [];
    for (const [worldCompareKey, records] of worldMap) {
        const latest = records[records.length - 1];
        canonicalRecords.push({
            key: String(latest?.key ?? '').trim(),
            value: String(latest?.value ?? '').trim(),
            entityKey: String(latest?.entityKey ?? '').trim() || undefined,
            summary: String(latest?.summary ?? '').trim() || undefined,
            compareKey: worldCompareKey,
            matchKeys: Array.isArray(latest?.matchKeys) ? dedupeStrings(latest.matchKeys) : [],
            schemaVersion: String(latest?.schemaVersion ?? '').trim() || undefined,
            canonicalName: String(latest?.canonicalName ?? '').trim() || undefined,
            legacyCompareKeys: Array.isArray(latest?.legacyCompareKeys) ? dedupeStrings(latest.legacyCompareKeys) : [],
            bindings: latest?.bindings,
            reasonCodes: Array.isArray(latest?.reasonCodes) ? dedupeStrings(latest.reasonCodes) : [],
            timeContext: latest?.timeContext,
            firstObservedAt: latest?.firstObservedAt,
            lastObservedAt: latest?.lastObservedAt,
            validFrom: latest?.validFrom,
            validTo: latest?.validTo,
            ongoing: latest?.ongoing,
        });
        const values = new Set(records.map((item: MemoryTakeoverWorldStateChange): string => String(item.value ?? '').trim()).filter(Boolean));
        if (values.size > 1) {
            unresolvedConflicts.push({
                bucketId: `world/value_divergence/${sanitizeBucketKey(worldCompareKey)}`,
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
        entityKey: choosePreferredEntityKey(merged.entityKey, current.entityKey),
        schemaVersion: String(current.schemaVersion ?? '').trim() || String(merged.schemaVersion ?? '').trim() || undefined,
        canonicalName: choosePreferredCanonicalName(merged.canonicalName, current.canonicalName, current.title, merged.title),
        matchKeys: dedupeStrings([...(merged.matchKeys ?? []), ...(current.matchKeys ?? [])]),
        legacyCompareKeys: dedupeStrings([...(merged.legacyCompareKeys ?? []), ...(current.legacyCompareKeys ?? [])]),
        bindings: mergeTakeoverBindings(merged.bindings, current.bindings),
        reasonCodes: dedupeStrings([...(merged.reasonCodes ?? []), ...(current.reasonCodes ?? [])]),
        timeContext: pickLaterTimeContext(merged.timeContext, current.timeContext),
        firstObservedAt: pickEarlierTimeContext(merged.firstObservedAt, current.firstObservedAt),
        lastObservedAt: pickLaterTimeContext(merged.lastObservedAt, current.lastObservedAt),
        validFrom: pickEarlierTimeContext(merged.validFrom, current.validFrom),
        validTo: pickLaterTimeContext(merged.validTo, current.validTo),
        ongoing: resolveOngoingFlag(merged.ongoing, current.ongoing),
    }), {
        entityType: records[0]?.entityType ?? 'organization',
        entityKey: String(records[0]?.entityKey ?? '').trim() || undefined,
        compareKey: String(records[0]?.compareKey ?? '').trim(),
        schemaVersion: String(records[0]?.schemaVersion ?? '').trim() || undefined,
        canonicalName: String(records[0]?.canonicalName ?? '').trim() || String(records[0]?.title ?? '').trim() || undefined,
        matchKeys: [],
        legacyCompareKeys: [],
        title: String(records[0]?.title ?? '').trim(),
        aliases: [],
        summary: '',
        fields: {},
        confidence: 0,
        bindings: undefined,
        reasonCodes: [],
        timeContext: records[0]?.timeContext,
        firstObservedAt: records[0]?.firstObservedAt,
        lastObservedAt: records[0]?.lastObservedAt,
        validFrom: records[0]?.validFrom,
        validTo: records[0]?.validTo,
        ongoing: records[0]?.ongoing,
    });
}

/**
 * 功能：优先保留更稳定的实体主键。
 * @param currentValue 当前实体主键。
 * @param nextValue 新实体主键。
 * @returns 选择后的实体主键。
 */
function choosePreferredEntityKey(currentValue: string | undefined, nextValue: string | undefined): string | undefined {
    const current = String(currentValue ?? '').trim();
    const next = String(nextValue ?? '').trim();
    if (current && next) {
        return current.length >= next.length ? current : next;
    }
    return current || next || undefined;
}

/**
 * 功能：优先保留更完整的规范名。
 * @param currentValue 当前规范名。
 * @param nextValue 新规范名。
 * @param nextTitle 新标题。
 * @param currentTitle 当前标题。
 * @returns 选择后的规范名。
 */
function choosePreferredCanonicalName(
    currentValue: string | undefined,
    nextValue: string | undefined,
    nextTitle: string | undefined,
    currentTitle: string | undefined,
): string | undefined {
    const current = String(currentValue ?? '').trim() || String(currentTitle ?? '').trim();
    const next = String(nextValue ?? '').trim() || String(nextTitle ?? '').trim();
    if (current && next) {
        return current.length >= next.length ? current : next;
    }
    return current || next || undefined;
}

/**
 * 功能：合并接管绑定信息并自动去重。
 * @param currentBindings 当前绑定。
 * @param nextBindings 新绑定。
 * @returns 合并后的绑定。
 */
function mergeTakeoverBindings(
    currentBindings: MemoryTakeoverEntityCardCandidate['bindings'],
    nextBindings: MemoryTakeoverEntityCardCandidate['bindings'],
): MemoryTakeoverEntityCardCandidate['bindings'] {
    const current = currentBindings ?? {
        actors: [],
        organizations: [],
        cities: [],
        locations: [],
        nations: [],
        tasks: [],
        events: [],
    };
    const next = nextBindings ?? {
        actors: [],
        organizations: [],
        cities: [],
        locations: [],
        nations: [],
        tasks: [],
        events: [],
    };
    return {
        actors: dedupeStrings([...(current.actors ?? []), ...(next.actors ?? [])]),
        organizations: dedupeStrings([...(current.organizations ?? []), ...(next.organizations ?? [])]),
        cities: dedupeStrings([...(current.cities ?? []), ...(next.cities ?? [])]),
        locations: dedupeStrings([...(current.locations ?? []), ...(next.locations ?? [])]),
        nations: dedupeStrings([...(current.nations ?? []), ...(next.nations ?? [])]),
        tasks: dedupeStrings([...(current.tasks ?? []), ...(next.tasks ?? [])]),
        events: dedupeStrings([...(current.events ?? []), ...(next.events ?? [])]),
    };
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
        timeContext: pickLaterTimeContext(merged.timeContext, current.timeContext),
        validFrom: pickEarlierTimeContext(merged.validFrom, current.validFrom),
        validTo: pickLaterTimeContext(merged.validTo, current.validTo),
        ongoing: resolveOngoingFlag(merged.ongoing, current.ongoing),
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
        timeContext: records[0]?.timeContext,
        validFrom: records[0]?.validFrom,
        validTo: records[0]?.validTo,
        ongoing: records[0]?.ongoing,
    });
}

/**
 * 功能：合并长期稳定事实。
 * @param records 原始记录。
 * @returns 合并后的稳定事实。
 */
function mergeStableFacts(records: MemoryTakeoverStableFact[]): MemoryTakeoverStableFact {
    return records.reduce((merged: MemoryTakeoverStableFact, current: MemoryTakeoverStableFact): MemoryTakeoverStableFact => ({
        type: String(current.type ?? merged.type ?? '').trim(),
        subject: chooseLongerText(merged.subject, current.subject),
        predicate: chooseLongerText(merged.predicate, current.predicate),
        value: choosePreferredFactValue(merged, current),
        confidence: Math.max(Number(merged.confidence) || 0, Number(current.confidence) || 0),
        entityKey: chooseLongerOptionalText(merged.entityKey, current.entityKey),
        title: chooseLongerOptionalText(merged.title, current.title),
        summary: chooseLongerOptionalText(merged.summary, current.summary),
        compareKey: chooseLongerOptionalText(merged.compareKey, current.compareKey),
        matchKeys: dedupeStrings([...(merged.matchKeys ?? []), ...(current.matchKeys ?? [])]),
        schemaVersion: chooseLongerOptionalText(merged.schemaVersion, current.schemaVersion),
        canonicalName: chooseLongerOptionalText(merged.canonicalName, current.canonicalName),
        legacyCompareKeys: dedupeStrings([...(merged.legacyCompareKeys ?? []), ...(current.legacyCompareKeys ?? [])]),
        bindings: mergeTakeoverBindings(merged.bindings, current.bindings),
        status: chooseLongerOptionalText(merged.status, current.status),
        importance: Math.max(Number(merged.importance) || 0, Number(current.importance) || 0) || undefined,
        reasonCodes: dedupeStrings([...(merged.reasonCodes ?? []), ...(current.reasonCodes ?? [])]),
        timeContext: pickLaterTimeContext(merged.timeContext, current.timeContext),
        firstObservedAt: pickEarlierTimeContext(merged.firstObservedAt, current.firstObservedAt),
        lastObservedAt: pickLaterTimeContext(merged.lastObservedAt, current.lastObservedAt),
        validFrom: pickEarlierTimeContext(merged.validFrom, current.validFrom),
        validTo: pickLaterTimeContext(merged.validTo, current.validTo),
        ongoing: resolveOngoingFlag(merged.ongoing, current.ongoing),
    }), {
        type: String(records[0]?.type ?? '').trim(),
        subject: String(records[0]?.subject ?? '').trim(),
        predicate: String(records[0]?.predicate ?? '').trim(),
        value: String(records[0]?.value ?? '').trim(),
        confidence: Number(records[0]?.confidence) || 0,
        entityKey: String(records[0]?.entityKey ?? '').trim() || undefined,
        title: String(records[0]?.title ?? '').trim() || undefined,
        summary: String(records[0]?.summary ?? '').trim() || undefined,
        compareKey: String(records[0]?.compareKey ?? '').trim() || undefined,
        matchKeys: [],
        schemaVersion: String(records[0]?.schemaVersion ?? '').trim() || undefined,
        canonicalName: String(records[0]?.canonicalName ?? '').trim() || undefined,
        legacyCompareKeys: [],
        bindings: undefined,
        status: String(records[0]?.status ?? '').trim() || undefined,
        importance: Number(records[0]?.importance) || undefined,
        reasonCodes: [],
        timeContext: records[0]?.timeContext,
        firstObservedAt: records[0]?.firstObservedAt,
        lastObservedAt: records[0]?.lastObservedAt,
        validFrom: records[0]?.validFrom,
        validTo: records[0]?.validTo,
        ongoing: records[0]?.ongoing,
    });
}

/**
 * 功能：按楼层顺序优先选择更早的时间上下文。
 * @param current 当前时间。
 * @param next 新时间。
 * @returns 更早的时间。
 */
function pickEarlierTimeContext(
    current?: MemoryTimeContext,
    next?: MemoryTimeContext,
): MemoryTimeContext | undefined {
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    return next.sequenceTime.firstFloor <= current.sequenceTime.firstFloor ? next : current;
}

/**
 * 功能：按楼层顺序优先选择更新的时间上下文。
 * @param current 当前时间。
 * @param next 新时间。
 * @returns 更新的时间。
 */
function pickLaterTimeContext(
    current?: MemoryTimeContext,
    next?: MemoryTimeContext,
): MemoryTimeContext | undefined {
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    return next.sequenceTime.lastFloor >= current.sequenceTime.lastFloor ? next : current;
}

/**
 * 功能：合并持续状态标记。
 * @param current 当前标记。
 * @param next 新标记。
 * @returns 合并后的持续状态。
 */
function resolveOngoingFlag(current?: boolean, next?: boolean): boolean | undefined {
    if (next === false || current === false) {
        return false;
    }
    if (next === true || current === true) {
        return true;
    }
    return undefined;
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
        return String(row.compareKey ?? '').trim() || String(row.task ?? '').trim();
    }
    if (domain === 'world') {
        return String(row.compareKey ?? '').trim() || String(row.key ?? '').trim();
    }
    if (domain === 'fact') {
        return String(row.compareKey ?? '').trim() || buildStableFactKey(row as unknown as MemoryTakeoverStableFact);
    }
    return JSON.stringify(row);
}

/**
 * 功能：构造稳定事实主键。
 * @param record 稳定事实。
 * @returns 稳定事实主键。
 */
function buildStableFactKey(record: MemoryTakeoverStableFact): string {
    return [
        String(record.type ?? '').trim(),
        String(record.subject ?? '').trim(),
        String(record.predicate ?? '').trim(),
    ].join('::');
}

/**
 * 功能：优先保留更可信或更长的事实值。
 * @param current 当前事实。
 * @param next 新事实。
 * @returns 选择后的事实值。
 */
function choosePreferredFactValue(current: MemoryTakeoverStableFact, next: MemoryTakeoverStableFact): string {
    const currentConfidence = Number(current.confidence) || 0;
    const nextConfidence = Number(next.confidence) || 0;
    if (nextConfidence > currentConfidence) {
        return String(next.value ?? '').trim();
    }
    if (currentConfidence > nextConfidence) {
        return String(current.value ?? '').trim();
    }
    return chooseLongerText(current.value, next.value);
}

/**
 * 功能：优先保留更长的文本。
 * @param currentValue 当前值。
 * @param nextValue 新值。
 * @returns 选择后的文本。
 */
function chooseLongerText(currentValue: unknown, nextValue: unknown): string {
    const current = String(currentValue ?? '').trim();
    const next = String(nextValue ?? '').trim();
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    return next.length >= current.length ? next : current;
}

/**
 * 功能：优先保留更长的可选文本。
 * @param currentValue 当前值。
 * @param nextValue 新值。
 * @returns 选择后的可选文本。
 */
function chooseLongerOptionalText(currentValue: unknown, nextValue: unknown): string | undefined {
    const resolved = chooseLongerText(currentValue, nextValue);
    return resolved || undefined;
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
