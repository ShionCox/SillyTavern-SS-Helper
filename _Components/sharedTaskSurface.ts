import sharedTaskSurfaceCssText from './sharedTaskSurface.css?inline';
import type { TaskPresentationConfig, TaskQueueSnapshot, TaskVisualState } from '../SDK/stx';
import {
    buildSharedTaskQueueSnapshot,
    createSharedTaskQueueState,
    enqueueSharedTaskQueueItem,
    finishSharedTaskQueueItem,
    flushSharedTaskQueueState,
    type SharedTaskQueueState,
    type TaskQueueItemPatch,
    updateSharedTaskQueueItem,
} from './sharedTaskSurfaceState';
import { mountThemeHost, subscribeTheme } from '../SDK/theme';

const TASK_SURFACE_STYLE_ID = 'stx-shared-task-surface-style';
const TASK_SURFACE_ROOT_ID = 'stx-shared-task-surface-root';
const TASK_SURFACE_RUNTIME_KEY = '__stxSharedTaskSurfaceRuntime';

interface ComposerRuntimeState {
    lockCount: number;
    lastReason: string;
}

interface SharedTaskSurfaceRuntime {
    root: HTMLDivElement;
    overlay: HTMLDivElement;
    toastWrap: HTMLDivElement;
    toast: HTMLDivElement;
}

interface SharedTaskSurfaceGlobalState {
    queue: SharedTaskQueueState;
    composer: ComposerRuntimeState;
    manualComposerLocks: number;
    runtime: SharedTaskSurfaceRuntime | null;
    cleanupTimer: number | null;
    themeUnsubscribe: (() => void) | null;
}

type SharedTaskSurfaceGlobalRef = typeof globalThis & {
    [TASK_SURFACE_RUNTIME_KEY]?: SharedTaskSurfaceGlobalState;
};

/**
 * 功能：转义 HTML 文本。
 * @param input 原始文本。
 * @returns 可安全插入 HTML 的文本。
 */
function escapeHtml(input: string): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：获取全局单例状态。
 * @returns 全局状态对象。
 */
function getGlobalState(): SharedTaskSurfaceGlobalState {
    const globalRef = globalThis as SharedTaskSurfaceGlobalRef;
    if (!globalRef[TASK_SURFACE_RUNTIME_KEY]) {
        globalRef[TASK_SURFACE_RUNTIME_KEY] = {
            queue: createSharedTaskQueueState(),
            composer: {
                lockCount: 0,
                lastReason: '',
            },
            manualComposerLocks: 0,
            runtime: null,
            cleanupTimer: null,
            themeUnsubscribe: null,
        };
    }
    return globalRef[TASK_SURFACE_RUNTIME_KEY] as SharedTaskSurfaceGlobalState;
}

/**
 * 功能：确保样式已挂载。
 * @returns 无返回值。
 */
function ensureStyle(): void {
    if (typeof document === 'undefined') {
        return;
    }
    const current = document.getElementById(TASK_SURFACE_STYLE_ID) as HTMLStyleElement | null;
    if (current) {
        if (current.textContent !== sharedTaskSurfaceCssText) {
            current.textContent = sharedTaskSurfaceCssText;
        }
        return;
    }
    const styleEl = document.createElement('style');
    styleEl.id = TASK_SURFACE_STYLE_ID;
    styleEl.textContent = sharedTaskSurfaceCssText;
    document.head.appendChild(styleEl);
}

/**
 * 功能：确保运行时根节点存在。
 * @returns 运行时根节点。
 */
