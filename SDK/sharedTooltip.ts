import { resolveSdkThemeSnapshot } from "./theme";

const SHARED_TOOLTIP_STYLE_ID = "stx-shared-tooltip-style";
const SHARED_TOOLTIP_ID = "stx-shared-tooltip";
const SHARED_TOOLTIP_HIDE_DELAY_MS = 90;
const SHARED_TOOLTIP_HIDE_TRANSITION_MS = 180;
const SHARED_TOOLTIP_INSTANT_DISTANCE_PX = 260;
const TOOLTIP_EXCLUDE_SELECTOR = "button, .stx-ui-tab, .st-roll-tab";
const TOOLTIP_SOLID_BACKGROUND_FALLBACK = "rgba(12, 8, 6, 0.96)";

const DEFAULT_ROW_SELECTORS: string[] = [
  ".stx-ui-item",
  ".stx-ui-field",
  ".stx-ui-tab",
  ".stx-ui-list-item",
  ".st-roll-item",
  ".st-roll-tab",
  ".st-roll-textarea-wrap",
  ".st-roll-skill-row",
  ".st-roll-status-row",
];

interface SharedTooltipRuntime {
  root: HTMLDivElement;
  body: HTMLDivElement;
}

interface SharedTooltipThemeSnapshot {
  text: string;
  background: string;
  border: string;
  shadow: string;
}

interface SharedTooltipGlobalState {
  bound: boolean;
  runtime: SharedTooltipRuntime | null;
  activeTarget: HTMLElement | null;
  lastTargetCenterX: number | null;
  lastTargetCenterY: number | null;
  hideTimer: number | null;
  hideCleanupTimer: number | null;
}

export interface SettingsTooltipHydrateOptions {
  root: ParentNode;
  catalog?: Record<string, string>;
  rowSelectors?: string[];
}

export interface SettingsTooltipHydrateResult {
  assigned: number;
  missing: string[];
}

function getGlobalState(): SharedTooltipGlobalState {
  const globalRef = globalThis as any;
  const existed = globalRef.__stxSharedTooltipStateV1 as SharedTooltipGlobalState | undefined;
  if (existed) {
    return existed;
  }
  const created: SharedTooltipGlobalState = {
    bound: false,
    runtime: null,
    activeTarget: null,
    lastTargetCenterX: null,
    lastTargetCenterY: null,
    hideTimer: null,
    hideCleanupTimer: null,
  };
  globalRef.__stxSharedTooltipStateV1 = created;
  return created;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseTooltipAlphaToken(raw: string): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(percent)) return null;
    return Math.max(0, Math.min(1, percent / 100));
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function readTooltipColorAlpha(value: string): number | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "transparent") return 0;

  if ((normalized.startsWith("rgb(") || normalized.startsWith("hsl(") || normalized.startsWith("color(")) && normalized.includes("/")) {
    const slashIndex = normalized.lastIndexOf("/");
    const closeIndex = normalized.lastIndexOf(")");
    if (slashIndex >= 0 && closeIndex > slashIndex) {
      return parseTooltipAlphaToken(normalized.slice(slashIndex + 1, closeIndex).trim());
    }
  }

  if (normalized.startsWith("rgba(") || normalized.startsWith("hsla(")) {
    const openIndex = normalized.indexOf("(");
    const closeIndex = normalized.lastIndexOf(")");
    if (openIndex >= 0 && closeIndex > openIndex) {
      const inner = normalized.slice(openIndex + 1, closeIndex);
      const parts = inner.split(",").map((part) => part.trim());
      if (parts.length >= 4) {
        return parseTooltipAlphaToken(parts[3]);
      }
    }
  }

  return null;
}

function shouldUseSolidTooltipBackground(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("var(")) return true;
  if (normalized === "transparent") return true;
  if (normalized.includes("color-mix(") && normalized.includes("transparent")) return true;
  const alpha = readTooltipColorAlpha(normalized);
  if (alpha !== null && alpha < 0.9) return true;
  return false;
}

function resolveTooltipBaseBackground(background: string): string {
  if (shouldUseSolidTooltipBackground(background)) {
    return TOOLTIP_SOLID_BACKGROUND_FALLBACK;
  }
  return background;
}

function looksLikeTooltipBackgroundImage(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("gradient(") ||
    normalized.includes("url(") ||
    normalized.includes("image(")
  );
}

