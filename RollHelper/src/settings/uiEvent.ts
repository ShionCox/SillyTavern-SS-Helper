import type { ActiveStatusEvent } from "../types/eventDomainEvent";
import {
  initThemeKernel,
  getTheme,
  setTheme,
  normalizeThemeId,
} from "../../../SDK/theme";
import {
  settingsThemeToSdkThemeEvent,
  sdkThemeToSettingsThemeEvent,
  normalizeSettingsThemeEvent,
} from "./themeBridgeEvent";
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
  syncThemeControlClassesByNodeEvent,
} from "./uiThemeEvent";
import { logger } from "../../index";
import { syncSharedSelects } from "../../../_Components/sharedSelect";
import {
  closeSharedDialog,
  getSharedDialogInstance,
  openSharedDialog,
} from "../../../_Components/sharedDialog";
import {
  bindSharedFloatingPanelDragEvent,
  ensureSharedFloatingPanelPositionEvent,
} from "../../../_Components/sharedFloatingPanel";
import { request } from "../../../SDK/bus/rpc";
import { listTavernActiveWorldbooksEvent } from "../../../SDK/tavern";
import {
  buildPassiveWorldbookTemplateEvent,
  createPassiveTemplateWorldbookEntryEvent,
} from "../events/passiveBlindEvent";

const ROLLHELPER_NAMESPACE_Event = "stx_rollhelper";
const LLMHUB_NAMESPACE_Event = "stx_llmhub";

function traceRollHelperThemeInput(message: string, payload?: unknown): void {
  if (payload === undefined) {
    logger.info(`[SS-Helper][RollHelperThemeInput] ${message}`);
    return;
  }
  logger.info(`[SS-Helper][RollHelperThemeInput] ${message}`, payload);
}

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

function restoreDetachedPanelEvent(
  owner: HTMLElement,
  panel: HTMLElement,
  anchor: ChildNode | null
): void {
  if (!owner.isConnected || owner.contains(panel)) {
    return;
  }
  if (anchor?.parentNode === owner) {
    owner.insertBefore(panel, anchor);
    return;
  }
  owner.appendChild(panel);
}

export interface BindSettingsTabsAndModalDepsEvent {
  drawerToggleId: string;
  drawerContentId: string;
  SETTINGS_TAB_MAIN_ID_Event: string;
  SETTINGS_TAB_AI_ID_Event: string;
  SETTINGS_TAB_SKILL_ID_Event: string;
  SETTINGS_TAB_RULE_ID_Event: string;
  SETTINGS_TAB_ABOUT_ID_Event: string;
  SETTINGS_PANEL_MAIN_ID_Event: string;
  SETTINGS_PANEL_AI_ID_Event: string;
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
  SETTINGS_AI_BRIDGE_STATUS_LIGHT_ID_Event: string;
  SETTINGS_AI_BRIDGE_STATUS_TEXT_ID_Event: string;
  SETTINGS_AI_BRIDGE_REFRESH_ID_Event: string;
  confirmDiscardSkillDraftEvent: () => boolean;
  isElementVisibleEvent: (element: HTMLElement | null) => boolean;
  isSkillDraftDirtyEvent: () => boolean;
}

