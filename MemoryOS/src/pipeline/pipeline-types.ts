/**
 * 功能：定义统一流水线支持的任务类型。
 */
export type PipelineJobType = 'takeover' | 'cold_start' | 'summary';

/**
 * 功能：定义统一流水线运行状态。
 */
export type PipelineJobStatus = 'pending' | 'running' | 'paused' | 'failed' | 'completed';

/**
 * 功能：定义统一流水线阶段。
 */
export type PipelinePhase = 'extract' | 'reduce' | 'resolve' | 'apply';

/**
 * 功能：定义流水线领域类型。
 */
export type PipelineDomain = 'actor' | 'entity' | 'relationship' | 'task' | 'world' | 'digest';

/**
 * 功能：定义流水线冲突状态。
 */
export type PipelineConflictState = 'none' | 'suspected' | 'unresolved' | 'resolved';

/**
 * 功能：定义流水线冲突桶处理状态。
 */
export type PipelineResolutionStatus = 'pending' | 'resolved' | 'failed' | 'fallback';

/**
 * 功能：定义统一主链运行类型。
 */
export type PipelineRunKind = 'takeover' | 'bootstrap' | 'summary';

/**
 * 功能：定义统一预算策略。
 */
export interface PipelineBudgetPolicy {
    maxInputCharsPerBatch: number;
    maxOutputItemsPerBatch: number;
    maxActionsPerMutation: number;
    maxSectionBatchCount: number;
    maxConflictBucketSize: number;
    maxConflictBatchSize: number;
    maxConflictResolverBucketsPerRequest: number;
    maxRuleOnlyConflictRecords: number;
    maxSectionDigestChars: number;
    maxRollingDigestChars: number;
    maxCandidateSummaryChars: number;
    maxFinalizerItemsPerDomain: number;
}

/**
 * 功能：定义统一运行态快照。
 */
export interface PipelineRunState {
    runId: string;
    pipelineKind: PipelineRunKind;
    phase: string;
    status: PipelineJobStatus;
    createdAt: number;
    updatedAt: number;
}

/**
 * 功能：定义统一流水线任务记录。
 */
export interface PipelineJobRecord {
    jobId: string;
    jobType: PipelineJobType;
    status: PipelineJobStatus;
    phase: PipelinePhase;
    sourceMeta: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
    errorCode?: string;
    errorMessage?: string;
    resumeToken?: string;
}

/**
 * 功能：定义统一流水线批次记录。
 */
export interface PipelineBatchRecord {
    jobId: string;
    batchId: string;
    phase: PipelinePhase;
    range: Record<string, unknown>;
    inputDigest: string;
    outputDigest: string;
    status: PipelineJobStatus;
    retryCount: number;
    startedAt?: number;
    finishedAt?: number;
}

/**
 * 功能：定义批次结构化输出暂存记录。
 */
export interface PipelineBatchResultRecord<TRecord = unknown> {
    jobId: string;
    batchId: string;
    domain: PipelineDomain;
    sourceRange: unknown;
    summary: string;
    rawStructuredResult: unknown;
    normalizedStructuredResult: TRecord;
    tokenEstimateIn: number;
    tokenEstimateOut: number;
    status: PipelineJobStatus;
}

/**
 * 功能：定义领域账本记录。
 */
export interface PipelineDomainLedgerRecord<TCanonical = unknown> {
    jobId: string;
    domain: PipelineDomain;
    ledgerKey: string;
    canonicalRecord: TCanonical;
    sourceBatchIds: string[];
    conflictState: PipelineConflictState;
    updatedAt: number;
}

/**
 * 功能：定义分段摘要记录。
 */
export interface PipelineSectionDigestRecord {
    jobId: string;
    sectionId: string;
    batchIds: string[];
    summary: string;
    actors: unknown[];
    entities: unknown[];
    relationships: unknown[];
    tasks: unknown[];
    worldChanges: unknown[];
    unresolvedConflicts: PipelineConflictRecord[];
}

/**
 * 功能：定义冲突记录。
 */
export interface PipelineConflictRecord {
    bucketId: string;
    domain: PipelineDomain;
    conflictType: string;
    records: unknown[];
}

/**
 * 功能：定义冲突解决补丁。
 */
export interface ConflictResolutionPatch {
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
}

/**
 * 功能：定义冲突桶记录。
 */
export interface PipelineConflictBucketRecord {
    jobId: string;
    bucketId: string;
    domain: PipelineDomain;
    conflictType: string;
    records: unknown[];
    resolutionStatus: PipelineResolutionStatus;
    resolutionResult?: ConflictResolutionPatch;
}

/**
 * 功能：定义归约结果。
 */
export interface DomainReduceResult<TCanonical> {
    canonicalRecords: TCanonical[];
    unresolvedConflicts: PipelineConflictRecord[];
    stats: {
        inputCount: number;
        canonicalCount: number;
        unresolvedCount: number;
    };
}

/**
 * 功能：定义统一诊断信息。
 */
export interface PipelineDiagnostics {
    jobId: string;
    jobType: PipelineJobType;
    usedLLM: boolean;
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
    applyCount: number;
    reasonCode: string;
}
