const SHARED_TOOLTIP_STYLE_ID = "stx-shared-tooltip-style";
const SHARED_TOOLTIP_ID = "stx-shared-tooltip";
const LEGACY_TOOLTIP_STYLE_ID = "st-roll-shared-tooltip-style";
const LEGACY_TOOLTIP_ID = "st-roll-shared-tooltip";
const SHARED_TOOLTIP_HIDE_DELAY_MS = 90;
const SHARED_TOOLTIP_INSTANT_DISTANCE_PX = 260;
const TOOLTIP_EXCLUDE_SELECTOR = "button, .stx-ui-tab, .st-roll-tab";

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

interface SharedTooltipGlobalState {
  bound: boolean;
  runtime: SharedTooltipRuntime | null;
  activeTarget: HTMLElement | null;
  lastTargetCenterX: number | null;
  lastTargetCenterY: number | null;
  hideTimer: number | null;
  titleScopeSelectors: Set<string>;
}

export interface EnsureSharedTooltipOptions {
  titleScopeSelectors?: string[];
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
    if (!(existed.titleScopeSelectors instanceof Set)) {
      existed.titleScopeSelectors = new Set<string>();
    }
    return existed;
  }
  const created: SharedTooltipGlobalState = {
    bound: false,
    runtime: null,
    activeTarget: null,
    lastTargetCenterX: null,
    lastTargetCenterY: null,
    hideTimer: null,
    titleScopeSelectors: new Set<string>(),
  };
  globalRef.__stxSharedTooltipStateV1 = created;
  return created;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function appendTitleScopes(state: SharedTooltipGlobalState, selectors?: string[]): void {
  if (!Array.isArray(selectors)) return;
  selectors.forEach((selector: string) => {
    const text = String(selector || "").trim();
    if (text) {
      state.titleScopeSelectors.add(text);
    }
  });
}

function isInTitleScope(target: HTMLElement, selectors: Set<string>): boolean {
  if (selectors.size <= 0) return false;
  for (const selector of selectors) {
    try {
      if (target.closest(selector)) return true;
    } catch {
      // 忽略非法选择器，避免单个配置影响整体功能
    }
  }
  return false;
}

