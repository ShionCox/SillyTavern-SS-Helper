import { readSdkPluginChatState, writeSdkPluginChatState } from '../../../SDK/db';
import { db } from '../db/db';
import { Logger } from '../../../SDK/logger';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    AssistantTurnTracker,
    AutoSchemaPolicy,
    ChatProfile,
    ExtractHealthWindow,
    IngestHealthWindow,
    MaintenanceAdvice,
    ManualOverrides,
    MemoryOSChatState,
    MemoryQualityScorecard,
    RetentionArchives,
    RetentionPolicy,
    RetrievalHealthWindow,
    RowAliasIndex,
    RowRedirects,
    RowTombstones,
    SchemaDraftSession,
    StrategyDecision,
    SummaryPolicyOverride,
    VectorLifecycleState,
} from '../types';
import {
    DEFAULT_ADAPTIVE_METRICS,
    DEFAULT_ASSISTANT_TURN_TRACKER,
    DEFAULT_AUTO_SCHEMA_POLICY,
    DEFAULT_CHAT_PROFILE,
    DEFAULT_EXTRACT_HEALTH,
    DEFAULT_INGEST_HEALTH,
    DEFAULT_MEMORY_QUALITY,
    DEFAULT_RETENTION_ARCHIVES,
    DEFAULT_RETRIEVAL_HEALTH,
    DEFAULT_SCHEMA_DRAFT_SESSION,
    DEFAULT_SUMMARY_POLICY,
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

const logger = new Logger('ChatStateManager');

function averagePrecisionWindow(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }
    return values.reduce((sum: number, value: number): number => sum + Number(value || 0), 0) / values.length;
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
            return this.cache;
        } catch (error) {
            logger.warn('加载聊天状态失败，已回退默认值', error);
            this.cache = this.normalizeState({});
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
            summaryPolicyOverride: {
                ...state.summaryPolicyOverride,
            },
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
        return applyChatProfileOverrides(inferred, state.manualOverrides);
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
        return applyAdaptivePolicyOverrides(
            state.adaptivePolicy ?? buildAdaptivePolicy(
                await this.getChatProfile(),
                await this.getAdaptiveMetrics(),
                await this.getVectorLifecycle(),
                await this.getMemoryQuality(),
            ),
            state.manualOverrides,
        );
    }

    /**
     * 功能：根据当前画像与指标重算自适应策略。
     * @returns 重算后的策略。
     */
    async recomputeAdaptivePolicy(): Promise<AdaptivePolicy> {
        const state = await this.load();
        const profile = await this.getChatProfile();
        const metrics = await this.getAdaptiveMetrics();
        const vectorLifecycle = await this.getVectorLifecycle();
        const memoryQuality = await this.getMemoryQuality();
        state.adaptivePolicy = buildAdaptivePolicy(profile, metrics, vectorLifecycle, memoryQuality);
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
        const base = buildRetentionPolicy(profile);
        state.retentionPolicy = applyRetentionPolicyOverrides(
            {
                ...base,
                ...(state.retentionPolicy ?? {}),
            },
            { retentionPolicy: {} },
        );
        return applyRetentionPolicyOverrides(state.retentionPolicy, state.manualOverrides);
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
        state.maintenanceAdvice = buildMaintenanceAdvice({
            metrics: nextMetrics,
            quality,
            vectorLifecycle,
        });
        state.adaptivePolicy = buildAdaptivePolicy(await this.getChatProfile(), nextMetrics, vectorLifecycle, quality);
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
    async getSummaryPolicy(): Promise<Required<SummaryPolicyOverride>> {
        const state = await this.load();
        const adaptivePolicy = await this.getAdaptivePolicy();
        return {
            ...DEFAULT_SUMMARY_POLICY,
            ...(state.summaryPolicyOverride ?? {}),
            enabled: adaptivePolicy.summaryEnabled,
            interval: adaptivePolicy.extractInterval,
            windowSize: adaptivePolicy.extractWindowSize,
        };
    }

    /**
     * 功能：写入兼容旧接口的摘要策略覆盖。
     * @param override 摘要策略覆盖项。
     * @returns 无返回值。
     */
    async setSummaryPolicyOverride(override: Partial<SummaryPolicyOverride>): Promise<void> {
        const state = await this.load();
        state.summaryPolicyOverride = {
            ...(state.summaryPolicyOverride ?? {}),
            ...(override ?? {}),
        };
        state.manualOverrides = {
            ...(state.manualOverrides ?? {}),
            adaptivePolicy: {
                ...(state.manualOverrides?.adaptivePolicy ?? {}),
                summaryEnabled: override.enabled ?? state.manualOverrides?.adaptivePolicy?.summaryEnabled,
                extractInterval: override.interval ?? state.manualOverrides?.adaptivePolicy?.extractInterval,
                extractWindowSize: override.windowSize ?? state.manualOverrides?.adaptivePolicy?.extractWindowSize,
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
