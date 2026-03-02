import type { DiceMeta, DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  SkillEditorRowDraftEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
  SummaryDetailModeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import {
  chatMetadata,
  extensionSettings,
  getLiveContextEvent,
  saveMetadata,
  saveSettingsDebounced,
} from "../core/runtimeContextEvent";
import {
  loadChatScopedState,
  resolveChatKey,
  saveSkillStore,
  saveStatuses,
} from "../persistence/chatScopedStoreEvent";
import { normalizeActiveStatusesEvent as normalizeActiveStatusesFromEvent } from "../events/statusEvent";
import { createIdEvent } from "../core/utilsEvent";
import {
  DEFAULT_RULE_TEXT_Event,
  DEFAULT_SETTINGS_Event,
  MODULE_NAME_Event,
  RULE_TEXT_MODE_VERSION_Event,
  SKILL_PRESET_DEFAULT_ID_Event,
  SKILL_PRESET_DEFAULT_NAME_Event,
    SKILL_PRESET_NEW_NAME_BASE_Event,
  SKILL_PRESET_STORE_VERSION_Event,
  SUMMARY_HISTORY_ROUNDS_MAX_Event,
  SUMMARY_HISTORY_ROUNDS_MIN_Event,
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
} from "./constantsEvent";

const LOCAL_METADATA_FALLBACK_Event: Record<string, any> = {};
const LOCAL_SETTINGS_FALLBACK_Event: DicePluginSettingsEvent = {
  ...DEFAULT_SETTINGS_Event,
};

let syncSettingsUiCallbackEvent: () => void = () => { };

export function setSyncSettingsUiCallbackEvent(callback: () => void): void {
  syncSettingsUiCallbackEvent = callback;
}

let ACTIVE_CHAT_KEY_Event = "";
let CHAT_SCOPED_LOAD_TOKEN_Event = 0;

function resolveCurrentChatKeyEvent(): string {
  const key = resolveChatKey(getLiveContextEvent());
  ACTIVE_CHAT_KEY_Event = key;
  return key;
}

function persistSkillPresetStoreToChatScopedEvent(skillPresetStoreText: string): void {
  const chatKey = resolveCurrentChatKeyEvent();
  void saveSkillStore(chatKey, skillPresetStoreText).catch((error) => {
    logger.warn(`聊天级技能持久化失败，chatKey=${chatKey}`, error);
  });
}

function persistStatusesToChatScopedEvent(statuses: ActiveStatusEvent[]): void {
  const chatKey = resolveCurrentChatKeyEvent();
  void saveStatuses(chatKey, statuses).catch((error) => {
    logger.warn(`聊天级状态持久化失败，chatKey=${chatKey}`, error);
  });
}

export function getActiveChatKeyEvent(): string {
  if (ACTIVE_CHAT_KEY_Event) return ACTIVE_CHAT_KEY_Event;
  return resolveCurrentChatKeyEvent();
}

export async function loadChatScopedStateIntoRuntimeEvent(reason = "init"): Promise<void> {
  const token = ++CHAT_SCOPED_LOAD_TOKEN_Event;
  const chatKey = resolveCurrentChatKeyEvent();
  try {
    const state = await loadChatScopedState(chatKey);
    if (token !== CHAT_SCOPED_LOAD_TOKEN_Event) return;

    const settings = getSettingsEvent();
    const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
      state.skillPresetStoreText,
      settings.skillTableText
    );
    const normalizedStore =
      parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent();
    settings.skillPresetStoreText = JSON.stringify(normalizedStore, null, 2);
    settings.skillTableText = syncActivePresetToSkillTableTextEvent(normalizedStore, settings.skillTableText);

    const meta = getDiceMetaEvent();
    meta.activeStatuses = normalizeActiveStatusesFromEvent(state.activeStatuses);
    saveMetadataSafeEvent();

    SKILL_TABLE_CACHE_TEXT_Event = "";
    SKILL_TABLE_CACHE_MAP_Event = {};
    syncSettingsUiCallbackEvent();
    logger.info(`聊天级状态已装载 (${reason}) chatKey=${chatKey}`);
  } catch (error) {
    logger.warn(`聊天级状态装载失败，已降级默认 (${reason}) chatKey=${chatKey}`, error);
    const settings = getSettingsEvent();
    const defaultStore = buildDefaultSkillPresetStoreEvent();
    settings.skillPresetStoreText = JSON.stringify(defaultStore, null, 2);
    settings.skillTableText = syncActivePresetToSkillTableTextEvent(defaultStore, settings.skillTableText);
    const meta = getDiceMetaEvent();
    meta.activeStatuses = [];
    saveMetadataSafeEvent();
    SKILL_TABLE_CACHE_TEXT_Event = "";
    SKILL_TABLE_CACHE_MAP_Event = {};
    syncSettingsUiCallbackEvent();
  }
}

