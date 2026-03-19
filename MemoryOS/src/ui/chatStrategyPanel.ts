import { buildTavernChatScopedKeyEvent, listTavernChatsForCurrentTavernEvent } from '../../../SDK/tavern';
import type { SdkTavernChatLocatorEvent } from '../../../SDK/tavern/types';
import { readSdkPluginChatState } from '../../../SDK/db';
import { toast } from '../index';
import { buildSharedButton } from '../../../_Components/sharedButton';
import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';
import { closeSharedDialog, openSharedDialog } from '../../../_Components/sharedDialog';
import { buildSharedInputField } from '../../../_Components/sharedInput';
import { buildSharedSelectField, hydrateSharedSelects, refreshSharedSelectOptions } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { mountThemeHost, initThemeKernel } from '../../../SDK/theme';
import { db } from '../db/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { ChatStateManager } from '../core/chat-state-manager';
import {
    buildMainlineTraceEvidenceMarkup,
    formatMainlineTraceStatus,
    formatRelativeTime,
} from './mainline-trace-view';
import { openRecordEditor } from './recordEditorNext';
import { buildAdaptivePolicy, buildRetentionPolicy } from '../core/chat-strategy-engine';
import {
    DEFAULT_ADAPTIVE_METRICS,
    DEFAULT_CHAT_LIFECYCLE_STATE,
    DEFAULT_CHAT_PROFILE,
    DEFAULT_EXTRACT_HEALTH,
    DEFAULT_MEMORY_QUALITY,
    DEFAULT_LONG_SUMMARY_COOLDOWN,
    DEFAULT_PROMPT_INJECTION_PROFILE,
    DEFAULT_RETENTION_POLICY,
    DEFAULT_SUMMARY_SETTINGS,
    DEFAULT_VECTOR_LIFECYCLE,
} from '../types';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    ChatMutationKind,
    ChatLifecycleState,
    ChatProfile,
    DeletionStrategy,
    GroupMemoryState,
    MaintenanceActionType,
    MaintenanceAdvice,
    MaintenanceExecutionResult,
    MaintenanceInsight,
    MemoryQualityScorecard,
    MemoryMainlineTraceSnapshot,
    MemoryProcessingDecision,
    PostGenerationGateDecision,
    PreGenerationGateDecision,
    PromptInjectionProfile,
    RetentionPolicy,
    StrategyDecision,
    EffectiveSummarySettings,
    SummaryCooldownPreset,
    SummaryLength,
    SummaryLowValueHandling,
    SummaryMemoryMode,
    SummaryNoiseFilter,
    SummaryProcessInterval,
    SummaryRecordFocus,
    SummaryResourcePriority,
    SummaryScenario,
    SummarySettings,
    SummaryLookbackScope,
    SummarySettingsOverride,
    SummarySettingsSource,
    SummaryTiming,
    SummaryLongTrigger,
    VectorLifecycleState,
    LongSummaryCooldownState,
    ExtractHealthWindow,
} from '../types';

interface ChatOption {
    value: string;
    label: string;
    avatarUrl: string;
    iconClassName?: string;
}

interface ChatStrategySnapshot {
    chatKey: string;
    autoProfile: ChatProfile;
    autoPolicy: AdaptivePolicy;
    autoRetention: RetentionPolicy;
    effectiveProfile: ChatProfile;
    effectivePolicy: AdaptivePolicy;
    effectiveRetention: RetentionPolicy;
    metrics: AdaptiveMetrics;
    vectorLifecycle: VectorLifecycleState;
    memoryQuality: MemoryQualityScorecard;
    maintenanceAdvice: MaintenanceAdvice[];
    maintenanceInsights: MaintenanceInsight[];
    lifecycleState: ChatLifecycleState;
    decision: StrategyDecision | null;
    preDecision: PreGenerationGateDecision | null;
    postDecision: PostGenerationGateDecision | null;
    processingDecision: MemoryProcessingDecision | null;
    longSummaryCooldown: LongSummaryCooldownState;
    summarySettings: SummarySettings;
    summarySettingsOverride: SummarySettingsOverride;
    effectiveSummarySettings: EffectiveSummarySettings;
    summarySettingsSource: SummarySettingsSource;
    extractHealth: ExtractHealthWindow;
    promptInjectionProfile: PromptInjectionProfile;
    groupMemory: GroupMemoryState | null;
    mainlineTraceSnapshot: MemoryMainlineTraceSnapshot | null;
    overrides: Record<string, unknown>;
}

interface ReadableStrategyCard {
    label: string;
    title: string;
    detail: string;
    foot?: string;
    tone?: 'soft' | 'warning' | 'accent';
}

interface ReadableStrategyDashboard {
    meta: string;
    intent: string;
    scope: string;
    role: ReadableStrategyCard;
    world: ReadableStrategyCard;
    relation: ReadableStrategyCard;
    reminder: ReadableStrategyCard;
}

interface MemoryChatStateApi {
    setChatProfileOverride(override: Partial<ChatProfile>): Promise<void>;
    setRetentionPolicyOverride(override: Partial<RetentionPolicy>): Promise<void>;
    getGlobalSummarySettings?(): Promise<SummarySettings>;
    setGlobalSummarySettings?(settings: SummarySettings): Promise<SummarySettings>;
    getChatSummarySettingsOverride?(): Promise<SummarySettingsOverride>;
    setChatSummarySettingsOverride?(override: SummarySettingsOverride): Promise<void>;
    clearChatSummarySettingsOverride?(): Promise<void>;
    getEffectiveSummarySettings?(): Promise<EffectiveSummarySettings>;
    getMaintenanceInsights?(): Promise<MaintenanceInsight[]>;
    getLifecycleState?(): Promise<ChatLifecycleState>;
    runMaintenanceAction?(action: MaintenanceActionType): Promise<MaintenanceExecutionResult>;
    recomputeAdaptivePolicy(): Promise<AdaptivePolicy | void>;
    recomputeMemoryQuality?(): Promise<MemoryQualityScorecard | void>;
    flush(): Promise<void>;
}

type WindowWithMemory = Window & {
    STX?: {
        memory?: {
            getChatKey?: () => string;
            chatState?: MemoryChatStateApi;
        };
    };
};

const PANEL_IDS = {
    rootId: 'stx-memoryos-chat-strategy-panel',
    chatSelectId: 'stx-memoryos-chat-strategy-card-chat',
    summaryNameId: 'stx-memoryos-chat-strategy-summary-name',
    summaryMetaId: 'stx-memoryos-chat-strategy-summary-meta',
    summaryIntentId: 'stx-memoryos-chat-strategy-summary-intent',
    summarySectionsId: 'stx-memoryos-chat-strategy-summary-sections',
    summaryProfileId: 'stx-memoryos-chat-strategy-summary-profile',
    summaryLifecycleId: 'stx-memoryos-chat-strategy-summary-lifecycle',
    summaryMaintenanceId: 'stx-memoryos-chat-strategy-summary-maintenance',
    summaryMaintenanceTextId: 'stx-memoryos-chat-strategy-summary-maintenance-text',
    summaryRoleId: 'stx-memoryos-chat-strategy-summary-role',
    summaryWorldId: 'stx-memoryos-chat-strategy-summary-world',
    summaryRelationId: 'stx-memoryos-chat-strategy-summary-relation',
    summaryReminderId: 'stx-memoryos-chat-strategy-summary-reminder',
    summaryMaintenanceActionId: 'stx-memoryos-chat-strategy-summary-maintenance-action',
    openBtnId: 'stx-memoryos-chat-strategy-open',
    refreshBtnId: 'stx-memoryos-chat-strategy-refresh-card',
} as const;

const EDITOR_IDS = {
    overlayId: 'stx-memoryos-chat-strategy-overlay',
    closeBtnId: 'stx-memoryos-chat-strategy-close',
    mobileToggleBtnId: 'stx-memoryos-chat-strategy-mobile-toggle',
    refreshBtnId: 'stx-memoryos-chat-strategy-editor-refresh',
    recomputeBtnId: 'stx-memoryos-chat-strategy-editor-recompute',
    applyBtnId: 'stx-memoryos-chat-strategy-editor-apply',
    chatSearchId: 'stx-memoryos-chat-strategy-chat-search',
    chatListId: 'stx-memoryos-chat-strategy-chat-list',
    currentChatNameId: 'stx-memoryos-chat-strategy-current-name',
    currentChatMetaId: 'stx-memoryos-chat-strategy-current-meta',
    currentIntentId: 'stx-memoryos-chat-strategy-current-intent',
    currentScopeId: 'stx-memoryos-chat-strategy-current-scope',
    sectionsWrapId: 'stx-memoryos-chat-strategy-current-sections',
    overviewRoleId: 'stx-memoryos-chat-strategy-overview-role',
    overviewWorldId: 'stx-memoryos-chat-strategy-overview-world',
    overviewRelationId: 'stx-memoryos-chat-strategy-overview-relation',
    overviewReminderId: 'stx-memoryos-chat-strategy-overview-reminder',
    summarySettingsMountId: 'stx-memoryos-chat-strategy-summary-settings-mount',
    summarySourceId: 'stx-memoryos-chat-strategy-summary-source',
    summarySaveGlobalBtnId: 'stx-memoryos-chat-strategy-summary-save-global',
    summarySaveChatBtnId: 'stx-memoryos-chat-strategy-summary-save-chat',
    summaryClearChatBtnId: 'stx-memoryos-chat-strategy-summary-clear-chat',
    summaryResetBtnId: 'stx-memoryos-chat-strategy-summary-reset',
    summaryMemoryModeId: 'stx-memoryos-chat-strategy-summary-memory-mode',
    summaryScenarioId: 'stx-memoryos-chat-strategy-summary-scenario',
    summaryResourcePriorityId: 'stx-memoryos-chat-strategy-summary-resource-priority',
    summaryTimingId: 'stx-memoryos-chat-strategy-summary-timing',
    summaryLengthId: 'stx-memoryos-chat-strategy-summary-length',
    summaryCooldownId: 'stx-memoryos-chat-strategy-summary-cooldown',
    summaryLowValueHandlingId: 'stx-memoryos-chat-strategy-summary-low-value',
    summaryNoiseFilterId: 'stx-memoryos-chat-strategy-summary-noise',
    summaryProcessIntervalId: 'stx-memoryos-chat-strategy-summary-process-interval',
    summaryLookbackScopeId: 'stx-memoryos-chat-strategy-summary-lookback',
    summaryFocusFactsId: 'stx-memoryos-chat-strategy-summary-focus-facts',
    summaryFocusRelationshipId: 'stx-memoryos-chat-strategy-summary-focus-relationship',
    summaryFocusWorldId: 'stx-memoryos-chat-strategy-summary-focus-world',
    summaryFocusPlotId: 'stx-memoryos-chat-strategy-summary-focus-plot',
    summaryFocusEmotionId: 'stx-memoryos-chat-strategy-summary-focus-emotion',
    summaryFocusToolResultId: 'stx-memoryos-chat-strategy-summary-focus-tool-result',
    summaryTriggerSceneEndId: 'stx-memoryos-chat-strategy-summary-trigger-scene-end',
    summaryTriggerCombatEndId: 'stx-memoryos-chat-strategy-summary-trigger-combat-end',
    summaryTriggerPlotAdvanceId: 'stx-memoryos-chat-strategy-summary-trigger-plot-advance',
    summaryTriggerRelationshipShiftId: 'stx-memoryos-chat-strategy-summary-trigger-relationship-shift',
    summaryTriggerWorldChangeId: 'stx-memoryos-chat-strategy-summary-trigger-world-change',
    summaryTriggerStructureRepairId: 'stx-memoryos-chat-strategy-summary-trigger-structure-repair',
    summaryTriggerArchiveFinalizeId: 'stx-memoryos-chat-strategy-summary-trigger-archive-finalize',
    summaryLightRelationId: 'stx-memoryos-chat-strategy-summary-light-relation',
    summaryMediumWorldStateId: 'stx-memoryos-chat-strategy-summary-medium-world',
    summaryHeavyRewriteId: 'stx-memoryos-chat-strategy-summary-heavy-rewrite',
    summaryHeavyConsistencyId: 'stx-memoryos-chat-strategy-summary-heavy-consistency',
    summaryHeavyLookbackId: 'stx-memoryos-chat-strategy-summary-heavy-lookback',
    profileRefreshDirectId: 'stx-memoryos-chat-strategy-direct-profile-refresh',
    qualityRefreshDirectId: 'stx-memoryos-chat-strategy-direct-quality-refresh',
    vectorFactsDirectId: 'stx-memoryos-chat-strategy-direct-vector-facts',
    deletionStrategyDirectId: 'stx-memoryos-chat-strategy-direct-delete',
    autoBootstrapSeedId: 'stx-memoryos-chat-strategy-auto-bootstrap-seed',
    groupLaneEnabledId: 'stx-memoryos-chat-strategy-group-lane-enabled',
    chatTypeId: 'stx-memoryos-chat-strategy-chat-type',
    stylePreferenceId: 'stx-memoryos-chat-strategy-style',
    memoryStrengthId: 'stx-memoryos-chat-strategy-memory-strength',
    extractStrategyId: 'stx-memoryos-chat-strategy-extract',
    summaryStrategyId: 'stx-memoryos-chat-strategy-summary',
    deletionStrategyId: 'stx-memoryos-chat-strategy-delete',
    vectorEnabledId: 'stx-memoryos-chat-strategy-vector-enabled',
    vectorChunkThresholdId: 'stx-memoryos-chat-strategy-vector-chunk',
    rerankThresholdId: 'stx-memoryos-chat-strategy-rerank-threshold',
    vectorActivationFactsId: 'stx-memoryos-chat-strategy-vector-activation-facts',
    vectorActivationSummariesId: 'stx-memoryos-chat-strategy-vector-activation-summaries',
    vectorIdleDecayDaysId: 'stx-memoryos-chat-strategy-vector-idle-decay-days',
    vectorLowPrecisionStrideId: 'stx-memoryos-chat-strategy-vector-low-precision-stride',
    keepSummaryCountId: 'stx-memoryos-chat-strategy-keep-summary',
    keepEventCountId: 'stx-memoryos-chat-strategy-keep-event',
    keepVectorDaysId: 'stx-memoryos-chat-strategy-keep-vector-days',
    qualityScoreId: 'stx-memoryos-chat-strategy-quality-score',
    qualityLevelId: 'stx-memoryos-chat-strategy-quality-level',
    qualityDimensionsId: 'stx-memoryos-chat-strategy-quality-dimensions',
    qualityVectorModeId: 'stx-memoryos-chat-strategy-quality-vector-mode',
    qualityVectorStatsId: 'stx-memoryos-chat-strategy-quality-vector-stats',
    qualityVectorTimesId: 'stx-memoryos-chat-strategy-quality-vector-times',
    qualityTraceEvidenceId: 'stx-memoryos-chat-strategy-quality-trace-evidence',
    qualityAdviceId: 'stx-memoryos-chat-strategy-quality-advice',
    qualityReasonsId: 'stx-memoryos-chat-strategy-quality-reasons',
    maintenanceInsightsId: 'stx-memoryos-chat-strategy-maintenance-insights',
    lifecycleHeroId: 'stx-memoryos-chat-strategy-lifecycle-hero',
    lifecycleStageId: 'stx-memoryos-chat-strategy-lifecycle-stage',
    lifecycleMetaId: 'stx-memoryos-chat-strategy-lifecycle-meta',
    lifecycleSummaryId: 'stx-memoryos-chat-strategy-lifecycle-summary',
    lifecycleExplanationId: 'stx-memoryos-chat-strategy-lifecycle-explanation',
    lifecycleReasonListId: 'stx-memoryos-chat-strategy-lifecycle-reasons',
    lifecycleTimelineId: 'stx-memoryos-chat-strategy-lifecycle-timeline',
    lifecycleImpactId: 'stx-memoryos-chat-strategy-lifecycle-impact',
    presetScopeMetaId: 'stx-memoryos-chat-strategy-preset-scope-meta',
    groupLaneMetaId: 'stx-memoryos-chat-strategy-group-lane-meta',
    groupLaneActorsId: 'stx-memoryos-chat-strategy-group-lane-actors',
    autoBlockId: 'stx-memoryos-chat-strategy-auto',
    overrideBlockId: 'stx-memoryos-chat-strategy-override',
    finalBlockId: 'stx-memoryos-chat-strategy-final',
    metricsBlockId: 'stx-memoryos-chat-strategy-metrics',
    decisionBlockId: 'stx-memoryos-chat-strategy-decision',
    preDecisionBlockId: 'stx-memoryos-chat-strategy-pre-decision',
    postDecisionBlockId: 'stx-memoryos-chat-strategy-post-decision',
    processingDecisionBlockId: 'stx-memoryos-chat-strategy-processing-decision',
    longSummaryCooldownBlockId: 'stx-memoryos-chat-strategy-long-summary-cooldown',
    diagnosticBasicDetailsId: 'stx-memoryos-chat-strategy-diagnostic-basic',
    diagnosticAdvancedDetailsId: 'stx-memoryos-chat-strategy-diagnostic-advanced',
    diagnosticBasicGridId: 'stx-memoryos-chat-strategy-diagnostic-basic-grid',
    diagnosticAdvancedGridId: 'stx-memoryos-chat-strategy-diagnostic-advanced-grid',
    advancedSettingsId: 'stx-memoryos-chat-strategy-advanced-settings',
} as const;

let selectedChatKey: string = '';
let panelListenersBound: boolean = false;
let cachedChatOptions: ChatOption[] = [];
let autoLoadTimerId: number | null = null;
let autoLoadAttempts: number = 0;

const CHAT_STRATEGY_AUTO_LOAD_MAX_ATTEMPTS: number = 8;
const CHAT_STRATEGY_AUTO_LOAD_INTERVAL_MS: number = 700;

/**
 * 功能：为聊天策略画像区域应用共享提示逻辑。
 * @returns 无返回值。
 */
function applyChatStrategyTooltips(): void {
    ensureSharedTooltip();
}

function escapeSummaryChoiceLabel(value: string): string {
    return escapeHtml(value);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((item: string, index: number): boolean => item === right[index]);
}

function collectSummarySettingsFromForm(overlay: HTMLElement): SummarySettings {
    const focusValues: SummaryRecordFocus[] = [
        'facts',
        'relationship',
        'world',
        'plot',
        'emotion',
        'tool_result',
    ].filter((item: string): item is SummaryRecordFocus => getCheckboxValue(overlay, `stx-memoryos-chat-strategy-summary-focus-${item.replace(/_/g, '-')}`));
    const triggerValues: SummaryLongTrigger[] = [
        'scene_end',
        'combat_end',
        'plot_advance',
        'relationship_shift',
        'world_change',
        'structure_repair',
        'archive_finalize',
    ].filter((item: string): item is SummaryLongTrigger => getCheckboxValue(overlay, `stx-memoryos-chat-strategy-summary-trigger-${item.replace(/_/g, '-')}`));
    return {
        workMode: {
            memoryMode: getSelectValue(overlay, EDITOR_IDS.summaryMemoryModeId) as SummaryMemoryMode || DEFAULT_SUMMARY_SETTINGS.workMode.memoryMode,
            scenario: getSelectValue(overlay, EDITOR_IDS.summaryScenarioId) as SummaryScenario || DEFAULT_SUMMARY_SETTINGS.workMode.scenario,
            resourcePriority: getSelectValue(overlay, EDITOR_IDS.summaryResourcePriorityId) as SummaryResourcePriority || DEFAULT_SUMMARY_SETTINGS.workMode.resourcePriority,
        },
        summaryBehavior: {
            summaryTiming: getSelectValue(overlay, EDITOR_IDS.summaryTimingId) as SummaryTiming || DEFAULT_SUMMARY_SETTINGS.summaryBehavior.summaryTiming,
            summaryLength: getSelectValue(overlay, EDITOR_IDS.summaryLengthId) as SummaryLength || DEFAULT_SUMMARY_SETTINGS.summaryBehavior.summaryLength,
            longSummaryCooldown: getSelectValue(overlay, EDITOR_IDS.summaryCooldownId) as SummaryCooldownPreset || DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryCooldown,
            longSummaryTrigger: triggerValues.length > 0 ? triggerValues : [...DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryTrigger],
        },
        contentPreference: {
            recordFocus: focusValues.length > 0 ? focusValues : [...DEFAULT_SUMMARY_SETTINGS.contentPreference.recordFocus],
            lowValueHandling: getSelectValue(overlay, EDITOR_IDS.summaryLowValueHandlingId) as SummaryLowValueHandling || DEFAULT_SUMMARY_SETTINGS.contentPreference.lowValueHandling,
            noiseFilter: getSelectValue(overlay, EDITOR_IDS.summaryNoiseFilterId) as SummaryNoiseFilter || DEFAULT_SUMMARY_SETTINGS.contentPreference.noiseFilter,
        },
        advanced: {
            processInterval: getSelectValue(overlay, EDITOR_IDS.summaryProcessIntervalId) as SummaryProcessInterval || DEFAULT_SUMMARY_SETTINGS.advanced.processInterval,
            lookbackScope: getSelectValue(overlay, EDITOR_IDS.summaryLookbackScopeId) as SummaryLookbackScope || DEFAULT_SUMMARY_SETTINGS.advanced.lookbackScope,
            allowLightRelationExtraction: getCheckboxValue(overlay, EDITOR_IDS.summaryLightRelationId),
            allowMediumWorldStateUpdate: getCheckboxValue(overlay, EDITOR_IDS.summaryMediumWorldStateId),
            allowHeavyRewriteSummaries: getCheckboxValue(overlay, EDITOR_IDS.summaryHeavyRewriteId),
            allowHeavyConsistencyRepair: getCheckboxValue(overlay, EDITOR_IDS.summaryHeavyConsistencyId),
            allowHeavyExpandedLookback: getCheckboxValue(overlay, EDITOR_IDS.summaryHeavyLookbackId),
        },
    };
}

function buildSummarySettingsOverrideDiff(base: SummarySettings, next: SummarySettings): SummarySettingsOverride {
    const override: SummarySettingsOverride = {};
    if (
        base.workMode.memoryMode !== next.workMode.memoryMode
        || base.workMode.scenario !== next.workMode.scenario
        || base.workMode.resourcePriority !== next.workMode.resourcePriority
    ) {
        override.workMode = {};
        if (base.workMode.memoryMode !== next.workMode.memoryMode) {
            override.workMode.memoryMode = next.workMode.memoryMode;
        }
        if (base.workMode.scenario !== next.workMode.scenario) {
            override.workMode.scenario = next.workMode.scenario;
        }
        if (base.workMode.resourcePriority !== next.workMode.resourcePriority) {
            override.workMode.resourcePriority = next.workMode.resourcePriority;
        }
    }
    if (
        base.summaryBehavior.summaryTiming !== next.summaryBehavior.summaryTiming
        || base.summaryBehavior.summaryLength !== next.summaryBehavior.summaryLength
        || base.summaryBehavior.longSummaryCooldown !== next.summaryBehavior.longSummaryCooldown
        || !areStringArraysEqual(base.summaryBehavior.longSummaryTrigger, next.summaryBehavior.longSummaryTrigger)
    ) {
        override.summaryBehavior = {};
        if (base.summaryBehavior.summaryTiming !== next.summaryBehavior.summaryTiming) {
            override.summaryBehavior.summaryTiming = next.summaryBehavior.summaryTiming;
        }
        if (base.summaryBehavior.summaryLength !== next.summaryBehavior.summaryLength) {
            override.summaryBehavior.summaryLength = next.summaryBehavior.summaryLength;
        }
        if (base.summaryBehavior.longSummaryCooldown !== next.summaryBehavior.longSummaryCooldown) {
            override.summaryBehavior.longSummaryCooldown = next.summaryBehavior.longSummaryCooldown;
        }
        if (!areStringArraysEqual(base.summaryBehavior.longSummaryTrigger, next.summaryBehavior.longSummaryTrigger)) {
            override.summaryBehavior.longSummaryTrigger = [...next.summaryBehavior.longSummaryTrigger];
        }
    }
    if (
        !areStringArraysEqual(base.contentPreference.recordFocus, next.contentPreference.recordFocus)
        || base.contentPreference.lowValueHandling !== next.contentPreference.lowValueHandling
        || base.contentPreference.noiseFilter !== next.contentPreference.noiseFilter
    ) {
        override.contentPreference = {};
        if (!areStringArraysEqual(base.contentPreference.recordFocus, next.contentPreference.recordFocus)) {
            override.contentPreference.recordFocus = [...next.contentPreference.recordFocus];
        }
        if (base.contentPreference.lowValueHandling !== next.contentPreference.lowValueHandling) {
            override.contentPreference.lowValueHandling = next.contentPreference.lowValueHandling;
        }
        if (base.contentPreference.noiseFilter !== next.contentPreference.noiseFilter) {
            override.contentPreference.noiseFilter = next.contentPreference.noiseFilter;
        }
    }
    if (
        base.advanced.processInterval !== next.advanced.processInterval
        || base.advanced.lookbackScope !== next.advanced.lookbackScope
        || base.advanced.allowLightRelationExtraction !== next.advanced.allowLightRelationExtraction
        || base.advanced.allowMediumWorldStateUpdate !== next.advanced.allowMediumWorldStateUpdate
        || base.advanced.allowHeavyRewriteSummaries !== next.advanced.allowHeavyRewriteSummaries
        || base.advanced.allowHeavyConsistencyRepair !== next.advanced.allowHeavyConsistencyRepair
        || base.advanced.allowHeavyExpandedLookback !== next.advanced.allowHeavyExpandedLookback
    ) {
        override.advanced = {};
        if (base.advanced.processInterval !== next.advanced.processInterval) {
            override.advanced.processInterval = next.advanced.processInterval;
        }
        if (base.advanced.lookbackScope !== next.advanced.lookbackScope) {
            override.advanced.lookbackScope = next.advanced.lookbackScope;
        }
        if (base.advanced.allowLightRelationExtraction !== next.advanced.allowLightRelationExtraction) {
            override.advanced.allowLightRelationExtraction = next.advanced.allowLightRelationExtraction;
        }
        if (base.advanced.allowMediumWorldStateUpdate !== next.advanced.allowMediumWorldStateUpdate) {
            override.advanced.allowMediumWorldStateUpdate = next.advanced.allowMediumWorldStateUpdate;
        }
        if (base.advanced.allowHeavyRewriteSummaries !== next.advanced.allowHeavyRewriteSummaries) {
            override.advanced.allowHeavyRewriteSummaries = next.advanced.allowHeavyRewriteSummaries;
        }
        if (base.advanced.allowHeavyConsistencyRepair !== next.advanced.allowHeavyConsistencyRepair) {
            override.advanced.allowHeavyConsistencyRepair = next.advanced.allowHeavyConsistencyRepair;
        }
        if (base.advanced.allowHeavyExpandedLookback !== next.advanced.allowHeavyExpandedLookback) {
            override.advanced.allowHeavyExpandedLookback = next.advanced.allowHeavyExpandedLookback;
        }
    }
    return override;
}

function buildSummaryToggleMarkup(id: string, title: string, description: string, checked: boolean): string {
    return buildSharedCheckboxCard({
        id,
        title,
        description,
        checkedLabel: '开启',
        uncheckedLabel: '关闭',
        containerClassName: 'stx-memory-chat-strategy-toggle',
    }).replace('checked', checked ? 'checked' : '');
}

