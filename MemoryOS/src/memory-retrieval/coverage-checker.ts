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
 * 功能：执行规则版缺项补召回。
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

    // 统计当前结果已覆盖的 facets
    const coveredFacets = new Set<RetrievalFacet>();
    for (const item of currentResults) {
        for (const [facet, schemas] of Object.entries(FACET_RECALL_SCHEMAS) as [RetrievalFacet, string[]][]) {
            if (schemas.includes(item.candidate.schemaId)) {
                coveredFacets.add(facet);
            }
        }
    }

    // 找出缺失的高权重 facets
    const missingFacets: RetrievalFacet[] = [];
    for (const facet of contextRoute.facets) {
        if (!coveredFacets.has(facet)) {
            missingFacets.push(facet);
        }
    }

    if (missingFacets.length <= 0) {
        return currentResults;
    }

    // 已有结果的 ID 集合，避免重复
    const existingIds = new Set(currentResults.map(item => item.candidate.candidateId));

    const supplements: RetrievalResultItem[] = [];

    for (const facet of missingFacets) {
        const targetSchemas = FACET_RECALL_SCHEMAS[facet] ?? [];
        if (targetSchemas.length <= 0) continue;

        // 从全量候选中筛出该 facet 对应的未被召回的候选
        const facetCandidates = allCandidates.filter(c =>
            targetSchemas.includes(c.schemaId) && !existingIds.has(c.candidateId),
        );

        if (facetCandidates.length <= 0) continue;

        // 按轻量评分排序
        const scored = facetCandidates.map(candidate => {
            const ngram = computeNGramSimilarity(query, `${candidate.title} ${candidate.summary}`);
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
