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
  loadChatScopedStateIntoRuntimeEvent: (reason?: string) => Promise<void>;
  refreshAllWidgetsFromStateEvent: () => void;
  reconcilePendingRoundWithCurrentChatEvent: (reason?: string) => boolean;
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
    | "getPreferredAssistantSourceTextEvent"
    | "getMessageTextEvent"
    | "parseEventEnvelopesEvent"
    | "filterEventsByApplyScopeEvent"
  >
): ResolvedAssistantEnvelopeEvent {
  const sourceCandidates = [
    deps.getPreferredAssistantSourceTextEvent(message),
    deps.getMessageTextEvent(message),
  ].filter((item, index, array) => item && array.indexOf(item) === index);

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

  const resolvedEnvelope = resolveAssistantEnvelopeEvent(
    latestAssistant.msg,
    settings.eventApplyScope,
    deps
  );
  const chosenText = resolvedEnvelope.chosenText;
  const chosenEvents = resolvedEnvelope.chosenEvents;
  const chosenRanges = resolvedEnvelope.chosenRanges;
  const chosenShouldEndRound = resolvedEnvelope.chosenShouldEndRound;

  if (!chosenText.trim()) {
    if (retry < 4) {
      setTimeout(() => handleGenerationEndedEvent(retry + 1, deps), 100 + retry * 120);
      return;
    }
    meta.lastProcessedAssistantMsgId = assistantMsgId;
    return;
  }

  const events = chosenEvents;
  const ranges = chosenRanges;
  if (events.length === 0 && ranges.length === 0) {
    if (retry < 4) {
      setTimeout(() => handleGenerationEndedEvent(retry + 1, deps), 140 + retry * 160);
      return;
    }
    const floorInvalidated = deps.invalidatePendingRoundFloorEvent(assistantMsgId);
    const historyInvalidated = deps.invalidateSummaryHistoryFloorEvent(assistantMsgId);
    meta.lastProcessedAssistantMsgId = assistantMsgId;
    if (floorInvalidated || historyInvalidated) {
      deps.refreshAllWidgetsFromStateEvent();
      deps.refreshCountdownDomEvent();
    }
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
  } else {
    void chosenEvents;
    void closedByAiDirective;
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
  const preferredText = deps.getPreferredAssistantSourceTextEvent(message);
  const fallbackText = deps.getMessageTextEvent(message);
  const sourceText = preferredText || fallbackText;
  if (!sourceText.trim()) return fallbackText;

  const parsed = deps.parseEventEnvelopesEvent(sourceText);
  if (!Array.isArray(parsed.ranges) || parsed.ranges.length <= 0) {
    return sourceText;
  }
  return deps.removeRangesEvent(sourceText, parsed.ranges);
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
}

export interface BindEventButtonsDepsEvent {
  performEventRollByIdEvent: (
    eventIdRaw: string,
    overrideExpr?: string,
    expectedRoundId?: string
  ) => Promise<string>;
  rerollEventByIdEvent: (
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
const SSHELPER_TOOLBAR_ARIA_EXPAND_Event = "展开 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event = "收起 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_SKILLS_Event = "打开技能预览";
const SSHELPER_TOOLBAR_ARIA_STATUSES_Event = "打开状态预览";

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

function openPreviewDialogEvent(kind: "skills" | "statuses", deps: BindEventButtonsDepsEvent): void {
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
        if (kind === "skills" || kind === "statuses") {
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
        deps.performEventRollByIdEvent(eventId, expr || undefined, roundId || undefined).then(result => {
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
      deps.rerollEventByIdEvent(eventId, roundId || undefined).then(result => {
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
        }, 50);
      } catch (error) {
        logger.warn("Swipe/edit widget refresh 异常", error);
      }
    });
  }

  globalRef.__stRollEventHooksRegisteredEvent = true;
}
