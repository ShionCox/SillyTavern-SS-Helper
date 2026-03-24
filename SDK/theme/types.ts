/**
 * 通用主题系统 —— 类型定义。
 */

/**
 * 主题 ID：`default`（金棕默认）、`dark`（深蓝）、`light`（浅色）、`host`（跟随宿主）。
 *
 * - `host` 是 SDK 内部宿主题 ID，所有内核 API 仅使用此值。
 */
export type ThemeId = "default" | "dark" | "light" | "host";

/** 主题令牌：每条对应一个 `--ss-theme-*` CSS 变量 */
export interface ThemeTokens {
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  surface1: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  focusRing: string;
  panelBg: string;
  panelBorder: string;
  panelShadow: string;
  toolbarBg: string;
  listItemHoverBg: string;
  listItemActiveBg: string;
  backdrop: string;
  backdropFilter: string;
  shadow: string;
  rollTooltipText: string;
  rollTooltipBg: string;
  rollTooltipBorder: string;
  rollTooltipShadow: string;
}

/** 全局主题状态 */
export interface ThemeState {
  themeId: ThemeId;
}

/** 主题宿主适配器 —— 把宿主 CSS 变量转成 `host` 主题令牌 */
export interface ThemeHostAdapter {
  /** 检测宿主变量是否可用 */
  isAvailable(): boolean;
}

/** 主题变化监听器 */
export type ThemeListener = (state: ThemeState) => void;
