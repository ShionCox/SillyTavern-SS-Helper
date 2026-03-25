import { respond } from '../../../SDK/bus/rpc';
import { broadcast, subscribe as subscribeBroadcast } from '../../../SDK/bus/broadcast';
import type { PluginManifest, RegistryChangeEvent } from '../../../SDK/stx';
import { EventBus } from '../../../SDK/bus/bus';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import { ChatLifecycleManager } from '../core/chat-lifecycle-manager';
import { createMemoryTraceContext } from '../core/memory-trace';
import {
    buildSdkChatKeyEvent,
    extractTavernPromptMessagesEvent,
    getCurrentTavernCharacterSnapshotEvent,
    getTavernMessageTextEvent,
    getTavernPromptMessageTextEvent,
} from '../../../SDK/tavern';
import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { db } from '../db/db';
import { PluginRegistry } from '../registry/registry';
import {
    appendPreparedMessageEvent,
    prepareFilteredMessageIngest,
    resolveNormalizedRecordFilterSettings,
} from '../core/message-ingest-pipeline';
import {
    buildExistingMessageDedupIndex,
    buildMessageTextSignature,
    createIngestDedupRuntimeState,
    getPersistedRecentDedupIndexSnapshot,
    normalizeIncomingMessageId,
    recordPersistedRecentAcceptedMessage,
    recordAcceptedMessage,
    releasePendingKey,
    resetIngestDedupRuntimeState,
    seedPersistedRecentDedupBucketFromEvents,
    seedIngestDedupHydrationState,
    shouldAcceptIncomingMessage,
    shouldBackfillHistoricalMessage,
    shouldAcceptPersistedMessage,
    type MessageIngestEventType,
} from '../core/message-ingest-dedup';
import { initBridge as initLlmBridge, type BridgeInitStatus } from '../llm/memoryLlmBridge';
import { setAiModeEnabled, setLlmHubMounted, setConsumerRegistered } from '../llm/ai-health-center';
import { bindMemoryChatToolbarActions, ensureMemoryChatToolbar, removeMemoryChatToolbar } from './chatToolbar';
import { reconcileColdStartBootstrap } from './coldStartCoordinator';
import { MEMORY_OS_POLICY } from '../policy/memory-policy';
import { logger, toast } from './runtime-services';
import manifestJson from '../../manifest.json';

const MEMORY_OS_MANIFEST: PluginManifest = {
    pluginId: 'stx_memory_os',
    name: 'MemoryOS',
    displayName: manifestJson.display_name || 'SS-Helper [记忆引擎]',
    version: manifestJson.version || '1.0.0',
        capabilities: {
            events: [
                'plugin:request:ping',
                'plugin:request:memory_chat_keys',
                'plugin:broadcast:registry_changed',
            ],
        memory: ['events', 'facts', 'state', 'summaries', 'memory_mutation_history', 'template', 'audit'],
        llm: [],
    },
    scopes: ['chat', 'memory', 'registry'],
    requiresSDK: '^1.0.0',
    source: 'manifest_json',
};

export class MemoryOS {
    private stxBus: EventBus;
    private registry: PluginRegistry;
    private refreshChatBindingHandler: ((force?: boolean) => Promise<void>) | null;
    private llmBridgeRetryTimer: ReturnType<typeof setTimeout> | null;

