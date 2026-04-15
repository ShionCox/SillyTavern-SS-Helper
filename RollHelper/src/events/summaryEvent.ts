import { stripStatusTagsFromTextEvent } from "./statusEvent";
import type {
  BuiltSummaryBlocksEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventOutcomeKindEvent,
  EventRollRecordEvent,
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
      difficulty: event.difficulty,
      dcSource: event.dcSource,
      dcReason: String(event.dcReason || ""),
      rollMode: event.rollMode === "auto" ? "auto" : "manual",
      advantageState: normalizeAdvantageStateForSummaryEvent(
        record?.advantageStateApplied ?? event.advantageState
      ),
      urgency: event.urgency,
      timeLimit: event.timeLimit ?? "none",
      status,
      resultSource: record?.source ?? null,
      visibility: record?.visibility,
      revealMode: record?.revealMode === "instant" ? "instant" : "delayed",
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
      sourceAssistantMsgId: event.sourceAssistantMsgId,
      rollId: record?.rollId,
      rolledAt: record?.rolledAt,
      targetLabelUsed: record?.targetLabelUsed,
      statusModifiersApplied: record?.statusModifiersApplied
        ? [...record.statusModifiersApplied]
        : undefined,
      explodePolicyApplied: record?.explodePolicyApplied,
      rollsSnapshot: record?.result
        ? {
            rolls: Array.isArray(record.result.rolls) ? [...record.result.rolls] : [],
            modifier: Number(record.result.modifier) || 0,
            total: Number(record.result.total) || 0,
            rawTotal: Number(record.result.rawTotal) || 0,
            count: Number(record.result.count) || 0,
            sides: Number(record.result.sides) || 0,
            exploding: record.result.exploding,
            explosionTriggered: record.result.explosionTriggered,
          }
        : undefined,
    });
  }

  return {
    roundId: round.roundId,
    openedAt: round.openedAt,
    closedAt: now,
    eventsCount: round.events.length,
    rolledCount,
    events,
    sourceAssistantMsgIds: Array.isArray(round.sourceAssistantMsgIds)
      ? [...round.sourceAssistantMsgIds]
      : [],
  };
}

/** 模块级历史摘要运行时列表（纯运行时缓存，从 chatData 重建；聊天切换时自动清空）。 */
let SUMMARY_HISTORY_RUNTIME_Event: RoundSummarySnapshotEvent[] = [];

export function ensureSummaryHistoryEvent(_meta: DiceMetaEvent): RoundSummarySnapshotEvent[] {
  return SUMMARY_HISTORY_RUNTIME_Event;
}

/** 获取当前运行时历史摘要列表引用。 */
export function getSummaryHistoryRuntimeEvent(): RoundSummarySnapshotEvent[] {
  return SUMMARY_HISTORY_RUNTIME_Event;
}

/** 用给定数组替换运行时历史摘要并返回引用。 */
export function setSummaryHistoryRuntimeEvent(history: RoundSummarySnapshotEvent[]): RoundSummarySnapshotEvent[] {
  SUMMARY_HISTORY_RUNTIME_Event = history;
  return SUMMARY_HISTORY_RUNTIME_Event;
}

