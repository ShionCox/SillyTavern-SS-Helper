import { respond } from '../../../SDK/bus/rpc';
import { broadcast, subscribe as subscribeBroadcast } from '../../../SDK/bus/broadcast';
import type { PluginManifest, RegistryChangeEvent } from '../../../SDK/stx';
import { EventBus } from '../../../SDK/bus/bus';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import {
    buildSdkChatKeyEvent,
    extractTavernPromptMessagesEvent,
    getTavernMessageTextEvent,
    getTavernRuntimeContextEvent,
    isFallbackTavernChatEvent,
    parseTavernChatScopedKeyEvent,
} from '../../../SDK/tavern';
import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { db, rebuildSSHelperDatabase } from '../db/db';
import { PluginRegistry } from '../registry/registry';
import { logger, toast } from './runtime-services';
import { runPromptReadyInjectionPipeline, type PromptInjectionPipelineResult } from './prompt-injection-pipeline';
import manifestJson from '../../manifest.json';
import { readMemoryOSSettings, subscribeMemoryOSSettings, type MemoryOSSettings } from '../settings/store';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readMemoryLLMApi, registerMemoryLLMTasks } from '../memory-summary';
import { openMemoryBootstrapDialog } from '../ui/memory-bootstrap-dialog';
import { openMemoryBootstrapReviewDialog } from '../ui/memory-bootstrap-review-dialog';
import { openMemoryTakeoverDialog } from '../ui/memory-takeover-dialog';
import { openUnifiedMemoryWorkbench } from '../ui/unifiedMemoryWorkbench';
import {
    setMemorySummaryProgressFloatEnabled,
    toggleMemorySummaryProgressFloatVisible,
    updateMemorySummaryProgressFloat,
} from '../ui/summary-progress-float';
import { ensureSdkFloatingToolbar, removeSdkFloatingToolbarGroup, SDK_FLOATING_TOOLBAR_ID } from '../../../SDK/toolbar';
import { initVectorRuntime } from './vector-runtime';
import { DreamSchedulerService, initializeDreamScheduler } from '../services/dream-scheduler-service';
import { DreamUiStateService, type DreamUiStateSnapshot } from '../ui/dream-ui-state-service';
import { DreamNotificationService } from '../ui/dream-notification-service';
import { updateDreamTaskPill, getDreamTaskPillElement, hideDreamTaskPill } from '../ui/dream-task-pill';

type HostEventSource = {
    on: (eventName: string, handler: (payload?: unknown) => void | Promise<void>) => void;
};

type HostContext = {
    eventSource?: HostEventSource;
    event_types?: Record<string, string>;
};

type MemoryBindingStatus = {
    connected: boolean;
    chatKey?: string;
    error?: string;
    updatedAt: number;
};

/** 仅在真实发送后的短时间窗口内执行 prompt_ready 注入 */
const PROMPT_READY_SEND_WINDOW_MS = 15_000;
const DREAM_UI_POLL_INTERVAL_ACTIVE_MS = 4_000;
const DREAM_UI_POLL_INTERVAL_PENDING_MS = 8_000;
const DREAM_UI_POLL_INTERVAL_IDLE_MS = 30_000;
const DREAM_UI_REFRESH_DEBOUNCE_MS = 300;

/**
 * 功能：归一化字符串数组并去重。
 * @param value 原始值。
 * @returns 去重后的字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of value) {
        const normalized = String(item ?? '').trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：读取 Prompt 消息文本。
 * @param message Prompt 消息对象。
 * @returns 消息文本。
 */
function readPromptMessageText(message: unknown): string {
    if (!message || typeof message !== 'object') {
        return '';
    }
    const record = message as Record<string, unknown>;
    return String(record.content ?? record.mes ?? record.text ?? '').trim();
}

/**
 * 功能：格式化 LLM 失败原因文本。
 * @param errorMessage 原始错误信息。
 * @param reasonCode 原始原因码。
 * @returns 适合给用户展示的失败原因。
 */
function formatLLMFailureReason(errorMessage?: string, reasonCode?: string): string {
    const normalizedErrorMessage = String(errorMessage ?? '').trim();
    const normalizedReasonCode = String(reasonCode ?? '').trim();
    if (normalizedErrorMessage && normalizedReasonCode) {
        return `${normalizedErrorMessage}\n原因码：${normalizedReasonCode}`;
    }
    if (normalizedErrorMessage) {
        return normalizedErrorMessage;
    }
    if (normalizedReasonCode) {
        return `原因码：${normalizedReasonCode}`;
    }
    return '未获取到更详细的失败原因。';
}

/**
 * 功能：判断是否为数据库主键升级不兼容错误。
 * @param errorMessage 原始错误信息。
 * @returns 是否需要提示整库重建。
 */
function isPrimaryKeyUpgradeError(errorMessage?: string): boolean {
    const normalized = String(errorMessage ?? '').trim().toLowerCase();
    return normalized.includes('not yet support for changing primary key');
}

/**
 * 功能：询问用户是否删除本地数据库后重新构建。
 * @returns 用户是否确认。
 */
function confirmRebuildDatabase(): boolean {
    return window.confirm(
        '检测到 SS-Helper 本地数据库结构已不兼容，当前无法直接连接记忆主链。\n\n'
        + '是否立即删除本地数据库并重新构建？\n\n'
        + '此操作会清空当前浏览器中的全部 SS-Helper 本地数据，且无法恢复。',
    );
}

/**
 * 功能：询问用户是否立即重试旧聊天接管任务。
 * @param errorMessage 原始错误信息。
 * @param reasonCode 原因码。
 * @returns 用户是否确认重试。
 */
function confirmTakeoverRetry(errorMessage?: string, reasonCode?: string): boolean {
    const detail = formatLLMFailureReason(errorMessage, reasonCode);
    return window.confirm(
        `旧聊天接管失败：${detail}\n\n`
        + '是否立即重试当前任务？\n\n'
        + '选择“确定”会从当前暂停/失败的位置继续执行；选择“取消”则保留当前状态，稍后可手动恢复。',
    );
}

/**
 * 功能：构建 prompt-ready 运行结果快照，供测试包严格一致性回放使用。
 * @param input 构建输入。
 * @returns 运行结果快照。
 */
function buildPromptReadyRunResultSnapshot(input: {
    result: PromptInjectionPipelineResult;
    promptMessages: SdkTavernPromptMessageEvent[];
    query: string;
    sourceMessageId?: string;
}): Record<string, unknown> {
    const explanation = (input.result.latestExplanation ?? {}) as Record<string, unknown>;
    const insertIndex = Number(input.result.injectionResult.insertIndex ?? -1);
    const insertedMemoryBlock = (
        insertIndex >= 0
        && insertIndex < input.promptMessages.length
    )
        ? readPromptMessageText(input.promptMessages[insertIndex])
        : '';
    const parityBaseline = {
        finalPromptText: String(input.result.finalPromptText ?? ''),
        insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
        insertedMemoryBlock,
        reasonCodes: normalizeStringArray(explanation.reasonCodes),
        matchedActorKeys: normalizeStringArray(explanation.matchedActorKeys),
        matchedEntryIds: normalizeStringArray(explanation.matchedEntryIds),
    };
    return {
        query: input.query,
        sourceMessageId: input.sourceMessageId,
        capturedAt: Date.now(),
        source: 'chat_completion_prompt_ready',
        parityBaseline,
        finalPromptText: parityBaseline.finalPromptText,
        insertIndex: parityBaseline.insertIndex,
        insertedMemoryBlock: parityBaseline.insertedMemoryBlock,
        reasonCodes: parityBaseline.reasonCodes,
        matchedActorKeys: parityBaseline.matchedActorKeys,
        matchedEntryIds: parityBaseline.matchedEntryIds,
        logs: input.result.logs,
        baseDiagnostics: input.result.baseDiagnostics,
        injectionResult: input.result.injectionResult,
    };
}

