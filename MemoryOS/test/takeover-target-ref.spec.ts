import { describe, expect, it } from 'vitest';
import {
    buildTakeoverKnownContext,
    normalizeTakeoverBatchResult,
} from '../src/memory-takeover/takeover-batch-runner';
import type { MemoryTakeoverBatch, MemoryTakeoverBatchResult } from '../src/types';

function buildBatch(): MemoryTakeoverBatch {
    return {
        takeoverId: 'takeover-1',
        batchId: 'takeover-1:history:0001',
        category: 'history',
        batchIndex: 1,
        range: {
            startFloor: 1,
            endFloor: 10,
        },
        status: 'running',
        createdAt: 1,
        updatedAt: 1,
    };
}

function buildFallback(batch: MemoryTakeoverBatch): MemoryTakeoverBatchResult {
    return {
        takeoverId: batch.takeoverId,
        batchId: batch.batchId,
        summary: '',
        actorCards: [],
        relationships: [],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [],
        sourceRange: batch.range,
        generatedAt: 1,
    };
}

describe('takeover target refs', () => {
    it('会在 knownContext 中生成 knownEntityManifest，并用 targetRef 归并任务 patch', () => {
        const batch = buildBatch();
        const knownContext = buildTakeoverKnownContext([], {
            actors: [],
            organizations: [],
            cities: [],
            nations: [],
            locations: [],
            tasks: [
                {
                    entityKey: 'entity:task:escort_messenger',
                    displayName: '护送密使离开王都',
                },
            ],
            worldStates: [
                {
                    entityKey: 'entity:world_state:royal_capital_curfew',
                    displayName: '王都夜禁',
                },
            ],
        });

        const taskTarget = knownContext.knownEntityManifest.targets.find((item) => item.entityType === 'task');
        const worldTarget = knownContext.knownEntityManifest.targets.find((item) => item.entityType === 'world_global_state');
        expect(taskTarget?.targetRef).toBe('T1');
        expect(worldTarget?.targetRef).toBe('T2');

        const normalized = normalizeTakeoverBatchResult({
            fallback: buildFallback(batch),
            batch,
            range: batch.range,
            knownContext,
            result: {
                ...buildFallback(batch),
                summary: '艾琳确认旧水渠路线，护送任务进入执行。',
                taskTransitions: [
                    {
                        targetRef: taskTarget?.targetRef,
                        task: '护送密使离开王都',
                        from: '筹划中',
                        to: '执行中',
                        patch: {
                            summary: '护送任务改为当晚执行。',
                            status: '执行中',
                            goal: '确保密使从旧水渠安全离城',
                        },
                        reasonCodes: ['target_ref_selected', 'task_progressed'],
                    },
                ],
                worldStateChanges: [
                    {
                        targetRef: worldTarget?.targetRef,
                        key: '王都夜禁',
                        value: '持续执行中',
                        patch: {
                            value: '持续执行中',
                            summary: '王都夜禁仍未解除。',
                        },
                        reasonCodes: ['target_ref_selected', 'world_state_confirmed'],
                    },
                ],
            },
        });

        expect(normalized.taskTransitions[0]?.entityKey).toBe('entity:task:escort_messenger');
        expect(normalized.taskTransitions[0]?.targetRef).toBe('T1');
        expect(normalized.taskTransitions[0]?.patch?.status).toBe('执行中');
        expect(normalized.worldStateChanges[0]?.entityKey).toBe('entity:world_state:royal_capital_curfew');
        expect(normalized.worldStateChanges[0]?.targetRef).toBe('T2');
        expect(normalized.worldStateChanges[0]?.summary).toBe('王都夜禁仍未解除。');
    });

    it('会为新增实体卡用 keySeed 生成 entityKey / compareKey / matchKeys', () => {
        const batch = buildBatch();
        const normalized = normalizeTakeoverBatchResult({
            fallback: buildFallback(batch),
            batch,
            range: batch.range,
            knownContext: buildTakeoverKnownContext([]),
            result: {
                ...buildFallback(batch),
                entityCards: [
                    {
                        entityType: 'organization',
                        keySeed: {
                            kind: 'organization',
                            title: '夜鸦组',
                            qualifier: '王都',
                            participants: ['actor_erin'],
                        },
                        compareKey: '',
                        title: '夜鸦组',
                        aliases: [],
                        summary: '潜伏在王都暗处的情报组织。',
                        fields: {
                            baseCity: '王都',
                            status: 'active',
                        },
                        confidence: 0.88,
                    },
                ],
            },
        });

        expect(normalized.entityCards[0]?.entityKey).toContain('entity:organization:');
        expect(normalized.entityCards[0]?.compareKey).toContain('ck:');
        expect(normalized.entityCards[0]?.matchKeys?.[0]).toContain('mk:organization:');
    });
});
