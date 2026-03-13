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
  rollExpression as rollExpressionCoreEvent,
} from "../core/diceEngineEvent";
import {
  createIdEvent as createIdCoreEvent,
  escapeHtmlEvent as escapeHtmlCoreEvent,
  simpleHashEvent as simpleHashCoreEvent,
} from "../core/utilsEvent";
import {
  getDiceMeta as getDiceMetaStoreEvent,
  getDiceMetaEvent as getDiceMetaStoreMetaEvent,
  getSettingsEvent as getSettingsStoreEvent,
  loadChatScopedStateIntoRuntimeEvent as loadChatScopedStateIntoRuntimeStoreEvent,
  persistChatSafeEvent as persistChatSafeStoreEvent,
  resolveSkillModifierBySkillNameEvent as resolveSkillModifierBySkillNameStoreEvent,
  saveLastRoll as saveLastRollStoreEvent,
  saveMetadataSafeEvent as saveMetadataSafeStoreEvent,
} from "../settings/storeEvent";
import {
  bindEventButtonsEvent as bindEventButtonsModuleEvent,
  buildAssistantMessageIdEvent as buildAssistantMessageIdModuleEvent,
  clearDiceMetaEventState as clearDiceMetaEventStateModuleEvent,
  findLatestAssistantEvent as findLatestAssistantModuleEvent,
  handleGenerationEndedEvent as handleGenerationEndedModuleEvent,
  registerEventHooksEvent as registerEventHooksModuleEvent,
  sanitizeAssistantMessageEventBlocksEvent as sanitizeAssistantMessageEventBlocksModuleEvent,
  sanitizeCurrentChatEventBlocksEvent as sanitizeCurrentChatEventBlocksModuleEvent,
  startCountdownTickerEvent as startCountdownTickerModuleEvent,
} from "../events/hooksEvent";
import {
  extractPromptChatFromPayloadEvent as extractPromptChatFromPayloadModuleEvent,
  getMessageTextEvent as getMessageTextModuleEvent,
  getPreferredAssistantSourceTextEvent as getPreferredAssistantSourceTextModuleEvent,
  isAssistantMessageEvent as isAssistantMessageModuleEvent,
  setMessageTextEvent as setMessageTextModuleEvent,
} from "../events/promptEvent";
import { hideEventCodeBlocksInDomEvent as hideEventCodeBlocksInDomModuleEvent } from "../events/renderEvent";
import { registerEventRollCommandEvent as registerEventRollCommandModuleEvent } from "../commands/eventRollCommandEvent";
import { registerDebugCommandEvent as registerDebugCommandModuleEvent } from "../commands/debugCommandEvent";
import { autoRollEventsByAiModeEvent as autoRollEventsByAiModeModuleEvent, performEventRollByIdEvent as performEventRollByIdModuleEvent, applySkillModifierToDiceResultEvent as applySkillModifierToDiceResultModuleEvent } from "../events/roundEvent";
import type { DiceEventSpecEvent, PendingRoundEvent, TavernMessageEvent } from "../types/eventDomainEvent";
import type { RefreshAllWidgetsResultEvent } from "../events/anchorEvent";
import {
  filterEventsByApplyScopeEvent,
  getLatestRollRecordForEvent,
  handlePromptReadyEvent,
  mergeEventsIntoPendingRoundEvent,
  normalizeCompareOperatorEvent,
  parseEventEnvelopesEvent,
  removeRangesEvent,
  ensureRoundEventTimersSyncedEvent,
  recordTimeoutFailureIfNeededEvent,
  sweepTimeoutFailuresEvent,
} from "./eventRuntime.round";
import {
  buildEventListCardEvent,
  buildEventRollResultCardEvent,
  getEventRuntimeViewStateEvent,
  refreshCountdownDomEvent,
} from "./eventRuntime.render";

function findLatestAssistantEvent(chat: TavernMessageEvent[]): { msg: TavernMessageEvent; index: number } | null {
  return findLatestAssistantModuleEvent(chat, {
    isAssistantMessageEvent: isAssistantMessageModuleEvent,
  });
}

