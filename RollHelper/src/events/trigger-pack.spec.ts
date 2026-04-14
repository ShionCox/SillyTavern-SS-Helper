import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BlindHistoryItemEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventRollRecordEvent,
  InteractiveTriggerEvent,
  PendingRoundEvent,
} from "../types/eventDomainEvent";
import type { DiceResult } from "../types/diceEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  getMessageInteractiveTriggersEvent,
  getMessageInteractiveTriggerLifecycleMetaEvent,
  getMessageTriggerPackEvent,
  rebuildInteractiveTriggerMetadataFromStableSourceEvent,
  sanitizeMessageInteractiveTriggersEvent,
  setMessageInteractiveTriggersEvent,
  setMessageTriggerPackEvent,
} from "./interactiveTriggerMetadataEvent";
import { sanitizeAssistantMessageArtifactsEvent } from "./messageSanitizerEvent";
import { buildSummaryBlockFromHistoryEvent, createRoundSummarySnapshotEvent } from "./summaryEvent";
import { invalidatePendingRoundFloorEvent, performInteractiveTriggerRollEvent } from "./roundEvent";

function createSettings(overrides: Partial<DicePluginSettingsEvent> = {}): DicePluginSettingsEvent {
  return {
    enabled: true,
    autoSendRuleToAI: false,
    enableAiRollMode: false,
    enableAiRoundControl: false,
    enable3DDiceBox: false,
    enableRerollFeature: true,
    enableExplodingDice: false,
    enableAdvantageSystem: false,
    enableDynamicResultGuidance: false,
    enableDynamicDcReason: true,
    enableStatusSystem: false,
    aiAllowedDiceSidesText: "20",
    theme: "default",
    summaryDetailMode: "balanced",
    summaryHistoryRounds: 3,
    eventApplyScope: "protagonist_only",
    enableOutcomeBranches: true,
    enableExplodeOutcomeBranch: false,
    includeOutcomeInSummary: true,
    showOutcomePreviewInListCard: true,
    enableTimeLimit: false,
    enableAiUrgencyHint: true,
    timeLimitDefaultUrgency: "normal",
    timeLimitUrgencyLowSeconds: 45,
    timeLimitUrgencyNormalSeconds: 30,
    timeLimitUrgencyHighSeconds: 15,
    timeLimitUrgencyCriticalSeconds: 8,
    enableSkillSystem: true,
    enableInteractiveTriggers: true,
    enableSelectionFallbackTriggers: true,
    selectionFallbackLimitMode: "smart_segment",
    selectionFallbackMaxPerRound: 3,
    selectionFallbackMaxPerFloor: 2,
    selectionFallbackMinTextLength: 2,
    selectionFallbackMaxTextLength: 24,
    selectionFallbackMaxSegments: 1,
    selectionFallbackLongSentenceThreshold: 26,
    selectionFallbackMaxTotalLength: 45,
    selectionFallbackLongSentenceSplitPunctuationText: "，,、：",
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

describe("trigger_pack 元数据", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("能从正文提取 trigger_pack 并合并到 rh-trigger 元数据", () => {
    const message = {
      mes: `你听见<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`triggerpack
{
  "type": "trigger_pack",
  "version": "1",
  "defaults": { "dice": "1d20", "compare": ">=" },
  "items": [
    {
      "sid": "weird_sound",
      "skill": "调查",
      "difficulty": "normal",
      "reveal": "instant",
      "success": "你听出那不是风声，而是木板后的抓挠声。",
      "failure": "你听见异响，但暂时分辨不出来源。"
    }
  ]
}
\`\`\``,
      extra: {},
    };

    const changed = sanitizeMessageInteractiveTriggersEvent(message as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:1:swipe_0:hash",
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).toContain("奇怪的响声");
    expect(String(message.mes)).not.toContain("trigger_pack");

    const triggerPack = getMessageTriggerPackEvent(message as any);
    expect(triggerPack?.items).toHaveLength(1);
    expect(triggerPack?.items[0].reveal).toBe("instant");

    const triggers = getMessageInteractiveTriggersEvent(message as any);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].revealMode).toBe("instant");
    expect(triggers[0].triggerPackSuccessText).toContain("抓挠声");
    expect(triggers[0].compare).toBe(">=");
  });

  it("显示态正文不含 trigger 时，会保留旧的 trigger / trigger_pack 元数据", () => {
    const message = {
      mes: "这里只剩普通正文。",
      extra: {},
    };
    setMessageInteractiveTriggersEvent(message as any, [{
      triggerId: "old",
      label: "旧线索",
      action: "调查",
      skill: "调查",
      blind: true,
      sourceMessageId: "assistant:old",
      sourceId: "old_sid",
      revealMode: "instant",
      triggerPackSourceId: "old_sid",
      diceExpr: "1d20",
    } as InteractiveTriggerEvent]);
    setMessageTriggerPackEvent(message as any, {
      type: "trigger_pack",
      version: "1",
      items: [{
        sid: "old_sid",
        skill: "调查",
        difficulty: "normal",
        reveal: "instant",
        success: "旧反馈",
      }],
    });

    const changed = sanitizeMessageInteractiveTriggersEvent(message as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:new",
      sourceState: "display_text",
    });

    expect(changed).toBe(false);
    expect(getMessageInteractiveTriggersEvent(message as any)).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items).toHaveLength(1);
    expect(getMessageInteractiveTriggerLifecycleMetaEvent(message as any)?.hydratedFrom).toBe("metadata");
  });

  it("编辑态正文不再包含 trigger 时，会清空旧的 trigger / trigger_pack 元数据", () => {
    const message = {
      mes: "这里只剩普通正文。",
      extra: {},
    };
    setMessageInteractiveTriggersEvent(message as any, [{
      triggerId: "old",
      label: "旧线索",
      action: "调查",
      skill: "调查",
      blind: true,
      sourceMessageId: "assistant:old",
      sourceId: "old_sid",
      revealMode: "instant",
      triggerPackSourceId: "old_sid",
      diceExpr: "1d20",
    } as InteractiveTriggerEvent]);
    setMessageTriggerPackEvent(message as any, {
      type: "trigger_pack",
      version: "1",
      items: [{
        sid: "old_sid",
        skill: "调查",
        difficulty: "normal",
        reveal: "instant",
        success: "旧反馈",
      }],
    });

    const changed = sanitizeMessageInteractiveTriggersEvent(message as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:new",
      sourceState: "edited_source",
    });

    expect(changed).toBe(true);
    expect(getMessageInteractiveTriggersEvent(message as any)).toEqual([]);
    expect(getMessageTriggerPackEvent(message as any)).toBeNull();
  });

  it("会在 rolljson 清理后读取并清理 triggerpack，而不是提前丢失", () => {
    const sourceText = `剧情正文里有<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`rolljson
{"type":"dice_events","version":"1","events":[]}
\`\`\`\n\n\`\`\`triggerpack
{
  "type":"trigger_pack",
  "version":"1",
  "items":[
    {"sid":"weird_sound","skill":"调查","difficulty":"normal","reveal":"instant","success":"你听见了木板后的抓挠声。","failure":"你没听清来源。"}
  ]
}
\`\`\``;
    const message = {
      mes: sourceText,
      extra: {},
    };

    const changed = sanitizeAssistantMessageArtifactsEvent(message as any, 0, {
      getSettingsEvent: () => createSettings(),
      getHostOriginalSourceTextEvent: () => "",
      getPreferredAssistantSourceTextEvent: () => sourceText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [
          {
            start: sourceText.indexOf("```rolljson"),
            end: sourceText.indexOf("```", sourceText.indexOf("```rolljson") + 3) + 3,
          },
        ],
      }),
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.replace(/\n{3,}/g, "\n\n").trim();
      },
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
      resolveSourceMessageIdEvent: () => "assistant:1:swipe_0:hash",
      sourceState: "display_text",
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).toContain("奇怪的响声");
    expect(String(message.mes)).not.toContain("rolljson");
    expect(String(message.mes)).not.toContain("trigger_pack");
    expect(getMessageTriggerPackEvent(message as any)?.items[0].sid).toBe("weird_sound");
    expect(getMessageInteractiveTriggersEvent(message as any)[0].revealMode).toBe("instant");
  });

  it("能识别 triggerjson 代码块里的 trigger_pack", () => {
    const message = {
      mes: `你听见<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`triggerjson
{
  "type": "trigger_pack",
  "version": "1",
  "items": [
    {
      "sid": "weird_sound",
      "skill": "调查",
      "difficulty": "normal",
      "reveal": "instant",
      "success": "你听出那不是风，而是隔板后的抓挠声。"
    }
  ]
}
\`\`\``,
      extra: {},
    };

    const changed = sanitizeMessageInteractiveTriggersEvent(message as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:1:swipe_0:hash",
      sourceState: "display_text",
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).not.toContain("trigger_pack");
    expect(getMessageTriggerPackEvent(message as any)?.items).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items[0].sid).toBe("weird_sound");
    expect(getMessageInteractiveTriggersEvent(message as any)?.[0]?.triggerPackSuccessText).toContain("抓挠声");
  });

  it("连续解析时也会稳定清理 triggerjson 代码块", () => {
    const firstMessage = {
      mes: `甲。\n\n\`\`\`triggerjson
{
  "type": "trigger_pack",
  "version": "1",
  "items": [{"sid":"a","skill":"调查","reveal":"instant"}]
}
\`\`\``,
      extra: {},
    };
    const secondMessage = {
      mes: `乙。\n\n\`\`\`triggerjson
{
  "type": "trigger_pack",
  "version": "1",
  "items": [{"sid":"b","skill":"调查","reveal":"instant"}]
}
\`\`\``,
      extra: {},
    };

    const firstChanged = sanitizeMessageInteractiveTriggersEvent(firstMessage as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:first",
      sourceState: "display_text",
    });
    const secondChanged = sanitizeMessageInteractiveTriggersEvent(secondMessage as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:second",
      sourceState: "display_text",
    });

    expect(firstChanged).toBe(true);
    expect(secondChanged).toBe(true);
    expect(String(firstMessage.mes)).not.toContain("triggerjson");
    expect(String(secondMessage.mes)).not.toContain("triggerjson");
    expect(getMessageTriggerPackEvent(secondMessage as any)?.items[0].sid).toBe("b");
  });

  it("metadata 缺失时可从稳定原文重建 trigger / trigger_pack", () => {
    const message = {
      mes: "奇怪的响声。",
      extra: {},
    };
    const stableSourceText = `你听见<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`triggerpack
{
  "type": "trigger_pack",
  "version": "1",
  "items": [
    {
      "sid": "weird_sound",
      "skill": "调查",
      "difficulty": "normal",
      "reveal": "instant",
      "success": "你听出那不是风，而是隔板后的抓挠声。",
      "failure": "你没法确认来源。"
    }
  ]
}
\`\`\``;

    const changed = rebuildInteractiveTriggerMetadataFromStableSourceEvent(message as any, {
      settings: createSettings(),
      sourceMessageId: "assistant:1:swipe_0:hash",
      stableSourceText,
      sourceState: "raw_source",
    });

    expect(changed).toBe(true);
    expect(getMessageInteractiveTriggersEvent(message as any)).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items[0].sid).toBe("weird_sound");
    expect(getMessageInteractiveTriggerLifecycleMetaEvent(message as any)?.hydratedFrom).toBe("markup");
    expect(String(message.mes)).toBe("奇怪的响声。");
  });

  it("swipe 切换时不会误继承旧 swipe 的 trigger metadata", () => {
    const message = {
      mes: "主消息",
      swipe_id: 0,
      swipes: [
        { mes: "第一个版本里有奇怪的响声。", extra: {} },
        { mes: "第二个版本只是普通描述。", extra: {} },
      ],
      swipe_info: [{}, {}],
      extra: {},
    };

    setMessageInteractiveTriggersEvent(message as any, [{
      triggerId: "swipe_0_trigger",
      label: "奇怪的响声",
      action: "调查",
      skill: "调查",
      blind: true,
      sourceMessageId: "assistant:swipe_0",
      sourceId: "weird_sound",
      revealMode: "instant",
      triggerPackSourceId: "weird_sound",
      diceExpr: "1d20",
    } as InteractiveTriggerEvent]);
    setMessageTriggerPackEvent(message as any, {
      type: "trigger_pack",
      version: "1",
      items: [{
        sid: "weird_sound",
        skill: "调查",
        difficulty: "normal",
        reveal: "instant",
        success: "旧 swipe 反馈",
      }],
    });

    expect(getMessageInteractiveTriggersEvent(message as any)).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items).toHaveLength(1);

    message.swipe_id = 1;

    expect(getMessageInteractiveTriggersEvent(message as any)).toEqual([]);
    expect(getMessageTriggerPackEvent(message as any)).toBeNull();

    message.swipe_id = 0;

    expect(getMessageInteractiveTriggersEvent(message as any)).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items).toHaveLength(1);
  });
});

