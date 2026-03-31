const FONT_AWESOME_LINK_ATTRIBUTE = "data-stx-fontawesome-runtime";

const FONT_AWESOME_CSS_FILES: string[] = [
  "fontawesome.css",
  "brands.css",
  "regular.css",
  "solid.css",
  "light.css",
  "sharp-solid.css",
  "sharp-regular.css",
  "sharp-light.css",
  "duotone.css",
  "sharp-duotone-solid.css",
  "chisel-regular.css",
  "etch-solid.css",
  "graphite-thin.css",
  "jelly-regular.css",
  "notdog-solid.css",
  "slab-regular.css",
  "thumbprint-light.css",
  "utility-semibold.css",
  "whiteboard-semibold.css",
];

/**
 * 功能：根据当前运行模块地址，解析 Font Awesome 资源目录的基础地址。
 * @returns 指向 `assets/fontawesome` 的基础 URL
 */
function resolveFontAwesomeBaseUrl(): URL {
  return new URL(/* @vite-ignore */ "../assets/fontawesome/", import.meta.url);
}

/**
 * 功能：构建某个 Font Awesome CSS 文件在运行时的绝对资源地址。
 * @param fileName Font Awesome CSS 文件名
 * @returns 可直接挂载到 link 标签的样式地址
 */
function resolveFontAwesomeCssHref(fileName: string): string {
  return new URL(fileName, resolveFontAwesomeBaseUrl()).href;
}

/**
 * 功能：查找页面中已存在的 Font Awesome 运行时样式链接。
 * @param doc 目标文档对象
 * @returns 已存在的链接元素列表
 */
function findExistingFontAwesomeLinks(doc: Document): HTMLLinkElement[] {
  return Array.from(
    doc.head.querySelectorAll(`link[rel="stylesheet"][${FONT_AWESOME_LINK_ATTRIBUTE}="true"]`)
  ).filter((node): node is HTMLLinkElement => node instanceof HTMLLinkElement);
}

/**
 * 功能：创建单个 Font Awesome 样式链接节点。
 * @param doc 目标文档对象
 * @param fileName Font Awesome CSS 文件名
 * @returns 已配置完成的链接元素
 */
function createFontAwesomeLinkElement(doc: Document, fileName: string): HTMLLinkElement {
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = resolveFontAwesomeCssHref(fileName);
  link.setAttribute(FONT_AWESOME_LINK_ATTRIBUTE, "true");
  link.setAttribute("data-stx-fontawesome-file", fileName);
  return link;
}

/**
 * 功能：确保页面中按顺序挂载完整的 Font Awesome 外链样式文件。
 * @param doc 目标文档对象，默认使用当前页面文档
 * @returns 当前页面中的 Font Awesome 样式链接列表；无文档环境时返回 null
 */
export function ensureFontAwesomeRuntimeStyles(doc?: Document): HTMLLinkElement[] | null {
  const targetDocument = doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDocument?.head) {
    return null;
  }

  const existingLinks = findExistingFontAwesomeLinks(targetDocument);
  const existingFileNames = new Set(
    existingLinks.map((link) => String(link.getAttribute("data-stx-fontawesome-file") ?? ""))
  );

  FONT_AWESOME_CSS_FILES.forEach((fileName: string): void => {
    if (existingFileNames.has(fileName)) {
      return;
    }

    targetDocument.head.appendChild(createFontAwesomeLinkElement(targetDocument, fileName));
  });

  return findExistingFontAwesomeLinks(targetDocument);
}
