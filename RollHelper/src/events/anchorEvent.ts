import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  EventRollRecordEvent,
  PendingRoundEvent,
  RoundSummaryEventItemEvent,
  RoundSummarySnapshotEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import type { DiceResult } from "../types/diceEvent";
import { logger } from "../../index";

const WIDGET_CONTAINER_CLASS_Event = "st-rh-widget-container";
const WIDGET_CONTAINER_ATTR_Event = "data-rh-widget";

export interface AnchorDepsEvent {
  getLiveContextEvent: () => { chat?: TavernMessageEvent[] } | null;
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
  hasPendingRound: boolean;
  pendingRoundMounted: boolean;
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

/**
 * 功能：挂载当前打开轮次的卡片，按楼层分桶。
 *   - 最新来源楼层：挂事件列表卡 + 该楼层已结算事件的结果卡
 *   - 更早来源楼层：只挂该楼层已结算事件的结果卡
 *   - 没有已结算结果的旧楼层：不挂卡
 * @returns 成功挂载的楼层数。
 */
function mountPendingRoundWidgetsEvent(
  round: PendingRoundEvent,
  chat: TavernMessageEvent[],
  deps: AnchorDepsEvent
): { mountedCount: number; anyMounted: boolean } {
  let mountedCount = 0;

  const latestMsgId =
    round.sourceAssistantMsgIds.length > 0
      ? round.sourceAssistantMsgIds[round.sourceAssistantMsgIds.length - 1]
      : undefined;

  const floorBuckets = new Map<string, { events: DiceEventSpecEvent[]; records: EventRollRecordEvent[] }>();

  for (const event of round.events) {
    const msgId = event.sourceAssistantMsgId || latestMsgId || "";
    if (!msgId) continue;
    let bucket = floorBuckets.get(msgId);
    if (!bucket) {
      bucket = { events: [], records: [] };
      floorBuckets.set(msgId, bucket);
    }
    bucket.events.push(event);
    const record = deps.getLatestRollRecordForEvent(round, event.id);
    if (record && !isBlindResultRecordEvent(record)) {
      bucket.records.push(record);
    }
  }

  for (const [msgId, bucket] of floorBuckets) {
    if (bucket.records.length <= 0 && msgId !== latestMsgId) continue;

    const mesElement = findMesElementByMsgIdEvent(msgId, chat);
    if (!mesElement) continue;

    const cards: string[] = [];

    if (msgId === latestMsgId) {
      const listCardHtml = deps.buildEventListCardEvent(round);
      if (listCardHtml) {
        cards.push(listCardHtml);
      }
    }

    for (const event of bucket.events) {
      const record = deps.getLatestRollRecordForEvent(round, event.id);
      if (record && !isBlindResultRecordEvent(record)) {
        cards.push(deps.buildEventRollResultCardEvent(event, record));
      }
    }

    if (cards.length > 0) {
      mountWidgetToMesEvent(mesElement, cards.join(""), `round-${round.roundId}-floor-${msgId}`);
      mountedCount += 1;
    }
  }

  if (mountedCount <= 0 && latestMsgId) {
    const mesElement = findMesElementByMsgIdEvent(latestMsgId, chat);
    if (mesElement) {
      const listCard = deps.buildEventListCardEvent(round);
      if (listCard) {
        mountWidgetToMesEvent(mesElement, listCard, `round-${round.roundId}-floor-${latestMsgId}`);
        mountedCount += 1;
      }
    }
  }

  return { mountedCount, anyMounted: mountedCount > 0 };
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
 * 功能：判断当前待处理轮次是否已经被归档到历史摘要中。
 * 参数：
 *   round：当前待处理轮次。
 *   summaryHistory：历史轮次摘要列表。
 * 返回：
 *   boolean：若历史中已存在同 roundId 的快照则返回 true。
 */
function isPendingRoundArchivedEvent(
  round: PendingRoundEvent | undefined,
  summaryHistory: RoundSummarySnapshotEvent[] | undefined
): boolean {
  if (!round || !Array.isArray(summaryHistory) || summaryHistory.length === 0) {
    return false;
  }
  return summaryHistory.some((snapshot) => String(snapshot?.roundId ?? "") === String(round.roundId ?? ""));
}

/**
 * 功能：根据当前运行时状态重新挂载所有事件卡片，按楼层分桶。
 *   - 当前打开轮次：最新楼层挂事件列表卡 + 结果卡；更早楼层只挂结果卡
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
    hasPendingRound: false,
    pendingRoundMounted: false,
    hasHistoryWidgets: false,
    historyWidgetsMounted: false,
    chatDomReady: !!document.getElementById("chat"),
  };

  const liveCtx = deps.getLiveContextEvent();
  const chat = liveCtx?.chat as TavernMessageEvent[] | undefined;
  const meta = deps.getDiceMetaEvent();

  const shouldMountPendingRound =
    !!meta.pendingRound &&
    meta.pendingRound.events.length > 0 &&
    !isPendingRoundArchivedEvent(meta.pendingRound, meta.summaryHistory);

  if (shouldMountPendingRound) {
    result.hasPendingRound = true;
  }
  if (!Array.isArray(chat)) {
    logger.warn("[卡片恢复] 当前 liveContext.chat 不可用，跳过挂载");
    return result;
  }

  if (shouldMountPendingRound && meta.pendingRound) {
    const round = meta.pendingRound;
    const { mountedCount, anyMounted } = mountPendingRoundWidgetsEvent(round, chat, deps);
    result.mountedWidgetCount += mountedCount;
    result.pendingRoundMounted = anyMounted;
    if (!anyMounted) {
      logger.warn(
        `[卡片恢复] 未找到锚点消息 roundId=${round.roundId} sourceMsgIds=${JSON.stringify(round.sourceAssistantMsgIds)}`
      );
    }
  }

  if (Array.isArray(meta.summaryHistory)) {
    for (const snapshot of meta.summaryHistory) {
      if (!snapshot.events || snapshot.events.length <= 0) continue;
      const historyResult = mountHistoryRoundWidgetsEvent(snapshot, chat, deps);
      if (historyResult.hasRestorableWidgets) {
        result.hasHistoryWidgets = true;
      }
      if (historyResult.mountedCount > 0) {
        result.historyWidgetsMounted = true;
      }
      result.mountedWidgetCount += historyResult.mountedCount;
    }
  }

  if (result.hasPendingRound || result.hasHistoryWidgets) {
    logger.info("[卡片恢复] refreshAllWidgetsFromStateEvent", {
      pendingRoundId: meta.pendingRound?.roundId ?? null,
      hasPendingRound: result.hasPendingRound,
      pendingRoundMounted: result.pendingRoundMounted,
      hasHistoryWidgets: result.hasHistoryWidgets,
      historyWidgetsMounted: result.historyWidgetsMounted,
      mountedWidgetCount: result.mountedWidgetCount,
      chatDomReady: result.chatDomReady,
      pendingEventCount: Array.isArray(meta.pendingRound?.events) ? meta.pendingRound.events.length : 0,
      pendingRollCount: Array.isArray(meta.pendingRound?.rolls) ? meta.pendingRound.rolls.length : 0,
      summaryHistoryCount: Array.isArray(meta.summaryHistory) ? meta.summaryHistory.length : 0,
    });
  }

  return result;
}
