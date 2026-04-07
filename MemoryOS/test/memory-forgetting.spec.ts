import { describe, expect, it } from 'vitest';
import { projectMemoryForgettingState, shouldTriggerShadowRecall } from '../src/core/memory-forgetting';

describe('memory forgetting projection', () => {
    it('会把未遗忘记录映射为活跃记忆', () => {
        expect(projectMemoryForgettingState({
            forgotten: false,
            memoryPercent: 68,
            title: '林间疗伤',
        })).toMatchObject({
            forgettingTier: 'active',
            canParticipateInNormalRecall: true,
            recommendedRetentionStage: 'blur',
        });
    });

    it('会把仍有语义锚点的旧 forgotten 记录映射为影子遗忘', () => {
        expect(projectMemoryForgettingState({
            forgotten: true,
            memoryPercent: 0,
            title: '森林中的救援',
            summary: '塞拉菲娜把{{user}}从森林深处救了出来。',
        })).toMatchObject({
            forgettingTier: 'shadow_forgotten',
            canParticipateInShadowRecall: true,
            recommendedRetentionStage: 'distorted',
        });
    });

    it('会把彻底失去锚点的记录映射为硬遗忘', () => {
        expect(projectMemoryForgettingState({
            forgotten: true,
            memoryPercent: 0,
        })).toMatchObject({
            forgettingTier: 'hard_forgotten',
            canParticipateInShadowRecall: false,
        });
    });

    it('只会在强相关查询下触发影子召回', () => {
        const candidate = {
            title: '林间疗伤',
            summary: '塞拉菲娜正在治疗{{user}}的伤势。',
            aliasTexts: ['疗伤', '治疗伤势'],
            semantic: {
                semanticKind: 'task_progress' as const,
                visibilityScope: 'actor_visible' as const,
                isCharacterVisible: true,
                currentState: '进行中',
                goalOrObjective: '稳定{{user}}的伤势',
                sourceEntryType: 'task',
            },
        };

        expect(shouldTriggerShadowRecall('她的疗伤进展怎么样了', candidate)).toBe(true);
        expect(shouldTriggerShadowRecall('今天天气如何', candidate)).toBe(false);
    });
});
