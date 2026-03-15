import { Logger } from '../../../SDK/logger';
import type { EventEnvelope, ProposalResult } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MEMORY_TASKS, checkAiModeGuard, runGeneration } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import type { ProposalEnvelope } from '../proposal/types';
import type { ChatStateManager } from './chat-state-manager';
import type { EventsManager } from './events-manager';
import { MetaManager } from './meta-manager';
import type { TemplateManager } from '../template/template-manager';
import type { TurnTracker } from './turn-tracker';
import { collectAdaptiveMetricsFromEvents } from './chat-strategy-engine';

const logger = new Logger('ExtractManager');

type ProposalTask = 'memory.summarize' | 'memory.extract';

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
    private readonly minUserMessageDelta = 3;
    private readonly minEventDelta = 20;
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

        const globalST = window as any;
        const memory = globalST?.STX?.memory;
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过抽取');
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        if (recentEvents.length === 0) {
            return;
        }

        const meta = await this.metaManager.getMeta();
        const triggerBySpecialEvent = recentEvents.some((event: EventEnvelope<any>): boolean => this.specialTriggerTypes.has(event.type));

        let summaryInterval = 12;
        let summaryWindowSize = 40;
        let summaryEnabled = true;
        if (this.chatStateManager) {
            const previousMetrics = await this.chatStateManager.getAdaptiveMetrics();
            const nextMetrics = collectAdaptiveMetricsFromEvents(recentEvents, previousMetrics);
            await this.chatStateManager.updateAdaptiveMetrics({
                avgMessageLength: nextMetrics.avgMessageLength,
                assistantLongMessageRatio: nextMetrics.assistantLongMessageRatio,
                userInfoDensity: nextMetrics.userInfoDensity,
                repeatedTopicRate: nextMetrics.repeatedTopicRate,
                recentUserTurns: nextMetrics.recentUserTurns,
                recentAssistantTurns: nextMetrics.recentAssistantTurns,
                recentGroupSpeakerCount: nextMetrics.recentGroupSpeakerCount,
                worldStateSignal: nextMetrics.worldStateSignal,
            });
            const adaptivePolicy = await this.chatStateManager.getAdaptivePolicy();
            summaryInterval = adaptivePolicy.extractInterval;
            summaryWindowSize = adaptivePolicy.extractWindowSize;
            summaryEnabled = adaptivePolicy.summaryEnabled;
        }

        const extractionWindow = recentEvents.slice(0, summaryWindowSize);
        const windowHash = this.computeWindowHash(extractionWindow);
        let shouldExtract = false;

        if (this.turnTracker && summaryEnabled) {
            const lastExtractTurnCount = meta?.lastExtractAssistantTurnCount ?? 0;
            shouldExtract = await this.turnTracker.shouldTriggerExtraction(
                lastExtractTurnCount,
                meta?.lastExtractWindowHash,
                windowHash,
                summaryInterval,
                summaryEnabled,
            );
        }

        if (!shouldExtract && !triggerBySpecialEvent) {
            const eventCount = await this.eventsManager.count();
            const userMsgCount = recentEvents.filter((event: EventEnvelope<any>): boolean => this.isUserMessageEvent(event.type)).length;
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
        const windowText = [...extractionWindow]
            .reverse()
            .map((event: EventEnvelope<any>): string => `[${new Date(event.ts).toLocaleTimeString()}] ${event.type}: ${this.getEventPayloadText(event)}`)
            .join('\n');
        const eventCount = await this.eventsManager.count();
        const userMsgCount = recentEvents.filter((event: EventEnvelope<any>): boolean => this.isUserMessageEvent(event.type)).length;

        logger.info(`触发抽取：chatKey=${this.chatKey}, turnBased=${Boolean(this.turnTracker)}, special=${triggerBySpecialEvent}`);

        try {
            const summarizeResult = summaryEnabled
                ? await this.runProposalTask(
                    'memory.summarize',
                    [
                        '你是对话摘要助手，请根据事件窗口生成可写入的摘要提议。',
                        '输出必须是纯 JSON，格式：',
                        '{ "ok": true, "proposal": { "summaries": [...] }, "confidence": 0.0~1.0 }',
                    ].join('\n'),
                    windowText,
                    schemaContext,
                    { maxTokens: 900, maxLatencyMs: 0, maxCost: 0.2 },
                )
                : null;
            const extractResult = await this.runProposalTask(
                'memory.extract',
                [
                    '你是结构化记忆提取助手，请提取 facts 与 patches。',
                    '输出必须是纯 JSON，格式：',
                    '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
                ].join('\n'),
                windowText,
                schemaContext,
                { maxTokens: 1400, maxLatencyMs: 0, maxCost: 0.35 },
            );

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
                    lastAcceptedAt: summarizeResult?.accepted || extractResult?.accepted ? Date.now() : extractHealth.lastAcceptedAt,
                });
                await this.chatStateManager.updateAdaptiveMetrics({
                    factsHitRate: Math.min(1, factsApplied / windowBase),
                    factsUpdateRate: Math.min(1, (factsApplied + patchesApplied) / windowBase),
                    summaryEffectiveness: summariesApplied > 0
                        ? Math.min(1, summariesApplied / Math.max(1, Math.ceil(windowBase / 4)))
                        : 0,
                });
                await this.chatStateManager.recomputeMemoryQuality();
            }
        } catch (error) {
            logger.error('抽取流程执行失败', error);
        } finally {
            const assistantTurnCount = this.turnTracker
                ? await this.turnTracker.getAssistantTurnCount()
                : undefined;
            await this.metaManager.markLastExtract({
                ts: Date.now(),
                eventCount,
                userMsgCount,
                windowHash,
                assistantTurnCount,
            });
        }
    }

    /**
     * 功能：构建抽取任务所需的 schema 上下文。
     * @param memory MemorySDK 实例。
     * @returns schema 上下文。
     */
    private async buildSchemaContext(memory: any): Promise<Record<string, unknown> | string> {
        const activeTemplateId = await memory.getActiveTemplateId?.();
        if (!activeTemplateId) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        const currentTemplate = await this.templateManager.getById(activeTemplateId);
        if (!currentTemplate) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        return {
            entities: currentTemplate.entities,
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
        systemPrompt: string,
        eventsText: string,
        schemaContext: Record<string, unknown> | string,
        budget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
    ): Promise<ProposalResult | null> {
        const globalST = window as any;
        const memory = globalST?.STX?.memory;
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
     * 功能：判断事件是否属于用户消息。
     * @param eventType 事件类型。
     * @returns 是否属于用户消息。
     */
    private isUserMessageEvent(eventType: string): boolean {
        return eventType === 'chat.message.sent' || eventType === 'user_message_rendered';
    }

    /**
     * 功能：为事件窗口计算哈希，避免重复抽取。
     * @param events 事件窗口。
     * @returns 哈希字符串。
     */
    private computeWindowHash(events: EventEnvelope<any>[]): string {
        const payload = events
            .map((event: EventEnvelope<any>): string => `${event.id}|${event.type}|${this.getEventPayloadText(event)}`)
            .join('\n');
        return this.hashString(payload);
    }

    /**
     * 功能：读取事件中的文本。
     * @param event 事件对象。
     * @returns 事件文本。
     */
    private getEventPayloadText(event: EventEnvelope<any>): string {
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
