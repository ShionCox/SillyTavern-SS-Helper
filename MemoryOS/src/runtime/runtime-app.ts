import { respond } from '../../../SDK/bus/rpc';
import { broadcast, subscribe as subscribeBroadcast } from '../../../SDK/bus/broadcast';
import type { PluginManifest, RegistryChangeEvent } from '../../../SDK/stx';
import { EventBus } from '../../../SDK/bus/bus';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import {
    buildSdkChatKeyEvent,
    extractTavernPromptMessagesEvent,
    getTavernMessageTextEvent,
} from '../../../SDK/tavern';
import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { db } from '../db/db';
import { PluginRegistry } from '../registry/registry';
import { logger } from './runtime-services';
import { runPromptReadyInjectionPipeline } from './prompt-injection-pipeline';
import manifestJson from '../../manifest.json';
import { readMemoryOSSettings, type MemoryOSSettings } from '../settings/store';

type HostEventSource = {
    on: (eventName: string, handler: (payload?: unknown) => void | Promise<void>) => void;
};

type HostContext = {
    eventSource?: HostEventSource;
    event_types?: Record<string, string>;
};

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
    private refreshChatBindingHandler: ((force?: boolean) => Promise<void>) | null;

    /**
     * 功能：初始化 MemoryOS 运行时。
     */
    constructor() {
        this.stxBus = new EventBus();
        this.registry = new PluginRegistry();
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
            try {
                const oldMemory = (window as unknown as { STX?: { memory?: { template?: { destroy?: () => void } } } })?.STX?.memory;
                oldMemory?.template?.destroy?.();
            } catch {
                // noop
            }
            (window as unknown as { STX?: Record<string, unknown> }).STX = {
                ...((window as unknown as { STX?: Record<string, unknown> }).STX || {}),
                memory: sdk,
            };
            currentChatKey = chatKey;
            logger.info(`统一记忆聊天绑定完成: ${chatKey}`);
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
            if (!settings.enabled) {
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

            await runPromptReadyInjectionPipeline({
                memory,
                promptMessages,
                readSettings: (): MemoryOSSettings => this.readSettings(),
                query: query || undefined,
                sourceMessageId,
                source: 'chat_completion_prompt_ready',
                currentChatKey: currentChatKey || undefined,
            });
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
