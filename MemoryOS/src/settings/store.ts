import { createSdkPluginSettingsStore } from '../../../SDK/settings';

export type MemoryOSSettings = {
    enabled: boolean;
    coldStartEnabled: boolean;
    takeoverEnabled: boolean;
    toolbarQuickActionsEnabled: boolean;
    contextMaxTokens: number;
    injectionPromptEnabled: boolean;
    injectionPreviewEnabled: boolean;
    enableEmbedding: boolean;
    summaryAutoTriggerEnabled: boolean;
    summaryProgressOverlayEnabled: boolean;
    summaryIntervalFloors: number;
    summaryMinMessages: number;
    summaryRecentWindowSize: number;
    summarySecondStageRollingDigestMaxChars: number;
    summarySecondStageCandidateSummaryMaxChars: number;
    takeoverDetectMinFloors: number;
    takeoverDefaultRecentFloors: number;
    takeoverDefaultBatchSize: number;
    takeoverDefaultPrioritizeRecent: boolean;
    takeoverDefaultAutoContinue: boolean;
    takeoverDefaultAutoConsolidate: boolean;
    takeoverDefaultPauseOnError: boolean;
    retrievalLogEnabled: boolean;
    retrievalLogLevel: 'info' | 'debug';
    retrievalRulePack: 'native' | 'perocore' | 'hybrid';
    retrievalTracePanelEnabled: boolean;
};

export const MEMORY_OS_SETTINGS_NAMESPACE: string = 'stx_memory_os';

export const DEFAULT_MEMORY_OS_SETTINGS: MemoryOSSettings = {
    enabled: true,
    coldStartEnabled: true,
    takeoverEnabled: true,
    toolbarQuickActionsEnabled: true,
    contextMaxTokens: 1200,
    injectionPromptEnabled: true,
    injectionPreviewEnabled: true,
    enableEmbedding: false,
    summaryAutoTriggerEnabled: true,
    summaryProgressOverlayEnabled: true,
    summaryIntervalFloors: 1,
    summaryMinMessages: 10,
    summaryRecentWindowSize: 40,
    summarySecondStageRollingDigestMaxChars: 0,
    summarySecondStageCandidateSummaryMaxChars: 0,
    takeoverDetectMinFloors: 50,
    takeoverDefaultRecentFloors: 60,
    takeoverDefaultBatchSize: 30,
    takeoverDefaultPrioritizeRecent: true,
    takeoverDefaultAutoContinue: true,
    takeoverDefaultAutoConsolidate: true,
    takeoverDefaultPauseOnError: true,
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
    const summaryMinMessages: number = Math.max(
        2,
        Math.min(100, Math.trunc(Number(candidate.summaryMinMessages) || DEFAULT_MEMORY_OS_SETTINGS.summaryMinMessages)),
    );
    const summaryRecentWindowSize: number = Math.max(
        10,
        Math.min(100, Math.trunc(Number(candidate.summaryRecentWindowSize) || DEFAULT_MEMORY_OS_SETTINGS.summaryRecentWindowSize)),
    );
    const summarySecondStageRollingDigestMaxCharsRaw = Number(candidate.summarySecondStageRollingDigestMaxChars);
    const summarySecondStageRollingDigestMaxChars: number = summarySecondStageRollingDigestMaxCharsRaw <= 0
        ? 0
        : Math.max(60, Math.min(10000, Math.trunc(summarySecondStageRollingDigestMaxCharsRaw)));
    const summarySecondStageCandidateSummaryMaxCharsRaw = Number(candidate.summarySecondStageCandidateSummaryMaxChars);
    const summarySecondStageCandidateSummaryMaxChars: number = summarySecondStageCandidateSummaryMaxCharsRaw <= 0
        ? 0
        : Math.max(40, Math.min(10000, Math.trunc(summarySecondStageCandidateSummaryMaxCharsRaw)));
    const takeoverDetectMinFloors: number = Math.max(
        10,
        Math.min(2000, Math.trunc(Number(candidate.takeoverDetectMinFloors) || DEFAULT_MEMORY_OS_SETTINGS.takeoverDetectMinFloors)),
    );
    const takeoverDefaultRecentFloors: number = Math.max(
        10,
        Math.min(2000, Math.trunc(Number(candidate.takeoverDefaultRecentFloors) || DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultRecentFloors)),
    );
    const takeoverDefaultBatchSize: number = Math.max(
        1,
        Math.min(500, Math.trunc(Number(candidate.takeoverDefaultBatchSize) || DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultBatchSize)),
    );
    const retrievalLogLevel = candidate.retrievalLogLevel === 'debug' ? 'debug' : 'info';
    const retrievalRulePack = candidate.retrievalRulePack === 'native'
        || candidate.retrievalRulePack === 'perocore'
        || candidate.retrievalRulePack === 'hybrid'
        ? candidate.retrievalRulePack
        : DEFAULT_MEMORY_OS_SETTINGS.retrievalRulePack;
    return {
        enabled: candidate.enabled !== false,
        coldStartEnabled: candidate.coldStartEnabled !== false,
        takeoverEnabled: candidate.takeoverEnabled !== false,
        toolbarQuickActionsEnabled: candidate.toolbarQuickActionsEnabled !== false,
        contextMaxTokens,
        injectionPromptEnabled: candidate.injectionPromptEnabled !== false,
        injectionPreviewEnabled: candidate.injectionPreviewEnabled !== false,
        enableEmbedding: candidate.enableEmbedding === true,
        summaryAutoTriggerEnabled: candidate.summaryAutoTriggerEnabled !== false,
        summaryProgressOverlayEnabled: candidate.summaryProgressOverlayEnabled !== false,
        summaryIntervalFloors,
        summaryMinMessages,
        summaryRecentWindowSize,
        summarySecondStageRollingDigestMaxChars,
        summarySecondStageCandidateSummaryMaxChars,
        takeoverDetectMinFloors,
        takeoverDefaultRecentFloors,
        takeoverDefaultBatchSize,
        takeoverDefaultPrioritizeRecent: candidate.takeoverDefaultPrioritizeRecent !== false,
        takeoverDefaultAutoContinue: candidate.takeoverDefaultAutoContinue !== false,
        takeoverDefaultAutoConsolidate: candidate.takeoverDefaultAutoConsolidate !== false,
        takeoverDefaultPauseOnError: candidate.takeoverDefaultPauseOnError !== false,
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
