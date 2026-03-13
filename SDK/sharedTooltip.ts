import {
  applySdkThemeSnapshotToDetachedNode,
  logSdkThemeResolutionDebug,
  resolveSdkThemeSnapshot,
  subscribeSdkTheme,
  type SdkThemeSnapshot,
} from "./theme";

const SHARED_TOOLTIP_RUNTIME_MARK = "v2";
const SHARED_TOOLTIP_RUNTIME_VERSION = 2;
const SHARED_TOOLTIP_STYLE_ID = "stx-shared-tooltip-style";
const SHARED_TOOLTIP_ID = "stx-shared-tooltip";
const LEGACY_SHARED_TOOLTIP_RUNTIME_KEY = "__stxSharedTooltipStateV1";
const SHARED_TOOLTIP_RUNTIME_KEY = "__stxSharedTooltipStateV2";
const LEGACY_SHARED_TOOLTIP_STYLE_IDS = ["st-roll-shared-tooltip-style"];
const LEGACY_SHARED_TOOLTIP_IDS = ["st-roll-shared-tooltip"];
const SHARED_TOOLTIP_DEBUG_STORAGE_KEY = "stx_shared_tooltip_debug";
const SHARED_TOOLTIP_OWNER = "sdk";
const SHARED_TOOLTIP_HIDE_DELAY_MS = 90;
const SHARED_TOOLTIP_HIDE_TRANSITION_MS = 180;
const SHARED_TOOLTIP_INSTANT_DISTANCE_PX = 260;
const TOOLTIP_EXCLUDE_SELECTOR = "button, .stx-ui-tab, .st-roll-tab";
const SHARED_TOOLTIP_TRACE_PREFIX = "[SS-Helper][TooltipTrace]";

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
  runtimeVersion: number;
  ownerPlugin: string;
  bound: boolean;
  runtime: SharedTooltipRuntime | null;
  activeTarget: HTMLElement | null;
  lastTargetCenterX: number | null;
  lastTargetCenterY: number | null;
  hideTimer: number | null;
  hideCleanupTimer: number | null;
  positionFrame: number | null;
  themeRefreshFrame: number | null;
  lastDebugToken: string | null;
  unbindHandlers: Array<() => void>;
}

type SharedTooltipGlobalRef = typeof globalThis & {
  __stxSharedTooltipStateV1?: Partial<SharedTooltipGlobalState> | undefined;
  __stxSharedTooltipStateV2?: SharedTooltipGlobalState | undefined;
  __stxSharedTooltipDebugEnabled?: boolean | undefined;
  __stxTooltipDebugLast?: unknown;
};

function traceSharedTooltip(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`${SHARED_TOOLTIP_TRACE_PREFIX} ${message}`);
    return;
  }
  console.info(`${SHARED_TOOLTIP_TRACE_PREFIX} ${message}`, payload);
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

/**
 * 功能：读取 shared tooltip 的全局运行时对象。
 * 参数：无。
 * 返回：SharedTooltipGlobalRef，全局对象的类型化引用。
 */
function getSharedTooltipGlobalRef(): SharedTooltipGlobalRef {
  return globalThis as SharedTooltipGlobalRef;
}

/**
 * 功能：判断当前是否开启 tooltip 诊断模式。
 * 参数：无。
 * 返回：boolean，开启时返回 true。
 */
function isSharedTooltipDebugEnabled(): boolean {
  const globalRef = getSharedTooltipGlobalRef();
  if (globalRef.__stxSharedTooltipDebugEnabled === true) {
    return true;
  }
  try {
    return (
      String(globalRef.localStorage?.getItem(SHARED_TOOLTIP_DEBUG_STORAGE_KEY) ?? "").trim() === "1"
    );
  } catch {
    return false;
  }
}

/**
 * 功能：判断当前节点是否归属于新版 shared tooltip 运行时。
 * 参数：
 *   node（Element | null）：待检查的节点。
 * 返回：boolean，属于新版运行时时返回 true。
 */
