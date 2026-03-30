import type {
    ConflictResolutionPatch,
    PipelineBudgetPolicy,
    PipelineConflictBucketRecord,
} from '../pipeline/pipeline-types';

/**
 * 功能：规则裁决结果。
 */
export interface TakeoverRuleConflictResolveResult {
    resolvedPatches: ConflictResolutionPatch[];
    pendingBuckets: PipelineConflictBucketRecord[];
    skippedByRuleCount: number;
}

/**
 * 功能：优先用本地规则裁掉高置信的简单冲突，减少进入 LLM 的桶数量。
 * @param buckets 冲突桶列表
 * @param budget 预算策略
 * @returns 已规则解决与待送 LLM 的冲突结果
 */
export function resolveTakeoverConflictBucketsByRules(
    buckets: PipelineConflictBucketRecord[],
    budget: PipelineBudgetPolicy,
): TakeoverRuleConflictResolveResult {
    const resolvedPatches: ConflictResolutionPatch[] = [];
    const pendingBuckets: PipelineConflictBucketRecord[] = [];
    let skippedByRuleCount = 0;

    for (const bucket of buckets) {
        const patch = tryResolveBucketByRule(bucket, budget);
        if (patch) {
            resolvedPatches.push(patch);
            skippedByRuleCount += 1;
            continue;
        }
        pendingBuckets.push(bucket);
    }

    return {
        resolvedPatches,
        pendingBuckets,
        skippedByRuleCount,
    };
}

/**
 * 功能：尝试按规则裁决单个冲突桶。
 * @param bucket 冲突桶
 * @param budget 预算策略
 * @returns 裁决补丁；无法稳定裁决时返回 null
 */
function tryResolveBucketByRule(
    bucket: PipelineConflictBucketRecord,
    budget: PipelineBudgetPolicy,
): ConflictResolutionPatch | null {
    if (!Array.isArray(bucket.records) || bucket.records.length <= 1) {
        return null;
    }
    if (bucket.records.length > budget.maxRuleOnlyConflictRecords) {
        return null;
    }

    if (bucket.domain === 'relationship' && bucket.conflictType === 'state_divergence') {
        return tryResolveRelationshipStateDivergence(bucket);
    }
    if (bucket.domain === 'task' && bucket.conflictType === 'stage_divergence') {
        return tryResolveTaskStageDivergence(bucket);
    }
    if (bucket.domain === 'world' && bucket.conflictType === 'value_divergence') {
        return tryResolveWorldValueDivergence(bucket);
    }
    if (bucket.domain === 'entity' && bucket.conflictType === 'title_collision') {
        return tryResolveEntityTitleCollision(bucket);
    }
    return null;
}

/**
 * 功能：按规则裁决关系状态推进冲突。
 * @param bucket 冲突桶
 * @returns 裁决补丁
 */
