import {
    buildSdkChatKeyEvent,
    getCurrentTavernCharacterEvent,
    getTavernMessageTextEvent,
    getTavernRuntimeContextEvent,
    getCurrentTavernUserSnapshotEvent,
    getTavernSemanticSnapshotEvent,
    loadTavernWorldbookEntriesEvent,
    resolveTavernCharacterWorldbookBindingEvent,
    type SdkTavernPromptMessageEvent,
} from '../../../SDK/tavern';
import type { EventEnvelope } from '../../../SDK/stx';
import { EventsManager } from '../core/events-manager';
import {
    buildCityCompareKey,
    buildCompareKey,
    buildEventCompareKey,
    buildLocationCompareKey,
    buildNationCompareKey,
    buildOrganizationCompareKey,
    buildRelationshipRecordId,
    buildTaskCompareKey,
    buildWorldStateCompareKey,
} from '../core/compare-key';
import { CompareKeyService } from '../core/compare-key-service';
import { resolveLedgerUpdateDecision } from '../core/ledger-update-rules';
import { normalizeTaskTitle } from '../core/task-title-normalizer';
import { normalizeTaskDescription } from '../core/task-description-normalizer';
import { type MemoryForgettingTier } from '../core/memory-forgetting';
import { projectMemoryRetentionCore, type MemoryRetentionProjection } from '../core/memory-retention-core';
import { EntryRepository } from '../repository/entry-repository';
import { normalizeRelationTag } from '../constants/relationTags';
import { projectMemorySemanticRecord, type MemorySemanticKind } from '../core/memory-semantic';
import { logger } from '../runtime/runtime-services';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readMemoryLLMApi, registerMemoryLLMTasks } from '../memory-summary';
import {
    applyBootstrapCandidates,
    runBootstrapOrchestrator,
    type ColdStartCandidate,
    type ColdStartDocument,
    type ColdStartSourceBundle,
} from '../memory-bootstrap';
import {
    clearMemoryChatData,
    exportMemoryChatDatabaseSnapshot,
    exportMemoryPromptTestBundle,
    importMemoryPromptTestBundle,
    readMemoryOSChatState,
    type ImportMemoryPromptTestBundleResult,
    type MemoryChatDatabaseSnapshot,
    type MemoryPromptParityBaseline,
    type MemoryPromptTestBundle,
    type PromptReadyCaptureSnapshot,
    restoreArchivedMemoryChat,
    saveMemoryTakeoverPreview,
    writeMemoryOSChatState,
} from '../db/db';
import { readMemoryOSSettings, writeMemoryOSSettings } from '../settings/store';
import { normalizeUserNarrativeText, resolveCurrentNarrativeUserName } from '../utils/narrative-user-name';
import type { ContentLabSettings } from '../config/content-tag-registry';
import { PromptAssemblyService } from '../services/prompt-assembly-service';
import { SummaryService } from '../services/summary-service';
import { TakeoverService } from '../services/takeover-service';
import { DreamingService, type DreamExecutionContext } from '../services/dreaming-service';
import { DreamRollbackService } from '../services/dream-rollback-service';
import type {
    DreamMaintenanceProposalRecord,
    DreamQualityReport,
    DreamSchedulerStateRecord,
    DreamSessionRecord,
    DreamTriggerReason,
} from '../services/dream-types';
import { getSharedEmbeddingService, getSharedRetrievalService, getSharedVectorStore, isVectorRuntimeReady } from '../runtime/vector-runtime';
import { rebuildAllEmbeddings, rebuildAllVectorDocuments, onActorSaved, onEntrySaved, onRelationshipSaved, onSummarySaved } from '../services/vector-index-service';
import {
    buildNarrativeReferenceLookupKey,
    renderNarrativeReferenceText,
    stripNarrativeReferencePrefix,
    type NarrativeReferenceRendererContext,
} from '../utils/narrative-reference-renderer';
import type { RawFloorRecord } from '../memory-takeover/content-block-pipeline';
import type {
    LedgerMutation,
    ActorDisplayNameSource,
    ActorMemoryProfile,
    MemoryEntry,
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBindings,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    PromptAssemblySnapshot,
    ApplyLedgerMutationBatchResult,
    MemoryTakeoverPayloadPreview,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverProgressSnapshot,
    MemoryTakeoverRelationshipCard,
    MemoryRelationshipRecord,
    RoleEntryMemory,
    SummarySnapshot,
    WorldProfileBinding,
} from '../types';
import type { RetrievalResultItem } from '../memory-retrieval/types';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import type { RetrievalOutputDiagnostics } from '../memory-retrieval/retrieval-output';
import type { DBMemoryVectorDocument, DBMemoryVectorIndex, DBMemoryVectorRecallStat } from '../types/vector-document';
import { openDreamReviewDialog } from '../ui/dream-review-dialog';
import {
    applyManualWorldStrategyOverride,
    buildWorldStrategyExplanationFromDetection,
    resetChatWorldStrategyToAuto,
    resolveChatWorldStrategy,
} from '../services/world-strategy-service';
import { detectWorldProfile } from '../memory-world-profile';

const AUTO_SUMMARY_MESSAGE_EVENT_TYPES: string[] = ['chat.message.sent', 'chat.message.received'];
const AUTO_SUMMARY_MIN_MESSAGE_WINDOW: number = 10;
const AUTO_SUMMARY_MAX_MESSAGE_WINDOW: number = 40;

/**
 * 功能：定义统一记忆提示词注入入参。
 */
export interface UnifiedPromptInjectInput {
    promptMessages: SdkTavernPromptMessageEvent[];
    snapshot: PromptAssemblySnapshot;
    source?: string;
    sourceMessageId?: string;
    trace?: Record<string, unknown>;
}

/**
 * 功能：定义统一记忆提示词注入结果。
 */
export interface UnifiedPromptInjectResult {
    shouldInject: boolean;
    inserted: boolean;
    insertIndex: number;
    promptLength: number;
    insertedLength: number;
    trace: Record<string, unknown> | null;
}

/**
 * 功能：定义测试包导出参数。
 */
export interface ExportPromptTestBundleForTestOptions {
    promptFixture?: Array<Record<string, unknown>>;
    query?: string;
    sourceMessageId?: string;
    settings?: Record<string, unknown>;
    runResult?: Record<string, unknown>;
    parityBaseline?: MemoryPromptParityBaseline;
}

/**
 * 功能：定义冷启动状态快照。
 */
export interface MemoryColdStartStatus {
    hasStarted?: boolean;
    completed: boolean;
    completedAt?: number;
    dismissedAt?: number;
    selectedLorebookEntryIds?: string[];
    lastTriggeredAt?: number;
    lastFailedAt?: number;
    lastReasonCode?: string;
}

/**
 * 功能：定义总结进度快照。
 */
export interface MemorySummaryProgress {
    lastSummarizedIndex: number;
    lastSummarizedMessageId?: string;
    pendingStartIndex: number;
    pendingEndIndex: number;
    lastSummarizedAt?: number;
}

/**
 * 功能：定义自动总结触发状态快照。
 */
export interface MemorySummaryTriggerStatus {
    enabled: boolean;
    currentFloorCount: number;
    summaryIntervalFloors: number;
    summaryMinMessages: number;
    summaryRecentWindowSize: number;
    lastSummarizedIndex: number;
    lastSummarizedMessageId?: string;
    pendingStartIndex: number;
    pendingEndIndex: number;
    nextTriggerFloor: number;
    remainingFloors: number;
    progressCurrent: number;
    progressTarget: number;
    progressRatio: number;
    readyToSummarize: boolean;
    lastSummarizedAt?: number;
}

/**
 * 功能：定义冷启动执行结果。
 */
export interface MemoryColdStartExecutionResult {
    ok: boolean;
    reasonCode: string;
    errorMessage?: string;
    candidates?: ColdStartCandidate[];
    worldProfile?: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
}

/**
 * 功能：定义冷启动时的世界书选择结果。
 */
export interface MemoryColdStartWorldbookSelection {
    selectedWorldbooks: string[];
    selectedEntries: Array<{
        book: string;
        entryId: string;
    }>;
}

/**
 * 功能：定义接管执行结果。
 */
export interface MemoryTakeoverExecutionResult {
    ok: boolean;
    finished: boolean;
    reasonCode: string;
    errorMessage?: string;
    progress: MemoryTakeoverProgressSnapshot | null;
}

/**
 * 功能：定义梦境执行结果。
 */
export interface MemoryDreamExecutionResult {
    ok: boolean;
    dreamId?: string;
    status?: 'generated' | 'approved' | 'rejected' | 'deferred' | 'failed';
    reasonCode?: string;
    errorMessage?: string;
}

/**
 * 功能：定义向量运行时状态快照。
 */
export interface MemoryVectorRuntimeStatus {
    runtimeReady: boolean;
    embeddingAvailable: boolean;
    embeddingUnavailableReason?: string;
    vectorStoreAvailable: boolean;
    vectorStoreUnavailableReason?: string;
    retrievalMode: RetrievalMode;
    embeddingModel?: string;
    embeddingVersion?: string;
    vectorEnableStrategyRouting: boolean;
    vectorEnableRerank: boolean;
    vectorEnableLLMHubRerank: boolean;
}

/**
 * 功能：定义向量文档查询参数。
 */
export interface MemoryVectorDocumentListInput {
    sourceKind?: string;
    status?: string;
    schemaId?: string;
    actorKey?: string;
    query?: string;
    sourceId?: string;
}

/**
 * 功能：定义向量索引统计快照。
 */
export interface MemoryVectorIndexStats {
    documentCount: number;
    readyCount: number;
    pendingCount: number;
    failedCount: number;
    indexCount: number;
    recallStatCount: number;
}

/**
 * 功能：定义向量检索实验输入。
 */
export interface MemoryVectorRetrievalTestInput {
    query: string;
    retrievalMode: RetrievalMode;
    topK?: number;
    deepWindow?: number;
    finalTopK?: number;
    enableStrategyRouting?: boolean;
    enableRerank?: boolean;
    enableLLMHubRerank?: boolean;
    enableGraphExpansion?: boolean;
    filters?: {
        sourceKind?: string;
        schemaId?: string;
        actorKey?: string;
        worldKey?: string;
    };
    onProgress?: (progress: {
        stage: string;
        title: string;
        message: string;
        progress?: number;
    }) => void;
}

/**
 * 功能：定义向量检索实验输出。
 */
export interface MemoryVectorRetrievalTestResult {
    diagnostics: RetrievalOutputDiagnostics;
    items: RetrievalResultItem[];
    providerId: string;
    retrievalMode: RetrievalMode;
}

/**
 * 功能：MemoryOS 统一条目 SDK 门面。
 */
export class MemorySDKImpl {
    private readonly chatKey_: string;
    private readonly eventsManager: EventsManager;
    private readonly entryRepository: EntryRepository;
    private readonly compareKeyService: CompareKeyService;
    private readonly promptAssemblyService: PromptAssemblyService;
    private readonly summaryService: SummaryService;
    private readonly takeoverService: TakeoverService;
    private promptReadyCaptureSnapshot: PromptReadyCaptureSnapshot | null;
    private promptReadyRunResultSnapshot: Record<string, unknown> | null;
    private latestRecallExplanation: Record<string, unknown> | null;
    private llmTasksRegistered: boolean;
    private pendingColdStartDraft: {
        document: ColdStartDocument;
        candidates: ColdStartCandidate[];
        sourceBundle: ColdStartSourceBundle;
    } | null;
    private readonly dreamingService: DreamingService;
    private readonly dreamRollbackService: DreamRollbackService;

