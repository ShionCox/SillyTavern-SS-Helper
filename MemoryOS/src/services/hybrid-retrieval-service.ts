/**
 * 功能：混合检索服务层。
 * 说明：负责 vector_only / hybrid 模式下的完整查询链路，包括：
 *       - 向量编码
 *       - 向量搜索
 *       - 策略路由
 *       - 规则重排 / LLMHub 重排
 *       - 词法与向量融合
 */

import type { RetrievalResultItem, RetrievalCandidate, RetrievalContextRoute } from '../memory-retrieval/types';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import type { MemoryRetrievalProgress } from '../memory-retrieval/retrieval-input';
import type { VectorStrategyDecision } from '../types/vector-strategy';
import type { VectorSearchHit } from '../types/vector-search';
import type { QueryContextBundle } from './query-context-builder';
import type { MemoryOSSettings } from '../settings/store';
import { EmbeddingService } from './embedding-service';
import { VectorStoreAdapterService } from './vector-store-adapter';
import { VectorStrategyRouter, type VectorStrategyRouterConfig } from './vector-strategy-router';
import { VectorRerankService } from './vector-rerank-service';
import { LLMHubRerankService } from './llmhub-rerank-service';
import { logger } from '../runtime/runtime-services';
import { readMemoryOSSettings } from '../settings/store';

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
    /** 最终 topK */
    overrideFinalTopK?: number;
    /** 进度回调 */
    onProgress?: (progress: MemoryRetrievalProgress) => void;
}

export interface HybridRetrievalOutput {
    /** 最终结果 */
    items: RetrievalResultItem[];
    /** 使用的策略决策 */
    strategyDecision: VectorStrategyDecision | null;
    /** 最终链路 provider 标识 */
    finalProviderId: string;
    /** 向量搜索原始命中 */
    vectorHits: VectorSearchHit[];
    /** 融合后、重排前候选 */
    preRerankItems: RetrievalResultItem[];
    /** 重排后候选 */
    postRerankItems: RetrievalResultItem[];
    /** 是否执行了 lexical/vector 融合 */
    mergeUsed: boolean;
    /** 是否执行了 rerank */
    rerankUsed: boolean;
    /** rerank 原因码 */
    rerankReasonCodes: string[];
    /** rerank 来源 */
    rerankSource: 'none' | 'rule' | 'llmhub';
    /** 向量 provider 是否可用 */
    vectorAvailable: boolean;
    /** 向量不可用原因 */
    vectorUnavailableReason: string | null;
}

interface InternalRerankResult {
    /** 结果列表 */
    items: RetrievalResultItem[];
    /** 是否执行 */
    used: boolean;
    /** 原因码 */
    reasonCodes: string[];
    /** 来源 */
    source: 'none' | 'rule' | 'llmhub';
}

/**
 * 功能：混合检索服务。
 */
export class HybridRetrievalService {
    private readonly embeddingService: EmbeddingService;
    private readonly vectorStore: VectorStoreAdapterService;
    private readonly strategyRouter: VectorStrategyRouter;
    private readonly rerankService: VectorRerankService;
    private readonly llmhubRerankService: LLMHubRerankService;

    constructor(options?: {
        embeddingService?: EmbeddingService;
        vectorStore?: VectorStoreAdapterService;
        strategyRouterConfig?: VectorStrategyRouterConfig;
        rerankService?: VectorRerankService;
        llmhubRerankService?: LLMHubRerankService;
    }) {
        this.embeddingService = options?.embeddingService ?? new EmbeddingService();
        this.vectorStore = options?.vectorStore ?? new VectorStoreAdapterService();
        this.strategyRouter = new VectorStrategyRouter(options?.strategyRouterConfig);
        this.rerankService = options?.rerankService ?? new VectorRerankService();
        this.llmhubRerankService = options?.llmhubRerankService ?? new LLMHubRerankService();
    }

    /**
     * 功能：获取 EmbeddingService 实例。
     * @returns EmbeddingService。
     */
    getEmbeddingService(): EmbeddingService {
        return this.embeddingService;
    }

