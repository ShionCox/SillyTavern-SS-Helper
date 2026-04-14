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
import { jumpToTriggerFromDatasetEvent } from "../Components/rollConsoleEvent";
import {
  buildAssistantOriginalSourceMetaEvent,
  ensureAssistantOriginalSnapshotPersistedEvent,
  getMessageTextSafe,
  rememberAssistantOriginalSourceTextEvent,
  resetAssistantSwipeRuntimeStateEvent,
  sanitizeAssistantMessageArtifactsEvent,
} from "./messageSanitizerEvent";
import { archiveBlindHistoryItemsEvent, formatBlindHistoryDisplayStateEvent, formatResultGradeLabelEvent, resolveBlindGuidanceStateEvent } from "./roundEvent";
import { copyTextToClipboardEvent } from "../settings/skillEditorUiEvent";
import { getSelectionFallbackRemainingSummaryEvent } from "./interactiveTriggersEvent";

const RH_COPY_SOURCE_BUTTON_ATTR_Event = "data-rh-copy-source";
const RH_COPY_SOURCE_BUTTON_STYLE_ID_Event = "st-rh-copy-source-style";

function collectAssistantSourceCandidatesForHooksEvent(
  message: TavernMessageEvent,
  deps: Pick<
    EventHooksDepsEvent,
    | "getStableAssistantOriginalSourceTextEvent"
    | "getHostOriginalSourceTextEvent"
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
  >
): string[] {
  return [
    deps.getStableAssistantOriginalSourceTextEvent(message),
    deps.getHostOriginalSourceTextEvent(message),
    deps.getPreferredAssistantSourceTextEvent(message),
    deps.getMessageTextEvent(message),
  ].filter((item, index, array) => item && array.indexOf(item) === index);
}

export interface EventHooksDepsEvent {
  getLiveContextEvent: () => STContext | null;
  eventSource: any;
  event_types: Record<string, string> | undefined;
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
    enableAiRoundControl: boolean;
    defaultBlindSkillsText?: string;
  };
  getDiceMetaEvent: () => DiceMetaEvent;
  isAssistantMessageEvent: (message: TavernMessageEvent | undefined) => boolean;
  buildAssistantMessageIdEvent: (message: TavernMessageEvent, index: number) => string;
  buildAssistantFloorKeyEvent: (assistantMsgId: string) => string | null;
  getStableAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getHostOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound?: boolean;
  };
  filterEventsByApplyScopeEvent: (
    events: DiceEventSpecEvent[],
    applyScope: "protagonist_only" | "all"
  ) => DiceEventSpecEvent[];
  removeRangesEvent: (text: string, ranges: Array<{ start: number; end: number }>) => string;
  setMessageTextEvent: (message: TavernMessageEvent, text: string) => void;
  resetRecentParseFailureLogsEvent: () => void;
  extractPromptChatFromPayloadEvent: (payload: any) => any[] | null;
  handlePromptReadyEvent: (payload: any, sourceEvent?: string) => void;
  resetAssistantProcessedStateEvent: () => void;
  clearDiceMetaEventState: (reason?: string) => void;
  sanitizeCurrentChatEventBlocksEvent: () => void;
  hideEventCodeBlocksInDomEvent: () => void;
  persistChatSafeEvent: () => void;
  mergeEventsIntoPendingRoundEvent: (
    events: DiceEventSpecEvent[],
    assistantMsgId: string
  ) => PendingRoundEvent;
  invalidatePendingRoundFloorEvent: (assistantMsgId: string) => boolean;
  invalidateSummaryHistoryFloorEvent: (assistantMsgId: string) => boolean;
  autoRollEventsByAiModeEvent: (round: PendingRoundEvent) => Promise<string[]>;
  sweepTimeoutFailuresEvent: () => boolean;
  refreshCountdownDomEvent: () => void;
  loadChatScopedStateIntoRuntimeEvent: (reason?: string) => Promise<void>;
  refreshAllWidgetsFromStateEvent: () => void;
  enhanceInteractiveTriggersInDomEvent: () => void;
  enhanceAssistantRawSourceButtonsEvent: () => void;
  saveMetadataSafeEvent: () => void;
}

