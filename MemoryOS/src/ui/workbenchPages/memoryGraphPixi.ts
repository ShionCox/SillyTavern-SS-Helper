import * as PIXI from 'pixi.js';
import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { gsap } from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import type { FederatedPointerEvent } from 'pixi.js';
import type {
    MemoryGraphMode,
    WorkbenchMemoryGraph,
    WorkbenchMemoryGraphEdge,
    WorkbenchMemoryGraphNode,
} from '../workbenchTabs/shared/memoryGraphTypes';
import {
    computeMemoryGraphNodeSize,
    getMemoryGraphNodeColor,
} from '../workbenchTabs/shared/memoryGraphTypes';
import { stripComparePrefix } from '../workbenchTabs/shared/display-label-resolver';

/**
 * 功能：记忆图筛选选项。
 * @param filterType 类型筛选。
 * @param searchQuery 搜索关键字。
 * @param graphMode 图谱模式。
 */
export interface MemoryGraphFilterOptions {
    filterType?: string;
    searchQuery?: string;
    graphMode?: MemoryGraphMode;
}

/**
 * 功能：记忆图渲染选项。
 * @param selectedNodeId 当前选中的节点 ID。
 * @param filterType 类型筛选。
 * @param searchQuery 搜索关键字。
 * @param graphMode 图谱模式。
 * @param onSelectNode 节点选择回调。
 */
export interface MemoryGraphPixiRenderOptions extends MemoryGraphFilterOptions {
    selectedNodeId?: string;
    selectedEdgeId?: string;
    onSelectNode?: (nodeId: string) => void;
    onSelectEdge?: (edgeId: string) => void;
}

/**
 * 功能：筛选后的记忆图结果。
 * @param nodes 可见节点。
 * @param edges 可见边。
 */
export interface FilteredMemoryGraphResult {
    nodes: WorkbenchMemoryGraphNode[];
    edges: WorkbenchMemoryGraphEdge[];
}

/**
 * 功能：Pixi 记忆图控制器。
 * @param destroy 销毁渲染器。
 * @param setSelectedNode 更新当前选中节点。
 */
export interface MemoryGraphPixiController {
    destroy(): void;
    setSelectedNode(nodeId?: string, options?: { focus?: boolean }): void;
}

interface GraphCameraState {
    scale: number;
    translateX: number;
    translateY: number;
}

interface GraphNodeSprite {
    node: WorkbenchMemoryGraphNode;
    root: Container;
    content: Container;
    pulseRing: Graphics;
    glow: Graphics;
    body: Graphics;
    label: Text;
    depthFactor: number;
}

interface GraphEdgeSprite {
    edge: WorkbenchMemoryGraphEdge;
    sourceId: string;
    targetId: string;
    sourceNode: WorkbenchMemoryGraphNode;
    targetNode: WorkbenchMemoryGraphNode;
    baseAlpha: number;
    sourceColor: number;
    targetColor: number;
}

interface DragState {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
}

interface GraphBackgroundStar {
    root: Container;
    baseX: number;
    baseY: number;
    depthFactor: number;
    phase: number;
    speed: number;
    driftRadius: number;
    driftSpeed: number;
    minAlpha: number;
    maxAlpha: number;
    minScale: number;
    maxScale: number;
}

let persistedCameraState: GraphCameraState | null = null;
const EDGE_SEGMENT_COUNT = 14;
const FLOW_SEGMENT_COUNT = 12;
const FLOW_TAIL_LENGTH = 0.26;
const FLOW_SELECTED_REDRAW_INTERVAL_MS = 33;
const FLOW_HOVER_REDRAW_INTERVAL_MS = 66;
const MEMORY_GRAPH_NODE_SCALE = 0.78;
const COSMIC_PARALLAX_STRENGTH = 0.032;
const COSMIC_SCALE_STRENGTH = 0.05;
const EDGE_HOVER_DELAY_MS = 720;
const NODE_DEPTH_SCALE_STRENGTH = 0.08;
const FPS_PANEL_UPDATE_INTERVAL_MS = 320;

gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

/**
 * 功能：按当前筛选条件裁剪记忆图数据。
 * @param data 原始记忆图。
 * @param options 筛选参数。
 * @returns 筛选结果。
 */
export function filterMemoryGraphData(
    data: WorkbenchMemoryGraph,
    options: MemoryGraphFilterOptions = {},
): FilteredMemoryGraphResult {
    const graphMode = options.graphMode ?? 'semantic';
    let nodes: WorkbenchMemoryGraphNode[] = data.nodes.filter((node: WorkbenchMemoryGraphNode): boolean => {
        if (!node.visibleInModes || node.visibleInModes.length <= 0) {
            return true;
        }
        return node.visibleInModes.includes(graphMode);
    });
    if (options.filterType) {
        nodes = nodes.filter((node: WorkbenchMemoryGraphNode): boolean => node.type === options.filterType);
    }
    if (options.searchQuery) {
        const query = options.searchQuery.toLowerCase();
        nodes = nodes.filter((node: WorkbenchMemoryGraphNode): boolean => {
            return node.label.toLowerCase().includes(query)
                || String(node.summary ?? '').toLowerCase().includes(query)
                || String(node.compareKey ?? '').toLowerCase().includes(query)
                || (node.aliases ?? []).some((tag: string): boolean => tag.toLowerCase().includes(query));
        });
    }
    const visibleNodeIds = new Set(nodes.map((node: WorkbenchMemoryGraphNode): string => node.id));
    const edges = data.edges.filter((edge: WorkbenchMemoryGraphEdge): boolean => {
        if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
            return false;
        }
        if (edge.visibleInModes && !edge.visibleInModes.includes(graphMode)) {
            return false;
        }
        return true;
    });
    return { nodes, edges };
}

/**
 * 功能：创建 Pixi 版记忆图渲染器。
 * @param container 承载画布的容器。
 * @param data 原始记忆图数据。
 * @param options 渲染配置。
 * @returns 渲染控制器。
 */
