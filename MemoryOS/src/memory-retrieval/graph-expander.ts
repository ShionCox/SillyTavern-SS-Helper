import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
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
    enableHubPenalty?: boolean;
    /** 可选语境路由，用于语境感知边权重调整 */
    contextRoute?: RetrievalContextRoute;
    onTrace?: (record: MemoryDebugLogRecord) => void;
}

/**
 * 功能：图扩散诊断信息。
 */
export interface GraphExpansionDiagnostics {
    addedCount: number;
    hubPenaltyAppliedCount: number;
    boostedEdgeTypes: string[];
}

/**
 * 功能：图扩散返回结果。
 */
export interface GraphExpansionResult {
    items: RetrievalResultItem[];
    diagnostics: GraphExpansionDiagnostics;
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
 * @returns 乘数。
 */
function computeContextEdgeMultiplier(edgeType: string, contextRoute?: RetrievalContextRoute): number {
    if (!contextRoute || contextRoute.facets.length <= 0) {
        return 1.0;
    }
    const affinityFacets = EDGE_FACET_AFFINITY[edgeType] ?? [];
    if (affinityFacets.length <= 0) {
        return 1.0;
    }
    const topFacet = contextRoute.facets[0];
    if (affinityFacets.includes(topFacet)) {
        return 1.25;
    }
    if (contextRoute.facets.length > 1 && affinityFacets.includes(contextRoute.facets[1])) {
        return 1.1;
    }
    return 1.0;
}

/**
 * 功能：计算图扩散增益。
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
 * @returns 合并种子与扩散结果后的列表和诊断信息。
 */
export function expandFromSeeds(input: GraphExpansionInput): GraphExpansionResult {
    const { seeds, allCandidates, maxDepth = 1, decay = 0.65, enableHubPenalty = true, contextRoute, onTrace } = input;
    if (seeds.length <= 0 || allCandidates.length <= 0) {
        return {
            items: seeds,
            diagnostics: {
                addedCount: 0,
                hubPenaltyAppliedCount: 0,
                boostedEdgeTypes: [],
            },
        };
    }

    emitGraphTrace(onTrace, '开始扩散', `开始执行图扩散，当前主情境为 ${contextRoute?.facets?.[0] ?? '未指定'}。`, {
        seedCount: seeds.length,
        maxDepth,
        decay,
    });

    const linkIndex = buildCandidateLinkIndex(allCandidates);
    const resultMap = new Map<string, RetrievalResultItem>();
    for (const seed of seeds) {
        resultMap.set(seed.candidate.candidateId, { ...seed });
    }

    const candidateMap = new Map<string, RetrievalCandidate>();
    for (const candidate of allCandidates) {
        candidateMap.set(candidate.candidateId, candidate);
    }

    const degreeMap = new Map<string, number>();
    for (const candidate of allCandidates) {
        degreeMap.set(candidate.candidateId, linkIndex.neighborsOf(candidate.candidateId).length);
    }

    const boostedEdgeTypes = new Set<string>();
    let hubPenaltyAppliedCount = 0;
    let addedCount = 0;
    let currentFrontier = seeds.map((seed: RetrievalResultItem): string => seed.candidate.candidateId);

    for (let depth = 0; depth < maxDepth; depth += 1) {
        const nextFrontier: string[] = [];
        for (const sourceId of currentFrontier) {
            const sourceItem = resultMap.get(sourceId);
            if (!sourceItem) {
                continue;
            }
            const neighbors = linkIndex.neighborsOf(sourceId);
            for (const edge of neighbors) {
                const targetCandidate = candidateMap.get(edge.targetId);
                if (!targetCandidate) {
                    continue;
                }
                const contextMultiplier = computeContextEdgeMultiplier(edge.edgeType, contextRoute);
                if (contextMultiplier > 1) {
                    boostedEdgeTypes.add(edge.edgeType);
                }
                const adjustedEdgeWeight = edge.edgeWeight * contextMultiplier;
                const targetDegree = degreeMap.get(edge.targetId) ?? 0;
                const hubPenalty = enableHubPenalty ? 1 / Math.sqrt(1 + targetDegree) : 1;
                if (enableHubPenalty && targetDegree >= 4) {
                    hubPenaltyAppliedCount += 1;
                }
                const boost = computeRawGraphBoost(sourceItem.score, adjustedEdgeWeight, decay) * hubPenalty;
                if (boost <= 0.001) {
                    continue;
                }
                const existing = resultMap.get(edge.targetId);
                if (existing) {
                    const newBoost = (existing.breakdown.graphBoost ?? 0) + boost;
                    resultMap.set(edge.targetId, {
                        ...existing,
                        score: existing.score + boost,
                        breakdown: {
                            ...existing.breakdown,
                            graphBoost: newBoost,
                        },
                    });
                    continue;
                }
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
                addedCount += 1;
            }
        }
        currentFrontier = nextFrontier;
    }

    const results = [...resultMap.values()];
    const maxScore = Math.max(...results.map((item: RetrievalResultItem): number => item.score), 0.001);
    if (maxScore > 1) {
        for (const item of results) {
            item.score = clamp01(item.score / maxScore);
            if ((item.breakdown.graphBoost ?? 0) > 0) {
                item.breakdown.graphBoost = clamp01((item.breakdown.graphBoost ?? 0) / maxScore);
            }
        }
    } else {
        for (const item of results) {
            item.score = clamp01(item.score);
        }
    }

    if (boostedEdgeTypes.size > 0) {
        emitGraphTrace(onTrace, '边权提权', `关系边命中主情境，已对 ${[...boostedEdgeTypes].join('、')} 追加语境加权。`, {
            boostedEdgeTypes: [...boostedEdgeTypes],
        });
    }
    if (hubPenaltyAppliedCount > 0) {
        emitGraphTrace(onTrace, '中心惩罚', '检测到高中心度节点，已应用 hub penalty。', {
            hubPenaltyAppliedCount,
        });
    } else if (!enableHubPenalty) {
        emitGraphTrace(onTrace, '中心惩罚关闭', '当前检索已关闭图扩展热点降权，Hub 节点不再额外降权。', {
            enableHubPenalty,
        });
    }
    emitGraphTrace(onTrace, '扩散完成', `图扩散结束，本轮共新增 ${addedCount} 个非种子节点。`, {
        beforeCount: seeds.length,
        afterCount: results.length,
        addedCount,
    });

    return {
        items: results.sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score),
        diagnostics: {
            addedCount,
            hubPenaltyAppliedCount,
            boostedEdgeTypes: [...boostedEdgeTypes],
        },
    };
}

/**
 * 功能：触发图扩散日志。
 * @param onTrace trace 回调。
 * @param title 标题。
 * @param message 消息。
 * @param payload 负载。
 * @returns 无返回值。
 */
function emitGraphTrace(
    onTrace: GraphExpansionInput['onTrace'],
    title: string,
    message: string,
    payload?: Record<string, unknown>,
): void {
    onTrace?.({
        ts: Date.now(),
        level: 'info',
        stage: 'graph',
        title,
        message,
        payload,
    });
}
