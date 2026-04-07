import { describe, expect, it } from 'vitest';
import { MemoryRetrievalService } from '../src/services/memory-retrieval-service';
import type { RetrievalCandidate, RetrievalResultItem } from '../src/memory-retrieval/types';
import { normalizeMemoryOSSettings, readMemoryOSSettings, writeMemoryOSSettings } from '../src/settings/store';

describe('MemoryRetrievalService shadow recall', () => {
    function createService(seenCandidates: RetrievalCandidate[][]): MemoryRetrievalService {
        const orchestrator = {
            retrieve: async (_query: unknown, candidates: RetrievalCandidate[]): Promise<{
                providerId: string;
                contextRoute: null;
                items: RetrievalResultItem[];
                diagnostics: {
                    seedProviderId: string;
                    seedCount: number;
                    expandedCount: number;
                    coverageTriggeredFacets: [];
                    diversityDroppedCount: number;
                    finalCount: number;
                    seedQueryText: string;
                    boostSchemaIds: [];
                    coverageSubQueries: {};
                    traceRecords: [];
                };
            }> => {
                seenCandidates.push(candidates);
                return {
                    providerId: 'stub',
                    contextRoute: null,
                    items: candidates.map((candidate: RetrievalCandidate): RetrievalResultItem => ({
                        candidate,
                        score: 0.9,
                        breakdown: {
                            bm25: 0.8,
                            ngram: 0.8,
                            editDistance: 0.1,
                            memoryWeight: candidate.memoryPercent / 100,
                        },
                    })),
                    diagnostics: {
                        seedProviderId: 'stub',
                        seedCount: candidates.length,
                        expandedCount: 0,
                        coverageTriggeredFacets: [],
                        diversityDroppedCount: 0,
                        finalCount: candidates.length,
                        seedQueryText: '',
                        boostSchemaIds: [],
                        coverageSubQueries: {},
                        traceRecords: [],
                    },
                };
            },
            isVectorProviderAvailable: (): boolean => false,
            getVectorUnavailableReason: (): string => 'stub',
        };
        return new MemoryRetrievalService(orchestrator as never);
    }

    const baseCandidates: RetrievalCandidate[] = [
        {
            candidateId: 'active:1',
            entryId: 'e-active',
            schemaId: 'event',
            title: '现时战况',
            summary: '战斗仍在继续。',
            updatedAt: 1,
            memoryPercent: 72,
            forgettingTier: 'active',
        },
        {
            candidateId: 'shadow:1',
            entryId: 'e-shadow',
            schemaId: 'task',
            title: '林间疗伤',
            summary: '塞拉菲娜正在治疗{{user}}的伤势。',
            updatedAt: 1,
            memoryPercent: 12,
            aliasTexts: ['疗伤'],
            forgettingTier: 'shadow_forgotten',
            shadowRecallPenalty: 0.42,
            semantic: {
                semanticKind: 'task_progress',
                visibilityScope: 'actor_visible',
                isCharacterVisible: true,
                currentState: '进行中',
                goalOrObjective: '稳定{{user}}的伤势',
                sourceEntryType: 'task',
            },
        },
        {
            candidateId: 'hard:1',
            entryId: 'e-hard',
            schemaId: 'other',
            title: '',
            summary: '',
            updatedAt: 1,
            memoryPercent: 0,
            forgettingTier: 'hard_forgotten',
        },
    ];

    it('普通查询下不会把影子遗忘放进候选池', async () => {
        const seenCandidates: RetrievalCandidate[][] = [];
        const service = createService(seenCandidates);
        const result = await service.searchHybrid({
            query: '现在局势如何',
            candidates: baseCandidates,
            recallConfig: {
                retrievalMode: 'lexical_only',
                topK: 8,
            },
        });

        expect(seenCandidates[0].map((item) => item.entryId)).toEqual(['e-active']);
        expect(result.items.map((item) => item.candidate.entryId)).toEqual(['e-active']);
    });

    it('强相关查询下会唤起影子遗忘并打上影子标记', async () => {
        const seenCandidates: RetrievalCandidate[][] = [];
        const service = createService(seenCandidates);
        const result = await service.searchHybrid({
            query: '林间疗伤现在怎么样了',
            candidates: baseCandidates,
            recallConfig: {
                retrievalMode: 'lexical_only',
                topK: 8,
            },
        });

        expect(seenCandidates[0].map((item) => item.entryId)).toEqual(['e-active', 'e-shadow']);
        const shadowItem = result.items.find((item) => item.candidate.entryId === 'e-shadow');
        expect(shadowItem?.candidate.shadowTriggered).toBe(true);
    });

    it('会保留影子遗忘惩罚的配置值', () => {
        const settings = normalizeMemoryOSSettings({
            retentionBlurThreshold: 70,
            retentionDistortedThreshold: 30,
            retentionShadowRetrievalPenaltyMild: 0.1,
            retentionShadowRetrievalPenaltyHeavy: 0.8,
            retentionShadowConfidencePenaltyMild: 0.15,
            retentionShadowConfidencePenaltyHeavy: 0.9,
            retentionShadowMaxFinalItems: 2,
        });

        expect(settings.retentionBlurThreshold).toBe(70);
        expect(settings.retentionDistortedThreshold).toBe(30);
        expect(settings.retentionShadowRetrievalPenaltyMild).toBe(0.1);
        expect(settings.retentionShadowRetrievalPenaltyHeavy).toBe(0.8);
        expect(settings.retentionShadowConfidencePenaltyMild).toBe(0.15);
        expect(settings.retentionShadowConfidencePenaltyHeavy).toBe(0.9);
        expect(settings.retentionShadowMaxFinalItems).toBe(2);
    });

    it('最终结果会限制影子遗忘条目的数量', async () => {
        const previous = readMemoryOSSettings();
        writeMemoryOSSettings({ retentionShadowMaxFinalItems: 1 });
        try {
            const service = createService([]);
            const result = await service.searchHybrid({
                query: '林间疗伤和森林中的救援现在怎么样了',
                candidates: [
                    baseCandidates[0],
                    baseCandidates[1],
                    {
                        candidateId: 'shadow:2',
                        entryId: 'e-shadow-2',
                        schemaId: 'event',
                        title: '森林中的救援',
                        summary: '塞拉菲娜把{{user}}从森林深处救了出来。',
                        updatedAt: 1,
                        memoryPercent: 10,
                        aliasTexts: ['救援'],
                        forgettingTier: 'shadow_forgotten',
                        shadowRecallPenalty: 0.42,
                        semantic: {
                            semanticKind: 'event',
                            visibilityScope: 'actor_visible',
                            isCharacterVisible: true,
                            finalOutcome: '救援成功',
                            sourceEntryType: 'event',
                        },
                    },
                ],
                recallConfig: {
                    retrievalMode: 'lexical_only',
                    topK: 8,
                },
            });

            const shadowItems = result.items.filter((item) => item.candidate.forgettingTier === 'shadow_forgotten');
            expect(shadowItems).toHaveLength(1);
            expect(result.items.some((item) => item.candidate.entryId === 'e-active')).toBe(true);
        } finally {
            writeMemoryOSSettings(previous);
        }
    });
});
