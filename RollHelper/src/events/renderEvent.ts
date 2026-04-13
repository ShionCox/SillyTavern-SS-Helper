import type { DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventOutcomeKindEvent,
  EventRollRecordEvent,
  PendingRoundEvent,
} from "../types/eventDomainEvent";
import { formatIsoDurationNaturalLanguageEvent } from "../core/utilsEvent";
import {
  ensureActiveStatusesEvent,
  extractStatusCommandsAndCleanTextEvent,
  formatStatusRemainingRoundsLabelEvent,
  resolveStatusModifiersForSkillEvent,
  stripStatusTagsFromTextEvent,
} from "./statusEvent";
import { logger } from "../../index";

export type EventRuntimeToneEvent = "neutral" | "warn" | "danger" | "success";

export type EventRuntimeViewStateEvent = {
  text: string;
  tone: EventRuntimeToneEvent;
  locked: boolean;
};

type ResolvedOutcomeEvent = {
  kind: EventOutcomeKindEvent;
  text: string;
  explosionTriggered: boolean;
};

export function formatCountdownMsEvent(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export interface GetEventRuntimeViewStateDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getLatestRollRecordForEvent: (
    round: PendingRoundEvent,
    eventId: string
  ) => EventRollRecordEvent | null;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
}

export function getEventRuntimeViewStateEvent(
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  deps: GetEventRuntimeViewStateDepsEvent,
  now = Date.now()
): EventRuntimeViewStateEvent {
  const settings = deps.getSettingsEvent();
  const record = deps.getLatestRollRecordForEvent(round, event.id);
  if (record) {
    if (record.source === "timeout_auto_fail") {
      return { text: "已超时失败", tone: "danger", locked: true };
    }
    if (record.success === false) {
      return { text: "已结算(失败)", tone: "danger", locked: true };
    }
    return { text: "已结算", tone: "success", locked: true };
  }

  if (!settings.enableTimeLimit) {
    return { text: "时限关闭", tone: "neutral", locked: false };
  }

  deps.ensureRoundEventTimersSyncedEvent(round);
  const timer = round.eventTimers[event.id];
  if (!timer || timer.deadlineAt == null) {
    return { text: "不限时", tone: "neutral", locked: false };
  }

  const remainingMs = timer.deadlineAt - now;
  if (remainingMs <= 0) {
    return { text: "已超时", tone: "danger", locked: true };
  }
  if (remainingMs <= 10_000) {
    return { text: `剩余 ${formatCountdownMsEvent(remainingMs)}`, tone: "warn", locked: false };
  }
  return { text: `剩余 ${formatCountdownMsEvent(remainingMs)}`, tone: "neutral", locked: false };
}

export function getRuntimeToneStyleEvent(tone: EventRuntimeToneEvent): {
  border: string;
  background: string;
  color: string;
} {
  switch (tone) {
    case "warn":
      return {
        border: "1px solid rgba(255,196,87,0.55)",
        background: "rgba(71,47,14,0.45)",
        color: "#ffd987",
      };
    case "danger":
      return {
        border: "1px solid rgba(255,120,120,0.55)",
        background: "rgba(80,20,20,0.45)",
        color: "#ffb6b6",
      };
    case "success":
      return {
        border: "1px solid rgba(136,255,173,0.55)",
        background: "rgba(18,54,36,0.45)",
        color: "#bfffd1",
      };
    default:
      return {
        border: "1px solid rgba(173,201,255,0.45)",
        background: "rgba(20,36,62,0.45)",
        color: "#d1e6ff",
      };
  }
}

function buildDcDescriptionHtmlEvent(
  dcReason: string | undefined,
  dcModifier: number,
  includeReason: boolean,
  escapeHtmlEvent: (input: string) => string,
  formatModifier: (mod: number) => string
): string {
  const segments: string[] = [];
  const reasonText = String(dcReason ?? "").trim();
  const hasModifier = Number.isFinite(dcModifier) && dcModifier !== 0;

  if (includeReason && reasonText) {
    segments.push(`<span class="st-rh-dc-note-copy">${escapeHtmlEvent(reasonText)}</span>`);
  }
  if (hasModifier) {
    segments.push(
      `<span class="st-rh-inline-chip st-rh-chip-strong st-rh-dc-modifier-chip"><span class="st-rh-dc-modifier-label">DC修正</span><span class="st-rh-dc-modifier-value">${escapeHtmlEvent(formatModifier(dcModifier))}</span></span>`
    );
  }

  if (segments.length === 0) return "";
  return `<span class="st-rh-dc-note-stack">${segments.join("")}</span>`;
}

function setEventButtonsDisabledStateEvent(
  roundId: string,
  eventId: string,
  disabled: boolean
): void {
  const buttons = Array.from(
    document.querySelectorAll("button[data-dice-event-roll='1']")
  ) as HTMLButtonElement[];
  for (const button of buttons) {
    const btnRoundId = button.getAttribute("data-round-id") || "";
    const btnEventId = button.getAttribute("data-dice-event-id") || "";
    if (btnRoundId !== roundId || btnEventId !== eventId) continue;
    button.disabled = disabled;
    button.style.display = disabled ? "none" : "inline-block";
    button.style.opacity = disabled ? "0.5" : "1";
    button.style.cursor = disabled ? "not-allowed" : "pointer";
    button.style.filter = disabled ? "grayscale(0.35)" : "";
  }
}

/**
 * 功能：获取指定事件在当前轮次中的最新投掷记录。
 * @param round 当前待处理轮次
 * @param eventId 事件 ID
 * @returns 最新投掷记录；不存在时返回 `null`
 */
function getLatestRollRecordForEventInRoundEvent(
  round: PendingRoundEvent,
  eventId: string
): EventRollRecordEvent | null {
  for (let index = round.rolls.length - 1; index >= 0; index -= 1) {
    const current = round.rolls[index];
    if (current?.eventId === eventId) return current;
  }
  return null;
}

/**
 * 功能：按当前轮次状态同步重新投掷按钮的显隐。
 * @param round 当前待处理轮次；为空时会隐藏所有重新投掷按钮
 * @returns void：无返回值
 */
function syncRerollButtonsVisibilityEvent(round: PendingRoundEvent | null): void {
  const buttons = Array.from(
    document.querySelectorAll("button[data-dice-event-reroll='1']")
  ) as HTMLButtonElement[];
  if (buttons.length === 0) return;

  for (const button of buttons) {
    if (!round || round.status !== "open") {
      button.style.display = "none";
      continue;
    }

    const btnRoundId = button.getAttribute("data-round-id") || "";
    const btnEventId = button.getAttribute("data-dice-event-id") || "";
    const btnRollId = button.getAttribute("data-roll-id") || "";
    const event = round.events.find((item) => item.id === btnEventId) || null;
    const latestRecord = event ? getLatestRollRecordForEventInRoundEvent(round, btnEventId) : null;
    const shouldShow =
      btnRoundId === round.roundId &&
      !!event &&
      !!latestRecord &&
      latestRecord.rollId === btnRollId;

    button.style.display = shouldShow ? "inline-flex" : "none";
  }
}

export interface RefreshCountdownDomDepsEvent {
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getEventRuntimeViewStateEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now?: number
  ) => EventRuntimeViewStateEvent;
  getRuntimeToneStyleEvent: (tone: EventRuntimeToneEvent) => {
    border: string;
    background: string;
    color: string;
  };
}

