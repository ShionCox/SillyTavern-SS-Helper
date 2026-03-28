import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
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
    onTrace?: (record: MemoryDebugLogRecord) => void;
}

/**
 * 功能：多样性裁剪结果。
 */
export interface DiversityPruneResult {
    items: RetrievalResultItem[];
    droppedCount: number;
    dominantFacet: RetrievalFacet | null;
    deferredCount: number;
}

/**
 * 功能：执行去重 + 类别平衡 + 预算控制的多样性裁剪。
 * @param input 裁剪输入。
 * @returns 裁剪后的结果和诊断。
 */
export function pruneForDiversity(input: DiversityPruneInput): DiversityPruneResult {
    const { items, maxChars = 8000, maxCandidates = 40, similarityThreshold = 0.85, onTrace } = input;
    if (items.length <= 0) {
        return {
            items: [],
            droppedCount: 0,
            dominantFacet: null,
            deferredCount: 0,
        };
    }

    emitDiversityTrace(onTrace, '开始裁剪', '开始执行多样性裁剪。', {
        originalCount: items.length,
        maxChars,
        maxCandidates,
    });

    const deduped = deduplicateItems(items, similarityThreshold);
    const balanced = balanceByCategory(deduped, maxCandidates);
    const truncated = truncateByBudget(balanced.items, maxChars);
    const droppedCount = Math.max(0, items.length - truncated.length);

    if (balanced.dominantFacet) {
        emitDiversityTrace(
            onTrace,
            '轻量平衡',
            `${balanced.dominantFacet} 类候选占比过高，已触发轻量平衡。`,
            {
                dominantFacet: balanced.dominantFacet,
                deferredCount: balanced.deferredCount,
            },
        );
    }
    emitDiversityTrace(onTrace, '裁剪完成', `多样性裁剪完成，最终保留 ${truncated.length} 条结果。`, {
        dedupedCount: deduped.length,
        deferredCount: balanced.deferredCount,
        finalCount: truncated.length,
    });

    return {
        items: truncated,
        droppedCount,
        dominantFacet: balanced.dominantFacet,
        deferredCount: balanced.deferredCount,
    };
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
        if (seenEntryIds.has(candidate.entryId)) {
            continue;
        }
        if (candidate.compareKey && seenCompareKeys.has(candidate.compareKey)) {
            continue;
        }
        if (candidate.relationKeys && candidate.relationKeys.length > 0) {
            const sortedKeys = [...candidate.relationKeys].sort();
            const schemaRelation = `${candidate.schemaId}:${sortedKeys.join(',')}`;
            if (seenSchemaRelationPairs.has(schemaRelation)) {
                const sameCount = selected.filter((selectedItem: RetrievalResultItem): boolean => {
                    return selectedItem.candidate.schemaId === candidate.schemaId
                        && arraysEqual(selectedItem.candidate.relationKeys ?? [], candidate.relationKeys ?? []);
                }).length;
                if (sameCount >= 2) {
                    continue;
                }
            }
            seenSchemaRelationPairs.add(schemaRelation);
        }
        const summaryText = `${candidate.title} ${candidate.summary}`;
        const isDuplicate = selected.some((existing: RetrievalResultItem): boolean => {
            return computeNGramSimilarity(summaryText, `${existing.candidate.title} ${existing.candidate.summary}`) >= threshold;
        });
        if (isDuplicate) {
            continue;
        }
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
 * @returns 平衡后的结果和诊断。
 */
function balanceByCategory(
    items: RetrievalResultItem[],
    maxCandidates: number,
): { items: RetrievalResultItem[]; dominantFacet: RetrievalFacet | null; deferredCount: number } {
    if (items.length <= 0) {
        return { items, dominantFacet: null, deferredCount: 0 };
    }
    const buckets = new Map<RetrievalFacet, RetrievalResultItem[]>();
    const uncategorized: RetrievalResultItem[] = [];
    const allFacets: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation'];
    for (const facet of allFacets) {
        buckets.set(facet, []);
    }
    for (const item of items) {
        const facet = FACET_SCHEMA_MAP[item.candidate.schemaId];
        if (facet) {
            buckets.get(facet)?.push(item);
        } else {
            uncategorized.push(item);
        }
    }
    if (items.length <= maxCandidates) {
        return lightBalanceByCategory(items, buckets, allFacets, maxCandidates);
    }

    const selected: RetrievalResultItem[] = [];
    const selectedIds = new Set<string>();
    for (const facet of allFacets) {
        const bucket = buckets.get(facet) ?? [];
        if (bucket.length > 0 && selected.length < maxCandidates) {
            selected.push(bucket[0]);
            selectedIds.add(bucket[0].candidate.candidateId);
        }
    }
    for (const facet of allFacets) {
        const bucket = buckets.get(facet) ?? [];
        const maxForFacet = Math.max(1, Math.floor(maxCandidates * FACET_MAX_RATIO[facet]));
        for (const item of bucket) {
            if (selected.length >= maxCandidates) {
                break;
            }
            if (selectedIds.has(item.candidate.candidateId)) {
                continue;
            }
            if (selected.filter((selectedItem: RetrievalResultItem): boolean => FACET_SCHEMA_MAP[selectedItem.candidate.schemaId] === facet).length >= maxForFacet) {
                break;
            }
            selected.push(item);
            selectedIds.add(item.candidate.candidateId);
        }
    }
    for (const item of uncategorized) {
        if (selected.length >= maxCandidates) {
            break;
        }
        if (selectedIds.has(item.candidate.candidateId)) {
            continue;
        }
        selected.push(item);
    }
    return {
        items: selected.sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score),
        dominantFacet: null,
        deferredCount: Math.max(0, items.length - selected.length),
    };
}

