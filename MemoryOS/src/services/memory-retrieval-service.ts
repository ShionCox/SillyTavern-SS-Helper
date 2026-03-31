import type { MemoryRetrievalInput, PromptRecallInput, TakeoverRecallInput, WorkbenchRecallInput } from '../memory-retrieval/retrieval-input';
import type { MemoryRetrievalOutput, RetrievalOutputDiagnostics, VectorProviderStatus, ResultSourceLabel } from '../memory-retrieval/retrieval-output';
import type { RetrievalCandidate, RetrievalFacet } from '../memory-retrieval/types';
import type { RecallConfig } from '../memory-retrieval/recall-config';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import { buildDefaultRecallConfig, mergeRecallConfig } from '../memory-retrieval/recall-config';
import { applyPayloadFilter } from '../memory-retrieval/payload-filter';
import { RetrievalOrchestrator } from '../memory-retrieval/retrieval-orchestrator';
import { readMemoryOSSettings } from '../settings/store';

/**
 * 功能：全系统统一检索入口服务。
 * 说明：所有模块（Prompt、Takeover、Workbench 等）均通过此服务发起检索，
 *       不再各自拼装检索逻辑。
 */
export class MemoryRetrievalService {
    private readonly orchestrator: RetrievalOrchestrator;

    constructor(orchestrator?: RetrievalOrchestrator) {
        this.orchestrator = orchestrator ?? new RetrievalOrchestrator();
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
            config,
            {
                actorProfiles: input.actorProfiles,
                recentContext: input.recentContext,
            },
        );

        const vectorProviderStatus: VectorProviderStatus = {
            available: this.orchestrator.isVectorProviderAvailable(),
            unavailableReason: this.orchestrator.getVectorUnavailableReason(),
            requestedByMode: config.retrievalMode === 'vector_only' || config.retrievalMode === 'hybrid',
        };

        const resultSourceLabels: ResultSourceLabel[] = result.items.map((item) => ({
            candidateId: item.candidate.candidateId,
            source: (item.breakdown.graphBoost ?? 0) > 0 && item.breakdown.bm25 === 0
                ? 'graph_expansion' as const
                : 'lexical' as const,
        }));

        const diagnostics: RetrievalOutputDiagnostics = {
            contextRoute: result.contextRoute,
            retrievalMode: config.retrievalMode,
            seedProviderId: result.diagnostics?.seedProviderId ?? 'none',
            seedCount: result.diagnostics?.seedCount ?? 0,
            expandedCount: result.diagnostics?.expandedCount ?? 0,
            coverageTriggeredFacets: (result.diagnostics?.coverageTriggeredFacets ?? []) as RetrievalFacet[],
            diversityDroppedCount: result.diagnostics?.diversityDroppedCount ?? 0,
            finalCount: result.diagnostics?.finalCount ?? result.items.length,
            seedQueryText: result.diagnostics?.seedQueryText ?? input.query,
            boostSchemaIds: result.diagnostics?.boostSchemaIds ?? [],
            coverageSubQueries: result.diagnostics?.coverageSubQueries ?? {},
            traceRecords: result.diagnostics?.traceRecords ?? [],
            vectorProviderStatus,
            resultSourceLabels,
        };

        return {
            items: result.items,
            retrievalMode: config.retrievalMode,
            providerId: result.providerId,
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
