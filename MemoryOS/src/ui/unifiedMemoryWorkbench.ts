import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { logger, toast } from '../runtime/runtime-services';
import type { MemorySDKImpl } from '../sdk/memory-sdk';
import { readMemoryOSSettings } from '../settings/store';
import { escapeHtml } from './editorShared';
import { buildTakeoverPreviewMarkup } from './takeoverPreviewMarkup';
import { waitForUiPaint } from './uiAsync';
import type { UnifiedMemoryWorkbenchOpenOptions, UnifiedWorkbenchViewMode } from './unifiedMemoryWorkbenchTypes';
import { buildDreamViewMarkup } from './workbenchTabs/tabDream';
import { GraphService } from '../services/graph-service';
import type {
    ActorMemoryProfile,
    MemoryEntry,
    MemoryEntryType,
    MemoryRelationshipRecord,
    RoleEntryMemory,
} from '../types';
import unifiedMemoryWorkbenchCssText from './unifiedMemoryWorkbench.css?inline';
import { buildSharedBoxCheckboxStyles } from '../../../_Components/sharedBoxCheckbox';
import {
    type WorkbenchView,
    type ActorSubView,
    type WorkbenchState,
    type WorkbenchSnapshot,
    type WorkbenchActorGraph,
    type WorkbenchActorGraphLink,
    type WorkbenchGraphLinkType,
    escapeAttr,
    readInputValue,
    readCheckedValue,
    parseTagText,
    parseTypeFieldsJson,
    collectDetailPayload,
    mergeWorkbenchDetailPayload,
    createDraftEntry,
    resolveSelectedEntry,
    resolveSelectedType,
    resolveSelectedActor,
    buildDynamicFieldMarkup,
    isUserActorKey,
    toRecord,
    toStringArray,
    truncateText,
    formatTimestamp,
} from './workbenchTabs/shared';
import { buildEntriesViewMarkup } from './workbenchTabs/tabEntries';
import { buildTypesViewMarkup } from './workbenchTabs/tabTypes';
import { buildPreviewViewMarkup } from './workbenchTabs/tabPreview';
import { buildActorsViewMarkup } from './workbenchTabs/tabActors';
import { buildWorldEntitiesViewMarkup } from './workbenchTabs/tabWorldEntities';
import { buildTakeoverViewMarkup } from './workbenchTabs/tabTakeover';
import { buildVectorsViewMarkup } from './workbenchTabs/tabVectors';
import { buildMemoryFilterViewMarkup } from './workbenchTabs/tabMemoryFilter';
import {
    formatDreamWorkbenchText,
    resolveDreamWorkbenchText,
    resolveTakeoverWorkbenchText,
    resolveUnifiedWorkbenchText,
} from './workbenchLocale';
import type { MemoryPromptTestBundle } from '../db/db';
import { buildTakeoverFallbackEstimate, parseTakeoverFormDraft } from './takeoverFormShared';
import {
    type MemoryFilterSettings,
    type MemoryFilterMode,
    type MemoryFilterRule,
    type MemoryFilterFloorRecord,
    DEFAULT_MEMORY_FILTER_SETTINGS,
    DEFAULT_MEMORY_FILTER_RULES,
} from '../memory-filter';
import { collectTakeoverSourceBundle, type MemoryTakeoverMessageSlice } from '../memory-takeover/takeover-source';
import { mountRelationshipGraph } from './workbenchTabs/actorTabs/relationshipGraph';
import {
    buildMemoryGraphPageMarkup,
    destroyMemoryGraphPage,
    mountMemoryGraphPage,
} from './workbenchPages/memoryGraphPage';
import { DreamUiStateService } from './dream-ui-state-service';
import { inspectMemoryDatabaseSnapshot } from '../db/database-snapshot-inspector';

const WORKBENCH_STYLE_ID = 'stx-memory-workbench-style';
const graphService = new GraphService();

/**
 * 功能：确保工作台样式只注入一次。
 * @returns 无返回值。
 */
function ensureWorkbenchStyle(): void {
    const existing = document.getElementById(WORKBENCH_STYLE_ID) as HTMLStyleElement | null;
    const nextStyleText = `
${buildSharedBoxCheckboxStyles('.stx-memory-workbench')}
${unifiedMemoryWorkbenchCssText}
    `.trim();
    if (existing) {
        if (existing.textContent !== nextStyleText) {
            existing.textContent = nextStyleText;
        }
        return;
    }
    const style = document.createElement('style');
    style.id = WORKBENCH_STYLE_ID;
    style.textContent = nextStyleText;
    document.head.appendChild(style);
}

/**
 * 功能：兼容旧入口视图名称。
 * @param initialView 打开时传入的旧视图。
 * @returns 工作台视图名。
 */
function resolveInitialWorkbenchView(initialView?: UnifiedWorkbenchViewMode): WorkbenchView {
    if (initialView === 'dream') {
        return 'dream';
    }
    if (initialView === 'takeover') {
        return 'takeover';
    }
    if (initialView === 'vectors') {
        return 'vectors';
    }
    if (initialView === 'memory-filter') {
        return 'memory-filter';
    }
    if (initialView === 'memory') {
        return 'actors';
    }
    if (initialView === 'diagnostics' || initialView === 'raw') {
        return 'preview';
    }
    if (initialView === 'world') {
        return 'entries';
    }
    return 'entries';
}

/**
 * 功能：读取当前聊天的 MemorySDK 实例。
 * @returns SDK 实例或空值。
 */
function getActiveMemorySdk(): MemorySDKImpl | null {
    const memory = (window as any)?.STX?.memory as MemorySDKImpl | null | undefined;
    return memory ?? null;
}

/**
 * 功能：读取最近一次记忆主链绑定状态。
 * @returns 绑定状态对象。
 */
function getMemoryBindingStatus(): { connected?: boolean; chatKey?: string; error?: string; updatedAt?: number } | null {
    const status = (window as any)?.STX?.memoryBindingStatus;
    if (!status || typeof status !== 'object') {
        return null;
    }
    return status as { connected?: boolean; chatKey?: string; error?: string; updatedAt?: number };
}


/**
 * 功能：构建工作台整体 HTML。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @returns 页面 HTML。
 */
function buildWorkbenchMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const typeMap = new Map(snapshot.entryTypes.map((item: MemoryEntryType): [string, MemoryEntryType] => [item.key, item]));
    const filteredEntries = snapshot.entries.filter((entry: MemoryEntry): boolean => {
        const query = state.entryQuery.toLowerCase();
        if (query) {
            const matched = [entry.title, entry.summary, entry.detail, entry.entryType, entry.category, ...(entry.tags ?? [])]
                .join(' ')
                .toLowerCase()
                .includes(query);
            if (!matched) return false;
        }
        const tf = state.entryTimeFilter;
        if (tf === 'story_explicit') return entry.timeContext?.mode === 'story_explicit';
        if (tf === 'story_inferred') return entry.timeContext?.mode === 'story_inferred';
        if (tf === 'sequence_fallback') return entry.timeContext?.mode === 'sequence_fallback';
        if (tf === 'no_time') return !entry.timeContext;
        return true;
    }).sort((a: MemoryEntry, b: MemoryEntry): number => {
        const so = state.entrySortOrder;
        if (so === 'updated-asc') return a.updatedAt - b.updatedAt;
        if (so === 'floor-desc') return (b.timeContext?.sequenceTime?.lastFloor ?? 0) - (a.timeContext?.sequenceTime?.lastFloor ?? 0);
        if (so === 'floor-asc') return (a.timeContext?.sequenceTime?.firstFloor ?? 0) - (b.timeContext?.sequenceTime?.firstFloor ?? 0);
        if (so === 'confidence-desc') return (b.timeContext?.confidence ?? 0) - (a.timeContext?.confidence ?? 0);
        return b.updatedAt - a.updatedAt;
    });
    const selectedEntry = resolveSelectedEntry(snapshot, state);
    const selectedEntryType = typeMap.get(selectedEntry?.entryType ?? '') ?? resolveSelectedType(snapshot, state);
    const entryDraft = selectedEntry ?? createDraftEntry(selectedEntryType);
    const selectedType = resolveSelectedType(snapshot, state);
    const selectedActor = resolveSelectedActor(snapshot, state);
    const selectedActorMemories = snapshot.roleMemories.filter((item: RoleEntryMemory): boolean => item.actorKey === selectedActor?.actorKey);
    const entryOptions = snapshot.entries.map((entry: MemoryEntry): string => {
        return `<option value="${escapeAttr(entry.entryId)}"${state.bindEntryId === entry.entryId ? ' selected' : ''}>${escapeHtml(entry.title)}</option>`;
    }).join('');
    const dynamicFields = buildDynamicFieldMarkup(selectedEntryType, entryDraft.detailPayload);

    return `
        <div class="stx-memory-workbench">
            <header class="stx-memory-workbench__header">
                <div class="stx-memory-workbench__brand">
                    <i class="fa-solid fa-microchip"></i> ${escapeHtml(resolveUnifiedWorkbenchText('workbench_brand'))}
                </div>
                <nav class="stx-memory-workbench__nav">
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'entries' ? ' is-active' : ''}" data-workbench-view="entries">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_entries'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'types' ? ' is-active' : ''}" data-workbench-view="types">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_types'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'actors' ? ' is-active' : ''}" data-workbench-view="actors">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_actors'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'world-entities' ? ' is-active' : ''}" data-workbench-view="world-entities">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_world_entities'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'preview' ? ' is-active' : ''}" data-workbench-view="preview">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_preview'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'dream' ? ' is-active' : ''}" data-workbench-view="dream">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_dream'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'vectors' ? ' is-active' : ''}" data-workbench-view="vectors">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_vectors'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'memory-graph' ? ' is-active' : ''}" data-workbench-view="memory-graph">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_memory_graph'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'takeover' ? ' is-active' : ''}" data-workbench-view="takeover">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_takeover'))}
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'memory-filter' ? ' is-active' : ''}" data-workbench-view="memory-filter">
                        ${escapeHtml(resolveUnifiedWorkbenchText('nav_memory_filter'))}
                    </button>
                </nav>
                <div class="stx-memory-workbench__stats">
                    <span title="${escapeAttr(resolveUnifiedWorkbenchText('stat_entries_title'))}">${escapeHtml(resolveUnifiedWorkbenchText('stat_entries'))} <strong>${snapshot.entries.length}</strong></span>
                    <span title="${escapeAttr(resolveUnifiedWorkbenchText('stat_types_title'))}">${escapeHtml(resolveUnifiedWorkbenchText('stat_types'))} <strong>${snapshot.entryTypes.length}</strong></span>
                    <span title="${escapeAttr(resolveUnifiedWorkbenchText('stat_bindings_title'))}">${escapeHtml(resolveUnifiedWorkbenchText('stat_bindings'))} <strong>${snapshot.roleMemories.length}</strong></span>
                </div>
            </header>
            <main class="stx-memory-workbench__main">
                ${buildEntriesViewMarkup(filteredEntries, snapshot, state, typeMap, entryDraft, selectedEntry, selectedEntryType, dynamicFields)}
                ${buildTypesViewMarkup(snapshot, state, selectedType)}
                ${buildActorsViewMarkup(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                ${buildWorldEntitiesViewMarkup(snapshot, state)}
                ${buildPreviewViewMarkup(snapshot, state)}
                <section class="stx-memory-workbench__view${state.currentView === 'dream' ? ' is-active' : ''}" data-view="dream"${state.currentView !== 'dream' ? ' hidden' : ''}>
                    ${buildDreamViewMarkup(snapshot, state)}
                </section>
                ${buildVectorsViewMarkup(snapshot, state)}
                <section class="stx-memory-workbench__view${state.currentView === 'memory-graph' ? ' is-active' : ''}" data-view="memory-graph"${state.currentView !== 'memory-graph' ? ' hidden' : ''}>
                    ${buildMemoryGraphPageMarkup(snapshot, state, {
                        selectedGraphNodeId: state.selectedGraphNodeId,
                        selectedGraphEdgeId: state.selectedGraphEdgeId,
                        memoryGraphQuery: state.memoryGraphQuery,
                        memoryGraphFilterType: state.memoryGraphFilterType,
                        graphMode: state.memoryGraphMode || 'semantic',
                    })}
                </section>
                ${buildTakeoverViewMarkup(snapshot, state)}
                ${buildMemoryFilterViewMarkup(snapshot, state)}
            </main>
        </div>
    `;
}

/**
 * 功能：打开统一记忆工作台。
 * @param options 打开参数。
 * @returns 无返回值。
 */
export function openUnifiedMemoryWorkbench(options: UnifiedMemoryWorkbenchOpenOptions = {}): void {
    ensureWorkbenchStyle();
    let cleanupWorkbench: (() => void) | null = null;
    let dialogClosed = false;
    openSharedDialog({
        id: 'stx-memory-unified-workbench',
        size: 'fullscreen',
        layout: 'bare',
        chrome: false,
        bodyHtml: '<div id="stx-memory-workbench-root"></div>',
        onMount: (instance: SharedDialogInstance): void => {
            void mountWorkbench(instance, options)
                .then((cleanup: () => void): void => {
                    if (dialogClosed) {
                        cleanup();
                        return;
                    }
                    cleanupWorkbench = cleanup;
                })
                .catch((error: unknown): void => {
                    logger.error('挂载 MemoryOS 工作台失败', error);
                    toast.error(`工作台加载失败：${String((error as Error)?.message ?? error)}`);
                });
        },
        onClose: (): void => {
            dialogClosed = true;
            cleanupWorkbench?.();
            cleanupWorkbench = null;
        },
    });
}

/**
 * 功能：挂载统一记忆工作台。
 * @param instance 对话框实例。
 * @param options 打开参数。
 * @returns 异步挂载结果。
 */
