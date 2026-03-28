import type {
    RetrievalCandidate,
    RetrievalContextRoute,
    RetrievalDiagnostics,
    RetrievalFacet,
    RetrievalOrchestratorResult,
    RetrievalProvider,
    RetrievalQuery,
    RetrievalResultItem,
} from './types';
import type { ActorProfileForDictionary, RecentContextBias } from './context-router';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import { LexicalRetrievalProvider } from './lexical-provider';
import { EmbeddingRetrievalProvider } from './embedding-provider';
import { routeRetrievalContext, buildContextDictionaryFromCandidates } from './context-router';
import { expandFromSeeds } from './graph-expander';
import { applyCoverageSecondPass } from './coverage-checker';
import { pruneForDiversity } from './diversity-pruner';
import { clearMemoryTrace, recordMemoryDebug } from '../core/debug/memory-retrieval-logger';

/**
 * 功能：检索编排附加上下文。
 */
export interface RetrievalOrchestratorOptions {
    actorProfiles?: ActorProfileForDictionary[];
    recentContext?: RecentContextBias;
}

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
    const FACET_PRIORITY_SCHEMAS: Record<RetrievalFacet, string[]> = {
        world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
        scene: ['scene_shared_state', 'location'],
        relationship: ['relationship', 'actor_profile'],
        event: ['event', 'actor_visible_event'],
        interpretation: ['actor_private_interpretation'],
    };

    let candidateTypes: string[] | undefined;
    let boostSchemaIds: string[] | undefined;
    if (topFacet && route.confidence >= 0.4 && route.facets.length <= 2) {
        boostSchemaIds = [];
        for (const facet of route.facets) {
            boostSchemaIds.push(...(FACET_PRIORITY_SCHEMAS[facet] ?? []));
        }
    }

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
     * @param options 附加上下文。
     * @returns 检索结果与诊断。
     */
    public async retrieve(
        query: RetrievalQuery,
        candidates: RetrievalCandidate[],
        options: RetrievalOrchestratorOptions = {},
    ): Promise<RetrievalOrchestratorResult> {
        const normalizedQuery = String(query.query ?? '').trim();
        const chatKey = String(query.chatKey ?? '').trim() || undefined;
        const traceRecords: MemoryDebugLogRecord[] = [];
        const writeTrace = (record: MemoryDebugLogRecord): void => {
            const normalized = recordMemoryDebug(chatKey, record);
            traceRecords.push(normalized);
        };

        if (chatKey) {
            clearMemoryTrace(chatKey);
        }
        if (!normalizedQuery || candidates.length <= 0) {
            return {
                providerId: 'none',
                contextRoute: null,
                items: [],
                diagnostics: {
                    contextRoute: null,
                    seedProviderId: 'none',
                    seedCount: 0,
                    expandedCount: 0,
                    coverageTriggeredFacets: [],
                    diversityDroppedCount: 0,
                    finalCount: 0,
                    seedQueryText: normalizedQuery,
                    boostSchemaIds: [],
                    coverageSubQueries: {},
                    traceRecords,
                },
            };
        }

        const dictionaries = buildContextDictionaryFromCandidates(candidates, options.actorProfiles);
        const contextRoute = routeRetrievalContext(
            normalizedQuery,
            candidates,
            dictionaries,
            options.recentContext,
            {
                rulePackMode: query.rulePackMode ?? 'hybrid',
                onTrace: writeTrace,
            },
        );

        const routeHints = buildSeedQueryFromRoute(normalizedQuery, contextRoute);
        const seedQuery: RetrievalQuery = {
            ...query,
            query: routeHints.queryText,
            candidateTypes: routeHints.candidateTypes ?? query.candidateTypes,
            budget: { ...query.budget, maxCandidates: Math.max(30, query.budget.maxCandidates ?? 30) },
        };

        if (routeHints.queryText !== normalizedQuery) {
            writeTrace({
                ts: Date.now(),
                level: 'info',
                stage: 'seed',
                title: '改写查询',
                message: `已根据情境路由改写检索查询，追加 ${routeHints.queryText.replace(normalizedQuery, '').trim().split(/\s+/).filter(Boolean).length} 个锚点词。`,
                payload: {
                    originalQuery: normalizedQuery,
                    queryText: routeHints.queryText,
                },
            });
        }
        if ((routeHints.boostSchemaIds ?? []).length > 0) {
            writeTrace({
                ts: Date.now(),
                level: 'info',
                stage: 'seed',
                title: '优先类型',
                message: `当前优先 schema：${routeHints.boostSchemaIds?.slice(0, 6).join('、') ?? '暂无'}。`,
                payload: {
                    boostSchemaIds: routeHints.boostSchemaIds,
                },
            });
        }

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

        writeTrace({
            ts: Date.now(),
            level: 'info',
            stage: 'seed',
            title: '实际检索器',
            message: `实际使用检索器：${resolveProviderLabel(actualProviderId)}。`,
            payload: {
                providerId: actualProviderId,
                seedQueryText: seedQuery.query,
            },
        });

        if (routeHints.boostSchemaIds && routeHints.boostSchemaIds.length > 0 && seeds.length > 0) {
            const boostSet = new Set(routeHints.boostSchemaIds);
            for (const item of seeds) {
                if (boostSet.has(item.candidate.schemaId)) {
                    item.score = Math.min(1, item.score * 1.08);
                }
            }
            seeds.sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score);
        }

        const seedCount = seeds.length;
        if (seeds.length <= 0) {
            writeTrace({
                ts: Date.now(),
                level: 'warn',
                stage: 'seed',
                title: '未命中种子',
                message: '第一轮种子召回未命中任何候选。', 
                payload: {
                    queryText: seedQuery.query,
                },
            });
            return {
                providerId: actualProviderId,
                contextRoute,
                items: [],
                diagnostics: {
                    contextRoute,
                    seedProviderId: actualProviderId,
                    seedCount,
                    expandedCount: 0,
                    coverageTriggeredFacets: [],
                    diversityDroppedCount: 0,
                    finalCount: 0,
                    seedQueryText: seedQuery.query,
                    boostSchemaIds: routeHints.boostSchemaIds ?? [],
                    coverageSubQueries: {},
                    traceRecords,
                },
            };
        }

        writeTrace({
            ts: Date.now(),
            level: 'info',
            stage: 'seed',
            title: '种子完成',
            message: `第一轮种子召回完成，共命中 ${seedCount} 条候选。`,
            payload: {
                seedCount,
            },
        });

        const expandedResult = expandFromSeeds({
            seeds,
            allCandidates: candidates,
            maxDepth: 1,
            decay: 0.65,
            contextRoute,
            onTrace: writeTrace,
        });

        const coverageResult = applyCoverageSecondPass({
            currentResults: expandedResult.items,
            allCandidates: candidates,
            contextRoute,
            query: normalizedQuery,
            maxSupplementPerFacet: 3,
            onTrace: writeTrace,
        });

        const diversityResult = pruneForDiversity({
            items: coverageResult.items,
            maxChars: query.budget.maxChars ?? 8000,
            maxCandidates: query.budget.maxCandidates ?? 40,
            onTrace: writeTrace,
        });

        const diagnostics: RetrievalDiagnostics = {
            contextRoute,
            seedProviderId: actualProviderId,
            seedCount,
            expandedCount: expandedResult.items.length,
            coverageTriggeredFacets: coverageResult.triggeredFacets,
            diversityDroppedCount: coverageResult.items.length - diversityResult.items.length,
            finalCount: diversityResult.items.length,
            seedQueryText: seedQuery.query,
            boostSchemaIds: routeHints.boostSchemaIds ?? [],
            coverageSubQueries: coverageResult.subQueries,
            traceRecords,
        };

        return {
            providerId: actualProviderId,
            contextRoute,
            items: diversityResult.items,
            diagnostics,
        };
    }
}

/**
 * 功能：把 provider 标识转换为中文名称。
 * @param providerId provider 标识。
 * @returns 中文名称。
 */
function resolveProviderLabel(providerId: string): string {
    if (providerId === 'lexical_bm25') {
        return '词法检索';
    }
    if (providerId === 'embedding_vector') {
        return '向量检索';
    }
    if (providerId === 'none') {
        return '未命中';
    }
    return providerId || '未知检索器';
}
