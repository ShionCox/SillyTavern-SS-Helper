import { describe, expect, it } from 'vitest';
import { IngestPlanner } from '../src/core/ingest-planner';
import type { AutoSummaryDecisionResult } from '../src/core/auto-summary-trigger';
import type { MemoryProcessingDecision } from '../src/types';

function buildPlanner(): IngestPlanner {
    return new IngestPlanner({
        chatKey: 'chat-001',
        specialTriggerTypes: new Set<string>(),
        turnTracker: null,
        chatStateManager: null,
        metaManager: { markRefreshCheckpoints: async () => undefined } as any,
    });
}

describe('ingest-planner', (): void => {
    it('auto summary 在 long 被阻断时会降级到 short', (): void => {
        const baseDecision: MemoryProcessingDecision = {
            level: 'heavy',
            summaryTier: 'long',
            extractScope: 'heavy',
            reasonCodes: ['stage_completion'],
            heavyTriggerKind: 'stage_completion',
            cooldownBlocked: false,
            windowHash: 'window-1',
            windowEventCount: 20,
            windowUserMessageCount: 8,
            generatedAt: Date.now(),
            precompressedStats: {
                originalLength: 100,
                compressedLength: 80,
                removedGreetingCount: 0,
                removedDuplicateCount: 0,
                mergedRunCount: 0,
                truncatedToolOutputCount: 0,
            },
        };
        const autoDecision: AutoSummaryDecisionResult = {
            shouldRun: false,
            reasonCodes: ['auto_summary:not_reached'],
            threshold: 10,
            mode: 'mixed',
            matchedTriggerIds: [],
            turnsSinceLastSummary: 5,
            scores: {
                triggerRule: 0.2,
                semantic: 0.1,
                pressure: 0.1,
            },
        };
        const result = buildPlanner().applyAutoSummaryDecision({
            baseDecision,
            autoDecision,
            summaryEnabled: true,
        });
        expect(result.summaryTier).toBe('short');
    });
});
