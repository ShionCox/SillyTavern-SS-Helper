import type { SummarySnapshot, MemoryEntry, MemoryRelationshipRecord } from '../types';
import type { DreamNeuronEdge, DreamNeuronNode, DreamRecallCandidate, DreamRecallHit } from '../services/dream-types';

type NodeMap = Map<string, DreamNeuronNode>;
type EdgeMap = Map<string, DreamNeuronEdge>;

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
}

function ensureNode(
    nodes: NodeMap,
    input: Omit<DreamNeuronNode, 'activation' | 'novelty'> & Partial<Pick<DreamNeuronNode, 'activation' | 'novelty'>>,
): DreamNeuronNode {
    const existing = nodes.get(input.nodeKey);
    if (existing) {
        existing.rarity = Math.max(existing.rarity, input.rarity);
        existing.lastSeenAt = Math.max(existing.lastSeenAt, input.lastSeenAt);
        existing.usageCount += input.usageCount;
        return existing;
    }
    const created: DreamNeuronNode = {
        ...input,
        activation: input.activation ?? 0,
        novelty: input.novelty ?? 0,
    };
    nodes.set(created.nodeKey, created);
    return created;
}

function ensureEdge(edges: EdgeMap, input: DreamNeuronEdge): void {
    const existing = edges.get(input.edgeKey);
    if (existing) {
        existing.weight = Math.max(existing.weight, input.weight);
        existing.lastActivatedAt = Math.max(existing.lastActivatedAt, input.lastActivatedAt);
        existing.evidenceEntryIds = Array.from(new Set([...existing.evidenceEntryIds, ...input.evidenceEntryIds]));
        return;
    }
    edges.set(input.edgeKey, input);
}

function buildNodeKey(prefix: string, value: string): string {
    return `${prefix}:${value}`;
}

function buildEdgeKey(fromNodeKey: string, toNodeKey: string, edgeType: DreamNeuronEdge['edgeType']): string {
    return `${edgeType}:${fromNodeKey}->${toNodeKey}`;
}

