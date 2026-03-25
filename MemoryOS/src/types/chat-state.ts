/**
 * 功能：定义聊天级 MemoryOS 状态、聊天画像、自适应指标与策略类型。
 * 参数：无。
 * 返回：无。
 */

import type { TaskSurfaceMode } from '../../../SDK/stx';
import type { DBDerivationSource } from '../../../SDK/db';
import { MEMORY_OS_POLICY } from '../policy/memory-policy';

export type ChatType = 'solo' | 'group' | 'worldbook' | 'tool';

export type StylePreference = 'story' | 'qa' | 'trpg' | 'info';

export type MemoryStrength = 'low' | 'medium' | 'high';

export type ExtractStrategy = 'facts_only' | 'facts_relations' | 'facts_relations_world';

export type SummaryStrategy = 'short' | 'layered' | 'timeline';

export type SummaryMemoryMode = 'streamlined' | 'balanced' | 'deep';

export type SummaryScenario = 'auto' | 'companion_chat' | 'long_rp' | 'worldbook_qa' | 'group_trpg' | 'tool_qa' | 'custom';

export type SummaryResourcePriority = 'quality' | 'balanced' | 'saving';

export type SummaryTiming = 'key_only' | 'stage_end' | 'frequent';

export type SummaryLength = 'short' | 'standard' | 'detailed' | 'ultra';

export type SummaryCooldownPreset = 'short' | 'standard' | 'long';

export type SummaryRecordFocus = 'facts' | 'relationship' | 'world' | 'plot' | 'emotion' | 'tool_result';

export type SummaryLowValueHandling = 'ignore' | 'keep_some' | 'keep_more';

export type SummaryLookbackScope = 'small' | 'medium' | 'large';

export type SummaryNoiseFilter = 'low' | 'medium' | 'high';

export type SummaryLongTrigger = 'scene_end' | 'combat_end' | 'plot_advance' | 'relationship_shift' | 'world_change' | 'structure_repair' | 'archive_finalize';

export type AutoSummaryMode = 'roleplay' | 'chat' | 'story' | 'mixed';

export type SummarySettingsSource = 'system_default' | 'memory_mode_preset' | 'scenario_preset' | 'global_setting' | 'chat_override';

export type SummaryProcessInterval = 'small' | 'medium' | 'large';

export interface SummarySettingsWorkMode {
    memoryMode: SummaryMemoryMode;
    scenario: SummaryScenario;
    resourcePriority: SummaryResourcePriority;
}

export interface SummarySettingsSummaryBehavior {
    summaryTiming: SummaryTiming;
    summaryLength: SummaryLength;
    longSummaryCooldown: SummaryCooldownPreset;
    longSummaryTrigger: SummaryLongTrigger[];
}

export interface SummarySettingsContentPreference {
    recordFocus: SummaryRecordFocus[];
    lowValueHandling: SummaryLowValueHandling;
    noiseFilter: SummaryNoiseFilter;
}

export interface SummarySettingsAdvanced {
    processInterval: SummaryProcessInterval;
    lookbackScope: SummaryLookbackScope;
    allowLightRelationExtraction: boolean;
    allowMediumWorldStateUpdate: boolean;
    allowHeavyRewriteSummaries: boolean;
    allowHeavyConsistencyRepair: boolean;
    allowHeavyExpandedLookback: boolean;
}

export interface AutoSummaryTriggerSettings {
    enabled: boolean;
    manualTurnThresholdEnabled: boolean;
    manualTurnThreshold: number;
    roleplayTurnThreshold: number;
    chatTurnThreshold: number;
    storyTurnThreshold: number;
    mixedTurnThreshold: number;
    minTurnsAfterLastSummary: number;
    coolDownTurns: number;
    enableTriggerRules: boolean;
    enableSemanticChangeTrigger: boolean;
    enablePromptPressureTrigger: boolean;
    triggerRuleMinScore: number;
    semanticTriggerMinScore: number;
    promptPressureTokenRatio: number;
}

export interface AutoSummaryRuntimeState {
    lastSummaryTurnCount: number;
    lastSummaryAt: number;
    lastTriggerReasonCodes: string[];
    lastMode: AutoSummaryMode;
}

