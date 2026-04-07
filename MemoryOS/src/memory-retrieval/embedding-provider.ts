import type { RetrievalCandidate, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';
import type { RetrievalMode } from './retrieval-mode';
import type { EmbeddingService } from '../services/embedding-service';
import type { VectorStoreAdapterService } from '../services/vector-store-adapter';

/**
 * 功能：Embedding 检索 provider。
 * 说明：第二阶段真正接入向量后端，通过 EmbeddingService 编码查询，
 *       通过 VectorStoreAdapter 搜索向量索引，返回真实命中结果。
 */
export class EmbeddingRetrievalProvider implements RetrievalProvider {
    public readonly providerId: string = 'embedding_vector';
    private embeddingService: EmbeddingService | null = null;
    private vectorStore: VectorStoreAdapterService | null = null;

    /**
     * 功能：注入向量服务依赖。
     * @param embeddingService Embedding 编码服务。
     * @param vectorStore 向量存储适配器。
     */
    public setServices(embeddingService: EmbeddingService, vectorStore: VectorStoreAdapterService): void {
        this.embeddingService = embeddingService;
        this.vectorStore = vectorStore;
    }

    /**
     * 功能：检查向量 provider 是否当前可用。
     * @returns 当前是否可用。
     */
    public isAvailable(): boolean {
        if (!this.embeddingService || !this.vectorStore) {
            return false;
        }
        return this.embeddingService.isAvailable() && this.vectorStore.isAvailable();
    }

    /**
     * 功能：获取不可用原因。
     * @returns 不可用原因字符串，可用时返回 null。
     */
    public getUnavailableReason(): string | null {
        if (!this.embeddingService || !this.vectorStore) {
            return '向量服务尚未初始化';
        }
        if (!this.embeddingService.isAvailable()) {
            return this.embeddingService.getUnavailableReason();
        }
        if (!this.vectorStore.isAvailable()) {
            return '向量存储不可用';
        }
        return null;
    }

    /**
     * 功能：检查是否支持指定检索模式。
     * @param mode 检索模式。
     * @returns 是否支持。
     */
    public supportsMode(mode: RetrievalMode): boolean {
        return mode === 'vector_only' || mode === 'hybrid';
    }

    /**
     * 功能：执行 embedding 检索。
     * @param query 检索请求。
     * @param candidates 候选记录。
     * @returns 向量命中结果。
     */
    public async search(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]> {
        if (!this.embeddingService || !this.vectorStore) {
            return [];
        }
        if (!this.isAvailable()) {
            return [];
        }

        const queryText = String(query.query ?? '').trim();
        if (!queryText) {
            return [];
        }

        // 编码查询向量
        const encodeResult = await this.embeddingService.encodeOne(queryText);
        if (!encodeResult.ok) {
            return [];
        }

        // 搜索向量索引
        const chatKey = String(query.chatKey ?? '').trim();
        const topK = Math.max(5, query.budget?.maxCandidates ?? 30);
        const hits = await this.vectorStore.search(chatKey, {
            vector: encodeResult.vector,
            topK,
            chatKey: chatKey || undefined,
            minScore: 0.1,
        });

        if (hits.length === 0) {
            return [];
        }

        // 映射到候选
        const candidateMap = new Map<string, RetrievalCandidate>();
        for (const c of candidates) {
            candidateMap.set(c.candidateId, c);
            candidateMap.set(c.entryId, c);
        }

        const results: RetrievalResultItem[] = [];
        for (const hit of hits) {
            const candidate = candidateMap.get(hit.sourceId);
            if (!candidate) {
                continue;
            }
            results.push({
                candidate,
                score: hit.score,
                breakdown: {
                    bm25: 0,
                    ngram: 0,
                    editDistance: 0,
                    memoryWeight: candidate.retention?.retrievalWeight ?? (candidate.memoryPercent / 100),
                    recencyWeight: 0,
                    graphBoost: 0,
                },
            });
        }

        return results;
    }
}
