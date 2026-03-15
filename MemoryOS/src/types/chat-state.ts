/**
 * 功能：定义聊天级 MemoryOS 状态、聊天画像、自适应指标与策略类型。
 * 参数：无。
 * 返回：无。
 */

export type ChatType = 'solo' | 'group' | 'worldbook' | 'tool';

export type StylePreference = 'story' | 'qa' | 'trpg' | 'info';

export type MemoryStrength = 'low' | 'medium' | 'high';

export type ExtractStrategy = 'facts_only' | 'facts_relations' | 'facts_relations_world';

export type SummaryStrategy = 'short' | 'layered' | 'timeline';

export type DeletionStrategy = 'soft_delete' | 'immediate_purge';

export type InjectionIntent = 'setting_qa' | 'story_continue' | 'roleplay' | 'tool_qa' | 'auto';

export type InjectionSectionName =
    | 'WORLD_STATE'
    | 'FACTS'
    | 'EVENTS'
    | 'SUMMARY'
    | 'CHARACTER_FACTS'
    | 'RELATIONSHIPS'
    | 'LAST_SCENE'
    | 'SHORT_SUMMARY';

export type EntityResolutionLevel = 'low' | 'medium' | 'high';

export type SpeakerTrackingLevel = 'low' | 'medium' | 'high';

export interface SummaryPolicyOverride {
    enabled?: boolean;
    floorUnit?: 'assistant_reply';
    interval?: number;
    windowSize?: number;
    allowAutoSchemaExpansion?: boolean;
}

/**
 * 功能：描述聊天画像中的向量策略。
 * @param enabled 是否启用向量。
 * @param chunkThreshold 触发向量索引的最小文本长度阈值。
 * @param rerankThreshold 触发重排的候选数量阈值。
 * @returns 向量策略对象。
 */
export interface ChatProfileVectorStrategy {
    enabled: boolean;
    chunkThreshold: number;
    rerankThreshold: number;
    activationFacts: number;
    activationSummaries: number;
    idleDecayDays: number;
    lowPrecisionSearchStride: number;
}

/**
 * 功能：描述每个聊天的画像配置。
 * @param chatType 聊天类型。
 * @param stylePreference 风格偏好。
 * @param memoryStrength 记忆强度。
 * @param extractStrategy 抽取策略。
 * @param summaryStrategy 摘要策略。
 * @param vectorStrategy 向量策略。
 * @param deletionStrategy 删除策略。
 * @returns 聊天画像对象。
 */
export interface ChatProfile {
    chatType: ChatType;
    stylePreference: StylePreference;
    memoryStrength: MemoryStrength;
    extractStrategy: ExtractStrategy;
    summaryStrategy: SummaryStrategy;
    vectorStrategy: ChatProfileVectorStrategy;
    deletionStrategy: DeletionStrategy;
}

export interface ChatProfileOverride extends Partial<Omit<ChatProfile, 'vectorStrategy'>> {
    vectorStrategy?: Partial<ChatProfileVectorStrategy>;
}

/**
 * 功能：记录聊天的动态指标。
 * @param windowSize 滑动窗口大小。
 * @param avgMessageLength 最近窗口平均消息长度。
 * @param assistantLongMessageRatio 助手长文比例。
 * @param userInfoDensity 用户信息密度。
 * @param repeatedTopicRate 重复主题率。
 * @param factsHitRate 事实命中率。
 * @param factsUpdateRate 事实更新率。
 * @param retrievalHitRate 检索命中率。
 * @param promptInjectionTokenRatio 注入 token 占比。
 * @param summaryEffectiveness 被引用摘要有效率。
 * @param recentUserTurns 最近窗口中的用户消息数。
 * @param recentAssistantTurns 最近窗口中的助手消息数。
 * @param recentGroupSpeakerCount 最近窗口中参与发言人数估计。
 * @param worldStateSignal 世界设定权重信号。
 * @param lastUpdatedAt 指标最近更新时间。
 * @returns 动态指标对象。
 */
export interface AdaptiveMetrics {
    windowSize: number;
    avgMessageLength: number;
    assistantLongMessageRatio: number;
    userInfoDensity: number;
    repeatedTopicRate: number;
    factsHitRate: number;
    factsUpdateRate: number;
    retrievalHitRate: number;
    promptInjectionTokenRatio: number;
    summaryEffectiveness: number;
    recentUserTurns: number;
    recentAssistantTurns: number;
    recentGroupSpeakerCount: number;
    worldStateSignal: number;
    duplicateRate: number;
    retrievalPrecision: number;
    extractAcceptance: number;
    summaryStaleness: number;
    tokenEfficiency: number;
    orphanFactsRatio: number;
    schemaHygiene: number;
    lastVectorAccessAt: number;
    lastVectorHitAt: number;
    lastVectorIndexAt: number;
    lastUpdatedAt: number;
}

