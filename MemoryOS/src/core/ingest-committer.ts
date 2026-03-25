import { logger } from '../index';
import type { MemorySDK } from '../../../SDK/stx';
import type { ChatStateManager } from './chat-state-manager';
import type { MetaManager } from './meta-manager';
import type { TurnTracker } from './turn-tracker';
import type { LogicalChatView, MemoryIngestProgressState } from '../types';
import type { IngestCommitResult, IngestExecutionResult, IngestFacadeContext, IngestMetaSnapshot, IngestPlan } from './ingest-types';

/**
 * 功能：定义 IngestCommitter 的依赖项。
 */
export interface IngestCommitterDeps {
    chatKey: string;
    chatStateManager: ChatStateManager | null;
    metaManager: MetaManager;
    turnTracker: TurnTracker | null;
}

/**
 * 功能：统一负责 ingest 提交阶段的状态推进、健康记录与收尾动作。
 */
export class IngestCommitter {
    private readonly chatKey: string;
    private readonly chatStateManager: ChatStateManager | null;
    private readonly metaManager: MetaManager;
    private readonly turnTracker: TurnTracker | null;

    constructor(deps: IngestCommitterDeps) {
        this.chatKey = deps.chatKey;
        this.chatStateManager = deps.chatStateManager;
        this.metaManager = deps.metaManager;
        this.turnTracker = deps.turnTracker;
    }

    /**
     * 功能：提交“跳过执行”的 ingest 结果（如 processing level 为 none）。
     * @param input 提交输入。
     * @returns 提交摘要。
     */
    public async commitSkipped(input: { plan: IngestPlan; logicalView: LogicalChatView }): Promise<IngestCommitResult> {
        await this.recordUnifiedExtractHealth({
            accepted: false,
            processingDecision: input.plan.processingDecision,
            assistantTurnCount: input.plan.currentAssistantTurnCount,
            windowHash: input.plan.selection.windowHash,
            appliedFacts: 0,
            appliedPatches: 0,
            appliedSummaries: 0,
            extraReasonCodes: ['skipped_processing_none'],
        });
        await this.advanceMemoryIngestProgress({
            plan: input.plan,
            logicalView: input.logicalView,
            outcome: 'skipped',
        });
        return {
            shouldSettleWindow: true,
            finalOutcome: 'skipped',
            recordedReasonCodes: ['skipped_processing_none'],
        };
    }

