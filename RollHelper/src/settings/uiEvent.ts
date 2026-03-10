import type { ActiveStatusEvent } from "../types/eventDomainEvent";
import {
  buildSdkThemePatchFromSelection,
  getSdkThemeState,
  initializeSdkThemeState,
  resolveSdkThemeSelection,
  setSdkThemeState,
} from "../../../SDK/theme";
import {
  type BindSkillImportExportActionsDepsEvent,
  type BindSkillPresetActionsDepsEvent,
  type BindSkillRowsEditingActionsDepsEvent,
  bindSkillImportExportActionsEvent,
  bindSkillPresetActionsEvent,
  bindSkillRowsEditingActionsEvent,
} from "./skillEditorUiEvent";
import {
  type BindStatusEditorActionsDepsEvent,
  bindStatusEditorActionsEvent,
  isStatusEditorChatDraftDirtyEvent,
  renderStatusValidationErrorsEvent,
  syncStatusEditorCurrentChatFromRuntimeEvent,
} from "./statusEditorUiEvent";
import {
  applySettingsThemeSelectionEvent,
  normalizeSettingsThemeEvent,
  syncThemeControlClassesByNodeEvent,
} from "./uiThemeEvent";
import { syncSharedSelects } from "../../../_Components/sharedSelect";

export {
  applySettingsTooltipsEvent,
  buildSettingsCardTemplateIdsEvent,
  ensureSettingsCardStylesEvent,
  mountSettingsCardShellEvent,
  syncSettingsBadgeVersionEvent,
} from "./uiCardEvent";
export type {
  BuildSettingsCardTemplateIdsDepsEvent,
  EnsureSettingsCardStylesDepsEvent,
  MountSettingsCardShellDepsEvent,
  SyncSettingsBadgeVersionDepsEvent,
} from "./uiCardEvent";

export {
  applySettingsThemeSelectionEvent,
  ensureSdkThemeUiBindingEvent,
  normalizeSettingsThemeEvent,
  syncThemeControlClassesByNodeEvent,
  syncThemeControlClassesEvent,
} from "./uiThemeEvent";
export type { ApplySettingsThemeSelectionDepsEvent } from "./uiThemeEvent";

export {
  bindSkillImportExportActionsEvent,
  bindSkillPresetActionsEvent,
  bindSkillRowsEditingActionsEvent,
  confirmDiscardSkillDraftEvent,
  copyTextToClipboardEvent,
  createSkillDraftAccessorEvent,
  isElementVisibleEvent,
  renderSkillPresetListEvent,
  renderSkillPresetMetaEvent,
  renderSkillRowsEvent,
  renderSkillValidationErrorsEvent,
} from "./skillEditorUiEvent";
export type {
  BindSkillImportExportActionsDepsEvent,
  BindSkillPresetActionsDepsEvent,
  BindSkillRowsEditingActionsDepsEvent,
  ConfirmDiscardSkillDraftDepsEvent,
  CreateSkillDraftAccessorDepsEvent,
  RenderSkillPresetListDepsEvent,
  RenderSkillPresetMetaDepsEvent,
  RenderSkillRowsDepsEvent,
  RenderSkillValidationErrorsDepsEvent,
  SkillDraftAccessorEvent,
} from "./skillEditorUiEvent";

export {
  bindStatusEditorActionsEvent,
  isStatusEditorChatDraftDirtyEvent,
  renderStatusValidationErrorsEvent,
  syncStatusEditorCurrentChatFromRuntimeEvent,
} from "./statusEditorUiEvent";
export type {
  BindStatusEditorActionsDepsEvent,
} from "./statusEditorUiEvent";

let SKILL_EDITOR_BEFORE_UNLOAD_BOUND_Event = false;
let SKILL_EDITOR_MODAL_KEYDOWN_BOUND_Event = false;

export interface BindSettingsTabsAndModalDepsEvent {
  drawerToggleId: string;
  drawerContentId: string;
  SETTINGS_TAB_MAIN_ID_Event: string;
  SETTINGS_TAB_SKILL_ID_Event: string;
  SETTINGS_TAB_RULE_ID_Event: string;
  SETTINGS_TAB_ABOUT_ID_Event: string;
  SETTINGS_PANEL_MAIN_ID_Event: string;
  SETTINGS_PANEL_SKILL_ID_Event: string;
  SETTINGS_PANEL_RULE_ID_Event: string;
  SETTINGS_PANEL_ABOUT_ID_Event: string;
  SETTINGS_SKILL_MODAL_ID_Event: string;
  SETTINGS_SKILL_EDITOR_OPEN_ID_Event: string;
  SETTINGS_SKILL_MODAL_CLOSE_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event: string;
  SETTINGS_STATUS_MODAL_CLOSE_ID_Event: string;
  SETTINGS_SEARCH_ID_Event: string;
  confirmDiscardSkillDraftEvent: () => boolean;
  isElementVisibleEvent: (element: HTMLElement | null) => boolean;
  isSkillDraftDirtyEvent: () => boolean;
}

