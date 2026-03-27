import type { MemoryEntry } from '../types';
import { RetrievalOrchestrator, type RetrievalCandidate, type RetrievalResultItem } from '../memory-retrieval';

/**
 * 功能：总结候选旧记录对象。
 */
export interface SummaryCandidateRecord {
    candidateId: string;
    recordId: string;
    targetKind: string;
    schemaId: string;
    summary: string;
}

/**
 * 功能：候选旧记录解析输入。
 */
export interface ResolveCandidateRecordsInput {
    query: string;
    candidateTypes: string[];
    entries: MemoryEntry[];
    memoryPercentByEntryId?: Map<string, number>;
    maxCandidatesHardCap?: number;
    candidateTextBudgetChars?: number;
    enableEmbedding?: boolean;
}

const defaultRetrievalOrchestrator = new RetrievalOrchestrator();

/**
 * 功能：解析总结阶段候选旧记录。
 * @param input 解析输入。
 * @returns 候选记录与检索诊断信息。
 */
export async function resolveCandidateRecords(input: ResolveCandidateRecordsInput): Promise<{
    providerId: string;
    candidates: SummaryCandidateRecord[];
    matchedEntryIds: string[];
}> {
    const maxCandidatesHardCap = Math.max(3, Number(input.maxCandidatesHardCap ?? 12) || 12);
    const candidateTextBudgetChars = Math.max(300, Number(input.candidateTextBudgetChars ?? 1800) || 1800);
    const retrievalCandidates = mapToRetrievalCandidates(input.entries, input.memoryPercentByEntryId);
    const retrieveResult = await defaultRetrievalOrchestrator.retrieve({
        query: input.query,
        candidateTypes: input.candidateTypes,
        enableEmbedding: input.enableEmbedding,
        budget: {
            maxCandidates: maxCandidatesHardCap,
        },
    }, retrievalCandidates);

    const candidates: SummaryCandidateRecord[] = [];
    let consumedChars = 0;
    for (const item of retrieveResult.items) {
        if (candidates.length >= maxCandidatesHardCap) {
            break;
        }
        const candidateText = normalizeText(item.candidate.summary || item.candidate.title);
        const nextCost = Math.max(24, candidateText.length);
        if (candidates.length > 0 && consumedChars + nextCost > candidateTextBudgetChars) {
            continue;
        }
        candidates.push({
            candidateId: `cand_${candidates.length + 1}`,
            recordId: item.candidate.entryId,
            targetKind: item.candidate.schemaId,
            schemaId: item.candidate.schemaId,
            summary: candidateText || normalizeText(item.candidate.title),
        });
        consumedChars += nextCost;
    }
    return {
        providerId: retrieveResult.providerId,
        candidates,
        matchedEntryIds: candidates.map((item): string => item.recordId),
    };
}

/**
 * 功能：把主数据条目映射为检索候选。
 * @param entries 主数据条目。
 * @param memoryPercentByEntryId 记忆度映射。
 * @returns 检索候选列表。
 */
function mapToRetrievalCandidates(
    entries: MemoryEntry[],
    memoryPercentByEntryId?: Map<string, number>,
): RetrievalCandidate[] {
    return entries.map((entry: MemoryEntry, index: number): RetrievalCandidate => ({
        candidateId: `candidate_${index + 1}`,
        entryId: entry.entryId,
        schemaId: entry.entryType,
        title: entry.title,
        summary: entry.summary || entry.detail,
        updatedAt: entry.updatedAt,
        memoryPercent: clampPercent(memoryPercentByEntryId?.get(entry.entryId) ?? 60),
    }));
}

/**
 * 功能：限制记忆度百分比。
 * @param value 原始值。
 * @returns 0~100 百分比值。
 */
function clampPercent(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

/**
 * 功能：标准化文本。
 * @param value 原始值。
 * @returns 标准化文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}
