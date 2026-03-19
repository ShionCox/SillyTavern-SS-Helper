import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    clamp01,
    formatLineByTone,
    readSourceLimit,
    type RecallSourceContext,
} from './shared';

type RelationshipProjection = {
    title: string;
    rawText: string;
    confidence: number;
    updatedAt: number;
    relationshipScore: number;
    sourceScope: 'group' | 'self' | 'target';
    ownerActorKey: string | null;
    participantActorKeys: string[];
    extraReasonCodes: string[];
    toneHint: RecallCandidate['tone'] | null;
};

function normalizeActorKey(actorKey: string | null | undefined): string {
    return String(actorKey ?? '').trim().toLowerCase();
}

function uniqueActorKeys(actorKeys: string[]): string[] {
    return Array.from(new Set(actorKeys.map((actorKey: string): string => normalizeActorKey(actorKey)).filter(Boolean)));
}

function collectFocusActorKeys(context: RecallSourceContext): { primaryActorKey: string; secondaryActorKeys: string[] } {
    const focus = context.plan.viewpoint.focus;
    const primaryActorKey = normalizeActorKey(focus.primaryActorKey);
    const secondaryActorKeys = uniqueActorKeys(focus.secondaryActorKeys).filter((actorKey: string): boolean => actorKey !== primaryActorKey).slice(0, 2);
    return {
        primaryActorKey,
        secondaryActorKeys,
    };
}

/**
 * 功能：将关系记忆按当前焦点投影为可召回状态。
 * 参数：
 *   context（RecallSourceContext）：召回上下文。
 *   relationship（RelationshipState）：原始关系状态。
 * 返回：
 *   RelationshipProjection：投影后的关系候选信息。
 */
function projectRelationshipRecallState(
    context: RecallSourceContext,
    relationship: {
        relationshipKey: string;
        actorKey: string;
        targetKey: string;
        scope: string;
        participantKeys?: string[];
        familiarity: number;
        trust: number;
        affection: number;
        respect: number;
        dependency: number;
        unresolvedConflict: number;
        sharedFragments?: string[];
        summary: string;
        updatedAt?: number;
    },
): RelationshipProjection {
    const focus = collectFocusActorKeys(context);
    const participantActorKeys = uniqueActorKeys(Array.isArray(relationship.participantKeys) && relationship.participantKeys.length > 0
        ? relationship.participantKeys
        : [relationship.actorKey, relationship.targetKey]);
    const sharedScope = relationship.scope === 'group_pair';
    const primaryInvolved = Boolean(focus.primaryActorKey) && participantActorKeys.includes(focus.primaryActorKey);
    const secondaryInvolved = participantActorKeys.some((actorKey: string): boolean => focus.secondaryActorKeys.includes(actorKey));
    const matchedSecondaryActor = participantActorKeys.find((actorKey: string): boolean => focus.secondaryActorKeys.includes(actorKey)) ?? null;
    const sharedFragments = Array.isArray(relationship.sharedFragments) ? relationship.sharedFragments.filter(Boolean) : [];
    const rawText = [
        relationship.summary,
        sharedFragments.length > 0 ? `片段=${sharedFragments.slice(0, 2).join('；')}` : '',
        `关系=${relationship.actorKey}->${relationship.targetKey}`,
    ].filter(Boolean).join(' / ');
    const baseScore = clamp01(
        relationship.familiarity * 0.16
        + relationship.trust * 0.2
        + relationship.affection * 0.2
        + relationship.respect * 0.14
        + relationship.dependency * 0.1
        + relationship.unresolvedConflict * 0.12
    );
    const conflictPenalty = clamp01(relationship.unresolvedConflict) * 0.18;
    const sourceScope = sharedScope
        ? 'group'
        : primaryInvolved
            ? 'self'
            : secondaryInvolved
                ? 'self'
                : 'target';
    const ownerActorKey = sharedScope
        ? null
        : primaryInvolved
            ? focus.primaryActorKey
            : matchedSecondaryActor;
    const confidence = clamp01(baseScore - conflictPenalty + (sharedScope ? 0.08 : 0));
    const toneHint = confidence < 0.52 || relationship.unresolvedConflict >= 0.62
        ? 'blurred_recall'
        : confidence < 0.68
            ? 'possible_misremember'
            : null;
    return {
        title: `${relationship.actorKey}->${relationship.targetKey}`,
        rawText,
        confidence,
        updatedAt: Number(relationship.updatedAt ?? Date.now()),
        relationshipScore: baseScore,
        sourceScope,
        ownerActorKey,
        participantActorKeys,
        extraReasonCodes: [
            sharedScope ? 'relationship_shared_group' : '',
            primaryInvolved ? 'relationship_primary_focus' : '',
            secondaryInvolved && !primaryInvolved ? 'relationship_secondary_focus' : '',
            !sharedScope && !primaryInvolved && !secondaryInvolved ? 'relationship_foreign_private' : '',
        ].filter(Boolean),
        toneHint,
    };
}