export interface MemoryIngestProgressState {
    lastProcessedAssistantTurnId?: string;
    lastProcessedAssistantMessageId?: string;
    lastProcessedAssistantTurnCount: number;
    lastProcessedSnapshotHash: string;
    lastProcessedRange?: {
        fromMessageId?: string;
        toMessageId?: string;
    };
    lastProcessedAt: number;
    lastProcessedOutcome: 'accepted' | 'noop' | 'rejected' | 'skipped';
    lastRepairGeneration: number;
}

export interface AutoSummaryDecisionSnapshot {
    shouldRun: boolean;
    mode: AutoSummaryMode;
    threshold: number;
    activeAssistantTurnCount: number;
    turnsSinceLastSummary: number;
    reasonCodes: string[];
    matchedTriggerIds: SummaryLongTrigger[];
    scores: {
        triggerRule: number;
        semantic: number;
        pressure: number;
    };
    semanticFlags: string[];
    promptPressureRatio: number;
    generatedAt: number;
}

export interface SummarySettings {
    workMode: SummarySettingsWorkMode;
    summaryBehavior: SummarySettingsSummaryBehavior;
    contentPreference: SummarySettingsContentPreference;
    advanced: SummarySettingsAdvanced;
    autoSummary: AutoSummaryTriggerSettings;
}

export interface SummarySettingsOverride {
    workMode?: Partial<SummarySettingsWorkMode>;
    summaryBehavior?: Partial<SummarySettingsSummaryBehavior>;
    contentPreference?: Partial<SummarySettingsContentPreference>;
    advanced?: Partial<SummarySettingsAdvanced>;
    autoSummary?: Partial<AutoSummaryTriggerSettings>;
}

export interface EffectiveSummarySettings extends SummarySettings {
    source: SummarySettingsSource;
    resolvedScenario: Exclude<SummaryScenario, 'auto'> | 'custom';
    resolvedChatType: ChatType;
}

export type DeletionStrategy = 'soft_delete' | 'immediate_purge';

export type InjectionIntent = 'setting_qa' | 'story_continue' | 'roleplay' | 'tool_qa' | 'auto';

export type PromptLayoutMode = 'layered_memory_context';

export type PromptInsertionRole = 'user';

export type PromptInsertionPosition = 'before_last_user';

export type PromptQueryMode = 'always' | 'setting_only';

export type GenerationValueClass =
    | 'plot_progress'
    | 'setting_confirmed'
    | 'relationship_shift'
    | 'small_talk_noise'
    | 'tool_result';

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

export type ColdStartBootstrapState = 'selection_required' | 'bootstrapping' | 'ready' | 'failed';

export interface ColdStartBootstrapStatus {
    state: ColdStartBootstrapState;
    requestId: string | null;
    updatedAt: number;
    error: string | null;
    fingerprint: string | null;
    stage: ColdStartStage | null;
}

export type MemoryTraceSource =
    | 'host_message'
    | 'trusted_write'
    | 'recall'
    | 'prompt_injection'
    | 'external_callback'
    | 'maintenance';

export type MemoryTraceStage =
    | 'memory_ingest_started'
    | 'memory_event_appended'
    | 'memory_trusted_write_started'
    | 'memory_trusted_write_finished'
    | 'memory_recall_started'
    | 'memory_context_built'
    | 'memory_prompt_inserted'
    | 'memory_prompt_insert_success'
    | 'memory_external_callback_removed'
    | 'memory_external_callback_unused'
    | 'memory_maintenance_started'
    | 'memory_maintenance_finished'
    | 'memory_skipped'
    | 'memory_failed';

/**
 * 鍔熻兘锛氭弿杩颁竴娆′富閾炬渶鍘熷鐨勮窡韪乏鍙愪俊鎭€?
 * @param traceId 鎵撹穿鍏ㄩ摼鐨勮窡韪爣璇嗐€?
 * @param chatKey 褰撳墠鑱婂ぉ閿€?
 * @param sourceMessageId 鎵撳叆鎯呭喌涓殑鍘熷娑堟伅 ID銆?
 * @param eventId 浜嬩欢閿€?
 * @param requestId 鎴栬姹俉ID銆?
 * @param source 璺ㄩ摼鏉ユ簮銆?
 * @param stage 鐜幆闃舵銆?
 * @param ts 鏃堕棿鎴点€?
 * @returns 踪韪璞°€?
 */
