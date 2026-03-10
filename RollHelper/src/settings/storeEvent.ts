import type { DiceMeta, DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  SkillEditorRowDraftEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
  RollHelperSettingsThemeEvent,
  SummaryDetailModeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import {
  createSdkPluginChatStateStore,
  createSdkPluginSettingsStore,
  getCurrentTavernSettingsScope,
  listSdkPluginChatStateSummaries,
  migrateLegacyPluginChatState,
  readSdkPluginChatState,
  writeSdkPluginChatState,
} from "../../../SDK/settings";
import {
  buildSdkThemePatchFromSelection,
  getSdkThemeState,
  resolveSdkThemeSelection,
  setSdkThemeState,
} from "../../../SDK/theme";
import type { SdkTavernScopeLocatorEvent } from "../../../SDK/tavern";
import {
  buildTavernChatScopedKeyEvent,
  getTavernContextSnapshotEvent,
  isFallbackTavernChatEvent,
  listTavernChatsForCurrentTavernEvent,
  parseAnyTavernChatRefEvent,
} from "../../../SDK/tavern";
import {
  chatMetadata,
  getLiveContextEvent,
  saveMetadata,
} from "../core/runtimeContextEvent";
import {
  type ChatScopedStateSummaryV2Event,
  listChatScopedStateSummariesForTavernV2Event,
  loadChatScopedStateV2ByKeyEvent,
} from "../persistence/chatScopedStoreV2Event";
import { normalizeActiveStatusesEvent as normalizeActiveStatusesFromEvent } from "../events/statusEvent";
import { createIdEvent } from "../core/utilsEvent";
import {
  DEFAULT_RULE_TEXT_Event,
  DEFAULT_SETTINGS_Event,
  SDK_SETTINGS_NAMESPACE_Event,
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
let SETTINGS_STORE_Event: ReturnType<typeof createSdkPluginSettingsStore<DicePluginSettingsEvent>> | null = null;
interface ScopedSettingsCacheEvent {
  scopeKey: string;
  settings: DicePluginSettingsEvent;
}
let SETTINGS_CACHE_Event: ScopedSettingsCacheEvent | null = null;
let SETTINGS_STORE_SUBSCRIBED_Event = false;
let CHAT_STATE_STORE_Event: ReturnType<
  typeof createSdkPluginChatStateStore<RollHelperChatScopedStateEvent>
> | null = null;
const CHAT_STATE_MIGRATION_TRIGGERED_TAVERNS_Event = new Set<string>();

interface RollHelperChatScopedStateEvent {
  skillPresetStoreText: string;
  activeStatuses: ActiveStatusEvent[];
}

let syncSettingsUiCallbackEvent: () => void = () => { };

export function setSyncSettingsUiCallbackEvent(callback: () => void): void {
  syncSettingsUiCallbackEvent = callback;
}

let ACTIVE_CHAT_KEY_Event = "";
let ACTIVE_CHAT_SCOPE_Event: SdkTavernScopeLocatorEvent | null = null;
let CHAT_SCOPED_LOAD_TOKEN_Event = 0;

/**
 * 功能：解析当前聊天的结构化主键。
 * @returns 当前聊天主键
 */
function resolveCurrentChatKeyEvent(): string {
  const scope = getTavernContextSnapshotEvent();
  if (!scope) {
    ACTIVE_CHAT_SCOPE_Event = null;
    ACTIVE_CHAT_KEY_Event = "";
    return "";
  }
  ACTIVE_CHAT_SCOPE_Event = scope;
  ACTIVE_CHAT_KEY_Event = buildTavernChatScopedKeyEvent({
    ...scope,
    chatId: scope.currentChatId,
  });
  return ACTIVE_CHAT_KEY_Event;
}

/**
 * 功能：将技能预设写入当前聊天级存储。
 * @param skillPresetStoreText 技能预设文本
 * @returns 无返回值
 */
function normalizeChatScopedStatePayloadEvent(
  source: Partial<RollHelperChatScopedStateEvent>,
  fallbackSkillTableText: string
): RollHelperChatScopedStateEvent {
  const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    typeof source.skillPresetStoreText === "string" ? source.skillPresetStoreText : "",
    fallbackSkillTableText
  );
  const normalizedStore =
    parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent();
  return {
    skillPresetStoreText: JSON.stringify(normalizedStore, null, 2),
    activeStatuses: normalizeActiveStatusesFromEvent(source.activeStatuses),
  };
}

function getChatStateStoreEvent() {
  if (!CHAT_STATE_STORE_Event) {
    CHAT_STATE_STORE_Event = createSdkPluginChatStateStore<RollHelperChatScopedStateEvent>({
      namespace: SDK_SETTINGS_NAMESPACE_Event,
      defaults: {
        skillPresetStoreText: "",
        activeStatuses: [],
      },
      normalize: (candidate) =>
        normalizeChatScopedStatePayloadEvent(candidate, DEFAULT_SETTINGS_Event.skillTableText),
    });
  }
  return CHAT_STATE_STORE_Event;
}

function ensureLegacyChatStateMigrationEvent(): void {
  const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
  if (!scope) return;
  const tavernInstanceId = String(scope.tavernInstanceId ?? "").trim();
  if (!tavernInstanceId) return;
  if (CHAT_STATE_MIGRATION_TRIGGERED_TAVERNS_Event.has(tavernInstanceId)) return;
  CHAT_STATE_MIGRATION_TRIGGERED_TAVERNS_Event.add(tavernInstanceId);
  void migrateLegacyPluginChatState<RollHelperChatScopedStateEvent>(SDK_SETTINGS_NAMESPACE_Event, {
    versionTag: "rollhelper_chat_v2_to_sdk_v1",
    list: async () => {
      const legacy = (await listChatScopedStateSummariesForTavernV2Event(
        scope.tavernInstanceId
      )) as ChatScopedStateSummaryV2Event[];
      return legacy.map((item) => ({
        chatKey: String(item.chatScopedKey ?? "").trim(),
        updatedAt: Number(item.updatedAt) || 0,
        displayName: String(item.displayName ?? "").trim(),
        avatarUrl: String(item.avatarUrl ?? "").trim(),
        roleKey: String(item.roleKey ?? "").trim(),
        summary: {
          activeStatusCount: Number(item.activeStatusCount) || 0,
        },
      }));
    },
    read: async (chatKey: string) => {
      const loaded = await loadChatScopedStateV2ByKeyEvent(chatKey);
      const fallbackSkillTableText = getSettingsEvent().skillTableText;
      return normalizeChatScopedStatePayloadEvent(
        {
          skillPresetStoreText: loaded.skillPresetStoreText,
          activeStatuses: loaded.activeStatuses,
        },
        fallbackSkillTableText
      );
    },
  }).catch((error) => {
    CHAT_STATE_MIGRATION_TRIGGERED_TAVERNS_Event.delete(tavernInstanceId);
    logger.warn("聊天级旧数据迁移失败（已忽略）", error);
  });
}

function readChatScopedStateByKeyEvent(chatKey: string): RollHelperChatScopedStateEvent {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const row = readSdkPluginChatState<RollHelperChatScopedStateEvent>(
    SDK_SETTINGS_NAMESPACE_Event,
    chatKey
  );
  return normalizeChatScopedStatePayloadEvent(row?.state ?? {}, fallbackSkillTableText);
}

function writeChatScopedStateByKeyEvent(
  chatKey: string,
  patchOrNext:
    | Partial<RollHelperChatScopedStateEvent>
    | ((previous: RollHelperChatScopedStateEvent) => Partial<RollHelperChatScopedStateEvent>),
  meta?: { displayName?: string; avatarUrl?: string; roleKey?: string; updatedAt?: number }
): RollHelperChatScopedStateEvent {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const previous = readChatScopedStateByKeyEvent(chatKey);
  const patch = typeof patchOrNext === "function" ? patchOrNext(previous) : patchOrNext;
  const nextPayload = normalizeChatScopedStatePayloadEvent(
    {
      ...previous,
      ...(patch ?? {}),
    },
    fallbackSkillTableText
  );

  const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
  const existing = readSdkPluginChatState<RollHelperChatScopedStateEvent>(
    SDK_SETTINGS_NAMESPACE_Event,
    chatKey
  );
  const parsed = parseAnyTavernChatRefEvent(chatKey, {
    tavernInstanceId: scope?.tavernInstanceId,
  });
  const fallbackDisplayName = String(existing?.displayName ?? parsed.chatId ?? "unknown_chat").trim();
  writeSdkPluginChatState<RollHelperChatScopedStateEvent>(SDK_SETTINGS_NAMESPACE_Event, chatKey, {
    state: nextPayload,
    updatedAt: Number(meta?.updatedAt) || Date.now(),
    displayName: String(meta?.displayName ?? existing?.displayName ?? scope?.displayName ?? fallbackDisplayName).trim(),
    avatarUrl: String(meta?.avatarUrl ?? existing?.avatarUrl ?? scope?.avatarUrl ?? "").trim(),
    roleKey: String(meta?.roleKey ?? existing?.roleKey ?? scope?.roleKey ?? "").trim(),
    summary: {
      activeStatusCount: nextPayload.activeStatuses.length,
    },
  });
  return nextPayload;
}

function persistSkillPresetStoreToChatScopedEvent(skillPresetStoreText: string): void {
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  try {
    writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
      ...previous,
      skillPresetStoreText,
    }));
  } catch (error) {
    logger.warn(`聊天级技能持久化失败，chatKey=${chatKey}`, error);
  }
}

