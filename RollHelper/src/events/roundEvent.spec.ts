import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DiceResult,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventRollRecordEvent,
  CompareOperatorEvent,
  PendingRoundEvent,
  InteractiveTriggerEvent,
} from "../types/eventDomainEvent";
import {
  autoRollEventsByAiModeEvent,
  invalidatePendingRoundFloorEvent,
  mergeEventsIntoPendingRoundEvent,
  performInteractiveTriggerRollEvent,
  type MergeEventsIntoPendingRoundDepsEvent,
} from "./roundEvent";
import { hideDiceBoxPresentationEvent } from "../core/diceBox";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../core/diceBox", () => ({
  playRollAnimation: vi.fn(async (): Promise<void> => undefined),
  hideDiceBoxPresentationEvent: vi.fn(async (): Promise<void> => undefined),
}));

/**
 * 功能：为无浏览器环境的单测安装最小 document 桩对象，使视觉收尾逻辑可以进入执行分支。
 * @returns void：无返回值。
 */
function installMinimalDocumentEvent(): void {
  const testGlobal = globalThis as typeof globalThis & { document?: Document };
  testGlobal.document = {} as Document;
}

/**
 * 功能：构造最小可运行的设置对象，供 round 相关单测复用。
 * @returns DicePluginSettingsEvent：测试使用的设置对象。
 */
function buildSettingsEvent(): DicePluginSettingsEvent {
  return {
    enabled: true,
    autoSendRuleToAI: false,
    enableAiRollMode: true,
    enableAiRoundControl: false,
    enable3DDiceBox: false,
    enableRerollFeature: true,
    enableExplodingDice: true,
    enableAdvantageSystem: true,
    enableDynamicResultGuidance: false,
    enableDynamicDcReason: false,
    enableStatusSystem: false,
    aiAllowedDiceSidesText: "20",
    theme: "default",
    summaryDetailMode: "balanced",
    summaryHistoryRounds: 5,
    eventApplyScope: "all",
    enableOutcomeBranches: true,
    enableExplodeOutcomeBranch: true,
    includeOutcomeInSummary: true,
    showOutcomePreviewInListCard: true,
    enableTimeLimit: false,
    enableAiUrgencyHint: false,
    timeLimitDefaultUrgency: "normal",
    timeLimitUrgencyLowSeconds: 30,
    timeLimitUrgencyNormalSeconds: 30,
    timeLimitUrgencyHighSeconds: 30,
    timeLimitUrgencyCriticalSeconds: 30,
    enableSkillSystem: true,
    enableInteractiveTriggers: false,
    enableSelectionFallbackTriggers: false,
    selectionFallbackLimitMode: "char_count",
    selectionFallbackMaxPerRound: 3,
    selectionFallbackMaxPerFloor: 2,
    selectionFallbackMinTextLength: 2,
    selectionFallbackMaxTextLength: 10,
    selectionFallbackMaxSegments: 2,
    selectionFallbackLongSentenceThreshold: 26,
    selectionFallbackMaxTotalLength: 45,
    selectionFallbackLongSentenceSplitPunctuationText: "，。！？；",
    selectionFallbackSingleAction: "检定",
    selectionFallbackSingleSkill: "观察",
    enableSelectionFallbackDebugInfo: false,
    interactiveTriggerMode: "ai_markup",
    enableBlindRoll: false,
    defaultBlindSkillsText: "",
    maxBlindRollsPerRound: 3,
    maxQueuedBlindGuidance: 3,
    blindGuidanceTtlSeconds: 180,
    enableBlindGuidanceDedup: true,
    blindDedupScope: "same_round",
    blindEventCardVisibilityMode: "remove",
    maxBlindGuidanceInjectedPerPrompt: 2,
    enableBlindDebugInfo: false,
    blindHistoryDisplayConsumedAsNarrativeApplied: false,
    blindHistoryAutoArchiveEnabled: false,
    blindHistoryAutoArchiveAfterHours: 24,
    blindHistoryShowFloorKey: false,
    blindHistoryShowOrigin: false,
    enablePassiveCheck: false,
    passiveFormulaBase: 10,
    passiveSkillAliasesText: "",
    enableNarrativeCostEnforcement: false,
    worldbookPassiveMode: "disabled",
    blindUiWarnInConsole: false,
    blindRevealInSummary: false,
    skillTableText: "{}",
    skillPresetStoreText: "{\"version\":1,\"activePresetId\":\"\",\"presets\":[]}",
    promptVerbosityMode: "compact",
    ruleTextModeVersion: 1,
    ruleText: "",
  };
}

