import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { logger, toast } from '../runtime/runtime-services';
import type { MemorySDKImpl } from '../sdk/memory-sdk';
import { readMemoryOSSettings } from '../settings/store';
import { escapeHtml } from './editorShared';
import { buildTakeoverPreviewMarkup } from './takeoverPreviewMarkup';
import { waitForUiPaint } from './uiAsync';
import type { UnifiedMemoryWorkbenchOpenOptions, UnifiedWorkbenchViewMode } from './unifiedMemoryWorkbenchTypes';
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
} from './workbenchTabs/shared';
import { buildEntriesViewMarkup } from './workbenchTabs/tabEntries';
import { buildTypesViewMarkup } from './workbenchTabs/tabTypes';
import { buildPreviewViewMarkup } from './workbenchTabs/tabPreview';
import { buildActorsViewMarkup } from './workbenchTabs/tabActors';
import { buildWorldEntitiesViewMarkup } from './workbenchTabs/tabWorldEntities';
import { buildTakeoverViewMarkup } from './workbenchTabs/tabTakeover';
import { buildVectorsViewMarkup } from './workbenchTabs/tabVectors';
import { buildContentLabViewMarkup } from './workbenchTabs/tabContentLab';
import { parseTakeoverFormDraft } from './takeoverFormShared';
import {
    type ContentLabSettings,
    type ContentBlockPolicy,
} from '../config/content-tag-registry';
import type { RawFloorRecord } from '../memory-takeover/content-block-pipeline';
import { assembleContentChannels } from '../memory-takeover';
import { collectTakeoverSourceBundle, type MemoryTakeoverMessageSlice } from '../memory-takeover/takeover-source';
import { mountRelationshipGraph } from './workbenchTabs/actorTabs/relationshipGraph';
import {
    buildMemoryGraphPageMarkup,
    destroyMemoryGraphPage,
    mountMemoryGraphPage,
} from './workbenchPages/memoryGraphPage';

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
    if (initialView === 'takeover') {
        return 'takeover';
    }
    if (initialView === 'vectors') {
        return 'vectors';
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
                    <i class="fa-solid fa-microchip"></i> MemoryOS 记忆工作台
                </div>
                <nav class="stx-memory-workbench__nav">
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'entries' ? ' is-active' : ''}" data-workbench-view="entries">
                        条目中心
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'types' ? ' is-active' : ''}" data-workbench-view="types">
                        类型工坊
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'actors' ? ' is-active' : ''}" data-workbench-view="actors">
                        角色档案
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'world-entities' ? ' is-active' : ''}" data-workbench-view="world-entities">
                        世界实体
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'preview' ? ' is-active' : ''}" data-workbench-view="preview">
                        诊断中心
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'vectors' ? ' is-active' : ''}" data-workbench-view="vectors">
                        向量实验室
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'memory-graph' ? ' is-active' : ''}" data-workbench-view="memory-graph">
                        可视化记忆
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'takeover' ? ' is-active' : ''}" data-workbench-view="takeover">
                        旧聊天接管
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'content-lab' ? ' is-active' : ''}" data-workbench-view="content-lab">
                        内容拆分实验室
                    </button>
                </nav>
                <div class="stx-memory-workbench__stats">
                    <span title="当前聊天中的记忆条目数量">条目 <strong>${snapshot.entries.length}</strong></span>
                    <span title="当前聊天可用的条目类型数量">类型 <strong>${snapshot.entryTypes.length}</strong></span>
                    <span title="角色与条目之间的真实绑定数量">绑定 <strong>${snapshot.roleMemories.length}</strong></span>
                </div>
            </header>
            <main class="stx-memory-workbench__main">
                ${buildEntriesViewMarkup(filteredEntries, snapshot, state, typeMap, entryDraft, selectedEntry, selectedEntryType, dynamicFields)}
                ${buildTypesViewMarkup(snapshot, state, selectedType)}
                ${buildActorsViewMarkup(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                ${buildWorldEntitiesViewMarkup(snapshot, state)}
                ${buildPreviewViewMarkup(snapshot, state)}
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
                ${buildContentLabViewMarkup(snapshot, state)}
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
    openSharedDialog({
        id: 'stx-memory-unified-workbench',
        size: 'fullscreen',
        layout: 'bare',
        chrome: false,
        bodyHtml: '<div id="stx-memory-workbench-root"></div>',
        onMount: (instance: SharedDialogInstance): void => {
            void mountWorkbench(instance, options).catch((error: unknown): void => {
                logger.error('挂载 MemoryOS 工作台失败', error);
                toast.error(`工作台加载失败：${String((error as Error)?.message ?? error)}`);
            });
        },
    });
}

/**
 * 功能：挂载统一记忆工作台。
 * @param instance 对话框实例。
 * @param options 打开参数。
 * @returns 异步挂载结果。
 */
async function mountWorkbench(instance: SharedDialogInstance, options: UnifiedMemoryWorkbenchOpenOptions): Promise<void> {
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
        return;
    }

    const root = instance.content.querySelector('#stx-memory-workbench-root') as HTMLElement | null;
    if (!root) {
        return;
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
        vectorQuery: '',
        vectorMode: settings.retrievalMode,
        vectorSourceKindFilter: 'all',
        vectorStatusFilter: 'all',
        vectorSchemaFilter: 'all',
        vectorActorFilter: 'all',
        vectorTextFilter: '',
        vectorSelectedDocId: '',
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
        entryTimeFilter: 'all',
        entrySortOrder: 'updated-desc',
    };
    let takeoverPreviewSequence = 0;
    let takeoverProgressCache: WorkbenchSnapshot['takeoverProgress'] = null;
    let takeoverProgressSequence = 0;
    let previewCache: WorkbenchSnapshot['preview'] = null;
    let previewRecallExplanationCache: WorkbenchSnapshot['recallExplanation'] = null;
    let vectorLoadSequence = 0;
    let contentLabLoadSequence = 0;
    let contentLabSettingsCache: ContentLabSettings | null = null;
    let contentLabSourceMessages: MemoryTakeoverMessageSlice[] = [];
    let contentLabPreviewFloor: RawFloorRecord | undefined = undefined;

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
     * 功能：将内容实验室配置同步到工作台状态。
     * @param contentLabSettings 内容实验室配置。
     * @returns 无返回值。
     */
    const applyContentLabSettingsToState = (contentLabSettings: ContentLabSettings): void => {
        state.contentLabUnknownTagDefaultKind = contentLabSettings.unknownTagPolicy.defaultKind;
        state.contentLabUnknownTagAllowHint = contentLabSettings.unknownTagPolicy.allowAsHint;
        state.contentLabEnableRuleClassifier = contentLabSettings.classifierToggles.enableRuleClassifier;
        state.contentLabEnableMetaKeywordDetection = contentLabSettings.classifierToggles.enableMetaKeywordDetection;
        state.contentLabEnableToolArtifactDetection = contentLabSettings.classifierToggles.enableToolArtifactDetection;
        state.contentLabEnableAIClassifier = contentLabSettings.enableAIClassifier;
    };

    /**
     * 功能：构建内容实验室快照。
     */
    const buildContentLabSnapshot = (): WorkbenchSnapshot['contentLabSnapshot'] => {
        const availableFloors = contentLabSourceMessages.map((msg) => ({
            floor: msg.floor,
            role: msg.role,
            charCount: msg.content.length,
        }));
        return {
            loaded: state.contentLabTabLoaded,
            tagRegistry: contentLabSettingsCache?.tagRegistry ?? [],
            availableFloors,
            previewFloor: contentLabPreviewFloor,
        };
    };

    /**
     * 功能：读取工作台核心快照。
     * @returns 工作台快照。
     */
    const loadCoreSnapshot = async (): Promise<WorkbenchSnapshot> => {
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
        ]);

        takeoverProgressCache = takeoverProgress;

        return {
            entryTypes,
            entries,
            actors,
            roleMemories,
            summaries,
            preview: previewCache,
            worldProfileBinding,
            mutationHistory,
            entryAuditRecords,
            recallExplanation: previewRecallExplanationCache,
            actorGraph: buildActorGraph(actors, relationships, entries),
            memoryGraph: graphService.buildTakeoverGraph(takeoverProgress),
            takeoverProgress,
            vectorSnapshot: vectorCache,
            contentLabSnapshot: buildContentLabSnapshot(),
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

    /**
     * 功能：读取并保存当前内容实验室配置。
     * @param root 工作台根节点。
     * @param registry 可选标签注册表。
     * @returns 保存后的配置。
     */
    const persistContentLabSettings = async (
        root: HTMLElement,
        registry?: ContentBlockPolicy[],
    ): Promise<ContentBlockPolicy[]> => {
        if (!contentLabSettingsCache) {
            contentLabSettingsCache = await memory.chatState.getContentLabSettings();
            applyContentLabSettingsToState(contentLabSettingsCache);
        }
        const saved = await memory.chatState.saveContentLabSettings({
            tagRegistry: registry,
            unknownTagPolicy: {
                defaultKind: readInputValue(root, '#stx-content-lab-unknown-kind') as ContentLabSettings['unknownTagPolicy']['defaultKind'],
                allowAsHint: readCheckedValue(root, '#stx-content-lab-unknown-hint'),
            },
            classifierToggles: {
                enableRuleClassifier: readCheckedValue(root, '#stx-content-lab-enable-rule'),
                enableMetaKeywordDetection: readCheckedValue(root, '#stx-content-lab-enable-meta'),
                enableToolArtifactDetection: readCheckedValue(root, '#stx-content-lab-enable-tool'),
            },
            enableAIClassifier: readCheckedValue(root, '#stx-content-lab-enable-ai'),
        });
        contentLabSettingsCache = saved;
        applyContentLabSettingsToState(saved);
        state.contentLabTabLoaded = true;
        return saved.tagRegistry;
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
                previewCache = null;
                previewRecallExplanationCache = null;
                await render();
                void refreshPreviewSnapshot();
                return;
            }
            if (action === 'capture-summary') {
                await memory.postGeneration.scheduleRoundProcessing('unified_memory_workbench', { force: true });
                previewCache = null;
                previewRecallExplanationCache = null;
                toast.success('已触发强制快照归档。');
                await render();
                if (state.currentView === 'preview') {
                    void refreshPreviewSnapshot();
                }
                return;
            }
            if (action === 'export-chat-database') {
                const databaseSnapshot = await memory.chatState.exportCurrentChatDatabaseSnapshotForTest();
                const fileName = buildChatDatabaseExportFileName(memory.getChatKey());
                downloadJsonFile(fileName, databaseSnapshot);
                toast.success('当前聊天记忆库已导出。');
                return;
            }
            if (action === 'clear-chat-database') {
                const confirmed = window.confirm('确定要删除当前聊天数据库吗？此操作会清空当前聊天的记忆条目、角色绑定、总结、世界画像和历史记录，且无法恢复。');
                if (!confirmed) {
                    return;
                }
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
                await memory.chatState.createTakeoverPlan(parsed.config);
                await memory.chatState.startTakeover();
                toast.success('旧聊天接管任务已启动。');
                await render();
                return;
            }
            if (action === 'takeover-preview-calc') {
                state.takeoverPreviewExpanded = true;
                await refreshTakeoverPreview();
                return;
            }
            if (action === 'takeover-pause') {
                await memory.chatState.pauseTakeover();
                toast.success('接管任务已暂停。');
                await render();
                return;
            }
            if (action === 'takeover-resume') {
                await memory.chatState.resumeTakeover();
                toast.success('接管任务已继续。');
                await render();
                return;
            }
            if (action === 'takeover-consolidate') {
                await memory.chatState.runTakeoverConsolidation();
                toast.success('接管整合已完成。');
                await render();
                return;
            }
            if (action === 'takeover-abort') {
                await memory.chatState.abortTakeover();
                toast.success('接管任务已终止。');
                await render();
                return;
            }
            if (action === 'content-lab-preview-floor') {
                const previewSourceMode = readInputValue(root, '#stx-content-lab-preview-source-mode') === 'raw_visible_text'
                    ? 'raw_visible_text'
                    : 'content';
                const selectedFloor = Number(readInputValue(root, '#stx-content-lab-selected-floor'));
                if (!selectedFloor || selectedFloor < 1) {
                    toast.error('请输入有效的楼层号。');
                    return;
                }
                state.contentLabPreviewLoading = true;
                state.contentLabSelectedFloor = String(selectedFloor);
                state.contentLabPreviewSourceMode = previewSourceMode;
                await render();
                try {
                    await loadContentLabSnapshot();
                    if (!contentLabSourceMessages.some((m) => m.floor === selectedFloor)) {
                        toast.error(`未找到楼层 ${selectedFloor}，可用范围：${contentLabSourceMessages[0]?.floor ?? '?'} - ${contentLabSourceMessages[contentLabSourceMessages.length - 1]?.floor ?? '?'}`);
                        state.contentLabPreviewLoading = false;
                        await render();
                        return;
                    }
                    await persistContentLabSettings(root, snapshot.contentLabSnapshot.tagRegistry);
                    const record = await memory.chatState.previewFloorContentBlocks({
                        floor: selectedFloor,
                        previewSourceMode,
                    });
                    contentLabPreviewFloor = record;
                    state.contentLabBlocks = record.parsedBlocks;
                    const channels = assembleContentChannels([record]);
                    state.contentLabPrimaryPreview = channels.primaryText;
                    state.contentLabHintPreview = channels.hintText;
                    state.contentLabExcludedPreview = channels.excludedSummary.join('\n');
                } finally {
                    state.contentLabPreviewLoading = false;
                    await render();
                }
                return;
            }
            if (action === 'content-lab-preview-range') {
                const previewSourceMode = readInputValue(root, '#stx-content-lab-preview-source-mode') === 'raw_visible_text'
                    ? 'raw_visible_text'
                    : 'content';
                const startFloor = Number(readInputValue(root, '#stx-content-lab-start-floor'));
                const endFloor = Number(readInputValue(root, '#stx-content-lab-end-floor'));
                if (!startFloor || !endFloor || startFloor < 1 || endFloor < startFloor) {
                    toast.error('请输入有效的楼层范围。');
                    return;
                }
                state.contentLabPreviewLoading = true;
                state.contentLabStartFloor = String(startFloor);
                state.contentLabEndFloor = String(endFloor);
                state.contentLabPreviewSourceMode = previewSourceMode;
                await render();
                try {
                    await loadContentLabSnapshot();
                    await persistContentLabSettings(root, snapshot.contentLabSnapshot.tagRegistry);
                    const records = await memory.chatState.previewFloorRangeContentBlocks({
                        startFloor,
                        endFloor,
                        previewSourceMode,
                    });
                    const channels = assembleContentChannels(records);
                    contentLabPreviewFloor = records.find((record) => record.floor === Number(state.contentLabSelectedFloor))
                        ?? records[0];
                    state.contentLabBlocks = contentLabPreviewFloor?.parsedBlocks ?? [];
                    state.contentLabPrimaryPreview = channels.primaryText;
                    state.contentLabHintPreview = channels.hintText;
                    state.contentLabExcludedPreview = channels.excludedSummary.join('\n');
                } finally {
                    state.contentLabPreviewLoading = false;
                    await render();
                }
                return;
            }
            if (action === 'content-lab-reset-rules') {
                const saved = await memory.chatState.saveContentLabSettings({
                    tagRegistry: [],
                    unknownTagPolicy: { defaultKind: 'unknown', allowAsHint: true },
                    classifierToggles: {
                        enableRuleClassifier: true,
                        enableMetaKeywordDetection: true,
                        enableToolArtifactDetection: true,
                    },
                    enableAIClassifier: false,
                });
                contentLabSettingsCache = saved;
                applyContentLabSettingsToState(saved);
                state.contentLabTabLoaded = true;
                toast.success('标签规则已重置为默认值。');
                await render();
                return;
            }
            if (action === 'content-lab-add-rule') {
                const tagName = prompt('请输入标签名（如 custom_tag）：');
                if (!tagName || !tagName.trim()) return;
                const registry = [...snapshot.contentLabSnapshot.tagRegistry];
                registry.push({
                    tagName: tagName.trim(),
                    aliases: [],
                    pattern: '',
                    patternMode: undefined,
                    priority: 0,
                    kind: 'unknown',
                    includeInPrimaryExtraction: false,
                    includeAsHint: true,
                    allowActorPromotion: false,
                    allowRelationPromotion: false,
                    notes: '用户自定义',
                });
                await persistContentLabSettings(root, registry);
                toast.success('已添加新规则。');
                await render();
                return;
            }
            if (action === 'content-lab-delete-rule') {
                const idx = Number(button.dataset.ruleIndex ?? -1);
                const registry = [...snapshot.contentLabSnapshot.tagRegistry];
                if (idx >= 0 && idx < registry.length) {
                    registry.splice(idx, 1);
                    if (state.contentLabEditingRuleIndex === idx) {
                        state.contentLabEditingRuleIndex = -1;
                    } else if (state.contentLabEditingRuleIndex > idx) {
                        state.contentLabEditingRuleIndex -= 1;
                    }
                    await persistContentLabSettings(root, registry);
                    toast.success('规则已删除。');
                    await render();
                }
                return;
            }
            if (action === 'content-lab-edit-rule') {
                const idx = Number(button.dataset.ruleIndex ?? -1);
                const registry = [...snapshot.contentLabSnapshot.tagRegistry];
                if (!registry[idx]) return;
                state.contentLabEditingRuleIndex = idx;
                await render();
                return;
            }
            if (action === 'content-lab-save-rule') {
                const idx = Number(button.dataset.ruleIndex ?? -1);
                const registry = [...snapshot.contentLabSnapshot.tagRegistry];
                const rule = registry[idx];
                if (!rule) return;
                const kindValue = readInputValue(root, `[data-rule-kind="${idx}"]`);
                const tagName = readInputValue(root, `[data-rule-tag-name="${idx}"]`);
                const aliasesText = readInputValue(root, `[data-rule-aliases="${idx}"]`);
                const pattern = readInputValue(root, `[data-rule-pattern="${idx}"]`);
                const patternModeValue = readInputValue(root, `[data-rule-pattern-mode="${idx}"]`);
                const priorityValue = readInputValue(root, `[data-rule-priority="${idx}"]`);
                const notes = readInputValue(root, `[data-rule-notes="${idx}"]`);
                const includeInPrimaryExtraction = readCheckedValue(root, `[data-rule-primary="${idx}"]`);
                const includeAsHint = readCheckedValue(root, `[data-rule-hint="${idx}"]`);
                if (!tagName) {
                    toast.warning('标签名不能为空。');
                    return;
                }
                const kindOptions: ContentBlockPolicy['kind'][] = ['story_primary', 'story_secondary', 'summary', 'tool_artifact', 'thought', 'meta_commentary', 'instruction', 'unknown'];
                const nextKind = kindOptions.includes(kindValue as ContentBlockPolicy['kind'])
                    ? kindValue as ContentBlockPolicy['kind']
                    : 'unknown';
                rule.tagName = tagName;
                rule.aliases = parseTagText(aliasesText);
                rule.pattern = pattern || undefined;
                rule.patternMode = patternModeValue === 'prefix' || patternModeValue === 'regex'
                    ? patternModeValue
                    : undefined;
                rule.priority = Math.trunc(Number(priorityValue) || 0);
                rule.kind = nextKind;
                rule.includeInPrimaryExtraction = includeInPrimaryExtraction;
                rule.includeAsHint = includeAsHint;
                rule.allowActorPromotion = includeInPrimaryExtraction;
                rule.allowRelationPromotion = includeInPrimaryExtraction || includeAsHint;
                rule.notes = notes;
                state.contentLabEditingRuleIndex = -1;
                await persistContentLabSettings(root, registry);
                toast.success('规则已保存。');
                await render();
                return;
            }
            if (action === 'content-lab-export-rules') {
                const registry = snapshot.contentLabSnapshot.tagRegistry;
                const blob = new Blob([JSON.stringify(registry, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'content-tag-registry.json';
                a.click();
                URL.revokeObjectURL(url);
                toast.success('规则已导出。');
                return;
            }
            if (action === 'content-lab-import-rules') {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const rules = JSON.parse(text);
                        if (!Array.isArray(rules)) {
                            toast.error('导入文件格式不正确。');
                            return;
                        }
                        await persistContentLabSettings(root, rules as ContentBlockPolicy[]);
                        toast.success('规则已导入。');
                        await render();
                    } catch {
                        toast.error('导入失败，请检查文件格式。');
                    }
                };
                input.click();
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
                state.currentView = String(button.dataset.workbenchView ?? 'entries') as WorkbenchView;
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
            startButton.disabled = state.takeoverPreviewLoading;
        }
    };

    /**
     * 功能：异步刷新诊断中心的提示词预览快照，避免阻塞切页。
     * @returns 无返回值。
     */
    const refreshPreviewSnapshot = async (): Promise<void> => {
        if (state.currentView !== 'preview') {
            state.previewTabLoading = false;
            return;
        }
        state.previewTabLoading = true;
        try {
            const [preview, recallExplanation] = await Promise.all([
                memory.unifiedMemory.prompts.preview({ query: state.previewQuery }),
                memory.chatState.getLatestRecallExplanation(),
            ]);
            previewCache = preview;
            previewRecallExplanationCache = normalizeRecallExplanation(recallExplanation);
            state.previewTabLoaded = true;
        } catch (error) {
            logger.error('加载诊断中心预览失败', error);
            toast.error(`诊断加载失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            state.previewTabLoading = false;
            if (state.currentView === 'preview') {
                await render();
            }
        }
    };

    /**
     * 功能：异步刷新接管 token 预估，避免阻塞整个工作台渲染。
     * @returns 无返回值
     */
    const refreshTakeoverPreview = async (): Promise<void> => {
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
            state.takeoverPreview = {
                mode: parsed.config.mode ?? 'full',
                totalFloors: state.takeoverPreview?.totalFloors ?? 0,
                range: null,
                activeWindow: null,
                batchSize: Math.max(0, Number(parsed.config.batchSize ?? 0) || 0),
                useActiveSnapshot: parsed.config.useActiveSnapshot !== false,
                activeSnapshotFloors: Math.max(0, Number(parsed.config.activeSnapshotFloors ?? 0) || 0),
                threshold: state.takeoverPreview?.threshold ?? 100000,
                totalBatches: 0,
                batches: [],
                hasOverflow: false,
                overflowWarnings: [],
                validationError: parsed.validationError,
            };
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
            state.takeoverPreview = {
                mode: parsed.config.mode ?? 'full',
                totalFloors: state.takeoverPreview?.totalFloors ?? 0,
                range: null,
                activeWindow: null,
                batchSize: Math.max(0, Number(parsed.config.batchSize ?? 0) || 0),
                useActiveSnapshot: parsed.config.useActiveSnapshot !== false,
                activeSnapshotFloors: Math.max(0, Number(parsed.config.activeSnapshotFloors ?? 0) || 0),
                threshold: state.takeoverPreview?.threshold ?? 100000,
                totalBatches: 0,
                batches: [],
                hasOverflow: false,
                overflowWarnings: [],
                validationError: `Token 预估失败：${String((error as Error)?.message ?? error)}`,
            };
        } finally {
            if (currentSequence === takeoverPreviewSequence) {
                state.takeoverPreviewLoading = false;
                syncTakeoverPreviewUi();
            }
        }
    };

    /**
     * 功能：加载内容实验室配置与楼层消息。
     * @returns 异步完成。
     */
    const loadContentLabSnapshot = async (): Promise<void> => {
        if (state.contentLabTabLoaded && contentLabSettingsCache && contentLabSourceMessages.length > 0) {
            return;
        }
        const currentSequence = ++contentLabLoadSequence;
        state.contentLabTabLoading = true;
        await render();
        await waitForUiPaint();
        try {
            const [contentLabSettings, bundle] = await Promise.all([
                contentLabSettingsCache ? Promise.resolve(contentLabSettingsCache) : memory.chatState.getContentLabSettings(),
                Promise.resolve(collectTakeoverSourceBundle()),
            ]);
            if (currentSequence !== contentLabLoadSequence) {
                return;
            }
            contentLabSettingsCache = contentLabSettings;
            applyContentLabSettingsToState(contentLabSettings);
            contentLabSourceMessages = bundle.messages;
            state.contentLabTabLoaded = true;
            logger.info(`内容实验室加载了 ${bundle.messages.length} 层消息`);
        } catch (error) {
            if (currentSequence !== contentLabLoadSequence) {
                return;
            }
            logger.warn('内容实验室加载消息失败', error);
            toast.error(`内容实验室加载失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            if (currentSequence === contentLabLoadSequence) {
                state.contentLabTabLoading = false;
                await render();
            }
        }
    };

    /**
     * 功能：刷新向量实验室快照。
     * @returns 异步完成。
     */
    const refreshVectorSnapshot = async (): Promise<void> => {
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
            if (currentSequence === vectorLoadSequence) {
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
        if (view === 'preview' && !state.previewTabLoaded && !state.previewTabLoading) {
            await refreshPreviewSnapshot();
            return;
        }
        if (view === 'vectors' && !state.vectorTabLoaded && !state.vectorTabLoading) {
            await refreshVectorSnapshot();
            return;
        }
        if (view === 'content-lab' && !state.contentLabTabLoaded && !state.contentLabTabLoading) {
            await loadContentLabSnapshot();
        }
    };

    /**
     * 功能：后台刷新旧聊天处理进度，避免切页时同步卡顿。
     * @returns 异步完成。
     */
    const refreshTakeoverProgress = async (): Promise<void> => {
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
            if (currentSequence === takeoverProgressSequence) {
                state.takeoverProgressLoading = false;
                await render();
            }
        }
    };

    const render = async (): Promise<void> => {
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
