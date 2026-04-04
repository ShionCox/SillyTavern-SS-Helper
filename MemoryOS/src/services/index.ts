// ─── MemoryOS 服务层 barrel export ───

export { PromptAssemblyService } from './prompt-assembly-service';
export { SummaryService } from './summary-service';
export { MemoryRetrievalService } from './memory-retrieval-service';
export { MemoryMaintenanceService } from './memory-maintenance-service';
export type {
    MaintenanceReport,
    DuplicateGroup,
    CompareKeyConflict,
    LowValueCandidate,
    AccessStatistics,
    MaintenanceAuditEntry,
} from './memory-maintenance-service';
export {
    buildQueryContextBundle,
    type QueryContextBundle,
    type QueryContextBuilderInput,
} from './query-context-builder';
export { GraphService } from './graph-service';
export { BindingResolutionService } from './binding-resolution-service';
export { DreamingService } from './dreaming-service';
export { DreamSessionRepository } from './dream-session-repository';
export { DreamMutationApplier } from './dream-mutation-applier';
export { DreamWaveRecallService } from './dream-wave-recall-service';
export { DreamRecallDiagnosticsService } from './dream-recall-diagnostics-service';
export type {
    DreamSessionMetaRecord,
    DreamSessionRecallRecord,
    DreamSessionOutputRecord,
    DreamSessionApprovalRecord,
    DreamRollbackSnapshotRecord,
    DreamMutationProposal,
    DreamRecallHit,
    DreamReviewDecision,
    DreamSessionRecord,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamMutationExplain,
    DreamWaveOutput,
    DreamFusionResult,
} from './dream-types';

// ─── 向量系统 ───
export { EmbeddingService } from './embedding-service';
export type { EmbeddingEncodeOptions, EmbeddingEncodeResult, EmbeddingModelInfo } from './embedding-service';
export { VectorDocumentBuilder } from './vector-document-builder';
export { VectorStoreAdapterService } from './vector-store-adapter';
export { VectorStrategyRouter } from './vector-strategy-router';
export type { VectorStrategyRouterConfig } from './vector-strategy-router';
export { VectorRerankService } from './vector-rerank-service';
export { LLMHubRerankService } from './llmhub-rerank-service';
export { HybridRetrievalService } from './hybrid-retrieval-service';
export type { HybridRetrievalInput, HybridRetrievalOutput } from './hybrid-retrieval-service';
export { LocalVectorStore } from './vector-stores/local-vector-store';
export {
    onEntrySaved,
    onEntryDeleted,
    onRelationshipSaved,
    onActorSaved,
    onSummarySaved,
    rebuildAllVectorDocuments,
    rebuildAllEmbeddings,
    upgradeEmbeddingModel,
} from './vector-index-service';
