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
import { buildCompareKey, buildRelationshipCompareKey } from '../core/compare-key';
import { UnifiedMemoryManager } from '../core/unified-memory-manager';
import { normalizeRelationTag } from '../constants/relationTags';
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
    buildProgressSnapshot,
    buildTakeoverPlan,
    buildTakeoverPreviewEstimate,
    collectTakeoverSourceBundle,
    detectTakeoverNeeded,
    runTakeoverConsolidation,
    runTakeoverScheduler,
} from '../memory-takeover';
import {
    clearMemoryChatData,
    exportMemoryChatDatabaseSnapshot,
    exportMemoryPromptTestBundle,
    importMemoryPromptTestBundle,
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryOSChatState,
    readMemoryTakeoverPlan,
    type ImportMemoryPromptTestBundleResult,
    type MemoryChatDatabaseSnapshot,
    type MemoryPromptParityBaseline,
    type MemoryPromptTestBundle,
    type PromptReadyCaptureSnapshot,
    restoreArchivedMemoryChat,
    saveMemoryTakeoverPreview,
    writeMemoryTakeoverPlan,
    writeMemoryOSChatState,
} from '../db/db';
import { readMemoryOSSettings } from '../settings/store';
import { detectWorldProfile } from '../memory-world-profile';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
    MemoryTakeoverPlan,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverProgressSnapshot,
    MemoryTakeoverRelationshipCard,
} from '../types';

const AUTO_SUMMARY_MESSAGE_EVENT_TYPES: string[] = ['chat.message.sent', 'chat.message.received'];
const AUTO_SUMMARY_MIN_MESSAGE_WINDOW: number = 10;
const AUTO_SUMMARY_MAX_MESSAGE_WINDOW: number = 40;

/**
 * 功能：定义统一记忆提示词注入入参。
 */
export interface UnifiedPromptInjectInput {
    promptMessages: SdkTavernPromptMessageEvent[];
    maxTokens?: number;
    query?: string;
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
    reasonCode: string;
    errorMessage?: string;
    progress: MemoryTakeoverProgressSnapshot | null;
}

/**
 * 功能：MemoryOS 统一条目 SDK 门面。
 */