export function getDiceMeta(): DiceMeta {
  if (!chatMetadata.diceRoller) {
    (chatMetadata as any).diceRoller = {};
  }
  return chatMetadata.diceRoller as DiceMeta;
}

export function saveLastRoll(result: DiceResult): void {
  const meta = getDiceMeta();
  meta.last = result as any;
  meta.lastTotal = (result as any).total;
  saveMetadata();
}

export function getChatMetadataRootEvent(): Record<string, any> {
  const liveCtx = getLiveContextEvent();
  if (!liveCtx) return LOCAL_METADATA_FALLBACK_Event;
  if (!liveCtx.chatMetadata || typeof liveCtx.chatMetadata !== "object") {
    (liveCtx as any).chatMetadata = {};
  }
  return liveCtx.chatMetadata as Record<string, any>;
}

export function getDiceMetaEvent(): DiceMetaEvent {
  const root = getChatMetadataRootEvent();
  if (!root.diceRollerEvent || typeof root.diceRollerEvent !== "object") {
    root.diceRollerEvent = {};
  }
  const meta = root.diceRollerEvent as DiceMetaEvent;
  if (!Array.isArray(meta.activeStatuses)) {
    meta.activeStatuses = [];
  }
  return meta;
}

export function saveMetadataSafeEvent(): void {
  const liveCtx = getLiveContextEvent();
  if (typeof liveCtx?.saveMetadata === "function") {
    try {
      liveCtx.saveMetadata();
    } catch (error) {
      logger.warn("保存 Event 元数据失败", error);
    }
  }
  const meta = getDiceMetaEvent();
  if (Array.isArray(meta.activeStatuses)) {
    persistStatusesToChatScopedEvent(meta.activeStatuses);
  }
}

export function saveSettingsSafeEvent(): void {
  const liveCtx = getLiveContextEvent();
  const saver = liveCtx?.saveSettingsDebounced ?? saveSettingsDebounced;
  if (typeof saver === "function") {
    try {
      saver.call(liveCtx);
    } catch (error) {
      logger.warn("保存扩展设置失败", error);
    }
  }
}

export function persistChatSafeEvent(): void {
  const liveCtx = getLiveContextEvent();
  const fn =
    liveCtx?.saveChat ?? liveCtx?.saveChatConditional ?? liveCtx?.saveChatDebounced;
  if (typeof fn !== "function") return;
  try {
    Promise.resolve(fn.call(liveCtx)).catch((error) => {
      logger.warn("保存聊天失败", error);
    });
  } catch (error) {
    logger.warn("保存聊天失败", error);
  }
}

