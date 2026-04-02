import { createSdkPluginSettingsStore } from '../../../SDK/settings';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import { normalizeRetrievalMode } from '../memory-retrieval/retrieval-mode';

export type MemoryOSSettings = {
    enabled: boolean;
    coldStartEnabled: boolean;
    takeoverEnabled: boolean;
    toolbarQuickActionsEnabled: boolean;
    contextMaxTokens: number;
    injectionPromptEnabled: boolean;
    injectionPreviewEnabled: boolean;
    summaryAutoTriggerEnabled: boolean;
    summaryProgressOverlayEnabled: boolean;
    summaryIntervalFloors: number;
    summaryMinMessages: number;
    summaryRecentWindowSize: number;
    summarySecondStageRollingDigestMaxChars: number;
    summarySecondStageCandidateSummaryMaxChars: number;
    pipelineBudgetEnabled: boolean;
    pipelineMaxInputCharsPerBatch: number;
    pipelineMaxOutputItemsPerBatch: number;
    pipelineMaxActionsPerMutation: number;
    pipelineMaxSectionBatchCount: number;
    pipelineMaxConflictBucketSize: number;
    pipelineMaxSectionDigestChars: number;
    pipelineMaxFinalizerItemsPerDomain: number;
    pipelineStagingRetentionDays: number;
    pipelineResolveOnlyUnresolvedConflicts: boolean;
    takeoverDetectMinFloors: number;
    takeoverDefaultRecentFloors: number;
    takeoverDefaultBatchSize: number;
    takeoverRequestIntervalSeconds: number;
    takeoverSectionDigestBatchCount: number;
    takeoverUseConflictResolver: boolean;
    takeoverMaxConflictItemsPerRun: number;
    takeoverDefaultPrioritizeRecent: boolean;
    takeoverDefaultAutoContinue: boolean;
    takeoverDefaultAutoConsolidate: boolean;
    takeoverDefaultPauseOnError: boolean;
    bootstrapCorePhaseMaxItems: number;
    bootstrapStatePhaseMaxItems: number;
    summaryMaxActionsPerMutationBatch: number;
    summarySplitByActionType: boolean;
    retrievalLogEnabled: boolean;
    retrievalLogLevel: 'info' | 'debug';
    retrievalRulePack: 'native' | 'perocore' | 'hybrid';
    retrievalTracePanelEnabled: boolean;
    /** 检索模式三态 */
    retrievalMode: RetrievalMode;
    /** 默认 topK */
    retrievalDefaultTopK: number;
    /** 默认图扩展深度 */
    retrievalDefaultExpandDepth: number;
    /** 是否启用 PayloadFilter 预过滤 */
    retrievalEnablePayloadFilter: boolean;
    /** 是否启用图扩展 */
    retrievalEnableGraphExpansion: boolean;
    /** 是否启用图扩展热点降权 */
    retrievalEnableGraphPenalty: boolean;
    /** 向量检索 topK */
    vectorTopK: number;
    /** 向量深路径候选窗口 */
    vectorDeepWindow: number;
    /** 向量最终 topK */
    vectorFinalTopK: number;
    /** 是否启用向量策略路由 */
    vectorEnableStrategyRouting: boolean;
    /** 是否启用向量重排序 */
    vectorEnableRerank: boolean;
    /** 重排序候选窗口 */
    vectorRerankWindow: number;
    /** 是否在写入时自动索引向量 */
    vectorAutoIndexOnWrite: boolean;
    /** embedding 模型提示（可选） */
    vectorEmbeddingModel: string;
    /** embedding 版本标识 */
    vectorEmbeddingVersion: string;
    /** 是否启用 LLMHub 模型重排序 */
    vectorEnableLLMHubRerank: boolean;
    /** LLMHub 重排序资源提示 */
    vectorLLMHubRerankResource: string;
    /** LLMHub 重排序模型提示 */
    vectorLLMHubRerankModel: string;
    /** LLMHub 重排序触发最小候选数 */
    vectorLLMHubRerankMinCandidates: number;
    /** LLMHub 重排序最大候选数 */
    vectorLLMHubRerankMaxCandidates: number;
    /** LLMHub 重排序失败时是否回退规则重排 */
    vectorLLMHubRerankFallbackToRule: boolean;
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
    summaryAutoTriggerEnabled: true,
    summaryProgressOverlayEnabled: true,
    summaryIntervalFloors: 1,
    summaryMinMessages: 10,
    summaryRecentWindowSize: 40,
    summarySecondStageRollingDigestMaxChars: 0,
    summarySecondStageCandidateSummaryMaxChars: 0,
    pipelineBudgetEnabled: true,
    pipelineMaxInputCharsPerBatch: 16000,
    pipelineMaxOutputItemsPerBatch: 20,
    pipelineMaxActionsPerMutation: 10,
    pipelineMaxSectionBatchCount: 5,
    pipelineMaxConflictBucketSize: 10,
    pipelineMaxSectionDigestChars: 2000,
    pipelineMaxFinalizerItemsPerDomain: 50,
    pipelineStagingRetentionDays: 7,
    pipelineResolveOnlyUnresolvedConflicts: true,
    takeoverDetectMinFloors: 50,
    takeoverDefaultRecentFloors: 60,
    takeoverDefaultBatchSize: 30,
    takeoverRequestIntervalSeconds: 3,
    takeoverSectionDigestBatchCount: 5,
    takeoverUseConflictResolver: true,
    takeoverMaxConflictItemsPerRun: 10,
    takeoverDefaultPrioritizeRecent: true,
    takeoverDefaultAutoContinue: true,
    takeoverDefaultAutoConsolidate: true,
    takeoverDefaultPauseOnError: true,
    bootstrapCorePhaseMaxItems: 24,
    bootstrapStatePhaseMaxItems: 24,
    summaryMaxActionsPerMutationBatch: 10,
    summarySplitByActionType: true,
    retrievalLogEnabled: true,
    retrievalLogLevel: 'info',
    retrievalRulePack: 'hybrid',
    retrievalTracePanelEnabled: true,
    retrievalMode: 'lexical_only',
    retrievalDefaultTopK: 18,
    retrievalDefaultExpandDepth: 1,
    retrievalEnablePayloadFilter: true,
    retrievalEnableGraphExpansion: true,
    retrievalEnableGraphPenalty: true,
    vectorTopK: 5,
    vectorDeepWindow: 25,
    vectorFinalTopK: 5,
    vectorEnableStrategyRouting: true,
    vectorEnableRerank: true,
    vectorRerankWindow: 25,
    vectorAutoIndexOnWrite: true,
    vectorEmbeddingModel: '',
    vectorEmbeddingVersion: '1',
    vectorEnableLLMHubRerank: false,
    vectorLLMHubRerankResource: '',
    vectorLLMHubRerankModel: '',
    vectorLLMHubRerankMinCandidates: 8,
    vectorLLMHubRerankMaxCandidates: 12,
    vectorLLMHubRerankFallbackToRule: true,
};

