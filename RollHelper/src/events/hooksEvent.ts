import type { STContext } from "../core/runtimeContextEvent";
import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  PendingRoundEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import { ensureSharedTooltip } from "../../../_Components/sharedTooltip";
import { formatStatusRemainingRoundsLabelEvent } from "./statusEvent";
import { ensureSdkFloatingToolbar, SDK_FLOATING_TOOLBAR_ID } from "../../../SDK/toolbar";
import {
  collectAssistantSourceCandidatesEvent,
  getAssistantOriginalSourceTextEvent,
  getMessageTextSafe,
  hasAssistantOriginalSourceTextEvent,
  rememberAssistantOriginalSnapshotEvent,
  rememberAssistantOriginalSourceTextEvent,
  resetAssistantSwipeRuntimeStateEvent,
  sanitizeAssistantMessageArtifactsEvent,
} from "./messageSanitizerEvent";
import { copyTextToClipboardEvent } from "../settings/skillEditorUiEvent";

const RH_COPY_SOURCE_BUTTON_ATTR_Event = "data-rh-copy-source";
const RH_COPY_SOURCE_BUTTON_STYLE_ID_Event = "st-rh-copy-source-style";

export interface EventHooksDepsEvent {
  getLiveContextEvent: () => STContext | null;
  eventSource: any;
  event_types: Record<string, string> | undefined;
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  getAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound?: boolean;
  };
  resetRecentParseFailureLogsEvent: () => void;
  extractPromptChatFromPayloadEvent: (payload: any) => any[] | null;
  handlePromptReadyEvent: (payload: any, sourceEvent?: string) => void;
  handleGenerationEndedEvent: () => void;
  resetAssistantProcessedStateEvent: () => void;
  clearDiceMetaEventState: (reason?: string) => void;
  sanitizeCurrentChatEventBlocksEvent: () => void;
  sweepTimeoutFailuresEvent: () => boolean;
  refreshCountdownDomEvent: () => void;
  loadChatScopedStateIntoRuntimeEvent: (reason?: string) => Promise<void>;
  refreshAllWidgetsFromStateEvent: () => void;
  reconcilePendingRoundWithCurrentChatEvent: (reason?: string) => boolean;
  enhanceInteractiveTriggersInDomEvent: () => void;
  enhanceAssistantRawSourceButtonsEvent: () => void;
}

export interface HandleGenerationEndedDepsEvent {
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
    enableAiRoundControl: boolean;
    defaultBlindSkillsText?: string;
  };
  getLiveContextEvent: () => STContext | null;
  findLatestAssistantEvent: (
    chat: TavernMessageEvent[]
  ) => { msg: TavernMessageEvent; index: number } | null;
  getDiceMetaEvent: () => DiceMetaEvent;
  buildAssistantMessageIdEvent: (message: TavernMessageEvent, index: number) => string;
  getAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
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
  invalidatePendingRoundFloorEvent: (assistantMsgId: string) => boolean;
  invalidateSummaryHistoryFloorEvent: (assistantMsgId: string) => boolean;
  autoRollEventsByAiModeEvent: (round: PendingRoundEvent) => Promise<string[]>;
  refreshAllWidgetsFromStateEvent: () => void;
  sweepTimeoutFailuresEvent: () => boolean;
  refreshCountdownDomEvent: () => void;
  saveMetadataSafeEvent: () => void;
}

export interface ReconcilePendingRoundWithCurrentChatDepsEvent {
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
  };
  getLiveContextEvent: () => STContext | null;
  getDiceMetaEvent: () => DiceMetaEvent;
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  buildAssistantMessageIdEvent: (message: TavernMessageEvent, index: number) => string;
  buildAssistantFloorKeyEvent: (assistantMsgId: string) => string | null;
  getAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
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
  invalidatePendingRoundFloorEvent: (assistantMsgId: string) => boolean;
  invalidateSummaryHistoryFloorEvent: (assistantMsgId: string) => boolean;
  mergeEventsIntoPendingRoundEvent: (
    events: DiceEventSpecEvent[],
    assistantMsgId: string
  ) => PendingRoundEvent;
}

type ResolvedAssistantEnvelopeEvent = {
  chosenText: string;
  chosenEvents: DiceEventSpecEvent[];
  chosenRanges: Array<{ start: number; end: number }>;
  chosenShouldEndRound: boolean;
};

type AssistantMessageTargetEvent = {
  msg: TavernMessageEvent;
  index: number;
};

type AssistantGenerationSessionStateEvent = {
  key: string;
  swipeId: number;
  sequence: number;
  finalized: boolean;
};

const assistantGenerationSessionsEvent = new Map<string, AssistantGenerationSessionStateEvent>();

/**
 * 功能：解析助手消息中的骰子事件包，并按当前作用域过滤事件。
 * @param message 目标助手消息。
 * @param applyScope 当前事件作用域。
 * @param deps 事件包解析依赖。
 * @returns 解析后的文本、事件、移除区间与回合结束标记。
 */
function resolveAssistantEnvelopeEvent(
  message: TavernMessageEvent,
  applyScope: "protagonist_only" | "all",
  deps: Pick<
    HandleGenerationEndedDepsEvent,
    | "getAssistantOriginalSourceTextEvent"
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
    | "parseEventEnvelopesEvent"
    | "filterEventsByApplyScopeEvent"
  >
): ResolvedAssistantEnvelopeEvent {
  const sourceCandidates = collectAssistantSourceCandidatesEvent(message, deps);

  let chosenText = "";
  let chosenEvents: DiceEventSpecEvent[] = [];
  let chosenRanges: Array<{ start: number; end: number }> = [];
  let chosenShouldEndRound = false;
  for (const sourceText of sourceCandidates) {
    const parsed = deps.parseEventEnvelopesEvent(sourceText);
    const filteredEvents = deps.filterEventsByApplyScopeEvent(parsed.events, applyScope);
    if (filteredEvents.length > 0 || parsed.ranges.length > 0) {
      chosenText = sourceText;
      chosenEvents = filteredEvents;
      chosenRanges = parsed.ranges;
      chosenShouldEndRound = parsed.shouldEndRound;
      break;
    }
    if (!chosenText) {
      chosenText = sourceText;
      chosenEvents = filteredEvents;
      chosenRanges = parsed.ranges;
      chosenShouldEndRound = parsed.shouldEndRound;
    }
  }

  return {
    chosenText,
    chosenEvents,
    chosenRanges,
    chosenShouldEndRound,
  };
}

/**
 * 功能：收集当前未归档轮次中所有已跟踪楼层的最新消息标识。
 * @param round 当前未归档轮次。
 * @param buildAssistantFloorKeyEvent 楼层键提取函数。
 * @returns 楼层键到助手消息标识的映射。
 */
