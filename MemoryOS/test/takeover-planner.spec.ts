import { describe, expect, it } from 'vitest';
import { buildTakeoverBatches, buildTakeoverPlan } from '../src/memory-takeover/takeover-planner';

const DEFAULTS = {
    detectMinFloors: 50,
    recentFloors: 60,
    batchSize: 30,
    prioritizeRecent: true,
    autoContinue: true,
    autoConsolidate: true,
    pauseOnError: true,
};

describe('旧聊天接管计划生成', (): void => {
    it('应正确生成 full 模式计划', (): void => {
        const plan = buildTakeoverPlan({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            takeoverId: 'takeover:test',
            totalFloors: 120,
            defaults: DEFAULTS,
        });

        expect(plan.mode).toBe('full');
        expect(plan.range).toEqual({ startFloor: 1, endFloor: 120 });
        expect(plan.activeWindow).toEqual({ startFloor: 61, endFloor: 120 });
        expect(plan.useActiveSnapshot).toBe(true);
        expect(plan.activeSnapshotFloors).toBe(60);
    });

    it('应正确生成 recent 模式计划', (): void => {
        const plan = buildTakeoverPlan({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            takeoverId: 'takeover:test',
            totalFloors: 120,
            defaults: DEFAULTS,
            config: {
                mode: 'recent',
                recentFloors: 20,
                activeSnapshotFloors: 8,
                batchSize: 10,
            },
        });

        expect(plan.mode).toBe('recent');
        expect(plan.range).toEqual({ startFloor: 101, endFloor: 120 });
        expect(plan.activeWindow).toEqual({ startFloor: 113, endFloor: 120 });
        expect(plan.batchSize).toBe(10);
    });

    it('关闭最近快照后应只按历史批次处理自定义区间', (): void => {
        const plan = buildTakeoverPlan({
            chatKey: 'chat:test',
            chatId: 'chat:test',
            takeoverId: 'takeover:test',
            totalFloors: 220,
            defaults: DEFAULTS,
            config: {
                mode: 'custom_range',
                startFloor: 120,
                endFloor: 220,
                recentFloors: 40,
                batchSize: 25,
                useActiveSnapshot: false,
            },
        });

        const batches = buildTakeoverBatches({
            takeoverId: plan.takeoverId,
            range: plan.range,
            activeWindow: plan.activeWindow,
            batchSize: plan.batchSize,
        });

        expect(plan.range).toEqual({ startFloor: 120, endFloor: 220 });
        expect(plan.activeWindow).toBeNull();
        expect(plan.useActiveSnapshot).toBe(false);
        expect(batches.every((batch) => batch.category === 'history')).toBe(true);
    });
});
