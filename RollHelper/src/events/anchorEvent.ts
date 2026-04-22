import type {
  DiceMetaEvent,
  DiceEventSpecEvent,
  EventRollRecordEvent,
  PendingRoundEvent,
  RollHelperChatRecordEvent,
  RoundSummaryEventItemEvent,
  RoundSummarySnapshotEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import type { DiceResult } from "../types/diceEvent";
import { buildMinimalSummaryItemEvent } from "../settings/storeEvent";
import { logger } from "../../index";

const WIDGET_CONTAINER_CLASS_Event = "st-rh-widget-container";
const WIDGET_CONTAINER_ATTR_Event = "data-rh-widget";

export interface AnchorDepsEvent {
  getLiveContextEvent: () => { chat?: TavernMessageEvent[] } | null;
  getCurrentChatDataEvent: () => RollHelperChatRecordEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  buildEventListCardEvent: (round: PendingRoundEvent) => string;
  buildEventRollResultCardEvent: (
    event: DiceEventSpecEvent,
    record: EventRollRecordEvent
  ) => string;
  getLatestRollRecordForEvent: (
    round: PendingRoundEvent,
    eventId: string
  ) => EventRollRecordEvent | null;
}

export interface RefreshAllWidgetsResultEvent {
  mountedWidgetCount: number;
  hasCurrentFloorWidgets: boolean;
  currentFloorWidgetsMounted: boolean;
  hasHistoryWidgets: boolean;
  historyWidgetsMounted: boolean;
  chatDomReady: boolean;
}

/**
 * 功能：判断一条检定记录是否属于暗骰结果。
 * @param record 检定记录。
 * @returns 若该记录应只显示在暗骰列表中则返回 true。
 */
function isBlindResultRecordEvent(record: EventRollRecordEvent | null | undefined): boolean {
  if (!record) return false;
  return record.visibility === "blind" || record.source === "blind_manual_roll";
}

/**
 * 功能：根据消息标识查找对应的聊天消息节点。
 * @param msgId 运行时记录的 assistant 消息标识。
 * @param chat 当前聊天消息数组。
 * @returns 找到的 `.mes` 节点；找不到时返回 `null`。
 */
export function findMesElementByMsgIdEvent(
  msgId: string,
  chat: TavernMessageEvent[] | undefined
): HTMLElement | null {
  if (!msgId || !Array.isArray(chat)) return null;
  const chatContainer = document.getElementById("chat");
  if (!chatContainer) return null;

  const parts = msgId.split(":");
  if (parts.length < 3) return null;

  const prefix = parts[0];
  const idOrIndex = parts[1];

  if (prefix === "assistant" && idOrIndex) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      const msg = chat[i];
      const explicitId = msg?.id ?? msg?.cid ?? msg?.uid;
      if (explicitId != null && String(explicitId) === idOrIndex) {
        const element = chatContainer.querySelector(`.mes[mesid="${i}"]`) as HTMLElement | null;
        if (element) return element;
      }
    }
  }

  if (prefix === "assistant_ts" && idOrIndex) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
      const msg = chat[i];
      const timestamp =
        (msg as any)?.create_date ??
        (msg as any)?.create_time ??
        (msg as any)?.timestamp ??
        "";
      if (String(timestamp ?? "").trim() === idOrIndex) {
        const element = chatContainer.querySelector(`.mes[mesid="${i}"]`) as HTMLElement | null;
        if (element) return element;
      }
    }
  }

  if (prefix === "assistant_idx" && idOrIndex) {
    const index = Number(idOrIndex);
    if (Number.isFinite(index) && index >= 0 && index < chat.length) {
      return chatContainer.querySelector(`.mes[mesid="${index}"]`) as HTMLElement | null;
    }
  }

  return null;
}

/**
 * 功能：从多个消息标识中找到最后一个可用的聊天消息节点。
 * @param msgIds 可能的 assistant 消息标识列表。
 * @param chat 当前聊天消息数组。
 * @returns 最后一个成功匹配到的 `.mes` 节点；找不到时返回 `null`。
 */
