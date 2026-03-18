import { db } from '../../db/db';
import { runRerank } from '../../llm/memoryLlmBridge';
import { VectorManager } from '../../vector/vector-manager';
import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    clamp01,
    loadFacts,
    loadRecentSummaries,
    normalizeText,
    readSourceLimit,
    stringifyValue,
    type FactRecord,
    type RecallSourceContext,
    type SummaryRecord,
} from './shared';

type VectorHit = {
    chunkId: string;
    content: string;
    score: number;
};

function buildFactIndexText(fact: FactRecord): string {
    return normalizeText(`${fact.type ?? ''} ${fact.path ?? ''} ${JSON.stringify(fact.value ?? '')}`);
}

function buildSummaryIndexText(summary: SummaryRecord): string {
    return normalizeText(`${summary.title ?? ''}\n${summary.content ?? ''}`);
}

function mapFactsByIndexText(facts: FactRecord[]): Map<string, FactRecord> {
    return facts.reduce<Map<string, FactRecord>>((result: Map<string, FactRecord>, fact: FactRecord): Map<string, FactRecord> => {
        const key = buildFactIndexText(fact);
        if (key && !result.has(key)) {
            result.set(key, fact);
        }
        return result;
    }, new Map<string, FactRecord>());
}

function mapSummariesByIndexText(summaries: SummaryRecord[]): Map<string, SummaryRecord> {
    return summaries.reduce<Map<string, SummaryRecord>>((result: Map<string, SummaryRecord>, summary: SummaryRecord): Map<string, SummaryRecord> => {
        const key = buildSummaryIndexText(summary);
        if (key && !result.has(key)) {
            result.set(key, summary);
        }
        return result;
    }, new Map<string, SummaryRecord>());
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
    const factMap = mapFactsByIndexText(facts);
    const summaryMap = mapSummariesByIndexText(summaries);
    const candidates: RecallCandidate[] = [];

    for (const hit of hits.slice(0, sourceLimit)) {
        const chunk = await db.vector_chunks.get(hit.chunkId);
        if (!chunk) {
            continue;
        }
        const normalizedContent = normalizeText(hit.content);
        if (chunk.bookId === 'facts') {
            const fact = factMap.get(normalizedContent);
            if (!fact) {
                continue;
            }
            const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
            const rawText = `${entityPart}${fact.type}${fact.path ? `.${fact.path}` : ''}: ${stringifyValue(fact.value)}`;
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
                extraReasonCodes: ['vector_hit', context.policy.vectorMode === 'search_rerank' ? 'vector_reranked' : 'vector_search'],
            });
            if (candidate) {
                candidates.push(candidate);
            }
            continue;
        }
        if (chunk.bookId === 'summaries') {
            const summary = summaryMap.get(normalizedContent);
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
                extraReasonCodes: ['vector_hit', context.policy.vectorMode === 'search_rerank' ? 'vector_reranked' : 'vector_search'],
            });
            if (candidate) {
                candidates.push(candidate);
            }
            continue;
        }
        const candidate = buildScoredCandidate(context, {
            candidateId: `vector:${hit.chunkId}`,
            recordKey: `vector:${hit.chunkId}`,
            recordKind: 'event',
            source: 'vector',
            sectionHint: context.plan.sections.includes('EVENTS') ? 'EVENTS' : context.plan.sections[0] ?? null,
            title: chunk.bookId || 'vector_chunk',
            rawText: hit.content,
            confidence: 0.58,
            updatedAt: Number(chunk.createdAt ?? Date.now()),
            vectorScore: clamp01(hit.score),
            continuityScore: 0.75,
            extraReasonCodes: ['vector_fallback_chunk', context.policy.vectorMode === 'search_rerank' ? 'vector_reranked' : 'vector_search'],
        });
        if (candidate) {
            candidates.push(candidate);
        }
    }

    return candidates;
}