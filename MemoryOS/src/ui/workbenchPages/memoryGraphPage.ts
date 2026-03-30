import { escapeHtml } from '../editorShared';
import { resolveEntryTypeLabel } from '../workbenchLocale';
import type { WorkbenchSnapshot, WorkbenchState } from '../workbenchTabs/shared';
import { escapeAttr, truncateText, formatTimestamp, formatDisplayValue } from '../workbenchTabs/shared';
import type { WorkbenchMemoryGraph, WorkbenchMemoryGraphNode, MemoryGraphMode } from '../workbenchTabs/shared/memoryGraphTypes';
import { buildMemoryGraphLegendItems, getMemoryGraphNodeColor, MEMORY_GRAPH_TYPE_LABELS } from '../workbenchTabs/shared/memoryGraphTypes';
import {
    createMemoryGraphPixiRenderer,
    filterMemoryGraphData,
    type MemoryGraphPixiController,
} from './memoryGraphPixi';

/**
 * 功能：记忆图页面状态。
 */
export interface MemoryGraphPageState {
    selectedGraphNodeId?: string;
    memoryGraphQuery?: string;
    memoryGraphFilterType?: string;
    graphMode?: MemoryGraphMode;
}

/**
 * 功能：记忆图页面挂载参数。
 */
export interface MountMemoryGraphPageOptions {
    host: HTMLElement;
    snapshot: WorkbenchSnapshot;
    state: WorkbenchState;
    onRequestRender: () => void;
}

interface MemoryGraphPageController {
    destroy(): void;
}

const GRAPH_CONTAINER_ID = 'stx-memory-graph-container';
const GRAPH_DETAIL_ID = 'stx-memory-graph-detail';
const GRAPH_FILTER_ID = 'stx-memory-graph-filter-type';
const GRAPH_QUERY_ID = 'stx-memory-graph-query';

let activeController: MemoryGraphPageController | null = null;

/**
 * 功能：构建记忆图页面 HTML。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param graphState 图谱局部状态。
 * @returns 页面 HTML。
 */
