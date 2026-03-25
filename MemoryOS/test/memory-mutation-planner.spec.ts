import { beforeEach, describe, expect, it, vi } from 'vitest';

const plannerRecords = vi.hoisted(() => ({
    facts: [] as any[],
    summaries: [] as any[],
    states: [] as any[],
}));

vi.mock('../src/db/db', () => ({
    db: {
        facts: {
            where: () => ({
                between: () => ({
                    reverse: () => ({
                        toArray: async () => plannerRecords.facts,
                    }),
                }),
            }),
        },
        summaries: {
            where: () => ({
                between: () => ({
                    reverse: () => ({
                        toArray: async () => plannerRecords.summaries,
                    }),
                }),
            }),
        },
        world_state: {
            where: () => ({
                between: () => ({
                    toArray: async () => plannerRecords.states,
                }),
            }),
        },
    },
}));

import { buildMemoryMutationPlanSnapshot, planMemoryMutations } from '../src/core/memory-mutation-planner';

describe('memory mutation planner', (): void => {
    beforeEach((): void => {
        plannerRecords.facts = [];
        plannerRecords.summaries = [];
        plannerRecords.states = [];
    });

    it('会把完全相同的事实提议判定为 NOOP', async (): Promise<void> => {
        plannerRecords.facts = [{
            factKey: 'fact-1',
            type: 'trait',
            entity: { kind: 'character', id: 'alice' },
            path: 'profile.trait',
            value: 'brave',
            confidence: 0.9,
        }];

        const plan = await planMemoryMutations({
            chatKey: 'chat-1',
            consumerPluginId: 'tester',
            source: 'mutation_apply',
            facts: [{
                type: 'trait',
                entity: { kind: 'character', id: 'alice' },
                path: 'profile.trait',
                value: 'brave',
            }],
        });

        expect(plan.factMutations).toHaveLength(1);
        expect(plan.factMutations[0].item.action).toBe('NOOP');
        expect(plan.actionCounts.NOOP).toBe(1);
    });

    it('会为同 compare key 的摘要提议生成 MERGE', async (): Promise<void> => {
        plannerRecords.summaries = [{
            summaryId: 'summary-1',
            level: 'scene',
            title: 'Camp',
            content: 'Alice arrived at camp.',
            keywords: ['camp'],
        }];

        const plan = await planMemoryMutations({
            chatKey: 'chat-1',
            consumerPluginId: 'tester',
            source: 'mutation_apply',
            summaries: [{
                level: 'scene',
                title: 'Camp',
                content: 'She met Bob there.',
                keywords: ['bob'],
            }],
        });

        expect(plan.summaryMutations).toHaveLength(1);
        expect(plan.summaryMutations[0].item.action).toBe('MERGE');
        expect(plan.summaryMutations[0].nextContent).toContain('Alice arrived at camp.');
        expect(plan.summaryMutations[0].nextContent).toContain('She met Bob there.');
    });

    it('会把重复状态写入和删除缺失路径都判定为 NOOP，并能生成快照', async (): Promise<void> => {
        plannerRecords.states = [{
            stateKey: 'state-1',
            path: 'scene.weather',
            value: 'rain',
        }];

        const plan = await planMemoryMutations({
            chatKey: 'chat-1',
            consumerPluginId: 'tester',
            source: 'mutation_apply',
            patches: [
                { op: 'replace', path: 'scene.weather', value: 'rain' },
                { op: 'remove', path: 'scene.missing' },
            ],
        });
        const snapshot = buildMemoryMutationPlanSnapshot(plan, 0);

        expect(plan.stateMutations.map((item) => item.item.action)).toEqual(['NOOP', 'NOOP']);
        expect(snapshot.totalItems).toBe(2);
        expect(snapshot.actionCounts.NOOP).toBe(2);
        expect(snapshot.appliedItems).toBe(0);
    });
});