function resolveTooltipBackgroundColor(background: string): string {
  if (shouldUseSolidTooltipBackground(background)) {
    return TOOLTIP_SOLID_BACKGROUND_FALLBACK;
  }
  if (looksLikeTooltipBackgroundImage(background)) {
    return TOOLTIP_SOLID_BACKGROUND_FALLBACK;
  }
  return background;
}

function resolveTooltipBackgroundImage(background: string): string {
  if (shouldUseSolidTooltipBackground(background)) return "none";
  if (looksLikeTooltipBackgroundImage(background)) return background;
  return "none";
}

function resolveTooltipThemeSnapshot(target: HTMLElement): SharedTooltipThemeSnapshot {
  return resolveSdkThemeSnapshot(target);
}

function applyTooltipTheme(runtime: SharedTooltipRuntime, snapshot: SharedTooltipThemeSnapshot): void {
  runtime.root.style.setProperty("--stx-shared-tooltip-text", snapshot.text);
  runtime.root.style.setProperty("--stx-shared-tooltip-background", snapshot.background);
  runtime.root.style.setProperty("--stx-shared-tooltip-base-background", resolveTooltipBaseBackground(snapshot.background));
  runtime.root.style.setProperty("--stx-shared-tooltip-background-color", resolveTooltipBackgroundColor(snapshot.background));
  runtime.root.style.setProperty("--stx-shared-tooltip-background-image", resolveTooltipBackgroundImage(snapshot.background));
  runtime.root.style.setProperty("--stx-shared-tooltip-border", snapshot.border);
  runtime.root.style.setProperty("--stx-shared-tooltip-shadow", snapshot.shadow);
}

function ensureTooltipStyle(): void {
  const cssText = `
    #${SHARED_TOOLTIP_ID} {
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
    #${SHARED_TOOLTIP_ID}.is-visible {
      opacity: 1;
      visibility: visible;
      transition:
        opacity 0.16s ease,
        transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
        visibility 0s;
    }
    #${SHARED_TOOLTIP_ID}.is-instant {
      transition: none !important;
    }
    #${SHARED_TOOLTIP_ID}.is-shared-checkbox-target .stx-global-tooltip-body {
      max-width: min(56vw, 220px);
      min-width: 0;
    }
    #${SHARED_TOOLTIP_ID} {
      --stx-shared-tooltip-text: #ecdcb8;
      --stx-shared-tooltip-background: ${TOOLTIP_SOLID_BACKGROUND_FALLBACK};
      --stx-shared-tooltip-base-background: ${TOOLTIP_SOLID_BACKGROUND_FALLBACK};
      --stx-shared-tooltip-background-color: ${TOOLTIP_SOLID_BACKGROUND_FALLBACK};
      --stx-shared-tooltip-background-image: none;
      --stx-shared-tooltip-border: rgba(197, 160, 89, 0.55);
      --stx-shared-tooltip-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
    }
    #${SHARED_TOOLTIP_ID} .stx-global-tooltip-body {
      max-width: min(78vw, 360px);
      min-width: 72px;
      padding: 8px 10px;
      border: 1px solid var(--stx-shared-tooltip-border);
      border-radius: 8px;
      background-color: var(--stx-shared-tooltip-background-color);
      background-image: var(--stx-shared-tooltip-background-image);
      color: var(--stx-shared-tooltip-text);
      font-size: 12px;
      line-height: 1.55;
      text-align: left;
      white-space: pre-wrap;
      box-shadow: var(--stx-shared-tooltip-shadow);
    }
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
      #${SHARED_TOOLTIP_ID} {
        transition: none;
      }
    }
  `;
  const existing = document.getElementById(SHARED_TOOLTIP_STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== cssText) {
      existing.textContent = cssText;
    }
    return;
  }

  const style = document.createElement("style");
  style.id = SHARED_TOOLTIP_STYLE_ID;
  style.textContent = cssText;
  document.head.appendChild(style);
}

function resolveTooltipHost(target?: HTMLElement | null): HTMLElement {
  const dialogHost =
    target?.closest<HTMLDialogElement>("dialog[open]") ||
    document.querySelector<HTMLDialogElement>("dialog[open]");
  return dialogHost || document.body;
}

