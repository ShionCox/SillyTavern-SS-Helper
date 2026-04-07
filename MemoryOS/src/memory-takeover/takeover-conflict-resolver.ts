import type { MemoryLLMApi } from '../memory-summary';
import type {
    ConflictResolutionPatch,
    PipelineBudgetPolicy,
    PipelineConflictBucketRecord,
} from '../pipeline/pipeline-types';
import { runTakeoverStructuredTask } from './takeover-llm';
import { resolveTakeoverConflictBucketsByRules } from './takeover-conflict-rule-resolver';

interface ConflictResolutionBatchDocument {
    patches: ConflictResolutionPatch[];
}

/**
 * 功能：冲突裁决结果。
 */
export interface TakeoverConflictResolveResult {
    patches: ConflictResolutionPatch[];
    ruleResolvedCount: number;
    llmResolvedCount: number;
    batchedRequestCount: number;
    skippedByRuleCount: number;
    fallbackUsed: boolean;
}

/**
 * 功能：批量裁决旧聊天接管冲突，先走规则，再按同类批量送 LLM。
 * @param input 裁决输入
 * @returns 冲突补丁与统计结果
 */
export async function resolveTakeoverConflictBuckets(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    buckets: PipelineConflictBucketRecord[];
    budget: PipelineBudgetPolicy;
    useConflictResolver?: boolean;
}): Promise<TakeoverConflictResolveResult> {
    const ruleResult = resolveTakeoverConflictBucketsByRules(input.buckets, input.budget);
    const patches: ConflictResolutionPatch[] = [...ruleResult.resolvedPatches];
    const pendingBuckets = [...ruleResult.pendingBuckets];
    let llmResolvedCount = 0;
    let batchedRequestCount = 0;
    let fallbackUsed = patches.some((patch: ConflictResolutionPatch): boolean => {
        return patch.resolutions.some((resolution) => resolution.reasonCodes.includes('deterministic_fallback'));
    });

    if (!input.useConflictResolver || !input.llm || pendingBuckets.length <= 0) {
        for (const bucket of pendingBuckets) {
            const fallback = buildFallbackPatch(bucket);
            patches.push(fallback);
            fallbackUsed = true;
        }
        return {
            patches,
            ruleResolvedCount: ruleResult.resolvedPatches.length,
            llmResolvedCount,
            batchedRequestCount,
            skippedByRuleCount: ruleResult.skippedByRuleCount,
            fallbackUsed,
        };
    }

    const groupedBuckets = groupBucketsByResolverKey(pendingBuckets);
    for (const group of groupedBuckets) {
        const chunkSize = Math.max(
            1,
            Math.min(input.budget.maxConflictBatchSize, input.budget.maxConflictResolverBucketsPerRequest),
        );
        for (const bucketChunk of chunkBuckets(group.buckets, chunkSize)) {
            const chunkResult = await resolveBucketChunkByLLM({
                llm: input.llm,
                pluginId: input.pluginId,
                domain: group.domain,
                conflictType: group.conflictType,
                buckets: bucketChunk,
                budget: input.budget,
            });
            batchedRequestCount += 1;
            llmResolvedCount += chunkResult.llmResolvedCount;
            fallbackUsed = fallbackUsed || chunkResult.fallbackUsed;
            patches.push(...chunkResult.patches);
        }
    }

    return {
        patches,
        ruleResolvedCount: ruleResult.resolvedPatches.length,
        llmResolvedCount,
        batchedRequestCount,
        skippedByRuleCount: ruleResult.skippedByRuleCount,
        fallbackUsed,
    };
}

/**
 * 功能：按领域和冲突类型分组。
 * @param buckets 冲突桶列表
 * @returns 分组结果
 */
function groupBucketsByResolverKey(
    buckets: PipelineConflictBucketRecord[],
): Array<{ domain: string; conflictType: string; buckets: PipelineConflictBucketRecord[] }> {
    const groupMap = new Map<string, { domain: string; conflictType: string; buckets: PipelineConflictBucketRecord[] }>();
    for (const bucket of buckets) {
        const domain = String(bucket.domain ?? '').trim();
        const conflictType = String(bucket.conflictType ?? '').trim();
        const groupKey = `${domain}::${conflictType}`;
        const existing = groupMap.get(groupKey);
        if (existing) {
            existing.buckets.push(bucket);
            continue;
        }
        groupMap.set(groupKey, {
            domain,
            conflictType,
            buckets: [bucket],
        });
    }
    return [...groupMap.values()];
}