export class MemorySDKImpl {
    private readonly chatKey_: string;
    private readonly eventsManager: EventsManager;
    private readonly unifiedManager: UnifiedMemoryManager;
    private promptReadyCaptureSnapshot: PromptReadyCaptureSnapshot | null;
    private promptReadyRunResultSnapshot: Record<string, unknown> | null;
    private latestRecallExplanation: Record<string, unknown> | null;
    private llmTasksRegistered: boolean;
    private pendingColdStartDraft: {
        document: ColdStartDocument;
        candidates: ColdStartCandidate[];
        sourceBundle: ColdStartSourceBundle;
    } | null;

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
        createTakeoverPlan: (config?: MemoryTakeoverCreateInput) => Promise<MemoryTakeoverProgressSnapshot>;
        startTakeover: (takeoverId?: string) => Promise<MemoryTakeoverExecutionResult>;
        pauseTakeover: () => Promise<MemoryTakeoverProgressSnapshot>;
        resumeTakeover: () => Promise<MemoryTakeoverExecutionResult>;
        retryFailedBatch: (batchId?: string) => Promise<MemoryTakeoverExecutionResult>;
        runTakeoverConsolidation: () => Promise<MemoryTakeoverExecutionResult>;
        rebuildTakeoverRange: (startFloor: number, endFloor: number, batchSize?: number) => Promise<MemoryTakeoverExecutionResult>;
        abortTakeover: () => Promise<MemoryTakeoverProgressSnapshot>;
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
        primeColdStartPrompt: (
            _reason?: string,
            selection?: MemoryColdStartWorldbookSelection,
        ) => Promise<MemoryColdStartExecutionResult>;
        confirmColdStartCandidates: (selectedCandidateIds: string[]) => Promise<MemoryColdStartExecutionResult>;
        markColdStartDismissed: () => Promise<void>;
        flush: () => Promise<void>;
        destroy: () => Promise<void>;
        restoreArchivedMemoryChat: () => Promise<void>;
        clearCurrentChatData: () => Promise<void>;
    };
    public readonly unifiedMemory: {
        entryTypes: {
            list: ReturnType<UnifiedMemoryManager['listEntryTypes']> extends Promise<infer R>
                ? () => Promise<R>
                : never;
            save: (input: Parameters<UnifiedMemoryManager['saveEntryType']>[0]) => ReturnType<UnifiedMemoryManager['saveEntryType']>;
            remove: (key: string) => Promise<void>;
        };
        entries: {
            list: (filters?: Parameters<UnifiedMemoryManager['listEntries']>[0]) => ReturnType<UnifiedMemoryManager['listEntries']>;
            get: (entryId: string) => ReturnType<UnifiedMemoryManager['getEntry']>;
            save: (input: Parameters<UnifiedMemoryManager['saveEntry']>[0]) => ReturnType<UnifiedMemoryManager['saveEntry']>;
            remove: (entryId: string) => Promise<void>;
        };
        actors: {
            list: () => ReturnType<UnifiedMemoryManager['listActorProfiles']>;
            ensure: (input: Parameters<UnifiedMemoryManager['ensureActorProfile']>[0]) => ReturnType<UnifiedMemoryManager['ensureActorProfile']>;
            setMemoryStat: (actorKey: string, memoryStat: number) => ReturnType<UnifiedMemoryManager['setActorMemoryStat']>;
        };
        roleMemory: {
            list: (actorKey?: string) => ReturnType<UnifiedMemoryManager['listRoleMemories']>;
            bind: (actorKey: string, entryId: string) => ReturnType<UnifiedMemoryManager['bindRoleToEntry']>;
            unbind: (actorKey: string, entryId: string) => Promise<void>;
        };
        summaries: {
            list: (limit?: number) => ReturnType<UnifiedMemoryManager['listSummarySnapshots']>;
            apply: (input: Parameters<UnifiedMemoryManager['applySummarySnapshot']>[0]) => ReturnType<UnifiedMemoryManager['applySummarySnapshot']>;
            capture: (input: Parameters<UnifiedMemoryManager['captureSummaryFromChat']>[0]) => ReturnType<UnifiedMemoryManager['captureSummaryFromChat']>;
        };
         diagnostics: {
             getWorldProfileBinding: () => ReturnType<UnifiedMemoryManager['getWorldProfileBinding']>;
             listMutationHistory: (limit?: number) => ReturnType<UnifiedMemoryManager['listMutationHistory']>;
             listEntryAuditRecords: (limit?: number) => ReturnType<UnifiedMemoryManager['listEntryAuditRecords']>;
         };
        prompts: {
            preview: (input?: Parameters<UnifiedMemoryManager['buildPromptAssembly']>[0]) => ReturnType<UnifiedMemoryManager['buildPromptAssembly']>;
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
        this.unifiedManager = new UnifiedMemoryManager(this.chatKey_);
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
                const pendingStartIndex = lastSummarizedIndex + 1;
                const pendingEndIndex = messageFloorCount;
                const messages = hostMessages.length > 0
                    ? hostMessages.slice(-messageWindowLimit)
                    : await this.readSummaryMessagesFromEvents(pendingEndIndex, messageWindowLimit);
                if (messages.length <= 0) {
                    return;
                }
                const snapshot = await this.unifiedManager.captureSummaryFromChat({ messages });
                if (!snapshot) {
                    return;
                }
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
                const settings = readMemoryOSSettings();
                const existingPlan = await readMemoryTakeoverPlan(this.chatKey_);
                return detectTakeoverNeeded({
                    currentFloorCount: await this.readCurrentSummaryFloorCount(),
                    threshold: settings.takeoverDetectMinFloors,
                    existingPlan,
                });
            },
            getTakeoverStatus: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                return buildProgressSnapshot(this.chatKey_);
            },
            previewTakeoverEstimate: async (config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverPreviewEstimate> => {
                const settings = readMemoryOSSettings();
                const sourceBundle = collectTakeoverSourceBundle();
                return buildTakeoverPreviewEstimate({
                    chatKey: this.chatKey_,
                    chatId: this.chatKey_,
                    totalFloors: Math.max(1, sourceBundle.totalFloors),
                    defaults: {
                        detectMinFloors: settings.takeoverDetectMinFloors,
                        recentFloors: settings.takeoverDefaultRecentFloors,
                        batchSize: settings.takeoverDefaultBatchSize,
                        prioritizeRecent: settings.takeoverDefaultPrioritizeRecent,
                        autoContinue: settings.takeoverDefaultAutoContinue,
                        autoConsolidate: settings.takeoverDefaultAutoConsolidate,
                        pauseOnError: settings.takeoverDefaultPauseOnError,
                    },
                    config,
                    sourceBundle,
                });
            },
            createTakeoverPlan: async (config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverProgressSnapshot> => {
                const settings = readMemoryOSSettings();
                const detection = await this.chatState.detectTakeoverNeeded();
                const plan = buildTakeoverPlan({
                    chatKey: this.chatKey_,
                    chatId: this.chatKey_,
                    takeoverId: `takeover:${this.chatKey_}:${crypto.randomUUID()}`,
                    totalFloors: Math.max(detection.currentFloorCount, await this.readCurrentSummaryFloorCount()),
                    defaults: {
                        detectMinFloors: settings.takeoverDetectMinFloors,
                        recentFloors: settings.takeoverDefaultRecentFloors,
                        batchSize: settings.takeoverDefaultBatchSize,
                        prioritizeRecent: settings.takeoverDefaultPrioritizeRecent,
                        autoContinue: settings.takeoverDefaultAutoContinue,
                        autoConsolidate: settings.takeoverDefaultAutoConsolidate,
                        pauseOnError: settings.takeoverDefaultPauseOnError,
                    },
                    config,
                });
                await writeMemoryTakeoverPlan(this.chatKey_, plan);
                return buildProgressSnapshot(this.chatKey_, plan);
            },
            startTakeover: async (takeoverId?: string): Promise<MemoryTakeoverExecutionResult> => {
                this.tryRegisterLLMTasks();
                const existingPlan = await readMemoryTakeoverPlan(this.chatKey_);
                const progress = existingPlan && (!takeoverId || existingPlan.takeoverId === takeoverId)
                    ? await runTakeoverScheduler({
                        chatKey: this.chatKey_,
                        plan: existingPlan,
                        llm: readMemoryLLMApi(),
                        pluginId: MEMORY_OS_PLUGIN_ID,
                        existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                        applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                            await this.applyTakeoverConsolidation(result);
                        },
                    })
                    : await this.chatState.createTakeoverPlan().then(async (snapshot: MemoryTakeoverProgressSnapshot): Promise<MemoryTakeoverProgressSnapshot> => {
                        if (!snapshot.plan) {
                            return snapshot;
                        }
                        return runTakeoverScheduler({
                            chatKey: this.chatKey_,
                            plan: snapshot.plan,
                            llm: readMemoryLLMApi(),
                            pluginId: MEMORY_OS_PLUGIN_ID,
                            existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                            applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                                await this.applyTakeoverConsolidation(result);
                            },
                        });
                    });
                return {
                    ok: Boolean(progress.plan) && progress.plan?.status !== 'failed' && progress.plan?.status !== 'paused',
                    reasonCode: progress.plan?.status === 'completed' ? 'completed' : (progress.plan?.status ?? 'missing_plan'),
                    errorMessage: progress.plan?.status === 'failed' || progress.plan?.status === 'paused'
                        ? String(progress.plan?.lastError ?? '').trim() || undefined
                        : undefined,
                    progress,
                };
            },
            pauseTakeover: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                const plan = await readMemoryTakeoverPlan(this.chatKey_);
                if (!plan) {
                    return buildProgressSnapshot(this.chatKey_, null);
                }
                const nextPlan = {
                    ...plan,
                    status: 'paused' as const,
                    pausedAt: Date.now(),
                    updatedAt: Date.now(),
                };
                await writeMemoryTakeoverPlan(this.chatKey_, nextPlan);
                return buildProgressSnapshot(this.chatKey_, nextPlan);
            },
            resumeTakeover: async (): Promise<MemoryTakeoverExecutionResult> => {
                const plan = await readMemoryTakeoverPlan(this.chatKey_);
                if (!plan) {
                    return {
                        ok: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可恢复的旧聊天处理计划。',
                        progress: null,
                    };
                }
                const nextPlan = {
                    ...plan,
                    status: 'idle' as const,
                    pausedAt: undefined,
                    updatedAt: Date.now(),
                };
                await writeMemoryTakeoverPlan(this.chatKey_, nextPlan);
                const progress = await runTakeoverScheduler({
                    chatKey: this.chatKey_,
                    plan: nextPlan,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result);
                    },
                });
                return {
                    ok: progress.plan?.status !== 'failed' && progress.plan?.status !== 'paused',
                    reasonCode: progress.plan?.status ?? 'ok',
                    errorMessage: progress.plan?.status === 'failed' || progress.plan?.status === 'paused'
                        ? String(progress.plan?.lastError ?? '').trim() || undefined
                        : undefined,
                    progress,
                };
            },
            retryFailedBatch: async (_batchId?: string): Promise<MemoryTakeoverExecutionResult> => {
                return this.chatState.resumeTakeover();
            },
            runTakeoverConsolidation: async (): Promise<MemoryTakeoverExecutionResult> => {
                const plan = await readMemoryTakeoverPlan(this.chatKey_);
                if (!plan) {
                    return {
                        ok: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可整合的旧聊天处理计划。',
                        progress: null,
                    };
                }
                const preview = await loadMemoryTakeoverPreview(this.chatKey_);
                const batchResults = await loadMemoryTakeoverBatchResults(this.chatKey_);
                const consolidation = await runTakeoverConsolidation({
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    takeoverId: plan.takeoverId,
                    activeSnapshot: preview.activeSnapshot,
                    batchResults,
                });
                await saveMemoryTakeoverPreview(this.chatKey_, 'consolidation', consolidation);
                await this.applyTakeoverConsolidation(consolidation);
                const nextPlan = {
                    ...plan,
                    status: 'completed' as const,
                    completedAt: Date.now(),
                    updatedAt: Date.now(),
                };
                await writeMemoryTakeoverPlan(this.chatKey_, nextPlan);
                return {
                    ok: true,
                    reasonCode: 'completed',
                    progress: await buildProgressSnapshot(this.chatKey_, nextPlan),
                };
            },
            rebuildTakeoverRange: async (startFloor: number, endFloor: number, batchSize?: number): Promise<MemoryTakeoverExecutionResult> => {
                const snapshot = await this.chatState.createTakeoverPlan({
                    mode: 'custom_range',
                    startFloor,
                    endFloor,
                    batchSize,
                });
                if (!snapshot.plan) {
                    return {
                        ok: false,
                        reasonCode: 'takeover_plan_missing',
                        errorMessage: '当前聊天还没有可重建区间的旧聊天处理计划。',
                        progress: snapshot,
                    };
                }
                const progress = await runTakeoverScheduler({
                    chatKey: this.chatKey_,
                    plan: snapshot.plan,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    existingKnownEntities: await this.readTakeoverExistingKnownEntities(),
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result);
                    },
                });
                return {
                    ok: progress.plan?.status !== 'failed' && progress.plan?.status !== 'paused',
                    reasonCode: progress.plan?.status ?? 'ok',
                    errorMessage: progress.plan?.status === 'failed' || progress.plan?.status === 'paused'
                        ? String(progress.plan?.lastError ?? '').trim() || undefined
                        : undefined,
                    progress,
                };
            },
            abortTakeover: async (): Promise<MemoryTakeoverProgressSnapshot> => {
                const plan = await readMemoryTakeoverPlan(this.chatKey_);
                if (!plan) {
                    return buildProgressSnapshot(this.chatKey_);
                }
                const nextPlan = {
                    ...plan,
                    status: 'failed' as const,
                    lastError: 'manual_abort',
                    updatedAt: Date.now(),
                };
                await writeMemoryTakeoverPlan(this.chatKey_, nextPlan);
                return buildProgressSnapshot(this.chatKey_, nextPlan);
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
            primeColdStartPrompt: async (
                _reason?: string,
                selection?: MemoryColdStartWorldbookSelection,
            ): Promise<MemoryColdStartExecutionResult> => {
                const triggerTs: number = Date.now();
                const selectedLorebookEntryIds = (selection?.selectedEntries ?? []).map((item) => `${item.book}:${item.entryId}`);
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
                const sourceBundle = await this.collectColdStartSourceBundle(_reason, selection);
                const result = await runBootstrapOrchestrator({
                    dependencies: {
                        ensureActorProfile: async (input): Promise<unknown> => this.unifiedManager.ensureActorProfile(input),
                        saveEntry: async (input): Promise<any> => this.unifiedManager.saveEntry(input),
                        bindRoleToEntry: async (actorKey: string, entryId: string): Promise<unknown> => this.unifiedManager.bindRoleToEntry(actorKey, entryId),
                        putWorldProfileBinding: async (binding): Promise<unknown> => this.unifiedManager.putWorldProfileBinding(binding),
                        appendMutationHistory: async (history): Promise<unknown> => this.unifiedManager.appendMutationHistory(history),
                    },
                    llm,
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    sourceBundle,
                });
                if (!result.ok) {
                    this.pendingColdStartDraft = null;
                    await this.writeColdStartState({
                        coldStartLastFailedAt: Date.now(),
                        coldStartLastReasonCode: result.reasonCode,
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
                        ensureActorProfile: async (input): Promise<unknown> => this.unifiedManager.ensureActorProfile(input),
                        saveEntry: async (input): Promise<any> => this.unifiedManager.saveEntry(input),
                        bindRoleToEntry: async (actorKey: string, entryId: string): Promise<unknown> => this.unifiedManager.bindRoleToEntry(actorKey, entryId),
                        putWorldProfileBinding: async (binding): Promise<unknown> => this.unifiedManager.putWorldProfileBinding(binding),
                        appendMutationHistory: async (history): Promise<unknown> => this.unifiedManager.appendMutationHistory(history),
                    },
                    document: this.pendingColdStartDraft.document,
                    sourceBundle: this.pendingColdStartDraft.sourceBundle,
                    selectedCandidates,
                });
                this.pendingColdStartDraft = null;
                await this.writeColdStartState({
                    coldStartCompletedAt: Date.now(),
                    coldStartConfirmedAt: Date.now(),
                    coldStartDismissedAt: undefined,
                    coldStartSelectedCandidateIds: selectedCandidates.map((candidate: ColdStartCandidate): string => candidate.id),
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
                list: async () => this.unifiedManager.listEntryTypes(),
                save: async (input: Parameters<UnifiedMemoryManager['saveEntryType']>[0]) => this.unifiedManager.saveEntryType(input),
                remove: async (key: string) => this.unifiedManager.deleteEntryType(key),
            },
            entries: {
                list: async (filters?: Parameters<UnifiedMemoryManager['listEntries']>[0]) => this.unifiedManager.listEntries(filters),
                get: async (entryId: string) => this.unifiedManager.getEntry(entryId),
                save: async (input: Parameters<UnifiedMemoryManager['saveEntry']>[0]) => this.unifiedManager.saveEntry(input),
                remove: async (entryId: string) => this.unifiedManager.deleteEntry(entryId),
            },
            actors: {
                list: async () => this.unifiedManager.listActorProfiles(),
                ensure: async (input: Parameters<UnifiedMemoryManager['ensureActorProfile']>[0]) => this.unifiedManager.ensureActorProfile(input),
                setMemoryStat: async (actorKey: string, memoryStat: number) => this.unifiedManager.setActorMemoryStat(actorKey, memoryStat),
            },
            roleMemory: {
                list: async (actorKey?: string) => this.unifiedManager.listRoleMemories(actorKey),
                bind: async (actorKey: string, entryId: string) => this.unifiedManager.bindRoleToEntry(actorKey, entryId),
                unbind: async (actorKey: string, entryId: string) => this.unifiedManager.unbindRoleFromEntry(actorKey, entryId),
            },
            summaries: {
                list: async (limit?: number) => this.unifiedManager.listSummarySnapshots(limit),
                apply: async (input: Parameters<UnifiedMemoryManager['applySummarySnapshot']>[0]) => this.unifiedManager.applySummarySnapshot(input),
                capture: async (input: Parameters<UnifiedMemoryManager['captureSummaryFromChat']>[0]) => this.unifiedManager.captureSummaryFromChat(input),
            },
             diagnostics: {
                 getWorldProfileBinding: async () => this.unifiedManager.getWorldProfileBinding(),
                 listMutationHistory: async (limit?: number) => this.unifiedManager.listMutationHistory(limit),
                 listEntryAuditRecords: async (limit?: number) => this.unifiedManager.listEntryAuditRecords(limit),
              },
            prompts: {
                preview: async (input?: Parameters<UnifiedMemoryManager['buildPromptAssembly']>[0]) => this.unifiedManager.buildPromptAssembly(input ?? {}),
                inject: async (input: UnifiedPromptInjectInput): Promise<UnifiedPromptInjectResult> => {
                    const preview = await this.unifiedManager.buildPromptAssembly({
                        query: input.query,
                        promptMessages: input.promptMessages,
                        maxTokens: input.maxTokens,
                    });
                    const content = String(preview.finalText ?? '').trim();
                    const shouldInject = content.length > 0;
                    const insertIndex = this.resolveInsertIndex(input.promptMessages);
                    if (shouldInject && insertIndex >= 0) {
                        input.promptMessages.splice(insertIndex, 0, {
                            role: 'system',
                            content: `[Memory Context]\n<memoryos_context>\n${content}\n</memoryos_context>`,
                        } as unknown as SdkTavernPromptMessageEvent);
                    }
                    this.latestRecallExplanation = {
                        generatedAt: Date.now(),
                        query: String(preview.query ?? ''),
                        matchedActorKeys: preview.matchedActorKeys,
                        matchedEntryIds: preview.matchedEntryIds,
                        reasonCodes: preview.reasonCodes,
                        source: 'unified_memory',
                        retrievalProviderId: preview.diagnostics?.providerId,
                        retrievalRulePack: preview.diagnostics?.rulePackMode,
                        contextRoute: preview.diagnostics?.contextRoute ?? null,
                        matchedRules: preview.diagnostics?.contextRoute?.matchedRules ?? [],
                        subQueries: preview.diagnostics?.contextRoute?.subQueries ?? [],
                        routeReasons: preview.diagnostics?.contextRoute?.reasons ?? [],
                        traceRecords: preview.diagnostics?.traceRecords ?? [],
                    };
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
        await this.unifiedManager.init();
        this.tryRegisterLLMTasks();
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
     * 功能：把旧聊天接管最终整合结果写入正式记忆层。
     * @param result 接管整合结果。
     * @returns 异步完成。
     */
    private async applyTakeoverConsolidation(result: MemoryTakeoverConsolidationResult): Promise<void> {
        for (const actorCard of result.actorCards ?? []) {
            await this.persistTakeoverActorCard(actorCard, result.takeoverId);
        }

        const existingActorCards = await this.readTakeoverExistingActorCards();
        const existingKnownEntities = await this.readTakeoverExistingKnownEntities();

        for (const entityCard of result.entityCards ?? []) {
            await this.persistTakeoverEntityCard(entityCard, result.takeoverId);
        }

        for (const entityTransition of result.entityTransitions ?? []) {
            await this.applyTakeoverEntityTransition(entityTransition, result.takeoverId);
        }

        for (const fact of result.longTermFacts) {
            const savedEntry = await this.unifiedManager.saveEntry({
                title: `${fact.subject} · ${fact.predicate}`,
                entryType: this.resolveTakeoverFactEntryType(fact.type),
                category: this.resolveTakeoverFactCategory(fact.type),
                tags: [fact.type].filter(Boolean),
                summary: fact.value,
                detail: `${fact.subject}${fact.predicate}${fact.value}`,
                detailPayload: {
                    fields: {
                        type: fact.type,
                        subject: fact.subject,
                        predicate: fact.predicate,
                        value: fact.value,
                        confidence: fact.confidence,
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                    },
                },
            }, {
                actionType: 'ADD',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_long_term_fact'],
            });
            await this.bindTakeoverFactActors(savedEntry.entryId, fact, result.actorCards ?? [], existingActorCards);
        }
        for (const relationship of result.relationships ?? []) {
            await this.persistTakeoverStructuredRelationship({
                relationship,
                actorCards: result.actorCards ?? [],
                existingActorCards,
                takeoverId: result.takeoverId,
            });
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
                await this.persistTakeoverActorRelation({
                    actorKey: resolvedRelationActor.actorKey,
                    displayName: resolvedRelationActor.displayName,
                    relationState: relation.state,
                    relationReason: relation.reason,
                    relationTag,
                    takeoverId: result.takeoverId,
                });
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
                    relationState: relation.state,
                    relationReason: relation.reason,
                    relationTag,
                    takeoverId: result.takeoverId,
                });
                continue;
            }
            const targetActorKey = this.normalizeTakeoverActorKey(relation.target);
            if (!targetActorKey) {
                continue;
            }
            await this.persistTakeoverActorRelation({
                actorKey: targetActorKey,
                displayName: relation.target,
                relationState: relation.state,
                relationReason: relation.reason,
                relationTag,
                takeoverId: result.takeoverId,
            });
        }

        for (const task of result.taskState) {
            const savedEntry = await this.unifiedManager.saveEntry({
                title: task.task,
                entryType: 'task',
                category: '任务',
                tags: ['任务'],
                summary: task.state,
                detail: `任务当前状态：${task.state}`,
                detailPayload: {
                    fields: {
                        state: task.state,
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                    },
                },
            }, {
                actionType: 'ADD',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_task_state'],
            });
            await this.unifiedManager.bindRoleToEntry('user', savedEntry.entryId);
        }

        for (const [key, value] of Object.entries(result.worldState ?? {})) {
            await this.unifiedManager.saveEntry({
                title: key,
                entryType: 'world_global_state',
                category: '世界观',
                tags: ['世界状态'],
                summary: value,
                detail: value,
                detailPayload: {
                    fields: {
                        scope: 'global',
                        state: 'active',
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                    },
                },
            }, {
                actionType: 'ADD',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_world_state'],
            });
        }

        await this.writeTakeoverSnapshotSummary(result.activeSnapshot, result);
        await this.bindWorldProfileFromTakeover(result);
        await this.markColdStartCompletedFromTakeover();
    }

    /**
     * 功能：读取当前聊天已存在的角色卡列表，供旧聊天批处理提示词复用。
     * @returns 已存在角色卡的精简列表。
     */
    private async readTakeoverExistingActorCards(): Promise<Array<{ actorKey: string; displayName: string }>> {
        const actorProfiles = await this.unifiedManager.listActorProfiles();
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
        organizations: Array<{ entityKey: string; displayName: string }>;
        cities: Array<{ entityKey: string; displayName: string }>;
        nations: Array<{ entityKey: string; displayName: string }>;
        locations: Array<{ entityKey: string; displayName: string }>;
        tasks: Array<{ entityKey: string; displayName: string }>;
        worldStates: Array<{ entityKey: string; displayName: string }>;
    }> {
        const actors = await this.readTakeoverExistingActorCards();
        const organizationEntries = await this.unifiedManager.listEntries({ entryType: 'organization' });
        const cityEntries = await this.unifiedManager.listEntries({ entryType: 'city' });
        const nationEntries = await this.unifiedManager.listEntries({ entryType: 'nation' });
        const locationEntries = await this.unifiedManager.listEntries({ entryType: 'location' });
        const taskEntries = await this.unifiedManager.listEntries({ entryType: 'task' });
        const worldEntries = await this.unifiedManager.listEntries();
        return {
            actors,
            organizations: this.dedupeTakeoverEntityRefs(organizationEntries.map((entry) => ({
                entityKey: String(entry.entryId ?? '').trim(),
                displayName: String(entry.title ?? '').trim(),
            }))),
            cities: this.dedupeTakeoverEntityRefs(cityEntries.map((entry) => ({
                entityKey: String(entry.entryId ?? '').trim(),
                displayName: String(entry.title ?? '').trim(),
            }))),
            nations: this.dedupeTakeoverEntityRefs(nationEntries.map((entry) => ({
                entityKey: String(entry.entryId ?? '').trim(),
                displayName: String(entry.title ?? '').trim(),
            }))),
            locations: this.dedupeTakeoverEntityRefs(locationEntries.map((entry) => ({
                entityKey: String(entry.entryId ?? '').trim(),
                displayName: String(entry.title ?? '').trim(),
            }))),
            tasks: this.dedupeTakeoverEntityRefs(taskEntries.map((entry) => ({
                entityKey: String(entry.entryId ?? '').trim(),
                displayName: String(entry.title ?? '').trim(),
            }))),
            worldStates: this.dedupeTakeoverEntityRefs(worldEntries
                .filter((entry): boolean => ['world_global_state', 'world_core_setting', 'world_hard_rule'].includes(String(entry.entryType ?? '').trim()))
                .map((entry) => ({
                    entityKey: String(entry.entryId ?? '').trim(),
                    displayName: String(entry.title ?? '').trim(),
                }))),
        };
    }

    /**
     * 功能：把旧聊天处理识别出的角色卡候选写入正式角色卡条目。
     * @param actorCard 角色卡候选。
     * @param takeoverId 接管任务 ID。
     * @returns 异步完成。
     */
    /**
     * 功能：写入旧聊天接管识别出的角色关系。
     * @param input 关系写入参数。
     * @returns 异步完成。
     */
    private async persistTakeoverActorRelation(input: {
        actorKey: string;
        displayName: string;
        relationState: string;
        relationReason: string;
        relationTag: string;
        takeoverId: string;
    }): Promise<void> {
        await this.unifiedManager.ensureActorProfile({
            actorKey: input.actorKey,
            displayName: input.displayName,
        });
        await this.persistTakeoverRelationshipEntry({
            sourceActorKey: 'user',
            sourceDisplayName: '用户',
            targetActorKey: input.actorKey,
            targetDisplayName: input.displayName,
            relationTag: input.relationTag,
            state: input.relationState,
            summary: input.relationReason || input.relationState,
            trust: 0,
            affection: 0,
            tension: 0,
            participants: ['user', input.actorKey],
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
    }): Promise<void> {
        const sourceActor = this.resolveTakeoverActorByKey(
            input.relationship.sourceActorKey,
            input.actorCards,
            input.existingActorCards,
        );
        const targetActor = this.resolveTakeoverActorByKey(
            input.relationship.targetActorKey,
            input.actorCards,
            input.existingActorCards,
        );
        if (!sourceActor || !targetActor || sourceActor.actorKey === targetActor.actorKey) {
            return;
        }
        await this.persistTakeoverRelationshipEntry({
            sourceActorKey: sourceActor.actorKey,
            sourceDisplayName: sourceActor.displayName,
            targetActorKey: targetActor.actorKey,
            targetDisplayName: targetActor.displayName,
            relationTag: normalizeRelationTag(input.relationship.relationTag) || '朋友',
            state: String(input.relationship.state ?? '').trim(),
            summary: String(input.relationship.summary ?? '').trim() || String(input.relationship.state ?? '').trim(),
            trust: Number(input.relationship.trust),
            affection: Number(input.relationship.affection),
            tension: Number(input.relationship.tension),
            participants: [
                sourceActor.actorKey,
                targetActor.actorKey,
                ...((input.relationship.participants ?? []).map((item: string): string => String(item ?? '').trim().toLowerCase())),
            ],
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
        sourceDisplayName: string;
        targetActorKey: string;
        targetDisplayName: string;
        relationTag: string;
        state: string;
        summary: string;
        trust: number;
        affection: number;
        tension: number;
        participants: string[];
        takeoverId: string;
        reasonCode: string;
    }): Promise<void> {
        const compareKey = buildRelationshipCompareKey(input.sourceActorKey, input.targetActorKey);
        const existingEntries = await this.unifiedManager.listEntries({ entryType: 'relationship' });
        const existingEntry = existingEntries.find((entry) => {
            const payload = this.toRecord(entry.detailPayload);
            const fields = this.toRecord(payload.fields);
            return String(payload.compareKey ?? fields.compareKey ?? '').trim() === compareKey;
        }) ?? null;
        const normalizedParticipants = this.dedupeTakeoverStringList([
            input.sourceActorKey,
            input.targetActorKey,
            ...(input.participants ?? []),
        ]);
        const normalizedTrust = this.clampTakeover01(input.trust);
        const normalizedAffection = this.clampTakeover01(input.affection);
        const normalizedTension = this.clampTakeover01(input.tension);
        const savedEntry = await this.unifiedManager.saveEntry({
            entryId: existingEntry?.entryId,
            title: `${input.sourceDisplayName} -> ${input.targetDisplayName}`,
            entryType: 'relationship',
            category: '角色关系',
            tags: this.dedupeTakeoverStringList(['关系', input.relationTag]),
            summary: input.summary,
            detail: input.state,
            detailPayload: {
                ...(existingEntry?.detailPayload ?? {}),
                compareKey,
                sourceActorKey: input.sourceActorKey,
                targetActorKey: input.targetActorKey,
                trust: normalizedTrust,
                affection: normalizedAffection,
                tension: normalizedTension,
                fields: {
                    ...this.toRecord(this.toRecord(existingEntry?.detailPayload).fields),
                    compareKey,
                    relationTag: input.relationTag,
                    state: input.state,
                    summary: input.summary,
                    participants: normalizedParticipants,
                    trust: normalizedTrust,
                    affection: normalizedAffection,
                    tension: normalizedTension,
                },
                takeover: {
                    source: 'old_chat_takeover',
                    takeoverId: input.takeoverId,
                },
            },
        }, {
            actionType: existingEntry ? 'UPDATE' : 'ADD',
            sourceLabel: '旧聊天接管整合',
            reasonCodes: [existingEntry ? `${input.reasonCode}_update` : `${input.reasonCode}_add`],
        });
        await this.unifiedManager.bindRoleToEntry(input.sourceActorKey, savedEntry.entryId);
        await this.unifiedManager.bindRoleToEntry(input.targetActorKey, savedEntry.entryId);
    }

    /**
     * 功能：把旧聊天事实条目绑定到命中的角色卡。
     * @param entryId 事实条目 ID。
     * @param fact 事实对象。
     * @param actorCards 本次整合识别出的角色卡。
     * @param existingActorCards 当前聊天已存在的角色卡。
     * @returns 异步完成。
     */
    private async bindTakeoverFactActors(
        entryId: string,
        fact: {
            type: string;
            subject: string;
            predicate: string;
            value: string;
        },
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>,
        existingActorCards: Array<{ actorKey: string; displayName: string }>,
    ): Promise<void> {
        const entryType = this.resolveTakeoverFactEntryType(fact.type);
        if (!['event', 'actor_profile', 'relationship', 'task'].includes(entryType)) {
            return;
        }
        const actorKeys = this.resolveTakeoverMentionedActorKeys(
            [fact.subject, fact.value, `${fact.subject}${fact.predicate}${fact.value}`],
            actorCards,
            existingActorCards,
        );
        for (const actorKey of actorKeys) {
            await this.unifiedManager.bindRoleToEntry(actorKey, entryId);
        }
    }

    /**
     * 功能：把旧聊天接管识别出的实体关系补写到对应实体条目。
     * @param input 实体关系写入参数。
     * @returns 异步完成。
     */
    private async persistTakeoverEntityRelation(input: {
        entityKey: string;
        displayName: string;
        entityType: 'organization' | 'city' | 'nation' | 'location';
        relationState: string;
        relationReason: string;
        relationTag: string;
        takeoverId: string;
    }): Promise<void> {
        const entry = await this.unifiedManager.getEntry(input.entityKey);
        if (!entry) {
            return;
        }
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        await this.unifiedManager.saveEntry({
            entryId: entry.entryId,
            title: entry.title,
            entryType: entry.entryType,
            category: entry.category,
            tags: this.dedupeTakeoverStringList([...(entry.tags ?? []), '关系']),
            summary: entry.summary,
            detail: entry.detail,
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
        }, {
            actionType: 'UPDATE',
            sourceLabel: '旧聊天接管整合',
            reasonCodes: ['takeover_entity_relation_update'],
        });
    }

    /**
     * 功能：解析旧聊天关系目标对应的实体条目。
     * @param targetName 关系目标名称。
     * @param targetType 目标类型。
     * @param entityCards 本次识别出的实体卡。
     * @param knownEntities 当前已存在的实体引用。
     * @returns 实体匹配结果；未匹配时返回 null。
     */
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
            organizations: Array<{ entityKey: string; displayName: string }>;
            cities: Array<{ entityKey: string; displayName: string }>;
            nations: Array<{ entityKey: string; displayName: string }>;
            locations: Array<{ entityKey: string; displayName: string }>;
        },
    ): { entityKey: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
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
        const actorKey = this.resolveTakeoverActorKey(actorCard.actorKey, actorCard.displayName);
        const displayName = String(actorCard.displayName ?? '').trim();
        if (!actorKey || actorKey === 'user' || !displayName) {
            return;
        }

        await this.unifiedManager.ensureActorProfile({
            actorKey,
            displayName,
        });

        const existingActorEntries = await this.unifiedManager.listEntries({
            entryType: 'actor_profile',
            rememberedByActorKey: actorKey,
        });
        const existingEntry = existingActorEntries[0] ?? null;
        const identityFacts = this.dedupeTakeoverStringList(actorCard.identityFacts ?? []);
        const originFacts = this.dedupeTakeoverStringList(actorCard.originFacts ?? []);
        const traits = this.dedupeTakeoverStringList(actorCard.traits ?? []);
        const aliases = this.dedupeTakeoverStringList(actorCard.aliases ?? []);
        const summary = identityFacts.join('；') || `${displayName}的角色卡`;

        const savedEntry = await this.unifiedManager.saveEntry({
            entryId: existingEntry?.entryId,
            title: displayName,
            entryType: 'actor_profile',
            category: '角色关系',
            tags: existingEntry?.tags?.length ? existingEntry.tags : ['actor_profile'],
            summary,
            detail: existingEntry?.detail ?? '',
            detailPayload: {
                ...(existingEntry?.detailPayload ?? {}),
                fields: {
                    aliases,
                    identityFacts,
                    originFacts,
                    traits,
                },
                takeover: {
                    source: 'old_chat_takeover',
                    takeoverId,
                },
            },
            sourceSummaryIds: existingEntry?.sourceSummaryIds ?? [],
        }, {
            actionType: existingEntry ? 'UPDATE' : 'ADD',
            sourceLabel: '旧聊天接管整合',
            reasonCodes: [existingEntry ? 'takeover_actor_card_update' : 'takeover_actor_card_add'],
        });
        await this.unifiedManager.bindRoleToEntry(actorKey, savedEntry.entryId);
    }

    /**
     * 功能：把旧聊天处理识别出的世界实体卡候选写入正式实体条目。
     * @param entityCard 实体卡候选。
     * @param takeoverId 接管任务 ID。
     * @returns 异步完成。
     */
    private async persistTakeoverEntityCard(
        entityCard: {
            entityType: string;
            compareKey: string;
            title: string;
            aliases?: string[];
            summary?: string;
            fields?: Record<string, unknown>;
            confidence?: number;
        },
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
        const existingEntries = await this.unifiedManager.listEntries({ entryType: entityType });
        const existingEntry = existingEntries.find((entry) => this.matchTakeoverEntityEntry(entry, compareKey, title)) ?? null;

        const aliases = this.dedupeTakeoverStringList(entityCard.aliases ?? []);
        const summary = String(entityCard.summary ?? '').trim() || `${title}的${categoryMap[entityType] ?? '实体'}信息`;
        const fields = entityCard.fields && typeof entityCard.fields === 'object' ? entityCard.fields : {};

        await this.unifiedManager.saveEntry({
            entryId: existingEntry?.entryId,
            title,
            entryType: entityType,
            category: categoryMap[entityType] ?? '其他',
            tags: existingEntry?.tags?.length ? existingEntry.tags : [entityType],
            summary,
            detail: existingEntry?.detail ?? '',
            detailPayload: {
                ...(existingEntry?.detailPayload ?? {}),
                compareKey,
                fields: {
                    ...(existingEntry?.detailPayload as Record<string, unknown>)?.fields as Record<string, unknown> ?? {},
                    ...fields,
                    aliases,
                    compareKey,
                    confidence: Math.max(0, Math.min(1, Number(entityCard.confidence) || 0)),
                },
                takeover: {
                    source: 'old_chat_takeover',
                    takeoverId,
                },
            },
        }, {
            actionType: existingEntry ? 'UPDATE' : 'ADD',
            sourceLabel: '旧聊天接管整合',
            reasonCodes: [existingEntry ? 'takeover_entity_card_update' : 'takeover_entity_card_add'],
        });
    }

    /**
     * 功能：应用旧聊天处理识别出的世界实体变更。
     * @param transition 实体变更。
     * @param takeoverId 接管任务 ID。
     * @returns 异步完成。
     */
    private async applyTakeoverEntityTransition(
        transition: {
            entityType: string;
            compareKey: string;
            title: string;
            action: string;
            reason: string;
            payload: Record<string, unknown>;
        },
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
        const existingEntries = await this.unifiedManager.listEntries({ entryType: entityType });
        const existingEntry = existingEntries.find((entry) => this.matchTakeoverEntityEntry(entry, compareKey, title)) ?? null;

        if (action === 'INVALIDATE' && existingEntry) {
            await this.unifiedManager.saveEntry({
                entryId: existingEntry.entryId,
                title: existingEntry.title,
                entryType: entityType,
                category: categoryMap[entityType] ?? '其他',
                tags: existingEntry.tags ?? [entityType],
                summary: `[已失效] ${existingEntry.summary ?? ''}`,
                detail: existingEntry.detail ?? '',
                detailPayload: {
                    ...(existingEntry.detailPayload ?? {}),
                    compareKey,
                    lifecycle: { status: 'invalidated', reason: transition.reason },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }, {
                actionType: 'UPDATE',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_entity_invalidate'],
            });
            return;
        }

        if (action === 'DELETE' && existingEntry) {
            await this.unifiedManager.saveEntry({
                entryId: existingEntry.entryId,
                title: existingEntry.title,
                entryType: entityType,
                category: categoryMap[entityType] ?? '其他',
                tags: existingEntry.tags ?? [entityType],
                summary: `[已删除] ${existingEntry.summary ?? ''}`,
                detail: existingEntry.detail ?? '',
                detailPayload: {
                    ...(existingEntry.detailPayload ?? {}),
                    compareKey,
                    lifecycle: { status: 'archived', reason: transition.reason },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }, {
                actionType: 'UPDATE',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_entity_delete'],
            });
            return;
        }

        if ((action === 'ADD' || action === 'UPDATE' || action === 'MERGE') && transition.payload) {
            const summary = String(transition.payload.summary ?? transition.reason ?? '').trim();
            await this.unifiedManager.saveEntry({
                entryId: existingEntry?.entryId,
                title,
                entryType: entityType,
                category: categoryMap[entityType] ?? '其他',
                tags: existingEntry?.tags?.length ? existingEntry.tags : [entityType],
                summary: summary || `${title}的${categoryMap[entityType] ?? '实体'}信息`,
                detail: existingEntry?.detail ?? '',
                detailPayload: {
                    ...(existingEntry?.detailPayload ?? {}),
                    compareKey,
                    fields: {
                        ...(existingEntry?.detailPayload as Record<string, unknown>)?.fields as Record<string, unknown> ?? {},
                        compareKey,
                        ...transition.payload,
                    },
                    takeover: { source: 'old_chat_takeover', takeoverId },
                },
            }, {
                actionType: existingEntry ? 'UPDATE' : 'ADD',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: [`takeover_entity_${action.toLowerCase()}`],
            });
        }
    }

    /**
     * 功能：从条目中提取别名列表。
     * @param entry 条目。
     * @returns 别名列表。
     */
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
     * 功能：在旧聊天接管完成后，根据整合结果补写世界画像绑定。
     * @param result 旧聊天接管整合结果。
     * @returns 异步完成。
     */
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
            organizations: Array<{ entityKey: string; displayName: string }>;
            cities: Array<{ entityKey: string; displayName: string }>;
            nations: Array<{ entityKey: string; displayName: string }>;
            locations: Array<{ entityKey: string; displayName: string }>;
        },
    ): { entityKey: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
        const refs = this.resolveTakeoverEntityRefGroup(entityType, knownEntities);
        return refs.find((item) => item.entityKey === compareKey) ?? null;
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
            organizations: Array<{ entityKey: string; displayName: string }>;
            cities: Array<{ entityKey: string; displayName: string }>;
            nations: Array<{ entityKey: string; displayName: string }>;
            locations: Array<{ entityKey: string; displayName: string }>;
        },
    ): { entityKey: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' } | null {
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
            organizations: Array<{ entityKey: string; displayName: string }>;
            cities: Array<{ entityKey: string; displayName: string }>;
            nations: Array<{ entityKey: string; displayName: string }>;
            locations: Array<{ entityKey: string; displayName: string }>;
        },
    ): Array<{ entityKey: string; displayName: string; entityType: 'organization' | 'city' | 'nation' | 'location' }> {
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
        const detection = detectWorldProfile({
            texts: detectedFrom,
        });
        await this.unifiedManager.putWorldProfileBinding({
            primaryProfile: detection.primaryProfile,
            secondaryProfiles: detection.secondaryProfiles,
            confidence: detection.confidence,
            reasonCodes: detection.reasonCodes,
            detectedFrom,
        });
        await this.unifiedManager.appendMutationHistory({
            action: 'world_profile_bound',
            payload: {
                source: 'old_chat_takeover',
                takeoverId: result.takeoverId,
                primaryProfile: detection.primaryProfile,
                secondaryProfiles: detection.secondaryProfiles,
                confidence: detection.confidence,
                reasonCodes: detection.reasonCodes,
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
    private dedupeTakeoverEntityRefs(values: Array<{ entityKey: string; displayName: string }>): Array<{ entityKey: string; displayName: string }> {
        const result: Array<{ entityKey: string; displayName: string }> = [];
        const seen = new Set<string>();
        for (const value of values) {
            const entityKey = String(value.entityKey ?? '').trim();
            const displayName = String(value.displayName ?? '').trim();
            if (!entityKey || !displayName || seen.has(entityKey)) {
                continue;
            }
            seen.add(entityKey);
            result.push({ entityKey, displayName });
        }
        return result;
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
    ): Promise<void> {
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
            return;
        }
        await this.unifiedManager.applySummarySnapshot({
            title: '旧聊天接管整合快照',
            content: contentLines.join('\n'),
            actorKeys: ['user'],
        });
    }

    /**
     * 功能：归一化接管结果中的角色键。
     * @param value 原始角色标识。
     * @returns 角色键。
     */
    /**
     * 功能：解析旧聊天关系目标是否应视为真实角色。
     * @param targetName 关系目标名称。
     * @param actorCards 本次整合识别出的角色卡。
     * @param existingActorCards 当前聊天已存在的角色卡。
     * @returns 可用角色目标；无法确认时返回 null。
     */
    private resolveTakeoverRelationActorTarget(
        targetName: string,
        actorCards: Array<{
            actorKey: string;
            displayName: string;
            aliases?: string[];
        }>,
        existingActorCards: Array<{ actorKey: string; displayName: string }>,
    ): { actorKey: string; displayName: string } | null {
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

        return null;
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
        return null;
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
     * 功能：把旧聊天事实类型映射为正式记忆分类。
     * @param factType 旧聊天事实类型。
     * @returns 对应的分类名称。
     */
    private resolveTakeoverFactCategory(factType: string): string {
        const normalizedType = String(factType ?? '').trim().toLowerCase();
        if (normalizedType === 'location') {
            return '地点';
        }
        if (normalizedType === 'faction' || normalizedType === 'organization') {
            return '组织';
        }
        if (normalizedType === 'city') {
            return '城市';
        }
        if (normalizedType === 'nation') {
            return '国家';
        }
        if (normalizedType === 'event') {
            return '事件';
        }
        if (normalizedType === 'artifact' || normalizedType === 'item') {
            return '物品';
        }
        if (normalizedType === 'world') {
            return '世界基础';
        }
        return '其他';
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
     * 功能：将未知值归一化为字符串数组并去重。
     * @param value 原始输入。
     * @returns 归一化数组。
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
        const worldProfileBinding = await this.unifiedManager.getWorldProfileBinding();
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
