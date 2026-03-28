import { respond } from '../../../SDK/bus/rpc';
import { broadcast, subscribe as subscribeBroadcast } from '../../../SDK/bus/broadcast';
import type { PluginManifest, RegistryChangeEvent } from '../../../SDK/stx';
import { EventBus } from '../../../SDK/bus/bus';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import {
    buildSdkChatKeyEvent,
    extractTavernPromptMessagesEvent,
    getTavernMessageTextEvent,
    isFallbackTavernChatEvent,
    parseTavernChatScopedKeyEvent,
} from '../../../SDK/tavern';
import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { db } from '../db/db';
import { PluginRegistry } from '../registry/registry';
import { logger, toast } from './runtime-services';
import { runPromptReadyInjectionPipeline, type PromptInjectionPipelineResult } from './prompt-injection-pipeline';
import manifestJson from '../../manifest.json';
import { readMemoryOSSettings, type MemoryOSSettings } from '../settings/store';
import { openMemoryBootstrapDialog } from '../ui/memory-bootstrap-dialog';
import { openMemoryBootstrapReviewDialog } from '../ui/memory-bootstrap-review-dialog';

type HostEventSource = {
    on: (eventName: string, handler: (payload?: unknown) => void | Promise<void>) => void;
};

type HostContext = {
    eventSource?: HostEventSource;
    event_types?: Record<string, string>;
};

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
    private readonly coldStartPromptedChats: Set<string>;
    private readonly coldStartRunningChats: Set<string>;
    private refreshChatBindingHandler: ((force?: boolean) => Promise<void>) | null;

    /**
     * 功能：初始化 MemoryOS 运行时。
     */
    constructor() {
        this.stxBus = new EventBus();
        this.registry = new PluginRegistry();
        this.coldStartPromptedChats = new Set<string>();
        this.coldStartRunningChats = new Set<string>();
        this.refreshChatBindingHandler = null;
        this.initGlobalSTX();
        this.bindRegistryEvents();
        this.registerSelfManifest();
        this.setupPluginBusEndpoints();
        this.bindHostEvents();
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
     * 功能：清理当前挂载的聊天级 Memory SDK 绑定。
     * @returns 无返回值。
     */
    private clearActiveMemoryBinding(): void {
        try {
            const oldMemory = (window as unknown as { STX?: { memory?: { template?: { destroy?: () => void } } } })?.STX?.memory;
            oldMemory?.template?.destroy?.();
        } catch {
            // noop
        }
        (window as unknown as { STX?: Record<string, unknown> }).STX = {
            ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
            memory: null,
        };
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
                toast.error(`冷启动执行失败：${result.reasonCode}`);
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

        const rebindChat = async (_force: boolean = false): Promise<void> => {
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
                return;
            }
            const serial = ++bindingSerial;
            const sdk = new MemorySDKImpl(chatKey);
            await sdk.init();
            if (serial !== bindingSerial) {
                return;
            }
            this.clearActiveMemoryBinding();
            (window as unknown as { STX?: Record<string, unknown> }).STX = {
                ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
                memory: sdk,
            };
            currentChatKey = chatKey;
            logger.info(`统一记忆聊天绑定完成: ${chatKey}`);
            void this.maybePromptColdStart(chatKey, sdk).catch((error: unknown): void => {
                logger.warn('冷启动确认流程失败', error);
            });
        };

        this.refreshChatBindingHandler = rebindChat;
        void rebindChat(true);

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
            void memory.events.append(eventType, { text }, {
                sourcePlugin: 'stx_memory_os',
            }).catch((error: unknown): void => {
                logger.warn('事件写入失败', error);
            });
        };

        eventSource.on(types.CHAT_CHANGED || 'chat_changed', (): void => {
            void rebindChat();
        });
        eventSource.on(types.CHAT_STARTED || 'chat_started', (): void => {
            void rebindChat();
        });
        eventSource.on(types.CHAT_NEW || 'chat_new', (): void => {
            void rebindChat();
        });
        eventSource.on(types.USER_MESSAGE_RENDERED || 'user_message_rendered', (payload?: unknown): void => {
            onMessage('chat.message.sent', payload);
        });
        eventSource.on(types.MESSAGE_RECEIVED || 'message_received', (payload?: unknown): void => {
            onMessage('chat.message.received', payload);
        });
        eventSource.on(types.GENERATION_ENDED || 'generation_ended', (): void => {
            const settings = this.readSettings();
            if (!settings.enabled || !settings.summaryAutoTriggerEnabled) {
                return;
            }
            const memory = (window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory || null;
            if (!memory) {
                return;
            }
            void memory.postGeneration.scheduleRoundProcessing('generation_ended').catch((error: unknown): void => {
                logger.warn('轮次总结失败', error);
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
}
