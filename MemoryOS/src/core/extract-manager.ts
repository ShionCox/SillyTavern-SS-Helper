import { Logger } from '../../../SDK/logger';
import type { EventsManager } from './events-manager';
import type { TemplateManager } from '../template/template-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

const logger = new Logger('ExtractManager');

/**
 * AI 抽取编排器
 * 在 generation_ended 后触发，优先做摘要提议，再做事实/状态提议。
 */
export class ExtractManager {
    private chatKey: string;
    private eventsManager: EventsManager;
    private templateManager: TemplateManager;

    constructor(
        chatKey: string,
        events: EventsManager,
        templateMgr: TemplateManager
    ) {
        this.chatKey = chatKey;
        this.eventsManager = events;
        this.templateManager = templateMgr;
    }

    /**
     * 对最新事件窗口发起一次 AI 提议写入流程。
     * 规则：`memory.summarize` -> `memory.extract`，均通过四道闸门后落盘。
     */
    public async kickOffExtraction(): Promise<void> {
        const globalST = window as any;
        const llm = globalST?.STX?.llm;
        if (!llm) {
            logger.warn('LLMHub 未就绪，跳过 AI 记忆提议。');
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 20 });
        if (recentEvents.length < 5) {
            return;
        }

        const memory = globalST?.STX?.memory;
        if (!memory?.proposal?.processProposal) {
            logger.warn('ProposalManager 未就绪，跳过 AI 提议落盘。');
            return;
        }

        try {
            const activeTemplateId = await memory.getActiveTemplateId?.();
            let schemaContext: Record<string, unknown> | string = '请以通用视角提取角色、关系、位置与状态';
            if (activeTemplateId) {
                const currentTemplate = await this.templateManager.getById(activeTemplateId);
                if (currentTemplate) {
                    schemaContext = {
                        entities: currentTemplate.entities,
                        factTypes: currentTemplate.factTypes,
                        extractPolicies: currentTemplate.extractPolicies,
                    };
                }
            }

            const bundleText = recentEvents.map((event) =>
                `[${new Date(event.ts).toLocaleTimeString()}] ${event.type}: ${JSON.stringify(event.payload)}`
            ).join('\n');

            logger.info(`积攒 ${recentEvents.length} 条事件，开始 AI 摘要与提议流程。`);

            await this.runProposalTask(
                'memory.summarize',
                [
                    '你是对话摘要助手，请根据事件窗口生成可写入的摘要提议。',
                    '输出必须是纯 JSON 且符合格式：',
                    '{ "ok": true, "proposal": { "summaries": [...] }, "confidence": 0.0~1.0 }',
                    '不要输出解释文字。',
                ].join('\n'),
                bundleText,
                schemaContext
            );

            await this.runProposalTask(
                'memory.extract',
                [
                    '你是结构化记忆提取助手，请从事件窗口提取 facts 与 world_state patch。',
                    '输出必须是纯 JSON 且符合格式：',
                    '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
                    '不要输出解释文字。',
                ].join('\n'),
                bundleText,
                schemaContext
            );
        } catch (error) {
            logger.error('ExtractManager.kickOffExtraction 发生错误', error);
        }
    }

    /**
     * 执行单个 AI 提议任务并提交四道闸门审批。
     */
    private async runProposalTask(
        task: 'memory.summarize' | 'memory.extract',
        systemPrompt: string,
        eventsText: string,
        schemaContext: Record<string, unknown> | string
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
        });

        if (!response.ok) {
            logger.warn(`${task} 请求失败：${response.error}`);
            return;
        }

        const envelope = response.data;
        if (!envelope?.ok || !envelope?.proposal) {
            logger.warn(`${task} 返回提议信封格式异常，跳过落盘。`);
            return;
        }

        const result = await memory.proposal.processProposal(envelope, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 审批通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被闸门拒绝：${result.rejectedReasons.join('; ')}`);
        }
    }
}

