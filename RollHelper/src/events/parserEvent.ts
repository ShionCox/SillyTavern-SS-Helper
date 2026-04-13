import { parseDiceExpression } from "../core/diceEngineEvent";
import { simpleHashEvent } from "../core/utilsEvent";
import { AI_SUPPORTED_DICE_SIDES_Event, DEFAULT_SETTINGS_Event } from "../settings/constantsEvent";
import type {
  AdvantageStateEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DicePluginSettingsEvent,
  EventDifficultyLevelEvent,
  EventOutcomesEvent,
  EventRollModeEvent,
  EventScopeTagEvent,
  EventTargetTypeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";

export type RemovalRangeEvent = { start: number; end: number };

const RECENT_PARSE_FAILURE_LOG_LIMIT_Event = 32;
const recentParseFailureFingerprintsEvent: string[] = [];
const recentParseFailureFingerprintSetEvent = new Set<string>();

export function resetRecentParseFailureLogsEvent(): void {
  recentParseFailureFingerprintsEvent.length = 0;
  recentParseFailureFingerprintSetEvent.clear();
}

/**
 * 功能：对解析失败的原始文本做去重日志，避免同一份坏数据在重试或重生成时无限刷屏。
 * @param raw 解析失败的原始文本。
 * @returns 是否需要输出详细调试日志。
 */
function shouldLogParseFailureRawEvent(raw: string): boolean {
  const normalizedRaw = String(raw ?? "").trim();
  if (!normalizedRaw) return false;
  const fingerprint = `${simpleHashEvent(normalizedRaw)}:${normalizedRaw.length}`;
  if (recentParseFailureFingerprintSetEvent.has(fingerprint)) {
    return false;
  }
  recentParseFailureFingerprintsEvent.push(fingerprint);
  recentParseFailureFingerprintSetEvent.add(fingerprint);
  while (recentParseFailureFingerprintsEvent.length > RECENT_PARSE_FAILURE_LOG_LIMIT_Event) {
    const expired = recentParseFailureFingerprintsEvent.shift();
    if (!expired) continue;
    recentParseFailureFingerprintSetEvent.delete(expired);
  }
  return true;
}

export function normalizeCompareOperatorEvent(raw: any): CompareOperatorEvent | null {
  if (raw == null || raw === "") return ">=";
  if (raw === ">=" || raw === ">" || raw === "<=" || raw === "<") return raw;
  return null;
}

/**
 * 功能：规范化事件难度等级文本。
 * @param raw 原始难度文本
 * @returns 统一后的难度等级；无法识别时返回空值
 */
export function normalizeDifficultyLevelEvent(raw: any): EventDifficultyLevelEvent | undefined {
  const value = normalizeStringFieldEvent(raw).toLowerCase();
  if (!value) return undefined;
  if (value === "easy" || value === "simple" || value === "easier" || value === "简单" || value === "容易") {
    return "easy";
  }
  if (
    value === "normal" ||
    value === "medium" ||
    value === "standard" ||
    value === "普通" ||
    value === "正常" ||
    value === "中等"
  ) {
    return "normal";
  }
  if (value === "hard" || value === "difficult" || value === "困难" || value === "较难") {
    return "hard";
  }
  if (
    value === "extreme" ||
    value === "very_hard" ||
    value === "veryhard" ||
    value === "极难" ||
    value === "严苛"
  ) {
    return "extreme";
  }
  return undefined;
}

export function normalizeStringFieldEvent(raw: any): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function normalizeOutcomeTextEvent(
  raw: any,
  fieldName: "success" | "failure" | "explode",
  eventId: string,
  OUTCOME_TEXT_MAX_LEN_Event: number
): string | undefined {
  const text = normalizeStringFieldEvent(raw);
  if (!text) return undefined;
  if (text.length <= OUTCOME_TEXT_MAX_LEN_Event) return text;
  const truncated = text.slice(0, OUTCOME_TEXT_MAX_LEN_Event);
  logger.warn(`outcomes.${fieldName} 过长，已截断: event=${eventId} len=${text.length}`);
  return `${truncated}（已截断）`;
}

function normalizeDcReasonTextEvent(
  raw: any,
  eventId: string,
  maxLen: number
): string | undefined {
  const text = normalizeStringFieldEvent(raw);
  if (!text) return undefined;
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  logger.warn(`dc_reason 过长，已截断: event=${eventId} len=${text.length}`);
  return `${truncated}（已截断）`;
}

export function normalizeOutcomesEvent(
  raw: any,
  eventId: string,
  OUTCOME_TEXT_MAX_LEN_Event: number
): EventOutcomesEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const success = normalizeOutcomeTextEvent((raw as any).success, "success", eventId, OUTCOME_TEXT_MAX_LEN_Event);
  const failure = normalizeOutcomeTextEvent((raw as any).failure, "failure", eventId, OUTCOME_TEXT_MAX_LEN_Event);
  const explode = normalizeOutcomeTextEvent((raw as any).explode, "explode", eventId, OUTCOME_TEXT_MAX_LEN_Event);
  if (!success && !failure && !explode) return undefined;
  return { success, failure, explode };
}