export function buildDreamNeuronGraph(input: {
    chatKey: string;
    entries: MemoryEntry[];
    relationships: MemoryRelationshipRecord[];
    summaries: SummarySnapshot[];
}): {
    nodes: DreamNeuronNode[];
    edges: DreamNeuronEdge[];
    entryNodeMap: Map<string, string[]>;
} {
    const nodes: NodeMap = new Map();
    const edges: EdgeMap = new Map();
    const entryNodeMap = new Map<string, string[]>();

    for (const entry of input.entries) {
        const nodeKeys: string[] = [];
        const entryNode = ensureNode(nodes, {
            nodeKey: buildNodeKey('entry', entry.entryId),
            nodeType: 'entry',
            label: entry.title || entry.entryId,
            rarity: 0.4,
            lastSeenAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
            usageCount: 1,
            chatKey: input.chatKey,
        });
        nodeKeys.push(entryNode.nodeKey);

        const actorKeys = normalizeTags((entry.detailPayload as { bindings?: { actors?: string[] } })?.bindings?.actors);
        for (const actorKey of actorKeys) {
            const actorNode = ensureNode(nodes, {
                nodeKey: buildNodeKey('actor', actorKey),
                nodeType: 'actor',
                label: actorKey,
                rarity: 0.55,
                lastSeenAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                usageCount: 1,
                chatKey: input.chatKey,
            });
            nodeKeys.push(actorNode.nodeKey);
            ensureEdge(edges, {
                edgeKey: buildEdgeKey(entryNode.nodeKey, actorNode.nodeKey, 'co_occurrence'),
                fromNodeKey: entryNode.nodeKey,
                toNodeKey: actorNode.nodeKey,
                edgeType: 'co_occurrence',
                weight: 0.72,
                lastActivatedAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                evidenceEntryIds: [entry.entryId],
            });
        }

        for (const tag of normalizeTags(entry.tags).slice(0, 8)) {
            const topicNode = ensureNode(nodes, {
                nodeKey: buildNodeKey('topic', tag),
                nodeType: 'topic',
                label: tag,
                rarity: 0.48,
                lastSeenAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                usageCount: 1,
                chatKey: input.chatKey,
            });
            nodeKeys.push(topicNode.nodeKey);
            ensureEdge(edges, {
                edgeKey: buildEdgeKey(entryNode.nodeKey, topicNode.nodeKey, 'co_occurrence'),
                fromNodeKey: entryNode.nodeKey,
                toNodeKey: topicNode.nodeKey,
                edgeType: 'co_occurrence',
                weight: 0.58,
                lastActivatedAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                evidenceEntryIds: [entry.entryId],
            });
        }

        for (const summaryId of entry.sourceSummaryIds.slice(0, 4)) {
            const summaryNode = ensureNode(nodes, {
                nodeKey: buildNodeKey('summary', summaryId),
                nodeType: 'summary',
                label: summaryId,
                rarity: 0.62,
                lastSeenAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                usageCount: 1,
                chatKey: input.chatKey,
            });
            nodeKeys.push(summaryNode.nodeKey);
            ensureEdge(edges, {
                edgeKey: buildEdgeKey(entryNode.nodeKey, summaryNode.nodeKey, 'summary_link'),
                fromNodeKey: entryNode.nodeKey,
                toNodeKey: summaryNode.nodeKey,
                edgeType: 'summary_link',
                weight: 0.54,
                lastActivatedAt: Number(entry.updatedAt ?? Date.now()) || Date.now(),
                evidenceEntryIds: [entry.entryId],
            });
        }

        entryNodeMap.set(entry.entryId, Array.from(new Set(nodeKeys)));
    }

    for (const relationship of input.relationships) {
        const relationNode = ensureNode(nodes, {
            nodeKey: buildNodeKey('relation', relationship.relationshipId),
            nodeType: 'relation',
            label: relationship.relationTag || relationship.relationshipId,
            rarity: 0.68,
            lastSeenAt: Number(relationship.updatedAt ?? Date.now()) || Date.now(),
            usageCount: 1,
            chatKey: input.chatKey,
        });
        const sourceNode = ensureNode(nodes, {
            nodeKey: buildNodeKey('actor', relationship.sourceActorKey),
            nodeType: 'actor',
            label: relationship.sourceActorKey,
            rarity: 0.55,
            lastSeenAt: Number(relationship.updatedAt ?? Date.now()) || Date.now(),
            usageCount: 1,
            chatKey: input.chatKey,
        });
        const targetNode = ensureNode(nodes, {
            nodeKey: buildNodeKey('actor', relationship.targetActorKey),
            nodeType: 'actor',
            label: relationship.targetActorKey,
            rarity: 0.55,
            lastSeenAt: Number(relationship.updatedAt ?? Date.now()) || Date.now(),
            usageCount: 1,
            chatKey: input.chatKey,
        });
        ensureEdge(edges, {
            edgeKey: buildEdgeKey(sourceNode.nodeKey, relationNode.nodeKey, 'relation'),
            fromNodeKey: sourceNode.nodeKey,
            toNodeKey: relationNode.nodeKey,
            edgeType: 'relation',
            weight: 0.82,
            lastActivatedAt: Number(relationship.updatedAt ?? Date.now()) || Date.now(),
            evidenceEntryIds: [],
        });
        ensureEdge(edges, {
            edgeKey: buildEdgeKey(relationNode.nodeKey, targetNode.nodeKey, 'relation'),
            fromNodeKey: relationNode.nodeKey,
            toNodeKey: targetNode.nodeKey,
            edgeType: 'relation',
            weight: 0.82,
            lastActivatedAt: Number(relationship.updatedAt ?? Date.now()) || Date.now(),
            evidenceEntryIds: [],
        });
    }

    for (const summary of input.summaries) {
        const summaryNode = ensureNode(nodes, {
            nodeKey: buildNodeKey('summary', summary.summaryId),
            nodeType: 'summary',
            label: summary.title || summary.summaryId,
            rarity: 0.65,
            lastSeenAt: Number(summary.updatedAt ?? Date.now()) || Date.now(),
            usageCount: 1,
            chatKey: input.chatKey,
        });
        for (const actorKey of normalizeTags(summary.actorKeys).slice(0, 6)) {
            const actorNode = ensureNode(nodes, {
                nodeKey: buildNodeKey('actor', actorKey),
                nodeType: 'actor',
                label: actorKey,
                rarity: 0.55,
                lastSeenAt: Number(summary.updatedAt ?? Date.now()) || Date.now(),
                usageCount: 1,
                chatKey: input.chatKey,
            });
            ensureEdge(edges, {
                edgeKey: buildEdgeKey(summaryNode.nodeKey, actorNode.nodeKey, 'summary_link'),
                fromNodeKey: summaryNode.nodeKey,
                toNodeKey: actorNode.nodeKey,
                edgeType: 'summary_link',
                weight: 0.46,
                lastActivatedAt: Number(summary.updatedAt ?? Date.now()) || Date.now(),
                evidenceEntryIds: [],
            });
        }
    }

    return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
        entryNodeMap,
    };
}

