/**
 * 功能：混合检索服务层。
 * 说明：负责 vector_only / hybrid 模式下的完整查询链路，包括：
 *       - 向量编码
 *       - 向量搜索
 *       - 策略路由（fast / deep）
 *       - 重排序（仅向量链启用时）
 *       - 融合 lexical + vector 结果（hybrid 模式）
 */

import type { RetrievalResultItem, RetrievalCandidate, RetrievalContextRoute } from '../memory-retrieval/types';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import type { VectorStrategyDecision, VectorStrategyInput } from '../types/vector-strategy';
import type { VectorSearchHit } from '../types/vector-search';
import type { QueryContextBundle } from './query-context-builder';
import { EmbeddingService } from './embedding-service';
import { VectorStoreAdapterService } from './vector-store-adapter';
import { VectorStrategyRouter, type VectorStrategyRouterConfig } from './vector-strategy-router';
import { VectorRerankService } from './vector-rerank-service';
import { logger } from '../runtime/runtime-services';

// ─── 类型 ──────────────────────────────

export interface HybridRetrievalInput {
    /** 检索模式 */
    retrievalMode: RetrievalMode;
    /** 查询文本 */
    query: string;
    /** 聊天键 */
    chatKey: string;
    /** 所有候选记录 */
    candidates: RetrievalCandidate[];
    /** 词法检索结果 */
    lexicalResults: RetrievalResultItem[];
    /** 查询上下文包 */
    queryContext?: QueryContextBundle;
    /** 语境路由结果 */
    contextRoute?: RetrievalContextRoute | null;
    /** 最终 topK（覆盖策略路由） */
    overrideFinalTopK?: number;
}

export interface HybridRetrievalOutput {
    /** 最终结果 */
    items: RetrievalResultItem[];
    /** 使用的策略决策 */
    strategyDecision: VectorStrategyDecision | null;
    /** 向量搜索原始命中 */
    vectorHits: VectorSearchHit[];
    /** 是否执行了 rerank */
    rerankUsed: boolean;
    /** rerank 原因码 */
    rerankReasonCodes: string[];
    /** 向量 provider 是否可用 */
    vectorAvailable: boolean;
    /** 向量不可用原因 */
    vectorUnavailableReason: string | null;
}

// ─── 服务 ──────────────────────────────

/**
 * 功能：混合检索服务。
 */
export class HybridRetrievalService {
    private readonly embeddingService: EmbeddingService;
    private readonly vectorStore: VectorStoreAdapterService;
    private readonly strategyRouter: VectorStrategyRouter;
    private readonly rerankService: VectorRerankService;

    constructor(options?: {
        embeddingService?: EmbeddingService;
        vectorStore?: VectorStoreAdapterService;
        strategyRouterConfig?: VectorStrategyRouterConfig;
        rerankService?: VectorRerankService;
    }) {
        this.embeddingService = options?.embeddingService ?? new EmbeddingService();
        this.vectorStore = options?.vectorStore ?? new VectorStoreAdapterService();
        this.strategyRouter = new VectorStrategyRouter(options?.strategyRouterConfig);
        this.rerankService = options?.rerankService ?? new VectorRerankService();
    }

    /**
     * 功能：获取 EmbeddingService 实例。
     */
    getEmbeddingService(): EmbeddingService {
        return this.embeddingService;
    }

    /**
     * 功能：获取 VectorStoreAdapterService 实例。
     */
    getVectorStore(): VectorStoreAdapterService {
        return this.vectorStore;
    }

    /**
     * 功能：检查向量能力是否可用。
     */
    isVectorAvailable(): boolean {
        return this.embeddingService.isAvailable() && this.vectorStore.isAvailable();
    }

    /**
     * 功能：获取向量不可用原因。
     */
    getVectorUnavailableReason(): string | null {
        if (!this.embeddingService.isAvailable()) {
            return this.embeddingService.getUnavailableReason();
        }
        if (!this.vectorStore.isAvailable()) {
            return '向量存储不可用';
        }
        return null;
    }