function collectPendingRoundFloorVersionsEvent(
  round: PendingRoundEvent,
  buildAssistantFloorKeyEvent: (assistantMsgId: string) => string | null
): Map<string, string> {
  const tracked = new Map<string, string>();
  const remember = (assistantMsgId: string | undefined): void => {
    const normalized = String(assistantMsgId ?? "").trim();
    if (!normalized) return;
    const floorKey = buildAssistantFloorKeyEvent(normalized);
    if (!floorKey) return;
    tracked.set(floorKey, normalized);
  };

  for (const assistantMsgId of round.sourceAssistantMsgIds) {
    remember(assistantMsgId);
  }
  for (const event of round.events) {
    remember(event.sourceAssistantMsgId);
  }
  for (const record of round.rolls) {
    remember(record.sourceAssistantMsgId);
  }

  return tracked;
}

/**
 * 功能：收集历史摘要中所有已跟踪楼层的最新消息标识。
 * @param summaryHistory 历史摘要列表。
 * @param buildAssistantFloorKeyEvent 楼层键提取函数。
 * @returns 楼层键到助手消息标识的映射。
 */
function collectSummaryHistoryFloorVersionsEvent(
  summaryHistory: Array<{ sourceAssistantMsgIds?: string[]; events?: Array<{ sourceAssistantMsgId?: string }> }> | undefined,
  buildAssistantFloorKeyEvent: (assistantMsgId: string) => string | null
): Map<string, string> {
  const tracked = new Map<string, string>();
  if (!Array.isArray(summaryHistory) || summaryHistory.length <= 0) {
    return tracked;
  }

  const remember = (assistantMsgId: string | undefined): void => {
    const normalized = String(assistantMsgId ?? "").trim();
    if (!normalized) return;
    const floorKey = buildAssistantFloorKeyEvent(normalized);
    if (!floorKey) return;
    tracked.set(floorKey, normalized);
  };

  for (const snapshot of summaryHistory) {
    if (!snapshot) continue;
    if (Array.isArray(snapshot.sourceAssistantMsgIds)) {
      for (const assistantMsgId of snapshot.sourceAssistantMsgIds) {
        remember(assistantMsgId);
      }
    }
    if (Array.isArray(snapshot.events)) {
      for (const event of snapshot.events) {
        remember(event?.sourceAssistantMsgId);
      }
    }
  }

  return tracked;
}