/**
 * 功能：将状态列表写入当前聊天级存储。
 * @param statuses 状态列表
 * @returns 无返回值
 */
function persistStatusesToChatScopedEvent(statuses: ActiveStatusEvent[]): void {
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  try {
    writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
      ...previous,
      activeStatuses: normalizeActiveStatusesFromEvent(statuses),
    }));
  } catch (error) {
    logger.warn(`聊天级状态持久化失败，chatKey=${chatKey}`, error);
  }
}

export function getActiveChatKeyEvent(): string {
  if (ACTIVE_CHAT_KEY_Event) return ACTIVE_CHAT_KEY_Event;
  return resolveCurrentChatKeyEvent();
}

export interface ChatScopedStatusSummaryEvent {
  chatKey: string;
  updatedAt: number;
  activeStatusCount: number;
  chatId: string;
  displayName: string;
  avatarUrl: string;
  scopeType: "character" | "group";
  scopeId: string;
  roleKey: string;
}

export interface HostChatListItemEvent {
  chatKey: string;
  updatedAt: number;
  chatId: string;
  displayName: string;
  avatarUrl: string;
  scopeType: "character" | "group";
  scopeId: string;
  roleKey: string;
}

export async function listChatScopedStatusSummariesEvent(): Promise<ChatScopedStatusSummaryEvent[]> {
  const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
  if (!scope) return [];
  ACTIVE_CHAT_SCOPE_Event = scope;
  const list = listSdkPluginChatStateSummaries(SDK_SETTINGS_NAMESPACE_Event);
  return list.map((item) => ({
    chatKey: String(item.chatKey ?? "").trim(),
    updatedAt: Number(item.updatedAt) || 0,
    activeStatusCount: Number((item.summary as { activeStatusCount?: unknown })?.activeStatusCount) || 0,
    chatId: String(item.chatId ?? "").trim(),
    displayName: String(item.displayName ?? "").trim(),
    avatarUrl: String(item.avatarUrl ?? "").trim(),
    scopeType: item.scopeType === "group" ? "group" : "character",
    scopeId: String(item.scopeId ?? "").trim(),
    roleKey: String(item.roleKey ?? "").trim(),
  }));
}