/**
 * 功能：按指定大小切分桶数组。
 * @param buckets 冲突桶列表
 * @param chunkSize 分块大小
 * @returns 分块后的桶列表
 */
function chunkBuckets(buckets: PipelineConflictBucketRecord[], chunkSize: number): PipelineConflictBucketRecord[][] {
    const result: PipelineConflictBucketRecord[][] = [];
    for (let index = 0; index < buckets.length; index += chunkSize) {
        result.push(buckets.slice(index, index + chunkSize));
    }
    return result;
}

/**
 * 功能：调用 LLM 批量裁决同类冲突桶。
 * @param input 批量裁决输入
 * @returns 批次裁决结果
 */
async function resolveBucketChunkByLLM(input: {
    llm: MemoryLLMApi;
    pluginId: string;
    domain: string;
    conflictType: string;
    buckets: PipelineConflictBucketRecord[];
    budget: PipelineBudgetPolicy;
}): Promise<{
    patches: ConflictResolutionPatch[];
    llmResolvedCount: number;
    fallbackUsed: boolean;
}> {
    const fallbackMap = new Map<string, ConflictResolutionPatch>();
    input.buckets.forEach((bucket: PipelineConflictBucketRecord): void => {
        fallbackMap.set(bucket.bucketId, buildFallbackPatch(bucket));
    });

    try {
        const result = await runTakeoverStructuredTask<ConflictResolutionBatchDocument>({
            llm: input.llm,
            pluginId: input.pluginId,
            taskKey: resolveConflictBatchTaskId(input.domain),
            taskDescription: `旧聊天接管批量冲突裁决：${input.domain}/${input.conflictType}`,
            systemSection: 'TAKEOVER_BATCH_SYSTEM',
            schemaSection: 'TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA',
            sampleSection: 'TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE',
            payload: {
                domain: input.domain,
                conflictType: input.conflictType,
                buckets: input.buckets.map((bucket: PipelineConflictBucketRecord) => ({
                    bucketId: bucket.bucketId,
                    domain: bucket.domain,
                    conflictType: bucket.conflictType,
                    records: bucket.records.slice(0, input.budget.maxConflictBucketSize),
                })),
            },
            extraSystemInstruction: [
                '你当前处理的是一批同类冲突桶。',
                '每个 bucket 必须独立裁决，不要跨 bucket 合并。',
                '优先保守合并；拿不准就保留主记录。',
                '只输出 patches，不要输出额外说明。',
            ].join('\n'),
        });

        const normalizedPatches = normalizeBatchResult(result, input.buckets, fallbackMap);
        return {
            patches: normalizedPatches,
            llmResolvedCount: normalizedPatches.length,
            fallbackUsed: normalizedPatches.some((patch: ConflictResolutionPatch): boolean => {
                return patch.resolutions.some((resolution) => resolution.reasonCodes.includes('deterministic_fallback'));
            }),
        };
    } catch {
        const patches = input.buckets.map((bucket: PipelineConflictBucketRecord): ConflictResolutionPatch => {
            return fallbackMap.get(bucket.bucketId) ?? buildFallbackPatch(bucket);
        });
        return {
            patches,
            llmResolvedCount: 0,
            fallbackUsed: true,
        };
    }
}

/**
 * 功能：规范化批量裁决输出。
 * @param result 模型结果
 * @param buckets 原始桶列表
 * @param fallbackMap 兜底补丁映射
 * @returns 规范化后的补丁列表
 */
function normalizeBatchResult(
    result: ConflictResolutionBatchDocument | null,
    buckets: PipelineConflictBucketRecord[],
    fallbackMap: Map<string, ConflictResolutionPatch>,
): ConflictResolutionPatch[] {
    const rawPatches = Array.isArray(result?.patches) ? result?.patches : [];
    const normalizedMap = new Map<string, ConflictResolutionPatch>();

    for (const bucket of buckets) {
        const fallback = fallbackMap.get(bucket.bucketId) ?? buildFallbackPatch(bucket);
        const rawPatch = rawPatches.find((patch: ConflictResolutionPatch): boolean => {
            return String(patch?.bucketId ?? '').trim() === bucket.bucketId;
        });
        normalizedMap.set(bucket.bucketId, rawPatch ? normalizePatch(rawPatch, bucket, fallback, 'llm_batch_resolver') : fallback);
    }

    return buckets.map((bucket: PipelineConflictBucketRecord): ConflictResolutionPatch => {
        return normalizedMap.get(bucket.bucketId) ?? buildFallbackPatch(bucket);
    });
}