function ensureAssistantRawSourceButtonStyleEvent(): void {
  if (document.getElementById(RH_COPY_SOURCE_BUTTON_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = RH_COPY_SOURCE_BUTTON_STYLE_ID_Event;
  style.textContent = `
    [${RH_COPY_SOURCE_BUTTON_ATTR_Event}="1"] {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    [${RH_COPY_SOURCE_BUTTON_ATTR_Event}="1"][data-rh-copy-source-state="copied"] {
      color: #9fe3b1;
    }
  `;
  document.head.appendChild(style);
}

function resolveMessageRecordByMesIdEvent(
  mesElement: HTMLElement,
  chat: TavernMessageEvent[]
): TavernMessageEvent | null {
  const rawMesId = mesElement.getAttribute("mesid") || "";
  const messageIndex = Number(rawMesId);
  if (!Number.isFinite(messageIndex) || messageIndex < 0 || messageIndex >= chat.length) {
    return null;
  }
  return chat[messageIndex] ?? null;
}

function resolveAssistantSwipeIdEvent(message: TavernMessageEvent): number {
  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  if (Number.isFinite(swipeId) && swipeId >= 0) return swipeId;
  return -1;
}

function resolveAssistantRuntimeMessageKeyEvent(message: TavernMessageEvent, index: number): string {
  const explicitId = String(message.id ?? message.cid ?? message.uid ?? "").trim();
  if (explicitId) return `assistant:${explicitId}`;
  const timestamp = String((message as any)?.create_date ?? (message as any)?.create_time ?? (message as any)?.timestamp ?? "").trim();
  if (timestamp) return `assistant_ts:${timestamp}`;
  return `assistant_idx:${index}`;
}

function buildAssistantGenerationSessionKeyEvent(state: AssistantGenerationSessionStateEvent): string {
  return `${state.key}:swipe_${state.swipeId}:session_${state.sequence}`;
}

function resolveAssistantEventTargetEvent(
  eventArgs: unknown[],
  deps: Pick<EventHooksDepsEvent, "getLiveContextEvent" | "isAssistantMessageEvent">
): AssistantMessageTargetEvent | null {
  const liveCtx = deps.getLiveContextEvent();
  const chat = liveCtx?.chat;
  if (!Array.isArray(chat) || chat.length <= 0) return null;
  const rawMessageId = eventArgs.find((value) => Number.isInteger(Number(value)));
  const messageIndex = Number(rawMessageId);
  if (Number.isInteger(messageIndex) && messageIndex >= 0 && messageIndex < chat.length) {
    const target = chat[messageIndex] as TavernMessageEvent;
    if (deps.isAssistantMessageEvent(target)) {
      return { msg: target, index: messageIndex };
    }
  }
  return findLatestAssistantEvent(chat as TavernMessageEvent[], {
    isAssistantMessageEvent: deps.isAssistantMessageEvent,
  });
}

function beginAssistantGenerationSessionEvent(
  target: AssistantMessageTargetEvent,
  reason: string,
  deps: Pick<EventHooksDepsEvent, "resetRecentParseFailureLogsEvent" | "resetAssistantProcessedStateEvent">
): string {
  const key = resolveAssistantRuntimeMessageKeyEvent(target.msg, target.index);
  const swipeId = resolveAssistantSwipeIdEvent(target.msg);
  const previous = assistantGenerationSessionsEvent.get(key);
  const shouldStartNew = !previous || previous.swipeId !== swipeId || previous.finalized;
  const nextState: AssistantGenerationSessionStateEvent = shouldStartNew
    ? {
      key,
      swipeId,
      sequence: (previous?.sequence ?? 0) + 1,
      finalized: false,
    }
    : previous;

  if (shouldStartNew) {
    assistantGenerationSessionsEvent.set(key, nextState);
    resetAssistantSwipeRuntimeStateEvent(target.msg);
    deps.resetRecentParseFailureLogsEvent();
    deps.resetAssistantProcessedStateEvent();
    logger.info(`[内容处理] 检测到助手重生成会话开始 source=${reason} key=${buildAssistantGenerationSessionKeyEvent(nextState)}`);
  }

  return buildAssistantGenerationSessionKeyEvent(nextState);
}

function tryFinalizeAssistantGenerationSessionEvent(
  target: AssistantMessageTargetEvent
): { sessionKey: string; shouldFinalize: boolean } {
  const key = resolveAssistantRuntimeMessageKeyEvent(target.msg, target.index);
  const swipeId = resolveAssistantSwipeIdEvent(target.msg);
  const previous = assistantGenerationSessionsEvent.get(key);
  const nextState: AssistantGenerationSessionStateEvent = !previous || previous.swipeId !== swipeId
    ? {
      key,
      swipeId,
      sequence: (previous?.sequence ?? 0) + 1,
      finalized: true,
    }
    : {
      ...previous,
      finalized: true,
    };
  assistantGenerationSessionsEvent.set(key, nextState);
  return {
    sessionKey: buildAssistantGenerationSessionKeyEvent(nextState),
    shouldFinalize: !(previous && previous.swipeId === swipeId && previous.finalized),
  };
}

/**
 * 功能：在流式输出尚未结束前尽早保留助手原始文本快照，避免控制块被宿主后续覆盖。
 * 参数：
 *   reason：触发快照捕获的原因。
 *   deps：快照捕获依赖。
 * 返回：
 *   void
 */
function captureLatestAssistantOriginalSnapshotEvent(
  reason: string,
  eventArgs: unknown[],
  deps: Pick<
    EventHooksDepsEvent,
    | "getLiveContextEvent"
    | "isAssistantMessageEvent"
    | "getAssistantOriginalSourceTextEvent"
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
    | "parseEventEnvelopesEvent"
    | "resetRecentParseFailureLogsEvent"
    | "resetAssistantProcessedStateEvent"
  >
): void {
  const target = resolveAssistantEventTargetEvent(eventArgs, deps);
  if (!target) return;
  const sessionKey = beginAssistantGenerationSessionEvent(target, reason, deps);
  const changed = rememberAssistantOriginalSnapshotEvent(target.msg, {
    getAssistantOriginalSourceTextEvent: deps.getAssistantOriginalSourceTextEvent,
    getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
    getMessageTextEvent: deps.getMessageTextEvent,
    parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
  });
  if (changed) {
    logger.info(`[内容处理] 已提前保留助手原文快照 source=${reason} session=${sessionKey}`);
  }
}

function buildAssistantRawSourceCopyButtonEvent(): HTMLDivElement {
  const button = document.createElement("div");
  button.className = "mes_button interactable";
  button.setAttribute(RH_COPY_SOURCE_BUTTON_ATTR_Event, "1");
  button.setAttribute("title", "复制原格式");
  button.setAttribute("aria-label", "复制原格式");
  button.setAttribute("tabindex", "0");
  button.setAttribute("role", "button");
  button.innerHTML = `<i class="fa-solid fa-code fa-fw" aria-hidden="true"></i>`;
  return button;
}

/**
 * 功能：把复制按钮切换到指定提示状态，给用户可见反馈。
 * 参数：
 *   button：复制按钮节点。
 *   state：状态名称。
 *   title：按钮提示文本。
 * 返回：
 *   void
 */
function setAssistantRawSourceButtonStateEvent(
  button: HTMLElement,
  state: "copied" | "failed",
  title: string
): void {
  button.dataset.rhCopySourceState = state;
  button.setAttribute("title", title);
  window.setTimeout(() => {
    if (!button.isConnected) return;
    delete button.dataset.rhCopySourceState;
    button.setAttribute("title", "复制原格式");
  }, 1400);
}

export function enhanceAssistantRawSourceButtonsEvent(
  deps: Pick<EventHooksDepsEvent, "getLiveContextEvent"> & {
    isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  }
): void {
  const liveCtx = deps.getLiveContextEvent();
  const chat = liveCtx?.chat;
  if (!Array.isArray(chat)) return;
  const chatRoot = document.getElementById("chat");
  if (!chatRoot) return;

  ensureAssistantRawSourceButtonStyleEvent();
  const messageNodes = Array.from(chatRoot.querySelectorAll(".mes")) as HTMLElement[];
  for (const mesElement of messageNodes) {
    const buttonWrap = mesElement.querySelector(".mes_buttons") as HTMLElement | null;
    if (!buttonWrap) continue;

    const message = resolveMessageRecordByMesIdEvent(mesElement, chat as TavernMessageEvent[]);
    const shouldShow =
      deps.isAssistantMessageEvent(message ?? undefined)
      && hasAssistantOriginalSourceTextEvent(message ?? undefined);
    const existed = buttonWrap.querySelector(
      `[${RH_COPY_SOURCE_BUTTON_ATTR_Event}="1"]`
    ) as HTMLElement | null;

    if (!shouldShow) {
      existed?.remove();
      continue;
    }
    if (existed) continue;

    buttonWrap.appendChild(buildAssistantRawSourceCopyButtonEvent());
  }
}

/**
 * 功能：把当前可见聊天中的助手楼层与未归档轮次状态做一次对账。
 * @param reason 触发本次对账的原因。
 * @param deps 楼层对账依赖。
 * @returns 若对账过程中修改了未归档轮次则返回 `true`，否则返回 `false`。
 */
export function reconcilePendingRoundWithCurrentChatEvent(
  reason = "chat_mutated",
  deps: ReconcilePendingRoundWithCurrentChatDepsEvent
): boolean {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled) return false;

  const liveCtx = deps.getLiveContextEvent();
  if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) return false;

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;

  const currentFloors = new Map<string, { assistantMsgId: string; message: TavernMessageEvent }>();
  const chat = liveCtx.chat as TavernMessageEvent[];
  for (let index = 0; index < chat.length; index += 1) {
    const message = chat[index];
    if (!deps.isAssistantMessageEvent(message)) continue;
    const assistantMsgId = deps.buildAssistantMessageIdEvent(message, index);
    const floorKey = deps.buildAssistantFloorKeyEvent(assistantMsgId);
    if (!floorKey) continue;
    currentFloors.set(floorKey, { assistantMsgId, message });
  }

  const trackedFloors = new Map<string, string>();
  if (round) {
    for (const [floorKey, assistantMsgId] of collectPendingRoundFloorVersionsEvent(round, deps.buildAssistantFloorKeyEvent)) {
      trackedFloors.set(floorKey, assistantMsgId);
    }
  }
  for (const [floorKey, assistantMsgId] of collectSummaryHistoryFloorVersionsEvent(meta.summaryHistory, deps.buildAssistantFloorKeyEvent)) {
    if (!trackedFloors.has(floorKey)) {
      trackedFloors.set(floorKey, assistantMsgId);
    }
  }
  if (trackedFloors.size <= 0) return false;
  let changed = false;

  for (const [floorKey, storedAssistantMsgId] of trackedFloors) {
    const current = currentFloors.get(floorKey);
    if (!current) {
      changed = deps.invalidatePendingRoundFloorEvent(storedAssistantMsgId) || changed;
      changed = deps.invalidateSummaryHistoryFloorEvent(storedAssistantMsgId) || changed;
      continue;
    }
    if (current.assistantMsgId === storedAssistantMsgId) {
      continue;
    }

    changed = deps.invalidatePendingRoundFloorEvent(storedAssistantMsgId) || changed;
    changed = deps.invalidateSummaryHistoryFloorEvent(storedAssistantMsgId) || changed;

    const resolved = resolveAssistantEnvelopeEvent(current.message, settings.eventApplyScope, deps);
    if (resolved.chosenEvents.length > 0) {
      deps.mergeEventsIntoPendingRoundEvent(resolved.chosenEvents, current.assistantMsgId);
      changed = true;
    }
  }

  if (changed) {
    logger.info(`[楼层对账] 已同步未归档轮次 reason=${reason}`);
  }
  return changed;
}

