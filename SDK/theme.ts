import { createSdkPluginSettingsStore } from "./settings";

export type SdkThemeId = "default" | "dark" | "light" | "tavern" | "smart";
export type SdkThemeMode = "sdk" | "smart";
export type SdkThemePresetId = Exclude<SdkThemeId, "smart">;

export interface SdkThemeState {
  mode: SdkThemeMode;
  themeId: SdkThemePresetId;
  followSmartTheme: boolean;
}

export interface SdkThemeSnapshot {
  text: string;
  background: string;
  border: string;
  shadow: string;
}

export interface ApplySdkThemeToNodeOptions {
  state?: SdkThemeState;
}

type SdkThemeListener = (state: SdkThemeState) => void;

const SDK_THEME_EVENT_NAME = "stx-sdk-theme-changed";
const SDK_THEME_SETTINGS_NAMESPACE = "stx_sdk_theme";
const SDK_THEME_GLOBAL_STORAGE_KEY = "stx_sdk_theme_global_v1";
const DEFAULT_SDK_THEME_STATE: SdkThemeState = {
  mode: "sdk",
  themeId: "default",
  followSmartTheme: true,
};

interface SdkThemeGlobalState {
  initialized: boolean;
  state: SdkThemeState;
  listeners: Set<SdkThemeListener>;
  hosts: Set<HTMLElement>;
}

let SDK_THEME_SETTINGS_STORE:
  | ReturnType<typeof createSdkPluginSettingsStore<SdkThemeState>>
  | null = null;

/**
 * 功能：读取 SDK 全局主题状态容器。
 * @returns SDK 全局主题运行时状态。
 */
function getGlobalThemeState(): SdkThemeGlobalState {
  const globalRef = globalThis as typeof globalThis & {
    __stxSdkThemeStateV1?: SdkThemeGlobalState;
  };
  if (globalRef.__stxSdkThemeStateV1) {
    return globalRef.__stxSdkThemeStateV1;
  }
  const created: SdkThemeGlobalState = {
    initialized: false,
    state: { ...DEFAULT_SDK_THEME_STATE },
    listeners: new Set<SdkThemeListener>(),
    hosts: new Set<HTMLElement>(),
  };
  globalRef.__stxSdkThemeStateV1 = created;
  return created;
}

/**
 * 功能：规范化 SDK 主题选择值。
 * @param theme 传入的原始主题值。
 * @returns 规范化后的 SDK 主题值。
 */
function normalizeSdkThemeId(theme: string): SdkThemeId {
  const normalized = String(theme || "").trim().toLowerCase();
  if (
    normalized === "dark" ||
    normalized === "light" ||
    normalized === "tavern" ||
    normalized === "smart"
  ) {
    return normalized;
  }
  return "default";
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
    followSmartTheme: partial?.followSmartTheme ?? fallback.followSmartTheme ?? true,
  };
}

function getSdkThemeSettingsStore() {
  if (SDK_THEME_SETTINGS_STORE) return SDK_THEME_SETTINGS_STORE;
  SDK_THEME_SETTINGS_STORE = createSdkPluginSettingsStore<SdkThemeState>({
    namespace: SDK_THEME_SETTINGS_NAMESPACE,
    defaults: DEFAULT_SDK_THEME_STATE,
    normalize: (candidate) => normalizeSdkThemeState(candidate, DEFAULT_SDK_THEME_STATE),
  });
  return SDK_THEME_SETTINGS_STORE;
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
      followSmartTheme: true,
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
  const globalStored = readGlobalStoredSdkThemeState();
  if (globalStored) return globalStored;
  try {
    return getSdkThemeSettingsStore().read();
  } catch {
    return null;
  }
}

/**
 * 功能：把 SDK 主题状态写入本地存储。
 * @param state 当前完整主题状态。
 * @returns 无返回值。
 */
