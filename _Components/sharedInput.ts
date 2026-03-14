import sharedInputCssText from "./sharedInput.css?inline";

type SharedInputAttributeValue = string | number | boolean | null | undefined;

export type SharedInputTag = "input" | "textarea";
export type SharedInputType = "text" | "number" | "search" | "password";

export interface SharedInputFieldOptions {
  id?: string;
  tag?: SharedInputTag;
  type?: SharedInputType;
  value?: string;
  className?: string;
  attributes?: Record<string, SharedInputAttributeValue>;
  disabled?: boolean;
  readOnly?: boolean;
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
function buildAttributes(attributes?: Record<string, SharedInputAttributeValue>): string {
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
 * 功能：根据标签和类型解析基础类名。
 * @param tag 目标标签
 * @param type 输入类型
 * @returns 对应的业务基础类名
 */
function resolveBaseClassName(tag: SharedInputTag, type: SharedInputType): string {
  if (tag === "textarea") return "st-roll-textarea";
  if (type === "search") return "st-roll-search";
  return "st-roll-input";
}

/**
 * 功能：构建共享输入组件 HTML。
 * @param options 输入组件配置
 * @returns 输入组件 HTML 字符串
 */
export function buildSharedInputField(options: SharedInputFieldOptions): string {
  const tag: SharedInputTag = options.tag ?? "input";
  const type: SharedInputType = options.type ?? "text";
  const className = joinClassNames(resolveBaseClassName(tag, type), "stx-shared-input", options.className);
  const idAttr = options.id ? ` id="${escapeAttr(options.id)}"` : "";
  const disabledAttr = options.disabled ? " disabled" : "";
  const readOnlyAttr = options.readOnly ? " readonly" : "";
  const attributes = buildAttributes(options.attributes);

  if (tag === "textarea") {
    return `<textarea${idAttr} class="${escapeAttr(className)}" data-ui="shared-input" data-tooltip-anchor="shared-input-control"${disabledAttr}${readOnlyAttr}${attributes}>${escapeHtml(String(options.value ?? ""))}</textarea>`;
  }

  const valueAttr = ` value="${escapeAttr(String(options.value ?? ""))}"`;
  return `<input${idAttr} type="${escapeAttr(type)}" class="${escapeAttr(className)}" data-ui="shared-input" data-tooltip-anchor="shared-input-control"${valueAttr}${disabledAttr}${readOnlyAttr}${attributes} />`;
}

/**
 * 功能：构建共享输入组件作用域样式文本。
 * @param scopeSelector 作用域选择器
 * @returns 替换作用域后的样式文本
 */
export function buildSharedInputStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return sharedInputCssText.split("_SCOPE_").join(scope);
}