function ensureRuntime(): SharedTaskSurfaceRuntime | null {
    if (typeof document === 'undefined') {
        return null;
    }
    const state = getGlobalState();
    ensureStyle();
    if (state.runtime?.root?.isConnected) {
        return state.runtime;
    }

    const root = document.createElement('div');
    root.id = TASK_SURFACE_ROOT_ID;
    root.className = 'stx-task-surface-root';
    root.innerHTML = `
        <div class="stx-task-surface-overlay"></div>
        <div class="stx-task-surface-toast-wrap">
            <div class="stx-task-surface-toast"></div>
        </div>
    `;
    document.body.appendChild(root);
    mountThemeHost(root);

    state.runtime = {
        root,
        overlay: root.querySelector('.stx-task-surface-overlay') as HTMLDivElement,
        toastWrap: root.querySelector('.stx-task-surface-toast-wrap') as HTMLDivElement,
        toast: root.querySelector('.stx-task-surface-toast') as HTMLDivElement,
    };

    if (!state.themeUnsubscribe) {
        state.themeUnsubscribe = subscribeTheme((): void => {
            if (state.runtime?.root) {
                mountThemeHost(state.runtime.root);
            }
        });
    }
    return state.runtime;
}

/**
 * 功能：把状态枚举转成中文文案。
 * @param state 任务状态。
 * @returns 中文文案。
 */
function getStateLabel(state: TaskVisualState): string {
    switch (state) {
        case 'pending':
            return '等待执行';
        case 'running':
            return '处理中';
        case 'streaming':
            return '生成中';
        case 'done':
            return '已完成';
        case 'error':
            return '失败';
        default:
            return '处理中';
    }
}

/**
 * 功能：返回任务状态对应的图标 HTML。
 * @param state 任务状态。
 * @returns 图标 HTML。
 */
function getStateIconHtml(state: TaskVisualState): string {
    switch (state) {
        case 'pending':
            return '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>';
        case 'running':
            return '<i class="fa-solid fa-gear fa-spin" aria-hidden="true"></i>';
        case 'streaming':
            return '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';
        case 'done':
            return '<i class="fa-solid fa-check" aria-hidden="true"></i>';
        case 'error':
            return '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        default:
            return '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
    }
}

/**
 * 功能：将剩余毫秒转换为整秒倒计时文本。
 * @param autoCloseAt 自动关闭时间。
 * @param now 当前时间。
 * @returns 倒计时文本；无则返回空。
 */
function getAutoCloseCountdownLabel(autoCloseAt: number | undefined, now: number): string {
    if (!autoCloseAt || autoCloseAt <= now) {
        return '';
    }
    const remainSeconds = Math.max(1, Math.ceil((autoCloseAt - now) / 1000));
    return `${remainSeconds} 秒后自动关闭`;
}

/**
 * 功能：构建队列项列表 HTML。
 * @param snapshot 队列快照。
 * @returns 队列 HTML。
 */
function buildQueueHtml(snapshot: TaskQueueSnapshot): string {
    if (!snapshot.nextTasks.length) {
        return `
            <div class="stx-task-surface-queue stx-task-surface-queue-empty">
                <div class="stx-task-surface-queue-head">
                    <span>当前任务</span>
                    <span>无需排队</span>
                </div>
                <div class="stx-task-surface-toast-note">已轮到当前任务执行，没有后续等待项。</div>
            </div>
        `;
    }
    const itemsHtml = snapshot.nextTasks.slice(0, 3).map((item): string => {
        return `
            <div class="stx-task-surface-queue-item">
                <span>${escapeHtml(item.queueLabel || item.title)}</span>
                <small>${escapeHtml(getStateLabel(item.state))}</small>
            </div>
        `;
    }).join('');
    return `
        <div class="stx-task-surface-queue">
            <div class="stx-task-surface-queue-head">
                <span>接下来还有 ${snapshot.nextTasks.length} 项</span>
                <span>队列中 ${snapshot.pendingCount} 项</span>
            </div>
            <div class="stx-task-surface-queue-list">${itemsHtml}</div>
        </div>
    `;
}

/**
 * 功能：构建全屏卡片 HTML。
 * @param snapshot 队列快照。
 * @returns 卡片 HTML。
 */
