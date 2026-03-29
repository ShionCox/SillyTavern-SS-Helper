import { buildCompareKey, parseCompareKey, compareKeysMatch, compareKeysNearMatch } from '../core/compare-key';
import type { SummaryCandidateRecord } from './candidate-record-resolver';

/**
 * 功能：CompareKey 冲突检测结果。
 */
export interface CompareKeyConflict {
    compareKeyA: string;
    compareKeyB: string;
    candidateIdA: string;
    candidateIdB: string;
    type: 'exact' | 'near';
}

/**
 * 功能：检测候选记录列表中的 compareKey 冲突。
 * 返回精确匹配和近似匹配的冲突对。
 * @param candidates 候选记录列表。
 * @returns 冲突列表。
 */
export function detectCompareKeyConflicts(candidates: SummaryCandidateRecord[]): CompareKeyConflict[] {
    const conflicts: CompareKeyConflict[] = [];
    const seen = new Map<string, SummaryCandidateRecord>();
    for (const candidate of candidates) {
        const key = candidate.compareKey;
        if (!key) continue;
        for (const [existingKey, existingCandidate] of seen) {
            if (compareKeysMatch(key, existingKey)) {
                conflicts.push({
                    compareKeyA: existingKey,
                    compareKeyB: key,
                    candidateIdA: existingCandidate.candidateId,
                    candidateIdB: candidate.candidateId,
                    type: 'exact',
                });
            } else if (compareKeysNearMatch(key, existingKey)) {
                conflicts.push({
                    compareKeyA: existingKey,
                    compareKeyB: key,
                    candidateIdA: existingCandidate.candidateId,
                    candidateIdB: candidate.candidateId,
                    type: 'near',
                });
            }
        }
        seen.set(key, candidate);
    }
    return conflicts;
}

/**
 * 功能：在候选记录列表中查找与给定 compareKey 匹配的记录。
 * @param compareKey 目标 compareKey。
 * @param candidates 候选记录列表。
 * @returns 精确匹配或近似匹配的候选记录，优先精确。
 */
export function resolveCompareKeyMatch(
    compareKey: string,
    candidates: SummaryCandidateRecord[],
): { candidate: SummaryCandidateRecord; matchType: 'exact' | 'near' } | null {
    const exactMatch = candidates.find((c) => compareKeysMatch(compareKey, c.compareKey));
    if (exactMatch) {
        return { candidate: exactMatch, matchType: 'exact' };
    }
    const nearMatch = candidates.find((c) => compareKeysNearMatch(compareKey, c.compareKey));
    if (nearMatch) {
        return { candidate: nearMatch, matchType: 'near' };
    }
    return null;
}

/**
 * 功能：为指定 entryType 和 title 生成稳定的 compareKey。
 * 代理到 core/compare-key 的统一 buildCompareKey。
 * @param entryType 条目类型。
 * @param title 标题。
 * @param fields 可选字段映射。
 * @returns 统一 compareKey。
 */
export function resolveSummaryCompareKey(
    entryType: string,
    title: string,
    fields?: Record<string, unknown>,
): string {
    return buildCompareKey(entryType, title, fields);
}

export { parseCompareKey, compareKeysMatch, compareKeysNearMatch };