type ReachableTotalRangeEvent = {
  min: number;
  max: number;
};

type ResolvedEventThresholdEvent = {
  dc: number;
  difficulty?: EventDifficultyLevelEvent;
  dcSource: "ai" | "difficulty_mapped";
  generatedDcReason?: string;
};

function clampNumberEvent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDifficultyLabelEvent(level: EventDifficultyLevelEvent): string {
  if (level === "easy") return "简单";
  if (level === "hard") return "困难";
  if (level === "extreme") return "极难";
  return "普通";
}

/**
 * 功能：根据骰式结构估算理论可达的总值范围。
 * @param count 骰子数量
 * @param sides 骰子面数
 * @param modifier 固定修正值
 * @param keepCount 保留骰子数量；未指定时按全部骰子计分
 * @returns 理论最小值与最大值
 */
function buildReachableTotalRangeFromPartsEvent(
  count: number,
  sides: number,
  modifier: number,
  keepCount?: number
): ReachableTotalRangeEvent {
  const scoringCount = Number.isFinite(Number(keepCount)) && Number(keepCount) > 0
    ? Math.max(1, Math.min(Number(count) || 1, Number(keepCount)))
    : Math.max(1, Number(count) || 1);
  const numericSides = Math.max(1, Number(sides) || 1);
  const numericModifier = Number.isFinite(Number(modifier)) ? Number(modifier) : 0;
  return {
    min: scoringCount + numericModifier,
    max: scoringCount * numericSides + numericModifier,
  };
}

/**
 * 功能：根据事件骰式与优劣骰配置估算理论可达总值范围。
 * @param checkDice 事件骰式
 * @param advantageState 事件声明的优劣骰状态
 * @returns 理论最小值与最大值；解析失败时返回空值
 */
function buildReachableTotalRangeForEventEvent(
  checkDice: string,
  advantageState: AdvantageStateEvent
): ReachableTotalRangeEvent | null {
  try {
    const parsed = parseDiceExpression(checkDice);
    const effectiveKeepCount =
      parsed.keepMode === "kh" || parsed.keepMode === "kl"
        ? parsed.keepCount
        : undefined;
    return buildReachableTotalRangeFromPartsEvent(
      parsed.count,
      parsed.sides,
      parsed.modifier,
      effectiveKeepCount
    );
  } catch {
    return null;
  }
}

/**
 * 功能：根据比较符判断当前检定是否以“更高总值更有利”。
 * @param compare 比较运算符
 * @returns 若更高总值更有利则返回 `true`
 */
function isHigherTotalBetterForCompareEvent(compare: CompareOperatorEvent): boolean {
  return compare === ">=" || compare === ">";
}

/**
 * 功能：根据优劣骰状态微调难度映射强度。
 * @param advantageState 优劣骰状态
 * @param compare 比较运算符
 * @returns 对基础难度进度的偏移量
 */
function getDifficultyProgressBiasEvent(
  advantageState: AdvantageStateEvent,
  compare: CompareOperatorEvent
): number {
  if (advantageState === "normal") return 0;
  const higherIsBetter = isHigherTotalBetterForCompareEvent(compare);
  if (advantageState === "advantage") {
    return higherIsBetter ? 0.08 : -0.12;
  }
  return higherIsBetter ? -0.12 : 0.08;
}

/**
 * 功能：把难度等级换算为基础进度值。
 * @param difficulty 难度等级
 * @returns 0~1 的基础进度
 */
function getDifficultyBaseProgressEvent(difficulty: EventDifficultyLevelEvent): number {
  if (difficulty === "easy") return 0.28;
  if (difficulty === "hard") return 0.68;
  if (difficulty === "extreme") return 0.84;
  return 0.48;
}

/**
 * 功能：根据可达范围、比较方式与难度等级自动换算 DC。
 * @param range 理论可达范围
 * @param compare 比较运算符
 * @param difficulty 难度等级
 * @param advantageState 优劣骰状态
 * @returns 自动换算出的 DC
 */
