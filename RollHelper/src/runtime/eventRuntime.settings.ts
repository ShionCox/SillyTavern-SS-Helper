/// <reference path="./global.d.ts" />
/**
 * 模块边界：负责设置面板与技能草稿编辑器相关的运行时组装与导出。
 * 不修改底层 settings/ui/skillEditor 模块行为，仅管理依赖注入与挂载顺序。
 */
import { buildSettingsCardHtmlTemplateEvent } from "../templates/settingsCardHtmlTemplate";
import { buildSettingsCardStylesTemplateEvent } from "../templates/settingsCardStylesTemplate";
import {
  DEFAULT_SETTINGS_Event,
  SETTINGS_BADGE_ID_Event,
  SETTINGS_BADGE_VERSION_Event,
  SETTINGS_BASIC_INPUT_IDS_Event,
  SETTINGS_CARD_ID_Event,
  SETTINGS_RULE_TEXT_ACTION_IDS_Event,
  SETTINGS_SKILL_DIRTY_HINT_ID_Event,
  SETTINGS_SKILL_ERRORS_ID_Event,
  SETTINGS_SKILL_IMPORT_EXPORT_IDS_Event,
  SETTINGS_SKILL_MODAL_ID_Event,
  SETTINGS_SKILL_COLS_ID_Event,
  SETTINGS_STATUS_ADD_ID_Event,
  SETTINGS_STATUS_CHAT_LIST_ID_Event,
  SETTINGS_STATUS_CHAT_META_ID_Event,
  SETTINGS_STATUS_CLEAN_UNUSED_ID_Event,
  SETTINGS_STATUS_COLS_ID_Event,
  SETTINGS_STATUS_DIRTY_HINT_ID_Event,
  SETTINGS_STATUS_ERRORS_ID_Event,
  SETTINGS_STATUS_MEMORY_STATE_ID_Event,
  SETTINGS_STATUS_MODAL_ID_Event,
  SETTINGS_STATUS_RESET_ID_Event,
  SETTINGS_STATUS_REFRESH_ID_Event,
  SETTINGS_STATUS_ROWS_ID_Event,
  SETTINGS_STATUS_SAVE_ID_Event,
  SETTINGS_STATUS_SPLITTER_ID_Event,
  SETTINGS_SKILL_PRESET_ACTION_IDS_Event,
  SETTINGS_SKILL_PRESET_DELETE_ID_Event,
  SETTINGS_SKILL_PRESET_LIST_ID_Event,
  SETTINGS_SKILL_PRESET_META_ID_Event,
  SETTINGS_SKILL_PRESET_NAME_ID_Event,
  SETTINGS_SKILL_ROWS_EDIT_IDS_Event,
  SETTINGS_SKILL_ROWS_ID_Event,
  SETTINGS_STYLE_ID_Event,
  SETTINGS_SYNC_UI_IDS_Event,
  SETTINGS_TABS_AND_MODAL_IDS_Event,
  SETTINGS_TEMPLATE_STATIC_DEPS_Event,
  SKILL_PRESET_DEFAULT_ID_Event,
  SKILL_PRESET_NEW_NAME_BASE_Event,
  SUMMARY_HISTORY_ROUNDS_MAX_Event,
  SUMMARY_HISTORY_ROUNDS_MIN_Event,
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
} from "../settings/constantsEvent";
import { getLiveContextEvent } from "../core/runtimeContextEvent";
import { getTavernSlashCommandRuntimeEvent, registerTavernMacroEvent } from "../../../SDK/tavern";
import { appendToConsoleEvent as appendToConsoleCoreEvent } from "../Components/rollConsoleEvent";
import {
  createIdEvent as createIdCoreEvent,
  escapeAttrEvent as escapeAttrCoreEvent,
  escapeHtmlEvent as escapeHtmlCoreEvent,
} from "../core/utilsEvent";
import { rollExpression as rollExpressionCoreEvent } from "../core/diceEngineEvent";
import {
  buildDefaultSkillPresetStoreEvent as buildDefaultSkillPresetStoreTemplateStoreEvent,
  buildSkillDraftSnapshotEvent as buildSkillDraftSnapshotStoreEvent,
  countSkillEntriesFromSkillTableTextEvent as countSkillEntriesFromSkillTableTextStoreEvent,
  createSkillEditorRowDraftEvent as createSkillEditorRowDraftStoreEvent,
  deserializeSkillTableTextToRowsEvent as deserializeSkillTableTextToRowsStoreEvent,
  ensureActiveStatusesEvent as ensureActiveStatusesStoreEvent,
  getActiveChatKeyEvent as getActiveChatKeyStoreEvent,
  getActiveSkillPresetEvent as getActiveSkillPresetStoreEvent,
  getDiceMeta as getDiceMetaStoreEvent,
  getDiceMetaEvent as getDiceMetaStoreMetaEvent,
  getSettingsEvent as getSettingsStoreEvent,
  getSkillPresetByIdEvent as getSkillPresetByIdStoreEvent,
  getSkillPresetStoreEvent as getSkillPresetStoreStoreEvent,
  getUniqueSkillPresetNameEvent as getUniqueSkillPresetNameStoreEvent,
  normalizeSkillPresetNameKeyEvent as normalizeSkillPresetNameKeyStoreEvent,
  normalizeSkillTableTextForSettingsEvent as normalizeSkillTableTextForSettingsStoreEvent,
  cleanupUnusedChatStatesForCurrentTavernEvent as cleanupUnusedChatStatesForCurrentTavernStoreEvent,
  listChatScopedStatusSummariesEvent as listChatScopedStatusSummariesStoreEvent,
  listHostChatsForCurrentScopeEvent as listHostChatsForCurrentScopeStoreEvent,
  loadStatusesForChatKeyEvent as loadStatusesForChatKeyStoreEvent,
  saveLastRoll as saveLastRollStoreEvent,
  saveStatusesForChatKeyEvent as saveStatusesForChatKeyStoreEvent,
  saveSkillPresetStoreEvent as saveSkillPresetStoreStoreEvent,
  setActiveStatusesEvent as setActiveStatusesStoreEvent,
  serializeSkillRowsToSkillTableTextEvent as serializeSkillRowsToSkillTableTextStoreEvent,
  setSyncSettingsUiCallbackEvent as setSyncSettingsUiCallbackStoreEvent,
  updateSettingsEvent as updateSettingsStoreEvent,
  validateSkillRowsEvent as validateSkillRowsStoreEvent,
} from "../settings/storeEvent";
import {
  bindMountedSettingsCardEvent as bindMountedSettingsCardModuleEvent,
  buildSettingsCardTemplateIdsEvent as buildSettingsCardTemplateIdsModuleEvent,
  copyTextToClipboardEvent as copyTextToClipboardModuleEvent,
  createSkillDraftAccessorEvent as createSkillDraftAccessorModuleEvent,
  ensureSettingsCardStylesEvent as ensureSettingsCardStylesModuleEvent,
  isElementVisibleEvent as isElementVisibleModuleEvent,
  mountSettingsCardShellEvent as mountSettingsCardShellModuleEvent,
  syncSettingsBadgeVersionEvent as syncSettingsBadgeVersionModuleEvent,
  syncSettingsUiEvent as syncSettingsUiModuleEvent,
} from "../settings/uiEvent";
import { createSkillEditorRuntimeEvent } from "../settings/skillEditorRuntimeEvent";
import { registerBaseMacrosAndCommandsEvent as registerBaseMacrosAndCommandsModuleEvent } from "../commands/baseRollCommandEvent";
import { buildResultMessageTemplateEvent } from "../templates/diceResultTemplates";
import {
  fetchMemoryChatKeysEvent as fetchMemoryChatKeysIntegrationEvent,
  probeMemoryPluginEvent as probeMemoryPluginIntegrationEvent,
  subscribeMemoryPluginStateEvent as subscribeMemoryPluginStateIntegrationEvent,
} from "../integration/stxMemoryBusEvent";
const skillEditorRuntimeEvent = createSkillEditorRuntimeEvent({
  SETTINGS_SKILL_DIRTY_HINT_ID_Event,
  SETTINGS_SKILL_ERRORS_ID_Event,
  SETTINGS_SKILL_COLS_ID_Event,
  SETTINGS_SKILL_ROWS_ID_Event,
  SETTINGS_SKILL_PRESET_LIST_ID_Event,
  SETTINGS_SKILL_PRESET_META_ID_Event,
  SETTINGS_SKILL_PRESET_NAME_ID_Event,
  SETTINGS_SKILL_PRESET_DELETE_ID_Event,
  getSettingsEvent: getSettingsStoreEvent,
  getSkillPresetStoreEvent: getSkillPresetStoreStoreEvent,
  getActiveSkillPresetEvent: getActiveSkillPresetStoreEvent,
  normalizeSkillTableTextForSettingsEvent: normalizeSkillTableTextForSettingsStoreEvent,
  deserializeSkillTableTextToRowsEvent: deserializeSkillTableTextToRowsStoreEvent,
  buildSkillDraftSnapshotEvent: buildSkillDraftSnapshotStoreEvent,
  countSkillEntriesFromSkillTableTextEvent: countSkillEntriesFromSkillTableTextStoreEvent,
  appendToConsoleEvent: appendToConsoleCoreEvent,
  escapeHtmlEvent: escapeHtmlCoreEvent,
  escapeAttrEvent: escapeAttrCoreEvent,
});

