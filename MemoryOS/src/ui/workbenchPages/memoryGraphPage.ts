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
 * 功能：记忆图页面使用的局部状态视图。
 * @param selectedGraphNodeId 当前选中节点。
 * @param memoryGraphQuery 搜索关键字。
 * @param memoryGraphFilterType 类型筛选。
 * @param graphMode 图谱模式。
 */
export interface MemoryGraphPageState {
    selectedGraphNodeId?: string;
    memoryGraphQuery?: string;
    memoryGraphFilterType?: string;
    graphMode?: MemoryGraphMode;
}

/**
 * 功能：挂载记忆图页面所需的参数。
 * @param host 页面根节点。
 * @param snapshot 当前工作台快照。
 * @param state 当前工作台状态。
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
 * 功能：构建记忆图页面的 HTML。
 * @param snapshot 工作台快照。
 * @param state 当前工作台状态。
 * @param graphState 记忆图局部状态。
 * @returns 页面 HTML。
 */
export function buildMemoryGraphPageMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    graphState: MemoryGraphPageState,
): string {
    const isActive = state.currentView === 'memory-graph';
    if (!isActive) {
        return '';
    }
    const selectedNode = graphState.selectedGraphNodeId
        ? snapshot.memoryGraph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === graphState.selectedGraphNodeId) ?? null
        : null;
    const nodeCount = snapshot.memoryGraph.nodes.length;
    const edgeCount = snapshot.memoryGraph.edges.length;
    const typeCounts = buildTypeCountMap(snapshot.memoryGraph);
    const typeOptions = [...typeCounts.entries()]
        .sort((left: [string, number], right: [string, number]): number => right[1] - left[1])
        .map(([type, count]: [string, number]): string => {
            const label = MEMORY_GRAPH_TYPE_LABELS[type] ?? resolveEntryTypeLabel(type);
            const selected = graphState.memoryGraphFilterType === type ? ' selected' : '';
            return `<option value="${escapeAttr(type)}"${selected}>${escapeHtml(label)} (${count})</option>`;
        }).join('');
    const legendHtml = buildMemoryGraphLegendItems().map((item) => {
        return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">`
            + `<span style="width:10px;height:10px;border-radius:50%;background:${item.color};display:inline-block;"></span>`
            + `<span style="font-size:11px;opacity:0.72;">${item.label}</span></span>`;
    }).join('');
    const detailHtml = selectedNode
        ? buildNodeDetailPanel(selectedNode, snapshot, snapshot.memoryGraph)
        : buildEmptyDetailPanel();
    const currentMode = resolveGraphMode(graphState.graphMode);
    const modeButtons = ([
        { mode: 'compact' as MemoryGraphMode, label: '简洁' },
        { mode: 'semantic' as MemoryGraphMode, label: '语义' },
        { mode: 'debug' as MemoryGraphMode, label: '调试' },
    ]).map(({ mode, label }: { mode: MemoryGraphMode; label: string }): string => {
        const active = currentMode === mode;
        const background = active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)';
        const border = active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)';
        const color = active ? '#93c5fd' : 'rgba(255,255,255,0.66)';
        return `<button type="button" data-graph-mode="${mode}" style="font-size:11px;padding:2px 8px;border-radius:4px;background:${background};border:${border};color:${color};cursor:pointer;font-family:inherit;">${label}</button>`;
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
                    <input id="${GRAPH_QUERY_ID}" class="stx-memory-workbench__input" style="max-width:220px;font-size:12px;" type="text" placeholder="搜索记忆节点…" value="${escapeAttr(graphState.memoryGraphQuery ?? '')}">
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
 * 功能：挂载独立维护的记忆图页面。
 * @param options 挂载参数。
 * @returns 无返回值。
 */
export function mountMemoryGraphPage(options: MountMemoryGraphPageOptions): void {
    destroyMemoryGraphPage();
    activeController = createMemoryGraphPageController(options);
}

/**
 * 功能：销毁当前记忆图页面控制器。
 * @returns 无返回值。
 */
export function destroyMemoryGraphPage(): void {
    activeController?.destroy();
    activeController = null;
}

/**
 * 功能：创建页面控制器并接管交互。
 * @param options 挂载参数。
 * @returns 页面控制器。
 */
