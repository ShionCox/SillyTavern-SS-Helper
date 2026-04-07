import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    loadPreviewMock,
    loadBatchResultsMock,
    loadBatchFailureStatesMock,
    saveBatchMetaMock,
    runBaselineMock,
    runActiveSnapshotMock,
    runBatchMock,
    runConsolidationMock,
    applyConsolidationMock,
} = vi.hoisted(() => {
    return {
        loadPreviewMock: vi.fn(),
        loadBatchResultsMock: vi.fn(),
        loadBatchFailureStatesMock: vi.fn(),
        saveBatchMetaMock: vi.fn(async () => undefined),
        runBaselineMock: vi.fn(),
        runActiveSnapshotMock: vi.fn(),
        runBatchMock: vi.fn(),
        runConsolidationMock: vi.fn(),
        applyConsolidationMock: vi.fn(async () => undefined),
    };
});

vi.mock('../src/db/db', () => {
    return {
        loadMemoryTakeoverBatchFailureStates: loadBatchFailureStatesMock,
        loadMemoryTakeoverBatchMetas: vi.fn(async () => []),
        loadMemoryTakeoverBatchResults: loadBatchResultsMock,
        loadMemoryTakeoverPreview: loadPreviewMock,
        readMemoryTimelineProfile: vi.fn(async () => null),
        readMemoryTakeoverPlan: vi.fn(async () => null),
        saveCandidateActorMentions: vi.fn(async () => undefined),
        saveMemoryTakeoverBatchMeta: saveBatchMetaMock,
        saveMemoryTakeoverBatchResult: vi.fn(async () => undefined),
        saveMemoryTakeoverPreview: vi.fn(async () => undefined),
        writeMemoryTimelineProfile: vi.fn(async () => undefined),
        writeMemoryTakeoverPlan: vi.fn(async () => undefined),
    };
});

vi.mock('../src/settings/store', () => {
    return {
        readMemoryOSSettings: vi.fn(() => ({
            takeoverRequestIntervalSeconds: 0,
        })),
    };
});

vi.mock('../src/memory-takeover/takeover-diagnostics', () => {
    return {
        appendTakeoverDiagnostics: vi.fn(async () => undefined),
    };
});

vi.mock('../src/memory-takeover/takeover-active-snapshot', () => {
    return {
        runTakeoverActiveSnapshot: runActiveSnapshotMock,
    };
});

vi.mock('../src/memory-takeover/takeover-batch-admission', () => {
    return {
        admitTakeoverBatchResult: vi.fn((result) => ({
            accepted: true,
            result,
            validationErrors: [],
            repairActions: [],
        })),
    };
});

vi.mock('../src/memory-takeover/takeover-baseline', () => {
    return {
        runTakeoverBaseline: runBaselineMock,
    };
});

vi.mock('../src/memory-takeover/takeover-batch-runner', () => {
    return {
        assembleTakeoverBatchPromptAssembly: vi.fn(async () => ({
            extractionMessages: [],
            channels: { hintText: '' },
        })),
        runTakeoverBatch: runBatchMock,
    };
});

vi.mock('../src/memory-takeover/takeover-consolidator', () => {
    return {
        runTakeoverConsolidation: runConsolidationMock,
    };
});

vi.mock('../src/memory-takeover/takeover-planner', () => {
    return {
        buildTakeoverBatches: vi.fn(() => ([
            {
                takeoverId: 'takeover-1',
                batchId: 'takeover-1:history:0001',
                batchIndex: 0,
                range: { startFloor: 1, endFloor: 10 },
                category: 'history',
                status: 'pending',
                attemptCount: 0,
                sourceMessageIds: [],
            },
            {
                takeoverId: 'takeover-1',
                batchId: 'takeover-1:history:0002',
                batchIndex: 1,
                range: { startFloor: 11, endFloor: 20 },
                category: 'history',
                status: 'pending',
                attemptCount: 0,
                sourceMessageIds: [],
            },
        ])),
        validateTakeoverBatchCoverage: vi.fn(() => ({
            covered: true,
            uncoveredRanges: [],
        })),
    };
});

