import { logger } from '../index';
import type { EventEnvelope, MemorySDK, ProposalResult } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MEMORY_TASKS, checkAiModeGuard, runGeneration } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import {
    buildMemorySummarySaveSystemPrompt,
    buildUnifiedIngestTaskPrompt,
} from '../llm/skills';
import type { MemoryProposalDocument, SummaryProposal } from '../proposal/types';
import { buildAiJsonPromptBundle } from './ai-json-builder';
import { applyAiJsonOutput, validateAiJsonOutput } from './ai-json-system';
import type {
    AutoSummaryDecisionSnapshot,
    ChatLifecycleState,
    ChatProfile,
    ChatMutationKind,
    GenerationValueClass,
    LogicalChatView,
    LongSummaryCooldownState,
    HeavyProcessingTriggerKind,
    MemoryIngestProgressState,
    MemoryProcessingDecision,
    MemoryProcessingLevel,
    PostGenerationGateDecision,
    PrecompressedWindowStats,
    SummaryExecutionTier,
    TurnRecord,
} from '../types';
import type { ChatStateManager } from './chat-state-manager';
import { collectAdaptiveMetricsFromEvents } from './chat-strategy-engine';
import {
    buildSemanticChangeSummary,
    resolveAutoSummaryMode,
    shouldRunAutoSummary,
} from './auto-summary-trigger';
import type { AutoSummaryDecisionResult, SemanticChangeSummary } from './auto-summary-trigger';
import { resolveSummaryRuntimeSettings } from './summary-settings-store';
import type { EventsManager } from './events-manager';
import { evaluateLorebookRelevance, loadActiveWorldInfoEntriesFromHost } from './lorebook-relevance-gate';
import { MetaManager } from './meta-manager';
import type { TemplateManager } from '../template/template-manager';
import type { TurnTracker } from './turn-tracker';


type ProposalTask = 'memory.ingest';
type SchemaContextPayload = Record<string, unknown> | string;
const MEMORY_PROPOSAL_NAMESPACE_KEYS = ['memory_proposal'] as const;

type ProposalTaskRunResult = {
    result: ProposalResult | null;
    reasonCode?: string;
    error?: string;
};

type IngestWindowSelection = {
    windowHash: string;
    windowMessages: LogicalChatView['visibleMessages'];
    fromMessageId?: string;
    toMessageId?: string;
    lastAssistantTurnId?: string;
    lastAssistantMessageId?: string;
    lastAssistantTurnCount: number;
    pendingAssistantTurns: number;
    repairTriggered: boolean;
};

/**
 * 功能：调度 MemoryOS 的摘要与抽取任务。
 * @param chatKey 当前聊天键。
 * @param events 事件管理器。
 * @param templateMgr 模板管理器。
 * @param turnTracker 助手轮次跟踪器。
 * @param chatStateManager 聊天状态管理器。
 * @returns 抽取调度器实例。
 */
export class ExtractManager {
    private chatKey: string;
    private eventsManager: EventsManager;
    private templateManager: TemplateManager;
    private metaManager: MetaManager;
    private turnTracker: TurnTracker | null;
    private chatStateManager: ChatStateManager | null;
    private readonly duplicateWindowMs: number = 8000;
    private readonly specialTriggerTypes: Set<string> = new Set([
        'memory.template.changed',
        'world.template.changed',
        'combat.end',
        'combat.round.end',
    ]);
    private extractionFlight: Promise<void> | null = null;
    private extractionFlightWindowHash: string = '';
    private lastSettledWindowHash: string = '';
    private lastSettledAt: number = 0;

    constructor(
        chatKey: string,
        events: EventsManager,
        templateMgr: TemplateManager,
        turnTracker?: TurnTracker,
        chatStateManager?: ChatStateManager,
    ) {
        this.chatKey = chatKey;
        this.eventsManager = events;
        this.templateManager = templateMgr;
        this.metaManager = new MetaManager(chatKey);
        this.turnTracker = turnTracker ?? null;
        this.chatStateManager = chatStateManager ?? null;
    }

    /**
     * 功能：按自适应策略触发一轮抽取。
     * @returns 无返回值。
     */
    public async kickOffExtraction(): Promise<void> {
        return this.runUnifiedIngest();
    }

    /**
     * 功能：按楼层消费游标执行统一记忆摄取。
     * @returns 无返回值。
     */
    private async runUnifiedIngest(): Promise<void> {
        logger.info(`开始评估统一记忆摄取触发条件，chatKey=${this.chatKey}`);
        const ingestGuard = checkAiModeGuard(MEMORY_TASKS.INGEST as MemoryAiTaskId);
        if (ingestGuard) {
            logger.info(`统一记忆摄取跳过：AI 守卫未通过，chatKey=${this.chatKey}`);
            return;
        }

        const memory = this.getWindowMemory();
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过统一记忆摄取');
            return;
        }

        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            logger.info(`统一记忆摄取跳过：聊天已归档，chatKey=${this.chatKey}`);
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        const logicalView = this.chatStateManager
            ? await this.chatStateManager.getLogicalChatView()
            : null;
        if (!logicalView || logicalView.visibleMessages.length === 0) {
            logger.info(`统一记忆摄取跳过：当前没有可消费楼层，chatKey=${this.chatKey}`);
            return;
        }

        const meta = await this.metaManager.getMeta();
        const triggerBySpecialEvent = recentEvents.some((event: EventEnvelope<unknown>): boolean => {
            return this.specialTriggerTypes.has(event.type);
        });

        let summaryInterval = 12;
        let summaryWindowSize = 40;
        let summaryEnabled = true;
        if (this.chatStateManager) {
            const previousMetrics = await this.chatStateManager.getAdaptiveMetrics();
            const nextMetrics = collectAdaptiveMetricsFromEvents(recentEvents, previousMetrics, logicalView);
            await this.chatStateManager.updateAdaptiveMetrics({
                avgMessageLength: nextMetrics.avgMessageLength,
                assistantLongMessageRatio: nextMetrics.assistantLongMessageRatio,
                userInfoDensity: nextMetrics.userInfoDensity,
                repeatedTopicRate: nextMetrics.repeatedTopicRate,
                recentUserTurns: nextMetrics.recentUserTurns,
                recentAssistantTurns: nextMetrics.recentAssistantTurns,
                recentGroupSpeakerCount: nextMetrics.recentGroupSpeakerCount,
                worldStateSignal: nextMetrics.worldStateSignal,
            }, { refreshDerivedState: false });

            const currentAssistantTurnCount = await this.resolveAssistantTurnCount(logicalView, recentEvents);
            let adaptivePolicy = await this.chatStateManager.getAdaptivePolicy();
            const shouldRefreshProfile = this.shouldRefreshByAssistantTurns(
                currentAssistantTurnCount,
                Number(meta?.lastProfileRefreshAssistantTurnCount ?? 0),
                Number(adaptivePolicy.profileRefreshInterval ?? 0),
            );
            if (shouldRefreshProfile) {
                await this.chatStateManager.recomputeChatProfile({ markDirty: false });
                adaptivePolicy = await this.chatStateManager.recomputeAdaptivePolicy();
                await this.metaManager.markRefreshCheckpoints({
                    profileAssistantTurnCount: currentAssistantTurnCount,
                });
            }

            summaryInterval = adaptivePolicy.extractInterval;
            summaryWindowSize = adaptivePolicy.extractWindowSize;
            summaryEnabled = adaptivePolicy.summaryEnabled;
        }

