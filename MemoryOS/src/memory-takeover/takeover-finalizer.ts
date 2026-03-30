import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverStableFact,
} from '../types';
import type {
    ConflictResolutionPatch,
    PipelineDiagnostics,
    PipelineDomainLedgerRecord,
    PipelineSectionDigestRecord,
} from '../pipeline/pipeline-types';

/**
 * 功能：本地完成旧聊天接管最终整合（代码 finalize 主链核心）。
 *
 * 此函数是新架构的核心 finalize 层：
 * - 应用冲突裁决补丁（applyPatches）
 * - 归并实体变更（collapseEntityTransitions）
 * - 去重稳定事实（dedupeFacts）
 * - 补齐结构默认值与统计信息
 *
 * 最终输出主要由代码决定，而不是由 LLM 重新生成完整文档。
 *
 * @param input Finalize 输入。
 * @returns 最终整合结果。
 */
export function finalizeTakeoverConsolidation(input: {
    takeoverId: string;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    batchResults: MemoryTakeoverBatchResult[];
    sectionDigests: PipelineSectionDigestRecord[];
    actorLedger: PipelineDomainLedgerRecord<MemoryTakeoverActorCardCandidate>[];
    entityLedger: PipelineDomainLedgerRecord<MemoryTakeoverEntityCardCandidate>[];
    relationshipLedger: PipelineDomainLedgerRecord<MemoryTakeoverRelationshipCard>[];
    taskLedger: PipelineDomainLedgerRecord<{
        task: string;
        state: string;
        title?: string;
        summary?: string;
        description?: string;
        goal?: string;
        compareKey?: string;
        bindings?: MemoryTakeoverConsolidationResult['taskState'][number]['bindings'];
        reasonCodes?: string[];
    }>[];
    worldLedger: PipelineDomainLedgerRecord<{ key: string; value: string }>[];
    conflictPatches: ConflictResolutionPatch[];
    diagnostics: PipelineDiagnostics;
}): MemoryTakeoverConsolidationResult {
    const actorCards = applyPatches(input.actorLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'actor'));
    const entityCards = applyPatches(input.entityLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'entity'));
    const relationships = applyPatches(input.relationshipLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'relationship'));
    const taskState = input.taskLedger.map((item) => item.canonicalRecord);
    const worldRecords = input.worldLedger.map((item) => item.canonicalRecord);
    const worldState = Object.fromEntries(worldRecords.map((item) => [item.key, item.value]));
    const entityTransitions = collapseEntityTransitions(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverEntityTransition[] => item.entityTransitions ?? []));
    const longTermFacts = dedupeFacts(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts ?? []));
    const relationState = relationships.map((item: MemoryTakeoverRelationshipCard) => ({
        target: item.targetActorKey,
        state: item.state,
        reason: item.summary,
        relationTag: item.relationTag,
        targetType: 'actor' as const,
    }));

    return {
        takeoverId: input.takeoverId,
        chapterDigestIndex: input.sectionDigests.map((item: PipelineSectionDigestRecord) => ({
            batchId: item.sectionId,
            range: resolveSectionRange(input.batchResults, item.batchIds),
            summary: item.summary,
            tags: item.batchIds,
        })),
        actorCards,
        relationships,
        entityCards,
        entityTransitions,
        longTermFacts,
        relationState,
        taskState,
        worldState,
        activeSnapshot: input.activeSnapshot,
        dedupeStats: {
            totalFacts: input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts ?? []).length,
            dedupedFacts: longTermFacts.length,
            relationUpdates: relationships.length,
            taskUpdates: taskState.length,
            worldUpdates: worldRecords.length,
        },
        conflictStats: {
            unresolvedFacts: 0,
            unresolvedRelations: input.diagnostics.unresolvedConflictCount,
            unresolvedTasks: 0,
            unresolvedWorldStates: 0,
            unresolvedEntities: input.entityLedger.filter((item) => item.conflictState === 'unresolved').length,
        },
        generatedAt: Date.now(),
    };
}

/**
 * 功能：应用冲突补丁。
 * @param ledger 账本记录。
 * @param patches 领域补丁。
 * @returns 最终记录列表。
 */
function applyPatches<TRecord>(
    ledger: PipelineDomainLedgerRecord<TRecord>[],
    patches: ConflictResolutionPatch[],
): TRecord[] {
    const map = new Map<string, TRecord>(ledger.map((item) => [item.ledgerKey, { ...item.canonicalRecord }]));
    for (const patch of patches) {
        for (const resolution of patch.resolutions) {
            const primaryKey = String(resolution.primaryKey ?? '').trim();
            if (!primaryKey) {
                continue;
            }
            const primary = map.get(primaryKey);
            if (!primary) {
                continue;
            }
            map.set(primaryKey, {
                ...(primary as object),
                ...(resolution.fieldOverrides ?? {}),
            } as TRecord);
            for (const secondaryKey of resolution.secondaryKeys ?? []) {
                if (secondaryKey && secondaryKey !== primaryKey) {
                    map.delete(secondaryKey);
                }
            }
            if (resolution.action === 'invalidate') {
                map.delete(primaryKey);
            }
        }
    }
    return [...map.values()];
}

/**
 * 功能：解析 section 范围。
 * @param batchResults 批次结果。
 * @param batchIds section 包含的批次标识。
 * @returns 聚合范围。
 */
function resolveSectionRange(batchResults: MemoryTakeoverBatchResult[], batchIds: string[]): { startFloor: number; endFloor: number } {
    const matched = batchResults.filter((item: MemoryTakeoverBatchResult): boolean => batchIds.includes(item.batchId));
    if (matched.length <= 0) {
        return { startFloor: 0, endFloor: 0 };
    }
    return {
        startFloor: Math.min(...matched.map((item: MemoryTakeoverBatchResult): number => item.sourceRange.startFloor)),
        endFloor: Math.max(...matched.map((item: MemoryTakeoverBatchResult): number => item.sourceRange.endFloor)),
    };
}

/**
 * 功能：归并实体变更。
 * @param transitions 原始实体变更。
 * @returns 去重后的实体变更。
 */
function collapseEntityTransitions(transitions: MemoryTakeoverEntityTransition[]): MemoryTakeoverEntityTransition[] {
    const map = new Map<string, MemoryTakeoverEntityTransition>();
    for (const transition of transitions) {
        const compareKey = String(transition.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        map.set(compareKey, transition);
    }
    return [...map.values()];
}

/**
 * 功能：去重稳定事实。
 * @param facts 原始事实列表。
 * @returns 去重后的事实列表。
 */
function dedupeFacts(facts: MemoryTakeoverStableFact[]): MemoryTakeoverStableFact[] {
    const map = new Map<string, MemoryTakeoverStableFact>();
    for (const fact of facts) {
        const key = `${fact.type}::${fact.subject}::${fact.predicate}::${fact.value}`;
        const current = map.get(key);
        if (!current || Number(fact.confidence ?? 0) >= Number(current.confidence ?? 0)) {
            map.set(key, fact);
        }
    }
    return [...map.values()];
}
