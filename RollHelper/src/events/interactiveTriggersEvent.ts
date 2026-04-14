import { showSharedContextMenu } from "../../../_Components/sharedContextMenu";
import { ensureSharedTooltip } from "../../../_Components/sharedTooltip";
import { logger } from "../../index";
import type {
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventRollRecordEvent,
  RollVisibilityEvent,
  InteractiveTriggerEvent,
  SelectionFallbackLimitModeEvent,
  SelectionFallbackStateEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import {
  buildInteractiveTriggerTooltipHtmlEvent,
  getMessageInteractiveTriggersEvent,
} from "./interactiveTriggerMetadataEvent";
import { formatResultGradeLabelEvent } from "./roundEvent";

const TRIGGER_STYLE_ID_Event = "st-rh-inline-trigger-style";
const TRIGGER_SIGNATURE_ATTR_Event = "data-rh-trigger-signature";
const SELECTION_FALLBACK_TRIED_KEYS_LIMIT_Event = 120;
const SELECTION_FALLBACK_MULTI_SPACE_REGEX_Event = /\s{2,}/;
// 只把真正的句末标点视为分句边界，避免半句里的逗号、顿号被误判成多句。
const SELECTION_FALLBACK_SENTENCE_SPLIT_REGEX_Event = /[。！？；!?;]+/;

type ResolvedTriggerStateEvent = {
  resolved: boolean;
  statusLabel: string;
  visibility: RollVisibilityEvent | "public";
  resultGrade?: EventRollRecordEvent["resultGrade"];
  feedbackText?: string;
};

function normalizeTextEvent(value: unknown): string {
  return String(value ?? "");
}

function normalizeInlineTextEvent(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtmlEvent(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttributeEvent(value: unknown): string {
  return escapeHtmlEvent(value).replace(/`/g, "&#96;");
}

function parseDefaultBlindSkillsEvent(settings: DicePluginSettingsEvent): Set<string> {
  return new Set(
    String(settings.defaultBlindSkillsText ?? "")
      .split(/[\n,|]+/)
      .map((item) => normalizeInlineTextEvent(item).toLowerCase())
      .filter(Boolean)
  );
}

/**
 * 功能：把交互触发的动作与技能整理成更自然的中文短语。
 * @param trigger 当前交互触发。
 * @returns 适合按钮与状态文案使用的检定名称。
 */
function formatTriggerCheckNameEvent(trigger: InteractiveTriggerEvent): string {
  const action = normalizeInlineTextEvent(trigger.action || trigger.skill || "检定");
  const skill = normalizeInlineTextEvent(trigger.skill || trigger.action || "检定");
  if (!action && !skill) return "检定";
  if (!action) return skill;
  if (!skill) return action;
  if (action === skill) return skill;
  if (action === "回忆") return `回忆（${skill}）`;
  return skill;
}

function buildResolvedTriggerEventIdEvent(trigger: InteractiveTriggerEvent): string {
  const sourceMessageId = String(trigger.sourceMessageId || "msg").trim() || "msg";
  const sourceId = String(trigger.sourceId || trigger.label || "trigger").trim() || "trigger";
  const skill = String(trigger.skill || trigger.action || "check").trim() || "check";
  const occurrenceIndex = Number.isFinite(Number(trigger.occurrenceIndex))
    ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex)))
    : 0;
  const raw = `${sourceMessageId}:${sourceId}:${skill}:${occurrenceIndex}`;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
  return `itr:${normalized}`;
}

/**
 * 功能：根据已结算记录生成交互触发的状态标签。
 * @param record 已命中的检定记录。
 * @returns 适合展示给玩家的状态文本。
 */
function buildResolvedTriggerStatusLabelEvent(record: EventRollRecordEvent): string {
  const visibility = record.visibility || "public";
  if (visibility === "blind") {
    return formatResultGradeLabelEvent(record.resultGrade, "blind");
  }
  return formatResultGradeLabelEvent(record.resultGrade, "public");
}

function resolveResolvedTriggerFeedbackTextEvent(
  trigger: InteractiveTriggerEvent,
  resultGrade: EventRollRecordEvent["resultGrade"]
): string {
  const grade = resultGrade || "failure";
  if (grade === "critical_success") {
    return normalizeInlineTextEvent(
      trigger.triggerPackExplodeText || trigger.triggerPackSuccessText || ""
    );
  }
  if (grade === "partial_success" || grade === "success") {
    return normalizeInlineTextEvent(trigger.triggerPackSuccessText || "");
  }
  if (grade === "critical_failure" || grade === "failure") {
    return normalizeInlineTextEvent(trigger.triggerPackFailureText || "");
  }
  return "";
}

function matchesResolvedTriggerEvent(args: {
  trigger: InteractiveTriggerEvent;
  eventId?: string;
  sourceAssistantMsgId?: string;
  targetName?: string;
  skill?: string;
}): boolean {
  if (String(args.eventId || "").trim() === buildResolvedTriggerEventIdEvent(args.trigger)) {
    return true;
  }
  return String(args.sourceAssistantMsgId || "").trim() === String(args.trigger.sourceMessageId || "").trim()
    && String(args.targetName || "").trim() === String(args.trigger.sourceId || args.trigger.label || "").trim()
    && String(args.skill || "").trim() === String(args.trigger.skill || "").trim();
}

/**
 * 功能：查找交互触发对应的最新检定记录。
 * @param trigger 当前交互触发。
 * @param meta 当前运行时骰子元数据。
 * @returns 命中的事件与记录；未命中时返回 `null`。
 */
function findResolvedTriggerStateEvent(
  trigger: InteractiveTriggerEvent,
  meta: DiceMetaEvent | null | undefined
): ResolvedTriggerStateEvent {
  const round = meta?.pendingRound;
  if (round) {
    for (let index = round.rolls.length - 1; index >= 0; index -= 1) {
      const record = round.rolls[index];
      const event = round.events.find((item) => item.id === record?.eventId);
      if (!event) continue;
      const matched = matchesResolvedTriggerEvent({
        trigger,
        eventId: event.id,
        sourceAssistantMsgId: event.sourceAssistantMsgId,
        targetName: event.targetName,
        skill: event.skill,
      });
      if (!matched) continue;
      return {
        resolved: true,
        statusLabel: buildResolvedTriggerStatusLabelEvent(record),
        visibility: record.visibility || "public",
        resultGrade: record.resultGrade,
        feedbackText: resolveResolvedTriggerFeedbackTextEvent(trigger, record.resultGrade),
      };
    }
  }

  const summaryHistory = Array.isArray(meta?.summaryHistory) ? meta.summaryHistory : [];
  for (let snapshotIndex = summaryHistory.length - 1; snapshotIndex >= 0; snapshotIndex -= 1) {
    const snapshot = summaryHistory[snapshotIndex];
    const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
    for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
      const item = events[eventIndex];
      const matched = matchesResolvedTriggerEvent({
        trigger,
        eventId: item?.id,
        sourceAssistantMsgId: item?.sourceAssistantMsgId,
        targetName: item?.targetLabel,
        skill: item?.skill,
      });
      if (!matched) continue;
      return {
        resolved: true,
        statusLabel: formatResultGradeLabelEvent(item?.resultGrade, item?.visibility || "public"),
        visibility: item?.visibility === "blind" ? "blind" : "public",
        resultGrade: item?.resultGrade,
        feedbackText: resolveResolvedTriggerFeedbackTextEvent(trigger, item?.resultGrade),
      };
    }
  }

  return {
    resolved: false,
    statusLabel: "",
    visibility: "public",
    resultGrade: undefined,
    feedbackText: "",
  };
}

/**
 * 功能：构建交互触发节点的 tooltip 文本。
 * @param payload 当前交互触发。
 * @param resolvedState 当前触发的已结算状态。
 * @returns 可直接挂载到节点上的 HTML 提示内容。
 */
function buildTriggerTooltipHtmlEvent(
  payload: InteractiveTriggerEvent,
  resolvedState: ResolvedTriggerStateEvent
): string {
  if (!resolvedState.resolved) {
    return buildInteractiveTriggerTooltipHtmlEvent(payload);
  }
  const directText = normalizeInlineTextEvent(resolvedState.feedbackText || "");
  if (directText) {
    return `<span class="st-rh-trigger-tip"><strong>${escapeHtmlEvent(payload.label || "该线索")}</strong><br>${escapeHtmlEvent(directText)}</span>`;
  }
  if (payload.blind && payload.revealMode !== "instant") {
    return `<span class="st-rh-trigger-tip"><strong>${escapeHtmlEvent(payload.label || "该线索")}</strong><br>待体现｜${escapeHtmlEvent(
      resolvedState.statusLabel || "暗骰已处理"
    )}</span>`;
  }
  return `<span class="st-rh-trigger-tip"><strong>${escapeHtmlEvent(payload.label || "该线索")}</strong><br>${escapeHtmlEvent(
    resolvedState.statusLabel || "已完成"
  )}</span>`;
}

/**
 * 功能：构建交互触发节点的 HTML 标记。
 * @param payload 当前交互触发。
 * @param resolvedState 当前触发的已结算状态。
 * @returns 交互触发节点 HTML。
 */
function buildTriggerMarkupEvent(payload: InteractiveTriggerEvent, resolvedState: ResolvedTriggerStateEvent): string {
  const tooltip = buildTriggerTooltipHtmlEvent(payload, resolvedState);
  const hoverEnabled = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
    : false;
  return `<span class="st-rh-inline-trigger" data-rh-trigger="1" data-trigger-id="${escapeHtmlEvent(
    payload.triggerId
  )}" data-label="${escapeHtmlEvent(payload.label)}" data-action="${escapeHtmlEvent(
    payload.action
  )}" data-skill="${escapeHtmlEvent(payload.skill)}" data-blind="${payload.blind ? "1" : "0"}" data-source-id="${escapeHtmlEvent(
    payload.sourceId
  )}" data-source-floor-key="${escapeHtmlEvent(payload.sourceFloorKey || "")}" data-source-message-id="${escapeHtmlEvent(
    payload.sourceMessageId
  )}" data-note="${escapeHtmlEvent(
    payload.note || ""
  )}" data-lore-type="${escapeHtmlEvent(payload.loreType || "")}" data-dc-hint="${Number.isFinite(
    Number(payload.dcHint)
  )
    ? String(Math.floor(Number(payload.dcHint)))
    : ""}" data-difficulty="${escapeHtmlEvent(payload.difficulty || "normal")}" data-dice-expr="${escapeHtmlEvent(payload.diceExpr || "")}" data-compare="${escapeHtmlEvent(
    payload.compare || ">="
  )}" data-reveal-mode="${escapeHtmlEvent(payload.revealMode || "delayed")}" data-trigger-pack-source-id="${escapeHtmlEvent(
    payload.triggerPackSourceId || payload.sourceId || ""
  )}" data-trigger-pack-success="${escapeHtmlEvent(payload.triggerPackSuccessText || "")}" data-trigger-pack-failure="${escapeHtmlEvent(
    payload.triggerPackFailureText || ""
  )}" data-trigger-pack-explode="${escapeHtmlEvent(payload.triggerPackExplodeText || "")}" data-occurrence-index="${Number.isFinite(
    Number(payload.occurrenceIndex)
  )
    ? String(Math.max(0, Math.floor(Number(payload.occurrenceIndex))))
    : "0"}" data-resolved="${resolvedState.resolved ? "1" : "0"}" data-resolved-label="${escapeHtmlEvent(
    resolvedState.statusLabel
  )}" data-resolved-visibility="${escapeHtmlEvent(resolvedState.visibility)}"${hoverEnabled ? ` data-tip="${escapeHtmlAttributeEvent(tooltip)}" data-tip-html="true"` : ""}> <i class="fa-solid fa-dice-d20 st-rh-inline-trigger-icon" aria-hidden="true"></i>${escapeHtmlEvent(payload.label)}</span>`;
}

function resolveMessageContainerIdEvent(node: HTMLElement): string {
  const carrier =
    node.closest("[mesid]") ||
    node.closest("[data-message-id]") ||
    node.closest(".mes");
  const raw =
    carrier?.getAttribute("mesid") ||
    carrier?.getAttribute("data-message-id") ||
    carrier?.getAttribute("data-mesid") ||
    "";
  return normalizeInlineTextEvent(raw);
}

function resolveMessageRecordEvent(
  node: HTMLElement,
  getLiveContextEvent: (() => { chat?: TavernMessageEvent[] | unknown } | null) | undefined
): TavernMessageEvent | null {
  const liveCtx = getLiveContextEvent?.();
  const chat = liveCtx?.chat;
  if (!Array.isArray(chat)) return null;
  const messageIndex = Number(resolveMessageContainerIdEvent(node));
  if (!Number.isFinite(messageIndex) || messageIndex < 0 || messageIndex >= chat.length) return null;
  return (chat[messageIndex] as TavernMessageEvent) ?? null;
}

function normalizeSelectionFallbackTextEvent(text: string): string {
  return normalizeInlineTextEvent(text).replace(/\s+/g, "");
}

/**
 * 功能：统计自由划词文本中的有效句段数量。
 * @param text 原始划词文本。
 * @returns 归一化后的有效句段数量。
 */
function countSelectionFallbackSentencesEvent(text: string): number {
  return String(text ?? "")
    .split(SELECTION_FALLBACK_SENTENCE_SPLIT_REGEX_Event)
    .map((item) => normalizeInlineTextEvent(item))
    .filter(Boolean)
    .length;
}

/**
 * 功能：读取当前自由划词限制模式。
 * @param settings 当前插件设置。
 * @returns 当前生效的限制模式。
 */
function resolveSelectionFallbackLimitModeEvent(
  settings: DicePluginSettingsEvent
): SelectionFallbackLimitModeEvent {
  return settings.selectionFallbackLimitMode === "char_count" ? "char_count" : "sentence_count";
}

function buildSelectionFallbackFloorKeyEvent(node: HTMLElement, message: TavernMessageEvent | null): string {
  const rawMesId = resolveMessageContainerIdEvent(node);
  if (rawMesId) return `floor:${rawMesId}`;
  const explicitId = String(message?.id ?? message?.cid ?? message?.uid ?? "").trim();
  if (explicitId) return `floor_msg:${explicitId}`;
  return "floor:unknown";
}

function buildSelectionFallbackSourceMessageIdEvent(node: HTMLElement, message: TavernMessageEvent | null): string {
  const rawMesId = resolveMessageContainerIdEvent(node);
  if (rawMesId) return rawMesId;
  const explicitId = String(message?.id ?? message?.cid ?? message?.uid ?? "").trim();
  if (explicitId) return explicitId;
  return "";
}

function buildSelectionFallbackKeyEvent(floorKey: string, text: string): string {
  return `${floorKey}::${normalizeSelectionFallbackTextEvent(text).toLowerCase()}`;
}

function ensureSelectionFallbackStateEvent(meta: DiceMetaEvent): SelectionFallbackStateEvent {
  if (!meta.selectionFallbackState) {
    meta.selectionFallbackState = {
      roundId: undefined,
      roundUsedCount: 0,
      floorUsedCountMap: {},
      triedKeys: [],
    };
  }
  if (!meta.selectionFallbackState.floorUsedCountMap || typeof meta.selectionFallbackState.floorUsedCountMap !== "object") {
    meta.selectionFallbackState.floorUsedCountMap = {};
  }
  if (!Array.isArray(meta.selectionFallbackState.triedKeys)) {
    meta.selectionFallbackState.triedKeys = [];
  }
  return meta.selectionFallbackState;
}

function syncSelectionFallbackStateWithRoundEvent(meta: DiceMetaEvent, roundId: string): SelectionFallbackStateEvent {
  const state = ensureSelectionFallbackStateEvent(meta);
  if (state.roundId !== roundId) {
    state.roundId = roundId;
    state.roundUsedCount = 0;
    state.floorUsedCountMap = {};
    state.triedKeys = [];
  }
  return state;
}

function canUseSelectionFallbackEvent(args: {
  meta: DiceMetaEvent;
  settings: DicePluginSettingsEvent;
  roundId: string;
  floorKey: string;
  selectionKey: string;
}): { ok: boolean; reason?: string; remainingRound: number; remainingFloor: number } {
  const state = syncSelectionFallbackStateWithRoundEvent(args.meta, args.roundId);
  const usedFloorCount = Number(state.floorUsedCountMap[args.floorKey] || 0);
  const remainingRound = Math.max(0, args.settings.selectionFallbackMaxPerRound - state.roundUsedCount);
  const remainingFloor = Math.max(0, args.settings.selectionFallbackMaxPerFloor - usedFloorCount);
  if (state.triedKeys.includes(args.selectionKey)) {
    return { ok: false, reason: "该文本在当前楼层已经尝试过。", remainingRound, remainingFloor };
  }
  if (remainingRound <= 0) {
    return { ok: false, reason: "本轮自由划词次数已用完。", remainingRound, remainingFloor };
  }
  if (remainingFloor <= 0) {
    return { ok: false, reason: "当前楼层自由划词次数已用完。", remainingRound, remainingFloor };
  }
  return { ok: true, remainingRound, remainingFloor };
}

function consumeSelectionFallbackUsageEvent(args: {
  meta: DiceMetaEvent;
  roundId: string;
  floorKey: string;
  selectionKey: string;
}): void {
  const state = syncSelectionFallbackStateWithRoundEvent(args.meta, args.roundId);
  state.roundUsedCount += 1;
  state.floorUsedCountMap[args.floorKey] = Number(state.floorUsedCountMap[args.floorKey] || 0) + 1;
  if (!state.triedKeys.includes(args.selectionKey)) {
    state.triedKeys.push(args.selectionKey);
    if (state.triedKeys.length > SELECTION_FALLBACK_TRIED_KEYS_LIMIT_Event) {
      state.triedKeys = state.triedKeys.slice(-SELECTION_FALLBACK_TRIED_KEYS_LIMIT_Event);
    }
  }
}

function resolveSelectionFallbackRoundIdEvent(meta: DiceMetaEvent): string {
  const roundId = String(meta.pendingRound?.roundId ?? "").trim();
  return roundId || "__no_round__";
}

function buildSelectionFallbackStatusTextEvent(args: {
  settings: DicePluginSettingsEvent;
  roundRemaining: number;
  floorRemaining: number;
}): string[] {
  const limitMode = resolveSelectionFallbackLimitModeEvent(args.settings);
  const limitText = limitMode === "char_count"
    ? `规则：按字数 ${args.settings.selectionFallbackMinTextLength}-${args.settings.selectionFallbackMaxTextLength} 字`
    : `规则：按句数最多 ${args.settings.selectionFallbackMaxSentences} 句`;
  return [
    `自由划词检定`,
    limitText,
    `剩余：本轮 ${Math.max(0, args.roundRemaining)}/${args.settings.selectionFallbackMaxPerRound} ｜ 本楼层 ${Math.max(0, args.floorRemaining)}/${args.settings.selectionFallbackMaxPerFloor}`,
  ];
}

function resolveSelectionFallbackBlockEvent(node: Node | null, scope: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (current && current !== scope) {
    if (current.parentElement === scope) {
      return current;
    }
    current = current.parentElement;
  }
  return scope;
}

function isSelectionFallbackTextAllowedEvent(
  text: string,
  settings: DicePluginSettingsEvent
): { ok: boolean; reason?: string } {
  const raw = String(text ?? "");
  const normalized = normalizeInlineTextEvent(raw);
  const compact = normalizeSelectionFallbackTextEvent(raw);
  const limitMode = resolveSelectionFallbackLimitModeEvent(settings);
  if (!normalized || !compact) {
    return { ok: false, reason: "请选择有效的正文片段。" };
  }
  if (raw.includes("\n") || raw.includes("\r")) {
    return { ok: false, reason: "自由划词不能跨行或跨段。"};
  }
  if (SELECTION_FALLBACK_MULTI_SPACE_REGEX_Event.test(raw)) {
    return { ok: false, reason: "自由划词不能包含多个连续空格。" };
  }
  if (limitMode === "char_count") {
    if (compact.length < settings.selectionFallbackMinTextLength) {
      return { ok: false, reason: `当前为按字数限制，至少需要 ${settings.selectionFallbackMinTextLength} 个字。` };
    }
    if (compact.length > settings.selectionFallbackMaxTextLength) {
      return { ok: false, reason: `当前为按字数限制，最多允许 ${settings.selectionFallbackMaxTextLength} 个字。` };
    }
    return { ok: true };
  }

  const sentenceCount = countSelectionFallbackSentencesEvent(raw);
  if (sentenceCount <= 0) {
    return { ok: false, reason: "当前选区没有可识别的有效句段。" };
  }
  if (sentenceCount > settings.selectionFallbackMaxSentences) {
    return { ok: false, reason: `当前为按句数限制，最多允许 ${settings.selectionFallbackMaxSentences} 句。` };
  }
  return { ok: true };
}

function isSelectionFallbackRangeAllowedEvent(
  selection: Selection | null
): { ok: boolean; scopeNode: HTMLElement | null; reason?: string } {
  if (!selection || selection.rangeCount <= 0 || selection.isCollapsed) {
    return { ok: false, scopeNode: null, reason: "请选择一个短词或短短语。" };
  }
  const range = selection.getRangeAt(0);
  const anchorElement = selection.anchorNode instanceof HTMLElement
    ? selection.anchorNode
    : selection.anchorNode?.parentElement ?? null;
  const focusElement = selection.focusNode instanceof HTMLElement
    ? selection.focusNode
    : selection.focusNode?.parentElement ?? null;
  const anchorScope = anchorElement?.closest(".mes_text") as HTMLElement | null;
  const focusScope = focusElement?.closest(".mes_text") as HTMLElement | null;
  if (!anchorScope || !focusScope || anchorScope !== focusScope) {
    return { ok: false, scopeNode: null, reason: "自由划词不能跨多个消息文本区域。" };
  }
  const startBlock = resolveSelectionFallbackBlockEvent(range.startContainer, anchorScope);
  const endBlock = resolveSelectionFallbackBlockEvent(range.endContainer, anchorScope);
  if (!startBlock || !endBlock || startBlock !== endBlock) {
    return { ok: false, scopeNode: anchorScope, reason: "自由划词不能跨多个段落或多个文本块。" };
  }
  const triggerNodes = Array.from(anchorScope.querySelectorAll<HTMLElement>(".st-rh-inline-trigger"));
  for (const triggerNode of triggerNodes) {
    try {
      if (range.intersectsNode(triggerNode)) {
        return { ok: false, scopeNode: anchorScope, reason: "请直接点击 AI 标记的线索词，不要混选现有 trigger。"};
      }
    } catch {
      continue;
    }
  }
  return { ok: true, scopeNode: anchorScope };
}

function collectRenderableTextNodesEvent(node: HTMLElement): Array<{ node: Text; start: number; end: number }> {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.parentElement && !current.parentElement.closest(".st-rh-inline-trigger")) {
      const text = current.nodeValue ?? "";
      textNodes.push({ node: current, start: offset, end: offset + text.length });
      offset += text.length;
    }
    current = walker.nextNode();
  }
  return textNodes;
}

