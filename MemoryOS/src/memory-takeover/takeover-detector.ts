import type { MemoryTakeoverDetectionResult, MemoryTakeoverPlan } from '../types';

export const LEGACY_CHAT_MIN_FLOORS: number = 3;

/**
 * 功能：判断当前聊天是否需要旧聊天接管。
 * @param input 检测输入。
 * @returns 检测结果。
 */
export function detectTakeoverNeeded(input: {
    currentFloorCount: number;
    existingPlan: MemoryTakeoverPlan | null;
}): MemoryTakeoverDetectionResult {
    const currentFloorCount: number = Math.max(0, Math.trunc(Number(input.currentFloorCount) || 0));
    const threshold: number = LEGACY_CHAT_MIN_FLOORS;
    const existingPlan: MemoryTakeoverPlan | null = input.existingPlan ?? null;

    if (existingPlan?.status === 'completed' || existingPlan?.status === 'degraded') {
        return {
            needed: false,
            reason: existingPlan.status === 'degraded' ? 'already_degraded' : 'already_completed',
            currentFloorCount,
            threshold,
            hasCompletedTakeover: true,
        };
    }
    if (existingPlan && (
        existingPlan.status === 'running'
        || existingPlan.status === 'paused'
        || existingPlan.status === 'blocked_by_batch'
        || existingPlan.status === 'failed'
    )) {
        return {
            needed: true,
            reason: 'recoverable_takeover_found',
            currentFloorCount,
            threshold,
            hasCompletedTakeover: false,
            recoverableTakeoverId: existingPlan.takeoverId,
        };
    }
    if (currentFloorCount < threshold) {
        return {
            needed: false,
            reason: 'below_floor_threshold',
            currentFloorCount,
            threshold,
            hasCompletedTakeover: false,
        };
    }
    return {
        needed: true,
        reason: 'legacy_chat_detected',
        currentFloorCount,
        threshold,
        hasCompletedTakeover: false,
    };
}
