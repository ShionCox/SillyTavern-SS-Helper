import type { STContext } from "../core/runtimeContextEvent";
import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  PendingRoundEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";

export interface EventHooksDepsEvent {
  getLiveContextEvent: () => STContext | null;
  eventSource: any;
  event_types: Record<string, string> | undefined;
  extractPromptChatFromPayloadEvent: (payload: any) => any[] | null;
  handlePromptReadyEvent: (payload: any, sourceEvent?: string) => void;
  handleGenerationEndedEvent: (retry?: number) => void;
  clearDiceMetaEventState: (reason?: string) => void;
  sanitizeCurrentChatEventBlocksEvent: () => void;
  sweepTimeoutFailuresEvent: () => boolean;
  refreshCountdownDomEvent: () => void;
}

export interface HandleGenerationEndedDepsEvent {
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
    enableAiRoundControl: boolean;
  };
  getLiveContextEvent: () => STContext | null;
  findLatestAssistantEvent: (
    chat: TavernMessageEvent[]
  ) => { msg: TavernMessageEvent; index: number } | null;
  getDiceMetaEvent: () => DiceMetaEvent;
  buildAssistantMessageIdEvent: (message: TavernMessageEvent, index: number) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound: boolean;
  };
  filterEventsByApplyScopeEvent: (
    events: DiceEventSpecEvent[],
    applyScope: "protagonist_only" | "all"
  ) => DiceEventSpecEvent[];
  removeRangesEvent: (text: string, ranges: Array<{ start: number; end: number }>) => string;
  setMessageTextEvent: (message: TavernMessageEvent, text: string) => void;
  hideEventCodeBlocksInDomEvent: () => void;
  persistChatSafeEvent: () => void;
  mergeEventsIntoPendingRoundEvent: (
    events: DiceEventSpecEvent[],
    assistantMsgId: string
  ) => PendingRoundEvent;
  autoRollEventsByAiModeEvent: (round: PendingRoundEvent) => string[];
  buildEventListCardEvent: (round: PendingRoundEvent) => string;
  pushToChat: (message: string) => string | undefined | void;
  sweepTimeoutFailuresEvent: () => boolean;
  refreshCountdownDomEvent: () => void;
  saveMetadataSafeEvent: () => void;
}

export function handleGenerationEndedEvent(
  retry = 0,
  deps: HandleGenerationEndedDepsEvent
): void {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled) return;

  const liveCtx = deps.getLiveContextEvent();
  if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) return;

  const latestAssistant = deps.findLatestAssistantEvent(liveCtx.chat as TavernMessageEvent[]);
  if (!latestAssistant) return;

  const meta = deps.getDiceMetaEvent();
  const assistantMsgId = deps.buildAssistantMessageIdEvent(
    latestAssistant.msg,
    latestAssistant.index
  );
  if (meta.lastProcessedAssistantMsgId === assistantMsgId) return;

  const sourceCandidates = [
    deps.getPreferredAssistantSourceTextEvent(latestAssistant.msg),
    deps.getMessageTextEvent(latestAssistant.msg),
  ].filter((item, index, array) => item && array.indexOf(item) === index);

  let chosenText = "";
  let chosenEvents: DiceEventSpecEvent[] = [];
  let chosenRanges: Array<{ start: number; end: number }> = [];
  let chosenShouldEndRound = false;
  for (const sourceText of sourceCandidates) {
    const parsed = deps.parseEventEnvelopesEvent(sourceText);
    if (parsed.events.length > 0 || parsed.ranges.length > 0) {
      chosenText = sourceText;
      chosenEvents = parsed.events;
      chosenRanges = parsed.ranges;
      chosenShouldEndRound = parsed.shouldEndRound;
      break;
    }
    if (!chosenText) {
      chosenText = sourceText;
      chosenEvents = parsed.events;
      chosenRanges = parsed.ranges;
      chosenShouldEndRound = parsed.shouldEndRound;
    }
  }

  if (!chosenText.trim()) {
    if (retry < 4) {
      setTimeout(() => handleGenerationEndedEvent(retry + 1, deps), 100 + retry * 120);
      return;
    }
    meta.lastProcessedAssistantMsgId = assistantMsgId;
    deps.saveMetadataSafeEvent();
    return;
  }

  const events = deps.filterEventsByApplyScopeEvent(chosenEvents, settings.eventApplyScope);
  const ranges = chosenRanges;
  if (events.length === 0 && ranges.length === 0) {
    if (retry < 4) {
      setTimeout(() => handleGenerationEndedEvent(retry + 1, deps), 140 + retry * 160);
      return;
    }
    meta.lastProcessedAssistantMsgId = assistantMsgId;
    deps.saveMetadataSafeEvent();
    return;
  }

  meta.lastProcessedAssistantMsgId = assistantMsgId;
  const cleaned = deps.removeRangesEvent(chosenText, ranges);
  deps.setMessageTextEvent(latestAssistant.msg, cleaned);
  deps.hideEventCodeBlocksInDomEvent();
  if (ranges.length > 0) {
    deps.persistChatSafeEvent();
  }

  let closedByAiDirective = false;
  const pendingRound = meta.pendingRound;
  if (pendingRound?.status === "open") {
    if (settings.enableAiRoundControl && chosenShouldEndRound) {
      pendingRound.status = "closed";
      closedByAiDirective = true;
      logger.info("AI 指令结束当前轮次（round_control=end_round）");
    }
  }

  if (events.length > 0) {
    const round = deps.mergeEventsIntoPendingRoundEvent(events, assistantMsgId);
    const autoRollCards = deps.autoRollEventsByAiModeEvent(round);
    const eventCard = deps.buildEventListCardEvent(round);
    deps.pushToChat(eventCard);
    for (const card of autoRollCards) {
      deps.pushToChat(card);
    }
    deps.sweepTimeoutFailuresEvent();
    deps.refreshCountdownDomEvent();
  } else {
    if (chosenEvents.length > 0 && settings.eventApplyScope === "protagonist_only") {
      logger.info("事件已按“仅主角行动事件”过滤，本次无可用事件");
    }
    if (closedByAiDirective) {
      logger.info("当前轮次已结束，等待下一轮事件");
    }
    deps.saveMetadataSafeEvent();
  }
  setTimeout(() => {
    deps.hideEventCodeBlocksInDomEvent();
    deps.refreshCountdownDomEvent();
  }, 50);
}

