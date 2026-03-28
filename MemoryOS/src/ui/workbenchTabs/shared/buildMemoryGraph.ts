import type { MemoryEntry, RoleEntryMemory, ActorMemoryProfile } from '../../../types';
import type { WorkbenchMemoryGraph, WorkbenchMemoryGraphNode, WorkbenchMemoryGraphEdge, MemoryGraphMode, EdgeStrengthLevel } from './memoryGraphTypes';

/**
 * 功能：建边上下文，在各 build*Edges 函数间共享。
 */
interface EdgeBuildContext {
    entries: MemoryEntry[];
    entryActorMap: Map<string, string[]>;
    actorProfileMap: Map<string, string>;
    edges: WorkbenchMemoryGraphEdge[];
    edgeSet: Set<string>;
}

/**
 * 功能：添加一条边（去重）。
 */
function addEdge(
    ctx: EdgeBuildContext,
    sourceEntryId: string,
    targetEntryId: string,
    edgeType: string,
    weight: number,
    reasons: string[],
    strengthLevel: EdgeStrengthLevel,
    visibleInModes: MemoryGraphMode[],
): void {
    const edgeKey = `${sourceEntryId}:${targetEntryId}:${edgeType}`;
    if (ctx.edgeSet.has(edgeKey)) return;
    ctx.edgeSet.add(edgeKey);
    ctx.edges.push({
        id: edgeKey,
        source: `mg-${sourceEntryId}`,
        target: `mg-${targetEntryId}`,
        edgeType,
        weight,
        reasons,
        strengthLevel,
        visibleInModes,
    });
}

/**
 * 功能：把 MemoryEntry[] 转换为记忆图谱数据。
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

    // 构建 actorKey → actor_profile entryId 映射
    const actorProfileMap = new Map<string, string>();
    for (const entry of entries) {
        if (entry.entryType === 'actor_profile') {
            const boundActors = entryActorMap.get(entry.entryId) ?? [];
            for (const ak of boundActors) {
                actorProfileMap.set(ak, entry.entryId);
            }
        }
    }
    for (const actor of actors) {
        if (actorProfileMap.has(actor.actorKey)) continue;
        const matchEntry = entries.find(e => e.entryType === 'actor_profile' && e.title === actor.displayName);
        if (matchEntry) {
            actorProfileMap.set(actor.actorKey, matchEntry.entryId);
        }
    }

    const ctx: EdgeBuildContext = {
        entries,
        entryActorMap,
        actorProfileMap,
        edges: [],
        edgeSet: new Set(),
    };

    // 分步建边
    buildParticipantEdges(ctx);
    buildLocationEdges(ctx);
    buildSourceSummaryEdges(ctx);
    buildActorRefEdges(ctx);
    buildWorldEdges(ctx);
    buildTagEdges(ctx);

    // 力导向布局
    applyForceLayout(nodes, ctx.edges);

    return { nodes, edges: ctx.edges };
}

// ──────────────────── 分步建边函数 ────────────────────

/**
 * 功能：participants 边 —— 使用重叠比率 |A∩B|/|A∪B| >= 0.34。
 */
function buildParticipantEdges(ctx: EdgeBuildContext): void {
    // 收集每个 entry 的 participants 集合
    const entryParticipants = new Map<string, Set<string>>();
    for (const entry of ctx.entries) {
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};
        const raw = payload.participants;
        if (!Array.isArray(raw) || raw.length <= 0) continue;
        const participants = new Set(raw.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean));
        if (participants.size > 0) {
            entryParticipants.set(entry.entryId, participants);
        }
    }

    const entryIds = [...entryParticipants.keys()];
    for (let i = 0; i < entryIds.length && i < 200; i++) {
        const setA = entryParticipants.get(entryIds[i])!;
        for (let j = i + 1; j < entryIds.length && j < 200; j++) {
            const setB = entryParticipants.get(entryIds[j])!;

            // 计算 Jaccard overlap
            let intersection = 0;
            for (const p of setA) {
                if (setB.has(p)) intersection++;
            }
            const union = setA.size + setB.size - intersection;
            if (union <= 0) continue;
            const overlapRatio = intersection / union;

            if (overlapRatio < 0.34) continue;

            const isStrong = overlapRatio >= 0.6 || intersection >= 2;
            const weight = Math.min(0.9, 0.3 + overlapRatio * 0.6);
            const sharedNames = [...setA].filter(p => setB.has(p)).slice(0, 3);
            const strengthLevel: EdgeStrengthLevel = isStrong ? 'strong' : 'normal';

            addEdge(ctx, entryIds[i], entryIds[j], 'participants', weight,
                [`共享参与者(${(overlapRatio * 100).toFixed(0)}%): ${sharedNames.join(', ')}`],
                strengthLevel,
                ['compact', 'semantic', 'debug'],
            );
        }
    }
}

