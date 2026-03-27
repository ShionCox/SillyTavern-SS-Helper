import type { RetrievalFacet, RetrievalResultItem } from './types';
import { computeNGramSimilarity } from './scoring';

/**
 * 功能：facet 到 schemaId 的分类映射。
 */
const FACET_SCHEMA_MAP: Record<string, RetrievalFacet> = {
    world_core_setting: 'world',
    world_hard_rule: 'world',
    world_global_state: 'world',
    world_hard_rule_legacy: 'world',
    scene_shared_state: 'scene',
    location: 'scene',
    relationship: 'relationship',
    actor_profile: 'relationship',
    event: 'event',
    actor_visible_event: 'event',
    actor_private_interpretation: 'interpretation',
};

/**
 * 功能：每个 facet 类别的默认最大占比。
 */
const FACET_MAX_RATIO: Record<RetrievalFacet, number> = {
    world: 0.3,
    scene: 0.25,
    relationship: 0.35,
    event: 0.35,
    interpretation: 0.25,
};

/**
 * 功能：多样性裁剪输入参数。
 */
export interface DiversityPruneInput {
    items: RetrievalResultItem[];
    maxChars?: number;
    maxCandidates?: number;
    similarityThreshold?: number;
}

/**
 * 功能：执行去重 + 类别平衡 + 预算控制的多样性裁剪。
 * @param input 裁剪输入。
 * @returns 裁剪后的结果列表。
 */
export function pruneForDiversity(input: DiversityPruneInput): RetrievalResultItem[] {
    const {
        items,
        maxChars = 8000,
        maxCandidates = 40,
        similarityThreshold = 0.85,
    } = input;

    if (items.length <= 0) return [];

    // 第一步：去重（entryId / compareKey / 高相似 summary）
    const deduped = deduplicateItems(items, similarityThreshold);

    // 第二步：类别平衡选择
    const balanced = balanceByCategory(deduped, maxCandidates);

    // 第三步：预算截断
    return truncateByBudget(balanced, maxChars);
}

/**
 * 功能：按多维度去重。
 * @param items 排序后的候选。
 * @param threshold 相似度阈值。
 * @returns 去重结果。
 */
function deduplicateItems(items: RetrievalResultItem[], threshold: number): RetrievalResultItem[] {
    const selected: RetrievalResultItem[] = [];
    const seenEntryIds = new Set<string>();
    const seenCompareKeys = new Set<string>();
    const seenSchemaRelationPairs = new Set<string>();

    for (const item of items) {
        const { candidate } = item;

        // entryId 去重
        if (seenEntryIds.has(candidate.entryId)) continue;

        // compareKey 去重
        if (candidate.compareKey) {
            if (seenCompareKeys.has(candidate.compareKey)) continue;
        }

        // schemaId + relationKey pair 去重
        if (candidate.relationKeys && candidate.relationKeys.length > 0) {
            const schemaRelation = `${candidate.schemaId}:${candidate.relationKeys.sort().join(',')}`;
            if (seenSchemaRelationPairs.has(schemaRelation)) {
                // 允许同一 schema+relation 最多 2 条
                const sameCount = selected.filter(s =>
                    s.candidate.schemaId === candidate.schemaId &&
                    arraysEqual(s.candidate.relationKeys ?? [], candidate.relationKeys ?? []),
                ).length;
                if (sameCount >= 2) continue;
            }
            seenSchemaRelationPairs.add(schemaRelation);
        }

        // summary 高相似去重
        const summaryText = `${candidate.title} ${candidate.summary}`;
        const isDuplicate = selected.some(existing => {
            const existingText = `${existing.candidate.title} ${existing.candidate.summary}`;
            return computeNGramSimilarity(summaryText, existingText) >= threshold;
        });
        if (isDuplicate) continue;

        seenEntryIds.add(candidate.entryId);
        if (candidate.compareKey) {
            seenCompareKeys.add(candidate.compareKey);
        }
        selected.push(item);
    }

    return selected;
}

/**
 * 功能：按类别平衡选择，确保各 facet 有代表。
 * @param items 去重后的候选。
 * @param maxCandidates 最大总数。
 * @returns 平衡后的结果。
 */
function balanceByCategory(items: RetrievalResultItem[], maxCandidates: number): RetrievalResultItem[] {
    if (items.length <= maxCandidates) return items;

    // 按 facet 分类
    const buckets = new Map<RetrievalFacet, RetrievalResultItem[]>();
    const uncategorized: RetrievalResultItem[] = [];
    const allFacets: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation'];

    for (const facet of allFacets) {
        buckets.set(facet, []);
    }

    for (const item of items) {
        const facet = FACET_SCHEMA_MAP[item.candidate.schemaId];
        if (facet) {
            buckets.get(facet)!.push(item);
        } else {
            uncategorized.push(item);
        }
    }

    const selected: RetrievalResultItem[] = [];
    const selectedIds = new Set<string>();

    // 第一轮：每个 facet 至少取 1 条最高分
    for (const facet of allFacets) {
        const bucket = buckets.get(facet) ?? [];
        if (bucket.length > 0 && selected.length < maxCandidates) {
            selected.push(bucket[0]);
            selectedIds.add(bucket[0].candidate.candidateId);
        }
    }

    // 第二轮：按比例分配剩余配额
    const remaining = maxCandidates - selected.length;
    if (remaining > 0) {
        for (const facet of allFacets) {
            const bucket = buckets.get(facet) ?? [];
            const maxForFacet = Math.max(1, Math.floor(maxCandidates * FACET_MAX_RATIO[facet]));
            const currentCount = selected.filter(s => FACET_SCHEMA_MAP[s.candidate.schemaId] === facet).length;
            const allowMore = maxForFacet - currentCount;

            for (const item of bucket) {
                if (selected.length >= maxCandidates) break;
                if (selectedIds.has(item.candidate.candidateId)) continue;
                if (selected.filter(s => FACET_SCHEMA_MAP[s.candidate.schemaId] === facet).length >= maxForFacet) break;
                selected.push(item);
                selectedIds.add(item.candidate.candidateId);
            }
        }

        // 用 uncategorized 填充剩余
        for (const item of uncategorized) {
            if (selected.length >= maxCandidates) break;
            if (selectedIds.has(item.candidate.candidateId)) continue;
            selected.push(item);
            selectedIds.add(item.candidate.candidateId);
        }
    }

    // 最终排序
    return selected.sort((a, b) => b.score - a.score);
}

/**
 * 功能：按字符预算截断。
 * @param items 候选列表。
 * @param maxChars 最大字符数。
 * @returns 截断后的列表。
 */
function truncateByBudget(items: RetrievalResultItem[], maxChars: number): RetrievalResultItem[] {
    let usedChars = 0;
    const result: RetrievalResultItem[] = [];

    for (const item of items) {
        const charCost = (item.candidate.title?.length ?? 0) + (item.candidate.summary?.length ?? 0);
        if (usedChars + charCost > maxChars && result.length > 0) {
            break;
        }
        usedChars += charCost;
        result.push(item);
    }

    return result;
}

/**
 * 功能：比较两个字符串数组是否相等。
 * @param a 数组一。
 * @param b 数组二。
 * @returns 是否相等。
 */
function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
}
