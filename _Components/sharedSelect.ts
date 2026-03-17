import sharedSelectCssText from "./sharedSelect.css?inline";
import { mountThemeHost, subscribeTheme } from "../SDK/theme";
import { SHARED_DIALOG_ROOT_SELECTOR } from "./sharedDialog";

type SharedSelectAttributeValue = string | number | boolean | null | undefined;

export interface SharedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  media?: SharedSelectOptionMedia;
  attributes?: Record<string, SharedSelectAttributeValue>;
}

export interface SharedSelectOptionMedia {
  type: "image" | "icon";
  src?: string;
  iconClassName?: string;
  alt?: string;
}

export interface SharedSelectFieldOptions {
  id: string;
  value?: string;
  containerClassName?: string;
  selectClassName?: string;
  triggerClassName?: string;
  labelClassName?: string;
  listClassName?: string;
  optionClassName?: string;
  attributes?: Record<string, SharedSelectAttributeValue>;
  selectAttributes?: Record<string, SharedSelectAttributeValue>;
  triggerAttributes?: Record<string, SharedSelectAttributeValue>;
  options: SharedSelectOption[];
}

interface SharedSelectRefs {
  root: HTMLElement;
  select: HTMLSelectElement;
  trigger: HTMLButtonElement;
  triggerCopy: HTMLElement;
  list: HTMLElement;
}

let OPEN_SHARED_SELECT_REFS: SharedSelectRefs | null = null;
let SHARED_SELECT_GLOBAL_EVENTS_BOUND = false;
let SHARED_SELECT_REPOSITION_FRAME = 0;
let SHARED_SELECT_THEME_FRAME = 0;
let SHARED_SELECT_OPEN_OBSERVER: MutationObserver | null = null;

function traceSharedSelect(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`[SS-Helper][SharedSelectTrace] ${message}`);
    return;
  }
  console.info(`[SS-Helper][SharedSelectTrace] ${message}`, payload);
}

/**
 * 功能：阻止共享选择框事件继续冒泡到宿主页面。
 * @param event 当前交互事件
 * @returns 无返回值
 */
