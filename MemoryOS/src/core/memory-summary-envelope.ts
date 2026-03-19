import type { DBSummary } from '../db/db';
import type { MemoryCardDraft, MemoryCardLane, MemoryCardTtl, MemorySummaryEnvelope } from '../../../SDK/stx';
import { formatSummaryMemoryText } from './memory-card-text';

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inferSummaryLane(level: DBSummary['level']): MemoryCardLane {
    switch (level) {
        case 'arc':
            return 'state';
        case 'scene':
            return 'event';
        case 'message':
        default:
            return 'event';
    }
}

function inferSummaryTtl(level: DBSummary['level']): MemoryCardTtl {
    switch (level) {
        case 'arc':
            return 'long';
        case 'scene':
            return 'medium';
        case 'message':
        default:
            return 'short';
    }
}

/**
 * 功能：把摘要记录转换成可复用的记忆卡草稿。
 * @param summary 摘要记录。
 * @returns 记忆卡草稿。
 */
export function buildMemoryCardDraftFromSummary(summary: DBSummary): MemoryCardDraft {
    const title = normalizeText(summary.title) || normalizeText(summary.content).slice(0, 24) || '摘要记忆';
    const memoryText = formatSummaryMemoryText(summary);
    const keywords = Array.from(new Set([
        title,
        normalizeText(summary.level),
        ...(Array.isArray(summary.keywords) ? summary.keywords.map((item: string): string => normalizeText(item)) : []),
    ])).filter(Boolean).slice(0, 8);
    return {
        scope: 'chat',
        lane: inferSummaryLane(summary.level),
        subject: title,
        title,
        memoryText,
        evidenceText: memoryText || null,
        entityKeys: [],
        keywords,
        importance: 0.55,
        confidence: 0.65,
        ttl: inferSummaryTtl(summary.level),
        replaceKey: summary.level === 'arc' ? title : null,
        sourceRefs: [summary.summaryId],
        sourceRecordKey: summary.summaryId,
        sourceRecordKind: 'summary',
        ownerActorKey: summary.ownerActorKey ?? null,
        participantActorKeys: [],
        validFrom: Number(summary.createdAt ?? 0) || undefined,
        validTo: undefined,
    };
}

/**
 * 功能：把摘要记录和记忆卡草稿合并成统一出口。
 * @param summary 摘要记录。
 * @param memoryCards 额外的记忆卡草稿。
 * @returns 摘要与记忆卡的统一封装。
 */
export function buildMemorySummaryEnvelope(
    summary: DBSummary,
    memoryCards?: MemoryCardDraft[] | null,
): MemorySummaryEnvelope {
    const cards = Array.isArray(memoryCards) && memoryCards.length > 0
        ? memoryCards
        : [buildMemoryCardDraftFromSummary(summary)];
    return {
        summary: formatSummaryMemoryText(summary),
        memoryCards: cards,
    };
}
