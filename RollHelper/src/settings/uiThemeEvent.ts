import {
  mountThemeHost,
  unmountThemeHost,
  getTheme,
  subscribeTheme,
  normalizeThemeId,
  type ThemeId,
} from "../../../SDK/theme";
import { syncSharedSelects } from "../../../_Components/sharedSelect";

let SDK_THEME_SYNC_BOUND_Event = false;
const THEME_REFRESH_FRAME_BY_TARGET_Event = new WeakMap<HTMLElement, number>();

function traceRollHelperThemeUi(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`[SS-Helper][RollHelperThemeUI] ${message}`);
    return;
  }
  console.info(`[SS-Helper][RollHelperThemeUI] ${message}`, payload);
}

export function syncThemeControlClassesEvent(root: ParentNode | null, theme: string): void {
  if (!(root instanceof HTMLElement)) return;
  const normalizedTheme = normalizeThemeId(theme);
  const isHost = normalizedTheme === "host";

  root
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input.st-roll-input, input.st-roll-search, select.st-roll-select, textarea.st-roll-textarea"
    )
    .forEach((element) => {
      element.classList.toggle("text_pole", isHost);
    });

  root.querySelectorAll<HTMLButtonElement>("button.st-roll-btn, button.st-roll-tab").forEach((button) => {
    button.classList.toggle("menu_button", isHost);
    if (button.classList.contains("st-roll-tab")) {
      button.classList.toggle("active", isHost && button.classList.contains("is-active"));
    } else if (!isHost) {
      button.classList.remove("active");
    }
  });

  root.querySelectorAll<HTMLElement>(".stx-shared-checkbox-card").forEach((card) => {
    card.classList.toggle("is-host-native", isHost);
  });
}

export function syncThemeControlClassesByNodeEvent(node: ParentNode | null): void {
  if (!(node instanceof HTMLElement)) return;
  const root = node.closest<HTMLElement>("[id][data-ss-theme]");
  if (!root) return;
  syncThemeControlClassesEvent(root, root.getAttribute("data-ss-theme") || "default");
}

export interface ApplySettingsThemeSelectionDepsEvent {
  settingsRoot: HTMLElement | null;
  skillModal: HTMLElement | null;
  statusModal: HTMLElement | null;
  selection: string;
  themeInput?: HTMLSelectElement | null;
  syncSharedSelectsEvent?: boolean;
}

function mountIfConnected(el: HTMLElement | null): void {
  if (el instanceof HTMLElement && el.isConnected) mountThemeHost(el);
}

function hasThemeRefreshableStateChangedEvent(
  target: HTMLElement | null,
  selection: string
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const prevSsTheme = target.getAttribute("data-ss-theme");
  if (prevSsTheme === null) return false;
  return prevSsTheme !== selection;
}

function reattachThemeRefreshTargetEvent(target: HTMLElement): void {
  if (!target.isConnected) return;
  const parent = target.parentNode;
  if (!parent) return;
  const nextSibling = target.nextSibling;
  parent.removeChild(target);
  if (nextSibling && nextSibling.parentNode === parent) {
    parent.insertBefore(target, nextSibling);
  } else {
    parent.appendChild(target);
  }
}

function scheduleThemeRefreshTargetEvent(target: HTMLElement | null): void {
  if (!(target instanceof HTMLElement) || !target.isConnected) return;
  const pendingFrame = THEME_REFRESH_FRAME_BY_TARGET_Event.get(target);
  if (pendingFrame) {
    window.cancelAnimationFrame(pendingFrame);
  }
  const frame = window.requestAnimationFrame(() => {
    THEME_REFRESH_FRAME_BY_TARGET_Event.delete(target);
    reattachThemeRefreshTargetEvent(target);
    syncSharedSelects(target);
  });
  THEME_REFRESH_FRAME_BY_TARGET_Event.set(target, frame);
}

export function applySettingsThemeSelectionEvent(
  deps: ApplySettingsThemeSelectionDepsEvent
): void {
  const selection = normalizeThemeId(deps.selection);
  const shell = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-shell") ?? null;
  const content = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-content") ?? null;
  const skillModalPanel =
    deps.skillModal?.querySelector<HTMLElement>(".st-roll-skill-modal-panel") ?? deps.skillModal ?? null;
  const statusModalPanel =
    deps.statusModal?.querySelector<HTMLElement>(".st-roll-status-modal-panel") ?? deps.statusModal ?? null;
  const contentNeedsRefresh = hasThemeRefreshableStateChangedEvent(content, selection);
  const skillModalNeedsRefresh = hasThemeRefreshableStateChangedEvent(skillModalPanel, selection);
  const statusModalNeedsRefresh = hasThemeRefreshableStateChangedEvent(statusModalPanel, selection);

  if (deps.themeInput) {
    deps.themeInput.value = selection;
  }

  if (deps.settingsRoot instanceof HTMLElement) {
    unmountThemeHost(deps.settingsRoot);
  }
  if (shell instanceof HTMLElement) {
    unmountThemeHost(shell);
  }
  if (content) {
    mountIfConnected(content);
  }
  if (deps.skillModal) {
    mountIfConnected(deps.skillModal);
  }
  if (deps.statusModal) {
    mountIfConnected(deps.statusModal);
  }

  syncThemeControlClassesEvent(content ?? deps.settingsRoot, selection);
  syncThemeControlClassesEvent(deps.skillModal, selection);
  syncThemeControlClassesEvent(deps.statusModal, selection);

  if (deps.syncSharedSelectsEvent !== false) {
    syncSharedSelects(content ?? deps.settingsRoot ?? document);
  }
  if (contentNeedsRefresh) {
    scheduleThemeRefreshTargetEvent(content);
  }
  if (skillModalNeedsRefresh) {
    scheduleThemeRefreshTargetEvent(skillModalPanel);
  }
  if (statusModalNeedsRefresh) {
    scheduleThemeRefreshTargetEvent(statusModalPanel);
  }

  traceRollHelperThemeUi("applySettingsThemeSelectionEvent", {
    selection,
    settingsRoot: deps.settingsRoot
      ? {
          ssTheme: deps.settingsRoot.getAttribute("data-ss-theme"),
        }
      : null,
    content: content
      ? {
          ssTheme: content.getAttribute("data-ss-theme"),
        }
      : null,
    skillModal: deps.skillModal
      ? {
          ssTheme: deps.skillModal.getAttribute("data-ss-theme"),
        }
      : null,
    statusModal: deps.statusModal
      ? {
          ssTheme: deps.statusModal.getAttribute("data-ss-theme"),
        }
      : null,
  });
}

export function ensureSdkThemeUiBindingEvent(
  cardId: string,
  skillModalId: string,
  statusModalId: string
): void {
  if (SDK_THEME_SYNC_BOUND_Event) return;
  SDK_THEME_SYNC_BOUND_Event = true;

  subscribeTheme(() => {
    const settingsRoot = document.getElementById(cardId) as HTMLElement | null;
    const themeInput =
      settingsRoot?.querySelector<HTMLSelectElement>('select.stx-shared-select-native[id$="-theme"]') ?? null;
    const { themeId } = getTheme();

    applySettingsThemeSelectionEvent({
      settingsRoot,
      themeInput,
      skillModal: document.getElementById(skillModalId) as HTMLElement | null,
      statusModal: document.getElementById(statusModalId) as HTMLElement | null,
      selection: themeId,
    });
  });
}