export function bindSettingsTabsAndModalEvent(deps: BindSettingsTabsAndModalDepsEvent): void {
  const tabMain = document.getElementById(deps.SETTINGS_TAB_MAIN_ID_Event) as HTMLButtonElement | null;
  const tabAi = document.getElementById(deps.SETTINGS_TAB_AI_ID_Event) as HTMLButtonElement | null;
  const tabSkill = document.getElementById(deps.SETTINGS_TAB_SKILL_ID_Event) as HTMLButtonElement | null;
  const tabRule = document.getElementById(deps.SETTINGS_TAB_RULE_ID_Event) as HTMLButtonElement | null;
  const tabAbout = document.getElementById(deps.SETTINGS_TAB_ABOUT_ID_Event) as HTMLButtonElement | null;
  const panelMain = document.getElementById(deps.SETTINGS_PANEL_MAIN_ID_Event) as HTMLElement | null;
  const panelAi = document.getElementById(deps.SETTINGS_PANEL_AI_ID_Event) as HTMLElement | null;
  const panelSkill = document.getElementById(deps.SETTINGS_PANEL_SKILL_ID_Event) as HTMLElement | null;
  const panelRule = document.getElementById(deps.SETTINGS_PANEL_RULE_ID_Event) as HTMLElement | null;
  const panelAbout = document.getElementById(deps.SETTINGS_PANEL_ABOUT_ID_Event) as HTMLElement | null;
  const skillModal = document.getElementById(deps.SETTINGS_SKILL_MODAL_ID_Event) as HTMLElement | null;
  const skillEditorOpenBtn = document.getElementById(
    deps.SETTINGS_SKILL_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const skillModalCloseBtn = document.getElementById(
    deps.SETTINGS_SKILL_MODAL_CLOSE_ID_Event
  ) as HTMLButtonElement | null;
  const statusModal = document.getElementById(deps.SETTINGS_STATUS_MODAL_ID_Event) as HTMLElement | null;
  const statusEditorOpenBtn = document.getElementById(
    deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event
  ) as HTMLButtonElement | null;
  const statusModalCloseBtn = document.getElementById(
    deps.SETTINGS_STATUS_MODAL_CLOSE_ID_Event
  ) as HTMLButtonElement | null;
  const searchInput = document.getElementById(deps.SETTINGS_SEARCH_ID_Event) as HTMLInputElement | null;
  const aiBridgeStatusLight = document.getElementById(
    deps.SETTINGS_AI_BRIDGE_STATUS_LIGHT_ID_Event
  ) as HTMLElement | null;
  const aiBridgeStatusText = document.getElementById(
    deps.SETTINGS_AI_BRIDGE_STATUS_TEXT_ID_Event
  ) as HTMLElement | null;
  const aiBridgeRefreshBtn = document.getElementById(
    deps.SETTINGS_AI_BRIDGE_REFRESH_ID_Event
  ) as HTMLButtonElement | null;

  const searchableMainItems = panelMain
    ? Array.from(panelMain.querySelectorAll<HTMLElement>(".st-roll-search-item"))
    : [];
  const searchableAiItems = panelAi
    ? Array.from(panelAi.querySelectorAll<HTMLElement>(".st-roll-search-item"))
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
    ...searchableAiItems,
    ...searchableSkillItems,
    ...searchableRuleItems,
    ...searchableAboutItems,
  ];

  let activeTab: "main" | "ai" | "skill" | "rule" | "about" = "main";
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

  const skillDialogId = `${deps.SETTINGS_SKILL_MODAL_ID_Event}__shared-dialog`;
  const statusDialogId = `${deps.SETTINGS_STATUS_MODAL_ID_Event}__shared-dialog`;

  const mountEditorPanelDialogEvent = (params: {
    dialogId: string;
    owner: HTMLElement | null;
    panelSelector: string;
    panelVariant: "skill" | "status";
    dragHandleSelector: string;
    rootClassName: string;
    backdropClassName: string;
    afterOpen?: () => void;
  }): void => {
    const owner = params.owner;
    if (!owner) return;

    const existing = getSharedDialogInstance(params.dialogId);
    if (existing) {
      if (existing.root.isConnected && existing.root.classList.contains("is-open")) {
        existing.focusInitial();
        return;
      }
      existing.destroy("replace");
    }

    const panel = owner.querySelector<HTMLElement>(params.panelSelector);
    if (!panel) return;

    const anchor = panel.nextSibling;
    const hostElement = owner.parentElement instanceof HTMLElement ? owner.parentElement : null;

    openSharedDialog({
      id: params.dialogId,
      hostElement,
      layout: "bare",
      chrome: false,
      closeOnBackdrop: true,
      closeOnEscape: true,
      rootClassName: params.rootClassName,
      rootAttributes: {
        open: true,
      },
      surfaceAttributes: {
        "aria-label": panel.getAttribute("aria-label") || undefined,
      },
      onMount: (instance) => {
        instance.backdrop.classList.add(params.backdropClassName);
        instance.content.style.padding = "0";
        instance.content.style.gap = "0";
        instance.content.style.overflow = "visible";
        instance.content.appendChild(panel);
        const dragHandle = panel.querySelector<HTMLElement>(params.dragHandleSelector);
        if (dragHandle) {
          dragHandle.dataset.stxFloatingBindKey = params.dialogId;
          bindSharedFloatingPanelDragEvent({
            panel,
            handle: dragHandle,
            draggingClassName: "is-floating-dragging",
            mobileBreakpoint: 680,
            initialPosition: () => {
              const rect = panel.getBoundingClientRect();
              return {
                left: Math.round((window.innerWidth - rect.width) / 2 + (params.panelVariant === "status" ? 32 : -12)),
                top: params.panelVariant === "status" ? 78 : 64,
              };
            },
          });
        }
        requestAnimationFrame(() => {
          ensureSharedFloatingPanelPositionEvent({
            panel,
            handle: dragHandle ?? panel,
            mobileBreakpoint: 680,
            initialPosition: () => {
              const rect = panel.getBoundingClientRect();
              return {
                left: Math.round((window.innerWidth - rect.width) / 2 + (params.panelVariant === "status" ? 32 : -12)),
                top: params.panelVariant === "status" ? 78 : 64,
              };
            },
          });
        });
        syncSharedSelects(instance.root);
      },
      onAfterOpen: () => {
        params.afterOpen?.();
      },
      onAfterClose: () => {
        restoreDetachedPanelEvent(owner, panel, anchor);
      },
    });
  };

  const closeSkillEditorModalEvent = () => {
    void closeSharedDialog(skillDialogId);
  };

  const openSkillEditorModalEvent = () => {
    ensureSettingsDrawerVisibleEvent();
    mountEditorPanelDialogEvent({
      dialogId: skillDialogId,
      owner: skillModal,
      panelSelector: ".st-roll-skill-modal-panel",
      panelVariant: "skill",
      dragHandleSelector: ".st-roll-skill-modal-head",
      rootClassName: "st-roll-skill-modal",
      backdropClassName: "st-roll-skill-modal-backdrop",
    });
  };

  const closeStatusEditorModalEvent = () => {
    void closeSharedDialog(statusDialogId);
  };

  const openStatusEditorModalEvent = () => {
    ensureSettingsDrawerVisibleEvent();
    mountEditorPanelDialogEvent({
      dialogId: statusDialogId,
      owner: statusModal,
      panelSelector: ".st-roll-status-modal-panel",
      panelVariant: "status",
      dragHandleSelector: ".st-roll-status-modal-head",
      rootClassName: "st-roll-status-modal",
      backdropClassName: "st-roll-status-modal-backdrop",
      afterOpen: () => {
        document.dispatchEvent(new CustomEvent("st-roll-status-editor-opened"));
      },
    });
  };

  const setAiBridgeStatusEvent = (
    state: "online" | "offline" | "checking",
    text: string
  ): void => {
    if (aiBridgeStatusLight) {
      aiBridgeStatusLight.classList.remove("is-online", "is-offline", "is-checking");
      aiBridgeStatusLight.classList.add(`is-${state}`);
    }
    if (aiBridgeStatusText) {
      aiBridgeStatusText.textContent = text;
    }
  };

  const probeLlmHubBridgeEvent = async (): Promise<void> => {
    setAiBridgeStatusEvent("checking", "检测中...");
    try {
      const result = (await request(
        "plugin:request:ping",
        {},
        ROLLHELPER_NAMESPACE_Event,
        {
          to: LLMHUB_NAMESPACE_Event,
          timeoutMs: 1200,
        }
      )) as any;
      if (Boolean(result?.alive)) {
        const version = String(result?.version ?? "").trim();
        const versionText = version ? ` (v${version})` : "";
        setAiBridgeStatusEvent("online", `已连接 LLMHub${versionText}`);
        return;
      }
      setAiBridgeStatusEvent("offline", "LLMHub 未在线");
    } catch {
      setAiBridgeStatusEvent("offline", "LLMHub 未在线");
    }
  };

  const activateTab = (tab: "main" | "ai" | "skill" | "rule" | "about") => {
    activeTab = tab;
    const isMain = tab === "main";
    const isAi = tab === "ai";
    const isSkill = tab === "skill";
    const isRule = tab === "rule";
    const isAbout = tab === "about";
    tabMain?.classList.toggle("is-active", isMain);
    tabAi?.classList.toggle("is-active", isAi);
    tabSkill?.classList.toggle("is-active", isSkill);
    tabRule?.classList.toggle("is-active", isRule);
    tabAbout?.classList.toggle("is-active", isAbout);
    if (panelMain) panelMain.hidden = !isMain;
    if (panelAi) panelAi.hidden = !isAi;
    if (panelSkill) panelSkill.hidden = !isSkill;
    if (panelRule) panelRule.hidden = !isRule;
    if (panelAbout) panelAbout.hidden = !isAbout;
    syncThemeControlClassesByNodeEvent(tabMain || tabSkill || tabRule || tabAbout || panelMain || panelSkill || panelRule || panelAbout || null);
  };

  const tryActivateTab = (nextTab: "main" | "ai" | "skill" | "rule" | "about"): boolean => {
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
    const hasAiVisible = searchableAiItems.some(
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

    const hasVisibleByTab: Record<"main" | "ai" | "skill" | "rule" | "about", boolean> = {
      main: hasMainVisible,
      ai: hasAiVisible,
      skill: hasSkillVisible,
      rule: hasRuleVisible,
      about: hasAboutVisible,
    };
    if (!hasVisibleByTab[activeTab]) {
      const fallbackOrder: Array<"main" | "ai" | "skill" | "rule" | "about"> = [
        "main",
        "ai",
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
  tabAi?.addEventListener("click", () => {
    if (!tryActivateTab("ai")) return;
    applySettingsSearchFilter();
    void probeLlmHubBridgeEvent();
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
  aiBridgeRefreshBtn?.addEventListener("click", () => {
    void probeLlmHubBridgeEvent();
  });
  searchInput?.addEventListener("input", applySettingsSearchFilter);
  applySettingsSearchFilter();
  setAiBridgeStatusEvent("offline", "待检测");

  skillEditorOpenBtn?.addEventListener("click", () => {
    if (!tryActivateTab("skill")) return;
    openSkillEditorModalEvent();
  });

  skillModalCloseBtn?.addEventListener("click", () => {
    closeSkillEditorModalEvent();
  });

  statusEditorOpenBtn?.addEventListener("click", () => {
    if (!tryActivateTab("main")) return;
    openStatusEditorModalEvent();
  });

  statusModalCloseBtn?.addEventListener("click", () => {
    closeStatusEditorModalEvent();
  });

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
  SETTINGS_DICE_3D_ENABLED_ID_Event: string;
  SETTINGS_REROLL_ENABLED_ID_Event: string;
  SETTINGS_EXPLODING_ENABLED_ID_Event: string;
  SETTINGS_ADVANTAGE_ENABLED_ID_Event: string;
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event: string;
  SETTINGS_DYNAMIC_DC_REASON_ID_Event: string;
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event: string;
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event: string;
  SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event: string;
  SETTINGS_BLIND_ROLL_ENABLED_ID_Event: string;
  SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event: string;
  SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event: string;
  SETTINGS_PASSIVE_FORMULA_BASE_ID_Event: string;
  SETTINGS_PASSIVE_ALIASES_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_CREATE_ID_Event: string;
  SETTINGS_NARRATIVE_COST_ENABLED_ID_Event: string;
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
    enable3DDiceBox?: boolean;
    enableRerollFeature?: boolean;
    enableExplodingDice?: boolean;
    enableAdvantageSystem?: boolean;
    enableDynamicResultGuidance?: boolean;
    enableDynamicDcReason?: boolean;
    enableStatusSystem?: boolean;
    aiAllowedDiceSidesText?: string;
    enableInteractiveTriggers?: boolean;
    enableBlindRoll?: boolean;
    defaultBlindSkillsText?: string;
    enablePassiveCheck?: boolean;
    passiveFormulaBase?: number;
    passiveSkillAliasesText?: string;
    enableNarrativeCostEnforcement?: boolean;
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
  const themeInput = document.getElementById(deps.SETTINGS_THEME_ID_Event) as HTMLSelectElement | null;
  const enabledInput = document.getElementById(deps.SETTINGS_ENABLED_ID_Event) as HTMLInputElement | null;
  const ruleInput = document.getElementById(deps.SETTINGS_RULE_ID_Event) as HTMLInputElement | null;
  const aiRollModeInput = document.getElementById(
    deps.SETTINGS_AI_ROLL_MODE_ID_Event
  ) as HTMLInputElement | null;
  const aiRoundControlInput = document.getElementById(
    deps.SETTINGS_AI_ROUND_CONTROL_ID_Event
  ) as HTMLInputElement | null;
  const dice3dEnabledInput = document.getElementById(
    deps.SETTINGS_DICE_3D_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const rerollEnabledInput = document.getElementById(
    deps.SETTINGS_REROLL_ENABLED_ID_Event
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
  ) as HTMLElement | null;
  const interactiveTriggersEnabledInput = document.getElementById(
    deps.SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const blindRollEnabledInput = document.getElementById(
    deps.SETTINGS_BLIND_ROLL_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const defaultBlindSkillsInput = document.getElementById(
    deps.SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event
  ) as HTMLTextAreaElement | null;
  const passiveCheckEnabledInput = document.getElementById(
    deps.SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const passiveFormulaBaseInput = document.getElementById(
    deps.SETTINGS_PASSIVE_FORMULA_BASE_ID_Event
  ) as HTMLInputElement | null;
  const passiveAliasesInput = document.getElementById(
    deps.SETTINGS_PASSIVE_ALIASES_ID_Event
  ) as HTMLTextAreaElement | null;
  const worldbookPassiveTemplateInput = document.getElementById(
    deps.SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event
  ) as HTMLTextAreaElement | null;
  const narrativeCostEnabledInput = document.getElementById(
    deps.SETTINGS_NARRATIVE_COST_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const worldbookPassiveCreateButton = document.getElementById(
    deps.SETTINGS_WORLDBOOK_PASSIVE_CREATE_ID_Event
  ) as HTMLButtonElement | null;
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
  const skillEnabledInput = document.getElementById(
    deps.SETTINGS_SKILL_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const settingsRoot = document.querySelector<HTMLElement>("[id^='st-roll-settings-'][id$='-card']") ?? null;
  const skillModal = document.querySelector<HTMLElement>("#st-roll-settings-Event-skill-modal") ?? null;
  const statusModal = document.querySelector<HTMLElement>("#st-roll-settings-Event-status-modal") ?? null;

  themeInput?.addEventListener("change", (event) => {
    const rawValue = String((event.target as HTMLSelectElement).value || "");
    const settingsValue = normalizeSettingsThemeEvent(rawValue);
    const sdkValue = settingsThemeToSdkThemeEvent(settingsValue);
    initThemeKernel();
    setTheme(sdkValue);
    traceRollHelperThemeInput("themeInput change", {
      rawValue,
      settingsValue,
      sdkValue,
      nativeValue: themeInput?.value,
    });
    applySettingsThemeSelectionEvent({
      settingsRoot,
      skillModal,
      statusModal,
      selection: sdkValue,
      themeInput,
      themeInputValue: settingsValue,
    });
    deps.updateSettingsEvent({ theme: settingsValue });
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

  dice3dEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enable3DDiceBox: value });
  });

  rerollEnabledInput?.addEventListener("input", (event) => {
    const value = Boolean((event.target as HTMLInputElement).checked);
    deps.updateSettingsEvent({ enableRerollFeature: value });
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
  interactiveTriggersEnabledInput?.addEventListener("input", (event) => {
    deps.updateSettingsEvent({ enableInteractiveTriggers: Boolean((event.target as HTMLInputElement).checked) });
  });
  blindRollEnabledInput?.addEventListener("input", (event) => {
    deps.updateSettingsEvent({ enableBlindRoll: Boolean((event.target as HTMLInputElement).checked) });
  });
  defaultBlindSkillsInput?.addEventListener("change", (event) => {
    deps.updateSettingsEvent({ defaultBlindSkillsText: String((event.target as HTMLTextAreaElement).value ?? "") });
  });
  passiveCheckEnabledInput?.addEventListener("input", (event) => {
    deps.updateSettingsEvent({ enablePassiveCheck: Boolean((event.target as HTMLInputElement).checked) });
  });
  passiveFormulaBaseInput?.addEventListener("change", (event) => {
    const value = Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0));
    deps.updateSettingsEvent({ passiveFormulaBase: value });
  });
  passiveAliasesInput?.addEventListener("change", (event) => {
    deps.updateSettingsEvent({ passiveSkillAliasesText: String((event.target as HTMLTextAreaElement).value ?? "") });
  });
  narrativeCostEnabledInput?.addEventListener("input", (event) => {
    deps.updateSettingsEvent({ enableNarrativeCostEnforcement: Boolean((event.target as HTMLInputElement).checked) });
  });
  if (worldbookPassiveTemplateInput && !worldbookPassiveTemplateInput.value.trim()) {
    worldbookPassiveTemplateInput.value = buildPassiveWorldbookTemplateEvent();
  }
  worldbookPassiveCreateButton?.addEventListener("click", () => {
    const activeBook = listTavernActiveWorldbooksEvent(8)[0] ?? "";
    if (!activeBook) {
      logger.warn("当前没有激活的世界书，无法写入 RH_PASSIVE 模板。");
      if (worldbookPassiveTemplateInput) {
        worldbookPassiveTemplateInput.value = buildPassiveWorldbookTemplateEvent();
      }
      return;
    }
    void createPassiveTemplateWorldbookEntryEvent(activeBook).catch((error) => {
      logger.warn(`写入世界书模板失败 book=${activeBook}`, error);
    });
  });

  allowedDiceSidesInput
    ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        const checkedValues = Array.from(
          allowedDiceSidesInput.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')
        )
          .map((node) => Number(node.value))
          .filter((value) => Number.isFinite(value))
          .sort((left, right) => left - right);
        const nextValues = checkedValues.length > 0 ? checkedValues : [20];
        if (checkedValues.length === 0) {
          input.checked = true;
        }
        deps.updateSettingsEvent({ aiAllowedDiceSidesText: nextValues.join(",") });
      });
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
    enable3DDiceBox: boolean;
    enableRerollFeature: boolean;
    enableExplodingDice: boolean;
    enableAdvantageSystem: boolean;
    enableDynamicResultGuidance: boolean;
    enableDynamicDcReason: boolean;
    enableStatusSystem: boolean;
    aiAllowedDiceSidesText: string;
    enableInteractiveTriggers: boolean;
    enableBlindRoll: boolean;
    defaultBlindSkillsText: string;
    enablePassiveCheck: boolean;
    passiveFormulaBase: number;
    passiveSkillAliasesText: string;
    enableNarrativeCostEnforcement: boolean;
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
  SETTINGS_CARD_ID_Event: string;
  SETTINGS_THEME_ID_Event: string;
  SETTINGS_ENABLED_ID_Event: string;
  SETTINGS_RULE_ID_Event: string;
  SETTINGS_AI_ROLL_MODE_ID_Event: string;
  SETTINGS_AI_ROUND_CONTROL_ID_Event: string;
  SETTINGS_DICE_3D_ENABLED_ID_Event: string;
  SETTINGS_REROLL_ENABLED_ID_Event: string;
  SETTINGS_EXPLODING_ENABLED_ID_Event: string;
  SETTINGS_ADVANTAGE_ENABLED_ID_Event: string;
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event: string;
  SETTINGS_DYNAMIC_DC_REASON_ID_Event: string;
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event: string;
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event: string;
  SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event: string;
  SETTINGS_BLIND_ROLL_ENABLED_ID_Event: string;
  SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event: string;
  SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event: string;
  SETTINGS_PASSIVE_FORMULA_BASE_ID_Event: string;
  SETTINGS_PASSIVE_ALIASES_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_CREATE_ID_Event: string;
  SETTINGS_NARRATIVE_COST_ENABLED_ID_Event: string;
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
  const dice3dEnabledInput = document.getElementById(
    deps.SETTINGS_DICE_3D_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const rerollEnabledInput = document.getElementById(
    deps.SETTINGS_REROLL_ENABLED_ID_Event
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
  ) as HTMLElement | null;
  const interactiveTriggersEnabledInput = document.getElementById(
    deps.SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const blindRollEnabledInput = document.getElementById(
    deps.SETTINGS_BLIND_ROLL_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const defaultBlindSkillsInput = document.getElementById(
    deps.SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event
  ) as HTMLTextAreaElement | null;
  const passiveCheckEnabledInput = document.getElementById(
    deps.SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event
  ) as HTMLInputElement | null;
  const passiveFormulaBaseInput = document.getElementById(
    deps.SETTINGS_PASSIVE_FORMULA_BASE_ID_Event
  ) as HTMLInputElement | null;
  const passiveAliasesInput = document.getElementById(
    deps.SETTINGS_PASSIVE_ALIASES_ID_Event
  ) as HTMLTextAreaElement | null;
  const worldbookPassiveTemplateInput = document.getElementById(
    deps.SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event
  ) as HTMLTextAreaElement | null;
  const narrativeCostEnabledInput = document.getElementById(
    deps.SETTINGS_NARRATIVE_COST_ENABLED_ID_Event
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

  // 直接读 SDK 当前状态，避免因 store 缓存时序问题读到陈旧的 settings.theme
  const sdkThemeSelection = normalizeThemeId(getTheme().themeId);
  const settingsThemeDisplay = sdkThemeToSettingsThemeEvent(sdkThemeSelection);
  if (themeInput) themeInput.value = settingsThemeDisplay;

  if (enabledInput) enabledInput.checked = Boolean(settings.enabled);
  if (ruleInput) ruleInput.checked = Boolean(settings.autoSendRuleToAI);
  if (aiRollModeInput) aiRollModeInput.checked = Boolean(settings.enableAiRollMode);
  if (aiRoundControlInput) aiRoundControlInput.checked = Boolean(settings.enableAiRoundControl);
  if (dice3dEnabledInput) dice3dEnabledInput.checked = Boolean(settings.enable3DDiceBox);
  if (rerollEnabledInput) rerollEnabledInput.checked = Boolean(settings.enableRerollFeature);
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
  if (interactiveTriggersEnabledInput) {
    interactiveTriggersEnabledInput.checked = Boolean(settings.enableInteractiveTriggers);
  }
  if (blindRollEnabledInput) {
    blindRollEnabledInput.checked = Boolean(settings.enableBlindRoll);
  }
  if (defaultBlindSkillsInput) {
    defaultBlindSkillsInput.value = String(settings.defaultBlindSkillsText ?? "");
  }
  if (passiveCheckEnabledInput) {
    passiveCheckEnabledInput.checked = Boolean(settings.enablePassiveCheck);
  }
  if (passiveFormulaBaseInput) {
    passiveFormulaBaseInput.value = String(settings.passiveFormulaBase);
  }
  if (passiveAliasesInput) {
    passiveAliasesInput.value = String(settings.passiveSkillAliasesText ?? "");
  }
  if (narrativeCostEnabledInput) {
    narrativeCostEnabledInput.checked = Boolean(settings.enableNarrativeCostEnforcement);
  }
  if (worldbookPassiveTemplateInput && !worldbookPassiveTemplateInput.value.trim()) {
    worldbookPassiveTemplateInput.value = buildPassiveWorldbookTemplateEvent();
  }
  if (allowedDiceSidesInput) {
    const enabledSides = new Set(
      String(settings.aiAllowedDiceSidesText || "20")
        .split(/[,\s]+/)
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && Number.isInteger(value))
    );
    allowedDiceSidesInput
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((input) => {
        input.checked = enabledSides.has(Number(input.value));
      });
  }
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
  applySettingsThemeSelectionEvent({
    settingsRoot,
    skillModal,
    statusModal,
    selection: sdkThemeSelection,
    themeInput,
    themeInputValue: settingsThemeDisplay,
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
