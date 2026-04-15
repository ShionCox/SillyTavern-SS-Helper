/// <reference path="./global.d.ts" />
import { logger } from "../../index";
/**
 * 模块边界：负责事件生命周期 Hook、指令注册与交互入口组装。
 * 不修改底层 hooks/commands 模块行为，仅整合跨域依赖并导出稳定 API。
 */
import {
  getLiveContextEvent as getLiveContextCoreEvent,
} from "../core/runtimeContextEvent";
import {
  getTavernEventSourceEvent,
  getTavernEventTypesEvent,
  getTavernSlashCommandRuntimeEvent,
} from "../../../SDK/tavern";
import {
  refreshAllWidgetsFromStateEvent as refreshAllWidgetsFromStateModuleEvent,
} from "../events/anchorEvent";
import { appendToConsoleEvent as appendToConsoleCoreEvent } from "../Components/rollConsoleEvent";
import {
  evaluateSuccessEvent as evaluateSuccessCoreEvent,
  parseDiceExpression as parseDiceExpressionCoreEvent,
} from "../core/diceEngineEvent";
import { rollDiceWithEngineEvent as rollDiceWithEngineCoreEvent } from "../core/diceRollRuntimeEvent";
import {
  createIdEvent as createIdCoreEvent,
  escapeHtmlEvent as escapeHtmlCoreEvent,
  simpleHashEvent as simpleHashCoreEvent,
} from "../core/utilsEvent";
import {
  getActiveChatIdEvent as getActiveChatIdStoreEvent,
  getCurrentChatDataEvent as getCurrentChatDataStoreEvent,
  getDiceMetaEvent as getDiceMetaStoreMetaEvent,
  getSettingsEvent as getSettingsStoreEvent,
  getLastBaseRollEvent as getLastBaseRollStoreEvent,
  getLastBaseRollTotalEvent as getLastBaseRollTotalStoreEvent,
  loadCurrentChatDatabaseEvent as loadCurrentChatDatabaseStoreEvent,
  loadChatScopedStateIntoRuntimeEvent as loadChatScopedStateIntoRuntimeStoreEvent,
  removeAssistantFloorEvent as removeAssistantFloorStoreEvent,
  persistChatSafeEvent as persistChatSafeStoreEvent,
  resolveSkillModifierBySkillNameEvent as resolveSkillModifierBySkillNameStoreEvent,
  saveLastRoll as saveLastRollStoreEvent,
  saveMetadataSafeEvent as saveMetadataSafeStoreEvent,
  setLastUserMessageIdEvent as setLastUserMessageIdStoreEvent,
  upsertAssistantFloorEvent as upsertAssistantFloorStoreEvent,
} from "../settings/storeEvent";
import {
  bindInteractiveTriggerDomEventsEvent as bindInteractiveTriggerDomEventsModuleEvent,
  enhanceInteractiveTriggersInDomEvent as enhanceInteractiveTriggersInDomModuleEvent,
} from "../events/interactiveTriggersEvent";
import {
  bindEventButtonsEvent as bindEventButtonsModuleEvent,
  buildAssistantMessageIdEvent as buildAssistantMessageIdModuleEvent,
  clearDiceMetaEventState as clearDiceMetaEventStateModuleEvent,
  enhanceAssistantRawSourceButtonsEvent as enhanceAssistantRawSourceButtonsModuleEvent,
  registerEventHooksEvent as registerEventHooksModuleEvent,
  sanitizeAssistantMessageEventBlocksEvent as sanitizeAssistantMessageEventBlocksModuleEvent,
  sanitizeCurrentChatEventBlocksEvent as sanitizeCurrentChatEventBlocksModuleEvent,
  startCountdownTickerEvent as startCountdownTickerModuleEvent,
} from "../events/hooksEvent";
import {
  getAssistantOriginalSourceCandidateFromHostEvent as getAssistantOriginalSourceCandidateFromHostModuleEvent,
  extractPromptChatFromPayloadEvent as extractPromptChatFromPayloadModuleEvent,
  getMessageTextEvent as getMessageTextModuleEvent,
  getPreferredAssistantSourceTextEvent as getPreferredAssistantSourceTextModuleEvent,
  isAssistantMessageEvent as isAssistantMessageModuleEvent,
  setMessageTextEvent as setMessageTextModuleEvent,
} from "../events/promptEvent";
import { getStableAssistantOriginalSourceTextEvent as getStableAssistantOriginalSourceTextModuleEvent } from "../events/messageSanitizerEvent";
import { hideEventCodeBlocksInDomEvent as hideEventCodeBlocksInDomModuleEvent } from "../events/renderEvent";
import { registerEventRollCommandEvent as registerEventRollCommandModuleEvent } from "../commands/eventRollCommandEvent";
import { registerDebugCommandEvent as registerDebugCommandModuleEvent } from "../commands/debugCommandEvent";
import { registerAnimationDebugCommandEvent as registerAnimationDebugCommandModuleEvent } from "../commands/animationDebugCommandEvent";
import { autoRollEventsByAiModeEvent as autoRollEventsByAiModeModuleEvent, performBlindEventRollByIdEvent as performBlindEventRollByIdModuleEvent, performEventRollByIdEvent as performEventRollByIdModuleEvent, performInteractiveTriggerRollEvent as performInteractiveTriggerRollModuleEvent, rerollBlindEventByIdEvent as rerollBlindEventByIdModuleEvent, rerollEventByIdEvent as rerollEventByIdModuleEvent, applySkillModifierToDiceResultEvent as applySkillModifierToDiceResultModuleEvent } from "../events/roundEvent";
import { playRollAnimation as playRollAnimationCoreEvent, roll3DDice as roll3DDiceCoreEvent } from "../core/diceBox";
import type { DiceEventSpecEvent, PendingRoundEvent, TavernMessageEvent } from "../types/eventDomainEvent";
import type { RefreshAllWidgetsResultEvent } from "../events/anchorEvent";
import {
  buildAssistantFloorKeyEvent,
  filterEventsByApplyScopeEvent,
  getLatestRollRecordForEvent,
  handlePromptReadyEvent,
  invalidatePendingRoundFloorEvent,
  mergeEventsIntoPendingRoundEvent,
  normalizeCompareOperatorEvent,
  parseEventEnvelopesEvent,
  removeRangesEvent,
  ensureRoundEventTimersSyncedEvent,
  recordTimeoutFailureIfNeededEvent,
  sweepTimeoutFailuresEvent,
} from "./eventRuntime.round";
import { resetRecentParseFailureLogsEvent } from "../events/parserEvent";
import {
  buildEventListCardEvent,
  buildEventRollResultCardEvent,
  getEventRuntimeViewStateEvent,
  refreshCountdownDomEvent,
} from "./eventRuntime.render";

