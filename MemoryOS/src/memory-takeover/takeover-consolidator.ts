import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
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
    reduceTakeoverRelationships,
    reduceTakeoverTasks,
    reduceTakeoverWorld,
} from './takeover-domain-ledger';
import { resolveTakeoverConflictBuckets } from './takeover-conflict-resolver';
import { finalizeTakeoverConsolidation } from './takeover-finalizer';
import {
    appendTakeoverStagingSnapshot,
    clearTakeoverStagingSnapshot,
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
    const settings = readMemoryOSSettings();
    const budget = resolvePipelineBudgetPolicy(settings);
    const diagnostics = createPipelineDiagnostics(input.takeoverId, 'takeover');

    upsertPipelineJobRecord({
        jobId: input.takeoverId,
        jobType: 'takeover',
        status: 'running',
        phase: 'extract',
        sourceMeta: {
            batchCount: input.batchResults.length,
            hasActiveSnapshot: Boolean(input.activeSnapshot),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    clearPipelineLedgerState(input.takeoverId);
    clearPipelineConflictState(input.takeoverId);
    await clearTakeoverStagingSnapshot(input.takeoverId);
    await saveTakeoverStagingSnapshot(input.takeoverId, {
        takeoverId: input.takeoverId,
        status: 'running',
        activeSnapshot: input.activeSnapshot,
        batchResults: [],
        sectionDigests: [],
        reducedLedger: null,
        unresolvedConflicts: [],
        finalResult: null,
    });

    diagnostics.batchCount = input.batchResults.length;
    for (const batch of input.batchResults) {
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
        batchResults: input.batchResults,
    });

    updatePipelineJobPhase(input.takeoverId, 'reduce');
    const sectionDigests = buildTakeoverSectionDigests(input.takeoverId, input.batchResults, budget);
    for (const sectionDigest of sectionDigests) {
        upsertPipelineSectionDigestRecord(sectionDigest);
    }
    diagnostics.sectionCount = sectionDigests.length;

    const actorReduce = reduceTakeoverActors(input.batchResults);
    const entityReduce = reduceTakeoverEntities(input.batchResults);
    const relationshipReduce = reduceTakeoverRelationships(input.batchResults);
    const taskReduce = reduceTakeoverTasks(input.batchResults);
    const worldReduce = reduceTakeoverWorld(input.batchResults);

    replacePipelineLedgerRecords([
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'actor', actorReduce.canonicalRecords, actorReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'entity', entityReduce.canonicalRecords, entityReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'relationship', relationshipReduce.canonicalRecords, relationshipReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'task', taskReduce.canonicalRecords, taskReduce.unresolvedConflicts),
        ...mapTakeoverRecordsToLedger(input.takeoverId, 'world', worldReduce.canonicalRecords, worldReduce.unresolvedConflicts),
    ]);
    await appendTakeoverStagingSnapshot(input.takeoverId, {
        sectionDigests,
        reducedLedger: {
            actors: actorReduce.canonicalRecords,
            entities: entityReduce.canonicalRecords,
            relationships: relationshipReduce.canonicalRecords,
            tasks: taskReduce.canonicalRecords,
            world: worldReduce.canonicalRecords,
        },
    });

    const conflictBuckets = [
        ...actorReduce.unresolvedConflicts,
        ...entityReduce.unresolvedConflicts,
        ...relationshipReduce.unresolvedConflicts,
        ...taskReduce.unresolvedConflicts,
        ...worldReduce.unresolvedConflicts,
    ].map((item) => ({
        jobId: input.takeoverId,
        bucketId: item.bucketId,
        domain: item.domain,
        conflictType: item.conflictType,
        records: item.records.slice(0, budget.maxConflictBucketSize),
        resolutionStatus: 'pending' as const,
    }));

    for (const bucket of conflictBuckets) {
        upsertPipelineConflictBucketRecord(bucket);
    }
    diagnostics.conflictBucketCount = conflictBuckets.length;
    diagnostics.unresolvedConflictCount = conflictBuckets.length;
    await appendTakeoverStagingSnapshot(input.takeoverId, {
        unresolvedConflicts: conflictBuckets.map((item) => ({
            bucketId: item.bucketId,
            domain: item.domain,
            conflictType: item.conflictType,
            records: item.records,
        })),
    });

    updatePipelineJobPhase(input.takeoverId, 'resolve');
    const patches = await resolveTakeoverConflictBuckets({
        llm: input.llm,
        pluginId: input.pluginId,
        buckets: listPipelineConflictBucketRecords(input.takeoverId),
        budget,
        useConflictResolver: settings.takeoverUseConflictResolver,
    });

    for (const patch of patches) {
        resolvePipelineConflictBucket(
            input.takeoverId,
            patch.bucketId,
            patch,
            patch.resolutions.some((item) => item.reasonCodes.includes('deterministic_fallback')),
        );
    }
    diagnostics.usedLLM = Boolean(input.llm) && patches.length > 0;
    diagnostics.resolvedConflictCount = patches.length;
    diagnostics.unresolvedConflictCount = Math.max(0, diagnostics.conflictBucketCount - diagnostics.resolvedConflictCount);
    diagnostics.fallbackUsed = patches.some((item) => item.resolutions.some((resolution) => resolution.reasonCodes.includes('deterministic_fallback')));

    updatePipelineJobPhase(input.takeoverId, 'apply');
    const result = finalizeTakeoverConsolidation({
        takeoverId: input.takeoverId,
        activeSnapshot: input.activeSnapshot,
        batchResults: input.batchResults,
        sectionDigests: listPipelineSectionDigestRecords(input.takeoverId),
        actorLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'actor', actorReduce.canonicalRecords, actorReduce.unresolvedConflicts),
        entityLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'entity', entityReduce.canonicalRecords, entityReduce.unresolvedConflicts),
        relationshipLedger: mapTakeoverRecordsToLedger(input.takeoverId, 'relationship', relationshipReduce.canonicalRecords, relationshipReduce.unresolvedConflicts),
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
            batchCount: input.batchResults.length,
            sectionCount: diagnostics.sectionCount,
            conflictBucketCount: diagnostics.conflictBucketCount,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    return result;
}
