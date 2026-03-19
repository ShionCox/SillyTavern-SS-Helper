import type { DBEvent, DBFact, DBSummary, DBWorldState } from './db';

export {}; // 确保该文件被识别为模块

// -- 事件信封 --
export type EventEnvelope<T = any> = {
    id: string;
    ts: number;
    chatKey: string;
    source: { pluginId: string; version: string };
    type: string;
    payload: T;
};

// -- 模板与提议相关类型 --
export interface TemplateFactType {
    type: string;
    pathPattern: string;
    slots: string[];
    defaultInjection?: string;
    [key: string]: any;
}

export interface WorldTemplate {
    templateId: string;
    chatKey: string;
    worldType: 'fantasy' | 'urban' | 'custom';
    name: string;
    factTypes: TemplateFactType[];
    extractPolicies: Record<string, any>;
    injectionLayout: Record<string, any>;
    worldInfoRef?: { book: string; hash: string };
    createdAt: number;
    /** v2: 多表定义 */
    tables: TemplateTableDef[];
    /** v2: 字段同义词映射 */
    fieldSynonyms?: Record<string, string[]>;
    /** v2: 表同义词映射 */
    tableSynonyms?: Record<string, string[]>;
    /** v2: 模板族 ID */
    templateFamilyId?: string;
    /** v2: 修订版本号 */
    revisionNo?: number;
    /** v2: 修订状态 */
    revisionState?: 'draft' | 'final';
    /** v2: 父模板 ID */
    parentTemplateId?: string | null;
    /** v2: Schema 指纹 */
    schemaFingerprint?: string;
    /** v2: 最后修改时间 */
    lastTouchedAt?: number;
    /** v2: 定稿时间 */
    finalizedAt?: number | null;
}

export interface TemplateBinding {
    bindingKey: string;
    chatKey: string;
    activeTemplateId: string;
    worldInfoHash: string;
    isLocked?: boolean;
    boundAt: number;
}

export interface FactProposal {
    factKey?: string;
    targetRecordKey?: string;
    action?: 'auto' | 'update' | 'merge' | 'delete' | 'invalidate';
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
    provenance?: any;
}

export interface PatchProposal {
    op: 'add' | 'replace' | 'remove';
    path: string;
    value?: any;
}

export interface SummaryProposal {
    level: 'message' | 'scene' | 'arc';
    summaryId?: string;
    targetRecordKey?: string;
    action?: 'auto' | 'update' | 'merge' | 'delete' | 'invalidate';
    title?: string;
    content: string;
    keywords?: string[];
    messageId?: string;
    range?: { fromMessageId?: string; toMessageId?: string };
    source?: {
        extractor?: string;
        provider?: string;
        provenance?: Record<string, unknown>;
    };
}

export interface ProposalEnvelope {
    ok: boolean;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        notes?: string;
        /** v2: 模板 schema 变更提案 */
        schemaChanges?: SchemaChangeProposal[];
        /** v2: 实体解析提案 */
        entityResolutions?: EntityResolutionProposal[];
    };
    confidence: number;
}

/** v2: Schema 变更提案 */
export interface SchemaChangeProposal {
    kind: 'add_table' | 'add_field' | 'modify_primary_key' | 'modify_description' | 'alias_suggestion';
    tableKey: string;
    fieldKey?: string;
    payload: Record<string, unknown>;
    requiredByFacts?: boolean;
}

/** v2: 实体解析提案 */
export interface EntityResolutionProposal {
    tableKey: string;
    fromRowId: string;
    toRowId: string;
    confidence: number;
    reason: string;
}

/** v2: 延迟 schema 提示 */
export interface DeferredSchemaHint {
    change: SchemaChangeProposal;
    deferredAt: number;
    reason: string;
}

export interface GateResult {
    passed: boolean;
    gate: string;
    errors: string[];
}

export interface ProposalResult {
    accepted: boolean;
    applied: {
        factKeys: string[];
        statePaths: string[];
        summaryIds: string[];
        /** v2: 已应用的 schema 变更数 */
        schemaChangesApplied?: number;
        /** v2: 被延迟的 schema 变更数 */
        schemaChangesDeferred?: number;
        /** v2: 实体解析结果 */
        entityResolutions?: number;
    };
    rejectedReasons: string[];
    gateResults: GateResult[];
    /** v2: 本轮产生的延迟 schema 提示 */
    deferredSchemaHints?: DeferredSchemaHint[];
    mutationPlan?: MemoryMutationPlanSnapshot | null;
}

export interface WriteRequest {
    source: { pluginId: string; version: string };
    chatKey: string;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        /** v2: 模板 schema 变更提案 */
        schemaChanges?: SchemaChangeProposal[];
        /** v2: 实体解析提案 */
        entityResolutions?: EntityResolutionProposal[];
    };
    reason: string;
    /** v2: 上一轮被延迟的 schema 提示 */
    deferredSchemaHints?: DeferredSchemaHint[];
}

export interface HybridSearchResult {
    content: string;
    score: number;
    source: 'vector' | 'keyword' | 'event';
    meta?: any;
}

export interface CompactionResult {
    summariesCreated?: number;
    eventsArchived?: number;
    statesUpdated?: number;
}

// -- v2: 模板表定义 --
export interface TemplateTableDef {
    key: string;
    label: string;
    isBase: boolean;
    primaryKeyField: string;
    source?: 'persisted' | 'derived';
    fields: Array<{
        key: string;
        label: string;
        tier: 'core' | 'extension';
        description?: string;
        fillSpec?: string;
        isPrimaryKey?: boolean;
    }>;
    description?: string;
}

// -- v2: 聊天级状态类型 --
export interface AutoSchemaPolicy {
    maxNewTablesPerRound?: number;
    maxNewFieldsPerRound?: number;
    maxNewFieldsPerTable?: number;
    tableNameConflictThreshold?: number;
    descriptionSimilarityThreshold?: number;
}

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

export interface SummarySettings {
    workMode: SummarySettingsWorkMode;
    summaryBehavior: SummarySettingsSummaryBehavior;
    contentPreference: SummarySettingsContentPreference;
    advanced: SummarySettingsAdvanced;
}

export interface SummarySettingsOverride {
    workMode?: Partial<SummarySettingsWorkMode>;
    summaryBehavior?: Partial<SummarySettingsSummaryBehavior>;
    contentPreference?: Partial<SummarySettingsContentPreference>;
    advanced?: Partial<SummarySettingsAdvanced>;
}

export interface EffectiveSummarySettings extends SummarySettings {
    source: SummarySettingsSource;
    resolvedScenario: Exclude<SummaryScenario, 'auto'> | 'custom';
    resolvedChatType: ChatType;
}

