import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import type { ConflictResolutionPatch, PipelineConflictRecord } from '../pipeline/pipeline-types';
import { readMemoryOSSettings } from '../settings/store';
import { resolvePipelineBudgetPolicy } from '../pipeline/pipeline-budget';
import { createPipelineDiagnostics } from '../pipeline/pipeline-diagnostics';
import { upsertPipelineJobRecord, updatePipelineJobPhase } from '../pipeline/pipeline-job-store';
import {
    appendPipelineBatchResultRecord,
    clearPipelineLedgerState,
    listPipelineSectionDigestRecords,
    replacePipelineLedgerRecords,
    upsertPipelineSectionDigestRecord,
} from '../pipeline/pipeline-ledger-store';
import {
    clearPipelineConflictState,
    listPipelineConflictBucketRecords,
    resolvePipelineConflictBucket,
    upsertPipelineConflictBucketRecord,
} from '../pipeline/pipeline-conflict-store';
import {
    buildTakeoverSectionDigests,
    mapTakeoverRecordsToLedger,
    reduceTakeoverActors,
    reduceTakeoverEntities,
    reduceTakeoverFacts,
    reduceTakeoverRelationships,
    reduceTakeoverTasks,
    reduceTakeoverWorld,
} from './takeover-domain-ledger';
import { resolveTakeoverConflictBuckets } from './takeover-conflict-resolver';
import { finalizeTakeoverConsolidation } from './takeover-finalizer';
import {
    appendTakeoverStagingSnapshot,
    clearTakeoverStagingSnapshot,
    loadTakeoverStagingSnapshot,
    saveTakeoverStagingSnapshot,
} from './takeover-staging-store';

/**
 * 功能：执行旧聊天接管最终整合（新主链：冲突裁决 + 代码 finalize）。
 *
 * 新架构主链流程：
 * 1. 提取阶段（extract）：将 batchResults 登记到 pipeline ledger
 * 2. 归约阶段（reduce）：本地 dedupe / merge / collapse，输出 canonicalRecords + unresolvedConflicts
 * 3. 裁决阶段（resolve）：仅将 unresolvedConflicts 发送给 LLM 做最小裁决
 * 4. 应用阶段（apply）：代码 finalize，生成最终输出
 *
 * 默认主链不再执行 full consolidation，LLM 仅处理冲突桶。
 *
 * @param input 整合输入。
 * @returns 最终整合结果。
 */
