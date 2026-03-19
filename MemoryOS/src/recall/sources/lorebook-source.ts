import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    clamp01,
    readSourceLimit,
    type RecallSourceContext,
} from './shared';

function buildLorebookText(entry: { entry: string; keywords: string[]; content: string }, mode: string): string {
    const content = entry.content.trim();
    if (mode === 'summary_only') {
        return `[Lorebook:${entry.entry}] ${content.slice(0, 72)}`;
    }
    const keywordText = entry.keywords.length > 0 ? ` [${entry.keywords.slice(0, 6).join(', ')}]` : '';
    const limit = mode === 'force_inject' ? 220 : 120;
    return `[Lorebook:${entry.entry}]${keywordText} ${content.slice(0, limit)}`.trim();
}

export async function collectLorebookRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    if (!context.plan.sections.includes('WORLD_STATE') || context.lorebookDecision.mode === 'block') {
        return [];
    }
    const sourceLimit = readSourceLimit(context, 'lorebook', 4);
    return context.lorebookEntries.slice(0, sourceLimit).map((entry): RecallCandidate | null => buildScoredCandidate(context, {
        candidateId: `lorebook:${entry.book}/${entry.entry}`,
        recordKey: `lorebook:${entry.book}/${entry.entry}`,
        recordKind: 'lorebook',
        source: 'lorebook',
        sectionHint: 'WORLD_STATE',
        title: `${entry.book}/${entry.entry}`,
        rawText: buildLorebookText(entry, context.lorebookDecision.mode),
        confidence: clamp01(context.lorebookDecision.score),
        updatedAt: Date.now(),
        continuityScore: context.lorebookDecision.matchedEntries.includes(`${entry.book}/${entry.entry}`) ? 1 : 0.4,
        memoryType: 'world',
        memorySubtype: 'global_rule',
        sourceScope: 'world',
        extraReasonCodes: [`lorebook_mode:${context.lorebookDecision.mode}`],
    })).filter((item: RecallCandidate | null): item is RecallCandidate => item != null);
}