/**
 * 功能：列出当前酒馆下的宿主真实聊天列表。
 * @returns 聊天列表
 */
export async function listHostChatsForCurrentScopeEvent(): Promise<HostChatListItemEvent[]> {
  const hostList = await listTavernChatsForCurrentTavernEvent();
  return hostList
    .map((item): HostChatListItemEvent => ({
      chatKey: buildTavernChatScopedKeyEvent(item.locator),
      updatedAt: Number(item.updatedAt) || 0,
      chatId: String(item.locator.chatId ?? "").trim(),
      displayName: String(item.locator.displayName ?? "").trim(),
      avatarUrl: String(item.locator.avatarUrl ?? "").trim(),
      scopeType: item.locator.scopeType === "group" ? "group" : "character",
      scopeId: String(item.locator.scopeId ?? "").trim(),
      roleKey: String(item.locator.roleKey ?? "").trim(),
    }))
    .filter((item) => item.chatKey && !isFallbackTavernChatEvent(item.chatId));
}

export async function loadStatusesForChatKeyEvent(chatKey: string): Promise<ActiveStatusEvent[]> {
  const state = readChatScopedStateByKeyEvent(chatKey);
  return normalizeActiveStatusesFromEvent(state.activeStatuses);
}

export async function saveStatusesForChatKeyEvent(
  chatKey: string,
  statuses: ActiveStatusEvent[]
): Promise<void> {
  writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
    ...previous,
    activeStatuses: normalizeActiveStatusesFromEvent(statuses),
  }));
}