function ensureTooltipStyle(): void {
  if (document.getElementById(SHARED_TOOLTIP_STYLE_ID)) return;
  const legacyStyle = document.getElementById(LEGACY_TOOLTIP_STYLE_ID);
  if (legacyStyle) {
    legacyStyle.id = SHARED_TOOLTIP_STYLE_ID;
    return;
  }

  const style = document.createElement("style");
  style.id = SHARED_TOOLTIP_STYLE_ID;
  style.textContent = `
    #${LEGACY_TOOLTIP_ID} {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      transform: translate3d(-9999px, -9999px, 0) !important;
    }
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
    #${SHARED_TOOLTIP_ID} .stx-global-tooltip-body,
    #${SHARED_TOOLTIP_ID} .st-rh-global-tooltip-body {
      max-width: min(78vw, 360px);
      min-width: 72px;
      padding: 8px 10px;
      border: 1px solid rgba(197, 160, 89, 0.55);
      border-radius: 8px;
      background: rgba(12, 8, 6, 0.96);
      color: #ecdcb8;
      font-size: 12px;
      line-height: 1.55;
      text-align: left;
      white-space: pre-wrap;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
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
      #${SHARED_TOOLTIP_ID} {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureTooltipRuntime(state: SharedTooltipGlobalState): SharedTooltipRuntime {
  if (state.runtime) return state.runtime;
  ensureTooltipStyle();

  let root = document.getElementById(SHARED_TOOLTIP_ID) as HTMLDivElement | null;
  const legacyRoot = document.getElementById(LEGACY_TOOLTIP_ID) as HTMLDivElement | null;
  if (!root) {
    if (legacyRoot) {
      legacyRoot.id = SHARED_TOOLTIP_ID;
      root = legacyRoot;
    }
  } else if (legacyRoot && legacyRoot !== root) {
    legacyRoot.remove();
  }

  if (!root) {
    root = document.createElement("div");
    root.id = SHARED_TOOLTIP_ID;
    document.body.appendChild(root);
  }

  let body = root.querySelector<HTMLDivElement>(".stx-global-tooltip-body, .st-rh-global-tooltip-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "stx-global-tooltip-body st-rh-global-tooltip-body";
    root.appendChild(body);
  } else {
    if (!body.classList.contains("stx-global-tooltip-body")) {
      body.classList.add("stx-global-tooltip-body");
    }
    if (!body.classList.contains("st-rh-global-tooltip-body")) {
      body.classList.add("st-rh-global-tooltip-body");
    }
  }

  state.runtime = { root, body };
  return state.runtime;
}

function resolveTooltipTarget(node: EventTarget | null, state: SharedTooltipGlobalState): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  const dataTipTarget = node.closest<HTMLElement>("[data-tip]");
  if (dataTipTarget) {
    if (dataTipTarget.matches(TOOLTIP_EXCLUDE_SELECTOR)) return null;
    const tip = String(dataTipTarget.dataset.tip ?? "").trim();
    if (tip) return dataTipTarget;
  }

  const titleTarget = node.closest<HTMLElement>("[title]");
  if (!titleTarget) return null;
  if (titleTarget.matches(TOOLTIP_EXCLUDE_SELECTOR)) return null;
  if (!isInTitleScope(titleTarget, state.titleScopeSelectors)) return null;
  const title = String(titleTarget.getAttribute("title") ?? "").trim();
  if (!title) return null;
  titleTarget.dataset.tip = title;
  titleTarget.removeAttribute("title");
  return titleTarget;
}

function hideTooltip(state: SharedTooltipGlobalState): void {
  if (state.hideTimer !== null) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  const runtime = ensureTooltipRuntime(state);
  runtime.root.classList.remove("is-visible");
  state.activeTarget = null;
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
  const targetRect = state.activeTarget.getBoundingClientRect();
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

  const runtime = ensureTooltipRuntime(state);
  const targetRect = target.getBoundingClientRect();
  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;
  const wasVisible = runtime.root.classList.contains("is-visible");
  const hasLastCenter = state.lastTargetCenterX !== null && state.lastTargetCenterY !== null;
  const distance = hasLastCenter
    ? Math.hypot(centerX - (state.lastTargetCenterX as number), centerY - (state.lastTargetCenterY as number))
    : 0;
  const shouldInstant = !wasVisible || distance >= SHARED_TOOLTIP_INSTANT_DISTANCE_PX;

  state.activeTarget = target;
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
  if (title && desc) return `${title}：${desc}`;
  if (title) return title;
  if (desc) return desc;
  return "";
}

function buildTipFromControl(control: HTMLElement): string {
  const placeholder = String((control as HTMLInputElement).placeholder ?? "").trim();
  const ariaLabel = String(control.getAttribute("aria-label") ?? "").trim();
  const text = String(control.textContent ?? "").trim();
  const title = String(control.getAttribute("title") ?? "").trim();
  return ariaLabel || placeholder || text || title;
}

/**
 * 功能：初始化共享 tooltip 单例，并确保监听器仅绑定一次。
 * 参数：
 *   options：可选初始化参数，支持追加 title 迁移作用域。
 * 返回：
 *   void：无返回值。
 */
export function ensureSharedTooltip(options?: EnsureSharedTooltipOptions): void {
  const state = getGlobalState();
  appendTitleScopes(state, options?.titleScopeSelectors);
  ensureTooltipRuntime(state);
  if (state.bound) return;

  document.addEventListener(
    "pointerover",
    (event: Event) => {
      const target = resolveTooltipTarget(event.target, state);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  document.addEventListener(
    "pointerout",
    (event: Event) => {
      const fromTarget = resolveTooltipTarget(event.target, state);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTarget((event as PointerEvent).relatedTarget ?? null, state);
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
      const target = resolveTooltipTarget(event.target, state);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (event: Event) => {
      const fromTarget = resolveTooltipTarget(event.target, state);
      if (!fromTarget) return;
      const toTarget = resolveTooltipTarget((event as FocusEvent).relatedTarget ?? null, state);
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

/**
 * 功能：按 ID 目录批量写入 data-tip。
 * 参数：
 *   root：查询根节点。
 *   catalog：键为元素 ID、值为 tooltip 文案。
 * 返回：
 *   SettingsTooltipHydrateResult：写入数量与缺失 ID 列表。
 */
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
    if (node.matches(TOOLTIP_EXCLUDE_SELECTOR)) {
      node.removeAttribute("data-tip");
      node.removeAttribute("title");
      continue;
    }
    node.dataset.tip = tip;
    node.removeAttribute("title");
    assigned += 1;
  }
  return { assigned, missing };
}

function stripExcludedTooltips(root: ParentNode): void {
  if (!(root as Element).querySelectorAll) return;
  const nodes = Array.from((root as Element).querySelectorAll<HTMLElement>(`${TOOLTIP_EXCLUDE_SELECTOR}[data-tip]`));
  nodes.forEach((node: HTMLElement) => {
    node.removeAttribute("data-tip");
  });
}

/**
 * 功能：为设置面板内控件自动补全 tooltip，并可叠加目录写入。
 * 参数：
 *   options：包含根节点、可选目录和可选行选择器。
 * 返回：
 *   SettingsTooltipHydrateResult：本次补写数量与目录缺失项。
 */
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
      const controlTip = buildTipFromControl(control);
      const tip = controlTip || rowTip;
      if (!tip) return;
      control.dataset.tip = tip;
      control.removeAttribute("title");
      assigned += 1;
    });
  });

  return { assigned, missing };
}
