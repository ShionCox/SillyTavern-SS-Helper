import type { DiceMeta, DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  PendingRoundEvent,
  RoundSummarySnapshotEvent,
  SkillEditorRowDraftEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
  RollHelperSettingsThemeEvent,
  SummaryDetailModeEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import {
  createSdkPluginSettingsStore,
  getCurrentTavernSettingsScope,
} from "../../../SDK/settings";
import {
  readSdkPluginChatState as readSdkPluginChatStateAsync,
  writeSdkPluginChatState as writeSdkPluginChatStateAsync,
  deleteSdkPluginChatState as deleteSdkPluginChatStateAsync,
  listSdkPluginChatStateSummaries as listSdkPluginChatStateSummariesAsync,
  patchSdkChatShared,
  ensureSdkChatDocument,
  appendSdkPluginChatRecord,
  querySdkPluginChatRecords,
  flushSdkChatDataNow,
} from "../../../SDK/db";
import {
  getTheme,
} from "../../../SDK/theme";
import {
  normalizeSettingsThemeEvent,
  sdkThemeToSettingsThemeEvent,
} from "./themeBridgeEvent";
import type { SdkTavernScopeLocatorEvent } from "../../../SDK/tavern";
import {
  buildTavernChatEntityKeyEvent,
  buildTavernChatScopedKeyEvent,
  getTavernContextSnapshotEvent,
  isFallbackTavernChatEvent,
  listTavernChatsForCurrentTavernEvent,
  parseAnyTavernChatRefEvent,
} from "../../../SDK/tavern";
import {
  getLiveContextEvent,
} from "../core/runtimeContextEvent";
// 旧 V2 persistence 已移除，迁移由 SDK/db 层一次性处理
import { normalizeActiveStatusesEvent as normalizeActiveStatusesFromEvent } from "../events/statusEvent";
import { createIdEvent } from "../core/utilsEvent";
import {
  AI_SUPPORTED_DICE_SIDES_Event,
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
const STORE_THEME_TRACE_PREFIX_Event = "[SS-Helper][StoreThemeTrace]";
let SETTINGS_STORE_Event: ReturnType<typeof createSdkPluginSettingsStore<DicePluginSettingsEvent>> | null = null;
interface ScopedSettingsCacheEvent {
  scopeKey: string;
  settings: DicePluginSettingsEvent;
}
let SETTINGS_CACHE_Event: ScopedSettingsCacheEvent | null = null;
let SETTINGS_STORE_SUBSCRIBED_Event = false;

interface RollHelperChatScopedStateEvent {
  skillPresetStoreText: string;
  activeStatuses: ActiveStatusEvent[];
  lastBaseRoll: DiceResult | null;
  pendingRound: PendingRoundEvent | null;
  summaryHistory: RoundSummarySnapshotEvent[];
}

/**
 * 功能：从聊天级持久化状态中恢复最近一次已处理的助手消息标识。
 * 参数：
 *   state：当前聊天级持久化状态快照。
 * 返回：
 *   string | undefined：最近一次已处理的助手消息标识；不存在时返回 undefined。
 */
function resolveLastProcessedAssistantMsgIdFromStateEvent(
  state: RollHelperChatScopedStateEvent
): string | undefined {
  const pendingRound = state.pendingRound;
  if (pendingRound) {
    const pendingMsgIds = Array.isArray(pendingRound.sourceAssistantMsgIds)
      ? pendingRound.sourceAssistantMsgIds
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    if (pendingMsgIds.length > 0) {
      return pendingMsgIds[pendingMsgIds.length - 1];
    }
    const pendingEventMsgIds = Array.isArray(pendingRound.events)
      ? pendingRound.events
          .map((event) => String(event?.sourceAssistantMsgId ?? "").trim())
          .filter(Boolean)
      : [];
    if (pendingEventMsgIds.length > 0) {
      return pendingEventMsgIds[pendingEventMsgIds.length - 1];
    }
  }

  const history = Array.isArray(state.summaryHistory) ? state.summaryHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const snapshot = history[index];
    const snapshotMsgIds = Array.isArray(snapshot?.sourceAssistantMsgIds)
      ? snapshot.sourceAssistantMsgIds
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    if (snapshotMsgIds.length > 0) {
      return snapshotMsgIds[snapshotMsgIds.length - 1];
    }
    const eventMsgIds = Array.isArray(snapshot?.events)
      ? snapshot.events
          .map((item) => String(item?.sourceAssistantMsgId ?? "").trim())
          .filter(Boolean)
      : [];
    if (eventMsgIds.length > 0) {
      return eventMsgIds[eventMsgIds.length - 1];
    }
  }

  return undefined;
}

var syncSettingsUiCallbackEvent: () => void = () => { };

export function setSyncSettingsUiCallbackEvent(callback: () => void): void {
  syncSettingsUiCallbackEvent = callback;
}

let ACTIVE_CHAT_KEY_Event = "";
let ACTIVE_CHAT_SCOPE_Event: SdkTavernScopeLocatorEvent | null = null;
let CHAT_SCOPED_LOAD_TOKEN_Event = 0;

/**
 * 功能：把 AI 可用骰式配置规范化为受支持的骰面列表文本。
 * 参数：
 *   raw：原始配置文本。
 * 返回：
 *   string：规范化后的逗号分隔文本；为空时回退到默认值。
 */
function normalizeAiAllowedDiceSidesTextEvent(raw: unknown): string {
  const parts = String(raw ?? "")
    .split(/[,\s]+/)
    .map((item) => Number(String(item || "").trim()))
    .filter((value) => Number.isFinite(value) && Number.isInteger(value) && AI_SUPPORTED_DICE_SIDES_Event.includes(value as any));
  const normalized = Array.from(new Set(parts)).sort((left, right) => left - right);
  if (normalized.length > 0) {
    return normalized.join(",");
  }
  return DEFAULT_SETTINGS_Event.aiAllowedDiceSidesText;
}

function traceStoreThemeEvent(message: string, payload?: unknown): void {
  if (payload === undefined) {
    logger.info(`${STORE_THEME_TRACE_PREFIX_Event} ${message}`);
    return;
  }
  logger.info(`${STORE_THEME_TRACE_PREFIX_Event} ${message}`, payload);
}

/**
 * 运行时状态——仅存于内存中，聊天切换时从 chat-scoped store 加载。
 * 不再写入宿主 chat_metadata。
 */
const RUNTIME_DICE_META_Event: DiceMetaEvent = {
  pendingRound: undefined,
  activeStatuses: [],
  outboundSummary: undefined,
  pendingResultGuidanceQueue: [],
  outboundResultGuidance: undefined,
  pendingBlindGuidanceQueue: [],
  outboundBlindGuidance: undefined,
  pendingPassiveDiscoveries: [],
  outboundPassiveDiscovery: undefined,
  passiveDiscoveriesCache: {},
  lastPassiveContextHash: undefined,
  summaryHistory: [],
  lastPromptUserMsgId: undefined,
  lastProcessedAssistantMsgId: undefined,
};
const RUNTIME_DICE_META_LEGACY_Event: DiceMeta = {};

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
    lastBaseRoll: source.lastBaseRoll ?? null,
    pendingRound: source.pendingRound ?? null,
    summaryHistory: Array.isArray(source.summaryHistory) ? source.summaryHistory : [],
  };
}

