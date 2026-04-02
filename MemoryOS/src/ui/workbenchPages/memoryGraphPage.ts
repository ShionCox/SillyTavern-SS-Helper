import { escapeHtml } from '../editorShared';
import {
    resolveMemoryGraphFieldLabel,
    resolveMemoryGraphFieldValue,
    resolveMemoryGraphText,
} from '../workbenchLocale';
import type { WorkbenchSnapshot, WorkbenchState } from '../workbenchTabs/shared';
import { escapeAttr } from '../workbenchTabs/shared';
import { sanitizeWorkbenchDisplayText } from '../workbenchTabs/shared/workbench-text';
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
        ? buildNodeDetailPanel(selectedNode, snapshot.memoryGraph, currentMode)
        : selectedEdge
            ? buildEdgeDetailPanel(selectedEdge, snapshot.memoryGraph, currentMode)
            : '';
    const hasSelection = Boolean(selectedNode) || Boolean(selectedEdge);
    const detailHiddenAttr = hasSelection ? '' : ' hidden style="display:none;"';
    const typeCounts = buildTypeCountMap(snapshot.memoryGraph, currentMode);
    const typeOptions = [...typeCounts.entries()]
        .sort((left: [string, number], right: [string, number]): number => right[1] - left[1])
        .map(([type, count]: [string, number]): string => {
            return `<option value="${escapeAttr(type)}"${graphState.memoryGraphFilterType === type ? ' selected' : ''}>${escapeHtml(resolveTypeLabel(type))} (${count})</option>`;
        })
        .join('');
    const modeButtons = ([
        { mode: 'semantic' as MemoryGraphMode, label: resolveMemoryGraphText('mode_semantic') },
        { mode: 'debug' as MemoryGraphMode, label: resolveMemoryGraphText('mode_debug') },
    ]).map(({ mode, label }: { mode: MemoryGraphMode; label: string }): string => {
        const active = currentMode === mode;
        return `<button type="button" data-graph-mode="${mode}" style="font-size:11px;padding:2px 8px;border-radius:4px;background:${active ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.06)'};border:${active ? '1px solid rgba(96,165,250,0.42)' : '1px solid rgba(255,255,255,0.1)'};color:${active ? '#93c5fd' : 'rgba(255,255,255,0.66)'};cursor:pointer;font-family:inherit;">${escapeHtml(label)}</button>`;
    }).join('');
    const legendHtml = buildMemoryGraphLegendItems()
        .map((item) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="width:10px;height:10px;border-radius:50%;background:${item.color};display:inline-block;"></span><span style="font-size:11px;opacity:0.72;">${escapeHtml(item.label)}</span></span>`)
        .join('');

    return `
        <div class="stx-memory-graph-shell">
            <div class="stx-memory-graph-toolbar">
                <span style="font-size:12px;opacity:0.6;">${escapeHtml(resolveMemoryGraphText('node_count'))} <strong>${visibleGraph.nodes.length}</strong></span>
                <span style="font-size:12px;opacity:0.6;">${escapeHtml(resolveMemoryGraphText('edge_count'))} <strong>${visibleGraph.edges.length}</strong></span>
                <select id="${GRAPH_FILTER_ID}" class="stx-memory-workbench__select" style="max-width:170px;font-size:12px;">
                    <option value="">${escapeHtml(resolveMemoryGraphText('all_types'))}</option>
                    ${typeOptions}
                </select>
                <input id="${GRAPH_QUERY_ID}" class="stx-memory-workbench__input" style="max-width:220px;font-size:12px;" type="text" placeholder="${escapeAttr(resolveMemoryGraphText('search_placeholder'))}" value="${escapeAttr(graphState.memoryGraphQuery ?? '')}">
                <div style="display:flex;gap:4px;align-items:center;">${modeButtons}</div>
                <div style="margin-left:auto;">${legendHtml}</div>
            </div>
            <div class="stx-memory-graph-stage">
                <div id="${GRAPH_CONTAINER_ID}" style="position:absolute;inset:0;cursor:grab;z-index:1;"></div>
                <div id="${GRAPH_DETAIL_ID}" class="stx-memory-graph-detail stx-memory-graph-detail-panel" style="position:absolute;top:16px;right:16px;background:rgba(15,23,42,0.88);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-size:13px;z-index:100;pointer-events:auto;"${detailHiddenAttr}>
                    ${detailHtml}
                </div>
            </div>
        </div>
    `;
}

/**
 * 功能：挂载记忆图页面。
 * @param options 挂载参数。
 * @returns 无返回值。
 */
export function mountMemoryGraphPage(options: MountMemoryGraphPageOptions): void {
    destroyMemoryGraphPage();
    activeController = createMemoryGraphPageController(options);
}

/**
 * 功能：销毁记忆图页面控制器。
 * @returns 无返回值。
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
     * @returns 无返回值。
     */
    function syncDetailPanel(): void {
        if (!detailContainer) {
            return;
        }
        const selectedNode = snapshot.memoryGraph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === state.selectedGraphNodeId) ?? null;
        const selectedEdge = snapshot.memoryGraph.edges.find((edge: WorkbenchMemoryGraphEdge): boolean => edge.id === state.selectedGraphEdgeId) ?? null;
        const hasSelection = Boolean(selectedNode) || Boolean(selectedEdge);
        detailContainer.hidden = !hasSelection;
        detailContainer.style.display = hasSelection ? '' : 'none';
        detailContainer.innerHTML = selectedNode
            ? buildNodeDetailPanel(selectedNode, snapshot.memoryGraph, state.memoryGraphMode)
            : selectedEdge
                ? buildEdgeDetailPanel(selectedEdge, snapshot.memoryGraph, state.memoryGraphMode)
                : '';
        detailContainer.scrollTop = 0;
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
     * 功能：重新挂载 Pixi 渲染器。
     * @returns 无返回值。
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
function buildNodeDetailPanel(node: WorkbenchMemoryGraphNode, graph: WorkbenchMemoryGraph, graphMode: MemoryGraphMode): string {
    const color = getMemoryGraphNodeColor(node.type);
    const summary = graphMode === 'debug'
        ? (node.debugSummary || node.summary || '暂无')
        : (node.semanticSummary || node.summary || '暂无');
    const debugSections = graphMode === 'debug'
        ? [
            buildGraphMetricListMarkup(resolveMemoryGraphText('debug_meta_title'), 'fa-solid fa-microscope', [
                ['compare_key', node.compareKey || '暂无'],
            ]),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('source_batches'), 'fa-solid fa-layer-group', node.sourceBatchIds),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('source_kinds'), 'fa-solid fa-database', node.sourceKinds),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('reason_codes'), 'fa-solid fa-tags', node.reasonCodes),
        ].filter(Boolean).join('')
        : '';
    return `
        <div class="stx-memory-graph-detail__hero" style="--stx-memory-graph-accent:${color};">
            <div class="stx-memory-graph-detail__hero-head">
                <div class="stx-memory-graph-detail__icon">
                    <i class="fa-solid fa-circle-nodes"></i>
                </div>
                <div class="stx-memory-graph-detail__hero-copy">
                    <div class="stx-memory-graph-detail__eyebrow">${escapeHtml(resolveMemoryGraphText('node_detail'))}</div>
                    <strong class="stx-memory-graph-detail__title">${escapeHtml(sanitizeWorkbenchDisplayText(node.label, '未命名节点'))}</strong>
                </div>
            </div>
            <div class="stx-memory-graph-detail__chip-row">
                ${buildGraphChipMarkup(resolveTypeLabel(node.type), 'fa-solid fa-cubes', color)}
                ${node.status ? buildGraphChipMarkup(node.status, 'fa-solid fa-signal', '#93c5fd') : ''}
                ${node.placeholder ? buildGraphChipMarkup(resolveMemoryGraphText('unresolved'), 'fa-solid fa-triangle-exclamation', '#fca5a5') : ''}
            </div>
        </div>
        ${buildGraphSummaryCardMarkup(summary, graphMode === 'debug' ? 'fa-solid fa-bug' : 'fa-solid fa-wand-magic-sparkles')}
        ${debugSections}
        ${renderSections(node.sections, graph, graphMode, node.id)}
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
    const sourceNode = graph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === edge.source);
    const targetNode = graph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => node.id === edge.target);
    const label = graphMode === 'debug' ? edge.relationType : edge.semanticLabel;
    const confidenceText = Number.isFinite(edge.confidence) ? `${Math.round(edge.confidence * 100)}%` : '暂无';
    const debugSections = graphMode === 'debug'
        ? [
            buildGraphMetricListMarkup(resolveMemoryGraphText('edge_debug_meta_title'), 'fa-solid fa-screwdriver-wrench', [
                ['relation_type', edge.relationType || '暂无'],
                ['confidence', confidenceText],
            ]),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('source_batches'), 'fa-solid fa-layer-group', edge.sourceBatchIds),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('source_kinds'), 'fa-solid fa-database', edge.sourceKinds),
            buildGraphTagSectionMarkup(resolveMemoryGraphText('reason_codes'), 'fa-solid fa-tags', edge.reasonCodes),
        ].filter(Boolean).join('')
        : '';
    return `
        <div class="stx-memory-graph-detail__hero stx-memory-graph-detail__hero--edge" style="--stx-memory-graph-accent:#fbbf24;">
            <div class="stx-memory-graph-detail__hero-head">
                <div class="stx-memory-graph-detail__icon">
                    <i class="fa-solid fa-diagram-project"></i>
                </div>
                <div class="stx-memory-graph-detail__hero-copy">
                    <div class="stx-memory-graph-detail__eyebrow">${escapeHtml(resolveMemoryGraphText('edge_detail'))}</div>
                    <strong class="stx-memory-graph-detail__title">${escapeHtml(sanitizeWorkbenchDisplayText(label || resolveMemoryGraphText('unnamed_relation'), resolveMemoryGraphText('unnamed_relation')))}</strong>
                </div>
            </div>
            <div class="stx-memory-graph-detail__chip-row">
                ${buildGraphChipMarkup(label || resolveMemoryGraphText('unnamed_relation'), 'fa-solid fa-link', '#fbbf24')}
                ${buildGraphChipMarkup(confidenceText, 'fa-solid fa-chart-line', '#93c5fd')}
            </div>
            <div class="stx-memory-graph-detail__route">
                <button type="button" class="stx-memory-graph-detail__route-node" data-memory-graph-select-node="true" data-node-id="${escapeAttr(sourceNode?.id ?? edge.source)}">
                    <i class="fa-solid fa-circle-dot"></i>
                    <span>${escapeHtml(sanitizeWorkbenchDisplayText(sourceNode?.label ?? edge.source, '未命名节点'))}</span>
                </button>
                <i class="fa-solid fa-arrow-right-long stx-memory-graph-detail__route-arrow"></i>
                <button type="button" class="stx-memory-graph-detail__route-node" data-memory-graph-select-node="true" data-node-id="${escapeAttr(targetNode?.id ?? edge.target)}">
                    <i class="fa-solid fa-circle-dot"></i>
                    <span>${escapeHtml(sanitizeWorkbenchDisplayText(targetNode?.label ?? edge.target, '未命名节点'))}</span>
                </button>
            </div>
        </div>
        ${debugSections}
        ${renderSections(edge.sections, graph, graphMode)}
    `;
}