function getStableAssistantOriginalSourceTextWiredEvent(message: TavernMessageEvent | undefined): string {
  return getStableAssistantOriginalSourceTextModuleEvent(message, {
    getHostOriginalSourceTextEvent: getAssistantOriginalSourceCandidateFromHostModuleEvent,
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
  });
}

function buildAssistantMessageIdEvent(message: TavernMessageEvent, index: number): string {
  return buildAssistantMessageIdModuleEvent(message, index, {
    simpleHashEvent: simpleHashCoreEvent,
    getStableAssistantOriginalSourceTextEvent: getStableAssistantOriginalSourceTextWiredEvent,
    getHostOriginalSourceTextEvent: getAssistantOriginalSourceCandidateFromHostModuleEvent,
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
    removeRangesEvent,
  });
}

function sanitizeAssistantMessageEventBlocksEvent(message: TavernMessageEvent, index?: number): boolean {
  return sanitizeAssistantMessageEventBlocksModuleEvent(message, index, {
    getSettingsEvent: getSettingsStoreEvent,
    getHostOriginalSourceTextEvent: getAssistantOriginalSourceCandidateFromHostModuleEvent,
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
    removeRangesEvent,
    setMessageTextEvent: setMessageTextModuleEvent,
    resolveSourceMessageIdEvent: (targetMessage, targetIndex) => {
      if (Number.isFinite(targetIndex)) {
        return buildAssistantMessageIdEvent(targetMessage, Number(targetIndex));
      }
      const explicitId = String(targetMessage.id ?? targetMessage.cid ?? targetMessage.uid ?? "").trim();
      if (explicitId) return `assistant:${explicitId}`;
      return "";
    },
  });
}

