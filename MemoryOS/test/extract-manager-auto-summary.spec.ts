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

function buildDecisionPatch(input?: Partial<MemoryProcessingDecision>): MemoryProcessingDecision {
    return {
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
            originalLength: 1000,
            compressedLength: 700,
            removedGreetingCount: 0,
            removedDuplicateCount: 0,
            mergedRunCount: 0,
            truncatedToolOutputCount: 0,
        },
        ...(input ?? {}),
    };
}

function buildAutoDecision(input?: Partial<AutoSummaryDecisionResult>): AutoSummaryDecisionResult {
    return {
        shouldRun: true,
        reasonCodes: ['auto_summary:threshold_reached'],
        threshold: 10,
        mode: 'mixed',
        matchedTriggerIds: ['scene_end'],
        turnsSinceLastSummary: 10,
        scores: {
            triggerRule: 0.8,
            semantic: 0.2,
            pressure: 0.4,
        },
        ...(input ?? {}),
    };
}

describe('extract-manager auto summary gating', (): void => {
    it('long 总结未通过自动判定时会降级', (): void => {
        const result = buildPlanner().applyAutoSummaryDecision({
            baseDecision: buildDecisionPatch({ summaryTier: 'long' }),
            autoDecision: buildAutoDecision({ shouldRun: false, reasonCodes: ['auto_summary:not_reached'] }),
            summaryEnabled: true,
        });
        expect(result.summaryTier).toBe('short');
        expect(result.reasonCodes).toContain('auto_summary_gate:long_blocked');
    });

    it('命中提前触发时 medium/heavy 可以从 short 升为 long', (): void => {
        const result = buildPlanner().applyAutoSummaryDecision({
            baseDecision: buildDecisionPatch({
                level: 'medium',
                summaryTier: 'short',
                extractScope: 'medium',
            }),
            autoDecision: buildAutoDecision({
                shouldRun: true,
                reasonCodes: ['auto_summary:early_trigger'],
            }),
            summaryEnabled: true,
        });
        expect(result.summaryTier).toBe('long');
        expect(result.reasonCodes).toContain('auto_summary_gate:early_promoted');
    });

    it('light 级别即使命中提前触发也不会强升 long', (): void => {
        const result = buildPlanner().applyAutoSummaryDecision({
            baseDecision: buildDecisionPatch({
                level: 'light',
                summaryTier: 'short',
                extractScope: 'light',
            }),
            autoDecision: buildAutoDecision({
                shouldRun: true,
                reasonCodes: ['auto_summary:early_trigger'],
            }),
            summaryEnabled: true,
        });
        expect(result.summaryTier).toBe('short');
        expect(result.reasonCodes).toContain('auto_summary_gate:light_not_promoted');
    });
});
