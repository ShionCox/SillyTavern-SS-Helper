/**
 * 通用主题系统 —— 宿主主题桥接适配器。
 * 检测宿主 CSS 变量（如 SillyTavern 的 --SmartTheme* 系列）是否可用，
 * 当不可用时回退到 `default` 预设。
 */

import type { ThemeHostAdapter } from "../types";

const HOST_PROBE_VAR = "--SmartThemeBodyColor";

export function createHostAdapter(): ThemeHostAdapter {
  return {
    isAvailable(): boolean {
      try {
        const val = getComputedStyle(document.documentElement)
          .getPropertyValue(HOST_PROBE_VAR)
          .trim();
        return val.length > 0;
      } catch {
        return false;
      }
    },
  };
}
