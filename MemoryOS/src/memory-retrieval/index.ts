export type {
    RetrievalCandidate,
    RetrievalQuery,
    RetrievalResultItem,
    RetrievalProvider,
    RetrievalScoreBreakdown,
    RetrievalFacet,
    RetrievalContextRoute,
    RetrievalOrchestratorResult,
} from './types';
export { RetrievalOrchestrator } from './retrieval-orchestrator';
export { LexicalRetrievalProvider } from './lexical-provider';
export { EmbeddingRetrievalProvider } from './embedding-provider';
export { routeRetrievalContext, buildContextDictionaryFromCandidates, type ContextDictionaryRegistry } from './context-router';
export { buildCandidateLinkIndex, type CandidateLinkIndex, type CandidateNeighborEdge } from './link-index';
export { expandFromSeeds } from './graph-expander';
export { applyCoverageSecondPass } from './coverage-checker';
export { pruneForDiversity } from './diversity-pruner';
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

