import type {
    LLMProvider, LLMRequest, LLMResponse,
    ProviderConnectionResult, ProviderModelListResult,
} from './types';
import { inferReasonCode } from '../schema/error-codes';
import {
    runTavernRawMessages,
    testTavernLlmConnection,
    getTavernCurrentModel,
    getTavernLlmAvailability,
} from '../../../SDK/tavern';

/**
 * 功能：构建 Tavern Provider 失败时抛出的错误对象，便于上层记录完整调试信息。
 * @param message 面向上层的错误消息。
 * @param reasonCode 归一化后的原因码。
 * @param providerRequest 发给日志系统的请求快照。
 * @param providerResponse 发给日志系统的响应快照。
 * @returns 带扩展字段的错误对象。
 */
function buildTavernProviderError(
    message: string,
    reasonCode: string,
    providerRequest: Record<string, unknown>,
    providerResponse: Record<string, unknown>,
): Error & {
    reasonCode: string;
    providerRequest: Record<string, unknown>;
    providerResponse: Record<string, unknown>;
    detail?: string;
} {
    const error = new Error(message) as Error & {
        reasonCode: string;
        providerRequest: Record<string, unknown>;
        providerResponse: Record<string, unknown>;
        detail?: string;
    };
    error.reasonCode = reasonCode;
    error.providerRequest = providerRequest;
    error.providerResponse = providerResponse;
    error.detail = String(providerResponse.detail || providerResponse.message || '').trim() || undefined;
    return error;
}

/**
 * 功能：提供基于酒馆纯净后端直连的 Provider。
 * @param config Provider 配置。
 * @returns TavernProvider 实例。
 */
export class TavernProvider implements LLMProvider {
    id: string;
    kind: 'tavern' = 'tavern';
    capabilities = { chat: true, json: true, tools: false, embeddings: false };

    /**
     * 功能：初始化 Tavern Provider。
     * @param config Provider 配置。
     * @returns 无返回值。
     */
    constructor(config: { id: string }) {
        this.id = config.id;
    }

    /**
     * 功能：通过酒馆纯净消息接口发送标准请求，并透传兼容降级轨迹。
     * @param req 标准化后的 LLM 请求。
     * @returns LLMHub 统一响应格式。
     */
    async request(req: LLMRequest): Promise<LLMResponse> {
        const result = await runTavernRawMessages(req.messages, {
            temperature: req.temperature,
            maxTokens: req.maxTokens,
            jsonMode: req.jsonMode,
            jsonSchema: req.schema,
        });

        const providerRequest: Record<string, unknown> = {
            providerKind: this.kind,
            resourceId: this.id,
            requestFormat: 'tavern_raw_messages',
            originalRequestIntent: {
                jsonMode: Boolean(req.jsonMode),
                hasSchema: Boolean(req.schema),
                preferredResponseFormat: req.preferredResponseFormat || null,
            },
            payload: result.finalRequestBody ?? null,
            compatTrace: result.compatTrace ?? [],
            finalAttemptStage: result.finalAttemptStage ?? 'standard',
        };

        if (!result.ok) {
            const providerResponse: Record<string, unknown> = {
                ok: false,
                message: result.message || '酒馆纯净直连请求失败',
                errorCode: result.errorCode || null,
                detail: result.detail || null,
                compatTrace: result.compatTrace ?? [],
                finalAttemptStage: result.finalAttemptStage ?? 'standard',
                finalRequestBody: result.finalRequestBody ?? null,
            };
            const reasonCode = inferReasonCode(
                String(result.message || result.detail || result.errorCode || 'provider_error'),
            );
            throw buildTavernProviderError(
                result.message || '酒馆纯净直连请求失败',
                reasonCode,
                providerRequest,
                providerResponse,
            );
        }

        return {
            content: result.content,
            finishReason: 'stop',
            debugRequest: providerRequest,
        };
    }

    /**
     * 功能：执行酒馆纯净连接测试。
     * @returns 连接检测结果。
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
     * @returns 模型列表结果。
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
