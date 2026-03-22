import type { TaskPresentationConfig, TaskSurfaceMode } from '../../../SDK/stx';
import type { MemoryTaskPresentationSettings } from '../types';
import { DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS } from '../types';

const SETTINGS_NAMESPACE = 'stx_memory_os';

type StSettingsContext = {
    extensionSettings?: Record<string, Record<string, unknown>>;
} | null;

/**
 * 功能：读取当前酒馆上下文。
 * @returns 当前上下文或空值。
 */
function getStContext(): StSettingsContext {
    return (window as unknown as {
        SillyTavern?: { getContext?: () => StSettingsContext };
    }).SillyTavern?.getContext?.() || null;
}

/**
 * 功能：判断展示模式是否有效。
 * @param value 待判断的值。
 * @returns 是否为支持的展示模式。
 */
function isTaskSurfaceMode(value: unknown): value is TaskSurfaceMode {
    return value === 'fullscreen_blocking' || value === 'toast_blocking' || value === 'toast_background';
}

/**
 * 功能：把任意数字归一化到可接受的秒数范围内。
 * @param value 原始值。
 * @param fallback 回退值。
 * @returns 合法秒数。
 */
function normalizeAutoCloseSeconds(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(0, Math.min(30, Math.round(parsed)));
}

/**
 * 功能：把任意输入归一化为合法的任务展示设置。
 * @param value 原始设置值。
 * @returns 归一化后的任务展示设置。
 */
export function normalizeMemoryTaskPresentationSettings(value: unknown): MemoryTaskPresentationSettings {
    const raw = (value && typeof value === 'object') ? value as Partial<MemoryTaskPresentationSettings> : {};
    const rawBlockingDefaultMode = (raw as { blockingDefaultMode?: unknown }).blockingDefaultMode;
    const blockingDefaultMode: Extract<TaskSurfaceMode, 'fullscreen_blocking' | 'toast_blocking'> =
        isTaskSurfaceMode(rawBlockingDefaultMode) && rawBlockingDefaultMode !== 'toast_background'
        ? rawBlockingDefaultMode
        : DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.blockingDefaultMode as Extract<TaskSurfaceMode, 'fullscreen_blocking' | 'toast_blocking'>;

    return {
        blockingDefaultMode,
        showBackgroundToast: raw.showBackgroundToast !== false,
        disableComposerDuringBlocking: raw.disableComposerDuringBlocking !== false,
        toastAutoCloseSeconds: normalizeAutoCloseSeconds(
            (raw as { toastAutoCloseSeconds?: unknown }).toastAutoCloseSeconds,
            DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.toastAutoCloseSeconds,
        ),
        updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
}

/**
 * 功能：从酒馆设置中读取任务展示配置。
 * @returns 当前生效的任务展示配置。
 */
export function readMemoryTaskPresentationSettings(): MemoryTaskPresentationSettings {
    const ctx = getStContext();
    const raw = ctx?.extensionSettings?.[SETTINGS_NAMESPACE]?.taskPresentationSettings;
    return normalizeMemoryTaskPresentationSettings(raw);
}

export interface MemoryTaskPresentationRuntimeOptions {
    taskId: string;
    title: string;
    subtitle?: string;
    description?: string;
    source?: string;
    queueLabel?: string;
    dedupeVisualKey?: string;
    surfaceMode?: TaskSurfaceMode;
    showToast?: boolean;
    disableComposer?: boolean;
    autoCloseMs?: number;
    errorHoldMs?: number;
    meta?: Record<string, unknown>;
}

/**
 * 功能：根据设置与覆盖项生成任务展示配置。
 * @param options 运行时任务信息。
 * @returns 适合共享任务底座使用的展示配置。
 */
export function resolveMemoryTaskPresentationConfig(
    options: MemoryTaskPresentationRuntimeOptions,
): TaskPresentationConfig {
    const settings = readMemoryTaskPresentationSettings();
    let surfaceMode = options.surfaceMode;
    if (surfaceMode !== 'toast_background' && surfaceMode !== 'fullscreen_blocking' && surfaceMode !== 'toast_blocking') {
        surfaceMode = settings.blockingDefaultMode;
    }
    const isBlocking = surfaceMode !== 'toast_background';
    const showToast = typeof options.showToast === 'boolean'
        ? options.showToast
        : (surfaceMode === 'toast_background' ? settings.showBackgroundToast : surfaceMode === 'toast_blocking');
    const disableComposer = typeof options.disableComposer === 'boolean'
        ? options.disableComposer
        : (isBlocking ? settings.disableComposerDuringBlocking : false);

    return {
        taskId: options.taskId,
        title: options.title,
        subtitle: options.subtitle,
        description: options.description,
        source: options.source || 'MemoryOS',
        surfaceMode,
        disableComposer,
        showToast,
        queueLabel: options.queueLabel,
        dedupeVisualKey: options.dedupeVisualKey,
        autoCloseMs: typeof options.autoCloseMs === 'number' ? options.autoCloseMs : settings.toastAutoCloseSeconds * 1000,
        errorHoldMs: typeof options.errorHoldMs === 'number' ? options.errorHoldMs : settings.toastAutoCloseSeconds * 1000,
        meta: options.meta,
    };
}
