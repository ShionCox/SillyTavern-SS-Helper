import type {
  CompareOperatorEvent,
  DicePluginSettingsEvent,
  EventDifficultyLevelEvent,
  InteractiveTriggerEvent,
  TavernMessageEvent,
  TriggerPackDefaultsEvent,
  TriggerPackEvent,
  TriggerPackItemEvent,
  TriggerPackRevealModeEvent,
} from "../types/eventDomainEvent";
import { normalizeDifficultyLevelEvent } from "./parserEvent";

export const RH_TRIGGER_METADATA_KEY_Event = "rollhelper_interactive_triggers_v1";
export const RH_TRIGGER_PACK_METADATA_KEY_Event = "rollhelper_trigger_pack_v1";

const RH_TRIGGER_REGEX_Event = /<rh-trigger\b([^>]*)>([\s\S]*?)<\/rh-trigger>/gi;
const TRIGGER_PACK_BLOCK_REGEX_Event = /```(?:triggerpack|json|rolljson)?\s*([\s\S]*?)```/gi;

function normalizeTextEvent(value: unknown): string {
  return String(value ?? "");
}

function normalizeInlineTextEvent(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseBooleanTextEvent(value: string): boolean {
  const normalized = normalizeInlineTextEvent(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "blind";
}

function normalizeCompareOperatorTextEvent(raw: unknown): CompareOperatorEvent | undefined {
  const value = normalizeInlineTextEvent(raw);
  if (value === ">=" || value === ">" || value === "<=" || value === "<") return value;
  return undefined;
}

function normalizeRevealModeEvent(raw: unknown): TriggerPackRevealModeEvent {
  return normalizeInlineTextEvent(raw).toLowerCase() === "instant" ? "instant" : "delayed";
}

function normalizeShortFeedbackTextEvent(value: unknown): string | undefined {
  const text = normalizeInlineTextEvent(value);
  if (!text) return undefined;
  return text.slice(0, 120);
}

/**
 * 功能：把交互触发难度转换为提示文案。
 * @param difficulty 交互触发难度。
 * @returns 适合 tooltip 显示的中文难度文本。
 */
function normalizeDifficultyTextForTooltipEvent(
  difficulty: EventDifficultyLevelEvent | undefined
): string {
  if (difficulty === "easy") return "简单";
  if (difficulty === "hard") return "困难";
  if (difficulty === "extreme") return "极难";
  if (difficulty === "normal") return "普通";
  return "";
}

/**
 * 功能：把交互触发的动作与技能整理成更自然的中文短语。
 * @param trigger 当前交互触发配置。
 * @returns 适合直接展示给玩家的检定名称。
 */
function formatTriggerCheckNameEvent(trigger: InteractiveTriggerEvent): string {
  const action = normalizeInlineTextEvent(trigger.action || trigger.skill || "检定");
  const skill = normalizeInlineTextEvent(trigger.skill || trigger.action || "检定");
  if (!action && !skill) return "检定";
  if (!action) return skill;
  if (!skill) return action;
  if (action === skill) return skill;
  if (action === "回忆") return `回忆（${skill}）`;
  return skill;
}

function parseDefaultBlindSkillsEvent(settings?: { defaultBlindSkillsText?: string } | null): Set<string> {
  return new Set(
    String(settings?.defaultBlindSkillsText ?? "")
      .split(/[\n,|]+/)
      .map((item) => normalizeInlineTextEvent(item).toLowerCase())
      .filter(Boolean)
  );
}

function parseTriggerAttributesEvent(attrText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(String(attrText ?? "")))) {
    result[String(match[1] ?? "").trim().toLowerCase()] = String(match[2] ?? "");
  }
  return result;
}

function getActiveSwipeRecordEvent(message: TavernMessageEvent): Record<string, unknown> | null {
  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  const swipes = (message as any)?.swipes;
  if (!Array.isArray(swipes) || !Number.isFinite(swipeId) || swipeId < 0 || swipeId >= swipes.length) {
    return null;
  }
  const activeSwipe = swipes[swipeId];
  return activeSwipe && typeof activeSwipe === "object" ? activeSwipe as Record<string, unknown> : null;
}