export function getSettingsEvent(): DicePluginSettingsEvent {
  const liveCtx = getLiveContextEvent();
  const allSettings = liveCtx?.extensionSettings ?? extensionSettings;
  if (!allSettings || typeof allSettings !== "object") {
    return LOCAL_SETTINGS_FALLBACK_Event;
  }
  if (!allSettings[MODULE_NAME_Event] || typeof allSettings[MODULE_NAME_Event] !== "object") {
    allSettings[MODULE_NAME_Event] = { ...DEFAULT_SETTINGS_Event };
  }
  const bucket = allSettings[MODULE_NAME_Event] as DicePluginSettingsEvent;
  bucket.enabled = bucket.enabled !== false;
  bucket.autoSendRuleToAI = bucket.autoSendRuleToAI !== false;
  bucket.enableAiRollMode = bucket.enableAiRollMode !== false;
  bucket.enableAiRoundControl = bucket.enableAiRoundControl === true;
  bucket.enableExplodingDice = bucket.enableExplodingDice !== false;
  bucket.enableAdvantageSystem = bucket.enableAdvantageSystem !== false;
  bucket.enableDynamicResultGuidance = bucket.enableDynamicResultGuidance === true;
  bucket.enableDynamicDcReason = bucket.enableDynamicDcReason !== false;
  bucket.enableStatusSystem = bucket.enableStatusSystem !== false;
  bucket.aiAllowedDiceSidesText =
    typeof (bucket as any).aiAllowedDiceSidesText === "string"
      ? String((bucket as any).aiAllowedDiceSidesText).trim()
      : DEFAULT_SETTINGS_Event.aiAllowedDiceSidesText;
  bucket.enableOutcomeBranches = bucket.enableOutcomeBranches !== false;
  bucket.enableExplodeOutcomeBranch = bucket.enableExplodeOutcomeBranch !== false;
  bucket.includeOutcomeInSummary = bucket.includeOutcomeInSummary !== false;
  bucket.showOutcomePreviewInListCard = bucket.showOutcomePreviewInListCard !== false;
  const rawSummaryDetail = String((bucket as any).summaryDetailMode || "").toLowerCase();
  bucket.summaryDetailMode =
    rawSummaryDetail === "balanced" || rawSummaryDetail === "detailed"
      ? (rawSummaryDetail as SummaryDetailModeEvent)
      : "minimal";
  const rawSummaryRounds = Number((bucket as any).summaryHistoryRounds);
  const normalizedSummaryRounds = Number.isFinite(rawSummaryRounds)
    ? Math.floor(rawSummaryRounds)
    : DEFAULT_SETTINGS_Event.summaryHistoryRounds;
  bucket.summaryHistoryRounds = Math.min(
    SUMMARY_HISTORY_ROUNDS_MAX_Event,
    Math.max(SUMMARY_HISTORY_ROUNDS_MIN_Event, normalizedSummaryRounds)
  );
  bucket.eventApplyScope = bucket.eventApplyScope === "all" ? "all" : "protagonist_only";
  bucket.enableTimeLimit = bucket.enableTimeLimit !== false;
  const minSecondsRaw = Number(bucket.minTimeLimitSeconds);
  const minSeconds = Number.isFinite(minSecondsRaw) ? Math.floor(minSecondsRaw) : 10;
  bucket.minTimeLimitSeconds = Math.max(1, minSeconds);
  bucket.enableSkillSystem = bucket.enableSkillSystem !== false;
  bucket.skillTableText =
    typeof bucket.skillTableText === "string" && bucket.skillTableText.trim().length > 0
      ? bucket.skillTableText
      : "{}";
  bucket.skillPresetStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    typeof (bucket as any).skillPresetStoreText === "string"
      ? String((bucket as any).skillPresetStoreText)
      : "",
    bucket.skillTableText
  );
  const presetStore = parseSkillPresetStoreTextEvent(bucket.skillPresetStoreText);
  if (presetStore) {
    bucket.skillTableText = syncActivePresetToSkillTableTextEvent(presetStore, bucket.skillTableText);
    bucket.skillPresetStoreText = JSON.stringify(presetStore, null, 2);
  }
  const ruleTextModeVersion = Number((bucket as any).ruleTextModeVersion);
  if (ruleTextModeVersion !== RULE_TEXT_MODE_VERSION_Event) {
    bucket.ruleText = "";
    bucket.ruleTextModeVersion = RULE_TEXT_MODE_VERSION_Event;
  }
  if (Number((bucket as any).ruleTextModeVersion) !== RULE_TEXT_MODE_VERSION_Event) {
    bucket.ruleTextModeVersion = RULE_TEXT_MODE_VERSION_Event;
  }
  bucket.ruleText = typeof bucket.ruleText === "string" ? bucket.ruleText : DEFAULT_RULE_TEXT_Event;
  return bucket;
}

export function normalizeStatusNameKeyEvent(raw: any): string {
  return normalizeStringFieldEvent(raw).toLowerCase();
}

export function normalizeStatusSkillKeyEvent(raw: any): string {
  return normalizeStringFieldEvent(raw).toLowerCase();
}

export function ensureActiveStatusesEvent(meta = getDiceMetaEvent()): ActiveStatusEvent[] {
  if (!Array.isArray(meta.activeStatuses)) {
    meta.activeStatuses = [];
  }
  meta.activeStatuses = normalizeActiveStatusesFromEvent(meta.activeStatuses);
  return meta.activeStatuses;
}

export function setActiveStatusesEvent(statuses: ActiveStatusEvent[]): void {
  const meta = getDiceMetaEvent();
  meta.activeStatuses = normalizeActiveStatusesFromEvent(Array.isArray(statuses) ? statuses : []);
  saveMetadataSafeEvent();
  persistStatusesToChatScopedEvent(meta.activeStatuses);
}

