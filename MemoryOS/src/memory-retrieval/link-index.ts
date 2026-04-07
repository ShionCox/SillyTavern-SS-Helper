import type { RetrievalCandidate } from './types';

/**
 * 功能：邻居边信息。
 */
export interface CandidateNeighborEdge {
    targetId: string;
    edgeType: string;
    edgeWeight: number;
}

/**
 * 功能：候选记忆邻接索引。
 */
export interface CandidateLinkIndex {
    neighborsOf(candidateId: string): CandidateNeighborEdge[];
}

/**
 * 功能：边类型 → 默认权重映射。
 */
const EDGE_WEIGHT_MAP: Record<string, number> = {
    relation: 0.22,
    participants: 0.16,
    location: 0.12,
    sourceSummary: 0.10,
    tags: 0.06,
    category: 0.04,
    actor: 0.16,
    world: 0.12,
};

/**
 * 功能：从候选记忆列表构建运行时轻量邻接索引。
 * @param candidates 候选记忆列表。
 * @returns 邻接索引实例。
 */
export function buildCandidateLinkIndex(candidates: RetrievalCandidate[]): CandidateLinkIndex {
    const adjacency = new Map<string, CandidateNeighborEdge[]>();

    // 构建反向索引：属性值 → candidateId[]
    const actorIndex = new Map<string, string[]>();
    const relationIndex = new Map<string, string[]>();
    const participantIndex = new Map<string, string[]>();
    const locationIndex = new Map<string, string[]>();
    const sourceSummaryIndex = new Map<string, string[]>();
    const tagIndex = new Map<string, string[]>();
    const categoryIndex = new Map<string, string[]>();
    const worldIndex = new Map<string, string[]>();

    for (const candidate of candidates) {
        const cid = candidate.candidateId;

        for (const key of candidate.actorKeys ?? []) {
            appendToIndex(actorIndex, key, cid);
        }
        for (const key of candidate.relationKeys ?? []) {
            appendToIndex(relationIndex, key, cid);
        }
        for (const key of candidate.participantActorKeys ?? []) {
            appendToIndex(participantIndex, key, cid);
        }
        if (candidate.locationKey) {
            appendToIndex(locationIndex, candidate.locationKey, cid);
        }
        for (const sid of candidate.sourceSummaryIds ?? []) {
            appendToIndex(sourceSummaryIndex, sid, cid);
        }
        for (const tag of candidate.tags ?? []) {
            appendToIndex(tagIndex, tag, cid);
        }
        if (candidate.category) {
            appendToIndex(categoryIndex, candidate.category, cid);
        }
        for (const key of candidate.worldKeys ?? []) {
            appendToIndex(worldIndex, key, cid);
        }
    }

    // 遍历所有反向索引，建立双向边
    addEdgesFromIndex(adjacency, actorIndex, 'actor', EDGE_WEIGHT_MAP.actor);
    addEdgesFromIndex(adjacency, relationIndex, 'relation', EDGE_WEIGHT_MAP.relation);
    addEdgesFromIndex(adjacency, participantIndex, 'participants', EDGE_WEIGHT_MAP.participants);
    addEdgesFromIndex(adjacency, locationIndex, 'location', EDGE_WEIGHT_MAP.location);
    addEdgesFromIndex(adjacency, sourceSummaryIndex, 'sourceSummary', EDGE_WEIGHT_MAP.sourceSummary);
    addEdgesFromIndex(adjacency, tagIndex, 'tags', EDGE_WEIGHT_MAP.tags);
    addEdgesFromIndex(adjacency, categoryIndex, 'category', EDGE_WEIGHT_MAP.category);
    addEdgesFromIndex(adjacency, worldIndex, 'world', EDGE_WEIGHT_MAP.world);

    return {
        neighborsOf(candidateId: string): CandidateNeighborEdge[] {
            return adjacency.get(candidateId) ?? [];
        },
    };
}

/**
 * 功能：向反向索引中追加条目。
 * @param index 反向索引。
 * @param key 索引键。
 * @param candidateId 候选 ID。
 */
function appendToIndex(index: Map<string, string[]>, key: string, candidateId: string): void {
    const normalized = String(key ?? '').trim().toLowerCase();
    if (!normalized) return;
    const list = index.get(normalized);
    if (list) {
        list.push(candidateId);
    } else {
        index.set(normalized, [candidateId]);
    }
}

/**
 * 功能：从反向索引建立邻接边。
 * @param adjacency 邻接表。
 * @param index 反向索引。
 * @param edgeType 边类型。
 * @param edgeWeight 边权重。
 */
function addEdgesFromIndex(
    adjacency: Map<string, CandidateNeighborEdge[]>,
    index: Map<string, string[]>,
    edgeType: string,
    edgeWeight: number,
): void {
    for (const [, group] of index) {
        if (group.length <= 1) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];
                addEdge(adjacency, a, b, edgeType, edgeWeight);
                addEdge(adjacency, b, a, edgeType, edgeWeight);
            }
        }
    }
}

/**
 * 功能：添加单向边，同一对节点同一类型只保留最大权重。
 * @param adjacency 邻接表。
 * @param source 源节点。
 * @param target 目标节点。
 * @param edgeType 边类型。
 * @param edgeWeight 边权重。
 */
function addEdge(
    adjacency: Map<string, CandidateNeighborEdge[]>,
    source: string,
    target: string,
    edgeType: string,
    edgeWeight: number,
): void {
    let neighbors = adjacency.get(source);
    if (!neighbors) {
        neighbors = [];
        adjacency.set(source, neighbors);
    }
    const existing = neighbors.find(e => e.targetId === target && e.edgeType === edgeType);
    if (existing) {
        existing.edgeWeight = Math.max(existing.edgeWeight, edgeWeight);
    } else {
        neighbors.push({ targetId: target, edgeType, edgeWeight });
    }
}