function unwrapExistingTriggerMarkupEvent(node: HTMLElement): void {
  node.querySelectorAll<HTMLElement>(".st-rh-inline-trigger").forEach((triggerNode) => {
    triggerNode.replaceWith(document.createTextNode(triggerNode.textContent ?? ""));
  });
}

function collectTextMatchesEvent(text: string, needle: string): number[] {
  const result: number[] = [];
  if (!needle) return result;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const next = text.indexOf(needle, searchFrom);
    if (next < 0) break;
    result.push(next);
    searchFrom = next + needle.length;
  }
  return result;
}

function buildRenderableTriggerRangesEvent(
  text: string,
  triggers: InteractiveTriggerEvent[]
): Array<{ start: number; end: number; trigger: InteractiveTriggerEvent }> {
  const positionsCache = new Map<string, number[]>();
  type AssignedTriggerRangeEvent = {
    originalIndex: number;
    start: number;
    end: number;
    trigger: InteractiveTriggerEvent;
  };
  const assigned = triggers
    .map<AssignedTriggerRangeEvent | null>((trigger, index) => {
      const label = normalizeInlineTextEvent(trigger.label);
      if (!label) return null;
      const key = label;
      let positions = positionsCache.get(key);
      if (!positions) {
        positions = collectTextMatchesEvent(text, label);
        positionsCache.set(key, positions);
      }
      const occurrenceIndex = Number.isFinite(Number(trigger.occurrenceIndex))
        ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex)))
        : 0;
      const start = positions[occurrenceIndex];
      if (!Number.isFinite(start)) return null;
      return {
        originalIndex: index,
        start,
        end: start + label.length,
        trigger: {
          ...trigger,
          occurrenceIndex,
        },
      };
    })
    .filter((item): item is AssignedTriggerRangeEvent => Boolean(item))
    .sort((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);

  const ranges: Array<{ start: number; end: number; trigger: InteractiveTriggerEvent }> = [];
  let lastEnd = -1;
  for (const item of assigned) {
    if (item.start < lastEnd) continue;
    ranges.push({ start: item.start, end: item.end, trigger: item.trigger });
    lastEnd = item.end;
  }
  return ranges;
}

