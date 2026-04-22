import { describe, expect, it } from 'vitest';
import { detectPromptTestBundleMode, normalizePromptTestBundleFromUnknown } from '../testbed/bundle';
import { inspectMemoryDatabaseSnapshot } from '../src/db/database-snapshot-inspector';

function createSnapshot(chatKey: string) {
    return {
        chatKey,
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
        memoryRelationships: [],
        summarySnapshots: [],
        worldProfileBindings: [],
        pluginState: null,
        pluginRecords: [],
    };
}

describe('testbed bundle normalize', () => {
    it('normalizes wrapped bundle and keeps exact replay metadata', () => {
        const raw = {
            payload: {
                version: '1.0.0',
                exportedAt: 1000,
                sourceChatKey: 'chat-source',
                database: createSnapshot('chat-source'),
                promptFixture: [{ role: 'user', content: 'hello' }],
                query: 'where am i',
                sourceMessageId: 'u-1',
                settings: { contextMaxTokens: 1600 },
                captureMeta: {
                    mode: 'exact_replay',
                    source: 'chat_completion_prompt_ready',
                },
                parityBaseline: {
                    finalPromptText: 'baseline prompt',
                    insertIndex: 1,
                    insertedMemoryBlock: 'memory',
                    reasonCodes: ['a', 'a', 'b'],
                    matchedActorKeys: ['hero'],
                    matchedEntryIds: ['entry-1'],
                },
            },
        };
        const bundle = normalizePromptTestBundleFromUnknown(raw);
        expect(bundle).not.toBeNull();
        expect(bundle?.database.chatKey).toBe('chat-source');
        expect(bundle?.captureMeta?.mode).toBe('exact_replay');
        expect(bundle?.parityBaseline?.reasonCodes).toEqual(['a', 'b']);
        expect(bundle ? detectPromptTestBundleMode(bundle) : 'simulated_prompt').toBe('exact_replay');
    });

    it('supports snapshot-only input and falls back to simulated mode', () => {
        const rawSnapshot = createSnapshot('chat-snapshot');
        const bundle = normalizePromptTestBundleFromUnknown(rawSnapshot, {
            fallbackQuery: 'fallback query',
            fallbackSourceMessageId: 'fallback-msg',
            fallbackSettings: { contextMaxTokens: 900 },
        });
        expect(bundle).not.toBeNull();
        expect(bundle?.database.chatKey).toBe('chat-snapshot');
        expect(bundle?.query).toBe('fallback query');
        expect(bundle?.sourceMessageId).toBe('fallback-msg');
        expect(bundle?.captureMeta?.mode).toBe('simulated_prompt');
    });
});

describe('database snapshot inspector', () => {
    it('识别纯数据库快照并保留角色关系集合', () => {
        const rawSnapshot = {
            ...createSnapshot('chat-source'),
            memoryRelationships: [
                {
                    relationshipId: 'rel-1',
                    chatKey: 'chat-source',
                    sourceActorKey: 'user',
                    targetActorKey: 'actor-a',
                    relationTag: '朋友',
                    state: '互相信任',
                    summary: '二人是朋友',
                    trust: 70,
                    affection: 60,
                    tension: 10,
                    participants: ['user', 'actor-a'],
                    createdAt: 1000,
                    updatedAt: 1000,
                },
            ],
        };

        const report = inspectMemoryDatabaseSnapshot(rawSnapshot);

        expect(report.valid).toBe(true);
        expect(report.sourceKind).toBe('database_snapshot');
        expect(report.database?.memoryRelationships).toHaveLength(1);
        expect(report.collectionCounts.find((item) => item.key === 'memoryRelationships')?.count).toBe(1);
    });

    it('识别 Prompt 测试包并提取 database', () => {
        const rawBundle = {
            version: '1.0.0',
            exportedAt: 2000,
            sourceChatKey: 'chat-source',
            database: createSnapshot('chat-source'),
            promptFixture: [],
            query: '',
            settings: {},
        };

        const report = inspectMemoryDatabaseSnapshot(rawBundle);

        expect(report.valid).toBe(true);
        expect(report.sourceKind).toBe('prompt_test_bundle');
        expect(report.chatKey).toBe('chat-source');
        expect(report.exportedAt).toBe(2000);
    });

    it('缺少关键数组字段时返回不完整报告且不抛错', () => {
        const rawSnapshot = {
            chatKey: 'chat-broken',
            generatedAt: 1000,
            events: [],
            memoryEntries: [],
            summarySnapshots: [],
            roleEntryMemory: [],
            meta: null,
            pluginState: null,
        };

        const report = inspectMemoryDatabaseSnapshot(rawSnapshot);

        expect(report.valid).toBe(false);
        expect(report.missingFields).toContain('memoryRelationships');
        expect(report.database?.chatKey).toBe('chat-broken');
    });

    it('统计 pluginRecords 中的向量集合数量', () => {
        const rawSnapshot = {
            ...createSnapshot('chat-vectors'),
            pluginRecords: [
                { pluginId: 'stx_memory_os', chatKey: 'chat-vectors', collection: 'vector_documents', recordId: 'doc-1', payload: {}, ts: 1000, updatedAt: 1000 },
                { pluginId: 'stx_memory_os', chatKey: 'chat-vectors', collection: 'vector_index', recordId: 'doc-1', payload: {}, ts: 1000, updatedAt: 1000 },
                { pluginId: 'stx_memory_os', chatKey: 'chat-vectors', collection: 'vector_recall_stats', recordId: 'doc-1', payload: {}, ts: 1000, updatedAt: 1000 },
                { pluginId: 'stx_memory_os', chatKey: 'chat-vectors', collection: 'takeover_logs', recordId: 'log-1', payload: {}, ts: 1000, updatedAt: 1000 },
            ],
        };

        const report = inspectMemoryDatabaseSnapshot(rawSnapshot);

        expect(report.vectorCounts.vectorDocuments).toBe(1);
        expect(report.vectorCounts.vectorIndex).toBe(1);
        expect(report.vectorCounts.vectorRecallStats).toBe(1);
        expect(report.vectorCounts.total).toBe(3);
    });
});
