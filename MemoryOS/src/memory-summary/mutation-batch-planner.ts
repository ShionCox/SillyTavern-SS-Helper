import type { PipelineBudgetPolicy } from '../pipeline/pipeline-types';
import type { SummaryPlannerOutput } from './mutation-types';

/**
 * 功能：定义单个 mutation 批次计划。
 */
export interface SummaryMutationBatchPlan {
    batchId: string;
    focusTypes: string[];
    candidateIds: string[];
    actionBudget: number;
}

/**
 * 功能：根据 planner 结果与候选信息切分 mutation 批次。
 * @param input 批次规划输入。
 * @returns 批次计划列表。
 */
export function planSummaryMutationBatches(input: {
    plannerDecision: SummaryPlannerOutput;
    candidateRecords: Array<{ candidateId: string; targetKind: string }>;
    budget: PipelineBudgetPolicy;
}): SummaryMutationBatchPlan[] {
    const focusTypes = input.plannerDecision.focus_types.length > 0
        ? [...input.plannerDecision.focus_types]
        : [...new Set(input.candidateRecords.map((item) => item.targetKind).filter(Boolean))];
    if (focusTypes.length <= 0) {
        return [{
            batchId: 'summary:batch:0001',
            focusTypes: [],
            candidateIds: input.candidateRecords.map((item) => item.candidateId),
            actionBudget: input.budget.maxActionsPerMutation,
        }];
    }

    const plans: SummaryMutationBatchPlan[] = [];
    let batchIndex = 0;
    let currentTypes: string[] = [];
    let currentCandidateIds: string[] = [];

    for (const focusType of focusTypes) {
        const candidateIds = input.candidateRecords
            .filter((item) => item.targetKind === focusType)
            .map((item) => item.candidateId);
        const nextCandidateIds = dedupeStrings([...currentCandidateIds, ...candidateIds]);
        if (currentTypes.length > 0 && nextCandidateIds.length > input.budget.maxFinalizerItemsPerDomain) {
            batchIndex += 1;
            plans.push({
                batchId: `summary:batch:${String(batchIndex).padStart(4, '0')}`,
                focusTypes: currentTypes,
                candidateIds: currentCandidateIds,
                actionBudget: input.budget.maxActionsPerMutation,
            });
            currentTypes = [focusType];
            currentCandidateIds = candidateIds;
            continue;
        }
        currentTypes.push(focusType);
        currentCandidateIds = nextCandidateIds;
    }

    if (currentTypes.length > 0 || plans.length <= 0) {
        batchIndex += 1;
        plans.push({
            batchId: `summary:batch:${String(batchIndex).padStart(4, '0')}`,
            focusTypes: currentTypes,
            candidateIds: currentCandidateIds,
            actionBudget: input.budget.maxActionsPerMutation,
        });
    }

    return plans;
}

/**
 * 功能：去重字符串列表。
 * @param values 原始列表。
 * @returns 去重后的列表。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
