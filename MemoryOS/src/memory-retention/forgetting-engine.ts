import type { RetentionStage, RetentionState } from './retention-types';

/**
 * 功能：遗忘计算输入。
 */
export interface ComputeRetentionStateInput {
    memoryPercent: number;
    rehearsalCount?: number;
}

/**
 * 功能：根据记忆度计算遗忘状态。
 * @param input 遗忘计算输入。
 * @returns 遗忘状态。
 */
export function computeRetentionState(input: ComputeRetentionStateInput): RetentionState {
    const memoryPercent = clampPercent(input.memoryPercent);
    const forgetProbability = clamp01(1 - (memoryPercent / 100));
    const stage: RetentionStage = resolveRetentionStage(memoryPercent);
    return {
        forgetProbability,
        stage,
        rehearsalCount: Math.max(0, Math.floor(Number(input.rehearsalCount ?? 0) || 0)),
    };
}

/**
 * 功能：根据遗忘阶段渲染叙事前缀。
 * @param stage 遗忘阶段。
 * @returns 叙事前缀文本。
 */
export function renderRetentionNarrativePrefix(stage: RetentionStage): string {
    if (stage === 'blur') {
        return '她隐约记得：';
    }
    if (stage === 'distorted') {
        return '她模糊地认为：';
    }
    return '她清晰记得：';
}

/**
 * 功能：解析遗忘阶段。
 * @param memoryPercent 记忆度百分比。
 * @returns 遗忘阶段。
 */
function resolveRetentionStage(memoryPercent: number): RetentionStage {
    if (memoryPercent <= 30) {
        return 'distorted';
    }
    if (memoryPercent <= 70) {
        return 'blur';
    }
    return 'clear';
}

/**
 * 功能：限制到 0~100 百分比。
 * @param value 原始值。
 * @returns 百分比。
 */
function clampPercent(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * 功能：限制到 0~1 区间。
 * @param value 原始值。
 * @returns 限制结果。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

