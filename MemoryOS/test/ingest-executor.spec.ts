import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/llm/memoryLlmBridge', () => ({
    runGeneration: vi.fn(),
}));
vi.mock('../src/core/ai-json-system', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/core/ai-json-system')>();
    return {
        ...actual,
        validateAiJsonOutput: vi.fn(),
    };
});

import { runGeneration } from '../src/llm/memoryLlmBridge';
import { validateAiJsonOutput } from '../src/core/ai-json-system';
import { IngestExecutor } from '../src/core/ingest-executor';
import type { IngestPlan } from '../src/core/ingest-types';

function buildPlan(): IngestPlan {
    return {
        selection: {
            windowHash: 'w1',
            windowMessages: [],
            fromMessageId: 'm1',
            toMessageId: 'm2',
            lastAssistantTurnId: 't1',
            lastAssistantMessageId: 'm2',
            lastAssistantTurnCount: 10,
            pendingAssistantTurns: 2,
            repairTriggered: false,
        },
        currentAssistantTurnCount: 10,
        repairGeneration: 1,
        triggerBySpecialEvent: false,
        summaryEnabled: true,
        summaryInterval: 12,
        chatProfile: null,
        previousLorebookDecision: null,
        lorebookDecision: { mode: 'soft_inject', shouldExtractWorldFacts: true, score: 0.8 } as any,
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
            windowHash: 'w1',
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
        windowText: 'window text',
        compressedWindowText: 'window text',
        precompressedStats: {
            originalLength: 100,
            compressedLength: 80,
            removedGreetingCount: 0,
            removedDuplicateCount: 0,
            mergedRunCount: 0,
            truncatedToolOutputCount: 0,
        },
        taskDescription: 'ingest task',
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

describe('ingest-executor', (): void => {
    beforeEach((): void => {
        vi.clearAllMocks();
    });

    it('memory 不可写时直接返回失败摘要', async (): Promise<void> => {
        const executor = new IngestExecutor({ getById: async () => null } as any);
        const result = await executor.execute({
            plan: buildPlan(),
            memory: null,
        });
        expect(result.mutationResult).toBeNull();
        expect(result.reasonCodes).toContain('task_request_failed');
    });

    it('invalid_json 会触发一次紧凑重试后继续落库', async (): Promise<void> => {
        const generationMock = vi.mocked(runGeneration as any);
        generationMock
            .mockResolvedValueOnce({ ok: false, reasonCode: 'invalid_json', error: 'invalid_json' })
            .mockResolvedValueOnce({ ok: true, data: { any: 'payload' } });
        vi.mocked(validateAiJsonOutput as any).mockReturnValue({
            ok: true,
            payload: {
                updates: [],
            },
        });

        const applyMutationDocument = vi.fn().mockResolvedValue({
            accepted: true,
            applied: {
                factKeys: ['f1'],
                statePaths: ['p1'],
                summaryIds: ['s1'],
            },
            rejectedReasons: [],
        });
        const executor = new IngestExecutor({ getById: async () => null } as any);
        const result = await executor.execute({
            plan: buildPlan(),
            memory: {
                mutation: { applyMutationDocument },
                getActiveTemplateId: async () => '',
            } as any,
        });

        expect(generationMock).toHaveBeenCalledTimes(2);
        expect(applyMutationDocument).toHaveBeenCalledTimes(1);
        expect(result.accepted).toBe(true);
        expect(result.factsApplied).toBe(1);
        expect(result.patchesApplied).toBe(1);
        expect(result.summariesApplied).toBe(1);
    });
});
