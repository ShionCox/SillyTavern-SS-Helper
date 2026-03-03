
import type {
  ActiveStatusEvent,
  StatusEditorRowDraftEvent,
  StatusScopeEvent,
  SkillEditorRowDraftEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
  DicePluginSettingsEvent
} from "../types/eventDomainEvent";
import changelogData from "../../changelog.json";
import type { SettingsCardTemplateIdsEvent } from "../templates/settingsCardTemplateTypes";

function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

export interface SyncSettingsBadgeVersionDepsEvent {
  SETTINGS_BADGE_ID_Event: string;
  SETTINGS_BADGE_VERSION_Event: string;
}

export function syncSettingsBadgeVersionEvent(deps: SyncSettingsBadgeVersionDepsEvent): void {
  const badge = document.getElementById(deps.SETTINGS_BADGE_ID_Event);
  if (!badge) return;
  badge.textContent = deps.SETTINGS_BADGE_VERSION_Event;
}

export interface EnsureSettingsCardStylesDepsEvent {
  SETTINGS_STYLE_ID_Event: string;
  SETTINGS_CARD_ID_Event: string;
  buildSettingsCardStylesTemplateEvent: (cardId: string) => string;
}

export function ensureSettingsCardStylesEvent(deps: EnsureSettingsCardStylesDepsEvent): void {
  if (document.getElementById(deps.SETTINGS_STYLE_ID_Event)) return;

  const style = document.createElement("style");
  style.id = deps.SETTINGS_STYLE_ID_Event;
  style.textContent = deps.buildSettingsCardStylesTemplateEvent(deps.SETTINGS_CARD_ID_Event);
  document.head.appendChild(style);
}

export interface BuildSettingsCardTemplateIdsDepsEvent {
  SETTINGS_CARD_ID_Event: string;
  drawerToggleId: string;
  drawerContentId: string;
  drawerIconId: string;
  SETTINGS_DISPLAY_NAME_Event: string;
  SETTINGS_BADGE_ID_Event: string;
  SETTINGS_BADGE_VERSION_Event: string;
  SETTINGS_AUTHOR_TEXT_Event: string;
  SETTINGS_EMAIL_TEXT_Event: string;
  SETTINGS_GITHUB_TEXT_Event: string;
  SETTINGS_GITHUB_URL_Event: string;
  SETTINGS_SEARCH_ID_Event: string;
  SETTINGS_TAB_MAIN_ID_Event: string;
  SETTINGS_TAB_SKILL_ID_Event: string;
  SETTINGS_TAB_RULE_ID_Event: string;
  SETTINGS_TAB_ABOUT_ID_Event: string;
  SETTINGS_PANEL_MAIN_ID_Event: string;
  SETTINGS_PANEL_SKILL_ID_Event: string;
  SETTINGS_PANEL_RULE_ID_Event: string;
  SETTINGS_PANEL_ABOUT_ID_Event: string;
  SETTINGS_ENABLED_ID_Event: string;
  SETTINGS_RULE_ID_Event: string;
  SETTINGS_AI_ROLL_MODE_ID_Event: string;
  SETTINGS_AI_ROUND_CONTROL_ID_Event: string;
  SETTINGS_EXPLODING_ENABLED_ID_Event: string;
  SETTINGS_ADVANTAGE_ENABLED_ID_Event: string;
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event: string;
  SETTINGS_DYNAMIC_DC_REASON_ID_Event: string;
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event: string;
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  SETTINGS_STATUS_MODAL_CLOSE_ID_Event: string;
  SETTINGS_STATUS_ROWS_ID_Event: string;
  SETTINGS_STATUS_ADD_ID_Event: string;
  SETTINGS_STATUS_SAVE_ID_Event: string;
  SETTINGS_STATUS_RESET_ID_Event: string;
  SETTINGS_STATUS_ERRORS_ID_Event: string;
  SETTINGS_STATUS_DIRTY_HINT_ID_Event: string;
  SETTINGS_STATUS_LAYOUT_ID_Event: string;
  SETTINGS_STATUS_SIDEBAR_ID_Event: string;
  SETTINGS_STATUS_SPLITTER_ID_Event: string;
  SETTINGS_STATUS_CHAT_LIST_ID_Event: string;
  SETTINGS_STATUS_CHAT_META_ID_Event: string;
  SETTINGS_STATUS_COLS_ID_Event: string;
  SETTINGS_STATUS_MEMORY_STATE_ID_Event: string;
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
  SETTINGS_SKILL_ENABLED_ID_Event: string;
  SETTINGS_SKILL_EDITOR_WRAP_ID_Event: string;
  SETTINGS_SKILL_ROWS_ID_Event: string;
  SETTINGS_SKILL_ADD_ID_Event: string;
  SETTINGS_SKILL_TEXT_ID_Event: string;
  SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event: string;
  SETTINGS_SKILL_IMPORT_AREA_ID_Event: string;
  SETTINGS_SKILL_IMPORT_APPLY_ID_Event: string;
  SETTINGS_SKILL_EXPORT_ID_Event: string;
  SETTINGS_SKILL_SAVE_ID_Event: string;
  SETTINGS_SKILL_RESET_ID_Event: string;
  SETTINGS_SKILL_ERRORS_ID_Event: string;
  SETTINGS_SKILL_DIRTY_HINT_ID_Event: string;
  SETTINGS_SKILL_PRESET_LAYOUT_ID_Event: string;
  SETTINGS_SKILL_PRESET_SIDEBAR_ID_Event: string;
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  SETTINGS_SKILL_PRESET_CREATE_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_RENAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_META_ID_Event: string;
  SETTINGS_SKILL_EDITOR_OPEN_ID_Event: string;
  SETTINGS_SKILL_MODAL_ID_Event: string;
  SETTINGS_SKILL_MODAL_CLOSE_ID_Event: string;
  SETTINGS_RULE_SAVE_ID_Event: string;
  SETTINGS_RULE_RESET_ID_Event: string;
  SETTINGS_RULE_TEXT_ID_Event: string;
}

