import { describe, expect, it } from 'vitest';
import { buildPreviewViewMarkup } from '../src/ui/workbenchTabs/tabPreview';
import type { WorkbenchSnapshot, WorkbenchState } from '../src/ui/workbenchTabs/shared';

describe('tabPreview forgetting diagnostics', () => {
    it('会在预览面板里显示遗忘层级与影子唤起统计', () => {
        const snapshot = {
            preview: {
                query: '林间疗伤现在怎么样了',
                generatedAt: 1,
                matchedActorKeys: ['actor_seraphina'],
                matchedEntryIds: ['e1'],
                systemText: '',
                roleText: '',
                finalText: '',
                systemEntryIds: [],
                roleEntries: [],
                reasonCodes: [],
                diagnostics: {
                    providerId: 'stub',
                    rulePackMode: 'native',
                    contextRoute: null,
                    retrieval: null,
                    traceRecords: [],
                    injectionActorKey: 'actor_seraphina',
                    injectedCount: 1,
                    estimatedChars: 20,
                    retentionStageCounts: { clear: 0, blur: 1, distorted: 0 },
                    shadowInjectedCount: 1,
                    shadowSectionVisible: true,
                },
            },
            recallExplanation: {
                generatedAt: 1,
                query: '林间疗伤现在怎么样了',
                matchedActorKeys: ['actor_seraphina'],
                matchedEntryIds: ['e1'],
                reasonCodes: [],
                semanticCounts: {
                    event: 0,
                    state: 0,
                    task_progress: 1,
                },
                forgettingCounts: {
                    active: 0,
                    shadow_forgotten: 1,
                    hard_forgotten: 0,
                },
                shadowTriggeredCount: 1,
                traceRecords: [],
            },
            worldProfileBinding: null,
            summaries: [],
            mutationHistory: [],
            entryAuditRecords: [],
        } as unknown as WorkbenchSnapshot;
        const state = {
            currentView: 'preview',
            previewTabLoaded: true,
            previewTabLoading: false,
            previewQuery: '',
        } as unknown as WorkbenchState;

        const markup = buildPreviewViewMarkup(snapshot, state);
        expect(markup).toContain('影子遗忘');
        expect(markup).toContain('影子唤起次数');
        expect(markup).toContain('影子注入条目');
        expect(markup).toContain('影子记忆小节');
        expect(markup).toContain('已显示');
        expect(markup).toContain('1');
    });
});