/**
 * 功能：location 边 —— 相同地点的条目互连。
 */
function buildLocationEdges(ctx: EdgeBuildContext): void {
    const locationIndex = new Map<string, string[]>();
    for (const entry of ctx.entries) {
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};
        const loc = String(payload.locationKey ?? payload.location ?? '').trim().toLowerCase();
        if (!loc) continue;
        const list = locationIndex.get(loc) ?? [];
        list.push(entry.entryId);
        locationIndex.set(loc, list);
    }

    for (const [loc, group] of locationIndex) {
        if (group.length <= 1) continue;
        for (let i = 0; i < group.length && i < 20; i++) {
            for (let j = i + 1; j < group.length && j < 20; j++) {
                addEdge(ctx, group[i], group[j], 'location', 0.5,
                    [`同地点: ${loc}`],
                    'normal',
                    ['compact', 'semantic', 'debug'],
                );
            }
        }
    }
}

/**
 * 功能：sourceSummary 边 —— 同一 summary 批次来源。
 */
function buildSourceSummaryEdges(ctx: EdgeBuildContext): void {
    const summaryIndex = new Map<string, string[]>();
    for (const entry of ctx.entries) {
        for (const sid of entry.sourceSummaryIds ?? []) {
            if (!sid) continue;
            const list = summaryIndex.get(sid) ?? [];
            list.push(entry.entryId);
            summaryIndex.set(sid, list);
        }
    }

    for (const [sid, group] of summaryIndex) {
        if (group.length <= 1) continue;
        for (let i = 0; i < group.length && i < 20; i++) {
            for (let j = i + 1; j < group.length && j < 20; j++) {
                addEdge(ctx, group[i], group[j], 'sourceSummary', 0.4,
                    [`来源同一批次: ${sid.slice(0, 12)}...`],
                    'weak',
                    ['compact', 'semantic', 'debug'],
                );
            }
        }
    }
}

/**
 * 功能：actorRef 边 —— 分为 ownerActorRef（条目的 source/target 角色）和 mentionedActorRef（仅参与/绑定）。
 */
function buildActorRefEdges(ctx: EdgeBuildContext): void {
    for (const entry of ctx.entries) {
        if (entry.entryType === 'actor_profile') continue;
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};

        // owner 级：sourceActorKey / targetActorKey 直接指定的角色
        const ownerKeys = new Set<string>();
        for (const field of ['sourceActorKey', 'targetActorKey'] as const) {
            const raw = payload[field];
            if (typeof raw === 'string' && raw.trim()) {
                ownerKeys.add(raw.trim().toLowerCase());
            }
        }

        // mentioned 级：participants + RoleEntryMemory 绑定
        const mentionedKeys = new Set<string>();
        const rawParticipants = payload.participants;
        if (Array.isArray(rawParticipants)) {
            for (const v of rawParticipants) {
                const key = String(v ?? '').trim().toLowerCase();
                if (key && !ownerKeys.has(key)) mentionedKeys.add(key);
            }
        }
        const boundActors = ctx.entryActorMap.get(entry.entryId) ?? [];
        for (const ak of boundActors) {
            const lk = ak.toLowerCase();
            if (!ownerKeys.has(lk)) mentionedKeys.add(lk);
        }

        // owner 级建边：权重 0.55
        for (const ak of ownerKeys) {
            const profileEntryId = ctx.actorProfileMap.get(ak);
            if (!profileEntryId || profileEntryId === entry.entryId) continue;
            addEdge(ctx, entry.entryId, profileEntryId, 'ownerActorRef', 0.55,
                [`主角色引用: ${ak}`],
                'strong',
                ['compact', 'semantic', 'debug'],
            );
        }

        // mentioned 级建边：权重 0.28
        for (const ak of mentionedKeys) {
            const profileEntryId = ctx.actorProfileMap.get(ak);
            if (!profileEntryId || profileEntryId === entry.entryId) continue;
            // 如果已经有 owner 边到同一 profile，跳过
            const ownerEdgeKey = `${entry.entryId}:${profileEntryId}:ownerActorRef`;
            if (ctx.edgeSet.has(ownerEdgeKey)) continue;
            addEdge(ctx, entry.entryId, profileEntryId, 'mentionedActorRef', 0.28,
                [`提及角色: ${ak}`],
                'weak',
                ['semantic', 'debug'],
            );
        }
    }
}

