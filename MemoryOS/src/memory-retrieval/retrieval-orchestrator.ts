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
import type { RecallConfig } from './recall-config';
import type { ActorProfileForDictionary, RecentContextBias } from './context-router';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import { LexicalRetrievalProvider } from './lexical-provider';
import { EmbeddingRetrievalProvider } from './embedding-provider';
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
    const FACET_PRIORITY_SCHEMAS: Record<RetrievalFacet, string[]> = {
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
 * 说明：支持 lexical_only / vector_only / hybrid 三态模式。
 */
export class RetrievalOrchestrator {
    private readonly lexicalProvider: LexicalRetrievalProvider;
    private readonly embeddingProvider: EmbeddingRetrievalProvider;

    /**
     * 功能：初始化检索编排器。
     * @param lexicalProvider 可选词法 provider。
     * @param embeddingProvider 可选 embedding provider。
     */
    constructor(
        lexicalProvider?: LexicalRetrievalProvider,
        embeddingProvider?: EmbeddingRetrievalProvider,
    ) {
        this.lexicalProvider = lexicalProvider ?? new LexicalRetrievalProvider();
        this.embeddingProvider = embeddingProvider ?? new EmbeddingRetrievalProvider();
    }

    /**
     * 功能：获取 embedding provider 实例（用于外部注入服务依赖）。
     */
    public getEmbeddingProvider(): EmbeddingRetrievalProvider {
        return this.embeddingProvider;
    }

    /**
     * 功能：检查向量 provider 是否可用。
     * @returns 是否可用。
     */
    public isVectorProviderAvailable(): boolean {
        return this.embeddingProvider.isAvailable();
    }

    /**
     * 功能：获取向量 provider 不可用原因。
     * @returns 不可用原因。
     */
    public getVectorUnavailableReason(): string | null {
        return this.embeddingProvider.getUnavailableReason();
    }

    /**
     * 功能：执行完整多阶段混合召回。
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

        let seeds: RetrievalResultItem[] = [];
        let actualProviderId = 'none';

        switch (effectiveConfig.retrievalMode) {
            case 'vector_only': {
                if (this.embeddingProvider.isAvailable()) {
                    seeds = await this.embeddingProvider.search(seedQuery, candidates);
                    if (seeds.length > 0) {
                        actualProviderId = this.embeddingProvider.providerId;
                    }
                } else {
                    writeTrace({
                        ts: Date.now(),
                        level: 'warn',
                        stage: 'seed',
                        title: '向量不可用',
                        message: `vector_only 模式下向量 provider 不可用：${this.embeddingProvider.getUnavailableReason() ?? '未知原因'}。不会 fallback 至词法检索。`,
                        payload: {
                            unavailableReason: this.embeddingProvider.getUnavailableReason(),
                        },
                    });
                }
                break;
            }
            case 'hybrid': {
                if (this.embeddingProvider.isAvailable()) {
                    seeds = await this.embeddingProvider.search(seedQuery, candidates);
                    if (seeds.length > 0) {
                        actualProviderId = this.embeddingProvider.providerId;
                    }
                } else {
                    writeTrace({
                        ts: Date.now(),
                        level: 'info',
                        stage: 'seed',
                        title: '向量未就绪',
                        message: `hybrid 模式下向量 provider 不可用，仅使用词法链路：${this.embeddingProvider.getUnavailableReason() ?? '未知原因'}。`,
                        payload: {
                            unavailableReason: this.embeddingProvider.getUnavailableReason(),
                        },
                    });
                }
                if (seeds.length <= 0) {
                    seeds = await this.lexicalProvider.search(seedQuery, candidates, effectiveConfig.payloadFilter);
                    if (seeds.length > 0) {
                        actualProviderId = this.lexicalProvider.providerId;
                    }
                }
                break;
            }
            case 'lexical_only':
            default: {
                seeds = await this.lexicalProvider.search(seedQuery, candidates, effectiveConfig.payloadFilter);
                if (seeds.length > 0) {
                    actualProviderId = this.lexicalProvider.providerId;
                }
                break;
            }
        }

        writeTrace({
            ts: Date.now(),
            level: 'info',
            stage: 'seed',
            title: '实际检索器',
            message: `实际使用检索器：${resolveProviderLabel(actualProviderId)}（模式：${effectiveConfig.retrievalMode}）。`,
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
     * 功能：构建诊断信息，附带向量 provider 状态。
     */
    private buildDiagnostics(base: Omit<RetrievalDiagnostics, 'vectorProviderAvailable' | 'vectorUnavailableReason'>): RetrievalDiagnostics {
        return {
            ...base,
            vectorProviderAvailable: this.embeddingProvider.isAvailable(),
            vectorUnavailableReason: this.embeddingProvider.getUnavailableReason(),
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
