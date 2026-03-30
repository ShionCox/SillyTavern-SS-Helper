import { buildMemoryGraphEdgeLedger } from '../../../core/graph-edge-builder';
import type { MemoryEntry, RoleEntryMemory, ActorMemoryProfile } from '../../../types';
import type {
    WorkbenchMemoryGraph,
    WorkbenchMemoryGraphNode,
    WorkbenchMemoryGraphEdge,
    MemoryGraphMode,
    EdgeStrengthLevel,
} from './memoryGraphTypes';

/**
 * 功能：把 MemoryEntry[] 转换为记忆图谱数据。
 * @param entries 条目列表。
 * @param roleMemories 角色绑定列表。
 * @param actors 角色画像列表。
 * @returns 图谱数据。
 */
export function buildMemoryGraph(
    entries: MemoryEntry[],
    roleMemories: RoleEntryMemory[],
    actors: ActorMemoryProfile[],
): WorkbenchMemoryGraph {
    if (entries.length <= 0) {
        return { nodes: [], edges: [] };
    }

    const entryMemoryMap = new Map<string, number>();
    const entryActorMap = new Map<string, string[]>();
    for (const roleMemory of roleMemories) {
        if (roleMemory.forgotten) {
            continue;
        }
        entryMemoryMap.set(roleMemory.entryId, Math.max(entryMemoryMap.get(roleMemory.entryId) ?? 0, roleMemory.memoryPercent));
        const actorKeys = entryActorMap.get(roleMemory.entryId) ?? [];
        if (!actorKeys.includes(roleMemory.actorKey)) {
            actorKeys.push(roleMemory.actorKey);
        }
        entryActorMap.set(roleMemory.entryId, actorKeys);
    }

    const nodes: WorkbenchMemoryGraphNode[] = entries.map((entry: MemoryEntry): WorkbenchMemoryGraphNode => {
        const payload = toRecord(entry.detailPayload);
        const fields = toRecord(payload.fields);
        const bindings = toRecord(payload.bindings);
        return {
            id: `mg-${entry.entryId}`,
            entryId: entry.entryId,
            label: entry.title || '未命名',
            type: entry.entryType,
            category: entry.category,
            memoryPercent: entryMemoryMap.get(entry.entryId) ?? 50,
            importance: computeEntryImportance(entry),
            tags: entry.tags,
            summary: entry.summary,
            detail: entry.detail,
            updatedAt: entry.updatedAt,
            x: 0,
            y: 0,
            semanticSummary: entry.summary || entry.detail || '',
            debugSummary: stringifyDebugSummary({
                compareKey: String(payload.compareKey ?? fields.compareKey ?? '').trim(),
                reasonCodes: toStringArray(payload.reasonCodes),
                sourceBatchIds: toStringArray(payload.sourceBatchIds ?? toRecord(payload.takeover).sourceBatchIds),
            }),
            compareKey: String(payload.compareKey ?? fields.compareKey ?? '').trim() || undefined,
            sourceBatchIds: toStringArray(payload.sourceBatchIds ?? toRecord(payload.takeover).sourceBatchIds),
            reasonCodes: toStringArray(payload.reasonCodes),
            bindings,
        };
    });

    const nodeIdByEntryId = new Map(nodes.map((node: WorkbenchMemoryGraphNode): [string, string] => [node.entryId, node.id]));
    const edgeLedger = buildMemoryGraphEdgeLedger(entries);
    const edges: WorkbenchMemoryGraphEdge[] = edgeLedger
        .map((record): WorkbenchMemoryGraphEdge | null => {
            const source = nodeIdByEntryId.get(record.sourceEntryId);
            const target = nodeIdByEntryId.get(record.targetEntryId);
            if (!source || !target) {
                return null;
            }
            return {
                id: record.edgeId,
                source,
                target,
                edgeType: record.relationType,
                weight: clamp(record.confidence, 0.2, 1),
                reasons: record.reasonCodes,
                strengthLevel: resolveStrengthLevel(record.confidence),
                visibleInModes: resolveVisibleModes(record),
                semanticLabel: record.semanticLabel,
                debugSummary: record.debugSummary,
                sourceKinds: record.sourceKinds,
                sourceBatchIds: record.sourceBatchIds,
                reasonCodes: record.reasonCodes,
                confidence: record.confidence,
                status: record.status,
            };
        })
        .filter((edge): edge is WorkbenchMemoryGraphEdge => edge !== null);

    buildRoleBindingEdges(entries, actors, entryActorMap, nodeIdByEntryId, edges);
    applyForceLayout(nodes, edges);
    return { nodes, edges };
}

