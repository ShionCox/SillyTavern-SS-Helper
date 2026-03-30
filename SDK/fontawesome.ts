import fontAwesomeCssText from "../assets/fontawesome/fontawesome.css?raw";
import brandsCssText from "../assets/fontawesome/brands.css?raw";
import regularCssText from "../assets/fontawesome/regular.css?raw";
import solidCssText from "../assets/fontawesome/solid.css?raw";
import lightCssText from "../assets/fontawesome/light.css?raw";
import sharpSolidCssText from "../assets/fontawesome/sharp-solid.css?raw";
import sharpRegularCssText from "../assets/fontawesome/sharp-regular.css?raw";
import sharpLightCssText from "../assets/fontawesome/sharp-light.css?raw";
import duotoneCssText from "../assets/fontawesome/duotone.css?raw";
import sharpDuotoneSolidCssText from "../assets/fontawesome/sharp-duotone-solid.css?raw";
import chiselRegularCssText from "../assets/fontawesome/chisel-regular.css?raw";
import etchSolidCssText from "../assets/fontawesome/etch-solid.css?raw";
import graphiteThinCssText from "../assets/fontawesome/graphite-thin.css?raw";
import jellyRegularCssText from "../assets/fontawesome/jelly-regular.css?raw";
import notdogSolidCssText from "../assets/fontawesome/notdog-solid.css?raw";
import slabRegularCssText from "../assets/fontawesome/slab-regular.css?raw";
import thumbprintLightCssText from "../assets/fontawesome/thumbprint-light.css?raw";
import utilitySemiboldCssText from "../assets/fontawesome/utility-semibold.css?raw";
import whiteboardSemiboldCssText from "../assets/fontawesome/whiteboard-semibold.css?raw";

const FONT_AWESOME_STYLE_ID = "stx-fontawesome-runtime-style";

const fontAwesomeCssTexts: string[] = [
  fontAwesomeCssText,
  brandsCssText,
  regularCssText,
  solidCssText,
  lightCssText,
  sharpSolidCssText,
  sharpRegularCssText,
  sharpLightCssText,
  duotoneCssText,
  sharpDuotoneSolidCssText,
  chiselRegularCssText,
  etchSolidCssText,
  graphiteThinCssText,
  jellyRegularCssText,
  notdogSolidCssText,
  slabRegularCssText,
  thumbprintLightCssText,
  utilitySemiboldCssText,
  whiteboardSemiboldCssText,
];

const fontAwesomeFontUrlModules = import.meta.glob<string>("../assets/fontawesome/webfonts/*.woff2", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * 功能：将字体资源模块映射为文件名到最终 URL 的字典。
 * @returns 字体文件名到运行时 URL 的映射
 */
function buildFontUrlMap(): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(fontAwesomeFontUrlModules).forEach(([modulePath, assetUrl]): void => {
    const normalizedPath = String(modulePath ?? "").replace(/\\/g, "/");
    const fileName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    if (fileName) {
      result[fileName] = String(assetUrl ?? "");
    }
  });
  return result;
}

const fontAwesomeFontUrlMap: Record<string, string> = buildFontUrlMap();

/**
 * 功能：将原始 Font Awesome 样式中的相对字体路径改写为打包后的真实资源地址。
 * @param cssText 原始样式文本
 * @returns 已重写资源路径的样式文本
 */
function rewriteFontAwesomeCss(cssText: string): string {
  return String(cssText ?? "").replace(/\.\.\/webfonts\/([^)"'\s]+\.woff2)/g, (_match: string, fileName: string): string => {
    return fontAwesomeFontUrlMap[fileName] || `../webfonts/${fileName}`;
  });
}

/**
 * 功能：构建最终注入页面的 Font Awesome 全量样式文本。
 * @returns 已重写字体路径的样式文本
 */
function buildFontAwesomeRuntimeCss(): string {
  return fontAwesomeCssTexts
    .map((cssText: string): string => rewriteFontAwesomeCss(cssText))
    .join("\n");
}

/**
 * 功能：确保页面中存在用于挂载 Font Awesome 的单例样式节点。
 * @param doc 目标文档对象
 * @returns 单例样式节点
 */
function ensureFontAwesomeStyleElement(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(FONT_AWESOME_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }

  const style = doc.createElement("style");
  style.id = FONT_AWESOME_STYLE_ID;
  style.setAttribute("data-stx-runtime-style", "fontawesome");
  doc.head.appendChild(style);
  return style;
}

/**
 * 功能：确保全局只挂载一份已重写字体路径的 Font Awesome 样式。
 * @param doc 目标文档对象，默认使用当前页面文档
 * @returns 样式节点；无文档环境时返回 null
 */
export function ensureFontAwesomeRuntimeStyles(doc?: Document): HTMLStyleElement | null {
  const targetDocument = doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDocument?.head) {
    return null;
  }

  const style = ensureFontAwesomeStyleElement(targetDocument);
  const nextCssText = buildFontAwesomeRuntimeCss();
  if (style.textContent !== nextCssText) {
    style.textContent = nextCssText;
  }
  return style;
}
