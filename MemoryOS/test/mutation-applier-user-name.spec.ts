import { describe, expect, it, vi } from 'vitest';
import { applySummaryMutation } from '../src/memory-summary';
import type { MemoryEntry } from '../src/types';

function buildRelationshipEntry(): MemoryEntry {
    return {
        entryId: 'relationship-1',
        chatKey: 'chat-1',
        title: '旧关系',
        entryType: 'relationship',
        category: '角色关系',
        tags: [],
        summary: '旧摘要',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            sourceActorKey: 'char_erin',
            targetActorKey: 'user',
            participants: ['char_erin', 'user'],
            fields: {
                relationTag: '陌生人',
            },
        },
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('applySummaryMutation user display name', () => {
    it('会在显式传入用户名时替换自然语言文本，但保留结构化 user 锚点', async () => {
        const existingEntry = buildRelationshipEntry();
        const applySnapshot = vi.fn(async (input) => {
            return {
                summaryId: 'summary-1',
                chatKey: 'chat-1',
                title: input.title || '',
                content: input.content,
                actorKeys: input.actorKeys,
                entryUpserts: input.entryUpserts ?? [],
                refreshBindings: input.refreshBindings ?? [],
                createdAt: 1,
                updatedAt: 1,
            };
        });

        const snapshot = await applySummaryMutation({
            dependencies: {
                getEntry: async () => existingEntry,
                applySummarySnapshot: applySnapshot,
            },
            mutationDocument: {
                schemaVersion: '1.0.0',
                window: { fromTurn: 1, toTurn: 2 },
                actions: [
                    {
                        action: 'UPDATE',
                        targetKind: 'relationship',
                        targetId: 'relationship-1',
                        payload: {
                            title: '主角与艾琳的关系',
                            summary: '她对用户保持警惕',
                            fields: {
                                state: '当前用户仍在观察名单中',
                            },
                        },
                    },
                ],
            },
            candidateRecords: [],
            actorKeys: ['user'],
            userDisplayName: '林远',
            summaryContent: 'window',
        });

        expect(snapshot.summaryId).toBe('summary-1');
        const upsert = applySnapshot.mock.calls[0][0].entryUpserts[0];
        expect(upsert.title).toBe('林远与艾琳的关系');
        expect(upsert.summary).toBe('她对林远保持警惕');
        expect(upsert.detailPayload.fields.state).toBe('林远仍在观察名单中');
        expect(upsert.detailPayload.targetActorKey).toBe('user');
        expect(upsert.detailPayload.participants).toEqual(['char_erin', 'user']);
    });
});