export function getActiveSwipeExtraContainerEvent(
  message: TavernMessageEvent,
  create = false
): Record<string, unknown> | null {
  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  if (!Number.isFinite(swipeId) || swipeId < 0) return null;

  const record = message as Record<string, unknown>;
  let swipeInfo = record.swipe_info;
  if (!Array.isArray(swipeInfo)) {
    if (!create) return null;
    swipeInfo = [];
    record.swipe_info = swipeInfo;
  }

  while ((swipeInfo as unknown[]).length <= swipeId) {
    (swipeInfo as unknown[]).push({});
  }

  let infoRecord = (swipeInfo as unknown[])[swipeId];
  if (!infoRecord || typeof infoRecord !== "object") {
    if (!create) return null;
    infoRecord = {};
    (swipeInfo as unknown[])[swipeId] = infoRecord;
  }

  let extra = (infoRecord as Record<string, unknown>).extra;
  if (!extra || typeof extra !== "object") {
    if (!create) return null;
    extra = {};
    (infoRecord as Record<string, unknown>).extra = extra;
  }
  return extra as Record<string, unknown>;
}

function getMessageTextFieldEvent(record: Record<string, unknown>): string {
  if (typeof record.mes === "string") return record.mes;
  if (typeof record.content === "string") return record.content;
  if (typeof record.text === "string") return record.text;
  return "";
}

export function getActiveMessageTextEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  const swipes = (message as any)?.swipes;
  if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
    const activeSwipe = swipes[swipeId];
    if (typeof activeSwipe === "string") return activeSwipe;
  }
  const activeSwipe = getActiveSwipeRecordEvent(message);
  if (activeSwipe) {
    const swipeText = getMessageTextFieldEvent(activeSwipe);
    if (swipeText) return swipeText;
  }
  return getMessageTextFieldEvent(message as Record<string, unknown>);
}

export function setActiveMessageTextEvent(message: TavernMessageEvent, nextTextRaw: string): void {
  const nextText = normalizeTextEvent(nextTextRaw);
  const record = message as Record<string, unknown>;

  if (typeof record.mes !== "undefined") record.mes = nextText;
  if (typeof record.content === "string") {
    record.content = nextText;
  } else if (Array.isArray(record.content)) {
    const items = record.content as unknown[];
    if (items.length > 0 && typeof items[0] === "string") {
      record.content = [nextText];
    } else if (items.length > 0 && items[0] && typeof items[0] === "object") {
      const first = items[0] as Record<string, unknown>;
      if (typeof first.text === "string") {
        items[0] = { ...first, text: nextText };
      } else if (typeof first.content === "string") {
        items[0] = { ...first, content: nextText };
      }
    } else if (items.length === 0) {
      record.content = [nextText];
    }
  }
  if (typeof record.text !== "undefined") record.text = nextText;

  const swipeId = Number((message as any)?.swipe_id ?? (message as any)?.swipeId);
  const swipes = (message as any)?.swipes;
  if (!Array.isArray(swipes) || !Number.isFinite(swipeId) || swipeId < 0 || swipeId >= swipes.length) {
    return;
  }
  const activeSwipe = swipes[swipeId];
  if (typeof activeSwipe === "string") {
    swipes[swipeId] = nextText;
    return;
  }
  if (activeSwipe && typeof activeSwipe === "object") {
    const swipeRecord = activeSwipe as Record<string, unknown>;
    if (typeof swipeRecord.mes !== "undefined") swipeRecord.mes = nextText;
    if (typeof swipeRecord.content !== "undefined") swipeRecord.content = nextText;
    if (typeof swipeRecord.text !== "undefined") swipeRecord.text = nextText;
  }
}