export type DeletionStrategy = 'soft_delete' | 'immediate_purge';

export type MemoryProcessingLevel = 'none' | 'light' | 'medium' | 'heavy';

export type SummaryExecutionTier = 'none' | 'short' | 'long';

export type HeavyProcessingTriggerKind =
    | 'stage_completion'
    | 'structure_repair'
    | 'long_running'
    | 'archive_finalize'
    | 'special_event'
    | 'value_rich';

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
    lastLongSummaryStage: string;
    lastHeavyProcessAt: number;
    lastLongSummaryAssistantTurnCount: number;
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

export interface MemoryMainlineTraceEntry extends MemoryTraceContext {
    ok: boolean;
    label: string;
    detail?: Record<string, unknown>;
}

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

export type VectorMode = 'off' | 'index_only' | 'search' | 'search_rerank';

export type MemoryQualityLevel = 'excellent' | 'healthy' | 'watch' | 'poor' | 'critical';

export type MaintenanceActionType = 'compress' | 'rebuild_summary' | 'memory_card_rebuild' | 'schema_cleanup' | 'group_maintenance';

export type MaintenanceSeverity = 'info' | 'warning' | 'critical';

export type MaintenanceSurface = 'panel' | 'compact' | 'toast';

export type ChatLifecycleStage = 'new' | 'active' | 'stable' | 'long_running' | 'archived' | 'deleted';

export interface ChatProfileVectorStrategy {
    enabled: boolean;
    chunkThreshold: number;
    rerankThreshold: number;
    activationFacts: number;
    activationSummaries: number;
    idleDecayDays: number;
    lowPrecisionSearchStride: number;
}

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
        task: 'memory.summarize' | 'memory.extract';
        accepted: boolean;
        appliedFacts: number;
        appliedPatches: number;
        appliedSummaries: number;
        ts: number;
    }>;
    lastAcceptedAt: number;
}

export type MemoryMutationAction = 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE' | 'NOOP';
export type MemoryMutationHistoryAction = Exclude<MemoryMutationAction, 'NOOP'>;

export type MemoryMutationTargetKind = 'fact' | 'summary' | 'state';

export interface MemoryMutationActionCounts {
    ADD: number;
    MERGE: number;
    UPDATE: number;
    INVALIDATE: number;
    DELETE: number;
    NOOP: number;
}

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

export interface MemoryMutationPlanSnapshot {
    source: string;
    consumerPluginId: string;
    generatedAt: number;
    totalItems: number;
    appliedItems: number;
    actionCounts: MemoryMutationActionCounts;
    items: MemoryMutationPlanItem[];
}

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

export type VectorMemorySourceKind = 'fact' | 'summary' | 'unknown';

export type VectorMemoryStatusKind =
    | 'normal'
    | 'recent_hit'
    | 'long_unused'
    | 'source_missing'
    | 'archived_residual'
    | 'needs_rebuild';

export interface VectorMemoryUsageSnapshot {
    totalHits: number;
    selectedHits: number;
    hitsIn7d: number;
    hitsIn30d: number;
    lastHitAt: number | null;
    lastSelectedAt: number | null;
    lastQuery: string | null;
    lastScore: number | null;
}

export type MemoryCardScope = 'chat' | 'character' | 'world';
export type MemoryCardLane = 'identity' | 'style' | 'relationship' | 'rule' | 'event' | 'state' | 'other';
export type MemoryCardStatus = 'active' | 'superseded' | 'invalidated';
export type MemoryCardTtl = 'short' | 'medium' | 'long';

export interface RawContextBlock {
    sourceKind: string;
    rawText: string;
    hints: string[];
    sourceRefs: string[];
    sourceRecordKey: string | null;
    sourceRecordKind: string | null;
}

export interface MemoryCardDraft {
    scope: MemoryCardScope;
    lane: MemoryCardLane;
    subject: string;
    title: string;
    memoryText: string;
    evidenceText?: string | null;
    entityKeys: string[];
    keywords: string[];
    importance: number;
    confidence: number;
    ttl: MemoryCardTtl;
    replaceKey?: string | null;
    sourceRefs: string[];
    sourceRecordKey: string | null;
    sourceRecordKind: string | null;
    ownerActorKey?: string | null;
    participantActorKeys: string[];
    validFrom?: number;
    validTo?: number;
}

export interface MemoryCard extends MemoryCardDraft {
    cardId: string;
    chatKey: string;
    status: MemoryCardStatus;
    createdAt: number;
    updatedAt: number;
}

export interface MemorySummaryEnvelope {
    summary: string;
    memoryCards: MemoryCardDraft[];
}

export interface VectorMemoryRecordSummary {
    chunkId: string;
    cardId?: string;
    chatKey: string;
    content: string;
    preview: string;
    contentHash: string;
    contentLength: number;
    createdAt: number;
    sourceRecordKey: string | null;
    sourceRecordKind: VectorMemorySourceKind;
    sourceLabel: string;
    sourceDetail: string;
    ownerActorKey: string | null;
    ownerActorLabel: string | null;
    sourceScope: string | null;
    memoryType: string | null;
    memorySubtype: string | null;
    participantActorKeys: string[];
    participantActorLabels: string[];
    anchorMessageId: string | null;
    sourceMessageIds: string[];
    sourceTraceKind: string | null;
    sourceReason: string | null;
    sourceViewHash: string | null;
    sourceSnapshotHash: string | null;
    sourceRepairGeneration: number | null;
    embeddingModel: string | null;
    embeddingDimensions: number | null;
    statusKind: VectorMemoryStatusKind;
    statusLabel: string;
    statusTone: 'success' | 'warning' | 'danger' | 'muted';
    statusReasons: string[];
    isArchived: boolean;
    sourceMissing: boolean;
    needsRebuild: boolean;
    duplicateCount: number;
    usage: VectorMemoryUsageSnapshot;
}

export interface MemoryCardSummary extends VectorMemoryRecordSummary {
    cardId: string;
    lane: MemoryCardLane;
    subject: string;
    title: string;
    memoryText: string;
    evidenceText: string | null;
    ttl: MemoryCardTtl;
    replaceKey: string | null;
    status: MemoryCardStatus;
    cardIds: string[];
}

export interface VectorMemorySearchTestHit {
    chunkId: string;
    cardId?: string;
    sourceRecordKey: string | null;
    sourceRecordKind: VectorMemorySourceKind;
    sourceLabel: string;
    preview: string;
    vectorScore: number;
    initialRank: number | null;
    rerankedRank: number | null;
    finalRank: number | null;
    matchedInRecall: boolean;
    enteredContext: boolean;
    reasonCodes: string[];
}