function stopSharedSelectEventPropagation(event: Event): void {
  event.stopPropagation();
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
 * 功能：把属性对象序列化为 HTML 属性片段。
 * @param attributes 属性对象
 * @returns 可直接拼接到标签上的属性字符串
 */
function buildAttributes(attributes?: Record<string, SharedSelectAttributeValue>): string {
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
 * 功能：为共享选择框生成稳定的内部节点 ID。
 * @param baseId 原始选择框 ID
 * @param suffix 内部节点后缀
 * @returns 拼接后的节点 ID
 */
function buildSharedSelectNodeId(baseId: string, suffix: string): string {
  return `${baseId}__${suffix}`;
}

/**
 * 功能：为选项媒体信息构建 data 属性。
 * @param media 选项媒体配置。
 * @returns 可拼接到原生 option 上的属性字符串。
 */
function buildSharedSelectMediaAttributes(media?: SharedSelectOptionMedia): string {
  if (!media) return "";
  const attributes: Record<string, SharedSelectAttributeValue> = {
    "data-media-type": media.type,
  };
  if (media.type === "image") {
    attributes["data-media-src"] = media.src ?? "";
    attributes["data-media-alt"] = media.alt ?? "";
  }
  if (media.type === "icon") {
    attributes["data-media-icon"] = media.iconClassName ?? "";
  }
  return buildAttributes(attributes);
}

/**
 * 功能：把原生 option 上的媒体 data 属性解析为媒体配置。
 * @param option 原生 option 元素。
 * @returns 解析后的媒体配置；无媒体时返回空值。
 */
function readSharedSelectMediaFromOption(option: HTMLOptionElement | null): SharedSelectOptionMedia | null {
  if (!option) return null;
  const mediaType = String(option.dataset.mediaType ?? "").trim();
  if (mediaType === "image") {
    const src = String(option.dataset.mediaSrc ?? "").trim();
    if (!src) return null;
    return {
      type: "image",
      src,
      alt: String(option.dataset.mediaAlt ?? "").trim(),
    };
  }
  if (mediaType === "icon") {
    const iconClassName = String(option.dataset.mediaIcon ?? "").trim();
    if (!iconClassName) return null;
    return {
      type: "icon",
      iconClassName,
    };
  }
  return null;
}

/**
 * 功能：渲染选项媒体节点 HTML。
 * @param media 媒体配置。
 * @returns 媒体节点 HTML；无媒体时返回空字符串。
 */
function renderSharedSelectMediaMarkup(media?: SharedSelectOptionMedia | null): string {
  if (!media) return "";
  if (media.type === "image" && media.src) {
    const alt = escapeAttr(media.alt ?? "");
    return `<span class="stx-shared-select-media is-image" aria-hidden="true"><img class="stx-shared-select-media-image" src="${escapeAttr(media.src)}" alt="${alt}" /></span>`;
  }
  if (media.type === "icon" && media.iconClassName) {
    return `<span class="stx-shared-select-media is-icon" aria-hidden="true"><i class="${escapeAttr(media.iconClassName)}"></i></span>`;
  }
  return "";
}

/**
 * 功能：渲染触发器或列表项中的主要文案区域。
 * @param label 选项文本。
 * @param media 媒体配置。
 * @returns 组合后的内容 HTML。
 */
function renderSharedSelectMainMarkup(label: string, media?: SharedSelectOptionMedia | null): string {
  return `
    <span class="stx-shared-select-main">
      ${renderSharedSelectMediaMarkup(media)}
      <span class="stx-shared-select-label">${escapeHtml(label)}</span>
    </span>
  `.trim();
}

/**
 * 功能：构建共享选择框 HTML。
 * @param options 组件配置
 * @returns 组件 HTML 字符串
 */
export function buildSharedSelectField(options: SharedSelectFieldOptions): string {
  const selectedValue = String(options.value ?? "");
  const matchedOption = options.options.find((item) => String(item.value) === selectedValue);
  const buttonLabel = matchedOption?.label ?? options.options[0]?.label ?? "";
  const buttonMedia = matchedOption?.media ?? options.options[0]?.media ?? null;
  const triggerId = buildSharedSelectNodeId(options.id, "trigger");
  const listId = buildSharedSelectNodeId(options.id, "listbox");

  return `
    <div
      class="${escapeAttr(joinClassNames("stx-shared-select", options.containerClassName))}"
      data-ui="shared-select"${buildAttributes(options.attributes)}
    >
      <select
        id="${escapeAttr(options.id)}"
        class="${escapeAttr(joinClassNames("st-roll-select", "stx-shared-select-native", options.selectClassName))}"
        tabindex="-1"
        aria-hidden="true"${buildAttributes(options.selectAttributes)}
      >
        ${options.options
          .map((item, index) => {
            const optionValue = String(item.value ?? "");
            const isSelected =
              optionValue === selectedValue ||
              (!matchedOption && !selectedValue && index === 0);
            return `<option value="${escapeAttr(optionValue)}"${item.disabled ? " disabled" : ""}${isSelected ? " selected" : ""}${buildSharedSelectMediaAttributes(item.media)}${buildAttributes(item.attributes)}>${escapeHtml(item.label)}</option>`;
          })
          .join("")}
      </select>
      <button
        id="${escapeAttr(triggerId)}"
        type="button"
        class="${escapeAttr(joinClassNames("stx-shared-select-trigger", options.triggerClassName))}"
        data-tooltip-anchor="shared-select-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="${escapeAttr(listId)}"${buildAttributes(options.triggerAttributes)}
      >
        <span class="${escapeAttr(joinClassNames("stx-shared-select-trigger-copy", options.labelClassName))}">${renderSharedSelectMainMarkup(buttonLabel, buttonMedia)}</span>
        <span class="stx-shared-select-indicator" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      </button>
      <div
        id="${escapeAttr(listId)}"
        class="${escapeAttr(joinClassNames("stx-shared-select-list", options.listClassName))}"
        role="listbox"
        aria-labelledby="${escapeAttr(triggerId)}"
        hidden
      >
        ${options.options
          .map((item, index) => {
            const optionValue = String(item.value ?? "");
            return `
          <div
            class="${escapeAttr(joinClassNames("stx-shared-select-option", options.optionClassName))}"
            role="option"
            aria-selected="false"
            data-shared-select-option-index="${index}"
            data-shared-select-option-value="${escapeAttr(optionValue)}"
            data-shared-select-disabled="${item.disabled ? "true" : "false"}"
          >
            ${renderSharedSelectMainMarkup(item.label, item.media)}
            <span class="stx-shared-select-option-mark" aria-hidden="true"></span>
          </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

/**
 * 功能：根据原生选项生成共享下拉面板项的 HTML。
 * @param select 原生下拉框元素
 * @returns 共享下拉面板项 HTML 字符串
 */
function buildSharedSelectListMarkup(select: HTMLSelectElement): string {
  return Array.from(select.options)
    .map((item: HTMLOptionElement, index: number) => {
      const optionValue = String(item.value ?? "");
      const media = readSharedSelectMediaFromOption(item);
      return `
          <div
            class="stx-shared-select-option"
            role="option"
            aria-selected="false"
            data-shared-select-option-index="${index}"
            data-shared-select-option-value="${escapeAttr(optionValue)}"
            data-shared-select-disabled="${item.disabled ? "true" : "false"}"
          >
            ${renderSharedSelectMainMarkup(item.textContent?.trim() || "", media)}
            <span class="stx-shared-select-option-mark" aria-hidden="true"></span>
          </div>`;
    })
    .join("");
}

/**
 * 功能：构建共享选择框作用域样式文本。
 * @param scopeSelector 作用域选择器
 * @returns 替换作用域后的样式文本
 */
export function buildSharedSelectStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return sharedSelectCssText.split("_SCOPE_").join(scope);
}

/**
 * 功能：为指定组件解析当前应使用的下拉面板节点。
 * @param root 组件根节点。
 * @param listId 触发器声明的面板节点 ID。
 * @param inlineList 根节点内原始的面板节点。
 * @returns 当前实例实际应使用的面板节点；未命中时返回 null。
 */
function resolveSharedSelectList(
  root: HTMLElement,
  listId: string,
  inlineList: HTMLElement | null,
): HTMLElement | null {
  if (OPEN_SHARED_SELECT_REFS?.root === root) {
    return OPEN_SHARED_SELECT_REFS.list;
  }
  if (inlineList && (!listId || inlineList.id === listId)) {
    return inlineList;
  }
  if (!listId) {
    return inlineList;
  }
  const controlledList = document.getElementById(listId);
  return controlledList instanceof HTMLElement ? controlledList : inlineList;
}

/**
 * 功能：读取组件运行时节点引用。
 * @param root 组件根节点
 * @returns 运行时节点集合；缺少关键节点时返回 null
 */
function getSharedSelectRefs(root: HTMLElement): SharedSelectRefs | null {
  const select = root.querySelector<HTMLSelectElement>("select.stx-shared-select-native");
  const trigger = root.querySelector<HTMLButtonElement>("button.stx-shared-select-trigger");
  const triggerCopy = root.querySelector<HTMLElement>(".stx-shared-select-trigger-copy");
  const listId = String(trigger?.getAttribute("aria-controls") ?? "").trim();
  const inlineList = root.querySelector<HTMLElement>(".stx-shared-select-list");
  const list = resolveSharedSelectList(root, listId, inlineList);
  if (!select || !trigger || !triggerCopy || !list) return null;
  return { root, select, trigger, triggerCopy, list };
}

/**
 * 功能：实时读取当前面板内的选项节点列表。
 * @param refs 组件运行时节点集合。
 * @returns 当前面板中的选项节点数组。
 */
function getSharedSelectOptions(refs: SharedSelectRefs): HTMLElement[] {
  return Array.from(refs.list.querySelectorAll<HTMLElement>(".stx-shared-select-option"));
}

/**
 * 功能：读取当前已选项索引。
 * @param refs 运行时节点集合
 * @returns 已选项索引；无匹配时返回 -1
 */
function getSelectedOptionIndex(refs: SharedSelectRefs): number {
  const selectedIndex = refs.select.selectedIndex;
  const options = getSharedSelectOptions(refs);
  if (selectedIndex >= 0 && selectedIndex < options.length) return selectedIndex;
  return options.findIndex((item) => item.dataset.sharedSelectOptionValue === refs.select.value);
}

/**
 * 功能：读取当前高亮项索引。
 * @param root 组件根节点
 * @returns 高亮项索引；未设置时返回 -1
 */
function getHighlightIndex(root: HTMLElement): number {
  const raw = Number(root.dataset.sharedSelectHighlightIndex ?? "");
  return Number.isFinite(raw) ? Math.floor(raw) : -1;
}

/**
 * 功能：把索引滚动到可视区域。
 * @param refs 运行时节点集合
 * @param index 目标索引
 * @returns 无返回值
 */
function scrollOptionIntoView(refs: SharedSelectRefs, index: number): void {
  const option = getSharedSelectOptions(refs)[index];
  if (!option) return;
  const listRect = refs.list.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  if (optionRect.top < listRect.top) {
    refs.list.scrollTop -= listRect.top - optionRect.top;
    return;
  }
  if (optionRect.bottom > listRect.bottom) {
    refs.list.scrollTop += optionRect.bottom - listRect.bottom;
  }
}

/**
 * 功能：设置当前高亮项。
 * @param refs 运行时节点集合
 * @param index 目标索引
 * @param ensureVisible 是否滚动到可视区域
 * @returns 无返回值
 */
function setHighlightIndex(refs: SharedSelectRefs, index: number, ensureVisible: boolean): void {
  const currentIndex = getHighlightIndex(refs.root);
  if (currentIndex === index) {
    if (ensureVisible && index >= 0) {
      scrollOptionIntoView(refs, index);
    }
    return;
  }
  getSharedSelectOptions(refs).forEach((item, optionIndex) => {
    item.classList.toggle("is-highlighted", optionIndex === index);
  });
  refs.root.dataset.sharedSelectHighlightIndex = String(index);
  if (ensureVisible && index >= 0) {
    scrollOptionIntoView(refs, index);
  }
}

/**
 * 功能：读取可选项索引列表。
 * @param refs 运行时节点集合
 * @returns 未禁用的索引数组
 */
function getEnabledOptionIndexes(refs: SharedSelectRefs): number[] {
  return getSharedSelectOptions(refs)
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.dataset.sharedSelectDisabled !== "true")
    .map(({ index }) => index);
}

/**
 * 功能：根据当前索引和方向寻找下一个可选项。
 * @param refs 运行时节点集合
 * @param currentIndex 当前索引
 * @param step 移动方向
 * @returns 下一个可用索引；无可选项时返回 -1
 */
function findNextEnabledIndex(refs: SharedSelectRefs, currentIndex: number, step: 1 | -1): number {
  const options = getSharedSelectOptions(refs);
  const enabledIndexes = getEnabledOptionIndexes(refs);
  if (!enabledIndexes.length) return -1;
  if (currentIndex < 0) {
    return step > 0 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
  }
  let nextIndex = currentIndex;
  for (let count = 0; count < options.length; count += 1) {
    nextIndex += step;
    if (nextIndex < 0) nextIndex = options.length - 1;
    if (nextIndex >= options.length) nextIndex = 0;
    if (options[nextIndex]?.dataset.sharedSelectDisabled !== "true") {
      return nextIndex;
    }
  }
  return currentIndex;
}

/**
 * 功能：读取首个或末尾可选项索引。
 * @param refs 运行时节点集合
 * @param direction 读取方向
 * @returns 匹配到的索引；无可选项时返回 -1
 */
function getBoundaryEnabledIndex(refs: SharedSelectRefs, direction: "start" | "end"): number {
  const enabledIndexes = getEnabledOptionIndexes(refs);
  if (!enabledIndexes.length) return -1;
  return direction === "start" ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
}

/**
 * 功能：查找会改变 fixed 定位参照系的祖先节点。
 * @param root 共享选择框根节点
 * @returns 命中的祖先节点；未命中时返回 null
 */
function resolveSharedSelectHost(root: HTMLElement): HTMLElement {
  const sharedDialogHost = root.closest<HTMLElement>(SHARED_DIALOG_ROOT_SELECTOR);
  if (sharedDialogHost) {
    return sharedDialogHost;
  }
  const dialogHost =
    root.closest<HTMLDialogElement>("dialog[open]") ||
    document.querySelector<HTMLDialogElement>("dialog[open]");
  return dialogHost || document.body;
}

/**
 * 功能：读取共享选择框面板定位宿主的偏移量。
 * @param root 共享选择框根节点
 * @returns 宿主偏移量
 */
function ensureSharedSelectListHost(refs: SharedSelectRefs): void {
  const host = resolveSharedSelectHost(refs.root);
  if (refs.list.parentElement !== host) {
    host.appendChild(refs.list);
  }
  const isDetached = !refs.root.contains(refs.list);
  refs.list.dataset.sharedSelectDetached = isDetached ? "true" : "false";
}

/**
 * 功能：同步根节点上的主题变量到脱离作用域的下拉面板。
 * @param refs 共享选择框运行时节点引用
 * @returns 无返回值
 */
function syncSharedSelectDetachedThemeVars(refs: SharedSelectRefs): void {
  if (refs.list.dataset.sharedSelectDetached !== "true") return;
  mountThemeHost(refs.list);
}

/**
 * 功能：把当前选择框面板定位到触发器附近。
 * @param refs 运行时节点集合
 * @returns 无返回值
 */
function positionSharedSelectList(refs: SharedSelectRefs): void {
  ensureSharedSelectListHost(refs);
  const triggerRect = refs.trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minWidth = Math.max(triggerRect.width, 160);
  const naturalHeight = refs.list.scrollHeight;
  const desiredHeight = Math.min(Math.max(naturalHeight, 120), 280);
  const spaceBelow = Math.max(0, viewportHeight - triggerRect.bottom - 8);
  const spaceAbove = Math.max(0, triggerRect.top - 8);
  const shouldOpenUpward = spaceBelow < Math.min(desiredHeight, 180) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, shouldOpenUpward ? spaceAbove - 4 : spaceBelow - 4);
  const panelHeight = Math.min(desiredHeight, maxHeight);
  const maxWidth = Math.min(Math.max(minWidth, 180), viewportWidth - 16);
  const nextLeft = Math.min(Math.max(8, triggerRect.left), Math.max(8, viewportWidth - maxWidth - 8));
  const nextTop = shouldOpenUpward
    ? Math.max(8, triggerRect.top - panelHeight - 4)
    : Math.min(viewportHeight - panelHeight - 8, triggerRect.bottom + 4);

  refs.list.style.left = `${Math.round(nextLeft)}px`;
  refs.list.style.top = `${Math.round(nextTop)}px`;
  refs.list.style.minWidth = `${Math.round(minWidth)}px`;
  refs.list.style.maxWidth = `${Math.round(maxWidth)}px`;
  refs.list.style.maxHeight = `${Math.round(Math.max(120, maxHeight))}px`;
  refs.root.dataset.sharedSelectPlacement = shouldOpenUpward ? "top" : "bottom";
}