export async function loadChatScopedStateIntoRuntimeEvent(reason = "init"): Promise<void> {
  const token = ++CHAT_SCOPED_LOAD_TOKEN_Event;
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  try {
    const state = readChatScopedStateByKeyEvent(chatKey);
    if (token !== CHAT_SCOPED_LOAD_TOKEN_Event) return;

    const settings = getSettingsEvent();
    const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
      state.skillPresetStoreText,
      settings.skillTableText
    );
    const normalizedStore =
      parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent();
    const nextSkillPresetStoreText = JSON.stringify(normalizedStore, null, 2);
    const nextSkillTableText = syncActivePresetToSkillTableTextEvent(
      normalizedStore,
      settings.skillTableText
    );

    const meta = getDiceMetaEvent();
    meta.activeStatuses = normalizeActiveStatusesFromEvent(state.activeStatuses);
    saveMetadataSafeEvent();

    let wroteSettings = false;
    if (
      settings.skillPresetStoreText !== nextSkillPresetStoreText ||
      settings.skillTableText !== nextSkillTableText
    ) {
      updateSettingsEvent({
        skillPresetStoreText: nextSkillPresetStoreText,
        skillTableText: nextSkillTableText,
      });
      wroteSettings = true;
    }

    SKILL_TABLE_CACHE_TEXT_Event = "";
    SKILL_TABLE_CACHE_MAP_Event = {};
    if (!wroteSettings) {
      syncSettingsUiCallbackEvent();
    }
    logger.info(`聊天级状态已装载 (${reason}) chatKey=${chatKey}`);
  } catch (error) {
    logger.warn(`聊天级状态装载失败，已降级默认 (${reason}) chatKey=${chatKey}`, error);
    const settings = getSettingsEvent();
    const defaultStore = buildDefaultSkillPresetStoreEvent();
    const nextSkillPresetStoreText = JSON.stringify(defaultStore, null, 2);
    const nextSkillTableText = syncActivePresetToSkillTableTextEvent(defaultStore, settings.skillTableText);
    const meta = getDiceMetaEvent();
    meta.activeStatuses = [];
    saveMetadataSafeEvent();

    let wroteSettings = false;
    if (
      settings.skillPresetStoreText !== nextSkillPresetStoreText ||
      settings.skillTableText !== nextSkillTableText
    ) {
      updateSettingsEvent({
        skillPresetStoreText: nextSkillPresetStoreText,
        skillTableText: nextSkillTableText,
      });
      wroteSettings = true;
    }

    SKILL_TABLE_CACHE_TEXT_Event = "";
    SKILL_TABLE_CACHE_MAP_Event = {};
    if (!wroteSettings) {
      syncSettingsUiCallbackEvent();
    }
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

function normalizeSettingsThemeCompatEvent(raw: unknown): RollHelperSettingsThemeEvent {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "dark" || normalized === "light" || normalized === "tavern") {
    return normalized as RollHelperSettingsThemeEvent;
  }
  return "default";
}

