import type { MemoryOSSettings } from '../settings/store';
import type { PipelineBudgetPolicy } from './pipeline-types';

/**
 * 功能：定义统一预算默认值。
 */
export const DEFAULT_PIPELINE_BUDGET_POLICY: PipelineBudgetPolicy = {
    maxInputCharsPerBatch: 16000,
    maxOutputItemsPerBatch: 20,
    maxActionsPerMutation: 10,
    maxSectionBatchCount: 5,
    maxConflictBucketSize: 10,
    maxSectionDigestChars: 2000,
    maxRollingDigestChars: 1200,
    maxCandidateSummaryChars: 300,
    maxFinalizerItemsPerDomain: 50,
};

/**
 * 功能：根据设置解析统一预算策略。
 * @param settings MemoryOS 设置。
 * @returns 当前应生效的预算策略。
 */
export function resolvePipelineBudgetPolicy(settings: Pick<
    MemoryOSSettings,
    | 'pipelineBudgetEnabled'
    | 'pipelineMaxInputCharsPerBatch'
    | 'pipelineMaxOutputItemsPerBatch'
    | 'pipelineMaxActionsPerMutation'
    | 'pipelineMaxSectionBatchCount'
    | 'pipelineMaxConflictBucketSize'
    | 'pipelineMaxSectionDigestChars'
    | 'pipelineMaxFinalizerItemsPerDomain'
    | 'summarySecondStageRollingDigestMaxChars'
    | 'summarySecondStageCandidateSummaryMaxChars'
    | 'takeoverDefaultBatchSize'
>): PipelineBudgetPolicy {
    if (settings.pipelineBudgetEnabled === false) {
        return {
            ...DEFAULT_PIPELINE_BUDGET_POLICY,
            maxSectionBatchCount: Math.max(1, settings.takeoverDefaultBatchSize || DEFAULT_PIPELINE_BUDGET_POLICY.maxSectionBatchCount),
            maxRollingDigestChars: settings.summarySecondStageRollingDigestMaxChars > 0
                ? settings.summarySecondStageRollingDigestMaxChars
                : DEFAULT_PIPELINE_BUDGET_POLICY.maxRollingDigestChars,
            maxCandidateSummaryChars: settings.summarySecondStageCandidateSummaryMaxChars > 0
                ? settings.summarySecondStageCandidateSummaryMaxChars
                : DEFAULT_PIPELINE_BUDGET_POLICY.maxCandidateSummaryChars,
        };
    }
    return {
        maxInputCharsPerBatch: clampBudgetNumber(settings.pipelineMaxInputCharsPerBatch, 1000, 50000, DEFAULT_PIPELINE_BUDGET_POLICY.maxInputCharsPerBatch),
        maxOutputItemsPerBatch: clampBudgetNumber(settings.pipelineMaxOutputItemsPerBatch, 1, 200, DEFAULT_PIPELINE_BUDGET_POLICY.maxOutputItemsPerBatch),
        maxActionsPerMutation: clampBudgetNumber(settings.pipelineMaxActionsPerMutation, 1, 100, DEFAULT_PIPELINE_BUDGET_POLICY.maxActionsPerMutation),
        maxSectionBatchCount: clampBudgetNumber(settings.pipelineMaxSectionBatchCount, 1, 50, DEFAULT_PIPELINE_BUDGET_POLICY.maxSectionBatchCount),
        maxConflictBucketSize: clampBudgetNumber(settings.pipelineMaxConflictBucketSize, 1, 100, DEFAULT_PIPELINE_BUDGET_POLICY.maxConflictBucketSize),
        maxSectionDigestChars: clampBudgetNumber(settings.pipelineMaxSectionDigestChars, 100, 10000, DEFAULT_PIPELINE_BUDGET_POLICY.maxSectionDigestChars),
        maxRollingDigestChars: settings.summarySecondStageRollingDigestMaxChars > 0
            ? settings.summarySecondStageRollingDigestMaxChars
            : DEFAULT_PIPELINE_BUDGET_POLICY.maxRollingDigestChars,
        maxCandidateSummaryChars: settings.summarySecondStageCandidateSummaryMaxChars > 0
            ? settings.summarySecondStageCandidateSummaryMaxChars
            : DEFAULT_PIPELINE_BUDGET_POLICY.maxCandidateSummaryChars,
        maxFinalizerItemsPerDomain: clampBudgetNumber(settings.pipelineMaxFinalizerItemsPerDomain, 1, 500, DEFAULT_PIPELINE_BUDGET_POLICY.maxFinalizerItemsPerDomain),
    };
}

/**
 * 功能：裁剪预算数值。
 * @param value 原始值。
 * @param min 最小值。
 * @param max 最大值。
 * @param fallback 回退值。
 * @returns 裁剪后的数值。
 */
function clampBudgetNumber(value: number, min: number, max: number, fallback: number): number {
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
}