/**
 * 功能：创建顺序递增的测试 ID 工厂，便于断言新旧轮次实例是否被替换。
 * @returns (prefix: string) => string：测试 ID 生成函数。
 */
function createIdFactoryEvent(): (prefix: string) => string {
  let seed = 0;
  return (prefix: string): string => {
    seed += 1;
    return `${prefix}_${seed}`;
  };
}

/**
 * 功能：构造绑定到指定楼层的自动事件定义。
 * @param assistantMsgId 楼层对应的助手消息标识。
 * @param eventId 事件 ID。
 * @returns DiceEventSpecEvent：自动事件定义。
 */
function buildAutoEventSpecEvent(
  assistantMsgId: string,
  eventId = "auto_event"
): DiceEventSpecEvent {
  return {
    id: eventId,
    title: eventId,
    checkDice: "1d20",
    dc: 10,
    compare: ">=",
    skill: "观察",
    targetType: "scene",
    targetLabel: "前方道路",
    desc: "自动检定",
    rollMode: "auto",
    sourceAssistantMsgId: assistantMsgId,
  };
}

/**
 * 功能：构造最小掷骰结果，供自动掷骰测试复用。
 * @returns DiceResult：测试用掷骰结果。
 */
function buildDiceResultEvent(): DiceResult {
  return {
    expr: "1d20",
    count: 1,
    sides: 20,
    modifier: 0,
    rolls: [14],
    rawTotal: 14,
    total: 14,
    exploding: false,
    explosionTriggered: false,
    sourceEngine: "native",
  };
}

/**
 * 功能：构造最小结算记录，便于验证楼层失效后 round 是否会被真正移除。
 * @param round 当前轮次。
 * @param event 当前事件。
 * @returns EventRollRecordEvent：最小结算记录。
 */
function buildRollRecordEvent(round: PendingRoundEvent, event: DiceEventSpecEvent): EventRollRecordEvent {
  return {
    rollId: "eroll_old",
    roundId: round.roundId,
    eventId: event.id,
    eventTitle: event.title,
    diceExpr: event.checkDice,
    result: buildDiceResultEvent(),
    success: true,
    compareUsed: ">=",
    dcUsed: 10,
    advantageStateApplied: "normal",
    resultGrade: "success",
    marginToDc: 4,
    skillModifierApplied: 0,
    statusModifierApplied: 0,
    baseModifierUsed: 0,
    finalModifierUsed: 0,
    targetLabelUsed: event.targetLabel,
    rolledAt: 1,
    source: "ai_auto_roll",
    visibility: "public",
    concealResult: false,
    natState: "none",
    timeoutAt: null,
    explodePolicyApplied: "not_requested",
    explodePolicyReason: "未请求爆骰。",
    sourceAssistantMsgId: event.sourceAssistantMsgId,
  };
}

beforeEach(() => {
  installMinimalDocumentEvent();
  vi.mocked(hideDiceBoxPresentationEvent).mockClear();
});

