/**
 * 功能：记忆图谱节点。
 */
export interface WorkbenchMemoryGraphNode {
    id: string;
    entryId: string;
    label: string;
    type: string;
    category?: string;
    memoryPercent: number;
    importance?: number;
    tags?: string[];
    summary?: string;
    detail?: string;
    updatedAt?: number;
    x: number;
    y: number;
}

/**
 * 功能：记忆图谱边。
 */
export interface WorkbenchMemoryGraphEdge {
    id: string;
    source: string;
    target: string;
    edgeType: string;
    weight: number;
}

/**
 * 功能：记忆图谱数据。
 */
export interface WorkbenchMemoryGraph {
    nodes: WorkbenchMemoryGraphNode[];
    edges: WorkbenchMemoryGraphEdge[];
}

/**
 * 功能：记忆图类型 → 颜色映射。
 */
export const MEMORY_GRAPH_TYPE_COLORS: Record<string, string> = {
    world_core_setting: '#d4a017',
    world_hard_rule: '#d4a017',
    world_global_state: '#d4a017',
    world_hard_rule_legacy: '#d4a017',
    scene_shared_state: '#06b6d4',
    location: '#06b6d4',
    relationship: '#ec4899',
    actor_profile: '#ec4899',
    event: '#f97316',
    actor_visible_event: '#f97316',
    actor_private_interpretation: '#a855f7',
    nation: '#d4a017',
    city: '#06b6d4',
    organization: '#d4a017',
    item: '#94a3b8',
    task: '#f97316',
    other: '#94a3b8',
};

/**
 * 功能：获取记忆图节点颜色。
 * @param entryType 条目类型。
 * @returns 颜色值。
 */
export function getMemoryGraphNodeColor(entryType: string): string {
    return MEMORY_GRAPH_TYPE_COLORS[entryType] ?? '#94a3b8';
}

/**
 * 功能：计算记忆图节点大小。
 * @param importance 重要度 (0~1)。
 * @param memoryPercent 记忆度 (0~100)。
 * @returns 节点尺寸。
 */
export function computeMemoryGraphNodeSize(importance: number, memoryPercent: number): number {
    const imp = Math.max(0, Math.min(1, Number(importance) || 0));
    const mp = Math.max(0, Math.min(1, (Number(memoryPercent) || 0) / 100));
    return 12 + 20 * (0.6 * imp + 0.4 * mp);
}

/**
 * 功能：记忆图类型中文标签。
 */
export const MEMORY_GRAPH_TYPE_LABELS: Record<string, string> = {
    world_core_setting: '世界设定',
    world_hard_rule: '世界规则',
    world_global_state: '世界状态',
    world_hard_rule_legacy: '旧版规则',
    scene_shared_state: '场景共享',
    location: '地点',
    relationship: '关系',
    actor_profile: '角色画像',
    event: '事件',
    actor_visible_event: '可见事件',
    actor_private_interpretation: '主观理解',
    nation: '国家',
    city: '城市',
    organization: '组织',
    item: '物品',
    task: '任务',
    other: '其他',
};