function persistSdkThemeState(state: SdkThemeState): void {
  persistGlobalSdkThemeState(state);
  try {
    getSdkThemeSettingsStore().write(() => ({ ...state }));
  } catch {
    // 忽略本地存储不可用的场景
  }
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
  const changed =
    normalized.mode !== current.mode ||
    normalized.themeId !== current.themeId ||
    normalized.followSmartTheme !== current.followSmartTheme;
  if (!changed) {
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
  return state;
}

/**
 * 功能：构建 SDK 全局主题变量样式文本。
 * @param scopeSelector 主题宿主选择器。
 * @returns 对应作用域的主题变量样式。
 */
export function buildSdkThemeVars(scopeSelector: string): string {
  const selectors = scopeSelector
    .split(",")
    .map((selector: string) => selector.trim())
    .filter((selector: string) => selector.length > 0);
  const scopes = selectors.length > 0 ? selectors : [":root"];
  const joinScopedSelectors = (suffix = ""): string => scopes.map((selector: string) => `${selector}${suffix}`).join(",\n    ");
  return `
    ${joinScopedSelectors()} {
      color: var(--stx-theme-text, inherit);
      --stx-theme-text: #ecdcb8;
      --stx-theme-text-muted: rgba(255, 255, 255, 0.72);
      --stx-theme-accent: #c5a059;
      --stx-theme-accent-contrast: #ffeac0;
      --stx-theme-surface-1:
        radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%),
        linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82));
      --stx-theme-surface-2: rgba(0, 0, 0, 0.18);
      --stx-theme-surface-3: rgba(255, 255, 255, 0.03);
      --stx-theme-border: rgba(197, 160, 89, 0.35);
      --stx-theme-border-strong: rgba(197, 160, 89, 0.58);
      --stx-theme-focus-ring: rgba(197, 160, 89, 0.22);
      --stx-theme-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --stx-theme-backdrop: rgba(0, 0, 0, 0.72);
      --stx-theme-backdrop-filter: blur(2px);
      --stx-theme-panel-bg:
        radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%),
        linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96));
      --stx-theme-panel-border: rgba(197, 160, 89, 0.38);
      --stx-theme-panel-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --stx-theme-toolbar-bg: rgba(255, 255, 255, 0.04);
      --stx-theme-list-item-bg: rgba(255, 255, 255, 0.03);
      --stx-theme-list-item-hover-bg: rgba(197, 160, 89, 0.16);
      --stx-theme-list-item-active-bg: rgba(197, 160, 89, 0.24);
    }

    ${joinScopedSelectors(`[data-stx-theme-mode="sdk"][data-stx-theme="default"]`)} {
      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: rgba(23, 21, 24, 0.92);
      --SmartThemeShadowColor: rgba(0, 0, 0, 0.45);
      --SmartThemeBlurStrength: 2px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;
    }

    ${joinScopedSelectors(`[data-stx-theme-mode="sdk"][data-stx-theme="dark"]`)} {
      --stx-theme-text: #e6edf7;
      --stx-theme-text-muted: #a5b0c4;
      --stx-theme-accent: #5f8de5;
      --stx-theme-accent-contrast: #f1f6ff;
      --stx-theme-surface-1: #171f2f;
      --stx-theme-surface-2: #182233;
      --stx-theme-surface-3: #1f2a3d;
      --stx-theme-border: #35425e;
      --stx-theme-border-strong: #5c74a5;
      --stx-theme-focus-ring: rgba(95, 141, 229, 0.24);
      --stx-theme-shadow: 0 12px 30px #0b1020;
      --stx-theme-backdrop: rgba(15, 21, 32, 0.9);
      --stx-theme-backdrop-filter: none;
      --stx-theme-panel-bg: #131c2b;
      --stx-theme-panel-border: #34435f;
      --stx-theme-panel-shadow: 0 12px 30px #0b1020;
      --stx-theme-toolbar-bg: #202c40;
      --stx-theme-list-item-bg: #1f2a3d;
      --stx-theme-list-item-hover-bg: #2c3b56;
      --stx-theme-list-item-active-bg: #334766;
      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: #131c2b;
      --SmartThemeShadowColor: rgba(11, 16, 32, 0.78);
      --SmartThemeBlurStrength: 0px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;
    }

    ${joinScopedSelectors(`[data-stx-theme-mode="sdk"][data-stx-theme="light"]`)} {
      --stx-theme-text: #1f2834;
      --stx-theme-text-muted: #5e6e84;
      --stx-theme-accent: #2f6ee5;
      --stx-theme-accent-contrast: #ffffff;
      --stx-theme-surface-1: #f8fbff;
      --stx-theme-surface-2: #eef3fa;
      --stx-theme-surface-3: #ffffff;
      --stx-theme-border: #c6d1e2;
      --stx-theme-border-strong: #8eaed9;
      --stx-theme-focus-ring: rgba(47, 110, 229, 0.18);
      --stx-theme-shadow: 0 10px 24px rgba(198, 208, 223, 0.9);
      --stx-theme-backdrop: rgba(217, 225, 238, 0.86);
      --stx-theme-backdrop-filter: none;
      --stx-theme-panel-bg: #f5f9ff;
      --stx-theme-panel-border: #c6d3e6;
      --stx-theme-panel-shadow: 0 10px 24px rgba(198, 208, 223, 0.9);
      --stx-theme-toolbar-bg: #eef3fa;
      --stx-theme-list-item-bg: #ffffff;
      --stx-theme-list-item-hover-bg: #e8f0ff;
      --stx-theme-list-item-active-bg: #d8e6ff;
      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: #f5f9ff;
      --SmartThemeShadowColor: rgba(198, 208, 223, 0.9);
      --SmartThemeBlurStrength: 0px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;
    }

    ${joinScopedSelectors(`[data-stx-theme-mode="sdk"][data-stx-theme="tavern"]`)} {
      --stx-theme-text: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-text-muted: var(--SmartThemeEmColor, #919191);
      --stx-theme-accent: var(--SmartThemeQuoteColor, #e18a24);
      --stx-theme-accent-contrast: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-surface-1: transparent;
      --stx-theme-surface-2: transparent;
      --stx-theme-surface-3: transparent;
      --stx-theme-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-border-strong: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --stx-theme-focus-ring: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent);
      --stx-theme-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-backdrop: transparent;
      --stx-theme-backdrop-filter: blur(var(--SmartThemeBlurStrength, 0px));
      --stx-theme-panel-bg: transparent;
      --stx-theme-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-toolbar-bg:
        linear-gradient(
          348deg,
          var(--white30a, rgba(255, 255, 255, 0.3)) 2%,
          var(--grey30a, rgba(50, 50, 50, 0.3)) 10%,
          var(--black70a, rgba(0, 0, 0, 0.7)) 95%,
          var(--SmartThemeQuoteColor, #e18a24) 100%
        );
      --stx-theme-list-item-bg: transparent;
      --stx-theme-list-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --stx-theme-list-item-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
    }

    ${joinScopedSelectors(`[data-stx-theme-mode="smart"]`)},
    ${joinScopedSelectors(`[data-stx-theme="smart"]`)} {
      --stx-theme-text: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-text-muted: var(--SmartThemeEmColor, rgba(255, 255, 255, 0.72));
      --stx-theme-accent: var(--SmartThemeQuoteColor, #e18a24);
      --stx-theme-accent-contrast: var(--SmartThemeQuoteTextColor, #ffffff);
      --stx-theme-surface-1: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96));
      --stx-theme-surface-2: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 88%, #000 12%);
      --stx-theme-surface-3: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 92%, #000 8%);
      --stx-theme-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-border-strong: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --stx-theme-focus-ring: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent);
      --stx-theme-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-backdrop: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 85%, #000 15%);
      --stx-theme-backdrop-filter: blur(var(--SmartThemeBlurStrength, 0px));
      --stx-theme-panel-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --stx-theme-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-toolbar-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 82%, var(--SmartThemeBodyColor, #dcdcd2) 18%);
      --stx-theme-list-item-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 90%, #000 10%);
      --stx-theme-list-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --stx-theme-list-item-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
    }
  `;
}

/**
 * 功能：读取节点上的第一个有效自定义变量值。
 * @param style 计算后的样式对象。
 * @param propertyNames 候选变量名列表。
 * @returns 命中的变量值；未命中时返回空字符串。
 */
function readFirstDefinedCustomProperty(style: CSSStyleDeclaration, propertyNames: string[]): string {
  for (const propertyName of propertyNames) {
    const value = style.getPropertyValue(propertyName).trim();
    if (value) {
      return value;
    }
  }
  return "";
}

/**
 * 功能：判断主题变量值是否为不可用的透明背景。
 * @param value 待判断的主题变量值
 * @returns 为透明占位值时返回 true，否则返回 false
 */
function isTransparentThemeValue(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    normalized === "hsla(0,0%,0%,0)" ||
    normalized === "hsla(0, 0%, 0%, 0)"
  );
}

