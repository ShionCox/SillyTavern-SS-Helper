import { describe, expect, it, vi } from 'vitest';
import type { MemoryLLMApi } from '../src/memory-summary';
import { resolveTakeoverConflictBuckets } from '../src/memory-takeover/takeover-conflict-resolver';
import { resolveTakeoverConflictBucketsByRules } from '../src/memory-takeover/takeover-conflict-rule-resolver';
import { DEFAULT_PIPELINE_BUDGET_POLICY } from '../src/pipeline/pipeline-budget';
import type { PipelineConflictBucketRecord } from '../src/pipeline/pipeline-types';

describe('takeover conflict resolver', () => {
    it('uses rules to merge same-participant relationship progression', () => {
        const bucket: PipelineConflictBucketRecord = {
            jobId: 'takeover:test',
            bucketId: 'relationship/state_divergence/user_actor_heying',
            domain: 'relationship',
            conflictType: 'state_divergence',
            resolutionStatus: 'pending',
            records: [
                {
                    sourceActorKey: 'user',
                    targetActorKey: 'actor_heying',
                    participants: ['user', 'actor_heying'],
                    relationTag: '暧昧',
                    state: '两人重新建立联系。',
                    summary: '旧情复燃的前奏。',
                    trust: 0.4,
                    affection: 0.8,
                    tension: 0.7,
                    compareKey: 'ck:v2:relationship:user:actor_heying:暧昧',
                },
                {
                    sourceActorKey: 'user',
                    targetActorKey: 'actor_heying',
                    participants: ['user', 'actor_heying'],
                    relationTag: '暧昧',
                    state: '两人已经在梦境中确认彼此依恋。',
                    summary: '关系推进到更深层亲密。',
                    trust: 0.8,
                    affection: 0.95,
                    tension: 0.5,
                    compareKey: 'ck:v2:relationship:user:actor_heying:暧昧',
                },
            ],
        };

        const result = resolveTakeoverConflictBucketsByRules([bucket], DEFAULT_PIPELINE_BUDGET_POLICY);

        expect(result.resolvedPatches).toHaveLength(1);
        expect(result.pendingBuckets).toHaveLength(0);
        expect(result.resolvedPatches[0].resolutions[0].resolverSource).toBe('rule_resolver');
        expect(result.resolvedPatches[0].resolutions[0].selectionReason).toBe('prefer_latest_deeper_state');
    });

    it('batches same-domain buckets into one llm request', async () => {
        const buckets: PipelineConflictBucketRecord[] = [
            {
                jobId: 'takeover:test',
                bucketId: 'world/value_divergence/a',
                domain: 'world',
                conflictType: 'value_divergence',
                resolutionStatus: 'pending',
                records: [
                    { key: '夜禁', value: '持续执行中', compareKey: 'ck:v2:world_global_state:夜禁:global' },
                    { key: '夜禁', value: '范围扩大', compareKey: 'ck:v2:world_global_state:夜禁:global' },
                    { key: '夜禁', value: '范围再次扩大', compareKey: 'ck:v2:world_global_state:夜禁:global' },
                    { key: '夜禁', value: '范围覆盖北城门', compareKey: 'ck:v2:world_global_state:夜禁:global' },
                    { key: '夜禁', value: '范围覆盖全城', compareKey: 'ck:v2:world_global_state:夜禁:global' },
                ],
            },
            {
                jobId: 'takeover:test',
                bucketId: 'world/value_divergence/b',
                domain: 'world',
                conflictType: 'value_divergence',
                resolutionStatus: 'pending',
                records: [
                    { key: '粮价', value: '开始上涨', compareKey: 'ck:v2:world_global_state:粮价:global' },
                    { key: '粮价', value: '继续上涨', compareKey: 'ck:v2:world_global_state:粮价:global' },
                    { key: '粮价', value: '市场持续紧张', compareKey: 'ck:v2:world_global_state:粮价:global' },
                    { key: '粮价', value: '波动加剧', compareKey: 'ck:v2:world_global_state:粮价:global' },
                    { key: '粮价', value: '已引发抢购', compareKey: 'ck:v2:world_global_state:粮价:global' },
                ],
            },
        ];

        const runTask = vi.fn(async (_args: unknown): Promise<{
            ok: true;
            data: {
                patches: Array<{
                    bucketId: string;
                    domain: string;
                    resolutions: Array<{
                        action: string;
                        primaryKey: string;
                        secondaryKeys: string[];
                        fieldOverrides: Record<string, unknown>;
                        reasonCodes: string[];
                    }>;
                }>;
            };
        }> => {
            return {
                ok: true as const,
                data: {
                    patches: [
                        {
                            bucketId: 'world/value_divergence/a',
                            domain: 'world',
                            resolutions: [
                                {
                                    action: 'merge',
                                    primaryKey: 'ck:v2:world_global_state:夜禁:global',
                                    secondaryKeys: [],
                                    fieldOverrides: {},
                                    reasonCodes: ['llm_conflict_merge'],
                                },
                            ],
                        },
                        {
                            bucketId: 'world/value_divergence/b',
                            domain: 'world',
                            resolutions: [
                                {
                                    action: 'merge',
                                    primaryKey: 'ck:v2:world_global_state:粮价:global',
                                    secondaryKeys: [],
                                    fieldOverrides: {},
                                    reasonCodes: ['llm_conflict_merge'],
                                },
                            ],
                        },
                    ],
                },
            };
        });

        const llm: MemoryLLMApi = {
            registerConsumer: (): void => undefined,
            runTask,
        };

        const result = await resolveTakeoverConflictBuckets({
            llm,
            pluginId: 'memoryos',
            buckets,
            budget: DEFAULT_PIPELINE_BUDGET_POLICY,
            useConflictResolver: true,
        });

        expect(runTask).toHaveBeenCalledTimes(1);
        expect(result.batchedRequestCount).toBe(1);
        expect(result.llmResolvedCount).toBe(2);
        expect(result.patches).toHaveLength(2);
        expect(result.patches.every((patch) => patch.resolutions[0].resolverSource === 'llm_batch_resolver')).toBe(true);

        const runArg = runTask.mock.calls[0]?.[0] as {
            schema?: { required?: string[]; properties?: Record<string, unknown> };
            input?: { messages?: Array<{ content: string }> };
        };
        const promptText = runArg.input?.messages?.map((item) => item.content).join('\n') ?? '';
        expect(runArg.schema?.required).toEqual(['patches']);
        expect(runArg.schema?.properties).not.toHaveProperty('domain');
        expect(runArg.schema?.properties).not.toHaveProperty('conflictType');
        expect(runArg.schema?.properties).not.toHaveProperty('buckets');
        expect(promptText).toContain('根对象只允许包含 patches 字段');
        expect(promptText).toContain('不要回显 domain、conflictType、buckets');
    });
});