function buildSummarySettingsMarkup(snapshot?: ChatStrategySnapshot | null): string {
    const effective = snapshot?.effectiveSummarySettings ?? null;
    const sourceLabel = formatSummarySourceLabel(effective?.source ?? null);
    const settings = effective ?? DEFAULT_SUMMARY_SETTINGS;
    const workModeCards = `
      <div class="stx-memory-chat-strategy-control-grid">
        ${buildEditorSelectField(EDITOR_IDS.summaryMemoryModeId, '记忆模式', '控制这套设置更偏省流、均衡还是深度。', [
            { value: 'streamlined', label: '精简' },
            { value: 'balanced', label: '均衡' },
            { value: 'deep', label: '深度' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryScenarioId, '使用场景', '自动推断时会按聊天类型选择默认偏置。', [
            { value: 'auto', label: '自动' },
            { value: 'companion_chat', label: '陪伴闲聊' },
            { value: 'long_rp', label: '长剧情 RP' },
            { value: 'worldbook_qa', label: '世界设定问答' },
            { value: 'group_trpg', label: '群聊 / 跑团' },
            { value: 'tool_qa', label: '工具 / 代码' },
            { value: 'custom', label: '自定义' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryResourcePriorityId, '资源优先级', '决定系统更偏质量、均衡还是节流。', [
            { value: 'quality', label: '质量优先' },
            { value: 'balanced', label: '均衡' },
            { value: 'saving', label: '节流优先' },
        ])}
      </div>
    `;
    const summaryBehaviorCards = `
      <div class="stx-memory-chat-strategy-control-grid">
        ${buildEditorSelectField(EDITOR_IDS.summaryTimingId, '总结时机', '控制是关键节点、阶段结束还是更频繁地总结。', [
            { value: 'key_only', label: '关键节点' },
            { value: 'stage_end', label: '阶段结束' },
            { value: 'frequent', label: '更频繁' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryLengthId, '总结长度', '控制短总结与长总结的预算档位。', [
            { value: 'short', label: '短' },
            { value: 'standard', label: '标准' },
            { value: 'detailed', label: '详细' },
            { value: 'ultra', label: '超长' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryCooldownId, '长总结冷却', '防止同一窗口重复重整。', [
            { value: 'short', label: '短' },
            { value: 'standard', label: '标准' },
            { value: 'long', label: '长' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryLowValueHandlingId, '低价值内容', '如何处理闲聊、寒暄和低信息量内容。', [
            { value: 'ignore', label: '忽略' },
            { value: 'keep_some', label: '保留部分' },
            { value: 'keep_more', label: '尽量保留' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryNoiseFilterId, '无效内容过滤', '过滤噪声、重复确认和无信息片段的强度。', [
            { value: 'low', label: '低' },
            { value: 'medium', label: '中' },
            { value: 'high', label: '高' },
        ])}
      </div>
    `;
    const recordFocusCards = [
        { id: EDITOR_IDS.summaryFocusFactsId, title: '事实', description: '保留明确事实与角色设定。' },
        { id: EDITOR_IDS.summaryFocusRelationshipId, title: '关系', description: '保留角色关系和互动变化。' },
        { id: EDITOR_IDS.summaryFocusWorldId, title: '世界', description: '保留世界观、规则和背景。' },
        { id: EDITOR_IDS.summaryFocusPlotId, title: '剧情', description: '保留剧情推进与阶段节点。' },
        { id: EDITOR_IDS.summaryFocusEmotionId, title: '情绪', description: '保留情绪、氛围和态度变化。' },
        { id: EDITOR_IDS.summaryFocusToolResultId, title: '工具结果', description: '保留工具 / 代码 / 查询最终结论。' },
    ];
    const triggerCards = [
        { id: EDITOR_IDS.summaryTriggerSceneEndId, title: '场景结束', description: '场景收束时允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerCombatEndId, title: '战斗结束', description: '战斗收尾时允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerPlotAdvanceId, title: '剧情推进', description: '剧情明显前进时允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerRelationshipShiftId, title: '关系变化', description: '关系或阵营变化时允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerWorldChangeId, title: '世界变化', description: '设定或世界状态变化时允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerStructureRepairId, title: '结构修复', description: '编辑、删改或分支后允许长总结。' },
        { id: EDITOR_IDS.summaryTriggerArchiveFinalizeId, title: '归档整理', description: '归档前最后整理窗口。' },
    ];
    const advancedCards = `
      <div class="stx-memory-chat-strategy-control-grid">
        ${buildEditorSelectField(EDITOR_IDS.summaryProcessIntervalId, '处理间隔', '控制候选巡检频率。', [
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
        ])}
        ${buildEditorSelectField(EDITOR_IDS.summaryLookbackScopeId, '回看范围', '控制一次处理会回看多大的窗口。', [
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
        ])}
      </div>
      <div class="stx-memory-chat-strategy-toggle-wrap">
        ${buildSharedCheckboxCard({
            id: EDITOR_IDS.summaryLightRelationId,
            title: '轻处理中提取关系',
            description: '轻处理时也保留最关键的关系变化。',
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })}
        ${buildSharedCheckboxCard({
            id: EDITOR_IDS.summaryMediumWorldStateId,
            title: '中处理中更新世界状态',
            description: '中处理允许同步必要的世界状态变化。',
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })}
        ${buildSharedCheckboxCard({
            id: EDITOR_IDS.summaryHeavyRewriteId,
            title: '重处理中重整摘要',
            description: '重处理允许整理旧摘要并重写更稳定的阶段概述。',
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })}
        ${buildSharedCheckboxCard({
            id: EDITOR_IDS.summaryHeavyConsistencyId,
            title: '重处理中优先修复一致性',
            description: '重处理更重视消除冲突与修复结构不一致。',
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })}
        ${buildSharedCheckboxCard({
            id: EDITOR_IDS.summaryHeavyLookbackId,
            title: '重处理中允许扩大回看',
            description: '重处理时可回看更大的上下文窗口。',
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })}
      </div>
    `;
    const recordFocusMarkup = `
      <div class="stx-memory-chat-strategy-toggle-wrap">
        ${recordFocusCards.map((item): string => buildSharedCheckboxCard({
            id: item.id,
            title: item.title,
            description: item.description,
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })).join('')}
      </div>
    `;
    const triggerMarkup = `
      <div class="stx-memory-chat-strategy-toggle-wrap">
        ${triggerCards.map((item): string => buildSharedCheckboxCard({
            id: item.id,
            title: item.title,
            description: item.description,
            checkedLabel: '允许',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-memory-chat-strategy-toggle',
        })).join('')}
      </div>
    `;
    return `
      <div class="stx-memory-chat-strategy-summary-compact">
        <div class="stx-memory-chat-strategy-summary-bar">
          <div>
            <div class="stx-memory-chat-strategy-summary-bar-title">AI 记忆总结</div>
            <div class="stx-memory-chat-strategy-summary-bar-subtitle">四块设置，控制总结的方式、时机、重点和高级行为。</div>
          </div>
          <div class="stx-memory-chat-strategy-summary-bar-badges">
            <span class="stx-memory-chat-strategy-pill">${escapeHtml(sourceLabel)}</span>
            <span class="stx-memory-chat-strategy-pill">${escapeHtml(`${settings.workMode.memoryMode} / ${settings.summaryBehavior.summaryLength}`)}</span>
            <span class="stx-memory-chat-strategy-pill">${escapeHtml(`${settings.summaryBehavior.summaryTiming} / ${settings.advanced.processInterval}`)}</span>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-summary-actions">
          ${buildSharedButton({ id: EDITOR_IDS.summarySaveGlobalBtnId, label: '保存为全局默认', iconClassName: 'fa-solid fa-globe', variant: 'secondary' })}
          ${buildSharedButton({ id: EDITOR_IDS.summarySaveChatBtnId, label: '应用到当前聊天', iconClassName: 'fa-solid fa-message', variant: 'secondary' })}
          ${buildSharedButton({ id: EDITOR_IDS.summaryClearChatBtnId, label: '清除当前聊天覆盖', iconClassName: 'fa-solid fa-eraser', variant: 'secondary' })}
          ${buildSharedButton({ id: EDITOR_IDS.summaryResetBtnId, label: '恢复文档默认', iconClassName: 'fa-solid fa-arrow-rotate-left', variant: 'secondary' })}
        </div>
        <div class="stx-memory-chat-strategy-summary-section">
          <div class="stx-memory-chat-strategy-summary-section-head">
            <h4>工作方式</h4>
            <p>控制系统更偏省流、均衡还是深度，以及是否按场景自动推断。</p>
          </div>
          ${workModeCards}
        </div>
        <div class="stx-memory-chat-strategy-summary-section">
          <div class="stx-memory-chat-strategy-summary-section-head">
            <h4>总结行为</h4>
            <p>控制什么时候总结、总结多长，以及长总结何时允许触发。</p>
          </div>
          ${summaryBehaviorCards}
          <div class="stx-memory-chat-strategy-summary-subsection">
            <div class="stx-memory-chat-strategy-summary-subsection-head">长总结触发条件</div>
            ${triggerMarkup}
          </div>
        </div>
        <div class="stx-memory-chat-strategy-summary-section">
          <div class="stx-memory-chat-strategy-summary-section-head">
            <h4>记录重点</h4>
            <p>决定保留事实、关系、世界、剧情还是情绪 / 工具结果。</p>
          </div>
          ${recordFocusMarkup}
        </div>
        <div class="stx-memory-chat-strategy-summary-section">
          <div class="stx-memory-chat-strategy-summary-section-head">
            <h4>高级设置</h4>
            <p>处理间隔、回看范围和重处理行为都收在这里，默认折叠前的内容尽量保持紧凑。</p>
          </div>
          ${advancedCards}
        </div>
      </div>
    `.trim();
}

/**
 * 功能：把处理等级决策压缩成一行便于面板展示的文案。
 * @param decision 处理等级决策。
 * @returns 简短摘要。
 */
function fillSummarySettingsForm(
    overlay: HTMLElement,
    settings: SummarySettings | EffectiveSummarySettings,
    sourceOverride?: SummarySettingsSource | null,
): void {
    const summary = settings;
    setSelectValue(overlay, EDITOR_IDS.summaryMemoryModeId, summary.workMode.memoryMode);
    setSelectValue(overlay, EDITOR_IDS.summaryScenarioId, summary.workMode.scenario);
    setSelectValue(overlay, EDITOR_IDS.summaryResourcePriorityId, summary.workMode.resourcePriority);
    setSelectValue(overlay, EDITOR_IDS.summaryTimingId, summary.summaryBehavior.summaryTiming);
    setSelectValue(overlay, EDITOR_IDS.summaryLengthId, summary.summaryBehavior.summaryLength);
    setSelectValue(overlay, EDITOR_IDS.summaryCooldownId, summary.summaryBehavior.longSummaryCooldown);
    setSelectValue(overlay, EDITOR_IDS.summaryLowValueHandlingId, summary.contentPreference.lowValueHandling);
    setSelectValue(overlay, EDITOR_IDS.summaryNoiseFilterId, summary.contentPreference.noiseFilter);
    setSelectValue(overlay, EDITOR_IDS.summaryProcessIntervalId, summary.advanced.processInterval);
    setSelectValue(overlay, EDITOR_IDS.summaryLookbackScopeId, summary.advanced.lookbackScope);
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusFactsId, summary.contentPreference.recordFocus.includes('facts'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusRelationshipId, summary.contentPreference.recordFocus.includes('relationship'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusWorldId, summary.contentPreference.recordFocus.includes('world'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusPlotId, summary.contentPreference.recordFocus.includes('plot'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusEmotionId, summary.contentPreference.recordFocus.includes('emotion'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryFocusToolResultId, summary.contentPreference.recordFocus.includes('tool_result'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerSceneEndId, summary.summaryBehavior.longSummaryTrigger.includes('scene_end'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerCombatEndId, summary.summaryBehavior.longSummaryTrigger.includes('combat_end'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerPlotAdvanceId, summary.summaryBehavior.longSummaryTrigger.includes('plot_advance'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerRelationshipShiftId, summary.summaryBehavior.longSummaryTrigger.includes('relationship_shift'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerWorldChangeId, summary.summaryBehavior.longSummaryTrigger.includes('world_change'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerStructureRepairId, summary.summaryBehavior.longSummaryTrigger.includes('structure_repair'));
    setCheckboxValue(overlay, EDITOR_IDS.summaryTriggerArchiveFinalizeId, summary.summaryBehavior.longSummaryTrigger.includes('archive_finalize'));
    const sourceElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.summarySourceId}`) as HTMLElement | null;
    if (sourceElement) {
        sourceElement.textContent = formatSummarySourceLabel(
            'source' in summary ? (summary.source ?? sourceOverride ?? null) : (sourceOverride ?? null),
        );
    }
}

/**
 * 功能：把当前聊天的总结设置卡渲染到主面板里。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function renderSummarySettingsSection(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const existingMount: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.summarySettingsMountId}`) as HTMLElement | null;
    if (existingMount) {
        existingMount.innerHTML = buildSummarySettingsMarkup(snapshot);
        fillSummarySettingsForm(existingMount, snapshot.effectiveSummarySettings);
        hideLegacySummaryControls(overlay);
        return;
    }

    const summaryHost: HTMLElement | null = overlay.querySelector('.stx-memory-chat-strategy-summary-settings-host') as HTMLElement | null;
    if (!summaryHost) {
        return;
    }
    summaryHost.innerHTML = buildSummarySettingsMarkup(snapshot);
    const summaryMount: HTMLElement | null = summaryHost.querySelector(`#${EDITOR_IDS.summarySettingsMountId}`) as HTMLElement | null;
    if (summaryMount) {
        fillSummarySettingsForm(summaryMount, snapshot.effectiveSummarySettings);
    }
    hideLegacySummaryControls(overlay);
}

/**
 * 功能：移除旧的摘要直控字段，避免与新的总结设置面板并存。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function hideLegacySummaryControls(overlay: HTMLElement): void {
    void overlay;
}

function formatProcessingDecisionSummary(decision: MemoryProcessingDecision | null): string {
    if (!decision) {
        return '处理等级：--';
    }
    const parts: string[] = [
        `处理等级 ${decision.level}`,
        `摘要 ${decision.summaryTier}`,
        `抽取 ${decision.extractScope}`,
    ];
    if (decision.cooldownBlocked) {
        parts.push('长总结冷却命中');
    }
    return parts.join(' · ');
}

/**
 * 功能：把长总结冷却状态压缩成一行便于面板展示的文案。
 * @param cooldown 长总结冷却状态。
 * @returns 简短摘要。
 */
function formatLongSummaryCooldownSummary(cooldown: LongSummaryCooldownState): string {
    const lastSummaryAt = Number(cooldown?.lastLongSummaryAt ?? 0);
    const lastHeavyAt = Number(cooldown?.lastHeavyProcessAt ?? 0);
    if (!lastSummaryAt && !lastHeavyAt) {
        return '长总结冷却：未记录';
    }
    const bits: string[] = [];
    if (lastSummaryAt > 0) {
        bits.push(`最近长总结 ${formatRelativeTime(lastSummaryAt)}`);
    }
    if (lastHeavyAt > 0) {
        bits.push(`最近重处理 ${formatRelativeTime(lastHeavyAt)}`);
    }
    if (cooldown?.lastLongSummaryWindowHash) {
        bits.push(`窗口 ${cooldown.lastLongSummaryWindowHash.slice(0, 8)}`);
    }
    return bits.join(' · ');
}

async function hasPersistedChatStrategyData(chatKey: string): Promise<boolean> {
    const normalizedChatKey: string = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return false;
    }

    const [
        eventRow,
        factRow,
        worldStateRow,
        summaryRow,
        templateRow,
        auditRow,
        bindingRow,
        pluginStateRow,
    ] = await Promise.all([
        db.events.where('chatKey').equals(normalizedChatKey).first(),
        db.facts.where('[chatKey+updatedAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.world_state.where('[chatKey+path]').between([normalizedChatKey, ''], [normalizedChatKey, '\uffff']).first(),
        db.summaries.where('[chatKey+level+createdAt]').between([normalizedChatKey, '', 0], [normalizedChatKey, '\uffff', Infinity]).first(),
        db.templates.where('[chatKey+createdAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.audit.where('chatKey').equals(normalizedChatKey).first(),
        db.template_bindings.where('chatKey').equals(normalizedChatKey).first(),
        readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, normalizedChatKey).catch(() => null),
    ]);

    return Boolean(
        eventRow
        || factRow
        || worldStateRow
        || summaryRow
        || templateRow
        || auditRow
        || bindingRow
        || pluginStateRow,
    );
}

function buildEphemeralChatStrategySnapshot(chatKey: string): ChatStrategySnapshot {
    const effectiveProfile: ChatProfile = {
        ...DEFAULT_CHAT_PROFILE,
        vectorStrategy: {
            ...DEFAULT_CHAT_PROFILE.vectorStrategy,
        },
    };
    const effectiveRetention: RetentionPolicy = {
        ...DEFAULT_RETENTION_POLICY,
    };
    const vectorLifecycle: VectorLifecycleState = {
        ...DEFAULT_VECTOR_LIFECYCLE,
    };
    const memoryQuality: MemoryQualityScorecard = {
        ...DEFAULT_MEMORY_QUALITY,
        dimensions: {
            ...DEFAULT_MEMORY_QUALITY.dimensions,
        },
    };
    const effectivePolicy: AdaptivePolicy = buildAdaptivePolicy(
        effectiveProfile,
        { ...DEFAULT_ADAPTIVE_METRICS },
        vectorLifecycle,
        memoryQuality,
    );

    return {
        chatKey,
        autoProfile: effectiveProfile,
        autoPolicy: effectivePolicy,
        autoRetention: effectiveRetention,
        effectiveProfile,
        effectivePolicy,
        effectiveRetention,
        metrics: { ...DEFAULT_ADAPTIVE_METRICS },
        vectorLifecycle,
        memoryQuality,
        maintenanceAdvice: [],
        maintenanceInsights: [],
        lifecycleState: { ...DEFAULT_CHAT_LIFECYCLE_STATE },
        decision: null,
        preDecision: null,
        postDecision: null,
        processingDecision: null,
        longSummaryCooldown: { ...DEFAULT_LONG_SUMMARY_COOLDOWN },
        summarySettings: { ...DEFAULT_SUMMARY_SETTINGS },
        summarySettingsOverride: {},
        effectiveSummarySettings: {
            ...DEFAULT_SUMMARY_SETTINGS,
            source: 'system_default',
            resolvedScenario: 'custom',
            resolvedChatType: effectiveProfile.chatType,
        },
        summarySettingsSource: 'system_default',
        extractHealth: { ...DEFAULT_EXTRACT_HEALTH, recentTasks: [] },
        promptInjectionProfile: { ...DEFAULT_PROMPT_INJECTION_PROFILE },
        groupMemory: null,
        mainlineTraceSnapshot: null,
        overrides: {},
    };
}

/**
 * 功能：确保设置页中存在紧凑版聊天策略概览卡。
 * @param panelHost AI 面板根节点。
 * @returns 无返回值。
 */
export function ensureChatStrategyPanel(panelHost: HTMLElement): void {
    if (panelHost.querySelector(`#${PANEL_IDS.rootId}`)) {
        return;
    }
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.innerHTML = buildCompactPanelMarkupV2();
    const firstElement: Element | null = wrapper.firstElementChild;
    if (firstElement instanceof HTMLElement) {
        panelHost.prepend(firstElement);
        hydrateSharedSelects(firstElement);
        applyChatStrategyTooltips();
    }
}

/**
 * 功能：初始化聊天策略概览卡并同步当前聊天摘要。
 * @returns 无返回值。
 */
export async function initializeChatStrategyPanel(): Promise<void> {
    const root: HTMLElement | null = document.getElementById(PANEL_IDS.rootId) as HTMLElement | null;
    if (!root) {
        return;
    }
    bindCompactPanelListeners();
    await refreshChatStrategyChatOptions();
    if (!selectedChatKey) {
        selectedChatKey = getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    }
    if (selectedChatKey) {
        await renderCompactPanelStateV2(selectedChatKey);
    }
    scheduleAutoLoadChatStrategyPanel();
}

/**
 * 功能：刷新概览卡中的聊天下拉列表。
 * @returns 无返回值。
 */
export async function refreshChatStrategyChatOptions(): Promise<void> {
    const select: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    if (!select) {
        return;
    }
    cachedChatOptions = await loadChatOptions();
    if (!selectedChatKey) {
        selectedChatKey = getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    }
    replaceSelectOptions(select, cachedChatOptions, selectedChatKey);
    refreshSharedSelectOptions(document.getElementById(PANEL_IDS.rootId) || document.body);
    applyChatStrategyTooltips();
}

/**
 * 功能：打开聊天策略全屏编辑器。
 * @returns 无返回值。
 */
export async function openChatStrategyEditor(): Promise<void> {
    initThemeKernel();
    const dialog = openSharedDialog({
        id: EDITOR_IDS.overlayId,
        layout: 'stretch',
        rootClassName: 'stx-memory-chat-strategy-overlay ui-widget',
        chrome: false,
        closeOnBackdrop: true,
        closeOnEscape: true,
        bodyHtml: buildEditorMarkupV2(),
    });
    const overlay = dialog.root;
    mountThemeHost(overlay);

    hydrateSharedSelects(overlay);
    applyChatStrategyTooltips();

    const activeChatKey: string = selectedChatKey || getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    selectedChatKey = activeChatKey;
    await syncEditorChatOptions(overlay, activeChatKey);
    bindEditorListeners(overlay);
    if (activeChatKey) {
        await renderEditorStateV2(overlay, activeChatKey);
    }
}

/**
 * 功能：构建设置页概览卡 HTML。
 * @returns 概览卡 HTML 字符串。
 */
function buildCompactPanelMarkup(): string {
    const selectMarkup: string = buildSharedSelectField({
        id: PANEL_IDS.chatSelectId,
        containerClassName: 'stx-shared-select-fluid stx-shared-select-inline',
        selectClassName: 'stx-ui-input',
        triggerClassName: 'stx-ui-input-full stx-shared-select-trigger-input',
        triggerAttributes: {
            'data-tip': '切换要查看的聊天策略摘要。',
        },
        options: [{
            value: '',
            label: '正在加载聊天...',
            media: {
                type: 'icon',
                iconClassName: 'fa-solid fa-comments',
            },
        }],
    });
    const openButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.openBtnId,
        label: '打开全屏编辑器',
        iconClassName: 'fa-solid fa-expand',
        className: 'stx-memory-chat-strategy-open',
        attributes: {
            'data-tip': '打开全屏聊天策略编辑器。',
        },
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.refreshBtnId,
        label: '刷新摘要',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
        attributes: {
            'data-tip': '重新读取当前聊天的策略摘要。',
        },
    });
    return `
      <div id="${PANEL_IDS.rootId}" class="stx-ui-item stx-ui-item-stack stx-memory-chat-strategy-card">
        <div class="stx-ui-divider">
          <i class="fa-solid fa-sliders"></i>
          <span>聊天策略画像</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <div class="stx-memory-chat-strategy-card-head">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">按聊天查看与编辑记忆策略</div>
            <div class="stx-ui-item-desc">设置页只保留紧凑摘要，详细编辑、诊断和多聊天切换都在全屏编辑器中完成。</div>
          </div>
          <div class="stx-memory-chat-strategy-card-actions">
            ${refreshButtonMarkup}
            ${openButtonMarkup}
          </div>
        </div>
        <div class="stx-memory-chat-strategy-card-toolbar">
          <label class="stx-memory-chat-strategy-card-field">
            <span class="stx-memory-chat-strategy-card-label">聊天</span>
            ${selectMarkup}
          </label>
        </div>
        <div class="stx-memory-chat-strategy-summary-grid">
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">当前聊天</span>
            <strong id="${PANEL_IDS.summaryNameId}" class="stx-memory-chat-strategy-summary-value">未选择</strong>
          </div>
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">当前意图</span>
            <strong id="${PANEL_IDS.summaryIntentId}" class="stx-memory-chat-strategy-summary-value">暂无</strong>
          </div>
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">画像概览</span>
            <strong id="${PANEL_IDS.summaryProfileId}" class="stx-memory-chat-strategy-summary-value">等待加载</strong>
          </div>
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">生命周期</span>
            <strong id="${PANEL_IDS.summaryLifecycleId}" class="stx-memory-chat-strategy-summary-value">new</strong>
          </div>
        </div>
        <div id="${PANEL_IDS.summaryMaintenanceId}" class="stx-memory-chat-strategy-summary-maintenance" style="display: none;">
          <span id="${PANEL_IDS.summaryMaintenanceTextId}" class="stx-memory-chat-strategy-summary-maintenance-text">暂无维护异常</span>
          <button id="${PANEL_IDS.summaryMaintenanceActionId}" type="button" class="stx-memory-chat-strategy-summary-maintenance-action">
            去维护
          </button>
        </div>
        <div class="stx-memory-chat-strategy-sections">
          <span class="stx-memory-chat-strategy-card-label">最近注入区段</span>
          <div id="${PANEL_IDS.summarySectionsId}" class="stx-memory-chat-strategy-pill-wrap">
            <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
          </div>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：构建聊天策略全屏编辑器 HTML。
 * @returns 编辑器 HTML 字符串。
 */
function buildEditorMarkup(): string {
    const searchInputMarkup: string = buildSharedInputField({
        id: EDITOR_IDS.chatSearchId,
        type: 'search',
        className: 'stx-memory-chat-strategy-search',
        attributes: {
            placeholder: '搜索聊天名或 chatKey',
            'data-tip': '按聊天名或 chatKey 过滤左侧聊天列表。',
        },
    });
    const mobileToggleMarkup: string = buildSharedButton({
        id: EDITOR_IDS.mobileToggleBtnId,
        label: '切换聊天',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-comments',
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.refreshBtnId,
        label: '刷新',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
    });
    const recomputeButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.recomputeBtnId,
        label: '重算自动策略',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
    });
    const applyButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.applyBtnId,
        label: '保存覆盖',
        iconClassName: 'fa-solid fa-floppy-disk',
    });
    return `
      <div class="stx-memory-chat-strategy-editor">
        <div class="stx-memory-chat-strategy-header">
          <div class="stx-memory-chat-strategy-title-wrap">
            <div class="stx-memory-chat-strategy-title">
              <i class="fa-solid fa-sliders"></i>
              <span>聊天策略画像编辑器</span>
            </div>
            <div class="stx-memory-chat-strategy-subtitle">按聊天编辑记忆画像、自适应阈值入口与诊断信息，适配桌面和手机端。</div>
          </div>
          <div class="stx-memory-chat-strategy-header-actions">
            ${mobileToggleMarkup}
            ${refreshButtonMarkup}
            ${recomputeButtonMarkup}
            ${applyButtonMarkup}
            <button id="${EDITOR_IDS.closeBtnId}" type="button" class="stx-memory-chat-strategy-close" aria-label="关闭聊天策略编辑器">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-body">
          <aside class="stx-memory-chat-strategy-sidebar">
            <div class="stx-memory-chat-strategy-sidebar-head">
              <span class="stx-memory-chat-strategy-sidebar-title">聊天列表</span>
              ${searchInputMarkup}
            </div>
            <div id="${EDITOR_IDS.chatListId}" class="stx-memory-chat-strategy-chat-list">
              <div class="stx-memory-chat-strategy-empty">正在加载聊天列表...</div>
            </div>
          </aside>
          <div class="stx-memory-chat-strategy-sidebar-scrim" aria-hidden="true"></div>
          <main class="stx-memory-chat-strategy-main">
            <section class="stx-memory-chat-strategy-hero">
              <div class="stx-memory-chat-strategy-hero-main">
                <div id="${EDITOR_IDS.currentChatNameId}" class="stx-memory-chat-strategy-hero-title">未选择聊天</div>
                <div id="${EDITOR_IDS.currentChatMetaId}" class="stx-memory-chat-strategy-hero-meta">等待加载聊天画像</div>
                                <div id="${EDITOR_IDS.currentScopeId}" class="stx-memory-chat-strategy-hero-meta">预设来源等待加载</div>
              </div>
              <div class="stx-memory-chat-strategy-hero-side">
                <span class="stx-memory-chat-strategy-hero-label">当前意图</span>
                <strong id="${EDITOR_IDS.currentIntentId}" class="stx-memory-chat-strategy-hero-intent">暂无</strong>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>最近注入区段与场景预设</h3>
                  <p>左边看最近一次注入重点，右边直接切换当前聊天的场景预设。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-top-inline-grid">
                <article class="stx-memory-chat-strategy-inline-card">
                  <div class="stx-memory-chat-strategy-inline-card-head">
                    <h4>最近注入区段</h4>
                    <p>快速确认最近一次上下文注入偏向哪些内容。</p>
                  </div>
                  <div id="${EDITOR_IDS.sectionsWrapId}" class="stx-memory-chat-strategy-pill-wrap">
                    <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
                  </div>
                </article>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>基础画像</h3>
                  <p>这里决定该聊天的基础记忆风格和整体强度。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorSelectField(EDITOR_IDS.chatTypeId, '聊天类型', '切换该聊天的类型画像。', [
                    { value: 'solo', label: '单人' },
                    { value: 'group', label: '群聊' },
                    { value: 'worldbook', label: '世界书驱动' },
                    { value: 'tool', label: '工具型' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.stylePreferenceId, '风格偏好', '调整该聊天的内容风格偏好。', [
                    { value: 'story', label: '剧情型' },
                    { value: 'qa', label: '问答型' },
                    { value: 'trpg', label: '跑团型' },
                    { value: 'info', label: '信息型' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.memoryStrengthId, '记忆强度', '控制该聊天的整体记忆力度。', [
                    { value: 'low', label: '低' },
                    { value: 'medium', label: '中' },
                    { value: 'high', label: '高' },
                ])}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>抽取与摘要</h3>
                  <p>控制事实提取、关系抽取和摘要形态。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorSelectField(EDITOR_IDS.extractStrategyId, '抽取策略', '控制事实、关系与世界状态的抽取范围。', [
                    { value: 'facts_only', label: '只提事实' },
                    { value: 'facts_relations', label: '事实 + 关系' },
                    { value: 'facts_relations_world', label: '事实 + 关系 + 世界状态' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.summaryStrategyId, '摘要策略', '控制当前聊天的摘要组织方式。', [
                    { value: 'short', label: '短摘要' },
                    { value: 'layered', label: '分层摘要' },
                    { value: 'timeline', label: '时间段摘要' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.deletionStrategyId, '删除策略', '控制删除数据时是软删除还是立即清理。', [
                    { value: 'soft_delete', label: '软删除' },
                    { value: 'immediate_purge', label: '立即清理' },
                ])}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>向量与保留</h3>
                  <p>为高信息密度聊天调优向量阈值与数据保留策略。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-toggle-wrap">
                ${buildSharedCheckboxCard({
                    id: EDITOR_IDS.vectorEnabledId,
                    title: '启用向量检索',
                    description: '关闭后，该聊天将尽量走轻量记忆路径。',
                    checkedLabel: '开启',
                    uncheckedLabel: '关闭',
                    containerClassName: 'stx-memory-chat-strategy-toggle',
                    inputAttributes: {
                        'data-tip': '控制当前聊天是否启用向量索引与检索。',
                    },
                })}
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorInputField(EDITOR_IDS.vectorChunkThresholdId, '记忆提炼阈值', '达到该长度后才更积极地进入记忆卡提炼。', 'number', '50', '4000', '10')}
                ${buildEditorInputField(EDITOR_IDS.rerankThresholdId, '重排阈值', '候选数量达到该值后再触发 rerank。', 'number', '1', '50', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorActivationFactsId, 'Facts 启用阈值', 'facts 数量达到该值后优先进入向量检索阶段。', 'number', '1', '5000', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorActivationSummariesId, 'Summaries 启用阈值', 'summaries 数量达到该值后优先进入向量检索阶段。', 'number', '1', '5000', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorIdleDecayDaysId, '热度衰减天数', '超过该天数未命中后，向量模式会降档。', 'number', '1', '365', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorLowPrecisionStrideId, '低精度降频步长', '近期精度低时按该步长降频执行向量检索。', 'number', '1', '30', '1')}
                ${buildEditorInputField(EDITOR_IDS.keepVectorDaysId, '向量保留天数', '控制向量数据保留的时间窗口。', 'number', '1', '365', '1')}
                ${buildEditorInputField(EDITOR_IDS.keepSummaryCountId, '保留摘要数', '控制摘要记录的保留数量上限。', 'number', '10', '1000', '10')}
                ${buildEditorInputField(EDITOR_IDS.keepEventCountId, '保留事件数', '控制事件记录的保留数量上限。', 'number', '50', '5000', '50')}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head" data-tip="直观展示当前聊天的整体健康度，包含各项指标明细、向量引擎当前的运行模式，以及系统的维护建议。">
                <div>
                  <h3>记忆质量与引擎状态</h3>
                  <p>查看当前聊天的质量评分、各项核心能力表现以及系统维护指引。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-quality-grid">
                <article class="stx-memory-chat-strategy-quality-card is-score" data-tip="结合聊天活跃度与记忆鲜活度得出的综合体检分数，随时了解该聊天是否“健康”。">
                  <span class="stx-memory-chat-strategy-quality-label">记忆综合评分</span>
                  <div class="stx-memory-chat-strategy-quality-score-wrap">
                    <strong id="${EDITOR_IDS.qualityScoreId}" class="stx-memory-chat-strategy-quality-score">--</strong>
                    <span id="${EDITOR_IDS.qualityLevelId}" class="stx-memory-chat-strategy-quality-level">--</span>
                  </div>
                  <div id="${EDITOR_IDS.qualityReasonsId}" class="stx-memory-chat-strategy-pill-wrap" style="margin-top: 8px;">
                    <span class="stx-memory-chat-strategy-empty">暂无状态说明</span>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="展示各维度的得分情况。满管表示该维度表现优异，缩水则代表存在数据稀疏或老化。">
                  <span class="stx-memory-chat-strategy-quality-label">各维度表现明细</span>
                  <div id="${EDITOR_IDS.qualityDimensionsId}" class="stx-memory-chat-strategy-quality-dimensions">
                    <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="展示向量库在该聊天下的激活深度与数据量。">
                  <span class="stx-memory-chat-strategy-quality-label">向量引擎运转状态</span>
                  <strong id="${EDITOR_IDS.qualityVectorModeId}" class="stx-memory-chat-strategy-quality-meta" style="color: var(--stx-memory-info);">--</strong>
                  <div class="stx-memory-chat-strategy-quality-stats">
                    <div id="${EDITOR_IDS.qualityVectorStatsId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                    <div id="${EDITOR_IDS.qualityVectorTimesId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                  </div>
                  <button type="button" class="menu_button" data-open-vector-viewer="1" style="margin-top: 10px; align-self: flex-start;">
                    <i class="fa-solid fa-vector-square"></i> 查看向量明细
                  </button>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="展示主链最近一次真实执行证据：入口、append、trusted write、recall 与 prompt 注入。">
                  <span class="stx-memory-chat-strategy-quality-label">主链执行证据</span>
                  <div id="${EDITOR_IDS.qualityTraceEvidenceId}" class="stx-memory-chat-strategy-quality-list">
                    <span class="stx-memory-chat-strategy-empty">等待主链执行记录</span>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="系统根据数据表现自动生成的保养建议。如果这里空空如也，说明一切正常。">
                  <span class="stx-memory-chat-strategy-quality-label">系统维护与保养建议</span>
                  <div id="${EDITOR_IDS.qualityAdviceId}" class="stx-memory-chat-strategy-quality-list">
                    <span class="stx-memory-chat-strategy-empty">暂无建议，继续保持</span>
                  </div>
                </article>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head" data-tip="面板展示了当前聊天在实际运行中的具体策略参数。这里的数据是系统融合了默认预设、全局覆盖和当前聊天自定义设置后最终生效的结果，主要用来帮你诊断配置有没有如你希望的那样工作。">
                <div>
                  <h3>底层运行诊断面板</h3>
                  <p>监控系统如何处理自动策略与人工覆盖的合并效果，以及近期调参指标。</p>
                </div>
              </div>
              <details id="${EDITOR_IDS.diagnosticBasicDetailsId}" class="stx-memory-chat-strategy-diagnostic-group" open>
                <summary>
                  <span>基础诊断</span>
                  <small>先看这组：本轮怎么注入、最终怎么生效、生成前后 gate 如何决策。</small>
                </summary>
                <div id="${EDITOR_IDS.diagnosticBasicGridId}" class="stx-memory-chat-strategy-diagnostic-grid stx-memory-chat-strategy-diagnostic-grid-basic">
                  ${buildJsonCardMarkup(EDITOR_IDS.finalBlockId, '结合生效方案', '这里显示的是系统当下正在使用的最终规则。当你觉得某个功能（比如抽取或者向量激活）没有按你的设置生效时，可以先来这里确认一下最终混合出的参数对不对。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.decisionBlockId, '最新执行决策', '这代表了 AI 最近一次回答时，底层都捞取了什么记忆。你能在这里看到是不是漏找了关键设定，或者是否多塞了无关紧要的记忆进去。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.preDecisionBlockId, '生成前 gate', 'AI 生成前系统做的判断：比如它有没有打算去搜索向量库？分配了多少预算给额外上下文？这有助于你诊断系统在发问前是不是已经定错了搜索方向。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.processingDecisionBlockId, '处理等级决策', '本轮最终采用的不处理 / 轻处理 / 中处理 / 重处理决定。这里会把短总结、长总结、抽取范围和冷却命中一起展示出来。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.longSummaryCooldownBlockId, '长总结冷却', '这里显示最近一次长总结和重处理的时间、命中的窗口哈希，以及为什么当前轮次会降级或跳过。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.postDecisionBlockId, '生成后 gate 输入', '生成后 gate 只作为底层输入快照，不再代表最终执行结果。')}
                </div>
              </details>
              <details id="${EDITOR_IDS.diagnosticAdvancedDetailsId}" class="stx-memory-chat-strategy-diagnostic-group">
                <summary>
                  <span>高级诊断</span>
                  <small>深入定位时再展开：自动推断、人工覆盖与上下文动态指标。</small>
                </summary>
                <div id="${EDITOR_IDS.diagnosticAdvancedGridId}" class="stx-memory-chat-strategy-diagnostic-grid stx-memory-chat-strategy-diagnostic-grid-advanced">
                  ${buildJsonCardMarkup(EDITOR_IDS.autoBlockId, '系统自动推测', '这里指的是系统在没有任何干预下，默认认为当前聊天应该用什么策略。你可以对比一下它和“结合生效方案”的差异。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.overrideBlockId, '人工锁定设置', '显示你为了这个聊天单独做了哪些参数覆盖。只有在这里看到的值，才代表了你真正成功锁定的个性化配置。')}
                  ${buildJsonCardMarkup(EDITOR_IDS.metricsBlockId, '上下文动态指标', '这部分记录了聊天过程中各项活动的频次，比如总结了多少次、抽取了多少事实等。数字变化太快或太慢都能帮你决定要不要去调上面的阈值。')}
                </div>
              </details>
            </section>
          </main>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：为旧版编辑器补充“场景预设 / 简易调整 / 双 gate 诊断”区块。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function buildCompactPanelMarkupV2(): string {
    const selectMarkup: string = buildSharedSelectField({
        id: PANEL_IDS.chatSelectId,
        containerClassName: 'stx-shared-select-fluid stx-shared-select-inline',
        selectClassName: 'stx-ui-input',
        triggerClassName: 'stx-ui-input-full stx-shared-select-trigger-input',
        triggerAttributes: {
            'data-tip': '切换要查看的聊天策略总览。',
        },
        options: [{
            value: '',
            label: '正在加载聊天...',
            media: {
                type: 'icon',
                iconClassName: 'fa-solid fa-comments',
            },
        }],
    });
    const openButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.openBtnId,
        label: '打开编辑器',
        iconClassName: 'fa-solid fa-expand',
        className: 'stx-memory-chat-strategy-open',
        attributes: {
            'data-tip': '打开全屏聊天策略画像编辑器。',
        },
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.refreshBtnId,
        label: '刷新',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
        attributes: {
            'data-tip': '重新读取当前聊天的状态总览。',
        },
    });
    return `
      <div id="${PANEL_IDS.rootId}" class="stx-ui-item stx-ui-item-stack stx-memory-chat-strategy-card">
        <div class="stx-ui-divider">
          <i class="fa-solid fa-sliders"></i>
          <span>聊天策略画像</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <div class="stx-memory-chat-strategy-card-head">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">当前聊天总览</div>
            <div class="stx-ui-item-desc">直接看角色、世界、关系和提醒，不用先理解专业参数。</div>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-card-toolbar">
          <label class="stx-memory-chat-strategy-card-field">
            <span class="stx-memory-chat-strategy-card-label">聊天</span>
            ${selectMarkup}
          </label>
          <div class="stx-memory-chat-strategy-card-actions">
            ${refreshButtonMarkup}
            ${openButtonMarkup}
          </div>
        </div>
        <div class="stx-memory-chat-strategy-dashboard-hero">
          <div class="stx-memory-chat-strategy-dashboard-copy">
            <strong id="${PANEL_IDS.summaryNameId}" class="stx-memory-chat-strategy-dashboard-title">未选择聊天</strong>
            <div id="${PANEL_IDS.summaryMetaId}" class="stx-memory-chat-strategy-dashboard-meta">等待加载当前聊天状态</div>
          </div>
          <div class="stx-memory-chat-strategy-dashboard-intent">
            <span class="stx-memory-chat-strategy-summary-label">当前氛围</span>
            <strong id="${PANEL_IDS.summaryIntentId}" class="stx-memory-chat-strategy-dashboard-intent-value">暂无</strong>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-dashboard-grid">
          <article id="${PANEL_IDS.summaryRoleId}" class="stx-memory-chat-strategy-dashboard-card">
            <span class="stx-memory-chat-strategy-empty">等待加载角色状态</span>
          </article>
          <article id="${PANEL_IDS.summaryWorldId}" class="stx-memory-chat-strategy-dashboard-card">
            <span class="stx-memory-chat-strategy-empty">等待加载世界情况</span>
          </article>
          <article id="${PANEL_IDS.summaryRelationId}" class="stx-memory-chat-strategy-dashboard-card">
            <span class="stx-memory-chat-strategy-empty">等待加载关系变化</span>
          </article>
          <article id="${PANEL_IDS.summaryReminderId}" class="stx-memory-chat-strategy-dashboard-card" data-tone="soft">
            <span class="stx-memory-chat-strategy-empty">等待加载系统提醒</span>
          </article>
        </div>
        <div class="stx-memory-chat-strategy-dashboard-foot">
          <div class="stx-memory-chat-strategy-dashboard-foot-copy">
            <span class="stx-memory-chat-strategy-card-label">系统最近在关注</span>
            <div id="${PANEL_IDS.summarySectionsId}" class="stx-memory-chat-strategy-pill-wrap">
              <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
            </div>
          </div>
          <button id="${PANEL_IDS.summaryMaintenanceActionId}" type="button" class="stx-memory-chat-strategy-summary-maintenance-action">
            打开详细调整
          </button>
        </div>
      </div>
    `.trim();
}

function buildEditorMarkupV2(): string {
    const searchInputMarkup: string = buildSharedInputField({
        id: EDITOR_IDS.chatSearchId,
        type: 'search',
        className: 'stx-memory-chat-strategy-search',
        attributes: {
            placeholder: '搜索聊天名',
            'data-tip': '按聊天名搜索左侧聊天列表。',
        },
    });
    const mobileToggleMarkup: string = buildSharedButton({
        id: EDITOR_IDS.mobileToggleBtnId,
        label: '聊天列表',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-comments',
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.refreshBtnId,
        label: '刷新',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
    });
    const recomputeButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.recomputeBtnId,
        label: '重新判断',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
    });
    const applyButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.applyBtnId,
        label: '保存调整',
        iconClassName: 'fa-solid fa-floppy-disk',
    });
    return `
      <div class="stx-memory-chat-strategy-editor">
        <div class="stx-memory-chat-strategy-header">
          <div class="stx-memory-chat-strategy-title-wrap">
            <div class="stx-memory-chat-strategy-title">
              <i class="fa-solid fa-sliders"></i>
              <span>聊天策略画像编辑器</span>
            </div>
            <div class="stx-memory-chat-strategy-subtitle">以用户体验为主，默认先看聊天状态，再做少量高频调节；技术细节统一收进高级里。</div>
          </div>
          <div class="stx-memory-chat-strategy-header-actions">
            ${mobileToggleMarkup}
            ${refreshButtonMarkup}
            ${recomputeButtonMarkup}
            ${applyButtonMarkup}
            <button id="${EDITOR_IDS.closeBtnId}" type="button" class="stx-memory-chat-strategy-close" aria-label="关闭聊天策略画像编辑器">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-body">
          <aside class="stx-memory-chat-strategy-sidebar">
            <div class="stx-memory-chat-strategy-sidebar-head">
              <span class="stx-memory-chat-strategy-sidebar-title">聊天列表</span>
              ${searchInputMarkup}
            </div>
            <div id="${EDITOR_IDS.chatListId}" class="stx-memory-chat-strategy-chat-list">
              <div class="stx-memory-chat-strategy-empty">正在加载聊天列表...</div>
            </div>
          </aside>
          <div class="stx-memory-chat-strategy-sidebar-scrim" aria-hidden="true"></div>
          <main class="stx-memory-chat-strategy-main">
            <section class="stx-memory-chat-strategy-hero">
              <div class="stx-memory-chat-strategy-hero-main">
                <div id="${EDITOR_IDS.currentChatNameId}" class="stx-memory-chat-strategy-hero-title">未选择聊天</div>
                <div id="${EDITOR_IDS.currentChatMetaId}" class="stx-memory-chat-strategy-hero-meta">等待加载当前聊天状态</div>
                <div id="${EDITOR_IDS.currentScopeId}" class="stx-memory-chat-strategy-hero-meta">等待加载系统工作方式</div>
              </div>
              <div class="stx-memory-chat-strategy-hero-side">
                <span class="stx-memory-chat-strategy-hero-label">当前氛围</span>
                <strong id="${EDITOR_IDS.currentIntentId}" class="stx-memory-chat-strategy-hero-intent">暂无</strong>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>现在这段聊天是什么状态</h3>
                  <p>直接看角色、世界、关系和提醒，先弄清楚系统目前看到了什么。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-hero-pills">
                <span class="stx-memory-chat-strategy-card-label">系统最近在关注</span>
                <div id="${EDITOR_IDS.sectionsWrapId}" class="stx-memory-chat-strategy-pill-wrap">
                  <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-dashboard-grid stx-memory-chat-strategy-dashboard-grid-editor">
                <article id="${EDITOR_IDS.overviewRoleId}" class="stx-memory-chat-strategy-dashboard-card">
                  <span class="stx-memory-chat-strategy-empty">等待加载角色状态</span>
                </article>
                <article id="${EDITOR_IDS.overviewWorldId}" class="stx-memory-chat-strategy-dashboard-card">
                  <span class="stx-memory-chat-strategy-empty">等待加载世界情况</span>
                </article>
                <article id="${EDITOR_IDS.overviewRelationId}" class="stx-memory-chat-strategy-dashboard-card">
                  <span class="stx-memory-chat-strategy-empty">等待加载关系变化</span>
                </article>
                <article id="${EDITOR_IDS.overviewReminderId}" class="stx-memory-chat-strategy-dashboard-card" data-tone="soft">
                  <span class="stx-memory-chat-strategy-empty">等待加载系统提醒</span>
                </article>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>我想让它更偏向什么</h3>
                  <p>这里只保留最常用的调整项，尽量避免让你一开始就掉进技术细节里。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-quick-grid">
                <article class="stx-memory-chat-strategy-quick-card">
                  <div class="stx-memory-chat-strategy-quick-card-head">
                    <h4>AI 记忆总结</h4>
                    <p>四块紧凑设置，直接决定总结方式、时机和重点。</p>
                  </div>
                  <div id="${EDITOR_IDS.summarySettingsMountId}" class="stx-memory-chat-strategy-summary-settings-host"></div>
                </article>
                <article class="stx-memory-chat-strategy-quick-card">
                  <div class="stx-memory-chat-strategy-quick-card-head">
                    <h4>聊天整体感觉</h4>
                    <p>决定它更像单聊、群聊，偏剧情还是偏说明。</p>
                  </div>
                  <div class="stx-memory-chat-strategy-control-grid">
                    ${buildEditorSelectField(EDITOR_IDS.chatTypeId, '聊天类型', '切换当前聊天的整体类型。', [
                        { value: 'solo', label: '单人' },
                        { value: 'group', label: '群聊' },
                        { value: 'worldbook', label: '设定问答' },
                        { value: 'tool', label: '工具协作' },
                    ])}
                    ${buildEditorSelectField(EDITOR_IDS.stylePreferenceId, '风格偏好', '调整这段聊天更偏剧情、问答还是设定说明。', [
                        { value: 'story', label: '剧情向' },
                        { value: 'qa', label: '问答向' },
                        { value: 'trpg', label: '跑团向' },
                        { value: 'info', label: '信息向' },
                    ])}
                    ${buildEditorSelectField(EDITOR_IDS.memoryStrengthId, '记忆强度', '控制系统记住当前聊天的力度。', [
                        { value: 'low', label: '轻' },
                        { value: 'medium', label: '中' },
                        { value: 'high', label: '强' },
                    ])}
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quick-card">
                  <div class="stx-memory-chat-strategy-quick-card-head">
                    <h4>摘要和清理方式</h4>
                    <p>决定它怎么总结这段聊天，以及聊天删除后怎么处理数据。</p>
                  </div>
                  <div class="stx-memory-chat-strategy-control-grid">
                    ${buildEditorSelectField(EDITOR_IDS.summaryStrategyId, '摘要倾向', '控制当前聊天的摘要组织方式。', [
                        { value: 'short', label: '短摘要' },
                        { value: 'layered', label: '分层摘要' },
                        { value: 'timeline', label: '时间轴' },
                    ])}
                    ${buildEditorSelectField(EDITOR_IDS.deletionStrategyId, '聊天删除后', '控制删除聊天时保留归档还是彻底清空。', [
                        { value: 'soft_delete', label: '保留归档' },
                        { value: 'immediate_purge', label: '彻底清空' },
                    ])}
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quick-card">
                  <div class="stx-memory-chat-strategy-quick-card-head">
                    <h4>角色与世界记忆</h4>
                    <p>控制是否联想更早的内容，以及是否跟踪多角色状态。</p>
                  </div>
                  <div class="stx-memory-chat-strategy-control-stack">
                    ${buildSharedCheckboxCard({
                        id: EDITOR_IDS.vectorEnabledId,
                        title: '联想更早的聊天内容',
                        description: '适合长线聊天；关闭后会更轻、更快。',
                        checkedLabel: '开启',
                        uncheckedLabel: '关闭',
                        containerClassName: 'stx-memory-chat-strategy-toggle',
                    })}
                    <div class="stx-memory-chat-strategy-control-grid">
                      ${buildSharedCheckboxCard({
                          id: EDITOR_IDS.groupLaneEnabledId,
                          title: '跟踪多个角色状态',
                          description: '群聊时更容易记住每个角色的情绪和目标。',
                          checkedLabel: '开启',
                          uncheckedLabel: '关闭',
                          containerClassName: 'stx-memory-chat-strategy-toggle',
                      })}
                      ${buildSharedCheckboxCard({
                          id: EDITOR_IDS.autoBootstrapSeedId,
                          title: '新聊天自动打底',
                          description: '新会话会优先补角色和世界的基础锚点。',
                          checkedLabel: '开启',
                          uncheckedLabel: '关闭',
                          containerClassName: 'stx-memory-chat-strategy-toggle',
                      })}
                    </div>
                  </div>
                </article>
              </div>
            </section>
            <details id="${EDITOR_IDS.advancedSettingsId}" class="stx-memory-chat-strategy-advanced">
              <summary class="stx-memory-chat-strategy-advanced-summary">
                <div>
                  <h3>高级与诊断</h3>
                  <p>详细阈值、维护动作和底层诊断都在这里，默认不打扰主流程。</p>
                </div>
                <span class="stx-memory-chat-strategy-pill">高级</span>
              </summary>
              <div class="stx-memory-chat-strategy-advanced-body">
                <section class="stx-memory-chat-strategy-section">
                  <div class="stx-memory-chat-strategy-section-head">
                    <div>
                      <h3>系统怎么帮我记</h3>
                      <p>调节摘要节奏、抽取范围、向量阈值和保留数量。</p>
                    </div>
                  </div>
                  <div class="stx-memory-chat-strategy-form-grid">
                    ${buildEditorSelectField(EDITOR_IDS.extractStrategyId, '抽取范围', '控制事实、关系和世界状态的抽取范围。', [
                        { value: 'facts_only', label: '只提事实' },
                        { value: 'facts_relations', label: '事实 + 关系' },
                        { value: 'facts_relations_world', label: '事实 + 关系 + 世界状态' },
                    ])}
                    ${buildEditorSelectField(EDITOR_IDS.deletionStrategyDirectId, '预设里的删除策略', '保存为预设时，默认采用保留归档还是彻底清空。', [
                        { value: 'soft_delete', label: '保留归档' },
                        { value: 'immediate_purge', label: '彻底清空' },
                    ])}
                    ${buildEditorInputField(EDITOR_IDS.profileRefreshDirectId, '多久重判一次聊天状态', '重新判断聊天类型、风格和记忆强度的间隔。', 'number', '1', '100', '1')}
                    ${buildEditorInputField(EDITOR_IDS.qualityRefreshDirectId, '多久刷新一次健康度', '重新评估记忆质量和维护提醒的间隔。', 'number', '1', '100', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorFactsDirectId, '多少条事实后开始联想', '达到这个数量后，会更积极调用长期记忆。', 'number', '1', '5000', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorChunkThresholdId, '记忆提炼阈值', '内容达到这个长度后更容易进入记忆卡提炼。', 'number', '50', '4000', '10')}
                    ${buildEditorInputField(EDITOR_IDS.rerankThresholdId, '候选多少条后精排', '结果越多时越需要二次筛选。', 'number', '1', '50', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorActivationFactsId, 'Facts 启动阈值', '事实数达到这个值后再优先走向量检索。', 'number', '1', '5000', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorActivationSummariesId, 'Summaries 启动阈值', '摘要数达到这个值后再优先走向量检索。', 'number', '1', '5000', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorIdleDecayDaysId, '多久不命中就降温', '长期没命中的向量内容会逐渐降权。', 'number', '1', '365', '1')}
                    ${buildEditorInputField(EDITOR_IDS.vectorLowPrecisionStrideId, '低精度时的降频步长', '控制向量搜索在低命中期的节奏。', 'number', '1', '30', '1')}
                    ${buildEditorInputField(EDITOR_IDS.keepSummaryCountId, '保留多少条摘要', '超过上限后会优先清理较旧摘要。', 'number', '10', '1000', '10')}
                    ${buildEditorInputField(EDITOR_IDS.keepEventCountId, '保留多少条事件', '超过上限后会优先清理较旧事件。', 'number', '50', '5000', '50')}
                    ${buildEditorInputField(EDITOR_IDS.keepVectorDaysId, '向量保留天数', '长期记忆内容最多保留多久。', 'number', '1', '365', '1')}
                  </div>
                </section>
                <section class="stx-memory-chat-strategy-section">
                  <div class="stx-memory-chat-strategy-section-head">
                    <div>
                      <h3>系统正在怎么帮我记</h3>
                      <p>主要看健康度、向量状态和需要注意的系统建议。</p>
                    </div>
                  </div>
                  <div class="stx-memory-chat-strategy-quality-grid">
                    <article class="stx-memory-chat-strategy-quality-card is-score">
                      <span class="stx-memory-chat-strategy-quality-label">当前记忆健康度</span>
                      <div class="stx-memory-chat-strategy-quality-score-wrap">
                        <strong id="${EDITOR_IDS.qualityScoreId}" class="stx-memory-chat-strategy-quality-score">--</strong>
                        <span id="${EDITOR_IDS.qualityLevelId}" class="stx-memory-chat-strategy-quality-level">--</span>
                      </div>
                      <div id="${EDITOR_IDS.qualityReasonsId}" class="stx-memory-chat-strategy-pill-wrap" style="margin-top: 8px;">
                        <span class="stx-memory-chat-strategy-empty">暂无状态说明</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card">
                      <span class="stx-memory-chat-strategy-quality-label">各项表现</span>
                      <div id="${EDITOR_IDS.qualityDimensionsId}" class="stx-memory-chat-strategy-quality-dimensions">
                        <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card">
                      <span class="stx-memory-chat-strategy-quality-label">长期记忆状态</span>
                      <strong id="${EDITOR_IDS.qualityVectorModeId}" class="stx-memory-chat-strategy-quality-meta" style="color: var(--stx-memory-info);">--</strong>
                      <div class="stx-memory-chat-strategy-quality-stats">
                        <div id="${EDITOR_IDS.qualityVectorStatsId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                        <div id="${EDITOR_IDS.qualityVectorTimesId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                      </div>
                      <button type="button" class="menu_button" data-open-vector-viewer="1" style="margin-top: 10px; align-self: flex-start;">
                        <i class="fa-solid fa-vector-square"></i> 查看向量明细
                      </button>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card">
                      <span class="stx-memory-chat-strategy-quality-label">系统建议</span>
                      <div id="${EDITOR_IDS.qualityAdviceId}" class="stx-memory-chat-strategy-quality-list">
                        <span class="stx-memory-chat-strategy-empty">暂无建议，继续保持</span>
                      </div>
                    </article>
                  </div>
                </section>
                <section class="stx-memory-chat-strategy-section">
                  <div class="stx-memory-chat-strategy-section-head">
                    <div>
                      <h3>维护和阶段</h3>
                      <p>查看这段聊天现在处在哪个阶段，以及系统建议你做什么。</p>
                    </div>
                  </div>
                  <div class="stx-memory-chat-strategy-lifecycle-grid">
                    <article id="${EDITOR_IDS.lifecycleHeroId}" class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-lifecycle-hero" data-stage="new">
                      <div class="stx-memory-chat-strategy-lifecycle-hero-head">
                        <span id="${EDITOR_IDS.lifecycleStageId}" class="stx-memory-chat-strategy-lifecycle-stage-badge">new</span>
                        <span id="${EDITOR_IDS.lifecycleMetaId}" class="stx-memory-chat-strategy-quality-subtext">--</span>
                      </div>
                      <div id="${EDITOR_IDS.lifecycleSummaryId}" class="stx-memory-chat-strategy-lifecycle-summary">--</div>
                      <div id="${EDITOR_IDS.lifecycleExplanationId}" class="stx-memory-chat-strategy-lifecycle-explanation">--</div>
                      <div id="${EDITOR_IDS.lifecycleReasonListId}" class="stx-memory-chat-strategy-pill-wrap stx-memory-chat-strategy-lifecycle-reasons">
                        <span class="stx-memory-chat-strategy-empty">暂无阶段原因</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-lifecycle-card">
                      <span class="stx-memory-chat-strategy-quality-label">最近变化时间线</span>
                      <div id="${EDITOR_IDS.lifecycleTimelineId}" class="stx-memory-chat-strategy-lifecycle-timeline">
                        <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-lifecycle-card">
                      <span class="stx-memory-chat-strategy-quality-label">当前影响</span>
                      <div id="${EDITOR_IDS.lifecycleImpactId}" class="stx-memory-chat-strategy-lifecycle-impact">
                        <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card">
                      <span class="stx-memory-chat-strategy-quality-label">预设来源</span>
                      <strong id="${EDITOR_IDS.presetScopeMetaId}" class="stx-memory-chat-strategy-quality-meta">--</strong>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card">
                      <span class="stx-memory-chat-strategy-quality-label">角色状态跟踪</span>
                      <strong id="${EDITOR_IDS.groupLaneMetaId}" class="stx-memory-chat-strategy-quality-meta">--</strong>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-quality-card-full-row">
                      <span class="stx-memory-chat-strategy-quality-label">角色和世界状态明细</span>
                      <div id="${EDITOR_IDS.groupLaneActorsId}" class="stx-memory-chat-strategy-group-memory">
                        <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                      </div>
                    </article>
                    <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-quality-card-full-row">
                      <span class="stx-memory-chat-strategy-quality-label">维护提醒</span>
                      <div id="${EDITOR_IDS.maintenanceInsightsId}" class="stx-memory-chat-strategy-quality-list">
                        <span class="stx-memory-chat-strategy-empty">暂无维护提示</span>
                      </div>
                    </article>
                  </div>
                </section>
                <section class="stx-memory-chat-strategy-section">
                  <div class="stx-memory-chat-strategy-section-head">
                    <div>
                      <h3>完整诊断</h3>
                      <p>需要排查底层行为时再展开，看系统自动决策和最终结果。</p>
                    </div>
                  </div>
                  <details id="${EDITOR_IDS.diagnosticBasicDetailsId}" class="stx-memory-chat-strategy-diagnostic-group" open>
                    <summary>
                      <span>基础诊断</span>
                      <small>先看最终生效方案、最近决策和前后 gate 的结果。</small>
                    </summary>
                    <div id="${EDITOR_IDS.diagnosticBasicGridId}" class="stx-memory-chat-strategy-diagnostic-grid stx-memory-chat-strategy-diagnostic-grid-basic">
                      ${buildJsonCardMarkup(EDITOR_IDS.finalBlockId, '最终生效方案', '系统当前真正采用的综合策略。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.decisionBlockId, '最近一次注入决策', '最近一次生成时，系统实际选用了哪些记忆模块。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.preDecisionBlockId, '生成前 gate', '生成前对检索、预算和注入的判断结果。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.processingDecisionBlockId, '处理等级决策', '本轮究竟落在不处理、轻处理、中处理还是重处理。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.longSummaryCooldownBlockId, '长总结冷却', '这里记录长总结是否被同窗口拦截、最近一次重处理是什么时候。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.postDecisionBlockId, '生成后 gate 输入', '生成后 gate 只保留为输入快照，不再是最终结论。')}
                    </div>
                  </details>
                  <details id="${EDITOR_IDS.diagnosticAdvancedDetailsId}" class="stx-memory-chat-strategy-diagnostic-group">
                    <summary>
                      <span>高级诊断</span>
                      <small>深入定位时再展开：自动推断、手动覆盖和上下文指标。</small>
                    </summary>
                    <div id="${EDITOR_IDS.diagnosticAdvancedGridId}" class="stx-memory-chat-strategy-diagnostic-grid stx-memory-chat-strategy-diagnostic-grid-advanced">
                      ${buildJsonCardMarkup(EDITOR_IDS.autoBlockId, '系统自动推断', '系统在没有人工干预时默认认为当前聊天该怎么记。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.overrideBlockId, '手动覆盖设置', '你对当前聊天显式保存过的覆盖项。')}
                      ${buildJsonCardMarkup(EDITOR_IDS.metricsBlockId, '动态指标', '最近这段聊天的活跃度、密度和命中情况。')}
                    </div>
                  </details>
                </section>
              </div>
            </details>
          </main>
        </div>
      </div>
    `.trim();
}

function ensureEditorSections(overlay: HTMLElement): void {
    if (!overlay.querySelector(`#${EDITOR_IDS.summarySettingsMountId}`)) {
        const anchorWrap: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.sectionsWrapId}`) as HTMLElement | null;
        const anchorSection: HTMLElement | null = anchorWrap?.closest('.stx-memory-chat-strategy-section') as HTMLElement | null;
        if (anchorSection) {
            const summaryHost = document.createElement('section');
            summaryHost.className = 'stx-memory-chat-strategy-section';
            summaryHost.innerHTML = `
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>AI 记忆总结</h3>
                  <p>四块紧凑设置，直接决定总结方式、时机和重点。</p>
                </div>
              </div>
              <div id="${EDITOR_IDS.summarySettingsMountId}" class="stx-memory-chat-strategy-summary-settings-host"></div>
            `.trim();
            anchorSection.insertAdjacentElement('afterend', summaryHost);
        }
    }

    if (!overlay.querySelector(`#${EDITOR_IDS.maintenanceInsightsId}`)) {
        const qualitySection = overlay.querySelector(`#${EDITOR_IDS.qualityScoreId}`)?.closest('.stx-memory-chat-strategy-section') as HTMLElement | null;
        if (qualitySection) {
            const maintenanceMarkup = `
              <section class="stx-memory-chat-strategy-section">
                <div class="stx-memory-chat-strategy-section-head">
                  <div>
                    <h3>维护感知</h3>
                    <p>面向当前聊天的可执行维护提示。只在执行动作后显示 Toast。</p>
                  </div>
                </div>
                <div id="${EDITOR_IDS.maintenanceInsightsId}" class="stx-memory-chat-strategy-quality-list">
                  <span class="stx-memory-chat-strategy-empty">暂无维护提示</span>
                </div>
              </section>
              <section class="stx-memory-chat-strategy-section">
                <div class="stx-memory-chat-strategy-section-head">
                  <div>
                    <h3>聊天生命周期</h3>
                    <p>快速看懂当前阶段、判断原因和默认偏向。</p>
                  </div>
                </div>
                <div class="stx-memory-chat-strategy-quality-grid stx-memory-chat-strategy-lifecycle-grid">
                  <article id="${EDITOR_IDS.lifecycleHeroId}" class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-quality-card-full-row stx-memory-chat-strategy-lifecycle-hero" data-stage="new">
                    <span class="stx-memory-chat-strategy-quality-label">当前状态</span>
                    <div class="stx-memory-chat-strategy-lifecycle-hero-head">
                      <strong id="${EDITOR_IDS.lifecycleStageId}" class="stx-memory-chat-strategy-quality-meta stx-memory-chat-strategy-lifecycle-stage-badge">--</strong>
                      <div id="${EDITOR_IDS.lifecycleSummaryId}" class="stx-memory-chat-strategy-lifecycle-summary">--</div>
                    </div>
                    <div id="${EDITOR_IDS.lifecycleExplanationId}" class="stx-memory-chat-strategy-lifecycle-explanation">--</div>
                    <div id="${EDITOR_IDS.lifecycleReasonListId}" class="stx-memory-chat-strategy-pill-wrap stx-memory-chat-strategy-lifecycle-reasons">
                      <span class="stx-memory-chat-strategy-empty">正在整理判断依据...</span>
                    </div>
                  </article>
                  <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-lifecycle-card">
                    <span class="stx-memory-chat-strategy-quality-label">关键时间点</span>
                    <div id="${EDITOR_IDS.lifecycleTimelineId}" class="stx-memory-chat-strategy-lifecycle-timeline">
                      <span class="stx-memory-chat-strategy-empty">正在整理时间线...</span>
                    </div>
                  </article>
                  <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-lifecycle-card">
                    <span class="stx-memory-chat-strategy-quality-label">这代表什么</span>
                    <div id="${EDITOR_IDS.lifecycleImpactId}" class="stx-memory-chat-strategy-lifecycle-impact">--</div>
                    <div id="${EDITOR_IDS.lifecycleMetaId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                  </article>
                  <article class="stx-memory-chat-strategy-quality-card">
                    <span class="stx-memory-chat-strategy-quality-label">当前策略主要来自</span>
                    <strong id="${EDITOR_IDS.presetScopeMetaId}" class="stx-memory-chat-strategy-quality-meta">--</strong>
                    <div class="stx-memory-chat-strategy-quality-subtext">显示当前真正生效的主来源。</div>
                  </article>
                  <article class="stx-memory-chat-strategy-quality-card stx-memory-chat-strategy-quality-card-full-row">
                    <span class="stx-memory-chat-strategy-quality-label">群聊分轨状态</span>
                    <strong id="${EDITOR_IDS.groupLaneMetaId}" class="stx-memory-chat-strategy-quality-meta">--</strong>
                    <div id="${EDITOR_IDS.groupLaneActorsId}" class="stx-memory-chat-strategy-quality-subtext">正在加载分轨卡片...</div>
                  </article>
                </div>
              </section>
            `.trim();
            qualitySection.insertAdjacentHTML('beforebegin', maintenanceMarkup);
        }
    }

    ensureAdvancedSettingsFold(overlay);

    const basicDiagnosticGrid: HTMLElement | null =
        (overlay.querySelector(`#${EDITOR_IDS.diagnosticBasicGridId}`) as HTMLElement | null)
        ?? (overlay.querySelector('.stx-memory-chat-strategy-diagnostic-grid') as HTMLElement | null);
    if (basicDiagnosticGrid) {
        if (!overlay.querySelector(`#${EDITOR_IDS.preDecisionBlockId}`)) {
            basicDiagnosticGrid.insertAdjacentHTML(
                'beforeend',
                buildJsonCardMarkup(EDITOR_IDS.preDecisionBlockId, '生成前 gate', '查看生成前的注入、预算与锚点决策。'),
            );
        }
        if (!overlay.querySelector(`#${EDITOR_IDS.postDecisionBlockId}`)) {
            basicDiagnosticGrid.insertAdjacentHTML(
                'beforeend',
                buildJsonCardMarkup(EDITOR_IDS.postDecisionBlockId, '生成后 gate 输入', '查看生成后 gate 的底层输入快照。'),
            );
        }
        if (!overlay.querySelector(`#${EDITOR_IDS.processingDecisionBlockId}`)) {
            basicDiagnosticGrid.insertAdjacentHTML(
                'beforeend',
                buildJsonCardMarkup(EDITOR_IDS.processingDecisionBlockId, '处理等级决策', '查看本轮最终采用的处理等级。'),
            );
        }
        if (!overlay.querySelector(`#${EDITOR_IDS.longSummaryCooldownBlockId}`)) {
            basicDiagnosticGrid.insertAdjacentHTML(
                'beforeend',
                buildJsonCardMarkup(EDITOR_IDS.longSummaryCooldownBlockId, '长总结冷却', '查看长总结冷却是否命中。'),
            );
        }
    }
}

/**
 * 功能：把技术参数区块折叠到“高级设置”里，默认收起直白参数之外的复杂项。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function ensureAdvancedSettingsFold(overlay: HTMLElement): void {
    if (overlay.querySelector(`#${EDITOR_IDS.advancedSettingsId}`)) {
        return;
    }
    const profileSection = overlay.querySelector(`#${EDITOR_IDS.chatTypeId}`)?.closest('.stx-memory-chat-strategy-section') as HTMLElement | null;
    const extractSection = overlay.querySelector(`#${EDITOR_IDS.extractStrategyId}`)?.closest('.stx-memory-chat-strategy-section') as HTMLElement | null;
    const vectorSection = overlay.querySelector(`#${EDITOR_IDS.vectorChunkThresholdId}`)?.closest('.stx-memory-chat-strategy-section') as HTMLElement | null;
    if (!profileSection || !extractSection || !vectorSection) {
        return;
    }
    const host = profileSection.parentElement;
    if (!host || host !== extractSection.parentElement || host !== vectorSection.parentElement) {
        return;
    }
    const details = document.createElement('details');
    details.id = EDITOR_IDS.advancedSettingsId;
    details.className = 'stx-memory-chat-strategy-section stx-memory-chat-strategy-advanced';
    const summary = document.createElement('summary');
    summary.className = 'stx-memory-chat-strategy-advanced-summary';
    summary.innerHTML = `
      <div>
        <h3>高级设置</h3>
        <p>这里包含技术阈值与底层策略，通常先调“场景预设”和“直白参数”即可。</p>
      </div>
    `.trim();
    const body = document.createElement('div');
    body.className = 'stx-memory-chat-strategy-advanced-body';
    details.appendChild(summary);
    details.appendChild(body);
    profileSection.insertAdjacentElement('beforebegin', details);
    body.appendChild(profileSection);
    body.appendChild(extractSection);
    body.appendChild(vectorSection);
}

/**
 * 功能：构建编辑器中的共享下拉字段。
 * @param id 字段 ID。
 * @param label 字段标题。
 * @param tip 提示文本。
 * @param options 下拉选项列表。
 * @returns 字段 HTML 字符串。
 */
function buildEditorSelectField(
    id: string,
    label: string,
    tip: string,
    options: Array<{ value: string; label: string }>,
): string {
    const selectMarkup: string = buildSharedSelectField({
        id,
        containerClassName: 'stx-memory-chat-strategy-select',
        selectClassName: 'stx-memory-chat-strategy-input',
        triggerClassName: 'stx-memory-chat-strategy-input',
        triggerAttributes: {
            'data-tip': tip,
        },
        options,
    });
    return `
      <label class="stx-memory-chat-strategy-field">
        <span class="stx-memory-chat-strategy-field-label">${label}</span>
        ${selectMarkup}
      </label>
    `.trim();
}

/**
 * 功能：构建编辑器中的共享输入字段。
 * @param id 字段 ID。
 * @param label 字段标题。
 * @param tip 提示文本。
 * @param type 输入类型。
 * @param min 最小值。
 * @param max 最大值。
 * @param step 步长。
 * @returns 字段 HTML 字符串。
 */
function buildEditorInputField(
    id: string,
    label: string,
    tip: string,
    type: 'text' | 'number' | 'search' | 'password',
    min?: string,
    max?: string,
    step?: string,
): string {
    const inputMarkup: string = buildSharedInputField({
        id,
        type,
        className: 'stx-memory-chat-strategy-input',
        attributes: {
            min,
            max,
            step,
            'data-tip': tip,
        },
    });
    return `
      <label class="stx-memory-chat-strategy-field">
        <span class="stx-memory-chat-strategy-field-label">${label}</span>
        ${inputMarkup}
      </label>
    `.trim();
}

/**
 * 功能：构建直观卡片。
 * @param bodyId 内容区域 ID。
 * @param title 卡片标题。
 * @param description 卡片描述。
 * @returns 卡片 HTML 字符串。
 */
function buildJsonCardMarkup(bodyId: string, title: string, description: string): string {
    return `
      <details class="stx-memory-chat-strategy-json-card" open>
        <summary data-tip="${description}">
          <span>${title}</span>
          <small>${description}</small>
        </summary>
        <div id="${bodyId}" class="stx-memory-chat-strategy-pretty-body">等待加载...</div>
      </details>
    `.trim();
}

/**
 * 功能：绑定概览卡交互事件。
 * @returns 无返回值。
 */
function bindCompactPanelListeners(): void {
    if (panelListenersBound) {
        return;
    }
    panelListenersBound = true;

    const chatSelect: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    chatSelect?.addEventListener('change', (): void => {
        selectedChatKey = String(chatSelect.value || '').trim();
        void renderCompactPanelStateV2(selectedChatKey);
    });

    const openBtn: HTMLButtonElement | null = document.getElementById(PANEL_IDS.openBtnId) as HTMLButtonElement | null;
    openBtn?.addEventListener('click', (): void => {
        void openChatStrategyEditor();
    });

    const refreshBtn: HTMLButtonElement | null = document.getElementById(PANEL_IDS.refreshBtnId) as HTMLButtonElement | null;
    refreshBtn?.addEventListener('click', (): void => {
        void refreshChatStrategyChatOptions().then(async (): Promise<void> => {
            if (selectedChatKey) {
                await renderCompactPanelStateV2(selectedChatKey);
            }
        });
    });

    const maintenanceActionBtn: HTMLButtonElement | null = document.getElementById(PANEL_IDS.summaryMaintenanceActionId) as HTMLButtonElement | null;
    maintenanceActionBtn?.addEventListener('click', (): void => {
        void openChatStrategyEditor();
    });
}

/**
 * 功能：在设置页打开后自动重试读取当前聊天策略，避免依赖手动刷新。
 * @returns 无返回值。
 */
function scheduleAutoLoadChatStrategyPanel(): void {
    if (autoLoadTimerId !== null) {
        window.clearTimeout(autoLoadTimerId);
        autoLoadTimerId = null;
    }
    autoLoadAttempts = 0;
    void runAutoLoadChatStrategyPanel();
}

/**
 * 功能：执行聊天策略概览卡的自动加载与重试逻辑。
 * @returns 无返回值。
 */
async function runAutoLoadChatStrategyPanel(): Promise<void> {
    const currentChatKey: string = getCurrentChatKey();
    if (currentChatKey) {
        selectedChatKey = currentChatKey;
    }
    await refreshChatStrategyChatOptions();
    if (selectedChatKey) {
        await renderCompactPanelStateV2(selectedChatKey);
    }
    if (!shouldRetryAutoLoad()) {
        autoLoadTimerId = null;
        return;
    }
    autoLoadAttempts += 1;
    autoLoadTimerId = window.setTimeout((): void => {
        void runAutoLoadChatStrategyPanel();
    }, CHAT_STRATEGY_AUTO_LOAD_INTERVAL_MS);
}

/**
 * 功能：判断当前是否需要继续自动重试加载聊天策略摘要。
 * @returns 是否继续重试。
 */
function shouldRetryAutoLoad(): boolean {
    if (autoLoadAttempts >= CHAT_STRATEGY_AUTO_LOAD_MAX_ATTEMPTS) {
        return false;
    }
    if (!getCurrentChatKey()) {
        return true;
    }
    if (!cachedChatOptions.length) {
        return true;
    }
    return false;
}

/**
 * 功能：绑定编辑器内部事件。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function bindEditorListeners(overlay: HTMLElement): void {
    const closeBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.closeBtnId}`) as HTMLButtonElement | null;
    const mobileToggleBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.mobileToggleBtnId}`) as HTMLButtonElement | null;
    const refreshBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.refreshBtnId}`) as HTMLButtonElement | null;
    const recomputeBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.recomputeBtnId}`) as HTMLButtonElement | null;
    const applyBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.applyBtnId}`) as HTMLButtonElement | null;
    const summarySaveGlobalBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.summarySaveGlobalBtnId}`) as HTMLButtonElement | null;
    const summarySaveChatBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.summarySaveChatBtnId}`) as HTMLButtonElement | null;
    const summaryClearChatBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.summaryClearChatBtnId}`) as HTMLButtonElement | null;
    const summaryResetBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.summaryResetBtnId}`) as HTMLButtonElement | null;
    const chatSearchInput: HTMLInputElement | null = overlay.querySelector(`#${EDITOR_IDS.chatSearchId}`) as HTMLInputElement | null;
    const chatList: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.chatListId}`) as HTMLElement | null;

    closeBtn?.addEventListener('click', (): void => {
        closeEditor(overlay);
    });
    mobileToggleBtn?.addEventListener('click', (): void => {
        overlay.classList.toggle('is-sidebar-open');
    });
    refreshBtn?.addEventListener('click', (): void => {
        void syncEditorChatOptions(overlay, selectedChatKey).then(async (): Promise<void> => {
            if (selectedChatKey) {
                await renderEditorStateV2(overlay, selectedChatKey);
            }
        });
    });
    recomputeBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void recomputeSelectedChatPolicy(selectedChatKey).then(async (): Promise<void> => {
            await renderEditorStateV2(overlay, selectedChatKey);
            await renderCompactPanelStateV2(selectedChatKey);
        });
    });
    applyBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void applySelectedChatOverrides(overlay, selectedChatKey).then(async (): Promise<void> => {
            await renderEditorStateV2(overlay, selectedChatKey);
            await renderCompactPanelStateV2(selectedChatKey);
        });
    });
    summarySaveGlobalBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void saveSummarySettingsForChat(overlay, selectedChatKey, 'global').then(async (): Promise<void> => {
            await renderEditorStateV2(overlay, selectedChatKey);
        });
    });
    summarySaveChatBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void saveSummarySettingsForChat(overlay, selectedChatKey, 'chat').then(async (): Promise<void> => {
            await renderEditorStateV2(overlay, selectedChatKey);
        });
    });
    summaryClearChatBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void clearSummarySettingsOverrideForChat(selectedChatKey).then(async (): Promise<void> => {
            await renderEditorStateV2(overlay, selectedChatKey);
        });
    });
    summaryResetBtn?.addEventListener('click', (): void => {
        fillSummarySettingsForm(overlay, DEFAULT_SUMMARY_SETTINGS, null);
    });
    chatSearchInput?.addEventListener('input', (): void => {
        applyChatListFilter(overlay, String(chatSearchInput.value || ''));
    });
    chatList?.addEventListener('click', (event: Event): void => {
        const target: HTMLElement | null = (event.target as HTMLElement).closest<HTMLElement>('[data-chat-key]');
        if (!target) {
            return;
        }
        selectedChatKey = String(target.dataset.chatKey || '').trim();
        if (!selectedChatKey) {
            return;
        }
        overlay.classList.remove('is-sidebar-open');
        void renderEditorStateV2(overlay, selectedChatKey).then(async (): Promise<void> => {
            await renderCompactPanelStateV2(selectedChatKey);
        });
    });
    overlay.addEventListener('click', (event: Event): void => {
        const target: EventTarget | null = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const vectorViewerBtn = target.closest<HTMLElement>('[data-open-vector-viewer]');
        if (vectorViewerBtn) {
            void openRecordEditor({ initialView: 'vector' });
            return;
        }
        if (target.classList.contains('stx-memory-chat-strategy-sidebar-scrim')) {
            overlay.classList.remove('is-sidebar-open');
        }
    });
}

/**
 * 功能：创建用于关闭编辑器的 Esc 处理器。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 键盘事件处理函数。
 */
function closeEditor(_overlay?: HTMLElement): void {
    void closeSharedDialog(EDITOR_IDS.overlayId, 'button');
}

function buildChatListMetaLabel(item: ChatOption): string {
    const scopeLabel = item.iconClassName === 'fa-solid fa-users' ? '群聊会话' : '角色会话';
    const suffixMatch = item.label.match(/\(([^)]+)\)\s*$/);
    const shortRef = suffixMatch?.[1] ? String(suffixMatch[1]).trim() : '';
    return shortRef ? `${scopeLabel} · ${shortRef}` : scopeLabel;
}

/**
 * 功能：同步编辑器中的聊天列表与当前选中项。
 * @param overlay 编辑器遮罩层根节点。
 * @param currentChatKey 当前选中的聊天键。
 * @returns 无返回值。
 */
async function syncEditorChatOptions(overlay: HTMLElement, currentChatKey: string): Promise<void> {
    cachedChatOptions = await loadChatOptions();
    const chatList: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.chatListId}`) as HTMLElement | null;
    if (!chatList) {
        return;
    }
    if (cachedChatOptions.length === 0) {
        chatList.innerHTML = '<div class="stx-memory-chat-strategy-empty">当前 Tavern 下没有可用聊天。</div>';
        applyChatStrategyTooltips();
        return;
    }
    chatList.innerHTML = cachedChatOptions
        .map((item: ChatOption): string => {
            const isActive: boolean = item.value === currentChatKey;
            const mediaMarkup: string = item.avatarUrl
                ? `<span class="stx-memory-chat-strategy-chat-avatar"><img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.label)}" /></span>`
                : `<span class="stx-memory-chat-strategy-chat-avatar is-icon"><i class="${escapeHtml(item.iconClassName || 'fa-solid fa-user')}"></i></span>`;
            return `
              <button type="button" class="stx-memory-chat-strategy-chat-item${isActive ? ' is-active' : ''}" data-chat-key="${escapeHtml(item.value)}" title="${escapeHtml(item.value)}">
                ${mediaMarkup}
                <span class="stx-memory-chat-strategy-chat-copy">
                  <span class="stx-memory-chat-strategy-chat-name">${escapeHtml(item.label)}</span>
                  <span class="stx-memory-chat-strategy-chat-key">${escapeHtml(buildChatListMetaLabel(item))}</span>
                </span>
              </button>
            `.trim();
        })
        .join('');
    applyChatListFilter(overlay, String((overlay.querySelector(`#${EDITOR_IDS.chatSearchId}`) as HTMLInputElement | null)?.value || ''));
    applyChatStrategyTooltips();
}

/**
 * 功能：根据搜索关键字过滤编辑器中的聊天列表。
 * @param overlay 编辑器遮罩层根节点。
 * @param keyword 搜索关键字。
 * @returns 无返回值。
 */
function applyChatListFilter(overlay: HTMLElement, keyword: string): void {
    const normalizedKeyword: string = keyword.trim().toLowerCase();
    overlay.querySelectorAll<HTMLElement>('.stx-memory-chat-strategy-chat-item').forEach((item: HTMLElement): void => {
        const text: string = item.textContent?.toLowerCase() || '';
        item.hidden = Boolean(normalizedKeyword) && !text.includes(normalizedKeyword);
    });
}

function pickPrimaryLane(snapshot: ChatStrategySnapshot): GroupMemoryState['lanes'][number] | null {
    const groupMemory = snapshot.groupMemory;
    const lanes = Array.isArray(groupMemory?.lanes) ? [...groupMemory.lanes] : [];
    if (lanes.length === 0) {
        return null;
    }
    const salienceMap: Map<string, number> = new Map(
        (Array.isArray(groupMemory?.actorSalience) ? groupMemory.actorSalience : []).map((item) => [item.actorKey, Number(item.score ?? 0)]),
    );
    lanes.sort((left, right): number => {
        const salienceDelta = Number(salienceMap.get(right.actorKey) ?? 0) - Number(salienceMap.get(left.actorKey) ?? 0);
        if (salienceDelta !== 0) {
            return salienceDelta;
        }
        return Number(right.lastActiveAt ?? 0) - Number(left.lastActiveAt ?? 0);
    });
    return lanes[0] ?? null;
}

function buildDashboardCardMarkup(card: ReadableStrategyCard): string {
    const toneAttr = card.tone ? ` data-tone="${escapeHtml(card.tone)}"` : '';
    const footMarkup = card.foot
        ? `<div class="stx-memory-chat-strategy-dashboard-card-foot">${escapeHtml(card.foot)}</div>`
        : '';
    return `
      <div class="stx-memory-chat-strategy-dashboard-card-inner"${toneAttr}>
        <span class="stx-memory-chat-strategy-dashboard-card-label">${escapeHtml(card.label)}</span>
        <strong class="stx-memory-chat-strategy-dashboard-card-title">${escapeHtml(card.title)}</strong>
        <div class="stx-memory-chat-strategy-dashboard-card-detail">${escapeHtml(card.detail)}</div>
        ${footMarkup}
      </div>
    `.trim();
}

function writeDashboardCard(root: ParentNode, id: string, card: ReadableStrategyCard): void {
    const element: HTMLElement | null = root.querySelector(`#${id}`) as HTMLElement | null;
    if (!element) {
        return;
    }
    if (card.tone) {
        element.dataset.tone = card.tone;
    } else {
        delete element.dataset.tone;
    }
    element.innerHTML = buildDashboardCardMarkup(card);
}

function buildReadableStrategyDashboard(snapshot: ChatStrategySnapshot): ReadableStrategyDashboard {
    const primaryLane = pickPrimaryLane(snapshot);
    const sharedScene = snapshot.groupMemory?.sharedScene;
    const scene = String(sharedScene?.currentScene ?? '').trim();
    const conflict = String(sharedScene?.currentConflict ?? '').trim();
    const consensus = Array.isArray(sharedScene?.groupConsensus) ? sharedScene.groupConsensus.filter(Boolean) : [];
    const pendingEvents = Array.isArray(sharedScene?.pendingEvents) ? sharedScene.pendingEvents.filter(Boolean) : [];
    const topAlert = pickTopMaintenanceAlert(snapshot.maintenanceInsights);
    const activeActors = Array.isArray(snapshot.groupMemory?.actorSalience)
        ? snapshot.groupMemory!.actorSalience
            .slice(0, 3)
            .map((item) => {
                const lane = snapshot.groupMemory?.lanes.find((candidate) => candidate.actorKey === item.actorKey);
                return String(lane?.displayName || item.actorKey || '').trim();
            })
            .filter((item: string): boolean => Boolean(item))
        : [];
    const meta = [
        formatChatTypeLabel(snapshot.effectiveProfile.chatType),
        formatStyleLabel(snapshot.effectiveProfile.stylePreference),
        `记忆${formatMemoryStrengthLabel(snapshot.effectiveProfile.memoryStrength)}`,
        snapshot.effectiveProfile.vectorStrategy.enabled ? '会联想更早内容' : '偏轻量记忆',
        formatMainlineTraceStatus(snapshot.mainlineTraceSnapshot),
        formatProcessingDecisionSummary(snapshot.processingDecision),
    ].join(' · ');
    const scope = `${formatSummarySourceLabel(snapshot.summarySettingsSource)} · ${formatGroupLaneSummary(snapshot.groupMemory, snapshot.effectivePolicy.groupLaneEnabled)} · ${formatMainlineTraceStatus(snapshot.mainlineTraceSnapshot)}`;
    const roleBits: string[] = [];
    if (primaryLane?.lastEmotion) {
        roleBits.push(`情绪偏 ${formatLaneEmotionLabel(primaryLane.lastEmotion)}`);
    }
    if (primaryLane?.recentGoal) {
        roleBits.push(`当前目标更像 ${formatLaneGoalLabel(primaryLane.recentGoal)}`);
    }
    if (roleBits.length === 0) {
        roleBits.push(`当前更偏${formatStyleLabel(snapshot.effectiveProfile.stylePreference)}，系统会按${formatMemoryStrengthLabel(snapshot.effectiveProfile.memoryStrength)}强度持续记住关键线索。`);
    }
    const roleCard: ReadableStrategyCard = {
        label: '角色状态',
        title: primaryLane?.displayName || (snapshot.effectiveProfile.chatType === 'group' ? '主要角色状态还在形成' : '当前角色状态'),
        detail: roleBits.join(' · '),
        foot: primaryLane?.relationshipDelta
            ? `最近关系变化：${primaryLane.relationshipDelta}`
            : `最近活跃：${formatTimestamp(Number(primaryLane?.lastActiveAt ?? 0))}`,
        tone: 'accent',
    };
    const worldDetailBits: string[] = [];
    if (scene) {
        worldDetailBits.push(`场景：${scene}`);
    }
    if (conflict) {
        worldDetailBits.push(`冲突：${conflict}`);
    }
    if (worldDetailBits.length === 0) {
        worldDetailBits.push(snapshot.effectiveProfile.chatType === 'worldbook'
            ? '当前更像设定问答，世界信息会优先以设定条目和事实形式整理。'
            : '暂时还没有形成稳定的世界状态摘要，系统会随着聊天推进继续补全。');
    }
    const worldCard: ReadableStrategyCard = {
        label: '世界情况',
        title: conflict || scene || (snapshot.effectiveProfile.chatType === 'group' ? '共享场景还在形成' : '世界信息偏少'),
        detail: worldDetailBits.join(' · '),
        foot: pendingEvents[0]
            ? `待处理：${pendingEvents[0]}`
            : (consensus[0] ? `当前共识：${consensus[0]}` : '暂时没有明显的场景推进提醒'),
    };
    const relationCard: ReadableStrategyCard = {
        label: '关系 / 冲突',
        title: primaryLane?.relationshipDelta
            ? '关系正在变化'
            : (conflict ? '当前冲突仍在推进' : '关系线整体平稳'),
        detail: primaryLane?.relationshipDelta
            || conflict
            || (activeActors.length > 1
                ? `${activeActors.join(' / ')} 正在主导这段聊天。`
                : '最近没有明显的关系或冲突变化。'),
        foot: activeActors.length > 0 ? `活跃角色：${activeActors.join(' / ')}` : '还没有形成明显的主导角色',
    };
    const reminderCard: ReadableStrategyCard = topAlert
        ? {
            label: '系统提醒',
            title: `[${formatMaintenanceSeverityLabel(topAlert.severity)}] ${topAlert.shortLabel}`,
            detail: topAlert.detail,
            foot: `建议动作：${topAlert.actionLabel || formatMaintenanceActionLabel(topAlert.action)}`,
            tone: 'warning',
        }
        : {
            label: '系统提醒',
            title: formatLifecycleStageSummary(snapshot.lifecycleState.stage),
            detail: `${formatLifecycleStageDescription(snapshot.lifecycleState)} · ${formatLongSummaryCooldownSummary(snapshot.longSummaryCooldown)}`,
            foot: `当前阶段：${formatLifecycleStageLabel(snapshot.lifecycleState.stage)}`,
            tone: 'soft',
        };
    return {
        meta,
        intent: formatIntentLabel(snapshot.decision?.intent || 'auto'),
        scope,
        role: roleCard,
        world: worldCard,
        relation: relationCard,
        reminder: reminderCard,
    };
}

/**
 * 功能：渲染设置页概览卡摘要。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function renderCompactPanelState(chatKey: string): Promise<void> {
    const summaryName: HTMLElement | null = document.getElementById(PANEL_IDS.summaryNameId);
    const summaryMeta: HTMLElement | null = document.getElementById(PANEL_IDS.summaryMetaId);
    const summaryIntent: HTMLElement | null = document.getElementById(PANEL_IDS.summaryIntentId);
    const summarySections: HTMLElement | null = document.getElementById(PANEL_IDS.summarySectionsId);
    const summaryRole: HTMLElement | null = document.getElementById(PANEL_IDS.summaryRoleId);
    const summaryWorld: HTMLElement | null = document.getElementById(PANEL_IDS.summaryWorldId);
    const summaryRelation: HTMLElement | null = document.getElementById(PANEL_IDS.summaryRelationId);
    const summaryReminder: HTMLElement | null = document.getElementById(PANEL_IDS.summaryReminderId);
    if (!summaryName || !summaryMeta || !summaryIntent || !summarySections || !summaryRole || !summaryWorld || !summaryRelation || !summaryReminder) {
        return;
    }
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    const dashboard = buildReadableStrategyDashboard(snapshot);
    replaceSummaryChips(summarySections, snapshot.decision?.sectionsUsed || []);
    summaryName.textContent = formatCompactChatLabel(chatKey);
    summaryName.title = findChatLabel(chatKey);
    summaryMeta.textContent = dashboard.meta;
    summaryIntent.textContent = dashboard.intent;
    writeDashboardCard(document, PANEL_IDS.summaryRoleId, dashboard.role);
    writeDashboardCard(document, PANEL_IDS.summaryWorldId, dashboard.world);
    writeDashboardCard(document, PANEL_IDS.summaryRelationId, dashboard.relation);
    writeDashboardCard(document, PANEL_IDS.summaryReminderId, dashboard.reminder);
    const select: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    if (select && select.value !== chatKey) {
        select.value = chatKey;
        refreshSharedSelectOptions(document.getElementById(PANEL_IDS.rootId) || document.body);
    }
    applyChatStrategyTooltips();
}

/**
 * 功能：渲染全屏编辑器中的当前聊天状态。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function renderEditorState(overlay: HTMLElement, chatKey: string): Promise<void> {
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    fillEditorForm(overlay, snapshot.effectiveProfile, snapshot.effectiveRetention);
    fillPresetAndDirectFields(overlay, snapshot);
    updateEditorHeader(overlay, snapshot);
    updateQualityPanel(overlay, snapshot);
    updateMaintenancePanel(overlay, snapshot);
    updateChatListActiveState(overlay, chatKey);
    writeJsonBlock(overlay, EDITOR_IDS.autoBlockId, {
        chatProfile: snapshot.autoProfile,
        adaptivePolicy: snapshot.autoPolicy,
        retentionPolicy: snapshot.autoRetention,
    });
    writeJsonBlock(overlay, EDITOR_IDS.overrideBlockId, snapshot.overrides);
    writeJsonBlock(overlay, EDITOR_IDS.finalBlockId, {
        chatProfile: snapshot.effectiveProfile,
        adaptivePolicy: snapshot.effectivePolicy,
        retentionPolicy: snapshot.effectiveRetention,
        promptInjection: snapshot.promptInjectionProfile,
        groupMemory: snapshot.groupMemory,
    });
    writeJsonBlock(overlay, EDITOR_IDS.metricsBlockId, snapshot.metrics);
    writeJsonBlock(overlay, EDITOR_IDS.decisionBlockId, snapshot.decision ?? {
        tip: '暂无注入决策，下次注入后会显示在这里。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.preDecisionBlockId, snapshot.preDecision ?? {
        tip: '暂无生成前 gate 决策。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.postDecisionBlockId, snapshot.postDecision ?? {
        tip: '暂无生成后 gate 输入快照。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.processingDecisionBlockId, snapshot.processingDecision ?? {
        tip: '暂无处理等级决策，抽取后会在这里显示。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.longSummaryCooldownBlockId, snapshot.longSummaryCooldown ?? {
        tip: '暂无长总结冷却状态。',
    });
    applyChatStrategyTooltips();
}

async function renderCompactPanelStateV2(chatKey: string): Promise<void> {
    const summaryName: HTMLElement | null = document.getElementById(PANEL_IDS.summaryNameId);
    const summaryMeta: HTMLElement | null = document.getElementById(PANEL_IDS.summaryMetaId);
    const summaryIntent: HTMLElement | null = document.getElementById(PANEL_IDS.summaryIntentId);
    const summarySections: HTMLElement | null = document.getElementById(PANEL_IDS.summarySectionsId);
    if (!summaryName || !summaryMeta || !summaryIntent || !summarySections) {
        return;
    }
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    const dashboard = buildReadableStrategyDashboard(snapshot);
    summaryName.textContent = formatCompactChatLabel(chatKey);
    summaryName.title = findChatLabel(chatKey);
    summaryMeta.textContent = dashboard.meta;
    summaryIntent.textContent = dashboard.intent;
    replaceSummaryChips(summarySections, snapshot.decision?.sectionsUsed || []);
    writeDashboardCard(document, PANEL_IDS.summaryRoleId, dashboard.role);
    writeDashboardCard(document, PANEL_IDS.summaryWorldId, dashboard.world);
    writeDashboardCard(document, PANEL_IDS.summaryRelationId, dashboard.relation);
    writeDashboardCard(document, PANEL_IDS.summaryReminderId, dashboard.reminder);
    const select: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    if (select && select.value !== chatKey) {
        select.value = chatKey;
        refreshSharedSelectOptions(document.getElementById(PANEL_IDS.rootId) || document.body);
    }
    applyChatStrategyTooltips();
}

function updateEditorHeaderV2(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const nameElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatNameId}`) as HTMLElement | null;
    const metaElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatMetaId}`) as HTMLElement | null;
    const intentElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentIntentId}`) as HTMLElement | null;
    const scopeElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentScopeId}`) as HTMLElement | null;
    const sectionsWrap: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.sectionsWrapId}`) as HTMLElement | null;
    if (!nameElement || !metaElement || !intentElement || !scopeElement || !sectionsWrap) {
        return;
    }
    const dashboard = buildReadableStrategyDashboard(snapshot);
    nameElement.textContent = findChatLabel(snapshot.chatKey);
    metaElement.textContent = dashboard.meta;
    intentElement.textContent = dashboard.intent;
    scopeElement.textContent = dashboard.scope;
    replaceSummaryChips(sectionsWrap, snapshot.decision?.sectionsUsed || []);
    writeDashboardCard(overlay, EDITOR_IDS.overviewRoleId, dashboard.role);
    writeDashboardCard(overlay, EDITOR_IDS.overviewWorldId, dashboard.world);
    writeDashboardCard(overlay, EDITOR_IDS.overviewRelationId, dashboard.relation);
    writeDashboardCard(overlay, EDITOR_IDS.overviewReminderId, dashboard.reminder);
}

async function renderEditorStateV2(overlay: HTMLElement, chatKey: string): Promise<void> {
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    fillEditorForm(overlay, snapshot.effectiveProfile, snapshot.effectiveRetention);
    fillPresetAndDirectFields(overlay, snapshot);
    renderSummarySettingsSection(overlay, snapshot);
    updateEditorHeaderV2(overlay, snapshot);
    updateQualityPanel(overlay, snapshot);
    updateMaintenancePanel(overlay, snapshot);
    updateChatListActiveState(overlay, chatKey);
    writeJsonBlock(overlay, EDITOR_IDS.autoBlockId, {
        chatProfile: snapshot.autoProfile,
        adaptivePolicy: snapshot.autoPolicy,
        retentionPolicy: snapshot.autoRetention,
    });
    writeJsonBlock(overlay, EDITOR_IDS.overrideBlockId, snapshot.overrides);
    writeJsonBlock(overlay, EDITOR_IDS.finalBlockId, {
        chatProfile: snapshot.effectiveProfile,
        adaptivePolicy: snapshot.effectivePolicy,
        retentionPolicy: snapshot.effectiveRetention,
        promptInjection: snapshot.promptInjectionProfile,
        groupMemory: snapshot.groupMemory,
    });
    writeJsonBlock(overlay, EDITOR_IDS.metricsBlockId, snapshot.metrics);
    writeJsonBlock(overlay, EDITOR_IDS.decisionBlockId, snapshot.decision ?? {
        tip: '暂无注入决策，下次注入后会显示在这里。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.preDecisionBlockId, snapshot.preDecision ?? {
        tip: '暂无生成前 gate 决策。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.postDecisionBlockId, snapshot.postDecision ?? {
        tip: '暂无生成后 gate 输入快照。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.processingDecisionBlockId, snapshot.processingDecision ?? {
        tip: '暂无处理等级决策，抽取后会在这里显示。',
    });
    writeJsonBlock(overlay, EDITOR_IDS.longSummaryCooldownBlockId, snapshot.longSummaryCooldown ?? {
        tip: '暂无长总结冷却状态。',
    });
    applyChatStrategyTooltips();
}

/**
 * 功能：读取聊天策略快照，供概览卡与编辑器复用。
 * @param chatKey 聊天键。
 * @returns 聊天策略快照。
 */
async function loadChatStrategySnapshot(chatKey: string): Promise<ChatStrategySnapshot> {
    if (!(await hasPersistedChatStrategyData(chatKey))) {
        return buildEphemeralChatStrategySnapshot(chatKey);
    }

    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        const state = await manager.load();
        const effectiveProfile: ChatProfile = await manager.getChatProfile();
        const effectivePolicy: AdaptivePolicy = await manager.getAdaptivePolicy();
        const effectiveRetention: RetentionPolicy = await manager.getRetentionPolicy();
        const metrics: AdaptiveMetrics = await manager.getAdaptiveMetrics();
        const vectorLifecycle: VectorLifecycleState = await manager.getVectorLifecycle();
        const memoryQuality: MemoryQualityScorecard = await manager.getMemoryQuality();
        const maintenanceAdvice: MaintenanceAdvice[] = await manager.getMaintenanceAdvice();
        const maintenanceInsights: MaintenanceInsight[] = await manager.getMaintenanceInsights();
        const lifecycleState: ChatLifecycleState = await manager.getLifecycleState();
        const decision: StrategyDecision | null = await manager.getLastStrategyDecision();
        const preDecision: PreGenerationGateDecision | null = await manager.getLastPreGenerationDecision();
        const postDecision: PostGenerationGateDecision | null = await manager.getLastPostGenerationDecision();
        const processingDecision: MemoryProcessingDecision | null = await manager.getLastProcessingDecision();
        const longSummaryCooldown: LongSummaryCooldownState = await manager.getLongSummaryCooldown();
        const summarySettings: SummarySettings = await manager.getGlobalSummarySettings();
        const summarySettingsOverride: SummarySettingsOverride = await manager.getChatSummarySettingsOverride();
        const effectiveSummarySettings: EffectiveSummarySettings = await manager.getEffectiveSummarySettings();
        const extractHealth: ExtractHealthWindow = await manager.getExtractHealth();
        const promptInjectionProfile: PromptInjectionProfile = await manager.getPromptInjectionProfile();
        const groupMemory: GroupMemoryState | null = await manager.getGroupMemory();
        const autoProfile: ChatProfile = state.chatProfile ?? DEFAULT_CHAT_PROFILE;
        const autoPolicy: AdaptivePolicy = state.adaptivePolicy
            ?? buildAdaptivePolicy(autoProfile, state.adaptiveMetrics ?? DEFAULT_ADAPTIVE_METRICS, state.vectorLifecycle, state.memoryQuality);
        const autoRetention: RetentionPolicy = state.retentionPolicy ?? buildRetentionPolicy(autoProfile);
        return {
            chatKey,
            autoProfile,
            autoPolicy,
            autoRetention,
            effectiveProfile,
            effectivePolicy,
            effectiveRetention,
            metrics,
            vectorLifecycle: {
                ...DEFAULT_VECTOR_LIFECYCLE,
                ...vectorLifecycle,
            },
            memoryQuality: {
                ...DEFAULT_MEMORY_QUALITY,
                ...memoryQuality,
                dimensions: {
                    ...DEFAULT_MEMORY_QUALITY.dimensions,
                    ...(memoryQuality?.dimensions ?? {}),
                },
            },
            maintenanceAdvice,
            maintenanceInsights,
            lifecycleState,
            decision,
            preDecision,
            postDecision,
            processingDecision,
            longSummaryCooldown,
            summarySettings,
            summarySettingsOverride,
            effectiveSummarySettings,
            summarySettingsSource: effectiveSummarySettings.source,
            extractHealth,
            promptInjectionProfile,
            groupMemory,
            mainlineTraceSnapshot: state.mainlineTraceSnapshot ?? null,
            overrides: (state.manualOverrides ?? {}) as Record<string, unknown>,
        };
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：重算指定聊天的自动策略。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function recomputeSelectedChatPolicy(chatKey: string): Promise<void> {
    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        await manager.load();
        await manager.recomputeAdaptivePolicy();
        await manager.recomputeMemoryQuality();
        await manager.flush();
        if (chatKey === getCurrentChatKey()) {
            const currentChatState: MemoryChatStateApi | undefined = getWindowMemoryChatState();
            if (currentChatState) {
                await currentChatState.recomputeAdaptivePolicy();
                if (typeof currentChatState.recomputeMemoryQuality === 'function') {
                    await currentChatState.recomputeMemoryQuality();
                }
                await currentChatState.flush();
            }
        }
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：执行指定聊天的一键维护动作。
 * @param chatKey 聊天键。
 * @param action 维护动作。
 * @returns 维护执行结果；若无法执行则返回 null。
 */
async function runMaintenanceActionForChat(
    chatKey: string,
    action: MaintenanceActionType,
): Promise<MaintenanceExecutionResult | null> {
    const currentChatState: MemoryChatStateApi | undefined = chatKey === getCurrentChatKey() ? getWindowMemoryChatState() : undefined;
    if (typeof currentChatState?.runMaintenanceAction === 'function') {
        return currentChatState.runMaintenanceAction(action);
    }
    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        await manager.load();
        const result = await manager.runMaintenanceAction(action);
        await manager.flush();
        return result;
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：保存当前编辑器表单中的覆盖配置。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function saveSummarySettingsForChat(overlay: HTMLElement, chatKey: string, scope: 'global' | 'chat'): Promise<void> {
    const nextSettings: SummarySettings = collectSummarySettingsFromForm(overlay);
    const currentChatState: MemoryChatStateApi | undefined = chatKey === getCurrentChatKey() ? getWindowMemoryChatState() : undefined;
    try {
        if (scope === 'global') {
            if (typeof currentChatState?.setGlobalSummarySettings === 'function') {
                await currentChatState.setGlobalSummarySettings(nextSettings);
                return;
            }
            const manager: ChatStateManager = new ChatStateManager(chatKey);
            try {
                await manager.load();
                await manager.setGlobalSummarySettings(nextSettings);
                await manager.flush();
                return;
            } finally {
                await manager.destroy();
            }
        }

        const baseSettings: SummarySettings = currentChatState && typeof currentChatState.getGlobalSummarySettings === 'function'
            ? await currentChatState.getGlobalSummarySettings()
            : await (async (): Promise<SummarySettings> => {
                const manager: ChatStateManager = new ChatStateManager(chatKey);
                try {
                    await manager.load();
                    return await manager.getGlobalSummarySettings();
                } finally {
                    await manager.destroy();
                }
            })();
        const overrideDiff: SummarySettingsOverride = buildSummarySettingsOverrideDiff(baseSettings, nextSettings);
        if (Object.keys(overrideDiff).length === 0) {
            await clearSummarySettingsOverrideForChat(chatKey);
            return;
        }
        if (typeof currentChatState?.setChatSummarySettingsOverride === 'function') {
            await currentChatState.setChatSummarySettingsOverride(overrideDiff);
            await currentChatState.flush();
            return;
        }
        const manager: ChatStateManager = new ChatStateManager(chatKey);
        try {
            await manager.load();
            await manager.setChatSummarySettingsOverride(overrideDiff);
            await manager.flush();
        } finally {
            await manager.destroy();
        }
    } catch (error) {
        console.warn('保存总结设置失败', error);
    }
}

async function clearSummarySettingsOverrideForChat(chatKey: string): Promise<void> {
    const currentChatState: MemoryChatStateApi | undefined = chatKey === getCurrentChatKey() ? getWindowMemoryChatState() : undefined;
    try {
        if (typeof currentChatState?.clearChatSummarySettingsOverride === 'function') {
            await currentChatState.clearChatSummarySettingsOverride();
            await currentChatState.flush();
            return;
        }
        const manager: ChatStateManager = new ChatStateManager(chatKey);
        try {
            await manager.load();
            await manager.clearChatSummarySettingsOverride();
            await manager.flush();
        } finally {
            await manager.destroy();
        }
    } catch (error) {
        console.warn('清除总结设置覆盖失败', error);
    }
}

async function applySelectedChatOverrides(overlay: HTMLElement, chatKey: string): Promise<void> {
    setInputValue(
        overlay,
        EDITOR_IDS.vectorActivationFactsId,
        getNumberValue(overlay, EDITOR_IDS.vectorFactsDirectId, DEFAULT_CHAT_PROFILE.vectorStrategy.activationFacts),
    );
    setSelectValue(
        overlay,
        EDITOR_IDS.deletionStrategyId,
        getSelectValue(overlay, EDITOR_IDS.deletionStrategyId)
        || getSelectValue(overlay, EDITOR_IDS.deletionStrategyDirectId)
        || 'soft_delete',
    );
    const profileOverride: Partial<ChatProfile> = collectProfileOverrideFromForm(overlay);
    const retentionOverride: Partial<RetentionPolicy> = collectRetentionOverrideFromForm(overlay);
    const currentChatState: MemoryChatStateApi | undefined = chatKey === getCurrentChatKey() ? getWindowMemoryChatState() : undefined;

    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        await manager.load();
        await manager.setChatProfileOverride(profileOverride);
        await manager.setRetentionPolicyOverride(retentionOverride);
        await manager.recomputeAdaptivePolicy();
        await manager.recomputeMemoryQuality();
        await manager.flush();
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：根据快照更新编辑器头部摘要。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function updateEditorHeader(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const nameElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatNameId}`) as HTMLElement | null;
    const metaElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatMetaId}`) as HTMLElement | null;
    const intentElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentIntentId}`) as HTMLElement | null;
    const scopeElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentScopeId}`) as HTMLElement | null;
    const sectionsWrap: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.sectionsWrapId}`) as HTMLElement | null;
    if (!nameElement || !metaElement || !intentElement || !scopeElement || !sectionsWrap) {
        return;
    }
    const dashboard = buildReadableStrategyDashboard(snapshot);
    nameElement.textContent = findChatLabel(snapshot.chatKey);
    metaElement.textContent = [
        formatChatTypeLabel(snapshot.effectiveProfile.chatType),
        formatStyleLabel(snapshot.effectiveProfile.stylePreference),
        formatMemoryStrengthLabel(snapshot.effectiveProfile.memoryStrength),
        snapshot.effectiveProfile.vectorStrategy.enabled ? '向量开启' : '向量关闭',
    ].join(' · ');
    intentElement.textContent = formatIntentLabel(snapshot.decision?.intent || 'auto');
    scopeElement.textContent = `当前来源：${formatSummarySourceLabel(snapshot.summarySettingsSource)} · 分轨：${formatGroupLaneSummary(snapshot.groupMemory, snapshot.effectivePolicy.groupLaneEnabled)}`;
    replaceSummaryChips(sectionsWrap, snapshot.decision?.sectionsUsed || []);
}

/**
 * 功能：更新质量与向量状态面板。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function updateQualityPanel(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const scoreElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityScoreId}`) as HTMLElement | null;
    const levelElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityLevelId}`) as HTMLElement | null;
    const dimensionsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityDimensionsId}`) as HTMLElement | null;
    const vectorModeElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorModeId}`) as HTMLElement | null;
    const vectorStatsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorStatsId}`) as HTMLElement | null;
    const vectorTimesElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorTimesId}`) as HTMLElement | null;
    const traceEvidenceElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityTraceEvidenceId}`) as HTMLElement | null;
    const adviceElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityAdviceId}`) as HTMLElement | null;
    const reasonsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityReasonsId}`) as HTMLElement | null;
    if (!scoreElement || !levelElement || !dimensionsElement || !vectorModeElement || !vectorStatsElement || !vectorTimesElement || !traceEvidenceElement || !adviceElement || !reasonsElement) {
        return;
    }

    const quality = snapshot.memoryQuality;
    const lifecycle = snapshot.vectorLifecycle;

    scoreElement.textContent = String(Math.max(0, Math.min(100, Number(quality.totalScore ?? 0))));
    levelElement.textContent = formatMemoryQualityLevelLabel(String(quality.level ?? 'healthy'));

    dimensionsElement.innerHTML = Object.entries(quality.dimensions ?? {})
        .map(([key, value]): string => {
            const ratio = Math.max(0, Math.min(1, Number(value ?? 0)));
            const percent = Math.round(ratio * 100);
            return `
              <div class="stx-memory-chat-strategy-dimension-item">
                <span class="stx-memory-chat-strategy-dimension-label">${escapeHtml(formatQualityDimensionLabel(key))}</span>
                <div class="stx-memory-chat-strategy-progress">
                    <div class="stx-memory-chat-strategy-progress-bar" style="width: ${percent}%;"></div>
                </div>
                <span class="stx-memory-chat-strategy-dimension-value">${percent}%</span>
              </div>
            `.trim();
        })
        .join('');

    vectorModeElement.textContent = formatVectorModeLabel(
        String(lifecycle.vectorMode ?? snapshot.effectivePolicy.vectorMode ?? 'off'),
        snapshot.effectiveProfile.vectorStrategy.enabled
    );
    vectorStatsElement.innerHTML = `<span class="stx-memory-vector-stat"><i class="fa-solid fa-brain"></i> 事实: ${Number(lifecycle.factCount ?? 0)}</span> <span class="stx-memory-vector-stat"><i class="fa-solid fa-list-check"></i> 摘要: ${Number(lifecycle.summaryCount ?? 0)}</span> <span class="stx-memory-vector-stat"><i class="fa-solid fa-cubes"></i> 记忆卡: ${Number(lifecycle.memoryCardCount ?? 0)}</span>`;
    vectorTimesElement.innerHTML = `<strong>最近激活</strong>: 访问 ${formatTimestamp(lifecycle.lastAccessAt)} · 命中 ${formatTimestamp(lifecycle.lastHitAt)} · 索引 ${formatTimestamp(lifecycle.lastIndexAt)}`;
    traceEvidenceElement.innerHTML = buildMainlineTraceEvidenceMarkup(snapshot.mainlineTraceSnapshot);

    if (!Array.isArray(snapshot.maintenanceAdvice) || snapshot.maintenanceAdvice.length === 0) {
        adviceElement.innerHTML = '<span class="stx-memory-chat-strategy-empty">暂无建议</span>';
    } else {
        adviceElement.innerHTML = snapshot.maintenanceAdvice
            .map((item): string => `
              <div class="stx-memory-chat-strategy-quality-advice-item">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
              </div>
            `.trim())
            .join('');
    }

    if (Array.isArray(quality.reasonCodes) && quality.reasonCodes.length > 0) {
        const scoreWrap = overlay.querySelector(`#${EDITOR_IDS.qualityReasonsId}`);
        if (scoreWrap) {
            scoreWrap.innerHTML = quality.reasonCodes
                .map((code: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(formatQualityReasonCodeLabel(code))}</span>`)
                .join('');
        }
    }
}

/**
 * 功能：更新维护感知与生命周期区块。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function updateMaintenancePanel(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const insightsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.maintenanceInsightsId}`) as HTMLElement | null;
    const lifecycleHeroElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleHeroId}`) as HTMLElement | null;
    const lifecycleStageElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleStageId}`) as HTMLElement | null;
    const lifecycleMetaElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleMetaId}`) as HTMLElement | null;
    const lifecycleSummaryElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleSummaryId}`) as HTMLElement | null;
    const lifecycleExplanationElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleExplanationId}`) as HTMLElement | null;
    const lifecycleReasonListElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleReasonListId}`) as HTMLElement | null;
    const lifecycleTimelineElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleTimelineId}`) as HTMLElement | null;
    const lifecycleImpactElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.lifecycleImpactId}`) as HTMLElement | null;
    const presetScopeElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.presetScopeMetaId}`) as HTMLElement | null;
    const groupLaneMetaElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.groupLaneMetaId}`) as HTMLElement | null;
    const groupLaneActorsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.groupLaneActorsId}`) as HTMLElement | null;
    if (
        !insightsElement
        || !lifecycleHeroElement
        || !lifecycleStageElement
        || !lifecycleMetaElement
        || !lifecycleSummaryElement
        || !lifecycleExplanationElement
        || !lifecycleReasonListElement
        || !lifecycleTimelineElement
        || !lifecycleImpactElement
        || !presetScopeElement
        || !groupLaneMetaElement
        || !groupLaneActorsElement
    ) {
        return;
    }
    lifecycleHeroElement.dataset.stage = snapshot.lifecycleState.stage;
    lifecycleStageElement.textContent = formatLifecycleStageLabel(snapshot.lifecycleState.stage);
    lifecycleSummaryElement.textContent = formatLifecycleStageSummary(snapshot.lifecycleState.stage);
    lifecycleExplanationElement.textContent = formatLifecycleStageDescription(snapshot.lifecycleState);
    lifecycleReasonListElement.innerHTML = buildLifecycleReasonPillsMarkup(snapshot.lifecycleState.stageReasonCodes);
    lifecycleTimelineElement.innerHTML = buildLifecycleTimelineMarkup(snapshot.lifecycleState);
    lifecycleImpactElement.innerHTML = buildLifecycleImpactMarkup(snapshot.lifecycleState);
    lifecycleMetaElement.textContent = formatLifecycleMetaText(snapshot.lifecycleState);
    presetScopeElement.textContent = formatSummarySourceLabel(snapshot.summarySettingsSource);
    groupLaneMetaElement.textContent = formatGroupLaneSummary(snapshot.groupMemory, snapshot.effectivePolicy.groupLaneEnabled);
    groupLaneActorsElement.innerHTML = buildGroupLaneCardsMarkup(snapshot.groupMemory, snapshot.effectivePolicy.groupLaneEnabled);

    const insights = Array.isArray(snapshot.maintenanceInsights) ? snapshot.maintenanceInsights : [];
    if (insights.length === 0) {
        insightsElement.innerHTML = '<span class="stx-memory-chat-strategy-empty">暂无维护提示</span>';
        return;
    }

    const severityOrder = (severity: MaintenanceInsight['severity']): number => {
        if (severity === 'critical') {
            return 3;
        }
        if (severity === 'warning') {
            return 2;
        }
        return 1;
    };
    const sortedInsights = [...insights].sort(
        (left: MaintenanceInsight, right: MaintenanceInsight): number => severityOrder(right.severity) - severityOrder(left.severity),
    );

    insightsElement.innerHTML = sortedInsights
        .map((item: MaintenanceInsight): string => `
          <div class="stx-memory-chat-strategy-quality-advice-item">
            <strong>[${escapeHtml(formatMaintenanceSeverityLabel(item.severity))}] ${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
            <button
              type="button"
              class="stx-memory-chat-strategy-maintenance-action"
              data-action="${escapeHtml(item.action)}"
            >
              ${escapeHtml(item.actionLabel || '立即维护')}
            </button>
          </div>
        `.trim())
        .join('');

    insightsElement.querySelectorAll<HTMLButtonElement>('.stx-memory-chat-strategy-maintenance-action')
        .forEach((button: HTMLButtonElement): void => {
            button.onclick = (): void => {
                const action = String(button.dataset.action || '').trim() as MaintenanceActionType;
                if (!action) {
                    return;
                }
                button.disabled = true;
                void runMaintenanceActionForChat(snapshot.chatKey, action)
                    .then(async (result: MaintenanceExecutionResult | null): Promise<void> => {
                        if (!result) {
                            toast.error('维护动作执行失败：缺少执行结果');
                        } else if (result.ok) {
                            toast.success(formatMaintenanceExecutionToast(action, result));
                        } else {
                            toast.error(`${formatMaintenanceActionLabel(action)}失败：${result.message}`);
                        }
                        await renderEditorStateV2(overlay, snapshot.chatKey);
                        await renderCompactPanelStateV2(snapshot.chatKey);
                    })
                    .catch((error: unknown): void => {
                        toast.error(`维护动作执行异常：${String(error)}`);
                    })
                    .finally((): void => {
                        button.disabled = false;
                    });
            };
        });
}

/**
 * 功能：为生命周期阶段生成一句直白总结。
 * @param stage 生命周期阶段。
 * @returns 面向用户的简短总结。
 */
function formatLifecycleStageSummary(stage: ChatLifecycleState['stage']): string {
    if (stage === 'new') {
        return '刚起步，系统还在建立这段聊天的基础印象。';
    }
    if (stage === 'active') {
        return '发展很快，系统会更积极地跟踪新剧情和新事实。';
    }
    if (stage === 'stable') {
        return '节奏已经稳定，系统更重视保持设定一致和关系连续。';
    }
    if (stage === 'long_running') {
        return '这是长期聊天，系统会更看重整理、压缩和按需检索。';
    }
    if (stage === 'archived') {
        return '当前活跃度偏低，系统默认会转向低频维护。';
    }
    if (stage === 'deleted') {
        return '这段聊天已被视为删除状态，系统通常不再继续维护。';
    }
    return '系统已识别当前聊天阶段。';
}

/**
 * 功能：解释系统为何把聊天判定为当前阶段。
 * @param lifecycle 生命周期状态。
 * @returns 更完整的解释文本。
 */
function formatLifecycleStageDescription(lifecycle: ChatLifecycleState): string {
    const reasonText = Array.isArray(lifecycle.stageReasonCodes) && lifecycle.stageReasonCodes.length > 0
        ? lifecycle.stageReasonCodes.map((code: string): string => formatLifecycleReasonCodeLabel(code)).join('、')
        : '当前没有更多判定细节';
    return `${formatLifecycleStageSummary(lifecycle.stage)} 判断依据：${reasonText}。`;
}

/**
 * 功能：输出生命周期对默认策略的影响说明。
 * @param lifecycle 生命周期状态。
 * @returns HTML 字符串。
 */
function buildLifecycleImpactMarkup(lifecycle: ChatLifecycleState): string {
    const title = formatLifecycleImpactTitle(lifecycle.stage);
    const detail = formatLifecycleImpactDetail(lifecycle.stage);
    return `
        <strong class="stx-memory-chat-strategy-lifecycle-impact-title">${escapeHtml(title)}</strong>
        <span class="stx-memory-chat-strategy-lifecycle-impact-detail">${escapeHtml(detail)}</span>
    `.trim();
}

/**
 * 功能：生成生命周期影响标题。
 * @param stage 生命周期阶段。
 * @returns 标题文本。
 */
function formatLifecycleImpactTitle(stage: ChatLifecycleState['stage']): string {
    if (stage === 'new') {
        return '默认更偏向“先建立基础记忆”';
    }
    if (stage === 'active') {
        return '默认更偏向“及时记录变化”';
    }
    if (stage === 'stable') {
        return '默认更偏向“维持连续性”';
    }
    if (stage === 'long_running') {
        return '默认更偏向“整理长期记忆”';
    }
    if (stage === 'archived') {
        return '默认更偏向“保守维护”';
    }
    if (stage === 'deleted') {
        return '默认更偏向“停止维护与清理痕迹”';
    }
    return '默认策略会跟随阶段做轻微偏置';
}

/**
 * 功能：生成生命周期影响说明。
 * @param stage 生命周期阶段。
 * @returns 说明文本。
 */
function formatLifecycleImpactDetail(stage: ChatLifecycleState['stage']): string {
    if (stage === 'new') {
        return '更容易优先记录身份、关系、设定等基础信息，帮助后续聊天尽快进入状态。';
    }
    if (stage === 'active') {
        return '更关注新事件、新关系和新冲突，适合快速推进剧情时保持记忆同步。';
    }
    if (stage === 'stable') {
        return '会更重视一致性和连续感，避免已经稳定的设定频繁被噪声打断。';
    }
    if (stage === 'long_running') {
        return '会更关注摘要、压缩、向量检索和长期成本，让老聊天继续可用而不臃肿。';
    }
    if (stage === 'archived') {
        return '默认减少高频维护动作，只有在重新活跃时才会逐步提高处理强度。';
    }
    if (stage === 'deleted') {
        return '通常只保留必要的系统痕迹，不再继续为后续对话提供主动支持。';
    }
    return '这个阶段只会影响默认倾向，不会覆盖你的预设和手动覆盖。';
}

/**
 * 功能：把生命周期原因列表渲染成更易读的标签。
 * @param reasonCodes 生命周期原因码列表。
 * @returns HTML 字符串。
 */
function buildLifecycleReasonPillsMarkup(reasonCodes: string[]): string {
    if (!Array.isArray(reasonCodes) || reasonCodes.length === 0) {
        return '<span class="stx-memory-chat-strategy-empty">当前没有额外判定依据</span>';
    }
    return reasonCodes
        .map((code: string): string => `<span class="stx-memory-chat-strategy-pill stx-memory-chat-strategy-lifecycle-pill">${escapeHtml(formatLifecycleReasonCodeLabel(code))}</span>`)
        .join('');
}

/**
 * 功能：构建生命周期时间线展示。
 * @param lifecycle 生命周期状态。
 * @returns HTML 字符串。
 */
function buildLifecycleTimelineMarkup(lifecycle: ChatLifecycleState): string {
    const mutationKinds = Array.isArray(lifecycle.mutationKinds) ? lifecycle.mutationKinds : [];
    const mutationSummary = mutationKinds.length > 0
        ? mutationKinds.map((kind: ChatMutationKind): string => formatChatMutationKindLabel(kind)).join('、')
        : '暂无明显结构变化';
    const maintenanceSummary = lifecycle.lastMaintenanceAt > 0
        ? `${formatTimestamp(lifecycle.lastMaintenanceAt)} · ${lifecycle.lastMaintenanceAction ? formatMaintenanceActionLabel(lifecycle.lastMaintenanceAction) : '已执行维护'}`
        : '还没有执行过维护动作';
    return `
        <div class="stx-memory-chat-strategy-lifecycle-point">
          <span class="stx-memory-chat-strategy-lifecycle-point-label">第一次被系统识别</span>
          <strong>${escapeHtml(formatTimestamp(lifecycle.firstSeenAt))}</strong>
          <small>系统开始跟踪这段聊天。</small>
        </div>
        <div class="stx-memory-chat-strategy-lifecycle-point">
          <span class="stx-memory-chat-strategy-lifecycle-point-label">进入当前阶段</span>
          <strong>${escapeHtml(formatTimestamp(lifecycle.stageEnteredAt))}</strong>
          <small>默认策略从这里开始切换偏向。</small>
        </div>
        <div class="stx-memory-chat-strategy-lifecycle-point">
          <span class="stx-memory-chat-strategy-lifecycle-point-label">最近一次聊天变化</span>
          <strong>${escapeHtml(formatTimestamp(lifecycle.lastMutationAt))}</strong>
          <small>${escapeHtml(`${mutationSummary} · 来源 ${formatLifecycleMutationSourceLabel(lifecycle.lastMutationSource)}`)}</small>
        </div>
        <div class="stx-memory-chat-strategy-lifecycle-point">
          <span class="stx-memory-chat-strategy-lifecycle-point-label">最近一次维护</span>
          <strong>${escapeHtml(maintenanceSummary)}</strong>
          <small>影响摘要、压缩或向量状态。</small>
        </div>
    `.trim();
}

/**
 * 功能：格式化生命周期底部的补充说明。
 * @param lifecycle 生命周期状态。
 * @returns 补充说明文本。
 */
function formatLifecycleMetaText(lifecycle: ChatLifecycleState): string {
    const mutationKinds = Array.isArray(lifecycle.mutationKinds) ? lifecycle.mutationKinds : [];
    const changeText = mutationKinds.length > 0
        ? mutationKinds.map((kind: ChatMutationKind): string => formatChatMutationKindLabel(kind)).join(' / ')
        : '暂无明显聊天结构变化';
    return `最近变化：${changeText}。这部分只影响系统默认倾向，不会覆盖你的预设和手动覆盖。`;
}

/**
 * 功能：把聊天变动类型转成直白中文。
 * @param kind 变动类型。
 * @returns 中文标签。
 */
function formatChatMutationKindLabel(kind: ChatMutationKind): string {
    if (kind === 'message_added') {
        return '新增消息';
    }
    if (kind === 'message_edited') {
        return '修改消息';
    }
    if (kind === 'message_swiped') {
        return '切换回复分支';
    }
    if (kind === 'message_deleted') {
        return '删除消息';
    }
    if (kind === 'chat_branched') {
        return '聊天分支';
    }
    if (kind === 'chat_renamed') {
        return '聊天改名';
    }
    if (kind === 'character_binding_changed') {
        return '角色绑定变化';
    }
    return kind;
}

/**
 * 功能：把最近变动来源转成更容易理解的文字。
 * @param source 最近变动来源。
 * @returns 中文说明。
 */
function formatLifecycleMutationSourceLabel(source: string): string {
    const normalized = String(source || '').trim().toLowerCase();
    if (!normalized) {
        return '系统未记录';
    }
    if (normalized === 'host' || normalized === 'host_deleted') {
        return '宿主聊天';
    }
    if (normalized.includes('maintenance')) {
        return '系统维护';
    }
    if (normalized.includes('extract')) {
        return '记忆抽取';
    }
    if (normalized.includes('summary')) {
        return '摘要更新';
    }
    if (normalized.includes('vector')) {
        return '向量处理';
    }
    return source;
}

/**
 * 功能：将快照中的配置写回编辑器表单。
 * @param overlay 编辑器遮罩层根节点。
 * @param profile 当前生效画像。
 * @param retention 当前生效保留策略。
 * @returns 无返回值。
 */
function fillEditorForm(overlay: HTMLElement, profile: ChatProfile, retention: RetentionPolicy): void {
    setSelectValue(overlay, EDITOR_IDS.chatTypeId, profile.chatType);
    setSelectValue(overlay, EDITOR_IDS.stylePreferenceId, profile.stylePreference);
    setSelectValue(overlay, EDITOR_IDS.memoryStrengthId, profile.memoryStrength);
    setSelectValue(overlay, EDITOR_IDS.extractStrategyId, profile.extractStrategy);
    setSelectValue(overlay, EDITOR_IDS.summaryStrategyId, profile.summaryStrategy);
    setSelectValue(overlay, EDITOR_IDS.deletionStrategyId, profile.deletionStrategy);
    setCheckboxValue(overlay, EDITOR_IDS.vectorEnabledId, profile.vectorStrategy.enabled);
    setInputValue(overlay, EDITOR_IDS.vectorChunkThresholdId, profile.vectorStrategy.chunkThreshold);
    setInputValue(overlay, EDITOR_IDS.rerankThresholdId, profile.vectorStrategy.rerankThreshold);
    setInputValue(overlay, EDITOR_IDS.vectorActivationFactsId, profile.vectorStrategy.activationFacts);
    setInputValue(overlay, EDITOR_IDS.vectorActivationSummariesId, profile.vectorStrategy.activationSummaries);
    setInputValue(overlay, EDITOR_IDS.vectorIdleDecayDaysId, profile.vectorStrategy.idleDecayDays);
    setInputValue(overlay, EDITOR_IDS.vectorLowPrecisionStrideId, profile.vectorStrategy.lowPrecisionSearchStride);
    setInputValue(overlay, EDITOR_IDS.keepSummaryCountId, retention.keepSummaryCount);
    setInputValue(overlay, EDITOR_IDS.keepEventCountId, retention.keepEventCount);
    setInputValue(overlay, EDITOR_IDS.keepVectorDaysId, retention.keepVectorDays);
    refreshSharedSelectOptions(overlay);
}

/**
 * 功能：把预设与直白参数同步到编辑器表单。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function fillPresetAndDirectFields(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    setInputValue(overlay, EDITOR_IDS.profileRefreshDirectId, snapshot.effectivePolicy.profileRefreshInterval);
    setInputValue(overlay, EDITOR_IDS.qualityRefreshDirectId, snapshot.effectivePolicy.qualityRefreshInterval);
    setInputValue(overlay, EDITOR_IDS.vectorFactsDirectId, snapshot.effectiveProfile.vectorStrategy.activationFacts);
    setSelectValue(overlay, EDITOR_IDS.deletionStrategyDirectId, snapshot.effectiveRetention.deletionStrategy);
    setCheckboxValue(overlay, EDITOR_IDS.autoBootstrapSeedId, snapshot.effectivePolicy.groupLaneEnabled);
    setCheckboxValue(overlay, EDITOR_IDS.groupLaneEnabledId, snapshot.effectivePolicy.groupLaneEnabled);
    refreshSharedSelectOptions(overlay);
}

/**
 * 功能：当用户手动修改直白参数时，把预设状态切换为“自定义”。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
/**
 * 功能：将预设模板快速回填到编辑器表单。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
/**
 * 功能：从编辑器表单采集画像覆盖。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 聊天画像覆盖。
 */
function collectProfileOverrideFromForm(overlay: HTMLElement): Partial<ChatProfile> {
    return {
        chatType: getSelectValue(overlay, EDITOR_IDS.chatTypeId) as ChatProfile['chatType'],
        stylePreference: getSelectValue(overlay, EDITOR_IDS.stylePreferenceId) as ChatProfile['stylePreference'],
        memoryStrength: getSelectValue(overlay, EDITOR_IDS.memoryStrengthId) as ChatProfile['memoryStrength'],
        extractStrategy: getSelectValue(overlay, EDITOR_IDS.extractStrategyId) as ChatProfile['extractStrategy'],
        summaryStrategy: getSelectValue(overlay, EDITOR_IDS.summaryStrategyId) as ChatProfile['summaryStrategy'],
        deletionStrategy: getSelectValue(overlay, EDITOR_IDS.deletionStrategyId) as DeletionStrategy,
        vectorStrategy: {
            enabled: getCheckboxValue(overlay, EDITOR_IDS.vectorEnabledId),
            chunkThreshold: getNumberValue(overlay, EDITOR_IDS.vectorChunkThresholdId, DEFAULT_CHAT_PROFILE.vectorStrategy.chunkThreshold),
            rerankThreshold: getNumberValue(overlay, EDITOR_IDS.rerankThresholdId, DEFAULT_CHAT_PROFILE.vectorStrategy.rerankThreshold),
            activationFacts: getNumberValue(overlay, EDITOR_IDS.vectorActivationFactsId, DEFAULT_CHAT_PROFILE.vectorStrategy.activationFacts),
            activationSummaries: getNumberValue(overlay, EDITOR_IDS.vectorActivationSummariesId, DEFAULT_CHAT_PROFILE.vectorStrategy.activationSummaries),
            idleDecayDays: getNumberValue(overlay, EDITOR_IDS.vectorIdleDecayDaysId, DEFAULT_CHAT_PROFILE.vectorStrategy.idleDecayDays),
            lowPrecisionSearchStride: getNumberValue(overlay, EDITOR_IDS.vectorLowPrecisionStrideId, DEFAULT_CHAT_PROFILE.vectorStrategy.lowPrecisionSearchStride),
        },
    };
}

/**
 * 功能：从编辑器表单采集保留策略覆盖值。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 保留策略覆盖对象。
 */
function collectRetentionOverrideFromForm(overlay: HTMLElement): Partial<RetentionPolicy> {
    return {
        deletionStrategy: getSelectValue(overlay, EDITOR_IDS.deletionStrategyId) as DeletionStrategy,
        keepSummaryCount: getNumberValue(overlay, EDITOR_IDS.keepSummaryCountId, DEFAULT_RETENTION_POLICY.keepSummaryCount),
        keepEventCount: getNumberValue(overlay, EDITOR_IDS.keepEventCountId, DEFAULT_RETENTION_POLICY.keepEventCount),
        keepVectorDays: getNumberValue(overlay, EDITOR_IDS.keepVectorDaysId, DEFAULT_RETENTION_POLICY.keepVectorDays),
    };
}

/**
 * 功能：更新聊天列表中的激活项样式。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 当前聊天键。
 * @returns 无返回值。
 */
function updateChatListActiveState(overlay: HTMLElement, chatKey: string): void {
    overlay.querySelectorAll<HTMLElement>('.stx-memory-chat-strategy-chat-item').forEach((item: HTMLElement): void => {
        item.classList.toggle('is-active', String(item.dataset.chatKey || '') === chatKey);
    });
}

/**
 * 功能：将机器字典转换为人类易读名。
 * @param key 字段名。
 * @returns 友好的字段名。
 */
function translateDiagnosticKey(key: string): string {
    const dict: Record<string, string> = {
        // 顶层结构
        chatProfile: '基础配置',
        adaptivePolicy: '自适应策略',
        retentionPolicy: '数据保留',
        effectiveProfile: '结合生效方案',
        effectivePolicy: '结合生效策略',
        effectiveRetention: '结合数据保留',

        // 画像/参数
        chatType: '聊天结构',
        stylePreference: '响应风格',
        memoryStrength: '记忆干预度',
        extractStrategy: '提取核心',
        summaryStrategy: '摘要格式',
        deletionStrategy: '清理模式',
        vectorStrategy: '库检索引擎',
        enabled: '总开关',
        chunkThreshold: '切分字数',
        rerankThreshold: '重排触发线',
        activationFacts: '事实启动水位',
        activationSummaries: '摘要启动水位',
        idleDecayDays: '冷却休眠期(天)',
        lowPrecisionSearchStride: '低清步进补偿',
        keepSummaryCount: '保留摘要数',
        keepEventCount: '保留事件数',
        keepVectorDays: '保留天数',

        // 自适应策略扩展
        extractInterval: '抽取触发间隔',
        extractWindowSize: '抽取窗口大小',
        summaryEnabled: '摘要总开关',
        worldStateWeight: '世界状态权重',
        vectorMinFacts: '事实启动水位',
        vectorMinSummaries: '摘要启动水位',
        vectorSearchStride: '搜索步进比例',
        rerankEnabled: '深度重排开关',
        contextMaxTokensShare: '上下文预算占比',
        lorebookPolicyWeight: '世界书权重',
        actorSalienceTopK: '角色活跃度 TopK',
        groupLaneEnabled: '群组分流',
        entityResolutionLevel: '实体解析强度',
        speakerTrackingLevel: '说话人跟踪强度',
        summaryMode: '摘要生成模式',

        // 动态指标
        adaptiveMetrics: '近况指标',
        windowSize: '观察窗口',
        avgMessageLength: '平均消息长度',
        assistantLongMessageRatio: '助手长文率',
        userInfoDensity: '有效信息密度',
        repeatedTopicRate: '主题重复率',
        factsHitRate: '事实命中率',
        factsUpdateRate: '事实更新率',
        retrievalHitRate: '检索命中率',
        promptInjectionTokenRatio: '注入占比',
        summaryEffectiveness: '摘要有效率',
        worldStateSignal: '世界状态信号',
        duplicateRate: '冗余度',
        retrievalPrecision: '检索精度',
        extractAcceptance: '抽取接受率',
        summaryStaleness: '摘要陈旧度',
        tokenEfficiency: '令牌利用效率',
        orphanFactsRatio: '孤儿事实比',
        schemaHygiene: '结构卫生度',
        messageInputRatio: '长短交流比',
        recentDensity: '有效信息密度',
        userInvolvement: '交互频繁度',
        recentUserTurns: '最近玩家发言数',
        recentAssistantTurns: '最近助手发言数',
        recentGroupSpeakerCount: '最近群聊发言人数',
        lastVectorAccessAt: '最近库访问时间',
        lastVectorHitAt: '最近库命中时间',
        lastVectorIndexAt: '最近库索引时间',
        lastUpdatedAt: '最后更新时间',

        // 向量/质量统计
        factCount: '事实总数',
        summaryCount: '摘要总数',
        memoryCardCount: '记忆卡总数',
        lastAccessAt: '最后访问时间',
        lastHitAt: '最后命中时间',
        lastIndexAt: '最后索引时间',
        searchRequestCount: '搜索请求计数',
        lastPrecision: '最近精准度评级',
        totalScore: '综合健壮得分',
        level: '状态评级',
        dimensions: '评分细项',
        vectorLifecycle: '向量库生命周期',
        memoryQuality: '记忆质量评估',
        maintenanceAdvice: '维护建议列表',
        maintenanceInsights: '深度维护洞察',
        lifecycleState: '聊天活跃阶段',
        promptInjectionProfile: '注入配置概览',
        groupMemory: '群聊分轨状态',
        lanes: '角色车道',
        sharedScene: '共享场景',
        actorSalience: '角色显著度',
        roleScope: '角色作用域',
        roleScopeKey: '角色作用域键',
        bindingSnapshot: '绑定快照',
        overrides: '手动覆盖项',

        // 决策与状态
        vectorMode: '运转模式',
        maintenanceMode: '深度维护状态',
        budgetMaxTokens: '投入上限',
        budgetReservedTokens: '容忍阈值',
        budgetFacts: '事实预算',
        budgetEvents: '事件预算',
        budgetSummaries: '摘要预算',
        intent: '本次研判意图',
        sectionsUsed: '本次激活区块',
        budgets: '详细预算分配',
        reason: '产生原因',
        reasonCodes: '判定依据',
        generatedAt: '决策生成时间',
        shouldInject: '是否注入',
        lorebookMode: '世界书策略',
        layoutMode: '注入布局',
        insertionRole: '插入角色',
        insertionPosition: '插入位置',
        queryMode: '查询模式',
        blocksUsed: '已使用分层块',
        shouldTrimPrompt: '是否裁剪 Prompt',
        valueClass: '生成价值等级',
        shouldPersistLongTerm: '是否永久存储',
        shouldExtractFacts: '是否抽取事实',
        shouldUpdateWorldState: '是否更新世界状态',
        shortTermOnly: '仅短期滞留',
        groupLaneBudgetShare: '分流预算占比',
        profileRefreshInterval: '画像刷新间隔',
        qualityRefreshInterval: '质量评估间隔',
        vectorIdleDecayDays: '闲置衰减天数',
    };
        return dict[key] || key;
}

function formatSummarySourceLabel(source: SummarySettingsSource | null | undefined): string {
    if (source === 'chat_override') {
        return '当前聊天覆盖';
    }
    if (source === 'global_setting') {
        return '全局默认';
    }
    if (source === 'scenario_preset') {
        return '场景预设';
    }
    if (source === 'memory_mode_preset') {
        return '记忆模式预设';
    }
    return '系统默认';
}

function formatSummaryMemoryModeLabel(value: SummaryMemoryMode): string {
    return value === 'streamlined' ? '精简' : value === 'deep' ? '深度' : '平衡';
}

function formatSummaryScenarioLabel(value: SummaryScenario): string {
    const labels: Record<SummaryScenario, string> = {
        auto: '自动',
        companion_chat: '陪伴闲聊',
        long_rp: '长剧情角色扮演',
        worldbook_qa: '世界设定问答',
        group_trpg: '群聊 / 跑团',
        tool_qa: '工具 / 代码协作',
        custom: '自定义',
    };
    return labels[value] ?? '自动';
}

function formatSummaryResourcePriorityLabel(value: SummaryResourcePriority): string {
    return value === 'quality' ? '质量优先' : value === 'saving' ? '节省优先' : '平衡';
}

function formatSummaryTimingLabel(value: SummaryTiming): string {
    return value === 'key_only' ? '关键节点' : value === 'frequent' ? '更频繁' : '阶段结束';
}

function formatSummaryLengthLabel(value: SummaryLength): string {
    return value === 'short' ? '短' : value === 'detailed' ? '详细' : value === 'ultra' ? '超长' : '标准';
}

function formatSummaryCooldownLabel(value: SummaryCooldownPreset): string {
    return value === 'short' ? '短' : value === 'long' ? '长' : '标准';
}

function formatSummaryRecordFocusLabel(value: SummaryRecordFocus): string {
    const labels: Record<SummaryRecordFocus, string> = {
        facts: '事实',
        relationship: '关系',
        world: '世界',
        plot: '剧情',
        emotion: '情绪',
        tool_result: '工具结果',
    };
    return labels[value] ?? value;
}

function formatSummaryLowValueHandlingLabel(value: SummaryLowValueHandling): string {
    return value === 'keep_more' ? '保留更多' : value === 'keep_some' ? '保留部分' : '忽略';
}

function formatSummaryNoiseFilterLabel(value: SummaryNoiseFilter): string {
    return value === 'high' ? '高过滤' : value === 'low' ? '低过滤' : '中过滤';
}

function formatSummaryProcessIntervalLabel(value: SummaryProcessInterval): string {
    return value === 'small' ? '小' : value === 'large' ? '大' : '中';
}

function formatSummaryLookbackScopeLabel(value: SummaryLookbackScope): string {
    return value === 'small' ? '小' : value === 'large' ? '大' : '中';
}

function formatSummaryTriggerLabel(value: SummaryLongTrigger): string {
    const labels: Record<SummaryLongTrigger, string> = {
        scene_end: '场景结束',
        combat_end: '战斗结束',
        plot_advance: '剧情推进',
        relationship_shift: '关系变化',
        world_change: '世界变化',
        structure_repair: '结构修复',
        archive_finalize: '归档整理',
    };
    return labels[value] ?? value;
}

/**
 * 功能：构建诊断字段键名的中文提示文案。
 * @param key 字段键名。
 * @returns 中文提示文案。
 */
function buildDiagnosticKeyTip(key: string): string {
    const tips: Record<string, string> = {
        extractInterval: '决定每隔多少轮对话触发一次记忆总结。数值越小，记忆更新越频繁。',
        extractWindowSize: '总结记忆时回溯的对话轮数。窗口越大，单次总结覆盖的信息越全。',
        summaryEnabled: '是否允许系统自动生成历史摘要，关闭后将只依赖短期记忆。',
        worldStateWeight: '决定在生成时给“世界设定/当前环境”分配多少影响力。',
        vectorMinFacts: '至少累积多少条事实后，系统才会开始通过向量库检索知识。',
        vectorMinSummaries: '至少累积多少条摘要后，系统才会开始检索长周期历史摘要。',
        vectorSearchStride: '向量搜索时的广度因子。步长越大，找回的记忆越跳跃、越丰富。',
        rerankEnabled: '开启后，系统会进行二次筛选，确保检索到的记忆与当前语境高度契合。',
        contextMaxTokensShare: '给记忆留出的最大上下文额度。占比越高，AI 能记住的陈年旧事越多。',
        lorebookPolicyWeight: '系统在决策时，给予 ST 世界书匹配结果的优先程度。',
        actorSalienceTopK: '决定在群聊中，优先考虑多少个最活跃的角色进行关联记忆搜索。',
        groupLaneEnabled: '开启后会为群聊拆出角色车道、共享场景和角色显著度，方便群像场景保持连续性。',
        groupMemory: '群聊模式下的诊断快照，包含每个角色车道、共享场景摘要和活跃角色排序。',
        lanes: '每条车道代表一个角色或发言轨迹，能帮助定位谁的上下文被重点保留。',
        sharedScene: '群聊共享场景信息，通常记录共同地点、时间线或当前队伍共识。',
        actorSalience: '按最近活跃度和重要性排序的角色列表，越靠前越容易拿到预算。',
        roleScope: '当前聊天套用角色卡默认预设时解析出的作用域类型，例如 character 或 group。',
        roleScopeKey: '角色卡默认预设的唯一作用域键，用来判断当前聊天命中了哪一层默认策略。',
        bindingSnapshot: '记录群聊绑定时的成员信息快照，用于后续校验分轨是否仍然有效。',
        windowSize: '系统在计算动态指标时参考的最近对话轮数。',
        avgMessageLength: '最近窗口内消息的平均字数，反映对话内容的丰富程度。',
        assistantLongMessageRatio: 'AI 回复中长文本占比。比例高说明 AI 倾向于展开描写，比例低则说明多为短语。',
        userInfoDensity: '评估用户每条发言包含的实质信息价值。数值越高，越容易触发记忆总结。',
        repeatedTopicRate: '最近对话中话题循环往复的程度，过高可能导致记忆系统尝试干预。',
        factsHitRate: '查询事实记录时，能被准确找到并成功利用的概率。',
        factsUpdateRate: '发现并记录新事实的频率。高的更新率代表剧情进入了密集的信息变动期。',
        retrievalHitRate: '向量检索或关键词检索能搜寻到相关片段的成功概率。',
        promptInjectionTokenRatio: '各种记忆内容占据当前 prompt 总长度的百分比，反映记忆对生成的干预强度。',
        summaryEffectiveness: '被注入的摘要内容有多少能对当前的补全产生实质助推作用。',
        worldStateSignal: '当前语境对世界观、环境设定等底层规则的敏感程度。',
        duplicateRate: '记忆库中语义重复的内容占比。过高会触发数据去重维护。',
        retrievalPrecision: '检索结果与当前对话语境的相关性得分，反映搜到的东西“准不准”。',
        extractAcceptance: 'AI 提炼出的新事实有多少进入 mutation planner 后被实际执行。',
        summaryStaleness: '评估现有历史总结是否已经过时（对话已偏离原主题）。',
        tokenEfficiency: '单位 Token 承载的有效信息量。反映记忆压缩和表达是否精炼。',
        orphanFactsRatio: '库中那些虽然存在但与当前任何剧情主线都关联不上的琐碎碎片的比例。',
        schemaHygiene: '系统元数据和表结构的整洁度，影响检索效率和模型理解力。',
        chatType: '系统自动分析出的当前对话性质（单人聊天、群聊、说明书问答等）。',
        stylePreference: '系统认为目前最适合的回复基调（剧情向、问答向、跑团向或信息向）。',
        memoryStrength: '系统认为本聊天需要的记忆接入强度。高强度会更激进地寻找相关背景。',
        extractStrategy: '决定要自动提取哪些维度的信息：纯事实、还是包含人际关系或世界设定。',
        summaryStrategy: '决定历史总结的排版方案。分层摘要侧重全局，时间轴摘要侧重流程。',
        deletionStrategy: '决定当记忆容量不足时，如何筛选并丢弃那些最不重要的旧数据。',
        shouldInject: '判定本轮 AI 发言前，系统最终决定是否向上下文塞入记忆信息。',
        sectionsUsed: '本轮决策挑选并使用了哪些记忆模块（如事实、摘要、群聊分流等）。',
        budgets: '给各记忆模块分配的最大字数限额。由系统根据当前的上下文剩余空间动态分配。',
        lorebookMode: '针对这次生成，系统决定如何结合世界书条目：强制注入、有条件注入或禁止。',
        layoutMode: '当前注入采用的分层布局模式，第一阶段固定为 layered_memory_context。',
        insertionRole: '记忆块被写入时使用的消息角色，第一阶段固定为 user。',
        insertionPosition: '记忆块在 Prompt 中的插入位置，第一阶段固定为最后一条真实用户消息之前。',
        shouldTrimPrompt: '当上下文即将溢出时，系统是否决定主动对原始 Prompt 进行无损压缩。',
        blocksUsed: '本轮 Memory Context 真正使用了哪些分层块，例如导演块或角色块。',
        valueClass: '评估 AI 这一句回复的“含金量”（如剧情推进、设定确认、琐事闲谈等）。',
        shouldPersistLongTerm: '判定本次对话产生的信息，是否有必要记入长期数据库（长远记忆）。',
        shouldExtractFacts: '判定是否需要从这段对话中提炼出结构化的固定事实记录。',
        shouldUpdateWorldState: '判定这段对话是否改变了当前的环境、位置或时间等底层状态。',
        shortTermOnly: '如果开启，代表系统认为这段对话只在当下有用，几天后就不再需要保留。',
        intent: '系统通过分析你上一句话，判断你现在是在“问设定”、“续写剧情”还是“RP”。',
        recentUserTurns: '在当前观察窗口内，来自玩家的有效发言轮数。',
        recentAssistantTurns: '在当前观察窗口内，来自助手（AI）的发言轮数。',
        recentGroupSpeakerCount: '在最近的群聊语境中，系统识别出的活跃发言人数估计。',
        lastVectorAccessAt: '向量数据库上一次被读取的精确时间戳。',
        lastVectorHitAt: '向量库上一次成功找到并匹配到相关记忆的时间戳。',
        lastVectorIndexAt: '上一次将新对话内容写入并索引进向量库的时间戳。',
        lastUpdatedAt: '该诊断卡片内所有指标数据最后一次计算更新的时间。',
        groupLaneBudgetShare: '在群聊模式下，给不同角色的独立记忆流分配的上下文预算比例。',
        profileRefreshInterval: '系统自动重新研判聊天画像（响应风格、记忆强度等）的轮数间隔。',
        qualityRefreshInterval: '系统自动重新评估记忆质量分数和维护建议的轮数间隔。',
        vectorIdleDecayDays: '向量记忆在没有任何访问的情况下，开始逐渐降低由于新鲜度带来的权重的冷却周期。',
        entityResolutionLevel: '决定系统识别不同角色、物品等实体之间关联关联关系的由于语义相似度而合并的强度。',
        speakerTrackingLevel: '在多角色或群聊环境下，系统追踪不同角色的发言特征和当前状态的精细程度。',
        summaryMode: '当前使用的总结算法和格式布局，如分层架构或线性时间轴。',
        factCount: '当前语境下已持久化存储的离散事实点总数。',
        summaryCount: '已生成的用于长周期理解的历史摘要总数。',
        memoryCardCount: '经过准入并存储在记忆卡索引中的卡片数量。',
        lastAccessAt: '该组件或指标最后一次被系统访问执行的操作时刻。',
        lastHitAt: '该组件（如检索库）最后一次成功产生有效返回值的时刻。',
        lastIndexAt: '该组件最后一次接收并处理新数据索引的时刻。',
        searchRequestCount: '自聊天开始以来，系统尝试通过检索寻找记忆的总频率。',
        lastPrecision: '最后一次检索任务中，搜回的内容与当前语境的相关程度系数。',
        totalScore: '由算法综合评估得出的记忆系统整体健康得分，满分 100。',
        level: '当前记忆状态的等级化分类，从“极佳”到“危急”不等。',
        dimensions: '包含冗余度、精准度、接受率等多个具体评分维度的集合。',
        vectorLifecycle: '向量数据库的内部运转状态总结，包括索引频率和利用率。',
        memoryQuality: '当前聊天记忆的综合质量评估，直接影响 AI 的逻辑连贯性。',
        lifecycleState: '系统判定该聊天的发展阶段，如“新会话”、“活跃期”或“已归档”。',
        overrides: '你手动设置的、会覆盖系统自动建议的个性化参数列表。',
    };

    const label: string = translateDiagnosticKey(key);
    const tip: string = tips[key] || `用于说明该诊断字段 [${key}] 当前值的来源与作用，帮助你定位策略是否按预期生效。`;
    return `<strong>${label}</strong><br/>${tip}`;
}

/**
 * 功能：把诊断面板中的内部值转换为更用户友好的展示文案。
 * @param key 字段键名。
 * @param value 原始值。
 * @returns 用户可读值。
 */
function formatDiagnosticDisplayValue(key: string, value: unknown): unknown {
    if (key === 'roleScope') {
        if (value === 'group') {
            return '群聊默认';
        }
        if (value === 'character') {
            return '角色卡默认';
        }
        if (value === 'none' || value === '' || value == null) {
            return '未命中显式默认';
        }
    }

    if (key === 'roleScopeKey') {
        const text = String(value ?? '').trim();
        if (!text) {
            return '未命中显式默认';
        }
        if (text.startsWith('group:')) {
            return `群聊对象 · ${text.slice('group:'.length) || '未命名群聊'}`;
        }
        if (text.startsWith('character:')) {
            return `角色卡对象 · ${text.slice('character:'.length) || '未命名角色卡'}`;
        }
    }

    if (key === 'intent') {
        return formatIntentLabel(String(value ?? ''));
    }

    if (key === 'sectionsUsed') {
        return formatSectionLabel(String(value ?? ''));
    }

    if (key === 'reasonCodes') {
        return formatDecisionReasonCodeLabel(String(value ?? ''));
    }

    if (key === 'lorebookMode') {
        return formatLorebookModeLabel(String(value ?? ''));
    }

    if (key === 'queryMode') {
        return formatQueryModeLabel(String(value ?? ''));
    }

    if (key === 'layoutMode') {
        return formatLayoutModeLabel(String(value ?? ''));
    }

    if (key === 'insertionRole') {
        return formatInsertionRoleLabel(String(value ?? ''));
    }

    if (key === 'insertionPosition') {
        return formatInsertionPositionLabel(String(value ?? ''));
    }

    if (key === 'blocksUsed') {
        return formatMemoryContextBlocksValue(value);
    }

    return value;
}

/**
 * 功能：把对象写入诊断卡片，使用自然语言渲染机制。
 * @param overlay 编辑器遮罩层根节点。
 * @param blockId 内容区域 ID。
 * @param payload 要展示的对象。
 * @returns 无返回值。
 */
function writeJsonBlock(overlay: HTMLElement, blockId: string, payload: unknown): void {
    const target: HTMLElement | null = overlay.querySelector(`#${blockId}`) as HTMLElement | null;
    if (!target) {
        return;
    }

    function renderNode(obj: unknown, depth: number = 0, fieldKey: string = ''): string {
        const formatted = fieldKey ? formatDiagnosticDisplayValue(fieldKey, obj) : obj;
        obj = formatted;
        if (obj == null) return '<span class="stx-memory-diag-val is-null">空</span>';
        if (typeof obj === 'boolean') return `<span class="stx-memory-diag-val is-bool">${obj ? '开启' : '关闭'}</span>`;
        if (typeof obj === 'number') return `<span class="stx-memory-diag-val is-num">${obj}</span>`;
        if (typeof obj === 'string') return `<span class="stx-memory-diag-val is-str">${escapeHtml(obj)}</span>`;

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<span class="stx-memory-diag-val is-empty">无内容</span>';
            const items = obj.map(v => `<div class="stx-memory-diag-array-item">${renderNode(v, depth + 1, fieldKey)}</div>`).join('');
            return `<div class="stx-memory-diag-array">${items}</div>`;
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj as object);
            if (keys.length === 0) return '<span class="stx-memory-diag-val is-empty">未设置</span>';

            const rows = keys.map(k => {
                const val = (obj as Record<string, unknown>)[k];
                return `
                    <div class="stx-memory-diag-row">
                        <span class="stx-memory-diag-key" data-tip-html="true" data-tip="${escapeHtml(buildDiagnosticKeyTip(k))}">${escapeHtml(translateDiagnosticKey(k))}</span>
                        <div class="stx-memory-diag-value">${renderNode(val, depth + 1, k)}</div>
                    </div>
                `;
            }).join('');
            return `<div class="stx-memory-diag-object" style="padding-left: ${depth > 0 ? 8 : 0}px;">${rows}</div>`;
        }

        return '<span class="stx-memory-diag-val">未知类型</span>';
    }

    target.innerHTML = renderNode(payload);
}

