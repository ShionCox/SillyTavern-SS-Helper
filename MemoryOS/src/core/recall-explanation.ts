import type {
    CheapRecallSnapshot,
    InjectionSectionName,
    LatestRecallExplanation,
    MemoryCandidateKind,
    MemoryCardLane,
    MemoryDecayStage,
    MemoryLayer,
    MemoryLifecycleState,
    MemoryRecordKind,
    RecallExplanationBucket,
    RecallLogEntry,
    VectorMode,
} from '../types';

type ExplanationBucketKey = 'selected' | 'conflict_suppressed' | 'rejected_candidates';

type ExplanationBucketItemKind = MemoryRecordKind | MemoryCandidateKind;

type ExplanationLifecycleIndex = Record<string, MemoryLifecycleState> | null | undefined;

/**
 * 功能：把任意值归一化为单行文本。
 * @param value 待归一化的值。
 * @returns 清理后的文本。
 */
function normalizeExplanationText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：根据记录键读取生命周期阶段。
 * @param recordKey 记录键。
 * @param lifecycleIndex 生命周期索引。
 * @returns 生命周期阶段，不存在时返回 null。
 */
function readLifecycleStage(
    recordKey: string,
    lifecycleIndex: ExplanationLifecycleIndex,
): MemoryDecayStage | null {
    const normalizedKey: string = normalizeExplanationText(recordKey);
    if (!normalizedKey || !lifecycleIndex) {
        return null;
    }
    return lifecycleIndex[normalizedKey]?.stage ?? null;
}

/**
 * 功能：归一化向量门控快照。
 * 参数：
 *   value：原始快照。
 * 返回：
 *   LatestRecallExplanation['vectorGate']：归一化结果。
 */
function normalizeRecallGateSnapshot(value: unknown): LatestRecallExplanation['vectorGate'] {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    return {
        enabled: Boolean(record.enabled),
        lanes: Array.isArray(record.lanes)
            ? record.lanes.map((item: unknown): string => normalizeExplanationText(item).toLowerCase()).filter(Boolean) as MemoryCardLane[]
            : [],
        reasonCodes: Array.isArray(record.reasonCodes)
            ? record.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
        primaryNeed: normalizeExplanationText(record.primaryNeed) as LatestRecallExplanation['vectorGate'] extends { primaryNeed: infer T } ? T : never,
        vectorMode: normalizeExplanationText(record.vectorMode) as VectorMode,
    };
}

/**
 * 功能：归一化缓存快照。
 * 参数：
 *   value：原始快照。
 * 返回：
 *   LatestRecallExplanation['cache']：归一化结果。
 */
