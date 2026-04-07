import type {
    ApplyLedgerMutationBatchResult,
    LedgerMutation,
    LedgerMutationBatchContext,
} from './unified-memory';

export type UnifiedMemoryMutation = LedgerMutation;
export type UnifiedMemoryMutationBatchContext = LedgerMutationBatchContext;

export interface UnifiedRelationshipMutationApplyResult {
    appliedRelationshipMutationIds: string[];
    skippedMutationIds: string[];
    createdRelationshipIds: string[];
    updatedRelationshipIds: string[];
    affectedRelationshipIds: string[];
    historyWritten: boolean;
}

export interface UnifiedMemoryMutationApplyResult {
    appliedEntryMutationIds: string[];
    appliedRelationshipMutationIds: string[];
    skippedMutationIds: string[];
    deletedEntryIds: string[];
    invalidatedEntryIds: string[];
    updatedEntryIds: string[];
    createdEntryIds: string[];
    createdRelationshipIds: string[];
    updatedRelationshipIds: string[];
    auditWritten: boolean;
    historyWritten: boolean;
    entryResult?: ApplyLedgerMutationBatchResult;
    relationshipResult?: UnifiedRelationshipMutationApplyResult;
}
