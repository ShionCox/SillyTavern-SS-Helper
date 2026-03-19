import { buildSharedButton, type SharedButtonVariant } from "../_Components/sharedButton";
import { ensureSharedTooltip } from "../_Components/sharedTooltip";

type ToolbarAttributeValue = string | number | boolean | null | undefined;

export interface SdkFloatingToolbarAction {
  key: string;
  label?: string;
  variant?: SharedButtonVariant;
  iconClassName?: string;
  buttonClassName?: string;
  attributes?: Record<string, ToolbarAttributeValue>;
  tooltip?: string;
  ariaLabel?: string;
  order?: number;
}

export interface SdkFloatingToolbarOptions {
  groupId: string;
  actions: SdkFloatingToolbarAction[];
  toolbarId?: string;
  styleId?: string;
  hostResolver?: () => HTMLElement | null;
  retryMax?: number;
  retryDelayMs?: number;
  defaultExpanded?: boolean;
  adoptExisting?: boolean;
  reuseMarkupVersion?: string;
  toolbarClassName?: string;
  groupClassName?: string;
  toggleTipExpand?: string;
  toggleTipCollapse?: string;
  toggleAriaExpand?: string;
  toggleAriaCollapse?: string;
  onExistingFound?: (toolbar: HTMLElement) => void;
  onToolbarMounted?: (toolbar: HTMLElement, host: HTMLElement) => void;
}

export interface RemoveSdkFloatingToolbarGroupOptions {
  groupId: string;
  toolbarId?: string;
}

export const SDK_FLOATING_TOOLBAR_ID = "SSHELPERTOOL";
export const SDK_FLOATING_TOOLBAR_STYLE_ID = "stx-sdk-floating-toolbar-style";
export const SDK_FLOATING_TOOLBAR_COLLAPSED_CLASS = "is-collapsed";

const SDK_FLOATING_TOOLBAR_MARKUP_VERSION = "1";
const SDK_FLOATING_TOOLBAR_ROOT_ATTR = "data-stx-sdk-toolbar-root";
const SDK_FLOATING_TOOLBAR_SHELL_ATTR = "data-stx-sdk-toolbar-shell";
const SDK_FLOATING_TOOLBAR_ACTIONS_ATTR = "data-stx-sdk-toolbar-actions";
const SDK_FLOATING_TOOLBAR_GROUP_ATTR = "data-stx-sdk-toolbar-group";
const SDK_FLOATING_TOOLBAR_TOGGLE_ATTR = "data-stx-sdk-toolbar-toggle";
const SDK_FLOATING_TOOLBAR_OBSERVER_ATTR = "data-stx-sdk-toolbar-observer-bound";

const sdkFloatingToolbarObserverMap = new WeakMap<HTMLElement, MutationObserver>();

function resolveDefaultToolbarHost(): HTMLElement | null {
  const compact = document.querySelector<HTMLElement>("#send_form.compact");
  return compact || (document.getElementById("send_form") as HTMLElement | null);
}

function getToolbarOptionValue<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function buildToolbarRootMarkup(options: SdkFloatingToolbarOptions): string {
  const expandTip = getToolbarOptionValue(options.toggleTipExpand, "展开工具栏");
  const expandAria = getToolbarOptionValue(options.toggleAriaExpand, "展开工具栏");
  return `
    <div class="stx-sdk-toolbar-shell" ${SDK_FLOATING_TOOLBAR_SHELL_ATTR}="1">
      ${buildSharedButton({
        label: "",
        className: "stx-sdk-toolbar-toggle",
        iconClassName: "fa-solid fa-angles-right",
        attributes: {
          [SDK_FLOATING_TOOLBAR_TOGGLE_ATTR]: "1",
          "data-tip": expandTip,
          "aria-expanded": "false",
          "aria-label": expandAria,
        },
      })}
      <div class="stx-sdk-toolbar-actions" ${SDK_FLOATING_TOOLBAR_ACTIONS_ATTR}="1"></div>
    </div>
  `;
}

function buildToolbarActionMarkup(action: SdkFloatingToolbarAction): string {
  return buildSharedButton({
    label: action.label ?? "",
    variant: action.variant ?? "secondary",
    iconClassName: action.iconClassName,
    className: ["stx-sdk-toolbar-action", action.buttonClassName].filter(Boolean).join(" "),
    attributes: {
      ...(action.attributes ?? {}),
      ...(action.tooltip ? { "data-tip": action.tooltip } : {}),
      ...(action.ariaLabel ? { "aria-label": action.ariaLabel } : {}),
    },
  });
}

