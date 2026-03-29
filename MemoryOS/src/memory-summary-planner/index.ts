export {
    detectSummarySignals,
    type SummarySignalDetectionResult,
    type SummarySignalDetectionInput,
} from './signal-detector';
export {
    resolveCandidateTypes,
    type CandidateTypeResolverInput,
} from './candidate-type-resolver';
export {
    resolveSummaryTypeSchemas,
    type SummaryTypeSchema,
} from './schema-resolver';
export {
    resolveCandidateRecords,
    type ResolveCandidateRecordsInput,
    type SummaryCandidateRecord,
} from './candidate-record-resolver';
export {
    buildSummaryMutationContext,
    buildLightweightPlannerInput,
    normalizeSummarySnapshot,
    type BuildSummaryContextInput,
    type NormalizedSummaryDigest,
    type SummaryMutationContext,
    type SummaryWindowInput,
    type LightweightPlannerInput,
} from './context-builder';
export {
    buildActiveKeywordSets,
    getDefaultNarrativeStyle,
    resolveNarrativeStyle,
    type ActiveKeywordSets,
    type KeywordStyle,
    type NarrativeStyle,
    type ResolvedNarrativeStyle,
} from './planner-keywords';

// ─── 残缺片段修复链路 ──────────────────────────────
export {
    type WindowCandidate,
    type FragmentAnalysis,
    type RepairedCandidate,
    type PlannerFact,
    type PlannerSignal,
    type FragmentRepairMetadata,
    type FragmentRepairDebugRow,
    type CandidateType,
    type FragmentType,
    type RepairMode,
    type FactCategory,
    type SignalCategory,
} from './fragment-types';
export { analyzeFragment, analyzeTextFragment } from './fragment-detector';
export { buildRepairContext, repairFragment } from './context-repair-engine';
export { rewriteAsFact } from './fact-rewriter';
export { downgradeToSignal } from './signal-downgrader';
export { runFragmentRepairPipeline } from './planner-input-assembler';
export { buildFragmentRepairAuditRecord, formatAuditLog, type FragmentRepairAuditRecord } from './memory-audit-logger';

