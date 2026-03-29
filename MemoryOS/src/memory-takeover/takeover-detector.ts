import type { MemoryTakeoverDetectionResult, MemoryTakeoverPlan } from '../types';

/**
 * 功能：判断当前聊天是否需要旧聊天接管。
 * @param input 检测输入。
 * @returns 检测结果。
 */
export function detectTakeoverNeeded(input: {
    currentFloorCount: number;
    threshold: number;
    existingPlan: MemoryTakeoverPlan | null;
}): MemoryTakeoverDetectionResult {
    const currentFloorCount: number = Math.max(0, Math.trunc(Number(input.currentFloorCount) || 0));
    const threshold: number = Math.max(1, Math.trunc(Number(input.threshold) || 1));
    const existingPlan: MemoryTakeoverPlan | null = input.existingPlan ?? null;

    if (existingPlan?.status === 'completed') {
        return {
            needed: false,
            reason: 'already_completed',
            currentFloorCount,
            threshold,
            hasCompletedTakeover: true,
        };
    }
    if (existingPlan && (existingPlan.status === 'running' || existingPlan.status === 'paused' || existingPlan.status === 'failed')) {
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