/**
 * 功能：轻量平衡，在候选数量未超上限时也做结构平衡。
 * @param items 候选列表。
 * @param buckets facet 分桶。
 * @param allFacets facet 列表。
 * @param maxCandidates 最大数量。
 * @returns 平衡结果。
 */
function lightBalanceByCategory(
    items: RetrievalResultItem[],
    buckets: Map<RetrievalFacet, RetrievalResultItem[]>,
    allFacets: RetrievalFacet[],
    maxCandidates: number,
): { items: RetrievalResultItem[]; dominantFacet: RetrievalFacet | null; deferredCount: number } {
    const total = items.length;
    if (total <= 3) {
        return { items, dominantFacet: null, deferredCount: 0 };
    }
    let dominantFacet: RetrievalFacet | null = null;
    for (const facet of allFacets) {
        const bucket = buckets.get(facet) ?? [];
        if (bucket.length / total > 0.6) {
            dominantFacet = facet;
            break;
        }
    }
    if (!dominantFacet) {
        return { items, dominantFacet: null, deferredCount: 0 };
    }

    const maxForDominant = Math.max(2, Math.ceil(total * FACET_MAX_RATIO[dominantFacet]));
    const dominantBucket = buckets.get(dominantFacet) ?? [];
    const prioritized: RetrievalResultItem[] = [];
    const deferred: RetrievalResultItem[] = [];
    const selectedIds = new Set<string>();

    for (const facet of allFacets) {
        if (facet === dominantFacet) {
            continue;
        }
        for (const item of buckets.get(facet) ?? []) {
            prioritized.push(item);
            selectedIds.add(item.candidate.candidateId);
        }
    }
    let dominantCount = 0;
    for (const item of dominantBucket) {
        if (dominantCount < maxForDominant) {
            prioritized.push(item);
            selectedIds.add(item.candidate.candidateId);
            dominantCount += 1;
        } else {
            deferred.push(item);
        }
    }
    for (const item of items) {
        if (!selectedIds.has(item.candidate.candidateId) && !deferred.some((deferredItem: RetrievalResultItem): boolean => deferredItem.candidate.candidateId === item.candidate.candidateId)) {
            prioritized.push(item);
        }
    }

    return {
        items: [...prioritized, ...deferred]
            .slice(0, maxCandidates)
            .sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score),
        dominantFacet,
        deferredCount: deferred.length,
    };
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
 * @param left 数组一。
 * @param right 数组二。
 * @returns 是否相等。
 */
function arraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    const sortedLeft = [...left].sort();
    const sortedRight = [...right].sort();
    return sortedLeft.every((value: string, index: number): boolean => value === sortedRight[index]);
}

/**
 * 功能：触发多样性日志。
 * @param onTrace trace 回调。
 * @param title 标题。
 * @param message 消息。
 * @param payload 负载。
 * @returns 无返回值。
 */
function emitDiversityTrace(
    onTrace: ((record: MemoryDebugLogRecord) => void) | undefined,
    title: string,
    message: string,
    payload?: Record<string, unknown>,
): void {
    onTrace?.({
        ts: Date.now(),
        level: 'info',
        stage: 'diversity',
        title,
        message,
        payload,
    });
}
