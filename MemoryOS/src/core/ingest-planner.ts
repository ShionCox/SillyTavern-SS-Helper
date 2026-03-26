import { logger } from '../runtime/runtime-services';
import type { EventEnvelope } from '../../../SDK/stx';
import type { ChatStateManager } from './chat-state-manager';
import { collectAdaptiveMetricsFromEvents } from './chat-strategy-engine';
import {
    buildSemanticChangeSummary,
    resolveAutoSummaryMode,
    shouldRunAutoSummary,
    type AutoSummaryDecisionResult,
    type SemanticChangeSummary,
} from './auto-summary-trigger';
import { MEMORY_OS_POLICY } from '../policy/memory-policy';
import { resolveSummaryRuntimeSettings } from './summary-settings-store';
import { evaluateLorebookRelevance, loadActiveWorldInfoEntriesFromHost } from './lorebook-relevance-gate';
import type { MetaManager } from './meta-manager';
import type { TurnTracker } from './turn-tracker';
import type {
    AutoSummaryDecisionSnapshot,
    ChatLifecycleState,
    ChatMutationKind,
    ChatProfile,
    GenerationValueClass,
    HeavyProcessingTriggerKind,
    LogicalChatView,
    LongSummaryCooldownState,
    MemoryIngestProgressState,
    MemoryProcessingDecision,
    MemoryProcessingLevel,
    PostGenerationGateDecision,
    PrecompressedWindowStats,
    SummaryExecutionTier,
    TurnRecord,
} from '../types';
import type { IngestMetaSnapshot, IngestPlan, IngestPlanBuildResult, IngestWindowSelection } from './ingest-types';

/**
 * 功能：定义 IngestPlanner 的依赖项。
 */
export interface IngestPlannerDeps {
    chatKey: string;
    specialTriggerTypes: Set<string>;
    turnTracker: TurnTracker | null;
    chatStateManager: ChatStateManager | null;
    metaManager: MetaManager;
}

/**
 * 功能：统一负责 ingest 阶段的触发判断、窗口选择、策略规划与执行参数生成。
 */
export class IngestPlanner {
    private readonly chatKey: string;
    private readonly specialTriggerTypes: Set<string>;
    private readonly turnTracker: TurnTracker | null;
    private readonly chatStateManager: ChatStateManager | null;
    private readonly metaManager: MetaManager;

    constructor(deps: IngestPlannerDeps) {
        this.chatKey = deps.chatKey;
        this.specialTriggerTypes = deps.specialTriggerTypes;
        this.turnTracker = deps.turnTracker;
        this.chatStateManager = deps.chatStateManager;
        this.metaManager = deps.metaManager;
    }

