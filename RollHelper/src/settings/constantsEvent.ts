import manifestJson from "../../manifest.json";
import type { DicePluginSettingsEvent } from "../types/eventDomainEvent";

export const MODULE_NAME_Event = "SillyTavern-Roll";
export const SDK_SETTINGS_NAMESPACE_Event = "stx_rollhelper";
export const SETTINGS_CARD_ID_Event = "st-roll-settings-Event-card";
export const SETTINGS_STYLE_ID_Event = "st-roll-settings-Event-style";
export const SETTINGS_BADGE_ID_Event = "st-roll-settings-Event-badge";
export const SETTINGS_ENABLED_ID_Event = "st-roll-settings-Event-enabled";
export const SETTINGS_RULE_ID_Event = "st-roll-settings-Event-auto-rule";
export const SETTINGS_AI_ROLL_MODE_ID_Event = "st-roll-settings-Event-ai-roll-mode";
export const SETTINGS_AI_ROUND_CONTROL_ID_Event = "st-roll-settings-Event-ai-round-control";
export const SETTINGS_EXPLODING_ENABLED_ID_Event = "st-roll-settings-Event-exploding-enabled";
export const SETTINGS_ADVANTAGE_ENABLED_ID_Event = "st-roll-settings-Event-advantage-enabled";
export const SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event = "st-roll-settings-Event-dynamic-result-guidance";
export const SETTINGS_DYNAMIC_DC_REASON_ID_Event = "st-roll-settings-Event-dynamic-dc-reason";
export const SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event = "st-roll-settings-Event-status-system-enabled";
export const SETTINGS_STATUS_EDITOR_OPEN_ID_Event = "st-roll-settings-Event-status-editor-open";
export const SETTINGS_STATUS_MODAL_ID_Event = "st-roll-settings-Event-status-modal";
export const SETTINGS_STATUS_MODAL_CLOSE_ID_Event = "st-roll-settings-Event-status-modal-close";
export const SETTINGS_STATUS_REFRESH_ID_Event = "st-roll-settings-Event-status-refresh";
export const SETTINGS_STATUS_CLEAN_UNUSED_ID_Event = "st-roll-settings-Event-status-clean-unused";
export const SETTINGS_STATUS_ROWS_ID_Event = "st-roll-settings-Event-status-rows";
export const SETTINGS_STATUS_ADD_ID_Event = "st-roll-settings-Event-status-add";
export const SETTINGS_STATUS_SAVE_ID_Event = "st-roll-settings-Event-status-save";
export const SETTINGS_STATUS_RESET_ID_Event = "st-roll-settings-Event-status-reset";
export const SETTINGS_STATUS_ERRORS_ID_Event = "st-roll-settings-Event-status-errors";
export const SETTINGS_STATUS_DIRTY_HINT_ID_Event = "st-roll-settings-Event-status-dirty-hint";
export const SETTINGS_STATUS_LAYOUT_ID_Event = "st-roll-settings-Event-status-layout";
export const SETTINGS_STATUS_SIDEBAR_ID_Event = "st-roll-settings-Event-status-sidebar";
export const SETTINGS_STATUS_SPLITTER_ID_Event = "st-roll-settings-Event-status-splitter";
export const SETTINGS_STATUS_CHAT_LIST_ID_Event = "st-roll-settings-Event-status-chat-list";
export const SETTINGS_STATUS_CHAT_META_ID_Event = "st-roll-settings-Event-status-chat-meta";
export const SETTINGS_STATUS_COLS_ID_Event = "st-roll-settings-Event-status-cols";
export const SETTINGS_STATUS_MEMORY_STATE_ID_Event = "st-roll-settings-Event-status-memory-state";
export const SETTINGS_ALLOWED_DICE_SIDES_ID_Event = "st-roll-settings-Event-allowed-dice-sides";
export const SETTINGS_THEME_ID_Event = "st-roll-settings-Event-theme";
export const SETTINGS_SUMMARY_DETAIL_ID_Event = "st-roll-settings-Event-summary-detail";
export const SETTINGS_SUMMARY_ROUNDS_ID_Event = "st-roll-settings-Event-summary-rounds";
export const SETTINGS_SCOPE_ID_Event = "st-roll-settings-Event-apply-scope";
export const SETTINGS_OUTCOME_BRANCHES_ID_Event = "st-roll-settings-Event-outcome-branches";
export const SETTINGS_EXPLODE_OUTCOME_ID_Event = "st-roll-settings-Event-explode-outcome";
export const SETTINGS_SUMMARY_OUTCOME_ID_Event = "st-roll-settings-Event-summary-outcome";
export const SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event = "st-roll-settings-Event-list-outcome-preview";
export const SETTINGS_TIME_LIMIT_ENABLED_ID_Event = "st-roll-settings-Event-time-limit-enabled";
export const SETTINGS_TIME_LIMIT_MIN_ID_Event = "st-roll-settings-Event-time-limit-min-seconds";
export const SETTINGS_TIME_LIMIT_ROW_ID_Event = "st-roll-settings-Event-time-limit-row";
export const SETTINGS_SKILL_ENABLED_ID_Event = "st-roll-settings-Event-skill-enabled";
export const SETTINGS_SKILL_EDITOR_WRAP_ID_Event = "st-roll-settings-Event-skill-editor-wrap";
export const SETTINGS_SKILL_ROWS_ID_Event = "st-roll-settings-Event-skill-rows";
export const SETTINGS_SKILL_ADD_ID_Event = "st-roll-settings-Event-skill-add";
export const SETTINGS_SKILL_TEXT_ID_Event = "st-roll-settings-Event-skill-text";
export const SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event = "st-roll-settings-Event-skill-import-toggle";
export const SETTINGS_SKILL_IMPORT_AREA_ID_Event = "st-roll-settings-Event-skill-import-area";
export const SETTINGS_SKILL_IMPORT_APPLY_ID_Event = "st-roll-settings-Event-skill-import-apply";
export const SETTINGS_SKILL_EXPORT_ID_Event = "st-roll-settings-Event-skill-export";
export const SETTINGS_SKILL_SAVE_ID_Event = "st-roll-settings-Event-skill-save";
export const SETTINGS_SKILL_RESET_ID_Event = "st-roll-settings-Event-skill-reset";
export const SETTINGS_SKILL_ERRORS_ID_Event = "st-roll-settings-Event-skill-errors";
export const SETTINGS_SKILL_DIRTY_HINT_ID_Event = "st-roll-settings-Event-skill-dirty-hint";
export const SETTINGS_COMPATIBILITY_MODE_ID_Event = "st-roll-settings-Event-compatibility-mode";
export const SETTINGS_REMOVE_ROLLJSON_ID_Event = "st-roll-settings-Event-remove-rolljson";
export const SETTINGS_STRIP_INTERNAL_ID_Event = "st-roll-settings-Event-strip-internal";
export const SETTINGS_CLEAN_HISTORY_BTN_ID_Event = "st-roll-settings-Event-clean-history-btn";
export const SETTINGS_SKILL_PRESET_LAYOUT_ID_Event = "st-roll-settings-Event-skill-preset-layout";
export const SETTINGS_SKILL_PRESET_SIDEBAR_ID_Event = "st-roll-settings-Event-skill-preset-sidebar";
export const SETTINGS_SKILL_PRESET_LIST_ID_Event = "st-roll-settings-Event-skill-preset-list";
export const SETTINGS_SKILL_PRESET_CREATE_ID_Event = "st-roll-settings-Event-skill-preset-create";
export const SETTINGS_SKILL_PRESET_DELETE_ID_Event = "st-roll-settings-Event-skill-preset-delete";
export const SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event = "st-roll-settings-Event-skill-preset-restore-default";
export const SETTINGS_SKILL_PRESET_NAME_ID_Event = "st-roll-settings-Event-skill-preset-name";
export const SETTINGS_SKILL_PRESET_RENAME_ID_Event = "st-roll-settings-Event-skill-preset-rename";
export const SETTINGS_SKILL_PRESET_META_ID_Event = "st-roll-settings-Event-skill-preset-meta";
export const SETTINGS_SKILL_EDITOR_OPEN_ID_Event = "st-roll-settings-Event-skill-editor-open";
export const SETTINGS_SKILL_MODAL_ID_Event = "st-roll-settings-Event-skill-modal";
export const SETTINGS_SKILL_MODAL_CLOSE_ID_Event = "st-roll-settings-Event-skill-modal-close";
export const SETTINGS_RULE_TEXT_ID_Event = "st-roll-settings-Event-rule-text";
export const SETTINGS_RULE_SAVE_ID_Event = "st-roll-settings-Event-rule-save";
export const SETTINGS_RULE_RESET_ID_Event = "st-roll-settings-Event-rule-reset";
export const SETTINGS_SEARCH_ID_Event = "st-roll-settings-Event-search";
export const SETTINGS_TAB_MAIN_ID_Event = "st-roll-settings-Event-tab-main";
export const SETTINGS_TAB_SKILL_ID_Event = "st-roll-settings-Event-tab-skill";
export const SETTINGS_TAB_RULE_ID_Event = "st-roll-settings-Event-tab-rule";
export const SETTINGS_TAB_ABOUT_ID_Event = "st-roll-settings-Event-tab-about";
export const SETTINGS_PANEL_MAIN_ID_Event = "st-roll-settings-Event-panel-main";
export const SETTINGS_PANEL_SKILL_ID_Event = "st-roll-settings-Event-panel-skill";
export const SETTINGS_PANEL_RULE_ID_Event = "st-roll-settings-Event-panel-rule";
export const SETTINGS_PANEL_ABOUT_ID_Event = "st-roll-settings-Event-panel-about";

