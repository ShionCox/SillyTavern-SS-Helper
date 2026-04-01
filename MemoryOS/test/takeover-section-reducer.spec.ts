import { describe, expect, it } from 'vitest';

import { reduceTakeoverEntities, reduceTakeoverFacts, reduceTakeoverTasks, reduceTakeoverWorld } from '../src/memory-takeover/takeover-section-reducer';
import type { MemoryTakeoverBatchResult } from '../src/types';

/**
 * 功能：构造实体归约测试用批次。
 * @param overrides 覆盖字段。
 * @returns 批次结果。
 */
function buildBatchResult(overrides: Partial<MemoryTakeoverBatchResult> = {}): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:reducer',
        batchId: 'takeover:reducer:0001',
        summary: '测试',
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
        sourceRange: { startFloor: 1, endFloor: 1 },
        generatedAt: 1,
        ...overrides,
    };
}

describe('reduceTakeoverEntities', (): void => {
    it('会保留实体稳定标识与绑定信息', (): void => {
        const result = reduceTakeoverEntities([
            buildBatchResult({
                batchId: 'takeover:reducer:0001',
                entityCards: [{
                    entityType: 'location',
                    entityKey: 'entity:location:hillside_old_temple',
                    compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
                    title: '半山腰旧庙',
                    aliases: ['旧庙'],
                    summary: '第一批摘要',
                    confidence: 0.7,
                    schemaVersion: 'v2',
                    canonicalName: '半山腰旧庙',
                    matchKeys: ['mk:location:旧庙'],
                    legacyCompareKeys: ['legacy:old_temple'],
                    bindings: {
                        actors: ['actor_heying'],
                        organizations: [],
                        cities: [],
                        locations: ['entity:location:laoxiu_village'],
                        nations: [],
                        tasks: [],
                        events: [],
                    },
                    reasonCodes: ['location_core_setting'],
                    fields: {
                        region: '半山腰',
                    },
                }],
            }),
            buildBatchResult({
                batchId: 'takeover:reducer:0002',
                sourceRange: { startFloor: 2, endFloor: 2 },
                entityCards: [{
                    entityType: 'location',
                    compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
                    title: '半山腰旧庙',
                    aliases: ['半山旧庙'],
                    summary: '第二批更完整的摘要',
                    confidence: 0.95,
                    schemaVersion: 'v2',
                    canonicalName: '老岫村半山腰旧庙',
                    matchKeys: ['mk:location:半山腰旧庙'],
                    bindings: {
                        actors: ['user'],
                        organizations: [],
                        cities: [],
                        locations: [],
                        nations: [],
                        tasks: [],
                        events: ['entity:event:xujiashu_investigates_temple'],
                    },
                    reasonCodes: ['life_trace_site'],
                    fields: {
                        status: '空置',
                    },
                }],
            }),
        ]);

        expect(result.canonicalRecords).toHaveLength(1);
        expect(result.canonicalRecords[0]).toMatchObject({
            entityKey: 'entity:location:hillside_old_temple',
            compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
            canonicalName: '老岫村半山腰旧庙',
            schemaVersion: 'v2',
        });
        expect(result.canonicalRecords[0]?.matchKeys).toEqual(['mk:location:旧庙', 'mk:location:半山腰旧庙']);
        expect(result.canonicalRecords[0]?.bindings?.actors).toEqual(['actor_heying', 'user']);
        expect(result.canonicalRecords[0]?.bindings?.events).toEqual(['entity:event:xujiashu_investigates_temple']);
        expect(result.canonicalRecords[0]?.reasonCodes).toEqual(['location_core_setting', 'life_trace_site']);
    });
});

