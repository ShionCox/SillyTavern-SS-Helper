/**
 * MemoryOS 统一入口
 * 导出所有公共模块，供外部引用。
 */

// 数据库层
export { MemoryOSDatabase, db } from './db/db';
export type {
    DBEvent, DBFact, DBWorldState, DBSummary, DBTemplate, DBAudit, DBMeta,
    DBWorldInfoCache, DBTemplateBinding,
    DBVectorChunk, DBVectorEmbedding, DBVectorMeta,
} from './db/db';

// 事件总线
export { EventBus } from '../../SDK/bus/bus';

// 核心管理器
export { EventsManager } from './core/events-manager';
export { FactsManager } from './core/facts-manager';
export { StateManager } from './core/state-manager';
export { SummariesManager } from './core/summaries-manager';
export { AuditManager } from './core/audit-manager';
export { MetaManager } from './core/meta-manager';
export { CompactionManager } from './core/compaction-manager';

// v2 核心管理器
export { ChatStateManager } from './core/chat-state-manager';
export { TurnTracker } from './core/turn-tracker';
export { SchemaGate } from './core/schema-gate';
export { RowResolver } from './core/row-resolver';
export { RowOperationsManager } from './core/row-operations';
export { PromptTrimmer } from './core/prompt-trimmer';

// 注入管理器
export { InjectionManager } from './injection/injection-manager';

// 编排胶水层

// SDK 门面层
export { MemorySDKImpl } from './sdk/memory-sdk';

// 工具函数
export { buildChatKey } from './utils/chat-namespace';
export type { ChatNamespaceInput } from './utils/chat-namespace';
export { buildScopePrefix, buildScopedKey, validateScopeAccess } from './utils/scope-manager';
export type { ScopeLevel, ScopeContext } from './utils/scope-manager';

// 世界模板系统
export { TemplateManager } from './template/template-manager';
export { TemplateBuilder } from './template/template-builder';
export { WorldInfoReader } from './template/worldinfo-reader';
export { WorldInfoWriter } from './template/worldinfo-writer';
export type {
    WorldTemplate, TemplateEntity, TemplateFactType, TemplateTableDef,
    ExtractPolicies, InjectionLayout,
    WorldInfoEntry, WorldContextBundle,
} from './template/types';

// v2 类型系统
export type {
    AdaptiveMetrics, AdaptivePolicy, ChatProfile, ChatProfileOverride,
    MemoryOSChatState, RetentionPolicy, StrategyDecision,
    SummaryPolicyOverride, AutoSchemaPolicy, SchemaDraftSession, AssistantTurnTracker,
    RowAliasIndex, RowRedirects, RowTombstones,
} from './types/chat-state';
export type {
    TableDef, TableFieldDef, FieldTier,
    TemplateRevisionMeta, SchemaChangeProposal,
    EntityResolutionProposal, DeferredSchemaHint,
    ChangeBudget, PromptTrimBudget,
} from './types/schema-revision';
export type {
    RowRefResolution, RowMergeRequest, RowMergeResult,
    RowDeleteMode, RowSeedData, LogicTableRow, LogicTableQueryOpts,
} from './types/row-operations';

// 提议制与闸门验证
export { GateValidator } from './proposal/gate-validator';
export { ProposalManager } from './proposal/proposal-manager';
export type {
    ProposalEnvelope, ProposalResult, WriteRequest,
    FactProposal, PatchProposal, SummaryProposal, GateResult,
    SchemaChangeProposal as ProposalSchemaChange,
    EntityResolutionProposal as ProposalEntityResolution,
    DeferredSchemaHint as ProposalDeferredHint,
} from './proposal/types';