export function updateSettingsEvent(patch: Partial<DicePluginSettingsEvent>): void {
  const settings = getSettingsEvent();
  Object.assign(settings, patch);
  saveSettingsSafeEvent();
  syncSettingsUiCallbackEvent();
}

export function normalizeSkillPresetNameKeyEvent(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function createSkillEditorRowDraftEvent(
  skillName: string,
  modifierText: string
): SkillEditorRowDraftEvent {
  return {
    rowId: createIdEvent("skill_row"),
    skillName,
    modifierText,
  };
}

export function countSkillEntriesFromSkillTableTextEvent(skillTableText: string): number {
  const normalized = normalizeSkillTableTextForSettingsEvent(skillTableText);
  if (normalized == null) return 0;
  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0;
    return Object.keys(parsed as Record<string, any>).length;
  } catch {
    return 0;
  }
}

export function buildDefaultSkillPresetEvent(now = Date.now()): SkillPresetEvent {
  return {
    id: SKILL_PRESET_DEFAULT_ID_Event,
    name: SKILL_PRESET_DEFAULT_NAME_Event,
    locked: true,
    skillTableText: DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDefaultSkillPresetStoreEvent(now = Date.now()): SkillPresetStoreEvent {
  const preset = buildDefaultSkillPresetEvent(now);
  return {
    version: SKILL_PRESET_STORE_VERSION_Event,
    activePresetId: preset.id,
    presets: [preset],
  };
}

export function getUniqueSkillPresetNameEvent(
  store: SkillPresetStoreEvent,
  baseName: string,
  excludeId = ""
): string {
  const trimmedBase = String(baseName ?? "").trim() || SKILL_PRESET_NEW_NAME_BASE_Event;
  const usedKeys = new Set(
    store.presets
      .filter((preset) => preset.id !== excludeId)
      .map((preset) => normalizeSkillPresetNameKeyEvent(preset.name))
  );
  let candidate = trimmedBase;
  let index = 2;
  while (usedKeys.has(normalizeSkillPresetNameKeyEvent(candidate))) {
    candidate = `${trimmedBase} ${index}`;
    index += 1;
  }
  return candidate;
}

export function normalizeSkillPresetStoreTextForSettingsEvent(
  raw: string,
  _legacySkillTableText: string
): string {
  const now = Date.now();
  const rawText = String(raw ?? "").trim();

  let parsed: any = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  const presets: SkillPresetEvent[] = [];
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();

  const pushPreset = (presetRaw: any, index: number, fallbackName: string, lockedHint = false) => {
    const rawId = String(presetRaw?.id ?? "").trim();
    const baseId = rawId || createIdEvent("skill_preset");
    let id = baseId;
    while (usedIds.has(id)) {
      id = `${baseId}_${Math.random().toString(36).slice(2, 7)}`;
    }
    usedIds.add(id);

    const rawName = String(presetRaw?.name ?? "").trim();
    const baseName = rawName || fallbackName;
    let name = baseName;
    let idx = 2;
    while (usedNames.has(normalizeSkillPresetNameKeyEvent(name))) {
      name = `${baseName} ${idx}`;
      idx += 1;
    }
    usedNames.add(normalizeSkillPresetNameKeyEvent(name));

    const normalizedSkillTableText =
      normalizeSkillTableTextForSettingsEvent(String(presetRaw?.skillTableText ?? "{}")) ?? "{}";
    const createdAtRaw = Number(presetRaw?.createdAt);
    const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : now;
    const updatedAtRaw = Number(presetRaw?.updatedAt);
    const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : createdAt;
    presets.push({
      id,
      name,
      locked: Boolean(presetRaw?.locked || lockedHint),
      skillTableText: normalizedSkillTableText,
      createdAt,
      updatedAt,
    });
  };

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.presets)) {
    parsed.presets.forEach((presetRaw: any, index: number) => {
      pushPreset(presetRaw, index, `${SKILL_PRESET_NEW_NAME_BASE_Event} ${index + 1}`);
    });
  }

  let defaultPreset = presets.find((preset) => preset.id === SKILL_PRESET_DEFAULT_ID_Event) ?? null;
  if (!defaultPreset) {
    defaultPreset = buildDefaultSkillPresetEvent(now);
    presets.unshift(defaultPreset);
  } else {
    defaultPreset.name = SKILL_PRESET_DEFAULT_NAME_Event;
    defaultPreset.locked = true;
  }

  if (!presets.length) {
    presets.push(buildDefaultSkillPresetEvent(now));
  }

  let activePresetId = String(parsed?.activePresetId ?? "").trim();
  if (!activePresetId || !presets.some((preset) => preset.id === activePresetId)) {
    activePresetId = SKILL_PRESET_DEFAULT_ID_Event;
  }

  const normalizedStore: SkillPresetStoreEvent = {
    version: SKILL_PRESET_STORE_VERSION_Event,
    activePresetId,
    presets,
  };
  return JSON.stringify(normalizedStore, null, 2);
}

