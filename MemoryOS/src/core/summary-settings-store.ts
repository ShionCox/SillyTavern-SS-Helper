import { readSdkPluginSettings, writeSdkPluginSettings } from '../../../SDK/settings';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type {
    AdaptiveMetrics,
    AutoSummaryTriggerSettings,
    ChatProfile,
    EffectiveSummarySettings,
    LongSummaryCooldownState,
    MemoryProcessingLevel,
    SummaryCooldownPreset,
    SummaryLength,
    SummaryLookbackScope,
    SummaryMemoryMode,
    SummaryNoiseFilter,
    SummaryProcessInterval,
    SummaryRecordFocus,
    SummaryResourcePriority,
    SummaryScenario,
    SummarySettings,
    SummarySettingsAdvanced,
    SummarySettingsContentPreference,
    SummarySettingsOverride,
    SummarySettingsSource,
    SummarySettingsSummaryBehavior,
    SummarySettingsWorkMode,
    SummaryTiming,
    SummaryLongTrigger,
} from '../types';
import {
    DEFAULT_CHAT_PROFILE,
    DEFAULT_SUMMARY_SETTINGS,
    DEFAULT_SUMMARY_SETTINGS_OVERRIDE,
} from '../types';
import {
    getDefaultSummaryTriggerIds,
    isSummaryTriggerId,
} from './summary-trigger-registry';

export interface SummaryRuntimeSettings {
    summaryEnabled: boolean;
    processingIntervalTurns: number;
    lookbackWindowTurns: number;
    shortSummaryBudget: number;
    longSummaryBudget: number;
    levelThresholdBias: Record<MemoryProcessingLevel, number>;
    noiseFilterStrength: number;
    recordFocusWeights: Record<SummaryRecordFocus, number>;
    longSummaryCooldownTurns: number;
    longSummaryCooldownMs: number;
    allowLightRelationExtraction: boolean;
    allowMediumWorldStateUpdate: boolean;
    allowHeavyRewriteSummaries: boolean;
    allowHeavyConsistencyRepair: boolean;
    allowHeavyExpandedLookback: boolean;
    summaryMode: 'short' | 'layered' | 'timeline';
}

const SUMMARY_SETTINGS_NAMESPACE = `${MEMORY_OS_PLUGIN_ID}.summary_settings`;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeEnum<T extends string>(value: unknown, fallback: T, values: readonly T[]): T {
    const candidate = normalizeText(value) as T;
    return values.includes(candidate) ? candidate : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
    if (!Array.isArray(value)) {
        return [...fallback];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of value) {
        const normalized = normalizeText(item);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 1 || value === '1' || value === 'true') {
        return true;
    }
    if (value === 0 || value === '0' || value === 'false') {
        return false;
    }
    return fallback;
}

function hasOverrideValues(value: unknown): boolean {
    if (!isObjectRecord(value)) {
        return false;
    }
    return Object.values(value).some((item: unknown): boolean => {
        if (Array.isArray(item)) {
            return item.length > 0;
        }
        if (isObjectRecord(item)) {
            return hasOverrideValues(item);
        }
        return item !== undefined && item !== null && String(item).trim() !== '';
    });
}

function normalizeWorkMode(input: unknown, fallback: SummarySettingsWorkMode = DEFAULT_SUMMARY_SETTINGS.workMode): SummarySettingsWorkMode {
    const record = isObjectRecord(input) ? input : {};
    return {
        memoryMode: normalizeEnum<SummaryMemoryMode>(record.memoryMode, fallback.memoryMode, ['streamlined', 'balanced', 'deep']),
        scenario: normalizeEnum<SummaryScenario>(record.scenario, fallback.scenario, ['auto', 'companion_chat', 'long_rp', 'worldbook_qa', 'group_trpg', 'tool_qa', 'custom']),
        resourcePriority: normalizeEnum<SummaryResourcePriority>(record.resourcePriority, fallback.resourcePriority, ['quality', 'balanced', 'saving']),
    };
}

function normalizeSummaryBehavior(input: unknown, fallback: SummarySettingsSummaryBehavior = DEFAULT_SUMMARY_SETTINGS.summaryBehavior): SummarySettingsSummaryBehavior {
    const record = isObjectRecord(input) ? input : {};
    const normalizedTriggers = normalizeStringArray(record.longSummaryTrigger, fallback.longSummaryTrigger)
        .filter((item: string): item is SummaryLongTrigger => isSummaryTriggerId(item));
    return {
        summaryTiming: normalizeEnum<SummaryTiming>(record.summaryTiming, fallback.summaryTiming, ['key_only', 'stage_end', 'frequent']),
        summaryLength: normalizeEnum<SummaryLength>(record.summaryLength, fallback.summaryLength, ['short', 'standard', 'detailed', 'ultra']),
        longSummaryCooldown: normalizeEnum<SummaryCooldownPreset>(record.longSummaryCooldown, fallback.longSummaryCooldown, ['short', 'standard', 'long']),
        longSummaryTrigger: normalizedTriggers.length > 0 ? normalizedTriggers : getDefaultSummaryTriggerIds(),
    };
}

