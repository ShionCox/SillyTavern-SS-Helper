import type { DiceOptions, DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  AdvantageStateEvent,
  BlindGuidanceStateEvent,
  BlindHistoryItemEvent,
  BlindGuidanceEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventOutcomeKindEvent,
  EventResultGradeEvent,
  EventRollRecordEvent,
  EventRollModeEvent,
  EventTimerStateEvent,
  InteractiveTriggerEvent,
  PendingResultGuidanceEvent,
  PendingRoundEvent,
  RollVisibilityEvent,
  TriggerPackRevealModeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import {
  applyStatusCommandsToMetaEvent,
  ensureActiveStatusesEvent,
  extractStatusCommandsAndCleanTextEvent,
  resolveStatusModifiersForSkillEvent,
  stripStatusTagsFromTextEvent,
} from "./statusEvent";
import {
  normalizeBlindGuidanceEvent,
  resolveNatStateEvent,
} from "./passiveBlindEvent";
import { resolveEventThresholdEvent, resolveEventTimeLimitByUrgencyEvent } from "./parserEvent";

const ADVANTAGE_NORMAL_Event: AdvantageStateEvent = "normal";
const AI_AUTO_EXPLODE_EVENT_LIMIT_PER_ROUND_Event = 1;
const loggedBlindOutcomeFallbackKeysEvent = new Set<string>();
/** 模块级暗骰状态追踪列表（纯运行时，不持久化；聊天切换时自动清空）。 */
let BLIND_HISTORY_RUNTIME_Event: BlindHistoryItemEvent[] = [];
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
  if (source === "timeout_auto_fail" || source === "skipped_manual_fail") {
    return { resultGrade: "failure", marginToDc };
  }
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

function resolveRecordVisibilityEvent(
  record: EventRollRecordEvent | null | undefined
): "public" | "blind" {
  if (!record) return "public";
  return record.visibility === "blind" || record.source === "blind_manual_roll"
    ? "blind"
    : "public";
}

/**
 * 功能：在暗骰缺少结构化 outcomes 分支时输出一次去重日志，提示当前已回退到默认后果。
 * @param event 当前事件定义。
 * @param record 当前结算记录。
 * @param branch 缺失的分支名称。
 * @returns 无返回值。
 */
function logBlindOutcomeFallbackOnceEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent | null | undefined,
  branch: "success" | "failure" | "explode"
): void {
  if (!record || resolveRecordVisibilityEvent(record) !== "blind") return;
  const key = [
    String(record.roundId ?? "").trim() || "_",
    String(event.sourceAssistantMsgId ?? "").trim() || "_",
    String(event.id ?? "").trim() || "_",
    branch,
  ].join(":");
  if (loggedBlindOutcomeFallbackKeysEvent.has(key)) return;
  loggedBlindOutcomeFallbackKeysEvent.add(key);
  logger.info(
    `[暗骰结果分支缺失] event=${String(event.id ?? "").trim() || "_"} branch=${branch} 已回退到默认后果文本`
  );
}

type RollVisualStatusEvent = "critical_success" | "critical_failure" | "partial_success" | "success" | "failure";

/**
 * 功能：把最终结算分级映射为 3D 动画使用的视觉状态。
 * @param resultGrade 最终结算分级。
 * @returns 视觉反馈状态。
 */
function resolveRollVisualStatusFromGradeEvent(resultGrade: EventResultGradeEvent): RollVisualStatusEvent {
  if (resultGrade === "critical_success") return "critical_success";
  if (resultGrade === "critical_failure") return "critical_failure";
  if (resultGrade === "partial_success") return "partial_success";
  if (resultGrade === "success") return "success";
  return "failure";
}

function normalizeBlindSkillNameEvent(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isBlindGuidanceActiveStateEvent(state: BlindGuidanceStateEvent | undefined): boolean {
  return !state || state === "queued";
}

function matchesBlindDedupScopeEvent(args: {
  existing: BlindGuidanceEvent;
  incoming: {
    roundId?: string;
    sourceFloorKey?: string | null;
  };
  settings: DicePluginSettingsEvent;
}): boolean {
  if (args.settings.blindDedupScope === "same_floor") {
    const existingFloorKey = String(args.existing.sourceFloorKey ?? "").trim();
    const incomingFloorKey = String(args.incoming.sourceFloorKey ?? "").trim();
    return !!existingFloorKey && existingFloorKey === incomingFloorKey;
  }
  const existingRoundId = String(args.existing.roundId ?? "").trim();
  const incomingRoundId = String(args.incoming.roundId ?? "").trim();
  return !!existingRoundId && existingRoundId === incomingRoundId;
}

export function parseAllowedBlindSkillsEvent(settings: DicePluginSettingsEvent): Set<string> {
  return new Set(
    String(settings.defaultBlindSkillsText ?? "")
      .split(/[\n,|]+/)
      .map((item) => normalizeBlindSkillNameEvent(item))
      .filter(Boolean)
  );
}

export function isBlindSkillAllowedEvent(
  skillName: string,
  settings: DicePluginSettingsEvent
): boolean {
  const normalized = normalizeBlindSkillNameEvent(skillName);
  if (!normalized) return false;
  return parseAllowedBlindSkillsEvent(settings).has(normalized);
}

export function countBlindRollsInRoundEvent(round: PendingRoundEvent | null | undefined): number {
  if (!round || !Array.isArray(round.rolls)) return 0;
  return round.rolls.filter((record) => resolveRecordVisibilityEvent(record) === "blind").length;
}

export function countQueuedBlindGuidanceInRoundEvent(
  meta: DiceMetaEvent,
  roundId: string | undefined
): number {
  if (!roundId) return 0;
  const queue = Array.isArray(meta.pendingBlindGuidanceQueue) ? meta.pendingBlindGuidanceQueue : [];
  return queue.filter((item) =>
    item?.roundId === roundId
    && item?.consumed !== true
    && isBlindGuidanceActiveStateEvent(item?.state)
  ).length;
}

export function buildBlindGuidanceDedupKeyEvent(input: {
  roundId?: string;
  skill?: string;
  eventId?: string;
  targetLabel?: string;
  sourceFloorKey?: string | null;
  sourceId?: string;
  origin?: BlindGuidanceEvent["origin"];
}, settings: Pick<DicePluginSettingsEvent, "blindDedupScope">): string {
  const roundId = String(input.roundId ?? "").trim() || "_";
  const skill = normalizeBlindSkillNameEvent(input.skill ?? "") || "_";
  const eventId = String(input.eventId ?? "").trim();
  const targetLabel = normalizeBlindSkillNameEvent(input.targetLabel ?? "") || "_";
  const sourceFloorKey = String(input.sourceFloorKey ?? "").trim() || "_";
  const sourceId = String(input.sourceId ?? "").trim() || "_";
  const origin = input.origin ?? "event_blind";
  const scopeKey = settings.blindDedupScope === "same_floor" ? sourceFloorKey : roundId;

  if (origin === "event_blind" && eventId) {
    return `event:${scopeKey}:${eventId}`;
  }
  if (origin === "interactive_blind") {
    return `interactive:${scopeKey}:${sourceId}`;
  }
  return `slash:${scopeKey}:${skill}:${targetLabel}`;
}

export function pruneExpiredBlindGuidanceQueueEvent(
  meta: DiceMetaEvent,
  now = Date.now(),
  autoArchiveEnabled = false,
  autoArchiveAfterHours = 24
): boolean {
  const queue = Array.isArray(meta.pendingBlindGuidanceQueue) ? meta.pendingBlindGuidanceQueue : [];
  const openRoundId = meta.pendingRound?.status === "open" ? meta.pendingRound.roundId : "";
  const nextQueue = queue.map((item) => {
    if (!item) return item;
    if (!isBlindGuidanceActiveStateEvent(item.state)) return item;
    if (item.expiresAt != null && item.expiresAt <= now) {
      updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
        state: "expired",
      });
      return {
        ...item,
        state: "expired" as BlindGuidanceStateEvent,
      };
    }
    if (item.roundId && (!openRoundId || item.roundId !== openRoundId)) {
      updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
        state: "invalidated",
        invalidatedAt: item.invalidatedAt ?? now,
      });
      return {
        ...item,
        state: "invalidated" as BlindGuidanceStateEvent,
        invalidatedAt: item.invalidatedAt ?? now,
      };
    }
    return item;
  });
  meta.pendingBlindGuidanceQueue = nextQueue;
  let changed = JSON.stringify(nextQueue) !== JSON.stringify(queue);
  if (autoArchiveEnabled) {
    const archiveBeforeTime = now - Math.max(1, Math.floor(autoArchiveAfterHours)) * 60 * 60 * 1000;
    changed = archiveBlindHistoryItemsEvent(meta, archiveBeforeTime) || changed;
  }
  return changed;
}

