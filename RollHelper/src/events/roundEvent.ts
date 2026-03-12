import type { DiceOptions, DiceResult } from "../types/diceEvent";
import type {
  AdvantageStateEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventOutcomeKindEvent,
  EventResultGradeEvent,
  EventRollRecordEvent,
  EventRollModeEvent,
  EventTimerStateEvent,
  PendingResultGuidanceEvent,
  PendingRoundEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import {
  applyStatusCommandsToMetaEvent,
  ensureActiveStatusesEvent,
  extractStatusCommandsAndCleanTextEvent,
  resolveStatusModifiersForSkillEvent,
  stripStatusTagsFromTextEvent,
} from "./statusEvent";

const ADVANTAGE_NORMAL_Event: AdvantageStateEvent = "normal";
const AI_AUTO_EXPLODE_EVENT_LIMIT_PER_ROUND_Event = 1;

type ParseDiceExpressionFnEvent = (exprRaw: string) => {
  count: number;
  sides: number;
  modifier: number;
  explode: boolean;
  keepMode?: "kh" | "kl";
  keepCount?: number;
};

function normalizeAdvantageStateOrNormalEvent(raw: any): AdvantageStateEvent {
  if (raw === "advantage" || raw === "disadvantage" || raw === "normal") return raw;
  return ADVANTAGE_NORMAL_Event;
}

function getScoringRollsFromResultEvent(result: DiceResult): number[] {
  if (Array.isArray(result.keptRolls) && result.keptRolls.length > 0) return result.keptRolls;
  return Array.isArray(result.rolls) ? result.rolls : [];
}

function deriveAdvantageStateFromExpressionEvent(
  parsed: ReturnType<ParseDiceExpressionFnEvent>
): AdvantageStateEvent {
  if (parsed.keepMode === "kh") return "advantage";
  if (parsed.keepMode === "kl") return "disadvantage";
  return ADVANTAGE_NORMAL_Event;
}

function resolveRollExecutionOptionsEvent(
  expr: string,
  event: DiceEventSpecEvent,
  settings: DicePluginSettingsEvent,
  parseDiceExpression: ParseDiceExpressionFnEvent
): { adv: boolean; dis: boolean; advantageStateApplied: AdvantageStateEvent; errorText?: string } {
  let parsed: ReturnType<ParseDiceExpressionFnEvent>;
  try {
    parsed = parseDiceExpression(expr);
  } catch (error: any) {
    return {
      adv: false,
      dis: false,
      advantageStateApplied: ADVANTAGE_NORMAL_Event,
      errorText: error?.message ?? String(error),
    };
  }

  const expressionState = deriveAdvantageStateFromExpressionEvent(parsed);
  const eventState = normalizeAdvantageStateOrNormalEvent(event.advantageState);
  const usesKeepSelector = parsed.keepMode === "kh" || parsed.keepMode === "kl";

  if (!settings.enableAdvantageSystem) {
    if (usesKeepSelector) {
      return {
        adv: false,
        dis: false,
        advantageStateApplied: ADVANTAGE_NORMAL_Event,
        errorText: `优势/劣势系统已关闭，当前表达式包含 kh/kl：${expr}`,
      };
    }
    if (eventState !== ADVANTAGE_NORMAL_Event) {
      return {
        adv: false,
        dis: false,
        advantageStateApplied: ADVANTAGE_NORMAL_Event,
        errorText: `优势/劣势系统已关闭，事件设置了 advantageState=${eventState}`,
      };
    }
    return { adv: false, dis: false, advantageStateApplied: ADVANTAGE_NORMAL_Event };
  }

  if (usesKeepSelector) {
    return { adv: false, dis: false, advantageStateApplied: expressionState };
  }
  if (eventState === "advantage") {
    return { adv: true, dis: false, advantageStateApplied: "advantage" };
  }
  if (eventState === "disadvantage") {
    return { adv: false, dis: true, advantageStateApplied: "disadvantage" };
  }
  return { adv: false, dis: false, advantageStateApplied: ADVANTAGE_NORMAL_Event };
}

function computeMarginToDcEvent(
  total: number,
  compare: CompareOperatorEvent,
  dc: number | null
): number | null {
  if (dc == null || !Number.isFinite(dc) || !Number.isFinite(total)) return null;
  switch (compare) {
    case ">=":
      return total - dc;
    case ">":
      return total - (dc + 1);
    case "<=":
      return dc - total;
    case "<":
      return dc - 1 - total;
    default:
      return null;
  }
}

function detectSingleKeptDieExtremumEvent(result: DiceResult): { isCandidate: boolean } {
  const scoringRolls = getScoringRollsFromResultEvent(result);
  if (scoringRolls.length !== 1) return { isCandidate: false };
  const value = Number(scoringRolls[0]);
  const sides = Number(result.sides);
  if (!Number.isFinite(value) || !Number.isFinite(sides) || sides <= 0) return { isCandidate: false };
  return { isCandidate: value === 1 || value === sides };
}

function evaluateResultGradeEvent(
  result: DiceResult,
  success: boolean | null,
  compareUsed: CompareOperatorEvent,
  dcUsed: number | null,
  source: EventRollRecordEvent["source"]
): { resultGrade: EventResultGradeEvent; marginToDc: number | null } {
  const marginToDc = computeMarginToDcEvent(Number(result.total), compareUsed, dcUsed);
  if (source === "timeout_auto_fail") return { resultGrade: "failure", marginToDc };
  if (success !== true && success !== false) return { resultGrade: "failure", marginToDc };

  if (detectSingleKeptDieExtremumEvent(result).isCandidate) {
    return success
      ? { resultGrade: "critical_success", marginToDc }
      : { resultGrade: "critical_failure", marginToDc };
  }
  if (success) {
    if (marginToDc != null && marginToDc >= 1 && marginToDc <= 2) {
      return { resultGrade: "partial_success", marginToDc };
    }
    return { resultGrade: "success", marginToDc };
  }
  return { resultGrade: "failure", marginToDc };
}

function ensurePendingResultGuidanceQueueEvent(meta: DiceMetaEvent): PendingResultGuidanceEvent[] {
  if (!Array.isArray(meta.pendingResultGuidanceQueue)) {
    meta.pendingResultGuidanceQueue = [];
  }
  return meta.pendingResultGuidanceQueue;
}

function enqueueResultGuidanceFromRecordEvent(
  meta: DiceMetaEvent,
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent
): void {
  if (!record.resultGrade) return;
  const queue = ensurePendingResultGuidanceQueueEvent(meta);
  if (queue.some((item) => item.rollId === record.rollId)) return;
  queue.push({
    rollId: record.rollId,
    roundId: record.roundId,
    eventId: event.id,
    eventTitle: event.title,
    targetLabel: record.targetLabelUsed || event.targetLabel,
    resultGrade: record.resultGrade,
    marginToDc: record.marginToDc ?? null,
    total: Number(record.result.total) || 0,
    dcUsed: record.dcUsed ?? null,
    compareUsed: record.compareUsed,
    advantageStateApplied: record.advantageStateApplied,
    source: record.source,
    rolledAt: record.rolledAt,
  });
}

export interface CreateSyntheticTimeoutDiceResultDepsEvent {
  parseDiceExpression: ParseDiceExpressionFnEvent;
}

export function createSyntheticTimeoutDiceResultEvent(
  event: DiceEventSpecEvent,
  deps: CreateSyntheticTimeoutDiceResultDepsEvent
): DiceResult {
  let count = 0;
  let sides = 0;
  let modifier = 0;
  try {
    const parsed = deps.parseDiceExpression(event.checkDice);
    count = parsed.count;
    sides = parsed.sides;
    modifier = parsed.modifier;
  } catch {
    // noop
  }
  return {
    expr: event.checkDice || "timeout",
    count,
    sides,
    modifier,
    rolls: [],
    rawTotal: 0,
    total: 0,
    selectionMode: "none",
  };
}

export function applySkillModifierToDiceResultEvent(
  result: DiceResult,
  skillModifier: number
): { result: DiceResult; baseModifierUsed: number; finalModifierUsed: number } {
  const baseModifierUsed = Number.isFinite(Number(result.modifier)) ? Number(result.modifier) : 0;
  const numericSkillModifier = Number.isFinite(Number(skillModifier)) ? Number(skillModifier) : 0;
  const finalModifierUsed = baseModifierUsed + numericSkillModifier;
  if (numericSkillModifier === 0) {
    return { result, baseModifierUsed, finalModifierUsed };
  }
  return {
    result: { ...result, modifier: finalModifierUsed, total: Number(result.rawTotal) + finalModifierUsed },
    baseModifierUsed,
    finalModifierUsed,
  };
}

export function applyStatusModifierToDiceResultEvent(
  result: DiceResult,
  statusModifier: number
): { result: DiceResult; finalModifierUsed: number } {
  const baseModifierUsed = Number.isFinite(Number(result.modifier)) ? Number(result.modifier) : 0;
  const numericStatusModifier = Number.isFinite(Number(statusModifier)) ? Number(statusModifier) : 0;
  const finalModifierUsed = baseModifierUsed + numericStatusModifier;
  if (numericStatusModifier === 0) {
    return { result, finalModifierUsed };
  }
  return {
    result: { ...result, modifier: finalModifierUsed, total: Number(result.rawTotal) + finalModifierUsed },
    finalModifierUsed,
  };
}

function resolveStatusModifierBySkillNameForRollEvent(
  skillName: string,
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent
): { modifier: number; matched: Array<{ name: string; modifier: number }> } {
  if (!settings.enableStatusSystem) {
    return { modifier: 0, matched: [] };
  }
  const statuses = ensureActiveStatusesEvent(meta);
  return resolveStatusModifiersForSkillEvent(statuses, skillName);
}

function resolveRawOutcomeTextEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent | null | undefined,
  settings: DicePluginSettingsEvent
): string {
  if (!settings.enableOutcomeBranches) return "";
  const outcomes = event.outcomes;
  const explosionTriggered = Boolean(record?.result?.explosionTriggered);
  if (
    settings.enableExplodeOutcomeBranch &&
    explosionTriggered &&
    outcomes?.explode &&
    outcomes.explode.trim()
  ) {
    return outcomes.explode.trim();
  }
  if (record?.success === true) {
    return outcomes?.success?.trim() || "判定成功，剧情向有利方向推进。";
  }
  if (record?.success === false || record?.source === "timeout_auto_fail") {
    return outcomes?.failure?.trim() || "判定失败，剧情向不利方向推进。";
  }
  return "尚未结算。";
}

