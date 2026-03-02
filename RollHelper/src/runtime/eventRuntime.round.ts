/// <reference path="./global.d.ts" />
/**
 * 模块边界：负责事件回合、超时、摘要与提示词注入相关的运行时组装与导出。
 * 不修改底层 events/parser/round/summary/prompt 模块行为，仅注入依赖。
 */
import {
  DEFAULT_RULE_TEXT_Event,
  DICE_RULE_BLOCK_END_Event,
  DICE_RULE_BLOCK_START_Event,
  DICE_RESULT_GUIDANCE_BLOCK_END_Event,
  DICE_RESULT_GUIDANCE_BLOCK_START_Event,
  DICE_RUNTIME_POLICY_BLOCK_START_Event,
  DICE_RUNTIME_POLICY_BLOCK_END_Event,
  DICE_ACTIVE_STATUSES_BLOCK_START_Event,
  DICE_ACTIVE_STATUSES_BLOCK_END_Event,
  DICE_SUMMARY_BLOCK_END_Event,
  DICE_SUMMARY_BLOCK_START_Event,
  ISO_8601_DURATION_REGEX_Event,
  OUTCOME_TEXT_MAX_LEN_Event,
  SUMMARY_HISTORY_MAX_STORED_Event,
  SUMMARY_HISTORY_ROUNDS_MAX_Event,
  SUMMARY_HISTORY_ROUNDS_MIN_Event,
  SUMMARY_MAX_EVENTS_Event,
  SUMMARY_MAX_TOTAL_EVENT_LINES_Event,
} from "../settings/constantsEvent";
import {
  getDiceMetaEvent as getDiceMetaStoreMetaEvent,
  getSettingsEvent as getSettingsStoreEvent,
  resolveSkillModifierBySkillNameEvent as resolveSkillModifierBySkillNameStoreEvent,
  saveMetadataSafeEvent as saveMetadataSafeStoreEvent,
} from "../settings/storeEvent";
import {
  applyTimeLimitPolicyMsEvent as applyTimeLimitPolicyMsModuleEvent,
  filterEventsByApplyScopeEvent as filterEventsByApplyScopeModuleEvent,
  normalizeCompareOperatorEvent as normalizeCompareOperatorModuleEvent,
  parseEventEnvelopesEvent as parseEventEnvelopesModuleEvent,
  parseIsoDurationToMsEvent as parseIsoDurationToMsModuleEvent,
  removeRangesEvent as removeRangesModuleEvent,
  resolveEventTargetEvent as resolveEventTargetModuleEvent,
} from "../events/parserEvent";
import {
  buildSummaryBlockFromHistoryEvent as buildSummaryBlockFromHistoryModuleEvent,
  createRoundSummarySnapshotEvent as createRoundSummarySnapshotModuleEvent,
  ensureSummaryHistoryEvent as ensureSummaryHistoryModuleEvent,
  trimSummaryHistoryEvent as trimSummaryHistoryModuleEvent,
} from "../events/summaryEvent";
import {
  createTimeoutFailureRecordEvent as createTimeoutFailureRecordModuleEvent,
  createSyntheticTimeoutDiceResultEvent as createSyntheticTimeoutDiceResultModuleEvent,
  ensureRoundEventTimersSyncedEvent as ensureRoundEventTimersSyncedModuleEvent,
  formatRollRecordSummaryEvent as formatRollRecordSummaryModuleEvent,
  getLatestRollRecordForEvent as getLatestRollRecordForModuleEvent,
  mergeEventsIntoPendingRoundEvent as mergeEventsIntoPendingRoundModuleEvent,
  recordTimeoutFailureIfNeededEvent as recordTimeoutFailureIfNeededModuleEvent,
  resolveTriggeredOutcomeEvent as resolveTriggeredOutcomeModuleEvent,
  sweepTimeoutFailuresEvent as sweepTimeoutFailuresModuleEvent,
} from "../events/roundEvent";
import { handlePromptReadyEvent as handlePromptReadyModuleEvent } from "../events/promptEvent";
import {
  createIdEvent as createIdCoreEvent,
  formatEventModifierBreakdownEvent as formatEventModifierBreakdownCoreEvent,
  normalizeBlankLinesEvent as normalizeBlankLinesCoreEvent,
} from "../core/utilsEvent";
import { parseDiceExpression as parseDiceExpressionCoreEvent } from "../core/diceEngineEvent";
import type { DiceEventSpecEvent, EventRollRecordEvent, PendingRoundEvent, RoundSummarySnapshotEvent, SummaryDetailModeEvent } from "../types/eventDomainEvent";
import type { DiceResult } from "../types/diceEvent";

