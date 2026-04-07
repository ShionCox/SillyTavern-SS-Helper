import { describe, expect, it, vi } from 'vitest';
import { UnifiedMemoryMutationService } from '../src/services/unified-memory-mutation-service';
import type { ApplyLedgerMutationBatchResult, MemoryRelationshipRecord } from '../src/types';
import type { UnifiedMemoryMutation } from '../src/types/unified-mutation';

describe('UnifiedMemoryMutationService', () => {
    it('会把 entry 与 relationship mutation 分发到对应执行器', async () => {
        const applyLedgerMutationBatch = vi.fn(async (): Promise<ApplyLedgerMutationBatchResult> => ({
            createdEntryIds: ['entry_new'],
            updatedEntryIds: [],
            invalidatedEntryIds: [],
            deletedEntryIds: [],
            noopCount: 0,
            counts: {
                input: 1,
                add: 1,
                update: 0,
                merge: 0,
                invalidate: 0,
                delete: 0,
                noop: 0,
            },
            decisions: [{
                targetKind: 'event',
                action: 'ADD',
                title: '新增事件',
                matchMode: 'created',
                entryId: 'entry_new',
                reasonCodes: ['source:dream'],
            }],
            affectedRecords: [{
                entryId: 'entry_new',
                action: 'ADD',
            }],
            bindingResults: [],
            resolvedBindingResults: [],
            auditResults: [{
                entryId: 'entry_new',
                action: 'ADD',
                written: true,
            }],
            historyWritten: true,
        }));
        const relationshipRows: MemoryRelationshipRecord[] = [];
        const saveRelationship = vi.fn(async (input: Record<string, unknown>): Promise<MemoryRelationshipRecord> => ({
            relationshipId: String(input.relationshipId ?? 'rel_1'),
            chatKey: 'chat_1',
            sourceActorKey: String(input.sourceActorKey),
            targetActorKey: String(input.targetActorKey),
            relationTag: String(input.relationTag),
            state: String(input.state ?? ''),
            summary: String(input.summary ?? ''),
            trust: Number(input.trust ?? 0),
            affection: Number(input.affection ?? 0),
            tension: Number(input.tension ?? 0),
            participants: Array.isArray(input.participants) ? input.participants as string[] : [],
            createdAt: 1,
            updatedAt: 2,
            ...(input.ongoing !== undefined ? { ongoing: Boolean(input.ongoing) } : {}),
        }));
        const appendMutationHistory = vi.fn(async (): Promise<void> => {});
        const ensureActorProfile = vi.fn(async (): Promise<void> => {});

        const repository = {
            applyLedgerMutationBatch,
            listRelationships: vi.fn(async (): Promise<MemoryRelationshipRecord[]> => relationshipRows),
            saveRelationship: vi.fn(async (input: Record<string, unknown>): Promise<MemoryRelationshipRecord> => saveRelationship(input)),
            appendMutationHistory,
            ensureActorProfile,
        } as any;

        const service = new UnifiedMemoryMutationService({
            chatKey: 'chat_1',
            repository,
        });
        const mutations: UnifiedMemoryMutation[] = [
            {
                targetKind: 'event',
                action: 'ADD',
                title: '新增事件',
                sourceContext: {
                    mutationId: 'entry_mut_1',
                },
            },
            {
                targetKind: 'relationship',
                action: 'UPDATE',
                title: '朋友',
                detailPayload: {
                    relationshipId: 'rel_1',
                    sourceActorKey: 'user',
                    targetActorKey: 'assistant',
                    relationTag: '朋友',
                    trust: 70,
                    affection: 75,
                    tension: 5,
                    participants: ['user', 'assistant'],
                },
                sourceContext: {
                    mutationId: 'rel_mut_1',
                    sourceActorKey: 'user',
                    targetActorKey: 'assistant',
                    relationTag: '朋友',
                },
            },
        ];

        const result = await service.applyMutations({
            mutations,
            context: {
                chatKey: 'chat_1',
                source: 'dream',
                sourceLabel: 'Dream Review 批准写回',
            },
        });

        expect(applyLedgerMutationBatch).toHaveBeenCalledTimes(1);
        expect(repository.saveRelationship).toHaveBeenCalledTimes(1);
        expect(result.appliedEntryMutationIds).toEqual(['entry_mut_1']);
        expect(result.appliedRelationshipMutationIds).toEqual(['rel_mut_1']);
        expect(result.createdEntryIds).toEqual(['entry_new']);
        expect(result.createdRelationshipIds).toEqual(['rel_1']);
        expect(result.historyWritten).toBe(true);
        expect(appendMutationHistory).toHaveBeenCalled();
    });
});
