import sharedDialogCssText from './sharedDialog.css?inline';
import { mountThemeHost, subscribeTheme } from '../SDK/theme';

type SharedDialogGlobalRef = typeof globalThis & {
  [key: string]: unknown;
};

type SharedDialogAttributeValue = string | number | boolean | null | undefined;

export type SharedDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
export type SharedDialogLayout = 'panel' | 'bare' | 'stretch';
export type SharedDialogCloseReason = 'api' | 'escape' | 'backdrop' | 'button' | 'replace' | 'destroy';

export interface SharedDialogChromeOptions {
  eyebrow?: string;
  title?: string;
  description?: string;
  iconClassName?: string;
  footerHtml?: string;
  showCloseButton?: boolean;
  closeButtonLabel?: string;
}

export interface SharedDialogCloseContext {
  id: string;
  reason: SharedDialogCloseReason;
  root: HTMLDivElement;
  surface: HTMLDivElement;
  content: HTMLDivElement;
}

export interface SharedDialogOptions {
  id?: string;
  hostElement?: HTMLElement | null;
  size?: SharedDialogSize;
  layout?: SharedDialogLayout;
  rootClassName?: string;
  surfaceClassName?: string;
  contentClassName?: string;
  rootAttributes?: Record<string, SharedDialogAttributeValue>;
  surfaceAttributes?: Record<string, SharedDialogAttributeValue>;
  bodyHtml?: string;
  chrome?: SharedDialogChromeOptions | false;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  restoreFocus?: boolean;
  initialFocus?: HTMLElement | null | (() => HTMLElement | null);
  initialFocusSelector?: string;
  animationDurationMs?: number;
  ariaLabel?: string;
  beforeClose?: (context: SharedDialogCloseContext) => boolean | void | Promise<boolean | void>;
  onMount?: (instance: SharedDialogInstance) => void;
  onAfterOpen?: (instance: SharedDialogInstance) => void;
  onClose?: (context: SharedDialogCloseContext) => void;
  onAfterClose?: (context: SharedDialogCloseContext) => void;
}

export interface SharedDialogInstance {
  id: string;
  root: HTMLDivElement;
  backdrop: HTMLDivElement;
  surface: HTMLDivElement;
  content: HTMLDivElement;
  close: (reason?: SharedDialogCloseReason) => Promise<boolean>;
  destroy: (reason?: SharedDialogCloseReason) => void;
  focusInitial: () => void;
}

interface SharedDialogRuntime extends SharedDialogInstance {
  options: SharedDialogOptions;
  previousActiveElement: HTMLElement | null;
  closing: boolean;
  closed: boolean;
}

interface SharedDialogState {
  version: number;
  bound: boolean;
  host: HTMLDivElement | null;
  dialogs: SharedDialogRuntime[];
  unbindHandlers: Array<() => void>;
}

const SHARED_DIALOG_STYLE_ID = 'stx-shared-dialog-style';
const SHARED_DIALOG_HOST_ID = 'stx-shared-dialog-host';
const SHARED_DIALOG_RUNTIME_KEY = '__stxSharedDialogState';
const SHARED_DIALOG_RUNTIME_VERSION = 1;

export const SHARED_DIALOG_ROOT_SELECTOR = '[data-stx-dialog-root="true"]';
export const SHARED_DIALOG_SURFACE_SELECTOR = '[data-stx-dialog-surface="true"]';

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, '&#96;');
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function applyAttributesToElement(
  element: HTMLElement,
  attributes?: Record<string, SharedDialogAttributeValue>,
): void {
  if (!attributes) {
    return;
  }
  Object.entries(attributes).forEach(([key, value]): void => {
    if (value == null || value === false) {
      return;
    }
    if (value === true) {
      element.setAttribute(key, '');
      return;
    }
    element.setAttribute(key, String(value));
  });
}

function createDialogId(): string {
  return `stx-shared-dialog-${Math.random().toString(36).slice(2, 10)}`;
}

function getGlobalState(): SharedDialogState {
  const globalRef = globalThis as SharedDialogGlobalRef;
  const existing = globalRef[SHARED_DIALOG_RUNTIME_KEY] as SharedDialogState | undefined;
  if (existing && existing.version === SHARED_DIALOG_RUNTIME_VERSION) {
    return existing;
  }
  const created: SharedDialogState = {
    version: SHARED_DIALOG_RUNTIME_VERSION,
    bound: false,
    host: null,
    dialogs: [],
    unbindHandlers: [],
  };
  globalRef[SHARED_DIALOG_RUNTIME_KEY] = created;
  return created;
}