export function buildMemoryGraphPageMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    graphState: MemoryGraphPageState,
): string {
    if (state.currentView !== 'memory-graph') {
        return '';
    }
    const currentMode = resolveGraphMode(graphState.graphMode);
    const selectedNode = graphState.selectedGraphNodeId
        ? snapshot.memoryGraph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === graphState.selectedGraphNodeId) ?? null
        : null;
    const nodeCount = snapshot.memoryGraph.nodes.length;
    const edgeCount = snapshot.memoryGraph.edges.length;
    const detailHtml = selectedNode
        ? buildNodeDetailPanel(selectedNode, snapshot, snapshot.memoryGraph, currentMode)
        : buildEmptyDetailPanel();
    const typeCounts = buildTypeCountMap(snapshot.memoryGraph);
    const typeOptions = [...typeCounts.entries()]
        .sort((left, right): number => right[1] - left[1])
        .map(([type, count]): string => {
            const label = MEMORY_GRAPH_TYPE_LABELS[type] ?? resolveEntryTypeLabel(type);
            return `<option value="${escapeAttr(type)}"${graphState.memoryGraphFilterType === type ? ' selected' : ''}>${escapeHtml(label)} (${count})</option>`;
        })
        .join('');
    const legendHtml = buildMemoryGraphLegendItems()
        .map((item) => {
            return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">`
                + `<span style="width:10px;height:10px;border-radius:50%;background:${item.color};display:inline-block;"></span>`
                + `<span style="font-size:11px;opacity:0.72;">${item.label}</span>`
                + '</span>';
        })
        .join('');
    const modeButtons = ([
        { mode: 'compact' as MemoryGraphMode, label: '简洁' },
        { mode: 'semantic' as MemoryGraphMode, label: '语义' },
        { mode: 'debug' as MemoryGraphMode, label: '调试' },
    ]).map(({ mode, label }): string => {
        const active = currentMode === mode;
        return `<button type="button" data-graph-mode="${mode}" style="font-size:11px;padding:2px 8px;border-radius:4px;background:${active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)'};border:${active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)'};color:${active ? '#93c5fd' : 'rgba(255,255,255,0.66)'};cursor:pointer;font-family:inherit;">${label}</button>`;
    }).join('');

    return `
        <section class="stx-memory-workbench__view is-active" data-view="memory-graph">
            <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:16px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;flex-wrap:wrap;">
                    <span style="font-size:12px;opacity:0.6;">节点 <strong>${nodeCount}</strong></span>
                    <span style="font-size:12px;opacity:0.6;">连接 <strong>${edgeCount}</strong></span>
                    <select id="${GRAPH_FILTER_ID}" class="stx-memory-workbench__select" style="max-width:170px;font-size:12px;">
                        <option value="">全部类型</option>
                        ${typeOptions}
                    </select>
                    <input id="${GRAPH_QUERY_ID}" class="stx-memory-workbench__input" style="max-width:220px;font-size:12px;" type="text" placeholder="搜索记忆节点" value="${escapeAttr(graphState.memoryGraphQuery ?? '')}">
                    <div style="display:flex;gap:4px;align-items:center;">${modeButtons}</div>
                    <div style="margin-left:auto;">${legendHtml}</div>
                </div>
                <div style="position:relative;flex:1;overflow:hidden;background:transparent;">
                    <div id="${GRAPH_CONTAINER_ID}" style="position:absolute;inset:0;cursor:grab;"></div>
                    <div id="${GRAPH_DETAIL_ID}" style="position:absolute;top:16px;right:16px;width:320px;max-height:calc(100% - 32px);overflow-y:auto;background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-size:13px;z-index:100;pointer-events:auto;">
                        ${detailHtml}
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：挂载记忆图页面。
 * @param options 挂载参数。
 */
export function mountMemoryGraphPage(options: MountMemoryGraphPageOptions): void {
    destroyMemoryGraphPage();
    activeController = createMemoryGraphPageController(options);
}

/**
 * 功能：销毁记忆图页面控制器。
 */
export function destroyMemoryGraphPage(): void {
    activeController?.destroy();
    activeController = null;
}

/**
 * 功能：创建记忆图页面控制器。
 * @param options 挂载参数。
 * @returns 控制器。
 */
function createMemoryGraphPageController(options: MountMemoryGraphPageOptions): MemoryGraphPageController {
    const { host, snapshot, state, onRequestRender } = options;
    const graphContainer = host.querySelector(`#${GRAPH_CONTAINER_ID}`) as HTMLElement | null;
    const detailContainer = host.querySelector(`#${GRAPH_DETAIL_ID}`) as HTMLElement | null;
    const filterElement = host.querySelector(`#${GRAPH_FILTER_ID}`) as HTMLSelectElement | null;
    const queryElement = host.querySelector(`#${GRAPH_QUERY_ID}`) as HTMLInputElement | null;
    const modeButtons = Array.from(host.querySelectorAll<HTMLElement>('[data-graph-mode]'));
    let renderer: MemoryGraphPixiController | null = null;
    let destroyed = false;
    let rendererToken = 0;
    let queryTimer: number | null = null;

    /**
     * 功能：获取当前图谱模式。
     * @returns 图谱模式。
     */
    function getGraphMode(): MemoryGraphMode {
        return resolveGraphMode(state.memoryGraphMode);
    }

    /**
     * 功能：获取当前选中节点。
     * @returns 节点或空值。
     */
    function getSelectedNode(): WorkbenchMemoryGraphNode | null {
        if (!state.selectedGraphNodeId) {
            return null;
        }
        return snapshot.memoryGraph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === state.selectedGraphNodeId) ?? null;
    }

    /**
     * 功能：同步模式按钮状态。
     */
    function syncModeButtons(): void {
        const currentMode = getGraphMode();
        modeButtons.forEach((button: HTMLElement): void => {
            const active = currentMode === resolveGraphMode(button.dataset.graphMode);
            button.style.background = active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)';
            button.style.border = active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)';
            button.style.color = active ? '#93c5fd' : 'rgba(255,255,255,0.66)';
        });
    }

    /**
     * 功能：同步详情面板。
     */
    function syncDetailPanel(): void {
        if (!detailContainer) {
            return;
        }
        const selectedNode = getSelectedNode();
        detailContainer.innerHTML = selectedNode
            ? buildNodeDetailPanel(selectedNode, snapshot, snapshot.memoryGraph, getGraphMode())
            : buildEmptyDetailPanel();
        detailContainer.querySelectorAll<HTMLElement>('[data-memory-graph-select-node]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                selectNode(String(button.dataset.nodeId ?? '').trim(), String(button.dataset.entryId ?? '').trim(), true);
            });
        });
        detailContainer.querySelectorAll<HTMLElement>('[data-memory-graph-jump-entry]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!entryId) {
                    return;
                }
                state.selectedEntryId = entryId;
                state.currentView = 'entries';
                onRequestRender();
            });
        });
    }

    /**
     * 功能：确保选中节点在可见结果中。
     */
    function normalizeSelectedNode(): void {
        const filtered = filterMemoryGraphData(snapshot.memoryGraph, {
            filterType: state.memoryGraphFilterType || undefined,
            searchQuery: state.memoryGraphQuery || undefined,
            graphMode: getGraphMode(),
        });
        const visibleIds = new Set(filtered.nodes.map((node: WorkbenchMemoryGraphNode): string => node.id));
        if (state.selectedGraphNodeId && !visibleIds.has(state.selectedGraphNodeId)) {
            state.selectedGraphNodeId = '';
        }
    }

    /**
     * 功能：设置当前选中节点。
     * @param nodeId 节点 ID。
     * @param entryId 条目 ID。
     * @param focus 是否聚焦。
     */
    function selectNode(nodeId: string, entryId: string, focus: boolean): void {
        state.selectedGraphNodeId = nodeId;
        state.selectedEntryId = entryId;
        syncDetailPanel();
        renderer?.setSelectedNode(nodeId, { focus });
    }

    /**
     * 功能：重挂载 Pixi 渲染器。
     */
    function remountRenderer(): void {
        if (!graphContainer) {
            return;
        }
        normalizeSelectedNode();
        syncModeButtons();
        syncDetailPanel();
        const token = ++rendererToken;
        renderer?.destroy();
        renderer = null;
        void createMemoryGraphPixiRenderer(graphContainer, snapshot.memoryGraph, {
            selectedNodeId: state.selectedGraphNodeId || undefined,
            filterType: state.memoryGraphFilterType || undefined,
            searchQuery: state.memoryGraphQuery || undefined,
            graphMode: getGraphMode(),
            onSelectNode: (nodeId: string, entryId: string): void => {
                if (!destroyed) {
                    selectNode(nodeId, entryId, false);
                }
            },
        }).then((controller: MemoryGraphPixiController): void => {
            if (destroyed || token !== rendererToken) {
                controller.destroy();
                return;
            }
            renderer = controller;
        });
    }

    filterElement?.addEventListener('change', (): void => {
        state.memoryGraphFilterType = String(filterElement.value ?? '').trim();
        remountRenderer();
    });
    queryElement?.addEventListener('input', (): void => {
        if (queryTimer !== null) {
            window.clearTimeout(queryTimer);
        }
        queryTimer = window.setTimeout((): void => {
            state.memoryGraphQuery = String(queryElement.value ?? '').trim();
            queryTimer = null;
            remountRenderer();
        }, 220);
    });
    queryElement?.addEventListener('blur', (): void => {
        if (queryTimer !== null) {
            window.clearTimeout(queryTimer);
            queryTimer = null;
        }
        state.memoryGraphQuery = String(queryElement.value ?? '').trim();
        remountRenderer();
    });
    modeButtons.forEach((button: HTMLElement): void => {
        button.addEventListener('click', (): void => {
            state.memoryGraphMode = resolveGraphMode(button.dataset.graphMode);
            remountRenderer();
        });
    });

    syncModeButtons();
    syncDetailPanel();
    remountRenderer();

    return {
        destroy(): void {
            destroyed = true;
            if (queryTimer !== null) {
                window.clearTimeout(queryTimer);
            }
            renderer?.destroy();
            renderer = null;
        },
    };
}