/**
 * 功能：归一化自动长总结触发设置。
 * 参数：
 *   input：待归一化输入。
 *   fallback：回退设置。
 * 返回：
 *   AutoSummaryTriggerSettings：归一化后的自动长总结触发设置。
 */
function normalizeAutoSummary(input: unknown, fallback: AutoSummaryTriggerSettings = DEFAULT_SUMMARY_SETTINGS.autoSummary): AutoSummaryTriggerSettings {
    const record = isObjectRecord(input) ? input : {};
    const clampCount = (value: unknown, fallbackValue: number, min: number, max: number): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallbackValue;
        }
        return Math.max(min, Math.min(max, Math.round(numeric)));
    };
    const clampRatio = (value: unknown, fallbackValue: number, min: number, max: number): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallbackValue;
        }
        return Number(Math.max(min, Math.min(max, numeric)).toFixed(3));
    };
    return {
        enabled: normalizeBoolean(record.enabled, fallback.enabled),
        manualTurnThresholdEnabled: normalizeBoolean(record.manualTurnThresholdEnabled, fallback.manualTurnThresholdEnabled),
        manualTurnThreshold: clampCount(record.manualTurnThreshold, fallback.manualTurnThreshold, 1, 120),
        roleplayTurnThreshold: clampCount(record.roleplayTurnThreshold, fallback.roleplayTurnThreshold, 1, 120),
        chatTurnThreshold: clampCount(record.chatTurnThreshold, fallback.chatTurnThreshold, 1, 120),
        storyTurnThreshold: clampCount(record.storyTurnThreshold, fallback.storyTurnThreshold, 1, 120),
        mixedTurnThreshold: clampCount(record.mixedTurnThreshold, fallback.mixedTurnThreshold, 1, 120),
        minTurnsAfterLastSummary: clampCount(record.minTurnsAfterLastSummary, fallback.minTurnsAfterLastSummary, 0, 80),
        coolDownTurns: clampCount(record.coolDownTurns, fallback.coolDownTurns, 0, 80),
        enableTriggerRules: normalizeBoolean(record.enableTriggerRules, fallback.enableTriggerRules),
        enableSemanticChangeTrigger: normalizeBoolean(record.enableSemanticChangeTrigger, fallback.enableSemanticChangeTrigger),
        enablePromptPressureTrigger: normalizeBoolean(record.enablePromptPressureTrigger, fallback.enablePromptPressureTrigger),
        triggerRuleMinScore: clampRatio(record.triggerRuleMinScore, fallback.triggerRuleMinScore, 0, 1.5),
        semanticTriggerMinScore: clampRatio(record.semanticTriggerMinScore, fallback.semanticTriggerMinScore, 0, 1.5),
        promptPressureTokenRatio: clampRatio(record.promptPressureTokenRatio, fallback.promptPressureTokenRatio, 0, 1.2),
    };
}

function normalizeContentPreference(input: unknown, fallback: SummarySettingsContentPreference = DEFAULT_SUMMARY_SETTINGS.contentPreference): SummarySettingsContentPreference {
    const record = isObjectRecord(input) ? input : {};
    const recordFocus = normalizeStringArray(record.recordFocus, fallback.recordFocus).filter(
        (item: string): item is SummaryRecordFocus => ['facts', 'relationship', 'world', 'plot', 'emotion', 'tool_result'].includes(item as SummaryRecordFocus),
    );
    return {
        recordFocus,
        lowValueHandling: normalizeEnum<SummarySettingsContentPreference['lowValueHandling']>(
            record.lowValueHandling,
            fallback.lowValueHandling,
            ['ignore', 'keep_some', 'keep_more'],
        ),
        noiseFilter: normalizeEnum<SummaryNoiseFilter>(record.noiseFilter, fallback.noiseFilter, ['low', 'medium', 'high']),
    };
}

function normalizeAdvanced(input: unknown, fallback: SummarySettingsAdvanced = DEFAULT_SUMMARY_SETTINGS.advanced): SummarySettingsAdvanced {
    const record = isObjectRecord(input) ? input : {};
    return {
        processInterval: normalizeEnum<SummaryProcessInterval>(record.processInterval, fallback.processInterval, ['small', 'medium', 'large']),
        lookbackScope: normalizeEnum<SummaryLookbackScope>(record.lookbackScope, fallback.lookbackScope, ['small', 'medium', 'large']),
        allowLightRelationExtraction: normalizeBoolean(record.allowLightRelationExtraction, fallback.allowLightRelationExtraction),
        allowMediumWorldStateUpdate: normalizeBoolean(record.allowMediumWorldStateUpdate, fallback.allowMediumWorldStateUpdate),
        allowHeavyRewriteSummaries: normalizeBoolean(record.allowHeavyRewriteSummaries, fallback.allowHeavyRewriteSummaries),
        allowHeavyConsistencyRepair: normalizeBoolean(record.allowHeavyConsistencyRepair, fallback.allowHeavyConsistencyRepair),
        allowHeavyExpandedLookback: normalizeBoolean(record.allowHeavyExpandedLookback, fallback.allowHeavyExpandedLookback),
    };
}