// 插件注册表
// AI 状态中心
export type {
    MemoryAiHealthSnapshot, MemoryAiTaskId, MemoryAiTaskRecord,
    MemoryAiTaskStatus, CapabilityStatus, LlmHubDiagnosisLevel,
} from './llm/ai-health-types';
export {
    getHealthSnapshot, isAiOperational, isCapabilityAvailable,
    getTaskStatus, onHealthChange,
} from './llm/ai-health-center';
export { runAiSelfTests } from './llm/ai-self-test';
export type { AiSelfTestResult } from './llm/ai-self-test';
// UI 层
import { renderSettingsUi } from './ui/index';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';
import { respond } from '../../SDK/bus/rpc';
import { broadcast, subscribe as subscribeBroadcast } from '../../SDK/bus/broadcast';
import type { PluginManifest, RegistryChangeEvent } from '../../SDK/stx';
import { EventBus } from '../../SDK/bus/bus';
import { MemorySDKImpl } from './sdk/memory-sdk';
import { buildSdkChatKeyEvent } from '../../SDK/tavern';
import { db } from './db/db';
import { migrateMemoryOSLegacyData } from './db/legacy-migration';
import { PluginRegistry } from './registry/registry';
import { filterRecordText } from './core/record-filter';
import { initBridge as initLlmBridge, type BridgeInitStatus } from './llm/memoryLlmBridge';
import { setAiModeEnabled, setLlmHubMounted, setConsumerRegistered } from './llm/ai-health-center';
import manifestJson from '../manifest.json';
export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

export const logger = new Logger('记忆引擎');
export const toast = new Toast('记忆引擎');

const MEMORY_OS_MANIFEST: PluginManifest = {
    pluginId: 'stx_memory_os',
    name: 'MemoryOS',
    displayName: manifestJson.display_name || 'SS-Helper [记忆引擎]',
    version: manifestJson.version || '1.0.0',
    capabilities: {
        events: [
            'plugin:request:ping',
            'plugin:request:memory_chat_keys',
            'plugin:request:memory_append_outcome',
            'plugin:broadcast:registry_changed',
        ],
        memory: ['events', 'facts', 'state', 'summaries', 'template', 'audit'],
        llm: [],
    },
    scopes: ['chat', 'memory', 'registry'],
    requiresSDK: '^1.0.0',
    source: 'manifest_json',
};

type MemoryOutcomeWriteRequest = {
    text?: unknown;
    outcome?: unknown;
    result?: unknown;
    kind?: unknown;
    eventType?: unknown;
    sourcePlugin?: unknown;
    sourceMessageId?: unknown;
};

type MemoryOutcomeWriteResponse = {
    ok: boolean;
    ts: number;
    reason?: string;
    eventId?: string;
    eventType?: string;
    chatKey?: string;
    storedTextLength?: number;
};

class MemoryOS {
    private stxBus: EventBus;
    private registry: PluginRegistry;
    private refreshChatBindingHandler: (() => Promise<void>) | null;
    private llmBridgeRetryTimer: ReturnType<typeof setTimeout> | null;

