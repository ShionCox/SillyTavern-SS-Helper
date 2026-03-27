import type { MemoryEntry, RoleEntryMemory, ActorMemoryProfile } from '../../../types';
import type { WorkbenchMemoryGraph, WorkbenchMemoryGraphNode, WorkbenchMemoryGraphEdge } from './memoryGraphTypes';

/**
 * 功能：把 MemoryEntry[] 转换为记忆图谱数据。
 * @param entries 记忆条目列表。
 * @param roleMemories 角色记忆绑定列表。
 * @param actors 角色列表。
 * @returns 记忆图谱数据。
 */
export function buildMemoryGraph(
    entries: MemoryEntry[],
    roleMemories: RoleEntryMemory[],
    actors: ActorMemoryProfile[],
): WorkbenchMemoryGraph {
    if (entries.length <= 0) {
        return { nodes: [], edges: [] };
    }

    // 为每个 entry 计算平均 memoryPercent
    const entryMemoryMap = new Map<string, number>();
    const entryActorMap = new Map<string, string[]>();
    for (const rm of roleMemories) {
        if (rm.forgotten) continue;
        entryMemoryMap.set(rm.entryId, Math.max(entryMemoryMap.get(rm.entryId) ?? 0, rm.memoryPercent));
        const actorList = entryActorMap.get(rm.entryId) ?? [];
        if (!actorList.includes(rm.actorKey)) actorList.push(rm.actorKey);
        entryActorMap.set(rm.entryId, actorList);
    }

    // 构建节点
    const nodes: WorkbenchMemoryGraphNode[] = entries.map((entry): WorkbenchMemoryGraphNode => {
        const memoryPercent = entryMemoryMap.get(entry.entryId) ?? 50;
        const importance = computeEntryImportance(entry);
        return {
            id: `mg-${entry.entryId}`,
            entryId: entry.entryId,
            label: entry.title || '未命名',
            type: entry.entryType,
            category: entry.category,
            memoryPercent,
            importance,
            tags: entry.tags,
            summary: entry.summary,
            detail: entry.detail,
            updatedAt: entry.updatedAt,
            x: 0,
            y: 0,
        };
    });

    // 构建边
    const edges: WorkbenchMemoryGraphEdge[] = [];
    const edgeSet = new Set<string>();
    const nodeById = new Map(nodes.map(n => [n.entryId, n]));

    // 按结构关系建边 (精简连接，避免全连接网)
    // participants: 共享参与者的条目互连
    buildEdgesByField(entries, 'participants', 'participants', 0.7, edges, edgeSet);
    buildEdgesByField(entries, 'locationKey', 'location', 0.5, edges, edgeSet);
    buildEdgesByField(entries, 'sourceSummaryIds', 'sourceSummary', 0.4, edges, edgeSet);
    // sourceActorKey/targetActorKey 不用 buildEdgesByField，因为它会把所有同值条目互连
    // 条目→角色画像的连线由下面的 actorRef 机制处理
    
    // 移除按模糊标签(tags)和worldKeys大范围建边，避免视觉上每个点都连在一起
    // 只有强关联才连线

    // 构建 actorKey → actor_profile entryId 映射
    const actorProfileMap = new Map<string, string>();
    for (const entry of entries) {
        if (entry.entryType === 'actor_profile') {
            // 通过 roleMemories 找到该 entry 绑定的 actorKey
            const boundActors = entryActorMap.get(entry.entryId) ?? [];
            for (const ak of boundActors) {
                actorProfileMap.set(ak, entry.entryId);
            }
        }
    }
    // 补充：也可通过 actors 列表的 displayName 匹配 entry.title
    for (const actor of actors) {
        if (actorProfileMap.has(actor.actorKey)) continue;
        const matchEntry = entries.find(e => e.entryType === 'actor_profile' && e.title === actor.displayName);
        if (matchEntry) {
            actorProfileMap.set(actor.actorKey, matchEntry.entryId);
        }
    }

    // 将引用了 actorKey 的条目直接连到对应的 actor_profile 条目
    for (const entry of entries) {
        if (entry.entryType === 'actor_profile') continue;
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};
        
        // 收集该条目引用的所有 actorKey（从 detailPayload 字段）
        const referencedActorKeys = new Set<string>();
        for (const field of ['participants', 'sourceActorKey', 'targetActorKey'] as const) {
            const raw = payload[field];
            if (Array.isArray(raw)) {
                for (const v of raw) {
                    const key = String(v ?? '').trim().toLowerCase();
                    if (key) referencedActorKeys.add(key);
                }
            } else if (typeof raw === 'string' && raw.trim()) {
                referencedActorKeys.add(raw.trim().toLowerCase());
            }
        }

        // 从 RoleEntryMemory 绑定中补充（角色引用）
        const boundActors = entryActorMap.get(entry.entryId) ?? [];
        for (const ak of boundActors) {
            referencedActorKeys.add(ak.toLowerCase());
        }

        for (const ak of referencedActorKeys) {
            const profileEntryId = actorProfileMap.get(ak);
            if (!profileEntryId || profileEntryId === entry.entryId) continue;
            const edgeKey = `${entry.entryId}:${profileEntryId}:actorRef`;
            if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                edges.push({
                    id: edgeKey,
                    source: `mg-${entry.entryId}`,
                    target: `mg-${profileEntryId}`,
                    edgeType: 'actorRef',
                    weight: 0.7,
                });
            }
        }
    }

    // 力导向布局
    applyForceLayout(nodes, edges);

    return { nodes, edges };
}

