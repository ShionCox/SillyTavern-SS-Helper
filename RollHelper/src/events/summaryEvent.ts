import { formatIsoDurationNaturalLanguageEvent, formatModifier } from "../core/utilsEvent";
import { stripStatusTagsFromTextEvent } from "./statusEvent";
import type {
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventOutcomeKindEvent,
  EventRollRecordEvent,
  EventRollSourceEvent,
  PendingRoundEvent,
  RoundSummaryEventItemEvent,
  RoundSummarySnapshotEvent,
  SummaryDetailModeEvent,
  SummaryEventStatusEvent,
} from "../types/eventDomainEvent";

type ResolvedOutcomeEvent = {
  kind: EventOutcomeKindEvent;
  text: string;
  explosionTriggered: boolean;
};

export interface CreateRoundSummarySnapshotDepsEvent {
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getLatestRollRecordForEvent: (
    round: PendingRoundEvent,
    eventId: string
  ) => EventRollRecordEvent | null;
  resolveTriggeredOutcomeEvent: (
    event: DiceEventSpecEvent,
    record: EventRollRecordEvent | null | undefined,
    settings: DicePluginSettingsEvent
  ) => ResolvedOutcomeEvent;
  normalizeCompareOperatorEvent: (raw: any) => CompareOperatorEvent | null;
}

export function createRoundSummarySnapshotEvent(
  round: PendingRoundEvent,
  deps: CreateRoundSummarySnapshotDepsEvent,
  now = Date.now()
): RoundSummarySnapshotEvent {
  deps.ensureRoundEventTimersSyncedEvent(round);
  const settings = deps.getSettingsEvent();
  const events: RoundSummaryEventItemEvent[] = [];
  let rolledCount = 0;

  for (const event of round.events) {
    const record = deps.getLatestRollRecordForEvent(round, event.id);
    const status: SummaryEventStatusEvent = record
      ? record.source === "timeout_auto_fail"
        ? "timeout"
        : "done"
      : "pending";
    const total =
      record && Number.isFinite(Number(record.result.total)) ? Number(record.result.total) : null;
    const success = record ? record.success : null;
    const resolvedOutcome = deps.resolveTriggeredOutcomeEvent(event, record, settings);
    if (record) rolledCount++;

    events.push({
      id: event.id,
      title: event.title,
      desc: event.desc,
      targetLabel: event.targetLabel,
      skill: event.skill,
      checkDice: event.checkDice,
      compare: deps.normalizeCompareOperatorEvent(event.compare) ?? ">=",
      dc: Number.isFinite(event.dc) ? Number(event.dc) : 0,
      dcReason: String(event.dcReason || ""),
      rollMode: event.rollMode === "auto" ? "auto" : "manual",
      advantageState: normalizeAdvantageStateForSummaryEvent(
        record?.advantageStateApplied ?? event.advantageState
      ),
      timeLimit: event.timeLimit ?? "none",
      status,
      resultSource: record?.source ?? null,
      total,
      skillModifierApplied: Number(record?.skillModifierApplied ?? 0),
      statusModifierApplied: Number(record?.statusModifierApplied ?? 0),
      baseModifierUsed: Number(record?.baseModifierUsed ?? 0),
      finalModifierUsed: Number(record?.finalModifierUsed ?? 0),
      success,
      marginToDc:
        typeof record?.marginToDc === "number" && Number.isFinite(record.marginToDc)
          ? Number(record.marginToDc)
          : null,
      resultGrade: (record?.resultGrade as any) ?? null,
      outcomeKind: resolvedOutcome.kind,
      outcomeText: stripStatusTagsFromTextEvent(resolvedOutcome.text),
      explosionTriggered: resolvedOutcome.explosionTriggered,
    });
  }

  return {
    roundId: round.roundId,
    openedAt: round.openedAt,
    closedAt: now,
    eventsCount: round.events.length,
    rolledCount,
    events,
  };
}

export function ensureSummaryHistoryEvent(meta: DiceMetaEvent): RoundSummarySnapshotEvent[] {
  if (!Array.isArray(meta.summaryHistory)) {
    meta.summaryHistory = [];
  }
  return meta.summaryHistory;
}

export function trimSummaryHistoryEvent(
  history: RoundSummarySnapshotEvent[],
  maxStored: number
): void {
  if (history.length <= maxStored) return;
  history.splice(0, history.length - maxStored);
}