export function bindSettingsTabsAndModalEvent(deps: BindSettingsTabsAndModalDepsEvent): void {
  const tabMain = document.getElementById(deps.SETTINGS_TAB_MAIN_ID_Event) as HTMLButtonElement | null;
  const tabSkill = document.getElementById(deps.SETTINGS_TAB_SKILL_ID_Event) as HTMLButtonElement | null;
  const tabRule = document.getElementById(deps.SETTINGS_TAB_RULE_ID_Event) as HTMLButtonElement | null;
  const tabAbout = document.getElementById(deps.SETTINGS_TAB_ABOUT_ID_Event) as HTMLButtonElement | null;
  const panelMain = document.getElementById(deps.SETTINGS_PANEL_MAIN_ID_Event) as HTMLElement | null;
  const panelSkill = document.getElementById(deps.SETTINGS_PANEL_SKILL_ID_Event) as HTMLElement | null;
  const panelRule = document.getElementById(deps.SETTINGS_PANEL_RULE_ID_Event) as HTMLElement | null;
  const panelAbout = document.getElementById(deps.SETTINGS_PANEL_ABOUT_ID_Event) as HTMLElement | null;
  const skillModal = document.getElementById(deps.SETTINGS_SKILL_MODAL_ID_Event) as HTMLDialogElement | null;
  const skillEditorOpenBtn = document.getElementById(
    deps.SETTINGS_SKILL_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const skillModalCloseBtn = document.getElementById(
    deps.SETTINGS_SKILL_MODAL_CLOSE_ID_Event
  ) as HTMLButtonElement | null;
  const statusModal = document.getElementById(deps.SETTINGS_STATUS_MODAL_ID_Event) as HTMLDialogElement | null;
  const statusEditorOpenBtn = document.getElementById(
    deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const statusModalCloseBtn = document.getElementById(
    deps.SETTINGS_STATUS_MODAL_CLOSE_ID_Event
  ) as HTMLButtonElement | null;
  const searchInput = document.getElementById(deps.SETTINGS_SEARCH_ID_Event) as HTMLInputElement | null;

  const searchableMainItems = panelMain
    ? Array.from(panelMain.querySelectorAll<HTMLElement>(".st-roll-search-item"))
    : [];
  const searchableSkillItems = panelSkill
    ? Array.from(panelSkill.querySelectorAll<HTMLElement>(".st-roll-search-item"))
    : [];
  const searchableRuleItems = panelRule
    ? Array.from(panelRule.querySelectorAll<HTMLElement>(".st-roll-search-item"))
    : [];
  const searchableAboutItems = panelAbout
    ? Array.from(panelAbout.querySelectorAll<HTMLElement>(".st-roll-search-item"))
    : [];
  const searchableItems = [
    ...searchableMainItems,
    ...searchableSkillItems,
    ...searchableRuleItems,
    ...searchableAboutItems,
  ];

  let activeTab: "main" | "skill" | "rule" | "about" = "main";
  const ensureSettingsDrawerVisibleEvent = () => {
    const drawerContentNode = document.getElementById(deps.drawerContentId) as HTMLElement | null;
    if (!drawerContentNode) return;
    if (deps.isElementVisibleEvent(drawerContentNode)) return;

    const drawerToggleNode = document.getElementById(deps.drawerToggleId) as HTMLElement | null;
    drawerToggleNode?.click();
    if (deps.isElementVisibleEvent(drawerContentNode)) return;

    drawerContentNode.hidden = false;
    drawerContentNode.style.display = "block";
  };

  const closeSkillEditorModalEvent = () => {
    if (!skillModal) return;
    if (skillModal.open) {
      try {
        skillModal.close();
      } catch {
        // noop
      }
    }
    if (document.body.dataset.stRollSkillModalOpen === "1") {
      document.body.style.overflow = document.body.dataset.stRollSkillModalOverflow || "";
      delete document.body.dataset.stRollSkillModalOpen;
      delete document.body.dataset.stRollSkillModalOverflow;
    }
  };

  const openSkillEditorModalEvent = () => {
    if (!skillModal) return;
    ensureSettingsDrawerVisibleEvent();
    if (!skillModal.open) {
      try {
        skillModal.showModal();
      } catch {
        skillModal.setAttribute("open", "");
      }
    }
    if (document.body.dataset.stRollSkillModalOpen !== "1") {
      document.body.dataset.stRollSkillModalOpen = "1";
      document.body.dataset.stRollSkillModalOverflow = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
    }
  };

  const closeStatusEditorModalEvent = () => {
    if (!statusModal) return;
    if (statusModal.open) {
      try {
        statusModal.close();
      } catch {
        // noop
      }
    }
    if (document.body.dataset.stRollStatusModalOpen === "1") {
      document.body.style.overflow = document.body.dataset.stRollStatusModalOverflow || "";
      delete document.body.dataset.stRollStatusModalOpen;
      delete document.body.dataset.stRollStatusModalOverflow;
    }
  };

  const openStatusEditorModalEvent = () => {
    if (!statusModal) return;
    ensureSettingsDrawerVisibleEvent();
    if (!statusModal.open) {
      try {
        statusModal.showModal();
      } catch {
        statusModal.setAttribute("open", "");
      }
    }
    if (document.body.dataset.stRollStatusModalOpen !== "1") {
      document.body.dataset.stRollStatusModalOpen = "1";
      document.body.dataset.stRollStatusModalOverflow = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
    }
    document.dispatchEvent(new CustomEvent("st-roll-status-editor-opened"));
  };

  const activateTab = (tab: "main" | "skill" | "rule" | "about") => {
    activeTab = tab;
    const isMain = tab === "main";
    const isSkill = tab === "skill";
    const isRule = tab === "rule";
    const isAbout = tab === "about";
    tabMain?.classList.toggle("is-active", isMain);
    tabSkill?.classList.toggle("is-active", isSkill);
    tabRule?.classList.toggle("is-active", isRule);
    tabAbout?.classList.toggle("is-active", isAbout);
    if (panelMain) panelMain.hidden = !isMain;
    if (panelSkill) panelSkill.hidden = !isSkill;
    if (panelRule) panelRule.hidden = !isRule;
    if (panelAbout) panelAbout.hidden = !isAbout;
    syncThemeControlClassesByNodeEvent(tabMain || tabSkill || tabRule || tabAbout || panelMain || panelSkill || panelRule || panelAbout || null);
  };

  const tryActivateTab = (nextTab: "main" | "skill" | "rule" | "about"): boolean => {
    if (nextTab === activeTab) return true;
    if (activeTab === "skill" && nextTab !== "skill" && !deps.confirmDiscardSkillDraftEvent()) {
      return false;
    }
    if (nextTab !== "skill") {
      closeSkillEditorModalEvent();
    }
    closeStatusEditorModalEvent();
    activateTab(nextTab);
    return true;
  };

  const globalRef = globalThis as typeof globalThis & {
    __stRollPreviewEditorBridgeBoundEvent?: boolean;
  };
  if (!globalRef.__stRollPreviewEditorBridgeBoundEvent) {
    document.addEventListener("st-roll-open-skill-editor", () => {
      if (!tryActivateTab("skill")) return;
      openSkillEditorModalEvent();
    });
    document.addEventListener("st-roll-open-status-editor", () => {
      if (!tryActivateTab("main")) return;
      openStatusEditorModalEvent();
    });
    globalRef.__stRollPreviewEditorBridgeBoundEvent = true;
  }

  const applySettingsSearchFilter = () => {
    const query = String(searchInput?.value ?? "").trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);

    for (const item of searchableItems) {
      const source = `${item.dataset.stRollSearch ?? ""} ${item.textContent ?? ""}`.toLowerCase();
      const matched = tokens.every((token) => source.includes(token));
      item.classList.toggle("is-hidden-by-search", !matched);
    }

    if (!tokens.length) return;

    const hasMainVisible = searchableMainItems.some(
      (item) => !item.classList.contains("is-hidden-by-search")
    );
    const hasSkillVisible = searchableSkillItems.some(
      (item) => !item.classList.contains("is-hidden-by-search")
    );
    const hasRuleVisible = searchableRuleItems.some(
      (item) => !item.classList.contains("is-hidden-by-search")
    );
    const hasAboutVisible = searchableAboutItems.some(
      (item) => !item.classList.contains("is-hidden-by-search")
    );

    const hasVisibleByTab: Record<"main" | "skill" | "rule" | "about", boolean> = {
      main: hasMainVisible,
      skill: hasSkillVisible,
      rule: hasRuleVisible,
      about: hasAboutVisible,
    };
    if (!hasVisibleByTab[activeTab]) {
      const fallbackOrder: Array<"main" | "skill" | "rule" | "about"> = [
        "main",
        "skill",
        "rule",
        "about",
      ];
      const nextTab = fallbackOrder.find((tab) => hasVisibleByTab[tab]);
      if (nextTab) tryActivateTab(nextTab);
    }
  };

  activateTab("main");
  tabMain?.addEventListener("click", () => {
    if (!tryActivateTab("main")) return;
    applySettingsSearchFilter();
  });
  tabSkill?.addEventListener("click", () => {
    if (!tryActivateTab("skill")) return;
    applySettingsSearchFilter();
  });
  tabRule?.addEventListener("click", () => {
    if (!tryActivateTab("rule")) return;
    applySettingsSearchFilter();
  });
  tabAbout?.addEventListener("click", () => {
    if (!tryActivateTab("about")) return;
    applySettingsSearchFilter();
  });
  searchInput?.addEventListener("input", applySettingsSearchFilter);
  applySettingsSearchFilter();

  skillEditorOpenBtn?.addEventListener("click", () => {
    if (!tryActivateTab("skill")) return;
    openSkillEditorModalEvent();
  });

  skillModalCloseBtn?.addEventListener("click", () => {
    closeSkillEditorModalEvent();
  });

  skillModal?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (event.target === skillModal || target?.dataset.skillModalRole === "backdrop") {
      closeSkillEditorModalEvent();
    }
  });

  skillModal?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSkillEditorModalEvent();
  });

  statusEditorOpenBtn?.addEventListener("click", () => {
    if (!tryActivateTab("main")) return;
    openStatusEditorModalEvent();
  });

  statusModalCloseBtn?.addEventListener("click", () => {
    closeStatusEditorModalEvent();
  });

  statusModal?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (event.target === statusModal || target?.dataset.statusModalRole === "backdrop") {
      closeStatusEditorModalEvent();
    }
  });

  statusModal?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeStatusEditorModalEvent();
  });

  if (!SKILL_EDITOR_MODAL_KEYDOWN_BOUND_Event) {
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeSkillEditorModalEvent();
      closeStatusEditorModalEvent();
    });
    SKILL_EDITOR_MODAL_KEYDOWN_BOUND_Event = true;
  }

  const drawerToggle = document.getElementById(deps.drawerToggleId) as HTMLElement | null;
  const drawerContent = document.getElementById(deps.drawerContentId) as HTMLElement | null;
  drawerToggle?.addEventListener(
    "click",
    (event) => {
      if (!deps.isElementVisibleEvent(drawerContent)) return;
      if (deps.confirmDiscardSkillDraftEvent()) {
        closeSkillEditorModalEvent();
        closeStatusEditorModalEvent();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (
        typeof (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation ===
        "function"
      ) {
        (event as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation();
      }
    },
    true
  );

  if (!SKILL_EDITOR_BEFORE_UNLOAD_BOUND_Event) {
    window.addEventListener("beforeunload", (event) => {
      if (!deps.isSkillDraftDirtyEvent()) return;
      event.preventDefault();
      event.returnValue = "";
    });
    SKILL_EDITOR_BEFORE_UNLOAD_BOUND_Event = true;
  }
}

export interface BindBasicSettingsInputsDepsEvent {
  SETTINGS_THEME_ID_Event: string;
  SETTINGS_ENABLED_ID_Event: string;
  SETTINGS_RULE_ID_Event: string;
  SETTINGS_AI_ROLL_MODE_ID_Event: string;
  SETTINGS_AI_ROUND_CONTROL_ID_Event: string;
  SETTINGS_EXPLODING_ENABLED_ID_Event: string;
  SETTINGS_ADVANTAGE_ENABLED_ID_Event: string;
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event: string;
  SETTINGS_DYNAMIC_DC_REASON_ID_Event: string;
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event: string;
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event: string;
  SETTINGS_SUMMARY_DETAIL_ID_Event: string;
  SETTINGS_SUMMARY_ROUNDS_ID_Event: string;
  SETTINGS_SCOPE_ID_Event: string;
  SETTINGS_OUTCOME_BRANCHES_ID_Event: string;
  SETTINGS_EXPLODE_OUTCOME_ID_Event: string;
  SETTINGS_SUMMARY_OUTCOME_ID_Event: string;
  SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event: string;
  SETTINGS_TIME_LIMIT_ENABLED_ID_Event: string;
  SETTINGS_TIME_LIMIT_MIN_ID_Event: string;
  SETTINGS_COMPATIBILITY_MODE_ID_Event: string;
  SETTINGS_REMOVE_ROLLJSON_ID_Event: string;
  SETTINGS_STRIP_INTERNAL_ID_Event: string;
  SETTINGS_CLEAN_HISTORY_BTN_ID_Event: string;
  SETTINGS_SKILL_ENABLED_ID_Event: string;
  SUMMARY_HISTORY_ROUNDS_MAX_Event: number;
  SUMMARY_HISTORY_ROUNDS_MIN_Event: number;
  DEFAULT_SUMMARY_HISTORY_ROUNDS_Event: number;
  updateSettingsEvent: (patch: {
    theme?: "default" | "dark" | "light" | "tavern";
    enabled?: boolean;
    autoSendRuleToAI?: boolean;
    enableAiRollMode?: boolean;
    enableAiRoundControl?: boolean;
    enableExplodingDice?: boolean;
    enableAdvantageSystem?: boolean;
    enableDynamicResultGuidance?: boolean;
    enableDynamicDcReason?: boolean;
    enableStatusSystem?: boolean;
    aiAllowedDiceSidesText?: string;
    summaryDetailMode?: "minimal" | "balanced" | "detailed";
    summaryHistoryRounds?: number;
    eventApplyScope?: "protagonist_only" | "all";
    enableOutcomeBranches?: boolean;
    enableExplodeOutcomeBranch?: boolean;
    includeOutcomeInSummary?: boolean;
    showOutcomePreviewInListCard?: boolean;
    enableTimeLimit?: boolean;
    minTimeLimitSeconds?: number;
    compatibilityModeForSummaryPlugins?: boolean;
    removeRollJsonFromStoredText?: boolean;
    stripRollHelperInternalBlocks?: boolean;
    enableSkillSystem?: boolean;
  }) => void;
  cleanAllHistoryChatBlocksEvent: () => void;
}

export function bindBasicSettingsInputsEvent(deps: BindBasicSettingsInputsDepsEvent): void {
  const themeInput = document.getElementById(deps.SETTINGS_THEME_ID_Event) as HTMLSelectElement | null;
  const enabledInput = document.getElementById(deps.SETTINGS_ENABLED_ID_Event) as HTMLInputElement | null;
  const ruleInput = document.getElementById(deps.SETTINGS_RULE_ID_Event) as HTMLInputElement | null;
  const aiRollModeInput = document.getElementById(
    deps.SETTINGS_AI_ROLL_MODE_ID_Event
  ) as HTMLInputElement | null;
  const aiRoundControlInput = document.getElementById(
    deps.SETTINGS_AI_ROUND_CONTROL_ID_Event
  ) as HTMLInputElement | null;
  const explodingEnabledInput = document.getElementById(
    deps.SETTINGS_EXPLODING_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const advantageEnabledInput = document.getElementById(
    deps.SETTINGS_ADVANTAGE_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const dynamicResultGuidanceInput = document.getElementById(
    deps.SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event
  ) as HTMLInputElement | null;
  const dynamicDcReasonInput = document.getElementById(
    deps.SETTINGS_DYNAMIC_DC_REASON_ID_Event
  ) as HTMLInputElement | null;
  const statusSystemEnabledInput = document.getElementById(
    deps.SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const allowedDiceSidesInput = document.getElementById(
    deps.SETTINGS_ALLOWED_DICE_SIDES_ID_Event
  ) as HTMLInputElement | null;
  const summaryDetailInput = document.getElementById(
    deps.SETTINGS_SUMMARY_DETAIL_ID_Event
  ) as HTMLSelectElement | null;
  const summaryRoundsInput = document.getElementById(
    deps.SETTINGS_SUMMARY_ROUNDS_ID_Event
  ) as HTMLInputElement | null;
  const scopeInput = document.getElementById(deps.SETTINGS_SCOPE_ID_Event) as HTMLSelectElement | null;
  const outcomeBranchesInput = document.getElementById(
    deps.SETTINGS_OUTCOME_BRANCHES_ID_Event
  ) as HTMLInputElement | null;
  const explodeOutcomeInput = document.getElementById(
    deps.SETTINGS_EXPLODE_OUTCOME_ID_Event
  ) as HTMLInputElement | null;
  const includeOutcomeSummaryInput = document.getElementById(
    deps.SETTINGS_SUMMARY_OUTCOME_ID_Event
  ) as HTMLInputElement | null;
  const listOutcomePreviewInput = document.getElementById(
    deps.SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event
  ) as HTMLInputElement | null;
  const timeLimitEnabledInput = document.getElementById(
    deps.SETTINGS_TIME_LIMIT_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const minTimeLimitInput = document.getElementById(
    deps.SETTINGS_TIME_LIMIT_MIN_ID_Event
  ) as HTMLInputElement | null;
  const compatibilityModeInput = document.getElementById(
    deps.SETTINGS_COMPATIBILITY_MODE_ID_Event
  ) as HTMLInputElement | null;
  const removeRollJsonInput = document.getElementById(
    deps.SETTINGS_REMOVE_ROLLJSON_ID_Event
  ) as HTMLInputElement | null;
  const stripInternalBlocksInput = document.getElementById(
    deps.SETTINGS_STRIP_INTERNAL_ID_Event
  ) as HTMLInputElement | null;
  const cleanHistoryBtn = document.getElementById(
    deps.SETTINGS_CLEAN_HISTORY_BTN_ID_Event
  ) as HTMLButtonElement | null;
  const skillEnabledInput = document.getElementById(
    deps.SETTINGS_SKILL_ENABLED_ID_Event
  ) as HTMLInputElement | null;

  themeInput?.addEventListener("change", (event) => {
    const value = normalizeSettingsThemeEvent(String((event.target as HTMLSelectElement).value || ""));
    initializeSdkThemeState();
    setSdkThemeState(buildSdkThemePatchFromSelection(value));
    deps.updateSettingsEvent({ theme: value });
  });

  enabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enabled: value });
  });

  ruleInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ autoSendRuleToAI: value });
  });

  aiRollModeInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableAiRollMode: value });
  });

  aiRoundControlInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableAiRoundControl: value });
  });

  explodingEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableExplodingDice: value });
  });

  advantageEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableAdvantageSystem: value });
  });

  dynamicResultGuidanceInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableDynamicResultGuidance: value });
  });

  dynamicDcReasonInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableDynamicDcReason: value });
  });

  statusSystemEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableStatusSystem: value });
  });

  allowedDiceSidesInput?.addEventListener("change", (event) => {
    const value = String((event.target as HTMLInputElement).value || "").trim();
    deps.updateSettingsEvent({ aiAllowedDiceSidesText: value });
  });

  summaryDetailInput?.addEventListener("change", (event) => {
    const raw = String((event.target as HTMLSelectElement).value || "");
    const value: "minimal" | "balanced" | "detailed" =
      raw === "balanced" || raw === "detailed" ? (raw as "balanced" | "detailed") : "minimal";
    deps.updateSettingsEvent({ summaryDetailMode: value });
  });

  summaryRoundsInput?.addEventListener("change", (event) => {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw)
      ? Math.min(
        deps.SUMMARY_HISTORY_ROUNDS_MAX_Event,
        Math.max(deps.SUMMARY_HISTORY_ROUNDS_MIN_Event, Math.floor(raw))
      )
      : deps.DEFAULT_SUMMARY_HISTORY_ROUNDS_Event;
    deps.updateSettingsEvent({ summaryHistoryRounds: value });
  });

  scopeInput?.addEventListener("change", (event) => {
    const value = String((event.target as HTMLSelectElement).value || "");
    deps.updateSettingsEvent({
      eventApplyScope: value === "all" ? "all" : "protagonist_only",
    });
  });

  outcomeBranchesInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableOutcomeBranches: value });
  });

  explodeOutcomeInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableExplodeOutcomeBranch: value });
  });

  includeOutcomeSummaryInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ includeOutcomeInSummary: value });
  });

  listOutcomePreviewInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ showOutcomePreviewInListCard: value });
  });

  timeLimitEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableTimeLimit: value });
  });

  minTimeLimitInput?.addEventListener("change", (event) => {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 10;
    deps.updateSettingsEvent({ minTimeLimitSeconds: value });
  });

  skillEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableSkillSystem: value });
  });

  compatibilityModeInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ compatibilityModeForSummaryPlugins: value });
  });

  removeRollJsonInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ removeRollJsonFromStoredText: value });
  });

  stripInternalBlocksInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ stripRollHelperInternalBlocks: value });
  });

  cleanHistoryBtn?.addEventListener("click", () => {
    if (typeof deps.cleanAllHistoryChatBlocksEvent === "function") {
      deps.cleanAllHistoryChatBlocksEvent();
    }
  });
}