export type RemovalRangeEvent = { start: number; end: number };

export function parseIsoDurationToMsEvent(raw: string): number | null {
  return parseIsoDurationToMsModuleEvent(raw, ISO_8601_DURATION_REGEX_Event);
}

export function ensureRoundEventTimersSyncedEvent(round: PendingRoundEvent): void {
  ensureRoundEventTimersSyncedModuleEvent(round, {
    getSettingsEvent: getSettingsStoreEvent,
    resolveEventTargetEvent: resolveEventTargetModuleEvent,
    parseIsoDurationToMsEvent,
    applyTimeLimitPolicyMsEvent: applyTimeLimitPolicyMsModuleEvent,
  });
}

export function parseEventEnvelopesEvent(text: string): {
  events: DiceEventSpecEvent[];
  ranges: RemovalRangeEvent[];
  shouldEndRound: boolean;
} {
  return parseEventEnvelopesModuleEvent(text, {
    getSettingsEvent: getSettingsStoreEvent,
    OUTCOME_TEXT_MAX_LEN_Event,
    ISO_8601_DURATION_REGEX_Event,
  });
}

export function removeRangesEvent(text: string, ranges: RemovalRangeEvent[]): string {
  return removeRangesModuleEvent(text, ranges, normalizeBlankLinesCoreEvent);
}

export function createSyntheticTimeoutDiceResultEvent(event: DiceEventSpecEvent): DiceResult {
  return createSyntheticTimeoutDiceResultModuleEvent(event, {
    parseDiceExpression: parseDiceExpressionCoreEvent,
  });
}

export function createTimeoutFailureRecordEvent(
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  now: number
): EventRollRecordEvent {
  return createTimeoutFailureRecordModuleEvent(round, event, now, {
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    normalizeCompareOperatorEvent: normalizeCompareOperatorModuleEvent,
    createSyntheticTimeoutDiceResultEvent,
    resolveSkillModifierBySkillNameEvent: resolveSkillModifierBySkillNameStoreEvent,
    createIdEvent: createIdCoreEvent,
  });
}

export function recordTimeoutFailureIfNeededEvent(
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  now = Date.now()
): EventRollRecordEvent | null {
  return recordTimeoutFailureIfNeededModuleEvent(
    round,
    event,
    {
      getSettingsEvent: getSettingsStoreEvent,
      getLatestRollRecordForEvent: getLatestRollRecordForModuleEvent,
      ensureRoundEventTimersSyncedEvent,
      createTimeoutFailureRecordEvent,
    },
    now
  );
}

