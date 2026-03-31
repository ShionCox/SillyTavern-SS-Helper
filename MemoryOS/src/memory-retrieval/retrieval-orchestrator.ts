import type {
    RetrievalCandidate,
    RetrievalContextRoute,
    RetrievalDiagnostics,
    RetrievalFacet,
    RetrievalOrchestratorResult,
    RetrievalQuery,
    RetrievalResultItem,
} from './types';
import type { RecallConfig } from './recall-config';
import type { ActorProfileForDictionary, RecentContextBias } from './context-router';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import { LexicalRetrievalProvider } from './lexical-provider';
import { routeRetrievalContext, buildContextDictionaryFromCandidates } from './context-router';
import { expandFromSeeds } from './graph-expander';
import { applyCoverageSecondPass } from './coverage-checker';
import { pruneForDiversity } from './diversity-pruner';
import { clearMemoryTrace, recordMemoryDebug } from '../core/debug/memory-retrieval-logger';
import { buildDefaultRecallConfig } from './recall-config';

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
    const facetPrioritySchemas: Record<RetrievalFacet, string[]> = {
        world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
        scene: ['scene_shared_state', 'location'],
        relationship: ['actor_private_interpretation'],
        event: ['event', 'actor_visible_event'],
        interpretation: ['actor_private_interpretation'],
        organization_politics: ['organization', 'nation', 'city', 'location'],
    };

    let candidateTypes: string[] | undefined;
    let boostSchemaIds: string[] | undefined;
    if (topFacet && route.confidence >= 0.4 && route.facets.length <= 2) {
        boostSchemaIds = [];
        for (const facet of route.facets) {
            boostSchemaIds.push(...(facetPrioritySchemas[facet] ?? []));
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
 * 功能：检索编排器。
 * 说明：当前仅负责基础 lexical 编排、图扩展、覆盖补召回和多样性裁剪。
 */
export class RetrievalOrchestrator {
    private readonly lexicalProvider: LexicalRetrievalProvider;

    constructor(lexicalProvider?: LexicalRetrievalProvider) {
        this.lexicalProvider = lexicalProvider ?? new LexicalRetrievalProvider();
    }

    /**
     * 功能：检查向量 provider 是否可用。
     * @returns 始终返回 false，向量链已迁移至 HybridRetrievalService。
     */
    public isVectorProviderAvailable(): boolean {
        return false;
    }

    /**
     * 功能：获取向量 provider 不可用原因。
     * @returns 说明文案。
     */
    public getVectorUnavailableReason(): string | null {
        return '向量链已迁移至 HybridRetrievalService';
    }

    /**
     * 功能：执行基础检索编排。
     * @param query 检索请求。
     * @param candidates 候选记录。
     * @param config 召回配置。
     * @param options 附加上下文。
     * @returns 检索结果与诊断。
     */
    public async retrieve(
        query: RetrievalQuery,
        candidates: RetrievalCandidate[],
        config?: RecallConfig,
        options: RetrievalOrchestratorOptions = {},
    ): Promise<RetrievalOrchestratorResult> {
        const effectiveConfig = config ?? buildDefaultRecallConfig();
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
            return this.buildEmptyResult(normalizedQuery, effectiveConfig, traceRecords);
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

        if (effectiveConfig.retrievalMode === 'vector_only') {
            writeTrace({
                ts: Date.now(),
                level: 'info',
                stage: 'seed',
                title: '向量主链外移',
                message: 'vector_only 模式下编排器仅负责语境路由与词法基线，不再执行向量检索。',
                payload: {
                    retrievalMode: effectiveConfig.retrievalMode,
                },
            });
        }

        const seeds = await this.lexicalProvider.search(seedQuery, candidates, effectiveConfig.payloadFilter);
        const actualProviderId = seeds.length > 0 ? this.lexicalProvider.providerId : 'none';

        writeTrace({
            ts: Date.now(),
            level: 'info',
            stage: 'seed',
            title: '实际检索器',
            message: `实际使用检索器：词法检索（模式：${effectiveConfig.retrievalMode}）。`,
            payload: {
                providerId: actualProviderId,
                retrievalMode: effectiveConfig.retrievalMode,
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
                diagnostics: this.buildDiagnostics({
                    contextRoute,
                    retrievalMode: effectiveConfig.retrievalMode,
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
                }),
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

        let expandedItems = seeds;
        let expandedCount = seeds.length;

        if (effectiveConfig.enableGraphExpansion && effectiveConfig.expandDepth > 0) {
            const expandedResult = expandFromSeeds({
                seeds,
                allCandidates: candidates,
                maxDepth: effectiveConfig.expandDepth,
                decay: 0.65,
                contextRoute,
                onTrace: writeTrace,
            });
            expandedItems = expandedResult.items;
            expandedCount = expandedResult.items.length;
        } else {
            writeTrace({
                ts: Date.now(),
                level: 'info',
                stage: 'graph',
                title: '跳过扩散',
                message: '图扩展已禁用或深度为 0，跳过图扩散阶段。',
                payload: {
                    enableGraphExpansion: effectiveConfig.enableGraphExpansion,
                    expandDepth: effectiveConfig.expandDepth,
                },
            });
        }

        const coverageResult = applyCoverageSecondPass({
            currentResults: expandedItems,
            allCandidates: candidates,
            contextRoute,
            query: normalizedQuery,
            maxSupplementPerFacet: 3,
            onTrace: writeTrace,
        });

        let finalItems = coverageResult.items;
        let diversityDroppedCount = 0;

        if (effectiveConfig.enableDiversity) {
            const diversityResult = pruneForDiversity({
                items: coverageResult.items,
                maxChars: query.budget.maxChars ?? 8000,
                maxCandidates: query.budget.maxCandidates ?? 40,
                onTrace: writeTrace,
            });
            finalItems = diversityResult.items;
            diversityDroppedCount = coverageResult.items.length - diversityResult.items.length;
        }

        if (effectiveConfig.minScore > 0) {
            finalItems = finalItems.filter((item: RetrievalResultItem): boolean => item.score >= effectiveConfig.minScore);
        }

        const diagnostics = this.buildDiagnostics({
            contextRoute,
            retrievalMode: effectiveConfig.retrievalMode,
            seedProviderId: actualProviderId,
            seedCount,
            expandedCount,
            coverageTriggeredFacets: coverageResult.triggeredFacets,
            diversityDroppedCount,
            finalCount: finalItems.length,
            seedQueryText: seedQuery.query,
            boostSchemaIds: routeHints.boostSchemaIds ?? [],
            coverageSubQueries: coverageResult.subQueries,
            traceRecords,
        });

        return {
            providerId: actualProviderId,
            contextRoute,
            items: finalItems,
            diagnostics,
        };
    }

    /**
     * 功能：构建空结果。
     * @param query 查询文本。
     * @param config 配置。
     * @param traceRecords Trace 记录。
     * @returns 空结果。
     */
    private buildEmptyResult(
        query: string,
        config: RecallConfig,
        traceRecords: MemoryDebugLogRecord[],
    ): RetrievalOrchestratorResult {
        return {
            providerId: 'none',
            contextRoute: null,
            items: [],
            diagnostics: this.buildDiagnostics({
                contextRoute: null,
                retrievalMode: config.retrievalMode,
                seedProviderId: 'none',
                seedCount: 0,
                expandedCount: 0,
                coverageTriggeredFacets: [],
                diversityDroppedCount: 0,
                finalCount: 0,
                seedQueryText: query,
                boostSchemaIds: [],
                coverageSubQueries: {},
                traceRecords,
            }),
        };
    }

    /**
     * 功能：构建诊断信息。
     * @param base 基础诊断。
     * @returns 完整诊断。
     */
    private buildDiagnostics(base: Omit<RetrievalDiagnostics, 'vectorProviderAvailable' | 'vectorUnavailableReason'>): RetrievalDiagnostics {
        return {
            ...base,
            vectorProviderAvailable: false,
            vectorUnavailableReason: '向量链已迁移至 HybridRetrievalService',
        };
    }
}
