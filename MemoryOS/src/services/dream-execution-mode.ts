import { resolveMemoryStrategySettings, type MemoryOSSettings } from '../settings/store';
import type { DreamExecutionMode, DreamTriggerReason } from './dream-types';

export type DreamRunProfile = 'auto_light' | 'auto_review' | 'manual_deep';

export interface ResolvedDreamExecutionPlan {
    executionMode: DreamExecutionMode;
    runProfile: DreamRunProfile;
    triggerReason: DreamTriggerReason;
    allowNarrative: boolean;
    allowMutations: boolean;
    allowMaintenance: boolean;
    allowApprovalDialog: boolean;
    allowAutoApplyLowRiskMaintenance: boolean;
    allowHighRiskMutationOutput: boolean;
    requireApprovalBeforeMutationApply: boolean;
    maxHighlights: number;
    maxMutations: number;
    outputKind: 'full' | 'light';
}

export function resolveDreamExecutionPlan(input: {
    triggerReason: DreamTriggerReason;
    settings: MemoryOSSettings;
    executionMode?: DreamExecutionMode;
}): ResolvedDreamExecutionPlan {
    const settings = resolveMemoryStrategySettings(input.settings);
    const executionMode = input.executionMode ?? settings.dreamExecutionMode;
    if (input.triggerReason === 'manual') {
        return {
            executionMode,
            runProfile: 'manual_deep',
            triggerReason: input.triggerReason,
            allowNarrative: true,
            allowMutations: true,
            allowMaintenance: true,
            allowApprovalDialog: true,
            allowAutoApplyLowRiskMaintenance: false,
            allowHighRiskMutationOutput: true,
            requireApprovalBeforeMutationApply: true,
            maxHighlights: settings.dreamPromptMaxHighlights,
            maxMutations: settings.dreamPromptMaxMutations,
            outputKind: 'full',
        };
    }
    if (executionMode === 'silent') {
        return {
            executionMode,
            runProfile: 'auto_light',
            triggerReason: input.triggerReason,
            allowNarrative: true,
            allowMutations: false,
            allowMaintenance: true,
            allowApprovalDialog: false,
            allowAutoApplyLowRiskMaintenance: true,
            allowHighRiskMutationOutput: false,
            requireApprovalBeforeMutationApply: true,
            maxHighlights: Math.max(1, Math.min(2, settings.dreamPromptMaxHighlights)),
            maxMutations: 0,
            outputKind: 'light',
        };
    }
    return {
        executionMode: 'manual_review',
        runProfile: 'auto_review',
        triggerReason: input.triggerReason,
        allowNarrative: true,
        allowMutations: true,
        allowMaintenance: true,
        allowApprovalDialog: false,
        allowAutoApplyLowRiskMaintenance: false,
        allowHighRiskMutationOutput: true,
        requireApprovalBeforeMutationApply: true,
        maxHighlights: Math.max(1, Math.min(3, settings.dreamPromptMaxHighlights)),
        maxMutations: Math.max(1, Math.min(settings.dreamPromptMaxMutations, 5)),
        outputKind: 'full',
    };
}