function buildSettingsCardTemplateIdsForMountEvent(drawerToggleId: string, drawerContentId: string, drawerIconId: string) {
  return buildSettingsCardTemplateIdsModuleEvent({
    ...SETTINGS_TEMPLATE_STATIC_DEPS_Event,
    drawerToggleId,
    drawerContentId,
    drawerIconId,
  });
}

const isSkillDraftDirtyEvent = skillEditorRuntimeEvent.isSkillDraftDirtyEvent;
const refreshSkillDraftDirtyStateEvent = skillEditorRuntimeEvent.refreshSkillDraftDirtyStateEvent;
const renderSkillRowsEvent = skillEditorRuntimeEvent.renderSkillRowsEvent;
const renderSkillValidationErrorsEvent = skillEditorRuntimeEvent.renderSkillValidationErrorsEvent;
const hydrateSkillDraftFromSettingsEvent = skillEditorRuntimeEvent.hydrateSkillDraftFromSettingsEvent;
const confirmDiscardSkillDraftEvent = skillEditorRuntimeEvent.confirmDiscardSkillDraftEvent;

const skillDraftAccessorEvent = createSkillDraftAccessorModuleEvent({
  getRowsEvent: skillEditorRuntimeEvent.getSkillRowsDraftEvent,
  setRowsEvent: skillEditorRuntimeEvent.setSkillRowsDraftEvent,
  getSnapshotEvent: skillEditorRuntimeEvent.getSkillEditorLastSavedSnapshotEvent,
  setSnapshotEvent: skillEditorRuntimeEvent.setSkillEditorLastSavedSnapshotEvent,
});