/**
 * 功能：补充角色绑定边，便于任务和实体追溯到角色。
 * @param entries 条目列表。
 * @param actors 角色列表。
 * @param entryActorMap 条目角色绑定映射。
 * @param nodeIdByEntryId 节点映射。
 * @param edges 现有边列表。
 */
function buildRoleBindingEdges(
    entries: MemoryEntry[],
    actors: ActorMemoryProfile[],
    entryActorMap: Map<string, string[]>,
    nodeIdByEntryId: Map<string, string>,
    edges: WorkbenchMemoryGraphEdge[],
): void {
    const edgeIds = new Set(edges.map((edge: WorkbenchMemoryGraphEdge): string => edge.id));
    const actorEntryIdByKey = new Map<string, string>();
    for (const entry of entries) {
        if (entry.entryType !== 'actor_profile') {
            continue;
        }
        const actorKeys = entryActorMap.get(entry.entryId) ?? [];
        for (const actorKey of actorKeys) {
            actorEntryIdByKey.set(actorKey, entry.entryId);
        }
    }
    for (const actor of actors) {
        if (!actorEntryIdByKey.has(actor.actorKey)) {
            const matchedEntry = entries.find((entry: MemoryEntry): boolean => {
                return entry.entryType === 'actor_profile' && entry.title === actor.displayName;
            });
            if (matchedEntry) {
                actorEntryIdByKey.set(actor.actorKey, matchedEntry.entryId);
            }
        }
    }
    for (const entry of entries) {
        if (entry.entryType === 'actor_profile') {
            continue;
        }
        const actorKeys = entryActorMap.get(entry.entryId) ?? [];
        for (const actorKey of actorKeys) {
            const actorEntryId = actorEntryIdByKey.get(actorKey);
            const source = nodeIdByEntryId.get(entry.entryId);
            const target = actorEntryId ? nodeIdByEntryId.get(actorEntryId) : undefined;
            if (!source || !target || source === target) {
                continue;
            }
            const edgeId = `${entry.entryId}:${actorEntryId}:role_binding`;
            if (edgeIds.has(edgeId)) {
                continue;
            }
            edgeIds.add(edgeId);
            edges.push({
                id: edgeId,
                source,
                target,
                edgeType: 'role_binding',
                weight: 0.58,
                reasons: ['role_memory_binding'],
                strengthLevel: 'normal',
                visibleInModes: ['semantic', 'debug'],
                semanticLabel: '关联角色',
                debugSummary: `roleMemory 绑定 ${actorKey}`,
                sourceKinds: ['role_memory'],
                sourceBatchIds: [],
                reasonCodes: ['role_memory_binding'],
                confidence: 0.58,
                status: 'active',
            });
        }
    }
}

/**
 * 功能：解析边的显示模式。
 * @param record 图边账本记录。
 * @returns 可见模式列表。
 */
function resolveVisibleModes(record: { confidence: number; sourceKinds: string[] }): MemoryGraphMode[] {
    if (record.confidence >= 0.7) {
        return ['compact', 'semantic', 'debug'];
    }
    if (record.sourceKinds.includes('role_memory')) {
        return ['semantic', 'debug'];
    }
    return ['debug', 'semantic'];
}

/**
 * 功能：根据置信度解析边强度。
 * @param confidence 置信度。
 * @returns 强度等级。
 */
function resolveStrengthLevel(confidence: number): EdgeStrengthLevel {
    if (confidence >= 0.75) {
        return 'strong';
    }
    if (confidence >= 0.45) {
        return 'normal';
    }
    return 'weak';
}

/**
 * 功能：计算条目重要度。
 * @param entry 条目。
 * @returns 重要度。
 */
function computeEntryImportance(entry: MemoryEntry): number {
    let score = 0.3;
    if (entry.summary && entry.summary.length > 20) {
        score += 0.15;
    }
    if (entry.tags && entry.tags.length > 0) {
        score += 0.1;
    }
    if (entry.detail && entry.detail.length > 50) {
        score += 0.15;
    }
    const age = Date.now() - (entry.updatedAt || 0);
    if (age < 7 * 24 * 3600 * 1000) {
        score += 0.15;
    } else if (age < 30 * 24 * 3600 * 1000) {
        score += 0.1;
    }
    if (entry.entryType === 'task' || entry.entryType === 'event' || entry.entryType === 'relationship') {
        score += 0.1;
    }
    return Math.min(1, score);
}

