import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSummaryMutationDocument } from '../src/memory-summary/mutation-validator';
import type { MemoryEntry, SummarySnapshot } from '../src/types';

async function loadSummaryOrchestrator(mockedUserName: string) {
    vi.resetModules();
    vi.doMock('../../../SDK/tavern', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../../../SDK/tavern')>();
        return {
            ...actual,
            getCurrentTavernUserNameEvent: vi.fn(() => mockedUserName),
        };
    });
    return import('../src/memory-summary');
}

function buildTaskEntry(): MemoryEntry {
    return {
        entryId: 'entry-task-1',
        chatKey: 'chat',
        title: '护送密使离开王都',
        entryType: 'task',
        category: '任务',
        tags: ['task'],
        summary: '任务仍处于筹划阶段。',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            entityKey: 'entity:task:escort_messenger',
            compareKey: 'ck:v2:task:护送密使离开王都:王都',
            fields: {
                objective: '护送密使离开王都',
                status: '筹划中',
            },
        },
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('summary writable target refs', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('会把 LLM 输出的 targetRef 解码为真实 candidateId / targetId 后再应用 patch', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const entry = buildTaskEntry();
        const applySnapshot = vi.fn(async (input): Promise<SummarySnapshot> => ({
            summaryId: 'summary-target-ref',
            chatKey: 'chat',
            title: input.title ?? '',
            content: input.content,
            actorKeys: input.actorKeys,
            entryUpserts: input.entryUpserts ?? [],
            refreshBindings: input.refreshBindings ?? [],
            createdAt: 1,
            updatedAt: 1,
        }));
        const history: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const llmRunTask = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                data: {
                    should_update: true,
                    focus_types: ['task'],
                    entities: ['user', 'actor_erin'],
                    topics: ['任务推进'],
                    reasons: ['护送任务从筹划进入执行'],
                    memory_value: 'high',
                    suggested_operation_bias: ['UPDATE'],
                    skip_reason: '',
                },
            })
            .mockImplementationOnce(async (args) => {
                const contextMatch = String(args.input.messages[1].content).match(/<memory_task_context>\s*([\s\S]*?)\s*<\/memory_task_context>/u);
                const inputPayload = JSON.parse(String(contextMatch?.[1] ?? '{}')) as {
                    patchTargetManifest?: { patchTargets?: Array<{ targetRef: string }> };
                };
                const targetRef = inputPayload.patchTargetManifest?.patchTargets?.[0]?.targetRef;
                expect(targetRef).toBe('T1');
                return {
                    ok: true,
                    data: {
                        schemaVersion: '1.0.0',
                        window: { fromTurn: 1, toTurn: 2 },
                        actions: [
                            {
                                action: 'UPDATE',
                                targetKind: 'task',
                                targetRef,
                                confidence: 0.86,
                                memoryValue: 'high',
                                sourceEvidence: {
                                    type: 'story_dialogue',
                                    brief: '艾琳确认密使当晚从旧水渠离城。',
                                },
                                patch: {
                                    fields: {
                                        status: '执行中',
                                    },
                                },
                                reasonCodes: ['task_progressed'],
                            },
                        ],
                    },
                };
            });

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => [entry],
                listRoleMemories: async () => [],
                listSummarySnapshots: async () => [],
                getWorldProfileBinding: async () => null,
                appendMutationHistory: async (input) => {
                    history.push(input);
                },
                getEntry: async (entryId) => entryId === entry.entryId ? entry : null,
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
                { role: 'user', content: '艾琳确认密使必须当晚从旧水渠离城。' },
                { role: 'assistant', content: '护送任务从筹划进入执行。' },
            ],
            retrievalRulePack: 'hybrid',
        });

        expect(result.snapshot?.summaryId).toBe('summary-target-ref');
        const mutationPayload = history.find((item) => item.action === 'summary_mutation_batch_resolved')?.payload ?? {};
        const validatedDocument = mutationPayload.validatedDocument as { actions?: Array<Record<string, unknown>> };
        expect(validatedDocument.actions?.[0]?.targetRef).toBe('T1');
        expect(validatedDocument.actions?.[0]?.candidateId).toBe('cand_1');
        expect(validatedDocument.actions?.[0]?.targetId).toBe('entry-task-1');
        expect(applySnapshot.mock.calls[0][0].entryUpserts?.[0]?.entryId).toBe('entry-task-1');
    }, 10_000);

    it('会拒绝 targetRef patch 中不在 editablePaths 的路径', () => {
        const result = validateSummaryMutationDocument(
            {
                schemaVersion: '1.0.0',
                window: { fromTurn: 1, toTurn: 2 },
                actions: [
                    {
                        action: 'UPDATE',
                        targetKind: 'task',
                        targetRef: 'T1',
                        candidateId: 'cand_1',
                        confidence: 0.8,
                        memoryValue: 'high',
                        sourceEvidence: {
                            type: 'story_dialogue',
                            brief: '艾琳确认任务进入执行。',
                        },
                        patch: {
                            fields: {
                                secret: '不允许写入',
                            },
                        },
                        reasonCodes: ['task_progressed'],
                    },
                ],
            },
            new Map([['task', new Set(['summary', 'fields.status'])]]),
            {
                targetEditablePaths: new Map([['T1', new Set(['summary', 'fields.status'])]]),
                requireTargetRefForExistingMutations: true,
            },
        );

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('patch_path_not_allowed:T1:fields.secret');
    });
});
