import { describe, expect, it } from 'vitest';
import { buildEntriesViewMarkup } from '../src/ui/workbenchTabs/tabEntries';
import type { MemoryEntry, MemoryEntryType } from '../src/types';
import type { WorkbenchSnapshot, WorkbenchState } from '../src/ui/workbenchTabs/shared';

describe('tabEntries semantic inspector', () => {
    it('会在条目检查器中展示公共语义分组', () => {
        const entry = {
            entryId: 'entry-task-1',
            chatKey: 'chat-1',
            title: '林间疗伤',
            entryType: 'task',
            category: '任务',
            tags: [],
            summary: '塞拉菲娜正在持续治疗{{user}}的伤势。',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {
                fields: {
                    status: '进行中',
                    objective: '稳定{{user}}的伤势',
                },
            },
            ongoing: true,
            createdAt: 1,
            updatedAt: 2,
            sourceSummaryIds: [],
        } as MemoryEntry;
        const snapshot = {
            entryTypes: [],
            entries: [entry],
            actors: [{
                actorKey: 'actor_seraphina',
                chatKey: 'chat-1',
                displayName: '塞拉菲娜',
                memoryStat: 60,
                createdAt: 1,
                updatedAt: 2,
            }],
            roleMemories: [{
                roleMemoryId: 'rm-1',
                chatKey: 'chat-1',
                actorKey: 'actor_seraphina',
                entryId: 'entry-task-1',
                memoryPercent: 18,
                forgotten: true,
                updatedAt: 3,
            }],
            summaries: [],
            preview: null,
            worldProfileBinding: null,
            mutationHistory: [],
            entryAuditRecords: [],
            recallExplanation: null,
            actorGraph: { nodes: [], edges: [] },
            memoryGraph: { nodes: [], edges: [], sections: [] },
            takeoverProgress: null,
            vectorSnapshot: { loaded: false, runtimeStatus: null, documents: [], indexRecords: [], recallStats: [], stats: null, testResult: null },
            contentLabSnapshot: { loaded: false, tagRegistry: [], availableFloors: [] },
        } as unknown as WorkbenchSnapshot;
        const state = {
            currentView: 'entries',
            entryQuery: '',
            entryTimeFilter: 'all',
            entrySortOrder: 'updated-desc',
        } as WorkbenchState;
        const markup = buildEntriesViewMarkup(
            [entry],
            snapshot,
            state,
            new Map<string, MemoryEntryType>(),
            {},
            entry,
            null,
            '',
        );

        expect(markup).toContain('公共语义');
        expect(markup).toContain('任务推进');
        expect(markup).toContain('角色可见');
        expect(markup).toContain('稳定{{user}}的伤势');
        expect(markup).toContain('召回权重');
        expect(markup).toContain('渲染阶段');
        expect(markup).toContain('影子遗忘');
    });
});
