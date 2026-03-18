import type { MemoryTuningProfile } from '../types';
import { DEFAULT_MEMORY_TUNING_PROFILE } from '../types';
import { clamp01 } from './memory-intelligence';

/**
 * 功能：读取有限数字，非法值时回退到默认值。
 * @param value 待读取的原始值。
 * @param fallback 回退值。
 * @returns 归一化后的数字。
 */
function readFiniteNumber(value: unknown, fallback: number): number {
    const nextValue: number = Number(value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
}

/**
 * 功能：把记忆调参画像裁剪到允许范围。
 * @param profile 本次传入的调参补丁。
 * @param previous 之前已经存在的调参画像。
 * @param updatedAtOverride 可选的更新时间覆盖值。
 * @returns 归一化后的调参画像。
 */
export function normalizeMemoryTuningProfile(
    profile: Partial<MemoryTuningProfile> | null | undefined,
    previous: Partial<MemoryTuningProfile> | null | undefined = null,
    updatedAtOverride?: number,
): MemoryTuningProfile {
    const mergedProfile: Partial<MemoryTuningProfile> = {
        ...DEFAULT_MEMORY_TUNING_PROFILE,
        ...(previous ?? {}),
        ...(profile ?? {}),
    };
    const updatedAt: number = updatedAtOverride ?? Math.max(0, readFiniteNumber(mergedProfile.updatedAt, 0));
    return {
        ...DEFAULT_MEMORY_TUNING_PROFILE,
        ...mergedProfile,
        candidateAcceptThresholdBias: Math.max(-0.2, Math.min(0.2, readFiniteNumber(mergedProfile.candidateAcceptThresholdBias, 0))),
        recallRelationshipBias: clamp01(readFiniteNumber(mergedProfile.recallRelationshipBias, DEFAULT_MEMORY_TUNING_PROFILE.recallRelationshipBias)),
        recallEmotionBias: clamp01(readFiniteNumber(mergedProfile.recallEmotionBias, DEFAULT_MEMORY_TUNING_PROFILE.recallEmotionBias)),
        recallRecencyBias: clamp01(readFiniteNumber(mergedProfile.recallRecencyBias, DEFAULT_MEMORY_TUNING_PROFILE.recallRecencyBias)),
        recallContinuityBias: clamp01(readFiniteNumber(mergedProfile.recallContinuityBias, DEFAULT_MEMORY_TUNING_PROFILE.recallContinuityBias)),
        distortionProtectionBias: clamp01(readFiniteNumber(mergedProfile.distortionProtectionBias, DEFAULT_MEMORY_TUNING_PROFILE.distortionProtectionBias)),
        recallRetentionLimit: Math.max(40, Math.min(320, Math.floor(readFiniteNumber(mergedProfile.recallRetentionLimit, DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit)))),
        updatedAt,
    };
}