    /**
     * 功能：提交执行层产出的 ingest 结果。
     * @param input 提交输入。
     * @returns 提交摘要。
     */
    public async commitExecution(input: {
        plan: IngestPlan;
        execution: IngestExecutionResult;
        memory: MemorySDK | null;
        logicalView: LogicalChatView;
        meta: IngestMetaSnapshot | null;
    }): Promise<IngestCommitResult> {
        const proposalResult = input.execution.proposalResult;

        await this.recordUnifiedExtractHealth({
            accepted: Boolean(proposalResult?.accepted),
            processingDecision: input.plan.processingDecision,
            assistantTurnCount: input.plan.currentAssistantTurnCount,
            windowHash: input.plan.selection.windowHash,
            appliedFacts: input.execution.factsApplied,
            appliedPatches: input.execution.patchesApplied,
            appliedSummaries: input.execution.summariesApplied,
            extraReasonCodes: input.execution.reasonCodes,
        });

        if (!proposalResult) {
            return {
                shouldSettleWindow: false,
                finalOutcome: 'rejected',
                recordedReasonCodes: input.execution.reasonCodes,
            };
        }

        if (proposalResult.accepted && typeof (input.memory as any)?.chatState?.primeColdStartExtract === 'function') {
            logger.info(`统一记忆摄取成功后触发 cold-start extract，chatKey=${this.chatKey}`);
            await (input.memory as any).chatState.primeColdStartExtract('ingest_success');
        }

        if (this.chatStateManager) {
            const windowBase = Math.max(1, input.plan.selection.windowMessages.length);
            await this.chatStateManager.updateAdaptiveMetrics({
                factsHitRate: Math.min(1, input.execution.factsApplied / windowBase),
                factsUpdateRate: Math.min(1, (input.execution.factsApplied + input.execution.patchesApplied) / windowBase),
                summaryEffectiveness: input.execution.summariesApplied > 0
                    ? Math.min(1, input.execution.summariesApplied / Math.max(1, Math.ceil(windowBase / 4)))
                    : 0,
                worldStateSignal: input.plan.postGate.shouldUpdateWorldState
                    ? Math.max(0, Math.min(1, input.plan.lorebookDecision.score))
                    : 0,
            });

            if (input.plan.processingDecision.summaryTier === 'long' && proposalResult.accepted) {
                const now = Date.now();
                await this.chatStateManager.setLongSummaryCooldown({
                    lastLongSummaryAt: now,
                    lastLongSummaryWindowHash: input.plan.selection.windowHash,
                    lastLongSummaryReason: input.plan.processingDecision.reasonCodes.join('|'),
                    lastLongSummaryStage: input.plan.lifecycleState?.stage ?? 'new',
                    lastHeavyProcessAt: now,
                    lastLongSummaryAssistantTurnCount: input.plan.currentAssistantTurnCount,
                });
                await this.chatStateManager.setAutoSummaryRuntime({
                    lastSummaryTurnCount: input.plan.currentAssistantTurnCount,
                    lastSummaryAt: now,
                    lastTriggerReasonCodes: input.plan.autoSummaryDecisionSnapshot?.reasonCodes ?? input.plan.processingDecision.reasonCodes,
                    lastMode: input.plan.autoSummaryDecisionSnapshot?.mode ?? 'mixed',
                });
            } else if (proposalResult.accepted) {
                await this.chatStateManager.setLongSummaryCooldown({
                    lastHeavyProcessAt: Date.now(),
                });
            }

            if (input.plan.previousLorebookDecision && input.plan.previousLorebookDecision.mode !== input.plan.lorebookDecision.mode) {
                await this.chatStateManager.enqueueSummaryFixTask(
                    `lorebook_mode_changed:${input.plan.previousLorebookDecision.mode}->${input.plan.lorebookDecision.mode}`,
                    input.plan.lorebookDecision.mode,
                );
            }
            if (input.plan.postGate.reasonCodes.includes('mutation_repair_required')) {
                await this.chatStateManager.enqueueSummaryFixTask(
                    `mutation_repair:${input.plan.postGate.reasonCodes.join('|')}`,
                    input.plan.lorebookDecision.mode,
                );
            }
            if (!proposalResult.accepted && input.plan.processingDecision.summaryTier !== 'none') {
                await this.chatStateManager.enqueueSummaryFixTask(
                    `ingest_retry:${input.plan.processingDecision.summaryTier}:${input.plan.postGate.valueClass}`,
                    input.plan.lorebookDecision.mode,
                );
            }

            const adaptivePolicy = await this.chatStateManager.getAdaptivePolicy();
            const shouldRefreshQuality = this.shouldRefreshByAssistantTurns(
                input.plan.currentAssistantTurnCount,
                Number(input.meta?.lastQualityRefreshAssistantTurnCount ?? 0),
                Number(adaptivePolicy.qualityRefreshInterval ?? 0),
            );
            if (shouldRefreshQuality) {
                await this.chatStateManager.recomputeMemoryQuality();
                await this.metaManager.markRefreshCheckpoints({
                    qualityAssistantTurnCount: input.plan.currentAssistantTurnCount,
                });
            } else if (input.plan.selection.repairTriggered) {
                await this.chatStateManager.recomputeMemoryQuality();
            }
        }

        const finalOutcome: MemoryIngestProgressState['lastProcessedOutcome'] = proposalResult.accepted
            ? (input.execution.factsApplied > 0 || input.execution.patchesApplied > 0 || input.execution.summariesApplied > 0 ? 'accepted' : 'noop')
            : 'rejected';
        await this.advanceMemoryIngestProgress({
            plan: input.plan,
            logicalView: input.logicalView,
            outcome: finalOutcome,
        });
        return {
            shouldSettleWindow: true,
            finalOutcome,
            recordedReasonCodes: this.buildRecentTaskReasonCodes(
                input.plan.processingDecision.reasonCodes,
                input.execution.reasonCodes,
            ),
        };
    }

    /**
     * 功能：在每轮 ingest 结束时记录最终元信息快照。
     * @param context 收尾上下文。
     * @returns 无返回值。
     */
    public async finalize(context: IngestFacadeContext): Promise<void> {
        const extractionSnapshot = this.turnTracker
            ? await this.turnTracker.getExtractionSnapshot()
            : null;
        await this.metaManager.markLastExtract({
            ts: Date.now(),
            eventCount: context.recentEvents.length,
            userMsgCount: context.logicalView.visibleUserTurns.length,
            windowHash: context.plan.selection.windowHash,
            activeAssistantTurnCount: extractionSnapshot?.activeAssistantTurnCount ?? context.plan.currentAssistantTurnCount,
            lastCommittedTurnCursor: extractionSnapshot?.lastCommittedTurnCursor,
            lastVisibleTurnSnapshotHash: extractionSnapshot?.lastVisibleTurnSnapshotHash ?? context.logicalView.snapshotHash,
        });
    }