function getChatStateStoreEvent() {
  // 旧 localStorage 聊天状态链路已彻底移除；聊天状态仅使用 SDK/db。
}

async function readChatScopedStateByKeyEvent(chatKey: string): Promise<RollHelperChatScopedStateEvent> {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const row = await readSdkPluginChatStateAsync(
    SDK_SETTINGS_NAMESPACE_Event,
    chatKey
  );
  return normalizeChatScopedStatePayloadEvent(row?.state as Partial<RollHelperChatScopedStateEvent> ?? {}, fallbackSkillTableText);
}

async function writeChatScopedStateByKeyEvent(
  chatKey: string,
  patchOrNext:
    | Partial<RollHelperChatScopedStateEvent>
    | ((previous: RollHelperChatScopedStateEvent) => Partial<RollHelperChatScopedStateEvent>),
  meta?: { displayName?: string; avatarUrl?: string; roleKey?: string; updatedAt?: number }
): Promise<RollHelperChatScopedStateEvent> {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const previous = await readChatScopedStateByKeyEvent(chatKey);
  const patch = typeof patchOrNext === "function" ? patchOrNext(previous) : patchOrNext;
  const nextPayload = normalizeChatScopedStatePayloadEvent(
    {
      ...previous,
      ...(patch ?? {}),
    },
    fallbackSkillTableText
  );

  const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
  const parsed = parseAnyTavernChatRefEvent(chatKey, {
    tavernInstanceId: scope?.tavernInstanceId,
  });
  const fallbackDisplayName = String(parsed.chatId ?? "unknown_chat").trim();
  await writeSdkPluginChatStateAsync(SDK_SETTINGS_NAMESPACE_Event, chatKey, nextPayload as unknown as Record<string, unknown>, {
    summary: {
      activeStatusCount: nextPayload.activeStatuses.length,
    },
  });
  return nextPayload;
}

