export type {
    RetrievalCandidate,
    RetrievalQuery,
    RetrievalResultItem,
    RetrievalProvider,
    RetrievalScoreBreakdown,
    RetrievalFacet,
    RetrievalMatchedRule,
    RetrievalRulePackMode,
    RetrievalContextRoute,
    RetrievalOrchestratorResult,
} from './types';
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