export interface MemoryTraceContext {
    traceId: string;
    chatKey: string;
    sourceMessageId?: string;
    eventId?: string;
    requestId?: string;
    source: MemoryTraceSource;
    stage: MemoryTraceStage;
    ts: number;
}

/**
 * 鍔熻兘锛氭弿杩颁笌 trace 鍏宠仈鐨勬渶鍘熷鎵ц璁板綍銆?
 * @param trace 鍦ㄥ摢涓洖璺埌杈撳嚭銆?
 * @param ok 鏄惁鎴愬姛銆?
 * @param label 鍏ㄩ摼璁板綍鏍囩銆?
 * @param detail 璁板綍瑙﹀彂鏃跺璞＄殑鏃ュ織鏁版嵁銆?
 * @returns trace 璁板綍銆?
 */
export interface MemoryMainlineTraceEntry extends MemoryTraceContext {
    ok: boolean;
    label: string;
    detail?: Record<string, unknown>;
}

/**
 * 鍔熻兘锛氭弿杩颁富閾炬渶杩戣窡韪揩鐓с€?
 * @param lastTrace 鏈€杩戜竴娆¤褰曘€?
 * @param lastSuccessTrace 鏈€杩戜竴娆℃垚鍔熻褰曘€?
 * @param recentTraces 鏈€杩戣褰曞垪琛ㄣ€?
 * @param lastIngestTrace 鏈€杩戜竴娆″叆鍙ｅ璞°€?
 * @param lastAppendTrace 鏈€杩戜竴娆′簨浠跺叆搴撳璞°€?
 * @param lastTrustedWriteTrace 鏈€杩戜竴娆＄粡鎵胯鍐欏叆瀵硅薄銆?
 * @param lastRecallTrace 鏈€杩戜竴娆″洖鏀惧璞°€?
 * @param lastPromptInjectionTrace 鏈€杩戜竴娆℃敞鍏ュ璞°€?
 * @param lastUpdatedAt 鏈€杩戞洿鏂版椂闂淬€?
 * @returns trace 鍥炬櫙銆?
 */
export interface MemoryMainlineTraceSnapshot {
    lastTrace: MemoryMainlineTraceEntry | null;
    lastSuccessTrace: MemoryMainlineTraceEntry | null;
    recentTraces: MemoryMainlineTraceEntry[];
    lastIngestTrace: MemoryMainlineTraceEntry | null;
    lastAppendTrace: MemoryMainlineTraceEntry | null;
    lastTrustedWriteTrace: MemoryMainlineTraceEntry | null;
    lastRecallTrace: MemoryMainlineTraceEntry | null;
    lastPromptInjectionTrace: MemoryMainlineTraceEntry | null;
    lastUpdatedAt: number;
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

export type MaintenanceActionType = 'compress' | 'rebuild_summary' | 'memory_card_rebuild' | 'schema_cleanup' | 'group_maintenance';

export type MaintenanceSeverity = 'info' | 'warning' | 'critical';

export type MaintenanceSurface = 'panel' | 'compact' | 'toast';

export type ChatLifecycleStage = 'new' | 'active' | 'stable' | 'long_running' | 'archived' | 'deleted';

export interface VectorLifecycleState {
    vectorMode: VectorMode;
    factCount: number;
    summaryCount: number;
    memoryCardCount: number;
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
        task: 'memory.ingest';
        accepted: boolean;
        appliedFacts: number;
        appliedPatches: number;
        appliedSummaries: number;
        processingLevel?: MemoryProcessingLevel;
        summaryTier?: SummaryExecutionTier;
        windowHash?: string;
        reasonCodes?: string[];
        assistantTurnCount?: number;
        ts: number;
    }>;
    lastAcceptedAt: number;
}

export type MemoryMutationAction = 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE' | 'NOOP';
export type MemoryMutationHistoryAction = Exclude<MemoryMutationAction, 'NOOP'>;

export type MemoryMutationTargetKind = 'fact' | 'summary' | 'state';

export interface MemoryMutationHistoryEntry {
    mutationId: string;
    chatKey: string;
    ts: number;
    source: string;
    consumerPluginId: string;
    targetKind: MemoryMutationTargetKind;
    action: MemoryMutationHistoryAction;
    title: string;
    compareKey: string;
    targetRecordKey?: string;
    existingRecordKeys: string[];
    reasonCodes: string[];
    before: unknown;
    after: unknown;
    visibleMessageIds: string[];
    derivation?: DBDerivationSource;
}

