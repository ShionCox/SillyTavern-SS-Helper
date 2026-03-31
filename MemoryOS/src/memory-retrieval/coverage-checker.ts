import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet, RetrievalResultItem } from './types';
import { clamp01, computeMemoryWeight, computeNGramSimilarity, computeRecencyWeight } from './scoring';

/**
 * 功能：facet 到对应 schemaId 的补召回映射。
 */
const FACET_RECALL_SCHEMAS: Record<RetrievalFacet, string[]> = {
    world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
    scene: ['scene_shared_state', 'location'],
    relationship: ['actor_private_interpretation'],
    event: ['event', 'actor_visible_event'],
    interpretation: ['actor_private_interpretation'],
    organization_politics: ['organization', 'nation', 'city', 'location'],
};

/**
 * 功能：补召回结果。
 */
export interface CoverageSecondPassResult {
    items: RetrievalResultItem[];
    triggeredFacets: RetrievalFacet[];
    subQueries: Partial<Record<RetrievalFacet, string>>;
    addedCounts: Partial<Record<RetrievalFacet, number>>;
}

/**
 * 功能：执行规则版缺项补召回。
 * @param input 补召回输入。
 * @returns 补充后的结果列表和诊断。
 */
export function applyCoverageSecondPass(input: {
    currentResults: RetrievalResultItem[];
    allCandidates: RetrievalCandidate[];
    contextRoute: RetrievalContextRoute | null;
    query: string;
    maxSupplementPerFacet?: number;
    onTrace?: (record: MemoryDebugLogRecord) => void;
}): CoverageSecondPassResult {
    const { currentResults, allCandidates, contextRoute, query, maxSupplementPerFacet = 3, onTrace } = input;
    if (!contextRoute || contextRoute.facets.length <= 0) {
        return {
            items: currentResults,
            triggeredFacets: [],
            subQueries: {},
            addedCounts: {},
        };
    }

    emitCoverageTrace(onTrace, '开始检测', '开始检测覆盖缺口。', {
        currentCount: currentResults.length,
    });

    const facetCoverage = new Map<RetrievalFacet, number>();
    for (const item of currentResults) {
        for (const [facet, schemas] of Object.entries(FACET_RECALL_SCHEMAS) as [RetrievalFacet, string[]][]) {
            if (schemas.includes(item.candidate.schemaId) && item.score > 0.1) {
                facetCoverage.set(facet, (facetCoverage.get(facet) ?? 0) + 1);
            }
        }
    }

    const facetsToSupplement = contextRoute.facets.filter((facet: RetrievalFacet): boolean => (facetCoverage.get(facet) ?? 0) < 2);
    if (facetsToSupplement.length <= 0) {
        emitCoverageTrace(onTrace, '覆盖充足', '当前结果覆盖充足，本轮未触发二次补召回。', {
            facetCoverage: Object.fromEntries(facetCoverage),
        });
        return {
            items: currentResults,
            triggeredFacets: [],
            subQueries: {},
            addedCounts: {},
        };
    }

    const existingIds = new Set(currentResults.map((item: RetrievalResultItem): string => item.candidate.candidateId));
    const supplements: RetrievalResultItem[] = [];
    const subQueries: Partial<Record<RetrievalFacet, string>> = {};
    const addedCounts: Partial<Record<RetrievalFacet, number>> = {};

    for (const facet of facetsToSupplement) {
        const targetSchemas = FACET_RECALL_SCHEMAS[facet] ?? [];
        const facetCandidates = allCandidates.filter((candidate: RetrievalCandidate): boolean => {
            return targetSchemas.includes(candidate.schemaId) && !existingIds.has(candidate.candidateId);
        });
        if (facetCandidates.length <= 0) {
            continue;
        }
        const subQuery = buildFacetSubQuery(facet, query, contextRoute);
        subQueries[facet] = subQuery;
        emitCoverageTrace(
            onTrace,
            '覆盖不足',
            `当前结果对“${facet}”覆盖不足（覆盖数 ${facetCoverage.get(facet) ?? 0}，目标至少 2）。`,
            {
                facet,
                currentCoverage: facetCoverage.get(facet) ?? 0,
                targetCoverage: 2,
            },
        );
        emitCoverageTrace(onTrace, '生成子查询', `已生成 ${facet} 子查询：${subQuery}。`, {
            facet,
            subQuery,
        });

        const scored = facetCandidates.map((candidate: RetrievalCandidate): RetrievalResultItem => {
            const ngram = computeNGramSimilarity(subQuery, `${candidate.title} ${candidate.summary}`);
            const memoryWeight = computeMemoryWeight(candidate.memoryPercent);
            const recencyWeight = computeRecencyWeight(candidate.updatedAt);
            return {
                candidate,
                score: clamp01(ngram * 0.4 + memoryWeight * 0.3 + recencyWeight * 0.3),
                breakdown: {
                    bm25: 0,
                    ngram,
                    editDistance: 0,
                    memoryWeight,
                    recencyWeight,
                    graphBoost: 0,
                },
            };
        }).sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score);

        const topItems = scored.slice(0, maxSupplementPerFacet);
        addedCounts[facet] = topItems.length;
        for (const item of topItems) {
            existingIds.add(item.candidate.candidateId);
            supplements.push(item);
        }
        if (topItems.length > 0) {
            emitCoverageTrace(onTrace, '补召回完成', `二次补召回完成，新增 ${topItems.length} 条 ${facet} 候选。`, {
                facet,
                addedCount: topItems.length,
            });
        }
    }

    return {
        items: [...currentResults, ...supplements],
        triggeredFacets: facetsToSupplement,
        subQueries,
        addedCounts,
    };
}