describe("trigger_pack 执行链", () => {
  it("instant 暗骰会直接反馈并写入已即时体现的历史状态", async () => {
    const meta: DiceMetaEvent = {};
    let idCounter = 0;
    const result: DiceResult = {
      rolls: [17],
      keptRolls: [17],
      modifier: 0,
      total: 17,
      rawTotal: 17,
      count: 1,
      sides: 20,
      exploding: false,
      explosionTriggered: false,
    };

    const trigger: InteractiveTriggerEvent = {
      triggerId: "trigger:weird_sound",
      label: "奇怪的响声",
      action: "调查",
      skill: "调查",
      blind: true,
      sourceMessageId: "assistant:1:swipe_0:hash",
      sourceId: "weird_sound",
      occurrenceIndex: 0,
      difficulty: "normal",
      diceExpr: "1d20",
      compare: ">=",
      revealMode: "instant",
      triggerPackSourceId: "weird_sound",
      triggerPackSuccessText: "你听出那不是风，而是隔板后的抓挠声。",
      triggerPackFailureText: "你只能确定那声音不太自然。",
    };

    const call = await performInteractiveTriggerRollEvent(trigger, {
      sweepTimeoutFailuresEvent: () => false,
      getDiceMetaEvent: () => meta,
      appendBlindHistoryRecordEvent: () => undefined,
      ensureRoundEventTimersSyncedEvent: () => undefined,
      recordTimeoutFailureIfNeededEvent: () => null,
      saveMetadataSafeEvent: () => undefined,
      getLatestRollRecordForEvent: () => null,
      refreshAllWidgetsFromStateEvent: () => undefined,
      refreshCountdownDomEvent: () => undefined,
      rollDiceEvent: async () => result,
      parseDiceExpression: () => ({ count: 1, sides: 20, modifier: 0, explode: false }),
      getSettingsEvent: () => createSettings(),
      resolveSkillModifierBySkillNameEvent: () => 0,
      applySkillModifierToDiceResultEvent: (current) => ({
        result: current,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
      }),
      saveLastRoll: () => undefined,
      normalizeCompareOperatorEvent: (raw) => raw,
      evaluateSuccessEvent: (total, compare, dc) => total >= Number(dc ?? 0),
      createIdEvent: (prefix) => `${prefix}_${++idCounter}`,
    });

    expect(call.feedback.revealMode).toBe("instant");
    expect(call.feedback.feedbackText).toContain("抓挠声");
    expect(call.record.visibility).toBe("blind");
    expect(call.record.revealMode).toBe("instant");
    expect(meta.pendingBlindGuidanceQueue ?? []).toHaveLength(0);
    expect(meta.blindHistory ?? []).toHaveLength(1);
    expect(meta.blindHistory?.[0].state).toBe("consumed");
    expect(meta.blindHistory?.[0].revealMode).toBe("instant");
  });

  it("interactive blind 会占用本轮暗骰次数上限", async () => {
    let idCounter = 0;
    const meta: DiceMetaEvent = {
      pendingRound: {
        roundId: "round_limit",
        status: "open",
        openedAt: Date.now(),
        sourceAssistantMsgIds: ["assistant:1:swipe_0:hash"],
        events: [],
        rolls: [{
          rollId: "roll_existing",
          roundId: "round_limit",
          eventId: "evt_existing",
          eventTitle: "旧暗骰",
          diceExpr: "1d20",
          result: {
            expr: "1d20",
            rolls: [12],
            modifier: 0,
            total: 12,
            rawTotal: 12,
            count: 1,
            sides: 20,
            sourceEngine: "builtin",
          } as any,
          success: true,
          compareUsed: ">=",
          dcUsed: 10,
          advantageStateApplied: "normal",
          resultGrade: "success",
          marginToDc: 2,
          skillModifierApplied: 0,
          statusModifierApplied: 0,
          baseModifierUsed: 0,
          finalModifierUsed: 0,
          targetLabelUsed: "旧线索",
          rolledAt: Date.now(),
          source: "blind_manual_roll",
          visibility: "blind",
          concealResult: true,
          natState: "none",
          timeoutAt: null,
          sourceAssistantMsgId: "assistant:1:swipe_0:hash",
          revealMode: "instant",
        }],
        eventTimers: {},
      } as any,
      pendingBlindGuidanceQueue: [],
      blindHistory: [],
    };

    const trigger: InteractiveTriggerEvent = {
      triggerId: "trigger:limit",
      label: "第二条线索",
      action: "调查",
      skill: "调查",
      blind: true,
      sourceMessageId: "assistant:1:swipe_0:hash",
      sourceId: "limit_source",
      occurrenceIndex: 0,
      difficulty: "normal",
      diceExpr: "1d20",
      compare: ">=",
      revealMode: "instant",
    };

    await expect(
      performInteractiveTriggerRollEvent(trigger, {
        sweepTimeoutFailuresEvent: () => false,
        getDiceMetaEvent: () => meta,
        appendBlindHistoryRecordEvent: () => undefined,
        ensureRoundEventTimersSyncedEvent: () => undefined,
        recordTimeoutFailureIfNeededEvent: () => null,
        saveMetadataSafeEvent: () => undefined,
        getLatestRollRecordForEvent: () => null,
        refreshAllWidgetsFromStateEvent: () => undefined,
        refreshCountdownDomEvent: () => undefined,
        rollDiceEvent: async () => ({
          expr: "1d20",
          rolls: [15],
          modifier: 0,
          total: 15,
          rawTotal: 15,
          count: 1,
          sides: 20,
          sourceEngine: "builtin",
        } as any),
        parseDiceExpression: () => ({ count: 1, sides: 20, modifier: 0, explode: false }),
        getSettingsEvent: () => createSettings({ maxBlindRollsPerRound: 1 }),
        resolveSkillModifierBySkillNameEvent: () => 0,
        applySkillModifierToDiceResultEvent: (current) => ({
          result: current,
          baseModifierUsed: 0,
          finalModifierUsed: 0,
        }),
        saveLastRoll: () => undefined,
        normalizeCompareOperatorEvent: (raw) => raw,
        evaluateSuccessEvent: (total, compare, dc) => total >= Number(dc ?? 0),
        createIdEvent: (prefix) => `${prefix}_${++idCounter}`,
      })
    ).rejects.toThrow("本轮暗骰次数已达到上限");
  });
});

