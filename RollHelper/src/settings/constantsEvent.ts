import manifestJson from "../../manifest.json";
import type { DicePluginSettingsEvent } from "../types/eventDomainEvent";

export const MODULE_NAME_Event = "SillyTavern-Roll";
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
export const SETTINGS_STATUS_ROWS_ID_Event = "st-roll-settings-Event-status-rows";
export const SETTINGS_STATUS_ADD_ID_Event = "st-roll-settings-Event-status-add";
export const SETTINGS_STATUS_SAVE_ID_Event = "st-roll-settings-Event-status-save";
export const SETTINGS_STATUS_RESET_ID_Event = "st-roll-settings-Event-status-reset";
export const SETTINGS_STATUS_ERRORS_ID_Event = "st-roll-settings-Event-status-errors";
export const SETTINGS_STATUS_DIRTY_HINT_ID_Event = "st-roll-settings-Event-status-dirty-hint";
export const SETTINGS_ALLOWED_DICE_SIDES_ID_Event = "st-roll-settings-Event-allowed-dice-sides";
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
export const SETTINGS_SKILL_PRESET_LAYOUT_ID_Event = "st-roll-settings-Event-skill-preset-layout";
export const SETTINGS_SKILL_PRESET_SIDEBAR_ID_Event = "st-roll-settings-Event-skill-preset-sidebar";
export const SETTINGS_SKILL_PRESET_LIST_ID_Event = "st-roll-settings-Event-skill-preset-list";
export const SETTINGS_SKILL_PRESET_CREATE_ID_Event = "st-roll-settings-Event-skill-preset-create";
export const SETTINGS_SKILL_PRESET_DELETE_ID_Event = "st-roll-settings-Event-skill-preset-delete";
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
  SETTINGS_STATUS_ROWS_ID_Event,
  SETTINGS_STATUS_ADD_ID_Event,
  SETTINGS_STATUS_SAVE_ID_Event,
  SETTINGS_STATUS_RESET_ID_Event,
  SETTINGS_STATUS_ERRORS_ID_Event,
  SETTINGS_STATUS_DIRTY_HINT_ID_Event,
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
  SETTINGS_SEARCH_ID_Event,
} as const;
export const SETTINGS_BASIC_INPUT_IDS_Event = {
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
  SETTINGS_SKILL_ENABLED_ID_Event,
} as const;
export const SETTINGS_SKILL_PRESET_ACTION_IDS_Event = {
  SETTINGS_SKILL_PRESET_LIST_ID_Event,
  SETTINGS_SKILL_PRESET_CREATE_ID_Event,
  SETTINGS_SKILL_PRESET_DELETE_ID_Event,
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
  SETTINGS_STATUS_EDITOR_OPEN_ID_Event,
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
  "察觉": 10,
  "说服": 8,
  "潜行": 6,
  "调查": 9,
  "交涉": 7,
  "意志": 8,
  "反应": 6,
  "体能": 7,
  "医疗": 5,
  "知识": 8,
};
export const DEFAULT_SKILL_PRESET_TABLE_TEXT_Event = JSON.stringify(DEFAULT_SKILL_PRESET_TABLE_Event, null, 2);
export const ISO_8601_DURATION_REGEX_Event =
  /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/i;
export const DEFAULT_RULE_TEXT_Event = `【事件骰子协议】
1. 触发判定时，仅在回复末尾输出 \`\`\`rolljson 代码块（严禁 \`\`\`json）。
2. 叙事勿含判定结果；须严格结合以下上下文保证剧情一致：
   - <dice_runtime_policy>：遵循全局规则（面数、技能表、时间下限及 round_mode / ai_round_control_enabled 等）。
   - <dice_round_summary>：承接历史轮次结果，保持剧情连贯。
   - <dice_result_guidance>：执行叙事指令（如大成功表现、额外收益）。
   - <dice_active_statuses>：体现当前状态修饰对剧情的实质影响。
3. rolljson 结构严格如下：
{
  "type": "dice_events",
  "version": "1",
  "events": [{
    // --- 必填 ---
    "id": "str",
    "title": "str",
    "checkDice": "str", // NdM[!][khX|klX][+/-B]。面数限policy允许值。kh/kl覆盖advantage且禁与!同用。
    "dc": num,
    "skill": "str", // 限policy技能表
    "desc": "str",
    // --- 可选 ---
    "compare": "str", // >=, >, <=, < (默认>=)
    "scope": "str", // protagonist, character, all
    "rollMode": "str", // auto(系统自动/分支), manual(默认)
    "advantageState": "str", // normal, advantage, disadvantage
    "dc_reason": "str", // 难度来源
    "timeLimit": "str", // ISO 8601 (例:PT30S，须符policy最低限制)
    "target": { "type": "self|scene|supporting|object|other", "name": "str(可选)" },
    "outcomes": { 
      "success": "str", // 成功走向
      "failure": "str", // 失败/超时走向
      "explode": "str"  // 爆骰走向(优先)
      // 【状态标签】仅限写在outcomes文本内：
      // [APPLY_STATUS:名,值,skills=A|B] 或 scope=all (缺第3参数默认当前skill)
      // [REMOVE_STATUS:名] 或 [CLEAR_STATUS]
      // 值必须为整数（可正可负）；skills 必须用 | 分隔
      // 同名状态按名称覆盖（后者覆盖前者，不做叠加）
    }
  }],
  // --- 顶层可选 (仅当 policy 中 round_mode=continuous 且 ai_round_control_enabled=1 时可用) ---
  "round_control": "str", // continue / end_round
  "end_round": bool       // 兼容写法 (true 等价于 round_control=end_round)
}
4. 状态标签附加规则：
   - 仅当 <dice_runtime_policy> 中 status_system_enabled=1 时，才允许输出状态标签；否则必须不输出任何状态标签。
   - 采用 skills 范围时，skills 不可为空，且应使用当前技能表中的标准技能名。
   - 状态标签仅允许出现在 outcomes.success / outcomes.failure / outcomes.explode 文本中，禁止出现在普通叙事正文。`;
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
  ruleText: DEFAULT_RULE_TEXT_Event,
};

