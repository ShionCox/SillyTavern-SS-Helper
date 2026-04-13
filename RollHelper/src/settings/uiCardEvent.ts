import changelogData from "../../changelog.json";
import type { SettingsCardTemplateIdsEvent } from "../templates/settingsCardTemplateTypes";
import { ensureSharedTooltip } from "../../../_Components/sharedTooltip";
import { buildChangelogHtml } from "../../../_Components/changelog";
import { hydrateSharedSelects } from "../../../_Components/sharedSelect";
import { hydrateSettingPage } from "../../../_Components/Setting";

import { ensureSdkThemeUiBindingEvent } from "./uiThemeEvent";

/**
 * 功能：为 RollHelper 设置区域应用共享 tooltip。
 * 返回：void。
 */
export function applySettingsTooltipsEvent(_root?: Element | null): void {
  ensureSharedTooltip();
}

function prepareMountedSettingsCardEvent(params: {
  root: HTMLElement;
  SETTINGS_CARD_ID_Event: string;
  SETTINGS_SKILL_MODAL_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  syncSettingsBadgeVersionEvent: () => void;
}): void {
  // Keep card hydration side effects in one place and stable order.
  applySettingsTooltipsEvent();
  hydrateSharedSelects(params.root);
  ensureSdkThemeUiBindingEvent(
    params.SETTINGS_CARD_ID_Event,
    params.SETTINGS_SKILL_MODAL_ID_Event,
    params.SETTINGS_STATUS_MODAL_ID_Event
  );
  params.syncSettingsBadgeVersionEvent();
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
  SETTINGS_TAB_AI_ID_Event: string;
  SETTINGS_TAB_SKILL_ID_Event: string;
  SETTINGS_TAB_RULE_ID_Event: string;
  SETTINGS_TAB_ABOUT_ID_Event: string;
  SETTINGS_PANEL_MAIN_ID_Event: string;
  SETTINGS_PANEL_AI_ID_Event: string;
  SETTINGS_PANEL_SKILL_ID_Event: string;
  SETTINGS_PANEL_RULE_ID_Event: string;
  SETTINGS_PANEL_ABOUT_ID_Event: string;
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
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event: string;
  SETTINGS_STATUS_MODAL_ID_Event: string;
  SETTINGS_STATUS_MODAL_CLOSE_ID_Event: string;
  SETTINGS_STATUS_REFRESH_ID_Event: string;
  SETTINGS_STATUS_CLEAN_UNUSED_ID_Event: string;
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
  SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event: string;
  SETTINGS_BLIND_ROLL_ENABLED_ID_Event: string;
  SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event: string;
  SETTINGS_MAX_BLIND_ROLLS_PER_ROUND_ID_Event: string;
  SETTINGS_MAX_QUEUED_BLIND_GUIDANCE_ID_Event: string;
  SETTINGS_BLIND_GUIDANCE_TTL_SECONDS_ID_Event: string;
  SETTINGS_BLIND_GUIDANCE_DEDUP_ID_Event: string;
  SETTINGS_BLIND_DEDUP_SCOPE_ID_Event: string;
  SETTINGS_BLIND_EVENT_CARD_VISIBILITY_MODE_ID_Event: string;
  SETTINGS_MAX_BLIND_GUIDANCE_INJECTED_PER_PROMPT_ID_Event: string;
  SETTINGS_ENABLE_BLIND_DEBUG_INFO_ID_Event: string;
  SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event: string;
  SETTINGS_PASSIVE_FORMULA_BASE_ID_Event: string;
  SETTINGS_PASSIVE_ALIASES_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event: string;
  SETTINGS_WORLDBOOK_PASSIVE_CREATE_ID_Event: string;
  SETTINGS_NARRATIVE_COST_ENABLED_ID_Event: string;
  SETTINGS_THEME_ID_Event: string;
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
  SETTINGS_SKILL_EDITOR_WRAP_ID_Event: string;
  SETTINGS_SKILL_COLS_ID_Event: string;
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
  SETTINGS_AI_BRIDGE_STATUS_LIGHT_ID_Event: string;
  SETTINGS_AI_BRIDGE_STATUS_TEXT_ID_Event: string;
  SETTINGS_AI_BRIDGE_REFRESH_ID_Event: string;
}