export async function createMemoryGraphPixiRenderer(
    container: HTMLElement,
    data: WorkbenchMemoryGraph,
    options: MemoryGraphPixiRenderOptions = {},
): Promise<MemoryGraphPixiController> {
    const filtered = filterMemoryGraphData(data, options);
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.userSelect = 'none';
    container.style.touchAction = 'none';
    container.style.cursor = 'grab';
    if (filtered.nodes.length <= 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.48;font-size:14px;">当前筛选条件下没有可显示的记忆节点。</div>';
        return createEmptyController(container);
    }

    const app = new Application();
    await app.init({
        resizeTo: container,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl',
    });

    container.appendChild(app.canvas as HTMLCanvasElement);
    const overlayControls = document.createElement('div');
    overlayControls.style.position = 'absolute';
    overlayControls.style.top = '10px';
    overlayControls.style.left = '10px';
    overlayControls.style.zIndex = '4';
    overlayControls.style.display = 'flex';
    overlayControls.style.alignItems = 'center';
    overlayControls.style.gap = '8px';
    overlayControls.style.pointerEvents = 'none';
    container.appendChild(overlayControls);
    const fpsBadge = document.createElement('div');
    fpsBadge.style.padding = '4px 8px';
    fpsBadge.style.borderRadius = '999px';
    fpsBadge.style.background = 'rgba(2, 6, 23, 0.72)';
    fpsBadge.style.border = '1px solid rgba(148, 163, 184, 0.28)';
    fpsBadge.style.color = '#e2e8f0';
    fpsBadge.style.fontSize = '11px';
    fpsBadge.style.lineHeight = '1';
    fpsBadge.style.fontFamily = 'Consolas, "Microsoft YaHei", monospace';
    fpsBadge.style.pointerEvents = 'none';
    fpsBadge.textContent = 'FPS --';
    overlayControls.appendChild(fpsBadge);
    const backgroundToggle = document.createElement('button');
    backgroundToggle.type = 'button';
    backgroundToggle.style.padding = '4px 10px';
    backgroundToggle.style.borderRadius = '999px';
    backgroundToggle.style.border = '1px solid rgba(148, 163, 184, 0.28)';
    backgroundToggle.style.background = 'rgba(2, 6, 23, 0.72)';
    backgroundToggle.style.color = '#e2e8f0';
    backgroundToggle.style.fontSize = '11px';
    backgroundToggle.style.lineHeight = '1';
    backgroundToggle.style.fontFamily = 'Consolas, "Microsoft YaHei", monospace';
    backgroundToggle.style.pointerEvents = 'auto';
    backgroundToggle.style.cursor = 'pointer';
    overlayControls.appendChild(backgroundToggle);
    const stage = app.stage;
    const background = new Graphics();
    const cosmicLayer = new Container();
    const rippleLayer = new Graphics();
    const world = new Container();
    const edgeLayer = new Container();
    const edgeGraphics = new Graphics();
    const flowGraphics = new Graphics();
    const nodeLayer = new Container();
    const nodeSprites = new Map<string, GraphNodeSprite>();
    const edgeSprites: GraphEdgeSprite[] = [];
    const connectedNodeIds = new Set<string>();
    const camera = createInitialCamera(container);
    const nodeMap = new Map(filtered.nodes.map((node: WorkbenchMemoryGraphNode): [string, WorkbenchMemoryGraphNode] => [node.id, node]));
    const flowState = { progress: 0, intensity: 0 };
    let selectedNodeId = options.selectedNodeId ?? '';
    let selectedEdgeId = options.selectedEdgeId ?? '';
    let hoveredEdgeId = '';
    let hoveredEdgeCandidateId = '';
    let dragState: DragState | null = null;
    let suppressTapUntil = 0;
    let suppressHoverUntil = 0;
    let destroyed = false;
    let cameraTween: gsap.core.Tween | null = null;
    let flowTween: gsap.core.Timeline | null = null;
    let pulseTween: gsap.core.Timeline | null = null;
    let pulsingSprite: GraphNodeSprite | null = null;
    let cosmicStars: GraphBackgroundStar[] = [];
    let cosmicTime = 0;
    const cosmicDepthState = {
        offsetX: 0,
        offsetY: 0,
        zoom: 1,
    };
    const hoverVisualState = { intensity: 0 };
    const selectionRippleState = {
        progress: 0,
        intensity: 0,
        x: 0,
        y: 0,
    };
    let hoverArmTimer: number | null = null;
    let hoverVisualTween: gsap.core.Tween | null = null;
    let selectionRippleTween: gsap.core.Timeline | null = null;
    let dragFrameId: number | null = null;
    let fpsFrameCount = 0;
    let fpsElapsedMs = 0;
    let backgroundAnimationEnabled = true;
    let lastSelectedFlowRedrawAt = 0;
    let lastHoverFlowRedrawAt = 0;
    const pendingDragCamera = {
        translateX: camera.translateX,
        translateY: camera.translateY,
    };

    /**
     * 功能：同步左上角背景动画按钮文案与状态。
     * @returns 无返回值。
     */
    function syncBackgroundToggleLabel(): void {
        backgroundToggle.textContent = `背景动画 ${backgroundAnimationEnabled ? '开' : '关'}`;
        backgroundToggle.style.opacity = backgroundAnimationEnabled ? '1' : '0.78';
    }
    syncBackgroundToggleLabel();
    backgroundToggle.addEventListener('click', (): void => {
        backgroundAnimationEnabled = !backgroundAnimationEnabled;
        syncBackgroundToggleLabel();
    });

    stage.eventMode = 'static';
    stage.hitArea = app.screen;
    background.eventMode = 'static';
    background.cursor = 'grab';
    edgeGraphics.blendMode = 'add';
    flowGraphics.blendMode = 'add';
    cosmicLayer.eventMode = 'none';
    rippleLayer.eventMode = 'none';
    rippleLayer.blendMode = 'add';
    world.addChild(edgeLayer);
    world.addChild(nodeLayer);
    edgeLayer.addChild(edgeGraphics);
    edgeLayer.addChild(flowGraphics);
    stage.addChild(background);
    stage.addChild(cosmicLayer);
    stage.addChild(rippleLayer);
    stage.addChild(world);

    redrawBackground(background, app.screen.width, app.screen.height);
    cosmicStars = buildCosmicBackground(cosmicLayer, app.screen.width, app.screen.height);
    applyCamera(world, cosmicLayer, rippleLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
    syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);

    filtered.edges.forEach((edge: WorkbenchMemoryGraphEdge): void => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
            return;
        }
        const baseAlpha = resolveBaseEdgeAlpha(edge);
        edgeSprites.push({
            edge,
            sourceId: source.id,
            targetId: target.id,
            sourceNode: source,
            targetNode: target,
            baseAlpha,
            sourceColor: toPixiColor(getMemoryGraphNodeColor(source.type)),
            targetColor: toPixiColor(getMemoryGraphNodeColor(target.type)),
        });
    });

    filtered.nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        const root = new Container();
        const content = new Container();
        const pulseRing = new Graphics();
        const glow = new Graphics();
        const body = new Graphics();
        const label = new Text({
            text: resolveRenderedGraphLabel(node.label, node.compareKey),
            anchor: { x: 0.5, y: 0 },
            style: {
                fill: '#dbe7ff',
                fontSize: 11,
                fontFamily: 'Consolas, "Microsoft YaHei", monospace',
                align: 'center',
                stroke: { color: '#020617', width: 3 },
            },
        });
        root.position.set(node.x, node.y);
        root.eventMode = 'static';
        root.cursor = 'pointer';
        pulseRing.blendMode = 'add';
        glow.blendMode = 'add';
        root.addChild(pulseRing);
        root.addChild(content);
        content.addChild(glow);
        content.addChild(body);
        label.position.set(0, getRenderedNodeRadius(node) + 8);
        content.addChild(label);
        root.on('pointerdown', (event: FederatedPointerEvent): void => {
            handleDragStart(event);
            event.stopPropagation();
        });
        root.on('pointertap', (event: FederatedPointerEvent): void => {
            event.stopPropagation();
            if (performance.now() < suppressTapUntil) {
                return;
            }
            resetHoveredEdge(true);
            selectedNodeId = node.id;
            selectedEdgeId = '';
            focusNode(node.id, true);
            syncSelectionVisuals(
                nodeSprites,
                edgeSprites,
                edgeGraphics,
                flowGraphics,
                connectedNodeIds,
                selectedNodeId,
                selectedEdgeId,
                hoveredEdgeId,
                hoverVisualState.intensity,
                camera.scale,
                false,
                flowState.progress,
                flowState.intensity,
            );
            syncSelectionAnimation();
            options.onSelectNode?.(node.id);
        });
        nodeLayer.addChild(root);
        nodeSprites.set(node.id, {
            node,
            root,
            content,
            pulseRing,
            glow,
            body,
            label,
            depthFactor: resolveNodeDepthFactor(node),
        });
    });

    /**
     * 功能：清理线条悬浮延迟计时器。
     * @returns 无返回值。
     */
    function clearHoverArmTimer(): void {
        if (hoverArmTimer !== null) {
            window.clearTimeout(hoverArmTimer);
            hoverArmTimer = null;
        }
    }

    /**
     * 功能：同步当前悬浮高亮的渲染状态。
     * @param isDragging 是否正在拖拽。
     * @returns 无返回值。
     */
    function syncHoverVisuals(isDragging: boolean = false): void {
        syncSelectionVisuals(
            nodeSprites,
            edgeSprites,
            edgeGraphics,
            flowGraphics,
            connectedNodeIds,
            selectedNodeId,
            selectedEdgeId,
            hoveredEdgeId,
            hoverVisualState.intensity,
            camera.scale,
            isDragging,
            flowState.progress,
            flowState.intensity,
        );
    }

    /**
     * 功能：按频率限制流光层重绘，避免高频 onUpdate 持续压榨主线程和 GPU 提交。
     * @param mode 当前流光模式。
     * @param force 是否忽略频率限制强制重绘。
     * @returns 无返回值。
     */
    function redrawFlowLayerThrottled(mode: 'selected' | 'hover', force: boolean = false): void {
        const now = performance.now();
        const interval = mode === 'selected' ? FLOW_SELECTED_REDRAW_INTERVAL_MS : FLOW_HOVER_REDRAW_INTERVAL_MS;
        const lastRedrawAt = mode === 'selected' ? lastSelectedFlowRedrawAt : lastHoverFlowRedrawAt;
        if (!force && (now - lastRedrawAt) < interval) {
            return;
        }
        if (mode === 'selected') {
            lastSelectedFlowRedrawAt = now;
        } else {
            lastHoverFlowRedrawAt = now;
        }
        redrawFlowLayer(
            flowGraphics,
            edgeSprites,
            selectedNodeId,
            selectedEdgeId,
            hoveredEdgeId,
            hoverVisualState.intensity,
            flowState.progress,
            flowState.intensity,
        );
    }

    /**
     * 功能：以缓动方式切换线条悬浮高亮状态。
     * @param nextEdgeId 下一条需要高亮的边。
     * @returns 无返回值。
     */
    function animateHoveredEdge(nextEdgeId: string): void {
        hoverVisualTween?.kill();
        if (!hoveredEdgeId) {
            hoveredEdgeId = nextEdgeId;
            if (!hoveredEdgeId) {
                background.cursor = 'grab';
                container.style.cursor = 'grab';
                hoverVisualState.intensity = 0;
                syncHoverVisuals(false);
                return;
            }
            hoverVisualState.intensity = 0;
            syncHoverVisuals(false);
            hoverVisualTween = gsap.to(hoverVisualState, {
                intensity: 1,
                duration: 0.36,
                ease: 'sine.out',
                onUpdate: (): void => {
                    syncHoverVisuals(false);
                },
            });
            return;
        }
        if (!nextEdgeId) {
            hoverVisualTween = gsap.to(hoverVisualState, {
                intensity: 0,
                duration: 0.26,
                ease: 'sine.inOut',
                onUpdate: (): void => {
                    syncHoverVisuals(false);
                },
                onComplete: (): void => {
                    hoveredEdgeId = '';
                    background.cursor = 'grab';
                    container.style.cursor = 'grab';
                    syncHoverVisuals(false);
                },
            });
            return;
        }
        if (nextEdgeId === hoveredEdgeId) {
            background.cursor = 'pointer';
            container.style.cursor = 'pointer';
            hoverVisualTween = gsap.to(hoverVisualState, {
                intensity: 1,
                duration: 0.22,
                ease: 'sine.out',
                onUpdate: (): void => {
                    syncHoverVisuals(false);
                },
            });
            return;
        }
        hoverVisualTween = gsap.to(hoverVisualState, {
            intensity: 0,
            duration: 0.18,
            ease: 'sine.inOut',
            onUpdate: (): void => {
                syncHoverVisuals(false);
            },
            onComplete: (): void => {
                hoveredEdgeId = nextEdgeId;
                background.cursor = 'pointer';
                container.style.cursor = 'pointer';
                hoverVisualState.intensity = 0;
                syncHoverVisuals(false);
                hoverVisualTween = gsap.to(hoverVisualState, {
                    intensity: 1,
                    duration: 0.34,
                    ease: 'sine.out',
                    onUpdate: (): void => {
                        syncHoverVisuals(false);
                    },
                });
            },
        });
    }

    /**
     * 功能：重置线条悬浮状态。
     * @param immediate 是否立刻清空。
     * @returns 无返回值。
     */
    function resetHoveredEdge(immediate: boolean): void {
        clearHoverArmTimer();
        hoveredEdgeCandidateId = '';
        if (immediate) {
            hoverVisualTween?.kill();
            hoveredEdgeId = '';
            hoverVisualState.intensity = 0;
            syncHoverVisuals(false);
            return;
        }
        animateHoveredEdge('');
    }

    /**
     * 功能：为线条悬浮高亮安排延迟触发。
     * @param nextEdgeId 当前指针命中的边。
     * @returns 无返回值。
     */
    function scheduleHoveredEdge(nextEdgeId: string): void {
        if (selectedNodeId || selectedEdgeId) {
            return;
        }
        if (nextEdgeId === hoveredEdgeCandidateId) {
            return;
        }
        clearHoverArmTimer();
        hoveredEdgeCandidateId = nextEdgeId;
        if (!nextEdgeId) {
            background.cursor = 'grab';
            container.style.cursor = 'grab';
            resetHoveredEdge(false);
            return;
        }
        background.cursor = 'crosshair';
        container.style.cursor = 'crosshair';
        if (hoveredEdgeId && hoveredEdgeId !== nextEdgeId) {
            animateHoveredEdge('');
        }
        hoverArmTimer = window.setTimeout((): void => {
            hoverArmTimer = null;
            if (destroyed || selectedNodeId || selectedEdgeId) {
                return;
            }
            if (hoveredEdgeCandidateId !== nextEdgeId) {
                return;
            }
            background.cursor = 'pointer';
            container.style.cursor = 'pointer';
            animateHoveredEdge(nextEdgeId);
        }, EDGE_HOVER_DELAY_MS);
    }

    /**
     * 功能：处理画布拖拽开始。
     * @param event Pixi 指针事件。
     * @returns 无返回值。
     */
    function handleDragStart(event: FederatedPointerEvent): void {
        if (event.button !== 0) {
            return;
        }
        cameraTween?.kill();
        cameraTween = null;
        resetHoveredEdge(true);
        pendingDragCamera.translateX = camera.translateX;
        pendingDragCamera.translateY = camera.translateY;
        dragState = {
            pointerId: event.pointerId,
            startX: event.global.x,
            startY: event.global.y,
            originX: camera.translateX,
            originY: camera.translateY,
            moved: false,
        };
        background.cursor = 'grabbing';
        container.style.cursor = 'grabbing';
        syncSelectionVisuals(
            nodeSprites,
            edgeSprites,
            edgeGraphics,
            flowGraphics,
            connectedNodeIds,
            selectedNodeId,
            selectedEdgeId,
            hoveredEdgeId,
            hoverVisualState.intensity,
            camera.scale,
            true,
            flowState.progress,
            flowState.intensity,
        );
        syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, true);
    }

    /**
     * 功能：把拖拽期间累计的相机位移合帧提交到渲染层。
     * @returns 无返回值。
     */
    function flushDragCameraTransform(): void {
        camera.translateX = pendingDragCamera.translateX;
        camera.translateY = pendingDragCamera.translateY;
        applyCamera(world, cosmicLayer, rippleLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
        syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
    }

    /**
     * 功能：使用 requestAnimationFrame 合并拖拽期间的高频相机更新。
     * @returns 无返回值。
     */
    function scheduleDragCameraTransform(): void {
        if (dragFrameId !== null) {
            return;
        }
        dragFrameId = window.requestAnimationFrame((): void => {
            dragFrameId = null;
            if (destroyed) {
                return;
            }
            flushDragCameraTransform();
        });
    }

    /**
     * 功能：处理拖拽中的相机移动。
     * @param event Pixi 指针事件。
     * @returns 无返回值。
     */
    function handleGlobalPointerMove(event: FederatedPointerEvent): void {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            if (dragState) {
                return;
            }
            if (performance.now() < suppressHoverUntil) {
                scheduleHoveredEdge('');
                return;
            }
            const worldPoint = world.toLocal(event.global);
            const edgeHit = !selectedNodeId && !selectedEdgeId
                ? findClosestEdge(edgeSprites, worldPoint.x, worldPoint.y, camera.scale)
                : null;
            scheduleHoveredEdge(edgeHit?.edge.id ?? '');
            return;
        }
        const deltaX = event.global.x - dragState.startX;
        const deltaY = event.global.y - dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX, deltaY) >= 4) {
            dragState.moved = true;
        }
        pendingDragCamera.translateX = dragState.originX + deltaX;
        pendingDragCamera.translateY = dragState.originY + deltaY;
        scheduleDragCameraTransform();
    }

    /**
     * 功能：结束拖拽状态。
     * @param event Pixi 指针事件。
     * @returns 无返回值。
     */
    function handleDragEnd(event?: FederatedPointerEvent): void {
        if (!dragState) {
            return;
        }
        if (event && dragState.pointerId !== event.pointerId) {
            return;
        }
        if (dragState.moved) {
            suppressTapUntil = performance.now() + 140;
            suppressHoverUntil = performance.now() + 260;
        }
        if (dragFrameId !== null) {
            window.cancelAnimationFrame(dragFrameId);
            dragFrameId = null;
        }
        flushDragCameraTransform();
        dragState = null;
        background.cursor = 'grab';
        container.style.cursor = 'grab';
        syncNodeDepth(nodeSprites, camera.scale);
        syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, false);
    }

    /**
     * 功能：处理背景点击取消选中。
     * @returns 无返回值。
     */
    function handleBackgroundTap(event: FederatedPointerEvent): void {
        if (performance.now() < suppressTapUntil) {
            return;
        }
        const worldPoint = world.toLocal(event.global);
        const edgeHit = findClosestEdge(edgeSprites, worldPoint.x, worldPoint.y, camera.scale);
        if (edgeHit) {
            resetHoveredEdge(true);
            selectedNodeId = '';
            selectedEdgeId = edgeHit.edge.id;
            syncSelectionVisuals(
                nodeSprites,
                edgeSprites,
                edgeGraphics,
                flowGraphics,
                connectedNodeIds,
                selectedNodeId,
                selectedEdgeId,
                hoveredEdgeId,
                hoverVisualState.intensity,
                camera.scale,
                false,
                flowState.progress,
                flowState.intensity,
            );
            syncSelectionAnimation();
            options.onSelectEdge?.(edgeHit.edge.id);
            return;
        }
        resetHoveredEdge(true);
        selectedNodeId = '';
        selectedEdgeId = '';
        syncSelectionVisuals(
            nodeSprites,
            edgeSprites,
            edgeGraphics,
            flowGraphics,
            connectedNodeIds,
            selectedNodeId,
            selectedEdgeId,
            hoveredEdgeId,
            hoverVisualState.intensity,
            camera.scale,
            false,
            flowState.progress,
            flowState.intensity,
        );
        syncSelectionAnimation();
        options.onSelectNode?.('');
        options.onSelectEdge?.('');
    }

    /**
     * 功能：处理滚轮缩放。
     * @param event 浏览器滚轮事件。
     * @returns 无返回值。
     */
    function handleWheel(event: WheelEvent): void {
        event.preventDefault();
        cameraTween?.kill();
        cameraTween = null;
        const zoomIntensity = 0.12;
        const direction = event.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(direction * zoomIntensity);
        const rect = container.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        camera.translateX = mouseX - (mouseX - camera.translateX) * zoomFactor;
        camera.translateY = mouseY - (mouseY - camera.translateY) * zoomFactor;
        camera.scale = clamp(camera.scale * zoomFactor, 0.18, 5);
        applyCamera(world, cosmicLayer, rippleLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
        syncNodeDepth(nodeSprites, camera.scale);
        syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
        syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, false);
    }

    /**
     * 功能：把目标节点聚焦到画布中央。
     * @param nodeId 目标节点 ID。
     * @returns 无返回值。
     */
    function focusNode(nodeId?: string, animate: boolean = false): void {
        if (!nodeId) {
            return;
        }
        const node = nodeMap.get(nodeId);
        if (!node) {
            return;
        }
        const targetX = app.screen.width / 2 - (node.x * camera.scale);
        const targetY = app.screen.height / 2 - (node.y * camera.scale);
        if (!animate) {
            camera.translateX = targetX;
            camera.translateY = targetY;
            applyCamera(world, cosmicLayer, rippleLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
            syncNodeDepth(nodeSprites, camera.scale);
            syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
            return;
        }
        cameraTween?.kill();
        cameraTween = gsap.to(world, {
            duration: 0.62,
            ease: 'power3.out',
            pixi: {
                x: targetX,
                y: targetY,
            },
            onUpdate: (): void => {
                syncCameraStateFromWorld(world, camera);
                syncCosmicParallax(cosmicLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
                syncNodeDepth(nodeSprites, camera.scale);
                syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
                syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, false);
            },
            onComplete: (): void => {
                syncCameraStateFromWorld(world, camera);
                cameraTween = null;
            },
        });
    }

    background.on('pointerdown', handleDragStart);
    background.on('pointertap', handleBackgroundTap);
    stage.on('globalpointermove', handleGlobalPointerMove);
    stage.on('pointerup', handleDragEnd);
    stage.on('pointerupoutside', handleDragEnd);
    app.canvas.addEventListener('wheel', handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver((): void => {
        redrawBackground(background, app.screen.width, app.screen.height);
        cosmicStars = buildCosmicBackground(cosmicLayer, app.screen.width, app.screen.height);
        syncCosmicParallax(cosmicLayer, camera, app.screen.width, app.screen.height, cosmicDepthState);
        syncNodeDepth(nodeSprites, camera.scale);
        syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
        app.stage.hitArea = app.screen;
    });
    resizeObserver.observe(container);

    /**
     * 功能：更新 Pixi 星空背景的闪烁与轻微漂移。
     * @returns 无返回值。
     */
    const handleCosmicTick = (): void => {
        cosmicTime += app.ticker.deltaMS * 0.001;
        fpsFrameCount += 1;
        fpsElapsedMs += app.ticker.deltaMS;
        if (fpsElapsedMs >= FPS_PANEL_UPDATE_INTERVAL_MS) {
            const fps = Math.max(0, Math.round((fpsFrameCount * 1000) / fpsElapsedMs));
            fpsBadge.textContent = `FPS ${String(fps).padStart(2, ' ')}`;
            fpsFrameCount = 0;
            fpsElapsedMs = 0;
        }
        if (backgroundAnimationEnabled) {
            animateCosmicBackground(cosmicStars, cosmicDepthState, cosmicTime);
            drawSelectionRipple(rippleLayer, selectionRippleState, cosmicTime);
        } else {
            rippleLayer.clear();
        }
        if (!selectedNodeId && !selectedEdgeId && hoveredEdgeId) {
            flowState.progress = (cosmicTime * 0.72) % 1;
            flowState.intensity = 0.78;
            redrawFlowLayerThrottled('hover');
        }
    };
    app.ticker.add(handleCosmicTick);

    if (!persistedCameraState && selectedNodeId) {
        focusNode(selectedNodeId);
    }
    syncNodeDepth(nodeSprites, camera.scale);
    syncSelectionVisuals(
        nodeSprites,
        edgeSprites,
        edgeGraphics,
        flowGraphics,
        connectedNodeIds,
        selectedNodeId,
        selectedEdgeId,
        hoveredEdgeId,
        hoverVisualState.intensity,
        camera.scale,
        false,
        flowState.progress,
        flowState.intensity,
    );
    syncSelectionAnimation();

    /**
     * 功能：同步选中节点的呼吸光晕与流动光纤动画。
     * @returns 无返回值。
     */
    function syncSelectionAnimation(): void {
        if (pulseTween) {
            pulseTween.kill();
            pulseTween = null;
        }
        if (selectionRippleTween) {
            selectionRippleTween.kill();
            selectionRippleTween = null;
        }
        if (pulsingSprite) {
            gsap.killTweensOf(pulsingSprite.root.scale);
            gsap.killTweensOf(pulsingSprite.pulseRing);
            gsap.killTweensOf(pulsingSprite.glow);
            pulsingSprite.root.scale.set(1, 1);
            pulsingSprite.pulseRing.clear();
            pulsingSprite.pulseRing.scale.set(1, 1);
            pulsingSprite.pulseRing.alpha = 0;
            pulsingSprite.glow.scale.set(1, 1);
            pulsingSprite.glow.alpha = 1;
            pulsingSprite = null;
        }
        if (flowTween) {
            flowTween.kill();
            flowTween = null;
        }
        flowGraphics.clear();
        selectionRippleState.intensity = 0;
        selectionRippleState.progress = 0;
        rippleLayer.clear();
        if (!selectedNodeId) {
            flowState.intensity = 0;
            return;
        }
        pulsingSprite = nodeSprites.get(selectedNodeId) ?? null;
        if (pulsingSprite) {
            pulsingSprite.glow.alpha = 0.82;
            pulsingSprite.root.scale.set(1, 1);
            pulsingSprite.pulseRing.alpha = 0.72;
            pulseTween = gsap.timeline({
                repeat: -1,
                yoyo: true,
                defaults: {
                    duration: 1.08,
                    ease: 'sine.inOut',
                },
            });
            pulseTween.to(pulsingSprite.glow, {
                pixi: {
                    scaleX: 1.18,
                    scaleY: 1.18,
                    alpha: 0.46,
                },
            }, 0);
            pulseTween.to(pulsingSprite.root, {
                pixi: {
                    scaleX: 1.045,
                    scaleY: 1.045,
                },
            }, 0);
            pulseTween.to(pulsingSprite.pulseRing, {
                pixi: {
                    scaleX: 1.36,
                    scaleY: 1.36,
                    alpha: 0.08,
                },
            }, 0);
        }
        syncSelectionRippleAnchor(nodeMap, selectedNodeId, camera, selectionRippleState);
        selectionRippleState.progress = 0;
        selectionRippleState.intensity = 1;
        selectionRippleTween = gsap.timeline({ repeat: -1 });
        selectionRippleTween.to(selectionRippleState, {
            progress: 1,
            duration: 2.2,
            ease: 'none',
        });
        selectionRippleTween.set(selectionRippleState, {
            progress: 0,
        });
        flowState.progress = 0;
        flowState.intensity = 1;
        redrawFlowLayerThrottled('selected', true);
        flowTween = gsap.timeline({ repeat: -1 });
        flowTween.set(flowState, {
            progress: 0,
            intensity: 1,
            onUpdate: (): void => {
                redrawFlowLayerThrottled('selected');
            },
        });
        flowTween.to(flowState, {
            progress: 1,
            duration: 1.28,
            ease: 'none',
            onUpdate: (): void => {
                redrawFlowLayerThrottled('selected');
            },
        });
        flowTween.to(flowState, {
            intensity: 0,
            duration: 0.18,
            ease: 'power1.out',
            onUpdate: (): void => {
                redrawFlowLayerThrottled('selected');
            },
        });
        flowTween.to(flowState, {
            duration: 1,
            ease: 'none',
            onStart: (): void => {
                flowGraphics.clear();
            },
        });
    }

    /**
     * 功能：销毁当前 Pixi 画布和事件。
     * @returns 无返回值。
     */
    function destroy(): void {
        if (destroyed) {
            return;
        }
        destroyed = true;
        clearHoverArmTimer();
        if (dragFrameId !== null) {
            window.cancelAnimationFrame(dragFrameId);
            dragFrameId = null;
        }
        resizeObserver.disconnect();
        app.ticker.remove(handleCosmicTick);
        app.canvas.removeEventListener('wheel', handleWheel);
        background.off('pointerdown', handleDragStart);
        background.off('pointertap', handleBackgroundTap);
        stage.off('globalpointermove', handleGlobalPointerMove);
        stage.off('pointerup', handleDragEnd);
        stage.off('pointerupoutside', handleDragEnd);
        cameraTween?.kill();
        flowTween?.kill();
        pulseTween?.kill();
        hoverVisualTween?.kill();
        selectionRippleTween?.kill();
        app.destroy({ removeView: true }, {
            children: true,
            texture: true,
            textureSource: false,
            context: true,
            style: true,
        });
        container.innerHTML = '';
    }

    return {
        destroy,
        setSelectedNode(nodeId?: string, setOptions?: { focus?: boolean }): void {
            resetHoveredEdge(true);
            selectedNodeId = nodeId ?? '';
            selectedEdgeId = '';
            if (setOptions?.focus && selectedNodeId) {
                focusNode(selectedNodeId, true);
            }
            syncSelectionVisuals(
                nodeSprites,
                edgeSprites,
                edgeGraphics,
                flowGraphics,
                connectedNodeIds,
                selectedNodeId,
                selectedEdgeId,
                hoveredEdgeId,
                hoverVisualState.intensity,
                camera.scale,
                false,
                flowState.progress,
                flowState.intensity,
            );
            syncSelectionAnimation();
        },
    };
}

/**
 * 功能：兜底清洗画布节点标题，避免旧快照直接显示内部键。
 * @param label 原始标题。
 * @param compareKey 节点比较键。
 * @returns 可读标题。
 */
function resolveRenderedGraphLabel(label: string, compareKey?: string): string {
    const normalizedLabel = normalizeStableGraphLabel(label);
    if (normalizedLabel) {
        return normalizedLabel;
    }
    return normalizeStableGraphLabel(compareKey ?? '') || '未命名节点';
}

/**
 * 功能：把稳定键格式标题转换为自然标题。
 * @param value 原始文本。
 * @returns 自然标题。
 */
function normalizeStableGraphLabel(value: string): string {
    const source = String(value ?? '').trim();
    if (!source) {
        return '';
    }
    return source.replace(/\b(ck:v2:[^\s，。；、]+|ek:[^\s，。；、]+|entity:[^\s，。；、]+|(?:organization|city|nation|location|task|event|world_global_state|world):[^\s，。；、]+)/gi, (matched: string): string => {
        return stripComparePrefix(matched) || matched;
    }).trim();
}

/**
 * 功能：创建空渲染器控制器。
 * @param container 承载容器。
 * @returns 空控制器。
 */
function createEmptyController(container: HTMLElement): MemoryGraphPixiController {
    return {
        destroy(): void {
            container.innerHTML = '';
        },
        setSelectedNode(): void {
            return;
        },
    };
}

/**
 * 功能：初始化或恢复相机状态。
 * @param container 容器元素。
 * @returns 相机状态。
 */
function createInitialCamera(container: HTMLElement): GraphCameraState {
    if (persistedCameraState) {
        return { ...persistedCameraState };
    }
    const rect = container.getBoundingClientRect();
    return {
        scale: 1,
        translateX: (rect.width || 640) / 2,
        translateY: (rect.height || 420) / 2,
    };
}

/**
 * 功能：应用相机位移和缩放。
 * @param world 图层容器。
 * @param camera 相机状态。
 * @returns 无返回值。
 */
function applyCamera(
    world: Container,
    cosmicLayer: Container,
    rippleLayer: Graphics,
    camera: GraphCameraState,
    width: number,
    height: number,
    cosmicDepthState: { offsetX: number; offsetY: number; zoom: number },
): void {
    world.position.set(camera.translateX, camera.translateY);
    world.scale.set(camera.scale);
    syncCosmicParallax(cosmicLayer, camera, width, height, cosmicDepthState);
    rippleLayer.position.set(0, 0);
    persistedCameraState = { ...camera };
}

/**
 * 功能：从 Pixi 场景容器同步当前相机位移。
 * @param world 图层容器。
 * @param camera 相机状态。
 * @returns 无返回值。
 */
function syncCameraStateFromWorld(world: Container, camera: GraphCameraState): void {
    camera.translateX = world.position.x;
    camera.translateY = world.position.y;
    persistedCameraState = { ...camera };
}

/**
 * 功能：同步星空背景与相机之间的轻微视差和缩放纵深。
 * @param cosmicLayer 星空图层。
 * @param camera 相机状态。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @returns 无返回值。
 */
function syncCosmicParallax(
    cosmicLayer: Container,
    camera: GraphCameraState,
    width: number,
    height: number,
    cosmicDepthState: { offsetX: number; offsetY: number; zoom: number },
): void {
    const offsetX = (camera.translateX - (width * 0.5)) * -COSMIC_PARALLAX_STRENGTH;
    const offsetY = (camera.translateY - (height * 0.5)) * -COSMIC_PARALLAX_STRENGTH;
    const scale = 1 + ((camera.scale - 1) * COSMIC_SCALE_STRENGTH);
    cosmicDepthState.offsetX = offsetX;
    cosmicDepthState.offsetY = offsetY;
    cosmicDepthState.zoom = scale;
    cosmicLayer.pivot.set(width * 0.5, height * 0.5);
    cosmicLayer.position.set((width * 0.5) + offsetX, (height * 0.5) + offsetY);
    cosmicLayer.scale.set(scale, scale);
}

/**
 * 功能：根据相机缩放同步节点自身的轻微纵深缩放。
 * @param nodeSprites 节点精灵映射。
 * @param cameraScale 当前相机缩放。
 * @returns 无返回值。
 */
function syncNodeDepth(nodeSprites: Map<string, GraphNodeSprite>, cameraScale: number): void {
    const zoomDelta = cameraScale - 1;
    nodeSprites.forEach((sprite: GraphNodeSprite): void => {
        const depthScale = 1 + (zoomDelta * sprite.depthFactor * NODE_DEPTH_SCALE_STRENGTH);
        sprite.content.scale.set(depthScale, depthScale);
    });
}

/**
 * 功能：重绘用于接收交互的背景层。
 * @param background 背景图形。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @returns 无返回值。
 */
function redrawBackground(background: Graphics, width: number, height: number): void {
    background.clear();
    background.rect(0, 0, width, height).fill({ color: 0x020617, alpha: 0.001 });
    background.hitArea = new Rectangle(0, 0, width, height);
}

/**
 * 功能：同步节点和边的高亮状态。
 * @param nodeSprites 节点精灵映射。
 * @param edgeSprites 边精灵列表。
 * @param connectedNodeIds 复用的连接集合。
 * @param selectedNodeId 当前选中节点。
 * @returns 无返回值。
 */
function syncSelectionVisuals(
    nodeSprites: Map<string, GraphNodeSprite>,
    edgeSprites: GraphEdgeSprite[],
    edgeGraphics: Graphics,
    flowGraphics: Graphics,
    connectedNodeIds: Set<string>,
    selectedNodeId: string,
    selectedEdgeId: string,
    hoveredEdgeId: string,
    hoveredEdgeIntensity: number,
    scale: number,
    isDragging: boolean,
    flowProgress: number,
    flowIntensity: number,
): void {
    connectedNodeIds.clear();
    if (selectedNodeId) {
        edgeSprites.forEach((sprite: GraphEdgeSprite): void => {
            if (sprite.sourceId === selectedNodeId || sprite.targetId === selectedNodeId) {
                connectedNodeIds.add(sprite.sourceId);
                connectedNodeIds.add(sprite.targetId);
            }
        });
    } else if (selectedEdgeId) {
        const matchedEdge = edgeSprites.find((sprite: GraphEdgeSprite): boolean => sprite.edge.id === selectedEdgeId);
        if (matchedEdge) {
            connectedNodeIds.add(matchedEdge.sourceId);
            connectedNodeIds.add(matchedEdge.targetId);
        }
    } else if (hoveredEdgeId) {
        const hoveredEdge = edgeSprites.find((sprite: GraphEdgeSprite): boolean => sprite.edge.id === hoveredEdgeId);
        if (hoveredEdge) {
            connectedNodeIds.add(hoveredEdge.sourceId);
            connectedNodeIds.add(hoveredEdge.targetId);
        }
    }

    nodeSprites.forEach((sprite: GraphNodeSprite): void => {
        const isSelected = sprite.node.id === selectedNodeId;
        const isConnected = connectedNodeIds.has(sprite.node.id);
        const isHighlighted = !isSelected && isConnected;
        const dimmed = (Boolean(selectedNodeId) || Boolean(selectedEdgeId) || Boolean(hoveredEdgeId)) && !isSelected && !isConnected;
        const showLabel = !isDragging && (scale >= 0.62 || isSelected || isConnected);
        drawNodeSprite(sprite, isSelected, isHighlighted, dimmed, showLabel, hoveredEdgeIntensity);
    });

    redrawEdgeLayer(edgeGraphics, edgeSprites, selectedNodeId, selectedEdgeId, hoveredEdgeId, hoveredEdgeIntensity);
    if (selectedNodeId || selectedEdgeId) {
        redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, selectedEdgeId, hoveredEdgeId, hoveredEdgeIntensity, flowProgress, flowIntensity);
    } else if (!hoveredEdgeId || hoveredEdgeIntensity <= 0.01) {
        flowGraphics.clear();
    }
}

