import { describe, expect, it } from 'vitest';
import { buildRetrievalExplanation } from '../src/memory-retrieval/retrieval-explanation';

describe('retrieval explanation semantic wording', () => {
    it('会在命中原因中带出公共语义口径', () => {
        const explanation = buildRetrievalExplanation({
            score: 0.91,
            candidate: {
                candidateId: 'c1',
                entryId: 'e1',
                schemaId: 'event',
                title: '森林中的救援',
                summary: '塞拉菲娜把{{user}}带回了林间小屋',
                updatedAt: 1,
                memoryPercent: 88,
                forgettingTier: 'shadow_forgotten',
                shadowTriggered: true,
                shadowRecallPenalty: 0.42,
                retention: {
                    retentionScore: 24,
                    retrievalWeight: 0.31,
                    promptRenderStage: 'distorted',
                    forgottenLevel: 'shadow_forgotten',
                    shadowTriggered: true,
                    canRecall: true,
                    shadowRecallPenalty: 0.42,
                    shadowConfidencePenalty: 0.38,
                    rawMemoryPercent: 10,
                    effectiveMemoryPercent: 31,
                    explainReasonCodes: ['retention_stage_distorted', 'shadow_recall_penalized', 'memory_percent_low'],
                },
                semantic: {
                    semanticKind: 'event',
                    visibilityScope: 'actor_visible',
                    isCharacterVisible: true,
                    finalOutcome: '救援成功',
                    sourceEntryType: 'event',
                },
            },
            breakdown: {
                bm25: 0.41,
                ngram: 0.22,
                editDistance: 0,
                memoryWeight: 0.5,
                outcomeBoost: 0.36,
            },
        });

        expect(explanation.reasonSummary).toContain('事件语义');
        expect(explanation.reasonSummary).toContain('角色可见');
        expect(explanation.reasonSummary).toContain('结果语义匹配');
        expect(explanation.reasonSummary).toContain('影子遗忘被强相关问题唤起');
        expect(explanation.reasonSummary).toContain('已施加影子降权');
        expect(explanation.reasonSummary).toContain('记忆阶段失真');
        expect(explanation.reasonSummary).toContain('统一 retention 已降权');
    });
});