describe("楼层失效与摘要", () => {
  it("楼层失效时会把 instant 暗骰历史同步标记为 invalidated", () => {
    const historyItem: BlindHistoryItemEvent = {
      rollId: "roll_1",
      eventId: "itr:assistant:weird_sound",
      eventTitle: "调查【奇怪的响声】",
      skill: "调查",
      diceExpr: "1d20",
      targetLabel: "奇怪的响声",
      rolledAt: Date.now(),
      source: "blind_manual_roll",
      sourceAssistantMsgId: "assistant:msg1:swipe_0:hash",
      sourceFloorKey: "assistant:msg1",
      revealMode: "instant",
      state: "consumed",
    };
    const meta: DiceMetaEvent = {
      blindHistory: [historyItem],
    };

    const changed = invalidatePendingRoundFloorEvent("assistant:msg1:swipe_1:hash", {
      getDiceMetaEvent: () => meta,
      saveMetadataSafeEvent: () => undefined,
    });

    expect(changed).toBe(true);
    expect(meta.blindHistory?.[0].state).toBe("invalidated");
  });

  it("摘要会把 instant 暗骰写成已即时反馈", () => {
    const round: PendingRoundEvent = {
      roundId: "round_1",
      status: "closed",
      openedAt: Date.now(),
      sourceAssistantMsgIds: ["assistant:msg1:swipe_0:hash"],
      eventTimers: {},
      events: [{
        id: "itr:assistant_msg1_weird_sound",
        title: "调查【奇怪的响声】",
        checkDice: "1d20",
        dc: 12,
        difficulty: "normal",
        compare: ">=",
        scope: "protagonist",
        rollMode: "manual",
        advantageState: "normal",
        skill: "调查",
        targetType: "object",
        targetLabel: "奇怪的响声",
        targetName: "weird_sound",
        timeLimit: "none",
        desc: "来自交互触发词的即时检定。",
        outcomes: {
          success: "你听出那不是风声。",
          failure: "你没法判断来源。",
        },
        sourceAssistantMsgId: "assistant:msg1:swipe_0:hash",
      }],
      rolls: [{
        rollId: "eroll_1",
        roundId: "round_1",
        eventId: "itr:assistant_msg1_weird_sound",
        eventTitle: "调查【奇怪的响声】",
        diceExpr: "1d20",
        result: {
          rolls: [16],
          keptRolls: [16],
          modifier: 0,
          total: 16,
          rawTotal: 16,
          count: 1,
          sides: 20,
          exploding: false,
          explosionTriggered: false,
        },
        success: true,
        compareUsed: ">=",
        dcUsed: 12,
        advantageStateApplied: "normal",
        resultGrade: "success",
        marginToDc: 4,
        skillModifierApplied: 0,
        statusModifierApplied: 0,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
        targetLabelUsed: "奇怪的响声",
        rolledAt: Date.now(),
        source: "blind_manual_roll",
        visibility: "blind",
        concealResult: true,
        natState: "none",
        revealMode: "instant",
        sourceAssistantMsgId: "assistant:msg1:swipe_0:hash",
      } as EventRollRecordEvent],
    };

    const snapshot = createRoundSummarySnapshotEvent(round, {
      ensureRoundEventTimersSyncedEvent: () => undefined,
      getSettingsEvent: () => createSettings(),
      getLatestRollRecordForEvent: (currentRound, eventId) => currentRound.rolls.find((item) => item.eventId === eventId) ?? null,
      resolveTriggeredOutcomeEvent: (event, record) => ({
        kind: record?.success ? "success" : "failure",
        text: record?.success ? String(event.outcomes?.success || "") : String(event.outcomes?.failure || ""),
        explosionTriggered: false,
      }),
      normalizeCompareOperatorEvent: (raw) => raw,
    });

    const blocks = buildSummaryBlockFromHistoryEvent(
      [snapshot],
      "balanced",
      1,
      true,
      createSettings(),
      {
        SUMMARY_HISTORY_ROUNDS_MAX_Event: 6,
        SUMMARY_HISTORY_ROUNDS_MIN_Event: 1,
        SUMMARY_MAX_EVENTS_Event: 20,
        SUMMARY_MAX_TOTAL_EVENT_LINES_Event: 40,
        DICE_SUMMARY_BLOCK_START_Event: "<summary>",
        DICE_SUMMARY_BLOCK_END_Event: "</summary>",
        DICE_BLIND_SUMMARY_BLOCK_START_Event: "<blind>",
        DICE_BLIND_SUMMARY_BLOCK_END_Event: "</blind>",
      }
    );

    expect(blocks.blindSummaryText).toContain("已即时反馈");
    expect(blocks.blindSummaryText).toContain("你听出那不是风声。");
    expect(blocks.blindSummaryText).not.toContain("来自交互触发词的即时检定。");
  });
});