export interface FindLatestAssistantDepsEvent {
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
}

export function findLatestAssistantEvent(
  chat: TavernMessageEvent[],
  deps: FindLatestAssistantDepsEvent
): { msg: TavernMessageEvent; index: number } | null {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (deps.isAssistantMessageEvent(chat[i])) {
      return { msg: chat[i], index: i };
    }
  }
  return null;
}

export interface BuildAssistantMessageIdDepsEvent {
  simpleHashEvent: (input: string) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
}

export function buildAssistantMessageIdEvent(
  message: TavernMessageEvent,
  index: number,
  deps: BuildAssistantMessageIdDepsEvent
): string {
  const explicitId = message.id ?? message.cid ?? message.uid;
  const hash = deps.simpleHashEvent(deps.getMessageTextEvent(message));
  if (explicitId != null) {
    return `assistant:${String(explicitId)}:${hash}`;
  }
  return `assistant_idx:${index}:${hash}`;
}

export interface SanitizeAssistantMessageDepsEvent {
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
  };
  removeRangesEvent: (text: string, ranges: Array<{ start: number; end: number }>) => string;
  setMessageTextEvent: (message: TavernMessageEvent, text: string) => void;
}

export function sanitizeAssistantMessageEventBlocksEvent(
  message: TavernMessageEvent,
  deps: SanitizeAssistantMessageDepsEvent
): boolean {
  const sourceCandidates = [
    deps.getPreferredAssistantSourceTextEvent(message),
    deps.getMessageTextEvent(message),
  ].filter((item, index, array) => item && array.indexOf(item) === index);

  for (const sourceText of sourceCandidates) {
    const { ranges } = deps.parseEventEnvelopesEvent(sourceText);
    if (ranges.length === 0) continue;
    const cleaned = deps.removeRangesEvent(sourceText, ranges);
    deps.setMessageTextEvent(message, cleaned);
    return true;
  }

  return false;
}

export interface SanitizeCurrentChatDepsEvent {
  getLiveContextEvent: () => STContext | null;
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  sanitizeAssistantMessageEventBlocksEvent: (message: TavernMessageEvent) => boolean;
  persistChatSafeEvent: () => void;
  hideEventCodeBlocksInDomEvent: () => void;
}

export function sanitizeCurrentChatEventBlocksEvent(deps: SanitizeCurrentChatDepsEvent): void {
  const liveCtx = deps.getLiveContextEvent();
  if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) return;

  let changed = false;
  for (const item of liveCtx.chat as TavernMessageEvent[]) {
    if (!deps.isAssistantMessageEvent(item)) continue;
    if (deps.sanitizeAssistantMessageEventBlocksEvent(item)) {
      changed = true;
    }
  }

  if (changed) {
    deps.persistChatSafeEvent();
  }
  deps.hideEventCodeBlocksInDomEvent();
}

export interface ClearDiceMetaEventStateDepsEvent {
  getDiceMetaEvent: () => DiceMetaEvent;
  saveMetadataSafeEvent: () => void;
}

