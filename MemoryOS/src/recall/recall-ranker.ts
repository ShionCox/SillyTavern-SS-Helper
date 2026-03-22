import {
    clamp01,
    normalizeMemoryText,
} from '../core/memory-intelligence';
import type {
    InjectionSectionName,
    RecallCandidate,
    RecallPlan,
} from '../types';

type CandidatePriority = 'constraint' | 'continuity' | 'flavor';
type CandidatePool = 'global' | 'primary_actor' | 'secondary_actor';

type RankRecallCandidatesInput = {
    candidates: RecallCandidate[];
    plan: RecallPlan;
    recentVisibleMessages?: string[];
    worldStateText?: string;
    lorebookConflictDetected?: boolean;
};

type CutRecallCandidatesInput = {
    candidates: RecallCandidate[];
    plan: RecallPlan;
    estimateTokens: (text: string) => number;
};

const SECTION_HEADER_RESERVE: Record<InjectionSectionName, number> = {
    WORLD_STATE: 20,
    FACTS: 24,
    EVENTS: 16,
    SUMMARY: 20,
    CHARACTER_FACTS: 20,
    RELATIONSHIPS: 20,
    LAST_SCENE: 20,
    SHORT_SUMMARY: 18,
};

function normalizeCandidateText(value: string): string {
    return normalizeMemoryText(value).toLowerCase();
}

function appendReason(reasonCodes: string[], reasonCode: string): string[] {
    if (reasonCodes.includes(reasonCode)) {
        return reasonCodes;
    }
    return [...reasonCodes, reasonCode];
}

function setTonePrefix(line: string, tone: RecallCandidate['tone']): string {
    const normalizedLine = String(line ?? '').replace(/^\s*[-*]\s*/, '').replace(/^也许记错了：/, '').replace(/^依稀记得：/, '').replace(/^清晰回忆：/, '').trim();
    if (!normalizedLine) {
        return line;
    }
    if (tone === 'possible_misremember') {
        return `- 也许记错了：${normalizedLine}`;
    }
    if (tone === 'blurred_recall') {
        return `- 依稀记得：${normalizedLine}`;
    }
    if (tone === 'clear_recall') {
        return `- 清晰回忆：${normalizedLine}`;
    }
    return `- ${normalizedLine}`;
}

function isConflictSuppressed(candidate: RecallCandidate): boolean {
    return candidate.reasonCodes.includes('conflict_suppressed')
        || candidate.reasonCodes.includes('conflict_penalty')
        || candidate.conflictPenalty >= 0.45;
}

function lexicalOverlap(left: string, right: string): number {
    const leftTokens = new Set(normalizeCandidateText(left).split(/\s+/).filter((token: string): boolean => token.length >= 2));
    const rightTokens = new Set(normalizeCandidateText(right).split(/\s+/).filter((token: string): boolean => token.length >= 2));
    if (leftTokens.size <= 0 || rightTokens.size <= 0) {
        return 0;
    }
    let matches = 0;
    leftTokens.forEach((token: string): void => {
        if (rightTokens.has(token)) {
            matches += 1;
        }
    });
    return matches / Math.max(leftTokens.size, rightTokens.size);
}

function isDuplicate(left: RecallCandidate, right: RecallCandidate): boolean {
    if (left.recordKey && right.recordKey && left.recordKey === right.recordKey) {
        return true;
    }
    const leftText = normalizeCandidateText(left.rawText);
    const rightText = normalizeCandidateText(right.rawText);
    if (!leftText || !rightText) {
        return false;
    }
    if (leftText === rightText) {
        return true;
    }
    return lexicalOverlap(leftText, rightText) >= 0.84;
}

function readPriority(candidate: RecallCandidate): CandidatePriority {
    const text = `${candidate.title} ${candidate.rawText}`.toLowerCase();
    if (
        candidate.source === 'lorebook'
        || candidate.recordKind === 'state'
        || /rule|constraint|禁止|必须|不能|设定|world|规则|约束|promise|承诺|current conflict|当前冲突/.test(text)
        || candidate.sectionHint === 'RELATIONSHIPS'
    ) {
        return 'constraint';
    }
    if (
        candidate.sectionHint === 'LAST_SCENE'
        || candidate.sectionHint === 'EVENTS'
        || candidate.sectionHint === 'SHORT_SUMMARY'
        || /recent|scene|pending|最近|场景|未完成|当前场景|摘要/.test(text)
    ) {
        return 'continuity';
    }
    return 'flavor';
}

function priorityWeight(priority: CandidatePriority): number {
    if (priority === 'constraint') {
        return 0.14;
    }
    if (priority === 'continuity') {
        return 0.08;
    }
    return 0.03;
}