export function findLastMesElementEvent(
  msgIds: string[],
  chat: TavernMessageEvent[] | undefined
): HTMLElement | null {
  if (!Array.isArray(msgIds) || msgIds.length === 0) return null;

  for (let i = msgIds.length - 1; i >= 0; i -= 1) {
    const element = findMesElementByMsgIdEvent(msgIds[i], chat);
    if (element) return element;
  }

  return null;
}

/**
 * 功能：将卡片挂载到指定聊天消息节点下方。
 * @param mesElement 目标消息节点。
 * @param cardHtml 卡片 HTML。
 * @param widgetId 挂件唯一标识。
 * @returns 无返回值。
 */
export function mountWidgetToMesEvent(
  mesElement: HTMLElement,
  cardHtml: string,
  widgetId: string
): void {
  if (!mesElement || !widgetId) return;

  let container = mesElement.querySelector(
    `.${WIDGET_CONTAINER_CLASS_Event}[${WIDGET_CONTAINER_ATTR_Event}="${widgetId}"]`
  ) as HTMLElement | null;

  if (!container) {
    container = document.createElement("div");
    container.className = WIDGET_CONTAINER_CLASS_Event;
    container.setAttribute(WIDGET_CONTAINER_ATTR_Event, widgetId);
    const mesBlock = mesElement.querySelector(".mes_block");
    if (mesBlock) {
      mesBlock.appendChild(container);
    } else {
      mesElement.appendChild(container);
    }
  }

  container.innerHTML = cardHtml;
}

/**
 * 功能：移除指定消息节点下的全部挂件。
 * @param mesElement 目标消息节点。
 * @returns 无返回值。
 */
export function unmountWidgetsFromMesEvent(mesElement: HTMLElement): void {
  if (!mesElement) return;
  const containers = Array.from(mesElement.querySelectorAll(`.${WIDGET_CONTAINER_CLASS_Event}`));
  for (const container of containers) {
    container.remove();
  }
}

/**
 * 功能：移除页面上的全部事件挂件。
 * @returns 无返回值。
 */
export function unmountAllWidgetsEvent(): void {
  const containers = Array.from(document.querySelectorAll(`.${WIDGET_CONTAINER_CLASS_Event}`));
  for (const container of containers) {
    container.remove();
  }
}

/**
 * 功能：从历史摘要事件项的快照字段重建最小 DiceEventSpecEvent + EventRollRecordEvent，
 *       供现有 buildEventRollResultCardEvent 模板函数渲染历史结果卡。
 * @param item 摘要事件项。
 * @param roundId 历史轮次 ID。
 * @returns 重建的 event + record；若无法重建返回 null。
 */