function normalizeInteractiveTriggerEvent(input: unknown): InteractiveTriggerEvent | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const label = normalizeInlineTextEvent(record.label);
  if (!label) return null;
  const occurrenceIndexRaw = Number(record.occurrenceIndex);
  return {
    triggerId: normalizeInlineTextEvent(record.triggerId) || `${label}:${Number.isFinite(occurrenceIndexRaw) ? occurrenceIndexRaw : 0}`,
    label,
    action: normalizeInlineTextEvent(record.action) || "调查",
    skill: normalizeInlineTextEvent(record.skill) || normalizeInlineTextEvent(record.action) || "调查",
    blind: Boolean(record.blind),
    sourceMessageId: normalizeInlineTextEvent(record.sourceMessageId),
    sourceId: normalizeInlineTextEvent(record.sourceId) || label,
    textRange: null,
    dcHint: Number.isFinite(Number(record.dcHint)) ? Math.floor(Number(record.dcHint)) : null,
    difficulty: normalizeDifficultyLevelEvent(record.difficulty) || "normal",
    loreType: normalizeInlineTextEvent(record.loreType),
    note: normalizeInlineTextEvent(record.note),
    diceExpr: normalizeInlineTextEvent(record.diceExpr) || "1d20",
    compare: normalizeCompareOperatorTextEvent(record.compare),
    revealMode: normalizeRevealModeEvent(record.revealMode),
    triggerPackSourceId: normalizeInlineTextEvent(record.triggerPackSourceId) || normalizeInlineTextEvent(record.sourceId) || label,
    triggerPackSuccessText: normalizeShortFeedbackTextEvent(record.triggerPackSuccessText),
    triggerPackFailureText: normalizeShortFeedbackTextEvent(record.triggerPackFailureText),
    triggerPackExplodeText: normalizeShortFeedbackTextEvent(record.triggerPackExplodeText),
    occurrenceIndex: Number.isFinite(occurrenceIndexRaw) && occurrenceIndexRaw >= 0 ? Math.floor(occurrenceIndexRaw) : 0,
  };
}

function normalizeTriggerPackDefaultsEvent(input: unknown): TriggerPackDefaultsEvent | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const dice = normalizeInlineTextEvent(record.dice);
  const compare = normalizeCompareOperatorTextEvent(record.compare);
  if (!dice && !compare) return undefined;
  return {
    dice: dice || undefined,
    compare,
  };
}

function normalizeTriggerPackItemEvent(input: unknown, defaults?: TriggerPackDefaultsEvent): TriggerPackItemEvent | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const sid = normalizeInlineTextEvent(record.sid || record.sourceId);
  const skill = normalizeInlineTextEvent(record.skill);
  if (!sid || !skill) return null;
  return {
    sid,
    skill,
    difficulty: normalizeDifficultyLevelEvent(record.difficulty) || "normal",
    reveal: normalizeRevealModeEvent(record.reveal),
    success: normalizeShortFeedbackTextEvent(record.success),
    failure: normalizeShortFeedbackTextEvent(record.failure),
    explode: normalizeShortFeedbackTextEvent(record.explode),
    dice: normalizeInlineTextEvent(record.dice) || defaults?.dice,
    compare: normalizeCompareOperatorTextEvent(record.compare) || defaults?.compare,
  };
}

function normalizeTriggerPackEvent(input: unknown): TriggerPackEvent | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  if (record.type !== "trigger_pack" || String(record.version) !== "1" || !Array.isArray(record.items)) {
    return null;
  }
  const defaults = normalizeTriggerPackDefaultsEvent(record.defaults);
  const items = record.items
    .map((item) => normalizeTriggerPackItemEvent(item, defaults))
    .filter((item): item is TriggerPackItemEvent => Boolean(item));
  if (items.length <= 0) return null;
  return {
    type: "trigger_pack",
    version: "1",
    defaults,
    items,
  };
}