function computeDcFromDifficultyEvent(
  range: ReachableTotalRangeEvent,
  compare: CompareOperatorEvent,
  difficulty: EventDifficultyLevelEvent,
  advantageState: AdvantageStateEvent
): number {
  const span = Math.max(0, range.max - range.min);
  const challengeProgress = clampNumberEvent(
    getDifficultyBaseProgressEvent(difficulty) + getDifficultyProgressBiasEvent(advantageState, compare),
    0.08,
    0.92
  );
  const thresholdProgress = isHigherTotalBetterForCompareEvent(compare)
    ? challengeProgress
    : 1 - challengeProgress;
  const inclusiveTarget = clampNumberEvent(
    Math.round(range.min + span * thresholdProgress),
    range.min,
    range.max
  );

  if (compare === ">") {
    return clampNumberEvent(inclusiveTarget - 1, range.min - 1, range.max);
  }
  if (compare === "<") {
    return clampNumberEvent(inclusiveTarget + 1, range.min, range.max + 1);
  }
  return inclusiveTarget;
}

/**
 * 功能：综合原始字段与系统难度映射得到最终用于结算的 DC。
 * @param eventId 事件 ID
 * @param checkDice 事件骰式
 * @param compare 比较运算符
 * @param rawDc 原始 DC 字段
 * @param rawDifficulty 原始难度字段
 * @param advantageState 优劣骰状态
 * @returns 规范化后的 DC 解析结果；缺失时返回空值
 */
export function resolveEventThresholdEvent(
  eventId: string,
  checkDice: string,
  compare: CompareOperatorEvent,
  rawDc: any,
  rawDifficulty: any,
  advantageState: AdvantageStateEvent
): ResolvedEventThresholdEvent | null {
  const difficulty = normalizeDifficultyLevelEvent(rawDifficulty);
  const rawDcNumber = Number(rawDc);
  const reachableRange = buildReachableTotalRangeForEventEvent(checkDice, advantageState);

  if (difficulty && reachableRange) {
    const dc = computeDcFromDifficultyEvent(reachableRange, compare, difficulty, advantageState);
    return {
      dc,
      difficulty,
      dcSource: "difficulty_mapped",
      generatedDcReason: `系统按${formatDifficultyLabelEvent(difficulty)}难度自动换算阈值（可达范围 ${reachableRange.min}~${reachableRange.max}）。`,
    };
  }

  if (Number.isFinite(rawDcNumber)) {
    return {
      dc: rawDcNumber,
      difficulty,
      dcSource: "ai",
    };
  }

  logger.warn(`事件缺少可用阈值信息，已忽略: event=${eventId} checkDice=${checkDice}`);
  return null;
}

/**
 * 功能：判断当前比较条件是否超出理论可达范围。
 * @param compare 比较运算符
 * @param dc 目标 DC
 * @param range 理论可达范围
 * @returns 若条件不可能成立则返回 `true`
 */
function isEventCheckImpossibleByRangeEvent(
  compare: CompareOperatorEvent,
  dc: number,
  range: ReachableTotalRangeEvent
): boolean {
  switch (compare) {
    case ">=":
      return range.max < dc;
    case ">":
      return range.max <= dc;
    case "<=":
      return range.min > dc;
    case "<":
      return range.min >= dc;
    default:
      return false;
  }
}

/**
 * 功能：在 AI 事件规范化阶段记录“理论上无法达成”的判定条件告警。
 * @param eventId 事件 ID
 * @param checkDice 事件骰式
 * @param compare 比较运算符
 * @param dc 目标 DC
 * @param advantageState 优劣骰状态
 * @returns 无返回值
 */
function warnIfEventCheckImpossibleEvent(
  eventId: string,
  checkDice: string,
  compare: CompareOperatorEvent,
  dc: number,
  advantageState: AdvantageStateEvent
): void {
  const reachableRange = buildReachableTotalRangeForEventEvent(checkDice, advantageState);
  if (!reachableRange) return;
  if (!isEventCheckImpossibleByRangeEvent(compare, dc, reachableRange)) return;

  const advantageText =
    advantageState === "advantage"
      ? "优势"
      : advantageState === "disadvantage"
        ? "劣势"
        : "正常";
  logger.warn(
    `事件判定条件超出可达范围: event=${eventId} checkDice=${checkDice} advantage=${advantageText} condition=${compare} ${dc} reachable=${reachableRange.min}..${reachableRange.max}`
  );
}

export function parseIsoDurationToMsEvent(raw: string, ISO_8601_DURATION_REGEX_Event: RegExp): number | null {
  const value = normalizeStringFieldEvent(raw);
  if (!value) return null;
  if (!ISO_8601_DURATION_REGEX_Event.test(value)) {
    logger.warn("非法 timeLimit，按不限时处理:", value);
    return null;
  }
  const match = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) {
    logger.warn("不支持的 timeLimit 组合，按不限时处理:", value);
    return null;
  }

  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  const totalSeconds = (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
  const totalMs = totalSeconds * 1000;
  if (!Number.isFinite(totalMs) || totalMs < 0) {
    logger.warn("timeLimit 解析失败，按不限时处理:", value);
    return null;
  }
  return totalMs;
}