export function canEnqueueBlindGuidanceEvent(args: {
  meta: DiceMetaEvent;
  settings: DicePluginSettingsEvent;
  round: PendingRoundEvent | null;
  dedupeKey: string;
  sourceFloorKey?: string | null;
  origin: BlindGuidanceEvent["origin"];
  now?: number;
}): { ok: boolean; reason?: string } {
  const now = args.now ?? Date.now();
  pruneExpiredBlindGuidanceQueueEvent(args.meta, now);
  const round = args.round;
  if (!round || round.status !== "open" || !Array.isArray(round.sourceAssistantMsgIds) || round.sourceAssistantMsgIds.length <= 0) {
    return {
      ok: false,
      reason: "当前没有可绑定的最新轮次，暗骰不会进入后续叙事。请等待新一轮事件，或改用普通 /roll。",
    };
  }

  const roundBlindCount =
    countBlindRollsInRoundEvent(round)
    + countQueuedBlindGuidanceInRoundEvent(args.meta, round.roundId);
  if (roundBlindCount >= Math.max(1, Number(args.settings.maxBlindRollsPerRound) || 1)) {
    return {
      ok: false,
      reason: "本轮暗骰次数已达到上限，新的暗骰不会再进入叙事引导。",
    };
  }

  const queue = Array.isArray(args.meta.pendingBlindGuidanceQueue) ? args.meta.pendingBlindGuidanceQueue : [];
  const activeQueue = queue.filter((item) => item && item.consumed !== true && isBlindGuidanceActiveStateEvent(item.state));
  if (activeQueue.length >= Math.max(1, Number(args.settings.maxQueuedBlindGuidance) || 1)) {
    return {
      ok: false,
      reason: "待处理暗骰队列已满，请先推进对话消费已有暗骰。",
    };
  }

  if (args.settings.enableBlindGuidanceDedup) {
    const duplicated = activeQueue.find((item) => {
      if (!item || item.consumed) return false;
      if (!matchesBlindDedupScopeEvent({
        existing: item,
        incoming: {
          roundId: round?.roundId,
          sourceFloorKey: args.sourceFloorKey,
        },
        settings: args.settings,
      })) {
        return false;
      }
      return item.dedupeKey === args.dedupeKey;
    });
    if (duplicated) {
      logger.info(
        `[暗骰去重] 已拒绝重复暗骰 scope=${args.settings.blindDedupScope} key=${args.dedupeKey} existing=${duplicated.rollId}`
      );
      return {
        ok: false,
        reason: "相同内容的暗骰已存在，本轮无需重复暗骰。",
      };
    }
  }

  return { ok: true };
}

export function enqueueBlindGuidanceSafeEvent(args: {
  meta: DiceMetaEvent;
  settings: DicePluginSettingsEvent;
  round: PendingRoundEvent | null;
  item: BlindGuidanceEvent;
  now?: number;
}): { ok: boolean; reason?: string } {
  const now = args.now ?? Date.now();
  const round = args.round;
  const sourceFloorKey =
    args.item.sourceFloorKey
    || buildAssistantFloorKeyEvent(String(args.item.sourceAssistantMsgId ?? ""))
    || null;
  const dedupeKey =
    args.item.dedupeKey
    || buildBlindGuidanceDedupKeyEvent({
      roundId: args.item.roundId || round?.roundId,
      skill: args.item.skill,
      eventId: args.item.eventId,
      targetLabel: args.item.targetLabel,
      sourceFloorKey,
      sourceId: args.item.sourceId,
      origin: args.item.origin,
    }, args.settings);
  const allowed = canEnqueueBlindGuidanceEvent({
    meta: args.meta,
    settings: args.settings,
    round,
    dedupeKey,
    sourceFloorKey,
    origin: args.item.origin,
    now,
  });
  if (!allowed.ok) return allowed;

  const queue = ensureBlindGuidanceQueueEvent(args.meta);
  const ttlMs = Math.max(30, Math.floor(Number(args.settings.blindGuidanceTtlSeconds) || 180)) * 1000;
  queue.push({
    ...args.item,
    roundId: args.item.roundId || round?.roundId,
    sourceFloorKey: sourceFloorKey || undefined,
    origin: args.item.origin || "event_blind",
    createdAt: args.item.createdAt ?? now,
    expiresAt: args.item.expiresAt ?? (now + ttlMs),
    consumed: false,
    state: "queued",
    dedupeKey,
  });
  return { ok: true };
}

/**
 * 功能：按原 3D 骰子流程播放检定视觉反馈。
 * @param expr 骰子表达式。
 * @param status 视觉反馈状态。
 * @returns 无返回值。
 */
async function playRollResultAnimationEvent(status: RollVisualStatusEvent): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    const { playRollAnimation } = await import("../core/diceBox");
    await playRollAnimation(status);
  } catch (error) {
    logger.warn("检定结果样式弹出失败，已继续完成检定", error);
  }
}

/**
 * 功能：在轮次实例失效时，仅执行 3D 骰子的隐藏收尾，避免旧骰盒停留在界面上。
 * @param result 当前刚完成掷骰的结果。
 * @returns 无返回值。
 */
async function cleanupStale3DRollPresentationEvent(result: DiceResult): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    if (result.sourceEngine !== "dice_box") return;
    const { hideDiceBoxPresentationEvent } = await import("../core/diceBox");
    await hideDiceBoxPresentationEvent();
  } catch (error) {
    logger.warn("旧轮次 3D 骰子收尾失败，已继续中止旧结果回写", error);
  }
}

