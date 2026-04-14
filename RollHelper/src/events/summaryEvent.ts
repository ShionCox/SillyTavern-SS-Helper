import { formatIsoDurationNaturalLanguageEvent, formatModifier } from "../core/utilsEvent";
import { stripStatusTagsFromTextEvent } from "./statusEvent";
import type {
  BuiltSummaryBlocksEvent,
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
      difficulty: event.difficulty,
      dcSource: event.dcSource,
      dcReason: String(event.dcReason || ""),
      rollMode: event.rollMode === "auto" ? "auto" : "manual",
      advantageState: normalizeAdvantageStateForSummaryEvent(
        record?.advantageStateApplied ?? event.advantageState
      ),
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

function formatDifficultyLabelForSummaryEvent(raw: any): string {
  if (raw === "easy") return "简单";
  if (raw === "hard") return "困难";
  if (raw === "extreme") return "极难";
  return "普通";
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
  if (source === "blind_manual_roll") return "暗骰检定";
  if (source === "ai_auto_roll") return "AI自动检定";
  if (source === "passive_check") return "被动检定";
  if (source === "timeout_auto_fail") return "超时判定";
  return "未知";
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

function toSummaryOutcomeSentenceEvent(
  item: RoundSummaryEventItemEvent,
  settings: DicePluginSettingsEvent
): string {
  const isBlind = item.visibility === "blind" || item.resultSource === "blind_manual_roll";
  if (isBlind && !settings.blindRevealInSummary) {
    return "";
  }
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
  includeOutcomeInSummary: boolean,
  settings: DicePluginSettingsEvent
): string {
  const title = truncateSummaryTextEvent(item.title, 48);
  const desc = truncateSummaryTextEvent(item.desc, getSummaryDescMaxLenByModeEvent(detailMode));
  const target = truncateSummaryTextEvent(item.targetLabel || "未指定", 20);
  const resultSentence = toSummaryResultSentenceEvent(item);
  const outcomeSentence = includeOutcomeInSummary
    ? toSummaryOutcomeSentenceEvent(item, settings)
    : "";
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
    return includeOutcomeInSummary && outcomeSentence
      ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜结果：${resultSentence}｜${outcomeSentence}`
      : `- 标题：${title}｜对象：${target}｜描述：${desc}｜结果：${resultSentence}`;
  }

  const skill = truncateSummaryTextEvent(item.skill, 20);
  const checkDice = truncateSummaryTextEvent(item.checkDice, 24);
  const dcReasonText = item.dcReason ? `（DC原因：${truncateSummaryTextEvent(item.dcReason, 36)}）` : "";
  const difficultyText = item.difficulty ? `｜难度=${formatDifficultyLabelForSummaryEvent(item.difficulty)}` : "";
  const thresholdSourceText = item.dcSource === "difficulty_mapped" ? "｜阈值=系统换算" : "";
  const checkText = `${skill} ${checkDice}，条件 ${item.compare} ${item.dc}${difficultyText}${thresholdSourceText}${dcReasonText}`;
  const advantageText =
    item.advantageState === "normal" ? "" : `｜骰态=${item.advantageState}`;
  const gradeText = item.resultGrade ? `｜分级=${item.resultGrade}` : "";

  if (detailMode === "balanced") {
    return includeOutcomeInSummary && outcomeSentence
      ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜结果：${resultSentence}${gradeText}｜${outcomeSentence}`
      : `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜结果：${resultSentence}${gradeText}`;
  }

  const sourceText = toSummarySourceTextEvent(item.resultSource);
  const timeLimit = truncateSummaryTextEvent(
    formatIsoDurationNaturalLanguageEvent(item.timeLimit || "none"),
    26
  );
  return includeOutcomeInSummary && outcomeSentence
    ? `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜来源：${sourceText}｜模式：${item.rollMode}｜时限：${timeLimit}｜结果：${resultSentence}${gradeText}｜${outcomeSentence}`
    : `- 标题：${title}｜对象：${target}｜描述：${desc}｜检定：${checkText}${advantageText}｜${modifierSentence}｜来源：${sourceText}｜模式：${item.rollMode}｜时限：${timeLimit}｜结果：${resultSentence}${gradeText}`;
}

/**
 * 功能：按摘要模式生成暗骰条目的自然语言行。
 * @param item 单条摘要事件。
 * @param detailMode 摘要详细度。
 * @returns 面向 AI 的暗骰摘要单行文本。
 */
function buildBlindSummaryEventNaturalLineByModeEvent(
  item: RoundSummaryEventItemEvent,
  detailMode: SummaryDetailModeEvent
): string {
  const title = truncateSummaryTextEvent(item.title, 48);
  const desc = truncateSummaryTextEvent(item.desc, getSummaryDescMaxLenByModeEvent(detailMode));
  const target = truncateSummaryTextEvent(item.targetLabel || "未指定", 20);
  const resultSentence = toBlindSummaryResultSentenceEvent(item);
  const sourceText = toSummarySourceTextEvent(item.resultSource);

  if (detailMode === "minimal") {
    return `- 暗骰：${title}｜对象：${target}｜结果等级：${resultSentence}｜线索：${desc}`;
  }

  const skill = truncateSummaryTextEvent(item.skill, 20);
  const checkDice = truncateSummaryTextEvent(item.checkDice, 24);
  const difficultyText = item.difficulty ? `｜难度=${formatDifficultyLabelForSummaryEvent(item.difficulty)}` : "";
  const gradeText = item.resultGrade ? `｜分级=${formatGradeLabelForBlindSummaryEvent(item.resultGrade)}` : "";

  if (detailMode === "balanced") {
    return `- 暗骰：${title}｜对象：${target}｜检定：${skill} ${checkDice}${difficultyText}｜结果等级：${resultSentence}${gradeText}｜线索：${desc}`;
  }

  const timeLimit = truncateSummaryTextEvent(
    formatIsoDurationNaturalLanguageEvent(item.timeLimit || "none"),
    26
  );
  return `- 暗骰：${title}｜对象：${target}｜检定：${skill} ${checkDice}${difficultyText}｜来源：${sourceText}｜模式：${item.rollMode}｜时限：${timeLimit}｜结果等级：${resultSentence}${gradeText}｜线索：${desc}`;
}

/**
 * 功能：把结果等级转换为暗骰摘要中的中文分级标签。
 * @param grade 检定分级。
 * @returns 中文分级文本。
 */
function formatGradeLabelForBlindSummaryEvent(grade: RoundSummaryEventItemEvent["resultGrade"]): string {
  if (grade === "critical_success") return "大成功";
  if (grade === "partial_success") return "勉强成功";
  if (grade === "success") return "成功";
  if (grade === "failure") return "失败";
  if (grade === "critical_failure") return "大失败";
  return "未知";
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

  const publicLines: string[] = [];
  const blindLines: string[] = [];
  publicLines.push(deps.DICE_SUMMARY_BLOCK_START_Event);
  publicLines.push(
    `v=5 fmt=nl detail=${detailMode} window_rounds=${roundsWindow} included_rounds=${selected.length} include_outcome=${includeOutcomeInSummary ? "1" : "0"}`
  );
  blindLines.push(deps.DICE_BLIND_SUMMARY_BLOCK_START_Event);
  blindLines.push(
    `v=1 fmt=nl detail=${detailMode} window_rounds=${roundsWindow} included_rounds=${selected.length}`
  );
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

    if (publicItems.length > 0) {
      hasPublicContent = true;
      publicLines.push(
        `【第 ${i + 1} 轮 / roundId=${snapshot.roundId} / 关闭时间=${new Date(
          snapshot.closedAt
        ).toISOString()}】`
      );
      publicLines.push(`本轮事件数=${publicItems.length}，已结算=${publicRolledCount}，未结算=${publicUnresolved}`);
    }

    if (blindItems.length > 0) {
      hasBlindContent = true;
      blindLines.push(
        `【第 ${i + 1} 轮 / roundId=${snapshot.roundId} / 关闭时间=${new Date(
          snapshot.closedAt
        ).toISOString()}】`
      );
      blindLines.push(`本轮暗骰数=${blindItems.length}，已结算=${blindRolledCount}，未结算=${blindUnresolved}`);
    }

    const limitedPublicPerRound = publicItems.slice(0, deps.SUMMARY_MAX_EVENTS_Event);
    for (const item of limitedPublicPerRound) {
      if (emittedPublicEventLines >= deps.SUMMARY_MAX_TOTAL_EVENT_LINES_Event) {
        publicTruncatedByTotalLimit = true;
        break;
      }
      publicLines.push(buildSummaryEventNaturalLineByModeEvent(item, detailMode, includeOutcomeInSummary, settings));
      emittedPublicEventLines++;
    }

    const limitedBlindPerRound = blindItems.slice(0, deps.SUMMARY_MAX_EVENTS_Event);
    for (const item of limitedBlindPerRound) {
      if (emittedBlindEventLines >= deps.SUMMARY_MAX_TOTAL_EVENT_LINES_Event) {
        blindTruncatedByTotalLimit = true;
        break;
      }
      blindLines.push(buildBlindSummaryEventNaturalLineByModeEvent(item, detailMode));
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
