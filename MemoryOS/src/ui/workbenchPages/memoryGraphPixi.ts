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
    pulseRing: Graphics;
    glow: Graphics;
    body: Graphics;
    label: Text;
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

let persistedCameraState: GraphCameraState | null = null;
const EDGE_SEGMENT_COUNT = 14;
const FLOW_SEGMENT_COUNT = 12;
const FLOW_TAIL_LENGTH = 0.26;

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
    const stage = app.stage;
    const background = new Graphics();
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
    let dragState: DragState | null = null;
    let suppressTapUntil = 0;
    let destroyed = false;
    let cameraTween: gsap.core.Tween | null = null;
    let flowTween: gsap.core.Timeline | null = null;
    let pulseTween: gsap.core.Timeline | null = null;
    let pulsingSprite: GraphNodeSprite | null = null;

    stage.eventMode = 'static';
    stage.hitArea = app.screen;
    background.eventMode = 'static';
    background.cursor = 'grab';
    edgeGraphics.blendMode = 'add';
    flowGraphics.blendMode = 'add';
    world.addChild(edgeLayer);
    world.addChild(nodeLayer);
    edgeLayer.addChild(edgeGraphics);
    edgeLayer.addChild(flowGraphics);
    stage.addChild(background);
    stage.addChild(world);

    redrawBackground(background, app.screen.width, app.screen.height);
    applyCamera(world, camera);

    filtered.edges.forEach((edge: WorkbenchMemoryGraphEdge): void => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
            return;
        }
        const baseAlpha = clamp(edge.weight, 0.14, 0.54);
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
        const pulseRing = new Graphics();
        const glow = new Graphics();
        const body = new Graphics();
        const label = new Text({
            text: node.label,
            anchor: { x: 0.5, y: 0 },
            style: {
                fill: '#dbe7ff',
                fontSize: 12,
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
        root.addChild(glow);
        root.addChild(body);
        label.position.set(0, computeMemoryGraphNodeSize(node.importance ?? 0, node.memoryPercent) * 0.5 + 10);
        root.addChild(label);
        root.on('pointerdown', (event: FederatedPointerEvent): void => {
            event.stopPropagation();
        });
        root.on('pointertap', (event: FederatedPointerEvent): void => {
            event.stopPropagation();
            if (performance.now() < suppressTapUntil) {
                return;
            }
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
                camera.scale,
                false,
                flowState.progress,
                flowState.intensity,
            );
            syncSelectionAnimation();
            options.onSelectNode?.(node.id);
        });
        nodeLayer.addChild(root);
        nodeSprites.set(node.id, { node, root, pulseRing, glow, body, label });
    });

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
        syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, true);
    }

    /**
     * 功能：处理拖拽中的相机移动。
     * @param event Pixi 指针事件。
     * @returns 无返回值。
     */
    function handleGlobalPointerMove(event: FederatedPointerEvent): void {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }
        const deltaX = event.global.x - dragState.startX;
        const deltaY = event.global.y - dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX, deltaY) >= 4) {
            dragState.moved = true;
        }
        camera.translateX = dragState.originX + deltaX;
        camera.translateY = dragState.originY + deltaY;
        applyCamera(world, camera);
        syncDetailLevel(nodeSprites, connectedNodeIds, selectedNodeId, camera.scale, true);
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
        }
        dragState = null;
        background.cursor = 'grab';
        container.style.cursor = 'grab';
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
                camera.scale,
                false,
                flowState.progress,
                flowState.intensity,
            );
            syncSelectionAnimation();
            options.onSelectEdge?.(edgeHit.edge.id);
            return;
        }
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
        applyCamera(world, camera);
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
            applyCamera(world, camera);
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
        app.stage.hitArea = app.screen;
    });
    resizeObserver.observe(container);

    if (!persistedCameraState && selectedNodeId) {
        focusNode(selectedNodeId);
    }
    syncSelectionVisuals(
        nodeSprites,
        edgeSprites,
        edgeGraphics,
        flowGraphics,
        connectedNodeIds,
        selectedNodeId,
        selectedEdgeId,
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
        flowState.progress = 0;
        flowState.intensity = 1;
        redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, flowState.progress, flowState.intensity);
        flowTween = gsap.timeline({ repeat: -1 });
        flowTween.set(flowState, {
            progress: 0,
            intensity: 1,
            onUpdate: (): void => {
                redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, flowState.progress, flowState.intensity);
            },
        });
        flowTween.to(flowState, {
            progress: 1,
            duration: 1.28,
            ease: 'none',
            onUpdate: (): void => {
                redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, flowState.progress, flowState.intensity);
            },
        });
        flowTween.to(flowState, {
            intensity: 0,
            duration: 0.18,
            ease: 'power1.out',
            onUpdate: (): void => {
                redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, flowState.progress, flowState.intensity);
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
        resizeObserver.disconnect();
        app.canvas.removeEventListener('wheel', handleWheel);
        background.off('pointerdown', handleDragStart);
        background.off('pointertap', handleBackgroundTap);
        stage.off('globalpointermove', handleGlobalPointerMove);
        stage.off('pointerup', handleDragEnd);
        stage.off('pointerupoutside', handleDragEnd);
        cameraTween?.kill();
        flowTween?.kill();
        pulseTween?.kill();
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
function applyCamera(world: Container, camera: GraphCameraState): void {
    world.position.set(camera.translateX, camera.translateY);
    world.scale.set(camera.scale);
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
    }

    nodeSprites.forEach((sprite: GraphNodeSprite): void => {
        const isSelected = sprite.node.id === selectedNodeId;
        const isConnected = connectedNodeIds.has(sprite.node.id);
        const dimmed = (Boolean(selectedNodeId) || Boolean(selectedEdgeId)) && !isSelected && !isConnected;
        const showLabel = !isDragging && (scale >= 0.62 || isSelected || isConnected);
        drawNodeSprite(sprite, isSelected, dimmed, showLabel);
    });

    redrawEdgeLayer(edgeGraphics, edgeSprites, selectedNodeId, selectedEdgeId);
    redrawFlowLayer(flowGraphics, edgeSprites, selectedNodeId, flowProgress, flowIntensity);
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
): void {
    edgeGraphics.clear();
    edgeSprites.forEach((sprite: GraphEdgeSprite): void => {
        const active = sprite.edge.id === selectedEdgeId || sprite.sourceId === selectedNodeId || sprite.targetId === selectedNodeId;
        const alpha = !selectedNodeId && !selectedEdgeId
            ? sprite.baseAlpha
            : active
                ? Math.max(0.7, sprite.baseAlpha)
                : 0.06;
        const width = sprite.edge.id === selectedEdgeId ? 3.4 : active ? 2.8 : 2.2;
        drawGradientEdge(
            edgeGraphics,
            sprite.sourceNode,
            sprite.targetNode,
            sprite.sourceColor,
            sprite.targetColor,
            width,
            alpha,
            active ? EDGE_SEGMENT_COUNT + 4 : EDGE_SEGMENT_COUNT,
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
    progress: number,
    intensity: number,
): void {
    flowGraphics.clear();
    if (!selectedNodeId || intensity <= 0.001) {
        return;
    }
    edgeSprites.forEach((sprite: GraphEdgeSprite): void => {
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
    });
}

/**
 * 功能：绘制单个节点的外观。
 * @param sprite 节点精灵。
 * @param isSelected 是否为选中节点。
 * @param dimmed 是否处于弱化状态。
 * @returns 无返回值。
 */
function drawNodeSprite(sprite: GraphNodeSprite, isSelected: boolean, dimmed: boolean, showLabel: boolean): void {
    const radius = computeMemoryGraphNodeSize(sprite.node.importance ?? 0, sprite.node.memoryPercent) * 0.5;
    const color = toPixiColor(getMemoryGraphNodeColor(sprite.node.type));
    const fillAlpha = isSelected ? 0.4 : 0.16;
    const glowAlpha = isSelected ? 0.66 : 0.12;
    const borderWidth = isSelected ? 3.6 : 1.4;
    const labelColor = isSelected
        ? 0xffffff
        : sprite.node.type === 'actor'
            ? 0xfcd34d
            : 0xdbe7ff;

    sprite.root.alpha = dimmed ? 0.18 : 1;
    sprite.label.visible = showLabel;
    sprite.label.tint = labelColor;
    sprite.pulseRing.clear();
    sprite.glow.clear();
    sprite.body.clear();
    if (isSelected) {
        sprite.pulseRing.alpha = 0.72;
        if (sprite.node.type === 'actor') {
            sprite.pulseRing.poly([0, -radius - 12, radius + 12, 0, 0, radius + 12, -radius - 12, 0], true)
                .stroke({ color: 0xffffff, alpha: 0.56, width: 2.2 });
        } else {
            sprite.pulseRing.circle(0, 0, radius + 10)
                .stroke({ color: 0xffffff, alpha: 0.56, width: 2.2 });
        }
    } else {
        sprite.pulseRing.alpha = 0;
        sprite.pulseRing.scale.set(1, 1);
        sprite.root.scale.set(1, 1);
    }

    if (sprite.node.type === 'actor') {
        if (isSelected) {
            sprite.glow.poly([0, -radius - 16, radius + 16, 0, 0, radius + 16, -radius - 16, 0], true)
                .fill({ color: 0xffffff, alpha: 0.18 });
        }
        sprite.glow.poly([0, -radius - 8, radius + 8, 0, 0, radius + 8, -radius - 8, 0], true)
            .fill({ color, alpha: glowAlpha });
        sprite.body.poly([0, -radius, radius, 0, 0, radius, -radius, 0], true)
            .fill({ color, alpha: fillAlpha })
            .stroke({ color, alpha: 0.96, width: borderWidth });
        if (isSelected) {
            sprite.body.poly([0, -radius - 3, radius + 3, 0, 0, radius + 3, -radius - 3, 0], true)
                .stroke({ color: 0xffffff, alpha: 0.92, width: 1.6 });
        }
        sprite.body.circle(0, 0, Math.max(6, radius * 0.42))
            .fill({ color: 0xffffff, alpha: isSelected ? 1 : 0.9 });
        return;
    }

    if (isSelected) {
        sprite.glow.circle(0, 0, radius + 14).fill({ color: 0xffffff, alpha: 0.16 });
    }
    sprite.glow.circle(0, 0, radius + 8).fill({ color, alpha: glowAlpha });
    sprite.body.circle(0, 0, radius)
        .fill({ color, alpha: fillAlpha })
        .stroke({ color, alpha: 0.96, width: borderWidth });
    if (isSelected) {
        sprite.body.circle(0, 0, radius + 2.8)
            .stroke({ color: 0xffffff, alpha: 0.94, width: 1.8 });
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
    const sourceRadius = computeMemoryGraphNodeSize(source.importance ?? 0, source.memoryPercent) * 0.5;
    const targetRadius = computeMemoryGraphNodeSize(target.importance ?? 0, target.memoryPercent) * 0.5;
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