/**
 * 功能：构建类型统计映射。
 * @param memoryGraph 图谱数据。
 * @returns 统计映射。
 */
function buildTypeCountMap(memoryGraph: WorkbenchMemoryGraph): Map<string, number> {
    const typeCounts = new Map<string, number>();
    memoryGraph.nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    });
    return typeCounts;
}

const EDGE_TYPE_LABELS: Record<string, string> = {
    role_binding: '角色绑定',
    participant: '参与',
    belongs_to_organization: '隶属组织',
    located_in_city: '位于城市',
    located_in_nation: '位于国家',
    occurs_at_location: '发生地点',
    relates_to_task: '关联任务',
    relates_to_event: '关联事件',
};

/**
 * 功能：构建节点详情面板。
 * @param node 当前节点。
 * @param snapshot 工作台快照。
 * @param graph 图谱数据。
 * @param graphMode 图谱模式。
 * @returns 详情 HTML。
 */
function buildNodeDetailPanel(
    node: WorkbenchMemoryGraphNode,
    snapshot: WorkbenchSnapshot,
    graph: WorkbenchMemoryGraph,
    graphMode: MemoryGraphMode,
): string {
    const color = getMemoryGraphNodeColor(node.type);
    const typeLabel = MEMORY_GRAPH_TYPE_LABELS[node.type] ?? resolveEntryTypeLabel(node.type);
    const memoryPercent = Math.round(node.memoryPercent ?? 0);
    const importancePercent = Math.round((node.importance ?? 0) * 100);
    const entry = snapshot.entries.find((item) => item.entryId === node.entryId);
    const payloadSummary = entry?.detailPayload ? formatDisplayValue(entry.detailPayload) : '暂无';
    const summary = graphMode === 'debug'
        ? (node.debugSummary || payloadSummary)
        : (node.semanticSummary || node.summary || node.detail || '暂无');
    const tagsMarkup = (node.tags ?? [])
        .map((tag: string): string => `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.08);font-size:11px;margin:2px;">${escapeHtml(tag)}</span>`)
        .join('');

    return `
        <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
                <strong style="font-size:15px;">${escapeHtml(node.label)}</strong>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${color}22;color:${color};border:1px solid ${color}44;">${escapeHtml(typeLabel)}</span>
                ${node.category ? `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.06);">${escapeHtml(node.category)}</span>` : ''}
            </div>
        </div>
        ${buildProgressBlock('记忆度', memoryPercent, color)}
        ${buildProgressBlock('重要度', importancePercent, '#60a5fa')}
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">${graphMode === 'debug' ? '调试摘要' : '语义摘要'}</div>
            <div style="font-size:12px;line-height:1.6;opacity:0.86;">${escapeHtml(summary)}</div>
        </div>
        ${node.detail ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">详情</div>
            <div style="font-size:12px;line-height:1.6;opacity:0.76;max-height:120px;overflow-y:auto;">${escapeHtml(truncateText(node.detail, 320))}</div>
        </div>` : ''}
        ${tagsMarkup ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">标签</div>
            <div>${tagsMarkup}</div>
        </div>` : ''}
        ${buildNodeBindingsSection(node.bindings, graphMode)}
        ${graphMode === 'debug' ? buildNodeDebugSection(node, payloadSummary) : ''}
        ${graphMode !== 'debug' ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">结构化摘要</div>
            <div style="font-size:12px;line-height:1.55;opacity:0.68;">${escapeHtml(truncateText(payloadSummary, 220))}</div>
        </div>` : ''}
        ${node.updatedAt ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">更新时间</div>
            <div style="font-size:12px;opacity:0.72;">${formatTimestamp(node.updatedAt)}</div>
        </div>` : ''}
        <div style="margin-top:16px;">
            <button class="stx-memory-workbench__btn stx-memory-workbench__btn--primary" data-memory-graph-jump-entry="true" data-entry-id="${escapeAttr(node.entryId)}" style="width:100%;font-size:12px;color:#fff;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);padding:8px;border-radius:4px;cursor:pointer;">
                <i class="fa-solid fa-arrow-right"></i> 跳转到条目中心
            </button>
        </div>
        ${buildConnectedNodesSection(node, graph, graphMode)}
    `;
}

/**
 * 功能：渲染进度块。
 * @param label 标签。
 * @param percent 百分比。
 * @param color 颜色。
 * @returns HTML。
 */
function buildProgressBlock(label: string, percent: number, color: string): string {
    return `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">${escapeHtml(label)}</div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                    <div style="width:${percent}%;height:100%;background:${color};border-radius:3px;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;">${percent}%</span>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染节点绑定关系区块。
 * @param bindings 绑定信息。
 * @param graphMode 图谱模式。
 * @returns HTML。
 */