function resolveSdkSettingsThemeEvent(): RollHelperSettingsThemeEvent {
  const selection = resolveSdkThemeSelection(getSdkThemeState());
  return normalizeSettingsThemeCompatEvent(selection);
}

function resolveSettingsScopeKeyEvent(scope?: { tavernInstanceId?: unknown } | null): string {
  const normalized = String(scope?.tavernInstanceId ?? "").trim();
  return normalized || "unknown_tavern";
}

function getCurrentSettingsScopeKeyEvent(): string {
  return resolveSettingsScopeKeyEvent(getCurrentTavernSettingsScope());
}

function cloneSettingsSnapshotEvent(settings: DicePluginSettingsEvent): DicePluginSettingsEvent {
  return { ...settings };
}

function getCachedSettingsForScopeEvent(scopeKey: string): DicePluginSettingsEvent | null {
  if (!SETTINGS_CACHE_Event) return null;
  if (SETTINGS_CACHE_Event.scopeKey !== scopeKey) return null;
  return SETTINGS_CACHE_Event.settings;
}

function setSettingsCacheForScopeEvent(scopeKey: string, settings: DicePluginSettingsEvent): void {
  SETTINGS_CACHE_Event = {
    scopeKey,
    settings: cloneSettingsSnapshotEvent(settings),
  };
}

function writeSettingsForCurrentScopeEvent(
  patchOrNext:
    | Partial<DicePluginSettingsEvent>
    | ((previous: DicePluginSettingsEvent) => DicePluginSettingsEvent)
): DicePluginSettingsEvent {
  const store = getSettingsStoreEvent();
  const scopeKey = getCurrentSettingsScopeKeyEvent();
  const next = store.write((previous) => {
    const previousSnapshot = cloneSettingsSnapshotEvent(previous);
    const candidate =
      typeof patchOrNext === "function"
        ? (patchOrNext as (previous: DicePluginSettingsEvent) => DicePluginSettingsEvent)(
            previousSnapshot
          )
        : ({
            ...previousSnapshot,
            ...(patchOrNext ?? {}),
          } as DicePluginSettingsEvent);
    return {
      ...candidate,
      theme: resolveSdkSettingsThemeEvent(),
    };
  });
  setSettingsCacheForScopeEvent(scopeKey, next);
  return next;
}

function ensureSettingsThemeMirrorEvent(
  settings: DicePluginSettingsEvent,
  allowSeedFromLegacy = false
): DicePluginSettingsEvent {
  const legacyTheme = normalizeSettingsThemeCompatEvent(settings.theme);
  let sdkTheme = resolveSdkSettingsThemeEvent();
  if (allowSeedFromLegacy && sdkTheme === "default" && legacyTheme !== "default") {
    setSdkThemeState(buildSdkThemePatchFromSelection(legacyTheme));
    sdkTheme = resolveSdkSettingsThemeEvent();
  }
  if (legacyTheme !== sdkTheme) {
    return writeSettingsForCurrentScopeEvent({
      theme: sdkTheme,
    });
  }
  if (settings.theme === sdkTheme) return settings;
  return {
    ...settings,
    theme: sdkTheme,
  };
}

