import type { MemoryEntry, RoleEntryMemory } from '../types';
import type { RetrievalCandidate, RetrievalResultItem } from '../memory-retrieval';
import { getSharedRetrievalService } from '../runtime/vector-runtime';
import {
    buildCityCompareKey,
    buildCompareKey as buildUnifiedCompareKey,
    buildLocationCompareKey,
    buildNationCompareKey,
    buildOrganizationCompareKey,
    buildRelationshipCompareKey,
} from '../core/compare-key';
import { projectMemoryRetentionCore, type MemoryRetentionProjection } from '../core/memory-retention-core';
import { projectMemorySemanticRecord, resolveSemanticKindLabel } from '../core/memory-semantic';

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
    compareKey: string;
    aliases: string[];
    lifecycleStatus: 'active' | 'invalidated' | 'merged' | 'archived';
    status: 'active' | 'invalidated' | 'merged' | 'archived';
    updatedAt: number;
    sourceHint?: string;
    parentRefs?: string[];
    hierarchyRefs?: string[];
}

/**
 * 功能：候选旧记录解析输入。
 */
export interface ResolveCandidateRecordsInput {
    query: string;
    candidateTypes: string[];
    entries: MemoryEntry[];
    memoryPercentByEntryId?: Map<string, number>;
    roleMemories?: RoleEntryMemory[];
    maxCandidatesHardCap?: number;
    candidateTextBudgetChars?: number;
    rulePackMode?: 'native' | 'perocore' | 'hybrid';
}

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
    const retrievalCandidates = mapToRetrievalCandidates(input.entries, input.memoryPercentByEntryId, input.roleMemories);
    const retrieveResult = await getSharedRetrievalService().searchHybrid({
        query: input.query,
        candidates: retrievalCandidates,
        rulePackMode: input.rulePackMode,
        recallConfig: {
            topK: maxCandidatesHardCap,
        },
    });

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
        const candidateStatus = resolveCandidateStatus(item.candidate);
        candidates.push({
            candidateId: `cand_${candidates.length + 1}`,
            recordId: item.candidate.entryId,
            targetKind: item.candidate.schemaId,
            schemaId: item.candidate.schemaId,
            title: normalizeText(item.candidate.title) || '未命名记忆',
            summary: candidateText || normalizeText(item.candidate.title),
            entityKeys: buildEntityKeys(item),
            compareKey: buildCompareKey(
                item.candidate.schemaId,
                normalizeText(item.candidate.title),
                extractCandidateFields(item.candidate),
            ),
            aliases: buildAliases(item.candidate),
            lifecycleStatus: candidateStatus,
            status: candidateStatus,
            updatedAt: Number(item.candidate.updatedAt ?? 0) || 0,
            sourceHint: buildSourceHint(item.candidate),
            parentRefs: buildParentRefs(item.candidate),
            hierarchyRefs: buildHierarchyRefs(item.candidate),
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
    roleMemories?: RoleEntryMemory[],
): RetrievalCandidate[] {
    const retentionMap = buildEntryRetentionMap(entries, roleMemories);
    return entries.map((entry: MemoryEntry, index: number): RetrievalCandidate => ({
        ...buildSummaryRetrievalCandidate(entry, index, memoryPercentByEntryId, retentionMap.get(entry.entryId)),
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
    if (candidate.semantic) {
        return resolveSemanticKindLabel(candidate.semantic.semanticKind);
    }
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
    retention = projectMemoryRetentionCore({ forgotten: false, memoryPercent: memoryPercentByEntryId?.get(entry.entryId) ?? 60, title: entry.title, summary: entry.summary || entry.detail }),
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
    const semantic = projectMemorySemanticRecord({
        entryType: entry.entryType,
        ongoing: entry.ongoing,
        detailPayload: payload,
    });
    return {
        candidateId: `candidate_${index + 1}`,
        entryId: entry.entryId,
        schemaId: entry.entryType,
        title: entry.title,
        summary: entry.summary || entry.detail,
        updatedAt: entry.updatedAt,
        memoryPercent: retention.effectiveMemoryPercent,
        category: String(entry.category ?? ''),
        tags: entry.tags,
        actorKeys: [sourceActorKey, targetActorKey].filter(Boolean),
        relationKeys: Array.from(new Set([
            ...normalizeLooseStringArray(payload.relationKeys ?? fields.relationKeys),
            ...(sourceActorKey && targetActorKey ? [buildRelationshipCompareKey(sourceActorKey, targetActorKey, relationTag)] : []),
            ...(relationTag ? [relationTag] : []),
        ])),
        participantActorKeys: participants,
        locationKey: locationKey || undefined,
        worldKeys: entry.entryType.startsWith('world_') ? Array.from(new Set([...worldKeys, entry.title])) : worldKeys,
        aliasTexts: aliases,
        detailPayload: payload,
        semantic,
        retention,
        forgettingTier: retention.forgottenLevel,
        shadowTriggered: retention.shadowTriggered,
        shadowRecallPenalty: retention.shadowRecallPenalty,
        ongoing: entry.ongoing,
        timeContext: entry.timeContext,
    };
}

function buildEntryRetentionMap(
    entries: MemoryEntry[],
    roleMemories?: RoleEntryMemory[],
): Map<string, MemoryRetentionProjection> {
    const entryMap = new Map(entries.map((entry: MemoryEntry): [string, MemoryEntry] => [entry.entryId, entry]));
    const result = new Map<string, MemoryRetentionProjection>();
    for (const row of roleMemories ?? []) {
        const entry = entryMap.get(row.entryId);
        const projection = projectMemoryRetentionCore({
            forgotten: row.forgotten,
            memoryPercent: row.memoryPercent,
            title: entry?.title,
            summary: entry?.summary || entry?.detail,
        });
        const current = result.get(row.entryId);
        result.set(row.entryId, resolveEntryLevelRetention(current, projection));
    }
    return result;
}

function resolveEntryLevelRetention(
    current: MemoryRetentionProjection | undefined,
    next: MemoryRetentionProjection,
): MemoryRetentionProjection {
    if (!current) {
        return next;
    }
    const order: Record<string, number> = {
        active: 3,
        shadow_forgotten: 2,
        hard_forgotten: 1,
    };
    if ((order[next.forgottenLevel] ?? 0) === (order[current.forgottenLevel] ?? 0)) {
        return next.retentionScore >= current.retentionScore ? next : current;
    }
    return (order[next.forgottenLevel] ?? 0) > (order[current.forgottenLevel] ?? 0)
        ? next
        : current;
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
 * 功能：构建候选记忆的统一比较键（委托给 core/compare-key）。
 * @param schemaId 条目类型。
 * @param title 条目标题。
 * @param fields 可选字段用于限定 compareKey。
 * @returns 统一比较键。
 */
function buildCompareKey(schemaId: string, title: string, fields?: Record<string, unknown>): string {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) {
        return '';
    }
    return buildUnifiedCompareKey(schemaId, normalizedTitle, fields);
}

/**
 * 功能：从候选记忆中提取别名列表。
 * @param candidate 检索候选。
 * @returns 别名列表。
 */
function buildAliases(candidate: RetrievalCandidate): string[] {
    return normalizeLooseStringArray((candidate as unknown as { aliasTexts?: unknown }).aliasTexts);
}

/**
 * 功能：从候选记忆中提取 detailPayload.fields，供统一 compareKey 生成使用。
 * @param candidate 检索候选。
 * @returns 字段映射。
 */
function extractCandidateFields(candidate: RetrievalCandidate): Record<string, unknown> {
    const payload = toRecord((candidate as unknown as { detailPayload?: unknown }).detailPayload);
    return toRecord(payload.fields);
}

/**
 * 功能：从候选记忆中提取父级引用。
 * @param candidate 检索候选。
 * @returns 父级引用列表。
 */
function buildParentRefs(candidate: RetrievalCandidate): string[] {
    const payload = toRecord((candidate as unknown as { detailPayload?: unknown }).detailPayload);
    const fields = toRecord(payload.fields);
    const refs: string[] = [];
    const parentOrg = normalizeText(fields.parentOrganization);
    if (parentOrg) {
        refs.push(buildOrganizationCompareKey(parentOrg, {
            qualifier: normalizeText(fields.city ?? fields.nation),
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const parentLocation = normalizeText(fields.parentLocation);
    if (parentLocation) {
        refs.push(buildLocationCompareKey(parentLocation, {
            qualifier: normalizeText(fields.city ?? fields.nation),
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const nation = normalizeText(fields.nation);
    if (nation) {
        refs.push(buildNationCompareKey(nation, {
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const city = normalizeText(fields.city);
    if (city) {
        refs.push(buildCityCompareKey(city, {
            qualifier: nation,
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    return refs;
}

/**
 * 功能：从候选记忆中提取层级引用。
 * @param candidate 检索候选。
 * @returns 层级引用列表。
 */
function buildHierarchyRefs(candidate: RetrievalCandidate): string[] {
    const payload = toRecord((candidate as unknown as { detailPayload?: unknown }).detailPayload);
    const fields = toRecord(payload.fields);
    const refs: string[] = [];
    const headquartersCity = normalizeText(fields.headquartersCity);
    if (headquartersCity) {
        refs.push(buildCityCompareKey(headquartersCity, {
            qualifier: normalizeText(fields.headquartersNation),
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const headquartersNation = normalizeText(fields.headquartersNation);
    if (headquartersNation) {
        refs.push(buildNationCompareKey(headquartersNation, {
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const headquartersLocation = normalizeText(fields.headquartersLocation);
    if (headquartersLocation) {
        refs.push(buildLocationCompareKey(headquartersLocation, {
            qualifier: normalizeText(fields.headquartersCity ?? fields.headquartersNation),
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const controllingOrganization = normalizeText(fields.controllingOrganization);
    if (controllingOrganization) {
        refs.push(buildOrganizationCompareKey(controllingOrganization, {
            qualifier: normalizeText(fields.headquartersCity ?? fields.headquartersNation),
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    const capital = normalizeText(fields.capital);
    if (capital) {
        refs.push(buildCityCompareKey(capital, {
            qualifier: headquartersNation,
            aliases: normalizeLooseStringArray(fields.aliases),
        }));
    }
    return refs;
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