/**
 * 功能：根据条目计算重要度。
 * @param entry 记忆条目。
 * @returns 0~1 重要度。
 */
function computeEntryImportance(entry: MemoryEntry): number {
    let score = 0.3;
    // 有 summary 加分
    if (entry.summary && entry.summary.length > 20) score += 0.15;
    // 有 tags 加分
    if (entry.tags && entry.tags.length > 0) score += 0.1;
    // 有 detail 加分
    if (entry.detail && entry.detail.length > 50) score += 0.15;
    // 最近更新加分
    const age = Date.now() - (entry.updatedAt || 0);
    if (age < 7 * 24 * 3600 * 1000) score += 0.15;
    else if (age < 30 * 24 * 3600 * 1000) score += 0.1;
    // 关键类型加分
    const type = (entry.entryType ?? '').toLowerCase();
    if (type === 'relationship' || type === 'event' || type === 'actor_visible_event') score += 0.1;
    return Math.min(1, score);
}

/**
 * 功能：按 detailPayload 中的数组字段或固定字段建边。
 * @param entries 条目列表。
 * @param fieldName 字段名。
 * @param edgeType 边类型。
 * @param weight 边权重。
 * @param edges 边列表。
 * @param edgeSet 边去重集合。
 */
function buildEdgesByField(
    entries: MemoryEntry[],
    fieldName: string,
    edgeType: string,
    weight: number,
    edges: WorkbenchMemoryGraphEdge[],
    edgeSet: Set<string>,
): void {
    // 构建反向索引：字段值 → entryId[]
    const reverseIndex = new Map<string, string[]>();

    for (const entry of entries) {
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};
        let values: string[] = [];

        if (fieldName === 'tags') {
            values = (entry.tags ?? []).map(t => String(t).toLowerCase()).filter(Boolean);
        } else if (fieldName === 'sourceSummaryIds') {
            values = (entry.sourceSummaryIds ?? []).filter(Boolean);
        } else if (fieldName === 'locationKey') {
            const loc = String(payload.locationKey ?? payload.location ?? '').trim().toLowerCase();
            if (loc) values = [loc];
        } else {
            const raw = payload[fieldName];
            if (Array.isArray(raw)) {
                values = raw.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean);
            } else if (typeof raw === 'string' && raw.trim()) {
                values = [raw.trim().toLowerCase()];
            }
        }

        for (const val of values) {
            const list = reverseIndex.get(val);
            if (list) list.push(entry.entryId);
            else reverseIndex.set(val, [entry.entryId]);
        }
    }

    // 相同值的条目间建边
    for (const [, group] of reverseIndex) {
        if (group.length <= 1) continue;
        for (let i = 0; i < group.length && i < 20; i++) {
            for (let j = i + 1; j < group.length && j < 20; j++) {
                const edgeKey = `${group[i]}:${group[j]}:${edgeType}`;
                if (edgeSet.has(edgeKey)) continue;
                edgeSet.add(edgeKey);
                edges.push({
                    id: edgeKey,
                    source: `mg-${group[i]}`,
                    target: `mg-${group[j]}`,
                    edgeType,
                    weight,
                });
            }
        }
    }
}