export function parseSkillPresetStoreTextEvent(raw: string): SkillPresetStoreEvent | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Number((parsed as any).version) !== SKILL_PRESET_STORE_VERSION_Event) return null;
    if (!Array.isArray((parsed as any).presets)) return null;
    const activePresetId = String((parsed as any).activePresetId ?? "").trim();
    const presets = (parsed as any).presets as any[];
    if (!activePresetId || !presets.length) return null;
    return parsed as SkillPresetStoreEvent;
  } catch {
    return null;
  }
}

export function getSkillPresetStoreEvent(settings = getSettingsEvent()): SkillPresetStoreEvent {
  const rawStoreText = String(settings.skillPresetStoreText ?? "");
  const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    rawStoreText,
    settings.skillTableText
  );
  const parsed = parseSkillPresetStoreTextEvent(normalizedStoreText);
  if (parsed) return parsed;
  return buildDefaultSkillPresetStoreEvent();
}

export function getSkillPresetByIdEvent(
  store: SkillPresetStoreEvent,
  presetId: string
): SkillPresetEvent | null {
  const id = String(presetId ?? "").trim();
  if (!id) return null;
  return store.presets.find((preset) => preset.id === id) ?? null;
}

export function getActiveSkillPresetEvent(store: SkillPresetStoreEvent): SkillPresetEvent {
  const explicit = getSkillPresetByIdEvent(store, store.activePresetId);
  if (explicit) return explicit;
  const fallbackDefault = getSkillPresetByIdEvent(store, SKILL_PRESET_DEFAULT_ID_Event);
  if (fallbackDefault) return fallbackDefault;
  return store.presets[0] ?? buildDefaultSkillPresetEvent();
}

export function syncActivePresetToSkillTableTextEvent(
  store: SkillPresetStoreEvent,
  fallbackSkillTableText = "{}"
): string {
  const activePreset = getActiveSkillPresetEvent(store);
  const normalized =
    normalizeSkillTableTextForSettingsEvent(activePreset.skillTableText) ??
    normalizeSkillTableTextForSettingsEvent(fallbackSkillTableText) ??
    "{}";
  activePreset.skillTableText = normalized;
  return normalized;
}

export function saveSkillPresetStoreEvent(store: SkillPresetStoreEvent): void {
  const settings = getSettingsEvent();
  const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    JSON.stringify(store),
    settings.skillTableText
  );
  const normalizedStore =
    parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent();
  const activeSkillTableText = syncActivePresetToSkillTableTextEvent(
    normalizedStore,
    settings.skillTableText
  );
  const savedStoreText = JSON.stringify(normalizedStore, null, 2);
  updateSettingsEvent({
    skillPresetStoreText: savedStoreText,
    skillTableText: activeSkillTableText,
  });
  persistSkillPresetStoreToChatScopedEvent(savedStoreText);
}

export function buildSkillDraftSnapshotEvent(rows: SkillEditorRowDraftEvent[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      skillName: String(row.skillName ?? ""),
      modifierText: String(row.modifierText ?? ""),
    }))
  );
}

export function normalizeStringFieldEvent(raw: any): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function normalizeSkillKeyEvent(raw: any): string {
  return normalizeStringFieldEvent(raw).toLowerCase();
}

export function normalizeSkillTableObjectEvent(raw: any): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, any>)) {
    const normalizedKey = normalizeSkillKeyEvent(key);
    if (!normalizedKey) continue;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) continue;
    normalized[normalizedKey] = numericValue;
  }
  return normalized;
}