function applyOutcomeStatusEffectsFromRecordEvent(
  meta: DiceMetaEvent,
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent,
  settings: DicePluginSettingsEvent
): boolean {
  if (!settings.enableStatusSystem) return false;
  const rawOutcomeText = resolveRawOutcomeTextEvent(event, record, settings);
  if (!rawOutcomeText) return false;
  const resolved = extractStatusCommandsAndCleanTextEvent(rawOutcomeText, event.skill || "");
  return applyStatusCommandsToMetaEvent(meta, resolved.commands, "ai_tag");
}

export function ensureEventTimerIndexEvent(round: PendingRoundEvent): Record<string, EventTimerStateEvent> {
  if (!round.eventTimers || typeof round.eventTimers !== "object") {
    round.eventTimers = {};
  }
  return round.eventTimers;
}

export function getLatestRollRecordForEvent(round: PendingRoundEvent, eventId: string): EventRollRecordEvent | null {
  for (let i = round.rolls.length - 1; i >= 0; i--) {
    if (round.rolls[i]?.eventId === eventId) return round.rolls[i];
  }
  return null;
}

export interface EnsureRoundEventTimersSyncedDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  resolveEventTargetEvent: (
    raw: any,
    scope?: DiceEventSpecEvent["scope"]
  ) => { targetType: DiceEventSpecEvent["targetType"]; targetName?: string; targetLabel: string };
  parseIsoDurationToMsEvent: (raw: string) => number | null;
  applyTimeLimitPolicyMsEvent: (durationMs: number | null, settings: DicePluginSettingsEvent) => number | null;
}

