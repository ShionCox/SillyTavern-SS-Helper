/**
 * 功能：图谱显示模式。
 */
export type MemoryGraphMode = 'semantic' | 'debug';

/**
 * 功能：边强度等级。
 */
export type EdgeStrengthLevel = 'strong' | 'normal' | 'weak';

/**
 * 功能：图谱详情字段。
 */
export interface WorkbenchMemoryGraphField {
    label: string;
    value: string;
    targetNodeId?: string;
    visibleInModes?: MemoryGraphMode[];
}

/**
 * 功能：图谱节点详情区块。
 */
export interface WorkbenchMemoryGraphSection {
    title: string;
    fields: WorkbenchMemoryGraphField[];
    visibleInModes?: MemoryGraphMode[];
}

/**
 * 功能：工作台记忆图节点。
 */
export interface WorkbenchMemoryGraphNode {
    id: string;
    key: string;
    label: string;
    type: string;
    summary?: string;
    semanticSummary?: string;
    debugSummary?: string;
    compareKey?: string;
    status?: string;
    importance: number;
    memoryPercent: number;
    aliases: string[];
    sourceBatchIds: string[];
    sourceKinds: string[];
    sourceRefs: string[];
    reasonCodes: string[];
    bindings: Record<string, string[]>;
    placeholder?: boolean;
    hydrationState?: 'partial' | 'full';
    visibleInModes?: MemoryGraphMode[];
    sections: WorkbenchMemoryGraphSection[];
    rawData: Record<string, unknown>;
    x: number;
    y: number;
}

/**
 * 功能：工作台记忆图边。
 */
export interface WorkbenchMemoryGraphEdge {
    id: string;
    source: string;
    target: string;
    relationType: string;
    label: string;
    semanticLabel: string;
    debugSummary?: string;
    confidence: number;
    weight: number;
    strengthLevel: EdgeStrengthLevel;
    status: 'active' | 'inactive';
    visibleInModes: MemoryGraphMode[];
    sourceKinds: string[];
    sourceRefs: string[];
    sourceBatchIds: string[];
    reasonCodes: string[];
    sections: WorkbenchMemoryGraphSection[];
    rawData: Record<string, unknown>;
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
    actor: '#f97316',
    organization: '#22c55e',
    city: '#38bdf8',
    nation: '#84cc16',
    location: '#14b8a6',
    task: '#f59e0b',
    event: '#fb7185',
    item: '#a78bfa',
    dream_summary_candidate: '#8b5cf6',
    world_state: '#eab308',
    placeholder: '#64748b',
    other: '#94a3b8',
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
    return MEMORY_GRAPH_TYPE_COLORS[entryType] ?? MEMORY_GRAPH_TYPE_COLORS.other;
}

/**
 * 功能：构建可视化记忆图例配置。
 * @returns 图例项列表。
 */
export function buildMemoryGraphLegendItems(): MemoryGraphLegendItem[] {
    return [
        { type: 'actor', label: '角色', color: getMemoryGraphNodeColor('actor') },
        { type: 'organization', label: '组织', color: getMemoryGraphNodeColor('organization') },
        { type: 'city', label: '城市', color: getMemoryGraphNodeColor('city') },
        { type: 'nation', label: '国家', color: getMemoryGraphNodeColor('nation') },
        { type: 'location', label: '地点', color: getMemoryGraphNodeColor('location') },
        { type: 'task', label: '任务', color: getMemoryGraphNodeColor('task') },
        { type: 'event', label: '事件', color: getMemoryGraphNodeColor('event') },
        { type: 'item', label: '物品', color: getMemoryGraphNodeColor('item') },
        { type: 'world_state', label: '世界状态', color: getMemoryGraphNodeColor('world_state') },
        { type: 'placeholder', label: '占位节点', color: getMemoryGraphNodeColor('placeholder') },
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
    return 14 + (22 * ((0.65 * imp) + (0.35 * mp)));
}

/**
 * 功能：记忆图类型中文标签。
 */
export const MEMORY_GRAPH_TYPE_LABELS: Record<string, string> = {
    actor: '角色',
    organization: '组织',
    city: '城市',
    nation: '国家',
    location: '地点',
    task: '任务',
    event: '事件',
    item: '物品',
    dream_summary_candidate: '梦境总结候选',
    world_state: '世界状态',
    placeholder: '占位节点',
    other: '其他',
};