/**
 * 功能：根据实体词精确命中原因码，返回额外排序加权。
 * @param candidate 召回候选。
 * @returns 额外加权分数。
 */
function readExactEntityBonus(candidate: RecallCandidate): number {
    if (candidate.reasonCodes.includes('entity_title_exact_match')) {
        return 0.2;
    }
    if (candidate.reasonCodes.includes('entity_exact_match')) {
        return 0.12;
    }
    return 0;
}

/**
 * 功能：将候选映射到内部召回池。
 * 参数：
 *   candidate：召回候选。
 * 返回：
 *   'global' | 'actor'：召回池标记。
 */
function resolveCandidatePool(candidate: RecallCandidate): CandidatePool | 'blocked' {
    if (candidate.visibilityPool === 'blocked') {
        return 'blocked';
    }
    if (candidate.actorFocusTier === 'primary') {
        return 'primary_actor';
    }
    if (candidate.actorFocusTier === 'secondary') {
        return 'secondary_actor';
    }
    return 'global';
}

/**
 * 功能：对单个召回池执行粗排、精排与安全裁剪。
 * 参数：
 *   candidates：候选列表。
 *   input：召回排序输入。
 * 返回：
 *   RecallCandidate[]：排序后的候选。
 */
function rankCandidateBatch(candidates: RecallCandidate[], input: RankRecallCandidatesInput): RecallCandidate[] {
    const visibleMessages = Array.isArray(input.recentVisibleMessages) ? input.recentVisibleMessages : [];
    const worldStateText = String(input.worldStateText ?? '');
    const coarseRanked = candidates
        .map((candidate: RecallCandidate): RecallCandidate => {
            const sourceWeight = input.plan.sourceWeights[candidate.source] ?? 0.4;
            const sectionWeight = candidate.sectionHint ? (input.plan.sectionWeights[candidate.sectionHint] ?? 0.4) : 0.2;
            const priority = readPriority(candidate);
            const exactEntityBonus = readExactEntityBonus(candidate);
            const focusWeight = candidate.actorFocusTier === 'primary'
                ? 0.08
                : candidate.actorFocusTier === 'secondary'
                    ? 0.05
                    : candidate.actorFocusTier === 'shared'
                        ? 0.03
                        : 0;
            const roughScore = clamp01(
                candidate.keywordScore * 0.22
                + candidate.vectorScore * 0.2
                + candidate.recencyScore * 0.14
                + candidate.relationshipScore * 0.12
                + candidate.emotionScore * 0.08
                + candidate.continuityScore * 0.1
                + exactEntityBonus
                + candidate.actorVisibilityScore * 0.12
                + focusWeight
                - (candidate.actorForgotten ? 0.14 : 0)
                - clamp01(Number(candidate.actorForgetProbability ?? 0)) * 0.05
                + sourceWeight * 0.04
                + sectionWeight * 0.02,
            );
            return {
                ...candidate,
                finalScore: clamp01(candidate.finalScore * 0.54 + roughScore * 0.32 + priorityWeight(priority)),
                reasonCodes: [...candidate.reasonCodes, `priority:${priority}`],
                selected: false,
                suppressedBy: Array.isArray(candidate.suppressedBy) ? [...candidate.suppressedBy] : undefined,
            };
        })
        .sort((left: RecallCandidate, right: RecallCandidate): number => right.finalScore - left.finalScore);

    const coarseTop = coarseRanked.slice(0, input.plan.coarseTopK);
    const coarsePruned = coarseRanked.slice(input.plan.coarseTopK).map((candidate: RecallCandidate): RecallCandidate => ({
        ...candidate,
        reasonCodes: appendReason(candidate.reasonCodes, 'coarse_pruned'),
        finalScore: Math.max(0, candidate.finalScore - 0.08),
    }));

    const safeCandidates = applySafetyGate(coarseTop);
    const deduped = dedupeCandidates(safeCandidates);
    const selectedSoFar: RecallCandidate[] = [];
    const contradicted = detectContradictions(deduped, selectedSoFar, visibleMessages, worldStateText, input.lorebookConflictDetected === true)
        .map((candidate: RecallCandidate): RecallCandidate => {
            const tokenCostPenalty = clamp01((candidate.rawText.length / 420)) * 0.08;
            const speakerRelevance = visibleMessages.length > 0 && matchesVisibleContext(candidate, visibleMessages.slice(-4)) ? 0.06 : 0;
            const sceneContinuity = candidate.sectionHint === 'LAST_SCENE' || candidate.sectionHint === 'EVENTS' ? 0.06 : 0;
            const contradictionPenalty = candidate.reasonCodes.includes('conflict_suppressed') ? 0.22 : 0;
            const duplicatePenalty = candidate.reasonCodes.includes('duplicate_suppressed') || candidate.reasonCodes.includes('visible_duplicate_suppressed') ? 0.18 : 0;
            const fineScore = clamp01(candidate.finalScore + speakerRelevance + sceneContinuity - tokenCostPenalty - contradictionPenalty - duplicatePenalty);
            const nextCandidate = {
                ...candidate,
                finalScore: fineScore,
            };
            if (!nextCandidate.reasonCodes.includes('conflict_suppressed') && !nextCandidate.reasonCodes.includes('duplicate_suppressed') && !nextCandidate.reasonCodes.includes('visible_duplicate_suppressed')) {
                selectedSoFar.push(nextCandidate);
            }
            return nextCandidate;
        })
        .sort((left: RecallCandidate, right: RecallCandidate): number => right.finalScore - left.finalScore);

    const fineTop = contradicted.slice(0, input.plan.fineTopK);
    const finePruned = contradicted.slice(input.plan.fineTopK).map((candidate: RecallCandidate): RecallCandidate => ({
        ...candidate,
        reasonCodes: appendReason(candidate.reasonCodes, 'fine_pruned'),
        finalScore: Math.max(0, candidate.finalScore - 0.05),
    }));

    return [...fineTop, ...finePruned, ...coarsePruned].sort((left: RecallCandidate, right: RecallCandidate): number => right.finalScore - left.finalScore);
}

