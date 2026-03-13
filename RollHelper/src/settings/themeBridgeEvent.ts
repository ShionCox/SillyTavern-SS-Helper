/**
 * 主题桥接模块 —— 负责 RollHelper 设置层 ("tavern") 与 SDK 内核层 ("host") 之间的双向转换。
 *
 * 设置层持久化值: "default" | "dark" | "light" | "tavern"
 * SDK 内核 ThemeId:  "default" | "dark" | "light" | "host"
 */

import type { RollHelperSettingsThemeEvent } from "../types/eventDomainEvent";
import type { ThemeId } from "../../../SDK/theme";

/**
 * 把设置层输入归一化为设置层合法值。
 * 历史持久化的 "host" 兼容映射为 "tavern"。
 */
export function normalizeSettingsThemeEvent(raw: unknown): RollHelperSettingsThemeEvent {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "dark") return "dark";
  if (s === "light") return "light";
  if (s === "tavern" || s === "host") return "tavern";
  return "default";
}

/**
 * 设置层值 → SDK 内核值。
 * "tavern" → "host"，其余原样。
 */
export function settingsThemeToSdkThemeEvent(theme: RollHelperSettingsThemeEvent): ThemeId {
  if (theme === "tavern") return "host";
  return theme as ThemeId;
}

/**
 * SDK 内核值 → 设置层值。
 * "host" → "tavern"，其余原样。
 */
export function sdkThemeToSettingsThemeEvent(themeId: ThemeId): RollHelperSettingsThemeEvent {
  if (themeId === "host") return "tavern";
  return themeId as RollHelperSettingsThemeEvent;
}