/** 清空运行时历史摘要列表。 */
export function clearSummaryHistoryRuntimeEvent(): void {
  SUMMARY_HISTORY_RUNTIME_Event = [];
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

/**
 * 功能：统一摘要密度模式，防止非法值。
 * @param settings 当前设置。
 * @returns 摘要密度模式。
 */
function resolveSummaryVerbosityModeEvent(
  settings: DicePluginSettingsEvent
): "compact" | "verbose" {
  return settings.promptVerbosityMode === "verbose" ? "verbose" : "compact";
}

/**
 * 功能：根据摘要密度与详细度获取叙事段长度。
 * @param detailMode 摘要详细度。
 * @param verbosityMode 摘要密度模式。
 * @returns 叙事文本最大长度。
 */
function getSummaryNarrativeMaxLenEvent(
  detailMode: SummaryDetailModeEvent,
  verbosityMode: "compact" | "verbose"
): number {
  const base = getSummaryDescMaxLenByModeEvent(detailMode);
  if (verbosityMode === "compact") {
    return Math.max(24, Math.floor(base * 0.6));
  }
  return base;
}

/**
 * 功能：判断摘要条目是否属于暗骰。
 * @param item 单条摘要事件。
 * @returns 若该条目属于暗骰则返回 `true`。
 */
function isBlindSummaryItemEvent(item: RoundSummaryEventItemEvent): boolean {
  return item.visibility === "blind" || item.resultSource === "blind_manual_roll";
}

function toSummaryResultSentenceEvent(item: RoundSummaryEventItemEvent): string {
  if (item.status === "pending") {
    return "待判定（尚未掷骰）";
  }

  if (item.status === "timeout" || item.resultSource === "timeout_auto_fail") {
    return "超时未操作，系统判定失败";
  }
  if (item.visibility === "blind" || item.resultSource === "blind_manual_roll") {
    return item.revealMode === "instant"
      ? "暗骰检定已结算（结果隐藏，已即时反馈）"
      : "暗骰检定已结算（结果隐藏，将通过叙事体现）";
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

/**
 * 功能：生成更短的结果句子，用于摘要 compact 模式。
 * @param item 单条摘要事件。
 * @returns 简短的结果文本。
 */
function toSummaryResultBriefEvent(item: RoundSummaryEventItemEvent): string {
  if (item.status === "pending") {
    return "待判定";
  }
  if (item.status === "timeout" || item.resultSource === "timeout_auto_fail") {
    return "超时失败";
  }
  if (item.success === true) {
    return item.resultSource === "ai_auto_roll" ? "自动检定成功" : "成功";
  }
  if (item.success === false) {
    return item.resultSource === "ai_auto_roll" ? "自动检定失败" : "失败";
  }
  return "已完成";
}

/**
 * 功能：把检定分级转换为暗骰摘要中的结果句子。
 * @param item 单条摘要事件。
 * @returns 仅暴露等级、不暴露点数的暗骰结果文本。
 */
function toBlindSummaryResultSentenceEvent(item: RoundSummaryEventItemEvent): string {
  if (item.status === "pending") {
    return "暗骰待结算";
  }
  if (item.status === "timeout" || item.resultSource === "timeout_auto_fail") {
    return "暗骰失败";
  }
  if (item.revealMode === "instant") {
    if (item.resultGrade === "critical_success") return "暗骰已即时反馈（大成功）";
    if (item.resultGrade === "critical_failure") return "暗骰已即时反馈（大失败）";
    if (item.resultGrade === "partial_success") return "暗骰已即时反馈（勉强成功）";
    if (item.resultGrade === "success") return "暗骰已即时反馈（成功）";
    if (item.resultGrade === "failure") return "暗骰已即时反馈（失败）";
    return "暗骰已即时反馈";
  }
  if (item.resultGrade === "critical_success") return "暗骰大成功";
  if (item.resultGrade === "critical_failure") return "暗骰大失败";
  if (item.resultGrade === "partial_success") return "暗骰勉强成功";
  if (item.resultGrade === "success") return "暗骰成功";
  if (item.resultGrade === "failure") return "暗骰失败";
  if (item.success === true) return "暗骰成功";
  if (item.success === false) return "暗骰失败";
  return "暗骰已结算";
}

/**
 * 功能：生成可口语化的结果叙事，不暴露暗骰真实后果。
 * @param item 单条摘要事件。
 * @param settings 当前设置。
 * @param maxLen 最大长度。
 * @returns 叙事文本，若不可用则返回空字符串。
 */
function toSummaryOutcomeNarrativeEvent(
  item: RoundSummaryEventItemEvent,
  settings: DicePluginSettingsEvent,
  maxLen: number
): string {
  const isBlind = item.visibility === "blind" || item.resultSource === "blind_manual_roll";
  if (isBlind && !settings.blindRevealInSummary) {
    return "";
  }
  const rawText = String(item.outcomeText || "").trim();
  if (!rawText) return "";
  return truncateSummaryTextEvent(rawText, maxLen);
}

function buildSummaryEventNaturalLineByModeEvent(
  item: RoundSummaryEventItemEvent,
  detailMode: SummaryDetailModeEvent,
  includeOutcomeInSummary: boolean,
  settings: DicePluginSettingsEvent
): string {
  const verbosityMode = resolveSummaryVerbosityModeEvent(settings);
  const narrativeMaxLen = getSummaryNarrativeMaxLenEvent(detailMode, verbosityMode);
  const title = truncateSummaryTextEvent(item.title, 48);
  const desc = truncateSummaryTextEvent(item.desc, narrativeMaxLen);
  const outcomeNarrative = includeOutcomeInSummary
    ? toSummaryOutcomeNarrativeEvent(item, settings, narrativeMaxLen)
    : "";
  const narrative = outcomeNarrative || desc;
  const resultSentence =
    verbosityMode === "compact" ? toSummaryResultBriefEvent(item) : toSummaryResultSentenceEvent(item);
  const narrativeSuffix = narrative ? `。${narrative}` : "";

  return `- ${title}：${resultSentence}${narrativeSuffix}`;
}

/**
 * 功能：按摘要模式生成暗骰条目的自然语言行。
 * @param item 单条摘要事件。
 * @param detailMode 摘要详细度。
 * @returns 面向 AI 的暗骰摘要单行文本。
 */
function buildBlindSummaryEventNaturalLineByModeEvent(
  item: RoundSummaryEventItemEvent,
  detailMode: SummaryDetailModeEvent,
  settings: DicePluginSettingsEvent
): string {
  const verbosityMode = resolveSummaryVerbosityModeEvent(settings);
  const narrativeMaxLen = getSummaryNarrativeMaxLenEvent(detailMode, verbosityMode);
  const title = truncateSummaryTextEvent(item.title, 48);
  const clueTextRaw = item.revealMode === "instant"
    ? String(item.outcomeText || "").trim() || item.desc
    : item.desc;
  const desc = truncateSummaryTextEvent(clueTextRaw, narrativeMaxLen);
  const target = truncateSummaryTextEvent(item.targetLabel || "未指定", 20);
  const resultSentence = toBlindSummaryResultSentenceEvent(item);
  if (verbosityMode === "compact") {
    return `- 暗骰${title}：${resultSentence}。线索：${desc}`;
  }

  return `- 暗骰${title}：${resultSentence}。目标：${target}。线索：${desc}`;
}

export interface BuildSummaryBlockFromHistoryDepsEvent {
  SUMMARY_HISTORY_ROUNDS_MAX_Event: number;
  SUMMARY_HISTORY_ROUNDS_MIN_Event: number;
  SUMMARY_MAX_EVENTS_Event: number;
  SUMMARY_MAX_TOTAL_EVENT_LINES_Event: number;
  DICE_SUMMARY_BLOCK_START_Event: string;
  DICE_SUMMARY_BLOCK_END_Event: string;
  DICE_BLIND_SUMMARY_BLOCK_START_Event: string;
  DICE_BLIND_SUMMARY_BLOCK_END_Event: string;
}

export function buildSummaryBlockFromHistoryEvent(
  history: RoundSummarySnapshotEvent[],
  detailMode: SummaryDetailModeEvent,
  lastNRounds: number,
  includeOutcomeInSummary: boolean,
  settings: DicePluginSettingsEvent,
  deps: BuildSummaryBlockFromHistoryDepsEvent
): BuiltSummaryBlocksEvent {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      publicSummaryText: "",
      blindSummaryText: "",
    };
  }
  const roundsWindow = Math.min(
    deps.SUMMARY_HISTORY_ROUNDS_MAX_Event,
    Math.max(deps.SUMMARY_HISTORY_ROUNDS_MIN_Event, Math.floor(Number(lastNRounds) || 1))
  );
  const selected = history.slice(-roundsWindow);
  if (selected.length === 0) {
    return {
      publicSummaryText: "",
      blindSummaryText: "",
    };
  }

  const verbosityMode = resolveSummaryVerbosityModeEvent(settings);
  const publicLines: string[] = [];
  const blindLines: string[] = [];
  publicLines.push(deps.DICE_SUMMARY_BLOCK_START_Event);
  publicLines.push(`mode=${verbosityMode} rounds=${selected.length}`);
  blindLines.push(deps.DICE_BLIND_SUMMARY_BLOCK_START_Event);
  blindLines.push(`mode=${verbosityMode} rounds=${selected.length}`);
  blindLines.push("说明：本区块仅提供暗骰的结果等级与线索背景，不公开点数、修正、总值或具体隐藏后果。");

  let emittedPublicEventLines = 0;
  let emittedBlindEventLines = 0;
  let publicTruncatedByTotalLimit = false;
  let blindTruncatedByTotalLimit = false;
  let hasPublicContent = false;
  let hasBlindContent = false;
  for (let i = 0; i < selected.length; i++) {
    const snapshot = selected[i];
    const publicItems = snapshot.events.filter((item) => !isBlindSummaryItemEvent(item));
    const blindItems = snapshot.events.filter((item) => isBlindSummaryItemEvent(item));
    const publicRolledCount = publicItems.filter((item) => item.status !== "pending").length;
    const blindRolledCount = blindItems.filter((item) => item.status !== "pending").length;
    const publicUnresolved = Math.max(0, publicItems.length - publicRolledCount);
    const blindUnresolved = Math.max(0, blindItems.length - blindRolledCount);

    const roundLabel = selected.length === 1
      ? verbosityMode === "verbose"
        ? "上一轮（已结算）"
        : "上一轮"
      : `第 ${i + 1} 轮`;

    if (publicItems.length > 0) {
      hasPublicContent = true;
      publicLines.push(`${roundLabel}：`);
      if (verbosityMode === "verbose") {
        publicLines.push(`本轮事件数=${publicItems.length}，已结算=${publicRolledCount}，未结算=${publicUnresolved}`);
      }
    }

    if (blindItems.length > 0) {
      hasBlindContent = true;
      blindLines.push(`${roundLabel}：`);
      if (verbosityMode === "verbose") {
        blindLines.push(`本轮暗骰数=${blindItems.length}，已结算=${blindRolledCount}，未结算=${blindUnresolved}`);
      }
    }

    const limitedPublicPerRound = publicItems.slice(0, deps.SUMMARY_MAX_EVENTS_Event);
    for (const item of limitedPublicPerRound) {
      if (emittedPublicEventLines >= deps.SUMMARY_MAX_TOTAL_EVENT_LINES_Event) {
        publicTruncatedByTotalLimit = true;
        break;
      }
      publicLines.push(
        buildSummaryEventNaturalLineByModeEvent(item, detailMode, includeOutcomeInSummary, settings)
      );
      emittedPublicEventLines++;
    }

    const limitedBlindPerRound = blindItems.slice(0, deps.SUMMARY_MAX_EVENTS_Event);
    for (const item of limitedBlindPerRound) {
      if (emittedBlindEventLines >= deps.SUMMARY_MAX_TOTAL_EVENT_LINES_Event) {
        blindTruncatedByTotalLimit = true;
        break;
      }
      blindLines.push(buildBlindSummaryEventNaturalLineByModeEvent(item, detailMode, settings));
      emittedBlindEventLines++;
    }

    if (publicItems.length > deps.SUMMARY_MAX_EVENTS_Event) {
      publicLines.push(`注：本轮还有 ${publicItems.length - deps.SUMMARY_MAX_EVENTS_Event} 个公开事件未展开。`);
    }

    if (blindItems.length > deps.SUMMARY_MAX_EVENTS_Event) {
      blindLines.push(`注：本轮还有 ${blindItems.length - deps.SUMMARY_MAX_EVENTS_Event} 个暗骰未展开。`);
    }

    if (publicTruncatedByTotalLimit && blindTruncatedByTotalLimit) break;
  }

  if (publicTruncatedByTotalLimit) {
    publicLines.push("注：后续公开事件因长度限制未展开。");
  }
  if (blindTruncatedByTotalLimit) {
    blindLines.push("注：后续暗骰因长度限制未展开。");
  }
  if (hasPublicContent) {
    publicLines.push(deps.DICE_SUMMARY_BLOCK_END_Event);
  }
  if (hasBlindContent) {
    blindLines.push(deps.DICE_BLIND_SUMMARY_BLOCK_END_Event);
  }

  return {
    publicSummaryText: hasPublicContent ? publicLines.join("\n") : "",
    blindSummaryText: hasBlindContent ? blindLines.join("\n") : "",
  };
}