/**
 * 功能：生成调试摘要文本。
 * @param input 调试信息。
 * @returns 调试摘要。
 */
function stringifyDebugSummary(input: {
    compareKey: string;
    reasonCodes: string[];
    sourceBatchIds: string[];
}): string {
    const parts: string[] = [];
    if (input.compareKey) {
        parts.push(`compareKey=${input.compareKey}`);
    }
    if (input.reasonCodes.length > 0) {
        parts.push(`reasonCodes=${input.reasonCodes.join(',')}`);
    }
    if (input.sourceBatchIds.length > 0) {
        parts.push(`batches=${input.sourceBatchIds.join(',')}`);
    }
    return parts.join(' | ');
}

/**
 * 功能：应用简化的力导向布局。
 * @param nodes 节点列表。
 * @param edges 边列表。
 */
function applyForceLayout(nodes: WorkbenchMemoryGraphNode[], edges: WorkbenchMemoryGraphEdge[]): void {
    const count = nodes.length;
    if (count <= 0) {
        return;
    }
    if (count === 1) {
        nodes[0].x = 0;
        nodes[0].y = 0;
        return;
    }

    let seed = 12345;
    const random = (): number => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280.0;
    };

    const radius = Math.max(150, count * 20);
    for (let i = 0; i < count; i += 1) {
        const baseAngle = (i / count) * Math.PI * 2;
        const angle = baseAngle + ((random() - 0.5) * 0.5);
        const jitterRadius = radius * (0.5 + (random() * 0.8));
        nodes[i].x = Math.cos(angle) * jitterRadius;
        nodes[i].y = Math.sin(angle) * jitterRadius;
    }

    const nodeIndexMap = new Map(nodes.map((node, index): [string, number] => [node.id, index]));
    const edgePairs = edges.map((edge) => ({
        source: nodeIndexMap.get(edge.source) ?? -1,
        target: nodeIndexMap.get(edge.target) ?? -1,
    })).filter((edge) => edge.source >= 0 && edge.target >= 0);

    const iterations = Math.min(100, Math.max(60, count * 2));
    const repulsionStrength = 35000;
    const springStrength = 0.02;
    const idealLength = Math.max(160, 300 - count);
    const centerStrength = 0.001;
    const damping = 0.92;
    const velocityX = new Float64Array(count);
    const velocityY = new Float64Array(count);

    for (let iter = 0; iter < iterations; iter += 1) {
        const temperature = 1 - (iter / iterations);
        for (let i = 0; i < count; i += 1) {
            for (let j = i + 1; j < count; j += 1) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const distSq = (dx * dx) + (dy * dy) + 1;
                const force = (repulsionStrength * temperature) / distSq;
                const dist = Math.sqrt(distSq);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                velocityX[i] += fx;
                velocityY[i] += fy;
                velocityX[j] -= fx;
                velocityY[j] -= fy;
            }
        }
        for (const edge of edgePairs) {
            const dx = nodes[edge.target].x - nodes[edge.source].x;
            const dy = nodes[edge.target].y - nodes[edge.source].y;
            const dist = Math.sqrt((dx * dx) + (dy * dy)) + 0.01;
            const displacement = dist - idealLength;
            const force = springStrength * displacement * temperature;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            velocityX[edge.source] += fx;
            velocityY[edge.source] += fy;
            velocityX[edge.target] -= fx;
            velocityY[edge.target] -= fy;
        }
        for (let i = 0; i < count; i += 1) {
            velocityX[i] -= nodes[i].x * centerStrength;
            velocityY[i] -= nodes[i].y * centerStrength;
            velocityX[i] *= damping;
            velocityY[i] *= damping;
            const maxMove = (50 * temperature) + 2;
            const speed = Math.sqrt((velocityX[i] ** 2) + (velocityY[i] ** 2));
            if (speed > maxMove) {
                velocityX[i] = (velocityX[i] / speed) * maxMove;
                velocityY[i] = (velocityY[i] / speed) * maxMove;
            }
            nodes[i].x += velocityX[i];
            nodes[i].y += velocityY[i];
        }
    }

    for (const node of nodes) {
        node.x = Math.round(node.x);
        node.y = Math.round(node.y);
    }
}

/**
 * 功能：把未知值归一化为对象。
 * @param value 原始值。
 * @returns 对象。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：把未知值归一化为字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): string => String(item ?? '').trim())
        .filter(Boolean);
}

/**
 * 功能：限制数值范围。
 * @param value 原始值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 归一化后的数值。
 */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