vi.mock('../src/memory-takeover/takeover-source', () => {
    return {
        collectTakeoverSourceBundle: vi.fn(() => ({
            totalFloors: 20,
        })),
        sliceTakeoverMessages: vi.fn((_bundle, range) => ([
            {
                floor: range.startFloor,
                role: 'user',
                content: '测试消息',
            },
        ])),
    };
});

import { runTakeoverScheduler } from '../src/memory-takeover/takeover-scheduler';

describe('runTakeoverScheduler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        loadPreviewMock.mockResolvedValue({
            baseline: {
                generatedAt: 1,
                summary: '已有 baseline',
            },
            activeSnapshot: {
                generatedAt: 2,
                currentScene: '已有 active snapshot',
                currentLocation: '旧地点',
                currentTimeHint: '夜晚',
                activeGoals: [],
                activeRelations: [],
                openThreads: [],
                recentDigest: '已有摘要',
            },
            latestBatch: null,
            consolidation: null,
        });
        loadBatchResultsMock.mockResolvedValue([
            {
                batchId: 'takeover-1:history:0001',
                sourceRange: { startFloor: 1, endFloor: 10 },
                candidateActors: [],
                repairedOnce: false,
            },
        ]);
        loadBatchFailureStatesMock.mockResolvedValue(new Map());
        runBatchMock.mockResolvedValue({
            batchId: 'takeover-1:history:0002',
            sourceRange: { startFloor: 11, endFloor: 20 },
            candidateActors: [],
            repairedOnce: false,
        });
        runConsolidationMock.mockResolvedValue({
            takeoverId: 'takeover-1',
            chapterDigestIndex: [],
            actorCards: [],
            relationships: [],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [],
            relationState: [],
            taskState: [],
            worldState: {},
            activeSnapshot: null,
            dedupeStats: {
                totalFacts: 0,
                dedupedFacts: 0,
                relationUpdates: 0,
                taskUpdates: 0,
                worldUpdates: 0,
            },
            conflictStats: {
                unresolvedFacts: 0,
                unresolvedRelations: 0,
                unresolvedTasks: 0,
                unresolvedWorldStates: 0,
                unresolvedEntities: 0,
            },
            generatedAt: 3,
        });
    });

    it('恢复执行时会跳过已完成批次，并复用已有 baseline 与 activeSnapshot', async () => {
        const progress = await runTakeoverScheduler({
            chatKey: 'chat-1',
            plan: {
                chatKey: 'chat-1',
                chatId: 'chat-1',
                takeoverId: 'takeover-1',
                status: 'failed',
                mode: 'full',
                range: { startFloor: 1, endFloor: 20 },
                totalFloors: 20,
                recentFloors: 20,
                batchSize: 10,
                useActiveSnapshot: true,
                activeSnapshotFloors: 5,
                prioritizeRecent: true,
                autoContinue: true,
                autoConsolidate: true,
                pauseOnError: true,
                activeWindow: { startFloor: 16, endFloor: 20 },
                currentBatchIndex: 0,
                totalBatches: 2,
                completedBatchIds: ['takeover-1:history:0001'],
                failedBatchIds: ['takeover-1:history:0002'],
                isolatedBatchIds: [],
                createdAt: 1,
                updatedAt: 1,
            },
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
            applyConsolidation: applyConsolidationMock,
        });

        expect(runBaselineMock).not.toHaveBeenCalled();
        expect(runActiveSnapshotMock).not.toHaveBeenCalled();
        expect(runBatchMock).toHaveBeenCalledTimes(1);
        expect(runBatchMock).toHaveBeenCalledWith(expect.objectContaining({
            batch: expect.objectContaining({
                batchId: 'takeover-1:history:0002',
            }),
        }));
        expect(applyConsolidationMock).toHaveBeenCalledTimes(1);
        expect(progress.plan?.completedBatchIds).toEqual(expect.arrayContaining([
            'takeover-1:history:0001',
            'takeover-1:history:0002',
        ]));
    });

    it('指定失败批次重试时只执行目标批次，其他失败批次保持阻塞等待', async () => {
        loadBatchResultsMock.mockResolvedValue([]);
        runConsolidationMock.mockClear();
        runBatchMock.mockResolvedValue({
            batchId: 'takeover-1:history:0002',
            sourceRange: { startFloor: 11, endFloor: 20 },
            candidateActors: [],
            repairedOnce: false,
        });

        const progress = await runTakeoverScheduler({
            chatKey: 'chat-1',
            plan: {
                chatKey: 'chat-1',
                chatId: 'chat-1',
                takeoverId: 'takeover-1',
                status: 'paused',
                mode: 'full',
                range: { startFloor: 1, endFloor: 20 },
                totalFloors: 20,
                recentFloors: 20,
                batchSize: 10,
                useActiveSnapshot: false,
                activeSnapshotFloors: 0,
                prioritizeRecent: true,
                autoContinue: true,
                autoConsolidate: true,
                pauseOnError: true,
                activeWindow: null,
                currentBatchIndex: 0,
                totalBatches: 2,
                completedBatchIds: [],
                failedBatchIds: ['takeover-1:history:0001', 'takeover-1:history:0002'],
                isolatedBatchIds: [],
                requestedRetryBatchId: 'takeover-1:history:0002',
                createdAt: 1,
                updatedAt: 1,
            },
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
            applyConsolidation: applyConsolidationMock,
        });

        expect(runBatchMock).toHaveBeenCalledTimes(1);
        expect(runBatchMock).toHaveBeenCalledWith(expect.objectContaining({
            batch: expect.objectContaining({
                batchId: 'takeover-1:history:0002',
            }),
        }));
        expect(runConsolidationMock).not.toHaveBeenCalled();
        expect(progress.plan?.status).toBe('blocked_by_batch');
        expect(progress.plan?.failedBatchIds).toEqual(['takeover-1:history:0001']);
    });

    it('连续失败超过阈值后应进入 blocked_by_batch，并累计失败次数', async () => {
        loadBatchResultsMock.mockResolvedValue([]);
        loadBatchFailureStatesMock.mockResolvedValue(new Map([
            ['takeover-1:history:0001', {
                batchId: 'takeover-1:history:0001',
                failureCount: 5,
                consecutiveFailureCount: 5,
                lastFailureAt: 100,
                lastErrorMessage: 'timeout',
                lastErrorKind: 'llm_timeout',
                retryable: true,
                requiresManualReview: false,
                quarantined: false,
                attemptCount: 5,
            }],
        ]));
        runBatchMock.mockRejectedValue(new Error('timeout'));

        const progress = await runTakeoverScheduler({
            chatKey: 'chat-1',
            plan: {
                chatKey: 'chat-1',
                chatId: 'chat-1',
                takeoverId: 'takeover-1',
                status: 'blocked_by_batch',
                mode: 'full',
                range: { startFloor: 1, endFloor: 20 },
                totalFloors: 20,
                recentFloors: 20,
                batchSize: 10,
                useActiveSnapshot: false,
                activeSnapshotFloors: 0,
                prioritizeRecent: true,
                autoContinue: true,
                autoConsolidate: true,
                pauseOnError: true,
                activeWindow: null,
                currentBatchIndex: 0,
                totalBatches: 2,
                completedBatchIds: [],
                failedBatchIds: ['takeover-1:history:0001'],
                isolatedBatchIds: [],
                requestedRetryBatchId: 'takeover-1:history:0001',
                blockedBatchId: 'takeover-1:history:0001',
                createdAt: 1,
                updatedAt: 1,
            },
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
            applyConsolidation: applyConsolidationMock,
        });

        expect(progress.plan?.status).toBe('blocked_by_batch');
        expect(progress.plan?.blockedBatchId).toBe('takeover-1:history:0001');
        expect(progress.plan?.degradedReason).toBe('batch_requires_manual_review');
        expect(progress.plan?.failedBatchIds).toEqual(['takeover-1:history:0001']);
        expect(saveBatchMetaMock).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            batchId: 'takeover-1:history:0001',
            status: 'failed',
            attemptCount: 6,
            failureCount: 6,
            consecutiveFailureCount: 6,
            requiresManualReview: true,
            quarantined: true,
            lastErrorKind: 'llm_timeout',
        }));
    });
});