async function mountWorkbench(instance: SharedDialogInstance, options: UnifiedMemoryWorkbenchOpenOptions): Promise<() => void> {
    const memory = getActiveMemorySdk();
    const bindingStatus = getMemoryBindingStatus();
    const settings = readMemoryOSSettings();
    if (!memory) {
        const detail = String(bindingStatus?.error ?? '').trim();
        const chatKey = String(bindingStatus?.chatKey ?? '').trim();
        instance.content.innerHTML = `
            <div class="stx-memory-workbench__empty">
                当前未连接到记忆主链，无法打开工作台。
                ${chatKey ? `<div style="margin-top:8px;opacity:.75;">chatKey：${escapeHtml(chatKey)}</div>` : ''}
                ${detail ? `<div style="margin-top:8px;color:var(--mw-warn);">${escapeHtml(detail)}</div>` : ''}
            </div>
        `;
        return (): void => {
            destroyMemoryGraphPage();
        };
    }

    const root = instance.content.querySelector('#stx-memory-workbench-root') as HTMLElement | null;
    if (!root) {
        return (): void => {
            destroyMemoryGraphPage();
        };
    }

    const state: WorkbenchState = {
        currentView: resolveInitialWorkbenchView(options.initialView),
        currentActorTab: 'attributes',
        selectedEntryId: '',
        selectedTypeKey: '',
        selectedActorKey: '',
        entryQuery: '',
        previewQuery: '',
        previewTabLoaded: false,
        previewTabLoading: false,
        databaseSnapshotInspection: null,
        databaseSnapshotInspectionFileName: '',
        databaseSnapshotInspectionLoading: false,
        worldProfileTestInput: '',
        worldProfileTestRunning: false,
        worldProfileTestResult: null,
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
        takeoverRecentFloors: String(settings.takeoverDefaultRecentFloors),
        takeoverBatchSize: String(settings.takeoverDefaultBatchSize),
        takeoverUseActiveSnapshot: true,
        takeoverActiveSnapshotFloors: String(settings.takeoverDefaultRecentFloors),
        takeoverPreview: null,
        takeoverPreviewLoading: false,
        takeoverPreviewExpanded: false,
        takeoverProgressLoading: false,
        takeoverActionRunning: false,
        vectorQuery: '',
        vectorMode: settings.retrievalMode,
        vectorSourceKindFilter: 'all',
        vectorStatusFilter: 'all',
        vectorSchemaFilter: 'all',
        vectorActorFilter: 'all',
        vectorTextFilter: '',
        vectorSelectedDocId: '',
        vectorRightTab: 'detail',
        vectorEnableStrategyRoutingTest: settings.vectorEnableStrategyRouting,
        vectorEnableRerankTest: settings.vectorEnableRerank,
        vectorEnableLLMHubRerankTest: settings.vectorEnableLLMHubRerank,
        vectorEnableGraphExpansionTest: settings.retrievalEnableGraphExpansion,
        vectorTopKTest: String(settings.vectorTopK),
        vectorDeepWindowTest: String(settings.vectorDeepWindow),
        vectorFinalTopKTest: String(settings.vectorFinalTopK),
        vectorTabLoaded: false,
        vectorTabLoading: false,
        vectorTestRunning: false,
        vectorTestResult: null,
        vectorTestProgress: null,
        memoryFilterStartFloor: '',
        memoryFilterEndFloor: '',
        memoryFilterSelectedFloor: '',
        memoryFilterPreviewSourceMode: 'content',
        memoryFilterPreviewLoading: false,
        memoryFilterTabLoaded: false,
        memoryFilterTabLoading: false,
        memoryFilterBlocks: [],
        memoryFilterMemoryPreview: '',
        memoryFilterContextPreview: '',
        memoryFilterExcludedPreview: '',
        memoryFilterEnabled: DEFAULT_MEMORY_FILTER_SETTINGS.enabled,
        memoryFilterUnknownPolicy: DEFAULT_MEMORY_FILTER_SETTINGS.unknownPolicy,
        memoryFilterMode: 'xml',
        memoryFilterRules: DEFAULT_MEMORY_FILTER_RULES,
        memoryFilterSelectedRuleId: '',
        memoryFilterCleanupTrimWhitespace: DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.trimWhitespace,
        memoryFilterCleanupStripWrapper: DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.stripWrapper,
        memoryFilterCleanupDropEmptyBlocks: DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.dropEmptyBlocks,
        memoryFilterCleanupMinBlockLength: String(DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.minBlockLength),
        memoryFilterCleanupMaxBlockLength: String(DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.maxBlockLength),
        entryTimeFilter: 'all',
        entrySortOrder: 'updated-desc',
        dreamSubView: 'overview',
        dreamWorkbenchTab: 'session',
    };
    let takeoverPreviewSequence = 0;
    let takeoverProgressCache: WorkbenchSnapshot['takeoverProgress'] = null;
    let takeoverProgressSequence = 0;
    let takeoverProgressPollTimer: number | null = null;
    let previewLoadSequence = 0;
    let previewCache: WorkbenchSnapshot['preview'] = null;
    let previewRecallExplanationCache: WorkbenchSnapshot['recallExplanation'] = null;
    let vectorLoadSequence = 0;
    let memoryFilterLoadSequence = 0;
    let memoryFilterSettingsCache: MemoryFilterSettings | null = null;
    let memoryFilterSourceMessages: MemoryTakeoverMessageSlice[] = [];
    let memoryFilterPreviewFloor: MemoryFilterFloorRecord | undefined = undefined;
    let disposed = false;

    /**
     * 功能：使诊断中心预览快照失效，确保下次进入时重新按当前链路生成。
     * @returns 无返回值。
     */
    const invalidatePreviewSnapshot = (): void => {
        previewLoadSequence += 1;
        previewCache = null;
        previewRecallExplanationCache = null;
        state.previewTabLoaded = false;
        state.previewTabLoading = false;
    };

    /**
     * 功能：构造空的向量快照，占位表示尚未加载。
     * @param loaded 是否已加载。
     * @returns 空向量快照。
     */
    const createEmptyVectorSnapshot = (loaded = false): WorkbenchSnapshot['vectorSnapshot'] => ({
        loaded,
        runtimeReady: false,
        embeddingAvailable: false,
        vectorStoreAvailable: false,
        retrievalMode: settings.retrievalMode,
        documentCount: 0,
        readyCount: 0,
        pendingCount: 0,
        failedCount: 0,
        indexCount: 0,
        recallStatCount: 0,
        documents: [],
        indexRecords: [],
        recallStats: [],
    });
    let vectorCache: WorkbenchSnapshot['vectorSnapshot'] = createEmptyVectorSnapshot(false);

    /**
     * 功能：使向量快照失效，确保清库后不再保留旧缓存。
     * @returns 无返回值。
     */
    const invalidateVectorSnapshot = (): void => {
        vectorLoadSequence += 1;
        vectorCache = createEmptyVectorSnapshot(false);
        state.vectorTabLoaded = false;
        state.vectorTabLoading = false;
        state.vectorSelectedDocId = '';
        state.vectorTestResult = null;
        state.vectorTestProgress = null;
    };

    /**
     * 功能：使记忆过滤器缓存失效，确保楼层源与预览按最新聊天重载。
     * @returns 无返回值。
     */
    const invalidateMemoryFilterSnapshot = (): void => {
        memoryFilterLoadSequence += 1;
        memoryFilterSourceMessages = [];
        memoryFilterPreviewFloor = undefined;
        state.memoryFilterTabLoaded = false;
        state.memoryFilterTabLoading = false;
        state.memoryFilterBlocks = [];
        state.memoryFilterMemoryPreview = '';
        state.memoryFilterContextPreview = '';
        state.memoryFilterExcludedPreview = '';
        state.memoryFilterSelectedRuleId = '';
    };

    const applyMemoryFilterSettingsToState = (memoryFilterSettings: MemoryFilterSettings): void => {
        state.memoryFilterEnabled = memoryFilterSettings.enabled;
        state.memoryFilterUnknownPolicy = memoryFilterSettings.unknownPolicy;
        state.memoryFilterMode = memoryFilterSettings.mode;
        state.memoryFilterRules = memoryFilterSettings.rules;
        state.memoryFilterCleanupTrimWhitespace = memoryFilterSettings.cleanup.trimWhitespace;
        state.memoryFilterCleanupStripWrapper = memoryFilterSettings.cleanup.stripWrapper;
        state.memoryFilterCleanupDropEmptyBlocks = memoryFilterSettings.cleanup.dropEmptyBlocks;
        state.memoryFilterCleanupMinBlockLength = String(memoryFilterSettings.cleanup.minBlockLength);
        state.memoryFilterCleanupMaxBlockLength = String(memoryFilterSettings.cleanup.maxBlockLength);
    };

    const buildMemoryFilterSnapshot = (): WorkbenchSnapshot['memoryFilterSnapshot'] => {
        const availableFloors = memoryFilterSourceMessages.map((msg) => ({
            floor: msg.floor,
            role: msg.role,
            charCount: msg.content.length,
        }));
        return {
            loaded: state.memoryFilterTabLoaded,
            settings: memoryFilterSettingsCache ?? undefined,
            availableFloors,
            previewFloor: memoryFilterPreviewFloor,
        };
    };

    /**
     * 功能：读取工作台核心快照。
     * @returns 工作台快照。
     */
    const loadCoreSnapshot = async (): Promise<WorkbenchSnapshot> => {
        if (disposed) {
            return {
                entryTypes: [],
                entries: [],
                actors: [],
                relationships: [],
                roleMemories: [],
                summaries: [],
                preview: previewCache,
                worldProfileBinding: null,
                mutationHistory: [],
                entryAuditRecords: [],
                recallExplanation: previewRecallExplanationCache,
                actorGraph: { nodes: [], links: [] },
                memoryGraph: graphService.buildMemoryGraphFromMemory({
                    entries: [],
                    relationships: [],
                    actors: [],
                    roleMemories: [],
                    summaries: [],
                }),
                takeoverProgress: takeoverProgressCache,
                vectorSnapshot: vectorCache,
                memoryFilterSnapshot: buildMemoryFilterSnapshot(),
                dreamSnapshot: {
                    sessions: [],
                    maintenanceProposals: [],
                    qualityReports: [],
                    schedulerState: null,
                    uiState: null,
                },
            };
        }
        const dreamUiStateService = new DreamUiStateService(memory.getChatKey());
        const [
            entryTypes,
            entries,
            actors,
            relationships,
            roleMemories,
            summaries,
            worldProfileBinding,
            mutationHistory,
            entryAuditRecords,
            takeoverProgress,
            dreamSessions,
            dreamMaintenanceProposals,
            dreamQualityReports,
            dreamSchedulerState,
            dreamUiState,
        ] = await Promise.all([
            memory.unifiedMemory.entryTypes.list(),
            memory.unifiedMemory.entries.list({ query: state.entryQuery }),
            memory.unifiedMemory.actors.list(),
            memory.unifiedMemory.relationships.list(),
            memory.unifiedMemory.roleMemory.list(),
            memory.unifiedMemory.summaries.list(8),
            memory.unifiedMemory.diagnostics.getWorldProfileBinding(),
            memory.unifiedMemory.diagnostics.listMutationHistory(16),
            memory.unifiedMemory.diagnostics.listEntryAuditRecords(24),
            takeoverProgressCache ? Promise.resolve(takeoverProgressCache) : memory.chatState.getTakeoverStatus(),
            memory.unifiedMemory.diagnostics.listDreamSessions(32),
            memory.unifiedMemory.diagnostics.listDreamMaintenanceProposals(32),
            memory.unifiedMemory.diagnostics.listDreamQualityReports(12),
            memory.unifiedMemory.diagnostics.getDreamSchedulerState(),
            dreamUiStateService.getSnapshot(),
        ]);

        takeoverProgressCache = takeoverProgress;

        return {
            entryTypes,
            entries,
            actors,
            relationships,
            roleMemories,
            summaries,
            preview: previewCache,
            worldProfileBinding,
            mutationHistory,
            entryAuditRecords,
            recallExplanation: previewRecallExplanationCache,
            actorGraph: buildActorGraph(actors, relationships, entries),
            memoryGraph: graphService.buildMemoryGraphFromMemory({
                entries,
                relationships,
                actors,
                roleMemories,
                summaries,
            }),
            takeoverProgress,
            vectorSnapshot: vectorCache,
            memoryFilterSnapshot: buildMemoryFilterSnapshot(),
            dreamSnapshot: {
                sessions: dreamSessions,
                maintenanceProposals: dreamMaintenanceProposals,
                qualityReports: dreamQualityReports,
                schedulerState: dreamSchedulerState,
                uiState: dreamUiState,
            },
        };
    };

    /**
     * 功能：保证当前选择始终有效。
     * @param snapshot 当前快照。
     * @returns 无返回值。
     */
    const normalizeSelection = (snapshot: WorkbenchSnapshot): void => {
        if (!state.selectedEntryId && snapshot.entries.length > 0) {
            state.selectedEntryId = snapshot.entries[0]!.entryId;
        }
        if (state.selectedEntryId && !snapshot.entries.some((entry: MemoryEntry): boolean => entry.entryId === state.selectedEntryId)) {
            state.selectedEntryId = snapshot.entries[0]?.entryId ?? '';
        }
        if (!state.selectedTypeKey && snapshot.entryTypes.length > 0) {
            state.selectedTypeKey = snapshot.entryTypes[0]!.key;
        }
        if (state.selectedTypeKey && !snapshot.entryTypes.some((item: MemoryEntryType): boolean => item.key === state.selectedTypeKey)) {
            state.selectedTypeKey = snapshot.entryTypes[0]?.key ?? '';
        }
        if (!state.selectedActorKey && snapshot.actors.length > 0) {
            state.selectedActorKey = snapshot.actors[0]!.actorKey;
        }
        if (state.selectedActorKey && !snapshot.actors.some((item: ActorMemoryProfile): boolean => item.actorKey === state.selectedActorKey)) {
            state.selectedActorKey = snapshot.actors[0]?.actorKey ?? '';
        }
        if (!state.bindEntryId && snapshot.entries.length > 0) {
            state.bindEntryId = snapshot.entries[0]!.entryId;
        }
        if (state.bindEntryId && !snapshot.entries.some((entry: MemoryEntry): boolean => entry.entryId === state.bindEntryId)) {
            state.bindEntryId = snapshot.entries[0]?.entryId ?? '';
        }
        if (snapshot.vectorSnapshot.loaded && !state.vectorSelectedDocId && snapshot.vectorSnapshot.documents.length > 0) {
            state.vectorSelectedDocId = snapshot.vectorSnapshot.documents[0]!.vectorDocId;
        }
        if (snapshot.vectorSnapshot.loaded && state.vectorSelectedDocId && !snapshot.vectorSnapshot.documents.some((doc): boolean => doc.vectorDocId === state.vectorSelectedDocId)) {
            state.vectorSelectedDocId = snapshot.vectorSnapshot.documents[0]?.vectorDocId ?? '';
        }
    };

    const persistMemoryFilterSettings = async (
        root: HTMLElement,
    ): Promise<MemoryFilterSettings> => {
        if (!memoryFilterSettingsCache) {
            memoryFilterSettingsCache = await memory.chatState.getMemoryFilterSettings();
            applyMemoryFilterSettingsToState(memoryFilterSettingsCache);
        }
        const nextRules = collectMemoryFilterRules(root, memoryFilterSettingsCache.rules);
        const saved = await memory.chatState.saveMemoryFilterSettings({
            enabled: readCheckedValue(root, '#stx-memory-filter-enabled'),
            mode: normalizeMemoryFilterMode(readInputValue(root, '#stx-memory-filter-mode')),
            rules: nextRules,
            cleanup: {
                trimWhitespace: true,
                stripWrapper: readCheckedValue(root, '#stx-memory-filter-cleanup-strip-wrapper'),
                dropEmptyBlocks: readCheckedValue(root, '#stx-memory-filter-cleanup-drop-empty'),
                minBlockLength: Math.max(0, Math.trunc(Number(readInputValue(root, '#stx-memory-filter-min-length')) || 0)),
                maxBlockLength: Math.max(0, Math.trunc(Number(readInputValue(root, '#stx-memory-filter-max-length')) || DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.maxBlockLength)),
            },
            unknownPolicy: normalizeMemoryFilterChannel(readInputValue(root, '#stx-memory-filter-unknown-policy')),
            scope: {
                summary: readCheckedValue(root, '#stx-memory-filter-scope-summary'),
                takeover: readCheckedValue(root, '#stx-memory-filter-scope-takeover'),
                dreamRecall: readCheckedValue(root, '#stx-memory-filter-scope-dreamRecall'),
                vectorIndex: readCheckedValue(root, '#stx-memory-filter-scope-vectorIndex'),
                promptInjection: readCheckedValue(root, '#stx-memory-filter-scope-promptInjection'),
            },
        });
        memoryFilterSettingsCache = saved;
        applyMemoryFilterSettingsToState(saved);
        state.memoryFilterTabLoaded = true;
        return saved;
    };

    const collectMemoryFilterRules = (root: HTMLElement, fallbackRules: MemoryFilterRule[]): MemoryFilterRule[] => {
        const existingById = new Map(fallbackRules.map((rule: MemoryFilterRule): [string, MemoryFilterRule] => [rule.id, rule]));
        const visibleRules: MemoryFilterRule[] = [];
        root.querySelectorAll<HTMLElement>('[data-content-split-rule]').forEach((row: HTMLElement, index: number): void => {
            const id = String(row.dataset.ruleId ?? `rule-${index + 1}`).trim();
            const existing = existingById.get(id);
            const mode = normalizeMemoryFilterMode(row.dataset.ruleMode ?? existing?.mode ?? state.memoryFilterMode);
            const name = readInputValue(row, '[data-rule-field="name"]') || readInputValue(row, '[data-rule-field="label"]') || existing?.name || `规则 ${index + 1}`;
            const channelValue = readInputValue(row, '[data-rule-field="channel"]');
            const channel = channelValue === 'context' || channelValue === 'hint'
                ? 'context'
                : channelValue === 'excluded' ? 'excluded' : 'memory';
            const priority = Math.trunc(Number(readInputValue(row, '[data-rule-field="priority"]')) || existing?.priority || 0);
            const rule: MemoryFilterRule = {
                ...(existing ?? {
                    id,
                    mode,
                    enabled: true,
                    channel,
                    priority,
                    name,
                }),
                id,
                mode,
                name,
                enabled: readCheckedValue(row, '[data-rule-field="enabled"]'),
                channel,
                priority,
            };
            if (mode === 'xml') {
                rule.tagName = readInputValue(row, '[data-rule-field="tagName"]') || existing?.tagName || name;
                rule.aliases = parseTagText(readInputValue(row, '[data-rule-field="aliases"]'));
                rule.pattern = readInputValue(row, '[data-rule-field="pattern"]') || undefined;
                rule.patternMode = readInputValue(row, '[data-rule-field="patternMode"]') === 'regex' || readInputValue(row, '[data-rule-field="patternMode"]') === 'prefix'
                    ? readInputValue(row, '[data-rule-field="patternMode"]') as MemoryFilterRule['patternMode']
                    : undefined;
            } else if (mode === 'delimiter') {
                rule.delimiters = parseTagText(readInputValue(row, '[data-rule-field="delimiters"]'));
                rule.keepDelimiter = readCheckedValue(row, '[data-rule-field="keepDelimiter"]');
            } else if (mode === 'regex') {
                rule.regex = readInputValue(row, '[data-rule-field="regex"]') || undefined;
                rule.flags = readInputValue(row, '[data-rule-field="flags"]') || 'g';
                rule.captureGroup = Math.max(0, Math.trunc(Number(readInputValue(row, '[data-rule-field="captureGroup"]')) || 0));
            } else if (mode === 'markdown') {
                const strategy = readInputValue(row, '[data-rule-field="markdownStrategy"]');
                rule.markdownStrategy = strategy === 'heading' || strategy === 'hr' ? strategy : 'heading_or_hr';
            } else if (mode === 'json') {
                rule.jsonPath = readInputValue(row, '[data-rule-field="jsonPath"]') || '$';
            }
            visibleRules.push(rule);
        });
        if (visibleRules.length === 0) {
            return fallbackRules;
        }
        const visibleIds = new Set(visibleRules.map((rule: MemoryFilterRule): string => rule.id));
        const visibleModes = new Set(visibleRules.map((rule: MemoryFilterRule): MemoryFilterMode => rule.mode));
        return [
            ...fallbackRules.filter((rule: MemoryFilterRule): boolean => !visibleIds.has(rule.id) && !visibleModes.has(rule.mode)),
            ...visibleRules,
        ];
    };

    /**
     * 功能：按当前模式创建一条记忆过滤规则。
     * @param mode 当前过滤模式。
     * @param channel 规则归类通道。
     * @param name 规则名称。
     * @returns 新规则。
     */
    const createMemoryFilterRuleDraft = (
        mode: MemoryFilterMode,
        channel: 'memory' | 'context' | 'excluded',
        name: string,
    ): MemoryFilterRule => {
        const safeName = String(name ?? '').trim() || '新规则';
        const now = Date.now().toString(36);
        const safeToken = safeName.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'rule';
        const baseRule: MemoryFilterRule = {
            id: `custom-${mode}-${channel}-${safeToken}-${now}`,
            name: safeName,
            mode,
            enabled: true,
            channel,
            priority: channel === 'excluded' ? 100 : channel === 'memory' ? 80 : 60,
        };
        if (mode === 'xml') {
            return { ...baseRule, tagName: safeName, aliases: [] };
        }
        if (mode === 'delimiter') {
            return { ...baseRule, delimiters: [safeName], keepDelimiter: false };
        }
        if (mode === 'regex') {
            return { ...baseRule, regex: safeName, flags: 'g', captureGroup: 0 };
        }
        if (mode === 'markdown') {
            return { ...baseRule, markdownStrategy: 'heading_or_hr' };
        }
        return { ...baseRule, jsonPath: '$' };
    };

    /**
     * 功能：保存过滤规则列表并刷新当前预览。
     * @param nextRules 下一组规则。
     * @returns 无返回值。
     */
    const saveMemoryFilterRulesAndRefresh = async (nextRules: MemoryFilterRule[]): Promise<void> => {
        if (!memoryFilterSettingsCache) {
            memoryFilterSettingsCache = await memory.chatState.getMemoryFilterSettings();
        }
        memoryFilterSettingsCache = await memory.chatState.saveMemoryFilterSettings({
            ...memoryFilterSettingsCache,
            mode: normalizeMemoryFilterMode(state.memoryFilterMode),
            rules: nextRules,
        });
        applyMemoryFilterSettingsToState(memoryFilterSettingsCache);
        await render();
    };

    /**
     * 功能：收集当前界面规则，并与缓存规则合并。
     * @returns 合并后的规则列表。
     */
    const collectCurrentMemoryFilterRules = (): MemoryFilterRule[] => {
        const fallbackRules = memoryFilterSettingsCache?.rules ?? state.memoryFilterRules;
        return collectMemoryFilterRules(root, fallbackRules);
    };

    const normalizeMemoryFilterMode = (value: unknown): MemoryFilterMode => {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (normalized === 'delimiter' || normalized === 'regex' || normalized === 'markdown' || normalized === 'json') {
            return normalized;
        }
        return 'xml';
    };

    const normalizeMemoryFilterChannel = (value: unknown): 'memory' | 'context' | 'excluded' => {
        const normalized = String(value ?? '').trim();
        if (normalized === 'context' || normalized === 'excluded') {
            return normalized;
        }
        return 'memory';
    };

    const applyMemoryFilterPreviewRecords = (records: MemoryFilterFloorRecord[]): void => {
        memoryFilterPreviewFloor = records.find((record) => record.floor === Number(state.memoryFilterSelectedFloor)) ?? records[0];
        state.memoryFilterBlocks = records.flatMap((record) => record.blocks);
        state.memoryFilterMemoryPreview = records
            .flatMap((record) => record.blocks.filter((block) => block.channel === 'memory').map((block) => block.rawText))
            .filter(Boolean)
            .join('\n\n');
        state.memoryFilterContextPreview = records
            .flatMap((record) => record.blocks.filter((block) => block.channel === 'context').map((block) => block.rawText))
            .filter(Boolean)
            .join('\n\n');
        state.memoryFilterExcludedPreview = records
            .flatMap((record) => record.blocks.filter((block) => block.channel === 'excluded').map((block) => `[Floor ${record.floor}][${block.title}] ${block.rawText}`))
            .filter(Boolean)
            .join('\n');
    };

    /**
     * 功能：保存规则后按当前楼层或范围实时刷新记忆过滤预览。
     */
    const refreshMemoryFilterPreviewFromCurrentForm = async (snapshot: WorkbenchSnapshot): Promise<boolean> => {
        const previewSourceMode = readInputValue(root, '#stx-memory-filter-preview-source-mode') === 'raw_visible_text'
            ? 'raw_visible_text'
            : 'content';
        const selectedFloor = Number(readInputValue(root, '#stx-memory-filter-selected-floor') || state.memoryFilterSelectedFloor);
        const startFloor = Number(readInputValue(root, '#stx-memory-filter-start-floor') || state.memoryFilterStartFloor);
        const endFloor = Number(readInputValue(root, '#stx-memory-filter-end-floor') || state.memoryFilterEndFloor);
        await loadMemoryFilterSnapshot();
        await persistMemoryFilterSettings(root);
        if (startFloor && endFloor && endFloor >= startFloor) {
            state.memoryFilterStartFloor = String(startFloor);
            state.memoryFilterEndFloor = String(endFloor);
            const records = await memory.chatState.previewFloorRangeMemoryFilter({
                startFloor,
                endFloor,
                previewSourceMode,
                forceEnabled: true,
            });
            applyMemoryFilterPreviewRecords(records);
            return true;
        }
        if (selectedFloor) {
            state.memoryFilterSelectedFloor = String(selectedFloor);
            const record = await memory.chatState.previewFloorMemoryFilter({
                floor: selectedFloor,
                previewSourceMode,
                forceEnabled: true,
            });
            applyMemoryFilterPreviewRecords([record]);
            return true;
        }
        return false;
    };

    /**
     * 功能：读取导出的数据库 JSON，生成检查报告并自动导入当前聊天。
     * @param file 用户选择的 JSON 文件。
     * @returns 异步完成。
     */
    const inspectDatabaseSnapshotFile = async (file: File): Promise<void> => {
        state.databaseSnapshotInspectionFileName = file.name;
        state.databaseSnapshotInspectionLoading = true;
        await render();
        try {
            const text = await readFileAsUtf8Text(file);
            const parsed = JSON.parse(text) as unknown;
            const report = inspectMemoryDatabaseSnapshot(parsed);
            if (!report.database) {
                throw new Error('未识别到可导入的 MemoryOS 数据库快照。');
            }
            const bundle = buildPromptTestBundleFromDatabaseInspection(report);
            await memory.chatState.importPromptTestBundleForTest(bundle, {
                targetChatKey: memory.getChatKey(),
                skipClear: false,
            });
            state.databaseSnapshotInspection = report;
            invalidatePreviewSnapshot();
            invalidateVectorSnapshot();
            state.selectedEntryId = '';
            state.selectedTypeKey = '';
            state.selectedActorKey = '';
            state.bindEntryId = '';
            if (report.valid) {
                toast.success('导出数据库已读取并保存到当前聊天。');
            } else {
                toast.warning('导出数据库已保存到当前聊天，但存在缺失字段或格式问题。');
            }
            if (state.currentView === 'vectors') {
                await refreshVectorSnapshot();
            }
        } catch (error) {
            logger.warn('读取导出的数据库失败', error);
            state.databaseSnapshotInspection = null;
            toast.error(`读取导出的数据库失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            state.databaseSnapshotInspectionLoading = false;
            await render();
        }
    };

    /**
     * 功能：处理工作台动作。
     * @param action 动作名。
     * @param snapshot 当前快照。
     * @param button 触发按钮。
     * @returns 异步处理结果。
     */
    const handleAction = async (action: string, snapshot: WorkbenchSnapshot, button: HTMLElement): Promise<void> => {
        try {
            if (action === 'create-entry') {
                const fallbackType = snapshot.entryTypes.find((item: MemoryEntryType): boolean => item.key === 'other') ?? snapshot.entryTypes[0];
                state.selectedEntryId = '';
                state.selectedTypeKey = fallbackType?.key ?? state.selectedTypeKey;
                await render();
                return;
            }
            if (action === 'save-entry') {
                const entryTypeKey = readInputValue(root, '#stx-memory-entry-type') || state.selectedTypeKey || 'other';
                const type = snapshot.entryTypes.find((item: MemoryEntryType): boolean => item.key === entryTypeKey);
                const existingEntry = snapshot.entries.find((entry: MemoryEntry): boolean => entry.entryId === String(button.dataset.entryId ?? '').trim());
                const saved = await memory.unifiedMemory.entries.save({
                    entryId: String(button.dataset.entryId ?? '').trim() || undefined,
                    title: readInputValue(root, '#stx-memory-entry-title'),
                    entryType: entryTypeKey,
                    category: readInputValue(root, '#stx-memory-entry-category') || type?.category || '其他',
                    tags: parseTagText(readInputValue(root, '#stx-memory-entry-tags')),
                    summary: readInputValue(root, '#stx-memory-entry-summary'),
                    detail: readInputValue(root, '#stx-memory-entry-detail'),
                    detailPayload: mergeWorkbenchDetailPayload(existingEntry?.detailPayload, collectDetailPayload(root)),
                });
                state.selectedEntryId = saved.entryId;
                toast.success('条目已保存。');
                await render();
                return;
            }
            if (action === 'delete-entry') {
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!entryId) {
                    return;
                }
                await memory.unifiedMemory.entries.remove(entryId);
                state.selectedEntryId = '';
                toast.success('条目已删除。');
                await render();
                return;
            }
            if (action === 'create-type') {
                state.selectedTypeKey = '';
                await render();
                return;
            }
            if (action === 'save-type') {
                const savedType = await memory.unifiedMemory.entryTypes.save({
                    key: readInputValue(root, '#stx-memory-type-key'),
                    label: readInputValue(root, '#stx-memory-type-label'),
                    category: readInputValue(root, '#stx-memory-type-category') as MemoryEntryType['category'],
                    description: readInputValue(root, '#stx-memory-type-description'),
                    icon: readInputValue(root, '#stx-memory-type-icon'),
                    accentColor: readInputValue(root, '#stx-memory-type-color'),
                    injectToSystem: readCheckedValue(root, '#stx-memory-type-system'),
                    bindableToRole: readCheckedValue(root, '#stx-memory-type-bindable'),
                    fields: parseTypeFieldsJson(readInputValue(root, '#stx-memory-type-fields')),
                });
                state.selectedTypeKey = savedType.key;
                toast.success('类型已保存。');
                await render();
                return;
            }
            if (action === 'delete-type') {
                const typeKey = String(button.dataset.typeKey ?? '').trim();
                if (!typeKey) {
                    return;
                }
                await memory.unifiedMemory.entryTypes.remove(typeKey);
                state.selectedTypeKey = '';
                toast.success('类型已删除。');
                await render();
                return;
            }
            if (action === 'create-actor') {
                state.selectedActorKey = '';
                state.currentActorTab = 'attributes';
                await render();
                return;
            }
            if (action === 'save-actor') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key');
                const displayName = readInputValue(root, '#stx-memory-actor-label');
                const isUserActor = isUserActorKey(actorKey);
                const memoryStat = Number(readInputValue(root, '#stx-memory-actor-stat') || 60);
                const actor = await memory.unifiedMemory.actors.ensure(
                    isUserActor
                        ? { actorKey, displayName }
                        : { actorKey, displayName, memoryStat },
                );
                if (!isUserActor) {
                    await memory.unifiedMemory.actors.setMemoryStat(actor.actorKey, memoryStat);
                }
                state.selectedActorKey = actor.actorKey;
                toast.success('角色资料已保存。');
                await render();
                return;
            }
            if (action === 'bind-entry') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key') || state.selectedActorKey;
                const entryId = String((root.querySelector('#stx-memory-bind-entry') as HTMLSelectElement | null)?.value ?? state.bindEntryId).trim();
                if (!actorKey || !entryId) {
                    toast.info('请先选择角色和条目。');
                    return;
                }
                await memory.unifiedMemory.roleMemory.bind(actorKey, entryId);
                toast.success('条目已绑定到角色。');
                await render();
                return;
            }
            if (action === 'unbind-entry') {
                const actorKey = state.selectedActorKey;
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!actorKey || !entryId) {
                    return;
                }
                await memory.unifiedMemory.roleMemory.unbind(actorKey, entryId);
                toast.success('角色绑定已解除。');
                await render();
                return;
            }
            if (action === 'refresh-preview') {
                state.previewQuery = readInputValue(root, '#stx-memory-preview-query');
                invalidatePreviewSnapshot();
                await render();
                void refreshPreviewSnapshot();
                return;
            }
            if (action === 'world-profile-apply') {
                const primaryProfile = readInputValue(root, '#stx-memory-world-profile-select');
                if (!primaryProfile) {
                    toast.info('请先选择一个世界画像。');
                    return;
                }
                await memory.unifiedMemory.diagnostics.setWorldProfileBinding({
                    primaryProfile,
                });
                invalidatePreviewSnapshot();
                toast.success('当前聊天的世界画像已切换为手动覆盖。');
                await render();
                return;
            }
            if (action === 'world-profile-reset') {
                await memory.unifiedMemory.diagnostics.resetWorldProfileBinding();
                invalidatePreviewSnapshot();
                toast.success('当前聊天的世界画像已恢复自动识别。');
                await render();
                return;
            }
            if (action === 'world-profile-test') {
                const testInput = readInputValue(root, '#stx-memory-world-profile-test-input');
                if (!testInput) {
                    toast.info('请先输入一段测试文本。');
                    return;
                }
                state.worldProfileTestInput = testInput;
                state.worldProfileTestRunning = true;
                await render();
                try {
                    const result = await memory.unifiedMemory.diagnostics.testWorldProfile({
                        text: testInput,
                    });
                    state.worldProfileTestResult = {
                        primaryProfile: result.detection.primaryProfile,
                        secondaryProfiles: result.detection.secondaryProfiles,
                        confidence: result.detection.confidence,
                        reasonCodes: result.detection.reasonCodes,
                        matchedKeywords: result.detection.matchedKeywords ?? [],
                        conflictKeywords: result.detection.conflictKeywords ?? [],
                        sourceTypes: result.detection.sourceTypes ?? [],
                        mixedProfileCandidate: result.detection.mixedProfileCandidate,
                        preferredSchemas: result.explanation.preferredSchemas,
                        preferredFacets: result.explanation.preferredFacets,
                        suppressedTypes: result.explanation.suppressedTypes,
                        fieldExtensions: result.explanation.fieldExtensions,
                    };
                    toast.success('世界画像测试完成。');
                } catch (error) {
                    logger.warn('世界画像测试失败', error);
                    toast.error(`世界画像测试失败：${String((error as Error)?.message ?? error)}`);
                } finally {
                    state.worldProfileTestRunning = false;
                    await render();
                }
                return;
            }
            if (action === 'capture-summary') {
                await memory.postGeneration.scheduleRoundProcessing('unified_memory_workbench', { force: true });
                invalidatePreviewSnapshot();
                toast.success('已触发强制快照归档。');
                await render();
                return;
            }
            if (action === 'set-dream-subview') {
                state.dreamSubView = String(button.dataset.subview || 'overview') as WorkbenchState['dreamSubView'];
                const targetTab = String(button.dataset.dreamTargetTab || '').trim();
                if (targetTab) {
                    state.dreamWorkbenchTab = targetTab as WorkbenchState['dreamWorkbenchTab'];
                }
                await render();
                return;
            }
            if (action === 'set-dream-workbench-tab') {
                state.dreamWorkbenchTab = String(button.dataset.tab || 'session') as WorkbenchState['dreamWorkbenchTab'];
                await render();
                return;
            }
            if (action === 'dream-workbench-refresh') {
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-clear-all') {
                const confirmed = window.confirm(resolveDreamWorkbenchText('clear_all_dream_records_confirm'));
                if (!confirmed) {
                    return;
                }
                try {
                    const deletedCount = await memory.unifiedMemory.diagnostics.clearAllDreamRecords();
                    toast.success(formatDreamWorkbenchText('clear_all_dream_records_success', { count: deletedCount }));
                } catch (error) {
                    toast.error(formatDreamWorkbenchText('clear_all_dream_records_failed', {
                        reason: String((error as Error)?.message ?? error),
                    }));
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-manual-dream') {
                const result = await memory.chatState.startDreamSession('manual');
                if (!result.ok) {
                    toast.error(`手动 dream 启动失败：${String(result.errorMessage ?? result.reasonCode ?? 'unknown')}`);
                } else {
                    toast.success('手动 dream 启动成功。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-rollback') {
                const dreamId = String(button.dataset.dreamId || '').trim();
                if (!dreamId) return;
                const result = await memory.chatState.rollbackDreamSession(dreamId);
                if (!result.ok) {
                    toast.error(`回滚失败：${result.reasonCode || '未知原因'}`);
                } else {
                    toast.success('回滚成功。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-rollback-mutation') {
                const dreamId = String(button.dataset.dreamId || '').trim();
                const mutationId = String(button.dataset.mutationId || '').trim();
                if (!dreamId || !mutationId) return;
                const result = await memory.chatState.rollbackDreamMutation(dreamId, mutationId);
                if (!result.ok) {
                    toast.error(`变更回滚失败：${result.reasonCode || '未知原因'}`);
                } else {
                    toast.success('变更回滚成功。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-approve-maintenance') {
                const proposalId = String(button.dataset.proposalId || '').trim();
                if (!proposalId) return;
                const result = await memory.chatState.applyDreamMaintenanceProposal(proposalId);
                if (!result.ok) {
                    toast.error(`应用失败：${result.reasonCode || '未知原因'}`);
                } else {
                    toast.success('提案已应用。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'dream-workbench-reject-maintenance') {
                const proposalId = String(button.dataset.proposalId || '').trim();
                if (!proposalId) return;
                const result = await memory.chatState.rejectDreamMaintenanceProposal(proposalId);
                if (!result.ok) {
                    toast.error(`拒绝失败：${result.reasonCode || '未知原因'}`);
                } else {
                    toast.info('提案已拒绝。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'trigger-manual-dream') {
                const result = await memory.chatState.startDreamSession('manual');
                if (!result.ok) {
                    toast.error(`手动 dream 启动失败：${String(result.errorMessage ?? result.reasonCode ?? 'unknown')}`);
                    return;
                }
                if (result.status === 'approved') {
                    toast.success('手动 dream 已完成并写回。');
                } else if (result.status === 'deferred') {
                    toast.info('手动 dream 已生成，等待审批或后续处理。');
                } else if (result.status === 'rejected') {
                    toast.info('手动 dream 已完成，但本轮提案未被应用。');
                } else {
                    toast.success('手动 dream 已启动。');
                }
                await render();
                return;
            }
            if (action === 'dream-open-pending-review') {
                const dreamId = String(button.dataset.dreamId ?? '').trim();
                if (!dreamId) {
                    toast.info('缺少待审批梦境标识。');
                    return;
                }
                const session = await memory.unifiedMemory.diagnostics.getDreamSessionById(dreamId);
                if (!session?.meta || !session.output || !session.recall) {
                    toast.info('未找到该待审批梦境会话数据。');
                    return;
                }
                const { openDreamReviewDialog } = await import('./dream-review-dialog');
                const reviewResult = await openDreamReviewDialog({
                    meta: {
                        dreamId: session.meta.dreamId,
                        triggerReason: session.meta.triggerReason,
                        createdAt: session.meta.createdAt,
                    },
                    recall: session.recall,
                    output: session.output,
                    maintenanceProposals: session.maintenanceProposals,
                    diagnostics: session.diagnostics,
                    graphSnapshot: session.graphSnapshot,
                });
                const applyResult = await memory.chatState.reviewPendingDreamSession({
                    dreamId: session.meta.dreamId,
                    review: reviewResult,
                });
                if (!applyResult.ok) {
                    toast.error(`梦境审批应用失败：${applyResult.reasonCode || '未知原因'}`);
                } else if (applyResult.status === 'approved') {
                    toast.success('梦境提案已审批并写回。');
                } else if (applyResult.status === 'rejected') {
                    toast.info('已拒绝本轮梦境提案。');
                } else if (applyResult.status === 'deferred') {
                    toast.info('梦境提案仍保留为待审批。');
                }
                await loadCoreSnapshot();
                await render();
                return;
            }
            if (action === 'export-chat-database') {
                const databaseSnapshot = await memory.chatState.exportCurrentChatDatabaseSnapshotForTest();
                const fileName = buildChatDatabaseExportFileName(memory.getChatKey());
                downloadJsonFile(fileName, databaseSnapshot);
                toast.success('当前聊天记忆库已导出。');
                return;
            }
            if (action === 'select-database-snapshot') {
                const input = root.querySelector('#stx-memory-database-snapshot-file') as HTMLInputElement | null;
                input?.click();
                return;
            }
            if (action === 'clear-chat-database') {
                const confirmed = window.confirm('确定要删除当前聊天数据库吗？此操作会清空当前聊天的记忆条目、角色绑定、总结、世界画像和历史记录，且无法恢复。');
                if (!confirmed) {
                    return;
                }
                invalidatePreviewSnapshot();
                invalidateVectorSnapshot();
                await memory.chatState.clearCurrentChatData();
                state.selectedEntryId = '';
                state.selectedTypeKey = '';
                state.selectedActorKey = '';
                state.bindEntryId = '';
                toast.success('当前聊天数据库已删除。');
                await render();
                return;
            }
            if (action === 'vector-refresh') {
                void refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-rebuild-documents') {
                const count = await memory.unifiedMemory.diagnostics.rebuildAllVectorDocuments();
                toast.success(`已重建 ${count} 条向量文档。`);
                await refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-rebuild-embeddings') {
                const count = await memory.unifiedMemory.diagnostics.rebuildAllEmbeddings();
                toast.success(`已重建 ${count} 条向量索引。`);
                await refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-clear-data') {
                const confirmed = window.confirm('确定要清空当前聊天的全部向量文档、向量索引和召回统计吗？此操作无法恢复。');
                if (!confirmed) {
                    return;
                }
                await memory.unifiedMemory.diagnostics.clearAllVectorData();
                state.vectorSelectedDocId = '';
                state.vectorTestResult = null;
                toast.success('当前聊天的向量数据已清空。');
                await refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-reindex-doc') {
                const vectorDocId = String(button.dataset.vectorDocId ?? '').trim();
                if (!vectorDocId) {
                    return;
                }
                await memory.unifiedMemory.diagnostics.reindexVectorDocument(vectorDocId);
                toast.success('已重新索引当前向量文档。');
                await refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-remove-doc') {
                const vectorDocId = String(button.dataset.vectorDocId ?? '').trim();
                if (!vectorDocId) {
                    return;
                }
                const confirmed = window.confirm('确定要删除当前向量文档及其索引吗？');
                if (!confirmed) {
                    return;
                }
                await memory.unifiedMemory.diagnostics.removeVectorDocument(vectorDocId);
                if (state.vectorSelectedDocId === vectorDocId) {
                    state.vectorSelectedDocId = '';
                }
                toast.success('当前向量文档已删除。');
                await refreshVectorSnapshot();
                return;
            }
            if (action === 'vector-run-test') {
                state.vectorQuery = readInputValue(root, '#stx-vector-query');
                state.vectorMode = readInputValue(root, '#stx-vector-mode') as WorkbenchState['vectorMode'];
                state.vectorTopKTest = readInputValue(root, '#stx-vector-topk');
                state.vectorDeepWindowTest = readInputValue(root, '#stx-vector-deep-window');
                state.vectorFinalTopKTest = readInputValue(root, '#stx-vector-final-topk');
                state.vectorEnableStrategyRoutingTest = readCheckedValue(root, '#stx-vector-enable-routing');
                state.vectorEnableRerankTest = readCheckedValue(root, '#stx-vector-enable-rerank');
                state.vectorEnableLLMHubRerankTest = readCheckedValue(root, '#stx-vector-enable-llmhub-rerank');
                state.vectorEnableGraphExpansionTest = readCheckedValue(root, '#stx-vector-enable-graph-expansion');
                state.vectorTestRunning = true;
                state.vectorTestProgress = {
                    stage: 'prepare',
                    title: '准备测试',
                    message: '正在读取输入参数并准备启动召回测试。',
                    progress: 0.02,
                };
                await render();
                try {
                    const result = await memory.unifiedMemory.diagnostics.testVectorRetrieval({
                        query: state.vectorQuery,
                        retrievalMode: state.vectorMode,
                        topK: Number(state.vectorTopKTest) || undefined,
                        deepWindow: Number(state.vectorDeepWindowTest) || undefined,
                        finalTopK: Number(state.vectorFinalTopKTest) || undefined,
                        enableStrategyRouting: state.vectorEnableStrategyRoutingTest,
                        enableRerank: state.vectorEnableRerankTest,
                        enableLLMHubRerank: state.vectorEnableLLMHubRerankTest,
                        enableGraphExpansion: state.vectorEnableGraphExpansionTest,
                        filters: {
                            schemaId: state.vectorSchemaFilter !== 'all' ? state.vectorSchemaFilter : undefined,
                            actorKey: state.vectorActorFilter !== 'all' ? state.vectorActorFilter : undefined,
                        },
                        onProgress: (progress): void => {
                            const nextTitle = String(progress.title ?? '').trim();
                            const nextMessage = String(progress.message ?? '').trim();
                            if (
                                state.vectorTestProgress
                                && state.vectorTestProgress.stage === progress.stage
                                && state.vectorTestProgress.title === nextTitle
                                && state.vectorTestProgress.message === nextMessage
                            ) {
                                return;
                            }
                            state.vectorTestProgress = {
                                stage: String(progress.stage ?? '').trim() || 'running',
                                title: nextTitle || '测试进行中',
                                message: nextMessage || '正在执行召回测试。',
                                progress: typeof progress.progress === 'number' ? progress.progress : undefined,
                            };
                            void render();
                        },
                    });
                    state.vectorTestResult = {
                        generatedAt: Date.now(),
                        query: state.vectorQuery,
                        retrievalMode: result.retrievalMode,
                        providerId: result.providerId,
                        diagnostics: result.diagnostics,
                        items: result.items,
                    };
                    state.vectorTestProgress = {
                        stage: 'completed',
                        title: '测试完成',
                        message: '召回测试已完成，结果与诊断已刷新。',
                        progress: 1,
                    };
                    toast.success('向量测试已完成。');
                } catch (error) {
                    state.vectorTestProgress = {
                        stage: 'failed',
                        title: '测试失败',
                        message: String((error as Error)?.message ?? error ?? '向量召回测试执行失败。').trim() || '向量召回测试执行失败。',
                    };
                    toast.error(state.vectorTestProgress.message);
                } finally {
                    state.vectorTestRunning = false;
                    await render();
                }
                return;
            }
            if (action === 'takeover-start') {
                const mode = readInputValue(root, '#stx-memory-takeover-mode') || 'full';
                const rawStart = readInputValue(root, '#stx-memory-takeover-range-start');
                const rawEnd = readInputValue(root, '#stx-memory-takeover-range-end');
                const rawRecentFloors = readInputValue(root, '#stx-memory-takeover-recent-floors');
                const rawBatchSize = readInputValue(root, '#stx-memory-takeover-batch-size');
                const rawActiveSnapshotFloors = readInputValue(root, '#stx-memory-takeover-active-snapshot-floors');
                const useActiveSnapshot = readCheckedValue(root, '#stx-memory-takeover-use-active-snapshot');
                state.takeoverMode = mode;
                state.takeoverRangeStart = rawStart;
                state.takeoverRangeEnd = rawEnd;
                state.takeoverRecentFloors = rawRecentFloors;
                state.takeoverBatchSize = rawBatchSize;
                state.takeoverUseActiveSnapshot = useActiveSnapshot;
                state.takeoverActiveSnapshotFloors = rawActiveSnapshotFloors;
                const parsed = parseTakeoverFormDraft({
                    mode: mode as 'full' | 'recent' | 'custom_range',
                    startFloor: rawStart,
                    endFloor: rawEnd,
                    recentFloors: rawRecentFloors,
                    batchSize: rawBatchSize,
                    useActiveSnapshot,
                    activeSnapshotFloors: rawActiveSnapshotFloors,
                });
                if (parsed.validationError) {
                    toast.error(parsed.validationError);
                    await render();
                    return;
                }
                runTakeoverActionInBackground(async (): Promise<void> => {
                    takeoverProgressCache = null;
                    const plannedProgress = await memory.chatState.createTakeoverPlan(parsed.config);
                    takeoverProgressCache = plannedProgress;
                    await refreshTakeoverProgress();
                    toast.info('旧聊天接管已开始，正在后台执行并刷新进度。');
                    const executionResult = await memory.chatState.startTakeover(plannedProgress.plan?.takeoverId);
                    takeoverProgressCache = executionResult.progress ?? null;
                    if (!executionResult.ok) {
                        toast.error(executionResult.errorMessage || `旧聊天接管启动失败：${executionResult.reasonCode}`);
                        return;
                    }
                    toastTakeoverExecutionResult(executionResult, {
                        completedText: '旧聊天接管本轮执行已完成。',
                        runningText: '旧聊天接管仍在后台收尾，请稍后刷新进度。',
                        blockedText: '旧聊天接管已执行到阻塞点，请根据提示继续处理。',
                    });
                });
                return;
            }
            if (action === 'takeover-preview-calc') {
                state.takeoverPreviewExpanded = true;
                await refreshTakeoverPreview();
                return;
            }
            if (action === 'takeover-pause') {
                takeoverProgressCache = await memory.chatState.pauseTakeover();
                toast.success('接管任务已暂停。');
                await render();
                return;
            }
            if (action === 'takeover-resume') {
                runTakeoverActionInBackground(async (): Promise<void> => {
                    toast.info('接管任务正在后台继续执行。');
                    const executionResult = await memory.chatState.resumeTakeover();
                    takeoverProgressCache = executionResult.progress ?? null;
                    if (!executionResult.ok) {
                        toast.error(executionResult.errorMessage || `接管任务继续失败：${executionResult.reasonCode}`);
                        return;
                    }
                    toastTakeoverExecutionResult(executionResult, {
                        completedText: '接管任务本轮继续执行已完成。',
                        runningText: '接管任务仍在后台继续执行，请稍后刷新进度。',
                        blockedText: '接管任务已继续到阻塞点，请根据提示继续处理。',
                    });
                });
                return;
            }
            if (action === 'takeover-consolidate') {
                runTakeoverActionInBackground(async (): Promise<void> => {
                    toast.info('接管整合正在后台执行。');
                    const executionResult = await memory.chatState.runTakeoverConsolidation();
                    takeoverProgressCache = executionResult.progress ?? null;
                    if (!executionResult.ok) {
                        toast.error(executionResult.errorMessage || `接管整合失败：${executionResult.reasonCode}`);
                        return;
                    }
                    toastTakeoverExecutionResult(executionResult, {
                        completedText: '接管整合已完成。',
                        runningText: '接管整合仍在后台收尾，请稍后刷新进度。',
                        blockedText: '接管整合已停在阻塞点，请根据提示继续处理。',
                    });
                });
                return;
            }
            if (action === 'takeover-abort') {
                takeoverProgressCache = await memory.chatState.abortTakeover();
                toast.success('接管任务已终止。');
                await render();
                return;
            }
            if (action === 'takeover-mark-handled') {
                const confirmed = window.confirm('确定将当前聊天标记为“旧聊天已处理”吗？标记后将不再自动弹出旧聊天接管提示。');
                if (!confirmed) {
                    return;
                }
                takeoverProgressCache = await memory.chatState.markTakeoverHandled();
                toast.success('当前聊天已标记为旧聊天已处理，后续不会再自动弹出接管提示。');
                await render();
                return;
            }
            if (action === 'memory-filter-add-rule') {
                await loadMemoryFilterSnapshot();
                const channelValue = String(button.dataset.channel ?? 'memory');
                const channel = channelValue === 'context' || channelValue === 'excluded' ? channelValue : 'memory';
                const mode = normalizeMemoryFilterMode(state.memoryFilterMode);
                const currentRules = collectCurrentMemoryFilterRules();
                const sameGroupCount = currentRules.filter((rule: MemoryFilterRule): boolean => rule.mode === mode && rule.channel === channel).length;
                const nextName = mode === 'json' ? '$' : `新规则 ${sameGroupCount + 1}`;
                const nextRule = createMemoryFilterRuleDraft(mode, channel, nextName);
                const nextRules = [...currentRules, nextRule];
                state.memoryFilterSelectedRuleId = nextRule.id;
                await saveMemoryFilterRulesAndRefresh(nextRules);
                toast.success('过滤规则已添加。');
                return;
            }
            if (action === 'memory-filter-select-rule') {
                state.memoryFilterSelectedRuleId = String(button.dataset.ruleId ?? '').trim();
                await render();
                return;
            }
            if (action === 'memory-filter-clear-rule-selection') {
                if (state.memoryFilterSelectedRuleId) {
                    state.memoryFilterSelectedRuleId = '';
                    await render();
                }
                return;
            }
            if (action === 'memory-filter-save-rule') {
                await loadMemoryFilterSnapshot();
                const ruleId = String(button.dataset.ruleId ?? '').trim();
                const editor = root.querySelector(`[data-edit-rule-id="${CSS.escape(ruleId)}"]`) as HTMLElement | null;
                if (!editor) {
                    toast.error('没有找到规则编辑区。');
                    return;
                }
                const currentRules = collectCurrentMemoryFilterRules();
                const targetRule = currentRules.find((rule: MemoryFilterRule): boolean => rule.id === ruleId);
                if (!targetRule) {
                    toast.error('没有找到这条规则。');
                    return;
                }
                const readEditValue = (field: string): string => readInputValue(editor, `[data-edit-rule-field="${field}"]`);
                const readEditChecked = (field: string): boolean => readCheckedValue(editor, `[data-edit-rule-field="${field}"]`);
                const nextName = readEditValue('name') || targetRule.name;
                const channelValue = readEditValue('channel');
                const nextChannel = channelValue === 'context' || channelValue === 'excluded' ? channelValue : 'memory';
                const nextRule: MemoryFilterRule = {
                    ...targetRule,
                    name: nextName,
                    enabled: readEditChecked('enabled'),
                    channel: nextChannel,
                    priority: Math.trunc(Number(readEditValue('priority')) || targetRule.priority || 0),
                };
                if (nextRule.mode === 'xml') {
                    nextRule.tagName = readEditValue('tagName') || nextName;
                    nextRule.aliases = parseTagText(readEditValue('aliases'));
                    nextRule.pattern = readEditValue('pattern') || undefined;
                    const patternMode = readEditValue('patternMode');
                    nextRule.patternMode = patternMode === 'prefix' || patternMode === 'regex' ? patternMode : undefined;
                } else if (nextRule.mode === 'delimiter') {
                    nextRule.delimiters = parseTagText(readEditValue('delimiters'));
                    nextRule.keepDelimiter = readEditChecked('keepDelimiter');
                } else if (nextRule.mode === 'regex') {
                    nextRule.regex = readEditValue('regex') || undefined;
                    nextRule.flags = readEditValue('flags') || 'g';
                    nextRule.captureGroup = Math.max(0, Math.trunc(Number(readEditValue('captureGroup')) || 0));
                } else if (nextRule.mode === 'markdown') {
                    const strategy = readEditValue('markdownStrategy');
                    nextRule.markdownStrategy = strategy === 'heading' || strategy === 'hr' ? strategy : 'heading_or_hr';
                } else if (nextRule.mode === 'json') {
                    nextRule.jsonPath = readEditValue('jsonPath') || '$';
                }
                const nextRules = currentRules.map((rule: MemoryFilterRule): MemoryFilterRule => (rule.id === ruleId ? nextRule : rule));
                state.memoryFilterSelectedRuleId = ruleId;
                await saveMemoryFilterRulesAndRefresh(nextRules);
                toast.success('过滤规则已保存。');
                return;
            }
            if (action === 'memory-filter-toggle-rule') {
                await loadMemoryFilterSnapshot();
                const ruleId = String(button.dataset.ruleId ?? '').trim();
                const currentRules = collectCurrentMemoryFilterRules();
                const targetRule = currentRules.find((rule: MemoryFilterRule): boolean => rule.id === ruleId);
                if (!targetRule) {
                    toast.error('没有找到这条规则。');
                    return;
                }
                const toggledRules = currentRules.map((rule: MemoryFilterRule): MemoryFilterRule => (
                    rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
                ));
                await saveMemoryFilterRulesAndRefresh(toggledRules);
                toast.success(targetRule.enabled ? '过滤规则已停用。' : '过滤规则已启用。');
                return;
            }
            if (action === 'memory-filter-delete-rule') {
                await loadMemoryFilterSnapshot();
                const ruleId = String(button.dataset.ruleId ?? '').trim();
                const currentRules = collectCurrentMemoryFilterRules();
                const nextRules = currentRules.filter((rule: MemoryFilterRule): boolean => rule.id !== ruleId);
                if (nextRules.length === currentRules.length) {
                    toast.error('没有找到这条规则。');
                    return;
                }
                if (state.memoryFilterSelectedRuleId === ruleId) {
                    state.memoryFilterSelectedRuleId = '';
                }
                await saveMemoryFilterRulesAndRefresh(nextRules);
                toast.success('过滤规则已删除。');
                return;
            }
            if (action === 'memory-filter-preview-floor') {
                const previewSourceMode = readInputValue(root, '#stx-memory-filter-preview-source-mode') === 'raw_visible_text'
                    ? 'raw_visible_text'
                    : 'content';
                const selectedFloor = Number(readInputValue(root, '#stx-memory-filter-selected-floor'));
                if (!selectedFloor || selectedFloor < 1) {
                    toast.error('请输入有效的楼层号。');
                    return;
                }
                state.memoryFilterPreviewLoading = true;
                state.memoryFilterSelectedFloor = String(selectedFloor);
                state.memoryFilterPreviewSourceMode = previewSourceMode;
                state.memoryFilterEnabled = readCheckedValue(root, '#stx-memory-filter-enabled');
                await render();
                try {
                    await loadMemoryFilterSnapshot();
                    if (!memoryFilterSourceMessages.some((m) => m.floor === selectedFloor)) {
                        toast.error(`未找到楼层 ${selectedFloor}，可用范围：${memoryFilterSourceMessages[0]?.floor ?? '?'} - ${memoryFilterSourceMessages[memoryFilterSourceMessages.length - 1]?.floor ?? '?'}`);
                        state.memoryFilterPreviewLoading = false;
                        await render();
                        return;
                    }
                    await persistMemoryFilterSettings(root);
                    const record = await memory.chatState.previewFloorMemoryFilter({
                        floor: selectedFloor,
                        previewSourceMode,
                        forceEnabled: true,
                    });
                    applyMemoryFilterPreviewRecords([record]);
                } finally {
                    state.memoryFilterPreviewLoading = false;
                    await render();
                }
                return;
            }
            if (action === 'memory-filter-refresh-preview') {
                state.memoryFilterPreviewLoading = true;
                await render();
                try {
                    const refreshed = await refreshMemoryFilterPreviewFromCurrentForm(snapshot);
                    if (!refreshed) {
                        toast.warning('请先输入预览楼层或楼层范围。');
                    }
                } finally {
                    state.memoryFilterPreviewLoading = false;
                    await render();
                }
                return;
            }
            if (action === 'memory-filter-preview-range') {
                const previewSourceMode = readInputValue(root, '#stx-memory-filter-preview-source-mode') === 'raw_visible_text'
                    ? 'raw_visible_text'
                    : 'content';
                const startFloor = Number(readInputValue(root, '#stx-memory-filter-start-floor'));
                const endFloor = Number(readInputValue(root, '#stx-memory-filter-end-floor'));
                if (!startFloor || !endFloor || startFloor < 1 || endFloor < startFloor) {
                    toast.error('请输入有效的楼层范围。');
                    return;
                }
                state.memoryFilterPreviewLoading = true;
                state.memoryFilterStartFloor = String(startFloor);
                state.memoryFilterEndFloor = String(endFloor);
                state.memoryFilterPreviewSourceMode = previewSourceMode;
                state.memoryFilterEnabled = readCheckedValue(root, '#stx-memory-filter-enabled');
                await render();
                try {
                    await loadMemoryFilterSnapshot();
                    await persistMemoryFilterSettings(root);
                    const records = await memory.chatState.previewFloorRangeMemoryFilter({
                        startFloor,
                        endFloor,
                        previewSourceMode,
                        forceEnabled: true,
                    });
                    applyMemoryFilterPreviewRecords(records);
                } finally {
                    state.memoryFilterPreviewLoading = false;
                    await render();
                }
                return;
            }
            if (action === 'memory-filter-set-mode') {
                const nextMode = normalizeMemoryFilterMode(button.dataset.mode);
                const nextRules = memoryFilterSettingsCache
                    ? collectMemoryFilterRules(root, memoryFilterSettingsCache.rules)
                    : state.memoryFilterRules;
                state.memoryFilterMode = nextMode;
                state.memoryFilterSelectedRuleId = '';
                state.memoryFilterPreviewLoading = Boolean(state.memoryFilterSelectedFloor || (state.memoryFilterStartFloor && state.memoryFilterEndFloor));
                await render();
                if (memoryFilterSettingsCache) {
                    memoryFilterSettingsCache = await memory.chatState.saveMemoryFilterSettings({
                        ...memoryFilterSettingsCache,
                        mode: nextMode,
                        rules: nextRules,
                    });
                    applyMemoryFilterSettingsToState(memoryFilterSettingsCache);
                }
                try {
                    const previewSourceMode = readInputValue(root, '#stx-memory-filter-preview-source-mode') === 'raw_visible_text'
                        ? 'raw_visible_text'
                        : 'content';
                    if (state.memoryFilterStartFloor && state.memoryFilterEndFloor) {
                        const startFloor = Math.max(1, Math.trunc(Number(state.memoryFilterStartFloor) || 1));
                        const endFloor = Math.max(startFloor, Math.trunc(Number(state.memoryFilterEndFloor) || startFloor));
                        const records = await memory.chatState.previewFloorRangeMemoryFilter({
                            startFloor,
                            endFloor,
                            previewSourceMode,
                            forceEnabled: true,
                        });
                        applyMemoryFilterPreviewRecords(records);
                    } else if (state.memoryFilterSelectedFloor) {
                        const selectedFloor = Math.max(1, Math.trunc(Number(state.memoryFilterSelectedFloor) || 1));
                        const record = await memory.chatState.previewFloorMemoryFilter({
                            floor: selectedFloor,
                            previewSourceMode,
                            forceEnabled: true,
                        });
                        applyMemoryFilterPreviewRecords([record]);
                    }
                } finally {
                    state.memoryFilterPreviewLoading = false;
                    await render();
                }
                return;
            }
        } catch (error) {
            logger.error(`工作台动作执行失败: ${action}`, error);
            toast.error(`操作失败：${String((error as Error)?.message ?? error)}`);
        }
    };

    /**
     * 功能：绑定工作台事件。
     * @param snapshot 当前快照。
     * @returns 无返回值。
     */
    const bindEvents = (snapshot: WorkbenchSnapshot): void => {
        root.querySelectorAll<HTMLElement>('[data-workbench-view]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                const nextView = String(button.dataset.workbenchView ?? 'entries') as WorkbenchView;
                state.currentView = nextView;
                void render().then((): void => {
                    void loadDeferredTabData(state.currentView);
                    if (state.currentView === 'takeover') {
                        void refreshTakeoverProgress();
                    }
                });
            });
        });

        root.querySelectorAll<HTMLElement>('[data-actor-tab]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.currentActorTab = String(button.dataset.actorTab ?? 'attributes') as ActorSubView;
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-entry]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedEntryId = String(button.dataset.selectEntry ?? '').trim();
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-type]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedTypeKey = String(button.dataset.selectType ?? '').trim();
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-actor]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedActorKey = String(button.dataset.selectActor ?? '').trim();
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-vector-doc]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.vectorSelectedDocId = String(button.dataset.selectVectorDoc ?? '').trim();
                void render();
            });
        });

        const entryQueryInput = root.querySelector('#stx-memory-entry-query') as HTMLInputElement | null;
        entryQueryInput?.addEventListener('input', (): void => {
            state.entryQuery = String(entryQueryInput.value ?? '').trim();
            void render();
        });

        const entryTimeFilterSelect = root.querySelector('#stx-memory-entry-time-filter') as HTMLSelectElement | null;
        entryTimeFilterSelect?.addEventListener('change', (): void => {
            state.entryTimeFilter = (entryTimeFilterSelect.value ?? 'all') as WorkbenchState['entryTimeFilter'];
            void render();
        });

        const entrySortOrderSelect = root.querySelector('#stx-memory-entry-sort-order') as HTMLSelectElement | null;
        entrySortOrderSelect?.addEventListener('change', (): void => {
            state.entrySortOrder = (entrySortOrderSelect.value ?? 'updated-desc') as WorkbenchState['entrySortOrder'];
            void render();
        });

        const previewQueryInput = root.querySelector('#stx-memory-preview-query') as HTMLInputElement | null;
        previewQueryInput?.addEventListener('input', (): void => {
            state.previewQuery = String(previewQueryInput.value ?? '').trim();
        });

        const databaseSnapshotFileInput = root.querySelector('#stx-memory-database-snapshot-file') as HTMLInputElement | null;
        databaseSnapshotFileInput?.addEventListener('change', (): void => {
            const file = databaseSnapshotFileInput.files?.[0] ?? null;
            databaseSnapshotFileInput.value = '';
            if (!file) {
                return;
            }
            void inspectDatabaseSnapshotFile(file);
        });

        const actorQueryInput = root.querySelector('#stx-memory-actor-query') as HTMLInputElement | null;
        actorQueryInput?.addEventListener('input', (): void => {
            state.actorQuery = String(actorQueryInput.value ?? '').trim();
            void render();
        });

        const actorSortSelect = root.querySelector('#stx-memory-actor-sort') as HTMLSelectElement | null;
        actorSortSelect?.addEventListener('change', (): void => {
            state.actorSortOrder = String(actorSortSelect.value ?? '') as WorkbenchState['actorSortOrder'];
            void render();
        });

        const actorTagSelect = root.querySelector('#stx-memory-actor-tag-filter') as HTMLSelectElement | null;
        actorTagSelect?.addEventListener('change', (): void => {
            state.actorTagFilter = String(actorTagSelect.value ?? '').trim();
            void render();
        });

        const bindEntrySelect = root.querySelector('#stx-memory-bind-entry') as HTMLSelectElement | null;
        bindEntrySelect?.addEventListener('change', (): void => {
            state.bindEntryId = String(bindEntrySelect.value ?? '').trim();
        });

        const vectorTextFilterInput = root.querySelector('#stx-vector-text-filter') as HTMLInputElement | null;
        vectorTextFilterInput?.addEventListener('input', (): void => {
            state.vectorTextFilter = String(vectorTextFilterInput.value ?? '').trim();
            void render();
        });

        const vectorSourceFilter = root.querySelector('#stx-vector-source-filter') as HTMLSelectElement | null;
        vectorSourceFilter?.addEventListener('change', (): void => {
            state.vectorSourceKindFilter = String(vectorSourceFilter.value ?? 'all').trim() || 'all';
            void render();
        });

        const vectorStatusFilter = root.querySelector('#stx-vector-status-filter') as HTMLSelectElement | null;
        vectorStatusFilter?.addEventListener('change', (): void => {
            state.vectorStatusFilter = String(vectorStatusFilter.value ?? 'all').trim() || 'all';
            void render();
        });

        const vectorSchemaFilter = root.querySelector('#stx-vector-schema-filter') as HTMLSelectElement | null;
        vectorSchemaFilter?.addEventListener('change', (): void => {
            state.vectorSchemaFilter = String(vectorSchemaFilter.value ?? 'all').trim() || 'all';
            void render();
        });

        const vectorActorFilter = root.querySelector('#stx-vector-actor-filter') as HTMLSelectElement | null;
        vectorActorFilter?.addEventListener('change', (): void => {
            state.vectorActorFilter = String(vectorActorFilter.value ?? 'all').trim() || 'all';
            void render();
        });

        const vectorQueryInput = root.querySelector('#stx-vector-query') as HTMLTextAreaElement | null;
        vectorQueryInput?.addEventListener('input', (): void => {
            state.vectorQuery = String(vectorQueryInput.value ?? '').trim();
        });

        const vectorModeSelect = root.querySelector('#stx-vector-mode') as HTMLSelectElement | null;
        vectorModeSelect?.addEventListener('change', (): void => {
            state.vectorMode = String(vectorModeSelect.value ?? 'hybrid') as WorkbenchState['vectorMode'];
        });

        const vectorTopKInput = root.querySelector('#stx-vector-topk') as HTMLInputElement | null;
        vectorTopKInput?.addEventListener('input', (): void => {
            state.vectorTopKTest = String(vectorTopKInput.value ?? '').trim();
        });

        const vectorDeepWindowInput = root.querySelector('#stx-vector-deep-window') as HTMLInputElement | null;
        vectorDeepWindowInput?.addEventListener('input', (): void => {
            state.vectorDeepWindowTest = String(vectorDeepWindowInput.value ?? '').trim();
        });

        const vectorFinalTopKInput = root.querySelector('#stx-vector-final-topk') as HTMLInputElement | null;
        vectorFinalTopKInput?.addEventListener('input', (): void => {
            state.vectorFinalTopKTest = String(vectorFinalTopKInput.value ?? '').trim();
        });

        const vectorRoutingSwitch = root.querySelector('#stx-vector-enable-routing') as HTMLInputElement | null;
        vectorRoutingSwitch?.addEventListener('change', (): void => {
            state.vectorEnableStrategyRoutingTest = vectorRoutingSwitch.checked === true;
        });

        const vectorRerankSwitch = root.querySelector('#stx-vector-enable-rerank') as HTMLInputElement | null;
        vectorRerankSwitch?.addEventListener('change', (): void => {
            state.vectorEnableRerankTest = vectorRerankSwitch.checked === true;
        });

        const vectorLLMHubSwitch = root.querySelector('#stx-vector-enable-llmhub-rerank') as HTMLInputElement | null;
        vectorLLMHubSwitch?.addEventListener('change', (): void => {
            state.vectorEnableLLMHubRerankTest = vectorLLMHubSwitch.checked === true;
        });

        const vectorGraphSwitch = root.querySelector('#stx-vector-enable-graph-expansion') as HTMLInputElement | null;
        vectorGraphSwitch?.addEventListener('change', (): void => {
            state.vectorEnableGraphExpansionTest = vectorGraphSwitch.checked === true;
        });

        root.querySelectorAll<HTMLElement>('[data-vector-right-tab]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                const nextTab = String(button.dataset.vectorRightTab ?? '').trim();
                if (nextTab === 'detail' || nextTab === 'test') {
                    state.vectorRightTab = nextTab;
                    void render();
                }
            });
        });

        const takeoverModeSelect = root.querySelector('#stx-memory-takeover-mode') as HTMLSelectElement | null;
        takeoverModeSelect?.addEventListener('change', (): void => {
            state.takeoverMode = String(takeoverModeSelect.value ?? 'full').trim();
            state.takeoverPreview = null;
            void render();
        });

        const takeoverRangeStartInput = root.querySelector('#stx-memory-takeover-range-start') as HTMLInputElement | null;
        takeoverRangeStartInput?.addEventListener('input', (): void => {
            state.takeoverRangeStart = String(takeoverRangeStartInput.value ?? '').trim();
            state.takeoverPreview = null;
            syncTakeoverPreviewUi();
        });

        const takeoverRangeEndInput = root.querySelector('#stx-memory-takeover-range-end') as HTMLInputElement | null;
        takeoverRangeEndInput?.addEventListener('input', (): void => {
            state.takeoverRangeEnd = String(takeoverRangeEndInput.value ?? '').trim();
            state.takeoverPreview = null;
            syncTakeoverPreviewUi();
        });

        const takeoverRecentFloorsInput = root.querySelector('#stx-memory-takeover-recent-floors') as HTMLInputElement | null;
        takeoverRecentFloorsInput?.addEventListener('input', (): void => {
            state.takeoverRecentFloors = String(takeoverRecentFloorsInput.value ?? '').trim();
            state.takeoverPreview = null;
            syncTakeoverPreviewUi();
        });

        const takeoverBatchSizeInput = root.querySelector('#stx-memory-takeover-batch-size') as HTMLInputElement | null;
        takeoverBatchSizeInput?.addEventListener('input', (): void => {
            state.takeoverBatchSize = String(takeoverBatchSizeInput.value ?? '').trim();
            state.takeoverPreview = null;
            syncTakeoverPreviewUi();
        });

        const takeoverUseActiveSnapshotInput = root.querySelector('#stx-memory-takeover-use-active-snapshot') as HTMLInputElement | null;
        takeoverUseActiveSnapshotInput?.addEventListener('change', (): void => {
            state.takeoverUseActiveSnapshot = takeoverUseActiveSnapshotInput.checked === true;
            state.takeoverPreview = null;
            void render();
        });

        const takeoverActiveSnapshotFloorsInput = root.querySelector('#stx-memory-takeover-active-snapshot-floors') as HTMLInputElement | null;
        takeoverActiveSnapshotFloorsInput?.addEventListener('input', (): void => {
            state.takeoverActiveSnapshotFloors = String(takeoverActiveSnapshotFloorsInput.value ?? '').trim();
            state.takeoverPreview = null;
            syncTakeoverPreviewUi();
        });

        const takeoverPreviewDetails = root.querySelector('#stx-memory-takeover-preview-panel')?.closest('details') as HTMLDetailsElement | null;
        takeoverPreviewDetails?.addEventListener('toggle', (): void => {
            state.takeoverPreviewExpanded = takeoverPreviewDetails.open;
        });

        root.querySelectorAll<HTMLElement>('[data-action]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                void handleAction(String(button.dataset.action ?? '').trim(), snapshot, button);
            });
        });

        const memoryFilterRulesPanel = root.querySelector('.stx-memory-filter__rules') as HTMLElement | null;
        memoryFilterRulesPanel?.addEventListener('click', (event: MouseEvent): void => {
            const target = event.target as HTMLElement | null;
            if (!target || target.closest('[data-content-split-rule], .stx-memory-filter__rule-editor, [data-action]')) {
                return;
            }
            if (!state.memoryFilterSelectedRuleId) {
                return;
            }
            state.memoryFilterSelectedRuleId = '';
            void render();
        });

        let memoryFilterRuleRefreshTimer: number | undefined;
        const scheduleMemoryFilterRuleRefresh = (): void => {
            window.clearTimeout(memoryFilterRuleRefreshTimer);
            memoryFilterRuleRefreshTimer = window.setTimeout((): void => {
                if (state.currentView !== 'memory-filter') return;
                state.memoryFilterPreviewLoading = true;
                void (async (): Promise<void> => {
                    try {
                        await refreshMemoryFilterPreviewFromCurrentForm(snapshot);
                    } catch (error) {
                        logger.warn('记忆过滤规则实时刷新失败', error);
                    } finally {
                        state.memoryFilterPreviewLoading = false;
                        await render();
                    }
                })();
            }, 260);
        };
        root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-rule-field], #stx-memory-filter-cleanup-trim, #stx-memory-filter-cleanup-strip-wrapper, #stx-memory-filter-cleanup-drop-empty, #stx-memory-filter-min-length, #stx-memory-filter-max-length')
            .forEach((element: HTMLInputElement | HTMLSelectElement): void => {
                const eventName = element instanceof HTMLInputElement && element.type !== 'checkbox' ? 'input' : 'change';
                element.addEventListener(eventName, scheduleMemoryFilterRuleRefresh);
            });
    };

    /**
     * 功能：同步工作台中的接管预估显示状态。
     * @returns 无返回值
     */
    const syncTakeoverPreviewUi = (): void => {
        const previewPanel = root.querySelector('#stx-memory-takeover-preview-panel') as HTMLElement | null;
        if (previewPanel) {
            previewPanel.innerHTML = buildTakeoverPreviewMarkup({
                estimate: state.takeoverPreview,
                loading: state.takeoverPreviewLoading,
            });
        }
        const startButton = root.querySelector('#stx-memory-takeover-start-button') as HTMLButtonElement | null;
        if (startButton) {
            startButton.disabled = state.takeoverPreviewLoading || state.takeoverActionRunning;
            startButton.innerHTML = state.takeoverActionRunning
                ? `<i class="fa-solid fa-play"></i> ${escapeHtml(resolveTakeoverWorkbenchText('takeover_running'))}`
                : `<i class="fa-solid fa-play"></i> ${escapeHtml(resolveTakeoverWorkbenchText('start_takeover'))}`;
        }
    };

    /**
     * 功能：停止接管进度轮询，避免重复刷新。
     * @returns 无返回值。
     */
    const stopTakeoverProgressPolling = (): void => {
        if (takeoverProgressPollTimer !== null) {
            window.clearInterval(takeoverProgressPollTimer);
            takeoverProgressPollTimer = null;
        }
    };

    /**
     * 功能：开始轮询接管进度，让后台任务执行时界面持续刷新。
     * @returns 无返回值。
     */
    const startTakeoverProgressPolling = (): void => {
        stopTakeoverProgressPolling();
        takeoverProgressPollTimer = window.setInterval((): void => {
            if (!state.takeoverActionRunning) {
                stopTakeoverProgressPolling();
                return;
            }
            void refreshTakeoverProgress();
        }, 1500);
    };

    /**
     * 功能：统一清理工作台后台任务与重型渲染器。
     * @returns 无返回值。
     */
    const cleanupWorkbench = (): void => {
        if (disposed) {
            return;
        }
        disposed = true;
        takeoverPreviewSequence += 1;
        takeoverProgressSequence += 1;
        vectorLoadSequence += 1;
        memoryFilterLoadSequence += 1;
        stopTakeoverProgressPolling();
        destroyMemoryGraphPage();
    };

    /**
     * 功能：在后台执行接管动作，避免工作台被长任务阻塞。
     * @param runner 实际执行逻辑。
     * @returns 无返回值。
     */
    const runTakeoverActionInBackground = (runner: () => Promise<void>): void => {
        if (disposed) {
            return;
        }
        if (state.takeoverActionRunning) {
            toast.info('旧聊天接管正在执行，请稍候。');
            return;
        }
        state.takeoverActionRunning = true;
        startTakeoverProgressPolling();
        void (async (): Promise<void> => {
            await render();
            try {
                if (disposed) {
                    return;
                }
                await runner();
            } catch (error) {
                logger.error('旧聊天接管后台执行失败', error);
                toast.error(`旧聊天接管失败：${String((error as Error)?.message ?? error)}`);
            } finally {
                state.takeoverActionRunning = false;
                stopTakeoverProgressPolling();
                if (!disposed) {
                    await refreshWorkbenchAfterTakeoverMutation();
                    await refreshTakeoverProgress();
                    await render();
                }
            }
        })();
    };

    /**
     * 功能：异步刷新诊断中心的提示词预览快照，避免阻塞切页。
     * @returns 无返回值。
     */
    const refreshPreviewSnapshot = async (): Promise<void> => {
        if (disposed) {
            return;
        }
        if (state.currentView !== 'preview') {
            state.previewTabLoading = false;
            return;
        }
        const currentSequence = ++previewLoadSequence;
        state.previewTabLoading = true;
        try {
            const [preview, recallExplanation] = await Promise.all([
                memory.unifiedMemory.prompts.preview({ query: state.previewQuery }),
                memory.chatState.getLatestRecallExplanation(),
            ]);
            if (disposed || currentSequence !== previewLoadSequence) {
                return;
            }
            previewCache = preview;
            previewRecallExplanationCache = normalizeRecallExplanation(recallExplanation);
            state.previewTabLoaded = true;
        } catch (error) {
            if (currentSequence !== previewLoadSequence) {
                return;
            }
            logger.error('加载诊断中心预览失败', error);
            toast.error(`诊断加载失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            if (currentSequence !== previewLoadSequence) {
                return;
            }
            state.previewTabLoading = false;
            if (!disposed && state.currentView === 'preview') {
                await render();
            }
        }
    };

    /**
     * 功能：异步刷新接管 token 预估，避免阻塞整个工作台渲染。
     * @returns 无返回值
     */
    const refreshTakeoverPreview = async (): Promise<void> => {
        if (disposed) {
            return;
        }
        if (state.currentView !== 'takeover') {
            state.takeoverPreviewLoading = false;
            return;
        }
        const currentSequence = ++takeoverPreviewSequence;
        const parsed = parseTakeoverFormDraft({
            mode: state.takeoverMode as 'full' | 'recent' | 'custom_range',
            startFloor: state.takeoverRangeStart,
            endFloor: state.takeoverRangeEnd,
            recentFloors: state.takeoverRecentFloors,
            batchSize: state.takeoverBatchSize,
            useActiveSnapshot: state.takeoverUseActiveSnapshot,
            activeSnapshotFloors: state.takeoverActiveSnapshotFloors,
        });
        if (parsed.validationError) {
            state.takeoverPreviewLoading = false;
            state.takeoverPreview = buildTakeoverFallbackEstimate({
                config: parsed.config,
                totalFloors: state.takeoverPreview?.totalFloors ?? 0,
                threshold: state.takeoverPreview?.threshold,
                validationError: parsed.validationError,
            });
            syncTakeoverPreviewUi();
            return;
        }
        state.takeoverPreviewLoading = true;
        syncTakeoverPreviewUi();
        await waitForUiPaint();
        try {
            const preview = await memory.chatState.previewTakeoverEstimate(parsed.config);
            if (currentSequence !== takeoverPreviewSequence) {
                return;
            }
            state.takeoverPreview = preview;
        } catch (error) {
            if (currentSequence !== takeoverPreviewSequence) {
                return;
            }
            state.takeoverPreview = buildTakeoverFallbackEstimate({
                config: parsed.config,
                totalFloors: state.takeoverPreview?.totalFloors ?? 0,
                threshold: state.takeoverPreview?.threshold,
                validationError: `Token 预估失败：${String((error as Error)?.message ?? error)}`,
            });
        } finally {
            if (currentSequence === takeoverPreviewSequence) {
                state.takeoverPreviewLoading = false;
                syncTakeoverPreviewUi();
            }
        }
    };

    /**
     * 功能：加载记忆过滤器配置与楼层消息。
     * @returns 异步完成。
     */
    const loadMemoryFilterSnapshot = async (): Promise<void> => {
        if (disposed) {
            return;
        }
        if (state.memoryFilterTabLoaded && memoryFilterSettingsCache && memoryFilterSourceMessages.length > 0) {
            return;
        }
        const currentSequence = ++memoryFilterLoadSequence;
        state.memoryFilterTabLoading = true;
        await render();
        await waitForUiPaint();
        try {
            const [memoryFilterSettings, bundle] = await Promise.all([
                memoryFilterSettingsCache ? Promise.resolve(memoryFilterSettingsCache) : memory.chatState.getMemoryFilterSettings(),
                Promise.resolve(collectTakeoverSourceBundle()),
            ]);
            if (disposed) {
                return;
            }
            if (currentSequence !== memoryFilterLoadSequence) {
                return;
            }
            memoryFilterSettingsCache = memoryFilterSettings;
            applyMemoryFilterSettingsToState(memoryFilterSettings);
            memoryFilterSourceMessages = bundle.messages;
            state.memoryFilterTabLoaded = true;
            logger.info(`记忆过滤器加载了 ${bundle.messages.length} 层消息`);
        } catch (error) {
            if (currentSequence !== memoryFilterLoadSequence) {
                return;
            }
            logger.warn('记忆过滤器加载消息失败', error);
            toast.error(`记忆过滤器加载失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            if (!disposed && currentSequence === memoryFilterLoadSequence) {
                state.memoryFilterTabLoading = false;
                await render();
            }
        }
    };

    /**
     * 功能：在旧聊天接管写入后同步刷新工作台缓存。
     * @returns 异步完成。
     */
    const refreshWorkbenchAfterTakeoverMutation = async (): Promise<void> => {
        takeoverProgressCache = null;
        invalidateMemoryFilterSnapshot();
        invalidatePreviewSnapshot();
        if (state.currentView === 'memory-filter') {
            await loadMemoryFilterSnapshot();
            const snapshot = await loadCoreSnapshot();
            try {
                await refreshMemoryFilterPreviewFromCurrentForm(snapshot);
            } catch (error) {
                logger.warn('接管完成后刷新记忆过滤预览失败', error);
            }
            return;
        }
        if (state.currentView === 'preview') {
            await refreshPreviewSnapshot();
        }
    };

    /**
     * 功能：刷新向量实验室快照。
     * @returns 异步完成。
     */
    const refreshVectorSnapshot = async (): Promise<void> => {
        if (disposed) {
            return;
        }
        const currentSequence = ++vectorLoadSequence;
        state.vectorTabLoading = true;
        await render();
        await waitForUiPaint();
        try {
            const [
                vectorRuntimeStatus,
                vectorDocuments,
                vectorIndexRecords,
                vectorRecallStats,
                vectorIndexStats,
            ] = await Promise.all([
                memory.unifiedMemory.diagnostics.getVectorRuntimeStatus(),
                memory.unifiedMemory.diagnostics.listVectorDocuments(),
                memory.unifiedMemory.diagnostics.listVectorIndexRecords(),
                memory.unifiedMemory.diagnostics.listVectorRecallStats(),
                memory.unifiedMemory.diagnostics.getVectorIndexStats(),
            ]);
            if (disposed) {
                return;
            }
            if (currentSequence !== vectorLoadSequence) {
                return;
            }
            vectorCache = {
                loaded: true,
                ...vectorRuntimeStatus,
                ...vectorIndexStats,
                documents: vectorDocuments,
                indexRecords: vectorIndexRecords,
                recallStats: vectorRecallStats,
            };
            state.vectorTabLoaded = true;
        } catch (error) {
            if (currentSequence !== vectorLoadSequence) {
                return;
            }
            logger.warn('加载向量实验室快照失败', error);
            toast.error(`向量实验室加载失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            if (!disposed && currentSequence === vectorLoadSequence) {
                state.vectorTabLoading = false;
                await render();
            }
        }
    };

    /**
     * 功能：按当前 Tab 懒加载对应重数据。
     * @param view 当前视图。
     * @returns 异步完成。
     */
    const loadDeferredTabData = async (view: WorkbenchView): Promise<void> => {
        if (view === 'vectors' && !state.vectorTabLoaded && !state.vectorTabLoading) {
            await refreshVectorSnapshot();
            return;
        }
        if (view === 'memory-filter' && !state.memoryFilterTabLoaded && !state.memoryFilterTabLoading) {
            await loadMemoryFilterSnapshot();
        }
    };

    /**
     * 功能：后台刷新旧聊天处理进度，避免切页时同步卡顿。
     * @returns 异步完成。
     */
    const refreshTakeoverProgress = async (): Promise<void> => {
        if (disposed) {
            return;
        }
        if (state.currentView !== 'takeover') {
            state.takeoverProgressLoading = false;
            return;
        }
        const currentSequence = ++takeoverProgressSequence;
        state.takeoverProgressLoading = true;
        await render();
        await waitForUiPaint();
        try {
            const progress = await memory.chatState.getTakeoverStatus();
            if (disposed) {
                return;
            }
            if (currentSequence !== takeoverProgressSequence) {
                return;
            }
            takeoverProgressCache = progress;
        } catch (error) {
            if (currentSequence !== takeoverProgressSequence) {
                return;
            }
            logger.warn('加载旧聊天处理进度失败', error);
        } finally {
            if (!disposed && currentSequence === takeoverProgressSequence) {
                state.takeoverProgressLoading = false;
                await render();
            }
        }
    };

    const render = async (): Promise<void> => {
        if (disposed || !root.isConnected) {
            return;
        }
        const entryList = root.querySelector('[data-entry-list-scroll="true"]') as HTMLElement | null;
        const preservedEntryListScrollTop = entryList?.scrollTop ?? 0;
        const typeList = root.querySelector('[data-type-list-scroll="true"]') as HTMLElement | null;
        const preservedTypeListScrollTop = typeList?.scrollTop ?? 0;
        const worldEntityList = root.querySelector('[data-world-entity-list-scroll="true"]') as HTMLElement | null;
        const preservedWorldEntityListScrollTop = worldEntityList?.scrollTop ?? 0;
        const vectorDocList = root.querySelector('[data-vector-doc-list-scroll="true"]') as HTMLElement | null;
        const preservedVectorDocListScrollTop = vectorDocList?.scrollTop ?? 0;
        const snapshot = await loadCoreSnapshot();
        normalizeSelection(snapshot);
        destroyMemoryGraphPage();
        root.innerHTML = buildWorkbenchMarkup(snapshot, state);
        const nextEntryList = root.querySelector('[data-entry-list-scroll="true"]') as HTMLElement | null;
        if (nextEntryList) {
            nextEntryList.scrollTop = preservedEntryListScrollTop;
        }
        const nextTypeList = root.querySelector('[data-type-list-scroll="true"]') as HTMLElement | null;
        if (nextTypeList) {
            nextTypeList.scrollTop = preservedTypeListScrollTop;
        }
        const nextWorldEntityList = root.querySelector('[data-world-entity-list-scroll="true"]') as HTMLElement | null;
        if (nextWorldEntityList) {
            nextWorldEntityList.scrollTop = preservedWorldEntityListScrollTop;
        }
        const nextVectorDocList = root.querySelector('[data-vector-doc-list-scroll="true"]') as HTMLElement | null;
        if (nextVectorDocList) {
            nextVectorDocList.scrollTop = preservedVectorDocListScrollTop;
        }
        if (disposed || !root.isConnected) {
            destroyMemoryGraphPage();
            return;
        }
        bindEvents(snapshot);

        if (state.currentView === 'actors' && state.currentActorTab === 'relationships') {
            const container = root.querySelector('#stx-rpg-graph-container') as HTMLElement | null;
            if (container) {
                mountRelationshipGraph(container, snapshot.actorGraph, {
                    selectedNodeId: state.selectedActorKey,
                    onSelectNode: (nodeId: string): void => {
                        if (nodeId !== state.selectedActorKey) {
                            state.selectedActorKey = nodeId;
                            void render();
                        }
                    },
                });
            }
        }

        if (state.currentView === 'memory-graph') {
            const graphPageHost = root.querySelector('[data-view="memory-graph"]') as HTMLElement | null;
            if (graphPageHost) {
                mountMemoryGraphPage({
                    host: graphPageHost,
                    snapshot,
                    state,
                    onRequestRender: (): void => {
                        void render();
                    },
                });
            }

        }
    };

    await render();
    void loadDeferredTabData(state.currentView);
    if (state.currentView === 'takeover') {
        void refreshTakeoverProgress();
    }
    return cleanupWorkbench;
}

/**
 * 功能：归一化命中说明对象。
 * @param value 原始对象。
 * @returns 命中说明或空值。
 */
function normalizeRecallExplanation(value: Record<string, unknown> | null): WorkbenchSnapshot['recallExplanation'] {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        generatedAt: Number(value.generatedAt ?? 0) || undefined,
        query: String(value.query ?? '').trim() || undefined,
        matchedActorKeys: toStringArray(value.matchedActorKeys),
        matchedEntryIds: toStringArray(value.matchedEntryIds),
        reasonCodes: toStringArray(value.reasonCodes),
        source: String(value.source ?? '').trim() || undefined,
        retrievalProviderId: String(value.retrievalProviderId ?? '').trim() || undefined,
        finalProviderId: String(value.finalProviderId ?? '').trim() || undefined,
        seedProviderId: String(value.seedProviderId ?? '').trim() || undefined,
        retrievalRulePack: String(value.retrievalRulePack ?? '').trim() || undefined,
        compareKeySchemaVersion: String(value.compareKeySchemaVersion ?? '').trim() || undefined,
        matchModeCounts: (() => {
            const record = toRecord(value.matchModeCounts);
            const result: Record<string, number> = {};
            Object.entries(record).forEach(([key, rawValue]: [string, unknown]): void => {
                const numericValue = Number(rawValue);
                if (!Number.isFinite(numericValue)) {
                    return;
                }
                result[String(key ?? '').trim()] = Math.max(0, Math.trunc(numericValue));
            });
            return result;
        })(),
        vectorHitCount: Number(value.vectorHitCount ?? 0) || 0,
        mergeUsed: value.mergeUsed === true,
        rerankUsed: value.rerankUsed === true,
        rerankSource: String(value.rerankSource ?? '').trim() || undefined,
        strategyDecision: (() => {
            const record = toRecord(value.strategyDecision);
            if (Object.keys(record).length <= 0) {
                return null;
            }
            return {
                route: String(record.route ?? '').trim() || undefined,
                candidateWindow: Number(record.candidateWindow ?? 0) || undefined,
                finalTopK: Number(record.finalTopK ?? 0) || undefined,
                rerankEnabled: record.rerankEnabled === true,
                reasonCodes: toStringArray(record.reasonCodes),
            };
        })(),
        subQueries: toStringArray(value.subQueries),
        matchedRules: Array.isArray(value.matchedRules)
            ? value.matchedRules
                .filter((item: unknown): boolean => Boolean(item) && typeof item === 'object')
                .map((item: unknown) => {
                    const record = item as Record<string, unknown>;
                    return {
                        pack: String(record.pack ?? '').trim(),
                        label: String(record.label ?? '').trim(),
                        matchedText: toStringArray(record.matchedText),
                    };
                })
            : [],
        routeReasons: Array.isArray(value.routeReasons)
            ? value.routeReasons.map((item: unknown): string => {
                if (typeof item === 'string') {
                    return String(item).trim();
                }
                if (item && typeof item === 'object') {
                    return String((item as Record<string, unknown>).detail ?? '').trim();
                }
                return '';
            }).filter(Boolean)
            : [],
        semanticCounts: (() => {
            const record = toRecord(value.semanticCounts);
            const result: Record<string, number> = {};
            Object.entries(record).forEach(([key, rawValue]: [string, unknown]): void => {
                const numericValue = Number(rawValue);
                if (!Number.isFinite(numericValue)) {
                    return;
                }
                result[String(key ?? '').trim()] = Math.max(0, Math.trunc(numericValue));
            });
            return result;
        })(),
        forgettingCounts: (() => {
            const record = toRecord(value.forgettingCounts);
            const result: Record<string, number> = {};
            Object.entries(record).forEach(([key, rawValue]: [string, unknown]): void => {
                const numericValue = Number(rawValue);
                if (!Number.isFinite(numericValue)) {
                    return;
                }
                result[String(key ?? '').trim()] = Math.max(0, Math.trunc(numericValue));
            });
            return result;
        })(),
        shadowTriggeredCount: Number(value.shadowTriggeredCount ?? 0) || 0,
        traceRecords: Array.isArray(value.traceRecords)
            ? value.traceRecords
                .filter((item: unknown): boolean => Boolean(item) && typeof item === 'object')
                .map((item: unknown) => {
                    const record = item as Record<string, unknown>;
                    return {
                        ts: Number(record.ts ?? 0) || 0,
                        level: String(record.level ?? '').trim(),
                        stage: String(record.stage ?? '').trim(),
                        title: String(record.title ?? '').trim(),
                        message: String(record.message ?? '').trim(),
                    };
                })
            : [],
    };
}

/**
 * 功能：根据真实条目构建角色关系图。
 * @param actors 角色列表。
 * @param entries 条目列表。
 * @returns 真实图数据。
 */
function buildActorGraph(
    actors: ActorMemoryProfile[],
    relationships: MemoryRelationshipRecord[],
    entries: MemoryEntry[],
): WorkbenchActorGraph {
    const nodes = actors.map((actor: ActorMemoryProfile, index: number): WorkbenchActorGraph['nodes'][number] => {
        const angle = actors.length <= 1 ? 0 : (index / actors.length) * Math.PI * 2;
        const radius = actors.length <= 1 ? 0 : 220;
        return {
            id: actor.actorKey,
            label: actor.displayName || actor.actorKey,
            memoryStat: actor.memoryStat,
            x: Math.round(Math.cos(angle) * radius),
            y: Math.round(Math.sin(angle) * radius),
            relationCount: 0,
            kind: 'actor',
        };
    });
    const nodeMap = new Map(nodes.map((node): [string, WorkbenchActorGraph['nodes'][number]] => [node.id, node]));
    const links: WorkbenchActorGraphLink[] = [];

    relationships.forEach((relationship: MemoryRelationshipRecord): void => {
        const sourceNode = nodeMap.get(relationship.sourceActorKey);
        const targetNode = nodeMap.get(relationship.targetActorKey);
        if (!sourceNode || !targetNode) {
            return;
        }
        sourceNode.relationCount += 1;
        targetNode.relationCount += 1;
        links.push({
            id: `graph-link:${relationship.relationshipId}`,
            source: relationship.sourceActorKey,
            target: relationship.targetActorKey,
            entryId: relationship.relationshipId,
            label: truncateText(relationship.relationTag || relationship.summary || '关系', 24),
            summary: relationship.summary || relationship.state || '',
            type: resolveGraphLinkType(relationship.relationTag),
            updatedAt: relationship.updatedAt,
        });
    });

    const userNode = nodeMap.get('user');
    const externalRelations = entries
        .filter((entry: MemoryEntry): boolean => {
            if (!['organization', 'city', 'nation', 'location'].includes(String(entry.entryType ?? '').trim())) {
                return false;
            }
            const payload = toRecord(entry.detailPayload);
            const fields = toRecord(payload.fields);
            return Boolean(String(fields.userRelationState ?? '').trim());
        });
    externalRelations.forEach((entry: MemoryEntry, index: number): void => {
        if (!userNode) {
            return;
        }
        const payload = toRecord(entry.detailPayload);
        const fields = toRecord(payload.fields);
        const externalNodeId = `entity:${entry.entryId}`;
        if (!nodeMap.has(externalNodeId)) {
            const angle = externalRelations.length <= 1 ? 0 : (index / externalRelations.length) * Math.PI * 2;
            const radius = 360;
            const externalNode: WorkbenchActorGraph['nodes'][number] = {
                id: externalNodeId,
                label: entry.title || entry.entryId,
                memoryStat: 0,
                x: Math.round(Math.cos(angle) * radius),
                y: Math.round(Math.sin(angle) * radius),
                relationCount: 0,
                kind: 'entity',
            };
            nodes.push(externalNode);
            nodeMap.set(externalNodeId, externalNode);
        }
        const targetNode = nodeMap.get(externalNodeId);
        if (!targetNode) {
            return;
        }
        userNode.relationCount += 1;
        targetNode.relationCount += 1;
        links.push({
            id: `graph-link:entity:${entry.entryId}`,
            source: 'user',
            target: externalNodeId,
            entryId: entry.entryId,
            label: truncateText(
                String(fields.userRelationTag ?? fields.userRelationState ?? entry.summary ?? entry.title ?? '关系').trim(),
                24,
            ),
            summary: String(fields.userRelationState ?? entry.summary ?? '').trim(),
            type: resolveEntityRelationshipTone(entry),
            updatedAt: entry.updatedAt,
        });
    });

    return { nodes, links };
}

/**
 * 功能：根据关系标签推断图谱边的语义类型。
 * @param relationTag 关系标签。
 * @returns 图谱边类型。
 */
function resolveGraphLinkType(relationTag: string): WorkbenchGraphLinkType {
    const normalizedRelationTag = String(relationTag ?? '').trim();
    if (normalizedRelationTag === '亲人' || normalizedRelationTag === '家人' || normalizedRelationTag === '亲属') {
        return 'family';
    }
    if (normalizedRelationTag === '盟友' || normalizedRelationTag === '朋友' || normalizedRelationTag === '友好' || normalizedRelationTag === '同伴') {
        return 'ally';
    }
    if (normalizedRelationTag === '宿敌' || normalizedRelationTag === '敌人' || normalizedRelationTag === '仇人' || normalizedRelationTag === '敌对') {
        return 'enemy';
    }
    if (normalizedRelationTag === '恋人' || normalizedRelationTag === '爱人' || normalizedRelationTag === '暧昧') {
        return 'romance';
    }
    return 'neutral';
}

/**
 * 功能：根据实体条目中的用户关系字段估算图边颜色。
 * @param entry 实体条目。
 * @returns 图边类型。
 */
function resolveEntityRelationshipTone(entry: MemoryEntry): WorkbenchGraphLinkType {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const relationTag = String(fields.userRelationTag ?? '').trim();
    if (relationTag === '亲人' || relationTag === '家人' || relationTag === '亲属') {
        return 'family';
    }
    if (relationTag === '盟友' || relationTag === '朋友' || relationTag === '友好' || relationTag === '同伴') {
        return 'ally';
    }
    if (relationTag === '宿敌' || relationTag === '敌人' || relationTag === '仇人' || relationTag === '敌对') {
        return 'enemy';
    }
    return 'neutral';
}

/**
 * 功能：构建聊天记忆库导出文件名。
 * @param chatKey 当前聊天键。
 * @returns 可下载的文件名。
 */
function buildChatDatabaseExportFileName(chatKey: string): string {
    const normalizedChatKey = String(chatKey ?? '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 96) || 'memory_chat';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `memory-chat-database-${normalizedChatKey}-${timestamp}.json`;
}

/**
 * 功能：把 JSON 数据触发为浏览器下载。
 * @param fileName 文件名。
 * @param data JSON 数据。
 * @returns 无返回值。
 */
function downloadJsonFile(fileName: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout((): void => {
        URL.revokeObjectURL(objectUrl);
    }, 0);
}

/**
 * 功能：使用 FileReader 按 UTF-8 读取文本文件。
 * @param file 待读取文件。
 * @returns 文件文本内容。
 */
function readFileAsUtf8Text(file: File): Promise<string> {
    return new Promise((resolve: (value: string) => void, reject: (reason?: unknown) => void): void => {
        const reader = new FileReader();
        reader.onerror = (): void => {
            reject(new Error('文件读取失败。'));
        };
        reader.onload = (): void => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('文件内容不是文本。'));
                return;
            }
            resolve(result);
        };
        reader.readAsText(file, 'utf-8');
    });
}