export function buildSettingsCardTemplateIdsEvent(
  deps: BuildSettingsCardTemplateIdsDepsEvent
): SettingsCardTemplateIdsEvent {

  function generateChangelogHtml() {
    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';
    return changelogData.map((log: any) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: bold; color: var(--SmartThemeQuoteTextColor, #fff); font-size: 13px;">${log.version}</span>
            ${log.date ? `<span style="font-size: 11px; opacity: 0.6;">${log.date}</span>` : ''}
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; opacity: 0.85;">
          ${log.changes.map((c: string) => `<li style="margin-bottom: 4px; line-height: 1.4;">${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  return {
    cardId: deps.SETTINGS_CARD_ID_Event,
    drawerToggleId: deps.drawerToggleId,
    drawerContentId: deps.drawerContentId,
    drawerIconId: deps.drawerIconId,
    displayName: deps.SETTINGS_DISPLAY_NAME_Event,
    badgeId: deps.SETTINGS_BADGE_ID_Event,
    badgeText: deps.SETTINGS_BADGE_VERSION_Event,
    authorText: deps.SETTINGS_AUTHOR_TEXT_Event,
    emailText: deps.SETTINGS_EMAIL_TEXT_Event,
    githubText: deps.SETTINGS_GITHUB_TEXT_Event,
    githubUrl: deps.SETTINGS_GITHUB_URL_Event,
    changelogHtml: generateChangelogHtml(),
    searchId: deps.SETTINGS_SEARCH_ID_Event,
    tabMainId: deps.SETTINGS_TAB_MAIN_ID_Event,
    tabSkillId: deps.SETTINGS_TAB_SKILL_ID_Event,
    tabRuleId: deps.SETTINGS_TAB_RULE_ID_Event,
    tabAboutId: deps.SETTINGS_TAB_ABOUT_ID_Event,
    panelMainId: deps.SETTINGS_PANEL_MAIN_ID_Event,
    panelSkillId: deps.SETTINGS_PANEL_SKILL_ID_Event,
    panelRuleId: deps.SETTINGS_PANEL_RULE_ID_Event,
    panelAboutId: deps.SETTINGS_PANEL_ABOUT_ID_Event,
    enabledId: deps.SETTINGS_ENABLED_ID_Event,
    ruleId: deps.SETTINGS_RULE_ID_Event,
    aiRollModeId: deps.SETTINGS_AI_ROLL_MODE_ID_Event,
    aiRoundControlId: deps.SETTINGS_AI_ROUND_CONTROL_ID_Event,
    explodingEnabledId: deps.SETTINGS_EXPLODING_ENABLED_ID_Event,
    advantageEnabledId: deps.SETTINGS_ADVANTAGE_ENABLED_ID_Event,
    dynamicResultGuidanceId: deps.SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event,
    dynamicDcReasonId: deps.SETTINGS_DYNAMIC_DC_REASON_ID_Event,
    statusSystemEnabledId: deps.SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event,
    statusEditorOpenId: deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
    statusModalId: deps.SETTINGS_STATUS_MODAL_ID_Event,
    statusModalCloseId: deps.SETTINGS_STATUS_MODAL_CLOSE_ID_Event,
    statusRowsId: deps.SETTINGS_STATUS_ROWS_ID_Event,
    statusAddId: deps.SETTINGS_STATUS_ADD_ID_Event,
    statusSaveId: deps.SETTINGS_STATUS_SAVE_ID_Event,
    statusResetId: deps.SETTINGS_STATUS_RESET_ID_Event,
    statusErrorsId: deps.SETTINGS_STATUS_ERRORS_ID_Event,
    statusDirtyHintId: deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
    statusLayoutId: deps.SETTINGS_STATUS_LAYOUT_ID_Event,
    statusSidebarId: deps.SETTINGS_STATUS_SIDEBAR_ID_Event,
    statusSplitterId: deps.SETTINGS_STATUS_SPLITTER_ID_Event,
    statusChatListId: deps.SETTINGS_STATUS_CHAT_LIST_ID_Event,
    statusChatMetaId: deps.SETTINGS_STATUS_CHAT_META_ID_Event,
    statusColsId: deps.SETTINGS_STATUS_COLS_ID_Event,
    statusMemoryStateId: deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event,
    allowedDiceSidesId: deps.SETTINGS_ALLOWED_DICE_SIDES_ID_Event,
    summaryDetailId: deps.SETTINGS_SUMMARY_DETAIL_ID_Event,
    summaryRoundsId: deps.SETTINGS_SUMMARY_ROUNDS_ID_Event,
    scopeId: deps.SETTINGS_SCOPE_ID_Event,
    outcomeBranchesId: deps.SETTINGS_OUTCOME_BRANCHES_ID_Event,
    explodeOutcomeId: deps.SETTINGS_EXPLODE_OUTCOME_ID_Event,
    includeOutcomeSummaryId: deps.SETTINGS_SUMMARY_OUTCOME_ID_Event,
    listOutcomePreviewId: deps.SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event,
    timeLimitEnabledId: deps.SETTINGS_TIME_LIMIT_ENABLED_ID_Event,
    timeLimitMinId: deps.SETTINGS_TIME_LIMIT_MIN_ID_Event,
    timeLimitRowId: deps.SETTINGS_TIME_LIMIT_ROW_ID_Event,
    skillEnabledId: deps.SETTINGS_SKILL_ENABLED_ID_Event,
    skillEditorWrapId: deps.SETTINGS_SKILL_EDITOR_WRAP_ID_Event,
    skillRowsId: deps.SETTINGS_SKILL_ROWS_ID_Event,
    skillAddId: deps.SETTINGS_SKILL_ADD_ID_Event,
    skillTextId: deps.SETTINGS_SKILL_TEXT_ID_Event,
    skillImportToggleId: deps.SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event,
    skillImportAreaId: deps.SETTINGS_SKILL_IMPORT_AREA_ID_Event,
    skillImportApplyId: deps.SETTINGS_SKILL_IMPORT_APPLY_ID_Event,
    skillExportId: deps.SETTINGS_SKILL_EXPORT_ID_Event,
    skillSaveId: deps.SETTINGS_SKILL_SAVE_ID_Event,
    skillResetId: deps.SETTINGS_SKILL_RESET_ID_Event,
    skillErrorsId: deps.SETTINGS_SKILL_ERRORS_ID_Event,
    skillDirtyHintId: deps.SETTINGS_SKILL_DIRTY_HINT_ID_Event,
    skillPresetLayoutId: deps.SETTINGS_SKILL_PRESET_LAYOUT_ID_Event,
    skillPresetSidebarId: deps.SETTINGS_SKILL_PRESET_SIDEBAR_ID_Event,
    skillPresetListId: deps.SETTINGS_SKILL_PRESET_LIST_ID_Event,
    skillPresetCreateId: deps.SETTINGS_SKILL_PRESET_CREATE_ID_Event,
    skillPresetDeleteId: deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event,
    skillPresetRestoreDefaultId: deps.SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event,
    skillPresetNameId: deps.SETTINGS_SKILL_PRESET_NAME_ID_Event,
    skillPresetRenameId: deps.SETTINGS_SKILL_PRESET_RENAME_ID_Event,
    skillPresetMetaId: deps.SETTINGS_SKILL_PRESET_META_ID_Event,
    skillEditorOpenId: deps.SETTINGS_SKILL_EDITOR_OPEN_ID_Event,
    skillModalId: deps.SETTINGS_SKILL_MODAL_ID_Event,
    skillModalCloseId: deps.SETTINGS_SKILL_MODAL_CLOSE_ID_Event,
    ruleSaveId: deps.SETTINGS_RULE_SAVE_ID_Event,
    ruleResetId: deps.SETTINGS_RULE_RESET_ID_Event,
    ruleTextId: deps.SETTINGS_RULE_TEXT_ID_Event,
  };
}

export interface MountSettingsCardShellDepsEvent {
  SETTINGS_CARD_ID_Event: string;
  SETTINGS_SKILL_MODAL_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  buildSettingsCardHtmlTemplateEvent: (ids: SettingsCardTemplateIdsEvent) => string;
  buildSettingsCardTemplateIdsEvent: (
    drawerToggleId: string,
    drawerContentId: string,
    drawerIconId: string
  ) => SettingsCardTemplateIdsEvent;
  ensureSettingsCardStylesEvent: () => void;
  syncSettingsBadgeVersionEvent: () => void;
  syncSettingsUiEvent: () => void;
  onMountedEvent: (params: {
    drawerToggleId: string;
    drawerContentId: string;
  }) => void;
  retryLimitEvent?: number;
  retryDelayMsEvent?: number;
}

export function mountSettingsCardShellEvent(
  deps: MountSettingsCardShellDepsEvent,
  attempt = 0
): void {
  const retryLimit = Number.isFinite(deps.retryLimitEvent) ? Number(deps.retryLimitEvent) : 60;
  const retryDelayMs = Number.isFinite(deps.retryDelayMsEvent) ? Number(deps.retryDelayMsEvent) : 500;

  if (document.getElementById(deps.SETTINGS_CARD_ID_Event)) {
    deps.syncSettingsBadgeVersionEvent();
    deps.syncSettingsUiEvent();
    return;
  }

  const container = document.getElementById("extensions_settings");
  if (!container) {
    if (attempt < retryLimit) {
      setTimeout(() => mountSettingsCardShellEvent(deps, attempt + 1), retryDelayMs);
    }
    return;
  }

  deps.ensureSettingsCardStylesEvent();

  const root = document.createElement("div");
  root.id = deps.SETTINGS_CARD_ID_Event;
  const drawerToggleId = `${deps.SETTINGS_CARD_ID_Event}-toggle`;
  const drawerContentId = `${deps.SETTINGS_CARD_ID_Event}-content`;
  const drawerIconId = `${deps.SETTINGS_CARD_ID_Event}-icon`;
  const templateIds = deps.buildSettingsCardTemplateIdsEvent(
    drawerToggleId,
    drawerContentId,
    drawerIconId
  );
  root.innerHTML = deps.buildSettingsCardHtmlTemplateEvent(templateIds);

  const modalInPanel = root.querySelector(`#${deps.SETTINGS_SKILL_MODAL_ID_Event}`) as HTMLElement | null;
  if (modalInPanel) {
    root.appendChild(modalInPanel);
  }
  const statusModal = root.querySelector(`#${deps.SETTINGS_STATUS_MODAL_ID_Event}`) as HTMLElement | null;
  if (statusModal) {
    root.appendChild(statusModal);
  }

  let ssContainer = document.getElementById("ss-helper-plugins-container");
  if (!ssContainer) {
    ssContainer = document.createElement("div");
    ssContainer.id = "ss-helper-plugins-container";
    container.prepend(ssContainer);
  }
  ssContainer.appendChild(root);

  deps.syncSettingsBadgeVersionEvent();
  deps.onMountedEvent({ drawerToggleId, drawerContentId });
  deps.syncSettingsUiEvent();
}

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

  const globalRef = globalThis as any;
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
  SETTINGS_SKILL_ENABLED_ID_Event: string;
  SUMMARY_HISTORY_ROUNDS_MAX_Event: number;
  SUMMARY_HISTORY_ROUNDS_MIN_Event: number;
  DEFAULT_SUMMARY_HISTORY_ROUNDS_Event: number;
  updateSettingsEvent: (patch: {
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
    enableSkillSystem?: boolean;
  }) => void;
}

export function bindBasicSettingsInputsEvent(deps: BindBasicSettingsInputsDepsEvent): void {
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
  const skillEnabledInput = document.getElementById(
    deps.SETTINGS_SKILL_ENABLED_ID_Event
  ) as HTMLInputElement | null;

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
}

export interface BindSkillPresetActionsDepsEvent {
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  SETTINGS_SKILL_PRESET_CREATE_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_RENAME_ID_Event: string;
  SKILL_PRESET_NEW_NAME_BASE_Event: string;
  SKILL_PRESET_DEFAULT_ID_Event: string;
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event: string;
  getSkillEditorActivePresetIdEvent: () => string;
  confirmDiscardSkillDraftEvent: () => boolean;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getSkillPresetStoreEvent: (settings: DicePluginSettingsEvent) => SkillPresetStoreEvent;
  getSkillPresetByIdEvent: (store: SkillPresetStoreEvent, presetId: string) => SkillPresetEvent | null;
  saveSkillPresetStoreEvent: (store: SkillPresetStoreEvent) => void;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  getUniqueSkillPresetNameEvent: (
    store: SkillPresetStoreEvent,
    baseName: string,
    excludeId?: string
  ) => string;
  createIdEvent: (prefix: string) => string;
  buildDefaultSkillPresetStoreEvent: () => SkillPresetStoreEvent;
  normalizeSkillPresetNameKeyEvent: (raw: string) => string;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
  pushToChat: (message: string) => void;
}

export function bindSkillPresetActionsEvent(deps: BindSkillPresetActionsDepsEvent): void {
  const skillPresetListWrap = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_LIST_ID_Event
  ) as HTMLElement | null;
  const skillPresetCreateBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_CREATE_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetDeleteBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetRestoreDefaultBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetNameInput = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_NAME_ID_Event
  ) as HTMLInputElement | null;
  const skillPresetRenameBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_RENAME_ID_Event
  ) as HTMLButtonElement | null;

  skillPresetListWrap?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const presetBtn = target?.closest<HTMLButtonElement>("button[data-skill-preset-id]");
    if (!presetBtn) return;
    const nextPresetId = String(presetBtn.dataset.skillPresetId ?? "");
    if (!nextPresetId || nextPresetId === deps.getSkillEditorActivePresetIdEvent()) return;
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const preset = deps.getSkillPresetByIdEvent(store, nextPresetId);
    if (!preset) return;
    store.activePresetId = preset.id;
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetCreateBtn?.addEventListener("click", () => {
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    const now = Date.now();
    const name = deps.getUniqueSkillPresetNameEvent(store, deps.SKILL_PRESET_NEW_NAME_BASE_Event);
    const newPreset: SkillPresetEvent = {
      id: deps.createIdEvent("skill_preset"),
      name,
      locked: false,
      skillTableText: activePreset.skillTableText,
      createdAt: now,
      updatedAt: now,
    };
    store.presets.push(newPreset);
    store.activePresetId = newPreset.id;
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetDeleteBtn?.addEventListener("click", () => {
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    if (activePreset.locked) {
      deps.pushToChat("⚠️ 默认预设不可删除。");
      return;
    }
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const confirmed = window.confirm(`确认删除预设「${activePreset.name}」吗？`);
    if (!confirmed) return;
    store.presets = store.presets.filter((preset) => preset.id !== activePreset.id);
    const fallbackPreset =
      deps.getSkillPresetByIdEvent(store, deps.SKILL_PRESET_DEFAULT_ID_Event) ??
      store.presets[0] ??
      null;
    if (!fallbackPreset) {
      store.presets = deps.buildDefaultSkillPresetStoreEvent().presets;
      store.activePresetId = deps.SKILL_PRESET_DEFAULT_ID_Event;
    } else {
      store.activePresetId = fallbackPreset.id;
    }
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetRestoreDefaultBtn?.addEventListener("click", () => {
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const confirmed = window.confirm("确认将默认预设恢复为内置技能表吗？这会覆盖默认预设当前内容。");
    if (!confirmed) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    let defaultPreset = deps.getSkillPresetByIdEvent(store, deps.SKILL_PRESET_DEFAULT_ID_Event);
    if (!defaultPreset) {
      const fallbackStore = deps.buildDefaultSkillPresetStoreEvent();
      const fallbackDefault =
        deps.getSkillPresetByIdEvent(fallbackStore, deps.SKILL_PRESET_DEFAULT_ID_Event) ??
        fallbackStore.presets[0] ??
        null;
      if (!fallbackDefault) return;
      store.presets.unshift(fallbackDefault);
      defaultPreset = fallbackDefault;
    }
    defaultPreset.locked = true;
    defaultPreset.skillTableText = deps.DEFAULT_SKILL_PRESET_TABLE_TEXT_Event;
    defaultPreset.updatedAt = Date.now();
    deps.saveSkillPresetStoreEvent(store);
    deps.renderSkillValidationErrorsEvent([]);
    deps.pushToChat("技能编辑器：默认预设已恢复。");
  });

  const handlePresetRename = () => {
    const nextName = String(skillPresetNameInput?.value ?? "").trim();
    if (!nextName) {
      deps.renderSkillValidationErrorsEvent(["预设名称不能为空。"]);
      return;
    }
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    const duplicated = store.presets.some(
      (preset) =>
        preset.id !== activePreset.id &&
        deps.normalizeSkillPresetNameKeyEvent(preset.name) ===
        deps.normalizeSkillPresetNameKeyEvent(nextName)
    );
    if (duplicated) {
      deps.renderSkillValidationErrorsEvent(["预设名称重复，请使用其他名称。"]);
      return;
    }
    activePreset.name = nextName;
    activePreset.updatedAt = Date.now();
    deps.saveSkillPresetStoreEvent(store);
    deps.renderSkillValidationErrorsEvent([]);
  };

  skillPresetRenameBtn?.addEventListener("click", handlePresetRename);
  skillPresetNameInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handlePresetRename();
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

let STATUS_EDITOR_ROWS_DRAFT_Event: StatusEditorRowDraftEvent[] = [];
let STATUS_EDITOR_LAST_SNAPSHOT_Event = "";
let STATUS_EDITOR_DIRTY_Event = false;
let STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "";
let STATUS_EDITOR_SELECTED_CHAT_KEY_Event = "";
let STATUS_EDITOR_CURRENT_CHAT_KEY_Event = "";
let STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：检测中";
let STATUS_EDITOR_OPEN_EVENT_BOUND_Event = false;
let STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event: (() => void) | null = null;
let STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event = 0;

type StatusEditorColKeyEvent = "name" | "modifier" | "duration" | "scope" | "skills" | "enabled" | "actions";

interface StatusEditorChatListItemEvent {
  chatKey: string;
  updatedAt: number;
  activeStatusCount: number;
  isCurrent: boolean;
  fromRollLocal: boolean;
  fromMemory: boolean;
}

interface StatusEditorChatDraftCacheEvent {
  rows: StatusEditorRowDraftEvent[];
  snapshot: string;
  metaSnapshot: string;
  dirty: boolean;
  updatedAt: number;
  activeStatusCount: number;
}

const STATUS_EDITOR_CHAT_DRAFT_CACHE_Event = new Map<string, StatusEditorChatDraftCacheEvent>();
let STATUS_EDITOR_CHAT_LIST_Event: StatusEditorChatListItemEvent[] = [];

const STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event = "st_roll_status_editor_layout_v1";
const STATUS_EDITOR_COL_MIN_WIDTH_Event: Record<StatusEditorColKeyEvent, number> = {
  name: 120,
  modifier: 72,
  duration: 90,
  scope: 90,
  skills: 160,
  enabled: 80,
  actions: 70,
};
const STATUS_EDITOR_COL_VAR_MAP_Event: Record<StatusEditorColKeyEvent, string> = {
  name: "--st-roll-status-col-name",
  modifier: "--st-roll-status-col-modifier",
  duration: "--st-roll-status-col-duration",
  scope: "--st-roll-status-col-scope",
  skills: "--st-roll-status-col-skills",
  enabled: "--st-roll-status-col-enabled",
  actions: "--st-roll-status-col-actions",
};

function normalizeStatusNameKeyLocalEvent(raw: any): string {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeStatusSkillKeyLocalEvent(raw: any): string {
  return String(raw ?? "").trim().toLowerCase();
}

function parseStatusSkillsTextToKeysEvent(raw: string): string[] {
  const source = String(raw ?? "").trim();
  if (!source) return [];
  const parts = source
    .split("|")
    .map((item) => normalizeStatusSkillKeyLocalEvent(item))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function createStatusEditorRowDraftEvent(
  name = "",
  modifierText = "",
  durationText = "",
  scope: StatusScopeEvent = "skills",
  skillsText = "",
  enabled = true
): StatusEditorRowDraftEvent {
  return {
    rowId: `status_row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    modifierText,
    durationText,
    scope,
    skillsText,
    enabled,
  };
}

function buildStatusDraftSnapshotEvent(rows: StatusEditorRowDraftEvent[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      name: String(row.name ?? ""),
      modifierText: String(row.modifierText ?? ""),
      durationText: String(row.durationText ?? ""),
      scope: row.scope === "all" ? "all" : "skills",
      skillsText: String(row.skillsText ?? ""),
      enabled: row.enabled !== false,
    }))
  );
}

function buildStatusMetaSnapshotEvent(statuses: ActiveStatusEvent[]): string {
  return JSON.stringify(
    (Array.isArray(statuses) ? statuses : []).map((item) => ({
      name: String(item.name ?? ""),
      modifier: Number(item.modifier ?? 0),
      scope: item.scope === "all" ? "all" : "skills",
      skills: item.scope === "all" ? [] : (Array.isArray(item.skills) ? item.skills : []),
      remainingRounds: item.remainingRounds == null ? null : Number(item.remainingRounds),
      enabled: item.enabled !== false,
    }))
  );
}

function getStatusEditorModalPanelEvent(rowsWrapId: string): HTMLElement | null {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  return rowsWrap?.closest(".st-roll-status-modal-panel") as HTMLElement | null;
}

function renderStatusValidationErrorsEvent(errorWrapId: string, errors: string[]): void {
  const wrap = document.getElementById(errorWrapId) as HTMLElement | null;
  if (!wrap) return;
  if (!errors.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = errors
    .map((item) => `<div class="st-roll-status-error-item">${escapeHtml(item)}</div>`)
    .join("");
}

function setStatusDraftDirtyEvent(flag: boolean, dirtyHintId: string): void {
  STATUS_EDITOR_DIRTY_Event = Boolean(flag);
  const dirtyHint = document.getElementById(dirtyHintId) as HTMLElement | null;
  if (dirtyHint) {
    dirtyHint.hidden = !STATUS_EDITOR_DIRTY_Event;
  }
}

function renderStatusRowsEvent(rowsWrapId: string): void {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  if (!rowsWrap) return;
  if (!STATUS_EDITOR_ROWS_DRAFT_Event.length) {
    rowsWrap.innerHTML = `<div class="st-roll-status-empty">暂无状态，点击“新增状态”开始配置。</div>`;
    return;
  }
  rowsWrap.innerHTML = STATUS_EDITOR_ROWS_DRAFT_Event
    .map((row) => {
      const rowId = escapeAttr(String(row.rowId ?? ""));
      const name = escapeAttr(String(row.name ?? ""));
      const modifierText = escapeAttr(String(row.modifierText ?? ""));
      const durationText = escapeAttr(String(row.durationText ?? ""));
      const scope = row.scope === "all" ? "all" : "skills";
      const skillsText = escapeAttr(String(row.skillsText ?? ""));
      const enabled = row.enabled !== false;
      const skillsDisabledAttr = scope === "all" ? "disabled" : "";
      const skillsPlaceholder = scope === "all" ? "范围为全局时会忽略此项" : "例如：潜行|察觉";
      return `
        <div class="st-roll-status-row" data-row-id="${rowId}">
          <input class="st-roll-input st-roll-status-name" type="text" data-status-row-id="${rowId}" data-status-field="name" value="${name}" placeholder="状态名称" />
          <input class="st-roll-input st-roll-status-modifier" type="text" inputmode="numeric" data-status-row-id="${rowId}" data-status-field="modifier" value="${modifierText}" placeholder="例如 -2" />
          <input class="st-roll-input st-roll-status-duration" type="text" inputmode="numeric" data-status-row-id="${rowId}" data-status-field="duration" value="${durationText}" placeholder="留空=永久，例如 3" />
          <select class="st-roll-select st-roll-status-scope" data-status-row-id="${rowId}" data-status-field="scope">
            <option value="skills" ${scope === "skills" ? "selected" : ""}>按技能</option>
            <option value="all" ${scope === "all" ? "selected" : ""}>全局</option>
          </select>
          <input class="st-roll-input st-roll-status-skills" type="text" data-status-row-id="${rowId}" data-status-field="skills" value="${skillsText}" placeholder="${skillsPlaceholder}" ${skillsDisabledAttr} />
          <label class="st-roll-status-enabled-wrap">
            <input type="checkbox" data-status-row-id="${rowId}" data-status-field="enabled" ${enabled ? "checked" : ""} />
            <span>启用</span>
          </label>
          <button type="button" class="st-roll-btn secondary st-roll-status-remove" data-status-remove-id="${rowId}">删除</button>
        </div>
      `;
    })
    .join("");
}

function deserializeActiveStatusesToDraftRowsEvent(statuses: ActiveStatusEvent[]): StatusEditorRowDraftEvent[] {
  return (Array.isArray(statuses) ? statuses : []).map((status) =>
    createStatusEditorRowDraftEvent(
      String(status.name ?? ""),
      String(status.modifier ?? 0),
      status.remainingRounds == null ? "" : String(status.remainingRounds),
      status.scope === "all" ? "all" : "skills",
      status.scope === "all" ? "" : (Array.isArray(status.skills) ? status.skills : []).join("|"),
      status.enabled !== false
    )
  );
}

function validateStatusRowsEvent(
  rows: StatusEditorRowDraftEvent[],
  existingStatuses: ActiveStatusEvent[]
): { errors: string[]; statuses: ActiveStatusEvent[] } {
  const errors: string[] = [];
  const statuses: ActiveStatusEvent[] = [];
  const seen = new Map<string, number>();
  const existingMap = new Map<string, ActiveStatusEvent>();
  for (const item of existingStatuses || []) {
    const key = normalizeStatusNameKeyLocalEvent(item.name);
    if (key) existingMap.set(key, item);
  }
  const integerPattern = /^[+-]?\d+$/;
  const now = Date.now();

  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const name = String(row.name ?? "").trim();
    const nameKey = normalizeStatusNameKeyLocalEvent(name);
    const modifierText = String(row.modifierText ?? "").trim();
    const durationText = String(row.durationText ?? "").trim();
    const scope: StatusScopeEvent = row.scope === "all" ? "all" : "skills";
    const skills = scope === "all" ? [] : parseStatusSkillsTextToKeysEvent(String(row.skillsText ?? ""));
    let hasError = false;

    if (!name) {
      errors.push(`第 ${rowNo} 行：名称不能为空`);
      hasError = true;
    }
    if (nameKey) {
      const firstRow = seen.get(nameKey);
      if (firstRow != null) {
        errors.push(`第 ${rowNo} 行：名称与第 ${firstRow + 1} 行重复`);
        hasError = true;
      } else {
        seen.set(nameKey, index);
      }
    }
    if (!modifierText) {
      errors.push(`第 ${rowNo} 行：修正值不能为空`);
      hasError = true;
    } else if (!integerPattern.test(modifierText)) {
      errors.push(`第 ${rowNo} 行：修正值必须为整数`);
      hasError = true;
    }

    let remainingRounds: number | null = null;
    if (durationText) {
      if (!integerPattern.test(durationText)) {
        errors.push(`第 ${rowNo} 行：持续轮次必须为整数（留空表示永久）`);
        hasError = true;
      } else {
        const parsedRounds = Math.floor(Number(durationText));
        if (!Number.isFinite(parsedRounds) || parsedRounds < 1) {
          errors.push(`第 ${rowNo} 行：持续轮次必须 >= 1（留空表示永久）`);
          hasError = true;
        } else {
          remainingRounds = parsedRounds;
        }
      }
    }

    if (scope === "skills" && skills.length <= 0) {
      errors.push(`第 ${rowNo} 行：范围为“按技能”时，技能列表不能为空`);
      hasError = true;
    }
    if (hasError) return;

    const modifier = Number(modifierText);
    const prev = existingMap.get(nameKey);
    statuses.push({
      name,
      modifier,
      remainingRounds,
      scope,
      skills,
      enabled: row.enabled !== false,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      source: "manual_editor",
    });
  });

  return { errors, statuses };
}

function hydrateStatusDraftFromMetaEvent(
  statuses: ActiveStatusEvent[],
  rowsWrapId: string,
  dirtyHintId: string,
  force = false
): void {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  const metaSnapshot = JSON.stringify(
    (Array.isArray(statuses) ? statuses : []).map((item) => ({
      name: item.name,
      modifier: item.modifier,
      scope: item.scope,
      skills: item.scope === "all" ? [] : item.skills,
      remainingRounds: item.remainingRounds ?? null,
        enabled: item.enabled !== false,
    }))
  );
  if (!force && STATUS_EDITOR_DIRTY_Event && rowsWrap?.hasChildNodes()) return;
  if (!force && metaSnapshot === STATUS_EDITOR_LAST_META_SNAPSHOT_Event && rowsWrap?.hasChildNodes()) return;

  STATUS_EDITOR_ROWS_DRAFT_Event = deserializeActiveStatusesToDraftRowsEvent(statuses);
  STATUS_EDITOR_LAST_SNAPSHOT_Event = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
  STATUS_EDITOR_LAST_META_SNAPSHOT_Event = metaSnapshot;
  setStatusDraftDirtyEvent(false, dirtyHintId);
  renderStatusRowsEvent(rowsWrapId);
}

export interface BindStatusEditorActionsDepsEvent {
  SETTINGS_STATUS_ROWS_ID_Event: string;
  SETTINGS_STATUS_ADD_ID_Event: string;
  SETTINGS_STATUS_SAVE_ID_Event: string;
  SETTINGS_STATUS_RESET_ID_Event: string;
  SETTINGS_STATUS_ERRORS_ID_Event: string;
  SETTINGS_STATUS_DIRTY_HINT_ID_Event: string;
  SETTINGS_STATUS_SPLITTER_ID_Event: string;
  SETTINGS_STATUS_COLS_ID_Event: string;
  SETTINGS_STATUS_CHAT_LIST_ID_Event: string;
  SETTINGS_STATUS_CHAT_META_ID_Event: string;
  SETTINGS_STATUS_MEMORY_STATE_ID_Event: string;
  getActiveStatusesEvent: () => ActiveStatusEvent[];
  setActiveStatusesEvent: (statuses: ActiveStatusEvent[]) => void;
  getActiveChatKeyEvent: () => string;
  listChatScopedStatusSummariesEvent: () => Promise<Array<{ chatKey: string; updatedAt: number; activeStatusCount: number }>>;
  loadStatusesForChatKeyEvent: (chatKey: string) => Promise<ActiveStatusEvent[]>;
  saveStatusesForChatKeyEvent: (chatKey: string, statuses: ActiveStatusEvent[]) => Promise<void>;
  probeMemoryPluginEvent: (timeoutMs?: number) => Promise<{
    available: boolean;
    enabled: boolean;
    pluginId: string;
    version: string;
    capabilities: string[];
  }>;
  fetchMemoryChatKeysEvent: (timeoutMs?: number) => Promise<{ chatKeys: string[]; updatedAt: number | null }>;
  subscribeMemoryPluginStateEvent: (
    handler: (payload: { enabled: boolean; pluginId: string }) => void
  ) => () => void;
  syncSettingsUiEvent?: () => void;
  pushToChat?: (message: string) => void;
}

interface StatusEditorLayoutPrefsEvent {
  sidebarWidth?: number;
  columns?: Partial<Record<StatusEditorColKeyEvent, number>>;
}

function clampStatusEditorValueEvent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStatusEditorLayoutPrefsEvent(): StatusEditorLayoutPrefsEvent {
  try {
    const raw = localStorage.getItem(STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatusEditorLayoutPrefsEvent;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStatusEditorLayoutPrefsEvent(next: StatusEditorLayoutPrefsEvent): void {
  try {
    localStorage.setItem(STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function applyStatusEditorLayoutPrefsEvent(rowsWrapId: string): void {
  const panel = getStatusEditorModalPanelEvent(rowsWrapId);
  if (!panel) return;
  const prefs = readStatusEditorLayoutPrefsEvent();
  const sidebarWidth = Number(prefs.sidebarWidth);
  if (Number.isFinite(sidebarWidth)) {
    const clamped = clampStatusEditorValueEvent(sidebarWidth, 220, 520);
    panel.style.setProperty("--st-roll-status-sidebar-width", `${clamped}px`);
  }
  const columns = prefs.columns ?? {};
  (Object.keys(STATUS_EDITOR_COL_VAR_MAP_Event) as StatusEditorColKeyEvent[]).forEach((key) => {
    const width = Number(columns[key]);
    if (!Number.isFinite(width)) return;
    const clamped = clampStatusEditorValueEvent(width, STATUS_EDITOR_COL_MIN_WIDTH_Event[key], 520);
    panel.style.setProperty(STATUS_EDITOR_COL_VAR_MAP_Event[key], `${clamped}px`);
  });
}

function bindStatusEditorSplitterResizeEvent(splitter: HTMLElement, rowsWrapId: string): void {
  splitter.addEventListener("mousedown", (event) => {
    const panel = getStatusEditorModalPanelEvent(rowsWrapId);
    if (!panel) return;
    event.preventDefault();
    splitter.classList.add("is-resizing");

    const startX = event.clientX;
    const startWidth = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--st-roll-status-sidebar-width")) || 300;
    const onMove = (moveEvent: MouseEvent) => {
      const width = clampStatusEditorValueEvent(startWidth + (moveEvent.clientX - startX), 220, 520);
      panel.style.setProperty("--st-roll-status-sidebar-width", `${width}px`);
    };
    const onUp = () => {
      splitter.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const width = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--st-roll-status-sidebar-width"));
      if (Number.isFinite(width)) {
        const prev = readStatusEditorLayoutPrefsEvent();
        saveStatusEditorLayoutPrefsEvent({
          ...prev,
          sidebarWidth: width,
        });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function bindStatusEditorColumnResizeEvent(colsWrap: HTMLElement, rowsWrapId: string): void {
  colsWrap.addEventListener("mousedown", (event) => {
    const target = event.target as HTMLElement | null;
    const handle = target?.closest<HTMLElement>("[data-status-col-resize-key]");
    if (!handle) return;
    const key = String(handle.dataset.statusColResizeKey ?? "") as StatusEditorColKeyEvent;
    if (!key || !STATUS_EDITOR_COL_VAR_MAP_Event[key]) return;

    const panel = getStatusEditorModalPanelEvent(rowsWrapId);
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    handle.classList.add("is-resizing");

    const header = colsWrap.querySelector<HTMLElement>(`[data-status-col-key="${key}"]`);
    const startX = event.clientX;
    const startWidth = Math.max(
      STATUS_EDITOR_COL_MIN_WIDTH_Event[key],
      Math.round(header?.getBoundingClientRect().width ?? STATUS_EDITOR_COL_MIN_WIDTH_Event[key])
    );
    const onMove = (moveEvent: MouseEvent) => {
      const width = clampStatusEditorValueEvent(
        startWidth + (moveEvent.clientX - startX),
        STATUS_EDITOR_COL_MIN_WIDTH_Event[key],
        520
      );
      panel.style.setProperty(STATUS_EDITOR_COL_VAR_MAP_Event[key], `${width}px`);
    };
    const onUp = () => {
      handle.classList.remove("is-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const width = Number.parseFloat(getComputedStyle(panel).getPropertyValue(STATUS_EDITOR_COL_VAR_MAP_Event[key]));
      if (!Number.isFinite(width)) return;
      const prev = readStatusEditorLayoutPrefsEvent();
      saveStatusEditorLayoutPrefsEvent({
        ...prev,
        columns: {
          ...(prev.columns ?? {}),
          [key]: width,
        },
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

function renderStatusMemoryStateEvent(memoryStateId: string): void {
  const node = document.getElementById(memoryStateId) as HTMLElement | null;
  if (!node) return;
  node.textContent = STATUS_EDITOR_MEMORY_STATE_TEXT_Event;
}

function getStatusEditorContextEvent(): any {
  try {
    return (window as any).SillyTavern?.getContext?.() || null;
  } catch {
    return null;
  }
}

function parseStatusEditorChatKeyPartsEvent(chatKey: string): { chatId: string; roleId: string } {
  const parts = String(chatKey ?? "").split("::");
  return {
    chatId: String(parts[0] ?? "").trim() || "-",
    roleId: String(parts[2] ?? "").trim() || String(parts[0] ?? "").trim() || "未知",
  };
}

function buildStatusEditorChatNameEvent(chatKey: string): string {
  const { roleId } = parseStatusEditorChatKeyPartsEvent(chatKey);
  const ctx = getStatusEditorContextEvent();
  const characters = Array.isArray(ctx?.characters) ? ctx.characters : [];
  let matched: any = null;

  for (const char of characters) {
    const avatarName = String(char?.avatar ?? "").trim();
    if (!avatarName) continue;
    if (roleId === avatarName || roleId.startsWith(avatarName + "_")) {
      matched = char;
      break;
    }
  }
  if (!matched) {
    for (const char of characters) {
      const name = String(char?.name ?? "").trim();
      if (!name) continue;
      if (roleId.toLowerCase().includes(name.toLowerCase())) {
        matched = char;
        break;
      }
    }
  }

  if (matched?.name) return String(matched.name);
  const noExt = roleId.replace(/\.[a-z0-9]+$/i, "");
  const friendly = noExt.replace(/^default_/i, "").replace(/[_-]+/g, " ").trim();
  return friendly || roleId || "未知角色";
}

function buildStatusEditorAvatarUrlEvent(chatKey: string): string {
  const { roleId } = parseStatusEditorChatKeyPartsEvent(chatKey);
  const ctx = getStatusEditorContextEvent();
  const characters = Array.isArray(ctx?.characters) ? ctx.characters : [];
  let avatarName = "";

  for (const char of characters) {
    const rawAvatar = String(char?.avatar ?? "").trim();
    if (!rawAvatar) continue;
    if (roleId === rawAvatar || roleId.startsWith(rawAvatar + "_")) {
      avatarName = rawAvatar;
      break;
    }
  }

  if (!avatarName && /\.(png|jpe?g|webp|gif|bmp)$/i.test(roleId)) {
    avatarName = roleId;
  }

  if (!avatarName) return "";
  return `/characters/${encodeURIComponent(avatarName)}`;
}

function formatStatusEditorTimeEvent(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "-";
  }
}

function saveCurrentStatusDraftToCacheEvent(dirtyHintId: string): void {
  const chatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
  if (!chatKey) return;
  STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.set(chatKey, {
    rows: [...STATUS_EDITOR_ROWS_DRAFT_Event],
    snapshot: STATUS_EDITOR_LAST_SNAPSHOT_Event,
    metaSnapshot: STATUS_EDITOR_LAST_META_SNAPSHOT_Event,
    dirty: STATUS_EDITOR_DIRTY_Event,
    updatedAt: Date.now(),
    activeStatusCount: STATUS_EDITOR_ROWS_DRAFT_Event.length,
  });
  setStatusDraftDirtyEvent(STATUS_EDITOR_DIRTY_Event, dirtyHintId);
}

function restoreStatusDraftFromCacheEvent(
  chatKey: string,
  rowsWrapId: string,
  dirtyHintId: string
): boolean {
  const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(chatKey);
  if (!cached) return false;
  STATUS_EDITOR_ROWS_DRAFT_Event = [...cached.rows];
  STATUS_EDITOR_LAST_SNAPSHOT_Event = String(cached.snapshot ?? "[]");
  STATUS_EDITOR_LAST_META_SNAPSHOT_Event = String(cached.metaSnapshot ?? "[]");
  setStatusDraftDirtyEvent(Boolean(cached.dirty), dirtyHintId);
  renderStatusRowsEvent(rowsWrapId);
  return true;
}

function mergeStatusEditorChatListEvent(
  currentChatKey: string,
  localSummaries: Array<{ chatKey: string; updatedAt: number; activeStatusCount: number }>,
  memoryChatKeys: string[]
): StatusEditorChatListItemEvent[] {
  const map = new Map<string, StatusEditorChatListItemEvent>();
  const currentKey = String(currentChatKey ?? "").trim();

  if (currentKey) {
    map.set(currentKey, {
      chatKey: currentKey,
      updatedAt: Date.now(),
      activeStatusCount: 0,
      isCurrent: true,
      fromRollLocal: false,
      fromMemory: false,
    });
  }

  for (const item of localSummaries) {
    const key = String(item.chatKey ?? "").trim();
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      chatKey: key,
      updatedAt: Math.max(Number(item.updatedAt) || 0, Number(prev?.updatedAt) || 0),
      activeStatusCount: Number(item.activeStatusCount) || 0,
      isCurrent: key === currentKey || Boolean(prev?.isCurrent),
      fromRollLocal: true,
      fromMemory: Boolean(prev?.fromMemory),
    });
  }

  for (const keyRaw of memoryChatKeys) {
    const key = String(keyRaw ?? "").trim();
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      chatKey: key,
      updatedAt: Number(prev?.updatedAt) || 0,
      activeStatusCount: Number(prev?.activeStatusCount) || 0,
      isCurrent: key === currentKey || Boolean(prev?.isCurrent),
      fromRollLocal: Boolean(prev?.fromRollLocal),
      fromMemory: true,
    });
  }

  for (const [key, cached] of STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.entries()) {
    if (map.has(key)) continue;
    map.set(key, {
      chatKey: key,
      updatedAt: Number(cached.updatedAt) || 0,
      activeStatusCount: Number(cached.activeStatusCount) || 0,
      isCurrent: key === currentKey,
      fromRollLocal: false,
      fromMemory: false,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.chatKey === currentKey) return -1;
    if (b.chatKey === currentKey) return 1;
    const aDirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(a.chatKey)?.dirty ? 1 : 0;
    const bDirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(b.chatKey)?.dirty ? 1 : 0;
    if (aDirty !== bDirty) return bDirty - aDirty;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function renderStatusEditorChatListEvent(chatListId: string): void {
  const node = document.getElementById(chatListId) as HTMLElement | null;
  if (!node) return;
  if (!STATUS_EDITOR_CHAT_LIST_Event.length) {
    node.innerHTML = `<div class="st-roll-status-empty">暂无聊天记录。</div>`;
    return;
  }
  node.innerHTML = STATUS_EDITOR_CHAT_LIST_Event.map((item) => {
    const active = item.chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event;
    const dirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(item.chatKey)?.dirty === true;
    const tags: string[] = [];
    if (item.isCurrent) tags.push("当前");
    if (item.fromRollLocal) tags.push("本地");
    if (item.fromMemory) tags.push("记忆库");
    if (dirty) tags.push("未保存");

    const { chatId } = parseStatusEditorChatKeyPartsEvent(item.chatKey);
    const name = buildStatusEditorChatNameEvent(item.chatKey);
    const avatarUrl = buildStatusEditorAvatarUrlEvent(item.chatKey);
    const avatarFallback = escapeHtml(String(name || "未").slice(0, 1).toUpperCase());

    return `
      <button type="button" class="st-roll-status-chat-item ${active ? "is-active" : ""}" data-status-chat-key="${escapeAttr(item.chatKey)}">
        <div class="st-roll-status-chat-avatar-wrap">
          ${avatarUrl
            ? `<img class="st-roll-status-chat-avatar" src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(name)}" onerror="this.style.display='none'; const fb=this.nextElementSibling; if(fb){fb.style.display='grid';}" />`
            : ""}
          <div class="st-roll-status-chat-avatar-fallback" style="${avatarUrl ? "display:none;" : ""}">${avatarFallback}</div>
        </div>
        <div class="st-roll-status-chat-main">
          <span class="st-roll-status-chat-name">${escapeHtml(name)}</span>
          <span class="st-roll-status-chat-time">最后聊天：${escapeHtml(formatStatusEditorTimeEvent(item.updatedAt))}</span>
          <span class="st-roll-status-chat-key">CHATID：${escapeHtml(chatId)}</span>
          <span class="st-roll-status-chat-meta-line">${escapeHtml(tags.join(" | "))}</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderStatusEditorChatMetaEvent(chatMetaId: string): void {
  const node = document.getElementById(chatMetaId) as HTMLElement | null;
  if (!node) return;
  const selectedKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
  if (!selectedKey) {
    node.textContent = "未选择聊天";
    return;
  }
  const selected = STATUS_EDITOR_CHAT_LIST_Event.find((item) => item.chatKey === selectedKey);
  if (!selected) {
    node.textContent = selectedKey;
    return;
  }
  const tags: string[] = [];
  if (selected.isCurrent) tags.push("当前");
  if (selected.fromRollLocal) tags.push("本地");
  if (selected.fromMemory) tags.push("记忆库");
  node.textContent = `来源：${tags.join("、") || "未知"}｜状态数：${selected.activeStatusCount}`;
}

async function switchStatusEditorChatEvent(
  chatKey: string,
  deps: BindStatusEditorActionsDepsEvent,
  options?: { skipSaveCurrent?: boolean }
): Promise<void> {
  const key = String(chatKey ?? "").trim();
  if (!key) return;
  if (!options?.skipSaveCurrent) {
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
  }
  STATUS_EDITOR_SELECTED_CHAT_KEY_Event = key;

  const restored = restoreStatusDraftFromCacheEvent(
    key,
    deps.SETTINGS_STATUS_ROWS_ID_Event,
    deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event
  );
  if (!restored) {
    const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
    const statuses =
      key === currentKey
        ? deps.getActiveStatusesEvent()
        : await deps.loadStatusesForChatKeyEvent(key);
    hydrateStatusDraftFromMetaEvent(
      statuses,
      deps.SETTINGS_STATUS_ROWS_ID_Event,
      deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
      true
    );
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
  }

  renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
}

async function refreshStatusEditorChatListEvent(deps: BindStatusEditorActionsDepsEvent): Promise<void> {
  const token = ++STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event;
  STATUS_EDITOR_CURRENT_CHAT_KEY_Event = String(deps.getActiveChatKeyEvent() ?? "").trim();
  STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：检测中";
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);

  const [localSummaries, probeResult] = await Promise.all([
    deps.listChatScopedStatusSummariesEvent().catch(() => []),
    deps.probeMemoryPluginEvent(1200).catch(() => ({
      available: false,
      enabled: false,
      pluginId: "stx_memory_os",
      version: "",
      capabilities: [],
    })),
  ]);
  if (token !== STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event) return;

  let memoryChatKeys: string[] = [];
  if (!probeResult.available) {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：未安装";
  } else if (!probeResult.enabled) {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：已安装（未启用）";
  } else {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：已启用";
    const memoryResult = await deps.fetchMemoryChatKeysEvent(1200).catch(() => ({ chatKeys: [], updatedAt: null }));
    if (token !== STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event) return;
    memoryChatKeys = Array.isArray(memoryResult.chatKeys) ? memoryResult.chatKeys : [];
  }

  STATUS_EDITOR_CHAT_LIST_Event = mergeStatusEditorChatListEvent(
    STATUS_EDITOR_CURRENT_CHAT_KEY_Event,
    localSummaries,
    memoryChatKeys
  );
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
  renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);

  const selectedExists = STATUS_EDITOR_CHAT_LIST_Event.some((item) => item.chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event);
  const target =
    (selectedExists ? STATUS_EDITOR_SELECTED_CHAT_KEY_Event : "") ||
    STATUS_EDITOR_CURRENT_CHAT_KEY_Event ||
    STATUS_EDITOR_CHAT_LIST_Event[0]?.chatKey ||
    "";
  if (!target) {
    STATUS_EDITOR_SELECTED_CHAT_KEY_Event = "";
    STATUS_EDITOR_ROWS_DRAFT_Event = [];
    STATUS_EDITOR_LAST_SNAPSHOT_Event = "[]";
    STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "[]";
    setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
    return;
  }
  await switchStatusEditorChatEvent(target, deps, { skipSaveCurrent: true });
}

function syncStatusEditorCurrentChatFromRuntimeEvent(deps: Pick<
  BindStatusEditorActionsDepsEvent,
  "SETTINGS_STATUS_ROWS_ID_Event" | "SETTINGS_STATUS_DIRTY_HINT_ID_Event" | "getActiveChatKeyEvent" | "getActiveStatusesEvent"
>): void {
  const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
  if (!currentKey) return;
  const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(currentKey);
  if (cached?.dirty) return;
  const statuses = deps.getActiveStatusesEvent();
  const rows = deserializeActiveStatusesToDraftRowsEvent(statuses);
  const snapshot = buildStatusDraftSnapshotEvent(rows);
  const metaSnapshot = buildStatusMetaSnapshotEvent(statuses);
  STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.set(currentKey, {
    rows,
    snapshot,
    metaSnapshot,
    dirty: false,
    updatedAt: Date.now(),
    activeStatusCount: statuses.length,
  });
  if (STATUS_EDITOR_SELECTED_CHAT_KEY_Event && STATUS_EDITOR_SELECTED_CHAT_KEY_Event !== currentKey) return;
  STATUS_EDITOR_SELECTED_CHAT_KEY_Event = currentKey;
  hydrateStatusDraftFromMetaEvent(
    statuses,
    deps.SETTINGS_STATUS_ROWS_ID_Event,
    deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
    true
  );
}

export function bindStatusEditorActionsEvent(deps: BindStatusEditorActionsDepsEvent): void {
  const rowsWrap = document.getElementById(deps.SETTINGS_STATUS_ROWS_ID_Event) as HTMLElement | null;
  const addBtn = document.getElementById(deps.SETTINGS_STATUS_ADD_ID_Event) as HTMLButtonElement | null;
  const saveBtn = document.getElementById(deps.SETTINGS_STATUS_SAVE_ID_Event) as HTMLButtonElement | null;
  const resetBtn = document.getElementById(deps.SETTINGS_STATUS_RESET_ID_Event) as HTMLButtonElement | null;
  const chatList = document.getElementById(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event) as HTMLElement | null;
  const splitter = document.getElementById(deps.SETTINGS_STATUS_SPLITTER_ID_Event) as HTMLElement | null;
  const cols = document.getElementById(deps.SETTINGS_STATUS_COLS_ID_Event) as HTMLElement | null;

  if (!rowsWrap) return;
  if (rowsWrap.dataset.statusEditorBound === "1") return;
  rowsWrap.dataset.statusEditorBound = "1";

  applyStatusEditorLayoutPrefsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
  if (splitter) bindStatusEditorSplitterResizeEvent(splitter, deps.SETTINGS_STATUS_ROWS_ID_Event);
  if (cols) bindStatusEditorColumnResizeEvent(cols, deps.SETTINGS_STATUS_ROWS_ID_Event);

  const markDirty = () => {
    const next = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
    setStatusDraftDirtyEvent(next !== STATUS_EDITOR_LAST_SNAPSHOT_Event, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  };

  syncStatusEditorCurrentChatFromRuntimeEvent(deps);
  renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
  renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  void refreshStatusEditorChatListEvent(deps);

  rowsWrap.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) return;
    const rowId = String((target as any).dataset.statusRowId ?? "");
    const field = String((target as any).dataset.statusField ?? "");
    if (!rowId || !field) return;
    const row = STATUS_EDITOR_ROWS_DRAFT_Event.find((item) => item.rowId === rowId);
    if (!row) return;

    if (field === "name") row.name = target.value;
    if (field === "modifier") row.modifierText = target.value;
    if (field === "skills") row.skillsText = target.value;
    if (field === "duration") row.durationText = target.value;
    if (field === "scope") {
      row.scope = target.value === "all" ? "all" : "skills";
      if (row.scope === "all") row.skillsText = "";
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    }
    if (field === "enabled") {
      row.enabled = (target as HTMLInputElement).checked;
    }
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  rowsWrap.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const rowId = String(target.dataset.statusRowId ?? "");
    const field = String(target.dataset.statusField ?? "");
    if (!rowId || field !== "enabled") return;
    const row = STATUS_EDITOR_ROWS_DRAFT_Event.find((item) => item.rowId === rowId);
    if (!row) return;
    row.enabled = target.checked;
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  rowsWrap.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const removeBtn = target?.closest<HTMLButtonElement>("button[data-status-remove-id]");
    if (!removeBtn) return;
    const rowId = String(removeBtn.dataset.statusRemoveId ?? "");
    if (!rowId) return;
    STATUS_EDITOR_ROWS_DRAFT_Event = STATUS_EDITOR_ROWS_DRAFT_Event.filter((item) => item.rowId !== rowId);
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  chatList?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLButtonElement>("button[data-status-chat-key]");
    if (!item) return;
    const chatKey = String(item.dataset.statusChatKey ?? "").trim();
    if (!chatKey || chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event) return;
    void switchStatusEditorChatEvent(chatKey, deps);
  });

  addBtn?.addEventListener("click", () => {
    STATUS_EDITOR_ROWS_DRAFT_Event = [...STATUS_EDITOR_ROWS_DRAFT_Event, createStatusEditorRowDraftEvent()];
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  saveBtn?.addEventListener("click", () => {
    void (async () => {
      const selectedChatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
      if (!selectedChatKey) return;
      const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
      const existing =
        selectedChatKey === currentKey
          ? deps.getActiveStatusesEvent()
          : await deps.loadStatusesForChatKeyEvent(selectedChatKey);
      const validated = validateStatusRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event, existing);
      if (validated.errors.length > 0) {
        renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, validated.errors);
        return;
      }

      if (selectedChatKey === currentKey) {
        deps.setActiveStatusesEvent(validated.statuses);
      } else {
        await deps.saveStatusesForChatKeyEvent(selectedChatKey, validated.statuses);
      }
      STATUS_EDITOR_ROWS_DRAFT_Event = deserializeActiveStatusesToDraftRowsEvent(validated.statuses);
      STATUS_EDITOR_LAST_SNAPSHOT_Event = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
      STATUS_EDITOR_LAST_META_SNAPSHOT_Event = buildStatusMetaSnapshotEvent(validated.statuses);
      setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
      saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);

      const item = STATUS_EDITOR_CHAT_LIST_Event.find((entry) => entry.chatKey === selectedChatKey);
      if (item) {
        item.updatedAt = Date.now();
        item.activeStatusCount = validated.statuses.length;
      }
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
      renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      deps.syncSettingsUiEvent?.();
      deps.pushToChat?.(
        selectedChatKey === currentKey
          ? "状态编辑器：已保存并立即应用到当前聊天。"
          : `状态编辑器：已保存到聊天 ${selectedChatKey}。`
      );
    })();
  });

  resetBtn?.addEventListener("click", () => {
    void (async () => {
      const selectedChatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
      if (!selectedChatKey) return;
      const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
      if (selectedChatKey === currentKey) {
        deps.setActiveStatusesEvent([]);
      } else {
        await deps.saveStatusesForChatKeyEvent(selectedChatKey, []);
      }
      STATUS_EDITOR_ROWS_DRAFT_Event = [];
      STATUS_EDITOR_LAST_SNAPSHOT_Event = "[]";
      STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "[]";
      setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
      saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);

      const item = STATUS_EDITOR_CHAT_LIST_Event.find((entry) => entry.chatKey === selectedChatKey);
      if (item) {
        item.updatedAt = Date.now();
        item.activeStatusCount = 0;
      }
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
      renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      deps.syncSettingsUiEvent?.();
      deps.pushToChat?.(
        selectedChatKey === currentKey
          ? "状态编辑器：已重置当前聊天状态。"
          : `状态编辑器：聊天 ${selectedChatKey} 已重置。`
      );
    })();
  });

  if (!STATUS_EDITOR_OPEN_EVENT_BOUND_Event) {
    document.addEventListener("st-roll-status-editor-opened", () => {
      void refreshStatusEditorChatListEvent(deps);
    });
    STATUS_EDITOR_OPEN_EVENT_BOUND_Event = true;
  }

  if (!STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event) {
    STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event = deps.subscribeMemoryPluginStateEvent((payload) => {
      STATUS_EDITOR_MEMORY_STATE_TEXT_Event = payload.enabled
        ? "记忆库：已启用"
        : "记忆库：已安装（未启用）";
      renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
      void refreshStatusEditorChatListEvent(deps);
    });
  }
}

export interface BindMountedSettingsCardDepsEvent {
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

export interface BindSkillRowsEditingActionsDepsEvent {
  SETTINGS_SKILL_ROWS_ID_Event: string;
  SETTINGS_SKILL_ADD_ID_Event: string;
  skillDraftAccessorEvent: SkillDraftAccessorEvent;
  createSkillEditorRowDraftEvent: (skillName: string, modifierText: string) => SkillEditorRowDraftEvent;
  renderSkillRowsEvent: () => void;
  refreshSkillDraftDirtyStateEvent: () => void;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
}

export interface SkillDraftAccessorEvent {
  getRows: () => SkillEditorRowDraftEvent[];
  setRows: (rows: SkillEditorRowDraftEvent[]) => void;
  getSnapshot: () => string;
  setSnapshot: (snapshot: string) => void;
}

export interface CreateSkillDraftAccessorDepsEvent {
  getRowsEvent: () => SkillEditorRowDraftEvent[];
  setRowsEvent: (rows: SkillEditorRowDraftEvent[]) => void;
  getSnapshotEvent: () => string;
  setSnapshotEvent: (snapshot: string) => void;
}

/**
 * 创建技能草稿访问器（纯函数）。
 * 说明：此访问器是技能草稿状态唯一入口。
 */
export function createSkillDraftAccessorEvent(
  deps: CreateSkillDraftAccessorDepsEvent
): SkillDraftAccessorEvent {
  return {
    getRows: deps.getRowsEvent,
    setRows: deps.setRowsEvent,
    getSnapshot: deps.getSnapshotEvent,
    setSnapshot: deps.setSnapshotEvent,
  };
}

export function bindSkillRowsEditingActionsEvent(deps: BindSkillRowsEditingActionsDepsEvent): void {
  const skillRowsWrap = document.getElementById(deps.SETTINGS_SKILL_ROWS_ID_Event) as HTMLElement | null;
  const skillAddBtn = document.getElementById(deps.SETTINGS_SKILL_ADD_ID_Event) as HTMLButtonElement | null;

  skillRowsWrap?.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const rowId = String(target.dataset.skillRowId ?? "");
    const field = String(target.dataset.skillField ?? "");
    if (!rowId || !field) return;
    const rows = deps.skillDraftAccessorEvent.getRows();
    const row = rows.find((item) => item.rowId === rowId);
    if (!row) return;
    if (field === "name") {
      row.skillName = target.value;
    } else if (field === "modifier") {
      row.modifierText = target.value;
    }
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillRowsWrap?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const removeBtn = target?.closest<HTMLButtonElement>("button[data-skill-remove-id]");
    if (!removeBtn) return;
    const rowId = String(removeBtn.dataset.skillRemoveId ?? "");
    if (!rowId) return;
    const rows = deps.skillDraftAccessorEvent.getRows().filter((row) => row.rowId !== rowId);
    deps.skillDraftAccessorEvent.setRows(rows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillAddBtn?.addEventListener("click", () => {
    const rows = [
      ...deps.skillDraftAccessorEvent.getRows(),
      deps.createSkillEditorRowDraftEvent("", ""),
    ];
    deps.skillDraftAccessorEvent.setRows(rows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });
}

export interface BindSkillImportExportActionsDepsEvent {
  SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event: string;
  SETTINGS_SKILL_IMPORT_AREA_ID_Event: string;
  SETTINGS_SKILL_TEXT_ID_Event: string;
  SETTINGS_SKILL_IMPORT_APPLY_ID_Event: string;
  SETTINGS_SKILL_EXPORT_ID_Event: string;
  SETTINGS_SKILL_SAVE_ID_Event: string;
  SETTINGS_SKILL_RESET_ID_Event: string;
  skillDraftAccessorEvent: SkillDraftAccessorEvent;
  serializeSkillRowsToSkillTableTextEvent: (rows: SkillEditorRowDraftEvent[]) => string | null;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getSkillPresetStoreEvent: (settings: DicePluginSettingsEvent) => SkillPresetStoreEvent;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  normalizeSkillTableTextForSettingsEvent: (raw: string) => string | null;
  deserializeSkillTableTextToRowsEvent: (skillTableText: string) => SkillEditorRowDraftEvent[];
  validateSkillRowsEvent: (rows: SkillEditorRowDraftEvent[]) => {
    errors: string[];
    table: Record<string, number>;
  };
  renderSkillRowsEvent: () => void;
  refreshSkillDraftDirtyStateEvent: () => void;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
  copyTextToClipboardEvent: (text: string) => Promise<boolean>;
  pushToChat: (message: string) => void;
  buildSkillDraftSnapshotEvent: (rows: SkillEditorRowDraftEvent[]) => string;
  setSkillDraftDirtyEvent: (flag: boolean) => void;
  saveSkillPresetStoreEvent: (store: SkillPresetStoreEvent) => void;
}

export function bindSkillImportExportActionsEvent(
  deps: BindSkillImportExportActionsDepsEvent
): void {
  const skillImportToggleBtn = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event
  ) as HTMLButtonElement | null;
  const skillImportArea = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_AREA_ID_Event
  ) as HTMLElement | null;
  const skillTextInput = document.getElementById(
    deps.SETTINGS_SKILL_TEXT_ID_Event
  ) as HTMLTextAreaElement | null;
  const skillImportApplyBtn = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_APPLY_ID_Event
  ) as HTMLButtonElement | null;
  const skillExportBtn = document.getElementById(
    deps.SETTINGS_SKILL_EXPORT_ID_Event
  ) as HTMLButtonElement | null;
  const skillSaveBtn = document.getElementById(
    deps.SETTINGS_SKILL_SAVE_ID_Event
  ) as HTMLButtonElement | null;
  const skillResetBtn = document.getElementById(
    deps.SETTINGS_SKILL_RESET_ID_Event
  ) as HTMLButtonElement | null;

  skillImportToggleBtn?.addEventListener("click", () => {
    if (!skillImportArea) return;
    const willOpen = skillImportArea.hidden;
    skillImportArea.hidden = !willOpen;
    skillImportToggleBtn.textContent = willOpen ? "收起导入" : "导入 JSON";
    if (!willOpen || !skillTextInput) return;
    const serialized = deps.serializeSkillRowsToSkillTableTextEvent(deps.skillDraftAccessorEvent.getRows());
    skillTextInput.value =
      serialized ??
      deps.getActiveSkillPresetEvent(deps.getSkillPresetStoreEvent(deps.getSettingsEvent())).skillTableText;
  });

  skillImportApplyBtn?.addEventListener("click", () => {
    const raw = String(skillTextInput?.value ?? "");
    if (deps.normalizeSkillTableTextForSettingsEvent(raw) == null) {
      deps.renderSkillValidationErrorsEvent([
        "导入失败：必须是 JSON 对象（例如 {\"察觉\":15,\"说服\":8}）。",
      ]);
      return;
    }
    const importedRows = deps.deserializeSkillTableTextToRowsEvent(raw);
    const validation = deps.validateSkillRowsEvent(importedRows);
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent(validation.errors);
      return;
    }
    deps.skillDraftAccessorEvent.setRows(importedRows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillExportBtn?.addEventListener("click", () => {
    const validation = deps.validateSkillRowsEvent(deps.skillDraftAccessorEvent.getRows());
    const settings = deps.getSettingsEvent();
    const activePreset = deps.getActiveSkillPresetEvent(deps.getSkillPresetStoreEvent(settings));
    const exportText = validation.errors.length
      ? activePreset.skillTableText
      : JSON.stringify(validation.table, null, 2);
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent([
        "当前草稿有校验错误，已导出已保存的技能表。",
      ]);
    } else {
      deps.renderSkillValidationErrorsEvent([]);
    }
    deps.copyTextToClipboardEvent(exportText).then((ok) => {
      if (ok) {
        deps.pushToChat("✅ 技能表 JSON 已复制到剪贴板。");
        return;
      }
      if (skillImportArea) {
        skillImportArea.hidden = false;
      }
      if (skillImportToggleBtn) {
        skillImportToggleBtn.textContent = "收起导入";
      }
      if (skillTextInput) {
        skillTextInput.value = exportText;
      }
      deps.pushToChat("⚠️ 剪贴板不可用，请在导入框中手动复制 JSON。");
    });
  });

  skillSaveBtn?.addEventListener("click", () => {
    const validation = deps.validateSkillRowsEvent(deps.skillDraftAccessorEvent.getRows());
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent(validation.errors);
      deps.pushToChat("❌ 技能表保存失败，请先修正校验错误。");
      return;
    }
    const normalized = JSON.stringify(validation.table, null, 2);
    const normalizedRows = deps.deserializeSkillTableTextToRowsEvent(normalized);
    deps.skillDraftAccessorEvent.setRows(normalizedRows);
    deps.skillDraftAccessorEvent.setSnapshot(deps.buildSkillDraftSnapshotEvent(normalizedRows));
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    activePreset.skillTableText = normalized;
    activePreset.updatedAt = Date.now();
    deps.renderSkillRowsEvent();
    deps.setSkillDraftDirtyEvent(false);
    deps.renderSkillValidationErrorsEvent([]);
    deps.saveSkillPresetStoreEvent(store);
    if (skillTextInput) {
      skillTextInput.value = normalized;
    }
  });

  skillResetBtn?.addEventListener("click", () => {
    deps.skillDraftAccessorEvent.setRows([]);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });
}

export interface ConfirmDiscardSkillDraftDepsEvent {
  isSkillDraftDirtyEvent: () => boolean;
  hydrateSkillDraftFromSettingsEvent: (resetDirty?: boolean) => void;
}

export function confirmDiscardSkillDraftEvent(
  deps: ConfirmDiscardSkillDraftDepsEvent
): boolean {
  if (!deps.isSkillDraftDirtyEvent()) return true;
  const confirmed = window.confirm("技能改动未保存，是否丢弃并继续？");
  if (!confirmed) return false;
  deps.hydrateSkillDraftFromSettingsEvent(true);
  return true;
}

export function isElementVisibleEvent(element: HTMLElement | null): boolean {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function copyTextToClipboardEvent(text: string): Promise<boolean> {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.resolve(false);
  }
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

export interface RenderSkillValidationErrorsDepsEvent {
  SETTINGS_SKILL_ERRORS_ID_Event: string;
  escapeHtmlEvent: (input: string) => string;
}

export function renderSkillValidationErrorsEvent(
  errors: string[],
  deps: RenderSkillValidationErrorsDepsEvent
): void {
  const errorWrap = document.getElementById(deps.SETTINGS_SKILL_ERRORS_ID_Event) as HTMLElement | null;
  if (!errorWrap) return;
  if (!errors.length) {
    errorWrap.hidden = true;
    errorWrap.innerHTML = "";
    return;
  }
  errorWrap.hidden = false;
  errorWrap.innerHTML = errors
    .map((item) => `<div class="st-roll-skill-error-item">${deps.escapeHtmlEvent(item)}</div>`)
    .join("");
}

export interface RenderSkillPresetListDepsEvent {
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number;
  escapeAttrEvent: (input: string) => string;
  escapeHtmlEvent: (input: string) => string;
  activeDraftCountEvent?: number | null;
}

export function renderSkillPresetListEvent(
  store: SkillPresetStoreEvent,
  deps: RenderSkillPresetListDepsEvent
): void {
  const listWrap = document.getElementById(deps.SETTINGS_SKILL_PRESET_LIST_ID_Event) as HTMLElement | null;
  if (!listWrap) return;
  if (!store.presets.length) {
    listWrap.innerHTML = `<div class="st-roll-skill-preset-empty">暂无预设</div>`;
    return;
  }
  listWrap.innerHTML = store.presets
    .map((preset) => {
      const isActive = preset.id === store.activePresetId;
      const skillCount =
        isActive && Number.isFinite(Number(deps.activeDraftCountEvent))
          ? Number(deps.activeDraftCountEvent)
          : deps.countSkillEntriesFromSkillTableTextEvent(preset.skillTableText);
      const presetId = deps.escapeAttrEvent(preset.id);
      const presetName = deps.escapeHtmlEvent(preset.name);
      return `
        <button type="button" class="st-roll-skill-preset-item ${isActive ? "is-active" : ""}" data-skill-preset-id="${presetId}">
          <span class="st-roll-skill-preset-name">${presetName}</span>
          <span class="st-roll-skill-preset-tags">
            <span class="st-roll-skill-preset-tag">${skillCount}</span>
            ${isActive ? `<span class="st-roll-skill-preset-tag active">生效中</span>` : ""}
            ${preset.locked ? `<span class="st-roll-skill-preset-tag locked">默认</span>` : ""}
          </span>
        </button>
      `;
    })
    .join("");
}

export interface RenderSkillPresetMetaDepsEvent {
  SETTINGS_SKILL_PRESET_META_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  activeDraftCountEvent?: number | null;
}

export function renderSkillPresetMetaEvent(
  store: SkillPresetStoreEvent,
  deps: RenderSkillPresetMetaDepsEvent
): void {
  const activePreset = deps.getActiveSkillPresetEvent(store);
  const meta = document.getElementById(deps.SETTINGS_SKILL_PRESET_META_ID_Event) as HTMLElement | null;
  if (meta) {
    const count = Number.isFinite(Number(deps.activeDraftCountEvent))
      ? Number(deps.activeDraftCountEvent)
      : deps.countSkillEntriesFromSkillTableTextEvent(activePreset.skillTableText);
    meta.textContent = `当前预设：${activePreset.name}（技能 ${count} 项）`;
  }
  const nameInput = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_NAME_ID_Event
  ) as HTMLInputElement | null;
  if (nameInput && nameInput.value !== activePreset.name) {
    nameInput.value = activePreset.name;
  }
  const deleteBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event
  ) as HTMLButtonElement | null;
  if (deleteBtn) {
    deleteBtn.disabled = activePreset.locked;
    deleteBtn.style.opacity = activePreset.locked ? "0.5" : "1";
    deleteBtn.title = activePreset.locked ? "默认预设不可删除" : "";
  }
}

export interface RenderSkillRowsDepsEvent {
  SETTINGS_SKILL_ROWS_ID_Event: string;
  escapeAttrEvent: (input: string) => string;
}

export function renderSkillRowsEvent(
  rows: SkillEditorRowDraftEvent[],
  deps: RenderSkillRowsDepsEvent
): void {
  const rowsWrap = document.getElementById(deps.SETTINGS_SKILL_ROWS_ID_Event) as HTMLElement | null;
  if (!rowsWrap) return;
  if (!rows.length) {
    rowsWrap.innerHTML = `<div class="st-roll-skill-empty">暂无技能，点击“新增技能”开始配置。</div>`;
    return;
  }
  rowsWrap.innerHTML = rows
    .map((row) => {
      const rowId = deps.escapeAttrEvent(String(row.rowId ?? ""));
      const skillName = deps.escapeAttrEvent(String(row.skillName ?? ""));
      const modifierText = deps.escapeAttrEvent(String(row.modifierText ?? ""));
      return `
      <div class="st-roll-skill-row" data-row-id="${rowId}">
        <input
          class="st-roll-input st-roll-skill-name"
          type="text"
          placeholder="例如：察觉"
          data-skill-row-id="${rowId}"
          data-skill-field="name"
          value="${skillName}"
        />
        <input
          class="st-roll-input st-roll-skill-modifier"
          type="text"
          inputmode="numeric"
          placeholder="例如：15"
          data-skill-row-id="${rowId}"
          data-skill-field="modifier"
          value="${modifierText}"
        />
        <button type="button" class="st-roll-btn secondary st-roll-skill-remove" data-skill-remove-id="${rowId}">
          删除
        </button>
      </div>
    `;
    })
    .join("");
}

export interface SyncSettingsUiDepsEvent {
  getSettingsEvent: () => {
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
    enableSkillSystem: boolean;
    skillTableText: string;
    skillPresetStoreText: string;
    ruleText: string;
  };
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
  SETTINGS_SKILL_ENABLED_ID_Event: string;
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event: string;
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
  const skillEnabledInput = document.getElementById(
    deps.SETTINGS_SKILL_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const statusEditorOpenBtn = document.getElementById(
    deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const ruleTextInput = document.getElementById(
    deps.SETTINGS_RULE_TEXT_ID_Event
  ) as HTMLTextAreaElement | null;

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
  if (skillEnabledInput) {
    skillEnabledInput.checked = Boolean(settings.enableSkillSystem);
  }
  if (statusEditorOpenBtn) {
    statusEditorOpenBtn.disabled = !settings.enableStatusSystem;
    statusEditorOpenBtn.style.opacity = settings.enableStatusSystem ? "1" : "0.5";
  }

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
      if (!STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(currentChatKey)?.dirty) {
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
