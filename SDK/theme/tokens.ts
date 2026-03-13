/**
 * 通用主题系统 —— 令牌定义与 CSS 变量读写。
 */

import type { ThemeTokens } from "./types";

/** 令牌字段 → CSS 变量名映射 */
export const CSS_VAR_NAMES: Record<keyof ThemeTokens, string> = {
  text: "--ss-theme-text",
  textMuted: "--ss-theme-text-muted",
  accent: "--ss-theme-accent",
  accentContrast: "--ss-theme-accent-contrast",
  surface1: "--ss-theme-surface-1",
  surface2: "--ss-theme-surface-2",
  surface3: "--ss-theme-surface-3",
  border: "--ss-theme-border",
  borderStrong: "--ss-theme-border-strong",
  focusRing: "--ss-theme-focus-ring",
  panelBg: "--ss-theme-panel-bg",
  panelBorder: "--ss-theme-panel-border",
  panelShadow: "--ss-theme-panel-shadow",
  toolbarBg: "--ss-theme-toolbar-bg",
  listItemHoverBg: "--ss-theme-list-item-hover-bg",
  listItemActiveBg: "--ss-theme-list-item-active-bg",
  backdrop: "--ss-theme-backdrop",
  backdropFilter: "--ss-theme-backdrop-filter",
  shadow: "--ss-theme-shadow",
  rollTooltipText: "--ss-theme-roll-tooltip-text",
  rollTooltipBg: "--ss-theme-roll-tooltip-bg",
  rollTooltipBorder: "--ss-theme-roll-tooltip-border",
  rollTooltipShadow: "--ss-theme-roll-tooltip-shadow",
};

const TOKEN_ENTRIES = Object.entries(CSS_VAR_NAMES) as [keyof ThemeTokens, string][];

/** 把令牌写入目标元素的 inline style */
export function writeTokensToElement(el: HTMLElement, tokens: ThemeTokens): void {
  for (const [key, cssVar] of TOKEN_ENTRIES) {
    el.style.setProperty(cssVar, tokens[key]);
  }
}

/** 清除目标元素上的所有 `--ss-theme-*` inline style */
export function clearTokensFromElement(el: HTMLElement): void {
  for (const cssVar of Object.values(CSS_VAR_NAMES)) {
    el.style.removeProperty(cssVar);
  }
}
