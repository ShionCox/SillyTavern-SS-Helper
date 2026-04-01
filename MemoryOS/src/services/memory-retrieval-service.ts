import type { MemoryRetrievalInput, PromptRecallInput, TakeoverRecallInput, WorkbenchRecallInput } from '../memory-retrieval/retrieval-input';
import type { MemoryRetrievalOutput, RetrievalOutputDiagnostics, VectorProviderStatus, ResultSourceLabel } from '../memory-retrieval/retrieval-output';
import type { RetrievalCandidate, RetrievalFacet } from '../memory-retrieval/types';
import type { RecallConfig } from '../memory-retrieval/recall-config';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import { buildDefaultRecallConfig, mergeRecallConfig } from '../memory-retrieval/recall-config';
import { applyPayloadFilter } from '../memory-retrieval/payload-filter';
import { RetrievalOrchestrator } from '../memory-retrieval/retrieval-orchestrator';
import { readMemoryOSSettings } from '../settings/store';
import { HybridRetrievalService } from './hybrid-retrieval-service';
import { buildQueryContextBundle } from './query-context-builder';

/**
 * 功能：全系统统一检索入口服务。
 * 说明：所有模块（Prompt、Takeover、Workbench 等）均通过此服务发起检索，
 *       不再各自拼装检索逻辑。
 *       第二阶段集成 HybridRetrievalService，在 vector_only / hybrid 模式下
 *       接入向量策略路由与重排序。
 */
export class MemoryRetrievalService {
    private readonly orchestrator: RetrievalOrchestrator;
    private hybridService: HybridRetrievalService | null = null;

    constructor(orchestrator?: RetrievalOrchestrator) {
        this.orchestrator = orchestrator ?? new RetrievalOrchestrator();
    }

    /**
     * 功能：注入混合检索服务。
     * @param service HybridRetrievalService。
     */
    setHybridService(service: HybridRetrievalService): void {
        this.hybridService = service;
    }

    /**
     * 功能：获取 HybridRetrievalService 实例。
     */
    getHybridService(): HybridRetrievalService | null {
        return this.hybridService;
    }

