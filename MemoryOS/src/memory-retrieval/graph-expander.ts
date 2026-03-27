import type { RetrievalCandidate, RetrievalResultItem } from './types';
import { buildCandidateLinkIndex } from './link-index';
import { applyGraphBoost, clamp01 } from './scoring';

/**
 * 功能：图扩散输入参数。
 */
export interface GraphExpansionInput {
    seeds: RetrievalResultItem[];
    allCandidates: RetrievalCandidate[];
    maxDepth?: number;
    decay?: number;
}

/**
 * 功能：从种子节点沿结构关系扩散一层，把相关的上下文带出来。
 * @param input 扩散输入。
 * @returns 合并种子与扩散结果后的列表。
 */
export function expandFromSeeds(input: GraphExpansionInput): RetrievalResultItem[] {
    const { seeds, allCandidates, maxDepth = 1, decay = 0.65 } = input;

    if (seeds.length <= 0 || allCandidates.length <= 0) {
        return seeds;
    }

    const linkIndex = buildCandidateLinkIndex(allCandidates);

    // candidateId → 当前最优 RetrievalResultItem
    const resultMap = new Map<string, RetrievalResultItem>();
    for (const seed of seeds) {
        resultMap.set(seed.candidate.candidateId, { ...seed });
    }

    // 候选 ID → candidate 的快速查找
    const candidateMap = new Map<string, RetrievalCandidate>();
    for (const candidate of allCandidates) {
        candidateMap.set(candidate.candidateId, candidate);
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

                const boost = applyGraphBoost(sourceItem.score, edge.edgeWeight, decay);
                if (boost <= 0.001) continue;

                const existing = resultMap.get(edge.targetId);
                if (existing) {
                    // 已存在：累加 graphBoost
                    const newBoost = clamp01((existing.breakdown.graphBoost ?? 0) + boost);
                    const newScore = clamp01(existing.score + boost);
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
                        score: clamp01(boost),
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

    // 返回排序后的结果
    return [...resultMap.values()]
        .sort((a, b) => b.score - a.score);
}
