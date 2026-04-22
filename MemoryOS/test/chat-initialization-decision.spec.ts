import { describe, expect, it } from 'vitest';
import { resolveMemoryChatInitializationDecision } from '../src/runtime/chat-initialization-decision';

const BASE_INPUT = {
    settingsEnabled: true,
    coldStartEnabled: true,
    takeoverEnabled: true,
    coldStartCompleted: false,
    currentFloorCount: 0,
};

describe('聊天打开初始化决策', (): void => {
    it('冷启动未完成且楼层数不超过 2 时显示冷启动', (): void => {
        for (const currentFloorCount of [0, 1, 2]) {
            const decision = resolveMemoryChatInitializationDecision({
                ...BASE_INPUT,
                currentFloorCount,
            });

            expect(decision.action).toBe('cold_start');
            expect(decision.reason).toBe('cold_start_needed');
        }
    });

    it('楼层数大于 2 时优先显示旧聊天接管', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            currentFloorCount: 3,
        });

        expect(decision.action).toBe('takeover');
        expect(decision.reason).toBe('legacy_chat_detected');
    });

    it('存在可恢复接管任务时显示旧聊天接管', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            currentFloorCount: 1,
            takeoverPlanStatus: 'paused',
        });

        expect(decision.action).toBe('takeover');
        expect(decision.reason).toBe('recoverable_takeover_found');
    });

    it('冷启动已完成时不显示冷启动或旧聊天接管', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            coldStartCompleted: true,
            currentFloorCount: 12,
        });

        expect(decision.action).toBe('none');
        expect(decision.reason).toBe('cold_start_completed');
    });

    it('旧聊天接管已完成时不再回退显示冷启动', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            currentFloorCount: 12,
            takeoverPlanStatus: 'completed',
        });

        expect(decision.action).toBe('none');
        expect(decision.reason).toBe('takeover_completed');
    });

    it('旧聊天接管关闭时不会用冷启动替代处理旧聊天', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            takeoverEnabled: false,
            currentFloorCount: 3,
        });

        expect(decision.action).toBe('none');
        expect(decision.reason).toBe('takeover_disabled');
    });

    it('本聊天已设置不再提示冷启动时不显示冷启动', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            coldStartSuppressed: true,
            currentFloorCount: 2,
        });

        expect(decision.action).toBe('none');
        expect(decision.reason).toBe('cold_start_suppressed');
    });

    it('本聊天冷启动不再提示不影响旧聊天接管优先级', (): void => {
        const decision = resolveMemoryChatInitializationDecision({
            ...BASE_INPUT,
            coldStartSuppressed: true,
            currentFloorCount: 3,
        });

        expect(decision.action).toBe('takeover');
        expect(decision.reason).toBe('legacy_chat_detected');
    });
});