export type VectorMode = 'off' | 'index_only' | 'search' | 'search_rerank';

export type MemoryQualityLevel = 'excellent' | 'healthy' | 'watch' | 'poor' | 'critical';

export type MaintenanceActionType = 'compress' | 'rebuild_summary' | 'revectorize' | 'schema_cleanup';

export interface VectorLifecycleState {
    vectorMode: VectorMode;
    factCount: number;
    summaryCount: number;
    vectorChunkCount: number;
    lastAccessAt: number;
    lastHitAt: number;
    lastIndexAt: number;
    lowPrecisionSearchStride: number;
    searchRequestCount: number;
    recentPrecisionWindow: number[];
    lastPrecision: number;
    reasonCodes: string[];
}

export interface MemoryQualityDimensionScores {
    duplicateRate: number;
    retrievalPrecision: number;
    extractAcceptance: number;
    summaryFreshness: number;
    tokenEfficiency: number;
    orphanFactsRatio: number;
    schemaHygiene: number;
}

export interface MemoryQualityScorecard {
    totalScore: number;
    level: MemoryQualityLevel;
    dimensions: MemoryQualityDimensionScores;
    computedAt: number;
    reasonCodes: string[];
}

export interface MaintenanceAdvice {
    action: MaintenanceActionType;
    priority: 'low' | 'medium' | 'high';
    reasonCodes: string[];
    title: string;
    detail: string;
}

export interface IngestHealthWindow {
    totalAttempts: number;
    duplicateDrops: number;
    lastWriteAt: number;
}

export interface RetrievalHealthWindow {
    totalSearches: number;
    vectorSearches: number;
    rerankSearches: number;
    keywordHits: number;
    vectorHits: number;
    recentPrecisionWindow: number[];
    lastAccessAt: number;
    lastHitAt: number;
}

export interface ExtractHealthWindow {
    recentTasks: Array<{
        task: 'memory.summarize' | 'memory.extract';
        accepted: boolean;
        appliedFacts: number;
        appliedPatches: number;
        appliedSummaries: number;
        ts: number;
    }>;
    lastAcceptedAt: number;
}

/**
 * 功能：描述自适应策略的可执行结果。
 * @param extractInterval 抽取触发间隔。
 * @param extractWindowSize 抽取窗口大小。
 * @param summaryEnabled 是否启用摘要。
 * @param summaryMode 当前摘要模式。
 * @param entityResolutionLevel 实体解析强度。
 * @param speakerTrackingLevel 说话人跟踪强度。
 * @param worldStateWeight 世界状态权重。
 * @param vectorEnabled 是否启用向量。
 * @param vectorChunkThreshold 向量索引阈值。
 * @param rerankThreshold 重排阈值。
 * @param contextMaxTokensShare 上下文预算占比。
 * @returns 自适应策略对象。
 */
export interface AdaptivePolicy {
    extractInterval: number;
    extractWindowSize: number;
    summaryEnabled: boolean;
    summaryMode: SummaryStrategy;
    entityResolutionLevel: EntityResolutionLevel;
    speakerTrackingLevel: SpeakerTrackingLevel;
    worldStateWeight: number;
    vectorEnabled: boolean;
    vectorChunkThreshold: number;
    rerankThreshold: number;
    vectorMode: VectorMode;
    vectorMinFacts: number;
    vectorMinSummaries: number;
    vectorSearchStride: number;
    rerankEnabled: boolean;
    vectorIdleDecayDays: number;
    contextMaxTokensShare: number;
}

/**
 * 功能：描述注入层最近一次决策结果。
 * @param intent 判定出的聊天意图。
 * @param sectionsUsed 实际使用的区段。
 * @param budgets 各区段预算。
 * @param reasonCodes 决策原因代码。
 * @param generatedAt 决策生成时间。
 * @returns 策略决策对象。
 */
export interface StrategyDecision {
    intent: InjectionIntent;
    sectionsUsed: InjectionSectionName[];
    budgets: Partial<Record<InjectionSectionName, number>>;
    reasonCodes: string[];
    generatedAt: number;
}

