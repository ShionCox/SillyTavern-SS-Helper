export type {
    MemoryEntryCategory,
    MemoryFieldKind,
    MemoryEntryTypeField,
    MemoryEntryType,
    MemoryEntry,
    MemoryEntryFieldDiff,
    MemoryEntryAuditRecord,
    ActorMemoryProfile,
    ActorDisplayNameSource,
    EnsureActorProfileInput,
    RoleEntryMemory,
    MemoryRelationshipRecord,
    SummaryEntryUpsert,
    SummaryRefreshBinding,
    SummarySnapshot,
    StructuredBindings,
    BindingMatchMode,
    BindingResolutionDecision,
    ResolvedBindings,
    LedgerMutation,
    LedgerMutationBatchContext,
    ApplyLedgerMutationBatchResult,
    MemoryMutationHistoryRecord,
    WorldProfileBinding,
    PromptAssemblyRoleEntry,
    PromptAssemblyDiagnostics,
    PromptAssemblySnapshot,
    UnifiedMemoryFilters,
} from './unified-memory';

export type {
    MemoryTakeoverMode,
    MemoryTakeoverStatus,
    MemoryTakeoverRange,
    TakeoverSourceSegmentKind,
    TakeoverSourceSegment,
    MemoryTakeoverFloorBlockRecord,
    MemoryTakeoverFloorManifestRecord,
    MemoryTakeoverPlan,
    MemoryTakeoverBatch,
    MemoryTakeoverBindings,
    MemoryTakeoverStableFact,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverCandidateActorStatus,
    MemoryTakeoverCandidateActorMention,
    MemoryTakeoverRejectedMention,
    MemoryTakeoverBatchAuditReport,
    MemoryTakeoverEntityType,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverBaseline,
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationStats,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverProgressSnapshot,
    MemoryTakeoverPreviewBatchEstimate,
    MemoryTakeoverPayloadPreviewBatch,
    MemoryTakeoverPayloadPreview,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
} from './memory-takeover';

export {
    DEFAULT_ACTOR_MEMORY_STAT,
    CORE_MEMORY_ENTRY_TYPES,
} from './unified-memory';

export type {
    VectorDocSourceKind,
    EmbeddingStatus,
    VectorDocument,
    DBMemoryVectorDocument,
    DBMemoryVectorIndex,
    DBMemoryVectorRecallStat,
} from './vector-document';

export type {
    IndexedVectorDocument,
    VectorSearchQuery,
    VectorSearchHit,
    VectorStoreAdapter,
} from './vector-search';

export type {
    VectorRouteKind,
    VectorStrategyDecision,
    VectorStrategyInput,
} from './vector-strategy';

export type {
    VectorRerankInput,
    VectorRerankResult,
} from './vector-rerank';
