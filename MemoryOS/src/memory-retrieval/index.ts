export type {
    RetrievalCandidate,
    RetrievalQuery,
    RetrievalResultItem,
    RetrievalProvider,
    RetrievalProviderCapability,
    RetrievalScoreBreakdown,
    RetrievalFacet,
    RetrievalMatchedRule,
    RetrievalRulePackMode,
    RetrievalContextRoute,
    RetrievalOrchestratorResult,
    RetrievalDiagnostics,
} from './types';

export type { RetrievalMode } from './retrieval-mode';
export { normalizeRetrievalMode } from './retrieval-mode';

export type { RecallConfig } from './recall-config';
export { buildDefaultRecallConfig, mergeRecallConfig } from './recall-config';

export type { PayloadFilter } from './payload-filter';
export { applyPayloadFilter } from './payload-filter';

export type {
    MemoryRetrievalInput,
    PromptRecallInput,
    TakeoverRecallInput,
    WorkbenchRecallInput,
} from './retrieval-input';

export type {
    MemoryRetrievalOutput,
    RetrievalOutputDiagnostics,
    VectorProviderStatus,
    ResultSourceLabel,
} from './retrieval-output';

export type {
    RetrievalExplanation,
    RetrievalExplanationBundle,
} from './retrieval-explanation';
export { buildRetrievalExplanation, buildRetrievalExplanationBundle } from './retrieval-explanation';

export { RetrievalOrchestrator } from './retrieval-orchestrator';
export { LexicalRetrievalProvider } from './lexical-provider';
export { EmbeddingRetrievalProvider } from './embedding-provider';
export {
    routeRetrievalContext,
    buildContextDictionaryFromCandidates,
    type ActorProfileForDictionary,
    type ContextDictionaryRegistry,
    type RecentContextBias,
    type RouteRetrievalContextOptions,
} from './context-router';
export {
    applyEntityBoostSignals,
    applyEntityPatternBoosts,
} from './retrieval-entity-boost';
export { buildCandidateLinkIndex, type CandidateLinkIndex, type CandidateNeighborEdge } from './link-index';
export { expandFromSeeds, type GraphExpansionDiagnostics, type GraphExpansionInput, type GraphExpansionResult } from './graph-expander';
export { applyCoverageSecondPass, type CoverageSecondPassResult } from './coverage-checker';
export { pruneForDiversity, type DiversityPruneInput, type DiversityPruneResult } from './diversity-pruner';
export {
    tokenizeText,
    computeEditDistance,
    computeEditSimilarity,
    computeNGramSimilarity,
    computeRecencyWeight,
    computeMemoryWeight,
    mergeSeedScoreBreakdown,
    applyGraphBoost,
    applyDiversityPenalty,
    clamp01,
} from './scoring';
