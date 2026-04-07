import { describe, expect, it } from 'vitest';
import { applyActorCreationPolicy } from '../src/memory-takeover/actor-creation-policy';
import type { MemoryTakeoverBatchResult, TakeoverSourceSegment } from '../src/types';

/**
 * 功能：创建角色保留策略测试批次。
 * @returns 测试批次结果。
 */
function createPolicyBatchResult(): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:test',
        batchId: 'takeover:test:history:0001',
        summary: '测试摘要',
        actorCards: [{
            actorKey: 'actor_heying',
            displayName: '何盈',
            aliases: [],
            identityFacts: ['老岫村女子'],
            originFacts: [],
            traits: [],
        }],
        candidateActors: [],
        rejectedMentions: [],
        relationships: [{
            sourceActorKey: 'user',
            targetActorKey: 'actor_heying',
            participants: ['user', 'actor_heying'],
            relationTag: '暧昧',
            state: '旧情未断',
            summary: '灵堂重逢后旧伤翻涌',
            trust: 0.6,
            affection: 0.8,
            tension: 0.7,
        }],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [],
        sourceRange: {
            startFloor: 1,
            endFloor: 10,
        },
        generatedAt: Date.now(),
    };
}

describe('actor creation policy', (): void => {
    it('对被正式关系引用的角色卡不因证据分低而降级', (): void => {
        const segments: TakeoverSourceSegment[] = [{
            kind: 'meta_analysis',
            text: '何盈只在分析描述中被提到一次。',
            sourceFloor: 1,
            confidence: 1,
        }];

        const result = applyActorCreationPolicy(createPolicyBatchResult(), segments);

        expect(result.actorCards).toContainEqual(expect.objectContaining({
            actorKey: 'actor_heying',
            displayName: '何盈',
        }));
        expect(result.candidateActors ?? []).not.toContainEqual(expect.objectContaining({
            actorKey: 'actor_heying',
        }));
    });
});