/**
 * 功能：记录一次长期记忆变更规划中各动作的数量。
 * @param ADD 新增动作数量。
 * @param MERGE 合并动作数量。
 * @param UPDATE 覆盖更新动作数量。
 * @param INVALIDATE 失效替换动作数量。
 * @param DELETE 删除动作数量。
 * @param NOOP 跳过动作数量。
 * @returns 变更动作计数对象。
 */
export interface MemoryMutationActionCounts {
    ADD: number;
    MERGE: number;
    UPDATE: number;
    INVALIDATE: number;
    DELETE: number;
    NOOP: number;
}

/**
 * 功能：描述单条提议在 mutation planner 中的决策结果。
 * @param itemId 规划项唯一标识。
 * @param targetKind 目标记录类型。
 * @param action 最终动作。
 * @param title 面向界面的短标题。
 * @param compareKey 用于命中旧记录的规范比较键。
 * @param normalizedText 归一化后的比较文本。
 * @param targetRecordKey 执行时命中的目标记录键。
 * @param existingRecordKeys 规划时参与比较的旧记录键列表。
 * @param reasonCodes 决策原因码。
 * @returns mutation planner 单项快照。
 */
export interface MemoryMutationPlanItem {
    itemId: string;
    targetKind: MemoryMutationTargetKind;
    action: MemoryMutationAction;
    title: string;
    compareKey: string;
    normalizedText: string;
    targetRecordKey?: string;
    existingRecordKeys: string[];
    reasonCodes: string[];
}

/**
 * 功能：保存最近一次长期记忆 mutation planner 的执行快照。
 * @param source 触发来源。
 * @param consumerPluginId 触发插件标识。
 * @param generatedAt 规划时间。
 * @param totalItems 本轮进入规划的总条数。
 * @param appliedItems 本轮真正落库的条数。
 * @param actionCounts 各类动作数量。
 * @param items 最近若干条规划项快照。
 * @returns mutation planner 摘要快照。
 */