function normalizeSummarySettingsPatch(input?: Partial<SummarySettings> | null): Partial<SummarySettings> {
    if (!input || typeof input !== 'object') {
        return {};
    }
    const patch: Partial<SummarySettings> = {};
    if (input.workMode) {
        patch.workMode = normalizeWorkMode(input.workMode, DEFAULT_SUMMARY_SETTINGS.workMode);
    }
    if (input.summaryBehavior) {
        patch.summaryBehavior = normalizeSummaryBehavior(input.summaryBehavior, DEFAULT_SUMMARY_SETTINGS.summaryBehavior);
    }
    if (input.contentPreference) {
        patch.contentPreference = normalizeContentPreference(input.contentPreference, DEFAULT_SUMMARY_SETTINGS.contentPreference);
    }
    if (input.advanced) {
        patch.advanced = normalizeAdvanced(input.advanced, DEFAULT_SUMMARY_SETTINGS.advanced);
    }
    if (input.autoSummary) {
        patch.autoSummary = normalizeAutoSummary(input.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
    }
    return patch;
}

export function normalizeSummarySettings(input?: Partial<SummarySettings> | null): SummarySettings {
    return {
        workMode: normalizeWorkMode(input?.workMode),
        summaryBehavior: normalizeSummaryBehavior(input?.summaryBehavior),
        contentPreference: normalizeContentPreference(input?.contentPreference),
        advanced: normalizeAdvanced(input?.advanced),
        autoSummary: normalizeAutoSummary(input?.autoSummary),
    };
}

export function normalizeSummarySettingsOverride(input?: Partial<SummarySettingsOverride> | null): SummarySettingsOverride {
    const record = isObjectRecord(input) ? input : {};
    const override: SummarySettingsOverride = {};
    if (isObjectRecord(record.workMode) && Object.keys(record.workMode).length > 0) {
        override.workMode = {};
        if (Object.prototype.hasOwnProperty.call(record.workMode, 'memoryMode')) {
            override.workMode.memoryMode = normalizeEnum<SummaryMemoryMode>(record.workMode.memoryMode, DEFAULT_SUMMARY_SETTINGS.workMode.memoryMode, ['streamlined', 'balanced', 'deep']);
        }
        if (Object.prototype.hasOwnProperty.call(record.workMode, 'scenario')) {
            override.workMode.scenario = normalizeEnum<SummaryScenario>(record.workMode.scenario, DEFAULT_SUMMARY_SETTINGS.workMode.scenario, ['auto', 'companion_chat', 'long_rp', 'worldbook_qa', 'group_trpg', 'tool_qa', 'custom']);
        }
        if (Object.prototype.hasOwnProperty.call(record.workMode, 'resourcePriority')) {
            override.workMode.resourcePriority = normalizeEnum<SummaryResourcePriority>(record.workMode.resourcePriority, DEFAULT_SUMMARY_SETTINGS.workMode.resourcePriority, ['quality', 'balanced', 'saving']);
        }
    }
    if (isObjectRecord(record.summaryBehavior) && Object.keys(record.summaryBehavior).length > 0) {
        override.summaryBehavior = {};
        if (Object.prototype.hasOwnProperty.call(record.summaryBehavior, 'summaryTiming')) {
            override.summaryBehavior.summaryTiming = normalizeEnum<SummaryTiming>(record.summaryBehavior.summaryTiming, DEFAULT_SUMMARY_SETTINGS.summaryBehavior.summaryTiming, ['key_only', 'stage_end', 'frequent']);
        }
        if (Object.prototype.hasOwnProperty.call(record.summaryBehavior, 'summaryLength')) {
            override.summaryBehavior.summaryLength = normalizeEnum<SummaryLength>(record.summaryBehavior.summaryLength, DEFAULT_SUMMARY_SETTINGS.summaryBehavior.summaryLength, ['short', 'standard', 'detailed', 'ultra']);
        }
        if (Object.prototype.hasOwnProperty.call(record.summaryBehavior, 'longSummaryCooldown')) {
            override.summaryBehavior.longSummaryCooldown = normalizeEnum<SummaryCooldownPreset>(record.summaryBehavior.longSummaryCooldown, DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryCooldown, ['short', 'standard', 'long']);
        }
        if (Object.prototype.hasOwnProperty.call(record.summaryBehavior, 'longSummaryTrigger')) {
            const normalizedTriggers = normalizeStringArray(record.summaryBehavior.longSummaryTrigger, DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryTrigger).filter(
                (item: string): item is SummaryLongTrigger => isSummaryTriggerId(item),
            );
            override.summaryBehavior.longSummaryTrigger = normalizedTriggers.length > 0 ? normalizedTriggers : getDefaultSummaryTriggerIds();
        }
    }
    if (isObjectRecord(record.contentPreference) && Object.keys(record.contentPreference).length > 0) {
        override.contentPreference = {};
        if (Object.prototype.hasOwnProperty.call(record.contentPreference, 'recordFocus')) {
            override.contentPreference.recordFocus = normalizeStringArray(record.contentPreference.recordFocus, DEFAULT_SUMMARY_SETTINGS.contentPreference.recordFocus).filter(
                (item: string): item is SummaryRecordFocus => ['facts', 'relationship', 'world', 'plot', 'emotion', 'tool_result'].includes(item as SummaryRecordFocus),
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.contentPreference, 'lowValueHandling')) {
            override.contentPreference.lowValueHandling = normalizeEnum<SummarySettingsContentPreference['lowValueHandling']>(
                record.contentPreference.lowValueHandling,
                DEFAULT_SUMMARY_SETTINGS.contentPreference.lowValueHandling,
                ['ignore', 'keep_some', 'keep_more'],
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.contentPreference, 'noiseFilter')) {
            override.contentPreference.noiseFilter = normalizeEnum<SummaryNoiseFilter>(record.contentPreference.noiseFilter, DEFAULT_SUMMARY_SETTINGS.contentPreference.noiseFilter, ['low', 'medium', 'high']);
        }
    }
    if (isObjectRecord(record.advanced) && Object.keys(record.advanced).length > 0) {
        override.advanced = {};
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'processInterval')) {
            override.advanced.processInterval = normalizeEnum<SummaryProcessInterval>(record.advanced.processInterval, DEFAULT_SUMMARY_SETTINGS.advanced.processInterval, ['small', 'medium', 'large']);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'lookbackScope')) {
            override.advanced.lookbackScope = normalizeEnum<SummaryLookbackScope>(record.advanced.lookbackScope, DEFAULT_SUMMARY_SETTINGS.advanced.lookbackScope, ['small', 'medium', 'large']);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'allowLightRelationExtraction')) {
            override.advanced.allowLightRelationExtraction = normalizeBoolean(record.advanced.allowLightRelationExtraction, DEFAULT_SUMMARY_SETTINGS.advanced.allowLightRelationExtraction);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'allowMediumWorldStateUpdate')) {
            override.advanced.allowMediumWorldStateUpdate = normalizeBoolean(record.advanced.allowMediumWorldStateUpdate, DEFAULT_SUMMARY_SETTINGS.advanced.allowMediumWorldStateUpdate);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'allowHeavyRewriteSummaries')) {
            override.advanced.allowHeavyRewriteSummaries = normalizeBoolean(record.advanced.allowHeavyRewriteSummaries, DEFAULT_SUMMARY_SETTINGS.advanced.allowHeavyRewriteSummaries);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'allowHeavyConsistencyRepair')) {
            override.advanced.allowHeavyConsistencyRepair = normalizeBoolean(record.advanced.allowHeavyConsistencyRepair, DEFAULT_SUMMARY_SETTINGS.advanced.allowHeavyConsistencyRepair);
        }
        if (Object.prototype.hasOwnProperty.call(record.advanced, 'allowHeavyExpandedLookback')) {
            override.advanced.allowHeavyExpandedLookback = normalizeBoolean(record.advanced.allowHeavyExpandedLookback, DEFAULT_SUMMARY_SETTINGS.advanced.allowHeavyExpandedLookback);
        }
    }
    if (isObjectRecord(record.autoSummary) && Object.keys(record.autoSummary).length > 0) {
        override.autoSummary = {};
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'enabled')) {
            override.autoSummary.enabled = normalizeBoolean(record.autoSummary.enabled, DEFAULT_SUMMARY_SETTINGS.autoSummary.enabled);
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'manualTurnThresholdEnabled')) {
            override.autoSummary.manualTurnThresholdEnabled = normalizeBoolean(
                record.autoSummary.manualTurnThresholdEnabled,
                DEFAULT_SUMMARY_SETTINGS.autoSummary.manualTurnThresholdEnabled,
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'manualTurnThreshold')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.manualTurnThreshold = normalizedAutoSummary.manualTurnThreshold;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'roleplayTurnThreshold')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.roleplayTurnThreshold = normalizedAutoSummary.roleplayTurnThreshold;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'chatTurnThreshold')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.chatTurnThreshold = normalizedAutoSummary.chatTurnThreshold;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'storyTurnThreshold')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.storyTurnThreshold = normalizedAutoSummary.storyTurnThreshold;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'mixedTurnThreshold')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.mixedTurnThreshold = normalizedAutoSummary.mixedTurnThreshold;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'minTurnsAfterLastSummary')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.minTurnsAfterLastSummary = normalizedAutoSummary.minTurnsAfterLastSummary;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'coolDownTurns')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.coolDownTurns = normalizedAutoSummary.coolDownTurns;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'enableTriggerRules')) {
            override.autoSummary.enableTriggerRules = normalizeBoolean(
                record.autoSummary.enableTriggerRules,
                DEFAULT_SUMMARY_SETTINGS.autoSummary.enableTriggerRules,
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'enableSemanticChangeTrigger')) {
            override.autoSummary.enableSemanticChangeTrigger = normalizeBoolean(
                record.autoSummary.enableSemanticChangeTrigger,
                DEFAULT_SUMMARY_SETTINGS.autoSummary.enableSemanticChangeTrigger,
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'enablePromptPressureTrigger')) {
            override.autoSummary.enablePromptPressureTrigger = normalizeBoolean(
                record.autoSummary.enablePromptPressureTrigger,
                DEFAULT_SUMMARY_SETTINGS.autoSummary.enablePromptPressureTrigger,
            );
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'triggerRuleMinScore')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.triggerRuleMinScore = normalizedAutoSummary.triggerRuleMinScore;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'semanticTriggerMinScore')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.semanticTriggerMinScore = normalizedAutoSummary.semanticTriggerMinScore;
        }
        if (Object.prototype.hasOwnProperty.call(record.autoSummary, 'promptPressureTokenRatio')) {
            const normalizedAutoSummary = normalizeAutoSummary(record.autoSummary, DEFAULT_SUMMARY_SETTINGS.autoSummary);
            override.autoSummary.promptPressureTokenRatio = normalizedAutoSummary.promptPressureTokenRatio;
        }
        if (Object.keys(override.autoSummary).length === 0) {
            delete override.autoSummary;
        }
    }
    return override;
}

