import type { MemoryRetrievalInput, PromptRecallInput, TakeoverRecallInput, WorkbenchRecallInput } from '../memory-retrieval/retrieval-input';
import type {
    MemoryRetrievalOutput,
    RetrievalOutputDiagnostics,
    VectorProviderStatus,
    ResultSourceLabel,
    RetrievalVectorTopHit,
    RetrievalStageRankingItem,
    RetrievalRankingChangeItem,
} from '../memory-retrieval/retrieval-output';
import type { RetrievalCandidate, RetrievalFacet } from '../memory-retrieval/types';
import type { QueryTimeIntent } from '../memory-time/time-ranking';
import type { RecallConfig } from '../memory-retrieval/recall-config';
import type { EffectiveRetrievalMode, RetrievalMode } from '../memory-retrieval/retrieval-mode';
import { buildDefaultRecallConfig, mergeRecallConfig } from '../memory-retrieval/recall-config';
import { applyPayloadFilter } from '../memory-retrieval/payload-filter';
import { RetrievalOrchestrator } from '../memory-retrieval/retrieval-orchestrator';
import { projectMemoryRetentionCore } from '../core/memory-retention-core';
import { resolveSemanticKindLabel } from '../core/memory-semantic';
import { readMemoryOSSettings, resolveMemoryStrategySettings, resolveRetrievalEnableQueryContextBuilder } from '../settings/store';
import { HybridRetrievalService } from './hybrid-retrieval-service';
import { buildQueryContextBundle } from './query-context-builder';
import { estimateXmlNarrativeRetrievalMaxChars } from '../memory-injection/xml-markdown-renderer';
import { applyWorldStrategyToResultItems, applyWorldStrategyToRetrievalCandidates } from './world-strategy-service';

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
        const settings = resolveMemoryStrategySettings(readMemoryOSSettings());
        const baseConfig = buildDefaultRecallConfig();
        baseConfig.retrievalMode = settings.retrievalMode;
        baseConfig.topK = settings.retrievalDefaultTopK;
        baseConfig.expandDepth = settings.retrievalDefaultExpandDepth;
        baseConfig.enableGraphExpansion = settings.retrievalEnableGraphExpansion;
        baseConfig.enableGraphPenalty = settings.retrievalEnableGraphPenalty;

        const config = mergeRecallConfig(baseConfig, input.recallConfig);
        const effectiveRetrievalMode = await this.resolveEffectiveRetrievalMode(config.retrievalMode, input.chatKey ?? '');
        config.retrievalMode = effectiveRetrievalMode;

        if (config.payloadFilter || settings.retrievalEnablePayloadFilter) {
            config.payloadFilter = config.payloadFilter ?? {};
        }

        const filteredCandidates = applyWorldStrategyToRetrievalCandidates(this.applyForgettingAwareRecallPolicy(
            input.query,
            applyPayloadFilter(input.candidates, config.payloadFilter),
        ), input.worldStrategy);

        // 先通过 orchestrator 跑基础管线（种子 -> 图扩展 -> 补召回 -> 多样性裁剪）
        const lexicalMode: RetrievalMode = config.retrievalMode === 'lexical_only' ? 'lexical_only' : 'hybrid';
        const result = await this.orchestrator.retrieve(
            {
                query: input.query,
                chatKey: input.chatKey,
                rulePackMode: input.rulePackMode ?? settings.retrievalRulePack,
                budget: {
                    maxCandidates: config.topK,
                    maxChars: input.maxChars ?? estimateXmlNarrativeRetrievalMaxChars(
                        settings.injectionCustomBudgetEnabled ? {
                            timelineMaxItems: settings.timelineMaxItems,
                            worldBaseMaxItems: settings.worldBaseMaxItems,
                            sceneActiveMaxItems: settings.sceneActiveMaxItems,
                            sceneRecentMaxItems: settings.sceneRecentMaxItems,
                            entityMaxItems: settings.entityMaxItems,
                            identityMaxItems: settings.identityMaxItems,
                            relationshipMaxItems: settings.relationshipMaxItems,
                            eventMaxItems: settings.eventMaxItems,
                            shadowEventMaxItems: settings.shadowEventMaxItems,
                            interpretationMaxItems: settings.interpretationMaxItems,
                        } : {},
                    ),
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
        let vectorTopHits: RetrievalVectorTopHit[] = [];
        let lexicalRanking: RetrievalStageRankingItem[] = [];
        let mergedRanking: RetrievalStageRankingItem[] = [];
        let rerankedRanking: RetrievalStageRankingItem[] = [];
        let rankingChanges: RetrievalRankingChangeItem[] = [];
        let timeBiasedCount = 0;
        let queryTimeIntent: QueryTimeIntent = 'none';

        if (needsVectorChain && this.hybridService) {
            const enableQueryContextBuilder = resolveRetrievalEnableQueryContextBuilder(config.retrievalMode);
            const queryContext = enableQueryContextBuilder
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

            finalItems = applyWorldStrategyToResultItems(hybridResult.items, input.worldStrategy);
            finalItems = this.applyShadowFinalCap(finalItems, settings.retentionShadowMaxFinalItems);
            finalProviderId = hybridResult.finalProviderId;
            strategyDecision = hybridResult.strategyDecision;
            vectorHitCount = hybridResult.vectorHits.length;
            mergeUsed = hybridResult.mergeUsed;
            vectorProviderAvailable = hybridResult.vectorAvailable;
            vectorUnavailableReason = hybridResult.vectorUnavailableReason;
            hybridRerankUsed = hybridResult.rerankUsed;
            hybridRerankReasonCodes = hybridResult.rerankReasonCodes;
            hybridRerankSource = hybridResult.rerankSource;
            queryTimeIntent = hybridResult.queryTimeIntent;
            vectorTopHits = hybridResult.vectorHits.map((hit, index): RetrievalVectorTopHit => ({
                rank: index + 1,
                sourceId: hit.sourceId,
                score: Number(hit.score ?? 0),
            }));

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
            lexicalRanking = this.buildStageRanking(result.items, vectorHitIds);
            mergedRanking = this.buildStageRanking(hybridResult.preRerankItems, vectorHitIds);
            rerankedRanking = this.buildStageRanking(hybridResult.postRerankItems, vectorHitIds);
            rankingChanges = this.buildRankingChanges({
                lexicalItems: result.items,
                mergedItems: hybridResult.preRerankItems,
                rerankedItems: hybridResult.postRerankItems,
                finalItems,
                vectorHitIds,
            });
            timeBiasedCount = finalItems.filter((item) => (item.breakdown.timeBoost ?? 0) > 0).length;
        } else {
            finalItems = this.applyShadowFinalCap(
                applyWorldStrategyToResultItems(finalItems, input.worldStrategy),
                settings.retentionShadowMaxFinalItems,
            );
            resultSourceLabels = result.items.map((item) => ({
                candidateId: item.candidate.candidateId,
                source: (item.breakdown.graphBoost ?? 0) > 0 && item.breakdown.bm25 === 0
                    ? 'graph_expansion' as const
                    : 'lexical' as const,
            }));
            lexicalRanking = this.buildStageRanking(result.items, new Set<string>());
            mergedRanking = lexicalRanking;
            rerankedRanking = this.buildStageRanking(finalItems, new Set<string>());
            rankingChanges = this.buildRankingChanges({
                lexicalItems: result.items,
                mergedItems: finalItems,
                rerankedItems: finalItems,
                finalItems,
                vectorHitIds: new Set<string>(),
            });
            timeBiasedCount = finalItems.filter((item) => (item.breakdown.timeBoost ?? 0) > 0).length;
            queryTimeIntent = finalItems.find((item) => item.breakdown.timeIntent)?.breakdown.timeIntent ?? 'none';
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
            vectorTopHits,
            lexicalRanking,
            mergedRanking,
            rerankedRanking,
            rankingChanges,
            timeBiasedCount,
            queryTimeIntent,
            worldProfileId: input.worldStrategy?.explanation.profileId,
            worldBiasedCount: finalItems.filter((item) => {
                return input.worldStrategy
                    ? input.worldStrategy.profile.mergedPreferredSchemas.includes(item.candidate.schemaId)
                    : false;
            }).length,
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
     * 功能：根据自动策略解析实际检索模式。
     * @param requestedMode 用户请求模式。
     * @param chatKey 当前聊天键。
     * @returns 实际检索模式。
     */
    private async resolveEffectiveRetrievalMode(requestedMode: RetrievalMode, chatKey: string): Promise<EffectiveRetrievalMode> {
        if (requestedMode !== 'auto') {
            return requestedMode;
        }
        if (!this.hybridService?.isVectorAvailable()) {
            return 'lexical_only';
        }
        const vectorStore = this.hybridService.getVectorStore();
        if (chatKey) {
            await vectorStore.ensureLoaded(chatKey);
        }
        if (vectorStore.getDocumentCount() <= 0) {
            return 'lexical_only';
        }
        return 'hybrid';
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
            worldStrategy: input.worldStrategy,
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
            worldStrategy: input.worldStrategy,
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
            worldStrategy: input.worldStrategy,
            recallConfig: {
                topK: input.maxCandidates,
                payloadFilter: input.payloadFilter,
            },
        });
    }

    /**
     * 功能：构建单个排序阶段的快照列表。
     * @param items 检索结果项。
     * @param vectorHitIds 向量命中 ID 集合。
     * @returns 排序快照。
     */
    private buildStageRanking(items: import('../memory-retrieval/types').RetrievalResultItem[], vectorHitIds: Set<string>): RetrievalStageRankingItem[] {
        return items.map((item, index): RetrievalStageRankingItem => ({
            rank: index + 1,
            candidateId: item.candidate.candidateId || item.candidate.entryId,
            entryId: item.candidate.entryId,
            title: item.candidate.title || item.candidate.entryId,
            score: Number(item.score ?? 0),
            source: this.resolveResultSource(item, vectorHitIds),
            timeIntent: item.breakdown.timeIntent,
            timeBoost: Number(item.breakdown.timeBoost ?? 0),
            stateBoost: Number(item.breakdown.stateBoost ?? 0),
            outcomeBoost: Number(item.breakdown.outcomeBoost ?? 0),
            temporalWeight: Number(item.breakdown.temporalWeight ?? 0),
        }));
    }

    /**
     * 功能：生成排序变化说明列表。
     * @param input 排序阶段输入。
     * @returns 变化说明列表。
     */
    private buildRankingChanges(input: {
        lexicalItems: import('../memory-retrieval/types').RetrievalResultItem[];
        mergedItems: import('../memory-retrieval/types').RetrievalResultItem[];
        rerankedItems: import('../memory-retrieval/types').RetrievalResultItem[];
        finalItems: import('../memory-retrieval/types').RetrievalResultItem[];
        vectorHitIds: Set<string>;
    }): RetrievalRankingChangeItem[] {
        const lexicalMap = this.buildRankingLookup(input.lexicalItems);
        const mergedMap = this.buildRankingLookup(input.mergedItems);
        const rerankedMap = this.buildRankingLookup(input.rerankedItems);
        const finalMap = this.buildRankingLookup(input.finalItems);
        const orderedIds = Array.from(new Set([
            ...input.finalItems.map((item) => item.candidate.candidateId || item.candidate.entryId),
            ...input.mergedItems.map((item) => item.candidate.candidateId || item.candidate.entryId),
            ...input.lexicalItems.map((item) => item.candidate.candidateId || item.candidate.entryId),
        ]));
        return orderedIds.map((candidateId: string): RetrievalRankingChangeItem | null => {
            const finalRecord = finalMap.get(candidateId) ?? rerankedMap.get(candidateId) ?? mergedMap.get(candidateId) ?? lexicalMap.get(candidateId);
            if (!finalRecord) {
                return null;
            }
            const lexicalRecord = lexicalMap.get(candidateId);
            const mergedRecord = mergedMap.get(candidateId);
            const rerankedRecord = rerankedMap.get(candidateId);
            const source = this.resolveResultSource(finalRecord.item, input.vectorHitIds);
            return {
                candidateId,
                entryId: finalRecord.item.candidate.entryId,
                title: finalRecord.item.candidate.title || finalRecord.item.candidate.entryId,
                source,
                lexicalRank: lexicalRecord?.rank,
                mergedRank: mergedRecord?.rank,
                rerankedRank: rerankedRecord?.rank,
                finalRank: finalRecord.rank,
                lexicalScore: lexicalRecord?.score,
                mergedScore: mergedRecord?.score,
                rerankedScore: rerankedRecord?.score,
                finalScore: finalRecord.score,
                changeReason: this.resolveRankingChangeReason({
                    source,
                    finalItem: finalRecord.item,
                    lexicalRank: lexicalRecord?.rank,
                    mergedRank: mergedRecord?.rank,
                    rerankedRank: rerankedRecord?.rank,
                    finalRank: finalRecord.rank,
                }),
            };
        }).filter((item): item is RetrievalRankingChangeItem => item !== null);
    }

    /**
     * 功能：在统一检索入口应用遗忘分层策略。
     * @param query 当前查询。
     * @param candidates 候选列表。
     * @returns 可参与当前检索的候选。
     */
    private applyForgettingAwareRecallPolicy(query: string, candidates: RetrievalCandidate[]): RetrievalCandidate[] {
        return candidates.reduce((result: RetrievalCandidate[], candidate: RetrievalCandidate): RetrievalCandidate[] => {
            const retention = projectMemoryRetentionCore({
                forgotten: candidate.forgettingTier === 'active' ? false : candidate.forgettingTier === 'hard_forgotten' ? true : true,
                memoryPercent: candidate.retention?.rawMemoryPercent ?? candidate.memoryPercent,
                title: candidate.title,
                summary: candidate.summary,
                compareKey: candidate.compareKey,
                aliasTexts: candidate.aliasTexts,
                actorKeys: candidate.actorKeys,
                relationKeys: candidate.relationKeys,
                participantActorKeys: candidate.participantActorKeys,
                locationKey: candidate.locationKey,
                worldKeys: candidate.worldKeys,
                semantic: candidate.semantic,
                query,
            });
            if (retention.forgottenLevel === 'hard_forgotten') {
                return result;
            }
            if (!retention.canRecall) {
                return result;
            }
            result.push({
                ...candidate,
                retention,
                memoryPercent: retention.effectiveMemoryPercent,
                forgettingTier: retention.forgottenLevel,
                shadowTriggered: retention.shadowTriggered,
                shadowRecallPenalty: retention.shadowRecallPenalty,
            });
            return result;
        }, []);
    }

    /**
     * 功能：限制最终结果中影子遗忘条目的数量，避免挤占过多窗口。
     * @param items 最终候选列表。
     * @param maxShadowItems 允许保留的影子条目上限。
     * @returns 限流后的结果。
     */
    private applyShadowFinalCap(
        items: import('../memory-retrieval/types').RetrievalResultItem[],
        maxShadowItems: number,
    ): import('../memory-retrieval/types').RetrievalResultItem[] {
        const safeLimit = Math.max(0, Math.trunc(Number(maxShadowItems) || 0));
        let shadowCount = 0;
        return items.filter((item): boolean => {
            if (item.candidate.forgettingTier !== 'shadow_forgotten' || item.candidate.shadowTriggered !== true) {
                return true;
            }
            shadowCount += 1;
            return shadowCount <= safeLimit;
        });
    }

    /**
     * 功能：构建按候选 ID 索引的排序查找表。
     * @param items 检索结果项。
     * @returns 查找表。
     */
    private buildRankingLookup(items: import('../memory-retrieval/types').RetrievalResultItem[]): Map<string, {
        item: import('../memory-retrieval/types').RetrievalResultItem;
        rank: number;
        score: number;
    }> {
        const map = new Map<string, {
            item: import('../memory-retrieval/types').RetrievalResultItem;
            rank: number;
            score: number;
        }>();
        items.forEach((item, index): void => {
            map.set(item.candidate.candidateId || item.candidate.entryId, {
                item,
                rank: index + 1,
                score: Number(item.score ?? 0),
            });
        });
        return map;
    }

    /**
     * 功能：判断结果项的主要来源。
     * @param item 检索结果项。
     * @param vectorHitIds 向量命中集合。
     * @returns 来源标签。
     */
    private resolveResultSource(
        item: import('../memory-retrieval/types').RetrievalResultItem,
        vectorHitIds: Set<string>,
    ): ResultSourceLabel['source'] {
        const candidateId = item.candidate.candidateId || item.candidate.entryId;
        if (vectorHitIds.has(item.candidate.entryId) || vectorHitIds.has(candidateId)) {
            if ((item.breakdown.bm25 ?? 0) > 0) {
                return 'lexical';
            }
            return 'vector';
        }
        if ((item.breakdown.graphBoost ?? 0) > 0 && item.breakdown.bm25 === 0) {
            return 'graph_expansion';
        }
        return 'lexical';
    }

    /**
     * 功能：生成排序变化的简要解释。
     * @param input 变化输入。
     * @returns 中文解释。
     */
    private resolveRankingChangeReason(input: {
        source: ResultSourceLabel['source'];
        finalItem: import('../memory-retrieval/types').RetrievalResultItem;
        lexicalRank?: number;
        mergedRank?: number;
        rerankedRank?: number;
        finalRank?: number;
    }): string {
        const timeBoost = Number(input.finalItem.breakdown.timeBoost) || 0;
        const semanticLabel = input.finalItem.candidate.semantic
            ? `${resolveSemanticKindLabel(input.finalItem.candidate.semantic.semanticKind)}候选`
            : '候选';
        const shadowHint = input.finalItem.candidate.forgettingTier === 'shadow_forgotten'
            ? `${input.finalItem.candidate.shadowTriggered ? '影子遗忘被强相关唤起，' : '影子遗忘参与排序，'}`
            : '';
        const timeHint = timeBoost > 0.01 ? '时间方向加权参与了最终排序。' : '';
        const retentionHint = this.resolveRankingRetentionHint(input.finalItem.candidate.retention?.explainReasonCodes);
        if (input.lexicalRank === undefined && input.mergedRank !== undefined) {
            if (input.source === 'vector') {
                return `${shadowHint}${semanticLabel}由向量命中补入候选。${retentionHint}${timeHint}`.trim();
            }
            if (input.source === 'graph_expansion') {
                return `${shadowHint}${semanticLabel}由图扩展补入候选。${retentionHint}${timeHint}`.trim();
            }
            return `${shadowHint}${semanticLabel}在融合阶段进入最终候选窗口。${retentionHint}${timeHint}`.trim();
        }
        if (input.mergedRank !== undefined && input.rerankedRank !== undefined) {
            const diff = input.mergedRank - input.rerankedRank;
            if (diff > 0) {
                return `${shadowHint}${semanticLabel}重排后提升 ${diff} 位。${retentionHint}${timeHint}`.trim();
            }
            if (diff < 0) {
                return `${shadowHint}${semanticLabel}重排后下降 ${Math.abs(diff)} 位。${retentionHint}${timeHint}`.trim();
            }
        }
        if (input.lexicalRank !== undefined && input.finalRank !== undefined) {
            const diff = input.lexicalRank - input.finalRank;
            if (diff > 0) {
                return `${shadowHint}${semanticLabel}相较初始词法排序提升 ${diff} 位。${retentionHint}${timeHint}`.trim();
            }
            if (diff < 0) {
                return `${shadowHint}${semanticLabel}相较初始词法排序下降 ${Math.abs(diff)} 位。${retentionHint}${timeHint}`.trim();
            }
        }
        return (`${shadowHint}${semanticLabel}排序位置基本保持不变。${retentionHint}${timeHint}`).trim();
    }

    private resolveRankingRetentionHint(reasonCodes?: string[]): string {
        if (!Array.isArray(reasonCodes) || reasonCodes.length <= 0) {
            return '';
        }
        const mapping: Record<string, string> = {
            retention_stage_clear: '记忆阶段清晰',
            retention_stage_blur: '记忆阶段模糊',
            retention_stage_distorted: '记忆阶段失真',
            shadow_recall_penalized: '统一 retention 已降权',
            recency_weakened: '时效衰减',
            importance_high: '重要度较高',
            memory_percent_critical_low: '原始记忆度极低',
            memory_percent_low: '原始记忆度偏低',
        };
        const labels = Array.from(new Set(
            reasonCodes
                .map((code: string): string => mapping[String(code ?? '').trim()] || '')
                .filter(Boolean)
                .slice(0, 2),
        ));
        return labels.length > 0 ? `${labels.join('、')}。` : '';
    }
}
