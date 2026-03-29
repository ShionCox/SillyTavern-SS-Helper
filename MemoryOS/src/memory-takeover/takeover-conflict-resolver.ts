import type { MemoryLLMApi } from '../memory-summary';
import type {
    ConflictResolutionPatch,
    PipelineBudgetPolicy,
    PipelineConflictBucketRecord,
} from '../pipeline/pipeline-types';

/**
 * 功能：批量裁决旧聊天接管冲突桶。
 * @param input 裁决输入。
 * @returns 冲突补丁列表。
 */
export async function resolveTakeoverConflictBuckets(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    buckets: PipelineConflictBucketRecord[];
    budget: PipelineBudgetPolicy;
}): Promise<ConflictResolutionPatch[]> {
    const patches: ConflictResolutionPatch[] = [];
    for (const bucket of input.buckets) {
        const fallback = buildFallbackPatch(bucket);
        if (!input.llm || bucket.records.length <= 1) {
            patches.push(fallback);
            continue;
        }
        try {
            const result = await input.llm.runTask<ConflictResolutionPatch>({
                consumer: input.pluginId,
                taskId: resolveConflictTaskId(bucket.domain),
                taskDescription: `旧聊天接管冲突裁决：${bucket.domain}/${bucket.conflictType}`,
                taskKind: 'generation',
                input: {
                    messages: [
                        {
                            role: 'system',
                            content: [
                                '你现在只处理一个很小的冲突桶。',
                                '不要输出完整总账，只输出 resolution patch。',
                                '优先保守合并；拿不准就保留主记录。',
                                '所有自然语言字段必须使用简体中文。',
                            ].join('\n'),
                        },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                bucketId: bucket.bucketId,
                                domain: bucket.domain,
                                conflictType: bucket.conflictType,
                                records: bucket.records.slice(0, input.budget.maxConflictBucketSize),
                            }, null, 2),
                        },
                    ],
                },
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        bucketId: { type: 'string' },
                        domain: { type: 'string' },
                        resolutions: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    action: { type: 'string', enum: ['merge', 'keep_primary', 'replace', 'invalidate', 'split'] },
                                    primaryKey: { type: 'string' },
                                    secondaryKeys: { type: 'array', items: { type: 'string' } },
                                    fieldOverrides: { type: 'object', additionalProperties: true },
                                    reasonCodes: { type: 'array', items: { type: 'string' } },
                                },
                                required: ['action', 'primaryKey', 'secondaryKeys', 'fieldOverrides', 'reasonCodes'],
                            },
                        },
                    },
                    required: ['bucketId', 'domain', 'resolutions'],
                },
                enqueue: { displayMode: 'compact' },
            });
            patches.push(result.ok && result.data ? normalizePatch(result.data, bucket, fallback) : fallback);
        } catch {
            patches.push(fallback);
        }
    }
    return patches;
}

/**
 * 功能：构建兜底补丁。
 * @param bucket 冲突桶。
 * @returns 兜底补丁。
 */
function buildFallbackPatch(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch {
    const primaryKey = resolveRecordKey(bucket.records[0] as Record<string, unknown>);
    const secondaryKeys = bucket.records
        .slice(1)
        .map((item: unknown): string => resolveRecordKey(item as Record<string, unknown>))
        .filter(Boolean);
    return {
        bucketId: bucket.bucketId,
        domain: bucket.domain,
        resolutions: [
            {
                action: secondaryKeys.length > 0 ? 'merge' : 'keep_primary',
                primaryKey,
                secondaryKeys,
                fieldOverrides: {},
                reasonCodes: ['deterministic_fallback'],
            },
        ],
    };
}

/**
 * 功能：规范化补丁。
 * @param patch 模型补丁。
 * @param bucket 冲突桶。
 * @param fallback 兜底补丁。
 * @returns 规范化后的补丁。
 */
function normalizePatch(
    patch: ConflictResolutionPatch,
    bucket: PipelineConflictBucketRecord,
    fallback: ConflictResolutionPatch,
): ConflictResolutionPatch {
    const resolutions = Array.isArray(patch.resolutions) ? patch.resolutions : [];
    if (resolutions.length <= 0) {
        return fallback;
    }
    return {
        bucketId: String(patch.bucketId ?? bucket.bucketId).trim() || bucket.bucketId,
        domain: String(patch.domain ?? bucket.domain).trim() || bucket.domain,
        resolutions: resolutions.map((item) => ({
            action: item.action,
            primaryKey: String(item.primaryKey ?? fallback.resolutions[0]?.primaryKey ?? '').trim(),
            secondaryKeys: Array.isArray(item.secondaryKeys) ? item.secondaryKeys.map((key: string): string => String(key ?? '').trim()).filter(Boolean) : [],
            fieldOverrides: item.fieldOverrides && typeof item.fieldOverrides === 'object' ? item.fieldOverrides : {},
            reasonCodes: Array.isArray(item.reasonCodes) && item.reasonCodes.length > 0 ? item.reasonCodes : ['llm_resolved'],
        })),
    };
}

/**
 * 功能：解析任务标识。
 * @param domain 冲突领域。
 * @returns 任务标识。
 */
function resolveConflictTaskId(domain: string): string {
    if (domain === 'actor') {
        return 'memory_takeover_actor_conflict_resolve';
    }
    if (domain === 'entity') {
        return 'memory_takeover_entity_conflict_resolve';
    }
    if (domain === 'relationship') {
        return 'memory_takeover_relation_conflict_resolve';
    }
    return 'memory_takeover_world_conflict_resolve';
}

/**
 * 功能：解析记录主键。
 * @param record 记录。
 * @returns 主键文本。
 */
function resolveRecordKey(record: Record<string, unknown>): string {
    return String(
        record.actorKey
        ?? record.compareKey
        ?? record.task
        ?? record.key
        ?? `${String(record.sourceActorKey ?? '').trim()}::${String(record.targetActorKey ?? '').trim()}`,
    ).trim();
}
