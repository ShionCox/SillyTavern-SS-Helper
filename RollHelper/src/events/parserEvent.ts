import { parseDiceExpression } from "../core/diceEngineEvent";
import type {
  AdvantageStateEvent,
  CompareOperatorEvent,
  DiceEventSpecEvent,
  DicePluginSettingsEvent,
  EventOutcomesEvent,
  EventRollModeEvent,
  EventScopeTagEvent,
  EventTargetTypeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";

export type RemovalRangeEvent = { start: number; end: number };

export function normalizeCompareOperatorEvent(raw: any): CompareOperatorEvent | null {
  if (raw == null || raw === "") return ">=";
  if (raw === ">=" || raw === ">" || raw === "<=" || raw === "<") return raw;
  return null;
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
  if (!text) return null;
  const parts = text
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0 && Number.isInteger(value));
  if (parts.length === 0) return null;
  return new Set(parts);
}

export function isDiceExpressionAllowedBySettingsEvent(
  checkDice: string,
  settings: DicePluginSettingsEvent
): boolean {
  const allowedSidesSet = parseAllowedDiceSidesSetEvent(settings.aiAllowedDiceSidesText);
  if (!allowedSidesSet || allowedSidesSet.size === 0) return true;
  try {
    const parsed = parseDiceExpression(checkDice);
    return allowedSidesSet.has(parsed.sides);
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
    return { nextExpr: checkDice, changed: false, allowedSidesText: "" };
  }

  const parsed = parseDiceExpression(checkDice);
  if (allowedSidesSet!.has(parsed.sides)) {
    return {
      nextExpr: checkDice,
      changed: false,
      allowedSidesText: allowedSides.join(","),
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
    allowedSidesText: allowedSides.join(","),
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
  const dc = Number(raw.dc);
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
  if (!Number.isFinite(dc)) return null;

  try {
    parseDiceExpression(checkDice);
  } catch {
    return null;
  }

  if (!isDiceExpressionAllowedBySettingsEvent(checkDice, settings)) {
    const normalized = normalizeDiceExpressionByAllowedSidesEvent(checkDice, settings);
    if (normalized.changed) {
      logger.warn(
        `事件骰式不在允许面数列表中，自动修正: event=${id} from=${checkDice} to=${normalized.nextExpr} allowed=${normalized.allowedSidesText || "(未配置)"}`
      );
      checkDice = normalized.nextExpr;
    } else {
      const allowedText = normalizeStringFieldEvent(settings.aiAllowedDiceSidesText);
      logger.warn(
        `事件骰式不在允许面数列表中，已忽略: event=${id} checkDice=${checkDice} allowed=${allowedText || "(未配置)"}`
      );
      return null;
    }
  }

  return {
    id,
    title,
    checkDice,
    dc,
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
    dcReason,
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
    .replace(/[\u200B-\u200D\u2060]/g, "")
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
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/：/g, ":")
      .replace(/，/g, ",")
      .replace(/\u00A0/g, " ");

  const stripTrailingComma = (value: string): string => value.replace(/,\s*([}\]])/g, "$1");

  const stripCodeFence = (value: string): string =>
    value
      .replace(/^\s*```[a-zA-Z0-9_-]*\s*[\r\n]+/, "")
      .replace(/[\r\n]+\s*```\s*$/, "")
      .trim();

  const stripLeadingLanguageTag = (value: string): string =>
    value.replace(/^\s*(?:rolljson|json)\s*[\r\n]+/i, "").trim();

  const extractBalancedObject = (value: string): string | null => {
    const start = value.indexOf("{");
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

  const seedVariants = [
    base,
    stripCodeFence(base),
    stripLeadingLanguageTag(base),
    stripLeadingLanguageTag(stripCodeFence(base)),
  ];

  for (const seed of seedVariants) {
    if (!seed) continue;
    pushVariant(seed);
    pushVariant(normalizeTypography(seed));
    pushVariant(stripTrailingComma(seed));
    pushVariant(stripTrailingComma(normalizeTypography(seed)));

    const balanced = extractBalancedObject(seed);
    if (balanced) {
      pushVariant(balanced);
      pushVariant(normalizeTypography(balanced));
      pushVariant(stripTrailingComma(balanced));
      pushVariant(stripTrailingComma(normalizeTypography(balanced)));
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
