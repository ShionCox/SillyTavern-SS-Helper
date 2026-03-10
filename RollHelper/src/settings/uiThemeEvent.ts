import {
  applySdkThemeToNode,
  getSdkThemeState,
  resolveSdkThemeSelection,
} from "../../../SDK/theme";
import { syncSharedSelects } from "../../../_Components/sharedSelect";

let SDK_THEME_SYNC_BOUND_Event = false;

export function normalizeSettingsThemeEvent(
  theme: string
): "default" | "dark" | "light" | "tavern" {
  const normalized = String(theme || "").trim().toLowerCase();
  if (normalized === "dark" || normalized === "light" || normalized === "tavern") {
    return normalized;
  }
  if (normalized === "smart") return "tavern";
  return "default";
}

export function syncThemeControlClassesEvent(root: ParentNode | null, theme: string): void {
  if (!(root instanceof HTMLElement)) return;
  const normalizedTheme = normalizeSettingsThemeEvent(theme);
  const isTavern = normalizedTheme === "tavern";

  root.classList.toggle("is-theme-tavern", isTavern);

  root
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input.st-roll-input, input.st-roll-search, select.st-roll-select, textarea.st-roll-textarea"
    )
    .forEach((element) => {
      element.classList.toggle("text_pole", isTavern);
    });

  root.querySelectorAll<HTMLButtonElement>("button.st-roll-btn, button.st-roll-tab").forEach((button) => {
    button.classList.toggle("menu_button", isTavern);
    if (button.classList.contains("st-roll-tab")) {
      button.classList.toggle("active", isTavern && button.classList.contains("is-active"));
    } else if (!isTavern) {
      button.classList.remove("active");
    }
  });

  root.querySelectorAll<HTMLElement>(".stx-shared-checkbox-card").forEach((card) => {
    card.classList.toggle("is-tavern-native", isTavern);
  });
}

export function syncThemeControlClassesByNodeEvent(node: ParentNode | null): void {
  if (!(node instanceof HTMLElement)) return;
  const root = node.closest<HTMLElement>("[id][data-st-roll-theme]");
  if (!root) return;
  syncThemeControlClassesEvent(root, root.getAttribute("data-st-roll-theme") || "default");
}

export interface ApplySettingsThemeSelectionDepsEvent {
  settingsRoot: HTMLElement | null;
  skillModal: HTMLElement | null;
  statusModal: HTMLElement | null;
  selection: string;
  themeInput?: HTMLSelectElement | null;
  sdkThemeState?: ReturnType<typeof getSdkThemeState>;
  syncSharedSelectsEvent?: boolean;
}

export function applySettingsThemeSelectionEvent(
  deps: ApplySettingsThemeSelectionDepsEvent
): void {
  const selection = normalizeSettingsThemeEvent(deps.selection);
  const sdkThemeState = deps.sdkThemeState ?? getSdkThemeState();
  const shell = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-shell") ?? null;
  const content = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-content") ?? null;

  if (deps.themeInput) {
    deps.themeInput.value = selection;
  }

  deps.settingsRoot?.setAttribute("data-st-roll-theme", selection);
  shell?.setAttribute("data-st-roll-theme", selection);

  if (content) {
    content.setAttribute("data-st-roll-theme", selection);
    applySdkThemeToNode(content, { state: sdkThemeState });
  }
  if (deps.skillModal) {
    deps.skillModal.setAttribute("data-st-roll-theme", selection);
    applySdkThemeToNode(deps.skillModal, { state: sdkThemeState });
  }
  if (deps.statusModal) {
    deps.statusModal.setAttribute("data-st-roll-theme", selection);
    applySdkThemeToNode(deps.statusModal, { state: sdkThemeState });
  }

  syncThemeControlClassesEvent(content ?? deps.settingsRoot, selection);
  syncThemeControlClassesEvent(deps.skillModal, selection);
  syncThemeControlClassesEvent(deps.statusModal, selection);

  if (deps.syncSharedSelectsEvent !== false) {
    syncSharedSelects(content ?? deps.settingsRoot ?? document);
  }
}

export function ensureSdkThemeUiBindingEvent(
  cardId: string,
  skillModalId: string,
  statusModalId: string
): void {
  if (SDK_THEME_SYNC_BOUND_Event) return;
  SDK_THEME_SYNC_BOUND_Event = true;

  document.addEventListener("stx-sdk-theme-changed", () => {
    const settingsRoot = document.getElementById(cardId) as HTMLElement | null;
    const themeInput =
      settingsRoot?.querySelector<HTMLSelectElement>('select.stx-shared-select-native[id$="-theme"]') ?? null;

    applySettingsThemeSelectionEvent({
      settingsRoot,
      themeInput,
      skillModal: document.getElementById(skillModalId) as HTMLElement | null,
      statusModal: document.getElementById(statusModalId) as HTMLElement | null,
      selection: resolveSdkThemeSelection(getSdkThemeState()),
    });
  });
}
