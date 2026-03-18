/**
 * 功能：定义聊天级 MemoryOS 状态、聊天画像、自适应指标与策略类型。
 * 参数：无。
 * 返回：无。
 */

import type { TaskSurfaceMode } from '../../../SDK/stx';

export type ChatType = 'solo' | 'group' | 'worldbook' | 'tool';

export type StylePreference = 'story' | 'qa' | 'trpg' | 'info';

export type MemoryStrength = 'low' | 'medium' | 'high';

export type ExtractStrategy = 'facts_only' | 'facts_relations' | 'facts_relations_world';

export type SummaryStrategy = 'short' | 'layered' | 'timeline';

export type DeletionStrategy = 'soft_delete' | 'immediate_purge';

export type InjectionIntent = 'setting_qa' | 'story_continue' | 'roleplay' | 'tool_qa' | 'auto';

export type PromptAnchorMode =
    | 'top'
    | 'before_start'
    | 'custom_anchor'
    | 'after_first_system'
    | 'after_last_system'
    | 'after_persona'
    | 'after_author_note'
    | 'after_lorebook'
    | 'setting_query_only';

export type PromptRenderStyle = 'xml' | 'markdown' | 'comment' | 'compact_kv' | 'minimal_bullets';

export type PromptSoftPersonaMode = 'scene_note' | 'continuity_note' | 'character_anchor' | 'hidden_context_summary';

export type PromptQueryMode = 'always' | 'setting_only';

export type GenerationValueClass =
    | 'plot_progress'
    | 'setting_confirmed'
    | 'relationship_shift'
    | 'small_talk_noise'
    | 'tool_result';

export type UserFacingPresetId =
    | 'companion_chat'
    | 'long_rp'
    | 'worldbook_qa'
    | 'group_trpg'
    | 'tool_qa'
    | 'custom';

export type PresetScope = 'global' | 'character' | 'group' | 'chat';

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

export type LorebookGateMode = 'force_inject' | 'soft_inject' | 'summary_only' | 'block';

export type StyleSeedMode = 'narrative' | 'rp' | 'setting_qa' | 'tool' | 'balanced';

export type ColdStartStage = 'seeded' | 'prompt_primed' | 'extract_primed';

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

export type MaintenanceActionType = 'compress' | 'rebuild_summary' | 'revectorize' | 'schema_cleanup' | 'group_maintenance';

export type MaintenanceSeverity = 'info' | 'warning' | 'critical';

export type MaintenanceSurface = 'panel' | 'compact' | 'toast';

export type ChatLifecycleStage = 'new' | 'active' | 'stable' | 'long_running' | 'archived' | 'deleted';

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

export interface MaintenanceInsight {
    id: string;
    action: MaintenanceActionType;
    severity: MaintenanceSeverity;
    title: string;
    detail: string;
    shortLabel: string;
    reasonCodes: string[];
    surfaces: MaintenanceSurface[];
    actionLabel: string;
    generatedAt: number;
}

export interface MaintenanceExecutionResult {
    action: MaintenanceActionType;
    ok: boolean;
    message: string;
    reasonCodes: string[];
    touchedCounts: {
        summariesCreated: number;
        eventsArchived: number;
        vectorChunksRebuilt: number;
        cleanedFacts: number;
        cleanedStates: number;
        lanesRebuilt: number;
        salienceUpdated: number;
    };
    executedAt: number;
    durationMs: number;
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
    lorebookPolicyWeight: number;
    groupLaneBudgetShare: number;
    actorSalienceTopK: number;
    profileRefreshInterval: number;
    qualityRefreshInterval: number;
    groupLaneEnabled: boolean;
}

export interface SummaryPolicyOverride {
    enabled?: boolean;
    interval?: number;
    windowSize?: number;
}