export interface BindRuleTextActionsDepsEvent {
  SETTINGS_RULE_TEXT_ID_Event: string;
  SETTINGS_RULE_SAVE_ID_Event: string;
  SETTINGS_RULE_RESET_ID_Event: string;
  updateSettingsEvent: (patch: { ruleText?: string }) => void;
}

export function bindRuleTextActionsEvent(deps: BindRuleTextActionsDepsEvent): void {
  const ruleTextInput = document.getElementById(
    deps.SETTINGS_RULE_TEXT_ID_Event
  ) as HTMLTextAreaElement | null;
  const ruleSaveBtn = document.getElementById(
    deps.SETTINGS_RULE_SAVE_ID_Event
  ) as HTMLButtonElement | null;
  const ruleResetBtn = document.getElementById(
    deps.SETTINGS_RULE_RESET_ID_Event
  ) as HTMLButtonElement | null;

  ruleSaveBtn?.addEventListener("click", () => {
    const value = String(ruleTextInput?.value ?? "");
    deps.updateSettingsEvent({ ruleText: value });
  });

  ruleResetBtn?.addEventListener("click", () => {
    if (ruleTextInput) {
      ruleTextInput.value = "";
    }
    deps.updateSettingsEvent({ ruleText: "" });
  });
}

export interface BindMountedSettingsCardDepsEvent {
  SETTINGS_CARD_ID_Event: string;
  drawerToggleId: string;
  drawerContentId: string;
  tabsAndModalDepsEvent: Omit<
    BindSettingsTabsAndModalDepsEvent,
    "drawerToggleId" | "drawerContentId"
  >;
  basicSettingsInputsDepsEvent: BindBasicSettingsInputsDepsEvent;
  skillPresetActionsDepsEvent: BindSkillPresetActionsDepsEvent;
  skillRowsEditingActionsDepsEvent: BindSkillRowsEditingActionsDepsEvent;
  skillImportExportActionsDepsEvent: BindSkillImportExportActionsDepsEvent;
  statusEditorActionsDepsEvent: BindStatusEditorActionsDepsEvent;
  ruleTextActionsDepsEvent: BindRuleTextActionsDepsEvent;
}