/**
 * 功能：从单个样式源中按候选属性顺序读取第一个可用值。
 * @param style 计算样式对象
 * @param propertyNames 候选属性名列表
 * @param shouldSkipValue 可选的值过滤器
 * @returns 可用的主题值；未命中时返回空字符串
 */
function readFirstUsableCustomProperty(
  style: CSSStyleDeclaration,
  propertyNames: string[],
  shouldSkipValue?: (value: string) => boolean
): string {
  for (const propertyName of propertyNames) {
    const value = style.getPropertyValue(propertyName).trim();
    if (!value) continue;
    if (shouldSkipValue?.(value)) continue;
    return value;
  }
  return "";
}

/**
 * 功能：定位 tooltip 等浮层应当读取主题变量的源节点。
 * @param target 当前目标节点。
 * @returns 最接近的主题宿主节点。
 */
function resolveSdkThemeSource(target: HTMLElement): HTMLElement {
  return (
    target.closest<HTMLElement>("[data-stx-theme]") ||
    target.closest<HTMLElement>("[data-st-roll-theme]") ||
    target.closest<HTMLElement>(".st-roll-content") ||
    target.closest<HTMLElement>(".st-roll-shell") ||
    target
  );
}

/**
 * 功能：从目标节点读取统一主题快照，供 tooltip 等浮层直接复用。
 * @param target 当前目标节点。
 * @returns 统一主题快照。
 */
