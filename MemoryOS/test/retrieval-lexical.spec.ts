import { describe, expect, it } from 'vitest';
import { LexicalRetrievalProvider } from '../src/memory-retrieval/lexical-provider';

describe('LexicalRetrievalProvider', () => {
    it('ranks candidates using BM25 + ngram + edit distance', async () => {
        const provider = new LexicalRetrievalProvider();
        const items = await provider.search({
            query: 'royal curfew law',
            budget: { maxCandidates: 3 },
            candidateTypes: ['world_hard_rule'],
        }, [
            {
                candidateId: '1',
                entryId: 'e1',
                schemaId: 'world_hard_rule',
                title: 'Royal Curfew Law',
                summary: 'Civilians cannot leave the city at night',
                updatedAt: 1,
                memoryPercent: 70,
            },
            {
                candidateId: '2',
                entryId: 'e2',
                schemaId: 'world_hard_rule',
                title: 'Royal Garden',
                summary: 'Flowers and lakes',
                updatedAt: 1,
                memoryPercent: 70,
            },
            {
                candidateId: '3',
                entryId: 'e3',
                schemaId: 'event',
                title: 'Duel',
                summary: 'A public duel',
                updatedAt: 1,
                memoryPercent: 70,
            },
        ]);

        expect(items.length).toBe(2);
        expect(items[0].candidate.entryId).toBe('e1');
        expect(items[0].breakdown.bm25).toBeGreaterThan(0);
        expect(items[0].breakdown.ngram).toBeGreaterThan(0);
        expect(items[0].breakdown.editDistance).toBeGreaterThan(0);
    });

    it('识别最终结果查询并写入 temporal breakdown', async () => {
        const provider = new LexicalRetrievalProvider();
        const items = await provider.search({
            query: '何盈最后结果如何',
            budget: { maxCandidates: 3 },
        }, [
            {
                candidateId: '1',
                entryId: 'e1',
                schemaId: 'relationship',
                title: '何盈关系结局',
                summary: '两人最终和解并恢复联系',
                updatedAt: Date.now(),
                memoryPercent: 85,
                ongoing: false,
                detailPayload: {
                    fields: {
                        outcome: '最终和解',
                        status: 'completed',
                    },
                },
                timeContext: {
                    mode: 'sequence_fallback',
                    source: 'fallback_engine',
                    confidence: 0.8,
                    sequenceTime: {
                        orderIndex: 10,
                        firstFloor: 90,
                        lastFloor: 100,
                    },
                },
            },
            {
                candidateId: '2',
                entryId: 'e2',
                schemaId: 'event',
                title: '普通对话',
                summary: '今天随口聊了两句',
                updatedAt: Date.now(),
                memoryPercent: 70,
                timeContext: {
                    mode: 'sequence_fallback',
                    source: 'fallback_engine',
                    confidence: 0.8,
                    sequenceTime: {
                        orderIndex: 9,
                        firstFloor: 98,
                        lastFloor: 99,
                    },
                },
            },
        ]);

        expect(items[0].candidate.entryId).toBe('e1');
        expect(items[0].breakdown.timeIntent).toBe('final_outcome');
        expect(items[0].breakdown.outcomeBoost).toBeGreaterThan(0);
        expect(items[0].breakdown.temporalWeight).toBeGreaterThan(0);
    });
});