/**
 * 功能：worldKeys 边 —— 共享世界设定。仅在语义/调试模式可见。
 */
function buildWorldEdges(ctx: EdgeBuildContext): void {
    const worldIndex = new Map<string, string[]>();
    for (const entry of ctx.entries) {
        const payload = (entry.detailPayload && typeof entry.detailPayload === 'object') ? entry.detailPayload as Record<string, unknown> : {};
        const raw = payload.worldKeys;
        if (!Array.isArray(raw)) continue;
        for (const v of raw) {
            const key = String(v ?? '').trim().toLowerCase();
            if (!key) continue;
            const list = worldIndex.get(key) ?? [];
            list.push(entry.entryId);
            worldIndex.set(key, list);
        }
    }

    for (const [key, group] of worldIndex) {
        if (group.length <= 1) continue;
        for (let i = 0; i < group.length && i < 15; i++) {
            for (let j = i + 1; j < group.length && j < 15; j++) {
                addEdge(ctx, group[i], group[j], 'worldKey', 0.3,
                    [`共享世界设定: ${key}`],
                    'weak',
                    ['semantic', 'debug'],
                );
            }
        }
    }
}

/**
 * 功能：tag 边 —— 共享高置信标签。仅在语义/调试模式可见。
 */
function buildTagEdges(ctx: EdgeBuildContext): void {
    const tagIndex = new Map<string, string[]>();
    for (const entry of ctx.entries) {
        for (const tag of entry.tags ?? []) {
            const t = String(tag).trim().toLowerCase();
            if (!t) continue;
            const list = tagIndex.get(t) ?? [];
            list.push(entry.entryId);
            tagIndex.set(t, list);
        }
    }

    for (const [tag, group] of tagIndex) {
        if (group.length <= 1 || group.length > 10) continue; // 太泛的 tag 不建边
        for (let i = 0; i < group.length && i < 10; i++) {
            for (let j = i + 1; j < group.length && j < 10; j++) {
                addEdge(ctx, group[i], group[j], 'tag', 0.2,
                    [`共享标签: ${tag}`],
                    'weak',
                    ['semantic', 'debug'],
                );
            }
        }
    }
}

// ──────────────────── 工具函数 ────────────────────

/**
 * 功能：根据条目计算重要度。
 */
function computeEntryImportance(entry: MemoryEntry): number {
    let score = 0.3;
    if (entry.summary && entry.summary.length > 20) score += 0.15;
    if (entry.tags && entry.tags.length > 0) score += 0.1;
    if (entry.detail && entry.detail.length > 50) score += 0.15;
    const age = Date.now() - (entry.updatedAt || 0);
    if (age < 7 * 24 * 3600 * 1000) score += 0.15;
    else if (age < 30 * 24 * 3600 * 1000) score += 0.1;
    const type = (entry.entryType ?? '').toLowerCase();
    if (type === 'relationship' || type === 'event' || type === 'actor_visible_event') score += 0.1;
    return Math.min(1, score);
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