/**
 * 功能：根据缩放和拖拽状态更新标签显示等级。
 * @param nodeSprites 节点精灵映射。
 * @param connectedNodeIds 当前连通节点集合。
 * @param selectedNodeId 当前选中节点。
 * @param scale 当前缩放值。
 * @param isDragging 是否正在拖拽。
 * @returns 无返回值。
 */
function syncDetailLevel(
    nodeSprites: Map<string, GraphNodeSprite>,
    connectedNodeIds: Set<string>,
    selectedNodeId: string,
    scale: number,
    isDragging: boolean,
): void {
    nodeSprites.forEach((sprite: GraphNodeSprite): void => {
        const isSelected = sprite.node.id === selectedNodeId;
        const isConnected = connectedNodeIds.has(sprite.node.id);
        sprite.label.visible = !isDragging && (scale >= 0.62 || isSelected || isConnected);
    });
}

/**
 * 功能：批量重绘整层边，减少大量 Graphics 实例带来的开销。
 * @param edgeGraphics 边图层。
 * @param edgeSprites 边数据列表。
 * @param selectedNodeId 当前选中节点。
 * @returns 无返回值。
 */
function redrawEdgeLayer(
    edgeGraphics: Graphics,
    edgeSprites: GraphEdgeSprite[],
    selectedNodeId: string,
    selectedEdgeId: string,
    hoveredEdgeId: string,
    hoveredEdgeIntensity: number,
): void {
    edgeGraphics.clear();
    edgeSprites.forEach((sprite: GraphEdgeSprite): void => {
        const active = sprite.edge.id === selectedEdgeId || sprite.sourceId === selectedNodeId || sprite.targetId === selectedNodeId;
        const hovered = !selectedNodeId && !selectedEdgeId && sprite.edge.id === hoveredEdgeId;
        const alpha = !selectedNodeId && !selectedEdgeId && !hoveredEdgeId
            ? sprite.baseAlpha
            : active
                ? Math.max(0.64, sprite.baseAlpha + 0.42)
                : hovered
                    ? Math.max(0.24, sprite.baseAlpha + (0.34 * hoveredEdgeIntensity))
                    : 0.04;
        const width = !selectedNodeId && !selectedEdgeId && !hoveredEdgeId
            ? 1.6
            : sprite.edge.id === selectedEdgeId
                ? 3.2
                : active
                    ? 2.6
                    : hovered
                        ? 1.8 + (1 * hoveredEdgeIntensity)
                        : 1.8;
        drawGradientEdge(
            edgeGraphics,
            sprite.sourceNode,
            sprite.targetNode,
            sprite.sourceColor,
            sprite.targetColor,
            width,
            alpha,
            active || hovered ? EDGE_SEGMENT_COUNT + 4 : EDGE_SEGMENT_COUNT,
        );
    });
}

