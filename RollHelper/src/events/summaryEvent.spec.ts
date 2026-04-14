import { describe, expect, it, vi } from "vitest";
import type {
  DicePluginSettingsEvent,
  RoundSummaryEventItemEvent,
  RoundSummarySnapshotEvent,
} from "../types/eventDomainEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { buildSummaryBlockFromHistoryEvent } from "./summaryEvent";

function createSettings(overrides: Partial<DicePluginSettingsEvent> = {}): DicePluginSettingsEvent {
  return {
    enabled: true,
    autoSendRuleToAI: false,
    enableAiRollMode: false,
    enableAiRoundControl: false,
    enable3DDiceBox: false,
    enableRerollFeature: false,
    enableExplodingDice: false,
    enableAdvantageSystem: false,
    enableDynamicResultGuidance: false,
    enableDynamicDcReason: true,
    enableStatusSystem: false,
    aiAllowedDiceSidesText: "20",
    theme: "default",
    summaryDetailMode: "minimal",
    summaryHistoryRounds: 3,
    eventApplyScope: "protagonist_only",
    enableOutcomeBranches: true,
    enableExplodeOutcomeBranch: false,
    includeOutcomeInSummary: true,
    showOutcomePreviewInListCard: false,
    enableTimeLimit: false,
    minTimeLimitSeconds: 30,
    enableSkillSystem: true,
    enableInteractiveTriggers: true,
    enableSelectionFallbackTriggers: false,
    selectionFallbackLimitMode: "sentence_count",
    selectionFallbackMaxPerRound: 3,
    selectionFallbackMaxPerFloor: 2,
    selectionFallbackMinTextLength: 2,
    selectionFallbackMaxTextLength: 24,
    selectionFallbackMaxSentences: 1,
    selectionFallbackSingleAction: "调查",
    selectionFallbackSingleSkill: "调查",
    enableSelectionFallbackDebugInfo: false,
    interactiveTriggerMode: "ai_markup",
    enableBlindRoll: true,
    defaultBlindSkillsText: "调查,察觉",
    maxBlindRollsPerRound: 5,
    maxQueuedBlindGuidance: 5,
    blindGuidanceTtlSeconds: 300,
    enableBlindGuidanceDedup: true,
    blindDedupScope: "same_round",
    blindEventCardVisibilityMode: "placeholder",
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
    enableNarrativeCostEnforcement: false,
    worldbookPassiveMode: "disabled",
    blindUiWarnInConsole: true,
    blindRevealInSummary: false,
    skillTableText: "{}",
    skillPresetStoreText: "",
    promptVerbosityMode: "compact",
    ruleTextModeVersion: 1,
    ruleText: "",
    ...overrides,
  };
}

function createSnapshot(): RoundSummarySnapshotEvent {
  const publicItem: RoundSummaryEventItemEvent = {
    id: "event_public",
    title: "沿痕迹深入林径",
    desc: "你带伤跟随塞拉菲娜沿着可疑痕迹前进。",
    targetLabel: "场景",
    skill: "调查",
    checkDice: "1d20",
    compare: ">=",
    dc: 12,
    difficulty: "normal",
    dcSource: "ai",
    dcReason: "",
    rollMode: "auto",
    advantageState: "normal",
    timeLimit: "none",
    status: "done",
    resultSource: "ai_auto_roll",
    visibility: "public",
    revealMode: "instant",
    total: 18,
    skillModifierApplied: 0,
    statusModifierApplied: 0,
    baseModifierUsed: 0,
    finalModifierUsed: 0,
    success: true,
    marginToDc: 6,
    resultGrade: "success",
    outcomeKind: "success",
    outcomeText: "你辨清了方向并安全推进。",
    explosionTriggered: false,
  };

  const blindItem: RoundSummaryEventItemEvent = {
    id: "event_blind",
    title: "奇怪的响声",
    desc: "蕨叶朝同一方向压弯，像是有东西经过。",
    targetLabel: "线索",
    skill: "调查",
    checkDice: "1d20",
    compare: ">=",
    dc: 12,
    difficulty: "normal",
    dcSource: "ai",
    dcReason: "",
    rollMode: "auto",
    advantageState: "normal",
    timeLimit: "none",
    status: "done",
    resultSource: "blind_manual_roll",
    visibility: "blind",
    revealMode: "instant",
    total: 0,
    skillModifierApplied: 0,
    statusModifierApplied: 0,
    baseModifierUsed: 0,
    finalModifierUsed: 0,
    success: true,
    marginToDc: 0,
    resultGrade: "success",
    outcomeKind: "success",
    outcomeText: "你听出那不是风，而是隔板后的抓挠声。",
    explosionTriggered: false,
  };

  return {
    roundId: "round_test",
    openedAt: 1,
    closedAt: 2,
    eventsCount: 2,
    rolledCount: 2,
    events: [publicItem, blindItem],
    sourceAssistantMsgIds: [],
  };
}