function shouldPlay3DRollAnimationEvent(settings: DicePluginSettingsEvent, result: DiceResult): boolean {
  return Boolean(settings.enable3DDiceBox && result.sourceEngine === "dice_box");
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

function ensureBlindGuidanceQueueEvent(meta: DiceMetaEvent): BlindGuidanceEvent[] {
  if (!Array.isArray(meta.pendingBlindGuidanceQueue)) {
    meta.pendingBlindGuidanceQueue = [];
  }
  return meta.pendingBlindGuidanceQueue;
}

/**
 * 功能：确保暗骰历史列表存在。
 * 参数：
 *   meta：运行时骰子元数据。
 * 返回：
 *   BlindHistoryItemEvent[]：可写入的暗骰历史列表。
 */
function ensureBlindHistoryEvent(_meta: DiceMetaEvent): BlindHistoryItemEvent[] {
  return BLIND_HISTORY_RUNTIME_Event;
}

/**
 * 功能：清空模块级暗骰运行时历史列表（聊天切换时调用）。
 */
export function clearBlindHistoryRuntimeEvent(): void {
  BLIND_HISTORY_RUNTIME_Event = [];
}

/**
 * 功能：规范化暗骰历史条目，保证只保留展示所需的安全字段。
 * 参数：
 *   input：原始暗骰历史条目。
 * 返回：
 *   BlindHistoryItemEvent：规范化后的暗骰历史条目。
 */
export function normalizeBlindHistoryItemEvent(input: BlindHistoryItemEvent): BlindHistoryItemEvent {
  const sourceText = input.source;
  const source =
    sourceText === "manual_roll"
    || sourceText === "blind_manual_roll"
    || sourceText === "ai_auto_roll"
    || sourceText === "passive_check"
    || sourceText === "timeout_auto_fail"
      ? sourceText
      : "blind_manual_roll";
  return {
    rollId: String(input.rollId ?? "").trim(),
    roundId: String(input.roundId ?? "").trim() || undefined,
    eventId: String(input.eventId ?? "").trim() || "blind_history",
    eventTitle: String(input.eventTitle ?? "").trim() || "暗骰检定",
    skill: String(input.skill ?? "").trim() || "未指定",
    diceExpr: String(input.diceExpr ?? "").trim() || "1d20",
    targetLabel: String(input.targetLabel ?? "").trim() || "未指定",
    resultGrade:
      input.resultGrade === "critical_success"
      || input.resultGrade === "partial_success"
      || input.resultGrade === "success"
      || input.resultGrade === "failure"
      || input.resultGrade === "critical_failure"
        ? input.resultGrade
        : undefined,
    rolledAt: Number.isFinite(Number(input.rolledAt)) ? Number(input.rolledAt) : Date.now(),
    source,
    origin:
      input.origin === "slash_broll" || input.origin === "event_blind" || input.origin === "interactive_blind"
        ? input.origin
        : undefined,
    sourceAssistantMsgId: String(input.sourceAssistantMsgId ?? "").trim() || undefined,
    sourceFloorKey: String(input.sourceFloorKey ?? "").trim() || undefined,
    note: String(input.note ?? "").trim() || undefined,
    createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : undefined,
    expiresAt: Number.isFinite(Number(input.expiresAt)) ? Number(input.expiresAt) : undefined,
    consumedAt: Number.isFinite(Number(input.consumedAt)) ? Number(input.consumedAt) : undefined,
    invalidatedAt: Number.isFinite(Number(input.invalidatedAt)) ? Number(input.invalidatedAt) : undefined,
    archivedAt: Number.isFinite(Number(input.archivedAt)) ? Number(input.archivedAt) : undefined,
    dedupeKey: String(input.dedupeKey ?? "").trim() || undefined,
    revealMode: input.revealMode === "instant" ? "instant" : "delayed",
    state:
      input.state === "consumed"
      || input.state === "expired"
      || input.state === "invalidated"
      || input.state === "archived"
        ? input.state
        : "queued",
  };
}

/**
 * 功能：根据暗骰引导条目推导其当前生命周期状态。
 * 参数：
 *   item：暗骰引导条目。
 *   now：当前时间戳。
 * 返回：
 *   BlindGuidanceStateEvent：当前生命周期状态。
 */
export function resolveBlindGuidanceStateEvent(
  item: BlindGuidanceEvent | BlindHistoryItemEvent | null | undefined,
  now = Date.now()
): BlindGuidanceStateEvent {
  if (!item) return "invalidated";
  if (item.state === "consumed" || item.state === "expired" || item.state === "invalidated" || item.state === "archived") {
    return item.state;
  }
  if (Number.isFinite(Number(item.expiresAt)) && Number(item.expiresAt) <= now) {
    return "expired";
  }
  if (Number.isFinite(Number(item.invalidatedAt))) {
    return "invalidated";
  }
  if (Number.isFinite(Number(item.consumedAt))) {
    return "consumed";
  }
  if (Number.isFinite(Number(item.archivedAt))) {
    return "archived";
  }
  return "queued";
}

/**
 * 功能：把暗骰生命周期状态转换为可读中文标签。
 * 参数：
 *   state：暗骰生命周期状态。
 * 返回：
 *   string：用于界面展示的中文状态标签。
 */
export function formatBlindGuidanceStateLabelEvent(state: BlindGuidanceStateEvent): string {
  if (state === "consumed") return "已体现";
  if (state === "expired") return "已过期";
  if (state === "invalidated") return "已失效";
  if (state === "archived") return "已归档";
  return "待体现";
}

/**
 * 功能：根据产品设置把暗骰状态转换为玩家可读文案。
 * 参数：
 *   state：暗骰生命周期状态。
 *   displayConsumedAsNarrativeApplied：是否把 consumed 显示为“已体现”。
 * 返回：
 *   string：玩家侧显示文本。
 */
export function formatBlindHistoryDisplayStateEvent(
  state: BlindGuidanceStateEvent,
  displayConsumedAsNarrativeApplied = true,
  revealMode: TriggerPackRevealModeEvent = "delayed"
): string {
  if (state === "consumed") {
    if (revealMode === "instant") return "已即时体现";
    return displayConsumedAsNarrativeApplied ? "已体现" : "已消费";
  }
  return formatBlindGuidanceStateLabelEvent(state);
}

/**
 * 功能：把结果等级转换为适合玩家阅读的中文标签。
 * 参数：
 *   grade：内部结果等级。
 *   visibility：检定可见性。
 * 返回：
 *   string：不泄露点数的结果等级文案。
 */
export function formatResultGradeLabelEvent(
  grade: EventResultGradeEvent | null | undefined,
  visibility: RollVisibilityEvent | "public" = "public"
): string {
  const prefix = visibility === "blind" ? "暗骰" : "检定";
  if (grade === "critical_success") return `${prefix}大成功`;
  if (grade === "partial_success") return `${prefix}勉强成功`;
  if (grade === "success") return `${prefix}成功`;
  if (grade === "critical_failure") return `${prefix}大失败`;
  if (grade === "failure") return `${prefix}失败`;
  return visibility === "blind" ? "暗骰已处理" : "检定已完成";
}

/**
 * 功能：按 rollId 同步暗骰历史条目的生命周期状态。
 * 参数：
 *   meta：运行时骰子元数据。
 *   rollId：暗骰记录 ID。
 *   patch：需要写回历史条目的字段。
 * 返回：
 *   void
 */
export function updateBlindHistoryStateByRollIdEvent(
  meta: DiceMetaEvent,
  rollId: string,
  patch: Partial<BlindHistoryItemEvent>
): void {
  const list = ensureBlindHistoryEvent(meta);
  const normalizedRollId = String(rollId ?? "").trim();
  if (!normalizedRollId) return;
  const index = list.findIndex((item) => String(item?.rollId ?? "").trim() === normalizedRollId);
  if (index < 0) return;
  list[index] = normalizeBlindHistoryItemEvent({
    ...list[index],
    ...patch,
  });
}

/**
 * 功能：按时间阈值把旧的暗骰历史自动归档。
 * 参数：
 *   meta：运行时骰子元数据。
 *   beforeTime：归档阈值时间戳。
 * 返回：
 *   boolean：若有条目被归档则返回 true。
 */
export function archiveBlindHistoryItemsEvent(
  meta: DiceMetaEvent,
  beforeTime: number
): boolean {
  const list = ensureBlindHistoryEvent(meta);
  let changed = false;
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    const state = resolveBlindGuidanceStateEvent(item, beforeTime);
    if (state === "queued" || state === "archived") continue;
    const anchorTime = Number(item.consumedAt ?? item.invalidatedAt ?? item.expiresAt ?? item.rolledAt ?? 0);
    if (!Number.isFinite(anchorTime) || anchorTime <= 0 || anchorTime > beforeTime) continue;
    list[index] = normalizeBlindHistoryItemEvent({
      ...item,
      state: "archived",
      archivedAt: Number(item.archivedAt) || beforeTime,
    });
    changed = true;
  }
  return changed;
}

/**
 * 功能：向暗骰历史中追加一条新记录，并限制列表长度。
 * 参数：
 *   meta：运行时骰子元数据。
 *   item：待写入的暗骰历史条目。
 * 返回：
 *   void
 */
function appendBlindHistoryItemEvent(meta: DiceMetaEvent, item: BlindHistoryItemEvent): void {
  const list = ensureBlindHistoryEvent(meta);
  const normalized = normalizeBlindHistoryItemEvent(item);
  if (!normalized.rollId) return;
  const existedIndex = list.findIndex((entry) => entry?.rollId === normalized.rollId);
  if (existedIndex >= 0) {
    list[existedIndex] = normalized;
  } else {
    list.push(normalized);
  }
  if (list.length > 200) {
    list.splice(0, list.length - 200);
  }
}

/**
 * 功能：把一条暗骰历史写入运行时列表。
 * 参数：
 *   meta：运行时骰子元数据。
 *   item：暗骰历史条目。
 * 返回：
 *   void
 */
function appendBlindHistoryItemAndPersistEvent(
  meta: DiceMetaEvent,
  item: BlindHistoryItemEvent,
): void {
  const normalized = normalizeBlindHistoryItemEvent(item);
  appendBlindHistoryItemEvent(meta, normalized);
}

/**
 * 功能：根据暗骰记录写入暗骰历史列表。
 * 参数：
 *   meta：运行时骰子元数据。
 *   event：对应的事件定义。
 *   record：暗骰记录。
 *   origin：暗骰来源类型。
 * 返回：
 *   void
 */
export function appendBlindHistoryFromRecordEvent(
  meta: DiceMetaEvent,
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent,
  origin: BlindHistoryItemEvent["origin"] = "event_blind",
  revealMode: TriggerPackRevealModeEvent = "delayed",
): void {
  if (record.visibility !== "blind" && record.source !== "blind_manual_roll") return;
  appendBlindHistoryItemAndPersistEvent(meta, {
    rollId: record.rollId,
    roundId: record.roundId,
    eventId: event.id,
    eventTitle: event.title,
    skill: event.skill,
    diceExpr: record.diceExpr,
    targetLabel: record.targetLabelUsed || event.targetLabel,
    resultGrade: record.resultGrade,
    rolledAt: record.rolledAt,
    source: record.source,
    origin,
    sourceAssistantMsgId: String(record.sourceAssistantMsgId || event.sourceAssistantMsgId || "").trim() || undefined,
    sourceFloorKey: buildAssistantFloorKeyEvent(String(record.sourceAssistantMsgId || event.sourceAssistantMsgId || "").trim()) || undefined,
    revealMode,
    state: revealMode === "instant" ? "consumed" : "queued",
    consumedAt: revealMode === "instant" ? record.rolledAt : undefined,
  });
}

/**
 * 功能：根据暗骰引导写入暗骰历史列表，供 `/broll` 等无事件卡来源复用。
 * 参数：
 *   meta：运行时骰子元数据。
 *   item：规范化后的暗骰引导条目。
 * 返回：
 *   void
 */
