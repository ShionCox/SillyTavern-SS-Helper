/// <reference path="./global.d.ts" />
/**
 * 模块边界：负责事件生命周期 Hook、指令注册与交互入口组装。
 * 不修改底层 hooks/commands 模块行为，仅整合跨域依赖并导出稳定 API。
 */
import {
  ARGUMENT_TYPE,
  SlashCommand,
  SlashCommandArgument,
  SlashCommandParser,
  eventSource,
  event_types,
  getLiveContextEvent as getLiveContextCoreEvent,
} from "../core/runtimeContextEvent";
import { pushToChat as pushToChatCoreEvent } from "../core/chatEvent";
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
  buildEventAlreadyRolledCardEvent,
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
    buildEventAlreadyRolledCardEvent,
    pushToChat: pushToChatCoreEvent,
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
    buildEventListCardEvent,
    pushToChat: pushToChatCoreEvent,
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

function clearDiceMetaEventState(reason = "chat_reset"): void {
  clearDiceMetaEventStateModuleEvent(reason, {
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

export function bindEventButtonsEvent(): void {
  bindEventButtonsModuleEvent({
    performEventRollByIdEvent,
    pushToChat: pushToChatCoreEvent,
  });
}

export function registerEventRollCommandEvent(): void {
  registerEventRollCommandModuleEvent({
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    ARGUMENT_TYPE,
    pushToChat: pushToChatCoreEvent,
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
    eventSource,
    event_types,
    extractPromptChatFromPayloadEvent: extractPromptChatFromPayloadModuleEvent,
    handlePromptReadyEvent,
    handleGenerationEndedEvent,
    clearDiceMetaEventState,
    sanitizeCurrentChatEventBlocksEvent,
    sweepTimeoutFailuresEvent,
    refreshCountdownDomEvent,
  });
}

export function registerDebugCommandEvent(): void {
  registerDebugCommandModuleEvent({
    SlashCommandParser,
    SlashCommand,
    getDiceMeta: getDiceMetaStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
    pushToChat: pushToChatCoreEvent,
  });
}