export interface MemoryRecallPreviewHit extends VectorMemorySearchTestHit {
    cardId: string;
    lane: MemoryCardLane;
    subject: string;
    title: string;
    ttl: MemoryCardTtl;
    status: MemoryCardStatus;
}

  export interface VectorMemorySearchTestResult {
      query: string;
      testedAt: number;
      rerankApplied: boolean;
      hitCount: number;
      selectedCount: number;
      hits: VectorMemorySearchTestHit[];
      vectorGate?: LatestRecallExplanation['vectorGate'];
      cache?: LatestRecallExplanation['cache'];
      cheapRecall?: CheapRecallSnapshot | null;
  }

export interface MemoryRecallPreviewResult extends VectorMemorySearchTestResult {
    hits: MemoryRecallPreviewHit[];
}

export interface VectorMemoryViewerSnapshot {
    chatKey: string;
    generatedAt: number;
    totalCount: number;
    archivedCount: number;
    sourceMissingCount: number;
    needsRebuildCount: number;
    recentHitCount: number;
    longUnusedCount: number;
    items: VectorMemoryRecordSummary[];
}

export interface MemoryCardViewerSnapshot {
    chatKey: string;
    generatedAt: number;
    totalCount: number;
    archivedCount: number;
    sourceMissingCount: number;
    needsRebuildCount: number;
    recentHitCount: number;
    longUnusedCount: number;
    items: MemoryCardSummary[];
}