    /**
     * 功能：获取 VectorStoreAdapterService 实例。
     * @returns VectorStoreAdapterService。
     */
    getVectorStore(): VectorStoreAdapterService {
        return this.vectorStore;
    }

    /**
     * 功能：检查向量能力是否可用。
     * @returns 是否可用。
     */
    isVectorAvailable(): boolean {
        return this.embeddingService.isAvailable() && this.vectorStore.isAvailable();
    }

    /**
     * 功能：获取向量不可用原因。
     * @returns 不可用原因。
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
        const settings = readMemoryOSSettings();
        const { retrievalMode, query, chatKey } = input;

        if (retrievalMode === 'lexical_only') {
            this.emitProgress(input.onProgress, 'lexical_only', '仅词法模式', '当前模式为仅词法检索，直接使用词法主链结果。', 0.72);
            return {
                items: input.lexicalResults,
                strategyDecision: null,
                finalProviderId: 'lexical_bm25',
                vectorHits: [],
                preRerankItems: input.lexicalResults,
                postRerankItems: input.lexicalResults,
                mergeUsed: false,
                rerankUsed: false,
                rerankReasonCodes: ['lexical_only'],
                rerankSource: 'none',
                vectorAvailable: this.isVectorAvailable(),
                vectorUnavailableReason: this.getVectorUnavailableReason(),
            };
        }

        const vectorAvailable = this.isVectorAvailable();
        const vectorUnavailableReason = this.getVectorUnavailableReason();
        const decision = this.buildDecision(input, settings);
        this.emitProgress(input.onProgress, 'vector_check', '检查向量能力', '正在检查编码服务与向量存储状态。', 0.74);

        if (!vectorAvailable) {
            if (retrievalMode === 'vector_only') {
                logger.warn(`[HybridRetrieval] vector_only 模式下向量不可用: ${vectorUnavailableReason}`);
                return {
                    items: [],
                    strategyDecision: decision,
                    finalProviderId: 'vector_only_unavailable',
                    vectorHits: [],
                    preRerankItems: [],
                    postRerankItems: [],
                    mergeUsed: false,
                    rerankUsed: false,
                    rerankReasonCodes: ['vector_unavailable'],
                    rerankSource: 'none',
                    vectorAvailable: false,
                    vectorUnavailableReason,
                };
            }
            logger.info('[HybridRetrieval] hybrid 模式下向量不可用，使用词法结果');
            return {
                items: input.lexicalResults,
                strategyDecision: decision,
                finalProviderId: 'hybrid_vector_unavailable_fallback_lexical',
                vectorHits: [],
                preRerankItems: input.lexicalResults,
                postRerankItems: input.lexicalResults,
                mergeUsed: false,
                rerankUsed: false,
                rerankReasonCodes: ['vector_unavailable_fallback_lexical'],
                rerankSource: 'none',
                vectorAvailable: false,
                vectorUnavailableReason,
            };
        }

        const textToEncode = input.queryContext?.mergedContextText || query;
        this.emitProgress(input.onProgress, 'vector_encode', '向量编码', '正在将查询文本编码为向量。', 0.8);
        const encodeResult = await this.embeddingService.encodeOne(textToEncode);

        if (!encodeResult.ok) {
            logger.warn(`[HybridRetrieval] 向量编码失败: ${encodeResult.error}`);
            if (retrievalMode === 'vector_only') {
                return {
                    items: [],
                    strategyDecision: decision,
                    finalProviderId: 'vector_only_encode_failed',
                    vectorHits: [],
                    preRerankItems: [],
                    postRerankItems: [],
                    mergeUsed: false,
                    rerankUsed: false,
                    rerankReasonCodes: ['encode_failed'],
                    rerankSource: 'none',
                    vectorAvailable: true,
                    vectorUnavailableReason: null,
                };
            }
            return {
                items: input.lexicalResults,
                strategyDecision: decision,
                finalProviderId: 'hybrid_encode_failed_fallback_lexical',
                vectorHits: [],
                preRerankItems: input.lexicalResults,
                postRerankItems: input.lexicalResults,
                mergeUsed: false,
                rerankUsed: false,
                rerankReasonCodes: ['encode_failed_fallback_lexical'],
                rerankSource: 'none',
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        this.emitProgress(input.onProgress, 'vector_search', '向量搜索', '正在读取向量索引并检索相似候选。', 0.86);
        await this.vectorStore.ensureLoaded(chatKey);
        const vectorHits = await this.vectorStore.search(chatKey, {
            vector: encodeResult.vector,
            topK: decision.candidateWindow,
            chatKey,
            minScore: 0.1,
        });

        const vectorResults = this.mapVectorHits(vectorHits, input.candidates);

        if (retrievalMode === 'vector_only') {
            this.emitProgress(input.onProgress, 'vector_finalize', '整理向量结果', '正在整理仅向量模式下的候选结果。', 0.9);
            return this.handleVectorOnly(vectorResults, decision, vectorHits, query, input, settings);
        }
        this.emitProgress(input.onProgress, 'hybrid_merge', '融合结果', '正在合并词法结果与向量结果。', 0.9);
        return this.handleHybrid(input.lexicalResults, vectorResults, decision, vectorHits, query, input, settings);
    }

    /**
     * 功能：发送混合检索阶段进度。
     * @param onProgress 进度回调。
     * @param stage 阶段键。
     * @param title 阶段标题。
     * @param message 阶段说明。
     * @param progress 进度值。
     * @returns 异步完成。
     */
    private emitProgress(
        onProgress: HybridRetrievalInput['onProgress'],
        stage: string,
        title: string,
        message: string,
        progress?: number,
    ): void {
        onProgress?.({
            stage,
            title,
            message,
            progress,
        });
    }

