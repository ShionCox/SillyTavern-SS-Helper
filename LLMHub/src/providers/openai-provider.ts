import type {
    LLMProvider, LLMRequest, LLMResponse, EmbedRequest, EmbedResponse,
    ProviderConnectionResult, ProviderModelListResult,
} from './types';

/**
 * OpenAI 兼容 Provider 实现
 * 支持 OpenAI API 以及 OpenAI 兼容的中转服务（如 One API、LocalAI 等）
 */
export class OpenAIProvider implements LLMProvider {
    id: string;
    kind: 'openai' = 'openai';
    capabilities = { chat: true, json: true, tools: true, embeddings: true };

    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config: {
        id: string;
        apiKey: string;
        baseUrl?: string;
        model?: string;
    }) {
        this.id = config.id;
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.model = config.model || 'gpt-4o-mini';
    }

    async request(req: LLMRequest): Promise<LLMResponse> {
        const body: Record<string, any> = {
            model: this.model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 2048,
        };

        if (req.jsonMode) {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API 请求失败: ${response.status} ${errText}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        return {
            content: choice?.message?.content || '',
            usage: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
            } : undefined,
            finishReason: choice?.finish_reason,
        };
    }

    async embed(req: EmbedRequest): Promise<EmbedResponse> {
        const response = await fetch(`${this.baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: req.model || 'text-embedding-ada-002',
                input: req.texts,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Embedding 请求失败: ${response.status} ${errText}`);
        }

        const data = await response.json();
        return {
            embeddings: data.data.map((d: any) => d.embedding),
        };
    }

    async testConnection(): Promise<ProviderConnectionResult> {
        const start = Date.now();
        try {
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1,
                }),
            });
            const latencyMs = Date.now() - start;

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                const code = res.status === 401 || res.status === 403
                    ? 'AUTH_ERROR'
                    : res.status === 404
                        ? 'ENDPOINT_NOT_FOUND'
                        : `HTTP_${res.status}`;
                return { ok: false, message: `连接失败 (${res.status})`, errorCode: code, detail: text, latencyMs };
            }

            return { ok: true, message: '连接成功', model: this.model, latencyMs };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                message: `网络错误: ${msg}`,
                errorCode: 'NETWORK_ERROR',
                detail: msg,
                latencyMs: Date.now() - start,
            };
        }
    }

    async listModels(): Promise<ProviderModelListResult> {
        try {
            const res = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                return { ok: false, models: [], message: `获取模型列表失败 (${res.status})`, detail: text };
            }

            const json = await res.json();
            const list = Array.isArray(json?.data) ? json.data : [];
            const models = list
                .map((m: any) => ({ id: String(m.id ?? ''), label: m.id }))
                .filter((m: { id: string }) => m.id)
                .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));

            return { ok: true, models, message: `共 ${models.length} 个模型` };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return { ok: false, models: [], message: `网络错误: ${msg}`, errorCode: 'NETWORK_ERROR', detail: msg };
        }
    }
}