function persistSkillPresetStoreToChatScopedEvent(skillPresetStoreText: string): void {
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  void writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
    ...previous,
    skillPresetStoreText,
  })).catch((error) => {
    logger.warn(`聊天级技能持久化失败，chatKey=${chatKey}`, error);
  });
}

/**
 * 功能：将完整运行时状态写入当前聊天级存储，并同步 shared.signals。
 * @returns 无返回值
 */
function persistRuntimeStateToChatScopedEvent(): void {
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  const meta = RUNTIME_DICE_META_Event;
  const diceMeta = RUNTIME_DICE_META_LEGACY_Event;
  void (async () => {
    try {
      await writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
        ...previous,
        activeStatuses: normalizeActiveStatusesFromEvent(meta.activeStatuses),
        lastBaseRoll: diceMeta.last ?? null,
        pendingRound: meta.pendingRound ?? null,
        summaryHistory: Array.isArray(meta.summaryHistory) ? meta.summaryHistory : [],
      }));
      // 写入公共区 shared.signals
      const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
      if (scope) {
        await ensureSdkChatDocument(chatKey, {
          tavernInstanceId: scope.tavernInstanceId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          chatId: scope.currentChatId,
        });
      }
      await patchSdkChatShared(chatKey, {
        signals: {
          stx_rollhelper: {
            lastRollSummary: diceMeta.last ? `${diceMeta.last.expr} = ${diceMeta.last.total}` : null,
            hasPendingRound: !!meta.pendingRound,
            activeStatusCount: meta.activeStatuses.length,
          },
        },
      });
    } catch (error) {
      logger.warn(`运行时状态持久化失败，chatKey=${chatKey}`, error);
    }
  })();
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
  const list = await listSdkPluginChatStateSummariesAsync(SDK_SETTINGS_NAMESPACE_Event);
  return list.map((item) => ({
    chatKey: String(item.chatKey ?? "").trim(),
    updatedAt: Number(item.updatedAt) || 0,
    activeStatusCount: Number((item.summary as { activeStatusCount?: unknown })?.activeStatusCount) || 0,
    chatId: "",
    displayName: "",
    avatarUrl: "",
    scopeType: "character" as const,
    scopeId: "",
    roleKey: "",
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
  const state = await readChatScopedStateByKeyEvent(chatKey);
  return normalizeActiveStatusesFromEvent(state.activeStatuses);
}

export async function saveStatusesForChatKeyEvent(
  chatKey: string,
  statuses: ActiveStatusEvent[]
): Promise<void> {
  await writeChatScopedStateByKeyEvent(chatKey, (previous) => ({
    ...previous,
    activeStatuses: normalizeActiveStatusesFromEvent(statuses),
  }));
}

export interface CleanupUnusedChatStatesResultEvent {
  deletedCount: number;
  deletedChatKeys: string[];
}

export async function cleanupUnusedChatStatesForCurrentTavernEvent(
  retainChatKeys: string[]
): Promise<CleanupUnusedChatStatesResultEvent> {
  const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
  if (!scope) {
    return {
      deletedCount: 0,
      deletedChatKeys: [],
    };
  }
  ACTIVE_CHAT_SCOPE_Event = scope;

  const retain = new Set(
    (Array.isArray(retainChatKeys) ? retainChatKeys : [])
      .map((item) =>
        buildTavernChatEntityKeyEvent(
          parseAnyTavernChatRefEvent(String(item ?? "").trim(), {
            tavernInstanceId: String(scope.tavernInstanceId ?? "").trim(),
          })
        )
      )
      .filter(Boolean)
  );
  const summaries = await listSdkPluginChatStateSummariesAsync(SDK_SETTINGS_NAMESPACE_Event);
  const deletedChatKeys: string[] = [];

  for (const item of summaries) {
    const chatKey = String(item.chatKey ?? "").trim();
    if (!chatKey) continue;
    const entityKey = buildTavernChatEntityKeyEvent(
      parseAnyTavernChatRefEvent(chatKey, {
        tavernInstanceId: String(scope.tavernInstanceId ?? "").trim(),
      })
    );
    if (!entityKey || retain.has(entityKey)) continue;
    const deleted = await deleteSdkPluginChatStateAsync(SDK_SETTINGS_NAMESPACE_Event, chatKey);
    if (!deleted) continue;
    deletedChatKeys.push(chatKey);
  }

  return {
    deletedCount: deletedChatKeys.length,
    deletedChatKeys,
  };
}

export async function loadChatScopedStateIntoRuntimeEvent(reason = "init"): Promise<void> {
  const token = ++CHAT_SCOPED_LOAD_TOKEN_Event;
  const chatKey = resolveCurrentChatKeyEvent();
  if (!chatKey) return;
  try {
    const state = await readChatScopedStateByKeyEvent(chatKey);
    if (token !== CHAT_SCOPED_LOAD_TOKEN_Event) return;

    const settings = getSettingsEvent();
    const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
      state.skillPresetStoreText
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
    meta.pendingRound = state.pendingRound ?? undefined;
    meta.summaryHistory = Array.isArray(state.summaryHistory) ? state.summaryHistory : [];
    meta.outboundSummary = undefined;
    meta.pendingResultGuidanceQueue = [];
    meta.outboundResultGuidance = undefined;
    meta.pendingBlindGuidanceQueue = [];
    meta.outboundBlindGuidance = undefined;
    meta.pendingPassiveDiscoveries = [];
    meta.outboundPassiveDiscovery = undefined;
    meta.passiveDiscoveriesCache = {};
    meta.lastPassiveContextHash = undefined;
    meta.lastPromptUserMsgId = undefined;
    meta.lastProcessedAssistantMsgId = resolveLastProcessedAssistantMsgIdFromStateEvent(state);
    const diceMetaLegacy = getDiceMeta();
    diceMetaLegacy.last = state.lastBaseRoll ?? undefined;
    diceMetaLegacy.lastTotal = state.lastBaseRoll?.total;
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
  } catch (error) {
    logger.warn(`聊天级状态装载失败，已降级默认 (${reason}) chatKey=${chatKey}`, error);
    const settings = getSettingsEvent();
    const defaultStore = buildDefaultSkillPresetStoreEvent();
    const nextSkillPresetStoreText = JSON.stringify(defaultStore, null, 2);
    const nextSkillTableText = syncActivePresetToSkillTableTextEvent(defaultStore, settings.skillTableText);
    const meta = getDiceMetaEvent();
    meta.activeStatuses = [];
    meta.pendingRound = undefined;
    meta.summaryHistory = [];
    meta.outboundSummary = undefined;
    meta.pendingResultGuidanceQueue = [];
    meta.outboundResultGuidance = undefined;
    meta.pendingBlindGuidanceQueue = [];
    meta.outboundBlindGuidance = undefined;
    meta.pendingPassiveDiscoveries = [];
    meta.outboundPassiveDiscovery = undefined;
    meta.passiveDiscoveriesCache = {};
    meta.lastPassiveContextHash = undefined;
    meta.lastPromptUserMsgId = undefined;
    meta.lastProcessedAssistantMsgId = undefined;
    const diceMetaLegacy = getDiceMeta();
    diceMetaLegacy.last = undefined;
    diceMetaLegacy.lastTotal = undefined;

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
  return RUNTIME_DICE_META_LEGACY_Event;
}

export function saveLastRoll(result: DiceResult): void {
  const meta = getDiceMeta();
  meta.last = result;
  meta.lastTotal = result.total;
  saveMetadataSafeEvent();
  // 追加到 chat_plugin_records
  const chatKey = getActiveChatKeyEvent();
  if (chatKey) {
    void appendSdkPluginChatRecord(SDK_SETTINGS_NAMESPACE_Event, chatKey, 'roll_results', {
      recordId: createIdEvent('roll'),
      payload: result as unknown as Record<string, unknown>,
    }).catch(() => {});
  }
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
  if (!Array.isArray(RUNTIME_DICE_META_Event.activeStatuses)) {
    RUNTIME_DICE_META_Event.activeStatuses = [];
  }
  return RUNTIME_DICE_META_Event;
}

export function saveMetadataSafeEvent(): void {
  persistRuntimeStateToChatScopedEvent();
}

function normalizeSettingsThemeCompatEvent(raw: unknown): RollHelperSettingsThemeEvent {
  return normalizeSettingsThemeEvent(raw);
}

function resolveSdkSettingsThemeEvent(): RollHelperSettingsThemeEvent {
  const selection = getTheme().themeId;
  return sdkThemeToSettingsThemeEvent(selection);
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
  const settingsTheme = normalizeSettingsThemeCompatEvent(settings.theme);
  const sdkSettingsTheme = resolveSdkSettingsThemeEvent();
  if (settingsTheme !== sdkSettingsTheme) {
    traceStoreThemeEvent("ensureSettingsThemeMirrorEvent writing mirrored theme back to settings", {
      settingsTheme,
      sdkSettingsTheme,
      allowSeedFromLegacy,
      settingsTheme_raw: settings.theme,
    });
    return writeSettingsForCurrentScopeEvent({
      theme: sdkSettingsTheme,
    });
  }
  if (settings.theme === sdkSettingsTheme) return settings;
  return {
    ...settings,
    theme: sdkSettingsTheme,
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
  bucket.enable3DDiceBox = bucket.enable3DDiceBox !== false;
  bucket.enableRerollFeature = bucket.enableRerollFeature === true;
  bucket.enableExplodingDice = bucket.enableExplodingDice !== false;
  bucket.enableAdvantageSystem = bucket.enableAdvantageSystem !== false;
  bucket.enableDynamicResultGuidance = bucket.enableDynamicResultGuidance === true;
  bucket.enableDynamicDcReason = bucket.enableDynamicDcReason !== false;
  bucket.enableStatusSystem = bucket.enableStatusSystem !== false;
  bucket.aiAllowedDiceSidesText = normalizeAiAllowedDiceSidesTextEvent((source as any)?.aiAllowedDiceSidesText);
  const rawTheme = String((source as any)?.theme ?? "").trim().toLowerCase();
  bucket.theme =
    rawTheme === "dark" || rawTheme === "light" || rawTheme === "tavern"
      ? (rawTheme as RollHelperSettingsThemeEvent)
      : rawTheme === "host"
        ? "tavern"
        : "default";
  bucket.enableOutcomeBranches = bucket.enableOutcomeBranches !== false;
  bucket.enableExplodeOutcomeBranch = bucket.enableExplodeOutcomeBranch !== false;
  bucket.includeOutcomeInSummary = bucket.includeOutcomeInSummary !== false;
  bucket.showOutcomePreviewInListCard =
    typeof (source as any)?.showOutcomePreviewInListCard === "boolean"
      ? bucket.showOutcomePreviewInListCard !== false
      : DEFAULT_SETTINGS_Event.showOutcomePreviewInListCard;
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
  bucket.enableInteractiveTriggers = bucket.enableInteractiveTriggers !== false;
  bucket.interactiveTriggerMode = "ai_markup";
  bucket.enableBlindRoll = bucket.enableBlindRoll !== false;
  bucket.defaultBlindSkillsText =
    typeof bucket.defaultBlindSkillsText === "string" && bucket.defaultBlindSkillsText.trim().length > 0
      ? bucket.defaultBlindSkillsText
      : DEFAULT_SETTINGS_Event.defaultBlindSkillsText;
  const maxBlindRollsPerRoundRaw = Number((source as any)?.maxBlindRollsPerRound);
  bucket.maxBlindRollsPerRound = Number.isFinite(maxBlindRollsPerRoundRaw)
    ? Math.max(1, Math.floor(maxBlindRollsPerRoundRaw))
    : DEFAULT_SETTINGS_Event.maxBlindRollsPerRound;
  const maxQueuedBlindGuidanceRaw = Number((source as any)?.maxQueuedBlindGuidance);
  bucket.maxQueuedBlindGuidance = Number.isFinite(maxQueuedBlindGuidanceRaw)
    ? Math.max(1, Math.floor(maxQueuedBlindGuidanceRaw))
    : DEFAULT_SETTINGS_Event.maxQueuedBlindGuidance;
  const blindGuidanceTtlSecondsRaw = Number((source as any)?.blindGuidanceTtlSeconds);
  bucket.blindGuidanceTtlSeconds = Number.isFinite(blindGuidanceTtlSecondsRaw)
    ? Math.max(30, Math.floor(blindGuidanceTtlSecondsRaw))
    : DEFAULT_SETTINGS_Event.blindGuidanceTtlSeconds;
  bucket.enableBlindGuidanceDedup = (source as any)?.enableBlindGuidanceDedup !== false;
  bucket.blindDedupScope =
    (source as any)?.blindDedupScope === "same_floor" ? "same_floor" : "same_round";
  bucket.enablePassiveCheck = bucket.enablePassiveCheck !== false;
  const passiveFormulaBaseRaw = Number((source as any)?.passiveFormulaBase);
  bucket.passiveFormulaBase = Number.isFinite(passiveFormulaBaseRaw)
    ? Math.max(0, Math.floor(passiveFormulaBaseRaw))
    : DEFAULT_SETTINGS_Event.passiveFormulaBase;
  bucket.passiveSkillAliasesText =
    typeof bucket.passiveSkillAliasesText === "string" && bucket.passiveSkillAliasesText.trim().length > 0
      ? bucket.passiveSkillAliasesText
      : DEFAULT_SETTINGS_Event.passiveSkillAliasesText;
  const worldbookPassiveModeRaw = String((source as any)?.worldbookPassiveMode ?? "").trim().toLowerCase();
  bucket.worldbookPassiveMode =
    worldbookPassiveModeRaw === "disabled" || worldbookPassiveModeRaw === "read_only"
      ? (worldbookPassiveModeRaw as DicePluginSettingsEvent["worldbookPassiveMode"])
      : "read_write";
  bucket.enableNarrativeCostEnforcement = bucket.enableNarrativeCostEnforcement !== false;
  bucket.blindUiWarnInConsole = bucket.blindUiWarnInConsole !== false;
  bucket.blindRevealInSummary = bucket.blindRevealInSummary === true;
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
  const mirrored = ensureSettingsThemeMirrorEvent(current, false);
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
}

export function updateSettingsEvent(patch: Partial<DicePluginSettingsEvent>): void {
  const patchAny = patch as Partial<DicePluginSettingsEvent> & { theme?: RollHelperSettingsThemeEvent };
  traceStoreThemeEvent("updateSettingsEvent", {
    patch,
    patchTheme: patchAny.theme ?? null,
    sdkThemeBefore: resolveSdkSettingsThemeEvent(),
  });
  const nextTheme =
    patchAny.theme != null
      ? normalizeSettingsThemeCompatEvent(patchAny.theme)
      : null;
  const { theme: _themeIgnored, ...restPatch } = patchAny;
  writeSettingsForCurrentScopeEvent(
    nextTheme == null
      ? restPatch
      : {
          ...restPatch,
          theme: nextTheme,
        }
  );
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
  _fallbackSkillTableText?: string
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
    rawStoreText
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
    JSON.stringify(store)
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