export interface FinalizeAssistantFloorDataDepsEvent {
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
    enableAiRoundControl: boolean;
    defaultBlindSkillsText?: string;
  };
  getDiceMetaEvent: () => DiceMetaEvent;
  buildAssistantMessageIdEvent: (message: TavernMessageEvent, index: number) => string;
  buildAssistantFloorKeyEvent: (assistantMsgId: string) => string | null;
  getStableAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getHostOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound?: boolean;
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
  getStableAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getHostOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getPreferredAssistantSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getMessageTextEvent: (message: TavernMessageEvent | undefined) => string;
  parseEventEnvelopesEvent: (text: string) => {
    events: DiceEventSpecEvent[];
    ranges: Array<{ start: number; end: number }>;
    shouldEndRound?: boolean;
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

type AssistantFloorLifecycleReasonEvent =
  | "stream_snapshot"
  | "message_received_finalize"
  | "generation_ended_finalize"
  | "message_swiped"
  | "message_edited"
  | "message_deleted"
  | "chat_reset"
  | "chat_changed"
  | "hydrate_restore";

type AssistantFloorLifecycleContextEvent = {
  reason: AssistantFloorLifecycleReasonEvent;
  message: TavernMessageEvent | null;
  index: number | null;
  assistantMsgId: string | null;
  floorKey: string | null;
  isLatestAssistant: boolean;
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
    FinalizeAssistantFloorDataDepsEvent,
    | "getStableAssistantOriginalSourceTextEvent"
    | "getHostOriginalSourceTextEvent"
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
    | "parseEventEnvelopesEvent"
    | "filterEventsByApplyScopeEvent"
  >
): ResolvedAssistantEnvelopeEvent {
  const sourceCandidates = collectAssistantSourceCandidatesForHooksEvent(message, deps);

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

function isFinalizeLifecycleReasonEvent(reason: AssistantFloorLifecycleReasonEvent): boolean {
  return reason === "message_received_finalize" || reason === "generation_ended_finalize";
}

function isChatRestoreLifecycleReasonEvent(reason: AssistantFloorLifecycleReasonEvent): boolean {
  return reason === "chat_reset" || reason === "chat_changed" || reason === "hydrate_restore";
}

function isGlobalReconcileLifecycleReasonEvent(reason: AssistantFloorLifecycleReasonEvent): boolean {
  return (
    reason === "message_swiped"
    || reason === "message_edited"
    || reason === "message_deleted"
    || isChatRestoreLifecycleReasonEvent(reason)
  );
}

function resolveAssistantFloorLifecycleContextEvent(args: {
  reason: AssistantFloorLifecycleReasonEvent;
  target?: AssistantMessageTargetEvent | null;
  eventArgs?: unknown[];
  deps: Pick<
    EventHooksDepsEvent,
    | "getLiveContextEvent"
    | "isAssistantMessageEvent"
    | "buildAssistantMessageIdEvent"
    | "buildAssistantFloorKeyEvent"
  >;
}): AssistantFloorLifecycleContextEvent {
  const liveCtx = args.deps.getLiveContextEvent();
  const chat = Array.isArray(liveCtx?.chat) ? (liveCtx?.chat as TavernMessageEvent[]) : [];
  const target = args.target ?? resolveAssistantEventTargetEvent(args.eventArgs ?? [], args.deps);
  const latestAssistant = chat.length > 0
    ? findLatestAssistantEvent(chat, { isAssistantMessageEvent: args.deps.isAssistantMessageEvent })
    : null;
  const assistantMsgId = target
    ? args.deps.buildAssistantMessageIdEvent(target.msg, target.index)
    : null;
  const floorKey = assistantMsgId
    ? args.deps.buildAssistantFloorKeyEvent(assistantMsgId)
    : null;

  return {
    reason: args.reason,
    message: target?.msg ?? null,
    index: typeof target?.index === "number" ? target.index : null,
    assistantMsgId,
    floorKey,
    isLatestAssistant: Boolean(
      target
      && latestAssistant
      && latestAssistant.index === target.index
      && latestAssistant.msg === target.msg
    ),
  };
}

export function hydrateAssistantFloorUiEvent(
  deps: Pick<
    EventHooksDepsEvent,
    | "sanitizeCurrentChatEventBlocksEvent"
    | "sweepTimeoutFailuresEvent"
    | "refreshCountdownDomEvent"
    | "refreshAllWidgetsFromStateEvent"
    | "enhanceInteractiveTriggersInDomEvent"
    | "enhanceAssistantRawSourceButtonsEvent"
    | "hideEventCodeBlocksInDomEvent"
  >
): void {
  deps.sanitizeCurrentChatEventBlocksEvent();
  deps.hideEventCodeBlocksInDomEvent();
  deps.sweepTimeoutFailuresEvent();
  deps.refreshCountdownDomEvent();
  deps.refreshAllWidgetsFromStateEvent();
  deps.enhanceInteractiveTriggersInDomEvent();
  deps.enhanceAssistantRawSourceButtonsEvent();
}

type FinalizeAssistantFloorDataResultEvent = {
  changedData: boolean;
  assistantMsgId: string | null;
  floorKey: string | null;
};

export async function finalizeAssistantFloorDataEvent(
  target: AssistantMessageTargetEvent | null,
  deps: FinalizeAssistantFloorDataDepsEvent
): Promise<FinalizeAssistantFloorDataResultEvent> {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled || !target) {
    return { changedData: false, assistantMsgId: null, floorKey: null };
  }

  const meta = deps.getDiceMetaEvent();
  const originalSnapshotChanged = ensureAssistantOriginalSnapshotPersistedEvent(target.msg, {
    getHostOriginalSourceTextEvent: deps.getHostOriginalSourceTextEvent,
    getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
    getMessageTextEvent: deps.getMessageTextEvent,
    parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
  });
  const assistantMsgId = deps.buildAssistantMessageIdEvent(target.msg, target.index);
  const floorKey = deps.buildAssistantFloorKeyEvent(assistantMsgId);
  if (meta.lastProcessedAssistantMsgId === assistantMsgId) {
    if (originalSnapshotChanged) {
      deps.persistChatSafeEvent();
    }
    return {
      changedData: originalSnapshotChanged,
      assistantMsgId,
      floorKey,
    };
  }

  const resolvedEnvelope = resolveAssistantEnvelopeEvent(
    target.msg,
    settings.eventApplyScope,
    deps
  );
  const chosenText = resolvedEnvelope.chosenText;
  const chosenEvents = resolvedEnvelope.chosenEvents;
  const chosenRanges = resolvedEnvelope.chosenRanges;
  const chosenShouldEndRound = resolvedEnvelope.chosenShouldEndRound;
  const sourceCandidates = collectAssistantSourceCandidatesForHooksEvent(target.msg, deps);
  const fallbackSnapshotText = sourceCandidates.find((item) => String(item ?? "").trim()) || "";

  if (!chosenText.trim()) {
    if (originalSnapshotChanged) {
      deps.persistChatSafeEvent();
    }
    return {
      changedData: originalSnapshotChanged,
      assistantMsgId,
      floorKey,
    };
  }

  meta.lastProcessedAssistantMsgId = assistantMsgId;
  const snapshotText = chosenText.trim() || fallbackSnapshotText.trim();
  const latestSnapshotChanged = snapshotText
    ? rememberAssistantOriginalSourceTextEvent(
      target.msg,
      snapshotText,
      true,
      buildAssistantOriginalSourceMetaEvent(snapshotText, "plugin_snapshot", {
        parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
      })
    )
    : false;

  let changedData = originalSnapshotChanged || latestSnapshotChanged;
  const cleaned = deps.removeRangesEvent(chosenText, chosenRanges);
  if (cleaned !== deps.getMessageTextEvent(target.msg)) {
    deps.setMessageTextEvent(target.msg, cleaned);
    changedData = true;
  }
  const sanitizeChanged = sanitizeAssistantMessageArtifactsEvent(target.msg, target.index, {
    getSettingsEvent: deps.getSettingsEvent,
    getHostOriginalSourceTextEvent: deps.getHostOriginalSourceTextEvent,
    getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
    getMessageTextEvent: deps.getMessageTextEvent,
    parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
    removeRangesEvent: deps.removeRangesEvent,
    setMessageTextEvent: deps.setMessageTextEvent,
    resolveSourceMessageIdEvent: () => assistantMsgId,
    sourceState: "raw_source",
  });
  changedData = changedData || sanitizeChanged;

  const pendingRound = meta.pendingRound;
  if (pendingRound?.status === "open" && settings.enableAiRoundControl && chosenShouldEndRound) {
    pendingRound.status = "closed";
    changedData = true;
  }

  const invalidatedPending = deps.invalidatePendingRoundFloorEvent(assistantMsgId);
  const invalidatedSummary = deps.invalidateSummaryHistoryFloorEvent(assistantMsgId);
  changedData = changedData || invalidatedPending || invalidatedSummary;

  if (chosenEvents.length > 0) {
    const round = deps.mergeEventsIntoPendingRoundEvent(chosenEvents, assistantMsgId);
    changedData = true;
    const autoRolled = await deps.autoRollEventsByAiModeEvent(round);
    if (autoRolled.length > 0) {
      changedData = true;
    }
  }

  if (changedData) {
    deps.persistChatSafeEvent();
    deps.saveMetadataSafeEvent();
  }

  return {
    changedData,
    assistantMsgId,
    floorKey,
  };
}

type ReconcileAssistantFloorsResultEvent = {
  changedData: boolean;
  rebuiltFloorKeys: string[];
};

export async function reconcileAllTrackedAssistantFloorsEvent(
  reason = "chat_mutated",
  deps: EventHooksDepsEvent
): Promise<ReconcileAssistantFloorsResultEvent> {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled) return { changedData: false, rebuiltFloorKeys: [] };

  const liveCtx = deps.getLiveContextEvent();
  if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) {
    return { changedData: false, rebuiltFloorKeys: [] };
  }

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;

  const currentFloors = new Map<string, { assistantMsgId: string; message: TavernMessageEvent; index: number }>();
  const chat = liveCtx.chat as TavernMessageEvent[];
  for (let index = 0; index < chat.length; index += 1) {
    const message = chat[index];
    if (!deps.isAssistantMessageEvent(message)) continue;
    const assistantMsgId = deps.buildAssistantMessageIdEvent(message, index);
    const floorKey = deps.buildAssistantFloorKeyEvent(assistantMsgId);
    if (!floorKey) continue;
    currentFloors.set(floorKey, { assistantMsgId, message, index });
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
  if (trackedFloors.size <= 0) return { changedData: false, rebuiltFloorKeys: [] };

  let changedData = false;
  const rebuiltFloorKeys = new Set<string>();

  for (const [floorKey, storedAssistantMsgId] of trackedFloors) {
    const current = currentFloors.get(floorKey);
    if (!current) {
      changedData = deps.invalidatePendingRoundFloorEvent(storedAssistantMsgId) || changedData;
      changedData = deps.invalidateSummaryHistoryFloorEvent(storedAssistantMsgId) || changedData;
      rebuiltFloorKeys.add(floorKey);
      continue;
    }
    if (current.assistantMsgId === storedAssistantMsgId) {
      continue;
    }

    const finalized = await finalizeAssistantFloorDataEvent({
      msg: current.message,
      index: current.index,
    }, deps);
    changedData = changedData || finalized.changedData;
    rebuiltFloorKeys.add(floorKey);
  }

  if (changedData) {
    logger.info(`[楼层对账] 已同步未归档轮次 reason=${reason}`);
  }
  return {
    changedData,
    rebuiltFloorKeys: Array.from(rebuiltFloorKeys),
  };
}

