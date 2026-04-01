import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchAuditReport,
    MemoryTakeoverBatchResult,
    MemoryTakeoverCandidateActorMention,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
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
 * - 输出 reducer 归并后的长期事实
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
    factLedger: PipelineDomainLedgerRecord<MemoryTakeoverStableFact>[];
    taskLedger: PipelineDomainLedgerRecord<MemoryTakeoverConsolidationResult['taskState'][number]>[];
    worldLedger: PipelineDomainLedgerRecord<MemoryTakeoverWorldStateChange>[];
    conflictPatches: ConflictResolutionPatch[];
    diagnostics: PipelineDiagnostics;
}): MemoryTakeoverConsolidationResult {
    const actorCards = applyPatches(input.actorLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'actor'));
    const entityCards = applyPatches(input.entityLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'entity'));
    const relationships = applyPatches(input.relationshipLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'relationship'));
    const longTermFacts = applyPatches(input.factLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'fact'));
    const taskState = applyPatches(input.taskLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'task'));
    const worldRecords = applyPatches(input.worldLedger, input.conflictPatches.filter((item: ConflictResolutionPatch): boolean => item.domain === 'world'));
    const worldState = Object.fromEntries(worldRecords.map((item) => [item.key, item.value]));
    const entityTransitions = collapseEntityTransitions(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverEntityTransition[] => item.entityTransitions ?? []));
    const candidateActors = dedupeCandidateActors(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverCandidateActorMention[] => item.candidateActors ?? []));
    const relationState = dedupeRelationState([
        ...relationships.map((item: MemoryTakeoverRelationshipCard) => ({
        target: item.targetActorKey,
        state: item.state,
        reason: item.summary,
        relationTag: item.relationTag,
        targetType: 'actor' as const,
        })),
        ...input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationTransition[] => item.relationTransitions ?? [])
            .filter((item: MemoryTakeoverRelationTransition): boolean => String(item.targetType ?? 'unknown').trim().toLowerCase() !== 'actor')
            .map((item: MemoryTakeoverRelationTransition) => ({
                target: item.target,
                state: item.to,
                reason: item.reason,
                relationTag: item.relationTag,
                targetType: item.targetType ?? 'unknown',
            })),
    ]);

    return {
        takeoverId: input.takeoverId,
        chapterDigestIndex: input.sectionDigests.map((item: PipelineSectionDigestRecord) => ({
            batchId: item.sectionId,
            range: resolveSectionRange(input.batchResults, item.batchIds),
            summary: item.summary,
            tags: item.batchIds,
        })),
        actorCards,
        candidateActors,
        relationships,
        entityCards,
        entityTransitions,
        longTermFacts,
        relationState,
        taskState,
        worldState,
        worldStateDetails: worldRecords,
        activeSnapshot: input.activeSnapshot,
        dedupeStats: {
            totalFacts: input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts ?? []).length,
            dedupedFacts: longTermFacts.length,
            relationUpdates: relationships.length,
            taskUpdates: taskState.length,
            worldUpdates: worldRecords.length,
        },
        conflictStats: {
            unresolvedFacts: input.factLedger.filter((item) => item.conflictState === 'unresolved').length,
            unresolvedRelations: input.relationshipLedger.filter((item) => item.conflictState === 'unresolved').length,
            unresolvedTasks: input.taskLedger.filter((item) => item.conflictState === 'unresolved').length,
            unresolvedWorldStates: input.worldLedger.filter((item) => item.conflictState === 'unresolved').length,
            unresolvedEntities: input.entityLedger.filter((item) => item.conflictState === 'unresolved').length,
        },
        conflictResolutions: input.conflictPatches.map((patch: ConflictResolutionPatch) => ({
            bucketId: patch.bucketId,
            domain: patch.domain,
            resolutions: patch.resolutions.map((resolution) => ({
                action: resolution.action,
                primaryKey: resolution.primaryKey,
                secondaryKeys: [...(resolution.secondaryKeys ?? [])],
                fieldOverrides: resolution.fieldOverrides ? { ...resolution.fieldOverrides } : {},
                selectedPrimaryKey: resolution.selectedPrimaryKey ?? resolution.primaryKey,
                selectedSnapshot: resolution.selectedSnapshot ? { ...resolution.selectedSnapshot } : {},
                selectionReason: resolution.selectionReason ?? '',
                appliedFieldNames: [...(resolution.appliedFieldNames ?? Object.keys(resolution.fieldOverrides ?? {}))],
                resolverSource: resolution.resolverSource ?? 'deterministic_fallback',
                reasonCodes: [...resolution.reasonCodes],
            })),
        })),
        pipelineDiagnostics: {
            batchCount: input.diagnostics.batchCount,
            sectionCount: input.diagnostics.sectionCount,
            conflictBucketCount: input.diagnostics.conflictBucketCount,
            resolvedConflictCount: input.diagnostics.resolvedConflictCount,
            unresolvedConflictCount: input.diagnostics.unresolvedConflictCount,
            ruleResolvedConflictCount: input.diagnostics.ruleResolvedConflictCount,
            llmResolvedConflictCount: input.diagnostics.llmResolvedConflictCount,
            batchedRequestCount: input.diagnostics.batchedRequestCount,
            avgBucketsPerRequest: input.diagnostics.avgBucketsPerRequest,
            skippedByRuleCount: input.diagnostics.skippedByRuleCount,
            fallbackUsed: input.diagnostics.fallbackUsed,
            usedLLM: input.diagnostics.usedLLM,
            reasonCode: input.diagnostics.reasonCode,
        },
        batchAudits: input.batchResults
            .map((item: MemoryTakeoverBatchResult): MemoryTakeoverBatchAuditReport | undefined => item.auditReport)
            .filter((item: MemoryTakeoverBatchAuditReport | undefined): item is MemoryTakeoverBatchAuditReport => Boolean(item)),
        generatedAt: Date.now(),
    };
}

/**
 * 功能：对最终关系状态做去重，避免 actor 关系卡与关系变更重复出现。
 * @param values 原始关系状态列表。
 * @returns 去重后的关系状态列表。
 */
function dedupeRelationState(
    values: MemoryTakeoverConsolidationResult['relationState'],
): MemoryTakeoverConsolidationResult['relationState'] {
    const map = new Map<string, MemoryTakeoverConsolidationResult['relationState'][number]>();
    values.forEach((item): void => {
        const key = [
            String(item.targetType ?? 'unknown').trim(),
            String(item.target ?? '').trim(),
            String(item.relationTag ?? '').trim(),
        ].join('::');
        if (!key || key === 'unknown::::') {
            return;
        }
        map.set(key, item);
    });
    return [...map.values()];
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
 * 功能：对候选角色提及做去重聚合。
 * @param mentions 原始候选角色提及。
 * @returns 去重后的候选列表。
 */
function dedupeCandidateActors(mentions: MemoryTakeoverCandidateActorMention[]): MemoryTakeoverCandidateActorMention[] {
    const map = new Map<string, MemoryTakeoverCandidateActorMention>();
    for (const mention of mentions) {
        const key = `${String(mention.actorKey ?? '').trim()}::${String(mention.name ?? '').trim()}`;
        if (!key || key === '::') {
            continue;
        }
        const current = map.get(key);
        if (!current || Number(mention.evidenceScore ?? 0) >= Number(current.evidenceScore ?? 0)) {
            map.set(key, mention);
        }
    }
    return [...map.values()];
}