    /**
     * 功能：执行向量增强检索。
     * @param input 混合检索输入。
     * @returns 混合检索输出。
     */
    async search(input: HybridRetrievalInput): Promise<HybridRetrievalOutput> {
        const { retrievalMode, query, chatKey } = input;

        // lexical_only 直接返回词法结果
        if (retrievalMode === 'lexical_only') {
            return {
                items: input.lexicalResults,
                strategyDecision: null,
                vectorHits: [],
                rerankUsed: false,
                rerankReasonCodes: ['lexical_only'],
                vectorAvailable: this.isVectorAvailable(),
                vectorUnavailableReason: this.getVectorUnavailableReason(),
            };
        }

        const vectorAvailable = this.isVectorAvailable();
        const vectorUnavailableReason = this.getVectorUnavailableReason();

        // 向量不可用
        if (!vectorAvailable) {
            if (retrievalMode === 'vector_only') {
                logger.warn(`[HybridRetrieval] vector_only 模式下向量不可用: ${vectorUnavailableReason}`);
                return {
                    items: [],
                    strategyDecision: null,
                    vectorHits: [],
                    rerankUsed: false,
                    rerankReasonCodes: ['vector_unavailable'],
                    vectorAvailable: false,
                    vectorUnavailableReason,
                };
            }
            // hybrid 模式下回退到词法
            logger.info(`[HybridRetrieval] hybrid 模式下向量不可用，使用词法结果`);
            return {
                items: input.lexicalResults,
                strategyDecision: null,
                vectorHits: [],
                rerankUsed: false,
                rerankReasonCodes: ['vector_unavailable_fallback_lexical'],
                vectorAvailable: false,
                vectorUnavailableReason,
            };
        }

        // — 策略路由 —
        const contextRoute = input.contextRoute;
        const strategyInput: VectorStrategyInput = {
            query,
            mergedContextText: input.queryContext?.mergedContextText,
            retrievalMode: retrievalMode as 'vector_only' | 'hybrid',
            actorAnchorKeys: contextRoute?.entityAnchors?.actorKeys,
            relationAnchorKeys: contextRoute?.entityAnchors?.relationKeys,
            worldAnchorKeys: contextRoute?.entityAnchors?.worldKeys,
            expectedFacets: contextRoute?.facets,
            routeConfidence: contextRoute?.confidence,
        };

        const decision = this.strategyRouter.route(strategyInput);

        // — 向量编码 —
        const textToEncode = input.queryContext?.mergedContextText || query;
        const encodeResult = await this.embeddingService.encodeOne(textToEncode);

        if (!encodeResult.ok) {
            logger.warn(`[HybridRetrieval] 向量编码失败: ${encodeResult.error}`);
            if (retrievalMode === 'vector_only') {
                return {
                    items: [],
                    strategyDecision: decision,
                    vectorHits: [],
                    rerankUsed: false,
                    rerankReasonCodes: ['encode_failed'],
                    vectorAvailable: true,
                    vectorUnavailableReason: null,
                };
            }
            return {
                items: input.lexicalResults,
                strategyDecision: decision,
                vectorHits: [],
                rerankUsed: false,
                rerankReasonCodes: ['encode_failed_fallback_lexical'],
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        // — 向量搜索 —
        await this.vectorStore.ensureLoaded(chatKey);
        const vectorHits = await this.vectorStore.search(chatKey, {
            vector: encodeResult.vector,
            topK: decision.candidateWindow,
            chatKey,
            minScore: 0.1,
        });

        // — 构建向量检索结果项 —
        const candidateMap = new Map<string, RetrievalCandidate>();
        for (const c of input.candidates) {
            candidateMap.set(c.candidateId, c);
            candidateMap.set(c.entryId, c);
        }

        const vectorResults: RetrievalResultItem[] = [];
        for (const hit of vectorHits) {
            const candidate = candidateMap.get(hit.sourceId);
            if (!candidate) {
                continue;
            }
            vectorResults.push({
                candidate,
                score: hit.score,
                breakdown: {
                    bm25: 0,
                    ngram: 0,
                    editDistance: 0,
                    memoryWeight: candidate.memoryPercent / 100,
                    recencyWeight: 0,
                    graphBoost: 0,
                },
            });
        }

        // — 模式分支 —
        if (retrievalMode === 'vector_only') {
            return this.handleVectorOnly(vectorResults, decision, vectorHits, query, input);
        }

        // hybrid: 融合
        return this.handleHybrid(input.lexicalResults, vectorResults, decision, vectorHits, query, input);
    }

    /**
     * 功能：处理 vector_only 模式。
     */
    private handleVectorOnly(
        vectorResults: RetrievalResultItem[],
        decision: VectorStrategyDecision,
        vectorHits: VectorSearchHit[],
        query: string,
        input: HybridRetrievalInput,
    ): HybridRetrievalOutput {
        const finalTopK = input.overrideFinalTopK ?? decision.finalTopK;

        if (!decision.rerankEnabled) {
            return {
                items: vectorResults.slice(0, finalTopK),
                strategyDecision: decision,
                vectorHits,
                rerankUsed: false,
                rerankReasonCodes: ['fast_vector_no_rerank'],
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        const rerankResult = this.rerankService.rerank({
            query,
            queryContextText: input.queryContext?.mergedContextText || '',
            mode: 'vector_only',
            candidates: vectorResults,
            finalTopK,
        });

        return {
            items: rerankResult.items,
            strategyDecision: decision,
            vectorHits,
            rerankUsed: rerankResult.used,
            rerankReasonCodes: rerankResult.reasonCodes,
            vectorAvailable: true,
            vectorUnavailableReason: null,
        };
    }

    /**
     * 功能：处理 hybrid 模式。
     */
    private handleHybrid(
        lexicalResults: RetrievalResultItem[],
        vectorResults: RetrievalResultItem[],
        decision: VectorStrategyDecision,
        vectorHits: VectorSearchHit[],
        query: string,
        input: HybridRetrievalInput,
    ): HybridRetrievalOutput {
        const finalTopK = input.overrideFinalTopK ?? decision.finalTopK;

        // 融合 lexical + vector
        const merged = this.mergeResults(lexicalResults, vectorResults);

        if (!decision.rerankEnabled) {
            // fast 路径：直接取 topK
            merged.sort((a, b) => b.score - a.score);
            return {
                items: merged.slice(0, finalTopK),
                strategyDecision: decision,
                vectorHits,
                rerankUsed: false,
                rerankReasonCodes: ['fast_hybrid_no_rerank'],
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        // deep 路径：rerank
        const rerankResult = this.rerankService.rerank({
            query,
            queryContextText: input.queryContext?.mergedContextText || '',
            mode: 'hybrid',
            candidates: merged,
            finalTopK,
        });

        return {
            items: rerankResult.items,
            strategyDecision: decision,
            vectorHits,
            rerankUsed: rerankResult.used,
            rerankReasonCodes: rerankResult.reasonCodes,
            vectorAvailable: true,
            vectorUnavailableReason: null,
        };
    }

    /**
     * 功能：融合 lexical 和 vector 结果，按 candidateId 去重。
     */
    private mergeResults(
        lexical: RetrievalResultItem[],
        vector: RetrievalResultItem[],
    ): RetrievalResultItem[] {
        const seen = new Map<string, RetrievalResultItem>();

        // 先放 lexical
        for (const item of lexical) {
            const key = item.candidate.candidateId || item.candidate.entryId;
            seen.set(key, item);
        }

        // 再放 vector，如果已存在则取较高分
        for (const item of vector) {
            const key = item.candidate.candidateId || item.candidate.entryId;
            const existing = seen.get(key);
            if (!existing) {
                seen.set(key, item);
            } else if (item.score > existing.score) {
                // 保留较高分并融合 breakdown
                seen.set(key, {
                    ...item,
                    score: Math.max(item.score, existing.score),
                    breakdown: {
                        ...existing.breakdown,
                        ...item.breakdown,
                        bm25: Math.max(existing.breakdown.bm25, item.breakdown.bm25),
                    },
                });
            }
        }

        return Array.from(seen.values());
    }
}
