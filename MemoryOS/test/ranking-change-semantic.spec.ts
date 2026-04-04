import { describe, expect, it } from 'vitest';
import { MemoryRetrievalService } from '../src/services/memory-retrieval-service';

describe('ranking change semantic wording', () => {
    it('会在排序变化说明里带出公共语义标签', () => {
        const service = new MemoryRetrievalService({} as never) as unknown as {
            resolveRankingChangeReason: (input: {
                source: 'lexical' | 'vector' | 'graph_expansion' | 'coverage_supplement';
                finalItem: {
                    candidate: {
                        semantic?: {
                            semanticKind: 'event' | 'state' | 'task_progress';
                        };
                    };
                    breakdown: {
                        timeBoost?: number;
                    };
                };
                lexicalRank?: number;
                mergedRank?: number;
                rerankedRank?: number;
                finalRank?: number;
            }) => string;
        };

        const reason = service.resolveRankingChangeReason({
            source: 'vector',
            finalItem: {
                candidate: {
                    forgettingTier: 'shadow_forgotten',
                    shadowTriggered: true,
                    retention: {
                        retentionScore: 30,
                        retrievalWeight: 0.36,
                        promptRenderStage: 'blur',
                        forgottenLevel: 'shadow_forgotten',
                        shadowTriggered: true,
                        canRecall: true,
                        shadowRecallPenalty: 0.28,
                        shadowConfidencePenalty: 0.22,
                        rawMemoryPercent: 20,
                        effectiveMemoryPercent: 36,
                        explainReasonCodes: ['retention_stage_blur', 'memory_percent_low'],
                    },
                    semantic: {
                        semanticKind: 'task_progress',
                    },
                },
                breakdown: {
                    timeBoost: 0.12,
                },
            },
            lexicalRank: 8,
            mergedRank: 5,
            rerankedRank: 2,
            finalRank: 2,
        });

        expect(reason).toContain('任务推进候选');
        expect(reason).toContain('影子遗忘被强相关唤起');
        expect(reason).toContain('提升 3 位');
        expect(reason).toContain('记忆阶段模糊');
        expect(reason).toContain('时间方向加权参与了最终排序');
    });
});