function tryResolveRelationshipStateDivergence(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch | null {
    const records = bucket.records.map(toRecord);
    const latestRecord = records[records.length - 1];
    const primaryRecord = records[0];
    const relationTag = normalizeText(latestRecord.relationTag);
    const allSameParticipants = records.every((record: Record<string, unknown>): boolean => {
        return buildActorPairKey(record) === buildActorPairKey(latestRecord);
    });
    const allSameRelationTag = records.every((record: Record<string, unknown>): boolean => {
        return normalizeText(record.relationTag) === relationTag;
    });
    if (!allSameParticipants || !allSameRelationTag || !relationTag) {
        return null;
    }

    const latestKey = resolveRecordKey(latestRecord);
    if (!latestKey) {
        return null;
    }
    const secondaryKeys = records
        .slice(0, -1)
        .map(resolveRecordKey)
        .filter((key: string): boolean => Boolean(key) && key !== latestKey);

    return {
        bucketId: bucket.bucketId,
        domain: bucket.domain,
        resolutions: [
            {
                action: 'merge',
                primaryKey: latestKey,
                secondaryKeys,
                fieldOverrides: {},
                selectedPrimaryKey: latestKey,
                selectedSnapshot: buildSelectedSnapshot('relationship', latestRecord),
                selectionReason: 'prefer_latest_deeper_state',
                appliedFieldNames: [],
                resolverSource: 'rule_resolver',
                reasonCodes: [
                    'rule_same_participants_same_tag_merge',
                    'rule_temporal_progression_merge',
                ],
            },
        ],
    };
}

/**
 * 功能：按规则裁决任务阶段推进冲突。
 * @param bucket 冲突桶
 * @returns 裁决补丁
 */
function tryResolveTaskStageDivergence(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch | null {
    const records = bucket.records.map(toRecord);
    const latestRecord = records[records.length - 1];
    const latestKey = resolveRecordKey(latestRecord);
    if (!latestKey) {
        return null;
    }
    const baseTaskKey = normalizeText(latestRecord.compareKey ?? latestRecord.task ?? latestRecord.title);
    const allSameTask = records.every((record: Record<string, unknown>): boolean => {
        return normalizeText(record.compareKey ?? record.task ?? record.title) === baseTaskKey;
    });
    if (!allSameTask || !baseTaskKey) {
        return null;
    }

    return {
        bucketId: bucket.bucketId,
        domain: bucket.domain,
        resolutions: [
            {
                action: 'merge',
                primaryKey: latestKey,
                secondaryKeys: records
                    .slice(0, -1)
                    .map(resolveRecordKey)
                    .filter((key: string): boolean => Boolean(key) && key !== latestKey),
                fieldOverrides: {},
                selectedPrimaryKey: latestKey,
                selectedSnapshot: buildSelectedSnapshot('task', latestRecord),
                selectionReason: 'task_stage_progressed',
                appliedFieldNames: [],
                resolverSource: 'rule_resolver',
                reasonCodes: ['rule_temporal_progression_merge', 'rule_latest_more_complete'],
            },
        ],
    };
}

/**
 * 功能：按规则裁决世界状态值冲突。
 * @param bucket 冲突桶
 * @returns 裁决补丁
 */
function tryResolveWorldValueDivergence(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch | null {
    const records = bucket.records.map(toRecord);
    const latestRecord = records[records.length - 1];
    const latestKey = resolveRecordKey(latestRecord);
    if (!latestKey) {
        return null;
    }
    const baseWorldKey = normalizeText(latestRecord.compareKey ?? latestRecord.entityKey ?? latestRecord.key);
    const allSameWorldKey = records.every((record: Record<string, unknown>): boolean => {
        return normalizeText(record.compareKey ?? record.entityKey ?? record.key) === baseWorldKey;
    });
    if (!allSameWorldKey || !baseWorldKey) {
        return null;
    }

    return {
        bucketId: bucket.bucketId,
        domain: bucket.domain,
        resolutions: [
            {
                action: 'merge',
                primaryKey: latestKey,
                secondaryKeys: records
                    .slice(0, -1)
                    .map(resolveRecordKey)
                    .filter((key: string): boolean => Boolean(key) && key !== latestKey),
                fieldOverrides: {},
                selectedPrimaryKey: latestKey,
                selectedSnapshot: buildSelectedSnapshot('world', latestRecord),
                selectionReason: 'world_state_latest_complete',
                appliedFieldNames: [],
                resolverSource: 'rule_resolver',
                reasonCodes: ['rule_same_compare_key_merge', 'rule_latest_more_complete'],
            },
        ],
    };
}

/**
 * 功能：按规则裁决实体标题碰撞冲突。
 * @param bucket 冲突桶
 * @returns 裁决补丁
 */
function tryResolveEntityTitleCollision(bucket: PipelineConflictBucketRecord): ConflictResolutionPatch | null {
    const records = bucket.records.map(toRecord);
    const latestRecord = records[records.length - 1];
    const latestKey = resolveRecordKey(latestRecord);
    if (!latestKey) {
        return null;
    }
    const canonicalKey = normalizeText(
        latestRecord.compareKey
        ?? latestRecord.entityKey
        ?? latestRecord.canonicalName
        ?? latestRecord.title,
    );
    const allSameEntity = records.every((record: Record<string, unknown>): boolean => {
        return normalizeText(
            record.compareKey
            ?? record.entityKey
            ?? record.canonicalName
            ?? record.title,
        ) === canonicalKey;
    });
    if (!allSameEntity || !canonicalKey) {
        return null;
    }

    return {
        bucketId: bucket.bucketId,
        domain: bucket.domain,
        resolutions: [
            {
                action: 'merge',
                primaryKey: latestKey,
                secondaryKeys: records
                    .slice(0, -1)
                    .map(resolveRecordKey)
                    .filter((key: string): boolean => Boolean(key) && key !== latestKey),
                fieldOverrides: {},
                selectedPrimaryKey: latestKey,
                selectedSnapshot: buildSelectedSnapshot('entity', latestRecord),
                selectionReason: 'entity_canonicalized_merge',
                appliedFieldNames: [],
                resolverSource: 'rule_resolver',
                reasonCodes: ['rule_same_compare_key_merge', 'rule_latest_more_complete'],
            },
        ],
    };
}

/**
 * 功能：将未知输入归一化为对象。
 * @param value 原始值
 * @returns 对象记录
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：统一文本归一化。
 * @param value 原始值
 * @returns 归一化文本
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * 功能：解析冲突记录主键。
 * @param record 冲突记录
 * @returns 主键文本
 */
function resolveRecordKey(record: Record<string, unknown>): string {
    return String(
        record.actorKey
        ?? record.compareKey
        ?? record.entityKey
        ?? record.task
        ?? record.key
        ?? `${normalizeText(record.sourceActorKey)}::${normalizeText(record.targetActorKey)}`,
    ).trim();
}

/**
 * 功能：构建关系参与者对键。
 * @param record 关系记录
 * @returns 参与者对键
 */
function buildActorPairKey(record: Record<string, unknown>): string {
    const left = normalizeText(record.sourceActorKey);
    const right = normalizeText(record.targetActorKey);
    return `${left}::${right}`;
}

/**
 * 功能：构建规则裁决后的调试快照。
 * @param domain 领域
 * @param primaryRecord 主记录
 * @returns 调试快照
 */
function buildSelectedSnapshot(domain: string, primaryRecord: Record<string, unknown>): Record<string, unknown> {
    if (domain === 'relationship') {
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
    if (domain === 'entity') {
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
    if (domain === 'task') {
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

/**
 * 功能：按字段白名单提取记录内容。
 * @param record 原始记录
 * @param keys 字段列表
 * @returns 提取结果
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
