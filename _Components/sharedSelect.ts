import sharedSelectCssText from "./sharedSelect.css?inline";
import { mountThemeHost, subscribeTheme } from "../SDK/theme";

type SharedSelectAttributeValue = string | number | boolean | null | undefined;

export interface SharedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  attributes?: Record<string, SharedSelectAttributeValue>;
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
  label: HTMLElement;
  list: HTMLElement;
  options: HTMLElement[];
}

let OPEN_SHARED_SELECT_ROOT: HTMLElement | null = null;
let SHARED_SELECT_GLOBAL_EVENTS_BOUND = false;
let SHARED_SELECT_REPOSITION_FRAME = 0;
let SHARED_SELECT_THEME_FRAME = 0;

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
 * 功能：构建共享选择框 HTML。
 * @param options 组件配置
 * @returns 组件 HTML 字符串
 */
export function buildSharedSelectField(options: SharedSelectFieldOptions): string {
  const selectedValue = String(options.value ?? "");
  const matchedOption = options.options.find((item) => String(item.value) === selectedValue);
  const buttonLabel = matchedOption?.label ?? options.options[0]?.label ?? "";
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
            return `<option value="${escapeAttr(optionValue)}"${item.disabled ? " disabled" : ""}${isSelected ? " selected" : ""}${buildAttributes(item.attributes)}>${escapeHtml(item.label)}</option>`;
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
        <span class="${escapeAttr(joinClassNames("stx-shared-select-label", options.labelClassName))}">${escapeHtml(buttonLabel)}</span>
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
            <span class="stx-shared-select-option-label">${escapeHtml(item.label)}</span>
            <span class="stx-shared-select-option-mark" aria-hidden="true"></span>
          </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
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
 * 功能：读取组件运行时节点引用。
 * @param root 组件根节点
 * @returns 运行时节点集合；缺少关键节点时返回 null
 */
function getSharedSelectRefs(root: HTMLElement): SharedSelectRefs | null {
  const select = root.querySelector<HTMLSelectElement>("select.stx-shared-select-native");
  const trigger = root.querySelector<HTMLButtonElement>("button.stx-shared-select-trigger");
  const label = root.querySelector<HTMLElement>(".stx-shared-select-label");
  const listId = String(trigger?.getAttribute("aria-controls") ?? "").trim();
  const list = (listId ? document.getElementById(listId) : null) || root.querySelector<HTMLElement>(".stx-shared-select-list");
  if (!select || !trigger || !label || !list) return null;
  const options = Array.from(list.querySelectorAll<HTMLElement>(".stx-shared-select-option"));
  return { root, select, trigger, label, list, options };
}

/**
 * 功能：读取当前已选项索引。
 * @param refs 运行时节点集合
 * @returns 已选项索引；无匹配时返回 -1
 */
function getSelectedOptionIndex(refs: SharedSelectRefs): number {
  const selectedIndex = refs.select.selectedIndex;
  if (selectedIndex >= 0 && selectedIndex < refs.options.length) return selectedIndex;
  return refs.options.findIndex((item) => item.dataset.sharedSelectOptionValue === refs.select.value);
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
  const option = refs.options[index];
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
  refs.options.forEach((item, optionIndex) => {
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
  return refs.options
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
  const enabledIndexes = getEnabledOptionIndexes(refs);
  if (!enabledIndexes.length) return -1;
  if (currentIndex < 0) {
    return step > 0 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
  }
  let nextIndex = currentIndex;
  for (let count = 0; count < refs.options.length; count += 1) {
    nextIndex += step;
    if (nextIndex < 0) nextIndex = refs.options.length - 1;
    if (nextIndex >= refs.options.length) nextIndex = 0;
    if (refs.options[nextIndex]?.dataset.sharedSelectDisabled !== "true") {
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
 * 功能：在下一帧统一重算当前打开下拉框的位置。
 * @returns 无返回值
 */
function scheduleOpenSharedSelectReposition(): void {
  if (SHARED_SELECT_REPOSITION_FRAME) return;
  SHARED_SELECT_REPOSITION_FRAME = window.requestAnimationFrame((): void => {
    SHARED_SELECT_REPOSITION_FRAME = 0;
    const openRoot = OPEN_SHARED_SELECT_ROOT;
    if (!openRoot) return;
    if (!openRoot.isConnected) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    const refs = getSharedSelectRefs(openRoot);
    if (!refs) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    positionSharedSelectList(refs);
  });
}

function scheduleOpenSharedSelectThemeRefresh(): void {
  if (SHARED_SELECT_THEME_FRAME) {
    window.cancelAnimationFrame(SHARED_SELECT_THEME_FRAME);
  }
  SHARED_SELECT_THEME_FRAME = window.requestAnimationFrame((): void => {
    SHARED_SELECT_THEME_FRAME = 0;
    const openRoot = OPEN_SHARED_SELECT_ROOT;
    traceSharedSelect("theme refresh frame fired", {
      hasOpenRoot: !!openRoot,
      openRootConnected: !!openRoot?.isConnected,
    });
    if (!openRoot || !openRoot.isConnected) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    const refs = getSharedSelectRefs(openRoot);
    if (!refs) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    syncSharedSelectDetachedThemeVars(refs);
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
  const refs = getSharedSelectRefs(root);
  if (!refs) {
    if (OPEN_SHARED_SELECT_ROOT === root) OPEN_SHARED_SELECT_ROOT = null;
    return;
  }
  root.classList.remove("is-open");
  refs.trigger.setAttribute("aria-expanded", "false");
  refs.list.classList.remove("is-open");
  refs.list.hidden = true;
  root.dataset.sharedSelectHighlightIndex = String(getSelectedOptionIndex(refs));
  if (OPEN_SHARED_SELECT_ROOT === root) {
    OPEN_SHARED_SELECT_ROOT = null;
  }
  if (SHARED_SELECT_REPOSITION_FRAME) {
    window.cancelAnimationFrame(SHARED_SELECT_REPOSITION_FRAME);
    SHARED_SELECT_REPOSITION_FRAME = 0;
  }
  if (restoreFocus) {
    refs.trigger.focus();
  }
}

/**
 * 功能：打开指定选择框并定位面板。
 * @param root 组件根节点
 * @returns 无返回值
 */
function openSharedSelect(root: HTMLElement): void {
  if (OPEN_SHARED_SELECT_ROOT && OPEN_SHARED_SELECT_ROOT !== root) {
    closeSharedSelect(OPEN_SHARED_SELECT_ROOT, false);
  }
  const refs = getSharedSelectRefs(root);
  if (!refs || refs.select.disabled) return;
  const selectedIndex = getSelectedOptionIndex(refs);
  const initialIndex = selectedIndex >= 0 ? selectedIndex : getBoundaryEnabledIndex(refs, "start");
  OPEN_SHARED_SELECT_ROOT = root;
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
  refs.label.textContent = selectedOption?.textContent?.trim() || "";
  refs.options.forEach((item, index) => {
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
 * 功能：向原生选择框写入值并派发兼容事件。
 * @param refs 运行时节点集合
 * @param value 目标值
 * @returns 无返回值
 */
function commitSharedSelectValue(refs: SharedSelectRefs, value: string): void {
  traceSharedSelect("commitSharedSelectValue", {
    selectId: refs.select.id,
    previousValue: refs.select.value,
    nextValue: value,
  });
  if (refs.select.value === value) {
    syncSingleSharedSelect(refs.root);
    closeSharedSelect(refs.root, true);
    return;
  }
  refs.select.value = value;
  refs.select.dispatchEvent(new Event("input", { bubbles: true }));
  refs.select.dispatchEvent(new Event("change", { bubbles: true }));
  syncSingleSharedSelect(refs.root);
  closeSharedSelect(refs.root, true);
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
    const option = refs.options[currentHighlight];
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

  document.addEventListener("pointerdown", (event: PointerEvent) => {
    const openRoot = OPEN_SHARED_SELECT_ROOT;
    if (!openRoot) return;
    if (!openRoot.isConnected) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    const target = event.target as Node | null;
    const refs = getSharedSelectRefs(openRoot);
    if (target && (openRoot.contains(target) || refs?.list.contains(target))) return;
    closeSharedSelect(openRoot, false);
  });

  document.addEventListener(
    "scroll",
    () => {
      const openRoot = OPEN_SHARED_SELECT_ROOT;
      if (!openRoot) return;
      if (!openRoot.isConnected) {
        OPEN_SHARED_SELECT_ROOT = null;
        return;
      }
      const refs = getSharedSelectRefs(openRoot);
      if (!refs) {
        OPEN_SHARED_SELECT_ROOT = null;
        return;
      }
      scheduleOpenSharedSelectReposition();
    },
    true
  );

  window.addEventListener("resize", () => {
    const openRoot = OPEN_SHARED_SELECT_ROOT;
    if (!openRoot) return;
    if (!openRoot.isConnected) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    const refs = getSharedSelectRefs(openRoot);
    if (!refs) {
      OPEN_SHARED_SELECT_ROOT = null;
      return;
    }
    scheduleOpenSharedSelectReposition();
  });

  subscribeTheme(() => {
    const openRoot = OPEN_SHARED_SELECT_ROOT;
    traceSharedSelect("subscribeTheme fired", {
      hasOpenRoot: !!openRoot,
      openRootConnected: !!openRoot?.isConnected,
    });
    if (!openRoot || !openRoot.isConnected) return;
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
