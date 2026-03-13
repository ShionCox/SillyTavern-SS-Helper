import { logger } from "../../index";

const CONSOLE_PANEL_ID_Event = "st-rh-roll-console";
const CONSOLE_BODY_ID_Event = "st-rh-roll-console-body";
const CONSOLE_STYLE_ID_Event = "st-rh-roll-console-style";
const CONSOLE_MAX_ENTRIES_Event = 50;

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
    }
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

  // 关闭按钮
  panel.querySelector("[data-rh-console-close]")?.addEventListener("click", () => {
    hideConsoleEvent();
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