    /**
     * 功能：通用混合检索入口。
     * @param input 统一检索输入。
     * @returns 统一检索输出。
     */
    async searchHybrid(input: MemoryRetrievalInput): Promise<MemoryRetrievalOutput> {
        const settings = readMemoryOSSettings();
        const baseConfig = buildDefaultRecallConfig();
        baseConfig.retrievalMode = settings.retrievalMode;
        baseConfig.topK = settings.retrievalDefaultTopK;
        baseConfig.expandDepth = settings.retrievalDefaultExpandDepth;
        baseConfig.enableGraphExpansion = settings.retrievalEnableGraphPenalty;

        const config = mergeRecallConfig(baseConfig, input.recallConfig);

        if (config.payloadFilter || settings.retrievalEnablePayloadFilter) {
            config.payloadFilter = config.payloadFilter ?? {};
        }

        const filteredCandidates = applyPayloadFilter(input.candidates, config.payloadFilter);

        // 先通过 orchestrator 跑基础管线（种子 -> 图扩展 -> 补召回 -> 多样性裁剪）
        const lexicalMode: RetrievalMode = config.retrievalMode === 'lexical_only' ? 'lexical_only' : 'hybrid';
        const result = await this.orchestrator.retrieve(
            {
                query: input.query,
                chatKey: input.chatKey,
                rulePackMode: input.rulePackMode ?? settings.retrievalRulePack,
                budget: {
                    maxCandidates: config.topK,
                    maxChars: input.maxChars ?? Math.max(2600, settings.contextMaxTokens * 4),
                },
            },
            filteredCandidates,
            {
                ...config,
                retrievalMode: lexicalMode,
            },
            {
                actorProfiles: input.actorProfiles,
                recentContext: input.recentContext,
                onTrace: (record): void => {
                    input.onProgress?.({
                        stage: `trace_${String(record.stage ?? '').trim() || 'unknown'}`,
                        title: String(record.title ?? '').trim() || '检索处理中',
                        message: String(record.message ?? '').trim() || '正在执行检索主链。',
                    });
                },
            },
        );

        // 如果是 vector_only 或 hybrid 且混合检索服务存在，走向量增强链路
        const needsVectorChain = (config.retrievalMode === 'vector_only' || config.retrievalMode === 'hybrid')
            && this.hybridService !== null;

        let finalItems = result.items;
        let vectorProviderAvailable = this.orchestrator.isVectorProviderAvailable();
        let vectorUnavailableReason = this.orchestrator.getVectorUnavailableReason();
        let resultSourceLabels: ResultSourceLabel[];
        let finalProviderId = result.providerId;
        let strategyDecision = null as RetrievalOutputDiagnostics['strategyDecision'];
        let vectorHitCount = 0;
        let mergeUsed = false;
        let hybridRerankUsed = false;
        let hybridRerankReasonCodes: string[] = [];
        let hybridRerankSource: 'none' | 'rule' | 'llmhub' = 'none';

        if (needsVectorChain && this.hybridService) {
            const queryContext = settings.retrievalEnableQueryContextBuilder
                ? buildQueryContextBundle({
                    query: input.query,
                    knownActorKeys: result.contextRoute?.entityAnchors?.actorKeys,
                    knownRelationKeys: result.contextRoute?.entityAnchors?.relationKeys,
                    knownWorldKeys: result.contextRoute?.entityAnchors?.worldKeys,
                })
                : undefined;

            const hybridResult = await this.hybridService.search({
                retrievalMode: config.retrievalMode,
                query: input.query,
                chatKey: input.chatKey ?? '',
                candidates: filteredCandidates,
                lexicalResults: result.items,
                queryContext,
                contextRoute: result.contextRoute,
                overrideFinalTopK: settings.vectorFinalTopK,
                onProgress: input.onProgress,
            });

            finalItems = hybridResult.items;
            finalProviderId = hybridResult.finalProviderId;
            strategyDecision = hybridResult.strategyDecision;
            vectorHitCount = hybridResult.vectorHits.length;
            mergeUsed = hybridResult.mergeUsed;
            vectorProviderAvailable = hybridResult.vectorAvailable;
            vectorUnavailableReason = hybridResult.vectorUnavailableReason;
            hybridRerankUsed = hybridResult.rerankUsed;
            hybridRerankReasonCodes = hybridResult.rerankReasonCodes;
            hybridRerankSource = hybridResult.rerankSource;

            // 标注来源
            const vectorHitIds = new Set(hybridResult.vectorHits.map((h) => h.sourceId));
            resultSourceLabels = finalItems.map((item) => {
                const cid = item.candidate.candidateId || item.candidate.entryId;
                if (vectorHitIds.has(item.candidate.entryId) || vectorHitIds.has(cid)) {
                    if ((item.breakdown.bm25 ?? 0) > 0) {
                        return { candidateId: cid, source: 'lexical' as const };
                    }
                    return { candidateId: cid, source: 'vector' as const };
                }
                if ((item.breakdown.graphBoost ?? 0) > 0 && item.breakdown.bm25 === 0) {
                    return { candidateId: cid, source: 'graph_expansion' as const };
                }
                return { candidateId: cid, source: 'lexical' as const };
            });
        } else {
            resultSourceLabels = result.items.map((item) => ({
                candidateId: item.candidate.candidateId,
                source: (item.breakdown.graphBoost ?? 0) > 0 && item.breakdown.bm25 === 0
                    ? 'graph_expansion' as const
                    : 'lexical' as const,
            }));
        }

        const vectorProviderStatus: VectorProviderStatus = {
            available: vectorProviderAvailable,
            unavailableReason: vectorUnavailableReason,
            requestedByMode: config.retrievalMode === 'vector_only' || config.retrievalMode === 'hybrid',
        };

        const diagnostics: RetrievalOutputDiagnostics = {
            contextRoute: result.contextRoute,
            retrievalMode: config.retrievalMode,
            seedProviderId: result.diagnostics?.seedProviderId ?? 'none',
            seedCount: result.diagnostics?.seedCount ?? 0,
            expandedCount: result.diagnostics?.expandedCount ?? 0,
            coverageTriggeredFacets: (result.diagnostics?.coverageTriggeredFacets ?? []) as RetrievalFacet[],
            diversityDroppedCount: result.diagnostics?.diversityDroppedCount ?? 0,
            finalCount: finalItems.length,
            seedQueryText: result.diagnostics?.seedQueryText ?? input.query,
            boostSchemaIds: result.diagnostics?.boostSchemaIds ?? [],
            coverageSubQueries: result.diagnostics?.coverageSubQueries ?? {},
            traceRecords: result.diagnostics?.traceRecords ?? [],
            finalProviderId,
            vectorProviderStatus,
            resultSourceLabels,
            strategyDecision,
            vectorHitCount,
            mergeUsed,
            rerankUsed: hybridRerankUsed,
            rerankReasonCodes: hybridRerankReasonCodes,
            rerankSource: hybridRerankSource,
        };

        return {
            items: finalItems,
            retrievalMode: config.retrievalMode,
            providerId: finalProviderId,
            contextRoute: result.contextRoute,
            diagnostics,
        };
    }

    /**
     * 功能：Prompt 场景检索入口。
     * @param input Prompt 检索输入。
     * @returns 统一检索输出。
     */
    async searchForPrompt(input: PromptRecallInput): Promise<MemoryRetrievalOutput> {
        return this.searchHybrid({
            query: input.query,
            chatKey: input.chatKey,
            candidates: input.candidates,
            rulePackMode: input.rulePackMode,
            actorProfiles: input.actorProfiles,
            recentContext: input.recentContext,
            maxChars: input.maxChars,
            recallConfig: {
                topK: input.maxCandidates,
                payloadFilter: input.payloadFilter,
            },
        });
    }

    /**
     * 功能：Takeover 场景检索入口。
     * @param input Takeover 检索输入。
     * @returns 统一检索输出。
     */
    async searchForTakeover(input: TakeoverRecallInput): Promise<MemoryRetrievalOutput> {
        return this.searchHybrid({
            query: input.query,
            chatKey: input.chatKey,
            candidates: input.candidates,
            recallConfig: {
                topK: input.maxCandidates,
                payloadFilter: input.payloadFilter,
                enableGraphExpansion: false,
            },
        });
    }

    /**
     * 功能：Workbench 场景检索入口。
     * @param input Workbench 检索输入。
     * @returns 统一检索输出。
     */
    async searchForWorkbench(input: WorkbenchRecallInput): Promise<MemoryRetrievalOutput> {
        return this.searchHybrid({
            query: input.query,
            chatKey: input.chatKey,
            candidates: input.candidates,
            recallConfig: {
                topK: input.maxCandidates,
                payloadFilter: input.payloadFilter,
            },
        });
    }
}
