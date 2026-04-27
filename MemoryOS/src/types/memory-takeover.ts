/**
 * 功能：定义旧聊天接管模式。
 */
export type MemoryTakeoverMode = 'full' | 'recent' | 'custom_range';

import type { BatchTimeAssessment, MemoryTimeContext } from '../memory-time/time-types';

/**
 * 功能：定义旧聊天接管任务状态。
 */
export type MemoryTakeoverStatus = 'idle' | 'running' | 'paused' | 'blocked_by_batch' | 'degraded' | 'completed' | 'failed';

/**
 * 功能：定义接管批次失败类型。
 */
export type MemoryTakeoverBatchErrorKind =
    | 'llm_unavailable'
    | 'llm_timeout'
    | 'rate_limit'
    | 'schema_invalid'
    | 'admission_failed'
    | 'manual_abort'
    | 'unknown';

/**
 * 功能：定义接管批次聚合失败状态。
 */
export interface MemoryTakeoverBatchFailureState {
    batchId: string;
    failureCount: number;
    consecutiveFailureCount: number;
    lastFailureAt?: number;
    lastErrorMessage?: string;
    lastErrorKind?: MemoryTakeoverBatchErrorKind;
    retryable: boolean;
    requiresManualReview: boolean;
    quarantined: boolean;
    attemptCount: number;
}

/**
 * 功能：定义接管楼层范围。
 */
export interface MemoryTakeoverRange {
    startFloor: number;
    endFloor: number;
}

/**
 * 功能：定义接管源文本分段类型。
 */
export type TakeoverSourceSegmentKind =
    | 'story_narrative'
    | 'story_dialogue'
    | 'meta_analysis'
    | 'instructional'
    | 'tool_artifact'
    | 'thought_like';

/**
 * 功能：定义单段接管源文本。
 */
export interface TakeoverSourceSegment {
    kind: TakeoverSourceSegmentKind;
    text: string;
    sourceFloor: number;
    confidence: number;
}

/**
 * 功能：定义批次楼层内容块记录。
 */
export interface MemoryTakeoverFloorBlockRecord {
    blockId: string;
    title?: string;
    rawText: string;
    startOffset: number;
    endOffset: number;
    channel?: 'memory' | 'context' | 'excluded';
    reasonCodes: string[];
}

/**
 * 功能：定义批次楼层 manifest 记录。
 */
export interface MemoryTakeoverFloorManifestRecord {
    floor: number;
    sourceFloor?: number;
    originalText: string;
    originalTextSource?: string;
    originalRole: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
    includedInBatch: true;
    blocks?: MemoryTakeoverFloorBlockRecord[];
    parsedBlocks?: MemoryTakeoverFloorBlockRecord[];
    hasMemoryContent?: boolean;
    hasContextOnly?: boolean;
    hasExcludedOnly: boolean;
}

/**
 * 功能：定义接管任务配置。
 */
