import { showSharedContextMenu } from "../../../_Components/sharedContextMenu";
import { ensureSharedTooltip } from "../../../_Components/sharedTooltip";
import { logger } from "../../index";
import type {
  DiceMetaEvent,
  DicePluginSettingsEvent,
  InteractiveTriggerEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import {
  buildInteractiveTriggerTooltipHtmlEvent,
  getMessageInteractiveTriggersEvent,
  stripInteractiveTriggerMarkupFromTextEvent,
} from "./interactiveTriggerMetadataEvent";

const TRIGGER_STYLE_ID_Event = "st-rh-inline-trigger-style";
const TRIGGER_SIGNATURE_ATTR_Event = "data-rh-trigger-signature";

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

function buildTriggerMarkupEvent(payload: InteractiveTriggerEvent, resolved = false): string {
  const tooltip = buildInteractiveTriggerTooltipHtmlEvent(payload);
  const hoverEnabled = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
    : false;
  return `<span class="st-rh-inline-trigger" data-rh-trigger="1" data-trigger-id="${escapeHtmlEvent(
    payload.triggerId
  )}" data-label="${escapeHtmlEvent(payload.label)}" data-action="${escapeHtmlEvent(
    payload.action
  )}" data-skill="${escapeHtmlEvent(payload.skill)}" data-blind="${payload.blind ? "1" : "0"}" data-source-id="${escapeHtmlEvent(
    payload.sourceId
  )}" data-source-message-id="${escapeHtmlEvent(payload.sourceMessageId)}" data-note="${escapeHtmlEvent(
    payload.note || ""
  )}" data-lore-type="${escapeHtmlEvent(payload.loreType || "")}" data-dc-hint="${Number.isFinite(
    Number(payload.dcHint)
  )
    ? String(Math.floor(Number(payload.dcHint)))
    : ""}" data-dice-expr="${escapeHtmlEvent(payload.diceExpr || "")}" data-occurrence-index="${Number.isFinite(
    Number(payload.occurrenceIndex)
  )
    ? String(Math.max(0, Math.floor(Number(payload.occurrenceIndex))))
    : "0"}" data-resolved="${resolved ? "1" : "0"}"${hoverEnabled ? ` data-tip="${escapeHtmlAttributeEvent(tooltip)}" data-tip-html="true"` : ""}> <i class="fa-solid fa-dice-d20 st-rh-inline-trigger-icon" aria-hidden="true"></i>${escapeHtmlEvent(payload.label)}</span>`;
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

function sanitizeLegacyTriggerTextNodesEvent(node: HTMLElement): boolean {
  const stripLooseTriggerTokensEvent = (input: string): string => String(input ?? "")
    .replace(/\[{1,2}rh-trigger[^\]]*\]{1,2}/gi, "")
    .replace(/\[{1,2}\/rh-trigger\]{1,2}/gi, "");

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.parentElement && !current.parentElement.closest(".st-rh-inline-trigger")) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }

  if (textNodes.length <= 0) return false;
  const rawJoined = textNodes.map((textNode) => textNode.nodeValue ?? "").join("");
  if (!rawJoined.includes("rh-trigger")) return false;

  const cleanedJoined = stripLooseTriggerTokensEvent(stripInteractiveTriggerMarkupFromTextEvent(rawJoined));
  if (cleanedJoined === rawJoined) return false;

  let offset = 0;
  for (let index = 0; index < textNodes.length; index += 1) {
    const textNode = textNodes[index];
    const originalLength = (textNode.nodeValue ?? "").length;
    if (index === textNodes.length - 1) {
      textNode.nodeValue = cleanedJoined.slice(offset);
      continue;
    }
    textNode.nodeValue = cleanedJoined.slice(offset, offset + originalLength);
    offset += originalLength;
  }
  return true;
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

function createTriggerNodeEvent(trigger: InteractiveTriggerEvent, resolved = false): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = buildTriggerMarkupEvent(trigger, resolved);
  return template.content.firstElementChild as HTMLElement;
}

function buildTriggerSignatureEvent(text: string, triggers: InteractiveTriggerEvent[]): string {
  return JSON.stringify({
    text,
    triggers: triggers.map((trigger) => ({
      triggerId: normalizeInlineTextEvent(trigger.triggerId),
      label: normalizeInlineTextEvent(trigger.label),
      action: normalizeInlineTextEvent(trigger.action),
      skill: normalizeInlineTextEvent(trigger.skill),
      blind: Boolean(trigger.blind),
      sourceId: normalizeInlineTextEvent(trigger.sourceId),
      sourceMessageId: normalizeInlineTextEvent(trigger.sourceMessageId),
      occurrenceIndex: Number.isFinite(Number(trigger.occurrenceIndex)) ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex))) : 0,
    })),
  });
}

function isTriggerResolvedEvent(
  trigger: InteractiveTriggerEvent,
  meta: DiceMetaEvent | null | undefined
): boolean {
  const round = meta?.pendingRound;
  if (!round) return false;
  return round.rolls.some((record) => {
    const event = round.events.find((item) => item.id === record?.eventId);
    if (!event) return false;
    return String(event.sourceAssistantMsgId || "").trim() === String(trigger.sourceMessageId || "").trim()
      && String(event.targetName || "").trim() === String(trigger.sourceId || trigger.label || "").trim()
      && String(event.skill || "").trim() === String(trigger.skill || "").trim();
  });
}

