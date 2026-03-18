import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    clamp01,
    readSourceLimit,
    type RecallSourceContext,
} from './shared';

export async function collectRelationshipRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const sourceLimit = readSourceLimit(context, 'relationships', 5);
    const candidates: RecallCandidate[] = [];

    if (context.plan.sections.includes('CHARACTER_FACTS')) {
        (context.groupMemory?.actorSalience ?? [])
            .sort((left, right): number => right.score - left.score)
            .slice(0, Math.max(1, Math.min(8, Number(context.policy.actorSalienceTopK ?? 3))))
            .forEach((salience): void => {
                const lane = (context.groupMemory?.lanes ?? []).find((item) => item.actorKey === salience.actorKey);
                if (!lane) {
                    return;
                }
                const goal = lane.recentGoal ? `, 目标=${lane.recentGoal}` : '';
                const emotion = lane.lastEmotion ? `, 情绪=${lane.lastEmotion}` : '';
                const candidate = buildScoredCandidate(context, {
                    candidateId: `lane:${lane.actorKey}`,
                    recordKey: `lane:${lane.actorKey}`,
                    recordKind: 'relationship',
                    source: 'relationships',
                    sectionHint: 'CHARACTER_FACTS',
                    title: lane.displayName,
                    rawText: `[lane:${lane.displayName}] 风格=${lane.lastStyle || 'unknown'}${emotion}${goal}`,
                    confidence: clamp01(Number(salience.score ?? 0)),
                    updatedAt: Number(lane.lastActiveAt ?? Date.now()),
                    relationshipScore: clamp01(Number(salience.score ?? 0)),
                    recencyWindowDays: 10,
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    if (context.plan.sections.includes('RELATIONSHIPS')) {
        context.relationships.slice(0, sourceLimit * 2).forEach((relationship): void => {
            const fragments = Array.isArray(relationship.sharedFragments) && relationship.sharedFragments.length > 0
                ? ` 片段=${relationship.sharedFragments.slice(0, 2).join('；')}`
                : '';
            const confidence = clamp01(
                relationship.familiarity * 0.14
                + relationship.trust * 0.22
                + relationship.affection * 0.22
                + relationship.respect * 0.14
                + relationship.dependency * 0.12
                + relationship.unresolvedConflict * 0.16,
            );
            const candidate = buildScoredCandidate(context, {
                candidateId: `relationship:${relationship.relationshipKey}`,
                recordKey: relationship.relationshipKey,
                recordKind: 'relationship',
                source: 'relationships',
                sectionHint: 'RELATIONSHIPS',
                title: `${relationship.actorKey}->${relationship.targetKey}`,
                rawText: `${relationship.summary}${fragments}`,
                confidence,
                updatedAt: Number(relationship.updatedAt ?? Date.now()),
                relationshipScore: confidence,
            });
            if (candidate) {
                candidates.push(candidate);
            }
        });
    }

    return candidates;
}