/**
 * 功能：图谱显示模式。
 */
export type MemoryGraphMode = 'compact' | 'semantic' | 'debug';

/**
 * 功能：边强度等级。
 */
export type EdgeStrengthLevel = 'strong' | 'normal' | 'weak';

/**
 * 功能：工作台记忆图节点。
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
    semanticSummary?: string;
    debugSummary?: string;
    compareKey?: string;
    sourceBatchIds?: string[];
    reasonCodes?: string[];
    bindings?: Record<string, unknown>;
}

/**
 * 功能：工作台记忆图边。
 */
export interface WorkbenchMemoryGraphEdge {
    id: string;
    source: string;
    target: string;
    edgeType: string;
    weight: number;
    reasons?: string[];
    strengthLevel?: EdgeStrengthLevel;
    visibleInModes?: MemoryGraphMode[];
    semanticLabel?: string;
    debugSummary?: string;
    sourceKinds?: string[];
    sourceBatchIds?: string[];
    reasonCodes?: string[];
    confidence?: number;
    status?: 'active' | 'inactive';
}

/**
 * 功能：工作台记忆图数据。
 */
export interface WorkbenchMemoryGraph {
    nodes: WorkbenchMemoryGraphNode[];
    edges: WorkbenchMemoryGraphEdge[];
}

/**
 * 功能：记忆图节点颜色映射。
 */
export const MEMORY_GRAPH_TYPE_COLORS: Record<string, string> = {
    world_core_setting: '#d4a017',
    world_hard_rule: '#c89211',
    world_global_state: '#e3b341',
    world_hard_rule_legacy: '#b68612',
    scene_shared_state: '#06b6d4',
    location: '#14b8a6',
    relationship: '#f472b6',
    actor_profile: '#ec4899',
    event: '#f97316',
    actor_visible_event: '#fb923c',
    actor_private_interpretation: '#a855f7',
    nation: '#84cc16',
    city: '#38bdf8',
    organization: '#22c55e',
    item: '#94a3b8',
    task: '#f59e0b',
    other: '#64748b',
};

/**
 * 功能：定义可视化记忆图例项。
 */
export interface MemoryGraphLegendItem {
    type: string;
    label: string;
    color: string;
}

/**
 * 功能：获取记忆图节点颜色。
 * @param entryType 条目类型。
 * @returns 颜色值。
 */
export function getMemoryGraphNodeColor(entryType: string): string {
    return MEMORY_GRAPH_TYPE_COLORS[entryType] ?? '#94a3b8';
}

/**
 * 功能：构建可视化记忆图例配置。
 * @returns 图例项列表。
 */
export function buildMemoryGraphLegendItems(): MemoryGraphLegendItem[] {
    return [
        { type: 'actor_profile', label: '角色', color: getMemoryGraphNodeColor('actor_profile') },
        { type: 'relationship', label: '关系', color: getMemoryGraphNodeColor('relationship') },
        { type: 'organization', label: '组织', color: getMemoryGraphNodeColor('organization') },
        { type: 'location', label: '地点', color: getMemoryGraphNodeColor('location') },
        { type: 'event', label: '事件', color: getMemoryGraphNodeColor('event') },
        { type: 'task', label: '任务', color: getMemoryGraphNodeColor('task') },
        { type: 'world_core_setting', label: '世界设定', color: getMemoryGraphNodeColor('world_core_setting') },
        { type: 'other', label: '其他', color: getMemoryGraphNodeColor('other') },
    ];
}

/**
 * 功能：计算记忆图节点大小。
 * @param importance 重要度。
 * @param memoryPercent 记忆度。
 * @returns 节点尺寸。
 */
export function computeMemoryGraphNodeSize(importance: number, memoryPercent: number): number {
    const imp = Math.max(0, Math.min(1, Number(importance) || 0));
    const mp = Math.max(0, Math.min(1, (Number(memoryPercent) || 0) / 100));
    return 12 + 20 * ((0.6 * imp) + (0.4 * mp));
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