    constructor() {
        logger.info('记忆引擎初始化完成');
        this.stxBus = new EventBus();
        this.registry = new PluginRegistry();
        this.refreshChatBindingHandler = null;
        this.llmBridgeRetryTimer = null;

        // 一次性旧数据迁移（stx_memory_os → ss-helper-db）
        void migrateMemoryOSLegacyData();

        this.initGlobalSTX();
        this.bindRegistryEvents();
        this.registerSelfManifest();
        this.setupPluginBusEndpoints();
        this.initLlmBridgeOnReady();
        this.bindHostEvents();
    }
    // 功能：在运行中手动刷新当前聊天与 MemorySDK 绑定。
    public async refreshCurrentChatBinding(): Promise<void> {
        if (!this.refreshChatBindingHandler) {
            logger.warn('当前尚未建立聊天绑定处理器，跳过刷新');
            return;
        }
        await this.refreshChatBindingHandler();
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
        const readRecordFilterSettings = (): Record<string, unknown> => {
            const settings = readSettings();
            const raw = settings?.recordFilter;
            if (!raw || typeof raw !== 'object') {
                return {};
            }
            return raw as Record<string, unknown>;
        };
        const normalizeExternalText = (payload: MemoryOutcomeWriteRequest): string => {
            const rawList: unknown[] = [payload?.text, payload?.outcome, payload?.result];
            for (const raw of rawList) {
                if (typeof raw !== 'string') continue;
                const normalized = raw.trim();
                if (normalized.length > 0) {
                    return normalized;
                }
            }
            return '';
        };
        const resolveExternalEventType = (payload: MemoryOutcomeWriteRequest): string => {
            const rawType = String(payload?.eventType ?? payload?.kind ?? '').trim().toLowerCase();
            if (rawType === 'result' || rawType === 'chat.result') {
                return 'chat.result';
            }
            return 'chat.outcome';
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
                const chatKeys = Array.from(
                    new Set(
                        [...metaKeys, ...eventKeys]
                            .map((item) => String(item ?? '').trim())
                            .filter(Boolean)
                    )
                );
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

        respond<MemoryOutcomeWriteRequest, MemoryOutcomeWriteResponse>(
            'plugin:request:memory_append_outcome',
            'stx_memory_os',
            async (payload: MemoryOutcomeWriteRequest, env): Promise<MemoryOutcomeWriteResponse> => {
                const requestFrom = String(env?.from || 'unknown').trim() || 'unknown';
                logger.info(
                    `[MemoryOS 外部写入请求] from=${requestFrom}, kind=${String(payload?.kind ?? payload?.eventType ?? 'outcome')}, hasSourceMessageId=${Boolean(payload?.sourceMessageId)}`
                );
                if (!getEnabledFlag()) {
                    logger.info('[MemoryOS 外部写入拒绝] reason=memory_os_disabled');
                    return {
                        ok: false,
                        reason: 'memory_os_disabled',
                        ts: Date.now(),
                    };
                }
                const memory = (window as any).STX?.memory;
                if (!memory?.events?.append) {
                    logger.info('[MemoryOS 外部写入拒绝] reason=memory_sdk_not_ready');
                    return {
                        ok: false,
                        reason: 'memory_sdk_not_ready',
                        ts: Date.now(),
                    };
                }

                const originalText = normalizeExternalText(payload);
                if (!originalText) {
                    logger.info('[MemoryOS 外部写入拒绝] reason=empty_text');
                    return {
                        ok: false,
                        reason: 'empty_text',
                        ts: Date.now(),
                    };
                }

                const filterResult = filterRecordText(originalText, readRecordFilterSettings());
                const compactText = String(filterResult.filteredText || '').replace(/\s+/g, '');
                if (filterResult.dropped || compactText.length === 0) {
                    logger.info(`[MemoryOS 外部写入拒绝] reason=filtered:${filterResult.reasonCode}`);
                    return {
                        ok: false,
                        reason: `filtered:${filterResult.reasonCode}`,
                        ts: Date.now(),
                    };
                }

                const sourcePlugin = typeof payload?.sourcePlugin === 'string' && payload.sourcePlugin.trim().length > 0
                    ? payload.sourcePlugin.trim()
                    : String(env?.from || 'external_plugin').trim() || 'external_plugin';
                const sourceMessageId = typeof payload?.sourceMessageId === 'string' && payload.sourceMessageId.trim().length > 0
                    ? payload.sourceMessageId.trim()
                    : undefined;
                const eventType = resolveExternalEventType(payload);

                try {
                    const eventId: string = await memory.events.append(
                        eventType,
                        { text: filterResult.filteredText },
                        {
                            sourcePlugin,
                            sourceMessageId,
                        }
                    );
                    logger.info(
                        `[MemoryOS 外部写入成功] from=${sourcePlugin}, eventType=${eventType}, eventId=${eventId}, textLength=${filterResult.filteredText.length}`
                    );
                    return {
                        ok: true,
                        ts: Date.now(),
                        eventId,
                        eventType,
                        chatKey: typeof memory?.getChatKey === 'function' ? String(memory.getChatKey()) : '',
                        storedTextLength: filterResult.filteredText.length,
                    };
                } catch (error) {
                    logger.error('[MemoryOS 外部写入失败] reason=append_failed', error);
                    return {
                        ok: false,
                        reason: 'append_failed',
                        ts: Date.now(),
                    };
                }
            }
        );

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
        const resolveRecordableChatBinding = (ctx: any): {
            valid: boolean;
            chatId: string;
            groupId: string;
            characterId: string;
            reason: string;
        } => {
            const rawChatId = String(ctx?.chatId ?? '').trim();
            const rawGroupId = String(ctx?.groupId ?? '').trim();
            const characters = Array.isArray(ctx?.characters) ? ctx.characters : [];
            const characterIndex = Number(ctx?.characterId);
            const hasGroupBinding = rawGroupId.length > 0;
            const hasCharacterBinding =
                Number.isInteger(characterIndex) &&
                characterIndex >= 0 &&
                characterIndex < characters.length &&
                !!characters[characterIndex];
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
                : String(characters[characterIndex]?.avatar || characters[characterIndex]?.name || characterIndex).trim();
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
            eventType: string,
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

                const result = filterRecordText(msgText, readRecordFilterSettings());
                const compactText = String(result.filteredText || '').replace(/\s+/g, '');
                if (result.dropped || compactText.length === 0) {
                    logger.info(`记录过滤后跳过入库 type=${eventType}, msgId=${String(msgId ?? '')}, reason=${result.reasonCode}`);
                    recordIngestHealth(false);
                    return;
                }

                const normalizedMsgId = normalizeMessageId(msgId);
                const activeChatKey = String(
                    currentChatKey
                    || (typeof memory?.getChatKey === 'function' ? memory.getChatKey() : '')
                    || ''
                ).trim();
                if (!activeChatKey) {
                    return;
                }

                const appendTask = (async (): Promise<void> => {
                    const recentEvents = await db.events
                        .where('[chatKey+type+ts]')
                        .between([activeChatKey, eventType, 0], [activeChatKey, eventType, Infinity])
                        .reverse()
                        .limit(200)
                        .toArray();

                    if (normalizedMsgId) {
                        const duplicatedByMsgId = recentEvents.some((item) => {
                            return normalizeMessageId(item?.refs?.messageId) === normalizedMsgId;
                        });
                        if (duplicatedByMsgId) {
                            logger.info(`命中数据库去重，跳过重复入库 type=${eventType}, msgId=${normalizedMsgId}`);
                            recordIngestHealth(true);
                            return;
                        }
                    }

                    // 某些历史消息/欢迎语没有稳定 messageId，按文本签名兜底去重
                    if (!normalizedMsgId) {
                        const nextTextSignature = normalizeTextSignature(result.filteredText);
                        if (nextTextSignature) {
                            const duplicatedByText = recentEvents.some((item) => {
                                const storedText = String((item?.payload as { text?: unknown } | undefined)?.text ?? '');
                                return normalizeTextSignature(storedText) === nextTextSignature;
                            });
                            if (duplicatedByText) {
                                logger.info(`命中文本签名去重，跳过重复入库 type=${eventType}`);
                                recordIngestHealth(true);
                                return;
                            }
                        }
                    }

                    if (ingestHint === 'bootstrap') {
                        const latestEvent = recentEvents[0];
                        const latestText = normalizeTextSignature(String((latestEvent?.payload as { text?: unknown } | undefined)?.text ?? ''));
                        const nextText = normalizeTextSignature(result.filteredText);
                        if (latestText && nextText && latestText === nextText) {
                            logger.info(`bootstrap 补录命中最新文本去重，跳过 type=${eventType}`);
                            recordIngestHealth(true);
                            return;
                        }
                    }

                    await memory.events.append(
                        eventType,
                        { text: result.filteredText },
                        {
                            sourcePlugin: 'sillytavern-core',
                            sourceMessageId: normalizedMsgId || undefined,
                        }
                    );
                    recordIngestHealth(false);
                })();
                Promise.resolve(appendTask).catch((error: unknown) => {
                    logger.error(`记忆入库失败 type=${eventType}, msgId=${String(msgId ?? '')}`, error);
                });
            } catch (error) {
                logger.error(`消息过滤异常 type=${eventType}, msgId=${String(msgId ?? '')}`, error);
            }
        };

        // 用 Set 追踪已记录的消息 ID，切换聊天时重置，防止重复事件写入两条记录
        const processedMessageKeys = new Set<string>();
        const bootstrapAssistantByChatKey = new Map<string, string>();
        const historicalMessageIdsOnBind = new Set<string>();
        let bindHydrationUntilTs = 0;
        let currentChatKey = '';
        let lastAssistantSignature = '';
        let lastAssistantSignatureAt = 0;
        let lastAssistantTextSignature = '';
        let lastAssistantTextSignatureAt = 0;
        let lastUserSignature = '';
        let lastUserSignatureAt = 0;
        const DUPLICATE_SIGNATURE_WINDOW_MS = 3000;
        // 功能：将消息 ID 归一化为字符串。
        const normalizeMessageId = (msgId: unknown): string => {
            return String(msgId ?? '').trim();
        };
        const collectHistoricalMessageIdsFromChat = (chatList: unknown): Set<string> => {
            const idSet = new Set<string>();
            if (!Array.isArray(chatList)) return idSet;
            for (const item of chatList) {
                const normalized = normalizeMessageId(
                    (item as any)?._id
                    ?? (item as any)?.id
                    ?? (item as any)?.messageId
                    ?? (item as any)?.mesid
                );
                if (normalized) {
                    idSet.add(normalized);
                }
            }
            return idSet;
        };
        const hasStoredMessageEvents = async (chatKey: string): Promise<boolean> => {
            try {
                const [received, sent] = await Promise.all([
                    db.events
                        .where('[chatKey+type+ts]')
                        .between([chatKey, 'chat.message.received', 0], [chatKey, 'chat.message.received', Infinity])
                        .reverse()
                        .limit(1)
                        .toArray(),
                    db.events
                        .where('[chatKey+type+ts]')
                        .between([chatKey, 'chat.message.sent', 0], [chatKey, 'chat.message.sent', Infinity])
                        .reverse()
                        .limit(1)
                        .toArray(),
                ]);
                return received.length > 0 || sent.length > 0;
            } catch {
                return false;
            }
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
            const allExisting = [...existingReceived, ...existingSent];
            const existingMsgIds = new Set<string>();
            const existingTextSigs = new Set<string>();
            for (const ev of allExisting) {
                const refId = normalizeMessageId(ev?.refs?.messageId);
                if (refId) existingMsgIds.add(refId);
                const storedText = String((ev?.payload as { text?: unknown } | undefined)?.text ?? '');
                const sig = normalizeTextSignature(storedText);
                if (sig) existingTextSigs.add(sig);
            }

            const filterSettings = readRecordFilterSettings();

            for (const msg of chatList) {
                stats.scanned++;
                if (isSystemMessage(msg)) {
                    stats.skippedSystem++;
                    continue;
                }

                const isUser = isUserMessage(msg);
                const text = readMessageText(msg);
                if (!text) continue;

                const eventType = isUser ? 'chat.message.sent' : 'chat.message.received';
                const rawMsgId = normalizeMessageId(
                    (msg as any)?._id ?? (msg as any)?.id ?? (msg as any)?.messageId ?? (msg as any)?.mesid
                );

                // 按消息 ID 去重
                if (rawMsgId && existingMsgIds.has(rawMsgId)) {
                    stats.deduplicatedById++;
                    continue;
                }

                // 过滤
                const result = filterRecordText(text, filterSettings);
                const compactText = String(result.filteredText || '').replace(/\s+/g, '');
                if (result.dropped || compactText.length === 0) {
                    stats.droppedByFilter++;
                    continue;
                }

                // 按文本签名去重（无稳定 messageId 或 ID 未命中时兜底）
                const textSig = normalizeTextSignature(result.filteredText);
                if (textSig && existingTextSigs.has(textSig)) {
                    stats.deduplicatedByText++;
                    continue;
                }

                // 写入
                await memory.events.append(
                    eventType,
                    { text: result.filteredText },
                    {
                        sourcePlugin: 'sillytavern-core',
                        sourceMessageId: rawMsgId || undefined,
                    },
                );

                // 更新本地索引，防止同一轮内重复
                if (rawMsgId) existingMsgIds.add(rawMsgId);
                if (textSig) existingTextSigs.add(textSig);
                stats.backfilled++;
            }

            return stats;
        };
        // 功能：从事件参数中提取消息 ID，兼容 ID/对象两种入参。
        const extractMessageId = (eventPayload: unknown): string => {
            if (eventPayload == null) {
                return '';
            }
            if (typeof eventPayload === 'string' || typeof eventPayload === 'number') {
                return normalizeMessageId(eventPayload);
            }
            if (typeof eventPayload === 'object') {
                const source = eventPayload as Record<string, unknown>;
                return normalizeMessageId(
                    source._id
                    ?? source.id
                    ?? source.messageId
                    ?? source.mesid
                );
            }
            return '';
        };
        // 功能：从消息对象中提取文本，兼容 mes/content/text/message 字段。
        const readMessageText = (message: unknown): string => {
            if (!message || typeof message !== 'object') {
                return '';
            }
            const source = message as Record<string, unknown>;
            const raw = source.mes ?? source.content ?? source.text ?? source.message;
            return typeof raw === 'string' ? raw.trim() : '';
        };
        const normalizeTextSignature = (value: string): string => {
            return String(value || '')
                .replace(/\s+/g, ' ')
                .trim();
        };
        // 功能：按消息 ID 在 chat 列表中查找消息对象。
        const findMessageById = (chatList: unknown, messageId: string): any | null => {
            if (!messageId || !Array.isArray(chatList)) {
                return null;
            }
            return chatList.find((item: any) => {
                const left = normalizeMessageId(item?._id ?? item?.id ?? item?.messageId ?? item?.mesid);
                return left === messageId;
            }) || null;
        };
        // 功能：判断消息事件是否重复。
        const isDuplicateMessageEvent = (eventType: string, msgId: unknown): boolean => {
            const normalizedMsgId = normalizeMessageId(msgId);
            if (!normalizedMsgId) {
                return false;
            }
            const key = `${eventType}:${normalizedMsgId}`;
            if (processedMessageKeys.has(key)) {
                return true;
            }
            processedMessageKeys.add(key);
            return false;
        };
        // 功能：判断消息是否为用户消息。
        const isUserMessage = (message: any): boolean => {
            return message?.is_user === true || message?.isUser === true || message?.role === 'user';
        };
        // 功能：判断消息是否为系统消息。
        const isSystemMessage = (message: any): boolean => {
            return message?.is_system === true || message?.isSystem === true || message?.role === 'system';
        };
        // 功能：从聊天上下文中按角色获取最后一条消息。
        const findLastChatMessageByRole = (ctx: any, role: 'user' | 'assistant'): any | null => {
            if (!Array.isArray(ctx?.chat) || ctx.chat.length === 0) {
                return null;
            }
            const reversed = [...ctx.chat].reverse();
            if (role === 'user') {
                return reversed.find((item: any) => isUserMessage(item) && readMessageText(item).length > 0) || null;
            }
            return reversed.find((item: any) => !isUserMessage(item) && !isSystemMessage(item) && readMessageText(item).length > 0) || null;
        };
        // 功能：在 generation_ended 等场景兜底记录最后一条 AI 回复。
        const appendLatestAssistantMessageFallback = (source: 'runtime' | 'bootstrap' = 'runtime'): void => {
            const ctx = getCtx();
            if (!ctx) return;
            const latestAssistant = findLastChatMessageByRole(ctx, 'assistant');
            if (!latestAssistant) return;
            const text = readMessageText(latestAssistant);
            if (!text) return;
            const assistantMsgId = extractMessageId(latestAssistant);
            const signature = `${assistantMsgId}|${text}`;
            const textSignature = normalizeTextSignature(text);
            const now = Date.now();
            if (source === 'bootstrap' && currentChatKey) {
                const latestBootstrappedSignature = bootstrapAssistantByChatKey.get(currentChatKey) || '';
                if (latestBootstrappedSignature === textSignature) {
                    return;
                }
                bootstrapAssistantByChatKey.set(currentChatKey, textSignature);
            }
            if (signature === lastAssistantSignature) {
                return;
            }
            if (
                textSignature &&
                textSignature === lastAssistantTextSignature &&
                now - lastAssistantTextSignatureAt <= DUPLICATE_SIGNATURE_WINDOW_MS
            ) {
                return;
            }
            lastAssistantSignature = signature;
            lastAssistantSignatureAt = now;
            lastAssistantTextSignature = textSignature;
            lastAssistantTextSignatureAt = now;
            appendFilteredMessageEvent(
                'chat.message.received',
                text,
                assistantMsgId || undefined,
                source === 'bootstrap' ? 'bootstrap' : 'normal'
            );
        };

        // 绑定聊天切换事件：初始化/切换数据库表空间
        const onChangeConfig = async () => {
            const ctx = getCtx();
            currentChatKey = '';

            // 无论是否启用，切换时都清空消息去重 Set
            processedMessageKeys.clear();
            historicalMessageIdsOnBind.clear();
            bindHydrationUntilTs = 0;
            lastAssistantSignature = '';
            lastAssistantSignatureAt = 0;
            lastAssistantTextSignature = '';
            lastAssistantTextSignatureAt = 0;
            lastUserSignature = '';
            lastUserSignatureAt = 0;

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
            logger.info(`已切换记忆，ChatKey: ${chatKey}`);

            const historicalIds = collectHistoricalMessageIdsFromChat(ctx?.chat);
            for (const historyId of historicalIds) {
                historicalMessageIdsOnBind.add(historyId);
            }
            bindHydrationUntilTs = Date.now() + 1500;

            // 初始化 SDK 实例
            const sdkInstance = new MemorySDKImpl(chatKey);
            await sdkInstance.init(); // 触发底层 dexie 库初始化流程

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
        };

        this.refreshChatBindingHandler = onChangeConfig;
        eventSource.on(types.CHAT_CHANGED || 'chat_changed', onChangeConfig);
        eventSource.on(types.CHAT_STARTED || 'chat_started', onChangeConfig);
        eventSource.on(types.CHAT_NEW || 'chat_new', onChangeConfig);
        void onChangeConfig().catch((error: unknown) => {
            logger.error('首次绑定当前聊天失败', error);
        });


        // 绑定消息接收与发送事件
        const onAssistantMessageCaptured = (eventPayload: unknown): void => {
            if (!isPluginEnabled()) return;
            const msgId = extractMessageId(eventPayload);
            if (msgId && historicalMessageIdsOnBind.has(msgId)) {
                logger.info(`历史助手消息已存在，跳过入库 msgId=${msgId}`);
                return;
            }
            if (!msgId && Date.now() <= bindHydrationUntilTs) {
                logger.info('聊天刚绑定完成，跳过无 msgId 的助手事件');
                return;
            }
            if (isDuplicateMessageEvent('chat.message.received', msgId)) {
                logger.info(`MESSAGE_RECEIVED 重复触发已跳过，msgId: ${msgId}`);
                return;
            }
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = findMessageById(ctx.chat, msgId)
                    || (eventPayload && typeof eventPayload === 'object' ? eventPayload : null);
                const text = readMessageText(messageObj);
                logger.info(`监听到新回复进入，msgId: ${msgId}，准备记录记忆事件...`);
                if (text && !isUserMessage(messageObj) && !isSystemMessage(messageObj)) {
                    const signature = `${msgId}|${text}`;
                    const textSignature = normalizeTextSignature(text);
                    const now = Date.now();
                    if (
                        signature === lastAssistantSignature &&
                        now - lastAssistantSignatureAt <= DUPLICATE_SIGNATURE_WINDOW_MS
                    ) {
                        logger.info(`助手消息签名重复已跳过，msgId: ${msgId}`);
                        return;
                    }
                    if (
                        textSignature &&
                        textSignature === lastAssistantTextSignature &&
                        now - lastAssistantTextSignatureAt <= DUPLICATE_SIGNATURE_WINDOW_MS
                    ) {
                        logger.info(`助手消息文本签名重复已跳过，msgId: ${msgId}`);
                        return;
                    }
                    appendFilteredMessageEvent('chat.message.received', text, msgId || undefined);
                    lastAssistantSignature = signature;
                    lastAssistantSignatureAt = now;
                    lastAssistantTextSignature = textSignature;
                    lastAssistantTextSignatureAt = now;
                } else {
                    appendLatestAssistantMessageFallback();
                }
            }
        };

