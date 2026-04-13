import { showSharedContextMenu } from "../../../_Components/sharedContextMenu";
import { logger } from "../../index";
import { pushToChat } from "../core/chatEvent";
import type {
  DicePluginSettingsEvent,
  InteractiveTriggerEvent,
} from "../types/eventDomainEvent";

const TRIGGER_STYLE_ID_Event = "st-rh-inline-trigger-style";
const RH_TRIGGER_REGEX_Event = /\[\[rh-trigger([^\]]*)\]\]([\s\S]*?)\[\[\/rh-trigger\]\]/gi;

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

function parseBooleanTextEvent(value: string): boolean {
  const normalized = normalizeInlineTextEvent(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "blind";
}

function parseDefaultBlindSkillsEvent(settings: DicePluginSettingsEvent): Set<string> {
  return new Set(
    String(settings.defaultBlindSkillsText ?? "")
      .split(/[\n,|]+/)
      .map((item) => normalizeInlineTextEvent(item).toLowerCase())
      .filter(Boolean)
  );
}

function parseTriggerAttributesEvent(attrText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(String(attrText ?? "")))) {
    result[String(match[1] ?? "").trim().toLowerCase()] = String(match[2] ?? "");
  }
  return result;
}

function buildTriggerMarkupEvent(payload: InteractiveTriggerEvent): string {
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
    : ""}" data-dice-expr="${escapeHtmlEvent(payload.diceExpr || "")}">${escapeHtmlEvent(payload.label)}</span>`;
}

export function parseInteractiveTriggersFromTextEvent(
  text: string,
  settings: DicePluginSettingsEvent,
  sourceMessageId = ""
): { html: string; triggers: InteractiveTriggerEvent[] } {
  const blindSkills = parseDefaultBlindSkillsEvent(settings);
  const triggers: InteractiveTriggerEvent[] = [];
  const html = normalizeTextEvent(text).replace(RH_TRIGGER_REGEX_Event, (full, attrText, bodyText, offset) => {
    const attrs = parseTriggerAttributesEvent(String(attrText ?? ""));
    const label = normalizeInlineTextEvent(bodyText || attrs.label || "");
    if (!label) return label;
    const skill = normalizeInlineTextEvent(attrs.skill || attrs.action || "调查");
    const action = normalizeInlineTextEvent(attrs.action || skill || "调查");
    const trigger: InteractiveTriggerEvent = {
      triggerId: normalizeInlineTextEvent(attrs.triggerid) || `${sourceMessageId || "msg"}:${offset}`,
      label,
      action,
      skill,
      blind: attrs.blind ? parseBooleanTextEvent(attrs.blind) : blindSkills.has(skill.toLowerCase()),
      sourceMessageId,
      sourceId: normalizeInlineTextEvent(attrs.sourceid) || `${sourceMessageId || "msg"}:${offset}`,
      textRange: { start: Number(offset) || 0, end: Number(offset) + String(full ?? "").length },
      dcHint: Number.isFinite(Number(attrs.dchint)) ? Math.floor(Number(attrs.dchint)) : null,
      loreType: normalizeInlineTextEvent(attrs.loretype),
      note: normalizeInlineTextEvent(attrs.note),
      diceExpr: normalizeInlineTextEvent(attrs.diceexpr) || "1d20",
    };
    triggers.push(trigger);
    return buildTriggerMarkupEvent(trigger);
  });
  return { html, triggers };
}

function replaceTextNodeWithTriggersEvent(
  textNode: Text,
  settings: DicePluginSettingsEvent,
  sourceMessageId: string
): boolean {
  const raw = textNode.nodeValue ?? "";
  if (!raw.includes("[[rh-trigger")) return false;
  const parsed = parseInteractiveTriggersFromTextEvent(raw, settings, sourceMessageId);
  if (parsed.triggers.length <= 0) return false;
  const template = document.createElement("template");
  template.innerHTML = parsed.html;
  textNode.replaceWith(template.content);
  return true;
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

function enhanceMessageNodeEvent(node: HTMLElement, settings: DicePluginSettingsEvent): boolean {
  let changed = false;
  const sourceMessageId = resolveMessageContainerIdEvent(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.parentElement && !current.parentElement.closest(".st-rh-inline-trigger")) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }
  for (const textNode of textNodes) {
    changed = replaceTextNodeWithTriggersEvent(textNode, settings, sourceMessageId) || changed;
  }
  return changed;
}

