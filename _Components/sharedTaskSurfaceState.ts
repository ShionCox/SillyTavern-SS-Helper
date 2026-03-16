import type {
    TaskPresentationConfig,
    TaskQueueItem,
    TaskQueueSnapshot,
    TaskVisualState,
} from '../SDK/stx';

export interface SharedTaskQueueState {
    items: TaskQueueItem[];
    serial: number;
}

export interface TaskQueueItemPatch {
    title?: string;
    subtitle?: string;
    description?: string;
    source?: string;
    state?: TaskVisualState;
    progress?: number;
    queueLabel?: string;
    reason?: string;
    showToast?: boolean;
    disableComposer?: boolean;
    meta?: Record<string, unknown>;
}

const DEFAULT_SUCCESS_HOLD_MS = 1400;
const DEFAULT_ERROR_HOLD_MS = 3600;

/**
 * 功能：创建空任务队列状态。
 * @returns 初始队列状态。
 */
export function createSharedTaskQueueState(): SharedTaskQueueState {
    return {
        items: [],
        serial: 0,
    };
}

/**
 * 功能：判断任务是否仍处于活跃状态。
 * @param item 任务项。
 * @returns 是否活跃。
 */
function isActiveItem(item: TaskQueueItem): boolean {
    return item.state === 'pending' || item.state === 'running' || item.state === 'streaming';
}

/**
 * 功能：判断任务是否仍处于完成后停留展示阶段。
 * @param item 任务项。
 * @param now 当前时间戳。
 * @returns 是否仍可展示。
 */
function isCompletedVisibleItem(item: TaskQueueItem, now: number): boolean {
    return (item.state === 'done' || item.state === 'error')
        && Boolean(item.autoCloseAt && item.autoCloseAt > now);
}

/**
 * 功能：按时间清理已到期的完成任务。
 * @param state 队列状态。
 * @param now 当前时间戳。
 * @returns 是否发生了清理。
 */
export function flushSharedTaskQueueState(state: SharedTaskQueueState, now: number = Date.now()): boolean {
    const nextItems = state.items.filter((item: TaskQueueItem): boolean => {
        return !(item.autoCloseAt && item.autoCloseAt <= now);
    });
    const changed = nextItems.length !== state.items.length;
    if (changed) {
        state.items = nextItems;
    }
    return changed;
}

/**
 * 功能：把展示配置转成任务项。
 * @param state 队列状态。
 * @param config 展示配置。
 * @param now 当前时间戳。
 * @returns 任务项。
 */
function createQueueItem(
    state: SharedTaskQueueState,
    config: TaskPresentationConfig,
    now: number,
): TaskQueueItem {
    state.serial += 1;
    return {
        requestId: config.requestId || `stx-task-${now}-${state.serial}`,
        taskId: config.taskId,
        title: config.title,
        subtitle: config.subtitle,
        description: config.description,
        source: config.source,
        state: config.state || 'running',
        surfaceMode: config.surfaceMode,
        disableComposer: config.disableComposer === true,
        showToast: config.showToast !== false,
        progress: config.progress,
        queueLabel: config.queueLabel,
        dedupeVisualKey: config.dedupeVisualKey,
        createdAt: now,
        updatedAt: now,
        meta: {
            ...(config.meta || {}),
            autoCloseMs: config.autoCloseMs,
            errorHoldMs: config.errorHoldMs,
        },
    };
}

/**
 * 功能：把补丁应用到任务项上。
 * @param item 原任务项。
 * @param patch 补丁。
 * @param now 当前时间戳。
 * @returns 更新后的任务项。
 */
function applyPatchToItem(item: TaskQueueItem, patch: TaskQueueItemPatch, now: number): TaskQueueItem {
    return {
        ...item,
        title: patch.title ?? item.title,
        subtitle: patch.subtitle ?? item.subtitle,
        description: patch.description ?? item.description,
        source: patch.source ?? item.source,
        state: patch.state ?? item.state,
        progress: typeof patch.progress === 'number' ? patch.progress : item.progress,
        queueLabel: patch.queueLabel ?? item.queueLabel,
        reason: patch.reason ?? item.reason,
        showToast: typeof patch.showToast === 'boolean' ? patch.showToast : item.showToast,
        disableComposer: typeof patch.disableComposer === 'boolean' ? patch.disableComposer : item.disableComposer,
        meta: patch.meta ? { ...(item.meta || {}), ...patch.meta } : item.meta,
        updatedAt: now,
    };
}

/**
 * 功能：按去重键查找可复用任务。
 * @param state 队列状态。
 * @param dedupeVisualKey 去重键。
 * @returns 匹配的任务项。
 */
function findReusableItem(
    state: SharedTaskQueueState,
    dedupeVisualKey?: string,
): TaskQueueItem | null {
    if (!dedupeVisualKey) {
        return null;
    }
    const matched = state.items.find((item: TaskQueueItem): boolean => {
        return item.dedupeVisualKey === dedupeVisualKey && (isActiveItem(item) || !item.autoCloseAt);
    });
    return matched || null;
}

/**
 * 功能：入队任务展示项。
 * @param state 队列状态。
 * @param config 展示配置。
 * @param now 当前时间戳。
 * @returns 当前生效的请求标识。
 */