/**
 * 功能：格式化记忆质量等级标签。
 * @param value 等级值。
 * @returns 中文标签。
 */
function formatMemoryQualityLevelLabel(value: string): string {
    if (value === 'excellent') {
        return '优秀';
    }
    if (value === 'healthy') {
        return '健康';
    }
    if (value === 'watch') {
        return '关注';
    }
    if (value === 'poor') {
        return '偏低';
    }
    if (value === 'critical') {
        return '危险';
    }
    return value || '未知';
}

/**
 * 功能：格式化质量分项标签。
 * @param key 分项键。
 * @returns 中文标签。
 */
function formatQualityDimensionLabel(key: string): string {
    if (key === 'duplicateRate') {
        return '去重质量';
    }
    if (key === 'retrievalPrecision') {
        return '检索精度';
    }
    if (key === 'extractAcceptance') {
        return '抽取接受率';
    }
    if (key === 'summaryFreshness') {
        return '摘要新鲜度';
    }
    if (key === 'tokenEfficiency') {
        return 'Token 效率';
    }
    if (key === 'orphanFactsRatio') {
        return '孤儿事实比例';
    }
    if (key === 'schemaHygiene') {
        return 'Schema 卫生';
    }
    return key;
}

/**
 * 功能：格式化向量模式标签。
 * @param value 向量模式。
 * @param isEnabled 全局向量是否处于开启状态。
 * @returns 中文标签。
 */
