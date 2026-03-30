import { escapeHtml } from '../editorShared';
import type { WorkbenchSnapshot, WorkbenchState } from '../workbenchTabs/shared';
import { escapeAttr } from '../workbenchTabs/shared';
import type {
    MemoryGraphMode,
    WorkbenchMemoryGraph,
    WorkbenchMemoryGraphEdge,
    WorkbenchMemoryGraphNode,
    WorkbenchMemoryGraphSection,
} from '../workbenchTabs/shared/memoryGraphTypes';
import {
    buildMemoryGraphLegendItems,
    getMemoryGraphNodeColor,
    MEMORY_GRAPH_TYPE_LABELS,
} from '../workbenchTabs/shared/memoryGraphTypes';
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
    selectedGraphEdgeId?: string;
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
    const selectedEdge = graphState.selectedGraphEdgeId
        ? snapshot.memoryGraph.edges.find((edge: WorkbenchMemoryGraphEdge): boolean => edge.id === graphState.selectedGraphEdgeId) ?? null
        : null;
    const visibleGraph = filterMemoryGraphData(snapshot.memoryGraph, {
        filterType: graphState.memoryGraphFilterType || undefined,
        searchQuery: graphState.memoryGraphQuery || undefined,
        graphMode: currentMode,
    });
    const detailHtml = selectedNode
        ? buildNodeDetailPanel(selectedNode, currentMode)
        : selectedEdge
            ? buildEdgeDetailPanel(selectedEdge, snapshot.memoryGraph, currentMode)
            : buildEmptyDetailPanel();
    const typeCounts = buildTypeCountMap(snapshot.memoryGraph, currentMode);
    const typeOptions = [...typeCounts.entries()]
        .sort((left, right): number => right[1] - left[1])
        .map(([type, count]): string => {
            return `<option value="${escapeAttr(type)}"${graphState.memoryGraphFilterType === type ? ' selected' : ''}>${escapeHtml(resolveTypeLabel(type))} (${count})</option>`;
        })
        .join('');
    const modeButtons = ([
        { mode: 'semantic' as MemoryGraphMode, label: '语义' },
        { mode: 'debug' as MemoryGraphMode, label: '调试' },
    ]).map(({ mode, label }): string => {
        const active = currentMode === mode;
        return `<button type="button" data-graph-mode="${mode}" style="font-size:11px;padding:2px 8px;border-radius:4px;background:${active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)'};border:${active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)'};color:${active ? '#93c5fd' : 'rgba(255,255,255,0.66)'};cursor:pointer;font-family:inherit;">${label}</button>`;
    }).join('');
    const legendHtml = buildMemoryGraphLegendItems()
        .map((item) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:10px;height:10px;border-radius:50%;background:${item.color};display:inline-block;"></span><span style="font-size:11px;opacity:0.72;">${item.label}</span></span>`)
        .join('');

    return `
        <section class="stx-memory-workbench__view is-active" data-view="memory-graph">
            <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:16px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;flex-wrap:wrap;">
                    <span style="font-size:12px;opacity:0.6;">节点 <strong>${visibleGraph.nodes.length}</strong></span>
                    <span style="font-size:12px;opacity:0.6;">连接 <strong>${visibleGraph.edges.length}</strong></span>
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
                    <div id="${GRAPH_DETAIL_ID}" style="position:absolute;top:16px;right:16px;width:340px;max-height:calc(100% - 32px);overflow-y:auto;background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-size:13px;z-index:100;pointer-events:auto;">
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
     * 功能：同步详情面板。
     */
    function syncDetailPanel(): void {
        if (!detailContainer) {
            return;
        }
        const selectedNode = snapshot.memoryGraph.nodes.find((node) => node.id === state.selectedGraphNodeId) ?? null;
        const selectedEdge = snapshot.memoryGraph.edges.find((edge) => edge.id === state.selectedGraphEdgeId) ?? null;
        detailContainer.innerHTML = selectedNode
            ? buildNodeDetailPanel(selectedNode, state.memoryGraphMode)
            : selectedEdge
                ? buildEdgeDetailPanel(selectedEdge, snapshot.memoryGraph, state.memoryGraphMode)
                : buildEmptyDetailPanel();
        detailContainer.querySelectorAll<HTMLElement>('[data-memory-graph-select-node]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedGraphNodeId = String(button.dataset.nodeId ?? '').trim();
                state.selectedGraphEdgeId = '';
                syncDetailPanel();
                renderer?.setSelectedNode(state.selectedGraphNodeId, { focus: true });
            });
        });
    }

    /**
     * 功能：重挂载 Pixi 渲染器。
     */
    function remountRenderer(): void {
        if (!graphContainer) {
            return;
        }
        const token = ++rendererToken;
        renderer?.destroy();
        renderer = null;
        void createMemoryGraphPixiRenderer(graphContainer, snapshot.memoryGraph, {
            selectedNodeId: state.selectedGraphNodeId || undefined,
            selectedEdgeId: state.selectedGraphEdgeId || undefined,
            filterType: state.memoryGraphFilterType || undefined,
            searchQuery: state.memoryGraphQuery || undefined,
            graphMode: state.memoryGraphMode,
            onSelectNode: (nodeId: string): void => {
                if (destroyed) {
                    return;
                }
                state.selectedGraphNodeId = nodeId;
                state.selectedGraphEdgeId = '';
                syncDetailPanel();
            },
            onSelectEdge: (edgeId: string): void => {
                if (destroyed) {
                    return;
                }
                state.selectedGraphNodeId = '';
                state.selectedGraphEdgeId = edgeId;
                syncDetailPanel();
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
        state.selectedGraphNodeId = '';
        state.selectedGraphEdgeId = '';
        remountRenderer();
        syncDetailPanel();
    });
    queryElement?.addEventListener('input', (): void => {
        if (queryTimer !== null) {
            window.clearTimeout(queryTimer);
        }
        queryTimer = window.setTimeout((): void => {
            state.memoryGraphQuery = String(queryElement.value ?? '').trim();
            state.selectedGraphNodeId = '';
            state.selectedGraphEdgeId = '';
            queryTimer = null;
            remountRenderer();
            syncDetailPanel();
        }, 220);
    });
    modeButtons.forEach((button: HTMLElement): void => {
        button.addEventListener('click', (): void => {
            state.memoryGraphMode = resolveGraphMode(button.dataset.graphMode);
            state.selectedGraphNodeId = '';
            state.selectedGraphEdgeId = '';
            onRequestRender();
        });
    });

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
 * 功能：构建节点详情面板。
 * @param node 当前节点。
 * @param graphMode 图谱模式。
 * @returns 详情 HTML。
 */
function buildNodeDetailPanel(node: WorkbenchMemoryGraphNode, graphMode: MemoryGraphMode): string {
    const color = getMemoryGraphNodeColor(node.type);
    const summary = graphMode === 'debug'
        ? (node.debugSummary || node.summary || '暂无')
        : (node.semanticSummary || node.summary || '暂无');
    const metaHtml = graphMode === 'debug'
        ? renderMetaBlock([
            ['compareKey', node.compareKey || '暂无'],
            ['来源批次', node.sourceBatchIds.join('、') || '暂无'],
            ['sourceKinds', node.sourceKinds.join('、') || '暂无'],
            ['reasonCodes', node.reasonCodes.join('、') || '暂无'],
        ])
        : '';
    return `
        <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="width:12px;height:12px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
                <strong style="font-size:15px;">${escapeHtml(node.label)}</strong>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${color}22;color:${color};border:1px solid ${color}44;">${escapeHtml(resolveTypeLabel(node.type))}</span>
                ${node.status ? `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.06);">${escapeHtml(node.status)}</span>` : ''}
                ${node.placeholder ? `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);">未解析</span>` : ''}
            </div>
        </div>
        <div style="margin-bottom:12px;font-size:12px;line-height:1.6;opacity:0.86;">${escapeHtml(summary)}</div>
        ${metaHtml}
        ${renderSections(node.sections, graphMode)}
    `;
}

/**
 * 功能：构建边详情面板。
 * @param edge 当前边。
 * @param graph 图谱数据。
 * @param graphMode 图谱模式。
 * @returns 详情 HTML。
 */
function buildEdgeDetailPanel(edge: WorkbenchMemoryGraphEdge, graph: WorkbenchMemoryGraph, graphMode: MemoryGraphMode): string {
    const sourceNode = graph.nodes.find((node) => node.id === edge.source);
    const targetNode = graph.nodes.find((node) => node.id === edge.target);
    const label = graphMode === 'debug' ? edge.relationType : edge.semanticLabel;
    const metaHtml = graphMode === 'debug'
        ? renderMetaBlock([
            ['relationType', edge.relationType],
            ['confidence', String(edge.confidence)],
            ['sourceBatchIds', edge.sourceBatchIds.join('、') || '暂无'],
            ['sourceKinds', edge.sourceKinds.join('、') || '暂无'],
            ['reasonCodes', edge.reasonCodes.join('、') || '暂无'],
        ])
        : '';
    return `
        <div style="margin-bottom:12px;">
            <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">当前选中</div>
            <strong style="font-size:15px;">${escapeHtml(label)}</strong>
            <div style="font-size:12px;opacity:0.75;margin-top:6px;">${escapeHtml(sourceNode?.label ?? edge.source)} -> ${escapeHtml(targetNode?.label ?? edge.target)}</div>
        </div>
        ${metaHtml}
        ${renderSections(edge.sections, graphMode)}
    `;
}

/**
 * 功能：渲染简单元信息块。
 * @param rows 行数据。
 * @returns HTML。
 */
function renderMetaBlock(rows: Array<[string, string]>): string {
    const html = rows
        .filter(([, value]: [string, string]): boolean => Boolean(String(value ?? '').trim()))
        .map(([label, value]: [string, string]) => `<div style="margin-bottom:8px;"><div style="font-size:11px;opacity:0.5;margin-bottom:4px;">${escapeHtml(label)}</div><div style="font-size:12px;line-height:1.55;opacity:0.78;">${escapeHtml(value)}</div></div>`)
        .join('');
    return html ? `<div style="margin-bottom:12px;">${html}</div>` : '';
}

/**
 * 功能：渲染详情区块。
 * @param sections 详情区块。
 * @returns HTML。
 */
function renderSections(sections: WorkbenchMemoryGraphSection[], graphMode: MemoryGraphMode): string {
    return sections
        .filter((section: WorkbenchMemoryGraphSection): boolean => isVisibleInMode(section.visibleInModes, graphMode))
        .map((section: WorkbenchMemoryGraphSection) => {
            const visibleFields = section.fields.filter((field) => isVisibleInMode(field.visibleInModes, graphMode));
            if (visibleFields.length <= 0) {
                return '';
            }
            return `
            <div style="margin-bottom:12px;">
                <div style="font-size:11px;opacity:0.5;margin-bottom:6px;">${escapeHtml(section.title)}</div>
                ${visibleFields.map((field) => `<div style="margin-bottom:8px;"><div style="font-size:11px;opacity:0.58;margin-bottom:2px;">${escapeHtml(field.label)}</div><div style="font-size:12px;line-height:1.55;opacity:0.82;">${escapeHtml(field.value)}</div></div>`).join('')}
            </div>
        `;
        })
        .filter(Boolean)
        .join('');
}

/**
 * 功能：构建空状态详情。
 * @returns HTML。
 */
function buildEmptyDetailPanel(): string {
    return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.42;">
            <i class="fa-solid fa-circle-nodes" style="font-size:36px;margin-bottom:12px;"></i>
            <div style="font-size:13px;">点击节点查看语义详情，点击连线查看关系来源</div>
        </div>
    `;
}