        const currentAssistantTurnCount = await this.resolveAssistantTurnCount(logicalView, recentEvents);
        const turnLedger = this.chatStateManager
            ? await this.chatStateManager.getTurnLedger()
            : [];
        const ingestProgress = this.chatStateManager
            ? await this.chatStateManager.getMemoryIngestProgress()
            : {
                lastProcessedAssistantTurnCount: 0,
                lastProcessedSnapshotHash: '',
                lastProcessedAt: 0,
                lastProcessedOutcome: 'skipped' as const,
                lastRepairGeneration: 0,
            };
        const normalizedInterval = Math.max(1, Math.round(Number(summaryInterval || 0)));
        const lastProcessedAssistantTurnCount = Math.max(0, Number(ingestProgress.lastProcessedAssistantTurnCount ?? 0));
        const pendingAssistantTurns = Math.max(0, Number(currentAssistantTurnCount ?? 0) - lastProcessedAssistantTurnCount);
        const repairGeneration = this.chatStateManager
            ? await this.chatStateManager.getMutationRepairGeneration()
            : 0;
        logger.info(
            `统一记忆摄取门槛检查：chatKey=${this.chatKey}, 待处理 assistant 楼层=${pendingAssistantTurns}/${normalizedInterval}, 当前总 assistant 楼层=${currentAssistantTurnCount}, 上次已处理到=${lastProcessedAssistantTurnCount}, repairGeneration=${repairGeneration}, lastRepairGeneration=${Number(ingestProgress.lastRepairGeneration ?? 0)}, specialEvent=${triggerBySpecialEvent}`,
        );
        const selection = this.resolveIngestWindowSelection({
            logicalView,
            turnLedger,
            currentAssistantTurnCount,
            interval: summaryInterval,
            initialWindowSize: summaryWindowSize,
            triggerBySpecialEvent,
            repairGeneration,
            progress: ingestProgress,
        });
        if (!selection) {
            logger.info(`统一记忆摄取跳过：未达到增量冲洗阈值，chatKey=${this.chatKey}, assistantTurns=${currentAssistantTurnCount}`);
            return;
        }

        const recentUserLine = [...selection.windowMessages].reverse().find((node) => node.role === 'user')?.text ?? '';
        const recentAssistantLine = [...selection.windowMessages].reverse().find((node) => node.role === 'assistant')?.text ?? '';
        const worldInfoEntries = await loadActiveWorldInfoEntriesFromHost();
        const previousLorebookDecision = this.chatStateManager
            ? await this.chatStateManager.getLorebookDecision()
            : null;
        const chatProfile = this.chatStateManager
            ? await this.chatStateManager.getChatProfile()
            : null;
        const lorebookDecision = evaluateLorebookRelevance({
            query: recentUserLine,
            profileChatType: chatProfile?.chatType,
            visibleMessages: logicalView.visibleMessages,
            recentEvents,
            worldStateText: '',
            entries: worldInfoEntries,
        });
        if (this.chatStateManager) {
            await this.chatStateManager.setLorebookDecision(lorebookDecision, 'extract');
        }

        const postGate = this.buildPostGenerationDecision({
            recentUserLine,
            recentAssistantLine,
            lorebookDecision,
            summaryEnabled,
            logicalView,
            mutationKinds: Array.isArray(logicalView.mutationKinds) ? logicalView.mutationKinds : [],
            extractStrategy: chatProfile?.extractStrategy ?? 'facts_relations',
            stylePreference: chatProfile?.stylePreference ?? 'story',
        });
        if (this.chatStateManager) {
            await this.chatStateManager.setLastPostGenerationDecision(postGate);
        }

        if (this.extractionFlight && this.extractionFlightWindowHash === selection.windowHash) {
            logger.info(`统一记忆摄取跳过：相同增量窗口已在处理中，chatKey=${this.chatKey}, windowHash=${selection.windowHash}`);
            await this.extractionFlight;
            return;
        }

        if (
            this.lastSettledWindowHash === selection.windowHash
            && Date.now() - this.lastSettledAt <= this.duplicateWindowMs
        ) {
            logger.info(`统一记忆摄取跳过：相同增量窗口刚处理完成，chatKey=${this.chatKey}, windowHash=${selection.windowHash}`);
            return;
        }

