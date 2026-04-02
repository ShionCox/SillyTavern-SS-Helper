import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievalCandidate, RetrievalOrchestratorResult } from '../src/memory-retrieval/types';
import type { RetrievalOutputDiagnostics } from '../src/memory-retrieval/retrieval-output';
import { HybridRetrievalService } from '../src/services/hybrid-retrieval-service';
import { MemoryRetrievalService } from '../src/services/memory-retrieval-service';

const { mockedReadMemoryOSSettings } = vi.hoisted(() => ({
    mockedReadMemoryOSSettings: vi.fn(),
}));

vi.mock('../src/settings/store', async () => {
    const actual = await vi.importActual('../src/settings/store');
    return {
        ...actual,
        readMemoryOSSettings: mockedReadMemoryOSSettings,
    };
});

function buildSettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        retrievalMode: 'hybrid',
        retrievalDefaultTopK: 10,
        retrievalDefaultExpandDepth: 1,
        retrievalEnablePayloadFilter: false,
        retrievalEnableGraphExpansion: true,
        retrievalEnableGraphPenalty: true,
        retrievalEnableQueryContextBuilder: false,
        retrievalRulePack: 'hybrid',
        contextMaxTokens: 1200,
        vectorTopK: 3,
        vectorDeepWindow: 9,
        vectorFinalTopK: 4,
        vectorEnableStrategyRouting: true,
        vectorEnableRerank: true,
        vectorRerankWindow: 8,
        vectorEnableLLMHubRerank: false,
        vectorLLMHubRerankResource: '',
        vectorLLMHubRerankModel: '',
        vectorLLMHubRerankMinCandidates: 8,
        vectorLLMHubRerankMaxCandidates: 12,
        vectorLLMHubRerankFallbackToRule: true,
        ...overrides,
    };
}

function buildCandidates(): RetrievalCandidate[] {
    return [
        {
            candidateId: 'c1',
            entryId: 'e1',
            schemaId: 'world_hard_rule',
            title: '王城宵禁法',
            summary: '王城夜间禁止外出',
            updatedAt: 1,
            memoryPercent: 90,
            actorKeys: ['queen', 'guard'],
            relationKeys: ['law'],
            worldKeys: ['capital'],
        },
        {
            candidateId: 'c2',
            entryId: 'e2',
            schemaId: 'event',
            title: '巡夜队集合',
            summary: '守卫会在钟声后巡逻',
            updatedAt: 1,
            memoryPercent: 80,
        },
    ];
}

describe('HybridRetrievalService diagnostics hardening', () => {
    beforeEach(() => {
        mockedReadMemoryOSSettings.mockReset();
    });

    it('在关闭 vectorEnableStrategyRouting 时强制走 fast path', async () => {
        mockedReadMemoryOSSettings.mockReturnValue(buildSettings({
            retrievalMode: 'vector_only',
            vectorEnableStrategyRouting: false,
            vectorEnableRerank: true,
        }));

        const service = new HybridRetrievalService({
            embeddingService: {
                isAvailable(): boolean { return true; },
                getUnavailableReason(): string | null { return null; },
                async encodeOne(): Promise<{ ok: boolean; vector: number[]; dim: number; model: string }> {
                    return { ok: true, vector: [1, 0], dim: 2, model: 'mock-embed' };
                },
            } as unknown as ConstructorParameters<typeof HybridRetrievalService>[0]['embeddingService'],
            vectorStore: {
                isAvailable(): boolean { return true; },
                async ensureLoaded(): Promise<void> {},
                async search(): Promise<Array<{ vectorDocId: string; sourceKind: string; sourceId: string; score: number }>> {
                    return [{ vectorDocId: 'v1', sourceKind: 'entry', sourceId: 'e1', score: 0.91 }];
                },
            } as unknown as ConstructorParameters<typeof HybridRetrievalService>[0]['vectorStore'],
        });

        const output = await service.search({
            retrievalMode: 'vector_only',
            query: '女王和守卫在王城的复杂宵禁规则是什么，需要同时考虑角色、关系与世界设定',
            chatKey: 'chat-1',
            candidates: buildCandidates(),
            lexicalResults: [],
            contextRoute: {
                facets: ['world', 'relationship', 'event'],
                entityAnchors: {
                    actorKeys: ['queen', 'guard'],
                    locationKeys: ['capital'],
                    relationKeys: ['law'],
                    worldKeys: ['capital'],
                },
                topicHints: [],
                confidence: 0.2,
            },
        });

        expect(output.strategyDecision?.route).toBe('fast_vector');
        expect(output.strategyDecision?.candidateWindow).toBe(3);
        expect(output.strategyDecision?.rerankEnabled).toBe(false);
        expect(output.strategyDecision?.reasonCodes).toContain('strategy_routing_disabled_runtime');
        expect(output.finalProviderId).toBe('vector_only_direct');
    });
});

