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

/**
 * 功能：构造最小记忆条目。
 * @returns 记忆条目。
 */
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

/**
 * 功能：构造最小角色记忆。
 * @returns 角色记忆。
 */
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

/**
 * 功能：构造世界画像绑定。
 * @returns 世界画像绑定。
 */
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

describe('runSummaryOrchestrator prompt 用户占位符', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('会在 planner 和 mutation 两段 prompt 中使用 {{user}} 而不直接暴露真实用户名', async () => {
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
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
                ok: false,
                reasonCode: 'summary_llm_failed',
            });

        await runSummaryOrchestrator({
            dependencies: {
                listEntries: async (): Promise<MemoryEntry[]> => [buildEntry()],
                listRoleMemories: async (): Promise<RoleEntryMemory[]> => [buildRoleMemory()],
                listSummarySnapshots: async (): Promise<SummarySnapshot[]> => [],
                getWorldProfileBinding: async (): Promise<WorldProfileBinding | null> => buildBinding(),
                appendMutationHistory: async (): Promise<void> => undefined,
                getEntry: async (): Promise<MemoryEntry> => buildEntry(),
                applySummarySnapshot: async (): Promise<SummarySnapshot> => ({
                    summaryId: 'summary-unused',
                    chatKey: 'chat',
                    title: '',
                    content: '',
                    actorKeys: [],
                    entryUpserts: [],
                    refreshBindings: [],
                    createdAt: 1,
                    updatedAt: 1,
                }),
                deleteEntry: async (): Promise<void> => undefined,
            },
            llm: {
                registerConsumer: () => {},
                unregisterConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            chatKey: 'chat',
            messages: [
                { role: 'user', name: '林远', content: '林远刚进城，艾琳对林远很警惕。' },
                { role: 'assistant', content: '她暂时没有放下戒心。' },
            ],
            retrievalRulePack: 'hybrid',
        });

        const plannerCall = llmRunTask.mock.calls[0]?.[0] as { input?: { messages?: Array<{ content: string }> } };
        const plannerPromptText = (plannerCall.input?.messages ?? []).map((item) => item.content).join('\n');
        expect(plannerPromptText).toContain('{{user}}');
        expect(plannerPromptText).not.toContain('林远');
        expect(plannerPromptText).not.toContain('{{userDisplayName}}');

        const mutationCall = llmRunTask.mock.calls[1]?.[0] as { input?: { messages?: Array<{ content: string }> } };
        const mutationPromptText = (mutationCall.input?.messages ?? []).map((item) => item.content).join('\n');
        expect(mutationPromptText).toContain('{{user}}');
        expect(mutationPromptText).not.toContain('林远');
        expect(mutationPromptText).not.toContain('{{userDisplayName}}');
    });
});