function formatVectorModeLabel(value: string, isEnabled: boolean = false): string {
    if (!isEnabled) {
        return '未开启';
    }
    if (value === 'off') {
        return '待机 (未达阈值)';
    }
    if (value === 'index_only') {
        return '仅索引 (构建中)';
    }
    if (value === 'search') {
        return '检索激活';
    }
    if (value === 'search_rerank') {
        return '深度检索 (+重排)';
    }
    return value || '未知';
}

/**
 * 功能：格式化时间戳显示。
 * @param value 时间戳。
 * @returns 可读时间。
 */
function formatTimestamp(value: number): string {
    const ts = Number(value ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) {
        return '暂无';
    }
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return '暂无';
    }
}

/**
 * 功能：替换摘要区段标签。
 * @param container 标签容器。
 * @param sections 区段列表。
 * @returns 无返回值。
 */
function replaceSummaryChips(container: HTMLElement, sections: string[]): void {
    if (!sections.length) {
        container.innerHTML = '<span class="stx-memory-chat-strategy-empty">暂无注入记录</span>';
        return;
    }
    container.innerHTML = sections
        .map((section: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(formatSectionLabel(section))}</span>`)
        .join('');
}

/**
 * 功能：加载当前 Tavern 下的聊天选项。
 * @returns 聊天选项列表。
 */
async function loadChatOptions(): Promise<ChatOption[]> {
    const currentChatKey: string = getCurrentChatKey();
    const chats: unknown[] = await listTavernChatsForCurrentTavernEvent().catch((): unknown[] => []);
    const options: ChatOption[] = chats.map((item: unknown): ChatOption => {
        const locator: SdkTavernChatLocatorEvent = ((item as { locator?: SdkTavernChatLocatorEvent })?.locator ?? {
            chatId: '',
            scopeType: 'character',
            scopeId: '',
            roleKey: '',
            roleId: '',
            displayName: '',
            avatarUrl: '',
            groupId: '',
            characterId: 0,
            currentChatId: '',
            tavernInstanceId: '',
        }) as SdkTavernChatLocatorEvent;
        const chatKey: string = buildTavernChatScopedKeyEvent(locator);
        const displayName: string = String(locator.displayName ?? locator.chatId ?? '未命名聊天');
        const chatId: string = String(locator.chatId ?? '');
        return {
            value: chatKey,
            label: `${displayName}${chatId ? ` (${chatId})` : ''}`,
            avatarUrl: String(locator.avatarUrl ?? '').trim(),
            iconClassName: locator.scopeType === 'group' ? 'fa-solid fa-users' : 'fa-solid fa-user',
        };
    });
    if (currentChatKey && !options.some((item: ChatOption): boolean => item.value === currentChatKey)) {
        options.unshift({
            value: currentChatKey,
            label: `当前聊天 (${currentChatKey})`,
            avatarUrl: '',
            iconClassName: 'fa-solid fa-user',
        });
    }
    return options;
}

/**
 * 功能：把选项写入指定原生下拉框。
 * @param select 原生下拉框。
 * @param options 选项列表。
 * @param selectedValue 当前选中值。
 * @returns 无返回值。
 */
function replaceSelectOptions(select: HTMLSelectElement, options: ChatOption[], selectedValue: string): void {
    select.innerHTML = options
        .map((item: ChatOption): string => {
            const mediaAttributes: string = item.avatarUrl
                ? ` data-media-type="image" data-media-src="${escapeHtml(item.avatarUrl)}" data-media-alt="${escapeHtml(item.label)}"`
                : ` data-media-type="icon" data-media-icon="${escapeHtml(item.iconClassName || 'fa-solid fa-user')}"`;
            return `<option value="${escapeHtml(item.value)}"${mediaAttributes}>${escapeHtml(item.label)}</option>`;
        })
        .join('');
    if (selectedValue && options.some((item: ChatOption): boolean => item.value === selectedValue)) {
        select.value = selectedValue;
    }
}

/**
 * 功能：读取当前聊天键。
 * @returns 当前聊天键。
 */
function getCurrentChatKey(): string {
    return String(((window as unknown as WindowWithMemory).STX?.memory?.getChatKey?.()) ?? '').trim();
}

/**
 * 功能：读取窗口中的聊天状态 API。
 * @returns 聊天状态 API 或空值。
 */
function getWindowMemoryChatState(): MemoryChatStateApi | undefined {
    return (window as unknown as WindowWithMemory).STX?.memory?.chatState;
}

/**
 * 功能：根据聊天键查找展示名称。
 * @param chatKey 聊天键。
 * @returns 展示名称。
 */
function findChatLabel(chatKey: string): string {
    return cachedChatOptions.find((item: ChatOption): boolean => item.value === chatKey)?.label || chatKey || '未选择聊天';
}

/**
 * 功能：生成适合摘要卡展示的紧凑聊天名称。
 * @param chatKey 聊天键。
 * @returns 更短的摘要名称。
 */
function formatCompactChatLabel(chatKey: string): string {
    const fullLabel = findChatLabel(chatKey).trim();
    if (!fullLabel) {
        return '未选择聊天';
    }
    const normalizedKey = String(chatKey || '').trim();
    if (normalizedKey && fullLabel.includes(normalizedKey)) {
        const compactLabel = fullLabel
            .replace(normalizedKey, ' ')
            .replace(/[()（）]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (compactLabel) {
            return compactLabel;
        }
    }
    if (fullLabel.length > 28) {
        return `${fullLabel.slice(0, 25)}...`;
    }
    return fullLabel;
}

/**
 * 功能：设置下拉框的当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param value 目标值。
 * @returns 无返回值。
 */
function setSelectValue(root: ParentNode, id: string, value: string): void {
    const element: HTMLSelectElement | null = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    if (element) {
        element.value = value;
    }
}

/**
 * 功能：读取下拉框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @returns 下拉框值。
 */
function getSelectValue(root: ParentNode, id: string): string {
    const element: HTMLSelectElement | null = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    return String(element?.value ?? '').trim();
}

/**
 * 功能：设置复选框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param checked 是否选中。
 * @returns 无返回值。
 */
function setCheckboxValue(root: ParentNode, id: string, checked: boolean): void {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    if (element) {
        element.checked = checked;
    }
}

/**
 * 功能：读取复选框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @returns 是否选中。
 */
function getCheckboxValue(root: ParentNode, id: string): boolean {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    return element?.checked === true;
}

/**
 * 功能：设置输入框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param value 目标值。
 * @returns 无返回值。
 */
function setInputValue(root: ParentNode, id: string, value: number): void {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    if (element) {
        element.value = String(value);
    }
}

/**
 * 功能：读取数字输入框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param fallback 兜底值。
 * @returns 数字值。
 */
function getNumberValue(root: ParentNode, id: string, fallback: number): number {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    const numeric: number = Number(element?.value ?? fallback);
    return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * 功能：选择顶部小诊断要展示的最高优先级维护异常。
 * @param insights 维护感知列表。
 * @returns 最高优先级维护异常；没有异常则返回 null。
 */
function pickTopMaintenanceAlert(insights: MaintenanceInsight[]): MaintenanceInsight | null {
    const list = Array.isArray(insights) ? insights : [];
    const priority = (value: MaintenanceInsight['severity']): number => {
        if (value === 'critical') {
            return 3;
        }
        if (value === 'warning') {
            return 2;
        }
        return 1;
    };
    const visible = list
        .filter((item: MaintenanceInsight): boolean => item.severity === 'warning' || item.severity === 'critical')
        .sort((left: MaintenanceInsight, right: MaintenanceInsight): number => priority(right.severity) - priority(left.severity));
    return visible[0] ?? null;
}

/**
 * 功能：格式化维护严重度标签。
 * @param severity 严重度。
 * @returns 严重度中文标签。
 */
function formatMaintenanceSeverityLabel(severity: MaintenanceInsight['severity']): string {
    if (severity === 'critical') {
        return '严重';
    }
    if (severity === 'warning') {
        return '警告';
    }
    return '提示';
}

/**
 * 功能：格式化生命周期阶段标签。
 * @param stage 生命周期阶段。
 * @returns 生命周期中文标签。
 */
function formatLifecycleStageLabel(stage: ChatLifecycleState['stage']): string {
    if (stage === 'new') {
        return '新会话';
    }
    if (stage === 'active') {
        return '活跃';
    }
    if (stage === 'stable') {
        return '稳定';
    }
    if (stage === 'long_running') {
        return '长线运行';
    }
    if (stage === 'archived') {
        return '已归档';
    }
    if (stage === 'deleted') {
        return '已删除';
    }
    return stage;
}

/**
 * 功能：格式化当前预设来源链路。
 * @param bundle 生效预设包。
 * @returns 用户可读的预设来源说明。
 */


/**
 * 功能：格式化群聊分轨摘要。
 * @param groupMemory 群聊分轨状态。
 * @param enabled 是否启用分轨。
 * @returns 分轨摘要文本。
 */
function formatGroupLaneSummary(groupMemory: GroupMemoryState | null, enabled: boolean): string {
    if (!enabled) {
        return '已关闭';
    }
    const lanes = Array.isArray(groupMemory?.lanes) ? groupMemory!.lanes : [];
    if (lanes.length === 0) {
        return '已开启，暂未形成车道';
    }
    const hasSharedScene = Boolean(
        String(groupMemory?.sharedScene?.currentScene ?? '').trim()
        || String(groupMemory?.sharedScene?.currentConflict ?? '').trim()
        || (Array.isArray(groupMemory?.sharedScene?.groupConsensus) && groupMemory!.sharedScene.groupConsensus.length > 0),
    );
    return `已开启 · ${lanes.length} 条车道${hasSharedScene ? ' · 含共享场景' : ''}`;
}

/**
 * 功能：格式化群聊分轨的主要角色概览。
 * @param groupMemory 群聊分轨状态。
 * @returns 角色概览文本。
 */
function formatGroupLaneActors(groupMemory: GroupMemoryState | null): string {
    const laneNameByActorKey: Map<string, string> = new Map(
        (Array.isArray(groupMemory?.lanes) ? groupMemory!.lanes : []).map((lane) => [lane.actorKey, lane.displayName]),
    );
    const topActors = Array.isArray(groupMemory?.actorSalience)
        ? groupMemory!.actorSalience
            .slice(0, 3)
            .map((item): string => String(laneNameByActorKey.get(item.actorKey) ?? item.actorKey ?? '').trim())
            .filter((name: string): boolean => Boolean(name))
        : [];
    const sceneParts = [
        String(groupMemory?.sharedScene?.currentScene ?? '').trim(),
        String(groupMemory?.sharedScene?.currentConflict ?? '').trim(),
    ].filter((part: string): boolean => Boolean(part));
    const sceneSummary = sceneParts.join(' / ');
    if (topActors.length === 0 && !sceneSummary) {
        return '暂无角色显著度数据';
    }
    if (topActors.length === 0) {
        return `共享场景：${sceneSummary}`;
    }
    return sceneSummary
        ? `高活跃角色：${topActors.join(' / ')} · 共享场景：${sceneSummary}`
        : `高活跃角色：${topActors.join(' / ')}`;
}

/**
 * 功能：格式化世界书策略标签。
 * @param value 原始策略值。
 * @returns 中文标签。
 */
function formatLorebookModeLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        force_inject: '强制带入世界书',
        soft_inject: '按相关性柔性带入',
        summary_only: '只保留摘要提示',
        block: '本轮不带入世界书',
    };
    return dict[normalized] || value || '自动判断';
}

/**
 * 功能：格式化注入布局标签。
 * @param value 原始布局值。
 * @returns 中文标签。
 */
function formatLayoutModeLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        layered_memory_context: '固定三层记忆布局',
    };
    return dict[normalized] || value || '固定分层布局';
}

/**
 * 功能：格式化注入角色标签。
 * @param value 原始角色值。
 * @returns 中文标签。
 */
function formatInsertionRoleLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        user: 'user 消息',
    };
    return dict[normalized] || value || '固定角色';
}

/**
 * 功能：格式化注入位置标签。
 * @param value 原始位置值。
 * @returns 中文标签。
 */
function formatInsertionPositionLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'before_last_user') {
        return '最后一条真实用户消息之前';
    }
    return value || '固定位置';
}

/**
 * 功能：格式化查询模式标签。
 * @param value 原始查询模式。
 * @returns 中文标签。
 */
function formatQueryModeLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'setting_only') {
        return '仅设定问答';
    }
    if (normalized === 'always') {
        return '始终可用';
    }
    return value || '自动判断';
}

/**
 * 功能：把 Memory Context 分层块转换成便于展示的文本。
 * @param value 分层块列表。
 * @returns 文本。
 */
function formatMemoryContextBlocksValue(value: unknown): string {
    if (!Array.isArray(value) || value.length === 0) {
        return '无分层块';
    }
    return value.map((item: any): string => {
        const kind = String(item?.kind ?? '').trim();
        const actorKey = String(item?.actorKey ?? '').trim();
        const sectionHints = Array.isArray(item?.sectionHints) ? item.sectionHints.map((hint: unknown): string => String(hint ?? '').trim()).filter(Boolean) : [];
        const prefix = kind === 'active_character_memory' ? '角色块' : '导演块';
        return actorKey
            ? `${prefix}(${actorKey})${sectionHints.length > 0 ? ` · ${sectionHints.join(',')}` : ''}`
            : `${prefix}${sectionHints.length > 0 ? ` · ${sectionHints.join(',')}` : ''}`;
    }).join(' / ');
}

/**
 * 功能：把决策原因码转换为更自然的中文说明。
 * @param code 原始原因码。
 * @returns 中文说明。
 */
function formatDecisionReasonCodeLabel(code: string): string {
    const raw = String(code || '').trim();
    const normalized = raw.toLowerCase();
    const layoutMatch = normalized.match(/^layout:(.+)$/i);
    if (layoutMatch) {
        return `注入布局：${formatLayoutModeLabel(layoutMatch[1])}`;
    }
    const insertionRoleMatch = normalized.match(/^insertion_role:(.+)$/i);
    if (insertionRoleMatch) {
        return `插入角色：${formatInsertionRoleLabel(insertionRoleMatch[1])}`;
    }
    const insertionPositionMatch = normalized.match(/^insertion_position:(.+)$/i);
    if (insertionPositionMatch) {
        return `插入位置：${formatInsertionPositionLabel(insertionPositionMatch[1])}`;
    }
    if (normalized.startsWith('block:')) {
        return `分层块：${raw.slice('block:'.length)}`;
    }
    const dict: Record<string, string> = {
        setting_only_mode: '当前只在设定问答场景下注入记忆',
        pre_gate_skip: '这一轮不适合注入额外记忆',
        lorebook_block: '世界书策略阻止了注入',
        chat_archived: '当前聊天已归档，暂停注入',
        setting_query: '检测到用户正在询问设定',
        story_progress: '当前对话更偏向推进剧情',
        tool_query: '当前请求更像工具问答',
        worldbook_profile: '当前聊天使用世界书导向配置',
        entry_matched: '命中了相关世界书条目',
        entry_not_matched: '没有命中相关世界书条目',
        no_active_lorebook: '当前没有启用世界书',
        world_conflict_detected: '检测到世界设定存在冲突风险',
        summary_only_mode: '本轮只保留摘要类提示',
        lorebook_blocked: '世界书拦截了这次注入',
        identity_memory: '更偏向角色身份类记忆',
        semantic_memory: '更偏向稳定语义记忆',
        episodic_memory: '更偏向情节经历记忆',
        working_memory: '更偏向近期上下文记忆',
        relation_signal: '关系线索与当前对话相关',
        emotion_signal: '情绪线索与当前对话相关',
        privacy_penalty: '因敏感度限制而降低优先级',
        below_threshold: '综合分数未达到采用阈值',
        keyword_hit: '与当前关键词高度相关',
        relation_match: '与当前关系线索匹配',
        emotion_match: '与当前情绪线索匹配',
        topic_continuity: '与当前话题保持连续',
        conflict_penalty: '因冲突惩罚被压低优先级',
        mutation_repair_required: '聊天结构变化较大，需要修复型处理',
    };
    if (dict[normalized]) {
        return dict[normalized];
    }
    const intentMatch = normalized.match(/^intent:(.+)$/i);
    if (intentMatch) {
        return `本轮意图偏向${formatIntentLabel(intentMatch[1])}`;
    }
    const lorebookMatch = normalized.match(/^lorebook:(.+)$/i);
    if (lorebookMatch) {
        return `世界书：${formatDecisionReasonCodeLabel(lorebookMatch[1])}`;
    }
    if (normalized.startsWith('mutation_repair:')) {
        return '聊天结构变化较大，触发了修复型处理';
    }
    return raw || '未知';
}

/**
 * 功能：格式化角色车道风格标签。
 * @param value 原始风格值。
 * @returns 中文风格标签。
 */
function formatLaneStyleLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        narrative: '叙事',
        story: '剧情',
        chat: '闲聊',
        dialogue: '对话',
        roleplay: '角色扮演',
        rp: '角色扮演',
        trpg: '跑团',
        info: '信息说明',
        qa: '问答',
        tool: '工具协作',
    };
    return dict[normalized] || value || '未知';
}

/**
 * 功能：格式化角色车道情绪标签。
 * @param value 原始情绪值。
 * @returns 中文情绪标签。
 */
function formatLaneEmotionLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        neutral: '平静',
        calm: '冷静',
        happy: '愉快',
        joy: '喜悦',
        sad: '难过',
        angry: '愤怒',
        upset: '不安',
        anxious: '焦虑',
        tense: '紧张',
        curious: '好奇',
        serious: '严肃',
        gentle: '温和',
        cold: '冷淡',
    };
    return dict[normalized] || value || '未知';
}

/**
 * 功能：格式化角色车道目标标签。
 * @param value 原始目标值。
 * @returns 中文目标标签。
 */
function formatLaneGoalLabel(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        immediate_response: '立刻回应',
        answer_question: '回答问题',
        provide_comfort: '安抚对方',
        keep_distance: '保持距离',
        push_plot: '推进剧情',
        gather_info: '收集信息',
        observe_reaction: '观察反应',
        maintain_scene: '维持场景',
        protect_user: '保护用户',
    };
    return dict[normalized] || value || '未知';
}

/**
 * 功能：格式化质量原因码。
 * @param code 原始原因码。
 * @returns 中文说明。
 */
function formatQualityReasonCodeLabel(code: string): string {
    const normalized = String(code || '').trim().toLowerCase();
    const dict: Record<string, string> = {
        duplicate_rate_high: '重复内容偏多',
        retrieval_precision_low: '检索精度偏低',
        extract_acceptance_low: '抽取采纳率偏低',
        summary_freshness_low: '摘要新鲜度偏低',
        summary_staleness_high: '摘要陈旧度偏高',
        token_efficiency_low: 'Token 利用效率偏低',
        orphan_facts_ratio_high: '孤儿事实比例偏高',
        schema_hygiene_low: '结构卫生度偏低',
        vector_idle_too_long: '向量库沉寂过久',
        vector_precision_low: '向量精度偏低',
        maintenance_recommended: '建议执行维护',
    };
    return dict[normalized] || code;
}

/**
 * 功能：格式化生命周期原因码。
 * @param code 原始原因码。
 * @returns 中文说明。
 */
function formatLifecycleReasonCodeLabel(code: string): string {
    const raw = String(code || '').trim();
    const normalized = raw.toLowerCase();
    const directDict: Record<string, string> = {
        stage_new: '新会话阶段',
        stage_active: '处于活跃阶段',
        stage_stable: '进入稳定阶段',
        stage_long_running: '进入长线阶段',
        stage_archived: '已归档',
    };
    if (directDict[normalized]) {
        return directDict[normalized];
    }
    if (/^turns_\d+$/.test(normalized)) {
        return `已累计 ${normalized.replace('turns_', '')} 楼`;
    }
    if (/^facts_\d+$/.test(normalized)) {
        return `已沉淀 ${normalized.replace('facts_', '')} 条事实`;
    }
    if (/^summaries_\d+$/.test(normalized)) {
        return `已生成 ${normalized.replace('summaries_', '')} 条摘要`;
    }
    return raw || '未知';
}

/**
 * 功能：构建群聊分轨卡片 HTML。
 * @param groupMemory 群聊分轨状态。
 * @param enabled 是否开启群聊分轨。
 * @returns HTML 字符串。
 */
function buildGroupLaneCardsMarkup(groupMemory: GroupMemoryState | null, enabled: boolean): string {
        if (!enabled) {
                return '<span class="stx-memory-chat-strategy-empty">当前聊天未开启群聊分轨。</span>';
        }

        const lanes = Array.isArray(groupMemory?.lanes) ? groupMemory!.lanes : [];
        const salienceMap: Map<string, number> = new Map(
                (Array.isArray(groupMemory?.actorSalience) ? groupMemory!.actorSalience : []).map((item) => [item.actorKey, Number(item.score ?? 0)]),
        );
        const sortedLanes = [...lanes].sort((left, right): number => {
                const salienceDelta = Number(salienceMap.get(right.actorKey) ?? 0) - Number(salienceMap.get(left.actorKey) ?? 0);
                if (salienceDelta !== 0) {
                        return salienceDelta;
                }
                return Number(right.lastActiveAt ?? 0) - Number(left.lastActiveAt ?? 0);
        });
        const topLanes = sortedLanes.slice(0, 4);
        const sharedScene = groupMemory?.sharedScene;
        const sharedSceneParts = [
                String(sharedScene?.currentScene ?? '').trim(),
                String(sharedScene?.currentConflict ?? '').trim(),
        ].filter((part: string): boolean => Boolean(part));
        const groupConsensus = Array.isArray(sharedScene?.groupConsensus) ? sharedScene!.groupConsensus.filter(Boolean) : [];
        const pendingEvents = Array.isArray(sharedScene?.pendingEvents) ? sharedScene!.pendingEvents.filter(Boolean) : [];

        const sceneCardMarkup = `
            <article class="stx-memory-chat-strategy-group-scene-card">
                <div class="stx-memory-chat-strategy-group-scene-head">
                    <div>
                        <div class="stx-memory-chat-strategy-group-section-title">共享场景</div>
                        <div class="stx-memory-chat-strategy-group-scene-summary">${sharedSceneParts.length > 0 ? escapeHtml(sharedSceneParts.join(' / ')) : '暂无共享场景摘要'}</div>
                    </div>
                    <span class="stx-memory-chat-strategy-group-count">${lanes.length} 条车道</span>
                </div>
                <div class="stx-memory-chat-strategy-group-scene-body">
                    <div class="stx-memory-chat-strategy-group-subsection">
                        <span class="stx-memory-chat-strategy-group-subtitle">当前共识</span>
                        <div class="stx-memory-chat-strategy-pill-wrap">
                            ${groupConsensus.length > 0 ? groupConsensus.slice(0, 4).map((item: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(item)}</span>`).join('') : '<span class="stx-memory-chat-strategy-empty">暂无群体共识</span>'}
                        </div>
                    </div>
                    <div class="stx-memory-chat-strategy-group-subsection">
                        <span class="stx-memory-chat-strategy-group-subtitle">待处理事件</span>
                        <div class="stx-memory-chat-strategy-group-event-list">
                            ${pendingEvents.length > 0 ? pendingEvents.slice(0, 2).map((item: string, index: number): string => `
                                <div class="stx-memory-chat-strategy-group-event-item">
                                    <span class="stx-memory-chat-strategy-group-event-index">${index + 1}</span>
                                    <span class="stx-memory-chat-strategy-group-event-text">${escapeHtml(item)}</span>
                                </div>
                            `.trim()).join('') : '<span class="stx-memory-chat-strategy-empty">暂无待处理事件</span>'}
                        </div>
                    </div>
                </div>
            </article>
        `.trim();

        if (topLanes.length === 0) {
                return `${sceneCardMarkup}<span class="stx-memory-chat-strategy-empty">分轨已开启，但当前还没有形成稳定角色车道。</span>`;
        }

        const laneCardsMarkup = topLanes.map((lane, index): string => {
                const salience = Number(salienceMap.get(lane.actorKey) ?? 0);
                const metaPills = [
                lane.lastStyle ? `风格：${formatLaneStyleLabel(lane.lastStyle)}` : '',
                lane.lastEmotion ? `情绪：${formatLaneEmotionLabel(lane.lastEmotion)}` : '',
                lane.recentGoal ? `目标：${formatLaneGoalLabel(lane.recentGoal)}` : '',
                ].filter((item: string): boolean => Boolean(item));
                const footerBits = [
                        lane.relationshipDelta ? `关系：${lane.relationshipDelta}` : '',
                        Number.isFinite(Number(lane.recentMessageIds?.length ?? 0)) ? `近期消息 ${Number(lane.recentMessageIds?.length ?? 0)} 条` : '',
                ].filter((item: string): boolean => Boolean(item));
                return `
                    <article class="stx-memory-chat-strategy-group-lane-card">
                        <div class="stx-memory-chat-strategy-group-lane-head">
                            <div class="stx-memory-chat-strategy-group-lane-copy">
                                <strong class="stx-memory-chat-strategy-group-lane-name">#${index + 1} ${escapeHtml(lane.displayName || lane.actorKey || '未命名角色')}</strong>
                                <span class="stx-memory-chat-strategy-group-lane-time">最近活跃：${escapeHtml(formatTimestamp(Number(lane.lastActiveAt ?? 0)))}</span>
                            </div>
                            <span class="stx-memory-chat-strategy-pill stx-memory-chat-strategy-group-salience">显著度 ${(salience * 100).toFixed(0)}%</span>
                        </div>
                        <div class="stx-memory-chat-strategy-pill-wrap stx-memory-chat-strategy-group-lane-tags">
                            ${metaPills.length > 0 ? metaPills.map((item: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(item)}</span>`).join('') : '<span class="stx-memory-chat-strategy-empty">暂无风格 / 情绪 / 目标线索</span>'}
                        </div>
                        <div class="stx-memory-chat-strategy-group-lane-footer">
                            ${footerBits.length > 0 ? escapeHtml(footerBits.join(' · ')) : '暂无关系变化记录'}
                        </div>
                    </article>
                `.trim();
        }).join('');

        const hiddenLaneCount = Math.max(0, sortedLanes.length - topLanes.length);
        const hiddenLaneHint = hiddenLaneCount > 0
                ? `<div class="stx-memory-chat-strategy-group-footnote">还有 ${hiddenLaneCount} 条车道未展开，已优先展示最活跃的角色。</div>`
                : '';

        return `
            <div class="stx-memory-chat-strategy-group-memory">
                ${sceneCardMarkup}
                <div class="stx-memory-chat-strategy-group-lane-grid">
                    ${laneCardsMarkup}
                </div>
                ${hiddenLaneHint}
            </div>
        `.trim();
}

/**
 * 功能：格式化维护动作标签。
 * @param action 维护动作。
 * @returns 维护动作中文标签。
 */
function formatMaintenanceActionLabel(action: MaintenanceActionType): string {
    if (action === 'compress') {
        return '压缩维护';
    }
    if (action === 'rebuild_summary') {
        return '摘要重建';
    }
    if (action === 'memory_card_rebuild') {
        return '记忆卡重建';
    }
    if (action === 'schema_cleanup') {
        return '设定整理';
    }
    if (action === 'group_maintenance') {
        return '群聊维护';
    }
    return action;
}

/**
 * 功能：格式化维护动作完成后的提示文案。
 * @param action 维护动作类型。
 * @param result 执行结果。
 * @returns 面向用户的提示文本。
 */
function formatMaintenanceExecutionToast(action: MaintenanceActionType, result: MaintenanceExecutionResult): string {
    return `${formatMaintenanceActionLabel(action)}：${result.message}`;
}

/**
 * 功能：格式化聊天类型标签。
 * @param value 聊天类型值。
 * @returns 中文标签。
 */
function formatChatTypeLabel(value: string): string {
    if (value === 'group') {
        return '群聊';
    }
    if (value === 'worldbook') {
        return '世界书驱动';
    }
    if (value === 'tool') {
        return '工具型';
    }
    return '单人';
}

/**
 * 功能：格式化风格偏好标签。
 * @param value 风格值。
 * @returns 中文标签。
 */
function formatStyleLabel(value: string): string {
    if (value === 'qa') {
        return '问答型';
    }
    if (value === 'trpg') {
        return '跑团型';
    }
    if (value === 'info') {
        return '信息型';
    }
    return '剧情型';
}

/**
 * 功能：格式化记忆强度标签。
 * @param value 强度值。
 * @returns 中文标签。
 */
function formatMemoryStrengthLabel(value: string): string {
    if (value === 'low') {
        return '低强度';
    }
    if (value === 'high') {
        return '高强度';
    }
    return '中强度';
}

/**
 * 功能：格式化意图标签。
 * @param value 意图值。
 * @returns 中文标签。
 */
function formatIntentLabel(value: string): string {
    if (value === 'setting_qa') {
        return '设定问答';
    }
    if (value === 'story_continue') {
        return '剧情续写';
    }
    if (value === 'roleplay') {
        return '角色扮演';
    }
    if (value === 'tool_qa') {
        return '工具问答';
    }
    return '自动判断';
}

/**
 * 功能：格式化注入区段标签。
 * @param value 区段值。
 * @returns 中文标签。
 */
function formatSectionLabel(value: string): string {
    if (value === 'WORLD_STATE') {
        return '世界状态';
    }
    if (value === 'FACTS') {
        return '事实';
    }
    if (value === 'EVENTS') {
        return '事件';
    }
    if (value === 'SUMMARY') {
        return '摘要';
    }
    if (value === 'CHARACTER_FACTS') {
        return '角色事实';
    }
    if (value === 'RELATIONSHIPS') {
        return '关系';
    }
    if (value === 'LAST_SCENE') {
        return '最近场景';
    }
    if (value === 'SHORT_SUMMARY') {
        return '短摘要';
    }
    return value;
}

/**
 * 功能：转义 HTML 文本。
 * @param input 原始文本。
 * @returns 转义后的文本。
 */
function escapeHtml(input: string): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