function mergeTriggerWithPackItemEvent(
  trigger: InteractiveTriggerEvent,
  packItem: TriggerPackItemEvent | undefined
): InteractiveTriggerEvent {
  if (!packItem) return trigger;
  return {
    ...trigger,
    skill: packItem.skill || trigger.skill,
    difficulty: packItem.difficulty || trigger.difficulty,
    diceExpr: packItem.dice || trigger.diceExpr || "1d20",
    compare: packItem.compare || trigger.compare,
    revealMode: packItem.reveal,
    triggerPackSourceId: packItem.sid,
    triggerPackSuccessText: packItem.success,
    triggerPackFailureText: packItem.failure,
    triggerPackExplodeText: packItem.explode,
  };
}

export function getMessageInteractiveTriggersEvent(message: TavernMessageEvent | undefined): InteractiveTriggerEvent[] {
  if (!message || typeof message !== "object") return [];
  const pack = getMessageTriggerPackEvent(message);
  const packItems = new Map((pack?.items || []).map((item) => [item.sid, item]));
  const containers: Array<Record<string, unknown> | null> = [
    getActiveSwipeExtraContainerEvent(message, false),
    (() => {
      const record = message as Record<string, unknown>;
      return record.extra && typeof record.extra === "object"
        ? record.extra as Record<string, unknown>
        : null;
    })(),
  ];
  for (const container of containers) {
    const raw = container?.[RH_TRIGGER_METADATA_KEY_Event];
    if (!Array.isArray(raw)) continue;
    return raw
      .map((item) => normalizeInteractiveTriggerEvent(item))
      .map((item) => {
        if (!item) return null;
        const sourceId = normalizeInlineTextEvent(item.triggerPackSourceId || item.sourceId || item.label);
        return mergeTriggerWithPackItemEvent(item, packItems.get(sourceId));
      })
      .filter((item): item is InteractiveTriggerEvent => Boolean(item));
  }
  return [];
}

export function getMessageTriggerPackEvent(message: TavernMessageEvent | undefined): TriggerPackEvent | null {
  if (!message || typeof message !== "object") return null;
  const containers: Array<Record<string, unknown> | null> = [
    getActiveSwipeExtraContainerEvent(message, false),
    (() => {
      const record = message as Record<string, unknown>;
      return record.extra && typeof record.extra === "object"
        ? record.extra as Record<string, unknown>
        : null;
    })(),
  ];
  for (const container of containers) {
    const normalized = normalizeTriggerPackEvent(container?.[RH_TRIGGER_PACK_METADATA_KEY_Event]);
    if (normalized) return normalized;
  }
  return null;
}

export function setMessageInteractiveTriggersEvent(
  message: TavernMessageEvent,
  triggers: InteractiveTriggerEvent[]
): void {
  const serialized = triggers.map((trigger) => ({
    triggerId: normalizeInlineTextEvent(trigger.triggerId),
    label: normalizeInlineTextEvent(trigger.label),
    action: normalizeInlineTextEvent(trigger.action),
    skill: normalizeInlineTextEvent(trigger.skill),
    blind: Boolean(trigger.blind),
    sourceMessageId: normalizeInlineTextEvent(trigger.sourceMessageId),
    sourceId: normalizeInlineTextEvent(trigger.sourceId),
    dcHint: Number.isFinite(Number(trigger.dcHint)) ? Math.floor(Number(trigger.dcHint)) : null,
    difficulty: normalizeDifficultyLevelEvent(trigger.difficulty) || "normal",
    note: normalizeInlineTextEvent(trigger.note),
    loreType: normalizeInlineTextEvent(trigger.loreType),
    diceExpr: normalizeInlineTextEvent(trigger.diceExpr) || "1d20",
    compare: normalizeCompareOperatorTextEvent(trigger.compare),
    revealMode: normalizeRevealModeEvent(trigger.revealMode),
    triggerPackSourceId: normalizeInlineTextEvent(trigger.triggerPackSourceId),
    triggerPackSuccessText: normalizeShortFeedbackTextEvent(trigger.triggerPackSuccessText),
    triggerPackFailureText: normalizeShortFeedbackTextEvent(trigger.triggerPackFailureText),
    triggerPackExplodeText: normalizeShortFeedbackTextEvent(trigger.triggerPackExplodeText),
    occurrenceIndex: Number.isFinite(Number(trigger.occurrenceIndex)) ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex))) : 0,
  }));

  const record = message as Record<string, unknown>;
  let messageExtra = record.extra;
  if (!messageExtra || typeof messageExtra !== "object") {
    messageExtra = {};
    record.extra = messageExtra;
  }
  if (serialized.length > 0) {
    (messageExtra as Record<string, unknown>)[RH_TRIGGER_METADATA_KEY_Event] = serialized;
  } else {
    delete (messageExtra as Record<string, unknown>)[RH_TRIGGER_METADATA_KEY_Event];
  }

  const swipeExtra = getActiveSwipeExtraContainerEvent(message, true);
  if (swipeExtra) {
    if (serialized.length > 0) {
      swipeExtra[RH_TRIGGER_METADATA_KEY_Event] = serialized;
    } else {
      delete swipeExtra[RH_TRIGGER_METADATA_KEY_Event];
    }
  }
}

