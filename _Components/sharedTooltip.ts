import tooltipCssText from "./sharedTooltip.css?inline";
import { subscribeTheme, mountThemeHost } from "../SDK/theme";

const TOOLTIP_STYLE_ID = "stx-shared-tooltip-style";
const TOOLTIP_ID = "stx-shared-tooltip";
const TOOLTIP_RUNTIME_KEY = "__stxSharedTooltipState";
const TOOLTIP_RUNTIME_VERSION = 1;
const TOOLTIP_Z_INDEX = 2147483000;
const TOOLTIP_HIDE_DELAY_MS = 90;
const TOOLTIP_HIDE_TRANSITION_MS = 180;
const TOOLTIP_INSTANT_DISTANCE_PX = 420;

interface TooltipRuntime {
  root: HTMLDivElement;
  body: HTMLDivElement;
}

interface TooltipGlobalState {
  version: number;
  bound: boolean;
  runtime: TooltipRuntime | null;
  activeTarget: HTMLElement | null;
  lastCenterX: number | null;
  lastCenterY: number | null;
  hideTimer: number | null;
  hideCleanupTimer: number | null;
  positionFrame: number | null;
  themeRefreshFrame: number | null;
  unbindHandlers: Array<() => void>;
}

type TooltipGlobalRef = typeof globalThis & {
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function isOwnedNode(node: Element | null): boolean {
  return node?.hasAttribute("data-stx-shared-tooltip-runtime") === true;
}

function markNode(node: Element): void {
  node.setAttribute("data-stx-shared-tooltip-runtime", "");
}

function clearAsyncState(state: Partial<TooltipGlobalState> | undefined): void {
  if (!state) return;
  if (typeof state.hideTimer === "number") clearTimeout(state.hideTimer);
  if (typeof state.hideCleanupTimer === "number") clearTimeout(state.hideCleanupTimer);
  if (typeof state.positionFrame === "number") cancelAnimationFrame(state.positionFrame);
  if (typeof state.themeRefreshFrame === "number") cancelAnimationFrame(state.themeRefreshFrame);
  state.hideTimer = null;
  state.hideCleanupTimer = null;
  state.positionFrame = null;
  state.themeRefreshFrame = null;
  state.activeTarget = null;
}

// ---------------------------------------------------------------------------
// Runtime singleton
// ---------------------------------------------------------------------------

function disposeRuntime(state: TooltipGlobalState): void {
  state.unbindHandlers.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  state.unbindHandlers = [];
  clearAsyncState(state);
  if (state.runtime?.root?.isConnected) state.runtime.root.remove();
  state.runtime = null;
  state.bound = false;
}

function getGlobalState(): TooltipGlobalState {
  const g = globalThis as TooltipGlobalRef;
  const existing = g[TOOLTIP_RUNTIME_KEY] as TooltipGlobalState | undefined;
  if (existing) {
    if (existing.version !== TOOLTIP_RUNTIME_VERSION) {
      disposeRuntime(existing);
      delete g[TOOLTIP_RUNTIME_KEY];
    } else {
      return existing;
    }
  }
  const created: TooltipGlobalState = {
    version: TOOLTIP_RUNTIME_VERSION,
    bound: false,
    runtime: null,
    activeTarget: null,
    lastCenterX: null,
    lastCenterY: null,
    hideTimer: null,
    hideCleanupTimer: null,
    positionFrame: null,
    themeRefreshFrame: null,
    unbindHandlers: [],
  };
  g[TOOLTIP_RUNTIME_KEY] = created;
  return created;
}

// ---------------------------------------------------------------------------
// Style & DOM
// ---------------------------------------------------------------------------

function ensureStyle(): void {
  const existing = document.getElementById(TOOLTIP_STYLE_ID);
  if (existing) {
    if (existing.textContent !== tooltipCssText) existing.textContent = tooltipCssText;
    markNode(existing);
    return;
  }
  const style = document.createElement("style");
  style.id = TOOLTIP_STYLE_ID;
  style.textContent = tooltipCssText;
  markNode(style);
  document.head.appendChild(style);
}

function resolveHost(): HTMLElement {
  return document.body;
}

function ensureRuntime(state: TooltipGlobalState): TooltipRuntime {
  ensureStyle();
  const host = resolveHost();

  let root = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = TOOLTIP_ID;
    host.appendChild(root);
  } else if (root.parentElement !== host) {
    host.appendChild(root);
  }
  // 使用内联高层级兜底，避免被其他旧样式或后注入样式覆盖。
  root.style.setProperty("z-index", String(TOOLTIP_Z_INDEX), "important");
  markNode(root);

  let body = root.querySelector<HTMLDivElement>(".stx-shared-tooltip-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "stx-shared-tooltip-body";
    root.appendChild(body);
  }
  markNode(body);

  state.runtime = { root, body };
  return state.runtime;
}