function ensureTooltipRuntime(state: SharedTooltipGlobalState, target?: HTMLElement | null): SharedTooltipRuntime {
  ensureTooltipStyle();
  const host = resolveTooltipHost(target);

  let root = document.getElementById(SHARED_TOOLTIP_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = SHARED_TOOLTIP_ID;
    host.appendChild(root);
  } else if (root.parentElement !== host) {
    host.appendChild(root);
  }

  let body = root.querySelector<HTMLDivElement>(".stx-global-tooltip-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "stx-global-tooltip-body";
    root.appendChild(body);
  }

  state.runtime = { root, body };
  return state.runtime;
}

function getSharedCheckboxRoot(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  return node.closest<HTMLElement>('[data-ui="shared-checkbox"]');
}

function getSharedSelectRoot(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  return node.closest<HTMLElement>('[data-ui="shared-select"]');
}

function getSharedInputRoot(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  if (node.matches('[data-ui="shared-input"]')) return node;
  return node.closest<HTMLElement>('[data-ui="shared-input"]');
}

function getSharedButtonRoot(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  if (node.matches('[data-ui="shared-button"]')) return node;
  return node.closest<HTMLElement>('[data-ui="shared-button"]');
}

function getSharedSelectTrigger(root: HTMLElement): HTMLElement {
  return (
    root.querySelector<HTMLElement>('[data-tooltip-anchor="shared-select-trigger"]') ||
    root.querySelector<HTMLElement>(".stx-shared-select-trigger") ||
    root
  );
}

function isSupportedExcludedTooltipNode(node: HTMLElement): boolean {
  return !!getSharedSelectRoot(node) || !!getSharedButtonRoot(node);
}

function getTooltipAnchorTarget(node: HTMLElement): HTMLElement {
  const sharedCheckboxRoot = getSharedCheckboxRoot(node);
  if (sharedCheckboxRoot) {
    return (
      sharedCheckboxRoot.querySelector<HTMLElement>('[data-tooltip-anchor="shared-checkbox-control"]') ||
      sharedCheckboxRoot
    );
  }
  const sharedSelectRoot = getSharedSelectRoot(node);
  if (sharedSelectRoot) return getSharedSelectTrigger(sharedSelectRoot);

  const sharedInputRoot = getSharedInputRoot(node);
  if (sharedInputRoot) return sharedInputRoot;

  const sharedButtonRoot = getSharedButtonRoot(node);
  if (sharedButtonRoot) return sharedButtonRoot;

  return node;
}

function isSharedCheckboxTooltipTarget(node: HTMLElement | null): boolean {
  return !!getSharedCheckboxRoot(node);
}

function resolveTooltipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  const dataTipTarget = node.closest<HTMLElement>("[data-tip]");
  if (!dataTipTarget) return null;
  if (dataTipTarget.matches(TOOLTIP_EXCLUDE_SELECTOR) && !isSupportedExcludedTooltipNode(dataTipTarget)) {
    return null;
  }
  const tip = String(dataTipTarget.dataset.tip ?? "").trim();
  if (!tip) return null;
  return getTooltipAnchorTarget(dataTipTarget);
}

function clearHideCleanupTimer(state: SharedTooltipGlobalState): void {
  if (state.hideCleanupTimer !== null) {
    clearTimeout(state.hideCleanupTimer);
    state.hideCleanupTimer = null;
  }
}

function releaseTooltipLayoutLock(runtime: SharedTooltipRuntime): void {
  runtime.body.style.width = "";
  runtime.body.style.maxWidth = "";
}

function scheduleHideCleanup(state: SharedTooltipGlobalState): void {
  clearHideCleanupTimer(state);
  const runtime = ensureTooltipRuntime(state);
  state.hideCleanupTimer = window.setTimeout(() => {
    state.hideCleanupTimer = null;
    if (state.activeTarget) return;
    runtime.root.classList.remove("is-shared-checkbox-target");
    releaseTooltipLayoutLock(runtime);
  }, SHARED_TOOLTIP_HIDE_TRANSITION_MS);
}

function hideTooltip(state: SharedTooltipGlobalState): void {
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  const runtime = ensureTooltipRuntime(state);
  const currentWidth = Math.ceil(runtime.body.getBoundingClientRect().width);
  if (currentWidth > 0) {
    runtime.body.style.width = `${currentWidth}px`;
    runtime.body.style.maxWidth = `${currentWidth}px`;
  }
  runtime.root.classList.remove("is-visible");
  state.activeTarget = null;
  scheduleHideCleanup(state);
}

function scheduleHideTooltip(state: SharedTooltipGlobalState): void {
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  state.hideTimer = window.setTimeout(() => {
    state.hideTimer = null;
    hideTooltip(state);
  }, SHARED_TOOLTIP_HIDE_DELAY_MS);
}