/**
 * 功能：根据检索模式解析 QueryContextBuilder 的默认启用状态。
 * 说明：词法模式默认关闭，向量链默认开启，以提升 hybrid / vector_only 的默认体验。
 * @param retrievalMode 当前检索模式。
 * @param explicitFlag 显式设置值。
 * @returns 最终是否启用 QueryContextBuilder。
 */
export function resolveRetrievalEnableQueryContextBuilder(
    retrievalMode: RetrievalMode,
): boolean {
    return retrievalMode === 'vector_only' || retrievalMode === 'hybrid';
}

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
    const pipelineMaxInputCharsPerBatch: number = Math.max(
        1000,
        Math.min(50000, Math.trunc(Number(candidate.pipelineMaxInputCharsPerBatch) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxInputCharsPerBatch)),
    );
    const pipelineMaxOutputItemsPerBatch: number = Math.max(
        1,
        Math.min(200, Math.trunc(Number(candidate.pipelineMaxOutputItemsPerBatch) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxOutputItemsPerBatch)),
    );
    const pipelineMaxActionsPerMutation: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.pipelineMaxActionsPerMutation) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxActionsPerMutation)),
    );
    const pipelineMaxSectionBatchCount: number = Math.max(
        1,
        Math.min(50, Math.trunc(Number(candidate.pipelineMaxSectionBatchCount) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxSectionBatchCount)),
    );
    const pipelineMaxConflictBucketSize: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.pipelineMaxConflictBucketSize) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxConflictBucketSize)),
    );
    const pipelineMaxSectionDigestChars: number = Math.max(
        100,
        Math.min(10000, Math.trunc(Number(candidate.pipelineMaxSectionDigestChars) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxSectionDigestChars)),
    );
    const pipelineMaxFinalizerItemsPerDomain: number = Math.max(
        1,
        Math.min(500, Math.trunc(Number(candidate.pipelineMaxFinalizerItemsPerDomain) || DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxFinalizerItemsPerDomain)),
    );
    const pipelineStagingRetentionDays: number = Math.max(
        1,
        Math.min(365, Math.trunc(Number(candidate.pipelineStagingRetentionDays) || DEFAULT_MEMORY_OS_SETTINGS.pipelineStagingRetentionDays)),
    );
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
    const takeoverRequestIntervalSeconds: number = Math.max(
        0,
        Math.min(600, Math.trunc(Number(candidate.takeoverRequestIntervalSeconds) || DEFAULT_MEMORY_OS_SETTINGS.takeoverRequestIntervalSeconds)),
    );
    const takeoverSectionDigestBatchCount: number = Math.max(
        1,
        Math.min(50, Math.trunc(Number(candidate.takeoverSectionDigestBatchCount) || DEFAULT_MEMORY_OS_SETTINGS.takeoverSectionDigestBatchCount)),
    );
    const takeoverMaxConflictItemsPerRun: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.takeoverMaxConflictItemsPerRun) || DEFAULT_MEMORY_OS_SETTINGS.takeoverMaxConflictItemsPerRun)),
    );
    const bootstrapCorePhaseMaxItems: number = Math.max(
        1,
        Math.min(200, Math.trunc(Number(candidate.bootstrapCorePhaseMaxItems) || DEFAULT_MEMORY_OS_SETTINGS.bootstrapCorePhaseMaxItems)),
    );
    const bootstrapStatePhaseMaxItems: number = Math.max(
        1,
        Math.min(200, Math.trunc(Number(candidate.bootstrapStatePhaseMaxItems) || DEFAULT_MEMORY_OS_SETTINGS.bootstrapStatePhaseMaxItems)),
    );
    const summaryMaxActionsPerMutationBatch: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.summaryMaxActionsPerMutationBatch) || DEFAULT_MEMORY_OS_SETTINGS.summaryMaxActionsPerMutationBatch)),
    );
    const retrievalLogLevel = candidate.retrievalLogLevel === 'debug' ? 'debug' : 'info';
    const retrievalRulePack = candidate.retrievalRulePack === 'native'
        || candidate.retrievalRulePack === 'perocore'
        || candidate.retrievalRulePack === 'hybrid'
        ? candidate.retrievalRulePack
        : DEFAULT_MEMORY_OS_SETTINGS.retrievalRulePack;
    const retrievalMode = normalizeRetrievalMode(candidate.retrievalMode, DEFAULT_MEMORY_OS_SETTINGS.retrievalMode);
    const retrievalDefaultTopK: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.retrievalDefaultTopK) || DEFAULT_MEMORY_OS_SETTINGS.retrievalDefaultTopK)),
    );
    const retrievalDefaultExpandDepth: number = Math.max(
        0,
        Math.min(3, Math.trunc(Number(candidate.retrievalDefaultExpandDepth) || DEFAULT_MEMORY_OS_SETTINGS.retrievalDefaultExpandDepth)),
    );
    const vectorTopK: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.vectorTopK) || DEFAULT_MEMORY_OS_SETTINGS.vectorTopK)),
    );
    const vectorDeepWindow: number = Math.max(
        5,
        Math.min(100, Math.trunc(Number(candidate.vectorDeepWindow) || DEFAULT_MEMORY_OS_SETTINGS.vectorDeepWindow)),
    );
    const vectorFinalTopK: number = Math.max(
        1,
        Math.min(50, Math.trunc(Number(candidate.vectorFinalTopK) || DEFAULT_MEMORY_OS_SETTINGS.vectorFinalTopK)),
    );
    const vectorRerankWindow: number = Math.max(
        5,
        Math.min(100, Math.trunc(Number(candidate.vectorRerankWindow) || DEFAULT_MEMORY_OS_SETTINGS.vectorRerankWindow)),
    );
    const vectorLLMHubRerankMinCandidates: number = Math.max(
        1,
        Math.min(100, Math.trunc(Number(candidate.vectorLLMHubRerankMinCandidates) || DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankMinCandidates)),
    );
    const vectorLLMHubRerankMaxCandidates: number = Math.max(
        vectorLLMHubRerankMinCandidates,
        Math.min(100, Math.trunc(Number(candidate.vectorLLMHubRerankMaxCandidates) || DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankMaxCandidates)),
    );

    return {
        enabled: candidate.enabled !== false,
        coldStartEnabled: candidate.coldStartEnabled !== false,
        takeoverEnabled: candidate.takeoverEnabled !== false,
        toolbarQuickActionsEnabled: candidate.toolbarQuickActionsEnabled !== false,
        contextMaxTokens,
        injectionPromptEnabled: candidate.injectionPromptEnabled !== false,
        injectionPreviewEnabled: candidate.injectionPreviewEnabled !== false,
        summaryAutoTriggerEnabled: candidate.summaryAutoTriggerEnabled !== false,
        summaryProgressOverlayEnabled: candidate.summaryProgressOverlayEnabled !== false,
        summaryIntervalFloors,
        summaryMinMessages,
        summaryRecentWindowSize,
        summarySecondStageRollingDigestMaxChars,
        summarySecondStageCandidateSummaryMaxChars,
        pipelineBudgetEnabled: candidate.pipelineBudgetEnabled !== false,
        pipelineMaxInputCharsPerBatch,
        pipelineMaxOutputItemsPerBatch,
        pipelineMaxActionsPerMutation,
        pipelineMaxSectionBatchCount,
        pipelineMaxConflictBucketSize,
        pipelineMaxSectionDigestChars,
        pipelineMaxFinalizerItemsPerDomain,
        pipelineStagingRetentionDays,
        pipelineResolveOnlyUnresolvedConflicts: candidate.pipelineResolveOnlyUnresolvedConflicts !== false,
        takeoverDetectMinFloors,
        takeoverDefaultRecentFloors,
        takeoverDefaultBatchSize,
        takeoverRequestIntervalSeconds,
        takeoverSectionDigestBatchCount,
        takeoverUseConflictResolver: candidate.takeoverUseConflictResolver !== false,
        takeoverMaxConflictItemsPerRun,
        takeoverDefaultPrioritizeRecent: candidate.takeoverDefaultPrioritizeRecent !== false,
        takeoverDefaultAutoContinue: candidate.takeoverDefaultAutoContinue !== false,
        takeoverDefaultAutoConsolidate: candidate.takeoverDefaultAutoConsolidate !== false,
        takeoverDefaultPauseOnError: candidate.takeoverDefaultPauseOnError !== false,
        bootstrapCorePhaseMaxItems,
        bootstrapStatePhaseMaxItems,
        summaryMaxActionsPerMutationBatch,
        summarySplitByActionType: candidate.summarySplitByActionType !== false,
        retrievalLogEnabled: candidate.retrievalLogEnabled !== false,
        retrievalLogLevel,
        retrievalRulePack,
        retrievalTracePanelEnabled: candidate.retrievalTracePanelEnabled !== false,
        retrievalMode,
        retrievalDefaultTopK,
        retrievalDefaultExpandDepth,
        retrievalEnablePayloadFilter: candidate.retrievalEnablePayloadFilter !== false,
        retrievalEnableGraphExpansion: candidate.retrievalEnableGraphExpansion !== false,
        retrievalEnableGraphPenalty: candidate.retrievalEnableGraphPenalty !== false,
        vectorTopK,
        vectorDeepWindow,
        vectorFinalTopK,
        vectorEnableStrategyRouting: candidate.vectorEnableStrategyRouting !== false,
        vectorEnableRerank: candidate.vectorEnableRerank !== false,
        vectorRerankWindow,
        vectorAutoIndexOnWrite: candidate.vectorAutoIndexOnWrite !== false,
        vectorEmbeddingModel: String(candidate.vectorEmbeddingModel ?? DEFAULT_MEMORY_OS_SETTINGS.vectorEmbeddingModel),
        vectorEmbeddingVersion: String(candidate.vectorEmbeddingVersion ?? DEFAULT_MEMORY_OS_SETTINGS.vectorEmbeddingVersion) || '1',
        vectorEnableLLMHubRerank: candidate.vectorEnableLLMHubRerank === true,
        vectorLLMHubRerankResource: String(candidate.vectorLLMHubRerankResource ?? DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankResource),
        vectorLLMHubRerankModel: String(candidate.vectorLLMHubRerankModel ?? DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankModel),
        vectorLLMHubRerankMinCandidates,
        vectorLLMHubRerankMaxCandidates,
        vectorLLMHubRerankFallbackToRule: candidate.vectorLLMHubRerankFallbackToRule !== false,
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
