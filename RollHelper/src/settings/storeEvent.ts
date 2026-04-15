import type { DiceResult } from "../types/diceEvent";
import type {
  ActiveStatusEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventRollRecordEvent,
  PendingRoundEvent,
  RollHelperChatDatabaseEvent,
  RollHelperChatMetaEvent,
  RollHelperChatRecordEvent,
  RollHelperCurrentStatusesStateEvent,
  RollHelperFloorRecordEvent,
  RollHelperFloorTriggersEvent,
  RollHelperRoundRecordEvent,
  RollHelperSkillsStateEvent,
  RollHelperStatusesStateEvent,
  RoundSummaryEventItemEvent,
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
import { setSummaryHistoryRuntimeEvent, clearSummaryHistoryRuntimeEvent } from "../events/summaryEvent";
import { clearBlindHistoryRuntimeEvent } from "../events/roundEvent";
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
const STORE_RUNTIME_TRACE_PREFIX_Event = "[SS-Helper][StoreRuntimeTrace]";
let SETTINGS_STORE_Event: ReturnType<typeof createSdkPluginSettingsStore<DicePluginSettingsEvent>> | null = null;
interface ScopedSettingsCacheEvent {
  scopeKey: string;
  settings: DicePluginSettingsEvent;
}
let SETTINGS_CACHE_Event: ScopedSettingsCacheEvent | null = null;
let SETTINGS_STORE_SUBSCRIBED_Event = false;

// 旧 RollHelperChatScopedStateEvent 已移除，数据来源统一由 chatData (v3) 提供。

var syncSettingsUiCallbackEvent: () => void = () => { };

export function setSyncSettingsUiCallbackEvent(callback: () => void): void {
  syncSettingsUiCallbackEvent = callback;
}

let ACTIVE_CHAT_KEY_Event = "";
let ACTIVE_CHAT_SCOPE_Event: SdkTavernScopeLocatorEvent | null = null;
let CHAT_SCOPED_LOAD_TOKEN_Event = 0;
const CHAT_DATA_SCHEMA_VERSION_Event = 1;
let ACTIVE_CHAT_ID_V3_Event = "";
let ACTIVE_CHAT_DATA_V3_Event: RollHelperChatRecordEvent | null = null;

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

function traceStoreRuntimeEvent(message: string, payload?: unknown): void {
  if (payload === undefined) {
    logger.info(`${STORE_RUNTIME_TRACE_PREFIX_Event} ${message}`);
    return;
  }
  logger.info(`${STORE_RUNTIME_TRACE_PREFIX_Event} ${message}`, payload);
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
  selectionFallbackState: undefined,
  lastPromptUserMsgId: undefined,
};

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
 * 功能：解析当前聊天的官方 chatId，作为 v3 数据结构的唯一聊天主键。
 * 返回：
 *   string：官方 chatId；不可用时返回空字符串。
 */
function resolveCurrentOfficialChatIdEvent(): string {
  const liveCtx = getLiveContextEvent();
  const runtimeChatId = String(liveCtx?.chatId ?? liveCtx?.chat_id ?? "").trim();
  if (runtimeChatId) {
    ACTIVE_CHAT_ID_V3_Event = runtimeChatId;
    return runtimeChatId;
  }
  const scope = getTavernContextSnapshotEvent();
  const scopedChatId = String(scope?.currentChatId ?? "").trim();
  ACTIVE_CHAT_ID_V3_Event = scopedChatId;
  return scopedChatId;
}

function normalizeFloorIdEvent(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function buildDefaultChatSkillsStateEvent(
  fallbackSkillTableText: string,
  now = Date.now()
): RollHelperSkillsStateEvent {
  const settings = getSettingsEvent();
  const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    settings.skillPresetStoreText,
    fallbackSkillTableText
  );
  const presetStore =
    parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent(now);
  return {
    activePresetId: String(presetStore.activePresetId ?? "").trim() || SKILL_PRESET_DEFAULT_ID_Event,
    currentSkillTableText: syncActivePresetToSkillTableTextEvent(presetStore, settings.skillTableText || fallbackSkillTableText),
    presetStore,
    updatedAt: now,
  };
}

function buildDefaultCurrentStatusesStateEvent(now = Date.now()): RollHelperCurrentStatusesStateEvent {
  return {
    activeStatusIds: [],
    snapshot: [],
    updatedAt: now,
  };
}

function buildDefaultStatusesStateEvent(now = Date.now()): RollHelperStatusesStateEvent {
  return {
    order: [],
    records: {},
    current: buildDefaultCurrentStatusesStateEvent(now),
  };
}

function buildDefaultChatMetaEvent(now = Date.now()): RollHelperChatMetaEvent {
  return {
    schemaVersion: CHAT_DATA_SCHEMA_VERSION_Event,
    updatedAt: now,
    openRoundId: null,
    lastProcessedFloorId: null,
    lastUserMessageId: null,
  };
}

function buildDefaultChatRecordEvent(
  _chatId: string,
  fallbackSkillTableText: string,
  now = Date.now()
): RollHelperChatRecordEvent {
  return {
    meta: buildDefaultChatMetaEvent(now),
    floorOrder: [],
    floors: {},
    rounds: {
      order: [],
      records: {},
    },
    skills: buildDefaultChatSkillsStateEvent(fallbackSkillTableText, now),
    statuses: buildDefaultStatusesStateEvent(now),
  };
}

function normalizeFloorTriggersStateEvent(source: unknown): RollHelperFloorTriggersEvent {
  const raw = source && typeof source === "object" && !Array.isArray(source)
    ? source as Partial<RollHelperFloorTriggersEvent>
    : {};
  return {
    interactive: Array.isArray(raw.interactive) ? raw.interactive : [],
    triggerPack: raw.triggerPack ?? null,
    lifecycle: {
      hydratedFrom: raw.lifecycle?.hydratedFrom === "metadata" ? "metadata" : "markup",
      sanitizedAt: Number(raw.lifecycle?.sanitizedAt) || 0,
      lastSourceKind: String(raw.lifecycle?.lastSourceKind ?? "raw_source"),
    },
  };
}

function normalizeChatRecordEvent(
  source: unknown,
  chatId: string,
  fallbackSkillTableText: string
): RollHelperChatRecordEvent {
  const now = Date.now();
  const raw = source && typeof source === "object" && !Array.isArray(source)
    ? source as Partial<RollHelperChatRecordEvent>
    : {};
  const next = buildDefaultChatRecordEvent(chatId, fallbackSkillTableText, now);
  const floorsSource = raw.floors && typeof raw.floors === "object" && !Array.isArray(raw.floors)
    ? raw.floors
    : {};
  const floors: Record<string, RollHelperFloorRecordEvent> = {};
  const floorOrder = new Set<number>();

  for (const [rawKey, rawFloor] of Object.entries(floorsSource)) {
    if (!rawFloor || typeof rawFloor !== "object" || Array.isArray(rawFloor)) continue;
    const floorSource = rawFloor as Partial<RollHelperFloorRecordEvent>;
    const floorId = normalizeFloorIdEvent(floorSource.floorId ?? floorSource.messageId ?? rawKey);
    if (floorId == null) continue;
    floorOrder.add(floorId);
    floors[String(floorId)] = {
      floorId,
      messageId: floorId,
      role: "assistant",
      createdAt: Number(floorSource.createdAt) || now,
      updatedAt: Number(floorSource.updatedAt) || now,
      content: {
        raw: String(floorSource.content?.raw ?? ""),
        processed: String(floorSource.content?.processed ?? ""),
      },
      triggers: normalizeFloorTriggersStateEvent(floorSource.triggers),
      eventDice: {
        events: Array.isArray(floorSource.eventDice?.events) ? floorSource.eventDice.events : [],
        publicRolls: Array.isArray(floorSource.eventDice?.publicRolls) ? floorSource.eventDice.publicRolls : [],
        blindRolls: Array.isArray(floorSource.eventDice?.blindRolls) ? floorSource.eventDice.blindRolls : [],
      },
      statusRefs: Array.isArray(floorSource.statusRefs)
        ? floorSource.statusRefs.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
      roundRefs: Array.isArray(floorSource.roundRefs)
        ? floorSource.roundRefs.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
    };
  }

  const presetStore =
    parseSkillPresetStoreTextEvent(
      normalizeSkillPresetStoreTextForSettingsEvent(
        JSON.stringify((raw.skills?.presetStore ?? null) || {}, null, 2),
        fallbackSkillTableText
      )
    ) ?? buildDefaultSkillPresetStoreEvent(now);
  const normalizedStatuses = normalizeActiveStatusesFromEvent(raw.statuses?.current?.snapshot);

  return {
    meta: {
      schemaVersion: CHAT_DATA_SCHEMA_VERSION_Event,
      updatedAt: Number(raw.meta?.updatedAt) || now,
      openRoundId: String(raw.meta?.openRoundId ?? "").trim() || null,
      lastProcessedFloorId: normalizeFloorIdEvent(raw.meta?.lastProcessedFloorId),
      lastUserMessageId: normalizeFloorIdEvent(raw.meta?.lastUserMessageId),
    },
    floorOrder: Array.from(
      new Set([
        ...(
          Array.isArray(raw.floorOrder)
            ? raw.floorOrder.map((item) => normalizeFloorIdEvent(item)).filter((item): item is number => item != null)
            : []
        ),
        ...Array.from(floorOrder),
      ])
    ).sort((left, right) => left - right),
    floors,
    rounds: {
      order: Array.isArray(raw.rounds?.order)
        ? raw.rounds.order.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
      records: raw.rounds?.records && typeof raw.rounds.records === "object" && !Array.isArray(raw.rounds.records)
        ? raw.rounds.records as Record<string, RollHelperRoundRecordEvent>
        : {},
    },
    skills: {
      activePresetId: String(raw.skills?.activePresetId ?? presetStore.activePresetId ?? SKILL_PRESET_DEFAULT_ID_Event).trim() || SKILL_PRESET_DEFAULT_ID_Event,
      currentSkillTableText: typeof raw.skills?.currentSkillTableText === "string"
        ? raw.skills.currentSkillTableText
        : syncActivePresetToSkillTableTextEvent(presetStore, fallbackSkillTableText),
      presetStore,
      updatedAt: Number(raw.skills?.updatedAt) || now,
    },
    statuses: {
      order: Array.isArray(raw.statuses?.order)
        ? raw.statuses.order.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [],
      records: raw.statuses?.records && typeof raw.statuses.records === "object" && !Array.isArray(raw.statuses.records)
        ? raw.statuses.records as RollHelperStatusesStateEvent["records"]
        : {},
      current: {
        activeStatusIds: Array.isArray(raw.statuses?.current?.activeStatusIds)
          ? raw.statuses.current.activeStatusIds.map((item) => String(item ?? "").trim()).filter(Boolean)
          : [],
        snapshot: normalizedStatuses,
        updatedAt: Number(raw.statuses?.current?.updatedAt) || now,
      },
    },
  };
}

function normalizeChatDatabasePayloadEvent(
  source: unknown,
  chatId: string,
  fallbackSkillTableText: string
): RollHelperChatDatabaseEvent {
  const raw = source && typeof source === "object" && !Array.isArray(source)
    ? source as Partial<RollHelperChatDatabaseEvent>
    : {};
  const rawChatData = raw.chatData && typeof raw.chatData === "object" && !Array.isArray(raw.chatData)
    ? raw.chatData
    : {};
  return {
    chatData: {
      [chatId]: normalizeChatRecordEvent(rawChatData?.[chatId], chatId, fallbackSkillTableText),
    },
  };
}

function buildSkillsStateFromSettingsEvent(now = Date.now()): RollHelperSkillsStateEvent {
  const settings = getSettingsEvent();
  const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
    settings.skillPresetStoreText,
    settings.skillTableText
  );
  const presetStore =
    parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent(now);
  return {
    activePresetId: String(presetStore.activePresetId ?? "").trim() || SKILL_PRESET_DEFAULT_ID_Event,
    currentSkillTableText: syncActivePresetToSkillTableTextEvent(presetStore, settings.skillTableText),
    presetStore,
    updatedAt: now,
  };
}