function isOwnedSharedTooltipNode(node: Element | null): boolean {
  return node?.getAttribute("data-stx-shared-tooltip-runtime") === SHARED_TOOLTIP_RUNTIME_MARK;
}

/**
 * 功能：为 shared tooltip 运行时节点写入统一标记。
 * 参数：
 *   node（Element）：需要写入标记的节点。
 * 返回：void。
 */
function markSharedTooltipNode(node: Element): void {
  node.setAttribute("data-stx-shared-tooltip-runtime", SHARED_TOOLTIP_RUNTIME_MARK);
  node.setAttribute("data-stx-shared-tooltip-owner", SHARED_TOOLTIP_OWNER);
}

/**
 * 功能：清理旧版 tooltip 运行时残留的计时器与动画帧。
 * 参数：
 *   state（Partial<SharedTooltipGlobalState> | undefined）：旧版运行时状态。
 * 返回：void。
 */
function clearSharedTooltipAsyncState(
  state: Partial<SharedTooltipGlobalState> | undefined
): void {
  if (!state) return;
  if (typeof state.hideTimer === "number") {
    clearTimeout(state.hideTimer);
  }
  if (typeof state.hideCleanupTimer === "number") {
    clearTimeout(state.hideCleanupTimer);
  }
  if (typeof state.positionFrame === "number") {
    window.cancelAnimationFrame(state.positionFrame);
  }
  if (typeof state.themeRefreshFrame === "number") {
    window.cancelAnimationFrame(state.themeRefreshFrame);
  }
  state.hideTimer = null;
  state.hideCleanupTimer = null;
  state.positionFrame = null;
  state.themeRefreshFrame = null;
  state.activeTarget = null;
  state.lastDebugToken = null;
}

/**
 * 功能：移除旧版 tooltip DOM 残留。
 * 参数：无。
 * 返回：void。
 */
function removeLegacySharedTooltipNodes(): void {
  const styleIds = [...LEGACY_SHARED_TOOLTIP_STYLE_IDS, SHARED_TOOLTIP_STYLE_ID];
  styleIds.forEach((styleId: string) => {
    const styleNode = document.getElementById(styleId);
    if (!styleNode || isOwnedSharedTooltipNode(styleNode)) return;
    styleNode.remove();
  });

  const rootIds = [...LEGACY_SHARED_TOOLTIP_IDS, SHARED_TOOLTIP_ID];
  rootIds.forEach((rootId: string) => {
    const rootNode = document.getElementById(rootId);
    if (!rootNode || isOwnedSharedTooltipNode(rootNode)) return;
    rootNode.remove();
  });
}

/**
 * 功能：清理旧版 tooltip runtime，并避免旧单例继续接管界面。
 * 参数：无。
 * 返回：void。
 */
function cleanupLegacySharedTooltipRuntime(): void {
  const globalRef = getSharedTooltipGlobalRef();
  const legacyState = globalRef[LEGACY_SHARED_TOOLTIP_RUNTIME_KEY];
  clearSharedTooltipAsyncState(legacyState);
  if (legacyState?.runtime?.root instanceof HTMLElement && !isOwnedSharedTooltipNode(legacyState.runtime.root)) {
    legacyState.runtime.root.remove();
  }
  if (legacyState?.runtime?.body instanceof HTMLElement && !isOwnedSharedTooltipNode(legacyState.runtime.body)) {
    legacyState.runtime.body.remove();
  }
  removeLegacySharedTooltipNodes();
  delete globalRef[LEGACY_SHARED_TOOLTIP_RUNTIME_KEY];
}

/**
 * 功能：释放新版 shared tooltip runtime 的监听与 DOM。
 * 参数：
 *   state（SharedTooltipGlobalState | undefined）：待释放的运行时状态。
 * 返回：void。
 */
