import type { RetrievalCandidate, RetrievalContextRoute, RetrievalDiagnostics, RetrievalFacet, RetrievalOrchestratorResult, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';
import { LexicalRetrievalProvider } from './lexical-provider';
import { EmbeddingRetrievalProvider } from './embedding-provider';
import { routeRetrievalContext, buildContextDictionaryFromCandidates } from './context-router';
import { expandFromSeeds } from './graph-expander';
import { applyCoverageSecondPass } from './coverage-checker';
import { pruneForDiversity } from './diversity-pruner';

/**
 * 功能：从语境路由构建影响种子召回的修正参数。
 * @param originalQuery 原始查询文本。
 * @param route 语境路由结果。
 * @returns 修正后的召回参数。
 */
function buildSeedQueryFromRoute(
    originalQuery: string,
    route: RetrievalContextRoute,
): {
    queryText: string;
    candidateTypes?: string[];
    boostSchemaIds?: string[];
} {
    const topFacet = route.facets[0] as RetrievalFacet | undefined;

    // facet → 优先检索的 schemaId
    const FACET_PRIORITY_SCHEMAS: Record<RetrievalFacet, string[]> = {
        world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
        scene: ['scene_shared_state', 'location'],
        relationship: ['relationship', 'actor_profile'],
        event: ['event', 'actor_visible_event'],
        interpretation: ['actor_private_interpretation'],
    };

    let candidateTypes: string[] | undefined;
    let boostSchemaIds: string[] | undefined;

    // 如果置信度足够高且有明确 topFacet，收窄候选类型
    if (topFacet && route.confidence >= 0.4 && route.facets.length <= 2) {
        // 不直接限制 candidateTypes（避免丢失跨 facet 相关条目），改为标记 boost
        boostSchemaIds = [];
        for (const facet of route.facets) {
            boostSchemaIds.push(...(FACET_PRIORITY_SCHEMAS[facet] ?? []));
        }
    }

    // 把锚点关键词拼入 query 以强化命中
    const anchorTokens: string[] = [];
    for (const key of route.entityAnchors.actorKeys.slice(0, 3)) {
        if (key && !originalQuery.toLowerCase().includes(key.toLowerCase())) {
            anchorTokens.push(key);
        }
    }
    for (const key of route.entityAnchors.locationKeys.slice(0, 2)) {
        if (key && !originalQuery.toLowerCase().includes(key.toLowerCase())) {
            anchorTokens.push(key);
        }
    }

    const queryText = anchorTokens.length > 0
        ? `${originalQuery} ${anchorTokens.join(' ')}`
        : originalQuery;

    return { queryText, candidateTypes, boostSchemaIds };
}

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

        // 第二步：种子召回（route-aware）
        const routeHints = buildSeedQueryFromRoute(normalizedQuery, contextRoute);
        const seedQuery: RetrievalQuery = {
            ...query,
            query: routeHints.queryText,
            candidateTypes: routeHints.candidateTypes ?? query.candidateTypes,
            budget: { ...query.budget, maxCandidates: Math.max(30, query.budget.maxCandidates ?? 30) },
        };
        let seeds: RetrievalResultItem[] = [];
        let actualProviderId = 'none';

        if (query.enableEmbedding) {
            seeds = await this.embeddingProvider.search(seedQuery, candidates);
            if (seeds.length > 0) {
                actualProviderId = this.embeddingProvider.providerId;
            }
        }
        if (seeds.length <= 0) {
            seeds = await this.lexicalProvider.search(seedQuery, candidates);
            if (seeds.length > 0) {
                actualProviderId = this.lexicalProvider.providerId;
            }
        }

        // 对 route 标记的 boostSchemaIds 做轻提权
        if (routeHints.boostSchemaIds && routeHints.boostSchemaIds.length > 0 && seeds.length > 0) {
            const boostSet = new Set(routeHints.boostSchemaIds);
            for (const item of seeds) {
                if (boostSet.has(item.candidate.schemaId)) {
                    item.score = Math.min(1, item.score * 1.08);
                }
            }
            seeds.sort((a, b) => b.score - a.score);
        }

        const seedCount = seeds.length;

        if (seeds.length <= 0) {
            return { providerId: actualProviderId, contextRoute, items: [] };
        }

        // 第三步：结构扩散（语境感知）
        const expanded = expandFromSeeds({
            seeds,
            allCandidates: candidates,
            maxDepth: 1,
            decay: 0.65,
            contextRoute,
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

        // 构建诊断信息
        const diagnostics: RetrievalDiagnostics = {
            contextRoute,
            seedProviderId: actualProviderId,
            seedCount,
            expandedCount: expanded.length,
            coverageTriggeredFacets: this.detectCoverageTriggeredFacets(expanded, covered),
            diversityDroppedCount: covered.length - pruned.length,
        };

        return {
            providerId: actualProviderId,
            contextRoute,
            items: pruned,
            diagnostics,
        };
    }

    /**
     * 功能：检测 coverage second pass 实际触发补召回的 facets。
     */
    private detectCoverageTriggeredFacets(before: RetrievalResultItem[], after: RetrievalResultItem[]): RetrievalFacet[] {
        if (after.length <= before.length) return [];
        const beforeIds = new Set(before.map(i => i.candidate.candidateId));
        const added = after.filter(i => !beforeIds.has(i.candidate.candidateId));
        const facets = new Set<RetrievalFacet>();
        const SCHEMA_FACET: Record<string, RetrievalFacet> = {
            world_core_setting: 'world', world_hard_rule: 'world', world_global_state: 'world', world_hard_rule_legacy: 'world',
            scene_shared_state: 'scene', location: 'scene',
            relationship: 'relationship', actor_profile: 'relationship',
            event: 'event', actor_visible_event: 'event',
            actor_private_interpretation: 'interpretation',
        };
        for (const item of added) {
            const f = SCHEMA_FACET[item.candidate.schemaId];
            if (f) facets.add(f);
        }
        return [...facets];
    }
}