export function appendBlindHistoryFromGuidanceEvent(
  meta: DiceMetaEvent,
  item: BlindGuidanceEvent,
): void {
  appendBlindHistoryItemAndPersistEvent(meta, {
    rollId: item.rollId,
    roundId: item.roundId,
    eventId: item.eventId,
    eventTitle: item.eventTitle,
    skill: item.skill,
    diceExpr: item.diceExpr,
    targetLabel: item.targetLabel,
    resultGrade: item.resultGrade,
    rolledAt: item.rolledAt,
    source: item.source,
    origin: item.origin,
    sourceAssistantMsgId: item.sourceAssistantMsgId,
    sourceFloorKey: item.sourceFloorKey,
    note: item.note,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    consumedAt: item.consumedAt,
    invalidatedAt: item.invalidatedAt,
    archivedAt: item.archivedAt,
    dedupeKey: item.dedupeKey,
    state: resolveBlindGuidanceStateEvent(item),
  });
}

function enqueueBlindGuidanceFromRecordEvent(
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent,
  round: PendingRoundEvent,
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent
): void {
  if (record.visibility !== "blind") return;
  const createdAt = Date.now();
  const sourceAssistantMsgId = String(
    record.sourceAssistantMsgId || event.sourceAssistantMsgId || ""
  ).trim();
  const enqueueResult = enqueueBlindGuidanceSafeEvent({
    meta,
    settings,
    round,
    item: normalizeBlindGuidanceEvent({
      rollId: record.rollId,
      roundId: record.roundId,
      eventId: event.id,
      eventTitle: event.title,
      skill: event.skill,
      diceExpr: record.diceExpr,
      total: Number(record.result.total) || 0,
      success: record.success,
      resultGrade: record.resultGrade,
      natState: record.natState ?? "none",
      targetLabel: record.targetLabelUsed || event.targetLabel,
      rolledAt: record.rolledAt,
      source: record.source,
      sourceAssistantMsgId: sourceAssistantMsgId || undefined,
      sourceFloorKey: sourceAssistantMsgId ? buildAssistantFloorKeyEvent(sourceAssistantMsgId) || undefined : undefined,
      origin: "event_blind",
      createdAt,
      consumed: false,
      dedupeKey: buildBlindGuidanceDedupKeyEvent({
        roundId: record.roundId,
        eventId: event.id,
        skill: event.skill,
        targetLabel: record.targetLabelUsed || event.targetLabel,
        sourceFloorKey: sourceAssistantMsgId ? buildAssistantFloorKeyEvent(sourceAssistantMsgId) || undefined : undefined,
        origin: "event_blind",
      }, settings),
    }),
    now: createdAt,
  });
  if (!enqueueResult.ok && enqueueResult.reason) {
    logger.warn(`[暗骰入队已拒绝] event=${event.id} reason=${enqueueResult.reason}`);
  }
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
  if (settings.enableExplodeOutcomeBranch && explosionTriggered && !(outcomes?.explode && outcomes.explode.trim())) {
    logBlindOutcomeFallbackOnceEvent(event, record, "explode");
  }
  if (record?.success === true) {
    if (!(outcomes?.success && outcomes.success.trim())) {
      logBlindOutcomeFallbackOnceEvent(event, record, "success");
    }
    return outcomes?.success?.trim() || "判定成功，剧情向有利方向推进。";
  }
  if (
    record?.success === false
    || record?.source === "timeout_auto_fail"
    || record?.source === "skipped_manual_fail"
  ) {
    if (!(outcomes?.failure && outcomes.failure.trim())) {
      logBlindOutcomeFallbackOnceEvent(event, record, "failure");
    }
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
  const sourceAssistantMsgId = String(record.sourceAssistantMsgId || event.sourceAssistantMsgId || "").trim() || undefined;
  return applyStatusCommandsToMetaEvent(
    meta,
    resolved.commands,
    "ai_tag",
    Date.now(),
    {
      sourceAssistantMsgId,
      sourceFloorKey: sourceAssistantMsgId ? buildAssistantFloorKeyEvent(sourceAssistantMsgId) || undefined : undefined,
    }
  );
}

/**
 * 功能：判断某个生效状态是否来源于指定助手楼层。
 * @param status 当前生效状态。
 * @param assistantMsgId 需要失效的助手消息标识。
 * @returns boolean：来源匹配时返回 true。
 */
function isActiveStatusFromAssistantFloorEvent(
  status: ActiveStatusEvent,
  assistantMsgId: string
): boolean {
  if (!status) return false;
  const sourceAssistantMsgId = String(status.sourceAssistantMsgId ?? "").trim();
  if (sourceAssistantMsgId) {
    return isSameAssistantFloorEvent(sourceAssistantMsgId, assistantMsgId);
  }
  const sourceFloorKey = String(status.sourceFloorKey ?? "").trim();
  if (!sourceFloorKey) return false;
  const assistantFloorKey = buildAssistantFloorKeyEvent(assistantMsgId);
  return Boolean(assistantFloorKey) && sourceFloorKey === assistantFloorKey;
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

/**
 * 功能：判断单个事件是否已经结算结束。
 * @param event 事件定义。
 * @returns 已有关闭时间时返回 true，否则返回 false。
 */
function isEventClosedEvent(event: DiceEventSpecEvent | null | undefined): boolean {
  return Number.isFinite(Number(event?.closedAt)) && Number(event?.closedAt) > 0;
}

/**
 * 功能：按当前事件关闭状态同步整轮开关状态。
 * @param round 当前轮次。
 * @returns boolean：轮次状态发生变化时返回 true。
 */
function syncRoundClosedStateFromEventsEvent(round: PendingRoundEvent): boolean {
  const events = Array.isArray(round.events) ? round.events : [];
  const shouldClose = events.length > 0 && events.every((event) => isEventClosedEvent(event));
  const nextStatus: PendingRoundEvent["status"] = shouldClose ? "closed" : "open";
  if (round.status === nextStatus) return false;
  round.status = nextStatus;
  return true;
}

/**
 * 功能：在事件结算完成后立即停止该事件的倒计时。
 * 参数：
 *   round：当前轮次。
 *   eventId：已结算事件标识。
 *   settledAt：结算时间。
 * 返回：
 *   void：无返回值。
 */
function settleEventTimerEvent(
  round: PendingRoundEvent,
  eventId: string,
  settledAt: number
): void {
  const timers = ensureEventTimerIndexEvent(round);
  const timer = timers[eventId];
  if (!timer) return;
  timer.deadlineAt = null;
  timer.expiredAt = settledAt;
}

/**
 * 功能：从助手消息标识中提取稳定的楼层键，忽略末尾内容哈希。
 * @param assistantMsgId 完整的助手消息标识。
 * @returns 稳定楼层键；无法解析时返回 `null`。
 */
export function buildAssistantFloorKeyEvent(assistantMsgId: string): string | null {
  const normalized = String(assistantMsgId ?? "").trim();
  if (!normalized) return null;
  const parts = normalized.split(":");
  if (parts.length < 3) return null;
  const prefix = parts[0];
  const idOrIndex = parts[1];
  if (!prefix || !idOrIndex) return null;
  if (prefix !== "assistant" && prefix !== "assistant_ts" && prefix !== "assistant_idx") return null;
  return `${prefix}:${idOrIndex}`;
}

/**
 * 功能：判断两个助手消息标识是否指向同一个楼层。
 * @param left 左侧助手消息标识。
 * @param right 右侧助手消息标识。
 * @returns 若属于同一楼层则返回 `true`，否则返回 `false`。
 */
export function isSameAssistantFloorEvent(left: string, right: string): boolean {
  const leftFloorKey = buildAssistantFloorKeyEvent(left);
  const rightFloorKey = buildAssistantFloorKeyEvent(right);
  return !!leftFloorKey && leftFloorKey === rightFloorKey;
}

export interface InvalidatePendingRoundFloorDepsEvent {
  getDiceMetaEvent: () => DiceMetaEvent;
  saveMetadataSafeEvent: () => void;
}

/**
 * 功能：按楼层清除当前未归档轮次中的事件、掷骰记录与计时器。
 * @param assistantMsgId 当前楼层对应的助手消息标识。
 * @param deps 楼层失效依赖。
 * @returns 若实际清除了任意状态则返回 `true`，否则返回 `false`。
 */
export function invalidatePendingRoundFloorEvent(
  assistantMsgId: string,
  deps: InvalidatePendingRoundFloorDepsEvent
): boolean {
  const floorKey = buildAssistantFloorKeyEvent(assistantMsgId);
  if (!floorKey) return false;

  const meta = deps.getDiceMetaEvent();
  const round = meta.pendingRound;
  const now = Date.now();
  const statuses = ensureActiveStatusesEvent(meta);
  const nextStatuses = statuses.filter((item) => !isActiveStatusFromAssistantFloorEvent(item, assistantMsgId));
  const statusesChanged = nextStatuses.length !== statuses.length;
  if (statusesChanged) {
    meta.activeStatuses = nextStatuses;
  }
  const history = ensureBlindHistoryEvent(meta);
  let historyChanged = false;
  for (let index = 0; index < history.length; index += 1) {
    const item = history[index];
    if (!item?.sourceAssistantMsgId) continue;
    if (!isSameAssistantFloorEvent(item.sourceAssistantMsgId, assistantMsgId)) continue;
    const nextItem = normalizeBlindHistoryItemEvent({
      ...item,
      state: "invalidated",
      invalidatedAt: Number(item.invalidatedAt) || now,
    });
    if (JSON.stringify(nextItem) === JSON.stringify(item)) continue;
    history[index] = nextItem;
    historyChanged = true;
  }
  if (!round) {
    if (historyChanged || statusesChanged) {
      deps.saveMetadataSafeEvent();
    }
    return historyChanged || statusesChanged;
  }

  const removedEventIds = new Set<string>();
  const nextEvents = round.events.filter((event) => {
    if (!event?.sourceAssistantMsgId) return true;
    if (!isSameAssistantFloorEvent(event.sourceAssistantMsgId, assistantMsgId)) return true;
    removedEventIds.add(event.id);
    return false;
  });

  const nextRolls = round.rolls.filter((record) => {
    if (record?.sourceAssistantMsgId) {
      return !isSameAssistantFloorEvent(record.sourceAssistantMsgId, assistantMsgId);
    }
    return !removedEventIds.has(record?.eventId ?? "");
  });

  const nextSourceAssistantMsgIds = round.sourceAssistantMsgIds.filter(
    (item) => !isSameAssistantFloorEvent(item, assistantMsgId)
  );

  const eventTimers = ensureEventTimerIndexEvent(round);
  let timerChanged = false;
  for (const eventId of removedEventIds) {
    if (!Object.prototype.hasOwnProperty.call(eventTimers, eventId)) continue;
    delete eventTimers[eventId];
    timerChanged = true;
  }

  const blindQueue = Array.isArray(meta.pendingBlindGuidanceQueue) ? meta.pendingBlindGuidanceQueue : [];
  const nextBlindQueue = blindQueue.map((item) => {
    if (!item?.sourceAssistantMsgId) return item;
    if (!isSameAssistantFloorEvent(item.sourceAssistantMsgId, assistantMsgId)) return item;
    updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
      state: "invalidated",
      invalidatedAt: now,
    });
    return {
      ...item,
      state: "invalidated" as const,
      invalidatedAt: now,
    };
  });

  const resultGuidanceQueue = Array.isArray(meta.pendingResultGuidanceQueue) ? meta.pendingResultGuidanceQueue : [];
  const nextResultGuidanceQueue = resultGuidanceQueue.filter((item) => !removedEventIds.has(item?.eventId ?? ""));

  const changed =
    nextEvents.length !== round.events.length
    || nextRolls.length !== round.rolls.length
    || nextSourceAssistantMsgIds.length !== round.sourceAssistantMsgIds.length
    || timerChanged
    || JSON.stringify(nextBlindQueue) !== JSON.stringify(blindQueue)
    || nextResultGuidanceQueue.length !== resultGuidanceQueue.length
    || historyChanged
    || statusesChanged;

  if (!changed) return false;

  round.events = nextEvents;
  round.rolls = nextRolls;
  round.sourceAssistantMsgIds = nextSourceAssistantMsgIds;
  round.sourceFloorKey =
    nextSourceAssistantMsgIds.length > 0
      ? buildAssistantFloorKeyEvent(nextSourceAssistantMsgIds[nextSourceAssistantMsgIds.length - 1]) || undefined
      : undefined;
  meta.pendingBlindGuidanceQueue = nextBlindQueue;
  meta.pendingResultGuidanceQueue = nextResultGuidanceQueue;
  if (isPendingRoundEmptyEvent(round)) {
    meta.pendingRound = undefined;
  }
  deps.saveMetadataSafeEvent();
  return true;
}

export interface EnsureRoundEventTimersSyncedDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  resolveEventTargetEvent: (
    raw: any,
    scope?: DiceEventSpecEvent["scope"]
  ) => { targetType: DiceEventSpecEvent["targetType"]; targetName?: string; targetLabel: string };
  resolveEventTimeLimitByUrgencyEvent: typeof resolveEventTimeLimitByUrgencyEvent;
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
    const resolvedTimeLimit = deps.resolveEventTimeLimitByUrgencyEvent({
      rollMode: event.rollMode,
      urgency: event.urgency,
      settings,
    });
    event.urgency = resolvedTimeLimit.urgency;
    event.timeLimitMs = resolvedTimeLimit.timeLimitMs;
    event.timeLimit = resolvedTimeLimit.timeLimit;

    let timer = timers[event.id];
    const existingRecord = getLatestRollRecordForEvent(round, event.id);
    if (!timer) {
      const offeredAt =
        typeof event.offeredAt === "number" && Number.isFinite(event.offeredAt) ? event.offeredAt : now;
      const deadlineAt = resolvedTimeLimit.timeLimitMs == null ? null : offeredAt + resolvedTimeLimit.timeLimitMs;
      timer = { offeredAt, deadlineAt };
      timers[event.id] = timer;
    }

    if (!existingRecord) {
      timer.deadlineAt = resolvedTimeLimit.timeLimitMs == null ? null : timer.offeredAt + resolvedTimeLimit.timeLimitMs;
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

/**
 * 功能：创建新的未归档轮次实例，并附带并发失效保护所需的内部标识。
 * @param deps 创建轮次所需的时间与 ID 依赖。
 * @param sourceFloorKey 当前轮次绑定的楼层键。
 * @returns PendingRoundEvent：全新的未归档轮次实例。
 */
function createPendingRoundInstanceEvent(
  deps: EnsureOpenPendingRoundDepsEvent,
  sourceFloorKey?: string
): PendingRoundEvent {
  const currentNow = deps.now ? deps.now() : Date.now();
  return {
    roundId: deps.createIdEvent("round"),
    instanceToken: deps.createIdEvent("rinst"),
    status: "open",
    events: [],
    rolls: [],
    eventTimers: {},
    sourceAssistantMsgIds: [],
    sourceFloorKey,
    openedAt: currentNow,
  };
}

/**
 * 功能：判断未归档轮次是否已经清空到可以直接移除。
 * @param round 当前未归档轮次。
 * @returns boolean：当事件、结果与来源都为空时返回 true。
 */
function isPendingRoundEmptyEvent(round: PendingRoundEvent | null | undefined): boolean {
  if (!round) return true;
  return (
    (!Array.isArray(round.events) || round.events.length <= 0)
    && (!Array.isArray(round.rolls) || round.rolls.length <= 0)
    && (!Array.isArray(round.sourceAssistantMsgIds) || round.sourceAssistantMsgIds.length <= 0)
  );
}

const PENDING_ROUND_PROCESSING_LOCK_MAX_AGE_MS_Event = 15_000;

/**
 * 功能：判断未归档轮次是否仍处于助手后处理保护期，避免被新的 prompt 钩子提前归档。
 * @param round 当前未归档轮次。
 * @param now 当前时间戳。
 * @param maxAgeMs 保护锁最大存活时间，默认 15 秒。
 * @returns boolean：锁仍有效时返回 true。
 */
export function isPendingRoundProcessingLockedEvent(
  round: PendingRoundEvent | null | undefined,
  now = Date.now(),
  maxAgeMs = PENDING_ROUND_PROCESSING_LOCK_MAX_AGE_MS_Event
): boolean {
  const lock = round?.processingLock;
  if (!lock || lock.reason !== "assistant_finalize") return false;
  const acquiredAt = Number(lock.acquiredAt);
  if (!Number.isFinite(acquiredAt) || acquiredAt <= 0) return false;
  return now - acquiredAt <= Math.max(1000, Math.floor(maxAgeMs));
}

/**
 * 功能：判断当前元数据里的未归档轮次是否仍然是指定的有效实例。
 * @param meta 当前骰子元数据。
 * @param expectedRoundId 期望的轮次 ID。
 * @param expectedInstanceToken 期望的实例令牌。
 * @param expectedFloorKey 期望的楼层键。
 * @returns boolean：仍为同一有效实例时返回 true。
 */
function isPendingRoundInstanceActiveEvent(
  meta: DiceMetaEvent,
  expectedRoundId: string,
  expectedInstanceToken: string,
  expectedFloorKey?: string
): boolean {
  const current = meta.pendingRound;
  if (!current || current.status !== "open") return false;
  if (current.roundId !== expectedRoundId) return false;
  if (String(current.instanceToken ?? "").trim() !== expectedInstanceToken) return false;
  const normalizedExpectedFloorKey = String(expectedFloorKey ?? "").trim();
  if (!normalizedExpectedFloorKey) return true;
  return String(current.sourceFloorKey ?? "").trim() === normalizedExpectedFloorKey;
}

export function ensureOpenPendingRoundEvent(meta: DiceMetaEvent, deps: EnsureOpenPendingRoundDepsEvent): PendingRoundEvent {
  const status = meta.pendingRound?.status;
  if (!meta.pendingRound || status !== "open") {
    meta.pendingRound = createPendingRoundInstanceEvent(deps);
  }
  if (!meta.pendingRound.eventTimers || typeof meta.pendingRound.eventTimers !== "object") {
    meta.pendingRound.eventTimers = {};
  }
  if (!String(meta.pendingRound.instanceToken ?? "").trim()) {
    meta.pendingRound.instanceToken = deps.createIdEvent("rinst");
  }
  return meta.pendingRound;
}

export interface MergeEventsIntoPendingRoundDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  createIdEvent: (prefix: string) => string;
  resolveEventTimeLimitByUrgencyEvent: typeof resolveEventTimeLimitByUrgencyEvent;
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
    decayStatusesForNewRoundEvent(meta);
  }
  const sourceFloorKey = buildAssistantFloorKeyEvent(assistantMsgId) || undefined;
  const round = createPendingRoundInstanceEvent({ createIdEvent: deps.createIdEvent }, sourceFloorKey);
  meta.pendingRound = round;
  const now = Date.now();
  const timers = ensureEventTimerIndexEvent(round);
  const merged = new Map<string, DiceEventSpecEvent>();

  for (const incomingRaw of events) {
    const incoming = { ...incomingRaw };
    const previous = merged.get(incoming.id);
    const existingRecord = getLatestRollRecordForEvent(round, incoming.id);
    const next: DiceEventSpecEvent = { ...(previous || {}), ...incoming };
    next.listVisibility =
      incoming.listVisibility === "hidden" || previous?.listVisibility === "hidden"
        ? "hidden"
        : "visible";
    next.closedAt =
      Number(incoming.closedAt)
      || Number(previous?.closedAt)
      || Number(existingRecord?.rolledAt)
      || null;

    if (!existingRecord && !isEventClosedEvent(next)) {
      const resolvedTimeLimit = deps.resolveEventTimeLimitByUrgencyEvent({
        rollMode: next.rollMode,
        urgency: next.urgency,
        settings,
      });
      next.urgency = resolvedTimeLimit.urgency;
      next.timeLimitMs = resolvedTimeLimit.timeLimitMs;
      next.timeLimit = resolvedTimeLimit.timeLimit;
      next.offeredAt = now;
      next.deadlineAt = resolvedTimeLimit.timeLimitMs == null ? null : now + resolvedTimeLimit.timeLimitMs;
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
    next.sourceAssistantMsgId = assistantMsgId;
    merged.set(next.id, next);
  }

  round.events = Array.from(merged.values());
  ensureRoundEventTimersSyncedEvent(round, {
    getSettingsEvent: deps.getSettingsEvent,
    resolveEventTargetEvent: deps.resolveEventTargetEvent,
    resolveEventTimeLimitByUrgencyEvent: deps.resolveEventTimeLimitByUrgencyEvent,
  });
  round.sourceAssistantMsgIds = [assistantMsgId];
  round.sourceFloorKey = sourceFloorKey;
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
  if (settings.enableExplodeOutcomeBranch && explosionTriggered && !(outcomes?.explode && outcomes.explode.trim())) {
    logBlindOutcomeFallbackOnceEvent(event, record, "explode");
  }
  if (record?.success === true) {
    if (!(outcomes?.success && outcomes.success.trim())) {
      logBlindOutcomeFallbackOnceEvent(event, record, "success");
    }
    return { kind: "success", text: outcomes?.success?.trim() || "判定成功，剧情向有利方向推进。", explosionTriggered };
  }
  if (
    record?.success === false
    || record?.source === "timeout_auto_fail"
    || record?.source === "skipped_manual_fail"
  ) {
    if (!(outcomes?.failure && outcomes.failure.trim())) {
      logBlindOutcomeFallbackOnceEvent(event, record, "failure");
    }
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
    sourceAssistantMsgId: event.sourceAssistantMsgId,
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
  event.closedAt = now;
  round.rolls.push(record);
  settleEventTimerEvent(round, event.id, now);
  syncRoundClosedStateFromEventsEvent(round);
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
  refreshAllWidgetsFromStateEvent: () => void;
  refreshCountdownDomEvent: () => void;
  rollDiceEvent: (exprRaw: string, options?: DiceOptions) => Promise<DiceResult>;
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
}

export interface PerformInteractiveTriggerRollDepsEvent extends PerformEventRollByIdDepsEvent {}

export interface InteractiveTriggerRollFeedbackEvent {
  revealMode: TriggerPackRevealModeEvent;
  visibility: "public" | "blind";
  title: string;
  resultGrade: EventResultGradeEvent;
  stateLabel: string;
  feedbackText: string;
}

export interface PerformInteractiveTriggerRollResultEvent {
  round: PendingRoundEvent;
  event: DiceEventSpecEvent;
  record: EventRollRecordEvent;
  feedback: InteractiveTriggerRollFeedbackEvent;
}

function buildInteractiveTriggerEventIdEvent(trigger: InteractiveTriggerEvent): string {
  const sourceMessageId = String(trigger.sourceMessageId || "msg").trim() || "msg";
  const sourceId = String(trigger.sourceId || trigger.label || "trigger").trim() || "trigger";
  const skill = String(trigger.skill || trigger.action || "check").trim() || "check";
  const occurrenceIndex = Number.isFinite(Number(trigger.occurrenceIndex))
    ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex)))
    : 0;
  const raw = `${sourceMessageId}:${sourceId}:${skill}:${occurrenceIndex}`;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
  return `itr:${normalized}`;
}