export interface PromptInjectionProfile {
    allowSystem: boolean;
    allowUser: boolean;
    defaultInsert: PromptAnchorMode;
    fallbackOrder: PromptAnchorMode[];
    queryMode: PromptQueryMode;
    renderStyle: PromptRenderStyle;
    softPersonaMode: PromptSoftPersonaMode;
    wrapTag: string;
    settingOnlyMinScore: number;
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

export interface PreGenerationGateDecision {
    shouldInject: boolean;
    intent: InjectionIntent;
    sectionsUsed: InjectionSectionName[];
    budgets: Partial<Record<InjectionSectionName, number>>;
    lorebookMode: LorebookGateMode;
    anchorMode: PromptAnchorMode;
    fallbackOrder: PromptAnchorMode[];
    queryMode: PromptQueryMode;
    renderStyle: PromptRenderStyle;
    softPersonaMode: PromptSoftPersonaMode;
    shouldTrimPrompt: boolean;
    reasonCodes: string[];
    generatedAt: number;
}

export interface PostGenerationGateDecision {
    valueClass: GenerationValueClass;
    shouldPersistLongTerm: boolean;
    shouldExtractFacts: boolean;
    shouldExtractRelations: boolean;
    shouldExtractWorldState: boolean;
    rebuildSummary: boolean;
    shouldUpdateWorldState: boolean;
    shortTermOnly: boolean;
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
    summaryPolicy?: SummaryPolicyOverride;
    retentionPolicy?: Partial<RetentionPolicy>;
    promptInjectionProfile?: Partial<PromptInjectionProfile>;
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

export type TurnLifecycle = 'active' | 'edited' | 'swiped_out' | 'deleted' | 'branch_root';

export type TurnKind = 'user' | 'assistant' | 'system';

export interface TurnRecord {
    turnId: string;
    messageId: string;
    kind: TurnKind;
    lifecycle: TurnLifecycle;
    chatKey: string;
    sourceEventId: string;
    createdAt: number;
    updatedAt: number;
    textSignature: string;
    baseMessageId?: string;
    branchFromTurnId?: string;
}

export interface LogicalMessageNode {
    nodeId: string;
    messageId: string;
    role: TurnKind;
    text: string;
    textSignature: string;
    isVisible: boolean;
    lifecycle: TurnLifecycle;
    createdAt: number;
    updatedAt: number;
    baseMessageId?: string;
    branchFromTurnId?: string;
}

export type ChatMutationKind =
    | 'message_added'
    | 'message_edited'
    | 'message_swiped'
    | 'message_deleted'
    | 'chat_branched'
    | 'chat_renamed'
    | 'character_binding_changed';

export interface LogicalChatView {
    chatKey: string;
    visibleMessages: LogicalMessageNode[];
    visibleUserTurns: LogicalMessageNode[];
    visibleAssistantTurns: LogicalMessageNode[];
    supersededCandidates: LogicalMessageNode[];
    editedRevisions: LogicalMessageNode[];
    deletedTurns: LogicalMessageNode[];
    branchRoots: LogicalMessageNode[];
    viewHash: string;
    snapshotHash: string;
    mutationKinds: ChatMutationKind[];
    activeMessageIds: string[];
    invalidatedMessageIds: string[];
    repairAnchorMessageId?: string | null;
    rebuiltAt: number;
}

export interface ChatArchiveState {
    archived: boolean;
    archivedAt?: number;
    archiveReason?: string;
}

export interface ChatLifecycleState {
    stage: ChatLifecycleStage;
    stageReasonCodes: string[];
    firstSeenAt: number;
    stageEnteredAt: number;
    lastMaintenanceAt: number;
    lastMaintenanceAction?: MaintenanceActionType;
    lastMutationAt: number;
    lastMutationSource: string;
    mutationKinds: ChatMutationKind[];
}

export interface SeedSourceTrace {
    field: string;
    source: string;
    confidence: number;
}

export interface IdentitySeed {
    roleKey: string;
    displayName: string;
    aliases: string[];
    identity: string[];
    alignment?: string;
    catchphrases: string[];
    relationshipAnchors: string[];
    sourceTrace: SeedSourceTrace[];
}

export interface WorldSeed {
    locations: string[];
    rules: string[];
    hardConstraints: string[];
    entities: string[];
    sourceTrace: SeedSourceTrace[];
}

export interface StyleSeed {
    mode: StyleSeedMode;
    cues: string[];
    sourceTrace: SeedSourceTrace[];
}

export interface SemanticAiSummary {
    roleSummary: string;
    worldSummary: string;
    identityFacts: string[];
    worldRules: string[];
    hardConstraints: string[];
    cities: string[];
    locations: string[];
    entities: string[];
    nations: string[];
    regions: string[];
    factions: string[];
    calendarSystems: string[];
    currencySystems: string[];
    socialSystems: string[];
    culturalPractices: string[];
    historicalEvents: string[];
    dangers: string[];
    otherWorldDetails: string[];
    characterGoals: string[];
    relationshipFacts: string[];
    catchphrases: string[];
    relationshipAnchors: string[];
    styleCues: string[];
    generatedAt: number;
    source: 'ai';
}

export interface ColdStartLorebookEntrySelection {
    book: string;
    entryId: string;
    entry: string;
    keywords: string[];
}

export interface ColdStartLorebookSelection {
    books: string[];
    entries: ColdStartLorebookEntrySelection[];
}

export interface ChatSemanticSeed {
    collectedAt: number;
    characterCore: Record<string, unknown>;
    systemPrompt: string;
    firstMessage: string;
    authorNote: string;
    jailbreak: string;
    instruct: string;
    activeLorebooks: string[];
    lorebookSeed: Array<{
        book: string;
        hash: string;
        snippets: string[];
    }>;
    groupMembers: string[];
    characterAnchors: Array<{
        anchorId: string;
        label: string;
        value: string;
        confidence: number;
    }>;
    presetStyle: string;
    identitySeed: IdentitySeed;
    identitySeeds?: Record<string, IdentitySeed>;
    worldSeed: WorldSeed;
    styleSeed: StyleSeed;
    aiSummary?: SemanticAiSummary;
    sourceTrace: SeedSourceTrace[];
}

export interface LorebookGateDecision {
    mode: LorebookGateMode;
    score: number;
    reasonCodes: string[];
    matchedEntries: string[];
    conflictDetected: boolean;
    shouldExtractWorldFacts: boolean;
    shouldWriteback: boolean;
    generatedAt: number;
}

export interface SpeakerMemoryLane {
    laneId: string;
    actorKey: string;
    displayName: string;
    identityHint: string;
    lastStyle: string;
    lastEmotion: string;
    recentGoal: string;
    relationshipDelta: string;
    lastActiveAt: number;
    recentMessageIds: string[];
}

export interface SharedSceneMemory {
    currentScene: string;
    currentConflict: string;
    groupConsensus: string[];
    pendingEvents: string[];
    participantActorKeys: string[];
    updatedAt: number;
}

export interface ActorSalienceScore {
    actorKey: string;
    score: number;
    reasonCodes: string[];
    updatedAt: number;
}

export interface GroupBindingSnapshot {
    groupId: string;
    characterIds: string[];
    memberNames: string[];
    updatedAt: number;
}

export interface GroupMemoryState {
    lanes: SpeakerMemoryLane[];
    sharedScene: SharedSceneMemory;
    actorSalience: ActorSalienceScore[];
    bindingSnapshot: GroupBindingSnapshot;
    updatedAt: number;
}

export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'core_identity';

export type MemoryCandidateKind = 'fact' | 'summary' | 'state' | 'relationship';

export type MemoryRecordKind = 'fact' | 'summary' | 'state' | 'relationship';

export type RecallCandidateRecordKind = MemoryRecordKind | 'event' | 'lorebook';

export type RecallCandidateSource = 'facts' | 'summaries' | 'state' | 'relationships' | 'events' | 'vector' | 'lorebook';

export type MemoryType = 'identity' | 'event' | 'relationship' | 'world' | 'status' | 'other';

export type MemorySubtype =
    | 'identity'
    | 'trait'
    | 'preference'
    | 'bond'
    | 'emotion_imprint'
    | 'goal'
    | 'promise'
    | 'secret'
    | 'rumor'
    | 'major_plot_event'
    | 'minor_event'
    | 'combat_event'
    | 'travel_event'
    | 'conversation_event'
    | 'global_rule'
    | 'city_rule'
    | 'location_fact'
    | 'item_rule'
    | 'faction_rule'
    | 'world_history'
    | 'current_scene'
    | 'current_conflict'
    | 'temporary_status'
    | 'other';

export type MemorySourceScope = 'self' | 'target' | 'group' | 'world' | 'system';

export type MemoryDecayStage = 'clear' | 'blur' | 'distorted';

export type InjectedMemoryTone = 'stable_fact' | 'clear_recall' | 'blurred_recall' | 'possible_misremember';

export interface MemoryActorRetentionState {
    actorKey: string;
    stage: MemoryDecayStage;
    forgetProbability: number;
    forgotten: boolean;
    forgottenAt?: number;
    forgottenReasonCodes: string[];
    rehearsalCount: number;
    lastRecalledAt: number;
    retentionBias: number;
    confidence: number;
    updatedAt: number;
}

export type MemoryActorRetentionMap = Record<string, MemoryActorRetentionState>;

export interface PersonaMemoryProfile {
    profileVersion: string;
    totalCapacity: number;
    eventMemory: number;
    factMemory: number;
    emotionalBias: number;
    relationshipSensitivity: number;
    forgettingSpeed: number;
    distortionTendency: number;
    selfNarrativeBias: number;
    privacyGuard: number;
    allowDistortion: boolean;
    derivedFrom: string[];
    updatedAt: number;
}

export type PersonaMemoryProfileMap = Record<string, PersonaMemoryProfile>;

export interface SimpleMemoryPersona {
    memoryStrength: 'weak' | 'balanced' | 'strong';
    emotionalMemory: 'low' | 'medium' | 'high';
    relationshipFocus: 'low' | 'medium' | 'high';
    forgettingRate: 'slow' | 'medium' | 'fast';
    distortionRisk: 'low' | 'medium' | 'high';
    updatedAt: number;
}

export type SimpleMemoryPersonaMap = Record<string, SimpleMemoryPersona>;

export interface EncodingScore {
    totalScore: number;
    accepted: boolean;
    targetLayer: MemoryLayer;
    salience: number;
    strength: number;
    decayStage: MemoryDecayStage;
    emotionTag: string;
    relationScope: string;
    reasonCodes: string[];
    profileVersion: string;
}

export interface MemoryCandidate {
    candidateId: string;
    kind: MemoryCandidateKind;
    source: string;
    summary: string;
    payload: Record<string, unknown>;
    extractedAt: number;
    sourceEventId?: string;
    conflictWith: string[];
    resolvedRecordKey?: string;
    encoding: EncodingScore;
}

export interface RecallCandidate {
    candidateId: string;
    recordKey: string;
    recordKind: RecallCandidateRecordKind;
    source: RecallCandidateSource;
    sectionHint: InjectionSectionName | null;
    title: string;
    rawText: string;
    renderedLine?: string;
    confidence: number;
    updatedAt: number;
    keywordScore: number;
    vectorScore: number;
    recencyScore: number;
    continuityScore: number;
    relationshipScore: number;
    emotionScore: number;
    conflictPenalty: number;
    privacyPenalty: number;
    finalScore: number;
    tone: InjectedMemoryTone;
    selected: boolean;
    suppressedBy?: string[];
    reasonCodes: string[];
}

export interface RecallPlan {
    intent: InjectionIntent;
    sections: InjectionSectionName[];
    sectionBudgets: Partial<Record<InjectionSectionName, number>>;
    maxTokens: number;
    sourceWeights: Record<RecallCandidateSource, number>;
    sourceLimits: Partial<Record<RecallCandidateSource, number>>;
    sectionWeights: Partial<Record<InjectionSectionName, number>>;
    coarseTopK: number;
    fineTopK: number;
    reasonCodes: string[];
}

export interface MemoryLifecycleState {
    recordKey: string;
    recordKind: MemoryRecordKind;
    stage: MemoryDecayStage;
    ownerActorKey?: string | null;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    sourceScope?: MemorySourceScope;
    importance?: number;
    forgetProbability?: number;
    forgotten?: boolean;
    forgottenAt?: number;
    forgottenReasonCodes?: string[];
    lastForgetRollAt?: number;
    reinforcedByEventIds?: string[];
    invalidatedByEventIds?: string[];
    strength: number;
    salience: number;
    rehearsalCount: number;
    lastRecalledAt: number;
    distortionRisk: number;
    emotionTag: string;
    relationScope: string;
    perActorMetrics?: MemoryActorRetentionMap;
    updatedAt: number;
}

export interface OwnedMemoryState {
    recordKey: string;
    ownerActorKey: string | null;
    recordKind: MemoryRecordKind;
    memoryType: MemoryType;
    memorySubtype: MemorySubtype;
    sourceScope: MemorySourceScope;
    importance: number;
    forgetProbability: number;
    forgotten: boolean;
    forgottenAt?: number;
    forgottenReasonCodes: string[];
    lastForgetRollAt?: number;
    reinforcedByEventIds: string[];
    invalidatedByEventIds: string[];
    roleBasedRetentionOverrides?: MemoryActorRetentionMap;
    updatedAt: number;
}

export type WorldStateScopeType = 'global' | 'nation' | 'region' | 'city' | 'location' | 'faction' | 'item' | 'character' | 'scene' | 'unclassified';

export type WorldStateType = 'rule' | 'constraint' | 'history' | 'status' | 'capability' | 'ownership' | 'culture' | 'danger' | 'relationship' | 'goal' | 'relationship_hook' | 'other' | 'anomaly';

export interface WorldStateNodeValue {
    title: string;
    summary: string;
    scopeType: WorldStateScopeType;
    stateType: WorldStateType;
    subjectId?: string;
    nationId?: string;
    regionId?: string;
    cityId?: string;
    locationId?: string;
    itemId?: string;
    anomalyFlags?: string[];
    keywords: string[];
    tags: string[];
    confidence?: number;
    sourceRefs?: string[];
    updatedAt: number;
}

export interface StructuredWorldStateEntry {
    stateKey: string;
    path: string;
    rawValue: unknown;
    node: WorldStateNodeValue;
    sourceEventId?: string;
    updatedAt: number;
}

export type WorldStateGroupingResult = Record<string, Record<string, StructuredWorldStateEntry[]>>;

export interface RecallLogEntry {
    recallId: string;
    query: string;
    section: InjectionSectionName | 'PREVIEW';
    recordKey: string;
    recordKind: MemoryRecordKind;
    recordTitle: string;
    score: number;
    selected: boolean;
    conflictSuppressed: boolean;
    tone: InjectedMemoryTone;
    reasonCodes: string[];
    loggedAt: number;
}

export interface RecallExplanationBucket {
    bucketKey: 'selected' | 'conflict_suppressed' | 'rejected_candidates';
    label: string;
    emptyText: string;
    items: Array<{
        itemId: string;
        sourceKind: 'recall_log' | 'candidate';
        recordKey: string;
        recordKind: MemoryRecordKind | MemoryCandidateKind | RecallCandidateRecordKind;
        title: string;
        score: number;
        layer: MemoryLayer | null;
        section: InjectionSectionName | 'PREVIEW' | null;
        tone: InjectedMemoryTone | null;
        stage: MemoryDecayStage | null;
        reasonCodes: string[];
        accepted: boolean | null;
    }>;
}

export interface LatestRecallExplanation {
    generatedAt: number;
    query: string;
    sectionsUsed: InjectionSectionName[];
    selected: RecallExplanationBucket;
    conflictSuppressed: RecallExplanationBucket;
    rejectedCandidates: RecallExplanationBucket;
    reasonCodes: string[];
}

export interface RelationshipDelta {
    actorKey: string;
    targetKey: string;
    familiarity: number;
    trust: number;
    affection: number;
    tension: number;
    dependency: number;
    respect: number;
    unresolvedConflictDelta: number;
    sharedFragment?: string;
    reason: string;
    updatedAt: number;
}

export interface RelationshipState {
    relationshipKey: string;
    actorKey: string;
    targetKey: string;
    scope: 'self_target' | 'group_pair';
    participantKeys: string[];
    familiarity: number;
    trust: number;
    affection: number;
    tension: number;
    dependency: number;
    respect: number;
    unresolvedConflict: number;
    sharedFragments: string[];
    summary: string;
    reasonCodes: string[];
    updatedAt: number;
}

export interface MemoryTuningProfile {
    candidateAcceptThresholdBias: number;
    recallRelationshipBias: number;
    recallEmotionBias: number;
    recallRecencyBias: number;
    recallContinuityBias: number;
    distortionProtectionBias: number;
    recallRetentionLimit: number;
    updatedAt: number;
}

export type MemoryTaskPresentationTaskId =
    | 'memory.coldstart.summarize'
    | 'memory.summarize'
    | 'memory.extract'
    | 'world.template.build'
    | 'memory.vector.embed'
    | 'memory.search.rerank';

export interface MemoryTaskPresentationPreset {
    taskId: MemoryTaskPresentationTaskId;
    label: string;
    surfaceMode: TaskSurfaceMode;
}

export interface MemoryTaskPresentationSettings {
    blockingDefaultMode: Extract<TaskSurfaceMode, 'fullscreen_blocking' | 'toast_blocking'>;
    showBackgroundToast: boolean;
    disableComposerDuringBlocking: boolean;
    toastAutoCloseSeconds: number;
    presets: Record<MemoryTaskPresentationTaskId, MemoryTaskPresentationPreset>;
    updatedAt: number;
}

export interface UserFacingChatPreset {
    presetId: UserFacingPresetId;
    label: string;
    chatProfile?: ChatProfileOverride;
    adaptivePolicy?: Partial<AdaptivePolicy>;
    retentionPolicy?: Partial<RetentionPolicy>;
    promptInjection?: Partial<PromptInjectionProfile>;
    profileRefreshInterval?: number;
    qualityRefreshInterval?: number;
    autoBootstrapSemanticSeed?: boolean;
    groupLaneEnabled?: boolean;
    updatedAt: number;
}

export interface EffectivePresetBundle {
    globalPreset: UserFacingChatPreset | null;
    rolePreset: UserFacingChatPreset | null;
    chatPreset: UserFacingChatPreset | null;
    effectiveChatProfile: ChatProfileOverride;
    effectiveAdaptivePolicy: Partial<AdaptivePolicy>;
    effectiveRetentionPolicy: Partial<RetentionPolicy>;
    effectivePromptInjection: PromptInjectionProfile;
    profileRefreshInterval: number;
    qualityRefreshInterval: number;
    autoBootstrapSemanticSeed: boolean;
    groupLaneEnabled: boolean;
    roleScope: PresetScope | 'none';
    roleScopeKey: string;
}

export interface SummaryFixTask {
    reason: string;
    lorebookMode: LorebookGateMode;
    createdAt: number;
}

export interface MutationRepairTask {
    taskId: string;
    viewHash: string;
    snapshotHash: string;
    mutationKinds: ChatMutationKind[];
    invalidatedMessageIds: string[];
    activeMessageIds: string[];
    repairAnchorMessageId?: string | null;
    repairGeneration: number;
    enqueuedAt: number;
    attempts: number;
    status: 'pending' | 'running' | 'failed';
    lastError?: string;
}

export interface AssistantTurnTracker {
    activeAssistantTurnCount: number;
    turnRecords: TurnRecord[];
    lastViewHash: string;
    lastVisibleTurnSnapshotHash: string;
    lastCommittedTurnCursor: string;
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
    lorebookPolicyWeight: 0.55,
    groupLaneBudgetShare: 0.35,
    actorSalienceTopK: 3,
    profileRefreshInterval: 6,
    qualityRefreshInterval: 12,
    groupLaneEnabled: true,
};

export const DEFAULT_PROMPT_INJECTION_PROFILE: PromptInjectionProfile = {
    allowSystem: false,
    allowUser: true,
    defaultInsert: 'after_last_system',
    fallbackOrder: ['after_last_system', 'top'],
    queryMode: 'always',
    renderStyle: 'xml',
    softPersonaMode: 'continuity_note',
    wrapTag: 'MEMORY_OS_CONTEXT',
    settingOnlyMinScore: 0.35,
};

export const DEFAULT_USER_FACING_CHAT_PRESET: UserFacingChatPreset = {
    presetId: 'custom',
    label: '自定义',
    chatProfile: {},
    adaptivePolicy: {},
    retentionPolicy: {},
    promptInjection: {},
    profileRefreshInterval: DEFAULT_ADAPTIVE_POLICY.profileRefreshInterval,
    qualityRefreshInterval: DEFAULT_ADAPTIVE_POLICY.qualityRefreshInterval,
    autoBootstrapSemanticSeed: true,
    groupLaneEnabled: true,
    updatedAt: 0,
};

export const DEFAULT_EFFECTIVE_PRESET_BUNDLE: EffectivePresetBundle = {
    globalPreset: null,
    rolePreset: null,
    chatPreset: null,
    effectiveChatProfile: {},
    effectiveAdaptivePolicy: {},
    effectiveRetentionPolicy: {},
    effectivePromptInjection: DEFAULT_PROMPT_INJECTION_PROFILE,
    profileRefreshInterval: DEFAULT_ADAPTIVE_POLICY.profileRefreshInterval,
    qualityRefreshInterval: DEFAULT_ADAPTIVE_POLICY.qualityRefreshInterval,
    autoBootstrapSemanticSeed: true,
    groupLaneEnabled: true,
    roleScope: 'none',
    roleScopeKey: '',
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
    activeAssistantTurnCount: 0,
    turnRecords: [],
    lastViewHash: '',
    lastVisibleTurnSnapshotHash: '',
    lastCommittedTurnCursor: '',
    lastUpdatedAt: 0,
};

export const DEFAULT_GROUP_MEMORY: GroupMemoryState = {
    lanes: [],
    sharedScene: {
        currentScene: '',
        currentConflict: '',
        groupConsensus: [],
        pendingEvents: [],
        participantActorKeys: [],
        updatedAt: 0,
    },
    actorSalience: [],
    bindingSnapshot: {
        groupId: '',
        characterIds: [],
        memberNames: [],
        updatedAt: 0,
    },
    updatedAt: 0,
};

export const DEFAULT_PERSONA_MEMORY_PROFILE: PersonaMemoryProfile = {
    profileVersion: 'persona.v1',
    totalCapacity: 0.6,
    eventMemory: 0.6,
    factMemory: 0.6,
    emotionalBias: 0.5,
    relationshipSensitivity: 0.5,
    forgettingSpeed: 0.45,
    distortionTendency: 0.2,
    selfNarrativeBias: 0.5,
    privacyGuard: 0.45,
    allowDistortion: false,
    derivedFrom: [],
    updatedAt: 0,
};

export const DEFAULT_SIMPLE_MEMORY_PERSONA: SimpleMemoryPersona = {
    memoryStrength: 'balanced',
    emotionalMemory: 'medium',
    relationshipFocus: 'medium',
    forgettingRate: 'medium',
    distortionRisk: 'low',
    updatedAt: 0,
};

export const DEFAULT_MEMORY_TUNING_PROFILE: MemoryTuningProfile = {
    candidateAcceptThresholdBias: 0,
    recallRelationshipBias: 1,
    recallEmotionBias: 1,
    recallRecencyBias: 1,
    recallContinuityBias: 1,
    distortionProtectionBias: 1,
    recallRetentionLimit: 160,
    updatedAt: 0,
};

export const DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS: MemoryTaskPresentationSettings = {
    blockingDefaultMode: 'fullscreen_blocking',
    showBackgroundToast: true,
    disableComposerDuringBlocking: true,
    toastAutoCloseSeconds: 3,
    presets: {
        'memory.coldstart.summarize': {
            taskId: 'memory.coldstart.summarize',
            label: '冷启动摘要',
            surfaceMode: 'fullscreen_blocking',
        },
        'memory.summarize': {
            taskId: 'memory.summarize',
            label: '摘要生成',
            surfaceMode: 'toast_background',
        },
        'memory.extract': {
            taskId: 'memory.extract',
            label: '结构提取',
            surfaceMode: 'toast_background',
        },
        'world.template.build': {
            taskId: 'world.template.build',
            label: '模板构建',
            surfaceMode: 'fullscreen_blocking',
        },
        'memory.vector.embed': {
            taskId: 'memory.vector.embed',
            label: '向量处理',
            surfaceMode: 'toast_background',
        },
        'memory.search.rerank': {
            taskId: 'memory.search.rerank',
            label: '重排检索',
            surfaceMode: 'toast_background',
        },
    },
    updatedAt: 0,
};

export const DEFAULT_CHAT_LIFECYCLE_STATE: ChatLifecycleState = {
    stage: 'new',
    stageReasonCodes: ['stage_new'],
    firstSeenAt: 0,
    stageEnteredAt: 0,
    lastMaintenanceAt: 0,
    lastMaintenanceAction: undefined,
    lastMutationAt: 0,
    lastMutationSource: '',
    mutationKinds: [],
};

export interface MemoryOSChatState {
    autoSchemaPolicy?: AutoSchemaPolicy;
    schemaDraftSession?: SchemaDraftSession;
    assistantTurnTracker?: AssistantTurnTracker;
    turnLedger?: TurnRecord[];
    logicalChatView?: LogicalChatView;
    chatLifecycle?: ChatLifecycleState;
    archived?: boolean;
    archivedAt?: number;
    archiveReason?: string;
    characterBindingFingerprint?: string;
    semanticSeed?: ChatSemanticSeed;
    coldStartLorebookSelection?: string[];
    coldStartLorebookEntrySelection?: ColdStartLorebookEntrySelection[];
    coldStartSkipLorebookSelection?: boolean;
    personaMemoryProfile?: PersonaMemoryProfile;
    personaMemoryProfiles?: PersonaMemoryProfileMap;
    simpleMemoryPersona?: SimpleMemoryPersona;
    simpleMemoryPersonas?: SimpleMemoryPersonaMap;
    activeActorKey?: string;
    coldStartFingerprint?: string;
    coldStartStage?: ColdStartStage;
    coldStartPrimedAt?: number;
    lastLorebookDecision?: LorebookGateDecision;
    promptInjectionProfile?: PromptInjectionProfile;
    lastPreGenerationDecision?: PreGenerationGateDecision | null;
    lastPostGenerationDecision?: PostGenerationGateDecision | null;
    userFacingPreset?: UserFacingChatPreset | null;
    groupMemory?: GroupMemoryState;
    memoryLifecycleIndex?: Record<string, MemoryLifecycleState>;
    ownedMemoryIndex?: Record<string, OwnedMemoryState>;
    latestRecallExplanation?: LatestRecallExplanation | null;
    memoryTuningProfile?: MemoryTuningProfile;
    memoryTaskPresentationSettings?: MemoryTaskPresentationSettings;
    summaryFixQueue?: SummaryFixTask[];
    mutationRepairQueue?: MutationRepairTask[];
    lastMutationRepairViewHash?: string;
    lastMutationRepairAt?: number;
    mutationRepairGeneration?: number;
    rowAliasIndex?: RowAliasIndex;
    rowRedirects?: RowRedirects;
    rowTombstones?: RowTombstones;
    chatProfile?: ChatProfile;
    adaptiveMetrics?: AdaptiveMetrics;
    adaptivePolicy?: AdaptivePolicy;
    vectorLifecycle?: VectorLifecycleState;
    memoryQuality?: MemoryQualityScorecard;
    maintenanceAdvice?: MaintenanceAdvice[];
    maintenanceInsights?: MaintenanceInsight[];
    lastMaintenanceExecution?: MaintenanceExecutionResult;
    ingestHealth?: IngestHealthWindow;
    retrievalHealth?: RetrievalHealthWindow;
    extractHealth?: ExtractHealthWindow;
    retentionPolicy?: RetentionPolicy;
    retentionArchives?: RetentionArchives;
    manualOverrides?: ManualOverrides;
    lastStrategyDecision?: StrategyDecision | null;
}