        const onUserMessageCaptured = (eventPayload: unknown): void => {
            if (!isPluginEnabled()) return;
            const msgId = extractMessageId(eventPayload);
            if (msgId && historicalMessageIdsOnBind.has(msgId)) {
                logger.info(`历史用户消息已存在，跳过入库 msgId=${msgId}`);
                return;
            }
            if (!msgId && Date.now() <= bindHydrationUntilTs) {
                logger.info('聊天刚绑定完成，跳过无 msgId 的用户事件');
                return;
            }
            if (isDuplicateMessageEvent('chat.message.sent', msgId)) {
                logger.info(`USER_MESSAGE_RENDERED 重复触发已跳过，msgId: ${msgId}`);
                return;
            }
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = findMessageById(ctx.chat, msgId)
                    || (eventPayload && typeof eventPayload === 'object' ? eventPayload : null)
                    || findLastChatMessageByRole(ctx, 'user');
                const text = readMessageText(messageObj);
                logger.info(`监听到用户发言，msgId: ${msgId}，准备记录记忆事件...`);
                if (text) {
                    const signature = `${msgId}|${text}`;
                    if (
                        signature === lastUserSignature &&
                        Date.now() - lastUserSignatureAt <= DUPLICATE_SIGNATURE_WINDOW_MS
                    ) {
                        logger.info(`用户消息签名重复已跳过，msgId: ${msgId}`);
                        return;
                    }
                    appendFilteredMessageEvent('chat.message.sent', text, msgId || undefined);
                    lastUserSignature = signature;
                    lastUserSignatureAt = Date.now();
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
        eventSource.on(types.GENERATION_ENDED || 'generation_ended', () => {
            if (!isPluginEnabled()) return;
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory && Array.isArray(ctx.chat) && ctx.chat.length > 0) {
                // 尝试补录最后一条助手回复（仅兜底）
                appendLatestAssistantMessageFallback();

                // 若启用了 AI 模式，这里是触发总结与压缩的绝佳锚点
                if (isAiModeEnabled()) {
                    logger.info('AI 增强模式已开启，尝试挂起闲置记忆池压缩任务...');
                    // 分发到 LLM Hub 的提取服务
                    memory.extract.kickOffExtraction().catch((e: Error) => {
                        logger.error('记忆提取与压缩后台任务失败', e);
                    });
                }
            }
        });

        // 时间戳节流去重：500ms 内的重复事件才跳过，不影响多次独立生成
        let lastPromptReadyTs = 0;

        // 拦截最终大模型的发送包装，写入由 Builder 构造出的记忆内容
        eventSource.on(types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', async (payload: any) => {
            if (!isPluginEnabled()) return;
            const memory = (window as any).STX?.memory;
            if (!memory || !payload || !Array.isArray(payload.chat)) {
                logger.warn(`PROMPT_READY 跳过：memory=${!!memory}, payload=${!!payload}, chatArray=${Array.isArray(payload?.chat)}`);
                return;
            }

            // 节流去重：500ms 内重复触发只处理一次
            const now = Date.now();
            if (now - lastPromptReadyTs < 500) {
                logger.info('检测到 PROMPT_READY 重复触发（节流），已跳过');
                return;
            }
            lastPromptReadyTs = now;

            try {
                logger.info('触发大模型注入栈，正在向 Prompt 内附加短期事件池与摘要...');
                const latestUserMessage = [...payload.chat]
                    .reverse()
                    .find((item: any) => item?.role === 'user' && typeof item?.content === 'string');
                const query = String(latestUserMessage?.content || '').trim();
                const settingsMaxTokens = Number(readSettings().contextMaxTokens) || 1200;
                const injectedContextResult = await memory.injection.buildContext({
                    maxTokens: settingsMaxTokens,
                    query,
                    preferSummary: true,
                    intentHint: 'auto',
                    includeDecisionMeta: true,
                });
                const injectedContext = typeof injectedContextResult === 'string'
                    ? injectedContextResult
                    : injectedContextResult?.text || '';
                if (typeof injectedContextResult === 'object' && injectedContextResult) {
                    logger.info(`buildContext 选用区段: ${injectedContextResult.sectionsUsed.join(', ')}`);
                }

                logger.info(`buildContext 返回内容长度: ${injectedContext?.length ?? 0}`);

                if (!injectedContext || injectedContext.trim().length === 0) {
                    logger.warn('记忆上下文为空，跳过注入（数据库可能尚无内容）。');
                    return;
                }

                const wrapperString = `\n<MEMORY_OS_CONTEXT>\n${injectedContext}\n</MEMORY_OS_CONTEXT>\n`;
                const policy = memory.injection.getAnchorPolicy?.() || { defaultInsert: 'top', allowSystem: false, allowUser: true };

                if (policy.defaultInsert === 'beforeStart') {
                    // 在第一条用户消息之前插入独立 system 消息
                    const firstUserIdx = payload.chat.findIndex((m: any) => m?.role === 'user');
                    const insertIdx = firstUserIdx > 0 ? firstUserIdx : 1;
                    payload.chat.splice(insertIdx, 0, { role: 'system', content: wrapperString });
                    logger.success('记忆注入完成，已插入到首条用户消息前。');
                } else if (policy.defaultInsert === 'customAnchor') {
                    // 追加为独立 system 消息到末尾
                    payload.chat.push({ role: 'system', content: wrapperString });
                    logger.success('记忆注入完成，已作为末尾 System 元素推入。');
                } else {
                    // 默认 'top'：在系统提示词后追加为独立消息
                    if (payload.chat.length > 0 && payload.chat[0]?.role === 'system') {
                        payload.chat.splice(1, 0, { role: 'system', content: wrapperString });
                    } else {
                        payload.chat.unshift({ role: 'system', content: wrapperString });
                    }
                    logger.success('记忆注入完成，已作为独立 System 消息插入顶部。');
                }

            } catch (error) {
                logger.error('Prompt Context 构建或注入失败', error);
            }
        });
    }
}

// 模拟插件环境挂载
(window as any).MemoryOSPlugin = new MemoryOS();

// 自动初始化 UI 挂载
if (typeof document !== 'undefined') {
    renderSettingsUi().catch(err => {
        logger.error('UI 渲染失败:', err);
    });
}
