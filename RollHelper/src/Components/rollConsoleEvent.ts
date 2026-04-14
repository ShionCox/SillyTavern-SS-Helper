import { logger } from "../../index";
import { bindSharedFloatingPanelDragEvent } from "../../../_Components/sharedFloatingPanel";

const CONSOLE_PANEL_ID_Event = "st-rh-roll-console";
const CONSOLE_BODY_ID_Event = "st-rh-roll-console-body";
const CONSOLE_STYLE_ID_Event = "st-rh-roll-console-style";
const CONSOLE_MAX_ENTRIES_Event = 50;
const CONSOLE_JUMP_HIGHLIGHT_CLASS_Event = "st-rh-jump-focus";
const CONSOLE_JUMP_HIGHLIGHT_MESSAGE_CLASS_Event = "st-rh-jump-focus-message";

let CONSOLE_VISIBLE_Event = false;

function ensureConsoleStylesEvent(): void {
  if (document.getElementById(CONSOLE_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = CONSOLE_STYLE_ID_Event;
  style.textContent = `
    #${CONSOLE_PANEL_ID_Event} {
      position: fixed;
      bottom: 60px;
      right: 16px;
      width: clamp(340px, 28vw, 480px);
      max-height: 55vh;
      background: linear-gradient(180deg, rgba(24,20,17,0.97), rgba(12,10,8,0.99));
      border: 1px solid rgba(176,143,76,0.35);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04);
      display: flex;
      flex-direction: column;
      z-index: 10020;
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      color: #e8dcc6;
      overflow: hidden;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    #${CONSOLE_PANEL_ID_Event}.st-rh-console-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(12px);
    }
    .st-rh-console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-bottom: 1px solid rgba(176,143,76,0.2);
      background: rgba(30,25,20,0.6);
      user-select: none;
      flex-shrink: 0;
      cursor: grab;
      touch-action: none;
    }
    #${CONSOLE_PANEL_ID_Event}.st-rh-console-dragging .st-rh-console-header { cursor: grabbing; }
    .st-rh-console-title {
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.5px;
      color: #d1b67f;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .st-rh-console-close {
      background: none;
      border: none;
      color: rgba(236,219,183,0.55);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 120ms ease, background 120ms ease;
    }
    .st-rh-console-close:hover {
      color: #f3e6c3;
      background: rgba(176,143,76,0.15);
    }
    #${CONSOLE_BODY_ID_Event} {
      flex: 1;
      overflow-y: auto;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(176,143,76,0.25) transparent;
    }
    .st-rh-console-entry {
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid rgba(176,143,76,0.15);
      background: rgba(20,17,14,0.5);
      font-size: 12.5px;
      line-height: 1.55;
      word-break: break-word;
      animation: st-rh-console-fadein 200ms ease;
    }
    .st-rh-console-entry.st-rh-console-info {
      border-color: rgba(173,201,255,0.2);
      background: rgba(20,30,50,0.35);
    }
    .st-rh-console-entry.st-rh-console-warn {
      border-color: rgba(255,196,87,0.25);
      background: rgba(50,40,15,0.35);
    }
    .st-rh-console-entry.st-rh-console-error {
      border-color: rgba(255,120,120,0.25);
      background: rgba(50,20,20,0.35);
    }
    .st-rh-console-entry.st-rh-console-card {
      padding: 0;
      border: none;
      background: none;
    }
    .st-rh-console-card {
      border: 1px solid rgba(176,143,76,0.2);
      background: rgba(20,17,14,0.55);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
    }
    .st-rh-console-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-weight: 600;
      color: #f1e2c1;
      font-size: 12.5px;
    }
    .st-rh-console-card-meta {
      font-size: 12px;
      color: rgba(236,219,183,0.7);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .st-rh-console-card-desc {
      font-size: 12.5px;
      color: rgba(236,219,183,0.9);
      line-height: 1.45;
    }
    .st-rh-console-card-jump {
      border: 1px solid rgba(176,143,76,0.5);
      background: rgba(32,24,18,0.85);
      color: #f3d69c;
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 11.5px;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, color 120ms ease;
      flex-shrink: 0;
    }
    .st-rh-console-card-jump:hover {
      border-color: rgba(243,214,156,0.8);
      color: #fff1c6;
      transform: translateY(-1px);
    }
    .${CONSOLE_JUMP_HIGHLIGHT_CLASS_Event} {
      box-shadow: 0 0 0 2px rgba(255,214,130,0.6), 0 0 12px rgba(255,214,130,0.55);
      border-radius: 6px;
      background: rgba(255,214,130,0.12);
      transition: box-shadow 150ms ease;
    }
    .${CONSOLE_JUMP_HIGHLIGHT_MESSAGE_CLASS_Event} {
      outline: 2px solid rgba(255,214,130,0.55);
      outline-offset: 2px;
      border-radius: 6px;
      transition: outline 150ms ease;
    }
    .st-rh-console-empty {
      text-align: center;
      color: rgba(236,219,183,0.4);
      font-size: 12px;
      padding: 24px 0;
    }
    @keyframes st-rh-console-fadein {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

function ensureConsolePanelEvent(): HTMLElement {
  ensureConsoleStylesEvent();
  let panel = document.getElementById(CONSOLE_PANEL_ID_Event);
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = CONSOLE_PANEL_ID_Event;
  panel.classList.add("st-rh-console-hidden");
  panel.innerHTML = `
    <div class="st-rh-console-header">
      <span class="st-rh-console-title">
        <i class="fa-solid fa-dice-d20" aria-hidden="true"></i>
        Roll Console
      </span>
      <button class="st-rh-console-close" data-rh-console-close="1" aria-label="关闭">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
    <div id="${CONSOLE_BODY_ID_Event}">
      <div class="st-rh-console-empty">暂无输出</div>
    </div>
  `;
  document.body.appendChild(panel);
  const header = panel.querySelector(".st-rh-console-header") as HTMLElement | null;
  if (header) {
    header.dataset.stxFloatingBindKey = "roll-console";
    bindSharedFloatingPanelDragEvent({
      panel,
      handle: header,
      draggingClassName: "st-rh-console-dragging",
      minMargin: 8,
      allowPointerTargetEvent: (target) => !target.closest("[data-rh-console-close]"),
    });
  }

  // 关闭按钮
  panel.querySelector("[data-rh-console-close]")?.addEventListener("click", () => {
    hideConsoleEvent();
  });

  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const jumpButton = target.closest("[data-rh-jump=\"1\"]") as HTMLElement | null;
    if (!jumpButton) return;
    event.preventDefault();
    const ok = jumpToTriggerFromDatasetEvent(jumpButton);
    if (!ok) {
      appendToConsoleEvent("未能定位到对应触发点，可能已被改写或清理。", "warn");
    }
  });

  return panel;
}

function getConsoleBodyEvent(): HTMLElement | null {
  return document.getElementById(CONSOLE_BODY_ID_Event);
}

function trimConsoleEntriesEvent(): void {
  const body = getConsoleBodyEvent();
  if (!body) return;
  const entries = body.querySelectorAll(".st-rh-console-entry");
  while (entries.length > CONSOLE_MAX_ENTRIES_Event) {
    entries[0].remove();
  }
}

function removeEmptyPlaceholderEvent(): void {
  const body = getConsoleBodyEvent();
  if (!body) return;
  const placeholder = body.querySelector(".st-rh-console-empty");
  if (placeholder) placeholder.remove();
}

/**
 * 功能：向 Roll Console 追加一条条目。
 * @param html 条目 HTML 内容
 * @param level 条目级别
 */
export function appendToConsoleEvent(
  html: string,
  level: "info" | "warn" | "error" | "card" = "info"
): void {
  const panel = ensureConsolePanelEvent();
  const body = getConsoleBodyEvent();
  if (!body) return;

  removeEmptyPlaceholderEvent();

  const entry = document.createElement("div");
  entry.className = `st-rh-console-entry st-rh-console-${level}`;
  entry.innerHTML = html;
  body.appendChild(entry);

  trimConsoleEntriesEvent();
  body.scrollTop = body.scrollHeight;

  // 自动显示
  if (!CONSOLE_VISIBLE_Event) {
    showConsoleEvent();
  }
}

function escapeSelectorValueEvent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function resolveMessageElementByIdEvent(messageId: string): HTMLElement | null {
  if (!messageId) return null;
  const escaped = escapeSelectorValueEvent(messageId);
  const selectors = [
    `.mes[mesid="${escaped}"]`,
    `[data-message-id="${escaped}"]`,
    `[data-mesid="${escaped}"]`,
  ];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement) return node;
  }
  return null;
}

function resolveMessageElementByFloorKeyEvent(floorKey: string): HTMLElement | null {
  const raw = String(floorKey || "").trim();
  if (!raw) return null;
  if (raw.startsWith("floor:")) {
    return resolveMessageElementByIdEvent(raw.slice("floor:".length));
  }
  if (raw.startsWith("floor_msg:")) {
    return resolveMessageElementByIdEvent(raw.slice("floor_msg:".length));
  }
  return null;
}

function applyTemporaryHighlightEvent(node: HTMLElement, className: string, duration = 1500): void {
  node.classList.add(className);
  window.setTimeout(() => {
    node.classList.remove(className);
  }, duration);
}

function applyTemporaryTriggerFocusEvent(node: HTMLElement, duration = 1500): void {
  document.querySelectorAll(".st-rh-inline-trigger.is-active").forEach((item) => {
    if (item instanceof HTMLElement && item !== node) {
      item.classList.remove("is-active");
    }
  });
  node.classList.add("is-active");
  applyTemporaryHighlightEvent(node, CONSOLE_JUMP_HIGHLIGHT_CLASS_Event, duration);
  window.setTimeout(() => {
    if (node.isConnected) {
      node.classList.remove("is-active");
    }
  }, duration);
}

function resolveTriggerNodeEvent(
  messageNode: HTMLElement,
  sourceId: string,
  occurrenceIndex: number | null
): HTMLElement | null {
  const triggers = Array.from(messageNode.querySelectorAll<HTMLElement>(".st-rh-inline-trigger"));
  if (!triggers.length) return null;
  const targetSourceId = String(sourceId || "").trim();
  const targetOccurrence = Number.isFinite(Number(occurrenceIndex)) ? Math.max(0, Math.floor(Number(occurrenceIndex))) : null;
  if (targetSourceId) {
    const matched = triggers.filter((node) => String(node.dataset.sourceId || "").trim() === targetSourceId);
    if (matched.length > 0) {
      if (targetOccurrence != null) {
        const exact = matched.find(
          (node) => Math.max(0, Math.floor(Number(node.dataset.occurrenceIndex || 0))) === targetOccurrence
        );
        if (exact) return exact;
      }
      return matched[0];
    }
    return null;
  }
  return triggers[0];
}

export function jumpToTriggerFromDatasetEvent(node: HTMLElement): boolean {
  const dataset = node.dataset || {};
  const sourceMessageId = String(dataset.rhJumpSourceMessage || "");
  const sourceFloorKey = String(dataset.rhJumpFloorKey || "");
  const sourceId = String(dataset.rhJumpSourceId || "");
  const occurrenceIndex = Number.isFinite(Number(dataset.rhJumpOccurrence))
    ? Math.max(0, Math.floor(Number(dataset.rhJumpOccurrence)))
    : null;

  const messageNode =
    resolveMessageElementByIdEvent(sourceMessageId) || resolveMessageElementByFloorKeyEvent(sourceFloorKey);
  if (!messageNode) return false;

  const triggerNode = resolveTriggerNodeEvent(messageNode, sourceId, occurrenceIndex);
  if (triggerNode) {
    triggerNode.scrollIntoView({ block: "center", behavior: "smooth" });
    applyTemporaryTriggerFocusEvent(triggerNode, 1500);
    return true;
  }

  messageNode.scrollIntoView({ block: "center", behavior: "smooth" });
  applyTemporaryHighlightEvent(messageNode, CONSOLE_JUMP_HIGHLIGHT_MESSAGE_CLASS_Event, 1500);
  return true;
}

/**
 * 功能：显示 Roll Console 面板。
 */
export function showConsoleEvent(): void {
  const panel = ensureConsolePanelEvent();
  panel.classList.remove("st-rh-console-hidden");
  CONSOLE_VISIBLE_Event = true;
}

/**
 * 功能：隐藏 Roll Console 面板。
 */
export function hideConsoleEvent(): void {
  const panel = document.getElementById(CONSOLE_PANEL_ID_Event);
  if (panel) {
    panel.classList.add("st-rh-console-hidden");
  }
  CONSOLE_VISIBLE_Event = false;
}

/**
 * 功能：切换 Roll Console 面板的显示/隐藏。
 */
export function toggleConsoleEvent(): void {
  if (CONSOLE_VISIBLE_Event) {
    hideConsoleEvent();
  } else {
    showConsoleEvent();
  }
}

/**
 * 功能：清空 Roll Console 全部条目。
 */
export function clearConsoleEvent(): void {
  const body = getConsoleBodyEvent();
  if (!body) return;
  body.innerHTML = `<div class="st-rh-console-empty">暂无输出</div>`;
}

/**
 * 功能：获取当前 Console 是否可见。
 */
export function isConsoleVisibleEvent(): boolean {
  return CONSOLE_VISIBLE_Event;
}