// ---------------------------------------------------------------------------
// Anchor resolution (shared components)
// ---------------------------------------------------------------------------

function getSharedCheckboxRoot(node: HTMLElement): HTMLElement | null {
  return node.closest<HTMLElement>('[data-ui="shared-checkbox"]');
}

function getSharedSelectRoot(node: HTMLElement): HTMLElement | null {
  return node.closest<HTMLElement>('[data-ui="shared-select"]');
}

function getSharedInputRoot(node: HTMLElement): HTMLElement | null {
  if (node.matches('[data-ui="shared-input"]')) return node;
  return node.closest<HTMLElement>('[data-ui="shared-input"]');
}

function getSharedButtonRoot(node: HTMLElement): HTMLElement | null {
  if (node.matches('[data-ui="shared-button"]')) return node;
  return node.closest<HTMLElement>('[data-ui="shared-button"]');
}

function getTooltipAnchor(node: HTMLElement): HTMLElement {
  const checkbox = getSharedCheckboxRoot(node);
  if (checkbox) {
    return (
      checkbox.querySelector<HTMLElement>('[data-tooltip-anchor="shared-checkbox-control"]') ||
      checkbox
    );
  }
  const select = getSharedSelectRoot(node);
  if (select) {
    return (
      select.querySelector<HTMLElement>('[data-tooltip-anchor="shared-select-trigger"]') ||
      select.querySelector<HTMLElement>(".stx-shared-select-trigger") ||
      select
    );
  }
  const input = getSharedInputRoot(node);
  if (input) return input;

  const button = getSharedButtonRoot(node);
  if (button) return button;

  return node;
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

function resolveTarget(eventTarget: EventTarget | null): HTMLElement | null {
  const baseElement =
    eventTarget instanceof HTMLElement
      ? eventTarget
      : eventTarget instanceof Element
        ? eventTarget
        : eventTarget instanceof Node
          ? eventTarget.parentElement
          : null;
  if (!baseElement) return null;
  const dataTipNode = baseElement.closest<HTMLElement>("[data-tip]");
  if (!dataTipNode) return null;
  const tip = String(dataTipNode.dataset.tip ?? "").trim();
  if (!tip) return null;
  const anchor = getTooltipAnchor(dataTipNode);
  if (!String(anchor.dataset.tip ?? "").trim()) {
    anchor.dataset.tip = tip;
  }
  return anchor;
}

// ---------------------------------------------------------------------------
// Positioning & animation
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function positionTooltip(state: TooltipGlobalState): void {
  if (!state.activeTarget) return;
  const runtime = ensureRuntime(state);
  const anchor = getTooltipAnchor(state.activeTarget);
  const rect = anchor.getBoundingClientRect();
  const anchorX = rect.left + rect.width / 2;
  const anchorY = rect.top - 8;

  runtime.root.classList.add("is-visible");
  const width = Math.max(80, runtime.root.offsetWidth);
  const height = Math.max(32, runtime.root.offsetHeight);
  const margin = 8;
  const x = clamp(anchorX - width / 2, margin, window.innerWidth - width - margin);
  let y = anchorY - height;
  if (y < margin) {
    y = clamp(rect.bottom + 10, margin, window.innerHeight - height - margin);
  }
  runtime.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function schedulePosition(state: TooltipGlobalState): void {
  if (state.positionFrame !== null) return;
  state.positionFrame = requestAnimationFrame(() => {
    state.positionFrame = null;
    if (state.activeTarget) positionTooltip(state);
  });
}

function clearHideCleanup(state: TooltipGlobalState): void {
  if (state.hideCleanupTimer !== null) {
    clearTimeout(state.hideCleanupTimer);
    state.hideCleanupTimer = null;
  }
}

function releaseLayoutLock(runtime: TooltipRuntime): void {
  runtime.body.style.width = "";
  runtime.body.style.maxWidth = "";
}

function resolveTooltipScope(target: HTMLElement | null): string {
  if (!target) return "";
  if (target.closest(".st-rh-card-scope")) return "rollhelper-card";
  return "";
}

function scheduleHideCleanup(state: TooltipGlobalState): void {
  clearHideCleanup(state);
  const runtime = ensureRuntime(state);
  state.hideCleanupTimer = window.setTimeout(() => {
    state.hideCleanupTimer = null;
    if (state.activeTarget) return;
    runtime.root.removeAttribute("data-stx-tooltip-scope");
    releaseLayoutLock(runtime);
  }, TOOLTIP_HIDE_TRANSITION_MS);
}

function hideTooltip(state: TooltipGlobalState): void {
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  const runtime = ensureRuntime(state);
  const w = Math.ceil(runtime.body.getBoundingClientRect().width);
  if (w > 0) {
    runtime.body.style.width = `${w}px`;
    runtime.body.style.maxWidth = `${w}px`;
  }
  runtime.root.classList.remove("is-visible");
  state.activeTarget = null;
  if (state.positionFrame !== null) {
    cancelAnimationFrame(state.positionFrame);
    state.positionFrame = null;
  }
  scheduleHideCleanup(state);
}

function scheduleHide(state: TooltipGlobalState): void {
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  state.hideTimer = window.setTimeout(() => {
    state.hideTimer = null;
    hideTooltip(state);
  }, TOOLTIP_HIDE_DELAY_MS);
}

function scheduleThemeRefresh(state: TooltipGlobalState): void {
  if (state.themeRefreshFrame !== null) cancelAnimationFrame(state.themeRefreshFrame);
  state.themeRefreshFrame = requestAnimationFrame(() => {
    state.themeRefreshFrame = null;
    if (!state.runtime || !state.activeTarget?.isConnected) return;
    mountThemeHost(state.runtime.root);
    schedulePosition(state);
  });
}

function showTooltip(target: HTMLElement, state: TooltipGlobalState): void {
  const tip = String(target.dataset.tip ?? "").trim();
  if (!tip) { hideTooltip(state); return; }
  if (state.hideTimer !== null) { clearTimeout(state.hideTimer); state.hideTimer = null; }

  const runtime = ensureRuntime(state);
  clearHideCleanup(state);
  releaseLayoutLock(runtime);
  mountThemeHost(runtime.root);

  if (
    state.activeTarget === target &&
    runtime.body.textContent === tip &&
    runtime.root.classList.contains("is-visible")
  ) {
    schedulePosition(state);
    return;
  }

  const anchor = getTooltipAnchor(target);
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const wasVisible = runtime.root.classList.contains("is-visible");
  const hasLast = state.lastCenterX !== null && state.lastCenterY !== null;
  const dist = hasLast
    ? Math.hypot(cx - (state.lastCenterX as number), cy - (state.lastCenterY as number))
    : 0;
  const instant = !wasVisible || dist >= TOOLTIP_INSTANT_DISTANCE_PX;

  state.activeTarget = target;
  const scope = resolveTooltipScope(target);
  if (scope) {
    runtime.root.setAttribute("data-stx-tooltip-scope", scope);
  } else {
    runtime.root.removeAttribute("data-stx-tooltip-scope");
  }
  if (target.getAttribute("data-tip-html") === "true") {
    runtime.body.innerHTML = tip;
  } else {
    runtime.body.textContent = tip;
  }

  if (instant) {
    runtime.root.classList.add("is-instant");
    positionTooltip(state);
    requestAnimationFrame(() => runtime.root.classList.remove("is-instant"));
  } else {
    positionTooltip(state);
  }
  state.lastCenterX = cx;
  state.lastCenterY = cy;
}

// ---------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------

function bind(
  state: TooltipGlobalState,
  target: Window | Document,
  event: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  const opts = options ?? false;
  target.addEventListener(event, listener, opts);
  state.unbindHandlers.push(() => target.removeEventListener(event, listener, opts));
}

function bindRuntime(state: TooltipGlobalState): void {
  bind(state, window, "pointerover", (e: Event) => {
    const t = resolveTarget(e.target);
    if (t) showTooltip(t, state);
  }, true);

  bind(state, window, "pointerout", (e: Event) => {
    const from = resolveTarget(e.target);
    if (!from) return;
    const to = resolveTarget((e as PointerEvent).relatedTarget ?? null);
    if (to) return;
    if (state.activeTarget === from) scheduleHide(state);
  }, true);

  bind(state, window, "focusin", (e: Event) => {
    const t = resolveTarget(e.target);
    if (t) showTooltip(t, state);
  }, true);

  bind(state, window, "focusout", (e: Event) => {
    const from = resolveTarget(e.target);
    if (!from) return;
    const to = resolveTarget((e as FocusEvent).relatedTarget ?? null);
    if (to) return;
    if (state.activeTarget === from) scheduleHide(state);
  }, true);

  bind(state, window, "scroll", () => {
    if (state.activeTarget) schedulePosition(state);
  }, true);

  bind(state, window, "resize", () => {
    if (state.activeTarget) schedulePosition(state);
  });

  state.unbindHandlers.push(
    subscribeTheme(() => {
      if (state.runtime && state.activeTarget) scheduleThemeRefresh(state);
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function ensureSharedTooltip(): void {
  const state = getGlobalState();
  ensureRuntime(state);
  if (state.bound) return;
  bindRuntime(state);
  state.bound = true;
}