export function applyTimeLimitPolicyMsEvent(
  durationMs: number | null,
  settings: DicePluginSettingsEvent
): number | null {
  if (!settings.enableTimeLimit) return null;
  if (durationMs == null) return null;
  const minSeconds = Math.max(1, Math.floor(Number(settings.minTimeLimitSeconds) || 1));
  const minMs = minSeconds * 1000;
  if (durationMs < minMs) {
    logger.info(`timeLimit 低于最短时限，提升到 ${minSeconds}s（原始 ${durationMs}ms）`);
    return minMs;
  }
  return durationMs;
}

export function normalizeEventScopeTagEvent(raw: any): EventScopeTagEvent | undefined {
  const value = normalizeStringFieldEvent(raw).toLowerCase();
  if (!value) return undefined;
  if (
    value === "protagonist" ||
    value === "player" ||
    value === "user" ||
    value === "mc" ||
    value === "main_character"
  ) {
    return "protagonist";
  }
  if (value === "all" || value === "any" || value === "both") {
    return "all";
  }
  if (value === "character" || value === "assistant" || value === "npc" || value === "self") {
    return "character";
  }
  return undefined;
}

export function normalizeEventRollModeEvent(raw: any): EventRollModeEvent | undefined {
  const value = normalizeStringFieldEvent(raw).toLowerCase();
  if (!value) return undefined;
  if (value === "auto" || value === "automatic" || value === "system" || value === "ai") {
    return "auto";
  }
  if (value === "manual" || value === "user" || value === "player") {
    return "manual";
  }
  return undefined;
}

export function normalizeAdvantageStateEvent(raw: any): AdvantageStateEvent | undefined {
  const value = normalizeStringFieldEvent(raw).toLowerCase();
  if (!value) return undefined;
  if (
    value === "advantage" ||
    value === "adv" ||
    value === "up" ||
    value === "high" ||
    value === "benefit"
  ) {
    return "advantage";
  }
  if (
    value === "disadvantage" ||
    value === "dis" ||
    value === "down" ||
    value === "low" ||
    value === "penalty"
  ) {
    return "disadvantage";
  }
  if (value === "normal" || value === "none" || value === "neutral" || value === "off") {
    return "normal";
  }
  return undefined;
}

export function normalizeEventTargetTypeEvent(raw: any): EventTargetTypeEvent | undefined {
  const value = normalizeStringFieldEvent(raw).toLowerCase();
  if (!value) return undefined;
  if (
    value === "self" ||
    value === "protagonist" ||
    value === "player" ||
    value === "mc" ||
    value === "main_character"
  ) {
    return "self";
  }
  if (value === "scene" || value === "situation" || value === "environment" || value === "context") {
    return "scene";
  }
  if (value === "supporting" || value === "character" || value === "npc" || value === "assistant") {
    return "supporting";
  }
  if (value === "object" || value === "item" || value === "thing" || value === "prop") {
    return "object";
  }
  if (value === "other" || value === "misc") {
    return "other";
  }
  return undefined;
}

export function formatEventTargetLabelEvent(type: EventTargetTypeEvent, name?: string): string {
  const normalizedName = normalizeStringFieldEvent(name);
  if (type === "self") return "主角自己";
  if (type === "scene") return "场景";
  if (type === "supporting") return normalizedName ? `配角 ${normalizedName}` : "配角";
  if (type === "object") return normalizedName ? `物件 ${normalizedName}` : "物件";
  return normalizedName ? `其他对象 ${normalizedName}` : "其他对象";
}

export function resolveEventTargetEvent(
  raw: any,
  scope?: EventScopeTagEvent
): { targetType: EventTargetTypeEvent; targetName?: string; targetLabel: string } {
  const payload =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, any>)
      : ({} as Record<string, any>);
  let targetType = normalizeEventTargetTypeEvent(payload.type ?? payload.targetType ?? payload.kind ?? raw);
  const targetName = normalizeStringFieldEvent(
    payload.name ?? payload.targetName ?? payload.label ?? payload.value
  );
  if (!targetType) {
    if (scope === "protagonist") targetType = "self";
    else if (scope === "character") targetType = "supporting";
    else targetType = "scene";
  }
  const normalizedTargetName = targetName || undefined;
  return {
    targetType,
    targetName: normalizedTargetName,
    targetLabel: formatEventTargetLabelEvent(targetType, normalizedTargetName),
  };
}

export function isLikelyProtagonistActionEvent(event: DiceEventSpecEvent): boolean {
  if (event.targetType === "self") return true;
  if (event.targetType === "supporting" || event.targetType === "object") return false;
  if (event.scope === "protagonist" || event.scope === "all") return true;
  if (event.scope === "character") return false;
  const text = `${event.title}\n${event.desc}\n${event.skill}\n${event.targetLabel}`;
  return /(\byou\b|\byour\b|\bplayer\b|\bprotagonist\b|主角|玩家|你)/i.test(text);
}

