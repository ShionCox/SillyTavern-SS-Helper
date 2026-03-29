import { escapeHtml } from '../editorShared';
import { resolveEntryTypeLabel } from '../workbenchLocale';
import { escapeAttr } from './shared';
import type { WorkbenchMemoryGraph, WorkbenchMemoryGraphNode, MemoryGraphMode } from './shared/memoryGraphTypes';
import { getMemoryGraphNodeColor, computeMemoryGraphNodeSize, MEMORY_GRAPH_TYPE_LABELS } from './shared/memoryGraphTypes';

/**
 * 功能：记忆图渲染选项。
 */
export interface MemoryGraphRenderOptions {
    selectedNodeId?: string;
    filterType?: string;
    searchQuery?: string;
    graphMode?: MemoryGraphMode;
    onSelectNode?: (nodeId: string, entryId: string) => void;
}

/**
 * 功能：全局保持图谱的视口摄像机状态，避免每次 React-like 渲染后归位。
 */
interface GlobalGraphCamera {
    scale: number;
    translateX: number;
    translateY: number;
}
let __globalGraphCamera: GlobalGraphCamera | null = null;

/**
 * 功能：挂载记忆网络图到容器。
 * @param container 容器 DOM 节点。
 * @param data 记忆图数据。
 * @param options 渲染选项。
 */
