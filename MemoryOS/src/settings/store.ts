import { createSdkPluginSettingsStore } from '../../../SDK/settings';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import { normalizeRetrievalMode } from '../memory-retrieval/retrieval-mode';

export type MemoryOSSettings = {
    enabled: boolean;
    coldStartEnabled: boolean;
    takeoverEnabled: boolean;
    toolbarQuickActionsEnabled: boolean;
    dreamEnabled: boolean;
    dreamAutoTriggerEnabled: boolean;
    dreamPromptEnabled: boolean;
    dreamPromptVersion: string;
    dreamPromptStylePreset: string;
    dreamPromptAllowNarrativeExpansion: boolean;
    dreamPromptMaxHighlights: number;
    dreamPromptMaxMutations: number;
    dreamPromptRequireExplain: boolean;
    dreamPromptStrictJson: boolean;
    dreamPromptWeakInferenceOnly: boolean;
    dreamContextMaxChars: number;
    dreamRecentTopK: number;
    dreamMidTopK: number;
    dreamDeepTopK: number;
    dreamFusedMaxItems: number;
    dreamRequireApproval: boolean;
    dreamStylePreset: string;
    dreamWaveEnabled: boolean;
    dreamWaveRecentTopK: number;
    dreamWaveMidTopK: number;
    dreamWaveDeepTopK: number;
    dreamWaveFusionTopK: number;
    dreamGraphEnabled: boolean;
    dreamGraphExpandDepth: number;
    dreamNoveltyEnabled: boolean;
    dreamNoveltyWeight: number;
    dreamRepetitionPenaltyWeight: number;
    dreamDiagnosticsEnabled: boolean;
    dreamSchedulerEnabled: boolean;
    dreamSchedulerCooldownMinutes: number;
    dreamSchedulerDailyMaxRuns: number;
    dreamSchedulerIdleMinutes: number;
    dreamSchedulerAllowGenerationEndedTrigger: boolean;
    dreamSchedulerAllowIdleTrigger: boolean;
    dreamMaintenanceEnabled: boolean;
    dreamMaintenanceMaxProposalsPerRun: number;
    dreamQualityGuardEnabled: boolean;
    dreamAutoApplyLowRiskMaintenance: boolean;
    dreamWorkbenchEnabled: boolean;
    dreamRollbackEnabled: boolean;
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
    /** blur 阈值 */
    retentionBlurThreshold: number;
    /** distorted 阈值 */
    retentionDistortedThreshold: number;
    /** 影子记忆轻度召回惩罚 */
    retentionShadowRetrievalPenaltyMild: number;
    /** 影子记忆重度召回惩罚 */
    retentionShadowRetrievalPenaltyHeavy: number;
    /** 影子记忆轻度置信惩罚 */
    retentionShadowConfidencePenaltyMild: number;
    /** 影子记忆重度置信惩罚 */
    retentionShadowConfidencePenaltyHeavy: number;
    /** 最终结果允许保留的影子记忆条目上限 */
    retentionShadowMaxFinalItems: number;
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
    dreamEnabled: true,
    dreamAutoTriggerEnabled: false,
    dreamPromptEnabled: true,
    dreamPromptVersion: 'v1.0.0',
    dreamPromptStylePreset: 'reflective',
    dreamPromptAllowNarrativeExpansion: true,
    dreamPromptMaxHighlights: 4,
    dreamPromptMaxMutations: 8,
    dreamPromptRequireExplain: true,
    dreamPromptStrictJson: true,
    dreamPromptWeakInferenceOnly: true,
    dreamContextMaxChars: 6000,
    dreamRecentTopK: 10,
    dreamMidTopK: 8,
    dreamDeepTopK: 6,
    dreamFusedMaxItems: 18,
    dreamRequireApproval: true,
    dreamStylePreset: 'reflective',
    dreamWaveEnabled: true,
    dreamWaveRecentTopK: 12,
    dreamWaveMidTopK: 10,
    dreamWaveDeepTopK: 8,
    dreamWaveFusionTopK: 18,
    dreamGraphEnabled: true,
    dreamGraphExpandDepth: 1,
    dreamNoveltyEnabled: true,
    dreamNoveltyWeight: 0.2,
    dreamRepetitionPenaltyWeight: 0.15,
    dreamDiagnosticsEnabled: true,
    dreamSchedulerEnabled: false,
    dreamSchedulerCooldownMinutes: 60,
    dreamSchedulerDailyMaxRuns: 3,
    dreamSchedulerIdleMinutes: 20,
    dreamSchedulerAllowGenerationEndedTrigger: true,
    dreamSchedulerAllowIdleTrigger: true,
    dreamMaintenanceEnabled: true,
    dreamMaintenanceMaxProposalsPerRun: 6,
    dreamQualityGuardEnabled: true,
    dreamAutoApplyLowRiskMaintenance: false,
    dreamWorkbenchEnabled: true,
    dreamRollbackEnabled: true,
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
    retentionBlurThreshold: 72,
    retentionDistortedThreshold: 35,
    retentionShadowRetrievalPenaltyMild: 0.28,
    retentionShadowRetrievalPenaltyHeavy: 0.42,
    retentionShadowConfidencePenaltyMild: 0.22,
    retentionShadowConfidencePenaltyHeavy: 0.38,
    retentionShadowMaxFinalItems: 1,
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
    const dreamContextMaxChars: number = Math.max(
        1000,
        Math.min(30000, Math.trunc(Number(candidate.dreamContextMaxChars) || DEFAULT_MEMORY_OS_SETTINGS.dreamContextMaxChars)),
    );
    const dreamPromptMaxHighlights: number = Math.max(
        1,
        Math.min(8, Math.trunc(Number(candidate.dreamPromptMaxHighlights) || DEFAULT_MEMORY_OS_SETTINGS.dreamPromptMaxHighlights)),
    );
    const dreamPromptMaxMutations: number = Math.max(
        1,
        Math.min(20, Math.trunc(Number(candidate.dreamPromptMaxMutations) || DEFAULT_MEMORY_OS_SETTINGS.dreamPromptMaxMutations)),
    );
    const dreamRecentTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamRecentTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamRecentTopK)),
    );
    const dreamMidTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamMidTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamMidTopK)),
    );
    const dreamDeepTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamDeepTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamDeepTopK)),
    );
    const dreamFusedMaxItems: number = Math.max(
        1,
        Math.min(60, Math.trunc(Number(candidate.dreamFusedMaxItems) || DEFAULT_MEMORY_OS_SETTINGS.dreamFusedMaxItems)),
    );
    const dreamWaveRecentTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamWaveRecentTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamWaveRecentTopK)),
    );
    const dreamWaveMidTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamWaveMidTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamWaveMidTopK)),
    );
    const dreamWaveDeepTopK: number = Math.max(
        1,
        Math.min(30, Math.trunc(Number(candidate.dreamWaveDeepTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamWaveDeepTopK)),
    );
    const dreamWaveFusionTopK: number = Math.max(
        1,
        Math.min(60, Math.trunc(Number(candidate.dreamWaveFusionTopK) || DEFAULT_MEMORY_OS_SETTINGS.dreamWaveFusionTopK)),
    );
    const dreamGraphExpandDepth: number = Math.max(
        0,
        Math.min(3, Math.trunc(Number(candidate.dreamGraphExpandDepth) || DEFAULT_MEMORY_OS_SETTINGS.dreamGraphExpandDepth)),
    );
    const dreamNoveltyWeight: number = clampUnitInterval(
        candidate.dreamNoveltyWeight,
        DEFAULT_MEMORY_OS_SETTINGS.dreamNoveltyWeight,
    );
    const dreamRepetitionPenaltyWeight: number = clampUnitInterval(
        candidate.dreamRepetitionPenaltyWeight,
        DEFAULT_MEMORY_OS_SETTINGS.dreamRepetitionPenaltyWeight,
    );
    const dreamSchedulerCooldownMinutes: number = Math.max(
        1,
        Math.min(1440, Math.trunc(Number(candidate.dreamSchedulerCooldownMinutes) || DEFAULT_MEMORY_OS_SETTINGS.dreamSchedulerCooldownMinutes)),
    );
    const dreamSchedulerDailyMaxRuns: number = Math.max(
        1,
        Math.min(24, Math.trunc(Number(candidate.dreamSchedulerDailyMaxRuns) || DEFAULT_MEMORY_OS_SETTINGS.dreamSchedulerDailyMaxRuns)),
    );
    const dreamSchedulerIdleMinutes: number = Math.max(
        1,
        Math.min(720, Math.trunc(Number(candidate.dreamSchedulerIdleMinutes) || DEFAULT_MEMORY_OS_SETTINGS.dreamSchedulerIdleMinutes)),
    );
    const dreamMaintenanceMaxProposalsPerRun: number = Math.max(
        1,
        Math.min(20, Math.trunc(Number(candidate.dreamMaintenanceMaxProposalsPerRun) || DEFAULT_MEMORY_OS_SETTINGS.dreamMaintenanceMaxProposalsPerRun)),
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
    const legacyCandidate = candidate as Partial<MemoryOSSettings> & Record<string, unknown>;
    const retentionBlurThreshold: number = Math.max(
        1,
        Math.min(99, Math.trunc(Number(candidate.retentionBlurThreshold) || DEFAULT_MEMORY_OS_SETTINGS.retentionBlurThreshold)),
    );
    const retentionDistortedThreshold: number = Math.max(
        1,
        Math.min(
            retentionBlurThreshold - 1,
            Math.trunc(Number(candidate.retentionDistortedThreshold) || DEFAULT_MEMORY_OS_SETTINGS.retentionDistortedThreshold),
        ),
    );
    const retentionShadowRetrievalPenaltyMild: number = clampUnitInterval(
        candidate.retentionShadowRetrievalPenaltyMild ?? legacyCandidate.forgettingShadowRecallPenaltyMild,
        DEFAULT_MEMORY_OS_SETTINGS.retentionShadowRetrievalPenaltyMild,
    );
    const retentionShadowRetrievalPenaltyHeavy: number = clampUnitInterval(
        candidate.retentionShadowRetrievalPenaltyHeavy ?? legacyCandidate.forgettingShadowRecallPenaltyHeavy,
        DEFAULT_MEMORY_OS_SETTINGS.retentionShadowRetrievalPenaltyHeavy,
    );
    const retentionShadowConfidencePenaltyMild: number = clampUnitInterval(
        candidate.retentionShadowConfidencePenaltyMild ?? legacyCandidate.forgettingShadowConfidencePenaltyMild,
        DEFAULT_MEMORY_OS_SETTINGS.retentionShadowConfidencePenaltyMild,
    );
    const retentionShadowConfidencePenaltyHeavy: number = clampUnitInterval(
        candidate.retentionShadowConfidencePenaltyHeavy ?? legacyCandidate.forgettingShadowConfidencePenaltyHeavy,
        DEFAULT_MEMORY_OS_SETTINGS.retentionShadowConfidencePenaltyHeavy,
    );
    const retentionShadowMaxFinalItems: number = Math.max(
        0,
        Math.min(
            10,
            Math.trunc(Number(candidate.retentionShadowMaxFinalItems ?? legacyCandidate.forgettingShadowMaxFinalItems) || DEFAULT_MEMORY_OS_SETTINGS.retentionShadowMaxFinalItems),
        ),
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
        dreamEnabled: candidate.dreamEnabled !== false,
        dreamAutoTriggerEnabled: candidate.dreamAutoTriggerEnabled === true,
        dreamPromptEnabled: candidate.dreamPromptEnabled !== false,
        dreamPromptVersion: String(candidate.dreamPromptVersion ?? DEFAULT_MEMORY_OS_SETTINGS.dreamPromptVersion).trim() || DEFAULT_MEMORY_OS_SETTINGS.dreamPromptVersion,
        dreamPromptStylePreset: String(candidate.dreamPromptStylePreset ?? candidate.dreamStylePreset ?? DEFAULT_MEMORY_OS_SETTINGS.dreamPromptStylePreset).trim() || DEFAULT_MEMORY_OS_SETTINGS.dreamPromptStylePreset,
        dreamPromptAllowNarrativeExpansion: candidate.dreamPromptAllowNarrativeExpansion !== false,
        dreamPromptMaxHighlights,
        dreamPromptMaxMutations,
        dreamPromptRequireExplain: candidate.dreamPromptRequireExplain !== false,
        dreamPromptStrictJson: candidate.dreamPromptStrictJson !== false,
        dreamPromptWeakInferenceOnly: candidate.dreamPromptWeakInferenceOnly !== false,
        dreamContextMaxChars,
        dreamRecentTopK,
        dreamMidTopK,
        dreamDeepTopK,
        dreamFusedMaxItems,
        dreamRequireApproval: candidate.dreamRequireApproval !== false,
        dreamStylePreset: String(candidate.dreamStylePreset ?? candidate.dreamPromptStylePreset ?? DEFAULT_MEMORY_OS_SETTINGS.dreamStylePreset).trim() || DEFAULT_MEMORY_OS_SETTINGS.dreamStylePreset,
        dreamWaveEnabled: candidate.dreamWaveEnabled !== false,
        dreamWaveRecentTopK,
        dreamWaveMidTopK,
        dreamWaveDeepTopK,
        dreamWaveFusionTopK,
        dreamGraphEnabled: candidate.dreamGraphEnabled !== false,
        dreamGraphExpandDepth,
        dreamNoveltyEnabled: candidate.dreamNoveltyEnabled !== false,
        dreamNoveltyWeight,
        dreamRepetitionPenaltyWeight,
        dreamDiagnosticsEnabled: candidate.dreamDiagnosticsEnabled !== false,
        dreamSchedulerEnabled: candidate.dreamSchedulerEnabled === true,
        dreamSchedulerCooldownMinutes,
        dreamSchedulerDailyMaxRuns,
        dreamSchedulerIdleMinutes,
        dreamSchedulerAllowGenerationEndedTrigger: candidate.dreamSchedulerAllowGenerationEndedTrigger !== false,
        dreamSchedulerAllowIdleTrigger: candidate.dreamSchedulerAllowIdleTrigger !== false,
        dreamMaintenanceEnabled: candidate.dreamMaintenanceEnabled !== false,
        dreamMaintenanceMaxProposalsPerRun,
        dreamQualityGuardEnabled: candidate.dreamQualityGuardEnabled !== false,
        dreamAutoApplyLowRiskMaintenance: candidate.dreamAutoApplyLowRiskMaintenance === true,
        dreamWorkbenchEnabled: candidate.dreamWorkbenchEnabled !== false,
        dreamRollbackEnabled: candidate.dreamRollbackEnabled !== false,
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
        retentionBlurThreshold,
        retentionDistortedThreshold,
        retentionShadowRetrievalPenaltyMild,
        retentionShadowRetrievalPenaltyHeavy,
        retentionShadowConfidencePenaltyMild,
        retentionShadowConfidencePenaltyHeavy,
        retentionShadowMaxFinalItems,
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

function clampUnitInterval(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
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