/**
 * 功能：判断两组运行时引用是否指向同一个选择框实例。
 * @param left 第一组运行时引用。
 * @param right 第二组运行时引用。
 * @returns 是否为同一个实例。
 */
function isSameSharedSelectRefs(
  left: SharedSelectRefs | null,
  right: SharedSelectRefs | null,
): boolean {
  if (!left || !right) return false;
  return (
    left.root === right.root &&
    left.select === right.select &&
    left.trigger === right.trigger &&
    left.triggerCopy === right.triggerCopy &&
    left.list === right.list
  );
}

/**
 * 功能：判断当前打开实例的关键节点是否仍然完整有效。
 * @param refs 组件运行时节点集合。
 * @returns 若关键节点仍与原实例保持连接则返回 true，否则返回 false。
 */
function isSharedSelectRuntimeAlive(refs: SharedSelectRefs): boolean {
  return (
    refs.root.isConnected &&
    refs.select.isConnected &&
    refs.trigger.isConnected &&
    refs.triggerCopy.isConnected &&
    refs.list.isConnected &&
    refs.root.contains(refs.select) &&
    refs.root.contains(refs.trigger) &&
    refs.root.contains(refs.triggerCopy)
  );
}

/**
 * 功能：判断关闭时是否可以把脱离挂载的面板安全归位到原组件。
 * @param refs 组件运行时节点集合。
 * @returns 若可安全归位则返回 true，否则返回 false。
 */
