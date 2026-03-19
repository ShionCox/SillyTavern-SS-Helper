import { runRerank } from '../../llm/memoryLlmBridge';
import { VectorManager } from '../../vector/vector-manager';
import type { RecallCandidate } from '../../types';
import type { MemorySourceScope, MemorySubtype, MemoryType } from '../../types';
import {
    buildScoredCandidate,
    clamp01,
    loadFacts,
    loadRecentSummaries,
    normalizeText,
    readSourceLimit,
    type FactRecord,
    type RecallSourceContext,
    type SummaryRecord,
} from './shared';
import { formatFactMemoryText } from '../../core/memory-card-text';

type VectorHit = {
    chunkId: string;
    content: string;
    score: number;
    bookId?: string;
    metadata?: Record<string, unknown>;
    createdAt?: number;
};

export interface StrictVectorSourceMetadata {
    sourceRecordKey: string;
    sourceRecordKind: 'fact' | 'summary';
    ownerActorKey: string | null;
    sourceScope?: MemorySourceScope;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    participantActorKeys: string[];
}

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
 * 功能：从向量命中里读取严格源记录 metadata。
 * 参数：
 *   hit：向量命中。
 * 返回：
 *   StrictVectorSourceMetadata | null：严格来源 metadata；若缺少源记录或类型不合法则返回 null。
 */
export function readVectorSourceMetadata(hit: VectorHit): StrictVectorSourceMetadata | null {
    const metadata = (hit.metadata ?? {}) as Record<string, unknown>;
    const sourceScope = normalizeText(metadata.sourceScope).toLowerCase();
    const memoryType = normalizeText(metadata.memoryType).toLowerCase();
    const memorySubtype = normalizeText(metadata.memorySubtype).toLowerCase();
    const sourceRecordKey = normalizeText(metadata.sourceRecordKey);
    const sourceRecordKind = normalizeText(metadata.sourceRecordKind).toLowerCase();
    if (!sourceRecordKey || (sourceRecordKind !== 'fact' && sourceRecordKind !== 'summary')) {
        return null;
    }
    return {
        sourceRecordKey,
        sourceRecordKind,
        ownerActorKey: normalizeText(metadata.ownerActorKey) || null,
        sourceScope: ['self', 'target', 'group', 'world', 'system'].includes(sourceScope) ? (sourceScope as MemorySourceScope) : undefined,
        memoryType: ['identity', 'event', 'relationship', 'world', 'status', 'other'].includes(memoryType) ? (memoryType as MemoryType) : undefined,
        memorySubtype: [
            'identity',
            'trait',
            'preference',
            'bond',
            'emotion_imprint',
            'goal',
            'promise',
            'secret',
            'rumor',
            'major_plot_event',
            'minor_event',
            'combat_event',
            'travel_event',
            'conversation_event',
            'global_rule',
            'city_rule',
            'location_fact',
            'item_rule',
            'faction_rule',
            'world_history',
            'current_scene',
            'current_conflict',
            'temporary_status',
            'other',
        ].includes(memorySubtype) ? (memorySubtype as MemorySubtype) : undefined,
        participantActorKeys: Array.isArray(metadata.participantActorKeys)
            ? metadata.participantActorKeys.map((item: unknown): string => normalizeText(item)).filter(Boolean)
            : [],
    };
}

async function rerankVectorHits(query: string, hits: VectorHit[], enabled: boolean, threshold: number): Promise<VectorHit[]> {
    if (!enabled || hits.length < threshold) {
        return hits;
    }
    const rerank = await runRerank(query, hits.map((hit: VectorHit): string => hit.content), hits.length);
    if (!rerank.ok || !Array.isArray(rerank.results) || rerank.results.length <= 0) {
        return hits;
    }
    return rerank.results
        .map((item: { index: number; score: number }): VectorHit | null => {
            const hit = hits[item.index] ?? null;
            if (!hit) {
                return null;
            }
            return {
                ...hit,
                score: clamp01(Number(item.score ?? hit.score)),
            };
        })
        .filter((item: VectorHit | null): item is VectorHit => item != null)
        .sort((left: VectorHit, right: VectorHit): number => right.score - left.score);
}

