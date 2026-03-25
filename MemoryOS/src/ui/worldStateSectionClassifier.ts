import type { StructuredWorldStateEntry } from '../types';

export interface WorldStateSectionTypeBucket {
    typeKey: string;
    count: number;
}

export interface WorldStateSectionTypeState {
    activeTypeKey: string;
    buckets: WorldStateSectionTypeBucket[];
}

export const WORLD_STATE_SECTION_TYPE_TAB_KEYS = new Set<string>([
    'nation',
    'region',
    'city',
    'location',
    'organization',
    'character',
]);

const WORLD_STATE_TYPE_PRIORITY = [
    'rule',
    'constraint',
    'event',
    'status',
    'capability',
    'ownership',
    'culture',
    'danger',
    'relationship',
    'task',
    'relationship_hook',
    'other',
    'anomaly',
];

/**
 * 功能：把世界状态类型键归一化为稳定的比较值。
 * @param value 原始类型键。
 * @returns 归一化后的类型键。
 */
export function normalizeWorldStateSectionTypeKey(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized || 'status';
}

/**
 * 功能：判断当前子表是否需要显示分类标签页。
 * @param sectionKey 子表键。
 * @returns 需要显示时返回 true。
 */
export function shouldShowWorldStateSectionTypeTabs(sectionKey: string): boolean {
    return WORLD_STATE_SECTION_TYPE_TAB_KEYS.has(String(sectionKey ?? '').trim());
}

/**
 * 功能：统计并排序某个子表内的世界状态分类。
 * @param entries 子表条目。
 * @param preferredTypeKey 首选类型键。
 * @returns 当前激活类型与分类桶列表。
 */
export function buildWorldStateSectionTypeState(
    entries: StructuredWorldStateEntry[],
    preferredTypeKey: string = '',
): WorldStateSectionTypeState {
    const counts = entries.reduce<Map<string, number>>((map: Map<string, number>, entry: StructuredWorldStateEntry): Map<string, number> => {
        const typeKey = normalizeWorldStateSectionTypeKey(String(entry.node.stateType ?? ''));
        map.set(typeKey, (map.get(typeKey) ?? 0) + 1);
        return map;
    }, new Map<string, number>());

    const buckets = Array.from(counts.entries()).map(([typeKey, count]: [string, number]): WorldStateSectionTypeBucket => ({
        typeKey,
        count,
    })).sort((left: WorldStateSectionTypeBucket, right: WorldStateSectionTypeBucket): number => {
        if (right.count !== left.count) {
            return right.count - left.count;
        }
        const leftPriority = resolveWorldStateSectionTypePriority(left.typeKey);
        const rightPriority = resolveWorldStateSectionTypePriority(right.typeKey);
        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }
        return left.typeKey.localeCompare(right.typeKey);
    });

    const normalizedPreferredTypeKey = normalizeWorldStateSectionTypeKey(preferredTypeKey);
    const activeTypeKey = buckets.some((bucket: WorldStateSectionTypeBucket): boolean => bucket.typeKey === normalizedPreferredTypeKey)
        ? normalizedPreferredTypeKey
        : buckets[0]?.typeKey ?? '';

    return {
        activeTypeKey,
        buckets,
    };
}

/**
 * 功能：过滤出指定类型的世界状态条目。
 * @param entries 原始条目列表。
 * @param typeKey 目标类型键。
 * @returns 仅包含目标类型的条目列表。
 */
export function filterWorldStateEntriesByType<T extends { node: { stateType?: string | null } }>(entries: T[], typeKey: string): T[] {
    const normalizedTypeKey = normalizeWorldStateSectionTypeKey(typeKey);
    return entries.filter((entry: T): boolean => normalizeWorldStateSectionTypeKey(String(entry.node.stateType ?? '')) === normalizedTypeKey);
}

/**
 * 功能：判断当前子表是否拥有多个可切换分类。
 * @param state 分类状态。
 * @returns 存在多个分类时返回 true。
 */
export function hasMultipleWorldStateSectionTypes(state: WorldStateSectionTypeState): boolean {
    return state.buckets.length > 1;
}

function resolveWorldStateSectionTypePriority(typeKey: string): number {
    const index = WORLD_STATE_TYPE_PRIORITY.indexOf(normalizeWorldStateSectionTypeKey(typeKey));
    return index >= 0 ? index : WORLD_STATE_TYPE_PRIORITY.length + 1;
}
