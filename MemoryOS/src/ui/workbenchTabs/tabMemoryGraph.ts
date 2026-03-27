import { escapeHtml } from '../editorShared';
import type { WorkbenchSnapshot, WorkbenchState } from './shared';
import { escapeAttr, truncateText, formatTimestamp, formatDisplayValue } from './shared';
import type { WorkbenchMemoryGraph, WorkbenchMemoryGraphNode } from './shared/memoryGraphTypes';
import { getMemoryGraphNodeColor, MEMORY_GRAPH_TYPE_LABELS } from './shared/memoryGraphTypes';

/**
 * 功能：扩展后的工作台状态字段（记忆图谱相关）。
 */
export interface MemoryGraphState {
    selectedGraphNodeId?: string;
    memoryGraphQuery?: string;
    memoryGraphFilterType?: string;
    memoryGraphOnlyRemembered?: boolean;
}

/**
 * 功能：构建可视化记忆 TAB 的 HTML 标记。
 * @param snapshot 工作台快照。
 * @param state 工作台状态（含图谱扩展字段）。
 * @param memoryGraph 记忆图数据。
 * @param graphState 图谱相关状态。
 * @returns HTML 字符串。
 */
export function buildMemoryGraphViewMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    memoryGraph: WorkbenchMemoryGraph,
    graphState: MemoryGraphState,
): string {
    const isActive = (state as any).currentView === 'memory-graph';
    if (!isActive) return '';

    const selectedNode = graphState.selectedGraphNodeId
        ? memoryGraph.nodes.find(n => n.id === graphState.selectedGraphNodeId) ?? null
        : null;

    // 统计
    const nodeCount = memoryGraph.nodes.length;
    const edgeCount = memoryGraph.edges.length;

    // 类型分布
    const typeCounts = new Map<string, number>();
    for (const node of memoryGraph.nodes) {
        typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    }

    // 筛选选项
    const typeOptions = [...typeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => {
            const label = MEMORY_GRAPH_TYPE_LABELS[type] ?? type;
            const selected = graphState.memoryGraphFilterType === type ? ' selected' : '';
            return `<option value="${escapeAttr(type)}"${selected}>${escapeHtml(label)} (${count})</option>`;
        }).join('');

    // 图例
    const legendItems = [
        { label: '世界基础', color: '#d4a017' },
        { label: '事件', color: '#f97316' },
        { label: '关系', color: '#ec4899' },
        { label: '场景', color: '#06b6d4' },
        { label: '主观理解', color: '#a855f7' },
        { label: '其他', color: '#94a3b8' },
    ];

    const legendHtml = legendItems.map(item =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">` +
        `<span style="width:10px;height:10px;border-radius:50%;background:${item.color};display:inline-block;"></span>` +
        `<span style="font-size:11px;opacity:0.7;">${item.label}</span></span>`,
    ).join('');

    // 详情面板
    const detailHtml = selectedNode ? buildNodeDetailPanel(selectedNode, snapshot, memoryGraph) : buildEmptyDetailPanel();

    return `
        <section class="stx-memory-workbench__view${isActive ? ' is-active' : ''}" data-view="memory-graph">
            <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
                <!-- 顶部统计与筛选 -->
                <div style="display:flex;align-items:center;gap:16px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;flex-wrap:wrap;">
                    <span style="font-size:12px;opacity:0.6;">节点 <strong>${nodeCount}</strong></span>
                    <span style="font-size:12px;opacity:0.6;">连接 <strong>${edgeCount}</strong></span>
                    <select id="stx-memory-graph-filter-type" class="stx-memory-workbench__select" style="max-width:160px;font-size:12px;">
                        <option value="">全部类型</option>
                        ${typeOptions}
                    </select>
                    <input id="stx-memory-graph-query" class="stx-memory-workbench__input" style="max-width:200px;font-size:12px;" type="text" placeholder="搜索记忆节点…" value="${escapeAttr(graphState.memoryGraphQuery ?? '')}">
                    <div style="margin-left:auto;">${legendHtml}</div>
                </div>

                <!-- 主体：图 + 详情悬浮面板 -->
                <div style="position:relative;flex:1;overflow:hidden;background:transparent;">
                    <!-- 底层图容器 -->
                    <div id="stx-memory-graph-container" style="position:absolute;inset:0;cursor:grab;"></div>

                    <!-- 右侧悬浮面板 -->
                    <div id="stx-memory-graph-detail" style="position:absolute;top:16px;right:16px;width:320px;max-height:calc(100% - 32px);overflow-y:auto;background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-size:13px;z-index:100;pointer-events:auto;">
                        ${detailHtml}
                    </div>
                </div>
            </div>
            <style>
                @keyframes stxMemoryNodeFloat {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                    100% { transform: translateY(0px); }
                }
                .stx-memory-node-glow {
                    animation: stxMemoryNodeFloat 3s ease-in-out infinite;
                    position: relative;
                }
            </style>
        </section>
    `;
}