export function refreshCountdownDomEvent(deps: RefreshCountdownDomDepsEvent): void {
  const nodes = Array.from(
    document.querySelectorAll("[data-dice-countdown='1']")
  ) as HTMLElement[];
  const buttons = Array.from(
    document.querySelectorAll("button[data-dice-event-roll='1']")
  ) as HTMLButtonElement[];
  const rerollButtons = Array.from(
    document.querySelectorAll("button[data-dice-event-reroll='1']")
  ) as HTMLButtonElement[];
  if (nodes.length === 0 && buttons.length === 0 && rerollButtons.length === 0) return;

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;
  if (!round || round.status !== "open") {
    for (const button of buttons) {
      button.disabled = true;
      button.style.display = "none";
      button.style.opacity = "0.5";
      button.style.cursor = "not-allowed";
      button.style.filter = "grayscale(0.35)";
    }
    syncRerollButtonsVisibilityEvent(null);
    return;
  }

  deps.ensureRoundEventTimersSyncedEvent(round);
  syncRerollButtonsVisibilityEvent(round);
  const now = Date.now();
  for (const node of nodes) {
    const roundId = node.getAttribute("data-round-id") || "";
    const eventId = node.getAttribute("data-event-id") || "";
    if (!roundId || !eventId || roundId !== round.roundId) continue;

    const event = round.events.find((item) => item.id === eventId);
    if (!event) continue;

    const state = deps.getEventRuntimeViewStateEvent(round, event, now);
    const toneStyle = deps.getRuntimeToneStyleEvent(state.tone);
    node.textContent = `⏱ ${state.text}`;
    node.style.border = toneStyle.border;
    node.style.background = toneStyle.background;
    node.style.color = toneStyle.color;
    setEventButtonsDisabledStateEvent(round.roundId, event.id, state.locked);
  }
}

export function hideEventCodeBlocksInDomEvent(): void {
  try {
    const preBlocks = Array.from(document.querySelectorAll("pre"));
    for (const pre of preBlocks) {
      if (pre.classList.contains('language-rolljson') || pre.querySelector('.language-rolljson') || pre.querySelector('code.language-rolljson')) {
        pre.remove();
        continue;
      }

      const text = (pre.textContent || "").trim();
      const htmlText = (pre.innerHTML || "").trim();
      if (!text && !htmlText) continue;

      const hasEventPayload =
        text.includes("dice_events") && text.includes("\"events\"") && text.includes("\"type\"");

      const hasRolljson = htmlText.includes('rolljson') || text.includes('rolljson');
      const hasSummaryWrapper = htmlText.includes('ROLLHELPER_SUMMARY_START');

      if (!hasEventPayload && !hasRolljson && !hasSummaryWrapper) continue;
      pre.remove();
    }
  } catch (error) {
    logger.warn("隐藏事件代码块失败", error);
  }
}

function buildOutcomePreviewHtmlEvent(
  event: DiceEventSpecEvent,
  settings: DicePluginSettingsEvent,
  escapeHtmlEvent: (input: string) => string
): string {
  if (!settings.enableOutcomeBranches || !settings.showOutcomePreviewInListCard) return "";
  const outcomes = event.outcomes;
  if (!outcomes) return "";
  const hasAnyOutcomeText = Boolean(
    outcomes.success?.trim() || outcomes.failure?.trim() || outcomes.explode?.trim()
  );
  if (!hasAnyOutcomeText) return "";
  const success = stripStatusTagsFromTextEvent(event.outcomes?.success?.trim() || "") || "未设置";
  const failure = stripStatusTagsFromTextEvent(event.outcomes?.failure?.trim() || "") || "未设置";
  const explode = settings.enableExplodeOutcomeBranch
    ? stripStatusTagsFromTextEvent(event.outcomes?.explode?.trim() || "") || "未设置"
    : "已关闭";

  return `
    <style>
      .st-roll-preview-row {
        display:flex; margin-bottom:6px; align-items:flex-start; padding: 4px; border-radius: 4px; border-left: 2px solid transparent; transition: all 0.2s ease; cursor: default;
      }
      .st-roll-preview-row:hover {
        background-color: rgba(197, 160, 89, 0.1) !important;
        border-left: 2px solid rgba(197, 160, 89, 0.8) !important;
        box-shadow: inset 24px 0 24px -24px rgba(197, 160, 89, 0.3) !important;
      }
    </style>
    <div style="margin-top:8px; margin-bottom:12px; padding:12px; border:1px solid rgba(197,160,89,0.3); border-radius:6px; background:linear-gradient(135deg, rgba(30,30,30,0.6) 0%, rgba(15,15,15,0.8) 100%); font-size:12px; line-height:1.6; box-shadow:inset 0 1px 4px rgba(0,0,0,0.5);">
      <div style="margin-bottom:10px; font-weight:600; color:#d1b67f; font-size:11px; letter-spacing:1px; display:flex; align-items:center;">
        <span style="flex-grow:1; height:1px; background:linear-gradient(90deg, transparent, rgba(197,160,89,0.4)); margin-right:8px;"></span>
        走向预览
        <span style="margin-left:8px; flex-grow:1; height:1px; background:linear-gradient(270deg, transparent, rgba(197,160,89,0.4));"></span>
      </div>
      <div class="st-roll-preview-row">
        <span style="display:inline-block; padding:0 6px; margin-right:10px; background:rgba(82,196,26,0.15); border:1px solid rgba(82,196,26,0.4); border-radius:4px; color:#73d13d; font-size:10px; font-family:monospace; line-height:1.6; white-space:nowrap; user-select:none; box-shadow:0 0 4px rgba(82,196,26,0.1);">成功</span>
        <span style="color:#e0e0e0; flex:1; word-break:break-word;">${escapeHtmlEvent(success)}</span>
      </div>
      <div class="st-roll-preview-row">
        <span style="display:inline-block; padding:0 6px; margin-right:10px; background:rgba(255,77,79,0.15); border:1px solid rgba(255,77,79,0.4); border-radius:4px; color:#ff7875; font-size:10px; font-family:monospace; line-height:1.6; white-space:nowrap; user-select:none; box-shadow:0 0 4px rgba(255,77,79,0.1);">失败</span>
        <span style="color:#e0e0e0; flex:1; word-break:break-word;">${escapeHtmlEvent(failure)}</span>
      </div>
      <div class="st-roll-preview-row" style="margin-bottom:0;">
        <span style="display:inline-block; padding:0 6px; margin-right:10px; background:rgba(250,173,20,0.15); border:1px solid rgba(250,173,20,0.4); border-radius:4px; color:#ffc53d; font-size:10px; font-family:monospace; line-height:1.6; white-space:nowrap; user-select:none; box-shadow:0 0 4px rgba(250,173,20,0.1);">爆骰</span>
        <span style="color:#e0e0e0; flex:1; word-break:break-word;">${escapeHtmlEvent(explode)}</span>
      </div>
    </div>
  `;
}

