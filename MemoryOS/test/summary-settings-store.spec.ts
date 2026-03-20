import { describe, expect, it } from 'vitest';
import {
    normalizeSummarySettings,
    normalizeSummarySettingsOverride,
} from '../src/core/summary-settings-store';
import { getDefaultSummaryTriggerIds } from '../src/core/summary-trigger-registry';
import { DEFAULT_SUMMARY_SETTINGS } from '../src/types';

describe('summary-settings-store', (): void => {
    it('trigger 校验来自 registry，非法值会被过滤', (): void => {
        const normalized = normalizeSummarySettings({
            summaryBehavior: {
                ...DEFAULT_SUMMARY_SETTINGS.summaryBehavior,
                longSummaryTrigger: ['scene_end', 'world_change', 'not_exist' as any],
            },
        });
        expect(normalized.summaryBehavior.longSummaryTrigger).toEqual(['scene_end', 'world_change']);
    });

    it('空 trigger 配置会回落到 registry 默认项', (): void => {
        const normalized = normalizeSummarySettings({
            summaryBehavior: {
                ...DEFAULT_SUMMARY_SETTINGS.summaryBehavior,
                longSummaryTrigger: [],
            },
        });
        expect(normalized.summaryBehavior.longSummaryTrigger).toEqual(getDefaultSummaryTriggerIds());
    });

    it('autoSummary 默认值、覆盖与归一化生效', (): void => {
        const normalized = normalizeSummarySettings({
            autoSummary: {
                enabled: false,
                roleplayTurnThreshold: 0 as any,
                chatTurnThreshold: 500 as any,
                triggerRuleMinScore: 9 as any,
                semanticTriggerMinScore: -2 as any,
                promptPressureTokenRatio: 3 as any,
            },
        });
        expect(normalized.autoSummary.enabled).toBe(false);
        expect(normalized.autoSummary.roleplayTurnThreshold).toBe(1);
        expect(normalized.autoSummary.chatTurnThreshold).toBe(120);
        expect(normalized.autoSummary.triggerRuleMinScore).toBe(1.5);
        expect(normalized.autoSummary.semanticTriggerMinScore).toBe(0);
        expect(normalized.autoSummary.promptPressureTokenRatio).toBe(1.2);
    });

    it('override 允许写入 autoSummary 字段', (): void => {
        const override = normalizeSummarySettingsOverride({
            autoSummary: {
                enabled: false,
                roleplayTurnThreshold: 9,
                promptPressureTokenRatio: 0.8,
            },
        });
        expect(override.autoSummary?.enabled).toBe(false);
        expect(override.autoSummary?.roleplayTurnThreshold).toBe(9);
        expect(override.autoSummary?.promptPressureTokenRatio).toBe(0.8);
    });
});