export function mountMemoryGraph(
    container: HTMLElement,
    data: WorkbenchMemoryGraph,
    options: MemoryGraphRenderOptions = {},
): void {
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.cursor = 'grab';
    container.style.background = 'transparent'; // No background

    // Insert styles if not already present
    if (!document.getElementById('stx-tech-graph-style')) {
        const style = document.createElement('style');
        style.id = 'stx-tech-graph-style';
        style.innerHTML = `
            @keyframes tech-pulse {
                0% { opacity: 0.8; }
                100% { opacity: 1; }
            }
            @keyframes tech-spin {
                100% { stroke-dashoffset: -30; }
            }
            @keyframes tech-flow-forward {
                to { stroke-dashoffset: -20; }
            }
            @keyframes tech-flow-backward {
                to { stroke-dashoffset: 20; }
            }
        `;
        document.head.appendChild(style);
    }

    if (data.nodes.length <= 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.4;font-size:14px;">当前聊天尚未生成任何记忆条目。</div>';
        return;
    }

    // 筛选节点
    let visibleNodes = data.nodes;
    if (options.filterType) {
        visibleNodes = visibleNodes.filter(n => n.type === options.filterType);
    }
    if (options.searchQuery) {
        const q = options.searchQuery.toLowerCase();
        visibleNodes = visibleNodes.filter(n =>
            n.label.toLowerCase().includes(q) ||
            (n.summary ?? '').toLowerCase().includes(q) ||
            (n.tags ?? []).some(t => t.toLowerCase().includes(q)),
        );
    }

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const currentMode = options.graphMode ?? 'compact';
    const visibleEdges = data.edges.filter(e => {
        if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) return false;
        if (e.visibleInModes && !e.visibleInModes.includes(currentMode)) return false;
        return true;
    });

    const canvas = document.createElement('div');
    canvas.className = 'stx-memory-graph-canvas';
    canvas.style.position = 'absolute';
    canvas.style.transformOrigin = '0 0';

    const rect = container.getBoundingClientRect();
    let scale = __globalGraphCamera?.scale ?? 1;
    let translateX = __globalGraphCamera?.translateX ?? ((rect.width || 640) / 2);
    let translateY = __globalGraphCamera?.translateY ?? ((rect.height || 420) / 2);
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const saveCamera = (): void => {
        __globalGraphCamera = { scale, translateX, translateY };
    };

    const updateTransform = (): void => {
        canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        saveCamera();
    };

    const focusNode = (nodeId?: string, animate: boolean = false): void => {
        if (!nodeId) return;
        const node = visibleNodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // 如果我们仅仅是因为由于 React-like 重渲导致的加载，不要强行focus。
        // focus 应该主要是用户主动触发或者初始化的时候发生。由 click 事件里手动触发，这里不需要做！
        // 等等，我们在最后有一个 `focusNode(options.selectedNodeId)`。如果不希望它乱跳，我们需要去掉它！
        translateX = (rect.width || 640) / 2 - (node.x * scale);
        translateY = (rect.height || 420) / 2 - (node.y * scale);

        if (animate) {
            canvas.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            requestAnimationFrame(() => {
                updateTransform();
            });
            setTimeout(() => { canvas.style.transition = 'none'; }, 400);
        } else {
            canvas.style.transition = 'none';
            updateTransform();
        }
    };

    updateTransform();

    const nodeMap = new Map(visibleNodes.map(n => [n.id, n]));

    // 绘制 SVG 边
    let svgHtml = '<svg style="position:absolute;top:-5000px;left:-5000px;width:10000px;height:10000px;overflow:visible;" viewBox="-5000 -5000 10000 10000">';

    for (const edge of visibleEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let x1 = source.x;
        let y1 = source.y;
        let x2 = target.x;
        let y2 = target.y;

        const sourceSize = computeMemoryGraphNodeSize(source.importance ?? 0, source.memoryPercent) / 2;
        const targetSize = computeMemoryGraphNodeSize(target.importance ?? 0, target.memoryPercent) / 2;

        if (distance > sourceSize + targetSize) {
            const r1 = sourceSize / distance;
            const r2 = targetSize / distance;
            x1 += dx * r1;
            y1 += dy * r1;
            x2 -= dx * r2;
            y2 -= dy * r2;
        }

        const opacity = Math.max(0.1, Math.min(0.5, edge.weight));
        // Hover edge logic
        // 关键点：我们给线段外面套一个透明的、很粗的、并且不是虚线的隐形 <line>，专门用来吸收 hover 事件
        svgHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="12" class="stx-memory-graph-edge-hitbox" data-edge-source="${escapeAttr(source.id)}" data-edge-target="${escapeAttr(target.id)}" style="cursor:pointer;" pointer-events="stroke" />`;
        // 实际渲染的视觉线条，pointer-events 让其穿透
        svgHtml += `<line data-edge-vid="${escapeAttr(source.id)}|||${escapeAttr(target.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#edge-gradient-${source.id}-${target.id})" stroke-width="2.5" opacity="${opacity}" class="stx-memory-graph-edge-visual" style="transition:opacity 0.3s ease; pointer-events:none;" />`;
        // Add defs for gradient
        svgHtml += `<defs><linearGradient id="edge-gradient-${source.id}-${target.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="${getMemoryGraphNodeColor(source.type)}" stop-opacity="0.8" />
            <stop offset="100%" stop-color="${getMemoryGraphNodeColor(target.type)}" stop-opacity="0.8" />
        </linearGradient></defs>`;
    }
    svgHtml += '</svg>';
    canvas.innerHTML += svgHtml;

    // 绘制节点
    for (const node of visibleNodes) {
        const color = getMemoryGraphNodeColor(node.type);
        const size = computeMemoryGraphNodeSize(node.importance ?? 0, node.memoryPercent);
        const glowIntensity = Math.max(0.2, (node.memoryPercent ?? 0) / 100);
        const glowOpacity = Math.max(0.4, glowIntensity);
        const floatDelay = Math.random() * 2;
        const isSelected = node.id === options.selectedNodeId;
        const typeLabel = MEMORY_GRAPH_TYPE_LABELS[node.type] ?? resolveEntryTypeLabel(node.type);

        const floatDuration = 3 + Math.random() * 3;
        
        // Tech effect: geometric core, outer dashed ring
        const isActor = node.type === 'actor_profile';
        const coreSize = isActor ? size * 0.5 : size * 0.3; // 角色内部空间大一点用来放图标
        const blurSpread = isSelected ? size * 1.5 : size * 0.5;
        const borderStyle = isSelected ? `2px solid #fff` : `1px solid ${color}`;
        const initialBoxShadow = `0 0 ${blurSpread}px ${color}, inset 0 0 ${size * 0.4}px ${color}`;
        
        let coreContent = `<div style="width:${coreSize}px;height:${coreSize}px;border-radius:50%;background:${color};box-shadow:0 0 ${coreSize*2}px ${color}, 0 0 ${coreSize*4}px #fff;opacity:0.9;"></div>`;
        if (isActor) {
            coreContent = `<div style="width:${coreSize}px;height:${coreSize}px;border-radius:4px;background:transparent;display:flex;align-items:center;justify-content:center;transform:rotate(-45deg);"><i class="fa-solid fa-user-astronaut" style="color:#fff;font-size:${coreSize*1.2}px;text-shadow:0 0 ${coreSize}px ${color}, 0 0 ${coreSize*2}px #fff;"></i></div>`;
        }

        const nodeHtml = `<button type="button" class="stx-memory-graph-node${isSelected ? ' is-selected' : ''}" data-mg-node-id="${escapeAttr(node.id)}" data-mg-entry-id="${escapeAttr(node.entryId)}" style="left:${node.x}px;top:${node.y}px;transform:translate(-50%,-50%);position:absolute;border:none;cursor:pointer;background:transparent;padding:0;z-index:5;" title="${escapeAttr(node.label + ' (' + typeLabel + ')')}"` +
            ` data-float-duration="${floatDuration}" data-float-delay="${floatDelay}">` +
            `<div class="stx-memory-node-glow" data-original-box-shadow="${escapeAttr(initialBoxShadow)}" style="animation: tech-pulse ${floatDuration}s infinite alternate; animation-delay:-${floatDelay}s; border-radius:${isActor ? '8px' : '50%'}; width:${size}px;height:${size}px; background:rgba(15,23,42,0.6); border:${borderStyle}; transform:${isActor ? 'rotate(45deg)' : 'none'}; box-shadow:${initialBoxShadow}; opacity:${Math.min(1, glowOpacity + 0.4)}; transition:all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); display:flex; align-items:center; justify-content:center; position:relative;">` +
            coreContent +
            (isActor
                ? `<svg style="position:absolute;inset:-4px;overflow:visible;" viewBox="0 0 ${size+8} ${size+8}"><rect x="2" y="2" width="${size+4}" height="${size+4}" rx="8" ry="8" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="5 5" opacity="0.6" style="animation: tech-spin ${floatDuration * 3}s linear infinite;"/></svg>`
                : `<svg style="position:absolute;inset:-4px;overflow:visible;" viewBox="0 0 ${size+8} ${size+8}"><circle cx="${(size+8)/2}" cy="${(size+8)/2}" r="${(size+8)/2 - 2}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="5 5" opacity="0.5" style="animation: tech-spin ${floatDuration * 3}s linear infinite;"/></svg>`) +
            `</div>` +
            `<div style="position:absolute;top:${size + 10}px;left:50%;transform:translateX(-50%);color:${isSelected ? '#fff' : (isActor ? '#fcd34d' : '#cbd5e1')};font-size:12px;font-weight:${isActor ? 'bold' : 'normal'};font-family:monospace;letter-spacing:1px;white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,0.9);opacity:${isSelected ? 1 : 0.8};transition:all 0.3s;pointer-events:none;">${escapeHtml(node.label)}</div>` +
            `</button>`;
        canvas.innerHTML += nodeHtml;
    }

    container.appendChild(canvas);

    // 高亮网络
    const highlightNetwork = (centerId?: string, hoverEdgeSrc?: string, hoverEdgeTgt?: string): void => {
        const allNodeEls = canvas.querySelectorAll<HTMLElement>('.stx-memory-graph-node');
        const allEdgeVisuals = canvas.querySelectorAll<HTMLElement>('.stx-memory-graph-edge-visual');

        if (!centerId && !hoverEdgeSrc && !hoverEdgeTgt) {
            allNodeEls.forEach(el => { 
                el.style.opacity = '1'; 
                el.classList.remove('is-selected'); 
                const glowDiv = el.querySelector('.stx-memory-node-glow') as HTMLElement;
                if (glowDiv) glowDiv.style.boxShadow = glowDiv.dataset.originalBoxShadow || '';
            });
            allEdgeVisuals.forEach(el => { 
                el.style.opacity = String(Math.max(0.15, 0.3)); 
                el.removeAttribute('stroke-dasharray');
                el.style.animation = 'none';
            });
            return;
        }

        const connectedSet = new Set<string>();
        
        if (centerId) {
            connectedSet.add(centerId);
            for (const edge of visibleEdges) {
                if (edge.source === centerId) connectedSet.add(edge.target);
                if (edge.target === centerId) connectedSet.add(edge.source);
            }
        } else if (hoverEdgeSrc && hoverEdgeTgt) {
            connectedSet.add(hoverEdgeSrc);
            connectedSet.add(hoverEdgeTgt);
        }

        allNodeEls.forEach(el => {
            const nodeId = el.dataset.mgNodeId ?? '';
            if (nodeId === centerId) {
                el.style.opacity = '1';
                el.classList.add('is-selected');
                // Enhance pulse for selected neuron
                const glowDiv = el.querySelector('.stx-memory-node-glow') as HTMLElement;
                if (glowDiv) glowDiv.style.boxShadow = `0 0 20px rgba(255,255,255,0.8), inset 0 0 10px rgba(255,255,255,0.5)`;
            } else if (connectedSet.has(nodeId)) {
                el.style.opacity = '0.9';
                el.classList.remove('is-selected');
                const glowDiv = el.querySelector('.stx-memory-node-glow') as HTMLElement;
                if (glowDiv) glowDiv.style.boxShadow = glowDiv.dataset.originalBoxShadow || '';
            } else {
                el.style.opacity = '0.15';
                el.classList.remove('is-selected');
                const glowDiv = el.querySelector('.stx-memory-node-glow') as HTMLElement;
                if (glowDiv) glowDiv.style.boxShadow = glowDiv.dataset.originalBoxShadow || '';
            }
        });

        allEdgeVisuals.forEach(el => {
            const vid = el.dataset.edgeVid ?? '';
            const [src = '', tgt = ''] = vid.split('|||');
            
            if (centerId) {
                el.style.opacity = (src === centerId || tgt === centerId) ? '0.9' : '0.05';
                if (src === centerId || tgt === centerId) {
                    el.setAttribute('stroke-dasharray', '5 5');
                    const isSource = src === centerId;
                    el.style.animation = isSource ? 'tech-flow-backward 1s linear infinite' : 'tech-flow-forward 1s linear infinite';
                } else {
                    el.removeAttribute('stroke-dasharray');
                    el.style.animation = 'none';
                }
            } else if (hoverEdgeSrc && hoverEdgeTgt) {
                const isHoveredEdge = (src === hoverEdgeSrc && tgt === hoverEdgeTgt) || (src === hoverEdgeTgt && tgt === hoverEdgeSrc);
                el.style.opacity = isHoveredEdge ? '0.9' : '0.05';
                if (isHoveredEdge) {
                    el.setAttribute('stroke-dasharray', '5 5');
                    el.style.animation = 'tech-flow-forward 2s linear infinite';
                } else {
                    el.removeAttribute('stroke-dasharray');
                    el.style.animation = 'none';
                }
            }
        });
    };

    // 节点点击事件
    canvas.querySelectorAll<HTMLElement>('.stx-memory-graph-node').forEach(nodeEl => {
        nodeEl.addEventListener('mousedown', (e: MouseEvent) => { e.stopPropagation(); });
        nodeEl.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            const nodeId = nodeEl.dataset.mgNodeId ?? '';
            const entryId = nodeEl.dataset.mgEntryId ?? '';
            if (!nodeId) return;
            // 不再强行 focusNode 改变摄像机位置，只做高亮并呼出面板
            highlightNetwork(nodeId);
            options.onSelectNode?.(nodeId, entryId);
        });
    });

    // 画布拖拽
    container.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        container.style.cursor = 'grabbing';
    });

    const onMouseMove = (e: MouseEvent): void => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
    };

    const onMouseUp = (): void => {
        isDragging = false;
        container.style.cursor = 'grab';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // 缩放
    container.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        const currentRect = container.getBoundingClientRect();
        const mouseX = e.clientX - currentRect.left;
        const mouseY = e.clientY - currentRect.top;
        translateX = mouseX - (mouseX - translateX) * zoomFactor;
        translateY = mouseY - (mouseY - translateY) * zoomFactor;
        scale = Math.max(0.15, Math.min(scale * zoomFactor, 5));
        updateTransform();
    }, { passive: false });

    // 点击空白区域取消选择
    canvas.addEventListener('click', (e: MouseEvent) => {
        if (e.target === canvas || (e.target as HTMLElement).tagName.toLowerCase() === 'svg') {
            options.onSelectNode?.('', ''); // 通知外部清除选中
            highlightNetwork(undefined);
        }
    });

    // 线条悬停事件 (防抖处理，避免多条线密集时疯狂闪烁)
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    canvas.querySelectorAll<HTMLElement>('.stx-memory-graph-edge-hitbox').forEach(edgeEl => {
        edgeEl.addEventListener('mouseenter', () => {
            if (hoverTimeout) clearTimeout(hoverTimeout);
            
            const src = edgeEl.dataset.edgeSource;
            const tgt = edgeEl.dataset.edgeTarget;
            if (src && tgt) {
                // 如果当前没有选中的节点才悬停
                if (!document.querySelector('.stx-memory-graph-node.is-selected')) {
                    hoverTimeout = setTimeout(() => {
                        highlightNetwork(undefined, src, tgt);
                    }, 50); // 增加 50ms 延迟，避免划过密集区直接触发
                }
            }
        });
        edgeEl.addEventListener('mouseleave', () => {
            if (hoverTimeout) clearTimeout(hoverTimeout);
            
            // 如果恢复原状前提是没有选中任何节点
            if (!document.querySelector('.stx-memory-graph-node.is-selected')) {
                hoverTimeout = setTimeout(() => {
                    // 二次确认是否真的离开了所有线条还是只是移到另一条上
                    if (!document.querySelector('.stx-memory-graph-node.is-selected')) {
                        highlightNetwork();
                    }
                }, 100); // 离开时稍做延迟等待，允许鼠标平滑转移
            }
        });
    });

    // 初始高亮
    highlightNetwork(options.selectedNodeId);
}