export function bindMountedSettingsCardEvent(deps: BindMountedSettingsCardDepsEvent): void {
  const settingsRoot = document.getElementById(deps.SETTINGS_CARD_ID_Event) as HTMLElement | null;
  if (settingsRoot?.dataset.stRollMountedBound === "1") return;
  if (settingsRoot) {
    settingsRoot.dataset.stRollMountedBound = "1";
  }

  bindSettingsTabsAndModalEvent({
    drawerToggleId: deps.drawerToggleId,
    drawerContentId: deps.drawerContentId,
    ...deps.tabsAndModalDepsEvent,
  });
  bindBasicSettingsInputsEvent(deps.basicSettingsInputsDepsEvent);
  bindSkillPresetActionsEvent(deps.skillPresetActionsDepsEvent);
  bindSkillRowsEditingActionsEvent(deps.skillRowsEditingActionsDepsEvent);
  bindSkillImportExportActionsEvent(deps.skillImportExportActionsDepsEvent);
  bindStatusEditorActionsEvent(deps.statusEditorActionsDepsEvent);
  bindRuleTextActionsEvent(deps.ruleTextActionsDepsEvent);
}

export interface SyncSettingsUiDepsEvent {
  getSettingsEvent: () => {
    theme: string;
    enabled: boolean;
    autoSendRuleToAI: boolean;
    enableAiRollMode: boolean;
    enableAiRoundControl: boolean;
    enableExplodingDice: boolean;
    enableAdvantageSystem: boolean;
    enableDynamicResultGuidance: boolean;
    enableDynamicDcReason: boolean;
    enableStatusSystem: boolean;
    aiAllowedDiceSidesText: string;
    summaryDetailMode: string;
    summaryHistoryRounds: number;
    eventApplyScope: string;
    enableOutcomeBranches: boolean;
    enableExplodeOutcomeBranch: boolean;
    includeOutcomeInSummary: boolean;
    showOutcomePreviewInListCard: boolean;
    enableTimeLimit: boolean;
    minTimeLimitSeconds: number;
    compatibilityModeForSummaryPlugins: boolean;
    removeRollJsonFromStoredText: boolean;
    stripRollHelperInternalBlocks: boolean;
    enableSkillSystem: boolean;
    skillTableText: string;
    skillPresetStoreText: string;
    ruleText: string;
  };
  SETTINGS_CARD_ID_Event: string;
  SETTINGS_THEME_ID_Event: string;
  SETTINGS_ENABLED_ID_Event: string;
  SETTINGS_RULE_ID_Event: string;
  SETTINGS_AI_ROLL_MODE_ID_Event: string;
  SETTINGS_AI_ROUND_CONTROL_ID_Event: string;
  SETTINGS_EXPLODING_ENABLED_ID_Event: string;
  SETTINGS_ADVANTAGE_ENABLED_ID_Event: string;
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event: string;
  SETTINGS_DYNAMIC_DC_REASON_ID_Event: string;
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event: string;
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event: string;
  SETTINGS_SUMMARY_DETAIL_ID_Event: string;
  SETTINGS_SUMMARY_ROUNDS_ID_Event: string;
  SETTINGS_SCOPE_ID_Event: string;
  SETTINGS_OUTCOME_BRANCHES_ID_Event: string;
  SETTINGS_EXPLODE_OUTCOME_ID_Event: string;
  SETTINGS_SUMMARY_OUTCOME_ID_Event: string;
  SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event: string;
  SETTINGS_TIME_LIMIT_ENABLED_ID_Event: string;
  SETTINGS_TIME_LIMIT_MIN_ID_Event: string;
  SETTINGS_TIME_LIMIT_ROW_ID_Event: string;
  SETTINGS_COMPATIBILITY_MODE_ID_Event: string;
  SETTINGS_REMOVE_ROLLJSON_ID_Event: string;
  SETTINGS_STRIP_INTERNAL_ID_Event: string;
  SETTINGS_CLEAN_HISTORY_BTN_ID_Event: string;
  SETTINGS_SKILL_ENABLED_ID_Event: string;
  SETTINGS_SKILL_MODAL_ID_Event: string;
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  SETTINGS_STATUS_ROWS_ID_Event: string;
  SETTINGS_STATUS_ERRORS_ID_Event: string;
  SETTINGS_STATUS_DIRTY_HINT_ID_Event: string;
  SETTINGS_RULE_TEXT_ID_Event: string;
  SETTINGS_SKILL_ROWS_ID_Event: string;
  getActiveStatusesEvent: () => ActiveStatusEvent[];
  getActiveChatKeyEvent: () => string;
  isSkillDraftDirtyEvent: () => boolean;
  hydrateSkillDraftFromSettingsEvent: () => void;
  getSkillEditorLastSettingsTextEvent: () => string;
  getSkillEditorLastPresetStoreTextEvent: () => string;
}

