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
        entryId: 'entry-1',
        chatKey: 'chat',
        title: '关系状态',
        entryType: 'relationship',
        category: '角色关系',
        tags: ['old'],
        summary: '原有关联',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            sourceActorKey: 'char_erin',
            targetActorKey: 'user',
            participants: ['char_erin', 'user'],
            state: '旧状态',
            fields: {
                relationTag: '陌生人',
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
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('会在总结落库前把自然语言中的用户称呼替换成当前用户名', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const historyActions: string[] = [];
        const historyPayloads: Array<{ action: string; payload: Record<string, unknown> }> = [];
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
                    focus_types: ['relationship'],
                    entities: ['char_erin', 'user'],
                    topics: ['关系变化'],
                    reasons: ['当前窗口中出现了稳定的关系推进'],
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
                            targetKind: 'relationship',
                            candidateId: 'cand_1',
                            payload: {
                                title: '主角与艾琳的关系',
                                summary: '她对用户保持警惕',
                                trust: 0.33,
                                fields: {
                                    relationTag: '陌生人',
                                },
                            },
                            reasonCodes: ['conflict'],
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
                appendMutationHistory: async (input) => {
                    historyActions.push(input.action);
                    historyPayloads.push({
                        action: input.action,
                        payload: input.payload,
                    });
                },
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
                { role: 'user', content: '林远刚进城，艾琳对用户很警惕' },
                { role: 'assistant', content: '她暂时没有放下戒心' },
            ],
            enableEmbedding: false,
            retrievalRulePack: 'hybrid',
        });

        expect(result.snapshot?.summaryId).toBe('summary-1');
        expect(applySnapshot).toHaveBeenCalledTimes(1);
        const plannerPayload = historyPayloads.find((item) => item.action === 'summary_planner_resolved')?.payload ?? {};
        const narrativeStyle = (plannerPayload.narrativeStyle ?? {}) as Record<string, unknown>;
        expect(narrativeStyle.primaryStyle).toBe('modern');
        expect(narrativeStyle.source).toBe('binding');
        expect(applySnapshot.mock.calls[0][0].entryUpserts).toHaveLength(0);
        const relationshipMutation = applySnapshot.mock.calls[0][0].relationshipMutations[0];
        expect(relationshipMutation.targetKind).toBe('relationship');
        expect(relationshipMutation.summary).toBe('她对你保持警惕');
        expect(relationshipMutation.detailPayload.targetActorKey).toBe('user');
        expect(relationshipMutation.detailPayload.participants).toEqual(['char_erin', 'user']);
        expect(relationshipMutation.detailPayload.trust).toBe(0.33);
        expect(relationshipMutation.detailPayload.fields.relationTag).toBe('陌生人');
        expect(historyActions).toContain('summary_started');
        expect(historyActions).toContain('mutation_validated');
        expect(historyActions).toContain('mutation_applied');
    });

    it('失败时只写诊断，不产生总结快照', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const applySnapshot = vi.fn();
        const historyActions: string[] = [];

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                listSummarySnapshots: async () => [],
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
            retrievalRulePack: 'hybrid',
        });

        expect(result.snapshot).toBeNull();
        expect(applySnapshot).not.toHaveBeenCalled();
        expect(historyActions).toContain('summary_failed');
    });

    it('第二阶段批次失败后，再次执行会直接从失败批次继续而不重跑 planner', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const applySnapshot = vi.fn(async (input): Promise<SummarySnapshot> => {
            return {
                summaryId: 'summary-2',
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
                    focus_types: ['relationship'],
                    entities: ['char_erin', 'user'],
                    topics: ['关系变化'],
                    reasons: ['需要更新关系状态'],
                },
            })
            .mockResolvedValueOnce({
                ok: false,
                reasonCode: 'summary_llm_failed',
            })
            .mockResolvedValueOnce({
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
                                title: '你与艾琳的关系',
                                summary: '艾琳依旧对你保持观察。',
                                trust: 0.42,
                                fields: {
                                    relationTag: '陌生人',
                                },
                            },
                            reasonCodes: ['resume_success'],
                        },
                    ],
                },
            });

        const firstResult = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                listSummarySnapshots: async () => [],
                getWorldProfileBinding: async () => buildBinding(),
                appendMutationHistory: async () => undefined,
                getEntry: async () => buildEntry(),
                applySummarySnapshot: applySnapshot,
                deleteEntry: async () => {},
            },
            llm: {
                registerConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            chatKey: 'chat',
            messages: [
                { role: 'user', content: '林远看向艾琳。' },
                { role: 'assistant', content: '艾琳没有放下戒心。' },
            ],
            enableEmbedding: false,
            retrievalRulePack: 'hybrid',
        });
        const secondResult = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [buildEntry()],
                listRoleMemories: async () => [buildRoleMemory()],
                listSummarySnapshots: async () => [],
                getWorldProfileBinding: async () => buildBinding(),
                appendMutationHistory: async () => undefined,
                getEntry: async () => buildEntry(),
                applySummarySnapshot: applySnapshot,
                deleteEntry: async () => {},
            },
            llm: {
                registerConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            chatKey: 'chat',
            messages: [
                { role: 'user', content: '林远看向艾琳。' },
                { role: 'assistant', content: '艾琳没有放下戒心。' },
            ],
            enableEmbedding: false,
            retrievalRulePack: 'hybrid',
        });

        expect(firstResult.snapshot).toBeNull();
        expect(secondResult.snapshot?.summaryId).toBe('summary-2');
        expect(llmRunTask).toHaveBeenCalledTimes(3);
        expect(applySnapshot).toHaveBeenCalledTimes(1);
    });
});
