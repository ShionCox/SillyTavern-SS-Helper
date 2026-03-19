import { describe, expect, it } from 'vitest';
import { deriveVectorMemoryViewerItems } from '../src/ui/vectorMemoryViewer';
import type { MemoryCardSummary, MemoryCardViewerSnapshot, MemoryRecallPreviewResult } from '../../SDK/stx';

/**
 * 功能：创建基础记忆卡摘要，减少测试样板代码。
 * @param cardId 卡片编号。
 * @param overrides 覆盖字段。
 * @returns 完整记忆卡摘要对象。
 */
function createCardSummary(cardId: string, overrides: Partial<MemoryCardSummary> = {}): MemoryCardSummary {
    return {
        chunkId: cardId,
        cardId,
        cardIds: [cardId],
        chatKey: 'chat:test',
        content: '示例记忆',
        preview: '示例记忆',
        contentHash: `hash-${cardId}`,
        contentLength: 4,
        createdAt: 100,
        sourceRecordKey: `fact:${cardId}`,
        sourceRecordKind: 'fact',
        sourceLabel: '事实',
        sourceDetail: '来源说明',
        ownerActorKey: 'actor:a',
        ownerActorLabel: '角色A',
        sourceScope: 'self',
        memoryType: 'identity',
        memorySubtype: 'trait',
        participantActorKeys: [],
        participantActorLabels: [],
        anchorMessageId: null,
        sourceMessageIds: [],
        sourceTraceKind: 'extract',
        sourceReason: 'manual',
        sourceViewHash: null,
        sourceSnapshotHash: null,
        sourceRepairGeneration: null,
        embeddingModel: 'model',
        embeddingDimensions: 1024,
        statusKind: 'normal',
        statusLabel: '正常',
        statusTone: 'muted',
        statusReasons: [],
        isArchived: false,
        sourceMissing: false,
        needsRebuild: false,
        duplicateCount: 1,
        usage: {
            totalHits: 0,
            selectedHits: 0,
            hitsIn7d: 0,
            hitsIn30d: 0,
            lastHitAt: null,
            lastSelectedAt: null,
            lastQuery: null,
            lastScore: null,
        },
        lane: 'identity',
        subject: '主角',
        title: `标题-${cardId}`,
        memoryText: '示例记忆正文',
        evidenceText: null,
        ttl: 'long',
        replaceKey: null,
        status: 'active',
        ...overrides,
    };
}

/**
 * 功能：创建测试快照。
 * @returns 记忆卡查看器快照。
 */
function createSnapshot(): MemoryCardViewerSnapshot {
    return {
        chatKey: 'chat:test',
        generatedAt: 1000,
        totalCount: 3,
        archivedCount: 1,
        sourceMissingCount: 1,
        needsRebuildCount: 1,
        recentHitCount: 1,
        longUnusedCount: 1,
        items: [
            createCardSummary('card-a', {
                content: '角色A身份记忆',
                preview: '角色A身份记忆',
                contentLength: 16,
                sourceRecordKind: 'fact',
                statusKind: 'recent_hit',
                statusLabel: '最近命中',
                statusTone: 'success',
                usage: {
                    totalHits: 5,
                    selectedHits: 2,
                    hitsIn7d: 3,
                    hitsIn30d: 5,
                    lastHitAt: Date.now(),
                    lastSelectedAt: Date.now(),
                    lastQuery: '她是谁',
                    lastScore: 0.91,
                },
            }),
            createCardSummary('card-b', {
                content: '关系变化记忆',
                preview: '关系变化记忆',
                sourceRecordKind: 'summary',
                lane: 'event',
                title: '关系变化',
                statusKind: 'needs_rebuild',
                statusLabel: '建议重建',
                statusTone: 'warning',
                statusReasons: ['来源记录已更新'],
                needsRebuild: true,
                participantActorKeys: ['actor:a'],
                participantActorLabels: ['角色A'],
            }),
            createCardSummary('card-c', {
                content: '旧记录',
                preview: '旧记录',
                sourceRecordKind: 'unknown',
                sourceRecordKey: null,
                sourceLabel: '未知来源',
                sourceDetail: '来源缺失',
                ownerActorKey: null,
                ownerActorLabel: null,
                participantActorKeys: [],
                participantActorLabels: [],
                lane: 'state',
                statusKind: 'source_missing',
                statusLabel: '来源丢失',
                statusTone: 'danger',
                isArchived: true,
                sourceMissing: true,
                duplicateCount: 2,
                usage: {
                    totalHits: 1,
                    selectedHits: 0,
                    hitsIn7d: 0,
                    hitsIn30d: 1,
                    lastHitAt: Date.now() - 40 * 24 * 60 * 60 * 1000,
                    lastSelectedAt: null,
                    lastQuery: '旧问题',
                    lastScore: 0.1,
                },
            }),
        ],
    };
}