function bindSettingsCardMountedActionsEvent(drawerToggleId: string, drawerContentId: string): void {
  bindMountedSettingsCardModuleEvent({
    SETTINGS_CARD_ID_Event,
    drawerToggleId,
    drawerContentId,
    tabsAndModalDepsEvent: {
      ...SETTINGS_TABS_AND_MODAL_IDS_Event,
      confirmDiscardSkillDraftEvent,
      isElementVisibleEvent: isElementVisibleModuleEvent,
      isSkillDraftDirtyEvent,
    },
    basicSettingsInputsDepsEvent: {
      ...SETTINGS_BASIC_INPUT_IDS_Event,
      SUMMARY_HISTORY_ROUNDS_MAX_Event,
      SUMMARY_HISTORY_ROUNDS_MIN_Event,
      DEFAULT_SUMMARY_HISTORY_ROUNDS_Event: DEFAULT_SETTINGS_Event.summaryHistoryRounds,
      updateSettingsEvent: updateSettingsStoreEvent,
    },
    skillPresetActionsDepsEvent: {
      ...SETTINGS_SKILL_PRESET_ACTION_IDS_Event,
      SKILL_PRESET_DEFAULT_ID_Event,
      SKILL_PRESET_NEW_NAME_BASE_Event,
      DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
      getSkillEditorActivePresetIdEvent: skillEditorRuntimeEvent.getSkillEditorActivePresetIdEvent,
      confirmDiscardSkillDraftEvent,
      getSettingsEvent: getSettingsStoreEvent,
      getSkillPresetStoreEvent: getSkillPresetStoreStoreEvent,
      getSkillPresetByIdEvent: getSkillPresetByIdStoreEvent,
      saveSkillPresetStoreEvent: saveSkillPresetStoreStoreEvent,
      getActiveSkillPresetEvent: getActiveSkillPresetStoreEvent,
      getUniqueSkillPresetNameEvent: getUniqueSkillPresetNameStoreEvent,
      createIdEvent: createIdCoreEvent,
      buildDefaultSkillPresetStoreEvent: () => buildDefaultSkillPresetStoreTemplateStoreEvent(),
      normalizeSkillPresetNameKeyEvent: normalizeSkillPresetNameKeyStoreEvent,
      renderSkillValidationErrorsEvent,
      appendToConsoleEvent: appendToConsoleCoreEvent,
    },
    skillRowsEditingActionsDepsEvent: {
      ...SETTINGS_SKILL_ROWS_EDIT_IDS_Event,
      skillDraftAccessorEvent,
      createSkillEditorRowDraftEvent: createSkillEditorRowDraftStoreEvent,
      renderSkillRowsEvent,
      refreshSkillDraftDirtyStateEvent,
      renderSkillValidationErrorsEvent,
    },
    skillImportExportActionsDepsEvent: {
      ...SETTINGS_SKILL_IMPORT_EXPORT_IDS_Event,
      skillDraftAccessorEvent,
      serializeSkillRowsToSkillTableTextEvent: serializeSkillRowsToSkillTableTextStoreEvent,
      getSettingsEvent: getSettingsStoreEvent,
      getSkillPresetStoreEvent: getSkillPresetStoreStoreEvent,
      getActiveSkillPresetEvent: getActiveSkillPresetStoreEvent,
      normalizeSkillTableTextForSettingsEvent: normalizeSkillTableTextForSettingsStoreEvent,
      deserializeSkillTableTextToRowsEvent: deserializeSkillTableTextToRowsStoreEvent,
      validateSkillRowsEvent: validateSkillRowsStoreEvent,
      renderSkillRowsEvent,
      refreshSkillDraftDirtyStateEvent,
      renderSkillValidationErrorsEvent,
      copyTextToClipboardEvent: copyTextToClipboardModuleEvent,
      appendToConsoleEvent: appendToConsoleCoreEvent,
      buildSkillDraftSnapshotEvent: buildSkillDraftSnapshotStoreEvent,
      setSkillDraftDirtyEvent: skillEditorRuntimeEvent.setSkillDraftDirtyEvent,
      saveSkillPresetStoreEvent: saveSkillPresetStoreStoreEvent,
    },
    statusEditorActionsDepsEvent: {
      SETTINGS_STATUS_ROWS_ID_Event,
      SETTINGS_STATUS_ADD_ID_Event,
      SETTINGS_STATUS_SAVE_ID_Event,
      SETTINGS_STATUS_RESET_ID_Event,
      SETTINGS_STATUS_REFRESH_ID_Event,
      SETTINGS_STATUS_CLEAN_UNUSED_ID_Event,
      SETTINGS_STATUS_ERRORS_ID_Event,
      SETTINGS_STATUS_DIRTY_HINT_ID_Event,
      SETTINGS_STATUS_SPLITTER_ID_Event,
      SETTINGS_STATUS_COLS_ID_Event,
      SETTINGS_STATUS_CHAT_LIST_ID_Event,
      SETTINGS_STATUS_CHAT_META_ID_Event,
      SETTINGS_STATUS_MEMORY_STATE_ID_Event,
      getActiveStatusesEvent: () => ensureActiveStatusesStoreEvent(getDiceMetaStoreMetaEvent()),
      setActiveStatusesEvent: setActiveStatusesStoreEvent,
      getActiveChatKeyEvent: getActiveChatKeyStoreEvent,
      listHostChatsForCurrentScopeEvent: listHostChatsForCurrentScopeStoreEvent,
      listChatScopedStatusSummariesEvent: listChatScopedStatusSummariesStoreEvent,
      loadStatusesForChatKeyEvent: loadStatusesForChatKeyStoreEvent,
      saveStatusesForChatKeyEvent: saveStatusesForChatKeyStoreEvent,
      cleanupUnusedChatStatesForCurrentTavernEvent: cleanupUnusedChatStatesForCurrentTavernStoreEvent,
      probeMemoryPluginEvent: probeMemoryPluginIntegrationEvent,
      fetchMemoryChatKeysEvent: fetchMemoryChatKeysIntegrationEvent,
      subscribeMemoryPluginStateEvent: subscribeMemoryPluginStateIntegrationEvent,
      syncSettingsUiEvent,
      appendToConsoleEvent: appendToConsoleCoreEvent,
    },
    ruleTextActionsDepsEvent: {
      ...SETTINGS_RULE_TEXT_ACTION_IDS_Event,
      updateSettingsEvent: updateSettingsStoreEvent,
    },
  });
}