/**
 * 功能：构建图谱详情标签。
 * @param text 标签文本。
 * @param icon 图标类名。
 * @param color 标签颜色。
 * @returns 标签 HTML。
 */
function buildGraphChipMarkup(text: string, icon: string, color: string): string {
    const normalizedText = sanitizeWorkbenchDisplayText(text);
    if (!normalizedText) {
        return '';
    }
    return `
        <span class="stx-memory-graph-detail__chip" style="--stx-memory-graph-chip-color:${color};">
            <i class="${escapeAttr(icon)}"></i>
            <span>${escapeHtml(normalizedText)}</span>
        </span>
    `;
}

/**
 * 功能：构建图谱摘要卡片。
 * @param text 摘要文本。
 * @param icon 图标类名。
 * @returns 卡片 HTML。
 */
function buildGraphSummaryCardMarkup(text: string, icon: string): string {
    return `
        <section class="stx-memory-graph-detail__section">
            <div class="stx-memory-graph-detail__section-title">
                <i class="${escapeAttr(icon)}"></i>
                <span>${escapeHtml(resolveMemoryGraphText('summary_title'))}</span>
            </div>
            <div class="stx-memory-graph-detail__summary">${escapeHtml(sanitizeWorkbenchDisplayText(text, '暂无'))}</div>
        </section>
    `;
}