function mergeSummarySettings(base: SummarySettings, patch?: Partial<SummarySettings> | null): SummarySettings {
    const normalizedPatch = normalizeSummarySettingsPatch(patch ?? {});
    return {
        workMode: normalizedPatch.workMode ? { ...base.workMode, ...normalizedPatch.workMode } : { ...base.workMode },
        summaryBehavior: {
            ...base.summaryBehavior,
            ...(normalizedPatch.summaryBehavior ?? {}),
            longSummaryTrigger: normalizedPatch.summaryBehavior?.longSummaryTrigger?.length
                ? normalizedPatch.summaryBehavior.longSummaryTrigger
                : [...base.summaryBehavior.longSummaryTrigger],
        },
        contentPreference: {
            ...base.contentPreference,
            ...(normalizedPatch.contentPreference ?? {}),
            recordFocus: normalizedPatch.contentPreference?.recordFocus?.length
                ? normalizedPatch.contentPreference.recordFocus
                : [...base.contentPreference.recordFocus],
        },
        advanced: normalizedPatch.advanced ? { ...base.advanced, ...normalizedPatch.advanced } : { ...base.advanced },
        autoSummary: normalizedPatch.autoSummary ? { ...base.autoSummary, ...normalizedPatch.autoSummary } : { ...base.autoSummary },
    };
}