function syncSettingsUiEvent(): void {
  syncSettingsUiModuleEvent({
    getSettingsEvent: getSettingsStoreEvent,
    ...SETTINGS_SYNC_UI_IDS_Event,
    SETTINGS_COMPATIBILITY_MODE_ID_Event: SETTINGS_BASIC_INPUT_IDS_Event.SETTINGS_COMPATIBILITY_MODE_ID_Event,
    SETTINGS_REMOVE_ROLLJSON_ID_Event: SETTINGS_BASIC_INPUT_IDS_Event.SETTINGS_REMOVE_ROLLJSON_ID_Event,
    SETTINGS_STRIP_INTERNAL_ID_Event: SETTINGS_BASIC_INPUT_IDS_Event.SETTINGS_STRIP_INTERNAL_ID_Event,
    isSkillDraftDirtyEvent,
    hydrateSkillDraftFromSettingsEvent,
    getActiveStatusesEvent: () => ensureActiveStatusesStoreEvent(getDiceMetaStoreMetaEvent()),
    getActiveChatKeyEvent: getActiveChatKeyStoreEvent,
    getSkillEditorLastSettingsTextEvent: skillEditorRuntimeEvent.getSkillEditorLastSettingsTextEvent,
    getSkillEditorLastPresetStoreTextEvent: skillEditorRuntimeEvent.getSkillEditorLastPresetStoreTextEvent,
  });
}

