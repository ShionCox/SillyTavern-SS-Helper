import type { RetentionStage, RetentionState } from './retention-types';

/**
 * 功能：定义记忆保留阶段计算输入。
 */
export interface ComputeRetentionStateInput {
    memoryPercent?: number;
    importance?: number;
    rehearsalCount?: number;
    recencyHours?: number;
    actorMemoryStat?: number;
    relationSensitivity?: number;
}

/**
 * 功能：根据多维信号计算记忆保留状态。
 * @param input 计算输入
 * @returns 记忆保留状态
 */
export function computeRetentionState(input: ComputeRetentionStateInput): RetentionState {
    const memoryPercent = clampPercent(input.memoryPercent ?? 0);
    const importance = clampPercent(input.importance ?? memoryPercent);
    const rehearsalCount = Math.max(0, Math.floor(Number(input.rehearsalCount ?? 0) || 0));
    const actorMemoryStat = clampPercent(input.actorMemoryStat ?? memoryPercent);
    const relationSensitivity = clampPercent(input.relationSensitivity ?? 50);
    const recencyHours = clampPositiveNumber(input.recencyHours ?? 24 * 30);
    const recencyScore = recencyHours <= 0 ? 100 : Math.max(0, 100 - Math.min(100, recencyHours / 6));
    const rehearsalScore = Math.min(100, rehearsalCount * 12);
    const score = clampPercent(
        (memoryPercent * 0.32)
        + (importance * 0.22)
        + (actorMemoryStat * 0.18)
        + (relationSensitivity * 0.12)
        + (rehearsalScore * 0.1)
        + (recencyScore * 0.06),
    );
    const stage = resolveRetentionStage(score);
    const forgetProbability = clamp01(1 - (score / 100));
    const reasonCodes = buildReasonCodes({
        score,
        rehearsalCount,
        recencyHours,
        importance,
        actorMemoryStat,
        relationSensitivity,
    });
    return {
        stage,
        score,
        forgetProbability,
        rehearsalCount,
        reasonCodes,
        distortionTemplateId: stage === 'distorted' ? resolveDistortionTemplateId(relationSensitivity, importance) : undefined,
    };
}

/**
 * 功能：渲染保留阶段前缀。
 * @param stage 保留阶段
 * @returns 前缀文本
 */
export function renderRetentionNarrativePrefix(stage: RetentionStage): string {
    if (stage === 'blur') {
        return '她隐约记得：';
    }
    if (stage === 'distorted') {
        return '她记忆失真，误以为：';
    }
    return '她清楚记得：';
}

/**
 * 功能：解析记忆保留阶段。
 * @param score 记忆分数
 * @returns 保留阶段
 */
function resolveRetentionStage(score: number): RetentionStage {
    if (score <= 35) {
        return 'distorted';
    }
    if (score <= 72) {
        return 'blur';
    }
    return 'clear';
}

/**
 * 功能：构建保留阶段原因码。
 * @param input 原始输入
 * @returns 原因码列表
 */
function buildReasonCodes(input: {
    score: number;
    rehearsalCount: number;
    recencyHours: number;
    importance: number;
    actorMemoryStat: number;
    relationSensitivity: number;
}): string[] {
    const result: string[] = [];
    if (input.score >= 73) {
        result.push('retention_clear');
    } else if (input.score >= 36) {
        result.push('retention_blur');
    } else {
        result.push('retention_distorted');
    }
    if (input.rehearsalCount >= 3) {
        result.push('rehearsal_boosted');
    }
    if (input.recencyHours >= 24 * 14) {
        result.push('recency_weakened');
    }
    if (input.importance >= 75) {
        result.push('importance_high');
    }
    if (input.actorMemoryStat <= 35) {
        result.push('actor_memory_low');
    }
    if (input.relationSensitivity >= 75) {
        result.push('relation_sensitive');
    }
    return result;
}

/**
 * 功能：解析失真模板标识。
 * @param relationSensitivity 关系敏感度
 * @param importance 重要度
 * @returns 模板标识
 */
function resolveDistortionTemplateId(relationSensitivity: number, importance: number): string {
    if (relationSensitivity >= 70) {
        return 'relationship_attitude_shift';
    }
    if (importance >= 70) {
        return 'critical_fact_fragmented';
    }
    return 'generic_memory_drift';
}

/**
 * 功能：限制百分比。
 * @param value 原始值
 * @returns 百分比
 */
function clampPercent(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * 功能：限制到 0~1。
 * @param value 原始值
 * @returns 限制结果
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

/**
 * 功能：限制为正数。
 * @param value 原始值
 * @returns 正数
 */
function clampPositiveNumber(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return 0;
    }
    return numeric;
}
