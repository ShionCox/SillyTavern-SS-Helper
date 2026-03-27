import { escapeHtml } from '../../editorShared';
import { escapeAttr, type WorkbenchActorGraph, type WorkbenchGraphLinkType } from '../shared';

export interface GraphOptions {
    selectedNodeId?: string;
    onSelectNode?: (nodeId: string) => void;
}

const LINK_COLORS: Record<WorkbenchGraphLinkType, string> = {
    ally: '#38bdf8',
    enemy: '#ef4444',
    neutral: '#94a3b8',
    family: '#c4a062',
};

/**
 * 功能：挂载角色关系图。
 * @param container 容器节点。
 * @param data 图数据。
 * @param options 渲染选项。
 * @returns 无返回值。
 */
export function mountRelationshipGraph(container: HTMLElement, data: WorkbenchActorGraph, options: GraphOptions = {}): void {
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.background = 'transparent';
    container.style.cursor = 'grab';

    if (data.nodes.length <= 0) {
        container.innerHTML = '<div class="stx-memory-workbench__empty">当前聊天尚未建立任何真实角色节点。</div>';
        return;
    }

    const canvas = document.createElement('div');
    canvas.className = 'stx-rpg-graph-canvas';
    canvas.style.position = 'absolute';
    canvas.style.transformOrigin = '0 0';

    const rect = container.getBoundingClientRect();
    let scale = 1;
    let translateX = (rect.width || 640) / 2;
    let translateY = (rect.height || 420) / 2;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    /**
     * 功能：同步画布缩放和平移。
     * @returns 无返回值。
     */
    const updateTransform = (): void => {
        canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    /**
     * 功能：把指定节点移动到视图中心附近。
     * @param nodeId 节点 ID。
     * @returns 无返回值。
     */
    const focusNode = (nodeId?: string, animate: boolean = false): void => {
        if (!nodeId) {
            return;
        }
        const node = data.nodes.find((item): boolean => item.id === nodeId);
        if (!node) {
            return;
        }
        translateX = (rect.width || 640) / 2 + 120 - (node.x * scale);
        translateY = (rect.height || 420) / 2 - (node.y * scale);
        
        if (animate) {
            canvas.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
            void canvas.offsetWidth;
        } else {
            canvas.style.transition = 'none';
        }
        
        updateTransform();
        
        if (animate) {
            setTimeout(() => { canvas.style.transition = 'none'; }, 400);
        }
    };

    updateTransform();

    const nodeMap = new Map(data.nodes.map((node): [string, typeof node] => [node.id, node]));
    let markersHtml = '';
    (Object.keys(LINK_COLORS) as WorkbenchGraphLinkType[]).forEach((key: WorkbenchGraphLinkType): void => {
        const color = LINK_COLORS[key];
        markersHtml += '<marker id="arrow-' + key + '" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
            '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + color + '" opacity="0.8"/>' +
        '</marker>';
    });

    let svgHtml = '<svg style="position:absolute; top:-5000px; left:-5000px; width:10000px; height:10000px; overflow:visible; pointer-events:none;" viewBox="-5000 -5000 10000 10000">' +
        '<defs>' + markersHtml + '</defs>';

    data.links.forEach((link): void => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) {
            return;
        }
        const color = LINK_COLORS[link.type] || LINK_COLORS.neutral;
        svgHtml += '<line ' +
            'data-link-source="' + escapeAttr(source.id) + '" ' +
            'data-link-target="' + escapeAttr(target.id) + '" ' +
            'x1="' + source.x + '" y1="' + source.y + '" ' +
            'x2="' + target.x + '" y2="' + target.y + '" ' +
            'stroke="' + color + '" stroke-width="1.5" opacity="0.6" ' +
            'marker-end="url(#arrow-' + link.type + ')" ' +
            'class="stx-rpg-graph-edge" />';
    });
    svgHtml += '</svg>';
    canvas.innerHTML += svgHtml;

    data.links.forEach((link): void => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) {
            return;
        }
        const cx = (source.x + target.x) / 2;
        const cy = (source.y + target.y) / 2;
        const color = LINK_COLORS[link.type] || LINK_COLORS.neutral;
        canvas.innerHTML += '<div class="stx-rpg-graph-label stx-rpg-graph-edge" ' +
            'data-link-source="' + escapeAttr(source.id) + '" ' +
            'data-link-target="' + escapeAttr(target.id) + '" ' +
            'style="left:' + cx + 'px; top:' + cy + 'px; color:' + color + '; border-color:' + color + '; width: max-content; max-width: 240px; padding: 4px 8px; text-align: left; line-height: 1.4;">' +
            escapeHtml(link.label) +
        '</div>';
    });

    data.nodes.forEach((node): void => {
        const activeClass = node.id === options.selectedNodeId ? ' is-focused' : '';
        canvas.innerHTML += '<button type="button" class="stx-rpg-graph-node' + activeClass + '" data-node-id="' + escapeAttr(node.id) + '" style="left:' + node.x + 'px; top:' + node.y + 'px;">' +
            '<div class="avatar" style="flex-shrink:0; min-width:48px; min-height:48px; width:48px; height:48px; box-sizing:border-box;">' +
                '<i class="fa-solid fa-user"></i>' +
            '</div>' +
            '<div class="name">' + escapeHtml(node.label) + '</div>' +
        '</button>';
    });

    container.appendChild(canvas);

    /**
     * 功能：高亮当前节点及其真实关系。
     * @param centerId 中心节点 ID。
     * @returns 无返回值。
     */
    const highlightNetwork = (centerId?: string): void => {
        const allNodes = canvas.querySelectorAll<HTMLElement>('.stx-rpg-graph-node');
        const allEdges = canvas.querySelectorAll<HTMLElement>('.stx-rpg-graph-edge');
        if (!centerId) {
            allNodes.forEach((node): void => {
                node.style.opacity = '1';
                node.classList.remove('is-focused');
            });
            allEdges.forEach((edge): void => {
                edge.style.opacity = edge.tagName.toLowerCase() === 'line' ? '0.6' : '1';
            });
            return;
        }
        const connected = new Set<string>([centerId]);
        data.links.forEach((link): void => {
            if (link.source === centerId) {
                connected.add(link.target);
            }
            if (link.target === centerId) {
                connected.add(link.source);
            }
        });
        allNodes.forEach((node): void => {
            const nodeId = String(node.dataset.nodeId ?? '').trim();
            if (nodeId === centerId) {
                node.style.opacity = '1';
                node.classList.add('is-focused');
                return;
            }
            if (connected.has(nodeId)) {
                node.style.opacity = '1';
                node.classList.remove('is-focused');
                return;
            }
            node.style.opacity = '0.24';
            node.classList.remove('is-focused');
        });
        allEdges.forEach((edge): void => {
            const source = String(edge.dataset.linkSource ?? '').trim();
            const target = String(edge.dataset.linkTarget ?? '').trim();
            edge.style.opacity = source === centerId || target === centerId ? '1' : '0.1';
        });
    };

    canvas.querySelectorAll<HTMLElement>('.stx-rpg-graph-node').forEach((nodeEl): void => {
        nodeEl.addEventListener('mousedown', (event: MouseEvent): void => {
            event.stopPropagation();
        });
        nodeEl.addEventListener('click', (event: MouseEvent): void => {
            event.stopPropagation();
            const nodeId = String(nodeEl.dataset.nodeId ?? '').trim();
            if (!nodeId) {
                return;
            }
            highlightNetwork(nodeId);
            focusNode(nodeId, true);
            setTimeout(() => {
                options.onSelectNode?.(nodeId);
            }, 400);
        });
    });

    container.addEventListener('mousedown', (event: MouseEvent): void => {
        isDragging = true;
        startX = event.clientX - translateX;
        startY = event.clientY - translateY;
        container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (event: MouseEvent): void => {
        if (!isDragging) {
            return;
        }
        translateX = event.clientX - startX;
        translateY = event.clientY - startY;
        updateTransform();
    });

    window.addEventListener('mouseup', (): void => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('wheel', (event: WheelEvent): void => {
        event.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = event.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        const currentRect = container.getBoundingClientRect();
        const mouseX = event.clientX - currentRect.left;
        const mouseY = event.clientY - currentRect.top;
        translateX = mouseX - (mouseX - translateX) * zoomFactor;
        translateY = mouseY - (mouseY - translateY) * zoomFactor;
        scale = Math.max(0.18, Math.min(scale * zoomFactor, 5));
        updateTransform();
    }, { passive: false });

    highlightNetwork(options.selectedNodeId);
    focusNode(options.selectedNodeId);
}