export interface AdaptivePolicy {
    extractInterval: number;
    extractWindowSize: number;
    summaryEnabled: boolean;
    summaryMode: SummaryStrategy;
    entityResolutionLevel: 'low' | 'medium' | 'high';
    speakerTrackingLevel: 'low' | 'medium' | 'high';
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

export interface MemoryContextBlockUsage {
    kind: 'director_context' | 'active_character_memory';
    actorKey: string | null;
    candidateCount: number;
    sectionHints: InjectionSectionName[];
    reasonCodes: string[];
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

export interface RetentionPolicy {
    deletionStrategy: DeletionStrategy;
    keepSummaryCount: number;
    keepEventCount: number;
    keepVectorDays: number;
}

export interface StrategyDecision {
    intent: InjectionIntent;
    sectionsUsed: InjectionSectionName[];
    budgets: Partial<Record<InjectionSectionName, number>>;
    reasonCodes: string[];
    generatedAt: number;
}

export interface BuildContextDecision {
    text: string;
    sectionsUsed: InjectionSectionName[];
    budgets: Partial<Record<InjectionSectionName, number>>;
    intent: InjectionIntent;
    reasonCodes: string[];
    preDecision: PreGenerationGateDecision;
}

// -- v2: 行操作类型 --
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

export type LorebookGateMode = 'force_inject' | 'soft_inject' | 'summary_only' | 'block';

export type StyleSeedMode = 'narrative' | 'rp' | 'setting_qa' | 'tool' | 'balanced';

export type ColdStartStage = 'seeded' | 'prompt_primed' | 'extract_primed';

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

export type SemanticWorldFacet = 'rule' | 'constraint' | 'social' | 'culture' | 'history' | 'danger' | 'entity' | 'other';

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
    nationDetails: SemanticCatalogEntrySummary[];
    regionDetails: SemanticCatalogEntrySummary[];
    cityDetails: SemanticCatalogEntrySummary[];
    locationDetails: SemanticCatalogEntrySummary[];
    ruleDetails: SemanticWorldFacetEntry[];
    constraintDetails: SemanticWorldFacetEntry[];
    socialSystemDetails: SemanticWorldFacetEntry[];
    culturalPracticeDetails: SemanticWorldFacetEntry[];
    historicalEventDetails: SemanticWorldFacetEntry[];
    dangerDetails: SemanticWorldFacetEntry[];
    entityDetails: SemanticWorldFacetEntry[];
    otherWorldDetailDetails: SemanticWorldFacetEntry[];
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

export type MemoryPrivacyClass = 'shared' | 'private' | 'contextual';

export type RecallViewpointReason = 'shared' | 'owned_by_actor' | 'retained_for_actor' | 'foreign_private_suppressed';

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

export interface MemoryOSChatState {
    logicalChatView?: LogicalChatView;
    semanticSeed?: ChatSemanticSeed;
    personaMemoryProfile?: PersonaMemoryProfile;
    personaMemoryProfiles?: PersonaMemoryProfileMap;
    simpleMemoryPersona?: SimpleMemoryPersona;
    simpleMemoryPersonas?: SimpleMemoryPersonaMap;
    activeActorKey?: string;
    coldStartFingerprint?: string;
    coldStartStage?: ColdStartStage;
    coldStartPrimedAt?: number;
    memoryLifecycleIndex?: Record<string, MemoryLifecycleState>;
    ownedMemoryIndex?: Record<string, OwnedMemoryState>;
    latestRecallExplanation?: LatestRecallExplanation | null;
    lastRecallCache?: RecallCacheEntry | null;
    recallCacheVersion?: number;
    mainlineTraceSnapshot?: MemoryMainlineTraceSnapshot | null;
    summarySettingsOverride?: SummarySettingsOverride | null;
    memoryTuningProfile?: MemoryTuningProfile;
    mutationRepairQueue?: MutationRepairTask[];
    lastMutationRepairViewHash?: string;
    lastMutationRepairAt?: number;
    mutationRepairGeneration?: number;
    vectorIndexVersion?: string;
    vectorMetadataRebuiltAt?: number;
    lastMutationPlan?: MemoryMutationPlanSnapshot | null;
}

export interface RowRefResolution {
    resolved: boolean;
    rowId: string | null;
    source: 'exact' | 'redirect' | 'alias' | 'fuzzy';
    input: string;
    flattenedRedirect?: boolean;
}

export interface RowMergeResult {
    success: boolean;
    migratedFactKeys: string[];
    updatedRedirects: number;
    updatedAliases: number;
    auditId?: string;
    error?: string;
}

export interface RowSeedData {
    [fieldKey: string]: unknown;
}

export interface LogicTableRow {
    rowId: string;
    tableKey: string;
    values: Record<string, unknown>;
    factKeys: Record<string, string>;
    tombstoned: boolean;
    redirectedTo: string | null;
    aliases: string[];
    updatedAt: number;
}

export interface LogicTableQueryOpts {
    limit?: number;
    includeTombstones?: boolean;
    keywords?: string[];
}

export type LogicTableStatus = 'healthy' | 'sparse' | 'hidden' | 'needs_attention';

export interface LogicColumnDef {
    key: string;
    label: string;
    editable: boolean;
    tier?: 'core' | 'extension';
    isPrimaryKey?: boolean;
}

export interface LogicCellValue {
    value: unknown;
    editable: boolean;
    sourceKinds: EditorSourceKind[];
    confidence?: number;
}

export interface LogicRowView {
    rowId: string;
    displayName: string;
    rowKind: 'materialized' | 'derived' | 'redirected' | 'tombstoned';
    values: Record<string, LogicCellValue>;
    aliases: string[];
    redirectedTo?: string | null;
    warnings: string[];
    sourceRefs: SourceRef[];
    updatedAt?: number;
}

export interface DerivedRowCandidate {
    candidateId: string;
    tableKey: string;
    title: string;
    rowId: string;
    values: Record<string, LogicCellValue>;
    aliases: string[];
    warnings: string[];
    sourceRefs: SourceRef[];
    updatedAt?: number;
}

export interface LogicTableSummary {
    tableKey: string;
    title: string;
    status: LogicTableStatus;
    materializedRowCount: number;
    derivedRowCount: number;
    tombstonedRowCount: number;
    redirectedRowCount: number;
}

export interface LogicTableViewModel {
    tableKey: string;
    title: string;
    columns: LogicColumnDef[];
    status: LogicTableStatus;
    sourceCoverage: {
        factRows: number;
        derivedRows: number;
        redirectedRows: number;
        tombstonedRows: number;
        aliasCount: number;
    };
    rows: LogicRowView[];
    warnings: string[];
}

export type LogicTableRepairMode = 'normalize_aliases' | 'compact_tombstones' | 'rebuild_candidates';

export interface SchemaContextResult {
    source: 'active_draft' | 'active_final' | 'base_schema' | 'fallback_prompt';
    schemaSummary: string;
    dataSnapshot: string;
    degraded: boolean;
    degradeReason?: string;
}

// -- BUS 接口 --
export interface STXBus {
    emit<T>(type: string, payload: T, opts?: { chatKey?: string }): void;
    on<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
    once<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
    off(type: string, handler: Function): void;
}

export interface RegistryChangeEvent {
    pluginId: string;
    action: 'add' | 'update';
    manifest: PluginManifest;
    degraded: boolean;
    reason?: string;
    ts: number;
}

export type EditorSourceKind = 'fact' | 'world_state' | 'semantic_seed' | 'group_memory' | 'summary' | 'manual' | 'derived';

export interface SourceRef {
    kind: EditorSourceKind;
    label: string;
    recordId?: string;
    path?: string;
    ts?: number;
    note?: string;
}

export interface SnapshotValue {
    value: string;
    confidence: number;
    sourceKinds: EditorSourceKind[];
    updatedAt?: number;
    sourceRefs?: SourceRef[];
}

export interface CharacterSnapshot {
    actorKey: string;
    displayName: string;
    aliases: SnapshotValue[];
    identities: SnapshotValue[];
    relationshipAnchors: SnapshotValue[];
    currentLocation?: SnapshotValue;
    lastActiveAt?: number;
    sourceRefs?: SourceRef[];
}

export interface SceneSnapshot {
    currentScene?: SnapshotValue | null;
    currentConflict?: SnapshotValue | null;
    pendingEvents: SnapshotValue[];
    participants: SnapshotValue[];
}

export interface ChatContextSnapshot {
    visibleMessageCount: number;
    invalidatedMessageCount: number;
    activeMessageIds: string[];
    editedRevisionCount: number;
    deletedTurnCount: number;
    branchRootCount: number;
    mutationKinds: string[];
    lastMutationAt?: number;
    rebuildRecommended: boolean;
}

export type EditorHealthSuggestedAction = 'rebuild_chat_view' | 'refresh_seed' | 'normalize_rows' | 'review_candidates';

export interface EditorHealthIssue {
    id: string;
    severity: MaintenanceSeverity;
    label: string;
    detail: string;
    actionLabel?: string;
}

export interface EditorDataLayerSnapshot {
    factsCount: number;
    worldStateCount: number;
    summaryCount: number;
    eventCount: number;
    activeTemplateId?: string | null;
    hasSemanticSeed: boolean;
    hasLogicalChatView: boolean;
    hasGroupMemory: boolean;
    hasDraftRevision: boolean;
    aliasCount: number;
    redirectCount: number;
    tombstoneCount: number;
}

export interface EditorHealthSnapshot {
    orphanFactsCount?: number;
    duplicateEntityRisk?: number;
    hasDraftRevision: boolean;
    maintenanceLabels: string[];
    suggestedActions: EditorHealthSuggestedAction[];
    issues: EditorHealthIssue[];
    dataLayers: EditorDataLayerSnapshot;
}

export interface CanonSnapshot {
    chatKey: string;
    generatedAt: number;
    world: {
        templateId?: string | null;
        currentLocation?: SnapshotValue | null;
        overview?: SnapshotValue | null;
        locations: SnapshotValue[];
        rules: SnapshotValue[];
        hardConstraints: SnapshotValue[];
        activeLorebooks: SnapshotValue[];
        groupMembers: SnapshotValue[];
    };
    characters: CharacterSnapshot[];
    scene: SceneSnapshot;
    chat: ChatContextSnapshot;
    health: EditorHealthSnapshot;
}

export interface EditorExperienceSnapshot {
    chatKey: string;
    canon: CanonSnapshot;
    profile: ChatProfile;
    quality: MemoryQualityScorecard;
    lifecycle: ChatLifecycleState;
    activeActorKey: string | null;
    retention: RetentionPolicy;
    semanticSeed: ChatSemanticSeed | null;
    simplePersona: SimpleMemoryPersona | null;
    groupMemory: GroupMemoryState | null;
    relationshipState: RelationshipState[];
    logicalView: LogicalChatView | null;
    lorebookDecision: LorebookGateDecision | null;
    preDecision: PreGenerationGateDecision | null;
    postDecision: PostGenerationGateDecision | null;
    processingDecision: MemoryProcessingDecision | null;
    longSummaryCooldown: LongSummaryCooldownState;
    summarySettings: SummarySettings;
    summarySettingsOverride: SummarySettingsOverride;
    effectiveSummarySettings: EffectiveSummarySettings;
    summarySettingsSource: SummarySettingsSource;
    lifecycleSummary: MemoryLifecycleState[];
    recallLog: RecallLogEntry[];
    latestRecallExplanation: LatestRecallExplanation | null;
    mainlineTraceSnapshot: MemoryMainlineTraceSnapshot;
    tuningProfile: MemoryTuningProfile;
    maintenanceInsights: MaintenanceInsight[];
    mutationHistory: MemoryMutationHistoryEntry[];
    facts: DBFact[];
    summaries: DBSummary[];
    events: DBEvent[];
    states: DBWorldState[];
    lastMutationPlan: MemoryMutationPlanSnapshot | null;
    vectorIndexVersion: string | null;
    vectorMetadataRebuiltAt: number | null;
}

// -- MemorySDK 接口 --
export interface MemorySDK {
    getChatKey(): string;
    getActiveTemplateId(): Promise<string | null>;
    setActiveTemplateId(templateId: string): Promise<void>;

