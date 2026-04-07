import type { MemoryEntry, MemoryRelationshipRecord } from '../types';
import type { UnifiedMemoryMutationApplyResult } from '../types/unified-mutation';

export const DREAM_PHASE1_MAX_MUTATION_COUNT = 8;

export type DreamSessionStatus = 'queued' | 'running' | 'generated' | 'approved' | 'rejected' | 'failed' | 'rolled_back';
export type DreamApprovalStatus = 'pending' | 'approved' | 'rejected';
export type DreamTriggerReason = 'manual' | 'generation_ended' | 'idle';
export type DreamExecutionMode = 'manual_review' | 'silent';
export type DreamRunProfile = 'auto_light' | 'auto_review' | 'manual_deep';
export type DreamSessionOutputKind = 'full' | 'light';
export type DreamApprovalMode = 'interactive' | 'deferred' | 'auto_silent';
export type DreamRecallSource = 'recent' | 'mid' | 'deep' | 'fused';
export type DreamMutationType = 'entry_create' | 'entry_patch' | 'relationship_patch';
export type DreamMaintenanceProposalType =
    | 'memory_compression'
    | 'relationship_reinforcement'
    | 'shadow_adjustment'
    | 'summary_candidate_promotion';
export type DreamMaintenanceProposalStatus = 'pending' | 'applied' | 'rejected' | 'rolled_back';
export type DreamNeuronNodeType =
    | 'entry'
    | 'actor'
    | 'relation'
    | 'topic'
    | 'state'
    | 'summary'
    | 'compareKey';

export interface DreamSettingsSnapshot {
    retrievalMode: string;
    dreamContextMaxChars: number;
    dreamPromptVersion?: string;
    dreamPromptStylePreset?: string;
}

export interface DreamPromptInfoRecord {
    promptVersion: string;
    stylePreset: string;
    schemaVersion: string;
}

export interface DreamSessionMetaRecord {
    dreamId: string;
    chatKey: string;
    status: DreamSessionStatus;
    triggerReason: DreamTriggerReason;
    createdAt: number;
    updatedAt: number;
    settingsSnapshot: DreamSettingsSnapshot;
    failureReason?: string;
    executionMode?: DreamExecutionMode;
    runProfile?: DreamRunProfile;
}

export interface DreamRecallHit {
    entryId: string;
    title: string;
    summary: string;
    score: number;
    source: DreamRecallSource;
    actorKeys: string[];
    relationKeys: string[];
    tags: string[];
    updatedAt?: number;
}

export interface DreamNeuronNode {
    nodeKey: string;
    nodeType: DreamNeuronNodeType;
    label: string;
    activation: number;
    novelty: number;
    rarity: number;
    lastSeenAt: number;
    usageCount: number;
    chatKey: string;
}

export interface DreamNeuronEdge {
    edgeKey: string;
    fromNodeKey: string;
    toNodeKey: string;
    edgeType: 'co_occurrence' | 'relation' | 'summary_link' | 'temporal_bridge';
    weight: number;
    lastActivatedAt: number;
    evidenceEntryIds: string[];
}

export interface DreamRecallCandidate extends DreamRecallHit {
    candidateId: string;
    baseScore: number;
    activationScore: number;
    noveltyScore: number;
    repetitionPenalty: number;
    finalScore: number;
    sourceNodeKeys: string[];
    bridgeNodeKeys: string[];
    reasonChain: string[];
}

export interface DreamWaveOutput {
    waveType: 'recent' | 'mid' | 'deep';
    queryText: string;
    seedEntryIds: string[];
    activatedNodeKeys: string[];
    candidates: DreamRecallCandidate[];
    diagnostics: {
        candidateCount: number;
        truncated: boolean;
        baseReason: string[];
    };
}

export interface DreamFusionResult {
    fusedCandidates: DreamRecallCandidate[];
    bridgeNodeKeys: string[];
    rejectedCandidateIds: string[];
    diagnostics: {
        duplicateDropped: number;
        boostedByNovelty: number;
        boostedByActivation: number;
        finalSelectedCount: number;
    };
}

export interface DreamSessionRecallRecord {
    dreamId: string;
    chatKey: string;
    recentHits: DreamRecallHit[];
    midHits: DreamRecallHit[];
    deepHits: DreamRecallHit[];
    fusedHits: DreamRecallHit[];
    diagnostics: {
        sourceQuery: string;
        totalCandidates: number;
        truncated: boolean;
    };
    createdAt: number;
    updatedAt: number;
}

export interface DreamMutationProposal {
    mutationId: string;
    mutationType: DreamMutationType;
    confidence: number;
    reason: string;
    sourceWave: DreamRecallSource;
    sourceEntryIds: string[];
    preview: string;
    payload: Record<string, unknown>;
    explain?: DreamMutationExplain;
}

export interface DreamMutationExplain {
    sourceWave: DreamRecallSource;
    sourceEntryIds: string[];
    sourceNodeKeys: string[];
    bridgeNodeKeys: string[];
    explanationSteps: string[];
    confidenceBreakdown: {
        retrieval: number;
        activation: number;
        novelty: number;
        repetitionPenalty: number;
        final: number;
    };
}