export function resolveSdkThemeSnapshot(target: HTMLElement): SdkThemeSnapshot {
  const source = resolveSdkThemeSource(target);
  const style = getComputedStyle(source);
  const bodyStyle = getComputedStyle(document.body);
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (
    propertyNames: string[],
    fallback: string,
    shouldSkipValue?: (value: string) => boolean
  ): string => {
    const candidates = [
      readFirstUsableCustomProperty(style, propertyNames, shouldSkipValue),
      readFirstUsableCustomProperty(bodyStyle, propertyNames, shouldSkipValue),
      readFirstUsableCustomProperty(rootStyle, propertyNames, shouldSkipValue),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      return candidate;
    }
    return fallback;
  };
  return {
    text: read(["--stx-theme-text", "--st-roll-text", "--SmartThemeBodyColor"], "#ecdcb8"),
    background: read(
      [
        "--stx-theme-panel-bg",
        "--st-roll-modal-panel-bg",
        "--st-roll-select-panel-bg",
        "--st-roll-content-bg",
        "--stx-theme-toolbar-bg",
        "--stx-theme-list-item-bg",
        "--st-roll-control-bg",
        "--SmartThemeBlurTintColor",
      ],
      "rgba(12, 8, 6, 0.96)",
      isTransparentThemeValue
    ),
    border: read(
      ["--stx-theme-panel-border", "--st-roll-modal-panel-border", "--st-roll-control-border", "--SmartThemeBorderColor"],
      "rgba(197, 160, 89, 0.55)"
    ),
    shadow: read(
      ["--stx-theme-panel-shadow", "--st-roll-modal-panel-shadow", "--SmartThemeShadowColor"],
      "0 8px 20px rgba(0, 0, 0, 0.45)"
    ),
  };
}