/**
 * 功能：把单个交互触发配置转换成 DOM 节点。
 * @param trigger 当前交互触发。
 * @param resolvedState 当前触发的已结算状态。
 * @returns 已构建完成的触发节点。
 */
function createTriggerNodeEvent(trigger: InteractiveTriggerEvent, resolvedState: ResolvedTriggerStateEvent): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = buildTriggerMarkupEvent(trigger, resolvedState);
  return template.content.firstElementChild as HTMLElement;
}

/**
 * 功能：生成触发节点的签名，用于判断是否需要重绘。
 * @param text 当前消息正文。
 * @param triggers 当前消息的交互触发列表。
 * @param meta 当前运行时骰子元数据。
 * @returns 描述当前渲染状态的稳定签名文本。
 */
function buildTriggerSignatureEvent(
  text: string,
  triggers: InteractiveTriggerEvent[],
  meta: DiceMetaEvent | null | undefined
): string {
  return JSON.stringify({
    text,
    triggers: triggers.map((trigger) => ({
      triggerId: normalizeInlineTextEvent(trigger.triggerId),
      label: normalizeInlineTextEvent(trigger.label),
      action: normalizeInlineTextEvent(trigger.action),
      skill: normalizeInlineTextEvent(trigger.skill),
      blind: Boolean(trigger.blind),
      sourceId: normalizeInlineTextEvent(trigger.sourceId),
      sourceFloorKey: normalizeInlineTextEvent(trigger.sourceFloorKey),
      sourceMessageId: normalizeInlineTextEvent(trigger.sourceMessageId),
      compare: normalizeInlineTextEvent(trigger.compare),
      revealMode: normalizeInlineTextEvent(trigger.revealMode),
      triggerPackSourceId: normalizeInlineTextEvent(trigger.triggerPackSourceId),
      triggerPackSuccessText: normalizeInlineTextEvent(trigger.triggerPackSuccessText),
      triggerPackFailureText: normalizeInlineTextEvent(trigger.triggerPackFailureText),
      triggerPackExplodeText: normalizeInlineTextEvent(trigger.triggerPackExplodeText),
      occurrenceIndex: Number.isFinite(Number(trigger.occurrenceIndex)) ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex))) : 0,
      resolvedState: findResolvedTriggerStateEvent(trigger, meta),
    })),
  });
}

