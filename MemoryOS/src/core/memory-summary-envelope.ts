import type { DBSummary } from '../db/db';
import type { MemoryCardDraft, MemoryCardLane, MemoryCardTtl, MemorySummaryEnvelope } from '../../../SDK/stx';
import { formatSummaryMemoryText } from './memory-card-text';

const CURRENT_STATE_PATTERNS: RegExp[] = [
    /当前/,
    /现在/,
    /仍然/,
    /已经/,
    /处于/,
    /正在/,
    /status/i,
    /current/i,
    /ongoing/i,
];

const EVENT_PATTERNS: RegExp[] = [
    /发生/,
    /推进/,
    /结果/,
    /冲突/,
    /达成/,
    /失去/,
    /获得/,
    /event/i,
    /changed?/i,
    /result/i,
    /conflict/i,
];

/**
 * 功能：将任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 去除多余空白后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：按摘要层级推断默认卡片层级。
 * @param level 摘要层级。
 * @returns 默认记忆卡层级。
 */
/*
    return level === 'arc' ? 'state' : 'event';
*/

/**
 * 功能：按记忆卡层级推断生命周期。
 * @param lane 记忆卡层级。
 * @returns 默认生命周期。
 */
function inferLaneTtl(lane: MemoryCardLane): MemoryCardTtl {
    if (lane === 'state') {
        return 'short';
    }
    if (lane === 'event' || lane === 'relationship') {
        return 'medium';
    }
    return 'long';
}

/**
 * 功能：将摘要内容拆成句子级片段。
 * @param content 摘要正文。
 * @returns 规整后的句子列表。
 */
function splitSummarySentences(content: string): string[] {
    const normalized = normalizeText(content);
    if (!normalized) {
        return [];
    }
    return normalized
        .split(/(?<=[。！？；.!?;])/)
        .map((item: string): string => normalizeText(item))
        .filter(Boolean);
}

/**
 * 功能：按模式匹配从句子中提取更聚焦的片段。
 * @param sentences 句子列表。
 * @param patterns 模式列表。
 * @returns 命中的句子列表。
 */
function pickSummarySentences(sentences: string[], patterns: RegExp[]): string[] {
    return sentences.filter((sentence: string): boolean => patterns.some((pattern: RegExp): boolean => pattern.test(sentence)));
}

/**
 * 功能：为摘要草稿生成主体名称。
 * @param summary 摘要记录。
 * @returns 主体名称。
 */
function inferSummarySubject(summary: DBSummary): string {
    return normalizeText(summary.title) || normalizeText(summary.content).slice(0, 24) || '摘要记忆';
}

/**
 * 功能：限制摘要卡正文长度，避免一张卡塞入多段信息。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 截断后的文本。
 */
