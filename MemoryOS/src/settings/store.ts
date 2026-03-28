import { createSdkPluginSettingsStore } from '../../../SDK/settings';

export type MemoryOSSettings = {
    enabled: boolean;
    contextMaxTokens: number;
    injectionPromptEnabled: boolean;
    injectionPreviewEnabled: boolean;
    enableEmbedding: boolean;
    summaryIntervalFloors: number;
    retrievalLogEnabled: boolean;
    retrievalLogLevel: 'info' | 'debug';
    retrievalRulePack: 'native' | 'perocore' | 'hybrid';
    retrievalTracePanelEnabled: boolean;
};

export const MEMORY_OS_SETTINGS_NAMESPACE: string = 'stx_memory_os';

export const DEFAULT_MEMORY_OS_SETTINGS: MemoryOSSettings = {
    enabled: true,
    contextMaxTokens: 1200,
    injectionPromptEnabled: true,
    injectionPreviewEnabled: true,
    enableEmbedding: false,
    summaryIntervalFloors: 1,
    retrievalLogEnabled: true,
    retrievalLogLevel: 'info',
    retrievalRulePack: 'hybrid',
    retrievalTracePanelEnabled: true,
};

/**
 * 功能：把未知设置归一化为 MemoryOS 设置结构。
 * @param candidate 原始设置候选值。
 * @returns 归一化后的设置。
 */
export function normalizeMemoryOSSettings(candidate: Partial<MemoryOSSettings>): MemoryOSSettings {
    const contextMaxTokens: number = Math.max(
        200,
        Math.min(10000, Number(candidate.contextMaxTokens) || DEFAULT_MEMORY_OS_SETTINGS.contextMaxTokens),
    );
    const summaryIntervalFloors: number = Math.max(
        1,
        Math.min(200, Math.trunc(Number(candidate.summaryIntervalFloors) || DEFAULT_MEMORY_OS_SETTINGS.summaryIntervalFloors)),
    );
    const retrievalLogLevel = candidate.retrievalLogLevel === 'debug' ? 'debug' : 'info';
    const retrievalRulePack = candidate.retrievalRulePack === 'native'
        || candidate.retrievalRulePack === 'perocore'
        || candidate.retrievalRulePack === 'hybrid'
        ? candidate.retrievalRulePack
        : DEFAULT_MEMORY_OS_SETTINGS.retrievalRulePack;
    return {
        enabled: candidate.enabled !== false,
        contextMaxTokens,
        injectionPromptEnabled: candidate.injectionPromptEnabled !== false,
        injectionPreviewEnabled: candidate.injectionPreviewEnabled !== false,
        enableEmbedding: candidate.enableEmbedding === true,
        summaryIntervalFloors,
        retrievalLogEnabled: candidate.retrievalLogEnabled !== false,
        retrievalLogLevel,
        retrievalRulePack,
        retrievalTracePanelEnabled: candidate.retrievalTracePanelEnabled !== false,
    };
}

const memoryOSSettingsStore = createSdkPluginSettingsStore<MemoryOSSettings>({
    namespace: MEMORY_OS_SETTINGS_NAMESPACE,
    defaults: DEFAULT_MEMORY_OS_SETTINGS,
    normalize: normalizeMemoryOSSettings,
});

/**
 * 功能：读取 MemoryOS 当前设置。
 * @returns 当前设置。
 */
export function readMemoryOSSettings(): MemoryOSSettings {
    return memoryOSSettingsStore.read();
}

/**
 * 功能：写入 MemoryOS 设置。
 * @param patchOrNext 设置补丁或完整设置。
 * @returns 写入后的设置。
 */
export function writeMemoryOSSettings(
    patchOrNext: Partial<MemoryOSSettings> | ((prev: MemoryOSSettings) => MemoryOSSettings),
): MemoryOSSettings {
    return memoryOSSettingsStore.write(patchOrNext);
}

/**
 * 功能：订阅 MemoryOS 设置变化。
 * @param listener 监听回调。
 * @returns 取消订阅函数。
 */
export function subscribeMemoryOSSettings(
    listener: (settings: MemoryOSSettings) => void,
): () => void {
    return memoryOSSettingsStore.subscribe((settings: MemoryOSSettings): void => {
        listener(settings);
    });
}