export function clearDiceMetaEventState(
  reason = "chat_reset",
  deps: ClearDiceMetaEventStateDepsEvent
): void {
  const meta = deps.getDiceMetaEvent();
  const normalizedReason = String(reason || "").toLowerCase();

  if (normalizedReason !== "chat_reset") {
    delete meta.lastProcessedAssistantMsgId;
    deps.saveMetadataSafeEvent();
    logger.info(`保留 Event 轮次状态，仅重置会话游标 (${reason})`);
    return;
  }

  delete meta.pendingRound;
  delete meta.outboundSummary;
  delete meta.pendingResultGuidanceQueue;
  delete meta.outboundResultGuidance;
  delete meta.summaryHistory;
  delete meta.lastPromptUserMsgId;
  delete meta.lastProcessedAssistantMsgId;
  deps.saveMetadataSafeEvent();
  logger.info(`已清理 Event 轮次状态 (${reason})`);
}

export interface BindEventButtonsDepsEvent {
  performEventRollByIdEvent: (
    eventIdRaw: string,
    overrideExpr?: string,
    expectedRoundId?: string
  ) => string;
  pushToChat: (message: string) => string | undefined | void;
}

export function bindEventButtonsEvent(deps: BindEventButtonsDepsEvent): void {
  const globalRef = globalThis as any;
  if (globalRef.__stRollEventButtonsBoundEvent) return;

  document.addEventListener(
    "click",
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const button = target.closest(
        "button[data-dice-event-roll='1']"
      ) as HTMLButtonElement | null;
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const eventId = button.getAttribute("data-dice-event-id") || "";
      const expr = button.getAttribute("data-dice-expr") || "";
      const roundId = button.getAttribute("data-round-id") || "";
      const result = deps.performEventRollByIdEvent(eventId, expr || undefined, roundId || undefined);
      if (result) deps.pushToChat(result);
    },
    true
  );

  globalRef.__stRollEventButtonsBoundEvent = true;
}

export function startCountdownTickerEvent(deps: Pick<EventHooksDepsEvent, "sweepTimeoutFailuresEvent" | "refreshCountdownDomEvent">): void {
  const globalRef = globalThis as any;
  if (globalRef.__stRollEventCountdownTicker) return;
  globalRef.__stRollEventCountdownTicker = setInterval(() => {
    try {
      deps.sweepTimeoutFailuresEvent();
      deps.refreshCountdownDomEvent();
    } catch (error) {
      logger.warn("倒计时刷新异常", error);
    }
  }, 1000);
}

export function registerEventHooksEvent(deps: EventHooksDepsEvent): void {
  const globalRef = globalThis as any;
  if (globalRef.__stRollEventHooksRegisteredEvent) return;

  const liveCtx = deps.getLiveContextEvent();
  const src = liveCtx?.eventSource ?? deps.eventSource;
  const types = liveCtx?.event_types ?? deps.event_types ?? {};
  if (!src?.on) return;

  const promptEvents = Array.from(
    new Set(
      [types.CHAT_COMPLETION_PROMPT_READY, "chat_completion_prompt_ready"].filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    )
  );
  logger.info(
    `prompt 注入监听事件: ${promptEvents.length > 0 ? promptEvents.join(", ") : "(none)"}`
  );
  const bindPrompt =
    typeof (src as any).makeLast === "function"
      ? (src as any).makeLast.bind(src)
      : src.on.bind(src);

  const generationEvents = Array.from(
    new Set(
      [types.GENERATION_ENDED, "generation_ended"].filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    )
  );

  const resetEvents = Array.from(
    new Set(
      [
        types.CHAT_CHANGED,
        types.CHAT_RESET,
        types.CHAT_STARTED,
        types.CHAT_NEW,
        types.CHAT_CREATED,
        "chat_changed",
        "chat_reset",
        "chat_started",
        "chat_new",
        "chat_created",
      ].filter((item): item is string => typeof item === "string" && item.length > 0)
    )
  );

  for (const eventName of promptEvents) {
    bindPrompt(eventName, (payload: any) => {
      try {
        if (!deps.extractPromptChatFromPayloadEvent(payload)) {
          logger.info(`${eventName} 已触发，但 payload 中未发现 chat/messages`);
        }
        deps.handlePromptReadyEvent(payload, eventName);
      } catch (error) {
        logger.error("Prompt hook 错误", error);
      }
    });
  }

  for (const eventName of generationEvents) {
    src.on(eventName, () => {
      try {
        deps.handleGenerationEndedEvent();
      } catch (error) {
        logger.error("Generation hook 错误", error);
      }
    });
  }

  for (const eventName of resetEvents) {
    src.on(eventName, () => {
      try {
        deps.clearDiceMetaEventState(eventName);
        setTimeout(() => {
          deps.sanitizeCurrentChatEventBlocksEvent();
          deps.sweepTimeoutFailuresEvent();
          deps.refreshCountdownDomEvent();
        }, 0);
      } catch (error) {
        logger.error("Reset hook 错误", error);
      }
    });
  }

  globalRef.__stRollEventHooksRegisteredEvent = true;
}
