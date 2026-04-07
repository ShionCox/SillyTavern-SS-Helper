import type { RetentionStage, RetentionState } from './retention-types';
import { buildRetentionStateFromProjection, projectMemoryRetentionCore, type MemoryRetentionCoreInput } from '../core/memory-retention-core';

/**
 * 功能：定义记忆保留阶段计算输入。
 */
export interface ComputeRetentionStateInput extends MemoryRetentionCoreInput {
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
    return buildRetentionStateFromProjection(projectMemoryRetentionCore(input), input);
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
