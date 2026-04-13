import type {
  DicePluginSettingsEvent,
  InteractiveTriggerEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";

export const RH_TRIGGER_METADATA_KEY_Event = "rollhelper_interactive_triggers_v1";

const RH_TRIGGER_REGEX_Event = /\[{1,2}rh-trigger([^\]]*)\]{1,2}([\s\S]*?)\[{1,2}\/rh-trigger\]{1,2}/gi;

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

function getActiveSwipeExtraContainerEvent(
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
    loreType: normalizeInlineTextEvent(record.loreType),
    note: normalizeInlineTextEvent(record.note),
    diceExpr: normalizeInlineTextEvent(record.diceExpr) || "1d20",
    occurrenceIndex: Number.isFinite(occurrenceIndexRaw) && occurrenceIndexRaw >= 0 ? Math.floor(occurrenceIndexRaw) : 0,
  };
}

export function getMessageInteractiveTriggersEvent(message: TavernMessageEvent | undefined): InteractiveTriggerEvent[] {
  if (!message || typeof message !== "object") return [];
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
      .filter((item): item is InteractiveTriggerEvent => Boolean(item));
  }
  return [];
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
    note: normalizeInlineTextEvent(trigger.note),
    loreType: normalizeInlineTextEvent(trigger.loreType),
    diceExpr: normalizeInlineTextEvent(trigger.diceExpr) || "1d20",
    occurrenceIndex: Number.isFinite(Number(trigger.occurrenceIndex)) ? Math.max(0, Math.floor(Number(trigger.occurrenceIndex))) : 0,
  }));

  const record = message as Record<string, unknown>;
  let messageExtra = record.extra;
  if (!messageExtra || typeof messageExtra !== "object") {
    messageExtra = {};
    record.extra = messageExtra;
  }
  (messageExtra as Record<string, unknown>)[RH_TRIGGER_METADATA_KEY_Event] = serialized;

  const swipeExtra = getActiveSwipeExtraContainerEvent(message, true);
  if (swipeExtra) {
    swipeExtra[RH_TRIGGER_METADATA_KEY_Event] = serialized;
  }
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
  foundLegacyMarkup: boolean;
} {
  const sourceMessageId = normalizeInlineTextEvent(options?.sourceMessageId);
  const blindSkills = parseDefaultBlindSkillsEvent(options?.settings);
  const occurrences = new Map<string, number>();
  const triggers: InteractiveTriggerEvent[] = [];
  let foundLegacyMarkup = false;

  const cleanText = normalizeTextEvent(text).replace(RH_TRIGGER_REGEX_Event, (full, attrText, bodyText) => {
    foundLegacyMarkup = true;
    const attrs = parseTriggerAttributesEvent(String(attrText ?? ""));
    const label = normalizeInlineTextEvent(bodyText || attrs.label || "");
    if (!label) return "";
    const skill = normalizeInlineTextEvent(attrs.skill || attrs.action || "调查");
    const action = normalizeInlineTextEvent(attrs.action || skill || "调查");
    const labelKey = label.toLowerCase();
    const occurrenceIndex = occurrences.get(labelKey) ?? 0;
    occurrences.set(labelKey, occurrenceIndex + 1);

    triggers.push({
      triggerId: normalizeInlineTextEvent(attrs.triggerid) || `${sourceMessageId || "msg"}:${labelKey}:${occurrenceIndex}`,
      label,
      action,
      skill,
      blind: attrs.blind ? parseBooleanTextEvent(attrs.blind) : blindSkills.has(skill.toLowerCase()),
      sourceMessageId,
      sourceId: normalizeInlineTextEvent(attrs.sourceid) || `${sourceMessageId || "msg"}:${labelKey}:${occurrenceIndex}`,
      textRange: null,
      dcHint: Number.isFinite(Number(attrs.dchint)) ? Math.floor(Number(attrs.dchint)) : null,
      loreType: normalizeInlineTextEvent(attrs.loretype),
      note: normalizeInlineTextEvent(attrs.note),
      diceExpr: normalizeInlineTextEvent(attrs.diceexpr) || "1d20",
      occurrenceIndex,
    });

    void full;
    return label;
  });

  return {
    cleanText,
    triggers,
    foundLegacyMarkup,
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
  if (!parsed.foundLegacyMarkup) return false;

  setActiveMessageTextEvent(message, parsed.cleanText);
  setMessageInteractiveTriggersEvent(message, parsed.triggers);
  return true;
}

export function buildInteractiveTriggerTooltipTextEvent(trigger: InteractiveTriggerEvent): string {
  const action = normalizeInlineTextEvent(trigger.action || trigger.skill || "检定");
  const skill = normalizeInlineTextEvent(trigger.skill || trigger.action || "检定");
  const visibility = trigger.blind ? "手动暗骰" : "手动检定";
  const head = action && skill && action !== skill ? `${action} · ${skill}` : (action || skill || "检定");
  return `${head} · ${visibility}`;
}

export function buildInteractiveTriggerTooltipHtmlEvent(trigger: InteractiveTriggerEvent): string {
  return `<span class="st-rh-trigger-tip">${buildInteractiveTriggerTooltipTextEvent(trigger)}</span>`;
}