function ensureStyle(): void {
  const existing = document.getElementById(SHARED_DIALOG_STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== sharedDialogCssText) {
      existing.textContent = sharedDialogCssText;
    }
    return;
  }
  const style = document.createElement('style');
  style.id = SHARED_DIALOG_STYLE_ID;
  style.textContent = sharedDialogCssText;
  document.head.appendChild(style);
}

function findScopedHost(hostElement: HTMLElement): HTMLDivElement | null {
  return Array.from(hostElement.children).find(
    (child): child is HTMLDivElement =>
      child instanceof HTMLDivElement &&
      child.classList.contains('stx-shared-dialog-host') &&
      child.dataset.stxDialogHostScope === 'local',
  ) ?? null;
}

function ensureHost(state: SharedDialogState, hostElement?: HTMLElement | null): HTMLDivElement {
  ensureStyle();
  if (hostElement instanceof HTMLElement) {
    const scopedHost = findScopedHost(hostElement) ?? document.createElement('div');
    if (!scopedHost.isConnected) {
      scopedHost.className = 'stx-shared-dialog-host';
      scopedHost.dataset.stxDialogHostScope = 'local';
      hostElement.appendChild(scopedHost);
    }
    mountThemeHost(scopedHost);
    return scopedHost;
  }
  let host = document.getElementById(SHARED_DIALOG_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = SHARED_DIALOG_HOST_ID;
    host.className = 'stx-shared-dialog-host';
    document.body.appendChild(host);
  }
  mountThemeHost(host);
  state.host = host;
  return host;
}

function findRuntimeById(state: SharedDialogState, id: string): SharedDialogRuntime | null {
  return state.dialogs.find((dialog: SharedDialogRuntime): boolean => dialog.id === id) ?? null;
}