export function isInteractiveTriggerResolvedEvent(
  round: PendingRoundEvent | null | undefined,
  trigger: InteractiveTriggerEvent
): boolean {
  if (!round) return false;
  const eventId = buildInteractiveTriggerEventIdEvent(trigger);
  return round.rolls.some((record) => record?.eventId === eventId);
}

function buildInteractiveTriggerEventSpecEvent(
  trigger: InteractiveTriggerEvent,
  eventId: string
): DiceEventSpecEvent {
  const label = String(trigger.label || "").trim() || "未指定线索";
  const action = String(trigger.action || "").trim() || String(trigger.skill || "").trim() || "检定";
  const skill = String(trigger.skill || "").trim() || action;
  const difficulty = trigger.difficulty || "normal";
  const compare = trigger.compare || ">=";
  const threshold = resolveEventThresholdEvent(
    eventId,
    String(trigger.diceExpr || "").trim() || "1d20",
    compare,
    trigger.dcHint,
    difficulty,
    "normal"
  );
  const resolvedDc = threshold?.dc ?? 10;
  const noteText = String(trigger.note || "").trim();
  const loreText = String(trigger.loreType || "").trim();
  const successOutcomeText = String(trigger.triggerPackSuccessText || "").trim();
  const failureOutcomeText = String(trigger.triggerPackFailureText || "").trim();
  const explodeOutcomeText = String(
    trigger.triggerPackExplodeText || trigger.triggerPackSuccessText || ""
  ).trim();
  const descParts = [
    `来自交互触发词「${label}」的即时检定。`,
    loreText ? `线索类型：${loreText}。` : "",
    noteText ? `备注：${noteText}。` : "",
  ].filter(Boolean);
  const dcReason = threshold?.generatedDcReason || "交互触发未提供难度，使用普通难度自动换算阈值。";
  return {
    id: eventId,
    title: `${action}【${label}】`,
    checkDice: String(trigger.diceExpr || "").trim() || "1d20",
    dc: resolvedDc,
    difficulty,
    dcSource: threshold?.dcSource ?? "difficulty_mapped",
    compare,
    scope: "protagonist",
    rollMode: "manual",
    advantageState: "normal",
    skill,
    targetType: "object",
    targetLabel: label,
    targetName: trigger.sourceId || label,
    timeLimit: "none",
    desc: descParts.join(" "),
    dcReason,
    outcomes: {
      success: successOutcomeText || `${action}成功，围绕「${label}」获得更明确的进展。`,
      failure: failureOutcomeText || `${action}失败，围绕「${label}」产生误判、延误或新的风险。`,
      explode: explodeOutcomeText || undefined,
    },
    sourceAssistantMsgId: String(trigger.sourceMessageId || "").trim(),
    listVisibility: trigger.blind ? "hidden" : "visible",
    closedAt: null,
  };
}

function resolveInteractiveTriggerRevealModeEvent(trigger: InteractiveTriggerEvent): TriggerPackRevealModeEvent {
  return trigger.revealMode === "instant" ? "instant" : "delayed";
}

