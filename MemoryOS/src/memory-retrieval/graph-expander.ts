import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet, RetrievalResultItem } from './types';
import { buildCandidateLinkIndex } from './link-index';
import { clamp01 } from './scoring';

/**
 * 功能：图扩散输入参数。
 */
export interface GraphExpansionInput {
    seeds: RetrievalResultItem[];
    allCandidates: RetrievalCandidate[];
    maxDepth?: number;
    decay?: number;
    /** 可选语境路由，用于语境感知边权重调整 */
    contextRoute?: RetrievalContextRoute;
}

/**
 * 功能：边类型 → 语境 facet 的关联映射，用于语境感知提权。
 */
const EDGE_FACET_AFFINITY: Record<string, RetrievalFacet[]> = {
    relation: ['relationship'],
    actor: ['relationship', 'event'],
    participants: ['event', 'relationship'],
    location: ['scene'],
    world: ['world'],
    sourceSummary: ['event'],
    tags: ['event', 'interpretation'],
    category: [],
};

/**
 * 功能：计算语境感知边权重乘数。
 * @param edgeType 边类型。
 * @param contextRoute 语境路由。
 * @returns 乘数（≥1.0 表示增强，默认 1.0）。
 */
function computeContextEdgeMultiplier(edgeType: string, contextRoute?: RetrievalContextRoute): number {
    if (!contextRoute || contextRoute.facets.length <= 0) return 1.0;
    const affinityFacets = EDGE_FACET_AFFINITY[edgeType] ?? [];
    if (affinityFacets.length <= 0) return 1.0;
    // 如果当前 topFacet 和边类型关联，给予提权
    const topFacet = contextRoute.facets[0];
    if (affinityFacets.includes(topFacet)) return 1.25;
    if (contextRoute.facets.length > 1 && affinityFacets.includes(contextRoute.facets[1])) return 1.1;
    return 1.0;
}

/**
 * 功能：计算图扩散增益（不做 clamp，积累原始分数）。
 * @param seedScore 种子分数。
 * @param edgeWeight 边权重。
 * @param decay 衰减系数。
 * @returns 原始扩散增益。
 */
function computeRawGraphBoost(seedScore: number, edgeWeight: number, decay: number): number {
    return Number((seedScore * edgeWeight * decay).toFixed(6));
}

/**
 * 功能：从种子节点沿结构关系扩散一层，把相关的上下文带出来。
 * @param input 扩散输入。
 * @returns 合并种子与扩散结果后的列表。
 */
export function expandFromSeeds(input: GraphExpansionInput): RetrievalResultItem[] {
    const { seeds, allCandidates, maxDepth = 1, decay = 0.65, contextRoute } = input;

    if (seeds.length <= 0 || allCandidates.length <= 0) {
        return seeds;
    }

    const linkIndex = buildCandidateLinkIndex(allCandidates);

    // candidateId → 当前最优 RetrievalResultItem（中间阶段 score 可超 1）
    const resultMap = new Map<string, RetrievalResultItem>();
    for (const seed of seeds) {
        resultMap.set(seed.candidate.candidateId, { ...seed });
    }

    // 候选 ID → candidate 的快速查找
    const candidateMap = new Map<string, RetrievalCandidate>();
    for (const candidate of allCandidates) {
        candidateMap.set(candidate.candidateId, candidate);
    }

    // 计算 hub degree（用于 hub penalty）
    const degreeMap = new Map<string, number>();
    for (const candidate of allCandidates) {
        const neighbors = linkIndex.neighborsOf(candidate.candidateId);
        degreeMap.set(candidate.candidateId, neighbors.length);
    }

    // 层级扩散
    let currentFrontier = seeds.map(s => s.candidate.candidateId);

    for (let depth = 0; depth < maxDepth; depth++) {
        const nextFrontier: string[] = [];

        for (const sourceId of currentFrontier) {
            const sourceItem = resultMap.get(sourceId);
            if (!sourceItem) continue;

            const neighbors = linkIndex.neighborsOf(sourceId);
            for (const edge of neighbors) {
                const targetCandidate = candidateMap.get(edge.targetId);
                if (!targetCandidate) continue;

                // 语境感知边权重乘数
                const contextMultiplier = computeContextEdgeMultiplier(edge.edgeType, contextRoute);
                const adjustedEdgeWeight = edge.edgeWeight * contextMultiplier;

                // hub penalty: 1 / sqrt(1 + degree)
                const targetDegree = degreeMap.get(edge.targetId) ?? 0;
                const hubPenalty = 1 / Math.sqrt(1 + targetDegree);

                const boost = computeRawGraphBoost(sourceItem.score, adjustedEdgeWeight, decay) * hubPenalty;
                if (boost <= 0.001) continue;

                const existing = resultMap.get(edge.targetId);
                if (existing) {
                    // 已存在：累加 graphBoost（不 clamp）
                    const newBoost = (existing.breakdown.graphBoost ?? 0) + boost;
                    const newScore = existing.score + boost;
                    resultMap.set(edge.targetId, {
                        ...existing,
                        score: newScore,
                        breakdown: {
                            ...existing.breakdown,
                            graphBoost: newBoost,
                        },
                    });
                } else {
                    // 新节点：创建新结果项
                    resultMap.set(edge.targetId, {
                        candidate: targetCandidate,
                        score: boost,
                        breakdown: {
                            bm25: 0,
                            ngram: 0,
                            editDistance: 0,
                            memoryWeight: 0,
                            recencyWeight: 0,
                            graphBoost: boost,
                        },
                    });
                    nextFrontier.push(edge.targetId);
                }
            }
        }

        currentFrontier = nextFrontier;
    }

    // 最终归一化：找到最大 score，做 min-max 归一化到 0~1
    const results = [...resultMap.values()];
    const maxScore = Math.max(...results.map(r => r.score), 0.001);
    if (maxScore > 1) {
        for (const item of results) {
            item.score = clamp01(item.score / maxScore);
            if (item.breakdown.graphBoost !== undefined && item.breakdown.graphBoost > 0) {
                item.breakdown.graphBoost = clamp01(item.breakdown.graphBoost / maxScore);
            }
        }
    } else {
        for (const item of results) {
            item.score = clamp01(item.score);
        }
    }

    // 返回排序后的结果
    return results.sort((a, b) => b.score - a.score);
}
