import { escapeHtml } from '../../editorShared';
import { escapeAttr } from '../shared';

export interface GraphNode {
    id: string;
    label: string;
    icon?: string;
    x: number;
    y: number;
    color?: string;
}

export interface GraphLink {
    source: string;
    target: string;
    label: string;
    type: 'ally' | 'enemy' | 'neutral' | 'family';
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

const LINK_COLORS: Record<string, string> = {
    ally: '#38bdf8',
    enemy: '#ef4444',
    neutral: '#94a3b8',
    family: '#c4a062'
};

export function mountRelationshipGraph(container: HTMLElement, data: GraphData): void {
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.background = 'transparent';
    container.style.cursor = 'grab';

    const canvas = document.createElement('div');
    canvas.className = 'stx-rpg-graph-canvas';
    canvas.style.position = 'absolute';
    canvas.style.transformOrigin = '0 0';
    
    const rect = container.getBoundingClientRect();
    let scale = 1;
    let translateX = (rect.width || 800) / 2;
    let translateY = (rect.height || 500) / 2;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    let focusedNodeId: string | null = null;

    const updateTransform = () => {
        canvas.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
    };
    updateTransform();

    const svgId = 'stx-rpg-graph-svg';
    let markersHtml = '';
    for (const [key, color] of Object.entries(LINK_COLORS)) {
        markersHtml += '<marker id="arrow-' + key + '" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
            '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + color + '" opacity="0.8"/>' +
        '</marker>';
    }

    let svgHtml = '<svg id="' + svgId + '" style="position: absolute; top:-5000px; left:-5000px; width:10000px; height:10000px; overflow:visible; pointer-events:none;" viewBox="-5000 -5000 10000 10000">' +
        '<defs>' + markersHtml + '</defs>';

    const nodeMap = new Map();
    data.nodes.forEach(n => nodeMap.set(n.id, n));

    data.links.forEach(link => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;
        const color = LINK_COLORS[link.type] || LINK_COLORS.neutral;
        svgHtml += '<line ' +
            'data-link-source="' + escapeAttr(source.id) + '" ' +
            'data-link-target="' + escapeAttr(target.id) + '" ' +
            'x1="' + source.x + '" y1="' + source.y + '" ' +
            'x2="' + target.x + '" y2="' + target.y + '" ' +
            'stroke="' + color + '" stroke-width="1.5" opacity="0.6" ' +
            'marker-end="url(#arrow-' + link.type + ')" ' +
            'class="stx-rpg-graph-edge" ' +
        '/>';
    });
    svgHtml += '</svg>';
    canvas.innerHTML += svgHtml;

    data.links.forEach(link => {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (!source || !target) return;
        const cx = (source.x + target.x) / 2;
        const cy = (source.y + target.y) / 2;
        const color = LINK_COLORS[link.type] || LINK_COLORS.neutral;
        
        canvas.innerHTML += '<div class="stx-rpg-graph-label stx-rpg-graph-edge" ' +
            'data-link-source="' + escapeAttr(source.id) + '" ' +
            'data-link-target="' + escapeAttr(target.id) + '" ' +
            'style="left: ' + cx + 'px; top: ' + cy + 'px; color: ' + color + '; border-color: ' + color + ';">' +
            escapeHtml(link.label) +
        '</div>';
    });

    data.nodes.forEach(node => {
        const extStyle = node.color ? 'style="color:' + node.color + ';border-color:' + node.color + ';"' : '';
        const iconCls = node.icon || 'fa-user';
        canvas.innerHTML += '<div class="stx-rpg-graph-node" data-node-id="' + escapeAttr(node.id) + '" style="left: ' + node.x + 'px; top: ' + node.y + 'px;">' +
            '<div class="avatar" ' + extStyle + '>' +
                '<i class="fa-solid ' + escapeAttr(iconCls) + '"></i>' +
            '</div>' +
            '<div class="name">' + escapeHtml(node.label) + '</div>' +
        '</div>';
    });

    container.appendChild(canvas);

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        translateX = mouseX - (mouseX - translateX) * zoomFactor;
        translateY = mouseY - (mouseY - translateY) * zoomFactor;
        scale *= zoomFactor;
        
        scale = Math.max(0.1, Math.min(scale, 5));
        updateTransform();
    }, { passive: false });

    const highlightNetwork = (centerId: string | null) => {
        const allNodes = canvas.querySelectorAll('.stx-rpg-graph-node');
        const allEdges = canvas.querySelectorAll('.stx-rpg-graph-edge');
        
        if (!centerId) {
            allNodes.forEach(n => { (n as HTMLElement).style.opacity = '1'; n.classList.remove('is-focused'); });
            allEdges.forEach(e => { (e as HTMLElement).style.opacity = e.tagName.toLowerCase() === 'line' ? '0.6' : '1'; });
            return;
        }

        const connected = new Set<string>([centerId]);
        data.links.forEach(l => {
            if (l.source === centerId) connected.add(l.target);
            if (l.target === centerId) connected.add(l.source);
        });

        allNodes.forEach(n => {
            const el = n as HTMLElement;
            const id = el.dataset.nodeId!;
            if (id === centerId) {
                el.style.opacity = '1';
                el.classList.add('is-focused');
            } else if (connected.has(id)) {
                el.style.opacity = '1';
                el.classList.remove('is-focused');
            } else {
                el.style.opacity = '0.2';
                el.classList.remove('is-focused');
            }
        });

        allEdges.forEach(e => {
            const el = e as HTMLElement;
            const src = el.dataset.linkSource;
            const tgt = el.dataset.linkTarget;
            if (src === centerId || tgt === centerId) {
                el.style.opacity = '1';
            } else {
                el.style.opacity = '0.1';
            }
        });
    };

    canvas.querySelectorAll('.stx-rpg-graph-node').forEach(nodeEl => {
        nodeEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        nodeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const el = nodeEl as HTMLElement;
            const id = el.dataset.nodeId!;
            if (focusedNodeId === id) {
                focusedNodeId = null;
                highlightNetwork(null);
            } else {
                focusedNodeId = id;
                highlightNetwork(id);
                const nodeData = nodeMap.get(id);
                if (nodeData) {
                    const rect = container.getBoundingClientRect();
                    translateX = (rect.width / 2) - (nodeData.x * scale);
                    translateY = (rect.height / 2) - (nodeData.y * scale);
                    canvas.style.transition = 'transform 0.3s ease-out';
                    updateTransform();
                    setTimeout(() => { canvas.style.transition = 'none'; }, 300);
                }
            }
        });
    });

    container.addEventListener('click', () => {
        if (focusedNodeId) {
            focusedNodeId = null;
            highlightNetwork(null);
        }
    });
}
