import type { RetrievalCandidate, RetrievalOrchestratorResult, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';
import { LexicalRetrievalProvider } from './lexical-provider';
import { EmbeddingRetrievalProvider } from './embedding-provider';
import { routeRetrievalContext, buildContextDictionaryFromCandidates } from './context-router';
import { expandFromSeeds } from './graph-expander';
import { applyCoverageSecondPass } from './coverage-checker';
import { pruneForDiversity } from './diversity-pruner';

/**
 * 功能：检索编排器，负责完整的多阶段混合召回管线。
 * 流程：context route → seed recall → graph expansion → coverage second pass → diversity prune
 */
export class RetrievalOrchestrator {
    private readonly lexicalProvider: RetrievalProvider;
    private readonly embeddingProvider: RetrievalProvider;

    /**
     * 功能：初始化检索编排器。
     * @param lexicalProvider 可选词法 provider。
     * @param embeddingProvider 可选 embedding provider。
     */
    constructor(
        lexicalProvider: RetrievalProvider = new LexicalRetrievalProvider(),
        embeddingProvider: RetrievalProvider = new EmbeddingRetrievalProvider(),
    ) {
        this.lexicalProvider = lexicalProvider;
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * 功能：执行完整多阶段混合召回。
     * @param query 检索请求。
     * @param candidates 候选记录。
     * @returns 检索结果与 provider 信息。
     */
    public async retrieve(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<RetrievalOrchestratorResult> {
        const normalizedQuery = String(query.query ?? '').trim();
        if (!normalizedQuery || candidates.length <= 0) {
            return { providerId: 'none', contextRoute: null, items: [] };
        }

        // 第一步：语境路由
        const dictionaries = buildContextDictionaryFromCandidates(candidates);
        const contextRoute = routeRetrievalContext(normalizedQuery, candidates, dictionaries);

        // 第二步：种子召回
        const provider = this.chooseProvider(query.enableEmbedding);
        const seedQuery: RetrievalQuery = {
            ...query,
            budget: { ...query.budget, maxCandidates: Math.max(30, query.budget.maxCandidates ?? 30) },
        };
        let seeds: RetrievalResultItem[] = [];

        if (query.enableEmbedding) {
            seeds = await this.embeddingProvider.search(seedQuery, candidates);
        }
        if (seeds.length <= 0) {
            seeds = await this.lexicalProvider.search(seedQuery, candidates);
        }

        if (seeds.length <= 0) {
            return { providerId: provider.providerId, contextRoute, items: [] };
        }

        // 第三步：结构扩散
        const expanded = expandFromSeeds({
            seeds,
            allCandidates: candidates,
            maxDepth: 1,
            decay: 0.65,
        });

        // 第四步：缺项补召回
        const covered = applyCoverageSecondPass({
            currentResults: expanded,
            allCandidates: candidates,
            contextRoute,
            query: normalizedQuery,
            maxSupplementPerFacet: 3,
        });

        // 第五步：多样性裁剪
        const pruned = pruneForDiversity({
            items: covered,
            maxChars: query.budget.maxChars ?? 8000,
            maxCandidates: query.budget.maxCandidates ?? 40,
        });

        return {
            providerId: provider.providerId,
            contextRoute,
            items: pruned,
        };
    }

    /**
     * 功能：选择当前应使用的 provider。
     * @param enableEmbedding 是否启用 embedding。
     * @returns 选中的 provider。
     */
    private chooseProvider(enableEmbedding?: boolean): RetrievalProvider {
        return enableEmbedding ? this.embeddingProvider : this.lexicalProvider;
    }
}

