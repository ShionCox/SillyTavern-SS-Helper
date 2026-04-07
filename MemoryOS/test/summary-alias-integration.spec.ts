import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry, RoleEntryMemory, SummarySnapshot, WorldProfileBinding } from '../src/types';

async function loadSummaryOrchestrator(mockedUserName: string) {
    vi.resetModules();
    vi.doMock('../../../SDK/tavern', () => {
        return {
            getCurrentTavernUserNameEvent: vi.fn(() => mockedUserName),
        };
    });
    return import('../src/memory-summary');
}

function buildEntry(): MemoryEntry {
    return {
        entryId: 'entry-long-1',
        chatKey: 'chat',
        title: '林地停驻',
        entryType: 'event',
        category: '事件',
        tags: ['old'],
        summary: '曾在林地停驻整顿。',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            location: '林地',
            fields: {
                importance: 0.6,
            },
        },
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 2,
    };
}

function buildRoleMemory(): RoleEntryMemory {
    return {
        roleMemoryId: 'rm-1',
        chatKey: 'chat',
        actorKey: 'char_erin',
        entryId: 'entry-long-1',
        memoryPercent: 88,
        forgotten: false,
        updatedAt: 1,
    };
}

function buildBinding(): WorldProfileBinding {
    return {
        chatKey: 'chat',
        primaryProfile: 'urban_modern',
        secondaryProfiles: [],
        confidence: 0.7,
        reasonCodes: ['binding'],
        detectedFrom: ['cache'],
        sourceHash: 'wp:1',
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('runSummaryOrchestrator alias integration', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('第二阶段 prompt 只暴露短候选引用，并能把 S1 解码回真实 candidateId', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const applySnapshot = vi.fn(async (input): Promise<SummarySnapshot> => {
            return {
                summaryId: 'summary-1',
                chatKey: 'chat',
                title: input.title || '',
                content: input.content,
                actorKeys: input.actorKeys,
                entryUpserts: input.entryUpserts || [],
                refreshBindings: input.refreshBindings || [],
                createdAt: 1,
                updatedAt: 1,
            };
        });
        const llmRunTask = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    should_update: true,
                    focus_types: ['event'],
                    entities: ['user', 'seraphina'],
                    topics: ['林地停驻'],
                    reasons: ['需要更新事件记忆'],
                },
            })
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    schemaVersion: '1.0.0',
                    window: { fromTurn: 1, toTurn: 2 },
                    actions: [
                        {
                            action: 'UPDATE',
                            targetKind: 'event',
                            candidateId: 'S1',
                            payload: {
                                title: '林地停驻',
                                summary: '你们在林地短暂停驻，重新整理状态。',
                                importance: 0.72,
                                fields: {
                                    location: '林地营地',
                                },
                            },
                            reasonCodes: ['alias_resume'],
                        },
                    ],
                },
            });

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                listSummarySnapshots: async () => [],
                getWorldProfileBinding: async () => buildBinding(),
                appendMutationHistory: async () => {},
                getEntry: async () => buildEntry(),
                applySummarySnapshot: applySnapshot,
                deleteEntry: async () => {},
            },
            llm: {
                registerConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            messages: [
                { role: 'user', content: '你们在林地短暂停驻，重新整理状态。' },
                { role: 'assistant', content: '这段停驻让节奏稳定了下来。' },
            ],
            retrievalRulePack: 'hybrid',
        } as any);

        expect(result.snapshot?.summaryId).toBe('summary-1');
        expect(applySnapshot).toHaveBeenCalledTimes(1);

        const secondCallPayload = llmRunTask.mock.calls[1]?.[0]?.input?.messages?.[1]?.content ?? '';
        expect(secondCallPayload).toContain('"candidateId": "S1"');
        expect(secondCallPayload).not.toContain('"recordId": "entry-long-1"');

        const appliedUpsert = applySnapshot.mock.calls[0][0].entryUpserts[0];
        expect(appliedUpsert.title).toBe('林地停驻');
        expect(appliedUpsert.detailPayload.importance).toBe(0.72);
    });
});