function applySummarySettingsOverride(base: SummarySettings, override?: SummarySettingsOverride | null): SummarySettings {
    const normalized = normalizeSummarySettingsOverride(override ?? {});
    return {
        workMode: normalized.workMode ? { ...base.workMode, ...normalized.workMode } : base.workMode,
        summaryBehavior: normalized.summaryBehavior
            ? {
                ...base.summaryBehavior,
                ...normalized.summaryBehavior,
                longSummaryTrigger: normalized.summaryBehavior.longSummaryTrigger?.length
                    ? [...normalized.summaryBehavior.longSummaryTrigger]
                    : [...base.summaryBehavior.longSummaryTrigger],
            }
            : base.summaryBehavior,
        contentPreference: normalized.contentPreference
            ? {
                ...base.contentPreference,
                ...normalized.contentPreference,
                recordFocus: normalized.contentPreference.recordFocus?.length
                    ? [...normalized.contentPreference.recordFocus]
                    : [...base.contentPreference.recordFocus],
            }
            : base.contentPreference,
        advanced: normalized.advanced ? { ...base.advanced, ...normalized.advanced } : base.advanced,
        autoSummary: normalized.autoSummary ? { ...base.autoSummary, ...normalized.autoSummary } : base.autoSummary,
    };
}

function buildMemoryModePreset(memoryMode: SummaryMemoryMode): Partial<SummarySettings> {
    if (memoryMode === 'streamlined') {
        return {
            workMode: {
                memoryMode: 'streamlined',
                scenario: 'auto',
                resourcePriority: 'saving',
            },
            summaryBehavior: {
                summaryTiming: 'key_only',
                summaryLength: 'short',
                longSummaryCooldown: 'short',
                longSummaryTrigger: [...DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryTrigger],
            },
            contentPreference: {
                recordFocus: [...DEFAULT_SUMMARY_SETTINGS.contentPreference.recordFocus],
                lowValueHandling: 'keep_some',
                noiseFilter: 'high',
            },
            advanced: {
                processInterval: 'small',
                lookbackScope: 'small',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: false,
                allowHeavyRewriteSummaries: false,
                allowHeavyConsistencyRepair: false,
                allowHeavyExpandedLookback: false,
            },
        };
    }
    if (memoryMode === 'deep') {
        return {
            workMode: {
                memoryMode: 'deep',
                scenario: 'auto',
                resourcePriority: 'quality',
            },
            summaryBehavior: {
                summaryTiming: 'frequent',
                summaryLength: 'detailed',
                longSummaryCooldown: 'long',
                longSummaryTrigger: [...DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryTrigger],
            },
            contentPreference: {
                recordFocus: [...DEFAULT_SUMMARY_SETTINGS.contentPreference.recordFocus],
                lowValueHandling: 'keep_more',
                noiseFilter: 'low',
            },
            advanced: {
                processInterval: 'large',
                lookbackScope: 'large',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: true,
                allowHeavyRewriteSummaries: true,
                allowHeavyConsistencyRepair: true,
                allowHeavyExpandedLookback: true,
            },
        };
    }
    return {
        workMode: {
            memoryMode: 'balanced',
            scenario: 'auto',
            resourcePriority: 'balanced',
        },
        summaryBehavior: {
            summaryTiming: 'stage_end',
            summaryLength: 'standard',
            longSummaryCooldown: 'standard',
            longSummaryTrigger: [...DEFAULT_SUMMARY_SETTINGS.summaryBehavior.longSummaryTrigger],
        },
        contentPreference: {
            recordFocus: [...DEFAULT_SUMMARY_SETTINGS.contentPreference.recordFocus],
            lowValueHandling: 'ignore',
            noiseFilter: 'medium',
        },
        advanced: {
            processInterval: 'medium',
            lookbackScope: 'medium',
            allowLightRelationExtraction: true,
            allowMediumWorldStateUpdate: true,
            allowHeavyRewriteSummaries: true,
            allowHeavyConsistencyRepair: true,
            allowHeavyExpandedLookback: true,
        },
    };
}