function buildNodeBindingsSection(bindings: Record<string, unknown> | undefined, graphMode: MemoryGraphMode): string {
    if (!bindings) {
        return '';
    }
    const rows = Object.entries(bindings)
        .filter(([, value]: [string, unknown]): boolean => Array.isArray(value) && value.length > 0)
        .map(([key, value]: [string, unknown]): string => {
            return `
                <div style="margin-bottom:8px;">
                    <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">${escapeHtml(graphMode === 'debug' ? key : resolveBindingLabel(key))}</div>
                    <div style="font-size:12px;line-height:1.55;opacity:0.78;">${escapeHtml(formatDisplayValue(value))}</div>
                </div>
            `;
        })
        .join('');
    if (!rows) {
        return '';
    }
    return `<div style="margin-bottom:12px;">${rows}</div>`;
}

/**
 * 功能：渲染节点调试信息区块。
 * @param node 节点。
 * @param payloadSummary 原始结构化摘要。
 * @returns HTML。
 */
function buildNodeDebugSection(node: WorkbenchMemoryGraphNode, payloadSummary: string): string {
    const parts: string[] = [];
    if (node.compareKey) {
        parts.push(`
            <div style="margin-bottom:8px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">compareKey</div>
                <div style="font-size:12px;line-height:1.55;opacity:0.78;">${escapeHtml(node.compareKey)}</div>
            </div>
        `);
    }
    if (node.reasonCodes?.length) {
        parts.push(`
            <div style="margin-bottom:8px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">原因码</div>
                <div style="font-size:12px;line-height:1.55;opacity:0.78;">${escapeHtml(node.reasonCodes.join(' | '))}</div>
            </div>
        `);
    }
    if (node.sourceBatchIds?.length) {
        parts.push(`
            <div style="margin-bottom:8px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">来源批次</div>
                <div style="font-size:12px;line-height:1.55;opacity:0.78;">${escapeHtml(node.sourceBatchIds.join(' | '))}</div>
            </div>
        `);
    }
    parts.push(`
        <div style="margin-bottom:8px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">原始结构化数据</div>
            <div style="font-size:12px;line-height:1.55;opacity:0.68;">${escapeHtml(truncateText(payloadSummary, 420))}</div>
        </div>
    `);
    return `<div style="margin-bottom:12px;">${parts.join('')}</div>`;
}

