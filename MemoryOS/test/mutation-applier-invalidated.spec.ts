import { describe, expect, it, vi } from 'vitest';
import { applySummaryMutation } from '../src/memory-summary';
import type { MemoryEntry } from '../src/types';

describe('applySummaryMutation INVALIDATE lifecycle', () => {
    it('writes structured lifecycle and supersededBy for world_global_state', async () => {
        const existingEntry: MemoryEntry = {
            entryId: 'old-state',
            chatKey: 'chat-1',
            title: '旧状态',
            entryType: 'world_global_state',
            category: '世界基础',
            tags: [],
            summary: '旧状态描述',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {},
            sourceSummaryIds: [],
            createdAt: 1,
            updatedAt: 1,
        };
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
                        action: 'INVALIDATE',
                        targetKind: 'world_global_state',
                        candidateId: 'cand_1',
                        payload: {
                            reasonCodes: ['state_replaced'],
                        },
                        reasonCodes: ['state_replaced'],
                    },
                    {
                        action: 'ADD',
                        targetKind: 'world_global_state',
                        payload: {
                            title: '新状态',
                            summary: '新状态描述',
                        },
                    },
                ],
            },
            candidateRecords: [
                {
                    candidateId: 'cand_1',
                    recordId: 'old-state',
                    targetKind: 'world_global_state',
                    schemaId: 'world_global_state',
                    summary: '旧状态描述',
                },
            ],
            actorKeys: ['user'],
            summaryContent: 'window',
        });

        expect(snapshot.summaryId).toBe('summary-1');
        const upserts = applySnapshot.mock.calls[0][0].entryUpserts;
        const invalidated = upserts.find((item: { entryId?: string }) => item.entryId === 'old-state');
        expect(invalidated).toBeTruthy();
        expect(invalidated.detailPayload.lifecycle.status).toBe('invalidated');
        expect(invalidated.detailPayload.lifecycle.reasonCodes).toContain('state_replaced');
        expect(invalidated.detailPayload.supersededBy).toBe('新状态');
    });
});