    /**
     * 功能：基于当前聊天视图和事件快照构建本轮 ingest 计划。
     * @param input 规划输入。
     * @returns 规划结果；当不满足触发条件时返回 `plan=null`。
     */
    public async buildPlan(input: {
        recentEvents: Array<EventEnvelope<unknown>>;
        logicalView: LogicalChatView;
        meta: IngestMetaSnapshot | null;
    }): Promise<IngestPlanBuildResult> {
        let summaryInterval = MEMORY_OS_POLICY.extract.defaultSummaryInterval;
        let summaryWindowSize = MEMORY_OS_POLICY.extract.defaultSummaryWindowSize;
        let summaryEnabled = MEMORY_OS_POLICY.extract.defaultSummaryEnabled;

        if (this.chatStateManager) {
            const previousMetrics = await this.chatStateManager.getAdaptiveMetrics();
            const nextMetrics = collectAdaptiveMetricsFromEvents(input.recentEvents, previousMetrics, input.logicalView);
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

            const currentAssistantTurnCount = await this.resolveAssistantTurnCount(input.logicalView, input.recentEvents);
            let adaptivePolicy = await this.chatStateManager.getAdaptivePolicy();
            const shouldRefreshProfile = this.shouldRefreshByAssistantTurns(
                currentAssistantTurnCount,
                Number(input.meta?.lastProfileRefreshAssistantTurnCount ?? 0),
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

        const currentAssistantTurnCount = await this.resolveAssistantTurnCount(input.logicalView, input.recentEvents);
        if (currentAssistantTurnCount > 0 && currentAssistantTurnCount <= 4) {
            summaryEnabled = false;
            summaryInterval = Math.min(Math.max(2, Number(summaryInterval || 0)), 3);
            summaryWindowSize = Math.max(8, Math.min(16, Number(summaryWindowSize || 0)));
        }
        const turnLedger = this.chatStateManager ? await this.chatStateManager.getTurnLedger() : [];
        const ingestProgress = this.chatStateManager
            ? await this.chatStateManager.getMemoryIngestProgress()
            : {
                lastProcessedAssistantTurnCount: 0,
                lastProcessedSnapshotHash: '',
                lastProcessedAt: 0,
                lastProcessedOutcome: 'skipped' as const,
                lastRepairGeneration: 0,
            };
        const repairGeneration = this.chatStateManager
            ? await this.chatStateManager.getMutationRepairGeneration()
            : 0;
        const triggerBySpecialEvent = input.recentEvents.some((event: EventEnvelope<unknown>): boolean => {
            return this.specialTriggerTypes.has(event.type);
        });
        const normalizedInterval = Math.max(1, Math.round(Number(summaryInterval || 0)));
        const lastProcessedAssistantTurnCount = Math.max(0, Number(ingestProgress.lastProcessedAssistantTurnCount ?? 0));
        const pendingAssistantTurns = Math.max(0, Number(currentAssistantTurnCount ?? 0) - lastProcessedAssistantTurnCount);
        logger.info(
            `统一记忆摄取门槛检查：chatKey=${this.chatKey}, 待处理assistant轮次=${pendingAssistantTurns}/${normalizedInterval}, 当前总assistant轮次=${currentAssistantTurnCount}, 上次已处理=${lastProcessedAssistantTurnCount}, repairGeneration=${repairGeneration}, lastRepairGeneration=${Number(ingestProgress.lastRepairGeneration ?? 0)}, specialEvent=${triggerBySpecialEvent}`,
        );

        const selection = this.resolveIngestWindowSelection({
            logicalView: input.logicalView,
            turnLedger,
            currentAssistantTurnCount,
            interval: summaryInterval,
            initialWindowSize: summaryWindowSize,
            triggerBySpecialEvent,
            repairGeneration,
            progress: ingestProgress,
        });
        if (!selection) {
            return {
                plan: null,
                currentAssistantTurnCount,
            };
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
            visibleMessages: input.logicalView.visibleMessages,
            recentEvents: input.recentEvents,
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
            logicalView: input.logicalView,
            mutationKinds: Array.isArray(input.logicalView.mutationKinds) ? input.logicalView.mutationKinds : [],
            extractStrategy: chatProfile?.extractStrategy ?? 'facts_relations',
            stylePreference: chatProfile?.stylePreference ?? 'story',
        });
        if (this.chatStateManager) {
            await this.chatStateManager.setLastPostGenerationDecision(postGate);
        }

        const lifecycleState = this.chatStateManager
            ? await this.chatStateManager.getLifecycleState()
            : null;
        const longSummaryCooldown = this.chatStateManager
            ? await this.chatStateManager.getLongSummaryCooldown()
            : null;
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
                logicalView: input.logicalView,
            });
            const semanticChange = buildSemanticChangeSummary({
                textWindow: compressedWindow.text,
                logicalView: input.logicalView,
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

        const plan: IngestPlan = {
            selection,
            currentAssistantTurnCount,
            repairGeneration,
            triggerBySpecialEvent,
            summaryEnabled,
            summaryInterval,
            chatProfile,
            previousLorebookDecision,
            lorebookDecision,
            postGate,
            lifecycleState,
            autoSummaryDecisionSnapshot,
            processingDecision,
            windowText,
            compressedWindowText: compressedWindow.text,
            precompressedStats: compressedWindow.stats,
            taskDescription: this.buildUnifiedIngestTaskDescription(processingDecision, selection),
            promptBudget: this.resolveUnifiedIngestBudget(processingDecision),
            metaRefreshSignals: {
                lastQualityRefreshAssistantTurnCount: Number(input.meta?.lastQualityRefreshAssistantTurnCount ?? 0),
            },
        };

        return {
            plan,
            currentAssistantTurnCount,
        };
    }

    /**
     * 功能：将自动长总结判定收口到处理决策上，仅控制是否允许进入 long summary。
     * @param input 判定输入。
     * @returns 应用自动总结策略后的处理决策。
     */
    public applyAutoSummaryDecision(input: {
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
     * 功能：根据已消费游标选择本轮需要送入模型的增量楼层窗口。
     * @param input 增量窗口计算输入。
     * @returns 本轮增量窗口；未达到触发条件时返回 `null`。
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
     * @param selection 当前窗口选择。
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
     * @param selection 当前窗口选择。
     * @returns 带范围的短标签。
     */
    private buildIngestRangeLabel(selection: IngestWindowSelection): string {
        const fromMessageId = String(selection.fromMessageId ?? '').trim();
        const toMessageId = String(selection.toMessageId ?? '').trim();
        const pendingTurns = Math.max(0, Number(selection.pendingAssistantTurns ?? 0));
        const fromShort = fromMessageId ? fromMessageId.slice(-8) : 'unknown';
        const toShort = toMessageId ? toMessageId.slice(-8) : 'unknown';
        return `[${fromShort} -> ${toShort}, pending ${pendingTurns}]`;
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
        const ingestBudgetPolicy = MEMORY_OS_POLICY.budget.ingestTiers;
        if (processingDecision.summaryTier === 'long' || processingDecision.extractScope === 'heavy') {
            return { ...ingestBudgetPolicy.heavy };
        }
        if (processingDecision.summaryTier === 'short' || processingDecision.extractScope === 'medium') {
            return { ...ingestBudgetPolicy.medium };
        }
        return { ...ingestBudgetPolicy.light };
    }

    /**
     * 功能：将可见楼层窗口转换成统一摄取文本。
     * @param windowMessages 增量楼层列表。
     * @returns 统一摄取窗口文本。
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
     * @returns 可见索引；找不到时返回 `-1`。
     */
    private findVisibleMessageIndex(logicalView: LogicalChatView, messageId?: string | null): number {
        const normalizedMessageId = String(messageId ?? '').trim();
        if (!normalizedMessageId) {
            return -1;
        }
        return logicalView.visibleMessages.findIndex((node) => node.messageId === normalizedMessageId);
    }

    /**
     * 功能：解析当前 assistant turn 计数。
     * @param logicalView 当前逻辑视图。
     * @param recentEvents 近期事件列表。
     * @returns assistant turn 数量。
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
     * 功能：构建自动长总结决策快照，供调试面板展示。
     * @param input 快照输入。
     * @returns 自动总结决策快照。
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
     * 功能：把语义变化布尔信号转换为可读 flag 列表。
     * @param semantic 语义变化摘要。
     * @returns 语义 flag 列表。
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
            return /^(hi|hello|hey|浣犲ソ|鍡▅鍝堝柦|鎮ㄥソ|濂界殑|鏀跺埌|鏄庣櫧|ok|okay|琛寍鍡棷|鍡瘄瀵圭殑|鍙互)[!锛併€?.锛屻€乗s]*$/i.test(text);
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
            if (line.length > 420 && /```|stack|error|trace|debug|鏃ュ織|鎶ラ敊|exception|warning|鍛戒护|curl|npm|pnpm|tsc/i.test(line)) {
                nextLine = `${line.slice(0, 360)}...`;
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
        const cooldownWindow = Math.max(
            MEMORY_OS_POLICY.extract.longSummaryCooldownMinTurns,
            Math.round(Number(input.extractInterval ?? 0) || 0),
        );
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

    /**
     * 功能：判定最近一轮内容的价值类型。
     * @param userLine 最近用户消息。
     * @param assistantLine 最近助手消息。
     * @param stylePreference 当前风格偏好。
     * @returns 价值类型。
     */
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
        if (/```|npm|pnpm|tsc|stack|error|鍑芥暟|浠ｇ爜|鍛戒护|鏃ュ織|淇|閰嶇疆|鎺ュ彛|杩斿洖鍊?/i.test(mergedText)) {
            return 'tool_result';
        }
        if (/璁惧畾|涓栫晫瑙倈瑙勫垯|鍦扮偣|鑳屾櫙|鏄皝|鏄粈涔坾鍝浗|鍘嗗彶|绉嶆棌|闃佃惀|璧勬枡|鐧剧/.test(mergedText)) {
            return 'setting_confirmed';
        }
        if (/鍏崇郴|濂芥劅|鏁屼汉|鐩熷弸|鎭嬩汉|闃熷弸|鑳屽彌|鍜岃В|淇′换|鐤忚繙|绔欏湪.*涓€杈?/i.test(mergedText)) {
            return 'relationship_shift';
        }
        if (
            assistantText.length < 72
            && /^(濂絴鍡瘄鍝堝搱|鏄殑|涓嶆槸|褰撶劧|璋㈣阿|娌′簨|鏅氬畨|濂界殑鍛€|鐭ラ亾浜唡鏀跺埌)[銆傦紒!锛?~ ]*$/i.test(assistantText)
        ) {
            return 'small_talk_noise';
        }
        if (stylePreference === 'qa' || stylePreference === 'info') {
            return 'setting_confirmed';
        }
        return 'plot_progress';
    }

    /**
     * 功能：判断回复文本是否带有剧情 UI 包装标签。
     * @param text 待判定文本。
     * @returns 是否命中剧情 UI 包装。
     */
    private hasSceneUiWrapper(text: string): boolean {
        const source = String(text ?? '');
        return /<UI>|<world>|<user_status>|<char_status>|<story>|<options>/i.test(source);
    }

    /**
     * 功能：判定内容中是否存在明确工具/代码/日志信号。
     * @param userLine 最近用户消息。
     * @param assistantLine 最近助手消息。
     * @returns 是否命中工具信号。
     */
    private hasExplicitToolSignal(userLine: string, assistantLine: string): boolean {
        const mergedText = `${String(userLine ?? '')}\n${String(assistantLine ?? '')}`;
        return /```|npm|pnpm|tsc|stack|error|exception|traceback|curl|sql|json schema|response_format|http\s*\d{3}|鎺ュ彛杩斿洖|鏃ュ織|鎶ラ敊|鍛戒护|缁堢|鎺у埗鍙皘浠ｇ爜|鍑芥暟|缂栬瘧|淇|閰嶇疆/i.test(mergedText);
    }

    /**
     * 功能：判定文本是否包含设定/世界问答信号。
     * @param text 待判定文本。
     * @returns 是否命中设定信号。
     */
    private hasSettingSignal(text: string): boolean {
        return /璁惧畾|涓栫晫瑙倈瑙勫垯|鍦扮偣|鑳屾櫙|鏄粈涔坾璋佹槸|鍝浗|鍘嗗彶|绉嶆棌|闃佃惀|璧勬枡|鐧剧|浠嬬粛涓€涓媩鍦ㄥ摢閲?/i.test(String(text ?? ''));
    }

    /**
     * 功能：判定文本是否出现明显关系变化信号。
     * @param text 待判定文本。
     * @returns 是否命中关系变化信号。
     */
    private hasRelationshipSignal(text: string): boolean {
        return /鍏崇郴|濂芥劅|鏁屼汉|鐩熷弸|鎭嬩汉|闃熷弸|鑳屽彌|鍜岃В|淇′换|鐤忚繙|绔欏湪.*涓€杈?/i.test(String(text ?? ''));
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