function buildInteractiveTriggerResolvedFeedbackTextEvent(args: {
  trigger: InteractiveTriggerEvent;
  event: DiceEventSpecEvent;
  record: EventRollRecordEvent;
  revealMode: TriggerPackRevealModeEvent;
}): InteractiveTriggerRollFeedbackEvent {
  const { trigger, event, record, revealMode } = args;
  const visibility: "public" | "blind" =
    record.visibility === "blind" || record.source === "blind_manual_roll" ? "blind" : "public";
  const title = String(trigger.label || event.targetLabel || event.title || "线索").trim() || "线索";
  const stateLabel = revealMode === "instant"
    ? (visibility === "blind" ? "已即时体现" : "已完成")
    : (visibility === "blind" ? "待体现" : "已完成");

  const grade = record.resultGrade || "failure";
  const successLike = record.success === true || grade === "critical_success" || grade === "partial_success" || grade === "success";
  const branchText = grade === "critical_success"
    ? String(trigger.triggerPackExplodeText || trigger.triggerPackSuccessText || "").trim()
    : String(successLike ? trigger.triggerPackSuccessText : trigger.triggerPackFailureText).trim();

  if (revealMode === "instant" && branchText) {
    return {
      revealMode,
      visibility,
      title,
      resultGrade: grade,
      stateLabel,
      feedbackText: branchText,
    };
  }

  if (visibility === "blind" && revealMode === "delayed") {
    return {
      revealMode,
      visibility,
      title,
      resultGrade: grade,
      stateLabel,
      feedbackText: `结果等级：${formatResultGradeLabelEvent(grade, "blind")}。已加入暗骰列表，后续会通过叙事自然体现。`,
    };
  }

  const action = String(trigger.action || trigger.skill || "检定").trim() || "检定";
  const target = String(trigger.label || event.targetLabel || "该线索").trim() || "该线索";
  const successText = successLike
    ? `${action}成功，你从「${target}」取得了可用进展。`
    : `${action}失败，你暂时没能从「${target}」得到可靠结论。`;
  return {
    revealMode,
    visibility,
    title,
    resultGrade: grade,
    stateLabel,
    feedbackText: successText,
  };
}

export async function performInteractiveTriggerRollEvent(
  trigger: InteractiveTriggerEvent,
  deps: PerformInteractiveTriggerRollDepsEvent
): Promise<PerformInteractiveTriggerRollResultEvent> {
  deps.sweepTimeoutFailuresEvent();
  const settings = deps.getSettingsEvent();
  if (!settings.enabled) {
    throw new Error("RollHelper 主开关已关闭，当前不能执行交互检定。");
  }

  const meta = deps.getDiceMetaEvent();
  const round = ensureOpenPendingRoundEvent(meta, { createIdEvent: deps.createIdEvent });
  if (trigger.blind) {
    if (!settings.enableBlindRoll) {
      throw new Error("暗骰功能已关闭，当前不能执行交互暗骰。");
    }
    if (!isBlindSkillAllowedEvent(trigger.skill || trigger.action || "", settings)) {
      throw new Error(`「${String(trigger.skill || trigger.action || "该检定")}」当前不允许作为暗骰执行。`);
    }
    const blindCount =
      countBlindRollsInRoundEvent(round)
      + countQueuedBlindGuidanceInRoundEvent(meta, round.roundId);
    if (blindCount >= Math.max(1, Number(settings.maxBlindRollsPerRound) || 1)) {
      throw new Error("本轮暗骰次数已达到上限，当前不能再进行新的交互暗骰。");
    }
  }
  const revealMode = resolveInteractiveTriggerRevealModeEvent(trigger);
  const eventId = buildInteractiveTriggerEventIdEvent(trigger);
  let event = round.events.find((item) => item.id === eventId);
  if (!event) {
    event = buildInteractiveTriggerEventSpecEvent(trigger, eventId);
    round.events.push(event);
  }
  round.sourceAssistantMsgIds = Array.isArray(round.sourceAssistantMsgIds) ? round.sourceAssistantMsgIds : [];
  if (event.sourceAssistantMsgId && !round.sourceAssistantMsgIds.includes(event.sourceAssistantMsgId)) {
    round.sourceAssistantMsgIds.push(event.sourceAssistantMsgId);
  }
  if (isInteractiveTriggerResolvedEvent(round, trigger)) {
    throw new Error(`「${String(trigger.label || trigger.action || trigger.skill || "该线索")}」已经检定过了。`);
  }

  const exprRaw = String(event.checkDice || "").trim();
  if (!exprRaw) {
    throw new Error(`交互检定 ${event.title} 缺少可用骰式。`);
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
    throw new Error(`掷骰失败：${execution.errorText}`);
  }

  let result: DiceResult;
  try {
    result = await deps.rollDiceEvent(expr, {
      rule: settings.ruleText,
      adv: execution.adv,
      dis: execution.dis,
    });
  } catch (error: any) {
    throw new Error(`掷骰失败：${error?.message ?? String(error)}`);
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
  const recordSource: EventRollRecordEvent["source"] = trigger.blind ? "blind_manual_roll" : "manual_roll";
  const natState = resolveNatStateEvent(result.rolls, Number(result.sides) || 0);
  const grade = evaluateResultGradeEvent(result, success, compareUsed, dcUsed, recordSource);
  if (shouldPlay3DRollAnimationEvent(settings, result)) {
    await playRollResultAnimationEvent(resolveRollVisualStatusFromGradeEvent(grade.resultGrade));
  }

  deps.saveLastRoll(result);

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
    source: recordSource,
    visibility: trigger.blind ? "blind" : "public",
    concealResult: trigger.blind,
    natState,
    timeoutAt: null,
    explodePolicyApplied,
    explodePolicyReason,
    sourceAssistantMsgId: event.sourceAssistantMsgId,
    revealMode,
  };

  event.closedAt = record.rolledAt;
  settleEventTimerEvent(round, event.id, record.rolledAt);
  round.rolls.push(record);
  syncRoundClosedStateFromEventsEvent(round);
  if (trigger.blind && revealMode === "delayed") {
    enqueueBlindGuidanceFromRecordEvent(meta, settings, round, event, record);
  }
  appendBlindHistoryFromRecordEvent(
    meta,
    event,
    record,
    "interactive_blind",
    revealMode,
  );
  if (settings.enableDynamicResultGuidance) {
    enqueueResultGuidanceFromRecordEvent(meta, event, record);
  }
  applyOutcomeStatusEffectsFromRecordEvent(meta, event, record, settings);
  deps.saveMetadataSafeEvent();
  deps.refreshAllWidgetsFromStateEvent();
  deps.refreshCountdownDomEvent();

  return {
    round,
    event,
    record,
    feedback: buildInteractiveTriggerResolvedFeedbackTextEvent({
      trigger,
      event,
      record,
      revealMode,
    }),
  };
}

type ManualEventRollModeEvent = "initial" | "reroll" | "blind_initial" | "blind_reroll";

/**
 * 功能：执行一次事件手动掷骰，可用于首次结算或重新投掷。
 * @param eventIdRaw 事件 ID
 * @param overrideExpr 覆盖骰式
 * @param expectedRoundId 期望轮次 ID
 * @param mode 执行模式：首次或重新投掷
 * @param deps 运行时依赖
 * @returns 错误文本；成功时返回空字符串
 */