/**
 * 功能：创建测试召回结果。
 * @returns 召回预演结果。
 */
function createTestResult(): MemoryRecallPreviewResult {
    return {
        query: '测试',
        testedAt: Date.now(),
        rerankApplied: true,
        hitCount: 2,
        selectedCount: 1,
        hits: [
            {
                chunkId: 'card-b',
                cardId: 'card-b',
                lane: 'event',
                subject: '主角',
                title: '关系变化',
                ttl: 'medium',
                status: 'active',
                sourceRecordKey: 'summary:card-b',
                sourceRecordKind: 'summary',
                sourceLabel: '摘要B',
                preview: '关系变化记忆',
                vectorScore: 0.8,
                initialRank: 2,
                rerankedRank: 1,
                finalRank: 1,
                matchedInRecall: true,
                enteredContext: true,
                reasonCodes: ['vector'],
            },
            {
                chunkId: 'card-a',
                cardId: 'card-a',
                lane: 'identity',
                subject: '主角',
                title: '角色身份',
                ttl: 'long',
                status: 'active',
                sourceRecordKey: 'fact:card-a',
                sourceRecordKind: 'fact',
                sourceLabel: '事实A',
                preview: '角色A身份记忆',
                vectorScore: 0.7,
                initialRank: 1,
                rerankedRank: 2,
                finalRank: null,
                matchedInRecall: true,
                enteredContext: false,
                reasonCodes: ['vector'],
            },
        ],
        vectorGate: undefined,
        cache: undefined,
        cheapRecall: null,
    };
}

describe('vectorMemoryViewer', (): void => {
    it('按异常快捷筛选与当前角色筛选返回正确结果', (): void => {
        const snapshot = createSnapshot();
        const items = deriveVectorMemoryViewerItems(snapshot, {
            keyword: '',
            sourceKind: 'all',
            statusKind: 'all',
            actorKey: '__all__',
            sortMode: 'recent_hit',
            timeFilter: '__all__',
            quickRecentHit: false,
            quickLongUnused: false,
            quickAbnormal: true,
            quickCurrentActor: true,
            activeActorKey: 'actor:a',
            testResult: null,
        });

        expect(items.map((item) => item.item.cardId)).toEqual(['card-b']);
    });

    it('在测试结果模式下按命中顺序返回并保留测试信息', (): void => {
        const snapshot = createSnapshot();
        const items = deriveVectorMemoryViewerItems(snapshot, {
            keyword: '',
            sourceKind: 'all',
            statusKind: 'all',
            actorKey: '__all__',
            sortMode: 'recent_hit',
            timeFilter: '__all__',
            quickRecentHit: false,
            quickLongUnused: false,
            quickAbnormal: false,
            quickCurrentActor: false,
            activeActorKey: null,
            testResult: createTestResult(),
        });

        expect(items.map((item) => item.item.cardId)).toEqual(['card-b', 'card-a']);
        expect(items[0]?.testHit?.finalRank).toBe(1);
        expect(items[1]?.testHit?.rerankedRank).toBe(2);
    });
});
