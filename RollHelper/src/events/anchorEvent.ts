import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  EventRollRecordEvent,
  PendingRoundEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
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
  chatDomReady: boolean;
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
 * 功能：根据当前运行时状态重新挂载所有事件卡片。
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
    chatDomReady: !!document.getElementById("chat"),
  };

  const liveCtx = deps.getLiveContextEvent();
  const chat = liveCtx?.chat as TavernMessageEvent[] | undefined;
  const meta = deps.getDiceMetaEvent();

  if (meta.pendingRound && meta.pendingRound.events.length > 0) {
    result.hasPendingRound = true;
  }
  if (!Array.isArray(chat)) {
    logger.warn("[卡片恢复] 当前 liveContext.chat 不可用，跳过挂载");
    return result;
  }

  if (meta.pendingRound && meta.pendingRound.events.length > 0) {
    const round = meta.pendingRound;
    const mesElement = findLastMesElementEvent(round.sourceAssistantMsgIds, chat);
    if (!mesElement) {
      logger.warn(
        `[卡片恢复] 未找到锚点消息 roundId=${round.roundId} sourceMsgIds=${JSON.stringify(round.sourceAssistantMsgIds)}`
      );
    }
    if (mesElement) {
      const cards: string[] = [];
      cards.push(deps.buildEventListCardEvent(round));
      for (const event of round.events) {
        const record = deps.getLatestRollRecordForEvent(round, event.id);
        if (record) {
          cards.push(deps.buildEventRollResultCardEvent(event, record));
        }
      }
      mountWidgetToMesEvent(mesElement, cards.join(""), `round-${round.roundId}`);
      result.mountedWidgetCount += 1;
      result.pendingRoundMounted = true;
    }
  }

  return result;
}