export function sweepTimeoutFailuresEvent(): boolean {
  return sweepTimeoutFailuresModuleEvent({
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    ensureRoundEventTimersSyncedEvent,
    recordTimeoutFailureIfNeededEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

export function mergeEventsIntoPendingRoundEvent(events: DiceEventSpecEvent[], assistantMsgId: string): PendingRoundEvent {
  return mergeEventsIntoPendingRoundModuleEvent(events, assistantMsgId, {
    getSettingsEvent: getSettingsStoreEvent,
    getDiceMetaEvent: getDiceMetaStoreMetaEvent,
    createIdEvent: createIdCoreEvent,
    parseIsoDurationToMsEvent,
    applyTimeLimitPolicyMsEvent: applyTimeLimitPolicyMsModuleEvent,
    resolveEventTargetEvent: resolveEventTargetModuleEvent,
    saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
  });
}

export function formatRollRecordSummaryEvent(record: EventRollRecordEvent, event?: DiceEventSpecEvent): string {
  return formatRollRecordSummaryModuleEvent(record, event, {
    getSettingsEvent: getSettingsStoreEvent,
    resolveTriggeredOutcomeEvent: resolveTriggeredOutcomeModuleEvent,
    formatEventModifierBreakdownEvent: formatEventModifierBreakdownCoreEvent,
  });
}

export function createRoundSummarySnapshotEvent(round: PendingRoundEvent, now = Date.now()): RoundSummarySnapshotEvent {
  return createRoundSummarySnapshotModuleEvent(
    round,
    {
      ensureRoundEventTimersSyncedEvent,
      getSettingsEvent: getSettingsStoreEvent,
      getLatestRollRecordForEvent: getLatestRollRecordForModuleEvent,
      resolveTriggeredOutcomeEvent: resolveTriggeredOutcomeModuleEvent,
      normalizeCompareOperatorEvent: normalizeCompareOperatorModuleEvent,
    },
    now
  );
}

export function buildSummaryBlockFromHistoryEvent(
  history: RoundSummarySnapshotEvent[],
  detailMode: SummaryDetailModeEvent,
  lastNRounds: number,
  includeOutcomeInSummary: boolean
): string {
  return buildSummaryBlockFromHistoryModuleEvent(history, detailMode, lastNRounds, includeOutcomeInSummary, {
    SUMMARY_HISTORY_ROUNDS_MAX_Event,
    SUMMARY_HISTORY_ROUNDS_MIN_Event,
    SUMMARY_MAX_EVENTS_Event,
    SUMMARY_MAX_TOTAL_EVENT_LINES_Event,
    DICE_SUMMARY_BLOCK_START_Event,
    DICE_SUMMARY_BLOCK_END_Event,
  });
}

export function trimSummaryHistoryEvent(history: RoundSummarySnapshotEvent[]): void {
  trimSummaryHistoryModuleEvent(history, SUMMARY_HISTORY_MAX_STORED_Event);
}

export function handlePromptReadyEvent(payload: any, sourceEvent = "unknown"): void {
  handlePromptReadyModuleEvent(
    payload,
    {
      getSettingsEvent: getSettingsStoreEvent,
      DEFAULT_RULE_TEXT_Event,
      DICE_RULE_BLOCK_START_Event,
      DICE_RULE_BLOCK_END_Event,
      DICE_SUMMARY_BLOCK_START_Event,
      DICE_SUMMARY_BLOCK_END_Event,
      DICE_RESULT_GUIDANCE_BLOCK_START_Event,
      DICE_RESULT_GUIDANCE_BLOCK_END_Event,
      DICE_RUNTIME_POLICY_BLOCK_START_Event,
      DICE_RUNTIME_POLICY_BLOCK_END_Event,
      DICE_ACTIVE_STATUSES_BLOCK_START_Event,
      DICE_ACTIVE_STATUSES_BLOCK_END_Event,
      sweepTimeoutFailuresEvent,
      getDiceMetaEvent: getDiceMetaStoreMetaEvent,
      ensureSummaryHistoryEvent: ensureSummaryHistoryModuleEvent,
      createRoundSummarySnapshotEvent,
      trimSummaryHistoryEvent,
      buildSummaryBlockFromHistoryEvent,
      saveMetadataSafeEvent: saveMetadataSafeStoreEvent,
    },
    sourceEvent
  );
}

export { filterEventsByApplyScopeModuleEvent as filterEventsByApplyScopeEvent, normalizeCompareOperatorModuleEvent as normalizeCompareOperatorEvent, resolveTriggeredOutcomeModuleEvent as resolveTriggeredOutcomeEvent, getLatestRollRecordForModuleEvent as getLatestRollRecordForEvent };