function rebuildEventAndRecordFromSnapshotEvent(
  item: RoundSummaryEventItemEvent,
  roundId: string
): { event: DiceEventSpecEvent; record: EventRollRecordEvent } | null {
  if (!item.rollsSnapshot || !item.rollId) return null;
  const snap = item.rollsSnapshot;

  const event: DiceEventSpecEvent = {
    id: item.id,
    title: item.title,
    checkDice: item.checkDice,
    dc: item.dc,
    difficulty: item.difficulty,
    dcSource: item.dcSource,
    compare: item.compare,
    skill: item.skill,
    targetType: "self",
    targetLabel: item.targetLabel,
    desc: item.desc,
    dcReason: item.dcReason,
    rollMode: item.rollMode,
    advantageState: item.advantageState,
    urgency: item.urgency,
    timeLimit: item.timeLimit,
    outcomes: item.outcomeKind !== "none" ? { [item.outcomeKind]: item.outcomeText } : undefined,
    sourceAssistantMsgId: item.sourceAssistantMsgId,
  };

  const diceResult: DiceResult = {
    expr: item.checkDice,
    rolls: snap.rolls,
    modifier: snap.modifier,
    rawTotal: snap.rawTotal,
    total: snap.total,
    count: snap.count,
    sides: snap.sides,
    selectionMode: "none",
    exploding: snap.exploding,
    explosionTriggered: snap.explosionTriggered,
  };

  const record: EventRollRecordEvent = {
    rollId: item.rollId,
    roundId,
    eventId: item.id,
    eventTitle: item.title,
    diceExpr: item.checkDice,
    result: diceResult,
    success: item.success,
    compareUsed: item.compare,
    dcUsed: item.dc,
    advantageStateApplied: item.advantageState,
    resultGrade: item.resultGrade ?? undefined,
    marginToDc: item.marginToDc,
    skillModifierApplied: item.skillModifierApplied,
    statusModifierApplied: item.statusModifierApplied,
    statusModifiersApplied: item.statusModifiersApplied,
    baseModifierUsed: item.baseModifierUsed,
    finalModifierUsed: item.finalModifierUsed,
    targetLabelUsed: item.targetLabelUsed ?? item.targetLabel,
    rolledAt: item.rolledAt ?? 0,
    source: item.resultSource ?? "manual_roll",
    explodePolicyApplied: (item.explodePolicyApplied as EventRollRecordEvent["explodePolicyApplied"]) ?? "not_requested",
    sourceAssistantMsgId: item.sourceAssistantMsgId,
  };

  return { event, record };
}

function resolveAssistantFloorIdFromAssistantMsgIdEvent(assistantMsgId: unknown): number | null {
  const normalized = String(assistantMsgId ?? "").trim();
  if (!normalized) return null;
  const match = normalized.match(/^assistant_idx:(\d+)(?::|$)/);
  if (!match) return null;
  const floorId = Number(match[1]);
  return Number.isFinite(floorId) && floorId >= 0 ? floorId : null;
}

function isPendingRoundRecordForFloorEvent(
  floorId: number,
  sourceAssistantMsgId: unknown,
  fallbackFloorId: number | null
): boolean {
  const parsedFloorId = resolveAssistantFloorIdFromAssistantMsgIdEvent(sourceAssistantMsgId);
  if (parsedFloorId != null) return parsedFloorId === floorId;
  return fallbackFloorId != null && fallbackFloorId === floorId;
}

/**
 * 功能：把楼层持久化数据重建成当前事件列表渲染所需的最小 PendingRoundEvent。
 * 参数：
 *   floorId：楼层编号。
 *   floor：楼层记录。
 * 返回：
 *   PendingRoundEvent：用于当前事件列表渲染的最小运行时快照。
 */