/**
 * 功能：重绘高亮边上的流动光纤层。
 * @param flowGraphics 流光图层。
 * @param edgeSprites 边数据列表。
 * @param selectedNodeId 当前选中节点。
 * @param progress 当前流动进度。
 * @returns 无返回值。
 */
function redrawFlowLayer(
    flowGraphics: Graphics,
    edgeSprites: GraphEdgeSprite[],
    selectedNodeId: string,
    selectedEdgeId: string,
    hoveredEdgeId: string,
    hoveredEdgeIntensity: number,
    progress: number,
    intensity: number,
): void {
    flowGraphics.clear();
    const hasSelectedNode = Boolean(selectedNodeId) && intensity > 0.001;
    const hasHoveredEdge = !selectedNodeId && !selectedEdgeId && Boolean(hoveredEdgeId) && hoveredEdgeIntensity > 0.01;
    if (!hasSelectedNode && !hasHoveredEdge) {
        return;
    }
    edgeSprites.forEach((sprite: GraphEdgeSprite): void => {
        if (hasSelectedNode) {
            if (sprite.sourceId !== selectedNodeId && sprite.targetId !== selectedNodeId) {
                return;
            }
            const fromSelected = sprite.sourceId === selectedNodeId;
            const sourceNode = fromSelected ? sprite.sourceNode : sprite.targetNode;
            const targetNode = fromSelected ? sprite.targetNode : sprite.sourceNode;
            const sourceColor = fromSelected ? sprite.sourceColor : sprite.targetColor;
            const targetColor = fromSelected ? sprite.targetColor : sprite.sourceColor;
            drawFlowFiber(
                flowGraphics,
                sourceNode,
                targetNode,
                sourceColor,
                targetColor,
                progress,
                intensity,
                FLOW_TAIL_LENGTH,
                FLOW_SEGMENT_COUNT,
            );
            return;
        }
        if (sprite.edge.id !== hoveredEdgeId) {
            return;
        }
        drawFlowFiber(
            flowGraphics,
            sprite.sourceNode,
            sprite.targetNode,
            sprite.sourceColor,
            sprite.targetColor,
            progress,
            0.42 + (0.36 * hoveredEdgeIntensity),
            0.18,
            FLOW_SEGMENT_COUNT + 3,
        );
    });
}