function canRestoreSharedSelectListToRoot(refs: SharedSelectRefs): boolean {
  return (
    refs.root.isConnected &&
    refs.select.isConnected &&
    refs.trigger.isConnected &&
    refs.triggerCopy.isConnected &&
    refs.root.contains(refs.select) &&
    refs.root.contains(refs.trigger) &&
    refs.root.contains(refs.triggerCopy)
  );
}

/**
 * 功能：清理面板定位时写入的内联样式与状态标记。
 * @param refs 组件运行时节点集合。
 * @returns 无返回值。
 */
function resetSharedSelectListLayout(refs: SharedSelectRefs): void {
  refs.list.style.left = "";
  refs.list.style.top = "";
  refs.list.style.minWidth = "";
  refs.list.style.maxWidth = "";
  refs.list.style.maxHeight = "";
  delete refs.root.dataset.sharedSelectPlacement;
}

/**
 * 功能：在关闭时回收脱离挂载的面板节点，避免遗留孤立弹层。
 * @param refs 组件运行时节点集合。
 * @returns 无返回值。
 */
function restoreSharedSelectListHost(refs: SharedSelectRefs): void {
  resetSharedSelectListLayout(refs);
  if (canRestoreSharedSelectListToRoot(refs)) {
    if (refs.list.parentElement !== refs.root) {
      refs.root.appendChild(refs.list);
    }
    refs.list.dataset.sharedSelectDetached = "false";
    return;
  }
  if (refs.list.isConnected) {
    refs.list.remove();
  }
  refs.list.dataset.sharedSelectDetached = "false";
}