export function filterEventsByApplyScopeEvent(
  events: DiceEventSpecEvent[],
  applyScope: "protagonist_only" | "all"
): DiceEventSpecEvent[] {
  if (applyScope === "all") return events;
  return events.filter(isLikelyProtagonistActionEvent);
}

export interface NormalizeEventSpecDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  OUTCOME_TEXT_MAX_LEN_Event: number;
  ISO_8601_DURATION_REGEX_Event: RegExp;
}

export function parseAllowedDiceSidesSetEvent(raw: string): Set<number> | null {
  const text = normalizeStringFieldEvent(raw);
  if (!text) {
    return new Set(
      String(DEFAULT_SETTINGS_Event.aiAllowedDiceSidesText)
        .split(/[,\s]+/)
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0 && Number.isInteger(value) && AI_SUPPORTED_DICE_SIDES_Event.includes(value as any))
    );
  }
  const parts = text
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0 && Number.isInteger(value) && AI_SUPPORTED_DICE_SIDES_Event.includes(value as any));
  if (parts.length === 0) {
    return new Set(
      String(DEFAULT_SETTINGS_Event.aiAllowedDiceSidesText)
        .split(/[,\s]+/)
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0 && Number.isInteger(value) && AI_SUPPORTED_DICE_SIDES_Event.includes(value as any))
    );
  }
  return new Set(parts);
}

export function isDiceExpressionAllowedBySettingsEvent(
  checkDice: string,
  settings: DicePluginSettingsEvent
): boolean {
  const allowedSidesSet = parseAllowedDiceSidesSetEvent(settings.aiAllowedDiceSidesText);
  try {
    const parsed = parseDiceExpression(checkDice);
    return AI_SUPPORTED_DICE_SIDES_Event.includes(parsed.sides as any) && Boolean(allowedSidesSet?.has(parsed.sides));
  } catch {
    return false;
  }
}

export function normalizeDiceExpressionByAllowedSidesEvent(
  checkDice: string,
  settings: DicePluginSettingsEvent
): { nextExpr: string; changed: boolean; allowedSidesText: string } {
  const allowedSidesSet = parseAllowedDiceSidesSetEvent(settings.aiAllowedDiceSidesText);
  const allowedSides = allowedSidesSet ? Array.from(allowedSidesSet).sort((a, b) => a - b) : [];
  if (allowedSides.length === 0) {
    return { nextExpr: checkDice, changed: false, allowedSidesText: "d20" };
  }

  const parsed = parseDiceExpression(checkDice);
  if (allowedSidesSet!.has(parsed.sides)) {
    return {
      nextExpr: checkDice,
      changed: false,
      allowedSidesText: allowedSides.map((sides) => `d${sides}`).join(","),
    };
  }

  const nextSides = allowedSides[0];
  const modifierText = parsed.modifier === 0 ? "" : parsed.modifier > 0 ? `+${parsed.modifier}` : String(parsed.modifier);
  const keepText =
    parsed.keepMode && parsed.keepCount
      ? `${parsed.keepMode}${parsed.keepCount}`
      : "";
  const nextExpr = `${parsed.count}d${nextSides}${parsed.explode ? "!" : ""}${keepText}${modifierText}`;

  return {
    nextExpr,
    changed: true,
    allowedSidesText: allowedSides.map((sides) => `d${sides}`).join(","),
  };
}

