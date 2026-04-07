import { describe, expect, it } from 'vitest';

import { admitTakeoverBatchResult } from '../src/memory-takeover/takeover-batch-admission';
import type { MemoryTakeoverBatchResult } from '../src/types';

function createBindings(actors: string[] = []) {
    return {
        actors,
        organizations: [],
        cities: [],
        locations: [],
        nations: [],
        tasks: [],
        events: [],
    };
}

function createBatchResult(): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:test',
        batchId: 'takeover:test:history:0001',
        summary: '测试批次',
        actorCards: [{
            actorKey: 'actor_alice',
            displayName: 'Alice',
            aliases: [],
            identityFacts: [],
            originFacts: [],
            traits: [],
        }],
        relationships: [{
            sourceActorKey: 'actor_alice',
            targetActorKey: 'user',
            participants: ['actor_alice', 'user'],
            relationTag: '朋友',
            state: '熟悉',
            summary: '两人已经认识。',
            trust: 0.9,
            affection: 0.8,
            tension: 0.1,
        }],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [{
            target: 'actor_alice',
            from: '陌生',
            to: '熟悉',
            reason: '最近有互动',
            relationTag: '朋友',
            targetType: 'actor',
            bindings: createBindings(['actor_alice']),
            reasonCodes: [],
        }],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: ['历史补建'],
        sourceRange: {
            startFloor: 1,
            endFloor: 10,
        },
        generatedAt: 1,
    };
}

describe('takeover batch admission', (): void => {
    it('允许合法批次进入 reducer', (): void => {
        const outcome = admitTakeoverBatchResult(createBatchResult());

        expect(outcome.accepted).toBe(true);
        expect(outcome.result.validated).toBe(true);
        expect(outcome.result.repairedOnce).toBe(false);
        expect(outcome.result.isolated).toBe(false);
        expect(outcome.validationErrors).toEqual([]);
    });

    it('对可修复的 participants 与 bindings 执行单次修复后放行', (): void => {
        const batch = createBatchResult();
        batch.relationships[0]!.participants = [' Actor_Alice ', 'char_bad', 'user'];
        batch.relationTransitions[0]!.bindings = createBindings([' Actor_Alice ', 'char_bad']);

        const outcome = admitTakeoverBatchResult(batch);

        expect(outcome.accepted).toBe(true);
        expect(outcome.result.repairedOnce).toBe(true);
        expect(outcome.result.relationships[0]?.participants).toEqual(['actor_alice', 'user']);
        expect(outcome.result.relationTransitions[0]?.bindings?.actors).toEqual(['actor_alice']);
        expect(outcome.result.repairActions.some((item: string): boolean => item.includes('drop_invalid_actor_key'))).toBe(true);
    });

    it('对不可修复的非法 actorKey 执行隔离', (): void => {
        const batch = createBatchResult();
        batch.actorCards[0]!.actorKey = 'char_alice';

        const outcome = admitTakeoverBatchResult(batch);

        expect(outcome.accepted).toBe(false);
        expect(outcome.result.isolated).toBe(true);
        expect(outcome.result.validated).toBe(false);
        expect(outcome.validationErrors[0]).toContain('actorCards[0].actorKey');
    });
});