export function handleGenerationEndedEvent(
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

  const resolvedEnvelope = resolveAssistantEnvelopeEvent(
    latestAssistant.msg,
    settings.eventApplyScope,
    deps
  );
  const chosenText = resolvedEnvelope.chosenText;
  const chosenEvents = resolvedEnvelope.chosenEvents;
  const chosenRanges = resolvedEnvelope.chosenRanges;
  const chosenShouldEndRound = resolvedEnvelope.chosenShouldEndRound;
  const sourceCandidates = collectAssistantSourceCandidatesEvent(latestAssistant.msg, deps);
  const fallbackSnapshotText = sourceCandidates.find((item) => String(item ?? "").trim()) || "";

  if (!chosenText.trim()) {
    return;
  }

  const events = chosenEvents;
  const ranges = chosenRanges;
  if (events.length === 0 && ranges.length === 0) {
    return;
  }

  meta.lastProcessedAssistantMsgId = assistantMsgId;
  const snapshotText = chosenText.trim() || fallbackSnapshotText.trim();
  const originalSnapshotChanged = snapshotText
    ? rememberAssistantOriginalSourceTextEvent(latestAssistant.msg, snapshotText, true)
    : false;
  const cleaned = deps.removeRangesEvent(chosenText, ranges);
  deps.setMessageTextEvent(latestAssistant.msg, cleaned);

  deps.hideEventCodeBlocksInDomEvent();
  if (ranges.length > 0 || originalSnapshotChanged) {
    deps.persistChatSafeEvent();
  }

  const pendingRound = meta.pendingRound;
  if (pendingRound?.status === "open") {
    if (settings.enableAiRoundControl && chosenShouldEndRound) {
      pendingRound.status = "closed";
    }
  }

  deps.invalidatePendingRoundFloorEvent(assistantMsgId);
  deps.invalidateSummaryHistoryFloorEvent(assistantMsgId);

  if (events.length > 0) {
    const round = deps.mergeEventsIntoPendingRoundEvent(events, assistantMsgId);
    deps.autoRollEventsByAiModeEvent(round).then(() => {
      deps.sweepTimeoutFailuresEvent();
      deps.refreshAllWidgetsFromStateEvent();
      deps.refreshCountdownDomEvent();
    });
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
  getAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound?: boolean;
  };
  removeRangesEvent: (text: string, ranges: Array<{ start: number; end: number }>) => string;
}

/**
 * 功能：为助手消息生成稳定的版本文本，自动剥离骰子控制块。
 * @param message 助手消息对象。
 * @param deps 助手消息标识依赖。
 * @returns 适合参与版本哈希的稳定文本。
 */
function buildAssistantMessageVersionTextEvent(
  message: TavernMessageEvent,
  deps: BuildAssistantMessageIdDepsEvent
): string {
  const sourceCandidates = [
    deps.getAssistantOriginalSourceTextEvent(message),
    deps.getPreferredAssistantSourceTextEvent(message),
    deps.getMessageTextEvent(message),
  ].filter((item, index, array) => item && array.indexOf(item) === index);
  if (sourceCandidates.length <= 0) {
    return "";
  }

  for (const sourceText of sourceCandidates) {
    const parsed = deps.parseEventEnvelopesEvent(sourceText);
    if (!Array.isArray(parsed.ranges) || parsed.ranges.length <= 0) {
      if (sourceText.trim()) return sourceText;
      continue;
    }
    return deps.removeRangesEvent(sourceText, parsed.ranges);
  }

  return sourceCandidates[0] ?? "";
}

/**
 * 功能：提取助手消息当前活跃版本的附加标识，优先使用 swipe 编号。
 * @param message 助手消息对象。
 * @returns 附加版本标识。
 */
function resolveAssistantMessageVersionTokenEvent(message: TavernMessageEvent): string {
  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  if (Number.isFinite(swipeId) && swipeId >= 0) {
    return `swipe_${swipeId}`;
  }
  return "base";
}

/**
 * 功能：解析助手消息的稳定时间戳标识，优先使用宿主保存的消息时间字段。
 * @param message 助手消息对象。
 * @returns 规范化后的时间戳文本；不存在时返回空字符串。
 */
function resolveAssistantMessageTimestampEvent(message: TavernMessageEvent): string {
  const value =
    (message as any)?.create_date ??
    (message as any)?.create_time ??
    (message as any)?.timestamp ??
    "";
  return String(value ?? "").trim();
}

export function buildAssistantMessageIdEvent(
  message: TavernMessageEvent,
  index: number,
  deps: BuildAssistantMessageIdDepsEvent
): string {
  const explicitId = message.id ?? message.cid ?? message.uid;
  const stableText = buildAssistantMessageVersionTextEvent(message, deps);
  const versionToken = resolveAssistantMessageVersionTokenEvent(message);
  const hash = deps.simpleHashEvent(stableText);
  if (explicitId != null) {
    return `assistant:${String(explicitId)}:${versionToken}:${hash}`;
  }
  const timestamp = resolveAssistantMessageTimestampEvent(message);
  if (timestamp) {
    return `assistant_ts:${timestamp}:${versionToken}:${hash}`;
  }
  return `assistant_idx:${index}:${versionToken}:${hash}`;
}

export interface SanitizeAssistantMessageDepsEvent {
  getSettingsEvent: () => {
    defaultBlindSkillsText?: string;
  };
  getAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
  };
  removeRangesEvent: (text: string, ranges: Array<{ start: number; end: number }>) => string;
  setMessageTextEvent: (message: TavernMessageEvent, text: string) => void;
  resolveSourceMessageIdEvent?: (message: TavernMessageEvent, index?: number) => string;
}