describe("roundEvent 并发保护", () => {
  it("交互暗骰会保留结算记录，但不加入当前事件列表展示", async () => {
    const meta: DiceMetaEvent = {};
    const settings = {
      ...buildSettingsEvent(),
      enableBlindRoll: true,
      defaultBlindSkillsText: "观察",
    };
    const trigger: InteractiveTriggerEvent = {
      triggerId: "trigger_blind_1",
      label: "门后的动静",
      action: "观察",
      skill: "观察",
      blind: true,
      sourceMessageId: "assistant_idx:3:swipe_1:hash_new",
      sourceFloorKey: "assistant_idx:3",
      sourceId: "noise_behind_door",
      occurrenceIndex: 0,
      textRange: null,
      dcHint: 10,
      difficulty: "normal",
      loreType: "线索",
      note: "测试暗骰",
      diceExpr: "1d20",
      compare: ">=",
      revealMode: "delayed",
      triggerPackSourceId: "pack_1",
      triggerPackSuccessText: "你捕捉到了异常。",
      triggerPackFailureText: "你没能确认异常来源。",
      triggerPackExplodeText: "你立刻锁定了异常源头。",
    };

    const result = await performInteractiveTriggerRollEvent(trigger, {
      sweepTimeoutFailuresEvent: (): boolean => false,
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      ensureRoundEventTimersSyncedEvent: (): void => undefined,
      recordTimeoutFailureIfNeededEvent: (): EventRollRecordEvent | null => null,
      saveMetadataSafeEvent: (): void => undefined,
      getLatestRollRecordForEvent: (round: PendingRoundEvent, eventId: string): EventRollRecordEvent | null =>
        round.rolls.find((record) => record.eventId === eventId) ?? null,
      refreshAllWidgetsFromStateEvent: (): void => undefined,
      refreshCountdownDomEvent: (): void => undefined,
      rollDiceEvent: async (): Promise<DiceResult> => buildDiceResultEvent(),
      parseDiceExpression: (): { count: number; sides: number; modifier: number; explode: boolean } => ({
        count: 1,
        sides: 20,
        modifier: 0,
        explode: false,
      }),
      getSettingsEvent: (): DicePluginSettingsEvent => settings,
      resolveSkillModifierBySkillNameEvent: (): number => 0,
      applySkillModifierToDiceResultEvent: (diceResult: DiceResult) => ({
        result: diceResult,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
      }),
      saveLastRoll: (): void => undefined,
      normalizeCompareOperatorEvent: (): CompareOperatorEvent => ">=",
      evaluateSuccessEvent: (total: number, _compare: CompareOperatorEvent, dc: number | null): boolean =>
        total >= Number(dc ?? 0),
      createIdEvent: (prefix: string): string => `${prefix}_test`,
    });

    expect(result.event.listVisibility).toBe("hidden");
    expect(result.event.closedAt).toBeGreaterThan(0);
    expect(meta.pendingRound?.events).toHaveLength(1);
    expect(meta.pendingRound?.events[0]?.listVisibility).toBe("hidden");
    expect(meta.pendingRound?.events[0]?.closedAt).toBeGreaterThan(0);
    expect(meta.pendingRound?.rolls).toHaveLength(1);
    expect(result.record.visibility).toBe("blind");
  });

  it("楼层被清空后会直接移除空的 pendingRound", () => {
    const assistantMsgId = "assistant_idx:2:swipe_1:hash_old";
    const round: PendingRoundEvent = {
      roundId: "round_old",
      instanceToken: "rinst_old",
      status: "open",
      events: [],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [],
      sourceFloorKey: "assistant_idx:2",
      openedAt: 1,
    };
    const event = buildAutoEventSpecEvent(assistantMsgId, "travel_old");
    const record = buildRollRecordEvent(round, event);
    round.events = [event];
    round.rolls = [record];
    round.eventTimers = {
      [event.id]: {
        offeredAt: 1,
        deadlineAt: 100,
      },
    };
    round.sourceAssistantMsgIds = [assistantMsgId];
    const meta: DiceMetaEvent = {
      pendingRound: round,
      pendingResultGuidanceQueue: [
        {
          rollId: record.rollId,
          roundId: round.roundId,
          eventId: event.id,
          eventTitle: event.title,
          targetLabel: event.targetLabel,
          resultGrade: "success",
          marginToDc: 4,
          total: 14,
          dcUsed: 10,
          compareUsed: ">=",
          advantageStateApplied: "normal",
          source: "ai_auto_roll",
          rolledAt: 1,
        },
      ],
    };
    const saveMetadataSafeEvent = vi.fn();

    const changed = invalidatePendingRoundFloorEvent(assistantMsgId, {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent,
    });

    expect(changed).toBe(true);
    expect(meta.pendingRound).toBeUndefined();
    expect(meta.pendingResultGuidanceQueue).toEqual([]);
    expect(saveMetadataSafeEvent).toHaveBeenCalledTimes(1);
  });

  it("楼层失效时会同步清理该楼层生成的状态效果", () => {
    const assistantMsgId = "assistant_idx:2:swipe_1:hash_old";
    const otherAssistantMsgId = "assistant_idx:3:swipe_1:hash_other";
    const round: PendingRoundEvent = {
      roundId: "round_old",
      instanceToken: "rinst_old",
      status: "open",
      events: [buildAutoEventSpecEvent(assistantMsgId, "travel_old")],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant_idx:2",
      openedAt: 1,
    };
    const meta: DiceMetaEvent = {
      pendingRound: round,
      activeStatuses: [
        {
          name: "伤势恶化",
          modifier: -3,
          remainingRounds: 3,
          scope: "all",
          skills: [],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          source: "ai_tag",
          sourceAssistantMsgId: assistantMsgId,
          sourceFloorKey: "assistant_idx:2",
        },
        {
          name: "鼓舞",
          modifier: 2,
          remainingRounds: 2,
          scope: "all",
          skills: [],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          source: "ai_tag",
          sourceAssistantMsgId: otherAssistantMsgId,
          sourceFloorKey: "assistant_idx:3",
        },
        {
          name: "手动状态",
          modifier: 1,
          remainingRounds: null,
          scope: "all",
          skills: [],
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          source: "manual_editor",
        },
      ],
    };
    const saveMetadataSafeEvent = vi.fn();

    const changed = invalidatePendingRoundFloorEvent(assistantMsgId, {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent,
    });

    expect(changed).toBe(true);
    expect(meta.activeStatuses?.map((item) => item.name)).toEqual(["鼓舞", "手动状态"]);
    expect(saveMetadataSafeEvent).toHaveBeenCalledTimes(1);
  });

  it("合并新楼层事件时会创建全新的 round 实例而不是复用旧对象", () => {
    const createIdEvent = createIdFactoryEvent();
    const meta: DiceMetaEvent = {
      pendingRound: {
        roundId: "round_old",
        instanceToken: "rinst_old",
        status: "open",
        events: [],
        rolls: [],
        eventTimers: {},
        sourceAssistantMsgIds: [],
        sourceFloorKey: "assistant_idx:1",
        openedAt: 1,
      },
    };
    const oldRound = meta.pendingRound;
    const saveMetadataSafeEvent = vi.fn();
    const assistantMsgId = "assistant_idx:2:swipe_5:hash_new";
    const mergeDeps: MergeEventsIntoPendingRoundDepsEvent = {
      getSettingsEvent: (): DicePluginSettingsEvent => buildSettingsEvent(),
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      createIdEvent,
      resolveEventTimeLimitByUrgencyEvent: (): {
        urgency: DiceEventSpecEvent["urgency"];
        timeLimitMs: number | null;
        timeLimit: string;
      } => ({
        urgency: "normal",
        timeLimitMs: null,
        timeLimit: "none",
      }),
      resolveEventTargetEvent: (): {
        targetType: DiceEventSpecEvent["targetType"];
        targetName?: string;
        targetLabel: string;
      } => ({
        targetType: "scene",
        targetLabel: "前方道路",
      }),
      saveMetadataSafeEvent,
    };

    const nextRound = mergeEventsIntoPendingRoundEvent(
      [buildAutoEventSpecEvent(assistantMsgId, "travel_new")],
      assistantMsgId,
      mergeDeps
    );

    expect(nextRound).not.toBe(oldRound);
    expect(nextRound.roundId).not.toBe("round_old");
    expect(nextRound.instanceToken).not.toBe("rinst_old");
    expect(nextRound.sourceFloorKey).toBe("assistant_idx:2");
    expect(nextRound.sourceAssistantMsgIds).toEqual([assistantMsgId]);
    expect(meta.pendingRound).toBe(nextRound);
    expect(saveMetadataSafeEvent).toHaveBeenCalledTimes(1);
  });

  it("旧自动掷骰在楼层失效后不会再把结果回写到当前运行态", async () => {
    const assistantMsgId = "assistant_idx:2:swipe_8:hash_old";
    const round: PendingRoundEvent = {
      roundId: "round_live",
      instanceToken: "rinst_live",
      status: "open",
      events: [buildAutoEventSpecEvent(assistantMsgId, "forced_march")],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant_idx:2",
      openedAt: 1,
    };
    const meta: DiceMetaEvent = {
      pendingRound: round,
    };
    const saveMetadataSafeEvent = vi.fn();
    const saveLastRoll = vi.fn();
    let resolveRollEvent!: (value: DiceResult) => void;
    const rollPromise = new Promise<DiceResult>((resolve: (value: DiceResult) => void) => {
      resolveRollEvent = resolve;
    });

    const autoRollTask = autoRollEventsByAiModeEvent(round, {
      getSettingsEvent: (): DicePluginSettingsEvent => buildSettingsEvent(),
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      ensureRoundEventTimersSyncedEvent: (): void => undefined,
      getLatestRollRecordForEvent: (): EventRollRecordEvent | null => null,
      rollDiceEvent: async (): Promise<DiceResult> => rollPromise,
      parseDiceExpression: (): {
        count: number;
        sides: number;
        modifier: number;
        explode: boolean;
      } => ({
        count: 1,
        sides: 20,
        modifier: 0,
        explode: false,
      }),
      resolveSkillModifierBySkillNameEvent: (): number => 0,
      applySkillModifierToDiceResultEvent: (result: DiceResult) => ({
        result,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
      }),
      normalizeCompareOperatorEvent: (): CompareOperatorEvent => ">=",
      evaluateSuccessEvent: (total: number, _compare: CompareOperatorEvent, dc: number | null): boolean => total >= Number(dc ?? 0),
      createIdEvent: (): string => "eroll_new",
      buildEventRollResultCardEvent: (): string => "<div>card</div>",
      saveLastRoll,
      saveMetadataSafeEvent,
    });

    const invalidated = invalidatePendingRoundFloorEvent(assistantMsgId, {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent,
    });
    resolveRollEvent(buildDiceResultEvent());
    const cards = await autoRollTask;

    expect(invalidated).toBe(true);
    expect(cards).toEqual([]);
    expect(meta.pendingRound).toBeUndefined();
    expect(round.rolls).toEqual([]);
    expect(saveLastRoll).not.toHaveBeenCalled();
    expect(saveMetadataSafeEvent).toHaveBeenCalledTimes(1);
  });

  it("旧自动掷骰失效时会收起 3D 骰盒，避免旧动画停留在界面上", async () => {
    const assistantMsgId = "assistant_idx:2:swipe_8:hash_old";
    const round: PendingRoundEvent = {
      roundId: "round_live_box",
      instanceToken: "rinst_live_box",
      status: "open",
      events: [buildAutoEventSpecEvent(assistantMsgId, "leave_glade")],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant_idx:2",
      openedAt: 1,
    };
    const meta: DiceMetaEvent = {
      pendingRound: round,
    };
    const saveMetadataSafeEvent = vi.fn();
    let resolveRollEvent!: (value: DiceResult) => void;
    const rollPromise = new Promise<DiceResult>((resolve: (value: DiceResult) => void) => {
      resolveRollEvent = resolve;
    });

    const autoRollTask = autoRollEventsByAiModeEvent(round, {
      getSettingsEvent: (): DicePluginSettingsEvent => ({
        ...buildSettingsEvent(),
        enable3DDiceBox: true,
      }),
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      ensureRoundEventTimersSyncedEvent: (): void => undefined,
      getLatestRollRecordForEvent: (): EventRollRecordEvent | null => null,
      rollDiceEvent: async (): Promise<DiceResult> => rollPromise,
      parseDiceExpression: (): {
        count: number;
        sides: number;
        modifier: number;
        explode: boolean;
      } => ({
        count: 1,
        sides: 20,
        modifier: 0,
        explode: false,
      }),
      resolveSkillModifierBySkillNameEvent: (): number => 0,
      applySkillModifierToDiceResultEvent: (result: DiceResult) => ({
        result,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
      }),
      normalizeCompareOperatorEvent: (): CompareOperatorEvent => ">=",
      evaluateSuccessEvent: (total: number, _compare: CompareOperatorEvent, dc: number | null): boolean => total >= Number(dc ?? 0),
      createIdEvent: (): string => "eroll_box",
      buildEventRollResultCardEvent: (): string => "<div>card</div>",
      saveLastRoll: vi.fn(),
      saveMetadataSafeEvent,
    });

    invalidatePendingRoundFloorEvent(assistantMsgId, {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent,
    });
    resolveRollEvent({
      ...buildDiceResultEvent(),
      sourceEngine: "dice_box",
    });
    const cards = await autoRollTask;

    expect(cards).toEqual([]);
    expect(hideDiceBoxPresentationEvent).toHaveBeenCalledTimes(1);
  });

  it("有效 round 的自动掷骰完成后会同时保留事件与结果", async () => {
    const assistantMsgId = "assistant_idx:2:swipe_9:hash_new";
    const round: PendingRoundEvent = {
      roundId: "round_ok",
      instanceToken: "rinst_ok",
      status: "open",
      events: [buildAutoEventSpecEvent(assistantMsgId, "move_forward")],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant_idx:2",
      openedAt: 1,
    };
    const meta: DiceMetaEvent = {
      pendingRound: round,
    };
    const saveMetadataSafeEvent = vi.fn();
    const saveLastRoll = vi.fn();

    const cards = await autoRollEventsByAiModeEvent(round, {
      getSettingsEvent: (): DicePluginSettingsEvent => buildSettingsEvent(),
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      ensureRoundEventTimersSyncedEvent: (): void => undefined,
      getLatestRollRecordForEvent: (): EventRollRecordEvent | null => null,
      rollDiceEvent: async (): Promise<DiceResult> => buildDiceResultEvent(),
      parseDiceExpression: (): {
        count: number;
        sides: number;
        modifier: number;
        explode: boolean;
      } => ({
        count: 1,
        sides: 20,
        modifier: 0,
        explode: false,
      }),
      resolveSkillModifierBySkillNameEvent: (): number => 0,
      applySkillModifierToDiceResultEvent: (result: DiceResult) => ({
        result,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
      }),
      normalizeCompareOperatorEvent: (): CompareOperatorEvent => ">=",
      evaluateSuccessEvent: (total: number, _compare: CompareOperatorEvent, dc: number | null): boolean => total >= Number(dc ?? 0),
      createIdEvent: (): string => "eroll_ok",
      buildEventRollResultCardEvent: (): string => "<div>card</div>",
      saveLastRoll,
      saveMetadataSafeEvent,
    });

    expect(cards).toEqual(["<div>card</div>"]);
    expect(meta.pendingRound).toBe(round);
    expect(round.events.map((item) => item.id)).toEqual(["move_forward"]);
    expect(round.rolls.map((item) => item.eventId)).toEqual(["move_forward"]);
    expect(saveLastRoll).toHaveBeenCalledTimes(1);
    expect(saveMetadataSafeEvent).toHaveBeenCalledTimes(1);
  });
});