function positionTooltip(state: SharedTooltipGlobalState): void {
  if (!state.activeTarget) return;
  const runtime = ensureTooltipRuntime(state);
  const anchorTarget = getTooltipAnchorTarget(state.activeTarget);
  const targetRect = anchorTarget.getBoundingClientRect();
  const anchorX = targetRect.left + targetRect.width / 2;
  const anchorY = targetRect.top - 8;

  runtime.root.classList.add("is-visible");
  const width = Math.max(80, runtime.root.offsetWidth);
  const height = Math.max(32, runtime.root.offsetHeight);
  const margin = 8;
  const x = clamp(anchorX - width / 2, margin, window.innerWidth - width - margin);

  let y = anchorY - height;
  if (y < margin) {
    y = clamp(targetRect.bottom + 10, margin, window.innerHeight - height - margin);
  }

  runtime.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function showTooltip(target: HTMLElement, state: SharedTooltipGlobalState): void {
  const tip = String(target.dataset.tip ?? "").trim();
  if (!tip) {
    hideTooltip(state);
    return;
  }
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }

  const runtime = ensureTooltipRuntime(state, target);
  clearHideCleanupTimer(state);
  releaseTooltipLayoutLock(runtime);
  applyTooltipTheme(runtime, resolveTooltipThemeSnapshot(target));
  const anchorTarget = getTooltipAnchorTarget(target);
  const targetRect = anchorTarget.getBoundingClientRect();
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;
  const wasVisible = runtime.root.classList.contains("is-visible");
  const hasLastCenter = state.lastTargetCenterX !== null && state.lastTargetCenterY !== null;
  const distance = hasLastCenter
    ? Math.hypot(centerX - (state.lastTargetCenterX as number), centerY - (state.lastTargetCenterY as number))
    : 0;
  const shouldInstant = !wasVisible || distance >= SHARED_TOOLTIP_INSTANT_DISTANCE_PX;

  state.activeTarget = target;
  runtime.root.classList.toggle("is-shared-checkbox-target", isSharedCheckboxTooltipTarget(target));
  runtime.body.textContent = tip;
  if (shouldInstant) {
    runtime.root.classList.add("is-instant");
    positionTooltip(state);
    requestAnimationFrame(() => {
      runtime.root.classList.remove("is-instant");
    });
  } else {
    positionTooltip(state);
  }
  state.lastTargetCenterX = centerX;
  state.lastTargetCenterY = centerY;
}

function escapeCssSelector(text: string): string {
  if (typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function") {
    return (window as any).CSS.escape(text);
  }
  return text.replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g, "\\$1");
}

function getElementByIdWithinRoot(root: ParentNode, id: string): HTMLElement | null {
  const fromDocument = (root as Document).getElementById?.(id);
  if (fromDocument) return fromDocument as HTMLElement;
  if (!(root as Element).querySelector) return null;
  return (root as Element).querySelector<HTMLElement>(`#${escapeCssSelector(id)}`);
}

function buildTipFromContainer(container: HTMLElement): string {
  const titleNode =
    container.querySelector<HTMLElement>(
      ".stx-ui-item-title, .st-roll-item-title, .stx-ui-field-label, .st-roll-field-label, .stx-ui-list-title"
    ) || container.querySelector<HTMLElement>("label, legend");
  const descNode =
    container.querySelector<HTMLElement>(
      ".stx-ui-item-desc, .st-roll-item-desc, .stx-ui-tip, .st-roll-tip, .stx-ui-list-meta"
    ) || null;
  const title = String(titleNode?.textContent ?? "").trim();
  const desc = String(descNode?.textContent ?? "").trim();
  if (title && desc) return `${title}: ${desc}`;
  if (title) return title;
  if (desc) return desc;
  return "";
}

function buildTipFromControl(control: HTMLElement): string {
  if (control instanceof HTMLSelectElement) {
    if (
      control.classList.contains("stx-shared-select-native") ||
      control.getAttribute("aria-hidden") === "true" ||
      control.tabIndex < 0
    ) {
      return "";
    }
    const ariaLabel = String(control.getAttribute("aria-label") ?? "").trim();
    const selectedLabel = String(control.selectedOptions?.[0]?.textContent ?? "").trim();
    return ariaLabel || selectedLabel;
  }
  const placeholder = String((control as HTMLInputElement).placeholder ?? "").trim();
  const ariaLabel = String(control.getAttribute("aria-label") ?? "").trim();
  const text = String(control.textContent ?? "").trim();
  return ariaLabel || placeholder || text;
}

