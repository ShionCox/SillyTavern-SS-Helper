import { readSdkPluginChatState, writeSdkPluginChatState } from '../../../SDK/db';
import { db } from '../db/db';
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
    EffectivePresetBundle,
    ChatSemanticSeed,
    ChatMutationKind,
    ChatProfile,
    ExtractHealthWindow,
    GroupMemoryState,
    IngestHealthWindow,
    LorebookGateDecision,
    LorebookGateMode,
    LogicalChatView,
    MaintenanceActionType,
    MaintenanceAdvice,
    MaintenanceExecutionResult,
    MaintenanceInsight,
    ManualOverrides,
    MemoryOSChatState,
    MemoryQualityScorecard,
    PostGenerationGateDecision,
    PreGenerationGateDecision,
    PromptInjectionProfile,
    RetentionArchives,
    RetentionPolicy,
    RetrievalHealthWindow,
    RowAliasIndex,
    RowRedirects,
    TurnRecord,
    RowTombstones,
    SchemaDraftSession,
    StrategyDecision,
    SummaryFixTask,
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
    DEFAULT_PROMPT_INJECTION_PROFILE,
    DEFAULT_RETENTION_ARCHIVES,
    DEFAULT_RETRIEVAL_HEALTH,
    DEFAULT_SCHEMA_DRAFT_SESSION,
    DEFAULT_USER_FACING_CHAT_PRESET,
    DEFAULT_VECTOR_LIFECYCLE,
} from '../types';
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
import { SummariesManager } from './summaries-manager';
import { VectorManager } from '../vector/vector-manager';

const logger = new Logger('ChatStateManager');

function averagePrecisionWindow(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }
    return values.reduce((sum: number, value: number): number => sum + Number(value || 0), 0) / values.length;
}

