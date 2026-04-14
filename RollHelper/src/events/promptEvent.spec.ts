import { describe, expect, it, vi } from "vitest";
import type { DicePluginSettingsEvent } from "../types/eventDomainEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  buildCompactDiceRuntimePolicyBlockEvent,
  buildDynamicSystemRuleTextEvent,
  buildFinalRuleTextEvent,
} from "./promptEvent";

function createSettings(overrides: Partial<DicePluginSettingsEvent> = {}): DicePluginSettingsEvent {
  return {
    enabled: true,
    autoSendRuleToAI: true,
    enableAiRollMode: true,
    enableAiRoundControl: false,
    enable3DDiceBox: false,
    enableRerollFeature: false,
    enableExplodingDice: true,
    enableAdvantageSystem: true,
    enableDynamicResultGuidance: false,
    enableDynamicDcReason: true,
    enableStatusSystem: true,
    aiAllowedDiceSidesText: "20",
    theme: "default",
    summaryDetailMode: "minimal",
    summaryHistoryRounds: 3,
    eventApplyScope: "protagonist_only",
    enableOutcomeBranches: true,
    enableExplodeOutcomeBranch: true,
    includeOutcomeInSummary: true,
    showOutcomePreviewInListCard: false,
    enableTimeLimit: true,
    minTimeLimitSeconds: 10,
    enableSkillSystem: true,
    enableInteractiveTriggers: true,
    enableSelectionFallbackTriggers: false,
    selectionFallbackLimitMode: "sentence_count",
    selectionFallbackMaxPerRound: 3,
    selectionFallbackMaxPerFloor: 2,
    selectionFallbackMinTextLength: 2,
    selectionFallbackMaxTextLength: 10,
    selectionFallbackMaxSentences: 2,
    selectionFallbackSingleAction: "调查",
    selectionFallbackSingleSkill: "调查",
    enableSelectionFallbackDebugInfo: false,
    interactiveTriggerMode: "ai_markup",
    enableBlindRoll: true,
    defaultBlindSkillsText: "洞察\n调查",
    maxBlindRollsPerRound: 1,
    maxQueuedBlindGuidance: 5,
    blindGuidanceTtlSeconds: 180,
    enableBlindGuidanceDedup: true,
    blindDedupScope: "same_round",
    blindEventCardVisibilityMode: "remove",
    maxBlindGuidanceInjectedPerPrompt: 2,
    enableBlindDebugInfo: false,
    blindHistoryDisplayConsumedAsNarrativeApplied: true,
    blindHistoryAutoArchiveEnabled: true,
    blindHistoryAutoArchiveAfterHours: 24,
    blindHistoryShowFloorKey: true,
    blindHistoryShowOrigin: true,
    enablePassiveCheck: false,
    passiveFormulaBase: 10,
    passiveSkillAliasesText: "",
    enableNarrativeCostEnforcement: true,
    worldbookPassiveMode: "disabled",
    blindUiWarnInConsole: true,
    blindRevealInSummary: false,
    skillTableText: "{}",
    skillPresetStoreText: "",
    promptVerbosityMode: "compact",
    ruleTextModeVersion: 2,
    ruleText: "",
    ...overrides,
  };
}

describe("prompt 协议分层", () => {
  it("交互触发扩展只在开关开启时注入", () => {
    const disabledText = buildDynamicSystemRuleTextEvent(createSettings({
      enableInteractiveTriggers: false,
    }));
    const enabledText = buildDynamicSystemRuleTextEvent(createSettings({
      enableInteractiveTriggers: true,
    }));

    expect(disabledText).not.toContain("【交互触发协议】");
    expect(disabledText).not.toContain('"type":"trigger_pack"');
    expect(enabledText).toContain("【交互触发协议】");
    expect(enabledText).toContain('"type":"trigger_pack"');
  });

  it("compact runtime policy 会移除摘要和技能预览类低价值字段", () => {
    const text = buildCompactDiceRuntimePolicyBlockEvent(
      createSettings(),
      "<dice_runtime_policy>",
      "</dice_runtime_policy>"
    );

    expect(text).toContain("apply_scope=protagonist_only");
    expect(text).toContain("enabled_dice=d20");
    expect(text).not.toContain("summary_detail=");
    expect(text).not.toContain("summary_rounds=");
    expect(text).not.toContain("summary_include_outcome=");
    expect(text).not.toContain("list_outcome_preview=");
    expect(text).not.toContain("skill_table_count=");
    expect(text).not.toContain("skill_table_preview=");
  });

  it("verbosity 模式会影响协议细节密度", () => {
    const compactText = buildDynamicSystemRuleTextEvent(createSettings({
      promptVerbosityMode: "compact",
    }));
    const verboseText = buildDynamicSystemRuleTextEvent(createSettings({
      promptVerbosityMode: "verbose",
    }));

    expect(compactText).not.toContain("例：");
    expect(verboseText).toContain("例：");
  });

  it("最终规则文本会保留用户自定义补充", () => {
    const text = buildFinalRuleTextEvent(createSettings({
      ruleText: "1. 搜查失败时优先给误判线索。",
    }));

    expect(text).toContain("【骰子协议】");
    expect(text).toContain("【用户自定义补充】");
    expect(text).toContain("搜查失败时优先给误判线索");
  });
});
