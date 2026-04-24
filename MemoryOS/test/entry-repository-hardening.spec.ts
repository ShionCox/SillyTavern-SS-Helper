import { beforeEach, describe, expect, it, vi } from 'vitest';

const relationshipRows = new Map<string, Record<string, unknown>>();
const actorProfileRows = new Map<string, Record<string, unknown>>();
const entryRows = new Map<string, Record<string, unknown>>();
let bulkPutRows: Record<string, unknown>[] = [];

const {
    mockedOnActorSaved,
    mockedOnEntryDeleted,
    mockedOnEntrySaved,
    mockedOnRelationshipSaved,
} = vi.hoisted(() => ({
    mockedOnActorSaved: vi.fn(),
    mockedOnEntryDeleted: vi.fn(),
    mockedOnEntrySaved: vi.fn(),
    mockedOnRelationshipSaved: vi.fn(),
}));

vi.mock('../../SDK/tavern', (): Record<string, unknown> => {
    return {
        getCurrentTavernUserSnapshotEvent: (): Record<string, unknown> => ({ userName: '用户' }),
    };
});

vi.mock('../src/services/vector-index-service', (): Record<string, unknown> => {
    return {
        onActorSaved: mockedOnActorSaved,
        onEntryDeleted: mockedOnEntryDeleted,
        onEntrySaved: mockedOnEntrySaved,
        onRelationshipSaved: mockedOnRelationshipSaved,
    };
});

vi.mock('../src/db/db', (): Record<string, unknown> => {
    return {
        db: {
            memory_entries: {
                get: vi.fn(async (entryId: string) => entryRows.get(entryId)),
                put: vi.fn(async (row: Record<string, unknown>) => {
                    entryRows.set(String(row.entryId), row);
                }),
                delete: vi.fn(async (entryId: string) => {
                    entryRows.delete(entryId);
                }),
            },
            memory_relationships: {
                get: vi.fn(async (relationshipId: string) => relationshipRows.get(relationshipId)),
                put: vi.fn(async (row: Record<string, unknown>) => {
                    relationshipRows.set(String(row.relationshipId), row);
                }),
                bulkDelete: vi.fn(async (ids: string[]) => {
                    ids.forEach((id: string): void => {
                        relationshipRows.delete(id);
                    });
                }),
                bulkPut: vi.fn(async (rows: Record<string, unknown>[]) => {
                    bulkPutRows = rows;
                    rows.forEach((row: Record<string, unknown>): void => {
                        relationshipRows.set(String(row.relationshipId), row);
                    });
                }),
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        toArray: vi.fn(async () => [...relationshipRows.values()]),
                    })),
                })),
            },
            actor_memory_profiles: {
                get: vi.fn(async (key: [string, string]) => actorProfileRows.get(`${key[0]}::${key[1]}`)),
                put: vi.fn(async (row: Record<string, unknown>) => {
                    actorProfileRows.set(`${String(row.chatKey)}::${String(row.actorKey)}`, row);
                }),
                where: vi.fn(() => ({
                    equals: vi.fn((chatKey: string) => ({
                        toArray: vi.fn(async () => [...actorProfileRows.values()].filter((row: Record<string, unknown>): boolean => String(row.chatKey) === chatKey)),
                    })),
                })),
            },
            transaction: vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) => {
                await callback();
            }),
            memory_entry_audit_records: {
                put: vi.fn(),
            },
        },
        deleteMemoryCompareKeyIndexRecord: vi.fn(),
        loadMemoryCompareKeyIndexRecords: vi.fn(async () => []),
        saveMemoryCompareKeyIndexRecord: vi.fn(),
    };
});

import { buildRelationshipRecordId } from '../src/core/compare-key';
import { EntryRepository } from '../src/repository/entry-repository';

describe('entry repository hardening', (): void => {
    beforeEach((): void => {
        relationshipRows.clear();
        actorProfileRows.clear();
        entryRows.clear();
        bulkPutRows = [];
        mockedOnActorSaved.mockReset();
        mockedOnEntryDeleted.mockReset();
        mockedOnEntrySaved.mockReset();
        mockedOnRelationshipSaved.mockReset();
        mockedOnActorSaved.mockResolvedValue(undefined);
        mockedOnEntryDeleted.mockResolvedValue(undefined);
        mockedOnEntrySaved.mockResolvedValue(undefined);
        mockedOnRelationshipSaved.mockResolvedValue(undefined);
    });

    it('normalizeActorKeyList 遇到非法 actorKey 时直接抛错', (): void => {
        const repository = new EntryRepository('chat-1');

        expect(() => (repository as any).normalizeActorKeyList(['actor_alice', 'char_bad'])).toThrow(/invalid_actor_key/);
    });

    it('resolveRefreshTargets 遇到非法 actorKey 时不再静默跳过', async (): Promise<void> => {
        const repository = new EntryRepository('chat-1');
        (repository as any).listEntries = vi.fn(async () => []);

        await expect((repository as any).resolveRefreshTargets([{
            actorKey: 'char_bad',
            entryTitle: '测试词条',
        }], [])).rejects.toThrow(/invalid_actor_key/);
    });

    it('saveRelationship 与 replaceRelationshipsForTakeover 复用同一稳定 relationshipId', async (): Promise<void> => {
        const repository = new EntryRepository('chat-1');
        const saved = await repository.saveRelationship({
            sourceActorKey: 'actor_alice',
            targetActorKey: 'user',
            relationTag: '朋友',
            state: '熟悉',
            summary: '两人已经认识。',
            trust: 0.9,
            affection: 0.8,
            tension: 0.1,
            participants: ['actor_alice', 'user'],
        });

        await repository.replaceRelationshipsForTakeover([saved]);

        const expectedId = buildRelationshipRecordId('chat-1', 'actor_alice', 'user', '朋友');
        expect(saved.relationshipId).toBe(expectedId);
        expect(String(bulkPutRows[0]?.relationshipId ?? '')).toBe(expectedId);
        expect(mockedOnRelationshipSaved).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            relationshipId: expectedId,
        }));
    });

    it('ensureActorProfile 不会让低质量兜底名覆盖已存在正式名', async (): Promise<void> => {
        const repository = new EntryRepository('chat-1');

        await repository.ensureActorProfile({
            actorKey: 'actor_heying',
            displayName: '何盈',
            displayNameSource: 'takeover_actor_card',
        });
        await repository.ensureActorProfile({
            actorKey: 'actor_heying',
            displayName: 'heying',
            displayNameSource: 'fallback',
        });

        expect(String(actorProfileRows.get('chat-1::actor_heying')?.displayName ?? '')).toBe('何盈');
        expect(mockedOnActorSaved).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            actorKey: 'actor_heying',
            displayName: '何盈',
        }));
    });

    it('saveEntry 后会触发非阻塞 entry 自动索引钩子', async (): Promise<void> => {
        const repository = new EntryRepository('chat-1');
        (repository as any).getResolvedEntryType = vi.fn(async () => ({
            typeId: 'type:event',
            chatKey: 'chat-1',
            key: 'event',
            label: '事件',
            category: '事件',
            description: '',
            fields: [],
            createdAt: 1,
            updatedAt: 1,
        }));
        (repository as any).appendEntryAuditRecord = vi.fn(async () => {});

        const saved = await repository.saveEntry({
            title: '林间治疗',
            entryType: 'event',
            summary: '角色完成治疗。',
        });

        expect(saved.entryType).toBe('event');
        expect(mockedOnEntrySaved).toHaveBeenCalledWith('chat-1', expect.objectContaining({
            entryId: saved.entryId,
            title: '林间治疗',
        }));
    });
});