export function setMessageTriggerPackEvent(
  message: TavernMessageEvent,
  triggerPack: TriggerPackEvent | null
): void {
  const serialized = triggerPack
    ? {
        type: "trigger_pack" as const,
        version: "1" as const,
        defaults: triggerPack.defaults
          ? {
              dice: normalizeInlineTextEvent(triggerPack.defaults.dice) || undefined,
              compare: normalizeCompareOperatorTextEvent(triggerPack.defaults.compare),
            }
          : undefined,
        items: triggerPack.items.map((item) => ({
          sid: normalizeInlineTextEvent(item.sid),
          skill: normalizeInlineTextEvent(item.skill),
          difficulty: normalizeDifficultyLevelEvent(item.difficulty) || "normal",
          reveal: normalizeRevealModeEvent(item.reveal),
          success: normalizeShortFeedbackTextEvent(item.success),
          failure: normalizeShortFeedbackTextEvent(item.failure),
          explode: normalizeShortFeedbackTextEvent(item.explode),
          dice: normalizeInlineTextEvent(item.dice) || undefined,
          compare: normalizeCompareOperatorTextEvent(item.compare),
        })),
      }
    : null;

  const containers = [
    (() => {
      const record = message as Record<string, unknown>;
      let extra = record.extra;
      if (!extra || typeof extra !== "object") {
        extra = {};
        record.extra = extra;
      }
      return extra as Record<string, unknown>;
    })(),
    getActiveSwipeExtraContainerEvent(message, true),
  ].filter((container): container is Record<string, unknown> => Boolean(container));

  for (const container of containers) {
    if (serialized) {
      container[RH_TRIGGER_PACK_METADATA_KEY_Event] = serialized;
    } else {
      delete container[RH_TRIGGER_PACK_METADATA_KEY_Event];
    }
  }
}