function ensureTriggerStylesEvent(): void {
  if (document.getElementById(TRIGGER_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = TRIGGER_STYLE_ID_Event;
  style.textContent = `
    .st-rh-inline-trigger {
      display: inline;
      border-bottom: 1px dashed rgba(197, 160, 89, 0.68);
      box-shadow: inset 0 -0.08em 0 rgba(197, 160, 89, 0.14);
      color: inherit;
      cursor: pointer;
      transition: border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
    }
    .st-rh-inline-trigger:hover,
    .st-rh-inline-trigger.is-active {
      border-bottom-color: rgba(255, 220, 145, 0.96);
      box-shadow: inset 0 -0.15em 0 rgba(197, 160, 89, 0.22), 0 0 10px rgba(197, 160, 89, 0.18);
      color: #f4deb0;
    }
  `;
  document.head.appendChild(style);
}

export interface ExecuteInteractiveTriggerDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  buildBlindResultMessage: (title: string) => string;
  buildResultMessage: (result: any) => string;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error" | "card") => void;
  performInteractiveTriggerRollEvent: (trigger: InteractiveTriggerEvent) => Promise<{
    record: {
      result: any;
      diceExpr: string;
      skillModifierApplied: number;
      source: "manual_roll" | "blind_manual_roll";
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
  const settings = deps.getSettingsEvent();
  const resolved = await deps.performInteractiveTriggerRollEvent(trigger);
  const total = Number(resolved.record.result?.total || 0);
  const expr = normalizeInlineTextEvent(resolved.record.diceExpr) || "1d20";
  const skillModifier = Number(resolved.record.skillModifierApplied || 0);

  if (resolved.record.source === "blind_manual_roll") {
    deps.appendToConsoleEvent(
      deps.buildBlindResultMessage(`暗骰 ${normalizeInlineTextEvent(trigger.action || trigger.skill || expr)}`),
      "card"
    );
    pushToChat(`🎲 ${normalizeInlineTextEvent(trigger.action || trigger.skill || "检定")}：命运的齿轮转动中……结果已隐藏，仅命运知晓。`);
    if (settings.blindUiWarnInConsole) {
      deps.appendToConsoleEvent("查看暗骰真实结果会破坏跑团体验哦。", "warn");
    }
  } else {
    deps.appendToConsoleEvent(deps.buildResultMessage(resolved.record.result), "info");
    pushToChat(`🎲 ${normalizeInlineTextEvent(trigger.action || trigger.skill || "检定")}：${expr}${skillModifier ? ` ${skillModifier > 0 ? "+" : ""}${skillModifier}` : ""} = ${total}`);
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

export function enhanceInteractiveTriggersInDomEvent(settings: DicePluginSettingsEvent): void {
  ensureTriggerStylesEvent();
  document.querySelectorAll<HTMLElement>(".mes_text").forEach((node) => {
    try {
      enhanceMessageNodeEvent(node, settings);
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
  };
  ensureTriggerStylesEvent();
  if (!globalRef.__stRollInteractiveTriggerObserverEvent) {
    globalRef.__stRollInteractiveTriggerObserverEvent = new MutationObserver(() => {
      const settings = deps.getSettingsEvent();
      if (!settings.enableInteractiveTriggers) return;
      enhanceInteractiveTriggersInDomEvent(settings);
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
      const trigger: InteractiveTriggerEvent = {
        triggerId: normalizeInlineTextEvent(triggerNode.dataset.triggerId),
        label: normalizeInlineTextEvent(triggerNode.dataset.label),
        action: normalizeInlineTextEvent(triggerNode.dataset.action),
        skill: normalizeInlineTextEvent(triggerNode.dataset.skill),
        blind: triggerNode.dataset.blind === "1",
        sourceMessageId: normalizeInlineTextEvent(triggerNode.dataset.sourceMessageId),
        sourceId: normalizeInlineTextEvent(triggerNode.dataset.sourceId),
        textRange: null,
        dcHint: Number.isFinite(Number(triggerNode.dataset.dcHint)) ? Math.floor(Number(triggerNode.dataset.dcHint)) : null,
        loreType: normalizeInlineTextEvent(triggerNode.dataset.loreType),
        note: normalizeInlineTextEvent(triggerNode.dataset.note),
        diceExpr: normalizeInlineTextEvent(triggerNode.dataset.diceExpr) || "1d20",
      };
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
        const trigger: InteractiveTriggerEvent = {
          triggerId: normalizeInlineTextEvent(selectedTriggerNode.dataset.triggerId),
          label: normalizeInlineTextEvent(selectedTriggerNode.dataset.label),
          action: normalizeInlineTextEvent(selectedTriggerNode.dataset.action),
          skill: normalizeInlineTextEvent(selectedTriggerNode.dataset.skill),
          blind: selectedTriggerNode.dataset.blind === "1",
          sourceMessageId: normalizeInlineTextEvent(selectedTriggerNode.dataset.sourceMessageId),
          sourceId: normalizeInlineTextEvent(selectedTriggerNode.dataset.sourceId),
          textRange: null,
          dcHint: Number.isFinite(Number(selectedTriggerNode.dataset.dcHint))
            ? Math.floor(Number(selectedTriggerNode.dataset.dcHint))
            : null,
          loreType: normalizeInlineTextEvent(selectedTriggerNode.dataset.loreType),
          note: normalizeInlineTextEvent(selectedTriggerNode.dataset.note),
          diceExpr: normalizeInlineTextEvent(selectedTriggerNode.dataset.diceExpr) || "1d20",
        };
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
