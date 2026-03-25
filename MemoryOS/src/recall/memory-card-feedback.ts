import { db, type DBMemoryCard, type DBMemoryRecallLog } from '../db/db';
import { normalizeMemoryText } from '../core/memory-intelligence';

export interface MemoryCardUsageFeedback {
    selectedHits: number;
    lastSelectedAt: number | null;
    lastScore: number | null;
}

export interface MemoryCardDiagnosticsFeedback {
    sourceMissing: boolean;
    needsRebuild: boolean;
    duplicateCount: number;
}

function normalizeKey(value: unknown): string {
    return normalizeMemoryText(value).toLowerCase();
}

/**
 * 功能：按 cardId 优先聚合召回日志中的使用反馈。
 * 参数：
 *   rows：召回日志行。
 * 返回：
 *   卡级反馈映射。
 */
export function buildMemoryCardUsageFeedbackIndex(rows: DBMemoryRecallLog[]): Record<string, MemoryCardUsageFeedback> {
    const index: Record<string, MemoryCardUsageFeedback> = {};
    const sortedRows = [...rows].sort((left: DBMemoryRecallLog, right: DBMemoryRecallLog): number => Number(right.ts ?? 0) - Number(left.ts ?? 0));
    for (const row of sortedRows) {
        const cardId = normalizeKey(row.cardId);
        if (!cardId) {
            continue;
        }
        if (!index[cardId]) {
            index[cardId] = {
                selectedHits: 0,
                lastSelectedAt: null,
                lastScore: null,
            };
        }
        const bucket = index[cardId];
        if (row.selected) {
            bucket.selectedHits += 1;
            if (bucket.lastSelectedAt == null) {
                bucket.lastSelectedAt = Number(row.ts ?? 0) || null;
            }
        }
        if (bucket.lastScore == null) {
            const score = Number(row.score ?? NaN);
            bucket.lastScore = Number.isFinite(score) ? score : null;
        }
    }
    return index;
}

function readSourceMissing(card: DBMemoryCard, factSet: Set<string>, summarySet: Set<string>): boolean {
    if (card.sourceRecordKind === 'semantic_seed') {
        return false;
    }
    const sourceKey = normalizeKey(card.sourceRecordKey);
    if (!sourceKey) {
        return true;
    }
    if (card.sourceRecordKind === 'fact') {
        return !factSet.has(sourceKey);
    }
    if (card.sourceRecordKind === 'summary') {
        return !summarySet.has(sourceKey);
    }
    return false;
}

/**
 * 功能：根据 memory card 与其源记录状态构建诊断反馈映射。
 * 参数：
 *   cards：候选卡片列表。
 * 返回：
 *   卡级诊断映射。
 */
export async function buildMemoryCardDiagnosticsFeedbackIndex(cards: DBMemoryCard[]): Promise<Record<string, MemoryCardDiagnosticsFeedback>> {
    const sourceFactKeys = Array.from(new Set(
        cards
            .filter((card: DBMemoryCard): boolean => card.sourceRecordKind === 'fact')
            .map((card: DBMemoryCard): string => normalizeKey(card.sourceRecordKey))
            .filter(Boolean),
    ));
    const sourceSummaryKeys = Array.from(new Set(
        cards
            .filter((card: DBMemoryCard): boolean => card.sourceRecordKind === 'summary')
            .map((card: DBMemoryCard): string => normalizeKey(card.sourceRecordKey))
            .filter(Boolean),
    ));
    const [facts, summaries] = await Promise.all([
        sourceFactKeys.length > 0 ? db.facts.bulkGet(sourceFactKeys) : Promise.resolve([]),
        sourceSummaryKeys.length > 0 ? db.summaries.bulkGet(sourceSummaryKeys) : Promise.resolve([]),
    ]);
    const factSet = new Set((facts ?? []).map((item) => normalizeKey(item?.factKey)).filter(Boolean));
    const summarySet = new Set((summaries ?? []).map((item) => normalizeKey(item?.summaryId)).filter(Boolean));
    const duplicateMap = cards.reduce<Map<string, number>>((map: Map<string, number>, card: DBMemoryCard): Map<string, number> => {
        const key = normalizeKey(card.memoryText);
        map.set(key, Number(map.get(key) ?? 0) + 1);
        return map;
    }, new Map<string, number>());
    return cards.reduce<Record<string, MemoryCardDiagnosticsFeedback>>((result: Record<string, MemoryCardDiagnosticsFeedback>, card: DBMemoryCard): Record<string, MemoryCardDiagnosticsFeedback> => {
        const cardId = normalizeKey(card.cardId);
        if (!cardId) {
            return result;
        }
        const duplicateCount = Number(duplicateMap.get(normalizeKey(card.memoryText)) ?? 1) || 1;
        const sourceMissing = readSourceMissing(card, factSet, summarySet);
        result[cardId] = {
            sourceMissing,
            needsRebuild: sourceMissing || card.status !== 'active',
            duplicateCount: Math.max(1, duplicateCount),
        };
        return result;
    }, {});
}