/**
 * 功能：把数据库检查报告包装为可复用的导入测试包。
 * @param report 数据库检查报告。
 * @returns Prompt 测试包。
 */
function buildPromptTestBundleFromDatabaseInspection(
    report: ReturnType<typeof inspectMemoryDatabaseSnapshot>,
): MemoryPromptTestBundle {
    if (!report.database) {
        throw new Error('缺少数据库快照。');
    }
    return {
        version: '1.0.0',
        exportedAt: report.exportedAt ?? report.generatedAt ?? Date.now(),
        sourceChatKey: report.database.chatKey,
        database: report.database,
        promptFixture: [],
        query: '',
        settings: {},
        captureMeta: {
            mode: 'simulated_prompt',
            note: 'database_snapshot_import',
        },
    };
}

/**
 * 功能：根据旧聊天接管执行结果显示统一提示。
 * @param result 接管执行结果。
 * @param options 文案配置。
 * @returns 无返回值。
 */
function toastTakeoverExecutionResult(
    result: {
        finished: boolean;
        reasonCode: string;
        progress: { plan?: { status?: string } | null } | null;
    },
    options: {
        completedText: string;
        runningText: string;
        blockedText: string;
    },
): void {
    const status = String(result.progress?.plan?.status ?? result.reasonCode ?? '').trim();
    if (result.finished || status === 'completed' || status === 'degraded') {
        toast.success(options.completedText);
        return;
    }
    if (status === 'blocked_by_batch') {
        toast.warning(options.blockedText);
        return;
    }
    toast.info(options.runningText);
}