function enhanceMessageNodeEvent(
  node: HTMLElement,
  message: TavernMessageEvent | null,
  meta: DiceMetaEvent | null | undefined
): boolean {
  const triggers = getMessageInteractiveTriggersEvent(message).filter((trigger) => normalizeInlineTextEvent(trigger.label));
  let changed = false;
  if (normalizeTextEvent(node.textContent).includes("rh-trigger")) {
    changed = sanitizeLegacyTriggerTextNodesEvent(node) || changed;
  }
  const currentText = normalizeTextEvent(node.textContent);
  const nextSignature = buildTriggerSignatureEvent(currentText, triggers);
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
      fragment.appendChild(createTriggerNodeEvent(range.trigger, isTriggerResolvedEvent(range.trigger, meta)));
      cursor = localEnd;
    }
    if (cursor < raw.length) {
      fragment.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    entry.node.replaceWith(fragment);
    changed = true;
  }

  node.setAttribute(TRIGGER_SIGNATURE_ATTR_Event, buildTriggerSignatureEvent(normalizeTextEvent(node.textContent), triggers));
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
  buildBlindResultMessage: (title: string) => string;
  buildResultMessage: (result: any) => string;
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
  }>;
}

export async function executeInteractiveTriggerEvent(
  trigger: InteractiveTriggerEvent,
  deps: ExecuteInteractiveTriggerDepsEvent
): Promise<void> {
  try {
    await deps.performInteractiveTriggerRollEvent(trigger);
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
  const label = normalizeInlineTextEvent(trigger.action || trigger.skill || "检定");
  const suffix = trigger.blind ? "（暗骰）" : "";
  return [
    {
      id: `${trigger.triggerId}:primary`,
      label: `${label}${suffix}`,
      iconClassName: trigger.blind ? "fa-solid fa-eye-slash" : "fa-solid fa-dice-d20",
      onSelect: () => executeInteractiveTriggerEvent(trigger, deps),
    },
  ];
}

function buildSelectionFallbackTriggersEvent(
  text: string,
  deps: ExecuteInteractiveTriggerDepsEvent
): InteractiveTriggerEvent[] {
  const settings = deps.getSettingsEvent();
  const defaultBlindSkills = parseDefaultBlindSkillsEvent(settings);
  const label = normalizeInlineTextEvent(text).slice(0, 48);
  const base = {
    triggerId: `selection:${Date.now()}`,
    label,
    sourceMessageId: "",
    sourceId: `selection:${label}`,
    textRange: null,
    dcHint: null,
    loreType: "",
    note: "来自玩家划词触发",
    diceExpr: "1d20",
  };
  const skills = ["调查", "历史", "洞察"];
  return skills.map((skill, index) => ({
    ...base,
    triggerId: `${base.triggerId}:${index}`,
    action: skill === "历史" ? "回忆" : skill,
    skill,
    blind: defaultBlindSkills.has(skill.toLowerCase()),
  }));
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

function showSelectionMenuEvent(
  selectionText: string,
  x: number,
  y: number,
  deps: ExecuteInteractiveTriggerDepsEvent
): void {
  const triggers = buildSelectionFallbackTriggersEvent(selectionText, deps);
  showSharedContextMenu({
    x,
    y,
    items: triggers.map((trigger) => ({
      id: trigger.triggerId,
      label: `${normalizeInlineTextEvent(trigger.action)}${trigger.blind ? "（暗骰）" : ""}`,
      iconClassName: trigger.blind ? "fa-solid fa-eye-slash" : "fa-solid fa-dice-d20",
      onSelect: () => executeInteractiveTriggerEvent(trigger, deps),
    })),
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
    sourceId: normalizeInlineTextEvent(triggerNode.dataset.sourceId),
    occurrenceIndex: Number.isFinite(Number(triggerNode.dataset.occurrenceIndex))
      ? Math.max(0, Math.floor(Number(triggerNode.dataset.occurrenceIndex)))
      : 0,
    textRange: null,
    dcHint: Number.isFinite(Number(triggerNode.dataset.dcHint)) ? Math.floor(Number(triggerNode.dataset.dcHint)) : null,
    loreType: normalizeInlineTextEvent(triggerNode.dataset.loreType),
    note: normalizeInlineTextEvent(triggerNode.dataset.note),
    diceExpr: normalizeInlineTextEvent(triggerNode.dataset.diceExpr) || "1d20",
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
      if (triggerNode.dataset.resolved === "1") return;
      event.preventDefault();
      event.stopPropagation();
      const trigger = buildTriggerFromNodeEvent(triggerNode);
      document.querySelectorAll(".st-rh-inline-trigger.is-active").forEach((node) => node.classList.remove("is-active"));
      triggerNode.classList.add("is-active");
      const rect = triggerNode.getBoundingClientRect();
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
        if (selectedTriggerNode.dataset.resolved === "1") return;
        const trigger = buildTriggerFromNodeEvent(selectedTriggerNode);
        const rect = selectedTriggerNode.getBoundingClientRect();
        showTriggerMenuAtEvent(rect.left + rect.width / 2, rect.bottom + 8, trigger, deps);
        return;
      }
      const text = normalizeInlineTextEvent(selection?.toString() || "");
      if (!text || text.length < 2 || text.length > 24) return;
      const anchorNode = selection?.anchorNode;
      if (!anchorNode || !(anchorNode.parentElement?.closest(".mes_text"))) return;
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      showSelectionMenuEvent(text, rect.left + rect.width / 2, rect.bottom + 8, deps);
    },
    true
  );

  globalRef.__stRollInteractiveTriggerBoundEvent = true;
}
