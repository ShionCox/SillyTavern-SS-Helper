import type { MemorySummaryTriggerStatus } from '../sdk/memory-sdk';

const SUMMARY_PROGRESS_FLOAT_ID: string = 'stx-memoryos-summary-progress-float';
const SUMMARY_PROGRESS_FLOAT_STYLE_ID: string = 'stx-memoryos-summary-progress-float-style';

type SummaryProgressFloatState = {
    enabled: boolean;
    visible: boolean;
    status: MemorySummaryTriggerStatus | null;
    emptyStateText: string;
    left: number | null;
    top: number | null;
    dragPointerId: number | null;
    dragOffsetX: number;
    dragOffsetY: number;
};

const floatState: SummaryProgressFloatState = {
    enabled: true,
    visible: true,
    status: null,
    emptyStateText: '',
    left: null,
    top: null,
    dragPointerId: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
};

/**
 * 功能：确保总结进度悬浮框样式只注入一次。
 * @returns 无返回值。
 */
function ensureSummaryProgressFloatStyle(): void {
    if (document.getElementById(SUMMARY_PROGRESS_FLOAT_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = SUMMARY_PROGRESS_FLOAT_STYLE_ID;
    style.textContent = `
        #${SUMMARY_PROGRESS_FLOAT_ID} {
            position: fixed;
            right: 14px;
            bottom: 112px;
            width: min(268px, calc(100vw - 16px));
            z-index: 3200;
            color: #f3e7c2;
            font-family: "Noto Serif SC", "STSong", "Georgia", serif;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID}[hidden] {
            display: none !important;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float {
            border: 1px solid rgba(197, 160, 89, 0.32);
            border-radius: 11px;
            background: linear-gradient(180deg, rgba(29, 22, 17, 0.96), rgba(15, 11, 8, 0.95));
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34);
            backdrop-filter: blur(10px);
            overflow: hidden;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 10px 7px;
            border-bottom: 1px solid rgba(197, 160, 89, 0.14);
            cursor: move;
            user-select: none;
            touch-action: none;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__title-wrap {
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__title-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border-radius: 999px;
            background: rgba(208, 159, 86, 0.16);
            color: #f2d58f;
            font-size: 10px;
            flex-shrink: 0;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.03em;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__close {
            border: 1px solid rgba(197, 160, 89, 0.24);
            background: rgba(255, 255, 255, 0.04);
            color: inherit;
            border-radius: 7px;
            width: 22px;
            height: 22px;
            padding: 0;
            cursor: pointer;
            line-height: 1;
            font-size: 12px;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__body {
            display: flex;
            flex-direction: column;
            gap: 7px;
            padding: 9px 10px 10px;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__status {
            font-size: 11px;
            line-height: 1.45;
            opacity: 0.86;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__status.is-ready {
            color: #8fe0ac;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meter {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meter-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            font-size: 11px;
            opacity: 0.82;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meter-prefix {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__inline-icon {
            color: #d09f56;
            font-size: 10px;
            flex-shrink: 0;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__bar {
            position: relative;
            width: 100%;
            height: 7px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
            overflow: hidden;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__bar-fill {
            position: absolute;
            inset: 0 auto 0 0;
            width: 0;
            border-radius: inherit;
            background: linear-gradient(90deg, #d09f56, #f2d58f);
            transition: width 0.22s ease;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__overflow {
            font-size: 10px;
            line-height: 1.4;
            color: #8fe0ac;
            opacity: 0.9;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meta {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 5px;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meta-item {
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
            padding: 5px 7px;
            background: rgba(255, 255, 255, 0.03);
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meta-label {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            opacity: 0.68;
            margin-bottom: 2px;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__meta-value {
            font-size: 12px;
            font-weight: 700;
        }
        #${SUMMARY_PROGRESS_FLOAT_ID} .stx-memory-summary-float__foot {
            font-size: 10px;
            line-height: 1.45;
            opacity: 0.72;
        }
        @media (max-width: 768px) {
            #${SUMMARY_PROGRESS_FLOAT_ID} {
                right: 8px;
                left: 8px;
                width: auto;
                bottom: 100px;
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：限制悬浮框拖拽后的坐标，避免被拖出视口。
 * @param left 目标左侧坐标。
 * @param top 目标顶部坐标。
 * @param root 悬浮框根节点。
 * @returns 限制后的坐标。
 */
function clampFloatPosition(left: number, top: number, root: HTMLDivElement): { left: number; top: number } {
    const margin: number = 8;
    const width = root.offsetWidth || 268;
    const height = root.offsetHeight || 220;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
        left: Math.min(Math.max(left, margin), maxLeft),
        top: Math.min(Math.max(top, margin), maxTop),
    };
}

/**
 * 功能：把当前悬浮框坐标写回到节点样式。
 * @param root 悬浮框根节点。
 * @returns 无返回值。
 */
function applyFloatPosition(root: HTMLDivElement): void {
    if (floatState.left === null || floatState.top === null) {
        root.style.left = '';
        root.style.top = '';
        root.style.right = '';
        root.style.bottom = '';
        return;
    }
    const nextPosition = clampFloatPosition(floatState.left, floatState.top, root);
    floatState.left = nextPosition.left;
    floatState.top = nextPosition.top;
    root.style.left = `${nextPosition.left}px`;
    root.style.top = `${nextPosition.top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
}

/**
 * 功能：结束拖拽状态。
 * @returns 无返回值。
 */
function stopDragging(): void {
    floatState.dragPointerId = null;
}

/**
 * 功能：处理拖拽移动。
 * @param event 指针事件。
 * @returns 无返回值。
 */
function handleFloatPointerMove(event: PointerEvent): void {
    if (floatState.dragPointerId === null || event.pointerId !== floatState.dragPointerId) {
        return;
    }
    const root = ensureSummaryProgressFloatRoot();
    const nextLeft = event.clientX - floatState.dragOffsetX;
    const nextTop = event.clientY - floatState.dragOffsetY;
    const nextPosition = clampFloatPosition(nextLeft, nextTop, root);
    floatState.left = nextPosition.left;
    floatState.top = nextPosition.top;
    applyFloatPosition(root);
}

/**
 * 功能：处理拖拽结束。
 * @param event 指针事件。
 * @returns 无返回值。
 */
function handleFloatPointerEnd(event: PointerEvent): void {
    if (floatState.dragPointerId === null || event.pointerId !== floatState.dragPointerId) {
        return;
    }
    stopDragging();
}

/**
 * 功能：初始化悬浮框根节点并绑定交互。
 * @returns 悬浮框根节点。
 */
function ensureSummaryProgressFloatRoot(): HTMLDivElement {
    ensureSummaryProgressFloatStyle();
    let root = document.getElementById(SUMMARY_PROGRESS_FLOAT_ID) as HTMLDivElement | null;
    if (root) {
        return root;
    }
    root = document.createElement('div');
    root.id = SUMMARY_PROGRESS_FLOAT_ID;
    root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener('click', (event: Event): void => {
        const target = event.target as HTMLElement | null;
        const closeButton = target?.closest<HTMLButtonElement>('[data-memoryos-summary-progress-close="true"]');
        if (!closeButton) {
            return;
        }
        event.preventDefault();
        setMemorySummaryProgressFloatVisible(false);
    });
    root.addEventListener('pointerdown', (event: PointerEvent): void => {
        const target = event.target as HTMLElement | null;
        if (!target || target.closest('[data-memoryos-summary-progress-close="true"]')) {
            return;
        }
        const head = target.closest<HTMLElement>('.stx-memory-summary-float__head');
        if (!head) {
            return;
        }
        const rect = root.getBoundingClientRect();
        floatState.dragPointerId = event.pointerId;
        floatState.dragOffsetX = event.clientX - rect.left;
        floatState.dragOffsetY = event.clientY - rect.top;
        floatState.left = rect.left;
        floatState.top = rect.top;
        applyFloatPosition(root);
        head.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    window.addEventListener('pointermove', handleFloatPointerMove);
    window.addEventListener('pointerup', handleFloatPointerEnd);
    window.addEventListener('pointercancel', handleFloatPointerEnd);
    window.addEventListener('resize', (): void => {
        const currentRoot = document.getElementById(SUMMARY_PROGRESS_FLOAT_ID) as HTMLDivElement | null;
        if (!currentRoot || currentRoot.hidden) {
            return;
        }
        applyFloatPosition(currentRoot);
    });
    return root;
}

/**
 * 功能：构建总结进度状态文案。
 * @param status 当前状态。
 * @returns 状态文本。
 */
function buildStatusText(status: MemorySummaryTriggerStatus): string {
    if (!status.enabled) {
        return '自动总结当前已关闭，可在设置中重新开启。';
    }
    if (status.readyToSummarize) {
        const overflowFloors = Math.max(0, status.progressCurrent - status.progressTarget);
        if (overflowFloors > 0) {
            return `已达到 AI 总结触发条件，且已超出 ${overflowFloors} 楼；下一次生成结束后会自动执行总结。`;
        }
        return '已达到 AI 总结触发条件，下一次生成结束后会自动执行总结。';
    }
    if (status.currentFloorCount < status.summaryMinMessages) {
        return `当前对话共有 ${status.currentFloorCount} 楼，达到 ${status.summaryMinMessages} 楼后才会进入自动总结判定。`;
    }
    return `距离下次 AI 总结还差 ${status.remainingFloors} 楼；上次已总结到第 ${status.lastSummarizedIndex} 楼。`;
}

/**
 * 功能：格式化时间戳。
 * @param timestamp 时间戳。
 * @returns 格式化后的时间文本。
 */
function formatFloatTimestamp(timestamp?: number): string {
    if (!timestamp) {
        return '暂无';
    }
    try {
        return new Date(timestamp).toLocaleString('zh-CN', {
            hour12: false,
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '暂无';
    }
}

/**
 * 功能：渲染悬浮框内容。
 * @returns 无返回值。
 */
function renderSummaryProgressFloat(): void {
    const root = ensureSummaryProgressFloatRoot();
    const status = floatState.status;
    if (!floatState.enabled || !floatState.visible || (!status && !floatState.emptyStateText)) {
        root.hidden = true;
        return;
    }
    root.hidden = false;

    if (!status) {
        root.innerHTML = `
            <div class="stx-memory-summary-float">
                <div class="stx-memory-summary-float__head">
                    <div class="stx-memory-summary-float__title-wrap">
                        <span class="stx-memory-summary-float__title-icon"><i class="fa-solid fa-chart-line"></i></span>
                        <div class="stx-memory-summary-float__title">AI 总结进度</div>
                    </div>
                    <button
                        type="button"
                        class="stx-memory-summary-float__close"
                        data-memoryos-summary-progress-close="true"
                        aria-label="关闭总结进度悬浮框"
                        title="关闭"
                    >×</button>
                </div>
                <div class="stx-memory-summary-float__body">
                    <div class="stx-memory-summary-float__status">${floatState.emptyStateText}</div>
                </div>
            </div>
        `;
        applyFloatPosition(root);
        return;
    }

    const progressPercent = Math.max(0, Math.min(100, Math.round(status.progressRatio * 100)));
    const statusText = buildStatusText(status);
    const displayProgressCurrent = Math.min(status.progressCurrent, status.progressTarget);
    const overflowFloors = Math.max(0, status.progressCurrent - status.progressTarget);

    root.innerHTML = `
        <div class="stx-memory-summary-float">
            <div class="stx-memory-summary-float__head">
                <div class="stx-memory-summary-float__title-wrap">
                    <span class="stx-memory-summary-float__title-icon"><i class="fa-solid fa-chart-line"></i></span>
                    <div class="stx-memory-summary-float__title">AI 总结进度</div>
                </div>
                <button
                    type="button"
                    class="stx-memory-summary-float__close"
                    data-memoryos-summary-progress-close="true"
                    aria-label="关闭总结进度悬浮框"
                    title="关闭"
                >×</button>
            </div>
            <div class="stx-memory-summary-float__body">
                <div class="stx-memory-summary-float__status${status.readyToSummarize ? ' is-ready' : ''}">${statusText}</div>
                <div class="stx-memory-summary-float__meter">
                    <div class="stx-memory-summary-float__meter-label">
                        <span class="stx-memory-summary-float__meter-prefix">
                            <i class="fa-solid fa-bars-progress stx-memory-summary-float__inline-icon"></i>
                            <span>当前进度</span>
                        </span>
                        <span>${displayProgressCurrent} / ${status.progressTarget}</span>
                    </div>
                    <div class="stx-memory-summary-float__bar">
                        <div class="stx-memory-summary-float__bar-fill" style="width:${progressPercent}%"></div>
                    </div>
                    ${overflowFloors > 0 ? `<div class="stx-memory-summary-float__overflow">已超出触发线 ${overflowFloors} 楼</div>` : ''}
                </div>
                <div class="stx-memory-summary-float__meta">
                    <div class="stx-memory-summary-float__meta-item">
                        <div class="stx-memory-summary-float__meta-label"><i class="fa-solid fa-layer-group stx-memory-summary-float__inline-icon"></i><span>当前楼层</span></div>
                        <div class="stx-memory-summary-float__meta-value">${status.currentFloorCount}</div>
                    </div>
                    <div class="stx-memory-summary-float__meta-item">
                        <div class="stx-memory-summary-float__meta-label"><i class="fa-solid fa-bullseye stx-memory-summary-float__inline-icon"></i><span>触发目标</span></div>
                        <div class="stx-memory-summary-float__meta-value">${status.nextTriggerFloor}</div>
                    </div>
                    <div class="stx-memory-summary-float__meta-item">
                        <div class="stx-memory-summary-float__meta-label"><i class="fa-solid fa-bookmark stx-memory-summary-float__inline-icon"></i><span>上次已总结</span></div>
                        <div class="stx-memory-summary-float__meta-value">${status.lastSummarizedIndex}</div>
                    </div>
                    <div class="stx-memory-summary-float__meta-item">
                        <div class="stx-memory-summary-float__meta-label"><i class="fa-solid fa-window-maximize stx-memory-summary-float__inline-icon"></i><span>最近窗口</span></div>
                        <div class="stx-memory-summary-float__meta-value">${status.summaryRecentWindowSize}</div>
                    </div>
                </div>
                <div class="stx-memory-summary-float__foot">
                    最近总结时间：${formatFloatTimestamp(status.lastSummarizedAt)}
                </div>
            </div>
        </div>
    `;
    applyFloatPosition(root);
}

/**
 * 功能：设置悬浮框总开关。
 * @param enabled 是否启用。
 * @returns 无返回值。
 */
export function setMemorySummaryProgressFloatEnabled(enabled: boolean): void {
    floatState.enabled = enabled;
    renderSummaryProgressFloat();
}

/**
 * 功能：更新总结进度悬浮框数据。
 * @param status 当前状态。
 * @param emptyStateText 空状态提示文案。
 * @returns 无返回值。
 */
export function updateMemorySummaryProgressFloat(
    status: MemorySummaryTriggerStatus | null,
    emptyStateText: string = '',
): void {
    floatState.status = status;
    floatState.emptyStateText = String(emptyStateText ?? '').trim();
    renderSummaryProgressFloat();
}

/**
 * 功能：设置悬浮框显示状态。
 * @param visible 是否显示。
 * @returns 无返回值。
 */
export function setMemorySummaryProgressFloatVisible(visible: boolean): void {
    floatState.visible = visible;
    renderSummaryProgressFloat();
}

/**
 * 功能：切换悬浮框显示状态。
 * @returns 切换后的显示状态。
 */
export function toggleMemorySummaryProgressFloatVisible(): boolean {
    floatState.visible = !floatState.visible;
    renderSummaryProgressFloat();
    return floatState.visible;
}