function normalizeAdvantageStateForSummaryEvent(raw: any): "normal" | "advantage" | "disadvantage" {
  if (raw === "advantage" || raw === "disadvantage" || raw === "normal") {
    return raw;
  }
  return "normal";
}

function normalizeSummaryInlineTextEvent(raw: string): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : "（空）";
}

function truncateSummaryTextEvent(raw: string, maxLen: number): string {
  const normalized = normalizeSummaryInlineTextEvent(raw);
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLen))}（已截断）`;
}

function getSummaryDescMaxLenByModeEvent(detailMode: SummaryDetailModeEvent): number {
  if (detailMode === "minimal") return 60;
  if (detailMode === "balanced") return 90;
  return 140;
}

function toSummarySourceTextEvent(source: EventRollSourceEvent | null | undefined): string {
  if (source === "manual_roll") return "手动检定";
  if (source === "ai_auto_roll") return "AI自动检定";
  if (source === "timeout_auto_fail") return "超时判定";
  return "未知";
}

function toSummaryResultSentenceEvent(item: RoundSummaryEventItemEvent): string {
  if (item.status === "pending") {
    return "待判定（尚未掷骰）";
  }

  if (item.status === "timeout" || item.resultSource === "timeout_auto_fail") {
    return "超时未操作，系统判定失败";
  }

  const totalText = item.total == null ? "-" : String(item.total);

  if (item.success === true) {
    if (item.resultSource === "ai_auto_roll") {
      return `AI自动检定成功（总值 ${totalText}）`;
    }
    return `成功（总值 ${totalText}）`;
  }

  if (item.success === false) {
    if (item.resultSource === "ai_auto_roll") {
      return `AI自动检定失败（总值 ${totalText}）`;
    }
    return `失败（总值 ${totalText}）`;
  }

  return `已完成（总值 ${totalText}）`;
}

function toSummaryOutcomeSentenceEvent(item: RoundSummaryEventItemEvent): string {
  const text = truncateSummaryTextEvent(item.outcomeText || "", 120);
  if (item.outcomeKind === "explode") {
    return `爆骰走向：${text}`;
  }
  if (item.outcomeKind === "success") {
    return `成功走向：${text}`;
  }
  if (item.outcomeKind === "failure") {
    return `失败走向：${text}`;
  }
  return `走向：${text}`;
}

function buildSummaryEventNaturalLineByModeEvent(
  item: RoundSummaryEventItemEvent,
  detailMode: SummaryDetailModeEvent,
  includeOutcomeInSummary: boolean
): string {
  const title = truncateSummaryTextEvent(item.title, 48);
  const desc = truncateSummaryTextEvent(item.desc, getSummaryDescMaxLenByModeEvent(detailMode));
  const target = truncateSummaryTextEvent(item.targetLabel || "未指定", 20);
  const resultSentence = toSummaryResultSentenceEvent(item);
  const outcomeSentence = includeOutcomeInSummary ? toSummaryOutcomeSentenceEvent(item) : "";
  const baseModifierUsed = Number.isFinite(Number(item.baseModifierUsed))
    ? Number(item.baseModifierUsed)
    : 0;
  const skillModifierApplied = Number.isFinite(Number(item.skillModifierApplied))
    ? Number(item.skillModifierApplied)
    : 0;
  const statusModifierApplied = Number.isFinite(Number(item.statusModifierApplied))
    ? Number(item.statusModifierApplied)
    : 0;
  const finalModifierUsed = Number.isFinite(Number(item.finalModifierUsed))
    ? Number(item.finalModifierUsed)
    : baseModifierUsed + skillModifierApplied + statusModifierApplied;
  const modifierSentence = `修正 ${formatModifier(baseModifierUsed)} + 技能 ${formatModifier(
    skillModifierApplied
  )} + 状态 ${formatModifier(statusModifierApplied)} = ${formatModifier(finalModifierUsed)}`;

  if (detailMode === "minimal") {
    return includeOutcomeInSummary
      ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜结果：${resultSentence}｜${outcomeSentence}`
      : `- 标题：${title}｜对象：${target}｜描述：${desc}｜结果：${resultSentence}`;
  }

  const skill = truncateSummaryTextEvent(item.skill, 20);
  const checkDice = truncateSummaryTextEvent(item.checkDice, 24);
  const dcReasonText = item.dcReason ? `（DC原因：${truncateSummaryTextEvent(item.dcReason, 36)}）` : "";
  const checkText = `${skill} ${checkDice}，条件 ${item.compare} ${item.dc}${dcReasonText}`;
  const advantageText =
    item.advantageState === "normal" ? "" : `｜骰态=${item.advantageState}`;
  const gradeText = item.resultGrade ? `｜分级=${item.resultGrade}` : "";

  if (detailMode === "balanced") {
    return includeOutcomeInSummary
      ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜结果：${resultSentence}${gradeText}｜${outcomeSentence}`
      : `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜结果：${resultSentence}${gradeText}`;
  }

  const sourceText = toSummarySourceTextEvent(item.resultSource);
  const timeLimit = truncateSummaryTextEvent(
    formatIsoDurationNaturalLanguageEvent(item.timeLimit || "none"),
    26
  );
  return includeOutcomeInSummary
    ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜来源：${sourceText}｜模式：${item.rollMode}｜时限：${timeLimit}｜结果：${resultSentence}${gradeText}｜${outcomeSentence}`
    : `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜来源：${sourceText}｜模式：${item.rollMode}｜时限：${timeLimit}｜结果：${resultSentence}${gradeText}`;
}