function buildAssistantMessageIdEvent(message: TavernMessageEvent, index: number): string {
  return buildAssistantMessageIdModuleEvent(message, index, {
    simpleHashEvent: simpleHashCoreEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
  });
}

function sanitizeAssistantMessageEventBlocksEvent(message: TavernMessageEvent): boolean {
  return sanitizeAssistantMessageEventBlocksModuleEvent(message, {
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
    removeRangesEvent,
    setMessageTextEvent: setMessageTextModuleEvent,
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
  return result.hasPendingRound && !result.pendingRoundMounted;
}

/**
 * 功能：在初始化完成后按状态恢复倒计时与事件卡片。
 * @param retry 当前重试次数。
 * @returns 无返回值。
 */
export function restoreRuntimeUiFromStateEvent(retry = 0): void {
  sanitizeCurrentChatEventBlocksEvent();
  sweepTimeoutFailuresEvent();
  refreshCountdownDomEvent();
  const refreshResult = refreshAllWidgetsFromStateWiredEvent();

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
  rollExpression: rollExpressionCoreEvent,
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

function performEventRollByIdEvent(eventIdRaw: string, overrideExpr?: string, expectedRoundId?: string): string {
  return performEventRollByIdModuleEvent(eventIdRaw, overrideExpr, expectedRoundId, {
    ...rollDepsEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    recordTimeoutFailureIfNeededEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    refreshCountdownDomEvent,
  });
}

function autoRollEventsByAiModeEvent(round: PendingRoundEvent): string[] {
  return autoRollEventsByAiModeModuleEvent(round, {
    ...rollDepsEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
  });
}

function handleGenerationEndedEvent(retry = 0): void {
  handleGenerationEndedModuleEvent(retry, {
    getSettingsEvent: getSettingsStoreEvent,
    getLiveContextEvent: getLiveContextCoreEvent,
    findLatestAssistantEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    buildAssistantMessageIdEvent,
    getPreferredAssistantSourceTextEvent: getPreferredAssistantSourceTextModuleEvent,
    getMessageTextEvent: getMessageTextModuleEvent,
    parseEventEnvelopesEvent,
    filterEventsByApplyScopeEvent,
    removeRangesEvent,
    setMessageTextEvent: setMessageTextModuleEvent,
    hideEventCodeBlocksInDomEvent: hideEventCodeBlocksInDomModuleEvent,
    persistChatSafeEvent: persistChatSafeStoreEvent,
    mergeEventsIntoPendingRoundEvent,
    autoRollEventsByAiModeEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

function clearDiceMetaEventState(reason = "chat_reset"): void {
  const normalizedReason = String(reason || "").toLowerCase();
  if (normalizedReason !== "chat_reset") {
    const meta = getDiceMetaStoreMetaEvent();
    delete meta.lastProcessedAssistantMsgId;
    return;
  }

  clearDiceMetaEventStateModuleEvent(reason, {
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

export function bindEventButtonsEvent(): void {
  bindEventButtonsModuleEvent({
    performEventRollByIdEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
  });
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
  registerEventHooksModuleEvent({
    getLiveContextEvent: getLiveContextCoreEvent,
    eventSource: getTavernEventSourceEvent() ?? undefined,
    event_types: getTavernEventTypesEvent() ?? undefined,
    extractPromptChatFromPayloadEvent: extractPromptChatFromPayloadModuleEvent,
    handlePromptReadyEvent,
    handleGenerationEndedEvent,
    clearDiceMetaEventState,
    sanitizeCurrentChatEventBlocksEvent,
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
    loadChatScopedStateIntoRuntimeEvent: loadChatScopedStateIntoRuntimeStoreEvent,
    refreshAllWidgetsFromStateEvent: refreshAllWidgetsFromStateWiredEvent,
  });
}

export function registerDebugCommandEvent(): void {
  const slashCommandRuntime = getTavernSlashCommandRuntimeEvent();
  registerDebugCommandModuleEvent({
    SlashCommandParser: slashCommandRuntime.parser,
    SlashCommand: slashCommandRuntime.command,
    getDiceMeta: getDiceMetaStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
    appendToConsoleEvent: appendToConsoleCoreEvent,
  });
}
