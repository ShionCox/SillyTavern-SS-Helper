/**
 * 通用主题系统 —— 基于 SDK/settings 的持久化读写与旧值归一化。
 */

import type { ThemeId } from "./types";

const THEME_SETTINGS_KEY = "stx_sdk_theme_global_v2";

/** 把任意字符串归一化为合法 ThemeId。 */
export function normalizeThemeId(raw: string): ThemeId {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "dark") return "dark";
  if (s === "light") return "light";
  if (s === "host") return "host";
  return "default";
}

/** 从 localStorage 读取已持久化的主题 ID */
export function readPersistedThemeId(): ThemeId {
  try {
    const raw = String(globalThis.localStorage?.getItem(THEME_SETTINGS_KEY) ?? "").trim();
    if (!raw) return "default";
    return normalizeThemeId(raw);
  } catch {
    return "default";
  }
}

/** 把主题 ID 写入 localStorage */
export function persistThemeId(themeId: ThemeId): void {
  try {
    globalThis.localStorage?.setItem(THEME_SETTINGS_KEY, themeId);
  } catch {
    // 忽略存储不可用
  }
}