export function sanitizeAssistantMessageEventBlocksEvent(
  message: TavernMessageEvent,
  index: number | undefined,
  deps: SanitizeAssistantMessageDepsEvent
): boolean {
  return sanitizeAssistantMessageArtifactsEvent(message, index, {
    getSettingsEvent: deps.getSettingsEvent,
    getAssistantOriginalSourceTextEvent: deps.getAssistantOriginalSourceTextEvent,
    getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
    getMessageTextEvent: deps.getMessageTextEvent,
    parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
    removeRangesEvent: deps.removeRangesEvent,
    setMessageTextEvent: deps.setMessageTextEvent,
    resolveSourceMessageIdEvent: deps.resolveSourceMessageIdEvent,
  });
}

export interface SanitizeCurrentChatDepsEvent {
  getLiveContextEvent: () => STContext | null;
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  sanitizeAssistantMessageEventBlocksEvent: (message: TavernMessageEvent, index?: number) => boolean;
  persistChatSafeEvent: () => void;
  hideEventCodeBlocksInDomEvent: () => void;
}

export function sanitizeCurrentChatEventBlocksEvent(deps: SanitizeCurrentChatDepsEvent): void {
  const liveCtx = deps.getLiveContextEvent();
  if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) return;

  let changed = false;
  (liveCtx.chat as TavernMessageEvent[]).forEach((item, index) => {
    if (!deps.isAssistantMessageEvent(item)) return;
    if (deps.sanitizeAssistantMessageEventBlocksEvent(item, index)) {
      changed = true;
    }
  });

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
    return;
  }

  delete meta.pendingRound;
  delete meta.outboundSummary;
  delete meta.pendingResultGuidanceQueue;
  delete meta.outboundResultGuidance;
  delete meta.pendingBlindGuidanceQueue;
  delete meta.blindHistory;
  delete meta.outboundBlindGuidance;
  delete meta.pendingPassiveDiscoveries;
  delete meta.outboundPassiveDiscovery;
  delete meta.passiveDiscoveriesCache;
  delete meta.lastPassiveContextHash;
  delete meta.summaryHistory;
  delete meta.lastPromptUserMsgId;
  delete meta.lastProcessedAssistantMsgId;
  deps.saveMetadataSafeEvent();
}

export interface BindEventButtonsDepsEvent {
  performEventRollByIdEvent: (
    eventIdRaw: string,
    overrideExpr?: string,
    expectedRoundId?: string
  ) => Promise<string>;
  performBlindEventRollByIdEvent: (
    eventIdRaw: string,
    overrideExpr?: string,
    expectedRoundId?: string
  ) => Promise<string>;
  rerollEventByIdEvent: (
    eventIdRaw: string,
    expectedRoundId?: string
  ) => Promise<string>;
  rerollBlindEventByIdEvent: (
    eventIdRaw: string,
    expectedRoundId?: string
  ) => Promise<string>;
  refreshAllWidgetsFromStateEvent: () => void;
  getSettingsEvent: () => {
    enableRerollFeature?: boolean;
    enableSkillSystem?: boolean;
    skillTableText?: string;
  };
  getDiceMetaEvent: () => DiceMetaEvent;
}