    events: {
        append<T>(type: string, payload: T, meta?: { sourceMessageId?: string; sourcePlugin?: string }): Promise<string>;
        query(opts: { type?: string; sinceTs?: number; limit?: number }): Promise<Array<EventEnvelope<any>>>;
    };

    facts: {
        upsert(fact: {
            factKey?: string;
            type: string;
            entity?: { kind: string; id: string };
            path?: string;
            value: any;
            confidence?: number;
            provenance?: any;
        }): Promise<string>;
        get(factKey: string): Promise<any | null>;
        query(opts: { type?: string; entity?: { kind: string; id: string }; pathPrefix?: string; limit?: number }): Promise<any[]>;
        remove(factKey: string): Promise<void>;
    };

    state: {
        get(path: string): Promise<any | null>;
        set(path: string, value: any, meta?: { sourceEventId?: string }): Promise<void>;
        patch(patches: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: any }>, meta?: any): Promise<void>;
        query(prefix: string): Promise<Record<string, any>>;
        queryStructured(prefix?: string): Promise<StructuredWorldStateEntry[]>;
        queryGrouped(prefix?: string): Promise<WorldStateGroupingResult>;
    };

    summaries: {
        upsert(summary: { level: 'message' | 'scene' | 'arc'; messageId?: string; title?: string; content: string; keywords?: string[] }): Promise<string>;
        query(opts: { level?: string; sinceTs?: number; limit?: number }): Promise<any[]>;
    };

    injection: {
        buildContext(opts?: {
            maxTokens?: number;
            sections?: InjectionSectionName[];
            query?: string;
            sectionBudgets?: Partial<Record<InjectionSectionName, number>>;
            preferSummary?: boolean;
            intentHint?: InjectionIntent;
            includeDecisionMeta?: boolean;
        }): Promise<string | BuildContextDecision>;
        runMemoryPromptInjection(opts?: {
            maxTokens?: number;
            sections?: InjectionSectionName[];
            query?: string;
            sectionBudgets?: Partial<Record<InjectionSectionName, number>>;
            preferSummary?: boolean;
            intentHint?: InjectionIntent;
            includeDecisionMeta?: boolean;
            promptMessages?: SdkTavernPromptMessageEvent[];
            source?: string;
            sourceMessageId?: string;
            trace?: MemoryTraceContext;
        }): Promise<{
            shouldInject: boolean;
            inserted: boolean;
            insertIndex: number;
            promptLength: number;
            insertedLength: number;
            trace: MemoryMainlineTraceEntry;
            preDecision: PreGenerationGateDecision | null;
            reasonCodes: string[];
        }>;
        setPromptInjectionProfile(opts: {
            queryMode?: PromptQueryMode;
            settingOnlyMinScore?: number;
        }): Promise<void>;
        getPromptInjectionProfile(): PromptInjectionProfile;
    };

    audit: {
        list(opts?: { sinceTs?: number; limit?: number }): Promise<any[]>;
        rollbackToSnapshot(snapshotId: string): Promise<void>;
        createSnapshot(note?: string): Promise<string>;
    };

    extract: {
        kickOffExtraction(): Promise<void>;
    };

    proposal: {
        processProposal(envelope: ProposalEnvelope, consumerPluginId: string): Promise<ProposalResult>;
        requestWrite(request: WriteRequest): Promise<ProposalResult>;
        grantPermission(pluginId: string): void;
        revokePermission(pluginId: string): void;
    };

    template: {
        getById(templateId: string): Promise<WorldTemplate | null>;
        getActive(): Promise<WorldTemplate | null>;
        listByChatKey(): Promise<WorldTemplate[]>;
        setActive(templateId: string, opts?: { lock?: boolean }): Promise<void>;
        setLock(locked: boolean): Promise<void>;
        getBinding(): Promise<TemplateBinding | null>;
        rebuildFromWorldInfo(): Promise<string | null>;
        destroy(): void;
        /** v2: 返回合并后的有效模板（draft + base） */
        getEffective(): Promise<WorldTemplate | null>;
        /** v2: 列出有效模板中的表定义 */
        listTables(): Promise<TemplateTableDef[]>;
        /** v2: 列出模板修订历史 */
        listRevisions(opts?: { limit?: number }): Promise<WorldTemplate[]>;
        /** v2: 回滚到指定模板修订 */
        rollbackRevision(templateId: string): Promise<void>;
    };

    vector: {
        search(query: string, options?: { maxVectorResults?: number; maxKeywordResults?: number; maxEventResults?: number }): Promise<HybridSearchResult[]>;
        formatForPrompt(results: HybridSearchResult[]): string;
    };

    compaction: {
        needsCompaction(): Promise<{ needed: boolean; reason?: string; eventCount?: number }>;
        compact(opts?: { windowSize?: number; archiveProcessed?: boolean }): Promise<CompactionResult>;
        replayToState(opts?: { sinceTs?: number }): Promise<CompactionResult>;
    };

    worldInfo: {
        writeback(mode?: 'facts' | 'summaries' | 'all'): Promise<{ written: number; bookName: string }>;
        preview(): Promise<Array<{ entry: string; keywords: string[]; contentLength: number }>>;
        /** @deprecated 仅保留给旧世界书/事实表兼容调用；新编辑器请改用 `logicTable.getLogicTableView()`、`logicTable.listLogicTables()` 或 `rows.listTableRows()`。 */
        getLogicTable(entityType: string, opts?: LogicTableQueryOpts): Promise<any[]>;
        updateFact(
            factKey: string | undefined,
            type: string,
            entity: { kind: string; id: string },
            path: string,
            value: any
        ): Promise<string>;
    };

    logicTable: {
        listLogicTables(): Promise<LogicTableSummary[]>;
        getLogicTableView(tableKey: string): Promise<LogicTableViewModel>;
        listBackfillCandidates(tableKey: string): Promise<DerivedRowCandidate[]>;
        promoteDerivedRow(tableKey: string, candidateId: string): Promise<void>;
        mergeRows(tableKey: string, sourceRowId: string, targetRowId: string): Promise<void>;
        restoreRow(tableKey: string, rowId: string): Promise<void>;
        tombstoneRow(tableKey: string, rowId: string): Promise<void>;
        setAlias(tableKey: string, rowId: string, alias: string): Promise<void>;
        updateCell(tableKey: string, rowId: string, columnKey: string, value: unknown): Promise<void>;
        repairTable(tableKey: string, mode: LogicTableRepairMode): Promise<void>;
    };

