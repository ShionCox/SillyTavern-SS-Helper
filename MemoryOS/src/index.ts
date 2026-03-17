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
export { ChatViewManager } from './core/chat-view-manager';
export { ChatLifecycleManager } from './core/chat-lifecycle-manager';

// 注入管理器
export { InjectionManager } from './injection/injection-manager';

// 编排胶水层

// SDK 门面层
export { MemorySDKImpl } from './sdk/memory-sdk';

// 工具函数
export { buildScopePrefix, buildScopedKey, validateScopeAccess } from './utils/scope-manager';
export type { ScopeLevel, ScopeContext } from './utils/scope-manager';

// 世界模板系统
export { TemplateManager } from './template/template-manager';
export { TemplateBuilder } from './template/template-builder';
export { WorldInfoReader } from './template/worldinfo-reader';
export { WorldInfoWriter } from './template/worldinfo-writer';
export type {
    WorldTemplate, TemplateFactType, TemplateTableDef,
    ExtractPolicies, InjectionLayout,
    WorldInfoEntry, WorldContextBundle,
} from './template/types';

// v2 类型系统
export type {
    AdaptiveMetrics, AdaptivePolicy, ChatProfile, ChatProfileOverride,
    MemoryOSChatState, RetentionPolicy, StrategyDecision,
    AutoSchemaPolicy, SchemaDraftSession, AssistantTurnTracker,
    TurnLifecycle, TurnKind, TurnRecord, LogicalChatView, LogicalMessageNode, ChatMutationKind, ChatArchiveState,
    ColdStartStage, MutationRepairTask,
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
import { ChatLifecycleManager } from './core/chat-lifecycle-manager';
import {
    buildSdkChatKeyEvent,
    extractTavernPromptMessagesEvent,
    findFirstTavernPromptSystemIndexEvent,
    findLastTavernPromptSystemIndexEvent,
    getCurrentTavernCharacterSnapshotEvent,
    getTavernMessageTextEvent,
    getTavernPromptMessageTextEvent,
    insertTavernPromptSystemMessageEvent,
    isTavernPromptSystemMessageEvent,
} from '../../SDK/tavern';
import type { SdkTavernPromptMessageEvent } from '../../SDK/tavern';
import { db } from './db/db';
import { PluginRegistry } from './registry/registry';
import { filterRecordText } from './core/record-filter';
import { initBridge as initLlmBridge, type BridgeInitStatus } from './llm/memoryLlmBridge';
import { setAiModeEnabled, setLlmHubMounted, setConsumerRegistered } from './llm/ai-health-center';
import { bindMemoryChatToolbarActions, ensureMemoryChatToolbar, removeMemoryChatToolbar } from './runtime/chatToolbar';
import type { PreGenerationGateDecision, PromptAnchorMode } from './types';
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

type PromptBlockKind = 'system' | 'persona' | 'author_note' | 'lorebook' | 'other';

/**
 * 功能：归一化 Prompt 分段文本，降低空白和换行带来的噪声。
 * @param text 原始文本。
 * @returns 归一化后的文本。
 */
function normalizePromptSegmentText(text: unknown): string {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：提取 Prompt 消息中的辅助元信息，提高分段分类精度。
 * @param message Prompt 消息对象。
 * @returns 可用于分类的元信息文本。
 */
function getPromptMessageMetaText(message: SdkTavernPromptMessageEvent | null | undefined): string {
    if (!message || typeof message !== 'object') {
        return '';
    }
    const record = message as Record<string, unknown>;
    const candidates: unknown[] = [
        record.name,
        record.title,
        record.label,
        record.identifier,
        record.source,
        record.type,
        record.prompt_name,
        record.promptName,
        record.comment,
        record.note,
    ];
    return candidates
        .map((item: unknown): string => normalizePromptSegmentText(item))
        .filter((item: string): boolean => Boolean(item))
        .join(' ');
}

/**
 * 功能：按启发式规则对 Prompt 分段类型进行打分。
 * @param analysisText 合并后的分析文本。
 * @param headText 文本前缀，用于识别标题式模板。
 * @param isSystemMessage 当前消息是否为 system。
 * @returns 各候选类型分数。
 */
function scorePromptBlockHints(
    analysisText: string,
    headText: string,
    isSystemMessage: boolean,
): Record<'author_note' | 'lorebook' | 'persona' | 'system', number> {
    const score: Record<'author_note' | 'lorebook' | 'persona' | 'system', number> = {
        author_note: 0,
        lorebook: 0,
        persona: 0,
        system: 0,
    };

    if (isSystemMessage) {
        score.system += 2;
    }

    if (/^(?:[#\-\*\s\[]*)?(author'?s?\s*note|a\/n|作者注释|作者注记|创作注释|作者说明)/i.test(headText)) {
        score.author_note += 4;
    }
    if (/(author'?s?\s*note|a\/n|creator\s*notes?|作者注释|作者注记|创作注释|作者说明)/i.test(analysisText)) {
        score.author_note += 2;
    }

    if (/^(?:[#\-\*\s\[]*)?(lorebook|world\s*info(?:rmation)?|worldinfo|世界书|世界信息|设定词条|百科设定)/i.test(headText)) {
        score.lorebook += 4;
    }
    if (/(lorebook|world\s*info(?:rmation)?|worldinfo|wi\s*entry|wi\s*entries|世界书|世界信息|世界观设定|设定词条|背景设定)/i.test(analysisText)) {
        score.lorebook += 2;
    }
    if (/(keywords?|secondary\s*keys?|entry|constant|position|comment)\s*[:：]/i.test(headText) && /(lore|world|设定|世界)/i.test(analysisText)) {
        score.lorebook += 2;
    }

    if (/^(?:[#\-\*\s\[]*)?(persona|character\s*card|character\s*persona|角色卡|角色设定|人物设定|人设)/i.test(headText)) {
        score.persona += 4;
    }
    if (/(persona|character\s*card|character\s*persona|character\s*description|角色卡|角色设定|人物设定|人设|身份设定|扮演设定)/i.test(analysisText)) {
        score.persona += 2;
    }
    if (/(description|personality|scenario|example|示例对话|性格设定|世界观)\s*[:：]/i.test(headText) && /(character|persona|角色|人设)/i.test(analysisText)) {
        score.persona += 2;
    }

    if (/^(you are|you'?re|system|instruction|guideline|规则|系统提示|你是)/i.test(headText)) {
        score.system += 2;
    }
    if (/(system\s*prompt|system\s*instruction|必须遵守|core\s*instruction|global\s*rule)/i.test(analysisText)) {
        score.system += 1;
    }

    return score;
}

/**
 * 功能：按文本和元信息特征推断 Prompt 区块类型。
 * @param text 当前消息文本。
 * @param message 当前 Prompt 消息对象。
 * @returns 归类后的 Prompt 区块类型。
 */
function inferPromptBlockKind(text: string, message?: SdkTavernPromptMessageEvent): PromptBlockKind {
    const normalized = normalizePromptSegmentText(text);
    if (!normalized) {
        return 'other';
    }
    const metaText = getPromptMessageMetaText(message);
    const isSystemMessage = isTavernPromptSystemMessageEvent(message);
    const analysisText = `${normalized} ${metaText}`.toLowerCase();
    const headText = analysisText.slice(0, 320);
    const score = scorePromptBlockHints(analysisText, headText, isSystemMessage);
    const rankedKinds: Array<{ kind: PromptBlockKind; score: number }> = [
        { kind: 'author_note', score: score.author_note },
        { kind: 'lorebook', score: score.lorebook },
        { kind: 'persona', score: score.persona },
    ];
    rankedKinds.sort((left, right): number => right.score - left.score);
    const bestKind = rankedKinds[0];
    if (bestKind && (bestKind.score >= 3 || (isSystemMessage && bestKind.score >= 2))) {
        return bestKind.kind;
    }
    if (score.system >= 3) {
        return 'system';
    }
    if (isSystemMessage) {
        return 'system';
    }
    return 'other';
}

/**
 * 功能：在 Prompt 消息数组中查找目标区块。
 * @param chat Prompt 消息数组。
 * @param kind 目标区块类型。
 * @param direction 查找方向。
 * @returns 命中的索引；未命中时返回 -1。
 */
function findPromptBlockIndexByKind(
    chat: SdkTavernPromptMessageEvent[],
    kind: PromptBlockKind,
    direction: 'first' | 'last' = 'last',
): number {
    if (!Array.isArray(chat) || chat.length === 0) {
        return -1;
    }
    const shouldPreferSystem = kind === 'persona' || kind === 'author_note' || kind === 'lorebook';
    const probe = (strictSystemOnly: boolean): number => {
        const start = direction === 'first' ? 0 : chat.length - 1;
        const end = direction === 'first' ? chat.length : -1;
        const step = direction === 'first' ? 1 : -1;
        for (let index = start; index !== end; index += step) {
            const message = chat[index];
            if (strictSystemOnly && shouldPreferSystem && !isTavernPromptSystemMessageEvent(message)) {
                continue;
            }
            const text = getTavernPromptMessageTextEvent(message);
            if (inferPromptBlockKind(text, message) === kind) {
                return index;
            }
        }
        return -1;
    };
    const strictIndex = probe(true);
    if (strictIndex >= 0) {
        return strictIndex;
    }
    return probe(false);
}

/**
 * 功能：根据锚点模式计算插入位置。
 * @param chat Prompt 消息数组。
 * @param anchorMode 目标锚点。
 * @param intent 当前注入意图。
 * @returns 可用插入位置；无法定位时返回 null。
 */
function resolvePromptIndexBySingleAnchor(
    chat: SdkTavernPromptMessageEvent[],
    anchorMode: PromptAnchorMode,
    intent: string,
): number | null {
    if (!Array.isArray(chat)) {
        return null;
    }
    if (anchorMode === 'top') {
        return 0;
    }
    if (anchorMode === 'custom_anchor') {
        return chat.length;
    }
    if (anchorMode === 'before_start') {
        const firstUserIndex = chat.findIndex((message: SdkTavernPromptMessageEvent): boolean => {
            return String(message?.role ?? '').trim().toLowerCase() === 'user' || message?.is_user === true;
        });
        return firstUserIndex >= 0 ? firstUserIndex : Math.min(1, chat.length);
    }
    if (anchorMode === 'after_first_system') {
        const index = findFirstTavernPromptSystemIndexEvent(chat);
        return index >= 0 ? index + 1 : null;
    }
    if (anchorMode === 'after_last_system') {
        const index = findLastTavernPromptSystemIndexEvent(chat);
        return index >= 0 ? index + 1 : null;
    }
    if (anchorMode === 'after_persona') {
        const index = findPromptBlockIndexByKind(chat, 'persona');
        return index >= 0 ? index + 1 : null;
    }
    if (anchorMode === 'after_author_note') {
        const index = findPromptBlockIndexByKind(chat, 'author_note');
        return index >= 0 ? index + 1 : null;
    }
    if (anchorMode === 'after_lorebook') {
        const index = findPromptBlockIndexByKind(chat, 'lorebook');
        return index >= 0 ? index + 1 : null;
    }
    if (anchorMode === 'setting_query_only') {
        if (intent !== 'setting_qa') {
            return null;
        }
        const lorebookIndex = findPromptBlockIndexByKind(chat, 'lorebook');
        if (lorebookIndex >= 0) {
            return lorebookIndex + 1;
        }
        const lastSystemIndex = findLastTavernPromptSystemIndexEvent(chat);
        return lastSystemIndex >= 0 ? lastSystemIndex + 1 : 0;
    }
    return null;
}

/**
 * 功能：按主锚点和回退链解析最终插入位置。
 * @param chat Prompt 消息数组。
 * @param decision 生成前 gate 决策。
 * @returns 可用插入位置。
 */
function resolvePromptInsertIndexByAnchor(
    chat: SdkTavernPromptMessageEvent[],
    decision: PreGenerationGateDecision,
): number {
    const orderedAnchors = [decision.anchorMode, ...decision.fallbackOrder].filter(Boolean);
    const uniqueAnchors = Array.from(new Set(orderedAnchors));
    for (const anchorMode of uniqueAnchors) {
        const index = resolvePromptIndexBySingleAnchor(chat, anchorMode, decision.intent);
        if (index != null) {
            return Math.max(0, Math.min(index, chat.length));
        }
    }
    return Math.max(0, chat.length);
}

class MemoryOS {
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
                const nextTextSignature = normalizeTextSignature(result.filteredText);
                const pendingEventKey = normalizedMsgId
                    ? `${activeChatKey}|${eventType}|id:${normalizedMsgId}`
                    : nextTextSignature
                        ? `${activeChatKey}|${eventType}|text:${nextTextSignature}`
                        : '';
                if (pendingEventKey && pendingMessageEventKeys.has(pendingEventKey)) {
                    logger.info(`命中运行时并发去重，跳过重复入库 type=${eventType}, msgId=${normalizedMsgId || '(none)'}`);
                    recordIngestHealth(true);
                    return;
                }
                if (pendingEventKey) {
                    pendingMessageEventKeys.add(pendingEventKey);
                }

                const appendTask = (async (): Promise<void> => {
                    try {
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
                        if (!normalizedMsgId && nextTextSignature) {
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
                    } finally {
                        if (pendingEventKey) {
                            pendingMessageEventKeys.delete(pendingEventKey);
                        }
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
        const processedMessageKeys = new Set<string>();
        const pendingMessageEventKeys = new Set<string>();
        const bootstrapAssistantByChatKey = new Map<string, string>();
        const historicalMessageIdsOnBind = new Set<string>();
            const historicalMessageTextSignaturesOnBind = new Set<string>();
        let bindHydrationUntilTs = 0;
            let bindHydrationTextGuardUntilTs = 0;
        let currentChatKey = '';
        let lastAssistantSignature = '';
        let lastAssistantSignatureAt = 0;
        let lastAssistantTextSignature = '';
        let lastAssistantTextSignatureAt = 0;
        let lastUserSignature = '';
        let lastUserSignatureAt = 0;
        let lastChatStructureSignature = '';
        const DUPLICATE_SIGNATURE_WINDOW_MS = 3000;
        // 功能：将消息 ID 归一化为字符串。
        const normalizeMessageId = (msgId: unknown): string => {
            return String(msgId ?? '').trim();
        };
            const normalizeStableMessageId = (msgId: unknown): string => {
                const normalized = normalizeMessageId(msgId);
                return normalized === '0' ? '' : normalized;
            };
        const collectHistoricalMessageIdsFromChat = (chatList: unknown): Set<string> => {
            const idSet = new Set<string>();
            if (!Array.isArray(chatList)) return idSet;
            for (const item of chatList) {
                    const normalized = normalizeStableMessageId(
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
            if (typeof eventPayload === 'number') {
                return '';
            }
            if (typeof eventPayload === 'string') {
                    return normalizeStableMessageId(eventPayload);
            }
            if (typeof eventPayload === 'object') {
                const source = eventPayload as Record<string, unknown>;
                    return normalizeStableMessageId(
                    source._id
                    ?? source.id
                    ?? source.messageId
                    ?? source.mesid
                );
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
        const normalizeTextSignature = (value: string): string => {
            return String(value || '')
                .replace(/\s+/g, ' ')
                .trim();
        };
            const collectHistoricalMessageTextSignaturesFromChat = (chatList: unknown): Set<string> => {
                const signatureSet = new Set<string>();
                if (!Array.isArray(chatList)) return signatureSet;
                for (const item of chatList) {
                    if (isSystemMessage(item)) {
                        continue;
                    }
                    const textSignature = normalizeTextSignature(readMessageText(item));
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
                        const msgId = normalizeStableMessageId(item?._id ?? item?.id ?? item?.messageId ?? item?.mesid ?? '');
                    const role = isSystemMessage(item) ? 'system' : (isUserMessage(item) ? 'user' : 'assistant');
                    const text = normalizeTextSignature(readMessageText(item));
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
                const left = normalizeMessageId(item?._id ?? item?.id ?? item?.messageId ?? item?.mesid);
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
        const onChangeConfig = async (force: boolean = false) => {
            const ctx = getCtx();
            currentChatKey = '';
            removeMemoryChatToolbar();

            // 无论是否启用，切换时都清空消息去重 Set
            processedMessageKeys.clear();
            pendingMessageEventKeys.clear();
            historicalMessageIdsOnBind.clear();
                historicalMessageTextSignaturesOnBind.clear();
            bindHydrationUntilTs = 0;
                bindHydrationTextGuardUntilTs = 0;
            lastAssistantSignature = '';
            lastAssistantSignatureAt = 0;
            lastAssistantTextSignature = '';
            lastAssistantTextSignatureAt = 0;
            lastUserSignature = '';
            lastUserSignatureAt = 0;
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
            for (const historyId of historicalIds) {
                historicalMessageIdsOnBind.add(historyId);
            }
                const historicalTextSignatures = collectHistoricalMessageTextSignaturesFromChat(ctx?.chat);
                for (const textSignature of historicalTextSignatures) {
                    historicalMessageTextSignaturesOnBind.add(textSignature);
                }
            bindHydrationUntilTs = Date.now() + 1500;
                bindHydrationTextGuardUntilTs = Date.now() + 10000;

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
        eventSource.on(types.CHAT_CHANGED || 'chat_changed', onChangeConfig);
        eventSource.on(types.CHAT_STARTED || 'chat_started', onChangeConfig);
        eventSource.on(types.CHAT_NEW || 'chat_new', onChangeConfig);
        eventSource.on(types.CHAT_CREATED || 'chat_created', onChangeConfig);
        eventSource.on(types.GROUP_CHAT_CREATED || 'group_chat_created', onChangeConfig);
        eventSource.on(types.CHAT_CHANGED || 'chat_changed', () => {
            setTimeout(() => rebuildLogicalViewIfNeeded('chat_changed', true), 0);
        });
        eventSource.on(types.CHAT_STARTED || 'chat_started', () => {
            setTimeout(() => rebuildLogicalViewIfNeeded('chat_started', true), 0);
        });
        eventSource.on(types.CHAT_NEW || 'chat_new', () => {
            setTimeout(() => rebuildLogicalViewIfNeeded('chat_new', true), 0);
        });
        eventSource.on(types.CHAT_CREATED || 'chat_created', () => {
            setTimeout(() => rebuildLogicalViewIfNeeded('chat_created', true), 0);
        });
        eventSource.on(types.GROUP_CHAT_CREATED || 'group_chat_created', () => {
            setTimeout(() => rebuildLogicalViewIfNeeded('group_chat_created', true), 0);
        });
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
            const messageIndex = extractMessageIndex(eventPayload);
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
                const messageObj = resolveMessageFromEventPayload(ctx.chat, eventPayload, msgId);
                const text = readMessageText(messageObj);
                logger.info(`监听到新回复进入，msgId: ${msgId}，准备记录记忆事件...`);
                if (text && !isUserMessage(messageObj) && !isSystemMessage(messageObj)) {
                    const signature = `${msgId}|${text}`;
                    const textSignature = normalizeTextSignature(text);
                    const now = Date.now();
                    if (
                        !msgId
                        && textSignature
                        && historicalMessageTextSignaturesOnBind.has(textSignature)
                        && now <= bindHydrationTextGuardUntilTs
                    ) {
                        logger.info(`绑定期历史助手文本重复已跳过，messageIndex=${messageIndex >= 0 ? messageIndex : '(none)'}`);
                        return;
                    }
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
                    rebuildLogicalViewIfNeeded('assistant_message');
                    lastAssistantSignature = signature;
                    lastAssistantSignatureAt = now;
                    lastAssistantTextSignature = textSignature;
                    lastAssistantTextSignatureAt = now;
                } else {
                    appendLatestAssistantMessageFallback();
                    rebuildLogicalViewIfNeeded('assistant_fallback');
                }
            }
        };

        const onUserMessageCaptured = (eventPayload: unknown): void => {
            if (!isPluginEnabled()) return;
            const msgId = extractMessageId(eventPayload);
            const messageIndex = extractMessageIndex(eventPayload);
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
                const messageObj = resolveMessageFromEventPayload(ctx.chat, eventPayload, msgId)
                    || findLastChatMessageByRole(ctx, 'user');
                const text = readMessageText(messageObj);
                logger.info(`监听到用户发言，msgId: ${msgId}，准备记录记忆事件...`);
                if (text) {
                    const signature = `${msgId}|${text}`;
                    const textSignature = normalizeTextSignature(text);
                    if (
                        !msgId
                        && textSignature
                        && historicalMessageTextSignaturesOnBind.has(textSignature)
                        && Date.now() <= bindHydrationTextGuardUntilTs
                    ) {
                        logger.info(`绑定期历史用户文本重复已跳过，messageIndex=${messageIndex >= 0 ? messageIndex : '(none)'}`);
                        return;
                    }
                    if (
                        signature === lastUserSignature &&
                        Date.now() - lastUserSignatureAt <= DUPLICATE_SIGNATURE_WINDOW_MS
                    ) {
                        logger.info(`用户消息签名重复已跳过，msgId: ${msgId}`);
                        return;
                    }
                    appendFilteredMessageEvent('chat.message.sent', text, msgId || undefined);
                    rebuildLogicalViewIfNeeded('user_message');
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
                // 尝试补录最后一条助手回复（仅兜底）
                appendLatestAssistantMessageFallback();
                rebuildLogicalViewIfNeeded('generation_ended', true);
                void Promise.resolve((memory as any)?.chatState?.primeColdStartExtract?.('generation_ended'))
                    .catch((error: unknown) => {
                        logger.warn('Cold-start extract prime failed on generation_ended', error);
                    });

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
            logger.info(`收到 prompt_ready，准备触发 prompt prime 与注入构建 chatKey=${currentChatKey || '(unknown)'}, promptMessages=${promptMessages.length}`);
            rebuildLogicalViewIfNeeded('prompt_ready');
            void Promise.resolve((memory as any)?.chatState?.primeColdStartPrompt?.('chat_completion_prompt_ready'))
                .catch((error: unknown) => {
                    logger.warn('Cold-start prompt prime failed on prompt_ready', error);
                });

            try {
                logger.info('触发大模型注入栈，正在向 Prompt 内附加短期事件池与摘要...');
                const latestUserMessage = [...promptMessages]
                    .reverse()
                    .find((item: SdkTavernPromptMessageEvent) => {
                        return String(item?.role ?? '').trim().toLowerCase() === 'user' || item?.is_user === true;
                    });
                const query = getTavernPromptMessageTextEvent(latestUserMessage).trim();
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
                const preDecision = typeof injectedContextResult === 'object' && injectedContextResult
                    ? (injectedContextResult.preDecision as PreGenerationGateDecision | undefined)
                    : undefined;
                if (typeof injectedContextResult === 'object' && injectedContextResult) {
                    logger.info(`buildContext 选用区段: ${injectedContextResult.sectionsUsed.join(', ')}`);
                }

                logger.info(`buildContext 返回内容长度: ${injectedContext?.length ?? 0}`);

                if (!preDecision?.shouldInject || !injectedContext || injectedContext.trim().length === 0) {
                    logger.warn('记忆上下文为空或生成前 gate 判定跳过，已取消注入。');
                    return;
                }

                const insertIndex = resolvePromptInsertIndexByAnchor(promptMessages, preDecision);
                insertTavernPromptSystemMessageEvent(promptMessages, {
                    text: injectedContext,
                    insertMode: 'before_index',
                    insertBeforeIndex: insertIndex,
                    template: promptMessages[Math.max(0, Math.min(insertIndex - 1, promptMessages.length - 1))] ?? promptMessages[0],
                });
                logger.success(`记忆注入完成，已按锚点 ${preDecision.anchorMode} 插入到 Prompt 结构中。`);

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
