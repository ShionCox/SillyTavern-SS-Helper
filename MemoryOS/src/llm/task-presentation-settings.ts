import type { TaskPresentationConfig, TaskSurfaceMode } from '../../../SDK/stx';
import type {
    MemoryTaskPresentationSettings,
    MemoryTaskPresentationTaskId,
    MemoryTaskPresentationPreset,
} from '../types';
import { DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS } from '../types';

const SETTINGS_NAMESPACE = 'stx_memory_os';

export const MEMORY_TASK_PRESENTATION_TASK_ORDER: MemoryTaskPresentationTaskId[] = [
    'memory.summarize',
    'memory.extract',
    'world.template.build',
    'memory.vector.embed',
    'memory.search.rerank',
];

export const TASK_SURFACE_MODE_OPTIONS: Array<{ value: TaskSurfaceMode; label: string }> = [
    { value: 'fullscreen_blocking', label: '全屏阻塞' },
    { value: 'toast_blocking', label: 'Toast 阻塞' },
    { value: 'toast_background', label: 'Toast 后台' },
];

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
 * 功能：获取任务的人类可读标签。
 * @param taskId 任务标识。
 * @returns 对应中文标签。
 */
export function getMemoryTaskPresentationLabel(taskId: MemoryTaskPresentationTaskId): string {
    return DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.presets[taskId]?.label || taskId;
}

/**
 * 功能：把任意输入归一化为合法的任务展示设置。
 * @param value 原始设置值。
 * @returns 归一化后的任务展示设置。
 */
export function normalizeMemoryTaskPresentationSettings(value: unknown): MemoryTaskPresentationSettings {
    const raw = (value && typeof value === 'object') ? value as Partial<MemoryTaskPresentationSettings> : {};
    const rawBlockingDefaultMode = (raw as { blockingDefaultMode?: unknown }).blockingDefaultMode;
    const blockingDefaultMode = isTaskSurfaceMode(rawBlockingDefaultMode) && rawBlockingDefaultMode !== 'toast_background'
        ? rawBlockingDefaultMode
        : DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.blockingDefaultMode;

    const presets = MEMORY_TASK_PRESENTATION_TASK_ORDER.reduce<Record<MemoryTaskPresentationTaskId, MemoryTaskPresentationPreset>>(
        (acc: Record<MemoryTaskPresentationTaskId, MemoryTaskPresentationPreset>, taskId: MemoryTaskPresentationTaskId) => {
            const defaultPreset = DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.presets[taskId];
            const nextPreset = raw.presets?.[taskId];
            acc[taskId] = {
                taskId,
                label: String(nextPreset?.label || defaultPreset.label || taskId),
                surfaceMode: isTaskSurfaceMode(nextPreset?.surfaceMode) ? nextPreset.surfaceMode : defaultPreset.surfaceMode,
            };
            return acc;
        },
        {} as Record<MemoryTaskPresentationTaskId, MemoryTaskPresentationPreset>,
    );

    return {
        blockingDefaultMode,
        showBackgroundToast: raw.showBackgroundToast !== false,
        disableComposerDuringBlocking: raw.disableComposerDuringBlocking !== false,
        toastAutoCloseSeconds: normalizeAutoCloseSeconds(
            (raw as { toastAutoCloseSeconds?: unknown }).toastAutoCloseSeconds,
            DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.toastAutoCloseSeconds,
        ),
        presets,
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
    taskId: MemoryTaskPresentationTaskId;
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
    const preset = settings.presets[options.taskId] || DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.presets[options.taskId];
    let surfaceMode = options.surfaceMode || preset.surfaceMode;
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
