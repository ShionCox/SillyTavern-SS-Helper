import sharedContextMenuCssText from './sharedContextMenu.css?inline';
import { mountThemeHost, subscribeTheme } from '../SDK/theme';

const CONTEXT_MENU_STYLE_ID = 'stx-shared-context-menu-style';
const CONTEXT_MENU_ID = 'stx-shared-context-menu';
const CONTEXT_MENU_RUNTIME_KEY = '__stxSharedContextMenuState';
const CONTEXT_MENU_RUNTIME_VERSION = 1;

type SharedContextMenuGlobalRef = typeof globalThis & {
  [key: string]: unknown;
};

export interface SharedContextMenuItem {
  id?: string;
  label: string;
  iconClassName?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface SharedContextMenuOptions {
  x: number;
  y: number;
  items: SharedContextMenuItem[];
  onClose?: () => void;
}

interface SharedContextMenuRuntime {
  root: HTMLDivElement;
  panel: HTMLDivElement;
  list: HTMLDivElement;
}

interface SharedContextMenuState {
  version: number;
  bound: boolean;
  runtime: SharedContextMenuRuntime | null;
  onClose: (() => void) | null;
  unbindHandlers: Array<() => void>;
}

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

function getGlobalState(): SharedContextMenuState {
  const g = globalThis as SharedContextMenuGlobalRef;
  const existing = g[CONTEXT_MENU_RUNTIME_KEY] as SharedContextMenuState | undefined;
  if (existing && existing.version === CONTEXT_MENU_RUNTIME_VERSION) {
    return existing;
  }

  const created: SharedContextMenuState = {
    version: CONTEXT_MENU_RUNTIME_VERSION,
    bound: false,
    runtime: null,
    onClose: null,
    unbindHandlers: [],
  };
  g[CONTEXT_MENU_RUNTIME_KEY] = created;
  return created;
}

function ensureStyle(): void {
  const existing = document.getElementById(CONTEXT_MENU_STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== sharedContextMenuCssText) existing.textContent = sharedContextMenuCssText;
    return;
  }
  const style = document.createElement('style');
  style.id = CONTEXT_MENU_STYLE_ID;
  style.textContent = sharedContextMenuCssText;
  document.head.appendChild(style);
}

function ensureRuntime(state: SharedContextMenuState): SharedContextMenuRuntime {
  ensureStyle();

  let root = document.getElementById(CONTEXT_MENU_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = CONTEXT_MENU_ID;
    root.className = 'stx-shared-context-menu-root';
    root.setAttribute('data-ui', 'shared-context-menu');
    document.body.appendChild(root);
  }

  let panel = root.querySelector<HTMLDivElement>('.stx-shared-context-menu-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'stx-shared-context-menu-panel';
    panel.setAttribute('role', 'menu');
    panel.tabIndex = -1;
    root.appendChild(panel);
  }

  let list = panel.querySelector<HTMLDivElement>('.stx-shared-context-menu-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'stx-shared-context-menu-list';
    panel.appendChild(list);
  }

  mountThemeHost(root);
  state.runtime = { root, panel, list };
  return state.runtime;
}

function closeMenu(state: SharedContextMenuState): void {
  const runtime = state.runtime;
  if (!runtime) return;
  runtime.root.classList.remove('is-open');
  runtime.list.innerHTML = '';
  const onClose = state.onClose;
  state.onClose = null;
  if (onClose) {
    try { onClose(); } catch { /* ignore */ }
  }
}

function bind(
  state: SharedContextMenuState,
  target: Window | Document,
  event: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  const opts = options ?? false;
  target.addEventListener(event, listener, opts);
  state.unbindHandlers.push(() => target.removeEventListener(event, listener, opts));
}

function bindRuntime(state: SharedContextMenuState): void {
  bind(state, document, 'pointerdown', (event: Event) => {
    const runtime = state.runtime;
    if (!runtime || !runtime.root.classList.contains('is-open')) return;
    if (runtime.panel.contains(event.target as Node)) return;
    closeMenu(state);
  }, true);

  bind(state, document, 'contextmenu', (event: Event) => {
    const runtime = state.runtime;
    if (!runtime || !runtime.root.classList.contains('is-open')) return;
    if (runtime.panel.contains(event.target as Node)) return;
    closeMenu(state);
  }, true);

  bind(state, window, 'keydown', (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Escape') {
      closeMenu(state);
    }
  }, true);

  bind(state, window, 'resize', () => closeMenu(state));
  bind(state, window, 'scroll', () => closeMenu(state), true);

  state.unbindHandlers.push(subscribeTheme(() => {
    if (state.runtime?.root.classList.contains('is-open')) {
      mountThemeHost(state.runtime.root);
    }
  }));
}

function positionPanel(runtime: SharedContextMenuRuntime, x: number, y: number): void {
  runtime.panel.style.left = '0px';
  runtime.panel.style.top = '0px';
  runtime.root.classList.add('is-open');

  const panelRect = runtime.panel.getBoundingClientRect();
  const margin = 8;
  const maxX = window.innerWidth - panelRect.width - margin;
  const maxY = window.innerHeight - panelRect.height - margin;
  const nextX = Math.max(margin, Math.min(x, maxX));
  const nextY = Math.max(margin, Math.min(y, maxY));

  runtime.panel.style.left = `${Math.round(nextX)}px`;
  runtime.panel.style.top = `${Math.round(nextY)}px`;
}

export function hideSharedContextMenu(): void {
  const state = getGlobalState();
  closeMenu(state);
}

export function showSharedContextMenu(options: SharedContextMenuOptions): void {
  const items = Array.isArray(options.items) ? options.items.filter(Boolean) : [];
  if (items.length === 0) {
    hideSharedContextMenu();
    return;
  }

  const state = getGlobalState();
  const runtime = ensureRuntime(state);
  if (!state.bound) {
    bindRuntime(state);
    state.bound = true;
  }

  closeMenu(state);
  state.onClose = options.onClose ?? null;

  runtime.list.innerHTML = items.map((item: SharedContextMenuItem, index: number) => `
    <button
      type="button"
      class="stx-shared-context-menu-item${item.danger ? ' is-danger' : ''}"
      role="menuitem"
      data-menu-index="${index}"
      ${item.disabled ? 'disabled' : ''}
      ${item.id ? `data-menu-id="${escapeAttr(item.id)}"` : ''}
    >
      <span class="stx-shared-context-menu-item-icon" aria-hidden="true">${item.iconClassName ? `<i class="${escapeAttr(item.iconClassName)}"></i>` : ''}</span>
      <span class="stx-shared-context-menu-item-label">${escapeHtml(item.label)}</span>
    </button>
  `).join('');

  Array.from(runtime.list.querySelectorAll<HTMLButtonElement>('.stx-shared-context-menu-item')).forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.menuIndex ?? '-1');
      const item = items[index];
      if (!item || item.disabled) return;
      closeMenu(state);
      void Promise.resolve(item.onSelect()).catch((error: unknown) => {
        console.error('sharedContextMenu item execution failed:', error);
      });
    });
  });

  positionPanel(runtime, options.x, options.y);
  requestAnimationFrame(() => runtime.panel.focus());
}
