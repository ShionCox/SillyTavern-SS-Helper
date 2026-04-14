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
  handlePromptReadyEvent,
} from "./promptEvent";
import { simpleHashEvent } from "../core/utilsEvent";

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
    enableAiUrgencyHint: true,
    timeLimitDefaultUrgency: "normal",
    timeLimitUrgencyLowSeconds: 45,
    timeLimitUrgencyNormalSeconds: 30,
    timeLimitUrgencyHighSeconds: 15,
    timeLimitUrgencyCriticalSeconds: 8,
    enableSkillSystem: true,
    enableInteractiveTriggers: true,
    enableSelectionFallbackTriggers: false,
    selectionFallbackLimitMode: "smart_segment",
    selectionFallbackMaxPerRound: 3,
    selectionFallbackMaxPerFloor: 2,
    selectionFallbackMinTextLength: 2,
    selectionFallbackMaxTextLength: 10,
    selectionFallbackMaxSegments: 2,
    selectionFallbackLongSentenceThreshold: 26,
    selectionFallbackMaxTotalLength: 45,
    selectionFallbackLongSentenceSplitPunctuationText: "，,、：",
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
    expect(enabledText).toContain("trigger_pack 只能输出 ```triggerjson，禁止 ```json。");
    expect(enabledText).toContain("triggerjson:");
    expect(enabledText).toContain('"type":"trigger_pack"');
  });

  it("时限协议不再要求 AI 直接填写 timeLimit，而是改为 urgency", () => {
    const text = buildDynamicSystemRuleTextEvent(createSettings({
      enableTimeLimit: true,
      enableAiUrgencyHint: true,
    }));

    expect(text).not.toContain('"timeLimit":"PT30S"');
    expect(text).toContain('"urgency":"none|low|normal|high|critical"');
    expect(text).toContain("不要写 timeLimit 秒数");
    expect(text).toContain("auto 事件不要写 urgency");
  });

  it("关闭 AI 紧张提示后不再要求输出 urgency 字段", () => {
    const text = buildDynamicSystemRuleTextEvent(createSettings({
      enableTimeLimit: true,
      enableAiUrgencyHint: false,
    }));

    expect(text).not.toContain('"urgency":"none|low|normal|high|critical"');
    expect(text).toContain("当前不允许 AI 指定 urgency");
  });

  it("compact runtime policy 会移除摘要和技能预览类低价值字段", () => {
    const text = buildCompactDiceRuntimePolicyBlockEvent(
      createSettings(),
      "<dice_runtime_policy>",
      "</dice_runtime_policy>"
    );

    expect(text).toContain("apply_scope=protagonist_only");
    expect(text).toContain("enabled_dice=d20");
    expect(text).toContain("time_limit_default_urgency=normal");
    expect(text).toContain("time_limit_auto_mode=none");
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

  it("交互触发协议包含可标与即时/延迟规则", () => {
    const text = buildDynamicSystemRuleTextEvent(createSettings({
      enableInteractiveTriggers: true,
      promptVerbosityMode: "compact",
    }));

    expect(text).toContain("trigger_pack 只能输出 ```triggerjson，禁止 ```json。");
    expect(text).toContain("只标值得继续调查、判断或检定的短词或短短语");
    expect(text).toContain("不要标整句、纯氛围描写");
    expect(text).toContain("优先 instant");
    expect(text).toContain("优先 delayed");
    expect(text).toContain("<rh-trigger action=\"调查\" skill=\"调查\"");
  });

  it("状态标签协议会明确要求写进 rolljson 的 outcomes", () => {
    const text = buildDynamicSystemRuleTextEvent(createSettings({
      enableStatusSystem: true,
      promptVerbosityMode: "compact",
    }));

    expect(text).toContain("状态标签只能写在 ```rolljson 的 outcomes.success / outcomes.failure / outcomes.explode 文本里。");
    expect(text).toContain("禁止把状态标签写进正文、desc、dc_reason、rh-trigger 或 trigger_pack。");
  });

  it("verbose 交互触发协议包含更细的倾向与示例", () => {
    const text = buildDynamicSystemRuleTextEvent(createSettings({
      enableInteractiveTriggers: true,
      promptVerbosityMode: "verbose",
    }));

    expect(text).toContain("rh-trigger 应落在正文里最值得继续追查的那个短词或短短语上");
    expect(text).toContain("信息型检定优先 instant");
    expect(text).toContain("状态型检定优先 delayed");
    expect(text).toContain("适合 instant");
    expect(text).toContain("适合 delayed");
  });

  it("最终规则文本会保留用户自定义补充", () => {
    const text = buildFinalRuleTextEvent(createSettings({
      ruleText: "1. 搜查失败时优先给误判线索。",
    }));

    expect(text).toContain("【骰子协议】");
    expect(text).toContain("【用户自定义补充】");
    expect(text).toContain("搜查失败时优先给误判线索");
  });

  it("重试当前楼层时不会注入该楼层上次的暗骰摘要", () => {
    const messages = [
      { role: "user", id: "user_1", mes: "继续调查" },
      { role: "assistant", id: "assistant_1", mes: "上一版回复" },
    ] as any[];
    const userMsgId = `prompt_user:user_1:${simpleHashEvent("继续调查")}`;
    const buildSummaryBlockFromHistoryEvent = vi.fn((historyArg: any[]) => ({
      publicSummaryText: historyArg.length > 0 ? "<dice_round_summary>\n旧公开摘要\n</dice_round_summary>" : "",
      blindSummaryText: historyArg.length > 0 ? "<dice_blind_round_summary>\n旧暗骰摘要\n</dice_blind_round_summary>" : "",
    }));
    const meta: any = {
      lastPromptUserMsgId: userMsgId,
      outboundSummary: {
        userMsgId,
        roundId: "round_old",
        publicSummaryText: "<dice_round_summary>\n缓存公开摘要\n</dice_round_summary>",
        blindSummaryText: "<dice_blind_round_summary>\n缓存暗骰摘要\n</dice_blind_round_summary>",
      },
      summaryHistory: [{
        roundId: "round_old",
        openedAt: 1,
        closedAt: 2,
        eventsCount: 1,
        rolledCount: 1,
        sourceAssistantMsgIds: ["assistant:assistant_1:swipe_0:hash"],
        events: [{
          id: "evt_1",
          title: "调查【爪痕】",
          desc: "旧线索",
          targetLabel: "爪痕",
          skill: "调查",
          checkDice: "1d20",
          compare: ">=",
          dc: 12,
          difficulty: "normal",
          dcSource: "ai",
          dcReason: "",
          rollMode: "manual",
          advantageState: "normal",
          timeLimit: "none",
          status: "done",
          resultSource: "blind_manual_roll",
          visibility: "blind",
          revealMode: "instant",
          total: 15,
          skillModifierApplied: 0,
          statusModifierApplied: 0,
          baseModifierUsed: 0,
          finalModifierUsed: 0,
          success: true,
          marginToDc: 3,
          resultGrade: "success",
          outcomeKind: "success",
          outcomeText: "你发现了新鲜爪痕。",
          explosionTriggered: false,
          sourceAssistantMsgId: "assistant:assistant_1:swipe_0:hash",
          rollId: "roll_1",
        }],
      }],
    };

    handlePromptReadyEvent({
      messages,
    }, {
      getSettingsEvent: () => createSettings({ autoSendRuleToAI: false, enableStatusSystem: false }),
      DICE_RULE_BLOCK_START_Event: "<dice_rules>",
      DICE_RULE_BLOCK_END_Event: "</dice_rules>",
      DICE_SUMMARY_BLOCK_START_Event: "<dice_round_summary>",
      DICE_SUMMARY_BLOCK_END_Event: "</dice_round_summary>",
      DICE_BLIND_SUMMARY_BLOCK_START_Event: "<dice_blind_round_summary>",
      DICE_BLIND_SUMMARY_BLOCK_END_Event: "</dice_blind_round_summary>",
      DICE_RESULT_GUIDANCE_BLOCK_START_Event: "<dice_result_guidance>",
      DICE_RESULT_GUIDANCE_BLOCK_END_Event: "</dice_result_guidance>",
      DICE_BLIND_GUIDANCE_BLOCK_START_Event: "<dice_blind_guidance>",
      DICE_BLIND_GUIDANCE_BLOCK_END_Event: "</dice_blind_guidance>",
      DICE_ACTIVE_STATUSES_BLOCK_START_Event: "<dice_active_statuses>",
      DICE_ACTIVE_STATUSES_BLOCK_END_Event: "</dice_active_statuses>",
      DICE_PASSIVE_DISCOVERY_BLOCK_START_Event: "<dice_passive_discovery>",
      DICE_PASSIVE_DISCOVERY_BLOCK_END_Event: "</dice_passive_discovery>",
      sweepTimeoutFailuresEvent: () => false,
      getDiceMetaEvent: () => meta,
      resolveSkillModifierBySkillNameEvent: () => 0,
      ensureSummaryHistoryEvent: (targetMeta) => targetMeta.summaryHistory,
      createRoundSummarySnapshotEvent: vi.fn(),
      trimSummaryHistoryEvent: vi.fn(),
      buildSummaryBlockFromHistoryEvent,
      saveMetadataSafeEvent: vi.fn(),
    } as any, "test");

    expect(buildSummaryBlockFromHistoryEvent).toHaveBeenCalled();
    expect(buildSummaryBlockFromHistoryEvent.mock.calls[0]?.[0]).toEqual([]);
    expect(meta.outboundSummary?.blindSummaryText || "").toBe("");
    expect(messages.some((item) => String(item.mes || item.content || "").includes("缓存暗骰摘要"))).toBe(false);
  });
});