function parseTriggerPackMetadataFromTextEvent(text: string): {
  cleanText: string;
  triggerPack: TriggerPackEvent | null;
  foundTriggerPack: boolean;
} {
  const ranges: Array<{ start: number; end: number }> = [];
  let mergedDefaults: TriggerPackDefaultsEvent | undefined;
  const items = new Map<string, TriggerPackItemEvent>();
  let foundTriggerPack = false;
  let match: RegExpExecArray | null = null;

  while ((match = TRIGGER_PACK_BLOCK_REGEX_Event.exec(text)) !== null) {
    const raw = normalizeTextEvent(match[1]);
    if (!/"type"\s*:\s*"trigger_pack"/i.test(raw)) continue;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const normalized = normalizeTriggerPackEvent(parsed);
    if (!normalized) continue;
    foundTriggerPack = true;
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (normalized.defaults) {
      mergedDefaults = {
        ...mergedDefaults,
        ...normalized.defaults,
      };
    }
    for (const item of normalized.items) {
      items.set(item.sid, item);
    }
  }

  if (!foundTriggerPack) {
    return {
      cleanText: text,
      triggerPack: null,
      foundTriggerPack: false,
    };
  }

  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let output = "";
  for (const range of sortedRanges) {
    if (range.start > cursor) {
      output += text.slice(cursor, range.start);
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < text.length) {
    output += text.slice(cursor);
  }

  return {
    cleanText: normalizeTextEvent(output).replace(/\n{3,}/g, "\n\n").trim(),
    triggerPack: items.size > 0
      ? {
          type: "trigger_pack",
          version: "1",
          defaults: mergedDefaults,
          items: Array.from(items.values()),
        }
      : null,
    foundTriggerPack: true,
  };
}

export function stripInteractiveTriggerMarkupFromTextEvent(text: string): string {
  return normalizeTextEvent(text).replace(RH_TRIGGER_REGEX_Event, (_full, _attrs, bodyText) => {
    const label = normalizeInlineTextEvent(bodyText);
    return label;
  });
}

export function parseInteractiveTriggerMetadataFromTextEvent(
  text: string,
  options?: {
    settings?: { defaultBlindSkillsText?: string } | null;
    sourceMessageId?: string;
  }
): {
  cleanText: string;
  triggers: InteractiveTriggerEvent[];
  foundTriggerMarkup: boolean;
  triggerPack: TriggerPackEvent | null;
  foundTriggerPack: boolean;
} {
  const sourceMessageId = normalizeInlineTextEvent(options?.sourceMessageId);
  const blindSkills = parseDefaultBlindSkillsEvent(options?.settings);
  const triggerPackParsed = parseTriggerPackMetadataFromTextEvent(text);
  const occurrences = new Map<string, number>();
  const triggers: InteractiveTriggerEvent[] = [];
  let foundTriggerMarkup = false;
  const packItems = new Map((triggerPackParsed.triggerPack?.items || []).map((item) => [item.sid, item]));

  const cleanText = normalizeTextEvent(triggerPackParsed.cleanText).replace(RH_TRIGGER_REGEX_Event, (full, attrText, bodyText) => {
    foundTriggerMarkup = true;
    const attrs = parseTriggerAttributesEvent(String(attrText ?? ""));
    const label = normalizeInlineTextEvent(bodyText || attrs.label || "");
    if (!label) return "";
    const skill = normalizeInlineTextEvent(attrs.skill || attrs.action || "调查");
    const action = normalizeInlineTextEvent(attrs.action || skill || "调查");
    const difficulty = normalizeDifficultyLevelEvent(attrs.difficulty) || "normal";
    const labelKey = label.toLowerCase();
    const occurrenceIndex = occurrences.get(labelKey) ?? 0;
    occurrences.set(labelKey, occurrenceIndex + 1);

    const sourceId = normalizeInlineTextEvent(attrs.sourceid) || `${sourceMessageId || "msg"}:${labelKey}:${occurrenceIndex}`;
    const packItem = packItems.get(sourceId);
    triggers.push(mergeTriggerWithPackItemEvent({
      triggerId: normalizeInlineTextEvent(attrs.triggerid) || `${sourceMessageId || "msg"}:${labelKey}:${occurrenceIndex}`,
      label,
      action,
      skill,
      blind: attrs.blind ? parseBooleanTextEvent(attrs.blind) : blindSkills.has(skill.toLowerCase()),
      sourceMessageId,
      sourceId,
      textRange: null,
      dcHint: Number.isFinite(Number(attrs.dchint)) ? Math.floor(Number(attrs.dchint)) : null,
      difficulty,
      loreType: normalizeInlineTextEvent(attrs.loretype),
      note: normalizeInlineTextEvent(attrs.note),
      diceExpr: normalizeInlineTextEvent(attrs.diceexpr) || "1d20",
      compare: normalizeCompareOperatorTextEvent(attrs.compare),
      revealMode: "delayed",
      triggerPackSourceId: sourceId,
      occurrenceIndex,
    }, packItem));

    void full;
    return label;
  });

  return {
    cleanText,
    triggers,
    foundTriggerMarkup,
    triggerPack: triggerPackParsed.triggerPack,
    foundTriggerPack: triggerPackParsed.foundTriggerPack,
  };
}

export function sanitizeMessageInteractiveTriggersEvent(
  message: TavernMessageEvent,
  options?: {
    settings?: { defaultBlindSkillsText?: string } | null;
    sourceMessageId?: string;
  }
): boolean {
  const rawText = getActiveMessageTextEvent(message);
  if (!rawText) return false;

  const parsed = parseInteractiveTriggerMetadataFromTextEvent(rawText, options);
  const previousTriggers = getMessageInteractiveTriggersEvent(message);
  const previousTriggerPack = getMessageTriggerPackEvent(message);
  if (!parsed.foundTriggerMarkup && !parsed.foundTriggerPack) {
    let cleared = false;
    if (previousTriggers.length > 0) {
      setMessageInteractiveTriggersEvent(message, []);
      cleared = true;
    }
    if (previousTriggerPack) {
      setMessageTriggerPackEvent(message, null);
      cleared = true;
    }
    return cleared;
  }

  setActiveMessageTextEvent(message, parsed.cleanText);
  setMessageInteractiveTriggersEvent(message, parsed.foundTriggerMarkup ? parsed.triggers : []);
  setMessageTriggerPackEvent(message, parsed.foundTriggerPack ? parsed.triggerPack : null);
  return true;
}

/**
 * 功能：生成交互触发的纯文本提示，优先用于不支持 HTML 的场景。
 * @param trigger 当前交互触发配置。
 * @returns 面向玩家的中文提示文本。
 */
export function buildInteractiveTriggerTooltipTextEvent(trigger: InteractiveTriggerEvent): string {
  const label = normalizeInlineTextEvent(trigger.label || "该线索");
  const checkName = formatTriggerCheckNameEvent(trigger);
  const difficulty = normalizeDifficultyTextForTooltipEvent(trigger.difficulty);
  const revealText = trigger.revealMode === "instant"
    ? "命中后会立刻给出一条简短反馈。"
    : "命中后若为暗骰，会先记录状态，再通过后续叙事体现。";
  const visibility = trigger.blind
    ? "点击后会进行暗骰检定，不直接公开点数，只告诉你是否通过。"
    : "点击后会进行明骰检定，并直接显示结果。";
  return `${label} · 可进行${checkName}${trigger.blind ? "暗骰" : "检定"}${difficulty ? ` · 难度：${difficulty}` : ""} · ${visibility} · ${revealText}`;
}

/**
 * 功能：生成交互触发的 HTML 提示内容。
 * @param trigger 当前交互触发配置。
 * @returns 可直接挂到 tooltip 的 HTML 字符串。
 */
export function buildInteractiveTriggerTooltipHtmlEvent(trigger: InteractiveTriggerEvent): string {
  const label = normalizeInlineTextEvent(trigger.label || "该线索");
  const checkName = formatTriggerCheckNameEvent(trigger);
  const difficulty = normalizeDifficultyTextForTooltipEvent(trigger.difficulty);
  const visibilityTitle = trigger.blind ? "暗骰检定" : "明骰检定";
  const visibilityDesc = trigger.blind
    ? "不会公开显示点数，只提示是否通过。"
    : "会公开显示点数与检定结果。";
  const revealDesc = trigger.revealMode === "instant"
    ? "体现方式：命中后立即返回短反馈。"
    : "体现方式：默认走后续叙事体现。";
  return `<span class="st-rh-trigger-tip"><strong>${label}</strong><br>可进行${checkName}${trigger.blind ? "暗骰" : "检定"}<br>${visibilityTitle}：${visibilityDesc}${difficulty ? `<br>难度：${difficulty}` : ""}<br>${revealDesc}</span>`;
}
