import {
    loadMemoryTakeoverBatchMetas,
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryTakeoverPlan,
    saveCandidateActorMentions,
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
import { readMemoryOSSettings } from '../settings/store';
import { appendTakeoverDiagnostics } from './takeover-diagnostics';
import { runTakeoverActiveSnapshot } from './takeover-active-snapshot';
import { admitTakeoverBatchResult } from './takeover-batch-admission';
import { runTakeoverBaseline } from './takeover-baseline';
import { assembleTakeoverBatchPromptAssembly, runTakeoverBatch } from './takeover-batch-runner';
import { runTakeoverConsolidation } from './takeover-consolidator';
import { buildTakeoverBatches, validateTakeoverBatchCoverage } from './takeover-planner';
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
    skipInitialWait?: boolean;
    existingKnownEntities?: {
        actors: Array<{ actorKey: string; displayName: string }>;
        organizations: Array<{ entityKey: string; displayName: string }>;
        cities: Array<{ entityKey: string; displayName: string }>;
        nations: Array<{ entityKey: string; displayName: string }>;
        locations: Array<{ entityKey: string; displayName: string }>;
        tasks: Array<{ entityKey: string; displayName: string }>;
        worldStates: Array<{ entityKey: string; displayName: string }>;
    };
    applyConsolidation: (result: MemoryTakeoverConsolidationResult) => Promise<void>;
}): Promise<MemoryTakeoverProgressSnapshot> {
    const settings = readMemoryOSSettings();
    const requestIntervalMs = Math.max(0, Math.trunc(Number(settings.takeoverRequestIntervalSeconds) || 0)) * 1000;
    let shouldSkipNextWait: boolean = input.skipInitialWait === true;
    const sourceBundle = collectTakeoverSourceBundle();
    const batches = buildTakeoverBatches({
        takeoverId: input.plan.takeoverId,
        range: input.plan.range,
        activeWindow: input.plan.activeWindow,
        batchSize: input.plan.batchSize,
    });
    const coverage = validateTakeoverBatchCoverage(input.plan.range, batches);
    if (!coverage.covered) {
        const uncoveredText = coverage.uncoveredRanges.map((item: MemoryTakeoverPlan['range']): string => `${item.startFloor}-${item.endFloor}`).join('、');
        throw new Error(`takeover_batch_range_uncovered:${uncoveredText}`);
    }
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
            coverage: `${input.plan.range.startFloor}-${input.plan.range.endFloor}`,
        },
    });

    const preview = await loadMemoryTakeoverPreview(input.chatKey);
    const baseline: MemoryTakeoverBaseline = preview.baseline ?? await runTakeoverBaseline({
        llm: input.llm,
        pluginId: input.pluginId,
        sourceBundle,
    });
    if (!preview.baseline) {
        await saveMemoryTakeoverPreview(input.chatKey, 'baseline', baseline);
    }

    let activeSnapshot: MemoryTakeoverActiveSnapshot | null = preview.activeSnapshot ?? null;
    if (plan.useActiveSnapshot && plan.activeWindow) {
        if (!activeSnapshot) {
            shouldSkipNextWait = await waitTakeoverRequestInterval(
                input.chatKey,
                plan.takeoverId,
                requestIntervalMs,
                'active_snapshot_wait',
                undefined,
                shouldSkipNextWait,
            );
            const activeMessages = sliceTakeoverMessages(sourceBundle, plan.activeWindow);
            const activeAssembly = await assembleTakeoverBatchPromptAssembly({
                llm: input.llm,
                pluginId: input.pluginId,
                messages: activeMessages,
            });
            activeSnapshot = await runTakeoverActiveSnapshot({
                llm: input.llm,
                pluginId: input.pluginId,
                range: plan.activeWindow,
                messages: activeAssembly.extractionMessages,
                hintContext: activeAssembly.channels.hintText || undefined,
            });
            await saveMemoryTakeoverPreview(input.chatKey, 'active_snapshot', activeSnapshot);
        }
    }

    const completedBatchIds = new Set<string>(input.plan.completedBatchIds ?? []);
    const failedBatchIds = new Set<string>(input.plan.failedBatchIds ?? []);
    const isolatedBatchIds = new Set<string>(input.plan.isolatedBatchIds ?? []);
    const requestedRetryBatchId = String(input.plan.requestedRetryBatchId ?? '').trim();
    const allBatchResults = await loadMemoryTakeoverBatchResults(input.chatKey);
    const batchResultMap = new Map(allBatchResults.map((item) => [item.batchId, item]));
    for (const batchId of batchResultMap.keys()) {
        completedBatchIds.add(batchId);
        failedBatchIds.delete(batchId);
    }
    const historyBatches = batches.filter((item: MemoryTakeoverBatch): boolean => item.category === 'history');

    for (const batch of batches) {
        const latestPlan = await readMemoryTakeoverPlan(input.chatKey);
        if (latestPlan && latestPlan.status === 'paused') {
            return buildProgressSnapshot(input.chatKey, latestPlan);
        }
        if (latestPlan && latestPlan.status === 'failed') {
            return buildProgressSnapshot(input.chatKey, latestPlan);
        }
        if (completedBatchIds.has(batch.batchId) || isolatedBatchIds.has(batch.batchId)) {
            failedBatchIds.delete(batch.batchId);
            continue;
        }
        if (requestedRetryBatchId && failedBatchIds.has(batch.batchId) && batch.batchId !== requestedRetryBatchId) {
            continue;
        }

        const runningBatch: MemoryTakeoverBatch = {
            ...batch,
            status: 'running',
            attemptCount: batch.attemptCount + 1,
            startedAt: Date.now(),
        };
        await saveMemoryTakeoverBatchMeta(input.chatKey, runningBatch);
        try {
            shouldSkipNextWait = await waitTakeoverRequestInterval(
                input.chatKey,
                plan.takeoverId,
                requestIntervalMs,
                'batch_wait',
                batch.batchId,
                shouldSkipNextWait,
            );
            const messages = sliceTakeoverMessages(sourceBundle, batch.range);
            const previousBatchResults = Array.from(batchResultMap.values())
                .filter((item) => item.sourceRange.endFloor < batch.range.startFloor)
                .sort((left, right) => left.sourceRange.startFloor - right.sourceRange.startFloor);

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
                historyBatchIndex: historyBatches.findIndex((item: MemoryTakeoverBatch): boolean => item.batchId === batch.batchId) + 1,
                historyBatchTotal: historyBatches.length,
                messages,
                previousBatchResults,
                existingKnownEntities: input.existingKnownEntities,
            });
            const admission = admitTakeoverBatchResult(result);
            await saveMemoryTakeoverPreview(input.chatKey, 'latest_batch', admission.result);
            if (admission.accepted) {
                batchResultMap.set(admission.result.batchId, admission.result);
                completedBatchIds.add(admission.result.batchId);
                failedBatchIds.delete(admission.result.batchId);
                isolatedBatchIds.delete(admission.result.batchId);
                await saveMemoryTakeoverBatchResult(input.chatKey, admission.result);
                await saveCandidateActorMentions(input.chatKey, admission.result.candidateActors ?? []);
                await saveMemoryTakeoverBatchMeta(input.chatKey, {
                    ...runningBatch,
                    status: 'completed',
                    admissionState: admission.result.repairedOnce ? 'repaired' : 'validated',
                    repairedOnce: admission.result.repairedOnce,
                    validationErrors: [],
                    finishedAt: Date.now(),
                });
            } else {
                isolatedBatchIds.add(admission.result.batchId);
                failedBatchIds.delete(admission.result.batchId);
                await saveMemoryTakeoverBatchMeta(input.chatKey, {
                    ...runningBatch,
                    status: 'isolated',
                    admissionState: 'isolated',
                    repairedOnce: true,
                    validationErrors: admission.validationErrors,
                    error: `admission_isolated:${admission.validationErrors.join('；')}`,
                    finishedAt: Date.now(),
                });
                await appendTakeoverDiagnostics({
                    chatKey: input.chatKey,
                    takeoverId: plan.takeoverId,
                    level: 'warn',
                    stage: 'admission',
                    message: '旧聊天接管批次准入失败，已隔离当前批次。',
                    detail: {
                        batchId: admission.result.batchId,
                        sourceRange: admission.result.sourceRange,
                        repairedOnce: true,
                        validationErrors: admission.validationErrors,
                        repairActions: admission.repairActions,
                        disposition: 'isolated',
                    },
                });
            }
            plan = {
                ...plan,
                currentBatchIndex: batch.batchIndex,
                completedBatchIds: Array.from(completedBatchIds),
                failedBatchIds: Array.from(failedBatchIds),
                isolatedBatchIds: Array.from(isolatedBatchIds),
                requestedRetryBatchId: requestedRetryBatchId && admission.result.batchId === requestedRetryBatchId
                    ? undefined
                    : requestedRetryBatchId || undefined,
                lastError: admission.accepted ? undefined : `admission_isolated:${admission.validationErrors.join('；')}`,
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
                isolatedBatchIds: Array.from(isolatedBatchIds),
                requestedRetryBatchId: requestedRetryBatchId || undefined,
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

    if (failedBatchIds.size > 0) {
        plan = {
            ...plan,
            status: 'paused',
            completedBatchIds: Array.from(completedBatchIds),
            failedBatchIds: Array.from(failedBatchIds),
            isolatedBatchIds: Array.from(isolatedBatchIds),
            requestedRetryBatchId: undefined,
            updatedAt: Date.now(),
            pausedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(input.chatKey, plan);
        return buildProgressSnapshot(input.chatKey, plan);
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
        isolatedBatchIds: Array.from(isolatedBatchIds),
        requestedRetryBatchId: undefined,
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
    const batchResults = await loadMemoryTakeoverBatchResults(chatKey);
    const currentBatch = batchMetas
        .slice()
        .sort((left, right) => (right.finishedAt ?? right.startedAt ?? 0) - (left.finishedAt ?? left.startedAt ?? 0))
        .find((item: MemoryTakeoverBatch): boolean => item.status === 'running' || item.status === 'failed' || item.status === 'completed' || item.status === 'isolated')
        ?? null;
    return {
        plan: currentPlan,
        currentBatch,
        baseline: preview.baseline,
        activeSnapshot: preview.activeSnapshot,
        latestBatchResult: preview.latestBatch,
        consolidation: preview.consolidation,
        batchResults,
    };
}

async function waitTakeoverRequestInterval(
    chatKey: string,
    takeoverId: string,
    intervalMs: number,
    stage: string,
    batchId?: string,
    skipWait: boolean = false,
): Promise<boolean> {
    if (skipWait) {
        await appendTakeoverDiagnostics({
            chatKey,
            takeoverId,
            level: 'info',
            stage,
            message: batchId
                ? `批次 ${batchId} 已跳过本次开始前等待，立即重试。`
                : '已跳过本次请求前等待，立即重试。',
            detail: {
                batchId,
                waitMs: intervalMs,
                skipped: true,
            },
        });
        return false;
    }
    if (intervalMs <= 0) {
        return false;
    }
    await appendTakeoverDiagnostics({
        chatKey,
        takeoverId,
        level: 'info',
        stage,
        message: batchId
            ? `批次 ${batchId} 开始前等待 ${Math.trunc(intervalMs / 1000)} 秒。`
            : `下一轮旧聊天请求开始前等待 ${Math.trunc(intervalMs / 1000)} 秒。`,
        detail: {
            batchId,
            waitMs: intervalMs,
        },
    });
    await new Promise<void>((resolve: () => void): void => {
        setTimeout((): void => resolve(), intervalMs);
    });
    return false;
}