/**
 * 功能：简化版力导向布局。
 * @param nodes 节点列表。
 * @param edges 边列表。
 */
function applyForceLayout(nodes: WorkbenchMemoryGraphNode[], edges: WorkbenchMemoryGraphEdge[]): void {
    const count = nodes.length;
    if (count <= 0) return;

    if (count === 1) {
        nodes[0].x = 0;
        nodes[0].y = 0;
        return;
    }

    // 伪随机数生成器，保证每次相同数量/顺序节点生成一样的位置
    let seed = 12345;
    const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280.0;
    };

    // 初始化：添加随机抖动，让其更像真实的神经元网络
    const radius = Math.max(150, count * 20);
    for (let i = 0; i < count; i++) {
        const baseAngle = (i / count) * Math.PI * 2;
        const angle = baseAngle + (random() - 0.5) * 0.5; // Randomize angle slightly
        const jitterRadius = radius * (0.5 + random() * 0.8); // Randomize spread
        nodes[i].x = Math.cos(angle) * jitterRadius;
        nodes[i].y = Math.sin(angle) * jitterRadius;
    }

    const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));
    const edgePairs = edges.map(e => ({
        source: nodeIndexMap.get(e.source) ?? -1,
        target: nodeIndexMap.get(e.target) ?? -1,
    })).filter(e => e.source >= 0 && e.target >= 0);

    // 迭代
    const iterations = Math.min(100, Math.max(60, count * 2));
    const repulsionStrength = 35000;
    const springStrength = 0.02;
    const idealLength = Math.max(160, 300 - count);
    const centerStrength = 0.001;
    const damping = 0.92;

    const velocityX = new Float64Array(count);
    const velocityY = new Float64Array(count);

    for (let iter = 0; iter < iterations; iter++) {
        const temperature = 1 - iter / iterations;

        // 排斥力
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const distSq = dx * dx + dy * dy + 1;
                const force = repulsionStrength * temperature / distSq;
                const dist = Math.sqrt(distSq);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                velocityX[i] += fx;
                velocityY[i] += fy;
                velocityX[j] -= fx;
                velocityY[j] -= fy;
            }
        }

        // 弹簧力
        for (const edge of edgePairs) {
            const si = edge.source;
            const ti = edge.target;
            const dx = nodes[ti].x - nodes[si].x;
            const dy = nodes[ti].y - nodes[si].y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const displacement = dist - idealLength;
            const force = springStrength * displacement * temperature;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            velocityX[si] += fx;
            velocityY[si] += fy;
            velocityX[ti] -= fx;
            velocityY[ti] -= fy;
        }

        // 中心引力
        for (let i = 0; i < count; i++) {
            velocityX[i] -= nodes[i].x * centerStrength;
            velocityY[i] -= nodes[i].y * centerStrength;
        }

        // 应用速度
        for (let i = 0; i < count; i++) {
            velocityX[i] *= damping;
            velocityY[i] *= damping;

            const maxMove = 50 * temperature + 2;
            const vLen = Math.sqrt(velocityX[i] ** 2 + velocityY[i] ** 2);
            if (vLen > maxMove) {
                velocityX[i] = (velocityX[i] / vLen) * maxMove;
                velocityY[i] = (velocityY[i] / vLen) * maxMove;
            }

            nodes[i].x += velocityX[i];
            nodes[i].y += velocityY[i];
        }
    }

    // 取整
    for (const node of nodes) {
        node.x = Math.round(node.x);
        node.y = Math.round(node.y);
    }
}