export function mountSettingsCardEvent(attempt = 0): void {
  mountSettingsCardShellModuleEvent(
    {
      SETTINGS_CARD_ID_Event,
      SETTINGS_SKILL_MODAL_ID_Event,
      SETTINGS_STATUS_MODAL_ID_Event,
      buildSettingsCardHtmlTemplateEvent,
      buildSettingsCardTemplateIdsEvent: buildSettingsCardTemplateIdsForMountEvent,
      ensureSettingsCardStylesEvent: () => {
        ensureSettingsCardStylesModuleEvent({
          SETTINGS_STYLE_ID_Event,
          SETTINGS_CARD_ID_Event,
          buildSettingsCardStylesTemplateEvent,
        });
      },
      syncSettingsBadgeVersionEvent: () => {
        syncSettingsBadgeVersionModuleEvent({
          SETTINGS_BADGE_ID_Event,
          SETTINGS_BADGE_VERSION_Event,
        });
      },
      syncSettingsUiEvent,
      onMountedEvent: ({ drawerToggleId, drawerContentId }) => bindSettingsCardMountedActionsEvent(drawerToggleId, drawerContentId),
    },
    attempt
  );
}

export function registerBaseMacrosAndCommandsEvent(): void {
  const slashCommandRuntime = getTavernSlashCommandRuntimeEvent();
  registerBaseMacrosAndCommandsModuleEvent({
    registerMacro: registerTavernMacroEvent,
    SlashCommandParser: slashCommandRuntime.parser,
    SlashCommand: slashCommandRuntime.command,
    SlashCommandArgument: slashCommandRuntime.argument,
    ARGUMENT_TYPE: slashCommandRuntime.argumentType,
    getDiceMeta: getDiceMetaStoreEvent,
    rollExpression: rollExpressionCoreEvent,
    saveLastRoll: saveLastRollStoreEvent,
    buildResultMessage: buildResultMessageTemplateEvent,
    appendToConsoleEvent: appendToConsoleCoreEvent,
  });
}

export function initEventRuntimeSettingsEvent(): void {
  setSyncSettingsUiCallbackStoreEvent(() => {
    syncSettingsUiEvent();
  });
}
