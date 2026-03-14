import type {
    LLMProvider, LLMRequest, LLMResponse,
    RerankRequest, RerankResponse,
    ProviderConnectionResult, ProviderModelListResult,
} from './types';

/**
 * 独立自定义重排 Provider
 * 协议: POST {baseUrl}{rerankPath}
 * Authorization: Bearer <apiKey>
 * Body: { model, query, documents, top_n }
 */
export class CustomRerankProvider implements LLMProvider {
    id: string;
    kind: 'custom' = 'custom';
    capabilities = { chat: false, json: false, tools: false, embeddings: false, rerank: true };

    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private rerankPath: string;
    private customParams: Record<string, unknown>;

    constructor(config: {
        id: string;
        apiKey: string;
        baseUrl: string;
        model?: string;
        rerankPath?: string;
        customParams?: Record<string, unknown>;
    }) {
        this.id = config.id;
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl.replace(/\/+$/, '');
        this.model = config.model || '';
        this.rerankPath = this.normalizePath(config.rerankPath || '/rerank');
        this.customParams = config.customParams && typeof config.customParams === 'object' && !Array.isArray(config.customParams)
            ? { ...config.customParams }
            : {};
    }

    private normalizePath(path: string): string {
        const trimmed = String(path || '').trim() || '/rerank';
        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }

    private buildCandidateUrls(): string[] {
        const pathCandidates = [this.rerankPath];
        const baseUrlHasVersionSegment = /\/v\d+(?:\/|$)/i.test(this.baseUrl);

        if (this.rerankPath === '/rerank' && !baseUrlHasVersionSegment) {
            pathCandidates.push('/v1/rerank');
        }
        if (this.rerankPath === '/v1/rerank' && /\/v1$/i.test(this.baseUrl)) {
            pathCandidates.push('/rerank');
        }

        return Array.from(new Set(pathCandidates.map((path: string) => `${this.baseUrl}${path}`)));
    }

    private withCustomParams(payload: Record<string, unknown>): Record<string, unknown> {
        return {
            ...this.customParams,
            ...payload,
        };
    }

    private buildPayloadVariants(req: RerankRequest): Array<Record<string, unknown>> {
        const model = req.model || this.model || undefined;
        const variants: Array<Record<string, unknown>> = [
            this.withCustomParams({
                model,
                query: req.query,
                documents: req.docs,
                top_n: req.topK,
            }),
            this.withCustomParams({
                model,
                query: req.query,
                documents: req.docs,
                top_k: req.topK,
            }),
            this.withCustomParams({
                model,
                query: req.query,
                docs: req.docs,
                topK: req.topK,
            }),
            this.withCustomParams({
                model,
                input: req.query,
                documents: req.docs,
                top_n: req.topK,
            }),
        ];

        return Array.from(new Set(variants.map((item: Record<string, unknown>) => JSON.stringify(item))))
            .map((text: string) => JSON.parse(text) as Record<string, unknown>);
    }

    private normalizeResponseResults(data: any, req: RerankRequest): RerankResponse {
        const rawResults = Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.data)
                ? data.data
                : Array.isArray(data?.ranked_documents)
                    ? data.ranked_documents
                    : Array.isArray(data)
                        ? data
                        : [];

        const normalizedResults = rawResults.map((item: any, fallbackIndex: number) => {
            const rawIndex = Number(item?.index ?? item?.document_index ?? item?.id ?? fallbackIndex);
            const safeIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? rawIndex : fallbackIndex;
            const rawDoc = item?.document;
            const doc = typeof rawDoc === 'string'
                ? rawDoc
                : typeof rawDoc?.text === 'string'
                    ? rawDoc.text
                    : typeof rawDoc?.content === 'string'
                        ? rawDoc.content
                        : typeof item?.doc === 'string'
                            ? item.doc
                            : typeof item?.text === 'string'
                                ? item.text
                                : req.docs[safeIndex] ?? req.docs[fallbackIndex] ?? '';
            const score = Number(item?.relevance_score ?? item?.score ?? item?.similarity ?? item?.rank_score ?? 0);
            return {
                index: safeIndex,
                score: Number.isFinite(score) ? score : 0,
                doc: String(doc ?? ''),
            };
        });

        return {
            results: typeof req.topK === 'number' && req.topK > 0
                ? normalizedResults.slice(0, req.topK)
                : normalizedResults,
        };
    }

    private async executeCompatibleRerank(req: RerankRequest): Promise<RerankResponse> {
        const urls = this.buildCandidateUrls();
        const payloads = this.buildPayloadVariants(req);
        const errors: string[] = [];

        for (const url of urls) {
            for (const payload of payloads) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    errors.push(`${response.status} @ ${url} -> ${errText}`);
                    if (response.status === 401 || response.status === 403) {
                        throw new Error(`Rerank 请求失败: ${response.status} ${errText}`);
                    }
                    continue;
                }

                const data = await response.json().catch(() => ({}));
                const normalized = this.normalizeResponseResults(data, req);
                if (Array.isArray(normalized.results) && normalized.results.length > 0) {
                    return normalized;
                }
                errors.push(`empty-results @ ${url} -> ${JSON.stringify(data).slice(0, 300)}`);
            }
        }

        const detail = errors.slice(0, 4).join(' | ');
        throw new Error(`Rerank 请求失败：未匹配到兼容接口或返回格式异常。请检查 Rerank 路径与服务协议。${detail ? ` 详情：${detail}` : ''}`);
    }

    async request(_req: LLMRequest): Promise<LLMResponse> {
        throw new Error('CustomRerankProvider 不支持 chat 请求');
    }

    async rerank(req: RerankRequest): Promise<RerankResponse> {
        return this.executeCompatibleRerank(req);
    }

    async testConnection(): Promise<ProviderConnectionResult> {
        const start = Date.now();
        try {
            await this.executeCompatibleRerank({
                model: this.model,
                query: 'test',
                docs: ['hello', 'world'],
                topK: 1,
            });
            const latencyMs = Date.now() - start;

            return { ok: true, message: '重排服务连接成功', model: this.model, latencyMs };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            const authMatched = /401|403|AUTH/i.test(msg);
            return {
                ok: false,
                message: authMatched ? '连接失败（鉴权异常）' : `连接失败: ${msg}`,
                errorCode: authMatched ? 'AUTH_ERROR' : 'NETWORK_ERROR',
                detail: msg,
                latencyMs: Date.now() - start,
            };
        }
    }

    async listModels(): Promise<ProviderModelListResult> {
        return { ok: true, models: [], message: '重排资源不支持获取模型列表' };
    }
}