function buildCurrentStatusesStateFromRuntimeEvent(now = Date.now()): RollHelperCurrentStatusesStateEvent {
  const normalized = normalizeActiveStatusesFromEvent(getDiceMetaEvent().activeStatuses);
  const activeStatusIds = normalized.map((status, index) => {
    const createdAt = Number(status.createdAt) || 0;
    const nameKey = normalizeStatusNameKeyEvent(status.name || `status_${index}`);
    return `status:${nameKey}:${createdAt}:${index}`;
  });
  return {
    activeStatusIds,
    snapshot: normalized,
    updatedAt: now,
  };
}

function buildRoundRecordFromPendingRoundEvent(
  round: PendingRoundEvent,
  lastProcessedFloorId: number | null
): RollHelperRoundRecordEvent {
  const floorIds = new Set<number>();
  if (lastProcessedFloorId != null) {
    floorIds.add(lastProcessedFloorId);
  }
  return {
    roundId: String(round.roundId ?? "").trim(),
    status: round.status === "closed" ? "closed" : "open",
    openedAt: Number(round.openedAt) || Date.now(),
    closedAt: round.status === "closed" ? Date.now() : null,
    floorIds: Array.from(floorIds),
    eventRefs: Array.isArray(round.events)
      ? round.events.map((event) => `${lastProcessedFloorId ?? "unknown"}:${String(event?.id ?? "").trim()}`).filter(Boolean)
      : [],
    rollRefs: Array.isArray(round.rolls)
      ? round.rolls.map((record) => `${lastProcessedFloorId ?? "unknown"}:${String(record?.rollId ?? "").trim()}`).filter(Boolean)
      : [],
    summaryCache: {
      eventsCount: Array.isArray(round.events) ? round.events.length : 0,
      rolledCount: Array.isArray(round.rolls) ? round.rolls.length : 0,
    },
  };
}