const MEMORY_OS_MANIFEST: PluginManifest = {
    pluginId: 'stx_memory_os',
    name: 'MemoryOS',
    displayName: manifestJson.display_name || 'SS-Helper [统一记忆引擎]',
    version: manifestJson.version || '1.0.0',
    capabilities: {
        events: [
            'plugin:request:ping',
            'plugin:request:memory_chat_keys',
            'plugin:broadcast:registry_changed',
        ],
        memory: [
            'events',
            'memory_entries',
            'memory_entry_types',
            'actor_memory_profiles',
            'role_entry_memory',
            'memory_relationships',
            'summary_snapshots',
        ],
        llm: [],
    },
    scopes: ['chat', 'memory', 'registry'],
    requiresSDK: '^1.0.0',
    source: 'manifest_json',
};

/**
 * 功能：MemoryOS 运行时主类，仅保留统一条目链路。
 */
export class MemoryOS {
    private readonly stxBus: EventBus;
    private readonly registry: PluginRegistry;
    private llmTasksRegistered: boolean;
    private readonly coldStartPromptedChats: Set<string>;
    private readonly coldStartRunningChats: Set<string>;
    private readonly takeoverPromptedChats: Set<string>;
    private readonly takeoverRunningChats: Set<string>;
    private readonly dreamRunningChats: Set<string>;
    private readonly summaryRunningChats: Set<string>;
    private refreshChatBindingHandler: ((force?: boolean) => Promise<void>) | null;
    private rebuildingDatabase: boolean;
    private reloadingAfterDatabaseRebuild: boolean;
    private dreamScheduler: DreamSchedulerService | null;
    private dreamIdleTimerHandle: number | null;
    private dreamIdleActivityHandler: (() => void) | null;
    private dreamUiStateService: DreamUiStateService | null;
    private dreamNotificationService: DreamNotificationService;
    private dreamUiPollHandle: number | null;
    private dreamUiRefreshInFlight: boolean;
    private dreamUiRefreshPending: boolean;

    /**
     * 功能：初始化 MemoryOS 运行时。
     */
    constructor() {
        this.stxBus = new EventBus();
        this.registry = new PluginRegistry();
        this.llmTasksRegistered = false;
        this.coldStartPromptedChats = new Set<string>();
        this.coldStartRunningChats = new Set<string>();
        this.takeoverPromptedChats = new Set<string>();
        this.takeoverRunningChats = new Set<string>();
        this.dreamRunningChats = new Set<string>();
        this.summaryRunningChats = new Set<string>();
        this.rebuildingDatabase = false;
        this.reloadingAfterDatabaseRebuild = false;
        this.dreamScheduler = null;
        this.dreamIdleTimerHandle = null;
        this.dreamIdleActivityHandler = null;
        this.dreamUiStateService = null;
        this.dreamNotificationService = new DreamNotificationService();
        this.dreamUiPollHandle = null;
        this.dreamUiRefreshInFlight = false;
        this.dreamUiRefreshPending = false;
        window.setInterval((): void => {
            void this.refreshSummaryProgressUi();
        }, 2500);
        this.refreshChatBindingHandler = null;
        this.initGlobalSTX();
        initVectorRuntime();
        this.bindRegistryEvents();
        this.registerSelfManifest();
        this.setupPluginBusEndpoints();
        this.bindHostEvents();
        this.bindDreamUiRefreshTriggers();
        this.bindToolbarActions();
        subscribeMemoryOSSettings((): void => {
            this.syncAuxiliaryUi();
        });
        this.syncAuxiliaryUi();
    }

    /**
     * 功能：手动刷新当前聊天绑定。
     * @returns 执行结果。
     */
    public async refreshCurrentChatBinding(): Promise<void> {
        if (!this.refreshChatBindingHandler) {
            return;
        }
        await this.refreshChatBindingHandler(true);
    }

    /**
     * 功能：供 LLMHub 主动调用，重新尝试注册 MemoryOS 的任务。
     *
     * 参数：
     *   reason (string | undefined)：触发补注册的原因说明。
     *
     * 返回：
     *   string：当前补注册结果。
     */
    public refreshLlmBridgeRegistration(reason?: string): string {
        const normalizedReason = String(reason ?? '').trim() || 'unknown';
        const registered = this.tryRegisterLLMTasks();
        if (registered) {
            logger.info(`[MemoryLlmBridge] 已完成任务补注册。原因：${normalizedReason}`);
            return 'registered';
        }
        logger.warn(`[MemoryLlmBridge] 补注册失败，当前仍未连接到可用的 LLMHub SDK。原因：${normalizedReason}`);
        return 'llm_unavailable';
    }

    /**
     * 功能：读取宿主上下文。
     * @returns 宿主上下文，读取失败时返回 null。
     */
    private getHostContext(): HostContext | null {
        try {
            const ctx = (window as unknown as { SillyTavern?: { getContext?: () => unknown } })?.SillyTavern?.getContext?.();
            if (!ctx || typeof ctx !== 'object') {
                return null;
            }
            return ctx as HostContext;
        } catch {
            return null;
        }
    }

    private readSettings(): MemoryOSSettings {
        return readMemoryOSSettings();
    }

    /**
     * 功能：统一刷新工具栏和总结进度悬浮框。
     */
    private syncAuxiliaryUi(): void {
        this.refreshToolbarShortcuts();
        void this.refreshSummaryProgressUi();
        this.ensureDreamUiPoll();
    }

    /**
     * 功能：启动梦境 UI 状态轮询。
     */
    private ensureDreamUiPoll(): void {
        const settings = this.readSettings();
        if (!settings.enabled || !settings.dreamEnabled) {
            this.stopDreamUiPoll();
            return;
        }
        this.queueDreamUiRefresh(0);
    }

    /**
     * 功能：停止梦境 UI 状态轮询。
     */
    private stopDreamUiPoll(): void {
        if (this.dreamUiPollHandle != null) {
            window.clearTimeout(this.dreamUiPollHandle);
            this.dreamUiPollHandle = null;
        }
        this.dreamUiRefreshInFlight = false;
        this.dreamUiRefreshPending = false;
        hideDreamTaskPill();
    }

    /**
     * 功能：根据当前梦境 UI 状态决定下一次轮询间隔。
     * @param snapshot 最近一次状态快照。
     * @returns 下次轮询等待毫秒数。
     */
    private resolveDreamUiPollInterval(snapshot: DreamUiStateSnapshot | null): number {
        if (!snapshot) {
            return DREAM_UI_POLL_INTERVAL_PENDING_MS;
        }
        if (snapshot.activeTask.exists) {
            return DREAM_UI_POLL_INTERVAL_ACTIVE_MS;
        }
        if (snapshot.inbox.pendingApprovalCount > 0) {
            return DREAM_UI_POLL_INTERVAL_PENDING_MS;
        }
        return DREAM_UI_POLL_INTERVAL_IDLE_MS;
    }

