import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  PendingRoundEvent,
  RollHelperChatRecordEvent,
  TavernMessageEvent,
  EventRollRecordEvent,
  RoundSummarySnapshotEvent,
} from "../types/eventDomainEvent";
import type {
  EventHooksDepsEvent as RuntimeEventHooksDepsEvent,
} from "./hooksEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../_Components/sharedTooltip", () => ({
  ensureSharedTooltip: vi.fn(),
}));

vi.mock("../../../SDK/toolbar", () => ({
  SDK_FLOATING_TOOLBAR_ID: "mock-toolbar",
  ensureSdkFloatingToolbar: vi.fn(),
}));

vi.mock("../Components/rollConsoleEvent", () => ({
  jumpToTriggerFromDatasetEvent: vi.fn(),
}));

vi.mock("../settings/skillEditorUiEvent", () => ({
  copyTextToClipboardEvent: vi.fn(),
}));

import {
  buildAssistantMessageIdEvent,
  clearDiceMetaEventState,
  rebuildAssistantFloorLifecycleEvent,
  reconcileTrackedAssistantFloorsEvent,
} from "./hooksEvent";
import {
  invalidatePendingRoundFloorEvent,
} from "./roundEvent";

type HooksTestDepsBundleEvent = {
  deps: RuntimeEventHooksDepsEvent;
  autoRollSpy: ReturnType<typeof vi.fn>;
  mergeEventsSpy: ReturnType<typeof vi.fn>;
  persistChatSpy: ReturnType<typeof vi.fn>;
  saveMetadataSpy: ReturnType<typeof vi.fn>;
};

/**
 * 功能：为无 DOM 的单测环境安装最小 document 桩对象。
 * @returns void：无返回值。
 */
function installMinimalDocumentEvent(): void {
  const testGlobal = globalThis as typeof globalThis & { document?: Document };
  testGlobal.document = {
    getElementById: (): null => null,
  } as unknown as Document;
}

/**
 * 功能：为指定消息安装带卡片挂件的最小 DOM 桩对象，便于断言生成阶段是否错误移除了卡片。
 * @param messageIndex 助手消息索引。
 * @param widgetCount 需要挂载的卡片数量。
 * @returns 可用于读取已移除卡片数量的访问器。
 */
function installWidgetDocumentEvent(
  messageIndex: number,
  widgetCount = 1
): { getRemovedCount: () => number } {
  let removedCount = 0;
  const widgets = Array.from({ length: Math.max(0, widgetCount) }, () => ({
    remove: (): void => {
      removedCount += 1;
    },
  })) as unknown as HTMLElement[];
  const mesElement = {
    querySelector: (): HTMLElement | null => null,
    querySelectorAll: (selector: string): HTMLElement[] => (
      selector === ".st-rh-widget-container" ? widgets : []
    ),
  } as unknown as HTMLElement;
  const chatRoot = {
    querySelector: (selector: string): HTMLElement | null => {
      if (
        selector === `.mes[mesid="${messageIndex}"]`
        || selector === `.mes[data-message-id="${messageIndex}"]`
        || selector === `.mes[data-mesid="${messageIndex}"]`
      ) {
        return mesElement;
      }
      return null;
    },
  } as unknown as HTMLElement;
  const testGlobal = globalThis as typeof globalThis & { document?: Document };
  testGlobal.document = {
    getElementById: (id: string): HTMLElement | null => (id === "chat" ? chatRoot : null),
  } as unknown as Document;
  return {
    getRemovedCount: (): number => removedCount,
  };
}

/**
 * 功能：构造带稳定助手消息标识的测试消息。
 * @param assistantMsgId 助手消息标识。
 * @param text 消息正文。
 * @returns TavernMessageEvent：测试消息对象。
 */
function buildAssistantMessageEvent(
  assistantMsgId: string,
  text: string
): TavernMessageEvent {
  return {
    role: "assistant",
    mes: text,
    mockAssistantMsgId: assistantMsgId,
  } as TavernMessageEvent;
}