async function syncCurrentChatDataFromRuntimeEvent(reason = "runtime_sync"): Promise<void> {
  const chatId = getActiveChatIdEvent();
  if (!chatId) return;
  const now = Date.now();
  const currentStatuses = buildCurrentStatusesStateFromRuntimeEvent(now);
  const meta = getDiceMetaEvent();
  await writeChatDatabaseByChatIdEvent(chatId, (previous) => {
    // 保留已有 rounds（含已关闭回合），只更新当前 open round
    const nextRecords = { ...(previous.rounds.records ?? {}) };
    const nextOrder = [...(previous.rounds.order ?? [])];
    if (meta.pendingRound?.roundId) {
      const roundId = String(meta.pendingRound.roundId).trim();
      if (roundId) {
        nextRecords[roundId] = buildRoundRecordFromPendingRoundEvent(
          meta.pendingRound,
          previous.meta.lastProcessedFloorId
        );
        if (!nextOrder.includes(roundId)) {
          nextOrder.push(roundId);
        }
        // 从 floor.roundRefs 补充 floorIds
        for (const floorId of previous.floorOrder) {
          const floor = previous.floors[String(floorId)];
          if (!floor) continue;
          for (const ref of floor.roundRefs) {
            if (String(ref ?? "").trim() !== roundId) continue;
            const existing = nextRecords[roundId];
            if (existing && !existing.floorIds.includes(floorId)) {
              existing.floorIds = [...existing.floorIds, floorId].sort((a, b) => a - b);
            }
          }
        }
      }
    }
    return {
      ...previous,
      meta: {
        ...previous.meta,
        updatedAt: now,
        openRoundId: meta.pendingRound?.status === "open"
          ? String(meta.pendingRound?.roundId ?? "").trim() || null
          : null,
      },
      skills: buildSkillsStateFromSettingsEvent(now),
      rounds: {
        order: Array.from(new Set(nextOrder)).filter(Boolean),
        records: nextRecords,
      },
      statuses: {
        ...previous.statuses,
        current: currentStatuses,
      },
    };
  });
  traceStoreRuntimeEvent("syncCurrentChatDataFromRuntimeEvent", {
    reason,
    chatId,
    floorCount: getCurrentChatDataEvent().floorOrder.length,
    roundCount: getCurrentChatDataEvent().rounds.order.length,
    activeStatusCount: getCurrentChatDataEvent().statuses.current.snapshot.length,
  });
}

/**
 * 功能：从 chatData 的 open round + floors 重建 PendingRoundEvent，用于桥接旧运行时。
 */
function reconstructPendingRoundFromChatDataEvent(
  chatRecord: RollHelperChatRecordEvent
): PendingRoundEvent | undefined {
  const openRoundId = chatRecord.meta.openRoundId;
  if (!openRoundId) return undefined;
  const roundRecord = chatRecord.rounds.records[openRoundId];
  if (!roundRecord || roundRecord.status !== "open") return undefined;

  const events: import("../types/eventDomainEvent").DiceEventSpecEvent[] = [];
  const rolls: import("../types/eventDomainEvent").EventRollRecordEvent[] = [];
  const sourceAssistantMsgIds: string[] = [];

  for (const floorId of roundRecord.floorIds) {
    const floor = chatRecord.floors[String(floorId)];
    if (!floor) continue;
    events.push(...(floor.eventDice?.events ?? []));
    rolls.push(...(floor.eventDice?.publicRolls ?? []));
    sourceAssistantMsgIds.push(`assistant_idx:${floorId}:${floor.createdAt || 0}`);
  }

  return {
    roundId: roundRecord.roundId,
    instanceToken: roundRecord.roundId,
    status: "open",
    events,
    rolls,
    eventTimers: {},
    sourceAssistantMsgIds,
    openedAt: roundRecord.openedAt,
  };
}

/**
 * 功能：从 chatData 的 closed rounds + floors 重建 RoundSummarySnapshotEvent[]，
 *       填充到运行时摘要历史列表中供 promptEvent / interactiveTriggersEvent 使用。
 */
function rebuildSummaryHistoryRuntimeFromChatDataEvent(
  chatRecord: RollHelperChatRecordEvent
): RoundSummarySnapshotEvent[] {
  const snapshots: RoundSummarySnapshotEvent[] = [];
  for (const roundId of chatRecord.rounds.order) {
    const roundRec = chatRecord.rounds.records[roundId];
    if (!roundRec || roundRec.status !== "closed") continue;
    const events: RoundSummaryEventItemEvent[] = [];
    const sourceAssistantMsgIds: string[] = [];
    for (const floorId of roundRec.floorIds ?? []) {
      const floor = chatRecord.floors[String(floorId)];
      if (!floor?.eventDice) continue;
      const allRolls: EventRollRecordEvent[] = [
        ...(floor.eventDice.publicRolls ?? []),
        ...(floor.eventDice.blindRolls ?? []),
      ];
      for (const event of floor.eventDice.events ?? []) {
        const record = allRolls.find((r) => r.eventId === event.id) ?? null;
        events.push(buildMinimalSummaryItemEvent(event, record));
        if (event.sourceAssistantMsgId && !sourceAssistantMsgIds.includes(event.sourceAssistantMsgId)) {
          sourceAssistantMsgIds.push(event.sourceAssistantMsgId);
        }
      }
    }
    if (events.length === 0) continue;
    snapshots.push({
      roundId: roundRec.roundId,
      openedAt: roundRec.openedAt,
      closedAt: roundRec.closedAt ?? Date.now(),
      eventsCount: events.length,
      rolledCount: events.filter((e) => e.rollId || e.resultSource).length,
      events,
      sourceAssistantMsgIds,
    });
  }
  return snapshots;
}