export function ensureRoundEventTimersSyncedEvent(
  round: PendingRoundEvent,
  deps: EnsureRoundEventTimersSyncedDepsEvent
): void {
  const settings = deps.getSettingsEvent();
  const timers = ensureEventTimerIndexEvent(round);
  const now = Date.now();
  const keepIds = new Set<string>();

  for (const event of round.events) {
    keepIds.add(event.id);
    if (!event.targetType || !event.targetLabel) {
      const resolvedTarget = deps.resolveEventTargetEvent(
        { type: (event as any).targetType, name: (event as any).targetName },
        event.scope
      );
      event.targetType = resolvedTarget.targetType;
      event.targetName = resolvedTarget.targetName;
      event.targetLabel = resolvedTarget.targetLabel;
    }
    const parsedDurationMs =
      typeof event.timeLimitMs === "number" && Number.isFinite(event.timeLimitMs)
        ? Math.max(0, event.timeLimitMs)
        : deps.parseIsoDurationToMsEvent(event.timeLimit || "");
    const durationMs = deps.applyTimeLimitPolicyMsEvent(parsedDurationMs, settings);
    event.timeLimitMs = durationMs;

    let timer = timers[event.id];
    const existingRecord = getLatestRollRecordForEvent(round, event.id);
    if (!timer) {
      const offeredAt =
        typeof event.offeredAt === "number" && Number.isFinite(event.offeredAt) ? event.offeredAt : now;
      const deadlineAt = durationMs == null ? null : offeredAt + durationMs;
      timer = { offeredAt, deadlineAt };
      timers[event.id] = timer;
    }

    if (!existingRecord) {
      timer.deadlineAt = durationMs == null ? null : timer.offeredAt + durationMs;
      if (timer.deadlineAt == null) delete timer.expiredAt;
    } else if (existingRecord.source === "timeout_auto_fail") {
      timer.expiredAt = existingRecord.timeoutAt ?? existingRecord.rolledAt;
    }

    event.offeredAt = timer.offeredAt;
    event.deadlineAt = timer.deadlineAt;
  }

  for (const key of Object.keys(timers)) {
    if (!keepIds.has(key)) delete timers[key];
  }
}