/**
 * 功能：绘制单个节点的外观。
 * @param sprite 节点精灵。
 * @param isSelected 是否为选中节点。
 * @param dimmed 是否处于弱化状态。
 * @returns 无返回值。
 */
function drawNodeSprite(
    sprite: GraphNodeSprite,
    isSelected: boolean,
    isHighlighted: boolean,
    dimmed: boolean,
    showLabel: boolean,
    hoveredEdgeIntensity: number,
): void {
    const radius = getRenderedNodeRadius(sprite.node);
    const color = toPixiColor(getMemoryGraphNodeColor(sprite.node.type));
    const hoverBoost = isHighlighted ? hoveredEdgeIntensity : 0;
    const fillAlpha = isSelected ? 0.4 : isHighlighted ? (0.16 + (0.12 * hoverBoost)) : 0.16;
    const glowAlpha = isSelected ? 0.66 : isHighlighted ? (0.12 + (0.22 * hoverBoost)) : 0.12;
    const borderWidth = isSelected ? 3 : isHighlighted ? (1.2 + (0.8 * hoverBoost)) : 1.2;
    const labelColor = isSelected
        ? 0xffffff
        : isHighlighted
            ? 0xf8fafc
        : sprite.node.type === 'actor'
            ? 0xfcd34d
            : 0xdbe7ff;

    sprite.root.alpha = dimmed ? 0.18 : 1;
    sprite.label.visible = showLabel;
    sprite.label.tint = labelColor;
    sprite.pulseRing.clear();
    sprite.glow.clear();
    sprite.body.clear();
    if (isSelected || isHighlighted) {
        sprite.pulseRing.alpha = 0.72;
        if (sprite.node.type === 'actor') {
            sprite.pulseRing.poly([0, -radius - 12, radius + 12, 0, 0, radius + 12, -radius - 12, 0], true)
                .stroke({ color: 0xffffff, alpha: isSelected ? 0.56 : 0.28, width: isSelected ? 2.2 : 1.4 });
        } else {
            sprite.pulseRing.circle(0, 0, radius + 10)
                .stroke({ color: 0xffffff, alpha: isSelected ? 0.56 : 0.28, width: isSelected ? 2.2 : 1.4 });
        }
    } else {
        sprite.pulseRing.alpha = 0;
        sprite.pulseRing.scale.set(1, 1);
        sprite.root.scale.set(1, 1);
    }

    if (sprite.node.type === 'actor') {
        if (isSelected || isHighlighted) {
            sprite.glow.poly([0, -radius - 16, radius + 16, 0, 0, radius + 16, -radius - 16, 0], true)
                .fill({ color: 0xffffff, alpha: isSelected ? 0.18 : (0.04 + (0.04 * hoverBoost)) });
        }
        sprite.glow.poly([0, -radius - 8, radius + 8, 0, 0, radius + 8, -radius - 8, 0], true)
            .fill({ color, alpha: glowAlpha });
        sprite.body.poly([0, -radius, radius, 0, 0, radius, -radius, 0], true)
            .fill({ color, alpha: fillAlpha })
            .stroke({ color, alpha: 0.96, width: borderWidth });
        if (isSelected || isHighlighted) {
            sprite.body.poly([0, -radius - 3, radius + 3, 0, 0, radius + 3, -radius - 3, 0], true)
                .stroke({ color: 0xffffff, alpha: isSelected ? 0.92 : (0.2 + (0.3 * hoverBoost)), width: isSelected ? 1.6 : (0.8 + (0.3 * hoverBoost)) });
        }
        sprite.body.circle(0, 0, Math.max(6, radius * 0.42))
            .fill({ color: 0xffffff, alpha: isSelected ? 1 : 0.9 });
        return;
    }

    if (isSelected || isHighlighted) {
        sprite.glow.circle(0, 0, radius + 14).fill({ color: 0xffffff, alpha: isSelected ? 0.16 : (0.04 + (0.04 * hoverBoost)) });
    }
    sprite.glow.circle(0, 0, radius + 8).fill({ color, alpha: glowAlpha });
    sprite.body.circle(0, 0, radius)
        .fill({ color, alpha: fillAlpha })
        .stroke({ color, alpha: 0.96, width: borderWidth });
    if (isSelected || isHighlighted) {
        sprite.body.circle(0, 0, radius + 2.8)
            .stroke({ color: 0xffffff, alpha: isSelected ? 0.94 : (0.2 + (0.3 * hoverBoost)), width: isSelected ? 1.8 : (0.8 + (0.3 * hoverBoost)) });
    }
    sprite.body.circle(0, 0, Math.max(4, radius * 0.32))
        .fill({ color: isSelected ? 0xffffff : color, alpha: isSelected ? 1 : 0.96 });
}