/**
 * 功能：清理当前选择框相关的异步重排与主题刷新任务。
 * @returns 无返回值。
 */
function clearSharedSelectScheduledFrames(): void {
  if (SHARED_SELECT_REPOSITION_FRAME) {
    window.cancelAnimationFrame(SHARED_SELECT_REPOSITION_FRAME);
    SHARED_SELECT_REPOSITION_FRAME = 0;
  }
  if (SHARED_SELECT_THEME_FRAME) {
    window.cancelAnimationFrame(SHARED_SELECT_THEME_FRAME);
    SHARED_SELECT_THEME_FRAME = 0;
  }
}

/**
 * 功能：使用已捕获的真实节点关闭指定选择框实例。
 * @param refs 组件运行时节点集合。
 * @param restoreFocus 是否将焦点还给触发器。
 * @returns 无返回值。
 */
function closeSharedSelectWithRefs(refs: SharedSelectRefs | null, restoreFocus: boolean): void {
  if (!refs) return;
  const isCurrentOpen = isSameSharedSelectRefs(OPEN_SHARED_SELECT_REFS, refs);
  refs.root.classList.remove("is-open");
  refs.trigger.setAttribute("aria-expanded", "false");
  refs.list.classList.remove("is-open");
  refs.list.hidden = true;
  refs.root.dataset.sharedSelectHighlightIndex = String(getSelectedOptionIndex(refs));
  restoreSharedSelectListHost(refs);
  if (isCurrentOpen) {
    OPEN_SHARED_SELECT_REFS = null;
    clearSharedSelectScheduledFrames();
  }
  if (restoreFocus && refs.trigger.isConnected) {
    refs.trigger.focus();
  }
}

/**
 * 功能：强制清理当前已打开的选择框实例，避免孤立弹层残留。
 * @param reason 触发强制清理的原因说明。
 * @returns 无返回值。
 */
function forceCleanupOpenSharedSelect(reason: string): void {
  const openRefs = OPEN_SHARED_SELECT_REFS;
  if (!openRefs) return;
  /*
  traceSharedSelect("强制清理已打开的选择框", {
    reason,
    selectId: openRefs.select.id,
    rootConnected: openRefs.root.isConnected,
    listConnected: openRefs.list.isConnected,
  });
  */
  traceSharedSelect("force cleanup open shared select", {
    reason,
    selectId: openRefs.select.id,
    rootConnected: openRefs.root.isConnected,
    listConnected: openRefs.list.isConnected,
  });
  closeSharedSelectWithRefs(openRefs, false);
}

/**
 * 功能：确保已打开实例的断连监听器只绑定一次。
 * @returns 无返回值。
 */