/**
 * 功能：根据 facet 和锚点构建子查询文本。
 * @param facet 目标 facet。
 * @param originalQuery 原始查询。
 * @param contextRoute 语境路由。
 * @returns facet 子查询文本。
 */
function buildFacetSubQuery(facet: RetrievalFacet, originalQuery: string, contextRoute: RetrievalContextRoute): string {
    const parts: string[] = [];
    if (facet === 'relationship') {
        if (contextRoute.entityAnchors.actorKeys.length > 0) {
            parts.push(contextRoute.entityAnchors.actorKeys.slice(0, 3).join(' '));
        }
        if (contextRoute.entityAnchors.relationKeys.length > 0) {
            parts.push(contextRoute.entityAnchors.relationKeys.slice(0, 2).join(' '));
        }
        const relHints = contextRoute.topicHints.filter((hint: string): boolean => {
            return hint.includes('冲突') || hint.includes('修复') || hint.includes('关系');
        });
        if (relHints.length > 0) {
            parts.push(relHints.slice(0, 2).join(' '));
        }
    }
    if (facet === 'scene') {
        if (contextRoute.entityAnchors.locationKeys.length > 0) {
            parts.push(contextRoute.entityAnchors.locationKeys.slice(0, 2).join(' '));
        }
        const sceneHints = contextRoute.topicHints.filter((hint: string): boolean => {
            return hint.includes('场景') || hint.includes('地点') || hint.includes('这里') || hint.includes('那里');
        });
        if (sceneHints.length > 0) {
            parts.push(sceneHints.slice(0, 2).join(' '));
        }
    }
    if (facet === 'world') {
        if (contextRoute.entityAnchors.worldKeys.length > 0) {
            parts.push(contextRoute.entityAnchors.worldKeys.slice(0, 3).join(' '));
        }
        const worldHints = contextRoute.topicHints.filter((hint: string): boolean => {
            return hint.includes('规则') || hint.includes('设定') || hint.includes('禁令');
        });
        if (worldHints.length > 0) {
            parts.push(worldHints.slice(0, 2).join(' '));
        }
    }
    return parts.length > 0 ? parts.join(' ') : originalQuery;
}

/**
 * 功能：触发补召回日志。
 * @param onTrace trace 回调。
 * @param title 标题。
 * @param message 消息。
 * @param payload 负载。
 * @returns 无返回值。
 */
function emitCoverageTrace(
    onTrace: ((record: MemoryDebugLogRecord) => void) | undefined,
    title: string,
    message: string,
    payload?: Record<string, unknown>,
): void {
    onTrace?.({
        ts: Date.now(),
        level: 'info',
        stage: 'coverage',
        title,
        message,
        payload,
    });
}