const manifestAny_Event = manifestJson as Record<string, any>;
export const SETTINGS_DISPLAY_NAME_Event =
  typeof manifestAny_Event.display_name === "string" && manifestAny_Event.display_name.trim().length > 0
    ? manifestAny_Event.display_name.trim()
    : "SillyTavern-Roll Event";
export const SETTINGS_BADGE_VERSION_Event =
  typeof manifestJson.version === "string" && manifestJson.version.trim().length > 0
    ? manifestJson.version.trim()
    : "unknown";
export const SETTINGS_AUTHOR_TEXT_Event =
  typeof manifestAny_Event.author === "string" && manifestAny_Event.author.trim().length > 0
    ? manifestAny_Event.author.trim()
    : "Shion";
export const SETTINGS_EMAIL_TEXT_Event =
  typeof manifestAny_Event.email === "string" && manifestAny_Event.email.trim().length > 0
    ? manifestAny_Event.email.trim()
    : "348591466@qq.com";
export const SETTINGS_GITHUB_URL_Event =
  typeof manifestAny_Event.homePage === "string" &&
    /^https?:\/\//i.test(manifestAny_Event.homePage.trim())
    ? manifestAny_Event.homePage.trim()
    : "https://github.com/ShionCox/SillyTavern-Roll";
export const SETTINGS_GITHUB_TEXT_Event = SETTINGS_GITHUB_URL_Event.replace(
  /^https?:\/\//i,
  ""
);
export const SETTINGS_TEMPLATE_STATIC_DEPS_Event = {
  SETTINGS_CARD_ID_Event,
  SETTINGS_DISPLAY_NAME_Event,
  SETTINGS_BADGE_ID_Event,
  SETTINGS_BADGE_VERSION_Event,
  SETTINGS_AUTHOR_TEXT_Event,
  SETTINGS_EMAIL_TEXT_Event,
  SETTINGS_GITHUB_TEXT_Event,
  SETTINGS_GITHUB_URL_Event,
  SETTINGS_SEARCH_ID_Event,
  SETTINGS_TAB_MAIN_ID_Event,
  SETTINGS_TAB_SKILL_ID_Event,
  SETTINGS_TAB_RULE_ID_Event,
  SETTINGS_TAB_ABOUT_ID_Event,
  SETTINGS_PANEL_MAIN_ID_Event,
  SETTINGS_PANEL_SKILL_ID_Event,
  SETTINGS_PANEL_RULE_ID_Event,
  SETTINGS_PANEL_ABOUT_ID_Event,
  SETTINGS_ENABLED_ID_Event,
  SETTINGS_RULE_ID_Event,
  SETTINGS_AI_ROLL_MODE_ID_Event,
  SETTINGS_AI_ROUND_CONTROL_ID_Event,
  SETTINGS_EXPLODING_ENABLED_ID_Event,
  SETTINGS_ADVANTAGE_ENABLED_ID_Event,
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event,
  SETTINGS_DYNAMIC_DC_REASON_ID_Event,
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event,
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
  SETTINGS_STATUS_MODAL_ID_Event,
  SETTINGS_STATUS_MODAL_CLOSE_ID_Event,
  SETTINGS_STATUS_REFRESH_ID_Event,
  SETTINGS_STATUS_CLEAN_UNUSED_ID_Event,
  SETTINGS_STATUS_ROWS_ID_Event,
  SETTINGS_STATUS_ADD_ID_Event,
  SETTINGS_STATUS_SAVE_ID_Event,
  SETTINGS_STATUS_RESET_ID_Event,
  SETTINGS_STATUS_ERRORS_ID_Event,
  SETTINGS_STATUS_DIRTY_HINT_ID_Event,
  SETTINGS_STATUS_LAYOUT_ID_Event,
  SETTINGS_STATUS_SIDEBAR_ID_Event,
  SETTINGS_STATUS_SPLITTER_ID_Event,
  SETTINGS_STATUS_CHAT_LIST_ID_Event,
  SETTINGS_STATUS_CHAT_META_ID_Event,
  SETTINGS_STATUS_COLS_ID_Event,
  SETTINGS_STATUS_MEMORY_STATE_ID_Event,
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event,
  SETTINGS_THEME_ID_Event,
  SETTINGS_SUMMARY_DETAIL_ID_Event,
  SETTINGS_SUMMARY_ROUNDS_ID_Event,
  SETTINGS_SCOPE_ID_Event,
  SETTINGS_OUTCOME_BRANCHES_ID_Event,
  SETTINGS_EXPLODE_OUTCOME_ID_Event,
  SETTINGS_SUMMARY_OUTCOME_ID_Event,
  SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event,
  SETTINGS_TIME_LIMIT_ENABLED_ID_Event,
  SETTINGS_TIME_LIMIT_MIN_ID_Event,
  SETTINGS_TIME_LIMIT_ROW_ID_Event,
  SETTINGS_COMPATIBILITY_MODE_ID_Event,
  SETTINGS_REMOVE_ROLLJSON_ID_Event,
  SETTINGS_STRIP_INTERNAL_ID_Event,
  SETTINGS_CLEAN_HISTORY_BTN_ID_Event,
  SETTINGS_SKILL_ENABLED_ID_Event,
  SETTINGS_SKILL_EDITOR_WRAP_ID_Event,
  SETTINGS_SKILL_ROWS_ID_Event,
  SETTINGS_SKILL_ADD_ID_Event,
  SETTINGS_SKILL_TEXT_ID_Event,
  SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event,
  SETTINGS_SKILL_IMPORT_AREA_ID_Event,
  SETTINGS_SKILL_IMPORT_APPLY_ID_Event,
  SETTINGS_SKILL_EXPORT_ID_Event,
  SETTINGS_SKILL_SAVE_ID_Event,
  SETTINGS_SKILL_RESET_ID_Event,
  SETTINGS_SKILL_ERRORS_ID_Event,
  SETTINGS_SKILL_DIRTY_HINT_ID_Event,
  SETTINGS_SKILL_PRESET_LAYOUT_ID_Event,
  SETTINGS_SKILL_PRESET_SIDEBAR_ID_Event,
  SETTINGS_SKILL_PRESET_LIST_ID_Event,
  SETTINGS_SKILL_PRESET_CREATE_ID_Event,
  SETTINGS_SKILL_PRESET_DELETE_ID_Event,
  SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event,
  SETTINGS_SKILL_PRESET_NAME_ID_Event,
  SETTINGS_SKILL_PRESET_RENAME_ID_Event,
  SETTINGS_SKILL_PRESET_META_ID_Event,
  SETTINGS_SKILL_EDITOR_OPEN_ID_Event,
  SETTINGS_SKILL_MODAL_ID_Event,
  SETTINGS_SKILL_MODAL_CLOSE_ID_Event,
  SETTINGS_RULE_SAVE_ID_Event,
  SETTINGS_RULE_RESET_ID_Event,
  SETTINGS_RULE_TEXT_ID_Event,
} as const;
export const SETTINGS_TABS_AND_MODAL_IDS_Event = {
  SETTINGS_TAB_MAIN_ID_Event,
  SETTINGS_TAB_SKILL_ID_Event,
  SETTINGS_TAB_RULE_ID_Event,
  SETTINGS_TAB_ABOUT_ID_Event,
  SETTINGS_PANEL_MAIN_ID_Event,
  SETTINGS_PANEL_SKILL_ID_Event,
  SETTINGS_PANEL_RULE_ID_Event,
  SETTINGS_PANEL_ABOUT_ID_Event,
  SETTINGS_SKILL_MODAL_ID_Event,
  SETTINGS_SKILL_EDITOR_OPEN_ID_Event,
  SETTINGS_SKILL_MODAL_CLOSE_ID_Event,
  SETTINGS_STATUS_MODAL_ID_Event,
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
  SETTINGS_STATUS_MODAL_CLOSE_ID_Event,
  SETTINGS_STATUS_REFRESH_ID_Event,
  SETTINGS_STATUS_CLEAN_UNUSED_ID_Event,
  SETTINGS_SEARCH_ID_Event,
} as const;
export const SETTINGS_BASIC_INPUT_IDS_Event = {
  SETTINGS_THEME_ID_Event,
  SETTINGS_ENABLED_ID_Event,
  SETTINGS_RULE_ID_Event,
  SETTINGS_AI_ROLL_MODE_ID_Event,
  SETTINGS_AI_ROUND_CONTROL_ID_Event,
  SETTINGS_EXPLODING_ENABLED_ID_Event,
  SETTINGS_ADVANTAGE_ENABLED_ID_Event,
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event,
  SETTINGS_DYNAMIC_DC_REASON_ID_Event,
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event,
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event,
  SETTINGS_SUMMARY_DETAIL_ID_Event,
  SETTINGS_SUMMARY_ROUNDS_ID_Event,
  SETTINGS_SCOPE_ID_Event,
  SETTINGS_OUTCOME_BRANCHES_ID_Event,
  SETTINGS_EXPLODE_OUTCOME_ID_Event,
  SETTINGS_SUMMARY_OUTCOME_ID_Event,
  SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event,
  SETTINGS_TIME_LIMIT_ENABLED_ID_Event,
  SETTINGS_TIME_LIMIT_MIN_ID_Event,
  SETTINGS_COMPATIBILITY_MODE_ID_Event,
  SETTINGS_REMOVE_ROLLJSON_ID_Event,
  SETTINGS_STRIP_INTERNAL_ID_Event,
  SETTINGS_CLEAN_HISTORY_BTN_ID_Event,
  SETTINGS_SKILL_ENABLED_ID_Event,
} as const;
export const SETTINGS_SKILL_PRESET_ACTION_IDS_Event = {
  SETTINGS_SKILL_PRESET_LIST_ID_Event,
  SETTINGS_SKILL_PRESET_CREATE_ID_Event,
  SETTINGS_SKILL_PRESET_DELETE_ID_Event,
  SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event,
  SETTINGS_SKILL_PRESET_NAME_ID_Event,
  SETTINGS_SKILL_PRESET_RENAME_ID_Event,
} as const;
export const SETTINGS_SKILL_ROWS_EDIT_IDS_Event = {
  SETTINGS_SKILL_ROWS_ID_Event,
  SETTINGS_SKILL_ADD_ID_Event,
} as const;
export const SETTINGS_SKILL_IMPORT_EXPORT_IDS_Event = {
  SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event,
  SETTINGS_SKILL_IMPORT_AREA_ID_Event,
  SETTINGS_SKILL_TEXT_ID_Event,
  SETTINGS_SKILL_IMPORT_APPLY_ID_Event,
  SETTINGS_SKILL_EXPORT_ID_Event,
  SETTINGS_SKILL_SAVE_ID_Event,
  SETTINGS_SKILL_RESET_ID_Event,
} as const;
export const SETTINGS_RULE_TEXT_ACTION_IDS_Event = {
  SETTINGS_RULE_TEXT_ID_Event,
  SETTINGS_RULE_SAVE_ID_Event,
  SETTINGS_RULE_RESET_ID_Event,
} as const;
export const SETTINGS_SYNC_UI_IDS_Event = {
  SETTINGS_CARD_ID_Event,
  SETTINGS_THEME_ID_Event,
  SETTINGS_ENABLED_ID_Event,
  SETTINGS_RULE_ID_Event,
  SETTINGS_AI_ROLL_MODE_ID_Event,
  SETTINGS_AI_ROUND_CONTROL_ID_Event,
  SETTINGS_EXPLODING_ENABLED_ID_Event,
  SETTINGS_ADVANTAGE_ENABLED_ID_Event,
  SETTINGS_DYNAMIC_RESULT_GUIDANCE_ID_Event,
  SETTINGS_DYNAMIC_DC_REASON_ID_Event,
  SETTINGS_STATUS_SYSTEM_ENABLED_ID_Event,
  SETTINGS_ALLOWED_DICE_SIDES_ID_Event,
  SETTINGS_SUMMARY_DETAIL_ID_Event,
  SETTINGS_SUMMARY_ROUNDS_ID_Event,
  SETTINGS_SCOPE_ID_Event,
  SETTINGS_OUTCOME_BRANCHES_ID_Event,
  SETTINGS_EXPLODE_OUTCOME_ID_Event,
  SETTINGS_SUMMARY_OUTCOME_ID_Event,
  SETTINGS_LIST_OUTCOME_PREVIEW_ID_Event,
  SETTINGS_TIME_LIMIT_ENABLED_ID_Event,
  SETTINGS_TIME_LIMIT_MIN_ID_Event,
  SETTINGS_TIME_LIMIT_ROW_ID_Event,
  SETTINGS_SKILL_ENABLED_ID_Event,
  SETTINGS_SKILL_MODAL_ID_Event,
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
  SETTINGS_STATUS_MODAL_ID_Event,
  SETTINGS_STATUS_ROWS_ID_Event,
  SETTINGS_STATUS_ERRORS_ID_Event,
  SETTINGS_STATUS_DIRTY_HINT_ID_Event,
  SETTINGS_RULE_TEXT_ID_Event,
  SETTINGS_SKILL_ROWS_ID_Event,
} as const;
export const DICE_RULE_BLOCK_START_Event = "<dice_rules>";
export const DICE_RULE_BLOCK_END_Event = "</dice_rules>";
export const DICE_SUMMARY_BLOCK_START_Event = "<dice_round_summary>";
export const DICE_SUMMARY_BLOCK_END_Event = "</dice_round_summary>";
export const DICE_RESULT_GUIDANCE_BLOCK_START_Event = "<dice_result_guidance>";
export const DICE_RESULT_GUIDANCE_BLOCK_END_Event = "</dice_result_guidance>";
export const DICE_RUNTIME_POLICY_BLOCK_START_Event = "<dice_runtime_policy>";
export const DICE_RUNTIME_POLICY_BLOCK_END_Event = "</dice_runtime_policy>";
export const DICE_ACTIVE_STATUSES_BLOCK_START_Event = "<dice_active_statuses>";
export const DICE_ACTIVE_STATUSES_BLOCK_END_Event = "</dice_active_statuses>";
export const SUMMARY_MAX_EVENTS_Event = 20;
export const SUMMARY_MAX_TOTAL_EVENT_LINES_Event = 60;
export const SUMMARY_HISTORY_ROUNDS_MIN_Event = 1;
export const SUMMARY_HISTORY_ROUNDS_MAX_Event = 10;
export const SUMMARY_HISTORY_MAX_STORED_Event = 20;
export const OUTCOME_TEXT_MAX_LEN_Event = 400;
export const SKILL_PRESET_STORE_VERSION_Event = 1 as const;
export const SKILL_PRESET_DEFAULT_ID_Event = "skill_preset_default_general_trpg";
export const SKILL_PRESET_DEFAULT_NAME_Event = "通用叙事TRPG（默认）";
export const SKILL_PRESET_MIGRATION_NAME_Event = "迁移技能预设";
export const SKILL_PRESET_NEW_NAME_BASE_Event = "新预设";
export const DEFAULT_SKILL_PRESET_TABLE_Event: Record<string, number> = {
  "察觉": 3,
  "说服": 2,
  "潜行": 1,
  "调查": 3,
  "交涉": 2,
  "意志": 1,
  "反应": 2,
  "体能": 1,
  "医疗": 3,
  "知识": 2,
};
export const DEFAULT_SKILL_PRESET_TABLE_TEXT_Event = JSON.stringify(DEFAULT_SKILL_PRESET_TABLE_Event, null, 2);
export const ISO_8601_DURATION_REGEX_Event =
  /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/i;
export const RULE_TEXT_MODE_VERSION_Event = 2;
export const DEFAULT_RULE_TEXT_Event = "";
export const DEFAULT_SETTINGS_Event: DicePluginSettingsEvent = {
  enabled: true,
  autoSendRuleToAI: true,
  enableAiRollMode: true,
  enableAiRoundControl: false,
  enableExplodingDice: true,
  enableAdvantageSystem: true,
  enableDynamicResultGuidance: false,
  enableDynamicDcReason: true,
  enableStatusSystem: true,
  aiAllowedDiceSidesText: "4,6,8,10,12,20,100",
  theme: "default",
  summaryDetailMode: "minimal",
  summaryHistoryRounds: 3,
  eventApplyScope: "protagonist_only",
  enableOutcomeBranches: true,
  enableExplodeOutcomeBranch: true,
  includeOutcomeInSummary: true,
  showOutcomePreviewInListCard: true,
  enableTimeLimit: true,
  minTimeLimitSeconds: 10,
  enableSkillSystem: true,
  skillTableText: "{}",
  skillPresetStoreText: "",
  ruleTextModeVersion: RULE_TEXT_MODE_VERSION_Event,
  ruleText: DEFAULT_RULE_TEXT_Event,
};