function inferSummaryScenarioFromChatProfile(profile: ChatProfile): Exclude<SummaryScenario, 'auto'> | 'custom' {
    const chatType = String(profile.chatType ?? '').trim();
    const style = String(profile.stylePreference ?? '').trim();
    if (chatType === 'group') {
        return 'group_trpg';
    }
    if (chatType === 'worldbook') {
        return 'worldbook_qa';
    }
    if (chatType === 'tool') {
        return 'tool_qa';
    }
    if (style === 'trpg') {
        return 'long_rp';
    }
    if (style === 'qa') {
        return 'companion_chat';
    }
    if (style === 'info') {
        return 'worldbook_qa';
    }
    return 'companion_chat';
}

function buildScenarioPreset(scenario: Exclude<SummaryScenario, 'auto'> | 'custom'): Partial<SummarySettings> {
    if (scenario === 'tool_qa') {
        return {
            summaryBehavior: {
                summaryTiming: 'key_only',
                summaryLength: 'short',
                longSummaryCooldown: 'short',
                longSummaryTrigger: ['scene_end', 'archive_finalize'],
            },
            contentPreference: {
                recordFocus: ['facts', 'tool_result'],
                lowValueHandling: 'ignore',
                noiseFilter: 'high',
            },
            advanced: {
                processInterval: 'small',
                lookbackScope: 'small',
                allowLightRelationExtraction: false,
                allowMediumWorldStateUpdate: false,
                allowHeavyRewriteSummaries: false,
                allowHeavyConsistencyRepair: false,
                allowHeavyExpandedLookback: false,
            },
        };
    }
    if (scenario === 'worldbook_qa') {
        return {
            summaryBehavior: {
                summaryTiming: 'key_only',
                summaryLength: 'short',
                longSummaryCooldown: 'standard',
                longSummaryTrigger: ['scene_end', 'plot_advance', 'archive_finalize'],
            },
            contentPreference: {
                recordFocus: ['facts', 'world'],
                lowValueHandling: 'ignore',
                noiseFilter: 'high',
            },
            advanced: {
                processInterval: 'small',
                lookbackScope: 'medium',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: true,
                allowHeavyRewriteSummaries: false,
                allowHeavyConsistencyRepair: false,
                allowHeavyExpandedLookback: false,
            },
        };
    }
    if (scenario === 'group_trpg') {
        return {
            summaryBehavior: {
                summaryTiming: 'stage_end',
                summaryLength: 'detailed',
                longSummaryCooldown: 'long',
                longSummaryTrigger: ['scene_end', 'combat_end', 'relationship_shift', 'world_change', 'structure_repair', 'archive_finalize'],
            },
            contentPreference: {
                recordFocus: ['facts', 'relationship', 'world', 'plot'],
                lowValueHandling: 'keep_more',
                noiseFilter: 'low',
            },
            advanced: {
                processInterval: 'large',
                lookbackScope: 'large',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: true,
                allowHeavyRewriteSummaries: true,
                allowHeavyConsistencyRepair: true,
                allowHeavyExpandedLookback: true,
            },
        };
    }
    if (scenario === 'long_rp') {
        return {
            summaryBehavior: {
                summaryTiming: 'stage_end',
                summaryLength: 'detailed',
                longSummaryCooldown: 'standard',
                longSummaryTrigger: ['scene_end', 'plot_advance', 'relationship_shift', 'world_change', 'archive_finalize'],
            },
            contentPreference: {
                recordFocus: ['facts', 'relationship', 'world', 'plot'],
                lowValueHandling: 'keep_some',
                noiseFilter: 'medium',
            },
            advanced: {
                processInterval: 'medium',
                lookbackScope: 'large',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: true,
                allowHeavyRewriteSummaries: true,
                allowHeavyConsistencyRepair: true,
                allowHeavyExpandedLookback: true,
            },
        };
    }
    if (scenario === 'companion_chat') {
        return {
            summaryBehavior: {
                summaryTiming: 'stage_end',
                summaryLength: 'standard',
                longSummaryCooldown: 'standard',
                longSummaryTrigger: ['relationship_shift', 'scene_end', 'archive_finalize'],
            },
            contentPreference: {
                recordFocus: ['facts', 'relationship', 'emotion'],
                lowValueHandling: 'keep_some',
                noiseFilter: 'medium',
            },
            advanced: {
                processInterval: 'medium',
                lookbackScope: 'medium',
                allowLightRelationExtraction: true,
                allowMediumWorldStateUpdate: true,
                allowHeavyRewriteSummaries: false,
                allowHeavyConsistencyRepair: true,
                allowHeavyExpandedLookback: false,
            },
        };
    }
    return {};
}

