import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverCandidateActorMention,
    MemoryTakeoverRejectedMention,
    TakeoverSourceSegment,
} from '../types';
import { scoreActorEvidence, type ActorEvidenceScoreResult } from './actor-evidence-scorer';

const REJECT_NAME_PATTERN = /^(村民|众人|大家|有人|一个男人|一个女人|那个带路的人|山神新娘|老何家|老岫村)$/;

/**
 * 功能：根据证据规则重排正式角色、候选角色与拒绝提及。
 * @param result 批次结果。
 * @param segments 源文本分段。
 * @returns 处理后的角色结果。
 */
export function applyActorCreationPolicy(
    result: MemoryTakeoverBatchResult,
    segments: TakeoverSourceSegment[],
): {
    actorCards: MemoryTakeoverActorCardCandidate[];
    candidateActors: MemoryTakeoverCandidateActorMention[];
    rejectedMentions: MemoryTakeoverRejectedMention[];
    actorCompletionMissingKeys: string[];
} {
    const confirmed: MemoryTakeoverActorCardCandidate[] = [];
    const candidates: MemoryTakeoverCandidateActorMention[] = [];
    const rejected: MemoryTakeoverRejectedMention[] = [];
    const scoreMap = new Map<string, ActorEvidenceScoreResult>();
    const actorMap = new Map<string, MemoryTakeoverActorCardCandidate>();

    for (const actorCard of result.actorCards ?? []) {
        actorMap.set(actorCard.actorKey, actorCard);
    }
    const referencedActorKeys = collectReferencedActorKeys(result, actorMap);

    for (const actorCard of result.actorCards ?? []) {
        const score = scoreActorEvidence(actorCard, segments);
        scoreMap.set(actorCard.actorKey, score);
        if (shouldRejectActorCard(actorCard)) {
            rejected.push({
                name: actorCard.displayName,
                actorKey: actorCard.actorKey,
                sourceBatchId: result.batchId,
                sourceFloorStart: result.sourceRange.startFloor,
                sourceFloorEnd: result.sourceRange.endFloor,
                reasonCodes: [...score.reasonCodes, 'rejected_by_policy'],
            });
            continue;
        }
        if (score.score >= 3 || referencedActorKeys.has(actorCard.actorKey)) {
            confirmed.push(actorCard);
            continue;
        }
        candidates.push({
            actorKey: actorCard.actorKey,
            name: actorCard.displayName,
            aliases: actorCard.aliases ?? [],
            sourceBatchId: result.batchId,
            sourceFloorStart: result.sourceRange.startFloor,
            sourceFloorEnd: result.sourceRange.endFloor,
            evidenceScore: score.score,
            sourceKinds: score.sourceKinds,
            reasonCodes: [...score.reasonCodes, 'candidate_by_policy'],
            status: 'candidate',
        });
    }

    const missingKeys = collectMissingRelationshipActorKeys(result, actorMap);
    for (const missingKey of missingKeys) {
        confirmed.push(buildFallbackActorCard(missingKey));
    }

    return {
        actorCards: dedupeActorCards(confirmed),
        candidateActors: dedupeCandidateMentions(candidates),
        rejectedMentions: dedupeRejectedMentions(rejected),
        actorCompletionMissingKeys: missingKeys,
    };
}

/**
 * 功能：判断角色卡是否应被直接拒绝。
 * @param actorCard 角色卡。
 * @returns 是否拒绝。
 */
function shouldRejectActorCard(actorCard: MemoryTakeoverActorCardCandidate): boolean {
    const displayName = String(actorCard.displayName ?? '').trim();
    return REJECT_NAME_PATTERN.test(displayName);
}

/**
 * 功能：收集会强制保留正式角色卡的角色键。
 * @param result 批次结果。
 * @param actorMap 已有角色映射。
 * @returns 引用角色键集合。
 */