function clampSummaryText(value: string, maxLength: number = 220): string {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(24, maxLength - 1))}…`;
}

/**
 * 功能：构建摘要记忆卡草稿。
 * @param summary 摘要记录。
 * @param lane 记忆卡层级。
 * @param title 卡片标题。
 * @param memoryText 卡片正文。
 * @param evidenceText 证据文本。
 * @returns 记忆卡草稿；若正文为空则返回 null。
 */
function createSummaryDraft(
    summary: DBSummary,
    lane: MemoryCardLane,
    title: string,
    memoryText: string,
    evidenceText: string,
): MemoryCardDraft | null {
    const normalizedMemoryText = clampSummaryText(memoryText);
    if (!normalizedMemoryText) {
        return null;
    }
    const subject = inferSummarySubject(summary);
    const normalizedTitle = normalizeText(title) || subject;
    return {
        scope: 'chat',
        lane,
        subject,
        title: normalizedTitle,
        memoryText: normalizedMemoryText,
        evidenceText: normalizeText(evidenceText) || null,
        entityKeys: [],
        keywords: Array.from(new Set([
            subject,
            normalizedTitle,
            normalizeText(summary.level),
            ...(Array.isArray(summary.keywords) ? summary.keywords.map((item: string): string => normalizeText(item)) : []),
        ])).filter(Boolean).slice(0, 12),
        importance: Math.max(0.6, Math.min(0.92, Number(summary.importance ?? summary.salience ?? summary.encodeScore ?? 0.72) || 0.72)),
        confidence: Math.max(0.72, Math.min(0.96, Number(summary.encodeScore ?? 0.78) || 0.78)),
        ttl: inferLaneTtl(lane),
        replaceKey: lane === 'state' ? `${subject}:${summary.level}` : null,
        sourceRefs: [summary.summaryId],
        sourceRecordKey: summary.summaryId,
        sourceRecordKind: 'summary',
        ownerActorKey: normalizeText(summary.ownerActorKey) || null,
        participantActorKeys: [],
        validFrom: Number(summary.createdAt ?? 0) || undefined,
        validTo: undefined,
    };
}

/**
 * 功能：按层级构建摘要 fallback 所需的记忆卡草稿。
 * @param summary 摘要记录。
 * @returns 默认的记忆卡草稿数组。
 */
export function buildMemoryCardDraftsFromSummary(summary: DBSummary): MemoryCardDraft[] {
    const subject = inferSummarySubject(summary);
    const sentences = splitSummarySentences(summary.content);
    const stateSentences = pickSummarySentences(sentences, CURRENT_STATE_PATTERNS);
    const eventSentences = pickSummarySentences(sentences, EVENT_PATTERNS);
    const fallbackLead = formatSummaryMemoryText(summary);
    const drafts: Array<MemoryCardDraft | null> = [];

    if (summary.level === 'arc') {
        drafts.push(createSummaryDraft(
            summary,
            'state',
            `${subject}·阶段状态`,
            `${subject}的阶段状态：${stateSentences.join('') || fallbackLead}`,
            fallbackLead,
        ));
    } else {
        drafts.push(createSummaryDraft(
            summary,
            'event',
            `${subject}·事件`,
            `${subject}的关键进展：${eventSentences.join('') || sentences.slice(0, 2).join('') || fallbackLead}`,
            fallbackLead,
        ));
    }

    if (stateSentences.length > 0) {
        drafts.push(createSummaryDraft(
            summary,
            'state',
            `${subject}·当前状态`,
            `${subject}当前的状态：${stateSentences.join('')}`,
            fallbackLead,
        ));
    }

    if (eventSentences.length > 0) {
        drafts.push(createSummaryDraft(
            summary,
            'event',
            `${subject}·变化事件`,
            `${subject}经历的变化：${eventSentences.join('')}`,
            fallbackLead,
        ));
    }

    const filtered = drafts.filter((item: MemoryCardDraft | null): item is MemoryCardDraft => item != null);
    const laneMap = new Map<MemoryCardLane, MemoryCardDraft>();
    filtered.forEach((draft: MemoryCardDraft): void => {
        if (!laneMap.has(draft.lane)) {
            laneMap.set(draft.lane, draft);
        }
    });
    return Array.from(laneMap.values());
}

/**
 * 功能：补齐摘要入口缺失的关键记忆卡层级。
 * @param summary 摘要记录。
 * @param memoryCards 外部提供的候选卡。
 * @returns 合并后的记忆卡草稿数组。
 */
function mergeSummaryCards(summary: DBSummary, memoryCards?: MemoryCardDraft[] | null): MemoryCardDraft[] {
    const providedCards = Array.isArray(memoryCards)
        ? memoryCards.filter((item: MemoryCardDraft): boolean => normalizeText(item.memoryText).length > 0)
        : [];
    const fallbackCards = buildMemoryCardDraftsFromSummary(summary);
    const laneSet = new Set<MemoryCardLane>(providedCards.map((item: MemoryCardDraft): MemoryCardLane => item.lane));
    const merged = [...providedCards];
    fallbackCards.forEach((draft: MemoryCardDraft): void => {
        if (!laneSet.has(draft.lane)) {
            merged.push(draft);
            laneSet.add(draft.lane);
        }
    });
    return merged;
}

/**
 * 功能：把摘要与记忆卡草稿统一封装为同一出口。
 * @param summary 摘要记录。
 * @param memoryCards 外部补充的记忆卡草稿。
 * @returns 统一的摘要封装。
 */
export function buildMemorySummaryEnvelope(
    summary: DBSummary,
    memoryCards?: MemoryCardDraft[] | null,
): MemorySummaryEnvelope {
    return {
        summary: formatSummaryMemoryText(summary),
        memoryCards: mergeSummaryCards(summary, memoryCards),
    };
}
