import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportMemoryPromptTestBundleMock } = vi.hoisted(() => {
    return {
        exportMemoryPromptTestBundleMock: vi.fn(async (chatKey: string, options: Record<string, unknown>) => {
            return {
                version: '1.0.0',
                exportedAt: Date.now(),
                sourceChatKey: chatKey,
                database: {
                    chatKey,
                    generatedAt: Date.now(),
                    events: [],
                    templates: [],
                    audit: [],
                    meta: null,
                    memoryMutationHistory: [],
                    memoryEntries: [],
                    memoryEntryTypes: [],
                    actorMemoryProfiles: [],
                    roleEntryMemory: [],
                    summarySnapshots: [],
                    worldProfileBindings: [],
                    pluginState: null,
                    pluginRecords: [],
                },
                promptFixture: [],
                query: '',
                settings: {},
                captureMeta: { mode: 'exact_replay' as const },
                parityBaseline: options.parityBaseline,
                runResult: options.runResult,
            };
        }),
    };
});

vi.mock('../src/db/db', () => {
    return {
        exportMemoryChatDatabaseSnapshot: vi.fn(async () => ({
            chatKey: 'chat-1',
            generatedAt: Date.now(),
            events: [],
            templates: [],
            audit: [],
            meta: null,
            memoryMutationHistory: [],
            memoryEntries: [],
            memoryEntryTypes: [],
            actorMemoryProfiles: [],
            roleEntryMemory: [],
            summarySnapshots: [],
            worldProfileBindings: [],
            pluginState: null,
            pluginRecords: [],
        })),
        exportMemoryPromptTestBundle: exportMemoryPromptTestBundleMock,
        importMemoryPromptTestBundle: vi.fn(async (bundle: Record<string, unknown>) => ({
            chatKey: String((bundle.database as Record<string, unknown>).chatKey ?? 'chat-1'),
            importedAt: Date.now(),
            bundle,
        })),
        restoreArchivedMemoryChat: vi.fn(async () => undefined),
    };
});

vi.mock('../src/core/events-manager', () => {
    class EventsManager {
        append = vi.fn(async () => 'event-1');
        query = vi.fn(async () => []);
        getById = vi.fn(async () => undefined);
        count = vi.fn(async () => 0);
    }
    return { EventsManager };
});

vi.mock('../src/core/unified-memory-manager', () => {
    class UnifiedMemoryManager {
        constructor(_chatKey: string) {}
        init = vi.fn(async () => undefined);
    }
    return { UnifiedMemoryManager };
});

vi.mock('../../../SDK/tavern', () => {
    return {
        getCurrentTavernCharacterEvent: vi.fn(() => null),
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
        runBootstrapOrchestrator: vi.fn(async () => ({ ok: true })),
    };
});

vi.mock('../src/runtime/runtime-services', () => {
    return {
        logger: {
            warn: vi.fn(),
        },
    };
});

import { MemorySDKImpl } from '../src/sdk/memory-sdk';

describe('memory sdk export prompt bundle', () => {
    beforeEach(() => {
        exportMemoryPromptTestBundleMock.mockClear();
    });

    it('uses latest prompt-ready run result as export baseline fallback', async () => {
        const sdk = new MemorySDKImpl('chat-1');
        await sdk.chatState.setPromptReadyCaptureSnapshotForTest({
            promptFixture: [{ role: 'user', content: 'hello' }],
            query: 'hello',
            sourceMessageId: 'u-1',
            capturedAt: Date.now(),
        });
        await sdk.chatState.setPromptReadyRunResultForTest({
            finalPromptText: 'prompt-final',
            insertIndex: 1,
            insertedMemoryBlock: 'memory block',
            reasonCodes: ['r1', 'r1', 'r2'],
            matchedActorKeys: ['actor-a'],
            matchedEntryIds: ['entry-1'],
        });

        const bundle = await sdk.chatState.exportPromptTestBundleForTest();
        expect(exportMemoryPromptTestBundleMock).toHaveBeenCalledTimes(1);
        const options = exportMemoryPromptTestBundleMock.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(options.runResult).toEqual({
            finalPromptText: 'prompt-final',
            insertIndex: 1,
            insertedMemoryBlock: 'memory block',
            reasonCodes: ['r1', 'r1', 'r2'],
            matchedActorKeys: ['actor-a'],
            matchedEntryIds: ['entry-1'],
        });
        expect(options.parityBaseline).toEqual({
            finalPromptText: 'prompt-final',
            insertIndex: 1,
            insertedMemoryBlock: 'memory block',
            reasonCodes: ['r1', 'r2'],
            matchedActorKeys: ['actor-a'],
            matchedEntryIds: ['entry-1'],
        });
        expect(bundle.parityBaseline?.finalPromptText).toBe('prompt-final');
    });
});