function enhanceMessageNodeEvent(
  node: HTMLElement,
  message: TavernMessageEvent | null,
  meta: DiceMetaEvent | null | undefined
): boolean {
  const triggers = getMessageInteractiveTriggersEvent(message).filter((trigger) => normalizeInlineTextEvent(trigger.label));
  let changed = false;
  const currentText = normalizeTextEvent(node.textContent);
  const nextSignature = buildTriggerSignatureEvent(currentText, triggers, meta);
  const currentSignature = node.getAttribute(TRIGGER_SIGNATURE_ATTR_Event) || "";
  if (currentSignature === nextSignature && node.querySelectorAll(".st-rh-inline-trigger").length === triggers.length) {
    return changed;
  }

  unwrapExistingTriggerMarkupEvent(node);
  if (triggers.length <= 0) {
    node.removeAttribute(TRIGGER_SIGNATURE_ATTR_Event);
    return changed;
  }
  const textNodes = collectRenderableTextNodesEvent(node);
  const fullText = textNodes.map((item) => item.node.nodeValue ?? "").join("");
  const ranges = buildRenderableTriggerRangesEvent(fullText, triggers);
  for (const entry of textNodes) {
    const localRanges = ranges.filter((range) => range.start >= entry.start && range.end <= entry.end);
    if (localRanges.length === 0) continue;

    const raw = entry.node.nodeValue ?? "";
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const range of localRanges) {
      const localStart = range.start - entry.start;
      const localEnd = range.end - entry.start;
      if (localStart > cursor) {
        fragment.appendChild(document.createTextNode(raw.slice(cursor, localStart)));
      }
      fragment.appendChild(createTriggerNodeEvent(range.trigger, findResolvedTriggerStateEvent(range.trigger, meta)));
      cursor = localEnd;
    }
    if (cursor < raw.length) {
      fragment.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    entry.node.replaceWith(fragment);
    changed = true;
  }

  node.setAttribute(TRIGGER_SIGNATURE_ATTR_Event, buildTriggerSignatureEvent(normalizeTextEvent(node.textContent), triggers, meta));
  return changed;
}

