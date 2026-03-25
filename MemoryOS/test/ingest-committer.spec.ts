import { describe, expect, it, vi } from 'vitest';
import { IngestCommitter } from '../src/core/ingest-committer';
import type { IngestExecutionResult, IngestPlan } from '../src/core/ingest-types';
import type { LogicalChatView } from '../src/types';

function buildLogicalView(): LogicalChatView {
    return {
        snapshotHash: 'snapshot-1',
        visibleMessages: [],
        visibleUserTurns: [],
        visibleAssistantTurns: [],
        mutationKinds: [],
    } as unknown as LogicalChatView;
}

function buildPlan(): IngestPlan {
    return {
        selection: {
            windowHash: 'window-1',
            windowMessages: [],
            fromMessageId: 'm1',
            toMessageId: 'm2',
            lastAssistantTurnId: 't1',
            lastAssistantMessageId: 'm2',
            lastAssistantTurnCount: 12,
            pendingAssistantTurns: 2,
            repairTriggered: false,
        },
        currentAssistantTurnCount: 12,
        repairGeneration: 2,
        triggerBySpecialEvent: false,
        summaryEnabled: true,
        summaryInterval: 12,
        chatProfile: null,
        previousLorebookDecision: null,
        lorebookDecision: { mode: 'soft_inject', score: 0.8, shouldExtractWorldFacts: true } as any,
        postGate: {
            valueClass: 'plot_progress',
            shouldPersistLongTerm: true,
            shouldExtractFacts: true,
            shouldExtractRelations: true,
            shouldExtractWorldState: false,
            rebuildSummary: true,
            shouldUpdateWorldState: false,
            shortTermOnly: false,
            reasonCodes: ['plot_progress'],
            generatedAt: Date.now(),
        },
        lifecycleState: null,
        autoSummaryDecisionSnapshot: null,
        processingDecision: {
            level: 'medium',
            summaryTier: 'short',
            extractScope: 'medium',
            reasonCodes: ['plot_progress'],
            heavyTriggerKind: null,
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
        },
        windowText: 'window',
        compressedWindowText: 'window',
        precompressedStats: {
            originalLength: 100,
            compressedLength: 80,
            removedGreetingCount: 0,
            removedDuplicateCount: 0,
            mergedRunCount: 0,
            truncatedToolOutputCount: 0,
        },
        taskDescription: 'desc',
        promptBudget: {
            maxTokens: 3200,
            maxLatencyMs: 0,
            maxCost: 0.38,
        },
        metaRefreshSignals: {
            lastQualityRefreshAssistantTurnCount: 0,
        },
    };
}

describe('ingest-committer', (): void => {
    it('commitSkipped 会记录健康并推进 skipped 游标', async (): Promise<void> => {
        const recordExtractHealth = vi.fn().mockResolvedValue(undefined);
        const setMemoryIngestProgress = vi.fn().mockResolvedValue(undefined);
        const committer = new IngestCommitter({
            chatKey: 'chat-001',
            chatStateManager: {
                getExtractHealth: async () => ({ recentTasks: [], lastAcceptedAt: 0 }),
                recordExtractHealth,
                setMemoryIngestProgress,
            } as any,
            metaManager: {
                markRefreshCheckpoints: async () => undefined,
                markLastExtract: async () => undefined,
            } as any,
            turnTracker: null,
        });

        const result = await committer.commitSkipped({
            plan: buildPlan(),
            logicalView: buildLogicalView(),
        });

        expect(result.shouldSettleWindow).toBe(true);
        expect(result.finalOutcome).toBe('skipped');
        expect(recordExtractHealth).toHaveBeenCalledTimes(1);
        expect(setMemoryIngestProgress).toHaveBeenCalledTimes(1);
        expect(setMemoryIngestProgress.mock.calls[0][0].lastProcessedOutcome).toBe('skipped');
    });

    it('commitExecution accepted 会推进游标并返回 settle', async (): Promise<void> => {
        const markRefreshCheckpoints = vi.fn().mockResolvedValue(undefined);
        const setMemoryIngestProgress = vi.fn().mockResolvedValue(undefined);
        const committer = new IngestCommitter({
            chatKey: 'chat-001',
            chatStateManager: {
                getExtractHealth: async () => ({ recentTasks: [], lastAcceptedAt: 0 }),
                recordExtractHealth: async () => undefined,
                setMemoryIngestProgress,
                updateAdaptiveMetrics: async () => undefined,
                setLongSummaryCooldown: async () => undefined,
                setAutoSummaryRuntime: async () => undefined,
                enqueueSummaryFixTask: async () => undefined,
                getAdaptivePolicy: async () => ({ qualityRefreshInterval: 1 }),
                recomputeMemoryQuality: async () => undefined,
            } as any,
            metaManager: {
                markRefreshCheckpoints,
                markLastExtract: async () => undefined,
            } as any,
            turnTracker: null,
        });

        const execution: IngestExecutionResult = {
            mutationResult: {
                accepted: true,
                applied: {
                    factKeys: ['f1'],
                    statePaths: ['p1'],
                    summaryIds: ['s1'],
                },
                rejectedReasons: [],
            } as any,
            mutationDocument: null,
            accepted: true,
            factsApplied: 1,
            patchesApplied: 1,
            summariesApplied: 1,
            reasonCodes: [],
        };
        const result = await committer.commitExecution({
            plan: buildPlan(),
            execution,
            memory: null,
            logicalView: buildLogicalView(),
            meta: { lastQualityRefreshAssistantTurnCount: 0 },
        });

        expect(result.shouldSettleWindow).toBe(true);
        expect(result.finalOutcome).toBe('accepted');
        expect(setMemoryIngestProgress).toHaveBeenCalledTimes(1);
        expect(markRefreshCheckpoints).toHaveBeenCalledTimes(1);
    });
});