        logger.info(`触发统一记忆摄取，chatKey=${this.chatKey}, pendingAssistantTurns=${selection.pendingAssistantTurns}, repair=${selection.repairTriggered}`);
        let currentExtractionPromise: Promise<void> | null = null;
        let shouldSettleWindow = false;
        const extractionPromise = (async (): Promise<void> => {
            try {
                const lifecycleState = this.chatStateManager
                    ? await this.chatStateManager.getLifecycleState()
                    : null;
                const longSummaryCooldown = this.chatStateManager
                    ? await this.chatStateManager.getLongSummaryCooldown()
                    : null;
                const schemaContext = await this.buildSchemaContext(memory);
                const windowText = this.buildLogicalWindowTextFromMessages(selection.windowMessages);
                const compressedWindow = this.precompressWindowText(windowText);
                let processingDecision = this.buildProcessingDecision({
                    postGate,
                    summaryEnabled,
                    lifecycle: lifecycleState,
                    chatProfile,
                    currentAssistantTurnCount,
                    extractInterval: summaryInterval,
                    windowHash: selection.windowHash,
                    windowEventCount: selection.windowMessages.length,
                    windowUserMessageCount: selection.windowMessages.filter((node) => node.role === 'user').length,
                    specialEventHit: triggerBySpecialEvent,
                    mutationRepairSignal: selection.repairTriggered || postGate.reasonCodes.includes('mutation_repair_required'),
                    cooldown: longSummaryCooldown,
                    precompressedStats: compressedWindow.stats,
                });
                let autoSummaryDecisionSnapshot: AutoSummaryDecisionSnapshot | null = null;

                if (this.chatStateManager) {
                    const effectiveSummarySettings = await this.chatStateManager.getEffectiveSummarySettings();
                    const autoSummaryRuntime = await this.chatStateManager.getAutoSummaryRuntime();
                    const runtimeSettings = resolveSummaryRuntimeSettings(
                        effectiveSummarySettings,
                        null,
                        longSummaryCooldown,
                    );
                    const autoSummaryMode = resolveAutoSummaryMode({
                        presetStyle: chatProfile?.stylePreference ?? null,
                        chatProfile,
                        logicalView,
                    });
                    const semanticChange = buildSemanticChangeSummary({
                        textWindow: compressedWindow.text,
                        logicalView,
                        postGate,
                    });
                    const promptPressureRatio = Number(
                        (compressedWindow.stats.compressedLength / Math.max(1, runtimeSettings.longSummaryBudget)).toFixed(3),
                    );
                    const autoSummaryDecision = shouldRunAutoSummary({
                        settings: effectiveSummarySettings.autoSummary,
                        runtime: autoSummaryRuntime,
                        activeAssistantTurnCount: currentAssistantTurnCount,
                        currentMode: autoSummaryMode,
                        textWindow: compressedWindow.text,
                        enabledTriggerIds: effectiveSummarySettings.summaryBehavior.longSummaryTrigger,
                        semanticChange,
                        promptPressureRatio,
                    });
                    autoSummaryDecisionSnapshot = this.buildAutoSummaryDecisionSnapshot({
                        decision: autoSummaryDecision,
                        semanticChange,
                        activeAssistantTurnCount: currentAssistantTurnCount,
                        promptPressureRatio,
                    });
                    processingDecision = this.applyAutoSummaryDecision({
                        baseDecision: processingDecision,
                        autoDecision: autoSummaryDecision,
                        summaryEnabled,
                    });
                    await this.chatStateManager.setLastAutoSummaryDecision(autoSummaryDecisionSnapshot);
                    await this.chatStateManager.setLastProcessingDecision(processingDecision);
                }

                if (processingDecision.level === 'none') {
                    await this.recordUnifiedExtractHealth({
                        accepted: false,
                        processingDecision,
                        assistantTurnCount: currentAssistantTurnCount,
                        windowHash: selection.windowHash,
                        appliedFacts: 0,
                        appliedPatches: 0,
                        appliedSummaries: 0,
                        extraReasonCodes: ['skipped_processing_none'],
                    });
                    await this.advanceMemoryIngestProgress({
                        selection,
                        logicalView,
                        repairGeneration,
                        outcome: 'skipped',
                    });
                    shouldSettleWindow = true;
                    return;
                }

                const ingestExecution = await this.runProposalTask(
                    'memory.ingest',
                    this.buildUnifiedIngestTaskDescription(processingDecision, selection),
                    this.buildUnifiedIngestPrompt(
                        lorebookDecision.mode,
                        lorebookDecision.shouldExtractWorldFacts,
                        postGate,
                        processingDecision.summaryTier,
                        processingDecision.extractScope,
                    ),
                    compressedWindow.text,
                    schemaContext,
                    this.resolveUnifiedIngestBudget(processingDecision),
                    {
                        fromMessageId: selection.fromMessageId,
                        toMessageId: selection.toMessageId,
                    },
                );
                const ingestResult = ingestExecution.result;
                const factsApplied = Number(ingestResult?.applied?.factKeys?.length ?? 0);
                const patchesApplied = Number(ingestResult?.applied?.statePaths?.length ?? 0);
                const summariesApplied = Number(ingestResult?.applied?.summaryIds?.length ?? 0);
                const failureReasonCodes = ingestExecution.error
                    ? ['task_request_failed']
                    : [];

                await this.recordUnifiedExtractHealth({
                    accepted: Boolean(ingestResult?.accepted),
                    processingDecision,
                    assistantTurnCount: currentAssistantTurnCount,
                    windowHash: selection.windowHash,
                    appliedFacts: factsApplied,
                    appliedPatches: patchesApplied,
                    appliedSummaries: summariesApplied,
                    extraReasonCodes: failureReasonCodes,
                });

                if (!ingestResult) {
                    return;
                }

                if (ingestResult.accepted && typeof (memory as any)?.chatState?.primeColdStartExtract === 'function') {
                    logger.info(`统一记忆摄取成功后触发 cold-start extract，chatKey=${this.chatKey}`);
                    await (memory as any).chatState.primeColdStartExtract('ingest_success');
                }

                if (this.chatStateManager) {
                    const windowBase = Math.max(1, selection.windowMessages.length);
                    await this.chatStateManager.updateAdaptiveMetrics({
                        factsHitRate: Math.min(1, factsApplied / windowBase),
                        factsUpdateRate: Math.min(1, (factsApplied + patchesApplied) / windowBase),
                        summaryEffectiveness: summariesApplied > 0
                            ? Math.min(1, summariesApplied / Math.max(1, Math.ceil(windowBase / 4)))
                            : 0,
                        worldStateSignal: postGate.shouldUpdateWorldState
                            ? Math.max(0, Math.min(1, lorebookDecision.score))
                            : 0,
                    });

                    if (processingDecision.summaryTier === 'long' && ingestResult.accepted) {
                        const now = Date.now();
                        await this.chatStateManager.setLongSummaryCooldown({
                            lastLongSummaryAt: now,
                            lastLongSummaryWindowHash: selection.windowHash,
                            lastLongSummaryReason: processingDecision.reasonCodes.join('|'),
                            lastLongSummaryStage: lifecycleState?.stage ?? 'new',
                            lastHeavyProcessAt: now,
                            lastLongSummaryAssistantTurnCount: currentAssistantTurnCount,
                        });
                        await this.chatStateManager.setAutoSummaryRuntime({
                            lastSummaryTurnCount: currentAssistantTurnCount,
                            lastSummaryAt: now,
                            lastTriggerReasonCodes: autoSummaryDecisionSnapshot?.reasonCodes ?? processingDecision.reasonCodes,
                            lastMode: autoSummaryDecisionSnapshot?.mode ?? 'mixed',
                        });
                    } else if (ingestResult.accepted) {
                        await this.chatStateManager.setLongSummaryCooldown({
                            lastHeavyProcessAt: Date.now(),
                        });
                    }

                    if (previousLorebookDecision && previousLorebookDecision.mode !== lorebookDecision.mode) {
                        await this.chatStateManager.enqueueSummaryFixTask(
                            `lorebook_mode_changed:${previousLorebookDecision.mode}->${lorebookDecision.mode}`,
                            lorebookDecision.mode,
                        );
                    }
                    if (postGate.reasonCodes.includes('mutation_repair_required')) {
                        await this.chatStateManager.enqueueSummaryFixTask(
                            `mutation_repair:${postGate.reasonCodes.join('|')}`,
                            lorebookDecision.mode,
                        );
                    }
                    if (!ingestResult.accepted && processingDecision.summaryTier !== 'none') {
                        await this.chatStateManager.enqueueSummaryFixTask(
                            `ingest_retry:${processingDecision.summaryTier}:${postGate.valueClass}`,
                            lorebookDecision.mode,
                        );
                    }

                    const shouldRefreshQuality = this.shouldRefreshByAssistantTurns(
                        currentAssistantTurnCount,
                        Number(meta?.lastQualityRefreshAssistantTurnCount ?? 0),
                        Number((await this.chatStateManager.getAdaptivePolicy()).qualityRefreshInterval ?? 0),
                    );
                    if (shouldRefreshQuality) {
                        await this.chatStateManager.recomputeMemoryQuality();
                        await this.metaManager.markRefreshCheckpoints({
                            qualityAssistantTurnCount: currentAssistantTurnCount,
                        });
                    } else if (selection.repairTriggered) {
                        await this.chatStateManager.recomputeMemoryQuality();
                    }
                }

                await this.advanceMemoryIngestProgress({
                    selection,
                    logicalView,
                    repairGeneration,
                    outcome: ingestResult.accepted
                        ? (factsApplied > 0 || patchesApplied > 0 || summariesApplied > 0 ? 'accepted' : 'noop')
                        : 'rejected',
                });
                shouldSettleWindow = true;
            } catch (error) {
                logger.error('统一记忆摄取流程执行失败', error);
            } finally {
                const extractionSnapshot = this.turnTracker
                    ? await this.turnTracker.getExtractionSnapshot()
                    : null;
                await this.metaManager.markLastExtract({
                    ts: Date.now(),
                    eventCount: recentEvents.length,
                    userMsgCount: logicalView.visibleUserTurns.length,
                    windowHash: selection.windowHash,
                    activeAssistantTurnCount: extractionSnapshot?.activeAssistantTurnCount ?? currentAssistantTurnCount,
                    lastCommittedTurnCursor: extractionSnapshot?.lastCommittedTurnCursor,
                    lastVisibleTurnSnapshotHash: extractionSnapshot?.lastVisibleTurnSnapshotHash ?? logicalView.snapshotHash,
                });
                if (shouldSettleWindow) {
                    this.lastSettledWindowHash = selection.windowHash;
                    this.lastSettledAt = Date.now();
                }
                if (currentExtractionPromise && this.extractionFlight === currentExtractionPromise) {
                    this.extractionFlight = null;
                    this.extractionFlightWindowHash = '';
                }
            }
        })();

