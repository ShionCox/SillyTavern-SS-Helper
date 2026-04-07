import { describe, expect, it } from 'vitest';
import { resolveCandidateRecords } from '../src/memory-summary-planner';
import type { MemoryEntry } from '../src/types';

function buildEntry(index: number): MemoryEntry {
    return {
        entryId: `entry-${index}`,
        chatKey: 'chat',
        title: `World Rule ${index}`,
        entryType: 'world_hard_rule',
        category: '世界基础',
        tags: [],
        summary: `rule description ${index}`.repeat(20),
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {},
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 100 - index,
    };
}

describe('resolveCandidateRecords budget mode', () => {
    it('respects candidateTextBudgetChars and maxCandidatesHardCap', async () => {
        const entries = Array.from({ length: 20 }, (_, index): MemoryEntry => buildEntry(index + 1));
        const result = await resolveCandidateRecords({
            query: 'world rule',
            candidateTypes: ['world_hard_rule'],
            entries,
            candidateTextBudgetChars: 260,
            maxCandidatesHardCap: 5,
            enableEmbedding: false,
        });

        expect(result.providerId).toBeTruthy();
        expect(result.candidates.length).toBeLessThanOrEqual(5);
        const totalChars = result.candidates.reduce((sum, item) => sum + item.summary.length, 0);
        expect(totalChars).toBeLessThan(800);
    });
});
