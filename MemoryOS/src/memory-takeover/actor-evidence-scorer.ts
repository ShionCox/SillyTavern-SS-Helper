import type {
    MemoryTakeoverActorCardCandidate,
    TakeoverSourceSegment,
    TakeoverSourceSegmentKind,
} from '../types';

/**
 * 功能：定义角色证据评分结果。
 */
export interface ActorEvidenceScoreResult {
    actorKey: string;
    displayName: string;
    aliases: string[];
    score: number;
    sourceKinds: TakeoverSourceSegmentKind[];
    reasonCodes: string[];
}

/**
 * 功能：为角色卡候选计算正文证据分数。
 * @param actorCard 角色卡候选。
 * @param segments 源文本分段。
 * @returns 评分结果。
 */
export function scoreActorEvidence(
    actorCard: MemoryTakeoverActorCardCandidate,
    segments: TakeoverSourceSegment[],
): ActorEvidenceScoreResult {
    const sourceKinds = new Set<TakeoverSourceSegmentKind>();
    const reasonCodes: string[] = [];
    let score = 0;
    const aliases = [actorCard.displayName, ...(actorCard.aliases ?? [])]
        .map((item: string): string => String(item ?? '').trim())
        .filter(Boolean);

    for (const segment of segments) {
        const matchedAlias = aliases.find((alias: string): boolean => segment.text.includes(alias));
        if (!matchedAlias) {
            continue;
        }
        sourceKinds.add(segment.kind);
        if (segment.kind === 'story_dialogue') {
            score += 3;
            pushReason(reasonCodes, 'story_dialogue_presence');
            continue;
        }
        if (segment.kind === 'story_narrative') {
            score += /\b说|问|看|走|伸手|回头|抱|拉|推|站|跪|笑|哭|望|喊|低声|开口/u.test(segment.text) ? 3 : 2;
            pushReason(reasonCodes, 'story_narrative_presence');
            continue;
        }
        if (segment.kind === 'meta_analysis' || segment.kind === 'instructional' || segment.kind === 'tool_artifact' || segment.kind === 'thought_like') {
            score -= 3;
            pushReason(reasonCodes, `non_story_${segment.kind}`);
        }
    }

    if (actorCard.identityFacts.length > 0 || actorCard.originFacts.length > 0) {
        score += 1;
        pushReason(reasonCodes, 'has_profile_facts');
    }

    return {
        actorKey: actorCard.actorKey,
        displayName: actorCard.displayName,
        aliases: actorCard.aliases ?? [],
        score,
        sourceKinds: [...sourceKinds],
        reasonCodes,
    };
}

/**
 * 功能：向原因码列表追加去重项。
 * @param target 原因码列表。
 * @param code 原因码。
 */
function pushReason(target: string[], code: string): void {
    if (!target.includes(code)) {
        target.push(code);
    }
}