    public readonly template: { destroy: () => void };
    public readonly events: {
        append: (
            type: string,
            payload: Record<string, unknown>,
            meta?: { sourceMessageId?: string; sourcePlugin?: string },
        ) => Promise<string>;
        query: (opts: { type?: string; sinceTs?: number; limit?: number }) => Promise<Array<Record<string, unknown>>>;
        getById: (eventId: string) => Promise<Record<string, unknown> | undefined>;
        count: () => Promise<number>;
    };
    public readonly postGeneration: {
        scheduleRoundProcessing: (source?: string, options?: { force?: boolean }) => Promise<void>;
    };
    public readonly chatState: {
        getLatestRecallExplanation: () => Promise<Record<string, unknown> | null>;
        getColdStartStatus: () => Promise<MemoryColdStartStatus>;
        getSummaryProgress: () => Promise<MemorySummaryProgress>;
        getSummaryTriggerStatus: () => Promise<MemorySummaryTriggerStatus>;
        detectTakeoverNeeded: () => Promise<MemoryTakeoverDetectionResult>;
        getTakeoverStatus: () => Promise<MemoryTakeoverProgressSnapshot>;
        previewTakeoverEstimate: (config?: MemoryTakeoverCreateInput) => Promise<MemoryTakeoverPreviewEstimate>;
        previewActualTakeoverPayload: (config?: MemoryTakeoverCreateInput) => Promise<MemoryTakeoverPayloadPreview>;
        createTakeoverPlan: (config?: MemoryTakeoverCreateInput) => Promise<MemoryTakeoverProgressSnapshot>;
        startTakeover: (takeoverId?: string) => Promise<MemoryTakeoverExecutionResult>;
        pauseTakeover: () => Promise<MemoryTakeoverProgressSnapshot>;
        resumeTakeover: () => Promise<MemoryTakeoverExecutionResult>;
        retryFailedBatch: (batchId?: string) => Promise<MemoryTakeoverExecutionResult>;
        runTakeoverConsolidation: () => Promise<MemoryTakeoverExecutionResult>;
        rebuildTakeoverRange: (startFloor: number, endFloor: number, batchSize?: number) => Promise<MemoryTakeoverExecutionResult>;
        abortTakeover: () => Promise<MemoryTakeoverProgressSnapshot>;
        markTakeoverHandled: () => Promise<MemoryTakeoverProgressSnapshot>;
        getContentLabSettings: () => Promise<ContentLabSettings>;
        saveContentLabSettings: (patch: Partial<ContentLabSettings>) => Promise<ContentLabSettings>;
        previewFloorContentBlocks: (input: { floor: number; previewSourceMode?: 'content' | 'raw_visible_text' }) => Promise<RawFloorRecord>;
        previewFloorRangeContentBlocks: (input: { startFloor: number; endFloor: number; previewSourceMode?: 'content' | 'raw_visible_text' }) => Promise<RawFloorRecord[]>;
        setPromptReadyCaptureSnapshotForTest: (snapshot: PromptReadyCaptureSnapshot) => Promise<void>;
        getPromptReadyCaptureSnapshotForTest: () => Promise<PromptReadyCaptureSnapshot | null>;
        setPromptReadyRunResultForTest: (runResult: Record<string, unknown>) => Promise<void>;
        getPromptReadyRunResultForTest: () => Promise<Record<string, unknown> | null>;
        getLatestPromptReadyCaptureSnapshotForTest: () => Promise<PromptReadyCaptureSnapshot | null>;
        exportCurrentChatDatabaseSnapshotForTest: () => Promise<MemoryChatDatabaseSnapshot>;
        exportPromptTestBundleForTest: (options?: ExportPromptTestBundleForTestOptions) => Promise<MemoryPromptTestBundle>;
        importPromptTestBundleForTest: (
            bundle: MemoryPromptTestBundle,
            options?: { targetChatKey?: string; skipClear?: boolean },
        ) => Promise<ImportMemoryPromptTestBundleResult>;
        rebuildLogicalChatView: () => Promise<void>;
        startDreamSession: (reason: DreamTriggerReason, executionContext?: DreamExecutionContext) => Promise<MemoryDreamExecutionResult>;
        primeColdStartPrompt: (
            _reason?: string,
            selection?: MemoryColdStartWorldbookSelection,
        ) => Promise<MemoryColdStartExecutionResult>;
        confirmColdStartCandidates: (selectedCandidateIds: string[]) => Promise<MemoryColdStartExecutionResult>;
        markColdStartDismissed: () => Promise<void>;
        rollbackDreamSession: (dreamId: string) => Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[] }>;
        rollbackDreamMutation: (dreamId: string, mutationId: string) => Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[] }>;
        applyDreamMaintenanceProposal: (proposalId: string) => Promise<{ ok: boolean; reasonCode?: string }>;
        rejectDreamMaintenanceProposal: (proposalId: string) => Promise<{ ok: boolean; reasonCode?: string }>;
        flush: () => Promise<void>;
        destroy: () => Promise<void>;
        restoreArchivedMemoryChat: () => Promise<void>;
        clearCurrentChatData: () => Promise<void>;
    };
    public readonly unifiedMemory: {
        entryTypes: {
            list: ReturnType<EntryRepository['listEntryTypes']> extends Promise<infer R>
                ? () => Promise<R>
                : never;
            save: (input: Parameters<EntryRepository['saveEntryType']>[0]) => ReturnType<EntryRepository['saveEntryType']>;
            remove: (key: string) => Promise<void>;
        };
        entries: {
            list: (filters?: Parameters<EntryRepository['listEntries']>[0]) => ReturnType<EntryRepository['listEntries']>;
            get: (entryId: string) => ReturnType<EntryRepository['getEntry']>;
            save: (input: Parameters<EntryRepository['saveEntry']>[0]) => ReturnType<EntryRepository['saveEntry']>;
            remove: (entryId: string) => Promise<void>;
        };
        actors: {
            list: () => ReturnType<EntryRepository['listActorProfiles']>;
            ensure: (input: Parameters<EntryRepository['ensureActorProfile']>[0]) => ReturnType<EntryRepository['ensureActorProfile']>;
            setMemoryStat: (actorKey: string, memoryStat: number) => ReturnType<EntryRepository['setActorMemoryStat']>;
        };
        roleMemory: {
            list: (actorKey?: string) => ReturnType<EntryRepository['listRoleMemories']>;
            bind: (actorKey: string, entryId: string) => ReturnType<EntryRepository['bindRoleToEntry']>;
            unbind: (actorKey: string, entryId: string) => Promise<void>;
        };
        relationships: {
            list: () => ReturnType<EntryRepository['listRelationships']>;
        };
        summaries: {
            list: (limit?: number) => ReturnType<EntryRepository['listSummarySnapshots']>;
            capture: (input: Parameters<SummaryService['captureSummaryFromChat']>[0]) => ReturnType<SummaryService['captureSummaryFromChat']>;
        };
         diagnostics: {
             getWorldProfileBinding: () => ReturnType<EntryRepository['getWorldProfileBinding']>;
             setWorldProfileBinding: (input: { primaryProfile: string; secondaryProfiles?: string[] }) => Promise<WorldProfileBinding>;
             resetWorldProfileBinding: () => Promise<WorldProfileBinding | null>;
             testWorldProfile: (input: { text: string }) => Promise<{
                 detection: ReturnType<typeof detectWorldProfile>;
                 explanation: ReturnType<typeof buildWorldStrategyExplanationFromDetection>;
             }>;
             listMutationHistory: (limit?: number) => ReturnType<EntryRepository['listMutationHistory']>;
             listEntryAuditRecords: (limit?: number) => ReturnType<EntryRepository['listEntryAuditRecords']>;
             getVectorRuntimeStatus: () => Promise<MemoryVectorRuntimeStatus>;
             listVectorDocuments: (input?: MemoryVectorDocumentListInput) => Promise<DBMemoryVectorDocument[]>;
             listVectorIndexRecords: () => Promise<DBMemoryVectorIndex[]>;
             listVectorRecallStats: () => Promise<DBMemoryVectorRecallStat[]>;
             getVectorIndexStats: () => Promise<MemoryVectorIndexStats>;
             testVectorRetrieval: (input: MemoryVectorRetrievalTestInput) => Promise<MemoryVectorRetrievalTestResult>;
             rebuildAllVectorDocuments: () => Promise<number>;
             rebuildAllEmbeddings: () => Promise<number>;
             clearVectorIndex: () => Promise<void>;
             clearVectorRecallStats: () => Promise<void>;
             clearAllVectorData: () => Promise<void>;
             reindexVectorDocument: (vectorDocId: string) => Promise<void>;
             removeVectorDocument: (vectorDocId: string) => Promise<void>;
             listDreamSessions: (limit?: number) => Promise<DreamSessionRecord[]>;
             getDreamSessionById: (dreamId: string) => Promise<DreamSessionRecord>;
             listDreamMaintenanceProposals: (limit?: number) => Promise<DreamMaintenanceProposalRecord[]>;
             listDreamQualityReports: (limit?: number) => Promise<DreamQualityReport[]>;
             getDreamSchedulerState: () => Promise<DreamSchedulerStateRecord | null>;
             /**
              * 功能：清理当前聊天的全部梦境系统记录。
              * @returns 已删除的记录数量。
              */
             clearAllDreamRecords: () => Promise<number>;
         };
        prompts: {
            preview: (input?: Parameters<PromptAssemblyService['buildPromptAssembly']>[0]) => ReturnType<PromptAssemblyService['buildPromptAssembly']>;
            inject: (input: UnifiedPromptInjectInput) => Promise<UnifiedPromptInjectResult>;
        };
    };

    /**
     * 功能：构造统一记忆 SDK。
     * @param chatKey 聊天键。
     */
    constructor(chatKey: string) {
        this.chatKey_ = String(chatKey ?? '').trim();
        this.eventsManager = new EventsManager(this.chatKey_);
        this.compareKeyService = new CompareKeyService();
        this.entryRepository = new EntryRepository(this.chatKey_, this.compareKeyService);
        this.promptAssemblyService = new PromptAssemblyService(this.chatKey_, this.entryRepository, this.compareKeyService);
        this.summaryService = new SummaryService(this.chatKey_, this.entryRepository);
        this.takeoverService = new TakeoverService(this.chatKey_, this.entryRepository);
        this.dreamingService = new DreamingService({
            chatKey: this.chatKey_,
            repository: this.entryRepository,
            getLLM: () => readMemoryLLMApi(),
            pluginId: MEMORY_OS_PLUGIN_ID,
            readRecentMessages: async () => this.readSummaryMessagesForDream(),
            openReviewDialog: openDreamReviewDialog,
        });
        this.dreamRollbackService = new DreamRollbackService({
            chatKey: this.chatKey_,
            repository: this.entryRepository,
        });
        this.promptReadyCaptureSnapshot = null;
        this.promptReadyRunResultSnapshot = null;
        this.latestRecallExplanation = null;
        this.llmTasksRegistered = false;
        this.pendingColdStartDraft = null;

        this.template = {
            destroy: (): void => {
                return;
            },
        };

        this.events = {
            append: async (
                type: string,
                payload: Record<string, unknown>,
                meta?: { sourceMessageId?: string; sourcePlugin?: string },
            ): Promise<string> => {
                return this.eventsManager.append(type, payload, meta);
            },
            query: async (opts: { type?: string; sinceTs?: number; limit?: number }): Promise<Array<Record<string, unknown>>> => {
                const rows = await this.eventsManager.query(opts);
                return rows.map((row: EventEnvelope<unknown>): Record<string, unknown> => ({ ...row }));
            },
            getById: async (eventId: string): Promise<Record<string, unknown> | undefined> => {
                const row = await this.eventsManager.getById(eventId);
                return row ? ({ ...row } as Record<string, unknown>) : undefined;
            },
            count: async (): Promise<number> => {
                return this.eventsManager.count();
            },
        };

        this.postGeneration = {
            scheduleRoundProcessing: async (_source?: string, options?: { force?: boolean }): Promise<void> => {
                const settings = readMemoryOSSettings();
                if (!settings.summaryAutoTriggerEnabled && options?.force !== true) {
                    return;
                }
                const summaryIntervalFloors: number = Math.max(
                    1,
                    Math.trunc(Number(settings.summaryIntervalFloors) || 1),
                );
                const summaryMinMessages: number = Math.max(
                    2,
                    Math.trunc(Number(settings.summaryMinMessages) || AUTO_SUMMARY_MIN_MESSAGE_WINDOW),
                );
                const summaryRecentWindowSize: number = Math.max(
                    AUTO_SUMMARY_MIN_MESSAGE_WINDOW,
                    Math.min(AUTO_SUMMARY_MAX_MESSAGE_WINDOW, Math.trunc(Number(settings.summaryRecentWindowSize) || AUTO_SUMMARY_MAX_MESSAGE_WINDOW)),
                );
                const hostMessages = this.readActiveHostChatMessages();
                const messageFloorCount: number = hostMessages.length > 0
                    ? hostMessages.length
                    : await this.eventsManager.countByTypes(AUTO_SUMMARY_MESSAGE_EVENT_TYPES);
                if (messageFloorCount <= 0) {
                    return;
                }

                if (options?.force !== true) {
                    const stateRow = await readMemoryOSChatState(this.chatKey_);
                    const state = this.toRecord(stateRow?.state);
                    const lastSummaryFloorCount: number = Math.max(
                        0,
                        Math.trunc(Number(state.summaryLastSummarizedIndex ?? state.autoSummaryLastFloorCount) || 0),
                    );
                    if (messageFloorCount - lastSummaryFloorCount < summaryIntervalFloors) {
                        return;
                    }
                    if (messageFloorCount < summaryMinMessages) {
                        return;
                    }
                }

                const messageWindowLimit: number = Math.max(
                    summaryMinMessages,
                    Math.min(summaryRecentWindowSize, summaryIntervalFloors),
                );
                const stateRow = await readMemoryOSChatState(this.chatKey_);
                const state = this.toRecord(stateRow?.state);
                const lastSummarizedIndex = Math.max(
                    0,
                    Math.trunc(Number(state.summaryLastSummarizedIndex ?? state.autoSummaryLastFloorCount) || 0),
                );
                const pendingEndIndex = messageFloorCount;
                const messages = hostMessages.length > 0
                    ? hostMessages.slice(-messageWindowLimit)
                    : await this.readSummaryMessagesFromEvents(pendingEndIndex, messageWindowLimit);
                if (messages.length <= 0) {
                    return;
                }
                const snapshot = await this.summaryService.captureSummaryFromChat({ messages });
                if (!snapshot) {
                    return;
                }
                await this.refreshVectorIndexAfterPipeline('自动总结');
                const lastSummarizedMessageId = hostMessages.length > 0
                    ? undefined
                    : await this.readLastSummarizedMessageIdFromEvents(messageWindowLimit);
                await this.writeColdStartState({
                    autoSummaryLastFloorCount: messageFloorCount,
                    autoSummaryLastTriggeredAt: Date.now(),
                    summaryLastSummarizedIndex: pendingEndIndex,
                    summaryLastSummarizedMessageId: lastSummarizedMessageId,
                    summaryPendingStartIndex: pendingEndIndex + 1,
                    summaryPendingEndIndex: pendingEndIndex,
                    summaryLastSummarizedAt: Date.now(),
                });
            },
        };

        this.chatState = {
            getLatestRecallExplanation: async (): Promise<Record<string, unknown> | null> => {
                return this.latestRecallExplanation ? { ...this.latestRecallExplanation } : null;
            },
            getColdStartStatus: async (): Promise<MemoryColdStartStatus> => {
                return this.readColdStartStatus();
            },
            getSummaryProgress: async (): Promise<MemorySummaryProgress> => {
                return this.readSummaryProgress();
            },
            getSummaryTriggerStatus: async (): Promise<MemorySummaryTriggerStatus> => {
                return this.readSummaryTriggerStatus();
            },
            detectTakeoverNeeded: async (): Promise<MemoryTakeoverDetectionResult> => {
                const currentFloorCount = await this.readCurrentSummaryFloorCount();
                return this.takeoverService.detectNeeded(currentFloorCount, await this.takeoverService.readPlan());
            },
            getTakeoverStatus: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                return this.takeoverService.buildProgress();
            },
            previewTakeoverEstimate: async (config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverPreviewEstimate> => {
                return this.takeoverService.previewEstimate(config);
            },
            previewActualTakeoverPayload: async (config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverPayloadPreview> => {
                return this.takeoverService.previewActualTakeoverPayload(
                    config,
                    await this.readTakeoverExistingKnownEntities(),
                );
            },
            createTakeoverPlan: async (config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverProgressSnapshot> => {
                return this.takeoverService.createPlanSnapshot(await this.readCurrentSummaryFloorCount(), config);
            },
            startTakeover: async (takeoverId?: string): Promise<MemoryTakeoverExecutionResult> => {
                this.tryRegisterLLMTasks();
                const progress = await this.takeoverService.startTakeover({
                    currentFloorCount: await this.readCurrentSummaryFloorCount(),
                    takeoverId,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result, { alignSummaryProgress: true });
                    },
                });
                return this.toTakeoverExecutionResult(progress, 'missing_plan');
            },
            pauseTakeover: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                return this.takeoverService.pauseTakeover();
            },
            resumeTakeover: async (): Promise<MemoryTakeoverExecutionResult> => {
                const progress = await this.takeoverService.resumeTakeover({
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    skipInitialWait: true,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result, { alignSummaryProgress: true });
                    },
                });
                if (!progress) {
                    return {
                        ok: false,
                        finished: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可恢复的旧聊天处理计划。',
                        progress: null,
                    };
                }
                return this.toTakeoverExecutionResult(progress, 'ok');
            },
            retryFailedBatch: async (batchId?: string): Promise<MemoryTakeoverExecutionResult> => {
                const progress = await this.takeoverService.retryFailedBatch({
                    batchId,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    skipInitialWait: true,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result, { alignSummaryProgress: true });
                    },
                });
                if (!progress) {
                    return {
                        ok: false,
                        finished: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可恢复的旧聊天处理计划。',
                        progress: null,
                    };
                }
                return this.toTakeoverExecutionResult(progress, 'ok');
            },
            runTakeoverConsolidation: async (): Promise<MemoryTakeoverExecutionResult> => {
                const progress = await this.takeoverService.runStoredConsolidation({
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result, { alignSummaryProgress: true });
                    },
                });
                if (!progress) {
                    return {
                        ok: false,
                        finished: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可整合的旧聊天处理计划。',
                        progress: null,
                    };
                }
                return this.toTakeoverExecutionResult(progress, 'ok');
            },
            rebuildTakeoverRange: async (startFloor: number, endFloor: number, batchSize?: number): Promise<MemoryTakeoverExecutionResult> => {
                const snapshot = await this.takeoverService.createPlanSnapshot(await this.readCurrentSummaryFloorCount(), {
                    mode: 'custom_range',
                    startFloor,
                    endFloor,
                    batchSize,
                });
                if (!snapshot.plan) {
                    return {
                        ok: false,
                        finished: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可重建区间的旧聊天处理计划。',
                        progress: snapshot,
                    };
                }
                const progress = await this.takeoverService.runPlan(snapshot.plan, {
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result, { alignSummaryProgress: false });
                    },
                });
                return this.toTakeoverExecutionResult(progress, 'ok');
            },
            abortTakeover: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                return this.takeoverService.abortTakeover();
            },
            markTakeoverHandled: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                return this.takeoverService.markAsHandled(await this.readCurrentSummaryFloorCount());
            },
            getContentLabSettings: async (): Promise<ContentLabSettings> => {
                return this.takeoverService.readContentLabSettings();
            },
            saveContentLabSettings: async (patch: Partial<ContentLabSettings>): Promise<ContentLabSettings> => {
                return this.takeoverService.saveContentLabSettings(patch);
            },
            previewFloorContentBlocks: async (input: { floor: number; previewSourceMode?: 'content' | 'raw_visible_text' }): Promise<RawFloorRecord> => {
                this.tryRegisterLLMTasks();
                return this.takeoverService.previewFloorContentBlocks({
                    floor: input.floor,
                    previewSourceMode: input.previewSourceMode,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                });
            },
            previewFloorRangeContentBlocks: async (input: { startFloor: number; endFloor: number; previewSourceMode?: 'content' | 'raw_visible_text' }): Promise<RawFloorRecord[]> => {
                this.tryRegisterLLMTasks();
                return this.takeoverService.previewFloorRangeContentBlocks({
                    startFloor: input.startFloor,
                    endFloor: input.endFloor,
                    previewSourceMode: input.previewSourceMode,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                });
            },
            setPromptReadyCaptureSnapshotForTest: async (snapshot: PromptReadyCaptureSnapshot): Promise<void> => {
                this.promptReadyCaptureSnapshot = {
                    ...snapshot,
                    promptFixture: Array.isArray(snapshot.promptFixture) ? snapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })) : [],
                };
            },
            getPromptReadyCaptureSnapshotForTest: async (): Promise<PromptReadyCaptureSnapshot | null> => {
                if (!this.promptReadyCaptureSnapshot) {
                    return null;
                }
                return {
                    ...this.promptReadyCaptureSnapshot,
                    promptFixture: this.promptReadyCaptureSnapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })),
                };
            },
            /**
             * 功能：缓存最近一次 prompt-ready 的运行结果。
             * @param runResult 运行结果。
             * @returns 异步完成。
             */
            setPromptReadyRunResultForTest: async (runResult: Record<string, unknown>): Promise<void> => {
                this.promptReadyRunResultSnapshot = { ...runResult };
            },
            /**
             * 功能：读取最近一次 prompt-ready 的运行结果。
             * @returns 运行结果快照。
             */
            getPromptReadyRunResultForTest: async (): Promise<Record<string, unknown> | null> => {
                if (!this.promptReadyRunResultSnapshot) {
                    return null;
                }
                return { ...this.promptReadyRunResultSnapshot };
            },
            /**
             * 功能：读取最近一次 prompt-ready 抓包快照。
             * @returns 抓包快照。
             */
            getLatestPromptReadyCaptureSnapshotForTest: async (): Promise<PromptReadyCaptureSnapshot | null> => {
                if (!this.promptReadyCaptureSnapshot) {
                    return null;
                }
                return {
                    ...this.promptReadyCaptureSnapshot,
                    promptFixture: this.promptReadyCaptureSnapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })),
                };
            },
            /**
             * 功能：导出当前会话数据库快照。
             * @returns 数据库快照。
             */
            exportCurrentChatDatabaseSnapshotForTest: async (): Promise<MemoryChatDatabaseSnapshot> => {
                return exportMemoryChatDatabaseSnapshot(this.chatKey_);
            },
            /**
             * 功能：导出 Prompt 测试包。
             * @param options 导出参数。
             * @returns 测试包结果。
             */
            exportPromptTestBundleForTest: async (options: ExportPromptTestBundleForTestOptions = {}): Promise<MemoryPromptTestBundle> => {
                const resolvedRunResult = options.runResult ?? this.promptReadyRunResultSnapshot ?? undefined;
                const resolvedParityBaseline = options.parityBaseline ?? this.resolveParityBaselineFromRunResult(resolvedRunResult);
                return exportMemoryPromptTestBundle(this.chatKey_, {
                    promptFixture: options.promptFixture,
                    captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
                    query: options.query,
                    sourceMessageId: options.sourceMessageId,
                    settings: options.settings,
                    runResult: resolvedRunResult,
                    parityBaseline: resolvedParityBaseline,
                });
            },
            importPromptTestBundleForTest: async (
                bundle: MemoryPromptTestBundle,
                options?: { targetChatKey?: string; skipClear?: boolean },
            ): Promise<ImportMemoryPromptTestBundleResult> => {
                return importMemoryPromptTestBundle(bundle, options);
            },
            rebuildLogicalChatView: async (): Promise<void> => {
                return;
            },
            startDreamSession: async (reason: DreamTriggerReason, executionContext?: DreamExecutionContext): Promise<MemoryDreamExecutionResult> => {
                this.tryRegisterLLMTasks();
                const result = await this.dreamingService.startDreamSession(reason, executionContext);
                if (result.ok && result.status === 'approved') {
                    await this.refreshVectorIndexAfterPipeline('梦境审批写回');
                }
                return result;
            },
            rollbackDreamSession: async (dreamId: string): Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[] }> => {
                const result = await this.dreamRollbackService.rollbackDreamSession(dreamId);
                if (result.ok) {
                    await this.refreshVectorIndexAfterPipeline('梦境回滚');
                }
                return result;
            },
            rollbackDreamMutation: async (dreamId: string, mutationId: string): Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[] }> => {
                const result = await this.dreamRollbackService.rollbackDreamMutation(dreamId, mutationId);
                if (result.ok) {
                    await this.refreshVectorIndexAfterPipeline('梦境单条 mutation 回滚');
                }
                return result;
            },
            applyDreamMaintenanceProposal: async (proposalId: string): Promise<{ ok: boolean; reasonCode?: string }> => {
                const { DreamSessionRepository } = await import('../services/dream-session-repository');
                const repository = new DreamSessionRepository(this.chatKey_);
                const proposals = await repository.listDreamMaintenanceProposals(100);
                const target = proposals.find((p) => p.proposalId === proposalId);
                if (!target) {
                    return { ok: false, reasonCode: 'proposal_not_found' };
                }
                if (target.status !== 'pending') {
                    return { ok: false, reasonCode: 'proposal_not_pending' };
                }
                const { DreamMaintenancePlanner } = await import('../services/dream-maintenance-planner');
                const planner = new DreamMaintenancePlanner({
                    chatKey: this.chatKey_,
                    repository: this.entryRepository,
                });
                const result = await planner.applyDreamMaintenanceProposal(target);
                if (result.status === 'applied') {
                    await this.refreshVectorIndexAfterPipeline('维护提案应用');
                }
                return { ok: result.status === 'applied', reasonCode: result.status !== 'applied' ? 'apply_failed' : undefined };
            },
            rejectDreamMaintenanceProposal: async (proposalId: string): Promise<{ ok: boolean; reasonCode?: string }> => {
                const { DreamSessionRepository } = await import('../services/dream-session-repository');
                const repository = new DreamSessionRepository(this.chatKey_);
                const proposals = await repository.listDreamMaintenanceProposals(100);
                const target = proposals.find((p) => p.proposalId === proposalId);
                if (!target) {
                    return { ok: false, reasonCode: 'proposal_not_found' };
                }
                if (target.status !== 'pending') {
                    return { ok: false, reasonCode: 'proposal_not_pending' };
                }
                await repository.saveDreamMaintenanceProposal({
                    ...target,
                    status: 'rejected',
                    updatedAt: Date.now(),
                });
                return { ok: true };
            },
            primeColdStartPrompt: async (
                _reason?: string,
                selection?: MemoryColdStartWorldbookSelection,
            ): Promise<MemoryColdStartExecutionResult> => {
                const triggerTs: number = Date.now();
                const selectedLorebookEntryIds = (selection?.selectedEntries ?? []).map((item) => `${item.book}:${item.entryId}`);
                const stateRow = await readMemoryOSChatState(this.chatKey_);
                const state = this.toRecord(stateRow?.state);
                const persistedResumeRunId = this.toOptionalText(state.coldStartResumeRunId);
                const persistedResumeSourceBundle = this.readColdStartResumeSourceBundle(state.coldStartResumeSourceBundle);
                await this.writeColdStartState({
                    coldStartHasStarted: true,
                    coldStartLastTriggeredAt: triggerTs,
                    coldStartLastReason: String(_reason ?? '').trim() || undefined,
                    coldStartSelectedLorebookEntryIds: selectedLorebookEntryIds,
                });
                const llm = readMemoryLLMApi();
                if (!llm) {
                    await this.writeColdStartState({
                        coldStartLastFailedAt: Date.now(),
                        coldStartLastReasonCode: 'llm_unavailable',
                    });
                    return {
                        ok: false,
                        reasonCode: 'llm_unavailable',
                        errorMessage: '当前未连接可用的 LLMHub 服务。',
                    };
                }
                const sourceBundle = persistedResumeRunId && persistedResumeSourceBundle
                    ? persistedResumeSourceBundle
                    : await this.collectColdStartSourceBundle(_reason, selection);
                const result = await runBootstrapOrchestrator({
                    dependencies: {
                        ensureActorProfile: async (input): Promise<unknown> => this.entryRepository.ensureActorProfile(input),
                        applyLedgerMutationBatch: async (mutations, context): Promise<any> => this.entryRepository.applyLedgerMutationBatch(mutations, {
                            ...context,
                            chatKey: this.chatKey_,
                        }),
                        putWorldProfileBinding: async (binding): Promise<unknown> => this.entryRepository.putWorldProfileBinding(binding),
                        getTimelineProfile: async () => this.entryRepository.getTimelineProfile(),
                        putTimelineProfile: async (profile) => this.entryRepository.putTimelineProfile(profile),
                        appendMutationHistory: async (history): Promise<unknown> => this.entryRepository.appendMutationHistory(history),
                    },
                    llm,
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    sourceBundle,
                    runId: persistedResumeRunId || undefined,
                });
                if (!result.ok) {
                    this.pendingColdStartDraft = null;
                    await this.writeColdStartState({
                        coldStartLastFailedAt: Date.now(),
                        coldStartLastReasonCode: result.reasonCode,
                        coldStartResumeRunId: result.runId,
                        coldStartResumeSourceBundle: sourceBundle,
                    });
                    logger.warn(`[MemoryOS] 冷启动执行失败: ${result.reasonCode}`);
                    return {
                        ok: false,
                        reasonCode: result.reasonCode,
                        errorMessage: result.errorMessage,
                    };
                }
                this.pendingColdStartDraft = result.document && result.candidates
                    ? {
                        document: result.document,
                        candidates: result.candidates,
                        sourceBundle,
                    }
                    : null;
                await this.writeColdStartState({
                    coldStartGeneratedAt: Date.now(),
                    coldStartLastFailedAt: undefined,
                    coldStartLastReasonCode: undefined,
                    coldStartResumeRunId: undefined,
                    coldStartResumeSourceBundle: undefined,
                });
                return {
                    ok: true,
                    reasonCode: result.reasonCode,
                    candidates: result.candidates,
                    worldProfile: result.worldProfile,
                };
            },
            confirmColdStartCandidates: async (selectedCandidateIds: string[]): Promise<MemoryColdStartExecutionResult> => {
                if (!this.pendingColdStartDraft) {
                    return {
                        ok: false,
                        reasonCode: 'cold_start_draft_missing',
                        errorMessage: '当前没有可确认的冷启动草稿，请先重新生成一次。',
                    };
                }
                const selectedIdSet = new Set(
                    (Array.isArray(selectedCandidateIds) ? selectedCandidateIds : [])
                        .map((item: unknown): string => String(item ?? '').trim())
                        .filter(Boolean),
                );
                const selectedCandidates = this.pendingColdStartDraft.candidates.filter((candidate: ColdStartCandidate): boolean => {
                    return selectedIdSet.size <= 0 || selectedIdSet.has(candidate.id);
                });
                if (selectedCandidates.length <= 0) {
                    return {
                        ok: false,
                        reasonCode: 'no_cold_start_candidate_selected',
                        errorMessage: '当前没有选中任何冷启动候选内容。',
                    };
                }
                const applied = await applyBootstrapCandidates({
                    dependencies: {
                        ensureActorProfile: async (input): Promise<unknown> => this.entryRepository.ensureActorProfile(input),
                        applyLedgerMutationBatch: async (mutations, context): Promise<any> => this.entryRepository.applyLedgerMutationBatch(mutations, {
                            ...context,
                            chatKey: this.chatKey_,
                        }),
                        putWorldProfileBinding: async (binding): Promise<unknown> => this.entryRepository.putWorldProfileBinding(binding),
                        getTimelineProfile: async () => this.entryRepository.getTimelineProfile(),
                        putTimelineProfile: async (profile) => this.entryRepository.putTimelineProfile(profile),
                        appendMutationHistory: async (history): Promise<unknown> => this.entryRepository.appendMutationHistory(history),
                    },
                    document: this.pendingColdStartDraft.document,
                    sourceBundle: this.pendingColdStartDraft.sourceBundle,
                    selectedCandidates,
                });
                await this.refreshVectorIndexAfterPipeline('冷启动');
                this.pendingColdStartDraft = null;
                await this.writeColdStartState({
                    coldStartCompletedAt: Date.now(),
                    coldStartConfirmedAt: Date.now(),
                    coldStartDismissedAt: undefined,
                    coldStartSelectedCandidateIds: selectedCandidates.map((candidate: ColdStartCandidate): string => candidate.id),
                    coldStartResumeRunId: undefined,
                    coldStartResumeSourceBundle: undefined,
                });
                return {
                    ok: true,
                    reasonCode: 'ok',
                    worldProfile: applied.worldProfile,
                };
            },
            markColdStartDismissed: async (): Promise<void> => {
                this.pendingColdStartDraft = null;
                await this.writeColdStartState({
                    coldStartDismissedAt: Date.now(),
                    coldStartResumeRunId: undefined,
                    coldStartResumeSourceBundle: undefined,
                });
            },
            flush: async (): Promise<void> => {
                return;
            },
            destroy: async (): Promise<void> => {
                return;
            },
            restoreArchivedMemoryChat: async (): Promise<void> => {
                await restoreArchivedMemoryChat(this.chatKey_);
            },
            clearCurrentChatData: async (): Promise<void> => {
                await clearMemoryChatData(this.chatKey_, { includeAudit: true });
            },
        };

        this.unifiedMemory = {
            entryTypes: {
                list: async () => this.entryRepository.listEntryTypes(),
                save: async (input: Parameters<EntryRepository['saveEntryType']>[0]) => this.entryRepository.saveEntryType(input),
                remove: async (key: string) => this.entryRepository.deleteEntryType(key),
            },
            entries: {
                list: async (filters?: Parameters<EntryRepository['listEntries']>[0]) => this.entryRepository.listEntries(filters),
                get: async (entryId: string) => this.entryRepository.getEntry(entryId),
                save: async (input: Parameters<EntryRepository['saveEntry']>[0]) => this.entryRepository.saveEntry(input),
                remove: async (entryId: string) => this.entryRepository.deleteEntry(entryId),
            },
            actors: {
                list: async () => this.entryRepository.listActorProfiles(),
                ensure: async (input: Parameters<EntryRepository['ensureActorProfile']>[0]) => this.entryRepository.ensureActorProfile(input),
                setMemoryStat: async (actorKey: string, memoryStat: number) => this.entryRepository.setActorMemoryStat(actorKey, memoryStat),
            },
            roleMemory: {
                list: async (actorKey?: string) => this.entryRepository.listRoleMemories(actorKey),
                bind: async (actorKey: string, entryId: string) => this.entryRepository.bindRoleToEntry(actorKey, entryId),
                unbind: async (actorKey: string, entryId: string) => this.entryRepository.unbindRoleFromEntry(actorKey, entryId),
            },
            relationships: {
                list: async () => this.entryRepository.listRelationships(),
            },
            summaries: {
                list: async (limit?: number) => this.entryRepository.listSummarySnapshots(limit),
                capture: async (input: Parameters<SummaryService['captureSummaryFromChat']>[0]) => {
                    const snapshot = await this.summaryService.captureSummaryFromChat(input);
                    if (snapshot) {
                        await this.alignSummaryProgressToCurrentFloor();
                        await this.refreshVectorIndexAfterPipeline('手动总结');
                    }
                    return snapshot;
                },
            },
            diagnostics: {
                getWorldProfileBinding: async () => this.entryRepository.getWorldProfileBinding(),
                setWorldProfileBinding: async (input): Promise<WorldProfileBinding> => {
                    const strategy = await applyManualWorldStrategyOverride({
                        repository: this.entryRepository,
                        primaryProfile: input.primaryProfile,
                        secondaryProfiles: input.secondaryProfiles,
                        detectedFrom: ['workbench_manual_override'],
                    });
                    await this.entryRepository.appendMutationHistory({
                        action: 'world_profile_bound',
                        payload: {
                            source: 'workbench_manual_override',
                            primaryProfile: strategy.explanation.profileId,
                            secondaryProfiles: strategy.detection.secondaryProfiles,
                            confidence: strategy.explanation.confidence,
                            reasonCodes: strategy.explanation.reasonCodes,
                            bindingMode: strategy.explanation.bindingMode,
                        },
                    });
                    return strategy.binding as WorldProfileBinding;
                },
                resetWorldProfileBinding: async (): Promise<WorldProfileBinding | null> => {
                    const entries = await this.entryRepository.listEntries();
                    const strategy = await resetChatWorldStrategyToAuto({
                        repository: this.entryRepository,
                        texts: entries.slice(0, 80).map((entry) => `${entry.title} ${entry.summary}`),
                        detectedFrom: entries.slice(0, 20).map((entry) => `${entry.title} ${entry.summary}`),
                    });
                    await this.entryRepository.appendMutationHistory({
                        action: 'world_profile_bound',
                        payload: {
                            source: 'workbench_reset_auto',
                            primaryProfile: strategy.explanation.profileId,
                            secondaryProfiles: strategy.detection.secondaryProfiles,
                            confidence: strategy.explanation.confidence,
                            reasonCodes: strategy.explanation.reasonCodes,
                            bindingMode: strategy.explanation.bindingMode,
                        },
                    });
                    return strategy.binding;
                },
                testWorldProfile: async (input: { text: string }) => {
                    const normalizedText = String(input.text ?? '').trim();
                    const detection = detectWorldProfile({
                        signals: [{
                            text: normalizedText,
                            sourceType: 'query',
                            weight: 1.5,
                        }],
                    });
                    return {
                        detection,
                        explanation: buildWorldStrategyExplanationFromDetection(detection),
                    };
                },
                listMutationHistory: async (limit?: number) => this.entryRepository.listMutationHistory(limit),
                listEntryAuditRecords: async (limit?: number) => this.entryRepository.listEntryAuditRecords(limit),
                getVectorRuntimeStatus: async (): Promise<MemoryVectorRuntimeStatus> => this.readVectorRuntimeStatus(),
                listVectorDocuments: async (input?: MemoryVectorDocumentListInput): Promise<DBMemoryVectorDocument[]> => this.listVectorDocumentsForWorkbench(input),
                listVectorIndexRecords: async (): Promise<DBMemoryVectorIndex[]> => this.entryRepository.listVectorIndexRecords(),
                listVectorRecallStats: async (): Promise<DBMemoryVectorRecallStat[]> => this.entryRepository.listVectorRecallStats(),
                getVectorIndexStats: async (): Promise<MemoryVectorIndexStats> => this.getVectorIndexStats(),
                testVectorRetrieval: async (input: MemoryVectorRetrievalTestInput): Promise<MemoryVectorRetrievalTestResult> => {
                    return this.testVectorRetrieval(input);
                },
                rebuildAllVectorDocuments: async (): Promise<number> => this.rebuildAllVectorDocumentsForCurrentChat(),
                rebuildAllEmbeddings: async (): Promise<number> => this.rebuildAllEmbeddingsForCurrentChat(),
                clearVectorIndex: async (): Promise<void> => {
                    await this.entryRepository.clearVectorIndexForChat();
                },
                clearVectorRecallStats: async (): Promise<void> => {
                    await this.entryRepository.clearVectorRecallStatsForChat();
                },
                clearAllVectorData: async (): Promise<void> => {
                    await this.entryRepository.clearVectorDataForChat();
                },
                reindexVectorDocument: async (vectorDocId: string): Promise<void> => {
                    await this.reindexVectorDocument(vectorDocId);
                },
                removeVectorDocument: async (vectorDocId: string): Promise<void> => {
                    await this.removeVectorDocument(vectorDocId);
                },
                listDreamSessions: async (limit?: number): Promise<DreamSessionRecord[]> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    const metas = await repository.listDreamSessionMetas(limit ?? 20);
                    return Promise.all(metas.map((meta) => repository.getDreamSessionById(meta.dreamId)));
                },
                getDreamSessionById: async (dreamId: string): Promise<DreamSessionRecord> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    return repository.getDreamSessionById(dreamId);
                },
                listDreamMaintenanceProposals: async (limit?: number): Promise<DreamMaintenanceProposalRecord[]> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    return repository.listDreamMaintenanceProposals(limit ?? 40);
                },
                listDreamQualityReports: async (limit?: number): Promise<DreamQualityReport[]> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    return repository.listDreamQualityReports(limit ?? 20);
                },
                getDreamSchedulerState: async (): Promise<DreamSchedulerStateRecord | null> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    return repository.getDreamSchedulerState();
                },
                /**
                 * 功能：清理当前聊天的全部梦境系统记录。
                 * @returns 已删除的记录数量。
                 */
                clearAllDreamRecords: async (): Promise<number> => {
                    const repository = new (await import('../services/dream-session-repository')).DreamSessionRepository(this.chatKey_);
                    return repository.clearAllDreamRecords();
                },
            },
            prompts: {
                preview: async (input?: Parameters<PromptAssemblyService['buildPromptAssembly']>[0]) => this.promptAssemblyService.buildPromptAssembly(input ?? {}),
                inject: async (input: UnifiedPromptInjectInput): Promise<UnifiedPromptInjectResult> => {
                    const snapshot = input.snapshot;
                    const userDisplayName = resolveCurrentNarrativeUserName();
                    const content = normalizeUserNarrativeText(String(snapshot.finalText ?? ''), userDisplayName).trim();
                    const shouldInject = content.length > 0;
                    const insertIndex = this.resolveInsertIndex(input.promptMessages);
                    if (shouldInject && insertIndex >= 0) {
                        input.promptMessages.splice(insertIndex, 0, {
                            role: 'system',
                            content: `[Memory Context]\n<memoryos_context>\n${content}\n</memoryos_context>`,
                        } as unknown as SdkTavernPromptMessageEvent);
                    }
                    this.latestRecallExplanation = this.buildRecallExplanationFromSnapshot(snapshot);
                    return {
                        shouldInject,
                        inserted: shouldInject && insertIndex >= 0,
                        insertIndex,
                        promptLength: input.promptMessages.length,
                        insertedLength: content.length,
                        trace: input.trace ?? null,
                    };
                },
            },
        };
    }

    /**
     * 功能：初始化 SDK。
     * @returns 初始化结果。
     */
    public async init(): Promise<void> {
        await this.entryRepository.init();
        this.tryRegisterLLMTasks();
    }

    /**
     * 功能：基于 Prompt 组装快照生成最近一次召回说明。
     * @param snapshot Prompt 组装快照。
     * @returns 召回说明对象。
     */
    private buildRecallExplanationFromSnapshot(snapshot: PromptAssemblySnapshot): Record<string, unknown> {
        const retrievalDiagnostics = (snapshot.diagnostics?.retrieval ?? null) as Record<string, unknown> | null;
        const semanticCounts = snapshot.roleEntries.reduce((counts: Record<MemorySemanticKind, number>, entry): Record<MemorySemanticKind, number> => {
            if (entry.semantic?.semanticKind) {
                counts[entry.semantic.semanticKind] = (counts[entry.semantic.semanticKind] ?? 0) + 1;
            }
            return counts;
        }, {
            event: 0,
            state: 0,
            task_progress: 0,
        });
        const forgettingCounts = snapshot.roleEntries.reduce((counts: Record<string, number>, entry): Record<string, number> => {
            const tier = String(entry.forgettingTier ?? (entry.forgotten ? 'shadow_forgotten' : 'active')).trim() || 'active';
            counts[tier] = (counts[tier] ?? 0) + 1;
            return counts;
        }, {
            active: 0,
            shadow_forgotten: 0,
            hard_forgotten: 0,
        });
        const shadowTriggeredCount = snapshot.roleEntries.filter((entry): boolean => entry.shadowTriggered === true).length;
        return {
            generatedAt: Date.now(),
            query: String(snapshot.query ?? ''),
            matchedActorKeys: snapshot.matchedActorKeys,
            matchedEntryIds: snapshot.matchedEntryIds,
            reasonCodes: snapshot.reasonCodes,
            source: 'unified_memory',
            retrievalProviderId: snapshot.diagnostics?.providerId,
            finalProviderId: String(retrievalDiagnostics?.finalProviderId ?? snapshot.diagnostics?.providerId ?? '').trim(),
            seedProviderId: String(retrievalDiagnostics?.seedProviderId ?? '').trim(),
            retrievalRulePack: snapshot.diagnostics?.rulePackMode,
            compareKeySchemaVersion: snapshot.diagnostics?.compareKeySchemaVersion ?? 'v2',
            matchModeCounts: snapshot.diagnostics?.matchModeCounts ?? {},
            vectorHitCount: Number(retrievalDiagnostics?.vectorHitCount ?? 0) || 0,
            mergeUsed: retrievalDiagnostics?.mergeUsed === true,
            rerankUsed: retrievalDiagnostics?.rerankUsed === true,
            rerankSource: String(retrievalDiagnostics?.rerankSource ?? '').trim() || undefined,
            strategyDecision: retrievalDiagnostics?.strategyDecision ?? null,
            contextRoute: snapshot.diagnostics?.contextRoute ?? null,
            matchedRules: snapshot.diagnostics?.contextRoute?.matchedRules ?? [],
            subQueries: snapshot.diagnostics?.contextRoute?.subQueries ?? [],
            routeReasons: snapshot.diagnostics?.contextRoute?.reasons ?? [],
            semanticCounts,
            forgettingCounts,
            shadowTriggeredCount,
            traceRecords: snapshot.diagnostics?.traceRecords ?? [],
            worldProfileId: snapshot.diagnostics?.worldProfileId,
            worldProfileDisplayName: snapshot.diagnostics?.worldProfileDisplayName,
            worldBindingMode: snapshot.diagnostics?.worldBindingMode,
            worldEffectSummary: snapshot.diagnostics?.worldEffectSummary ?? [],
        };
    }

    /**
     * 功能：把接管进度快照转换为门面对外执行结果。
     * @param progress 接管进度快照。
     * @param fallbackReasonCode 缺省原因码。
     * @returns 接管执行结果。
     */
    private toTakeoverExecutionResult(
        progress: MemoryTakeoverProgressSnapshot,
        fallbackReasonCode: string,
    ): MemoryTakeoverExecutionResult {
        const planStatus = progress.plan?.status;
        const isFinished = planStatus === 'completed' || planStatus === 'degraded';
        const isSuccessful = Boolean(progress.plan) && planStatus !== 'failed' && planStatus !== 'paused';
        return {
            ok: isSuccessful,
            finished: isFinished,
            reasonCode: planStatus === 'completed' ? 'completed' : (planStatus ?? fallbackReasonCode),
            errorMessage: planStatus === 'failed' || planStatus === 'paused'
                ? String(progress.plan?.lastError ?? '').trim() || undefined
                : undefined,
            progress,
        };
    }

    /**
     * 功能：读取当前聊天键。
     * @returns 聊天键。
     */
    public getChatKey(): string {
        return this.chatKey_;
    }

    /**
     * 功能：确保当前聊天对应的 LLMHub 任务已完成注册。
     *
     * 返回：
     *   boolean：`true` 表示当前已注册或本次补注册成功；`false` 表示当前仍无法注册。
     */
    public ensureLLMTasksRegistered(): boolean {
        this.tryRegisterLLMTasks();
        return this.llmTasksRegistered;
    }

    /**
     * 功能：读取向量运行时状态。
     * @returns 向量运行时快照。
     */
    private async readVectorRuntimeStatus(): Promise<MemoryVectorRuntimeStatus> {
        const settings = readMemoryOSSettings();
        const embeddingService = getSharedEmbeddingService();
        const vectorStore = getSharedVectorStore();
        const embeddingAvailable = embeddingService?.isAvailable() === true;
        const vectorStoreAvailable = vectorStore?.isAvailable() === true;
        const modelInfo = embeddingService?.getModelInfo();
        return {
            runtimeReady: isVectorRuntimeReady(),
            embeddingAvailable,
            embeddingUnavailableReason: embeddingAvailable ? undefined : (embeddingService?.getUnavailableReason() ?? 'Embedding 服务不可用'),
            vectorStoreAvailable,
            vectorStoreUnavailableReason: vectorStoreAvailable ? undefined : '向量存储不可用',
            retrievalMode: settings.retrievalMode,
            embeddingModel: modelInfo?.model || settings.vectorEmbeddingModel || undefined,
            embeddingVersion: modelInfo?.version || settings.vectorEmbeddingVersion || undefined,
            vectorEnableStrategyRouting: settings.vectorEnableStrategyRouting,
            vectorEnableRerank: settings.vectorEnableRerank,
            vectorEnableLLMHubRerank: settings.vectorEnableLLMHubRerank,
        };
    }

    /**
     * 功能：按条件列出向量文档。
     * @param input 过滤参数。
     * @returns 过滤后的向量文档列表。
     */
    private async listVectorDocumentsForWorkbench(input?: MemoryVectorDocumentListInput): Promise<DBMemoryVectorDocument[]> {
        const docs = await this.entryRepository.listVectorDocuments();
        const sourceKind = String(input?.sourceKind ?? '').trim();
        const status = String(input?.status ?? '').trim();
        const schemaId = String(input?.schemaId ?? '').trim();
        const actorKey = String(input?.actorKey ?? '').trim();
        const sourceId = String(input?.sourceId ?? '').trim();
        const query = String(input?.query ?? '').trim().toLowerCase();
        return docs
            .filter((doc: DBMemoryVectorDocument): boolean => {
                if (sourceKind && doc.sourceKind !== sourceKind) {
                    return false;
                }
                if (status && doc.embeddingStatus !== status) {
                    return false;
                }
                if (schemaId && String(doc.schemaId ?? '').trim() !== schemaId) {
                    return false;
                }
                if (actorKey && !(doc.actorKeys ?? []).includes(actorKey)) {
                    return false;
                }
                if (sourceId && String(doc.sourceId ?? '').trim() !== sourceId) {
                    return false;
                }
                if (!query) {
                    return true;
                }
                const searchText = [
                    doc.vectorDocId,
                    doc.sourceKind,
                    doc.sourceId,
                    doc.schemaId,
                    doc.title,
                    doc.text,
                    doc.compareKey,
                    ...(doc.actorKeys ?? []),
                    ...(doc.relationKeys ?? []),
                    ...(doc.worldKeys ?? []),
                ].join(' ').toLowerCase();
                return searchText.includes(query);
            })
            .sort((left: DBMemoryVectorDocument, right: DBMemoryVectorDocument): number => right.updatedAt - left.updatedAt);
    }

    /**
     * 功能：读取向量索引统计。
     * @returns 统计快照。
     */
    private async getVectorIndexStats(): Promise<MemoryVectorIndexStats> {
        const [documents, indexRecords, recallStats] = await Promise.all([
            this.entryRepository.listVectorDocuments(),
            this.entryRepository.listVectorIndexRecords(),
            this.entryRepository.listVectorRecallStats(),
        ]);
        return {
            documentCount: documents.length,
            readyCount: documents.filter((doc: DBMemoryVectorDocument): boolean => doc.embeddingStatus === 'ready').length,
            pendingCount: documents.filter((doc: DBMemoryVectorDocument): boolean => doc.embeddingStatus === 'pending' || doc.embeddingStatus === 'processing').length,
            failedCount: documents.filter((doc: DBMemoryVectorDocument): boolean => doc.embeddingStatus === 'failed').length,
            indexCount: indexRecords.length,
            recallStatCount: recallStats.length,
        };
    }

    /**
     * 功能：执行向量实验室中的手动召回测试。
     * @param input 测试输入。
     * @returns 测试结果。
     */
    private async testVectorRetrieval(input: MemoryVectorRetrievalTestInput): Promise<MemoryVectorRetrievalTestResult> {
        const query = String(input.query ?? '').trim();
        if (!query) {
            throw new Error('请输入要测试的查询文本。');
        }
        input.onProgress?.({
            stage: 'prepare',
            title: '校验输入',
            message: '正在校验查询文本与测试参数。',
            progress: 0.08,
        });
        const retrievalService = getSharedRetrievalService();
        input.onProgress?.({
            stage: 'candidate_build',
            title: '构建候选',
            message: '正在收集当前聊天的检索候选与角色档案。',
            progress: 0.2,
        });
        const [candidates, actorProfiles] = await Promise.all([
            this.buildWorkbenchRetrievalCandidates(),
            this.entryRepository.listActorProfiles(),
        ]);
        const previousSettings = readMemoryOSSettings();
        const nextSettings = {
            ...previousSettings,
            vectorTopK: Math.max(1, Math.trunc(Number(input.topK) || previousSettings.vectorTopK)),
            vectorDeepWindow: Math.max(5, Math.trunc(Number(input.deepWindow) || previousSettings.vectorDeepWindow)),
            vectorFinalTopK: Math.max(1, Math.trunc(Number(input.finalTopK) || previousSettings.vectorFinalTopK)),
            vectorEnableStrategyRouting: input.enableStrategyRouting ?? previousSettings.vectorEnableStrategyRouting,
            vectorEnableRerank: input.enableRerank ?? previousSettings.vectorEnableRerank,
            vectorEnableLLMHubRerank: input.enableLLMHubRerank ?? previousSettings.vectorEnableLLMHubRerank,
        };
        writeMemoryOSSettings(nextSettings);
        try {
            input.onProgress?.({
                stage: 'retrieval_start',
                title: '启动召回',
                message: '正在进入检索主链并准备执行召回。',
                progress: 0.35,
            });
            const result = await retrievalService.searchHybrid({
                query,
                chatKey: this.chatKey_,
                candidates,
                actorProfiles: actorProfiles.map((profile: ActorMemoryProfile) => ({
                    actorKey: profile.actorKey,
                    displayName: profile.displayName,
                    aliases: [],
                })),
                recallConfig: {
                    retrievalMode: input.retrievalMode,
                    topK: nextSettings.vectorFinalTopK,
                    enableGraphExpansion: input.enableGraphExpansion === true,
                    payloadFilter: {
                        ...(input.filters?.actorKey ? { actorKeys: [String(input.filters.actorKey).trim()] } : {}),
                        ...(input.filters?.schemaId ? { schemaIds: [String(input.filters.schemaId).trim()] } : {}),
                        ...(input.filters?.worldKey ? { worldKeys: [String(input.filters.worldKey).trim()] } : {}),
                    },
                },
                onProgress: input.onProgress,
            });
            input.onProgress?.({
                stage: 'result_finalize',
                title: '整理结果',
                message: '正在汇总诊断信息与最终命中结果。',
                progress: 0.96,
            });
            return {
                diagnostics: result.diagnostics,
                items: result.items,
                providerId: result.providerId,
                retrievalMode: result.retrievalMode,
            };
        } finally {
            writeMemoryOSSettings(previousSettings);
        }
    }

    /**
     * 功能：重建当前聊天的向量文档。
     * @returns 重建数量。
     */
    private async rebuildAllVectorDocumentsForCurrentChat(): Promise<number> {
        const data = await this.readAllVectorSourceData();
        return rebuildAllVectorDocuments(this.chatKey_, data);
    }

    /**
     * 功能：重建当前聊天的向量索引与 embedding。
     * @returns 成功编码数量。
     */
    private async rebuildAllEmbeddingsForCurrentChat(): Promise<number> {
        const data = await this.readAllVectorSourceData();
        return rebuildAllEmbeddings(this.chatKey_, data);
    }

    /**
     * 功能：在指定 AI 流程结束后统一刷新当前聊天的向量索引。
     * @param stageLabel 阶段名称。
     * @returns 异步完成。
     */
    private async refreshVectorIndexAfterPipeline(stageLabel: string): Promise<void> {
        if (!isVectorRuntimeReady()) {
            return;
        }
        const embeddingService = getSharedEmbeddingService();
        const vectorStore = getSharedVectorStore();
        if (!embeddingService?.isAvailable() || !vectorStore?.isAvailable()) {
            return;
        }
        try {
            const refreshedCount = await this.rebuildAllEmbeddingsForCurrentChat();
            logger.info(`[MemoryOS] ${stageLabel}完成后已刷新向量索引: ${refreshedCount}`);
        } catch (error) {
            logger.warn(`[MemoryOS] ${stageLabel}完成后刷新向量索引失败`, error);
        }
    }

    /**
     * 功能：重建单个向量文档的索引。
     * @param vectorDocId 向量文档 ID。
     * @returns 异步完成。
     */
    private async reindexVectorDocument(vectorDocId: string): Promise<void> {
        const doc = await this.findVectorDocumentById(vectorDocId);
        if (!doc) {
            throw new Error('未找到对应的向量文档。');
        }
        if (doc.sourceKind === 'entry') {
            const entry = await this.entryRepository.getEntry(doc.sourceId);
            if (!entry) {
                throw new Error('来源条目不存在，无法重建索引。');
            }
            await onEntrySaved(this.chatKey_, entry);
            return;
        }
        if (doc.sourceKind === 'relationship') {
            const relationships = await this.entryRepository.listRelationships();
            const relationship = relationships.find((item: MemoryRelationshipRecord): boolean => item.relationshipId === doc.sourceId);
            if (!relationship) {
                throw new Error('来源关系不存在，无法重建索引。');
            }
            await onRelationshipSaved(this.chatKey_, relationship);
            return;
        }
        if (doc.sourceKind === 'actor') {
            const actors = await this.entryRepository.listActorProfiles();
            const actor = actors.find((item: ActorMemoryProfile): boolean => item.actorKey === doc.sourceId);
            if (!actor) {
                throw new Error('来源角色不存在，无法重建索引。');
            }
            await onActorSaved(this.chatKey_, actor);
            return;
        }
        const summaries = await this.entryRepository.listSummarySnapshots(500);
        const summary = summaries.find((item: SummarySnapshot): boolean => item.summaryId === doc.sourceId);
        if (!summary) {
            throw new Error('来源总结不存在，无法重建索引。');
        }
        await onSummarySaved(this.chatKey_, summary);
    }

    /**
     * 功能：删除单个向量文档及其索引。
     * @param vectorDocId 向量文档 ID。
     * @returns 异步完成。
     */
    private async removeVectorDocument(vectorDocId: string): Promise<void> {
        const doc = await this.findVectorDocumentById(vectorDocId);
        if (!doc) {
            throw new Error('未找到对应的向量文档。');
        }
        await this.entryRepository.deleteVectorDocumentsBySource(doc.sourceKind, doc.sourceId);
        await this.entryRepository.deleteVectorIndexBySource(doc.sourceKind, doc.sourceId);
    }

    /**
     * 功能：读取构建向量索引所需的全部源数据。
     * @returns 主表数据集合。
     */
    private async readAllVectorSourceData(): Promise<{
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
        actors: ActorMemoryProfile[];
        summaries: SummarySnapshot[];
    }> {
        const [entries, relationships, actors, summaries] = await Promise.all([
            this.entryRepository.listEntries(),
            this.entryRepository.listRelationships(),
            this.entryRepository.listActorProfiles(),
            this.entryRepository.listSummarySnapshots(500),
        ]);
        return {
            entries,
            relationships,
            actors,
            summaries,
        };
    }

    /**
     * 功能：根据向量文档 ID 查找文档。
     * @param vectorDocId 向量文档 ID。
     * @returns 文档或空值。
     */
    private async findVectorDocumentById(vectorDocId: string): Promise<DBMemoryVectorDocument | null> {
        const docs = await this.entryRepository.listVectorDocuments();
        return docs.find((item: DBMemoryVectorDocument): boolean => item.vectorDocId === String(vectorDocId ?? '').trim()) ?? null;
    }

    /**
     * 功能：构建工作台检索候选。
     * @returns 检索候选列表。
     */
    private async buildWorkbenchRetrievalCandidates(): Promise<Array<{
        candidateId: string;
        entryId: string;
        schemaId: string;
        title: string;
        summary: string;
        updatedAt: number;
        memoryPercent: number;
        category?: string;
        tags?: string[];
        sourceSummaryIds?: string[];
        actorKeys?: string[];
        relationKeys?: string[];
        participantActorKeys?: string[];
        locationKey?: string;
        worldKeys?: string[];
        compareKey?: string;
        injectToSystem?: boolean;
        aliasTexts?: string[];
        forgettingTier?: MemoryForgettingTier;
        shadowTriggered?: boolean;
        shadowRecallPenalty?: number;
    }>> {
        const [entries, roleRows, actorProfiles, compareKeyIndex] = await Promise.all([
            this.entryRepository.listEntries(),
            this.entryRepository.listRoleMemories(),
            this.entryRepository.listActorProfiles(),
            this.entryRepository.listCompareKeyIndexRecords(),
        ]);
        const boundActorMap = new Map<string, string[]>();
        const memoryPercentMap = new Map<string, number>();
        const retentionMap = new Map<string, MemoryRetentionProjection>();
        const entryMap = new Map(entries.map((entry: MemoryEntry): [string, MemoryEntry] => [entry.entryId, entry]));
        roleRows.forEach((row: RoleEntryMemory): void => {
            const list = boundActorMap.get(row.entryId) ?? [];
            if (!list.includes(row.actorKey)) {
                list.push(row.actorKey);
            }
            boundActorMap.set(row.entryId, list);
            const entry = entryMap.get(row.entryId);
            const retention = projectMemoryRetentionCore({
                forgotten: row.forgotten,
                memoryPercent: row.memoryPercent,
                title: entry?.title,
                summary: entry?.summary || entry?.detail,
            });
            const current = retentionMap.get(row.entryId);
            retentionMap.set(row.entryId, this.resolveEntryLevelRetention(current, retention));
            memoryPercentMap.set(row.entryId, Math.max(memoryPercentMap.get(row.entryId) ?? 0, retention.effectiveMemoryPercent));
        });
        const actorDisplayNameMap = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, string] => [profile.actorKey, profile.displayName]));
        const compareKeyMap = new Map(compareKeyIndex.map((item): [string, { compareKey?: string; matchKeys?: string[] }] => [
            item.entryId,
            { compareKey: item.compareKey, matchKeys: Array.isArray(item.matchKeys) ? item.matchKeys : [] },
        ]));
        return entries.map((entry: MemoryEntry) => {
            const payload = this.toRecord(entry.detailPayload);
            const fields = this.toRecord(payload.fields);
            const bindings = this.normalizeLooseBindings(payload.bindings ?? fields.bindings);
            const boundActorKeys = boundActorMap.get(entry.entryId) ?? [];
            const actorKeys = this.normalizeStringArray([
                ...boundActorKeys,
                ...bindings.actors,
                String(payload.sourceActorKey ?? fields.sourceActorKey ?? '').trim(),
                String(payload.targetActorKey ?? fields.targetActorKey ?? '').trim(),
            ]);
            const relationKeys = this.normalizeStringArray([
                ...this.normalizeLooseStringArray(payload.relationKeys ?? fields.relationKeys),
                ...this.normalizeLooseStringArray(payload.relationTag ?? fields.relationTag),
                ...bindings.tasks,
                ...bindings.events,
            ]);
            const worldKeys = this.normalizeStringArray([
                ...this.normalizeLooseStringArray(payload.worldKeys ?? fields.worldKeys),
                ...bindings.organizations,
                ...bindings.cities,
                ...bindings.locations,
                ...bindings.nations,
                ...(entry.entryType.startsWith('world_') ? [entry.title] : []),
            ]);
            const aliasTexts = this.normalizeStringArray([
                ...entry.tags,
                ...this.normalizeLooseStringArray(payload.aliases ?? fields.aliases),
                ...actorKeys.map((actorKey: string): string => actorDisplayNameMap.get(actorKey) ?? ''),
                ...(compareKeyMap.get(entry.entryId)?.matchKeys ?? []),
            ]);
            const compareKey = compareKeyMap.get(entry.entryId)?.compareKey || this.compareKeyService.buildIndexRecord(entry).compareKey;
            const semantic = projectMemorySemanticRecord({
                entryType: entry.entryType,
                ongoing: entry.ongoing,
                detailPayload: payload,
            });
            const locationKey = String(payload.locationKey ?? fields.locationKey ?? payload.location ?? fields.location ?? '').trim() || undefined;
            const retention = retentionMap.get(entry.entryId) ?? projectMemoryRetentionCore({
                forgotten: false,
                memoryPercent: memoryPercentMap.get(entry.entryId) ?? 0,
                title: entry.title,
                summary: entry.summary || entry.detail,
                compareKey,
                aliasTexts,
                actorKeys,
                relationKeys,
                participantActorKeys: boundActorKeys,
                locationKey,
                worldKeys,
                semantic,
            });
            return {
                candidateId: `vector-lab:${entry.entryId}`,
                entryId: entry.entryId,
                schemaId: entry.entryType,
                title: entry.title,
                summary: entry.summary || entry.detail,
                updatedAt: entry.updatedAt,
                memoryPercent: memoryPercentMap.get(entry.entryId) ?? (entry.entryType.startsWith('world_') ? 88 : 60),
                category: entry.category,
                tags: entry.tags,
                sourceSummaryIds: entry.sourceSummaryIds,
                actorKeys,
                relationKeys,
                participantActorKeys: boundActorKeys,
                locationKey,
                worldKeys,
                compareKey,
                injectToSystem: entry.entryType.startsWith('world_') || entry.entryType === 'scene_shared_state' || entry.entryType === 'location',
                aliasTexts,
                semantic,
                retention,
                forgettingTier: retention.forgottenLevel,
                shadowTriggered: retention.shadowTriggered,
                shadowRecallPenalty: retention.shadowRecallPenalty,
            };
        });
    }

    /**
     * 功能：合并条目级遗忘层级，优先保留更可参与召回的层级。
     * @param current 当前层级。
     * @param next 新层级。
     * @returns 合并后的层级。
     */
    private resolveEntryLevelRetention(
        current: MemoryRetentionProjection | undefined,
        next: MemoryRetentionProjection,
    ): MemoryRetentionProjection {
        if (!current) {
            return next;
        }
        const order: Record<string, number> = {
            active: 3,
            shadow_forgotten: 2,
            hard_forgotten: 1,
        };
        if ((order[next.forgottenLevel] ?? 0) === (order[current.forgottenLevel] ?? 0)) {
            return next.retentionScore >= current.retentionScore ? next : current;
        }
        return (order[next.forgottenLevel] ?? 0) > (order[current.forgottenLevel] ?? 0)
            ? next
            : current;
    }

    /**
     * 功能：归一化松散字符串数组。
     * @param value 原始值。
     * @returns 归一化后的字符串数组。
     */
    private normalizeLooseStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
        }
        const text = String(value ?? '').trim();
        if (!text) {
            return [];
        }
        return text.split(/[,，、\n]+/).map((item: string): string => item.trim()).filter(Boolean);
    }

    /**
     * 功能：归一化向量检索候选使用的绑定对象。
     * @param value 原始绑定值。
     * @returns 归一化后的绑定对象。
     */
    private normalizeLooseBindings(value: unknown): {
        actors: string[];
        organizations: string[];
        cities: string[];
        locations: string[];
        nations: string[];
        tasks: string[];
        events: string[];
    } {
        const record = this.toRecord(value);
        return {
            actors: this.normalizeLooseStringArray(record.actors),
            organizations: this.normalizeLooseStringArray(record.organizations),
            cities: this.normalizeLooseStringArray(record.cities),
            locations: this.normalizeLooseStringArray(record.locations),
            nations: this.normalizeLooseStringArray(record.nations),
            tasks: this.normalizeLooseStringArray(record.tasks),
            events: this.normalizeLooseStringArray(record.events),
        };
    }

    /**
     * 功能：把旧聊天接管最终整合结果写入正式记忆层。
     * @param result 接管整合结果。
     * @returns 异步完成。
     */
    private async applyTakeoverConsolidation(
        result: MemoryTakeoverConsolidationResult,
        options: { alignSummaryProgress?: boolean } = {},
    ): Promise<void> {
        const applyResults: ApplyLedgerMutationBatchResult[] = [];
        const relationshipRecords: MemoryRelationshipRecord[] = [];
        for (const actorCard of result.actorCards ?? []) {
            await this.persistTakeoverActorCard(actorCard, result.takeoverId);
        }

        const existingActorCards = await this.readTakeoverExistingActorCards();
        const existingKnownEntities = await this.readTakeoverExistingKnownEntities();
        const narrativeContext = this.buildTakeoverNarrativeRendererContext({
            actorCards: result.actorCards ?? [],
            existingActorCards,
            knownEntities: existingKnownEntities,
            longTermFacts: result.longTermFacts ?? [],
            taskState: result.taskState ?? [],
            worldState: result.worldState ?? {},
        });

        for (const entityCard of result.entityCards ?? []) {
            await this.persistTakeoverEntityCard(entityCard, result.takeoverId);
        }

        for (const entityTransition of result.entityTransitions ?? []) {
            await this.applyTakeoverEntityTransition(entityTransition, result.takeoverId);
        }

        const factMutations: LedgerMutation[] = [];
        for (const fact of result.longTermFacts) {
            const factTitle = this.renderTakeoverNarrativeText(
                String(fact.title ?? '').trim() || `${fact.subject} ? ${fact.predicate}`,
                narrativeContext,
            );
            const factSummary = this.renderTakeoverNarrativeText(
                String(fact.summary ?? '').trim() || fact.value,
                narrativeContext,
            );
            const factDetail = this.renderTakeoverNarrativeText(
                `${fact.subject}${fact.predicate}${fact.value}`,
                narrativeContext,
            );
            const actorBindings = this.resolveTakeoverMentionedActorKeys(
                [fact.subject, fact.value, `${fact.subject}${fact.predicate}${fact.value}`],
                result.actorCards ?? [],
                existingActorCards,
            );
            factMutations.push({
                targetKind: this.resolveTakeoverFactEntryType(fact.type),
                action: 'ADD',
                title: factTitle,
                summary: factSummary,
                detail: factDetail,
                compareKey: String(fact.compareKey ?? '').trim() || undefined,
                tags: [fact.type].filter(Boolean),
                actorBindings,
                timeContext: fact.timeContext,
                firstObservedAt: fact.firstObservedAt,
                lastObservedAt: fact.lastObservedAt,
                validFrom: fact.validFrom,
                validTo: fact.validTo,
                ongoing: fact.ongoing,
                reasonCodes: ['takeover_long_term_fact', ...(fact.reasonCodes ?? [])],
                detailPayload: {
                    compareKey: String(fact.compareKey ?? '').trim() || undefined,
                    reasonCodes: this.normalizeStringArray(fact.reasonCodes ?? []),
                    bindings: this.normalizeTakeoverBindingsPayload(fact.bindings),
                    card: {
                        title: factTitle,
                        summary: factSummary,
                        status: String(fact.status ?? '').trim() || undefined,
                        importance: Number(fact.importance),
                    },
                    fields: {
                        type: fact.type,
                        subject: fact.subject,
                        predicate: fact.predicate,
                        value: fact.value,
                        confidence: fact.confidence,
                        status: String(fact.status ?? '').trim() || undefined,
                        importance: Number(fact.importance),
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                    },
                },
            });
        }
        if (factMutations.length > 0) {
            applyResults.push(await this.entryRepository.applyLedgerMutationBatch(factMutations, {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId: result.takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            }));
        }

        for (const relationship of result.relationships ?? []) {
            const record = await this.persistTakeoverStructuredRelationship({
                relationship,
                actorCards: result.actorCards ?? [],
                existingActorCards,
                takeoverId: result.takeoverId,
            });
            if (record) {
                relationshipRecords.push(record);
            }
        }
        for (const relation of result.relationState) {
            const resolvedRelationActor = this.resolveTakeoverRelationActorTarget(
                relation.target,
                result.actorCards ?? [],
                existingActorCards,
            );
            const relationTag = this.resolveTakeoverRelationTag(
                relation.state,
                relation.reason,
                relation.relationTag,
            );
            if (resolvedRelationActor && (result.relationships?.length ?? 0) > 0) {
                continue;
            }
            if (resolvedRelationActor) {
                const record = await this.persistTakeoverActorRelation({
                    actorKey: resolvedRelationActor.actorKey,
                    displayName: resolvedRelationActor.displayName,
                    relationState: this.renderTakeoverNarrativeText(relation.state, narrativeContext),
                    relationReason: this.renderTakeoverNarrativeText(relation.reason, narrativeContext),
                    relationTag,
                    timeContext: relation.timeContext,
                    validFrom: relation.validFrom,
                    validTo: relation.validTo,
                    ongoing: relation.ongoing,
                    takeoverId: result.takeoverId,
                });
                if (record) {
                    relationshipRecords.push(record);
                }
                continue;
            }
            const resolvedEntity = this.resolveTakeoverRelationEntityTarget(
                relation.target,
                relation.targetType,
                result.entityCards ?? [],
                existingKnownEntities,
            );
            if (resolvedEntity) {
                await this.persistTakeoverEntityRelation({
                    entityKey: resolvedEntity.entityKey,
                    displayName: resolvedEntity.displayName,
                    entityType: resolvedEntity.entityType,
                    relationState: this.renderTakeoverNarrativeText(relation.state, narrativeContext),
                    relationReason: this.renderTakeoverNarrativeText(relation.reason, narrativeContext),
                    relationTag,
                    takeoverId: result.takeoverId,
                });
                continue;
            }
            const targetActorKey = this.normalizeTakeoverActorKey(relation.target);
            if (!targetActorKey) {
                continue;
            }
                const record = await this.persistTakeoverActorRelation({
                    actorKey: targetActorKey,
                    displayName: this.resolveTakeoverActorDisplayName(targetActorKey, relation.target),
                    relationState: this.renderTakeoverNarrativeText(relation.state, narrativeContext),
                    relationReason: this.renderTakeoverNarrativeText(relation.reason, narrativeContext),
                    relationTag,
                    takeoverId: result.takeoverId,
                });
                if (record) {
                    relationshipRecords.push(record);
                }
            }
        await this.entryRepository.replaceRelationshipsForTakeover(this.dedupeRelationshipRecords(relationshipRecords));

        const taskMutations: LedgerMutation[] = [];
        for (const task of result.taskState) {
            const normalizedObjective = this.renderTakeoverNarrativeText(task.goal || task.task, narrativeContext);
            const normalizedStatus = this.renderTakeoverNarrativeText(task.state, narrativeContext);
            const normalizedTitle = normalizeTaskTitle({
                title: this.renderTakeoverNarrativeText(task.title || task.task, narrativeContext),
                objective: normalizedObjective,
                compareKey: task.compareKey || buildCompareKey('task', task.task, {}),
            });
            const taskDecision = resolveLedgerUpdateDecision({
                entryType: 'task',
                title: normalizedTitle,
                fields: {
                    objective: normalizedObjective,
                    status: normalizedStatus,
                },
                sourceBatchId: result.takeoverId,
            });
            const taskSummary = normalizeTaskDescription({
                title: normalizedTitle,
                summary: this.renderTakeoverNarrativeText(String(task.summary ?? ''), narrativeContext),
                objective: normalizedObjective,
                status: normalizedStatus,
                lastChange: this.renderTakeoverNarrativeText(String(task.description ?? ''), narrativeContext),
            });
            taskMutations.push({
                targetKind: 'task',
                action: (taskDecision.action === 'NOOP' ? 'ADD' : taskDecision.action),
                title: normalizedTitle,
                summary: taskSummary,
                detail: this.renderTakeoverNarrativeText(`任务状态：${task.state}`, narrativeContext),
                compareKey: taskDecision.compareKey,
                tags: ['任务', '旧聊天接管'],
                actorBindings: this.normalizeStringArray([...(task.bindings?.actors ?? []), 'user']),
                timeContext: task.timeContext,
                firstObservedAt: task.firstObservedAt,
                lastObservedAt: task.lastObservedAt,
                validFrom: task.validFrom,
                validTo: task.validTo,
                ongoing: task.ongoing,
                reasonCodes: ['takeover_task_state', ...taskDecision.reasonCodes, ...(task.reasonCodes ?? [])],
                detailPayload: {
                    compareKey: taskDecision.compareKey,
                    reasonCodes: [...taskDecision.reasonCodes, ...(task.reasonCodes ?? [])],
                    sourceBatchIds: [result.takeoverId],
                    bindings: {
                        actors: this.normalizeStringArray([...(task.bindings?.actors ?? []), 'user']),
                        organizations: this.normalizeStringArray(task.bindings?.organizations ?? []),
                        cities: this.normalizeStringArray(task.bindings?.cities ?? []),
                        locations: this.normalizeStringArray(task.bindings?.locations ?? []),
                        nations: this.normalizeStringArray(task.bindings?.nations ?? []),
                        tasks: this.normalizeStringArray(task.bindings?.tasks ?? []),
                        events: this.normalizeStringArray(task.bindings?.events ?? []),
                    },
                    card: {
                        title: normalizedTitle,
                        summary: taskSummary,
                        objective: normalizedObjective,
                        status: normalizedStatus,
                    },
                    fields: {
                        compareKey: taskDecision.compareKey,
                        objective: normalizedObjective,
                        status: normalizedStatus,
                        goal: normalizedObjective,
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                        sourceBatchId: result.takeoverId,
                    },
                },
            });
        }
        if (taskMutations.length > 0) {
            applyResults.push(await this.entryRepository.applyLedgerMutationBatch(taskMutations, {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId: result.takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            }));
        }

                const worldStateMutations: LedgerMutation[] = [];
        const worldStateRecords: Array<{
            key: string;
            value: string;
            reasonCodes?: string[];
            timeContext?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['timeContext'];
            firstObservedAt?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['firstObservedAt'];
            lastObservedAt?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['lastObservedAt'];
            validFrom?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['validFrom'];
            validTo?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['validTo'];
            ongoing?: NonNullable<MemoryTakeoverConsolidationResult['worldStateDetails']>[number]['ongoing'];
        }> = (result.worldStateDetails?.length ?? 0) > 0
            ? result.worldStateDetails!
            : Object.entries(result.worldState ?? {}).map(([key, value]) => ({
                key,
                value,
            }));
        for (const worldState of worldStateRecords) {
            const normalizedKey = this.renderTakeoverNarrativeText(String(worldState.key ?? '').trim(), narrativeContext);
            const normalizedValue = this.renderTakeoverNarrativeText(String(worldState.value ?? '').trim(), narrativeContext);
            const worldDecision = resolveLedgerUpdateDecision({
                entryType: 'world_global_state',
                title: normalizedKey,
                fields: {
                    scope: 'global',
                    state: normalizedValue,
                },
                sourceBatchId: result.takeoverId,
            });
            worldStateMutations.push({
                targetKind: 'world_global_state',
                action: (worldDecision.action === 'NOOP' ? 'ADD' : worldDecision.action),
                title: normalizedKey,
                summary: normalizedValue,
                detail: normalizedValue,
                compareKey: worldDecision.compareKey,
                tags: ['世界状态', '旧聊天接管'],
                timeContext: worldState.timeContext,
                firstObservedAt: worldState.firstObservedAt,
                lastObservedAt: worldState.lastObservedAt,
                validFrom: worldState.validFrom,
                validTo: worldState.validTo,
                ongoing: worldState.ongoing,
                reasonCodes: ['takeover_world_state', ...worldDecision.reasonCodes],
                detailPayload: {
                    compareKey: worldDecision.compareKey,
                    reasonCodes: [
                        ...worldDecision.reasonCodes,
                        ...((worldState.reasonCodes ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)),
                    ],
                    sourceBatchIds: [result.takeoverId],
                    fields: {
                        compareKey: worldDecision.compareKey,
                        scope: 'global',
                        state: normalizedValue,
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                        sourceBatchId: result.takeoverId,
                    },
                },
            });
        }
        if (worldStateMutations.length > 0) {
            applyResults.push(await this.entryRepository.applyLedgerMutationBatch(worldStateMutations, {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId: result.takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            }));
        }

        const snapshotSummary = await this.writeTakeoverSnapshotSummary(result.activeSnapshot, result);
        if (snapshotSummary?.mutationApplyDiagnostics) {
            applyResults.push(snapshotSummary.mutationApplyDiagnostics);
        }
        result.applyDiagnostics = this.mergeLedgerMutationBatchResults(applyResults);
        await saveMemoryTakeoverPreview(this.chatKey_, 'consolidation', result, 'runtime');
        await this.bindWorldProfileFromTakeover(result);
        await this.markColdStartCompletedFromTakeover();
        if (options.alignSummaryProgress !== false) {
            await this.alignSummaryProgressToCurrentFloor();
        }
        await this.refreshVectorIndexAfterPipeline('旧聊天处理');
    }

    /**
     * 功能：读取当前聊天已存在的角色卡列表，供旧聊天批处理提示词复用。
     * @returns 已存在角色卡的精简列表。
     */
    private async readTakeoverExistingActorCards(): Promise<Array<{ actorKey: string; displayName: string }>> {
        const actorProfiles = await this.entryRepository.listActorProfiles();
        return actorProfiles
            .map((profile: { actorKey: string; displayName: string }): { actorKey: string; displayName: string } => ({
                actorKey: String(profile.actorKey ?? '').trim(),
                displayName: String(profile.displayName ?? '').trim(),
            }))
            .filter((profile: { actorKey: string; displayName: string }): boolean => {
                return Boolean(profile.actorKey) && Boolean(profile.displayName);
            });
    }

    /**
     * 功能：读取当前聊天已存在的分类对象，供旧聊天批处理提示词复用。
     * @returns 已存在分类对象。
     */
    private async readTakeoverExistingKnownEntities(): Promise<{
        actors: Array<{ actorKey: string; displayName: string }>;
        organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        tasks: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        worldStates: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
    }> {
        const actors = await this.readTakeoverExistingActorCards();
        const organizationEntries = await this.entryRepository.listEntries({ entryType: 'organization' });
        const cityEntries = await this.entryRepository.listEntries({ entryType: 'city' });
        const nationEntries = await this.entryRepository.listEntries({ entryType: 'nation' });
        const locationEntries = await this.entryRepository.listEntries({ entryType: 'location' });
        const taskEntries = await this.entryRepository.listEntries({ entryType: 'task' });
        const worldEntries = await this.entryRepository.listEntries();
        return {
            actors,
            organizations: this.dedupeTakeoverEntityRefs(organizationEntries.map((entry) => ({
                entityKey: this.resolveTakeoverStoredEntityKey(entry),
                compareKey: this.resolveTakeoverStoredCompareKey(entry),
                displayName: String(entry.title ?? '').trim(),
            }))),
            cities: this.dedupeTakeoverEntityRefs(cityEntries.map((entry) => ({
                entityKey: this.resolveTakeoverStoredEntityKey(entry),
                compareKey: this.resolveTakeoverStoredCompareKey(entry),
                displayName: String(entry.title ?? '').trim(),
            }))),
            nations: this.dedupeTakeoverEntityRefs(nationEntries.map((entry) => ({
                entityKey: this.resolveTakeoverStoredEntityKey(entry),
                compareKey: this.resolveTakeoverStoredCompareKey(entry),
                displayName: String(entry.title ?? '').trim(),
            }))),
            locations: this.dedupeTakeoverEntityRefs(locationEntries.map((entry) => ({
                entityKey: this.resolveTakeoverStoredEntityKey(entry),
                compareKey: this.resolveTakeoverStoredCompareKey(entry),
                displayName: String(entry.title ?? '').trim(),
            }))),
            tasks: this.dedupeTakeoverEntityRefs(taskEntries.map((entry) => ({
                entityKey: this.resolveTakeoverStoredEntityKey(entry),
                compareKey: this.resolveTakeoverStoredCompareKey(entry),
                displayName: String(entry.title ?? '').trim(),
            }))),
            worldStates: this.dedupeTakeoverEntityRefs(worldEntries
                .filter((entry): boolean => ['world_global_state', 'world_core_setting', 'world_hard_rule'].includes(String(entry.entryType ?? '').trim()))
                .map((entry) => ({
                    entityKey: this.resolveTakeoverStoredEntityKey(entry),
                    compareKey: this.resolveTakeoverStoredCompareKey(entry),
                    displayName: String(entry.title ?? '').trim(),
                  }))),
          };
      }

    /**
     * 功能：构建旧聊天接管自然语言字段的统一引用渲染上下文。
     * @param input 上下文构建输入。
     * @returns 可复用的引用渲染上下文。
     */
    private buildTakeoverNarrativeRendererContext(input: {
        actorCards: Array<{ actorKey: string; displayName: string; aliases?: string[] }>;
        existingActorCards: Array<{ actorKey: string; displayName: string }>;
        knownEntities: {
            organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            tasks: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            worldStates: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        };
        longTermFacts: Array<{ compareKey?: string; title?: string }>;
        taskState: Array<{ compareKey?: string; task: string; title?: string }>;
        worldState: Record<string, string>;
    }): NarrativeReferenceRendererContext {
        const userDisplayName = resolveCurrentNarrativeUserName();
        const labelMap = new Map<string, string>([['user', userDisplayName]]);
        const aliasToLabelMap = new Map<string, string>();
        const appendReference = (ref: string, label: string, aliases: string[] = []): void => {
            const normalizedRef = String(ref ?? '').trim();
            const normalizedLabel = String(label ?? '').trim();
            if (!normalizedRef || !normalizedLabel) {
                return;
            }
            labelMap.set(normalizedRef, normalizedLabel);
            aliasToLabelMap.set(buildNarrativeReferenceLookupKey(normalizedRef), normalizedLabel);
            aliasToLabelMap.set(buildNarrativeReferenceLookupKey(normalizedLabel), normalizedLabel);
            aliases.forEach((alias: string): void => {
                const normalizedAlias = String(alias ?? '').trim();
                if (!normalizedAlias) {
                    return;
                }
                aliasToLabelMap.set(buildNarrativeReferenceLookupKey(normalizedAlias), normalizedLabel);
            });
        };

        input.actorCards.forEach((actorCard): void => {
            const actorKey = this.resolveTakeoverActorKey(actorCard.actorKey, actorCard.displayName);
            const displayName = this.resolveTakeoverActorDisplayName(actorKey, actorCard.displayName);
            appendReference(actorKey, displayName, actorCard.aliases ?? []);
            appendReference(`actor:${actorKey}`, displayName, actorCard.aliases ?? []);
            appendReference(String(actorCard.actorKey ?? '').trim(), displayName, actorCard.aliases ?? []);
        });
        input.existingActorCards.forEach((actorCard): void => {
            const actorKey = String(actorCard.actorKey ?? '').trim();
            const displayName = this.resolveTakeoverActorDisplayName(actorKey, actorCard.displayName);
            appendReference(actorKey, displayName);
            appendReference(`actor:${actorKey}`, displayName);
        });
        const appendKnownEntityReference = (
            item: { compareKey?: string; displayName: string },
            fallbackBuilder: (displayName: string) => string,
        ): void => {
            const displayName = String(item.displayName ?? '').trim();
            if (!displayName) {
                return;
            }
            const compareKey = String(item.compareKey ?? '').trim();
            appendReference(compareKey || fallbackBuilder(displayName), displayName);
        };
        input.knownEntities.organizations.forEach((item) => appendKnownEntityReference(item, buildOrganizationCompareKey));
        input.knownEntities.cities.forEach((item) => appendKnownEntityReference(item, buildCityCompareKey));
        input.knownEntities.nations.forEach((item) => appendKnownEntityReference(item, buildNationCompareKey));
        input.knownEntities.locations.forEach((item) => appendKnownEntityReference(item, buildLocationCompareKey));
        input.knownEntities.tasks.forEach((item) => appendKnownEntityReference(item, buildTaskCompareKey));
        input.knownEntities.worldStates.forEach((item) => appendKnownEntityReference(item, buildWorldStateCompareKey));
        input.longTermFacts.forEach((fact) => {
            const compareKey = String(fact.compareKey ?? '').trim();
            const title = String(fact.title ?? '').trim();
            if (!title) {
                return;
            }
            if (compareKey) {
                appendReference(compareKey, title);
            }
            appendReference(buildEventCompareKey(title), title);
        });
        input.taskState.forEach((task) => {
            const title = String(task.title ?? task.task ?? '').trim();
            const compareKey = String(task.compareKey ?? '').trim();
            if (!title) {
                return;
            }
            if (compareKey) {
                appendReference(compareKey, title);
            }
            appendReference(buildTaskCompareKey(title), title);
        });
        Object.keys(input.worldState ?? {}).forEach((key: string): void => {
            const normalizedKey = String(key ?? '').trim();
            if (!normalizedKey) {
                return;
            }
            appendReference(buildWorldStateCompareKey(normalizedKey), normalizedKey);
        });
        return {
            userDisplayName,
            labelMap,
            aliasToLabelMap,
        };
    }

    /**
     * 功能：渲染旧聊天接管中的自然语言字段，统一替换占位符与泄漏引用。
     * @param text 原始文本。
     * @param context 引用渲染上下文。
     * @returns 渲染后的文本。
     */
    private renderTakeoverNarrativeText(text: string, context: NarrativeReferenceRendererContext): string {
        return renderNarrativeReferenceText(String(text ?? '').trim(), context);
    }

    /**
     * 功能：归一化旧聊天接管里的绑定载荷结构。
     * @param bindings 原始绑定载荷。
     * @returns 统一后的绑定对象。
     */
    private normalizeTakeoverBindingsPayload(bindings: MemoryTakeoverBindings | undefined): MemoryTakeoverBindings {
        return {
            actors: this.normalizeStringArray(bindings?.actors ?? []),
            organizations: this.normalizeStringArray(bindings?.organizations ?? []),
            cities: this.normalizeStringArray(bindings?.cities ?? []),
            locations: this.normalizeStringArray(bindings?.locations ?? []),
            nations: this.normalizeStringArray(bindings?.nations ?? []),
            tasks: this.normalizeStringArray(bindings?.tasks ?? []),
            events: this.normalizeStringArray(bindings?.events ?? []),
        };
    }

    /**
     * 功能：根据角色锚点推导更适合展示的角色名。
     * @param actorKey 角色键。
     * @param explicitDisplayName 外部显式给出的角色名。
     * @returns 适合展示的角色名。
     */
    private resolveTakeoverActorDisplayName(actorKey: string, explicitDisplayName?: string): string {
        const normalizedDisplayName = this.normalizeTakeoverRelationTargetName(explicitDisplayName ?? '');
        if (normalizedDisplayName && normalizedDisplayName !== actorKey) {
            return normalizedDisplayName;
        }
        const extractedName = this.normalizeTakeoverRelationTargetName(this.extractTakeoverActorName(actorKey));
        if (extractedName && extractedName !== actorKey) {
            return extractedName;
        }
        const stripped = stripNarrativeReferencePrefix(actorKey)
            .replace(/^(char|actor)_+/i, '')
            .replace(/_/g, ' ')
            .trim();
        return stripped || '未命名角色';
    }

    /**
     * 功能：确保旧聊天接管引用到的角色至少拥有最小可用的角色档案。
     * @param input 角色档案写入参数。
     * @returns 归一化后的角色键和显示名。
     */
    private async ensureTakeoverActorReference(input: {
        actorKey: string;
        displayName?: string;
        aliases?: string[];
        identityFacts?: string[];
        originFacts?: string[];
        traits?: string[];
        takeoverId: string;
        hydrationState: 'partial' | 'full';
        displayNameSource?: ActorDisplayNameSource;
    }): Promise<{ actorKey: string; displayName: string }> {
        const actorKey = this.resolveTakeoverActorKey(input.actorKey, input.displayName);
        const displayName = this.resolveTakeoverActorDisplayName(actorKey, input.displayName);
        if (!actorKey || actorKey === 'user') {
            return { actorKey: 'user', displayName: resolveCurrentNarrativeUserName() };
        }
        await this.entryRepository.ensureActorProfile({
            actorKey,
            displayName,
            displayNameSource: input.displayNameSource ?? (input.hydrationState === 'full' ? 'takeover_actor_card' : 'takeover_relation'),
        });
        return { actorKey, displayName };
    }

    
    private async persistTakeoverActorRelation(input: {
        actorKey: string;
        displayName: string;
        relationState: string;
        relationReason: string;
        relationTag: string;
        timeContext?: MemoryRelationshipRecord['timeContext'];
        validFrom?: MemoryRelationshipRecord['validFrom'];
        validTo?: MemoryRelationshipRecord['validTo'];
        ongoing?: MemoryRelationshipRecord['ongoing'];
        takeoverId: string;
    }): Promise<MemoryRelationshipRecord> {
        const actor = await this.ensureTakeoverActorReference({
            actorKey: input.actorKey,
            displayName: input.displayName,
            takeoverId: input.takeoverId,
            hydrationState: 'partial',
        });
        return this.persistTakeoverRelationshipEntry({
            sourceActorKey: 'user',
            sourceDisplayName: resolveCurrentNarrativeUserName(),
            targetActorKey: actor.actorKey,
            targetDisplayName: actor.displayName,
            relationTag: input.relationTag,
            state: input.relationState,
            summary: input.relationReason || input.relationState,
            trust: 0,
            affection: 0,
            tension: 0,
            participants: ['user', actor.actorKey],
            timeContext: input.timeContext,
            validFrom: input.validFrom,
            validTo: input.validTo,
            ongoing: input.ongoing,
            takeoverId: input.takeoverId,
            reasonCode: 'takeover_relation_state',
        });
    }

    /**
     * 功能：把旧聊天接管输出的结构化关系卡写入正式关系条目。
     * @param input 结构化关系写入参数。
     * @returns 异步完成。
     */
    private async persistTakeoverStructuredRelationship(input: {
        relationship: MemoryTakeoverRelationshipCard;
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>;
        existingActorCards: Array<{ actorKey: string; displayName: string }>;
        takeoverId: string;
    }): Promise<MemoryRelationshipRecord | null> {
        const narrativeContext = this.buildTakeoverNarrativeRendererContext({
            actorCards: input.actorCards,
            existingActorCards: input.existingActorCards,
            knownEntities: {
                organizations: [],
                cities: [],
                nations: [],
                locations: [],
                tasks: [],
                worldStates: [],
            },
            longTermFacts: [],
            taskState: [],
            worldState: {},
        });
        const sourceActor = await this.ensureTakeoverActorReference({
            ...(this.resolveTakeoverActorByKey(
                input.relationship.sourceActorKey,
                input.actorCards,
                input.existingActorCards,
            ) ?? {
                actorKey: input.relationship.sourceActorKey,
                displayName: this.resolveTakeoverActorDisplayName(input.relationship.sourceActorKey),
            }),
            takeoverId: input.takeoverId,
            hydrationState: 'partial',
            displayNameSource: 'takeover_relation',
        });
        const targetActor = await this.ensureTakeoverActorReference({
            ...(this.resolveTakeoverActorByKey(
                input.relationship.targetActorKey,
                input.actorCards,
                input.existingActorCards,
            ) ?? {
                actorKey: input.relationship.targetActorKey,
                displayName: this.resolveTakeoverActorDisplayName(input.relationship.targetActorKey),
            }),
            takeoverId: input.takeoverId,
            hydrationState: 'partial',
            displayNameSource: 'takeover_relation',
        });
        if (!sourceActor || !targetActor || sourceActor.actorKey === targetActor.actorKey) {
            return null;
        }
        narrativeContext.labelMap?.set(sourceActor.actorKey, sourceActor.displayName);
        narrativeContext.labelMap?.set(`actor:${sourceActor.actorKey}`, sourceActor.displayName);
        narrativeContext.labelMap?.set(targetActor.actorKey, targetActor.displayName);
        narrativeContext.labelMap?.set(`actor:${targetActor.actorKey}`, targetActor.displayName);
        return this.persistTakeoverRelationshipEntry({
            sourceActorKey: sourceActor.actorKey,
            sourceDisplayName: sourceActor.displayName,
            targetActorKey: targetActor.actorKey,
            targetDisplayName: targetActor.displayName,
            relationTag: normalizeRelationTag(input.relationship.relationTag) || '朋友',
            state: this.renderTakeoverNarrativeText(String(input.relationship.state ?? '').trim(), narrativeContext),
            summary: this.renderTakeoverNarrativeText(
                String(input.relationship.summary ?? '').trim() || String(input.relationship.state ?? '').trim(),
                narrativeContext,
            ),
            trust: Number(input.relationship.trust),
            affection: Number(input.relationship.affection),
            tension: Number(input.relationship.tension),
            participants: [
                sourceActor.actorKey,
                targetActor.actorKey,
                ...((input.relationship.participants ?? []).map((item: string): string => String(item ?? '').trim().toLowerCase())),
            ],
            timeContext: input.relationship.timeContext,
            validFrom: input.relationship.validFrom,
            validTo: input.relationship.validTo,
            ongoing: input.relationship.ongoing,
            takeoverId: input.takeoverId,
            reasonCode: 'takeover_relationship_card',
        });
    }

    /**
     * 功能：统一写入旧聊天接管生成的 relationship 条目。
     * @param input relationship 写入参数。
     * @returns 异步完成。
     */
    private async persistTakeoverRelationshipEntry(input: {
        sourceActorKey: string;
        sourceDisplayName?: string;
        targetActorKey: string;
        targetDisplayName?: string;
        relationTag: string;
        state: string;
        summary: string;
        trust: number;
        affection: number;
        tension: number;
        participants: string[];
        timeContext?: MemoryRelationshipRecord['timeContext'];
        validFrom?: MemoryRelationshipRecord['validFrom'];
        validTo?: MemoryRelationshipRecord['validTo'];
        ongoing?: MemoryRelationshipRecord['ongoing'];
        takeoverId: string;
        reasonCode: string;
    }): Promise<MemoryRelationshipRecord> {
        const normalizedParticipants = this.dedupeTakeoverStringList([
            input.sourceActorKey,
            input.targetActorKey,
            ...(input.participants ?? []),
        ]);
        const sourceDisplayName = String(input.sourceDisplayName ?? '').trim()
            || (input.sourceActorKey === 'user' ? resolveCurrentNarrativeUserName() : this.resolveTakeoverActorDisplayName(input.sourceActorKey));
        const targetDisplayName = String(input.targetDisplayName ?? '').trim()
            || this.resolveTakeoverActorDisplayName(input.targetActorKey);
        const title = `${sourceDisplayName}与${targetDisplayName}的关系`;
        const normalizedTrust = this.clampTakeover01(input.trust);
        const normalizedAffection = this.clampTakeover01(input.affection);
        const normalizedTension = this.clampTakeover01(input.tension);
        return this.entryRepository.saveRelationship({
            sourceActorKey: input.sourceActorKey,
            targetActorKey: input.targetActorKey,
            relationTag: input.relationTag,
            state: input.state,
            summary: input.summary,
            trust: normalizedTrust,
            affection: normalizedAffection,
            tension: normalizedTension,
            participants: normalizedParticipants,
            timeContext: input.timeContext,
            validFrom: input.validFrom,
            validTo: input.validTo,
            ongoing: input.ongoing,
        });
    }

    
    private async persistTakeoverEntityRelation(input: {
        entityKey: string;
        displayName: string;
        entityType: 'organization' | 'city' | 'nation' | 'location';
        relationState: string;
        relationReason: string;
        relationTag: string;
        takeoverId: string;
    }): Promise<void> {
        const entry = await this.entryRepository.getEntry(input.entityKey);
        if (!entry) {
            return;
        }
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        await this.entryRepository.applyLedgerMutationBatch([{
            targetKind: entry.entryType,
            action: 'UPDATE',
            title: entry.title,
            entryId: entry.entryId,
            tags: this.dedupeTakeoverStringList([...(entry.tags ?? []), '关系']),
            summary: entry.summary,
            detail: entry.detail,
            reasonCodes: ['takeover_entity_relation_update'],
            detailPayload: {
                ...payload,
                fields: {
                    ...fields,
                    userRelationTag: input.relationTag,
                    userRelationState: input.relationState,
                    userRelationReason: input.relationReason,
                },
                takeover: {
                    source: 'old_chat_takeover',
                    takeoverId: input.takeoverId,
                },
            },
        }], {
            chatKey: this.chatKey_,
            source: 'takeover',
            sourceLabel: '旧聊天接管',
            takeoverId: input.takeoverId,
            allowCreate: true,
            allowInvalidate: true,
        });
    }

        private resolveTakeoverRelationEntityTarget(
        targetName: string,
        targetType: 'actor' | 'organization' | 'city' | 'nation' | 'location' | 'unknown' | undefined,
        entityCards: Array<{
            entityType: string;
            compareKey: string;
            title: string;
            aliases?: string[];
        }>,
        knownEntities: {
            organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        },
    ): { entityKey: string; compareKey?: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
        const normalizedTargetName = this.normalizeTakeoverRelationTargetName(targetName);
        if (!normalizedTargetName) {
            return null;
        }
        const normalizedTargetType = String(targetType ?? '').trim().toLowerCase();
        const entityType = normalizedTargetType === 'organization'
            || normalizedTargetType === 'city'
            || normalizedTargetType === 'nation'
            || normalizedTargetType === 'location'
            ? normalizedTargetType as 'organization' | 'city' | 'nation' | 'location'
            : this.inferTakeoverEntityTypeFromName(normalizedTargetName);
        if (!entityType) {
            return null;
        }

        const matchedCard = entityCards.find((card): boolean => {
            if (String(card.entityType ?? '').trim().toLowerCase() !== entityType) {
                return false;
            }
            if (this.normalizeTakeoverRelationTargetName(String(card.title ?? '').trim()) === normalizedTargetName) {
                return true;
            }
            return (card.aliases ?? []).some((alias): boolean => {
                return this.normalizeTakeoverRelationTargetName(String(alias ?? '').trim()) === normalizedTargetName;
            });
        });
        if (matchedCard) {
            return this.resolveTakeoverExistingEntityByCompareKey(
                matchedCard.compareKey,
                entityType,
                knownEntities,
            ) ?? this.resolveTakeoverExistingEntityByName(
                String(matchedCard.title ?? '').trim(),
                entityType,
                knownEntities,
            );
        }

        return this.resolveTakeoverExistingEntityByName(normalizedTargetName, entityType, knownEntities);
    }

    /**
     * 功能：根据关系文案推断关系标签。
     * @param relationState 关系状态。
     * @param relationReason 关系原因。
     * @param explicitTag 模型显式输出的关系标签。
     * @returns 规范化后的关系标签。
     */
    private resolveTakeoverRelationTag(
        relationState: string,
        relationReason: string,
        explicitTag?: string,
    ): string {
        const normalizedExplicitTag = normalizeRelationTag(explicitTag);
        if (normalizedExplicitTag) {
            return normalizedExplicitTag;
        }
        const combinedText = `${String(relationState ?? '').trim()} ${String(relationReason ?? '').trim()}`;
        if (/(亲人|家人|父|母|哥哥|姐姐|弟弟|妹妹|亲属)/.test(combinedText)) {
            return '亲人';
        }
        if (/(恋人|爱慕|心动|喜欢|依恋|占有欲)/.test(combinedText)) {
            return '恋人';
        }
        if (/暧昧/.test(combinedText)) {
            return '暧昧';
        }
        if (/(盟友|合作|同伴|援助|并肩)/.test(combinedText)) {
            return '盟友';
        }
        if (/(师徒|老师|弟子)/.test(combinedText)) {
            return '师徒';
        }
        if (/(上级|下级|命令|服从)/.test(combinedText)) {
            return '上下级';
        }
        if (/(竞争|争夺)/.test(combinedText)) {
            return '竞争者';
        }
        if (/情敌/.test(combinedText)) {
            return '情敌';
        }
        if (/(敌对|仇|加害|威胁|对立|冲突|迫害)/.test(combinedText)) {
            return '宿敌';
        }
        if (/(陌生|未建立|初遇|警惕)/.test(combinedText)) {
            return '陌生人';
        }
        return '朋友';
    }

    private async persistTakeoverActorCard(
        actorCard: {
            actorKey: string;
            displayName: string;
            aliases: string[];
            identityFacts: string[];
            originFacts: string[];
            traits: string[];
        },
        takeoverId: string,
    ): Promise<void> {
        await this.ensureTakeoverActorReference({
            actorKey: actorCard.actorKey,
            displayName: actorCard.displayName,
            aliases: actorCard.aliases,
            identityFacts: actorCard.identityFacts,
            originFacts: actorCard.originFacts,
            traits: actorCard.traits,
            takeoverId,
            hydrationState: 'full',
            displayNameSource: 'takeover_actor_card',
        });
    }

    /**
     * 功能：把旧聊天处理识别出的世界实体卡候选写入正式实体条目。
     * @param entityCard 实体卡候选。
     * @param takeoverId 接管任务 ID。
     * @returns 异步完成。
     */
    private async persistTakeoverEntityCard(
        entityCard: MemoryTakeoverEntityCardCandidate,
        takeoverId: string,
    ): Promise<void> {
        const entityType = String(entityCard.entityType ?? '').trim().toLowerCase();
        const validEntityTypes = new Set(['organization', 'city', 'nation', 'location']);
        if (!validEntityTypes.has(entityType)) {
            return;
        }
        const title = String(entityCard.title ?? '').trim();
        if (!title) {
            return;
        }

        const categoryMap: Record<string, string> = {
            organization: '组织',
            city: '城市',
            nation: '国家',
            location: '地点',
        };

        const compareKey = this.buildTakeoverEntityCompareKey(entityType, entityCard.compareKey, title);
        const existingEntries = await this.entryRepository.listEntries({ entryType: entityType });
        const existingEntry = existingEntries.find((entry) => this.matchTakeoverEntityEntry(entry, compareKey, title)) ?? null;

        const aliases = this.dedupeTakeoverStringList(entityCard.aliases ?? []);
        const summary = String(entityCard.summary ?? '').trim() || `${title}的${categoryMap[entityType] ?? '实体'}信息`;
        const fields = entityCard.fields && typeof entityCard.fields === 'object' ? entityCard.fields : {};

        await this.entryRepository.applyLedgerMutationBatch([{
            targetKind: entityType,
            action: existingEntry ? 'UPDATE' : 'ADD',
            title,
            entryId: existingEntry?.entryId,
            entityKey: String(entityCard.entityKey ?? '').trim() || undefined,
            compareKey,
            matchKeys: entityCard.matchKeys ?? [],
            summary,
            detail: existingEntry?.detail ?? '',
            tags: existingEntry?.tags?.length ? existingEntry.tags : [entityType],
            timeContext: entityCard.timeContext,
            firstObservedAt: entityCard.firstObservedAt,
            lastObservedAt: entityCard.lastObservedAt,
            validFrom: entityCard.validFrom,
            validTo: entityCard.validTo,
            ongoing: entityCard.ongoing,
            reasonCodes: [existingEntry ? 'takeover_entity_card_update' : 'takeover_entity_card_add'],
            detailPayload: {
                ...(existingEntry?.detailPayload ?? {}),
                entityKey: String(entityCard.entityKey ?? '').trim() || undefined,
                compareKey,
                matchKeys: entityCard.matchKeys ?? [],
                schemaVersion: entityCard.schemaVersion,
                canonicalName: entityCard.canonicalName,
                legacyCompareKeys: entityCard.legacyCompareKeys ?? [],
                reasonCodes: this.normalizeStringArray([
                    ...this.normalizeStringArray(((existingEntry?.detailPayload as Record<string, unknown>)?.reasonCodes as string[]) ?? []),
                    ...(entityCard.reasonCodes ?? []),
                ]),
                bindings: this.normalizeTakeoverBindings(entityCard.bindings),
                fields: {
                    ...(existingEntry?.detailPayload as Record<string, unknown>)?.fields as Record<string, unknown> ?? {},
                    ...fields,
                    aliases,
                    compareKey,
                    entityKey: String(entityCard.entityKey ?? '').trim() || undefined,
                    confidence: Math.max(0, Math.min(1, Number(entityCard.confidence) || 0)),
                },
                takeover: {
                    source: 'old_chat_takeover',
                    takeoverId,
                },
            },
        }], {
            chatKey: this.chatKey_,
            source: 'takeover',
            sourceLabel: '旧聊天接管整合',
            takeoverId,
            allowCreate: true,
            allowInvalidate: true,
        });
    }

    
    private async applyTakeoverEntityTransition(
        transition: MemoryTakeoverEntityTransition,
        takeoverId: string,
    ): Promise<void> {
        const entityType = String(transition.entityType ?? '').trim().toLowerCase();
        const validEntityTypes = new Set(['organization', 'city', 'nation', 'location']);
        if (!validEntityTypes.has(entityType)) {
            return;
        }
        const title = String(transition.title ?? '').trim();
        if (!title) {
            return;
        }
        const action = String(transition.action ?? '').trim().toUpperCase();
        const categoryMap: Record<string, string> = {
            organization: '组织',
            city: '城市',
            nation: '国家',
            location: '地点',
        };
        const compareKey = this.buildTakeoverEntityCompareKey(entityType, transition.compareKey, title);
        const existingEntries = await this.entryRepository.listEntries({ entryType: entityType });
        const existingEntry = existingEntries.find((entry) => this.matchTakeoverEntityEntry(entry, compareKey, title)) ?? null;

        if (action === 'INVALIDATE' && existingEntry) {
            await this.entryRepository.applyLedgerMutationBatch([{
                targetKind: entityType,
                action: 'INVALIDATE',
                title: existingEntry.title,
                entryId: existingEntry.entryId,
                compareKey,
                tags: existingEntry.tags ?? [entityType],
                summary: '[已失效] ' + (existingEntry.summary ?? ''),
                detail: existingEntry.detail ?? '',
                timeContext: transition.timeContext,
                firstObservedAt: transition.firstObservedAt,
                lastObservedAt: transition.lastObservedAt,
                validFrom: transition.validFrom,
                validTo: transition.validTo,
                ongoing: transition.ongoing,
                reasonCodes: ['takeover_entity_invalidate'],
                detailPayload: {
                    ...(existingEntry.detailPayload ?? {}),
                    compareKey,
                    reasonCodes: this.normalizeStringArray([
                        ...this.normalizeStringArray(((existingEntry.detailPayload as Record<string, unknown>)?.reasonCodes as string[]) ?? []),
                        ...(transition.reasonCodes ?? []),
                    ]),
                    lifecycle: { status: 'invalidated', reason: transition.reason },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }], {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            });
            return;
        }

        if (action === 'DELETE' && existingEntry) {
            await this.entryRepository.applyLedgerMutationBatch([{
                targetKind: entityType,
                action: 'DELETE',
                title: existingEntry.title,
                entryId: existingEntry.entryId,
                compareKey,
                timeContext: transition.timeContext,
                firstObservedAt: transition.firstObservedAt,
                lastObservedAt: transition.lastObservedAt,
                validFrom: transition.validFrom,
                validTo: transition.validTo,
                ongoing: transition.ongoing,
                reasonCodes: ['takeover_entity_delete'],
                detailPayload: {
                    ...(existingEntry.detailPayload ?? {}),
                    compareKey,
                    lifecycle: { status: 'archived', reason: transition.reason },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }], {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            });
            return;
        }

        if ((action === 'ADD' || action === 'UPDATE' || action === 'MERGE') && transition.payload) {
            const summary = String(transition.payload.summary ?? transition.reason ?? '').trim();
            await this.entryRepository.applyLedgerMutationBatch([{
                targetKind: entityType,
                action: (existingEntry ? 'UPDATE' : 'ADD'),
                title,
                entryId: existingEntry?.entryId,
                compareKey,
                tags: existingEntry?.tags?.length ? existingEntry.tags : [entityType],
                summary: summary || `${title}的${categoryMap[entityType] ?? '实体'}变更`,
                detail: existingEntry?.detail ?? '',
                timeContext: transition.timeContext,
                firstObservedAt: transition.firstObservedAt,
                lastObservedAt: transition.lastObservedAt,
                validFrom: transition.validFrom,
                validTo: transition.validTo,
                ongoing: transition.ongoing,
                reasonCodes: ['takeover_entity_' + action.toLowerCase()],
                detailPayload: {
                    ...(existingEntry?.detailPayload ?? {}),
                    compareKey,
                    reasonCodes: this.normalizeStringArray([
                        ...this.normalizeStringArray(((existingEntry?.detailPayload as Record<string, unknown>)?.reasonCodes as string[]) ?? []),
                        ...(transition.reasonCodes ?? []),
                    ]),
                    bindings: this.normalizeTakeoverBindings(transition.bindings),
                    fields: {
                        ...(existingEntry?.detailPayload as Record<string, unknown>)?.fields as Record<string, unknown> ?? {},
                        compareKey,
                        ...transition.payload,
                    },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }], {
                chatKey: this.chatKey_,
                source: 'takeover',
                sourceLabel: '旧聊天接管',
                takeoverId,
                allowCreate: true,
                allowInvalidate: true,
            });
        }
    }

        private extractEntryAliases(entry: { detailPayload?: unknown }): string[] {
        const payload = entry.detailPayload;
        if (!payload || typeof payload !== 'object') {
            return [];
        }
        const fields = (payload as Record<string, unknown>).fields;
        if (!fields || typeof fields !== 'object') {
            return [];
        }
        const aliases = (fields as Record<string, unknown>).aliases;
        if (!Array.isArray(aliases)) {
            return [];
        }
        return aliases.map((alias: unknown) => String(alias ?? '').trim()).filter(Boolean);
    }

    /**
     * 功能：去重旧聊天处理里的字符串列表。
     * @param values 原始列表。
     * @returns 去重后的列表。
     */
    private dedupeTakeoverStringList(values: string[]): string[] {
        const result: string[] = [];
        for (const value of values) {
            const normalized = String(value ?? '').trim();
            if (!normalized || result.includes(normalized)) {
                continue;
            }
            result.push(normalized);
        }
        return result;
    }

    /**
     * 功能：把旧聊天接管关系分值限制在 0 到 1 之间。
     * @param value 原始数值。
     * @returns 裁剪后的数值。
     */
    private clampTakeover01(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        if (value <= 0) {
            return 0;
        }
        if (value >= 1) {
            return 1;
        }
        return Number(value.toFixed(4));
    }

    /**
     * 功能：按关系主键对接管结果里的关系记录去重，保留最后一次写入值。
     * @param records 关系记录列表。
     * @returns 去重后的关系列表。
     */
    private dedupeRelationshipRecords(records: MemoryRelationshipRecord[]): MemoryRelationshipRecord[] {
        const recordMap = new Map<string, MemoryRelationshipRecord>();
        records.forEach((record: MemoryRelationshipRecord): void => {
            const relationTag = String(record.relationTag ?? '').trim() || 'relationship';
            const relationshipId = String(record.relationshipId ?? '').trim()
                || buildRelationshipRecordId(this.chatKey_, record.sourceActorKey, record.targetActorKey, relationTag);
            recordMap.set(relationshipId, {
                ...record,
                relationshipId,
            });
        });
        return [...recordMap.values()];
    }

    /**
     * 功能：为旧聊天实体生成稳定 compareKey。
     * @param entityType 实体类型。
     * @param explicitCompareKey 模型显式给出的 compareKey。
     * @param title 实体标题。
     * @returns 稳定 compareKey。
     */
    private buildTakeoverEntityCompareKey(entityType: string, explicitCompareKey: string, title: string): string {
        const normalizedExplicit = String(explicitCompareKey ?? '').trim();
        if (normalizedExplicit) {
            return normalizedExplicit;
        }
        return buildCompareKey(entityType, title);
    }

    /**
     * 功能：从已存条目中解析可复用的稳定实体键。
     * @param entry 已存条目。
     * @returns 稳定实体键。
     */
    private resolveTakeoverStoredEntityKey(entry: { entryId?: string; detailPayload?: unknown }): string {
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        return String(
            payload.entityKey
            ?? fields.entityKey
            ?? payload.compareKey
            ?? fields.compareKey
            ?? entry.entryId
            ?? '',
        ).trim();
    }

    /**
     * 功能：判断实体条目是否匹配旧聊天接管中的实体标识。
     * @param entry 正式记忆条目。
     * @param compareKey 实体 compareKey。
     * @param title 实体标题。
     * @returns 是否匹配。
     */
    private matchTakeoverEntityEntry(
        entry: { title?: string; detailPayload?: unknown },
        compareKey: string,
        title: string,
    ): boolean {
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        const existingCompareKey = String(payload.compareKey ?? fields.compareKey ?? '').trim();
        if (existingCompareKey && existingCompareKey === compareKey) {
            return true;
        }
        if (String(entry.title ?? '').trim() === title) {
            return true;
        }
        const entryAliases = this.extractEntryAliases(entry);
        return entryAliases.some((alias: string) => alias === title);
    }

    /**
     * 功能：根据名称推断旧聊天关系目标的实体类型。
     * @param targetName 目标名称。
     * @returns 推断出的实体类型；无法推断时返回 null。
     */
    private inferTakeoverEntityTypeFromName(targetName: string): 'organization' | 'city' | 'nation' | 'location' | null {
        const normalized = String(targetName ?? '').trim();
        if (!normalized) {
            return null;
        }
        if (/(教派|教廷|组织|公会|帮|团|盟|会|军|宗|门派|阵营)/.test(normalized)) {
            return 'organization';
        }
        if (/(国|帝国|王国|联邦|邦|朝|州)/.test(normalized)) {
            return 'nation';
        }
        if (/(城|都|镇|村|县|郡)/.test(normalized)) {
            return 'city';
        }
        if (/(山|河|湖|海|森林|神殿|庙|谷|原|洞|穴|宫|殿|塔|桥|街|巷|港|湾)/.test(normalized)) {
            return 'location';
        }
        return null;
    }

    /**
     * 功能：按 compareKey 匹配现有实体引用。
     * @param compareKey 实体 compareKey。
     * @param entityType 实体类型。
     * @param knownEntities 当前已知实体引用。
     * @returns 匹配结果。
     */
    private resolveTakeoverExistingEntityByCompareKey(
        compareKey: string,
        entityType: 'organization' | 'city' | 'nation' | 'location',
        knownEntities: {
            organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        },
    ): { entityKey: string; compareKey?: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
        const refs = this.resolveTakeoverEntityRefGroup(entityType, knownEntities);
        const normalizedCompareKey = String(compareKey ?? '').trim();
        return refs.find((item) => {
            return String(item.compareKey ?? '').trim() === normalizedCompareKey;
        }) ?? null;
    }

    /**
     * 功能：按名称匹配现有实体引用。
     * @param displayName 实体显示名。
     * @param entityType 实体类型。
     * @param knownEntities 当前已知实体引用。
     * @returns 匹配结果。
     */
    private resolveTakeoverExistingEntityByName(
        displayName: string,
        entityType: 'organization' | 'city' | 'nation' | 'location',
        knownEntities: {
            organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        },
    ): { entityKey: string; compareKey?: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
        const refs = this.resolveTakeoverEntityRefGroup(entityType, knownEntities);
        const normalizedDisplayName = this.normalizeTakeoverRelationTargetName(displayName);
        return refs.find((item) => {
            return this.normalizeTakeoverRelationTargetName(String(item.displayName ?? '').trim()) === normalizedDisplayName;
        }) ?? null;
    }

    /**
     * 功能：读取指定类型的实体引用集合。
     * @param entityType 实体类型。
     * @param knownEntities 当前已知实体引用。
     * @returns 带类型的实体引用列表。
     */
    private resolveTakeoverEntityRefGroup(
        entityType: 'organization' | 'city' | 'nation' | 'location',
        knownEntities: {
            organizations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            cities: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            nations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
            locations: Array<{ entityKey: string; compareKey?: string; displayName: string }>;
        },
    ): Array<{ entityKey: string; compareKey?: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' }> {
        if (entityType === 'organization') {
            return knownEntities.organizations.map((item) => ({ ...item, entityType }));
        }
        if (entityType === 'city') {
            return knownEntities.cities.map((item) => ({ ...item, entityType }));
        }
        if (entityType === 'nation') {
            return knownEntities.nations.map((item) => ({ ...item, entityType }));
        }
        return knownEntities.locations.map((item) => ({ ...item, entityType }));
    }

    private async bindWorldProfileFromTakeover(result: MemoryTakeoverConsolidationResult): Promise<void> {
        const detectedFrom = this.collectTakeoverWorldProfileTexts(result).slice(0, 24);
        const existingBinding = await this.entryRepository.getWorldProfileBinding();
        const strategy = await resolveChatWorldStrategy({
            repository: this.entryRepository,
            texts: detectedFrom,
            detectedFrom,
            persistIfMissing: true,
            forceRedetect: existingBinding?.bindingMode !== 'manual',
        });
        await this.entryRepository.appendMutationHistory({
            action: 'world_profile_bound',
            payload: {
                source: 'old_chat_takeover',
                takeoverId: result.takeoverId,
                primaryProfile: strategy.explanation.profileId,
                secondaryProfiles: strategy.detection.secondaryProfiles,
                confidence: strategy.explanation.confidence,
                reasonCodes: strategy.explanation.reasonCodes,
                bindingMode: strategy.explanation.bindingMode,
            },
        });
    }

    /**
     * 功能：收集旧聊天接管可用于识别世界画像的文本线索。
     * @param result 旧聊天接管整合结果。
     * @returns 去重后的文本线索列表。
     */
    private collectTakeoverWorldProfileTexts(result: MemoryTakeoverConsolidationResult): string[] {
        return this.dedupeTakeoverStringList([
            ...(result.chapterDigestIndex ?? []).map((item): string => String(item.summary ?? '').trim()),
            ...(result.longTermFacts ?? []).map((fact): string => {
                return `${String(fact.subject ?? '').trim()}${String(fact.predicate ?? '').trim()}${String(fact.value ?? '').trim()}`;
            }),
            ...(result.taskState ?? []).map((task): string => `${String(task.task ?? '').trim()}${String(task.state ?? '').trim()}`),
            ...(result.relationState ?? []).map((relation): string => {
                return `${String(relation.target ?? '').trim()}${String(relation.state ?? '').trim()}${String(relation.reason ?? '').trim()}`;
            }),
            ...Object.entries(result.worldState ?? {}).flatMap(([key, value]): string[] => {
                return [`${String(key ?? '').trim()}${String(value ?? '').trim()}`];
            }),
            ...(result.activeSnapshot ? [
                String(result.activeSnapshot.currentScene ?? '').trim(),
                String(result.activeSnapshot.currentLocation ?? '').trim(),
                String(result.activeSnapshot.currentTimeHint ?? '').trim(),
                String(result.activeSnapshot.recentDigest ?? '').trim(),
                ...(result.activeSnapshot.activeGoals ?? []).map((item): string => String(item ?? '').trim()),
                ...(result.activeSnapshot.openThreads ?? []).map((item): string => String(item ?? '').trim()),
            ] : []),
        ]);
    }

    /**
     * 功能：去重旧聊天处理里的带标识对象列表。
     * @param values 原始对象列表。
     * @returns 去重后的对象列表。
     */
    private dedupeTakeoverEntityRefs(values: Array<{ entityKey: string; compareKey?: string; displayName: string }>): Array<{ entityKey: string; compareKey?: string; displayName: string }> {
        const result: Array<{ entityKey: string; compareKey?: string; displayName: string }> = [];
        const seen = new Set<string>();
        for (const value of values) {
            const entityKey = String(value.entityKey ?? '').trim();
            const displayName = String(value.displayName ?? '').trim();
            if (!entityKey || !displayName || seen.has(entityKey)) {
                continue;
            }
            seen.add(entityKey);
            result.push({
                entityKey,
                compareKey: String(value.compareKey ?? '').trim() || undefined,
                displayName,
            });
        }
        return result;
    }

    /**
     * 功能：读取接管阶段条目中存储的 compareKey。
     * @param entry 条目对象。
     * @returns 已存储的 compareKey。
     */
    private resolveTakeoverStoredCompareKey(entry: { detailPayload?: unknown }): string {
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        return String(
            payload.compareKey
            ?? fields.compareKey
            ?? '',
        ).trim();
    }

    /**
     * 功能：在旧聊天处理完成后，同步标记当前聊天的冷启动已完成。
     * @returns 异步完成。
     */
    private async markColdStartCompletedFromTakeover(): Promise<void> {
        const now: number = Date.now();
        await this.writeColdStartState({
            coldStartCompletedAt: now,
            coldStartConfirmedAt: now,
            coldStartDismissedAt: undefined,
            coldStartLastReasonCode: 'old_chat_takeover_completed',
            coldStartResumeRunId: undefined,
            coldStartResumeSourceBundle: undefined,
        });
    }

    /**
     * 功能：把总结进度对齐到当前聊天最新楼层，避免已处理历史再次进入待总结区间。
     * @returns 异步完成。
     */
    private async alignSummaryProgressToCurrentFloor(): Promise<void> {
        const currentFloorCount = await this.readCurrentSummaryFloorCount();
        const now: number = Date.now();
        await this.writeColdStartState({
            summaryLastSummarizedIndex: currentFloorCount,
            summaryLastSummarizedMessageId: undefined,
            summaryPendingStartIndex: currentFloorCount + 1,
            summaryPendingEndIndex: currentFloorCount,
            summaryLastSummarizedAt: now,
        });
    }

    /**
     * 功能：导出聊天数据库快照。
     * @returns 快照。
     */
    public async exportMemoryChatDatabaseSnapshotForTest(): Promise<MemoryChatDatabaseSnapshot> {
        return exportMemoryChatDatabaseSnapshot(this.chatKey_);
    }

    /**
     * 功能：导出 Prompt 测试包。
     * @param options 导出参数。
     * @returns 测试包。
     */
    public async exportPromptTestBundleForTest(options: ExportPromptTestBundleForTestOptions = {}): Promise<MemoryPromptTestBundle> {
        const resolvedRunResult = options.runResult ?? this.promptReadyRunResultSnapshot ?? undefined;
        const resolvedParityBaseline = options.parityBaseline ?? this.resolveParityBaselineFromRunResult(resolvedRunResult);
        return exportMemoryPromptTestBundle(this.chatKey_, {
            promptFixture: options.promptFixture,
            captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
            query: options.query,
            sourceMessageId: options.sourceMessageId,
            settings: options.settings,
            runResult: resolvedRunResult,
            parityBaseline: resolvedParityBaseline,
        });
    }

    /**
     * 功能：导入 Prompt 测试包。
     * @param bundle 测试包。
     * @param options 导入参数。
     * @returns 导入结果。
     */
    public async importPromptTestBundleForTest(
        bundle: MemoryPromptTestBundle,
        options?: { targetChatKey?: string; skipClear?: boolean },
    ): Promise<ImportMemoryPromptTestBundleResult> {
        return importMemoryPromptTestBundle(bundle, options);
    }

    /**
     * 功能：恢复归档聊天。
     * @returns 恢复结果。
     */
    public async restoreArchivedMemoryChat(): Promise<void> {
        await restoreArchivedMemoryChat(this.chatKey_);
    }

    /**
     * 功能：计算统一注入插入位置。
     * @param promptMessages 消息数组。
     * @returns 插入下标。
     */
    private resolveInsertIndex(promptMessages: SdkTavernPromptMessageEvent[]): number {
        for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
            const row = promptMessages[index] as Record<string, unknown>;
            const role = String(row.role ?? '').trim().toLowerCase();
            if (role === 'user' || row.is_user === true) {
                return index;
            }
        }
        return promptMessages.length;
    }

    /**
     * 功能：写入接管后的活跃快照总结。
     * @param activeSnapshot 当前活跃快照。
     * @param result 接管整合结果。
     * @returns 异步完成。
     */
    private async writeTakeoverSnapshotSummary(
        activeSnapshot: MemoryTakeoverActiveSnapshot | null,
        result: MemoryTakeoverConsolidationResult,
    ): Promise<import('../types').SummarySnapshot | null> {
        const contentLines: string[] = [];
        if (activeSnapshot?.recentDigest) {
            contentLines.push(`最近摘要：${activeSnapshot.recentDigest}`);
        }
        if (activeSnapshot?.currentScene) {
            contentLines.push(`当前场景：${activeSnapshot.currentScene}`);
        }
        if (activeSnapshot?.currentLocation) {
            contentLines.push(`当前位置：${activeSnapshot.currentLocation}`);
        }
        if (activeSnapshot?.activeGoals?.length) {
            contentLines.push(`当前目标：${activeSnapshot.activeGoals.join('、')}`);
        }
        if (activeSnapshot?.openThreads?.length) {
            contentLines.push(`待续线索：${activeSnapshot.openThreads.join('、')}`);
        }
        if (result.chapterDigestIndex.length > 0) {
            contentLines.push(`章节索引数量：${result.chapterDigestIndex.length}`);
            contentLines.push(...result.chapterDigestIndex.slice(0, 6).map((item, index): string => {
                return `第${index + 1}段（${item.range.startFloor}-${item.range.endFloor}层）：${String(item.summary ?? '').trim()}`;
            }));
        }
        if (result.dedupeStats) {
            contentLines.push(
                `去重统计：原始事实 ${result.dedupeStats.totalFacts}，保留事实 ${result.dedupeStats.dedupedFacts}，关系 ${result.dedupeStats.relationUpdates}，任务 ${result.dedupeStats.taskUpdates}，世界状态 ${result.dedupeStats.worldUpdates}`,
            );
        }
        if (result.conflictStats) {
            contentLines.push(
                `冲突统计：事实 ${result.conflictStats.unresolvedFacts}，关系 ${result.conflictStats.unresolvedRelations}，任务 ${result.conflictStats.unresolvedTasks}，世界状态 ${result.conflictStats.unresolvedWorldStates}，实体 ${result.conflictStats.unresolvedEntities}`,
            );
        }
        if (contentLines.length <= 0) {
            return null;
        }
        return this.entryRepository.applySummarySnapshot({
            title: '旧聊天接管整合快照',
            content: contentLines.join('\n'),
            actorKeys: ['user'],
        });
    }

    /**
     * 功能：合并多次统一落盘结果，供接管链路输出统一诊断。
     * @param results 多次落盘结果
     * @returns 合并后的统一落盘诊断
     */
    private mergeLedgerMutationBatchResults(results: ApplyLedgerMutationBatchResult[]): ApplyLedgerMutationBatchResult {
        const merged: ApplyLedgerMutationBatchResult = {
            createdEntryIds: [],
            updatedEntryIds: [],
            invalidatedEntryIds: [],
            deletedEntryIds: [],
            noopCount: 0,
            resolvedBindingResults: [],
            counts: {
                input: 0,
                add: 0,
                update: 0,
                merge: 0,
                invalidate: 0,
                delete: 0,
                noop: 0,
            },
            decisions: [],
            affectedRecords: [],
            bindingResults: [],
            auditResults: [],
            historyWritten: false,
        };
        for (const result of results) {
            if (!result) {
                continue;
            }
            merged.createdEntryIds.push(...(result.createdEntryIds ?? []));
            merged.updatedEntryIds.push(...(result.updatedEntryIds ?? []));
            merged.invalidatedEntryIds.push(...(result.invalidatedEntryIds ?? []));
            merged.deletedEntryIds.push(...(result.deletedEntryIds ?? []));
            merged.noopCount += Number(result.noopCount ?? 0);
            merged.counts.input += Number(result.counts?.input ?? 0);
            merged.counts.add += Number(result.counts?.add ?? 0);
            merged.counts.update += Number(result.counts?.update ?? 0);
            merged.counts.merge += Number(result.counts?.merge ?? 0);
            merged.counts.invalidate += Number(result.counts?.invalidate ?? 0);
            merged.counts.delete += Number(result.counts?.delete ?? 0);
            merged.counts.noop += Number(result.counts?.noop ?? 0);
            merged.decisions.push(...(result.decisions ?? []));
            merged.affectedRecords.push(...(result.affectedRecords ?? []));
            merged.resolvedBindingResults.push(...(result.resolvedBindingResults ?? []));
            merged.bindingResults.push(...(result.bindingResults ?? []));
            merged.auditResults.push(...(result.auditResults ?? []));
            merged.historyWritten = merged.historyWritten || result.historyWritten === true;
        }
        return merged;
    }

    private resolveTakeoverRelationActorTarget(
        targetName: string,
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>,
        existingActorCards: Array<{ actorKey: string; displayName: string }>,
    ): { actorKey: string; displayName: string } | null {
        const normalizedRawTarget = String(targetName ?? '').trim();
        if (this.isTakeoverActorReference(normalizedRawTarget)) {
            return this.resolveTakeoverActorByKey(normalizedRawTarget, actorCards, existingActorCards);
        }
        const normalizedTargetName = this.normalizeTakeoverRelationTargetName(targetName);
        if (!normalizedTargetName) {
            return null;
        }

        const matchedTakeoverActor = actorCards.find((actorCard): boolean => {
            if (this.normalizeTakeoverRelationTargetName(actorCard.displayName) === normalizedTargetName) {
                return true;
            }
            return (actorCard.aliases ?? []).some((alias: string): boolean => {
                return this.normalizeTakeoverRelationTargetName(alias) === normalizedTargetName;
            });
        });
        if (matchedTakeoverActor) {
            return {
                actorKey: this.resolveTakeoverActorKey(
                    String(matchedTakeoverActor.actorKey ?? '').trim(),
                    String(matchedTakeoverActor.displayName ?? '').trim(),
                ),
                displayName: String(matchedTakeoverActor.displayName ?? '').trim(),
            };
        }

        const matchedExistingActor = existingActorCards.find((actorCard): boolean => {
            return this.normalizeTakeoverRelationTargetName(actorCard.displayName) === normalizedTargetName;
        });
        if (matchedExistingActor) {
            return {
                actorKey: String(matchedExistingActor.actorKey ?? '').trim(),
                displayName: String(matchedExistingActor.displayName ?? '').trim(),
            };
        }
        if (!/^char[_:]/i.test(normalizedRawTarget) && !/^actor[_:]/i.test(normalizedRawTarget)) {
            return null;
        }
        const fallbackActorKey = this.resolveTakeoverActorKey(targetName, targetName);
        if (!fallbackActorKey || fallbackActorKey === 'user') {
            return null;
        }
        return {
            actorKey: fallbackActorKey,
            displayName: this.resolveTakeoverActorDisplayName(fallbackActorKey, targetName),
        };
    }

    /**
     * 功能：根据一组文本内容解析命中的角色键。
     * @param texts 待扫描文本列表。
     * @param actorCards 本次整合识别出的角色卡。
     * @param existingActorCards 当前聊天已存在的角色卡。
     * @returns 命中的角色键列表。
     */
    private resolveTakeoverMentionedActorKeys(
        texts: string[],
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>,
        existingActorCards: Array<{ actorKey: string; displayName: string }>,
    ): string[] {
        const candidates: Array<{ actorKey: string; displayName: string; aliases?: string[] }> = [
            ...actorCards.map((item) => ({
                actorKey: this.resolveTakeoverActorKey(item.actorKey, item.displayName),
                displayName: String(item.displayName ?? '').trim(),
                aliases: item.aliases ?? [],
            })),
            ...existingActorCards.map((item) => ({
                actorKey: String(item.actorKey ?? '').trim(),
                displayName: String(item.displayName ?? '').trim(),
                aliases: [] as string[],
            })),
        ];
        const result: string[] = [];
        for (const text of texts) {
            const normalizedText = String(text ?? '').trim();
            if (!normalizedText) {
                continue;
            }
            for (const candidate of candidates) {
                const actorKey = String(candidate.actorKey ?? '').trim();
                const displayName = String(candidate.displayName ?? '').trim();
                if (!actorKey || !displayName) {
                    continue;
                }
                const names = this.dedupeTakeoverStringList([displayName, ...(candidate.aliases ?? [])]);
                if (!names.some((name: string): boolean => normalizedText.includes(name))) {
                    continue;
                }
                if (!result.includes(actorKey)) {
                    result.push(actorKey);
                }
            }
        }
        return result;
    }

    /**
     * 功能：按角色键解析旧聊天接管中的真实角色。
     * @param actorKey 原始角色键。
     * @param actorCards 本次整合识别出的角色卡。
     * @param existingActorCards 当前聊天已存在的角色卡。
     * @returns 匹配到的角色；无法确认时返回 null。
     */
    private resolveTakeoverActorByKey(
        actorKey: string,
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>,
        existingActorCards: Array<{ actorKey: string; displayName: string }>,
    ): { actorKey: string; displayName: string } | null {
        const resolvedActorKey = this.resolveTakeoverActorKey(actorKey, '');
        if (resolvedActorKey === 'user') {
            return {
                actorKey: 'user',
                displayName: resolveCurrentNarrativeUserName(),
            };
        }
        const normalizedActorName = this.normalizeTakeoverRelationTargetName(this.extractTakeoverActorName(actorKey));
        const matchedTakeoverActor = actorCards.find((actorCard): boolean => {
            if (resolvedActorKey && this.resolveTakeoverActorKey(actorCard.actorKey, actorCard.displayName) === resolvedActorKey) {
                return true;
            }
            if (!normalizedActorName) {
                return false;
            }
            if (this.normalizeTakeoverRelationTargetName(actorCard.displayName) === normalizedActorName) {
                return true;
            }
            return (actorCard.aliases ?? []).some((alias: string): boolean => {
                return this.normalizeTakeoverRelationTargetName(alias) === normalizedActorName;
            });
        });
        if (matchedTakeoverActor) {
            return {
                actorKey: this.resolveTakeoverActorKey(
                    String(matchedTakeoverActor.actorKey ?? '').trim(),
                    String(matchedTakeoverActor.displayName ?? '').trim(),
                ),
                displayName: String(matchedTakeoverActor.displayName ?? '').trim(),
            };
        }
        const matchedExistingActor = existingActorCards.find((actorCard): boolean => {
            return String(actorCard.actorKey ?? '').trim() === resolvedActorKey;
        });
        if (matchedExistingActor) {
            return {
                actorKey: String(matchedExistingActor.actorKey ?? '').trim(),
                displayName: String(matchedExistingActor.displayName ?? '').trim(),
            };
        }
        if (!resolvedActorKey || resolvedActorKey === 'user') {
            return null;
        }
        return {
            actorKey: resolvedActorKey,
            displayName: this.resolveTakeoverActorDisplayName(resolvedActorKey, normalizedActorName || actorKey),
        };
    }

    /**
     * 功能：判断文本是否属于稳定角色键引用。
     * @param value 原始文本。
     * @returns 是否为角色键形式。
     */
    private isTakeoverActorReference(value: string): boolean {
        const normalizedValue = String(value ?? '').trim().toLowerCase();
        return normalizedValue === 'user' || /^char[_:]/i.test(normalizedValue) || /^actor[_:]/i.test(normalizedValue);
    }

    /**
     * 功能：归一化旧聊天关系目标名称，去掉“某某视角”等附加说明。
     * @param value 原始目标名称。
     * @returns 归一化后的名称。
     */
    private normalizeTakeoverRelationTargetName(value: string): string {
        return String(value ?? '')
            .trim()
            .replace(/（[^）]*视角[^）]*）/g, '')
            .replace(/\([^)]*视角[^)]*\)/g, '')
            .replace(/（[^）]*角度[^）]*）/g, '')
            .replace(/\([^)]*角度[^)]*\)/g, '')
            .trim();
    }

    private normalizeTakeoverActorKey(value: string): string {
        const normalized = String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized;
    }

    /**
     * 功能：从旧聊天角色键中提取更稳定的角色名称片段。
     * @param value 原始角色键。
     * @returns 提取后的角色名称；无法提取时返回空字符串。
     */
    private extractTakeoverActorName(value: string): string {
        const rawValue = String(value ?? '').trim();
        if (!rawValue) {
            return '';
        }
        const prefixedValue = rawValue.replace(/^(char|actor)_+/i, '').replace(/_/g, ' ').trim();
        if (prefixedValue && prefixedValue !== rawValue) {
            return prefixedValue;
        }
        const segments = rawValue
            .split(/[:：/|]/g)
            .map((segment: string): string => String(segment ?? '').trim())
            .filter((segment: string): boolean => Boolean(segment));
        for (let index = segments.length - 1; index >= 0; index -= 1) {
            const segment = segments[index];
            const normalizedSegment = this.normalizeTakeoverActorKey(segment);
            const loweredSegment = segment.toLowerCase();
            if (
                normalizedSegment === 'actor'
                || normalizedSegment === 'character'
                || normalizedSegment === 'role'
                || loweredSegment === 'actor'
                || loweredSegment === 'character'
                || loweredSegment === 'role'
            ) {
                continue;
            }
            return segment;
        }
        return rawValue;
    }

    /**
     * 功能：为旧聊天识别出的角色生成稳定且不冲突的角色键。
     * @param rawActorKey 模型输出的原始角色键。
     * @param displayName 角色显示名。
     * @returns 可写入正式角色档案的稳定角色键。
     */
    private resolveTakeoverActorKey(rawActorKey: string, displayName?: string): string {
        const genericActorKeys = new Set<string>(['actor', 'character', 'role', 'unknown_actor']);
        const normalizedActorKey = this.normalizeTakeoverActorKey(rawActorKey);
        if (normalizedActorKey && !genericActorKeys.has(normalizedActorKey)) {
            return normalizedActorKey;
        }

        const normalizedDisplayKey = this.normalizeTakeoverActorKey(String(displayName ?? ''));
        if (normalizedDisplayKey && !genericActorKeys.has(normalizedDisplayKey)) {
            return normalizedDisplayKey;
        }

        const extractedActorName = this.extractTakeoverActorName(rawActorKey);
        const fallbackSource = String(displayName ?? '').trim() || extractedActorName || String(rawActorKey ?? '').trim();
        if (!fallbackSource) {
            return '';
        }
        return `actor_${this.buildStableTakeoverActorHash(fallbackSource)}`;
    }

    /**
     * 功能：为旧聊天角色生成稳定哈希，避免中文名被压成同一个键。
     * @param value 原始文本。
     * @returns 稳定哈希字符串。
     */
    private buildStableTakeoverActorHash(value: string): string {
        const normalized = String(value ?? '').trim();
        let hash = 2166136261;
        for (let index = 0; index < normalized.length; index += 1) {
            hash ^= normalized.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash >>> 0).toString(36);
    }

    /**
     * 功能：把旧聊天事实类型映射为正式记忆条目类型。
     * @param factType 旧聊天事实类型。
     * @returns 对应的正式条目类型。
     */
    private resolveTakeoverFactEntryType(factType: string): string {
        const normalizedType = String(factType ?? '').trim().toLowerCase();
        if (normalizedType === 'location') {
            return 'location';
        }
        if (normalizedType === 'faction' || normalizedType === 'organization') {
            return 'organization';
        }
        if (normalizedType === 'city') {
            return 'city';
        }
        if (normalizedType === 'nation') {
            return 'nation';
        }
        if (normalizedType === 'event') {
            return 'event';
        }
        if (normalizedType === 'artifact' || normalizedType === 'item') {
            return 'item';
        }
        if (normalizedType === 'world') {
            return 'world_core_setting';
        }
        return 'other';
    }

    /**
     * 功能：从运行结果提取严格一致性基准。
     * @param runResult 运行结果对象。
     * @returns 严格一致性基准。
     */
    private resolveParityBaselineFromRunResult(runResult?: Record<string, unknown>): MemoryPromptParityBaseline | undefined {
        if (!runResult || typeof runResult !== 'object') {
            return undefined;
        }
        const raw = (runResult.parityBaseline && typeof runResult.parityBaseline === 'object')
            ? runResult.parityBaseline as Record<string, unknown>
            : runResult;
        const finalPromptText = String(raw.finalPromptText ?? '').trim();
        if (!finalPromptText) {
            return undefined;
        }
        const insertIndex = Number(raw.insertIndex);
        return {
            finalPromptText,
            insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
            insertedMemoryBlock: String(raw.insertedMemoryBlock ?? '').trim(),
            reasonCodes: this.normalizeStringArray(raw.reasonCodes),
            matchedActorKeys: this.normalizeStringArray(raw.matchedActorKeys),
            matchedEntryIds: this.normalizeStringArray(raw.matchedEntryIds),
        };
    }

    /**
     * 功能：归一化字符串数组并去重、去空。
     * @param value 原始值
     * @returns 归一化后的字符串数组
     */
    private normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const seen = new Set<string>();
        const result: string[] = [];
        for (const row of value) {
            const normalized = String(row ?? '').trim();
            if (!normalized || seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            result.push(normalized);
        }
        return result;
    }

    /**
     * 功能：读取当前聊天的冷启动状态。
     * @returns 冷启动状态。
     */
    private async readColdStartStatus(): Promise<MemoryColdStartStatus> {
        const stateRow = await readMemoryOSChatState(this.chatKey_);
        const state = this.toRecord(stateRow?.state);
        const persistedCompletedAt = this.toOptionalTimestamp(state.coldStartCompletedAt);
        if (persistedCompletedAt) {
            return {
                hasStarted: this.toOptionalTimestamp(state.coldStartLastTriggeredAt) !== undefined,
                completed: true,
                completedAt: persistedCompletedAt,
                dismissedAt: this.toOptionalTimestamp(state.coldStartDismissedAt),
                selectedLorebookEntryIds: this.toOptionalStringArray(state.coldStartSelectedLorebookEntryIds),
                lastTriggeredAt: this.toOptionalTimestamp(state.coldStartLastTriggeredAt),
                lastFailedAt: this.toOptionalTimestamp(state.coldStartLastFailedAt),
                lastReasonCode: this.toOptionalText(state.coldStartLastReasonCode),
            };
        }
        const worldProfileBinding = await this.entryRepository.getWorldProfileBinding();
        if (worldProfileBinding) {
            return {
                hasStarted: this.toOptionalTimestamp(state.coldStartLastTriggeredAt) !== undefined,
                completed: true,
                completedAt: Number(worldProfileBinding.updatedAt ?? worldProfileBinding.createdAt ?? Date.now()),
                dismissedAt: this.toOptionalTimestamp(state.coldStartDismissedAt),
                selectedLorebookEntryIds: this.toOptionalStringArray(state.coldStartSelectedLorebookEntryIds),
                lastTriggeredAt: this.toOptionalTimestamp(state.coldStartLastTriggeredAt),
                lastFailedAt: this.toOptionalTimestamp(state.coldStartLastFailedAt),
                lastReasonCode: this.toOptionalText(state.coldStartLastReasonCode),
            };
        }
        return {
            hasStarted: this.toOptionalTimestamp(state.coldStartLastTriggeredAt) !== undefined,
            completed: false,
            completedAt: undefined,
            dismissedAt: this.toOptionalTimestamp(state.coldStartDismissedAt),
            selectedLorebookEntryIds: this.toOptionalStringArray(state.coldStartSelectedLorebookEntryIds),
            lastTriggeredAt: this.toOptionalTimestamp(state.coldStartLastTriggeredAt),
            lastFailedAt: this.toOptionalTimestamp(state.coldStartLastFailedAt),
            lastReasonCode: this.toOptionalText(state.coldStartLastReasonCode),
        };
    }

    /**
     * 功能：读取可用于冷启动续跑的 sourceBundle。
     * @param value 原始值。
     * @returns 续跑 sourceBundle；无效时返回 undefined。
     */
    private readColdStartResumeSourceBundle(value: unknown): ColdStartSourceBundle | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        const sourceBundle = value as ColdStartSourceBundle;
        if (!sourceBundle.characterCard || !sourceBundle.semantic || !sourceBundle.user || !sourceBundle.worldbooks) {
            return undefined;
        }
        return sourceBundle;
    }

    /**
     * 功能：读取当前聊天的总结进度。
     * @returns 总结进度。
     */
    private async readSummaryProgress(): Promise<MemorySummaryProgress> {
        const stateRow = await readMemoryOSChatState(this.chatKey_);
        const state = this.toRecord(stateRow?.state);
        const lastSummarizedIndex = Math.max(
            0,
            Math.trunc(Number(state.summaryLastSummarizedIndex ?? state.autoSummaryLastFloorCount) || 0),
        );
        const pendingStartIndex = Math.max(
            1,
            Math.trunc(Number(state.summaryPendingStartIndex) || (lastSummarizedIndex + 1)),
        );
        const pendingEndIndex = Math.max(
            lastSummarizedIndex,
            Math.trunc(Number(state.summaryPendingEndIndex) || lastSummarizedIndex),
        );
        return {
            lastSummarizedIndex,
            lastSummarizedMessageId: this.toOptionalText(state.summaryLastSummarizedMessageId),
            pendingStartIndex,
            pendingEndIndex,
            lastSummarizedAt: this.toOptionalTimestamp(state.summaryLastSummarizedAt),
        };
    }

    /**
     * 功能：读取当前聊天的自动总结触发状态。
     * @returns 触发状态快照。
     */
    private async readSummaryTriggerStatus(): Promise<MemorySummaryTriggerStatus> {
        const settings = readMemoryOSSettings();
        const summaryProgress = await this.readSummaryProgress();
        const currentFloorCount = await this.readCurrentSummaryFloorCount();
        const summaryIntervalFloors = Math.max(
            1,
            Math.trunc(Number(settings.summaryIntervalFloors) || 1),
        );
        const summaryMinMessages = Math.max(
            2,
            Math.trunc(Number(settings.summaryMinMessages) || AUTO_SUMMARY_MIN_MESSAGE_WINDOW),
        );
        const summaryRecentWindowSize = Math.max(
            AUTO_SUMMARY_MIN_MESSAGE_WINDOW,
            Math.min(
                AUTO_SUMMARY_MAX_MESSAGE_WINDOW,
                Math.trunc(Number(settings.summaryRecentWindowSize) || AUTO_SUMMARY_MAX_MESSAGE_WINDOW),
            ),
        );
        const nextTriggerFloor = Math.max(
            summaryMinMessages,
            summaryProgress.lastSummarizedIndex + summaryIntervalFloors,
        );
        const remainingFloors = Math.max(0, nextTriggerFloor - currentFloorCount);
        const useMinMessageProgress = currentFloorCount < summaryMinMessages;
        const progressCurrent = useMinMessageProgress
            ? currentFloorCount
            : Math.max(0, currentFloorCount - summaryProgress.lastSummarizedIndex);
        const progressTarget = useMinMessageProgress ? summaryMinMessages : summaryIntervalFloors;
        const progressRatio = progressTarget > 0
            ? Math.max(0, Math.min(1, Number((progressCurrent / progressTarget).toFixed(4))))
            : 0;
        const readyToSummarize = settings.summaryAutoTriggerEnabled
            && currentFloorCount >= summaryMinMessages
            && currentFloorCount - summaryProgress.lastSummarizedIndex >= summaryIntervalFloors;
        return {
            enabled: settings.summaryAutoTriggerEnabled,
            currentFloorCount,
            summaryIntervalFloors,
            summaryMinMessages,
            summaryRecentWindowSize,
            lastSummarizedIndex: summaryProgress.lastSummarizedIndex,
            lastSummarizedMessageId: summaryProgress.lastSummarizedMessageId,
            pendingStartIndex: summaryProgress.pendingStartIndex,
            pendingEndIndex: summaryProgress.pendingEndIndex,
            nextTriggerFloor,
            remainingFloors,
            progressCurrent,
            progressTarget,
            progressRatio,
            readyToSummarize,
            lastSummarizedAt: summaryProgress.lastSummarizedAt,
        };
    }

    /**
     * 功能：读取当前聊天实际可用于总结的楼层数，优先采用宿主当前聊天快照。
     * @returns 当前楼层数
     */
    private async readCurrentSummaryFloorCount(): Promise<number> {
        const hostMessages = this.readActiveHostChatMessages();
        if (hostMessages.length > 0) {
            return hostMessages.length;
        }
        return this.eventsManager.countByTypes(AUTO_SUMMARY_MESSAGE_EVENT_TYPES);
    }

    /**
     * 功能：从事件流中读取用于总结的最近消息窗口。
     * @param pendingEndIndex 当前待总结结束楼层
     * @param messageWindowLimit 需要的窗口大小
     * @returns 归一化后的消息列表
     */
    private async readSummaryMessagesFromEvents(
        pendingEndIndex: number,
        messageWindowLimit: number,
    ): Promise<Array<{ role?: string; content?: string; name?: string; turnIndex?: number }>> {
        const [sentRows, receivedRows] = await Promise.all([
            this.eventsManager.query({ type: 'chat.message.sent', limit: messageWindowLimit }),
            this.eventsManager.query({ type: 'chat.message.received', limit: messageWindowLimit }),
        ]);
        const rows = [...sentRows, ...receivedRows]
            .sort((a: EventEnvelope<unknown>, b: EventEnvelope<unknown>): number => Number(a.ts ?? 0) - Number(b.ts ?? 0))
            .slice(-messageWindowLimit);
        return rows
            .map((row: EventEnvelope<unknown>, index: number): { role?: string; content?: string; name?: string; turnIndex?: number } => {
                const type = String(row.type ?? '').trim();
                const payload = (row.payload ?? {}) as Record<string, unknown>;
                const role = type === 'chat.message.sent' ? 'user' : 'assistant';
                return {
                    role,
                    content: String(payload.text ?? '').trim(),
                    name: undefined,
                    turnIndex: Math.max(1, pendingEndIndex - rows.length + index + 1),
                };
            })
            .filter((item: { content?: string }): boolean => Boolean(String(item.content ?? '').trim()));
    }

    /**
     * 功能：读取 dream 阶段使用的最近消息窗口。
     * @returns 最近消息列表。
     */
    private async readSummaryMessagesForDream(): Promise<Array<{ role?: string; content?: string; name?: string; turnIndex?: number }>> {
        const hostMessages = this.readActiveHostChatMessages();
        if (hostMessages.length > 0) {
            return hostMessages.slice(-12);
        }
        const currentFloorCount = await this.readCurrentSummaryFloorCount();
        return this.readSummaryMessagesFromEvents(currentFloorCount, 12);
    }

    /**
     * 功能：从事件流中读取最近一条可作为总结进度锚点的消息 ID。
     * @param messageWindowLimit 查询窗口大小
     * @returns 最近消息 ID
     */
    private async readLastSummarizedMessageIdFromEvents(messageWindowLimit: number): Promise<string | undefined> {
        const [sentRows, receivedRows] = await Promise.all([
            this.eventsManager.query({ type: 'chat.message.sent', limit: messageWindowLimit }),
            this.eventsManager.query({ type: 'chat.message.received', limit: messageWindowLimit }),
        ]);
        const rows = [...sentRows, ...receivedRows]
            .sort((a: EventEnvelope<unknown>, b: EventEnvelope<unknown>): number => Number(a.ts ?? 0) - Number(b.ts ?? 0));
        const lastMessageRow = rows.length > 0 ? rows[rows.length - 1] : null;
        return lastMessageRow
            ? String((lastMessageRow as unknown as Record<string, unknown>).eventId ?? lastMessageRow.id ?? '').trim() || undefined
            : undefined;
    }

    /**
     * 功能：读取当前激活聊天的宿主消息快照，并归一化为总结输入。
     * @returns 当前聊天消息列表；当前 SDK 不是激活聊天时返回空数组
     */
    private readActiveHostChatMessages(): Array<{ role?: string; content?: string; name?: string; turnIndex?: number }> {
        const currentChatKey = String(buildSdkChatKeyEvent() ?? '').trim();
        if (!currentChatKey || currentChatKey !== this.chatKey_) {
            return [];
        }
        const runtimeContext = getTavernRuntimeContextEvent();
        const hostMessages = Array.isArray(runtimeContext?.chat) ? runtimeContext.chat : [];
        if (hostMessages.length <= 0) {
            return [];
        }
        return hostMessages
            .map((row: unknown, index: number): { role?: string; content?: string; name?: string; turnIndex?: number } | null => {
                if (!row || typeof row !== 'object') {
                    return null;
                }
                const record = row as Record<string, unknown>;
                const content = String(getTavernMessageTextEvent(record) ?? '').trim();
                if (!content) {
                    return null;
                }
                const explicitRole = String(record.role ?? '').trim().toLowerCase();
                const role = explicitRole === 'user' || explicitRole === 'assistant' || explicitRole === 'system'
                    ? explicitRole
                    : (record.is_user === true ? 'user' : (record.is_system === true ? 'system' : 'assistant'));
                if (role === 'system') {
                    return null;
                }
                return {
                    role,
                    content,
                    name: String(record.name ?? record.display_name ?? '').trim() || undefined,
                    turnIndex: index + 1,
                };
            })
            .filter((item): item is { role?: string; content?: string; name?: string; turnIndex?: number } => item !== null);
    }

    /**
     * 功能：写入当前聊天的冷启动状态。
     * @param patch 状态补丁。
     * @returns 异步完成。
     */
    private async writeColdStartState(patch: Record<string, unknown>): Promise<void> {
        await writeMemoryOSChatState(this.chatKey_, patch);
    }

    /**
     * 功能：把未知输入归一化为对象。
     * @param value 原始值。
     * @returns 记录对象。
     */
    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：读取可选文本值。
     * @param value 原始值。
     * @returns 归一化文本；为空时返回 undefined。
     */
    private toOptionalText(value: unknown): string | undefined {
        const normalized = String(value ?? '').trim();
        return normalized || undefined;
    }

    /**
     * 功能：读取可选时间戳。
     * @param value 原始值。
     * @returns 时间戳；非法时返回 undefined。
     */
    private toOptionalTimestamp(value: unknown): number | undefined {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            return undefined;
        }
        return Math.trunc(numericValue);
    }

    /**
     * 功能：读取可选字符串数组。
     * @param value 原始值。
     * @returns 字符串数组；为空时返回 undefined。
     */
    private toOptionalStringArray(value: unknown): string[] | undefined {
        if (!Array.isArray(value)) {
            return undefined;
        }
        const result = value
            .map((item: unknown): string => String(item ?? '').trim())
            .filter(Boolean);
        return result.length > 0 ? result : undefined;
    }

    /**
     * 功能：归一化旧聊天接管输出的 bindings 对象。
     * @param bindings 原始绑定信息。
     * @returns 归一化后的绑定对象。
     */
    private normalizeTakeoverBindings(bindings?: MemoryTakeoverBindings): MemoryTakeoverBindings {
        return {
            actors: this.normalizeStringArray(bindings?.actors ?? []),
            organizations: this.normalizeStringArray(bindings?.organizations ?? []),
            cities: this.normalizeStringArray(bindings?.cities ?? []),
            locations: this.normalizeStringArray(bindings?.locations ?? []),
            nations: this.normalizeStringArray(bindings?.nations ?? []),
            tasks: this.normalizeStringArray(bindings?.tasks ?? []),
            events: this.normalizeStringArray(bindings?.events ?? []),
        };
    }

    /**
     * 功能：注册 MemoryOS 的 LLMHub 任务。
     */
    private tryRegisterLLMTasks(): void {
        if (this.llmTasksRegistered) {
            return;
        }
        const llm = readMemoryLLMApi();
        if (!llm) {
            logger.info('[MemoryOS] 当前尚未检测到 LLMHub SDK，跳过任务注册。');
            return;
        }
        try {
            registerMemoryLLMTasks(llm, MEMORY_OS_PLUGIN_ID);
            this.llmTasksRegistered = true;
            logger.info('[MemoryOS] 已向 LLMHub 注册任务。');
        } catch (error) {
            logger.warn('[MemoryOS] LLM 任务注册失败', error);
        }
    }

    /**
     * 功能：收集冷启动输入文本。
     * @param reason 触发原因。
     * @returns 冷启动源文本列表。
     */
    private async collectColdStartSourceBundle(
        reason?: string,
        selection?: MemoryColdStartWorldbookSelection,
    ): Promise<ColdStartSourceBundle> {
        const events = await this.eventsManager.query({ limit: 40 });
        const recentEvents = events
            .map((event: EventEnvelope<unknown>): string => {
                const payload = (event.payload ?? {}) as Record<string, unknown>;
                return String(payload.text ?? '').trim();
            })
            .filter((text: string): boolean => text.length > 0);
        const semanticSnapshot = getTavernSemanticSnapshotEvent();
        const userSnapshot = getCurrentTavernUserSnapshotEvent();
        const currentCharacter = getCurrentTavernCharacterEvent();
        const worldbookBinding = resolveTavernCharacterWorldbookBindingEvent(32);
        const hasExplicitSelection = selection !== undefined;
        const selectedWorldbooks = dedupeStrings((selection?.selectedWorldbooks ?? []).map((item): string => String(item)));
        const resolvedWorldbooks = hasExplicitSelection ? selectedWorldbooks : worldbookBinding.allBooks;
        const worldbookEntries = resolvedWorldbooks.length > 0
            ? await loadTavernWorldbookEntriesEvent(resolvedWorldbooks)
            : [];
        const selectedEntryKeys = new Set(
            (selection?.selectedEntries ?? [])
                .map((entry): string => this.buildWorldbookEntrySelectionKey(entry.book, entry.entryId)),
        );
        const filteredWorldbookEntries = selectedEntryKeys.size > 0
            ? worldbookEntries.filter((entry) => selectedEntryKeys.has(this.buildWorldbookEntrySelectionKey(entry.book, entry.entryId)))
            : worldbookEntries;
        const normalizedWorldbookBinding = {
            mainBook: resolvedWorldbooks.includes(worldbookBinding.mainBook) ? worldbookBinding.mainBook : (resolvedWorldbooks[0] ?? ''),
            extraBooks: resolvedWorldbooks.filter((bookName: string): boolean => bookName !== worldbookBinding.mainBook),
            allBooks: resolvedWorldbooks,
        };
        return buildColdStartSourceBundle({
            reason,
            currentCharacter,
            semanticSnapshot: semanticSnapshot ? {
                ...semanticSnapshot,
                activeLorebooks: resolvedWorldbooks,
            } : null,
            userSnapshot,
            worldbookBinding: normalizedWorldbookBinding,
            worldbookEntries: filteredWorldbookEntries.map((entry) => ({
                book: String(entry.book ?? '').trim(),
                entryId: String(entry.entryId ?? '').trim(),
                entry: String(entry.entry ?? '').trim(),
                keywords: dedupeStrings((entry.keywords ?? []).map((item): string => String(item))),
                content: String(entry.content ?? '').trim(),
            })),
            recentEvents,
        });
    }

    /**
     * 功能：构建世界书条目选择键。
     * @param book 世界书名。
     * @param entryId 条目 ID。
     * @returns 唯一选择键。
     */
    private buildWorldbookEntrySelectionKey(book: unknown, entryId: unknown): string {
        return `${String(book ?? '').trim()}::${String(entryId ?? '').trim()}`;
    }
}

