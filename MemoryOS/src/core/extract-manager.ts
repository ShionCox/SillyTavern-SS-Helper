import { Logger } from '../../../SDK/logger';
import type { EventEnvelope, MemorySDK, ProposalResult } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MEMORY_TASKS, checkAiModeGuard, runGeneration } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import {
    buildExtractPromptByScopeTaskPrompt,
    buildLongSummarizeTaskPrompt,
    buildMemorySummarySaveSystemPrompt,
    buildShortSummarizeTaskPrompt,
} from '../llm/skills';
import type { ProposalEnvelope } from '../proposal/types';
import type {
    AutoSummaryDecisionSnapshot,
    ChatLifecycleState,
    ChatProfile,
    ChatMutationKind,
    GenerationValueClass,
    LogicalChatView,
    LongSummaryCooldownState,
    HeavyProcessingTriggerKind,
    MemoryProcessingDecision,
    MemoryProcessingLevel,
    PostGenerationGateDecision,
    PrecompressedWindowStats,
    SummaryExecutionTier,
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

const logger = new Logger('ExtractManager');

type ProposalTask = 'memory.summarize' | 'memory.extract';
type SchemaContextPayload = Record<string, unknown> | string;

/**
 * 功能：从事件窗口中提取最近一条用户文本。
 * @param events 最近事件窗口。
 * @returns 用户文本；不存在时返回空字符串。
 */
function normalizeTextFromEventWindow(events: Array<EventEnvelope<unknown>>): string {
    const userEvent = [...events].find((event: EventEnvelope<unknown>): boolean => {
        return event.type === 'chat.message.sent' || event.type === 'user_message_rendered';
    });
    if (!userEvent) {
        return '';
    }
    const payload = userEvent.payload;
    if (typeof payload === 'string') {
        return payload;
    }
    if (payload && typeof payload === 'object') {
        const source = payload as { text?: unknown; content?: unknown; message?: unknown };
        const text = source.text ?? source.content ?? source.message;
        return typeof text === 'string' ? text : '';
    }
    return '';
}

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
    private readonly minUserMessageDelta: number = 3;
    private readonly minEventDelta: number = 20;
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
        logger.info(`开始评估抽取触发条件，chatKey=${this.chatKey}`);
        const summarizeGuard = checkAiModeGuard(MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId);
        if (summarizeGuard) {
            logger.info(`抽取跳过：AI 守卫未通过，chatKey=${this.chatKey}`);
            return;
        }

        const memory = this.getWindowMemory();
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过抽取');
            return;
        }

        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            logger.info(`抽取跳过：聊天已归档，chatKey=${this.chatKey}`);
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        const logicalView = this.chatStateManager
            ? await this.chatStateManager.getLogicalChatView()
            : null;
        if (recentEvents.length === 0 && !logicalView) {
            logger.info(`抽取跳过：最近事件与逻辑视图都为空，chatKey=${this.chatKey}`);
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

        const extractionWindow = recentEvents.slice(0, summaryWindowSize);
        const windowHash = logicalView
            ? this.computeLogicalViewHash(logicalView, summaryWindowSize)
            : this.computeWindowHash(extractionWindow);
        let shouldExtract = false;

        if (this.turnTracker && summaryEnabled) {
            const lastExtractTurnCount = meta?.lastExtractAssistantTurnCount ?? 0;
            shouldExtract = await this.turnTracker.shouldTriggerExtraction({
                lastExtractAssistantTurnCount: lastExtractTurnCount,
                lastExtractWindowHash: meta?.lastExtractWindowHash,
                currentWindowHash: windowHash,
                interval: summaryInterval,
                summaryEnabled,
                lastCommittedTurnCursor: meta?.lastCommittedTurnCursor,
                lastVisibleTurnSnapshotHash: meta?.lastVisibleTurnSnapshotHash,
            });
        }

        if (!shouldExtract && !triggerBySpecialEvent) {
            const eventCount = await this.eventsManager.count();
            const userMsgCount = recentEvents.filter((event: EventEnvelope<unknown>): boolean => {
                return this.isUserMessageEvent(event.type);
            }).length;
            const eventDelta = Math.max(0, eventCount - Number(meta?.lastExtractEventCount ?? 0));
            const userDelta = Math.max(0, userMsgCount - Number(meta?.lastExtractUserMsgCount ?? 0));
            if (eventDelta < this.minEventDelta && userDelta < this.minUserMessageDelta) {
                logger.info(`抽取跳过：未达到触发阈值，chatKey=${this.chatKey}, eventDelta=${eventDelta}, userDelta=${userDelta}`);
                return;
            }
            if (meta?.lastExtractWindowHash === windowHash) {
                logger.info('抽取窗口未变化，跳过重复抽取');
                return;
            }
        } else if (!shouldExtract && !triggerBySpecialEvent) {
            return;
        }

        if (!triggerBySpecialEvent && !shouldExtract && meta?.lastExtractWindowHash === windowHash) {
            logger.info('抽取窗口未变化，跳过重复抽取');
            return;
        }

        const schemaContext = await this.buildSchemaContext(memory);
        const windowText = logicalView
            ? this.buildLogicalWindowText(logicalView, summaryWindowSize)
            : [...extractionWindow]
                .reverse()
                .map((event: EventEnvelope<unknown>): string => {
                    return `[${new Date(event.ts).toLocaleTimeString()}] ${event.type}: ${this.getEventPayloadText(event)}`;
                })
                .join('\n');
        const recentUserLine = logicalView
            ? [...logicalView.visibleMessages].reverse().find((node) => node.role === 'user')?.text ?? ''
            : normalizeTextFromEventWindow(extractionWindow);
        const recentAssistantLine = logicalView
            ? [...logicalView.visibleMessages].reverse().find((node) => node.role === 'assistant')?.text ?? ''
            : [...extractionWindow]
                .reverse()
                .map((event: EventEnvelope<unknown>): string => this.getEventPayloadText(event))
                .find((text: string): boolean => text.trim().length > 0) ?? '';
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
            visibleMessages: logicalView?.visibleMessages,
            recentEvents: extractionWindow,
            worldStateText: '',
            entries: worldInfoEntries,
        });
        if (this.chatStateManager) {
            await this.chatStateManager.setLorebookDecision(lorebookDecision, 'extract');
        }
        const eventCount = await this.eventsManager.count();
        const userMsgCount = logicalView
            ? logicalView.visibleUserTurns.length
            : recentEvents.filter((event: EventEnvelope<unknown>): boolean => this.isUserMessageEvent(event.type)).length;
        const postGate = this.buildPostGenerationDecision({
            recentUserLine,
            recentAssistantLine,
            lorebookDecision,
            summaryEnabled,
            logicalView,
            mutationKinds: Array.isArray(logicalView?.mutationKinds) ? logicalView!.mutationKinds : [],
            extractStrategy: chatProfile?.extractStrategy ?? 'facts_relations',
            stylePreference: chatProfile?.stylePreference ?? 'story',
        });

        if (this.chatStateManager) {
            await this.chatStateManager.setLastPostGenerationDecision(postGate);
        }

        if (this.extractionFlight && this.extractionFlightWindowHash === windowHash) {
            logger.info(`抽取跳过：相同窗口已在处理中，chatKey=${this.chatKey}, windowHash=${windowHash}`);
            await this.extractionFlight;
            return;
        }

        if (
            this.lastSettledWindowHash === windowHash
            && Date.now() - this.lastSettledAt <= this.duplicateWindowMs
        ) {
            logger.info(`抽取跳过：相同窗口刚处理完成，chatKey=${this.chatKey}, windowHash=${windowHash}`);
            return;
        }

        logger.info(`触发抽取：chatKey=${this.chatKey}, turnBased=${Boolean(this.turnTracker)}, special=${triggerBySpecialEvent}`);
        let currentExtractionPromise: Promise<void> | null = null;
        const extractionPromise = (async (): Promise<void> => {
            try {
                {
                    const currentAssistantTurnCount = await this.resolveAssistantTurnCount(logicalView, recentEvents);
                    const lifecycleState = this.chatStateManager
                        ? await this.chatStateManager.getLifecycleState()
                        : null;
                    const longSummaryCooldown = this.chatStateManager
                        ? await this.chatStateManager.getLongSummaryCooldown()
                        : null;
                    const compressedWindow = this.precompressWindowText(windowText);
                    let processingDecision = this.buildProcessingDecision({
                        postGate,
                        summaryEnabled,
                        lifecycle: lifecycleState,
                        chatProfile,
                        currentAssistantTurnCount,
                        extractInterval: summaryInterval,
                        windowHash,
                        windowEventCount: eventCount,
                        windowUserMessageCount: userMsgCount,
                        specialEventHit: triggerBySpecialEvent,
                        mutationRepairSignal: postGate.reasonCodes.includes('mutation_repair_required'),
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
                    }

                    if (this.chatStateManager) {
                        await this.chatStateManager.setLastProcessingDecision(processingDecision);
                    }

                    if (processingDecision.level === 'none') {
                        if (this.chatStateManager) {
                            const extractHealth = await this.chatStateManager.getExtractHealth();
                            await this.chatStateManager.recordExtractHealth({
                                recentTasks: [
                                    ...extractHealth.recentTasks,
                                    {
                                        task: 'memory.extract' as const,
                                        accepted: false,
                                        appliedFacts: 0,
                                        appliedPatches: 0,
                                        appliedSummaries: 0,
                                        processingLevel: processingDecision.level,
                                        summaryTier: processingDecision.summaryTier,
                                        windowHash,
                                        reasonCodes: processingDecision.reasonCodes,
                                        ts: Date.now(),
                                    },
                                ].slice(-12),
                                lastAcceptedAt: extractHealth.lastAcceptedAt,
                            });
                        }
                        return;
                    }

                    const summarizeResult = processingDecision.summaryTier === 'none'
                        ? null
                        : await this.runProposalTask(
                            'memory.summarize',
                            processingDecision.summaryTier === 'long' ? '长总结生成' : '短总结生成',
                            processingDecision.summaryTier === 'long'
                                ? this.buildLongSummarizePrompt(lorebookDecision.mode, postGate)
                                : this.buildShortSummarizePrompt(lorebookDecision.mode, postGate),
                            compressedWindow.text,
                            schemaContext,
                            processingDecision.summaryTier === 'long'
                                ? { maxTokens: 8000, maxLatencyMs: 0, maxCost: 0.55 }
                                : { maxTokens: 2400, maxLatencyMs: 0, maxCost: 0.25 },
                        );
                    const extractResult = await this.runProposalTask(
                        'memory.extract',
                        processingDecision.level === 'heavy' ? '重处理记忆抽取' : processingDecision.level === 'medium' ? '中处理记忆抽取' : '轻处理记忆抽取',
                        this.buildExtractPromptByScope(
                            lorebookDecision.mode,
                            lorebookDecision.shouldExtractWorldFacts,
                            postGate,
                            processingDecision.extractScope,
                        ),
                        compressedWindow.text,
                        schemaContext,
                        processingDecision.extractScope === 'heavy'
                            ? { maxTokens: 2600, maxLatencyMs: 0, maxCost: 0.45 }
                            : processingDecision.extractScope === 'medium'
                                ? { maxTokens: 1600, maxLatencyMs: 0, maxCost: 0.32 }
                                : { maxTokens: 900, maxLatencyMs: 0, maxCost: 0.2 },
                    );

                    if (extractResult?.accepted && typeof (memory as any)?.chatState?.primeColdStartExtract === 'function') {
                        logger.info(`抽取成功后触发 cold-start extract，chatKey=${this.chatKey}, reason=extract_success, accepted=${Boolean(extractResult?.accepted)}`);
                        await (memory as any).chatState.primeColdStartExtract('extract_success');
                    }

                    if (this.chatStateManager) {
                        const windowBase = Math.max(1, extractionWindow.length);
                        const factsApplied = Number(extractResult?.applied?.factKeys?.length ?? 0);
                        const patchesApplied = Number(extractResult?.applied?.statePaths?.length ?? 0);
                        const summariesApplied = Number(summarizeResult?.applied?.summaryIds?.length ?? 0);
                        const extractHealth = await this.chatStateManager.getExtractHealth();
                        const nextRecentTasks = [
                            ...extractHealth.recentTasks,
                            ...(processingDecision.summaryTier === 'none'
                                ? []
                                : [{
                                    task: 'memory.summarize' as const,
                                    accepted: Boolean(summarizeResult?.accepted),
                                    appliedFacts: 0,
                                    appliedPatches: 0,
                                    appliedSummaries: Number(summarizeResult?.applied?.summaryIds?.length ?? 0),
                                    processingLevel: processingDecision.level,
                                    summaryTier: processingDecision.summaryTier,
                                    windowHash,
                                    reasonCodes: processingDecision.reasonCodes,
                                    ts: Date.now(),
                                }]),
                            {
                                task: 'memory.extract' as const,
                                accepted: Boolean(extractResult?.accepted),
                                appliedFacts: factsApplied,
                                appliedPatches: patchesApplied,
                                appliedSummaries: 0,
                                processingLevel: processingDecision.level,
                                summaryTier: processingDecision.summaryTier,
                                windowHash,
                                reasonCodes: processingDecision.reasonCodes,
                                ts: Date.now(),
                            },
                        ].slice(-12);
                        await this.chatStateManager.recordExtractHealth({
                            recentTasks: nextRecentTasks,
                            lastAcceptedAt: summarizeResult?.accepted || extractResult?.accepted
                                ? Date.now()
                                : extractHealth.lastAcceptedAt,
                        });
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
                        if (processingDecision.summaryTier === 'long' && summarizeResult?.accepted) {
                            const now = Date.now();
                            await this.chatStateManager.setLongSummaryCooldown({
                                lastLongSummaryAt: now,
                                lastLongSummaryWindowHash: windowHash,
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
                        } else if (extractResult?.accepted) {
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
                        if (processingDecision.summaryTier !== 'none' && summarizeResult?.accepted === false) {
                            await this.chatStateManager.enqueueSummaryFixTask(
                                `summary_retry:${processingDecision.summaryTier}:${postGate.valueClass}`,
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
                        } else if (postGate.reasonCodes.includes('mutation_repair_required')) {
                            await this.chatStateManager.recomputeMemoryQuality();
                        }
                    }
                    return;
                }
            } catch (error) {
                logger.error('抽取流程执行失败', error);
            } finally {
                const extractionSnapshot = this.turnTracker
                    ? await this.turnTracker.getExtractionSnapshot()
                    : null;
                await this.metaManager.markLastExtract({
                    ts: Date.now(),
                    eventCount,
                    userMsgCount,
                    windowHash,
                    activeAssistantTurnCount: extractionSnapshot?.activeAssistantTurnCount,
                    lastCommittedTurnCursor: extractionSnapshot?.lastCommittedTurnCursor,
                    lastVisibleTurnSnapshotHash: extractionSnapshot?.lastVisibleTurnSnapshotHash,
                });
                this.lastSettledWindowHash = windowHash;
                this.lastSettledAt = Date.now();
                if (currentExtractionPromise && this.extractionFlight === currentExtractionPromise) {
                    this.extractionFlight = null;
                    this.extractionFlightWindowHash = '';
                }
            }
        })();

        currentExtractionPromise = extractionPromise;
        this.extractionFlight = extractionPromise;
        this.extractionFlightWindowHash = windowHash;
        await extractionPromise;
    }

    /**
     * 功能：解析当前聊天可见的 assistant turn 计数。
     * @param logicalView 逻辑消息视图。
     * @param recentEvents 最近事件窗口。
     * @returns assistant turn 计数。
     */
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
     * 功能：构建短总结提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param postGate 生成后 gate 结果。
     * @returns 短总结任务提示词。
     */
    private buildShortSummarizePrompt(
        lorebookMode: string,
        postGate: PostGenerationGateDecision,
    ): string {
        return buildShortSummarizeTaskPrompt(
            lorebookMode,
            postGate,
            buildMemorySummarySaveSystemPrompt(),
        );
    }

    /**
     * 功能：构建长总结提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param postGate 生成后 gate 结果。
     * @returns 长总结任务提示词。
     */
    private buildLongSummarizePrompt(
        lorebookMode: string,
        postGate: PostGenerationGateDecision,
    ): string {
        return buildLongSummarizeTaskPrompt(
            lorebookMode,
            postGate,
            buildMemorySummarySaveSystemPrompt(),
        );
    }

    /**
     * 功能：构建分档抽取提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param allowWorldFacts 是否允许抽取世界事实。
     * @param postGate 生成后 gate 结果。
     * @param scope 抽取范围档位。
     * @returns 抽取任务提示词。
     */
    private buildExtractPromptByScope(
        lorebookMode: string,
        allowWorldFacts: boolean,
        postGate: PostGenerationGateDecision,
        scope: MemoryProcessingLevel,
    ): string {
        return buildExtractPromptByScopeTaskPrompt(
            lorebookMode,
            allowWorldFacts,
            postGate,
            scope,
        );
    }

    /**
     * 功能：构建抽取失败后的紧凑重试提示词，降低 JSON 被截断的概率。
     * @param basePrompt 原始提示词。
     * @param task 当前提议任务。
     * @returns 更严格的重试提示词。
     */
    private buildCompactRetryPrompt(basePrompt: string, task: ProposalTask): string {
        if (task === 'memory.extract') {
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
    ): Promise<ProposalResult | null> {
        const memory = this.getWindowMemory();
        if (!memory?.proposal?.processProposal) {
            return null;
        }

        const executeAttempt = async (
            prompt: string,
            attemptBudget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        ) => {
            return runGeneration<ProposalEnvelope>(
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

        let response = await executeAttempt(systemPrompt, budget);
        if (!response.ok && response.reasonCode === 'invalid_json') {
            const retryBudget = {
                maxTokens: Math.min(3200, Math.max(Number(budget.maxTokens ?? 0) + 400, 2200)),
                maxLatencyMs: budget.maxLatencyMs,
                maxCost: Math.max(Number(budget.maxCost ?? 0), task === 'memory.extract' ? 0.5 : 0.25),
            };
            logger.warn(`${task} 返回无效 JSON，启用紧凑模式重试一次`);
            response = await executeAttempt(this.buildCompactRetryPrompt(systemPrompt, task), retryBudget);
        }
        if (!response.ok) {
            logger.warn(`${task} 请求失败：${response.error} (${response.reasonCode || 'unknown'})`);
            return null;
        }

        const envelope = response.data;
        if (!envelope?.ok || !envelope?.proposal) {
            logger.warn(`${task} 返回结构无效，跳过落地`);
            return null;
        }

        const result = await memory.proposal.processProposal(envelope, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被拒绝：${result.rejectedReasons.join('; ')}`);
        }
        return result;
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
     * 功能：判断事件是否属于用户消息。
     * @param eventType 事件类型。
     * @returns 是否属于用户消息。
     */
    private isUserMessageEvent(eventType: string): boolean {
        return eventType === 'chat.message.sent' || eventType === 'user_message_rendered';
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
     * 功能：对最近一轮回复进行轻量价值分类。
     * @param userLine 最近一条用户消息。
     * @param assistantLine 最近一条助手消息。
     * @param stylePreference 当前聊天风格偏好。
     * @returns 生成价值分类。
     */
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

        if (!assistantText) {
            return 'small_talk_noise';
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
     * 功能：为事件窗口计算哈希，避免重复抽取。
     * @param events 事件窗口。
     * @returns 哈希字符串。
     */
    private computeWindowHash(events: Array<EventEnvelope<unknown>>): string {
        const payload = events
            .map((event: EventEnvelope<unknown>): string => `${event.id}|${event.type}|${this.getEventPayloadText(event)}`)
            .join('\n');
        return this.hashString(payload);
    }

    /**
     * 功能：对逻辑消息视图窗口计算哈希，避免重复抽取。
     * @param view 逻辑消息视图。
     * @param limit 窗口长度。
     * @returns 窗口哈希值。
     */
    private computeLogicalViewHash(view: LogicalChatView, limit: number): string {
        const windowMessages = view.visibleMessages.slice(Math.max(0, view.visibleMessages.length - limit));
        const payload = windowMessages
            .map((node) => `${node.messageId}|${node.role}|${node.textSignature}`)
            .join('\n');
        return this.hashString(`${payload}|${view.snapshotHash}|${(view.mutationKinds || []).join(',')}`);
    }

    /**
     * 功能：把逻辑消息视图转换为抽取窗口文本。
     * @param view 逻辑消息视图。
     * @param limit 窗口长度。
     * @returns 窗口文本。
     */
    private buildLogicalWindowText(view: LogicalChatView, limit: number): string {
        const windowMessages = view.visibleMessages.slice(Math.max(0, view.visibleMessages.length - limit));
        return windowMessages
            .map((node) => {
                return `[${new Date(node.updatedAt || node.createdAt || Date.now()).toLocaleTimeString()}] chat.message.${node.role}: ${node.text}`;
            })
            .join('\n');
    }

    /**
     * 功能：读取事件中的文本。
     * @param event 事件对象。
     * @returns 事件文本。
     */
    private getEventPayloadText(event: EventEnvelope<unknown>): string {
        const payload = event?.payload;
        if (typeof payload === 'string') {
            return payload;
        }
        if (payload && typeof payload === 'object' && typeof (payload as { text?: unknown }).text === 'string') {
            return String((payload as { text: string }).text);
        }
        try {
            return JSON.stringify(payload);
        } catch {
            return String(payload ?? '');
        }
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