export function readGlobalSummarySettings(): SummarySettings {
    const raw = readSdkPluginSettings(SUMMARY_SETTINGS_NAMESPACE);
    return normalizeSummarySettings(raw as Partial<SummarySettings>);
}

export function writeGlobalSummarySettings(settings: SummarySettings): SummarySettings {
    const normalized = normalizeSummarySettings(settings);
    writeSdkPluginSettings(SUMMARY_SETTINGS_NAMESPACE, normalized as unknown as Record<string, unknown>);
    return normalized;
}

export function resolveEffectiveSummarySettings(input: {
    chatProfile?: ChatProfile | null;
    globalSettings?: SummarySettings | null;
    chatOverride?: SummarySettingsOverride | null;
}): EffectiveSummarySettings {
    const profile = input.chatProfile ?? DEFAULT_CHAT_PROFILE;
    const globalSettings = normalizeSummarySettings(input.globalSettings ?? readGlobalSummarySettings());
    const memoryModePreset = buildMemoryModePreset(globalSettings.workMode.memoryMode);
    const scenarioChoice = globalSettings.workMode.scenario === 'auto'
        ? inferSummaryScenarioFromChatProfile(profile)
        : globalSettings.workMode.scenario;
    const scenarioPreset = buildScenarioPreset(scenarioChoice);
    const base = mergeSummarySettings(DEFAULT_SUMMARY_SETTINGS, memoryModePreset);
    const scenarioApplied = mergeSummarySettings(base, scenarioPreset);
    const globalApplied = mergeSummarySettings(scenarioApplied, globalSettings);
    const effective = applySummarySettingsOverride(globalApplied, input.chatOverride ?? DEFAULT_SUMMARY_SETTINGS_OVERRIDE);
    const source: SummarySettingsSource = hasOverrideValues(input.chatOverride)
        ? 'chat_override'
        : hasOverrideValues(input.globalSettings)
            ? 'global_setting'
            : scenarioChoice !== 'companion_chat'
                ? 'scenario_preset'
                : globalSettings.workMode.memoryMode !== DEFAULT_SUMMARY_SETTINGS.workMode.memoryMode
                    ? 'memory_mode_preset'
                    : 'system_default';
    return {
        ...effective,
        source,
        resolvedScenario: scenarioChoice,
        resolvedChatType: profile.chatType,
    };
}