function normalizeRemainingRoundsForDecayEvent(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const numeric = Math.floor(Number(raw));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function decayStatusesForNewRoundEvent(meta: DiceMetaEvent): boolean {
  const statuses = ensureActiveStatusesEvent(meta);
  if (statuses.length <= 0) return false;
  const now = Date.now();
  const next = statuses
    .map((status) => {
      const remaining = normalizeRemainingRoundsForDecayEvent(status.remainingRounds);
      if (remaining == null) return { ...status, remainingRounds: null };
      const after = remaining - 1;
      if (after <= 0) return null;
      return { ...status, remainingRounds: after, updatedAt: now };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);
  if (next.length === statuses.length && next.every((item, index) => item.remainingRounds === statuses[index].remainingRounds)) {
    return false;
  }
  meta.activeStatuses = next;
  return true;
}
export interface EnsureOpenPendingRoundDepsEvent {
  createIdEvent: (prefix: string) => string;
  now?: () => number;
}

export function ensureOpenPendingRoundEvent(meta: DiceMetaEvent, deps: EnsureOpenPendingRoundDepsEvent): PendingRoundEvent {
  const status = (meta.pendingRound as any)?.status;
  const currentNow = deps.now ? deps.now() : Date.now();
  if (!meta.pendingRound || status !== "open") {
    meta.pendingRound = {
      roundId: deps.createIdEvent("round"),
      status: "open",
      events: [],
      rolls: [],
      eventTimers: {},
      sourceAssistantMsgIds: [],
      openedAt: currentNow,
    };
  }
  if (!meta.pendingRound.eventTimers || typeof meta.pendingRound.eventTimers !== "object") {
    meta.pendingRound.eventTimers = {};
  }
  return meta.pendingRound;
}

export interface MergeEventsIntoPendingRoundDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  createIdEvent: (prefix: string) => string;
  parseIsoDurationToMsEvent: (raw: string) => number | null;
  applyTimeLimitPolicyMsEvent: (durationMs: number | null, settings: DicePluginSettingsEvent) => number | null;
  resolveEventTargetEvent: (
    raw: any,
    scope?: DiceEventSpecEvent["scope"]
  ) => { targetType: DiceEventSpecEvent["targetType"]; targetName?: string; targetLabel: string };
  saveMetadataSafeEvent: () => void;
}

export function mergeEventsIntoPendingRoundEvent(
  events: DiceEventSpecEvent[],
  assistantMsgId: string,
  deps: MergeEventsIntoPendingRoundDepsEvent
): PendingRoundEvent {
  const settings = deps.getSettingsEvent();
  const meta = deps.getDiceMetaEvent();
  const previousRound = meta.pendingRound;
  if (previousRound && previousRound.status !== "open") {
    if (decayStatusesForNewRoundEvent(meta)) {
      logger.info("轮次切换：已完成状态持续轮次衰减");
    }
  }
  const round = ensureOpenPendingRoundEvent(meta, { createIdEvent: deps.createIdEvent });
  const now = Date.now();
  const timers = ensureEventTimerIndexEvent(round);
  const merged = new Map<string, DiceEventSpecEvent>();
  for (const event of round.events) merged.set(event.id, { ...event });

  for (const incomingRaw of events) {
    const incoming = { ...incomingRaw };
    const previous = merged.get(incoming.id);
    const existingRecord = getLatestRollRecordForEvent(round, incoming.id);
    const next: DiceEventSpecEvent = { ...(previous || {}), ...incoming };

    if (!existingRecord) {
      const parsedDurationMs =
        typeof next.timeLimitMs === "number" && Number.isFinite(next.timeLimitMs)
          ? Math.max(0, next.timeLimitMs)
          : deps.parseIsoDurationToMsEvent(next.timeLimit || "");
      const durationMs = deps.applyTimeLimitPolicyMsEvent(parsedDurationMs, settings);
      next.timeLimitMs = durationMs;
      next.offeredAt = now;
      next.deadlineAt = durationMs == null ? null : now + durationMs;
      timers[next.id] = { offeredAt: next.offeredAt, deadlineAt: next.deadlineAt };
    } else {
      const timer = timers[next.id];
      if (timer) {
        next.offeredAt = timer.offeredAt;
        next.deadlineAt = timer.deadlineAt;
      } else if (previous) {
        next.offeredAt = previous.offeredAt;
        next.deadlineAt = previous.deadlineAt ?? null;
      }
    }

    const resolvedTarget = deps.resolveEventTargetEvent(
      { type: (next as any).targetType, name: (next as any).targetName },
      next.scope
    );
    next.targetType = resolvedTarget.targetType;
    next.targetName = resolvedTarget.targetName;
    next.targetLabel = resolvedTarget.targetLabel;
    merged.set(next.id, next);
  }

  round.events = Array.from(merged.values());
  ensureRoundEventTimersSyncedEvent(round, {
    getSettingsEvent: deps.getSettingsEvent,
    resolveEventTargetEvent: deps.resolveEventTargetEvent,
    parseIsoDurationToMsEvent: deps.parseIsoDurationToMsEvent,
    applyTimeLimitPolicyMsEvent: deps.applyTimeLimitPolicyMsEvent,
  });
  if (!round.sourceAssistantMsgIds.includes(assistantMsgId)) round.sourceAssistantMsgIds.push(assistantMsgId);
  deps.saveMetadataSafeEvent();
  return round;
}

export function resolveTriggeredOutcomeEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent | null | undefined,
  settings: DicePluginSettingsEvent
): { kind: EventOutcomeKindEvent; text: string; explosionTriggered: boolean } {
  if (!settings.enableOutcomeBranches) {
    return { kind: "none", text: "走向分支已关闭。", explosionTriggered: false };
  }
  const outcomes = event.outcomes;
  const explosionTriggered = Boolean(record?.result?.explosionTriggered);
  if (
    settings.enableExplodeOutcomeBranch &&
    explosionTriggered &&
    outcomes?.explode &&
    outcomes.explode.trim()
  ) {
    return { kind: "explode", text: outcomes.explode.trim(), explosionTriggered: true };
  }
  if (record?.success === true) {
    return { kind: "success", text: outcomes?.success?.trim() || "判定成功，剧情向有利方向推进。", explosionTriggered };
  }
  if (record?.success === false || record?.source === "timeout_auto_fail") {
    return { kind: "failure", text: outcomes?.failure?.trim() || "判定失败，剧情向不利方向推进。", explosionTriggered };
  }
  return { kind: "none", text: "尚未结算。", explosionTriggered };
}

export interface CreateTimeoutFailureRecordDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  normalizeCompareOperatorEvent: (raw: any) => CompareOperatorEvent | null;
  createSyntheticTimeoutDiceResultEvent: (event: DiceEventSpecEvent) => DiceResult;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  createIdEvent: (prefix: string) => string;
}

export function createTimeoutFailureRecordEvent(
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  now: number,
  deps: CreateTimeoutFailureRecordDepsEvent
): EventRollRecordEvent {
  const settings = deps.getSettingsEvent();
  const meta = deps.getDiceMetaEvent();
  const compareUsed = deps.normalizeCompareOperatorEvent(event.compare) ?? ">=";
  const dcUsed = Number.isFinite(event.dc) ? Number(event.dc) : null;
  let result = deps.createSyntheticTimeoutDiceResultEvent(event);
  const skillModifierApplied = deps.resolveSkillModifierBySkillNameEvent(event.skill, settings);
  const skillAdjusted = applySkillModifierToDiceResultEvent(result, skillModifierApplied);
  result = skillAdjusted.result;
  const statusResolved = resolveStatusModifierBySkillNameForRollEvent(event.skill, meta, settings);
  const statusAdjusted = applyStatusModifierToDiceResultEvent(result, statusResolved.modifier);
  result = statusAdjusted.result;
  const grade = evaluateResultGradeEvent(result, false, compareUsed, dcUsed, "timeout_auto_fail");

  return {
    rollId: deps.createIdEvent("eroll"),
    roundId: round.roundId,
    eventId: event.id,
    eventTitle: event.title,
    diceExpr: event.checkDice,
    result,
    success: false,
    compareUsed,
    dcUsed,
    advantageStateApplied: normalizeAdvantageStateOrNormalEvent(event.advantageState),
    resultGrade: grade.resultGrade,
    marginToDc: grade.marginToDc,
    skillModifierApplied,
    statusModifierApplied: statusResolved.modifier,
    statusModifiersApplied: statusResolved.matched,
    baseModifierUsed: skillAdjusted.baseModifierUsed,
    finalModifierUsed: statusAdjusted.finalModifierUsed,
    targetLabelUsed: event.targetLabel,
    rolledAt: now,
    source: "timeout_auto_fail",
    timeoutAt: now,
  };
}

export interface RecordTimeoutFailureIfNeededDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getLatestRollRecordForEvent: (round: PendingRoundEvent, eventId: string) => EventRollRecordEvent | null;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  createTimeoutFailureRecordEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now: number
  ) => EventRollRecordEvent;
}

export function recordTimeoutFailureIfNeededEvent(
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  deps: RecordTimeoutFailureIfNeededDepsEvent,
  now = Date.now()
): EventRollRecordEvent | null {
  const settings = deps.getSettingsEvent();
  if (!settings.enableTimeLimit) return null;
  const existing = deps.getLatestRollRecordForEvent(round, event.id);
  if (existing) return null;

  deps.ensureRoundEventTimersSyncedEvent(round);
  const timer = round.eventTimers[event.id];
  if (!timer || timer.deadlineAt == null) return null;
  if (now <= timer.deadlineAt) return null;

  const record = deps.createTimeoutFailureRecordEvent(round, event, now);
  round.rolls.push(record);
  timer.expiredAt = now;
  return record;
}

export interface SweepTimeoutFailuresDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  recordTimeoutFailureIfNeededEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now?: number
  ) => EventRollRecordEvent | null;
  saveMetadataSafeEvent: () => void;
}

export function sweepTimeoutFailuresEvent(deps: SweepTimeoutFailuresDepsEvent): boolean {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled || !settings.enableTimeLimit) return false;

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;
  if (!round) return false;
  if (round.status !== "open") return false;

  deps.ensureRoundEventTimersSyncedEvent(round);
  const now = Date.now();
  let changed = false;
  for (const event of round.events) {
    const created = deps.recordTimeoutFailureIfNeededEvent(round, event, now);
    if (created) {
      changed = true;
      if (settings.enableDynamicResultGuidance) {
        enqueueResultGuidanceFromRecordEvent(meta, event, created);
      }
      if (applyOutcomeStatusEffectsFromRecordEvent(meta, event, created, settings)) {
        changed = true;
      }
    }
  }
  if (changed) deps.saveMetadataSafeEvent();
  return changed;
}

export interface PerformEventRollByIdDepsEvent {
  sweepTimeoutFailuresEvent: () => boolean;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  recordTimeoutFailureIfNeededEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now?: number
  ) => EventRollRecordEvent | null;
  saveMetadataSafeEvent: () => void;
  getLatestRollRecordForEvent: (round: PendingRoundEvent, eventId: string) => EventRollRecordEvent | null;
  pushToChat: (message: string) => string | undefined | void;
  refreshCountdownDomEvent: () => void;
  rollExpression: (exprRaw: string, options?: DiceOptions) => DiceResult;
  parseDiceExpression: ParseDiceExpressionFnEvent;
  getSettingsEvent: () => DicePluginSettingsEvent;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  applySkillModifierToDiceResultEvent: (
    result: DiceResult,
    skillModifier: number
  ) => { result: DiceResult; baseModifierUsed: number; finalModifierUsed: number };
  saveLastRoll: (result: DiceResult) => void;
  normalizeCompareOperatorEvent: (raw: any) => CompareOperatorEvent | null;
  evaluateSuccessEvent: (total: number, compare: CompareOperatorEvent, dc: number | null) => boolean | null;
  createIdEvent: (prefix: string) => string;
  buildEventRollResultCardEvent: (event: DiceEventSpecEvent, record: EventRollRecordEvent) => string;
}