/**
 * 功能：构建标签区块。
 * @param title 区块标题。
 * @param icon 图标类名。
 * @param values 标签值列表。
 * @returns 区块 HTML。
 */
function buildGraphTagSectionMarkup(title: string, icon: string, values: string[]): string {
    const normalizedValues = values
        .map((value: string): string => String(value ?? '').trim())
        .filter(Boolean);
    if (normalizedValues.length <= 0) {
        return '';
    }
    return `
        <section class="stx-memory-graph-detail__section">
            <div class="stx-memory-graph-detail__section-title">
                <i class="${escapeAttr(icon)}"></i>
                <span>${escapeHtml(title)}</span>
            </div>
            <div class="stx-memory-graph-detail__tag-grid">
                ${normalizedValues.map((value: string): string => `
                    <span class="stx-memory-graph-detail__tag">
                        <i class="fa-solid fa-hashtag"></i>
                        <span>${escapeHtml(sanitizeWorkbenchDisplayText(value))}</span>
                    </span>
                `).join('')}
            </div>
        </section>
    `;
}

/**
 * 功能：构建指标列表区块。
 * @param title 区块标题。
 * @param icon 图标类名。
 * @param rows 行数据。
 * @returns 区块 HTML。
 */
function buildGraphMetricListMarkup(title: string, icon: string, rows: Array<[string, string]>): string {
    const visibleRows = rows
        .map(([label, value]: [string, string]): [string, string] => [label, String(value ?? '').trim()])
        .filter(([, value]: [string, string]): boolean => Boolean(value));
    if (visibleRows.length <= 0) {
        return '';
    }
    return `
        <section class="stx-memory-graph-detail__section">
            <div class="stx-memory-graph-detail__section-title">
                <i class="${escapeAttr(icon)}"></i>
                <span>${escapeHtml(title)}</span>
            </div>
            <div class="stx-memory-graph-detail__metric-list">
                ${visibleRows.map(([label, value]: [string, string]): string => `
                    <div class="stx-memory-graph-detail__metric-row">
                        <span>${escapeHtml(resolveMemoryGraphFieldLabel(label))}</span>
                        <strong>${escapeHtml(sanitizeWorkbenchDisplayText(resolveMemoryGraphFieldValue(value)))}</strong>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

/**
 * 功能：渲染详情区块。
 * @param sections 详情区块。
 * @param graphMode 图谱模式。
 * @returns HTML。
 */
function renderSections(
    sections: WorkbenchMemoryGraphSection[],
    graph: WorkbenchMemoryGraph,
    graphMode: MemoryGraphMode,
    currentNodeId?: string,
): string {
    const jumpButtonLabel = resolveMemoryGraphText('jump_to_node') === 'jump_to_node'
        ? '跳转并聚焦节点'
        : resolveMemoryGraphText('jump_to_node');
    return sections
        .filter((section: WorkbenchMemoryGraphSection): boolean => isVisibleInMode(section.visibleInModes, graphMode))
        .map((section: WorkbenchMemoryGraphSection): string => {
            const visibleFields = section.fields.filter((field) => isVisibleInMode(field.visibleInModes, graphMode));
            if (visibleFields.length <= 0) {
                return '';
            }
            return `
                <section class="stx-memory-graph-detail__section">
                    <div class="stx-memory-graph-detail__section-title">
                        <i class="fa-solid fa-folder-tree"></i>
                        <span>${escapeHtml(sanitizeWorkbenchDisplayText(section.title))}</span>
                    </div>
                    <div class="stx-memory-graph-detail__field-list">
                        ${visibleFields.map((field) => {
                            const relatedNodeId = resolveRelatedNodeId(field, graph, currentNodeId);
                            return `
                            <div class="stx-memory-graph-detail__field-card">
                                <div class="stx-memory-graph-detail__field-head">
                                    <div class="stx-memory-graph-detail__field-label">${escapeHtml(sanitizeWorkbenchDisplayText(resolveMemoryGraphFieldLabel(field.label)))}</div>
                                    ${relatedNodeId ? `
                                        <button
                                            type="button"
                                            class="stx-memory-graph-detail__jump-btn"
                                            data-memory-graph-select-node="true"
                                            data-node-id="${escapeAttr(relatedNodeId)}"
                                            title="${escapeAttr(jumpButtonLabel)}"
                                            aria-label="${escapeAttr(jumpButtonLabel)}"
                                        >
                                            <i class="fa-solid fa-location-crosshairs"></i>
                                        </button>
                                    ` : ''}
                                </div>
                                <div class="stx-memory-graph-detail__field-value">${escapeHtml(sanitizeWorkbenchDisplayText(resolveMemoryGraphFieldValue(field.value)))}</div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </section>
            `;
        })
        .filter(Boolean)
        .join('');
}

/**
 * 功能：为详情字段解析可跳转的相关节点。
 * @param field 当前字段
 * @param graph 图谱数据
 * @param currentNodeId 当前已选节点 ID
 * @returns 可跳转节点 ID；不存在时返回空字符串
 */
function resolveRelatedNodeId(
    field: WorkbenchMemoryGraphSection['fields'][number],
    graph: WorkbenchMemoryGraph,
    currentNodeId?: string,
): string {
    const explicitNodeId = String(field.targetNodeId ?? '').trim();
    if (explicitNodeId && explicitNodeId !== currentNodeId) {
        return explicitNodeId;
    }
    const normalizedValue = String(field.value ?? '').trim();
    if (!normalizedValue || /[、,，;；]/.test(normalizedValue)) {
        return '';
    }
    const matchedNode = graph.nodes.find((node: WorkbenchMemoryGraphNode): boolean => {
        if (node.id === currentNodeId) {
            return false;
        }
        return node.label === normalizedValue
            || node.id === normalizedValue
            || node.compareKey === normalizedValue;
    });
    return matchedNode?.id ?? '';
}

/**
 * 功能：构建类型统计映射。
 * @param memoryGraph 图谱数据。
 * @param graphMode 图谱模式。
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