function buildDialogChromeMarkup(id: string, chrome: SharedDialogChromeOptions | false | undefined, ariaLabel?: string): string {
  if (chrome === false) {
    return '';
  }
  const headerNeeded = Boolean(chrome?.eyebrow || chrome?.title || chrome?.description || chrome?.showCloseButton !== false);
  const footerNeeded = Boolean(chrome?.footerHtml);
  const titleId = chrome?.title ? `${id}__title` : '';
  const describedBy = chrome?.description ? `${id}__desc` : '';
  const headerMarkup = !headerNeeded
    ? ''
    : `
      <div class="stx-shared-dialog-header">
        <div class="stx-shared-dialog-title-wrap">
          ${chrome?.eyebrow ? `<div class="stx-shared-dialog-eyebrow">${escapeHtml(chrome.eyebrow)}</div>` : ''}
          ${chrome?.title ? `
            <div id="${escapeAttr(titleId)}" class="stx-shared-dialog-title">
              ${chrome.iconClassName ? `<i class="${escapeAttr(chrome.iconClassName)} stx-shared-dialog-title-icon" aria-hidden="true"></i>` : ''}
              <span>${escapeHtml(chrome.title)}</span>
            </div>
          ` : (ariaLabel ? `<div class="stx-shared-dialog-title">${escapeHtml(ariaLabel)}</div>` : '')}
          ${chrome?.description ? `<div id="${escapeAttr(describedBy)}" class="stx-shared-dialog-description">${escapeHtml(chrome.description)}</div>` : ''}
        </div>
        ${chrome?.showCloseButton === false ? '' : `<button type="button" class="stx-shared-dialog-close" data-stx-dialog-close="button" aria-label="${escapeAttr(chrome?.closeButtonLabel || '关闭对话框')}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`}
      </div>
    `;
  const footerMarkup = footerNeeded ? `<div class="stx-shared-dialog-footer">${chrome?.footerHtml ?? ''}</div>` : '';
  return `${headerMarkup}${footerMarkup}`;
}

function createCloseContext(runtime: SharedDialogRuntime, reason: SharedDialogCloseReason): SharedDialogCloseContext {
  return {
    id: runtime.id,
    reason,
    root: runtime.root,
    surface: runtime.surface,
    content: runtime.content,
  };
}

function getFocusableTarget(runtime: SharedDialogRuntime): HTMLElement | null {
  const initialFocus = runtime.options.initialFocus;
  const resolvedInitial = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
  if (resolvedInitial && resolvedInitial.isConnected) {
    return resolvedInitial;
  }
  if (runtime.options.initialFocusSelector) {
    const matched = runtime.root.querySelector<HTMLElement>(runtime.options.initialFocusSelector);
    if (matched) {
      return matched;
    }
  }
  return runtime.root.querySelector<HTMLElement>(
    '[data-stx-dialog-autofocus="true"], [autofocus], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? runtime.surface;
}

function focusInitial(runtime: SharedDialogRuntime): void {
  const target = getFocusableTarget(runtime);
  target?.focus();
}

function refreshDialogStack(state: SharedDialogState): void {
  state.dialogs.forEach((runtime: SharedDialogRuntime, index: number): void => {
    runtime.root.style.zIndex = String(100000 + index);
  });
}

async function requestClose(runtime: SharedDialogRuntime, reason: SharedDialogCloseReason): Promise<boolean> {
  if (runtime.closing || runtime.closed) {
    return false;
  }
  const context = createCloseContext(runtime, reason);
  const allowed = await Promise.resolve(runtime.options.beforeClose?.(context));
  if (allowed === false) {
    return false;
  }

  runtime.closing = true;
  runtime.root.classList.remove('is-open', 'is-visible');
  runtime.options.onClose?.(context);

  const state = getGlobalState();
  const animationDurationMs = Math.max(0, Number(runtime.options.animationDurationMs ?? 180) || 180);
  window.setTimeout((): void => {
    if (!runtime.closed) {
      runtime.root.remove();
      runtime.closed = true;
    }
    state.dialogs = state.dialogs.filter((item: SharedDialogRuntime): boolean => item !== runtime);
    refreshDialogStack(state);
    runtime.options.onAfterClose?.(context);
    if (runtime.options.restoreFocus !== false && runtime.previousActiveElement?.isConnected) {
      runtime.previousActiveElement.focus();
    }
  }, animationDurationMs);
  return true;
}

function destroyRuntime(runtime: SharedDialogRuntime, reason: SharedDialogCloseReason): void {
  if (runtime.closed) {
    return;
  }
  runtime.closing = true;
  runtime.closed = true;
  runtime.root.remove();
  const state = getGlobalState();
  state.dialogs = state.dialogs.filter((item: SharedDialogRuntime): boolean => item !== runtime);
  refreshDialogStack(state);
  runtime.options.onAfterClose?.(createCloseContext(runtime, reason));
}

function bindRuntime(state: SharedDialogState): void {
  const keydownHandler = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Escape') {
      return;
    }
    const topmost = [...state.dialogs].reverse().find((dialog: SharedDialogRuntime): boolean => !dialog.closed && !dialog.closing && dialog.options.closeOnEscape !== false);
    if (!topmost) {
      return;
    }
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    const immediate = keyboardEvent as KeyboardEvent & { stopImmediatePropagation?: () => void };
    immediate.stopImmediatePropagation?.();
    void topmost.close('escape');
  };

  document.addEventListener('keydown', keydownHandler, true);
  state.unbindHandlers.push(() => document.removeEventListener('keydown', keydownHandler, true));
  state.unbindHandlers.push(subscribeTheme((): void => {
    mountThemeHost(state.host ?? ensureHost(state));
    state.dialogs.forEach((dialog: SharedDialogRuntime): void => {
      mountThemeHost(dialog.root);
    });
  }));
}

export function getSharedDialogInstance(id: string): SharedDialogInstance | null {
  const runtime = findRuntimeById(getGlobalState(), id);
  return runtime ?? null;
}

export function closeSharedDialog(id: string, reason: SharedDialogCloseReason = 'api'): Promise<boolean> {
  const runtime = findRuntimeById(getGlobalState(), id);
  if (!runtime) {
    return Promise.resolve(false);
  }
  return runtime.close(reason);
}

export function destroySharedDialog(id: string, reason: SharedDialogCloseReason = 'destroy'): void {
  const runtime = findRuntimeById(getGlobalState(), id);
  if (!runtime) {
    return;
  }
  runtime.destroy(reason);
}

export function openSharedDialog(options: SharedDialogOptions = {}): SharedDialogInstance {
  const state = getGlobalState();
  const host = ensureHost(state, options.hostElement);
  const closeOnBackdrop = options.closeOnBackdrop !== false;
  if (!state.bound) {
    bindRuntime(state);
    state.bound = true;
  }

  const id = String(options.id ?? createDialogId()).trim() || createDialogId();
  const existing = findRuntimeById(state, id);
  if (existing) {
    existing.destroy('replace');
  }

  const root = document.createElement('div');
  const surface = document.createElement('div');
  const backdrop = document.createElement('div');
  const content = document.createElement('div');
  const chrome = options.chrome === false ? false : (options.chrome ?? {});
  const titleId = chrome && chrome.title ? `${id}__title` : '';
  const descId = chrome && chrome.description ? `${id}__desc` : '';

  root.id = id;
  root.className = joinClassNames('stx-shared-dialog-root', options.rootClassName);
  root.setAttribute('data-stx-dialog-root', 'true');
  root.setAttribute('data-stx-dialog-size', options.size ?? 'md');
  applyAttributesToElement(root, options.rootAttributes);

  backdrop.className = 'stx-shared-dialog-backdrop';
  backdrop.setAttribute('data-stx-dialog-backdrop', 'true');

  surface.className = joinClassNames('stx-shared-dialog-surface', options.surfaceClassName);
  surface.setAttribute('data-stx-dialog-surface', 'true');
  surface.setAttribute('data-stx-dialog-layout', options.layout ?? 'panel');
  surface.setAttribute('role', 'dialog');
  surface.setAttribute('aria-modal', 'true');
  surface.tabIndex = -1;
  if (titleId) {
    surface.setAttribute('aria-labelledby', titleId);
  } else if (options.ariaLabel) {
    surface.setAttribute('aria-label', options.ariaLabel);
  }
  if (descId) {
    surface.setAttribute('aria-describedby', descId);
  }
  applyAttributesToElement(surface, options.surfaceAttributes);

  content.className = joinClassNames('stx-shared-dialog-content', options.contentClassName);
  content.setAttribute('data-stx-dialog-content', 'true');
  content.innerHTML = options.bodyHtml ?? '';

  if (chrome === false) {
    surface.appendChild(content);
  } else {
    const chromeWrap = document.createElement('div');
    chromeWrap.className = 'stx-shared-dialog-chrome';
    const chromeMarkup = buildDialogChromeMarkup(id, chrome, options.ariaLabel);
    chromeWrap.innerHTML = chromeMarkup;
    const footer = chromeWrap.querySelector('.stx-shared-dialog-footer');
    if (footer) {
      chromeWrap.insertBefore(content, footer);
    } else {
      chromeWrap.appendChild(content);
    }
    surface.appendChild(chromeWrap);
  }

  root.appendChild(backdrop);
  root.appendChild(surface);
  host.appendChild(root);
  mountThemeHost(root);

  const runtime: SharedDialogRuntime = {
    id,
    root,
    backdrop,
    surface,
    content,
    options,
    previousActiveElement: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    closing: false,
    closed: false,
    close: (reason: SharedDialogCloseReason = 'api'): Promise<boolean> => requestClose(runtime, reason),
    destroy: (reason: SharedDialogCloseReason = 'destroy'): void => destroyRuntime(runtime, reason),
    focusInitial: (): void => focusInitial(runtime),
  };

  const closeButton = root.querySelector<HTMLButtonElement>('[data-stx-dialog-close="button"]');
  closeButton?.addEventListener('click', (): void => {
    void runtime.close('button');
  });

  const handleBackdropLikeClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!closeOnBackdrop) {
      return;
    }
    void runtime.close('backdrop');
  };

  backdrop.addEventListener('click', handleBackdropLikeClick);
  root.addEventListener('click', (event: Event): void => {
    if (event.target !== root) {
      return;
    }
    handleBackdropLikeClick(event);
  });
  surface.addEventListener('click', (event: Event): void => {
    if (event.target !== surface) {
      return;
    }
    handleBackdropLikeClick(event);
  });
  content.addEventListener('click', (event: Event): void => {
    if (event.target !== content) {
      return;
    }
    handleBackdropLikeClick(event);
  });

  state.dialogs.push(runtime);
  refreshDialogStack(state);
  options.onMount?.(runtime);

  requestAnimationFrame((): void => {
    root.classList.add('is-open', 'is-visible');
    runtime.focusInitial();
    options.onAfterOpen?.(runtime);
  });

  return runtime;
}