/**
 * 功能：绘制单条边的几何。
 * @param graphics 边图形对象。
 * @param source 源节点。
 * @param target 目标节点。
 * @param color 边颜色。
 * @param width 线宽。
 * @param alpha 透明度。
 * @returns 无返回值。
 */
function drawGradientEdge(
    graphics: Graphics,
    source: WorkbenchMemoryGraphNode,
    target: WorkbenchMemoryGraphNode,
    sourceColor: number,
    targetColor: number,
    width: number,
    alpha: number,
    segmentCount: number,
): void {
    const points = resolveEdgeEndpoints(source, target);
    for (let index = 0; index < segmentCount; index += 1) {
        const startT = index / segmentCount;
        const endT = (index + 1) / segmentCount;
        const startPoint = interpolatePoint(points.x1, points.y1, points.x2, points.y2, startT);
        const endPoint = interpolatePoint(points.x1, points.y1, points.x2, points.y2, endT);
        graphics
            .moveTo(startPoint.x, startPoint.y)
            .lineTo(endPoint.x, endPoint.y)
            .stroke({
                color: mixColor(sourceColor, targetColor, (startT + endT) * 0.5),
                width,
                alpha,
            });
    }
}

/**
 * 功能：绘制从选中节点流向关联节点的渐变光纤。
 * @param graphics 流光图层。
 * @param source 起点节点。
 * @param target 终点节点。
 * @param sourceColor 起点颜色。
 * @param targetColor 终点颜色。
 * @param progress 当前流动进度。
 * @param tailLength 光尾长度。
 * @param segmentCount 细分段数。
 * @returns 无返回值。
 */
function drawFlowFiber(
    graphics: Graphics,
    source: WorkbenchMemoryGraphNode,
    target: WorkbenchMemoryGraphNode,
    sourceColor: number,
    targetColor: number,
    progress: number,
    intensity: number,
    tailLength: number,
    segmentCount: number,
): void {
    const points = resolveEdgeEndpoints(source, target);
    const head = clamp(progress, 0.02, 1);
    const tail = Math.max(0, head - tailLength);
    const visibleLength = head - tail;
    if (visibleLength <= 0.0001) {
        return;
    }
    for (let index = 0; index < segmentCount; index += 1) {
        const localStart = index / segmentCount;
        const localEnd = (index + 1) / segmentCount;
        const startT = tail + (visibleLength * localStart);
        const endT = tail + (visibleLength * localEnd);
        const startPoint = interpolatePoint(points.x1, points.y1, points.x2, points.y2, startT);
        const endPoint = interpolatePoint(points.x1, points.y1, points.x2, points.y2, endT);
        const localMid = (localStart + localEnd) * 0.5;
        const edgeMid = (startT + endT) * 0.5;
        graphics
            .moveTo(startPoint.x, startPoint.y)
            .lineTo(endPoint.x, endPoint.y)
            .stroke({
                color: mixColor(sourceColor, targetColor, edgeMid),
                width: (4.2 - (1.8 * (1 - localMid))) * (0.92 + (0.16 * intensity)),
                alpha: Math.pow(localMid, 1.7) * 0.92 * intensity,
            });
    }
}

/**
 * 功能：查找点击位置附近最接近的边。
 * @param edgeSprites 边精灵列表。
 * @param x 世界坐标横轴。
 * @param y 世界坐标纵轴。
 * @param scale 当前缩放。
 * @returns 命中的边；未命中时返回空值。
 */
function findClosestEdge(
    edgeSprites: GraphEdgeSprite[],
    x: number,
    y: number,
    scale: number,
): GraphEdgeSprite | null {
    const threshold = Math.max(10, 18 / Math.max(scale, 0.25));
    let best: GraphEdgeSprite | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const sprite of edgeSprites) {
        const endpoints = resolveEdgeEndpoints(sprite.sourceNode, sprite.targetNode);
        const distance = distanceToSegment(x, y, endpoints.x1, endpoints.y1, endpoints.x2, endpoints.y2);
        if (distance <= threshold && distance < bestDistance) {
            best = sprite;
            bestDistance = distance;
        }
    }
    return best;
}

/**
 * 功能：把颜色文本转换为 Pixi 可识别的数值颜色。
 * @param color 颜色字符串。
 * @returns 数值颜色。
 */