function normalizeSettingsBucketEvent(source: Partial<DicePluginSettingsEvent>): DicePluginSettingsEvent {
  const bucket: DicePluginSettingsEvent = {
    ...DEFAULT_SETTINGS_Event,
    ...(source ?? {}),
  };
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
    typeof (source as any)?.aiAllowedDiceSidesText === "string"
      ? String((source as any).aiAllowedDiceSidesText).trim()
      : DEFAULT_SETTINGS_Event.aiAllowedDiceSidesText;
  const rawTheme = String((source as any)?.theme ?? "").trim().toLowerCase();
  bucket.theme =
    rawTheme === "dark" || rawTheme === "light" || rawTheme === "tavern"
      ? (rawTheme as RollHelperSettingsThemeEvent)
      : "default";
  bucket.enableOutcomeBranches = bucket.enableOutcomeBranches !== false;
  bucket.enableExplodeOutcomeBranch = bucket.enableExplodeOutcomeBranch !== false;
  bucket.includeOutcomeInSummary = bucket.includeOutcomeInSummary !== false;
  bucket.showOutcomePreviewInListCard = bucket.showOutcomePreviewInListCard !== false;
  const rawSummaryDetail = String((source as any)?.summaryDetailMode || "").toLowerCase();
  bucket.summaryDetailMode =
    rawSummaryDetail === "balanced" || rawSummaryDetail === "detailed"
      ? (rawSummaryDetail as SummaryDetailModeEvent)
      : "minimal";
  const rawSummaryRounds = Number((source as any)?.summaryHistoryRounds);
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
    typeof (source as any)?.skillPresetStoreText === "string"
      ? String((source as any).skillPresetStoreText)
      : "",
    bucket.skillTableText
  );
  const presetStore = parseSkillPresetStoreTextEvent(bucket.skillPresetStoreText);
  if (presetStore) {
    bucket.skillTableText = syncActivePresetToSkillTableTextEvent(presetStore, bucket.skillTableText);
    bucket.skillPresetStoreText = JSON.stringify(presetStore, null, 2);
  }
  const ruleTextModeVersion = Number((source as any)?.ruleTextModeVersion);
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

function getSettingsStoreEvent() {
  if (!SETTINGS_STORE_Event) {
    SETTINGS_STORE_Event = createSdkPluginSettingsStore<DicePluginSettingsEvent>({
      namespace: SDK_SETTINGS_NAMESPACE_Event,
      defaults: DEFAULT_SETTINGS_Event,
      normalize: normalizeSettingsBucketEvent,
    });
  }
  getChatStateStoreEvent();
  ensureLegacyChatStateMigrationEvent();
  if (!SETTINGS_STORE_SUBSCRIBED_Event) {
    SETTINGS_STORE_SUBSCRIBED_Event = true;
    SETTINGS_STORE_Event.subscribe((settings, scope) => {
      setSettingsCacheForScopeEvent(resolveSettingsScopeKeyEvent(scope), settings);
      syncSettingsUiCallbackEvent();
    });
  }
  return SETTINGS_STORE_Event;
}

export function saveSettingsSafeEvent(): void {
  const current = getSettingsEvent();
  writeSettingsForCurrentScopeEvent(() => ({
    ...current,
  }));
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
  const scopeKey = getCurrentSettingsScopeKeyEvent();
  const cached = getCachedSettingsForScopeEvent(scopeKey);
  const current = cached ?? getSettingsStoreEvent().read();
  if (!cached) {
    setSettingsCacheForScopeEvent(scopeKey, current);
  }
  const mirrored = ensureSettingsThemeMirrorEvent(current, true);
  if (mirrored !== current) {
    setSettingsCacheForScopeEvent(scopeKey, mirrored);
  }
  return cloneSettingsSnapshotEvent(mirrored);
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
  const patchAny = patch as Partial<DicePluginSettingsEvent> & { theme?: RollHelperSettingsThemeEvent };
  if (patchAny.theme != null) {
    setSdkThemeState(buildSdkThemePatchFromSelection(normalizeSettingsThemeCompatEvent(patchAny.theme)));
  }
  const { theme: _themeIgnored, ...restPatch } = patchAny;
  writeSettingsForCurrentScopeEvent(restPatch);
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




