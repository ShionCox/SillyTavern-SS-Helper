import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    loadRecentSummaries,
    normalizeText,
    readSourceLimit,
    type RecallSourceContext,
    type SummaryRecord,
} from './shared';

export async function collectSummaryRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const summaries = await loadRecentSummaries(context);
    const sourceLimit = readSourceLimit(context, 'summaries', 6);
    const candidates: RecallCandidate[] = [];

    if (context.plan.sections.includes('SUMMARY')) {
        summaries.slice(0, sourceLimit * 3).forEach((summary: SummaryRecord): void => {
            const rawText = `[${summary.level}] ${summary.title ? `${summary.title}: ` : ''}${summary.content ?? ''}`;
            const candidate = buildScoredCandidate(context, {
                candidateId: `summary:${normalizeText(summary.summaryId || rawText)}`,
                recordKey: normalizeText(summary.summaryId || rawText),
                recordKind: 'summary',
                source: 'summaries',
                sectionHint: 'SUMMARY',
                title: normalizeText(summary.title || `${summary.level ?? 'summary'} summary`),
                rawText,
                confidence: Number(summary.encodeScore ?? (summary.level === 'arc' ? 0.7 : summary.level === 'scene' ? 0.62 : 0.56)),
                updatedAt: Number(summary.createdAt ?? 0),
                recencyWindowDays: 21,
            });
            if (candidate) {
                candidates.push(candidate);
            }
        });
    }

    if (context.plan.sections.includes('SHORT_SUMMARY')) {
        summaries
            .sort((left: SummaryRecord, right: SummaryRecord): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
            .slice(0, Math.max(3, sourceLimit))
            .forEach((summary: SummaryRecord): void => {
                const candidate = buildScoredCandidate(context, {
                    candidateId: `short-summary:${normalizeText(summary.summaryId || `${summary.title}:${summary.createdAt}`)}`,
                    recordKey: normalizeText(summary.summaryId || `${summary.title}:${summary.createdAt}`),
                    recordKind: 'summary',
                    source: 'summaries',
                    sectionHint: 'SHORT_SUMMARY',
                    title: normalizeText(summary.title || 'short_summary'),
                    rawText: `${summary.title ? `${summary.title}: ` : ''}${summary.content ?? ''}`,
                    confidence: Number(summary.encodeScore ?? 0.6),
                    updatedAt: Number(summary.createdAt ?? Date.now()),
                    continuityScore: 0.88,
                    recencyWindowDays: 10,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    return candidates;
}