function normalizeSeedText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inferLaneStyle(text: string): string {
    const normalized = normalizeSeedText(text);
    if (!normalized) {
        return '';
    }
    if (/怎么|如何|步骤|配置|命令|修复|why|how/i.test(normalized)) {
        return 'tool_like';
    }
    if (/设定|世界观|规则|百科|资料/.test(normalized)) {
        return 'setting_explain';
    }
    if (normalized.length >= 120) {
        return 'narrative';
    }
    if (/^\s*["“”'「」]/.test(normalized) || /（.*）|\(.*\)/.test(normalized)) {
        return 'rp_dialog';
    }
    return 'chat';
}

function inferLaneEmotion(text: string): string {
    const normalized = normalizeSeedText(text);
    if (!normalized) {
        return '';
    }
    if (/生气|愤怒|怒|恼火|敌意/.test(normalized)) {
        return 'angry';
    }
    if (/开心|高兴|喜悦|兴奋|轻松/.test(normalized)) {
        return 'happy';
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

function inferRelationshipDelta(text: string): string {
    const normalized = normalizeSeedText(text);
    const hints = ['盟友', '敌人', '同伴', '队友', '恋人', '仇人', '上级', '下属', '家人'];
    const hit = hints.find((hint: string): boolean => normalized.includes(hint));
    return hit ?? '';
}

function guessActorFromMessage(
    node: LogicalChatView['visibleMessages'][number],
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
        return {
            actorKey: actorKeyFromId || 'role:assistant',
            displayName: speaker || 'Assistant',
            identityHint: actorKeyFromId || 'role_anchor',
        };
    }
    return {
        actorKey: actorKeyFromId || 'role:system',
        displayName: 'System',
        identityHint: actorKeyFromId || 'role_anchor',
    };
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

    constructor(chatKey: string) {
        this.chatKey = chatKey;
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
            revectorize: '重建索引',
            schema_cleanup: '整理设定',
            group_maintenance: '群聊维护',
        };
        const shortLabelMap: Record<MaintenanceActionType, string> = {
            compress: '记忆过载',
            rebuild_summary: '摘要老化',
            revectorize: '向量命中偏低',
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
                detail: item.detail,
                shortLabel: shortLabelMap[item.action] ?? item.title,
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
            this.cache = this.normalizeState(raw);
            await this.refreshLifecycleState(this.cache, 'load');
            if (!Array.isArray(this.cache.maintenanceInsights) || this.cache.maintenanceInsights.length === 0) {
                this.cache.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(this.cache.maintenanceAdvice ?? [], this.cache);
            }
            return this.cache;
        } catch (error) {
            logger.warn('加载聊天状态失败，已回退默认值', error);
            this.cache = this.normalizeState({});
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
            logicalChatView: state.logicalChatView ?? undefined,
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
            coldStartFingerprint: typeof state.coldStartFingerprint === 'string'
                ? state.coldStartFingerprint
                : undefined,
            lastLorebookDecision: state.lastLorebookDecision ?? undefined,
            promptInjectionProfile: {
                ...DEFAULT_PROMPT_INJECTION_PROFILE,
                ...(state.promptInjectionProfile ?? {}),
                fallbackOrder: Array.isArray(state.promptInjectionProfile?.fallbackOrder)
                    ? state.promptInjectionProfile!.fallbackOrder
                    : [...DEFAULT_PROMPT_INJECTION_PROFILE.fallbackOrder],
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
            summaryFixQueue: Array.isArray(state.summaryFixQueue) ? state.summaryFixQueue : [],
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
            manualOverrides,
            lastStrategyDecision: state.lastStrategyDecision ?? null,
        };
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
        const inferred = inferChatProfile({
            profile: state.chatProfile,
            metrics: state.adaptiveMetrics,
        });
        state.chatProfile = inferred;
        const presetBundle = this.getEffectivePresetBundleFromState(state);
        const presetAware = applyChatProfileOverrides(inferred, {
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
    async updateAdaptiveMetrics(patch: Partial<AdaptiveMetrics>): Promise<AdaptiveMetrics> {
        const state = await this.load();
        state.adaptiveMetrics = {
            ...DEFAULT_ADAPTIVE_METRICS,
            ...(state.adaptiveMetrics ?? {}),
            ...(patch ?? {}),
            lastUpdatedAt: Date.now(),
        };
        state.chatProfile = await this.getChatProfile();
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
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
        const profile = await this.getChatProfile();
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
            fallbackOrder: Array.isArray(manualProfile?.fallbackOrder) && manualProfile.fallbackOrder.length > 0
                ? manualProfile.fallbackOrder
                : Array.isArray(state.promptInjectionProfile?.fallbackOrder) && state.promptInjectionProfile.fallbackOrder.length > 0
                    ? state.promptInjectionProfile.fallbackOrder
                    : presetBundle.effectivePromptInjection.fallbackOrder,
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
            fallbackOrder: Array.isArray(profile?.fallbackOrder) && profile.fallbackOrder.length > 0
                ? profile.fallbackOrder
                : Array.isArray(state.promptInjectionProfile?.fallbackOrder) && state.promptInjectionProfile.fallbackOrder.length > 0
                    ? state.promptInjectionProfile.fallbackOrder
                    : [...DEFAULT_PROMPT_INJECTION_PROFILE.fallbackOrder],
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
                const summariesManager = new SummariesManager(this.chatKey);
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
                    await summariesManager.upsert({
                        level: 'scene',
                        title: '维护重建摘要',
                        content: sourceLines.slice(0, 16).join('\n'),
                        source: { extractor: 'maintenance' },
                    });
                    touchedCounts.summariesCreated = 1;
                }
                state.summaryFixQueue = [];
            } else if (action === 'revectorize') {
                const vectorManager = new VectorManager(this.chatKey);
                await vectorManager.clear();
                const [facts, summaries] = await Promise.all([
                    db.facts
                        .where('[chatKey+updatedAt]')
                        .between([this.chatKey, Dexie.minKey], [this.chatKey, Dexie.maxKey])
                        .reverse()
                        .limit(180)
                        .toArray(),
                    db.summaries
                        .where('[chatKey+level+createdAt]')
                        .between([this.chatKey, Dexie.minKey, Dexie.minKey], [this.chatKey, Dexie.maxKey, Dexie.maxKey])
                        .reverse()
                        .limit(80)
                        .toArray(),
                ]);
                let rebuilt = 0;
                for (const fact of facts) {
                    const text = normalizeSeedText(`${fact.type} ${fact.path} ${JSON.stringify(fact.value ?? '')}`);
                    if (!text) {
                        continue;
                    }
                    const chunkIds = await vectorManager.indexText(text, 'facts');
                    rebuilt += chunkIds.length;
                }
                for (const summary of summaries) {
                    const text = normalizeSeedText(`${summary.title ?? ''}\n${summary.content ?? ''}`);
                    if (!text) {
                        continue;
                    }
                    const chunkIds = await vectorManager.indexText(text, 'summaries');
                    rebuilt += chunkIds.length;
                }
                touchedCounts.vectorChunksRebuilt = rebuilt;
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
                    state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory ?? DEFAULT_GROUP_MEMORY);
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
                message: '维护动作已完成',
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
    /**
     * 功能：写入兼容旧接口的摘要策略覆盖。
     * @param override 摘要策略覆盖项。
     * @returns 无返回值。
     */
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
        state.logicalChatView = view;
        await this.recordLifecycleMutation(
            state,
            Array.isArray(view.mutationKinds) ? view.mutationKinds : [],
            mutationSource,
        );
        const effectivePolicy = await this.getAdaptivePolicy();
        if (effectivePolicy.groupLaneEnabled !== false) {
            state.groupMemory = this.deriveGroupMemoryFromView(view, state.groupMemory ?? DEFAULT_GROUP_MEMORY);
        }
        state.maintenanceInsights = this.buildMaintenanceInsightsFromAdvice(state.maintenanceAdvice ?? [], state);
        await this.refreshLifecycleState(state, 'logical_view');
        this.markDirty();
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
        state.coldStartFingerprint = normalizeSeedText(fingerprint) || undefined;

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
        state.adaptivePolicy = await this.recomputeAdaptivePolicy();
        this.markDirty();
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
        state.characterBindingFingerprint = String(fingerprint ?? '').trim() || undefined;
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
    private deriveGroupMemoryFromView(view: LogicalChatView, previous: GroupMemoryState): GroupMemoryState {
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
            const actor = guessActorFromMessage(node);
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
                recentMessageIds: Array.from(new Set([...(existing?.recentMessageIds ?? []), normalizeSeedText(node.messageId)].filter(Boolean))).slice(-8),
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
                const recency = Math.max(0, 1 - ((Date.now() - Number(lane.lastActiveAt ?? 0)) / (1000 * 60 * 60 * 12)));
                const score = Math.max(0, Math.min(1, msgCount * 0.12 + mentionCount * 0.04 + goalBonus + conflictBonus + recency * 0.24));
                const reasonCodes: string[] = [];
                if (msgCount > 0) {
                    reasonCodes.push('recent_speaker');
                }
                if (mentionCount > 0) {
                    reasonCodes.push('mentioned');
                }
                if (goalBonus > 0) {
                    reasonCodes.push('goal_pending');
                }
                if (conflictBonus > 0) {
                    reasonCodes.push('conflict_related');
                }
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
