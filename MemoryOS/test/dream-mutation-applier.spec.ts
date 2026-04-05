import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry } from '../src/types';
import type { DreamRollbackMetadataRecord } from '../src/services/dream-types';

const rollbackSnapshots: Record<string, unknown>[] = [];
const rollbackMetadatas: DreamRollbackMetadataRecord[] = [];

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            async saveDreamRollbackSnapshot(record: Record<string, unknown>): Promise<void> {
                rollbackSnapshots.push(record);
            }

            async saveDreamRollbackMetadata(record: DreamRollbackMetadataRecord): Promise<void> {
                rollbackMetadatas.push(record);
            }
        },
    };
});

import { DreamMutationApplier } from '../src/services/dream-mutation-applier';

describe('DreamMutationApplier', () => {
    beforeEach(() => {
        rollbackSnapshots.length = 0;
        rollbackMetadatas.length = 0;
    });

    it('会通过统一 mutation 服务写回并把 applyResult 写入 rollback metadata', async () => {
        const entries = new Map<string, MemoryEntry>();
        entries.set('entry_source', {
            entryId: 'entry_source',
            chatKey: 'chat_1',
            title: '旧来源',
            entryType: 'event',
            category: '事件',
            tags: ['source'],
            summary: '旧来源摘要',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {},
            sourceSummaryIds: [],
            createdAt: 1,
            updatedAt: 1,
        });

        const repository = {
            getEntry: vi.fn(async (entryId: string): Promise<MemoryEntry | null> => entries.get(entryId) ?? null),
            listRelationships: vi.fn(async () => []),
            listActorProfiles: vi.fn(async () => []),
            listCompareKeyIndexRecords: vi.fn(async () => []),
            bindRoleToEntry: vi.fn(async () => ({})),
            appendMutationHistory: vi.fn(async () => undefined),
            ensureActorProfile: vi.fn(async () => ({})),
            applyLedgerMutationBatch: vi.fn(async () => {
                const created: MemoryEntry = {
                    entryId: 'entry_new',
                    chatKey: 'chat_1',
                    title: '新事件',
                    entryType: 'event',
                    category: '事件',
                    tags: ['dream'],
                    summary: '新摘要',
                    detail: '',
                    detailSchemaVersion: 1,
                    detailPayload: {
                        dreamMeta: {
                            dreamId: 'dream_1',
                        },
                    },
                    sourceSummaryIds: [],
                    createdAt: 2,
                    updatedAt: 2,
                };
                entries.set(created.entryId, created);
                return {
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
                        title: '新事件',
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
                };
            }),
        } as any;

        const applier = new DreamMutationApplier('chat_1', repository);
        const result = await applier.applyDreamMutations({
            dreamId: 'dream_1',
            mutations: [{
                mutationId: 'mut_1',
                mutationType: 'entry_create',
                confidence: 0.85,
                reason: '形成了新的稳定事件。',
                sourceWave: 'recent',
                sourceEntryIds: ['entry_source'],
                preview: '新增事件',
                payload: {
                    title: '新事件',
                    entryType: 'event',
                    summary: '新摘要',
                },
            }],
        });

        expect(result.appliedMutationIds).toEqual(['mut_1']);
        expect(result.affectedEntryIds).toContain('entry_new');
        expect(rollbackSnapshots.length).toBeGreaterThanOrEqual(2);
        expect(rollbackMetadatas).toHaveLength(1);
        expect(rollbackMetadatas[0]?.applyResult?.appliedEntryMutationIds).toEqual(['mut_1']);
        expect(rollbackMetadatas[0]?.applyResult?.createdEntryIds).toEqual(['entry_new']);
        expect(repository.applyLedgerMutationBatch).toHaveBeenCalledTimes(1);
    });
});