    /**
     * 功能：构造运行时策略决策。
     * @param input 检索输入。
     * @param settings 当前设置。
     * @returns 策略决策。
     */
    private buildDecision(input: HybridRetrievalInput, settings: MemoryOSSettings): VectorStrategyDecision {
        if (!settings.vectorEnableStrategyRouting) {
            return {
                route: 'fast_vector',
                candidateWindow: settings.vectorTopK,
                finalTopK: Math.min(settings.vectorTopK, settings.vectorFinalTopK),
                rerankEnabled: false,
                reasonCodes: ['strategy_routing_disabled_runtime'],
            };
        }
        const baseDecision = this.strategyRouter.route({
            query: input.query,
            mergedContextText: input.queryContext?.mergedContextText,
            retrievalMode: input.retrievalMode as 'vector_only' | 'hybrid',
            actorAnchorKeys: input.contextRoute?.entityAnchors?.actorKeys,
            relationAnchorKeys: input.contextRoute?.entityAnchors?.relationKeys,
            worldAnchorKeys: input.contextRoute?.entityAnchors?.worldKeys,
            expectedFacets: input.contextRoute?.facets,
            routeConfidence: input.contextRoute?.confidence,
        });
        const isDeep = baseDecision.route === 'deep_vector';
        return {
            ...baseDecision,
            candidateWindow: isDeep ? settings.vectorDeepWindow : settings.vectorTopK,
            finalTopK: isDeep
                ? settings.vectorFinalTopK
                : Math.min(settings.vectorTopK, settings.vectorFinalTopK),
            rerankEnabled: isDeep ? settings.vectorEnableRerank : false,
        };
    }

