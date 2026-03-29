import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    stateStore,
    saveEntryMock,
    getWorldProfileBindingMock,
    putWorldProfileBindingMock,
    appendMutationHistoryMock,
    ensureActorProfileMock,
    bindRoleToEntryMock,
    listActorProfilesMock,
    listEntriesMock,
    getEntryMock,
} = vi.hoisted(() => {
    return {
        stateStore: new Map<string, Record<string, unknown>>(),
        saveEntryMock: vi.fn(async (input?: Record<string, unknown>) => ({
            entryId: String(input?.entryId ?? 'entry-1'),
        })),
        getWorldProfileBindingMock: vi.fn(async () => null),
        putWorldProfileBindingMock: vi.fn(async () => ({
            primaryProfile: 'fantasy_magic',
            secondaryProfiles: [],
            confidence: 0.8,
            reasonCodes: ['kw:dragon'],
            detectedFrom: [],
        })),
        appendMutationHistoryMock: vi.fn(async () => undefined),
        ensureActorProfileMock: vi.fn(async () => undefined),
        bindRoleToEntryMock: vi.fn(async () => undefined),
        listActorProfilesMock: vi.fn(async () => [{ actorKey: 'user', displayName: '用户' }]),
        listEntriesMock: vi.fn(async () => []),
        getEntryMock: vi.fn(async () => null),
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
         * 功能：返回当前世界画像绑定。
         * @returns 绑定结果。
         */
        public async getWorldProfileBinding(): Promise<null> {
            return getWorldProfileBindingMock();
        }

        /**
         * 功能：写入世界画像绑定。
         * @returns 异步完成。
         */
        public async putWorldProfileBinding(input: Record<string, unknown>): Promise<void> {
            return putWorldProfileBindingMock(input);
        }

        /**
         * 功能：追加变更历史。
         * @returns 异步完成。
         */
        public async appendMutationHistory(input: Record<string, unknown>): Promise<void> {
            return appendMutationHistoryMock(input);
        }

        /**
         * 功能：保存记忆条目。
         * @returns 保存结果。
         */
        public async saveEntry(input?: Record<string, unknown>): Promise<{ entryId: string }> {
            return saveEntryMock(input);
        }

        /**
         * 功能：确保角色档案存在。
         * @returns 异步完成。
         */
        public async ensureActorProfile(input?: Record<string, unknown>): Promise<void> {
            return ensureActorProfileMock(input);
        }

        /**
         * 功能：绑定角色与记忆条目。
         * @returns 异步完成。
         */
        public async bindRoleToEntry(actorKey: string, entryId: string): Promise<void> {
            return bindRoleToEntryMock(actorKey, entryId);
        }

        /**
         * 功能：列出角色档案。
         * @returns 角色档案列表。
         */
        public async listActorProfiles(): Promise<Array<{ actorKey: string; displayName: string }>> {
            return listActorProfilesMock();
        }

        /**
         * 功能：列出记忆条目。
         * @returns 记忆条目列表。
         */
        public async listEntries(filters?: Record<string, unknown>): Promise<unknown[]> {
            return listEntriesMock(filters);
        }

        /**
         * 功能：按 ID 读取记忆条目。
         * @returns 条目详情。
         */
        public async getEntry(entryId: string): Promise<unknown> {
            return getEntryMock(entryId);
        }

        /**
         * 功能：占位实现总结快照写入。
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
        putWorldProfileBindingMock.mockClear();
        appendMutationHistoryMock.mockClear();
        ensureActorProfileMock.mockClear();
        bindRoleToEntryMock.mockClear();
        listActorProfilesMock.mockClear();
        listEntriesMock.mockClear();
        getEntryMock.mockClear();
        listActorProfilesMock.mockResolvedValue([{ actorKey: 'user', displayName: '用户' }]);
        listEntriesMock.mockResolvedValue([]);
        getEntryMock.mockResolvedValue(null);
    });

    it('marks cold start as completed and binds world profile after takeover consolidation is applied', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-1',
            chapterDigestIndex: [{
                batchId: 'takeover-1:history:0001',
                range: {
                    startFloor: 1,
                    endFloor: 20,
                },
                summary: '奇幻魔法世界里，金色幼龙在森林龙穴附近活动，并与精灵少女相遇。',
                tags: ['奇幻', '龙', '森林'],
            }],
            actorCards: [],
            relationships: [],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [{
                type: 'world',
                subject: '世界观',
                predicate: '类型是',
                value: '奇幻魔法世界',
                confidence: 0.95,
            }],
            relationState: [],
            taskState: [],
            worldState: {
                当前地点: '艾尔文森林龙穴附近',
            },
            activeSnapshot: {
                generatedAt: Date.now(),
                currentScene: '幼龙在森林里观察周围动静',
                currentLocation: '艾尔文森林龙穴附近',
                currentTimeHint: '白天',
                activeGoals: [],
                activeRelations: [],
                openThreads: [],
                recentDigest: '当前剧情围绕森林、龙穴、精灵少女和奇幻势力展开。',
            },
            dedupeStats: {
                totalFacts: 1,
                dedupedFacts: 0,
                relationUpdates: 0,
                taskUpdates: 0,
                worldUpdates: 1,
            },
            conflictStats: {
                unresolvedFacts: 0,
                unresolvedRelations: 0,
                unresolvedTasks: 0,
                unresolvedWorldStates: 0,
                unresolvedEntities: 0,
            },
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        const status = await sdk.chatState.getColdStartStatus();
        expect(status.completed).toBe(true);
        expect(status.completedAt).toBeTypeOf('number');
        expect(stateStore.get('chat-1')?.coldStartLastReasonCode).toBe('old_chat_takeover_completed');
        expect(putWorldProfileBindingMock).toHaveBeenCalledTimes(1);
        expect(putWorldProfileBindingMock).toHaveBeenCalledWith(expect.objectContaining({
            primaryProfile: expect.any(String),
            detectedFrom: expect.arrayContaining([
                expect.stringContaining('奇幻魔法世界'),
            ]),
        }));
        expect(appendMutationHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
            action: 'world_profile_bound',
        }));
    });

    it('creates different actor keys for multiple Chinese actor cards during takeover consolidation', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-3',
            chapterDigestIndex: [],
            actorCards: [
                {
                    actorKey: 'actor:橙狗狗',
                    displayName: '橙狗狗',
                    aliases: [],
                    identityFacts: ['何盈的青梅竹马'],
                    originFacts: [],
                    traits: ['后知后觉'],
                },
                {
                    actorKey: 'actor:何盈',
                    displayName: '何盈',
                    aliases: [],
                    identityFacts: ['山神新娘'],
                    originFacts: [],
                    traits: ['倔强'],
                },
            ],
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
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        const actorEnsureCalls = ensureActorProfileMock.mock.calls
            .map((call) => call[0] as { actorKey?: string; displayName?: string })
            .filter((item) => item.displayName === '橙狗狗' || item.displayName === '何盈');

        expect(actorEnsureCalls).toHaveLength(2);
        expect(actorEnsureCalls[0]?.actorKey).not.toBe(actorEnsureCalls[1]?.actorKey);
        expect(actorEnsureCalls[0]?.actorKey).toMatch(/^actor_/);
        expect(actorEnsureCalls[1]?.actorKey).toMatch(/^actor_/);
    });

    it('writes non-actor relation targets back onto entity entries instead of creating actor profiles', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        listEntriesMock.mockImplementation(async (filters?: Record<string, unknown>) => {
            if (filters?.entryType === 'organization') {
                return [{ entryId: 'org-1', title: '月语教派', detailPayload: { compareKey: 'organization:月语教派', fields: {} }, tags: ['organization'], summary: '原始摘要', detail: '' }];
            }
            return [];
        });
        getEntryMock.mockResolvedValue({
            entryId: 'org-1',
            title: '月语教派',
            entryType: 'organization',
            category: '组织',
            tags: ['organization'],
            summary: '原始摘要',
            detail: '',
            detailPayload: {
                compareKey: 'organization:月语教派',
                fields: {},
            },
        });

        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-2',
            chapterDigestIndex: [],
            actorCards: [],
            relationships: [],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [],
            relationState: [
                {
                    target: '月语教派',
                    targetType: 'organization',
                    relationTag: '盟友',
                    state: '保持接触与有限合作',
                    reason: '来自旧聊天整理结果',
                },
            ],
            taskState: [],
            worldState: {},
            activeSnapshot: null,
            dedupeStats: {
                totalFacts: 0,
                dedupedFacts: 0,
                relationUpdates: 1,
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
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        expect(ensureActorProfileMock).not.toHaveBeenCalledWith(expect.objectContaining({
            displayName: '月语教派',
        }));
        expect(saveEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            entryId: 'org-1',
            entryType: 'organization',
            detailPayload: expect.objectContaining({
                fields: expect.objectContaining({
                    userRelationTag: '盟友',
                    userRelationState: '保持接触与有限合作',
                }),
            }),
        }));
    });

    it('writes structured takeover relationships and strips target view suffixes', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        listActorProfilesMock.mockResolvedValue([{ actorKey: 'user', displayName: '用户' }]);

        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-4',
            chapterDigestIndex: [],
            actorCards: [
                {
                    actorKey: 'actor:橙狗狗',
                    displayName: '橙狗狗',
                    aliases: [],
                    identityFacts: [],
                    originFacts: [],
                    traits: [],
                },
                {
                    actorKey: 'actor:何盈',
                    displayName: '何盈',
                    aliases: ['何盈（橙狗狗视角）'],
                    identityFacts: [],
                    originFacts: [],
                    traits: [],
                },
            ],
            relationships: [
                {
                    sourceActorKey: 'actor:橙狗狗',
                    targetActorKey: 'actor:何盈',
                    participants: ['actor:橙狗狗', 'actor:何盈'],
                    relationTag: '暧昧',
                    state: '梦中互相许诺后的深度依恋与不愿分离',
                    summary: '两人在深层梦境中形成高度依恋。',
                    trust: 0.83,
                    affection: 0.91,
                    tension: 0.16,
                },
            ],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [],
            relationState: [
                {
                    target: '何盈（橙狗狗视角）',
                    state: '梦中互相许诺后的深度依恋与不愿分离',
                    reason: '两人在深层梦境中完成高强度情感交融。',
                    relationTag: '暧昧',
                    targetType: 'actor',
                },
            ],
            taskState: [],
            worldState: {},
            activeSnapshot: null,
            dedupeStats: {
                totalFacts: 0,
                dedupedFacts: 0,
                relationUpdates: 1,
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
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        expect(saveEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            entryType: 'relationship',
            detailPayload: expect.objectContaining({
                sourceActorKey: expect.stringMatching(/^actor_/),
                targetActorKey: expect.stringMatching(/^actor_/),
                fields: expect.objectContaining({
                    relationTag: '暧昧',
                    participants: expect.arrayContaining([
                        expect.stringMatching(/^actor_/),
                        expect.stringMatching(/^actor_/),
                    ]),
                }),
            }),
        }), expect.anything());
    });

    it('binds event facts onto matched actor cards when event text mentions known actors', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-5',
            chapterDigestIndex: [],
            actorCards: [
                {
                    actorKey: 'he_ying',
                    displayName: '何盈',
                    aliases: [],
                    identityFacts: [],
                    originFacts: [],
                    traits: [],
                },
            ],
            relationships: [],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [
                {
                    type: 'event',
                    subject: '何盈',
                    predicate: '死亡',
                    value: '何盈已去世，橙狗狗回村参加其丧事并被安排守灵',
                    confidence: 0.88,
                },
            ],
            relationState: [],
            taskState: [],
            worldState: {},
            activeSnapshot: null,
            dedupeStats: {
                totalFacts: 1,
                dedupedFacts: 1,
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
            generatedAt: Date.now(),
        };

        await (sdk as unknown as { applyTakeoverConsolidation: (value: MemoryTakeoverConsolidationResult) => Promise<void> })
            .applyTakeoverConsolidation(result);

        expect(bindRoleToEntryMock).toHaveBeenCalledWith(expect.stringMatching(/^he_ying|^actor_/), expect.any(String));
    });
});
