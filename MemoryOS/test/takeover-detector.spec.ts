import { describe, expect, it } from 'vitest';
import { detectTakeoverNeeded } from '../src/memory-takeover/takeover-detector';
import type { MemoryTakeoverPlan } from '../src/types';

/**
 * 功能：创建测试用接管计划。
 * @param status 接管状态。
 * @returns 接管计划。
 */
function createPlan(status: MemoryTakeoverPlan['status']): MemoryTakeoverPlan {
    return {
        chatKey: 'chat:test',
        chatId: 'chat:test',
        takeoverId: 'takeover:test',
        status,
        mode: 'full',
        range: { startFloor: 1, endFloor: 100 },
        totalFloors: 100,
        recentFloors: 60,
        batchSize: 30,
        useActiveSnapshot: true,
        activeSnapshotFloors: 60,
        prioritizeRecent: true,
        autoContinue: true,
        autoConsolidate: true,
        pauseOnError: true,
        activeWindow: { startFloor: 41, endFloor: 100 },
        currentBatchIndex: 0,
        totalBatches: 3,
        completedBatchIds: [],
        failedBatchIds: [],
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('旧聊天接管识别', (): void => {
    it('楼层不足阈值时不应触发', (): void => {
        const result = detectTakeoverNeeded({
            currentFloorCount: 20,
            threshold: 50,
            existingPlan: null,
        });

        expect(result.needed).toBe(false);
        expect(result.reason).toBe('below_floor_threshold');
    });

    it('已有完成任务时不应重复触发', (): void => {
        const result = detectTakeoverNeeded({
            currentFloorCount: 200,
            threshold: 50,
            existingPlan: createPlan('completed'),
        });

        expect(result.needed).toBe(false);
        expect(result.hasCompletedTakeover).toBe(true);
    });

    it('已有可恢复任务时应返回恢复信息', (): void => {
        const result = detectTakeoverNeeded({
            currentFloorCount: 200,
            threshold: 50,
            existingPlan: createPlan('paused'),
        });

        expect(result.needed).toBe(true);
        expect(result.reason).toBe('recoverable_takeover_found');
        expect(result.recoverableTakeoverId).toBe('takeover:test');
    });

    it('满足阈值且无历史任务时应识别为旧聊天', (): void => {
        const result = detectTakeoverNeeded({
            currentFloorCount: 120,
            threshold: 50,
            existingPlan: null,
        });

        expect(result.needed).toBe(true);
        expect(result.reason).toBe('legacy_chat_detected');
    });
});
