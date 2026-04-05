import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    readPlanMock,
    writePlanMock,
    runSchedulerMock,
} = vi.hoisted(() => {
    return {
        readPlanMock: vi.fn(),
        writePlanMock: vi.fn(async () => undefined),
        runSchedulerMock: vi.fn(async (input) => ({
            plan: input.plan,
            currentBatch: null,
            baseline: null,
            activeSnapshot: null,
            latestBatchResult: null,
            consolidation: null,
            batchResults: [],
        })),
    };
});

vi.mock('../src/db/db', () => {
    return {
        clearMemoryTakeoverPreview: vi.fn(async () => undefined),
        readMemoryOSChatState: vi.fn(async () => ({ state: {} })),
        loadMemoryTakeoverBatchResults: vi.fn(async () => []),
        loadMemoryTakeoverPreview: vi.fn(async () => ({
            baseline: null,
            activeSnapshot: null,
            latestBatch: null,
            consolidation: null,
        })),
        readMemoryTakeoverPlan: readPlanMock,
        saveMemoryTakeoverPreview: vi.fn(async () => undefined),
        writeMemoryOSChatState: vi.fn(async () => undefined),
        writeMemoryTakeoverPlan: writePlanMock,
    };
});

vi.mock('../src/memory-takeover', () => {
    return {
        buildProgressSnapshot: vi.fn(async (chatKey: string, plan: unknown) => ({
            plan,
            currentBatch: null,
            baseline: null,
            activeSnapshot: null,
            latestBatchResult: null,
            consolidation: null,
            batchResults: [],
            chatKey,
        })),
        buildTakeoverBatches: vi.fn(() => []),
        buildTakeoverKnownContext: vi.fn(() => ({})),
        buildTakeoverPlan: vi.fn(),
        buildTakeoverPreviewEstimate: vi.fn(),
        buildTakeoverStructuredTaskRequest: vi.fn(),
        collectTakeoverSourceBundle: vi.fn(() => ({ totalFloors: 100, messages: [] })),
        detectTakeoverNeeded: vi.fn(async () => ({ needed: false, currentFloorCount: 100, threshold: 50 })),
        runTakeoverConsolidation: vi.fn(),
        runTakeoverScheduler: runSchedulerMock,
        assembleTakeoverBatchPromptAssembly: vi.fn(),
    };
});

vi.mock('../src/settings/store', () => {
    return {
        readMemoryOSSettings: vi.fn(() => ({
            takeoverDetectMinFloors: 50,
            takeoverDefaultRecentFloors: 60,
            takeoverDefaultBatchSize: 30,
            takeoverDefaultPrioritizeRecent: true,
            takeoverDefaultAutoContinue: true,
            takeoverDefaultAutoConsolidate: true,
            takeoverDefaultPauseOnError: true,
        })),
    };
});

vi.mock('../src/memory-summary', () => {
    return {
        readMemoryLLMApi: vi.fn(() => null),
    };
});

import { TakeoverService } from '../src/services/takeover-service';
import type { MemoryTakeoverPlan } from '../src/types';

function createPlan(): MemoryTakeoverPlan {
    return {
        chatKey: 'chat-1',
        chatId: 'chat-1',
        takeoverId: 'takeover-1',
        status: 'paused',
        mode: 'full',
        range: { startFloor: 1, endFloor: 100 },
        totalFloors: 100,
        recentFloors: 60,
        batchSize: 30,
        useActiveSnapshot: true,
        activeSnapshotFloors: 60,
        prioritizeRecent: true,
        autoContinue: true,
        autoConsolidate: true,
        pauseOnError: true,
        activeWindow: { startFloor: 41, endFloor: 100 },
        currentBatchIndex: 0,
        totalBatches: 3,
        completedBatchIds: [],
        failedBatchIds: ['takeover-1:history:0002'],
        isolatedBatchIds: [],
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('TakeoverService retry flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        readPlanMock.mockResolvedValue(createPlan());
    });

    it('retryFailedBatch 不应把计划状态写回 idle，而应保持 blocked_by_batch 并标记目标批次', async () => {
        const service = new TakeoverService('chat-1');

        await service.retryFailedBatch({
            batchId: 'takeover-1:history:0002',
            llm: null,
            pluginId: 'MemoryOS',
            existingKnownEntities: {
                actors: [],
                organizations: [],
                cities: [],
                nations: [],
                locations: [],
                tasks: [],
                worldStates: [],
            },
            applyConsolidation: async () => undefined,
        });

        expect(writePlanMock).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            status: 'blocked_by_batch',
            blockedBatchId: 'takeover-1:history:0002',
            requestedRetryBatchId: 'takeover-1:history:0002',
            lastError: undefined,
        }));
        expect(runSchedulerMock).toHaveBeenCalledWith(expect.objectContaining({
            plan: expect.objectContaining({
                status: 'blocked_by_batch',
                requestedRetryBatchId: 'takeover-1:history:0002',
            }),
        }));
    });
});
