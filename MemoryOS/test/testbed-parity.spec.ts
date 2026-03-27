import { describe, expect, it } from 'vitest';
import {
    buildReplayBaselineFromPipeline,
    compareExactReplayResult,
    formatParityReport,
    normalizeExactReplayBaseline,
} from '../testbed/parity';

describe('testbed parity compare', () => {
    it('passes when baseline and replay are fully equal', () => {
        const baseline = normalizeExactReplayBaseline({
            finalPromptText: 'hello prompt',
            insertIndex: 2,
            insertedMemoryBlock: 'memory block',
            reasonCodes: ['r1', 'r2'],
            matchedActorKeys: ['actor-a'],
            matchedEntryIds: ['entry-1'],
        });
        const replay = normalizeExactReplayBaseline({
            finalPromptText: 'hello prompt',
            insertIndex: 2,
            insertedMemoryBlock: 'memory block',
            reasonCodes: ['r1', 'r2'],
            matchedActorKeys: ['actor-a'],
            matchedEntryIds: ['entry-1'],
        });
        if (!baseline || !replay) {
            throw new Error('baseline init failed');
        }
        const report = compareExactReplayResult(baseline, replay, 'exact_replay');
        expect(report.strictComparable).toBe(true);
        expect(report.pass).toBe(true);
        expect(report.mismatches).toHaveLength(0);
        expect(formatParityReport(report)).toContain('结论：通过');
    });

    it('collects mismatch categories when replay differs', () => {
        const baseline = normalizeExactReplayBaseline({
            finalPromptText: 'abc',
            insertIndex: 1,
            insertedMemoryBlock: 'block-a',
            reasonCodes: ['same'],
            matchedActorKeys: ['a'],
            matchedEntryIds: ['1'],
        });
        const replay = normalizeExactReplayBaseline({
            finalPromptText: 'abcd',
            insertIndex: 2,
            insertedMemoryBlock: 'block-b',
            reasonCodes: ['changed'],
            matchedActorKeys: ['b'],
            matchedEntryIds: ['2'],
        });
        if (!baseline || !replay) {
            throw new Error('baseline init failed');
        }
        const report = compareExactReplayResult(baseline, replay, 'exact_replay');
        const types = report.mismatches.map((item) => item.type);
        expect(types).toContain('prompt_length_changed');
        expect(types).toContain('insert_index_changed');
        expect(types).toContain('memory_block_changed');
        expect(types).toContain('final_prompt_changed');
        expect(types).toContain('reason_codes_changed');
        expect(types).toContain('matched_entries_changed');
        expect(report.pass).toBe(false);
    });

    it('marks simulated mode as non-strict', () => {
        const replay = normalizeExactReplayBaseline({
            finalPromptText: 'replay text',
            insertIndex: -1,
            insertedMemoryBlock: '',
            reasonCodes: [],
            matchedActorKeys: [],
            matchedEntryIds: [],
        });
        if (!replay) {
            throw new Error('replay init failed');
        }
        const report = compareExactReplayResult(null, replay, 'simulated_prompt');
        expect(report.strictComparable).toBe(false);
        expect(report.pass).toBe(false);
        expect(report.summary).toContain('模拟模式');
    });

    it('extracts replay baseline from pipeline result shape', () => {
        const baseline = buildReplayBaselineFromPipeline({
            query: 'q',
            sourceMessageId: 'u-1',
            settingsMaxTokens: 1200,
            baseDiagnostics: {
                enabled: true,
                inserted: true,
                skippedReason: null,
                preset: 'p',
                aggressiveness: 'balanced',
                forceDynamicFloor: true,
                selectedOptions: [],
                candidateCounts: { total: 1, pretrimDropped: 0, budgetDropped: 0 },
                layerBudgets: [],
                finalTextLength: 10,
                finalTokenRatio: 0,
                insertedIndex: 2,
                generatedAt: Date.now(),
            },
            injectionResult: {
                shouldInject: true,
                inserted: true,
                insertIndex: 1,
                promptLength: 3,
                insertedLength: 11,
                trace: null,
            },
            latestExplanation: {
                reasonCodes: ['x'],
                matchedActorKeys: ['hero'],
                matchedEntryIds: ['entry-a'],
            },
            finalPromptMessages: [
                { role: 'system', content: 'a' },
                { role: 'system', content: 'memory-block' },
                { role: 'user', content: 'b' },
            ],
            finalPromptText: 'a\nmemory-block\nb',
            logs: [],
        } as any);
        expect(baseline.insertedMemoryBlock).toBe('memory-block');
        expect(baseline.reasonCodes).toEqual(['x']);
    });
});