/** 从楼层数据最小化构建一条 RoundSummaryEventItemEvent。 */
export function buildMinimalSummaryItemEvent(
  event: DiceEventSpecEvent,
  record: EventRollRecordEvent | null
): RoundSummaryEventItemEvent {
  return {
    id: event.id,
    title: event.title,
    desc: event.desc,
    targetLabel: event.targetLabel,
    skill: event.skill,
    checkDice: event.checkDice,
    compare: (event.compare as any) ?? ">=",
    dc: Number.isFinite(event.dc) ? Number(event.dc) : 0,
    difficulty: event.difficulty,
    dcSource: event.dcSource,
    dcReason: String(event.dcReason || ""),
    rollMode: event.rollMode === "auto" ? "auto" : "manual",
    advantageState: record?.advantageStateApplied ?? event.advantageState ?? "normal",
    urgency: event.urgency,
    timeLimit: event.timeLimit ?? "none",
    status: record ? (record.source === "timeout_auto_fail" ? "timeout" : "done") : "pending",
    resultSource: record?.source ?? null,
    visibility: record?.visibility,
    revealMode: record?.revealMode === "instant" ? "instant" : "delayed",
    total: record && Number.isFinite(Number(record.result.total)) ? Number(record.result.total) : null,
    skillModifierApplied: Number(record?.skillModifierApplied ?? 0),
    statusModifierApplied: Number(record?.statusModifierApplied ?? 0),
    baseModifierUsed: Number(record?.baseModifierUsed ?? 0),
    finalModifierUsed: Number(record?.finalModifierUsed ?? 0),
    success: record ? record.success : null,
    marginToDc: typeof record?.marginToDc === "number" ? record.marginToDc : null,
    resultGrade: (record?.resultGrade as any) ?? null,
    outcomeKind: "none",
    outcomeText: "",
    explosionTriggered: record?.result?.explosionTriggered ?? false,
    sourceAssistantMsgId: event.sourceAssistantMsgId,
    rollId: record?.rollId,
    rolledAt: record?.rolledAt,
    targetLabelUsed: record?.targetLabelUsed,
    statusModifiersApplied: record?.statusModifiersApplied ? [...record.statusModifiersApplied] : undefined,
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
  };
}

async function readChatDatabaseByChatIdEvent(chatId: string): Promise<RollHelperChatDatabaseEvent> {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const row = await readSdkPluginChatStateAsync(
    SDK_SETTINGS_NAMESPACE_Event,
    chatId
  );
  return normalizeChatDatabasePayloadEvent(row?.state, chatId, fallbackSkillTableText);
}

async function writeChatDatabaseByChatIdEvent(
  chatId: string,
  patchOrNext:
    | Partial<RollHelperChatRecordEvent>
    | ((previous: RollHelperChatRecordEvent) => Partial<RollHelperChatRecordEvent> | RollHelperChatRecordEvent)
): Promise<RollHelperChatRecordEvent> {
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  const previousDatabase = await readChatDatabaseByChatIdEvent(chatId);
  const previous = previousDatabase.chatData[chatId] ?? buildDefaultChatRecordEvent(chatId, fallbackSkillTableText);
  const patch = typeof patchOrNext === "function" ? patchOrNext(previous) : patchOrNext;
  const next = normalizeChatRecordEvent(
    {
      ...previous,
      ...(patch ?? {}),
      meta: {
        ...(previous.meta ?? buildDefaultChatMetaEvent()),
        ...((patch as Partial<RollHelperChatRecordEvent> | undefined)?.meta ?? {}),
        updatedAt: Date.now(),
      },
    },
    chatId,
    fallbackSkillTableText
  );
  const nextState: RollHelperChatDatabaseEvent = {
    chatData: {
      [chatId]: next,
    },
  };
  await writeSdkPluginChatStateAsync(
    SDK_SETTINGS_NAMESPACE_Event,
    chatId,
    nextState as unknown as Record<string, unknown>,
    {
      schemaVersion: CHAT_DATA_SCHEMA_VERSION_Event,
      summary: {
        floorCount: next.floorOrder.length,
        roundCount: next.rounds.order.length,
        statusCount: next.statuses.order.length,
      },
    }
  );
  ACTIVE_CHAT_ID_V3_Event = chatId;
  ACTIVE_CHAT_DATA_V3_Event = next;
  return next;
}

export function getActiveChatIdEvent(): string {
  if (ACTIVE_CHAT_ID_V3_Event) return ACTIVE_CHAT_ID_V3_Event;
  return resolveCurrentOfficialChatIdEvent();
}

export function getCurrentChatDataEvent(): RollHelperChatRecordEvent {
  const chatId = getActiveChatIdEvent();
  const fallbackSkillTableText = getSettingsEvent().skillTableText;
  if (!chatId) {
    return buildDefaultChatRecordEvent("", fallbackSkillTableText);
  }
  if (!ACTIVE_CHAT_DATA_V3_Event || ACTIVE_CHAT_ID_V3_Event !== chatId) {
    ACTIVE_CHAT_DATA_V3_Event = buildDefaultChatRecordEvent(chatId, fallbackSkillTableText);
    ACTIVE_CHAT_ID_V3_Event = chatId;
  }
  return ACTIVE_CHAT_DATA_V3_Event;
}

export function resolveAssistantFloorIdByMessageEvent(message: unknown): number | null {
  const liveCtx = getLiveContextEvent();
  const chat = Array.isArray(liveCtx?.chat) ? liveCtx.chat : [];
  const directIndex = chat.findIndex((item) => item === message);
  if (directIndex >= 0) {
    return directIndex;
  }
  const explicitIndex = Number((message as any)?.mesid ?? (message as any)?.messageId ?? (message as any)?.message_id);
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0) {
    return explicitIndex;
  }
  return null;
}

