import {
  applySdkThemeToNode,
  getSdkThemeState,
  resolveSdkThemeSelection,
  subscribeSdkTheme,
} from "../../../SDK/theme";
import { syncSharedSelects } from "../../../_Components/sharedSelect";

let SDK_THEME_SYNC_BOUND_Event = false;

function traceRollHelperThemeUi(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`[SS-Helper][RollHelperThemeUI] ${message}`);
    return;
  }
  console.info(`[SS-Helper][RollHelperThemeUI] ${message}`, payload);
}

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

function buildSettingsSdkThemeStateEvent(
  selection: string
): ReturnType<typeof getSdkThemeState> {
  const normalizedSelection = normalizeSettingsThemeEvent(selection);
  return {
    mode: "sdk",
    themeId: normalizedSelection,
  };
}

function syncSettingsThemeRuntimeVarsEvent(
  target: HTMLElement | null,
  sdkThemeState: ReturnType<typeof getSdkThemeState>
): void {
  if (!(target instanceof HTMLElement)) return;
  // 清除之前 snapshot 写入的残留 --stx-theme-* 内联变量，让 CSS 级联重新生效
  const inlineStyle = target.style;
  const stale: string[] = [];
  for (let i = 0; i < inlineStyle.length; i++) {
    if (inlineStyle[i].startsWith("--stx-theme-")) stale.push(inlineStyle[i]);
  }
  for (const prop of stale) inlineStyle.removeProperty(prop);
  applySdkThemeToNode(target, { state: sdkThemeState });
}

export function applySettingsThemeSelectionEvent(
  deps: ApplySettingsThemeSelectionDepsEvent
): void {
  const selection = normalizeSettingsThemeEvent(deps.selection);
  const sdkThemeState = deps.sdkThemeState ?? buildSettingsSdkThemeStateEvent(selection);
  const shell = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-shell") ?? null;
  const content = deps.settingsRoot?.querySelector<HTMLElement>(".st-roll-content") ?? null;

  if (deps.themeInput) {
    deps.themeInput.value = selection;
  }

  deps.settingsRoot?.setAttribute("data-st-roll-theme", selection);
  shell?.setAttribute("data-st-roll-theme", selection);
  syncSettingsThemeRuntimeVarsEvent(deps.settingsRoot, sdkThemeState);
  syncSettingsThemeRuntimeVarsEvent(shell, sdkThemeState);

  if (content) {
    content.setAttribute("data-st-roll-theme", selection);
    syncSettingsThemeRuntimeVarsEvent(content, sdkThemeState);
  }
  if (deps.skillModal) {
    deps.skillModal.setAttribute("data-st-roll-theme", selection);
    syncSettingsThemeRuntimeVarsEvent(deps.skillModal, sdkThemeState);
  }
  if (deps.statusModal) {
    deps.statusModal.setAttribute("data-st-roll-theme", selection);
    syncSettingsThemeRuntimeVarsEvent(deps.statusModal, sdkThemeState);
  }

  syncThemeControlClassesEvent(content ?? deps.settingsRoot, selection);
  syncThemeControlClassesEvent(deps.skillModal, selection);
  syncThemeControlClassesEvent(deps.statusModal, selection);

  if (deps.syncSharedSelectsEvent !== false) {
    syncSharedSelects(content ?? deps.settingsRoot ?? document);
  }

  traceRollHelperThemeUi("applySettingsThemeSelectionEvent", {
    selection,
    sdkThemeState,
    settingsRoot: deps.settingsRoot
      ? {
          stRollTheme: deps.settingsRoot.getAttribute("data-st-roll-theme"),
          stxTheme: deps.settingsRoot.getAttribute("data-stx-theme"),
          stxMode: deps.settingsRoot.getAttribute("data-stx-theme-mode"),
        }
      : null,
    content: content
      ? {
          stRollTheme: content.getAttribute("data-st-roll-theme"),
          stxTheme: content.getAttribute("data-stx-theme"),
          stxMode: content.getAttribute("data-stx-theme-mode"),
          computedContentBg: getComputedStyle(content).getPropertyValue("--st-roll-content-bg").trim() || "(empty)",
          computedStxSurface2: getComputedStyle(content).getPropertyValue("--stx-theme-surface-2").trim() || "(empty)",
          inlineStyle: content.getAttribute("style") || "(none)",
        }
      : null,
    skillModal: deps.skillModal
      ? {
          stRollTheme: deps.skillModal.getAttribute("data-st-roll-theme"),
          stxTheme: deps.skillModal.getAttribute("data-stx-theme"),
          stxMode: deps.skillModal.getAttribute("data-stx-theme-mode"),
        }
      : null,
    statusModal: deps.statusModal
      ? {
          stRollTheme: deps.statusModal.getAttribute("data-st-roll-theme"),
          stxTheme: deps.statusModal.getAttribute("data-stx-theme"),
          stxMode: deps.statusModal.getAttribute("data-stx-theme-mode"),
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

  subscribeSdkTheme((sdkThemeState) => {
    const settingsRoot = document.getElementById(cardId) as HTMLElement | null;
    const themeInput =
      settingsRoot?.querySelector<HTMLSelectElement>('select.stx-shared-select-native[id$="-theme"]') ?? null;

    applySettingsThemeSelectionEvent({
      settingsRoot,
      themeInput,
      skillModal: document.getElementById(skillModalId) as HTMLElement | null,
      statusModal: document.getElementById(statusModalId) as HTMLElement | null,
      selection: resolveSdkThemeSelection(sdkThemeState),
      sdkThemeState,
    });
  });
}