export async function rebuildAssistantFloorLifecycleEvent(args: {
  reason: AssistantFloorLifecycleReasonEvent;
  target?: AssistantMessageTargetEvent | null;
  eventArgs?: unknown[];
  deps: EventHooksDepsEvent;
}): Promise<{
  changedData: boolean;
  changedUi: boolean;
  rebuiltFloorKeys: string[];
}> {
  const context = resolveAssistantFloorLifecycleContextEvent({
    reason: args.reason,
    target: args.target,
    eventArgs: args.eventArgs,
    deps: args.deps,
  });
  let changedData = false;
  const rebuiltFloorKeys = new Set<string>();

  if (args.reason === "stream_snapshot") {
    if (!context.message || context.index == null) {
      return { changedData: false, changedUi: false, rebuiltFloorKeys: [] };
    }
    const target = { msg: context.message, index: context.index };
    const sessionKey = beginAssistantGenerationSessionEvent(target, args.reason, args.deps);
    const changed = ensureAssistantOriginalSnapshotPersistedEvent(target.msg, {
      getHostOriginalSourceTextEvent: args.deps.getHostOriginalSourceTextEvent,
      getPreferredAssistantSourceTextEvent: args.deps.getPreferredAssistantSourceTextEvent,
      getMessageTextEvent: args.deps.getMessageTextEvent,
      parseEventEnvelopesEvent: args.deps.parseEventEnvelopesEvent,
    });
    if (changed) {
      args.deps.persistChatSafeEvent();
      logger.info(`[内容处理] 已提前保留助手原文快照 source=${args.reason} session=${sessionKey}`);
    }
    return {
      changedData: changed,
      changedUi: false,
      rebuiltFloorKeys: context.floorKey ? [context.floorKey] : [],
    };
  }

  if (isFinalizeLifecycleReasonEvent(args.reason)) {
    if (!context.message || context.index == null) {
      return { changedData: false, changedUi: false, rebuiltFloorKeys: [] };
    }
    const target = { msg: context.message, index: context.index };
    if (args.reason === "message_received_finalize") {
      beginAssistantGenerationSessionEvent(target, args.reason, args.deps);
    }
    const finalized = tryFinalizeAssistantGenerationSessionEvent(target);
    if (!finalized.shouldFinalize) {
      logger.info(`[内容处理] 跳过重复最终处理 source=${args.reason} session=${finalized.sessionKey}`);
      return { changedData: false, changedUi: false, rebuiltFloorKeys: [] };
    }
    logger.info(`[内容处理] 进入统一楼层重建 source=${args.reason} session=${finalized.sessionKey}`);
    const result = await finalizeAssistantFloorDataEvent(target, args.deps);
    changedData = result.changedData;
    if (result.floorKey) {
      rebuiltFloorKeys.add(result.floorKey);
    }
  }

  if (isGlobalReconcileLifecycleReasonEvent(args.reason)) {
    if (args.reason === "message_edited" && context.message && context.index != null) {
      const targetedChanged = sanitizeAssistantMessageArtifactsEvent(context.message, context.index, {
        getSettingsEvent: args.deps.getSettingsEvent,
        getHostOriginalSourceTextEvent: args.deps.getHostOriginalSourceTextEvent,
        getPreferredAssistantSourceTextEvent: args.deps.getPreferredAssistantSourceTextEvent,
        getMessageTextEvent: args.deps.getMessageTextEvent,
        parseEventEnvelopesEvent: args.deps.parseEventEnvelopesEvent,
        removeRangesEvent: args.deps.removeRangesEvent,
        setMessageTextEvent: args.deps.setMessageTextEvent,
        resolveSourceMessageIdEvent: (message, index) => (
          index == null ? "" : args.deps.buildAssistantMessageIdEvent(message, index)
        ),
        sourceState: "edited_source",
      });
      if (targetedChanged) {
        args.deps.persistChatSafeEvent();
        changedData = true;
      }
    }

    const reconcileResult = await reconcileAllTrackedAssistantFloorsEvent(args.reason, args.deps);
    changedData = changedData || reconcileResult.changedData;
    for (const floorKey of reconcileResult.rebuiltFloorKeys) {
      rebuiltFloorKeys.add(floorKey);
    }
  }

  if (isChatRestoreLifecycleReasonEvent(args.reason) || isGlobalReconcileLifecycleReasonEvent(args.reason) || isFinalizeLifecycleReasonEvent(args.reason)) {
    hydrateAssistantFloorUiEvent(args.deps);
    return {
      changedData,
      changedUi: true,
      rebuiltFloorKeys: Array.from(rebuiltFloorKeys),
    };
  }

  return {
    changedData,
    changedUi: false,
    rebuiltFloorKeys: Array.from(rebuiltFloorKeys),
  };
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
  deps: Pick<EventHooksDepsEvent, "getLiveContextEvent" | "getStableAssistantOriginalSourceTextEvent"> & {
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
      && Boolean(deps.getStableAssistantOriginalSourceTextEvent(message ?? undefined).trim());
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
  getStableAssistantOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
  getHostOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
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
  const sourceCandidates = collectAssistantSourceCandidatesForHooksEvent(message, deps);
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
  getHostOriginalSourceTextEvent: (message: TavernMessageEvent | undefined) => string;
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
    getHostOriginalSourceTextEvent: deps.getHostOriginalSourceTextEvent,
    getPreferredAssistantSourceTextEvent: deps.getPreferredAssistantSourceTextEvent,
    getMessageTextEvent: deps.getMessageTextEvent,
    parseEventEnvelopesEvent: deps.parseEventEnvelopesEvent,
    removeRangesEvent: deps.removeRangesEvent,
    setMessageTextEvent: deps.setMessageTextEvent,
    resolveSourceMessageIdEvent: deps.resolveSourceMessageIdEvent,
    sourceState: "display_text",
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
  delete meta.selectionFallbackState;
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
    enableBlindDebugInfo?: boolean;
    blindHistoryDisplayConsumedAsNarrativeApplied?: boolean;
    blindHistoryAutoArchiveEnabled?: boolean;
    blindHistoryAutoArchiveAfterHours?: number;
    blindHistoryShowFloorKey?: boolean;
    blindHistoryShowOrigin?: boolean;
    enableSelectionFallbackTriggers?: boolean;
    selectionFallbackLimitMode?: "char_count" | "smart_segment";
    selectionFallbackMaxPerRound?: number;
    selectionFallbackMaxPerFloor?: number;
    selectionFallbackMinTextLength?: number;
    selectionFallbackMaxTextLength?: number;
    selectionFallbackMaxSegments?: number;
    selectionFallbackLongSentenceThreshold?: number;
    selectionFallbackMaxTotalLength?: number;
    selectionFallbackLongSentenceSplitPunctuationText?: string;
    enableSelectionFallbackDebugInfo?: boolean;
  };
  getDiceMetaEvent: () => DiceMetaEvent;
  saveMetadataSafeEvent: () => void;
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
const SSHELPER_TOOLBAR_TIP_SELECTION_FALLBACK_Event = "自由划词剩余";
const SSHELPER_TOOLBAR_ARIA_EXPAND_Event = "展开 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event = "收起 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_SKILLS_Event = "打开技能预览";
const SSHELPER_TOOLBAR_ARIA_STATUSES_Event = "打开状态预览";
const SSHELPER_TOOLBAR_ARIA_BLIND_HISTORY_Event = "打开暗骰列表";
const SSHELPER_TOOLBAR_ARIA_SELECTION_FALLBACK_Event = "查看自由划词剩余";
const SSHELPER_TOOLBAR_SELECTION_FALLBACK_STYLE_ID_Event = "st-rh-selection-fallback-toolbar-style";

const SSHELPER_TOOLBAR_GROUP_ID_Event = "rollhelper";

function ensureSelectionFallbackToolbarStyleEvent(): void {
  if (document.getElementById(SSHELPER_TOOLBAR_SELECTION_FALLBACK_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = SSHELPER_TOOLBAR_SELECTION_FALLBACK_STYLE_ID_Event;
  style.textContent = `
    .stx-sdk-toolbar-action-rollhelper-selection-fallback {
      width: auto !important;
      min-width: 64px;
      padding: 0 8px !important;
      gap: 6px !important;
    }
    .stx-sdk-toolbar-action-rollhelper-selection-fallback .stx-shared-button-label {
      display: inline !important;
      font-size: 11px;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function ensureSSToolbarEvent(): HTMLElement | null {
  ensureSelectionFallbackToolbarStyleEvent();
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
      {
        key: "selection-fallback",
        label: "--/--",
        iconClassName: "fa-solid fa-highlighter",
        tooltip: SSHELPER_TOOLBAR_TIP_SELECTION_FALLBACK_Event,
        ariaLabel: SSHELPER_TOOLBAR_ARIA_SELECTION_FALLBACK_Event,
        buttonClassName: "stx-sdk-toolbar-action-rollhelper-selection-fallback",
        attributes: {
          "data-event-preview-open": "selection-fallback",
        },
        order: 40,
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
    .st-rh-preview-card { display: flex; flex-direction: column; gap: 6px; }
    .st-rh-preview-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .st-rh-preview-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: rgba(233,221,188,0.75); }
    .st-rh-preview-card-desc { font-size: 12.5px; color: rgba(233,221,188,0.9); line-height: 1.45; }
    .st-rh-preview-jump { padding: 2px 8px; font-size: 11.5px; border-radius: 6px; }
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
      .st-rh-preview-jump {
        min-height: 32px;
        padding: 4px 10px;
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
 * 功能：把楼层键压缩成更短的显示文本，便于在列表中阅读。
 * 参数：
 *   floorKey：原始楼层键。
 * 返回：
 *   string：用于 UI 展示的楼层简写。
 */
function formatBlindHistoryFloorKeyEvent(floorKey?: string): string {
  const normalized = String(floorKey ?? "").trim();
  if (!normalized) return "未知楼层";
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
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
function buildBlindHistoryPreviewHtmlEvent(
  meta: DiceMetaEvent,
  settings: {
    enableBlindDebugInfo?: boolean;
    blindHistoryDisplayConsumedAsNarrativeApplied?: boolean;
    blindHistoryAutoArchiveEnabled?: boolean;
    blindHistoryAutoArchiveAfterHours?: number;
    blindHistoryShowFloorKey?: boolean;
    blindHistoryShowOrigin?: boolean;
  },
  persistArchivedStateEvent?: () => void
): string {
  if (settings.blindHistoryAutoArchiveEnabled !== false) {
    const archiveBeforeTime = Date.now() - Math.max(1, Math.floor(Number(settings.blindHistoryAutoArchiveAfterHours ?? 24))) * 60 * 60 * 1000;
    if (archiveBlindHistoryItemsEvent(meta, archiveBeforeTime)) {
      persistArchivedStateEvent?.();
    }
  }
  const history = Array.isArray(meta.blindHistory) ? [...meta.blindHistory] : [];
  if (history.length <= 0) {
    return `<div class="st-rh-preview-empty">当前还没有暗骰记录。</div>`;
  }
  history.sort((left, right) => Number(right?.rolledAt || 0) - Number(left?.rolledAt || 0));
  const buildHistoryItemsHtml = (items: typeof history): string => items
    .map((item) => {
      const title = escapePreviewHtmlEvent(item.eventTitle || "暗骰检定");
      const target = escapePreviewHtmlEvent(item.targetLabel || "");
      const rolledAt = escapePreviewHtmlEvent(formatBlindHistoryTimeEvent(item.rolledAt));
      const stateText = escapePreviewHtmlEvent(
        formatBlindHistoryDisplayStateEvent(
          resolveBlindGuidanceStateEvent(item),
          settings.blindHistoryDisplayConsumedAsNarrativeApplied !== false,
          item.revealMode === "instant" ? "instant" : "delayed"
        )
      );
      const revealLabel = item.revealMode === "instant" ? "即时反馈" : "延迟体现";
      const gradeLabel = item.resultGrade
        ? formatResultGradeLabelEvent(item.resultGrade, "blind")
        : "未知";
      const gradeHtml = item.resultGrade
        ? `<span>结果等级：${escapePreviewHtmlEvent(gradeLabel)}</span>`
        : "";
      const originHtml = settings.blindHistoryShowOrigin !== false
        ? `<span>来源：${escapePreviewHtmlEvent(formatBlindHistoryOriginLabelEvent(item.origin))}</span>`
        : "";
      const floorHtml = settings.blindHistoryShowFloorKey !== false
        ? `<span>楼层：${escapePreviewHtmlEvent(formatBlindHistoryFloorKeyEvent(item.sourceFloorKey))}</span>`
        : "";
      const targetHtml = target ? `<div class="st-rh-preview-card-desc">线索：${target}</div>` : "";
      const debugHtml = settings.enableBlindDebugInfo
        ? [
            item.roundId ? `<div>轮次：${escapePreviewHtmlEvent(String(item.roundId).slice(0, 24))}</div>` : "",
            item.dedupeKey ? `<div>去重键：${escapePreviewHtmlEvent(item.dedupeKey)}</div>` : "",
          ].filter(Boolean).join("")
        : "";
      const sourceMessageId = escapePreviewHtmlEvent(item.sourceAssistantMsgId || "");
      const sourceFloorKey = escapePreviewHtmlEvent(item.sourceFloorKey || "");
      return `
        <li class="st-rh-preview-item st-rh-preview-card">
          <div class="st-rh-preview-card-head">
            <strong>${title}</strong>
            <button class="st-rh-preview-btn st-rh-preview-jump" data-rh-jump="1"
              data-rh-jump-source-message="${sourceMessageId}"
              data-rh-jump-floor-key="${sourceFloorKey}"
              data-rh-jump-source-id=""
              data-rh-jump-occurrence="0">跳转</button>
          </div>
          <div class="st-rh-preview-card-meta">
            <span>模式：${escapePreviewHtmlEvent(revealLabel)}</span>
            <span>状态：${stateText}</span>
            ${gradeHtml}
          </div>
          ${targetHtml}
          <div class="st-rh-preview-card-meta">
            ${originHtml}
            ${floorHtml}
            <span>时间：${rolledAt}</span>
          </div>
          ${debugHtml}
        </li>
      `;
    })
    .join("");
  const activeItems = history.filter((item) => resolveBlindGuidanceStateEvent(item) !== "archived");
  const archivedItems = history.filter((item) => resolveBlindGuidanceStateEvent(item) === "archived");
  const activeHtml = activeItems.length > 0
    ? `<ul class="st-rh-preview-list">${buildHistoryItemsHtml(activeItems)}</ul>`
    : `<div class="st-rh-preview-empty">当前没有未归档的暗骰记录。</div>`;
  const archivedHtml = archivedItems.length > 0
    ? `<details class="st-rh-preview-archived"><summary>已归档（${archivedItems.length}）</summary><ul class="st-rh-preview-list">${buildHistoryItemsHtml(archivedItems)}</ul></details>`
    : "";
  return `${activeHtml}${archivedHtml}`;
}

function buildSelectionFallbackPreviewHtmlEvent(
  meta: DiceMetaEvent,
  settings: {
    enableSelectionFallbackTriggers?: boolean;
    selectionFallbackLimitMode?: "char_count" | "smart_segment";
    selectionFallbackMaxPerRound?: number;
    selectionFallbackMaxPerFloor?: number;
    selectionFallbackMinTextLength?: number;
    selectionFallbackMaxTextLength?: number;
    selectionFallbackMaxSegments?: number;
    selectionFallbackLongSentenceThreshold?: number;
    selectionFallbackMaxTotalLength?: number;
    selectionFallbackLongSentenceSplitPunctuationText?: string;
  }
): string {
  if (!settings.enableSelectionFallbackTriggers) {
    return `<div class="st-rh-preview-empty">自由划词兜底检定当前处于关闭状态。</div>`;
  }
  const summary = getSelectionFallbackRemainingSummaryEvent({
    ...settings,
    selectionFallbackLimitMode: settings.selectionFallbackLimitMode === "char_count" ? "char_count" : "smart_segment",
    selectionFallbackMaxPerRound: Number(settings.selectionFallbackMaxPerRound ?? 3),
    selectionFallbackMaxPerFloor: Number(settings.selectionFallbackMaxPerFloor ?? 2),
    selectionFallbackMinTextLength: Number(settings.selectionFallbackMinTextLength ?? 2),
    selectionFallbackMaxTextLength: Number(settings.selectionFallbackMaxTextLength ?? 10),
    selectionFallbackMaxSegments: Number(settings.selectionFallbackMaxSegments ?? 2),
    selectionFallbackLongSentenceThreshold: Number(settings.selectionFallbackLongSentenceThreshold ?? 26),
    selectionFallbackMaxTotalLength: Number(settings.selectionFallbackMaxTotalLength ?? 45),
    selectionFallbackLongSentenceSplitPunctuationText: String(settings.selectionFallbackLongSentenceSplitPunctuationText ?? ""),
  } as any, meta);
  const limitLabel = summary.limitMode === "char_count"
    ? `按字数限制（${summary.minTextLength}-${summary.maxTextLength} 字）`
    : `智能句段（最多 ${summary.maxSegments} 段 / 单句超 ${summary.longSentenceThreshold} 字补切 / 总长 ${summary.maxTotalLength} 字）`;
  return `
    <ul class="st-rh-preview-list">
      <li class="st-rh-preview-item"><strong>当前模式</strong><div>${limitLabel}</div></li>
      <li class="st-rh-preview-item"><strong>本轮剩余</strong><div>${summary.roundRemaining} / ${Number(settings.selectionFallbackMaxPerRound ?? 3)}</div></li>
      <li class="st-rh-preview-item"><strong>每楼层上限</strong><div>${Number(settings.selectionFallbackMaxPerFloor ?? 2)} 次</div></li>
      <li class="st-rh-preview-item"><strong>说明</strong><div>自由划词仅作为 AI 漏标时的兜底入口，同一楼层同一文本只允许尝试一次，且仅最新一条 AI 回复支持自由划词兜底。</div></li>
    </ul>
  `;
}

function syncSelectionFallbackToolbarEvent(deps: BindEventButtonsDepsEvent): void {
  const toolbar = ensureSSToolbarEvent();
  const button = toolbar?.querySelector<HTMLButtonElement>(".stx-sdk-toolbar-action-rollhelper-selection-fallback");
  if (!button) return;
  const settings = deps.getSettingsEvent();
  const enabled = Boolean(settings.enableSelectionFallbackTriggers);
  const summary = getSelectionFallbackRemainingSummaryEvent({
    ...settings,
    selectionFallbackLimitMode: settings.selectionFallbackLimitMode === "char_count" ? "char_count" : "smart_segment",
    selectionFallbackMaxPerRound: Number(settings.selectionFallbackMaxPerRound ?? 3),
    selectionFallbackMaxPerFloor: Number(settings.selectionFallbackMaxPerFloor ?? 2),
    selectionFallbackMinTextLength: Number(settings.selectionFallbackMinTextLength ?? 2),
    selectionFallbackMaxTextLength: Number(settings.selectionFallbackMaxTextLength ?? 10),
    selectionFallbackMaxSegments: Number(settings.selectionFallbackMaxSegments ?? 2),
    selectionFallbackLongSentenceThreshold: Number(settings.selectionFallbackLongSentenceThreshold ?? 26),
    selectionFallbackMaxTotalLength: Number(settings.selectionFallbackMaxTotalLength ?? 45),
    selectionFallbackLongSentenceSplitPunctuationText: String(settings.selectionFallbackLongSentenceSplitPunctuationText ?? ""),
  } as any, deps.getDiceMetaEvent());
  const label = enabled
    ? `自由划词 ${summary.roundRemaining}/${Number(settings.selectionFallbackMaxPerRound ?? 3)}`
    : "自由划词 关";
  const labelNode = button.querySelector<HTMLElement>(".stx-shared-button-label");
  if (labelNode) {
    labelNode.textContent = label;
  }
  const tip = enabled
    ? `自由划词剩余：${summary.roundRemaining}/${Number(settings.selectionFallbackMaxPerRound ?? 3)}（仅最新 AI 回复可用）`
    : "自由划词兜底检定已关闭";
  button.setAttribute("data-tip", tip);
  button.setAttribute("aria-label", tip);
}

function openPreviewDialogEvent(kind: "skills" | "statuses" | "blind-history" | "selection-fallback", deps: BindEventButtonsDepsEvent): void {
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
    bodyNode.innerHTML = buildBlindHistoryPreviewHtmlEvent(deps.getDiceMetaEvent(), settings, deps.saveMetadataSafeEvent);
  } else if (kind === "selection-fallback") {
    titleNode.textContent = "自由划词兜底检定";
    bodyNode.innerHTML = buildSelectionFallbackPreviewHtmlEvent(deps.getDiceMetaEvent(), settings);
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
  syncSelectionFallbackToolbarEvent(deps);
  if (globalRef.__stRollEventButtonsBoundEvent) return;

  document.addEventListener(
    "click",
    (event: Event) => {
      syncSelectionFallbackToolbarEvent(deps);
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const previewOpenButton = target.closest(
        "button[data-event-preview-open]"
      ) as HTMLButtonElement | null;
      if (previewOpenButton) {
        event.preventDefault();
        event.stopPropagation();
        syncSelectionFallbackToolbarEvent(deps);
        const kind = String(previewOpenButton.dataset.eventPreviewOpen ?? "").toLowerCase();
        if (kind === "skills" || kind === "statuses" || kind === "blind-history" || kind === "selection-fallback") {
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

      const jumpButton = target.closest(
        "[data-rh-jump=\"1\"]"
      ) as HTMLElement | null;
      if (jumpButton) {
        event.preventDefault();
        event.stopPropagation();
        const ok = jumpToTriggerFromDatasetEvent(jumpButton);
        if (!ok) {
          logger.info("暗骰跳转失败：未定位到对应触发点。");
        }
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
        setTimeout(() => {
          void rebuildAssistantFloorLifecycleEvent({
            reason: "generation_ended_finalize",
            eventArgs,
            deps,
          }).catch((error) => {
            logger.warn(`最终消息后处理异常 (${eventName}, 800ms)`, error);
          });
        }, 800);
      } catch (error) {
        logger.error("Generation hook 错误", error);
      }
    });
  }

  for (const eventName of messageReceivedEvents) {
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        // MESSAGE_RECEIVED 发生在流式最终文本落稳之后，适合作为主处理时机。
        setTimeout(() => {
          void rebuildAssistantFloorLifecycleEvent({
            reason: "message_received_finalize",
            eventArgs,
            deps,
          }).catch((error) => {
            logger.warn(`最终消息后处理异常 (${eventName}, 30ms)`, error);
          });
        }, 30);
      } catch (error) {
        logger.error("Message received hook 错误", error);
      }
    });
  }

  for (const eventName of streamSnapshotEvents) {
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        void rebuildAssistantFloorLifecycleEvent({
          reason: "stream_snapshot",
          eventArgs,
          deps,
        }).catch((error) => {
          logger.warn(`流式快照保留异常 (${eventName})`, error);
        });
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
              const normalizedEventName = String(eventName || "").toLowerCase();
              const reason: AssistantFloorLifecycleReasonEvent = normalizedEventName === "chat_reset"
                ? "chat_reset"
                : (
                  normalizedEventName === "chat_started"
                  || normalizedEventName === "chat_new"
                  || normalizedEventName === "chat_created"
                )
                  ? "hydrate_restore"
                  : "chat_changed";
              void rebuildAssistantFloorLifecycleEvent({
                reason,
                deps,
              }).catch((error) => {
                logger.warn(`聊天恢复后重建异常 (${eventName})`, error);
              });
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
    src.on(eventName, (...eventArgs: unknown[]) => {
      try {
        setTimeout(() => {
          const normalizedEventName = String(eventName || "").toLowerCase();
          const reason: AssistantFloorLifecycleReasonEvent = normalizedEventName.includes("message_edited")
            ? "message_edited"
            : normalizedEventName.includes("message_deleted")
              ? "message_deleted"
              : "message_swiped";
          void rebuildAssistantFloorLifecycleEvent({
            reason,
            eventArgs,
            deps,
          }).catch((error) => {
            logger.warn(`楼层重建异常 (${eventName})`, error);
          });
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
    const originalSourceText = deps.getStableAssistantOriginalSourceTextEvent(message ?? undefined);
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