function disposeSharedTooltipRuntime(state: SharedTooltipGlobalState | undefined): void {
  if (!state) return;
  state.unbindHandlers.forEach((unbind: () => void) => {
    try {
      unbind();
    } catch {
      // 忽略解绑阶段的个别异常
    }
  });
  state.unbindHandlers = [];
  clearSharedTooltipAsyncState(state);
  if (state.runtime?.root?.isConnected) {
    state.runtime.root.remove();
  }
  state.runtime = null;
  state.bound = false;
}

/**
 * 功能：判断当前页面是否仍存在旧版 tooltip runtime。
 * 参数：无。
 * 返回：boolean，存在旧版实现时返回 true。
 */
function hasLegacySharedTooltipRuntime(): boolean {
  const globalRef = getSharedTooltipGlobalRef();
  if (globalRef[LEGACY_SHARED_TOOLTIP_RUNTIME_KEY]) {
    return true;
  }
  const legacyIds = [...LEGACY_SHARED_TOOLTIP_STYLE_IDS, ...LEGACY_SHARED_TOOLTIP_IDS];
  return legacyIds.some((nodeId: string) => !!document.getElementById(nodeId));
}

/**
 * 功能：读取新版 shared tooltip 全局运行时状态。
 * 参数：无。
 * 返回：SharedTooltipGlobalState，全局运行时状态。
 */