export function syncSettingsUiEvent(deps: SyncSettingsUiDepsEvent): void {
  const settings = deps.getSettingsEvent();
  const settingsRoot = document.getElementById(deps.SETTINGS_CARD_ID_Event) as HTMLElement | null;
  const themeInput = document.getElementById(deps.SETTINGS_THEME_ID_Event) as HTMLSelectElement | null;
  const enabledInput = document.getElementById(deps.SETTINGS_ENABLED_ID_Event) as HTMLInputElement | null;
  const ruleInput = document.getElementById(deps.SETTINGS_RULE_ID_Event) as HTMLInputElement | null;
  const aiRollModeInput = document.getElementById(
    deps.SETTINGS_AI_ROLL_MODE_ID_Event
  ) as HTMLInputElement | null;
  const aiRoundControlInput = document.getElementById(
    deps.SETTINGS_AI_ROUND_CONTROL_ID_Event
  ) as HTMLInputElement | null;
  const explodingEnabledInput = document.getElementById(
    deps.SETTINGS_EXPLODING_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const advantageEnabledInput = document.getElementById(
    deps.SETTINGS_ADVANTAGE_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const dynamicResultGuidanceInput = document.getElementById(
    deps.SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event
  ) as HTMLInputElement | null;
  const dynamicDcReasonInput = document.getElementById(
    deps.SETTINGS_DYNAMIC_DC_REASON_ID_Event
  ) as HTMLInputElement | null;
  const statusSystemEnabledInput = document.getElementById(
    deps.SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const allowedDiceSidesInput = document.getElementById(
    deps.SETTINGS_ALLOWED_DICE_SIDES_ID_Event
  ) as HTMLInputElement | null;
  const summaryDetailInput = document.getElementById(
    deps.SETTINGS_SUMMARY_DETAIL_ID_Event
  ) as HTMLSelectElement | null;
  const summaryRoundsInput = document.getElementById(
    deps.SETTINGS_SUMMARY_ROUNDS_ID_Event
  ) as HTMLInputElement | null;
  const scopeInput = document.getElementById(deps.SETTINGS_SCOPE_ID_Event) as HTMLSelectElement | null;
  const outcomeBranchesInput = document.getElementById(
    deps.SETTINGS_OUTCOME_BRANCHES_ID_Event
  ) as HTMLInputElement | null;
  const explodeOutcomeInput = document.getElementById(
    deps.SETTINGS_EXPLODE_OUTCOME_ID_Event
  ) as HTMLInputElement | null;
  const includeOutcomeSummaryInput = document.getElementById(
    deps.SETTINGS_SUMMARY_OUTCOME_ID_Event
  ) as HTMLInputElement | null;
  const listOutcomePreviewInput = document.getElementById(
    deps.SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event
  ) as HTMLInputElement | null;
  const timeLimitEnabledInput = document.getElementById(
    deps.SETTINGS_TIME_LIMIT_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const minTimeLimitInput = document.getElementById(
    deps.SETTINGS_TIME_LIMIT_MIN_ID_Event
  ) as HTMLInputElement | null;
  const minTimeLimitRow = document.getElementById(deps.SETTINGS_TIME_LIMIT_ROW_ID_Event) as HTMLElement | null;
  const compatibilityModeInput = document.getElementById(
    deps.SETTINGS_COMPATIBILITY_MODE_ID_Event
  ) as HTMLInputElement | null;
  const removeRollJsonInput = document.getElementById(
    deps.SETTINGS_REMOVE_ROLLJSON_ID_Event
  ) as HTMLInputElement | null;
  const stripInternalBlocksInput = document.getElementById(
    deps.SETTINGS_STRIP_INTERNAL_ID_Event
  ) as HTMLInputElement | null;
  const skillEnabledInput = document.getElementById(
    deps.SETTINGS_SKILL_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const skillModal = document.getElementById(deps.SETTINGS_SKILL_MODAL_ID_Event) as HTMLElement | null;
  const statusEditorOpenBtn = document.getElementById(
    deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const statusModal = document.getElementById(deps.SETTINGS_STATUS_MODAL_ID_Event) as HTMLElement | null;
  const ruleTextInput = document.getElementById(
    deps.SETTINGS_RULE_TEXT_ID_Event
  ) as HTMLTextAreaElement | null;
  const settingsContent =
    settingsRoot?.querySelector<HTMLElement>(".st-roll-content") ?? settingsRoot ?? null;

  initializeSdkThemeState();
  const sdkThemeState = getSdkThemeState();
  const sdkThemeSelection = normalizeSettingsThemeEvent(resolveSdkThemeSelection(sdkThemeState));
  if (themeInput) themeInput.value = sdkThemeSelection;

  if (enabledInput) enabledInput.checked = Boolean(settings.enabled);
  if (ruleInput) ruleInput.checked = Boolean(settings.autoSendRuleToAI);
  if (aiRollModeInput) aiRollModeInput.checked = Boolean(settings.enableAiRollMode);
  if (aiRoundControlInput) aiRoundControlInput.checked = Boolean(settings.enableAiRoundControl);
  if (explodingEnabledInput) explodingEnabledInput.checked = Boolean(settings.enableExplodingDice);
  if (advantageEnabledInput) advantageEnabledInput.checked = Boolean(settings.enableAdvantageSystem);
  if (dynamicResultGuidanceInput) {
    dynamicResultGuidanceInput.checked = Boolean(settings.enableDynamicResultGuidance);
  }
  if (dynamicDcReasonInput) {
    dynamicDcReasonInput.checked = Boolean(settings.enableDynamicDcReason);
  }
  if (statusSystemEnabledInput) {
    statusSystemEnabledInput.checked = Boolean(settings.enableStatusSystem);
  }
  if (allowedDiceSidesInput) allowedDiceSidesInput.value = String(settings.aiAllowedDiceSidesText || "");
  if (summaryDetailInput) summaryDetailInput.value = settings.summaryDetailMode;
  if (summaryRoundsInput) summaryRoundsInput.value = String(settings.summaryHistoryRounds);
  if (scopeInput) scopeInput.value = settings.eventApplyScope;
  if (outcomeBranchesInput) outcomeBranchesInput.checked = Boolean(settings.enableOutcomeBranches);
  if (explodeOutcomeInput) explodeOutcomeInput.checked = Boolean(settings.enableExplodeOutcomeBranch);
  if (includeOutcomeSummaryInput) {
    includeOutcomeSummaryInput.checked = Boolean(settings.includeOutcomeInSummary);
  }
  if (listOutcomePreviewInput) {
    listOutcomePreviewInput.checked = Boolean(settings.showOutcomePreviewInListCard);
  }
  if (explodeOutcomeInput) {
    explodeOutcomeInput.disabled = !settings.enableOutcomeBranches;
    explodeOutcomeInput.style.opacity = settings.enableOutcomeBranches ? "1" : "0.5";
  }
  if (includeOutcomeSummaryInput) {
    includeOutcomeSummaryInput.disabled = !settings.enableOutcomeBranches;
    includeOutcomeSummaryInput.style.opacity = settings.enableOutcomeBranches ? "1" : "0.5";
  }
  if (listOutcomePreviewInput) {
    listOutcomePreviewInput.disabled = !settings.enableOutcomeBranches;
    listOutcomePreviewInput.style.opacity = settings.enableOutcomeBranches ? "1" : "0.5";
  }
  if (timeLimitEnabledInput) timeLimitEnabledInput.checked = Boolean(settings.enableTimeLimit);
  if (minTimeLimitInput) {
    minTimeLimitInput.value = String(settings.minTimeLimitSeconds);
    minTimeLimitInput.disabled = !settings.enableTimeLimit;
    minTimeLimitInput.style.opacity = settings.enableTimeLimit ? "1" : "0.5";
  }
  minTimeLimitRow?.classList.toggle("is-disabled", !settings.enableTimeLimit);
  if (compatibilityModeInput) {
    compatibilityModeInput.checked = Boolean(settings.compatibilityModeForSummaryPlugins);
  }
  if (removeRollJsonInput) {
    removeRollJsonInput.checked = Boolean(settings.removeRollJsonFromStoredText);
  }
  if (stripInternalBlocksInput) {
    stripInternalBlocksInput.checked = Boolean(settings.stripRollHelperInternalBlocks);
  }
  if (skillEnabledInput) {
    skillEnabledInput.checked = Boolean(settings.enableSkillSystem);
  }
  if (statusEditorOpenBtn) {
    statusEditorOpenBtn.disabled = !settings.enableStatusSystem;
    statusEditorOpenBtn.style.opacity = settings.enableStatusSystem ? "1" : "0.5";
  }
  applySettingsThemeSelectionEvent({
    settingsRoot,
    skillModal,
    statusModal,
    selection: sdkThemeSelection,
    themeInput,
    sdkThemeState,
    syncSharedSelectsEvent: false,
  });
  syncSharedSelects(settingsContent ?? document);

  const statusRowsWrap = document.getElementById(deps.SETTINGS_STATUS_ROWS_ID_Event) as HTMLElement | null;
  if (statusRowsWrap) {
    const currentChatKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
    if (currentChatKey) {
      syncStatusEditorCurrentChatFromRuntimeEvent({
        SETTINGS_STATUS_ROWS_ID_Event: deps.SETTINGS_STATUS_ROWS_ID_Event,
        SETTINGS_STATUS_DIRTY_HINT_ID_Event: deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
        getActiveChatKeyEvent: () => currentChatKey,
        getActiveStatusesEvent: deps.getActiveStatusesEvent,
      });
      if (!isStatusEditorChatDraftDirtyEvent(currentChatKey)) {
        renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      }
    }
  }
  if (!deps.isSkillDraftDirtyEvent()) {
    const currentSettingsText = String(settings.skillTableText ?? "{}");
    const currentPresetStoreText = String(settings.skillPresetStoreText ?? "");
    const skillRowsWrap = document.getElementById(deps.SETTINGS_SKILL_ROWS_ID_Event) as HTMLElement | null;
    if (
      currentSettingsText !== deps.getSkillEditorLastSettingsTextEvent() ||
      currentPresetStoreText !== deps.getSkillEditorLastPresetStoreTextEvent() ||
      !skillRowsWrap ||
      !skillRowsWrap.hasChildNodes()
    ) {
      deps.hydrateSkillDraftFromSettingsEvent();
    }
  }
  if (ruleTextInput) {
    const nextText = typeof settings.ruleText === "string" ? settings.ruleText : "";
    if (ruleTextInput.value !== nextText) {
      ruleTextInput.value = nextText;
    }
  }
}
