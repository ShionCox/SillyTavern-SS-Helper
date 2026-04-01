import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveTakeoverConflictBucketsMock } = vi.hoisted(() => {
    return {
        resolveTakeoverConflictBucketsMock: vi.fn(),
    };
});

vi.mock('../src/settings/store', () => {
    return {
        readMemoryOSSettings: vi.fn(() => ({
            pipelineBudgetEnabled: false,
            pipelineMaxInputCharsPerBatch: 16000,
            pipelineMaxOutputItemsPerBatch: 20,
            pipelineMaxActionsPerMutation: 10,
            pipelineMaxSectionBatchCount: 5,
            pipelineMaxConflictBucketSize: 10,
            pipelineMaxSectionDigestChars: 2000,
            pipelineMaxFinalizerItemsPerDomain: 50,
            summarySecondStageRollingDigestMaxChars: 1200,
            summarySecondStageCandidateSummaryMaxChars: 300,
            takeoverDefaultBatchSize: 10,
            takeoverSectionDigestBatchCount: 5,
            takeoverMaxConflictItemsPerRun: 10,
            summaryMaxActionsPerMutationBatch: 10,
            takeoverUseConflictResolver: true,
        })),
    };
});

vi.mock('../src/memory-takeover/takeover-conflict-resolver', () => {
    return {
        resolveTakeoverConflictBuckets: resolveTakeoverConflictBucketsMock,
    };
});

import { clearPipelineConflictState, listPipelineConflictBucketRecords } from '../src/pipeline/pipeline-conflict-store';
import { clearPipelineLedgerState } from '../src/pipeline/pipeline-ledger-store';
import { runTakeoverConsolidation } from '../src/memory-takeover/takeover-consolidator';
import { clearTakeoverStagingSnapshot, saveTakeoverStagingSnapshot } from '../src/memory-takeover/takeover-staging-store';
import type { MemoryTakeoverBatchResult } from '../src/types';

/**
 * 功能：构造最小可用批次结果。
 * @param overrides 覆盖字段。
 * @returns 批次结果。
 */
function buildBatchResult(overrides: Partial<MemoryTakeoverBatchResult> = {}): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:consolidator',
        batchId: 'takeover:consolidator:0001',
        summary: '测试摘要',
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

describe('runTakeoverConsolidation', (): void => {
    beforeEach(async () => {
        vi.clearAllMocks();
        clearPipelineLedgerState('takeover:consolidator');
        clearPipelineConflictState('takeover:consolidator');
        await clearTakeoverStagingSnapshot('takeover:consolidator');
    });

    it('已有 staging 的 reducer 与补丁时会跳过重新裁决并直接完成整合', async () => {
        const batchResult = buildBatchResult({
            stableFacts: [{
                type: 'world',
                subject: '何盈',
                predicate: '曾为',
                value: '山神新娘',
                confidence: 0.8,
                compareKey: 'ck:v2:world:何盈_旧庙岁月',
                canonicalName: '何盈的旧庙岁月',
            }],
        });

        await saveTakeoverStagingSnapshot('takeover:consolidator', {
            takeoverId: 'takeover:consolidator',
            admittedBatchSignature: 'takeover:consolidator:0001@1-1@1',
            status: 'running',
            activeSnapshot: null,
            batchResults: [batchResult],
            sectionDigests: [{
                jobId: 'takeover:consolidator',
                sectionId: 'takeover:consolidator:section:0001',
                batchIds: ['takeover:consolidator:0001'],
                summary: '测试摘要',
                actors: [],
                entities: [],
                relationships: [],
                tasks: [],
                worldChanges: [],
                unresolvedConflicts: [],
            }],
            reducedLedger: {
                actors: [],
                entities: [],
                relationships: [],
                tasks: [],
                world: [],
                facts: [{
                    type: 'world',
                    subject: '何盈',
                    predicate: '曾为',
                    value: '老岫村半山旧庙的山神新娘，并在那里独居九年',
                    confidence: 0.93,
                    compareKey: 'ck:v2:world:何盈_旧庙岁月',
                    canonicalName: '何盈的旧庙岁月',
                }],
            },
            unresolvedConflicts: [{
                bucketId: 'fact/value_divergence/ck_v2_world_何盈_旧庙岁月',
                domain: 'fact',
                conflictType: 'value_divergence',
                records: [{
                    type: 'world',
                    subject: '何盈',
                    predicate: '曾为',
                    value: '山神新娘',
                    confidence: 0.8,
                    compareKey: 'ck:v2:world:何盈_旧庙岁月',
                }],
            }],
            conflictPatches: [{
                bucketId: 'fact/value_divergence/ck_v2_world_何盈_旧庙岁月',
                domain: 'fact',
                resolutions: [{
                    action: 'merge',
                    primaryKey: 'ck:v2:world:何盈_旧庙岁月',
                    secondaryKeys: [],
                    fieldOverrides: {},
                    selectedPrimaryKey: 'ck:v2:world:何盈_旧庙岁月',
                    selectedSnapshot: {
                        compareKey: 'ck:v2:world:何盈_旧庙岁月',
                    },
                    selectionReason: 'fact_latest_complete',
                    appliedFieldNames: [],
                    resolverSource: 'rule_resolver',
                    reasonCodes: ['rule_same_compare_key_merge'],
                }],
            }],
            finalResult: null,
        });

        const result = await runTakeoverConsolidation({
            llm: null,
            pluginId: 'MemoryOS',
            takeoverId: 'takeover:consolidator',
            activeSnapshot: null,
            batchResults: [batchResult],
        });

        expect(resolveTakeoverConflictBucketsMock).not.toHaveBeenCalled();
        expect(result.longTermFacts).toEqual([
            expect.objectContaining({
                compareKey: 'ck:v2:world:何盈_旧庙岁月',
                canonicalName: '何盈的旧庙岁月',
            }),
        ]);
        expect(listPipelineConflictBucketRecords('takeover:consolidator')).toEqual([
            expect.objectContaining({
                bucketId: 'fact/value_divergence/ck_v2_world_何盈_旧庙岁月',
                resolutionStatus: 'resolved',
            }),
        ]);
    });
});