function buildOverlayHtml(snapshot: TaskQueueSnapshot): string {
    const task = snapshot.blockingTask;
    if (!task) {
        return '';
    }
    const subtitle = task.description || task.subtitle || 'AI 正在处理当前任务，请稍候。';
    const composerText = snapshot.composerLocked ? '发送输入已暂时锁定' : '界面将在任务完成后恢复';
    return `
        <div class="stx-task-surface-overlay-card">
            <div class="stx-task-surface-card-head">
                <span class="stx-task-surface-kicker">
                    <i class="fa-solid fa-sparkles"></i>
                    <span>需要等待 AI 完成</span>
                </span>
                <div class="stx-task-surface-title">${escapeHtml(task.title)}</div>
                <div class="stx-task-surface-subtitle">${escapeHtml(subtitle)}</div>
                <div class="stx-task-surface-meta">
                    <span class="stx-task-surface-chip ${`stx-task-surface-status-${task.state}`}">${escapeHtml(getStateLabel(task.state))}</span>
                    <span class="stx-task-surface-chip">${escapeHtml(task.source || 'MemoryOS')}</span>
                    <span class="stx-task-surface-chip">${escapeHtml(composerText)}</span>
                </div>
            </div>
            <div class="stx-task-surface-card-body">
                <div class="stx-task-surface-progress"><span></span></div>
                ${buildQueueHtml(snapshot)}
            </div>
        </div>
    `;
}

/**
 * 功能：构建右下角任务卡 HTML。
 * @param snapshot 队列快照。
 * @returns 任务卡 HTML。
 */
function buildToastHtml(snapshot: TaskQueueSnapshot): string {
    const task = snapshot.toastTask;
    if (!task) {
        return '';
    }
    const now = Date.now();
    const stateIconHtml = getStateIconHtml(task.state);
    const nextHtml = snapshot.toastNextTasks.slice(0, 2).map((item): string => {
        return `
            <div class="stx-task-surface-toast-next-item">
                <span>${escapeHtml(item.queueLabel || item.title)}</span>
                <small>${escapeHtml(getStateLabel(item.state))}</small>
            </div>
        `;
    }).join('');
    const description = task.state === 'done'
        ? (task.reason || task.description || task.subtitle || '任务已完成，正在等待自动关闭。')
        : task.state === 'error'
            ? (task.reason || task.description || task.subtitle || '任务执行失败，可稍后重试。')
            : (task.description || task.subtitle || '后台正在处理任务，请稍候。');
    const modeLabel = task.surfaceMode === 'toast_blocking' ? '阻塞' : '后台';
    const lockLabel = snapshot.composerLocked ? '发送区已锁定' : '可继续聊天';
    const countdownLabel = getAutoCloseCountdownLabel(task.autoCloseAt, now);
    const queueChipHtml = snapshot.toastNextTasks.length
        ? `<span class="stx-task-surface-chip">后续 ${snapshot.toastNextTasks.length} 项</span>`
        : task.state === 'pending'
            ? '<span class="stx-task-surface-chip stx-task-surface-chip-muted">即将开始</span>'
            : '<span class="stx-task-surface-chip stx-task-surface-chip-muted">仅当前任务</span>';
    const footerNote = countdownLabel || (snapshot.toastNextTasks.length
        ? '当前任务结束后会自动切换到下一项。'
        : task.state === 'done'
            ? '任务已完成，卡片会自动关闭。'
            : task.state === 'error'
                ? '任务失败，关闭后可重新触发。'
                : task.state === 'pending'
                    ? '任务已进入队列，马上就会开始。'
                    : '当前没有后续等待任务。');
    return `
        <div class="stx-task-surface-toast-main stx-task-surface-toast-main-${escapeHtml(task.state)}">
            <div class="stx-task-surface-toast-head">
                <div style="display:flex; flex-direction:column; gap:6px; min-width:0;">
                    <div class="stx-task-surface-toast-title-wrap">
                        <span class="stx-task-surface-toast-state-icon stx-task-surface-status-${escapeHtml(task.state)}">${stateIconHtml}</span>
                        <div class="stx-task-surface-toast-title">${escapeHtml(task.title)}</div>
                    </div>
                    <div class="stx-task-surface-toast-desc">${escapeHtml(description)}</div>
                </div>
                <span class="stx-task-surface-toast-badge ${`stx-task-surface-status-${task.state}`}">${stateIconHtml}<span>${escapeHtml(getStateLabel(task.state))}</span></span>
            </div>
            <div class="stx-task-surface-meta">
                <span class="stx-task-surface-chip">${escapeHtml(modeLabel)}</span>
                <span class="stx-task-surface-chip">${escapeHtml(lockLabel)}</span>
                ${queueChipHtml}
                ${countdownLabel ? `<span class="stx-task-surface-chip stx-task-surface-chip-countdown">${escapeHtml(countdownLabel)}</span>` : ''}
            </div>
            <div class="stx-task-surface-progress stx-task-surface-progress-${escapeHtml(task.state)}"><span></span></div>
            ${snapshot.toastNextTasks.length ? `
                <div class="stx-task-surface-toast-next">
                    <div class="stx-task-surface-toast-next-label">接下来</div>
                    ${nextHtml}
                </div>
            ` : `<div class="stx-task-surface-toast-note">${escapeHtml(footerNote)}</div>`}
        </div>
    `;
}

