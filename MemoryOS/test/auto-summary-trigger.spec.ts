import { describe, expect, it } from 'vitest';
import {
    buildSemanticChangeSummary,
    resolveAutoSummaryMode,
    shouldRunAutoSummary,
} from '../src/core/auto-summary-trigger';
import { getDefaultSummaryTriggerIds } from '../src/core/summary-trigger-registry';
import type { SemanticChangeSummary } from '../src/core/auto-summary-trigger';
import { DEFAULT_SUMMARY_SETTINGS } from '../src/types';

function buildEmptySemantic(): SemanticChangeSummary {
    return {
        score: 0,
        hasImportantEvent: false,
        hasUserCorrection: false,
        hasWorldStateShift: false,
        hasRelationshipShift: false,
        hasLocationShift: false,
        hasTimeShift: false,
        reasonCodes: [],
    };
}

describe('auto-summary-trigger', (): void => {
    it('四种模式阈值读取正确，chat 在 8 turn 不触发，12 turn 后触发', (): void => {
        const settings = { ...DEFAULT_SUMMARY_SETTINGS.autoSummary };
        const semantic = buildSemanticChangeSummary({
            textWindow: '他们离开营地，次日清晨回到城门。',
        });
        const enabledTriggerIds = getDefaultSummaryTriggerIds();

        const roleplayDecision = shouldRunAutoSummary({
            settings,
            runtime: null,
            activeAssistantTurnCount: 8,
            currentMode: 'roleplay',
            textWindow: '他们离开营地，次日清晨回到城门。',
            enabledTriggerIds,
            semanticChange: semantic,
            promptPressureRatio: 0.2,
        });
        expect(roleplayDecision.threshold).toBe(8);
        expect(roleplayDecision.shouldRun).toBe(true);

        const chatDecisionAt8 = shouldRunAutoSummary({
            settings,
            runtime: null,
            activeAssistantTurnCount: 8,
            currentMode: 'chat',
            textWindow: '他们离开营地，次日清晨回到城门。',
            enabledTriggerIds,
            semanticChange: semantic,
            promptPressureRatio: 0.2,
        });
        expect(chatDecisionAt8.threshold).toBe(12);
        expect(chatDecisionAt8.shouldRun).toBe(false);

        const chatDecisionAt12 = shouldRunAutoSummary({
            settings,
            runtime: null,
            activeAssistantTurnCount: 12,
            currentMode: 'chat',
            textWindow: '他们离开营地，次日清晨回到城门。',
            enabledTriggerIds,
            semanticChange: semantic,
            promptPressureRatio: 0.2,
        });
        expect(chatDecisionAt12.shouldRun).toBe(true);
    });

    it('最小间隔与冷却楼层可阻止重复触发', (): void => {
        const minGapBlocked = shouldRunAutoSummary({
            settings: { ...DEFAULT_SUMMARY_SETTINGS.autoSummary },
            runtime: {
                lastSummaryTurnCount: 9,
                lastSummaryAt: Date.now(),
                lastTriggerReasonCodes: [],
                lastMode: 'mixed',
            },
            activeAssistantTurnCount: 11,
            currentMode: 'mixed',
            textWindow: '剧情继续推进。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildEmptySemantic(),
            promptPressureRatio: 0.9,
        });
        expect(minGapBlocked.shouldRun).toBe(false);
        expect(minGapBlocked.reasonCodes).toContain('auto_summary_blocked:min_turn_gap');

        const cooldownBlocked = shouldRunAutoSummary({
            settings: {
                ...DEFAULT_SUMMARY_SETTINGS.autoSummary,
                minTurnsAfterLastSummary: 0,
                coolDownTurns: 3,
            },
            runtime: {
                lastSummaryTurnCount: 10,
                lastSummaryAt: Date.now(),
                lastTriggerReasonCodes: [],
                lastMode: 'mixed',
            },
            activeAssistantTurnCount: 12,
            currentMode: 'mixed',
            textWindow: '剧情继续推进。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildEmptySemantic(),
            promptPressureRatio: 0.9,
        });
        expect(cooldownBlocked.shouldRun).toBe(false);
        expect(cooldownBlocked.reasonCodes).toContain('auto_summary_blocked:cooldown');
    });

    it('达阈值但无有效信号不触发，达阈值且 trigger score 达标会触发', (): void => {
        const noSignalDecision = shouldRunAutoSummary({
            settings: { ...DEFAULT_SUMMARY_SETTINGS.autoSummary },
            runtime: null,
            activeAssistantTurnCount: 10,
            currentMode: 'mixed',
            textWindow: '嗯嗯，好的。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildEmptySemantic(),
            promptPressureRatio: 0.2,
        });
        expect(noSignalDecision.shouldRun).toBe(false);

        const triggerPassedDecision = shouldRunAutoSummary({
            settings: { ...DEFAULT_SUMMARY_SETTINGS.autoSummary },
            runtime: null,
            activeAssistantTurnCount: 10,
            currentMode: 'mixed',
            textWindow: '战斗结束后他们离开战场，准备下一阶段任务。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildSemanticChangeSummary({
                textWindow: '战斗结束后他们离开战场，准备下一阶段任务。',
            }),
            promptPressureRatio: 0.2,
        });
        expect(triggerPassedDecision.shouldRun).toBe(true);
    });

    it('未达阈值但命中 allowEarlyTrigger 会提前触发', (): void => {
        const decision = shouldRunAutoSummary({
            settings: { ...DEFAULT_SUMMARY_SETTINGS.autoSummary },
            runtime: null,
            activeAssistantTurnCount: 5,
            currentMode: 'chat',
            textWindow: '两人突然决裂，互相怀疑并开始回避。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildSemanticChangeSummary({
                textWindow: '两人突然决裂，互相怀疑并开始回避。',
            }),
            promptPressureRatio: 0.1,
        });
        expect(decision.shouldRun).toBe(true);
        expect(decision.reasonCodes).toContain('auto_summary:early_trigger');
    });

    it('用户更正 / 世界状态变化可以在未达阈值时提前触发', (): void => {
        const settings = {
            ...DEFAULT_SUMMARY_SETTINGS.autoSummary,
            enableTriggerRules: false,
            enableSemanticChangeTrigger: true,
            semanticTriggerMinScore: 0.3,
        };
        const decision = shouldRunAutoSummary({
            settings,
            runtime: null,
            activeAssistantTurnCount: 4,
            currentMode: 'chat',
            textWindow: '更正，覆盖之前设定，以后按这个来。世界规则已更新。',
            enabledTriggerIds: getDefaultSummaryTriggerIds(),
            semanticChange: buildSemanticChangeSummary({
                textWindow: '更正，覆盖之前设定，以后按这个来。世界规则已更新。',
            }),
            promptPressureRatio: 0.1,
        });
        expect(decision.shouldRun).toBe(true);
        expect(decision.reasonCodes).toContain('auto_summary:early_trigger');
    });

    it('模式解析遵循 chatType 与 stylePreference 的映射规则', (): void => {
        expect(resolveAutoSummaryMode({
            chatProfile: { chatType: 'tool', stylePreference: 'story' },
        })).toBe('chat');
        expect(resolveAutoSummaryMode({
            chatProfile: { chatType: 'group', stylePreference: 'qa' },
        })).toBe('roleplay');
        expect(resolveAutoSummaryMode({
            chatProfile: { chatType: 'solo', stylePreference: 'story' },
        })).toBe('story');
        expect(resolveAutoSummaryMode({
            chatProfile: { chatType: 'solo', stylePreference: 'info' },
        })).toBe('chat');
        expect(resolveAutoSummaryMode({
            chatProfile: { chatType: 'solo', stylePreference: 'unknown' as any },
        })).toBe('mixed');
    });
});
