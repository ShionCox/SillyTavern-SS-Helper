import { describe, expect, it, vi } from 'vitest';
import { runSummaryOrchestrator } from '../src/memory-summary';
import type { MemoryEntry, RoleEntryMemory, SummarySnapshot, WorldProfileBinding } from '../src/types';

function buildEntry(): MemoryEntry {
    return {
        entryId: 'entry-1',
        chatKey: 'chat',
        title: '关系状态',
        entryType: 'relationship',
        category: '角色关系',
        tags: ['old'],
        summary: '原有关系',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {},
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
        entryId: 'entry-1',
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

describe('runSummaryOrchestrator integration', () => {
    it('applies validated mutation and returns snapshot', async () => {
        const historyActions: string[] = [];
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

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                getWorldProfileBinding: async () => buildBinding(),
                appendMutationHistory: async (input) => {
                    historyActions.push(input.action);
                },
                getEntry: async () => buildEntry(),
                applySummarySnapshot: applySnapshot,
                deleteEntry: async () => {},
            },
            llm: {
                registerConsumer: () => {},
                runTask: vi.fn(async () => ({
                    ok: true,
                    data: {
                        schemaVersion: '1.0.0',
                        window: { fromTurn: 1, toTurn: 2 },
                        actions: [
                            {
                                action: 'UPDATE',
                                targetKind: 'relationship',
                                candidateId: 'cand_1',
                                payload: {
                                    summary: '关系更新',
                                    trust: 0.33,
                                },
                                reasonCodes: ['conflict'],
                            },
                        ],
                    },
                })),
            },
            pluginId: 'MemoryOS',
            messages: [
                { role: 'user', content: 'char_erin和char_mc发生争执' },
                { role: 'assistant', content: '她们的关系紧张了' },
            ],
            enableEmbedding: false,
        });

        expect(result.snapshot?.summaryId).toBe('summary-1');
        expect(applySnapshot).toHaveBeenCalledTimes(1);
        expect(historyActions).toContain('summary_started');
        expect(historyActions).toContain('candidate_types_resolved');
        expect(historyActions).toContain('type_schemas_resolved');
        expect(historyActions).toContain('candidate_records_resolved');
        expect(historyActions).toContain('mutation_validated');
        expect(historyActions).toContain('mutation_applied');
    });

    it('returns null snapshot on failure and writes diagnostics only', async () => {
        const applySnapshot = vi.fn();
        const historyActions: string[] = [];

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                getWorldProfileBinding: async () => buildBinding(),
                appendMutationHistory: async (input) => {
                    historyActions.push(input.action);
                },
                getEntry: async () => buildEntry(),
                applySummarySnapshot: applySnapshot,
                deleteEntry: async () => {},
            },
            llm: null,
            pluginId: 'MemoryOS',
            messages: [
                { role: 'user', content: '测试失败路径' },
                { role: 'assistant', content: '继续' },
            ],
            enableEmbedding: false,
        });

        expect(result.snapshot).toBeNull();
        expect(applySnapshot).not.toHaveBeenCalled();
        expect(historyActions).toContain('summary_failed');
    });
});