export interface MemoryMutationPlanSnapshot {
    source: string;
    consumerPluginId: string;
    generatedAt: number;
    totalItems: number;
    appliedItems: number;
    actionCounts: MemoryMutationActionCounts;
    items: MemoryMutationPlanItem[];
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

export interface PromptInjectionProfile {
    layoutMode: PromptLayoutMode;
    insertionRole: PromptInsertionRole;
    insertionPosition: PromptInsertionPosition;
    queryMode: PromptQueryMode;
    settingOnlyMinScore: number;
}

/**
 * 功能：描述本轮 Memory Context 实际使用了哪些分层块。
 * @param kind 分层块类型。
 * @param actorKey 关联角色键。
 * @param candidateCount 进入该分层块的候选数量。
 * @param sectionHints 命中的区段列表。
 * @param reasonCodes 形成该分层块的原因码。
 * @returns 分层块使用记录。
 */
export interface MemoryContextBlockUsage {
    kind: 'memoryos_worldinfo' | 'memoryos_roles';
    actorKey: string | null;
    candidateCount: number;
    sectionHints: InjectionSectionName[];
    reasonCodes: string[];
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
    layoutMode: PromptLayoutMode;
    insertionRole: PromptInsertionRole;
    insertionPosition: PromptInsertionPosition;
    queryMode: PromptQueryMode;
    shouldTrimPrompt: boolean;
    blocksUsed: MemoryContextBlockUsage[];
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

export type MemoryProcessingLevel = 'none' | 'light' | 'medium' | 'heavy';

export type SummaryExecutionTier = 'none' | 'short' | 'long';

export type HeavyProcessingTriggerKind = 'stage_completion' | 'structure_repair' | 'long_running' | 'archive_finalize' | 'special_event' | 'value_rich';

export interface PrecompressedWindowStats {
    originalLength: number;
    compressedLength: number;
    removedGreetingCount: number;
    removedDuplicateCount: number;
    mergedRunCount: number;
    truncatedToolOutputCount: number;
}

export interface MemoryProcessingDecision {
    level: MemoryProcessingLevel;
    summaryTier: SummaryExecutionTier;
    extractScope: MemoryProcessingLevel;
    reasonCodes: string[];
    heavyTriggerKind: HeavyProcessingTriggerKind | null;
    cooldownBlocked: boolean;
    windowHash: string;
    windowEventCount: number;
    windowUserMessageCount: number;
    generatedAt: number;
    precompressedStats: PrecompressedWindowStats;
}

export interface LongSummaryCooldownState {
    lastLongSummaryAt: number;
    lastLongSummaryWindowHash: string;
    lastLongSummaryReason: string;
    lastLongSummaryStage: ChatLifecycleStage;
    lastHeavyProcessAt: number;
    lastLongSummaryAssistantTurnCount: number;
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

export type SemanticKnowledgeLevel = 'confirmed' | 'rumor' | 'inferred';

export type SemanticWorldFacet = 'rule' | 'constraint' | 'social' | 'culture' | 'event' | 'danger' | 'entity' | 'other';

export interface SemanticWorldFacetEntry {
    title: string;
    summary: string;
    facet: SemanticWorldFacet;
    knowledgeLevel: SemanticKnowledgeLevel;
    scopeType: WorldStateScopeType;
    nationName?: string;
    regionName?: string;
    cityName?: string;
    locationName?: string;
    appliesTo?: string;
    tags?: string[];
}

export interface SemanticAiRoleRelationshipSummary {
    targetActorKey?: string;
    targetLabel: string;
    label: string;
    detail: string;
}

export interface SemanticAiRoleAssetSummary {
    kind: 'item' | 'equipment';
    name: string;
    detail: string;
}

export interface SemanticAiRoleProfileSummary {
    actorKey?: string;
    displayName: string;
    aliases: string[];
    identityFacts: string[];
    originFacts: string[];
    relationshipFacts: SemanticAiRoleRelationshipSummary[];
    items: SemanticAiRoleAssetSummary[];
    equipments: SemanticAiRoleAssetSummary[];
    currentLocation: string;
    organizationMemberships: string[];
    activeTasks: string[];
}

export type SemanticTaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';

export interface SemanticTaskDetailSummary {
    title: string;
    summary: string;
    status: SemanticTaskStatus;
    objective: string;
    completionCriteria: string;
    progressNote: string;
    ownerActorKeys: string[];
    organizationNames: string[];
    locationName: string;
}

export interface SemanticOrganizationDetailSummary {
    name: string;
    summary: string;
    aliases: string[];
    parentOrganizationName: string;
    ownershipStatus: string;
    relatedActorKeys: string[];
    locationName: string;
}

export interface SemanticMajorEventDetailSummary {
    title: string;
    summary: string;
    phase: string;
    locationName: string;
    relatedActorKeys: string[];
    organizationNames: string[];
    impact: string;
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
    organizations: string[];
    calendarSystems: string[];
    currencySystems: string[];
    socialSystems: string[];
    culturalPractices: string[];
    majorEvents: string[];
    dangers: string[];
    otherWorldDetails: string[];
    tasks: string[];
    relationshipFacts: string[];
    catchphrases: string[];
    relationshipAnchors: string[];
    styleCues: string[];
    nationDetails: SemanticCatalogEntrySummary[];
    regionDetails: SemanticCatalogEntrySummary[];
    cityDetails: SemanticCatalogEntrySummary[];
    locationDetails: SemanticCatalogEntrySummary[];
    organizationDetails: SemanticOrganizationDetailSummary[];
    taskDetails: SemanticTaskDetailSummary[];
    majorEventDetails: SemanticMajorEventDetailSummary[];
    ruleDetails: SemanticWorldFacetEntry[];
    constraintDetails: SemanticWorldFacetEntry[];
    socialSystemDetails: SemanticWorldFacetEntry[];
    culturalPracticeDetails: SemanticWorldFacetEntry[];
    dangerDetails: SemanticWorldFacetEntry[];
    entityDetails: SemanticWorldFacetEntry[];
    otherWorldDetailDetails: SemanticWorldFacetEntry[];
    roleProfiles: SemanticAiRoleProfileSummary[];
    generatedAt: number;
    source: 'ai';
}

export interface SemanticCatalogEntrySummary {
    name: string;
    summary: string;
    knowledgeLevel?: SemanticKnowledgeLevel;
    nationName?: string;
    nationKnowledgeLevel?: SemanticKnowledgeLevel;
    regionName?: string;
    regionKnowledgeLevel?: SemanticKnowledgeLevel;
    cityName?: string;
    cityKnowledgeLevel?: SemanticKnowledgeLevel;
    aliases?: string[];
    tags?: string[];
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
    roleProfileSeeds?: Record<string, RoleProfile>;
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

export type MemoryCardLane = 'identity' | 'style' | 'relationship' | 'rule' | 'event' | 'state' | 'other';

export type RecallCandidateRecordKind = MemoryRecordKind | 'event' | 'lorebook';

export type RecallCandidateSource = 'facts' | 'summaries' | 'state' | 'relationships' | 'events' | 'vector' | 'memory_card' | 'lorebook';

export type RecallVisibilityPool = 'global' | 'actor' | 'blocked';

export type RecallViewpointMode = 'omniscient_director' | 'actor_bounded';

export type RecallActorFocusTier = 'shared' | 'primary' | 'secondary' | 'blocked';

export interface RecallActorFocusBudgetShare {
    global: number;
    primaryActor: number;
    secondaryActors: number;
}

export interface RecallActorFocus {
    primaryActorKey: string | null;
    secondaryActorKeys: string[];
    budgetShare: RecallActorFocusBudgetShare;
    reasonCodes: string[];
}

export interface RecallViewpoint {
    mode: RecallViewpointMode;
    activeActorKey?: string | null;
    allowSharedScene: boolean;
    allowWorldState: boolean;
    allowForeignPrivateMemory: boolean;
    focus: RecallActorFocus;
}

export type MemoryPrivacyClass = 'shared' | 'private' | 'contextual';

export type RecallViewpointReason = 'shared' | 'owned_by_actor' | 'retained_for_actor' | 'foreign_private_suppressed';

export type MemoryType = 'identity' | 'event' | 'relationship' | 'world' | 'status' | 'dialogue' | 'other';

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
    | 'dialogue_quote'
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

export interface RoleRelationshipFact {
    targetActorKey?: string;
    targetLabel: string;
    label: string;
    detail: string;
    sourceRefs: string[];
}

export interface RoleAssetEntry {
    kind: 'item' | 'equipment';
    name: string;
    detail: string;
    sourceRefs: string[];
}

export interface RoleProfile {
    actorKey: string;
    displayName: string;
    aliases: string[];
    identityFacts: string[];
    originFacts: string[];
    relationshipFacts: RoleRelationshipFact[];
    items: RoleAssetEntry[];
    equipments: RoleAssetEntry[];
    currentLocation: string;
    organizationMemberships: string[];
    activeTasks: string[];
    updatedAt: number;
}

export interface DialogueMemoryFact {
    ownerActorKey: string;
    speakerActorKey: string;
    speakerLabel: string;
    quoteText: string;
    reason: string;
    sourceMessageId: string;
    updatedAt: number;
}

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
    visibilityPool: RecallVisibilityPool;
    privacyClass: MemoryPrivacyClass;
    viewpointReason: RecallViewpointReason;
    actorFocusTier: RecallActorFocusTier;
    actorVisibilityScore: number;
    actorForgetProbability?: number;
    actorForgotten?: boolean;
    actorRetentionBias?: number;
    ownerActorKey?: string | null;
    participantActorKeys?: string[];
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
    viewpoint: RecallViewpoint;
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

export type WorldStateScopeType = 'global' | 'nation' | 'region' | 'city' | 'location' | 'organization' | 'item' | 'character' | 'scene' | 'unclassified';

export type WorldStateType = 'rule' | 'constraint' | 'event' | 'status' | 'capability' | 'ownership' | 'culture' | 'danger' | 'relationship' | 'task' | 'relationship_hook' | 'other' | 'anomaly';

export interface WorldStateNodeValue {
    title: string;
    summary: string;
    scopeType: WorldStateScopeType;
    stateType: WorldStateType;
    knowledgeLevel?: SemanticKnowledgeLevel;
    subjectId?: string;
    nationId?: string;
    nationKnowledgeLevel?: SemanticKnowledgeLevel;
    regionId?: string;
    regionKnowledgeLevel?: SemanticKnowledgeLevel;
    cityId?: string;
    cityKnowledgeLevel?: SemanticKnowledgeLevel;
    locationId?: string;
    itemId?: string;
    canonicalKey?: string;
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

export type RecallNeedKind =
    | 'identity_direct'
    | 'relationship_direct'
    | 'rule_direct'
    | 'state_direct'
    | 'historical_event'
    | 'causal_trace'
    | 'style_inference'
    | 'ambiguous_recall'
    | 'mixed';

export interface RecallGateDecision {
    enabled: boolean;
    lanes: MemoryCardLane[];
    reasonCodes: string[];
    primaryNeed: RecallNeedKind;
    vectorMode: VectorMode;
}

export interface RecallCacheEntry {
    topicHash: string;
    intent: InjectionIntent;
    entityKeys: string[];
    laneSet: MemoryCardLane[];
    selectedCardIds: string[];
    generatedAt: number;
    expiresAt: number;
    generatedTurn: number;
    expiresTurn: number;
    baseVersion: number;
}

export interface CheapRecallSnapshot {
    primaryNeed: RecallNeedKind;
    coveredLanes: MemoryCardLane[];
    structuredCount: number;
    recentEventCount: number;
    enough: boolean;
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
    vectorGate?: {
        enabled: boolean;
        reasonCodes: string[];
        lanes: MemoryCardLane[];
        primaryNeed: RecallNeedKind;
        vectorMode: VectorMode;
    } | null;
    cache?: {
        hit: boolean;
        reasonCodes: string[];
        topicHash: string;
        entityKeys: string[];
        expiresTurn: number;
    } | null;
    cheapRecall?: CheapRecallSnapshot | null;
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

export interface MemoryTaskPresentationSettings {
    blockingDefaultMode: Extract<TaskSurfaceMode, 'fullscreen_blocking' | 'toast_blocking'>;
    showBackgroundToast: boolean;
    disableComposerDuringBlocking: boolean;
    toastAutoCloseSeconds: number;
    updatedAt: number;
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
    extractInterval: MEMORY_OS_POLICY.extract.defaultSummaryInterval,
    extractWindowSize: MEMORY_OS_POLICY.extract.defaultSummaryWindowSize,
    summaryEnabled: MEMORY_OS_POLICY.extract.defaultSummaryEnabled,
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
    layoutMode: 'layered_memory_context',
    insertionRole: 'user',
    insertionPosition: 'before_last_user',
    queryMode: 'always',
    settingOnlyMinScore: 0.35,
};

export const DEFAULT_SUMMARY_SETTINGS: SummarySettings = {
    workMode: {
        memoryMode: 'balanced',
        scenario: 'auto',
        resourcePriority: 'balanced',
    },
    summaryBehavior: {
        summaryTiming: 'stage_end',
        summaryLength: 'standard',
        longSummaryCooldown: 'standard',
        longSummaryTrigger: ['scene_end', 'combat_end', 'plot_advance', 'relationship_shift', 'world_change', 'structure_repair', 'archive_finalize'],
    },
    contentPreference: {
        recordFocus: ['facts', 'relationship', 'world', 'plot'],
        lowValueHandling: 'ignore',
        noiseFilter: 'medium',
    },
    advanced: {
        processInterval: 'medium',
        lookbackScope: 'medium',
        allowLightRelationExtraction: true,
        allowMediumWorldStateUpdate: true,
        allowHeavyRewriteSummaries: true,
        allowHeavyConsistencyRepair: true,
        allowHeavyExpandedLookback: true,
    },
    autoSummary: {
        enabled: true,
        manualTurnThresholdEnabled: false,
        manualTurnThreshold: 10,
        roleplayTurnThreshold: 8,
        chatTurnThreshold: 12,
        storyTurnThreshold: 10,
        mixedTurnThreshold: 10,
        minTurnsAfterLastSummary: 4,
        coolDownTurns: 3,
        enableTriggerRules: true,
        enableSemanticChangeTrigger: true,
        enablePromptPressureTrigger: true,
        triggerRuleMinScore: 0.66,
        semanticTriggerMinScore: 0.62,
        promptPressureTokenRatio: 0.72,
    },
};

export const DEFAULT_SUMMARY_SETTINGS_OVERRIDE: SummarySettingsOverride = {};

export const DEFAULT_VECTOR_LIFECYCLE: VectorLifecycleState = {
    vectorMode: 'off',
    factCount: 0,
    summaryCount: 0,
    memoryCardCount: 0,
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

export const DEFAULT_LONG_SUMMARY_COOLDOWN: LongSummaryCooldownState = {
    lastLongSummaryAt: 0,
    lastLongSummaryWindowHash: '',
    lastLongSummaryReason: '',
    lastLongSummaryStage: 'new',
    lastHeavyProcessAt: 0,
    lastLongSummaryAssistantTurnCount: 0,
};

export const DEFAULT_AUTO_SUMMARY_RUNTIME_STATE: AutoSummaryRuntimeState = {
    lastSummaryTurnCount: 0,
    lastSummaryAt: 0,
    lastTriggerReasonCodes: [],
    lastMode: 'mixed',
};

export const DEFAULT_MEMORY_INGEST_PROGRESS: MemoryIngestProgressState = {
    lastProcessedAssistantTurnId: undefined,
    lastProcessedAssistantMessageId: undefined,
    lastProcessedAssistantTurnCount: 0,
    lastProcessedSnapshotHash: '',
    lastProcessedRange: undefined,
    lastProcessedAt: 0,
    lastProcessedOutcome: 'skipped',
    lastRepairGeneration: 0,
};

export const DEFAULT_MEMORY_MUTATION_ACTION_COUNTS: MemoryMutationActionCounts = {
    ADD: 0,
    MERGE: 0,
    UPDATE: 0,
    INVALIDATE: 0,
    DELETE: 0,
    NOOP: 0,
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

export const DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS = {
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
        'memory.ingest': {
            taskId: 'memory.ingest',
            label: '统一记忆处理',
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
    personaMemoryProfiles?: PersonaMemoryProfileMap;
    roleProfiles?: Record<string, RoleProfile>;
    simpleMemoryPersonas?: SimpleMemoryPersonaMap;
    activeActorKey?: string;
    coldStartFingerprint?: string;
    coldStartStage?: ColdStartStage;
    coldStartPrimedAt?: number;
    coldStartBootstrapState?: ColdStartBootstrapState;
    coldStartBootstrapRequestId?: string;
    coldStartBootstrapUpdatedAt?: number;
    coldStartBootstrapError?: string;
    lastLorebookDecision?: LorebookGateDecision;
    mainlineTraceSnapshot?: MemoryMainlineTraceSnapshot | null;
    promptInjectionProfile?: PromptInjectionProfile;
    lastPreGenerationDecision?: PreGenerationGateDecision | null;
    lastPostGenerationDecision?: PostGenerationGateDecision | null;
    groupMemory?: GroupMemoryState;
    memoryLifecycleIndex?: Record<string, MemoryLifecycleState>;
    ownedMemoryIndex?: Record<string, OwnedMemoryState>;
    latestRecallExplanation?: LatestRecallExplanation | null;
    lastRecallCache?: RecallCacheEntry | null;
    recallCacheVersion?: number;
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
    summarySettingsOverride?: SummarySettingsOverride | null;
    vectorLifecycle?: VectorLifecycleState;
    vectorIndexVersion?: string;
    vectorMetadataRebuiltAt?: number;
    memoryQuality?: MemoryQualityScorecard;
    maintenanceAdvice?: MaintenanceAdvice[];
    maintenanceInsights?: MaintenanceInsight[];
    lastMaintenanceExecution?: MaintenanceExecutionResult;
    ingestHealth?: IngestHealthWindow;
    retrievalHealth?: RetrievalHealthWindow;
    extractHealth?: ExtractHealthWindow;
    lastMutationPlan?: MemoryMutationPlanSnapshot | null;
    lastProcessingDecision?: MemoryProcessingDecision | null;
    recentProcessingDecisions?: MemoryProcessingDecision[];
    longSummaryCooldown?: LongSummaryCooldownState;
    autoSummaryRuntime?: AutoSummaryRuntimeState;
    memoryIngestProgress?: MemoryIngestProgressState;
    lastAutoSummaryDecision?: AutoSummaryDecisionSnapshot | null;
    retentionPolicy?: RetentionPolicy;
    retentionArchives?: RetentionArchives;
    manualOverrides?: ManualOverrides;
    lastStrategyDecision?: StrategyDecision | null;
}