export async function runTakeoverConsolidation(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    takeoverId: string;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    batchResults: MemoryTakeoverBatchResult[];
}): Promise<MemoryTakeoverConsolidationResult> {
    const admittedBatchResults = input.batchResults.filter((batch: MemoryTakeoverBatchResult): boolean => batch.validated !== false && batch.isolated !== true);
    const admittedBatchSignature = buildAdmittedBatchSignature(admittedBatchResults);
    const settings = readMemoryOSSettings();
    const budget = resolvePipelineBudgetPolicy(settings);
    const diagnostics = createPipelineDiagnostics(input.takeoverId, 'takeover');
    const existingStaging = await loadTakeoverStagingSnapshot(input.takeoverId);
    const matchedStaging = hasMatchingTakeoverStaging(existingStaging, input.takeoverId, admittedBatchSignature)
        ? existingStaging
        : null;
    const reusableStaging = canReuseTakeoverStaging(matchedStaging)
        ? matchedStaging
        : null;

    if (matchedStaging?.status === 'completed' && matchedStaging.finalResult) {
        return matchedStaging.finalResult;
    }

    upsertPipelineJobRecord({
        jobId: input.takeoverId,
        jobType: 'takeover',
        status: 'running',
        phase: 'extract',
        sourceMeta: {
            batchCount: input.batchResults.length,
            admittedBatchCount: admittedBatchResults.length,
            hasActiveSnapshot: Boolean(input.activeSnapshot),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    if (!reusableStaging) {
        clearPipelineLedgerState(input.takeoverId);
        clearPipelineConflictState(input.takeoverId);
    }
    if (existingStaging && !reusableStaging) {
        await clearTakeoverStagingSnapshot(input.takeoverId);
    }
    if (!reusableStaging) {
        await saveTakeoverStagingSnapshot(input.takeoverId, {
            takeoverId: input.takeoverId,
            admittedBatchSignature,
            status: 'running',
            activeSnapshot: input.activeSnapshot,
            batchResults: [],
            sectionDigests: [],
            reducedLedger: null,
            unresolvedConflicts: [],
            conflictPatches: [],
            finalResult: null,
        });
    }

    diagnostics.batchCount = input.batchResults.length;
    if (!reusableStaging || (reusableStaging.batchResults?.length ?? 0) <= 0) {
        for (const batch of admittedBatchResults) {
            appendPipelineBatchResultRecord({
                jobId: input.takeoverId,
                batchId: batch.batchId,
                domain: 'digest',
                sourceRange: batch.sourceRange,
                summary: batch.summary,
                rawStructuredResult: batch,
                normalizedStructuredResult: batch,
                tokenEstimateIn: batch.summary.length,
                tokenEstimateOut: JSON.stringify(batch).length,
                status: 'completed',
            });
        }
        await appendTakeoverStagingSnapshot(input.takeoverId, {
            batchResults: admittedBatchResults,
        });
    }

    updatePipelineJobPhase(input.takeoverId, 'reduce');
    const sectionDigests = (reusableStaging?.sectionDigests?.length ?? 0) > 0
        ? (reusableStaging?.sectionDigests ?? [])
        : buildTakeoverSectionDigests(input.takeoverId, admittedBatchResults, budget);
    for (const sectionDigest of sectionDigests) {
        upsertPipelineSectionDigestRecord(sectionDigest);
    }
    diagnostics.sectionCount = sectionDigests.length;

    const shouldReuseReducedLedger = Boolean(reusableStaging?.reducedLedger);
    const restoredActors = (reusableStaging?.reducedLedger?.actors ?? []) as MemoryTakeoverActorCardCandidate[];
    const restoredEntities = (reusableStaging?.reducedLedger?.entities ?? []) as MemoryTakeoverEntityCardCandidate[];
    const restoredRelationships = (reusableStaging?.reducedLedger?.relationships ?? []) as MemoryTakeoverRelationshipCard[];
    const restoredFacts = (reusableStaging?.reducedLedger?.facts ?? []) as MemoryTakeoverStableFact[];
    const restoredTasks = (reusableStaging?.reducedLedger?.tasks ?? []) as MemoryTakeoverConsolidationResult['taskState'];
    const restoredWorld = (reusableStaging?.reducedLedger?.world ?? []) as MemoryTakeoverWorldStateChange[];
    const actorReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredActors,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'actor'),
        }
        : reduceTakeoverActors(admittedBatchResults);
    const entityReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredEntities,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'entity'),
        }
        : reduceTakeoverEntities(admittedBatchResults);
    const relationshipReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredRelationships,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'relationship'),
        }
        : reduceTakeoverRelationships(admittedBatchResults);
    const factReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredFacts,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'fact'),
        }
        : reduceTakeoverFacts(admittedBatchResults);
    const taskReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredTasks,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'task'),
        }
        : reduceTakeoverTasks(admittedBatchResults);
    const worldReduce = shouldReuseReducedLedger
        ? {
            canonicalRecords: restoredWorld,
            unresolvedConflicts: filterConflictsByDomain(reusableStaging?.unresolvedConflicts ?? [], 'world'),
        }
        : reduceTakeoverWorld(admittedBatchResults);

    replacePipelineLedgerRecords([
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'actor', actorReduce.canonicalRecords, actorReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'entity', entityReduce.canonicalRecords, entityReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'relationship', relationshipReduce.canonicalRecords, relationshipReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'fact', factReduce.canonicalRecords, factReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'task', taskReduce.canonicalRecords, taskReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'world', worldReduce.canonicalRecords, worldReduce.unresolvedConflicts),
    ]);
    if (!shouldReuseReducedLedger) {
        await appendTakeoverStagingSnapshot(input.takeoverId, {
            sectionDigests,
            reducedLedger: {
                actors: actorReduce.canonicalRecords,
                entities: entityReduce.canonicalRecords,
                relationships: relationshipReduce.canonicalRecords,
                tasks: taskReduce.canonicalRecords,
                world: worldReduce.canonicalRecords,
                facts: factReduce.canonicalRecords,
            },
        });
    }

    const storedConflictPatches = reusableStaging?.conflictPatches ?? [];
    const conflictBuckets = ((reusableStaging?.unresolvedConflicts?.length ?? 0) > 0
        ? (reusableStaging?.unresolvedConflicts ?? [])
        : [
            ...actorReduce.unresolvedConflicts,
            ...entityReduce.unresolvedConflicts,
            ...relationshipReduce.unresolvedConflicts,
            ...factReduce.unresolvedConflicts,
            ...taskReduce.unresolvedConflicts,
            ...worldReduce.unresolvedConflicts,
        ]).map((item) => {
        const storedPatch = storedConflictPatches.find((patch: ConflictResolutionPatch): boolean => patch.bucketId === item.bucketId);
        return {
            jobId: input.takeoverId,
            bucketId: item.bucketId,
            domain: item.domain,
            conflictType: item.conflictType,
            records: item.records.slice(0, budget.maxConflictBucketSize),
            resolutionStatus: storedPatch ? resolveStoredPatchStatus(storedPatch) : 'pending' as const,
            resolutionResult: storedPatch,
        };
    });
    for (const bucket of conflictBuckets) {
        upsertPipelineConflictBucketRecord(bucket);
    }
    diagnostics.conflictBucketCount = conflictBuckets.length;
    diagnostics.unresolvedConflictCount = conflictBuckets.filter((item) => !item.resolutionResult).length;
    if ((reusableStaging?.unresolvedConflicts?.length ?? 0) <= 0) {
        await appendTakeoverStagingSnapshot(input.takeoverId, {
            unresolvedConflicts: conflictBuckets.map((item) => ({
                bucketId: item.bucketId,
                domain: item.domain,
                conflictType: item.conflictType,
                records: item.records,
            })),
        });
    }

    updatePipelineJobPhase(input.takeoverId, 'resolve');
    const pendingConflictBuckets = listPipelineConflictBucketRecords(input.takeoverId)
        .filter((item) => !item.resolutionResult);
    const conflictResolutionResult = pendingConflictBuckets.length > 0
        ? await resolveTakeoverConflictBuckets({
            llm: input.llm,
            pluginId: input.pluginId,
            buckets: pendingConflictBuckets,
            budget,
            useConflictResolver: settings.takeoverUseConflictResolver,
        })
        : {
            patches: storedConflictPatches,
            ruleResolvedCount: 0,
            llmResolvedCount: 0,
            batchedRequestCount: 0,
            skippedByRuleCount: 0,
            fallbackUsed: storedConflictPatches.some((patch: ConflictResolutionPatch): boolean => {
                return patch.resolutions.some((resolution) => resolution.reasonCodes.includes('deterministic_fallback'));
            }),
        };

    for (const patch of conflictResolutionResult.patches) {
        resolvePipelineConflictBucket(
            input.takeoverId,
            patch.bucketId,
            patch,
            patch.resolutions.some((item) => item.reasonCodes.includes('deterministic_fallback')),
        );
    }
    await appendTakeoverStagingSnapshot(input.takeoverId, {
        conflictPatches: listPipelineConflictBucketRecords(input.takeoverId)
            .map((item) => item.resolutionResult)
            .filter((item): item is ConflictResolutionPatch => Boolean(item)),
    });
    diagnostics.usedLLM = Boolean(input.llm) && conflictResolutionResult.llmResolvedCount > 0;
    diagnostics.resolvedConflictCount = conflictResolutionResult.patches.length;
    diagnostics.unresolvedConflictCount = Math.max(0, diagnostics.conflictBucketCount - diagnostics.resolvedConflictCount);
    diagnostics.ruleResolvedConflictCount = conflictResolutionResult.ruleResolvedCount;
    diagnostics.llmResolvedConflictCount = conflictResolutionResult.llmResolvedCount;
    diagnostics.batchedRequestCount = conflictResolutionResult.batchedRequestCount;
    diagnostics.avgBucketsPerRequest = conflictResolutionResult.batchedRequestCount > 0
        ? Number((conflictResolutionResult.llmResolvedCount / conflictResolutionResult.batchedRequestCount).toFixed(2))
        : 0;
    diagnostics.skippedByRuleCount = conflictResolutionResult.skippedByRuleCount;
    diagnostics.fallbackUsed = conflictResolutionResult.fallbackUsed;

    updatePipelineJobPhase(input.takeoverId, 'apply');
    const result = finalizeTakeoverConsolidation({
        takeoverId: input.takeoverId,
        activeSnapshot: input.activeSnapshot,
        batchResults: admittedBatchResults,
        sectionDigests: listPipelineSectionDigestRecords(input.takeoverId),
        actorLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'actor', actorReduce.canonicalRecords, actorReduce.unresolvedConflicts),
        entityLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'entity', entityReduce.canonicalRecords, entityReduce.unresolvedConflicts),
        relationshipLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'relationship', relationshipReduce.canonicalRecords, relationshipReduce.unresolvedConflicts),
        factLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'fact', factReduce.canonicalRecords, factReduce.unresolvedConflicts),
        taskLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'task', taskReduce.canonicalRecords, taskReduce.unresolvedConflicts),
        worldLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'world', worldReduce.canonicalRecords, worldReduce.unresolvedConflicts),
        conflictPatches: listPipelineConflictBucketRecords(input.takeoverId)
            .map((item) => item.resolutionResult)
            .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        diagnostics,
    });
    await appendTakeoverStagingSnapshot(input.takeoverId, {
        status: 'completed',
        finalResult: result,
    });

    upsertPipelineJobRecord({
        jobId: input.takeoverId,
        jobType: 'takeover',
        status: 'completed',
        phase: 'apply',
        sourceMeta: {
            batchCount: admittedBatchResults.length,
            sectionCount: diagnostics.sectionCount,
            conflictBucketCount: diagnostics.conflictBucketCount,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    return result;
}

/**
 * 功能：判断 staging 是否可以安全复用。
 * @param snapshot staging 快照。
 * @param takeoverId 接管任务 ID。
 * @param admittedBatchSignature 当前准入批次签名。
 * @returns 是否允许复用。
 */
function hasMatchingTakeoverStaging(
    snapshot: Awaited<ReturnType<typeof loadTakeoverStagingSnapshot>>,
    takeoverId: string,
    admittedBatchSignature: string,
): boolean {
    return Boolean(
        snapshot
        && snapshot.takeoverId === takeoverId
        && snapshot.admittedBatchSignature === admittedBatchSignature
    );
}

/**
 * 功能：判断 staging 是否可以继续执行。
 * @param snapshot staging 快照。
 * @returns 是否允许继续复用中间产物。
 */
function canReuseTakeoverStaging(
    snapshot: Awaited<ReturnType<typeof loadTakeoverStagingSnapshot>>,
): boolean {
    return Boolean(snapshot && snapshot.finalResult == null);
}

/**
 * 功能：构造准入批次签名，避免旧 staging 误复用。
 * @param batchResults 准入批次结果。
 * @returns 批次签名。
 */
function buildAdmittedBatchSignature(batchResults: MemoryTakeoverBatchResult[]): string {
    return batchResults
        .map((item: MemoryTakeoverBatchResult): string => {
            return [
                String(item.batchId ?? '').trim(),
                `${Math.trunc(Number(item.sourceRange.startFloor) || 0)}-${Math.trunc(Number(item.sourceRange.endFloor) || 0)}`,
                String(item.generatedAt ?? '').trim(),
            ].join('@');
        })
        .join('|');
}

/**
 * 功能：按领域筛选冲突记录。
 * @param conflicts 冲突记录列表。
 * @param domain 目标领域。
 * @returns 指定领域的冲突记录。
 */
function filterConflictsByDomain(conflicts: PipelineConflictRecord[], domain: PipelineConflictRecord['domain']): PipelineConflictRecord[] {
    return conflicts.filter((item: PipelineConflictRecord): boolean => item.domain === domain);
}

/**
 * 功能：根据已存补丁解析冲突桶状态。
 * @param patch 已存补丁。
 * @returns 冲突桶状态。
 */
function resolveStoredPatchStatus(patch: ConflictResolutionPatch): 'resolved' | 'fallback' {
    const usedFallback = patch.resolutions.some((resolution) => resolution.reasonCodes.includes('deterministic_fallback'));
    return usedFallback ? 'fallback' : 'resolved';
}