function ensureSharedSelectOpenObserver(): void {
  if (SHARED_SELECT_OPEN_OBSERVER || typeof MutationObserver === "undefined") return;
  const target = document.body || document.documentElement;
  if (!target) return;
  SHARED_SELECT_OPEN_OBSERVER = new MutationObserver((): void => {
    const openRefs = OPEN_SHARED_SELECT_REFS;
    if (!openRefs) return;
    if (isSharedSelectRuntimeAlive(openRefs)) return;
    /*
    forceCleanupOpenSharedSelect("检测到宿主节点已被替换或移除");
    */
    forceCleanupOpenSharedSelect("detected disconnected host");
  });
  SHARED_SELECT_OPEN_OBSERVER.observe(target, {
    childList: true,
    subtree: true,
  });
}

/**
 * 功能：在下一帧统一重算当前打开下拉框的位置。
 * @returns 无返回值
 */
function scheduleOpenSharedSelectReposition(): void {
  if (SHARED_SELECT_REPOSITION_FRAME) return;
  SHARED_SELECT_REPOSITION_FRAME = window.requestAnimationFrame((): void => {
    SHARED_SELECT_REPOSITION_FRAME = 0;
    const openRefs = OPEN_SHARED_SELECT_REFS;
    if (!openRefs) return;
    if (!isSharedSelectRuntimeAlive(openRefs)) {
      /*
      forceCleanupOpenSharedSelect("重排时检测到已断连实例");
      */
      forceCleanupOpenSharedSelect("detected disconnected instance during reposition");
      return;
    }
    positionSharedSelectList(openRefs);
  });
}

function scheduleOpenSharedSelectThemeRefresh(): void {
  if (SHARED_SELECT_THEME_FRAME) {
    window.cancelAnimationFrame(SHARED_SELECT_THEME_FRAME);
  }
  SHARED_SELECT_THEME_FRAME = window.requestAnimationFrame((): void => {
    SHARED_SELECT_THEME_FRAME = 0;
    const openRefs = OPEN_SHARED_SELECT_REFS;
    traceSharedSelect("theme refresh frame fired", {
      hasOpenRoot: !!openRefs,
      openRootConnected: !!openRefs?.root?.isConnected,
    });
    if (!openRefs) return;
    if (!isSharedSelectRuntimeAlive(openRefs)) {
      /*
      forceCleanupOpenSharedSelect("主题刷新时检测到已断连实例");
      */
      forceCleanupOpenSharedSelect("detected disconnected instance during theme refresh");
      return;
    }
    syncSharedSelectDetachedThemeVars(openRefs);
    scheduleOpenSharedSelectReposition();
  });
}

/**
 * 功能：关闭当前打开的选择框。
 * @param root 组件根节点
 * @param restoreFocus 是否把焦点还给触发器
 * @returns 无返回值
 */
function closeSharedSelect(root: HTMLElement | null, restoreFocus: boolean): void {
  if (!root) return;
  if (OPEN_SHARED_SELECT_REFS?.root === root) {
    closeSharedSelectWithRefs(OPEN_SHARED_SELECT_REFS, restoreFocus);
    return;
  }
  const refs = getSharedSelectRefs(root);
  if (!refs) return;
  closeSharedSelectWithRefs(refs, restoreFocus);
}

/**
 * 功能：打开指定选择框并定位面板。
 * @param root 组件根节点
 * @returns 无返回值
 */
function openSharedSelect(root: HTMLElement): void {
  if (OPEN_SHARED_SELECT_REFS && OPEN_SHARED_SELECT_REFS.root !== root) {
    closeSharedSelectWithRefs(OPEN_SHARED_SELECT_REFS, false);
  }
  const refs = getSharedSelectRefs(root);
  if (!refs || refs.select.disabled) return;
  const selectedIndex = getSelectedOptionIndex(refs);
  const initialIndex = selectedIndex >= 0 ? selectedIndex : getBoundaryEnabledIndex(refs, "start");
  OPEN_SHARED_SELECT_REFS = refs;
  root.classList.add("is-open");
  refs.list.classList.add("is-open");
  refs.list.hidden = false;
  refs.trigger.setAttribute("aria-expanded", "true");
  setHighlightIndex(refs, initialIndex, false);
  positionSharedSelectList(refs);
  syncSharedSelectDetachedThemeVars(refs);
}

/**
 * 功能：切换选择框打开状态。
 * @param root 组件根节点
 * @returns 无返回值
 */
function toggleSharedSelect(root: HTMLElement): void {
  if (root.classList.contains("is-open")) {
    closeSharedSelect(root, true);
    return;
  }
  openSharedSelect(root);
}

/**
 * 功能：同步单个选择框的展示状态。
 * @param root 组件根节点
 * @returns 无返回值
 */
