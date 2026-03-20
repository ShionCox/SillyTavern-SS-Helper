import { VectorManager } from '../../vector/vector-manager';
import type { RecallCandidate } from '../../types';
import { buildScoredCandidate, clamp01, loadFacts, loadRecentSummaries, normalizeText, readSourceLimit, type FactRecord, type RecallSourceContext, type SummaryRecord } from './shared';
import { buildMemoryCardDraftsFromFact, formatFactMemoryTextForDisplay } from '../../core/memory-card-text';
import type { DBFact } from '../../db/db';

type MemoryCardSearchHit = {
    cardId: string;
    content: string;
    score: number;
    metadata?: {
        sourceRecordKey?: string;
        sourceRecordKind?: string;
        ownerActorKey?: string | null;
        sourceScope?: string;
        memoryType?: string;
        memorySubtype?: string;
        participantActorKeys?: string[];
    };
    createdAt?: number;
};

function buildFactRecordKeyMap(facts: FactRecord[]): Map<string, FactRecord> {
    return facts.reduce<Map<string, FactRecord>>((result: Map<string, FactRecord>, fact: FactRecord): Map<string, FactRecord> => {
        const key = normalizeText(fact.factKey);
        if (key && !result.has(key)) {
            result.set(key, fact);
        }
        return result;
    }, new Map<string, FactRecord>());
}

function buildSummaryRecordKeyMap(summaries: SummaryRecord[]): Map<string, SummaryRecord> {
    return summaries.reduce<Map<string, SummaryRecord>>((result: Map<string, SummaryRecord>, summary: SummaryRecord): Map<string, SummaryRecord> => {
        const key = normalizeText(summary.summaryId);
        if (key && !result.has(key)) {
            result.set(key, summary);
        }
        return result;
    }, new Map<string, SummaryRecord>());
}

/**
 * 功能：读取记忆卡向量来源元数据。
 * @param hit 向量命中。
 * @returns 来源元数据；无效时返回 null。
 */
function readMemoryCardSourceMetadata(hit: MemoryCardSearchHit): {
    sourceRecordKey: string | null;
    sourceRecordKind: 'fact' | 'summary' | 'semantic_seed';
    ownerActorKey: string | null;
    sourceScope?: string;
    memoryType?: string;
    memorySubtype?: string;
    participantActorKeys: string[];
} | null {
    const metadata = hit.metadata ?? {};
    const sourceRecordKey = normalizeText(metadata.sourceRecordKey);
    const sourceRecordKind = normalizeText(metadata.sourceRecordKind).toLowerCase();
    if (sourceRecordKind !== 'fact' && sourceRecordKind !== 'summary' && sourceRecordKind !== 'semantic_seed') {
        return null;
    }
    return {
        sourceRecordKey: sourceRecordKey || null,
        sourceRecordKind: sourceRecordKind as 'fact' | 'summary' | 'semantic_seed',
        ownerActorKey: normalizeText(metadata.ownerActorKey) || null,
        sourceScope: normalizeText(metadata.sourceScope) || undefined,
        memoryType: normalizeText(metadata.memoryType) || undefined,
        memorySubtype: normalizeText(metadata.memorySubtype) || undefined,
        participantActorKeys: Array.isArray(metadata.participantActorKeys)
            ? metadata.participantActorKeys.map((item: unknown): string => normalizeText(item)).filter(Boolean)
            : [],
    };
}

/**
 * 功能：收集记忆卡召回候选。
 * @param context 召回上下文。
 * @returns 召回候选列表。
 */
