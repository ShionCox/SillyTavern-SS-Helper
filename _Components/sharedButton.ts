import sharedButtonCssText from "./sharedButton.css?inline";

type SharedButtonAttributeValue = string | number | boolean | null | undefined;

export type SharedButtonVariant = "primary" | "secondary" | "danger";

export interface SharedButtonOptions {
  id?: string;
  label: string;
  type?: "button" | "submit" | "reset";
  variant?: SharedButtonVariant;
  iconClassName?: string;
  iconPosition?: "start" | "end";
  className?: string;
  attributes?: Record<string, SharedButtonAttributeValue>;
  disabled?: boolean;
}

/**
 * 功能：转义 HTML 文本，避免模板注入。
 * @param input 原始文本
 * @returns 转义后的安全文本
 */
function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 功能：转义 HTML 属性文本。
 * @param input 原始属性值
 * @returns 转义后的属性值
 */
function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

/**
 * 功能：拼接类名字符串。
 * @param parts 候选类名列表
 * @returns 过滤空值后的类名字符串
 */
function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * 功能：把属性对象序列化成 HTML 属性片段。
 * @param attributes 属性对象
 * @returns 可直接拼接到标签上的属性字符串
 */
function buildAttributes(attributes?: Record<string, SharedButtonAttributeValue>): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (value == null || value === false) return [];
      if (value === true) return [` ${key}`];
      return [` ${key}="${escapeAttr(String(value))}"`];
    })
    .join("");
}

/**
 * 功能：根据按钮变体生成类名片段。
 * @param variant 按钮变体
 * @returns 变体对应的类名片段
 */
function buildVariantClassName(variant: SharedButtonVariant): string {
  if (variant === "secondary") return "secondary is-secondary";
  if (variant === "danger") return "danger is-danger";
  return "primary is-primary";
}

/**
 * 功能：构建按钮图标节点。
 * @param iconClassName 图标类名
 * @returns 图标 HTML；未传入时返回空字符串
 */
function buildIconMarkup(iconClassName?: string): string {
  if (!iconClassName) return "";
  return `<span class="stx-shared-button-icon" aria-hidden="true"><i class="${escapeAttr(iconClassName)}"></i></span>`;
}

/**
 * 功能：构建按钮内部内容。
 * @param options 按钮配置
 * @returns 按钮内部 HTML
 */
function buildButtonInnerMarkup(options: SharedButtonOptions): string {
  const iconMarkup = buildIconMarkup(options.iconClassName);
  const labelMarkup = `<span class="stx-shared-button-label">${escapeHtml(options.label)}</span>`;
  const iconPosition = options.iconPosition ?? "start";

  if (!iconMarkup) return labelMarkup;
  if (iconPosition === "end") {
    return `${labelMarkup}${iconMarkup}`;
  }
  return `${iconMarkup}${labelMarkup}`;
}

/**
 * 功能：构建共享按钮 HTML。
 * @param options 按钮配置
 * @returns 按钮 HTML 字符串
 */
export function buildSharedButton(options: SharedButtonOptions): string {
  const variant = options.variant ?? "primary";
  const className = joinClassNames(
    "st-roll-btn",
    "stx-shared-button",
    buildVariantClassName(variant),
    options.className
  );
  const attributes = buildAttributes(options.attributes);
  const disabledAttr = options.disabled ? " disabled" : "";
  const idAttr = options.id ? ` id="${escapeAttr(options.id)}"` : "";
  const buttonType = escapeAttr(options.type ?? "button");

  return `<button${idAttr} type="${buttonType}" class="${escapeAttr(className)}" data-ui="shared-button" data-tooltip-anchor="shared-button-control"${disabledAttr}${attributes}>${buildButtonInnerMarkup(options)}</button>`;
}

/**
 * 功能：构建共享按钮作用域样式文本。
 * @param scopeSelector 作用域选择器
 * @returns 替换作用域后的样式文本
 */
export function buildSharedButtonStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return sharedButtonCssText.replaceAll("_SCOPE_", scope);
}
