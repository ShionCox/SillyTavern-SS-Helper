import { describe, expect, it } from 'vitest';
import { buildTakeoverKnownContext } from '../src/memory-takeover/takeover-batch-runner';
import type { MemoryTakeoverBatchResult } from '../src/types';

/**
 * 功能：创建测试用批次结果。
 * @returns 批次结果。
 */
function createBatchResult(): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:test',
        batchId: 'takeover:test:history:0001',
        summary: '测试摘要',
        actorCards: [
            {
                actorKey: 'lina',
                displayName: '莉娜',
                aliases: ['银发精灵'],
                identityFacts: ['与主角同行的精灵'],
                originFacts: [],
                traits: ['谨慎'],
            },
        ],
        stableFacts: [
            {
                type: 'identity',
                subject: '莉娜',
                predicate: '身份是',
                value: '银发精灵',
                confidence: 0.9,
            },
        ],
        relationTransitions: [
            {
                target: '莉娜',
                from: '陌生',
                to: '信任提升',
                reason: '共同行动后关系缓和',
            },
        ],
        taskTransitions: [
            {
                task: '寻找食物',
                from: '未开始',
                to: '进行中',
            },
        ],
        worldStateChanges: [
            {
                key: '森林边界市场',
                value: '已经抵达',
            },
        ],
        openThreads: [],
        chapterTags: ['测试'],
        sourceRange: {
            startFloor: 1,
            endFloor: 20,
        },
        generatedAt: Date.now(),
    };
}

describe('旧聊天批次已知上下文', (): void => {
    it('应从前面批次提取角色、关系、任务和世界状态提示', (): void => {
        const context = buildTakeoverKnownContext([createBatchResult()], [
            {
                actorKey: 'char_main',
                displayName: '主角色',
            },
        ]);

        expect(context.actorHints).toContain('莉娜');
        expect(context.actorHints).toContain('主角色');
        expect(context.existingActorCards).toContainEqual({
            actorKey: 'char_main',
            displayName: '主角色',
        });
        expect(context.stableFacts).toContain('莉娜身份是银发精灵');
        expect(context.relationState).toContain('莉娜：信任提升');
        expect(context.taskState).toContain('寻找食物：进行中');
        expect(context.worldState).toContain('森林边界市场：已经抵达');
    });
});