export interface MemoryTakeoverPlan {
    chatKey: string;
    chatId: string;
    takeoverId: string;
    status: MemoryTakeoverStatus;
    mode: MemoryTakeoverMode;
    range: MemoryTakeoverRange;
    totalFloors: number;
    recentFloors: number;
    batchSize: number;
    useActiveSnapshot: boolean;
    activeSnapshotFloors: number;
    prioritizeRecent: boolean;
    autoContinue: boolean;
    autoConsolidate: boolean;
    pauseOnError: boolean;
    activeWindow: MemoryTakeoverRange | null;
    currentBatchIndex: number;
    totalBatches: number;
    completedBatchIds: string[];
    failedBatchIds: string[];
    isolatedBatchIds: string[];
    blockedBatchId?: string;
    lastBlockedAt?: number;
    degradedReason?: string;
    requestedRetryBatchId?: string;
    lastError?: string;
    lastCheckpointAt?: number;
    completedAt?: number;
    pausedAt?: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * 功能：定义单个批次元数据。
 */
export interface MemoryTakeoverBatch {
    takeoverId: string;
    batchId: string;
    batchIndex: number;
    range: MemoryTakeoverRange;
    category: 'active' | 'history';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'isolated';
    attemptCount: number;
    sourceMessageIds: string[];
    admissionState?: 'pending' | 'validated' | 'repaired' | 'isolated';
    repairedOnce?: boolean;
    validationErrors?: string[];
    failureCount?: number;
    consecutiveFailureCount?: number;
    lastFailureAt?: number;
    lastErrorKind?: MemoryTakeoverBatchErrorKind;
    retryable?: boolean;
    requiresManualReview?: boolean;
    quarantined?: boolean;
    startedAt?: number;
    finishedAt?: number;
    error?: string;
}

/**
 * 功能：定义稳定事实候选。
 */
export interface MemoryTakeoverStableFact {
    targetRef?: string;
    keySeed?: {
        kind?: string;
        title?: string;
        qualifier?: string;
        participants?: string[];
    };
    patch?: Record<string, unknown>;
    newRecord?: Record<string, unknown>;
    type: string;
    subject: string;
    predicate: string;
    value: string;
    confidence: number;
    entityKey?: string;
    title?: string;
    summary?: string;
    compareKey?: string;
    matchKeys?: string[];
    schemaVersion?: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
    bindings?: MemoryTakeoverBindings;
    status?: string;
    importance?: number;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义旧聊天接管中可复用的绑定关系载荷。
 */
export interface MemoryTakeoverBindings {
    actors: string[];
    organizations: string[];
    cities: string[];
    locations: string[];
    nations: string[];
    tasks: string[];
    events: string[];
}

/**
 * 功能：定义关系变化。
 */
export interface MemoryTakeoverRelationTransition {
    target: string;
    from: string;
    to: string;
    reason: string;
    relationTag?: string;
    targetType?: 'actor' | 'organization' | 'city' | 'nation' | 'location' | 'unknown';
    bindings?: MemoryTakeoverBindings;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义任务变化。
 */
export interface MemoryTakeoverTaskTransition {
    targetRef?: string;
    keySeed?: {
        kind?: string;
        title?: string;
        qualifier?: string;
        participants?: string[];
    };
    patch?: Record<string, unknown>;
    task: string;
    from: string;
    to: string;
    entityKey?: string;
    title?: string;
    summary?: string;
    description?: string;
    goal?: string;
    status?: string;
    compareKey?: string;
    matchKeys?: string[];
    schemaVersion?: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
    bindings?: MemoryTakeoverBindings;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义世界状态变化。
 */
export interface MemoryTakeoverWorldStateChange {
    targetRef?: string;
    keySeed?: {
        kind?: string;
        title?: string;
        qualifier?: string;
        participants?: string[];
    };
    patch?: Record<string, unknown>;
    key: string;
    value: string;
    entityKey?: string;
    summary?: string;
    compareKey?: string;
    matchKeys?: string[];
    schemaVersion?: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
    bindings?: MemoryTakeoverBindings;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义静态基线结果。
 */
export interface MemoryTakeoverActorCardCandidate {
    actorKey: string;
    displayName: string;
    aliases: string[];
    identityFacts: string[];
    originFacts: string[];
    traits: string[];
}

/**
 * 功能：定义候选角色提及状态。
 */
export type MemoryTakeoverCandidateActorStatus = 'candidate' | 'promoted' | 'rejected';

/**
 * 功能：定义候选角色提及记录。
 */
export interface MemoryTakeoverCandidateActorMention {
    chatKey?: string;
    actorKey?: string;
    name: string;
    aliases: string[];
    sourceBatchId: string;
    sourceFloorStart: number;
    sourceFloorEnd: number;
    evidenceScore: number;
    sourceKinds: TakeoverSourceSegmentKind[];
    reasonCodes: string[];
    status: MemoryTakeoverCandidateActorStatus;
}

/**
 * 功能：定义拒绝角色提及记录。
 */
export interface MemoryTakeoverRejectedMention {
    name: string;
    actorKey?: string;
    sourceBatchId: string;
    sourceFloorStart: number;
    sourceFloorEnd: number;
    reasonCodes: string[];
}

/**
 * 功能：定义批次审计报告。
 */
export interface MemoryTakeoverBatchAuditReport {
    userPlaceholderReplacements: number;
    bannedPatternHits: number;
    narrativeValidatorPassed: boolean;
    styleRepairTriggered: boolean;
    actorCompletionTriggered: boolean;
    confirmedActorCount: number;
    candidateActorCount: number;
    rejectedMentionCount: number;
    invalidFieldPaths: string[];
}

/**
 * 功能：定义世界实体类型。
 */
export type MemoryTakeoverEntityType = 'organization' | 'city' | 'nation' | 'location';

/**
 * 功能：定义世界实体卡候选。
 */
export interface MemoryTakeoverEntityCardCandidate {
    keySeed?: {
        kind?: string;
        title?: string;
        qualifier?: string;
        participants?: string[];
    };
    entityType: MemoryTakeoverEntityType;
    entityKey?: string;
    compareKey: string;
    matchKeys?: string[];
    schemaVersion?: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
    title: string;
    aliases: string[];
    summary: string;
    fields: Record<string, string | number | boolean | string[]>;
    confidence: number;
    bindings?: MemoryTakeoverBindings;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义世界实体变化。
 */
export interface MemoryTakeoverEntityTransition {
    targetRef?: string;
    keySeed?: {
        kind?: string;
        title?: string;
        qualifier?: string;
        participants?: string[];
    };
    patch?: Record<string, unknown>;
    entityType: MemoryTakeoverEntityType;
    entityKey?: string;
    compareKey: string;
    matchKeys?: string[];
    schemaVersion?: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
    title: string;
    action: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    reason: string;
    payload: Record<string, unknown>;
    bindings?: MemoryTakeoverBindings;
    reasonCodes?: string[];
    timeContext?: MemoryTimeContext;
    firstObservedAt?: MemoryTimeContext;
    lastObservedAt?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

/**
 * 功能：定义旧聊天接管使用的结构化关系卡。
 */
export interface MemoryTakeoverRelationshipCard {
    sourceActorKey: string;
    targetActorKey: string;
    participants: string[];
    relationTag: string;
    state: string;
    summary: string;
    trust: number;
    affection: number;
    tension: number;
    timeContext?: MemoryTimeContext;
    validFrom?: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing?: boolean;
}

export interface MemoryTakeoverBaseline {
    staticBaseline: string;
    personaBaseline: string;
    worldBaseline: string;
    ruleBaseline: string;
    sourceSummary: string;
    generatedAt: number;
}

/**
 * 功能：定义接管活跃快照。
 */
export interface MemoryTakeoverActiveSnapshot {
    generatedAt: number;
    currentScene: string;
    currentLocation: string;
    currentTimeHint: string;
    activeGoals: string[];
    activeRelations: Array<{
        target: string;
        state: string;
    }>;
    openThreads: string[];
    recentDigest: string;
}

/**
 * 功能：定义单批分析结果。
 */
export interface MemoryTakeoverBatchResult {
    takeoverId: string;
    batchId: string;
    summary: string;
    /** 批次时间评估 */
    batchTimeAssessment?: BatchTimeAssessment;
    actorCards: MemoryTakeoverActorCardCandidate[];
    candidateActors?: MemoryTakeoverCandidateActorMention[];
    rejectedMentions?: MemoryTakeoverRejectedMention[];
    relationships: MemoryTakeoverRelationshipCard[];
    entityCards: MemoryTakeoverEntityCardCandidate[];
    entityTransitions: MemoryTakeoverEntityTransition[];
    stableFacts: MemoryTakeoverStableFact[];
    relationTransitions: MemoryTakeoverRelationTransition[];
    taskTransitions: MemoryTakeoverTaskTransition[];
    worldStateChanges: MemoryTakeoverWorldStateChange[];
    openThreads: string[];
    chapterTags: string[];
    sourceRange: MemoryTakeoverRange;
    sourceSegments?: TakeoverSourceSegment[];
    floorManifest?: MemoryTakeoverFloorManifestRecord[];
    validated?: boolean;
    repairedOnce?: boolean;
    isolated?: boolean;
    validationErrors?: string[];
    repairActions?: string[];
    auditReport?: MemoryTakeoverBatchAuditReport;
    generatedAt: number;
}

/**
 * 功能：定义整合统计。
 */
export interface MemoryTakeoverConsolidationStats {
    totalFacts: number;
    dedupedFacts: number;
    relationUpdates: number;
    taskUpdates: number;
    worldUpdates: number;
}

/**
 * 功能：定义最终整合结果。
 */
export interface MemoryTakeoverConsolidationResult {
    takeoverId: string;
    chapterDigestIndex: Array<{
        batchId: string;
        range: MemoryTakeoverRange;
        summary: string;
        tags: string[];
    }>;
    actorCards: MemoryTakeoverActorCardCandidate[];
    candidateActors?: MemoryTakeoverCandidateActorMention[];
    relationships: MemoryTakeoverRelationshipCard[];
    entityCards: MemoryTakeoverEntityCardCandidate[];
    entityTransitions: MemoryTakeoverEntityTransition[];
    longTermFacts: MemoryTakeoverStableFact[];
    relationState: Array<{
        target: string;
        state: string;
        reason: string;
        relationTag?: string;
        targetType?: 'actor' | 'organization' | 'city' | 'nation' | 'location' | 'unknown';
        timeContext?: MemoryTimeContext;
        validFrom?: MemoryTimeContext;
        validTo?: MemoryTimeContext;
        ongoing?: boolean;
    }>;
    taskState: Array<{
        task: string;
        state: string;
        title?: string;
        summary?: string;
        description?: string;
        goal?: string;
        entityKey?: string;
        compareKey?: string;
        schemaVersion?: string;
        canonicalName?: string;
        matchKeys?: string[];
        legacyCompareKeys?: string[];
        bindings?: MemoryTakeoverBindings;
        reasonCodes?: string[];
        timeContext?: MemoryTimeContext;
        firstObservedAt?: MemoryTimeContext;
        lastObservedAt?: MemoryTimeContext;
        validFrom?: MemoryTimeContext;
        validTo?: MemoryTimeContext;
        ongoing?: boolean;
    }>;
    worldState: Record<string, string>;
    worldStateDetails?: MemoryTakeoverWorldStateChange[];
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    dedupeStats: MemoryTakeoverConsolidationStats;
    conflictStats: {
        unresolvedFacts: number;
        unresolvedRelations: number;
        unresolvedTasks: number;
        unresolvedWorldStates: number;
        unresolvedEntities: number;
    };
    conflictResolutions?: Array<{
        bucketId: string;
        domain: string;
        resolutions: Array<{
            action: 'merge' | 'keep_primary' | 'replace' | 'invalidate' | 'split';
            primaryKey?: string;
            secondaryKeys?: string[];
            fieldOverrides?: Record<string, unknown>;
            selectedPrimaryKey?: string;
            selectedSnapshot?: Record<string, unknown>;
            selectionReason?: string;
            appliedFieldNames?: string[];
            resolverSource?: 'rule_resolver' | 'llm_batch_resolver' | 'deterministic_fallback';
            reasonCodes: string[];
        }>;
    }>;
    pipelineDiagnostics?: {
        batchCount: number;
        sectionCount: number;
        conflictBucketCount: number;
        resolvedConflictCount: number;
        unresolvedConflictCount: number;
        ruleResolvedConflictCount: number;
        llmResolvedConflictCount: number;
        batchedRequestCount: number;
        avgBucketsPerRequest: number;
        skippedByRuleCount: number;
        fallbackUsed: boolean;
        usedLLM: boolean;
        reasonCode: string;
    };
    applyDiagnostics?: ApplyLedgerMutationBatchResult;
    batchAudits?: MemoryTakeoverBatchAuditReport[];
    generatedAt: number;
}

/**
 * 功能：定义接管进度快照。
 */
export interface MemoryTakeoverProgressSnapshot {
    plan: MemoryTakeoverPlan | null;
    currentBatch: MemoryTakeoverBatch | null;
    baseline: MemoryTakeoverBaseline | null;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    latestBatchResult: MemoryTakeoverBatchResult | null;
    consolidation: MemoryTakeoverConsolidationResult | null;
    batchResults: MemoryTakeoverBatchResult[];
}

/**
 * 功能：定义单个接管批次的 token 预估结果。
 */
export interface MemoryTakeoverPreviewBatchEstimate {
    batchId: string;
    batchIndex: number;
    category: 'active' | 'history';
    label: string;
    range: MemoryTakeoverRange;
    messageCount: number;
    estimatedPromptTokens: number;
    overWarningThreshold: boolean;
}

/**
 * 功能：定义单个批次的实际送模内容预览。
 */
export interface MemoryTakeoverPayloadPreviewBatch {
    batchId: string;
    batchIndex: number;
    category: 'active' | 'history';
    label: string;
    range: MemoryTakeoverRange;
    sourceFloors: number[];
    sentFloors: number[];
    contextText: string;
    excludedSummary: string[];
    floorManifest: MemoryTakeoverFloorManifestRecord[];
    requestMessages: Array<{
        role: 'system' | 'user';
        content: string;
    }>;
}

/**
 * 功能：定义旧聊天接管实际送模内容预览。
 */
export interface MemoryTakeoverPayloadPreview {
    mode: MemoryTakeoverMode;
    totalFloors: number;
    range: MemoryTakeoverRange | null;
    activeWindow: MemoryTakeoverRange | null;
    batchSize: number;
    useActiveSnapshot: boolean;
    activeSnapshotFloors: number;
    totalBatches: number;
    batches: MemoryTakeoverPayloadPreviewBatch[];
}

/**
 * 功能：定义接管计划的 token 预估汇总。
 */
export interface MemoryTakeoverPreviewEstimate {
    mode: MemoryTakeoverMode;
    totalFloors: number;
    range: MemoryTakeoverRange | null;
    activeWindow: MemoryTakeoverRange | null;
    coverageSummary?: string;
    batchSize: number;
    useActiveSnapshot: boolean;
    activeSnapshotFloors: number;
    threshold: number;
    totalBatches: number;
    batches: MemoryTakeoverPreviewBatchEstimate[];
    hasOverflow: boolean;
    overflowWarnings: string[];
    validationError?: string;
}

/**
 * 功能：定义接管创建配置。
 */
export interface MemoryTakeoverCreateInput {
    mode?: MemoryTakeoverMode;
    startFloor?: number;
    endFloor?: number;
    recentFloors?: number;
    batchSize?: number;
    useActiveSnapshot?: boolean;
    activeSnapshotFloors?: number;
    prioritizeRecent?: boolean;
    autoContinue?: boolean;
    autoConsolidate?: boolean;
    pauseOnError?: boolean;
}

/**
 * 功能：定义接管检测结果。
 */
export interface MemoryTakeoverDetectionResult {
    needed: boolean;
    reason: string;
    currentFloorCount: number;
    threshold: number;
    hasCompletedTakeover: boolean;
    recoverableTakeoverId?: string;
}
import type { ApplyLedgerMutationBatchResult } from './unified-memory';
