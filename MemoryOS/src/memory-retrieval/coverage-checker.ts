import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet, RetrievalResultItem } from './types';
import { clamp01, computeMemoryWeight, computeNGramSimilarity, computeRecencyWeight } from './scoring';

/**
 * 功能：facet 到对应 schemaId 的补召回映射。
 */
const FACET_RECALL_SCHEMAS: Record<RetrievalFacet, string[]> = {
    world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
    scene: ['scene_shared_state', 'location'],
    relationship: ['relationship', 'actor_profile', 'actor_private_interpretation'],
    event: ['event', 'actor_visible_event'],
    interpretation: ['actor_private_interpretation'],
};

/**
 * 功能：facet 补召回触发的最低 route 分数阈值。
 * 只有 contextRoute 中该 facet 分数足够高时才触发补召回。
 */
const FACET_ROUTE_STRENGTH_THRESHOLD = 0.2;

/**
 * 功能：根据 facet 和锚点构建子查询文本（更接近残差补召回）。
 * @param facet 目标 facet。
 * @param originalQuery 原始查询。
 * @param contextRoute 语境路由。
 * @returns facet 子查询文本。
 */
function buildFacetSubQuery(facet: RetrievalFacet, originalQuery: string, contextRoute: RetrievalContextRoute): string {
    const parts: string[] = [];

    switch (facet) {
        case 'relationship': {
            // 角色对 + 关系词
            if (contextRoute.entityAnchors.actorKeys.length > 0) {
                parts.push(contextRoute.entityAnchors.actorKeys.slice(0, 3).join(' '));
            }
            if (contextRoute.entityAnchors.relationKeys.length > 0) {
                parts.push(contextRoute.entityAnchors.relationKeys.slice(0, 2).join(' '));
            }
            // 从 topicHints 提取关系相关词
            const relHints = contextRoute.topicHints.filter(h =>
                h.includes('冲突') || h.includes('修复') || h.includes('关系') || h.includes('conflict') || h.includes('repair'),
            );
            if (relHints.length > 0) parts.push(relHints.slice(0, 2).join(' '));
            break;
        }
        case 'scene': {
            if (contextRoute.entityAnchors.locationKeys.length > 0) {
                parts.push(contextRoute.entityAnchors.locationKeys.slice(0, 2).join(' '));
            }
            const sceneHints = contextRoute.topicHints.filter(h =>
                h.includes('场景') || h.includes('地点') || h.includes('scene'),
            );
            if (sceneHints.length > 0) parts.push(sceneHints.slice(0, 2).join(' '));
            break;
        }
        case 'world': {
            if (contextRoute.entityAnchors.worldKeys.length > 0) {
                parts.push(contextRoute.entityAnchors.worldKeys.slice(0, 3).join(' '));
            }
            const worldHints = contextRoute.topicHints.filter(h =>
                h.includes('规则') || h.includes('设定') || h.includes('world') || h.includes('setting'),
            );
            if (worldHints.length > 0) parts.push(worldHints.slice(0, 2).join(' '));
            break;
        }
        default:
            break;
    }

    // 如果没提取到足够的子查询信息，回退到原始 query
    return parts.length > 0 ? parts.join(' ') : originalQuery;
}

/**
 * 功能：执行规则版缺项补召回（残差式）。
 * @param input 补召回输入。
 * @returns 补充后的结果列表。
 */
export function applyCoverageSecondPass(input: {
    currentResults: RetrievalResultItem[];
    allCandidates: RetrievalCandidate[];
    contextRoute: RetrievalContextRoute | null;
    query: string;
    maxSupplementPerFacet?: number;
}): RetrievalResultItem[] {
    const { currentResults, allCandidates, contextRoute, query, maxSupplementPerFacet = 3 } = input;

    if (!contextRoute || contextRoute.facets.length <= 0) {
        return currentResults;
    }

    // 统计当前结果已覆盖的 facets（弱覆盖判定：该 facet 至少有 1 条得分 > 0.1 的结果）
    const facetCoverage = new Map<RetrievalFacet, number>();
    for (const item of currentResults) {
        for (const [facet, schemas] of Object.entries(FACET_RECALL_SCHEMAS) as [RetrievalFacet, string[]][]) {
            if (schemas.includes(item.candidate.schemaId) && item.score > 0.1) {
                facetCoverage.set(facet, (facetCoverage.get(facet) ?? 0) + 1);
            }
        }
    }

    // 找出需要补召回的 facets：route 中的高权重 facet 且当前弱覆盖
    const facetsToSupplement: RetrievalFacet[] = [];
    for (let i = 0; i < contextRoute.facets.length; i++) {
        const facet = contextRoute.facets[i];
        const coverage = facetCoverage.get(facet) ?? 0;
        // 只有在 route 中排名靠前且覆盖不足时才补
        if (coverage < 2) {
            facetsToSupplement.push(facet);
        }
    }

    if (facetsToSupplement.length <= 0) {
        return currentResults;
    }

    // 已有结果的 ID 集合，避免重复
    const existingIds = new Set(currentResults.map(item => item.candidate.candidateId));

    const supplements: RetrievalResultItem[] = [];

    for (const facet of facetsToSupplement) {
        const targetSchemas = FACET_RECALL_SCHEMAS[facet] ?? [];
        if (targetSchemas.length <= 0) continue;

        // 从全量候选中筛出该 facet 对应的未被召回的候选
        const facetCandidates = allCandidates.filter(c =>
            targetSchemas.includes(c.schemaId) && !existingIds.has(c.candidateId),
        );

        if (facetCandidates.length <= 0) continue;

        // 构建 facet 子查询（而非继续用整句原 query）
        const subQuery = buildFacetSubQuery(facet, query, contextRoute);

        // 按轻量评分排序
        const scored = facetCandidates.map(candidate => {
            const ngram = computeNGramSimilarity(subQuery, `${candidate.title} ${candidate.summary}`);
            const memoryWeight = computeMemoryWeight(candidate.memoryPercent);
            const recencyWeight = computeRecencyWeight(candidate.updatedAt);
            const score = clamp01(
                ngram * 0.4
                + memoryWeight * 0.3
                + recencyWeight * 0.3,
            );
            return {
                candidate,
                score,
                breakdown: {
                    bm25: 0,
                    ngram,
                    editDistance: 0,
                    memoryWeight,
                    recencyWeight,
                    graphBoost: 0,
                },
            } as RetrievalResultItem;
        });

        scored.sort((a, b) => b.score - a.score);
        const topN = scored.slice(0, maxSupplementPerFacet);

        for (const item of topN) {
            existingIds.add(item.candidate.candidateId);
            supplements.push(item);
        }
    }

    // 合并原始结果与补充结果
    return [...currentResults, ...supplements];
}