function buildFloorRuntimeRoundSnapshotEvent(
  floorId: number,
  floor: RollHelperChatRecordEvent["floors"][string],
  pendingRound?: PendingRoundEvent | null
): PendingRoundEvent {
  const persistedEvents = Array.isArray(floor.eventDice?.events)
    ? floor.eventDice.events.map((event) => ({ ...event }))
    : [];
  const persistedRolls = [
    ...(Array.isArray(floor.eventDice?.publicRolls) ? floor.eventDice.publicRolls.map((item) => ({ ...item })) : []),
    ...(Array.isArray(floor.eventDice?.blindRolls) ? floor.eventDice.blindRolls.map((item) => ({ ...item })) : []),
  ];
  const fallbackPendingFloorId = resolveAssistantFloorIdFromAssistantMsgIdEvent(
    pendingRound?.sourceAssistantMsgIds?.[pendingRound.sourceAssistantMsgIds.length - 1]
  );
  const runtimeEvents = Array.isArray(pendingRound?.events)
    ? pendingRound.events
      .filter((event) => isPendingRoundRecordForFloorEvent(floorId, event?.sourceAssistantMsgId, fallbackPendingFloorId))
      .map((event) => ({ ...event }))
    : [];
  const runtimeRolls = Array.isArray(pendingRound?.rolls)
    ? pendingRound.rolls
      .filter((record) => isPendingRoundRecordForFloorEvent(floorId, record?.sourceAssistantMsgId, fallbackPendingFloorId))
      .map((record) => ({ ...record }))
    : [];
  const events = runtimeEvents.length > 0 ? runtimeEvents : persistedEvents;
  const rolls = runtimeRolls.length > 0 ? runtimeRolls : persistedRolls;
  const sourceAssistantMsgIds = Array.from(new Set([
    ...events.map((item) => String(item?.sourceAssistantMsgId ?? "").trim()),
    ...rolls.map((item) => String(item?.sourceAssistantMsgId ?? "").trim()),
  ].filter(Boolean)));
  if (sourceAssistantMsgIds.length <= 0) {
    sourceAssistantMsgIds.push(`assistant_idx:${floorId}:${floor.createdAt || 0}`);
  }
  const latestRoundRef =
    Array.isArray(floor.roundRefs) && floor.roundRefs.length > 0
      ? String(floor.roundRefs[floor.roundRefs.length - 1] ?? "").trim()
      : "";
  return {
    roundId: String(pendingRound?.roundId ?? "").trim() || latestRoundRef || `floor_runtime_${floorId}`,
    instanceToken: String(pendingRound?.instanceToken ?? "").trim() || latestRoundRef || `floor_runtime_${floorId}`,
    status: pendingRound?.status === "closed" ? "closed" : "open",
    events,
    rolls,
    eventTimers: {},
    sourceAssistantMsgIds,
    openedAt: Number(floor.createdAt) || Date.now(),
  };
}

/**
 * 功能：按楼层数据库中的未关闭事件恢复当前事件列表与结果卡。
 * 参数：
 *   chatData：当前聊天数据库记录。
 *   chat：当前聊天消息数组。
 *   deps：卡片依赖。
 * 返回：
 *   mountedCount：成功挂载数量。
 *   hasCurrentWidgets：是否存在应显示的当前卡片。
 */
function mountCurrentFloorWidgetsFromChatDataEvent(
  chatData: RollHelperChatRecordEvent,
  chat: TavernMessageEvent[],
  deps: AnchorDepsEvent
): { mountedCount: number; hasCurrentWidgets: boolean } {
  let mountedCount = 0;
  let hasCurrentWidgets = false;
  let latestVisibleFloorId: number | null = null;
  const closedRoundFloorIds = new Set<number>();
  const pendingRound = deps.getDiceMetaEvent().pendingRound;

  for (const roundId of chatData.rounds?.order ?? []) {
    const round = chatData.rounds?.records?.[roundId];
    if (!round || round.status !== "closed") continue;
    for (const floorId of round.floorIds ?? []) {
      closedRoundFloorIds.add(Number(floorId));
    }
  }

  for (const floorId of chatData.floorOrder ?? []) {
    const floor = chatData.floors?.[String(floorId)];
    if (!floor?.eventDice) continue;
    const snapshot = buildFloorRuntimeRoundSnapshotEvent(floorId, floor, pendingRound);
    const hasVisibleEvents = (snapshot.events ?? []).some(
      (event) => event?.listVisibility !== "hidden" && !Number(event?.closedAt)
    );
    if (hasVisibleEvents) {
      latestVisibleFloorId = floorId;
    }
  }

  for (const floorId of chatData.floorOrder ?? []) {
    const floor = chatData.floors?.[String(floorId)];
    if (!floor?.eventDice) continue;
    const isClosedHistoryFloor = closedRoundFloorIds.has(floorId);
    const round = buildFloorRuntimeRoundSnapshotEvent(floorId, floor, pendingRound);
    const visibleEvents = round.events.filter(
      (event) => event.listVisibility !== "hidden" && !Number(event.closedAt)
    );
    const publicResultCards = isClosedHistoryFloor
      ? []
      : round.events
      .map((event) => {
        const record = deps.getLatestRollRecordForEvent(round, event.id);
        if (!record || isBlindResultRecordEvent(record)) return "";
        return deps.buildEventRollResultCardEvent(event, record);
      })
      .filter(Boolean);
    const listCardHtml = visibleEvents.length > 0 && latestVisibleFloorId === floorId
      ? deps.buildEventListCardEvent({
        ...round,
        events: visibleEvents,
      })
      : "";
    if (!listCardHtml && publicResultCards.length <= 0) {
      continue;
    }
    hasCurrentWidgets = hasCurrentWidgets || Boolean(listCardHtml);
    const latestMsgId = round.sourceAssistantMsgIds[round.sourceAssistantMsgIds.length - 1] || "";
    const mesElement = findMesElementByMsgIdEvent(latestMsgId, chat);
    if (!mesElement) {
      logger.warn(`[卡片恢复] 未找到当前楼层锚点 floorId=${floorId} sourceMsgId=${latestMsgId}`);
      continue;
    }
    const cards = [
      ...(listCardHtml ? [listCardHtml] : []),
      ...publicResultCards,
    ];
    mountWidgetToMesEvent(mesElement, cards.join(""), `floor-current-${floorId}`);
    mountedCount += 1;
  }

  return {
    mountedCount,
    hasCurrentWidgets,
  };
}