/**
 * 功能：描述保留与删除相关策略。
 * @param deletionStrategy 删除策略。
 * @param keepSummaryCount 保留摘要数量上限。
 * @param keepEventCount 保留事件数量上限。
 * @param keepVectorDays 向量保留天数。
 * @returns 保留策略对象。
 */
export interface RetentionPolicy {
    deletionStrategy: DeletionStrategy;
    keepSummaryCount: number;
    keepEventCount: number;
    keepVectorDays: number;
}

/**
 * 功能：记录逻辑软删除与归档索引。
 * @param archivedFactKeys 软删除的事实键集合。
 * @param archivedSummaryIds 软删除的摘要键集合。
 * @param archivedStatePaths 软删除的世界状态路径集合。
 * @param archivedVectorChunkIds 软删除的向量分块键集合。
 * @returns 归档索引对象。
 */
export interface RetentionArchives {
    archivedFactKeys: string[];
    archivedSummaryIds: string[];
    archivedStatePaths: string[];
    archivedVectorChunkIds: string[];
}

/**
 * 功能：定义聊天画像和策略的手动覆盖项。
 * @param chatProfile 聊天画像覆盖。
 * @param adaptivePolicy 自适应策略覆盖。
 * @param retentionPolicy 保留策略覆盖。
 * @returns 覆盖对象。
 */
export interface ManualOverrides {
    chatProfile?: ChatProfileOverride;
    adaptivePolicy?: Partial<AdaptivePolicy>;
    retentionPolicy?: Partial<RetentionPolicy>;
}

export interface AutoSchemaPolicy {
    maxNewTablesPerRound?: number;
    maxNewFieldsPerRound?: number;
    maxNewFieldsPerTable?: number;
    tableNameConflictThreshold?: number;
    descriptionSimilarityThreshold?: number;
}

export interface SchemaDraftSession {
    draftRevisionId: string | null;
    draftCreatedAt: number | null;
    consecutiveNoChangeCount: number;
    mergeWindowMs: number;
}

export interface AssistantTurnTracker {
    countedAssistantMessageIds: string[];
    recentAssistantTurnSignatures: string[];
    assistantTurnCount: number;
    lastUpdatedAt: number;
}

export type RowAliasIndex = Record<string, Record<string, string>>;

export type RowRedirects = Record<string, Record<string, string>>;

export interface RowTombstone {
    rowId: string;
    tableKey: string;
    deletedAt: number;
    deletedBy: string;
}

export type RowTombstones = Record<string, Record<string, RowTombstone>>;

export const DEFAULT_SUMMARY_POLICY: Required<SummaryPolicyOverride> = {
    enabled: true,
    floorUnit: 'assistant_reply',
    interval: 12,
    windowSize: 40,
    allowAutoSchemaExpansion: true,
};

export const DEFAULT_CHAT_PROFILE: ChatProfile = {
    chatType: 'solo',
    stylePreference: 'story',
    memoryStrength: 'medium',
    extractStrategy: 'facts_relations',
    summaryStrategy: 'layered',
    vectorStrategy: {
        enabled: true,
        chunkThreshold: 240,
        rerankThreshold: 6,
        activationFacts: 18,
        activationSummaries: 8,
        idleDecayDays: 14,
        lowPrecisionSearchStride: 3,
    },
    deletionStrategy: 'soft_delete',
};

export const DEFAULT_ADAPTIVE_METRICS: AdaptiveMetrics = {
    windowSize: 24,
    avgMessageLength: 0,
    assistantLongMessageRatio: 0,
    userInfoDensity: 0,
    repeatedTopicRate: 0,
    factsHitRate: 0,
    factsUpdateRate: 0,
    retrievalHitRate: 0,
    promptInjectionTokenRatio: 0,
    summaryEffectiveness: 0,
    recentUserTurns: 0,
    recentAssistantTurns: 0,
    recentGroupSpeakerCount: 1,
    worldStateSignal: 0,
    duplicateRate: 0,
    retrievalPrecision: 0,
    extractAcceptance: 0,
    summaryStaleness: 1,
    tokenEfficiency: 0,
    orphanFactsRatio: 0,
    schemaHygiene: 1,
    lastVectorAccessAt: 0,
    lastVectorHitAt: 0,
    lastVectorIndexAt: 0,
    lastUpdatedAt: 0,
};