export async function collectRelationshipRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    const sourceLimit = readSourceLimit(context, 'relationships', 5);
    const candidates: RecallCandidate[] = [];
    const focus = collectFocusActorKeys(context);

    if (context.plan.sections.includes('CHARACTER_FACTS')) {
        const laneKeys = uniqueActorKeys([focus.primaryActorKey, ...focus.secondaryActorKeys]);
        laneKeys
            .slice(0, Math.max(1, Math.min(3, laneKeys.length)))
            .forEach((actorKey: string): void => {
                const lane = (context.groupMemory?.lanes ?? []).find((item) => normalizeActorKey(item.actorKey) === actorKey);
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
                    confidence: clamp01(Number(lane.recentMessageIds?.length ?? 0) > 0 ? 0.72 : 0.58),
                    updatedAt: Number(lane.lastActiveAt ?? Date.now()),
                    relationshipScore: clamp01(Number(lane.recentMessageIds?.length ?? 0) > 0 ? 0.72 : 0.58),
                    recencyWindowDays: 10,
                    memoryType: 'relationship',
                    memorySubtype: 'bond',
                    sourceScope: 'self',
                    ownerActorKey: lane.actorKey,
                    extraReasonCodes: ['relationship_lane_focus', ...(actorKey === focus.primaryActorKey ? ['focus:primary_actor'] : ['focus:secondary_actor'])],
                });
                if (candidate) {
                    candidates.push(candidate);
                }
            });
    }

    if (context.plan.sections.includes('RELATIONSHIPS')) {
        context.relationships.slice(0, sourceLimit * 2).forEach((relationship): void => {
            const projection = projectRelationshipRecallState(context, relationship);
            const candidate = buildScoredCandidate(context, {
                candidateId: `relationship:${relationship.relationshipKey}`,
                recordKey: relationship.relationshipKey,
                recordKind: 'relationship',
                source: 'relationships',
                sectionHint: 'RELATIONSHIPS',
                title: projection.title,
                rawText: projection.rawText,
                confidence: projection.confidence,
                updatedAt: projection.updatedAt,
                relationshipScore: projection.relationshipScore,
                memoryType: 'relationship',
                memorySubtype: 'bond',
                sourceScope: projection.sourceScope,
                ownerActorKey: projection.ownerActorKey,
                participantActorKeys: projection.participantActorKeys,
                extraReasonCodes: [
                    'relationship_projection',
                    ...projection.extraReasonCodes,
                    ...(projection.toneHint ? [`relationship_tone:${projection.toneHint}`] : []),
                ],
            });
            if (!candidate) {
                return;
            }
            if (projection.toneHint) {
                candidate.tone = projection.toneHint;
                candidate.renderedLine = formatLineByTone(candidate.rawText, projection.toneHint);
                candidate.reasonCodes = Array.from(new Set([...candidate.reasonCodes, 'relationship_uncertain_tone']));
                candidate.finalScore = Math.max(0, candidate.finalScore - 0.04);
            }
            candidates.push(candidate);
        });
    }

    return candidates;
}