describe('MemoryRetrievalService final provider semantics', () => {
    it('用最终链路 provider 覆盖输出 providerId，并保留 lexical seedProviderId', async () => {
        mockedReadMemoryOSSettings.mockReturnValue(buildSettings({
            retrievalMode: 'hybrid',
        }));

        const orchestratorResult: RetrievalOrchestratorResult = {
            providerId: 'lexical_bm25',
            contextRoute: null,
            items: [],
            diagnostics: {
                contextRoute: null,
                retrievalMode: 'hybrid',
                seedProviderId: 'lexical_bm25',
                seedCount: 2,
                expandedCount: 2,
                coverageTriggeredFacets: [],
                diversityDroppedCount: 0,
                finalCount: 2,
                seedQueryText: '测试查询',
                boostSchemaIds: [],
                coverageSubQueries: {},
                traceRecords: [],
                vectorProviderAvailable: false,
                vectorUnavailableReason: '向量链已迁移至 HybridRetrievalService',
            },
        };

        const retrievalService = new MemoryRetrievalService({
            retrieve: vi.fn(async () => orchestratorResult),
            isVectorProviderAvailable: vi.fn(() => false),
            getVectorUnavailableReason: vi.fn(() => '向量链已迁移至 HybridRetrievalService'),
        } as unknown as ConstructorParameters<typeof MemoryRetrievalService>[0]);

        retrievalService.setHybridService({
            search: vi.fn(async () => ({
                items: [],
                strategyDecision: {
                    route: 'deep_vector',
                    candidateWindow: 9,
                    finalTopK: 4,
                    rerankEnabled: true,
                    reasonCodes: ['query_long'],
                },
                finalProviderId: 'hybrid_vector_rule_rerank',
                vectorHits: [{ vectorDocId: 'v1', sourceKind: 'entry', sourceId: 'e1', score: 0.88 }],
                mergeUsed: true,
                rerankUsed: true,
                rerankReasonCodes: ['rerank_hybrid'],
                rerankSource: 'rule',
                vectorAvailable: true,
                vectorUnavailableReason: null,
            })),
        } as unknown as HybridRetrievalService);

        const output = await retrievalService.searchHybrid({
            query: '测试查询',
            chatKey: 'chat-1',
            candidates: buildCandidates(),
        });

        expect(output.providerId).toBe('hybrid_vector_rule_rerank');
        expect(output.diagnostics.finalProviderId).toBe('hybrid_vector_rule_rerank');
        expect(output.diagnostics.seedProviderId).toBe('lexical_bm25');
        expect(output.diagnostics.vectorHitCount).toBe(1);
        expect(output.diagnostics.mergeUsed).toBe(true);
        expect(output.diagnostics.rerankSource).toBe('rule');
    });

    it('hybrid 模式下即使设置值为 false 也会默认构建 QueryContextBundle', async () => {
        mockedReadMemoryOSSettings.mockReturnValue(buildSettings({
            retrievalMode: 'hybrid',
            retrievalEnableQueryContextBuilder: false,
        }));

        const orchestratorResult: RetrievalOrchestratorResult = {
            providerId: 'lexical_bm25',
            contextRoute: {
                facets: ['actor', 'relationship', 'world'],
                entityAnchors: {
                    actorKeys: ['queen'],
                    relationKeys: ['law'],
                    worldKeys: ['capital'],
                },
                topicHints: [],
                confidence: 0.8,
            },
            items: [],
            diagnostics: {
                contextRoute: null,
                retrievalMode: 'hybrid',
                seedProviderId: 'lexical_bm25',
                seedCount: 1,
                expandedCount: 1,
                coverageTriggeredFacets: [],
                diversityDroppedCount: 0,
                finalCount: 0,
                seedQueryText: '测试查询',
                boostSchemaIds: [],
                coverageSubQueries: {},
                traceRecords: [],
                vectorProviderAvailable: false,
                vectorUnavailableReason: '向量链已迁移至 HybridRetrievalService',
            } as RetrievalOutputDiagnostics,
        };

        const retrievalService = new MemoryRetrievalService({
            retrieve: vi.fn(async () => orchestratorResult),
            isVectorProviderAvailable: vi.fn(() => false),
            getVectorUnavailableReason: vi.fn(() => '向量链已迁移至 HybridRetrievalService'),
        } as unknown as ConstructorParameters<typeof MemoryRetrievalService>[0]);

        const hybridSearch = vi.fn(async (input: Record<string, unknown>) => ({
            items: [],
            strategyDecision: null,
            finalProviderId: 'hybrid_vector',
            vectorHits: [],
            mergeUsed: false,
            rerankUsed: false,
            rerankReasonCodes: [],
            rerankSource: 'none',
            vectorAvailable: true,
            vectorUnavailableReason: null,
            echoQueryContext: input.queryContext,
        }));

        retrievalService.setHybridService({
            search: hybridSearch,
        } as unknown as HybridRetrievalService);

        await retrievalService.searchHybrid({
            query: '测试查询',
            chatKey: 'chat-1',
            candidates: buildCandidates(),
        });

        expect(hybridSearch).toHaveBeenCalledTimes(1);
        expect(hybridSearch.mock.calls[0]?.[0]).toMatchObject({
            queryContext: {
                queryText: '测试查询',
                actorBiasKeys: ['queen'],
                relationBiasKeys: ['law'],
                worldBiasKeys: ['capital'],
            },
        });
    });
});
