import { readSdkPluginChatState, writeSdkPluginChatState } from '../../../SDK/db';
import { db, type DBFact, type DBSummary, type DBDerivationSource, type DBVectorChunkMetadata } from '../db/db';
import { Logger } from '../../../SDK/logger';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import {
    buildEffectivePresetBundle,
    clearRolePreset,
    saveGlobalPreset,
    saveRolePreset,
} from './chat-preset-store';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    AssistantTurnTracker,
    AutoSchemaPolicy,
    ChatLifecycleStage,
    ChatLifecycleState,
    ColdStartLorebookEntrySelection,
    ColdStartLorebookSelection,
    ColdStartStage,
    EffectivePresetBundle,
    ChatSemanticSeed,
    ChatMutationKind,
    ChatProfile,
    ExtractHealthWindow,
    GroupMemoryState,
    LatestRecallExplanation,
    MemoryActorRetentionMap,
    MemoryActorRetentionState,
    MemoryCandidate,
    MemoryCandidateKind,
    MemoryLifecycleState,
    MemoryMutationHistoryAction,
    MemoryMutationHistoryEntry,
    IngestHealthWindow,
    InjectedMemoryTone,
    LorebookGateDecision,
    LorebookGateMode,
    LogicalChatView,
    MaintenanceActionType,
    MaintenanceAdvice,
    MaintenanceExecutionResult,
    MaintenanceInsight,
    ManualOverrides,
    MemoryMutationPlanSnapshot,
    PersonaMemoryProfile,
    MemoryOSChatState,
    MemoryQualityScorecard,
    OwnedMemoryState,
    RecallLogEntry,
    RelationshipDelta,
    RelationshipState,
    MemoryMutationTargetKind,
    PostGenerationGateDecision,
    PreGenerationGateDecision,
    PromptInjectionProfile,
    RetentionArchives,
    RetentionPolicy,
    RetrievalHealthWindow,
    RowAliasIndex,
    RowRedirects,
    SimpleMemoryPersona,
    MemoryTuningProfile,
    TurnRecord,
    RowTombstones,
    SchemaDraftSession,
    StrategyDecision,
    SummaryFixTask,
    MutationRepairTask,
    SummaryPolicyOverride,
    UserFacingChatPreset,
    VectorLifecycleState,
} from '../types';
import {
    DEFAULT_ADAPTIVE_METRICS,
    DEFAULT_ASSISTANT_TURN_TRACKER,
    DEFAULT_AUTO_SCHEMA_POLICY,
    DEFAULT_CHAT_LIFECYCLE_STATE,
    DEFAULT_CHAT_PROFILE,
    DEFAULT_EFFECTIVE_PRESET_BUNDLE,
    DEFAULT_EXTRACT_HEALTH,
    DEFAULT_GROUP_MEMORY,
    DEFAULT_INGEST_HEALTH,
    DEFAULT_MEMORY_QUALITY,
    DEFAULT_MEMORY_MUTATION_ACTION_COUNTS,
    DEFAULT_MEMORY_TUNING_PROFILE,
    DEFAULT_PERSONA_MEMORY_PROFILE,
    DEFAULT_PROMPT_INJECTION_PROFILE,
    DEFAULT_RETENTION_ARCHIVES,
    DEFAULT_RETRIEVAL_HEALTH,
    DEFAULT_SCHEMA_DRAFT_SESSION,
    DEFAULT_SIMPLE_MEMORY_PERSONA,
    DEFAULT_USER_FACING_CHAT_PRESET,
    DEFAULT_VECTOR_LIFECYCLE,
} from '../types';
import { MemoryMutationHistoryManager } from './memory-mutation-history';
import {
    applyAdaptivePolicyOverrides,
    applyChatProfileOverrides,
    applyRetentionPolicyOverrides,
    buildAdaptivePolicy,
    buildMaintenanceAdvice,
    buildRetentionPolicy,
    computeMemoryQualityScorecard,
    inferChatProfile,
    inferVectorMode,
} from './chat-strategy-engine';
import { CompactionManager } from './compaction-manager';
import { ProposalManager } from '../proposal/proposal-manager';
import { VectorManager } from '../vector/vector-manager';
import {
    buildPerActorRetentionMap,
    buildLifecycleState,
    buildScoredMemoryCandidate,
    buildSimpleMemoryPersona,
    clamp01,
    computeRelationshipWeight,
    detectEmotionTag,
    detectRelationScope,
    enrichLifecycleOwnedState,
    inferPersonaMemoryProfile,
    inferPersonaMemoryProfiles,
    normalizeMemoryText,
    type MemoryCandidateInput,
    type OwnedMemoryInferenceInput,
} from './memory-intelligence';

/**
 * 功能：把记录类型规整为严格向量链允许的类型。
 * @param recordKind 记录类型。
 * @returns 严格向量链允许的记录类型；如果不支持则返回 null。
 */
function normalizeStrictVectorRecordKind(recordKind: MemoryLifecycleState['recordKind']): 'fact' | 'summary' | null {
    if (recordKind === 'fact' || recordKind === 'summary') {
        return recordKind;
    }
    return null;
}

/**
 * 功能：从事实或摘要记录里读取来源追踪信息。
 * @param record 事实或摘要记录。
 * @param recordKind 记录类型。
 * @returns 来源追踪信息；若没有则返回 null。
 */
function readStrictVectorSourceTrace(record: DBFact | DBSummary, recordKind: 'fact' | 'summary'): DBDerivationSource | null {
    if (recordKind === 'fact') {
        return (record as DBFact).provenance?.source ?? null;
    }
    return (record as DBSummary).source?.provenance?.source ?? null;
}

/**
 * 功能：构建严格向量索引所需的稳定文本。
 * @param record 事实或摘要记录。
 * @param recordKind 记录类型。
 * @returns 用于向量化的规范文本。
 */
function buildStrictVectorText(record: DBFact | DBSummary, recordKind: 'fact' | 'summary'): string {
    if (recordKind === 'fact') {
        const fact = record as DBFact;
        return normalizeMemoryText(`${fact.type} ${fact.path ?? ''} ${JSON.stringify(fact.value ?? '')}`);
    }
    const summary = record as DBSummary;
    return normalizeMemoryText(`${summary.title ?? ''}\n${summary.content ?? ''}`);
}

/**
 * 功能：为严格向量索引构建 metadata。
 * @param record 事实或摘要记录。
 * @param recordKind 记录类型。
 * @param reason 触发原因。
 * @returns 严格向量 metadata。
 */
function buildStrictVectorMetadata(record: DBFact | DBSummary, recordKind: 'fact' | 'summary', reason: string): DBVectorChunkMetadata {
    const trace = readStrictVectorSourceTrace(record, recordKind);
    const source: DBDerivationSource = {
        kind: String(trace?.kind ?? `strict_${recordKind}_sync`),
        reason: String(trace?.reason ?? reason),
        viewHash: String(trace?.viewHash ?? ''),
        snapshotHash: String(trace?.snapshotHash ?? ''),
        messageIds: Array.isArray(trace?.messageIds) ? trace?.messageIds : [],
        anchorMessageId: trace?.anchorMessageId,
        mutationKinds: Array.isArray(trace?.mutationKinds) ? trace?.mutationKinds : [],
        repairGeneration: Number(trace?.repairGeneration ?? 0),
        ts: Number(trace?.ts ?? Date.now()),
    };
    return {
        index: 0,
        source,
        sourceRecordKey: recordKind === 'fact' ? (record as DBFact).factKey : (record as DBSummary).summaryId,
        sourceRecordKind: recordKind,
        ownerActorKey: record.ownerActorKey ?? null,
        sourceScope: normalizeMemoryText(record.sourceScope ?? 'system') || 'system',
        memoryType: normalizeMemoryText(record.memoryType ?? 'other') || 'other',
        memorySubtype: normalizeMemoryText(record.memorySubtype ?? 'other') || 'other',
        participantActorKeys: [],
    };
}
import {
    getPrimaryPersonaActorKey,
    migratePersonaState,
    resolvePersonaProfile,
    resolveSimplePersona,
} from './persona-compat';
import { normalizeMemoryTuningProfile } from './memory-tuning';
import { normalizeLatestRecallExplanation } from './recall-explanation';
import { buildGroupRelationshipSeeds } from './relationship-graph';

const logger = new Logger('ChatStateManager');
const REPAIR_TRIGGER_KINDS: ChatMutationKind[] = ['message_edited', 'message_swiped', 'message_deleted', 'chat_branched'];

function shouldEnqueueMutationRepair(mutationKinds: ChatMutationKind[]): boolean {
    const set = new Set(Array.isArray(mutationKinds) ? mutationKinds : []);
    return REPAIR_TRIGGER_KINDS.some((kind: ChatMutationKind): boolean => set.has(kind));
}

function hasArrayIntersection(left: string[], rightSet: Set<string>): boolean {
    for (const item of left) {
        if (rightSet.has(item)) {
            return true;
        }
    }
    return false;
}

function readProvenanceViewHash(value: unknown): string {
    if (!value || typeof value !== 'object') {
        return '';
    }
    const record = value as Record<string, unknown>;
    const source = (record.source ?? {}) as Record<string, unknown>;
    return normalizeSeedText(source.viewHash);
}

function readProvenanceMessageIds(value: unknown): string[] {
    if (!value || typeof value !== 'object') {
        return [];
    }
    const record = value as Record<string, unknown>;
    const source = (record.source ?? {}) as Record<string, unknown>;
    const messageIdsRaw = source.messageIds;
    if (!Array.isArray(messageIdsRaw)) {
        return [];
    }
    return messageIdsRaw.map((item: unknown): string => normalizeSeedText(item)).filter(Boolean);
}

function hasStructuredProvenance(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    const source = (record.source ?? {}) as Record<string, unknown>;
    return Boolean(normalizeSeedText(source.viewHash));
}

function averagePrecisionWindow(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }
    return values.reduce((sum: number, value: number): number => sum + Number(value || 0), 0) / values.length;
}

function normalizeSeedText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：归一化最近一次 mutation planner 快照，确保聊天状态里只保留严格可用的字段。
 * @param value 原始快照数据。
 * @returns 归一化后的 mutation planner 快照；无效时返回 null。
 */
function normalizeMutationPlanSnapshot(value: unknown): MemoryMutationPlanSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const rawActionCounts = (record.actionCounts ?? {}) as Record<string, unknown>;
    const items = Array.isArray(record.items)
        ? record.items.reduce<MemoryMutationPlanSnapshot['items']>((result, item: unknown): MemoryMutationPlanSnapshot['items'] => {
            if (!item || typeof item !== 'object') {
                return result;
            }
            const itemRecord = item as Record<string, unknown>;
            const targetKindRaw = normalizeSeedText(itemRecord.targetKind);
            const targetKind: MemoryMutationPlanSnapshot['items'][number]['targetKind'] | null = targetKindRaw === 'fact' || targetKindRaw === 'summary' || targetKindRaw === 'state'
                ? targetKindRaw
                : null;
            if (!targetKind) {
                return result;
            }
            const actionRaw = normalizeSeedText(itemRecord.action).toUpperCase();
            const action: MemoryMutationPlanSnapshot['items'][number]['action'] = actionRaw === 'ADD'
                || actionRaw === 'MERGE'
                || actionRaw === 'UPDATE'
                || actionRaw === 'INVALIDATE'
                || actionRaw === 'DELETE'
                || actionRaw === 'NOOP'
                ? actionRaw as MemoryMutationPlanSnapshot['items'][number]['action']
                : 'NOOP';
            const itemId = normalizeSeedText(itemRecord.itemId);
            if (!itemId) {
                return result;
            }
            result.push({
                itemId,
                targetKind,
                action,
                title: normalizeSeedText(itemRecord.title) || '未命名变更',
                compareKey: normalizeSeedText(itemRecord.compareKey),
                normalizedText: normalizeSeedText(itemRecord.normalizedText),
                targetRecordKey: normalizeSeedText(itemRecord.targetRecordKey) || undefined,
                existingRecordKeys: Array.isArray(itemRecord.existingRecordKeys)
                    ? itemRecord.existingRecordKeys.map((entry: unknown): string => normalizeSeedText(entry)).filter(Boolean).slice(0, 8)
                    : [],
                reasonCodes: Array.isArray(itemRecord.reasonCodes)
                    ? itemRecord.reasonCodes.map((entry: unknown): string => normalizeSeedText(entry)).filter(Boolean).slice(0, 8)
                    : [],
            });
            return result;
        }, []).slice(0, 16)
        : [];
    return {
        source: normalizeSeedText(record.source) || 'proposal_apply',
        consumerPluginId: normalizeSeedText(record.consumerPluginId) || 'unknown_plugin',
        generatedAt: Math.max(0, Number(record.generatedAt ?? 0) || 0),
        totalItems: Math.max(0, Number(record.totalItems ?? items.length) || 0),
        appliedItems: Math.max(0, Number(record.appliedItems ?? 0) || 0),
        actionCounts: {
            ...DEFAULT_MEMORY_MUTATION_ACTION_COUNTS,
            ADD: Math.max(0, Number(rawActionCounts.ADD ?? 0) || 0),
            MERGE: Math.max(0, Number(rawActionCounts.MERGE ?? 0) || 0),
            UPDATE: Math.max(0, Number(rawActionCounts.UPDATE ?? 0) || 0),
            INVALIDATE: Math.max(0, Number(rawActionCounts.INVALIDATE ?? 0) || 0),
            DELETE: Math.max(0, Number(rawActionCounts.DELETE ?? 0) || 0),
            NOOP: Math.max(0, Number(rawActionCounts.NOOP ?? 0) || 0),
        },
        items,
    };
}

function normalizeMemoryActorRetentionMap(value: unknown): MemoryActorRetentionMap {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return Object.entries(value as Record<string, unknown>).reduce<MemoryActorRetentionMap>((result: MemoryActorRetentionMap, [actorKey, item]: [string, unknown]): MemoryActorRetentionMap => {
        const normalizedActorKey = normalizeSeedText(actorKey);
        if (!normalizedActorKey || !item || typeof item !== 'object') {
            return result;
        }
        const record = item as Record<string, unknown>;
        result[normalizedActorKey] = {
            actorKey: normalizedActorKey,
            stage: (record.stage ?? 'clear') as MemoryActorRetentionState['stage'],
            forgetProbability: clamp01(Number(record.forgetProbability ?? 0)),
            forgotten: record.forgotten === true,
            forgottenAt: Math.max(0, Number(record.forgottenAt ?? 0) || 0) || undefined,
            forgottenReasonCodes: Array.isArray(record.forgottenReasonCodes)
                ? record.forgottenReasonCodes.map((reason: unknown): string => normalizeSeedText(reason)).filter(Boolean)
                : [],
            rehearsalCount: Math.max(0, Number(record.rehearsalCount ?? 0) || 0),
            lastRecalledAt: Math.max(0, Number(record.lastRecalledAt ?? 0) || 0),
            retentionBias: Number(record.retentionBias ?? 0) || 0,
            confidence: clamp01(Number(record.confidence ?? 0)),
            updatedAt: Math.max(0, Number(record.updatedAt ?? 0) || 0),
        };
        return result;
    }, {});
}

function normalizeLorebookSelection(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(
        value
            .map((item: unknown): string => normalizeSeedText(item))
            .filter(Boolean),
    )).slice(0, 24);
}

function normalizeLorebookEntrySelection(value: unknown): ColdStartLorebookEntrySelection[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const entries = new Map<string, ColdStartLorebookEntrySelection>();
    for (const item of value) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const record = item as Record<string, unknown>;
        const book = normalizeSeedText(record.book);
        const entryId = normalizeSeedText(record.entryId);
        if (!book || !entryId) {
            continue;
        }
        const keywords = Array.isArray(record.keywords)
            ? Array.from(new Set(record.keywords.map((keyword: unknown): string => normalizeSeedText(keyword)).filter(Boolean))).slice(0, 12)
            : [];
        entries.set(`${book}::${entryId}`, {
            book,
            entryId,
            entry: normalizeSeedText(record.entry) || '未命名条目',
            keywords,
        });
        if (entries.size >= 256) {
            break;
        }
    }
    return Array.from(entries.values());
}

function normalizeColdStartLorebookSelection(value: ColdStartLorebookSelection | null | undefined): ColdStartLorebookSelection {
    return {
        books: normalizeLorebookSelection(value?.books),
        entries: normalizeLorebookEntrySelection(value?.entries),
    };
}

function buildManagedSummaryStableId(chatKey: string, kind: string): string {
    const normalizeIdPart = (value: unknown, fallback: string): string => {
        const normalized = normalizeSeedText(value)
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized || fallback;
    };
    return `managed:${normalizeIdPart(kind, 'summary')}:${normalizeIdPart(chatKey, 'chat')}`;
}

function inferLaneStyle(text: string): string {
    const normalized = normalizeSeedText(text);
    if (!normalized) {
        return 'neutral';
    }
    if (/担心|害怕|恐惧|紧张/.test(normalized)) {
        return 'anxious';
    }
    if (/难过|悲伤|失落/.test(normalized)) {
        return 'sad';
    }
    return 'neutral';
}

function inferLaneGoal(text: string): string {
    const normalized = normalizeSeedText(text);
    const match = normalized.match(/(要|准备|计划|必须|想要|目标是)([^。！？!?]{2,48})/);
    return normalizeSeedText(match?.[2] ?? '');
}

function inferLaneEmotion(text: string): string {
    const normalized = normalizeSeedText(text);
    if (!normalized) {
        return 'neutral';
    }
    if (/鎷呭績|瀹虫€晐鎭愭儳|绱у紶/.test(normalized)) {
        return 'anxious';
    }
    if (/闅捐繃|鎮蹭激|澶辫惤/.test(normalized)) {
        return 'sad';
    }
    if (/寮€蹇|鎰熸縺|鍠滄|鏀惧績/.test(normalized)) {
        return 'happy';
    }
    return 'neutral';
}

function inferRelationshipDelta(text: string): string {
    const normalized = normalizeSeedText(text);
    const hints = ['盟友', '敌人', '同伴', '队友', '恋人', '仇人', '上级', '下属', '家人'];
    const hit = hints.find((hint: string): boolean => normalized.includes(hint));
    return hit ?? '';
}

function isGenericUserName(value: string): boolean {
    const normalized = normalizeSeedText(value).toLowerCase();
    return normalized === 'user' || normalized === 'you' || normalized === '玩家' || normalized === '用户';
}

function isGenericAssistantName(value: string): boolean {
    const normalized = normalizeSeedText(value).toLowerCase();
    return normalized === 'assistant' || normalized === 'ai' || normalized === 'bot' || normalized === '助手';
}

function isGenericSystemName(value: string): boolean {
    const normalized = normalizeSeedText(value).toLowerCase();
    return normalized === 'system' || normalized === '系统';
}

function buildAssistantActorIdentity(
    previous: GroupMemoryState,
    semanticSeed?: ChatSemanticSeed | null,
): { actorKey: string; displayName: string; identityHint: string } {
    const semanticDisplayName = normalizeSeedText(semanticSeed?.identitySeed?.displayName);
    const semanticRoleKey = normalizeSeedText(semanticSeed?.identitySeed?.roleKey);
    const semanticAliases = Array.isArray(semanticSeed?.identitySeed?.aliases)
        ? semanticSeed!.identitySeed.aliases.map((alias: string): string => normalizeSeedText(alias)).filter(Boolean)
        : [];
    const memberNames = Array.isArray(previous.bindingSnapshot?.memberNames)
        ? previous.bindingSnapshot.memberNames
            .map((name: string): string => normalizeSeedText(name))
            .filter((name: string): boolean => Boolean(name) && !isGenericUserName(name) && !isGenericAssistantName(name) && !isGenericSystemName(name))
        : [];
    const displayName = [semanticDisplayName, ...semanticAliases, ...memberNames].find(Boolean) || 'Assistant';
    const actorKeySource = semanticRoleKey || displayName.toLowerCase();
    return {
        actorKey: `assistant:${actorKeySource}`,
        displayName,
        identityHint: semanticRoleKey || semanticDisplayName || 'role_anchor',
    };
}

function guessActorFromMessage(
    node: LogicalChatView['visibleMessages'][number],
    previous: GroupMemoryState,
    semanticSeed?: ChatSemanticSeed | null,
): { actorKey: string; displayName: string; identityHint: string } {
    const text = normalizeSeedText(node.text);
    const speakerMatch = text.match(/^([A-Za-z0-9_\u4e00-\u9fa5]{1,24})[:：]/);
    const speaker = normalizeSeedText(speakerMatch?.[1] ?? '');
    const normalizedId = normalizeSeedText(node.messageId);
    const actorKeyFromId = normalizedId
        ? `msg:${normalizedId.slice(0, 24)}`
        : '';
    if (speaker) {
        return {
            actorKey: `name:${speaker.toLowerCase()}`,
            displayName: speaker,
            identityHint: actorKeyFromId || 'name_anchor',
        };
    }
    if (node.role === 'user') {
        return {
            actorKey: 'role:user',
            displayName: 'User',
            identityHint: actorKeyFromId || 'role_anchor',
        };
    }
    if (node.role === 'assistant') {
        const assistantIdentity = buildAssistantActorIdentity(previous, semanticSeed);
        return {
            actorKey: assistantIdentity.actorKey,
            displayName: assistantIdentity.displayName,
            identityHint: assistantIdentity.identityHint || actorKeyFromId || 'role_anchor',
        };
    }
    return {
        actorKey: actorKeyFromId || 'role:system',
        displayName: 'System',
        identityHint: actorKeyFromId || 'role_anchor',
    };
}

/**
 * 功能：为群聊分轨生成稳定的近期消息标识。
 * @param node 逻辑消息节点。
 * @returns 可用于去重计数的稳定标识。
 */
function buildGroupLaneRecentMessageId(node: LogicalChatView['visibleMessages'][number]): string {
    const directMessageId = normalizeSeedText(node.messageId);
    if (directMessageId) {
        return directMessageId;
    }
    const fallbackParts: string[] = [
        normalizeSeedText(node.nodeId),
        normalizeSeedText(node.role),
        String(Number(node.updatedAt ?? node.createdAt ?? 0) || 0),
        normalizeSeedText(node.textSignature).slice(0, 48),
    ].filter(Boolean);
    return fallbackParts.join('|');
}

/**
 * 功能：管理单个聊天的 MemoryOS 聊天级状态。
 * @param chatKey 当前聊天键。
 * @returns 聊天状态管理器实例。
 */
export class ChatStateManager {
    private chatKey: string;
    private cache: MemoryOSChatState | null = null;
    private dirty = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly flushIntervalMs = 1000;
    private proposalManager: ProposalManager | null = null;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 功能：延迟创建用于结构化长期记忆写入的 proposal 管道。
     * @returns proposal 管道实例。
     */
    private getProposalManager(): ProposalManager {
        if (!this.proposalManager) {
            this.proposalManager = new ProposalManager(this.chatKey, this);
        }
        return this.proposalManager;
    }

    /**
     * 功能：根据当前聊天状态推导生命周期阶段。
     * 参数：
     *   state (MemoryOSChatState)：当前聊天状态。
     * 返回：
     *   Promise<{ stage: ChatLifecycleStage; reasonCodes: string[] }>：生命周期阶段与原因码。
     */
    private async resolveLifecycleStage(state: MemoryOSChatState): Promise<{ stage: ChatLifecycleStage; reasonCodes: string[] }> {
        if (state.archived === true) {
            return { stage: 'archived', reasonCodes: ['stage_archived'] };
        }
        const activeAssistantTurnCount = Number(state.assistantTurnTracker?.activeAssistantTurnCount ?? 0);
        const summaryCount = await db.summaries
            .where('[chatKey+level+createdAt]')
            .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
            .count();
        const factCount = await db.facts
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .count();
        const vectorMode = String(state.vectorLifecycle?.vectorMode ?? 'off');

        if (activeAssistantTurnCount >= 80 || summaryCount >= 6 || factCount >= 120) {
            return {
                stage: 'long_running',
                reasonCodes: ['stage_long_running', `turns_${activeAssistantTurnCount}`, `summaries_${summaryCount}`, `facts_${factCount}`],
            };
        }
        if (activeAssistantTurnCount >= 20 || summaryCount >= 1 || vectorMode !== 'off') {
            return {
                stage: 'stable',
                reasonCodes: ['stage_stable', `turns_${activeAssistantTurnCount}`, `summaries_${summaryCount}`, `vector_${vectorMode}`],
            };
        }
        if (activeAssistantTurnCount >= 4 || factCount >= 8) {
            return {
                stage: 'active',
                reasonCodes: ['stage_active', `turns_${activeAssistantTurnCount}`, `facts_${factCount}`],
            };
        }
        return { stage: 'new', reasonCodes: ['stage_new'] };
    }

    /**
     * 功能：刷新聊天生命周期状态。
     * 参数：
     *   state (MemoryOSChatState)：当前聊天状态。
     *   source (string)：触发来源。
     * 返回：
     *   Promise<ChatLifecycleState>：刷新后的生命周期状态。
     */
    private async refreshLifecycleState(state: MemoryOSChatState, source: string): Promise<ChatLifecycleState> {
        const previous: ChatLifecycleState = {
            ...DEFAULT_CHAT_LIFECYCLE_STATE,
            ...(state.chatLifecycle ?? {}),
            stageReasonCodes: Array.isArray(state.chatLifecycle?.stageReasonCodes) ? state.chatLifecycle.stageReasonCodes : [],
            mutationKinds: Array.isArray(state.chatLifecycle?.mutationKinds) ? state.chatLifecycle.mutationKinds : [],
        };
        const now = Date.now();
        const resolved = await this.resolveLifecycleStage(state);
        const next: ChatLifecycleState = {
            ...previous,
            stage: resolved.stage,
            stageReasonCodes: resolved.reasonCodes,
            firstSeenAt: Number(previous.firstSeenAt ?? 0) > 0 ? Number(previous.firstSeenAt) : now,
            stageEnteredAt: previous.stage === resolved.stage && Number(previous.stageEnteredAt ?? 0) > 0
                ? Number(previous.stageEnteredAt)
                : now,
            lastMaintenanceAt: Number(previous.lastMaintenanceAt ?? 0),
            lastMaintenanceAction: previous.lastMaintenanceAction,
            lastMutationAt: Number(previous.lastMutationAt ?? 0),
            lastMutationSource: String(previous.lastMutationSource ?? source ?? ''),
            mutationKinds: Array.isArray(previous.mutationKinds) ? previous.mutationKinds : [],
        };
        state.chatLifecycle = next;
        return next;
    }

    /**
     * 功能：在生命周期对象上登记聊天变动事件。
     * 参数：
     *   state (MemoryOSChatState)：当前聊天状态。
     *   kinds (ChatMutationKind[])：变动类型列表。
     *   source (string)：变动来源。
     * 返回：
     *   Promise<void>：异步完成。
     */
    private async recordLifecycleMutation(state: MemoryOSChatState, kinds: ChatMutationKind[], source: string): Promise<void> {
        const current = await this.refreshLifecycleState(state, source);
        const mutationKinds = new Set<ChatMutationKind>(current.mutationKinds ?? []);
        kinds.forEach((kind: ChatMutationKind): void => {
            if (kind) {
                mutationKinds.add(kind);
            }
        });
        state.chatLifecycle = {
            ...current,
            mutationKinds: Array.from(mutationKinds),
            lastMutationAt: Date.now(),
            lastMutationSource: source,
        };
    }

