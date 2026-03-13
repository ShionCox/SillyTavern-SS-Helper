import { Logger } from '../../../SDK/logger';
import type { EventsManager } from './events-manager';
import type { TemplateManager } from '../template/template-manager';
import { MetaManager } from './meta-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { EventEnvelope } from '../../../SDK/stx';

const logger = new Logger('ExtractManager');

type ProposalTask = 'memory.summarize' | 'memory.extract';

/**
 * 功能：AI 抽取编排器，负责触发策略、窗口去重与预算控制。
 */
export class ExtractManager {
    private chatKey: string;
    private eventsManager: EventsManager;
    private templateManager: TemplateManager;
    private metaManager: MetaManager;
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
        templateMgr: TemplateManager
    ) {
        this.chatKey = chatKey;
        this.eventsManager = events;
        this.templateManager = templateMgr;
        this.metaManager = new MetaManager(chatKey);
    }

    /**
     * 功能：触发一次抽取流程，满足阈值才会执行。
     * @returns 无返回值。
     */
    public async kickOffExtraction(): Promise<void> {
        const globalST = window as any;
        const llm = globalST?.STX?.llm;
        if (!llm) {
            logger.warn('LLMHub 未就绪，跳过抽取');
            return;
        }

        const memory = globalST?.STX?.memory;
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过抽取');
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        if (!recentEvents.length) {
            return;
        }

        const eventCount = await this.eventsManager.count();
        const userMsgCount = recentEvents.filter((event: EventEnvelope<any>) => this.isUserMessageEvent(event.type)).length;
        const triggerBySpecialEvent = recentEvents.some((event: EventEnvelope<any>) => this.specialTriggerTypes.has(event.type));

        const meta = await this.metaManager.getMeta();
        const eventDelta = Math.max(0, eventCount - Number(meta?.lastExtractEventCount ?? 0));
        const userDelta = Math.max(0, userMsgCount - Number(meta?.lastExtractUserMsgCount ?? 0));

        const extractionWindow = recentEvents.slice(0, 40);
        const windowHash = this.computeWindowHash(extractionWindow);

        if (!triggerBySpecialEvent && eventDelta < this.minEventDelta && userDelta < this.minUserMessageDelta) {
            return;
        }

        if (!triggerBySpecialEvent && meta?.lastExtractWindowHash === windowHash) {
            logger.info('抽取窗口未变化，跳过重复抽取');
            return;
        }

        const schemaContext = await this.buildSchemaContext(memory);
        const windowText = [...extractionWindow]
            .reverse()
            .map((event: EventEnvelope<any>) => `[${new Date(event.ts).toLocaleTimeString()}] ${event.type}: ${this.getEventPayloadText(event)}`)
            .join('\n');

        logger.info(`触发抽取：chatKey=${this.chatKey}, eventDelta=${eventDelta}, userDelta=${userDelta}, special=${triggerBySpecialEvent}`);

        try {
            await this.runProposalTask(
                'memory.summarize',
                [
                    '你是对话摘要助手，请根据事件窗口生成可写入的摘要提议。',
                    '输出必须是纯 JSON，格式：',
                    '{ "ok": true, "proposal": { "summaries": [...] }, "confidence": 0.0~1.0 }',
                ].join('\n'),
                windowText,
                schemaContext,
                { maxTokens: 900, maxLatencyMs: 12000, maxCost: 0.2 }
            );

            await this.runProposalTask(
                'memory.extract',
                [
                    '你是结构化记忆提取助手，请提取 facts 与 patches。',
                    '输出必须是纯 JSON，格式：',
                    '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
                ].join('\n'),
                windowText,
                schemaContext,
                { maxTokens: 1400, maxLatencyMs: 15000, maxCost: 0.35 }
            );
        } catch (error) {
            logger.error('抽取流程执行失败', error);
        } finally {
            await this.metaManager.markLastExtract({
                ts: Date.now(),
                eventCount,
                userMsgCount,
                windowHash,
            });
        }
    }

    /**
     * 功能：构建抽取所需模板上下文。
     * @param memory MemorySDK 实例。
     * @returns 模板上下文。
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
     * 功能：执行单个提议任务并提交四道闸门。
     * @param task 任务名称。
     * @param systemPrompt 系统提示词。
     * @param eventsText 事件窗口文本。
     * @param schemaContext 模板上下文。
     * @param budget 预算参数。
     * @returns 无返回值。
     */
    private async runProposalTask(
        task: ProposalTask,
        systemPrompt: string,
        eventsText: string,
        schemaContext: Record<string, unknown> | string,
        budget: { maxTokens: number; maxLatencyMs: number; maxCost: number }
    ): Promise<void> {
        const globalST = window as any;
        const llm = globalST?.STX?.llm;
        const memory = globalST?.STX?.memory;
        if (!llm || !memory?.proposal?.processProposal) {
            return;
        }

        const response = await llm.runTask({
            consumer: MEMORY_OS_PLUGIN_ID,
            task,
            input: {
                systemPrompt,
                events: eventsText,
                schemaContext: typeof schemaContext === 'string'
                    ? schemaContext
                    : JSON.stringify(schemaContext, null, 2),
            },
            budget,
        });

        if (!response.ok) {
            logger.warn(`${task} 请求失败：${response.error} (${response.reasonCode || 'unknown'})`);
            return;
        }

        const envelope = response.data;
        if (!envelope?.ok || !envelope?.proposal) {
            logger.warn(`${task} 返回结构无效，跳过落盘`);
            return;
        }

        const result = await memory.proposal.processProposal(envelope, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被拒绝：${result.rejectedReasons.join('; ')}`);
        }
    }

    /**
     * 功能：判断事件是否计入“用户消息增量”。
     * @param eventType 事件类型。
     * @returns 是否计入。
     */
    private isUserMessageEvent(eventType: string): boolean {
        return eventType === 'chat.message.sent' || eventType === 'user_message_rendered';
    }

    /**
     * 功能：计算事件窗口哈希，避免同窗口重复抽取。
     * @param events 事件窗口。
     * @returns 哈希字符串。
     */
    private computeWindowHash(events: EventEnvelope<any>[]): string {
        const payload = events
            .map((event: EventEnvelope<any>) => `${event.id}|${event.type}|${this.getEventPayloadText(event)}`)
            .join('\n');
        return this.hashString(payload);
    }

    /**
     * 功能：把事件 payload 解析为可读文本。
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
     * 功能：轻量字符串哈希。
     * @param value 原始字符串。
     * @returns 哈希字符串。
     */
    private hashString(value: string): string {
        let hash = 5381;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
        }
        return `h${(hash >>> 0).toString(16)}`;
    }
}