export function sanitizeCurrentChatEventBlocksEvent(): void {
  sanitizeCurrentChatEventBlocksModuleEvent({
    getLiveContextEvent: getLiveContextCoreEvent,
    isAssistantMessageEvent: isAssistantMessageModuleEvent,
    sanitizeAssistantMessageEventBlocksEvent,
    persistChatSafeEvent: persistChatSafeStoreEvent,
    hideEventCodeBlocksInDomEvent: hideEventCodeBlocksInDomModuleEvent,
  });
}

function enhanceAssistantRawSourceButtonsEvent(): void {
  enhanceAssistantRawSourceButtonsModuleEvent({
    getLiveContextEvent: getLiveContextCoreEvent,
    getStableAssistantOriginalSourceTextEvent: getStableAssistantOriginalSourceTextWiredEvent,
    isAssistantMessageEvent: isAssistantMessageModuleEvent,
  });
}

const INITIAL_WIDGET_RESTORE_RETRY_MAX_Event = 12;
const INITIAL_WIDGET_RESTORE_RETRY_DELAY_MS_Event = 250;

/**
 * 功能：使用运行时依赖执行一次完整的事件卡片刷新。
 * @returns 本次卡片刷新结果。
 */
function refreshAllWidgetsFromStateWiredEvent(): RefreshAllWidgetsResultEvent {
  return refreshAllWidgetsFromStateModuleEvent({
    getLiveContextEvent: getLiveContextCoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    getCurrentChatDataEvent: getCurrentChatDataStoreEvent,
    buildEventListCardEvent,
    buildEventRollResultCardEvent,
    getLatestRollRecordForEvent,
  });
}

/**
 * 功能：判断初始化恢复阶段是否还需要继续重试挂载卡片。
 * @param result 最近一次卡片刷新结果。
 * @returns 需要继续重试时返回 `true`，否则返回 `false`。
 */
function shouldRetryInitialWidgetRestoreEvent(result: RefreshAllWidgetsResultEvent): boolean {
  return (
    (result.hasPendingRound && !result.pendingRoundMounted)
    || (result.hasHistoryWidgets && !result.historyWidgetsMounted)
  );
}

/**
 * 功能：在初始化完成后按状态恢复倒计时与事件卡片。
 * @param retry 当前重试次数。
 * @returns 无返回值。
 */
export function restoreRuntimeUiFromStateEvent(retry = 0): void {
  hideEventCodeBlocksInDomModuleEvent();
  sweepTimeoutFailuresEvent();
  refreshCountdownDomEvent();
  const refreshResult = refreshAllWidgetsFromStateWiredEvent();
  enhanceInteractiveTriggersInDomEvent();
  enhanceAssistantRawSourceButtonsEvent();

  if (!shouldRetryInitialWidgetRestoreEvent(refreshResult)) {
    return;
  }
  if (retry >= INITIAL_WIDGET_RESTORE_RETRY_MAX_Event) {
    logger.warn(`[卡片恢复] 初始化恢复重试耗尽 retry=${retry}`);
    return;
  }

  setTimeout(() => {
    restoreRuntimeUiFromStateEvent(retry + 1);
  }, INITIAL_WIDGET_RESTORE_RETRY_DELAY_MS_Event);
}

const rollDepsEvent = {
  getSettingsEvent: getSettingsStoreEvent,
  ensureRoundEventTimersSyncedEvent,
  getLatestRollRecordForEvent,
  rollDiceEvent: rollDiceWithEngineCoreEvent,
  parseDiceExpression: parseDiceExpressionCoreEvent,
  resolveSkillModifierBySkillNameEvent: resolveSkillModifierBySkillNameStoreEvent,
  applySkillModifierToDiceResultEvent: applySkillModifierToDiceResultModuleEvent,
  normalizeCompareOperatorEvent,
  evaluateSuccessEvent: evaluateSuccessCoreEvent,
  createIdEvent: createIdCoreEvent,
  buildEventRollResultCardEvent,
  saveLastRoll: saveLastRollStoreEvent,
  saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
};

