import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorMemoryProfile, MemoryEntry, MemoryRelationshipRecord, SummarySnapshot } from '../src/types';
import {
    clearAllVectorDataForChat,
    deleteVectorIndexBySource,
    deleteVectorRecallStatsBySource,
    deleteVectorDocumentsBySource,
    saveVectorDocuments,
} from '../src/db/vector-db';
import {
    rebuildAllVectorDocuments,
    onActorSaved,
    onRelationshipSaved,
    onSummarySaved,
} from '../src/services/vector-index-service';
import { getSharedVectorStore } from '../src/runtime/vector-runtime';

vi.mock('../src/db/vector-db', () => ({
    saveVectorDocuments: vi.fn(),
    loadVectorDocuments: vi.fn(),
    deleteVectorDocumentsBySource: vi.fn(),
    deleteVectorIndexBySource: vi.fn(),
    deleteVectorRecallStatsBySource: vi.fn(),
    clearAllVectorDataForChat: vi.fn(),
}));

vi.mock('../src/settings/store', () => ({
    readMemoryOSSettings: vi.fn(() => ({
        vectorEmbeddingVersion: 'test-version',
        vectorAutoIndexOnWrite: true,
    })),
}));

vi.mock('../src/runtime/runtime-services', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

const vectorStore = {
    clearByChat: vi.fn(),
    deleteBySource: vi.fn(),
};

vi.mock('../src/runtime/vector-runtime', () => ({
    getSharedEmbeddingService: vi.fn(),
    getSharedVectorStore: vi.fn(() => vectorStore),
    isVectorRuntimeReady: vi.fn(() => true),
}));

function buildEntry(entryId: string): MemoryEntry {
    return {
        entryId,
        chatKey: 'chat-a',
        entryType: 'event',
        title: '一次重要记忆',
        summary: '角色在林间完成治疗。',
        detail: '',
        tags: [],
        detailPayload: {},
        sourceSummaryIds: [],
        category: 'event',
        ongoing: false,
        updatedAt: 100,
        createdAt: 100,
    } as MemoryEntry;
}

describe('vector index entry-only policy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('全量重建只为 MemoryEntry 生成向量文档', async () => {
        const count = await rebuildAllVectorDocuments('chat-a', {
            entries: [buildEntry('entry-1')],
        });

        expect(count).toBe(1);
        expect(clearAllVectorDataForChat).toHaveBeenCalledWith('chat-a');
        expect(vectorStore.clearByChat).toHaveBeenCalledWith('chat-a');
        expect(saveVectorDocuments).toHaveBeenCalledTimes(1);
        const savedDocs = vi.mocked(saveVectorDocuments).mock.calls[0][1];
        expect(savedDocs).toHaveLength(1);
        expect(savedDocs[0].sourceKind).toBe('entry');
        expect(savedDocs[0].sourceId).toBe('entry-1');
    });

    it('summary 保存时只清理遗留向量数据', async () => {
        await onSummarySaved('chat-a', {
            summaryId: 'summary-legacy',
            chatKey: 'chat-a',
            title: '旧聊天接管整合快照',
            content: '',
            actorKeys: [],
            updatedAt: 100,
        } as SummarySnapshot);

        expect(deleteVectorDocumentsBySource).toHaveBeenCalledWith('chat-a', 'summary', ['summary-legacy']);
        expect(deleteVectorRecallStatsBySource).toHaveBeenCalledWith('chat-a', 'summary', ['summary-legacy']);
        expect(getSharedVectorStore).toHaveBeenCalled();
        expect(vectorStore.deleteBySource).toHaveBeenCalledWith('chat-a', 'summary', ['summary-legacy']);
        expect(deleteVectorIndexBySource).not.toHaveBeenCalled();
        expect(saveVectorDocuments).not.toHaveBeenCalled();
    });

    it('relationship 和 actor 保存时只清理遗留向量数据', async () => {
        await onRelationshipSaved('chat-a', {
            relationshipId: 'rel-legacy',
            chatKey: 'chat-a',
            sourceActorKey: 'actor-a',
            targetActorKey: 'actor-b',
            participants: [],
            relationTag: 'ally',
            state: '稳定',
            summary: '旧关系向量',
            trust: 1,
            affection: 1,
            tension: 0,
            updatedAt: 100,
        } as MemoryRelationshipRecord);
        await onActorSaved('chat-a', {
            actorKey: 'actor-legacy',
            chatKey: 'chat-a',
            displayName: '旧角色',
            memoryStat: 30,
            updatedAt: 100,
        } as ActorMemoryProfile);

        expect(deleteVectorDocumentsBySource).toHaveBeenCalledWith('chat-a', 'relationship', ['rel-legacy']);
        expect(deleteVectorDocumentsBySource).toHaveBeenCalledWith('chat-a', 'actor', ['actor-legacy']);
        expect(deleteVectorRecallStatsBySource).toHaveBeenCalledWith('chat-a', 'relationship', ['rel-legacy']);
        expect(deleteVectorRecallStatsBySource).toHaveBeenCalledWith('chat-a', 'actor', ['actor-legacy']);
        expect(saveVectorDocuments).not.toHaveBeenCalled();
    });
});