function toPixiColor(color: string): number {
    const normalized = String(color ?? '').trim();
    if (!normalized.startsWith('#')) {
        return 0x94a3b8;
    }
    const parsed = Number.parseInt(normalized.slice(1), 16);
    return Number.isFinite(parsed) ? parsed : 0x94a3b8;
}

/**
 * 功能：对两个节点颜色做简单混合。
 * @param sourceType 源节点类型。
 * @param targetType 目标节点类型。
 * @returns 混合后的颜色。
 */

/**
 * 功能：限制数值范围。
 * @param value 原始值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

/**
 * 功能：解析边的实际绘制端点，避免线条压进节点内部。
 * @param source 源节点。
 * @param target 目标节点。
 * @returns 线段端点。
 */
function resolveEdgeEndpoints(
    source: WorkbenchMemoryGraphNode,
    target: WorkbenchMemoryGraphNode,
): { x1: number; y1: number; x2: number; y2: number } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
    const sourceRadius = getRenderedNodeRadius(source);
    const targetRadius = getRenderedNodeRadius(target);
    const startRatio = sourceRadius / distance;
    const endRatio = targetRadius / distance;
    return {
        x1: source.x + (dx * startRatio),
        y1: source.y + (dy * startRatio),
        x2: target.x - (dx * endRatio),
        y2: target.y - (dy * endRatio),
    };
}

/**
 * 功能：在线段上按比例插值出一个点。
 * @param x1 起点横坐标。
 * @param y1 起点纵坐标。
 * @param x2 终点横坐标。
 * @param y2 终点纵坐标。
 * @param t 插值比例。
 * @returns 插值点。
 */
function interpolatePoint(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    t: number,
): { x: number; y: number } {
    const ratio = clamp(t, 0, 1);
    return {
        x: x1 + ((x2 - x1) * ratio),
        y: y1 + ((y2 - y1) * ratio),
    };
}

/**
 * 功能：计算点到线段的最短距离。
 * @param px 点横坐标。
 * @param py 点纵坐标。
 * @param x1 线段起点横坐标。
 * @param y1 线段起点纵坐标。
 * @param x2 线段终点横坐标。
 * @param y2 线段终点纵坐标。
 * @returns 最短距离。
 */
function distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return Math.hypot(px - x1, py - y1);
    }
    const t = clamp((((px - x1) * dx) + ((py - y1) * dy)) / ((dx * dx) + (dy * dy)), 0, 1);
    const projectionX = x1 + (t * dx);
    const projectionY = y1 + (t * dy);
    return Math.hypot(px - projectionX, py - projectionY);
}

/**
 * 功能：混合两种颜色，得到中间渐变色。
 * @param sourceColor 起点颜色。
 * @param targetColor 终点颜色。
 * @param ratio 混合比例。
 * @returns 混合后的颜色。
 */
function mixColor(sourceColor: number, targetColor: number, ratio: number): number {
    const safeRatio = clamp(ratio, 0, 1);
    const sourceRed = (sourceColor >> 16) & 0xff;
    const sourceGreen = (sourceColor >> 8) & 0xff;
    const sourceBlue = sourceColor & 0xff;
    const targetRed = (targetColor >> 16) & 0xff;
    const targetGreen = (targetColor >> 8) & 0xff;
    const targetBlue = targetColor & 0xff;
    const red = Math.round(sourceRed + ((targetRed - sourceRed) * safeRatio));
    const green = Math.round(sourceGreen + ((targetGreen - sourceGreen) * safeRatio));
    const blue = Math.round(sourceBlue + ((targetBlue - sourceBlue) * safeRatio));
    return (red << 16) | (green << 8) | blue;
}

/**
 * 功能：使用 Pixi 构建星空背景层。
 * @param cosmicLayer 星空图层。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @returns 星点数据列表。
 */
function buildCosmicBackground(
    cosmicLayer: Container,
    width: number,
    height: number,
): GraphBackgroundStar[] {
    cosmicLayer.removeChildren().forEach((child) => child.destroy());
    const nebula = new Graphics();
    drawCosmicGlow(nebula, width * 0.16, height * 0.24, Math.max(220, width * 0.24), 0x1d4ed8, 0.008);
    drawCosmicGlow(nebula, width * 0.78, height * 0.2, Math.max(210, width * 0.22), 0x38bdf8, 0.007);
    drawCosmicGlow(nebula, width * 0.58, height * 0.76, Math.max(240, width * 0.26), 0x6366f1, 0.006);
    cosmicLayer.addChild(nebula);

    const milkyWayDust = new Graphics();
    const milkyWayDustSeed = createDeterministicRandom(Math.round((width * 23) + (height * 13) + 157));
    drawMilkyWayDust(milkyWayDust, width, height, milkyWayDustSeed);
    cosmicLayer.addChild(milkyWayDust);

    const milkyWay = new Graphics();
    const milkyWaySeed = createDeterministicRandom(Math.round((width * 17) + (height * 19) + 311));
    drawMilkyWayBand(milkyWay, width, height, milkyWaySeed);
    cosmicLayer.addChild(milkyWay);

    const dust = new Graphics();
    const dustSeed = createDeterministicRandom(Math.round((width * 13) + (height * 7) + 17));
    const dustCount = Math.max(120, Math.round((width * height) / 18000));
    for (let index = 0; index < dustCount; index += 1) {
        const x = dustSeed() * width;
        const y = dustSeed() * height;
        const radius = 0.45 + (dustSeed() * 1.2);
        const alpha = 0.015 + (dustSeed() * 0.04);
        dust.circle(x, y, radius).fill({ color: 0xcbd5e1, alpha });
    }
    cosmicLayer.addChild(dust);

    const starSeed = createDeterministicRandom(Math.round((width * 29) + (height * 11) + 97));
    const starCount = Math.max(260, Math.round((width * height) / 5000));
    const stars: GraphBackgroundStar[] = [];
    for (let index = 0; index < starCount; index += 1) {
        const root = new Container();
        const haze = new Graphics();
        const glow = new Graphics();
        const core = new Graphics();
        const alongBand = starSeed() > 0.28;
        const brightStar = starSeed() > 0.82;
        const depthFactor = alongBand
            ? 0.6 + (starSeed() * 0.9)
            : 0.25 + (starSeed() * 1.25);
        const radius = brightStar
            ? 1.2 + (starSeed() * 1.9)
            : 0.45 + (starSeed() * (alongBand ? 1.4 : 1.75));
        const hazeRadius = radius * (3.6 + (starSeed() * 2.4));
        const glowRadius = radius * (2.1 + (starSeed() * 1.7));
        const starColor = brightStar
            ? 0xfef3c7
            : alongBand
                ? 0xf8fafc
                : (starSeed() > 0.58 ? 0x93c5fd : 0xe2e8f0);
        haze.circle(0, 0, hazeRadius).fill({ color: starColor, alpha: brightStar ? 0.036 + (starSeed() * 0.03) : 0.012 + (starSeed() * 0.02) });
        glow.circle(0, 0, glowRadius).fill({ color: starColor, alpha: brightStar ? 0.08 + (starSeed() * 0.06) : 0.028 + (starSeed() * 0.045) });
        if (brightStar) {
            drawStarCross(glow, glowRadius * 1.35, starColor, 0.11 + (starSeed() * 0.05));
        }
        core.circle(0, 0, radius).fill({ color: 0xffffff, alpha: brightStar ? 0.96 : 0.76 + (starSeed() * 0.18) });
        root.addChild(haze);
        root.addChild(glow);
        root.addChild(core);
        root.blendMode = 'add';
        const basePosition = alongBand
            ? resolveMilkyWayPoint(width, height, starSeed)
            : {
                x: (0.04 + (starSeed() * 0.92)) * width,
                y: (0.06 + (starSeed() * 0.88)) * height,
            };
        const baseX = basePosition.x;
        const baseY = basePosition.y;
        root.position.set(baseX, baseY);
        cosmicLayer.addChild(root);
        stars.push({
            root,
            baseX,
            baseY,
            depthFactor,
            phase: starSeed() * Math.PI * 2,
            speed: brightStar
                ? 0.16 + (starSeed() * 1.2)
                : 0.18 + (starSeed() * 2.9),
            driftRadius: brightStar ? 0.18 + (starSeed() * 0.95) : 0.35 + (starSeed() * 2.2),
            driftSpeed: brightStar ? 0.018 + (starSeed() * 0.08) : 0.03 + (starSeed() * 0.18),
            minAlpha: brightStar ? 0.22 + (starSeed() * 0.12) : 0.04 + (starSeed() * 0.1),
            maxAlpha: brightStar ? 0.58 + (starSeed() * 0.28) : 0.18 + (starSeed() * 0.42),
            minScale: 0.78 + (starSeed() * 0.16),
            maxScale: brightStar ? 1.12 + (starSeed() * 0.34) : 1.02 + (starSeed() * 0.42),
        });
    }
    return stars;
}

/**
 * 功能：更新 Pixi 星空背景中的星点闪烁状态。
 * @param stars 星点数据。
 * @param time 累积时间。
 * @returns 无返回值。
 */
