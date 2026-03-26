import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { normalizeRecordFilterSettings } from '../../core/record-filter';
import {
    DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS,
    type MemoryTaskPresentationSettings,
} from '../../types';
import { normalizeMemoryTaskPresentationSettings } from '../../llm/task-presentation-settings';
import {
    normalizeInjectionPromptSettings,
    type InjectionPromptSettings,
} from '../../injection/injection-prompt-settings';

export type MemorySettingsRecord = Record<string, unknown>;

export type STContextSnapshot = {
    extensionSettings?: Record<string, MemorySettingsRecord>;
    saveSettingsDebounced?: () => void;
} | null;

const SETTINGS_NAMESPACE = 'stx_memory_os';

/**
 * 功能：读取当前 SillyTavern 上下文。
 * @returns 上下文对象或空值。
 */
export function getStContext(): STContextSnapshot {
    return (window as Window & {
        SillyTavern?: {
            getContext?: () => STContextSnapshot;
        };
    }).SillyTavern?.getContext?.() || null;
}

/**
 * 功能：确保 MemoryOS 设置对象存在并返回引用。
 * @param ctx 当前上下文。
 * @returns 设置对象。
 */
export function ensureMemorySettings(ctx: STContextSnapshot): MemorySettingsRecord {
    if (!ctx) {
        return {};
    }
    if (!ctx.extensionSettings) {
        ctx.extensionSettings = {};
    }
    const currentSettings = ctx.extensionSettings[SETTINGS_NAMESPACE];
    if (currentSettings && typeof currentSettings === 'object') {
        return currentSettings;
    }
    const created: MemorySettingsRecord = {};
    ctx.extensionSettings[SETTINGS_NAMESPACE] = created;
    return created;
}

/**
 * 功能：读取布尔配置。
 * @param settingKey 配置键名。
 * @returns 配置值。
 */
export function readSettingBoolean(settingKey: string): boolean {
    const ctx = getStContext();
    const settings = ensureMemorySettings(ctx);
    return settings[settingKey] === true;
}

/**
 * 功能：读取数字配置。
 * @param settingKey 配置键名。
 * @param defaultValue 默认值。
 * @returns 配置值。
 */
export function readSettingNumber(settingKey: string, defaultValue: number): number {
    const ctx = getStContext();
    const settings = ensureMemorySettings(ctx);
    const parsedValue = Number(settings[settingKey]);
    return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}

/**
 * 功能：同步卡片启用样式。
 * @param cardId 卡片根节点 ID。
 * @param isEnabled 是否启用。
 * @returns 无返回值。
 */
export function syncCardDisabledState(cardId: string, isEnabled: boolean): void {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) {
        return;
    }
    cardEl.classList.toggle('is-card-disabled', !isEnabled);
}

/**
 * 功能：绑定布尔开关配置。
 * @param toggleId 控件 ID。
 * @param settingKey 配置键名。
 * @param onToggleCallback 变更回调。
 * @returns 无返回值。
 */
export function bindToggle(
    toggleId: string,
    settingKey: string,
    onToggleCallback?: (value: boolean) => void,
): void {
    const toggleEl = document.getElementById(toggleId) as HTMLInputElement | null;
    if (!toggleEl) {
        return;
    }
    toggleEl.checked = readSettingBoolean(settingKey);
    toggleEl.addEventListener('change', (): void => {
        const currentContext = getStContext();
        if (currentContext) {
            const currentSettings = ensureMemorySettings(currentContext);
            currentSettings[settingKey] = toggleEl.checked;
            currentContext.saveSettingsDebounced?.();
        }
        onToggleCallback?.(toggleEl.checked);
    });
}

/**
 * 功能：绑定数字输入配置。
 * @param inputId 控件 ID。
 * @param settingKey 配置键名。
 * @param defaultValue 默认值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 无返回值。
 */
