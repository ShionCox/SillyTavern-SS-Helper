import { describe, expect, it } from 'vitest';

import { buildContentLabViewMarkup } from '../src/ui/workbenchTabs/tabContentLab';
import { buildPreviewViewMarkup } from '../src/ui/workbenchTabs/tabPreview';
import { buildVectorsViewMarkup } from '../src/ui/workbenchTabs/tabVectors';
import type { WorkbenchSnapshot, WorkbenchState, WorkbenchVectorSnapshot } from '../src/ui/workbenchTabs/shared';

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

function createState(): WorkbenchState {
    return {
        currentView: 'preview',
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
        vectorSourceKindFilter: 'all',
        vectorStatusFilter: 'all',
        vectorSchemaFilter: 'all',
        vectorActorFilter: 'all',
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
        contentLabUnknownTagDefaultKind: 'unknown',
        contentLabUnknownTagAllowHint: true,
        contentLabEnableRuleClassifier: true,
        contentLabEnableMetaKeywordDetection: true,
        contentLabEnableToolArtifactDetection: true,
        contentLabEnableAIClassifier: false,
        contentLabEditingRuleIndex: -1,
    };
}

function createSnapshot(): WorkbenchSnapshot {
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
        actorGraph: { nodes: [], links: [] },
        memoryGraph: { nodes: [], edges: [] },
        takeoverProgress: null,
        vectorSnapshot: createEmptyVectorSnapshot(),
        contentLabSnapshot: {
            loaded: false,
            tagRegistry: [],
            availableFloors: [],
        },
    };
}

describe('workbench lazy tab placeholders', (): void => {
    it('preview 未加载时显示懒加载提示', (): void => {
        const snapshot = createSnapshot();
        const state = createState();

        const markup = buildPreviewViewMarkup(snapshot, state);

        expect(markup).toContain('进入本页后将按需加载诊断快照与最近注入说明');
    });

    it('vectors 未加载时显示占位卡片', (): void => {
        const snapshot = createSnapshot();
        const state = createState();
        state.currentView = 'vectors';

        const markup = buildVectorsViewMarkup(snapshot, state);

        expect(markup).toContain('进入本页后将按需加载向量文档、索引和召回统计');
    });

    it('content-lab 未加载时显示占位卡片', (): void => {
        const snapshot = createSnapshot();
        const state = createState();
        state.currentView = 'content-lab';

        const markup = buildContentLabViewMarkup(snapshot, state);

        expect(markup).toContain('进入本页后将按需加载内容拆分规则与聊天楼层');
    });
});