export async function collectMemoryCardRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    if (!context.vectorGate?.enabled) {
        return [];
    }
    const allowedLanes = new Set(
        Array.isArray(context.vectorGate.lanes)
            ? context.vectorGate.lanes.map((item: unknown): string => normalizeText(item).toLowerCase()).filter(Boolean)
            : [],
    );
    if (allowedLanes.size <= 0) {
        return [];
    }
    const [facts, summaries] = await Promise.all([
        loadFacts(context),
        loadRecentSummaries(context),
    ]);
    const sourceLimit = readSourceLimit(context, 'vector', 5);
    const vectorManager = new VectorManager(context.chatKey);
    const rawHits = await vectorManager.search(
        context.query,
        Math.max(sourceLimit * 2, Number(context.plan.fineTopK ?? 8)),
        {
            lanes: Array.from(allowedLanes) as string[],
            activeOnly: true,
        },
    );
    if (rawHits.length <= 0) {
        return [];
    }

    const factMap = buildFactRecordKeyMap(facts);
    const summaryMap = buildSummaryRecordKeyMap(summaries);
    const candidates: RecallCandidate[] = [];

    for (const hit of rawHits.slice(0, sourceLimit) as MemoryCardSearchHit[]) {
        const lane = normalizeText(hit.metadata?.memoryType).toLowerCase();
        if (lane && !allowedLanes.has(lane)) {
            continue;
        }
        const sourceMeta = readMemoryCardSourceMetadata(hit);
        if (!sourceMeta) {
            continue;
        }
        if (sourceMeta.sourceRecordKind === 'semantic_seed') {
            const lane = normalizeText(sourceMeta.memoryType).toLowerCase();
            const normalizedRaw = normalizeText(hit.content);
            if (!normalizedRaw) {
                continue;
            }
            const candidate = buildScoredCandidate(context, {
                candidateId: `memory-card:${hit.cardId}`,
                recordKey: normalizeText(sourceMeta.sourceRecordKey || hit.cardId),
                recordKind: lane === 'relationship'
                    ? 'relationship'
                    : (lane === 'state' || lane === 'rule')
                        ? 'state'
                        : 'fact',
                source: 'memory_card',
                sectionHint: (lane === 'rule' || lane === 'state') && context.plan.sections.includes('SUMMARY')
                    ? 'SUMMARY'
                    : context.plan.sections.includes('FACTS')
                        ? 'FACTS'
                        : context.plan.sections[0] ?? null,
                title: normalizeText(sourceMeta.memoryType || 'semantic_seed_memory'),
                rawText: normalizedRaw,
                confidence: 0.82,
                updatedAt: Number(hit.createdAt ?? Date.now()),
                vectorScore: clamp01(hit.score),
                continuityScore: 0.86,
                memoryType: sourceMeta.memoryType as any,
                memorySubtype: sourceMeta.memorySubtype as any,
                sourceScope: sourceMeta.sourceScope as any,
                ownerActorKey: sourceMeta.ownerActorKey,
                participantActorKeys: sourceMeta.participantActorKeys,
                extraReasonCodes: ['memory_card_hit', 'memory_card_seed_hit'],
            });
            if (candidate) {
                candidates.push(candidate);
            }
            continue;
        }
        if (sourceMeta.sourceRecordKind === 'fact') {
            const fact = sourceMeta.sourceRecordKey ? factMap.get(sourceMeta.sourceRecordKey) ?? null : null;
            if (!fact) {
                continue;
            }
            const rawText = buildMemoryCardDraftsFromFact(fact as unknown as DBFact).map((item): string => item.memoryText).join('\n') || formatFactMemoryTextForDisplay(fact as unknown as DBFact);
            const candidate = buildScoredCandidate(context, {
                candidateId: `memory-card:${hit.cardId}`,
                recordKey: normalizeText(fact.factKey || hit.cardId),
                recordKind: 'fact',
                source: 'memory_card',
                sectionHint: context.plan.sections.includes('FACTS') ? 'FACTS' : context.plan.sections[0] ?? null,
                title: normalizeText(fact.type || fact.path || 'memory_card_fact'),
                rawText,
                confidence: Number(fact.confidence ?? fact.encodeScore ?? 0.6),
                updatedAt: Number(fact.updatedAt ?? Date.now()),
                vectorScore: clamp01(hit.score),
                continuityScore: 0.82,
                memoryType: fact.memoryType,
                memorySubtype: fact.memorySubtype,
                sourceScope: fact.sourceScope,
                ownerActorKey: fact.ownerActorKey ?? null,
                participantActorKeys: sourceMeta.participantActorKeys,
                extraReasonCodes: ['memory_card_hit'],
            });
            if (candidate) {
                candidates.push(candidate);
            }
            continue;
        }
        const summary = sourceMeta.sourceRecordKey ? summaryMap.get(sourceMeta.sourceRecordKey) ?? null : null;
        if (!summary) {
            continue;
        }
        const candidate = buildScoredCandidate(context, {
            candidateId: `memory-card:${hit.cardId}`,
            recordKey: normalizeText(summary.summaryId || hit.cardId),
            recordKind: 'summary',
            source: 'memory_card',
            sectionHint: context.plan.sections.includes('SUMMARY')
                ? 'SUMMARY'
                : context.plan.sections.includes('SHORT_SUMMARY')
                    ? 'SHORT_SUMMARY'
                    : context.plan.sections.includes('LAST_SCENE')
                        ? 'LAST_SCENE'
                        : context.plan.sections[0] ?? null,
            title: normalizeText(summary.title || `${summary.level ?? 'summary'} memory_card`),
            rawText: `${summary.title ? `${summary.title}: ` : ''}${summary.content ?? ''}`,
            confidence: Number(summary.encodeScore ?? 0.62),
            updatedAt: Number(summary.createdAt ?? Date.now()),
            vectorScore: clamp01(hit.score),
            continuityScore: 0.86,
            memoryType: summary.memoryType,
            memorySubtype: summary.memorySubtype,
            sourceScope: summary.sourceScope,
            ownerActorKey: summary.ownerActorKey ?? null,
            participantActorKeys: sourceMeta.participantActorKeys,
            extraReasonCodes: ['memory_card_hit'],
        });
        if (candidate) {
            candidates.push(candidate);
        }
    }

    return candidates;
}