async function executeManualEventRollEvent(
  eventIdRaw: string,
  overrideExpr: string | undefined,
  expectedRoundId: string | undefined,
  mode: ManualEventRollModeEvent,
  deps: PerformEventRollByIdDepsEvent
): Promise<string> {
  const allowExistingRecord = mode === "reroll" || mode === "blind_reroll";
  const requestedBlindMode = mode === "blind_initial" || mode === "blind_reroll";
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
    event.closedAt = timeoutCreated.rolledAt;
    if (settings.enableDynamicResultGuidance) {
      enqueueResultGuidanceFromRecordEvent(meta, event, timeoutCreated);
    }
    applyOutcomeStatusEffectsFromRecordEvent(meta, event, timeoutCreated, settings);
    deps.saveMetadataSafeEvent();
  }

  const existingRecord = deps.getLatestRollRecordForEvent(round, event.id);
  if (existingRecord && !allowExistingRecord) {
    deps.refreshAllWidgetsFromStateEvent();
    deps.refreshCountdownDomEvent();
    return "";
  }

  if (allowExistingRecord && !settings.enableRerollFeature) {
    return "❌ 重新投掷功能未开启。";
  }
  if (allowExistingRecord && !existingRecord) {
    return "❌ 当前事件还没有可重投的结算结果。";
  }

  const existingVisibility = resolveRecordVisibilityEvent(existingRecord);
  const effectiveBlindMode = allowExistingRecord
    ? existingVisibility === "blind"
    : requestedBlindMode;
  if (allowExistingRecord) {
    const requestedVisibility = requestedBlindMode ? "blind" : "public";
    if (requestedVisibility !== existingVisibility) {
      logger.warn(
        `[重投可见性纠正] event=${event.id} requested=${requestedVisibility} actual=${existingVisibility}`
      );
    }
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
    result = await deps.rollDiceEvent(expr, {
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

  const compareUsed = deps.normalizeCompareOperatorEvent(event.compare) ?? ">=";
  const dcUsed = Number.isFinite(event.dc) ? Number(event.dc) : null;
  const success = deps.evaluateSuccessEvent(result.total, compareUsed, dcUsed);
  const recordSource: EventRollRecordEvent["source"] = effectiveBlindMode ? "blind_manual_roll" : "manual_roll";
  const natState = resolveNatStateEvent(result.rolls, Number(result.sides) || 0);
  const grade = evaluateResultGradeEvent(result, success, compareUsed, dcUsed, recordSource);
  if (shouldPlay3DRollAnimationEvent(settings, result)) {
    await playRollResultAnimationEvent(resolveRollVisualStatusFromGradeEvent(grade.resultGrade));
  }

  deps.saveLastRoll(result);

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
    source: recordSource,
    visibility: effectiveBlindMode ? "blind" : "public",
    concealResult: effectiveBlindMode,
    natState,
    timeoutAt: null,
    explodePolicyApplied,
    explodePolicyReason,
    sourceAssistantMsgId: event.sourceAssistantMsgId,
  };

  event.closedAt = record.rolledAt;
  settleEventTimerEvent(round, event.id, record.rolledAt);
  enqueueBlindGuidanceFromRecordEvent(meta, settings, round, event, record);
  round.rolls.push(record);
  syncRoundClosedStateFromEventsEvent(round);
  appendBlindHistoryFromRecordEvent(
    meta,
    event,
    record,
    "event_blind",
    "delayed",
  );
  if (settings.enableDynamicResultGuidance) {
    enqueueResultGuidanceFromRecordEvent(meta, event, record);
  }
  applyOutcomeStatusEffectsFromRecordEvent(meta, event, record, settings);
  deps.saveMetadataSafeEvent();
  deps.refreshAllWidgetsFromStateEvent();
  deps.refreshCountdownDomEvent();
  return "";
}

export async function performEventRollByIdEvent(
  eventIdRaw: string,
  overrideExpr: string | undefined,
  expectedRoundId: string | undefined,
  deps: PerformEventRollByIdDepsEvent
): Promise<string> {
  return executeManualEventRollEvent(eventIdRaw, overrideExpr, expectedRoundId, "initial", deps);
}

export async function performBlindEventRollByIdEvent(
  eventIdRaw: string,
  overrideExpr: string | undefined,
  expectedRoundId: string | undefined,
  deps: PerformEventRollByIdDepsEvent
): Promise<string> {
  return executeManualEventRollEvent(eventIdRaw, overrideExpr, expectedRoundId, "blind_initial", deps);
}

/**
 * 功能：对同一事件发起重新投掷，并保留旧记录。
 * @param eventIdRaw 事件 ID
 * @param expectedRoundId 期望轮次 ID
 * @param deps 运行时依赖
 * @returns 错误文本；成功时返回空字符串
 */
export async function rerollEventByIdEvent(
  eventIdRaw: string,
  expectedRoundId: string | undefined,
  deps: PerformEventRollByIdDepsEvent
): Promise<string> {
  return executeManualEventRollEvent(eventIdRaw, undefined, expectedRoundId, "reroll", deps);
}

export async function rerollBlindEventByIdEvent(
  eventIdRaw: string,
  expectedRoundId: string | undefined,
  deps: PerformEventRollByIdDepsEvent
): Promise<string> {
  return executeManualEventRollEvent(eventIdRaw, undefined, expectedRoundId, "blind_reroll", deps);
}

export interface AutoRollEventsByAiModeDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getLatestRollRecordForEvent: (round: PendingRoundEvent, eventId: string) => EventRollRecordEvent | null;
  rollDiceEvent: (exprRaw: string, options?: DiceOptions) => Promise<DiceResult>;
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

export async function autoRollEventsByAiModeEvent(round: PendingRoundEvent, deps: AutoRollEventsByAiModeDepsEvent): Promise<string[]> {
  const settings = deps.getSettingsEvent();
  if (!settings.enableAiRollMode) return [];

  deps.ensureRoundEventTimersSyncedEvent(round);
  const meta = deps.getDiceMetaEvent();
  const expectedRoundId = round.roundId;
  const expectedInstanceToken = String(round.instanceToken ?? "").trim();
  const expectedFloorKey = String(round.sourceFloorKey ?? "").trim() || undefined;
  let changed = false;
  let lastResult: DiceResult | null = null;
  const resultCards: string[] = [];
  let aiAutoExplodeUsed = round.rolls.filter(
    (item) =>
      item?.source === "ai_auto_roll" &&
      (item.explodePolicyApplied === "enabled" || String(item.diceExpr || "").includes("!"))
  ).length;

  /**
   * 功能：在自动掷骰异步链路的关键节点确认当前轮次实例仍然有效。
   * @param stage 当前校验阶段名称。
   * @param eventId 当前事件 ID。
   * @returns boolean：仍可继续写入时返回 true。
   */
  const assertRoundStillActiveEvent = (stage: string, eventId: string): boolean => {
    const latestMeta = deps.getDiceMetaEvent();
    const active = isPendingRoundInstanceActiveEvent(
      latestMeta,
      expectedRoundId,
      expectedInstanceToken,
      expectedFloorKey
    );
    if (!active) {
      logger.info(
        `[自动掷骰] 检测到轮次实例已失效，停止回写 stage=${stage} round=${expectedRoundId} event=${eventId} instance=${expectedInstanceToken || "none"} floor=${expectedFloorKey || "none"}`
      );
    }
    return active;
  };

  for (const event of round.events) {
    if (!assertRoundStillActiveEvent("before_event", event.id)) {
      return [];
    }
    const mode: EventRollModeEvent = event.rollMode === "auto" ? "auto" : "manual";
    if (mode !== "auto") {
      continue;
    }

    const existingRecord = deps.getLatestRollRecordForEvent(round, event.id);
    if (existingRecord) {
      continue;
    }

    const exprRaw = String(event.checkDice || "").trim();
    if (!exprRaw) {
      continue;
    }
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
      result = await deps.rollDiceEvent(expr, {
        rule: settings.ruleText,
        adv: execution.adv,
        dis: execution.dis,
      });
    } catch (error) {
      logger.warn(`AI 自动掷骰失败: event=${event.id}`, error);
      continue;
    }
    if (!assertRoundStillActiveEvent("after_roll", event.id)) {
      await cleanupStale3DRollPresentationEvent(result);
      return [];
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
    if (shouldPlay3DRollAnimationEvent(settings, result)) {
      if (!assertRoundStillActiveEvent("before_animation", event.id)) {
        await cleanupStale3DRollPresentationEvent(result);
        return [];
      }
      await playRollResultAnimationEvent(resolveRollVisualStatusFromGradeEvent(grade.resultGrade));
      if (!assertRoundStillActiveEvent("after_animation", event.id)) {
        return [];
      }
    }

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
    visibility: "public",
    concealResult: false,
    natState: resolveNatStateEvent(result.rolls, Number(result.sides) || 0),
    timeoutAt: null,
      explodePolicyApplied,
      explodePolicyReason,
      sourceAssistantMsgId: event.sourceAssistantMsgId,
    };
    if (!assertRoundStillActiveEvent("before_commit", event.id)) {
      return [];
    }

    event.closedAt = record.rolledAt;
    settleEventTimerEvent(round, event.id, record.rolledAt);
    round.rolls.push(record);
    syncRoundClosedStateFromEventsEvent(round);
    if (settings.enableDynamicResultGuidance) {
      enqueueResultGuidanceFromRecordEvent(meta, event, record);
    }
    applyOutcomeStatusEffectsFromRecordEvent(meta, event, record, settings);
    changed = true;
    lastResult = result;
    if (record.visibility !== "blind" && record.source !== "blind_manual_roll") {
      resultCards.push(deps.buildEventRollResultCardEvent(event, record));
    }
  }

  if (!changed) return [];
  if (!assertRoundStillActiveEvent("before_finalize", "all")) {
    return [];
  }
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
  if (record.source === "skipped_manual_fail") {
    return `已跳过并按失败关闭${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
  }
  if (record.source === "blind_manual_roll" || record.visibility === "blind") {
    return "暗骰检定已结算（真实结果已隐藏，将通过后续叙事体现）";
  }
  if (record.source === "ai_auto_roll") {
    const status = record.success === null ? "未判定" : record.success ? "成功" : "失败";
    return `AI自动检定，总值 ${record.result.total} (${record.compareUsed} ${record.dcUsed ?? "?"} => ${status})${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
  }
  const status = record.success === null ? "未判定" : record.success ? "成功" : "失败";
  return `总值 ${record.result.total} (${record.compareUsed} ${record.dcUsed ?? "?"} => ${status})${targetTag}${modifierTag}${statusDetailTag}${advantageTag}${gradeTag}${outcomeTag}`;
}
