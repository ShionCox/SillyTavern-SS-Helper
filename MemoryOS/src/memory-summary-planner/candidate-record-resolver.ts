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
    title: string;
    summary: string;
    entityKeys: string[];
    status: 'active' | 'invalidated' | 'merged' | 'archived';
    updatedAt: number;
    sourceHint?: string;
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
    rulePackMode?: 'native' | 'perocore' | 'hybrid';
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
        rulePackMode: input.rulePackMode,
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
            title: normalizeText(item.candidate.title) || '未命名记忆',
            summary: candidateText || normalizeText(item.candidate.title),
            entityKeys: buildEntityKeys(item),
            status: resolveCandidateStatus(item.candidate),
            updatedAt: Number(item.candidate.updatedAt ?? 0) || 0,
            sourceHint: buildSourceHint(item.candidate),
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
        ...buildSummaryRetrievalCandidate(entry, index, memoryPercentByEntryId),
    }));
}

/**
 * 功能：构建候选记忆的实体键列表。
 * @param item 检索结果项。
 * @returns 实体键列表。
 */
function buildEntityKeys(item: RetrievalResultItem): string[] {
    const candidate = item.candidate;
    return Array.from(new Set([
        ...(candidate.actorKeys ?? []),
        ...(candidate.participantActorKeys ?? []),
        ...(candidate.relationKeys ?? []),
        ...(candidate.worldKeys ?? []),
        String(candidate.locationKey ?? '').trim(),
    ].filter(Boolean)));
}

/**
 * 功能：根据条目 payload 解析候选状态。
 * @param candidate 检索候选。
 * @returns 生命周期状态。
 */
function resolveCandidateStatus(candidate: RetrievalCandidate): SummaryCandidateRecord['status'] {
    const payload = toRecord((candidate as unknown as { detailPayload?: unknown }).detailPayload);
    const lifecycle = toRecord(payload.lifecycle);
    const normalized = normalizeText(lifecycle.status).toLowerCase();
    if (normalized === 'invalidated') {
        return 'invalidated';
    }
    if (normalized === 'merged') {
        return 'merged';
    }
    if (normalized === 'archived') {
        return 'archived';
    }
    return 'active';
}

/**
 * 功能：构建候选记忆来源提示。
 * @param candidate 检索候选。
 * @returns 来源提示。
 */
function buildSourceHint(candidate: RetrievalCandidate): string | undefined {
    const sourceSummaryIds = Array.isArray(candidate.sourceSummaryIds) ? candidate.sourceSummaryIds.filter(Boolean) : [];
    if (sourceSummaryIds.length > 0) {
        return `来自 ${sourceSummaryIds[0]}`;
    }
    const category = normalizeText(candidate.category);
    return category || undefined;
}

/**
 * 功能：构建单条总结检索候选。
 * @param entry 条目。
 * @param index 序号。
 * @param memoryPercentByEntryId 记忆度映射。
 * @returns 检索候选。
 */
function buildSummaryRetrievalCandidate(
    entry: MemoryEntry,
    index: number,
    memoryPercentByEntryId?: Map<string, number>,
): RetrievalCandidate {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const sourceActorKey = normalizeText(payload.sourceActorKey ?? fields.sourceActorKey).toLowerCase();
    const targetActorKey = normalizeText(payload.targetActorKey ?? fields.targetActorKey).toLowerCase();
    const relationTag = normalizeText(fields.relationTag ?? payload.relationTag);
    const participants = normalizeLooseStringArray(payload.participants ?? fields.participants);
    const locationKey = normalizeText(payload.locationKey ?? fields.locationKey ?? payload.location ?? fields.location);
    const worldKeys = normalizeLooseStringArray(payload.worldKeys ?? fields.worldKeys);
    const aliases = normalizeLooseStringArray(payload.aliases ?? fields.aliases);
    return {
        candidateId: `candidate_${index + 1}`,
        entryId: entry.entryId,
        schemaId: entry.entryType,
        title: entry.title,
        summary: entry.summary || entry.detail,
        updatedAt: entry.updatedAt,
        memoryPercent: clampPercent(memoryPercentByEntryId?.get(entry.entryId) ?? 60),
        category: String(entry.category ?? ''),
        tags: entry.tags,
        actorKeys: [sourceActorKey, targetActorKey].filter(Boolean),
        relationKeys: Array.from(new Set([
            ...normalizeLooseStringArray(payload.relationKeys ?? fields.relationKeys),
            ...(sourceActorKey && targetActorKey ? [`relationship:${sourceActorKey}:${targetActorKey}`] : []),
            ...(relationTag ? [relationTag] : []),
        ])),
        participantActorKeys: participants,
        locationKey: locationKey || undefined,
        worldKeys: entry.entryType.startsWith('world_') ? Array.from(new Set([...worldKeys, entry.title])) : worldKeys,
        aliasTexts: aliases,
    };
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

/**
 * 功能：把未知输入安全转成对象。
 * @param value 原始值。
 * @returns 记录对象。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：把未知值解析为宽松字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function normalizeLooseStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item: unknown): string => normalizeText(item)).filter(Boolean);
    }
    const text = normalizeText(value);
    if (!text) {
        return [];
    }
    return text
        .split(/[,，、\n]+/)
        .map((item: string): string => normalizeText(item))
        .filter(Boolean);
}