describe('reduceTakeoverTasks', (): void => {
    it('按 compareKey 归并任务，而不是按 task 文案归并', (): void => {
        const result = reduceTakeoverTasks([
            buildBatchResult({
                taskTransitions: [{
                    task: '守灵',
                    from: '未开始',
                    to: '进行中',
                    title: '为何盈守灵',
                    compareKey: 'ck:v2:task:为何盈守灵:老岫村',
                    entityKey: 'entity:task:keep_wake_for_heying',
                    schemaVersion: 'v2',
                    canonicalName: '为何盈守灵',
                    matchKeys: ['mk:task:守灵'],
                    legacyCompareKeys: ['legacy:keep_wake'],
                    bindings: {
                        actors: ['user'],
                        organizations: [],
                        cities: [],
                        locations: ['entity:location:laoxiu_village'],
                        nations: [],
                        tasks: [],
                        events: [],
                    },
                    reasonCodes: ['task_assigned_in_story'],
                    summary: '第一条任务',
                    description: '描述一',
                    goal: '目标一',
                }],
            }),
            buildBatchResult({
                batchId: 'takeover:reducer:0002',
                sourceRange: { startFloor: 2, endFloor: 2 },
                taskTransitions: [{
                    task: '守灵',
                    from: '进行中',
                    to: '已完成',
                    title: '送何盈最后一程',
                    compareKey: 'ck:v2:task:送何盈最后一程:老岫村',
                    entityKey: 'entity:task:sendoff_heying',
                    summary: '第二条任务',
                    description: '描述二',
                    goal: '目标二',
                }],
            }),
        ]);

        expect(result.canonicalRecords).toHaveLength(2);
        expect(result.canonicalRecords.map((item) => item.compareKey)).toEqual([
            'ck:v2:task:为何盈守灵:老岫村',
            'ck:v2:task:送何盈最后一程:老岫村',
        ]);
    });
});

describe('reduceTakeoverFacts', (): void => {
    it('按 compareKey 或事实主键归并长期事实，并标记值冲突', (): void => {
        const result = reduceTakeoverFacts([
            buildBatchResult({
                stableFacts: [{
                    type: 'world',
                    subject: '何盈',
                    predicate: '曾为',
                    value: '山神新娘',
                    confidence: 0.7,
                    compareKey: 'ck:v2:world:何盈_旧庙岁月',
                    canonicalName: '何盈的旧庙岁月',
                }],
            }),
            buildBatchResult({
                batchId: 'takeover:reducer:0002',
                sourceRange: { startFloor: 2, endFloor: 2 },
                stableFacts: [{
                    type: 'world',
                    subject: '何盈',
                    predicate: '曾为',
                    value: '老岫村半山旧庙的山神新娘',
                    confidence: 0.95,
                    compareKey: 'ck:v2:world:何盈_旧庙岁月',
                    canonicalName: '何盈的旧庙岁月',
                    reasonCodes: ['long_term_setting'],
                }],
            }),
        ]);

        expect(result.canonicalRecords).toHaveLength(1);
        expect(result.canonicalRecords[0]).toMatchObject({
            compareKey: 'ck:v2:world:何盈_旧庙岁月',
            canonicalName: '何盈的旧庙岁月',
            value: '老岫村半山旧庙的山神新娘',
        });
        expect(result.unresolvedConflicts).toHaveLength(1);
        expect(result.unresolvedConflicts[0]?.domain).toBe('fact');
    });
});

describe('reduceTakeoverWorld', (): void => {
    it('按 compareKey 归并世界状态，并保留结构字段', (): void => {
        const result = reduceTakeoverWorld([
            buildBatchResult({
                worldStateChanges: [{
                    key: '半山腰旧庙',
                    value: '守庙人已亡',
                    entityKey: 'entity:world_state:old_temple_vacant',
                    compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
                    summary: '第一条状态',
                    schemaVersion: 'v2',
                    canonicalName: '半山腰旧庙空置',
                    matchKeys: ['mk:world:旧庙空置'],
                    legacyCompareKeys: ['legacy:old_temple_vacant'],
                    bindings: {
                        actors: ['actor_heying'],
                        organizations: [],
                        cities: [],
                        locations: ['entity:location:hillside_old_temple'],
                        nations: [],
                        tasks: [],
                        events: [],
                    },
                    reasonCodes: ['world_state_after_death'],
                }],
            }),
            buildBatchResult({
                batchId: 'takeover:reducer:0002',
                sourceRange: { startFloor: 2, endFloor: 2 },
                worldStateChanges: [{
                    key: '半山腰旧庙',
                    value: '只剩遗痕与空屋',
                    entityKey: 'entity:world_state:old_temple_vacant',
                    compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
                    summary: '第二条状态',
                    canonicalName: '老岫村半山腰旧庙空置',
                }],
            }),
        ]);

        expect(result.canonicalRecords).toHaveLength(1);
        expect(result.canonicalRecords[0]).toMatchObject({
            entityKey: 'entity:world_state:old_temple_vacant',
            compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
            canonicalName: '老岫村半山腰旧庙空置',
        });
        expect(result.canonicalRecords[0]?.bindings?.locations).toEqual(['entity:location:hillside_old_temple']);
    });
});