function syncSingleSharedSelect(root: HTMLElement): void {
  const refs = getSharedSelectRefs(root);
  if (!refs) return;
  const selectedIndex = getSelectedOptionIndex(refs);
  const selectedOption = refs.select.options[selectedIndex] || refs.select.options[0] || null;
  const options = getSharedSelectOptions(refs);
  const selectedLabel = selectedOption?.textContent?.trim() || "";
  const selectedMedia = readSharedSelectMediaFromOption(selectedOption);
  refs.triggerCopy.innerHTML = renderSharedSelectMainMarkup(selectedLabel, selectedMedia);
  options.forEach((item, index) => {
    const isSelected = index === selectedIndex;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
  refs.trigger.disabled = refs.select.disabled;
  refs.root.dataset.sharedSelectDisabled = refs.select.disabled ? "true" : "false";
  refs.root.dataset.sharedSelectHighlightIndex = String(selectedIndex >= 0 ? selectedIndex : -1);
  if (refs.root.classList.contains("is-open")) {
    positionSharedSelectList(refs);
    syncSharedSelectDetachedThemeVars(refs);
    setHighlightIndex(refs, getHighlightIndex(refs.root), false);
  }
}

/**
 * 功能：按照原生 select 当前的 options 重建共享下拉面板。
 * @param root 共享下拉组件根节点
 * @returns 是否成功完成重建
 */
function rebuildSingleSharedSelectOptions(root: HTMLElement): boolean {
  const refs = getSharedSelectRefs(root);
  if (!refs) return false;
  refs.list.innerHTML = buildSharedSelectListMarkup(refs.select);
  syncSingleSharedSelect(root);
  return true;
}

/**
 * 功能：向原生选择框写入值并派发兼容事件。
 * @param refs 运行时节点集合
 * @param value 目标值
 * @returns 无返回值
 */
function commitSharedSelectValue(refs: SharedSelectRefs, value: string): void {
  const committedRefs = refs;
  traceSharedSelect("commitSharedSelectValue", {
    selectId: refs.select.id,
    previousValue: refs.select.value,
    nextValue: value,
  });
  if (refs.select.value === value) {
    closeSharedSelectWithRefs(committedRefs, true);
    return;
  }
  refs.select.value = value;
  refs.select.dispatchEvent(new Event("input", { bubbles: true }));
  refs.select.dispatchEvent(new Event("change", { bubbles: true }));
  closeSharedSelectWithRefs(committedRefs, true);
}

/**
 * 功能：处理触发器键盘交互。
 * @param root 组件根节点
 * @param event 键盘事件
 * @returns 无返回值
 */
function handleSharedSelectTriggerKeydown(root: HTMLElement, event: KeyboardEvent): void {
  const refs = getSharedSelectRefs(root);
  if (!refs || refs.select.disabled) return;
  const isOpen = root.classList.contains("is-open");
  const currentHighlight = getHighlightIndex(root);

  if (event.key === "Tab") {
    if (isOpen) closeSharedSelect(root, false);
    return;
  }
  if (event.key === "Escape") {
    if (!isOpen) return;
    event.preventDefault();
    closeSharedSelect(root, true);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!isOpen) {
      openSharedSelect(root);
      return;
    }
    setHighlightIndex(refs, findNextEnabledIndex(refs, currentHighlight, 1), true);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!isOpen) {
      openSharedSelect(root);
      return;
    }
    setHighlightIndex(refs, findNextEnabledIndex(refs, currentHighlight, -1), true);
    return;
  }
  if (event.key === "Home") {
    if (!isOpen) return;
    event.preventDefault();
    setHighlightIndex(refs, getBoundaryEnabledIndex(refs, "start"), true);
    return;
  }
  if (event.key === "End") {
    if (!isOpen) return;
    event.preventDefault();
    setHighlightIndex(refs, getBoundaryEnabledIndex(refs, "end"), true);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!isOpen) {
      openSharedSelect(root);
      return;
    }
    const option = getSharedSelectOptions(refs)[currentHighlight];
    if (!option || option.dataset.sharedSelectDisabled === "true") return;
    commitSharedSelectValue(refs, String(option.dataset.sharedSelectOptionValue ?? ""));
  }
}

/**
 * 功能：绑定全局关闭与重定位事件。
 * @returns 无返回值
 */