function getGlobalState(): SharedTooltipGlobalState {
  const globalRef = getSharedTooltipGlobalRef();
  const existed = globalRef[SHARED_TOOLTIP_RUNTIME_KEY];
  if (existed) {
    if (existed.runtimeVersion !== SHARED_TOOLTIP_RUNTIME_VERSION) {
      disposeSharedTooltipRuntime(existed);
      delete globalRef[SHARED_TOOLTIP_RUNTIME_KEY];
    } else {
      return existed;
    }
  }
  cleanupLegacySharedTooltipRuntime();
  const created: SharedTooltipGlobalState = {
    runtimeVersion: SHARED_TOOLTIP_RUNTIME_VERSION,
    ownerPlugin: SHARED_TOOLTIP_OWNER,
    bound: false,
    runtime: null,
    activeTarget: null,
    lastTargetCenterX: null,
    lastTargetCenterY: null,
    hideTimer: null,
    hideCleanupTimer: null,
    positionFrame: null,
    themeRefreshFrame: null,
    lastDebugToken: null,
    unbindHandlers: [],
  };
  globalRef[SHARED_TOOLTIP_RUNTIME_KEY] = created;
  return created;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 功能：把 tooltip 目标节点格式化为便于诊断的简短文本。
 * @param node 当前 tooltip 目标节点。
 * @returns 节点摘要文本。
 */
function describeTooltipNode(node: HTMLElement | null): string {
  if (!node) return "(null)";
  const tagName = node.tagName.toLowerCase();
  const idPart = node.id ? `#${node.id}` : "";
  const classList = Array.from(node.classList).slice(0, 4);
  const classPart = classList.length > 0 ? `.${classList.join(".")}` : "";
  const tipText = String(node.dataset.tip ?? "").trim();
  const tipPart = tipText ? ` tip=${JSON.stringify(tipText.slice(0, 36))}` : "";
  return `${tagName}${idPart}${classPart}${tipPart}`;
}

/**
 * 功能：输出 tooltip 主题应用后的关键诊断信息。
 * @param target 当前 tooltip 目标节点。
 * @param runtime tooltip 运行时节点引用。
 * @param snapshot 已应用的主题快照。
 * @param reason 触发诊断的原因。
 * @returns 无返回值。
 */
function logTooltipThemeDebug(
  target: HTMLElement,
  runtime: SharedTooltipRuntime,
  snapshot: SdkThemeSnapshot,
  reason: string
): void {
  if (!isSharedTooltipDebugEnabled()) return;
  const bodyStyle = getComputedStyle(runtime.body);
  const payload = {
    target: describeTooltipNode(target),
    snapshot: {
      text: snapshot.text,
      background: snapshot.background,
      backgroundSolid: snapshot.backgroundSolid,
      backgroundImage: snapshot.backgroundImage,
      border: snapshot.border,
      shadow: snapshot.shadow,
    },
    appliedVars: {
      text: String(runtime.root.style.getPropertyValue("--stx-shared-tooltip-text") || "").trim(),
      backgroundColor: String(
        runtime.root.style.getPropertyValue("--stx-shared-tooltip-background-color") || ""
      ).trim(),
      backgroundImage: String(
        runtime.root.style.getPropertyValue("--stx-shared-tooltip-background-image") || ""
      ).trim(),
      border: String(runtime.root.style.getPropertyValue("--stx-shared-tooltip-border") || "").trim(),
      shadow: String(runtime.root.style.getPropertyValue("--stx-shared-tooltip-shadow") || "").trim(),
    },
    computedBody: {
      color: String(bodyStyle.color || "").trim(),
      backgroundColor: String(bodyStyle.backgroundColor || "").trim(),
      backgroundImage: String(bodyStyle.backgroundImage || "").trim(),
      borderColor: String(bodyStyle.borderColor || "").trim(),
      boxShadow: String(bodyStyle.boxShadow || "").trim(),
    },
  };
  getSharedTooltipGlobalRef().__stxTooltipDebugLast = payload;
}

/**
 * 功能：把统一主题快照同步到共享提示框样式变量。
 * @param runtime 共享提示框运行时引用。
 * @param snapshot 已解析的 SDK 主题快照。
 * @returns 无返回值。
 */
function applyTooltipTheme(runtime: SharedTooltipRuntime, snapshot: SdkThemeSnapshot): void {
  applySdkThemeSnapshotToDetachedNode(runtime.root, snapshot);
  runtime.root.style.setProperty("--stx-shared-tooltip-text", snapshot.text);
  runtime.root.style.setProperty(
    "--stx-shared-tooltip-base-background",
    snapshot.backgroundSolid
  );
  runtime.root.style.setProperty(
    "--stx-shared-tooltip-background-color",
    snapshot.backgroundSolid
  );
  runtime.root.style.setProperty(
    "--stx-shared-tooltip-background-image",
    snapshot.backgroundImage
  );
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
      --stx-shared-tooltip-text: var(--stx-theme-text, #ecdcb8);
      --stx-shared-tooltip-base-background: var(--stx-theme-panel-bg, rgba(23, 21, 24, 0.96));
      --stx-shared-tooltip-background-color: rgba(23, 21, 24, 0.96);
      --stx-shared-tooltip-background-image: none;
      --stx-shared-tooltip-border: var(--stx-theme-border, rgba(197, 160, 89, 0.55));
      --stx-shared-tooltip-shadow: var(--stx-theme-shadow, 0 8px 20px rgba(0, 0, 0, 0.45));
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
    markSharedTooltipNode(existing);
    return;
  }

  const style = document.createElement("style");
  style.id = SHARED_TOOLTIP_STYLE_ID;
  style.textContent = cssText;
  markSharedTooltipNode(style);
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
  markSharedTooltipNode(root);

  let body = root.querySelector<HTMLDivElement>(".stx-global-tooltip-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "stx-global-tooltip-body";
    root.appendChild(body);
  }
  markSharedTooltipNode(body);

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
  const anchorTarget = getTooltipAnchorTarget(dataTipTarget);
  if (!String(anchorTarget.dataset.tip ?? "").trim()) {
    anchorTarget.dataset.tip = tip;
  }
  return anchorTarget;
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

/**
 * 功能：在下一帧统一重算共享提示框的位置。
 * @param state 全局运行时状态
 * @returns 无返回值
 */
function scheduleTooltipPosition(state: SharedTooltipGlobalState): void {
  if (state.positionFrame !== null) return;
  state.positionFrame = window.requestAnimationFrame((): void => {
    state.positionFrame = null;
    if (!state.activeTarget) return;
    positionTooltip(state);
  });
}

function scheduleTooltipThemeRefresh(
  state: SharedTooltipGlobalState,
  reason: string
): void {
  if (state.themeRefreshFrame !== null) {
    window.cancelAnimationFrame(state.themeRefreshFrame);
  }
  state.themeRefreshFrame = window.requestAnimationFrame((): void => {
    state.themeRefreshFrame = null;
    const runtime = state.runtime;
    const target = state.activeTarget;
    traceSharedTooltip("theme refresh frame fired", {
      reason,
      hasRuntime: !!runtime,
      activeTarget: describeTooltipNode(target),
    });
    if (!runtime || !target || !target.isConnected) return;
    const snapshot = resolveSdkThemeSnapshot(target);
    traceSharedTooltip("apply tooltip theme from frame", {
      reason,
      activeTarget: describeTooltipNode(target),
      snapshot: {
        mode: snapshot.mode,
        selection: snapshot.selection,
        text: snapshot.text,
        background: snapshot.background,
        border: snapshot.border,
      },
    });
    applyTooltipTheme(runtime, snapshot);
    maybeLogTooltipThemeResolution(target, runtime, snapshot, reason);
    state.lastDebugToken = [
      describeTooltipNode(target),
      String(target.dataset.tip ?? "").trim(),
      snapshot.text,
      snapshot.backgroundSolid,
      snapshot.backgroundImage,
      snapshot.border,
    ].join(" | ");
    scheduleTooltipPosition(state);
  });
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
  state.lastDebugToken = null;
  if (state.positionFrame !== null) {
    window.cancelAnimationFrame(state.positionFrame);
    state.positionFrame = null;
  }
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
  const snapshot = resolveSdkThemeSnapshot(target);
  traceSharedTooltip("showTooltip", {
    target: describeTooltipNode(target),
    activeTarget: describeTooltipNode(state.activeTarget),
    snapshot: {
      mode: snapshot.mode,
      selection: snapshot.selection,
      text: snapshot.text,
      background: snapshot.background,
      border: snapshot.border,
    },
  });
  clearHideCleanupTimer(state);
  releaseTooltipLayoutLock(runtime);
  applyTooltipTheme(runtime, snapshot);
  if (
    state.activeTarget === target &&
    runtime.body.textContent === tip &&
    runtime.root.classList.contains("is-visible")
  ) {
    scheduleTooltipPosition(state);
    return;
  }
  const debugToken = [
    describeTooltipNode(target),
    tip,
    snapshot.text,
    snapshot.backgroundSolid,
    snapshot.backgroundImage,
    snapshot.border,
  ].join(" | ");
  if (isSharedTooltipDebugEnabled() && state.lastDebugToken !== debugToken) {
    maybeLogTooltipThemeResolution(target, runtime, snapshot, "tooltip_show");
    state.lastDebugToken = debugToken;
  }
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

/**
 * 功能：按需输出 tooltip 主题解析日志。
 * 参数：
 *   target（HTMLElement）：当前 tooltip 目标节点。
 *   runtime（SharedTooltipRuntime）：tooltip 运行时节点引用。
 *   snapshot（SdkThemeSnapshot）：当前主题快照。
 *   reason（string）：触发日志的原因。
 * 返回：void。
 */
function maybeLogTooltipThemeResolution(
  target: HTMLElement,
  runtime: SharedTooltipRuntime,
  snapshot: SdkThemeSnapshot,
  reason: string
): void {
  if (!isSharedTooltipDebugEnabled()) return;
  logSdkThemeResolutionDebug(target, reason);
  logTooltipThemeDebug(target, runtime, snapshot, reason);
}

/**
 * 功能：在存在旧版 tooltip runtime 时拦截事件，避免旧监听继续接管显示。
 * 参数：
 *   event（Event）：当前事件对象。
 *   targets（Array<HTMLElement | null>）：本次事件命中的 tooltip 相关目标。
 * 返回：void。
 */
function interceptLegacyTooltipEvent(
  event: Event,
  ...targets: Array<HTMLElement | null>
): void {
  if (!hasLegacySharedTooltipRuntime()) return;
  if (!targets.some((target: HTMLElement | null) => !!target)) return;
  event.stopPropagation();
}

/**
 * 功能：注册 shared tooltip 全局监听，并保存解绑句柄。
 * 参数：
 *   state（SharedTooltipGlobalState）：全局运行时状态。
 *   target（Window | Document）：事件目标。
 *   eventName（string）：事件名。
 *   listener（EventListenerOrEventListenerObject）：监听函数。
 *   options（boolean | AddEventListenerOptions | undefined）：监听选项。
 * 返回：void。
 */
function bindSharedTooltipListener(
  state: SharedTooltipGlobalState,
  target: Window | Document,
  eventName: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): void {
  const normalizedOptions = options ?? false;
  target.addEventListener(eventName, listener, normalizedOptions);
  state.unbindHandlers.push(() => {
    target.removeEventListener(eventName, listener, normalizedOptions);
  });
}

/**
 * 功能：绑定新版 shared tooltip 监听器。
 * 参数：
 *   state（SharedTooltipGlobalState）：全局运行时状态。
 * 返回：void。
 */
function bindSharedTooltipRuntime(state: SharedTooltipGlobalState): void {
  bindSharedTooltipListener(
    state,
    window,
    "pointerover",
    (event: Event): void => {
      const target = resolveTooltipTarget(event.target);
      interceptLegacyTooltipEvent(event, target);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  bindSharedTooltipListener(
    state,
    window,
    "pointerout",
    (event: Event): void => {
      const fromTarget = resolveTooltipTarget(event.target);
      const toTarget = resolveTooltipTarget((event as PointerEvent).relatedTarget ?? null);
      interceptLegacyTooltipEvent(event, fromTarget, toTarget);
      if (!fromTarget) return;
      if (toTarget) return;
      if (state.activeTarget === fromTarget) {
        scheduleHideTooltip(state);
      }
    },
    true
  );

  bindSharedTooltipListener(
    state,
    window,
    "focusin",
    (event: Event): void => {
      const target = resolveTooltipTarget(event.target);
      interceptLegacyTooltipEvent(event, target);
      if (!target) return;
      showTooltip(target, state);
    },
    true
  );

  bindSharedTooltipListener(
    state,
    window,
    "focusout",
    (event: Event): void => {
      const fromTarget = resolveTooltipTarget(event.target);
      const toTarget = resolveTooltipTarget((event as FocusEvent).relatedTarget ?? null);
      interceptLegacyTooltipEvent(event, fromTarget, toTarget);
      if (!fromTarget) return;
      if (toTarget) return;
      if (state.activeTarget === fromTarget) {
        scheduleHideTooltip(state);
      }
    },
    true
  );

  bindSharedTooltipListener(
    state,
    window,
    "scroll",
    (): void => {
      if (state.activeTarget) {
        scheduleTooltipPosition(state);
      }
    },
    true
  );

  bindSharedTooltipListener(state, window, "resize", (): void => {
    if (state.activeTarget) {
      scheduleTooltipPosition(state);
    }
  });

  state.unbindHandlers.push(subscribeSdkTheme((): void => {
    traceSharedTooltip("subscribeSdkTheme fired", {
      hasRuntime: !!state.runtime,
      activeTarget: describeTooltipNode(state.activeTarget),
    });
    if (!state.runtime || !state.activeTarget) return;
    scheduleTooltipThemeRefresh(state, "tooltip_theme_changed");
  }));
}

export function ensureSharedTooltip(): void {
  const state = getGlobalState();
  cleanupLegacySharedTooltipRuntime();
  ensureTooltipRuntime(state);
  if (state.bound) return;
  bindSharedTooltipRuntime(state);
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