export function ensureSharedTooltip(): void {
  const state = getGlobalState();
  ensureTooltipRuntime(state);
  if (state.bound) return;

  document.addEventListener(
    "pointerover",
    (event: Event) => {
      const target = resolveTooltipTarget(event.target);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  document.addEventListener(
    "pointerout",
    (event: Event) => {
      const fromTarget = resolveTooltipTarget(event.target);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTarget((event as PointerEvent).relatedTarget ?? null);
      if (toTarget) return;
      if (state.activeTarget === fromTarget) {
        scheduleHideTooltip(state);
      }
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event: Event) => {
      const target = resolveTooltipTarget(event.target);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (event: Event) => {
      const fromTarget = resolveTooltipTarget(event.target);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTarget((event as FocusEvent).relatedTarget ?? null);
      if (toTarget) return;
      if (state.activeTarget === fromTarget) {
        scheduleHideTooltip(state);
      }
    },
    true
  );

  window.addEventListener(
    "scroll",
    () => {
      if (state.activeTarget) {
        positionTooltip(state);
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    if (state.activeTarget) {
      positionTooltip(state);
    }
  });

  state.bound = true;
}

export function applyTooltipCatalog(root: ParentNode, catalog: Record<string, string>): SettingsTooltipHydrateResult {
  let assigned = 0;
  const missing: string[] = [];
  const entries = Object.entries(catalog || {});
  for (const [id, tipRaw] of entries) {
    const tip = String(tipRaw || "").trim();
    if (!id || !tip) continue;
    const node = getElementByIdWithinRoot(root, id);
    if (!node) {
      missing.push(id);
      continue;
    }
    if (node.matches(TOOLTIP_EXCLUDE_SELECTOR) && !isSupportedExcludedTooltipNode(node)) {
      node.removeAttribute("data-tip");
      continue;
    }
    const tooltipTarget = getTooltipAnchorTarget(node);
    tooltipTarget.dataset.tip = tip;
    if (tooltipTarget !== node) {
      node.removeAttribute("data-tip");
    }
    assigned += 1;
  }
  return { assigned, missing };
}

function stripExcludedTooltips(root: ParentNode): void {
  if (!(root as Element).querySelectorAll) return;
  const nodes = Array.from((root as Element).querySelectorAll<HTMLElement>(`${TOOLTIP_EXCLUDE_SELECTOR}[data-tip]`));
  nodes.forEach((node: HTMLElement) => {
    if (isSupportedExcludedTooltipNode(node)) return;
    node.removeAttribute("data-tip");
  });
}

export function hydrateSettingsTooltips(options: SettingsTooltipHydrateOptions): SettingsTooltipHydrateResult {
  const root = options.root;
  let assigned = 0;
  const missing: string[] = [];
  stripExcludedTooltips(root);

  if (options.catalog) {
    const fromCatalog = applyTooltipCatalog(root, options.catalog);
    assigned += fromCatalog.assigned;
    missing.push(...fromCatalog.missing);
  }

  const rowSelectors =
    Array.isArray(options.rowSelectors) && options.rowSelectors.length > 0
      ? options.rowSelectors
      : DEFAULT_ROW_SELECTORS;
  const selector = rowSelectors.join(", ");
  if (!(root as Element).querySelectorAll) {
    return { assigned, missing };
  }

  const rows = Array.from((root as Element).querySelectorAll<HTMLElement>(selector));
  rows.forEach((row: HTMLElement) => {
    const rowTip = buildTipFromContainer(row);
    const controls = row.matches("input, select, textarea")
      ? [row]
      : Array.from(row.querySelectorAll<HTMLElement>("input, select, textarea"));

    controls.forEach((control: HTMLElement) => {
      if (control.dataset.tip && String(control.dataset.tip).trim()) return;
      const tooltipTarget = getTooltipAnchorTarget(control);
      if (tooltipTarget.dataset.tip && String(tooltipTarget.dataset.tip).trim()) return;
      const controlTip = buildTipFromControl(control);
      const tip = controlTip || rowTip;
      if (!tip) return;
      tooltipTarget.dataset.tip = tip;
      if (tooltipTarget !== control) {
        control.removeAttribute("data-tip");
      }
      assigned += 1;
    });
  });

  return { assigned, missing };
}