export function enqueueSharedTaskQueueItem(
    state: SharedTaskQueueState,
    config: TaskPresentationConfig,
    now: number = Date.now(),
): string {
    flushSharedTaskQueueState(state, now);
    const reusable = findReusableItem(state, config.dedupeVisualKey);
    if (reusable) {
        const nextItem = applyPatchToItem(reusable, {
            title: config.title,
            subtitle: config.subtitle,
            description: config.description,
            source: config.source,
            state: config.state || reusable.state,
            progress: config.progress,
            queueLabel: config.queueLabel,
            showToast: config.showToast,
            disableComposer: config.disableComposer,
            meta: config.meta,
        }, now);
        state.items = state.items.map((item: TaskQueueItem): TaskQueueItem => item.requestId === reusable.requestId ? nextItem : item);
        return reusable.requestId;
    }
    const nextItem = createQueueItem(state, config, now);
    state.items = [...state.items, nextItem];
    return nextItem.requestId;
}

/**
 * 功能：更新已有任务项。
 * @param state 队列状态。
 * @param requestId 请求标识。
 * @param patch 更新补丁。
 * @param now 当前时间戳。
 * @returns 是否更新成功。
 */
export function updateSharedTaskQueueItem(
    state: SharedTaskQueueState,
    requestId: string,
    patch: TaskQueueItemPatch,
    now: number = Date.now(),
): boolean {
    flushSharedTaskQueueState(state, now);
    let updated = false;
    state.items = state.items.map((item: TaskQueueItem): TaskQueueItem => {
        if (item.requestId !== requestId) {
            return item;
        }
        updated = true;
        return applyPatchToItem(item, patch, now);
    });
    return updated;
}

/**
 * 功能：结束任务并设置保留时长。
 * @param state 队列状态。
 * @param requestId 请求标识。
 * @param finalState 最终状态。
 * @param patch 收尾补丁。
 * @param now 当前时间戳。
 * @returns 是否结束成功。
 */
export function finishSharedTaskQueueItem(
    state: SharedTaskQueueState,
    requestId: string,
    finalState: Extract<TaskVisualState, 'done' | 'error'>,
    patch: TaskQueueItemPatch = {},
    now: number = Date.now(),
): boolean {
    flushSharedTaskQueueState(state, now);
    let updated = false;
    state.items = state.items.map((item: TaskQueueItem): TaskQueueItem => {
        if (item.requestId !== requestId) {
            return item;
        }
        updated = true;
        const baseItem = applyPatchToItem(item, patch, now);
        const holdMs = finalState === 'error'
            ? Number(baseItem.meta?.errorHoldMs ?? DEFAULT_ERROR_HOLD_MS)
            : Number(baseItem.meta?.autoCloseMs ?? DEFAULT_SUCCESS_HOLD_MS);
        const safeHoldMs = Number.isFinite(holdMs) ? Math.max(0, holdMs) : 0;
        return {
            ...baseItem,
            state: finalState,
            completedAt: now,
            updatedAt: now,
            autoCloseAt: safeHoldMs > 0 ? now + safeHoldMs : now,
        };
    });
    flushSharedTaskQueueState(state, now);
    return updated;
}

/**
 * 功能：构建当前队列快照。
 * @param state 队列状态。
 * @param manualComposerLockCount 手动锁定计数。
 * @param now 当前时间戳。
 * @returns 队列快照。
 */
export function buildSharedTaskQueueSnapshot(
    state: SharedTaskQueueState,
    manualComposerLockCount: number = 0,
    now: number = Date.now(),
): TaskQueueSnapshot {
    flushSharedTaskQueueState(state, now);
    const visibleItems = [...state.items].sort((left: TaskQueueItem, right: TaskQueueItem): number => {
        return left.createdAt - right.createdAt;
    });
    const activeItems = visibleItems.filter((item: TaskQueueItem): boolean => isActiveItem(item));
    const visibleToastItems = visibleItems.filter((item: TaskQueueItem): boolean => {
        return item.showToast && (isActiveItem(item) || isCompletedVisibleItem(item, now));
    });
    const currentTask = activeItems[0] || visibleItems[visibleItems.length - 1] || null;
    const blockingTask = activeItems.find((item: TaskQueueItem): boolean => item.surfaceMode !== 'toast_background') || null;
    const toastItems = activeItems.filter((item: TaskQueueItem): boolean => item.showToast);
    const toastTask = toastItems[0] || visibleToastItems[visibleToastItems.length - 1] || null;
    const nextTasks = currentTask
        ? activeItems.filter((item: TaskQueueItem): boolean => item.requestId !== currentTask.requestId)
        : [];
    const toastNextTasks = toastTask
        ? toastItems.filter((item: TaskQueueItem): boolean => item.requestId !== toastTask.requestId)
        : [];
    const blockingCount = activeItems.filter((item: TaskQueueItem): boolean => item.surfaceMode !== 'toast_background').length;
    const backgroundCount = activeItems.filter((item: TaskQueueItem): boolean => item.surfaceMode === 'toast_background').length;
    const composerQueueLocks = activeItems.filter((item: TaskQueueItem): boolean => item.disableComposer).length;
    const composerLockCount = composerQueueLocks + Math.max(0, manualComposerLockCount);

    return {
        items: visibleItems,
        currentTask,
        blockingTask,
        toastTask,
        nextTasks,
        toastNextTasks,
        pendingCount: activeItems.length,
        blockingCount,
        backgroundCount,
        composerLocked: composerLockCount > 0,
        composerLockCount,
        fullscreenVisible: Boolean(blockingTask && blockingTask.surfaceMode === 'fullscreen_blocking'),
        toastVisible: Boolean(toastTask),
    };
}