/**
 * 功能：按目标比例合并全局池与角色池。
 * 参数：
 *   globalCandidates：全局池候选。
 *   actorCandidates：角色池候选。
 *   actorShare：角色池目标占比。
 * 返回：
 *   RecallCandidate[]：合并后的候选。
 */
function mergeRankedPools(
    globalCandidates: RecallCandidate[],
    primaryCandidates: RecallCandidate[],
    secondaryCandidates: RecallCandidate[],
    shares: { global: number; primaryActor: number; secondaryActors: number },
): RecallCandidate[] {
    const pools = [
        { key: 'global' as const, candidates: globalCandidates, weight: Math.max(0, Number(shares.global ?? 0)), carried: 0 },
        { key: 'primary_actor' as const, candidates: primaryCandidates, weight: Math.max(0, Number(shares.primaryActor ?? 0)), carried: 0 },
        { key: 'secondary_actor' as const, candidates: secondaryCandidates, weight: Math.max(0, Number(shares.secondaryActors ?? 0)), carried: 0 },
    ].map((item) => ({
        ...item,
        weight: item.weight,
    }));
    const activePools = pools.filter((pool) => pool.candidates.length > 0 && pool.weight > 0);
    if (activePools.length === 0) {
        return [];
    }
    const weightSum = activePools.reduce((sum: number, pool): number => sum + pool.weight, 0) || 1;
    const merged: RecallCandidate[] = [];
    while (activePools.some((pool) => pool.candidates.length > 0)) {
        activePools.forEach((pool): void => {
            if (pool.candidates.length > 0) {
                pool.carried += pool.weight;
            }
        });
        let bestIndex = -1;
        let bestScore = Number.NEGATIVE_INFINITY;
        activePools.forEach((pool, index): void => {
            if (pool.candidates.length <= 0) {
                return;
            }
            if (pool.carried > bestScore) {
                bestScore = pool.carried;
                bestIndex = index;
            }
        });
        if (bestIndex < 0) {
            break;
        }
        const selectedPool = activePools[bestIndex];
        merged.push(selectedPool.candidates.shift() as RecallCandidate);
        selectedPool.carried -= weightSum;
    }
    return merged;
}

function appendBlockedCandidates(candidates: RecallCandidate[]): RecallCandidate[] {
    const blocked = candidates
        .filter((candidate: RecallCandidate): boolean => candidate.visibilityPool === 'blocked')
        .sort((left: RecallCandidate, right: RecallCandidate): number => right.finalScore - left.finalScore)
        .map((candidate: RecallCandidate): RecallCandidate => ({
            ...candidate,
            selected: false,
            reasonCodes: appendReason(candidate.reasonCodes, 'foreign_private_memory_suppressed'),
        }));
    return blocked;
}

function hasNegationConflict(candidateText: string, compareText: string): boolean {
    const candidate = normalizeCandidateText(candidateText);
    const compare = normalizeCandidateText(compareText);
    if (!candidate || !compare) {
        return false;
    }
    const overlap = lexicalOverlap(candidate, compare);
    if (overlap < 0.45) {
        return false;
    }
    const candidateNegative = /不是|不能|禁止|never|forbid|no\b/.test(candidate);
    const compareNegative = /不是|不能|禁止|never|forbid|no\b/.test(compare);
    return candidateNegative !== compareNegative;
}