    /**
     * 功能：安排下一次梦境 UI 刷新。
     * @param delayMs 延迟毫秒数。
     * @returns 无返回值。
     */
    private scheduleDreamUiRefresh(delayMs: number): void {
        const settings = this.readSettings();
        if (!settings.enabled || !settings.dreamEnabled) {
            this.stopDreamUiPoll();
            return;
        }
        if (this.dreamUiPollHandle != null) {
            window.clearTimeout(this.dreamUiPollHandle);
        }
        this.dreamUiPollHandle = window.setTimeout((): void => {
            this.dreamUiPollHandle = null;
            void this.refreshDreamUiState();
        }, Math.max(0, Math.trunc(delayMs)));
    }

    /**
     * 功能：以防抖方式请求梦境 UI 立即刷新。
     * @param delayMs 触发刷新前的等待毫秒数。
     * @returns 无返回值。
     */
    private queueDreamUiRefresh(delayMs = DREAM_UI_REFRESH_DEBOUNCE_MS): void {
        if (this.dreamUiRefreshInFlight) {
            this.dreamUiRefreshPending = true;
            return;
        }
        this.scheduleDreamUiRefresh(delayMs);
    }

    /**
     * 功能：监听梦境相关的数据写入并触发 UI 即时刷新。
     * @returns 无返回值。
     */
    private bindDreamUiRefreshTriggers(): void {
        subscribeBroadcast<{ table?: string; pluginId?: string; chatKey?: string }>(
            'sdk:chat_data:changed',
            (data): void => {
                const settings = this.readSettings();
                if (!settings.enabled || !settings.dreamEnabled) {
                    return;
                }
                const pluginId = String(data?.pluginId ?? '').trim();
                const chatKey = String(data?.chatKey ?? '').trim();
                if (pluginId !== MEMORY_OS_PLUGIN_ID || !chatKey) {
                    return;
                }
                const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
                const currentChatKey = String(memory?.getChatKey?.() ?? buildSdkChatKeyEvent() ?? '').trim();
                if (!currentChatKey || chatKey !== currentChatKey) {
                    return;
                }
                this.dreamUiStateService?.invalidateCache();
                this.queueDreamUiRefresh(DREAM_UI_REFRESH_DEBOUNCE_MS);
            },
            { from: 'stx_sdk' },
        );
    }

    /**
     * 功能：刷新梦境 UI 状态（pill + 通知）。
     */
    private async refreshDreamUiState(): Promise<void> {
        if (this.dreamUiRefreshInFlight) {
            this.dreamUiRefreshPending = true;
            return;
        }
        this.dreamUiRefreshInFlight = true;
        let snapshot: DreamUiStateSnapshot | null = null;
        try {
            const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            if (!memory) return;
            const chatKey = String(memory.getChatKey?.() ?? buildSdkChatKeyEvent() ?? '').trim();
            if (!chatKey) return;
            // 更新或创建状态服务。
            if (!this.dreamUiStateService || (this.dreamUiStateService as unknown as { chatKey: string }).chatKey !== chatKey) {
                this.dreamUiStateService = new DreamUiStateService(chatKey);
                this.dreamNotificationService.reset();
            }
            snapshot = await this.dreamUiStateService.getSnapshot();
            // 更新任务入口。
            updateDreamTaskPill(snapshot, (): void => {
                if (snapshot.inbox.pendingApprovalCount > 0) {
                    this.openPendingDreamReview(snapshot.inbox.pendingDreamIds[0]);
                } else {
                    openUnifiedMemoryWorkbench({ initialView: 'dream' });
                }
            });
            // 挂载任务入口到工具栏附近。
            this.mountDreamPillToToolbar();
            // 评估通知状态。
            this.dreamNotificationService.evaluate(snapshot);
        } catch (error) {
            logger.debug('[DreamUiPoll] 刷新失败', error);
        } finally {
            this.dreamUiRefreshInFlight = false;
            if (this.dreamUiRefreshPending) {
                this.dreamUiRefreshPending = false;
                this.scheduleDreamUiRefresh(DREAM_UI_REFRESH_DEBOUNCE_MS);
                return;
            }
            this.scheduleDreamUiRefresh(this.resolveDreamUiPollInterval(snapshot));
        }
    }

    /**
     * 功能：把 pill 挂载到工具栏附近。
     */
    private mountDreamPillToToolbar(): void {
        const pill = getDreamTaskPillElement();
        if (pill.parentElement) return;
        const toolbarHost = document.querySelector('.stx-sdk-toolbar-group-memoryos');
        if (toolbarHost) {
            toolbarHost.insertAdjacentElement('afterend', pill);
        }
    }

    /**
     * 功能：打开指定 dreamId 的待审批 review dialog。
     */
    private openPendingDreamReview(dreamId?: string): void {
        if (!dreamId) {
            openUnifiedMemoryWorkbench({ initialView: 'dream' });
            return;
        }
        const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
        if (!memory) {
            toast.info('当前聊天未连接记忆主链。');
            return;
        }
        void (async (): Promise<void> => {
            try {
                const session = await memory.unifiedMemory.diagnostics.getDreamSessionById(dreamId);
                if (!session?.meta || !session.output || !session.recall) {
                    toast.info('未找到该待审批梦境会话。');
                    return;
                }
                const { openDreamReviewDialog } = await import('../ui/dream-review-dialog');
                const result = await openDreamReviewDialog({
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
                    review: result,
                });
                if (!applyResult.ok) {
                    toast.error(`梦境审批应用失败：${applyResult.reasonCode || '未知原因'}`);
                    return;
                }
                if (applyResult.status === 'approved') {
                    toast.success('梦境提案已审批并写回。');
                } else if (applyResult.status === 'rejected') {
                    toast.info('已拒绝本轮梦境提案。');
                } else if (applyResult.status === 'deferred') {
                    toast.info('梦境提案仍保留为待审批。');
                }
                if (applyResult.status === 'approved' || applyResult.status === 'rejected' || applyResult.status === 'deferred') {
                    this.dreamUiStateService?.invalidateCache();
                    await this.refreshDreamUiState();
                }
            } catch (error) {
                logger.error('[DreamReview] 打开待审批失败', error);
                toast.error('打开梦境审核失败。');
            }
        })();
    }

    /**
     * 功能：刷新 MemoryOS 工具栏快捷按钮。
     */
    private refreshToolbarShortcuts(): void {
        const settings = this.readSettings();
        if (!settings.enabled || !settings.toolbarQuickActionsEnabled) {
            removeSdkFloatingToolbarGroup({
                toolbarId: SDK_FLOATING_TOOLBAR_ID,
                groupId: 'memoryos',
            });
            return;
        }
        ensureSdkFloatingToolbar({
            toolbarId: SDK_FLOATING_TOOLBAR_ID,
            groupId: 'memoryos',
            groupClassName: 'stx-sdk-toolbar-group-memoryos',
            actions: [
                {
                    key: 'summary-progress',
                    iconClassName: 'fa-solid fa-bars-progress',
                    tooltip: '切换 AI 总结进度悬浮框',
                    ariaLabel: '切换 AI 总结进度悬浮框',
                    buttonClassName: 'stx-sdk-toolbar-action-memoryos-summary-progress',
                    attributes: {
                        'data-memoryos-toolbar-action': 'summary-progress',
                    },
                    order: 10,
                },
                {
                    key: 'dream',
                    iconClassName: 'fa-solid fa-moon',
                    tooltip: '手动触发梦境',
                    ariaLabel: '手动触发梦境',
                    buttonClassName: 'stx-sdk-toolbar-action-memoryos-dream',
                    attributes: {
                        'data-memoryos-toolbar-action': 'dream',
                    },
                    order: 15,
                },
                {
                    key: 'workbench',
                    iconClassName: 'fa-solid fa-table-cells-large',
                    tooltip: '打开记忆工作台',
                    ariaLabel: '打开记忆工作台',
                    buttonClassName: 'stx-sdk-toolbar-action-memoryos-workbench',
                    attributes: {
                        'data-memoryos-toolbar-action': 'workbench',
                    },
                    order: 20,
                },
            ],
        });
    }

