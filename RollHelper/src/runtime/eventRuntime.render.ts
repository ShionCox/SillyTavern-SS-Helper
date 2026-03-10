/// <reference path="./global.d.ts" />
/**
 * 模块边界：负责事件卡片与倒计时视图相关的运行时组装与导出。
 * 不修改底层 render 模块行为，仅在此注入模板与状态依赖。
 */
import { parseDiceExpression as parseDiceExpressionCoreEvent } from "../core/diceEngineEvent";
import {
  escapeAttrEvent as escapeAttrCoreEvent,
  escapeHtmlEvent as escapeHtmlCoreEvent,
  formatEventModifierBreakdownEvent as formatEventModifierBreakdownCoreEvent,
  formatModifier as formatModifierCoreEvent,
} from "../core/utilsEvent";
import {
  buildAlreadyRolledDiceVisualTemplateEvent,
  buildDiceSvgTemplateEvent,
  buildResultMessageTemplateEvent,
  buildRollingSvgTemplateEvent,
} from "../templates/diceResultTemplates";
import {
  buildEventAlreadyRolledCardTemplateEvent,
  buildEventDistributionBlockTemplateEvent,
  buildEventListCardTemplateEvent,
  buildEventListItemTemplateEvent,
  buildEventRolledBlockTemplateEvent,
  buildEventRolledPrefixTemplateEvent,
  buildEventRollButtonTemplateEvent,
  buildEventRollResultCardTemplateEvent,
  buildEventTimeoutAtBlockTemplateEvent,
  buildRollsSummaryTemplateEvent,
} from "../templates/eventCardTemplates";
import { getSettingsEvent as getSettingsStoreEvent, getDiceMetaEvent as getDiceMetaStoreMetaEvent, resolveSkillModifierBySkillNameEvent as resolveSkillModifierBySkillNameStoreEvent } from "../settings/storeEvent";
import {
  buildEventAlreadyRolledCardEvent as buildEventAlreadyRolledCardModuleEvent,
  buildEventListCardEvent as buildEventListCardModuleEvent,
  buildEventRollResultCardEvent as buildEventRollResultCardModuleEvent,
  getEventRuntimeViewStateEvent as getEventRuntimeViewStateModuleEvent,
  getRuntimeToneStyleEvent as getRuntimeToneStyleModuleEvent,
  refreshCountdownDomEvent as refreshCountdownDomModuleEvent,
} from "../events/renderEvent";
import type { DiceEventSpecEvent, EventRollRecordEvent, PendingRoundEvent } from "../types/eventDomainEvent";
import type { EventRuntimeViewStateEvent } from "../events/renderEvent";
import {
  ensureRoundEventTimersSyncedEvent,
  formatRollRecordSummaryEvent,
  getLatestRollRecordForEvent,
  resolveTriggeredOutcomeEvent,
} from "./eventRuntime.round";

const cardRenderDepsEvent = {
  getSettingsEvent: getSettingsStoreEvent,
  getDiceMetaEvent: getDiceMetaStoreMetaEvent,
  ensureRoundEventTimersSyncedEvent,
  getLatestRollRecordForEvent,
  getEventRuntimeViewStateEvent,
  getRuntimeToneStyleEvent: getRuntimeToneStyleModuleEvent,
  buildEventRolledPrefixTemplateEvent,
  buildEventRolledBlockTemplateEvent,
  formatRollRecordSummaryEvent,
  parseDiceExpression: parseDiceExpressionCoreEvent,
  resolveSkillModifierBySkillNameEvent: resolveSkillModifierBySkillNameStoreEvent,
  formatEventModifierBreakdownEvent: formatEventModifierBreakdownCoreEvent,
  formatModifier: formatModifierCoreEvent,
  buildEventRollButtonTemplateEvent,
  buildEventListItemTemplateEvent,
  buildEventListCardTemplateEvent,
  escapeHtmlEvent: escapeHtmlCoreEvent,
  escapeAttrEvent: escapeAttrCoreEvent,
};

export function getEventRuntimeViewStateEvent(round: PendingRoundEvent, event: DiceEventSpecEvent, now = Date.now()): EventRuntimeViewStateEvent {
  return getEventRuntimeViewStateModuleEvent(
    round,
    event,
    {
      getSettingsEvent: getSettingsStoreEvent,
      getLatestRollRecordForEvent,
      ensureRoundEventTimersSyncedEvent,
    },
    now
  );
}

export function buildEventListCardEvent(round: PendingRoundEvent): string {
  return buildEventListCardModuleEvent(round, {
    ...cardRenderDepsEvent,
  });
}

export function buildEventRollResultCardEvent(event: DiceEventSpecEvent, record: EventRollRecordEvent): string {
  return buildEventRollResultCardModuleEvent(event, record, {
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    resolveTriggeredOutcomeEvent,
    formatEventModifierBreakdownEvent: formatEventModifierBreakdownCoreEvent,
    buildRollsSummaryTemplateEvent,
    formatModifier: formatModifierCoreEvent,
    buildEventRollResultCardTemplateEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
    escapeAttrEvent: escapeAttrCoreEvent,
    getDiceSvg: buildDiceSvgTemplateEvent,
    getRollingSvg: buildRollingSvgTemplateEvent,
    buildAlreadyRolledDiceVisualTemplateEvent,
  });
}

export function buildEventAlreadyRolledCardEvent(event: DiceEventSpecEvent, record: EventRollRecordEvent): string {
  return buildEventAlreadyRolledCardModuleEvent(event, record, {
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    resolveTriggeredOutcomeEvent,
    formatEventModifierBreakdownEvent: formatEventModifierBreakdownCoreEvent,
    buildEventDistributionBlockTemplateEvent,
    buildEventTimeoutAtBlockTemplateEvent,
    buildEventAlreadyRolledCardTemplateEvent,
    escapeHtmlEvent: escapeHtmlCoreEvent,
    escapeAttrEvent: escapeAttrCoreEvent,
    formatModifier: formatModifierCoreEvent,
    getDiceSvg: buildDiceSvgTemplateEvent,
    getRollingSvg: buildRollingSvgTemplateEvent,
    buildAlreadyRolledDiceVisualTemplateEvent,
  });
}

export function refreshCountdownDomEvent(): void {
  refreshCountdownDomModuleEvent({
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    ensureRoundEventTimersSyncedEvent,
    getEventRuntimeViewStateEvent,
    getRuntimeToneStyleEvent: getRuntimeToneStyleModuleEvent,
  });
}

export { buildResultMessageTemplateEvent };
