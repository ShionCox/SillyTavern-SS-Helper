import type { RetrievalCandidate } from './types';

/**
 * 功能：统一候选预过滤协议。
 * 说明：后续向量检索可直接复用此结构做 payload 级预过滤。
 */
export type PayloadFilter = {
    /** 聊天键 */
    chatKey?: string;
    /** 限定角色键 */
    actorKeys?: string[];
    /** 限定 schema 类型 */
    schemaIds?: string[];
    /** 限定关系键 */
    relationKeys?: string[];
    /** 限定世界键 */
    worldKeys?: string[];
    /** 限定地点键 */
    locationKeys?: string[];
    /** 限定 compareKey */
    compareKeys?: string[];
};

/**
 * 功能：对候选列表应用 PayloadFilter 预过滤。
 * @param candidates 全量候选。
 * @param filter 过滤条件。
 * @returns 过滤后的候选列表。
 */
export function applyPayloadFilter(
    candidates: RetrievalCandidate[],
    filter?: PayloadFilter,
): RetrievalCandidate[] {
    if (!filter) {
        return candidates;
    }
    let result = candidates;

    if (filter.actorKeys && filter.actorKeys.length > 0) {
        const allowed = new Set(filter.actorKeys);
        result = result.filter((c: RetrievalCandidate): boolean => {
            return (c.actorKeys ?? []).some((k: string): boolean => allowed.has(k));
        });
    }

    if (filter.schemaIds && filter.schemaIds.length > 0) {
        const allowed = new Set(filter.schemaIds);
        result = result.filter((c: RetrievalCandidate): boolean => allowed.has(c.schemaId));
    }

    if (filter.relationKeys && filter.relationKeys.length > 0) {
        const allowed = new Set(filter.relationKeys);
        result = result.filter((c: RetrievalCandidate): boolean => {
            return (c.relationKeys ?? []).some((k: string): boolean => allowed.has(k));
        });
    }

    if (filter.worldKeys && filter.worldKeys.length > 0) {
        const allowed = new Set(filter.worldKeys);
        result = result.filter((c: RetrievalCandidate): boolean => {
            return (c.worldKeys ?? []).some((k: string): boolean => allowed.has(k));
        });
    }

    if (filter.locationKeys && filter.locationKeys.length > 0) {
        const allowed = new Set(filter.locationKeys);
        result = result.filter((c: RetrievalCandidate): boolean => {
            return !!c.locationKey && allowed.has(c.locationKey);
        });
    }

    if (filter.compareKeys && filter.compareKeys.length > 0) {
        const allowed = new Set(filter.compareKeys);
        result = result.filter((c: RetrievalCandidate): boolean => {
            return !!c.compareKey && allowed.has(c.compareKey);
        });
    }

    return result;
}
