/**
 * 功能：兼容旧读侧消费的遗忘分层接口。
 */

import type { RetentionStage } from '../memory-retention/retention-types';
import {
    projectMemoryRetentionCore,
    shouldTriggerShadowRecallByInput,
    type MemoryForgottenLevel,
    type MemoryRetentionCoreInput,
    type MemoryRetentionProjection,
} from './memory-retention-core';

export type MemoryForgettingTier = MemoryForgottenLevel;

export interface MemoryForgettingProjection {
    forgettingTier: MemoryForgettingTier;
    canParticipateInNormalRecall: boolean;
    canParticipateInShadowRecall: boolean;
    shadowRecallPenalty: number;
    shadowConfidencePenalty: number;
    shadowRenderMode: 'blur' | 'distorted';
    recommendedRetentionStage: RetentionStage;
    isForgottenPersisted: boolean;
    retention: MemoryRetentionProjection;
}

export interface MemoryForgettingSource extends MemoryRetentionCoreInput {}

/**
 * 功能：把旧式 forgotten 布尔值投影成兼容遗忘层级。
 * @param input 遗忘投影输入。
 * @returns 遗忘投影。
 */
export function projectMemoryForgettingState(input: MemoryForgettingSource): MemoryForgettingProjection {
    const retention = projectMemoryRetentionCore(input);
    return {
        forgettingTier: retention.forgottenLevel,
        canParticipateInNormalRecall: retention.forgottenLevel === 'active',
        canParticipateInShadowRecall: retention.forgottenLevel === 'shadow_forgotten',
        shadowRecallPenalty: retention.shadowRecallPenalty,
        shadowConfidencePenalty: retention.shadowConfidencePenalty,
        shadowRenderMode: retention.promptRenderStage === 'distorted' ? 'distorted' : 'blur',
        recommendedRetentionStage: retention.promptRenderStage,
        isForgottenPersisted: input.forgotten === true,
        retention,
    };
}

/**
 * 功能：兼容旧式 effective memoryPercent 输出。
 * @param memoryPercent 原始记忆度。
 * @param projection 遗忘投影。
 * @returns 影子召回后的记忆度。
 */
export function resolveEffectiveMemoryPercentForRecall(
    memoryPercent: unknown,
    projection: MemoryForgettingProjection,
): number {
    if (projection.retention?.rawMemoryPercent === clampPercent(memoryPercent)) {
        return projection.retention.effectiveMemoryPercent;
    }
    return projectMemoryRetentionCore({
        memoryPercent,
        forgotten: projection.isForgottenPersisted,
    }).effectiveMemoryPercent;
}

/**
 * 功能：兼容旧式影子召回判定导出。
 * @param query 查询文本。
 * @param candidate 候选信息。
 * @returns 是否允许影子召回。
 */
export function shouldTriggerShadowRecall(
    query: unknown,
    candidate: Pick<MemoryForgettingSource, 'title' | 'summary' | 'compareKey' | 'aliasTexts' | 'actorKeys' | 'relationKeys' | 'participantActorKeys' | 'locationKey' | 'worldKeys' | 'semantic'>,
): boolean {
    return shouldTriggerShadowRecallByInput(query, candidate);
}

function clampPercent(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}