export interface DreamSessionOutputRecord {
    dreamId: string;
    chatKey: string;
    promptInfo?: DreamPromptInfoRecord;
    narrative: string;
    highlights: string[];
    proposedMutations: DreamMutationProposal[];
    outputKind?: DreamSessionOutputKind;
    createdAt: number;
    updatedAt: number;
}

export interface DreamSessionApprovalRecord {
    dreamId: string;
    chatKey: string;
    status: DreamApprovalStatus;
    approvedMutationIds: string[];
    rejectedMutationIds: string[];
    approvedMaintenanceProposalIds?: string[];
    rejectedMaintenanceProposalIds?: string[];
    rollbackKey?: string;
    approvalMode?: DreamApprovalMode;
    approvedAt?: number;
    createdAt: number;
    updatedAt: number;
}

export interface DreamRollbackSnapshotRecord {
    dreamId: string;
    chatKey: string;
    rollbackKey: string;
    createdAt: number;
    updatedAt: number;
    touchedEntryIds: string[];
    touchedRelationshipIds: string[];
    before: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
    };
    after?: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
    };
}

export interface DreamSessionRecord {
    meta: DreamSessionMetaRecord | null;
    recall: DreamSessionRecallRecord | null;
    output: DreamSessionOutputRecord | null;
    approval: DreamSessionApprovalRecord | null;
    rollback: DreamRollbackSnapshotRecord | null;
    diagnostics: DreamSessionDiagnosticsRecord | null;
    graphSnapshot: DreamSessionGraphSnapshotRecord | null;
    maintenanceProposals: DreamMaintenanceProposalRecord[];
    qualityReport: DreamQualityReport | null;
    rollbackMetadata: DreamRollbackMetadataRecord | null;
}

export interface DreamReviewDecision {
    decision: 'approved' | 'rejected' | 'deferred';
    approvedMutationIds: string[];
    rejectedMutationIds: string[];
    approvedMaintenanceProposalIds: string[];
    rejectedMaintenanceProposalIds: string[];
}

export interface DreamSessionDiagnosticsRecord {
    dreamId: string;
    chatKey: string;
    waveOutputs: DreamWaveOutput[];
    fusionResult: DreamFusionResult;
    createdAt: number;
    updatedAt: number;
}

export interface DreamSessionGraphSnapshotRecord {
    dreamId: string;
    chatKey: string;
    activatedNodes: DreamNeuronNode[];
    activatedEdges: DreamNeuronEdge[];
    createdAt: number;
    updatedAt: number;
}

export interface DreamMaintenanceProposalRecord {
    proposalId: string;
    dreamId: string;
    chatKey: string;
    proposalType: DreamMaintenanceProposalType;
    status: DreamMaintenanceProposalStatus;
    confidence: number;
    reason: string;
    sourceEntryIds: string[];
    sourceNodeKeys: string[];
    preview: string;
    payload: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
    appliedAt?: number;
    rejectedAt?: number;
    rolledBackAt?: number;
    appliedResult?: {
        affectedEntryIds: string[];
        affectedRelationshipIds: string[];
        summaryCandidateIds: string[];
    };
    rollbackBefore?: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
    };
}

export interface DreamQualityReport {
    dreamId: string;
    chatKey: string;
    qualityScore: number;
    warnings: string[];
    blockedMutationIds: string[];
    forcedReviewMutationIds: string[];
    createdAt: number;
    updatedAt: number;
}

export interface DreamRollbackMetadataRecord {
    dreamId: string;
    chatKey: string;
    status: 'applied' | 'rolled_back';
    appliedMutationIds: string[];
    appliedMaintenanceProposalIds: string[];
    affectedEntryIds: string[];
    affectedRelationshipIds: string[];
    summaryCandidateIds: string[];
    applyResult?: UnifiedMemoryMutationApplyResult;
    createdAt: number;
    updatedAt: number;
    rolledBackAt?: number;
}

export interface DreamScheduleDecision {
    shouldTrigger: boolean;
    reasonCodes: string[];
    triggerSource: DreamTriggerReason;
    blockedBy?: string[];
    suggestedDelayMs?: number;
}

export interface DreamSchedulerStateRecord {
    chatKey: string;
    lastTriggeredAt?: number;
    lastTriggerSource?: DreamTriggerReason;
    lastCompletedAt?: number;
    lastSuccessAt?: number;
    lastFailedAt?: number;
    lastAttemptAt?: number;
    lastEligibilityHeavyScanAt?: number;
    lastLockAcquireAt?: number;
    lastLockReleaseAt?: number;
    activeDreamId?: string;
    activeHolderId?: string;
    lastBlockedByLockAt?: number;
    lastBlockedReasonCodes?: string[];
    dailyRunCount: number;
    dailyDateKey: string;
    queuedJobCount: number;
    active: boolean;
    lastDecision?: DreamScheduleDecision;
    createdAt: number;
    updatedAt: number;
}
