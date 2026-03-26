import type {
    InjectionSectionName,
    LatestRecallExplanation,
    MemoryLifecycleState,
    RecallCandidate,
    RecallLogEntry,
} from '../types';
import { buildLatestRecallExplanation } from '../core/recall-explanation';

type LifecycleIndexInput = Record<string, MemoryLifecycleState> | Map<string, MemoryLifecycleState> | null | undefined;

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/*
    const normalizedKey = normalizeText(recordKey);
    if (!normalizedKey || !lifecycleIndex) {
        return null;
    }
    if (lifecycleIndex instanceof Map) {
        return lifecycleIndex.get(normalizedKey)?.stage ?? null;
    }
    return lifecycleIndex[normalizedKey]?.stage ?? null;
*/

/**
 * 功能：把召回候选转成记录日志条目。
 * 参数：
 *   candidates：召回候选。
 *   query：查询文本。
 *   loggedAt：记录时间。
 * 返回：召回日志条目列表。
 */
export function buildRecallLogEntries(candidates: RecallCandidate[], query: string, loggedAt: number): RecallLogEntry[] {
    return candidates.map((candidate: RecallCandidate, index: number): RecallLogEntry => ({
        recallId: `actual:${loggedAt}:${index}:${candidate.candidateId}`,
        query,
        section: candidate.sectionHint ?? 'PREVIEW',
        recordKey: candidate.recordKey,
        cardId: candidate.source === 'memory_card'
            ? (normalizeText(candidate.memoryCardId) || null)
            : null,
        recordKind: toRecallLogRecordKind(candidate),
        recordTitle: candidate.title,
        score: candidate.finalScore,
        selected: candidate.selected,
        conflictSuppressed: candidate.reasonCodes.includes('conflict_suppressed'),
        tone: candidate.tone,
        reasonCodes: [...candidate.reasonCodes],
        loggedAt,
    }));
}

/**
 * 功能：把召回候选记录类型映射为日志记录类型。
 * 参数：
 *   candidate：召回候选。
 * 返回：日志记录类型。
 */
export function toRecallLogRecordKind(candidate: RecallCandidate): RecallLogEntry['recordKind'] {
    if (candidate.recordKind === 'event') {
        return 'summary';
    }
    if (candidate.recordKind === 'lorebook') {
        return 'state';
    }
    return candidate.recordKind;
}

/**
 * 功能：根据召回日志构建最近一轮召回解释快照。
 * 参数：
 *   generatedAt：生成时间。
 *   query：查询文本。
 *   sectionsUsed：使用的分区。
 *   reasonCodes：决策原因码。
 *   recallEntries：召回日志条目。
 *   lifecycleIndex：生命周期索引。
 * 返回：召回解释快照。
 */
export async function buildLatestRecallExplanationSnapshot(params: {
    generatedAt: number;
    query: string;
    sectionsUsed: InjectionSectionName[];
    reasonCodes: string[];
    recallEntries: RecallLogEntry[];
    lifecycleIndex?: LifecycleIndexInput;
    vectorGate?: LatestRecallExplanation['vectorGate'];
    cache?: LatestRecallExplanation['cache'];
    cheapRecall?: LatestRecallExplanation['cheapRecall'];
    baseInjection?: LatestRecallExplanation['baseInjection'];
}): Promise<LatestRecallExplanation> {
    const lifecycleIndex = params.lifecycleIndex ?? null;
    return buildLatestRecallExplanation({
        generatedAt: params.generatedAt,
        query: params.query,
        sectionsUsed: params.sectionsUsed,
        reasonCodes: params.reasonCodes,
        recallEntries: params.recallEntries,
        vectorGate: params.vectorGate ?? null,
        cache: params.cache ?? null,
        cheapRecall: params.cheapRecall ?? null,
        baseInjection: params.baseInjection ?? null,
        lifecycleIndex: lifecycleIndex instanceof Map
            ? Array.from(lifecycleIndex.entries()).reduce<Record<string, MemoryLifecycleState>>((result, [recordKey, lifecycle]) => {
                result[recordKey] = lifecycle;
                return result;
            }, {})
            : lifecycleIndex ?? undefined,
    });
}