    constructor() {
        logger.info('记忆引擎初始化完成');
        this.stxBus = new EventBus();
        this.registry = new PluginRegistry();
        this.refreshChatBindingHandler = null;
        this.llmBridgeRetryTimer = null;

        this.initGlobalSTX();
        this.bindRegistryEvents();
        this.registerSelfManifest();
        this.setupPluginBusEndpoints();
        this.initLlmBridgeOnReady();
        bindMemoryChatToolbarActions();
        this.bindHostEvents();
    }
    // 功能：在运行中手动刷新当前聊天与 MemorySDK 绑定。
    public async refreshCurrentChatBinding(): Promise<void> {
        if (!this.refreshChatBindingHandler) {
            logger.warn('当前尚未建立聊天绑定处理器，跳过刷新');
            return;
        }
        await this.refreshChatBindingHandler(true);
    }
    // 功能：监听注册中心变更并通过 STX.bus 广播。
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
                { chatKey: 'global' }
            );
        });
    }
    // 功能：注册 MemoryOS 自身 manifest。
    private registerSelfManifest(): void {
        this.registry.register(MEMORY_OS_MANIFEST);
    }

    private setupPluginBusEndpoints() {
        const readSettings = (): Record<string, any> => {
            const ctx = (window as any).SillyTavern?.getContext?.() || {};
            const extensionSettings = ctx?.extensionSettings || {};
            return extensionSettings['stx_memory_os'] || {};
        };
        const getEnabledFlag = () => {
            try {
                return readSettings().enabled === true;
            } catch {
                return false;
            }
        };
        respond('plugin:request:ping', 'stx_memory_os', async () => {
            return {
                alive: true,
                isEnabled: getEnabledFlag(),
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
                const allKeys = Array.from(
                    new Set(
                        [...metaKeys, ...eventKeys]
                            .map((item) => String(item ?? '').trim())
                            .filter(Boolean)
                    )
                );

                const chatKeys = (await Promise.all(allKeys.map(async (chatKey: string): Promise<string | null> => {
                    const [eventRow, factRow, worldStateRow, summaryRow, templateRow, auditRow, mutationHistoryRow, bindingRow] = await Promise.all([
                        db.events.where('chatKey').equals(chatKey).first(),
                        db.facts.where('[chatKey+updatedAt]').between([chatKey, 0], [chatKey, Infinity]).first(),
                        db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).first(),
                        db.summaries.where('[chatKey+level+createdAt]').between([chatKey, '', 0], [chatKey, '\uffff', Infinity]).first(),
                        db.templates.where('[chatKey+createdAt]').between([chatKey, 0], [chatKey, Infinity]).first(),
                        db.audit.where('chatKey').equals(chatKey).first(),
                        db.memory_mutation_history.where('chatKey').equals(chatKey).first(),
                        db.template_bindings.where('chatKey').equals(chatKey).first(),
                    ]);

                    return eventRow || factRow || worldStateRow || summaryRow || templateRow || auditRow || mutationHistoryRow || bindingRow
                        ? chatKey
                        : null;
                }))).filter((item): item is string => Boolean(item));

                return {
                    chatKeys,
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

        setTimeout(() => {
            broadcast(
                'plugin:broadcast:state_changed',
                {
                    pluginId: 'stx_memory_os',
                    isEnabled: getEnabledFlag(),
                },
                'stx_memory_os'
            );
        }, 250);
    }

    /**
     * 功能：在 LLMHub 就绪后补注册 MemoryOS 的 consumer。
     * 返回：
     *   void：无返回值。
     */
    private initLlmBridgeOnReady(): void {
        const maxRetryCount = 6;
        const retryDelayMs = 1000;

        subscribeBroadcast(
            'plugin:broadcast:state_changed',
            (_data: unknown, envelope: { from?: string }): void => {
                if (envelope.from !== 'stx_llmhub') {
                    return;
                }
                const status = this.tryInitLlmBridge('收到 stx_llmhub 状态广播');
                if (status === 'registered' || status === 'already_registered') {
                    this.stopLlmBridgeRetry();
                }
            },
            { from: 'stx_llmhub' }
        );

        const initialStatus = this.tryInitLlmBridge('MemoryOS 启动后立即尝试');
        if (initialStatus === 'registered' || initialStatus === 'already_registered') {
            return;
        }
        this.scheduleLlmBridgeRetry(maxRetryCount, retryDelayMs);
    }

    /**
     * 功能：停止当前尚未完成的 LLMHub 注册重试。
     * 返回：
     *   void：无返回值。
     */
    private stopLlmBridgeRetry(): void {
        if (!this.llmBridgeRetryTimer) {
            return;
        }
        clearTimeout(this.llmBridgeRetryTimer);
        this.llmBridgeRetryTimer = null;
    }

    /**
     * 功能：尝试向当前 LLMHub 实例注册 MemoryOS consumer，并输出诊断日志。
     * 参数：
     *   reason：本次触发注册的原因。
     * 返回：
     *   BridgeInitStatus：本次注册尝试的结果。
     */
    private tryInitLlmBridge(reason: string): BridgeInitStatus {
        const status = initLlmBridge();
        if (status === 'registered') {
            setLlmHubMounted(true);
            setConsumerRegistered(true);
            logger.info(`[LLMHub桥接] 已向当前 LLMHub 实例注册 MemoryOS 消费方，触发原因: ${reason}`);
            return status;
        }
        if (status === 'already_registered') {
            setLlmHubMounted(true);
            setConsumerRegistered(true);
            logger.info(`[LLMHub桥接] 当前 LLMHub 实例已完成注册，跳过重复注册，触发原因: ${reason}`);
            return status;
        }
        if (status === 'unsupported') {
            setLlmHubMounted(true);
            setConsumerRegistered(false);
            logger.warn(`[LLMHub桥接] 检测到 STX.llm，但缺少 registerConsumer，触发原因: ${reason}`);
            return status;
        }
        setLlmHubMounted(false);
        logger.info(`[LLMHub桥接] LLMHub 尚未就绪，暂不注册，触发原因: ${reason}`);
        return status;
    }

    /**
     * 功能：在 LLMHub 延迟挂载时执行有界重试补偿。
     * 参数：
     *   remainingRetries：剩余重试次数。
     *   delayMs：每次重试之间的延迟毫秒数。
     * 返回：
     *   void：无返回值。
     */
    private scheduleLlmBridgeRetry(remainingRetries: number, delayMs: number): void {
        this.stopLlmBridgeRetry();
        if (remainingRetries <= 0) {
            logger.warn('[LLMHub桥接] 多次重试后仍未检测到可注册的 LLMHub 实例，停止补偿注册。');
            return;
        }

        this.llmBridgeRetryTimer = setTimeout((): void => {
            this.llmBridgeRetryTimer = null;
            const status = this.tryInitLlmBridge(`延迟重试，剩余次数: ${remainingRetries - 1}`);
            if (status === 'registered' || status === 'already_registered') {
                return;
            }
            this.scheduleLlmBridgeRetry(remainingRetries - 1, delayMs);
        }, delayMs);
    }

    private initGlobalSTX() {
        // 创建全局 STX 互通底座
        (window as any).STX = {
            version: '1.0.0',
            bus: this.stxBus,
            registry: this.registry,
            memory: null, // 将在首次打开聊天时按 Namespace 赋值
            llm: null,    // 预留给 LLMHub 注册
        };
        logger.success('STX 全局事件总线及插件中心已挂载');
    }

    private bindHostEvents() {
        const getCtx = () => {
            try {
                return (window as any).SillyTavern?.getContext?.();
            } catch (e) {
                return null;
            }
        };

        const initCtx = getCtx();
        if (!initCtx || !initCtx.eventSource) {
            logger.warn('无法获取 SillyTavern eventSource');
            return;
        }

        const eventSource = initCtx.eventSource;
        const types = initCtx.event_types || {};
        const chatLifecycleManager = new ChatLifecycleManager();
        let bindingFlightPromise: Promise<void> | null = null;
        let bindingFlightChatKey = '';
        let bindingSerial = 0;
        let lastBoundChatKey = '';
        let lastBoundAt = 0;

        // ======= 前置防呆：统一读取开关配置 =======
        const readSettings = (): Record<string, any> => {
            const ctx = getCtx();
            if (!ctx?.extensionSettings) return {};
            return ctx.extensionSettings['stx_memory_os'] || {};
        };
        const isPluginEnabled = () => {
            return readSettings().enabled === true;
        };
        const isAiModeEnabled = () => {
            const enabled = readSettings().aiMode === true;
            setAiModeEnabled(enabled);
            return enabled;
        };
        setAiModeEnabled(readSettings().aiMode === true);
        const resolveRecordableChatBinding = (ctx: any): {
            valid: boolean;
            chatId: string;
            groupId: string;
            characterId: string;
            reason: string;
        } => {
            const rawChatId = String(ctx?.chatId ?? '').trim();
            const rawGroupId = String(ctx?.groupId ?? '').trim();
            const currentCharacter = getCurrentTavernCharacterSnapshotEvent(ctx);
            const hasGroupBinding = rawGroupId.length > 0;
            const hasCharacterBinding = Boolean(currentCharacter);
            const hasChatId = rawChatId.length > 0 && rawChatId !== '0' && rawChatId !== '(未知)' && rawChatId !== '(unknown)';
            if (!hasChatId) {
                return {
                    valid: false,
                    chatId: '',
                    groupId: '',
                    characterId: '',
                    reason: 'missing_chat_id',
                };
            }
            if (!hasGroupBinding && !hasCharacterBinding) {
                return {
                    valid: false,
                    chatId: rawChatId,
                    groupId: '',
                    characterId: '',
                    reason: 'no_character_or_group_binding',
                };
            }
            const characterId = hasGroupBinding
                ? ''
                : String(currentCharacter?.avatarName || currentCharacter?.roleId || currentCharacter?.index || '').trim();
            if (!hasGroupBinding && !characterId) {
                return {
                    valid: false,
                    chatId: rawChatId,
                    groupId: '',
                    characterId: '',
                    reason: 'missing_character_id',
                };
            }
            return {
                valid: true,
                chatId: rawChatId,
                groupId: rawGroupId,
                characterId,
                reason: 'ok',
            };
        };
        // 功能：读取记录过滤配置。
        const readRecordFilterSettings = (): Record<string, unknown> => {
            const settings = readSettings();
            const raw = settings?.recordFilter;
            if (!raw || typeof raw !== 'object') {
                return {};
            }
            return raw as Record<string, unknown>;
        };
        // 功能：过滤消息文本并写入事件流。
        const appendFilteredMessageEvent = (
            eventType: MessageIngestEventType,
            msgText: string,
            msgId: unknown,
            ingestHint: 'normal' | 'bootstrap' = 'normal'
        ): void => {
            if (!currentChatKey) {
                return;
            }
            const bindingCheck = resolveRecordableChatBinding(getCtx());
            if (!bindingCheck.valid) {
                return;
            }
            const memory = (window as any).STX?.memory;
            if (!memory?.events?.append) {
                return;
            }
            try {
                const currentState = (window as any).STX?.memory?.chatState;
                const recordIngestHealth = (duplicateDrop: boolean): void => {
                    if (typeof currentState?.getIngestHealth !== 'function' || typeof currentState?.recordIngestHealth !== 'function') {
                        return;
                    }
                    void currentState.getIngestHealth()
                        .then((health: { totalAttempts?: number; duplicateDrops?: number }) => {
                            return currentState.recordIngestHealth({
                                totalAttempts: Number(health?.totalAttempts ?? 0) + 1,
                                duplicateDrops: Number(health?.duplicateDrops ?? 0) + Number(duplicateDrop),
                            });
                        })
                        .catch(() => undefined);
                };

                const normalizedFilterSettings = resolveNormalizedRecordFilterSettings(readRecordFilterSettings());
                const preparedResult = prepareFilteredMessageIngest({
                    eventType,
                    rawText: msgText,
                    messageId: msgId,
                    ingestHint,
                    normalizedFilterSettings,
                });
                if (!preparedResult.accepted || !preparedResult.payload) {
                    logger.info(`记录过滤后跳过入库 type=${eventType}, msgId=${String(msgId ?? '')}, reason=${preparedResult.reasonCode}`);
                    recordIngestHealth(false);
                    return;
                }
                const preparedPayload = preparedResult.payload as NonNullable<typeof preparedResult.payload>;

                const now = Date.now();
                const activeChatKey = String(
                    currentChatKey
                    || (typeof memory?.getChatKey === 'function' ? memory.getChatKey() : '')
                    || ''
                ).trim();
                if (!activeChatKey) {
                    return;
                }
                const ingestSource = ingestHint === 'bootstrap' ? 'bootstrap' : 'runtime';
                const messageRole = eventType === 'chat.message.sent' ? 'user' : 'assistant';
                const pendingDecision = shouldAcceptIncomingMessage({
                    state: ingestDedupState,
                    chatKey: activeChatKey,
                    eventType,
                    role: messageRole,
                    messageId: preparedPayload.normalizedMessageId,
                    text: preparedPayload.filteredText,
                    source: ingestSource,
                    now,
                });
                if (!pendingDecision.accepted) {
                    logger.info(`命中运行时并发去重，跳过重复入库 type=${eventType}, msgId=${pendingDecision.normalizedMessageId || '(none)'}, reason=${pendingDecision.reasonCodes.join(',')}`);
                    recordIngestHealth(true);
                    return;
                }
                recordAcceptedMessage(ingestDedupState, {
                    decision: pendingDecision,
                    role: messageRole,
                    now,
                    source: ingestSource,
                    chatKey: activeChatKey,
                    text: preparedPayload.filteredText,
                });
                const pendingEventKey = pendingDecision.pendingKey;
                const normalizedMsgId = pendingDecision.normalizedMessageId;
                const appendTask = (async (): Promise<void> => {
                    try {
                        const cachedDedupIndex = getPersistedRecentDedupIndexSnapshot(
                            ingestDedupState,
                            { chatKey: activeChatKey, eventType },
                        );
                        if (cachedDedupIndex) {
                            const cachedDecision = shouldAcceptPersistedMessage({
                                existingMessageIds: cachedDedupIndex.messageIds,
                                existingTextSignatures: cachedDedupIndex.textSignatures,
                                latestTextSignature: cachedDedupIndex.latestTextSignature,
                                messageId: normalizedMsgId,
                                text: preparedPayload.filteredText,
                                source: ingestSource,
                            });
                            if (!cachedDecision.accepted) {
                                logger.info(`命中落库缓存去重，跳过重复入库 type=${eventType}, msgId=${cachedDecision.normalizedMessageId || '(none)'}, reason=${cachedDecision.reasonCodes.join(',')}`);
                                recordIngestHealth(true);
                                return;
                            }
                        }

                        const recentEvents = await db.events
                            .where('[chatKey+type+ts]')
                            .between([activeChatKey, eventType, 0], [activeChatKey, eventType, Infinity])
                            .reverse()
                            .limit(MEMORY_OS_POLICY.dedup.persistedRecentQueryLimit)
                            .toArray();
                        const recentDedupIndex = seedPersistedRecentDedupBucketFromEvents(ingestDedupState, {
                            chatKey: activeChatKey,
                            eventType,
                            events: recentEvents,
                        });
                        const persistedDecision = shouldAcceptPersistedMessage({
                            existingMessageIds: recentDedupIndex.messageIds,
                            existingTextSignatures: recentDedupIndex.textSignatures,
                            latestTextSignature: recentDedupIndex.latestTextSignature,
                            messageId: normalizedMsgId,
                            text: preparedPayload.filteredText,
                            source: ingestSource,
                        });
                        if (!persistedDecision.accepted) {
                            logger.info(`命中落库去重，跳过重复入库 type=${eventType}, msgId=${persistedDecision.normalizedMessageId || '(none)'}, reason=${persistedDecision.reasonCodes.join(',')}`);
                            recordIngestHealth(true);
                            return;
                        }

                        await appendPreparedMessageEvent(memory, {
                            payload: preparedPayload,
                            sourcePlugin: 'sillytavern-core',
                            sourceMessageId: normalizedMsgId || undefined,
                        });
                        recordPersistedRecentAcceptedMessage(ingestDedupState, {
                            chatKey: activeChatKey,
                            eventType,
                            messageId: normalizedMsgId,
                            text: preparedPayload.filteredText,
                        });
                        recordIngestHealth(false);
                    } finally {
                        releasePendingKey(ingestDedupState, pendingEventKey);
                    }
                })();
                Promise.resolve(appendTask).catch((error: unknown) => {
                    logger.error(`记忆入库失败 type=${eventType}, msgId=${String(msgId ?? '')}`, error);
                });
            } catch (error) {
                logger.error(`消息过滤异常 type=${eventType}, msgId=${String(msgId ?? '')}`, error);
            }
        };

        // 用 Set 追踪已记录的消息 ID，切换聊天时重置，防止重复事件写入两条记录
        const ingestDedupState = createIngestDedupRuntimeState(MEMORY_OS_POLICY.dedup.runtimeSignatureWindowMs);
        let currentChatKey = '';
        let lastChatStructureSignature = '';
        /**
         * 功能：从消息对象中读取原始消息 ID，兼容 `_id/id/messageId/mesid` 字段。
         * @param message 消息对象。
         * @returns 原始消息 ID 候选值，未命中时返回空字符串。
         */
        const collectHistoricalMessageIdsFromChat = (chatList: unknown): Set<string> => {
            const idSet = new Set<string>();
            if (!Array.isArray(chatList)) return idSet;
            for (const item of chatList) {
                const normalized = normalizeIncomingMessageId(item, true);
                if (normalized) {
                    idSet.add(normalized);
                }
            }
            return idSet;
        };

        // ── 历史消息差量补录 ──
        interface BackfillStats {
            scanned: number;
            skippedSystem: number;
            droppedByFilter: number;
            deduplicatedById: number;
            deduplicatedByText: number;
            backfilled: number;
        }

        const backfillHistoricalMessages = async (
            chatList: unknown[],
            chatKey: string,
        ): Promise<BackfillStats> => {
            const stats: BackfillStats = {
                scanned: 0,
                skippedSystem: 0,
                droppedByFilter: 0,
                deduplicatedById: 0,
                deduplicatedByText: 0,
                backfilled: 0,
            };
            if (!Array.isArray(chatList) || chatList.length === 0) return stats;
            const memory = (window as any).STX?.memory;
            if (!memory?.events?.append) return stats;

            // 一次性加载该 chatKey 下所有已有消息事件，构建去重索引
            const [existingReceived, existingSent] = await Promise.all([
                db.events
                    .where('[chatKey+type+ts]')
                    .between([chatKey, 'chat.message.received', 0], [chatKey, 'chat.message.received', Infinity])
                    .toArray(),
                db.events
                    .where('[chatKey+type+ts]')
                    .between([chatKey, 'chat.message.sent', 0], [chatKey, 'chat.message.sent', Infinity])
                    .toArray(),
            ]);
            const existingDedupIndex = buildExistingMessageDedupIndex({
                events: [...existingReceived, ...existingSent],
            });
            const existingMsgIds = existingDedupIndex.messageIds;
            const existingTextSigs = existingDedupIndex.textSignatures;

            const normalizedFilterSettings = resolveNormalizedRecordFilterSettings(readRecordFilterSettings());

            for (const msg of chatList) {
                stats.scanned++;
                if (isSystemMessage(msg)) {
                    stats.skippedSystem++;
                    continue;
                }

                const isUser = isUserMessage(msg);
                const text = readMessageText(msg);
                if (!text) continue;

                const eventType: MessageIngestEventType = isUser ? 'chat.message.sent' : 'chat.message.received';
                const preparedResult = prepareFilteredMessageIngest({
                    eventType,
                    rawText: text,
                    messageId: msg,
                    ingestHint: 'bootstrap',
                    normalizedFilterSettings,
                });

                // 过滤
                if (!preparedResult.accepted || !preparedResult.payload) {
                    stats.droppedByFilter++;
                    continue;
                }
                const preparedPayload = preparedResult.payload;

                // 按 messageId / 文本签名去重
                const backfillDecision = shouldBackfillHistoricalMessage({
                    existingMessageIds: existingMsgIds,
                    existingTextSignatures: existingTextSigs,
                    isSystemMessage: false,
                    messageId: preparedPayload.normalizedMessageId,
                    text: preparedPayload.filteredText,
                });
                if (!backfillDecision.accepted) {
                    if (backfillDecision.reasonCodes.includes('skip:db_message_id_duplicate')) {
                        stats.deduplicatedById++;
                    } else if (backfillDecision.reasonCodes.includes('skip:db_text_signature_duplicate')) {
                        stats.deduplicatedByText++;
                    } else if (backfillDecision.reasonCodes.includes('skip:filtered_empty')) {
                        stats.droppedByFilter++;
                    }
                    continue;
                }
                // 写入
                await appendPreparedMessageEvent(memory, {
                    payload: preparedPayload,
                    sourcePlugin: 'sillytavern-core',
                    sourceMessageId: backfillDecision.normalizedMessageId || undefined,
                });

                // 更新本地索引，防止同一轮内重复
                if (backfillDecision.normalizedMessageId) existingMsgIds.add(backfillDecision.normalizedMessageId);
                if (backfillDecision.textSignature) existingTextSigs.add(backfillDecision.textSignature);
                stats.backfilled++;
            }

            return stats;
        };
        // 功能：从事件参数中提取消息 ID，兼容 ID/对象两种入参。
        const extractMessageId = (eventPayload: unknown): string => {
            if (eventPayload == null) {
                return '';
            }
            if (typeof eventPayload === 'number') {
                return '';
            }
            if (typeof eventPayload === 'string') {
                return normalizeIncomingMessageId(eventPayload, true);
            }
            if (typeof eventPayload === 'object') {
                return normalizeIncomingMessageId(eventPayload, true);
            }
            return '';
        };
        // 功能：从事件参数中提取 chat 列表索引，兼容 number 或对象 index 入参。
        const extractMessageIndex = (eventPayload: unknown): number => {
            if (typeof eventPayload === 'number' && Number.isInteger(eventPayload) && eventPayload >= 0) {
                return eventPayload;
            }
            if (eventPayload && typeof eventPayload === 'object') {
                const source = eventPayload as Record<string, unknown>;
                const candidate = source.index ?? source.messageIndex ?? source.idx;
                if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0) {
                    return candidate;
                }
            }
            return -1;
        };
        // 功能：从消息对象中提取文本，兼容 mes/content/text/message 字段。
        const readMessageText = (message: unknown): string => {
            return getTavernMessageTextEvent(message);
        };
        const collectHistoricalMessageTextSignaturesFromChat = (chatList: unknown): Set<string> => {
            const signatureSet = new Set<string>();
            if (!Array.isArray(chatList)) return signatureSet;
            for (const item of chatList) {
                if (isSystemMessage(item)) {
                    continue;
                }
                const textSignature = buildMessageTextSignature(readMessageText(item));
                if (textSignature) {
                    signatureSet.add(textSignature);
                }
            }
            return signatureSet;
        };
        // 功能：计算轻量聊天结构签名，用于快照差异兜底。
        const computeChatStructureSignature = (chatList: unknown): string => {
            if (!Array.isArray(chatList)) return '';
            const payload = chatList
                .map((item: any, index: number): string => {
                    const msgId = normalizeIncomingMessageId(item, true);
                    const role = isSystemMessage(item) ? 'system' : (isUserMessage(item) ? 'user' : 'assistant');
                    const text = buildMessageTextSignature(readMessageText(item));
                    return `${index}|${msgId}|${role}|${text}`;
                })
                .join('\n');
            let hash = 5381;
            for (let i = 0; i < payload.length; i += 1) {
                hash = ((hash << 5) + hash) ^ payload.charCodeAt(i);
            }
            return `h${(hash >>> 0).toString(16)}`;
        };
        // 功能：按事件或快照差异重建逻辑消息视图与语义楼层。
        const rebuildLogicalViewIfNeeded = (reason: string, force: boolean = false): void => {
            const memory = (window as any).STX?.memory;
            const ctx = getCtx();
            if (!memory?.chatState?.rebuildLogicalChatView || !ctx) {
                return;
            }
            const signature = computeChatStructureSignature(ctx.chat);
            if (!force && signature && signature === lastChatStructureSignature) {
                return;
            }
            lastChatStructureSignature = signature;
            Promise.resolve(memory.chatState.rebuildLogicalChatView())
                .catch((error: unknown) => {
                    logger.warn(`逻辑消息视图重建失败 reason=${reason}`, error);
                });
        };
        // 功能：按消息 ID 在 chat 列表中查找消息对象。
        const findMessageById = (chatList: unknown, messageId: string): any | null => {
            if (!messageId || !Array.isArray(chatList)) {
                return null;
            }
            return chatList.find((item: any) => {
                const left = normalizeIncomingMessageId(item, false);
                return left === messageId;
            }) || null;
        };
        // 功能：按事件负载优先解析宿主消息对象，支持索引、ID、消息对象三种来源。
        const resolveMessageFromEventPayload = (chatList: unknown, eventPayload: unknown, messageId: string): any | null => {
            if (Array.isArray(chatList)) {
                const messageIndex = extractMessageIndex(eventPayload);
                if (messageIndex >= 0 && messageIndex < chatList.length) {
                    return chatList[messageIndex];
                }
                const byId = findMessageById(chatList, messageId);
                if (byId) {
                    return byId;
                }
            }
            return eventPayload && typeof eventPayload === 'object' ? eventPayload : null;
        };
        // 功能：判断消息是否为用户消息。
        const isUserMessage = (message: any): boolean => {
            return message?.is_user === true || message?.isUser === true || message?.role === 'user';
        };
        // 功能：判断消息是否为系统消息。
        const isSystemMessage = (message: any): boolean => {
            return message?.is_system === true || message?.isSystem === true || message?.role === 'system';
        };
        // 功能：从聊天上下文中获取最后一条用户消息。
        const findLastUserMessage = (ctx: any): any | null => {
            if (!Array.isArray(ctx?.chat) || ctx.chat.length === 0) {
                return null;
            }
            const reversed = [...ctx.chat].reverse();
            return reversed.find((item: any) => isUserMessage(item) && readMessageText(item).length > 0) || null;
        };
        // 绑定聊天切换事件：初始化/切换数据库表空间
        const onChangeConfig = async (force: boolean = false) => {
            const ctx = getCtx();
            currentChatKey = '';
            removeMemoryChatToolbar();

            // 无论是否启用，切换时都清空消息去重 Set
            resetIngestDedupRuntimeState(ingestDedupState);
            lastChatStructureSignature = '';

            // 先打印切换通知，帮助排查事件是否正常触发
            const binding = resolveRecordableChatBinding(ctx);
            const displayChatId = binding.chatId || String(ctx?.chatId ?? '(未知)');
            logger.info(`检测到聊天切换，chatId: ${displayChatId}`);

            if (!isPluginEnabled()) {
                logger.info('插件当前未启用，跳过记忆库初始化');
                return;
            }

            if (!ctx || !binding.valid) {
                const previousMemory = (window as any).STX?.memory;
                if (previousMemory?.template?.destroy) {
                    try {
                        previousMemory.template.destroy();
                    } catch {
                        // noop
                    }
                }
                if ((window as any).STX) {
                    (window as any).STX.memory = null;
                }
                logger.info(`当前不是可记录聊天上下文，跳过记忆绑定 reason=${binding.reason}`);
                return;
            }

            // 使用 SDK 统一函数构建标准化 chatKey
            const chatKey = buildSdkChatKeyEvent();
            if (!chatKey) {
                logger.warn('无法构建 chatKey（上下文不可用），跳过记忆库初始化');
                return;
            }

            const currentMemory = (window as any).STX?.memory as { getChatKey?: () => string } | null;
            const currentRuntimeChatKey = typeof currentMemory?.getChatKey === 'function'
                ? String(currentMemory.getChatKey() ?? '').trim()
                : '';

            if (bindingFlightPromise && bindingFlightChatKey === chatKey) {
                logger.info(`聊天绑定进行中，复用当前初始化任务 chatKey=${chatKey}`);
                await bindingFlightPromise;
                return;
            }

            if (!force) {
                const recentlyBoundSameChat = lastBoundChatKey === chatKey && Date.now() - lastBoundAt <= 2000;
                if (currentRuntimeChatKey === chatKey || recentlyBoundSameChat) {
                    logger.info(`检测到重复聊天绑定事件，已跳过 chatKey=${chatKey}`);
                    currentChatKey = chatKey;
                    return;
                }
            }

            logger.info(`已切换记忆，ChatKey: ${chatKey}`);

            const historicalIds = collectHistoricalMessageIdsFromChat(ctx?.chat);
            const historicalTextSignatures = collectHistoricalMessageTextSignaturesFromChat(ctx?.chat);
            seedIngestDedupHydrationState(ingestDedupState, {
                messageIds: historicalIds,
                textSignatures: historicalTextSignatures,
                now: Date.now(),
                idGuardWindowMs: 1500,
                textGuardWindowMs: 10000,
            });

            const currentBindingSerial = ++bindingSerial;
            bindingFlightChatKey = chatKey;
            const currentFlightPromise = (async (): Promise<void> => {
                // 初始化 SDK 实例
                const sdkInstance = new MemorySDKImpl(chatKey);
                await sdkInstance.init(); // 触发底层 dexie 库初始化流程

                if (currentBindingSerial !== bindingSerial) {
                    logger.info(`聊天绑定结果已过期，放弃接管 chatKey=${chatKey}`);
                    try {
                        sdkInstance.template.destroy();
                    } catch {
                        // noop
                    }
                    return;
                }

                // 卸载老实例拥有的监听器资源
                if ((window as any).STX.memory) {
                    try {
                        (window as any).STX.memory.template.destroy();
                    } catch (e) {
                        // 忽略对象不存在或已销毁的情况
                    }
                }

                (window as any).STX.memory = sdkInstance;
                currentChatKey = chatKey;
                ensureMemoryChatToolbar();
                await reconcileColdStartBootstrap(sdkInstance, 'chat_bound');
                logger.success(`当前会话 ${chatKey} 数据库存储系统已就绪！`);
                toast.success(`数据库已就绪`);

                // 历史消息差量补录：扫描 ctx.chat，将缺失的用户/助手消息写入 events
                try {
                    const backfillResult = await backfillHistoricalMessages(ctx?.chat as unknown[], chatKey);
                    logger.info(
                        `历史补录完成：扫描=${backfillResult.scanned}, 跳过系统=${backfillResult.skippedSystem}, ` +
                        `过滤丢弃=${backfillResult.droppedByFilter}, ID去重=${backfillResult.deduplicatedById}, ` +
                        `文本去重=${backfillResult.deduplicatedByText}, 实际补录=${backfillResult.backfilled}`
                    );
                    if (backfillResult.backfilled > 0) {
                        toast.info(`已补录 ${backfillResult.backfilled} 条历史消息`);
                    }
                } catch (backfillError) {
                    logger.error('历史消息补录异常', backfillError);
                }

                try {
                    if (typeof (sdkInstance as any)?.chatState?.rebuildLogicalChatView === 'function') {
                        await (sdkInstance as any).chatState.rebuildLogicalChatView();
                    }
                } catch (rebuildError) {
                    logger.warn('聊天绑定后重建逻辑消息视图失败', rebuildError);
                }

                lastBoundChatKey = chatKey;
                lastBoundAt = Date.now();

                void chatLifecycleManager.reconcileCurrentScope('bind_current_chat').catch((error: unknown) => {
                    logger.warn('聊天绑定后作用域对账失败', error);
                });
            })().finally((): void => {
                if (bindingFlightChatKey === chatKey) {
                    bindingFlightChatKey = '';
                }
                if (bindingFlightPromise === currentFlightPromise) {
                    bindingFlightPromise = null;
                }
            });

            bindingFlightPromise = currentFlightPromise;

            await bindingFlightPromise;
        };

        this.refreshChatBindingHandler = onChangeConfig;
        interface ChatLifecycleBindingConfig {
            resolvedEventName: string;
            reason: string;
            rebind: boolean;
            rebuild: boolean;
        }
        /**
         * 功能：按单表驱动方式绑定聊天生命周期事件，统一维护 rebind 与 rebuild 行为。
         * @param config 事件绑定配置。
         */
        const bindChatLifecycleEvent = (config: ChatLifecycleBindingConfig): void => {
            if (!config.resolvedEventName) {
                return;
            }
            eventSource.on(config.resolvedEventName, () => {
                if (config.rebind) {
                    void onChangeConfig().catch((error: unknown) => {
                        logger.error(`聊天生命周期重绑失败 reason=${config.reason}`, error);
                    });
                }
                if (config.rebuild) {
                    setTimeout(() => rebuildLogicalViewIfNeeded(config.reason, true), 0);
                }
            });
        };
        const chatLifecycleBindings: ChatLifecycleBindingConfig[] = [
            {
                resolvedEventName: types.CHAT_CHANGED || 'chat_changed',
                reason: 'chat_changed',
                rebind: true,
                rebuild: true,
            },
            {
                resolvedEventName: types.CHAT_STARTED || 'chat_started',
                reason: 'chat_started',
                rebind: true,
                rebuild: true,
            },
            {
                resolvedEventName: types.CHAT_NEW || 'chat_new',
                reason: 'chat_new',
                rebind: true,
                rebuild: true,
            },
            {
                resolvedEventName: types.CHAT_CREATED || 'chat_created',
                reason: 'chat_created',
                rebind: true,
                rebuild: true,
            },
            {
                resolvedEventName: types.GROUP_CHAT_CREATED || 'group_chat_created',
                reason: 'group_chat_created',
                rebind: true,
                rebuild: true,
            },
        ];
        for (const bindingConfig of chatLifecycleBindings) {
            bindChatLifecycleEvent(bindingConfig);
        }
        eventSource.on(types.CHAT_DELETED || 'chat_deleted', (deletedChatId: unknown) => {
            void chatLifecycleManager.purgeDeletedChatFromHost(deletedChatId, 'host_chat_deleted')
                .then(() => chatLifecycleManager.reconcileCurrentScope('chat_deleted'))
                .catch((error: unknown) => {
                    logger.warn('处理角色聊天删除事件失败', error);
                });
        });
        eventSource.on(types.GROUP_CHAT_DELETED || 'group_chat_deleted', (deletedChatId: unknown) => {
            void chatLifecycleManager.purgeDeletedChatFromHost(deletedChatId, 'host_group_chat_deleted')
                .then(() => chatLifecycleManager.reconcileCurrentScope('group_chat_deleted'))
                .catch((error: unknown) => {
                    logger.warn('处理群聊删除事件失败', error);
                });
        });
        void onChangeConfig().catch((error: unknown) => {
            logger.error('首次绑定当前聊天失败', error);
        });


        // 绑定消息接收与发送事件
        const onAssistantMessageCaptured = (eventPayload: unknown): void => {
            if (!isPluginEnabled()) return;
            const msgId = extractMessageId(eventPayload);
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = resolveMessageFromEventPayload(ctx.chat, eventPayload, msgId);
                const text = readMessageText(messageObj);
                logger.info(`监听到新回复进入，msgId: ${msgId}，准备记录记忆事件...`);
                if (text && !isUserMessage(messageObj) && !isSystemMessage(messageObj)) {
                    appendFilteredMessageEvent('chat.message.received', text, msgId || undefined);
                    rebuildLogicalViewIfNeeded('assistant_message');
                } else {
                    logger.info(`assistant 主事件未提取到可入库消息，已跳过 fallback，msgId=${msgId || '(none)'}`);
                }
            }
        };

        const onUserMessageCaptured = (eventPayload: unknown): void => {
            if (!isPluginEnabled()) return;
            const msgId = extractMessageId(eventPayload);
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = resolveMessageFromEventPayload(ctx.chat, eventPayload, msgId)
                    || findLastUserMessage(ctx);
                const text = readMessageText(messageObj);
                logger.info(`监听到用户发言，msgId: ${msgId}，准备记录记忆事件...`);
                if (text) {
                    appendFilteredMessageEvent('chat.message.sent', text, msgId || undefined);
                    rebuildLogicalViewIfNeeded('user_message');
                }
            }
        };

        // 功能：选择单一主事件通道，避免多事件并发导致重复入库。
        const pickFirstEventName = (...candidates: unknown[]): string => {
            for (const candidate of candidates) {
                if (typeof candidate !== 'string') continue;
                const normalized = candidate.trim();
                if (!normalized) continue;
                return normalized;
            }
            return '';
        };

        const assistantPrimaryEventName = pickFirstEventName(
            (types as any).CHARACTER_MESSAGE_RENDERED,
            types.MESSAGE_RECEIVED,
            'character_message_rendered',
            'message_received'
        );
        if (assistantPrimaryEventName) {
            eventSource.on(assistantPrimaryEventName, onAssistantMessageCaptured);
        }

        const userPrimaryEventName = pickFirstEventName(
            types.USER_MESSAGE_RENDERED,
            (types as any).MESSAGE_SENT,
            'user_message_rendered',
            'message_sent'
        );
        if (userPrimaryEventName) {
            eventSource.on(userPrimaryEventName, onUserMessageCaptured);
        }
        logger.info(`消息监听通道已收敛：assistant=${assistantPrimaryEventName || 'none'}, user=${userPrimaryEventName || 'none'}`);


        // 绑定生成结束事件（有时 MESSAGE_RECEIVED 获取不到完整更新）
        const mutationEventCandidates = [
            (types as any).MESSAGE_EDITED,
            (types as any).MESSAGE_SWIPED,
            (types as any).MESSAGE_DELETED,
            (types as any).CHAT_BRANCHED,
            (types as any).CHAT_RENAMED,
            'message_edited',
            'message_swiped',
            'message_deleted',
            'chat_branched',
            'chat_renamed',
        ]
            .map((value: unknown): string => String(value ?? '').trim())
            .filter((value: string): boolean => value.length > 0);
        const mutationEventNames = Array.from(new Set(mutationEventCandidates));
        for (const eventName of mutationEventNames) {
            eventSource.on(eventName, () => {
                rebuildLogicalViewIfNeeded(`mutation_event:${eventName}`, true);
            });
        }

        eventSource.on(types.GENERATION_ENDED || 'generation_ended', () => {
            if (!isPluginEnabled()) return;
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory && Array.isArray(ctx.chat) && ctx.chat.length > 0) {
                logger.info(`收到 generation_ended，准备触发后处理链路 chatKey=${currentChatKey || '(unknown)'}, aiMode=${isAiModeEnabled()}`);
                rebuildLogicalViewIfNeeded('generation_ended', true);
                void Promise.resolve((memory as any)?.postGeneration?.scheduleRoundProcessing?.('generation_ended'))
                    .catch((error: unknown) => {
                        logger.warn('冷启动提取触发失败（generation_ended）', error);
                    });

            }
        });

        // 时间戳节流去重：500ms 内的重复事件才跳过，不影响多次独立生成
        let lastPromptReadyTs = 0;

        // 拦截最终大模型的发送包装，写入由 Builder 构造出的记忆内容
        eventSource.on(types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', async (payload: any) => {
            if (!isPluginEnabled()) return;
            const memory = (window as any).STX?.memory;
            const promptMessages = extractTavernPromptMessagesEvent(payload);
            if (!memory || !payload || !Array.isArray(promptMessages)) {
                logger.warn(`PROMPT_READY 跳过：memory=${!!memory}, payload=${!!payload}, promptMessages=${Array.isArray(promptMessages)}`);
                return;
            }

            // 节流去重：500ms 内重复触发只处理一次
            const now = Date.now();
            if (now - lastPromptReadyTs < 500) {
                logger.info('检测到 PROMPT_READY 重复触发（节流），已跳过');
                return;
            }
            lastPromptReadyTs = now;
            logger.info(`收到 prompt_ready，准备触发冷启动提示初始化与注入构建，chatKey=${currentChatKey || '(unknown)'}, promptMessages=${promptMessages.length}`);
            rebuildLogicalViewIfNeeded('prompt_ready');
            void Promise.resolve((memory as any)?.chatState?.primeColdStartPrompt?.('chat_completion_prompt_ready'))
                .catch((error: unknown) => {
                    logger.warn('冷启动提示触发失败（prompt_ready）', error);
                });

            try {
                const latestUserMessage = [...promptMessages]
                    .reverse()
                    .find((item: SdkTavernPromptMessageEvent) => {
                        return String(item?.role ?? '').trim().toLowerCase() === 'user' || item?.is_user === true;
                    });
                const query = getTavernPromptMessageTextEvent(latestUserMessage).trim();
                const sourceMessageId = String((latestUserMessage as any)?.mes_id ?? (latestUserMessage as any)?.message_id ?? (latestUserMessage as any)?.id ?? '').trim() || undefined;
                const settingsMaxTokens = Number(readSettings().contextMaxTokens) || 1200;
                const promptTrace = createMemoryTraceContext({
                    chatKey: String(memory?.getChatKey?.() ?? currentChatKey ?? '').trim() || 'unknown',
                    source: 'prompt_injection',
                    stage: 'memory_recall_started',
                    sourceMessageId,
                    requestId: query || undefined,
                });
                const injectionResult = await memory.injection.runMemoryPromptInjection({
                    promptMessages,
                    maxTokens: settingsMaxTokens,
                    query,
                    preferSummary: true,
                    intentHint: 'auto',
                    source: 'chat_completion_prompt_ready',
                    sourceMessageId,
                    trace: promptTrace,
                });
                const traceSummary = injectionResult.trace
                    ? `${injectionResult.trace.stage} · ${injectionResult.trace.label} · ${injectionResult.trace.traceId}`
                    : 'no-trace';
                logger.info(
                    `prompt 注入主链结束：shouldInject=${injectionResult.shouldInject}, inserted=${injectionResult.inserted}, insertIndex=${injectionResult.insertIndex}, promptLength=${injectionResult.promptLength}, insertedLength=${injectionResult.insertedLength}, trace=${traceSummary}`
                );

            } catch (error) {
                logger.error('Prompt Context 构建或注入失败', error);
            }
        });
    }
}