function ensureSharedSelectGlobalEvents(): void {
  if (SHARED_SELECT_GLOBAL_EVENTS_BOUND) return;
  SHARED_SELECT_GLOBAL_EVENTS_BOUND = true;
  ensureSharedSelectOpenObserver();

  document.addEventListener("pointerdown", (event: PointerEvent) => {
    const openRefs = OPEN_SHARED_SELECT_REFS;
    if (!openRefs) return;
    if (!isSharedSelectRuntimeAlive(openRefs)) {
      /*
      forceCleanupOpenSharedSelect("点击外部时检测到已断连实例");
      */
      forceCleanupOpenSharedSelect("detected disconnected instance during pointerdown");
      return;
    }
    const target = event.target as Node | null;
    if (target && (openRefs.root.contains(target) || openRefs.list.contains(target))) return;
    closeSharedSelectWithRefs(openRefs, false);
  });

  document.addEventListener(
    "scroll",
    () => {
      const openRefs = OPEN_SHARED_SELECT_REFS;
      if (!openRefs) return;
      if (!isSharedSelectRuntimeAlive(openRefs)) {
        /*
        forceCleanupOpenSharedSelect("滚动时检测到已断连实例");
        */
        forceCleanupOpenSharedSelect("detected disconnected instance during scroll");
        return;
      }
      scheduleOpenSharedSelectReposition();
    },
    true
  );

  window.addEventListener("resize", () => {
    const openRefs = OPEN_SHARED_SELECT_REFS;
    if (!openRefs) return;
    if (!isSharedSelectRuntimeAlive(openRefs)) {
      /*
      forceCleanupOpenSharedSelect("窗口缩放时检测到已断连实例");
      */
      forceCleanupOpenSharedSelect("detected disconnected instance during resize");
      return;
    }
    scheduleOpenSharedSelectReposition();
  });

  subscribeTheme(() => {
    const openRefs = OPEN_SHARED_SELECT_REFS;
    traceSharedSelect("subscribeTheme fired", {
      hasOpenRoot: !!openRefs,
      openRootConnected: !!openRefs?.root?.isConnected,
    });
    if (!openRefs) return;
    if (!isSharedSelectRuntimeAlive(openRefs)) {
      /*
      forceCleanupOpenSharedSelect("主题订阅回调检测到已断连实例");
      */
      forceCleanupOpenSharedSelect("detected disconnected instance during theme subscribe");
      return;
    }
    scheduleOpenSharedSelectThemeRefresh();
  });
}

/**
 * 功能：绑定单个共享选择框实例。
 * @param root 组件根节点
 * @returns 无返回值
 */
function bindSharedSelect(root: HTMLElement): void {
  if (root.dataset.sharedSelectBound === "1") {
    syncSingleSharedSelect(root);
    return;
  }
  const refs = getSharedSelectRefs(root);
  if (!refs) return;
  root.dataset.sharedSelectBound = "1";
  ensureSharedSelectGlobalEvents();

  refs.trigger.addEventListener("pointerdown", (event: PointerEvent): void => {
    stopSharedSelectEventPropagation(event);
  });

  refs.trigger.addEventListener("mousedown", (event: MouseEvent): void => {
    stopSharedSelectEventPropagation(event);
  });

  refs.trigger.addEventListener("click", (event: MouseEvent): void => {
    stopSharedSelectEventPropagation(event);
    toggleSharedSelect(root);
  });

  refs.trigger.addEventListener("keydown", (event: KeyboardEvent) => {
    handleSharedSelectTriggerKeydown(root, event);
  });

  refs.select.addEventListener("input", () => {
    syncSingleSharedSelect(root);
  });

  refs.select.addEventListener("change", () => {
    syncSingleSharedSelect(root);
  });

  refs.list.addEventListener("pointermove", (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>(".stx-shared-select-option");
    if (!option) return;
    const index = Number(option.dataset.sharedSelectOptionIndex ?? "");
    if (!Number.isFinite(index) || option.dataset.sharedSelectDisabled === "true") return;
    const nextIndex = Math.floor(index);
    if (nextIndex === getHighlightIndex(refs.root)) return;
    setHighlightIndex(refs, nextIndex, false);
  });

  refs.list.addEventListener("pointerleave", (): void => {
    setHighlightIndex(refs, getSelectedOptionIndex(refs), false);
  });

  refs.list.addEventListener("pointerdown", (event: PointerEvent): void => {
    stopSharedSelectEventPropagation(event);
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>(".stx-shared-select-option");
    if (!option || option.dataset.sharedSelectDisabled === "true") return;
    if (event.button !== 0) return;
    event.preventDefault();
    const value = String(option.dataset.sharedSelectOptionValue ?? "");
    commitSharedSelectValue(refs, value);
  });

  refs.list.addEventListener("mousedown", (event: MouseEvent): void => {
    stopSharedSelectEventPropagation(event);
  });

  refs.list.addEventListener("click", (event: MouseEvent) => {
    stopSharedSelectEventPropagation(event);
    const target = event.target as HTMLElement | null;
    const option = target?.closest<HTMLElement>(".stx-shared-select-option");
    if (!option) return;
    event.preventDefault();
  });

  syncSingleSharedSelect(root);
}

/**
 * 功能：初始化指定根节点下的共享选择框。
 * @param root 需要扫描的根节点
 * @returns 无返回值
 */
export function hydrateSharedSelects(root: ParentNode): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-ui="shared-select"]').forEach((node) => {
    bindSharedSelect(node);
  });
}

/**
 * 功能：同步指定根节点下共享选择框的值与禁用态。
 * @param root 需要扫描的根节点
 * @returns 无返回值
 */
export function syncSharedSelects(root: ParentNode): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-ui="shared-select"]').forEach((node) => {
    bindSharedSelect(node);
    syncSingleSharedSelect(node);
  });
}

/**
 * 功能：刷新指定根节点下共享下拉框的面板选项，并同步当前值与禁用状态。
 * @param root 需要扫描的根节点
 * @returns 无返回值
 */
export function refreshSharedSelectOptions(root: ParentNode): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-ui="shared-select"]').forEach((node) => {
    bindSharedSelect(node);
    rebuildSingleSharedSelectOptions(node);
  });
}
