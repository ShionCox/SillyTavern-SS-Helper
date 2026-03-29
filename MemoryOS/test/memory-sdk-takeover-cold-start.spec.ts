import { beforeEach, describe, expect, it, vi } from 'vitest';

const { stateStore, saveEntryMock, getWorldProfileBindingMock } = vi.hoisted(() => {
    return {
        stateStore: new Map<string, Record<string, unknown>>(),
        saveEntryMock: vi.fn(async () => ({ entryId: 'entry-1' })),
        getWorldProfileBindingMock: vi.fn(async () => null),
    };
});

vi.mock('../src/db/db', () => {
    return {
        readMemoryOSChatState: vi.fn(async (chatKey: string) => {
            const state = stateStore.get(chatKey);
            return state ? { state } : null;
        }),
        writeMemoryOSChatState: vi.fn(async (chatKey: string, patch: Record<string, unknown>) => {
            const current = stateStore.get(chatKey) ?? {};
            stateStore.set(chatKey, { ...current, ...patch });
        }),
        saveMemoryTakeoverPreview: vi.fn(async () => undefined),
        loadMemoryTakeoverPreview: vi.fn(async () => ({
            baseline: null,
            activeSnapshot: null,
            latestBatch: null,
            consolidation: null,
        })),
        loadMemoryTakeoverBatchResults: vi.fn(async () => []),
        readMemoryTakeoverPlan: vi.fn(async () => null),
        writeMemoryTakeoverPlan: vi.fn(async () => undefined),
        exportMemoryChatDatabaseSnapshot: vi.fn(async () => ({
            chatKey: 'chat-1',
            generatedAt: Date.now(),
            events: [],
            templates: [],
            audit: [],
            meta: null,
            memoryMutationHistory: [],
            memoryEntryAuditRecords: [],
            memoryEntries: [],
            memoryEntryTypes: [],
            actorMemoryProfiles: [],
            roleEntryMemory: [],
            summarySnapshots: [],
            worldProfileBindings: [],
            pluginState: null,
            pluginRecords: [],
        })),
        exportMemoryPromptTestBundle: vi.fn(async () => ({})),
        importMemoryPromptTestBundle: vi.fn(async () => ({})),
        restoreArchivedMemoryChat: vi.fn(async () => undefined),
        clearMemoryChatData: vi.fn(async () => undefined),
    };
});

vi.mock('../src/core/events-manager', () => {
    class EventsManager {
        public append = vi.fn(async () => 'event-1');
        public query = vi.fn(async () => []);
        public getById = vi.fn(async () => undefined);
        public count = vi.fn(async () => 0);
        public countByTypes = vi.fn(async () => 0);
    }
    return { EventsManager };
});

vi.mock('../src/core/unified-memory-manager', () => {
    class UnifiedMemoryManager {
        constructor(_chatKey: string) {}

        /**
         * 功能：返回当前世界书绑定。
         * @returns 绑定结果。
         */
        public async getWorldProfileBinding(): Promise<null> {
            return getWorldProfileBindingMock();
        }

        /**
         * 功能：保存记忆条目。
         * @returns 保存结果。
         */
        public async saveEntry(): Promise<{ entryId: string }> {
            return saveEntryMock();
        }

        /**
         * 功能：确保角色档案存在。
         * @returns 异步完成。
         */
        public async ensureActorProfile(): Promise<void> {
            return;
        }

        /**
         * 功能：绑定角色与记忆条目。
         * @returns 异步完成。
         */
        public async bindRoleToEntry(): Promise<void> {
            return;
        }

        /**
         * 功能：写入总结快照。
         * @returns 异步完成。
         */
        public async applySummarySnapshot(): Promise<void> {
            return;
        }
    }
    return { UnifiedMemoryManager };
});

vi.mock('../../../SDK/tavern', () => {
    return {
        buildSdkChatKeyEvent: vi.fn(() => 'chat-1'),
        getCurrentTavernCharacterEvent: vi.fn(() => null),
        getTavernMessageTextEvent: vi.fn(() => ''),
        getTavernRuntimeContextEvent: vi.fn(() => ({ chat: [] })),
        getCurrentTavernUserSnapshotEvent: vi.fn(() => null),
        getTavernSemanticSnapshotEvent: vi.fn(() => null),
        loadTavernWorldbookEntriesEvent: vi.fn(async () => []),
        resolveTavernCharacterWorldbookBindingEvent: vi.fn(() => ({ allBooks: [] })),
    };
});

vi.mock('../src/memory-summary', () => {
    return {
        readMemoryLLMApi: vi.fn(() => null),
        registerMemoryLLMTasks: vi.fn(),
    };
});

vi.mock('../src/memory-bootstrap', () => {
    return {
        applyBootstrapCandidates: vi.fn(async () => ({ worldProfile: null })),
        runBootstrapOrchestrator: vi.fn(async () => ({ document: null, candidates: [], sourceBundle: null })),
    };
});

vi.mock('../src/memory-takeover', () => {
    return {
        buildProgressSnapshot: vi.fn(async () => null),
        buildTakeoverPlan: vi.fn(),
        buildTakeoverPreviewEstimate: vi.fn(),
        collectTakeoverSourceBundle: vi.fn(() => ({ messages: [] })),
        detectTakeoverNeeded: vi.fn(async () => ({ needed: false })),
        runTakeoverConsolidation: vi.fn(),
        runTakeoverScheduler: vi.fn(),
    };
});

vi.mock('../src/settings/store', () => {
    return {
        readMemoryOSSettings: vi.fn(() => ({
            summaryAutoTriggerEnabled: false,
            summaryIntervalFloors: 10,
            summaryMinMessages: 10,
            summaryRecentWindowSize: 20,
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

vi.mock('../src/runtime/runtime-services', () => {
    return {
        logger: {
            warn: vi.fn(),
            info: vi.fn(),
        },
    };
});

import { MemorySDKImpl } from '../src/sdk/memory-sdk';
import type { MemoryTakeoverConsolidationResult } from '../src/types';

describe('memory sdk takeover cold start sync', () => {
    beforeEach(() => {
        stateStore.clear();
        saveEntryMock.mockClear();
        getWorldProfileBindingMock.mockClear();
        getWorldProfileBindingMock.mockResolvedValue(null);
    });

    it('marks cold start as completed after takeover consolidation is applied', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-1',
            chapterDigestIndex: [],
            longTermFacts: [],
            relationState: [],
            taskState: [],
            worldState: {},
            activeSnapshot: {
                currentScene: '测试场景',
                currentLocation: '测试地点',
                currentTimeHint: '现在',
                activeGoals: [],
                activeRelations: [],
                openThreads: [],
                recentDigest: '测试摘要',
            },
            dedupeStats: {
                longTermFacts: 0,
                relationUpdates: 0,
                taskUpdates: 0,
                worldUpdates: 0,
            },
            conflictStats: {
                unresolvedFacts: 0,
                unresolvedRelations: 0,
                unresolvedTasks: 0,
                unresolvedWorldStates: 0,
            },
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        const status = await sdk.chatState.getColdStartStatus();
        expect(status.completed).toBe(true);
        expect(status.completedAt).toBeTypeOf('number');
        expect(stateStore.get('chat-1')?.coldStartLastReasonCode).toBe('old_chat_takeover_completed');
    });
});
