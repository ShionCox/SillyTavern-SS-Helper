import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMORY_OS_SETTINGS } from '../src/settings/store';
import { resolveDreamExecutionPlan } from '../src/services/dream-execution-mode';

describe('resolveDreamExecutionPlan', () => {
    it('manual + manual_review 会进入 manual_deep', () => {
        const plan = resolveDreamExecutionPlan({
            triggerReason: 'manual',
            settings: {
                ...DEFAULT_MEMORY_OS_SETTINGS,
                dreamExecutionMode: 'manual_review',
            },
        });
        expect(plan.runProfile).toBe('manual_deep');
        expect(plan.allowApprovalDialog).toBe(true);
        expect(plan.allowMutations).toBe(true);
    });

    it('manual + silent 仍会进入 manual_deep', () => {
        const plan = resolveDreamExecutionPlan({
            triggerReason: 'manual',
            settings: {
                ...DEFAULT_MEMORY_OS_SETTINGS,
                dreamExecutionMode: 'silent',
            },
        });
        expect(plan.runProfile).toBe('manual_deep');
        expect(plan.executionMode).toBe('silent');
        expect(plan.outputKind).toBe('full');
    });

    it('auto + manual_review 会进入 auto_review', () => {
        const plan = resolveDreamExecutionPlan({
            triggerReason: 'generation_ended',
            settings: {
                ...DEFAULT_MEMORY_OS_SETTINGS,
                dreamExecutionMode: 'manual_review',
            },
        });
        expect(plan.runProfile).toBe('auto_review');
        expect(plan.allowApprovalDialog).toBe(false);
        expect(plan.allowMutations).toBe(true);
        expect(plan.allowAutoApplyLowRiskMaintenance).toBe(false);
    });

    it('auto + silent 会进入 auto_light', () => {
        const plan = resolveDreamExecutionPlan({
            triggerReason: 'idle',
            settings: {
                ...DEFAULT_MEMORY_OS_SETTINGS,
                dreamExecutionMode: 'silent',
            },
        });
        expect(plan.runProfile).toBe('auto_light');
        expect(plan.outputKind).toBe('light');
        expect(plan.allowMutations).toBe(false);
        expect(plan.allowAutoApplyLowRiskMaintenance).toBe(true);
    });
});