export function normalizeEventSpecEvent(raw: any, deps: NormalizeEventSpecDepsEvent): DiceEventSpecEvent | null {
  if (!raw || typeof raw !== "object") return null;

  const id = normalizeStringFieldEvent(raw.id);
  const title = normalizeStringFieldEvent(raw.title);
  let checkDice = normalizeStringFieldEvent(raw.checkDice);
  const skill = normalizeStringFieldEvent(raw.skill);
  const timeLimitRaw = normalizeStringFieldEvent(raw.timeLimit);
  const desc = normalizeStringFieldEvent(raw.desc);
  const compare = normalizeCompareOperatorEvent(raw.compare);
  const scope = normalizeEventScopeTagEvent(raw.scope ?? raw.eventScope ?? raw.applyTo);
  const resolvedTarget = resolveEventTargetEvent(
    raw.target ?? { type: raw.targetType, name: raw.targetName ?? raw.targetLabel },
    scope
  );
  const rollMode = normalizeEventRollModeEvent(raw.rollMode);
  const advantageState = normalizeAdvantageStateEvent(
    raw.advantageState ?? raw.advantage ?? raw.advState
  );
  const rawDifficulty = raw.difficulty ?? raw.level ?? raw.challenge;
  const dcReason = normalizeDcReasonTextEvent(
    raw.dc_reason ?? raw.dcReason,
    id || "unknown_event",
    deps.OUTCOME_TEXT_MAX_LEN_Event
  );
  const aliasOutcomes = {
    success: raw.successOutcome,
    failure: raw.failureOutcome,
    explode: raw.explodeOutcome,
  };
  const outcomesRaw =
    raw.outcomes && typeof raw.outcomes === "object"
      ? { ...aliasOutcomes, ...(raw.outcomes as Record<string, any>) }
      : aliasOutcomes;
  const outcomes = normalizeOutcomesEvent(outcomesRaw, id || "unknown_event", deps.OUTCOME_TEXT_MAX_LEN_Event);
  const rawTimeLimitMs = parseIsoDurationToMsEvent(timeLimitRaw, deps.ISO_8601_DURATION_REGEX_Event);
  const settings = deps.getSettingsEvent();
  const timeLimitMs = applyTimeLimitPolicyMsEvent(rawTimeLimitMs, settings);
  const timeLimit = timeLimitRaw && rawTimeLimitMs != null ? timeLimitRaw : undefined;

  if (!id || !title || !checkDice || !skill || !desc) return null;
  if (compare == null) return null;

  try {
    parseDiceExpression(checkDice);
  } catch {
    return null;
  }

  if (!isDiceExpressionAllowedBySettingsEvent(checkDice, settings)) {
    const normalized = normalizeDiceExpressionByAllowedSidesEvent(checkDice, settings);
    if (normalized.changed) {
      logger.warn(
        `事件骰式不在已启用骰式列表中，自动修正: event=${id} from=${checkDice} to=${normalized.nextExpr} enabled=${normalized.allowedSidesText || "(未配置)"}`
      );
      checkDice = normalized.nextExpr;
    } else {
      const allowedText = normalizeStringFieldEvent(settings.aiAllowedDiceSidesText);
      logger.warn(
        `事件骰式不在已启用骰式列表中，已忽略: event=${id} checkDice=${checkDice} enabled=${allowedText || "(未配置)"}`
      );
      return null;
    }
  }

  const threshold = resolveEventThresholdEvent(
    id || "unknown_event",
    checkDice,
    compare ?? ">=",
    raw.dc,
    rawDifficulty,
    advantageState
  );
  if (!threshold || !Number.isFinite(threshold.dc)) return null;

  const finalDc = Number(threshold.dc);
  const mergedDcReason = (() => {
    const generatedReason = String(threshold.generatedDcReason ?? "").trim();
    const originalReason = String(dcReason ?? "").trim();
    if (generatedReason && originalReason) {
      return `${originalReason} ${generatedReason}`;
    }
    return originalReason || generatedReason || undefined;
  })();

  warnIfEventCheckImpossibleEvent(id, checkDice, compare, finalDc, advantageState);

  return {
    id,
    title,
    checkDice,
    dc: finalDc,
    difficulty: threshold.difficulty,
    dcSource: threshold.dcSource,
    compare,
    scope,
    rollMode,
    advantageState,
    skill,
    targetType: resolvedTarget.targetType,
    targetName: resolvedTarget.targetName,
    targetLabel: resolvedTarget.targetLabel,
    timeLimitMs,
    timeLimit,
    desc,
    dcReason: mergedDcReason,
    outcomes,
  };
}

export interface NormalizeEnvelopeDepsEvent extends NormalizeEventSpecDepsEvent { }

function normalizeRoundControlEndFlagEvent(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  const payload = raw as Record<string, any>;
  const endRoundRaw = payload.end_round ?? payload.endRound;
  if (endRoundRaw === true) return true;

  const roundControlText = normalizeStringFieldEvent(
    payload.round_control ?? payload.roundControl ?? payload.round_action ?? payload.roundAction
  ).toLowerCase();
  if (!roundControlText) return false;
  return (
    roundControlText === "end_round" ||
    roundControlText === "end" ||
    roundControlText === "close" ||
    roundControlText === "new_round"
  );
}

export function normalizeEnvelopeEvent(
  raw: any,
  deps: NormalizeEnvelopeDepsEvent
): { events: DiceEventSpecEvent[]; shouldEndRound: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.type !== "dice_events") return null;
  if (String(raw.version) !== "1") return null;
  if (!Array.isArray(raw.events)) return null;
  const shouldEndRound = normalizeRoundControlEndFlagEvent(raw);

  const events: DiceEventSpecEvent[] = [];
  for (const candidate of raw.events) {
    const normalized = normalizeEventSpecEvent(candidate, deps);
    if (!normalized) {
      logger.warn("丢弃非法事件字段", candidate);
      continue;
    }
    events.push(normalized);
  }
  if (events.length === 0 && !shouldEndRound) return null;
  return { events, shouldEndRound };
}