export function buildSettingsCardTemplateIdsEvent(
  deps: BuildSettingsCardTemplateIdsDepsEvent
): SettingsCardTemplateIdsEvent {
  const changelogHtml = buildChangelogHtml(
    changelogData as Array<{
      version?: string;
      date?: string;
      changes?: string[];
      sections?: Array<{ type: string; title?: string; items: string[] }>;
    }>,
    {
      emptyText: "暂无更新记录",
    }
  );
  /*

    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';
    return (changelogData as ChangelogItemEvent[]).map((log) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: bold; color: var(--ss-theme-accent-contrast, #fff); font-size: 13px;">${log.version}</span>
            ${log.date ? `<span style="font-size: 11px; opacity: 0.6;">${log.date}</span>` : ''}
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; opacity: 0.85;">
          ${log.changes.map((c: string) => `<li style="margin-bottom: 4px; line-height: 1.4;">${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  */
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
    qqGroupText: "862731343",
    githubText: deps.SETTINGS_GITHUB_TEXT_Event,
    githubUrl: deps.SETTINGS_GITHUB_URL_Event,
    changelogHtml,
    searchId: deps.SETTINGS_SEARCH_ID_Event,
    tabMainId: deps.SETTINGS_TAB_MAIN_ID_Event,
    tabAiId: deps.SETTINGS_TAB_AI_ID_Event,
    tabSkillId: deps.SETTINGS_TAB_SKILL_ID_Event,
    tabRuleId: deps.SETTINGS_TAB_RULE_ID_Event,
    tabAboutId: deps.SETTINGS_TAB_ABOUT_ID_Event,
    panelMainId: deps.SETTINGS_PANEL_MAIN_ID_Event,
    panelAiId: deps.SETTINGS_PANEL_AI_ID_Event,
    panelSkillId: deps.SETTINGS_PANEL_SKILL_ID_Event,
    panelRuleId: deps.SETTINGS_PANEL_RULE_ID_Event,
    panelAboutId: deps.SETTINGS_PANEL_ABOUT_ID_Event,
    enabledId: deps.SETTINGS_ENABLED_ID_Event,
    ruleId: deps.SETTINGS_RULE_ID_Event,
    aiRollModeId: deps.SETTINGS_AI_ROLL_MODE_ID_Event,
    aiRoundControlId: deps.SETTINGS_AI_ROUND_CONTROL_ID_Event,
    dice3dEnabledId: deps.SETTINGS_DICE_3D_ENABLED_ID_Event,
    rerollEnabledId: deps.SETTINGS_REROLL_ENABLED_ID_Event,
    explodingEnabledId: deps.SETTINGS_EXPLODING_ENABLED_ID_Event,
    advantageEnabledId: deps.SETTINGS_ADVANTAGE_ENABLED_ID_Event,
    dynamicResultGuidanceId: deps.SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event,
    dynamicDcReasonId: deps.SETTINGS_DYNAMIC_DC_REASON_ID_Event,
    statusSystemEnabledId: deps.SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event,
    statusEditorOpenId: deps.SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
    statusModalId: deps.SETTINGS_STATUS_MODAL_ID_Event,
    statusModalCloseId: deps.SETTINGS_STATUS_MODAL_CLOSE_ID_Event,
    statusRefreshId: deps.SETTINGS_STATUS_REFRESH_ID_Event,
    statusCleanUnusedId: deps.SETTINGS_STATUS_CLEAN_UNUSED_ID_Event,
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
    interactiveTriggersEnabledId: deps.SETTINGS_INTERACTIVE_TRIGGERS_ENABLED_ID_Event,
    blindRollEnabledId: deps.SETTINGS_BLIND_ROLL_ENABLED_ID_Event,
    defaultBlindSkillsId: deps.SETTINGS_DEFAULT_BLIND_SKILLS_ID_Event,
    maxBlindRollsPerRoundId: deps.SETTINGS_MAX_BLIND_ROLLS_PER_ROUND_ID_Event,
    maxQueuedBlindGuidanceId: deps.SETTINGS_MAX_QUEUED_BLIND_GUIDANCE_ID_Event,
    blindGuidanceTtlSecondsId: deps.SETTINGS_BLIND_GUIDANCE_TTL_SECONDS_ID_Event,
    blindGuidanceDedupId: deps.SETTINGS_BLIND_GUIDANCE_DEDUP_ID_Event,
    blindDedupScopeId: deps.SETTINGS_BLIND_DEDUP_SCOPE_ID_Event,
    blindEventCardVisibilityModeId: deps.SETTINGS_BLIND_EVENT_CARD_VISIBILITY_MODE_ID_Event,
    maxBlindGuidanceInjectedPerPromptId: deps.SETTINGS_MAX_BLIND_GUIDANCE_INJECTED_PER_PROMPT_ID_Event,
    enableBlindDebugInfoId: deps.SETTINGS_ENABLE_BLIND_DEBUG_INFO_ID_Event,
    passiveCheckEnabledId: deps.SETTINGS_PASSIVE_CHECK_ENABLED_ID_Event,
    passiveFormulaBaseId: deps.SETTINGS_PASSIVE_FORMULA_BASE_ID_Event,
    passiveAliasesId: deps.SETTINGS_PASSIVE_ALIASES_ID_Event,
    worldbookPassiveTemplateId: deps.SETTINGS_WORLDBOOK_PASSIVE_TEMPLATE_ID_Event,
    worldbookPassiveCreateId: deps.SETTINGS_WORLDBOOK_PASSIVE_CREATE_ID_Event,
    narrativeCostEnabledId: deps.SETTINGS_NARRATIVE_COST_ENABLED_ID_Event,
    themeId: deps.SETTINGS_THEME_ID_Event,
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
    skillColsId: deps.SETTINGS_SKILL_COLS_ID_Event,
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
    aiBridgeStatusLightId: deps.SETTINGS_AI_BRIDGE_STATUS_LIGHT_ID_Event,
    aiBridgeStatusTextId: deps.SETTINGS_AI_BRIDGE_STATUS_TEXT_ID_Event,
    aiBridgeRefreshId: deps.SETTINGS_AI_BRIDGE_REFRESH_ID_Event,
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
  const drawerToggleId = `${deps.SETTINGS_CARD_ID_Event}-toggle`;
  const drawerContentId = `${deps.SETTINGS_CARD_ID_Event}-content`;
  const drawerIconId = `${deps.SETTINGS_CARD_ID_Event}-icon`;
  const templateIds = deps.buildSettingsCardTemplateIdsEvent(
    drawerToggleId,
    drawerContentId,
    drawerIconId
  );
  const existedRoot = document.getElementById(deps.SETTINGS_CARD_ID_Event);
  if (existedRoot) {
    hydrateSettingPage(existedRoot);
    prepareMountedSettingsCardEvent({
      root: existedRoot,
      SETTINGS_CARD_ID_Event: deps.SETTINGS_CARD_ID_Event,
      SETTINGS_SKILL_MODAL_ID_Event: deps.SETTINGS_SKILL_MODAL_ID_Event,
      SETTINGS_STATUS_MODAL_ID_Event: deps.SETTINGS_STATUS_MODAL_ID_Event,
      syncSettingsBadgeVersionEvent: deps.syncSettingsBadgeVersionEvent,
    });
    deps.onMountedEvent({ drawerToggleId, drawerContentId });
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
  root.innerHTML = deps.buildSettingsCardHtmlTemplateEvent(templateIds);
  hydrateSettingPage(root);

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
  prepareMountedSettingsCardEvent({
    root,
    SETTINGS_CARD_ID_Event: deps.SETTINGS_CARD_ID_Event,
    SETTINGS_SKILL_MODAL_ID_Event: deps.SETTINGS_SKILL_MODAL_ID_Event,
    SETTINGS_STATUS_MODAL_ID_Event: deps.SETTINGS_STATUS_MODAL_ID_Event,
    syncSettingsBadgeVersionEvent: deps.syncSettingsBadgeVersionEvent,
  });
  deps.onMountedEvent({ drawerToggleId, drawerContentId });
  deps.syncSettingsUiEvent();
}