/**
 * 功能：构建冲突裁决失败时的保守兜底补丁。
 * @param bucket 冲突桶
 * @returns 兜底补丁
 */
function buildFallbackPatch(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch {
    const primaryRecord = bucket.records[0] as Record<string, unknown>;
    const primaryKey = resolveRecordKey(primaryRecord);
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
                selectedPrimaryKey: primaryKey,
                selectedSnapshot: buildSelectedSnapshot(bucket.domain, primaryRecord),
                selectionReason: secondaryKeys.length > 0 ? 'deterministic_keep_primary' : 'single_record_kept',
                appliedFieldNames: [],
                resolverSource: 'deterministic_fallback',
                reasonCodes: ['deterministic_fallback'],
            },
        ],
    };
}

/**
 * 功能：规范化冲突裁决补丁。
 * @param patch 模型补丁
 * @param bucket 冲突桶
 * @param fallback 兜底补丁
 * @param resolverSource 裁决来源
 * @returns 规范化后的补丁
 */
function normalizePatch(
    patch: ConflictResolutionPatch,
    bucket: PipelineConflictBucketRecord,
    fallback: ConflictResolutionPatch,
    resolverSource: 'rule_resolver' | 'llm_batch_resolver' | 'deterministic_fallback',
): ConflictResolutionPatch {
    const resolutions = Array.isArray(patch.resolutions) ? patch.resolutions : [];
    if (resolutions.length <= 0) {
        return fallback;
    }
    return {
        bucketId: String(patch.bucketId ?? bucket.bucketId).trim() || bucket.bucketId,
        domain: String(patch.domain ?? bucket.domain).trim() || bucket.domain,
        resolutions: resolutions.map((item) => {
            const primaryKey = String(item.primaryKey ?? fallback.resolutions[0]?.primaryKey ?? '').trim();
            const primaryRecord = resolveBucketRecordByKey(bucket, primaryKey);
            const fieldOverrides = item.fieldOverrides && typeof item.fieldOverrides === 'object' ? item.fieldOverrides : {};
            const selectedSnapshot = item.selectedSnapshot && typeof item.selectedSnapshot === 'object'
                ? item.selectedSnapshot
                : buildMergedSelectedSnapshot(bucket.domain, primaryRecord, fieldOverrides);
            const appliedFieldNames = Array.isArray(item.appliedFieldNames) && item.appliedFieldNames.length > 0
                ? item.appliedFieldNames.map((fieldName: unknown): string => String(fieldName ?? '').trim()).filter(Boolean)
                : Object.keys(fieldOverrides);
            return {
                action: item.action,
                primaryKey,
                secondaryKeys: Array.isArray(item.secondaryKeys)
                    ? item.secondaryKeys.map((key: string): string => String(key ?? '').trim()).filter(Boolean)
                    : [],
                fieldOverrides,
                selectedPrimaryKey: String(item.selectedPrimaryKey ?? primaryKey).trim() || primaryKey,
                selectedSnapshot,
                selectionReason: String(item.selectionReason ?? '').trim() || resolveSelectionReason(item.reasonCodes),
                appliedFieldNames,
                resolverSource,
                reasonCodes: Array.isArray(item.reasonCodes) && item.reasonCodes.length > 0 ? item.reasonCodes : ['llm_resolved'],
            };
        }),
    };
}

/**
 * 功能：解析批量冲突裁决任务标识。
 * @param domain 领域
 * @returns 任务标识
 */
function resolveConflictBatchTaskId(domain: string): string {
    if (domain === 'actor') {
        return 'memory_takeover_actor_conflict_resolve_batch';
    }
    if (domain === 'entity') {
        return 'memory_takeover_entity_conflict_resolve_batch';
    }
    if (domain === 'relationship') {
        return 'memory_takeover_relation_conflict_resolve_batch';
    }
    if (domain === 'task') {
        return 'memory_takeover_task_conflict_resolve_batch';
    }
    if (domain === 'fact') {
        return 'memory_takeover_fact_conflict_resolve_batch';
    }
    return 'memory_takeover_world_conflict_resolve_batch';
}

/**
 * 功能：解析记录主键。
 * @param record 记录对象
 * @returns 主键文本
 */