function ensureTriggerStylesEvent(): void {
  if (document.getElementById(TRIGGER_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = TRIGGER_STYLE_ID_Event;
  style.textContent = `
    .st-rh-inline-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.28em;
      border-bottom: 1px dashed rgba(197, 160, 89, 0.68);
      box-shadow: inset 0 -0.08em 0 rgba(197, 160, 89, 0.14);
      color: inherit;
      cursor: pointer;
      transition: border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
    }
    .st-rh-inline-trigger-icon {
      font-size: 0.82em;
      opacity: 0.82;
      transform: translateY(-0.02em);
      pointer-events: none;
    }
    .st-rh-inline-trigger:hover,
    .st-rh-inline-trigger.is-active {
      border-bottom-color: rgba(255, 220, 145, 0.96);
      box-shadow: inset 0 -0.15em 0 rgba(197, 160, 89, 0.22), 0 0 10px rgba(197, 160, 89, 0.18);
      color: #f4deb0;
    }
    .st-rh-inline-trigger[data-resolved="1"] {
      cursor: default;
      opacity: 0.58;
      border-bottom-color: rgba(153, 153, 153, 0.45);
      box-shadow: inset 0 -0.08em 0 rgba(153, 153, 153, 0.12);
    }
    .st-rh-inline-trigger[data-resolved="1"]:hover,
    .st-rh-inline-trigger[data-resolved="1"].is-active {
      color: inherit;
      border-bottom-color: rgba(153, 153, 153, 0.45);
      box-shadow: inset 0 -0.08em 0 rgba(153, 153, 153, 0.12);
    }
  `;
  document.head.appendChild(style);
}

export interface ExecuteInteractiveTriggerDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent?: () => DiceMetaEvent | null | undefined;
  getLiveContextEvent?: () => { chat?: TavernMessageEvent[] | unknown } | null;
  persistChatSafeEvent?: () => void;
  refreshInteractiveTriggersInDomEvent?: () => void;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error" | "card") => void;
  performInteractiveTriggerRollEvent: (trigger: InteractiveTriggerEvent) => Promise<{
    record: {
      result: any;
      diceExpr: string;
      skillModifierApplied: number;
      source: string;
    };
    event: {
      title: string;
    };
    feedback: {
      revealMode: "instant" | "delayed";
      visibility: "public" | "blind";
      title: string;
      resultGrade: string;
      stateLabel: string;
      feedbackText: string;
    };
  }>;
}

function buildInteractiveTriggerFeedbackCardHtmlEvent(result: Awaited<ReturnType<ExecuteInteractiveTriggerDepsEvent["performInteractiveTriggerRollEvent"]>>): string {
  const feedback = result.feedback;
  const gradeLabel = formatResultGradeLabelEvent(
    feedback.resultGrade as EventRollRecordEvent["resultGrade"],
    feedback.visibility === "blind" ? "blind" : "public"
  );
  return `<div class="st-rh-trigger-feedback-card"><strong>${escapeHtmlEvent(
    feedback.title || result.event?.title || "线索检定"
  )}</strong><div>模式：${escapeHtmlEvent(feedback.revealMode === "instant" ? "即时反馈" : "延迟体现")}</div><div>状态：${escapeHtmlEvent(
    feedback.stateLabel || "已完成"
  )}</div><div>结果等级：${escapeHtmlEvent(gradeLabel)}</div><div>${escapeHtmlEvent(
    feedback.feedbackText || "检定已完成。"
  )}</div></div>`;
}

export async function executeInteractiveTriggerEvent(
  trigger: InteractiveTriggerEvent,
  deps: ExecuteInteractiveTriggerDepsEvent
): Promise<void> {
  try {
    const result = await deps.performInteractiveTriggerRollEvent(trigger);
    deps.appendToConsoleEvent(buildInteractiveTriggerFeedbackCardHtmlEvent(result), "card");
    deps.persistChatSafeEvent?.();
    setTimeout(() => deps.refreshInteractiveTriggersInDomEvent?.(), 0);
    setTimeout(() => deps.refreshInteractiveTriggersInDomEvent?.(), 120);
  } catch (error) {
    logger.warn("交互触发检定失败", error);
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (message) {
      deps.appendToConsoleEvent(message, "warn");
    }
  }
}

function buildTriggerMenuItemsEvent(
  trigger: InteractiveTriggerEvent,
  deps: ExecuteInteractiveTriggerDepsEvent
) {
  const checkName = formatTriggerCheckNameEvent(trigger);
  return [
    {
      id: `${trigger.triggerId}:primary`,
      label: trigger.blind ? `进行${checkName}暗骰` : `进行${checkName}检定`,
      iconClassName: trigger.blind ? "fa-solid fa-eye-slash" : "fa-solid fa-dice-d20",
      onSelect: () => executeInteractiveTriggerEvent(trigger, deps),
    },
  ];
}

/**
 * 功能：生成已结算交互触发的只读菜单项。
 * @param trigger 当前交互触发。
 * @param triggerNode 当前触发节点。
 * @returns 用于上下文菜单的只读条目列表。
 */
function buildResolvedTriggerMenuItemsEvent(
  trigger: InteractiveTriggerEvent,
  triggerNode: HTMLElement
) {
  const statusLabel = normalizeInlineTextEvent(triggerNode.dataset.resolvedLabel || "已检定完成");
  const visibility = normalizeInlineTextEvent(triggerNode.dataset.resolvedVisibility || (trigger.blind ? "blind" : "public"));
  const revealMode = normalizeInlineTextEvent(triggerNode.dataset.revealMode || trigger.revealMode || "delayed");
  if (visibility === "blind") {
    return [
      {
        id: `${trigger.triggerId}:resolved-blind`,
        label: revealMode === "instant" ? "已即时体现" : "已暗骰处理",
        iconClassName: "fa-solid fa-eye-slash",
        disabled: true,
        onSelect: () => undefined,
      },
      {
        id: `${trigger.triggerId}:resolved-grade`,
        label: `结果等级：${statusLabel}`,
        iconClassName: "fa-solid fa-chart-line",
        disabled: true,
        onSelect: () => undefined,
      },
      {
        id: `${trigger.triggerId}:resolved-detail`,
        label: revealMode === "instant"
          ? "已给出即时反馈，真实点数、阈值与修正不会公开显示。"
          : "真实点数、阈值与修正不会公开显示。",
        iconClassName: "fa-solid fa-circle-info",
        disabled: true,
        onSelect: () => undefined,
      },
    ];
  }
  const detailLabel = visibility === "blind"
    ? "这条线索已按暗骰处理，点数不会公开。"
    : "这条线索已经结算，可以直接参考这个结果。";
  return [
    {
      id: `${trigger.triggerId}:resolved-status`,
      label: statusLabel,
      iconClassName: visibility === "blind" ? "fa-solid fa-eye-slash" : "fa-solid fa-circle-check",
      disabled: true,
      onSelect: () => undefined,
    },
    {
      id: `${trigger.triggerId}:resolved-detail`,
      label: detailLabel,
      iconClassName: "fa-solid fa-circle-info",
      disabled: true,
      onSelect: () => undefined,
    },
  ];
}

function buildSelectionFallbackTriggersEvent(args: {
  text: string;
  sourceMessageId: string;
  sourceFloorKey: string;
  selectionKey: string;
  deps: ExecuteInteractiveTriggerDepsEvent;
}): InteractiveTriggerEvent[] {
  const { text, sourceMessageId, sourceFloorKey, selectionKey, deps } = args;
  const settings = deps.getSettingsEvent();
  const defaultBlindSkills = parseDefaultBlindSkillsEvent(settings);
  const label = normalizeInlineTextEvent(text).slice(0, 48);
  const action = normalizeInlineTextEvent(settings.selectionFallbackSingleAction || "调查") || "调查";
  const skill = normalizeInlineTextEvent(settings.selectionFallbackSingleSkill || "调查") || "调查";
  const base = {
    triggerId: `${selectionKey}:${Date.now()}`,
    label,
    sourceMessageId,
    sourceFloorKey,
    sourceId: selectionKey,
    textRange: null,
    dcHint: null,
    difficulty: "normal" as const,
    compare: ">=" as const,
    revealMode: "delayed" as const,
    loreType: "",
    note: "来自玩家划词触发",
    diceExpr: "1d20",
  };
  return [{
    ...base,
    action,
    skill,
    blind: defaultBlindSkills.has(skill.toLowerCase()),
  }];
}

function showTriggerMenuAtEvent(
  x: number,
  y: number,
  trigger: InteractiveTriggerEvent,
  deps: ExecuteInteractiveTriggerDepsEvent
): void {
  showSharedContextMenu({
    x,
    y,
    items: buildTriggerMenuItemsEvent(trigger, deps),
  });
}

/**
 * 功能：在指定位置展示已结算交互触发的状态菜单。
 * @param x 菜单横坐标。
 * @param y 菜单纵坐标。
 * @param trigger 当前交互触发。
 * @param triggerNode 当前触发节点。
 * @returns 无返回值。
 */
function showResolvedTriggerMenuAtEvent(
  x: number,
  y: number,
  trigger: InteractiveTriggerEvent,
  triggerNode: HTMLElement
): void {
  showSharedContextMenu({
    x,
    y,
    items: buildResolvedTriggerMenuItemsEvent(trigger, triggerNode),
  });
}

function showSelectionMenuEvent(args: {
  selectionText: string;
  x: number;
  y: number;
  deps: ExecuteInteractiveTriggerDepsEvent;
  sourceMessageId: string;
  sourceFloorKey: string;
  selectionKey: string;
  meta: DiceMetaEvent;
  canUseResult: { ok: boolean; reason?: string; remainingRound: number; remainingFloor: number };
  readonlyReasons?: string[];
}): void {
  const {
    selectionText,
    x,
    y,
    deps,
    sourceMessageId,
    sourceFloorKey,
    selectionKey,
    meta,
    canUseResult,
    readonlyReasons = [],
  } = args;
  const settings = deps.getSettingsEvent();
  const roundId = resolveSelectionFallbackRoundIdEvent(meta);
  const triggers = buildSelectionFallbackTriggersEvent({
    text: selectionText,
    sourceMessageId,
    sourceFloorKey,
    selectionKey,
    deps,
  });
  const headerItems = buildSelectionFallbackStatusTextEvent({
    settings,
    roundRemaining: canUseResult.remainingRound,
    floorRemaining: canUseResult.remainingFloor,
  }).map((label, index) => ({
    id: `selection-status:${index}`,
    label,
    iconClassName: index === 0 ? "fa-solid fa-pen-ruler" : "fa-solid fa-chart-simple",
    disabled: true,
    onSelect: () => undefined,
  }));
  const reasonItems = readonlyReasons.map((reason, index) => ({
    id: `selection-reason:${index}`,
    label: reason,
    iconClassName: "fa-solid fa-circle-info",
    disabled: true,
    onSelect: () => undefined,
  }));
  const actionItems = canUseResult.ok
    ? triggers.map((trigger) => ({
        id: trigger.triggerId,
        label: trigger.blind
          ? `进行${formatTriggerCheckNameEvent(trigger)}暗骰`
          : `进行${formatTriggerCheckNameEvent(trigger)}检定`,
        iconClassName: trigger.blind ? "fa-solid fa-eye-slash" : "fa-solid fa-dice-d20",
        onSelect: async () => {
          consumeSelectionFallbackUsageEvent({
            meta,
            roundId,
            floorKey: sourceFloorKey,
            selectionKey,
          });
          deps.persistChatSafeEvent?.();
          await executeInteractiveTriggerEvent(trigger, deps);
        },
      }))
    : [
        {
          id: "selection-no-action",
          label: "当前不可执行自由划词检定",
          iconClassName: "fa-solid fa-ban",
          disabled: true,
          onSelect: () => undefined,
        },
      ];
  showSharedContextMenu({
    x,
    y,
    items: [...headerItems, ...reasonItems, ...actionItems],
  });
}

function resolveSelectionTriggerNodeEvent(selection: Selection | null): HTMLElement | null {
  if (!selection || selection.rangeCount <= 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const commonNode = range.commonAncestorContainer;
  const baseElement =
    commonNode instanceof HTMLElement
      ? commonNode
      : commonNode.parentElement;
  const scope = baseElement?.closest(".mes_text") as HTMLElement | null;
  if (!scope) return null;
  const triggerNodes = Array.from(scope.querySelectorAll<HTMLElement>(".st-rh-inline-trigger"));
  for (const node of triggerNodes) {
    try {
      if (range.intersectsNode(node)) {
        return node;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildTriggerFromNodeEvent(triggerNode: HTMLElement): InteractiveTriggerEvent {
  return {
    triggerId: normalizeInlineTextEvent(triggerNode.dataset.triggerId),
    label: normalizeInlineTextEvent(triggerNode.dataset.label),
    action: normalizeInlineTextEvent(triggerNode.dataset.action),
    skill: normalizeInlineTextEvent(triggerNode.dataset.skill),
    blind: triggerNode.dataset.blind === "1",
    sourceMessageId: normalizeInlineTextEvent(triggerNode.dataset.sourceMessageId),
    sourceFloorKey: normalizeInlineTextEvent(triggerNode.dataset.sourceFloorKey),
    sourceId: normalizeInlineTextEvent(triggerNode.dataset.sourceId),
    occurrenceIndex: Number.isFinite(Number(triggerNode.dataset.occurrenceIndex))
      ? Math.max(0, Math.floor(Number(triggerNode.dataset.occurrenceIndex)))
      : 0,
    textRange: null,
    dcHint: Number.isFinite(Number(triggerNode.dataset.dcHint)) ? Math.floor(Number(triggerNode.dataset.dcHint)) : null,
    difficulty:
      triggerNode.dataset.difficulty === "easy"
      || triggerNode.dataset.difficulty === "normal"
      || triggerNode.dataset.difficulty === "hard"
      || triggerNode.dataset.difficulty === "extreme"
        ? triggerNode.dataset.difficulty
        : "normal",
    loreType: normalizeInlineTextEvent(triggerNode.dataset.loreType),
    note: normalizeInlineTextEvent(triggerNode.dataset.note),
    diceExpr: normalizeInlineTextEvent(triggerNode.dataset.diceExpr) || "1d20",
    compare:
      triggerNode.dataset.compare === ">="
      || triggerNode.dataset.compare === ">"
      || triggerNode.dataset.compare === "<="
      || triggerNode.dataset.compare === "<"
        ? triggerNode.dataset.compare
        : ">=",
    revealMode: triggerNode.dataset.revealMode === "instant" ? "instant" : "delayed",
    triggerPackSourceId: normalizeInlineTextEvent(triggerNode.dataset.triggerPackSourceId),
    triggerPackSuccessText: normalizeInlineTextEvent(triggerNode.dataset.triggerPackSuccess),
    triggerPackFailureText: normalizeInlineTextEvent(triggerNode.dataset.triggerPackFailure),
    triggerPackExplodeText: normalizeInlineTextEvent(triggerNode.dataset.triggerPackExplode),
  };
}

export function getSelectionFallbackRemainingSummaryEvent(
  settings: DicePluginSettingsEvent,
  meta: DiceMetaEvent | null | undefined
): {
  roundRemaining: number;
  floorRemaining: number | null;
  limitMode: SelectionFallbackLimitModeEvent;
  minTextLength: number;
  maxTextLength: number;
  maxSentences: number;
} {
  const safeMeta = meta ?? {};
  const roundId = resolveSelectionFallbackRoundIdEvent(safeMeta as DiceMetaEvent);
  const state = syncSelectionFallbackStateWithRoundEvent(safeMeta as DiceMetaEvent, roundId);
  return {
    roundRemaining: Math.max(0, settings.selectionFallbackMaxPerRound - state.roundUsedCount),
    floorRemaining: null,
    limitMode: resolveSelectionFallbackLimitModeEvent(settings),
    minTextLength: Number(settings.selectionFallbackMinTextLength ?? 1),
    maxTextLength: Number(settings.selectionFallbackMaxTextLength ?? 10),
    maxSentences: Number(settings.selectionFallbackMaxSentences ?? 2),
  };
}

export function enhanceInteractiveTriggersInDomEvent(
  settings: DicePluginSettingsEvent,
  getLiveContextEvent?: () => { chat?: TavernMessageEvent[] | unknown } | null,
  getDiceMetaEvent?: () => DiceMetaEvent | null | undefined
): void {
  ensureTriggerStylesEvent();
  ensureSharedTooltip();
  document.querySelectorAll<HTMLElement>(".mes_text").forEach((node) => {
    try {
      const message = resolveMessageRecordEvent(node, getLiveContextEvent);
      enhanceMessageNodeEvent(node, message, getDiceMetaEvent?.());
    } catch (error) {
      logger.warn("交互高亮增强失败", error);
    }
  });
}

export function bindInteractiveTriggerDomEventsEvent(
  deps: ExecuteInteractiveTriggerDepsEvent
): void {
  const globalRef = globalThis as typeof globalThis & {
    __stRollInteractiveTriggerBoundEvent?: boolean;
    __stRollInteractiveTriggerObserverEvent?: MutationObserver | null;
    __stRollInteractiveTriggerRefreshQueuedEvent?: boolean;
  };
  ensureTriggerStylesEvent();
  ensureSharedTooltip();
  if (!globalRef.__stRollInteractiveTriggerObserverEvent) {
    globalRef.__stRollInteractiveTriggerObserverEvent = new MutationObserver(() => {
      const settings = deps.getSettingsEvent();
      if (!settings.enableInteractiveTriggers) return;
      if (globalRef.__stRollInteractiveTriggerRefreshQueuedEvent) return;
      globalRef.__stRollInteractiveTriggerRefreshQueuedEvent = true;
      requestAnimationFrame(() => {
        globalRef.__stRollInteractiveTriggerRefreshQueuedEvent = false;
        enhanceInteractiveTriggersInDomEvent(settings, deps.getLiveContextEvent, deps.getDiceMetaEvent);
      });
    });
    globalRef.__stRollInteractiveTriggerObserverEvent.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  if (globalRef.__stRollInteractiveTriggerBoundEvent) return;

  document.addEventListener(
    "click",
    (event) => {
      const settings = deps.getSettingsEvent();
      if (!settings.enableInteractiveTriggers) return;
      const target = event.target as HTMLElement | null;
      const triggerNode = target?.closest(".st-rh-inline-trigger") as HTMLElement | null;
      if (!triggerNode) return;
      event.preventDefault();
      event.stopPropagation();
      const trigger = buildTriggerFromNodeEvent(triggerNode);
      document.querySelectorAll(".st-rh-inline-trigger.is-active").forEach((node) => node.classList.remove("is-active"));
      triggerNode.classList.add("is-active");
      const rect = triggerNode.getBoundingClientRect();
      if (triggerNode.dataset.resolved === "1") {
        showResolvedTriggerMenuAtEvent(rect.left + rect.width / 2, rect.bottom + 8, trigger, triggerNode);
        return;
      }
      showTriggerMenuAtEvent(rect.left + rect.width / 2, rect.bottom + 8, trigger, deps);
    },
    true
  );

  document.addEventListener(
    "mouseup",
    () => {
      const settings = deps.getSettingsEvent();
      if (!settings.enableInteractiveTriggers) return;
      const selection = window.getSelection();
      const selectedTriggerNode = resolveSelectionTriggerNodeEvent(selection);
      if (selectedTriggerNode) {
        const trigger = buildTriggerFromNodeEvent(selectedTriggerNode);
        const rect = selectedTriggerNode.getBoundingClientRect();
        if (selectedTriggerNode.dataset.resolved === "1") {
          showResolvedTriggerMenuAtEvent(rect.left + rect.width / 2, rect.bottom + 8, trigger, selectedTriggerNode);
          return;
        }
        showTriggerMenuAtEvent(rect.left + rect.width / 2, rect.bottom + 8, trigger, deps);
        return;
      }
      if (!settings.enableSelectionFallbackTriggers) return;
      const rangeCheck = isSelectionFallbackRangeAllowedEvent(selection);
      if (!rangeCheck.scopeNode) return;
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      const message = resolveMessageRecordEvent(rangeCheck.scopeNode, deps.getLiveContextEvent);
      const sourceMessageId = buildSelectionFallbackSourceMessageIdEvent(rangeCheck.scopeNode, message);
      const sourceFloorKey = buildSelectionFallbackFloorKeyEvent(rangeCheck.scopeNode, message);
      const rawText = String(selection?.toString() ?? "");
      const text = normalizeInlineTextEvent(rawText);
      const meta = deps.getDiceMetaEvent?.() ?? {
        pendingRound: undefined,
      } as DiceMetaEvent;
      const roundId = resolveSelectionFallbackRoundIdEvent(meta);
      const selectionKey = buildSelectionFallbackKeyEvent(sourceFloorKey, text);
      const textCheck = isSelectionFallbackTextAllowedEvent(rawText, settings);
      const canUseResult = canUseSelectionFallbackEvent({
        meta,
        settings,
        roundId,
        floorKey: sourceFloorKey,
        selectionKey,
      });
      const readonlyReasons = [
        rangeCheck.ok ? "" : rangeCheck.reason || "",
        textCheck.ok ? "" : textCheck.reason || "",
        canUseResult.ok ? "" : canUseResult.reason || "",
      ].filter(Boolean);
      if (settings.enableSelectionFallbackDebugInfo) {
        logger.info("[交互触发] 自由划词状态", {
          text,
          selectionKey,
          sourceFloorKey,
          sourceMessageId,
          roundId,
          rangeAllowed: rangeCheck.ok,
          textAllowed: textCheck.ok,
          canUse: canUseResult.ok,
          readonlyReasons,
        });
      }
      if (!text && readonlyReasons.length <= 0) return;
      showSelectionMenuEvent({
        selectionText: text,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
        deps,
        sourceMessageId,
        sourceFloorKey,
        selectionKey,
        meta,
        canUseResult: {
          ...canUseResult,
          ok: rangeCheck.ok && textCheck.ok && canUseResult.ok,
        },
        readonlyReasons,
      });
    },
    true
  );

  globalRef.__stRollInteractiveTriggerBoundEvent = true;
}