    editor: {
        getCanonSnapshot(): Promise<CanonSnapshot>;
        getEditorHealth(): Promise<EditorHealthSnapshot>;
        getExperienceSnapshot(): Promise<EditorExperienceSnapshot>;
        getMemoryCardSnapshot(): Promise<MemoryCardViewerSnapshot>;
        runMemoryRecallPreview(query: string, opts?: { maxTokens?: number }): Promise<MemoryRecallPreviewResult>;
        refreshCanonSnapshot(): Promise<CanonSnapshot>;
        rebuildChatView(): Promise<LogicalChatView>;
        refreshSemanticSeed(): Promise<CanonSnapshot>;
    };

    // ─── v2 新增：聊天级状态管理 ───
    chatState: {
        getChatProfile(): Promise<ChatProfile>;
        setChatProfileOverride(override: Partial<ChatProfile>): Promise<void>;
        getGlobalSummarySettings(): Promise<SummarySettings>;
        setGlobalSummarySettings(settings: SummarySettings): Promise<SummarySettings>;
        getChatSummarySettingsOverride(): Promise<SummarySettingsOverride>;
        setChatSummarySettingsOverride(override: SummarySettingsOverride): Promise<void>;
        clearChatSummarySettingsOverride(): Promise<void>;
        getEffectiveSummarySettings(): Promise<EffectiveSummarySettings>;
        getAdaptiveMetrics(): Promise<AdaptiveMetrics>;
        getAdaptivePolicy(): Promise<AdaptivePolicy>;
        getVectorLifecycle(): Promise<VectorLifecycleState>;
        getIngestHealth(): Promise<IngestHealthWindow>;
        getRetrievalHealth(): Promise<RetrievalHealthWindow>;
        getExtractHealth(): Promise<ExtractHealthWindow>;
        getMemoryQuality(): Promise<MemoryQualityScorecard>;
        recomputeMemoryQuality(): Promise<MemoryQualityScorecard>;
        getMaintenanceAdvice(): Promise<MaintenanceAdvice[]>;
        getMaintenanceInsights(): Promise<MaintenanceInsight[]>;
        getLifecycleState(): Promise<ChatLifecycleState>;
        runMaintenanceAction(action: MaintenanceActionType): Promise<MaintenanceExecutionResult>;
        recomputeAdaptivePolicy(): Promise<AdaptivePolicy>;
        getRetentionPolicy(): Promise<RetentionPolicy>;
        setRetentionPolicyOverride(override: Partial<RetentionPolicy>): Promise<void>;
        getLastStrategyDecision(): Promise<StrategyDecision | null>;
        getAutoSchemaPolicy(): Promise<AutoSchemaPolicy>;
        setAutoSchemaPolicy(policy: Partial<AutoSchemaPolicy>): Promise<void>;
        bootstrapSemanticSeed(): Promise<void>;
        getSemanticSeed(): Promise<ChatSemanticSeed | null>;
        getPersonaMemoryProfile(): Promise<PersonaMemoryProfile | null>;
        getPersonaMemoryProfiles(): Promise<Record<string, PersonaMemoryProfile>>;
        getPersonaMemoryProfileForActor(actorKey: string): Promise<PersonaMemoryProfile | null>;
        getActiveActorKey(): Promise<string | null>;
        setActiveActorKey(actorKey: string | null): Promise<string | null>;
        getSimpleMemoryPersona(): Promise<SimpleMemoryPersona | null>;
        recomputePersonaMemoryProfile(): Promise<PersonaMemoryProfile>;
        recomputePersonaMemoryProfiles(): Promise<Record<string, PersonaMemoryProfile>>;
        getRecallLog(limit?: number): Promise<RecallLogEntry[]>;
        getLatestRecallExplanation(): Promise<LatestRecallExplanation | null>;
        getMemoryLifecycleSummary(limit?: number): Promise<MemoryLifecycleState[]>;
        getOwnedMemoryStates(limit?: number): Promise<OwnedMemoryState[]>;
        updateOwnedMemoryState(recordKey: string, patch: Partial<Pick<OwnedMemoryState, 'ownerActorKey' | 'memoryType' | 'memorySubtype' | 'sourceScope' | 'importance' | 'forgotten' | 'forgottenReasonCodes'>>): Promise<OwnedMemoryState | null>;
        recomputeOwnedMemoryState(recordKey: string): Promise<OwnedMemoryState | null>;
        getRelationshipState(): Promise<RelationshipState[]>;
        recomputeRelationshipState(): Promise<RelationshipState[]>;
        getMemoryTuningProfile(): Promise<MemoryTuningProfile>;
        setMemoryTuningProfile(profile: Partial<MemoryTuningProfile>): Promise<MemoryTuningProfile>;
        getMutationHistory(opts?: { limit?: number; recordKey?: string; targetKind?: MemoryMutationTargetKind; action?: MemoryMutationHistoryAction }): Promise<MemoryMutationHistoryEntry[]>;
        getMainlineTraceSnapshot(): Promise<MemoryMainlineTraceSnapshot>;
        rebuildMemoryCardsFromSource(recordKey: string, recordKind: 'fact' | 'summary'): Promise<string[]>;
        deleteMemoryCard(cardId: string): Promise<boolean>;
        setMemoryCardArchived(cardId: string, archived: boolean): Promise<void>;
        getColdStartStage(): Promise<ColdStartStage | null>;
        primeColdStartPrompt(reason?: string): Promise<boolean>;
        primeColdStartExtract(reason?: string): Promise<boolean>;
        getLorebookDecision(): Promise<LorebookGateDecision | null>;
        getGroupMemory(): Promise<GroupMemoryState | null>;
        getPromptInjectionProfile(): Promise<PromptInjectionProfile>;
        setPromptInjectionProfile(profile: Partial<PromptInjectionProfile>): Promise<void>;
        getLastPreGenerationDecision(): Promise<PreGenerationGateDecision | null>;
        getLastPostGenerationDecision(): Promise<PostGenerationGateDecision | null>;
        getLogicalChatView(): Promise<LogicalChatView | null>;
        rebuildLogicalChatView(): Promise<LogicalChatView>;
        archiveChat(): Promise<void>;
        restoreArchivedChat(): Promise<void>;
        purgeChat(options?: { includeAudit?: boolean }): Promise<void>;
        flush(): Promise<void>;
        destroy(): Promise<void>;
    };