function ensureFloatingToolbarStyles(styleId: string): void {
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] {
      width: auto;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin: 0;
      padding: 6px 8px;
      box-sizing: border-box;
      border: 1px solid var(--ss-theme-border, rgba(197, 160, 89, 0.35));
      border-radius: 12px;
      background-color: var(--ss-theme-panel-bg, rgba(20, 16, 14, 0.82));
      backdrop-filter: var(--ss-theme-backdrop-filter, blur(8px));
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
      pointer-events: auto;
      position: absolute;
      left: 8px;
      bottom: calc(100% + 8px);
      z-index: 45;
      transition:
        background-color 0.22s ease,
        border-color 0.22s ease,
        box-shadow 0.22s ease,
        padding 0.22s ease,
        opacity 0.18s ease;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"].${SDK_FLOATING_TOOLBAR_COLLAPSED_CLASS} {
      padding: 0;
      border-color: transparent;
      background-color: transparent;
      box-shadow: none;
      backdrop-filter: none;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-shell {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: min(100%, 520px);
      padding: 2px 0;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-toggle {
      width: 28px;
      height: 28px;
      border: 1px solid rgba(197, 160, 89, 0.55);
      border-radius: 8px;
      background: linear-gradient(135deg, #2b1d12, #120d09);
      color: #f1d8a1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      line-height: 1;
      padding: 0;
      transition: border-color 0.2s ease, filter 0.2s ease;
      flex: 0 0 auto;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-toggle:hover,
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action:hover {
      border-color: #efd392;
      filter: brightness(1.08);
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      overflow: visible;
      max-width: 420px;
      opacity: 1;
      transform: translateX(0);
      transform-origin: left center;
      transition: max-width 0.24s ease, transform 0.24s ease, opacity 0.18s ease;
      white-space: nowrap;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"].${SDK_FLOATING_TOOLBAR_COLLAPSED_CLASS} .stx-sdk-toolbar-actions {
      max-width: 0;
      opacity: 0;
      transform: translateX(-18px);
      pointer-events: none;
      visibility: hidden;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-group {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action {
      border: 1px solid rgba(197, 160, 89, 0.52);
      background: linear-gradient(135deg, rgba(58, 37, 21, 0.92), rgba(22, 14, 10, 0.94));
      color: #f1d8a1;
      border-radius: 8px;
      width: 30px;
      height: 30px;
      padding: 0;
      font-size: 13px;
      letter-spacing: 0.4px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s ease, filter 0.2s ease;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-toggle .stx-shared-button-label,
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action .stx-shared-button-label {
      display: none;
    }
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-toggle.stx-shared-button,
    [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action.stx-shared-button {
      gap: 0;
      padding: 0;
    }
    @media (max-width: 768px) {
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] {
        left: 6px;
        bottom: calc(100% + 6px);
        padding: 5px 6px;
      }
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-shell {
        max-width: 100%;
      }
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action {
        width: 28px;
        height: 28px;
        font-size: 12px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-actions,
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-toggle,
      [${SDK_FLOATING_TOOLBAR_ROOT_ATTR}="1"] .stx-sdk-toolbar-action {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function setToolbarExpandedState(toolbar: HTMLElement, options: SdkFloatingToolbarOptions, expanded: boolean): void {
  toolbar.classList.toggle(SDK_FLOATING_TOOLBAR_COLLAPSED_CLASS, !expanded);
  const toggleButton = toolbar.querySelector<HTMLButtonElement>(`button[${SDK_FLOATING_TOOLBAR_TOGGLE_ATTR}="1"]`);
  if (!toggleButton) return;
  const expandTip = getToolbarOptionValue(options.toggleTipExpand, "展开工具栏");
  const collapseTip = getToolbarOptionValue(options.toggleTipCollapse, "收起工具栏");
  const expandAria = getToolbarOptionValue(options.toggleAriaExpand, "展开工具栏");
  const collapseAria = getToolbarOptionValue(options.toggleAriaCollapse, "收起工具栏");
  toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggleButton.setAttribute("aria-label", expanded ? collapseAria : expandAria);
  toggleButton.dataset.tip = expanded ? collapseTip : expandTip;
  const toggleIcon = toggleButton.querySelector("i");
  if (toggleIcon) {
    toggleIcon.className = expanded ? "fa-solid fa-angles-left" : "fa-solid fa-angles-right";
  }
}

function bindToolbarToggle(toolbar: HTMLElement, options: SdkFloatingToolbarOptions): void {
  if (toolbar.dataset.stxSdkToolbarBound === "1") return;
  toolbar.dataset.stxSdkToolbarBound = "1";
  toolbar.addEventListener("click", (event: Event) => {
    const target = event.target as HTMLElement | null;
    const toggleButton = target?.closest<HTMLButtonElement>(`button[${SDK_FLOATING_TOOLBAR_TOGGLE_ATTR}="1"]`);
    if (!toggleButton) return;
    event.preventDefault();
    event.stopPropagation();
    const expanded = !toolbar.classList.contains(SDK_FLOATING_TOOLBAR_COLLAPSED_CLASS);
    setToolbarExpandedState(toolbar, options, !expanded);
  });
}

function ensureToolbarShell(toolbar: HTMLElement, options: SdkFloatingToolbarOptions): void {
  const markupVersion = getToolbarOptionValue(options.reuseMarkupVersion, SDK_FLOATING_TOOLBAR_MARKUP_VERSION);
  const shell = toolbar.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_SHELL_ATTR}="1"]`);
  const actionsWrap = toolbar.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_ACTIONS_ATTR}="1"]`);
  const needsRebuild = !shell || !actionsWrap || toolbar.dataset.stxSdkToolbarMarkupVersion !== markupVersion;

  toolbar.setAttribute(SDK_FLOATING_TOOLBAR_ROOT_ATTR, "1");
  toolbar.classList.add("stx-sdk-toolbar");
  if (options.toolbarClassName) {
    toolbar.classList.add(...options.toolbarClassName.split(/\s+/).filter(Boolean));
  }

  if (needsRebuild) {
    const preservedGroups = Array.from(
      toolbar.querySelectorAll<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_GROUP_ATTR}]`)
    );
    toolbar.innerHTML = buildToolbarRootMarkup(options);
    const nextActionsWrap = toolbar.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_ACTIONS_ATTR}="1"]`);
    preservedGroups.forEach((groupNode) => {
      nextActionsWrap?.appendChild(groupNode);
    });
    toolbar.dataset.stxSdkToolbarMarkupVersion = markupVersion;
    delete toolbar.dataset.stxSdkToolbarInitialized;
  }

  bindToolbarToggle(toolbar, options);
  if (toolbar.dataset.stxSdkToolbarInitialized !== "1") {
    setToolbarExpandedState(toolbar, options, getToolbarOptionValue(options.defaultExpanded, false));
    toolbar.dataset.stxSdkToolbarInitialized = "1";
  }
}

function sortActions(actions: SdkFloatingToolbarAction[]): SdkFloatingToolbarAction[] {
  return [...actions].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function upsertToolbarGroup(toolbar: HTMLElement, options: SdkFloatingToolbarOptions): void {
  const actionsWrap = toolbar.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_ACTIONS_ATTR}="1"]`);
  if (!actionsWrap) return;
  const safeGroupId = CSS.escape(options.groupId);
  let groupNode = actionsWrap.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_GROUP_ATTR}="${safeGroupId}"]`);
  if (!groupNode) {
    groupNode = document.createElement("div");
    groupNode.setAttribute(SDK_FLOATING_TOOLBAR_GROUP_ATTR, options.groupId);
    actionsWrap.appendChild(groupNode);
  }
  groupNode.className = ["stx-sdk-toolbar-group", options.groupClassName].filter(Boolean).join(" ");
  groupNode.innerHTML = sortActions(options.actions).map(buildToolbarActionMarkup).join("");
}

function mountToolbarToHost(toolbar: HTMLElement, host: HTMLElement): void {
  const hostPosition = window.getComputedStyle(host).position;
  if (hostPosition === "static") {
    host.style.position = "relative";
  }
  if (toolbar.parentElement !== host) {
    host.appendChild(toolbar);
  }
}

/**
 * 功能：断开工具栏的宿主监听器，避免在工具栏销毁后继续观察页面。
 * @param toolbar 当前工具栏节点。
 * @returns 无返回值。
 */
function disconnectToolbarObserver(toolbar: HTMLElement): void {
  const observer = sdkFloatingToolbarObserverMap.get(toolbar);
  if (!observer) {
    return;
  }
  observer.disconnect();
  sdkFloatingToolbarObserverMap.delete(toolbar);
  delete toolbar.dataset.stxSdkToolbarObserverBound;
}

/**
 * 功能：确保工具栏在宿主节点重绘或替换后能够自动重新挂载。
 * @param toolbar 当前工具栏节点。
 * @param options 工具栏挂载选项。
 * @returns 无返回值。
 */
function ensureToolbarObserver(toolbar: HTMLElement, options: SdkFloatingToolbarOptions): void {
  if (toolbar.dataset.stxSdkToolbarObserverBound === "1") {
    return;
  }
  const root = document.body;
  if (!root) {
    return;
  }

  const observer = new MutationObserver((): void => {
    if (!toolbar.isConnected) {
      const host = (options.hostResolver ?? resolveDefaultToolbarHost)();
      if (!host) {
        return;
      }
      mountToolbarToHost(toolbar, host);
      options.onToolbarMounted?.(toolbar, host);
      return;
    }

    const host = (options.hostResolver ?? resolveDefaultToolbarHost)();
    if (!host) {
      return;
    }
    if (toolbar.parentElement !== host) {
      mountToolbarToHost(toolbar, host);
      options.onToolbarMounted?.(toolbar, host);
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });
  sdkFloatingToolbarObserverMap.set(toolbar, observer);
  toolbar.dataset.stxSdkToolbarObserverBound = "1";
}

function scheduleEnsureRetry(options: SdkFloatingToolbarOptions, attempt: number): void {
  if (attempt > getToolbarOptionValue(options.retryMax, 60)) return;
  window.setTimeout(() => {
    ensureSdkFloatingToolbar(options, attempt);
  }, getToolbarOptionValue(options.retryDelayMs, 500));
}

export function ensureSdkFloatingToolbar(
  options: SdkFloatingToolbarOptions,
  attempt = 0
): HTMLElement | null {
  ensureSharedTooltip();
  const toolbarId = getToolbarOptionValue(options.toolbarId, SDK_FLOATING_TOOLBAR_ID);
  const styleId = getToolbarOptionValue(options.styleId, SDK_FLOATING_TOOLBAR_STYLE_ID);
  ensureFloatingToolbarStyles(styleId);

  let toolbar = document.getElementById(toolbarId) as HTMLElement | null;
  if (toolbar && options.adoptExisting !== false) {
    options.onExistingFound?.(toolbar);
  }
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.id = toolbarId;
  }

  ensureToolbarShell(toolbar, options);
  upsertToolbarGroup(toolbar, options);

  const host = (options.hostResolver ?? resolveDefaultToolbarHost)();
  if (!host) {
    ensureToolbarObserver(toolbar, options);
    scheduleEnsureRetry(options, attempt + 1);
    return toolbar;
  }

  mountToolbarToHost(toolbar, host);
  ensureToolbarObserver(toolbar, options);
  options.onToolbarMounted?.(toolbar, host);
  return toolbar;
}

export function removeSdkFloatingToolbarGroup(options: RemoveSdkFloatingToolbarGroupOptions): void {
  const toolbarId = options.toolbarId ?? SDK_FLOATING_TOOLBAR_ID;
  const toolbar = document.getElementById(toolbarId) as HTMLElement | null;
  if (!toolbar) return;
  const actionsWrap = toolbar.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_ACTIONS_ATTR}="1"]`);
  if (!actionsWrap) return;
  const safeGroupId = CSS.escape(options.groupId);
  actionsWrap.querySelector<HTMLElement>(`[${SDK_FLOATING_TOOLBAR_GROUP_ATTR}="${safeGroupId}"]`)?.remove();
  if (!actionsWrap.querySelector(`[${SDK_FLOATING_TOOLBAR_GROUP_ATTR}]`)) {
    disconnectToolbarObserver(toolbar);
    toolbar.remove();
  }
}

export function setSdkFloatingToolbarExpanded(toolbar: HTMLElement, expanded: boolean): void {
  setToolbarExpandedState(
    toolbar,
    {
      groupId: "__sdk__",
      actions: [],
    },
    expanded
  );
}