function collectReferencedActorKeys(
    result: MemoryTakeoverBatchResult,
    actorMap: Map<string, MemoryTakeoverActorCardCandidate>,
): Set<string> {
    const referenced = new Set<string>();
    const appendResolvedActorKey = (value: string): void => {
        const normalizedValue = String(value ?? '').trim();
        if (!normalizedValue || normalizedValue === 'user') {
            return;
        }
        if (actorMap.has(normalizedValue)) {
            referenced.add(normalizedValue);
            return;
        }
        for (const actorCard of actorMap.values()) {
            if (String(actorCard.displayName ?? '').trim() === normalizedValue) {
                referenced.add(actorCard.actorKey);
                return;
            }
            if ((actorCard.aliases ?? []).some((alias: string): boolean => String(alias ?? '').trim() === normalizedValue)) {
                referenced.add(actorCard.actorKey);
                return;
            }
        }
    };
    const appendBindings = (bindings?: { actors?: string[] }): void => {
        for (const actorKey of bindings?.actors ?? []) {
            appendResolvedActorKey(actorKey);
        }
    };

    for (const relationship of result.relationships ?? []) {
        appendResolvedActorKey(relationship.sourceActorKey);
        appendResolvedActorKey(relationship.targetActorKey);
    }
    for (const transition of result.relationTransitions ?? []) {
        if (String(transition.targetType ?? '').trim().toLowerCase() === 'actor') {
            appendResolvedActorKey(transition.target);
        }
        appendBindings(transition.bindings);
    }
    for (const entity of result.entityCards ?? []) {
        appendBindings(entity.bindings);
    }
    for (const entity of result.entityTransitions ?? []) {
        appendBindings(entity.bindings);
    }
    for (const fact of result.stableFacts ?? []) {
        appendBindings(fact.bindings);
    }
    for (const task of result.taskTransitions ?? []) {
        appendBindings(task.bindings);
    }
    for (const change of result.worldStateChanges ?? []) {
        appendBindings(change.bindings);
    }
    return referenced;
}

/**
 * 功能：收集关系里引用但未建档的角色键。
 * @param result 批次结果。
 * @param actorMap 已有角色映射。
 * @returns 缺失角色键列表。
 */
function collectMissingRelationshipActorKeys(
    result: MemoryTakeoverBatchResult,
    actorMap: Map<string, MemoryTakeoverActorCardCandidate>,
): string[] {
    const missing = new Set<string>();
    for (const relationship of result.relationships ?? []) {
        for (const actorKey of [relationship.sourceActorKey, relationship.targetActorKey]) {
            if (!actorKey || actorKey === 'user' || actorMap.has(actorKey)) {
                continue;
            }
            missing.add(actorKey);
        }
    }
    return [...missing];
}

/**
 * 功能：为缺失角色键构造兜底角色卡。
 * @param actorKey 角色键。
 * @returns 兜底角色卡。
 */
function buildFallbackActorCard(actorKey: string): MemoryTakeoverActorCardCandidate {
    const displayName = actorKey.replace(/^actor_/, '').replace(/_/g, ' ').trim() || actorKey;
    return {
        actorKey,
        displayName,
        aliases: [],
        identityFacts: ['该角色在当前批次关系链中已被明确引用。'],
        originFacts: [],
        traits: [],
    };
}

/**
 * 功能：对正式角色卡去重。
 * @param actorCards 原始角色卡。
 * @returns 去重结果。
 */
function dedupeActorCards(actorCards: MemoryTakeoverActorCardCandidate[]): MemoryTakeoverActorCardCandidate[] {
    const seen = new Set<string>();
    return actorCards.filter((item: MemoryTakeoverActorCardCandidate): boolean => {
        if (!item.actorKey || seen.has(item.actorKey)) {
            return false;
        }
        seen.add(item.actorKey);
        return true;
    });
}

/**
 * 功能：对候选角色提及去重。
 * @param candidates 原始候选列表。
 * @returns 去重结果。
 */
function dedupeCandidateMentions(candidates: MemoryTakeoverCandidateActorMention[]): MemoryTakeoverCandidateActorMention[] {
    const seen = new Set<string>();
    return candidates.filter((item: MemoryTakeoverCandidateActorMention): boolean => {
        const key = `${item.actorKey ?? ''}::${item.name}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * 功能：对拒绝提及去重。
 * @param rejected 原始拒绝列表。
 * @returns 去重结果。
 */
function dedupeRejectedMentions(rejected: MemoryTakeoverRejectedMention[]): MemoryTakeoverRejectedMention[] {
    const seen = new Set<string>();
    return rejected.filter((item: MemoryTakeoverRejectedMention): boolean => {
        const key = `${item.actorKey ?? ''}::${item.name}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
