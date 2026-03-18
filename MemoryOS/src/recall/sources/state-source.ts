import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    readSourceLimit,
    stringifyValue,
    type RecallSourceContext,
} from './shared';

export async function collectStateRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    if (!context.plan.sections.includes('WORLD_STATE')) {
        return [];
    }
    const states = await context.stateManager.query('') as Record<string, unknown>;
    const sourceLimit = readSourceLimit(context, 'state', 6);
    return Object.entries(states)
        .slice(0, sourceLimit * 4)
        .map(([path, value]: [string, unknown]): RecallCandidate | null => buildScoredCandidate(context, {
            candidateId: `state:${path}`,
            recordKey: path,
            recordKind: 'state',
            source: 'state',
            sectionHint: 'WORLD_STATE',
            title: path,
            rawText: `${path}: ${stringifyValue(value)}`,
            confidence: 0.58,
            updatedAt: Date.now(),
        }))
        .filter((item: RecallCandidate | null): item is RecallCandidate => item != null);
}