function normalizeRecallCacheSnapshot(value: unknown): LatestRecallExplanation['cache'] {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    return {
        hit: Boolean(record.hit),
        reasonCodes: Array.isArray(record.reasonCodes)
            ? record.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
        entityKeys: Array.isArray(record.entityKeys)
            ? record.entityKeys.map((item: unknown): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
        laneSet: Array.isArray(record.laneSet)
            ? record.laneSet.map((item: unknown): string => normalizeExplanationText(item).toLowerCase()).filter(Boolean) as MemoryCardLane[]
            : [],
        selectedCardIds: Array.isArray(record.selectedCardIds)
            ? record.selectedCardIds.map((item: unknown): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
        expiresTurn: Math.max(0, Number(record.expiresTurn ?? 0) || 0),
    };
}

/**
 * 功能：归一化便宜召回快照。
 * 参数：
 *   value：原始快照。
 * 返回：
 *   LatestRecallExplanation['cheapRecall']：归一化结果。
 */
function normalizeCheapRecallSnapshot(value: unknown): LatestRecallExplanation['cheapRecall'] {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    return {
        primaryNeed: normalizeExplanationText(record.primaryNeed) as CheapRecallSnapshot['primaryNeed'],
        coveredLanes: Array.isArray(record.coveredLanes)
            ? record.coveredLanes.map((item: unknown): string => normalizeExplanationText(item).toLowerCase()).filter(Boolean) as MemoryCardLane[]
            : [],
        structuredCount: Math.max(0, Number(record.structuredCount ?? 0) || 0),
        recentEventCount: Math.max(0, Number(record.recentEventCount ?? 0) || 0),
        enough: Boolean(record.enough),
    };
}

/**
 * 功能：构建召回日志解释分组。
 * @param bucketKey 分组键。
 * @param label 分组标题。
 * @param emptyText 空状态文案。
 * @param entries 召回日志条目。
 * @param lifecycleIndex 生命周期索引。
 * @returns 解释分组。
 */
function buildRecallLogBucket(
    bucketKey: ExplanationBucketKey,
    label: string,
    emptyText: string,
    entries: RecallLogEntry[],
    lifecycleIndex: ExplanationLifecycleIndex,
): RecallExplanationBucket {
    return {
        bucketKey,
        label,
        emptyText,
        items: entries
            .map((entry: RecallLogEntry) => ({
                itemId: normalizeExplanationText(entry.recallId),
                sourceKind: 'recall_log' as const,
                recordKey: normalizeExplanationText(entry.recordKey),
                recordKind: entry.recordKind as ExplanationBucketItemKind,
                title: normalizeExplanationText(entry.recordTitle) || normalizeExplanationText(entry.recordKey) || '未命名记忆',
                score: Number(entry.score ?? 0) || 0,
                layer: null as MemoryLayer | null,
                section: (entry.section ?? 'PREVIEW') as InjectionSectionName | 'PREVIEW',
                tone: entry.tone ?? null,
                stage: readLifecycleStage(entry.recordKey, lifecycleIndex),
                reasonCodes: Array.isArray(entry.reasonCodes)
                    ? entry.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
                    : [],
                accepted: entry.selected,
            }))
            .sort((left, right): number => right.score - left.score)
            .slice(0, 8),
    };
}

/**
 * 功能：构建未入选候选分组。
 * @param entries 召回日志数组。
 * @param lifecycleIndex 生命周期索引。
 * @returns 解释分组。
 */
function buildRejectedCandidateBucket(
    entries: RecallLogEntry[],
    lifecycleIndex: ExplanationLifecycleIndex,
): RecallExplanationBucket {
    return {
        bucketKey: 'rejected_candidates',
        label: '未入选候选',
        emptyText: '这次没有被预算、去重或其他规则淘汰的候选。',
        items: entries
            .map((entry: RecallLogEntry) => ({
                itemId: normalizeExplanationText(entry.recallId),
                sourceKind: 'recall_log' as const,
                recordKey: normalizeExplanationText(entry.recordKey),
                recordKind: entry.recordKind as ExplanationBucketItemKind,
                title: normalizeExplanationText(entry.recordTitle) || normalizeExplanationText(entry.recordKey) || '未命名候选',
                score: Number(entry.score ?? 0) || 0,
                layer: null as MemoryLayer | null,
                section: (entry.section ?? 'PREVIEW') as InjectionSectionName | 'PREVIEW',
                tone: entry.tone ?? null,
                stage: readLifecycleStage(entry.recordKey, lifecycleIndex),
                reasonCodes: Array.isArray(entry.reasonCodes)
                    ? entry.reasonCodes.map((reasonCode: string): string => normalizeExplanationText(reasonCode)).filter(Boolean)
                    : [],
                accepted: entry.selected,
            }))
            .sort((left, right): number => right.score - left.score)
            .slice(0, 8),
    };
}

/**
 * 功能：归一化召回解释分组。
 * @param bucket 原始解释分组。
 * @returns 归一化后的解释分组。
 */
function normalizeRecallExplanationBucket(bucket: RecallExplanationBucket | null | undefined): RecallExplanationBucket {
    return {
        bucketKey: bucket?.bucketKey ?? 'selected',
        label: normalizeExplanationText(bucket?.label) || '未命名分组',
        emptyText: normalizeExplanationText(bucket?.emptyText) || '暂无数据。',
        items: Array.isArray(bucket?.items)
            ? bucket!.items.map((item) => ({
                itemId: normalizeExplanationText(item.itemId) || normalizeExplanationText(item.recordKey) || crypto.randomUUID(),
                sourceKind: item.sourceKind === 'candidate' ? 'candidate' : 'recall_log',
                recordKey: normalizeExplanationText(item.recordKey),
                recordKind: item.recordKind,
                title: normalizeExplanationText(item.title) || normalizeExplanationText(item.recordKey) || '未命名条目',
                score: Number(item.score ?? 0) || 0,
                layer: item.layer ?? null,
                section: item.section ?? null,
                tone: item.tone ?? null,
                stage: item.stage ?? null,
                reasonCodes: Array.isArray(item.reasonCodes)
                    ? item.reasonCodes.map((reasonCode: string): string => normalizeExplanationText(reasonCode)).filter(Boolean)
                    : [],
                accepted: typeof item.accepted === 'boolean' ? item.accepted : null,
            }))
            : [],
    };
}

/**
 * 功能：归一化最近一轮召回解释快照。
 * @param explanation 原始解释快照。
 * @returns 归一化后的解释快照，未提供时返回 null。
 */
export function normalizeLatestRecallExplanation(
    explanation: LatestRecallExplanation | null | undefined,
): LatestRecallExplanation | null {
    if (!explanation) {
        return null;
    }
    return {
        generatedAt: Math.max(0, Number(explanation.generatedAt ?? 0) || 0),
        query: normalizeExplanationText(explanation.query),
        sectionsUsed: Array.isArray(explanation.sectionsUsed)
            ? explanation.sectionsUsed.map((section: InjectionSectionName): InjectionSectionName => section)
            : [],
        selected: normalizeRecallExplanationBucket(explanation.selected),
        conflictSuppressed: normalizeRecallExplanationBucket(explanation.conflictSuppressed),
        rejectedCandidates: normalizeRecallExplanationBucket(explanation.rejectedCandidates),
        reasonCodes: Array.isArray(explanation.reasonCodes)
            ? explanation.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
        vectorGate: normalizeRecallGateSnapshot(explanation.vectorGate ?? null),
        cache: normalizeRecallCacheSnapshot(explanation.cache ?? null),
        cheapRecall: normalizeCheapRecallSnapshot(explanation.cheapRecall ?? null),
    };
}

/**
 * 功能：根据最近一轮实际召回结果构建解释快照。
 * @param generatedAt 生成时间。
 * @param query 本轮查询文本。
 * @param sectionsUsed 本轮使用的区段。
 * @param reasonCodes 原因码。
 * @param recallEntries 本轮召回条目。
 * @param lifecycleIndex 生命周期索引。
 * @returns 最近一轮解释快照。
 */
export function buildLatestRecallExplanation(params: {
    generatedAt: number;
    query: string;
    sectionsUsed: InjectionSectionName[];
    reasonCodes: string[];
    recallEntries: RecallLogEntry[];
    lifecycleIndex?: ExplanationLifecycleIndex;
    vectorGate?: LatestRecallExplanation['vectorGate'];
    cache?: LatestRecallExplanation['cache'];
    cheapRecall?: LatestRecallExplanation['cheapRecall'];
}): LatestRecallExplanation {
    const selectedEntries: RecallLogEntry[] = Array.isArray(params.recallEntries)
        ? params.recallEntries.filter((entry: RecallLogEntry): boolean => entry.selected)
        : [];
    const conflictSuppressedEntries: RecallLogEntry[] = Array.isArray(params.recallEntries)
        ? params.recallEntries.filter((entry: RecallLogEntry): boolean => entry.conflictSuppressed)
        : [];
    const rejectedEntries: RecallLogEntry[] = Array.isArray(params.recallEntries)
        ? params.recallEntries.filter((entry: RecallLogEntry): boolean => !entry.selected && !entry.conflictSuppressed)
        : [];
    return normalizeLatestRecallExplanation({
        generatedAt: params.generatedAt,
        query: params.query,
        sectionsUsed: params.sectionsUsed,
        vectorGate: params.vectorGate ?? null,
        cache: params.cache ?? null,
        cheapRecall: params.cheapRecall ?? null,
        selected: buildRecallLogBucket(
            'selected',
            '命中的记忆',
            '这次没有命中的记忆。',
            selectedEntries,
            params.lifecycleIndex,
        ),
        conflictSuppressed: buildRecallLogBucket(
            'conflict_suppressed',
            '被冲突压制',
            '这次没有因为冲突被压制的记忆。',
            conflictSuppressedEntries,
            params.lifecycleIndex,
        ),
        rejectedCandidates: buildRejectedCandidateBucket(rejectedEntries, params.lifecycleIndex),
        reasonCodes: Array.isArray(params.reasonCodes)
            ? params.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
    }) as LatestRecallExplanation;
}