export const DEFAULT_ADAPTIVE_POLICY: AdaptivePolicy = {
    extractInterval: 12,
    extractWindowSize: 40,
    summaryEnabled: true,
    summaryMode: 'layered',
    entityResolutionLevel: 'medium',
    speakerTrackingLevel: 'medium',
    worldStateWeight: 0.5,
    vectorEnabled: true,
    vectorChunkThreshold: 240,
    rerankThreshold: 6,
    vectorMode: 'search_rerank',
    vectorMinFacts: 18,
    vectorMinSummaries: 8,
    vectorSearchStride: 1,
    rerankEnabled: true,
    vectorIdleDecayDays: 14,
    contextMaxTokensShare: 0.55,
};

export const DEFAULT_VECTOR_LIFECYCLE: VectorLifecycleState = {
    vectorMode: 'off',
    factCount: 0,
    summaryCount: 0,
    vectorChunkCount: 0,
    lastAccessAt: 0,
    lastHitAt: 0,
    lastIndexAt: 0,
    lowPrecisionSearchStride: 3,
    searchRequestCount: 0,
    recentPrecisionWindow: [],
    lastPrecision: 0,
    reasonCodes: [],
};

export const DEFAULT_MEMORY_QUALITY: MemoryQualityScorecard = {
    totalScore: 100,
    level: 'excellent',
    dimensions: {
        duplicateRate: 1,
        retrievalPrecision: 1,
        extractAcceptance: 1,
        summaryFreshness: 1,
        tokenEfficiency: 1,
        orphanFactsRatio: 1,
        schemaHygiene: 1,
    },
    computedAt: 0,
    reasonCodes: [],
};

export const DEFAULT_INGEST_HEALTH: IngestHealthWindow = {
    totalAttempts: 0,
    duplicateDrops: 0,
    lastWriteAt: 0,
};

export const DEFAULT_RETRIEVAL_HEALTH: RetrievalHealthWindow = {
    totalSearches: 0,
    vectorSearches: 0,
    rerankSearches: 0,
    keywordHits: 0,
    vectorHits: 0,
    recentPrecisionWindow: [],
    lastAccessAt: 0,
    lastHitAt: 0,
};

export const DEFAULT_EXTRACT_HEALTH: ExtractHealthWindow = {
    recentTasks: [],
    lastAcceptedAt: 0,
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
    deletionStrategy: 'soft_delete',
    keepSummaryCount: 120,
    keepEventCount: 1000,
    keepVectorDays: 30,
};

export const DEFAULT_RETENTION_ARCHIVES: RetentionArchives = {
    archivedFactKeys: [],
    archivedSummaryIds: [],
    archivedStatePaths: [],
    archivedVectorChunkIds: [],
};

export const DEFAULT_AUTO_SCHEMA_POLICY: Required<AutoSchemaPolicy> = {
    maxNewTablesPerRound: 1,
    maxNewFieldsPerRound: 5,
    maxNewFieldsPerTable: 3,
    tableNameConflictThreshold: 0.90,
    descriptionSimilarityThreshold: 0.85,
};

export const DEFAULT_SCHEMA_DRAFT_SESSION: SchemaDraftSession = {
    draftRevisionId: null,
    draftCreatedAt: null,
    consecutiveNoChangeCount: 0,
    mergeWindowMs: 10 * 60 * 1000,
};

export const DEFAULT_ASSISTANT_TURN_TRACKER: AssistantTurnTracker = {
    countedAssistantMessageIds: [],
    recentAssistantTurnSignatures: [],
    assistantTurnCount: 0,
    lastUpdatedAt: 0,
};

export const TRACKER_LRU_LIMIT = 200;

export const TRACKER_FLUSH_INTERVAL_MS = 1000;

export interface MemoryOSChatState {
    summaryPolicyOverride?: SummaryPolicyOverride;
    autoSchemaPolicy?: AutoSchemaPolicy;
    schemaDraftSession?: SchemaDraftSession;
    assistantTurnTracker?: AssistantTurnTracker;
    rowAliasIndex?: RowAliasIndex;
    rowRedirects?: RowRedirects;
    rowTombstones?: RowTombstones;
    chatProfile?: ChatProfile;
    adaptiveMetrics?: AdaptiveMetrics;
    adaptivePolicy?: AdaptivePolicy;
    vectorLifecycle?: VectorLifecycleState;
    memoryQuality?: MemoryQualityScorecard;
    maintenanceAdvice?: MaintenanceAdvice[];
    ingestHealth?: IngestHealthWindow;
    retrievalHealth?: RetrievalHealthWindow;
    extractHealth?: ExtractHealthWindow;
    retentionPolicy?: RetentionPolicy;
    retentionArchives?: RetentionArchives;
    manualOverrides?: ManualOverrides;
    lastStrategyDecision?: StrategyDecision | null;
}