function buildOutcomePreviewHtmlRichEvent(
  event: DiceEventSpecEvent,
  settings: DicePluginSettingsEvent,
  escapeHtmlEvent: (input: string) => string
): string {
  if (!settings.enableOutcomeBranches || !settings.showOutcomePreviewInListCard) return "";
  const outcomes = event.outcomes;
  if (!outcomes) return "";
  const hasAnyOutcomeText = Boolean(
    outcomes.success?.trim() || outcomes.failure?.trim() || outcomes.explode?.trim()
  );
  if (!hasAnyOutcomeText) return "";

  const successRaw = outcomes.success?.trim() || "";
  const failureRaw = outcomes.failure?.trim() || "";
  const explodeRaw = outcomes.explode?.trim() || "";

  const successText = stripStatusTagsFromTextEvent(successRaw) || "未设置";
  const failureText = stripStatusTagsFromTextEvent(failureRaw) || "未设置";
  const explodeText = settings.enableExplodeOutcomeBranch
    ? stripStatusTagsFromTextEvent(explodeRaw) || "未设置"
    : "已关闭";

  const successStatusSummary = settings.enableStatusSystem
    ? buildOutcomeStatusSummaryTextEvent(successRaw, event.skill)
    : "";
  const failureStatusSummary = settings.enableStatusSystem
    ? buildOutcomeStatusSummaryTextEvent(failureRaw, event.skill)
    : "";
  const explodeStatusSummary =
    settings.enableStatusSystem && settings.enableExplodeOutcomeBranch
      ? buildOutcomeStatusSummaryTextEvent(explodeRaw, event.skill)
      : "";

  const buildPreviewRow = (
    tone: "success" | "failure" | "explode",
    label: string,
    text: string,
    statusSummary: string,
    isLast = false
  ): string => {
    const palette = {
      success: {
        badgeBg: "rgba(82,196,26,0.15)",
        badgeBorder: "rgba(82,196,26,0.4)",
        badgeColor: "#73d13d",
        summaryBg: "rgba(57,168,40,0.10)",
        summaryBorder: "rgba(82,196,26,0.24)",
        summaryColor: "#b7ef8f",
        icon: "fa-solid fa-check-circle"
      },
      failure: {
        badgeBg: "rgba(255,77,79,0.15)",
        badgeBorder: "rgba(255,77,79,0.4)",
        badgeColor: "#ff7875",
        summaryBg: "rgba(171,54,57,0.12)",
        summaryBorder: "rgba(255,120,120,0.22)",
        summaryColor: "#ffb3b3",
        icon: "fa-solid fa-xmark-circle"
      },
      explode: {
        badgeBg: "rgba(250,173,20,0.15)",
        badgeBorder: "rgba(250,173,20,0.4)",
        badgeColor: "#ffc53d",
        summaryBg: "rgba(173,113,20,0.12)",
        summaryBorder: "rgba(250,173,20,0.22)",
        summaryColor: "#ffd98a",
        icon: "fa-solid fa-star"
      },
    }[tone];

    const escapedSummary = statusSummary ? escapeHtmlEvent(statusSummary) : "";

    return `
      <div class="st-rh-outcome-preview-row st-rh-outcome-${tone}"${isLast ? ` style="margin-bottom:0;"` : ""}>
        <span class="st-rh-outcome-preview-badge" style="background:${palette.badgeBg}; border-color:${palette.badgeBorder}; color:${palette.badgeColor};">
          <i class="${palette.icon} fa-fw st-rh-fa-icon" aria-hidden="true" style="margin-right:4px;"></i>${label}
        </span>
        <div class="st-rh-outcome-preview-content">
          <span class="st-rh-outcome-preview-text">${escapeHtmlEvent(text)}</span>
          ${escapedSummary
        ? `<div class="st-rh-outcome-preview-status" style="border-color:${palette.summaryBorder}; background:${palette.summaryBg};">
                 <span class="st-rh-outcome-preview-status-label" style="color:${palette.summaryColor};">状态</span>
                 <span class="st-rh-outcome-preview-status-text">${escapedSummary}</span>
               </div>`
        : ""
      }
        </div>
      </div>
    `;
  };

  return `
    <div class="st-rh-outcome-preview-wrap">
      <div class="st-rh-outcome-preview-header">
        <div class="st-rh-outcome-preview-header-line"></div>
        <span class="st-rh-outcome-preview-header-title">
          <i class="fa-solid fa-scroll fa-fw st-rh-fa-icon" aria-hidden="true" style="margin-right: 6px; font-size: 0.9em; opacity: 0.9;"></i>走向预览
        </span>
        <div class="st-rh-outcome-preview-header-line right"></div>
      </div>
      ${buildPreviewRow("success", "成功", successText, successStatusSummary)}
      ${buildPreviewRow("failure", "失败", failureText, failureStatusSummary)}
      ${buildPreviewRow("explode", "爆骰", explodeText, explodeStatusSummary, true)}
    </div>
  `;
}

export function outcomeKindLabelEvent(kind: EventOutcomeKindEvent): string {
  if (kind === "explode") return "爆骰走向";
  if (kind === "success") return "成功走向";
  if (kind === "failure") return "失败走向";
  return "剧情走向";
}

function formatAdvantageStateForCardEvent(raw: any): string {
  if (raw === "advantage") return "优势";
  if (raw === "disadvantage") return "劣势";
  return "正常";
}

function formatDifficultyForCardEvent(raw: any): string {
  if (raw === "easy") return "简单";
  if (raw === "hard") return "困难";
  if (raw === "extreme") return "极难";
  return "普通";
}

function buildDifficultyTitleTextEvent(
  difficulty: string | undefined,
  dcSource: "ai" | "difficulty_mapped" | undefined,
  dc: number
): string {
  const difficultyLabel = formatDifficultyForCardEvent(difficulty);
  if (dcSource === "difficulty_mapped") {
    return `当前为${difficultyLabel}难度，阈值 ${dc} 由系统按骰式与优劣骰自动换算。`;
  }
  return `当前为${difficultyLabel}难度，阈值 ${dc} 来自事件原始配置。`;
}

/**
 * 功能：判断当前结果卡是否允许显示重新投掷按钮。
 * @param event 当前事件定义
 * @param record 当前结果记录
 * @param meta 全局骰子运行时状态
 * @param settings 当前设置
 * @returns 可显示重投按钮时返回 `true`
 */
function canShowRerollActionEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent,
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent
): boolean {
  if (!settings.enableRerollFeature) return false;
  const round = meta.pendingRound;
  if (!round || round.status !== "open") return false;
  if (round.roundId !== record.roundId) return false;
  if (!round.events.some((item) => item.id === event.id)) return false;
  const latestRecord = getLatestRollRecordForEventInRoundEvent(round, event.id);
  return latestRecord?.rollId === record.rollId;
}

function toDomIdTokenEvent(raw: string): string {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalized) return normalized.slice(0, 64);
  const fallback = Math.abs(
    Array.from(String(raw ?? "id")).reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) | 0), 7)
  );
  return `id-${fallback}`;
}

export interface BuildEventListCardDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getLatestRollRecordForEvent: (
    round: PendingRoundEvent,
    eventId: string
  ) => EventRollRecordEvent | null;
  getEventRuntimeViewStateEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now?: number
  ) => EventRuntimeViewStateEvent;
  getRuntimeToneStyleEvent: (tone: EventRuntimeToneEvent) => {
    border: string;
    background: string;
    color: string;
  };
  buildEventRolledPrefixTemplateEvent: (isTimeout: boolean) => string;
  buildEventRolledBlockTemplateEvent: (rolledPrefixHtml: string, summaryHtml: string) => string;
  formatRollRecordSummaryEvent: (
    record: EventRollRecordEvent,
    event?: DiceEventSpecEvent
  ) => string;
  parseDiceExpression: (exprRaw: string) => {
    count: number;
    sides: number;
    modifier: number;
    explode: boolean;
  };
  resolveSkillModifierBySkillNameEvent: (
    skillName: string,
    settings?: DicePluginSettingsEvent
  ) => number;
  formatEventModifierBreakdownEvent: (
    baseModifier: number,
    skillModifier: number,
    finalModifier: number
  ) => string;
  formatModifier: (mod: number) => string;
  buildEventRollButtonTemplateEvent: (params: {
    roundIdAttr: string;
    eventIdAttr: string;
    diceExprAttr: string;
    buttonDisabledAttr: string;
    buttonStateStyle: string;
    blind?: boolean;
  }) => string;
    buildEventListItemTemplateEvent: (params: {
    detailsIdAttr: string;
    templateVariant?: "desktop" | "mobile";
    titleHtml: string;
    eventIdHtml: string;
    collapsedCheckHtml: string;
    collapsedRuntimeHtml: string;
    descHtml: string;
    targetHtml: string;
    skillHtml: string;
    skillTitleAttr: string;
      advantageStateHtml: string;
      modifierTextHtml: string;
      checkDiceHtml: string;
      difficultyHtml: string;
      difficultyTitleAttr: string;
      compareHtml: string;
    dcText: string;
    dcReasonHtml: string;
    timeLimitHtml: string;
    rollModeBadgeHtml: string;
    roundIdAttr: string;
    eventIdAttr: string;
    deadlineAttr: string;
    runtimeStyleAttr: string;
    runtimeTextHtml: string;
    rolledBlockHtml: string;
    outcomePreviewHtml: string;
    commandTextHtml: string;
    rollButtonHtml: string;
  }) => string;
  buildEventListCardTemplateEvent: (
    roundIdHtml: string,
    desktopItemsHtml: string,
    mobileItemsHtml: string
  ) => string;
  escapeHtmlEvent: (input: string) => string;
  escapeAttrEvent: (input: string) => string;
}

