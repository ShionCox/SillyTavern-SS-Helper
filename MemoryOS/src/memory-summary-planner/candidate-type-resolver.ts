import type { ResolvedWorldProfile } from '../memory-world-profile';

/**
 * 功能：候选类型解析输入。
 */
export interface CandidateTypeResolverInput {
    detectedTypes: string[];
    worldProfile: ResolvedWorldProfile;
}

/**
 * 功能：结合世界模板偏置解析本轮候选类型。
 * @param input 解析输入。
 * @returns 按优先级排序后的候选类型。
 */
export function resolveCandidateTypes(input: CandidateTypeResolverInput): string[] {
    const weights = new Map<string, number>();
    for (const type of input.detectedTypes) {
        addWeight(weights, type, 1);
    }
    for (const type of input.worldProfile.mergedSummaryBias.boostedTypes) {
        addWeight(weights, type, 1.2);
    }
    for (const type of input.worldProfile.mergedSummaryBias.suppressedTypes) {
        addWeight(weights, type, -0.8);
    }
    for (const type of input.worldProfile.mergedPreferredSchemas) {
        addWeight(weights, type, 0.45);
    }
    return Array.from(weights.entries())
        .filter((entry): boolean => entry[1] > 0)
        .sort((left, right): number => right[1] - left[1])
        .map((entry): string => entry[0])
        .slice(0, 8);
}

/**
 * 功能：累加类型权重。
 * @param map 权重表。
 * @param type 候选类型。
 * @param delta 权重增量。
 */
function addWeight(map: Map<string, number>, type: string, delta: number): void {
    const normalized = String(type ?? '').trim();
    if (!normalized) {
        return;
    }
    map.set(normalized, (map.get(normalized) ?? 0) + delta);
}