/**
 * 功能：组装冷启动的结构化 sourceBundle 输入。
 * @param input 冷启动原始输入。
 * @returns 冷启动 sourceBundle。
 */
export function buildColdStartSourceBundle(input: {
    reason?: string;
    currentCharacter?: {
        name?: string;
        description?: string;
        desc?: string;
        personality?: string;
        scenario?: string;
        first_mes?: string;
        mes_example?: string;
        creator_notes?: string;
        tags?: string[];
    } | null;
    semanticSnapshot?: {
        systemPrompt?: string;
        firstMessage?: string;
        authorNote?: string;
        jailbreak?: string;
        instruct?: string;
        activeLorebooks?: string[];
    } | null;
    userSnapshot?: {
        userName?: string;
        counterpartName?: string;
        personaDescription?: string;
        metadataPersona?: string;
    } | null;
    worldbookBinding?: {
        mainBook?: string;
        extraBooks?: string[];
        allBooks?: string[];
    } | null;
    worldbookEntries?: Array<{
        book: string;
        entryId: string;
        entry: string;
        keywords: string[];
        content: string;
    }>;
    recentEvents?: string[];
}): ColdStartSourceBundle {
    const characterTags = dedupeStrings((input.currentCharacter?.tags ?? []).map((tag): string => String(tag)));
    return {
        reason: String(input.reason ?? '').trim(),
        characterCard: {
            name: String(input.currentCharacter?.name ?? '').trim(),
            description: String(input.currentCharacter?.description ?? input.currentCharacter?.desc ?? '').trim(),
            personality: String(input.currentCharacter?.personality ?? '').trim(),
            scenario: String(input.currentCharacter?.scenario ?? '').trim(),
            firstMessage: String(input.currentCharacter?.first_mes ?? '').trim(),
            messageExample: String(input.currentCharacter?.mes_example ?? '').trim(),
            creatorNotes: String(input.currentCharacter?.creator_notes ?? '').trim(),
            tags: characterTags,
        },
        semantic: {
            systemPrompt: String(input.semanticSnapshot?.systemPrompt ?? '').trim(),
            firstMessage: String(input.semanticSnapshot?.firstMessage ?? '').trim(),
            authorNote: String(input.semanticSnapshot?.authorNote ?? '').trim(),
            jailbreak: String(input.semanticSnapshot?.jailbreak ?? '').trim(),
            instruct: String(input.semanticSnapshot?.instruct ?? '').trim(),
            activeLorebooks: dedupeStrings((input.semanticSnapshot?.activeLorebooks ?? []).map((item): string => String(item))),
        },
        user: {
            userName: String(input.userSnapshot?.userName ?? '').trim(),
            counterpartName: String(input.userSnapshot?.counterpartName ?? '').trim(),
            personaDescription: String(input.userSnapshot?.personaDescription ?? '').trim(),
            metadataPersona: String(input.userSnapshot?.metadataPersona ?? '').trim(),
        },
        worldbooks: {
            mainBook: String(input.worldbookBinding?.mainBook ?? '').trim(),
            extraBooks: dedupeStrings((input.worldbookBinding?.extraBooks ?? []).map((item): string => String(item))),
            activeBooks: dedupeStrings((input.worldbookBinding?.allBooks ?? []).map((item): string => String(item))),
            entries: (input.worldbookEntries ?? []).map((entry) => ({
                book: String(entry.book ?? '').trim(),
                entryId: String(entry.entryId ?? '').trim(),
                entry: String(entry.entry ?? '').trim(),
                keywords: dedupeStrings((entry.keywords ?? []).map((item): string => String(item))),
                content: String(entry.content ?? '').trim(),
            })),
        },
        recentEvents: dedupeStrings((input.recentEvents ?? []).map((event): string => String(event))),
    };
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入字符串数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
