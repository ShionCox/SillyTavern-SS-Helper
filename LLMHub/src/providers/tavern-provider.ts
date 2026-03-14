import type {
    LLMProvider, LLMRequest, LLMResponse,
    ProviderConnectionResult, ProviderModelListResult,
} from './types';
import {
    runTavernQuietPrompt,
    testTavernLlmConnection,
    getTavernCurrentModel,
    getTavernLlmAvailability,
} from '../../../SDK/tavern';

/**
 * Tavern Provider —— 直连酒馆主 LLM
 * 通过 SDK/tavern/llm 桥接层，将请求委托给酒馆的静默生成 API。
 */
export class TavernProvider implements LLMProvider {
    id: string;
    kind: 'tavern' = 'tavern';
    capabilities = { chat: true, json: true, tools: false, embeddings: false };

    constructor(config: { id: string }) {
        this.id = config.id;
    }

    async request(req: LLMRequest): Promise<LLMResponse> {
        // 将标准消息格式拼为单一 prompt
        const prompt = req.messages
            .map(m => (m.role === 'system' ? `[System] ${m.content}` : m.content))
            .join('\n\n');

        const result = await runTavernQuietPrompt(prompt);

        if (!result.ok) {
            throw new Error(result.message ?? '酒馆静默生成失败');
        }

        return {
            content: result.content,
            finishReason: 'stop',
        };
    }

    async testConnection(): Promise<ProviderConnectionResult> {
        const result = await testTavernLlmConnection();
        return {
            ok: result.ok,
            message: result.message,
            errorCode: result.errorCode,
            detail: result.detail,
            model: result.model,
            latencyMs: result.latencyMs,
        };
    }

    async listModels(): Promise<ProviderModelListResult> {
        const avail = getTavernLlmAvailability();
        const model = getTavernCurrentModel();

        if (!avail.available) {
            return { ok: false, models: [], message: avail.message };
        }

        if (!model) {
            return { ok: true, models: [], message: '酒馆当前未选择模型' };
        }

        return {
            ok: true,
            models: [{ id: model, label: `当前模型: ${model}` }],
            message: '读取成功',
        };
    }
}
