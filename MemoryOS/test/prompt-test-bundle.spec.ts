import { describe, expect, it } from 'vitest';
import {
    db,
    exportMemoryPromptTestBundle,
    importMemoryPromptTestBundle,
    type MemoryPromptTestBundle,
} from '../src/db/db';

/**
 * 功能：构建支持 where/equals/toArray 与 bulkPut 的表桩。
 * @param rows 读取时返回的行。
 * @returns 表桩对象。
 */
function createTableStub<T>(rows: T[]): {
    where: () => { equals: () => { toArray: () => Promise<T[]> } };
    bulkPut: (items: T[]) => Promise<void>;
} {
    return {
        where: () => ({
            equals: () => ({
                toArray: async (): Promise<T[]> => rows,
            }),
        }),
        bulkPut: async (): Promise<void> => {},
    };
}

describe('prompt test bundle', (): void => {
    it('导出测试包时默认优先使用真实 prompt_ready 快照', async (): Promise<void> => {
        const chatKey = 'chat-capture-priority';
        const original = {
            events: db.events,
            facts: db.facts,
            world_state: db.world_state,
            summaries: db.summaries,
            templates: db.templates,
            audit: db.audit,
            meta: db.meta,
            worldinfo_cache: db.worldinfo_cache,
            template_bindings: db.template_bindings,
            memory_cards: db.memory_cards,
            memory_card_embeddings: db.memory_card_embeddings,
            memory_card_meta: db.memory_card_meta,
            relationship_memory: db.relationship_memory,
            memory_recall_log: db.memory_recall_log,
            memory_mutation_history: db.memory_mutation_history,
            chat_plugin_state: (db as any).chat_plugin_state,
            chat_plugin_records: (db as any).chat_plugin_records,
        };
        try {
            (db as any).events = createTableStub([]);
            (db as any).facts = createTableStub([]);
            (db as any).world_state = createTableStub([]);
            (db as any).summaries = createTableStub([]);
            (db as any).templates = createTableStub([]);
            (db as any).audit = createTableStub([]);
            (db as any).meta = { get: async (): Promise<null> => null };
            (db as any).worldinfo_cache = createTableStub([]);
            (db as any).template_bindings = createTableStub([]);
            (db as any).memory_cards = createTableStub([]);
            (db as any).memory_card_embeddings = createTableStub([]);
            (db as any).memory_card_meta = createTableStub([]);
            (db as any).relationship_memory = createTableStub([]);
            (db as any).memory_recall_log = createTableStub([]);
            (db as any).memory_mutation_history = createTableStub([]);
            (db as any).chat_plugin_state = { get: async (): Promise<null> => null };
            (db as any).chat_plugin_records = {
                where: () => ({
                    equals: () => ({
                        and: () => ({
                            toArray: async (): Promise<unknown[]> => [],
                        }),
                    }),
                }),
            };

            const exported = await exportMemoryPromptTestBundle(chatKey, {
                captureSnapshot: {
                    promptFixture: [
                        { role: 'system', content: 'captured-system' },
                        { role: 'user', content: 'captured-user' },
                    ],
                    query: 'captured-query',
                    sourceMessageId: 'captured-msg-id',
                    capturedAt: 1774512300000,
                },
                settings: { contextMaxTokens: 1200 },
            });

            expect(exported.captureMeta?.mode).toBe('exact_replay');
            expect(exported.promptFixture.length).toBe(2);
            expect(exported.promptFixture[0]?.content).toBe('captured-system');
            expect(exported.query).toBe('captured-query');
            expect(exported.sourceMessageId).toBe('captured-msg-id');
        } finally {
            (db as any).events = original.events;
            (db as any).facts = original.facts;
            (db as any).world_state = original.world_state;
            (db as any).summaries = original.summaries;
            (db as any).templates = original.templates;
            (db as any).audit = original.audit;
            (db as any).meta = original.meta;
            (db as any).worldinfo_cache = original.worldinfo_cache;
            (db as any).template_bindings = original.template_bindings;
            (db as any).memory_cards = original.memory_cards;
            (db as any).memory_card_embeddings = original.memory_card_embeddings;
            (db as any).memory_card_meta = original.memory_card_meta;
            (db as any).relationship_memory = original.relationship_memory;
            (db as any).memory_recall_log = original.memory_recall_log;
            (db as any).memory_mutation_history = original.memory_mutation_history;
            (db as any).chat_plugin_state = original.chat_plugin_state;
            (db as any).chat_plugin_records = original.chat_plugin_records;
        }
    });

    it('可导出并导入完整测试包（含向量快照）', async (): Promise<void> => {
        const chatKey = 'chat-origin';
        const original = {
            transaction: (db as any).transaction,
            events: db.events,
            facts: db.facts,
            world_state: db.world_state,
            summaries: db.summaries,
            templates: db.templates,
            audit: db.audit,
            meta: db.meta,
            worldinfo_cache: db.worldinfo_cache,
            template_bindings: db.template_bindings,
            memory_cards: db.memory_cards,
            memory_card_embeddings: db.memory_card_embeddings,
            memory_card_meta: db.memory_card_meta,
            relationship_memory: db.relationship_memory,
            memory_recall_log: db.memory_recall_log,
            memory_mutation_history: db.memory_mutation_history,
            chat_plugin_state: (db as any).chat_plugin_state,
            chat_plugin_records: (db as any).chat_plugin_records,
        };

        const importedCounters: Record<string, number> = {};
        const createImportStub = <T>(name: string, rows: T[]) => ({
            ...createTableStub(rows),
            bulkPut: async (items: T[]): Promise<void> => {
                importedCounters[name] = items.length;
            },
        });

        try {
            (db as any).events = createImportStub('events', [{ eventId: `${chatKey}::1`, chatKey }]);
            (db as any).facts = createImportStub('facts', [{ factKey: `${chatKey}::fact`, chatKey }]);
            (db as any).world_state = createImportStub('world_state', [{ chatKey, path: 'catalog/regions/厄尔多利亚', value: '世界设定' }]);
            (db as any).summaries = createImportStub('summaries', [{ summaryId: `${chatKey}::sum`, chatKey }]);
            (db as any).templates = createImportStub('templates', []);
            (db as any).audit = createImportStub('audit', []);
            (db as any).meta = {
                get: async (): Promise<Record<string, unknown>> => ({ chatKey, flags: { test: true } }),
                put: async (): Promise<void> => {},
            };
            (db as any).worldinfo_cache = createImportStub('worldinfo_cache', []);
            (db as any).template_bindings = createImportStub('template_bindings', []);
            (db as any).memory_cards = createImportStub('memory_cards', [{ cardId: `${chatKey}::card`, chatKey }]);
            (db as any).memory_card_embeddings = createImportStub('memory_card_embeddings', [{ embeddingId: `${chatKey}::emb`, chatKey, cardId: `${chatKey}::card` }]);
            (db as any).memory_card_meta = createImportStub('memory_card_meta', []);
            (db as any).relationship_memory = createImportStub('relationship_memory', []);
            (db as any).memory_recall_log = createImportStub('memory_recall_log', []);
            (db as any).memory_mutation_history = createImportStub('memory_mutation_history', []);
            (db as any).chat_plugin_state = {
                get: async (): Promise<Record<string, unknown> | null> => ({
                    pluginId: 'stx_memory_os',
                    chatKey,
                    schemaVersion: 1,
                    state: { activeActorKey: 'seraphina' },
                    summary: {},
                    updatedAt: Date.now(),
                }),
                put: async (): Promise<void> => {},
            };
            (db as any).chat_plugin_records = {
                where: () => ({
                    equals: () => ({
                        and: () => ({
                            toArray: async (): Promise<Array<Record<string, unknown>>> => ([
                                {
                                    pluginId: 'stx_memory_os',
                                    chatKey,
                                    collection: 'test',
                                    recordId: 'r1',
                                    payload: { ok: true },
                                    ts: Date.now(),
                                    updatedAt: Date.now(),
                                },
                            ]),
                        }),
                    }),
                }),
                bulkPut: async (): Promise<void> => {},
            };
            (db as any).transaction = async (_mode: string, _tables: unknown[], callback: () => Promise<void>): Promise<void> => {
                await callback();
            };

            const exported = await exportMemoryPromptTestBundle(chatKey, {
                promptFixture: [{ role: 'user', content: '厄尔多利亚是什么地方' }],
                query: '厄尔多利亚是什么地方',
                sourceMessageId: 'u-last',
                settings: { contextMaxTokens: 1200 },
            });
            expect(exported.version).toBe('1.0.0');
            expect(exported.database.memoryCardEmbeddings.length).toBeGreaterThan(0);

            const imported = await importMemoryPromptTestBundle(exported as MemoryPromptTestBundle, {
                targetChatKey: 'memory_test::import',
                skipClear: true,
            });
            expect(imported.chatKey).toBe('memory_test::import');
            expect(imported.bundle.database.chatKey).toBe('memory_test::import');
            expect(importedCounters.memory_card_embeddings).toBeGreaterThan(0);
            expect(importedCounters.world_state).toBeGreaterThan(0);
        } finally {
            (db as any).transaction = original.transaction;
            (db as any).events = original.events;
            (db as any).facts = original.facts;
            (db as any).world_state = original.world_state;
            (db as any).summaries = original.summaries;
            (db as any).templates = original.templates;
            (db as any).audit = original.audit;
            (db as any).meta = original.meta;
            (db as any).worldinfo_cache = original.worldinfo_cache;
            (db as any).template_bindings = original.template_bindings;
            (db as any).memory_cards = original.memory_cards;
            (db as any).memory_card_embeddings = original.memory_card_embeddings;
            (db as any).memory_card_meta = original.memory_card_meta;
            (db as any).relationship_memory = original.relationship_memory;
            (db as any).memory_recall_log = original.memory_recall_log;
            (db as any).memory_mutation_history = original.memory_mutation_history;
            (db as any).chat_plugin_state = original.chat_plugin_state;
            (db as any).chat_plugin_records = original.chat_plugin_records;
        }
    });

    it('导入时会归一化旧 summaries 字段，避免事务中断', async (): Promise<void> => {
        const original = {
            transaction: (db as any).transaction,
            events: db.events,
            facts: db.facts,
            world_state: db.world_state,
            summaries: db.summaries,
            templates: db.templates,
            audit: db.audit,
            meta: db.meta,
            worldinfo_cache: db.worldinfo_cache,
            template_bindings: db.template_bindings,
            memory_cards: db.memory_cards,
            memory_card_embeddings: db.memory_card_embeddings,
            memory_card_meta: db.memory_card_meta,
            relationship_memory: db.relationship_memory,
            memory_recall_log: db.memory_recall_log,
            memory_mutation_history: db.memory_mutation_history,
            chat_plugin_state: (db as any).chat_plugin_state,
            chat_plugin_records: (db as any).chat_plugin_records,
        };

        let capturedSummary: Record<string, unknown> | null = null;

        const noopTable = {
            bulkPut: async (): Promise<void> => {},
        };

        try {
            (db as any).events = noopTable;
            (db as any).facts = noopTable;
            (db as any).world_state = noopTable;
            (db as any).summaries = {
                bulkPut: async (items: Array<Record<string, unknown>>): Promise<void> => {
                    capturedSummary = items[0] ?? null;
                },
            };
            (db as any).templates = noopTable;
            (db as any).audit = noopTable;
            (db as any).meta = {
                put: async (): Promise<void> => {},
            };
            (db as any).worldinfo_cache = noopTable;
            (db as any).template_bindings = noopTable;
            (db as any).memory_cards = noopTable;
            (db as any).memory_card_embeddings = noopTable;
            (db as any).memory_card_meta = noopTable;
            (db as any).relationship_memory = noopTable;
            (db as any).memory_recall_log = noopTable;
            (db as any).memory_mutation_history = noopTable;
            (db as any).chat_plugin_state = {
                put: async (): Promise<void> => {},
            };
            (db as any).chat_plugin_records = {
                bulkPut: async (): Promise<void> => {},
            };
            (db as any).transaction = async (_mode: string, _tables: unknown[], callback: () => Promise<void>): Promise<void> => {
                await callback();
            };

            const bundle: MemoryPromptTestBundle = {
                version: '1.0.0',
                exportedAt: Date.now(),
                sourceChatKey: 'legacy-chat',
                database: {
                    chatKey: 'legacy-chat',
                    generatedAt: Date.now(),
                    events: [],
                    facts: [],
                    worldState: [],
                    summaries: [{ content: '旧导出里只有内容' }] as any,
                    templates: [],
                    audit: [],
                    meta: null,
                    worldinfoCache: [],
                    templateBindings: [],
                    memoryCards: [],
                    memoryCardEmbeddings: [],
                    memoryCardMeta: [],
                    relationshipMemory: [],
                    memoryRecallLog: [],
                    memoryMutationHistory: [],
                    pluginState: null,
                    pluginRecords: [],
                },
                promptFixture: [],
                query: '',
                settings: {},
            };

            await importMemoryPromptTestBundle(bundle, {
                targetChatKey: 'memory_test::normalize',
                skipClear: true,
            });

            expect(capturedSummary).toBeTruthy();
            expect(String(capturedSummary?.summaryId ?? '').length).toBeGreaterThan(0);
            expect(capturedSummary?.chatKey).toBe('memory_test::normalize');
            expect(capturedSummary?.level).toBe('scene');
            expect(Number(capturedSummary?.createdAt)).toBeGreaterThan(0);
            expect(capturedSummary?.content).toBe('旧导出里只有内容');
        } finally {
            (db as any).transaction = original.transaction;
            (db as any).events = original.events;
            (db as any).facts = original.facts;
            (db as any).world_state = original.world_state;
            (db as any).summaries = original.summaries;
            (db as any).templates = original.templates;
            (db as any).audit = original.audit;
            (db as any).meta = original.meta;
            (db as any).worldinfo_cache = original.worldinfo_cache;
            (db as any).template_bindings = original.template_bindings;
            (db as any).memory_cards = original.memory_cards;
            (db as any).memory_card_embeddings = original.memory_card_embeddings;
            (db as any).memory_card_meta = original.memory_card_meta;
            (db as any).relationship_memory = original.relationship_memory;
            (db as any).memory_recall_log = original.memory_recall_log;
            (db as any).memory_mutation_history = original.memory_mutation_history;
            (db as any).chat_plugin_state = original.chat_plugin_state;
            (db as any).chat_plugin_records = original.chat_plugin_records;
        }
    });
});
