import type { STContext } from "../core/runtimeContextEvent";
import type {
  DiceEventSpecEvent,
  DiceMetaEvent,
  PendingRoundEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import { formatStatusRemainingRoundsLabelEvent } from "./statusEvent";
import { ensureSharedTooltipEvent } from "../Components/sharedTooltipEvent";
import { buildSharedButton } from "../../../_Components/sharedButton";

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
}

export interface HandleGenerationEndedDepsEvent {
  getSettingsEvent: () => {
    enabled: boolean;
    eventApplyScope: "protagonist_only" | "all";
    enableAiRoundControl: boolean;
    compatibilityModeForSummaryPlugins?: boolean;
    removeRollJsonFromStoredText?: boolean;
    stripRollHelperInternalBlocks?: boolean;
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
  sanitizeAssistantMessageForSummary?: (message: any, options?: { blockInternalTags?: boolean }) => any;
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

  if (settings.compatibilityModeForSummaryPlugins && settings.removeRollJsonFromStoredText) {
    if (typeof deps.sanitizeAssistantMessageForSummary === "function") {
      deps.sanitizeAssistantMessageForSummary(latestAssistant.msg, {
        blockInternalTags: settings.stripRollHelperInternalBlocks,
      });
    }
  }

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
  sanitizeAssistantMessageForSummary?: (message: any, options?: { blockInternalTags?: boolean }) => any;
  getSettingsEvent?: () => {
    compatibilityModeForSummaryPlugins?: boolean;
    removeRollJsonFromStoredText?: boolean;
    stripRollHelperInternalBlocks?: boolean;
  }
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

    // 如果启用了兼容模式，追加执行深度净化
    const settings = deps.getSettingsEvent?.();
    if (settings && settings.compatibilityModeForSummaryPlugins && settings.removeRollJsonFromStoredText) {
      if (typeof deps.sanitizeAssistantMessageForSummary === "function") {
        deps.sanitizeAssistantMessageForSummary(message, {
          blockInternalTags: settings.stripRollHelperInternalBlocks,
        });
      }
    }

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
  getSettingsEvent: () => {
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

const SSHELPER_TOOLBAR_ID_Event = "SSHELPERTOOL";
const SSHELPER_TOOLBAR_STYLE_ID_Event = "st-roll-sshelper-toolbar-style";
const SSHELPER_TOOLBAR_COLLAPSED_CLASS_Event = "is-collapsed";
const SSHELPER_TOOLBAR_MARKUP_VERSION_Event = "3";
const SSHELPER_TOOLBAR_RETRY_MAX_Event = 60;
const SSHELPER_TOOLBAR_RETRY_DELAY_MS_Event = 500;
const SSHELPER_TOOLBAR_TIP_EXPAND_Event = "展开工具栏";
const SSHELPER_TOOLBAR_TIP_COLLAPSE_Event = "收起工具栏";
const SSHELPER_TOOLBAR_TIP_SKILLS_Event = "技能预览";
const SSHELPER_TOOLBAR_TIP_STATUSES_Event = "状态预览";
const SSHELPER_TOOLBAR_ARIA_EXPAND_Event = "展开 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event = "收起 SSHELPER 工具栏";
const SSHELPER_TOOLBAR_ARIA_SKILLS_Event = "打开技能预览";
const SSHELPER_TOOLBAR_ARIA_STATUSES_Event = "打开状态预览";

/**
 * 功能：构建 SSHELPER 工具栏的内部模板。
 * 参数：无。
 * 返回：string，工具栏的 HTML 字符串。
 */
function buildSSToolbarTemplateEvent(): string {
  return `
    <div class="st-rh-ss-toolbar-shell" data-sshelper-toolbar-shell="1">
      ${buildSharedButton({
    label: "",
    className: "st-rh-ss-toggle",
    iconClassName: "fa-solid fa-angles-right",
    attributes: {
      "data-sshelper-tool-toggle": "1",
      "data-tip": SSHELPER_TOOLBAR_TIP_EXPAND_Event,
      "aria-expanded": "false",
      "aria-label": SSHELPER_TOOLBAR_ARIA_EXPAND_Event,
    },
  })}
      <div class="st-rh-ss-actions" data-sshelper-tool-actions="1">
        ${buildSharedButton({
    label: "",
    className: "st-rh-ss-preview-btn",
    iconClassName: "fa-solid fa-wand-magic-sparkles",
    attributes: {
      "data-event-preview-open": "skills",
      "data-tip": SSHELPER_TOOLBAR_TIP_SKILLS_Event,
      "aria-label": SSHELPER_TOOLBAR_ARIA_SKILLS_Event,
    },
  })}
        ${buildSharedButton({
    label: "",
    className: "st-rh-ss-preview-btn",
    iconClassName: "fa-solid fa-heart-pulse",
    attributes: {
      "data-event-preview-open": "statuses",
      "data-tip": SSHELPER_TOOLBAR_TIP_STATUSES_Event,
      "aria-label": SSHELPER_TOOLBAR_ARIA_STATUSES_Event,
    },
  })}
      </div>
    </div>
  `;
}
/**
 * 功能：确保 SSHELPER 工具栏样式只注入一次。
 * 参数：无。
 * 返回：void。
 */
function ensureSSToolbarStyleEvent(): void {
  if (document.getElementById(SSHELPER_TOOLBAR_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = SSHELPER_TOOLBAR_STYLE_ID_Event;
  style.textContent = `
    #${SSHELPER_TOOLBAR_ID_Event} {
      width: auto;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin: 0;
      padding: 6px 8px;
      box-sizing: border-box;
      border: 1px solid var(--SmartThemeBorderColor, rgba(197, 160, 89, 0.35));
      border-radius: 12px;
      background-color: var(--SmartThemeBlurTintColor, rgba(20, 16, 14, 0.82));
      backdrop-filter: blur(var(--SmartThemeBlurStrength, 8px));
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
      pointer-events: auto;
      position: absolute;
      left: 8px;
      bottom: calc(100% + 8px);
      z-index: 45;
      transition:
        background-color 0.22s ease,
        border-color 0.22s ease,
        box-shadow 0.22s ease,
        padding 0.22s ease,
        opacity 0.18s ease;
    }
    #${SSHELPER_TOOLBAR_ID_Event}.${SSHELPER_TOOLBAR_COLLAPSED_CLASS_Event} {
      padding: 0;
      border-color: transparent;
      background-color: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toolbar-shell {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: min(100%, 480px);
      padding: 2px 0;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toggle {
      width: 28px;
      height: 28px;
      border: 1px solid rgba(197, 160, 89, 0.55);
      border-radius: 8px;
      background: linear-gradient(135deg, #2b1d12, #120d09);
      color: #f1d8a1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      line-height: 1;
      padding: 0;
      transition: border-color 0.2s ease, filter 0.2s ease;
      flex: 0 0 auto;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toggle:hover {
      border-color: #efd392;
      filter: brightness(1.08);
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      overflow: visible;
      max-width: 360px;
      opacity: 1;
      transform: translateX(0);
      transform-origin: left center;
      transition: max-width 0.24s ease, transform 0.24s ease, opacity 0.18s ease;
      white-space: nowrap;
    }
    #${SSHELPER_TOOLBAR_ID_Event}.${SSHELPER_TOOLBAR_COLLAPSED_CLASS_Event} .st-rh-ss-actions {
      max-width: 0;
      opacity: 0;
      transform: translateX(-18px);
      pointer-events: none;
      visibility: hidden;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn {
      border: 1px solid rgba(197, 160, 89, 0.52);
      background: linear-gradient(135deg, rgba(58, 37, 21, 0.92), rgba(22, 14, 10, 0.94));
      color: #f1d8a1;
      border-radius: 8px;
      width: 30px;
      height: 30px;
      padding: 0;
      font-size: 13px;
      letter-spacing: 0.4px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s ease, filter 0.2s ease;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toggle .stx-shared-button-label,
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn .stx-shared-button-label {
      display: none;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toggle.stx-shared-button,
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn.stx-shared-button {
      gap: 0;
      padding: 0;
    }
    #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn:hover {
      border-color: #efd392;
      filter: brightness(1.08);
    }
    @media (max-width: 768px) {
      #${SSHELPER_TOOLBAR_ID_Event} {
        left: 6px;
        bottom: calc(100% + 6px);
        padding: 5px 6px;
      }
      #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toolbar-shell {
        max-width: 100%;
      }
      #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn {
        width: 28px;
        height: 28px;
        font-size: 12px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-actions,
      #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-toggle,
      #${SSHELPER_TOOLBAR_ID_Event} .st-rh-ss-preview-btn {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 功能：设置工具栏展开或收起状态，并同步无障碍属性。
 * 参数：
 *   toolbar (HTMLElement)：工具栏根节点。
 *   expanded (boolean)：是否展开。
 * 返回：void。
 */
function setSSToolbarExpandedEvent(toolbar: HTMLElement, expanded: boolean): void {
  toolbar.classList.toggle(SSHELPER_TOOLBAR_COLLAPSED_CLASS_Event, !expanded);
  const toggleButton = toolbar.querySelector<HTMLButtonElement>("button[data-sshelper-tool-toggle=\"1\"]");
  if (!toggleButton) return;
  toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleButton.setAttribute(
    "aria-label",
    expanded ? SSHELPER_TOOLBAR_ARIA_COLLAPSE_Event : SSHELPER_TOOLBAR_ARIA_EXPAND_Event
  );
  const toggleIcon = toggleButton.querySelector("i");
  if (toggleIcon) {
    toggleIcon.className = expanded ? "fa-solid fa-angles-left" : "fa-solid fa-angles-right";
  }
  toggleButton.dataset.tip = expanded ? SSHELPER_TOOLBAR_TIP_COLLAPSE_Event : SSHELPER_TOOLBAR_TIP_EXPAND_Event;
}
/**
 * 功能：确保工具栏节点结构正确，并在首次创建时默认收起。
 * 参数：
 *   toolbar (HTMLElement)：工具栏根节点。
 * 返回：void。
 */
function ensureSSToolbarMarkupEvent(toolbar: HTMLElement): void {
  const shell = toolbar.querySelector<HTMLElement>("[data-sshelper-toolbar-shell=\"1\"]");
  const hasSkillBtn = !!toolbar.querySelector<HTMLElement>("button[data-event-preview-open=\"skills\"]");
  const hasStatusBtn = !!toolbar.querySelector<HTMLElement>("button[data-event-preview-open=\"statuses\"]");
  const hasToggleTip = !!toolbar.querySelector<HTMLElement>("button[data-sshelper-tool-toggle=\"1\"][data-tip]");
  const needsRebuild =
    !shell ||
    !hasSkillBtn ||
    !hasStatusBtn ||
    !hasToggleTip ||
    toolbar.dataset.sshelperToolbarMarkupVersion !== SSHELPER_TOOLBAR_MARKUP_VERSION_Event;

  if (needsRebuild) {
    toolbar.innerHTML = buildSSToolbarTemplateEvent();
    toolbar.dataset.sshelperToolbarMarkupVersion = SSHELPER_TOOLBAR_MARKUP_VERSION_Event;
    delete toolbar.dataset.sshelperToolbarInitialized;
  }
  if (toolbar.dataset.sshelperToolbarInitialized !== "1") {
    setSSToolbarExpandedEvent(toolbar, false);
    toolbar.dataset.sshelperToolbarInitialized = "1";
  }
}

/**
 * 功能：在输入栏尚未加载时，按次数限制重试挂载工具栏。
 * 参数：
 *   attempt (number)：下一次重试的次数。
 * 返回：void。
 */
function scheduleSSToolbarRetryEvent(attempt: number): void {
  if (attempt > SSHELPER_TOOLBAR_RETRY_MAX_Event) return;
  setTimeout(() => {
    ensureSSToolbarEvent(attempt);
  }, SSHELPER_TOOLBAR_RETRY_DELAY_MS_Event);
}

/**
 * 功能：确保 SSHELPER 工具栏存在，并放置到 #send_form 的上方。
 * 参数：
 *   attempt (number)：当前重试次数。
 * 返回：HTMLElement | null，工具栏节点或空。
 */
function ensureSSToolbarEvent(attempt = 0): HTMLElement | null {
  ensureSSToolbarStyleEvent();
  let toolbar = document.getElementById(SSHELPER_TOOLBAR_ID_Event) as HTMLElement | null;
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = SSHELPER_TOOLBAR_ID_Event;
  }
  ensureSSToolbarMarkupEvent(toolbar);

  const sendFormCompact = document.querySelector<HTMLElement>("#send_form.compact");
  const sendForm = sendFormCompact || (document.getElementById("send_form") as HTMLElement | null);
  if (!sendForm || !sendForm.parentElement) {
    scheduleSSToolbarRetryEvent(attempt + 1);
    return toolbar;
  }

  const sendFormPosition = window.getComputedStyle(sendForm).position;
  if (sendFormPosition === "static") {
    sendForm.style.position = "relative";
  }

  if (toolbar.parentElement !== sendForm) {
    sendForm.appendChild(toolbar);
  }
  return toolbar;
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
  ensureSharedTooltipEvent();
  ensureSSToolbarEvent();
  if (globalRef.__stRollEventButtonsBoundEvent) return;

  document.addEventListener(
    "click",
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;


      const toolbarToggleButton = target.closest(
        "button[data-sshelper-tool-toggle=\"1\"]"
      ) as HTMLButtonElement | null;
      if (toolbarToggleButton) {
        event.preventDefault();
        event.stopPropagation();
        const toolbar = toolbarToggleButton.closest(`#${SSHELPER_TOOLBAR_ID_Event}`) as HTMLElement | null;
        if (toolbar) {
          const expanded = !toolbar.classList.contains(SSHELPER_TOOLBAR_COLLAPSED_CLASS_Event);
          setSSToolbarExpandedEvent(toolbar, !expanded);
        }
        return;
      }

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
      if (!button) return;

      // 当前事件卡在 <summary> 中放置了检定按钮；阻断默认行为可避免触发 details 折叠切换。
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
            }, 0);
          });
      } catch (error) {
        logger.error("Reset hook 错误", error);
      }
    });
  }

  globalRef.__stRollEventHooksRegisteredEvent = true;
}
