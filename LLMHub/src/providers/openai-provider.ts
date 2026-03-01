import type { LLMProvider, LLMRequest, LLMResponse, EmbedRequest, EmbedResponse } from './types';

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
}
