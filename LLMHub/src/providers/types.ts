/**
 * LLM Provider 类型定义
 * 将 Provider 抽象与具体实现解耦
 */

export interface LLMProviderCapabilities {
    chat: boolean;
    json: boolean;
    tools: boolean;
    embeddings: boolean;
    rerank?: boolean;
}

export interface LLMRequest {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    schema?: object;
}

export interface LLMResponse {
    content: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    finishReason?: string;
}

export interface EmbedRequest {
    texts: string[];
    model?: string;
}

export interface EmbedResponse {
    embeddings: number[][];
}

export interface RerankRequest {
    query: string;
    docs: string[];
    topK?: number;
}

export interface RerankResponse {
    results: Array<{ index: number; score: number; doc: string }>;
}

/**
 * Provider 抽象接口
 */
export interface LLMProvider {
    id: string;
    kind: 'openai' | 'claude' | 'gemini' | 'local' | 'custom';
    capabilities: LLMProviderCapabilities;
    request(req: LLMRequest): Promise<LLMResponse>;
    embed?(req: EmbedRequest): Promise<EmbedResponse>;
    rerank?(req: RerankRequest): Promise<RerankResponse>;
}
