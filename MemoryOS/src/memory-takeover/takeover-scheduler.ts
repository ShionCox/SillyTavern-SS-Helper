import {
    loadMemoryTakeoverBatchFailureStates,
    loadMemoryTakeoverBatchMetas,
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryTimelineProfile,
    readMemoryTakeoverPlan,
    saveCandidateActorMentions,
    saveMemoryTakeoverBatchMeta,
    saveMemoryTakeoverBatchResult,
    saveMemoryTakeoverPreview,
    writeMemoryTimelineProfile,
    writeMemoryTakeoverPlan,
} from '../db/db';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBaseline,
    MemoryTakeoverBatch,
    MemoryTakeoverBatchErrorKind,
    MemoryTakeoverBatchFailureState,
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
import { mergeStoryEventAnchors, resolveTimelineProfileEvolution } from '../memory-time/timeline-profile';
import { logTimeDebug } from '../memory-time/time-debug';
import type { WorldProfileFieldPolicy } from '../services/world-profile-field-policy';

const TAKEOVER_MAX_RETRY_PER_BATCH = 5;

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
    worldStrategyHintText?: string;
    worldProfileFieldPolicy?: WorldProfileFieldPolicy | null;
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

    const preview = await loadMemoryTakeoverPreview(input.chatKey, 'runtime');
    const baseline: MemoryTakeoverBaseline = preview.baseline ?? await runTakeoverBaseline({
        llm: input.llm,
        pluginId: input.pluginId,
        sourceBundle,
    });
    if (!preview.baseline) {
        await saveMemoryTakeoverPreview(input.chatKey, 'baseline', baseline, 'runtime');
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
                hintContext: activeAssembly.channels.contextText || undefined,
            });
            await saveMemoryTakeoverPreview(input.chatKey, 'active_snapshot', activeSnapshot, 'runtime');
        }
    }

    const completedBatchIds = new Set<string>(input.plan.completedBatchIds ?? []);
    const failedBatchIds = new Set<string>(input.plan.failedBatchIds ?? []);
    const isolatedBatchIds = new Set<string>(input.plan.isolatedBatchIds ?? []);
    const requestedRetryBatchId = String(input.plan.requestedRetryBatchId ?? '').trim();
    const batchFailureStates = await loadMemoryTakeoverBatchFailureStates(input.chatKey);
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
            attemptCount: Math.max(batch.attemptCount, batchFailureStates.get(batch.batchId)?.attemptCount ?? 0) + 1,
            failureCount: batchFailureStates.get(batch.batchId)?.failureCount ?? 0,
            consecutiveFailureCount: batchFailureStates.get(batch.batchId)?.consecutiveFailureCount ?? 0,
            retryable: batchFailureStates.get(batch.batchId)?.retryable ?? true,
            requiresManualReview: batchFailureStates.get(batch.batchId)?.requiresManualReview ?? false,
            quarantined: batchFailureStates.get(batch.batchId)?.quarantined ?? false,
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
                worldStrategyHintText: input.worldStrategyHintText,
                worldProfileFieldPolicy: input.worldProfileFieldPolicy,
            });
            const admission = admitTakeoverBatchResult(result);
            await saveMemoryTakeoverPreview(input.chatKey, 'latest_batch', admission.result, 'runtime');
            if (admission.accepted) {
                batchResultMap.set(admission.result.batchId, admission.result);
                completedBatchIds.add(admission.result.batchId);
                failedBatchIds.delete(admission.result.batchId);
                isolatedBatchIds.delete(admission.result.batchId);
                await saveMemoryTakeoverBatchResult(input.chatKey, admission.result);
                await saveCandidateActorMentions(input.chatKey, admission.result.candidateActors ?? []);
                const existingTimelineProfile = await readMemoryTimelineProfile(input.chatKey);
                const timelineEvolution = resolveTimelineProfileEvolution({
                    texts: messages.map((message): string => String(message.content ?? '').trim()).filter(Boolean),
                    anchorFloor: batch.range.endFloor,
                    existingProfile: existingTimelineProfile,
                });
                if (timelineEvolution.shouldPersist) {
                    timelineEvolution.profile.currentStoryDayIndex = admission.result.batchTimeAssessment?.storyDayIndex ?? timelineEvolution.profile.currentStoryDayIndex;
                    timelineEvolution.profile.eventAnchors = mergeStoryEventAnchors(
                        timelineEvolution.profile.eventAnchors ?? [],
                        admission.result.batchTimeAssessment?.eventAnchors ?? [],
                    );
                    await writeMemoryTimelineProfile(input.chatKey, timelineEvolution.profile);
                    logTimeDebug('takeover_timeline_profile_updated', {
                        takeoverId: plan.takeoverId,
                        batchId: admission.result.batchId,
                        reason: timelineEvolution.reason,
                        mode: timelineEvolution.profile.mode,
                        calendarKind: timelineEvolution.profile.calendarKind,
                        confidence: timelineEvolution.profile.confidence,
                        version: timelineEvolution.profile.version,
                    });
                }
                await saveMemoryTakeoverBatchMeta(input.chatKey, {
                    ...runningBatch,
                    status: 'completed',
                    admissionState: admission.result.repairedOnce ? 'repaired' : 'validated',
                    repairedOnce: admission.result.repairedOnce,
                    validationErrors: [],
                    failureCount: batchFailureStates.get(admission.result.batchId)?.failureCount ?? runningBatch.failureCount ?? 0,
                    consecutiveFailureCount: 0,
                    retryable: true,
                    requiresManualReview: false,
                    quarantined: false,
                    finishedAt: Date.now(),
                });
                batchFailureStates.set(admission.result.batchId, {
                    batchId: admission.result.batchId,
                    failureCount: batchFailureStates.get(admission.result.batchId)?.failureCount ?? 0,
                    consecutiveFailureCount: 0,
                    lastFailureAt: batchFailureStates.get(admission.result.batchId)?.lastFailureAt,
                    lastErrorMessage: batchFailureStates.get(admission.result.batchId)?.lastErrorMessage,
                    lastErrorKind: batchFailureStates.get(admission.result.batchId)?.lastErrorKind,
                    retryable: true,
                    requiresManualReview: false,
                    quarantined: false,
                    attemptCount: runningBatch.attemptCount,
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
                    lastErrorKind: 'admission_failed',
                    retryable: false,
                    requiresManualReview: true,
                    quarantined: true,
                    error: `admission_isolated:${admission.validationErrors.join('；')}`,
                    finishedAt: Date.now(),
                });
                batchFailureStates.set(admission.result.batchId, {
                    batchId: admission.result.batchId,
                    failureCount: batchFailureStates.get(admission.result.batchId)?.failureCount ?? runningBatch.failureCount ?? 0,
                    consecutiveFailureCount: batchFailureStates.get(admission.result.batchId)?.consecutiveFailureCount ?? runningBatch.consecutiveFailureCount ?? 0,
                    lastFailureAt: Date.now(),
                    lastErrorMessage: `admission_isolated:${admission.validationErrors.join('；')}`,
                    lastErrorKind: 'admission_failed',
                    retryable: false,
                    requiresManualReview: true,
                    quarantined: true,
                    attemptCount: runningBatch.attemptCount,
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
                blockedBatchId: undefined,
                lastBlockedAt: undefined,
                degradedReason: isolatedBatchIds.size > 0 ? 'isolated_batches_present' : undefined,
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
            const classifiedError = classifyTakeoverBatchError(error);
            const previousFailureState = batchFailureStates.get(batch.batchId);
            const failureCount = (previousFailureState?.failureCount ?? runningBatch.failureCount ?? 0) + 1;
            const consecutiveFailureCount = (previousFailureState?.consecutiveFailureCount ?? runningBatch.consecutiveFailureCount ?? 0) + 1;
            const requiresManualReview = failureCount > TAKEOVER_MAX_RETRY_PER_BATCH;
            const quarantined = requiresManualReview;
            const nextPlanStatus: MemoryTakeoverPlan['status'] = classifiedError.retryable || requiresManualReview
                ? 'blocked_by_batch'
                : 'failed';
            failedBatchIds.add(batch.batchId);
            batchFailureStates.set(batch.batchId, {
                batchId: batch.batchId,
                failureCount,
                consecutiveFailureCount,
                lastFailureAt: Date.now(),
                lastErrorMessage: errorMessage,
                lastErrorKind: classifiedError.errorKind,
                retryable: classifiedError.retryable,
                requiresManualReview,
                quarantined,
                attemptCount: runningBatch.attemptCount,
            });
            await saveMemoryTakeoverBatchMeta(input.chatKey, {
                ...runningBatch,
                status: 'failed',
                failureCount,
                consecutiveFailureCount,
                lastFailureAt: Date.now(),
                lastErrorKind: classifiedError.errorKind,
                retryable: classifiedError.retryable,
                requiresManualReview,
                quarantined,
                finishedAt: Date.now(),
                error: errorMessage,
            });
            plan = {
                ...plan,
                status: nextPlanStatus,
                currentBatchIndex: batch.batchIndex,
                completedBatchIds: Array.from(completedBatchIds),
                failedBatchIds: Array.from(failedBatchIds),
                isolatedBatchIds: Array.from(isolatedBatchIds),
                blockedBatchId: batch.batchId,
                lastBlockedAt: Date.now(),
                degradedReason: requiresManualReview ? 'batch_requires_manual_review' : undefined,
                requestedRetryBatchId: requestedRetryBatchId || undefined,
                lastError: errorMessage,
                lastCheckpointAt: Date.now(),
                updatedAt: Date.now(),
                pausedAt: undefined,
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
                    errorKind: classifiedError.errorKind,
                    failureCount,
                    requiresManualReview,
                    quarantined,
                },
            });
            return buildProgressSnapshot(input.chatKey, plan);
        }
    }

    if (failedBatchIds.size > 0) {
        const blockedBatchState = resolveHighestPriorityBlockedBatch(batchFailureStates, Array.from(failedBatchIds));
        plan = {
            ...plan,
            status: 'blocked_by_batch',
            completedBatchIds: Array.from(completedBatchIds),
            failedBatchIds: Array.from(failedBatchIds),
            isolatedBatchIds: Array.from(isolatedBatchIds),
            blockedBatchId: blockedBatchState?.batchId,
            lastBlockedAt: blockedBatchState?.lastFailureAt ?? Date.now(),
            degradedReason: blockedBatchState?.requiresManualReview ? 'batch_requires_manual_review' : undefined,
            requestedRetryBatchId: undefined,
            updatedAt: Date.now(),
            pausedAt: undefined,
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
    await saveMemoryTakeoverPreview(input.chatKey, 'consolidation', consolidation, 'runtime');
    try {
        await input.applyConsolidation(consolidation);
    } catch (error) {
        const errorMessage = String((error as Error)?.message ?? error ?? 'takeover_consolidation_apply_failed');
        plan = {
            ...plan,
            status: 'failed',
            currentBatchIndex: Math.max(0, batches.length - 1),
            completedBatchIds: Array.from(completedBatchIds),
            failedBatchIds: Array.from(failedBatchIds),
            isolatedBatchIds: Array.from(isolatedBatchIds),
            blockedBatchId: undefined,
            lastBlockedAt: undefined,
            requestedRetryBatchId: undefined,
            lastError: errorMessage,
            lastCheckpointAt: Date.now(),
            updatedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(input.chatKey, plan);
        await appendTakeoverDiagnostics({
            chatKey: input.chatKey,
            takeoverId: plan.takeoverId,
            level: 'error',
            stage: 'consolidation_apply',
            message: '旧聊天接管整合结果写入失败。',
            detail: {
                error: errorMessage,
            },
        });
        return buildProgressSnapshot(input.chatKey, plan);
    }
    plan = {
        ...plan,
        status: isolatedBatchIds.size > 0 ? 'degraded' : 'completed',
        currentBatchIndex: Math.max(0, batches.length - 1),
        completedBatchIds: Array.from(completedBatchIds),
        failedBatchIds: Array.from(failedBatchIds),
        isolatedBatchIds: Array.from(isolatedBatchIds),
        blockedBatchId: undefined,
        lastBlockedAt: undefined,
        degradedReason: isolatedBatchIds.size > 0 ? 'isolated_batches_present' : undefined,
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
    const preview = await loadMemoryTakeoverPreview(chatKey, 'runtime');
    const batchResults = await loadMemoryTakeoverBatchResults(chatKey);
    const currentBatch = resolveCurrentTakeoverBatch(batchMetas, currentPlan);
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

/**
 * 功能：按当前计划解析应该展示的“当前批次”。
 * @param batchMetas 已去重后的批次元数据列表。
 * @param plan 当前接管计划。
 * @returns 当前应展示的批次。
 */
function resolveCurrentTakeoverBatch(
    batchMetas: MemoryTakeoverBatch[],
    plan: MemoryTakeoverPlan | null,
): MemoryTakeoverBatch | null {
    if (batchMetas.length <= 0) {
        return null;
    }
    const sortByLatest = (items: MemoryTakeoverBatch[]): MemoryTakeoverBatch[] => {
        return items.slice().sort((left, right): number => {
            const leftSortKey = Math.max(Number(left.finishedAt ?? 0), Number(left.startedAt ?? 0));
            const rightSortKey = Math.max(Number(right.finishedAt ?? 0), Number(right.startedAt ?? 0));
            return rightSortKey - leftSortKey;
        });
    };
    if (plan) {
        const matchedByIndex = sortByLatest(batchMetas).find((item: MemoryTakeoverBatch): boolean => {
            return item.batchIndex === plan.currentBatchIndex;
        });
        if (matchedByIndex) {
            return matchedByIndex;
        }
    }
    return sortByLatest(batchMetas).find((item: MemoryTakeoverBatch): boolean => {
        return item.status === 'running' || item.status === 'failed' || item.status === 'completed' || item.status === 'isolated';
    }) ?? null;
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

/**
 * 功能：对批次异常进行轻量分类，给恢复策略提供基础语义。
 * @param error 原始异常。
 * @returns 分类结果。
 */
function classifyTakeoverBatchError(error: unknown): {
    errorKind: MemoryTakeoverBatchErrorKind;
    retryable: boolean;
    userHint: string;
} {
    const message = String((error as Error)?.message ?? error ?? '').toLowerCase();
    if (message.includes('manual_abort')) {
        return { errorKind: 'manual_abort', retryable: false, userHint: '任务已被手动中止。' };
    }
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
        return { errorKind: 'rate_limit', retryable: true, userHint: '模型正在限流，稍后可继续重试。' };
    }
    if (message.includes('timeout') || message.includes('timed out')) {
        return { errorKind: 'llm_timeout', retryable: true, userHint: '模型调用超时，建议稍后重试。' };
    }
    if (message.includes('unavailable') || message.includes('overloaded') || message.includes('service')) {
        return { errorKind: 'llm_unavailable', retryable: true, userHint: '模型当前不可用，可稍后重试。' };
    }
    if (message.includes('schema') || message.includes('json') || message.includes('parse')) {
        return { errorKind: 'schema_invalid', retryable: true, userHint: '模型输出结构异常，建议检查 prompt 或稍后重试。' };
    }
    if (message.includes('admission_isolated')) {
        return { errorKind: 'admission_failed', retryable: false, userHint: '该批次准入失败，建议人工检查。' };
    }
    return { errorKind: 'unknown', retryable: true, userHint: '批次执行失败，可继续重试或人工检查。' };
}

/**
 * 功能：在多个失败批次里选出当前最值得展示的阻塞批次。
 * @param states 批次聚合状态。
 * @param batchIds 失败批次列表。
 * @returns 优先展示的阻塞批次。
 */
function resolveHighestPriorityBlockedBatch(
    states: Map<string, MemoryTakeoverBatchFailureState>,
    batchIds: string[],
): MemoryTakeoverBatchFailureState | null {
    const candidates = batchIds
        .map((batchId) => states.get(batchId))
        .filter((item): item is MemoryTakeoverBatchFailureState => Boolean(item));
    if (candidates.length <= 0) {
        return null;
    }
    return candidates.sort((left, right) => {
        if (left.requiresManualReview !== right.requiresManualReview) {
            return left.requiresManualReview ? -1 : 1;
        }
        return Number(right.lastFailureAt ?? 0) - Number(left.lastFailureAt ?? 0);
    })[0] ?? null;
}