function resolveRecordKey(record: Record<string, unknown>): string {
    const factKey = `${String(record.type ?? '').trim()}::${String(record.subject ?? '').trim()}::${String(record.predicate ?? '').trim()}`;
    return String(
        record.actorKey
        ?? record.compareKey
        ?? record.entityKey
        ?? record.task
        ?? record.key
        ?? (factKey !== '::::' ? factKey : '')
        ?? `${String(record.sourceActorKey ?? '').trim()}::${String(record.targetActorKey ?? '').trim()}`,
    ).trim();
}

/**
 * 功能：根据主键从冲突桶中解析原始记录。
 * @param bucket 冲突桶
 * @param recordKey 记录主键
 * @returns 原始记录
 */
function resolveBucketRecordByKey(
    bucket: PipelineConflictBucketRecord,
    recordKey: string,
): Record<string, unknown> {
    return (bucket.records.find((item: unknown): boolean => {
        return resolveRecordKey(item as Record<string, unknown>) === recordKey;
    }) as Record<string, unknown> | undefined) ?? {};
}

/**
 * 功能：构建最终选中快照。
 * @param domain 领域
 * @param primaryRecord 主记录
 * @returns 调试快照
 */
function buildSelectedSnapshot(domain: string, primaryRecord: Record<string, unknown>): Record<string, unknown> {
    const normalizedDomain = String(domain ?? '').trim();
    if (normalizedDomain === 'relationship') {
        return pickRecordFields(primaryRecord, [
            'sourceActorKey',
            'targetActorKey',
            'participants',
            'relationTag',
            'state',
            'summary',
            'trust',
            'affection',
            'tension',
        ]);
    }
    if (normalizedDomain === 'entity') {
        return pickRecordFields(primaryRecord, [
            'entityType',
            'entityKey',
            'compareKey',
            'schemaVersion',
            'canonicalName',
            'title',
            'summary',
            'fields',
            'bindings',
        ]);
    }
    if (normalizedDomain === 'task') {
        return pickRecordFields(primaryRecord, [
            'task',
            'title',
            'summary',
            'description',
            'goal',
            'state',
            'status',
            'compareKey',
            'bindings',
        ]);
    }
    if (normalizedDomain === 'world') {
        return pickRecordFields(primaryRecord, [
            'key',
            'value',
            'entityKey',
            'summary',
            'compareKey',
            'schemaVersion',
            'canonicalName',
        ]);
    }
    if (normalizedDomain === 'fact') {
        return pickRecordFields(primaryRecord, [
            'type',
            'subject',
            'predicate',
            'value',
            'confidence',
            'compareKey',
            'canonicalName',
            'summary',
            'bindings',
        ]);
    }
    return pickRecordFields(primaryRecord, [
        'actorKey',
        'displayName',
        'aliases',
        'identityFacts',
        'originFacts',
        'traits',
    ]);
}

/**
 * 功能：构建应用覆盖后的最终快照。
 * @param domain 领域
 * @param primaryRecord 主记录
 * @param fieldOverrides 字段覆盖
 * @returns 合并后的调试快照
 */
function buildMergedSelectedSnapshot(
    domain: string,
    primaryRecord: Record<string, unknown>,
    fieldOverrides: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...buildSelectedSnapshot(domain, primaryRecord),
        ...fieldOverrides,
    };
}

/**
 * 功能：按字段白名单提取记录内容。
 * @param record 原始记录
 * @param keys 字段白名单
 * @returns 提取后的对象
 */
function pickRecordFields(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
        if (key in record) {
            result[key] = record[key];
        }
    }
    return result;
}

/**
 * 功能：根据原因码解析选择原因。
 * @param reasonCodes 原因码
 * @returns 统一选择原因
 */
function resolveSelectionReason(reasonCodes: unknown): string {
    const normalizedReasonCodes = Array.isArray(reasonCodes)
        ? reasonCodes.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
        : [];
    if (normalizedReasonCodes.includes('prefer_latest_deeper_state')) {
        return 'prefer_latest_deeper_state';
    }
    if (normalizedReasonCodes.includes('temporal_progression_not_true_conflict')) {
        return 'temporal_progression_merge';
    }
    if (normalizedReasonCodes.includes('same_participants')) {
        return 'same_participants_merge';
    }
    if (normalizedReasonCodes.includes('deterministic_fallback')) {
        return 'deterministic_keep_primary';
    }
    return 'llm_selected_primary';
}