export function repairAndParseEventJsonEvent(rawInput: string): any | null {
  const base = String(rawInput || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\uFEFF/g, "")
    .trim();
  if (!base) return null;

  const variants: string[] = [];
  const pushVariant = (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (!variants.includes(v)) variants.push(v);
  };

  const normalizeTypography = (value: string): string =>
    value
      .replace(/[\u201C\u201D\uFF02]/g, '"')
      .replace(/[\u2018\u2019\uFF07]/g, "'")
      .replace(/[\uFF1A\uFE55]/g, ":")
      .replace(/[\uFF0C\u3001]/g, ",")
      .replace(/[\uFF08]/g, "(")
      .replace(/[\uFF09]/g, ")")
      .replace(/[\uFF3B\u3010]/g, "[")
      .replace(/[\uFF3D\u3011]/g, "]")
      .replace(/[\uFF5B]/g, "{")
      .replace(/[\uFF5D]/g, "}")
      .replace(/\u00A0/g, " ");

  const stripTrailingComma = (value: string): string => value.replace(/,\s*([}\]])/g, "$1");

  const stripCodeFence = (value: string): string =>
    value
      .replace(/^\s*```[a-zA-Z0-9_-]*\s*[\r\n]+/, "")
      .replace(/[\r\n]+\s*```\s*$/, "")
      .trim();

  const stripLeadingLanguageTag = (value: string): string =>
    value.replace(/^\s*(?:rolljson|json)\s*[\r\n]+/i, "").trim();

  const extractBalancedObjectFromStart = (value: string, start: number): string | null => {
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < value.length; i++) {
      const ch = value[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return value.slice(start, i + 1);
        }
      }
    }
    return null;
  };

  const extractBalancedObject = (value: string): string | null => {
    const start = value.indexOf("{");
    return extractBalancedObjectFromStart(value, start);
  };

  const extractObjectByDiceEventAnchor = (value: string): string | null => {
    const anchor = value.search(/"type"\s*:\s*"dice_events"/i);
    if (anchor < 0) return null;
    const start = value.lastIndexOf("{", anchor);
    return extractBalancedObjectFromStart(value, start);
  };

  const seedVariants = [
    base,
    stripCodeFence(base),
    stripLeadingLanguageTag(base),
    stripLeadingLanguageTag(stripCodeFence(base)),
  ];

  for (const seed of seedVariants) {
    if (!seed) continue;
    const normalizedSeed = normalizeTypography(seed);
    const seedNoTrailingComma = stripTrailingComma(seed);
    const normalizedNoTrailingComma = stripTrailingComma(normalizedSeed);

    pushVariant(seed);
    pushVariant(normalizedSeed);
    pushVariant(seedNoTrailingComma);
    pushVariant(normalizedNoTrailingComma);

    const balanced = extractBalancedObject(seed);
    if (balanced) {
      pushVariant(balanced);
      pushVariant(normalizeTypography(balanced));
      pushVariant(stripTrailingComma(balanced));
      pushVariant(stripTrailingComma(normalizeTypography(balanced)));
    }

    const normalizedBalanced = extractBalancedObject(normalizedSeed);
    if (normalizedBalanced) {
      pushVariant(normalizedBalanced);
      pushVariant(stripTrailingComma(normalizedBalanced));
    }

    const anchored = extractObjectByDiceEventAnchor(seed);
    if (anchored) {
      pushVariant(anchored);
      pushVariant(normalizeTypography(anchored));
      pushVariant(stripTrailingComma(anchored));
      pushVariant(stripTrailingComma(normalizeTypography(anchored)));
    }

    const normalizedAnchored = extractObjectByDiceEventAnchor(normalizedSeed);
    if (normalizedAnchored) {
      pushVariant(normalizedAnchored);
      pushVariant(stripTrailingComma(normalizedAnchored));
    }
  }

  for (const candidate of variants) {
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore
    }
  }
  return null;
}