/**
 * 功能：构建类型统计映射。
 * @param memoryGraph 图谱数据。
 * @returns 统计映射。
 */
function buildTypeCountMap(memoryGraph: WorkbenchMemoryGraph, graphMode: MemoryGraphMode): Map<string, number> {
    const result = new Map<string, number>();
    memoryGraph.nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        if (Array.isArray(node.visibleInModes) && node.visibleInModes.length > 0 && !node.visibleInModes.includes(graphMode)) {
            return;
        }
        result.set(node.type, (result.get(node.type) ?? 0) + 1);
    });
    return result;
}

/**
 * 功能：解析图谱模式。
 * @param value 原始值。
 * @returns 合法模式。
 */
function resolveGraphMode(value: unknown): MemoryGraphMode {
    return String(value ?? '').trim() === 'debug' ? 'debug' : 'semantic';
}

/**
 * 功能：解析图节点类型标签。
 * @param type 类型键。
 * @returns 中文标签。
 */
function resolveTypeLabel(type: string): string {
    return MEMORY_GRAPH_TYPE_LABELS[type] ?? type;
}

/**
 * 功能：判断详情区块或字段是否应在当前模式显示。
 * @param visibleInModes 可见模式列表。
 * @param graphMode 当前图谱模式。
 * @returns 是否可见。
 */
function isVisibleInMode(visibleInModes: MemoryGraphMode[] | undefined, graphMode: MemoryGraphMode): boolean {
    return !Array.isArray(visibleInModes) || visibleInModes.length <= 0 || visibleInModes.includes(graphMode);
}
