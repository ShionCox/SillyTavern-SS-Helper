import { Logger } from '../../../SDK/logger';
import type { EventsManager } from './events-manager';
import type { TemplateManager } from '../template/template-manager';

const logger = new Logger('ExtractManager');

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
     * 对过往 Events 的最新积累切片发起一次记忆固化任务
     * AI 产出的提议将经由 ProposalManager 四道闸门审批后才会落盘
     */
    public async kickOffExtraction() {
        const globalST = window as any;

        // 确认 LLMHub 已就绪
        if (!globalST.STX?.llm) {
            logger.warn('大模型代理 LLMHub 未就绪，中止由于生成事件结束触发的记忆提取。');
            return;
        }

        // 获取最近 N 条 event，积攒不足则等待
        const recentEvents = await this.eventsManager.query({ limit: 12 });
        if (recentEvents.length < 5) {
            return;
        }

        try {
            // 查询当前激活的世界模板 Schema，作为大模型的抽取指引
            const activeTemplateId = await globalST.STX?.memory?.getActiveTemplateId?.() || undefined;
            let schemaContext: any = '请以通用视角提取角色与客观事实，包含关系与位置';
            if (activeTemplateId) {
                const currentSchema = await this.templateManager.getById(activeTemplateId);
                if (currentSchema?.entities) {
                    schemaContext = currentSchema.entities;
                }
            }

            // 将事件流打包成文本切片
            const bundleText = recentEvents.map(e =>
                `[${new Date(e.ts).toLocaleTimeString()}] ${e.type}: ${JSON.stringify(e.payload)}`
            ).join('\n');

            logger.info(`积攒 ${recentEvents.length} 条事件，准备发起 memory.extract 提议生成任务...`);

            // 调用 LLMHub 生成一个提议信封 (ProposalEnvelopeSchema 会在 LLMHub 自动校验)
            const response = await globalST.STX.llm.runTask({
                consumer: 'memory_os',
                task: 'memory.extract',
                input: {
                    systemPrompt: [
                        '你是一个专业的角色信息提取助手，请从对话事件流中提取结构化事实与状态变更。',
                        '输出必须是严格的 JSON 对象，格式如下：',
                        '{ "ok": true, "proposal": { "facts": [...], "patches": [...], "summaries": [...] }, "confidence": 0.0~1.0 }',
                        '不允许输出任何解释文字，只输出纯 JSON。'
                    ].join('\n'),
                    events: bundleText,
                    schemaContext: typeof schemaContext === 'string'
                        ? schemaContext
                        : JSON.stringify(schemaContext, null, 2)
                }
            });

            if (!response.ok) {
                logger.warn('memory.extract LLM 请求失败：' + response.error);
                return;
            }

            const proposalEnvelope = response.data;

            if (!proposalEnvelope?.ok || !proposalEnvelope?.proposal) {
                logger.warn('大模型返回提议信封格式异常，放弃本次落盘。');
                return;
            }

            logger.info('收到大模型提议，正在提交四道闸门审批...');

            // 将提议提交给 ProposalManager / 四道闸门
            const memory = globalST.STX?.memory;
            if (!memory?.proposal?.processProposal) {
                logger.warn('ProposalManager 尚未就绪，降级跳过本次审批。');
                return;
            }

            const result = await memory.proposal.processProposal(proposalEnvelope, 'memory_os');

            if (result.accepted) {
                logger.success(
                    `提议审批通过！写入：` +
                    `${result.applied.factKeys.length} 个事实, ` +
                    `${result.applied.statePaths.length} 条状态补丁, ` +
                    `${result.applied.summaryIds.length} 段摘要`
                );
            } else {
                logger.warn('提议被四道闸门拒绝，原因：' + result.rejectedReasons.join('; '));
            }

        } catch (e) {
            logger.error('ExtractManager.kickOffExtraction 发生错误', e);
        }
    }
}
