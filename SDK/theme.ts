import {
  buildSdkThemeDebugSnapshotView,
  collectSdkThemeNodeChain,
  describeSdkThemeNode,
  readSdkThemeDebugStyle,
} from "./theme.debug";
import {
  buildSdkThemeSnapshot,
  normalizeSdkThemeId,
  resolveSdkThemeSource,
} from "./theme.snapshot";
import {
  createSdkThemeRuntimeCaches,
  ensureSdkThemeRuntimeCaches,
  getDetachedSdkThemeVarCache,
  invalidateSdkThemeRuntimeCaches,
  readCachedSdkThemeSnapshot,
  syncDetachedSdkThemeCssVars,
  writeCachedSdkThemeSnapshot,
} from "./theme.runtime";
export { buildSdkThemeVars } from "./theme.styles";
import type {
  SdkThemeId,
  SdkThemeMode,
  SdkThemePresetId,
  SdkThemeSnapshot,
  SdkThemeStateLike,
} from "./theme.snapshot";
import type { SdkThemeRuntimeCaches } from "./theme.runtime";

export type { SdkThemeId, SdkThemeMode, SdkThemePresetId, SdkThemeSnapshot };

export interface SdkThemeState extends SdkThemeStateLike {}

export interface ApplySdkThemeToNodeOptions {
  state?: SdkThemeState;
}

type SdkThemeListener = (state: SdkThemeState) => void;

const SDK_THEME_EVENT_NAME = "stx-sdk-theme-changed";
const SDK_THEME_GLOBAL_STORAGE_KEY = "stx_sdk_theme_global_v1";
const SDK_THEME_TRACE_PREFIX = "[SS-Helper][ThemeTrace]";
const DEFAULT_SDK_THEME_STATE: SdkThemeState = {
  mode: "sdk",
  themeId: "default",
};

interface SdkThemeGlobalState {
  initialized: boolean;
  state: SdkThemeState;
  listeners: Set<SdkThemeListener>;
  hosts: Set<HTMLElement>;
  caches: SdkThemeRuntimeCaches;
}

function describeSdkThemeHost(node: HTMLElement | null | undefined): string {
  if (!node) return "(null)";
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const classes = Array.from(node.classList).slice(0, 4);
  const classText = classes.length > 0 ? `.${classes.join(".")}` : "";
  const theme = String(node.getAttribute("data-stx-theme") ?? "").trim();
  const mode = String(node.getAttribute("data-stx-theme-mode") ?? "").trim();
  const rollTheme = String(node.getAttribute("data-st-roll-theme") ?? "").trim();
  return `${tag}${id}${classText} stx=${theme || "-"}/${mode || "-"} roll=${rollTheme || "-"}`;
}

function traceSdkTheme(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`${SDK_THEME_TRACE_PREFIX} ${message}`);
    return;
  }
  console.info(`${SDK_THEME_TRACE_PREFIX} ${message}`, payload);
}

/**
 * 功能：读取 SDK 全局主题状态容器。
 * @returns SDK 全局主题运行时状态。
 */
function getGlobalThemeState(): SdkThemeGlobalState {
  const globalRef = globalThis as typeof globalThis & {
    __stxSdkThemeStateV1?: SdkThemeGlobalState;
  };
  if (globalRef.__stxSdkThemeStateV1) {
    const existing = globalRef.__stxSdkThemeStateV1 as Partial<SdkThemeGlobalState>;
    const migrated: SdkThemeGlobalState = {
      initialized: existing.initialized === true,
      state: normalizeSdkThemeState(existing.state, DEFAULT_SDK_THEME_STATE),
      listeners:
        existing.listeners instanceof Set
          ? (existing.listeners as Set<SdkThemeListener>)
          : new Set<SdkThemeListener>(),
      hosts:
        existing.hosts instanceof Set
          ? (existing.hosts as Set<HTMLElement>)
          : new Set<HTMLElement>(),
      caches: ensureSdkThemeRuntimeCaches(existing.caches),
    };
    globalRef.__stxSdkThemeStateV1 = migrated;
    return migrated;
  }
  const created: SdkThemeGlobalState = {
    initialized: false,
    state: { ...DEFAULT_SDK_THEME_STATE },
    listeners: new Set<SdkThemeListener>(),
    hosts: new Set<HTMLElement>(),
    caches: createSdkThemeRuntimeCaches(),
  };
  globalRef.__stxSdkThemeStateV1 = created;
  return created;
}

