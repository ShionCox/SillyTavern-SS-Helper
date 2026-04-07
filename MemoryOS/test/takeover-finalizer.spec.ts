import { describe, expect, it } from 'vitest';

import { finalizeTakeoverConsolidation } from '../src/memory-takeover/takeover-finalizer';
import type { MemoryTakeoverBatchResult } from '../src/types';
import type { PipelineDiagnostics, PipelineDomainLedgerRecord } from '../src/pipeline/pipeline-types';

/**
 * 功能：构造最小可用的批次结果。
 * @param overrides 覆盖字段。
 * @returns 批次结果。
 */
function buildBatchResult(overrides: Partial<MemoryTakeoverBatchResult> = {}): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:finalizer',
        batchId: 'takeover:finalizer:0001',
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
        validated: true,
        isolated: false,
        ...overrides,
    };
}

/**
 * 功能：构造最小可用的流水线诊断。
 * @returns 诊断对象。
 */
function buildDiagnostics(): PipelineDiagnostics {
    return {
        jobId: 'takeover:finalizer',
        jobType: 'takeover',
        usedLLM: false,
        batchCount: 1,
        sectionCount: 1,
        conflictBucketCount: 0,
        resolvedConflictCount: 0,
        unresolvedConflictCount: 0,
        ruleResolvedConflictCount: 0,
        llmResolvedConflictCount: 0,
        batchedRequestCount: 0,
        avgBucketsPerRequest: 0,
        skippedByRuleCount: 0,
        fallbackUsed: false,
        applyCount: 0,
        reasonCode: 'ok',
    };
}

/**
 * 功能：构造账本记录。
 * @param domain 领域类型。
 * @param ledgerKey 账本键。
 * @param canonicalRecord 规范记录。
 * @returns 账本记录。
 */
function buildLedgerRecord<TCanonical>(
    domain: PipelineDomainLedgerRecord<TCanonical>['domain'],
    ledgerKey: string,
    canonicalRecord: TCanonical,
): PipelineDomainLedgerRecord<TCanonical> {
    return {
        jobId: 'takeover:finalizer',
        domain,
        ledgerKey,
        canonicalRecord,
        sourceBatchIds: [],
        conflictState: 'none',
        updatedAt: 1,
    };
}

describe('finalizeTakeoverConsolidation', (): void => {
    it('会保留非 actor 的 relationTransitions，并输出 worldStateDetails', (): void => {
        const result = finalizeTakeoverConsolidation({
            takeoverId: 'takeover:finalizer',
            activeSnapshot: null,
            batchResults: [
                buildBatchResult({
                    relationTransitions: [{
                        target: 'entity:location:hillside_old_temple',
                        from: '荒废',
                        to: '空置',
                        reason: '何盈死后旧庙空了',
                        relationTag: '陌生人',
                        targetType: 'location',
                        bindings: {
                            actors: ['user'],
                            organizations: [],
                            cities: [],
                            locations: ['entity:location:hillside_old_temple'],
                            nations: [],
                            tasks: [],
                            events: [],
                        },
                        reasonCodes: ['world_state_after_death'],
                    }],
                    worldStateChanges: [{
                        key: '半山腰旧庙',
                        value: '守庙人已亡，只剩遗痕与空屋',
                        entityKey: 'entity:world_state:old_temple_vacant',
                        compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
                        canonicalName: '半山腰旧庙空置',
                        bindings: {
                            actors: [],
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
            ],
            sectionDigests: [{
                jobId: 'takeover:finalizer',
                sectionId: 'takeover:finalizer:section:0001',
                batchIds: ['takeover:finalizer:0001'],
                summary: '测试摘要',
                actors: [],
                entities: [],
                relationships: [],
                tasks: [],
                worldChanges: [],
                unresolvedConflicts: [],
            }],
            actorLedger: [],
            entityLedger: [],
            relationshipLedger: [],
            factLedger: [],
            taskLedger: [],
            worldLedger: [
                buildLedgerRecord('world', 'ck:v2:world_global_state:半山腰旧庙空置:老岫村', {
                    key: '半山腰旧庙',
                    value: '守庙人已亡，只剩遗痕与空屋',
                    entityKey: 'entity:world_state:old_temple_vacant',
                    compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
                    canonicalName: '半山腰旧庙空置',
                    bindings: {
                        actors: [],
                        organizations: [],
                        cities: [],
                        locations: ['entity:location:hillside_old_temple'],
                        nations: [],
                        tasks: [],
                        events: [],
                    },
                    reasonCodes: ['world_state_after_death'],
                }),
            ],
            conflictPatches: [],
            diagnostics: buildDiagnostics(),
        });

        expect(result.relationState).toEqual(expect.arrayContaining([
            expect.objectContaining({
                target: 'entity:location:hillside_old_temple',
                targetType: 'location',
                state: '空置',
            }),
        ]));
        expect(result.worldStateDetails).toEqual([
            expect.objectContaining({
                entityKey: 'entity:world_state:old_temple_vacant',
                compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
            }),
        ]);
        expect(result.worldState['半山腰旧庙']).toBe('守庙人已亡，只剩遗痕与空屋');
    });

    it('会使用事实账本输出长期事实，并统计未解决事实冲突', (): void => {
        const result = finalizeTakeoverConsolidation({
            takeoverId: 'takeover:finalizer',
            activeSnapshot: null,
            batchResults: [buildBatchResult()],
            sectionDigests: [],
            actorLedger: [],
            entityLedger: [],
            relationshipLedger: [],
            factLedger: [
                {
                    ...buildLedgerRecord('fact', 'ck:v2:world:何盈_旧庙独居九年', {
                        type: 'world',
                        subject: '何盈',
                        predicate: '曾为',
                        value: '老岫村半山旧庙的山神新娘，并在那里独居九年',
                        confidence: 0.93,
                        compareKey: 'ck:v2:world:何盈_旧庙独居九年',
                        canonicalName: '何盈的旧庙岁月',
                    }),
                    conflictState: 'unresolved',
                },
            ],
            taskLedger: [],
            worldLedger: [],
            conflictPatches: [],
            diagnostics: buildDiagnostics(),
        });

        expect(result.longTermFacts).toEqual([
            expect.objectContaining({
                compareKey: 'ck:v2:world:何盈_旧庙独居九年',
                canonicalName: '何盈的旧庙岁月',
            }),
        ]);
        expect(result.conflictStats.unresolvedFacts).toBe(1);
    });
});