export interface BuildSummaryBlockFromHistoryDepsEvent {
  SUMMARY_HISTORY_ROUNDS_MAX_Event: number;
  SUMMARY_HISTORY_ROUNDS_MIN_Event: number;
  SUMMARY_MAX_EVENTS_Event: number;
  SUMMARY_MAX_TOTAL_EVENT_LINES_Event: number;
  DICE_SUMMARY_BLOCK_START_Event: string;
  DICE_SUMMARY_BLOCK_END_Event: string;
}

export function buildSummaryBlockFromHistoryEvent(
  history: RoundSummarySnapshotEvent[],
  detailMode: SummaryDetailModeEvent,
  lastNRounds: number,
  includeOutcomeInSummary: boolean,
  deps: BuildSummaryBlockFromHistoryDepsEvent
): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  const roundsWindow = Math.min(
    deps.SUMMARY_HISTORY_ROUNDS_MAX_Event,
    Math.max(deps.SUMMARY_HISTORY_ROUNDS_MIN_Event, Math.floor(Number(lastNRounds) || 1))
  );
  const selected = history.slice(-roundsWindow);
  if (selected.length === 0) return "";

  const lines: string[] = [];
  lines.push(deps.DICE_SUMMARY_BLOCK_START_Event);
  lines.push(
    `v=5 fmt=nl detail=${detailMode} window_rounds=${roundsWindow} included_rounds=${selected.length} include_outcome=${includeOutcomeInSummary ? "1" : "0"}`
  );

  let emittedEventLines = 0;
  let truncatedByTotalLimit = false;
  for (let i = 0; i < selected.length; i++) {
    const snapshot = selected[i];
    const unresolved = Math.max(0, snapshot.eventsCount - snapshot.rolledCount);
    lines.push(
      `【第 ${i + 1} 轮 / roundId=${snapshot.roundId} / 关闭时间=${new Date(
        snapshot.closedAt
      ).toISOString()}】`
    );
    lines.push(`本轮事件数=${snapshot.eventsCount}，已结算=${snapshot.rolledCount}，未结算=${unresolved}`);

    const limitedPerRound = snapshot.events.slice(0, deps.SUMMARY_MAX_EVENTS_Event);
    for (const item of limitedPerRound) {
      if (emittedEventLines >= deps.SUMMARY_MAX_TOTAL_EVENT_LINES_Event) {
        truncatedByTotalLimit = true;
        break;
      }
      lines.push(buildSummaryEventNaturalLineByModeEvent(item, detailMode, includeOutcomeInSummary));
      emittedEventLines++;
    }

    if (snapshot.events.length > deps.SUMMARY_MAX_EVENTS_Event) {
      lines.push(`注：本轮还有 ${snapshot.events.length - deps.SUMMARY_MAX_EVENTS_Event} 个事件未展开。`);
    }

    if (truncatedByTotalLimit) break;
  }

  if (truncatedByTotalLimit) {
    lines.push("注：后续事件因长度限制未展开。");
  }
  lines.push(deps.DICE_SUMMARY_BLOCK_END_Event);
  return lines.join("\n");
}