    /**
     * 功能：把向量命中映射为统一检索结果。
     * @param vectorHits 向量命中。
     * @param candidates 候选记录。
     * @returns 检索结果项。
     */
    private mapVectorHits(vectorHits: VectorSearchHit[], candidates: RetrievalCandidate[]): RetrievalResultItem[] {
        const candidateMap = new Map<string, RetrievalCandidate>();
        for (const candidate of candidates) {
            candidateMap.set(candidate.candidateId, candidate);
            candidateMap.set(candidate.entryId, candidate);
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
        return vectorResults;
    }

    /**
     * 功能：处理 vector_only 模式。
     * @param vectorResults 向量结果。
     * @param decision 策略决策。
     * @param vectorHits 原始命中。
     * @param query 查询文本。
     * @param input 原始输入。
     * @param settings 当前设置。
     * @returns 检索输出。
     */
    private async handleVectorOnly(
        vectorResults: RetrievalResultItem[],
        decision: VectorStrategyDecision,
        vectorHits: VectorSearchHit[],
        query: string,
        input: HybridRetrievalInput,
        settings: MemoryOSSettings,
    ): Promise<HybridRetrievalOutput> {
        const finalTopK = input.overrideFinalTopK ?? decision.finalTopK;
        const directItems = vectorResults.slice(0, finalTopK);

        if (!decision.rerankEnabled) {
            return {
                items: directItems,
                strategyDecision: decision,
                finalProviderId: 'vector_only_direct',
                vectorHits,
                preRerankItems: vectorResults,
                postRerankItems: directItems,
                mergeUsed: false,
                rerankUsed: false,
                rerankReasonCodes: ['fast_vector_no_rerank'],
                rerankSource: 'none',
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        const rerankResult = await this.resolveRerank(
            vectorResults,
            query,
            'vector_only',
            input.queryContext?.mergedContextText || '',
            finalTopK,
            settings,
        );

        return {
            items: rerankResult.items,
            strategyDecision: decision,
            finalProviderId: rerankResult.source === 'llmhub' ? 'vector_only_llmhub_rerank' : 'vector_only_rule_rerank',
            vectorHits,
            preRerankItems: vectorResults,
            postRerankItems: rerankResult.items,
            mergeUsed: false,
            rerankUsed: rerankResult.used,
            rerankReasonCodes: rerankResult.reasonCodes,
            rerankSource: rerankResult.source,
            vectorAvailable: true,
            vectorUnavailableReason: null,
        };
    }

    /**
     * 功能：处理 hybrid 模式。
     * @param lexicalResults 词法结果。
     * @param vectorResults 向量结果。
     * @param decision 策略决策。
     * @param vectorHits 原始命中。
     * @param query 查询文本。
     * @param input 原始输入。
     * @param settings 当前设置。
     * @returns 检索输出。
     */
    private async handleHybrid(
        lexicalResults: RetrievalResultItem[],
        vectorResults: RetrievalResultItem[],
        decision: VectorStrategyDecision,
        vectorHits: VectorSearchHit[],
        query: string,
        input: HybridRetrievalInput,
        settings: MemoryOSSettings,
    ): Promise<HybridRetrievalOutput> {
        const finalTopK = input.overrideFinalTopK ?? decision.finalTopK;
        const merged = this.mergeResults(lexicalResults, vectorResults);
        merged.sort((a, b) => b.score - a.score);

        if (!decision.rerankEnabled) {
            return {
                items: merged.slice(0, finalTopK),
                strategyDecision: decision,
                finalProviderId: 'hybrid_vector_direct',
                vectorHits,
                preRerankItems: merged,
                postRerankItems: merged.slice(0, finalTopK),
                mergeUsed: true,
                rerankUsed: false,
                rerankReasonCodes: ['fast_hybrid_no_rerank'],
                rerankSource: 'none',
                vectorAvailable: true,
                vectorUnavailableReason: null,
            };
        }

        const rerankResult = await this.resolveRerank(
            merged,
            query,
            'hybrid',
            input.queryContext?.mergedContextText || '',
            finalTopK,
            settings,
        );

        return {
            items: rerankResult.items,
            strategyDecision: decision,
            finalProviderId: rerankResult.source === 'llmhub' ? 'hybrid_vector_llmhub_rerank' : 'hybrid_vector_rule_rerank',
            vectorHits,
            preRerankItems: merged,
            postRerankItems: rerankResult.items,
            mergeUsed: true,
            rerankUsed: rerankResult.used,
            rerankReasonCodes: rerankResult.reasonCodes,
            rerankSource: rerankResult.source,
            vectorAvailable: true,
            vectorUnavailableReason: null,
        };
    }

    /**
     * 功能：统一处理 LLMHub 重排与规则重排。
     * @param candidates 候选列表。
     * @param query 查询文本。
     * @param mode 检索模式。
     * @param queryContextText 查询上下文文本。
     * @param finalTopK 最终数量。
     * @param settings 当前设置。
     * @returns 重排结果。
     */
    private async resolveRerank(
        candidates: RetrievalResultItem[],
        query: string,
        mode: 'vector_only' | 'hybrid',
        queryContextText: string,
        finalTopK: number,
        settings: MemoryOSSettings,
    ): Promise<InternalRerankResult> {
        const llmhubResult = await this.tryLLMHubRerank(candidates, query, mode, finalTopK, settings);
        if (llmhubResult) {
            return llmhubResult;
        }

        const rerankResult = this.rerankService.rerank({
            query,
            queryContextText,
            mode,
            candidates,
            candidateWindow: settings.vectorRerankWindow,
            finalTopK,
        });
        return {
            items: rerankResult.items,
            used: rerankResult.used,
            reasonCodes: rerankResult.reasonCodes,
            source: 'rule',
        };
    }

    /**
     * 功能：尝试执行 LLMHub 重排序。
     * @param candidates 候选列表。
     * @param query 查询文本。
     * @param mode 检索模式。
     * @param finalTopK 最终数量。
     * @param settings 当前设置。
     * @returns 命中时返回结果，未命中时返回 null。
     */
    private async tryLLMHubRerank(
        candidates: RetrievalResultItem[],
        query: string,
        mode: 'vector_only' | 'hybrid',
        finalTopK: number,
        settings: MemoryOSSettings,
    ): Promise<InternalRerankResult | null> {
        if (!settings.vectorEnableLLMHubRerank) {
            return null;
        }
        if (candidates.length < settings.vectorLLMHubRerankMinCandidates) {
            if (settings.vectorLLMHubRerankFallbackToRule) {
                return null;
            }
            return {
                items: candidates.slice(0, finalTopK),
                used: false,
                reasonCodes: ['llmhub_skipped_min_candidates'],
                source: 'none',
            };
        }

        const llmhubResult = await this.llmhubRerankService.rerank({
            query,
            mode,
            candidates: candidates.slice(0, settings.vectorLLMHubRerankMaxCandidates),
            finalTopK,
            resource: settings.vectorLLMHubRerankResource || undefined,
            model: settings.vectorLLMHubRerankModel || undefined,
        });
        if (llmhubResult.ok) {
            return {
                items: llmhubResult.items,
                used: true,
                reasonCodes: llmhubResult.reasonCodes,
                source: 'llmhub',
            };
        }
        if (settings.vectorLLMHubRerankFallbackToRule) {
            return null;
        }
        return {
            items: candidates.slice(0, finalTopK),
            used: false,
            reasonCodes: llmhubResult.reasonCodes.length > 0 ? llmhubResult.reasonCodes : ['llmhub_failed_direct_slice'],
            source: 'none',
        };
    }

    /**
     * 功能：融合 lexical 和 vector 结果，按 candidateId 去重。
     * @param lexical 词法结果。
     * @param vector 向量结果。
     * @returns 合并结果。
     */
    private mergeResults(
        lexical: RetrievalResultItem[],
        vector: RetrievalResultItem[],
    ): RetrievalResultItem[] {
        const seen = new Map<string, RetrievalResultItem>();

        for (const item of lexical) {
            const key = item.candidate.candidateId || item.candidate.entryId;
            seen.set(key, item);
        }

        for (const item of vector) {
            const key = item.candidate.candidateId || item.candidate.entryId;
            const existing = seen.get(key);
            if (!existing) {
                seen.set(key, item);
                continue;
            }
            if (item.score > existing.score) {
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