export function activateDreamNeuronGraph(input: {
    nodes: DreamNeuronNode[];
    edges: DreamNeuronEdge[];
    entryNodeMap: Map<string, string[]>;
    seeds: DreamRecallHit[];
    expandDepth: number;
}): {
    nodeActivationMap: Map<string, number>;
    bridgeNodeKeys: string[];
    activatedNodes: DreamNeuronNode[];
    activatedEdges: DreamNeuronEdge[];
} {
    const nodeMap = new Map(input.nodes.map((node: DreamNeuronNode): [string, DreamNeuronNode] => [node.nodeKey, { ...node }]));
    const adjacency = new Map<string, DreamNeuronEdge[]>();
    for (const edge of input.edges) {
        const fromEdges = adjacency.get(edge.fromNodeKey) ?? [];
        fromEdges.push(edge);
        adjacency.set(edge.fromNodeKey, fromEdges);
        const toEdges = adjacency.get(edge.toNodeKey) ?? [];
        toEdges.push(edge);
        adjacency.set(edge.toNodeKey, toEdges);
    }

    const activationMap = new Map<string, number>();
    let frontier = Array.from(new Set(input.seeds.flatMap((seed: DreamRecallHit): string[] => input.entryNodeMap.get(seed.entryId) ?? [])));
    frontier.forEach((nodeKey: string): void => {
        activationMap.set(nodeKey, 1);
    });

    for (let depth = 0; depth < Math.max(0, input.expandDepth); depth += 1) {
        const nextFrontier = new Set<string>();
        for (const nodeKey of frontier) {
            const currentActivation = activationMap.get(nodeKey) ?? 0;
            for (const edge of adjacency.get(nodeKey) ?? []) {
                const peerKey = edge.fromNodeKey === nodeKey ? edge.toNodeKey : edge.fromNodeKey;
                const nextActivation = Number((currentActivation * edge.weight * 0.72).toFixed(4));
                if (nextActivation <= (activationMap.get(peerKey) ?? 0)) {
                    continue;
                }
                activationMap.set(peerKey, nextActivation);
                nextFrontier.add(peerKey);
            }
        }
        frontier = Array.from(nextFrontier);
        if (frontier.length <= 0) {
            break;
        }
    }

    const activatedNodes = Array.from(activationMap.entries())
        .map(([nodeKey, activation]: [string, number]): DreamNeuronNode | null => {
            const node = nodeMap.get(nodeKey);
            if (!node) {
                return null;
            }
            node.activation = activation;
            node.novelty = computeDreamNodeNovelty(node);
            return node;
        })
        .filter((node: DreamNeuronNode | null): node is DreamNeuronNode => Boolean(node))
        .sort((left: DreamNeuronNode, right: DreamNeuronNode): number => right.activation - left.activation)
        .slice(0, 24);

    const activatedNodeSet = new Set(activatedNodes.map((node: DreamNeuronNode): string => node.nodeKey));
    const activatedEdges = input.edges
        .filter((edge: DreamNeuronEdge): boolean => activatedNodeSet.has(edge.fromNodeKey) && activatedNodeSet.has(edge.toNodeKey))
        .sort((left: DreamNeuronEdge, right: DreamNeuronEdge): number => right.weight - left.weight)
        .slice(0, 40);

    return {
        nodeActivationMap: activationMap,
        bridgeNodeKeys: activatedNodes
            .filter((node: DreamNeuronNode): boolean => node.nodeType !== 'entry')
            .slice(0, 8)
            .map((node: DreamNeuronNode): string => node.nodeKey),
        activatedNodes,
        activatedEdges,
    };
}

export function computeDreamNodeNovelty(node: Pick<DreamNeuronNode, 'rarity' | 'usageCount' | 'lastSeenAt'>): number {
    const usagePenalty = Math.min(0.4, Math.max(0, node.usageCount - 1) * 0.04);
    const ageDays = Math.max(0, (Date.now() - Number(node.lastSeenAt ?? Date.now())) / (24 * 3600000));
    const ageBoost = Math.min(0.28, ageDays / 365);
    return Math.max(0, Math.min(1, Number((node.rarity + ageBoost - usagePenalty).toFixed(4))));
}

export function selectCandidateNodeKeys(candidates: DreamRecallCandidate[]): string[] {
    return Array.from(new Set(candidates.flatMap((candidate: DreamRecallCandidate): string[] => [
        ...candidate.sourceNodeKeys,
        ...candidate.bridgeNodeKeys,
    ])));
}
