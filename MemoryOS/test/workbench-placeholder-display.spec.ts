import { describe, expect, it } from 'vitest';

import { buildTakeoverViewMarkup } from '../src/ui/workbenchTabs/tabTakeover';
import { formatDisplayValue, type WorkbenchSnapshot, type WorkbenchState, type WorkbenchVectorSnapshot } from '../src/ui/workbenchTabs/shared';
import { buildTakeoverMemoryGraph } from '../src/ui/workbenchTabs/shared/memory-graph-builder';
import { sanitizeWorkbenchDisplayText } from '../src/ui/workbenchTabs/shared/workbench-text';
import type { MemoryTakeoverBatchResult, MemoryTakeoverProgressSnapshot } from '../src/types';

/**
 * 功能：构造空的向量快照，便于工作台测试复用。
 * @returns 空向量快照。
 */
function createEmptyVectorSnapshot(): WorkbenchVectorSnapshot {
    return {
        loaded: false,
        runtimeReady: false,
        embeddingAvailable: false,
        vectorStoreAvailable: false,
        retrievalMode: 'hybrid',
        documentCount: 0,
        readyCount: 0,
        pendingCount: 0,
        failedCount: 0,
        indexCount: 0,
        recallStatCount: 0,
        documents: [],
        indexRecords: [],
        recallStats: [],
    };
}

/**
 * 功能：构造最小可用的工作台状态。
 * @returns 工作台状态。
 */
function createWorkbenchState(): WorkbenchState {
    return {
        currentView: 'takeover',
        currentActorTab: 'attributes',
        selectedEntryId: '',
        selectedTypeKey: '',
        selectedActorKey: '',
        entryQuery: '',
        previewQuery: '',
        previewTabLoaded: false,
        previewTabLoading: false,
        bindEntryId: '',
        actorQuery: '',
        actorSortOrder: 'stat-desc',
        actorTagFilter: '',
        selectedGraphNodeId: '',
        selectedGraphEdgeId: '',
        memoryGraphQuery: '',
        memoryGraphFilterType: '',
        memoryGraphMode: 'semantic',
        takeoverMode: 'full',
        takeoverRangeStart: '',
        takeoverRangeEnd: '',
        takeoverRecentFloors: '',
        takeoverBatchSize: '',
        takeoverUseActiveSnapshot: false,
        takeoverActiveSnapshotFloors: '',
        takeoverPreview: null,
        takeoverPreviewLoading: false,
        takeoverPreviewExpanded: false,
        takeoverProgressLoading: false,
        vectorQuery: '',
        vectorMode: 'hybrid',
        vectorSourceKindFilter: '',
        vectorStatusFilter: '',
        vectorSchemaFilter: '',
        vectorActorFilter: '',
        vectorTextFilter: '',
        vectorSelectedDocId: '',
        vectorEnableStrategyRoutingTest: false,
        vectorEnableRerankTest: false,
        vectorEnableLLMHubRerankTest: false,
        vectorEnableGraphExpansionTest: false,
        vectorTopKTest: '',
        vectorDeepWindowTest: '',
        vectorFinalTopKTest: '',
        vectorTabLoaded: false,
        vectorTabLoading: false,
        vectorTestRunning: false,
        vectorTestResult: null,
        vectorTestProgress: null,
        contentLabStartFloor: '',
        contentLabEndFloor: '',
        contentLabSelectedFloor: '',
        contentLabPreviewSourceMode: 'content',
        contentLabPreviewLoading: false,
        contentLabTabLoaded: false,
        contentLabTabLoading: false,
        contentLabBlocks: [],
        contentLabPrimaryPreview: '',
        contentLabHintPreview: '',
        contentLabExcludedPreview: '',
        contentLabEnableContentSplit: false,
        contentLabUnknownTagDefaultKind: '',
        contentLabUnknownTagAllowHint: false,
        contentLabEnableRuleClassifier: false,
        contentLabEnableMetaKeywordDetection: false,
        contentLabEnableToolArtifactDetection: false,
        contentLabEnableAIClassifier: false,
        contentLabEditingRuleIndex: -1,
    };
}

