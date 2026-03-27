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
});