/**
 * 功能：应用发送区锁定状态。
 * @param snapshot 队列快照。
 * @returns 无返回值。
 */
function applyComposerLock(snapshot: TaskQueueSnapshot): void {
    if (typeof document === 'undefined') {
        return;
    }
    const form = document.getElementById('send_form') as HTMLFormElement | null;
    const sendButton = document.getElementById('send_but') as HTMLButtonElement | null;
    const textarea = document.getElementById('send_textarea') as HTMLTextAreaElement | null;
    if (!form || !sendButton || !textarea) {
        return;
    }

    if (snapshot.composerLocked) {
        form.classList.add('stx-task-composer-locked');
        form.setAttribute('data-stx-task-locked', 'true');
        form.setAttribute('aria-busy', 'true');
        if (!sendButton.disabled) {
            sendButton.dataset.stxTaskLockedBy = 'true';
            sendButton.disabled = true;
        }
        if (!textarea.readOnly) {
            textarea.dataset.stxTaskLockedBy = 'true';
            textarea.readOnly = true;
        }
        textarea.setAttribute('aria-disabled', 'true');
        return;
    }

    form.classList.remove('stx-task-composer-locked');
    form.removeAttribute('data-stx-task-locked');
    form.removeAttribute('aria-busy');
    if (sendButton.dataset.stxTaskLockedBy === 'true') {
        sendButton.disabled = false;
        delete sendButton.dataset.stxTaskLockedBy;
    }
    if (textarea.dataset.stxTaskLockedBy === 'true') {
        textarea.readOnly = false;
        delete textarea.dataset.stxTaskLockedBy;
    }
    textarea.removeAttribute('aria-disabled');
}

/**
 * 功能：安排下一次自动清理。
 * @param snapshot 队列快照。
 * @returns 无返回值。
 */
function scheduleCleanup(snapshot: TaskQueueSnapshot): void {
    const state = getGlobalState();
    if (state.cleanupTimer !== null) {
        window.clearTimeout(state.cleanupTimer);
        state.cleanupTimer = null;
    }
    const now = Date.now();
    const nextAutoCloseAt = snapshot.items
        .map((item) => item.autoCloseAt || 0)
        .filter((time) => time > now)
        .sort((left, right) => left - right)[0];
    if (!nextAutoCloseAt) {
        return;
    }
    const toastCountdownDelay = snapshot.toastTask?.autoCloseAt && snapshot.toastTask.autoCloseAt > now
        ? Math.min(1000, Math.max(120, snapshot.toastTask.autoCloseAt - now))
        : Number.POSITIVE_INFINITY;
    state.cleanupTimer = window.setTimeout((): void => {
        state.cleanupTimer = null;
        renderSharedTaskSurface();
    }, Math.min(Math.max(60, nextAutoCloseAt - now), toastCountdownDelay));
}

