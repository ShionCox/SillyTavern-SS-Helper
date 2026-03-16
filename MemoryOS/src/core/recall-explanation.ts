import type {
    InjectionSectionName,
    LatestRecallExplanation,
    MemoryCandidate,
    MemoryCandidateKind,
    MemoryDecayStage,
    MemoryLayer,
    MemoryLifecycleState,
    MemoryRecordKind,
    RecallExplanationBucket,
    RecallLogEntry,
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
 * 功能：挑选最接近当前批次的未通过候选。
 * @param candidates 候选记忆数组。
 * @returns 最近一批未通过的候选数组。
 */
export function pickRecentRejectedCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
    const rejectedCandidates: MemoryCandidate[] = Array.isArray(candidates)
        ? candidates.filter((item: MemoryCandidate): boolean => item.encoding?.accepted !== true)
        : [];
    if (rejectedCandidates.length === 0) {
        return [];
    }
    const latestAt: number = rejectedCandidates.reduce((maxValue: number, item: MemoryCandidate): number => {
        return Math.max(maxValue, Number(item.extractedAt ?? 0) || 0);
    }, 0);
    const recentWindowMs: number = 5 * 60 * 1000;
    return rejectedCandidates
        .filter((item: MemoryCandidate): boolean => {
            if (latestAt <= 0) {
                return true;
            }
            return latestAt - (Number(item.extractedAt ?? 0) || 0) <= recentWindowMs;
        })
        .sort((left: MemoryCandidate, right: MemoryCandidate): number => Number(right.extractedAt ?? 0) - Number(left.extractedAt ?? 0));
}

/**
 * 功能：构建编码拦下分组。
 * @param candidates 候选记忆数组。
 * @returns 解释分组。
 */
function buildRejectedCandidateBucket(candidates: MemoryCandidate[]): RecallExplanationBucket {
    return {
        bucketKey: 'rejected_candidates',
        label: '编码拦下',
        emptyText: '这次没有候选被编码评分拦下。',
        items: pickRecentRejectedCandidates(candidates).map((item: MemoryCandidate) => ({
            itemId: normalizeExplanationText(item.candidateId),
            sourceKind: 'candidate' as const,
            recordKey: normalizeExplanationText(item.resolvedRecordKey ?? item.candidateId),
            recordKind: item.kind as ExplanationBucketItemKind,
            title: normalizeExplanationText(item.summary) || normalizeExplanationText(item.candidateId) || '未命名候选',
            score: Number(item.encoding?.totalScore ?? 0) || 0,
            layer: (item.encoding?.targetLayer ?? null) as MemoryLayer | null,
            section: null,
            tone: null,
            stage: (item.encoding?.decayStage ?? null) as MemoryDecayStage | null,
            reasonCodes: Array.isArray(item.encoding?.reasonCodes)
                ? item.encoding.reasonCodes.map((reasonCode: string): string => normalizeExplanationText(reasonCode)).filter(Boolean)
                : [],
            accepted: item.encoding?.accepted === true,
        })).slice(0, 8),
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
    };
}

/**
 * 功能：根据最近一轮召回和候选缓冲构建解释快照。
 * @param generatedAt 生成时间。
 * @param query 本轮查询文本。
 * @param sectionsUsed 本轮使用的区段。
 * @param reasonCodes 原因码。
 * @param recallEntries 本轮召回条目。
 * @param candidates 当前候选缓冲。
 * @param lifecycleIndex 生命周期索引。
 * @returns 最近一轮解释快照。
 */
export function buildLatestRecallExplanation(params: {
    generatedAt: number;
    query: string;
    sectionsUsed: InjectionSectionName[];
    reasonCodes: string[];
    recallEntries: RecallLogEntry[];
    candidates: MemoryCandidate[];
    lifecycleIndex?: ExplanationLifecycleIndex;
}): LatestRecallExplanation {
    const selectedEntries: RecallLogEntry[] = Array.isArray(params.recallEntries)
        ? params.recallEntries.filter((entry: RecallLogEntry): boolean => entry.selected)
        : [];
    const conflictSuppressedEntries: RecallLogEntry[] = Array.isArray(params.recallEntries)
        ? params.recallEntries.filter((entry: RecallLogEntry): boolean => entry.conflictSuppressed)
        : [];
    return normalizeLatestRecallExplanation({
        generatedAt: params.generatedAt,
        query: params.query,
        sectionsUsed: params.sectionsUsed,
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
        rejectedCandidates: buildRejectedCandidateBucket(params.candidates),
        reasonCodes: Array.isArray(params.reasonCodes)
            ? params.reasonCodes.map((item: string): string => normalizeExplanationText(item)).filter(Boolean)
            : [],
    }) as LatestRecallExplanation;
}
