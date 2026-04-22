import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    stateStore,
    actorDisplayNameStore,
    saveEntryMock,
    applyLedgerMutationBatchMock,
    replaceRelationshipsForTakeoverMock,
    saveRelationshipMock,
    getWorldProfileBindingMock,
    putWorldProfileBindingMock,
    appendMutationHistoryMock,
    ensureActorProfileMock,
    bindRoleToEntryMock,
    listActorProfilesMock,
    listEntriesMock,
    getEntryMock,
    getTavernMessageTextEventMock,
    getTavernRuntimeContextEventMock,
} = vi.hoisted(() => {
    return {
        stateStore: new Map<string, Record<string, unknown>>(),
        actorDisplayNameStore: new Map<string, string>([['user', '你']]),
        saveEntryMock: vi.fn(async (input?: Record<string, unknown>) => ({
            entryId: String(input?.entryId ?? 'entry-1'),
        })),
        applyLedgerMutationBatchMock: vi.fn(async (mutations?: Array<Record<string, unknown>>) => {
            for (const mutation of mutations ?? []) {
                if (mutation?.action === 'UPDATE' || mutation?.action === 'UPSERT' || mutation?.action === 'ADD') {
                    const savedEntry = await saveEntryMock({
                        entryId: mutation.entryId,
                        entryType: mutation.targetKind,
                        title: mutation.title,
                        tags: mutation.tags,
                        summary: mutation.summary,
                        detail: mutation.detail,
                        detailPayload: mutation.detailPayload,
                    }, {});
                    for (const actorKey of Array.isArray(mutation?.actorBindings) ? mutation.actorBindings : []) {
                        await bindRoleToEntryMock(actorKey, String(savedEntry?.entryId ?? mutation.entryId ?? 'entry-1'));
                    }
                }
            }
            return {
                created: 0,
                updated: 0,
                invalidated: 0,
                skipped: 0,
                warnings: [],
            };
        }),
        replaceRelationshipsForTakeoverMock: vi.fn(async () => undefined),
        saveRelationshipMock: vi.fn(async (input?: Record<string, unknown>) => {
            const sourceActorKey = String(input?.sourceActorKey ?? '').trim();
            const targetActorKey = String(input?.targetActorKey ?? '').trim();
            const sourceDisplayName = actorDisplayNameStore.get(sourceActorKey)
                ?? (sourceActorKey === 'user' ? '你' : sourceActorKey.replace(/^actor_?/, ''));
            const targetDisplayName = actorDisplayNameStore.get(targetActorKey)
                ?? targetActorKey.replace(/^actor_?/, '');
            await saveEntryMock({
                entryType: 'relationship',
                title: `${sourceDisplayName}与${targetDisplayName}的关系`,
                summary: input?.summary,
                detail: input?.state,
                detailPayload: {
                    sourceActorKey,
                    targetActorKey,
                    sourceDisplayName,
                    targetDisplayName,
                    fields: {
                        relationTag: input?.relationTag,
                        participants: input?.participants,
                    },
                },
            }, {});
            return {
                relationshipId: 'rel-1',
                sourceActorKey,
                targetActorKey,
                relationTag: input?.relationTag,
                state: input?.state,
                summary: input?.summary,
                trust: input?.trust,
                affection: input?.affection,
                tension: input?.tension,
                participants: Array.isArray(input?.participants) ? input?.participants : [],
            };
        }),
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
        getTavernMessageTextEventMock: vi.fn(() => ''),
        getTavernRuntimeContextEventMock: vi.fn(() => ({ chat: [] })),
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

vi.mock('../src/repository/entry-repository', () => {
    class EntryRepository {
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
        public async saveEntry(
            input?: Record<string, unknown>,
            meta?: Record<string, unknown>,
        ): Promise<{ entryId: string }> {
            return saveEntryMock(input, meta);
        }

        public async applyLedgerMutationBatch(
            mutations?: Array<Record<string, unknown>>,
            context?: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
            return applyLedgerMutationBatchMock(mutations, context);
        }

        public async replaceRelationshipsForTakeover(records?: Array<Record<string, unknown>>): Promise<void> {
            return replaceRelationshipsForTakeoverMock(records);
        }

        public async saveRelationship(
            input?: Record<string, unknown>,
            meta?: Record<string, unknown>,
        ): Promise<Record<string, unknown>> {
            return saveRelationshipMock(input, meta);
        }

        /**
         * 功能：确保角色档案存在。
         * @returns 异步完成。
         */
        public async ensureActorProfile(input?: Record<string, unknown>): Promise<void> {
            const actorKey = String(input?.actorKey ?? '').trim();
            const displayName = String(input?.displayName ?? '').trim();
            if (actorKey && displayName) {
                actorDisplayNameStore.set(actorKey, displayName);
            }
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
    return { EntryRepository };
});

vi.mock('../../SDK/tavern', () => {
    return {
        buildSdkChatIdEvent: vi.fn(() => 'chat-1'),
        getCurrentTavernCharacterEvent: vi.fn(() => null),
        getCurrentTavernUserNameEvent: vi.fn(() => '你'),
        getTavernMessageTextEvent: getTavernMessageTextEventMock,
        getTavernRuntimeContextEvent: getTavernRuntimeContextEventMock,
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
import { readMemoryOSSettings } from '../src/settings/store';

describe('memory sdk takeover cold start sync', () => {
    beforeEach(() => {
        stateStore.clear();
        actorDisplayNameStore.clear();
        actorDisplayNameStore.set('user', '你');
        saveEntryMock.mockClear();
        applyLedgerMutationBatchMock.mockClear();
        replaceRelationshipsForTakeoverMock.mockClear();
        saveRelationshipMock.mockClear();
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
        getTavernMessageTextEventMock.mockReset();
        getTavernMessageTextEventMock.mockReturnValue('');
        getTavernRuntimeContextEventMock.mockReset();
        getTavernRuntimeContextEventMock.mockReturnValue({ chat: [] });
        vi.mocked(readMemoryOSSettings).mockReturnValue({
            summaryAutoTriggerEnabled: false,
            summaryIntervalFloors: 10,
            summaryMinMessages: 10,
            takeoverDefaultRecentFloors: 60,
            takeoverDefaultBatchSize: 30,
            takeoverDefaultPrioritizeRecent: true,
            takeoverDefaultAutoContinue: true,
            takeoverDefaultAutoConsolidate: true,
            takeoverDefaultPauseOnError: true,
        } as ReturnType<typeof readMemoryOSSettings>);
    });

    it('marks cold start as suppressed for the current chat without completing it', async () => {
        const sdk = new MemorySDKImpl('chat-1');

        await sdk.chatState.markColdStartSuppressed();

        const status = await sdk.chatState.getColdStartStatus();
        const state = stateStore.get('chat-1');
        expect(status.completed).toBe(false);
        expect(status.completedAt).toBeUndefined();
        expect(status.suppressedAt).toBeTypeOf('number');
        expect(state?.coldStartSuppressedAt).toBeTypeOf('number');
        expect(state?.coldStartCompletedAt).toBeUndefined();
    });

    it('marks cold start as completed and binds world profile after takeover consolidation is applied', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        stateStore.set('chat-1', {
            coldStartDismissedAt: 123,
            coldStartSuppressedAt: 456,
        });
        (sdk as unknown as { eventsManager: { countByTypes: ReturnType<typeof vi.fn> } }).eventsManager.countByTypes.mockResolvedValue(24);
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
        const summaryProgress = await sdk.chatState.getSummaryProgress();
        expect(status.completed).toBe(true);
        expect(status.completedAt).toBeTypeOf('number');
        expect(stateStore.get('chat-1')?.coldStartLastReasonCode).toBe('old_chat_takeover_completed');
        expect(stateStore.get('chat-1')?.coldStartDismissedAt).toBeUndefined();
        expect(stateStore.get('chat-1')?.coldStartSuppressedAt).toBeUndefined();
        expect(summaryProgress.lastSummarizedIndex).toBe(24);
        expect(summaryProgress.pendingStartIndex).toBe(25);
        expect(summaryProgress.pendingEndIndex).toBe(24);
        expect(summaryProgress.lastSummarizedMessageId).toBeUndefined();
        expect(summaryProgress.lastSummarizedAt).toBeTypeOf('number');
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

    it('skips summary progress alignment for custom rebuild style takeover consolidation', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        stateStore.set('chat-1', {
            summaryLastSummarizedIndex: 8,
            summaryLastSummarizedMessageId: 'msg-8',
            summaryPendingStartIndex: 9,
            summaryPendingEndIndex: 8,
        });
        (sdk as unknown as { eventsManager: { countByTypes: ReturnType<typeof vi.fn> } }).eventsManager.countByTypes.mockResolvedValue(24);
        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-rebuild',
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
            generatedAt: Date.now(),
        };

        await (sdk as unknown as {
            applyTakeoverConsolidation: (
                value: MemoryTakeoverConsolidationResult,
                options?: { alignSummaryProgress?: boolean },
            ) => Promise<void>;
        }).applyTakeoverConsolidation(result, { alignSummaryProgress: false });

        const summaryProgress = await sdk.chatState.getSummaryProgress();
        expect(summaryProgress.lastSummarizedIndex).toBe(8);
        expect(summaryProgress.pendingStartIndex).toBe(9);
        expect(summaryProgress.pendingEndIndex).toBe(8);
        expect(summaryProgress.lastSummarizedMessageId).toBe('msg-8');
    });

    it('aligns summary progress after manual summary capture succeeds', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        stateStore.set('chat-1', {
            summaryLastSummarizedIndex: 3,
            summaryLastSummarizedMessageId: 'msg-3',
            summaryPendingStartIndex: 4,
            summaryPendingEndIndex: 6,
        });
        (sdk as unknown as { eventsManager: { countByTypes: ReturnType<typeof vi.fn> } }).eventsManager.countByTypes.mockResolvedValue(12);
        (sdk as unknown as {
            summaryService: { captureSummaryFromChat: ReturnType<typeof vi.fn> };
        }).summaryService = {
            captureSummaryFromChat: vi.fn(async () => ({
                summaryId: 'summary-1',
                title: '手动总结',
                content: '这是一次手动总结。',
            })),
        };

        const snapshot = await sdk.unifiedMemory.summaries.capture({
            messages: [{ role: 'user', content: '你好', turnIndex: 1 }],
        });

        const summaryProgress = await sdk.chatState.getSummaryProgress();
        expect(snapshot).toBeTruthy();
        expect(summaryProgress.lastSummarizedIndex).toBe(12);
        expect(summaryProgress.pendingStartIndex).toBe(13);
        expect(summaryProgress.pendingEndIndex).toBe(12);
        expect(summaryProgress.lastSummarizedMessageId).toBeUndefined();
        expect(summaryProgress.lastSummarizedAt).toBeTypeOf('number');
    });

    it('自动总结处理全部未总结楼层，不再按最近楼层截断', async () => {
        vi.mocked(readMemoryOSSettings).mockReturnValue({
            summaryAutoTriggerEnabled: true,
            summaryIntervalFloors: 30,
            summaryMinMessages: 10,
            takeoverDefaultBatchSize: 30,
            takeoverDefaultRecentFloors: 60,
            takeoverDefaultPrioritizeRecent: true,
            takeoverDefaultAutoContinue: true,
            takeoverDefaultAutoConsolidate: true,
            takeoverDefaultPauseOnError: true,
        } as ReturnType<typeof readMemoryOSSettings>);
        getTavernRuntimeContextEventMock.mockReturnValue({
            chat: Array.from({ length: 30 }, (_value, index): Record<string, unknown> => ({
                role: index % 2 === 0 ? 'user' : 'assistant',
                text: `第 ${index + 1} 楼`,
            })),
        });
        getTavernMessageTextEventMock.mockImplementation((record: unknown): string => {
            return String((record as Record<string, unknown>).text ?? '');
        });
        const sdk = new MemorySDKImpl('chat-1');
        const captureSummaryFromChat = vi.fn(async () => ({
            summaryId: 'summary-1',
            title: '自动总结',
            content: '这是一次自动总结。',
        }));
        (sdk as unknown as {
            summaryService: { captureSummaryFromChat: typeof captureSummaryFromChat };
        }).summaryService = { captureSummaryFromChat };

        await sdk.postGeneration.scheduleRoundProcessing('test');

        const summaryProgress = await sdk.chatState.getSummaryProgress();
        expect(captureSummaryFromChat).toHaveBeenCalledOnce();
        expect(captureSummaryFromChat.mock.calls[0]?.[0]?.messages.map((item) => item.turnIndex)).toEqual(
            Array.from({ length: 30 }, (_value, index): number => index + 1),
        );
        expect(summaryProgress.lastSummarizedIndex).toBe(30);
        expect(summaryProgress.pendingStartIndex).toBe(31);
        expect(summaryProgress.pendingEndIndex).toBe(30);

        await sdk.postGeneration.scheduleRoundProcessing('test');

        const nextSummaryProgress = await sdk.chatState.getSummaryProgress();
        expect(captureSummaryFromChat).toHaveBeenCalledOnce();
        expect(nextSummaryProgress.lastSummarizedIndex).toBe(30);
        expect(nextSummaryProgress.pendingStartIndex).toBe(31);
        expect(nextSummaryProgress.pendingEndIndex).toBe(30);
    });

    it('宿主消息过滤后使用连续楼层号', () => {
        getTavernRuntimeContextEventMock.mockReturnValue({
            chat: [
                { role: 'system', text: '系统提示' },
                { role: 'user', text: '第一条正文' },
                { role: 'assistant', text: '' },
                { role: 'assistant', text: '第二条正文' },
            ],
        });
        getTavernMessageTextEventMock.mockImplementation((record: unknown): string => {
            return String((record as Record<string, unknown>).text ?? '');
        });
        const sdk = new MemorySDKImpl('chat-1');
        const messages = (sdk as unknown as {
            readActiveHostChatMessages: () => Array<{ turnIndex?: number; content?: string }>;
        }).readActiveHostChatMessages();

        expect(messages.map((item) => item.turnIndex)).toEqual([1, 2]);
        expect(messages.map((item) => item.content)).toEqual(['第一条正文', '第二条正文']);
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
            .map((call) => call[0] as { actorKey?: string; displayName?: string; displayNameSource?: string })
            .filter((item) => item.displayName === '橙狗狗' || item.displayName === '何盈');

        expect(actorEnsureCalls).toHaveLength(2);
        expect(actorEnsureCalls[0]?.actorKey).not.toBe(actorEnsureCalls[1]?.actorKey);
        expect(actorEnsureCalls[0]?.actorKey).toMatch(/^actor_/);
        expect(actorEnsureCalls[1]?.actorKey).toMatch(/^actor_/);
        expect(actorEnsureCalls.every((item) => item.displayNameSource === 'takeover_actor_card')).toBe(true);
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
        }), expect.anything());
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
            title: '橙狗狗与何盈的关系',
            entryType: 'relationship',
            detailPayload: expect.objectContaining({
                sourceActorKey: expect.stringMatching(/^actor_/),
                targetActorKey: expect.stringMatching(/^actor_/),
                sourceDisplayName: '橙狗狗',
                targetDisplayName: '何盈',
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

    it('creates partial actor profiles for relationship endpoints that only exist as actor keys', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        listActorProfilesMock.mockResolvedValue([{ actorKey: 'user', displayName: '林远' }]);

        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-6',
            chapterDigestIndex: [],
            actorCards: [],
            relationships: [
                {
                    sourceActorKey: 'user',
                    targetActorKey: 'char_heying',
                    participants: ['user', 'char_heying'],
                    relationTag: '暧昧',
                    state: '{{actor:char_heying}}仍在等待{{userDisplayName}}。',
                    summary: '{{actor:char_heying}}与{{userDisplayName}}的关系进一步升温。',
                    trust: 0.82,
                    affection: 0.91,
                    tension: 0.35,
                },
            ],
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

        expect(ensureActorProfileMock).toHaveBeenCalledWith(expect.objectContaining({
            actorKey: 'char_heying',
            displayName: 'heying',
            displayNameSource: 'takeover_relation',
        }));
        expect(saveEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            entryType: 'relationship',
            title: '你与heying的关系',
            summary: 'heying与你的关系进一步升温。',
            detail: 'heying仍在等待你。',
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

    it('relationState 使用 actorKey 时应优先回填正式角色卡中文名', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        listActorProfilesMock.mockResolvedValue([{ actorKey: 'user', displayName: '林远' }]);

        const result: MemoryTakeoverConsolidationResult = {
            takeoverId: 'takeover-7',
            chapterDigestIndex: [],
            actorCards: [{
                actorKey: 'actor_heying',
                displayName: '何盈',
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            }],
            relationships: [],
            entityCards: [],
            entityTransitions: [],
            longTermFacts: [],
            relationState: [{
                target: 'actor_heying',
                targetType: 'actor',
                relationTag: '暧昧',
                state: '{{actor:actor_heying}}仍在等{{userDisplayName}}。',
                reason: '{{actor:actor_heying}}与你旧情未断。',
            }],
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

        expect(ensureActorProfileMock).toHaveBeenCalledWith(expect.objectContaining({
            actorKey: 'actor_heying',
            displayName: '何盈',
            displayNameSource: 'takeover_actor_card',
        }));
        expect(ensureActorProfileMock).toHaveBeenCalledWith(expect.objectContaining({
            actorKey: 'actor_heying',
            displayName: '何盈',
            displayNameSource: 'takeover_relation',
        }));
        expect(saveEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            entryType: 'relationship',
            title: '你与何盈的关系',
            summary: '何盈与你旧情未断。',
            detail: '何盈仍在等你。',
        }), expect.anything());
    });
});