export function buildEventListCardEvent(
  round: PendingRoundEvent,
  deps: BuildEventListCardDepsEvent
): string {
  const settings = deps.getSettingsEvent();
  const meta = deps.getDiceMetaEvent();
  const activeStatuses = ensureActiveStatusesEvent(meta);
  deps.ensureRoundEventTimersSyncedEvent(round);
  const buildItemHtmlByVariantEvent = (templateVariant: "desktop" | "mobile"): string =>
    round.events
    .map((event) => {
      const compare = event.compare ?? ">=";
      const lastRecord = deps.getLatestRollRecordForEvent(round, event.id);
      const runtime = deps.getEventRuntimeViewStateEvent(round, event, Date.now());
      const runtimeStyle = deps.getRuntimeToneStyleEvent(runtime.tone);
      const detailsIdAttr = deps.escapeAttrEvent(
        `st-rh-event-${toDomIdTokenEvent(round.roundId)}-${toDomIdTokenEvent(event.id)}-details`
      );

      const rolledPrefix = deps.buildEventRolledPrefixTemplateEvent(
        lastRecord?.source === "timeout_auto_fail"
      );

      const rolledBlock = lastRecord
        ? deps.buildEventRolledBlockTemplateEvent(
          rolledPrefix,
          deps.escapeHtmlEvent(deps.formatRollRecordSummaryEvent(lastRecord, event))
        )
        : "";
      const outcomePreviewHtml = buildOutcomePreviewHtmlRichEvent(event, settings, deps.escapeHtmlEvent);

      const deadlineAttr =
        typeof event.deadlineAt === "number" && Number.isFinite(event.deadlineAt)
          ? String(event.deadlineAt)
          : "";
      const buttonDisabled = runtime.locked ? "disabled" : "";
      const buttonStateStyle = runtime.locked
        ? "opacity:0.4;cursor:not-allowed;filter:grayscale(1);"
        : "cursor:pointer;";
      const showRollButton = !runtime.locked && !lastRecord;
      const timeLimitLabel = settings.enableTimeLimit ? (event.timeLimit ? event.timeLimit : "无") : "关闭";
      const timeLimitLabelDisplay = settings.enableTimeLimit
        ? formatIsoDurationNaturalLanguageEvent(event.timeLimit ?? "无")
        : "关闭";
      const statusResolved = settings.enableStatusSystem
        ? resolveStatusModifiersForSkillEvent(activeStatuses, event.skill)
        : { modifier: 0, matched: [] as Array<{ name: string; modifier: number }> };
      const baseModifierUsed = lastRecord
        ? Number.isFinite(Number(lastRecord.baseModifierUsed))
          ? Number(lastRecord.baseModifierUsed)
          : 0
        : (() => {
          try {
            return deps.parseDiceExpression(event.checkDice).modifier;
          } catch {
            return 0;
          }
        })();
      const skillModifierApplied = lastRecord
        ? Number.isFinite(Number(lastRecord.skillModifierApplied))
          ? Number(lastRecord.skillModifierApplied)
          : 0
        : deps.resolveSkillModifierBySkillNameEvent(event.skill, settings);
      const statusModifierApplied = lastRecord
        ? Number.isFinite(Number(lastRecord.statusModifierApplied))
          ? Number(lastRecord.statusModifierApplied)
          : 0
        : statusResolved.modifier;
      const statusMatched = lastRecord
        ? Array.isArray(lastRecord.statusModifiersApplied)
          ? lastRecord.statusModifiersApplied
          : []
        : statusResolved.matched;
      const finalModifierUsed = lastRecord
        ? Number.isFinite(Number(lastRecord.finalModifierUsed))
          ? Number(lastRecord.finalModifierUsed)
          : baseModifierUsed + skillModifierApplied + statusModifierApplied
        : baseModifierUsed + skillModifierApplied + statusModifierApplied;
      const modifierText =
        baseModifierUsed !== 0 || skillModifierApplied !== 0 || statusModifierApplied !== 0
          ? `${deps.formatModifier(baseModifierUsed)} + 技能 ${deps.formatModifier(
            skillModifierApplied
          )} + 状态 ${deps.formatModifier(statusModifierApplied)} = ${deps.formatModifier(
            finalModifierUsed
          )}`
          : "";
      const skillHoverTextFinal = settings.enableSkillSystem
        ? `技能修正：${deps.formatModifier(skillModifierApplied)}${statusModifierApplied !== 0
          ? `；状态 ${deps.formatModifier(statusModifierApplied)}${statusMatched.length > 0
            ? `（${statusMatched
              .map((item) => `${item.name}${deps.formatModifier(item.modifier)}`)
              .join("，")}）`
            : ""
          }`
          : ""
        }${modifierText ? `（${modifierText}）` : ""}`
        : "技能系统已关闭";

      const modifierTextHtml = buildModifierBreakdownHtmlEvent(
        baseModifierUsed,
        skillModifierApplied,
        statusModifierApplied,
        finalModifierUsed,
        event.skill,
        statusMatched,
        deps.escapeHtmlEvent,
        deps.escapeAttrEvent
      );

      const dcDescriptionHtml = buildDcDescriptionHtmlEvent(
        event.dcReason,
        finalModifierUsed,
        settings.enableDynamicDcReason,
        deps.escapeHtmlEvent,
        deps.formatModifier
      );

      const advantageStateText = formatAdvantageStateForCardEvent(
        lastRecord?.advantageStateApplied ?? event.advantageState
      );
      const difficultyText = formatDifficultyForCardEvent(event.difficulty);
      const difficultyTitleAttr = buildDifficultyTitleTextEvent(
        event.difficulty,
        event.dcSource,
        Number.isFinite(Number(event.dc)) ? Number(event.dc) : 0
      );

      const rollButtonHtml = (() => {
        if (!showRollButton) return "";
        if (event.rollMode === "auto") {
          return `<span class="st-rh-summary-lock st-rh-mono" style="color: #d1b67f; border: 1px dashed rgba(209,182,127,0.3);"><i class="fa-solid fa-hourglass-half fa-fw st-rh-fa-icon" style="margin-right:6px;"></i>等待自动触发</span>`;
        }
        const publicButtonHtml = deps.buildEventRollButtonTemplateEvent({
          roundIdAttr: deps.escapeAttrEvent(round.roundId),
          eventIdAttr: deps.escapeAttrEvent(event.id),
          diceExprAttr: deps.escapeAttrEvent(event.checkDice),
          buttonDisabledAttr: buttonDisabled,
          buttonStateStyle,
        });
        if (!settings.enableBlindRoll) return publicButtonHtml;
        const blindButtonHtml = deps.buildEventRollButtonTemplateEvent({
          roundIdAttr: deps.escapeAttrEvent(round.roundId),
          eventIdAttr: deps.escapeAttrEvent(event.id),
          diceExprAttr: deps.escapeAttrEvent(event.checkDice),
          buttonDisabledAttr: buttonDisabled,
          buttonStateStyle,
          blind: true,
        });
        return `<div class="st-rh-roll-btn-stack">${publicButtonHtml}${blindButtonHtml}</div>`;
      })();

      const rollModeBadgeHtml =
        event.rollMode === "auto"
          ? `<span class="st-rh-badge-role st-rh-badge-role-auto">${deps.escapeHtmlEvent("自动结算")}</span>`
          : `<span class="st-rh-badge-role st-rh-badge-role-manual">${deps.escapeHtmlEvent("需检定")}</span>`;

      return deps.buildEventListItemTemplateEvent({
        detailsIdAttr,
        templateVariant,
        titleHtml: deps.escapeHtmlEvent(event.title),
        rollModeBadgeHtml,
        eventIdHtml: deps.escapeHtmlEvent(event.id),
        collapsedCheckHtml: deps.escapeHtmlEvent(`${event.checkDice} ${compare} ${String(event.dc)}`),
        collapsedRuntimeHtml: deps.escapeHtmlEvent(runtime.text),
        descHtml: deps.escapeHtmlEvent(event.desc),
        targetHtml: deps.escapeHtmlEvent(event.targetLabel),
        skillHtml: deps.escapeHtmlEvent(event.skill),
        skillTitleAttr: deps.escapeAttrEvent(skillHoverTextFinal),
        advantageStateHtml: deps.escapeHtmlEvent(advantageStateText),
        modifierTextHtml,
        checkDiceHtml: deps.escapeHtmlEvent(event.checkDice),
        difficultyHtml: deps.escapeHtmlEvent(difficultyText),
        difficultyTitleAttr: deps.escapeAttrEvent(difficultyTitleAttr),
        compareHtml: deps.escapeHtmlEvent(compare),
        dcText: String(event.dc),
        dcReasonHtml: dcDescriptionHtml,
        timeLimitHtml: deps.escapeHtmlEvent(timeLimitLabelDisplay),
        roundIdAttr: deps.escapeAttrEvent(round.roundId),
        eventIdAttr: deps.escapeAttrEvent(event.id),
        deadlineAttr: deps.escapeAttrEvent(deadlineAttr),
        runtimeStyleAttr: `style="border:${runtimeStyle.border};background:${runtimeStyle.background};color:${runtimeStyle.color};"`,
        runtimeTextHtml: deps.escapeHtmlEvent(runtime.text),
        rolledBlockHtml: rolledBlock,
        outcomePreviewHtml,
        commandTextHtml: `/eventroll roll ${deps.escapeHtmlEvent(event.id)}`,
        rollButtonHtml,
      });
    })
    .join("");
  const desktopItemsHtml = buildItemHtmlByVariantEvent("desktop");
  const mobileItemsHtml = buildItemHtmlByVariantEvent("mobile");

  return deps.buildEventListCardTemplateEvent(
    deps.escapeHtmlEvent(round.roundId),
    desktopItemsHtml,
    mobileItemsHtml
  );
}