function createMemoryGraphPageController(options: MountMemoryGraphPageOptions): MemoryGraphPageController {
    const { host, snapshot, state, onRequestRender } = options;
    const graphContainer = host.querySelector(`#${GRAPH_CONTAINER_ID}`) as HTMLElement | null;
    const detailContainer = host.querySelector(`#${GRAPH_DETAIL_ID}`) as HTMLElement | null;
    const filterElement = host.querySelector(`#${GRAPH_FILTER_ID}`) as HTMLSelectElement | null;
    const queryElement = host.querySelector(`#${GRAPH_QUERY_ID}`) as HTMLInputElement | null;
    const modeButtons = Array.from(host.querySelectorAll<HTMLElement>('[data-graph-mode]'));
    let renderer: MemoryGraphPixiController | null = null;
    let rendererToken = 0;
    let destroyed = false;
    let queryTimer: number | null = null;

    /**
     * 功能：判断当前选中节点在可见结果中是否仍然存在。
     * @returns 无返回值。
     */
    function normalizeSelectedNode(): void {
        const filtered = filterMemoryGraphData(snapshot.memoryGraph, {
            filterType: state.memoryGraphFilterType || undefined,
            searchQuery: state.memoryGraphQuery || undefined,
            graphMode: resolveGraphMode(state.memoryGraphMode),
        });
        const visibleIds = new Set(filtered.nodes.map((node: WorkbenchMemoryGraphNode): string => node.id));
        if (state.selectedGraphNodeId && !visibleIds.has(state.selectedGraphNodeId)) {
            state.selectedGraphNodeId = '';
        }
    }

    /**
     * 功能：读取当前选中的节点对象。
     * @returns 选中的节点或空值。
     */
    function getSelectedNode(): WorkbenchMemoryGraphNode | null {
        if (!state.selectedGraphNodeId) {
            return null;
        }
        return snapshot.memoryGraph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === state.selectedGraphNodeId) ?? null;
    }

    /**
     * 功能：同步图谱模式按钮的激活态。
     * @returns 无返回值。
     */
    function syncModeButtons(): void {
        const currentMode = resolveGraphMode(state.memoryGraphMode);
        modeButtons.forEach((button: HTMLElement): void => {
            const mode = resolveGraphMode(button.dataset.graphMode);
            const active = currentMode === mode;
            button.style.background = active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)';
            button.style.border = active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)';
            button.style.color = active ? '#93c5fd' : 'rgba(255,255,255,0.66)';
        });
    }

    /**
     * 功能：刷新右侧详情面板。
     * @returns 无返回值。
     */
    function syncDetailPanel(): void {
        if (!detailContainer) {
            return;
        }
        const node = getSelectedNode();
        detailContainer.innerHTML = node
            ? buildNodeDetailPanel(node, snapshot, snapshot.memoryGraph)
            : buildEmptyDetailPanel();
        detailContainer.querySelectorAll<HTMLElement>('[data-memory-graph-select-node]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                const nodeId = String(button.dataset.nodeId ?? '').trim();
                const entryId = String(button.dataset.entryId ?? '').trim();
                selectNode(nodeId, entryId, true);
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
     * 功能：更新当前选中节点并同步页面。
     * @param nodeId 节点 ID。
     * @param entryId 关联条目 ID。
     * @param focus 是否聚焦到该节点。
     * @returns 无返回值。
     */
    function selectNode(nodeId: string, entryId: string, focus: boolean): void {
        state.selectedGraphNodeId = nodeId;
        state.selectedEntryId = entryId;
        syncDetailPanel();
        renderer?.setSelectedNode(nodeId, { focus });
    }

    /**
     * 功能：重建 Pixi 渲染器，供筛选和模式切换时调用。
     * @returns 无返回值。
     */
    function remountRenderer(): void {
        if (!graphContainer) {
            return;
        }
        normalizeSelectedNode();
        syncDetailPanel();
        syncModeButtons();
        const currentToken = ++rendererToken;
        renderer?.destroy();
        renderer = null;
        void createMemoryGraphPixiRenderer(graphContainer, snapshot.memoryGraph, {
            selectedNodeId: state.selectedGraphNodeId || undefined,
            filterType: state.memoryGraphFilterType || undefined,
            searchQuery: state.memoryGraphQuery || undefined,
            graphMode: resolveGraphMode(state.memoryGraphMode),
            onSelectNode: (nodeId: string, entryId: string): void => {
                if (destroyed) {
                    return;
                }
                selectNode(nodeId, entryId, false);
            },
        }).then((controller: MemoryGraphPixiController): void => {
            if (destroyed || currentToken !== rendererToken) {
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
 * 功能：统计每种节点类型的数量。
 * @param memoryGraph 记忆图数据。
 * @returns 类型计数字典。
 */
function buildTypeCountMap(memoryGraph: WorkbenchMemoryGraph): Map<string, number> {
    const typeCounts = new Map<string, number>();
    memoryGraph.nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
    });
    return typeCounts;
}

const EDGE_TYPE_LABELS: Record<string, string> = {
    actor: '共享角色',
    relation: '关系关联',
    participants: '参与者关联',
    location: '同地点',
    sourceSummary: '摘要来源',
    roleBinding: '角色绑定',
    actorRef: '角色引用',
    ownerActorRef: '主角引用',
    mentionedActorRef: '提及角色',
    worldKey: '世界设定',
    tag: '共享标签',
};

/**
 * 功能：渲染选中节点的详情面板。
 * @param node 当前选中节点。
 * @param snapshot 工作台快照。
 * @param graph 记忆图数据。
 * @returns 详情面板 HTML。
 */
function buildNodeDetailPanel(
    node: WorkbenchMemoryGraphNode,
    snapshot: WorkbenchSnapshot,
    graph: WorkbenchMemoryGraph,
): string {
    const color = getMemoryGraphNodeColor(node.type);
    const typeLabel = MEMORY_GRAPH_TYPE_LABELS[node.type] ?? resolveEntryTypeLabel(node.type);
    const memoryPercent = Math.round(node.memoryPercent ?? 0);
    const importancePercent = Math.round((node.importance ?? 0) * 100);
    const tagsMarkup = (node.tags ?? []).map((tag: string): string => {
        return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.08);font-size:11px;margin:2px;">${escapeHtml(tag)}</span>`;
    }).join('');
    const entry = snapshot.entries.find((item) => item.entryId === node.entryId);
    const payloadSummary = entry?.detailPayload ? formatDisplayValue(entry.detailPayload) : '暂无';

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
                    <div style="width:${memoryPercent}%;height:100%;background:${color};border-radius:3px;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;">${memoryPercent}%</span>
            </div>
        </div>
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">重要度</div>
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                    <div style="width:${importancePercent}%;height:100%;background:#60a5fa;border-radius:3px;"></div>
                </div>
                <span style="font-size:12px;font-weight:600;">${importancePercent}%</span>
            </div>
        </div>
        ${node.summary ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">摘要</div>
            <div style="font-size:12px;line-height:1.6;opacity:0.86;">${escapeHtml(node.summary)}</div>
        </div>` : ''}
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
        ${node.updatedAt ? `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">更新时间</div>
            <div style="font-size:12px;opacity:0.72;">${formatTimestamp(node.updatedAt)}</div>
        </div>` : ''}
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">结构化摘要</div>
            <div style="font-size:12px;line-height:1.55;opacity:0.68;">${escapeHtml(truncateText(payloadSummary, 220))}</div>
        </div>
        <div style="margin-top:16px;">
            <button class="stx-memory-workbench__btn stx-memory-workbench__btn--primary" data-memory-graph-jump-entry="true" data-entry-id="${escapeAttr(node.entryId)}" style="width:100%;font-size:12px;color:#fff;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);padding:8px;border-radius:4px;cursor:pointer;">
                <i class="fa-solid fa-arrow-right"></i> 跳转到条目中心
            </button>
        </div>
        ${buildConnectedNodesSection(node, graph)}
    `;
}

/**
 * 功能：构建节点的关联节点列表。
 * @param node 选中节点。
 * @param graph 记忆图数据。
 * @returns 关联节点 HTML。
 */
function buildConnectedNodesSection(node: WorkbenchMemoryGraphNode, graph: WorkbenchMemoryGraph): string {
    const connectedItems: Array<{
        targetNode: WorkbenchMemoryGraphNode;
        edgeType: string;
        weight: number;
        reasons?: string[];
    }> = [];
    const nodeMap = new Map(graph.nodes.map((item: WorkbenchMemoryGraphNode): [string, WorkbenchMemoryGraphNode] => [item.id, item]));

    graph.edges.forEach((edge): void => {
        const peerId = edge.source === node.id
            ? edge.target
            : edge.target === node.id
                ? edge.source
                : '';
        if (!peerId) {
            return;
        }
        const peerNode = nodeMap.get(peerId);
        if (!peerNode) {
            return;
        }
        const existing = connectedItems.find((item) => item.targetNode.id === peerId);
        if (!existing) {
            connectedItems.push({
                targetNode: peerNode,
                edgeType: edge.edgeType,
                weight: edge.weight,
                reasons: edge.reasons,
            });
            return;
        }
        if (edge.weight > existing.weight) {
            existing.edgeType = edge.edgeType;
            existing.weight = edge.weight;
            existing.reasons = edge.reasons;
        }
    });

    if (connectedItems.length <= 0) {
        return `
            <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:6px;">关联节点</div>
                <div style="font-size:12px;opacity:0.4;">暂无关联节点</div>
            </div>
        `;
    }

    connectedItems.sort((left, right) => right.weight - left.weight);
    const itemsHtml = connectedItems.map(({ targetNode, edgeType, reasons }) => {
        const peerColor = getMemoryGraphNodeColor(targetNode.type);
        const peerTypeLabel = MEMORY_GRAPH_TYPE_LABELS[targetNode.type] ?? resolveEntryTypeLabel(targetNode.type);
        const edgeLabel = EDGE_TYPE_LABELS[edgeType] ?? resolveEntryTypeLabel(edgeType);
        const summary = targetNode.summary ? escapeHtml(truncateText(targetNode.summary, 64)) : '';
        const reasonsHtml = reasons?.length
            ? `<div style="font-size:10px;opacity:0.5;margin-top:2px;line-height:1.3;">${reasons.map((item: string): string => escapeHtml(item)).join(' / ')}</div>`
            : '';
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
                    ${reasonsHtml}
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
 * 功能：渲染空状态详情面板。
 * @returns 空状态 HTML。
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
 * 功能：规范化图谱模式输入。
 * @param value 原始模式值。
 * @returns 合法的图谱模式。
 */
function resolveGraphMode(value: unknown): MemoryGraphMode {
    const normalized = String(value ?? '').trim();
    if (normalized === 'semantic' || normalized === 'debug') {
        return normalized;
    }
    return 'compact';
}