export function decodeHtmlEntitiesEvent(input: string): string {
  try {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = input;
    return textarea.value;
  } catch {
    return input
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
}

function isRangeCoveredEvent(index: number, ranges: RemovalRangeEvent[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function countBareDiceEventMarkersEvent(input: string): number {
  const text = String(input ?? "");
  const markers = [
    /"type"\s*:\s*"dice_events"/i,
    /"version"\s*:\s*"1"/i,
    /"events"\s*:/i,
    /"id"\s*:/i,
    /"title"\s*:/i,
    /"checkDice"\s*:/i,
    /"difficulty"\s*:/i,
    /"desc"\s*:/i,
  ];
  return markers.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

/**
 * 功能：从正文尾部识别裸露的骰子事件控制块，并给出可删除区间。
 * 参数：
 *   text：完整消息文本。
 *   occupiedRanges：已被 fenced 或 HTML 代码块占用的区间。
 * 返回：
 *   { start: number; end: number; raw: string } | null：命中时返回裸控制块区间与文本。
 */
function findTrailingBareDiceEventRangeEvent(
  text: string,
  occupiedRanges: RemovalRangeEvent[]
): { start: number; end: number; raw: string } | null {
  const anchorRegex = /"type"\s*:\s*"dice_events"/gi;
  const matches = Array.from(text.matchAll(anchorRegex));
  if (matches.length <= 0) return null;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const anchor = matches[index];
    const anchorIndex = Number(anchor.index);
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0) continue;
    if (isRangeCoveredEvent(anchorIndex, occupiedRanges)) continue;

    const start = text.lastIndexOf("{", anchorIndex);
    if (start < 0) continue;
    if (isRangeCoveredEvent(start, occupiedRanges)) continue;

    const raw = decodeHtmlEntitiesEvent(text.slice(start)).trim();
    if (!raw) continue;
    if (!raw.startsWith("{")) continue;
    if (countBareDiceEventMarkersEvent(raw) < 3) continue;
    return {
      start,
      end: text.length,
      raw,
    };
  }

  return null;
}

export function parseEventEnvelopesEvent(
  text: string,
  deps: NormalizeEnvelopeDepsEvent
): { events: DiceEventSpecEvent[]; ranges: RemovalRangeEvent[]; shouldEndRound: boolean } {
  const regex = /```(?:rolljson|json)?\s*([\s\S]*?)```/gi;
  const ranges: RemovalRangeEvent[] = [];
  const events: DiceEventSpecEvent[] = [];
  let shouldEndRound = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = decodeHtmlEntitiesEvent(match[1] ?? "").trim();
    if (!raw) continue;
    const hasDiceEventType = /"type"\s*:\s*"dice_events"/i.test(raw);
    if (hasDiceEventType) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }

    let parsed: any;
    try {
      parsed = repairAndParseEventJsonEvent(raw);
      if (!parsed) throw new Error("无法修复为合法 JSON");
    } catch (error) {
      if (hasDiceEventType) {
        logger.warn("事件 JSON 解析失败，已隐藏代码块", error);
        if (shouldLogParseFailureRawEvent(raw)) {
          logger.debug("解析失败的原始文本:", raw);
        }
      }
      continue;
    }
    const normalized = normalizeEnvelopeEvent(parsed, deps);
    if (!normalized) continue;
    events.push(...normalized.events);
    if (normalized.shouldEndRound) shouldEndRound = true;
  }

  const htmlRegex = /<pre\b[\s\S]*?<\/pre>/gi;
  while ((match = htmlRegex.exec(text)) !== null) {
    const preBlock = match[0];
    const codeMatch = preBlock.match(/<code\b[^>]*>([\s\S]*?)<\/code>/i);
    const rawInner = (codeMatch ? codeMatch[1] : preBlock).replace(/<[^>]+>/g, "");
    const raw = decodeHtmlEntitiesEvent(rawInner).trim();
    if (!raw) continue;

    const hasDiceEventType = /"type"\s*:\s*"dice_events"/i.test(raw);
    if (hasDiceEventType) {
      ranges.push({ start: match.index, end: match.index + preBlock.length });
    }

    let parsed: any;
    try {
      parsed = repairAndParseEventJsonEvent(raw);
      if (!parsed) throw new Error("无法修复为合法 JSON");
    } catch (error) {
      if (hasDiceEventType) {
        logger.warn("HTML 事件 JSON解析失败，已隐藏代码块", error);
      }
      continue;
    }

    const normalized = normalizeEnvelopeEvent(parsed, deps);
    if (!normalized) continue;
    events.push(...normalized.events);
    if (normalized.shouldEndRound) shouldEndRound = true;
  }

  const bareTail = findTrailingBareDiceEventRangeEvent(text, ranges);
  if (bareTail) {
    let parsed: any = null;
    try {
      parsed = repairAndParseEventJsonEvent(bareTail.raw);
    } catch (error) {
      logger.warn("正文尾部裸事件 JSON 修复失败，将仅执行清理。", error);
    }

    ranges.push({ start: bareTail.start, end: bareTail.end });

    if (parsed) {
      const normalized = normalizeEnvelopeEvent(parsed, deps);
      if (normalized) {
        events.push(...normalized.events);
        if (normalized.shouldEndRound) shouldEndRound = true;
      }
    } else {
      logger.warn("正文尾部检测到损坏的裸 dice_events 控制块，已按清理区间移除。");
    }
  }

  return { events, ranges, shouldEndRound };
}

export function removeRangesEvent(
  text: string,
  ranges: RemovalRangeEvent[],
  normalizeBlankLinesEvent: (input: string) => string
): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let output = "";
  for (const range of sorted) {
    if (range.start > cursor) {
      output += text.slice(cursor, range.start);
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < text.length) output += text.slice(cursor);
  return normalizeBlankLinesEvent(output);
}
