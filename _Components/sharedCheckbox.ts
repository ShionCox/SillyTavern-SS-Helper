import { ensureSharedUnoStyles } from "../SDK/sharedUno";

type SharedCheckboxAttributeValue = string | number | boolean | null | undefined;

export interface SharedCheckboxRenderOptions {
  id?: string;
  className?: string;
  checked?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  dataTip?: string;
  attributes?: Record<string, SharedCheckboxAttributeValue>;
}

export interface SharedCheckboxWithLabelOptions extends SharedCheckboxRenderOptions {
  label: string;
  labelClassName?: string;
  textClassName?: string;
}

const SHELL_CLASS =
  "stx-shared-checkbox-shell relative inline-flex h-4 w-4 shrink-0 align-middle";
const BOX_CLASS =
  "stx-shared-checkbox-box pointer-events-none inline-flex h-4 w-4 items-center justify-center rounded border border-[#c5a05999] bg-black/35 transition-[background-color,border-color,box-shadow,filter] duration-200 peer-hover:border-[#c5a059cc] peer-hover:shadow-[0_0_0_1px_rgba(197,160,89,0.2)] peer-focus-visible:shadow-[0_0_0_1px_rgba(197,160,89,0.4),0_0_0_3px_rgba(197,160,89,0.18)] peer-checked:border-[#c5a059] peer-checked:bg-[#c5a059] peer-checked:shadow-[0_0_0_1px_rgba(197,160,89,0.26)] peer-disabled:opacity-50 peer-disabled:grayscale-[0.45]";
const ICON_CLASS =
  "stx-shared-checkbox-check h-3 w-3 text-[#111111] opacity-0 translate-y-1.5 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,0.73,0.15,1)] will-change-transform peer-checked:opacity-100 peer-checked:translate-y-0";
const LABEL_BASE_CLASS = "stx-shared-checkbox-label inline-flex items-center gap-2";
const INPUT_BASE_CLASSES: string[] = [
  "stx-shared-checkbox",
  "stx-shared-checkbox-native",
  "peer",
  "sr-only",
  "absolute",
  "inset-0",
  "h-full",
  "w-full",
  "m-0",
  "cursor-pointer",
  "appearance-none",
  "accent-transparent",
  "disabled:cursor-not-allowed",
];

/**
 * 功能：转义 HTML 属性值，避免模板拼接破坏结构。
 * @param value 原始属性值
 * @returns 转义后的属性文本
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 功能：合并 class 字符串并去重。
 * @param base 基础 class 列表
 * @param extra 额外 class 文本
 * @returns 合并后的 class 文本
 */
function mergeClassNames(base: string[], extra?: string): string {
  const classSet = new Set<string>();
  base.forEach((item: string) => {
    const normalized = String(item || "").trim();
    if (normalized) classSet.add(normalized);
  });
  String(extra || "")
    .split(/\s+/)
    .map((item: string) => item.trim())
    .filter(Boolean)
    .forEach((item: string) => classSet.add(item));
  return Array.from(classSet).join(" ");
}

/**
 * 功能：构建附加属性字符串。
 * @param attributes 属性键值对
 * @returns 可直接拼接的属性文本
 */
function buildAdditionalAttributes(
  attributes?: Record<string, SharedCheckboxAttributeValue>
): string {
  if (!attributes) return "";
  const parts: string[] = [];
  Object.entries(attributes).forEach(([key, rawValue]: [string, SharedCheckboxAttributeValue]) => {
    const attrName = String(key || "").trim();
    if (!attrName || rawValue == null || rawValue === false) return;
    if (rawValue === true) {
      parts.push(attrName);
      return;
    }
    parts.push(`${attrName}="${escapeAttribute(String(rawValue))}"`);
  });
  return parts.join(" ");
}

/**
 * 功能：构建复选框输入节点属性文本。
 * @param options 渲染参数
 * @returns 属性字符串
 */
