/**
 * 通用主题系统 —— 统一公开入口。
 * 业务模块只允许从 `SDK/theme` 导入，不可直接导入内部子模块。
 */

export type { ThemeId, ThemeTokens, ThemeState, ThemeHostAdapter, ThemeListener } from "./types";

export { initThemeKernel, getTheme, setTheme, subscribeTheme } from "./kernel";

export { mountThemeHost, unmountThemeHost } from "./host";

export { buildThemeVars } from "./css";

export { getThemeTokens } from "./presets";

export { normalizeThemeId } from "./storage";