export function resolveSummaryRuntimeSettings(
    settings: EffectiveSummarySettings,
    metrics?: AdaptiveMetrics | null,
    cooldown?: LongSummaryCooldownState | null,
): SummaryRuntimeSettings {
    const lengthBudgetMap: Record<SummaryLength, { short: number; long: number }> = {
        short: { short: 1800, long: 4800 },
        standard: { short: 2400, long: 8000 },
        detailed: { short: 3200, long: 11000 },
        ultra: { short: 4200, long: 14000 },
    };
    const intervalMap: Record<SummaryProcessInterval, number> = {
        small: 6,
        medium: 12,
        large: 18,
    };
    const lookbackMap: Record<SummaryLookbackScope, number> = {
        small: 24,
        medium: 40,
        large: 72,
    };
    const cooldownMap: Record<SummaryCooldownPreset, { turns: number; ms: number }> = {
        short: { turns: 6, ms: 6 * 60 * 60 * 1000 },
        standard: { turns: 12, ms: 12 * 60 * 60 * 1000 },
        long: { turns: 20, ms: 24 * 60 * 60 * 1000 },
    };
    const focusWeights: Record<SummaryRecordFocus, number> = {
        facts: 1,
        relationship: 1,
        world: 1,
        plot: 1,
        emotion: 1,
        tool_result: 1,
    };
    for (const focus of settings.contentPreference.recordFocus) {
        focusWeights[focus] = 1.12;
    }
    if (settings.contentPreference.recordFocus.length >= 2) {
        for (const focus of settings.contentPreference.recordFocus) {
            focusWeights[focus] = Number((focusWeights[focus] + 0.08).toFixed(3));
        }
    }
    if (settings.workMode.scenario === 'tool_qa' && settings.contentPreference.recordFocus.includes('tool_result')) {
        focusWeights.tool_result = Number((focusWeights.tool_result + 0.08).toFixed(3));
    }
    const priorityBias = settings.workMode.resourcePriority === 'quality'
        ? 0.12
        : settings.workMode.resourcePriority === 'saving'
            ? -0.08
            : 0;
    const timingBias = settings.summaryBehavior.summaryTiming === 'key_only'
        ? 0.12
        : settings.summaryBehavior.summaryTiming === 'frequent'
            ? -0.08
            : 0;
    const summaryMode = settings.summaryBehavior.summaryLength === 'short'
        ? 'short'
        : settings.summaryBehavior.summaryLength === 'standard'
            ? 'layered'
            : 'timeline';
    const noiseFilterStrength = settings.contentPreference.noiseFilter === 'low'
        ? 0.35
        : settings.contentPreference.noiseFilter === 'high'
            ? 0.85
            : 0.6;
    const summaryEnabled = !(
        settings.workMode.scenario === 'tool_qa'
        && settings.workMode.resourcePriority === 'saving'
        && settings.summaryBehavior.summaryTiming === 'key_only'
    );
    const cooldownPreset = cooldownMap[settings.summaryBehavior.longSummaryCooldown];
    const metricsFactor = Math.max(0, Math.min(1, Number(metrics?.avgMessageLength ?? 0) / 200));
    return {
        summaryEnabled,
        processingIntervalTurns: intervalMap[settings.advanced.processInterval],
        lookbackWindowTurns: lookbackMap[settings.advanced.lookbackScope],
        shortSummaryBudget: lengthBudgetMap[settings.summaryBehavior.summaryLength].short,
        longSummaryBudget: lengthBudgetMap[settings.summaryBehavior.summaryLength].long,
        levelThresholdBias: {
            none: 0,
            light: Number((0.08 + timingBias + metricsFactor * 0.04 + priorityBias).toFixed(3)),
            medium: Number((0.18 + timingBias + metricsFactor * 0.06 + priorityBias).toFixed(3)),
            heavy: Number((0.34 + timingBias + metricsFactor * 0.08 + priorityBias).toFixed(3)),
        },
        noiseFilterStrength,
        recordFocusWeights: focusWeights,
        longSummaryCooldownTurns: cooldownPreset.turns,
        longSummaryCooldownMs: cooldownPreset.ms,
        allowLightRelationExtraction: settings.advanced.allowLightRelationExtraction,
        allowMediumWorldStateUpdate: settings.advanced.allowMediumWorldStateUpdate,
        allowHeavyRewriteSummaries: settings.advanced.allowHeavyRewriteSummaries,
        allowHeavyConsistencyRepair: settings.advanced.allowHeavyConsistencyRepair,
        allowHeavyExpandedLookback: settings.advanced.allowHeavyExpandedLookback,
        summaryMode,
    };
}