export function getAssistantFloorRecordByMessageEvent(
  message: unknown,
  create = false
): RollHelperFloorRecordEvent | null {
  const floorId = resolveAssistantFloorIdByMessageEvent(message);
  if (floorId == null) return null;
  const current = getCurrentChatDataEvent();
  const existing = current.floors[String(floorId)];
  if (existing) return existing;
  if (!create) return null;
  const created: RollHelperFloorRecordEvent = {
    floorId,
    messageId: floorId,
    role: "assistant",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    content: {
      raw: "",
      processed: "",
    },
    triggers: {
      interactive: [],
      triggerPack: null,
      lifecycle: {
        hydratedFrom: "markup",
        sanitizedAt: 0,
        lastSourceKind: "raw_source",
      },
    },
    eventDice: {
      events: [],
      publicRolls: [],
      blindRolls: [],
    },
    statusRefs: [],
    roundRefs: [],
  };
  current.floors[String(floorId)] = created;
  current.floorOrder = Array.from(new Set([...(current.floorOrder ?? []), floorId])).sort((left, right) => left - right);
  current.meta.updatedAt = Date.now();
  current.meta.lastProcessedFloorId = floorId;
  return created;
}

export function mutateAssistantFloorRecordByMessageEvent(
  message: unknown,
  mutator: (floor: RollHelperFloorRecordEvent) => void
): boolean {
  const floor = getAssistantFloorRecordByMessageEvent(message, true);
  if (!floor) return false;
  const before = JSON.stringify(floor);
  mutator(floor);
  floor.updatedAt = Date.now();
  const current = getCurrentChatDataEvent();
  current.meta.updatedAt = floor.updatedAt;
  current.meta.lastProcessedFloorId = floor.floorId;
  return JSON.stringify(floor) !== before;
}

export async function loadCurrentChatDatabaseEvent(reason = "init"): Promise<void> {
  const chatId = resolveCurrentOfficialChatIdEvent();
  if (!chatId) {
    ACTIVE_CHAT_ID_V3_Event = "";
    ACTIVE_CHAT_DATA_V3_Event = null;
    return;
  }
  const database = await readChatDatabaseByChatIdEvent(chatId);
  ACTIVE_CHAT_ID_V3_Event = chatId;
  ACTIVE_CHAT_DATA_V3_Event = database.chatData[chatId] ?? buildDefaultChatRecordEvent(chatId, getSettingsEvent().skillTableText);
  traceStoreRuntimeEvent("loadCurrentChatDatabaseEvent.loaded", {
    reason,
    chatId,
    floorCount: ACTIVE_CHAT_DATA_V3_Event.floorOrder.length,
    roundCount: ACTIVE_CHAT_DATA_V3_Event.rounds.order.length,
    statusCount: ACTIVE_CHAT_DATA_V3_Event.statuses.order.length,
  });
}

export async function ensureCurrentChatRecordEvent(): Promise<RollHelperChatRecordEvent> {
  const chatId = getActiveChatIdEvent();
  if (!chatId) {
    return buildDefaultChatRecordEvent("", getSettingsEvent().skillTableText);
  }
  const current = getCurrentChatDataEvent();
  await writeChatDatabaseByChatIdEvent(chatId, current);
  return getCurrentChatDataEvent();
}

export async function saveCurrentChatDataEvent(): Promise<void> {
  const chatId = getActiveChatIdEvent();
  if (!chatId || !ACTIVE_CHAT_DATA_V3_Event) return;
  await writeChatDatabaseByChatIdEvent(chatId, ACTIVE_CHAT_DATA_V3_Event);
}

export async function setLastUserMessageIdEvent(messageId: unknown): Promise<void> {
  const normalizedMessageId = normalizeFloorIdEvent(messageId);
  const chatId = getActiveChatIdEvent();
  if (!chatId || normalizedMessageId == null) return;
  await writeChatDatabaseByChatIdEvent(chatId, (previous) => ({
    ...previous,
    meta: {
      ...previous.meta,
      lastUserMessageId: normalizedMessageId,
    },
  }));
}

export async function upsertAssistantFloorEvent(
  floor: Partial<RollHelperFloorRecordEvent> & {
    floorId: number;
    messageId?: number;
  }
): Promise<RollHelperFloorRecordEvent | null> {
  const floorId = normalizeFloorIdEvent(floor.floorId ?? floor.messageId);
  const chatId = getActiveChatIdEvent();
  if (!chatId || floorId == null) return null;
  let nextFloor: RollHelperFloorRecordEvent | null = null;
  await writeChatDatabaseByChatIdEvent(chatId, (previous) => {
    const existing = previous.floors[String(floorId)];
    const createdAt = Number(existing?.createdAt) || Date.now();
    nextFloor = {
      floorId,
      messageId: floorId,
      role: "assistant",
      createdAt,
      updatedAt: Date.now(),
      content: {
        raw: String(floor.content?.raw ?? existing?.content.raw ?? ""),
        processed: String(floor.content?.processed ?? existing?.content.processed ?? ""),
      },
      triggers: {
        interactive: Array.isArray(floor.triggers?.interactive) ? floor.triggers.interactive : (existing?.triggers.interactive ?? []),
        triggerPack: floor.triggers?.triggerPack ?? existing?.triggers.triggerPack ?? null,
        lifecycle: {
          hydratedFrom: floor.triggers?.lifecycle?.hydratedFrom === "metadata" ? "metadata" : (existing?.triggers.lifecycle.hydratedFrom ?? "markup"),
          sanitizedAt: Number(floor.triggers?.lifecycle?.sanitizedAt) || Number(existing?.triggers.lifecycle.sanitizedAt) || 0,
          lastSourceKind: String(floor.triggers?.lifecycle?.lastSourceKind ?? existing?.triggers.lifecycle.lastSourceKind ?? "raw_source"),
        },
      },
      eventDice: {
        events: Array.isArray(floor.eventDice?.events) ? floor.eventDice.events : (existing?.eventDice.events ?? []),
        publicRolls: Array.isArray(floor.eventDice?.publicRolls) ? floor.eventDice.publicRolls : (existing?.eventDice.publicRolls ?? []),
        blindRolls: Array.isArray(floor.eventDice?.blindRolls) ? floor.eventDice.blindRolls : (existing?.eventDice.blindRolls ?? []),
      },
      statusRefs: Array.isArray(floor.statusRefs) ? floor.statusRefs : (existing?.statusRefs ?? []),
      roundRefs: Array.isArray(floor.roundRefs) ? floor.roundRefs : (existing?.roundRefs ?? []),
    };
    return {
      ...previous,
      meta: {
        ...previous.meta,
        lastProcessedFloorId: floorId,
      },
      floorOrder: Array.from(new Set([...(previous.floorOrder ?? []), floorId])).sort((left, right) => left - right),
      floors: {
        ...(previous.floors ?? {}),
        [String(floorId)]: nextFloor,
      },
    };
  });
  return nextFloor;
}