    /**
     * 功能：把生命周期偏置应用到默认策略。
     * 参数：
     *   basePolicy (AdaptivePolicy)：自动推断策略。
     *   stage (ChatLifecycleStage)：生命周期阶段。
     * 返回：
     *   AdaptivePolicy：应用偏置后的策略。
     */
    private applyLifecycleBias(basePolicy: AdaptivePolicy, stage: ChatLifecycleStage): AdaptivePolicy {
        if (stage === 'new') {
            return {
                ...basePolicy,
                extractInterval: Math.max(basePolicy.extractInterval, 18),
                extractWindowSize: Math.max(16, Math.min(basePolicy.extractWindowSize, 24)),
                vectorEnabled: false,
                vectorMode: 'off',
                contextMaxTokensShare: Math.min(basePolicy.contextMaxTokensShare, 0.45),
            };
        }
        if (stage === 'stable') {
            return {
                ...basePolicy,
                summaryEnabled: true,
                vectorEnabled: basePolicy.vectorEnabled || basePolicy.vectorMode !== 'off',
                qualityRefreshInterval: Math.min(basePolicy.qualityRefreshInterval, 10),
            };
        }
        if (stage === 'long_running') {
            return {
                ...basePolicy,
                extractInterval: Math.min(basePolicy.extractInterval, 8),
                extractWindowSize: Math.max(basePolicy.extractWindowSize, 48),
                summaryMode: basePolicy.summaryMode === 'short' ? 'timeline' : basePolicy.summaryMode,
                qualityRefreshInterval: Math.min(basePolicy.qualityRefreshInterval, 8),
            };
        }
        if (stage === 'archived') {
            return {
                ...basePolicy,
                summaryEnabled: false,
                vectorEnabled: false,
                vectorMode: 'off',
                contextMaxTokensShare: 0.2,
            };
        }
        return basePolicy;
    }

    /**
     * 功能：检测群聊车道是否存在明显分裂。
     * 参数：
     *   groupMemory (GroupMemoryState | null | undefined)：群聊记忆状态。
     * 返回：
     *   { hasSplit: boolean; reasonCodes: string[]; severity: MaintenanceInsight['severity'] }：分裂检测结果。
     */
    private detectGroupLaneSplit(groupMemory?: GroupMemoryState | null): {
        hasSplit: boolean;
        reasonCodes: string[];
        severity: MaintenanceInsight['severity'];
    } {
        const lanes = Array.isArray(groupMemory?.lanes) ? groupMemory!.lanes : [];
        if (lanes.length <= 1) {
            return { hasSplit: false, reasonCodes: [], severity: 'info' };
        }
        const displayNameMap = new Map<string, Set<string>>();
        const actorProfileMap = new Map<string, Set<string>>();
        for (const lane of lanes) {
            const displayName = normalizeSeedText(lane.displayName).toLowerCase();
            const actorKey = normalizeSeedText(lane.actorKey);
            if (displayName) {
                const keySet = displayNameMap.get(displayName) ?? new Set<string>();
                keySet.add(actorKey);
                displayNameMap.set(displayName, keySet);
            }
            const profileSet = actorProfileMap.get(actorKey) ?? new Set<string>();
            profileSet.add(`${normalizeSeedText(lane.lastStyle)}|${normalizeSeedText(lane.lastEmotion)}`);
            actorProfileMap.set(actorKey, profileSet);
        }
        const sameNameMultiActor = Array.from(displayNameMap.values()).some((keys: Set<string>): boolean => keys.size >= 2);
        const sameActorMultiProfile = Array.from(actorProfileMap.values()).some((profiles: Set<string>): boolean => profiles.size >= 2);
        if (!sameNameMultiActor && !sameActorMultiProfile) {
            return { hasSplit: false, reasonCodes: [], severity: 'info' };
        }
        const reasonCodes: string[] = [];
        if (sameNameMultiActor) {
            reasonCodes.push('group_lane_same_name_multi_actor');
        }
        if (sameActorMultiProfile) {
            reasonCodes.push('group_lane_profile_split');
        }
        return {
            hasSplit: true,
            reasonCodes,
            severity: sameActorMultiProfile ? 'critical' : 'warning',
        };
    }

    /**
     * 功能：将底层维护建议转换为用户可读的维护感知。
     * 参数：
     *   advice (MaintenanceAdvice[])：底层维护建议。
     *   state (MemoryOSChatState)：当前聊天状态。
     * 返回：
     *   MaintenanceInsight[]：面向用户的维护感知列表。
     */
    private buildMaintenanceInsightsFromAdvice(advice: MaintenanceAdvice[], state: MemoryOSChatState): MaintenanceInsight[] {
        const now = Date.now();
        const priorityMap: Record<MaintenanceAdvice['priority'], MaintenanceInsight['severity']> = {
            low: 'info',
            medium: 'warning',
            high: 'critical',
        };
        const actionLabelMap: Record<MaintenanceActionType, string> = {
            compress: '执行压缩',
            rebuild_summary: '重建摘要',
            revectorize: '严格重建索引',
            schema_cleanup: '整理设定',
            group_maintenance: '群聊维护',
        };
        const shortLabelMap: Record<MaintenanceActionType, string> = {
            compress: '记忆过载',
            rebuild_summary: '摘要老化',
            revectorize: '严格向量链',
            schema_cleanup: '失效设定偏多',
            group_maintenance: '群聊状态分裂',
        };
        const mapped = advice.map((item: MaintenanceAdvice): MaintenanceInsight => {
            const severity = priorityMap[item.priority] ?? 'info';
            const surfaces: MaintenanceInsight['surfaces'] = severity === 'info' ? ['panel'] : ['panel', 'compact'];
            return {
                id: `${item.action}:${(item.reasonCodes ?? []).join('|')}` || `${item.action}:${now}`,
                action: item.action,
                severity,
                title: item.title,
                detail: this.formatMaintenanceInsightDetail(item, state),
                shortLabel: this.formatMaintenanceInsightShortLabel(item, state, shortLabelMap[item.action] ?? item.title),
                reasonCodes: Array.isArray(item.reasonCodes) ? item.reasonCodes : [],
                surfaces,
                actionLabel: actionLabelMap[item.action] ?? '立即维护',
                generatedAt: now,
            };
        });
        const groupSplit = this.detectGroupLaneSplit(state.groupMemory);
        if (groupSplit.hasSplit) {
            mapped.push({
                id: `group_maintenance:${groupSplit.reasonCodes.join('|') || now}`,
                action: 'group_maintenance',
                severity: groupSplit.severity,
                title: '群聊角色状态可能已分裂',
                detail: '检测到群聊角色车道存在拆分迹象，建议执行群聊维护以重建 lanes、显著度和共享场景。',
                shortLabel: '群聊状态分裂',
                reasonCodes: groupSplit.reasonCodes,
                surfaces: ['panel', 'compact'],
                actionLabel: '执行群聊维护',
                generatedAt: now,
            });
        }
        const dedup = new Map<string, MaintenanceInsight>();
        mapped.forEach((item: MaintenanceInsight): void => {
            const key = `${item.action}:${item.reasonCodes.join('|')}`;
            if (!dedup.has(key)) {
                dedup.set(key, item);
            }
        });
        return Array.from(dedup.values());
    }

    /**
     * 功能：格式化维护感知的详情文案，让 schema 整理提示更直观。
     * 参数：
     *   item：维护建议原始项。
     *   state：当前聊天状态。
     * 返回：
     *   string：面向用户的详情文案。
     */
    private formatMaintenanceInsightDetail(item: MaintenanceAdvice, state: MemoryOSChatState): string {
        if (item.action !== 'schema_cleanup') {
            return item.detail;
        }
        const detailParts: string[] = [];
        const orphanFactsRatio = Number(state.adaptiveMetrics?.orphanFactsRatio ?? 0);
        if (orphanFactsRatio >= 0.22) {
            detailParts.push('当前孤儿事实偏多，说明有些记忆已经脱离现有设定结构。');
        }
        if (state.schemaDraftSession?.draftRevisionId) {
            detailParts.push('当前还有未合并的 schema 草稿，这也会持续拉低设定卫生度。');
        }
        if (detailParts.length === 0) {
            detailParts.push('检测到设定结构卫生度偏低，通常意味着存在失效映射、墓碑记录或未完成的结构变更。');
        }
        detailParts.push('整理设定会清理无效映射和孤儿事实，但不会自动替你合并草稿。');
        return detailParts.join('');
    }

    /**
     * 功能：格式化维护感知的短标签，让顶部提示更容易理解。
     * 参数：
     *   item：维护建议原始项。
     *   state：当前聊天状态。
     *   fallbackLabel：默认短标签。
     * 返回：
     *   string：短标签文案。
     */
    private formatMaintenanceInsightShortLabel(item: MaintenanceAdvice, state: MemoryOSChatState, fallbackLabel: string): string {
        if (item.action !== 'schema_cleanup') {
            return fallbackLabel;
        }
        if (state.schemaDraftSession?.draftRevisionId) {
            return '设定草稿待处理';
        }
        if (Number(state.adaptiveMetrics?.orphanFactsRatio ?? 0) >= 0.22) {
            return '孤儿事实偏多';
        }
        return fallbackLabel;
    }