/**
 * 功能：渲染共享任务显示层。
 * @returns 当前任务快照。
 */
export function renderSharedTaskSurface(): TaskQueueSnapshot {
    const state = getGlobalState();
    const runtime = ensureRuntime();
    const snapshot = buildSharedTaskQueueSnapshot(state.queue, state.manualComposerLocks);
    if (!runtime) {
        return snapshot;
    }

    runtime.overlay.innerHTML = buildOverlayHtml(snapshot);
    runtime.overlay.classList.toggle('is-visible', snapshot.fullscreenVisible);
    runtime.toast.innerHTML = buildToastHtml(snapshot);
    runtime.toastWrap.classList.toggle('is-visible', snapshot.toastVisible);
    runtime.toastWrap.setAttribute('data-task-state', snapshot.toastTask?.state || 'hidden');
    runtime.toastWrap.setAttribute('data-task-active', snapshot.toastTask && (snapshot.toastTask.state === 'pending' || snapshot.toastTask.state === 'running' || snapshot.toastTask.state === 'streaming') ? 'true' : 'false');

    applyComposerLock(snapshot);
    scheduleCleanup(snapshot);
    return snapshot;
}

/**
 * 功能：入队一个任务展示。
 * @param config 展示配置。
 * @returns 请求标识。
 */
export function enqueueTaskPresentation(config: TaskPresentationConfig): string {
    const state = getGlobalState();
    const requestId = enqueueSharedTaskQueueItem(state.queue, config);
    renderSharedTaskSurface();
    return requestId;
}

/**
 * 功能：更新任务展示内容。
 * @param requestId 请求标识。
 * @param patch 更新补丁。
 * @returns 是否更新成功。
 */
export function updateTaskPresentation(requestId: string, patch: TaskQueueItemPatch): boolean {
    const state = getGlobalState();
    const updated = updateSharedTaskQueueItem(state.queue, requestId, patch);
    if (updated) {
        renderSharedTaskSurface();
    }
    return updated;
}

/**
 * 功能：结束任务展示。
 * @param requestId 请求标识。
 * @param finalState 最终状态。
 * @param patch 收尾补丁。
 * @returns 是否结束成功。
 */
export function finishTaskPresentation(
    requestId: string,
    finalState: Extract<TaskVisualState, 'done' | 'error'>,
    patch: TaskQueueItemPatch = {},
): boolean {
    const state = getGlobalState();
    const updated = finishSharedTaskQueueItem(state.queue, requestId, finalState, patch);
    if (updated) {
        renderSharedTaskSurface();
    }
    return updated;
}

/**
 * 功能：读取当前任务队列快照。
 * @returns 队列快照。
 */
export function getTaskQueueSnapshot(): TaskQueueSnapshot {
    const state = getGlobalState();
    return buildSharedTaskQueueSnapshot(state.queue, state.manualComposerLocks);
}

/**
 * 功能：手动锁定发送区。
 * @param reason 锁定原因。
 * @returns 当前锁定计数。
 */
export function lockComposer(reason: string): number {
    const state = getGlobalState();
    state.manualComposerLocks += 1;
    state.composer.lastReason = reason;
    const snapshot = renderSharedTaskSurface();
    state.composer.lockCount = snapshot.composerLockCount;
    return state.composer.lockCount;
}

/**
 * 功能：解除一次手动发送区锁定。
 * @returns 当前锁定计数。
 */
export function unlockComposer(): number {
    const state = getGlobalState();
    state.manualComposerLocks = Math.max(0, state.manualComposerLocks - 1);
    const snapshot = renderSharedTaskSurface();
    state.composer.lockCount = snapshot.composerLockCount;
    return state.composer.lockCount;
}

/**
 * 功能：立即清空已完成且到期的任务并刷新界面。
 * @returns 无返回值。
 */
export function flushTaskPresentationSurface(): void {
    const state = getGlobalState();
    flushSharedTaskQueueState(state.queue);
    renderSharedTaskSurface();
}