export async function removeAssistantFloorEvent(floorIdRaw: unknown): Promise<boolean> {
  const floorId = normalizeFloorIdEvent(floorIdRaw);
  const chatId = getActiveChatIdEvent();
  if (!chatId || floorId == null) return false;
  let changed = false;
  await writeChatDatabaseByChatIdEvent(chatId, (previous) => {
    if (!previous.floors[String(floorId)]) {
      return previous;
    }
    changed = true;
    const nextFloors = { ...(previous.floors ?? {}) };
    delete nextFloors[String(floorId)];
    const nextRounds = { ...(previous.rounds.records ?? {}) };
    const nextRoundOrder: string[] = [];
    for (const roundId of previous.rounds.order ?? []) {
      const round = nextRounds[roundId];
      if (!round) continue;
      const filteredFloorIds = (round.floorIds ?? []).filter((item) => item !== floorId);
      const filteredEventRefs = (round.eventRefs ?? []).filter((item) => !String(item).startsWith(`${floorId}:`));
      const filteredRollRefs = (round.rollRefs ?? []).filter((item) => !String(item).startsWith(`${floorId}:`));
      if (filteredFloorIds.length <= 0 && filteredEventRefs.length <= 0 && filteredRollRefs.length <= 0) {
        delete nextRounds[roundId];
        continue;
      }
      nextRounds[roundId] = {
        ...round,
        floorIds: filteredFloorIds,
        eventRefs: filteredEventRefs,
        rollRefs: filteredRollRefs,
      };
      nextRoundOrder.push(roundId);
    }
    const nextStatusRecords = { ...(previous.statuses.records ?? {}) };
    const nextStatusOrder: string[] = [];
    for (const statusId of previous.statuses.order ?? []) {
      const status = nextStatusRecords[statusId];
      if (!status || Number(status.sourceFloorId) === floorId) {
        delete nextStatusRecords[statusId];
        continue;
      }
      nextStatusOrder.push(statusId);
    }
    return {
      ...previous,
      meta: {
        ...previous.meta,
        lastProcessedFloorId:
          previous.meta.lastProcessedFloorId === floorId
            ? null
            : previous.meta.lastProcessedFloorId,
        openRoundId:
          previous.meta.openRoundId && !nextRounds[previous.meta.openRoundId]
            ? null
            : previous.meta.openRoundId,
      },
      floorOrder: (previous.floorOrder ?? []).filter((item) => item !== floorId),
      floors: nextFloors,
      rounds: {
        order: nextRoundOrder,
        records: nextRounds,
      },
      statuses: {
        ...previous.statuses,
        order: nextStatusOrder,
        records: nextStatusRecords,
      },
    };
  });
  return changed;
}

/**
 * 功能：将完整运行时状态同步到 chatData (v3)，并写入 shared.signals。
 * 旧 chat-scoped 写入路径已移除。
 */
