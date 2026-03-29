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
import { UnifiedMemoryManager } from '../core/unified-memory-manager';
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
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
    MemoryTakeoverPlan,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverProgressSnapshot,
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
                            applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                                await this.applyTakeoverConsolidation(result);
                            },
                        });
                    });
                return {
                    ok: Boolean(progress.plan),
                    reasonCode: progress.plan?.status === 'completed' ? 'completed' : (progress.plan?.status ?? 'missing_plan'),
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
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result);
                    },
                });
                return {
                    ok: true,
                    reasonCode: progress.plan?.status ?? 'ok',
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
                        progress: snapshot,
                    };
                }
                const progress = await runTakeoverScheduler({
                    chatKey: this.chatKey_,
                    plan: snapshot.plan,
                    llm: readMemoryLLMApi(),
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    applyConsolidation: async (result: MemoryTakeoverConsolidationResult): Promise<void> => {
                        await this.applyTakeoverConsolidation(result);
                    },
                });
                return {
                    ok: true,
                    reasonCode: progress.plan?.status ?? 'ok',
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
     * 功能：把旧聊天接管最终整合结果写入正式记忆层。
     * @param result 接管整合结果。
     * @returns 异步完成。
     */
    private async applyTakeoverConsolidation(result: MemoryTakeoverConsolidationResult): Promise<void> {
        for (const fact of result.longTermFacts) {
            await this.unifiedManager.saveEntry({
                title: `${fact.subject} · ${fact.predicate}`,
                entryType: 'other',
                category: '其他',
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
        }

        for (const relation of result.relationState) {
            const targetActorKey = this.normalizeTakeoverActorKey(relation.target);
            await this.unifiedManager.ensureActorProfile({
                actorKey: targetActorKey,
                displayName: relation.target,
            });
            const savedEntry = await this.unifiedManager.saveEntry({
                title: `user -> ${targetActorKey}`,
                entryType: 'relationship',
                category: '角色关系',
                tags: ['关系'],
                summary: relation.state,
                detail: relation.reason,
                detailPayload: {
                    sourceActorKey: 'user',
                    targetActorKey,
                    fields: {
                        relationTag: '朋友',
                        state: relation.state,
                        reason: relation.reason,
                        participants: ['user', targetActorKey],
                    },
                    takeover: {
                        source: 'old_chat_takeover',
                        takeoverId: result.takeoverId,
                    },
                },
            }, {
                actionType: 'ADD',
                sourceLabel: '旧聊天接管整合',
                reasonCodes: ['takeover_relation_state'],
            });
            await this.unifiedManager.bindRoleToEntry('user', savedEntry.entryId);
            await this.unifiedManager.bindRoleToEntry(targetActorKey, savedEntry.entryId);
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
        await this.markColdStartCompletedFromTakeover();
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
    private normalizeTakeoverActorKey(value: string): string {
        const normalized = String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized || 'unknown_actor';
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
            return;
        }
        try {
            registerMemoryLLMTasks(llm, MEMORY_OS_PLUGIN_ID);
            this.llmTasksRegistered = true;
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