function buildInputAttributes(options: SharedCheckboxRenderOptions): string {
  const attrs: string[] = ['type="checkbox"'];
  attrs.push(
    `class="${escapeAttribute(mergeClassNames(INPUT_BASE_CLASSES, options.className))}"`
  );
  if (options.id) attrs.push(`id="${escapeAttribute(options.id)}"`);
  if (options.checked) attrs.push("checked");
  if (options.disabled) attrs.push("disabled");
  if (options.ariaLabel) attrs.push(`aria-label="${escapeAttribute(options.ariaLabel)}"`);
  if (options.title) attrs.push(`title="${escapeAttribute(options.title)}"`);
  if (options.dataTip) attrs.push(`data-tip="${escapeAttribute(options.dataTip)}"`);
  const extra = buildAdditionalAttributes(options.attributes);
  if (extra) attrs.push(extra);
  return attrs.join(" ");
}

/**
 * 功能：返回勾选图标 SVG（由 Tailwind class 控制状态）。
 * @returns 图标 HTML
 */
function buildCheckIconSvgHtml(): string {
  return `<svg class="${ICON_CLASS}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2l2.7 2.8L13 3.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

/**
 * 功能：渲染通用复选框（纯 Tailwind class 方案）。
 * @param options 渲染参数
 * @returns 复选框 HTML 字符串
 */
export function renderSharedCheckbox(options: SharedCheckboxRenderOptions = {}): string {
  return `
    <span class="${SHELL_CLASS}">
      <input ${buildInputAttributes(options)} />
      <span class="${BOX_CLASS}">
        ${buildCheckIconSvgHtml()}
      </span>
    </span>
  `;
}

/**
 * 功能：渲染带文本标签的通用复选框。
 * @param options 渲染参数
 * @returns 标签包裹后的复选框 HTML
 */
export function renderSharedCheckboxWithLabel(options: SharedCheckboxWithLabelOptions): string {
  const labelClass = mergeClassNames([LABEL_BASE_CLASS], options.labelClassName);
  const textClass = String(options.textClassName || "").trim();
  const labelText = textClass
    ? `<span class="${escapeAttribute(textClass)}">${escapeAttribute(options.label)}</span>`
    : `<span>${escapeAttribute(options.label)}</span>`;
  return `<label class="${escapeAttribute(labelClass)}">${renderSharedCheckbox(options)}${labelText}</label>`;
}

/**
 * 功能：确保 Tailwind 公共样式已注入（保持旧函数名兼容）。
 * 参数：
 *   无
 * 返回：
 *   无
 */
export function ensureSharedCheckboxStyles(): void {
  ensureSharedUnoStyles();
}

/**
 * 功能：创建复选框可视容器节点。
 * 参数：
 *   无
 * 返回：
 *   容器节点
 */
function createCheckboxBoxElement(): HTMLSpanElement {
  const box = document.createElement("span");
  box.className = BOX_CLASS;
  box.innerHTML = buildCheckIconSvgHtml();
  return box;
}

/**
 * 功能：为已存在壳节点补齐 Tailwind class 和图标结构。
 * @param shell 壳节点
 * @returns 无
 */
function patchExistingShell(shell: HTMLElement): void {
  shell.className = SHELL_CLASS;
  const box = shell.querySelector<HTMLElement>(".stx-shared-checkbox-box");
  if (!box) return;
  box.className = BOX_CLASS;
  const icon = box.querySelector<Element>(".stx-shared-checkbox-check");
  if (icon) {
    icon.setAttribute("class", ICON_CLASS);
  } else {
    box.innerHTML = buildCheckIconSvgHtml();
  }
}

/**
 * 功能：把根节点下原生复选框统一升级为共享组件结构。
 * @param root 根节点
 * @returns 本次新挂载数量
 */
export function hydrateSharedCheckboxes(root: ParentNode = document): number {
  ensureSharedCheckboxStyles();
  const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  let assigned = 0;
  checkboxes.forEach((checkbox: HTMLInputElement) => {
    const shell = checkbox.closest<HTMLElement>(".stx-shared-checkbox-shell");
    checkbox.className = mergeClassNames(INPUT_BASE_CLASSES, checkbox.className);
    if (shell) {
      patchExistingShell(shell);
      return;
    }

    const parent = checkbox.parentNode;
    if (!parent) return;
    const nextShell = document.createElement("span");
    nextShell.className = SHELL_CLASS;
    const box = createCheckboxBoxElement();
    parent.insertBefore(nextShell, checkbox);
    nextShell.appendChild(checkbox);
    nextShell.appendChild(box);
    assigned += 1;
  });
  return assigned;
}


