import type {
    LLMProvider, LLMRequest, LLMResponse,
    ProviderConnectionResult, ProviderModelListResult,
} from './types';
import {
    runTavernRawMessages,
    testTavernLlmConnection,
    getTavernCurrentModel,
    getTavernLlmAvailability,
} from '../../../SDK/tavern';

/**
 * 功能：提供基于酒馆纯净后端直连的 Provider。
 * 参数：
 *   config ({ id: string })：Provider 配置。
 * 返回：
 *   TavernProvider：可供 LLMHub 注册的 Provider 实例。
 */
export class TavernProvider implements LLMProvider {
    id: string;
    kind: 'tavern' = 'tavern';
    capabilities = { chat: true, json: true, tools: false, embeddings: false };

    /**
     * 功能：初始化 Tavern Provider。
     * 参数：
     *   config ({ id: string })：Provider 配置。
     * 返回：
     *   void：无返回值。
     */
    constructor(config: { id: string }) {
        this.id = config.id;
    }

    /**
     * 功能：把标准消息数组通过酒馆纯净通道发送，并透传基础采样参数。
     * 参数：
     *   req (LLMRequest)：标准化后的 LLM 请求。
     * 返回：
     *   Promise<LLMResponse>：LLM 响应内容。
     */
    async request(req: LLMRequest): Promise<LLMResponse> {
        const result = await runTavernRawMessages(req.messages, {
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            jsonMode: req.jsonMode,
            jsonSchema: req.schema,
        });

        if (!result.ok) {
            throw new Error(result.message ?? '酒馆纯净直连请求失败');
        }

        return {
            content: result.content,
            finishReason: 'stop',
        };
    }

    /**
     * 功能：执行酒馆纯净连接测试。
     * 返回：
     *   Promise<ProviderConnectionResult>：连接检测结果。
     */
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

    /**
     * 功能：列出当前酒馆已选择的模型。
     * 返回：
     *   Promise<ProviderModelListResult>：模型列表结果。
     */
    async listModels(): Promise<ProviderModelListResult> {
        const availability = getTavernLlmAvailability();
        const model = getTavernCurrentModel();

        if (!availability.available) {
            return { ok: false, models: [], message: availability.message };
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