/**
 * 功能：构造当前激活 swipe 为对象结构的测试消息。
 * @param assistantMsgId 助手消息标识。
 * @param swipeText 当前激活 swipe 的正文。
 * @param baseText 消息本体正文。
 * @returns TavernMessageEvent：测试消息对象。
 */
function buildAssistantMessageWithObjectSwipeEvent(
  assistantMsgId: string,
  swipeText: string,
  baseText = ""
): TavernMessageEvent {
  return {
    role: "assistant",
    mes: baseText,
    swipe_id: 0,
    swipes: [
      {
        mes: swipeText,
      },
    ],
    mockAssistantMsgId: assistantMsgId,
  } as TavernMessageEvent;
}

/**
 * 功能：统一读取测试消息当前生效正文，兼容对象型 swipe。
 * @param message 测试消息对象。
 * @returns string：当前生效正文。
 */
function getActiveAssistantMessageTextForTestEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const swipeId = Number((message as any).swipe_id ?? (message as any).swipeId);
  const swipes = (message as any).swipes;
  if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
    const activeSwipe = swipes[swipeId];
    if (typeof activeSwipe === "string" && activeSwipe.trim()) {
      return activeSwipe;
    }
    if (activeSwipe && typeof activeSwipe === "object") {
      const swipeRecord = activeSwipe as Record<string, unknown>;
      const textCandidates = [swipeRecord.mes, swipeRecord.content, swipeRecord.text];
      for (const candidate of textCandidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate;
        }
      }
    }
  }
  return String((message as any).mes ?? "");
}

/**
 * 功能：构造最小事件定义，便于在楼层对账测试中复用。
 * @param eventId 事件标识。
 * @param assistantMsgId 楼层对应的助手消息标识。
 * @returns DiceEventSpecEvent：事件定义对象。
 */
function buildEventSpecEvent(
  eventId: string,
  assistantMsgId: string
): DiceEventSpecEvent {
  return {
    id: eventId,
    title: eventId,
    checkDice: "1d20",
    dc: 10,
    compare: ">=",
    skill: "观察",
    targetType: "scene",
    targetLabel: "房间",
    desc: "测试事件",
    sourceAssistantMsgId: assistantMsgId,
  };
}

/**
 * 功能：构造最小结算记录，用于验证旧楼层结果是否被正确清除。
 * @param roundId 轮次标识。
 * @param event 事件定义。
 * @returns EventRollRecordEvent：结算记录对象。
 */
function buildRollRecordEvent(
  roundId: string,
  event: DiceEventSpecEvent
): EventRollRecordEvent {
  return {
    rollId: `${event.id}_roll`,
    roundId,
    eventId: event.id,
    eventTitle: event.title,
    diceExpr: event.checkDice,
    result: {
      expr: event.checkDice,
      rolls: [12],
      modifier: 0,
      rawTotal: 12,
      total: 12,
      sides: 20,
      count: 1,
      exploding: false,
      explosionTriggered: false,
    },
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
    targetLabelUsed: event.targetLabel,
    rolledAt: 1,
    source: "manual_roll",
    visibility: "public",
    concealResult: false,
    natState: "none",
    timeoutAt: null,
    explodePolicyApplied: "not_requested",
    explodePolicyReason: "未请求爆骰。",
    sourceAssistantMsgId: event.sourceAssistantMsgId,
  };
}

/**
 * 功能：构造带旧楼层事件、结果与历史快照的元数据，便于验证重生成清理行为。
 * @param assistantMsgId 旧楼层的助手消息标识。
 * @returns DiceMetaEvent：测试用元数据。
 */