        currentExtractionPromise = extractionPromise;
        this.extractionFlight = extractionPromise;
        this.extractionFlightWindowHash = selection.windowHash;
        await extractionPromise;
    }

    /**
     * 功能：根据已消费游标选择本轮需要送入模型的增量楼层窗口。
     * @param input 增量窗口计算输入。
     * @returns 本轮增量窗口；未达到触发条件时返回 null。
     */
    private resolveIngestWindowSelection(input: {
        logicalView: LogicalChatView;
        turnLedger: TurnRecord[];
        currentAssistantTurnCount: number;
        interval: number;
        initialWindowSize: number;
        triggerBySpecialEvent: boolean;
        repairGeneration: number;
        progress: MemoryIngestProgressState;
    }): IngestWindowSelection | null {
        const visibleMessages = Array.isArray(input.logicalView.visibleMessages)
            ? input.logicalView.visibleMessages
            : [];
        if (visibleMessages.length === 0) {
            return null;
        }

        const latestAssistant = [...visibleMessages].reverse().find((node) => node.role === 'assistant');
        if (!latestAssistant) {
            return null;
        }

        const latestAssistantIndex = String(latestAssistant.messageId ?? '').trim()
            ? this.findVisibleMessageIndex(input.logicalView, latestAssistant.messageId)
            : input.logicalView.visibleMessages.lastIndexOf(latestAssistant);
        if (latestAssistantIndex < 0) {
            return null;
        }

        const normalizedInterval = Math.max(1, Math.round(Number(input.interval || 0)));
        const pendingAssistantTurns = Math.max(
            0,
            Number(input.currentAssistantTurnCount ?? 0) - Number(input.progress.lastProcessedAssistantTurnCount ?? 0),
        );
        const repairTriggered = input.repairGeneration > Number(input.progress.lastRepairGeneration ?? 0)
            || (Array.isArray(input.logicalView.mutationKinds) && input.logicalView.mutationKinds.some((kind: ChatMutationKind): boolean => {
                return kind === 'message_edited' || kind === 'message_swiped' || kind === 'message_deleted' || kind === 'chat_branched';
            }));
        if (!repairTriggered && !input.triggerBySpecialEvent && pendingAssistantTurns < normalizedInterval) {
            return null;
        }

        let startIndex = 0;
        const hasProgressCursor = Boolean(
            input.progress.lastProcessedAssistantMessageId
            || input.progress.lastProcessedRange?.toMessageId
            || input.progress.lastProcessedAssistantTurnCount > 0,
        );
        if (repairTriggered) {
            startIndex = this.findVisibleMessageIndex(input.logicalView, input.logicalView.repairAnchorMessageId);
            if (startIndex < 0) {
                startIndex = Math.max(0, latestAssistantIndex - Math.max(1, input.initialWindowSize) + 1);
            }
        } else if (hasProgressCursor) {
            const cursorMessageId = input.progress.lastProcessedAssistantMessageId
                || input.progress.lastProcessedRange?.toMessageId
                || '';
            const lastProcessedIndex = this.findVisibleMessageIndex(input.logicalView, cursorMessageId);
            if (lastProcessedIndex >= 0) {
                startIndex = Math.min(latestAssistantIndex, lastProcessedIndex + 1);
            } else {
                startIndex = Math.max(0, latestAssistantIndex - Math.max(1, input.initialWindowSize) + 1);
            }
        } else {
            startIndex = Math.max(0, latestAssistantIndex - Math.max(1, input.initialWindowSize) + 1);
        }

        const windowMessages = visibleMessages.slice(startIndex, latestAssistantIndex + 1);
        if (windowMessages.length === 0) {
            return null;
        }

        const fromMessageId = windowMessages[0]?.messageId || undefined;
        const toMessageId = windowMessages[windowMessages.length - 1]?.messageId || undefined;
        const lastTurnRecord = [...(Array.isArray(input.turnLedger) ? input.turnLedger : [])]
            .reverse()
            .find((turn: TurnRecord): boolean => turn.kind === 'assistant' && turn.lifecycle === 'active' && turn.messageId === latestAssistant.messageId);

        return {
            windowHash: this.computeLogicalWindowHashFromMessages(windowMessages, input.logicalView, input.repairGeneration),
            windowMessages,
            fromMessageId,
            toMessageId,
            lastAssistantTurnId: lastTurnRecord?.turnId,
            lastAssistantMessageId: latestAssistant.messageId,
            lastAssistantTurnCount: input.currentAssistantTurnCount,
            pendingAssistantTurns,
            repairTriggered,
        };
    }

    /**
     * 功能：为统一记忆摄取生成任务说明。
     * @param processingDecision 当前处理决策。
     * @returns 任务说明文本。
     */
    private buildUnifiedIngestTaskDescription(
        processingDecision: MemoryProcessingDecision,
        selection: IngestWindowSelection,
    ): string {
        const rangeText = this.buildIngestRangeLabel(selection);
        if (processingDecision.summaryTier === 'long' || processingDecision.extractScope === 'heavy') {
            return `统一记忆处理（重处理）${rangeText}`;
        }
        if (processingDecision.summaryTier === 'short' || processingDecision.extractScope === 'medium') {
            return `统一记忆处理（中处理）${rangeText}`;
        }
        return `统一记忆处理${rangeText}`;
    }

    /**
     * 功能：构建统一摄取的楼层范围标签。
     * @param selection 当前增量窗口。
     * @returns 带范围的短标签。
     */
    private buildIngestRangeLabel(selection: IngestWindowSelection): string {
        const fromMessageId = String(selection.fromMessageId ?? '').trim();
        const toMessageId = String(selection.toMessageId ?? '').trim();
        const pendingTurns = Math.max(0, Number(selection.pendingAssistantTurns ?? 0));
        const fromShort = fromMessageId ? fromMessageId.slice(-8) : 'unknown';
        const toShort = toMessageId ? toMessageId.slice(-8) : 'unknown';
        return `｜范围 ${fromShort} → ${toShort}｜待处理 ${pendingTurns} 楼`;
    }

    /**
     * 功能：根据处理决策计算统一记忆摄取预算。
     * @param processingDecision 当前处理决策。
     * @returns 模型预算配置。
     */
    private resolveUnifiedIngestBudget(processingDecision: MemoryProcessingDecision): {
        maxTokens: number;
        maxLatencyMs: number;
        maxCost: number;
    } {
        if (processingDecision.summaryTier === 'long' || processingDecision.extractScope === 'heavy') {
            return { maxTokens: 8200, maxLatencyMs: 0, maxCost: 0.65 };
        }
        if (processingDecision.summaryTier === 'short' || processingDecision.extractScope === 'medium') {
            return { maxTokens: 3200, maxLatencyMs: 0, maxCost: 0.38 };
        }
        return { maxTokens: 1800, maxLatencyMs: 0, maxCost: 0.24 };
    }

    /**
     * 功能：记录统一记忆摄取的健康窗口结果。
     * @param input 健康记录输入。
     * @returns 无返回值。
     */
    private async recordUnifiedExtractHealth(input: {
        accepted: boolean;
        processingDecision: MemoryProcessingDecision;
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
     * 功能：推进统一记忆摄取的楼层消费游标。
     * @param input 游标推进输入。
     * @returns 无返回值。
     */
    private async advanceMemoryIngestProgress(input: {
        selection: IngestWindowSelection;
        logicalView: LogicalChatView;
        repairGeneration: number;
        outcome: MemoryIngestProgressState['lastProcessedOutcome'];
    }): Promise<void> {
        if (!this.chatStateManager) {
            return;
        }
        await this.chatStateManager.setMemoryIngestProgress({
            lastProcessedAssistantTurnId: input.selection.lastAssistantTurnId,
            lastProcessedAssistantMessageId: input.selection.lastAssistantMessageId,
            lastProcessedAssistantTurnCount: input.selection.lastAssistantTurnCount,
            lastProcessedSnapshotHash: input.logicalView.snapshotHash,
            lastProcessedRange: {
                fromMessageId: input.selection.fromMessageId,
                toMessageId: input.selection.toMessageId,
            },
            lastProcessedAt: Date.now(),
            lastProcessedOutcome: input.outcome,
            lastRepairGeneration: input.repairGeneration,
        });
    }

    /**
     * 功能：把可见楼层窗口转换成统一摄取文本。
     * @param windowMessages 增量楼层列表。
     * @returns 统一摄取用文本窗口。
     */
    private buildLogicalWindowTextFromMessages(windowMessages: LogicalChatView['visibleMessages']): string {
        return windowMessages
            .map((node) => {
                return `[${new Date(node.updatedAt || node.createdAt || Date.now()).toLocaleTimeString()}] chat.message.${node.role}: ${node.text}`;
            })
            .join('\n');
    }

    /**
     * 功能：按增量楼层窗口计算哈希，避免重复摄取。
     * @param windowMessages 增量楼层列表。
     * @param view 当前逻辑视图。
     * @param repairGeneration 当前修复代数。
     * @returns 增量窗口哈希。
     */
    private computeLogicalWindowHashFromMessages(
        windowMessages: LogicalChatView['visibleMessages'],
        view: LogicalChatView,
        repairGeneration: number,
    ): string {
        const payload = windowMessages
            .map((node) => `${node.messageId}|${node.role}|${node.textSignature}`)
            .join('\n');
        return this.hashString(`${payload}|${view.snapshotHash}|${(view.mutationKinds || []).join(',')}|${repairGeneration}`);
    }

    /**
     * 功能：在可见楼层中查找指定消息索引。
     * @param logicalView 逻辑视图。
     * @param messageId 目标消息 ID。
     * @returns 可见索引；找不到时返回 -1。
     */
    private findVisibleMessageIndex(logicalView: LogicalChatView, messageId?: string | null): number {
        const normalizedMessageId = String(messageId ?? '').trim();
        if (!normalizedMessageId) {
            return -1;
        }
        return logicalView.visibleMessages.findIndex((node) => node.messageId === normalizedMessageId);
    }

    private async resolveAssistantTurnCount(
        logicalView: LogicalChatView | null,
        recentEvents: Array<EventEnvelope<unknown>>,
    ): Promise<number> {
        if (this.turnTracker) {
            const snapshot = await this.turnTracker.getExtractionSnapshot();
            return Math.max(0, Number(snapshot.activeAssistantTurnCount ?? 0));
        }
        if (logicalView) {
            return Math.max(0, Number(logicalView.visibleAssistantTurns.length ?? 0));
        }
        return recentEvents.filter((event: EventEnvelope<unknown>): boolean => {
            return event.type === 'chat.message.received' || event.type === 'assistant_message_rendered';
        }).length;
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

    /**
     * 功能：构建统一记忆摄取提示词。
     * @param lorebookMode 当前世界书裁剪模式。
     * @param allowWorldFacts 是否允许抽取世界事实。
     * @param postGate 生成后 gate 结果。
     * @param summaryTier 摘要档位。
     * @param scope 抽取档位。
     * @returns 统一摄取任务提示词。
     */
    private buildUnifiedIngestPrompt(
        lorebookMode: string,
        allowWorldFacts: boolean,
        postGate: PostGenerationGateDecision,
        summaryTier: SummaryExecutionTier,
        scope: MemoryProcessingLevel,
    ): string {
        const promptBundle = buildAiJsonPromptBundle({
            mode: 'init',
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
        });
        const basePrompt = buildUnifiedIngestTaskPrompt(
            lorebookMode,
            allowWorldFacts,
            postGate,
            summaryTier,
            scope,
            buildMemorySummarySaveSystemPrompt(),
        );
        return [
            basePrompt,
            '你必须严格按照下面的统一 JSON 结构输出。',
            '',
            '命名空间说明：',
            promptBundle.systemInstructions,
            '',
            '使用方法：',
            promptBundle.usageGuide,
            '',
            '填写示例：',
            promptBundle.exampleJson,
        ].join('\n');
    }

    /**
     * 功能：构建抽取失败后的紧凑重试提示词，降低 JSON 被截断的概率。
     * @param basePrompt 原始提示词。
     * @param task 当前提议任务。
     * @returns 更严格的重试提示词。
     */
    private buildCompactRetryPrompt(basePrompt: string, task: ProposalTask): string {
        if (task === 'memory.ingest') {
            return [
                basePrompt,
                '上一次输出因 JSON 解析失败而被丢弃；这通常意味着输出过长、未闭合或结构不够紧凑。',
                '本次必须优先保证 JSON 完整闭合，宁可少写也不要写断。',
                '严格限制：facts 最多 10 条，patches 最多 6 条。',
                '不要把同一角色的多个近义状态拆成很多条；优先合并为更高价值的事实。',
                '不要把 facts 已经表达清楚的内容再次重复写进 patches。',
                '不要输出额外解释、前后缀、Markdown、代码块，只返回单个完整 JSON 对象。',
            ].join('\n');
        }

        return [
            basePrompt,
            '上一次输出因 JSON 解析失败而被丢弃。',
            '本次请只返回一个完整闭合的 JSON 对象，不要附加解释、Markdown 或代码块。',
        ].join('\n');
    }

    /**
     * 功能：构建抽取任务所需的 schema 上下文。
     * @param memory 当前 MemorySDK。
     * @returns schema 上下文。
     */
    private async buildSchemaContext(memory: MemorySDK | null): Promise<SchemaContextPayload> {
        const activeTemplateId = await memory?.getActiveTemplateId?.();
        if (!activeTemplateId) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        const currentTemplate = await this.templateManager.getById(activeTemplateId);
        if (!currentTemplate) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        return {
            tables: currentTemplate.tables,
            factTypes: currentTemplate.factTypes,
            extractPolicies: currentTemplate.extractPolicies,
        };
    }

    /**
     * 功能：将自动长总结判定收口到处理决策上，只控制是否允许进入 long summary。
     * 参数：
     *   input.baseDecision：基础处理决策（由既有主线计算）。
     *   input.autoDecision：自动长总结判定结果。
     *   input.summaryEnabled：当前轮次是否允许执行总结。
     * 返回：
     *   MemoryProcessingDecision：应用自动长总结判定后的决策。
     */
    private applyAutoSummaryDecision(input: {
        baseDecision: MemoryProcessingDecision;
        autoDecision: AutoSummaryDecisionResult;
        summaryEnabled: boolean;
    }): MemoryProcessingDecision {
        const reasonCodes = new Set<string>([
            ...(Array.isArray(input.baseDecision.reasonCodes) ? input.baseDecision.reasonCodes : []),
            ...(Array.isArray(input.autoDecision.reasonCodes) ? input.autoDecision.reasonCodes : []),
            `auto_summary_mode:${input.autoDecision.mode}`,
        ]);
        let summaryTier: SummaryExecutionTier = input.baseDecision.summaryTier;
        const isEarlyTrigger = input.autoDecision.reasonCodes.includes('auto_summary:early_trigger');

        if (summaryTier === 'long' && !input.autoDecision.shouldRun) {
            summaryTier = input.summaryEnabled ? 'short' : 'none';
            reasonCodes.add('auto_summary_gate:long_blocked');
        } else if (summaryTier === 'long' && input.autoDecision.shouldRun) {
            reasonCodes.add('auto_summary_gate:long_allowed');
        }

        if (
            summaryTier !== 'long'
            && input.autoDecision.shouldRun
            && isEarlyTrigger
            && !input.baseDecision.cooldownBlocked
            && (input.baseDecision.level === 'medium' || input.baseDecision.level === 'heavy')
            && input.summaryEnabled
        ) {
            summaryTier = 'long';
            reasonCodes.add('auto_summary_gate:early_promoted');
        } else if (
            input.autoDecision.shouldRun
            && isEarlyTrigger
            && input.baseDecision.level === 'light'
        ) {
            reasonCodes.add('auto_summary_gate:light_not_promoted');
        }

        if (input.baseDecision.cooldownBlocked && input.autoDecision.shouldRun) {
            reasonCodes.add('auto_summary_gate:cooldown_kept');
        }

        return {
            ...input.baseDecision,
            summaryTier,
            reasonCodes: Array.from(reasonCodes),
        };
    }

    /**
     * 功能：构建自动长总结判定快照，供调试面板展示最近一次判定细节。
     * 参数：
     *   input.decision：自动长总结判定结果。
     *   input.semanticChange：语义变化摘要。
     *   input.activeAssistantTurnCount：当前 assistant turn 计数。
     *   input.promptPressureRatio：近似 prompt 压力比。
     * 返回：
     *   AutoSummaryDecisionSnapshot：可持久化的判定快照。
     */
    private buildAutoSummaryDecisionSnapshot(input: {
        decision: AutoSummaryDecisionResult;
        semanticChange: SemanticChangeSummary;
        activeAssistantTurnCount: number;
        promptPressureRatio: number;
    }): AutoSummaryDecisionSnapshot {
        return {
            shouldRun: input.decision.shouldRun,
            mode: input.decision.mode,
            threshold: input.decision.threshold,
            activeAssistantTurnCount: Math.max(0, Math.round(Number(input.activeAssistantTurnCount ?? 0))),
            turnsSinceLastSummary: input.decision.turnsSinceLastSummary,
            reasonCodes: [...input.decision.reasonCodes],
            matchedTriggerIds: [...input.decision.matchedTriggerIds],
            scores: {
                triggerRule: input.decision.scores.triggerRule,
                semantic: input.decision.scores.semantic,
                pressure: input.decision.scores.pressure,
            },
            semanticFlags: this.buildSemanticFlagList(input.semanticChange),
            promptPressureRatio: Number(Math.max(0, Number(input.promptPressureRatio ?? 0)).toFixed(3)),
            generatedAt: Date.now(),
        };
    }

    /**
     * 功能：把语义变化布尔信号转换为可读 flag 列表，便于调试面板直接展示。
     * 参数：
     *   semantic：语义变化摘要。
     * 返回：
     *   string[]：语义 flag 列表。
     */
    private buildSemanticFlagList(semantic: SemanticChangeSummary): string[] {
        const flags: string[] = [];
        if (semantic.hasLocationShift) {
            flags.push('location_shift');
        }
        if (semantic.hasTimeShift) {
            flags.push('time_shift');
        }
        if (semantic.hasRelationshipShift) {
            flags.push('relationship_shift');
        }
        if (semantic.hasWorldStateShift) {
            flags.push('world_state_shift');
        }
        if (semantic.hasUserCorrection) {
            flags.push('user_correction');
        }
        if (semantic.hasImportantEvent) {
            flags.push('important_event');
        }
        return flags;
    }

    /**
     * 功能：归一化统一记忆摄取返回的提案文档。
     * @param payload 原始提案文档负载。
     * @param rangeFallback 摘要缺失范围时使用的回填范围。
     * @returns 归一化后的提案文档。
     */
    private buildMemoryProposalDocumentFromAiJsonPayload(
        payload: unknown,
        rangeFallback?: { fromMessageId?: string; toMessageId?: string },
    ): MemoryProposalDocument | null {
        const validated = validateAiJsonOutput({
            mode: 'init',
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
            payload,
        });
        if (!validated.ok || !validated.payload) {
            return null;
        }

        const applied = applyAiJsonOutput({
            document: {},
            payload: validated.payload,
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
        });
        const proposalRecord = applied.document.memory_proposal;
        if (!proposalRecord || typeof proposalRecord !== 'object' || Array.isArray(proposalRecord)) {
            return null;
        }

        const proposal = proposalRecord as Record<string, unknown>;
        const summaries = Array.isArray(proposal.summaries)
            ? proposal.summaries
                .filter((summary: SummaryProposal | null | undefined): summary is SummaryProposal => {
                    return Boolean(summary && typeof summary === 'object' && String(summary.content ?? '').trim());
                })
                .map((summary: SummaryProposal): SummaryProposal => {
                    const normalizedRange = summary.range?.fromMessageId || summary.range?.toMessageId
                        ? {
                            fromMessageId: String(summary.range?.fromMessageId ?? '').trim() || rangeFallback?.fromMessageId,
                            toMessageId: String(summary.range?.toMessageId ?? '').trim() || rangeFallback?.toMessageId,
                        }
                        : rangeFallback
                            ? {
                                fromMessageId: rangeFallback.fromMessageId,
                                toMessageId: rangeFallback.toMessageId,
                            }
                            : undefined;
                    return {
                        ...summary,
                        content: String(summary.content ?? '').trim(),
                        range: normalizedRange,
                    };
                })
            : [];
        return {
            facts: Array.isArray(proposal.facts) ? proposal.facts : [],
            patches: Array.isArray(proposal.patches) ? proposal.patches : [],
            summaries,
            notes: typeof proposal.notes === 'string' ? proposal.notes : undefined,
            schemaChanges: Array.isArray(proposal.schemaChanges) ? proposal.schemaChanges : [],
            entityResolutions: Array.isArray(proposal.entityResolutions) ? proposal.entityResolutions : [],
            confidence: Number(proposal.confidence ?? 0) || 0,
        };
    }

    /**
     * 功能：把可能为 JSON 字符串的提案文档输入解析成对象，避免字符串被误当作对象展开。
     * @param value 原始提案文档输入。
     * @returns 解析后的提案文档对象；无法解析时返回原值。
     */

    /**
     * 功能：判断任意值是否已经具备提案文档的基本结构。
     * @param value 待判断的值。
     * @returns 是否可视为提案文档对象。
     */
    /**
     * 功能：把统一记忆摄取提案文档压缩成简短日志摘要，便于判断是否真正进入落库链路。
     * @param document 提案文档。
     * @returns 适合日志打印的摘要对象。
     */
    private summarizeMemoryProposalDocumentForLog(document: MemoryProposalDocument | null | undefined): {
        facts: number;
        patches: number;
        summaries: number;
        confidence: number;
        summaryRanges: string[];
    } {
        const summaries = Array.isArray(document?.summaries) ? document.summaries : [];
        return {
            facts: Array.isArray(document?.facts) ? document.facts.length : 0,
            patches: Array.isArray(document?.patches) ? document.patches.length : 0,
            summaries: summaries.length,
            confidence: Number(document?.confidence ?? 0) || 0,
            summaryRanges: summaries.slice(0, 4).map((summary: SummaryProposal): string => {
                const level = String(summary.level ?? 'summary').trim() || 'summary';
                const fromMessageId = String(summary.range?.fromMessageId ?? '').trim() || '?';
                const toMessageId = String(summary.range?.toMessageId ?? '').trim() || '?';
                return `${level}:${fromMessageId}->${toMessageId}`;
            }),
        };
    }

    /**
     * 功能：执行单个提议任务并提交落地。
     * @param task 任务名。
     * @param systemPrompt 系统提示词。
     * @param eventsText 事件窗口文本。
     * @param schemaContext schema 上下文。
     * @param budget 预算配置。
     * @returns 提议处理结果。
     */
    private async runProposalTask(
        task: ProposalTask,
        taskDescription: string,
        systemPrompt: string,
        eventsText: string,
        schemaContext: SchemaContextPayload,
        budget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        rangeFallback?: { fromMessageId?: string; toMessageId?: string },
    ): Promise<ProposalTaskRunResult> {
        const memory = this.getWindowMemory();
        if (!memory?.proposal?.processProposal) {
            logger.warn(`${task} 跳过落地：窗口中没有可用的提案写入接口`);
            return {
                result: null,
            };
        }

        const executeAttempt = async (
            prompt: string,
            attemptBudget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        ) => {
            return runGeneration<unknown>(
                task,
                {
                    systemPrompt: prompt,
                    events: eventsText,
                    schemaContext: typeof schemaContext === 'string'
                        ? schemaContext
                        : JSON.stringify(schemaContext, null, 2),
                },
                attemptBudget,
                undefined,
                taskDescription,
            );
        };

        let response: any = await executeAttempt(systemPrompt, budget);
        if (!response.ok && response.reasonCode === 'invalid_json') {
            const retryBudget = {
                maxTokens: Math.min(3200, Math.max(Number(budget.maxTokens ?? 0) + 400, 2200)),
                maxLatencyMs: budget.maxLatencyMs,
                maxCost: Math.max(Number(budget.maxCost ?? 0), task === 'memory.ingest' ? 0.5 : 0.25),
            };
            logger.warn(`${task} 返回无效 JSON，启用紧凑模式重试一次`);
            response = await executeAttempt(this.buildCompactRetryPrompt(systemPrompt, task), retryBudget);
        }
        if (!response.ok) {
            const failedResponse = response as { ok: false; error?: string; reasonCode?: string };
            logger.warn(`${task} 请求失败：${failedResponse.error || '未知错误'} (${failedResponse.reasonCode || 'unknown'})`);
            return {
                result: null,
                reasonCode: failedResponse.reasonCode,
                error: failedResponse.error,
            };
            logger.warn(`${task} 请求失败：${response.error} (${response.reasonCode || 'unknown'})`);
            return {
                result: null,
            };
        }

        const proposalDocument = task === 'memory.ingest'
            ? this.buildMemoryProposalDocumentFromAiJsonPayload(response.data, rangeFallback)
            : null;
        logger.info(`${task} 返回提案摘要：${JSON.stringify(this.summarizeMemoryProposalDocumentForLog(proposalDocument))}`);
        if (!proposalDocument) {
            logger.warn(`${task} 返回结构无效，跳过落地：${JSON.stringify({
                hasDocument: Boolean(proposalDocument),
                keys: response.data && typeof response.data === 'object' && !Array.isArray(response.data)
                    ? Object.keys(response.data as Record<string, unknown>).slice(0, 12)
                    : [],
            })}`);
            return {
                result: null,
            };
        }

        logger.info(`${task} 准备进入提案落库：facts=${Array.isArray(proposalDocument.facts) ? proposalDocument.facts.length : 0}, patches=${Array.isArray(proposalDocument.patches) ? proposalDocument.patches.length : 0}, summaries=${Array.isArray(proposalDocument.summaries) ? proposalDocument.summaries.length : 0}`);
        const result = await memory.proposal.processProposal(proposalDocument, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被拒绝：${result.rejectedReasons.join('; ')}`);
        }
        return {
            result,
        };
    }

    /**
     * 功能：读取窗口中的 MemorySDK 实例。
     * @returns MemorySDK；不存在时返回 null。
     */
    private getWindowMemory(): MemorySDK | null {
        const globalRef = window as typeof window & {
            STX?: { memory?: MemorySDK };
        };
        return globalRef.STX?.memory ?? null;
    }

    /**
     * 功能：判断回复文本是否带有剧情 UI 包装标签。
     * @param text 待判断文本。
     * @returns 是否命中剧情 UI 包装。
     */
    private hasSceneUiWrapper(text: string): boolean {
        const source = String(text ?? '');
        return /<UI>|<world>|<user_status>|<char_status>|<story>|<options>/i.test(source);
    }

    /**
     * 功能：判断最近一轮内容里是否存在明确的工具、代码、日志或报错信号。
     * @param userLine 最近用户消息。
     * @param assistantLine 最近助手消息。
     * @returns 是否命中明确工具信号。
     */
    private hasExplicitToolSignal(userLine: string, assistantLine: string): boolean {
        const mergedText = `${String(userLine ?? '')}\n${String(assistantLine ?? '')}`;
        return /```|npm|pnpm|tsc|stack|error|exception|traceback|curl|sql|json schema|response_format|http\s*\d{3}|接口返回|日志|报错|命令|终端|控制台|代码|函数|编译|修复|配置/i.test(mergedText);
    }

    /**
     * 功能：判断文本里是否更像设定、资料或世界问答信号。
     * @param text 待判断文本。
     * @returns 是否命中设定信号。
     */
    private hasSettingSignal(text: string): boolean {
        return /设定|世界观|规则|地点|背景|是什么|谁是|哪国|历史|种族|阵营|资料|百科|介绍一下|在哪里/.test(String(text ?? ''));
    }

    /**
     * 功能：判断文本里是否出现明显的关系变化信号。
     * @param text 待判断文本。
     * @returns 是否命中关系变化信号。
     */
    private hasRelationshipSignal(text: string): boolean {
        return /关系|好感|敌人|盟友|恋人|队友|背叛|和解|信任|疏远|站在.*一边/.test(String(text ?? ''));
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
     * 功能：构建生成后 gate 决策。
     * @param input 判定输入。
     * @returns 生成后 gate 决策。
     */
    private buildPostGenerationDecision(input: {
        recentUserLine: string;
        recentAssistantLine: string;
        lorebookDecision: { mode: string; shouldExtractWorldFacts: boolean };
        summaryEnabled: boolean;
        logicalView: LogicalChatView | null;
        mutationKinds: ChatMutationKind[];
        extractStrategy: ChatProfile['extractStrategy'];
        stylePreference: ChatProfile['stylePreference'];
    }): PostGenerationGateDecision {
        const valueClass = this.classifyPostGenerationValue(
            input.recentUserLine,
            input.recentAssistantLine,
            input.stylePreference,
        );
        const supportsRelations = input.extractStrategy !== 'facts_only';
        const supportsWorldState = input.extractStrategy === 'facts_relations_world'
            && input.lorebookDecision.shouldExtractWorldFacts;
        const mutationKinds = Array.isArray(input.mutationKinds) ? input.mutationKinds : [];
        const requiresMutationRepair = mutationKinds.some((kind: ChatMutationKind): boolean => {
            return kind === 'message_edited' || kind === 'message_swiped' || kind === 'message_deleted' || kind === 'chat_branched';
        });
        const mutationReasonCodes = requiresMutationRepair ? ['mutation_repair_required', ...mutationKinds] : [];

        if (valueClass === 'small_talk_noise') {
            return {
                valueClass,
                shouldPersistLongTerm: false,
                shouldExtractFacts: false,
                shouldExtractRelations: false,
                shouldExtractWorldState: false,
                rebuildSummary: requiresMutationRepair && input.summaryEnabled,
                shouldUpdateWorldState: false,
                shortTermOnly: true,
                reasonCodes: ['small_talk_noise', 'skip_long_term_extract', ...mutationReasonCodes],
                generatedAt: Date.now(),
            };
        }

        if (valueClass === 'tool_result') {
            return {
                valueClass,
                shouldPersistLongTerm: true,
                shouldExtractFacts: true,
                shouldExtractRelations: false,
                shouldExtractWorldState: false,
                rebuildSummary: requiresMutationRepair && input.summaryEnabled,
                shouldUpdateWorldState: false,
                shortTermOnly: false,
                reasonCodes: ['tool_result', 'facts_only_focus', ...mutationReasonCodes],
                generatedAt: Date.now(),
            };
        }

        if (valueClass === 'setting_confirmed') {
            return {
                valueClass,
                shouldPersistLongTerm: true,
                shouldExtractFacts: true,
                shouldExtractRelations: supportsRelations,
                shouldExtractWorldState: supportsWorldState,
                rebuildSummary: input.summaryEnabled,
                shouldUpdateWorldState: supportsWorldState,
                shortTermOnly: false,
                reasonCodes: ['setting_confirmed', supportsWorldState ? 'world_state_update' : 'world_state_blocked', ...mutationReasonCodes],
                generatedAt: Date.now(),
            };
        }

        if (valueClass === 'relationship_shift') {
            return {
                valueClass,
                shouldPersistLongTerm: true,
                shouldExtractFacts: true,
                shouldExtractRelations: true,
                shouldExtractWorldState: false,
                rebuildSummary: input.summaryEnabled,
                shouldUpdateWorldState: false,
                shortTermOnly: false,
                reasonCodes: ['relationship_shift', 'relation_tracking', ...mutationReasonCodes],
                generatedAt: Date.now(),
            };
        }

        return {
            valueClass,
            shouldPersistLongTerm: true,
            shouldExtractFacts: true,
            shouldExtractRelations: supportsRelations,
            shouldExtractWorldState: supportsWorldState,
            rebuildSummary: input.summaryEnabled || requiresMutationRepair,
            shouldUpdateWorldState: supportsWorldState,
            shortTermOnly: false,
            reasonCodes: [
                input.logicalView?.mutationKinds?.includes('chat_branched') ? 'plot_progress_branch' : 'plot_progress',
                supportsWorldState ? 'world_state_candidate' : 'world_state_disabled',
                ...mutationReasonCodes,
            ],
            generatedAt: Date.now(),
        };
    }

    /**
     * 功能：把当前窗口预压缩成更适合模型消费的文本。
     * @param windowText 原始窗口文本。
     * @returns 预压缩后的文本与统计信息。
     */
    private precompressWindowText(windowText: string): { text: string; stats: PrecompressedWindowStats } {
        const originalText = String(windowText ?? '');
        const lines = originalText.split(/\r?\n/);
        const compacted: string[] = [];
        let removedGreetingCount = 0;
        let removedDuplicateCount = 0;
        let mergedRunCount = 0;
        let truncatedToolOutputCount = 0;
        let lastNormalizedLine = '';

        const isGreetingLine = (text: string): boolean => {
            return /^(hi|hello|hey|你好|嗨|哈喽|您好|好的|收到|明白|ok|okay|行|嗯嗯|嗯|对的|可以)[!！。,.，、\s]*$/i.test(text);
        };

        for (const rawLine of lines) {
            const line = String(rawLine ?? '').trim();
            if (!line) {
                continue;
            }
            const normalizedLine = line.toLowerCase().replace(/\s+/g, ' ');
            if (normalizedLine.length <= 12 && isGreetingLine(normalizedLine)) {
                removedGreetingCount += 1;
                continue;
            }
            if (normalizedLine === lastNormalizedLine) {
                removedDuplicateCount += 1;
                continue;
            }
            const previousLine = compacted[compacted.length - 1] ?? '';
            const previousNormalized = previousLine.toLowerCase().replace(/\s+/g, ' ');
            if (previousNormalized && normalizedLine.length > 18 && previousNormalized.length > 18) {
                if (normalizedLine.includes(previousNormalized) || previousNormalized.includes(normalizedLine)) {
                    mergedRunCount += 1;
                    continue;
                }
            }
            let nextLine = line;
            if (line.length > 420 && /```|stack|error|trace|debug|日志|报错|exception|warning|命令|curl|npm|pnpm|tsc/i.test(line)) {
                nextLine = `${line.slice(0, 360)}…`;
                truncatedToolOutputCount += 1;
            }
            compacted.push(nextLine);
            lastNormalizedLine = normalizedLine;
        }

        const text = compacted.join('\n');
        return {
            text,
            stats: {
                originalLength: originalText.length,
                compressedLength: text.length,
                removedGreetingCount,
                removedDuplicateCount,
                mergedRunCount,
                truncatedToolOutputCount,
            },
        };
    }

    /**
     * 功能：把 postGate 与主链信号收敛为最终处理等级。
     * @param input 决策输入。
     * @returns 处理等级决策。
     */
    private buildProcessingDecision(input: {
        postGate: PostGenerationGateDecision;
        summaryEnabled: boolean;
        lifecycle: ChatLifecycleState | null;
        chatProfile: ChatProfile | null;
        currentAssistantTurnCount: number;
        extractInterval: number;
        windowHash: string;
        windowEventCount: number;
        windowUserMessageCount: number;
        specialEventHit: boolean;
        mutationRepairSignal: boolean;
        cooldown: LongSummaryCooldownState | null;
        precompressedStats: PrecompressedWindowStats;
    }): MemoryProcessingDecision {
        const stage = input.lifecycle?.stage ?? 'new';
        const profile = input.chatProfile ?? null;
        const reasonCodes = new Set<string>([
            ...(input.postGate.reasonCodes ?? []),
            `stage_${stage}`,
            `chat_type_${profile?.chatType ?? 'solo'}`,
        ]);
        const specialEventHit = Boolean(input.specialEventHit);
        const mutationRepairSignal = Boolean(input.mutationRepairSignal);
        const stageCompletionSignal = specialEventHit && input.postGate.shouldPersistLongTerm && (
            input.postGate.rebuildSummary
            || input.postGate.shouldUpdateWorldState
            || input.postGate.shouldExtractWorldState
        );
        const longRunningSignal = stage === 'long_running';
        const shouldSummarize = Boolean(input.summaryEnabled);
        const cooldownWindow = Math.max(8, Math.round(Number(input.extractInterval ?? 0) || 0));
        const lastSummaryTurns = Math.max(0, Number(input.cooldown?.lastLongSummaryAssistantTurnCount ?? 0));
        const turnDelta = Math.max(0, Math.round(Number(input.currentAssistantTurnCount ?? 0)) - lastSummaryTurns);
        const cooldownActive = Boolean(input.cooldown?.lastLongSummaryWindowHash)
            && input.cooldown?.lastLongSummaryWindowHash === input.windowHash
            && turnDelta < cooldownWindow;

        let level: MemoryProcessingLevel = 'none';
        let summaryTier: SummaryExecutionTier = 'none';
        let extractScope: MemoryProcessingLevel = 'none';
        let heavyTriggerKind: HeavyProcessingTriggerKind | null = null;
        let cooldownBlocked = false;

        if (!input.postGate.shouldPersistLongTerm && !specialEventHit && !mutationRepairSignal && !longRunningSignal) {
            reasonCodes.add('skip_long_term_extract');
        } else if (input.postGate.valueClass === 'small_talk_noise' && !specialEventHit && !mutationRepairSignal) {
            reasonCodes.add('small_talk_noise');
            level = 'none';
        } else if (input.postGate.valueClass === 'tool_result') {
            level = 'light';
            extractScope = 'light';
            reasonCodes.add('tool_result');
        } else if (input.postGate.valueClass === 'relationship_shift') {
            level = 'medium';
            extractScope = 'medium';
            reasonCodes.add('relationship_shift');
        } else if (input.postGate.valueClass === 'setting_confirmed') {
            level = input.postGate.shouldExtractWorldState || input.postGate.rebuildSummary ? 'medium' : 'light';
            extractScope = level;
            reasonCodes.add('setting_confirmed');
        } else if (longRunningSignal) {
            level = 'heavy';
            extractScope = 'heavy';
            heavyTriggerKind = 'long_running';
            reasonCodes.add('long_running');
        } else if (mutationRepairSignal) {
            level = 'heavy';
            extractScope = 'heavy';
            heavyTriggerKind = 'structure_repair';
            reasonCodes.add('mutation_repair');
        } else if (stageCompletionSignal) {
            level = 'heavy';
            extractScope = 'heavy';
            heavyTriggerKind = 'stage_completion';
            reasonCodes.add('stage_completion');
        } else if (specialEventHit && input.postGate.rebuildSummary) {
            level = 'heavy';
            extractScope = 'heavy';
            heavyTriggerKind = 'special_event';
            reasonCodes.add('special_event');
        } else {
            level = input.postGate.rebuildSummary ? 'medium' : 'light';
            extractScope = level;
            reasonCodes.add('plot_progress');
        }

        if (profile?.chatType === 'tool') {
            if (level === 'heavy') {
                level = 'light';
                extractScope = 'light';
                reasonCodes.add('chat_type_tool_light');
            } else if (level === 'medium' && !mutationRepairSignal && !stageCompletionSignal) {
                level = 'light';
                extractScope = 'light';
                reasonCodes.add('chat_type_tool_light');
            }
        } else if (profile?.chatType === 'worldbook') {
            if (level === 'light' && input.postGate.shouldExtractWorldState) {
                level = 'medium';
                extractScope = 'medium';
                reasonCodes.add('chat_type_worldbook_world_state');
            }
        } else if (profile?.chatType === 'group') {
            if (level === 'light' && (input.postGate.shouldExtractRelations || input.postGate.shouldExtractWorldState)) {
                level = 'medium';
                extractScope = 'medium';
                reasonCodes.add('chat_type_group_relation');
            }
        } else if (profile?.memoryStrength === 'low' && level === 'heavy' && !mutationRepairSignal && !stageCompletionSignal) {
            level = 'medium';
            extractScope = 'medium';
            reasonCodes.add('low_memory_strength_soften');
        }

        if (level === 'heavy' && cooldownActive && !mutationRepairSignal && !stageCompletionSignal && !longRunningSignal) {
            cooldownBlocked = true;
            level = 'medium';
            extractScope = 'medium';
            summaryTier = shouldSummarize ? 'short' : 'none';
            reasonCodes.add('long_summary_cooldown');
        }

        if (summaryTier === 'none') {
            summaryTier = !shouldSummarize
                ? 'none'
                : level === 'heavy'
                    ? 'long'
                    : level === 'medium'
                        ? 'short'
                        : 'none';
        }

        if (summaryTier === 'long' && cooldownBlocked) {
            summaryTier = 'short';
        }

        return {
            level,
            summaryTier,
            extractScope,
            reasonCodes: Array.from(reasonCodes),
            heavyTriggerKind,
            cooldownBlocked,
            windowHash: input.windowHash,
            windowEventCount: Math.max(0, Math.round(Number(input.windowEventCount ?? 0))),
            windowUserMessageCount: Math.max(0, Math.round(Number(input.windowUserMessageCount ?? 0))),
            generatedAt: Date.now(),
            precompressedStats: input.precompressedStats,
        };
    }

    private classifyPostGenerationValue(
        userLine: string,
        assistantLine: string,
        stylePreference: ChatProfile['stylePreference'],
    ): GenerationValueClass {
        const userText = String(userLine ?? '').trim();
        const assistantText = String(assistantLine ?? '').trim();
        const mergedText = `${userText}\n${assistantText}`;
        const sceneUiWrapper = this.hasSceneUiWrapper(assistantText);
        const explicitToolSignal = this.hasExplicitToolSignal(userText, assistantText);

        if (!assistantText) {
            return 'small_talk_noise';
        }
        if (sceneUiWrapper) {
            if (this.hasSettingSignal(mergedText)) {
                return 'setting_confirmed';
            }
            if (this.hasRelationshipSignal(mergedText)) {
                return 'relationship_shift';
            }
            return 'plot_progress';
        }
        if (explicitToolSignal) {
            return 'tool_result';
        }
        if (/```|npm|pnpm|tsc|stack|error|函数|代码|命令|日志|修复|配置|接口|返回值/i.test(mergedText)) {
            return 'tool_result';
        }
        if (/设定|世界观|规则|地点|背景|是谁|是什么|哪国|历史|种族|阵营|资料|百科/.test(mergedText)) {
            return 'setting_confirmed';
        }
        if (/关系|好感|敌人|盟友|恋人|队友|背叛|和解|信任|疏远|站在.*一边/.test(mergedText)) {
            return 'relationship_shift';
        }
        if (
            assistantText.length < 72
            && /^(好|嗯|哈哈|是的|不是|当然|谢谢|没事|晚安|好的呀|知道了|收到)[。！!？?~ ]*$/i.test(assistantText)
        ) {
            return 'small_talk_noise';
        }
        if (stylePreference === 'qa' || stylePreference === 'info') {
            return 'setting_confirmed';
        }
        return 'plot_progress';
    }

    /**
     * 功能：计算轻量字符串哈希。
     * @param value 输入字符串。
     * @returns 哈希结果。
     */
    private hashString(value: string): string {
        let hash = 5381;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
        }
        return `h${(hash >>> 0).toString(16)}`;
    }
}