function escapePreviewHtmlEvent(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseSkillPreviewItemsEvent(skillTableText: string): Array<{ name: string; modifier: number }> {
  try {
    const parsed = JSON.parse(String(skillTableText ?? "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, any>)
      .map(([name, value]) => ({ name: String(name ?? "").trim(), modifier: Number(value) }))
      .filter((item) => item.name && Number.isFinite(item.modifier))
      .sort((a, b) => Math.abs(b.modifier) - Math.abs(a.modifier) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  } catch {
    return [];
  }
}

const SSHELPER_TOOLBAR_TIP_EXPAND_Event = "展开工具栏";
const SSHELPER_TOOLBAR_TIP_COLLAPSE_Event = "收起工具栏";
const SSHELPER_TOOLBAR_TIP_SKILLS_Event = "技能预览";
const SSHELPER_TOOLBAR_TIP_STATUSES_Event = "状态预览";
const SSHELPER_TOOLBAR_TIP_BLIND_HISTORY_Event = "暗骰列表";
const SSHELPER_TOOLBAR_ARIA_EXPAND_Event = "展开 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event = "收起 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_SKILLS_Event = "打开技能预览";
const SSHELPER_TOOLBAR_ARIA_STATUSES_Event = "打开状态预览";
const SSHELPER_TOOLBAR_ARIA_BLIND_HISTORY_Event = "打开暗骰列表";

const SSHELPER_TOOLBAR_GROUP_ID_Event = "rollhelper";

function ensureSSToolbarEvent(): HTMLElement | null {
  return ensureSdkFloatingToolbar({
    toolbarId: SDK_FLOATING_TOOLBAR_ID,
    groupId: SSHELPER_TOOLBAR_GROUP_ID_Event,
    groupClassName: "stx-sdk-toolbar-group-rollhelper",
    toggleTipExpand: SSHELPER_TOOLBAR_TIP_EXPAND_Event,
    toggleTipCollapse: SSHELPER_TOOLBAR_TIP_COLLAPSE_Event,
    toggleAriaExpand: SSHELPER_TOOLBAR_ARIA_EXPAND_Event,
    toggleAriaCollapse: SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event,
    actions: [
      {
        key: "skills",
        iconClassName: "fa-solid fa-wand-magic-sparkles",
        tooltip: SSHELPER_TOOLBAR_TIP_SKILLS_Event,
        ariaLabel: SSHELPER_TOOLBAR_ARIA_SKILLS_Event,
        buttonClassName: "stx-sdk-toolbar-action-rollhelper-skills",
        attributes: {
          "data-event-preview-open": "skills",
        },
        order: 10,
      },
      {
        key: "statuses",
        iconClassName: "fa-solid fa-heart-pulse",
        tooltip: SSHELPER_TOOLBAR_TIP_STATUSES_Event,
        ariaLabel: SSHELPER_TOOLBAR_ARIA_STATUSES_Event,
        buttonClassName: "stx-sdk-toolbar-action-rollhelper-statuses",
        attributes: {
          "data-event-preview-open": "statuses",
        },
        order: 20,
      },
      {
        key: "blind-history",
        iconClassName: "fa-solid fa-eye-slash",
        tooltip: SSHELPER_TOOLBAR_TIP_BLIND_HISTORY_Event,
        ariaLabel: SSHELPER_TOOLBAR_ARIA_BLIND_HISTORY_Event,
        buttonClassName: "stx-sdk-toolbar-action-rollhelper-blind-history",
        attributes: {
          "data-event-preview-open": "blind-history",
        },
        order: 30,
      },
    ],
  });
}

function ensurePreviewDialogStyleEvent(): void {
  if (document.getElementById("st-roll-event-preview-style")) return;
  const style = document.createElement("style");
  style.id = "st-roll-event-preview-style";
  style.textContent = `
    .st-rh-preview-dialog { border: none; background: transparent; padding: 0; max-width: 96vw; }
    .st-rh-preview-dialog::backdrop { background: rgba(0, 0, 0, 0.58); backdrop-filter: blur(2px); }
    .st-rh-preview-wrap { width: min(720px, 92vw); max-height: min(76vh, 680px); border: 1px solid rgba(197, 160, 89, 0.5); border-radius: 12px; background: linear-gradient(145deg, #1c1412 0%, #0d0806 100%); color: #e9ddbc; box-shadow: 0 18px 36px rgba(0,0,0,0.52); display: flex; flex-direction: column; }
    .st-rh-preview-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 12px 14px; border-bottom: 1px solid rgba(197, 160, 89, 0.24); }
    .st-rh-preview-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
    .st-rh-preview-body { max-height: none; overflow: auto; padding: 12px 14px; font-size: 13px; line-height: 1.6; -webkit-overflow-scrolling: touch; }
    .st-rh-preview-empty { opacity: 0.75; padding: 10px; border: 1px dashed rgba(197,160,89,0.35); border-radius: 8px; text-align: center; }
    .st-rh-preview-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .st-rh-preview-item { padding: 8px 10px; border: 1px solid rgba(197,160,89,0.25); border-radius: 8px; background: rgba(255,255,255,0.03); }
    .st-rh-preview-item strong { color: #ffd987; }
    .st-rh-preview-btn { border: 1px solid rgba(197,160,89,0.55); background: linear-gradient(135deg, #3a2515, #1a100a); color: #f3d69c; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
    .st-rh-preview-btn.secondary { background: rgba(18, 12, 8, 0.75); color: #d1c5a5; }
    @media (max-width: 640px) {
      .st-rh-preview-dialog {
        width: 100vw;
        max-width: 100vw;
        margin: 0;
        min-height: 100dvh;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .st-rh-preview-wrap {
        width: 100vw;
        max-width: 100vw;
        max-height: min(84dvh, 720px);
        border-left: none;
        border-right: none;
        border-bottom: none;
        border-radius: 14px 14px 0 0;
        box-shadow: 0 -10px 28px rgba(0,0,0,0.48);
      }
      .st-rh-preview-head {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 12px;
        background: linear-gradient(180deg, rgba(24,16,12,0.98), rgba(12,8,6,0.95));
      }
      .st-rh-preview-title {
        font-size: 14px;
        line-height: 1.4;
      }
      .st-rh-preview-body {
        padding: 10px 12px 14px;
        font-size: 13px;
      }
      .st-rh-preview-item {
        padding: 10px 11px;
      }
      .st-rh-preview-btn {
        min-height: 36px;
        padding: 6px 12px;
      }
    }
    @media (max-width: 420px) {
      .st-rh-preview-wrap {
        max-height: 88dvh;
      }
      .st-rh-preview-title {
        font-size: 13px;
      }
      .st-rh-preview-body {
        font-size: 12px;
      }
      .st-rh-preview-btn {
        min-height: 34px;
        font-size: 12px;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensurePreviewDialogEvent(): HTMLDialogElement {
  const existed = document.getElementById("st-roll-event-preview-dialog") as HTMLDialogElement | null;
  if (existed) return existed;
  ensurePreviewDialogStyleEvent();
  const dialog = document.createElement("dialog");
  dialog.id = "st-roll-event-preview-dialog";
  dialog.className = "st-rh-preview-dialog";
  dialog.innerHTML = `
    <div class="st-rh-preview-wrap">
      <div class="st-rh-preview-head">
        <div class="st-rh-preview-title" data-preview-title="1"></div>
        <button type="button" class="st-rh-preview-btn secondary" data-preview-close="1">关闭</button>
      </div>
      <div class="st-rh-preview-body" data-preview-body="1"></div>
    </div>
  `;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  });
  document.body.appendChild(dialog);
  return dialog;
}

function buildSkillPreviewHtmlEvent(skillTableText: string): string {
  const items = parseSkillPreviewItemsEvent(skillTableText);
  if (items.length <= 0) return `<div class="st-rh-preview-empty">当前主角技能为空。</div>`;
  return `<ul class="st-rh-preview-list">${items
    .map(
      (item) =>
        `<li class="st-rh-preview-item"><strong>${escapePreviewHtmlEvent(item.name)}</strong>：${item.modifier >= 0 ? `+${item.modifier}` : item.modifier}</li>`
    )
    .join("")}</ul>`;
}

function buildStatusPreviewHtmlEvent(meta: DiceMetaEvent): string {
  const statuses = Array.isArray(meta.activeStatuses) ? meta.activeStatuses.filter((item) => item?.enabled !== false) : [];
  if (statuses.length <= 0) return `<div class="st-rh-preview-empty">当前没有生效状态。</div>`;
  return `<ul class="st-rh-preview-list">${statuses
    .map((item) => {
      const scopeText = item.scope === "all" ? "全局" : Array.isArray(item.skills) && item.skills.length > 0 ? item.skills.join("|") : "当前技能";
      const rounds = formatStatusRemainingRoundsLabelEvent(item.remainingRounds);
      const modifier = Number(item.modifier) || 0;
      return `<li class="st-rh-preview-item"><strong>${escapePreviewHtmlEvent(item.name)}</strong>：${modifier >= 0 ? `+${modifier}` : modifier} ｜ 范围=${escapePreviewHtmlEvent(scopeText)} ｜ ${escapePreviewHtmlEvent(rounds)}</li>`;
    })
    .join("")}</ul>`;
}

/**
 * 功能：把暗骰来源代码转换为便于阅读的中文标签。
 * 参数：
 *   origin：暗骰来源类型。
 * 返回：
 *   string：暗骰来源说明。
 */
function formatBlindHistoryOriginLabelEvent(origin?: "slash_broll" | "event_blind" | "interactive_blind"): string {
  if (origin === "slash_broll") return "命令暗骰";
  if (origin === "interactive_blind") return "交互暗骰";
  if (origin === "event_blind") return "事件暗骰";
  return "暗骰";
}

/**
 * 功能：把时间戳转换为本地可读时间文本。
 * 参数：
 *   value：时间戳。
 * 返回：
 *   string：格式化后的时间文本。
 */
function formatBlindHistoryTimeEvent(value: number): string {
  if (!Number.isFinite(Number(value))) return "未知时间";
  try {
    return new Date(Number(value)).toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "未知时间";
  }
}

/**
 * 功能：构建暗骰历史预览弹窗的列表 HTML。
 * 参数：
 *   meta：运行时骰子元数据。
 * 返回：
 *   string：暗骰历史列表 HTML。
 */
function buildBlindHistoryPreviewHtmlEvent(meta: DiceMetaEvent): string {
  const history = Array.isArray(meta.blindHistory) ? [...meta.blindHistory] : [];
  if (history.length <= 0) {
    return `<div class="st-rh-preview-empty">当前还没有暗骰记录。</div>`;
  }
  history.sort((left, right) => Number(right?.rolledAt || 0) - Number(left?.rolledAt || 0));
  return `<ul class="st-rh-preview-list">${history
    .map((item) => {
      const title = escapePreviewHtmlEvent(item.eventTitle || "暗骰检定");
      const skill = escapePreviewHtmlEvent(item.skill || "未指定");
      const target = escapePreviewHtmlEvent(item.targetLabel || "未指定");
      const expr = escapePreviewHtmlEvent(item.diceExpr || "1d20");
      const origin = escapePreviewHtmlEvent(formatBlindHistoryOriginLabelEvent(item.origin));
      const rolledAt = escapePreviewHtmlEvent(formatBlindHistoryTimeEvent(item.rolledAt));
      return `<li class="st-rh-preview-item"><strong>${title}</strong><div>技能：${skill}</div><div>目标：${target}</div><div>骰式：${expr}</div><div>来源：${origin}</div><div>时间：${rolledAt}</div></li>`;
    })
    .join("")}</ul>`;
}

function openPreviewDialogEvent(kind: "skills" | "statuses" | "blind-history", deps: BindEventButtonsDepsEvent): void {
  const dialog = ensurePreviewDialogEvent();
  const titleNode = dialog.querySelector<HTMLElement>("[data-preview-title=\"1\"]");
  const bodyNode = dialog.querySelector<HTMLElement>("[data-preview-body=\"1\"]");
  if (!titleNode || !bodyNode) return;

  const settings = deps.getSettingsEvent();
  if (kind === "skills") {
    titleNode.textContent = "技能预览（当前主角）";
    bodyNode.innerHTML = settings.enableSkillSystem === false
      ? `<div class="st-rh-preview-empty">技能系统已关闭。</div>`
      : buildSkillPreviewHtmlEvent(String(settings.skillTableText ?? "{}"));
  } else if (kind === "blind-history") {
    titleNode.textContent = "暗骰列表（当前聊天）";
    bodyNode.innerHTML = buildBlindHistoryPreviewHtmlEvent(deps.getDiceMetaEvent());
  } else {
    titleNode.textContent = "状态预览（当前生效）";
    bodyNode.innerHTML = buildStatusPreviewHtmlEvent(deps.getDiceMetaEvent());
  }

  if (!dialog.open) {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
  }
}

export function bindEventButtonsEvent(deps: BindEventButtonsDepsEvent): void {
  const globalRef = globalThis as any;
  ensureSharedTooltip();
  ensureSSToolbarEvent();
  if (globalRef.__stRollEventButtonsBoundEvent) return;

  document.addEventListener(
    "click",
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const previewOpenButton = target.closest(
        "button[data-event-preview-open]"
      ) as HTMLButtonElement | null;
      if (previewOpenButton) {
        event.preventDefault();
        event.stopPropagation();
        const kind = String(previewOpenButton.dataset.eventPreviewOpen ?? "").toLowerCase();
        if (kind === "skills" || kind === "statuses" || kind === "blind-history") {
          openPreviewDialogEvent(kind, deps);
        }
        return;
      }

      const previewCloseButton = target.closest(
        "button[data-preview-close=\"1\"]"
      ) as HTMLButtonElement | null;
      if (previewCloseButton) {
        event.preventDefault();
        const dialog = ensurePreviewDialogEvent();
        if (dialog.open) dialog.close();
        return;
      }

      const collapseToggleButton = target.closest(
        "button[data-rh-collapse-toggle='1']"
      ) as HTMLButtonElement | null;
      if (collapseToggleButton) {
        event.preventDefault();
        event.stopPropagation();
        const card = collapseToggleButton.closest(
          "[data-rh-collapsible-card='1']"
        ) as HTMLElement | null;
        if (!card) return;
        const isCollapsed = card.classList.contains("is-collapsed");
        const nextExpanded = isCollapsed;
        card.classList.toggle("is-collapsed", !nextExpanded);
        collapseToggleButton.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
        const expandLabel = collapseToggleButton.dataset.labelExpand || "展开详情";
        const collapseLabel = collapseToggleButton.dataset.labelCollapse || "收起详情";
        const labelNode = collapseToggleButton.querySelector<HTMLElement>("[data-rh-collapse-label='1']");
        if (labelNode) {
          labelNode.textContent = nextExpanded ? collapseLabel : expandLabel;
        }
        return;
      }

      const button = target.closest(
        "button[data-dice-event-roll='1']"
      ) as HTMLButtonElement | null;
      if (button) {
        // 当前事件卡在 <summary> 中放置了检定按钮；阻断默认行为可避免触发 details 折叠切换。
        event.preventDefault();
        event.stopPropagation();

        const eventId = button.getAttribute("data-dice-event-id") || "";
        const expr = button.getAttribute("data-dice-expr") || "";
        const roundId = button.getAttribute("data-round-id") || "";
        const visibility = button.getAttribute("data-roll-visibility") || "public";
        const perform = visibility === "blind" ? deps.performBlindEventRollByIdEvent : deps.performEventRollByIdEvent;
        perform(eventId, expr || undefined, roundId || undefined).then(result => {
          if (result) logger.warn(result);
        });
        return;
      }

      const rerollButton = target.closest(
        "button[data-dice-event-reroll='1']"
      ) as HTMLButtonElement | null;
      if (!rerollButton) return;

      event.preventDefault();
      event.stopPropagation();

      const eventId = rerollButton.getAttribute("data-dice-event-id") || "";
      const roundId = rerollButton.getAttribute("data-round-id") || "";
      const visibility =
        rerollButton.getAttribute("data-reroll-visibility")
        || rerollButton.getAttribute("data-roll-visibility")
        || "public";
      logger.info(`[重投] event=${eventId} visibility=${visibility}`);
      const reroll =
        visibility === "blind"
          ? deps.rerollBlindEventByIdEvent
          : deps.rerollEventByIdEvent;
      reroll(eventId, roundId || undefined).then(result => {
        if (result) logger.warn(result);
      });
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
  void deps.loadChatScopedStateIntoRuntimeEvent("hook_register_init").catch((error) => {
    logger.warn("聊天级状态初始化装载失败", error);
  });


  const promptEvents = Array.from(
    new Set(
      [types.CHAT_COMPLETION_PROMPT_READY, "chat_completion_prompt_ready"].filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    )
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

  const messageReceivedEvents = Array.from(
    new Set(
      [types.MESSAGE_RECEIVED, "message_received"].filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    )
  );
  const streamSnapshotEvents = Array.from(
    new Set(
      [
        types.STREAM_TOKEN_RECEIVED,
        "stream_token_received",
      ].filter((item): item is string => typeof item === "string" && item.length > 0)
    )
  );

  const runAssistantFinalizePassEvent = (reason: string, delayMs: number, eventArgs: unknown[]): void => {
    setTimeout(() => {
      try {
        const target = resolveAssistantEventTargetEvent(eventArgs, deps);
        if (!target) return;
        if (reason === (types.MESSAGE_RECEIVED || "message_received") || reason === "message_received") {
          beginAssistantGenerationSessionEvent(target, reason, deps);
        }
        const finalized = tryFinalizeAssistantGenerationSessionEvent(target);
        if (!finalized.shouldFinalize) {
          logger.info(`[内容处理] 跳过重复最终处理 source=${reason} session=${finalized.sessionKey}`);
          return;
        }
        logger.info(`[内容处理] 进入最终消息统一处理阶段 source=${reason} delay=${delayMs}ms`);
        deps.handleGenerationEndedEvent();
        deps.sanitizeCurrentChatEventBlocksEvent();
        deps.sweepTimeoutFailuresEvent();
        deps.refreshCountdownDomEvent();
        deps.refreshAllWidgetsFromStateEvent();
        deps.enhanceInteractiveTriggersInDomEvent();
        deps.enhanceAssistantRawSourceButtonsEvent();
      } catch (error) {
        logger.warn(`最终消息后处理异常 (${reason}, ${delayMs}ms)`, error);
      }
    }, delayMs);
  };

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
        deps.handlePromptReadyEvent(payload, eventName);
      } catch (error) {
        logger.error("Prompt hook 错误", error);
      }
    });
  }

  for (const eventName of generationEvents) {
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        // 酒馆的 generation_ended 会先于 MESSAGE_RECEIVED 触发，这里只保留一个慢速兜底。
        runAssistantFinalizePassEvent(eventName, 800, eventArgs);
      } catch (error) {
        logger.error("Generation hook 错误", error);
      }
    });
  }

  for (const eventName of messageReceivedEvents) {
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        // MESSAGE_RECEIVED 发生在流式最终文本落稳之后，适合作为主处理时机。
        runAssistantFinalizePassEvent(eventName, 30, eventArgs);
      } catch (error) {
        logger.error("Message received hook 错误", error);
      }
    });
  }

  for (const eventName of streamSnapshotEvents) {
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        captureLatestAssistantOriginalSnapshotEvent(eventName, eventArgs, deps);
      } catch (error) {
        logger.warn(`流式快照保留异常 (${eventName})`, error);
      }
    });
  }

  for (const eventName of resetEvents) {
    src.on(eventName, () => {
      try {
        assistantGenerationSessionsEvent.clear();
        deps.resetRecentParseFailureLogsEvent();
        deps.clearDiceMetaEventState(eventName);
        void deps
          .loadChatScopedStateIntoRuntimeEvent(eventName)
          .catch((error) => {
            logger.warn(`聊天切换装载失败 (${eventName})`, error);
          })
          .finally(() => {
            setTimeout(() => {
              deps.sanitizeCurrentChatEventBlocksEvent();
              deps.sweepTimeoutFailuresEvent();
              deps.refreshCountdownDomEvent();
              deps.refreshAllWidgetsFromStateEvent();
              deps.enhanceInteractiveTriggersInDomEvent();
              deps.enhanceAssistantRawSourceButtonsEvent();
            }, 0);
          });
      } catch (error) {
        logger.error("Reset hook 错误", error);
      }
    });
  }

  const swipeEditEvents = Array.from(
    new Set(
      [
        types.MESSAGE_SWIPED,
        types.MESSAGE_EDITED,
        types.MESSAGE_DELETED,
        "message_swiped",
        "message_edited",
        "message_deleted",
      ].filter((item): item is string => typeof item === "string" && item.length > 0)
    )
  );

  for (const eventName of swipeEditEvents) {
    src.on(eventName, () => {
      try {
        setTimeout(() => {
          deps.reconcilePendingRoundWithCurrentChatEvent(eventName);
          deps.sanitizeCurrentChatEventBlocksEvent();
          deps.sweepTimeoutFailuresEvent();
          deps.refreshCountdownDomEvent();
          deps.refreshAllWidgetsFromStateEvent();
          deps.enhanceInteractiveTriggersInDomEvent();
          deps.enhanceAssistantRawSourceButtonsEvent();
        }, 50);
      } catch (error) {
        logger.warn("Swipe/edit widget refresh 异常", error);
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.(`[${RH_COPY_SOURCE_BUTTON_ATTR_Event}="1"]`) as HTMLElement | null;
    if (!button) return;
    const mesElement = button.closest(".mes") as HTMLElement | null;
    if (!mesElement) return;
    event.preventDefault();
    event.stopPropagation();
    const liveCtx = deps.getLiveContextEvent();
    const chat = liveCtx?.chat;
    if (!Array.isArray(chat)) return;
    const message = resolveMessageRecordByMesIdEvent(mesElement, chat as TavernMessageEvent[]);
    const originalSourceText = getAssistantOriginalSourceTextEvent(message ?? undefined);
    const fallbackText = getMessageTextSafe(message ?? undefined);
    const copyText = originalSourceText.trim() || fallbackText.trim();
    if (!copyText) {
      logger.warn("复制原格式失败：当前楼层没有可复制的原始源信息。");
      setAssistantRawSourceButtonStateEvent(button, "failed", "复制失败：当前楼层没有可复制内容");
      return;
    }
    void copyTextToClipboardEvent(copyText).then((copied) => {
      if (!copied) {
        logger.warn("复制原格式失败：浏览器未授予剪贴板权限。");
        setAssistantRawSourceButtonStateEvent(button, "failed", "复制失败：浏览器未授予剪贴板权限");
        return;
      }
      setAssistantRawSourceButtonStateEvent(
        button,
        "copied",
        originalSourceText.trim() ? "已复制原格式（含 ROLLJSON）" : "已复制当前文本"
      );
    });
  }, true);

  globalRef.__stRollEventHooksRegisteredEvent = true;
}