export async function collectVectorRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    if (!context.policy.vectorEnabled || context.policy.vectorMode === 'off' || context.policy.vectorMode === 'index_only') {
        return [];
    }
    const [facts, summaries] = await Promise.all([
        loadFacts(context),
        loadRecentSummaries(context),
    ]);
    if (facts.length < Number(context.policy.vectorMinFacts ?? 0) && summaries.length < Number(context.policy.vectorMinSummaries ?? 0)) {
        return [];
    }
    const sourceLimit = readSourceLimit(context, 'vector', 5);
    const vectorManager = new VectorManager(context.chatKey);
    const rawHits = await vectorManager.search(context.query, Math.max(sourceLimit * 2, Number(context.plan.fineTopK ?? 8)));
    if (rawHits.length <= 0) {
        return [];
    }
    const activeHits = await Promise.all(rawHits.map(async (hit: VectorHit): Promise<VectorHit | null> => {
        if (context.chatStateManager && await context.chatStateManager.isVectorChunkArchived(hit.chunkId)) {
            return null;
        }
        return hit;
    }));
    const hits = await rerankVectorHits(
        context.query,
        activeHits.filter((item: VectorHit | null): item is VectorHit => item != null),
        context.policy.vectorMode === 'search_rerank' && context.policy.rerankEnabled !== false,
        Math.max(2, Number(context.policy.rerankThreshold ?? 6)),
    );
    const factMap = buildFactRecordKeyMap(facts);
    const summaryMap = buildSummaryRecordKeyMap(summaries);
    const candidates: RecallCandidate[] = [];

    for (const hit of hits.slice(0, sourceLimit)) {
        const sourceMeta = readVectorSourceMetadata(hit);
        if (!sourceMeta) {
            continue;
        }
        if (sourceMeta.sourceRecordKind === 'fact') {
            const fact = factMap.get(sourceMeta.sourceRecordKey);
            if (!fact) {
                continue;
            }
            const rawText = formatFactMemoryText(fact as FactRecord);
            const candidate = buildScoredCandidate(context, {
                candidateId: `vector:${hit.chunkId}`,
                recordKey: normalizeText(fact.factKey || hit.chunkId),
                recordKind: 'fact',
                source: 'vector',
                sectionHint: context.plan.sections.includes('FACTS') ? 'FACTS' : context.plan.sections[0] ?? null,
                title: normalizeText(fact.type || fact.path || 'vector_fact'),
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
                extraReasonCodes: ['vector_hit', 'vector_source_metadata', context.policy.vectorMode === 'search_rerank' ? 'vector_reranked' : 'vector_search'],
            });
            if (candidate) {
                candidates.push(candidate);
            }
            continue;
        }
        const summary = summaryMap.get(sourceMeta.sourceRecordKey);
        if (!summary) {
            continue;
        }
        const targetSection = context.plan.sections.includes('SUMMARY')
            ? 'SUMMARY'
            : context.plan.sections.includes('SHORT_SUMMARY')
                ? 'SHORT_SUMMARY'
                : context.plan.sections.includes('LAST_SCENE')
                    ? 'LAST_SCENE'
                    : context.plan.sections[0] ?? null;
        const candidate = buildScoredCandidate(context, {
            candidateId: `vector:${hit.chunkId}`,
            recordKey: normalizeText(summary.summaryId || hit.chunkId),
            recordKind: 'summary',
            source: 'vector',
            sectionHint: targetSection,
            title: normalizeText(summary.title || `${summary.level ?? 'summary'} vector`),
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
            extraReasonCodes: ['vector_hit', 'vector_source_metadata', context.policy.vectorMode === 'search_rerank' ? 'vector_reranked' : 'vector_search'],
        });
        if (candidate) {
            candidates.push(candidate);
        }
    }

    return candidates;
}