/**
 * 功能：挂载历史轮次（summaryHistory）中的结果卡，按楼层分桶。
 *   - 只恢复有已结算结果且有快照数据的事件
 *   - 不恢复事件列表卡
 * @returns 成功挂载的楼层数。
 */
function mountHistoryRoundWidgetsEvent(
  snapshot: RoundSummarySnapshotEvent,
  chat: TavernMessageEvent[],
  deps: AnchorDepsEvent
): { mountedCount: number; hasRestorableWidgets: boolean } {
  let mountedCount = 0;
  let hasRestorableWidgets = false;

  const floorBuckets = new Map<string, Array<{ event: DiceEventSpecEvent; record: EventRollRecordEvent }>>();

  for (const item of snapshot.events) {
    if (item.status === "pending") continue;
    if (!item.sourceAssistantMsgId) continue;

    const rebuilt = rebuildEventAndRecordFromSnapshotEvent(item, snapshot.roundId);
    if (!rebuilt) continue;
    if (isBlindResultRecordEvent(rebuilt.record)) continue;
    hasRestorableWidgets = true;

    const msgId = item.sourceAssistantMsgId;
    let bucket = floorBuckets.get(msgId);
    if (!bucket) {
      bucket = [];
      floorBuckets.set(msgId, bucket);
    }
    bucket.push(rebuilt);
  }

  for (const [msgId, items] of floorBuckets) {
    if (items.length <= 0) continue;

    const mesElement = findMesElementByMsgIdEvent(msgId, chat);
    if (!mesElement) {
      logger.warn(`[卡片恢复] 未找到历史结果锚点 roundId=${snapshot.roundId} sourceMsgId=${msgId}`);
      continue;
    }

    const cards: string[] = [];
    for (const { event, record } of items) {
      cards.push(deps.buildEventRollResultCardEvent(event, record));
    }

    if (cards.length > 0) {
      mountWidgetToMesEvent(mesElement, cards.join(""), `history-${snapshot.roundId}-floor-${msgId}`);
      mountedCount += 1;
    }
  }

  return {
    mountedCount,
    hasRestorableWidgets,
  };
}

/**
 * 功能：根据当前运行时状态重新挂载所有事件卡片，按楼层分桶。
 *   - 当前楼层：直接按楼层数据库中的未关闭事件恢复事件列表卡 + 结果卡
 *   - 历史轮次：按 sourceAssistantMsgId 分组恢复结果卡
 * @param deps 事件卡片挂载依赖。
 * @returns 本次刷新结果，用于判断是否需要继续重试恢复。
 */