export interface BuildAnimatedDiceVisualBlockDepsEvent {
  getDiceSvg: (value: number, sides: number, color: string, size?: number) => string;
  getRollingSvg: (color: string, size?: number) => string;
  buildAlreadyRolledDiceVisualTemplateEvent: (params: {
    uniqueId: string;
    rollingVisualHtml: string;
    diceVisualsHtml: string;
    critType: "success" | "fail" | "normal";
    critText: string;
    compactMode: boolean;
  }) => string;
}

function escapeTooltipAttrEvent(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function formatSignedValueEvent(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

/**
 * 功能：将状态作用域转换为可读文本。
 * @param scope 状态作用域
 * @param skills 作用技能列表
 * @returns 作用域展示文本
 */
function formatStatusScopeTextEvent(scope: "all" | "skills", skills: string[]): string {
  if (scope === "all") return "全局";
  const normalizedSkills = Array.isArray(skills) ? skills.filter((item) => String(item || "").trim()) : [];
  if (normalizedSkills.length <= 0) return "当前技能";
  return normalizedSkills.join(" / ");
}

/**
 * 功能：把走向文本中的状态指令提炼为可展示摘要。
 * @param outcomeText 原始走向文本（可含状态标签）
 * @param skillName 当前事件技能名
 * @returns 状态变化摘要文本，无状态变化时返回空字符串
 */
function buildOutcomeStatusSummaryTextEvent(outcomeText: string, skillName: string): string {
  const parsed = extractStatusCommandsAndCleanTextEvent(outcomeText, skillName);
  if (!Array.isArray(parsed.commands) || parsed.commands.length <= 0) return "";

  const applyLines = parsed.commands
    .filter((command): command is Extract<typeof parsed.commands[number], { kind: "apply" }> => command.kind === "apply")
    .map(
      (command) =>
        `获得「${command.name}」${formatSignedValueEvent(command.modifier)}（${formatStatusScopeTextEvent(
          command.scope,
          command.skills
        )}，${formatStatusRemainingRoundsLabelEvent(command.durationRounds)}）`
    );
  const removeLines = parsed.commands
    .filter((command): command is Extract<typeof parsed.commands[number], { kind: "remove" }> => command.kind === "remove")
    .map((command) => `移除「${command.name}」`);
  const hasClear = parsed.commands.some((command) => command.kind === "clear");
  const lines = [...applyLines, ...removeLines];
  if (hasClear) {
    lines.push("清空全部状态");
  }
  return lines.join("；");
}

function buildCurrentStatusesSummaryTextEvent(statuses: ActiveStatusEvent[]): string {
  const enabledStatuses = Array.isArray(statuses) ? statuses.filter((item) => item?.enabled !== false) : [];
  if (enabledStatuses.length <= 0) return "无";
  return enabledStatuses
    .map((item) => {
      const modifierText = formatSignedValueEvent(Number(item.modifier) || 0);
      const scopeText =
        item.scope === "all"
          ? "全局"
          : Array.isArray(item.skills) && item.skills.length > 0
            ? item.skills.join(" / ")
            : "当前技能";
      const durationText = formatStatusRemainingRoundsLabelEvent(item.remainingRounds);
      return `${item.name}${modifierText}（${scopeText}，${durationText}）`;
    })
    .join("；");
}

/**
 * 功能：构建结果卡片摘要区使用的剧情走向预览文本。
 * @param outcomeLabel 走向标签
 * @param outcomeText 走向正文
 * @returns 摘要文本与完整提示文本
 */
function buildCollapsedOutcomePreviewEvent(
  outcomeLabel: string,
  outcomeText: string
): { text: string; title: string; chipClassName: string } {
  const normalizedLabel = String(outcomeLabel ?? "").trim() || "剧情走向";
  const normalizedText = String(outcomeText ?? "").replace(/\s+/g, " ").trim() || "未设置";
  const fullText = `${normalizedLabel}：${normalizedText}`;
  return {
    text: fullText,
    title: fullText,
    chipClassName: "st-rh-summary-chip-outcome",
  };
}

/**
 * 功能：构建结果卡片摘要区使用的状态变化预览文本。
 * @param statusSummaryText 状态变化摘要
 * @returns 摘要文本、完整提示文本与样式类名
 */
function buildCollapsedStatusSummaryPreviewEvent(
  statusSummaryText: string
): { text: string; title: string; chipClassName: string } {
  const normalizedText = String(statusSummaryText ?? "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return { text: "", title: "", chipClassName: "st-rh-summary-chip-status-summary" };
  }
  return {
    text: `获得状态：${normalizedText}`,
    title: `获得状态：${normalizedText}`,
    chipClassName: "st-rh-summary-chip-status-summary",
  };
}

function buildDiceComputationTooltipEvent(
  result: DiceResult,
  baseModifierUsed?: number,
  skillModifierApplied?: number,
  finalModifierUsed?: number
): string {
  const rollsText = Array.isArray(result.rolls) && result.rolls.length > 0 ? `[${result.rolls.join(", ")}]` : "[]";
  const isD100Composite = Number(result.sides) === 100 && Array.isArray(result.rolls) && result.rolls.length >= 2;
  const rawTotal = Number.isFinite(Number(result.rawTotal)) ? Number(result.rawTotal) : 0;
  const total = Number.isFinite(Number(result.total)) ? Number(result.total) : rawTotal;
  const hasSkillModifier = Number.isFinite(Number(skillModifierApplied));
  const baseModifier = Number.isFinite(Number(baseModifierUsed))
    ? Number(baseModifierUsed)
    : Number(result.modifier) || 0;
  const skillModifier = hasSkillModifier ? Number(skillModifierApplied) : 0;
  const finalModifier = Number.isFinite(Number(finalModifierUsed))
    ? Number(finalModifierUsed)
    : hasSkillModifier
      ? baseModifier + skillModifier
      : Number(result.modifier) || 0;

  const parts: string[] = [];
  if (isD100Composite) {
    const tensValue = Number(result.rolls[0] ?? 0);
    const onesValue = Number(result.rolls[1] ?? 0);
    parts.push(`百分骰 十位=${tensValue} 个位=${onesValue}`);
  } else {
    parts.push(`骰面 ${rollsText}`);
  }
  const selectionSummaryText = buildSelectionSummaryTextEvent(result);
  if (selectionSummaryText) {
    parts.push(selectionSummaryText);
  }
  parts.push(`原始值 ${rawTotal}`);
  if (hasSkillModifier) {
    parts.push(`基础修正 ${formatSignedValueEvent(baseModifier)}`);
    parts.push(`技能修正 ${formatSignedValueEvent(skillModifier)}`);
    parts.push(`最终修正 ${formatSignedValueEvent(finalModifier)}`);
  } else {
    parts.push(`修正 ${formatSignedValueEvent(Number(result.modifier) || 0)}`);
  }
  parts.push(`总计 ${total}`);
  if (result.exploding) {
    parts.push(result.explosionTriggered ? "爆骰已触发" : "爆骰已启用");
  }

  return parts.join(" | ");
}

/**
 * 功能：将保留或舍弃的骰面列表格式化为可读文本。
 * @param rolls 需要格式化的骰面数组
 * @returns 逗号分隔的骰面文本；无内容时返回“无”
 */
function formatSelectedRollsTextEvent(rolls?: number[]): string {
  if (!Array.isArray(rolls) || rolls.length === 0) return "无";
  return rolls.join(", ");
}

/**
 * 功能：根据优劣骰选择模式生成结果摘要文本。
 * @param result 当前骰子结果
 * @returns 选择摘要；普通骰返回空字符串
 */
function buildSelectionSummaryTextEvent(result: DiceResult): string {
  if (result.selectionMode !== "keep_highest" && result.selectionMode !== "keep_lowest") {
    return "";
  }

  const modeLabel = result.selectionMode === "keep_highest" ? "取高" : "取低";
  const keptText = formatSelectedRollsTextEvent(result.keptRolls);
  const droppedText = formatSelectedRollsTextEvent(result.droppedRolls);

  if (droppedText === "无") {
    return `${modeLabel}：保留 ${keptText}`;
  }
  return `${modeLabel}：保留 ${keptText} / 舍弃 ${droppedText}`;
}

function buildRollsSummaryTextEvent(result: DiceResult): string {
  if (Number(result.sides) === 100 && Array.isArray(result.rolls) && result.rolls.length >= 2) {
    const tensValue = Number(result.rolls[0] ?? 0);
    const onesValue = Number(result.rolls[1] ?? 0);
    return `十位 ${tensValue} / 个位 ${onesValue}`;
  }
  return result.rolls.join(", ");
}

/**
 * 功能：构建带悬浮说明的修正数值节点。
 * @param value 当前修正值
 * @param tipText 悬浮提示文本
 * @param escapeHtmlEvent HTML 转义函数
 * @param escapeAttrEvent 属性转义函数
 * @returns 带提示的数值 HTML
 */
function buildModifierSegmentWithTipHtmlEvent(
  label: string,
  value: number,
  tipText: string,
  escapeHtmlEvent: (input: string) => string,
  escapeAttrEvent: (input: string) => string
): string {
  const labelText = String(label ?? "");
  const valueText = formatSignedValueEvent(value);
  const prefixHtml = labelText ? `${escapeHtmlEvent(labelText)} ` : "";
  return `<span class="st-rh-inline-tip-segment" data-tip="${escapeAttrEvent(tipText)}">${prefixHtml}<span class="st-rh-mono">${escapeHtmlEvent(valueText)}</span></span>`;
}

/**
 * 功能：构建带逐项悬浮提示的修正拆解 HTML。
 * @param baseModifierUsed 基础修正
 * @param skillModifierApplied 技能修正
 * @param statusModifierApplied 状态修正
 * @param finalModifierUsed 最终修正
 * @param skillName 当前技能名
 * @param statusMatched 命中的状态修正列表
 * @param escapeHtmlEvent HTML 转义函数
 * @param escapeAttrEvent 属性转义函数
 * @returns 修正拆解 HTML；无修正时返回空字符串
 */
function buildModifierBreakdownHtmlEvent(
  baseModifierUsed: number,
  skillModifierApplied: number,
  statusModifierApplied: number,
  finalModifierUsed: number,
  skillName: string,
  statusMatched: Array<{ name: string; modifier: number }>,
  escapeHtmlEvent: (input: string) => string,
  escapeAttrEvent: (input: string) => string
): string {
  if (baseModifierUsed === 0 && skillModifierApplied === 0 && statusModifierApplied === 0) {
    return "";
  }

  const statusSummaryText =
    Array.isArray(statusMatched) && statusMatched.length > 0
      ? `当前命中的状态：${statusMatched
        .map((item) => `${String(item.name ?? "").trim() || "未命名状态"}${formatSignedValueEvent(Number(item.modifier) || 0)}`)
        .join("、")}。`
      : "当前没有命中的状态修正。";

  const baseHtml = buildModifierSegmentWithTipHtmlEvent(
    "",
    baseModifierUsed,
    `基础修正：来自骰式本身的固定修正值。当前值 ${formatSignedValueEvent(baseModifierUsed)}。`,
    escapeHtmlEvent,
    escapeAttrEvent
  );
  const skillHtml = buildModifierSegmentWithTipHtmlEvent(
    "技能",
    skillModifierApplied,
    `技能修正：来自技能「${String(skillName ?? "").trim() || "未指定"}」。当前值 ${formatSignedValueEvent(skillModifierApplied)}。`,
    escapeHtmlEvent,
    escapeAttrEvent
  );
  const statusHtml = buildModifierSegmentWithTipHtmlEvent(
    "状态",
    statusModifierApplied,
    `状态修正：由当前生效状态提供。当前值 ${formatSignedValueEvent(statusModifierApplied)}。${statusSummaryText}`,
    escapeHtmlEvent,
    escapeAttrEvent
  );
  const finalHtml = buildModifierSegmentWithTipHtmlEvent(
    "",
    finalModifierUsed,
    `最终修正：基础修正 + 技能修正 + 状态修正。当前值 ${formatSignedValueEvent(finalModifierUsed)}。`,
    escapeHtmlEvent,
    escapeAttrEvent
  );

  return `${baseHtml} + ${skillHtml} + ${statusHtml} = ${finalHtml}`;
}

function buildFinalTotalDiceVisualEvent(
  total: number,
  color: string,
  size: number
): string {
  const clampedSize = Math.max(40, Math.floor(size));
  const fontSize = Math.max(14, Math.round(clampedSize * 0.34));
  return `
    <svg width="${clampedSize}" height="${clampedSize}" viewBox="0 0 48 48" style="display:inline-block; vertical-align: middle;">
      <rect x="4" y="4" width="40" height="40" rx="8" ry="8" fill="none" stroke="${color}" stroke-width="3" />
      <text x="24" y="31" font-size="${fontSize}" text-anchor="middle" fill="${color}" font-weight="bold" style="font-family: monospace;">${total}</text>
    </svg>
  `;
}

export function buildAnimatedDiceVisualBlockEvent(
  result: DiceResult | null | undefined,
  deps: BuildAnimatedDiceVisualBlockDepsEvent,
  compactMode = false,
  tooltipText = ""
): string {
  if (!result || !Array.isArray(result.rolls) || result.rolls.length === 0) {
    return "";
  }

  const uniqueId = "d" + Math.random().toString(36).substr(2, 9);
  let critType: "success" | "fail" | "normal" = "normal";
  let critText = "";
  let resultColor = "#ffdb78";

  if (result.count === 1) {
    const val = result.rolls[0];
    const maxVal = result.sides;
    if (val === maxVal) {
      critType = "success";
      critText = "大成功！";
      resultColor = "#52c41a";
    } else if (val === 1) {
      critType = "fail";
      critText = "大失败！";
      resultColor = "#ff4d4f";
    }
  }

  const diceSize = compactMode ? 62 : 68;
  const rollingSize = compactMode ? 52 : 58;
  const sharedTooltip = String(tooltipText || "").trim();
  const finalTotal = Number.isFinite(Number(result.total)) ? Number(result.total) : 0;
  const finalDiceSvg = buildFinalTotalDiceVisualEvent(finalTotal, resultColor, diceSize);
  const diceVisuals = sharedTooltip
    ? `<span style="display:inline-flex;cursor:help;" data-tip="${escapeTooltipAttrEvent(
      `${sharedTooltip}`
    )}">${finalDiceSvg}</span>`
    : finalDiceSvg;
  const rollingVisual = deps.getRollingSvg("#ffdb78", rollingSize);

  const visualBlock = deps.buildAlreadyRolledDiceVisualTemplateEvent({
    uniqueId,
    rollingVisualHtml: rollingVisual,
    diceVisualsHtml: diceVisuals,
    critType,
    critText,
    compactMode,
  });

  if (!sharedTooltip) {
    return visualBlock;
  }
  return `<div style="display:inline-flex;align-items:center;justify-content:center;cursor:help;" data-tip="${escapeTooltipAttrEvent(sharedTooltip)}">${visualBlock}</div>`;
}

export interface BuildEventRollResultCardDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  resolveTriggeredOutcomeEvent: (
    event: DiceEventSpecEvent,
    record: EventRollRecordEvent | null | undefined,
    settings: DicePluginSettingsEvent
  ) => ResolvedOutcomeEvent;
  formatEventModifierBreakdownEvent: (
    baseModifier: number,
    skillModifier: number,
    finalModifier: number
  ) => string;
  buildRollsSummaryTemplateEvent: (
    rollsHtml: string,
    modifierHtml: string,
    selectionHtml?: string
  ) => string;
  buildEventRerollButtonTemplateEvent: (params: {
    roundIdAttr: string;
    eventIdAttr: string;
    rollIdAttr: string;
    buttonTitleAttr: string;
  }) => string;
  formatModifier: (mod: number) => string;
  buildEventRollResultCardTemplateEvent: (params: {
    detailsIdAttr: string;
    collapsedStatusHtml: string;
    collapsedConditionHtml: string;
    collapsedSourceHtml: string;
    collapsedTotalHtml: string;
    collapsedOutcomeHtml: string;
    collapsedOutcomeTitleAttr: string;
    collapsedOutcomeChipClassName: string;
    collapsedStatusSummaryHtml: string;
    collapsedStatusSummaryTitleAttr: string;
    collapsedStatusSummaryChipClassName: string;
    collapsedDiceVisualHtml: string;
    rerollActionHtml: string;
    rollIdHtml: string;
    titleHtml: string;
    eventIdHtml: string;
    sourceHtml: string;
    targetHtml: string;
    skillHtml: string;
    skillTitleAttr: string;
    advantageStateHtml: string;
    difficultyHtml: string;
    difficultyTitleAttr: string;
    diceExprHtml: string;
    diceModifierHintHtml: string;
    rollsSummaryHtml: string;
    explodeInfoHtml: string;
    modifierBreakdownHtml: string;
    compareHtml: string;
    dcText: string;
    dcReasonHtml: string;
    statusText: string;
    statusColor: string;
    totalText: string;
    timeLimitHtml: string;
    diceVisualBlockHtml: string;
    outcomeLabelHtml: string;
    outcomeToneClassName: string;
    outcomeTextHtml: string;
    statusImpactHtml: string;
    outcomeStatusSummaryHtml: string;
    currentStatusesHtml: string;
  }) => string;
  escapeHtmlEvent: (input: string) => string;
  escapeAttrEvent: (input: string) => string;
  getDiceSvg: (value: number, sides: number, color: string, size?: number) => string;
  getRollingSvg: (color: string, size?: number) => string;
  buildAlreadyRolledDiceVisualTemplateEvent: (params: {
    uniqueId: string;
    rollingVisualHtml: string;
    diceVisualsHtml: string;
    critType: "success" | "fail" | "normal";
    critText: string;
    compactMode: boolean;
  }) => string;
}

export function buildEventRollResultCardEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent,
  deps: BuildEventRollResultCardDepsEvent
): string {
  const settings = deps.getSettingsEvent();
  const resolvedOutcome = deps.resolveTriggeredOutcomeEvent(event, record, settings);
  const outcomeLabel = settings.enableOutcomeBranches
    ? outcomeKindLabelEvent(resolvedOutcome.kind)
    : "剧情走向";
  const outcomeToneClassName = settings.enableOutcomeBranches
    ? `st-rh-outcome-tone-${resolvedOutcome.kind}`
    : "st-rh-outcome-tone-neutral";
  const outcomeText = settings.enableOutcomeBranches ? resolvedOutcome.text : "走向分支已关闭。";
  const outcomeTextClean = stripStatusTagsFromTextEvent(outcomeText);
  const collapsedOutcomePreview = buildCollapsedOutcomePreviewEvent(outcomeLabel, outcomeTextClean);
  const outcomeStatusSummaryText = settings.enableStatusSystem
    ? buildOutcomeStatusSummaryTextEvent(outcomeText, event.skill)
    : "";
  const collapsedStatusSummaryPreview = buildCollapsedStatusSummaryPreviewEvent(outcomeStatusSummaryText);
  const currentStatusesSummaryText = settings.enableStatusSystem
    ? buildCurrentStatusesSummaryTextEvent(ensureActiveStatusesEvent(deps.getDiceMetaEvent()))
    : "";
  const isBlindRecord = record.visibility === "blind" || record.source === "blind_manual_roll";
  const status = isBlindRecord
    ? "结果已隐藏，仅命运知晓"
    : record.success === null
      ? "待定"
      : record.success
        ? "判定成功"
        : "判定失败";
  const statusColor = isBlindRecord ? "#7f6dff" : record.success === null ? "#ffdb78" : record.success ? "#52c41a" : "#ff4d4f";

  const sourceText =
    record.source === "timeout_auto_fail"
      ? "超时检定"
      : record.source === "blind_manual_roll"
        ? "暗骰检定"
      : record.source === "ai_auto_roll"
        ? "自动检定"
        : "手动检定";
  const baseModifierUsed = Number.isFinite(Number(record.baseModifierUsed))
    ? Number(record.baseModifierUsed)
    : Number(record.result.modifier) || 0;
  const skillModifierApplied = Number.isFinite(Number(record.skillModifierApplied))
    ? Number(record.skillModifierApplied)
    : 0;
  const statusModifierApplied = Number.isFinite(Number(record.statusModifierApplied))
    ? Number(record.statusModifierApplied)
    : 0;
  const finalModifierUsed = Number.isFinite(Number(record.finalModifierUsed))
    ? Number(record.finalModifierUsed)
    : baseModifierUsed + skillModifierApplied + statusModifierApplied;
  const diceTooltipText = buildDiceComputationTooltipEvent(
    record.result,
    baseModifierUsed,
    skillModifierApplied,
    finalModifierUsed
  );
  const diceVisualBlock =
    record.source === "timeout_auto_fail" || isBlindRecord
      ? ""
      : buildAnimatedDiceVisualBlockEvent(
        record.result,
        {
          getDiceSvg: deps.getDiceSvg,
          getRollingSvg: deps.getRollingSvg,
          buildAlreadyRolledDiceVisualTemplateEvent: deps.buildAlreadyRolledDiceVisualTemplateEvent,
        },
        false,
        diceTooltipText
      );
  const modifierBreakdownText =
    baseModifierUsed !== 0 || skillModifierApplied !== 0 || statusModifierApplied !== 0
      ? `${deps.formatModifier(baseModifierUsed)} + 技能 ${deps.formatModifier(
        skillModifierApplied
      )} + 状态 ${deps.formatModifier(statusModifierApplied)} = ${deps.formatModifier(finalModifierUsed)}`
      : "";
  const skillHoverText = settings.enableSkillSystem
    ? `技能修正：${deps.formatModifier(skillModifierApplied)}；状态 ${deps.formatModifier(
      statusModifierApplied
    )}${modifierBreakdownText ? `（${modifierBreakdownText}）` : ""}`
    : "技能系统已关闭";
  const diceModifierHint =
    settings.enableSkillSystem && (skillModifierApplied !== 0 || statusModifierApplied !== 0)
      ? `技能${deps.formatModifier(skillModifierApplied)} / 状态${deps.formatModifier(statusModifierApplied)}`
      : "";
  let explodeInfoText = "未请求爆骰";
  const modifierBreakdownHtml = buildModifierBreakdownHtmlEvent(
    baseModifierUsed,
    skillModifierApplied,
    statusModifierApplied,
    finalModifierUsed,
    event.skill,
    Array.isArray(record.statusModifiersApplied) ? record.statusModifiersApplied : [],
    deps.escapeHtmlEvent,
    deps.escapeAttrEvent
  );
  if (record.explodePolicyApplied === "disabled_globally") {
    explodeInfoText = "已请求，系统关闭，按普通骰";
  } else if (record.explodePolicyApplied === "downgraded_by_ai_limit") {
    explodeInfoText = "已请求，超出本轮 AI 上限，按普通骰";
  } else if (record.explodePolicyApplied === "enabled") {
    explodeInfoText = record.result.explosionTriggered ? "已请求，已触发连爆" : "已请求，未触发连爆";
  } else if (record.result.exploding) {
    explodeInfoText = record.result.explosionTriggered ? "已请求，已触发连爆" : "已请求，未触发连爆";
  }
  const statusImpactHtml =
    statusModifierApplied !== 0
      ? `受状态影响 ${deps.formatModifier(statusModifierApplied)}${Array.isArray(record.statusModifiersApplied) && record.statusModifiersApplied.length > 0
        ? `（${record.statusModifiersApplied
          .map((item) => `${item.name}${deps.formatModifier(item.modifier)}`)
          .join("，")}）`
        : ""
      }`
      : "";
  const dcDescriptionHtml = buildDcDescriptionHtmlEvent(
    event.dcReason,
    finalModifierUsed,
    settings.enableDynamicDcReason,
    deps.escapeHtmlEvent,
    deps.formatModifier
  );
  const detailsIdAttr = deps.escapeAttrEvent(
    `st-rh-result-${toDomIdTokenEvent(record.rollId)}-details`
  );
  const collapsedCondition = `${record.compareUsed} ${String(record.dcUsed ?? "未设置")}`;
  const collapsedDiceVisualHtml =
    record.source === "timeout_auto_fail" || isBlindRecord
      ? ""
      : buildFinalTotalDiceVisualEvent(
        Number.isFinite(Number(record.result.total)) ? Number(record.result.total) : 0,
        statusColor,
        48
      );
  const timeLimitLabel = formatIsoDurationNaturalLanguageEvent(event.timeLimit ?? "无");
  const selectionSummaryText = buildSelectionSummaryTextEvent(record.result);
  const difficultyText = formatDifficultyForCardEvent(event.difficulty);
  const difficultyTitleAttr = buildDifficultyTitleTextEvent(
    event.difficulty,
    event.dcSource,
    Number.isFinite(Number(record.dcUsed)) ? Number(record.dcUsed) : Number(event.dc) || 0
  );
  const rerollActionHtml = canShowRerollActionEvent(event, record, deps.getDiceMetaEvent(), settings)
    ? deps.buildEventRerollButtonTemplateEvent({
      roundIdAttr: deps.escapeAttrEvent(record.roundId),
      eventIdAttr: deps.escapeAttrEvent(event.id),
      rollIdAttr: deps.escapeAttrEvent(record.rollId),
      buttonTitleAttr: deps.escapeAttrEvent("重新投掷会保留历史记录，并以本次结果作为当前生效结果。"),
    })
    : "";

  return deps.buildEventRollResultCardTemplateEvent({
    detailsIdAttr,
    collapsedStatusHtml: deps.escapeHtmlEvent(status),
    collapsedConditionHtml: deps.escapeHtmlEvent(isBlindRecord ? "结果已隐藏" : collapsedCondition),
    collapsedSourceHtml: deps.escapeHtmlEvent(sourceText),
    collapsedTotalHtml: deps.escapeHtmlEvent(isBlindRecord ? "已隐藏" : String(record.result.total)),
    collapsedOutcomeHtml: deps.escapeHtmlEvent(collapsedOutcomePreview.text),
    collapsedOutcomeTitleAttr: deps.escapeAttrEvent(collapsedOutcomePreview.title),
    collapsedOutcomeChipClassName: collapsedOutcomePreview.chipClassName,
    collapsedStatusSummaryHtml: deps.escapeHtmlEvent(collapsedStatusSummaryPreview.text),
    collapsedStatusSummaryTitleAttr: deps.escapeAttrEvent(collapsedStatusSummaryPreview.title),
    collapsedStatusSummaryChipClassName: collapsedStatusSummaryPreview.chipClassName,
    collapsedDiceVisualHtml,
    rerollActionHtml,
    rollIdHtml: deps.escapeHtmlEvent(record.rollId),
    titleHtml: deps.escapeHtmlEvent(event.title),
    eventIdHtml: deps.escapeHtmlEvent(event.id),
    sourceHtml: deps.escapeHtmlEvent(sourceText),
    targetHtml: deps.escapeHtmlEvent(record.targetLabelUsed || event.targetLabel),
    skillHtml: deps.escapeHtmlEvent(event.skill),
    skillTitleAttr: deps.escapeAttrEvent(skillHoverText),
    advantageStateHtml: deps.escapeHtmlEvent(
      formatAdvantageStateForCardEvent(record.advantageStateApplied ?? event.advantageState)
    ),
    difficultyHtml: deps.escapeHtmlEvent(difficultyText),
    difficultyTitleAttr: deps.escapeAttrEvent(difficultyTitleAttr),
    diceExprHtml: deps.escapeHtmlEvent(record.diceExpr),
    diceModifierHintHtml: deps.escapeHtmlEvent(isBlindRecord ? "结果已隐藏，仅命运知晓" : diceModifierHint),
    rollsSummaryHtml: isBlindRecord
      ? deps.buildRollsSummaryTemplateEvent(
          deps.escapeHtmlEvent("结果已隐藏，仅命运知晓"),
          deps.escapeHtmlEvent("隐藏"),
          ""
        )
      : deps.buildRollsSummaryTemplateEvent(
          deps.escapeHtmlEvent(buildRollsSummaryTextEvent(record.result)),
          deps.escapeHtmlEvent(deps.formatModifier(record.result.modifier)),
          selectionSummaryText ? deps.escapeHtmlEvent(selectionSummaryText) : ""
        ),
    explodeInfoHtml: deps.escapeHtmlEvent(explodeInfoText),
    modifierBreakdownHtml,
    compareHtml: deps.escapeHtmlEvent(isBlindRecord ? "?" : record.compareUsed),
    dcText: isBlindRecord ? "已隐藏" : String(record.dcUsed ?? "未设置"),
    dcReasonHtml: dcDescriptionHtml,
    statusText: status,
    statusColor,
    totalText: isBlindRecord ? "已隐藏" : String(record.result.total),
    timeLimitHtml: deps.escapeHtmlEvent(timeLimitLabel),
    diceVisualBlockHtml: diceVisualBlock,
    outcomeLabelHtml: deps.escapeHtmlEvent(outcomeLabel),
    outcomeToneClassName,
    outcomeTextHtml: deps.escapeHtmlEvent(outcomeTextClean),
    statusImpactHtml: deps.escapeHtmlEvent(statusImpactHtml),
    outcomeStatusSummaryHtml: deps.escapeHtmlEvent(outcomeStatusSummaryText),
    currentStatusesHtml: deps.escapeHtmlEvent(currentStatusesSummaryText),
  });
}