const summaryDeps = {
  SUMMARY_HISTORY_ROUNDS_MAX_Event: 6,
  SUMMARY_HISTORY_ROUNDS_MIN_Event: 1,
  SUMMARY_MAX_EVENTS_Event: 20,
  SUMMARY_MAX_TOTAL_EVENT_LINES_Event: 40,
  DICE_SUMMARY_BLOCK_START_Event: "<summary>",
  DICE_SUMMARY_BLOCK_END_Event: "</summary>",
  DICE_BLIND_SUMMARY_BLOCK_START_Event: "<blind>",
  DICE_BLIND_SUMMARY_BLOCK_END_Event: "</blind>",
};

describe("summaryEvent 摘要压缩与口语化", () => {
  it("public summary 不包含 roundId 与关闭时间", () => {
    const blocks = buildSummaryBlockFromHistoryEvent(
      [createSnapshot()],
      "minimal",
      1,
      true,
      createSettings({ promptVerbosityMode: "compact" }),
      summaryDeps
    );

    expect(blocks.publicSummaryText).toContain("mode=compact rounds=1");
    expect(blocks.publicSummaryText).not.toContain("v=6");
    expect(blocks.publicSummaryText).not.toContain("roundId=");
    expect(blocks.publicSummaryText).not.toContain("关闭时间=");
    expect(blocks.publicSummaryText).not.toContain("fmt=nl");
    expect(blocks.publicSummaryText).not.toContain("window_rounds=");
    expect(blocks.publicSummaryText).not.toContain("detail=");
    expect(blocks.publicSummaryText).not.toContain("include_outcome=");
  });

  it("统计行仅在 verbose 模式保留", () => {
    const compactBlocks = buildSummaryBlockFromHistoryEvent(
      [createSnapshot()],
      "minimal",
      1,
      true,
      createSettings({ promptVerbosityMode: "compact" }),
      summaryDeps
    );
    expect(compactBlocks.publicSummaryText).not.toContain("本轮事件数=");
    expect(compactBlocks.publicSummaryText).toContain("上一轮：");

    const verboseBlocks = buildSummaryBlockFromHistoryEvent(
      [createSnapshot()],
      "minimal",
      1,
      true,
      createSettings({ promptVerbosityMode: "verbose" }),
      summaryDeps
    );
    expect(verboseBlocks.publicSummaryText).toContain("本轮事件数=");
    expect(verboseBlocks.publicSummaryText).toContain("上一轮（已结算）：");
  });

  it("blind summary 同样去掉 roundId/关闭时间 并保持口语化", () => {
    const blocks = buildSummaryBlockFromHistoryEvent(
      [createSnapshot()],
      "minimal",
      1,
      true,
      createSettings({ promptVerbosityMode: "compact" }),
      summaryDeps
    );

    expect(blocks.blindSummaryText).toContain("mode=compact rounds=1");
    expect(blocks.blindSummaryText).not.toContain("v=2");
    expect(blocks.blindSummaryText).not.toContain("roundId=");
    expect(blocks.blindSummaryText).not.toContain("关闭时间=");
    expect(blocks.blindSummaryText).toContain("暗骰");
    expect(blocks.blindSummaryText).toContain("已即时反馈");
    expect(blocks.blindSummaryText).toContain("抓挠声");
  });
});