export function normalizeSkillTableTextForSettingsEvent(raw: string): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return "{}";
  try {
    const parsed = JSON.parse(text);
    const normalized = normalizeSkillTableObjectEvent(parsed);
    if (normalized == null) return null;
    return JSON.stringify(normalized, null, 2);
  } catch {
    return null;
  }
}

let SKILL_TABLE_CACHE_TEXT_Event = "";
let SKILL_TABLE_CACHE_MAP_Event: Record<string, number> = {};

export function getSkillModifierTableMapEvent(settings: DicePluginSettingsEvent): Record<string, number> {
  const rawText = String(settings.skillTableText ?? "").trim();
  if (rawText === SKILL_TABLE_CACHE_TEXT_Event) {
    return SKILL_TABLE_CACHE_MAP_Event;
  }
  SKILL_TABLE_CACHE_TEXT_Event = rawText;
  if (!rawText) {
    SKILL_TABLE_CACHE_MAP_Event = {};
    return SKILL_TABLE_CACHE_MAP_Event;
  }
  try {
    const parsed = JSON.parse(rawText);
    const normalized = normalizeSkillTableObjectEvent(parsed);
    if (normalized == null) {
      logger.warn("skillTableText 不是合法 JSON 对象，已按空表处理。");
      SKILL_TABLE_CACHE_MAP_Event = {};
      return SKILL_TABLE_CACHE_MAP_Event;
    }
    SKILL_TABLE_CACHE_MAP_Event = normalized;
    return SKILL_TABLE_CACHE_MAP_Event;
  } catch (error) {
    logger.warn("skillTableText 解析失败，已按空表处理。", error);
    SKILL_TABLE_CACHE_MAP_Event = {};
    return SKILL_TABLE_CACHE_MAP_Event;
  }
}

export function resolveSkillModifierBySkillNameEvent(
  skillName: string,
  settings = getSettingsEvent()
): number {
  if (!settings.enableSkillSystem) return 0;
  const key = normalizeSkillKeyEvent(skillName);
  if (!key) return 0;
  const table = getSkillModifierTableMapEvent(settings);
  const value = Number(table[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function deserializeSkillTableTextToRowsEvent(skillTableText: string): SkillEditorRowDraftEvent[] {
  const text = String(skillTableText ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, any>).map(([skillName, modifier]) =>
      createSkillEditorRowDraftEvent(String(skillName ?? ""), String(modifier ?? ""))
    );
  } catch {
    return [];
  }
}

export function validateSkillRowsEvent(rows: SkillEditorRowDraftEvent[]): {
  errors: string[];
  table: Record<string, number>;
} {
  const errors: string[] = [];
  const table: Record<string, number> = {};
  const seenRowByKey = new Map<string, number>();
  const integerPattern = /^[+-]?\d+$/;

  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const rawName = String(row.skillName ?? "");
    const rawModifier = String(row.modifierText ?? "");
    const skillName = rawName.trim();
    const normalizedSkillKey = normalizeSkillKeyEvent(skillName);
    let rowHasError = false;

    if (!skillName) {
      errors.push(`第 ${rowNo} 行：技能名不能为空`);
      rowHasError = true;
    }

    let modifierValue = 0;
    const modifierText = rawModifier.trim();
    if (!modifierText) {
      errors.push(`第 ${rowNo} 行：加值不能为空`);
      rowHasError = true;
    } else if (!integerPattern.test(modifierText)) {
      errors.push(`第 ${rowNo} 行：加值必须是整数`);
      rowHasError = true;
    } else {
      modifierValue = Number(modifierText);
      if (!Number.isFinite(modifierValue)) {
        errors.push(`第 ${rowNo} 行：加值必须是有限整数`);
        rowHasError = true;
      }
    }

    if (normalizedSkillKey) {
      const duplicatedRow = seenRowByKey.get(normalizedSkillKey);
      if (duplicatedRow != null) {
        errors.push(`第 ${rowNo} 行：技能名与第 ${duplicatedRow + 1} 行重复`);
        rowHasError = true;
      } else {
        seenRowByKey.set(normalizedSkillKey, index);
      }
    }

    if (!rowHasError && normalizedSkillKey) {
      table[normalizedSkillKey] = modifierValue;
    }
  });

  return { errors, table };
}

export function serializeSkillRowsToSkillTableTextEvent(rows: SkillEditorRowDraftEvent[]): string | null {
  const validation = validateSkillRowsEvent(rows);
  if (validation.errors.length > 0) return null;
  return JSON.stringify(validation.table, null, 2);
}




