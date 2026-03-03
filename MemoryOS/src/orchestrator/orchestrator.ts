import type { LLMSDK } from '../../../SDK/stx';
import type { WriteRequest, ProposalResult, ProposalEnvelope } from '../proposal/types';
import { ProposalManager } from '../proposal/proposal-manager';
import { EventsManager } from '../core/events-manager';
import { EventBus } from '../../../SDK/bus/bus';
import type { EventEnvelope } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * 编排胶水层 —— 监听 Bus 事件，自动触发 AI 抽取/写入
 *
 * 职责：
 * 1. 监听事件总线，自动将事件写入 events store
 * 2. AI 模式下自动调用 memory.extract / dice.narrate 等任务
 * 3. 代理外部插件 requestWrite 请求
 */
export class Orchestrator {
    private chatKey: string;
    private bus: EventBus;
    private eventsManager: EventsManager;
    private proposalManager: ProposalManager;
    private llmSdk: LLMSDK | null = null;
    private aiMode: boolean = false;

    /** 事件类型 → AI 任务映射 */
    private taskMappings: Map<string, string> = new Map([
        ['dice.roll', 'dice.narrate'],
        ['combat.attack', 'memory.extract'],
        ['combat.damage', 'memory.extract'],
        ['quest.update', 'memory.extract'],
    ]);

    /** 注册的卸载函数 */
    private unsubscribers: Array<() => void> = [];

    constructor(chatKey: string, bus: EventBus) {
        this.chatKey = chatKey;
        this.bus = bus;
        this.eventsManager = new EventsManager(chatKey);
        this.proposalManager = new ProposalManager(chatKey);
    }

    /**
     * 启用 AI 模式
     */
    enableAIMode(llmSdk: LLMSDK): void {
        this.llmSdk = llmSdk;
        this.aiMode = true;
    }

    /**
     * 禁用 AI 模式（降级为 RULE）
     */
    disableAIMode(): void {
        this.llmSdk = null;
        this.aiMode = false;
    }

    /**
     * 开始监听事件总线
     * 所有事件自动写入 events store + 按模式触发后续处理
     */
    startListening(): void {
        // 通配监听所有事件
        const eventTypes = [
            'dice.roll', 'dice.check',
            'combat.attack', 'combat.damage',
            'quest.update',
            'world.move',
            'memory.fact.upserted',
            'memory.template.changed',
        ];

        for (const type of eventTypes) {
            const unsub = this.bus.on(type, async (evt: EventEnvelope<any>) => {
                await this.handleEvent(evt);
            });
            this.unsubscribers.push(unsub);
        }
    }

    /**
     * 停止监听
     */
    stopListening(): void {
        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.unsubscribers = [];
    }

    /**
     * 处理单个事件：写入 + 可选 AI 处理
     */
    private async handleEvent(evt: EventEnvelope<any>): Promise<void> {
        // 1. 始终写入事件流
        await this.eventsManager.append(evt.type, evt.payload, {
            sourcePlugin: evt.source.pluginId,
        });

        // 2. AI 模式下尝试调用对应任务
        if (this.aiMode && this.llmSdk) {
            const task = this.taskMappings.get(evt.type);
            if (task) {
                try {
                    await this.triggerAITask(task, evt);
                } catch (err) {
                    // AI 失败静默降级，不影响主对话
                    console.warn(`[Orchestrator] AI 任务 "${task}" 失败，已降级:`, err);
                }
            }
        }
    }

    /**
     * 触发 AI 任务并处理提议
     */
    private async triggerAITask(task: string, evt: EventEnvelope<any>): Promise<void> {
        if (!this.llmSdk) return;

        const result = await this.llmSdk.runTask<any>({
            consumer: MEMORY_OS_PLUGIN_ID,
            task,
            input: {
                messages: [
                    { role: 'system', content: this.getSystemPrompt(task) },
                    { role: 'user', content: JSON.stringify({ event: evt, chatKey: this.chatKey }) },
                ],
                temperature: 0.3,
            },
            schema: this.getTaskSchema(task),
            budget: { maxTokens: 2048, maxLatencyMs: 15000 },
        });

        if (!result.ok) return;

        // 将 AI 返回转为提议
        const envelope: ProposalEnvelope = {
            ok: true,
            proposal: result.data,
            confidence: result.data.confidence ?? 0.8,
        };

        await this.proposalManager.processProposal(envelope, MEMORY_OS_PLUGIN_ID);
    }

    /**
     * 外部插件写入请求的统一入口 (requestWrite)
     */
    async requestWrite(request: WriteRequest): Promise<ProposalResult> {
        return this.proposalManager.processWriteRequest(request);
    }

    /**
     * 添加自定义事件类型 → AI 任务映射
     */
    addTaskMapping(eventType: string, task: string): void {
        this.taskMappings.set(eventType, task);
    }

    // --- Prompt 和 Schema 配置 ---

    private getSystemPrompt(task: string): string {
        const prompts: Record<string, string> = {
            'memory.extract': '你是记忆提取助手。分析事件内容，提取结构化事实。输出 JSON 格式：{ "facts": [...], "patches": [...], "summaries": [...], "confidence": 0.0-1.0 }',
            'dice.narrate': '你是骰子叙事助手。根据骰子结果生成简短叙事摘要。输出 JSON 格式：{ "summaries": [{ "level": "message", "title": "...", "content": "...", "keywords": [...] }], "confidence": 0.0-1.0 }',
            'world.update': '你是世界状态更新助手。分析事件对世界状态的影响并生成补丁。输出 JSON 格式：{ "patches": [{ "op": "add|replace|remove", "path": "...", "value": ... }], "confidence": 0.0-1.0 }',
        };
        return prompts[task] ?? '请分析输入并输出结构化 JSON 结果。';
    }

    private getTaskSchema(task: string): object {
        // 统一的提议 Schema
        return {
            type: 'object',
            properties: {
                facts: { type: 'array' },
                patches: { type: 'array' },
                summaries: { type: 'array' },
                confidence: { type: 'number' },
            },
        };
    }
}
