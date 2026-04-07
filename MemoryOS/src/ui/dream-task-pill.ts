import type { DreamUiPhase, DreamUiStateSnapshot } from './dream-ui-state-service';

const PILL_CONTAINER_ID = 'stx-memory-dream-task-pill';
const PILL_STYLE_ID = 'stx-memory-dream-task-pill-style';

/**
 * 功能：phase 对应的文案映射。
 */
const PHASE_LABEL_MAP: Record<DreamUiPhase, string> = {
    queued: '梦境排队中',
    running: '梦境运行中',
    recalling: '正在回溯记忆',
    generating: '正在生成梦境结果',
    post_processing: '正在整理维护提案',
    waiting_approval: '等待你审核',
    auto_applying: '正在自动应用低风险维护',
    completed: '梦境已完成',
    failed: '梦境执行失败',
    rolled_back: '梦境已回滚',
};

/**
 * 功能：phase 对应的图标 class 映射。
 */
const PHASE_ICON_MAP: Record<DreamUiPhase, string> = {
    queued: 'fa-solid fa-clock',
    running: 'fa-solid fa-spinner fa-spin',
    recalling: 'fa-solid fa-spinner fa-spin',
    generating: 'fa-solid fa-spinner fa-spin',
    post_processing: 'fa-solid fa-spinner fa-spin',
    waiting_approval: 'fa-solid fa-bell',
    auto_applying: 'fa-solid fa-spinner fa-spin',
    completed: 'fa-solid fa-check',
    failed: 'fa-solid fa-exclamation-triangle',
    rolled_back: 'fa-solid fa-undo',
};

/**
 * 功能：phase 对应的色系 class 后缀。
 */
function phaseColorClass(phase: DreamUiPhase): string {
    switch (phase) {
        case 'queued':
        case 'running':
        case 'recalling':
        case 'generating':
        case 'post_processing':
        case 'auto_applying':
            return 'is-running';
        case 'waiting_approval':
            return 'is-pending';
        case 'completed':
            return 'is-completed';
        case 'failed':
            return 'is-failed';
        case 'rolled_back':
            return 'is-rolled-back';
        default:
            return '';
    }
}

function ensurePillStyle(): void {
    if (document.getElementById(PILL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PILL_STYLE_ID;
    style.textContent = `
        .stx-dream-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:999px; font-size:12px; line-height:1.4; cursor:pointer; transition:background .2s,opacity .2s; user-select:none; white-space:nowrap; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.05); color:rgba(255,255,255,.85); }
        .stx-dream-pill:hover { background:rgba(255,255,255,.12); }
        .stx-dream-pill.is-running { border-color:rgba(100,181,246,.35); background:rgba(100,181,246,.1); }
        .stx-dream-pill.is-pending { border-color:rgba(255,152,0,.35); background:rgba(255,152,0,.1); }
        .stx-dream-pill.is-completed { border-color:rgba(76,175,80,.3); background:rgba(76,175,80,.08); }
        .stx-dream-pill.is-failed { border-color:rgba(244,67,54,.35); background:rgba(244,67,54,.1); }
        .stx-dream-pill.is-rolled-back { border-color:rgba(158,158,158,.3); background:rgba(158,158,158,.08); }
        .stx-dream-pill__icon { font-size:11px; opacity:.9; }
        .stx-dream-pill__label { font-weight:600; }
        .stx-dream-pill__badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; border-radius:999px; background:rgba(255,152,0,.25); color:#ffb74d; font-size:11px; font-weight:700; padding:0 5px; }
        .stx-dream-pill--hidden { display:none !important; }
    `;
    document.head.appendChild(style);
}

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：从 snapshot 判断 pill 应展示的文案和风格。
 */
function resolvePillContent(snapshot: DreamUiStateSnapshot): {
    visible: boolean;
    label: string;
    icon: string;
    colorClass: string;
    badgeCount: number;
} {
    // 如果有活跃任务
    if (snapshot.activeTask.exists && snapshot.activeTask.phase) {
        const phase = snapshot.activeTask.phase;
        if (phase !== 'completed') {
            return {
                visible: true,
                label: PHASE_LABEL_MAP[phase] || '梦境运行中',
                icon: PHASE_ICON_MAP[phase] || 'fa-solid fa-moon',
                colorClass: phaseColorClass(phase),
                badgeCount: snapshot.inbox.pendingApprovalCount,
            };
        }
    }

    // 优先显示待审批
    if (snapshot.inbox.pendingApprovalCount > 0) {
        const count = snapshot.inbox.pendingApprovalCount;
        return {
            visible: true,
            label: count === 1 ? '1 条梦境待审核' : `${count} 条梦境待审核`,
            icon: 'fa-solid fa-bell',
            colorClass: 'is-pending',
            badgeCount: count,
        };
    }

    // 最近失败
    if (snapshot.latestFailed) {
        const failedAge = Date.now() - (snapshot.latestFailed.failedAt ?? 0);
        if (failedAge < 10 * 60 * 1000) {
            return {
                visible: true,
                label: '梦境执行失败',
                icon: 'fa-solid fa-exclamation-triangle',
                colorClass: 'is-failed',
                badgeCount: 0,
            };
        }
    }

    // 最近完成（10 分钟内）
    if (snapshot.latestCompleted) {
        const completedAge = Date.now() - (snapshot.latestCompleted.completedAt ?? 0);
        if (completedAge < 10 * 60 * 1000) {
            return {
                visible: true,
                label: '梦境刚完成',
                icon: 'fa-solid fa-check',
                colorClass: 'is-completed',
                badgeCount: 0,
            };
        }
    }

    return { visible: false, label: '', icon: '', colorClass: '', badgeCount: 0 };
}

/**
 * 功能：渲染或更新 Dream Task Pill。
 * @param snapshot 当前 UI 状态快照。
 * @param onClick 点击回调。
 */
export function updateDreamTaskPill(snapshot: DreamUiStateSnapshot, onClick?: () => void): void {
    ensurePillStyle();
    let container = document.getElementById(PILL_CONTAINER_ID);
    const content = resolvePillContent(snapshot);

    if (!content.visible) {
        if (container) {
            container.classList.add('stx-dream-pill--hidden');
        }
        return;
    }

    if (!container) {
        container = document.createElement('div');
        container.id = PILL_CONTAINER_ID;
        // pill 将由 toolbar 集成方注入到适当位置
    }

    container.className = `stx-dream-pill ${content.colorClass}`;
    container.classList.remove('stx-dream-pill--hidden');
    container.innerHTML = `
        <span class="stx-dream-pill__icon"><i class="${escapeHtml(content.icon)}"></i></span>
        <span class="stx-dream-pill__label">${escapeHtml(content.label)}</span>
        ${content.badgeCount > 0 ? `<span class="stx-dream-pill__badge">${content.badgeCount}</span>` : ''}
    `;

    if (onClick) {
        container.onclick = (event: Event): void => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        };
    }
}

/**
 * 功能：获取或创建 pill 元素（供外部挂载到 toolbar 使用）。
 */
export function getDreamTaskPillElement(): HTMLElement {
    ensurePillStyle();
    let container = document.getElementById(PILL_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = PILL_CONTAINER_ID;
        container.className = 'stx-dream-pill stx-dream-pill--hidden';
    }
    return container;
}

/**
 * 功能：隐藏 pill。
 */
export function hideDreamTaskPill(): void {
    const container = document.getElementById(PILL_CONTAINER_ID);
    if (container) {
        container.classList.add('stx-dream-pill--hidden');
    }
}
