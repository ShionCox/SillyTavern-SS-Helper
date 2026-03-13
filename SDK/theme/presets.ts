/**
 * 通用主题系统 —— 内建预设令牌。
 */

import type { ThemeId, ThemeTokens } from "./types";

const PRESET_DEFAULT: ThemeTokens = {
  text: "#ecdcb8",
  textMuted: "rgba(255, 255, 255, 0.72)",
  accent: "#c5a059",
  accentContrast: "#ffeac0",
  surface1:
    "radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%), linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82))",
  surface2: "rgba(0, 0, 0, 0.18)",
  surface3: "rgba(255, 255, 255, 0.03)",
  border: "rgba(197, 160, 89, 0.35)",
  borderStrong: "rgba(197, 160, 89, 0.58)",
  focusRing: "rgba(197, 160, 89, 0.22)",
  panelBg:
    "radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%), linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96))",
  panelBorder: "rgba(197, 160, 89, 0.38)",
  panelShadow: "0 18px 54px rgba(0, 0, 0, 0.46)",
  toolbarBg: "rgba(255, 255, 255, 0.04)",
  listItemHoverBg: "rgba(197, 160, 89, 0.16)",
  listItemActiveBg: "rgba(197, 160, 89, 0.24)",
  backdrop: "rgba(0, 0, 0, 0.72)",
  backdropFilter: "blur(2px)",
  shadow: "0 18px 54px rgba(0, 0, 0, 0.46)",
  rollTooltipText: "#dbd2c2",
  rollTooltipBg:
    "radial-gradient(circle at top, rgba(246, 223, 172, 0.07), transparent 52%), linear-gradient(145deg, rgba(40, 30, 20, 0.97), rgba(14, 10, 7, 0.99))",
  rollTooltipBorder: "rgba(176, 143, 76, 0.55)",
  rollTooltipShadow:
    "0 6px 18px rgba(0, 0, 0, 0.8), inset 0 0 12px rgba(0, 0, 0, 0.4), 0 0 6px rgba(176, 143, 76, 0.1)",
};

const PRESET_DARK: ThemeTokens = {
  text: "#e6edf7",
  textMuted: "#a5b0c4",
  accent: "#5f8de5",
  accentContrast: "#f1f6ff",
  surface1: "#171f2f",
  surface2: "#182233",
  surface3: "#1f2a3d",
  border: "#35425e",
  borderStrong: "#5c74a5",
  focusRing: "rgba(95, 141, 229, 0.24)",
  panelBg: "#131c2b",
  panelBorder: "#34435f",
  panelShadow: "0 12px 30px #0b1020",
  toolbarBg: "#202c40",
  listItemHoverBg: "#2c3b56",
  listItemActiveBg: "#334766",
  backdrop: "rgba(15, 21, 32, 0.9)",
  backdropFilter: "none",
  shadow: "0 12px 30px #0b1020",
  rollTooltipText: "#dbd2c2",
  rollTooltipBg:
    "radial-gradient(circle at top, rgba(246, 223, 172, 0.07), transparent 52%), linear-gradient(145deg, rgba(40, 30, 20, 0.97), rgba(14, 10, 7, 0.99))",
  rollTooltipBorder: "rgba(176, 143, 76, 0.55)",
  rollTooltipShadow:
    "0 6px 18px rgba(0, 0, 0, 0.8), inset 0 0 12px rgba(0, 0, 0, 0.4), 0 0 6px rgba(176, 143, 76, 0.1)",
};

const PRESET_LIGHT: ThemeTokens = {
  text: "#1f2834",
  textMuted: "#5e6e84",
  accent: "#2f6ee5",
  accentContrast: "#ffffff",
  surface1: "#f8fbff",
  surface2: "#eef3fa",
  surface3: "#ffffff",
  border: "#c6d1e2",
  borderStrong: "#8eaed9",
  focusRing: "rgba(47, 110, 229, 0.18)",
  panelBg: "#f5f9ff",
  panelBorder: "#c6d3e6",
  panelShadow: "0 10px 24px rgba(198, 208, 223, 0.9)",
  toolbarBg: "#eef3fa",
  listItemHoverBg: "#e8f0ff",
  listItemActiveBg: "#d8e6ff",
  backdrop: "rgba(217, 225, 238, 0.86)",
  backdropFilter: "none",
  shadow: "0 10px 24px rgba(198, 208, 223, 0.9)",
  rollTooltipText: "#dbd2c2",
  rollTooltipBg:
    "radial-gradient(circle at top, rgba(246, 223, 172, 0.07), transparent 52%), linear-gradient(145deg, rgba(40, 30, 20, 0.97), rgba(14, 10, 7, 0.99))",
  rollTooltipBorder: "rgba(176, 143, 76, 0.55)",
  rollTooltipShadow:
    "0 6px 18px rgba(0, 0, 0, 0.8), inset 0 0 12px rgba(0, 0, 0, 0.4), 0 0 6px rgba(176, 143, 76, 0.1)",
};

const PRESET_HOST: ThemeTokens = {
  text: "var(--SmartThemeBodyColor, #dcdcd2)",
  textMuted: "var(--SmartThemeEmColor, rgba(255, 255, 255, 0.72))",
  accent: "var(--SmartThemeQuoteColor, #e18a24)",
  accentContrast: "var(--SmartThemeQuoteTextColor, #ffffff)",
  surface1: "var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96))",
  surface2:
    "color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 88%, #000 12%)",
  surface3:
    "color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 92%, #000 8%)",
  border: "var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5))",
  borderStrong:
    "color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)))",
  focusRing:
    "color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent)",
  panelBg: "var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1))",
  panelBorder: "var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5))",
  panelShadow:
    "0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5))",
  toolbarBg:
    "color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 82%, var(--SmartThemeBodyColor, #dcdcd2) 18%)",
  listItemHoverBg:
    "color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)))",
  listItemActiveBg:
    "color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)))",
  backdrop:
    "color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 85%, #000 15%)",
  backdropFilter: "blur(var(--SmartThemeBlurStrength, 0px))",
  shadow:
    "0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5))",
  rollTooltipText: "#dbd2c2",
  rollTooltipBg:
    "radial-gradient(circle at top, rgba(246, 223, 172, 0.07), transparent 52%), linear-gradient(145deg, rgba(40, 30, 20, 0.97), rgba(14, 10, 7, 0.99))",
  rollTooltipBorder: "rgba(176, 143, 76, 0.55)",
  rollTooltipShadow:
    "0 6px 18px rgba(0, 0, 0, 0.8), inset 0 0 12px rgba(0, 0, 0, 0.4), 0 0 6px rgba(176, 143, 76, 0.1)",
};

const THEME_PRESETS: Record<ThemeId, ThemeTokens> = {
  default: PRESET_DEFAULT,
  dark: PRESET_DARK,
  light: PRESET_LIGHT,
  host: PRESET_HOST,
};

/** 读取指定主题的令牌集，未命中时回退到 `default` */
export function getThemeTokens(themeId: ThemeId): ThemeTokens {
  return THEME_PRESETS[themeId] ?? PRESET_DEFAULT;
}