function buildMetaEvent(assistantMsgId: string): DiceMetaEvent {
  const oldEvent = buildEventSpecEvent("old_event", assistantMsgId);
  const oldRecord = buildRollRecordEvent("round_old", oldEvent);
  const summarySnapshot: RoundSummarySnapshotEvent = {
    roundId: "summary_old",
    openedAt: 1,
    closedAt: 2,
    eventsCount: 1,
    rolledCount: 1,
    sourceAssistantMsgIds: [assistantMsgId],
    events: [
      {
        id: oldEvent.id,
        title: oldEvent.title,
        desc: oldEvent.desc,
        targetLabel: oldEvent.targetLabel,
        skill: oldEvent.skill,
        checkDice: oldEvent.checkDice,
        compare: ">=",
        dc: 10,
        dcReason: "",
        rollMode: "manual",
        advantageState: "normal",
        timeLimit: "none",
        status: "done",
        resultSource: "manual_roll",
        total: 12,
        skillModifierApplied: 0,
        statusModifierApplied: 0,
        baseModifierUsed: 0,
        finalModifierUsed: 0,
        success: true,
        marginToDc: 2,
        resultGrade: "success",
        outcomeKind: "success",
        outcomeText: "旧结果",
        explosionTriggered: false,
        sourceAssistantMsgId: assistantMsgId,
        rollId: oldRecord.rollId,
        rolledAt: oldRecord.rolledAt,
      },
    ],
  };

  return {
    pendingRound: {
      roundId: "round_old",
      instanceToken: "rinst_old",
      status: "open",
      events: [oldEvent],
      rolls: [oldRecord],
      eventTimers: {
        [oldEvent.id]: {
          offeredAt: 1,
          deadlineAt: 10,
        },
      },
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant:floor-1",
      openedAt: 1,
    },
    pendingResultGuidanceQueue: [
      {
        rollId: oldRecord.rollId,
        roundId: "round_old",
        eventId: oldEvent.id,
        eventTitle: oldEvent.title,
        targetLabel: oldEvent.targetLabel,
        resultGrade: "success",
        marginToDc: 2,
        total: 12,
        dcUsed: 10,
        compareUsed: ">=",
        advantageStateApplied: "normal",
        source: "manual_roll",
        rolledAt: 1,
      },
    ],
    pendingBlindGuidanceQueue: [
      {
        rollId: "blind_old",
        roundId: "round_old",
        eventId: oldEvent.id,
        eventTitle: oldEvent.title,
        skill: oldEvent.skill,
        diceExpr: oldEvent.checkDice,
        total: 8,
        success: false,
        resultGrade: "failure",
        natState: "none",
        targetLabel: oldEvent.targetLabel,
        rolledAt: 1,
        source: "blind_manual_roll",
        sourceAssistantMsgId: assistantMsgId,
        state: "queued",
      },
    ],
    activeStatuses: [
      {
        name: "旧楼层状态",
        modifier: -2,
        remainingRounds: 2,
        scope: "all",
        skills: [],
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        source: "ai_tag",
        sourceAssistantMsgId: assistantMsgId,
        sourceFloorKey: "assistant:floor-1",
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
}

/**
 * 功能：从消息文本中提取测试事件，模拟重生成后新的楼层内容。
 * @param text 助手消息正文。
 * @returns DiceEventSpecEvent[]：解析得到的事件列表。
 */
function parseEventsFromTextEvent(text: string): DiceEventSpecEvent[] {
  const normalized = String(text ?? "");
  if (!normalized.includes("[event:new_event]")) return [];
  return [
    {
      id: "new_event",
      title: "new_event",
      checkDice: "1d20",
      dc: 12,
      compare: ">=",
      skill: "观察",
      targetType: "scene",
      targetLabel: "大厅",
      desc: "新事件",
    },
  ];
}

/**
 * 功能：构造楼层对账所需的依赖与监视器，便于在单测中断言调用结果。
 * @param meta 当前元数据。
 * @param chat 当前聊天消息列表。
 * @returns HooksTestDepsBundleEvent：依赖对象与监视器集合。
 */
function buildDepsBundleEvent(
  meta: DiceMetaEvent,
  chat: TavernMessageEvent[]
): HooksTestDepsBundleEvent {
  const persistChatSpy = vi.fn();
  const saveMetadataSpy = vi.fn();
  const autoRollSpy = vi.fn(async (): Promise<string[]> => []);
  const mergeEventsSpy = vi.fn((events: DiceEventSpecEvent[], assistantMsgId: string): PendingRoundEvent => {
    const nextRound: PendingRoundEvent = {
      roundId: "round_new",
      instanceToken: "rinst_new",
      status: "open",
      events: events.map((event) => ({
        ...event,
        sourceAssistantMsgId: assistantMsgId,
      })),
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [assistantMsgId],
      sourceFloorKey: "assistant:floor-1",
      openedAt: 100,
    };
    meta.pendingRound = nextRound;
    return nextRound;
  });

  const stubChatData: RollHelperChatRecordEvent = {
    meta: { schemaVersion: 1, updatedAt: 0, openRoundId: null, lastProcessedFloorId: null, lastUserMessageId: null },
    floorOrder: [],
    floors: {},
    rounds: { order: [], records: {} },
    skills: { activePresetId: "", currentSkillTableText: "", presetStore: { presets: {} }, updatedAt: 0 },
    statuses: { order: [], records: {}, current: { snapshot: [], appliedAt: 0 } },
  };

  const deps: RuntimeEventHooksDepsEvent = {
    getLiveContextEvent: (): any => ({ chat }),
    eventSource: {},
    event_types: undefined,
    getActiveChatIdEvent: (): string => "test-chat-id",
    getCurrentChatDataEvent: (): RollHelperChatRecordEvent => stubChatData,
    getSettingsEvent: () => ({
      enabled: true,
      eventApplyScope: "all" as const,
      enableAiRoundControl: false,
      defaultBlindSkillsText: "",
    }),
    getDiceMetaEvent: (): DiceMetaEvent => meta,
    isAssistantMessageEvent: (message: TavernMessageEvent | undefined): boolean => String(message?.role ?? "") === "assistant",
    buildAssistantMessageIdEvent: (message: TavernMessageEvent): string => String((message as TavernMessageEvent & { mockAssistantMsgId?: string }).mockAssistantMsgId ?? ""),
    buildAssistantFloorKeyEvent: (assistantMsgId: string): string | null => {
      const parts = String(assistantMsgId ?? "").split(":");
      if (parts.length < 2) return null;
      return `${parts[0]}:${parts[1]}`;
    },
    getStableAssistantOriginalSourceTextEvent: (): string => "",
    getHostOriginalSourceTextEvent: (): string => "",
    getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined): string => (
      getActiveAssistantMessageTextForTestEvent(message)
    ),
    getMessageTextEvent: (message: TavernMessageEvent | undefined): string => (
      getActiveAssistantMessageTextForTestEvent(message)
    ),
    parseEventEnvelopesEvent: (text: string) => ({
      events: parseEventsFromTextEvent(text),
      ranges: [],
      shouldEndRound: false,
    }),
    filterEventsByApplyScopeEvent: (events: DiceEventSpecEvent[]): DiceEventSpecEvent[] => events,
    removeRangesEvent: (text: string): string => text,
    setMessageTextEvent: (message: TavernMessageEvent, text: string): void => {
      message.mes = text;
    },
    resetRecentParseFailureLogsEvent: (): void => undefined,
    extractPromptChatFromPayloadEvent: (): any[] | null => null,
    handlePromptReadyEvent: (): void => undefined,
    resetAssistantProcessedStateEvent: (): void => undefined,
    clearDiceMetaEventState: (): void => undefined,
    hideEventCodeBlocksInDomEvent: (): void => undefined,
    persistChatSafeEvent: persistChatSpy,
    mergeEventsIntoPendingRoundEvent: mergeEventsSpy,
    invalidatePendingRoundFloorEvent: (assistantMsgId: string): boolean => invalidatePendingRoundFloorEvent(assistantMsgId, {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent: saveMetadataSpy,
    }),
    autoRollEventsByAiModeEvent: autoRollSpy,
    sweepTimeoutFailuresEvent: (): boolean => false,
    refreshCountdownDomEvent: (): void => undefined,
    loadCurrentChatDatabaseEvent: async (): Promise<void> => undefined,
    loadChatScopedStateIntoRuntimeEvent: async (): Promise<void> => undefined,
    refreshAllWidgetsFromStateEvent: (): void => undefined,
    enhanceInteractiveTriggersInDomEvent: (): void => undefined,
    enhanceAssistantRawSourceButtonsEvent: (): void => undefined,
    saveMetadataSafeEvent: saveMetadataSpy,
    setLastUserMessageIdEvent: async (): Promise<void> => undefined,
  };

  return {
    deps,
    autoRollSpy,
    mergeEventsSpy,
    persistChatSpy,
    saveMetadataSpy,
  };
}

beforeEach(() => {
  installMinimalDocumentEvent();
  vi.useRealTimers();
});

describe("reconcileTrackedAssistantFloorsEvent", () => {
  it("chat_reset 只清空运行时，不会把暗骰历史立即持久化成空", () => {
    const meta = buildMetaEvent("assistant:floor-1:v1:hash-old");
    const saveMetadataSafeEvent = vi.fn();

    clearDiceMetaEventState("chat_reset", {
      getDiceMetaEvent: (): DiceMetaEvent => meta,
      saveMetadataSafeEvent,
    });

    expect(meta.pendingRound).toBeUndefined();
    expect(saveMetadataSafeEvent).not.toHaveBeenCalled();
  });

  it("构建助手消息标识时，优先使用当前显示文本，不触发稳定原文回读", () => {
    const stableGetter = vi.fn((): string => {
      throw new Error("不应在当前场景读取稳定原文");
    });
    const message = buildAssistantMessageEvent("assistant_idx:2:swipe_3:hash", "{\n  \"type\": \"dice_events\",\n  \"events\": [");

    const assistantMsgId = buildAssistantMessageIdEvent(message, 2, {
      simpleHashEvent: (input: string): string => `hash_${input.length}`,
      getStableAssistantOriginalSourceTextEvent: stableGetter,
      getHostOriginalSourceTextEvent: (): string => "",
      getPreferredAssistantSourceTextEvent: (target: TavernMessageEvent | undefined): string => String(target?.mes ?? ""),
      getMessageTextEvent: (target: TavernMessageEvent | undefined): string => String(target?.mes ?? ""),
      parseEventEnvelopesEvent: (): {
        events: DiceEventSpecEvent[];
        ranges: Array<{ start: number; end: number }>;
        shouldEndRound?: boolean;
      } => ({
        events: [],
        ranges: [],
      }),
      removeRangesEvent: (text: string): string => text,
    });

    expect(stableGetter).not.toHaveBeenCalled();
    expect(assistantMsgId).toContain("assistant_idx:2");
  });

  it("type=normal 的 generation_started 只建立生成会话，不会清理当前卡片 UI", async () => {
    const widgetDoc = installWidgetDocumentEvent(0, 1);
    const currentMessage = buildAssistantMessageEvent("assistant:floor-1:v1:hash-old", "旧正文仍在显示");
    const meta = buildMetaEvent("assistant:floor-1:v1:hash-old");
    const chat = [currentMessage];
    const { deps } = buildDepsBundleEvent(meta, chat);

    const started = await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_started",
      eventArgs: ["normal"],
      deps,
    });

    expect(started.changedData).toBe(false);
    expect(started.changedUi).toBe(false);
    expect(started.rebuiltFloorKeys).toEqual([]);
    expect(widgetDoc.getRemovedCount()).toBe(0);
  });

  it("type=swipe 的 generation_started 会立即清理当前楼层卡片 UI", async () => {
    const widgetDoc = installWidgetDocumentEvent(0, 1);
    const currentMessage = buildAssistantMessageEvent("assistant:floor-1:v1:hash-old", "旧正文仍在显示");
    const meta = buildMetaEvent("assistant:floor-1:v1:hash-old");
    const chat = [currentMessage];
    const { deps } = buildDepsBundleEvent(meta, chat);

    const started = await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_started",
      eventArgs: ["swipe"],
      deps,
    });

    expect(started.changedData).toBe(false);
    expect(started.changedUi).toBe(true);
    expect(started.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(widgetDoc.getRemovedCount()).toBe(1);
  });

  it("MESSAGE_RECEIVED 只清理当前楼层旧数据，不会提前挂新事件或自动掷骰", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const newAssistantMsgId = "assistant:floor-1:v2:hash-new";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [buildAssistantMessageEvent(newAssistantMsgId, "楼层已刷新 [event:new_event]")];
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, chat);

    await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_started",
      eventArgs: ["regenerate"],
      deps,
    });

    const cleaned = await rebuildAssistantFloorLifecycleEvent({
      reason: "message_received_cleanup",
      eventArgs: [0],
      deps,
    });

    expect(cleaned.changedData).toBe(true);
    expect(cleaned.changedUi).toBe(false);
    expect(cleaned.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(meta.pendingRound).toBeUndefined();
    expect(meta.pendingResultGuidanceQueue).toEqual([]);
    expect(meta.pendingBlindGuidanceQueue?.map((item) => item.state)).toEqual(["invalidated"]);
    expect(mergeEventsSpy).not.toHaveBeenCalled();
    expect(autoRollSpy).not.toHaveBeenCalled();
  });

  it("GENERATION_ENDED 统一完成 sanitize、事件接管和 UI 刷新", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const newAssistantMsgId = "assistant:floor-1:v2:hash-new";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [buildAssistantMessageEvent(newAssistantMsgId, "楼层已刷新 [event:new_event]")];
    const { deps, autoRollSpy, mergeEventsSpy, persistChatSpy, saveMetadataSpy } = buildDepsBundleEvent(meta, chat);

    await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_started",
      eventArgs: ["normal"],
      deps,
    });
    await rebuildAssistantFloorLifecycleEvent({
      reason: "message_received_cleanup",
      eventArgs: [0],
      deps,
    });

    const finalized = await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_ended_finalize",
      deps,
    });

    expect(finalized.changedData).toBe(true);
    expect(finalized.changedUi).toBe(true);
    expect(finalized.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(meta.pendingRound?.events.map((item) => item.id)).toEqual(["new_event"]);
    expect(meta.pendingRound?.events.map((item) => item.sourceAssistantMsgId)).toEqual([newAssistantMsgId]);
    expect(meta.pendingRound?.sourceAssistantMsgIds).toEqual([newAssistantMsgId]);
    expect(mergeEventsSpy).toHaveBeenCalledTimes(1);
    expect(autoRollSpy).toHaveBeenCalledTimes(1);
    expect(persistChatSpy).toHaveBeenCalled();
    expect(saveMetadataSpy).toHaveBeenCalled();
  });

  it("对象型 swipe 在 GENERATION_ENDED 后也会正确接管事件并刷新卡片", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const newAssistantMsgId = "assistant:floor-1:v2:hash-new";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [
      buildAssistantMessageWithObjectSwipeEvent(
        newAssistantMsgId,
        "楼层已刷新 [event:new_event]",
        "消息本体仍是旧占位文本"
      ),
    ];
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, chat);

    await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_started",
      eventArgs: ["swipe"],
      deps,
    });
    await rebuildAssistantFloorLifecycleEvent({
      reason: "message_received_cleanup",
      eventArgs: [0],
      deps,
    });

    const finalized = await rebuildAssistantFloorLifecycleEvent({
      reason: "generation_ended_finalize",
      deps,
    });

    expect(finalized.changedData).toBe(true);
    expect(finalized.changedUi).toBe(true);
    expect(finalized.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(meta.pendingRound?.events.map((item) => item.id)).toEqual(["new_event"]);
    expect(meta.pendingRound?.sourceAssistantMsgIds).toEqual([newAssistantMsgId]);
    expect(mergeEventsSpy).toHaveBeenCalledTimes(1);
    expect(autoRollSpy).toHaveBeenCalledTimes(1);
  });

  it("hydrate_restore 只恢复 UI，不会在刷新时破坏已有 pendingRound", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [buildAssistantMessageEvent(oldAssistantMsgId, "恢复后的正文")];
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, chat);

    const result = await rebuildAssistantFloorLifecycleEvent({
      reason: "hydrate_restore",
      deps,
    });

    expect(result.changedData).toBe(false);
    expect(result.changedUi).toBe(true);
    expect(result.rebuiltFloorKeys).toEqual([]);
    expect(meta.pendingRound).toBeDefined();
    expect(meta.pendingBlindGuidanceQueue?.map((item) => item.state)).toEqual(["queued"]);
    expect(mergeEventsSpy).not.toHaveBeenCalled();
    expect(autoRollSpy).not.toHaveBeenCalled();
  });

  it("当前楼层重生成且不再包含事件时，会清除旧楼层的结果与历史", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const newAssistantMsgId = "assistant:floor-1:v2:hash-new";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [buildAssistantMessageEvent(newAssistantMsgId, "这是一段不包含事件的新正文")];
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, chat);

    const result = await reconcileTrackedAssistantFloorsEvent("message_edited", deps);

    expect(result.changedData).toBe(true);
    expect(result.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(meta.pendingRound).toBeUndefined();
    expect(meta.pendingResultGuidanceQueue).toEqual([]);
    expect(meta.pendingBlindGuidanceQueue?.map((item) => item.state)).toEqual(["invalidated"]);
    expect(meta.activeStatuses?.map((item) => item.name)).toEqual(["手动状态"]);
    expect(mergeEventsSpy).not.toHaveBeenCalled();
    expect(autoRollSpy).not.toHaveBeenCalled();
  });

  it("当前楼层重生成且包含新事件时，只保留新楼层事件与新消息标识", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const newAssistantMsgId = "assistant:floor-1:v2:hash-new";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const chat = [buildAssistantMessageEvent(newAssistantMsgId, "楼层已刷新 [event:new_event]")];
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, chat);

    const result = await reconcileTrackedAssistantFloorsEvent("message_edited", deps);

    expect(result.changedData).toBe(true);
    expect(meta.pendingRound?.events.map((item) => item.id)).toEqual(["new_event"]);
    expect(meta.pendingRound?.events.map((item) => item.sourceAssistantMsgId)).toEqual([newAssistantMsgId]);
    expect(meta.pendingRound?.rolls).toEqual([]);
    expect(meta.pendingRound?.sourceAssistantMsgIds).toEqual([newAssistantMsgId]);
    expect(meta.pendingRound?.sourceFloorKey).toBe("assistant:floor-1");
    expect(meta.pendingRound?.instanceToken).toBe("rinst_new");
    expect(meta.activeStatuses?.map((item) => item.name)).toEqual(["手动状态"]);
    expect(meta.pendingResultGuidanceQueue).toEqual([]);
    expect(meta.pendingBlindGuidanceQueue?.map((item) => item.state)).toEqual(["invalidated"]);
    expect(mergeEventsSpy).toHaveBeenCalledTimes(1);
    expect(autoRollSpy).toHaveBeenCalledTimes(1);
  });

  it("当前楼层消息被删除时，只执行旧楼层失效，不会重建新楼层", async () => {
    const oldAssistantMsgId = "assistant:floor-1:v1:hash-old";
    const meta = buildMetaEvent(oldAssistantMsgId);
    const { deps, autoRollSpy, mergeEventsSpy } = buildDepsBundleEvent(meta, []);

    const result = await reconcileTrackedAssistantFloorsEvent("message_deleted", deps);

    expect(result.changedData).toBe(true);
    expect(result.rebuiltFloorKeys).toEqual(["assistant:floor-1"]);
    expect(meta.pendingRound).toBeUndefined();
    expect(mergeEventsSpy).not.toHaveBeenCalled();
    expect(autoRollSpy).not.toHaveBeenCalled();
  });
});