export function refreshAllWidgetsFromStateEvent(
  deps: AnchorDepsEvent
): RefreshAllWidgetsResultEvent {
  unmountAllWidgetsEvent();

  const result: RefreshAllWidgetsResultEvent = {
    mountedWidgetCount: 0,
    hasCurrentFloorWidgets: false,
    currentFloorWidgetsMounted: false,
    hasHistoryWidgets: false,
    historyWidgetsMounted: false,
    chatDomReady: !!document.getElementById("chat"),
  };

  const liveCtx = deps.getLiveContextEvent();
  const chat = liveCtx?.chat as TavernMessageEvent[] | undefined;
  const chatData = deps.getCurrentChatDataEvent();
  if (!Array.isArray(chat)) {
    logger.warn("[卡片恢复] 当前 liveContext.chat 不可用，跳过挂载");
    return result;
  }

  const currentResult = mountCurrentFloorWidgetsFromChatDataEvent(chatData, chat, deps);
  result.hasCurrentFloorWidgets = currentResult.hasCurrentWidgets;
  result.currentFloorWidgetsMounted = currentResult.mountedCount > 0;
  result.mountedWidgetCount += currentResult.mountedCount;

  const closedRoundIds = (chatData?.rounds?.order || []).filter(
    (id) => chatData?.rounds?.records?.[id]?.status === "closed"
  );
  for (const roundId of closedRoundIds) {
    const roundRec = chatData.rounds.records[roundId];
    if (!roundRec) continue;
    const floorIds = roundRec.floorIds || [];
    const snapshotEvents: RoundSummaryEventItemEvent[] = [];
    const sourceAssistantMsgIds: string[] = [];
    for (const fid of floorIds) {
      const floor = chatData.floors?.[String(fid)];
      if (!floor?.eventDice) continue;
      for (const event of floor.eventDice.events || []) {
        const allRolls = [
          ...(floor.eventDice.publicRolls || []),
          ...(floor.eventDice.blindRolls || []),
        ];
        const record = allRolls.find((r) => r.eventId === event.id) ?? null;
        snapshotEvents.push(buildMinimalSummaryItemEvent(event, record));
        if (event.sourceAssistantMsgId && !sourceAssistantMsgIds.includes(event.sourceAssistantMsgId)) {
          sourceAssistantMsgIds.push(event.sourceAssistantMsgId);
        }
      }
    }
    if (snapshotEvents.length === 0) continue;

    const snapshot: RoundSummarySnapshotEvent = {
      roundId: roundRec.roundId,
      openedAt: roundRec.openedAt,
      closedAt: roundRec.closedAt ?? Date.now(),
      eventsCount: snapshotEvents.length,
      rolledCount: snapshotEvents.filter((e) => e.rollId || e.resultSource).length,
      events: snapshotEvents,
      sourceAssistantMsgIds,
    };
    const historyResult = mountHistoryRoundWidgetsEvent(snapshot, chat, deps);
    if (historyResult.hasRestorableWidgets) {
      result.hasHistoryWidgets = true;
    }
    if (historyResult.mountedCount > 0) {
      result.historyWidgetsMounted = true;
    }
    result.mountedWidgetCount += historyResult.mountedCount;
  }

  if (result.hasCurrentFloorWidgets || result.hasHistoryWidgets) {
    logger.info("[卡片恢复] refreshAllWidgetsFromStateEvent", {
      hasCurrentFloorWidgets: result.hasCurrentFloorWidgets,
      currentFloorWidgetsMounted: result.currentFloorWidgetsMounted,
      hasHistoryWidgets: result.hasHistoryWidgets,
      historyWidgetsMounted: result.historyWidgetsMounted,
      mountedWidgetCount: result.mountedWidgetCount,
      chatDomReady: result.chatDomReady,
      currentFloorCount: (chatData?.floorOrder || []).length,
      closedRoundCount: closedRoundIds.length,
    });
  }

  return result;
}
