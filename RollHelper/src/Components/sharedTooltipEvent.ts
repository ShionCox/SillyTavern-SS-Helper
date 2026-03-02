const SHARED_TOOLTIP_STYLE_ID_Event = "st-roll-shared-tooltip-style";
const SHARED_TOOLTIP_ID_Event = "st-roll-shared-tooltip";
const SHARED_TOOLTIP_INSTANT_DISTANCE_PX_Event = 260;
const SHARED_TOOLTIP_HIDE_DELAY_MS_Event = 90;

interface SharedTooltipRuntimeEvent {
  root: HTMLDivElement;
  body: HTMLDivElement;
}

let SHARED_TOOLTIP_RUNTIME_Event: SharedTooltipRuntimeEvent | null = null;
let SHARED_TOOLTIP_ACTIVE_TARGET_Event: HTMLElement | null = null;
let SHARED_TOOLTIP_LAST_TARGET_CENTER_X_Event: number | null = null;
let SHARED_TOOLTIP_LAST_TARGET_CENTER_Y_Event: number | null = null;
let SHARED_TOOLTIP_HIDE_TIMER_Event: number | null = null;

function clampTooltipEvent(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveTooltipTargetEvent(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  const target = node.closest<HTMLElement>("[data-tip]");
  if (target) {
    const tip = String(target.dataset.tip ?? "").trim();
    if (tip) return target;
  }

  const titleTarget = node.closest<HTMLElement>("[title]");
  if (!titleTarget) return null;
  const inEventCardScope = !!titleTarget.closest(".st-rh-card-scope");
  if (!inEventCardScope) return null;
  const title = String(titleTarget.getAttribute("title") ?? "").trim();
  if (!title) return null;
  titleTarget.dataset.tip = title;
  titleTarget.removeAttribute("title");
  if (!titleTarget.classList.contains("st-rh-tip")) {
    titleTarget.classList.add("st-rh-tip");
  }
  return titleTarget;
}

function ensureSharedTooltipStyleEvent(): void {
  if (document.getElementById(SHARED_TOOLTIP_STYLE_ID_Event)) return;
  const style = document.createElement("style");
  style.id = SHARED_TOOLTIP_STYLE_ID_Event;
  style.textContent = `
    #${SHARED_TOOLTIP_ID_Event} {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 40000;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition:
        opacity 0.16s ease,
        transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
        visibility 0s linear 0.16s;
      transform: translate3d(-9999px, -9999px, 0);
      will-change: transform, opacity;
    }
    #${SHARED_TOOLTIP_ID_Event}.is-visible {
      opacity: 1;
      visibility: visible;
      transition:
        opacity 0.16s ease,
        transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
        visibility 0s;
    }
    #${SHARED_TOOLTIP_ID_Event}.is-instant {
      transition: none !important;
    }
    #${SHARED_TOOLTIP_ID_Event} .st-rh-global-tooltip-body {
      max-width: min(78vw, 320px);
      min-width: 72px;
      padding: 8px 10px;
      border: 1px solid rgba(197, 160, 89, 0.55);
      border-radius: 8px;
      background: rgba(12, 8, 6, 0.96);
      color: #ecdcb8;
      font-size: 12px;
      line-height: 1.5;
      text-align: center;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
      white-space: normal;
    }
    html body .st-rh-tip::before,
    html body .st-rh-tip::after,
    html body .st-rh-ss-tip::before,
    html body .st-rh-ss-tip::after,
    html body [data-tip]::before,
    html body [data-tip]::after,
    html body [data-tip]:hover::before,
    html body [data-tip]:hover::after,
    html body [data-tip]:focus::before,
    html body [data-tip]:focus::after,
    html body [data-tip]:focus-visible::before,
    html body [data-tip]:focus-visible::after {
      content: none !important;
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      #${SHARED_TOOLTIP_ID_Event} {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureSharedTooltipRuntimeEvent(): SharedTooltipRuntimeEvent {
  if (SHARED_TOOLTIP_RUNTIME_Event) return SHARED_TOOLTIP_RUNTIME_Event;
  ensureSharedTooltipStyleEvent();
  const existed = document.getElementById(SHARED_TOOLTIP_ID_Event) as HTMLDivElement | null;
  if (existed) {
    const bodyNode = existed.querySelector<HTMLDivElement>(".st-rh-global-tooltip-body");
    if (bodyNode) {
      SHARED_TOOLTIP_RUNTIME_Event = { root: existed, body: bodyNode };
      return SHARED_TOOLTIP_RUNTIME_Event;
    }
    existed.remove();
  }

  const root = document.createElement("div");
  root.id = SHARED_TOOLTIP_ID_Event;
  const body = document.createElement("div");
  body.className = "st-rh-global-tooltip-body";
  root.appendChild(body);
  document.body.appendChild(root);
  SHARED_TOOLTIP_RUNTIME_Event = { root, body };
  return SHARED_TOOLTIP_RUNTIME_Event;
}

function hideSharedTooltipEvent(): void {
  if (SHARED_TOOLTIP_HIDE_TIMER_Event !== null) {
    clearTimeout(SHARED_TOOLTIP_HIDE_TIMER_Event);
    SHARED_TOOLTIP_HIDE_TIMER_Event = null;
  }
  const runtime = ensureSharedTooltipRuntimeEvent();
  runtime.root.classList.remove("is-visible");
  SHARED_TOOLTIP_ACTIVE_TARGET_Event = null;
}

function scheduleHideSharedTooltipEvent(): void {
  if (SHARED_TOOLTIP_HIDE_TIMER_Event !== null) {
    clearTimeout(SHARED_TOOLTIP_HIDE_TIMER_Event);
    SHARED_TOOLTIP_HIDE_TIMER_Event = null;
  }
  SHARED_TOOLTIP_HIDE_TIMER_Event = window.setTimeout(() => {
    SHARED_TOOLTIP_HIDE_TIMER_Event = null;
    hideSharedTooltipEvent();
  }, SHARED_TOOLTIP_HIDE_DELAY_MS_Event);
}

function positionSharedTooltipEvent(): void {
  if (!SHARED_TOOLTIP_ACTIVE_TARGET_Event) return;
  const runtime = ensureSharedTooltipRuntimeEvent();
  const targetRect = SHARED_TOOLTIP_ACTIVE_TARGET_Event.getBoundingClientRect();

  const anchorX = targetRect.left + targetRect.width / 2;
  const anchorY = targetRect.top - 8;

  runtime.root.classList.add("is-visible");
  const width = Math.max(80, runtime.root.offsetWidth);
  const height = Math.max(32, runtime.root.offsetHeight);
  const margin = 8;
  const x = clampTooltipEvent(anchorX - width / 2, margin, window.innerWidth - width - margin);

  let y = anchorY - height;
  let placeBelow = false;
  if (y < margin) {
    placeBelow = true;
    y = clampTooltipEvent(targetRect.bottom + 10, margin, window.innerHeight - height - margin);
  }

  runtime.root.classList.toggle("is-below", placeBelow);
  runtime.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function showSharedTooltipEvent(target: HTMLElement): void {
  const tip = String(target.dataset.tip ?? "").trim();
  if (!tip) {
    hideSharedTooltipEvent();
    return;
  }
  if (SHARED_TOOLTIP_HIDE_TIMER_Event !== null) {
    clearTimeout(SHARED_TOOLTIP_HIDE_TIMER_Event);
    SHARED_TOOLTIP_HIDE_TIMER_Event = null;
  }
  const runtime = ensureSharedTooltipRuntimeEvent();
  const targetRect = target.getBoundingClientRect();
  const currentCenterX = targetRect.left + targetRect.width / 2;
  const currentCenterY = targetRect.top + targetRect.height / 2;
  const wasVisible = runtime.root.classList.contains("is-visible");
  const hasLastCenter =
    SHARED_TOOLTIP_LAST_TARGET_CENTER_X_Event !== null && SHARED_TOOLTIP_LAST_TARGET_CENTER_Y_Event !== null;
  const travelDistance = hasLastCenter
    ? Math.hypot(
        currentCenterX - (SHARED_TOOLTIP_LAST_TARGET_CENTER_X_Event as number),
        currentCenterY - (SHARED_TOOLTIP_LAST_TARGET_CENTER_Y_Event as number)
      )
    : 0;
  const shouldInstant = !wasVisible || travelDistance >= SHARED_TOOLTIP_INSTANT_DISTANCE_PX_Event;
  SHARED_TOOLTIP_ACTIVE_TARGET_Event = target;
  runtime.body.textContent = tip;
  if (shouldInstant) {
    runtime.root.classList.add("is-instant");
    positionSharedTooltipEvent();
    requestAnimationFrame(() => {
      runtime.root.classList.remove("is-instant");
    });
    SHARED_TOOLTIP_LAST_TARGET_CENTER_X_Event = currentCenterX;
    SHARED_TOOLTIP_LAST_TARGET_CENTER_Y_Event = currentCenterY;
    return;
  }
  positionSharedTooltipEvent();
  SHARED_TOOLTIP_LAST_TARGET_CENTER_X_Event = currentCenterX;
  SHARED_TOOLTIP_LAST_TARGET_CENTER_Y_Event = currentCenterY;
}

/**
 * 功能：初始化全局单例 tooltip，所有 data-tip 元素共用一个气泡实例。
 * 参数：无。
 * 返回：void。
 */
export function ensureSharedTooltipEvent(): void {
  const globalRef = globalThis as any;
  if (globalRef.__stRollSharedTooltipBoundEvent) return;
  ensureSharedTooltipRuntimeEvent();

  document.addEventListener(
    "pointerover",
    (event: Event) => {
      const target = resolveTooltipTargetEvent(event.target);
      if (!target) return;
      showSharedTooltipEvent(target);
    },
    true
  );

  document.addEventListener(
    "pointerout",
    (event: Event) => {
      const fromTarget = resolveTooltipTargetEvent(event.target);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTargetEvent((event as PointerEvent).relatedTarget ?? null);
      if (toTarget) return;
      if (SHARED_TOOLTIP_ACTIVE_TARGET_Event === fromTarget) {
        scheduleHideSharedTooltipEvent();
      }
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event: Event) => {
      const target = resolveTooltipTargetEvent(event.target);
      if (!target) return;
      showSharedTooltipEvent(target);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (event: Event) => {
      const fromTarget = resolveTooltipTargetEvent(event.target);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTargetEvent((event as FocusEvent).relatedTarget ?? null);
      if (toTarget) return;
      if (SHARED_TOOLTIP_ACTIVE_TARGET_Event === fromTarget) {
        scheduleHideSharedTooltipEvent();
      }
    },
    true
  );

  window.addEventListener("scroll", () => {
    if (SHARED_TOOLTIP_ACTIVE_TARGET_Event) {
      positionSharedTooltipEvent();
    }
  }, true);

  window.addEventListener("resize", () => {
    if (SHARED_TOOLTIP_ACTIVE_TARGET_Event) {
      positionSharedTooltipEvent();
    }
  });

  globalRef.__stRollSharedTooltipBoundEvent = true;
}