function animateCosmicBackground(
    stars: GraphBackgroundStar[],
    cosmicDepthState: { offsetX: number; offsetY: number; zoom: number },
    time: number,
): void {
    stars.forEach((star: GraphBackgroundStar): void => {
        const twinkle = (Math.sin((time * star.speed) + star.phase) + 1) * 0.5;
        const shimmer = (Math.sin((time * ((star.speed * 1.85) + 0.16)) + (star.phase * 1.7)) + 1) * 0.5;
        const sparkle = (Math.sin((time * ((star.speed * 0.56) + 0.08)) + (star.phase * 0.7)) + 1) * 0.5;
        const alphaRatio = Math.min(1, (twinkle * 0.55) + (shimmer * 0.3) + (sparkle * 0.15));
        const driftAngle = (time * star.driftSpeed) + star.phase;
        const scale = star.minScale + ((star.maxScale - star.minScale) * alphaRatio);
        const depthDrift = 0.55 + (star.depthFactor * 0.7);
        const depthOffsetX = cosmicDepthState.offsetX * star.depthFactor * 0.38;
        const depthOffsetY = cosmicDepthState.offsetY * star.depthFactor * 0.38;
        const depthZoom = 1 + ((cosmicDepthState.zoom - 1) * star.depthFactor * 0.5);
        star.root.alpha = star.minAlpha + ((star.maxAlpha - star.minAlpha) * alphaRatio);
        star.root.scale.set(scale * depthZoom, scale * depthZoom);
        star.root.position.set(
            star.baseX + depthOffsetX + (Math.cos(driftAngle) * star.driftRadius * depthDrift),
            star.baseY + depthOffsetY + (Math.sin(driftAngle * 1.12) * star.driftRadius * 0.72 * depthDrift),
        );
    });
}

/**
 * 功能：同步选中节点对应的背景波纹锚点位置。
 * @param nodeMap 节点映射。
 * @param selectedNodeId 当前选中节点 ID。
 * @param camera 相机状态。
 * @param state 波纹状态。
 * @returns 无返回值。
 */
function syncSelectionRippleAnchor(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    selectedNodeId: string,
    camera: GraphCameraState,
    state: { progress: number; intensity: number; x: number; y: number },
): void {
    if (!selectedNodeId) {
        return;
    }
    const node = nodeMap.get(selectedNodeId);
    if (!node) {
        return;
    }
    state.x = camera.translateX + (node.x * camera.scale);
    state.y = camera.translateY + (node.y * camera.scale);
}

/**
 * 功能：绘制与背景呼应的局部星尘波纹。
 * @param rippleLayer 波纹图层。
 * @param state 波纹状态。
 * @param time 累积时间。
 * @returns 无返回值。
 */
function drawSelectionRipple(
    rippleLayer: Graphics,
    state: { progress: number; intensity: number; x: number; y: number },
    time: number,
): void {
    rippleLayer.clear();
    if (state.intensity <= 0.001) {
        return;
    }
    const pulse = state.progress;
    const outerRadius = 34 + (pulse * 82);
    const innerRadius = 16 + (pulse * 38);
    const alpha = (1 - pulse) * 0.12 * state.intensity;
    const sparkleAlpha = (0.035 + (Math.sin((time * 2.4) + 1.3) * 0.018)) * state.intensity;
    rippleLayer.circle(state.x, state.y, outerRadius).stroke({ color: 0x93c5fd, alpha, width: 1 });
    rippleLayer.circle(state.x, state.y, innerRadius).stroke({ color: 0xe0f2fe, alpha: alpha * 0.8, width: 0.8 });
    for (let index = 0; index < 12; index += 1) {
        const angle = ((Math.PI * 2) / 12) * index + (time * 0.16);
        const distance = 18 + (pulse * 58) + ((index % 4) * 3.5);
        const x = state.x + (Math.cos(angle) * distance);
        const y = state.y + (Math.sin(angle) * distance * 0.84);
        const radius = 0.9 + ((index % 3) * 0.4);
        rippleLayer.circle(x, y, radius).fill({ color: index % 4 === 0 ? 0xf8fafc : 0x93c5fd, alpha: sparkleAlpha });
    }
}

/**
 * 功能：为节点计算轻微纵深系数，缩放时提供一点前后层次感。
 * @param node 图节点。
 * @returns 节点纵深系数。
 */
function resolveNodeDepthFactor(node: WorkbenchMemoryGraphNode): number {
    const importance = Math.max(0, Math.min(1, Number(node.importance) || 0));
    const memoryRatio = Math.max(0, Math.min(1, (Number(node.memoryPercent) || 0) / 100));
    const typeBoost = node.type === 'actor'
        ? 0.16
        : node.type === 'event' || node.type === 'task'
            ? 0.12
            : 0.04;
    return 0.45 + (importance * 0.3) + (memoryRatio * 0.15) + typeBoost;
}

/**
 * 功能：获取实际绘制时使用的节点半径。
 * @param node 图节点。
 * @returns 缩放后的节点半径。
 */
function getRenderedNodeRadius(node: WorkbenchMemoryGraphNode): number {
    return computeMemoryGraphNodeSize(node.importance ?? 0, node.memoryPercent) * 0.5 * MEMORY_GRAPH_NODE_SCALE;
}

/**
 * 功能：绘制柔边宇宙雾团。
 * @param graphics 目标图层。
 * @param x 中心横坐标。
 * @param y 中心纵坐标。
 * @param radius 外层半径。
 * @param color 颜色。
 * @param alpha 基础透明度。
 * @returns 无返回值。
 */
function drawCosmicGlow(
    graphics: Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    alpha: number,
): void {
    graphics.circle(x, y, radius).fill({ color, alpha });
    graphics.circle(x, y, radius * 0.68).fill({ color, alpha: alpha * 1.45 });
    graphics.circle(x, y, radius * 0.42).fill({ color, alpha: alpha * 1.9 });
}

/**
 * 功能：绘制银河汇聚带，形成一条较明显的星群聚集区域。
 * @param graphics 目标图层。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @param random 伪随机数生成器。
 * @returns 无返回值。
 */
function drawMilkyWayBand(
    graphics: Graphics,
    width: number,
    height: number,
    random: () => number,
): void {
    const clusterCount = Math.max(36, Math.round(width / 38));
    for (let index = 0; index < clusterCount; index += 1) {
        const point = resolveMilkyWayPoint(width, height, random);
        const midWeight = 1 - Math.abs(0.5 - random()) * 2;
        const radius = Math.min(width, height) * (0.024 + (midWeight * 0.016) + (random() * 0.03));
        const color = random() > 0.64 ? 0x93c5fd : (random() > 0.34 ? 0xe0f2fe : 0xc4b5fd);
        drawCosmicGlow(graphics, point.x, point.y, radius, color, 0.004 + (midWeight * 0.01) + (random() * 0.005));
    }
}

/**
 * 功能：绘制银河尘埃带，增强一条星河横贯画面的感觉。
 * @param graphics 目标图层。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @param random 伪随机数生成器。
 * @returns 无返回值。
 */
function drawMilkyWayDust(
    graphics: Graphics,
    width: number,
    height: number,
    random: () => number,
): void {
    const dustCount = Math.max(120, Math.round(width / 5));
    for (let index = 0; index < dustCount; index += 1) {
        const point = resolveMilkyWayPoint(width, height, random);
        const radius = 6 + (random() * Math.min(width, height) * 0.018);
        const bandCenterRatio = Math.abs((point.x / Math.max(width, 1)) - 0.5);
        const alpha = 0.002 + ((1 - Math.min(1, bandCenterRatio * 2.1)) * 0.005) + (random() * 0.004);
        const color = random() > 0.5 ? 0xf8fafc : 0x93c5fd;
        graphics.circle(point.x, point.y, radius).fill({ color, alpha });
    }
}

/**
 * 功能：在银河带上生成一个聚集点坐标。
 * @param width 当前宽度。
 * @param height 当前高度。
 * @param random 伪随机数生成器。
 * @returns 银河带内的坐标点。
 */
function resolveMilkyWayPoint(
    width: number,
    height: number,
    random: () => number,
): { x: number; y: number } {
    const t = random();
    const centerX = width * (0.08 + (t * 0.84));
    const centerY = height * (0.8 - (t * 0.42));
    const spreadX = (random() - 0.5) * width * 0.045;
    const spreadY = (random() - 0.5) * height * 0.11;
    const curl = Math.sin((t * Math.PI * 2.6) + (random() * 0.9)) * height * 0.036;
    return {
        x: centerX + spreadX,
        y: centerY + spreadY + curl,
    };
}

/**
 * 功能：为亮星绘制十字星芒，增强辉光感。
 * @param graphics 目标图层。
 * @param radius 星芒长度。
 * @param color 颜色。
 * @param alpha 透明度。
 * @returns 无返回值。
 */
function drawStarCross(graphics: Graphics, radius: number, color: number, alpha: number): void {
    graphics
        .moveTo(-radius, 0)
        .lineTo(radius, 0)
        .stroke({ color, alpha, width: 1.1 });
    graphics
        .moveTo(0, -radius)
        .lineTo(0, radius)
        .stroke({ color, alpha: alpha * 0.92, width: 1.1 });
}

/**
 * 功能：创建可复用的确定性随机数生成器。
 * @param seed 初始种子。
 * @returns 0 到 1 之间的伪随机数函数。
 */
function createDeterministicRandom(seed: number): () => number {
    let current = Math.max(1, Math.floor(seed) || 1);
    return (): number => {
        current = (current * 1664525 + 1013904223) % 4294967296;
        return current / 4294967296;
    };
}

/**
 * 功能：解析边在默认态下的基础透明度。
 * @param edge 关系边数据。
 * @returns 更适合默认弱显场景的透明度。
 */
function resolveBaseEdgeAlpha(edge: WorkbenchMemoryGraphEdge): number {
    const weight = clamp(Number(edge.weight) || 0, 0, 1);
    const confidence = clamp(Number(edge.confidence) || 0, 0, 1);
    const strengthBoost = edge.strengthLevel === 'strong'
        ? 0.05
        : edge.strengthLevel === 'normal'
            ? 0.025
            : 0;
    return clamp(0.035 + (weight * 0.11) + (confidence * 0.04) + strengthBoost, 0.06, 0.22);
}
