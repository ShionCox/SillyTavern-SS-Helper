import { Logger } from '../../../SDK/logger';
import type { EventEnvelope, MemorySDK, ProposalResult } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MEMORY_TASKS, checkAiModeGuard, runGeneration } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import type { ProposalEnvelope } from '../proposal/types';
import type {
    ChatProfile,
    ChatMutationKind,
    GenerationValueClass,
    LogicalChatView,
    PostGenerationGateDecision,
} from '../types';
import type { ChatStateManager } from './chat-state-manager';
import { collectAdaptiveMetricsFromEvents } from './chat-strategy-engine';
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
    private readonly specialTriggerTypes: Set<string> = new Set([
        'memory.template.changed',
        'world.template.changed',
        'combat.end',
        'combat.round.end',
    ]);

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
        const summarizeGuard = checkAiModeGuard(MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId);
        if (summarizeGuard) {
            return;
        }

        const memory = this.getWindowMemory();
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过抽取');
            return;
        }

        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        const logicalView = this.chatStateManager
            ? await this.chatStateManager.getLogicalChatView()
            : null;
        if (recentEvents.length === 0 && !logicalView) {
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

        logger.info(`触发抽取：chatKey=${this.chatKey}, turnBased=${Boolean(this.turnTracker)}, special=${triggerBySpecialEvent}`);

        try {
            if (postGate.shortTermOnly && !postGate.shouldPersistLongTerm) {
                logger.info(`生成后 gate 判定为短期噪音，跳过长期抽取：${postGate.valueClass}`);
                return;
            }

            const summarizePrompt = this.buildSummarizePrompt(lorebookDecision.mode, postGate);
            const extractPrompt = this.buildExtractPrompt(lorebookDecision.mode, lorebookDecision.shouldExtractWorldFacts, postGate);

            const summarizeResult = summaryEnabled && postGate.rebuildSummary
                ? await this.runProposalTask(
                    'memory.summarize',
                    '对话摘要生成',
                    summarizePrompt,
                    windowText,
                    schemaContext,
                    { maxTokens: 900, maxLatencyMs: 0, maxCost: 0.2 },
                )
                : null;
            const extractResult = await this.runProposalTask(
                'memory.extract',
                '结构化记忆提取',
                extractPrompt,
                windowText,
                schemaContext,
                { maxTokens: 1400, maxLatencyMs: 0, maxCost: 0.35 },
            );

            if (extractResult?.accepted && typeof (memory as any)?.chatState?.primeColdStartExtract === 'function') {
                await (memory as any).chatState.primeColdStartExtract('extract_success');
            }

            if (this.chatStateManager) {
                const windowBase = Math.max(1, extractionWindow.length);
                const factsApplied = Number(extractResult?.applied?.factKeys?.length ?? 0);
                const patchesApplied = Number(extractResult?.applied?.statePaths?.length ?? 0);
                const summariesApplied = Number(summarizeResult?.applied?.summaryIds?.length ?? 0)
                    + Number(extractResult?.applied?.summaryIds?.length ?? 0);
                const extractHealth = await this.chatStateManager.getExtractHealth();
                const nextRecentTasks = [
                    ...extractHealth.recentTasks,
                    {
                        task: 'memory.summarize' as const,
                        accepted: Boolean(summarizeResult?.accepted),
                        appliedFacts: 0,
                        appliedPatches: 0,
                        appliedSummaries: Number(summarizeResult?.applied?.summaryIds?.length ?? 0),
                        ts: Date.now(),
                    },
                    {
                        task: 'memory.extract' as const,
                        accepted: Boolean(extractResult?.accepted),
                        appliedFacts: factsApplied,
                        appliedPatches: patchesApplied,
                        appliedSummaries: Number(extractResult?.applied?.summaryIds?.length ?? 0),
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
                if (postGate.rebuildSummary && summarizeResult?.accepted === false) {
                    await this.chatStateManager.enqueueSummaryFixTask(
                        `post_gate_summary_retry:${postGate.valueClass}`,
                        lorebookDecision.mode,
                    );
                }
                const currentAssistantTurnCount = await this.resolveAssistantTurnCount(logicalView, recentEvents);
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
        }
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
     * 功能：构建摘要任务提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param postGate 生成后 gate 结果。
     * @returns 摘要任务提示词。
     */
    private buildSummarizePrompt(
        lorebookMode: string,
        postGate: PostGenerationGateDecision,
    ): string {
        const lorebookHint = lorebookMode === 'block'
            ? '不要把世界书原文写入摘要，只保留聊天里明确出现的信息。'
            : lorebookMode === 'summary_only'
                ? '只保留概念级设定，不要复制世界书条目原文。'
                : '可以吸收世界书信息，但优先保留聊天显式确认内容。';
        return [
            '你是对话摘要助手，请根据事件窗口生成可写入的摘要提议。',
            '输出必须是纯 JSON，格式如下：',
            '所有摘要中的 title、content、keywords 等自然语言内容都必须使用简体中文。',
            `Lorebook gate mode: ${lorebookMode}.`,
            `Post gate class: ${postGate.valueClass}.`,
            `Should rebuild summary: ${postGate.rebuildSummary}.`,
            lorebookHint,
            'summaries 数组中的每一项都必须是对象，且至少包含：level(只能是 message/scene/arc) 与 content(字符串)。',
            '可选字段只有：title(字符串)、keywords(字符串数组)。不要输出纯字符串数组，不要输出 markdown。',
            '{ "ok": true, "proposal": { "summaries": [...] }, "confidence": 0.0~1.0 }',
        ].join('\n');
    }

    /**
     * 功能：构建事实抽取任务提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param allowWorldFacts 是否允许世界事实提取。
     * @param postGate 生成后 gate 结果。
     * @returns 抽取任务提示词。
     */
    private buildExtractPrompt(
        lorebookMode: string,
        allowWorldFacts: boolean,
        postGate: PostGenerationGateDecision,
    ): string {
        const worldHint = postGate.shouldExtractWorldState && allowWorldFacts
            ? '允许抽取世界设定类事实，但必须区分“聊天确认”和“仅世界书支撑”。'
            : '不要扩张世界设定类事实抽取，优先提取聊天显式信息。';
        const relationHint = postGate.shouldExtractRelations
            ? '允许提取关系变化、情绪变化和目标变化。'
            : '不要创建新的关系变化事实，除非文本明确出现强关系变动。';
        const retentionHint = postGate.shouldPersistLongTerm
            ? '允许写入长期记忆。'
            : '本轮只保留必要短期信息，不要扩张长期事实。';
        return [
            '你是结构化记忆提取助手，请提取 facts 与 patches。',
            '输出必须是纯 JSON，格式如下：',
            '所有 notes、summaries.content、summaries.title，以及 value 中的自然语言文本都必须使用简体中文。',
            `Lorebook gate mode: ${lorebookMode}.`,
            `Post gate class: ${postGate.valueClass}.`,
            `Persist long term: ${postGate.shouldPersistLongTerm}.`,
            `Extract facts: ${postGate.shouldExtractFacts}.`,
            `Extract relations: ${postGate.shouldExtractRelations}.`,
            `Extract world state: ${postGate.shouldExtractWorldState}.`,
            worldHint,
            relationHint,
            retentionHint,
            'facts 数组中的每一项都必须是对象，且至少包含：type(字符串) 与 value(任意 JSON 值)。可选字段：factKey、entity={kind,id}、path、confidence。',
            'patches 数组中的每一项都必须是对象，且必须包含：op(只能是 add/replace/remove) 与 path(字符串)。当 op 不是 remove 时，必须提供 value。',
            'summaries 如果返回，也必须是对象数组，每项字段同摘要任务要求。不要输出字符串数组，不要输出额外解释文本。',
            '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
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

        const response = await runGeneration<ProposalEnvelope>(
            task,
            {
                systemPrompt,
                events: eventsText,
                schemaContext: typeof schemaContext === 'string'
                    ? schemaContext
                    : JSON.stringify(schemaContext, null, 2),
            },
            budget,
            undefined,
            taskDescription,
        );
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
