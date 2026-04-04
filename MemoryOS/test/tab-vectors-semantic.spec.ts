import { describe, expect, it } from 'vitest';
import { buildVectorsViewMarkup } from '../src/ui/workbenchTabs/tabVectors';
import type { WorkbenchSnapshot, WorkbenchState } from '../src/ui/workbenchTabs/shared';

describe('tabVectors semantic display', () => {
    it('会在最终结果卡片里显示公共语义标签', () => {
        const snapshot = {
            vectorSnapshot: {
                loaded: true,
                runtimeReady: true,
                embeddingAvailable: true,
                vectorStoreAvailable: true,
                retrievalMode: 'hybrid',
                vectorEnableStrategyRouting: true,
                vectorEnableRerank: true,
                documentCount: 0,
                readyCount: 0,
                pendingCount: 0,
                failedCount: 0,
                indexCount: 0,
                recallStatCount: 0,
                documents: [],
                indexRecords: [],
                recallStats: [],
                embeddingModel: '',
                embeddingUnavailableReason: '',
                vectorStoreUnavailableReason: '',
            },
        } as unknown as WorkbenchSnapshot;
        const state = {
            currentView: 'vectors',
            vectorSourceKindFilter: 'all',
            vectorStatusFilter: 'all',
            vectorSchemaFilter: 'all',
            vectorActorFilter: 'all',
            vectorTextFilter: '',
            vectorSelectedDocId: '',
            vectorRightTab: 'test',
            vectorTestRunning: false,
            vectorQuery: '测试',
            vectorMode: 'hybrid',
            vectorTopKTest: '5',
            vectorDeepWindowTest: '12',
            vectorFinalTopKTest: '5',
            vectorEnableStrategyRoutingTest: true,
            vectorEnableRerankTest: true,
            vectorEnableLLMHubRerankTest: false,
            vectorEnableGraphExpansionTest: false,
            vectorTestProgress: null,
            vectorTestResult: {
                generatedAt: 1,
                query: '测试',
                retrievalMode: 'hybrid',
                providerId: 'p',
                diagnostics: {
                    resultSourceLabels: [{ candidateId: 'c1', source: 'vector' }],
                },
                items: [{
                    score: 0.88,
                        candidate: {
                            candidateId: 'c1',
                            entryId: 'e1',
                            schemaId: 'task',
                            title: '林间疗伤',
                            summary: '塞拉菲娜正在持续治疗{{user}}的伤势。',
                            updatedAt: 1,
                            memoryPercent: 60,
                            forgettingTier: 'shadow_forgotten',
                            shadowTriggered: true,
                            retention: {
                                retentionScore: 28,
                                retrievalWeight: 0.41,
                                promptRenderStage: 'distorted',
                                forgottenLevel: 'shadow_forgotten',
                                shadowTriggered: true,
                                canRecall: true,
                                shadowRecallPenalty: 0.42,
                                shadowConfidencePenalty: 0.38,
                                rawMemoryPercent: 10,
                                effectiveMemoryPercent: 41,
                                explainReasonCodes: ['retention_stage_distorted', 'shadow_recall_triggered'],
                            },
                            semantic: {
                                semanticKind: 'task_progress',
                                visibilityScope: 'actor_visible',
                            isCharacterVisible: true,
                            isOngoing: true,
                            currentState: '进行中',
                            goalOrObjective: '稳定{{user}}的伤势',
                            sourceEntryType: 'task',
                        },
                    },
                    breakdown: {},
                }],
            },
        } as unknown as WorkbenchState;

        const markup = buildVectorsViewMarkup(snapshot, state);
        expect(markup).toContain('任务推进');
        expect(markup).toContain('角色可见');
        expect(markup).toContain('进行中');
        expect(markup).toContain('稳定你的伤势');
        expect(markup).toContain('影子遗忘');
        expect(markup).toContain('已影子唤起');
        expect(markup).toContain('权重 0.41');
        expect(markup).toContain('阶段：distorted');
        expect(markup).toContain('shadow_recall_triggered');
    });
});