export function bindNumberInput(
    inputId: string,
    settingKey: string,
    defaultValue: number,
    min: number,
    max: number,
): void {
    const inputEl = document.getElementById(inputId) as HTMLInputElement | null;
    if (!inputEl) {
        return;
    }
    inputEl.value = String(readSettingNumber(settingKey, defaultValue));
    const persist = (): void => {
        const rawValue = Number(inputEl.value);
        const safeValue = Math.min(max, Math.max(min, Number.isFinite(rawValue) ? rawValue : defaultValue));
        inputEl.value = String(safeValue);
        const currentContext = getStContext();
        if (!currentContext) {
            return;
        }
        const currentSettings = ensureMemorySettings(currentContext);
        currentSettings[settingKey] = safeValue;
        currentContext.saveSettingsDebounced?.();
    };
    inputEl.addEventListener('change', persist);
    inputEl.addEventListener('blur', persist);
}

/**
 * 功能：读取任务展示配置。
 * @returns 当前任务展示配置。
 */
export function readTaskPresentationSettings(): MemoryTaskPresentationSettings {
    const ctx = getStContext();
    const settings = ensureMemorySettings(ctx);
    return normalizeMemoryTaskPresentationSettings(settings.taskPresentationSettings || {});
}

/**
 * 功能：保存任务展示配置。
 * @param nextSettings 新配置。
 * @returns 归一化后的配置。
 */
export function saveTaskPresentationSettings(nextSettings: MemoryTaskPresentationSettings): MemoryTaskPresentationSettings {
    const normalized = normalizeMemoryTaskPresentationSettings(nextSettings);
    const ctx = getStContext();
    if (!ctx) {
        return normalized;
    }
    const settings = ensureMemorySettings(ctx);
    settings.taskPresentationSettings = normalized;
    ctx.saveSettingsDebounced?.();
    return normalized;
}

/**
 * 功能：读取任务展示模式值。
 * @param inputId 控件 ID。
 * @param fallback 默认值。
 * @returns 合法的展示模式。
 */
export function readTaskSurfaceModeValue(
    inputId: string,
    fallback: 'fullscreen_blocking' | 'toast_blocking' | 'toast_background',
): 'fullscreen_blocking' | 'toast_blocking' | 'toast_background' {
    const element = document.getElementById(inputId) as HTMLSelectElement | null;
    const value = String(element?.value || '').trim();
    if (value === 'fullscreen_blocking' || value === 'toast_blocking' || value === 'toast_background') {
        return value;
    }
    return fallback;
}

/**
 * 功能：把任务展示配置写回表单。
 * @param ids 控件 ID 集合。
 * @param settings 任务展示配置。
 * @param refreshSharedSelectOptions 刷新共享下拉的方法。
 * @returns 无返回值。
 */
export function writeTaskPresentationInputs(
    ids: MemoryOSSettingsIds,
    settings: MemoryTaskPresentationSettings,
    refreshSharedSelectOptions: (root: HTMLElement) => void,
): void {
    const backgroundToastEl = document.getElementById(ids.taskSurfaceBackgroundToastId) as HTMLInputElement | null;
    const disableComposerEl = document.getElementById(ids.taskSurfaceDisableComposerId) as HTMLInputElement | null;
    const blockingDefaultEl = document.getElementById(ids.taskSurfaceBlockingDefaultId) as HTMLSelectElement | null;
    const autoCloseSecondsEl = document.getElementById(ids.taskSurfaceAutoCloseSecondsId) as HTMLInputElement | null;
    if (backgroundToastEl) {
        backgroundToastEl.checked = settings.showBackgroundToast;
    }
    if (disableComposerEl) {
        disableComposerEl.checked = settings.disableComposerDuringBlocking;
    }
    if (blockingDefaultEl) {
        blockingDefaultEl.value = settings.blockingDefaultMode;
    }
    if (autoCloseSecondsEl) {
        autoCloseSecondsEl.value = String(settings.toastAutoCloseSeconds);
    }
    refreshSharedSelectOptions(document.getElementById(ids.cardId) || document.body);
}

