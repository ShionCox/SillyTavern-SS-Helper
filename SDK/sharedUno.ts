const SHARED_UNO_STYLE_ID = "stx-shared-uno-style";

// @ts-expect-error Vite 会将 `?inline` 的 CSS 作为字符串模块处理
import unoCssText from "./uno.entry.css?inline";

/**
 * 功能：确保全局仅注入一份 UnoCSS 样式，支持多插件任意加载顺序。
 * 参数：无。
 * 返回：无。
 */
export function ensureSharedUnoStyles(): void {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(SHARED_UNO_STYLE_ID)) {
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = SHARED_UNO_STYLE_ID;
  styleEl.textContent = String(unoCssText || "");
  document.head.appendChild(styleEl);
}