/**
 * 功能：构造最小可用的工作台快照。
 * @param takeoverProgress 旧聊天接管进度。
 * @returns 工作台快照。
 */
function createWorkbenchSnapshot(takeoverProgress: MemoryTakeoverProgressSnapshot | null): WorkbenchSnapshot {
    return {
        entryTypes: [],
        entries: [],
        actors: [],
        roleMemories: [],
        summaries: [],
        preview: null,
        worldProfileBinding: null,
        mutationHistory: [],
        entryAuditRecords: [],
        recallExplanation: null,
        actorGraph: {
            nodes: [],
            links: [],
        },
        memoryGraph: {
            nodes: [],
            edges: [],
        },
        takeoverProgress,
        vectorSnapshot: createEmptyVectorSnapshot(),
        contentLabSnapshot: {
            loaded: false,
            tagRegistry: [],
            availableFloors: [],
        },
    };
}

/**
 * 功能：构造最小可用的批次结果。
 * @param overrides 覆盖字段。
 * @returns 批次结果。
 */
function createBatchResult(overrides: Partial<MemoryTakeoverBatchResult> = {}): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:test',
        batchId: 'takeover:test:history:0001',
        summary: '测试批次',
        actorCards: [],
        relationships: [],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [],
        sourceRange: { startFloor: 1, endFloor: 2 },
        generatedAt: 1,
        ...overrides,
    };
}

describe('workbench placeholder display', (): void => {
    it('共享文本清洗会把用户占位符压成自然文本', (): void => {
        expect(sanitizeWorkbenchDisplayText('  {{你}} 正在行动  ')).toBe('你 正在行动');
        expect(formatDisplayValue(['{{user}}', '{{userDisplayName}}的目标'])).toBe('你、你的目标');
    });

    it('旧聊天接管页不会直接显示花括号用户占位符', (): void => {
        const progress: MemoryTakeoverProgressSnapshot = {
            plan: null,
            currentBatch: null,
            baseline: null,
            activeSnapshot: {
                generatedAt: 1,
                currentScene: '{{你}}回到营地',
                currentLocation: '{{user}}的小屋',
                currentTimeHint: '{{userDisplayName}}刚睡醒',
                activeGoals: ['保护{{user}}'],
                activeRelations: [],
                openThreads: ['{{你}}是否继续等待'],
                recentDigest: '{{你}}决定先观察局势',
            },
            latestBatchResult: createBatchResult({
                summary: '{{你}}已经确认新的行动路线',
                chapterTags: ['{{user}}主线'],
                openThreads: ['{{userDisplayName}}的选择'],
                validationErrors: ['{{你}}字段不应残留模板'],
            }),
            consolidation: null,
            batchResults: [],
        };

        const markup = buildTakeoverViewMarkup(createWorkbenchSnapshot(progress), createWorkbenchState());

        expect(markup).not.toContain('{{你}}');
        expect(markup).not.toContain('{{user}}');
        expect(markup).not.toContain('{{userDisplayName}}');
        expect(markup).toContain('你回到营地');
        expect(markup).toContain('你的小屋');
    });

    it('图谱构建后不再保留花括号用户占位符', (): void => {
        const graph = buildTakeoverMemoryGraph({
            plan: null,
            currentBatch: null,
            baseline: null,
            activeSnapshot: null,
            latestBatchResult: null,
            consolidation: null,
            batchResults: [createBatchResult({
                actorCards: [{
                    actorKey: 'user',
                    displayName: '{{你}}',
                    aliases: ['{{user}}'],
                    identityFacts: ['{{userDisplayName}}是当前视角'],
                    originFacts: [],
                    traits: [],
                }],
            })],
        });

        const userNode = graph.nodes.find((node) => node.id === 'actor:user');

        expect(userNode?.label).toBe('你');
        expect(userNode?.semanticSummary).not.toContain('{{');
    });
});