function matchesVisibleContext(candidate: RecallCandidate, visibleMessages: string[]): boolean {
    const text = normalizeCandidateText(candidate.rawText);
    if (!text) {
        return false;
    }
    return visibleMessages.some((message: string): boolean => {
        const normalizedMessage = normalizeCandidateText(message);
        if (!normalizedMessage) {
            return false;
        }
        if (normalizedMessage.includes(text) || text.includes(normalizedMessage)) {
            return true;
        }
        return lexicalOverlap(text, normalizedMessage) >= 0.88;
    });
}

export function dedupeCandidates(candidates: RecallCandidate[]): RecallCandidate[] {
    const accepted: RecallCandidate[] = [];
    return candidates.map((candidate: RecallCandidate): RecallCandidate => {
        const duplicateOf = accepted.find((existing: RecallCandidate): boolean => isDuplicate(existing, candidate));
        if (duplicateOf) {
            return {
                ...candidate,
                suppressedBy: [duplicateOf.candidateId],
                reasonCodes: appendReason(candidate.reasonCodes, 'duplicate_suppressed'),
                finalScore: Math.max(0, candidate.finalScore - 0.16),
            };
        }
        accepted.push(candidate);
        return candidate;
    });
}

export function detectContradictions(
    candidates: RecallCandidate[],
    selectedSoFar: RecallCandidate[],
    recentVisibleMessages: string[],
    worldStateText: string,
    lorebookConflictDetected: boolean,
): RecallCandidate[] {
    return candidates.map((candidate: RecallCandidate): RecallCandidate => {
        if (candidate.reasonCodes.includes('duplicate_suppressed')) {
            return candidate;
        }
        const againstSelected = selectedSoFar.some((selected: RecallCandidate): boolean => hasNegationConflict(candidate.rawText, selected.rawText));
        const againstWorld = hasNegationConflict(candidate.rawText, worldStateText);
        const againstVisible = matchesVisibleContext(candidate, recentVisibleMessages);
        const lorebookConflict = lorebookConflictDetected && candidate.source === 'lorebook';
        if (!againstSelected && !againstWorld && !againstVisible && !lorebookConflict && !isConflictSuppressed(candidate)) {
            return candidate;
        }
        const nextReasons = appendReason(candidate.reasonCodes, againstVisible ? 'visible_duplicate_suppressed' : 'conflict_suppressed');
        return {
            ...candidate,
            suppressedBy: againstSelected ? selectedSoFar.map((item: RecallCandidate): string => item.candidateId).slice(0, 2) : candidate.suppressedBy,
            reasonCodes: nextReasons,
            finalScore: Math.max(0, candidate.finalScore - (againstVisible ? 0.18 : 0.24)),
        };
    });
}

export function applySafetyGate(candidates: RecallCandidate[]): RecallCandidate[] {
    return candidates.map((candidate: RecallCandidate): RecallCandidate => {
        if (!candidate.reasonCodes.includes('stage:distorted')) {
            return candidate;
        }
        const safeTone: RecallCandidate['tone'] = candidate.tone === 'stable_fact' ? 'possible_misremember' : candidate.tone;
        return {
            ...candidate,
            tone: safeTone,
            renderedLine: setTonePrefix(candidate.renderedLine ?? candidate.rawText, safeTone),
            reasonCodes: appendReason(candidate.reasonCodes, 'distorted_uncertain_tone'),
        };
    });
}

export function rankRecallCandidates(input: RankRecallCandidatesInput): RecallCandidate[] {
    const blockedCandidates = appendBlockedCandidates(input.candidates);
    const pooledCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.visibilityPool !== 'blocked');
    const directorMode = input.plan.viewpoint.mode === 'omniscient_director';
    if (directorMode) {
        return [
            ...rankCandidateBatch(
                pooledCandidates.filter((candidate: RecallCandidate): boolean => resolveCandidatePool(candidate) === 'global'),
                input,
            ),
            ...blockedCandidates,
        ];
    }
    const globalCandidates = pooledCandidates.filter((candidate: RecallCandidate): boolean => resolveCandidatePool(candidate) === 'global');
    const primaryCandidates = pooledCandidates.filter((candidate: RecallCandidate): boolean => resolveCandidatePool(candidate) === 'primary_actor');
    const secondaryCandidates = pooledCandidates.filter((candidate: RecallCandidate): boolean => resolveCandidatePool(candidate) === 'secondary_actor');
    const rankedGlobal = rankCandidateBatch(globalCandidates, input);
    const rankedPrimary = rankCandidateBatch(primaryCandidates, input);
    const rankedSecondary = rankCandidateBatch(secondaryCandidates, input);
    const merged = mergeRankedPools(rankedGlobal, rankedPrimary, rankedSecondary, input.plan.viewpoint.focus.budgetShare);
    return [...dedupeCandidates(merged), ...blockedCandidates];
}