/**
 * 功能：构建节点连接区块。
 * @param node 当前节点。
 * @param graph 图谱数据。
 * @param graphMode 图谱模式。
 * @returns HTML。
 */
function buildConnectedNodesSection(node: WorkbenchMemoryGraphNode, graph: WorkbenchMemoryGraph, graphMode: MemoryGraphMode): string {
    const nodeMap = new Map(graph.nodes.map((item: WorkbenchMemoryGraphNode): [string, WorkbenchMemoryGraphNode] => [item.id, item]));
    const connectedItems = graph.edges
        .map((edge) => {
            const peerId = edge.source === node.id
                ? edge.target
                : edge.target === node.id
                    ? edge.source
                    : '';
            if (!peerId) {
                return null;
            }
            const peerNode = nodeMap.get(peerId);
            if (!peerNode) {
                return null;
            }
            return {
                edge,
                targetNode: peerNode,
            };
        })
        .filter((item): item is { edge: WorkbenchMemoryGraph['edges'][number]; targetNode: WorkbenchMemoryGraphNode } => item !== null)
        .sort((left, right): number => (right.edge.weight ?? 0) - (left.edge.weight ?? 0));

    if (connectedItems.length <= 0) {
        return `
            <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:6px;">关联节点</div>
                <div style="font-size:12px;opacity:0.4;">暂无关联节点</div>
            </div>
        `;
    }

    const itemsHtml = connectedItems.map(({ edge, targetNode }) => {
        const peerColor = getMemoryGraphNodeColor(targetNode.type);
        const peerTypeLabel = MEMORY_GRAPH_TYPE_LABELS[targetNode.type] ?? resolveEntryTypeLabel(targetNode.type);
        const edgeLabel = graphMode === 'debug'
            ? (edge.edgeType || 'unknown')
            : (edge.semanticLabel || EDGE_TYPE_LABELS[edge.edgeType] || resolveEntryTypeLabel(edge.edgeType));
        const summary = targetNode.summary ? escapeHtml(truncateText(targetNode.summary, 64)) : '';
        const reasons = graphMode === 'debug'
            ? [
                edge.debugSummary,
                ...(edge.reasonCodes ?? []),
                ...((edge.sourceKinds ?? []).map((item: string): string => `source:${item}`)),
            ].filter(Boolean)
            : (edge.reasons ?? []);
        return `
            <button type="button" data-memory-graph-select-node="true" data-node-id="${escapeAttr(targetNode.id)}" data-entry-id="${escapeAttr(targetNode.entryId)}" style="display:flex;align-items:flex-start;gap:8px;width:100%;padding:8px;margin-bottom:4px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);cursor:pointer;text-align:left;transition:all 0.2s;font-family:inherit;color:inherit;">
                <span style="width:10px;height:10px;border-radius:50%;background:${peerColor};flex-shrink:0;margin-top:3px;box-shadow:0 0 6px ${peerColor};"></span>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:500;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(targetNode.label)}</div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:2px;">
                        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${peerColor}22;color:${peerColor};border:1px solid ${peerColor}33;">${escapeHtml(peerTypeLabel)}</span>
                        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.2);">${escapeHtml(edgeLabel)}</span>
                    </div>
                    ${summary ? `<div style="font-size:11px;opacity:0.6;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${summary}</div>` : ''}
                    ${reasons.length > 0 ? `<div style="font-size:10px;opacity:0.5;margin-top:2px;line-height:1.3;">${reasons.map((item: string): string => escapeHtml(item)).join(graphMode === 'debug' ? ' | ' : ' / ')}</div>` : ''}
                </div>
            </button>
        `;
    }).join('');

    return `
        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:8px;">关联节点 <span style="opacity:0.8;">(${connectedItems.length})</span></div>
            <div style="max-height:240px;overflow-y:auto;">${itemsHtml}</div>
        </div>
    `;
}

/**
 * 功能：构建空状态详情。
 * @returns HTML。
 */
function buildEmptyDetailPanel(): string {
    return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.42;">
            <i class="fa-solid fa-circle-nodes" style="font-size:36px;margin-bottom:12px;"></i>
            <div style="font-size:13px;">点击图中的节点查看记忆详情</div>
        </div>
    `;
}

/**
 * 功能：解析图谱模式。
 * @param value 原始值。
 * @returns 合法模式。
 */
function resolveGraphMode(value: unknown): MemoryGraphMode {
    const normalized = String(value ?? '').trim();
    if (normalized === 'semantic' || normalized === 'debug') {
        return normalized;
    }
    return 'compact';
}

/**
 * 功能：解析绑定字段标签。
 * @param key 字段名。
 * @returns 展示标签。
 */
function resolveBindingLabel(key: string): string {
    const labels: Record<string, string> = {
        actors: '关联角色',
        organizations: '关联组织',
        cities: '关联城市',
        locations: '关联地点',
        nations: '关联国家',
        tasks: '关联任务',
        events: '关联事件',
    };
    return labels[key] ?? key;
}