    // ─── v2 新增：楼层跟踪器 ───
    turnTracker: {
        getActiveAssistantTurnCount(): Promise<number>;
        invalidateCache(): void;
    };

    // ─── v2 新增：行操作 ───
    rows: {
        resolve(tableKey: string, input: string): Promise<RowRefResolution>;
        resolveMany(tableKey: string, inputs: string[]): Promise<RowRefResolution[]>;
        create(tableKey: string, rowId: string, seed?: RowSeedData): Promise<string>;
        merge(tableKey: string, fromRowId: string, toRowId: string): Promise<RowMergeResult>;
        delete(tableKey: string, rowId: string): Promise<void>;
        restore(tableKey: string, rowId: string): Promise<void>;
        listTableRows(tableKey: string, opts?: LogicTableQueryOpts): Promise<LogicTableRow[]>;
        updateCell(tableKey: string, rowId: string, fieldKey: string, value: unknown): Promise<string>;
        setAlias(tableKey: string, alias: string, canonicalRowId: string): Promise<void>;
    };

    // ─── v2 新增：schemaContext 与 Prompt 裁剪 ───
    schemaContext: {
        build(mode: 'extract' | 'summarize', windowKeywords?: string[]): Promise<SchemaContextResult>;
    };
}

// -- LLMHub 能力约束类型 --
export type LLMCapability = 'chat' | 'json' | 'tools' | 'embeddings' | 'rerank' | 'vision' | 'reasoning';
export type CapabilityKind = 'generation' | 'embedding' | 'rerank';
export type DisplayMode = 'fullscreen' | 'compact' | 'silent';
export type TaskSurfaceMode = 'fullscreen_blocking' | 'toast_blocking' | 'toast_background';
export type TaskVisualState = 'pending' | 'running' | 'streaming' | 'done' | 'error';

export interface TaskQueueItem {
    requestId: string;
    taskId?: string;
    title: string;
    subtitle?: string;
    description?: string;
    source?: string;
    state: TaskVisualState;
    surfaceMode: TaskSurfaceMode;
    disableComposer: boolean;
    showToast: boolean;
    progress?: number;
    queueLabel?: string;
    dedupeVisualKey?: string;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    autoCloseAt?: number;
    reason?: string;
    meta?: Record<string, unknown>;
}

export interface TaskQueueSnapshot {
    items: TaskQueueItem[];
    currentTask: TaskQueueItem | null;
    blockingTask: TaskQueueItem | null;
    toastTask: TaskQueueItem | null;
    nextTasks: TaskQueueItem[];
    toastNextTasks: TaskQueueItem[];
    pendingCount: number;
    blockingCount: number;
    backgroundCount: number;
    composerLocked: boolean;
    composerLockCount: number;
    fullscreenVisible: boolean;
    toastVisible: boolean;
}

export interface TaskPresentationConfig {
    requestId?: string;
    taskId?: string;
    title: string;
    subtitle?: string;
    description?: string;
    source?: string;
    state?: TaskVisualState;
    surfaceMode: TaskSurfaceMode;
    disableComposer?: boolean;
    showToast?: boolean;
    progress?: number;
    queueLabel?: string;
    dedupeVisualKey?: string;
    autoCloseMs?: number;
    errorHoldMs?: number;
    meta?: Record<string, unknown>;
}

export interface LLMRunMeta {
    requestId: string;
    resourceId: string;
    model?: string;
    capabilityKind: CapabilityKind;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    fallbackUsed?: boolean;
}

export type LLMRunResult<T> =
    | { ok: true; data: T; meta: LLMRunMeta }
    | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean; reasonCode?: string; meta?: LLMRunMeta };

export type LLMTaskLifecycleStage =
    | 'queued'
    | 'running'
    | 'route_resolved'
    | 'provider_requesting'
    | 'fallback_started'
    | 'completed'
    | 'failed';

export interface LLMTaskLifecycleEvent {
    requestId: string;
    consumer: string;
    taskId: string;
    taskKind: CapabilityKind;
    stage: LLMTaskLifecycleStage;
    ts: number;
    message?: string;
    resourceId?: string;
    model?: string;
    fallbackUsed?: boolean;
    progress?: number;
    error?: string;
    reasonCode?: string;
}

export type LLMTaskLifecycleHandler = (event: LLMTaskLifecycleEvent) => void;

export interface TaskDescriptor {
    taskId: string;
    taskKind: CapabilityKind;
    requiredCapabilities: LLMCapability[];
    recommendedRoute?: { resourceId?: string; profileId?: string };
    recommendedDisplay?: DisplayMode;
    description?: string;
    backgroundEligible?: boolean;
}

export interface ConsumerRegistration {
    pluginId: string;
    displayName: string;
    registrationVersion: number;
    tasks: TaskDescriptor[];
    routeBindings?: Array<{
        taskId: string;
        resourceId: string;
        model?: string;
        profileId?: string;
        fallbackResourceId?: string;
    }>;
}

export interface LLMOverlayPatch {
    title?: string;
    status?: 'loading' | 'streaming' | 'done' | 'error';
    progress?: number;
    content?: { type: 'text' | 'markdown' | 'html'; body: string };
    actions?: Array<{ id: string; label: string; style?: 'primary' | 'secondary' | 'danger'; closeOnClick?: boolean }>;
    displayMode?: DisplayMode;
    autoClose?: boolean;
    autoCloseMs?: number;
}

export interface RequestScope {
    chatId?: string;
    sessionId?: string;
    pluginId?: string;
    chatKey?: string;
}

export interface RequestEnqueueOptions {
    dedupeKey?: string;
    replacePendingByKey?: string;
    cancelOnScopeChange?: boolean;
    displayMode?: DisplayMode;
    surfaceMode?: TaskSurfaceMode;
    disableComposer?: boolean;
    queueLabel?: string;
    dedupeVisualKey?: string;
    scope?: RequestScope;
    blockNextUntilOverlayClose?: boolean;
}

export interface RouteResolveArgs {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities?: LLMCapability[];
    routeHint?: { resourceId?: string; model?: string; profileId?: string };
}

export interface RoutePreviewSnapshot {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities: LLMCapability[];
    available: boolean;
    resourceId?: string;
    resourceLabel?: string;
    resourceType?: 'generation' | 'embedding' | 'rerank';
    source?: 'tavern' | 'custom';
    model?: string;
    resolvedBy?: 'route_hint' | 'user_task_override' | 'plugin_task_recommend' | 'user_plugin_default' | 'user_global_default' | 'builtin_tavern_fallback' | 'fallback';
    blockedReason?: string;
}