export function cutRecallCandidatesByBudget(input: CutRecallCandidatesInput): RecallCandidate[] {
    const usedSectionTokens = new Map<InjectionSectionName, number>();
    const openedSections = new Set<InjectionSectionName>();
    let totalTokens = 0;
    const blockedCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.visibilityPool === 'blocked');

    const grouped = ['constraint', 'continuity', 'flavor'].flatMap((priority: string): RecallCandidate[] => {
        return input.candidates
            .filter((candidate: RecallCandidate): boolean => candidate.visibilityPool !== 'blocked')
            .filter((candidate: RecallCandidate): boolean => candidate.reasonCodes.includes(`priority:${priority}`))
            .sort((left: RecallCandidate, right: RecallCandidate): number => {
                const leftTier = left.actorFocusTier === 'primary' ? 3 : left.actorFocusTier === 'secondary' ? 2 : left.actorFocusTier === 'shared' ? 1 : 0;
                const rightTier = right.actorFocusTier === 'primary' ? 3 : right.actorFocusTier === 'secondary' ? 2 : right.actorFocusTier === 'shared' ? 1 : 0;
                return rightTier - leftTier || right.finalScore - left.finalScore;
            });
    });

    const selectedIds = new Set<string>();
    grouped.forEach((candidate: RecallCandidate): void => {
        if (
            candidate.reasonCodes.includes('conflict_suppressed')
            || candidate.reasonCodes.includes('duplicate_suppressed')
            || candidate.reasonCodes.includes('visible_duplicate_suppressed')
            || candidate.reasonCodes.includes('coarse_pruned')
            || candidate.reasonCodes.includes('fine_pruned')
        ) {
            return;
        }
        if (!candidate.sectionHint) {
            return;
        }
        const sectionBudget = Math.max(0, Number(input.plan.sectionBudgets[candidate.sectionHint] ?? 0));
        if (sectionBudget <= 0) {
            return;
        }
        const lineTokens = input.estimateTokens(candidate.renderedLine ?? candidate.rawText);
        const headerReserve = openedSections.has(candidate.sectionHint)
            ? 0
            : SECTION_HEADER_RESERVE[candidate.sectionHint] ?? 16;
        const nextSectionTokens = (usedSectionTokens.get(candidate.sectionHint) ?? 0) + lineTokens + headerReserve;
        if (nextSectionTokens > sectionBudget || totalTokens + lineTokens + headerReserve > input.plan.maxTokens) {
            return;
        }
        openedSections.add(candidate.sectionHint);
        usedSectionTokens.set(candidate.sectionHint, nextSectionTokens);
        totalTokens += lineTokens + headerReserve;
        selectedIds.add(candidate.candidateId);
    });

    const selected = input.candidates.map((candidate: RecallCandidate): RecallCandidate => {
        if (selectedIds.has(candidate.candidateId)) {
            return {
                ...candidate,
                selected: true,
            };
        }
        if (candidate.visibilityPool === 'blocked') {
            return {
                ...candidate,
                selected: false,
                reasonCodes: appendReason(candidate.reasonCodes, 'foreign_private_memory_suppressed'),
            };
        }
        if (
            candidate.reasonCodes.includes('conflict_suppressed')
            || candidate.reasonCodes.includes('duplicate_suppressed')
            || candidate.reasonCodes.includes('visible_duplicate_suppressed')
            || candidate.reasonCodes.includes('coarse_pruned')
            || candidate.reasonCodes.includes('fine_pruned')
        ) {
            return {
                ...candidate,
                selected: false,
            };
        }
        return {
            ...candidate,
            selected: false,
            reasonCodes: appendReason(candidate.reasonCodes, 'budget_dropped'),
        };
    });
    const blockedTail = blockedCandidates
        .map((candidate: RecallCandidate): RecallCandidate => ({
            ...candidate,
            selected: false,
            reasonCodes: appendReason(candidate.reasonCodes, 'foreign_private_memory_suppressed'),
        }));
    return [...selected.filter((candidate: RecallCandidate): boolean => candidate.visibilityPool !== 'blocked'), ...blockedTail];
}