export function performEventRollByIdEvent(
  eventIdRaw: string,
  overrideExpr: string | undefined,
  expectedRoundId: string | undefined,
  deps: PerformEventRollByIdDepsEvent
): string {
  deps.sweepTimeoutFailuresEvent();
  const eventId = String(eventIdRaw || "").trim();
  if (!eventId) {
    return "❌ 请提供事件 ID，例如：/eventroll roll lockpick_gate";
  }

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;
  if (!round) {
    return "❌ 当前没有可投掷的事件。";
  }
  if (round.status !== "open") {
    return "❌ 当前轮次已结束，请等待 AI 生成新轮次事件。";
  }
  if (expectedRoundId && round.roundId !== expectedRoundId) {
    return "❌ 该事件所属轮次已结束。";
  }

  const event = round.events.find((item) => item.id === eventId);
  if (!event) {
    return `❌ 找不到事件 ID：${eventId}`;
  }

  const settings = deps.getSettingsEvent();
  if (!settings.enabled) {
    return "❌ RollHelper 主开关已关闭，当前不能执行事件掷骰。";
  }
  deps.ensureRoundEventTimersSyncedEvent(round);
  const timeoutCreated = deps.recordTimeoutFailureIfNeededEvent(round, event);
  if (timeoutCreated) {
    if (settings.enableDynamicResultGuidance) {
      enqueueResultGuidanceFromRecordEvent(meta, event, timeoutCreated);
    }
    applyOutcomeStatusEffectsFromRecordEvent(meta, event, timeoutCreated, settings);
    deps.saveMetadataSafeEvent();
  }

  const existingRecord = deps.getLatestRollRecordForEvent(round, event.id);
  if (existingRecord) {
    const resultCard = deps.buildEventRollResultCardEvent(event, existingRecord);
    const fallback = deps.pushToChat(resultCard);
    deps.refreshCountdownDomEvent();
    return typeof fallback === "string" ? fallback : "";
  }

  const exprRaw = (overrideExpr || event.checkDice || "").trim();
  if (!exprRaw) {
    return `❌ 事件 ${eventId} 缺少可用骰式。`;
  }

  const requestedExplode = exprRaw.includes("!");
  const explodePolicyApplied: EventRollRecordEvent["explodePolicyApplied"] = requestedExplode
    ? settings.enableExplodingDice
      ? "enabled"
      : "disabled_globally"
    : "not_requested";
  const explodePolicyReason = requestedExplode
    ? settings.enableExplodingDice
      ? "已请求爆骰，按真实掷骰结果决定是否触发连爆。"
      : "已请求爆骰，但全局爆骰功能关闭，按普通骰结算。"
    : "未请求爆骰。";
  const expr = requestedExplode && !settings.enableExplodingDice ? exprRaw.replace("!", "") : exprRaw;

  const execution = resolveRollExecutionOptionsEvent(expr, event, settings, deps.parseDiceExpression);
  if (execution.errorText) {
    return `❌ 掷骰失败：${execution.errorText}`;
  }

  let result: DiceResult;
  try {
    result = deps.rollExpression(expr, {
      rule: settings.ruleText,
      adv: execution.adv,
      dis: execution.dis,
    });
  } catch (error: any) {
    return `❌ 掷骰失败：${error?.message ?? String(error)}`;
  }

  const skillModifierApplied = deps.resolveSkillModifierBySkillNameEvent(event.skill, settings);
  const adjusted = deps.applySkillModifierToDiceResultEvent(result, skillModifierApplied);
  result = adjusted.result;
  const statusResolved = resolveStatusModifierBySkillNameForRollEvent(event.skill, meta, settings);
  const statusAdjusted = applyStatusModifierToDiceResultEvent(result, statusResolved.modifier);
  result = statusAdjusted.result;

  deps.saveLastRoll(result);
  const compareUsed = deps.normalizeCompareOperatorEvent(event.compare) ?? ">=";
  const dcUsed = Number.isFinite(event.dc) ? Number(event.dc) : null;
  const success = deps.evaluateSuccessEvent(result.total, compareUsed, dcUsed);
  const grade = evaluateResultGradeEvent(result, success, compareUsed, dcUsed, "manual_roll");

  const record: EventRollRecordEvent = {
    rollId: deps.createIdEvent("eroll"),
    roundId: round.roundId,
    eventId: event.id,
    eventTitle: event.title,
    diceExpr: expr,
    result,
    success,
    compareUsed,
    dcUsed,
    advantageStateApplied: execution.advantageStateApplied,
    resultGrade: grade.resultGrade,
    marginToDc: grade.marginToDc,
    skillModifierApplied,
    statusModifierApplied: statusResolved.modifier,
    statusModifiersApplied: statusResolved.matched,
    baseModifierUsed: adjusted.baseModifierUsed,
    finalModifierUsed: statusAdjusted.finalModifierUsed,
    targetLabelUsed: event.targetLabel,
    rolledAt: Date.now(),
    source: "manual_roll",
    timeoutAt: null,
    explodePolicyApplied,
    explodePolicyReason,
  };

  round.rolls.push(record);
  if (settings.enableDynamicResultGuidance) {
    enqueueResultGuidanceFromRecordEvent(meta, event, record);
  }
  applyOutcomeStatusEffectsFromRecordEvent(meta, event, record, settings);
  deps.saveMetadataSafeEvent();
  deps.refreshCountdownDomEvent();

  const message = deps.buildEventRollResultCardEvent(event, record);
  const fallback = deps.pushToChat(message);
  return typeof fallback === "string" ? fallback : "";
}

export interface AutoRollEventsByAiModeDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getLatestRollRecordForEvent: (round: PendingRoundEvent, eventId: string) => EventRollRecordEvent | null;
  rollExpression: (exprRaw: string, options?: DiceOptions) => DiceResult;
  parseDiceExpression: ParseDiceExpressionFnEvent;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  applySkillModifierToDiceResultEvent: (
    result: DiceResult,
    skillModifier: number
  ) => { result: DiceResult; baseModifierUsed: number; finalModifierUsed: number };
  normalizeCompareOperatorEvent: (raw: any) => CompareOperatorEvent | null;
  evaluateSuccessEvent: (total: number, compare: CompareOperatorEvent, dc: number | null) => boolean | null;
  createIdEvent: (prefix: string) => string;
  buildEventRollResultCardEvent: (event: DiceEventSpecEvent, record: EventRollRecordEvent) => string;
  saveLastRoll: (result: DiceResult) => void;
  saveMetadataSafeEvent: () => void;
}

export function autoRollEventsByAiModeEvent(round: PendingRoundEvent, deps: AutoRollEventsByAiModeDepsEvent): string[] {
  const settings = deps.getSettingsEvent();
  if (!settings.enableAiRollMode) return [];

  deps.ensureRoundEventTimersSyncedEvent(round);
  const meta = deps.getDiceMetaEvent();
  let changed = false;
  let lastResult: DiceResult | null = null;
  const resultCards: string[] = [];
  let aiAutoExplodeUsed = round.rolls.filter(
    (item) =>
      item?.source === "ai_auto_roll" &&
      (item.explodePolicyApplied === "enabled" || String(item.diceExpr || "").includes("!"))
  ).length;

  for (const event of round.events) {
    const mode: EventRollModeEvent = event.rollMode === "auto" ? "auto" : "manual";
    if (mode !== "auto") continue;

    const existingRecord = deps.getLatestRollRecordForEvent(round, event.id);
    if (existingRecord) continue;

    const exprRaw = String(event.checkDice || "").trim();
    if (!exprRaw) continue;
    const requestedExplode = exprRaw.includes("!");
    let explodePolicyApplied: EventRollRecordEvent["explodePolicyApplied"] = "not_requested";
    let explodePolicyReason = "未请求爆骰。";
    let expr = exprRaw;
    if (requestedExplode) {
      if (!settings.enableExplodingDice) {
        explodePolicyApplied = "disabled_globally";
        explodePolicyReason = "已请求爆骰，但全局爆骰功能关闭，按普通骰结算。";
        expr = exprRaw.replace("!", "");
      } else if (aiAutoExplodeUsed >= AI_AUTO_EXPLODE_EVENT_LIMIT_PER_ROUND_Event) {
        explodePolicyApplied = "downgraded_by_ai_limit";
        explodePolicyReason = `已请求爆骰，但本轮 AI 自动爆骰上限为 ${AI_AUTO_EXPLODE_EVENT_LIMIT_PER_ROUND_Event}，按普通骰结算。`;
        expr = exprRaw.replace("!", "");
      } else {
        explodePolicyApplied = "enabled";
        explodePolicyReason = "已请求爆骰，按真实掷骰结果决定是否触发连爆。";
        aiAutoExplodeUsed += 1;
      }
    }

    const execution = resolveRollExecutionOptionsEvent(expr, event, settings, deps.parseDiceExpression);
    if (execution.errorText) {
      logger.warn(`AI 自动掷骰被跳过: event=${event.id} reason=${execution.errorText}`);
      continue;
    }

    let result: DiceResult;
    try {
      result = deps.rollExpression(expr, {
        rule: settings.ruleText,
        adv: execution.adv,
        dis: execution.dis,
      });
    } catch (error) {
      logger.warn(`AI 自动掷骰失败: event=${event.id}`, error);
      continue;
    }

    const skillModifierApplied = deps.resolveSkillModifierBySkillNameEvent(event.skill, settings);
    const adjusted = deps.applySkillModifierToDiceResultEvent(result, skillModifierApplied);
    result = adjusted.result;
    const statusResolved = resolveStatusModifierBySkillNameForRollEvent(event.skill, meta, settings);
    const statusAdjusted = applyStatusModifierToDiceResultEvent(result, statusResolved.modifier);
    result = statusAdjusted.result;

    const compareUsed = deps.normalizeCompareOperatorEvent(event.compare) ?? ">=";
    const dcUsed = Number.isFinite(event.dc) ? Number(event.dc) : null;
    const success = deps.evaluateSuccessEvent(result.total, compareUsed, dcUsed);
    const grade = evaluateResultGradeEvent(result, success, compareUsed, dcUsed, "ai_auto_roll");

    const record: EventRollRecordEvent = {
      rollId: deps.createIdEvent("eroll"),
      roundId: round.roundId,
      eventId: event.id,
      eventTitle: event.title,
      diceExpr: expr,
      result,
      success,
      compareUsed,
      dcUsed,
      advantageStateApplied: execution.advantageStateApplied,
      resultGrade: grade.resultGrade,
      marginToDc: grade.marginToDc,
      skillModifierApplied,
      statusModifierApplied: statusResolved.modifier,
      statusModifiersApplied: statusResolved.matched,
      baseModifierUsed: adjusted.baseModifierUsed,
      finalModifierUsed: statusAdjusted.finalModifierUsed,
      targetLabelUsed: event.targetLabel,
      rolledAt: Date.now(),
      source: "ai_auto_roll",
      timeoutAt: null,
      explodePolicyApplied,
      explodePolicyReason,
    };

    round.rolls.push(record);
    if (settings.enableDynamicResultGuidance) {
      enqueueResultGuidanceFromRecordEvent(meta, event, record);
    }
    applyOutcomeStatusEffectsFromRecordEvent(meta, event, record, settings);
    changed = true;
    lastResult = result;
    resultCards.push(deps.buildEventRollResultCardEvent(event, record));
  }

  if (!changed) return [];
  if (lastResult) {
    deps.saveLastRoll(lastResult);
  }
  deps.saveMetadataSafeEvent();
  return resultCards;
}

export interface FormatRollRecordSummaryDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  resolveTriggeredOutcomeEvent: (
    event: DiceEventSpecEvent,
    record: EventRollRecordEvent | null | undefined,
    settings: DicePluginSettingsEvent
  ) => { kind: EventOutcomeKindEvent; text: string; explosionTriggered: boolean };
  formatEventModifierBreakdownEvent: (
    baseModifier: number,
    skillModifier: number,
    finalModifier: number
  ) => string;
}

export function formatRollRecordSummaryEvent(
  record: EventRollRecordEvent,
  event: DiceEventSpecEvent | undefined,
  deps: FormatRollRecordSummaryDepsEvent
): string {
  const settings = deps.getSettingsEvent();
  const baseModifierUsed = Number.isFinite(Number(record.baseModifierUsed))
    ? Number(record.baseModifierUsed)
    : Number(record.result.modifier) || 0;
  const skillModifierApplied = Number.isFinite(Number(record.skillModifierApplied))
    ? Number(record.skillModifierApplied)
    : 0;
  const statusModifierApplied = Number.isFinite(Number(record.statusModifierApplied))
    ? Number(record.statusModifierApplied)
    : 0;
  const finalModifierUsed = Number.isFinite(Number(record.finalModifierUsed))
    ? Number(record.finalModifierUsed)
    : baseModifierUsed + skillModifierApplied + statusModifierApplied;
  let outcomeTag = "";
  if (settings.enableOutcomeBranches) {
    const resolved = event
      ? deps.resolveTriggeredOutcomeEvent(event, record, settings)
      : record.result.explosionTriggered && settings.enableExplodeOutcomeBranch
        ? { kind: "explode" as EventOutcomeKindEvent }
        : record.success === true
          ? { kind: "success" as EventOutcomeKindEvent }
          : record.success === false
            ? { kind: "failure" as EventOutcomeKindEvent }
            : { kind: "none" as EventOutcomeKindEvent };
    if (resolved.kind !== "none") {
      outcomeTag = ` | 走向:${resolved.kind}`;
    }
  }
  const targetLabel = record.targetLabelUsed || event?.targetLabel || "";
  const targetTag = targetLabel ? ` | 对象:${targetLabel}` : "";
  const modifierTag = settings.enableSkillSystem
    ? ` | 修正:${deps.formatEventModifierBreakdownEvent(
      baseModifierUsed,
      skillModifierApplied,
      finalModifierUsed
    )}`
    : "";
  const statusDetailTag =
    statusModifierApplied !== 0
      ? ` | 状态:${statusModifierApplied > 0 ? `+${statusModifierApplied}` : statusModifierApplied}${Array.isArray(record.statusModifiersApplied) && record.statusModifiersApplied.length > 0
        ? `(${record.statusModifiersApplied
          .map((item) => `${item.name}${item.modifier > 0 ? `+${item.modifier}` : item.modifier}`)
          .join(",")})`
        : ""
      }`
      : "";
  const advantageTag =
    record.advantageStateApplied && record.advantageStateApplied !== ADVANTAGE_NORMAL_Event
      ? ` | 骰态:${record.advantageStateApplied}`
      : "";
  const gradeTag = record.resultGrade ? ` | 分级:${record.resultGrade}` : "";

  if (record.source === "timeout_auto_fail") {
    return `超时自动判定失败${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
  }
  if (record.source === "ai_auto_roll") {
    const status = record.success === null ? "未判定" : record.success ? "成功" : "失败";
    return `AI自动检定，总值 ${record.result.total} (${record.compareUsed} ${record.dcUsed ?? "?"} => ${status})${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
  }
  const status = record.success === null ? "未判定" : record.success ? "成功" : "失败";
  return `总值 ${record.result.total} (${record.compareUsed} ${record.dcUsed ?? "?"} => ${status})${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
}