/**
 * 功能：从表单收集任务展示配置。
 * @param ids 控件 ID 集合。
 * @returns 归一化后的配置。
 */
export function collectTaskPresentationSettings(ids: MemoryOSSettingsIds): MemoryTaskPresentationSettings {
    const current = readTaskPresentationSettings();
    const backgroundToastEl = document.getElementById(ids.taskSurfaceBackgroundToastId) as HTMLInputElement | null;
    const disableComposerEl = document.getElementById(ids.taskSurfaceDisableComposerId) as HTMLInputElement | null;
    const autoCloseSecondsEl = document.getElementById(ids.taskSurfaceAutoCloseSecondsId) as HTMLInputElement | null;
    const parsedAutoCloseSeconds = Number(autoCloseSecondsEl?.value);
    return normalizeMemoryTaskPresentationSettings({
        ...current,
        blockingDefaultMode: readTaskSurfaceModeValue(
            ids.taskSurfaceBlockingDefaultId,
            DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.blockingDefaultMode as 'fullscreen_blocking' | 'toast_blocking' | 'toast_background',
        ) as 'fullscreen_blocking' | 'toast_blocking',
        showBackgroundToast: backgroundToastEl?.checked ?? DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.showBackgroundToast,
        disableComposerDuringBlocking: disableComposerEl?.checked ?? DEFAULT_MEMORY_TASK_PRESENTATION_SETTINGS.disableComposerDuringBlocking,
        toastAutoCloseSeconds: Number.isFinite(parsedAutoCloseSeconds)
            ? parsedAutoCloseSeconds
            : current.toastAutoCloseSeconds,
        updatedAt: Date.now(),
    });
}

export type RecordFilterUiSettings = ReturnType<typeof normalizeRecordFilterSettings>;

/**
 * 功能：读取记录过滤配置。
 * @returns 归一化后的配置。
 */
export function readRecordFilterSettings(): RecordFilterUiSettings {
    const ctx = getStContext();
    const settings = ensureMemorySettings(ctx);
    return normalizeRecordFilterSettings(settings.recordFilter || {});
}

/**
 * 功能：保存记录过滤配置。
 * @param nextPartial 待写入的局部配置。
 * @returns 归一化后的配置。
 */
export function saveRecordFilterSettings(nextPartial: Partial<RecordFilterUiSettings>): RecordFilterUiSettings {
    const ctx = getStContext();
    const merged = normalizeRecordFilterSettings({
        ...(readRecordFilterSettings() || {}),
        ...(nextPartial || {}),
    });
    if (!ctx) {
        return merged;
    }
    const settings = ensureMemorySettings(ctx);
    settings.recordFilter = { ...merged };
    ctx.saveSettingsDebounced?.();
    return merged;
}

/**
 * 功能：读取基础注入提示词配置。
 * @returns 归一化后的基础注入提示词配置。
 */
export function readInjectionPromptSettings(): InjectionPromptSettings {
    const ctx = getStContext();
    const settings = ensureMemorySettings(ctx);
    return normalizeInjectionPromptSettings(settings.injectionPromptSettings);
}

/**
 * 功能：保存基础注入提示词配置。
 * @param nextPartial 待写入的局部配置。
 * @returns 归一化后的完整配置。
 */
export function saveInjectionPromptSettings(nextPartial: Partial<InjectionPromptSettings>): InjectionPromptSettings {
    const ctx = getStContext();
    const merged = normalizeInjectionPromptSettings({
        ...(readInjectionPromptSettings() || {}),
        ...(nextPartial || {}),
    });
    if (!ctx) {
        return merged;
    }
    const settings = ensureMemorySettings(ctx);
    settings.injectionPromptSettings = { ...merged };
    ctx.saveSettingsDebounced?.();
    return merged;
}