    /**
     * 功能：绑定 MemoryOS 工具栏按钮点击事件。
     */
    private bindToolbarActions(): void {
        document.addEventListener('click', (event: Event): void => {
            const target = event.target as HTMLElement | null;
            const button = target?.closest<HTMLButtonElement>('button[data-memoryos-toolbar-action]');
            if (!button) {
                return;
            }
            const action = String(button.dataset.memoryosToolbarAction ?? '').trim();
            if (!action) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (action === 'workbench') {
                openUnifiedMemoryWorkbench();
                return;
            }
            if (action === 'dream') {
                void this.manualTriggerDream();
                return;
            }
            if (action === 'summary-progress') {
                const settings = this.readSettings();
                if (!settings.summaryProgressOverlayEnabled) {
                    toast.info('请先在 MemoryOS 设置中启用总结进度悬浮框。');
                    return;
                }
                const visible = toggleMemorySummaryProgressFloatVisible();
                if (visible) {
                    void this.refreshSummaryProgressUi();
                }
            }
        });
    }

    /**
     * 功能：手动触发当前聊天的梦境会话。
     */
    private async manualTriggerDream(): Promise<void> {
        const settings = this.readSettings();
        if (!settings.enabled || !settings.dreamEnabled) {
            toast.info('请先在 MemoryOS 设置中启用梦境系统。');
            return;
        }
        const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
        if (!memory) {
            toast.info('当前聊天尚未连接到记忆主链，请稍后再试。');
            return;
        }
        const chatKey = String(memory.getChatKey?.() ?? buildSdkChatKeyEvent() ?? '').trim();
        if (!chatKey) {
            toast.warning('当前无法识别聊天上下文，暂时不能启动梦境。');
            return;
        }
        if (this.dreamRunningChats.has(chatKey)) {
            toast.info('当前聊天已有梦境会话正在运行。');
            return;
        }
        this.dreamRunningChats.add(chatKey);
        toast.info('正在整理本轮梦境上下文，请稍候。');
        try {
            const result = await memory.chatState.startDreamSession('manual');
            if (!result.ok) {
                toast.error(`梦境执行失败：${result.errorMessage || result.reasonCode || '未知错误'}`);
                return;
            }
            if (result.status === 'approved') {
                toast.success('梦境提案已审批并写回主记忆链。');
                return;
            }
            if (result.status === 'rejected') {
                toast.info('已拒绝本轮梦境提案，主记忆链未受影响。');
                return;
            }
            if (result.status === 'deferred') {
                toast.info('本轮梦境已生成，提案暂未写回。');
                return;
            }
            toast.success('梦境会话已生成。');
        } catch (error) {
            toast.error(`梦境执行失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            this.dreamRunningChats.delete(chatKey);
        }
    }

    /**
     * 功能：刷新 AI 总结进度悬浮框。
     */
    private async refreshSummaryProgressUi(): Promise<void> {
        const settings = this.readSettings();
        if (!settings.enabled || !settings.summaryProgressOverlayEnabled) {
            setMemorySummaryProgressFloatEnabled(false);
            updateMemorySummaryProgressFloat(null);
            return;
        }
        const currentChatKey = String(buildSdkChatKeyEvent() ?? '').trim();
        const hasActiveChat = currentChatKey
            && !isFallbackTavernChatEvent(parseTavernChatScopedKeyEvent(currentChatKey).chatId);
        const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
        if (!memory) {
            setMemorySummaryProgressFloatEnabled(true);
            updateMemorySummaryProgressFloat(
                null,
                hasActiveChat ? '正在读取当前聊天的 AI 总结进度。' : '当前未开始聊天，进入任意聊天后这里会显示 AI 总结触发进度。',
            );
            return;
        }
        const status = await memory.chatState.getSummaryTriggerStatus();
        setMemorySummaryProgressFloatEnabled(true);
        updateMemorySummaryProgressFloat(status);
    }

    /**
     * 功能：清理当前挂载的聊天级 Memory SDK 绑定。
     * @returns 无返回值。
     */
    private clearActiveMemoryBinding(): void {
        this.clearDreamIdleTimer();
        this.dreamScheduler = null;
        this.dreamUiStateService = null;
        this.dreamNotificationService.reset();
        this.stopDreamUiPoll();
        hideDreamTaskPill();
        try {
            const oldMemory = (window as unknown as { STX?: { memory?: { template?: { destroy?: () => void } } } })?.STX?.memory;
            oldMemory?.template?.destroy?.();
        } catch {
            // 忽略旧实例销毁失败，继续清理当前绑定。
        }
        (window as unknown as { STX?: Record<string, unknown> }).STX = {
            ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
            memory: null,
            memoryBindingStatus: {
                connected: false,
                updatedAt: Date.now(),
            } satisfies MemoryBindingStatus,
        };
    }

    /**
     * 功能：在数据库结构不兼容时，引导用户删除本地数据库并重新连接当前聊天。
     * @param chatKey 当前聊天键。
     * @returns 重建后的 SDK；失败或取消时返回 null。
     */
    private async rebuildDatabaseAndReconnect(chatKey: string): Promise<MemorySDKImpl | null> {
        if (this.rebuildingDatabase) {
            toast.info('本地数据库正在重建，请稍候。');
            return null;
        }
        const confirmed = confirmRebuildDatabase();
        if (!confirmed) {
            toast.info('已取消本地数据库重建，当前聊天仍未连接到记忆主链。');
            return null;
        }
        this.rebuildingDatabase = true;
        this.clearActiveMemoryBinding();
        try {
            await rebuildSSHelperDatabase();
            logger.warn(`检测到数据库主键升级不兼容，已删除本地数据库：${chatKey}`);
            this.reloadingAfterDatabaseRebuild = true;
            toast.success('本地数据库已清空，即将自动刷新页面。');
            window.setTimeout((): void => {
                window.location.reload();
            }, 80);
            return null;
        } catch (error) {
            const message = String((error as Error)?.message ?? error).trim() || 'database_rebuild_failed';
            logger.error('本地数据库重建失败', error);
            toast.error(`本地数据库重建失败：${message}`);
            return null;
        } finally {
            this.rebuildingDatabase = false;
        }
    }

    /**
     * 功能：在新聊天绑定后按需弹出冷启动确认框。
     * @param chatKey 当前聊天键。
     * @param sdk 当前聊天的 Memory SDK。
     * @returns 异步完成。
     */
    private async maybePromptColdStart(chatKey: string, sdk: MemorySDKImpl): Promise<void> {
        const normalizedChatKey = String(chatKey ?? '').trim();
        if (!normalizedChatKey) {
            return;
        }
        const parsedChatRef = parseTavernChatScopedKeyEvent(normalizedChatKey);
        if (isFallbackTavernChatEvent(parsedChatRef.chatId)) {
            logger.info(`跳过冷启动确认：当前聊天仍是占位 chatId (${parsedChatRef.chatId})`);
            return;
        }
        const settings = this.readSettings();
        if (!settings.enabled || !settings.coldStartEnabled) {
            return;
        }
        let takeoverDetection = await sdk.chatState.detectTakeoverNeeded();
        if (!takeoverDetection.needed && Number(takeoverDetection.currentFloorCount ?? 0) <= 0) {
            await this.waitForChatHydration(normalizedChatKey);
            takeoverDetection = await sdk.chatState.detectTakeoverNeeded();
        }
        if (takeoverDetection.needed) {
            logger.info(`跳过冷启动确认：当前聊天识别为旧聊天接管 (${normalizedChatKey})`);
            return;
        }
        if (this.coldStartPromptedChats.has(normalizedChatKey) || this.coldStartRunningChats.has(normalizedChatKey)) {
            return;
        }
        const coldStartStatus = await sdk.chatState.getColdStartStatus();
        if (coldStartStatus.completed) {
            this.coldStartPromptedChats.add(normalizedChatKey);
            return;
        }

        this.coldStartPromptedChats.add(normalizedChatKey);
        const selection = await openMemoryBootstrapDialog();
        if (!selection.confirmed) {
            await sdk.chatState.markColdStartDismissed();
            return;
        }

        const activeChatKey = String(
            ((window as unknown as { STX?: { memory?: { getChatKey?: () => string } } })?.STX?.memory?.getChatKey?.())
            ?? '',
        ).trim();
        if (activeChatKey !== normalizedChatKey) {
            return;
        }

        this.coldStartRunningChats.add(normalizedChatKey);
        try {
            const result = await sdk.chatState.primeColdStartPrompt('chat_bind_confirm', {
                selectedWorldbooks: selection.selectedWorldbooks,
                selectedEntries: selection.selectedEntries,
            });
            if (!result.ok) {
                this.coldStartPromptedChats.delete(normalizedChatKey);
                toast.error(`冷启动执行失败：${formatLLMFailureReason(result.errorMessage, result.reasonCode)}`);
                return;
            }
            const reviewResult = await openMemoryBootstrapReviewDialog(result.candidates ?? []);
            if (!reviewResult.confirmed) {
                await sdk.chatState.markColdStartDismissed();
                this.coldStartPromptedChats.delete(normalizedChatKey);
                toast.info('已取消冷启动候选写入。');
                return;
            }
            const applyResult = await sdk.chatState.confirmColdStartCandidates(reviewResult.selectedCandidateIds);
            if (!applyResult.ok) {
                this.coldStartPromptedChats.delete(normalizedChatKey);
                toast.error(`冷启动确认失败：${applyResult.reasonCode}`);
                return;
            }
            toast.success('冷启动已完成，当前聊天已建立初始记忆。');
        } catch (error) {
            this.coldStartPromptedChats.delete(normalizedChatKey);
            toast.error(`冷启动执行失败：${String((error as Error)?.message ?? error)}`);
        } finally {
            this.coldStartRunningChats.delete(normalizedChatKey);
        }
    }

    /**
     * 功能：等待宿主聊天消息完成初次注水，避免导入聊天时过早触发冷启动。
     * @param chatKey 当前聊天键。
     * @returns 异步完成。
     */
    private async waitForChatHydration(chatKey: string): Promise<void> {
        const normalizedChatKey = String(chatKey ?? '').trim();
        if (!normalizedChatKey) {
            return;
        }
        const deadline = Date.now() + 1800;
        while (Date.now() < deadline) {
            const activeChatKey = String(buildSdkChatKeyEvent() ?? '').trim();
            if (activeChatKey !== normalizedChatKey) {
                return;
            }
            const runtimeContext = getTavernRuntimeContextEvent();
            const hostMessages = Array.isArray(runtimeContext?.chat) ? runtimeContext.chat : [];
            const hydratedCount = hostMessages.filter((item: unknown): boolean => {
                if (!item || typeof item !== 'object') {
                    return false;
                }
                return String(getTavernMessageTextEvent(item as Record<string, unknown>) ?? '').trim().length > 0;
            }).length;
            if (hydratedCount > 0) {
                return;
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
        }
    }

    /**
     * 功能：在旧聊天绑定后按需弹出接管配置。
     * @param chatKey 当前聊天键。
     * @param sdk 当前聊天的 Memory SDK。
     * @returns 是否已处理接管流程。
     */
    private async maybePromptTakeover(chatKey: string, sdk: MemorySDKImpl): Promise<boolean> {
        const normalizedChatKey = String(chatKey ?? '').trim();
        if (!normalizedChatKey) {
            return false;
        }
        const parsedChatRef = parseTavernChatScopedKeyEvent(normalizedChatKey);
        if (isFallbackTavernChatEvent(parsedChatRef.chatId)) {
            return false;
        }
        const settings = this.readSettings();
        if (!settings.enabled || !settings.takeoverEnabled) {
            return false;
        }
        if (this.takeoverPromptedChats.has(normalizedChatKey) || this.takeoverRunningChats.has(normalizedChatKey)) {
            return true;
        }

        const takeoverStatus = await sdk.chatState.getTakeoverStatus();
        const currentPlanStatus = String(takeoverStatus.plan?.status ?? '').trim();
        if (currentPlanStatus === 'completed' || currentPlanStatus === 'degraded') {
            this.takeoverPromptedChats.add(normalizedChatKey);
            return false;
        }

        let detection = await sdk.chatState.detectTakeoverNeeded();
        if (!detection.needed && Number(detection.currentFloorCount ?? 0) <= 0) {
            await this.waitForChatHydration(normalizedChatKey);
            detection = await sdk.chatState.detectTakeoverNeeded();
        }
        if (!detection.needed) {
            return false;
        }

        this.takeoverPromptedChats.add(normalizedChatKey);
        const selection = await openMemoryTakeoverDialog({
            totalFloorCount: detection.currentFloorCount,
            recoverableTakeoverId: detection.recoverableTakeoverId,
            defaultBatchSize: settings.takeoverDefaultBatchSize,
            defaultRecentFloors: settings.takeoverDefaultRecentFloors,
            defaultPrioritizeRecent: settings.takeoverDefaultPrioritizeRecent,
            defaultAutoContinue: settings.takeoverDefaultAutoContinue,
            defaultAutoConsolidate: settings.takeoverDefaultAutoConsolidate,
            defaultPauseOnError: settings.takeoverDefaultPauseOnError,
            previewEstimate: (config?: Parameters<typeof sdk.chatState.previewTakeoverEstimate>[0]) => {
                return sdk.chatState.previewTakeoverEstimate(config);
            },
            previewActualPayload: (config?: Parameters<typeof sdk.chatState.previewActualTakeoverPayload>[0]) => {
                return sdk.chatState.previewActualTakeoverPayload(config);
            },
        });
        if (!selection.confirmed) {
            return true;
        }

        const activeChatKey = String(
            ((window as unknown as { STX?: { memory?: { getChatKey?: () => string } } })?.STX?.memory?.getChatKey?.())
            ?? '',
        ).trim();
        if (activeChatKey !== normalizedChatKey) {
            return true;
        }

        this.takeoverRunningChats.add(normalizedChatKey);
        try {
            if (!selection.resumeExisting) {
                await sdk.chatState.createTakeoverPlan(selection.config);
            }
            let result = await sdk.chatState.startTakeover(
                selection.resumeExisting ? detection.recoverableTakeoverId : undefined,
            );
            while (!result.ok) {
                this.takeoverPromptedChats.delete(normalizedChatKey);
                const canRetry = result.progress?.plan?.status === 'paused' || result.progress?.plan?.status === 'failed';
                if (!canRetry || !confirmTakeoverRetry(result.errorMessage, result.reasonCode)) {
                    toast.error(`旧聊天接管失败：${formatLLMFailureReason(result.errorMessage, result.reasonCode)}`);
                    return true;
                }
                const latestActiveChatKey = String(
                    ((window as unknown as { STX?: { memory?: { getChatKey?: () => string } } })?.STX?.memory?.getChatKey?.())
                    ?? '',
                ).trim();
                if (latestActiveChatKey !== normalizedChatKey) {
                    toast.warning('当前聊天已切换，已取消本次自动重试。');
                    return true;
                }
                toast.info('正在重试旧聊天接管...');
                result = await sdk.chatState.resumeTakeover();
            }
            toast.success('旧聊天接管任务已启动，可在统一工作台查看进度。');
            return true;
        } catch (error) {
            this.takeoverPromptedChats.delete(normalizedChatKey);
            toast.error(`旧聊天接管失败：${String((error as Error)?.message ?? error)}`);
            return true;
        } finally {
            this.takeoverRunningChats.delete(normalizedChatKey);
        }
    }

    /**
     * 功能：绑定插件注册中心事件。
     */
    private bindRegistryEvents(): void {
        this.registry.onChanged((event: RegistryChangeEvent): void => {
            this.stxBus.emit(
                'plugin:broadcast:registry_changed',
                {
                    pluginId: event.pluginId,
                    action: event.action,
                    manifest: event.manifest,
                    degraded: event.degraded,
                    reason: event.reason,
                    count: this.registry.list().length,
                    ts: event.ts,
                },
                { chatKey: 'global' },
            );
        });
    }

    /**
     * 功能：注册自身 manifest。
     */
    private registerSelfManifest(): void {
        this.registry.register(MEMORY_OS_MANIFEST);
        this.tryRegisterLLMTasks();
    }

    /**
     * 功能：注册基础 RPC 端点。
     */
    private setupPluginBusEndpoints(): void {
        respond('plugin:request:ping', 'stx_memory_os', async () => {
            return {
                alive: true,
                pluginId: 'stx_memory_os',
                version: '1.0.0',
                capabilities: ['memory', 'chat_index', 'rpc', 'ui'],
            };
        });
        respond('plugin:request:memory_chat_keys', 'stx_memory_os', async () => {
            try {
                const [metaKeys, eventKeys] = await Promise.all([
                    db.meta.toCollection().primaryKeys(),
                    db.events.orderBy('chatKey').uniqueKeys(),
                ]);
                const mergedKeys = Array.from(new Set([
                    ...metaKeys.map((value: unknown): string => String(value ?? '').trim()).filter(Boolean),
                    ...eventKeys.map((value: unknown): string => String(value ?? '').trim()).filter(Boolean),
                ]));
                return {
                    chatKeys: mergedKeys,
                    updatedAt: Date.now(),
                };
            } catch (error) {
                logger.warn('查询 memory_chat_keys 失败', error);
                return {
                    chatKeys: [],
                    updatedAt: Date.now(),
                };
            }
        });
        setTimeout((): void => {
            const settings = this.readSettings();
            broadcast('plugin:broadcast:state_changed', {
                pluginId: 'stx_memory_os',
                isEnabled: settings.enabled,
            }, 'stx_memory_os');
        }, 250);
    }

    /**
     * 功能：挂载全局 STX 对象。
     */
    private initGlobalSTX(): void {
        (window as unknown as { STX: Record<string, unknown> }).STX = {
            version: '1.0.0',
            bus: this.stxBus,
            registry: this.registry,
            memory: null,
            llm: null,
        };
    }

    /**
     * 功能：由 MemoryOS 运行时直接向 LLMHub 注册任务，不依赖当前聊天是否已绑定。
     *
     * 参数：
     *   无
     *
     * 返回：
     *   boolean：`true` 表示已注册或本次注册成功；`false` 表示当前仍无法注册。
     */
    private tryRegisterLLMTasks(): boolean {
        if (this.llmTasksRegistered) {
            return true;
        }
        const llm = readMemoryLLMApi();
        if (!llm) {
            logger.info('[MemoryLlmBridge] 当前尚未检测到 LLMHub SDK，暂不注册任务。');
            return false;
        }
        try {
            registerMemoryLLMTasks(llm, MEMORY_OS_PLUGIN_ID);
            this.llmTasksRegistered = true;
            logger.info('[MemoryLlmBridge] MemoryOS 任务已注册到 LLMHub。');
            return true;
        } catch (error) {
            logger.warn('[MemoryLlmBridge] MemoryOS 任务注册失败。', error);
            return false;
        }
    }

    /**
     * 功能：绑定宿主事件。
     */
    private bindHostEvents(): void {
        const initCtx = this.getHostContext();
        if (!initCtx?.eventSource) {
            logger.warn('无法读取 SillyTavern eventSource');
            return;
        }

        const eventSource = initCtx.eventSource;
        const types = initCtx.event_types || {};
        let currentChatKey = '';
        let bindingSerial = 0;
        let lastUserMessageRenderedAt = 0;
        let lastUserMessageRenderedId = '';
        const coldStartFlowCheckingChats = new Set<string>();

        /**
         * 功能：执行接管优先的冷启动检查流程。
         * @param chatKey 当前聊天键。
         * @param sdk 当前聊天的 Memory SDK。
         * @returns 异步完成。
         */
        const maybeRunColdStartFlow = async (chatKey: string, sdk: MemorySDKImpl): Promise<void> => {
            const normalizedChatKey = String(chatKey ?? '').trim();
            if (!normalizedChatKey || coldStartFlowCheckingChats.has(normalizedChatKey)) {
                return;
            }
            coldStartFlowCheckingChats.add(normalizedChatKey);
            try {
                const takeoverHandled = await this.maybePromptTakeover(normalizedChatKey, sdk);
                if (!takeoverHandled) {
                    await this.maybePromptColdStart(normalizedChatKey, sdk);
                }
            } finally {
                coldStartFlowCheckingChats.delete(normalizedChatKey);
            }
        };

        const rebindChat = async (
            _force: boolean = false,
            options: {
                triggerColdStart?: boolean;
            } = {},
        ): Promise<void> => {
            const triggerColdStart = options.triggerColdStart === true;
            const chatKey = String(buildSdkChatKeyEvent() ?? '').trim();
            if (!chatKey) {
                currentChatKey = '';
                this.clearActiveMemoryBinding();
                return;
            }
            const parsedChatRef = parseTavernChatScopedKeyEvent(chatKey);
            if (isFallbackTavernChatEvent(parsedChatRef.chatId)) {
                if (currentChatKey) {
                    logger.info(`跳过首页占位聊天绑定: ${chatKey}`);
                }
                currentChatKey = '';
                this.clearActiveMemoryBinding();
                return;
            }
            if (chatKey === currentChatKey) {
                if (triggerColdStart) {
                    const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
                    if (memory) {
                        void maybeRunColdStartFlow(chatKey, memory).catch((error: unknown): void => {
                            logger.warn('冷启动确认流程失败', error);
                        });
                    }
                }
                return;
            }
            const serial = ++bindingSerial;
            let sdk = new MemorySDKImpl(chatKey);
            try {
                await sdk.init();
            } catch (error) {
                const message = String((error as Error)?.message ?? error).trim() || 'unknown_binding_error';
                if (isPrimaryKeyUpgradeError(message)) {
                    const rebuiltSdk = await this.rebuildDatabaseAndReconnect(chatKey);
                    if (rebuiltSdk) {
                        sdk = rebuiltSdk;
                    } else if (this.reloadingAfterDatabaseRebuild) {
                        return;
                    } else {
                        this.clearActiveMemoryBinding();
                        (window as unknown as { STX?: Record<string, unknown> }).STX = {
                            ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
                            memoryBindingStatus: {
                                connected: false,
                                chatKey,
                                error: message,
                                updatedAt: Date.now(),
                            } satisfies MemoryBindingStatus,
                        };
                        logger.error(`统一记忆聊天绑定失败: ${chatKey}`, error);
                        return;
                    }
                } else {
                    this.clearActiveMemoryBinding();
                    (window as unknown as { STX?: Record<string, unknown> }).STX = {
                        ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
                        memoryBindingStatus: {
                            connected: false,
                            chatKey,
                            error: message,
                            updatedAt: Date.now(),
                        } satisfies MemoryBindingStatus,
                    };
                    logger.error(`统一记忆聊天绑定失败: ${chatKey}`, error);
                    toast.error(`记忆主链连接失败：${message}`);
                    return;
                }
            }
            if (serial !== bindingSerial) {
                return;
            }
            this.clearActiveMemoryBinding();
            (window as unknown as { STX?: Record<string, unknown> }).STX = {
                ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
                memory: sdk,
                memoryBindingStatus: {
                    connected: true,
                    chatKey,
                    updatedAt: Date.now(),
                } satisfies MemoryBindingStatus,
            };
            currentChatKey = chatKey;
            logger.info(`统一记忆聊天绑定完成: ${chatKey}`);
            void this.refreshSummaryProgressUi();
            this.initDreamSchedulerForChat(chatKey, sdk);
            this.queueDreamUiRefresh(0);
            void (async (): Promise<void> => {
                if (triggerColdStart) {
                    await maybeRunColdStartFlow(chatKey, sdk);
                    return;
                }
                await this.maybePromptTakeover(chatKey, sdk);
            })().catch((error: unknown): void => {
                logger.warn('冷启动确认流程失败', error);
            });
        };

        this.refreshChatBindingHandler = rebindChat;
        void rebindChat(true, { triggerColdStart: true });

        const onMessage = (eventType: 'chat.message.sent' | 'chat.message.received', payload: unknown): void => {
            const settings = this.readSettings();
            if (!settings.enabled) {
                return;
            }
            const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            if (!memory) {
                return;
            }
            const text = String(getTavernMessageTextEvent(payload as Record<string, unknown>) ?? '').trim();
            if (!text) {
                return;
            }
            if (eventType === 'chat.message.sent') {
                const payloadRecord = payload && typeof payload === 'object'
                    ? payload as Record<string, unknown>
                    : {};
                lastUserMessageRenderedAt = Date.now();
                lastUserMessageRenderedId = String(
                    payloadRecord.mes_id
                    ?? payloadRecord.message_id
                    ?? payloadRecord.id
                    ?? '',
                ).trim();
            }
            void memory.events.append(eventType, { text }, {
                sourcePlugin: 'stx_memory_os',
            }).catch((error: unknown): void => {
                logger.warn('事件写入失败', error);
            });
            void this.refreshSummaryProgressUi();
        };

        eventSource.on(types.CHAT_CHANGED || 'chat_changed', (): void => {
            void rebindChat(false, { triggerColdStart: true });
        });
        eventSource.on(types.CHAT_STARTED || 'chat_started', (): void => {
            void rebindChat(false, { triggerColdStart: true });
        });
        eventSource.on(types.CHAT_NEW || 'chat_new', (): void => {
            void rebindChat(false, { triggerColdStart: true });
        });
        eventSource.on(types.USER_MESSAGE_RENDERED || 'user_message_rendered', (payload?: unknown): void => {
            onMessage('chat.message.sent', payload);
        });
        eventSource.on(types.MESSAGE_RECEIVED || 'message_received', (payload?: unknown): void => {
            onMessage('chat.message.received', payload);
        });
        eventSource.on(types.GENERATION_ENDED || 'generation_ended', (): void => {
            const settings = this.readSettings();
            if (!settings.enabled) {
                return;
            }
            const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            if (!memory) {
                return;
            }
            if (settings.summaryAutoTriggerEnabled) {
                const summaryKey = String(memory.getChatKey?.() ?? buildSdkChatKeyEvent() ?? '').trim();
                if (summaryKey) {
                    this.summaryRunningChats.add(summaryKey);
                }
                void memory.postGeneration.scheduleRoundProcessing('generation_ended').catch((error: unknown): void => {
                    logger.warn('轮次总结失败', error);
                }).finally((): void => {
                    if (summaryKey) {
                        this.summaryRunningChats.delete(summaryKey);
                    }
                });
            }
            void this.refreshSummaryProgressUi();
            void this.maybeEnqueueDreamOnGenerationEnded(memory).catch((error: unknown): void => {
                logger.warn('generation_ended 自动做梦调度失败', error);
            });
        });

        let lastPromptReadyTs = 0;
        eventSource.on(types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', async (payload?: unknown) => {
            const settings = this.readSettings();
            if (!settings.enabled || !settings.injectionPromptEnabled) {
                return;
            }
            const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            const promptMessages = extractTavernPromptMessagesEvent(payload as Record<string, unknown>);
            if (!memory || !Array.isArray(promptMessages)) {
                return;
            }
            const now = Date.now();
            if (now - lastPromptReadyTs < 400) {
                return;
            }
            lastPromptReadyTs = now;

            const latestUser = [...promptMessages].reverse().find((row: SdkTavernPromptMessageEvent): boolean => {
                const role = String((row as Record<string, unknown>).role ?? '').trim().toLowerCase();
                return role === 'user' || (row as Record<string, unknown>).is_user === true;
            });
            const query = latestUser ? String((latestUser as Record<string, unknown>).content ?? '').trim() : '';
            const sourceMessageId = latestUser
                ? String(
                    (latestUser as Record<string, unknown>).mes_id
                    ?? (latestUser as Record<string, unknown>).message_id
                    ?? (latestUser as Record<string, unknown>).id
                    ?? '',
                ).trim() || undefined
                : undefined;
            const withinSendWindow = Date.now() - lastUserMessageRenderedAt <= PROMPT_READY_SEND_WINDOW_MS;
            const messageIdMatched = !sourceMessageId
                || !lastUserMessageRenderedId
                || sourceMessageId === lastUserMessageRenderedId;
            if (!withinSendWindow || !messageIdMatched) {
                logger.info('[MemoryOS] 已跳过本次 prompt_ready 注入：未命中真实发送窗口。');
                return;
            }

            await memory.chatState.setPromptReadyCaptureSnapshotForTest({
                promptFixture: promptMessages.map((row: SdkTavernPromptMessageEvent): Record<string, unknown> => ({
                    ...(row as Record<string, unknown>),
                })),
                query,
                sourceMessageId,
                capturedAt: Date.now(),
                requestMeta: {
                    source: 'chat_completion_prompt_ready',
                },
            });

            const pipelineResult = await runPromptReadyInjectionPipeline({
                memory,
                promptMessages,
                readSettings: (): MemoryOSSettings => this.readSettings(),
                query: query || undefined,
                sourceMessageId,
                source: 'chat_completion_prompt_ready',
                currentChatKey: currentChatKey || undefined,
            });
            await memory.chatState.setPromptReadyRunResultForTest(
                buildPromptReadyRunResultSnapshot({
                    result: pipelineResult,
                    promptMessages,
                    query,
                    sourceMessageId,
                }),
            );
        });

        subscribeBroadcast(
            'plugin:broadcast:state_changed',
            (_data: unknown, _envelope: { from?: string }): void => {
                return;
            },
            { from: 'stx_llmhub' },
        );
    }

    /**
     * 功能：为当前聊天初始化 Dream Scheduler 并启动 idle 计时。
     * @param chatKey 当前聊天键。
     * @param sdk 当前聊天的 Memory SDK。
     */
    private initDreamSchedulerForChat(chatKey: string, sdk: MemorySDKImpl): void {
        this.clearDreamIdleTimer();
        const settings = this.readSettings();
        if (!settings.enabled || !settings.dreamEnabled || !settings.dreamSchedulerEnabled) {
            this.dreamScheduler = null;
            return;
        }
        this.dreamScheduler = initializeDreamScheduler(chatKey);
        if (settings.dreamSchedulerAllowIdleTrigger) {
            this.startDreamIdleTimer(chatKey, sdk);
        }
        logger.info(`[DreamScheduler] 已为 ${chatKey} 初始化 dream scheduler`);
    }

    /**
     * 功能：启动 dream idle 计时器。
     * @param chatKey 当前聊天键。
     * @param sdk 当前聊天的 Memory SDK。
     */
    private startDreamIdleTimer(chatKey: string, sdk: MemorySDKImpl): void {
        this.clearDreamIdleTimer();
        const settings = this.readSettings();
        const idleMs = Math.max(1, settings.dreamSchedulerIdleMinutes) * 60 * 1000;
        let lastActivityTs = Date.now();

        const onUserActivity = (): void => {
            lastActivityTs = Date.now();
        };
        this.dreamIdleActivityHandler = onUserActivity;
        document.addEventListener('keydown', onUserActivity, { passive: true });
        document.addEventListener('pointerdown', onUserActivity, { passive: true });

        this.dreamIdleTimerHandle = window.setInterval((): void => {
            const now = Date.now();
            const currentSettings = this.readSettings();
            if (!currentSettings.enabled || !currentSettings.dreamEnabled
                || !currentSettings.dreamSchedulerEnabled || !currentSettings.dreamSchedulerAllowIdleTrigger) {
                return;
            }
            if (now - lastActivityTs < idleMs) {
                return;
            }
            const currentMemory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            if (!currentMemory || currentMemory !== sdk) {
                return;
            }
            lastActivityTs = now;
            void this.maybeEnqueueDreamOnIdle(chatKey, sdk).catch((error: unknown): void => {
                logger.warn('[DreamScheduler] idle 自动做梦调度失败', error);
            });
        }, 60_000);
    }

    /**
     * 功能：清除 dream idle 计时器。
     */
    private clearDreamIdleTimer(): void {
        if (this.dreamIdleTimerHandle !== null) {
            window.clearInterval(this.dreamIdleTimerHandle);
            this.dreamIdleTimerHandle = null;
        }
        if (this.dreamIdleActivityHandler !== null) {
            document.removeEventListener('keydown', this.dreamIdleActivityHandler);
            document.removeEventListener('pointerdown', this.dreamIdleActivityHandler);
            this.dreamIdleActivityHandler = null;
        }
    }

    /**
     * 功能：generation_ended 后检查是否满足自动做梦条件并入队。
     * @param memory 当前聊天的 Memory SDK。
     */
    private async maybeEnqueueDreamOnGenerationEnded(memory: MemorySDKImpl): Promise<void> {
        const settings = this.readSettings();
        if (!settings.dreamEnabled || !settings.dreamAutoTriggerEnabled || !settings.dreamSchedulerEnabled || !settings.dreamSchedulerAllowGenerationEndedTrigger) {
            return;
        }
        if (!this.dreamScheduler) {
            return;
        }
        const chatKey = String(memory.getChatKey?.() ?? buildSdkChatKeyEvent() ?? '').trim();
        if (!chatKey) {
            return;
        }
        const blockedBy: string[] = [];
        if (this.coldStartRunningChats.has(chatKey)) {
            blockedBy.push('cold_start_running');
        }
        if (this.takeoverRunningChats.has(chatKey)) {
            blockedBy.push('takeover_running');
        }
        if (this.dreamRunningChats.has(chatKey)) {
            blockedBy.push('dream_already_running');
        }
        if (this.summaryRunningChats.has(chatKey)) {
            blockedBy.push('summary_running');
        }

        const decision = await this.dreamScheduler.enqueueDreamJob({
            chatKey,
            triggerSource: 'generation_ended',
            blockedBy,
            execute: async (context): Promise<{ ok: boolean; dreamId?: string; status?: string; reasonCode?: string }> => {
                const result = await memory.chatState.startDreamSession('generation_ended', context);
                return { ok: result.ok, dreamId: result.dreamId, status: result.status, reasonCode: result.reasonCode };
            },
        });
        if (decision.shouldTrigger) {
            logger.info(`[DreamScheduler] generation_ended 已排入 dream 队列: ${chatKey}`);
        }
    }

    /**
     * 功能：idle 触发时检查是否满足自动做梦条件并入队。
     * @param chatKey 当前聊天键。
     * @param memory 当前聊天的 Memory SDK。
     */
    private async maybeEnqueueDreamOnIdle(chatKey: string, memory: MemorySDKImpl): Promise<void> {
        const settings = this.readSettings();
        if (!settings.dreamEnabled || !settings.dreamAutoTriggerEnabled || !settings.dreamSchedulerEnabled || !settings.dreamSchedulerAllowIdleTrigger) {
            return;
        }
        if (!this.dreamScheduler) {
            return;
        }
        const blockedBy: string[] = [];
        if (this.coldStartRunningChats.has(chatKey)) {
            blockedBy.push('cold_start_running');
        }
        if (this.takeoverRunningChats.has(chatKey)) {
            blockedBy.push('takeover_running');
        }
        if (this.dreamRunningChats.has(chatKey)) {
            blockedBy.push('dream_already_running');
        }
        if (this.summaryRunningChats.has(chatKey)) {
            blockedBy.push('summary_running');
        }

        const decision = await this.dreamScheduler.enqueueDreamJob({
            chatKey,
            triggerSource: 'idle',
            blockedBy,
            execute: async (context): Promise<{ ok: boolean; dreamId?: string; status?: string; reasonCode?: string }> => {
                const result = await memory.chatState.startDreamSession('idle', context);
                return { ok: result.ok, dreamId: result.dreamId, status: result.status, reasonCode: result.reasonCode };
            },
        });
        if (decision.shouldTrigger) {
            logger.info(`[DreamScheduler] idle 已排入 dream 队列: ${chatKey}`);
        }
    }
}