    /**
     * 功能：记录统一 ingest 的健康窗口结果。
     * @param input 记录输入。
     * @returns 无返回值。
     */
    private async recordUnifiedExtractHealth(input: {
        accepted: boolean;
        processingDecision: IngestPlan['processingDecision'];
        assistantTurnCount: number;
        windowHash: string;
        appliedFacts: number;
        appliedPatches: number;
        appliedSummaries: number;
        extraReasonCodes?: string[];
    }): Promise<void> {
        if (!this.chatStateManager) {
            return;
        }
        const extractHealth = await this.chatStateManager.getExtractHealth();
        await this.chatStateManager.recordExtractHealth({
            recentTasks: [
                ...extractHealth.recentTasks,
                {
                    task: 'memory.ingest' as const,
                    accepted: input.accepted,
                    appliedFacts: input.appliedFacts,
                    appliedPatches: input.appliedPatches,
                    appliedSummaries: input.appliedSummaries,
                    processingLevel: input.processingDecision.level,
                    summaryTier: input.processingDecision.summaryTier,
                    windowHash: input.windowHash,
                    reasonCodes: this.buildRecentTaskReasonCodes(
                        input.processingDecision.reasonCodes,
                        input.extraReasonCodes ?? [],
                    ),
                    assistantTurnCount: input.assistantTurnCount,
                    ts: Date.now(),
                },
            ].slice(-12),
            lastAcceptedAt: input.accepted ? Date.now() : extractHealth.lastAcceptedAt,
        });
    }

    /**
     * 功能：推进统一 ingest 的楼层消费游标。
     * @param input 游标推进输入。
     * @returns 无返回值。
     */
    private async advanceMemoryIngestProgress(input: {
        plan: IngestPlan;
        logicalView: LogicalChatView;
        outcome: MemoryIngestProgressState['lastProcessedOutcome'];
    }): Promise<void> {
        if (!this.chatStateManager) {
            return;
        }
        await this.chatStateManager.setMemoryIngestProgress({
            lastProcessedAssistantTurnId: input.plan.selection.lastAssistantTurnId,
            lastProcessedAssistantMessageId: input.plan.selection.lastAssistantMessageId,
            lastProcessedAssistantTurnCount: input.plan.selection.lastAssistantTurnCount,
            lastProcessedSnapshotHash: input.logicalView.snapshotHash,
            lastProcessedRange: {
                fromMessageId: input.plan.selection.fromMessageId,
                toMessageId: input.plan.selection.toMessageId,
            },
            lastProcessedAt: Date.now(),
            lastProcessedOutcome: input.outcome,
            lastRepairGeneration: input.plan.repairGeneration,
        });
    }

    /**
     * 功能：合并任务原因码，并补充额外原因码。
     * @param baseCodes 基础原因码。
     * @param extraCodes 额外原因码。
     * @returns 去重后的原因码数组。
     */
    private buildRecentTaskReasonCodes(baseCodes: string[], extraCodes: string[] = []): string[] {
        return Array.from(new Set([...(baseCodes ?? []), ...(extraCodes ?? [])]));
    }

    /**
     * 功能：判断是否到达基于 assistant turn 的刷新阈值。
     * @param currentAssistantTurnCount 当前 assistant turn 计数。
     * @param lastRefreshAssistantTurnCount 上次刷新时的 assistant turn 计数。
     * @param interval 刷新间隔。
     * @returns 是否需要刷新。
     */
    private shouldRefreshByAssistantTurns(
        currentAssistantTurnCount: number,
        lastRefreshAssistantTurnCount: number,
        interval: number,
    ): boolean {
        const normalizedInterval = Math.max(1, Math.round(Number(interval || 0)));
        const currentCount = Math.max(0, Math.round(Number(currentAssistantTurnCount || 0)));
        const lastCount = Math.max(0, Math.round(Number(lastRefreshAssistantTurnCount || 0)));
        if (currentCount <= 0) {
            return false;
        }
        return currentCount - lastCount >= normalizedInterval;
    }
}