    /**
     * 功能：加载聊天状态并补齐默认结构。
     * @returns 完整的聊天状态。
     */
    async load(): Promise<MemoryOSChatState> {
        if (this.cache) {
            return this.cache;
        }
        try {
            const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, this.chatKey);
            const raw = (row?.state ?? {}) as MemoryOSChatState;
            this.cache = migratePersonaState(this.normalizeState(raw));
            await this.refreshLifecycleState(this.cache, 'load');
            if (!Array.isArray(this.cache.maintenanceInsights) || this.cache.maintenanceInsights.length === 0) {
                this.cache.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(this.cache.maintenanceAdvice ?? [], this.cache);
            }
            return this.cache;
        } catch (error) {
            logger.warn('加载聊天状态失败，已回退默认值', error);
            this.cache = migratePersonaState(this.normalizeState({}));
            await this.refreshLifecycleState(this.cache, 'load_fallback');
            this.cache.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(this.cache.maintenanceAdvice ?? [], this.cache);
            return this.cache;
        }
    }

    /**
     * 功能：对状态做默认值归一化。
     * @param state 原始状态。
     * @returns 归一化后的状态。
     */
    private normalizeState(state: MemoryOSChatState): MemoryOSChatState {
        const manualOverrides: ManualOverrides = {
            ...(state.manualOverrides ?? {}),
            chatProfile: state.manualOverrides?.chatProfile ? {
                ...state.manualOverrides.chatProfile,
                vectorStrategy: {
                    ...state.manualOverrides.chatProfile.vectorStrategy,
                },
            } : undefined,
            summaryPolicy: state.manualOverrides?.summaryPolicy ? {
                ...state.manualOverrides.summaryPolicy,
            } : undefined,
        };
        const inferredProfile = inferChatProfile({
            profile: {
                ...DEFAULT_CHAT_PROFILE,
                ...(state.chatProfile ?? {}),
                vectorStrategy: {
                    ...DEFAULT_CHAT_PROFILE.vectorStrategy,
                    ...(state.chatProfile?.vectorStrategy ?? {}),
                },
            },
            metrics: {
                ...DEFAULT_ADAPTIVE_METRICS,
                ...(state.adaptiveMetrics ?? {}),
            },
            logicalView: state.logicalChatView ?? null,
        });
        const vectorLifecycle: VectorLifecycleState = {
            ...DEFAULT_VECTOR_LIFECYCLE,
            ...(state.vectorLifecycle ?? {}),
        };
        const memoryQuality: MemoryQualityScorecard = {
            ...DEFAULT_MEMORY_QUALITY,
            ...(state.memoryQuality ?? {}),
            dimensions: {
                ...DEFAULT_MEMORY_QUALITY.dimensions,
                ...(state.memoryQuality?.dimensions ?? {}),
            },
        };
        const adaptivePolicy = {
            ...buildAdaptivePolicy(
                inferredProfile,
                {
                    ...DEFAULT_ADAPTIVE_METRICS,
                    ...(state.adaptiveMetrics ?? {}),
                },
                vectorLifecycle,
                memoryQuality,
            ),
            ...(state.adaptivePolicy ?? {}),
        };
        const inferredVector = inferVectorMode(
            inferredProfile,
            {
                ...DEFAULT_ADAPTIVE_METRICS,
                ...(state.adaptiveMetrics ?? {}),
            },
            vectorLifecycle,
        );
        const retentionPolicy = {
            ...buildRetentionPolicy(inferredProfile),
            ...(state.retentionPolicy ?? {}),
        };
        return {
            ...state,
            autoSchemaPolicy: {
                ...state.autoSchemaPolicy,
            },
            schemaDraftSession: {
                ...DEFAULT_SCHEMA_DRAFT_SESSION,
                ...(state.schemaDraftSession ?? {}),
            },
            assistantTurnTracker: {
                ...DEFAULT_ASSISTANT_TURN_TRACKER,
                ...(state.assistantTurnTracker ?? {}),
            },
            turnLedger: Array.isArray(state.turnLedger) ? state.turnLedger : [],
            logicalChatView: state.logicalChatView
                ? {
                    ...state.logicalChatView,
                    mutationKinds: Array.isArray(state.logicalChatView.mutationKinds)
                        ? state.logicalChatView.mutationKinds
                        : [],
                    activeMessageIds: Array.isArray(state.logicalChatView.activeMessageIds)
                        ? state.logicalChatView.activeMessageIds
                        : Array.isArray(state.logicalChatView.visibleMessages)
                            ? state.logicalChatView.visibleMessages.map((item): string => normalizeSeedText(item.messageId)).filter(Boolean)
                            : [],
                    invalidatedMessageIds: Array.isArray(state.logicalChatView.invalidatedMessageIds)
                        ? state.logicalChatView.invalidatedMessageIds
                        : [],
                    repairAnchorMessageId: normalizeSeedText(state.logicalChatView.repairAnchorMessageId) || undefined,
                }
                : undefined,
            chatLifecycle: {
                ...DEFAULT_CHAT_LIFECYCLE_STATE,
                ...(state.chatLifecycle ?? {}),
                stage: (state.chatLifecycle?.stage ?? DEFAULT_CHAT_LIFECYCLE_STATE.stage) as ChatLifecycleStage,
                stageReasonCodes: Array.isArray(state.chatLifecycle?.stageReasonCodes)
                    ? state.chatLifecycle.stageReasonCodes
                    : [...DEFAULT_CHAT_LIFECYCLE_STATE.stageReasonCodes],
                firstSeenAt: Number(state.chatLifecycle?.firstSeenAt ?? 0),
                stageEnteredAt: Number(state.chatLifecycle?.stageEnteredAt ?? 0),
                lastMaintenanceAt: Number(state.chatLifecycle?.lastMaintenanceAt ?? 0),
                lastMaintenanceAction: (state.chatLifecycle?.lastMaintenanceAction ?? undefined) as MaintenanceActionType | undefined,
                lastMutationAt: Number(state.chatLifecycle?.lastMutationAt ?? 0),
                lastMutationSource: String(state.chatLifecycle?.lastMutationSource ?? ''),
                mutationKinds: Array.isArray(state.chatLifecycle?.mutationKinds)
                    ? state.chatLifecycle.mutationKinds
                    : [],
            },
            archived: state.archived === true,
            archivedAt: Number(state.archivedAt ?? 0) || undefined,
            archiveReason: typeof state.archiveReason === 'string' ? state.archiveReason : undefined,
            characterBindingFingerprint: typeof state.characterBindingFingerprint === 'string'
                ? state.characterBindingFingerprint
                : undefined,
            semanticSeed: state.semanticSeed ?? undefined,
            personaMemoryProfile: state.personaMemoryProfile
                ? {
                    ...DEFAULT_PERSONA_MEMORY_PROFILE,
                    ...(state.personaMemoryProfile ?? {}),
                    derivedFrom: Array.isArray(state.personaMemoryProfile?.derivedFrom)
                        ? state.personaMemoryProfile.derivedFrom
                        : [],
                }
                : undefined,
            simpleMemoryPersona: state.simpleMemoryPersona
                ? {
                    ...DEFAULT_SIMPLE_MEMORY_PERSONA,
                    ...(state.simpleMemoryPersona ?? {}),
                }
                : undefined,
            coldStartFingerprint: typeof state.coldStartFingerprint === 'string'
                ? state.coldStartFingerprint
                : undefined,
            coldStartStage: ((): ColdStartStage | undefined => {
                if (!state.semanticSeed && !state.coldStartFingerprint) {
                    return undefined;
                }
                const stage = normalizeSeedText(state.coldStartStage);
                if (stage === 'prompt_primed' || stage === 'extract_primed') {
                    return stage;
                }
                return 'seeded';
            })(),
            coldStartPrimedAt: Number(state.coldStartPrimedAt ?? 0) || undefined,
            lastLorebookDecision: state.lastLorebookDecision ?? undefined,
            promptInjectionProfile: {
                ...DEFAULT_PROMPT_INJECTION_PROFILE,
                ...(state.promptInjectionProfile ?? {}),
            },
            lastPreGenerationDecision: state.lastPreGenerationDecision ?? null,
            lastPostGenerationDecision: state.lastPostGenerationDecision ?? null,
            userFacingPreset: state.userFacingPreset
                ? {
                    ...DEFAULT_USER_FACING_CHAT_PRESET,
                    ...state.userFacingPreset,
                    chatProfile: {
                        ...(state.userFacingPreset.chatProfile ?? {}),
                        vectorStrategy: {
                            ...(state.userFacingPreset.chatProfile?.vectorStrategy ?? {}),
                        },
                    },
                    adaptivePolicy: {
                        ...(state.userFacingPreset.adaptivePolicy ?? {}),
                    },
                    retentionPolicy: {
                        ...(state.userFacingPreset.retentionPolicy ?? {}),
                    },
                    promptInjection: {
                        ...(state.userFacingPreset.promptInjection ?? {}),
                    },
                }
                : null,
            groupMemory: {
                ...DEFAULT_GROUP_MEMORY,
                ...(state.groupMemory ?? {}),
                lanes: Array.isArray(state.groupMemory?.lanes) ? state.groupMemory!.lanes : [],
                actorSalience: Array.isArray(state.groupMemory?.actorSalience) ? state.groupMemory!.actorSalience : [],
                sharedScene: {
                    ...DEFAULT_GROUP_MEMORY.sharedScene,
                    ...(state.groupMemory?.sharedScene ?? {}),
                },
                bindingSnapshot: {
                    ...DEFAULT_GROUP_MEMORY.bindingSnapshot,
                    ...(state.groupMemory?.bindingSnapshot ?? {}),
                    characterIds: Array.isArray(state.groupMemory?.bindingSnapshot?.characterIds)
                        ? state.groupMemory!.bindingSnapshot.characterIds
                        : [],
                    memberNames: Array.isArray(state.groupMemory?.bindingSnapshot?.memberNames)
                        ? state.groupMemory!.bindingSnapshot.memberNames
                        : [],
                },
            },
            memoryLifecycleIndex: Object.entries(state.memoryLifecycleIndex ?? {}).reduce<Record<string, MemoryLifecycleState>>(
                (result: Record<string, MemoryLifecycleState>, [recordKey, lifecycle]: [string, MemoryLifecycleState]): Record<string, MemoryLifecycleState> => {
                    const normalizedKey = normalizeMemoryText(recordKey);
                    if (!normalizedKey) {
                        return result;
                    }
                    result[normalizedKey] = {
                        ...lifecycle,
                        recordKey: normalizedKey,
                        ownerActorKey: lifecycle?.ownerActorKey == null ? null : normalizeMemoryText(String(lifecycle.ownerActorKey)),
                        memoryType: (lifecycle?.memoryType ?? 'other') as MemoryLifecycleState['memoryType'],
                        memorySubtype: (lifecycle?.memorySubtype ?? 'other') as MemoryLifecycleState['memorySubtype'],
                        sourceScope: (lifecycle?.sourceScope ?? 'system') as MemoryLifecycleState['sourceScope'],
                        importance: clamp01(Number(lifecycle?.importance ?? lifecycle?.salience ?? 0)),
                        forgetProbability: clamp01(Number(lifecycle?.forgetProbability ?? 0)),
                        forgotten: lifecycle?.forgotten === true,
                        forgottenAt: Math.max(0, Number(lifecycle?.forgottenAt ?? 0) || 0) || undefined,
                        forgottenReasonCodes: Array.isArray(lifecycle?.forgottenReasonCodes)
                            ? lifecycle.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        lastForgetRollAt: Math.max(0, Number(lifecycle?.lastForgetRollAt ?? 0) || 0),
                        reinforcedByEventIds: Array.isArray(lifecycle?.reinforcedByEventIds)
                            ? lifecycle.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        invalidatedByEventIds: Array.isArray(lifecycle?.invalidatedByEventIds)
                            ? lifecycle.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        emotionTag: normalizeMemoryText(lifecycle?.emotionTag),
                        relationScope: normalizeMemoryText(lifecycle?.relationScope),
                        stage: (lifecycle?.stage ?? 'clear') as MemoryLifecycleState['stage'],
                        recordKind: (lifecycle?.recordKind ?? 'fact') as MemoryLifecycleState['recordKind'],
                        strength: clamp01(Number(lifecycle?.strength ?? 0)),
                        salience: clamp01(Number(lifecycle?.salience ?? 0)),
                        rehearsalCount: Math.max(0, Number(lifecycle?.rehearsalCount ?? 0) || 0),
                        lastRecalledAt: Math.max(0, Number(lifecycle?.lastRecalledAt ?? 0) || 0),
                        distortionRisk: clamp01(Number(lifecycle?.distortionRisk ?? 0)),
                        perActorMetrics: normalizeMemoryActorRetentionMap(lifecycle?.perActorMetrics),
                        updatedAt: Math.max(0, Number(lifecycle?.updatedAt ?? 0) || 0),
                    };
                    return result;
                },
                {},
            ),
            ownedMemoryIndex: Object.entries(state.ownedMemoryIndex ?? {}).reduce<Record<string, OwnedMemoryState>>(
                (result: Record<string, OwnedMemoryState>, [recordKey, owned]: [string, OwnedMemoryState]): Record<string, OwnedMemoryState> => {
                    const normalizedKey = normalizeMemoryText(recordKey);
                    if (!normalizedKey) {
                        return result;
                    }
                    result[normalizedKey] = {
                        ...owned,
                        recordKey: normalizedKey,
                        ownerActorKey: owned?.ownerActorKey == null ? null : normalizeMemoryText(String(owned.ownerActorKey)),
                        recordKind: (owned?.recordKind ?? 'fact') as OwnedMemoryState['recordKind'],
                        memoryType: (owned?.memoryType ?? 'other') as OwnedMemoryState['memoryType'],
                        memorySubtype: (owned?.memorySubtype ?? 'other') as OwnedMemoryState['memorySubtype'],
                        sourceScope: (owned?.sourceScope ?? 'system') as OwnedMemoryState['sourceScope'],
                        importance: clamp01(Number(owned?.importance ?? 0)),
                        forgetProbability: clamp01(Number(owned?.forgetProbability ?? 0)),
                        forgotten: owned?.forgotten === true,
                        forgottenAt: Math.max(0, Number(owned?.forgottenAt ?? 0) || 0) || undefined,
                        forgottenReasonCodes: Array.isArray(owned?.forgottenReasonCodes)
                            ? owned.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        lastForgetRollAt: Math.max(0, Number(owned?.lastForgetRollAt ?? 0) || 0) || undefined,
                        reinforcedByEventIds: Array.isArray(owned?.reinforcedByEventIds)
                            ? owned.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        invalidatedByEventIds: Array.isArray(owned?.invalidatedByEventIds)
                            ? owned.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                            : [],
                        roleBasedRetentionOverrides: normalizeMemoryActorRetentionMap(owned?.roleBasedRetentionOverrides),
                        updatedAt: Math.max(0, Number(owned?.updatedAt ?? 0) || 0),
                    };
                    return result;
                },
                {},
            ),
            latestRecallExplanation: normalizeLatestRecallExplanation(state.latestRecallExplanation ?? null),
            memoryTuningProfile: normalizeMemoryTuningProfile(state.memoryTuningProfile ?? null),
            summaryFixQueue: Array.isArray(state.summaryFixQueue) ? state.summaryFixQueue : [],
            mutationRepairQueue: Array.isArray(state.mutationRepairQueue)
                ? state.mutationRepairQueue
                    .map((task): MutationRepairTask => ({
                        taskId: normalizeSeedText(task.taskId) || crypto.randomUUID(),
                        viewHash: normalizeSeedText(task.viewHash),
                        snapshotHash: normalizeSeedText(task.snapshotHash),
                        mutationKinds: Array.isArray(task.mutationKinds) ? task.mutationKinds : [],
                        invalidatedMessageIds: Array.isArray(task.invalidatedMessageIds) ? task.invalidatedMessageIds.map((item) => normalizeSeedText(item)).filter(Boolean) : [],
                        activeMessageIds: Array.isArray(task.activeMessageIds) ? task.activeMessageIds.map((item) => normalizeSeedText(item)).filter(Boolean) : [],
                        repairAnchorMessageId: normalizeSeedText(task.repairAnchorMessageId) || undefined,
                        repairGeneration: Math.max(0, Number(task.repairGeneration ?? 0) || 0),
                        enqueuedAt: Number(task.enqueuedAt ?? Date.now()) || Date.now(),
                        attempts: Math.max(0, Number(task.attempts ?? 0) || 0),
                        status: task.status === 'failed' ? 'failed' : task.status === 'running' ? 'running' : 'pending',
                        lastError: normalizeSeedText(task.lastError) || undefined,
                    }))
                    .slice(-16)
                : [],
            lastMutationRepairViewHash: normalizeSeedText(state.lastMutationRepairViewHash) || undefined,
            lastMutationRepairAt: Number(state.lastMutationRepairAt ?? 0) || undefined,
            mutationRepairGeneration: Math.max(0, Number(state.mutationRepairGeneration ?? 0) || 0),
            rowAliasIndex: state.rowAliasIndex ?? {},
            rowRedirects: state.rowRedirects ?? {},
            rowTombstones: state.rowTombstones ?? {},
            adaptiveMetrics: {
                ...DEFAULT_ADAPTIVE_METRICS,
                ...(state.adaptiveMetrics ?? {}),
            },
            chatProfile: inferredProfile,
            adaptivePolicy,
            vectorLifecycle: {
                ...vectorLifecycle,
                vectorMode: inferredVector.vectorMode,
                lowPrecisionSearchStride: inferredVector.vectorSearchStride,
                reasonCodes: inferredVector.reasonCodes,
            },
            memoryQuality,
            maintenanceAdvice: Array.isArray(state.maintenanceAdvice) ? state.maintenanceAdvice : [],
            maintenanceInsights: Array.isArray(state.maintenanceInsights) ? state.maintenanceInsights : [],
            lastMaintenanceExecution: state.lastMaintenanceExecution
                ? {
                    ...state.lastMaintenanceExecution,
                    reasonCodes: Array.isArray(state.lastMaintenanceExecution.reasonCodes)
                        ? state.lastMaintenanceExecution.reasonCodes
                        : [],
                    touchedCounts: {
                        summariesCreated: Number(state.lastMaintenanceExecution.touchedCounts?.summariesCreated ?? 0),
                        eventsArchived: Number(state.lastMaintenanceExecution.touchedCounts?.eventsArchived ?? 0),
                        vectorChunksRebuilt: Number(state.lastMaintenanceExecution.touchedCounts?.vectorChunksRebuilt ?? 0),
                        cleanedFacts: Number(state.lastMaintenanceExecution.touchedCounts?.cleanedFacts ?? 0),
                        cleanedStates: Number(state.lastMaintenanceExecution.touchedCounts?.cleanedStates ?? 0),
                        lanesRebuilt: Number(state.lastMaintenanceExecution.touchedCounts?.lanesRebuilt ?? 0),
                        salienceUpdated: Number(state.lastMaintenanceExecution.touchedCounts?.salienceUpdated ?? 0),
                    },
                }
                : undefined,
            ingestHealth: {
                ...DEFAULT_INGEST_HEALTH,
                ...(state.ingestHealth ?? {}),
            },
            retrievalHealth: {
                ...DEFAULT_RETRIEVAL_HEALTH,
                ...(state.retrievalHealth ?? {}),
                recentPrecisionWindow: Array.isArray(state.retrievalHealth?.recentPrecisionWindow) ? state.retrievalHealth.recentPrecisionWindow : [],
            },
            extractHealth: {
                ...DEFAULT_EXTRACT_HEALTH,
                ...(state.extractHealth ?? {}),
                recentTasks: Array.isArray(state.extractHealth?.recentTasks) ? state.extractHealth.recentTasks : [],
            },
            retentionPolicy,
            retentionArchives: {
                ...DEFAULT_RETENTION_ARCHIVES,
                ...(state.retentionArchives ?? {}),
                archivedFactKeys: Array.isArray(state.retentionArchives?.archivedFactKeys) ? state.retentionArchives.archivedFactKeys : [],
                archivedSummaryIds: Array.isArray(state.retentionArchives?.archivedSummaryIds) ? state.retentionArchives.archivedSummaryIds : [],
                archivedStatePaths: Array.isArray(state.retentionArchives?.archivedStatePaths) ? state.retentionArchives.archivedStatePaths : [],
                archivedVectorChunkIds: Array.isArray(state.retentionArchives?.archivedVectorChunkIds) ? state.retentionArchives.archivedVectorChunkIds : [],
            },
            lastMutationPlan: normalizeMutationPlanSnapshot(state.lastMutationPlan ?? null),
            manualOverrides,
            lastStrategyDecision: state.lastStrategyDecision ?? null,
        };
    }

    /**
     * 功能：根据当前指标重算自动聊天画像。
     * @param state 当前聊天状态。
     * @returns 自动画像。
     */
    private inferAutoChatProfileFromState(state: MemoryOSChatState): ChatProfile {
        return inferChatProfile({
            profile: {
                ...DEFAULT_CHAT_PROFILE,
                ...(state.chatProfile ?? {}),
                vectorStrategy: {
                    ...DEFAULT_CHAT_PROFILE.vectorStrategy,
                    ...(state.chatProfile?.vectorStrategy ?? {}),
                },
            },
            metrics: {
                ...DEFAULT_ADAPTIVE_METRICS,
                ...(state.adaptiveMetrics ?? {}),
            },
            logicalView: state.logicalChatView ?? null,
        });
    }

    /**
     * 功能：标记状态已变更并安排节流写回。
     * @returns 无返回值。
     */
    private markDirty(): void {
        this.dirty = true;
        if (this.flushTimer) {
            return;
        }
        this.flushTimer = setTimeout((): void => {
            this.flushTimer = null;
            void this.flush();
        }, this.flushIntervalMs);
    }

    /**
     * 功能：写回当前缓存到聊天级状态存储。
     * @returns 无返回值。
     */
    async flush(): Promise<void> {
        if (!this.dirty || !this.cache) {
            return;
        }
        try {
            await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, this.chatKey, this.cache as Record<string, unknown>);
            this.dirty = false;
        } catch (error) {
            logger.warn('聊天状态写回失败', error);
        }
    }

    /**
     * 功能：销毁前强制写回状态。
     * @returns 无返回值。
     */
    async destroy(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
        this.cache = null;
    }

    /**
     * 功能：刷新并返回当前聊天画像。
     * @returns 聊天画像。
     */
    async getChatProfile(): Promise<ChatProfile> {
        const state = await this.load();
        if (!state.chatProfile) {
            state.chatProfile = this.inferAutoChatProfileFromState(state);
        }
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        const presetAware = applyChatProfileOverrides(state.chatProfile, {
            chatProfile: presetBundle.effectiveChatProfile,
        });
        return applyChatProfileOverrides(presetAware, state.manualOverrides);
    }

    /**
     * 功能：按当前动态指标重算并持久化自动聊天画像。
     * @param options 重算选项。
     * @returns 重算后的聊天画像。
     */
    async recomputeChatProfile(options?: { markDirty?: boolean }): Promise<ChatProfile> {
        const state = await this.load();
        state.chatProfile = this.inferAutoChatProfileFromState(state);
        if (options?.markDirty !== false) {
            this.markDirty();
        }
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        const presetAware = applyChatProfileOverrides(state.chatProfile, {
            chatProfile: presetBundle.effectiveChatProfile,
        });
        return applyChatProfileOverrides(presetAware, state.manualOverrides);
    }

    /**
     * 功能：设置聊天画像的手动覆盖。
     * @param override 聊天画像覆盖项。
     * @returns 无返回值。
     */
    async setChatProfileOverride(override: Partial<ChatProfile>): Promise<void> {
        const state = await this.load();
        state.manualOverrides = {
            ...(state.manualOverrides ?? {}),
            chatProfile: {
                ...(state.manualOverrides?.chatProfile ?? {}),
                ...(override ?? {}),
                vectorStrategy: {
                    ...(state.manualOverrides?.chatProfile?.vectorStrategy ?? {}),
                    ...(override.vectorStrategy ?? {}),
                },
            },
        };
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        state.retentionPolicy = await this.getRetentionPolicy();
        this.markDirty();
    }

    /**
     * 功能：读取动态指标。
     * @returns 动态指标。
     */
    async getAdaptiveMetrics(): Promise<AdaptiveMetrics> {
        const state = await this.load();
        state.adaptiveMetrics = {
            ...DEFAULT_ADAPTIVE_METRICS,
            ...(state.adaptiveMetrics ?? {}),
        };
        return state.adaptiveMetrics;
    }

    /**
     * 功能：更新动态指标。
     * @param patch 指标补丁。
     * @returns 更新后的动态指标。
     */
    async updateAdaptiveMetrics(
        patch: Partial<AdaptiveMetrics>,
        options?: { refreshDerivedState?: boolean },
    ): Promise<AdaptiveMetrics> {
        const state = await this.load();
        state.adaptiveMetrics = {
            ...DEFAULT_ADAPTIVE_METRICS,
            ...(state.adaptiveMetrics ?? {}),
            ...(patch ?? {}),
            lastUpdatedAt: Date.now(),
        };
        if (options?.refreshDerivedState !== false) {
            await this.recomputeChatProfile({ markDirty: false });
            state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        }
        this.markDirty();
        return state.adaptiveMetrics;
    }

    /**
     * 功能：读取自适应策略。
     * @returns 自适应策略。
     */
    async getAdaptivePolicy(): Promise<AdaptivePolicy> {
        const state = await this.load();
        if (!state.adaptivePolicy) {
            await this.recomputeAdaptivePolicy();
        }
        const lifecycle = await this.refreshLifecycleState(state, 'get_policy');
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        return applyAdaptivePolicyOverrides(
            {
                ...(state.adaptivePolicy ?? this.applyLifecycleBias(
                    buildAdaptivePolicy(
                        await this.getChatProfile(),
                        await this.getAdaptiveMetrics(),
                        await this.getVectorLifecycle(),
                        await this.getMemoryQuality(),
                    ),
                    lifecycle.stage,
                )),
                ...(presetBundle.effectiveAdaptivePolicy ?? {}),
            },
            state.manualOverrides,
        );
    }

    /**
     * 功能：根据当前画像与指标重算自适应策略。
     * @returns 重算后的策略。
     */
    async recomputeAdaptivePolicy(): Promise<AdaptivePolicy> {
        const state = await this.load();
        const lifecycle = await this.refreshLifecycleState(state, 'recompute_policy');
        const profile = await this.recomputeChatProfile({ markDirty: false });
        const metrics = await this.getAdaptiveMetrics();
        const vectorLifecycle = await this.getVectorLifecycle();
        const memoryQuality = await this.getMemoryQuality();
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        state.adaptivePolicy = {
            ...this.applyLifecycleBias(
                buildAdaptivePolicy(profile, metrics, vectorLifecycle, memoryQuality),
                lifecycle.stage,
            ),
            ...(presetBundle.effectiveAdaptivePolicy ?? {}),
        };
        state.vectorLifecycle = {
            ...vectorLifecycle,
            vectorMode: state.adaptivePolicy.vectorMode,
            lowPrecisionSearchStride: state.adaptivePolicy.vectorSearchStride,
        };
        return applyAdaptivePolicyOverrides(state.adaptivePolicy, state.manualOverrides);
    }

    /**
     * 功能：读取保留策略。
     * @returns 保留策略。
     */
    async getRetentionPolicy(): Promise<RetentionPolicy> {
        const state = await this.load();
        const profile = await this.getChatProfile();
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        const base = buildRetentionPolicy(profile);
        state.retentionPolicy = applyRetentionPolicyOverrides(
            {
                ...base,
                ...(presetBundle.effectiveRetentionPolicy ?? {}),
                ...(state.retentionPolicy ?? {}),
            },
            { retentionPolicy: {} },
        );
        return applyRetentionPolicyOverrides(state.retentionPolicy, state.manualOverrides);
    }

    /**
     * 功能：读取当前聊天生效的 Prompt 注入画像。
     * 参数：无。
     * 返回：
     *   Promise<PromptInjectionProfile>：最终生效的注入画像。
     */
    async getPromptInjectionProfile(): Promise<PromptInjectionProfile> {
        const state = await this.load();
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        const manualProfile = state.manualOverrides?.promptInjectionProfile ?? {};
        return {
            ...DEFAULT_PROMPT_INJECTION_PROFILE,
            ...(presetBundle.effectivePromptInjection ?? DEFAULT_PROMPT_INJECTION_PROFILE),
            ...(state.promptInjectionProfile ?? {}),
            ...(manualProfile ?? {}),
        };
    }

    /**
     * 功能：写入聊天级 Prompt 注入画像。
     * 参数：
     *   profile (Partial<PromptInjectionProfile>)：注入画像补丁。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setPromptInjectionProfile(profile: Partial<PromptInjectionProfile>): Promise<void> {
        const state = await this.load();
        state.promptInjectionProfile = {
            ...DEFAULT_PROMPT_INJECTION_PROFILE,
            ...(state.promptInjectionProfile ?? {}),
            ...(profile ?? {}),
        };
        this.markDirty();
    }

    /**
     * 功能：读取当前聊天的三层 preset 合并结果。
     * 参数：无。
     * 返回：
     *   Promise<EffectivePresetBundle>：三层 preset 生效结果。
     */
    async getEffectivePresetBundle(): Promise<EffectivePresetBundle> {
        const state = await this.load();
        return this.getEffectivePresetBundleFromState(state);
    }

    /**
     * 功能：保存全局预设。
     * 参数：
     *   preset (UserFacingChatPreset)：要保存的预设。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async saveGlobalPreset(preset: UserFacingChatPreset): Promise<void> {
        saveGlobalPreset(preset);
    }

    /**
     * 功能：保存角色级或群聊级预设。
     * 参数：
     *   preset (UserFacingChatPreset)：要保存的预设。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async saveRolePreset(preset: UserFacingChatPreset): Promise<void> {
        const state = await this.load();
        saveRolePreset(state, preset);
    }

    /**
     * 功能：清除当前角色或群聊绑定的预设。
     * 参数：无。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async clearRolePreset(): Promise<void> {
        const state = await this.load();
        clearRolePreset(state);
    }

    /**
     * 功能：读取聊天级用户预设。
     * 参数：无。
     * 返回：
     *   Promise<UserFacingChatPreset | null>：聊天级预设。
     */
    async getUserFacingPreset(): Promise<UserFacingChatPreset | null> {
        const state = await this.load();
        return state.userFacingPreset ?? null;
    }

    /**
     * 功能：写入聊天级用户预设。
     * 参数：
     *   preset (UserFacingChatPreset | null)：聊天级预设。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setUserFacingPreset(preset: UserFacingChatPreset | null): Promise<void> {
        const state = await this.load();
        state.userFacingPreset = preset ? {
            ...DEFAULT_USER_FACING_CHAT_PRESET,
            ...preset,
        } : null;
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        state.retentionPolicy = await this.getRetentionPolicy();
        this.markDirty();
    }

    /**
     * 功能：从当前状态构建三层 preset 生效结果。
     * 参数：
     *   state (MemoryOSChatState)：当前聊天状态。
     * 返回：
     *   EffectivePresetBundle：三层 preset 的合并结果。
     */
    private getEffectivePresetBundleFromState(state: MemoryOSChatState): EffectivePresetBundle {
        return buildEffectivePresetBundle(state ?? {}) ?? DEFAULT_EFFECTIVE_PRESET_BUNDLE;
    }

    /**
     * 功能：读取向量生命周期状态。
     * @returns 向量生命周期状态。
     */
    async getVectorLifecycle(): Promise<VectorLifecycleState> {
        const state = await this.load();
        state.vectorLifecycle = {
            ...DEFAULT_VECTOR_LIFECYCLE,
            ...(state.vectorLifecycle ?? {}),
            reasonCodes: Array.isArray(state.vectorLifecycle?.reasonCodes) ? state.vectorLifecycle.reasonCodes : [],
            recentPrecisionWindow: Array.isArray(state.vectorLifecycle?.recentPrecisionWindow) ? state.vectorLifecycle.recentPrecisionWindow : [],
        };
        return state.vectorLifecycle;
    }

    /**
     * 功能：更新向量生命周期状态。
     * @param patch 状态补丁。
     * @returns 更新后的向量生命周期状态。
     */
    async updateVectorLifecycle(patch: Partial<VectorLifecycleState>): Promise<VectorLifecycleState> {
        const state = await this.load();
        const current = await this.getVectorLifecycle();
        state.vectorLifecycle = {
            ...current,
            ...(patch ?? {}),
            reasonCodes: Array.isArray(patch?.reasonCodes) ? patch.reasonCodes : current.reasonCodes,
            recentPrecisionWindow: Array.isArray(patch?.recentPrecisionWindow) ? patch.recentPrecisionWindow : current.recentPrecisionWindow,
        };
        state.adaptiveMetrics = {
            ...DEFAULT_ADAPTIVE_METRICS,
            ...(state.adaptiveMetrics ?? {}),
            lastVectorAccessAt: Number(state.vectorLifecycle.lastAccessAt ?? 0),
            lastVectorHitAt: Number(state.vectorLifecycle.lastHitAt ?? 0),
            lastVectorIndexAt: Number(state.vectorLifecycle.lastIndexAt ?? 0),
            retrievalPrecision: averagePrecisionWindow(state.vectorLifecycle.recentPrecisionWindow),
        };
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        this.markDirty();
        return state.vectorLifecycle;
    }

    /**
     * 功能：读取记忆质量分卡。
     * @returns 记忆质量分卡。
     */
    async getMemoryQuality(): Promise<MemoryQualityScorecard> {
        const state = await this.load();
        state.memoryQuality = {
            ...DEFAULT_MEMORY_QUALITY,
            ...(state.memoryQuality ?? {}),
            dimensions: {
                ...DEFAULT_MEMORY_QUALITY.dimensions,
                ...(state.memoryQuality?.dimensions ?? {}),
            },
        };
        return state.memoryQuality;
    }

    /**
     * 功能：读取维护建议列表。
     * @returns 建议列表。
     */
    async getMaintenanceAdvice(): Promise<MaintenanceAdvice[]> {
        const state = await this.load();
        state.maintenanceAdvice = Array.isArray(state.maintenanceAdvice) ? state.maintenanceAdvice : [];
        return state.maintenanceAdvice;
    }

    /**
     * 功能：读取用户可读的维护感知列表。
     * 参数：
     *   无。
     * 返回：
     *   Promise<MaintenanceInsight[]>：维护感知列表。
     */
    async getMaintenanceInsights(): Promise<MaintenanceInsight[]> {
        const state = await this.load();
        if (!Array.isArray(state.maintenanceInsights) || state.maintenanceInsights.length === 0) {
            state.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(state.maintenanceAdvice ?? [], state);
            this.markDirty();
        }
        return state.maintenanceInsights;
    }

    /**
     * 功能：读取当前聊天的生命周期状态。
     * 参数：
     *   无。
     * 返回：
     *   Promise<ChatLifecycleState>：生命周期状态。
     */
    async getLifecycleState(): Promise<ChatLifecycleState> {
        const state = await this.load();
        return this.refreshLifecycleState(state, 'read_lifecycle');
    }

    /**
     * 功能：执行指定维护动作并返回执行结果。
     * 参数：
     *   action (MaintenanceActionType)：维护动作类型。
     * 返回：
     *   Promise<MaintenanceExecutionResult>：维护执行结果。
     */
    async runMaintenanceAction(action: MaintenanceActionType): Promise<MaintenanceExecutionResult> {
        const state = await this.load();
        if (state.archived === true) {
            return {
                action,
                ok: false,
                message: 'Chat is archived; maintenance actions are disabled.',
                reasonCodes: ['chat_archived'],
                touchedCounts: {
                    summariesCreated: 0,
                    eventsArchived: 0,
                    vectorChunksRebuilt: 0,
                    cleanedFacts: 0,
                    cleanedStates: 0,
                    lanesRebuilt: 0,
                    salienceUpdated: 0,
                },
                executedAt: Date.now(),
                durationMs: 0,
            };
        }
        const startedAt = Date.now();
        const touchedCounts: MaintenanceExecutionResult['touchedCounts'] = {
            summariesCreated: 0,
            eventsArchived: 0,
            vectorChunksRebuilt: 0,
            cleanedFacts: 0,
            cleanedStates: 0,
            lanesRebuilt: 0,
            salienceUpdated: 0,
        };
        try {
            if (action === 'compress') {
                const compactionManager = new CompactionManager(this.chatKey);
                const result = await compactionManager.compactRuleMode({ archiveProcessed: true });
                touchedCounts.summariesCreated = Number(result.summariesCreated ?? 0);
                touchedCounts.eventsArchived = Number(result.eventsArchived ?? 0);
            } else if (action === 'rebuild_summary') {
                const logicalView = state.logicalChatView;
                const lines = Array.isArray(logicalView?.visibleMessages)
                    ? logicalView!.visibleMessages.slice(-16).map((item): string => normalizeSeedText(item.text)).filter(Boolean)
                    : [];
                const fallbackEvents = lines.length === 0
                    ? await db.events
                        .where('[chatKey+ts]')
                        .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                        .reverse()
                        .limit(16)
                        .toArray()
                    : [];
                const fallbackLines = fallbackEvents
                    .map((event): string => normalizeSeedText((event.payload as { text?: string; content?: string })?.text ?? (event.payload as { content?: string })?.content ?? ''))
                    .filter(Boolean);
                const sourceLines = lines.length > 0 ? lines : fallbackLines;
                if (sourceLines.length > 0) {
                    const summaryId = buildManagedSummaryStableId(this.chatKey, 'maintenance_rebuild_scene');
                    await this.deleteManagedMaintenanceSummaries(summaryId);
                    await this.getProposalManager().processWriteRequest({
                        source: {
                            pluginId: MEMORY_OS_PLUGIN_ID,
                            version: '1.0.0',
                        },
                        chatKey: this.chatKey,
                        reason: 'maintenance.rebuild_summary',
                        proposal: {
                            summaries: [{
                                summaryId,
                                targetRecordKey: summaryId,
                                action: 'auto',
                                level: 'scene',
                                title: '维护重建摘要',
                                content: sourceLines.slice(0, 16).join('\n'),
                                keywords: ['maintenance', 'rebuild_summary'],
                                range: {
                                    fromMessageId: Array.isArray(logicalView?.visibleMessages)
                                        ? normalizeSeedText(logicalView!.visibleMessages.slice(-16)[0]?.messageId) || undefined
                                        : undefined,
                                    toMessageId: Array.isArray(logicalView?.visibleMessages)
                                        ? normalizeSeedText(logicalView!.visibleMessages.slice(-1)[0]?.messageId) || undefined
                                        : undefined,
                                },
                                source: {
                                    extractor: 'maintenance',
                                    provider: 'stx_memory_os',
                                    provenance: {
                                        extractor: 'maintenance',
                                        provider: 'stx_memory_os',
                                        source: {
                                            kind: 'maintenance',
                                            reason: 'rebuild_summary',
                                            viewHash: normalizeSeedText(logicalView?.viewHash),
                                            snapshotHash: normalizeSeedText(logicalView?.snapshotHash),
                                            messageIds: Array.isArray(logicalView?.visibleMessages)
                                                ? logicalView!.visibleMessages.slice(-16).map((item): string => normalizeSeedText(item.messageId)).filter(Boolean)
                                                : [],
                                            mutationKinds: Array.isArray(logicalView?.mutationKinds) ? logicalView!.mutationKinds : [],
                                            repairGeneration: Number(state.mutationRepairGeneration ?? 0),
                                            ts: Date.now(),
                                        },
                                    },
                                },
                            }],
                        },
                    });
                    touchedCounts.summariesCreated = 1;
                }
                state.summaryFixQueue = [];
            } else if (action === 'revectorize') {
                touchedCounts.vectorChunksRebuilt = await this.rebuildStrictVectorIndex();
            } else if (action === 'schema_cleanup') {
                const rowRedirects = state.rowRedirects ?? {};
                const rowAliasIndex = state.rowAliasIndex ?? {};
                for (const [tableKey, redirects] of Object.entries(rowRedirects)) {
                    for (const [fromRowId, toRowId] of Object.entries(redirects ?? {})) {
                        if (!normalizeSeedText(fromRowId) || !normalizeSeedText(toRowId) || fromRowId === toRowId) {
                            delete rowRedirects[tableKey]?.[fromRowId];
                            touchedCounts.cleanedStates += 1;
                        }
                    }
                }
                for (const [tableKey, aliasMap] of Object.entries(rowAliasIndex)) {
                    for (const [alias, canonical] of Object.entries(aliasMap ?? {})) {
                        if (!normalizeSeedText(alias) || !normalizeSeedText(canonical)) {
                            delete rowAliasIndex[tableKey]?.[alias];
                            touchedCounts.cleanedStates += 1;
                        }
                    }
                }
                state.rowRedirects = rowRedirects;
                state.rowAliasIndex = rowAliasIndex;

                const facts = await db.facts
                    .where('[chatKey+updatedAt]')
                    .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                    .reverse()
                    .limit(300)
                    .toArray();
                const orphanFactKeys = facts
                    .filter((fact): boolean => {
                        const entityKind = normalizeSeedText(fact.entity?.kind);
                        const entityId = normalizeSeedText(fact.entity?.id);
                        const path = normalizeSeedText(fact.path);
                        if (!entityKind || !entityId || !path) {
                            return true;
                        }
                        return Boolean(state.rowTombstones?.[entityKind]?.[entityId]);
                    })
                    .map((fact): string => normalizeSeedText(fact.factKey))
                    .filter(Boolean);
                if (orphanFactKeys.length > 0) {
                    await this.archiveFactKeys(orphanFactKeys);
                }
                touchedCounts.cleanedFacts = orphanFactKeys.length;
            } else if (action === 'group_maintenance') {
                const view = state.logicalChatView;
                if (view) {
                    state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory ?? DEFAULT_GROUP_MEMORY, state.semanticSeed ?? null);
                    touchedCounts.lanesRebuilt = Number(state.groupMemory?.lanes?.length ?? 0);
                    touchedCounts.salienceUpdated = Number(state.groupMemory?.actorSalience?.length ?? 0);
                }
            }

            const quality = await this.recomputeMemoryQuality();
            await this.refreshLifecycleState(state, `maintenance:${action}`);
            state.chatLifecycle = {
                ...(state.chatLifecycle ?? DEFAULT_CHAT_LIFECYCLE_STATE),
                lastMaintenanceAt: Date.now(),
                lastMaintenanceAction: action,
            };
            const result: MaintenanceExecutionResult = {
                action,
                ok: true,
                message: this.buildMaintenanceExecutionMessage(action, touchedCounts, state, quality),
                reasonCodes: [...(quality.reasonCodes ?? [])],
                touchedCounts,
                executedAt: Date.now(),
                durationMs: Math.max(0, Date.now() - startedAt),
            };
            state.lastMaintenanceExecution = result;
            this.markDirty();
            return result;
        } catch (error) {
            const result: MaintenanceExecutionResult = {
                action,
                ok: false,
                message: `维护动作执行失败：${String((error as Error)?.message ?? error)}`,
                reasonCodes: ['maintenance_action_failed'],
                touchedCounts,
                executedAt: Date.now(),
                durationMs: Math.max(0, Date.now() - startedAt),
            };
            state.lastMaintenanceExecution = result;
            this.markDirty();
            return result;
        }
    }

    /**
     * 功能：根据维护动作结果生成更明确的执行反馈。
     * 参数：
     *   action：执行的维护动作。
     *   touchedCounts：本次触达统计。
     *   state：当前聊天状态。
     *   quality：最新的记忆质量结果。
     * 返回：
     *   string：给界面展示的结果文案。
     */
    private buildMaintenanceExecutionMessage(
        action: MaintenanceActionType,
        touchedCounts: MaintenanceExecutionResult['touchedCounts'],
        state: MemoryOSChatState,
        quality: MemoryQualityScorecard,
    ): string {
        if (action !== 'schema_cleanup') {
            if (action === 'revectorize') {
                const rebuilt = Number(touchedCounts.vectorChunksRebuilt ?? 0);
                return rebuilt > 0
                    ? `已完成严格向量重建，重建了 ${rebuilt} 个向量块`
                    : '已完成严格向量重建，但没有找到可重建的事实或摘要';
            }
            return '维护动作已完成';
        }
        const cleanedStates = Number(touchedCounts.cleanedStates ?? 0);
        const cleanedFacts = Number(touchedCounts.cleanedFacts ?? 0);
        const messageParts: string[] = [];
        if (cleanedStates > 0 || cleanedFacts > 0) {
            messageParts.push(`已清理 ${cleanedStates} 项失效设定状态、${cleanedFacts} 条孤儿事实`);
        } else {
            messageParts.push('已完成检查，但没有发现可清理的失效设定状态或孤儿事实');
        }
        if (state.schemaDraftSession?.draftRevisionId) {
            messageParts.push('当前仍有未合并的 schema 草稿，所以这条提示可能暂时不会消失');
        } else if (Array.isArray(quality.reasonCodes) && quality.reasonCodes.includes('schema_hygiene_low')) {
            messageParts.push('设定卫生度仍然偏低，说明还有其他结构问题需要继续处理');
        }
        return messageParts.join('；');
    }

    /**
     * 功能：读取 ingest 健康窗口。
     * @returns ingest 健康状态。
     */
    async getIngestHealth(): Promise<IngestHealthWindow> {
        const state = await this.load();
        state.ingestHealth = {
            ...DEFAULT_INGEST_HEALTH,
            ...(state.ingestHealth ?? {}),
        };
        return state.ingestHealth;
    }

    /**
     * 功能：读取 retrieval 健康窗口。
     * @returns retrieval 健康状态。
     */
    async getRetrievalHealth(): Promise<RetrievalHealthWindow> {
        const state = await this.load();
        state.retrievalHealth = {
            ...DEFAULT_RETRIEVAL_HEALTH,
            ...(state.retrievalHealth ?? {}),
            recentPrecisionWindow: Array.isArray(state.retrievalHealth?.recentPrecisionWindow)
                ? state.retrievalHealth.recentPrecisionWindow
                : [],
        };
        return state.retrievalHealth;
    }

    /**
     * 功能：读取 extract 健康窗口。
     * @returns extract 健康状态。
     */
    async getExtractHealth(): Promise<ExtractHealthWindow> {
        const state = await this.load();
        state.extractHealth = {
            ...DEFAULT_EXTRACT_HEALTH,
            ...(state.extractHealth ?? {}),
            recentTasks: Array.isArray(state.extractHealth?.recentTasks)
                ? state.extractHealth.recentTasks
                : [],
        };
        return state.extractHealth;
    }

    /**
     * 功能：记录 ingest 健康窗口。
     * @param patch 健康补丁。
     * @returns 更新后的 ingest 健康状态。
     */
    async recordIngestHealth(patch: Partial<IngestHealthWindow>): Promise<IngestHealthWindow> {
        const state = await this.load();
        state.ingestHealth = {
            ...DEFAULT_INGEST_HEALTH,
            ...(state.ingestHealth ?? {}),
            ...(patch ?? {}),
            lastWriteAt: Number(patch.lastWriteAt ?? state.ingestHealth?.lastWriteAt ?? Date.now()),
        };
        const duplicateRate = state.ingestHealth.totalAttempts > 0
            ? state.ingestHealth.duplicateDrops / state.ingestHealth.totalAttempts
            : 0;
        await this.updateAdaptiveMetrics({ duplicateRate });
        return state.ingestHealth;
    }

    /**
     * 功能：记录 retrieval 健康窗口。
     * @param patch 健康补丁。
     * @returns 更新后的 retrieval 健康状态。
     */
    async recordRetrievalHealth(patch: Partial<RetrievalHealthWindow>): Promise<RetrievalHealthWindow> {
        const state = await this.load();
        const current = {
            ...DEFAULT_RETRIEVAL_HEALTH,
            ...(state.retrievalHealth ?? {}),
            recentPrecisionWindow: Array.isArray(state.retrievalHealth?.recentPrecisionWindow) ? state.retrievalHealth.recentPrecisionWindow : [],
        };
        state.retrievalHealth = {
            ...current,
            ...(patch ?? {}),
            recentPrecisionWindow: Array.isArray(patch.recentPrecisionWindow) ? patch.recentPrecisionWindow : current.recentPrecisionWindow,
        };
        const retrievalPrecision = averagePrecisionWindow(state.retrievalHealth.recentPrecisionWindow);
        await this.updateAdaptiveMetrics({
            retrievalPrecision,
            retrievalHitRate: state.retrievalHealth.totalSearches > 0
                ? (state.retrievalHealth.vectorHits + state.retrievalHealth.keywordHits > 0 ? 1 : 0)
                : 0,
            lastVectorAccessAt: Number(state.retrievalHealth.lastAccessAt ?? 0),
            lastVectorHitAt: Number(state.retrievalHealth.lastHitAt ?? 0),
        });
        await this.updateVectorLifecycle({
            recentPrecisionWindow: state.retrievalHealth.recentPrecisionWindow,
            lastAccessAt: Number(state.retrievalHealth.lastAccessAt ?? 0),
            lastHitAt: Number(state.retrievalHealth.lastHitAt ?? 0),
        });
        return state.retrievalHealth;
    }

    /**
     * 功能：记录 extract 健康窗口。
     * @param patch 健康补丁。
     * @returns 更新后的 extract 健康状态。
     */
    async recordExtractHealth(patch: Partial<ExtractHealthWindow>): Promise<ExtractHealthWindow> {
        const state = await this.load();
        const currentTasks = Array.isArray(state.extractHealth?.recentTasks) ? state.extractHealth?.recentTasks ?? [] : [];
        const nextTasks = Array.isArray(patch.recentTasks) ? patch.recentTasks.slice(-12) : currentTasks;
        state.extractHealth = {
            ...DEFAULT_EXTRACT_HEALTH,
            ...(state.extractHealth ?? {}),
            ...(patch ?? {}),
            recentTasks: nextTasks,
        };
        const acceptanceBase = nextTasks.length > 0
            ? nextTasks.filter((item): boolean => item.accepted && (item.appliedFacts + item.appliedPatches + item.appliedSummaries) > 0).length / nextTasks.length
            : 0;
        await this.updateAdaptiveMetrics({ extractAcceptance: acceptanceBase });
        return state.extractHealth;
    }

    /**
     * 功能：读取最近一次 mutation planner 执行快照。
     * @returns 最近一次 mutation planner 快照；没有记录时返回 null。
     */
    async getLastMutationPlan(): Promise<MemoryMutationPlanSnapshot | null> {
        const state = await this.load();
        state.lastMutationPlan = normalizeMutationPlanSnapshot(state.lastMutationPlan ?? null);
        return state.lastMutationPlan ?? null;
    }

    /**
     * 功能：写入最近一次 mutation planner 执行快照，并持久化到聊天状态。
     * @param snapshot 最新的 mutation planner 快照。
     * @returns 写入后的归一化快照；传入空值时返回 null。
     */
    async setLastMutationPlan(snapshot: MemoryMutationPlanSnapshot | null): Promise<MemoryMutationPlanSnapshot | null> {
        const state = await this.load();
        state.lastMutationPlan = normalizeMutationPlanSnapshot(snapshot);
        this.markDirty();
        return state.lastMutationPlan ?? null;
    }

    /**
     * 功能：重算当前聊天的质量分与维护建议。
     * @returns 重算后的质量分卡。
     */
    async recomputeMemoryQuality(): Promise<MemoryQualityScorecard> {
        const state = await this.load();
        const metrics = await this.getAdaptiveMetrics();
        const vectorLifecycle = await this.getVectorLifecycle();
        const latestSummaryAt = await this.getLatestSummaryAt();
        const latestSignalAt = Math.max(
            latestSummaryAt,
            Number(metrics.lastVectorIndexAt ?? 0),
            Number(state.ingestHealth?.lastWriteAt ?? 0),
            Number(state.extractHealth?.lastAcceptedAt ?? 0),
            Number(metrics.lastUpdatedAt ?? 0),
        );
        const orphanFactsRatio = await this.computeOrphanFactsRatio();
        const schemaHygiene = this.computeSchemaHygiene(orphanFactsRatio);
        const nextMetrics: AdaptiveMetrics = {
            ...metrics,
            orphanFactsRatio,
            schemaHygiene,
            summaryStaleness: latestSummaryAt > 0 && latestSignalAt > 0
                ? Math.max(0, 1 - computeMemoryQualityScorecard({
                    metrics,
                    vectorLifecycle,
                    latestSummaryAt,
                    latestSignalAt,
                }).dimensions.summaryFreshness)
                : 1,
        };
        state.adaptiveMetrics = nextMetrics;
        const quality = computeMemoryQualityScorecard({
            metrics: nextMetrics,
            vectorLifecycle,
            latestSummaryAt,
            latestSignalAt,
        });
        state.memoryQuality = quality;
        const nextAdvice = buildMaintenanceAdvice({
            metrics: nextMetrics,
            quality,
            vectorLifecycle,
        });
        const groupSplit = this.detectGroupLaneSplit(state.groupMemory);
        state.maintenanceAdvice = groupSplit.hasSplit
            ? [
                ...nextAdvice,
                {
                    action: 'group_maintenance',
                    priority: groupSplit.severity === 'critical' ? 'high' : 'medium',
                    reasonCodes: groupSplit.reasonCodes,
                    title: '建议执行群聊维护',
                    detail: '检测到群聊角色车道状态分裂，建议重建 lanes、显著度和共享场景。',
                },
            ]
            : nextAdvice;
        state.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(state.maintenanceAdvice, state);
        await this.refreshLifecycleState(state, 'recompute_quality');
        state.adaptivePolicy = {
            ...this.applyLifecycleBias(
                buildAdaptivePolicy(await this.getChatProfile(), nextMetrics, vectorLifecycle, quality),
                state.chatLifecycle?.stage ?? 'new',
            ),
            ...(this.getEffectivePresetBundleFromState(state).effectiveAdaptivePolicy ?? {}),
        };
        this.markDirty();
        return quality;
    }

    /**
     * 功能：设置保留策略覆盖。
     * @param override 保留策略覆盖项。
     * @returns 无返回值。
     */
    async setRetentionPolicyOverride(override: Partial<RetentionPolicy>): Promise<void> {
        const state = await this.load();
        state.manualOverrides = {
            ...(state.manualOverrides ?? {}),
            retentionPolicy: {
                ...(state.manualOverrides?.retentionPolicy ?? {}),
                ...(override ?? {}),
            },
        };
        state.retentionPolicy = await this.getRetentionPolicy();
        this.markDirty();
    }

    /**
     * 功能：记录最近一次策略决策。
     * @param decision 决策对象。
     * @returns 无返回值。
     */
    async setLastStrategyDecision(decision: StrategyDecision | null): Promise<void> {
        const state = await this.load();
        state.lastStrategyDecision = decision;
        this.markDirty();
    }

    /**
     * 功能：读取最近一次策略决策。
     * @returns 最近一次策略决策。
     */
    async getLastStrategyDecision(): Promise<StrategyDecision | null> {
        const state = await this.load();
        return state.lastStrategyDecision ?? null;
    }

    /**
     * 功能：记录最近一次生成前 gate 决策。
     * 参数：
     *   decision (PreGenerationGateDecision | null)：生成前决策。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setLastPreGenerationDecision(decision: PreGenerationGateDecision | null): Promise<void> {
        const state = await this.load();
        state.lastPreGenerationDecision = decision;
        this.markDirty();
    }

    /**
     * 功能：读取最近一次生成前 gate 决策。
     * 返回：
     *   Promise<PreGenerationGateDecision | null>：生成前决策。
     */
    async getLastPreGenerationDecision(): Promise<PreGenerationGateDecision | null> {
        const state = await this.load();
        return state.lastPreGenerationDecision ?? null;
    }

    /**
     * 功能：记录最近一次生成后 gate 决策。
     * 参数：
     *   decision (PostGenerationGateDecision | null)：生成后决策。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setLastPostGenerationDecision(decision: PostGenerationGateDecision | null): Promise<void> {
        const state = await this.load();
        state.lastPostGenerationDecision = decision;
        this.markDirty();
    }

    /**
     * 功能：读取最近一次生成后 gate 决策。
     * 返回：
     *   Promise<PostGenerationGateDecision | null>：生成后决策。
     */
    async getLastPostGenerationDecision(): Promise<PostGenerationGateDecision | null> {
        const state = await this.load();
        return state.lastPostGenerationDecision ?? null;
    }

    /**
     * 功能：读取归档索引。
     * @returns 归档索引。
     */
    async getRetentionArchives(): Promise<RetentionArchives> {
        const state = await this.load();
        state.retentionArchives = {
            ...DEFAULT_RETENTION_ARCHIVES,
            ...(state.retentionArchives ?? {}),
        };
        return state.retentionArchives;
    }

    /**
     * 功能：批量记录软删除事实键。
     * @param factKeys 事实键列表。
     * @returns 无返回值。
     */
    async archiveFactKeys(factKeys: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        state.retentionArchives = {
            ...archives,
            archivedFactKeys: Array.from(new Set([...archives.archivedFactKeys, ...factKeys.filter(Boolean)])),
        };
        await this.removeStrictVectorChunksByRecordKeys(factKeys);
        this.markDirty();
    }

    /**
     * 功能：取消软删除事实键。
     * @param factKeys 事实键列表。
     * @returns 无返回值。
     */
    async unarchiveFactKeys(factKeys: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        const removed = new Set(factKeys.filter(Boolean));
        state.retentionArchives = {
            ...archives,
            archivedFactKeys: archives.archivedFactKeys.filter((factKey: string): boolean => !removed.has(factKey)),
        };
        this.markDirty();
    }

    /**
     * 功能：批量记录软删除摘要键。
     * @param summaryIds 摘要键列表。
     * @returns 无返回值。
     */
    async archiveSummaryIds(summaryIds: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        state.retentionArchives = {
            ...archives,
            archivedSummaryIds: Array.from(new Set([...archives.archivedSummaryIds, ...summaryIds.filter(Boolean)])),
        };
        await this.removeStrictVectorChunksByRecordKeys(summaryIds);
        this.markDirty();
    }

    /**
     * 功能：取消软删除摘要键。
     * @param summaryIds 摘要键列表。
     * @returns 无返回值。
     */
    async unarchiveSummaryIds(summaryIds: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        const removed = new Set(summaryIds.filter(Boolean));
        state.retentionArchives = {
            ...archives,
            archivedSummaryIds: archives.archivedSummaryIds.filter((summaryId: string): boolean => !removed.has(summaryId)),
        };
        this.markDirty();
    }

    /**
     * 功能：批量记录软删除向量分块键。
     * @param chunkIds 分块键列表。
     * @returns 无返回值。
     */
    async archiveVectorChunkIds(chunkIds: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        state.retentionArchives = {
            ...archives,
            archivedVectorChunkIds: Array.from(new Set([...archives.archivedVectorChunkIds, ...chunkIds.filter(Boolean)])),
        };
        this.markDirty();
    }

    /**
     * 功能：取消软删除向量分块键。
     * @param chunkIds 分块键列表。
     * @returns 无返回值。
     */
    async unarchiveVectorChunkIds(chunkIds: string[]): Promise<void> {
        const state = await this.load();
        const archives = await this.getRetentionArchives();
        const removed = new Set(chunkIds.filter(Boolean));
        state.retentionArchives = {
            ...archives,
            archivedVectorChunkIds: archives.archivedVectorChunkIds.filter((chunkId: string): boolean => !removed.has(chunkId)),
        };
        this.markDirty();
    }

    /**
     * 功能：删除指定记录键对应的严格向量分块。
     * @param recordKeys 记录键列表。
     * @returns 被删除的分块数量。
     */
    private async removeStrictVectorChunksByRecordKeys(recordKeys: string[]): Promise<number> {
        const normalizedKeys = Array.from(new Set((Array.isArray(recordKeys) ? recordKeys : []).map((item: string): string => normalizeMemoryText(item)).filter(Boolean)));
        if (normalizedKeys.length <= 0) {
            return 0;
        }
        const chunks = await db.vector_chunks.where('chatKey').equals(this.chatKey).toArray();
        const chunkIds = chunks
            .filter((chunk): boolean => {
                const metadata = (chunk.metadata ?? {}) as Record<string, unknown>;
                const sourceRecordKey = normalizeMemoryText(metadata.sourceRecordKey);
                return sourceRecordKey.length > 0 && normalizedKeys.includes(sourceRecordKey);
            })
            .map((chunk): string => normalizeMemoryText(chunk.chunkId))
            .filter(Boolean);
        if (chunkIds.length <= 0) {
            return 0;
        }
        await Promise.all([
            db.vector_chunks.bulkDelete(chunkIds),
            db.vector_embeddings.where('chunkId').anyOf(chunkIds).delete(),
        ]);
        await this.unarchiveVectorChunkIds(chunkIds);
        return chunkIds.length;
    }

    /**
     * 功能：把单条事实或摘要记录重新写入严格向量链。
     * @param recordKey 记录键。
     * @param recordKind 记录类型。
     * @param reason 触发原因。
     * @returns 新写入的 chunkId 列表。
     */
    private async syncStrictVectorRecord(recordKey: string, recordKind: 'fact' | 'summary', reason: string): Promise<string[]> {
        const normalizedRecordKey = normalizeMemoryText(recordKey);
        const normalizedKind = normalizeStrictVectorRecordKind(recordKind);
        if (!normalizedRecordKey || !normalizedKind) {
            return [];
        }
        await this.removeStrictVectorChunksByRecordKeys([normalizedRecordKey]);
        const record = normalizedKind === 'fact'
            ? await db.facts.get(normalizedRecordKey)
            : await db.summaries.get(normalizedRecordKey);
        if (!record || String(record.chatKey ?? '').trim() !== this.chatKey) {
            return [];
        }
        return this.indexStrictVectorRecord(record, normalizedKind, reason);
    }

    /**
     * 功能：把一条现存事实或摘要记录写入严格向量链。
     * @param record 事实或摘要记录。
     * @param recordKind 记录类型。
     * @param reason 触发原因。
     * @returns 新写入的 chunkId 列表。
     */
    private async indexStrictVectorRecord(record: DBFact | DBSummary, recordKind: 'fact' | 'summary', reason: string): Promise<string[]> {
        const text = buildStrictVectorText(record, recordKind);
        if (!text) {
            return [];
        }
        const metadata = buildStrictVectorMetadata(record, recordKind, reason);
        const vectorManager = new VectorManager(this.chatKey);
        const chunkIds = await vectorManager.indexText(text, recordKind === 'fact' ? 'facts' : 'summaries', metadata);
        if (chunkIds.length > 0) {
            const state = await this.load();
            if (state.vectorIndexVersion !== 'source_metadata_v3') {
                state.vectorIndexVersion = 'source_metadata_v3';
                this.markDirty();
            }
        }
        return chunkIds;
    }

    /**
     * 功能：对当前聊天的事实与摘要执行严格向量全量重建。
     * @returns 新写入的 chunk 总数。
     */
    public async rebuildStrictVectorIndex(): Promise<number> {
        const vectorManager = new VectorManager(this.chatKey);
        await vectorManager.clear();
        const [facts, summaries] = await Promise.all([
            db.facts.where('[chatKey+updatedAt]').between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey]).reverse().toArray(),
            db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey]).reverse().toArray(),
        ]);
        let rebuilt = 0;
        for (const fact of facts) {
            if (!fact || String(fact.chatKey ?? '').trim() !== this.chatKey) {
                continue;
            }
            const chunkIds = await this.indexStrictVectorRecord(fact, 'fact', 'maintenance_revectorize');
            rebuilt += chunkIds.length;
        }
        for (const summary of summaries) {
            if (!summary || String(summary.chatKey ?? '').trim() !== this.chatKey) {
                continue;
            }
            const chunkIds = await this.indexStrictVectorRecord(summary, 'summary', 'maintenance_revectorize');
            rebuilt += chunkIds.length;
        }
        const state = await this.load();
        state.vectorIndexVersion = 'source_metadata_v3';
        state.vectorMetadataRebuiltAt = Date.now();
        this.markDirty();
        return rebuilt;
    }

    /**
     * 功能：判断指定事实是否已软删除。
     * @param factKey 事实键。
     * @returns 是否已软删除。
     */
    async isFactArchived(factKey: string): Promise<boolean> {
        const archives = await this.getRetentionArchives();
        return archives.archivedFactKeys.includes(String(factKey ?? '').trim());
    }

    /**
     * 功能：判断指定摘要是否已软删除。
     * @param summaryId 摘要键。
     * @returns 是否已软删除。
     */
    async isSummaryArchived(summaryId: string): Promise<boolean> {
        const archives = await this.getRetentionArchives();
        return archives.archivedSummaryIds.includes(String(summaryId ?? '').trim());
    }

    /**
     * 功能：判断指定向量分块是否已软删除。
     * @param chunkId 分块键。
     * @returns 是否已软删除。
     */
    async isVectorChunkArchived(chunkId: string): Promise<boolean> {
        const archives = await this.getRetentionArchives();
        return archives.archivedVectorChunkIds.includes(String(chunkId ?? '').trim());
    }

    /**
     * 功能：读取兼容旧接口的摘要策略。
     * @returns 兼容旧接口的摘要策略。
     */
    async getSummaryPolicyOverride(): Promise<SummaryPolicyOverride> {
        const state = await this.load();
        const adaptivePolicy = await this.getAdaptivePolicy();
        return {
            enabled: typeof state.manualOverrides?.summaryPolicy?.enabled === 'boolean'
                ? state.manualOverrides.summaryPolicy.enabled
                : adaptivePolicy.summaryEnabled,
            interval: Number.isFinite(Number(state.manualOverrides?.summaryPolicy?.interval))
                ? Number(state.manualOverrides?.summaryPolicy?.interval)
                : adaptivePolicy.extractInterval,
            windowSize: Number.isFinite(Number(state.manualOverrides?.summaryPolicy?.windowSize))
                ? Number(state.manualOverrides?.summaryPolicy?.windowSize)
                : adaptivePolicy.extractWindowSize,
        };
    }

    /**
     * 功能：写入兼容旧接口的摘要策略覆盖。
     * @param override 摘要策略覆盖项。
     * @returns 无返回值。
     */
    async setSummaryPolicyOverride(override: SummaryPolicyOverride): Promise<void> {
        const state = await this.load();
        const current = await this.getSummaryPolicyOverride();
        const next: SummaryPolicyOverride = {
            enabled: typeof override.enabled === 'boolean' ? override.enabled : current.enabled,
            interval: Number.isFinite(Number(override.interval))
                ? Math.max(1, Math.round(Number(override.interval)))
                : current.interval,
            windowSize: Number.isFinite(Number(override.windowSize))
                ? Math.max(1, Math.round(Number(override.windowSize)))
                : current.windowSize,
        };
        state.manualOverrides = {
            ...(state.manualOverrides ?? {}),
            summaryPolicy: next,
            adaptivePolicy: {
                ...(state.manualOverrides?.adaptivePolicy ?? {}),
                ...(typeof next.enabled === 'boolean' ? { summaryEnabled: next.enabled } : {}),
                ...(Number.isFinite(Number(next.interval)) ? { extractInterval: Number(next.interval) } : {}),
                ...(Number.isFinite(Number(next.windowSize)) ? { extractWindowSize: Number(next.windowSize) } : {}),
            },
        };
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        this.markDirty();
    }

    /**
     * 功能：读取自动 schema 策略。
     * @returns 自动 schema 策略。
     */
    async getAutoSchemaPolicy(): Promise<Required<AutoSchemaPolicy>> {
        const state = await this.load();
        return {
            ...DEFAULT_AUTO_SCHEMA_POLICY,
            ...(state.autoSchemaPolicy ?? {}),
        };
    }

    /**
     * 功能：更新自动 schema 策略。
     * @param policy 策略补丁。
     * @returns 无返回值。
     */
    async setAutoSchemaPolicy(policy: Partial<AutoSchemaPolicy>): Promise<void> {
        const state = await this.load();
        state.autoSchemaPolicy = {
            ...(state.autoSchemaPolicy ?? {}),
            ...(policy ?? {}),
        };
        this.markDirty();
    }

    /**
     * 功能：读取 schema 草稿会话。
     * @returns schema 草稿会话。
     */
    async getSchemaDraftSession(): Promise<SchemaDraftSession> {
        const state = await this.load();
        return {
            ...DEFAULT_SCHEMA_DRAFT_SESSION,
            ...(state.schemaDraftSession ?? {}),
        };
    }

    /**
     * 功能：更新 schema 草稿会话。
     * @param patch 草稿会话补丁。
     * @returns 无返回值。
     */
    async updateSchemaDraftSession(patch: Partial<SchemaDraftSession>): Promise<void> {
        const state = await this.load();
        state.schemaDraftSession = {
            ...DEFAULT_SCHEMA_DRAFT_SESSION,
            ...(state.schemaDraftSession ?? {}),
            ...(patch ?? {}),
        };
        this.markDirty();
    }

    /**
     * 功能：读取助手轮次跟踪器。
     * @returns 助手轮次跟踪器。
     */
    async getAssistantTurnTracker(): Promise<AssistantTurnTracker> {
        const state = await this.load();
        return {
            ...DEFAULT_ASSISTANT_TURN_TRACKER,
            ...(state.assistantTurnTracker ?? {}),
        };
    }

    /**
     * 功能：更新助手轮次跟踪器。
     * @param patch 跟踪器补丁。
     * @returns 无返回值。
     */
    async updateAssistantTurnTracker(patch: Partial<AssistantTurnTracker>): Promise<void> {
        const state = await this.load();
        const current = await this.getAssistantTurnTracker();
        state.assistantTurnTracker = {
            ...current,
            ...(patch ?? {}),
            lastUpdatedAt: Date.now(),
        };
        this.markDirty();
    }

    /**
     * 功能：读取当前聊天的逻辑消息视图快照。
     * 参数：
     *   无。
     * 返回：
     *   Promise<LogicalChatView | null>：逻辑消息视图，不存在时返回 null。
     */
    async getLogicalChatView(): Promise<LogicalChatView | null> {
        const state = await this.load();
        return state.logicalChatView ?? null;
    }

    async getMutationRepairGeneration(): Promise<number> {
        const state = await this.load();
        return Math.max(0, Number(state.mutationRepairGeneration ?? 0));
    }

    /**
     * 功能：写入逻辑消息视图并同步聊天生命周期变更信息。
     * 参数：
     *   view (LogicalChatView)：新的逻辑消息视图。
     *   mutationSource (string)：本次重建来源。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setLogicalChatView(view: LogicalChatView, mutationSource: string = 'snapshot_diff'): Promise<void> {
        const state = await this.load();
        const previousViewHash = normalizeSeedText(state.logicalChatView?.viewHash);
        state.logicalChatView = view;
        await this.recordLifecycleMutation(
            state,
            Array.isArray(view.mutationKinds) ? view.mutationKinds : [],
            mutationSource,
        );
        if (shouldEnqueueMutationRepair(Array.isArray(view.mutationKinds) ? view.mutationKinds : [])) {
            this.enqueueMutationRepairTask(state, view);
            await this.runMutationRepairQueue(state);
        }
        const effectivePolicy = await this.getAdaptivePolicy();
        if (effectivePolicy.groupLaneEnabled !== false) {
            state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory ?? DEFAULT_GROUP_MEMORY, state.semanticSeed ?? null);
        }
        state.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(state.maintenanceAdvice ?? [], state);
        await this.refreshLifecycleState(state, 'logical_view');
        this.markDirty();
    }

    private enqueueMutationRepairTask(state: MemoryOSChatState, view: LogicalChatView): void {
        const queue = Array.isArray(state.mutationRepairQueue) ? state.mutationRepairQueue : [];
        if (normalizeSeedText(state.lastMutationRepairViewHash) === normalizeSeedText(view.viewHash)) {
            state.mutationRepairQueue = queue;
            return;
        }
        const latestTask = queue[queue.length - 1];
        if (latestTask && normalizeSeedText(latestTask.viewHash) === normalizeSeedText(view.viewHash)) {
            state.mutationRepairQueue = queue;
            return;
        }
        const nextGeneration = Math.max(0, Number(state.mutationRepairGeneration ?? 0)) + 1;
        const task: MutationRepairTask = {
            taskId: crypto.randomUUID(),
            viewHash: normalizeSeedText(view.viewHash),
            snapshotHash: normalizeSeedText(view.snapshotHash),
            mutationKinds: Array.isArray(view.mutationKinds) ? view.mutationKinds : [],
            invalidatedMessageIds: Array.isArray(view.invalidatedMessageIds) ? view.invalidatedMessageIds.filter(Boolean) : [],
            activeMessageIds: Array.isArray(view.activeMessageIds) ? view.activeMessageIds.filter(Boolean) : [],
            repairAnchorMessageId: normalizeSeedText(view.repairAnchorMessageId) || undefined,
            repairGeneration: nextGeneration,
            enqueuedAt: Date.now(),
            attempts: 0,
            status: 'pending',
        };
        state.mutationRepairQueue = [...queue, task].slice(-16);
        state.mutationRepairGeneration = nextGeneration;
    }

    private async runMutationRepairQueue(state: MemoryOSChatState): Promise<void> {
        const queue = Array.isArray(state.mutationRepairQueue) ? state.mutationRepairQueue : [];
        if (queue.length === 0 || state.archived === true) {
            state.mutationRepairQueue = queue;
            return;
        }
        while (queue.length > 0) {
            const task = queue[0];
            if (!task) {
                queue.shift();
                continue;
            }
            task.status = 'running';
            task.attempts = Number(task.attempts ?? 0) + 1;
            try {
                await this.executeMutationRepairTask(state, task);
                queue.shift();
                state.lastMutationRepairViewHash = task.viewHash;
                state.lastMutationRepairAt = Date.now();
                state.mutationRepairGeneration = Math.max(
                    Number(state.mutationRepairGeneration ?? 0),
                    Number(task.repairGeneration ?? 0),
                );
            } catch (error) {
                task.status = 'failed';
                task.lastError = String((error as Error)?.message ?? error);
                logger.warn(`Mutation repair failed chatKey=${this.chatKey}, viewHash=${task.viewHash}`, error);
                break;
            }
        }
        state.mutationRepairQueue = queue;
    }

    private async executeMutationRepairTask(state: MemoryOSChatState, task: MutationRepairTask): Promise<void> {
        const view = state.logicalChatView;
        if (!view || normalizeSeedText(view.viewHash) !== normalizeSeedText(task.viewHash)) {
            return;
        }

        const hasLegacyData = await this.hasLegacyDerivationData();
        if (hasLegacyData) {
            await this.runMaintenanceAction('rebuild_summary');
            await this.rebuildStrictVectorIndex();
            state.turnLedger = this.rebuildTurnLedgerByActiveMessages(state.turnLedger ?? [], view.activeMessageIds ?? []);
            if (state.groupMemory) {
                state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory, state.semanticSeed ?? null);
            }
            await this.recomputeMemoryQuality();
            return;
        }

        await this.archiveInvalidDerivedArtifacts(view, task);
        await this.rebuildLatestSummaryForRepair(view, task);
        await this.rebuildStrictVectorIndex();
        state.turnLedger = this.rebuildTurnLedgerByActiveMessages(state.turnLedger ?? [], view.activeMessageIds ?? []);
        if (state.groupMemory) {
            state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory, state.semanticSeed ?? null);
        }
        await this.recomputeMemoryQuality();
    }

    private rebuildTurnLedgerByActiveMessages(turnLedger: TurnRecord[], activeMessageIds: string[]): TurnRecord[] {
        const activeSet = new Set((Array.isArray(activeMessageIds) ? activeMessageIds : []).map((item) => normalizeSeedText(item)).filter(Boolean));
        if (activeSet.size === 0) {
            return Array.isArray(turnLedger) ? turnLedger : [];
        }
        return (Array.isArray(turnLedger) ? turnLedger : []).filter((turn) => {
            const messageId = normalizeSeedText(turn.messageId);
            if (!messageId) {
                return true;
            }
            return activeSet.has(messageId);
        });
    }

    private async hasLegacyDerivationData(): Promise<boolean> {
        const [facts, summaries, vectorChunks] = await Promise.all([
            db.facts
                .where('[chatKey+updatedAt]')
                .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                .reverse()
                .limit(300)
                .toArray(),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
                .reverse()
                .limit(120)
                .toArray(),
            db.vector_chunks
                .where('chatKey')
                .equals(this.chatKey)
                .limit(300)
                .toArray(),
        ]);
        const hasLegacyFacts = facts.some((fact): boolean => !hasStructuredProvenance(fact.provenance));
        if (hasLegacyFacts) {
            return true;
        }
        const hasLegacySummaries = summaries.some((summary): boolean => {
            const source = (summary.source ?? {}) as Record<string, unknown>;
            return !hasStructuredProvenance(source.provenance);
        });
        if (hasLegacySummaries) {
            return true;
        }
        return vectorChunks.some((chunk): boolean => !hasStructuredProvenance((chunk.metadata as Record<string, unknown> | undefined)?.source
            ? { source: (chunk.metadata as Record<string, unknown>).source }
            : null));
    }

    private async archiveInvalidDerivedArtifacts(view: LogicalChatView, task: MutationRepairTask): Promise<void> {
        const invalidIds = new Set(
            (Array.isArray(task.invalidatedMessageIds) ? task.invalidatedMessageIds : [])
                .map((id: string): string => normalizeSeedText(id))
                .filter(Boolean),
        );
        if (invalidIds.size === 0) {
            return;
        }
        const [facts, summaries, vectorChunks] = await Promise.all([
            db.facts
                .where('[chatKey+updatedAt]')
                .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                .toArray(),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
                .toArray(),
            db.vector_chunks
                .where('chatKey')
                .equals(this.chatKey)
                .toArray(),
        ]);

        const staleFactKeys = facts
            .filter((fact): boolean => {
                const viewHash = readProvenanceViewHash(fact.provenance);
                const messageIds = readProvenanceMessageIds(fact.provenance);
                return (viewHash && viewHash !== view.viewHash)
                    || hasArrayIntersection(messageIds, invalidIds);
            })
            .map((fact): string => normalizeSeedText(fact.factKey))
            .filter(Boolean);
        if (staleFactKeys.length > 0) {
            await this.archiveFactKeys(staleFactKeys);
        }

        const staleSummaryIds = summaries
            .filter((summary): boolean => {
                const source = (summary.source ?? {}) as Record<string, unknown>;
                const viewHash = readProvenanceViewHash(source.provenance);
                const messageIds = readProvenanceMessageIds(source.provenance);
                return (viewHash && viewHash !== view.viewHash)
                    || hasArrayIntersection(messageIds, invalidIds);
            })
            .map((summary): string => normalizeSeedText(summary.summaryId))
            .filter(Boolean);
        if (staleSummaryIds.length > 0) {
            await this.archiveSummaryIds(staleSummaryIds);
        }

        const staleChunkIds = vectorChunks
            .filter((chunk): boolean => {
                const metadata = (chunk.metadata ?? {}) as Record<string, unknown>;
                const source = (metadata.source ?? {}) as Record<string, unknown>;
                const viewHash = normalizeSeedText(source.viewHash);
                const messageIdsRaw = source.messageIds;
                const messageIds = Array.isArray(messageIdsRaw)
                    ? messageIdsRaw.map((item: unknown): string => normalizeSeedText(item)).filter(Boolean)
                    : [];
                return (viewHash && viewHash !== view.viewHash)
                    || hasArrayIntersection(messageIds, invalidIds);
            })
            .map((chunk): string => normalizeSeedText(chunk.chunkId))
            .filter(Boolean);
        if (staleChunkIds.length > 0) {
            await Promise.all([
                db.vector_chunks.bulkDelete(staleChunkIds),
                db.vector_embeddings
                    .where('chunkId')
                    .anyOf(staleChunkIds)
                    .delete(),
            ]);
            await this.archiveVectorChunkIds(staleChunkIds);
        }
    }

    private async deleteManagedRepairSummaries(keepSummaryId: string): Promise<void> {
        const summaries = await db.summaries
            .where('[chatKey+level+createdAt]')
            .between([this.chatKey, 'scene', Dexie.minKey], [this.chatKey, 'scene', Dexie.maxKey])
            .toArray();
        const duplicateIds = summaries
            .filter((summary): boolean => {
                const summaryId = normalizeSeedText(summary.summaryId);
                if (!summaryId || summaryId === keepSummaryId) {
                    return false;
                }
                const source = (summary.source ?? {}) as Record<string, unknown>;
                const provenance = (source.provenance ?? {}) as Record<string, unknown>;
                const derivation = (provenance.source ?? {}) as Record<string, unknown>;
                return normalizeSeedText(source.extractor) === 'mutation_repair'
                    || normalizeSeedText(derivation.kind) === 'logical_repair'
                    || normalizeSeedText(summary.title).toLowerCase() === 'mutation repair summary';
            })
            .map((summary): string => normalizeSeedText(summary.summaryId))
            .filter(Boolean);
        if (duplicateIds.length > 0) {
            for (const summaryId of Array.from(new Set(duplicateIds))) {
                const summary = await db.summaries.get(summaryId);
                if (!summary) {
                    continue;
                }
                await this.getProposalManager().processWriteRequest({
                    source: {
                        pluginId: MEMORY_OS_PLUGIN_ID,
                        version: '1.0.0',
                    },
                    chatKey: this.chatKey,
                    reason: 'mutation_repair.cleanup',
                    proposal: {
                        summaries: [{
                            summaryId,
                            targetRecordKey: summaryId,
                            action: 'delete',
                            level: summary.level,
                            title: summary.title,
                            content: summary.content,
                            keywords: summary.keywords,
                            range: summary.range,
                            source: summary.source,
                        }],
                    },
                });
            }
        }
    }

    private async deleteManagedMaintenanceSummaries(keepSummaryId: string): Promise<void> {
        const summaries = await db.summaries
            .where('[chatKey+level+createdAt]')
            .between([this.chatKey, 'scene', Dexie.minKey], [this.chatKey, 'scene', Dexie.maxKey])
            .toArray();
        const duplicateIds = summaries
            .filter((summary): boolean => {
                const summaryId = normalizeSeedText(summary.summaryId);
                if (!summaryId || summaryId === keepSummaryId) {
                    return false;
                }
                const source = (summary.source ?? {}) as Record<string, unknown>;
                const provenance = (source.provenance ?? {}) as Record<string, unknown>;
                const derivation = (provenance.source ?? {}) as Record<string, unknown>;
                return (
                    normalizeSeedText(source.extractor) === 'maintenance'
                    && normalizeSeedText(derivation.reason) === 'rebuild_summary'
                ) || normalizeSeedText(summary.title) === '缁存姢閲嶅缓鎽樿';
            })
            .map((summary): string => normalizeSeedText(summary.summaryId))
            .filter(Boolean);
        if (duplicateIds.length > 0) {
            for (const summaryId of Array.from(new Set(duplicateIds))) {
                const summary = await db.summaries.get(summaryId);
                if (!summary) {
                    continue;
                }
                await this.getProposalManager().processWriteRequest({
                    source: {
                        pluginId: MEMORY_OS_PLUGIN_ID,
                        version: '1.0.0',
                    },
                    chatKey: this.chatKey,
                    reason: 'maintenance.cleanup',
                    proposal: {
                        summaries: [{
                            summaryId,
                            targetRecordKey: summaryId,
                            action: 'delete',
                            level: summary.level,
                            title: summary.title,
                            content: summary.content,
                            keywords: summary.keywords,
                            range: summary.range,
                            source: summary.source,
                        }],
                    },
                });
            }
        }
    }

    private async rebuildLatestSummaryForRepair(view: LogicalChatView, task: MutationRepairTask): Promise<void> {
        const lines = view.visibleMessages
            .slice(Math.max(0, view.visibleMessages.length - 20))
            .map((item): string => normalizeSeedText(item.text))
            .filter(Boolean);
        if (lines.length === 0) {
            return;
        }
        const recentVisible = view.visibleMessages.slice(Math.max(0, view.visibleMessages.length - 20));
        const firstMessageId = normalizeSeedText(recentVisible[0]?.messageId);
        const lastMessageId = normalizeSeedText(recentVisible[recentVisible.length - 1]?.messageId);
        const summaryId = buildManagedSummaryStableId(this.chatKey, 'mutation_repair_scene');
        await this.deleteManagedRepairSummaries(summaryId);
        await this.getProposalManager().processWriteRequest({
            source: {
                pluginId: MEMORY_OS_PLUGIN_ID,
                version: '1.0.0',
            },
            chatKey: this.chatKey,
            reason: 'mutation_repair.summary',
            proposal: {
                summaries: [{
                    summaryId,
                    targetRecordKey: summaryId,
                    action: 'auto',
                    level: 'scene',
                    title: 'Mutation repair summary',
                    content: lines.join('\n'),
                    range: {
                        fromMessageId: firstMessageId || undefined,
                        toMessageId: lastMessageId || undefined,
                    },
                    source: {
                        extractor: 'mutation_repair',
                        provider: 'stx_memory_os',
                        provenance: {
                            extractor: 'mutation_repair',
                            provider: 'stx_memory_os',
                            source: {
                                kind: 'logical_repair',
                                reason: task.mutationKinds.join('|'),
                                viewHash: view.viewHash,
                                snapshotHash: view.snapshotHash,
                                messageIds: recentVisible.map((item) => normalizeSeedText(item.messageId)).filter(Boolean),
                                anchorMessageId: task.repairAnchorMessageId || undefined,
                                mutationKinds: task.mutationKinds,
                                repairGeneration: task.repairGeneration,
                                ts: Date.now(),
                            },
                        },
                    },
                }],
            },
        });
    }

    /**
     * 功能：基于当前状态重建角色记忆画像。
     * 参数：
     *   state：当前聊天状态。
     * 返回：
     *   PersonaMemoryProfile：重建后的角色记忆画像。
     */
    private rebuildPersonaFromState(state: MemoryOSChatState): PersonaMemoryProfile {
        return inferPersonaMemoryProfile(
            state.semanticSeed ?? null,
            state.chatProfile ?? DEFAULT_CHAT_PROFILE,
            state.groupMemory ?? null,
            (state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null,
        );
    }

    private rebuildPersonaProfilesFromState(state: MemoryOSChatState): Record<string, PersonaMemoryProfile> {
        return inferPersonaMemoryProfiles(
            state.semanticSeed ?? null,
            state.chatProfile ?? DEFAULT_CHAT_PROFILE,
            state.groupMemory ?? null,
        );
    }

    private syncPersonaProfilesFromState(state: MemoryOSChatState, preferredActorKey?: string | null): PersonaMemoryProfile {
        const nextProfiles = this.rebuildPersonaProfilesFromState(state);
        state.personaMemoryProfiles = nextProfiles;
        state.simpleMemoryPersonas = Object.entries(nextProfiles).reduce<Record<string, SimpleMemoryPersona>>((result: Record<string, SimpleMemoryPersona>, [actorKey, profile]: [string, PersonaMemoryProfile]): Record<string, SimpleMemoryPersona> => {
            result[actorKey] = buildSimpleMemoryPersona(profile);
            return result;
        }, {});
        const primaryActorKey = normalizeMemoryText(preferredActorKey)
            || normalizeMemoryText(state.activeActorKey)
            || getPrimaryPersonaActorKey({ ...state, personaMemoryProfiles: nextProfiles })
            || Object.keys(nextProfiles)[0]
            || '';
        state.activeActorKey = primaryActorKey || undefined;
        state.personaMemoryProfile = resolvePersonaProfile({ ...state, personaMemoryProfiles: nextProfiles, activeActorKey: primaryActorKey }, primaryActorKey) ?? DEFAULT_PERSONA_MEMORY_PROFILE;
        state.simpleMemoryPersona = resolveSimplePersona({ ...state, simpleMemoryPersonas: state.simpleMemoryPersonas, activeActorKey: primaryActorKey }, primaryActorKey) ?? buildSimpleMemoryPersona(state.personaMemoryProfile);
        return state.personaMemoryProfile;
    }

    private resolvePersonaProfileForActor(state: MemoryOSChatState, actorKey?: string | null): PersonaMemoryProfile {
        return resolvePersonaProfile(state, (actorKey ?? state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null) ?? DEFAULT_PERSONA_MEMORY_PROFILE;
    }

    private resolvePersonaProfileForInference(state: MemoryOSChatState, input: OwnedMemoryInferenceInput): PersonaMemoryProfile {
        const ownerActorKey = input.current?.ownerActorKey !== undefined
            ? (input.current.ownerActorKey == null ? null : normalizeMemoryText(input.current.ownerActorKey))
            : normalizeMemoryText(input.entityKind) === 'character'
                ? normalizeMemoryText(input.entityId)
                : normalizeMemoryText(input.fallbackOwnerActorKey) || normalizeMemoryText(state.activeActorKey) || null;
        return this.resolvePersonaProfileForActor(state, ownerActorKey);
    }

    private ensurePersonaProfiles(state: MemoryOSChatState): Record<string, PersonaMemoryProfile> {
        if (state.personaMemoryProfiles && Object.keys(state.personaMemoryProfiles).length > 0) {
            return state.personaMemoryProfiles;
        }
        this.syncPersonaProfilesFromState(state, state.activeActorKey);
        return state.personaMemoryProfiles ?? {};
    }

    private buildPerActorRetentionMetrics(
        state: MemoryOSChatState,
        lifecycle: MemoryLifecycleState,
        input: OwnedMemoryInferenceInput,
    ): MemoryActorRetentionMap {
        return buildPerActorRetentionMap(
            lifecycle,
            input,
            this.ensurePersonaProfiles(state),
            Date.now(),
        );
    }

    /**
     * 功能：按需从结构化表恢复召回日志。
     * 参数：
     *   state：当前聊天状态。
     * 返回：
     *   Promise<RecallLogEntry[]>：召回日志。
     */
    private async hydrateRecallLogFromDb(state: MemoryOSChatState): Promise<RecallLogEntry[]> {
        const limit = Math.max(40, Math.floor(Number(state.memoryTuningProfile?.recallRetentionLimit ?? DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit)));
        const rows = await db.memory_recall_log
            .where('[chatKey+ts]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .reverse()
            .limit(limit)
            .toArray();
        return rows.map((row): RecallLogEntry => ({
            recallId: row.recallId,
            query: normalizeMemoryText(row.query),
            section: (row.section || 'PREVIEW') as RecallLogEntry['section'],
            recordKey: normalizeMemoryText(row.recordKey),
            recordKind: row.recordKind,
            recordTitle: normalizeMemoryText(row.recordTitle),
            score: clamp01(Number(row.score ?? 0)),
            selected: row.selected === true,
            conflictSuppressed: row.conflictSuppressed === true,
            tone: String(row.tone || 'stable_fact') as InjectedMemoryTone,
            reasonCodes: Array.isArray(row.reasonCodes) ? row.reasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean) : [],
            loggedAt: Number(row.ts ?? row.updatedAt ?? 0) || Date.now(),
        }));
    }

    /**
     * 功能：按需从结构化表恢复关系状态。
     * 参数：
     *   state：当前聊天状态。
     * 返回：
     *   Promise<Record<string, RelationshipState>>：关系状态映射。
     */
    private async hydrateRelationshipStateFromDb(): Promise<Record<string, RelationshipState>> {
        const rows = await db.relationship_memory
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .reverse()
            .toArray();
        const nextMap: Record<string, RelationshipState> = {};
        rows.forEach((row): void => {
            nextMap[row.relationshipKey] = {
                relationshipKey: row.relationshipKey,
                actorKey: normalizeMemoryText(row.actorKey),
                targetKey: normalizeMemoryText(row.targetKey),
                scope: row.scope === 'group_pair' ? 'group_pair' : 'self_target',
                participantKeys: Array.isArray(row.participantKeys)
                    ? row.participantKeys.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [normalizeMemoryText(row.actorKey), normalizeMemoryText(row.targetKey)].filter(Boolean),
                familiarity: clamp01(Number(row.familiarity ?? 0)),
                trust: clamp01(Number(row.trust ?? 0)),
                affection: clamp01(Number(row.affection ?? 0)),
                tension: clamp01(Number(row.tension ?? 0)),
                dependency: clamp01(Number(row.dependency ?? 0)),
                respect: clamp01(Number(row.respect ?? 0)),
                unresolvedConflict: clamp01(Number(row.unresolvedConflict ?? 0)),
                sharedFragments: Array.isArray(row.sharedFragments) ? row.sharedFragments.map((item: string): string => normalizeMemoryText(item)).filter(Boolean) : [],
                summary: normalizeMemoryText(row.summary),
                reasonCodes: Array.isArray(row.reasonCodes) ? row.reasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean) : [],
                updatedAt: Number(row.updatedAt ?? 0) || Date.now(),
            };
        });
        return nextMap;
    }

    /**
     * 功能：按需从事实表和摘要表回填生命周期索引。
     * @param state 当前聊天状态。
     * @returns Promise<Record<string, MemoryLifecycleState>>：生命周期索引。
     */
    private async hydrateLifecycleIndexFromDb(state: MemoryOSChatState): Promise<Record<string, MemoryLifecycleState>> {
        const fallbackOwnerActorKey: string | null = normalizeMemoryText(state.semanticSeed?.identitySeed?.roleKey) || null;
        const [facts, summaries] = await Promise.all([
            db.facts
                .where('[chatKey+updatedAt]')
                .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                .reverse()
                .limit(240)
                .toArray(),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
                .reverse()
                .limit(120)
                .toArray(),
        ]);
            if (facts.length <= 0 && summaries.length <= 0 && Object.keys(state.memoryLifecycleIndex ?? {}).length > 0) {
                return state.memoryLifecycleIndex ?? {};
            }
        const nextIndex: Record<string, MemoryLifecycleState> = {};
        const nextOwnedIndex: Record<string, OwnedMemoryState> = {};
        facts.forEach((fact): void => {
            const inferenceInput: OwnedMemoryInferenceInput = {
                recordKey: fact.factKey,
                recordKind: 'fact',
                text: typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value ?? ''),
                path: fact.path,
                factType: fact.type,
                entityKind: fact.entity?.kind,
                entityId: fact.entity?.id,
                value: fact.value,
                fallbackOwnerActorKey,
                current: {
                    ownerActorKey: fact.ownerActorKey == null ? null : normalizeMemoryText(String(fact.ownerActorKey)),
                    memoryType: (fact.memoryType ?? 'other') as MemoryLifecycleState['memoryType'],
                    memorySubtype: (fact.memorySubtype ?? 'other') as MemoryLifecycleState['memorySubtype'],
                    sourceScope: (fact.sourceScope ?? 'system') as MemoryLifecycleState['sourceScope'],
                    importance: clamp01(Number(fact.importance ?? fact.salience ?? fact.encodeScore ?? fact.confidence ?? 0.5)),
                    forgotten: fact.forgotten === true,
                    forgottenAt: Math.max(0, Number(fact.forgottenAt ?? 0) || 0) || undefined,
                    forgottenReasonCodes: Array.isArray(fact.forgottenReasonCodes)
                        ? fact.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                    forgetProbability: clamp01(Number(fact.forgetProbability ?? 0)),
                    lastForgetRollAt: Math.max(0, Number(fact.lastForgetRollAt ?? 0) || 0),
                    reinforcedByEventIds: Array.isArray(fact.reinforcedByEventIds)
                        ? fact.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                    invalidatedByEventIds: Array.isArray(fact.invalidatedByEventIds)
                        ? fact.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                },
            };
            const lifecycle: MemoryLifecycleState = enrichLifecycleOwnedState({
                recordKey: fact.factKey,
                recordKind: 'fact',
                stage: (fact.decayStage ?? 'clear') as MemoryLifecycleState['stage'],
                ownerActorKey: fact.ownerActorKey == null ? null : normalizeMemoryText(String(fact.ownerActorKey)),
                memoryType: (fact.memoryType ?? 'other') as MemoryLifecycleState['memoryType'],
                memorySubtype: (fact.memorySubtype ?? 'other') as MemoryLifecycleState['memorySubtype'],
                sourceScope: (fact.sourceScope ?? 'system') as MemoryLifecycleState['sourceScope'],
                importance: clamp01(Number(fact.importance ?? fact.salience ?? fact.encodeScore ?? fact.confidence ?? 0.5)),
                forgetProbability: clamp01(Number(fact.forgetProbability ?? 0)),
                forgotten: fact.forgotten === true,
                forgottenAt: Math.max(0, Number(fact.forgottenAt ?? 0) || 0) || undefined,
                forgottenReasonCodes: Array.isArray(fact.forgottenReasonCodes)
                    ? fact.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                lastForgetRollAt: Math.max(0, Number(fact.lastForgetRollAt ?? 0) || 0),
                reinforcedByEventIds: Array.isArray(fact.reinforcedByEventIds)
                    ? fact.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                invalidatedByEventIds: Array.isArray(fact.invalidatedByEventIds)
                    ? fact.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                strength: clamp01(Number(fact.strength ?? fact.encodeScore ?? fact.confidence ?? 0.5)),
                salience: clamp01(Number(fact.salience ?? fact.encodeScore ?? fact.confidence ?? 0.5)),
                rehearsalCount: Math.max(0, Number(fact.rehearsalCount ?? 0) || 0),
                lastRecalledAt: Math.max(0, Number(fact.lastRecalledAt ?? 0) || 0),
                distortionRisk: clamp01((fact.decayStage === 'distorted' ? 0.72 : fact.decayStage === 'blur' ? 0.38 : 0.12)),
                emotionTag: normalizeMemoryText(fact.emotionTag),
                relationScope: normalizeMemoryText(fact.relationScope),
                updatedAt: Math.max(0, Number(fact.updatedAt ?? 0) || 0),
            }, inferenceInput, this.resolvePersonaProfileForInference(state, inferenceInput));
            lifecycle.perActorMetrics = this.buildPerActorRetentionMetrics(state, lifecycle, inferenceInput);
            nextIndex[fact.factKey] = lifecycle;
            nextOwnedIndex[fact.factKey] = {
                recordKey: fact.factKey,
                ownerActorKey: lifecycle.ownerActorKey ?? null,
                recordKind: 'fact',
                memoryType: lifecycle.memoryType ?? 'other',
                memorySubtype: lifecycle.memorySubtype ?? 'other',
                sourceScope: lifecycle.sourceScope ?? 'system',
                importance: lifecycle.importance ?? lifecycle.salience,
                forgetProbability: lifecycle.forgetProbability ?? 0,
                forgotten: lifecycle.forgotten === true,
                forgottenAt: lifecycle.forgottenAt,
                forgottenReasonCodes: lifecycle.forgottenReasonCodes ?? [],
                lastForgetRollAt: lifecycle.lastForgetRollAt || undefined,
                reinforcedByEventIds: lifecycle.reinforcedByEventIds ?? [],
                invalidatedByEventIds: lifecycle.invalidatedByEventIds ?? [],
                roleBasedRetentionOverrides: lifecycle.perActorMetrics ?? {},
                updatedAt: lifecycle.updatedAt,
            };
        });
        summaries.forEach((summary): void => {
            const inferenceInput: OwnedMemoryInferenceInput = {
                recordKey: summary.summaryId,
                recordKind: 'summary',
                title: summary.title,
                text: summary.content,
                keywords: summary.keywords,
                factType: summary.level,
                fallbackOwnerActorKey,
                current: {
                    ownerActorKey: summary.ownerActorKey == null ? null : normalizeMemoryText(String(summary.ownerActorKey)),
                    memoryType: (summary.memoryType ?? 'other') as MemoryLifecycleState['memoryType'],
                    memorySubtype: (summary.memorySubtype ?? 'other') as MemoryLifecycleState['memorySubtype'],
                    sourceScope: (summary.sourceScope ?? 'system') as MemoryLifecycleState['sourceScope'],
                    importance: clamp01(Number(summary.importance ?? summary.salience ?? summary.encodeScore ?? 0.5)),
                    forgotten: summary.forgotten === true,
                    forgottenAt: Math.max(0, Number(summary.forgottenAt ?? 0) || 0) || undefined,
                    forgottenReasonCodes: Array.isArray(summary.forgottenReasonCodes)
                        ? summary.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                    forgetProbability: clamp01(Number(summary.forgetProbability ?? 0)),
                    lastForgetRollAt: Math.max(0, Number(summary.lastForgetRollAt ?? 0) || 0),
                    reinforcedByEventIds: Array.isArray(summary.reinforcedByEventIds)
                        ? summary.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                    invalidatedByEventIds: Array.isArray(summary.invalidatedByEventIds)
                        ? summary.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                        : [],
                },
            };
            const lifecycle: MemoryLifecycleState = enrichLifecycleOwnedState({
                recordKey: summary.summaryId,
                recordKind: 'summary',
                stage: (summary.decayStage ?? 'clear') as MemoryLifecycleState['stage'],
                ownerActorKey: summary.ownerActorKey == null ? null : normalizeMemoryText(String(summary.ownerActorKey)),
                memoryType: (summary.memoryType ?? 'other') as MemoryLifecycleState['memoryType'],
                memorySubtype: (summary.memorySubtype ?? 'other') as MemoryLifecycleState['memorySubtype'],
                sourceScope: (summary.sourceScope ?? 'system') as MemoryLifecycleState['sourceScope'],
                importance: clamp01(Number(summary.importance ?? summary.salience ?? summary.encodeScore ?? 0.5)),
                forgetProbability: clamp01(Number(summary.forgetProbability ?? 0)),
                forgotten: summary.forgotten === true,
                forgottenAt: Math.max(0, Number(summary.forgottenAt ?? 0) || 0) || undefined,
                forgottenReasonCodes: Array.isArray(summary.forgottenReasonCodes)
                    ? summary.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                lastForgetRollAt: Math.max(0, Number(summary.lastForgetRollAt ?? 0) || 0),
                reinforcedByEventIds: Array.isArray(summary.reinforcedByEventIds)
                    ? summary.reinforcedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                invalidatedByEventIds: Array.isArray(summary.invalidatedByEventIds)
                    ? summary.invalidatedByEventIds.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                    : [],
                strength: clamp01(Number(summary.strength ?? summary.encodeScore ?? 0.5)),
                salience: clamp01(Number(summary.salience ?? summary.encodeScore ?? 0.5)),
                rehearsalCount: Math.max(0, Number(summary.rehearsalCount ?? 0) || 0),
                lastRecalledAt: Math.max(0, Number(summary.lastRecalledAt ?? 0) || 0),
                distortionRisk: clamp01((summary.decayStage === 'distorted' ? 0.72 : summary.decayStage === 'blur' ? 0.38 : 0.12)),
                emotionTag: normalizeMemoryText(summary.emotionTag),
                relationScope: normalizeMemoryText(summary.relationScope),
                updatedAt: Math.max(0, Number(summary.createdAt ?? 0) || 0),
            }, inferenceInput, this.resolvePersonaProfileForInference(state, inferenceInput));
            lifecycle.perActorMetrics = this.buildPerActorRetentionMetrics(state, lifecycle, inferenceInput);
            nextIndex[summary.summaryId] = lifecycle;
            nextOwnedIndex[summary.summaryId] = {
                recordKey: summary.summaryId,
                ownerActorKey: lifecycle.ownerActorKey ?? null,
                recordKind: 'summary',
                memoryType: lifecycle.memoryType ?? 'other',
                memorySubtype: lifecycle.memorySubtype ?? 'other',
                sourceScope: lifecycle.sourceScope ?? 'system',
                importance: lifecycle.importance ?? lifecycle.salience,
                forgetProbability: lifecycle.forgetProbability ?? 0,
                forgotten: lifecycle.forgotten === true,
                forgottenAt: lifecycle.forgottenAt,
                forgottenReasonCodes: lifecycle.forgottenReasonCodes ?? [],
                lastForgetRollAt: lifecycle.lastForgetRollAt || undefined,
                reinforcedByEventIds: lifecycle.reinforcedByEventIds ?? [],
                invalidatedByEventIds: lifecycle.invalidatedByEventIds ?? [],
                roleBasedRetentionOverrides: lifecycle.perActorMetrics ?? {},
                updatedAt: lifecycle.updatedAt,
            };
        });
        state.memoryLifecycleIndex = nextIndex;
        state.ownedMemoryIndex = nextOwnedIndex;
        return nextIndex;
    }

    /**
     * 功能：把召回日志双写到结构化表。
     * 参数：
     *   entries：召回日志。
     * 返回：
     *   Promise<void>：异步完成。
     */
    private async persistRecallRows(entries: RecallLogEntry[]): Promise<void> {
        const state = await this.load();
        const limit = Math.max(40, Math.floor(Number(state.memoryTuningProfile?.recallRetentionLimit ?? DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit)));
        if (entries.length > 0) {
            await db.memory_recall_log.bulkPut(entries.map((entry) => ({
                recallId: entry.recallId,
                chatKey: this.chatKey,
                query: entry.query,
                section: entry.section,
                recordKey: entry.recordKey,
                recordKind: entry.recordKind,
                recordTitle: entry.recordTitle,
                score: entry.score,
                selected: entry.selected,
                conflictSuppressed: entry.conflictSuppressed,
                tone: entry.tone,
                reasonCodes: entry.reasonCodes,
                ts: Number(entry.loggedAt ?? Date.now()) || Date.now(),
                updatedAt: Date.now(),
            })));
        }
        const staleRows = await db.memory_recall_log
            .where('[chatKey+ts]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .reverse()
            .offset(limit)
            .toArray();
        if (staleRows.length > 0) {
            await db.memory_recall_log.bulkDelete(staleRows.map((row) => row.recallId));
        }
        await db.meta.update(this.chatKey, {
            lastRecallLoggedAt: Date.now(),
        });
    }

    /**
     * 功能：把关系状态双写到结构化表。
     * 参数：
     *   states：关系状态数组。
     * 返回：
     *   Promise<void>：异步完成。
     */
    private async persistRelationshipRows(states: RelationshipState[]): Promise<void> {
        const existingRows = await db.relationship_memory
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .toArray();
        if (existingRows.length > 0) {
            await db.relationship_memory.bulkDelete(existingRows.map((row) => row.relationshipKey));
        }
        if (states.length > 0) {
            await db.relationship_memory.bulkPut(states.map((item) => ({
                relationshipKey: item.relationshipKey,
                chatKey: this.chatKey,
                actorKey: item.actorKey,
                targetKey: item.targetKey,
                scope: item.scope,
                participantKeys: item.participantKeys,
                familiarity: item.familiarity,
                trust: item.trust,
                affection: item.affection,
                tension: item.tension,
                dependency: item.dependency,
                respect: item.respect,
                unresolvedConflict: item.unresolvedConflict,
                sharedFragments: item.sharedFragments,
                summary: item.summary,
                reasonCodes: item.reasonCodes,
                updatedAt: item.updatedAt,
            })));
        }
    }

    /**
     * 功能：解析默认的“自身角色键”。
     * 参数：
     *   state：当前聊天状态。
     * 返回：
     *   string：自身角色键。
     */

    private resolveSelfActorKey(state: MemoryOSChatState): string {
        const semanticRoleKey = normalizeSeedText(state.semanticSeed?.identitySeed?.roleKey);
        if (semanticRoleKey) {
            return semanticRoleKey;
        }
        const assistantLane = Array.isArray(state.groupMemory?.lanes)
            ? state.groupMemory!.lanes.find((lane) => lane.actorKey.startsWith('assistant:') || normalizeSeedText(lane.identityHint))
            : null;
        return normalizeSeedText(assistantLane?.actorKey) || 'assistant:self';
    }

    /**
     * 功能：从文本信号里提取关系增量。
     * 参数：
     *   actorKey：自身角色键。
     *   targetKey：目标角色键。
     *   text：原始文本。
     * 返回：
     *   RelationshipDelta | null：关系增量。
     */
    private inferRelationshipDelta(actorKey: string, targetKey: string, text: string): RelationshipDelta | null {
        const normalized = normalizeMemoryText(text);
        if (!normalized) {
            return null;
        }
        let familiarity = 0;
        let trust = 0;
        let affection = 0;
        let tension = 0;
        let dependency = 0;
        let respect = 0;
        let unresolvedConflictDelta = 0;
        const reasons: string[] = [];

        if (/熟悉|经常|一直|共同|老朋友/.test(normalized)) {
            familiarity += 0.16;
            reasons.push('familiarity_up');
        }
        if (/信任|放心|可靠|承诺|依赖/.test(normalized)) {
            trust += 0.2;
            dependency += 0.08;
            reasons.push('trust_up');
        }
        if (/喜欢|爱|亲密|在乎|思念|恋人/.test(normalized)) {
            affection += 0.22;
            reasons.push('affection_up');
        }
        if (/尊重|敬重|佩服|认可/.test(normalized)) {
            respect += 0.18;
            reasons.push('respect_up');
        }
        if (/冲突|争执|敌对|背叛|仇|讨厌|愤怒/.test(normalized)) {
            tension += 0.24;
            unresolvedConflictDelta += 0.2;
            reasons.push('conflict_up');
        }
        if (reasons.length === 0) {
            return null;
        }
        return {
            actorKey,
            targetKey,
            familiarity,
            trust,
            affection,
            tension,
            dependency,
            respect,
            unresolvedConflictDelta,
            sharedFragment: normalized.slice(0, 120),
            reason: reasons.join('|'),
            updatedAt: Date.now(),
        };
    }

    /**
     * 功能：应用单条关系增量。
     * 参数：
     *   current：当前关系状态。
     *   delta：关系增量。
     * 返回：
     *   RelationshipState：更新后的关系状态。
     */
    private applyRelationshipDelta(current: RelationshipState | null, delta: RelationshipDelta): RelationshipState {
        const next: RelationshipState = current
            ? { ...current }
            : {
                relationshipKey: `${delta.actorKey}::${delta.targetKey}`,
                actorKey: delta.actorKey,
                targetKey: delta.targetKey,
                scope: 'self_target',
                participantKeys: [delta.actorKey, delta.targetKey].filter(Boolean),
                familiarity: 0,
                trust: 0,
                affection: 0,
                tension: 0,
                dependency: 0,
                respect: 0,
                unresolvedConflict: 0,
                sharedFragments: [],
                summary: '',
                reasonCodes: [],
                updatedAt: delta.updatedAt,
            };
        next.familiarity = clamp01(next.familiarity + delta.familiarity);
        next.trust = clamp01(next.trust + delta.trust);
        next.affection = clamp01(next.affection + delta.affection);
        next.tension = clamp01(next.tension + delta.tension);
        next.dependency = clamp01(next.dependency + delta.dependency);
        next.respect = clamp01(next.respect + delta.respect);
        next.unresolvedConflict = clamp01(next.unresolvedConflict + delta.unresolvedConflictDelta);
        next.sharedFragments = Array.from(new Set([...(next.sharedFragments ?? []), normalizeMemoryText(delta.sharedFragment)])).filter(Boolean).slice(-8);
        next.reasonCodes = Array.from(new Set([...(next.reasonCodes ?? []), delta.reason]));
        next.updatedAt = delta.updatedAt;
        next.participantKeys = Array.from(new Set([...(next.participantKeys ?? []), delta.actorKey, delta.targetKey].filter(Boolean)));
        next.summary = [
            next.affection >= 0.45 ? '关系亲密' : '',
            next.trust >= 0.45 ? '较高信任' : '',
            next.respect >= 0.45 ? '存在尊重' : '',
            next.tension >= 0.45 ? '关系紧张' : '',
            next.unresolvedConflict >= 0.35 ? '仍有未解冲突' : '',
        ].filter(Boolean).join('，') || '关系仍在形成';
        return next;
    }

    /**
     * 功能：在没有明显关系信号时补充熟悉度基线。
     * 参数：
     *   current：当前关系状态。
     *   actorKey：自身角色键。
     *   targetKey：目标角色键。
     *   familiarityBase：熟悉度基线。
     *   detail：摘要文本。
     * 返回：
     *   RelationshipState：补齐后的关系状态。
     */
    private ensureRelationshipBaseline(
        current: RelationshipState | null,
        actorKey: string,
        targetKey: string,
        familiarityBase: number,
        detail: string,
    ): RelationshipState {
        return this.applyRelationshipDelta(current, {
            actorKey,
            targetKey,
            familiarity: clamp01(familiarityBase),
            trust: 0,
            affection: 0,
            tension: 0,
            dependency: 0,
            respect: 0,
            unresolvedConflictDelta: 0,
            sharedFragment: detail,
            reason: 'baseline_familiarity',
            updatedAt: Date.now(),
        });
    }

    /**
     * 功能：读取冷启动语义种子。
     * 参数：
     *   无。
     * 返回：
     *   Promise<ChatSemanticSeed | null>：语义种子，不存在时返回 null。
     */
    async getSemanticSeed(): Promise<ChatSemanticSeed | null> {
        const state = await this.load();
        return state.semanticSeed ?? null;
    }

    /**
     * 功能：读取冷启动初始化使用的世界书选择。
     * 参数：
     *   无。
     * 返回：
        *   Promise<ColdStartLorebookSelection>：整书与条目级选择。
     */
    async getColdStartLorebookSelection(): Promise<ColdStartLorebookSelection> {
        const state = await this.load();
        return normalizeColdStartLorebookSelection({
            books: normalizeLorebookSelection(state.coldStartLorebookSelection),
            entries: normalizeLorebookEntrySelection(state.coldStartLorebookEntrySelection),
        });
    }

    /**
     * 功能：判断当前聊天是否明确跳过世界书初始化。
     * 参数：
     *   无。
     * 返回：
     *   Promise<boolean>：true 表示明确不使用世界书初始化。
     */
    async isColdStartLorebookSelectionSkipped(): Promise<boolean> {
        const state = await this.load();
        return state.coldStartSkipLorebookSelection === true;
    }

    /**
     * 功能：保存冷启动初始化使用的世界书选择。
     * 参数：
      *   selection：整书与条目级选择。
     * 返回：
      *   Promise<ColdStartLorebookSelection>：标准化后的选择结果。
     */
    async setColdStartLorebookSelection(selection: ColdStartLorebookSelection): Promise<ColdStartLorebookSelection> {
        const state = await this.load();
        const normalized = normalizeColdStartLorebookSelection(selection);
        state.coldStartLorebookSelection = normalized.books.length > 0 ? normalized.books : undefined;
        state.coldStartLorebookEntrySelection = normalized.entries.length > 0 ? normalized.entries : undefined;
        if (normalized.books.length > 0 || normalized.entries.length > 0) {
            state.coldStartSkipLorebookSelection = undefined;
        }
        this.markDirty();
        return normalized;
    }

    /**
     * 功能：设置是否跳过世界书初始化。
     * 参数：
     *   skipped：是否跳过。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setColdStartLorebookSelectionSkipped(skipped: boolean): Promise<void> {
        const state = await this.load();
        state.coldStartSkipLorebookSelection = skipped === true ? true : undefined;
        if (skipped) {
            state.coldStartLorebookSelection = undefined;
            state.coldStartLorebookEntrySelection = undefined;
        }
        this.markDirty();
    }

    /**
     * 功能：清除冷启动初始化使用的世界书选择。
     * 参数：
     *   无。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async clearColdStartLorebookSelection(): Promise<void> {
        const state = await this.load();
        state.coldStartLorebookSelection = undefined;
        state.coldStartLorebookEntrySelection = undefined;
        state.coldStartSkipLorebookSelection = undefined;
        this.markDirty();
    }

    /**
     * 功能：读取角色记忆画像。
     * 参数：
     *   无。
     * 返回：
     *   Promise<PersonaMemoryProfile | null>：角色记忆画像。
     */
    async getPersonaMemoryProfile(): Promise<PersonaMemoryProfile | null> {
        const state = await this.load();
        if ((!state.personaMemoryProfiles || Object.keys(state.personaMemoryProfiles).length <= 0) && !state.personaMemoryProfile) {
            await this.recomputePersonaMemoryProfile();
        }
        return resolvePersonaProfile(state, (state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null) ?? null;
    }

    async getPersonaMemoryProfiles(): Promise<Record<string, PersonaMemoryProfile>> {
        const state = await this.load();
        if (!state.personaMemoryProfiles || Object.keys(state.personaMemoryProfiles).length <= 0) {
            await this.recomputePersonaMemoryProfiles();
        }
        return { ...(state.personaMemoryProfiles ?? {}) };
    }

    async getPersonaMemoryProfileForActor(actorKey: string): Promise<PersonaMemoryProfile | null> {
        const state = await this.load();
        if (!state.personaMemoryProfiles || Object.keys(state.personaMemoryProfiles).length <= 0) {
            await this.recomputePersonaMemoryProfiles();
        }
        return resolvePersonaProfile(state, actorKey) ?? null;
    }

    async getActiveActorKey(): Promise<string | null> {
        const state = await this.load();
        if (!state.activeActorKey) {
            this.syncPersonaProfilesFromState(state);
            this.markDirty();
        }
        return normalizeMemoryText(state.activeActorKey) || null;
    }

    async setActiveActorKey(actorKey: string | null): Promise<string | null> {
        const state = await this.load();
        if (!state.personaMemoryProfiles || Object.keys(state.personaMemoryProfiles).length <= 0) {
            this.syncPersonaProfilesFromState(state, actorKey);
        }
        const normalizedActorKey = normalizeMemoryText(actorKey) || getPrimaryPersonaActorKey(state) || Object.keys(state.personaMemoryProfiles ?? {})[0] || '';
        state.activeActorKey = normalizedActorKey || undefined;
        state.personaMemoryProfile = resolvePersonaProfile(state, normalizedActorKey || null) ?? state.personaMemoryProfile ?? DEFAULT_PERSONA_MEMORY_PROFILE;
        state.simpleMemoryPersona = resolveSimplePersona(state, normalizedActorKey || null) ?? state.simpleMemoryPersona ?? buildSimpleMemoryPersona(state.personaMemoryProfile);
        this.markDirty();
        return normalizedActorKey || null;
    }

    /**
     * 功能：读取简化后的角色记忆画像。
     * 参数：
     *   无。
     * 返回：
     *   Promise<SimpleMemoryPersona | null>：简化画像。
     */
    async getSimpleMemoryPersona(): Promise<SimpleMemoryPersona | null> {
        const state = await this.load();
        if ((!state.simpleMemoryPersonas || Object.keys(state.simpleMemoryPersonas).length <= 0) && !state.simpleMemoryPersona) {
            await this.recomputePersonaMemoryProfile();
        }
        return resolveSimplePersona(state, (state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null) ?? null;
    }

    /**
     * 功能：重算角色记忆画像并同步简化标签。
     * 参数：
     *   无。
     * 返回：
     *   Promise<PersonaMemoryProfile>：重算后的画像。
     */
    async recomputePersonaMemoryProfile(): Promise<PersonaMemoryProfile> {
        const state = await this.load();
        const nextProfile = this.syncPersonaProfilesFromState(state, (state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null);
        this.markDirty();
        return nextProfile;
    }

    async recomputePersonaMemoryProfiles(): Promise<Record<string, PersonaMemoryProfile>> {
        const state = await this.load();
        this.syncPersonaProfilesFromState(state, (state.activeActorKey ?? getPrimaryPersonaActorKey(state)) || null);
        this.markDirty();
        return { ...(state.personaMemoryProfiles ?? {}) };
    }

    /**
     * 功能：构建并打分一条候选记忆。
     * 参数：
     *   input：候选输入。
     * 返回：
     *   Promise<MemoryCandidate>：带评分的候选记忆。
     */
    async buildMemoryCandidate(input: MemoryCandidateInput): Promise<MemoryCandidate> {
        const profile = await this.getPersonaMemoryProfile() ?? DEFAULT_PERSONA_MEMORY_PROFILE;
        const tuning = await this.getMemoryTuningProfile();
        return buildScoredMemoryCandidate(input, profile, tuning);
    }

    /**
     * 功能：读取冷启动指纹。
     * 参数：
     *   无。
     * 返回：
     *   Promise<string | null>：指纹，不存在时返回 null。
     */
    async getColdStartFingerprint(): Promise<string | null> {
        const state = await this.load();
        const value = normalizeSeedText(state.coldStartFingerprint);
        return value || null;
    }

    async getColdStartStage(): Promise<ColdStartStage | null> {
        const state = await this.load();
        const stage = normalizeSeedText(state.coldStartStage);
        if (stage === 'seeded' || stage === 'prompt_primed' || stage === 'extract_primed') {
            return stage;
        }
        return null;
    }

    async markColdStartStage(
        stage: ColdStartStage,
        fingerprint: string,
        options?: { primedAt?: number },
    ): Promise<boolean> {
        const state = await this.load();
        const currentFingerprint = normalizeSeedText(state.coldStartFingerprint);
        const incomingFingerprint = normalizeSeedText(fingerprint);
        if (!currentFingerprint || !incomingFingerprint || currentFingerprint !== incomingFingerprint) {
            return false;
        }
        const currentStage = normalizeSeedText(state.coldStartStage);
        const stageRank = (value: string): number => {
            if (value === 'extract_primed') return 3;
            if (value === 'prompt_primed') return 2;
            if (value === 'seeded') return 1;
            return 0;
        };
        if (stageRank(currentStage) >= stageRank(stage)) {
            return false;
        }
        state.coldStartStage = stage;
        state.coldStartPrimedAt = Number(options?.primedAt ?? Date.now()) || Date.now();
        this.markDirty();
        return true;
    }

    /**
     * 功能：写入冷启动语义种子并同步基础画像偏置。
     * 参数：
     *   seed (ChatSemanticSeed)：语义种子。
     *   fingerprint (string)：种子指纹。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async saveSemanticSeed(seed: ChatSemanticSeed, fingerprint: string): Promise<void> {
        const state = await this.load();
        state.semanticSeed = seed;
        if (!Array.isArray(state.coldStartLorebookSelection) && !Array.isArray(state.coldStartLorebookEntrySelection)) {
            state.coldStartLorebookSelection = normalizeLorebookSelection(seed.activeLorebooks);
            state.coldStartSkipLorebookSelection = seed.activeLorebooks.length === 0 ? true : undefined;
        }
        state.coldStartFingerprint = normalizeSeedText(fingerprint) || undefined;
        state.coldStartStage = 'seeded';
        state.coldStartPrimedAt = undefined;

        const nextProfile: ChatProfile = {
            ...DEFAULT_CHAT_PROFILE,
            ...(state.chatProfile ?? {}),
            vectorStrategy: {
                ...DEFAULT_CHAT_PROFILE.vectorStrategy,
                ...(state.chatProfile?.vectorStrategy ?? {}),
            },
        };
        if (Array.isArray(seed.groupMembers) && seed.groupMembers.length > 1) {
            nextProfile.chatType = 'group';
        }
        if (seed.styleSeed?.mode === 'tool') {
            nextProfile.stylePreference = 'qa';
        } else if (seed.styleSeed?.mode === 'setting_qa') {
            nextProfile.chatType = nextProfile.chatType === 'group' ? 'group' : 'worldbook';
            nextProfile.stylePreference = 'info';
        } else if (seed.styleSeed?.mode === 'rp') {
            nextProfile.stylePreference = 'trpg';
        } else if (seed.styleSeed?.mode === 'narrative') {
            nextProfile.stylePreference = 'story';
        }
        state.chatProfile = nextProfile;

        state.groupMemory = {
            ...(state.groupMemory ?? DEFAULT_GROUP_MEMORY),
            bindingSnapshot: {
                ...(state.groupMemory?.bindingSnapshot ?? DEFAULT_GROUP_MEMORY.bindingSnapshot),
                memberNames: Array.from(new Set(seed.groupMembers ?? [])).filter(Boolean).slice(0, 24),
                updatedAt: Date.now(),
            },
            updatedAt: Date.now(),
        };
        this.syncPersonaProfilesFromState(state, normalizeMemoryText(seed.identitySeed?.roleKey) || null);
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        this.markDirty();
    }

    /**
     * 功能：把编码评分同步到实际记录和生命周期索引。
     * 参数：
     *   recordKey：记录键。
     *   recordKind：记录类型。
     *   encoding：编码评分。
     *   updatedAt：记录更新时间。
     * 返回：
     *   Promise<MemoryLifecycleState>：更新后的生命周期状态。
     */
    async applyEncodingToRecord(
        recordKey: string,
        recordKind: MemoryLifecycleState['recordKind'],
        encoding: MemoryCandidate['encoding'],
        updatedAt: number = Date.now(),
    ): Promise<MemoryLifecycleState> {
        const state = await this.load();
        const previous = state.memoryLifecycleIndex?.[recordKey];
        const fallbackOwnerActorKey: string | null = normalizeMemoryText(state.semanticSeed?.identitySeed?.roleKey) || null;
        const factRow = recordKind === 'fact' ? await db.facts.get(recordKey) : null;
        const summaryRow = recordKind === 'summary' ? await db.summaries.get(recordKey) : null;
        const worldStateRow = recordKind === 'state' ? await db.world_state.get(`${this.chatKey}::${recordKey}`) : null;
        const inferenceInput: OwnedMemoryInferenceInput = {
            recordKey,
            recordKind,
            title: summaryRow?.title,
            text: recordKind === 'fact'
                ? (typeof factRow?.value === 'string' ? factRow.value : JSON.stringify(factRow?.value ?? ''))
                : recordKind === 'summary'
                    ? summaryRow?.content
                    : (typeof worldStateRow?.value === 'string' ? worldStateRow.value : JSON.stringify(worldStateRow?.value ?? '')),
            path: factRow?.path ?? worldStateRow?.path,
            factType: factRow?.type ?? summaryRow?.level,
            entityKind: factRow?.entity?.kind,
            entityId: factRow?.entity?.id,
            keywords: summaryRow?.keywords,
            value: factRow?.value ?? worldStateRow?.value,
            fallbackOwnerActorKey,
            current: previous,
        };
        const profile = this.resolvePersonaProfileForInference(state, inferenceInput);
        const lifecycle = enrichLifecycleOwnedState({
            ...buildLifecycleState(
                recordKey,
                recordKind,
                encoding.salience,
                encoding.strength,
                profile,
                updatedAt,
                Math.max(0, Number(previous?.rehearsalCount ?? 0)),
                Math.max(0, Number(previous?.lastRecalledAt ?? 0)),
                encoding.emotionTag,
                encoding.relationScope,
            ),
        }, inferenceInput, profile) satisfies MemoryLifecycleState;
        state.memoryLifecycleIndex = {
            ...(state.memoryLifecycleIndex ?? {}),
            [recordKey]: lifecycle,
        };
        state.ownedMemoryIndex = {
            ...(state.ownedMemoryIndex ?? {}),
            [recordKey]: {
                recordKey,
                ownerActorKey: lifecycle.ownerActorKey ?? null,
                recordKind,
                memoryType: lifecycle.memoryType ?? 'other',
                memorySubtype: lifecycle.memorySubtype ?? 'other',
                sourceScope: lifecycle.sourceScope ?? 'system',
                importance: lifecycle.importance ?? lifecycle.salience,
                forgetProbability: lifecycle.forgetProbability ?? 0,
                forgotten: lifecycle.forgotten === true,
                forgottenAt: lifecycle.forgottenAt,
                forgottenReasonCodes: lifecycle.forgottenReasonCodes ?? [],
                lastForgetRollAt: lifecycle.lastForgetRollAt || undefined,
                reinforcedByEventIds: lifecycle.reinforcedByEventIds ?? [],
                invalidatedByEventIds: lifecycle.invalidatedByEventIds ?? [],
                updatedAt: lifecycle.updatedAt,
            },
        };
        if (recordKind === 'fact') {
            await db.facts.update(recordKey, {
                salience: lifecycle.salience,
                strength: lifecycle.strength,
                decayStage: lifecycle.stage,
                rehearsalCount: lifecycle.rehearsalCount,
                lastRecalledAt: lifecycle.lastRecalledAt,
                emotionTag: lifecycle.emotionTag,
                relationScope: lifecycle.relationScope,
                encodeScore: encoding.totalScore,
                profileVersion: encoding.profileVersion,
            });
        } else if (recordKind === 'summary') {
            await db.summaries.update(recordKey, {
                salience: lifecycle.salience,
                strength: lifecycle.strength,
                decayStage: lifecycle.stage,
                rehearsalCount: lifecycle.rehearsalCount,
                lastRecalledAt: lifecycle.lastRecalledAt,
                emotionTag: lifecycle.emotionTag,
                relationScope: lifecycle.relationScope,
                encodeScore: encoding.totalScore,
                profileVersion: encoding.profileVersion,
            });
        }
        await this.persistOwnedMemoryToDb(lifecycle);
        if (lifecycle.memorySubtype === 'major_plot_event') {
            await this.applyMajorEventTrigger(state, lifecycle);
        }
        this.markDirty();
        return lifecycle;
    }

    /**
     * 功能：读取生命周期摘要。
     * 参数：
     *   limit：最大条数。
     * 返回：
     *   Promise<MemoryLifecycleState[]>：生命周期摘要。
     */
    async getMemoryLifecycleSummary(limit: number = 20): Promise<MemoryLifecycleState[]> {
        const state = await this.load();
        const lifecycleIndex = await this.hydrateLifecycleIndexFromDb(state);
        return Object.values(lifecycleIndex ?? {})
            .sort((left: MemoryLifecycleState, right: MemoryLifecycleState): number => {
                const weight = (stage: MemoryLifecycleState['stage']): number => {
                    if (stage === 'distorted') return 3;
                    if (stage === 'blur') return 2;
                    return 1;
                };
                const stageDelta = weight(right.stage) - weight(left.stage);
                if (stageDelta !== 0) {
                    return stageDelta;
                }
                return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            })
            .slice(0, Math.max(1, Math.floor(Number(limit || 20))));
    }

    /**
     * 功能：读取角色归属记忆摘要。
     * 参数：
     *   limit：最大条数。
     * 返回：
     *   Promise<OwnedMemoryState[]>：角色归属记忆列表。
     */
    async getOwnedMemoryStates(limit: number = 80): Promise<OwnedMemoryState[]> {
        const state = await this.load();
        await this.hydrateLifecycleIndexFromDb(state);
        return Object.values(state.ownedMemoryIndex ?? {})
            .sort((left: OwnedMemoryState, right: OwnedMemoryState): number => {
                if ((right.forgotten ? 1 : 0) !== (left.forgotten ? 1 : 0)) {
                    return Number(right.forgotten === true) - Number(left.forgotten === true);
                }
                const importanceDelta = Number(right.importance ?? 0) - Number(left.importance ?? 0);
                if (importanceDelta !== 0) {
                    return importanceDelta;
                }
                return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            })
            .slice(0, Math.max(1, Math.floor(Number(limit || 80))));
    }

    private async buildOwnedMemoryInferenceInput(
        state: MemoryOSChatState,
        recordKey: string,
        recordKind: MemoryLifecycleState['recordKind'],
        current?: Partial<MemoryLifecycleState>,
    ): Promise<OwnedMemoryInferenceInput> {
        const fallbackOwnerActorKey: string | null = normalizeMemoryText(state.semanticSeed?.identitySeed?.roleKey) || null;
        const factRow = recordKind === 'fact' ? await db.facts.get(recordKey) : null;
        const summaryRow = recordKind === 'summary' ? await db.summaries.get(recordKey) : null;
        const worldStateRow = recordKind === 'state' ? await db.world_state.get(`${this.chatKey}::${recordKey}`) : null;
        return {
            recordKey,
            recordKind,
            title: summaryRow?.title,
            text: recordKind === 'fact'
                ? (typeof factRow?.value === 'string' ? factRow.value : JSON.stringify(factRow?.value ?? ''))
                : recordKind === 'summary'
                    ? summaryRow?.content
                    : (typeof worldStateRow?.value === 'string' ? worldStateRow.value : JSON.stringify(worldStateRow?.value ?? '')),
            path: factRow?.path ?? worldStateRow?.path,
            factType: factRow?.type ?? summaryRow?.level,
            entityKind: factRow?.entity?.kind,
            entityId: factRow?.entity?.id,
            keywords: summaryRow?.keywords,
            value: factRow?.value ?? worldStateRow?.value,
            fallbackOwnerActorKey,
            current,
        };
    }

    private buildOwnedMemoryStateFromLifecycle(lifecycle: MemoryLifecycleState): OwnedMemoryState {
        return {
            recordKey: lifecycle.recordKey,
            ownerActorKey: lifecycle.ownerActorKey ?? null,
            recordKind: lifecycle.recordKind,
            memoryType: lifecycle.memoryType ?? 'other',
            memorySubtype: lifecycle.memorySubtype ?? 'other',
            sourceScope: lifecycle.sourceScope ?? 'system',
            importance: lifecycle.importance ?? lifecycle.salience,
            forgetProbability: lifecycle.forgetProbability ?? 0,
            forgotten: lifecycle.forgotten === true,
            forgottenAt: lifecycle.forgottenAt,
            forgottenReasonCodes: lifecycle.forgottenReasonCodes ?? [],
            lastForgetRollAt: lifecycle.lastForgetRollAt || undefined,
            reinforcedByEventIds: lifecycle.reinforcedByEventIds ?? [],
            invalidatedByEventIds: lifecycle.invalidatedByEventIds ?? [],
            roleBasedRetentionOverrides: lifecycle.perActorMetrics ?? {},
            updatedAt: lifecycle.updatedAt,
        };
    }

    private dedupeMemoryIds(values: string[]): string[] {
        return Array.from(new Set((Array.isArray(values) ? values : []).map((item: string): string => normalizeMemoryText(item)).filter(Boolean)));
    }

    private extractMemoryTopicTokens(input: OwnedMemoryInferenceInput): string[] {
        const rawText = [
            input.recordKey,
            input.title,
            input.text,
            input.path,
            input.factType,
            Array.isArray(input.keywords) ? input.keywords.join(' ') : '',
            typeof input.value === 'string' ? input.value : JSON.stringify(input.value ?? ''),
        ].join(' ');
        const stopWords = new Set(['record', 'summary', 'state', 'event', 'memory', 'fact', 'chat', 'current', 'scene', 'status', 'other']);
        return this.dedupeMemoryIds(
            normalizeMemoryText(rawText)
                .toLowerCase()
                .split(/[^a-z0-9\u4e00-\u9fa5]+/)
                .map((item: string): string => item.trim())
                .filter((item: string): boolean => item.length >= 2 && !stopWords.has(item)),
        ).slice(0, 24);
    }

    private computeMemoryTopicOverlap(left: string[], right: string[]): number {
        if (left.length <= 0 || right.length <= 0) {
            return 0;
        }
        const rightSet = new Set(right);
        return left.reduce((sum: number, item: string): number => sum + (rightSet.has(item) ? 1 : 0), 0);
    }

    private async persistLifecycleToDb(lifecycle: MemoryLifecycleState): Promise<void> {
        const sharedPatch = {
            salience: lifecycle.salience,
            strength: lifecycle.strength,
            decayStage: lifecycle.stage,
            rehearsalCount: lifecycle.rehearsalCount,
            lastRecalledAt: lifecycle.lastRecalledAt,
            emotionTag: lifecycle.emotionTag,
            relationScope: lifecycle.relationScope,
            ownerActorKey: lifecycle.ownerActorKey ?? null,
            memoryType: lifecycle.memoryType ?? 'other',
            memorySubtype: lifecycle.memorySubtype ?? 'other',
            sourceScope: lifecycle.sourceScope ?? 'system',
            importance: lifecycle.importance ?? lifecycle.salience,
            forgetProbability: lifecycle.forgetProbability ?? 0,
            forgotten: lifecycle.forgotten === true,
            forgottenAt: lifecycle.forgottenAt,
            forgottenReasonCodes: lifecycle.forgottenReasonCodes ?? [],
            lastForgetRollAt: lifecycle.lastForgetRollAt || undefined,
            reinforcedByEventIds: lifecycle.reinforcedByEventIds ?? [],
            invalidatedByEventIds: lifecycle.invalidatedByEventIds ?? [],
        };
        if (lifecycle.recordKind === 'fact') {
            await db.facts.update(lifecycle.recordKey, sharedPatch);
            return;
        }
        if (lifecycle.recordKind === 'summary') {
            await db.summaries.update(lifecycle.recordKey, sharedPatch);
        }
    }

    private async persistOwnedMemoryToDb(lifecycle: MemoryLifecycleState): Promise<void> {
        await this.persistLifecycleToDb(lifecycle);
        const normalizedKind = normalizeStrictVectorRecordKind(lifecycle.recordKind);
        if (normalizedKind) {
            await this.syncStrictVectorRecord(lifecycle.recordKey, normalizedKind, 'lifecycle_persist');
        }
    }

    private async applyMajorEventTrigger(state: MemoryOSChatState, eventLifecycle: MemoryLifecycleState): Promise<number> {
        if (eventLifecycle.memorySubtype !== 'major_plot_event') {
            return 0;
        }
        await this.hydrateLifecycleIndexFromDb(state);
        const profile = await this.getPersonaMemoryProfile() ?? DEFAULT_PERSONA_MEMORY_PROFILE;
        const eventInput = await this.buildOwnedMemoryInferenceInput(state, eventLifecycle.recordKey, eventLifecycle.recordKind, eventLifecycle);
        const eventTokens = this.extractMemoryTopicTokens(eventInput);
        const eventOwner = normalizeMemoryText(eventLifecycle.ownerActorKey);
        const eventRelationScope = normalizeMemoryText(eventLifecycle.relationScope);
        let affectedCount = 0;

        for (const targetLifecycle of Object.values(state.memoryLifecycleIndex ?? {})) {
            if (!targetLifecycle || targetLifecycle.recordKey === eventLifecycle.recordKey) {
                continue;
            }
            const targetInput = await this.buildOwnedMemoryInferenceInput(state, targetLifecycle.recordKey, targetLifecycle.recordKind, targetLifecycle);
            const targetTokens = this.extractMemoryTopicTokens(targetInput);
            const overlap = this.computeMemoryTopicOverlap(eventTokens, targetTokens);
            const sameOwner = Boolean(eventOwner) && eventOwner === normalizeMemoryText(targetLifecycle.ownerActorKey);
            const sameRelationScope = Boolean(eventRelationScope) && eventRelationScope === normalizeMemoryText(targetLifecycle.relationScope);
            const sameWorldLane = eventLifecycle.sourceScope === 'world' && targetLifecycle.sourceScope === 'world';
            if (overlap <= 0 && !sameOwner && !sameRelationScope && !sameWorldLane) {
                continue;
            }

            let action: 'reinforce' | 'blur' | 'overwrite' | null = null;
            if (sameRelationScope || targetLifecycle.memoryType === 'relationship' || ['bond', 'emotion_imprint', 'goal', 'promise'].includes(String(targetLifecycle.memorySubtype ?? ''))) {
                action = 'reinforce';
            } else if (['minor_event', 'conversation_event', 'temporary_status', 'rumor'].includes(String(targetLifecycle.memorySubtype ?? ''))) {
                action = 'overwrite';
            } else if (targetLifecycle.memoryType === 'event' || targetLifecycle.memoryType === 'world' || sameWorldLane) {
                action = 'blur';
            }
            if (!action) {
                continue;
            }

            const nextLifecycle: MemoryLifecycleState = {
                ...targetLifecycle,
                updatedAt: Date.now(),
                lastForgetRollAt: Date.now(),
            };
            if (action === 'reinforce') {
                nextLifecycle.rehearsalCount = Math.max(0, Number(nextLifecycle.rehearsalCount ?? 0)) + 2;
                nextLifecycle.strength = clamp01(Number(nextLifecycle.strength ?? 0) + 0.14 + overlap * 0.02);
                nextLifecycle.salience = clamp01(Number(nextLifecycle.salience ?? 0) + 0.16 + overlap * 0.02);
                nextLifecycle.importance = clamp01(Number(nextLifecycle.importance ?? nextLifecycle.salience ?? 0) + 0.12);
                nextLifecycle.forgetProbability = clamp01(Number(nextLifecycle.forgetProbability ?? 0) - 0.22);
                nextLifecycle.forgotten = false;
                nextLifecycle.forgottenAt = undefined;
                nextLifecycle.forgottenReasonCodes = [];
                nextLifecycle.stage = nextLifecycle.stage === 'distorted' ? 'blur' : 'clear';
                nextLifecycle.reinforcedByEventIds = this.dedupeMemoryIds([...(nextLifecycle.reinforcedByEventIds ?? []), eventLifecycle.recordKey]);
            } else if (action === 'blur') {
                nextLifecycle.forgetProbability = clamp01(Number(nextLifecycle.forgetProbability ?? 0) + 0.18 + Math.min(0.08, overlap * 0.02));
                nextLifecycle.stage = nextLifecycle.stage === 'distorted' ? 'distorted' : 'blur';
                nextLifecycle.invalidatedByEventIds = this.dedupeMemoryIds([...(nextLifecycle.invalidatedByEventIds ?? []), eventLifecycle.recordKey]);
            } else if (action === 'overwrite') {
                nextLifecycle.forgetProbability = clamp01(Number(nextLifecycle.forgetProbability ?? 0) + 0.3 + Math.min(0.1, overlap * 0.03));
                nextLifecycle.stage = 'distorted';
                nextLifecycle.invalidatedByEventIds = this.dedupeMemoryIds([...(nextLifecycle.invalidatedByEventIds ?? []), eventLifecycle.recordKey]);
            }

            const recomputeInput = await this.buildOwnedMemoryInferenceInput(state, nextLifecycle.recordKey, nextLifecycle.recordKind, nextLifecycle);
            const recomputedLifecycle = enrichLifecycleOwnedState(
                nextLifecycle,
                recomputeInput,
                this.resolvePersonaProfileForInference(state, recomputeInput),
            );
            state.memoryLifecycleIndex = {
                ...(state.memoryLifecycleIndex ?? {}),
                [recomputedLifecycle.recordKey]: recomputedLifecycle,
            };
            state.ownedMemoryIndex = {
                ...(state.ownedMemoryIndex ?? {}),
                [recomputedLifecycle.recordKey]: this.buildOwnedMemoryStateFromLifecycle(recomputedLifecycle),
            };
            await this.persistLifecycleToDb(recomputedLifecycle);
            affectedCount += 1;
        }
        if (affectedCount > 0) {
            this.markDirty();
        }
        return affectedCount;
    }

    /**
     * 功能：手动更新角色记忆层字段，并同步生命周期与持久化。
     * 参数：
     *   recordKey：记录键。
     *   patch：待修改字段。
     * 返回：
     *   Promise<OwnedMemoryState | null>：更新后的角色记忆状态。
     */
    async updateOwnedMemoryState(
        recordKey: string,
        patch: Partial<Pick<OwnedMemoryState, 'ownerActorKey' | 'memoryType' | 'memorySubtype' | 'sourceScope' | 'importance' | 'forgotten' | 'forgottenReasonCodes'>>,
    ): Promise<OwnedMemoryState | null> {
        const state = await this.load();
        await this.hydrateLifecycleIndexFromDb(state);
        const currentLifecycle = state.memoryLifecycleIndex?.[recordKey];
        if (!currentLifecycle) {
            return null;
        }
        const normalizedPatch = {
            ...patch,
            ownerActorKey: patch.ownerActorKey == null ? null : normalizeMemoryText(String(patch.ownerActorKey)),
            importance: patch.importance == null ? undefined : clamp01(Number(patch.importance)),
            forgottenReasonCodes: Array.isArray(patch.forgottenReasonCodes)
                ? patch.forgottenReasonCodes.map((item: string): string => normalizeMemoryText(item)).filter(Boolean)
                : undefined,
        };
        const inferenceInput = await this.buildOwnedMemoryInferenceInput(state, recordKey, currentLifecycle.recordKind, {
            ...currentLifecycle,
            ...normalizedPatch,
        });
        const nextLifecycle = enrichLifecycleOwnedState(
            { ...currentLifecycle, updatedAt: Date.now() },
            inferenceInput,
            this.resolvePersonaProfileForInference(state, inferenceInput),
        );
        if (normalizedPatch.ownerActorKey !== undefined) {
            nextLifecycle.ownerActorKey = normalizedPatch.ownerActorKey;
        }
        if (normalizedPatch.importance !== undefined) {
            nextLifecycle.importance = normalizedPatch.importance;
        }
        if (normalizedPatch.forgotten !== undefined) {
            nextLifecycle.forgotten = normalizedPatch.forgotten === true;
            nextLifecycle.forgottenAt = normalizedPatch.forgotten ? Date.now() : undefined;
            nextLifecycle.forgottenReasonCodes = normalizedPatch.forgotten
                ? (normalizedPatch.forgottenReasonCodes && normalizedPatch.forgottenReasonCodes.length > 0 ? normalizedPatch.forgottenReasonCodes : ['manual_mark_forgotten'])
                : (normalizedPatch.forgottenReasonCodes && normalizedPatch.forgottenReasonCodes.length > 0 ? normalizedPatch.forgottenReasonCodes : ['manual_restore']);
            nextLifecycle.forgetProbability = normalizedPatch.forgotten
                ? Math.max(0.92, Number(nextLifecycle.forgetProbability ?? 0))
                : Math.min(0.45, Number(nextLifecycle.forgetProbability ?? 0));
        } else if (normalizedPatch.forgottenReasonCodes) {
            nextLifecycle.forgottenReasonCodes = normalizedPatch.forgottenReasonCodes;
        }
        nextLifecycle.updatedAt = Date.now();
        nextLifecycle.perActorMetrics = this.buildPerActorRetentionMetrics(state, nextLifecycle, inferenceInput);
        state.memoryLifecycleIndex = {
            ...(state.memoryLifecycleIndex ?? {}),
            [recordKey]: nextLifecycle,
        };
        const nextOwned = this.buildOwnedMemoryStateFromLifecycle(nextLifecycle);
        state.ownedMemoryIndex = {
            ...(state.ownedMemoryIndex ?? {}),
            [recordKey]: nextOwned,
        };
        await this.persistOwnedMemoryToDb(nextLifecycle);
        if (nextLifecycle.memorySubtype === 'major_plot_event') {
            await this.applyMajorEventTrigger(state, nextLifecycle);
        }
        this.markDirty();
        return nextOwned;
    }

    /**
     * 功能：按当前画像和记录内容重新计算角色记忆遗忘状态。
     * 参数：
     *   recordKey：记录键。
     * 返回：
     *   Promise<OwnedMemoryState | null>：重算后的角色记忆状态。
     */
    async recomputeOwnedMemoryState(recordKey: string): Promise<OwnedMemoryState | null> {
        const state = await this.load();
        await this.hydrateLifecycleIndexFromDb(state);
        const currentLifecycle = state.memoryLifecycleIndex?.[recordKey];
        if (!currentLifecycle) {
            return null;
        }
        const inferenceInput = await this.buildOwnedMemoryInferenceInput(state, recordKey, currentLifecycle.recordKind, currentLifecycle);
        const nextLifecycle = enrichLifecycleOwnedState(
            { ...currentLifecycle, updatedAt: Date.now() },
            inferenceInput,
            this.resolvePersonaProfileForInference(state, inferenceInput),
        );
        nextLifecycle.updatedAt = Date.now();
        nextLifecycle.perActorMetrics = this.buildPerActorRetentionMetrics(state, nextLifecycle, inferenceInput);
        state.memoryLifecycleIndex = {
            ...(state.memoryLifecycleIndex ?? {}),
            [recordKey]: nextLifecycle,
        };
        const nextOwned = this.buildOwnedMemoryStateFromLifecycle(nextLifecycle);
        state.ownedMemoryIndex = {
            ...(state.ownedMemoryIndex ?? {}),
            [recordKey]: nextOwned,
        };
        await this.persistOwnedMemoryToDb(nextLifecycle);
        if (nextLifecycle.memorySubtype === 'major_plot_event') {
            await this.applyMajorEventTrigger(state, nextLifecycle);
        }
        this.markDirty();
        return nextOwned;
    }

    /**
     * 功能：记录召回日志，并同步更新复述次数。
     * 参数：
     *   entries：召回日志数组。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async recordRecallLog(entries: RecallLogEntry[]): Promise<void> {
        const state = await this.load();
        const retentionLimit = Math.max(40, Math.floor(Number(state.memoryTuningProfile?.recallRetentionLimit ?? DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit)));
        const previous = await this.hydrateRecallLogFromDb(state);
        const merged = [...entries, ...previous]
            .sort((left: RecallLogEntry, right: RecallLogEntry): number => Number(right.loggedAt ?? 0) - Number(left.loggedAt ?? 0))
            .reduce<RecallLogEntry[]>((result: RecallLogEntry[], item: RecallLogEntry): RecallLogEntry[] => {
                if (result.some((existing: RecallLogEntry): boolean => existing.recallId === item.recallId)) {
                    return result;
                }
                result.push(item);
                return result;
            }, [])
            .slice(0, retentionLimit);
        for (const entry of entries) {
            if (!entry.selected) {
                continue;
            }
            const previousLifecycle = state.memoryLifecycleIndex?.[entry.recordKey];
            const inferenceInput: OwnedMemoryInferenceInput = {
                recordKey: entry.recordKey,
                recordKind: entry.recordKind,
                title: entry.recordTitle,
                text: entry.query,
                fallbackOwnerActorKey: normalizeMemoryText(state.semanticSeed?.identitySeed?.roleKey) || null,
                current: previousLifecycle,
            };
            const nextLifecycle = enrichLifecycleOwnedState({
                ...buildLifecycleState(
                    entry.recordKey,
                    entry.recordKind,
                    previousLifecycle?.salience ?? 0.5,
                    previousLifecycle?.strength ?? 0.5,
                    this.resolvePersonaProfileForInference(state, inferenceInput),
                    previousLifecycle?.updatedAt ?? Date.now(),
                    Math.max(0, Number(previousLifecycle?.rehearsalCount ?? 0)) + 1,
                    entry.loggedAt,
                    previousLifecycle?.emotionTag ?? '',
                    previousLifecycle?.relationScope ?? '',
                ),
            }, inferenceInput, this.resolvePersonaProfileForInference(state, inferenceInput)) satisfies MemoryLifecycleState;
            nextLifecycle.perActorMetrics = this.buildPerActorRetentionMetrics(state, nextLifecycle, inferenceInput);
            state.memoryLifecycleIndex = {
                ...(state.memoryLifecycleIndex ?? {}),
                [entry.recordKey]: nextLifecycle,
            };
            state.ownedMemoryIndex = {
                ...(state.ownedMemoryIndex ?? {}),
                [entry.recordKey]: {
                    recordKey: entry.recordKey,
                    ownerActorKey: nextLifecycle.ownerActorKey ?? null,
                    recordKind: entry.recordKind,
                    memoryType: nextLifecycle.memoryType ?? 'other',
                    memorySubtype: nextLifecycle.memorySubtype ?? 'other',
                    sourceScope: nextLifecycle.sourceScope ?? 'system',
                    importance: nextLifecycle.importance ?? nextLifecycle.salience,
                    forgetProbability: nextLifecycle.forgetProbability ?? 0,
                    forgotten: nextLifecycle.forgotten === true,
                    forgottenAt: nextLifecycle.forgottenAt,
                    forgottenReasonCodes: nextLifecycle.forgottenReasonCodes ?? [],
                    lastForgetRollAt: nextLifecycle.lastForgetRollAt || undefined,
                    reinforcedByEventIds: nextLifecycle.reinforcedByEventIds ?? [],
                    invalidatedByEventIds: nextLifecycle.invalidatedByEventIds ?? [],
                    updatedAt: nextLifecycle.updatedAt,
                },
            };
            if (entry.recordKind === 'fact') {
                await db.facts.update(entry.recordKey, {
                    rehearsalCount: nextLifecycle.rehearsalCount,
                    lastRecalledAt: nextLifecycle.lastRecalledAt,
                    decayStage: nextLifecycle.stage,
                    strength: nextLifecycle.strength,
                    salience: nextLifecycle.salience,
                });
            } else if (entry.recordKind === 'summary') {
                await db.summaries.update(entry.recordKey, {
                    rehearsalCount: nextLifecycle.rehearsalCount,
                    lastRecalledAt: nextLifecycle.lastRecalledAt,
                    decayStage: nextLifecycle.stage,
                    strength: nextLifecycle.strength,
                    salience: nextLifecycle.salience,
                });
            }
        }
        await this.persistRecallRows(merged);
        this.markDirty();
    }

    /**
     * 功能：读取召回日志。
     * 参数：
     *   limit：最大条数。
     * 返回：
     *   Promise<RecallLogEntry[]>：召回日志列表。
     */
    async getRecallLog(limit: number = 40): Promise<RecallLogEntry[]> {
        const state = await this.load();
        const entries = await this.hydrateRecallLogFromDb(state);
        return entries.slice(0, Math.max(1, Math.floor(Number(limit || 40))));
    }

    /**
     * 功能：读取长期记忆的 mutation history。
     * @param opts 过滤条件。
     * @returns Promise<MemoryMutationHistoryEntry[]>：历史列表。
     */
    async getMutationHistory(opts: {
        limit?: number;
        recordKey?: string;
        targetKind?: MemoryMutationTargetKind;
        action?: MemoryMutationHistoryAction;
        sinceTs?: number;
    } = {}): Promise<MemoryMutationHistoryEntry[]> {
        const manager = new MemoryMutationHistoryManager(this.chatKey);
        return manager.list(opts);
    }

    /**
     * 功能：写入最近一轮召回解释快照。
     * @param explanation 最近一轮解释快照。
     * @returns Promise<void>：异步完成。
     */
    async setLatestRecallExplanation(explanation: LatestRecallExplanation | null): Promise<void> {
        const state = await this.load();
        state.latestRecallExplanation = normalizeLatestRecallExplanation(explanation);
        this.markDirty();
    }

    /**
     * 功能：读取最近一轮召回解释快照。
     * @returns Promise<LatestRecallExplanation | null>：解释快照。
     */
    async getLatestRecallExplanation(): Promise<LatestRecallExplanation | null> {
        const state = await this.load();
        state.latestRecallExplanation = normalizeLatestRecallExplanation(state.latestRecallExplanation ?? null);
        return state.latestRecallExplanation ?? null;
    }

    /**
     * 功能：读取关系状态列表。
     * 参数：
     *   无。
     * 返回：
     *   Promise<RelationshipState[]>：关系状态列表。
     */
    async getRelationshipState(): Promise<RelationshipState[]> {
        await this.load();
        const map = await this.hydrateRelationshipStateFromDb();
        if (Object.keys(map).length === 0) {
            return this.recomputeRelationshipState();
        }
        return Object.values(map).sort((left: RelationshipState, right: RelationshipState): number => {
            const weightDiff = computeRelationshipWeight(right) - computeRelationshipWeight(left);
            if (weightDiff !== 0) {
                return weightDiff;
            }
            return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
        });
    }

    /**
     * 功能：重算关系状态并双写到结构化表。
     * 参数：
     *   无。
     * 返回：
     *   Promise<RelationshipState[]>：重算后的关系状态。
     */
    async recomputeRelationshipState(): Promise<RelationshipState[]> {
        const state = await this.load();
        const selfActorKey = this.resolveSelfActorKey(state);
        const relationshipFacts = await db.facts
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .reverse()
            .limit(160)
            .toArray();
        const map = new Map<string, RelationshipState>();
        relationshipFacts.forEach((fact): void => {
            const typeText = normalizeMemoryText(fact.type).toLowerCase();
            const pathText = normalizeMemoryText(fact.path).toLowerCase();
            const summaryText = normalizeMemoryText(`${fact.type} ${fact.path ?? ''} ${JSON.stringify(fact.value ?? '')}`);
            if (!/relationship|relation|bond|trust|affection|conflict|关系|好感|信任|矛盾/.test(`${typeText} ${pathText} ${summaryText}`)) {
                return;
            }
            const targetKey = normalizeSeedText(fact.entity?.id) || 'user';
            const delta = this.inferRelationshipDelta(selfActorKey, targetKey, summaryText);
            if (!delta) {
                return;
            }
            const relationshipKey = `${selfActorKey}::${targetKey}`;
            const next = this.applyRelationshipDelta(map.get(relationshipKey) ?? null, delta);
            next.scope = 'self_target';
            next.participantKeys = [selfActorKey, targetKey].filter(Boolean);
            map.set(relationshipKey, next);
        });
        buildGroupRelationshipSeeds(selfActorKey, state.groupMemory ?? null).forEach((seed): void => {
            const delta = this.inferRelationshipDelta(seed.actorKey, seed.targetKey, seed.text);
            let next = map.get(seed.relationshipKey) ?? null;
            if (delta) {
                next = this.applyRelationshipDelta(next, delta);
            }
            if (seed.baseline > 0) {
                next = this.ensureRelationshipBaseline(
                    next,
                    seed.actorKey,
                    seed.targetKey,
                    seed.baseline,
                    seed.detail,
                );
            }
            if (!next) {
                return;
            }
            next.relationshipKey = seed.relationshipKey;
            next.scope = seed.scope;
            next.participantKeys = seed.participantKeys;
            map.set(seed.relationshipKey, next);
        });
        const values = Array.from(map.values())
            .sort((left: RelationshipState, right: RelationshipState): number => {
                const weightDiff = computeRelationshipWeight(right) - computeRelationshipWeight(left);
                if (weightDiff !== 0) {
                    return weightDiff;
                }
                return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
            })
            .slice(0, 48);
        await this.persistRelationshipRows(values);
        return values;
    }

    /**
     * 功能：读取当前记忆调参画像。
     * @returns Promise<MemoryTuningProfile>：调参画像。
     */
    async getMemoryTuningProfile(): Promise<MemoryTuningProfile> {
        const state = await this.load();
        state.memoryTuningProfile = normalizeMemoryTuningProfile(state.memoryTuningProfile ?? null);
        return state.memoryTuningProfile;
    }

    /**
     * 功能：更新记忆调参画像。
     * @param profile 调参补丁。
     * @returns Promise<MemoryTuningProfile>：更新后的调参画像。
     */
    async setMemoryTuningProfile(profile: Partial<MemoryTuningProfile>): Promise<MemoryTuningProfile> {
        const state = await this.load();
        state.memoryTuningProfile = normalizeMemoryTuningProfile(profile, state.memoryTuningProfile ?? null, Date.now());
        this.markDirty();
        return state.memoryTuningProfile;
    }

    /**
     * 功能：读取最近一次 lorebook 裁决结果。
     * 参数：
     *   无。
     * 返回：
     *   Promise<LorebookGateDecision | null>：裁决结果，不存在时返回 null。
     */
    async getLorebookDecision(): Promise<LorebookGateDecision | null> {
        const state = await this.load();
        return state.lastLorebookDecision ?? null;
    }

    /**
     * 功能：写入 lorebook 裁决结果并记录生命周期来源。
     * 参数：
     *   decision (LorebookGateDecision)：裁决结果。
     *   source (string)：来源标识。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setLorebookDecision(decision: LorebookGateDecision, source: string = 'injection'): Promise<void> {
        const state = await this.load();
        state.lastLorebookDecision = decision;
        await this.recordLifecycleMutation(state, [], `lorebook:${source}`);
        this.markDirty();
    }

    /**
     * 功能：加入摘要修正队列。
     * 参数：
     *   reason (string)：修正原因。
     *   lorebookMode (LorebookGateMode)：触发时的 lorebook 模式。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async enqueueSummaryFixTask(reason: string, lorebookMode: LorebookGateMode): Promise<void> {
        const state = await this.load();
        const queue = Array.isArray(state.summaryFixQueue) ? state.summaryFixQueue : [];
        const task: SummaryFixTask = {
            reason: normalizeSeedText(reason) || 'lorebook_decision_changed',
            lorebookMode,
            createdAt: Date.now(),
        };
        state.summaryFixQueue = [...queue, task].slice(-32);
        this.markDirty();
    }

    /**
     * 功能：读取摘要修正队列。
     * 参数：
     *   无。
     * 返回：
     *   Promise<SummaryFixTask[]>：摘要修正任务列表。
     */
    async getSummaryFixQueue(): Promise<SummaryFixTask[]> {
        const state = await this.load();
        state.summaryFixQueue = Array.isArray(state.summaryFixQueue) ? state.summaryFixQueue : [];
        return state.summaryFixQueue;
    }

    /**
     * 功能：读取群聊记忆状态。
     * 参数：
     *   无。
     * 返回：
     *   Promise<GroupMemoryState | null>：群聊记忆状态，不存在时返回 null。
     */
    async getGroupMemory(): Promise<GroupMemoryState | null> {
        const state = await this.load();
        if (state.groupMemory && state.logicalChatView) {
            const hasGenericAssistantLane = Array.isArray(state.groupMemory.lanes)
                && state.groupMemory.lanes.some((lane) => isGenericAssistantName(lane.displayName));
            const hasEmptyRecentMessageCounts = Array.isArray(state.groupMemory.lanes)
                && state.groupMemory.lanes.length > 0
                && state.groupMemory.lanes.every((lane) => Number(lane.recentMessageIds?.length ?? 0) === 0)
                && Array.isArray(state.logicalChatView.visibleMessages)
                && state.logicalChatView.visibleMessages.length > 0;
            if (hasGenericAssistantLane || hasEmptyRecentMessageCounts) {
                state.groupMemory = this.deriveGroupMemoryFromView(
                    state.logicalChatView,
                    state.groupMemory,
                    state.semanticSeed ?? null,
                );
                this.markDirty();
            }
        }
        return state.groupMemory ?? null;
    }

    /**
     * 功能：覆盖写入群聊记忆状态。
     * 参数：
     *   groupMemory (GroupMemoryState)：群聊记忆状态。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setGroupMemory(groupMemory: GroupMemoryState): Promise<void> {
        const state = await this.load();
        state.groupMemory = {
            ...DEFAULT_GROUP_MEMORY,
            ...(groupMemory ?? DEFAULT_GROUP_MEMORY),
            lanes: Array.isArray(groupMemory?.lanes) ? groupMemory.lanes : [],
            actorSalience: Array.isArray(groupMemory?.actorSalience) ? groupMemory.actorSalience : [],
            sharedScene: {
                ...DEFAULT_GROUP_MEMORY.sharedScene,
                ...(groupMemory?.sharedScene ?? {}),
            },
            bindingSnapshot: {
                ...DEFAULT_GROUP_MEMORY.bindingSnapshot,
                ...(groupMemory?.bindingSnapshot ?? {}),
                characterIds: Array.isArray(groupMemory?.bindingSnapshot?.characterIds) ? groupMemory.bindingSnapshot.characterIds : [],
                memberNames: Array.isArray(groupMemory?.bindingSnapshot?.memberNames) ? groupMemory.bindingSnapshot.memberNames : [],
            },
            updatedAt: Date.now(),
        };
        this.markDirty();
    }

    /**
     * 功能：读取当前聊天的楼层台账。
     * 参数：
     *   无。
     * 返回：
     *   Promise<TurnRecord[]>：楼层台账副本。
     */
    async getTurnLedger(): Promise<TurnRecord[]> {
        const state = await this.load();
        return Array.isArray(state.turnLedger) ? state.turnLedger : [];
    }

    /**
     * 功能：写入楼层台账。
     * 参数：
     *   turnLedger (TurnRecord[])：楼层记录数组。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setTurnLedger(turnLedger: TurnRecord[]): Promise<void> {
        const state = await this.load();
        state.turnLedger = Array.isArray(turnLedger) ? turnLedger : [];
        this.markDirty();
    }

    /**
     * 功能：读取聊天是否归档。
     * 参数：
     *   无。
     * 返回：
     *   Promise<boolean>：是否已归档。
     */
    async isChatArchived(): Promise<boolean> {
        const state = await this.load();
        return state.archived === true;
    }

    /**
     * 功能：将聊天标记为归档状态。
     * 参数：
     *   reason (string)：归档原因。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async archiveMemoryChat(reason: string = 'soft_delete'): Promise<void> {
        const state = await this.load();
        state.archived = true;
        state.archivedAt = Date.now();
        state.archiveReason = reason;
        await this.refreshLifecycleState(state, 'archive');
        this.markDirty();
    }

    /**
     * 功能：恢复归档聊天。
     * 参数：
     *   无。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async restoreArchivedMemoryChat(): Promise<void> {
        const state = await this.load();
        state.archived = false;
        state.archivedAt = undefined;
        state.archiveReason = undefined;
        await this.refreshLifecycleState(state, 'restore_archive');
        this.markDirty();
    }

    /**
     * 功能：记录角色绑定指纹变更。
     * 参数：
     *   fingerprint (string)：角色绑定指纹。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async setCharacterBindingFingerprint(fingerprint: string): Promise<void> {
        const state = await this.load();
        const previousFingerprint = normalizeSeedText(state.characterBindingFingerprint);
        const nextFingerprint = normalizeSeedText(fingerprint);
        state.characterBindingFingerprint = nextFingerprint || undefined;
        const [groupIdRaw, characterIdRaw] = String(fingerprint ?? '').split('|');
        const groupId = normalizeSeedText(groupIdRaw === '-' ? '' : groupIdRaw);
        const characterId = normalizeSeedText(characterIdRaw === '-' ? '' : characterIdRaw);
        state.groupMemory = {
            ...(state.groupMemory ?? DEFAULT_GROUP_MEMORY),
            bindingSnapshot: {
                ...(state.groupMemory?.bindingSnapshot ?? DEFAULT_GROUP_MEMORY.bindingSnapshot),
                groupId,
                characterIds: characterId ? [characterId] : [],
                updatedAt: Date.now(),
            },
            updatedAt: Date.now(),
        };
        if (previousFingerprint !== nextFingerprint) {
            logger.warn('[ColdStart][BindingFingerprintChanged]', {
                chatKey: this.chatKey,
                previousFingerprint,
                nextFingerprint,
                hadSelection: Array.isArray(state.coldStartLorebookSelection) || Array.isArray(state.coldStartLorebookEntrySelection),
                hadSeed: Boolean(state.semanticSeed),
                hadColdStartFingerprint: Boolean(state.coldStartFingerprint),
            });
            state.coldStartLorebookSelection = undefined;
            state.coldStartLorebookEntrySelection = undefined;
            state.coldStartSkipLorebookSelection = undefined;
            state.coldStartFingerprint = undefined;
            state.coldStartStage = undefined;
            state.coldStartPrimedAt = undefined;
            state.semanticSeed = undefined;
            state.personaMemoryProfile = undefined;
            state.personaMemoryProfiles = undefined;
            state.simpleMemoryPersona = undefined;
            state.simpleMemoryPersonas = undefined;
            state.activeActorKey = undefined;
            state.memoryLifecycleIndex = {};
            state.latestRecallExplanation = null;
            state.memoryTuningProfile = { ...DEFAULT_MEMORY_TUNING_PROFILE, updatedAt: Date.now() };
        }
        await this.recordLifecycleMutation(state, ['character_binding_changed'], 'character_binding');
        this.markDirty();
    }

    /**
     * 功能：读取行别名索引。
     * @returns 行别名索引。
     */
    async getRowAliasIndex(): Promise<RowAliasIndex> {
        const state = await this.load();
        state.rowAliasIndex = state.rowAliasIndex ?? {};
        return state.rowAliasIndex;
    }

    /**
     * 功能：设置行别名。
     * @param tableKey 表键。
     * @param alias 别名。
     * @param canonicalRowId 目标行 ID。
     * @returns 无返回值。
     */
    async setRowAlias(tableKey: string, alias: string, canonicalRowId: string): Promise<void> {
        const state = await this.load();
        state.rowAliasIndex = state.rowAliasIndex ?? {};
        state.rowAliasIndex[tableKey] = state.rowAliasIndex[tableKey] ?? {};
        state.rowAliasIndex[tableKey][alias] = canonicalRowId;
        this.markDirty();
    }

    /**
     * 功能：移除行别名。
     * @param tableKey 表键。
     * @param alias 别名。
     * @returns 无返回值。
     */
    async removeRowAlias(tableKey: string, alias: string): Promise<void> {
        const state = await this.load();
        if (state.rowAliasIndex?.[tableKey]) {
            delete state.rowAliasIndex[tableKey][alias];
            this.markDirty();
        }
    }

    /**
     * 功能：读取行重定向映射。
     * @returns 行重定向映射。
     */
    async getRowRedirects(): Promise<RowRedirects> {
        const state = await this.load();
        state.rowRedirects = state.rowRedirects ?? {};
        return state.rowRedirects;
    }

    /**
     * 功能：设置行重定向。
     * @param tableKey 表键。
     * @param fromRowId 来源行 ID。
     * @param toRowId 目标行 ID。
     * @returns 无返回值。
     */
    async setRowRedirect(tableKey: string, fromRowId: string, toRowId: string): Promise<void> {
        const state = await this.load();
        state.rowRedirects = state.rowRedirects ?? {};
        state.rowRedirects[tableKey] = state.rowRedirects[tableKey] ?? {};
        const finalTarget = state.rowRedirects[tableKey][toRowId] ?? toRowId;
        state.rowRedirects[tableKey][fromRowId] = finalTarget;
        for (const [sourceRowId, targetRowId] of Object.entries(state.rowRedirects[tableKey])) {
            if (targetRowId === fromRowId) {
                state.rowRedirects[tableKey][sourceRowId] = finalTarget;
            }
        }
        this.markDirty();
    }

    /**
     * 功能：读取行墓碑。
     * @returns 行墓碑映射。
     */
    async getRowTombstones(): Promise<RowTombstones> {
        const state = await this.load();
        state.rowTombstones = state.rowTombstones ?? {};
        return state.rowTombstones;
    }

    /**
     * 功能：添加行墓碑。
     * @param tableKey 表键。
     * @param rowId 行 ID。
     * @param deletedBy 删除来源。
     * @returns 无返回值。
     */
    async addRowTombstone(tableKey: string, rowId: string, deletedBy: string): Promise<void> {
        const state = await this.load();
        state.rowTombstones = state.rowTombstones ?? {};
        state.rowTombstones[tableKey] = state.rowTombstones[tableKey] ?? {};
        state.rowTombstones[tableKey][rowId] = {
            rowId,
            tableKey,
            deletedAt: Date.now(),
            deletedBy,
        };
        this.markDirty();
    }

    /**
     * 功能：移除行墓碑。
     * @param tableKey 表键。
     * @param rowId 行 ID。
     * @returns 无返回值。
     */
    async removeRowTombstone(tableKey: string, rowId: string): Promise<void> {
        const state = await this.load();
        if (state.rowTombstones?.[tableKey]) {
            delete state.rowTombstones[tableKey][rowId];
            this.markDirty();
        }
    }

    /**
     * 功能：判断行是否已被软删除。
     * @param tableKey 表键。
     * @param rowId 行 ID。
     * @returns 是否已软删除。
     */
    async isRowTombstoned(tableKey: string, rowId: string): Promise<boolean> {
        const tombstones = await this.getRowTombstones();
        return Boolean(tombstones[tableKey]?.[rowId]);
    }

    /**
     * 功能：根据逻辑消息视图推导群聊车道、共享场景与角色显著度。
     * 参数：
     *   view (LogicalChatView)：逻辑消息视图。
     *   previous (GroupMemoryState)：上一版群聊记忆。
     * 返回：
     *   GroupMemoryState：更新后的群聊记忆状态。
     */
    private deriveGroupMemoryFromView(
        view: LogicalChatView,
        previous: GroupMemoryState,
        semanticSeed?: ChatSemanticSeed | null,
    ): GroupMemoryState {
        const base = {
            ...DEFAULT_GROUP_MEMORY,
            ...(previous ?? DEFAULT_GROUP_MEMORY),
        };
        const laneMap = new Map<string, GroupMemoryState['lanes'][number]>();
        for (const lane of base.lanes ?? []) {
            laneMap.set(lane.actorKey, {
                ...lane,
                recentMessageIds: Array.isArray(lane.recentMessageIds) ? lane.recentMessageIds.slice(-8) : [],
            });
        }

        const recent = view.visibleMessages.slice(Math.max(0, view.visibleMessages.length - 40));
        const mentions = new Map<string, number>();
        const actorMessageCount = new Map<string, number>();
        for (const node of recent) {
            const actor = guessActorFromMessage(node, base, semanticSeed);
            const existing = laneMap.get(actor.actorKey);
            const nextLane = {
                laneId: existing?.laneId ?? crypto.randomUUID(),
                actorKey: actor.actorKey,
                displayName: actor.displayName || existing?.displayName || actor.actorKey,
                identityHint: actor.identityHint || existing?.identityHint || '',
                lastStyle: inferLaneStyle(node.text) || existing?.lastStyle || '',
                lastEmotion: inferLaneEmotion(node.text) || existing?.lastEmotion || '',
                recentGoal: inferLaneGoal(node.text) || existing?.recentGoal || '',
                relationshipDelta: inferRelationshipDelta(node.text) || existing?.relationshipDelta || '',
                lastActiveAt: Number(node.updatedAt ?? node.createdAt ?? Date.now()),
                recentMessageIds: Array.from(
                    new Set(
                        [
                            ...(existing?.recentMessageIds ?? []),
                            buildGroupLaneRecentMessageId(node),
                        ].filter(Boolean),
                    ),
                ).slice(-8),
            };
            laneMap.set(actor.actorKey, nextLane);
            actorMessageCount.set(actor.actorKey, Number(actorMessageCount.get(actor.actorKey) ?? 0) + 1);

            const text = normalizeSeedText(node.text);
            const speakerPattern = /([A-Za-z0-9_\u4e00-\u9fa5]{2,24})/g;
            const matched = text.match(speakerPattern) ?? [];
            for (const token of matched.slice(0, 8)) {
                const lowered = token.toLowerCase();
                if (!lowered || lowered === actor.displayName.toLowerCase()) {
                    continue;
                }
                mentions.set(lowered, Number(mentions.get(lowered) ?? 0) + 1);
            }
        }

        const lanes = Array.from(laneMap.values())
            .sort((left, right): number => Number(right.lastActiveAt ?? 0) - Number(left.lastActiveAt ?? 0))
            .filter((lane) => {
                if (!isGenericAssistantName(lane.displayName)) {
                    return true;
                }
                return actorMessageCount.has(lane.actorKey);
            })
            .slice(0, 24);

        const latestText = normalizeSeedText(recent.slice(-1)[0]?.text ?? '');
        const sceneMatch = latestText.match(/在([^。！？!?]{2,24})/);
        const conflictMatch = latestText.match(/(冲突|争执|战斗|分歧|危机|任务|调查)([^。！？!?]{0,30})/);
        const pendingMatches = recent
            .map((node) => normalizeSeedText(node.text))
            .filter((text) => /待办|稍后|之后|下一步|计划|准备/.test(text))
            .slice(-6);
        const consensusMatches = recent
            .map((node) => normalizeSeedText(node.text))
            .filter((text) => /一致|同意|决定|达成|共识/.test(text))
            .slice(-6);
        const participantActorKeys = Array.from(actorMessageCount.entries())
            .sort((left, right) => right[1] - left[1])
            .slice(0, 8)
            .map((item) => item[0]);

        const sharedScene = {
            ...base.sharedScene,
            currentScene: normalizeSeedText(sceneMatch?.[1] ?? base.sharedScene.currentScene),
            currentConflict: normalizeSeedText(conflictMatch?.[0] ?? base.sharedScene.currentConflict),
            groupConsensus: Array.from(new Set([...(base.sharedScene.groupConsensus ?? []), ...consensusMatches])).slice(-8),
            pendingEvents: Array.from(new Set([...(base.sharedScene.pendingEvents ?? []), ...pendingMatches])).slice(-10),
            participantActorKeys,
            updatedAt: Date.now(),
        };

        const actorSalience = lanes
            .map((lane) => {
                const msgCount = Number(actorMessageCount.get(lane.actorKey) ?? 0);
                const mentionCount = Number(mentions.get(lane.displayName.toLowerCase()) ?? 0);
                const goalBonus = lane.recentGoal ? 0.12 : 0;
                const conflictBonus = sharedScene.currentConflict && normalizeSeedText(sharedScene.currentConflict).includes(lane.displayName)
                    ? 0.12
                    : 0;
                const reasonCodes: string[] = [];
                if (msgCount > 0) {
                    reasonCodes.push('recent_messages');
                }
                if (mentionCount > 0) {
                    reasonCodes.push('mentioned_recently');
                }
                if (goalBonus > 0) {
                    reasonCodes.push('goal_pending');
                }
                if (conflictBonus > 0) {
                    reasonCodes.push('conflict_related');
                }
                const score = clamp01(
                    Math.min(0.48, msgCount * 0.08)
                    + Math.min(0.28, mentionCount * 0.06)
                    + goalBonus
                    + conflictBonus,
                );
                return {
                    actorKey: lane.actorKey,
                    score,
                    reasonCodes,
                    updatedAt: Date.now(),
                };
            })
            .sort((left, right): number => right.score - left.score)
            .slice(0, 16);

        return {
            ...base,
            lanes,
            sharedScene,
            actorSalience,
            updatedAt: Date.now(),
        };
    }

    /**
     * 功能：读取最近一条摘要时间。
     * @returns 最近摘要时间戳。
     */
    private async getLatestSummaryAt(): Promise<number> {
        const latestSummary = await db.summaries
            .where('[chatKey+level+createdAt]')
            .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
            .last();
        return Number(latestSummary?.createdAt ?? 0);
    }

    /**
     * 功能：计算孤儿事实比例。
     * @returns 孤儿事实比例。
     */
    private async computeOrphanFactsRatio(): Promise<number> {
        const facts = await db.facts
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
            .reverse()
            .limit(200)
            .toArray();
        if (facts.length === 0) {
            return 0;
        }
        const redirects = (this.cache?.rowRedirects ?? {}) as RowRedirects;
        const tombstones = (this.cache?.rowTombstones ?? {}) as RowTombstones;
        let orphanFacts = 0;
        for (const fact of facts) {
            const entityKind = String(fact.entity?.kind ?? '').trim();
            const entityId = String(fact.entity?.id ?? '').trim();
            const path = String(fact.path ?? '').trim();
            if (!entityKind || !entityId || !path) {
                orphanFacts += 1;
                continue;
            }
            if (tombstones[entityKind]?.[entityId]) {
                orphanFacts += 1;
                continue;
            }
            const redirectedTo = redirects[entityKind]?.[entityId];
            if (redirectedTo && tombstones[entityKind]?.[redirectedTo]) {
                orphanFacts += 1;
            }
        }
        return orphanFacts / facts.length;
    }

    /**
     * 功能：基于孤儿比例与 schema 状态计算卫生度。
     * @param orphanFactsRatio 孤儿事实比例。
     * @returns schema 卫生度。
     */
    private computeSchemaHygiene(orphanFactsRatio: number): number {
        const state = this.cache ?? this.normalizeState({});
        const redirectCount = Object.values(state.rowRedirects ?? {}).reduce(
            (count: number, tableMap): number => count + Object.keys(tableMap ?? {}).length,
            0,
        );
        const tombstoneCount = Object.values(state.rowTombstones ?? {}).reduce(
            (count: number, tableMap): number => count + Object.keys(tableMap ?? {}).length,
            0,
        );
        const draftPenalty = state.schemaDraftSession?.draftRevisionId ? 0.15 : 0;
        const hygiene = 1 - Math.min(0.8, orphanFactsRatio * 0.6 + redirectCount * 0.01 + tombstoneCount * 0.008 + draftPenalty);
        return Math.max(0, Math.min(1, hygiene));
    }
}

import Dexie from 'dexie';