function persistRuntimeStateToChatScopedEvent(): void {
  const chatId = getActiveChatIdEvent();
  if (!chatId) return;
  const meta = RUNTIME_DICE_META_Event;
  void (async () => {
    try {
      await syncCurrentChatDataFromRuntimeEvent("persist_runtime_state");
      // 写入公共区 shared.signals
      const scope = ACTIVE_CHAT_SCOPE_Event ?? getTavernContextSnapshotEvent();
      const chatKey = resolveCurrentChatKeyEvent();
      if (scope && chatKey) {
        await ensureSdkChatDocument(chatKey, {
          tavernInstanceId: scope.tavernInstanceId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          chatId: scope.currentChatId,
        });
        await patchSdkChatShared(chatKey, {
          signals: {
            stx_rollhelper: {
              lastRollSummary: meta.lastBaseRoll ? `${meta.lastBaseRoll.expr} = ${meta.lastBaseRoll.total}` : null,
              hasPendingRound: !!getCurrentChatDataEvent().meta.openRoundId,
              activeStatusCount: Array.isArray(meta.activeStatuses) ? meta.activeStatuses.length : 0,
            },
          },
        });
      }
      await flushSdkChatDataNow();
      const chatDataSnapshot = getCurrentChatDataEvent();
      traceStoreRuntimeEvent("persistRuntimeStateToChatScopedEvent", {
        chatId,
        openRoundId: chatDataSnapshot.meta.openRoundId ?? null,
        floorCount: chatDataSnapshot.floorOrder.length,
        roundCount: chatDataSnapshot.rounds.order.length,
      });
    } catch (error) {
      logger.warn(`运行时状态持久化失败，chatId=${chatId}`, error);
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
  // 尝试通过 chatData (v3) 读取状态
  try {
    const database = await readChatDatabaseByChatIdEvent(chatKey);
    const record = database.chatData[chatKey];
    if (record) {
      return normalizeActiveStatusesFromEvent(record.statuses.current.snapshot);
    }
  } catch { /* 降级旧路径 */ }
  return [];
}

export async function saveStatusesForChatKeyEvent(
  chatKey: string,
  statuses: ActiveStatusEvent[]
): Promise<void> {
  const normalized = normalizeActiveStatusesFromEvent(statuses);
  const now = Date.now();
  await writeChatDatabaseByChatIdEvent(chatKey, (previous) => ({
    ...previous,
    statuses: {
      ...previous.statuses,
      current: {
        activeStatusIds: normalized.map((status, index) => {
          const createdAt = Number(status.createdAt) || 0;
          const nameKey = normalizeStatusNameKeyEvent(status.name || `status_${index}`);
          return `status:${nameKey}:${createdAt}:${index}`;
        }),
        snapshot: normalized,
        updatedAt: now,
      },
    },
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
  const chatId = resolveCurrentOfficialChatIdEvent();
  resolveCurrentChatKeyEvent(); // 保持 ACTIVE_CHAT_KEY_Event 同步
  if (!chatId) return;
  try {
    await loadCurrentChatDatabaseEvent(reason);
    if (token !== CHAT_SCOPED_LOAD_TOKEN_Event) return;

    const chatRecord = getCurrentChatDataEvent();

    // 从 chatData (v3) 恢复运行时 DiceMetaEvent —— 仅恢复运行时瞬态字段，
    // pendingRound / summaryHistory / blindHistory / lastProcessedAssistantMsgId
    // 不再从 chatData 反序列化；业务代码直接读 chatData。
    const meta = getDiceMetaEvent();
    meta.activeStatuses = normalizeActiveStatusesFromEvent(chatRecord.statuses.current.snapshot);
    meta.pendingRound = reconstructPendingRoundFromChatDataEvent(chatRecord);
    // 从 chatData 闭合轮次重建运行时摘要历史列表
    setSummaryHistoryRuntimeEvent(rebuildSummaryHistoryRuntimeFromChatDataEvent(chatRecord));
    // 暗骰历史为纯运行时状态，聊天切换时直接清空
    clearBlindHistoryRuntimeEvent();
    meta.outboundSummary = undefined;
    meta.pendingResultGuidanceQueue = [];
    meta.outboundResultGuidance = undefined;
    meta.pendingBlindGuidanceQueue = [];
    meta.outboundBlindGuidance = undefined;
    meta.pendingPassiveDiscoveries = [];
    meta.outboundPassiveDiscovery = undefined;
    meta.passiveDiscoveriesCache = {};
    meta.lastPassiveContextHash = undefined;
    meta.selectionFallbackState = undefined;
    meta.lastPromptUserMsgId = undefined;
    meta.lastBaseRoll = undefined;

    // 从 chatData skills 恢复技能配置
    const settings = getSettingsEvent();
    const chatSkills = chatRecord.skills;
    const normalizedStoreText = normalizeSkillPresetStoreTextForSettingsEvent(
      JSON.stringify(chatSkills.presetStore ?? {}, null, 2),
      chatSkills.currentSkillTableText || settings.skillTableText
    );
    const normalizedStore =
      parseSkillPresetStoreTextEvent(normalizedStoreText) ?? buildDefaultSkillPresetStoreEvent();
    const nextSkillPresetStoreText = JSON.stringify(normalizedStore, null, 2);
    const nextSkillTableText = syncActivePresetToSkillTableTextEvent(
      normalizedStore,
      settings.skillTableText
    );

    traceStoreRuntimeEvent("loadChatScopedStateIntoRuntimeEvent.loaded", {
      reason,
      chatId,
      pendingRoundId: meta.pendingRound?.roundId ?? null,
      pendingEventCount: Array.isArray(meta.pendingRound?.events) ? meta.pendingRound.events.length : 0,
      pendingRollCount: Array.isArray(meta.pendingRound?.rolls) ? meta.pendingRound.rolls.length : 0,
      floorCount: chatRecord.floorOrder.length,
      roundCount: chatRecord.rounds.order.length,
    });
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
    logger.warn(`聊天级状态装载失败，已降级默认 (${reason}) chatId=${chatId}`, error);
    const settings = getSettingsEvent();
    const defaultStore = buildDefaultSkillPresetStoreEvent();
    const nextSkillPresetStoreText = JSON.stringify(defaultStore, null, 2);
    const nextSkillTableText = syncActivePresetToSkillTableTextEvent(defaultStore, settings.skillTableText);
    const meta = getDiceMetaEvent();
    meta.activeStatuses = [];
    meta.pendingRound = undefined;
    clearSummaryHistoryRuntimeEvent();
    clearBlindHistoryRuntimeEvent();
    meta.outboundSummary = undefined;
    meta.pendingResultGuidanceQueue = [];
    meta.outboundResultGuidance = undefined;
    meta.pendingBlindGuidanceQueue = [];
    meta.outboundBlindGuidance = undefined;
    meta.pendingPassiveDiscoveries = [];
    meta.outboundPassiveDiscovery = undefined;
    meta.passiveDiscoveriesCache = {};
    meta.lastPassiveContextHash = undefined;
    meta.selectionFallbackState = undefined;
    meta.lastPromptUserMsgId = undefined;
    meta.lastBaseRoll = undefined;

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

export function getLastBaseRollEvent(): DiceResult | undefined {
  return getDiceMetaEvent().lastBaseRoll;
}

export function getLastBaseRollTotalEvent(): number | undefined {
  const result = getDiceMetaEvent().lastBaseRoll;
  return result?.total;
}

export function saveLastRoll(result: DiceResult): void {
  const meta = getDiceMetaEvent();
  meta.lastBaseRoll = result;
  saveMetadataSafeEvent();
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
  bucket.enableAiUrgencyHint = (source as any)?.enableAiUrgencyHint !== false;
  const defaultUrgencyRaw = String((source as any)?.timeLimitDefaultUrgency ?? "").trim().toLowerCase();
  bucket.timeLimitDefaultUrgency =
    defaultUrgencyRaw === "none" ||
    defaultUrgencyRaw === "low" ||
    defaultUrgencyRaw === "high" ||
    defaultUrgencyRaw === "critical"
      ? (defaultUrgencyRaw as DicePluginSettingsEvent["timeLimitDefaultUrgency"])
      : "normal";
  const timeLimitUrgencyLowSecondsRaw = Number((source as any)?.timeLimitUrgencyLowSeconds);
  bucket.timeLimitUrgencyLowSeconds = Number.isFinite(timeLimitUrgencyLowSecondsRaw)
    ? Math.max(1, Math.floor(timeLimitUrgencyLowSecondsRaw))
    : DEFAULT_SETTINGS_Event.timeLimitUrgencyLowSeconds;
  const timeLimitUrgencyNormalSecondsRaw = Number((source as any)?.timeLimitUrgencyNormalSeconds);
  bucket.timeLimitUrgencyNormalSeconds = Number.isFinite(timeLimitUrgencyNormalSecondsRaw)
    ? Math.max(1, Math.floor(timeLimitUrgencyNormalSecondsRaw))
    : DEFAULT_SETTINGS_Event.timeLimitUrgencyNormalSeconds;
  const timeLimitUrgencyHighSecondsRaw = Number((source as any)?.timeLimitUrgencyHighSeconds);
  bucket.timeLimitUrgencyHighSeconds = Number.isFinite(timeLimitUrgencyHighSecondsRaw)
    ? Math.max(1, Math.floor(timeLimitUrgencyHighSecondsRaw))
    : DEFAULT_SETTINGS_Event.timeLimitUrgencyHighSeconds;
  const timeLimitUrgencyCriticalSecondsRaw = Number((source as any)?.timeLimitUrgencyCriticalSeconds);
  bucket.timeLimitUrgencyCriticalSeconds = Number.isFinite(timeLimitUrgencyCriticalSecondsRaw)
    ? Math.max(1, Math.floor(timeLimitUrgencyCriticalSecondsRaw))
    : DEFAULT_SETTINGS_Event.timeLimitUrgencyCriticalSeconds;
  bucket.enableSkillSystem = bucket.enableSkillSystem !== false;
  bucket.enableInteractiveTriggers = bucket.enableInteractiveTriggers !== false;
  bucket.enableSelectionFallbackTriggers = (source as any)?.enableSelectionFallbackTriggers === true;
  const selectionFallbackMaxPerRoundRaw = Number((source as any)?.selectionFallbackMaxPerRound);
  bucket.selectionFallbackMaxPerRound = Number.isFinite(selectionFallbackMaxPerRoundRaw)
    ? Math.max(1, Math.floor(selectionFallbackMaxPerRoundRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMaxPerRound;
  const selectionFallbackMaxPerFloorRaw = Number((source as any)?.selectionFallbackMaxPerFloor);
  bucket.selectionFallbackMaxPerFloor = Number.isFinite(selectionFallbackMaxPerFloorRaw)
    ? Math.max(1, Math.floor(selectionFallbackMaxPerFloorRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMaxPerFloor;
  const selectionFallbackMinTextLengthRaw = Number((source as any)?.selectionFallbackMinTextLength);
  bucket.selectionFallbackMinTextLength = Number.isFinite(selectionFallbackMinTextLengthRaw)
    ? Math.max(1, Math.floor(selectionFallbackMinTextLengthRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMinTextLength;
  const selectionFallbackMaxTextLengthRaw = Number((source as any)?.selectionFallbackMaxTextLength);
  bucket.selectionFallbackMaxTextLength = Number.isFinite(selectionFallbackMaxTextLengthRaw)
    ? Math.max(bucket.selectionFallbackMinTextLength, Math.floor(selectionFallbackMaxTextLengthRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMaxTextLength;
  bucket.selectionFallbackLimitMode =
    (source as any)?.selectionFallbackLimitMode === "char_count"
      ? "char_count"
      : "smart_segment";
  const selectionFallbackMaxSegmentsRaw = Number((source as any)?.selectionFallbackMaxSegments);
  bucket.selectionFallbackMaxSegments = Number.isFinite(selectionFallbackMaxSegmentsRaw)
    ? Math.max(1, Math.floor(selectionFallbackMaxSegmentsRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMaxSegments;
  const longSentenceThresholdRaw = Number((source as any)?.selectionFallbackLongSentenceThreshold);
  bucket.selectionFallbackLongSentenceThreshold = Number.isFinite(longSentenceThresholdRaw)
    ? Math.max(6, Math.floor(longSentenceThresholdRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackLongSentenceThreshold;
  const maxTotalLengthRaw = Number((source as any)?.selectionFallbackMaxTotalLength);
  bucket.selectionFallbackMaxTotalLength = Number.isFinite(maxTotalLengthRaw)
    ? Math.max(10, Math.floor(maxTotalLengthRaw))
    : DEFAULT_SETTINGS_Event.selectionFallbackMaxTotalLength;
  const splitPunctuationText =
    typeof (source as any)?.selectionFallbackLongSentenceSplitPunctuationText === "string"
      ? String((source as any).selectionFallbackLongSentenceSplitPunctuationText)
      : "";
  bucket.selectionFallbackLongSentenceSplitPunctuationText =
    splitPunctuationText.trim().length > 0
      ? splitPunctuationText
      : DEFAULT_SETTINGS_Event.selectionFallbackLongSentenceSplitPunctuationText;
  bucket.selectionFallbackSingleAction =
    typeof (source as any)?.selectionFallbackSingleAction === "string"
      && String((source as any).selectionFallbackSingleAction).trim().length > 0
      ? String((source as any).selectionFallbackSingleAction).trim()
      : DEFAULT_SETTINGS_Event.selectionFallbackSingleAction;
  bucket.selectionFallbackSingleSkill =
    typeof (source as any)?.selectionFallbackSingleSkill === "string"
      && String((source as any).selectionFallbackSingleSkill).trim().length > 0
      ? String((source as any).selectionFallbackSingleSkill).trim()
      : DEFAULT_SETTINGS_Event.selectionFallbackSingleSkill;
  bucket.enableSelectionFallbackDebugInfo = (source as any)?.enableSelectionFallbackDebugInfo === true;
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
  bucket.blindEventCardVisibilityMode =
    (source as any)?.blindEventCardVisibilityMode === "placeholder" ? "placeholder" : "remove";
  const maxBlindGuidanceInjectedPerPromptRaw = Number((source as any)?.maxBlindGuidanceInjectedPerPrompt);
  bucket.maxBlindGuidanceInjectedPerPrompt = Number.isFinite(maxBlindGuidanceInjectedPerPromptRaw)
    ? Math.max(1, Math.floor(maxBlindGuidanceInjectedPerPromptRaw))
    : DEFAULT_SETTINGS_Event.maxBlindGuidanceInjectedPerPrompt;
  bucket.enableBlindDebugInfo = (source as any)?.enableBlindDebugInfo === true;
  bucket.blindHistoryDisplayConsumedAsNarrativeApplied =
    (source as any)?.blindHistoryDisplayConsumedAsNarrativeApplied !== false;
  bucket.blindHistoryAutoArchiveEnabled =
    (source as any)?.blindHistoryAutoArchiveEnabled !== false;
  const blindHistoryAutoArchiveAfterHoursRaw = Number((source as any)?.blindHistoryAutoArchiveAfterHours);
  bucket.blindHistoryAutoArchiveAfterHours = Number.isFinite(blindHistoryAutoArchiveAfterHoursRaw)
    ? Math.max(1, Math.floor(blindHistoryAutoArchiveAfterHoursRaw))
    : DEFAULT_SETTINGS_Event.blindHistoryAutoArchiveAfterHours;
  bucket.blindHistoryShowFloorKey = (source as any)?.blindHistoryShowFloorKey !== false;
  bucket.blindHistoryShowOrigin = (source as any)?.blindHistoryShowOrigin !== false;
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
  bucket.promptVerbosityMode =
    String((source as any)?.promptVerbosityMode ?? "").trim().toLowerCase() === "verbose"
      ? "verbose"
      : "compact";
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
  void syncCurrentChatDataFromRuntimeEvent("settings_updated").catch((error) => {
    logger.warn("同步新聊天数据中的技能/状态配置失败", error);
  });
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
  // 技能预设通过 updateSettingsEvent -> syncCurrentChatDataFromRuntimeEvent 自动同步到 chatData
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