/**
 * 功能：在运行时环境中执行一次事件手动掷骰。
 * @param eventIdRaw 事件 ID
 * @param overrideExpr 可选的覆盖骰式
 * @param expectedRoundId 期望轮次 ID
 * @returns 错误文本；成功时返回空字符串
 */
function performEventRollByIdEvent(eventIdRaw: string, overrideExpr?: string, expectedRoundId?: string): Promise<string> {
  return performEventRollByIdModuleEvent(eventIdRaw, overrideExpr, expectedRoundId, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

function performBlindEventRollByIdEvent(eventIdRaw: string, overrideExpr?: string, expectedRoundId?: string): Promise<string> {
  return performBlindEventRollByIdModuleEvent(eventIdRaw, overrideExpr, expectedRoundId, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

function performInteractiveTriggerRollEvent(trigger: Parameters<typeof performInteractiveTriggerRollModuleEvent>[0]) {
  return performInteractiveTriggerRollModuleEvent(trigger, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

/**
 * 功能：在运行时环境中对已结算事件执行重新投掷。
 * @param eventIdRaw 事件 ID
 * @param expectedRoundId 期望轮次 ID
 * @returns 错误文本；成功时返回空字符串
 */
function rerollEventByIdEvent(eventIdRaw: string, expectedRoundId?: string): Promise<string> {
  return rerollEventByIdModuleEvent(eventIdRaw, expectedRoundId, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

function rerollBlindEventByIdEvent(eventIdRaw: string, expectedRoundId?: string): Promise<string> {
  return rerollBlindEventByIdModuleEvent(eventIdRaw, expectedRoundId, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

function autoRollEventsByAiModeEvent(round: PendingRoundEvent): Promise<string[]> {
  return autoRollEventsByAiModeModuleEvent(round, {
    ...rollDepsEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
  });
}

function buildEventHooksDepsEvent() {
  return {
    getSettingsEvent: getSettingsStoreEvent,
    getLiveContextEvent: getLiveContextCoreEvent,
    eventSource: getTavernEventSourceEvent() ?? undefined,
    event_types: getTavernEventTypesEvent() ?? undefined,
    getActiveChatIdEvent: getActiveChatIdStoreEvent,
    getCurrentChatDataEvent: getCurrentChatDataStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    isAssistantMessageEvent: isAssistantMessageModuleEvent,
    buildAssistantMessageIdEvent,
    buildAssistantFloorKeyEvent,
    getStableAssistantOriginalSourceTextEvent: getStableAssistantOriginalSourceTextWiredEvent,
    getHostOriginalSourceTextEvent: getAssistantOriginalSourceCandidateFromHostModuleEvent,
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
    filterEventsByApplyScopeEvent,
    removeRangesEvent,
    setMessageTextEvent: setMessageTextModuleEvent,
    resetRecentParseFailureLogsEvent,
    extractPromptChatFromPayloadEvent: extractPromptChatFromPayloadModuleEvent,
    handlePromptReadyEvent,
    resetAssistantProcessedStateEvent,
    clearDiceMetaEventState,
    hideEventCodeBlocksInDomEvent: hideEventCodeBlocksInDomModuleEvent,
    persistChatSafeEvent: persistChatSafeStoreEvent,
    mergeEventsIntoPendingRoundEvent,
    invalidatePendingRoundFloorEvent,
    autoRollEventsByAiModeEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
    loadCurrentChatDatabaseEvent: loadCurrentChatDatabaseStoreEvent,
    loadChatScopedStateIntoRuntimeEvent: loadChatScopedStateIntoRuntimeStoreEvent,
    removeAssistantFloorEvent: removeAssistantFloorStoreEvent,
    enhanceInteractiveTriggersInDomEvent,
    enhanceAssistantRawSourceButtonsEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
    setLastUserMessageIdEvent: setLastUserMessageIdStoreEvent,
    upsertAssistantFloorEvent: upsertAssistantFloorStoreEvent,
  };
}

function clearDiceMetaEventState(reason = "chat_reset"): void {
  const normalizedReason = String(reason || "").toLowerCase();
  if (normalizedReason !== "chat_reset") {
    const meta = getDiceMetaStoreMetaEvent();
    delete meta.selectionFallbackState;
    return;
  }

  clearDiceMetaEventStateModuleEvent(reason, {
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

function resetAssistantProcessedStateEvent(): void {
  const chatData = getCurrentChatDataStoreEvent();
  if (chatData?.meta) {
    chatData.meta.lastProcessedFloorId = null;
  }
}

function enhanceInteractiveTriggersInDomEvent(): void {
  enhanceInteractiveTriggersInDomModuleEvent(getSettingsStoreEvent(), getLiveContextCoreEvent, getDiceMetaStoreMetaEvent);
}

export function bindEventButtonsEvent(): void {
  bindEventButtonsModuleEvent({
    performEventRollByIdEvent,
    performBlindEventRollByIdEvent,
    rerollEventByIdEvent,
    rerollBlindEventByIdEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    getCurrentChatDataEvent: getCurrentChatDataStoreEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
    loadChatScopedStateIntoRuntimeEvent: loadChatScopedStateIntoRuntimeStoreEvent,
    getLiveContextEvent: getLiveContextCoreEvent,
    buildAssistantMessageIdEvent,
  });
  bindInteractiveTriggerDomEventsModuleEvent({
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    getLiveContextEvent: getLiveContextCoreEvent,
    persistChatSafeEvent: persistChatSafeStoreEvent,
    refreshInteractiveTriggersInDomEvent: enhanceInteractiveTriggersInDomEvent,
    appendToConsoleEvent: appendToConsoleCoreEvent,
    performInteractiveTriggerRollEvent,
  });
  enhanceInteractiveTriggersInDomEvent();
  enhanceAssistantRawSourceButtonsEvent();
}

export function registerEventRollCommandEvent(): void {
  const slashCommandRuntime = getTavernSlashCommandRuntimeEvent();
  registerEventRollCommandModuleEvent({
    SlashCommandParser: slashCommandRuntime.parser,
    SlashCommand: slashCommandRuntime.command,
    SlashCommandArgument: slashCommandRuntime.argument,
    ARGUMENT_TYPE: slashCommandRuntime.argumentType,
    appendToConsoleEvent: appendToConsoleCoreEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    getSettingsEvent: getSettingsStoreEvent,
    ensureRoundEventTimersSyncedEvent,
    getEventRuntimeViewStateEvent,
    resolveSkillModifierBySkillNameEvent: resolveSkillModifierBySkillNameStoreEvent,
    performEventRollByIdEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
  });
}

export function startCountdownTickerEvent(): void {
  startCountdownTickerModuleEvent({
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
  });
}

export function registerEventHooksEvent(): void {
  registerEventHooksModuleEvent(buildEventHooksDepsEvent());
}

export function registerDebugCommandEvent(): void {
  const slashCommandRuntime = getTavernSlashCommandRuntimeEvent();
  registerDebugCommandModuleEvent({
    SlashCommandParser: slashCommandRuntime.parser,
    SlashCommand: slashCommandRuntime.command,
    getLastBaseRollEvent: getLastBaseRollStoreEvent,
    getLastBaseRollTotalEvent: getLastBaseRollTotalStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
    appendToConsoleEvent: appendToConsoleCoreEvent,
  });
}

export function registerAnimationDebugCommandEvent(): void {
  const slashCommandRuntime = getTavernSlashCommandRuntimeEvent();
  registerAnimationDebugCommandModuleEvent({
    SlashCommandParser: slashCommandRuntime.parser,
    SlashCommand: slashCommandRuntime.command,
    appendToConsoleEvent: appendToConsoleCoreEvent,
    roll3DDice: roll3DDiceCoreEvent,
    playRollAnimation: playRollAnimationCoreEvent,
  });
}