/**
 * 功能：规范化 SDK 主题状态。
 * @param partial 需要合并的状态片段。
 * @param fallback 回退状态。
 * @returns 规范化后的完整状态。
 */
function normalizeSdkThemeState(
  partial: Partial<SdkThemeState> | null | undefined,
  fallback: SdkThemeState
): SdkThemeState {
  const nextThemeId = normalizeSdkThemeId(String(partial?.themeId ?? fallback.themeId));
  const nextModeRaw = String(partial?.mode ?? fallback.mode).trim().toLowerCase();
  const nextMode: SdkThemeMode = nextModeRaw === "smart" ? "smart" : "sdk";
  return {
    mode: nextMode,
    themeId: nextThemeId === "smart" ? fallback.themeId : nextThemeId,
  };
}

/**
 * 功能：从全局本地存储读取 SDK 主题状态，避免受酒馆作用域变化影响。
 * @returns 已保存的主题状态片段；读取失败时返回空值
 */
function readGlobalStoredSdkThemeState(): Partial<SdkThemeState> | null {
  try {
    const raw = String(globalThis.localStorage?.getItem(SDK_THEME_GLOBAL_STORAGE_KEY) ?? "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SdkThemeState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 功能：把 SDK 主题状态写入全局本地存储。
 * @param state 当前完整主题状态
 * @returns 无返回值
 */
function persistGlobalSdkThemeState(state: SdkThemeState): void {
  try {
    globalThis.localStorage?.setItem(SDK_THEME_GLOBAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略本地存储不可用
  }
}

/**
 * 功能：把运行时状态转换成界面选择值。
 * @param state 当前 SDK 主题状态。
 * @returns 可直接写入界面控件的主题值。
 */
export function resolveSdkThemeSelection(state: SdkThemeState): SdkThemeId {
  return state.mode === "smart" ? "smart" : state.themeId;
}

/**
 * 功能：把主题选择值转换为状态片段。
 * @param theme 主题选择值。
 * @returns 可用于写入全局主题状态的状态片段。
 */
export function buildSdkThemePatchFromSelection(theme: string): Partial<SdkThemeState> {
  const normalized = normalizeSdkThemeId(theme);
  if (normalized === "smart") {
    return {
      mode: "smart",
    };
  }
  return {
    mode: "sdk",
    themeId: normalized,
  };
}

/**
 * 功能：从本地存储读取已保存的 SDK 主题状态。
 * @returns 已保存状态；读取失败时返回空值。
 */
function readStoredSdkThemeState(): Partial<SdkThemeState> | null {
  return readGlobalStoredSdkThemeState();
}

/**
 * 功能：把 SDK 主题状态写入本地存储。
 * @param state 当前完整主题状态。
 * @returns 无返回值。
 */
function persistSdkThemeState(state: SdkThemeState): void {
  persistGlobalSdkThemeState(state);
}

/**
 * 功能：把主题状态同步到单个宿主节点。
 * @param root 主题宿主节点。
 * @param state 当前主题状态。
 * @returns 无返回值。
 */
function applyStateToNode(root: HTMLElement, state: SdkThemeState): void {
  root.setAttribute("data-stx-theme", resolveSdkThemeSelection(state));
  root.setAttribute("data-stx-theme-mode", state.mode);
  syncSdkThemeClasses(root, state);
}

/**
 * 功能：广播 SDK 主题更新。
 * @param state 当前完整主题状态。
 * @returns 无返回值。
 */
function broadcastSdkThemeState(state: SdkThemeState): void {
  const globalState = getGlobalThemeState();
  globalState.caches = ensureSdkThemeRuntimeCaches(globalState.caches);
  invalidateSdkThemeRuntimeCaches(globalState.caches);
  traceSdkTheme("broadcastSdkThemeState", {
    state,
    hostCount: globalState.hosts.size,
    listenerCount: globalState.listeners.size,
    cacheVersion: globalState.caches.themeSnapshotVersion,
  });
  Array.from(globalState.hosts).forEach((host: HTMLElement) => {
    if (!host.isConnected) {
      globalState.hosts.delete(host);
      return;
    }
    applyStateToNode(host, state);
  });
  globalState.listeners.forEach((listener: SdkThemeListener) => {
    listener(state);
  });
  document.dispatchEvent(
    new CustomEvent<SdkThemeState>(SDK_THEME_EVENT_NAME, {
      detail: state,
    })
  );
}

/**
 * 功能：初始化 SDK 全局主题状态，仅在首次调用时生效。
 * @param preferredTheme 首次初始化时优先采用的主题值。
 * @returns 当前 SDK 主题状态。
 */
export function initializeSdkThemeState(preferredTheme?: string): SdkThemeState {
  const globalState = getGlobalThemeState();
  if (globalState.initialized) {
    return globalState.state;
  }
  const stored = readStoredSdkThemeState();
  const seed =
    stored ??
    (preferredTheme ? buildSdkThemePatchFromSelection(preferredTheme) : DEFAULT_SDK_THEME_STATE);
  globalState.state = normalizeSdkThemeState(seed, DEFAULT_SDK_THEME_STATE);
  globalState.initialized = true;
  return globalState.state;
}

/**
 * 功能：读取当前 SDK 全局主题状态。
 * @returns 当前主题状态。
 */
export function getSdkThemeState(): SdkThemeState {
  return initializeSdkThemeState();
}

/**
 * 功能：写入 SDK 全局主题状态，并通知所有已接入宿主实时刷新。
 * @param next 需要覆盖的主题状态片段。
 * @returns 更新后的完整主题状态。
 */
export function setSdkThemeState(next: Partial<SdkThemeState>): SdkThemeState {
  const globalState = getGlobalThemeState();
  const current = initializeSdkThemeState();
  const normalized = normalizeSdkThemeState(next, current);
  const changed = normalized.mode !== current.mode || normalized.themeId !== current.themeId;
  traceSdkTheme("setSdkThemeState", {
    next,
    current,
    normalized,
    changed,
  });
  if (!changed) {
    traceSdkTheme("setSdkThemeState skipped broadcast because state is unchanged", {
      current,
      normalized,
    });
    return current;
  }
  globalState.state = normalized;
  persistSdkThemeState(normalized);
  broadcastSdkThemeState(normalized);
  return normalized;
}

/**
 * 功能：订阅 SDK 全局主题变化。
 * @param listener 主题变化后的回调。
 * @returns 取消订阅函数。
 */
export function subscribeSdkTheme(listener: SdkThemeListener): () => void {
  const globalState = getGlobalThemeState();
  globalState.listeners.add(listener);
  return (): void => {
    globalState.listeners.delete(listener);
  };
}

/**
 * 功能：同步宿主节点上的主题类名。
 * @param root 主题宿主节点。
 * @param state 可选的主题状态；未传时自动读取全局状态。
 * @returns 无返回值。
 */
export function syncSdkThemeClasses(root: HTMLElement, state?: SdkThemeState): void {
  const nextState = state ?? getSdkThemeState();
  const selection = resolveSdkThemeSelection(nextState);
  root.classList.toggle("is-theme-default", selection === "default");
  root.classList.toggle("is-theme-dark", selection === "dark");
  root.classList.toggle("is-theme-light", selection === "light");
  root.classList.toggle("is-theme-tavern", selection === "tavern");
  root.classList.toggle("is-theme-smart", selection === "smart");
  root.classList.toggle("is-theme-sdk", nextState.mode === "sdk");
}

/**
 * 功能：把当前全局主题应用到指定节点，并注册为实时联动宿主。
 * @param root 主题宿主节点。
 * @param options 可选应用参数。
 * @returns 应用后的完整主题状态。
 */
export function applySdkThemeToNode(
  root: HTMLElement,
  options?: ApplySdkThemeToNodeOptions
): SdkThemeState {
  const globalState = getGlobalThemeState();
  const state = options?.state ?? getSdkThemeState();
  globalState.hosts.add(root);
  applyStateToNode(root, state);
  traceSdkTheme("applySdkThemeToNode", {
    host: describeSdkThemeHost(root),
    state,
    hostCount: globalState.hosts.size,
  });
  return state;
}

/**
 * 功能：输出一次 SDK 主题解析诊断日志，用于排查 tooltip 和脱离层取色问题。
 * @param target 当前触发诊断的目标节点。
 * @param reason 触发诊断的原因。
 * @returns 本次解析得到的主题快照。
 */
export function logSdkThemeResolutionDebug(
  target: HTMLElement,
  reason: string
): SdkThemeSnapshot {
  const globalState = getGlobalThemeState();
  globalState.caches = ensureSdkThemeRuntimeCaches(globalState.caches);
  const source = resolveSdkThemeSource(target);
  const cachedBefore = readCachedSdkThemeSnapshot(globalState.caches, source);
  const snapshot = resolveSdkThemeSnapshot(target);
  const cachedAfter = readCachedSdkThemeSnapshot(globalState.caches, source);
  const payload = {
    reason,
    target: describeSdkThemeNode(target),
    source: describeSdkThemeNode(source),
    chain: collectSdkThemeNodeChain(target),
    cache: {
      version: globalState.caches.themeSnapshotVersion,
      beforeHit: !!cachedBefore,
      afterHit: !!cachedAfter,
    },
    sourceStyle: readSdkThemeDebugStyle(source),
    snapshot: buildSdkThemeDebugSnapshotView(snapshot),
  };
  (globalThis as typeof globalThis & { __stxThemeDebugLast?: unknown }).__stxThemeDebugLast =
    payload;
  return snapshot;
}

/**
 * 功能：从目标节点读取统一主题快照，供 tooltip 等浮层直接复用。
 * @param target 当前目标节点。
 * @returns 统一主题快照。
 */
export function resolveSdkThemeSnapshot(target: HTMLElement): SdkThemeSnapshot {
  const globalState = getGlobalThemeState();
  globalState.caches = ensureSdkThemeRuntimeCaches(globalState.caches);
  const source = resolveSdkThemeSource(target);
  const cached = readCachedSdkThemeSnapshot(globalState.caches, source);
  if (cached) {
    return cached;
  }

  const snapshot = buildSdkThemeSnapshot(source, getSdkThemeState());
  writeCachedSdkThemeSnapshot(globalState.caches, source, snapshot);
  return snapshot;
}

/**
 * 功能：把统一主题快照应用到脱离原作用域的节点。
 * @param node 需要同步主题变量的节点。
 * @param source 主题源节点或已解析的主题快照。
 * @returns 最终应用到节点上的主题快照。
 */
export function applySdkThemeSnapshotToDetachedNode(
  node: HTMLElement,
  source: HTMLElement | SdkThemeSnapshot
): SdkThemeSnapshot {
  const snapshot = source instanceof HTMLElement ? resolveSdkThemeSnapshot(source) : source;
  const globalState = getGlobalThemeState();
  globalState.caches = ensureSdkThemeRuntimeCaches(globalState.caches);
  getDetachedSdkThemeVarCache(globalState.caches, node);
  const currentState = getSdkThemeState();
  const nextState: SdkThemeState =
    snapshot.mode === "smart"
      ? {
          mode: "smart",
          themeId: currentState.themeId,
        }
      : {
          mode: "sdk",
          themeId:
            snapshot.selection === "smart"
              ? currentState.themeId
              : (snapshot.selection as SdkThemePresetId),
        };

  applyStateToNode(node, nextState);
  syncDetachedSdkThemeCssVars(globalState.caches, node, snapshot);
  return snapshot;
}