/**
 * 功能：边类型中文标签。
 */
const EDGE_TYPE_LABELS: Record<string, string> = {
    actor: '共享角色',
    relation: '关系关联',
    participants: '参与者关联',
    location: '同地点',
    sourceSummary: '摘要来源',
    roleBinding: '角色绑定',
    actorRef: '角色引用',
};

/**
 * 功能：构建选中节点的详情面板 HTML。
 * @param node 选中的节点。
 * @param snapshot 工作台快照。
 * @param graph 记忆图数据。
 * @returns HTML 字符串。
 */
function buildNodeDetailPanel(node: WorkbenchMemoryGraphNode, snapshot: WorkbenchSnapshot, graph: WorkbenchMemoryGraph): string {
    const color = getMemoryGraphNodeColor(node.type);
    const typeLabel = MEMORY_GRAPH_TYPE_LABELS[node.type] ?? node.type;
    const memPercent = Math.round(node.memoryPercent ?? 0);
    const importancePercent = Math.round((node.importance ?? 0) * 100);
    const tagsList = (node.tags ?? []).map(t => `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.08);font-size:11px;margin:2px;">${escapeHtml(t)}</span>`).join('');

    // 查找关联条目
    const entry = snapshot.entries.find(e => e.entryId === node.entryId);
    const detailPayloadSummary = entry?.detailPayload ? formatDisplayValue(entry.detailPayload) : '无';

    return `
        <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
                <strong style="font-size:15px;">${escapeHtml(node.label)}</strong>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${color}22;color:${color};border:1px solid ${color}44;">${escapeHtml(typeLabel)}</span>
                ${node.category ? `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.06);">${escapeHtml(node.category)}</span>` : ''}
            </div>
        </div>

        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">记忆度</div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                    <div style="width:${memPercent}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;">${memPercent}%</span>
            </div>
        </div>

        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">重要度</div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                    <div style="width:${importancePercent}%;height:100%;background:#60a5fa;border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;">${importancePercent}%</span>
            </div>
        </div>

        ${node.summary ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">摘要</div>
            <div style="font-size:12px;line-height:1.6;opacity:0.85;">${escapeHtml(node.summary)}</div>
        </div>` : ''}

        ${node.detail ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">详情</div>
            <div style="font-size:12px;line-height:1.6;opacity:0.75;max-height:120px;overflow-y:auto;">${escapeHtml(truncateText(node.detail, 300))}</div>
        </div>` : ''}

        ${tagsList ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">标签</div>
            <div>${tagsList}</div>
        </div>` : ''}

        ${node.updatedAt ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">更新时间</div>
            <div style="font-size:12px;opacity:0.7;">${formatTimestamp(node.updatedAt)}</div>
        </div>` : ''}

        <div style="margin-top:16px;">
            <button class="stx-memory-workbench__btn stx-memory-workbench__btn--primary" data-action="graph-jump-entry" data-entry-id="${escapeAttr(node.entryId)}" style="width:100%;font-size:12px;color:#fff;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);padding:8px;border-radius:4px;cursor:pointer;transition:all 0.2s;">
                <i class="fa-solid fa-arrow-right"></i> 跳转到条目中心编辑
            </button>
        </div>

        ${buildConnectedNodesSection(node, graph)}
    `;
}

/**
 * 功能：构建选中节点的关联节点列表。
 * @param node 选中的节点。
 * @param graph 记忆图数据。
 * @returns HTML 字符串。
 */
function buildConnectedNodesSection(node: WorkbenchMemoryGraphNode, graph: WorkbenchMemoryGraph): string {
    // 找出所有与当前节点相连的边及对端节点
    const connectedItems: { targetNode: WorkbenchMemoryGraphNode; edgeType: string; weight: number }[] = [];
    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

    for (const edge of graph.edges) {
        let peerId: string | undefined;
        if (edge.source === node.id) peerId = edge.target;
        else if (edge.target === node.id) peerId = edge.source;
        if (!peerId) continue;
        const peerNode = nodeMap.get(peerId);
        if (!peerNode) continue;
        // 去重：同一个对端只保留权重最高的
        const existing = connectedItems.find(c => c.targetNode.id === peerId);
        if (existing) {
            if (edge.weight > existing.weight) {
                existing.edgeType = edge.edgeType;
                existing.weight = edge.weight;
            }
        } else {
            connectedItems.push({ targetNode: peerNode, edgeType: edge.edgeType, weight: edge.weight });
        }
    }

    if (connectedItems.length === 0) {
        return `
        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:6px;">关联节点</div>
            <div style="font-size:12px;opacity:0.4;">暂无关联节点</div>
        </div>`;
    }

    // 按权重排序
    connectedItems.sort((a, b) => b.weight - a.weight);

    const itemsHtml = connectedItems.map(({ targetNode, edgeType }) => {
        const peerColor = getMemoryGraphNodeColor(targetNode.type);
        const peerTypeLabel = MEMORY_GRAPH_TYPE_LABELS[targetNode.type] ?? targetNode.type;
        const edgeLabel = EDGE_TYPE_LABELS[edgeType] ?? edgeType;
        const peerSummary = targetNode.summary ? escapeHtml(truncateText(targetNode.summary, 60)) : '';
        return `
            <button type="button" class="stx-memory-graph-related-node" data-action="graph-select-node" data-node-id="${escapeAttr(targetNode.id)}" data-entry-id="${escapeAttr(targetNode.entryId)}" style="display:flex;align-items:flex-start;gap:8px;width:100%;padding:8px;margin-bottom:4px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);cursor:pointer;text-align:left;transition:all 0.2s;font-family:inherit;color:inherit;">
                <span style="width:10px;height:10px;border-radius:50%;background:${peerColor};flex-shrink:0;margin-top:3px;box-shadow:0 0 6px ${peerColor};"></span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:500;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(targetNode.label)}</div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px;">
                        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${peerColor}22;color:${peerColor};border:1px solid ${peerColor}33;">${escapeHtml(peerTypeLabel)}</span>
                        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.2);">${escapeHtml(edgeLabel)}</span>
                    </div>
                    ${peerSummary ? `<div style="font-size:11px;opacity:0.6;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${peerSummary}</div>` : ''}
                </div>
            </button>`;
    }).join('');

    return `
        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:8px;">关联节点 <span style="opacity:0.8;">(${connectedItems.length})</span></div>
            <div style="max-height:240px;overflow-y:auto;">
                ${itemsHtml}
            </div>
        </div>`;
}

/**
 * 功能：构建空状态的详情面板。
 * @returns HTML 字符串。
 */
function buildEmptyDetailPanel(): string {
    return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.4;">
            <i class="fa-solid fa-circle-nodes" style="font-size:36px;margin-bottom:12px;"></i>
            <div style="font-size:13px;">点击图中的节点查看记忆详情</div>
        </div>
    `;
}
