import {
    loadMemoryTakeoverBatchMetas,
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryTakeoverPlan,
    saveMemoryTakeoverBatchMeta,
    saveMemoryTakeoverBatchResult,
    saveMemoryTakeoverPreview,
    writeMemoryTakeoverPlan,
} from '../db/db';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBaseline,
    MemoryTakeoverBatch,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverPlan,
    MemoryTakeoverProgressSnapshot,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { appendTakeoverDiagnostics } from './takeover-diagnostics';
import { runTakeoverActiveSnapshot } from './takeover-active-snapshot';
import { runTakeoverBaseline } from './takeover-baseline';
import { runTakeoverBatch } from './takeover-batch-runner';
import { runTakeoverConsolidation } from './takeover-consolidator';
import { buildTakeoverBatches } from './takeover-planner';
import { collectTakeoverSourceBundle, sliceTakeoverMessages } from './takeover-source';

/**
 * 功能：执行完整旧聊天接管任务。
 * @param input 调度输入。
 * @returns 接管进度快照。
 */
export async function runTakeoverScheduler(input: {
    chatKey: string;
    plan: MemoryTakeoverPlan;
    llm: MemoryLLMApi | null;
    pluginId: string;
    applyConsolidation: (result: MemoryTakeoverConsolidationResult) => Promise<void>;
}): Promise<MemoryTakeoverProgressSnapshot> {
    const sourceBundle = collectTakeoverSourceBundle();
    const batches = buildTakeoverBatches({
        takeoverId: input.plan.takeoverId,
        range: input.plan.range,
        activeWindow: input.plan.activeWindow,
        batchSize: input.plan.batchSize,
    });
    let plan: MemoryTakeoverPlan = {
        ...input.plan,
        status: 'running',
        totalFloors: sourceBundle.totalFloors,
        totalBatches: batches.length,
        updatedAt: Date.now(),
    };
    await writeMemoryTakeoverPlan(input.chatKey, plan);
    await appendTakeoverDiagnostics({
        chatKey: input.chatKey,
        takeoverId: plan.takeoverId,
        level: 'info',
        stage: 'scheduler',
        message: '旧聊天接管任务开始执行。',
        detail: {
            totalFloors: sourceBundle.totalFloors,
            totalBatches: batches.length,
        },
    });

    const baseline: MemoryTakeoverBaseline = await runTakeoverBaseline({
        llm: input.llm,
        pluginId: input.pluginId,
        sourceBundle,
    });
    await saveMemoryTakeoverPreview(input.chatKey, 'baseline', baseline);

    let activeSnapshot: MemoryTakeoverActiveSnapshot | null = null;
    if (plan.useActiveSnapshot && plan.activeWindow) {
        const activeMessages = sliceTakeoverMessages(sourceBundle, plan.activeWindow);
        activeSnapshot = await runTakeoverActiveSnapshot({
            llm: input.llm,
            pluginId: input.pluginId,
            range: plan.activeWindow,
            messages: activeMessages,
        });
        await saveMemoryTakeoverPreview(input.chatKey, 'active_snapshot', activeSnapshot);
    }

    const completedBatchIds = new Set<string>();
    const failedBatchIds = new Set<string>();
    const allBatchResults = await loadMemoryTakeoverBatchResults(input.chatKey);
    const batchResultMap = new Map(allBatchResults.map((item) => [item.batchId, item]));

    for (const batch of batches) {
        const latestPlan = await readMemoryTakeoverPlan(input.chatKey);
        if (latestPlan && latestPlan.status === 'paused') {
            return buildProgressSnapshot(input.chatKey, latestPlan);
        }
        if (latestPlan && latestPlan.status === 'failed') {
            return buildProgressSnapshot(input.chatKey, latestPlan);
        }

        const runningBatch: MemoryTakeoverBatch = {
            ...batch,
            status: 'running',
            attemptCount: batch.attemptCount + 1,
            startedAt: Date.now(),
        };
        await saveMemoryTakeoverBatchMeta(input.chatKey, runningBatch);
        try {
            const messages = sliceTakeoverMessages(sourceBundle, batch.range);

            const sliceRoleStats: Record<string, number> = {};
            for (const msg of messages) {
                sliceRoleStats[msg.role] = (sliceRoleStats[msg.role] || 0) + 1;
            }
            await appendTakeoverDiagnostics({
                chatKey: input.chatKey,
                takeoverId: plan.takeoverId,
                level: (messages.length > 0 && (!sliceRoleStats['user'] || !sliceRoleStats['assistant'])) ? 'warn' : 'info',
                stage: 'batch_slice',
                message: `批次 ${batch.batchId} 消息切片完成。`,
                detail: {
                    batchId: batch.batchId,
                    range: batch.range,
                    messageCount: messages.length,
                    roleStats: sliceRoleStats,
                },
            });

            const result = await runTakeoverBatch({
                llm: input.llm,
                pluginId: input.pluginId,
                batch: runningBatch,
                totalBatches: batches.length,
                messages,
            });
            batchResultMap.set(result.batchId, result);
            completedBatchIds.add(result.batchId);
            failedBatchIds.delete(result.batchId);
            await saveMemoryTakeoverBatchResult(input.chatKey, result);
            await saveMemoryTakeoverPreview(input.chatKey, 'latest_batch', result);
            await saveMemoryTakeoverBatchMeta(input.chatKey, {
                ...runningBatch,
                status: 'completed',
                finishedAt: Date.now(),
            });
            plan = {
                ...plan,
                currentBatchIndex: batch.batchIndex,
                completedBatchIds: Array.from(completedBatchIds),
                failedBatchIds: Array.from(failedBatchIds),
                lastCheckpointAt: Date.now(),
                updatedAt: Date.now(),
            };
            await writeMemoryTakeoverPlan(input.chatKey, plan);
        } catch (error) {
            const errorMessage: string = String((error as Error)?.message ?? error);
            failedBatchIds.add(batch.batchId);
            await saveMemoryTakeoverBatchMeta(input.chatKey, {
                ...runningBatch,
                status: 'failed',
                finishedAt: Date.now(),
                error: errorMessage,
            });
            plan = {
                ...plan,
                status: plan.pauseOnError ? 'paused' : 'failed',
                currentBatchIndex: batch.batchIndex,
                completedBatchIds: Array.from(completedBatchIds),
                failedBatchIds: Array.from(failedBatchIds),
                lastError: errorMessage,
                lastCheckpointAt: Date.now(),
                updatedAt: Date.now(),
                pausedAt: plan.pauseOnError ? Date.now() : undefined,
            };
            await writeMemoryTakeoverPlan(input.chatKey, plan);
            await appendTakeoverDiagnostics({
                chatKey: input.chatKey,
                takeoverId: plan.takeoverId,
                level: 'error',
                stage: 'batch',
                message: '旧聊天接管批次执行失败。',
                detail: {
                    batchId: batch.batchId,
                    error: errorMessage,
                },
            });
            return buildProgressSnapshot(input.chatKey, plan);
        }
    }

    const consolidation = await runTakeoverConsolidation({
        llm: input.llm,
        pluginId: input.pluginId,
        takeoverId: plan.takeoverId,
        activeSnapshot,
        batchResults: Array.from(batchResultMap.values()).sort((left, right) => left.sourceRange.startFloor - right.sourceRange.startFloor),
    });
    await saveMemoryTakeoverPreview(input.chatKey, 'consolidation', consolidation);
    await input.applyConsolidation(consolidation);
    plan = {
        ...plan,
        status: 'completed',
        currentBatchIndex: Math.max(0, batches.length - 1),
        completedBatchIds: Array.from(completedBatchIds),
        failedBatchIds: Array.from(failedBatchIds),
        lastCheckpointAt: Date.now(),
        completedAt: Date.now(),
        updatedAt: Date.now(),
    };
    await writeMemoryTakeoverPlan(input.chatKey, plan);
    return buildProgressSnapshot(input.chatKey, plan);
}

/**
 * 功能：构建接管进度快照。
 * @param chatKey 聊天键。
 * @param plan 接管计划。
 * @returns 进度快照。
 */
export async function buildProgressSnapshot(chatKey: string, plan?: MemoryTakeoverPlan | null): Promise<MemoryTakeoverProgressSnapshot> {
    const currentPlan = plan ?? await readMemoryTakeoverPlan(chatKey);
    const batchMetas = await loadMemoryTakeoverBatchMetas(chatKey);
    const preview = await loadMemoryTakeoverPreview(chatKey);
    const currentBatch = batchMetas
        .slice()
        .sort((left, right) => (right.finishedAt ?? right.startedAt ?? 0) - (left.finishedAt ?? left.startedAt ?? 0))
        .find((item: MemoryTakeoverBatch): boolean => item.status === 'running' || item.status === 'failed' || item.status === 'completed')
        ?? null;
    return {
        plan: currentPlan,
        currentBatch,
        baseline: preview.baseline,
        activeSnapshot: preview.activeSnapshot,
        latestBatchResult: preview.latestBatch,
        consolidation: preview.consolidation,
    };
}