export interface ResourceStatusSnapshot {
    resourceId: string;
    resourceLabel: string;
    resourceType: 'generation' | 'embedding' | 'rerank';
    source: 'tavern' | 'custom';
    enabled: boolean;
    baseUrl?: string;
    model?: string;
    credentialConfigured: boolean;
    builtin: boolean;
}

export interface LLMHubStatusSnapshot {
    resources: ResourceStatusSnapshot[];
    globalProfile?: string;
    globalAssignments: {
        generation?: { resourceId: string };
        embedding?: { resourceId: string };
        rerank?: { resourceId: string };
    };
    pluginAssignments: Array<{
        pluginId: string;
        generation?: { resourceId: string };
        embedding?: { resourceId: string };
        rerank?: { resourceId: string };
    }>;
    taskAssignments: Array<{
        pluginId: string;
        taskId: string;
        taskKind: CapabilityKind;
        resourceId: string;
        isStale: boolean;
        staleReason?: string;
    }>;
    readiness: Record<CapabilityKind, boolean>;
}

export interface LLMInspectApi {
    getStatusSnapshot(): Promise<LLMHubStatusSnapshot> | LLMHubStatusSnapshot;
    previewRoute(args: RouteResolveArgs): Promise<RoutePreviewSnapshot> | RoutePreviewSnapshot;
}

// -- LLMSDK 接口 --
export interface LLMSDK {
    // ─── 同步命令式接口 ───

    /** 幂等 upsert 消费方注册。同步返回，内部异步落盘。 */
    registerConsumer(registration: ConsumerRegistration): void;

    /** 注销消费方。同步返回。 */
    unregisterConsumer(pluginId: string, opts?: { keepPersistent?: boolean }): void;

    /** 更新已存在的覆层。同步返回。 */
    updateOverlay(requestId: string, patch: LLMOverlayPatch): void;

    /** 关闭覆层。同步返回。 */
    closeOverlay(requestId: string, reason?: string): void;

    // ─── 异步接口 ───

    /** 执行 AI 任务。只等待 AI 结果返回，不等待展示关闭。 */
    runTask<T>(args: {
        consumer: string;
        taskId: string;
        taskDescription?: string;
        taskKind: CapabilityKind;
        input: any;
        schema?: object;
        routeHint?: { resource?: string; profile?: string; model?: string };
        budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
        enqueue?: RequestEnqueueOptions;
        onLifecycle?: LLMTaskLifecycleHandler;
    }): Promise<LLMRunResult<T>>;

    /** 向量化接口 */
    embed(args: {
        consumer: string;
        taskId: string;
        taskDescription?: string;
        texts: string[];
        routeHint?: { resource?: string; model?: string };
        enqueue?: RequestEnqueueOptions;
        onLifecycle?: LLMTaskLifecycleHandler;
    }): Promise<any>;

    /** 重排序接口 */
    rerank(args: {
        consumer: string;
        taskId: string;
        taskDescription?: string;
        query: string;
        docs: string[];
        topK?: number;
        routeHint?: { resource?: string; model?: string };
        enqueue?: RequestEnqueueOptions;
        onLifecycle?: LLMTaskLifecycleHandler;
    }): Promise<any>;

    /** 等待指定请求的覆层关闭。通过 meta.requestId 获取 requestId。 */
    waitForOverlayClose(requestId: string): Promise<void>;

    /** 只读检查接口。*/
    inspect?: LLMInspectApi;
}

// -- Tavern SDK 鎺ュ彛 --
export type SdkTavernScopeTypeEvent = "character" | "group";

export interface SdkTavernRoleIdentityEvent {
    roleId: string;
    roleKey: string;
    displayName: string;
    avatarName: string;
    avatarUrl: string;
}

export interface SdkTavernInstanceEvent {
    tavernInstanceId: string;
}

export interface SdkTavernScopeLocatorEvent extends SdkTavernInstanceEvent {
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
    roleId: string;
    displayName: string;
    avatarUrl: string;
    groupId: string;
    characterId: number;
    currentChatId: string;
}

export interface SdkTavernChatLocatorEvent extends SdkTavernScopeLocatorEvent {
    chatId: string;
}

export interface SdkTavernChatListItemEvent {
    locator: SdkTavernChatLocatorEvent;
    updatedAt: number;
    messageCount: number;
}

export interface SdkTavernChatRefEvent extends SdkTavernInstanceEvent {
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    chatId: string;
}

export interface SdkUnifiedTavernLocalSummaryEvent {
    chatKey: string;
    updatedAt: number;
    activeStatusCount?: number;
    displayName?: string;
    avatarUrl?: string;
    roleKey?: string;
}

export interface SdkUnifiedTavernHostChatEvent {
    chatKey: string;
    updatedAt: number;
    chatId: string;
    displayName: string;
    avatarUrl: string;
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
}

export interface SdkUnifiedTavernChatDirectoryInputEvent {
    currentChatKey: string;
    hostChats: SdkUnifiedTavernHostChatEvent[];
    localSummaries: SdkUnifiedTavernLocalSummaryEvent[];
    draftChatKeys?: string[];
    taggedChatKeys?: string[];
}

export interface SdkUnifiedTavernChatDirectoryItemEvent {
    chatKey: string;
    entityKey: string;
    chatId: string;
    displayName: string;
    avatarUrl: string;
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
    updatedAt: number;
    activeStatusCount: number;
    isCurrent: boolean;
    fromHost: boolean;
    fromLocal: boolean;
    fromDraft: boolean;
    fromTagged: boolean;
}

// -- 插件注册接口 --
export interface PluginManifest {
    pluginId: string;
    name: string;
    version: string;
    displayName?: string;
    capabilities: {
        events?: string[];
        memory?: string[];
        llm?: string[];
    };
    scopes?: string[];
    requiresSDK?: string;
    source?: 'manifest_json' | 'runtime';
    declaredAt?: number;
}

export interface STXRegistry {
    register(manifest: PluginManifest): { ok: boolean; degraded: boolean; reason?: string };
    list(): PluginManifest[];
    get(pluginId: string): PluginManifest | undefined;
    onChanged?(handler: (event: RegistryChangeEvent) => void): () => void;
}

// -- 全局对象声明 --
declare global {
    interface Window {
        STX: {
            version: string;
            bus: STXBus;
            memory: MemorySDK;
            llm: LLMSDK;
            registry: STXRegistry;
        };
        toastr: {
            success(msg: string, title?: string, options?: any): void;
            info(msg: string, title?: string, options?: any): void;
            warning(msg: string, title?: string, options?: any): void;
            error(msg: string, title?: string, options?: any): void;
            clear(): void;
        };
    }
}
