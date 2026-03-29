/**
 * 功能：定义旧聊天接管模式。
 */
export type MemoryTakeoverMode = 'full' | 'recent' | 'custom_range';

/**
 * 功能：定义旧聊天接管任务状态。
 */
export type MemoryTakeoverStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * 功能：定义接管楼层范围。
 */
export interface MemoryTakeoverRange {
    startFloor: number;
    endFloor: number;
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
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    attemptCount: number;
    sourceMessageIds: string[];
    startedAt?: number;
    finishedAt?: number;
    error?: string;
}

/**
 * 功能：定义稳定事实候选。
 */
export interface MemoryTakeoverStableFact {
    type: string;
    subject: string;
    predicate: string;
    value: string;
    confidence: number;
}

/**
 * 功能：定义关系变化。
 */
export interface MemoryTakeoverRelationTransition {
    target: string;
    from: string;
    to: string;
    reason: string;
}

/**
 * 功能：定义任务变化。
 */
export interface MemoryTakeoverTaskTransition {
    task: string;
    from: string;
    to: string;
}

/**
 * 功能：定义世界状态变化。
 */
export interface MemoryTakeoverWorldStateChange {
    key: string;
    value: string;
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
 * 功能：定义世界实体类型。
 */
export type MemoryTakeoverEntityType = 'organization' | 'city' | 'nation' | 'location';

/**
 * 功能：定义世界实体卡候选。
 */
export interface MemoryTakeoverEntityCardCandidate {
    entityType: MemoryTakeoverEntityType;
    compareKey: string;
    title: string;
    aliases: string[];
    summary: string;
    fields: Record<string, string | number | boolean | string[]>;
    confidence: number;
}

/**
 * 功能：定义世界实体变化。
 */
export interface MemoryTakeoverEntityTransition {
    entityType: MemoryTakeoverEntityType;
    compareKey: string;
    title: string;
    action: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    reason: string;
    payload: Record<string, unknown>;
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
    actorCards: MemoryTakeoverActorCardCandidate[];
    entityCards: MemoryTakeoverEntityCardCandidate[];
    entityTransitions: MemoryTakeoverEntityTransition[];
    stableFacts: MemoryTakeoverStableFact[];
    relationTransitions: MemoryTakeoverRelationTransition[];
    taskTransitions: MemoryTakeoverTaskTransition[];
    worldStateChanges: MemoryTakeoverWorldStateChange[];
    openThreads: string[];
    chapterTags: string[];
    sourceRange: MemoryTakeoverRange;
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
    entityCards: MemoryTakeoverEntityCardCandidate[];
    entityTransitions: MemoryTakeoverEntityTransition[];
    longTermFacts: MemoryTakeoverStableFact[];
    relationState: Array<{
        target: string;
        state: string;
        reason: string;
    }>;
    taskState: Array<{
        task: string;
        state: string;
    }>;
    worldState: Record<string, string>;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    dedupeStats: MemoryTakeoverConsolidationStats;
    conflictStats: {
        unresolvedFacts: number;
        unresolvedRelations: number;
        unresolvedTasks: number;
        unresolvedWorldStates: number;
        unresolvedEntities: number;
    };
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
 * 功能：定义接管计划的 token 预估汇总。
 */
export interface MemoryTakeoverPreviewEstimate {
    mode: MemoryTakeoverMode;
    totalFloors: number;
    range: MemoryTakeoverRange | null;
    activeWindow: MemoryTakeoverRange | null;
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
