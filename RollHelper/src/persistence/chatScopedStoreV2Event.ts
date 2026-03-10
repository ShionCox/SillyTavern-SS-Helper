import type { ActiveStatusEvent, SkillPresetEvent, SkillPresetStoreEvent } from "../types/eventDomainEvent";
import { logger } from "../../index";
import { normalizeActiveStatusesEvent } from "../events/statusEvent";
import {
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
  SKILL_PRESET_DEFAULT_ID_Event,
  SKILL_PRESET_DEFAULT_NAME_Event,
  SKILL_PRESET_STORE_VERSION_Event,
} from "../settings/constantsEvent";
import type { SdkTavernScopeLocatorEvent, SdkTavernScopeTypeEvent } from "../../../SDK/tavern";
import {
  buildTavernChatScopedKeyEvent,
  isFallbackTavernChatEvent,
  normalizeTavernKeyPartEvent,
  normalizeTavernRoleKeyEvent,
  parseLegacyTavernChatKeyEvent,
  parseTavernChatScopedKeyEvent,
} from "../../../SDK/tavern";
import {
  listChatScopedStateSummariesEvent as listLegacyChatScopedStateSummariesEvent,
  loadChatScopedState as loadLegacyChatScopedStateEvent,
} from "./chatScopedStoreEvent";

const CHAT_SCOPED_V2_DB_NAME_Event = "st_roll_event_chat_scoped_v2";
const CHAT_SCOPED_V2_STORE_NAME_Event = "chat_scoped_state_v2";
const CHAT_SCOPED_V2_SCHEMA_VERSION_Event = 2 as const;
const CHAT_SCOPED_V2_WRITE_DEBOUNCE_MS_Event = 180;

let DB_OPEN_PROMISE_Event: Promise<IDBDatabase | null> | null = null;
const CHAT_SCOPED_V2_CACHE_Event = new Map<string, ChatScopedStateRecordV2Event>();
const CHAT_SCOPED_V2_PENDING_WRITE_Event = new Map<string, ChatScopedStateRecordV2Event>();
const CHAT_SCOPED_V2_WRITE_TIMER_Event = new Map<string, ReturnType<typeof setTimeout>>();
let LEGACY_SUMMARY_CACHE_Event: LegacySummaryEvent[] | null = null;

interface LegacySummaryEvent {
  chatKey: string;
  updatedAt: number;
}

export interface ChatScopedLocatorV2Event {
  tavernInstanceId: string;
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  roleKey: string;
  roleId: string;
  chatId: string;
  displayName: string;
  avatarUrl: string;
}

export interface ChatScopedStateRecordV2Event extends ChatScopedLocatorV2Event {
  chatScopedKey: string;
  schemaVersion: number;
  skillPresetStoreText: string;
  activeStatuses: ActiveStatusEvent[];
  updatedAt: number;
}

export interface ChatScopedStateUpsertV2Event {
  chatScopedKey: string;
  locatorHint?: Partial<ChatScopedLocatorV2Event>;
  schemaVersion?: number;
  skillPresetStoreText?: string;
  activeStatuses?: ActiveStatusEvent[];
  updatedAt?: number;
}

export interface ChatScopedStateSummaryV2Event extends ChatScopedLocatorV2Event {
  chatScopedKey: string;
  updatedAt: number;
  activeStatusCount: number;
}

/**
 * 功能：构建默认技能预设存储文本。
 * @param now 当前时间戳
 * @returns 规范化 JSON 文本
 */
function buildDefaultSkillPresetStoreTextEvent(now: number): string {
  const preset: SkillPresetEvent = {
    id: SKILL_PRESET_DEFAULT_ID_Event,
    name: SKILL_PRESET_DEFAULT_NAME_Event,
    locked: true,
    skillTableText: DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
    createdAt: now,
    updatedAt: now,
  };
  const store: SkillPresetStoreEvent = {
    version: SKILL_PRESET_STORE_VERSION_Event,
    activePresetId: preset.id,
    presets: [preset],
  };
  return JSON.stringify(store, null, 2);
}

/**
 * 功能：校验技能预设存储文本是否合法。
 * @param raw 原始文本
 * @returns 是否合法
 */
function isValidSkillPresetStoreTextEvent(raw: string): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  try {
    const parsed = JSON.parse(text) as { version?: number; presets?: unknown[]; activePresetId?: string };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (Number(parsed.version) !== SKILL_PRESET_STORE_VERSION_Event) return false;
    if (!Array.isArray(parsed.presets)) return false;
    if (!String(parsed.activePresetId ?? "").trim()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 功能：规范化技能预设存储文本。
 * @param raw 原始文本
 * @param now 当前时间戳
 * @returns 规范化后的文本
 */
function normalizeSkillPresetStoreTextEvent(raw: unknown, now: number): string {
  const text = String(raw ?? "").trim();
  if (!isValidSkillPresetStoreTextEvent(text)) {
    return buildDefaultSkillPresetStoreTextEvent(now);
  }
  return text;
}

/**
 * 功能：规范化聊天定位信息。
 * @param locator 原始定位
 * @returns 规范化后的定位
 */
function normalizeLocatorEvent(locator: Partial<ChatScopedLocatorV2Event>): ChatScopedLocatorV2Event {
  const tavernInstanceId = normalizeTavernKeyPartEvent(locator.tavernInstanceId, "unknown_tavern");
  const scopeType = String(locator.scopeType ?? "character") === "group" ? "group" : "character";
  const scopeId = normalizeTavernKeyPartEvent(
    locator.scopeId,
    scopeType === "group" ? "no_group" : "default_role"
  );
  const roleKeyFromScope = scopeType === "group" ? `group:${scopeId}` : scopeId;
  const roleKey = normalizeTavernRoleKeyEvent(locator.roleKey ?? roleKeyFromScope) || roleKeyFromScope;
  const roleId = normalizeTavernKeyPartEvent(locator.roleId, scopeType === "group" ? roleKeyFromScope : scopeId);
  const chatId = normalizeTavernKeyPartEvent(locator.chatId, "fallback_chat");
  const displayName =
    String(locator.displayName ?? "").trim() ||
    (scopeType === "group" ? `群组 ${scopeId}` : roleId || scopeId || "未知角色");
  const avatarUrl = String(locator.avatarUrl ?? "").trim();
  return {
    tavernInstanceId,
    scopeType,
    scopeId,
    roleKey,
    roleId,
    chatId,
    displayName,
    avatarUrl,
  };
}

/**
 * 功能：根据定位构建默认记录。
 * @param locator 定位信息
 * @param now 当前时间戳
 * @returns 默认记录
 */
function buildDefaultRecordEvent(locator: ChatScopedLocatorV2Event, now = Date.now()): ChatScopedStateRecordV2Event {
  return {
    ...locator,
    chatScopedKey: buildTavernChatScopedKeyEvent({
      tavernInstanceId: locator.tavernInstanceId,
      scopeType: locator.scopeType,
      scopeId: locator.scopeId,
      roleKey: locator.roleKey,
      roleId: locator.roleId,
      displayName: locator.displayName,
      avatarUrl: locator.avatarUrl,
      groupId: locator.scopeType === "group" ? locator.scopeId : "no_group",
      characterId: -1,
      currentChatId: locator.chatId,
      chatId: locator.chatId,
    }),
    schemaVersion: CHAT_SCOPED_V2_SCHEMA_VERSION_Event,
    skillPresetStoreText: buildDefaultSkillPresetStoreTextEvent(now),
    activeStatuses: [],
    updatedAt: now,
  };
}

/**
 * 功能：克隆记录对象，避免引用共享。
 * @param record 原始记录
 * @returns 克隆结果
 */
function cloneRecordEvent(record: ChatScopedStateRecordV2Event): ChatScopedStateRecordV2Event {
  return {
    chatScopedKey: record.chatScopedKey,
    tavernInstanceId: record.tavernInstanceId,
    scopeType: record.scopeType,
    scopeId: record.scopeId,
    roleKey: record.roleKey,
    roleId: record.roleId,
    chatId: record.chatId,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    schemaVersion: record.schemaVersion,
    skillPresetStoreText: record.skillPresetStoreText,
    activeStatuses: normalizeActiveStatusesEvent(record.activeStatuses),
    updatedAt: record.updatedAt,
  };
}

/**
 * 功能：根据主键和提示定位构建定位信息。
 * @param chatScopedKey 新主键
 * @param locatorHint 可选定位提示
 * @returns 规范化定位
 */
function buildLocatorFromScopedKeyEvent(
  chatScopedKey: string,
  locatorHint?: Partial<ChatScopedLocatorV2Event>
): ChatScopedLocatorV2Event {
  const parsed = parseTavernChatScopedKeyEvent(chatScopedKey);
  const merged: Partial<ChatScopedLocatorV2Event> = {
    tavernInstanceId: parsed.tavernInstanceId,
    scopeType: parsed.scopeType,
    scopeId: parsed.scopeId,
    chatId: parsed.chatId,
    roleKey: parsed.scopeType === "group" ? `group:${parsed.scopeId}` : parsed.scopeId,
    roleId: parsed.scopeType === "group" ? `group:${parsed.scopeId}` : parsed.scopeId,
    displayName: parsed.scopeType === "group" ? `群组 ${parsed.scopeId}` : parsed.scopeId,
    avatarUrl: "",
    ...(locatorHint ?? {}),
  };
  return normalizeLocatorEvent(merged);
}

/**
 * 功能：规范化记录对象。
 * @param raw 原始记录
 * @param fallbackKey 回退主键
 * @returns 规范化后的记录
 */
function normalizeRecordEvent(raw: unknown, fallbackKey: string): ChatScopedStateRecordV2Event {
  const source = (raw as Partial<ChatScopedStateRecordV2Event> | null) ?? {};
  const now = Date.now();
  const chatScopedKey = normalizeTavernKeyPartEvent(source.chatScopedKey, fallbackKey);
  const locator = normalizeLocatorEvent({
    tavernInstanceId: source.tavernInstanceId,
    scopeType: source.scopeType,
    scopeId: source.scopeId,
    roleKey: source.roleKey,
    roleId: source.roleId,
    chatId: source.chatId ?? parseTavernChatScopedKeyEvent(chatScopedKey).chatId,
    displayName: source.displayName,
    avatarUrl: source.avatarUrl,
  });
  const schemaVersionRaw = Number(source.schemaVersion);
  const schemaVersion = Number.isFinite(schemaVersionRaw)
    ? Math.max(1, Math.floor(schemaVersionRaw))
    : CHAT_SCOPED_V2_SCHEMA_VERSION_Event;
  const skillPresetStoreText = normalizeSkillPresetStoreTextEvent(source.skillPresetStoreText, now);
  const activeStatuses = normalizeActiveStatusesEvent(source.activeStatuses);
  const updatedAtRaw = Number(source.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : now;
  return {
    ...locator,
    chatScopedKey,
    schemaVersion,
    skillPresetStoreText,
    activeStatuses,
    updatedAt,
  };
}

/**
 * 功能：打开 V2 IndexedDB。
 * @returns 数据库实例
 */
async function openDbEvent(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (DB_OPEN_PROMISE_Event) return DB_OPEN_PROMISE_Event;
  DB_OPEN_PROMISE_Event = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CHAT_SCOPED_V2_DB_NAME_Event, 1);
    } catch (error) {
      logger.warn("聊天级状态 V2：打开 IndexedDB 失败，已降级内存缓存。", error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_SCOPED_V2_STORE_NAME_Event)) {
        const store = db.createObjectStore(CHAT_SCOPED_V2_STORE_NAME_Event, { keyPath: "chatScopedKey" });
        store.createIndex("by_instance_scope", ["tavernInstanceId", "scopeType", "scopeId"], { unique: false });
        store.createIndex("by_instance", "tavernInstanceId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      logger.warn("聊天级状态 V2：IndexedDB 初始化失败，已降级内存缓存。", request.error);
      resolve(null);
    };
  });
  return DB_OPEN_PROMISE_Event;
}

/**
 * 功能：从数据库读取单条记录。
 * @param chatScopedKey 新主键
 * @returns 记录或空值
 */
async function readRecordFromDbEvent(chatScopedKey: string): Promise<ChatScopedStateRecordV2Event | null> {
  const db = await openDbEvent();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHAT_SCOPED_V2_STORE_NAME_Event, "readonly");
      const store = tx.objectStore(CHAT_SCOPED_V2_STORE_NAME_Event);
      const req = store.get(chatScopedKey);
      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        resolve(normalizeRecordEvent(req.result, chatScopedKey));
      };
      req.onerror = () => {
        logger.warn(`聊天级状态 V2：读取失败，chatScopedKey=${chatScopedKey}`, req.error);
        resolve(null);
      };
    } catch (error) {
      logger.warn(`聊天级状态 V2：读取异常，chatScopedKey=${chatScopedKey}`, error);
      resolve(null);
    }
  });
}

/**
 * 功能：批量读取数据库记录。
 * @returns 全量记录列表
 */
async function readAllRecordsFromDbEvent(): Promise<ChatScopedStateRecordV2Event[]> {
  const db = await openDbEvent();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHAT_SCOPED_V2_STORE_NAME_Event, "readonly");
      const store = tx.objectStore(CHAT_SCOPED_V2_STORE_NAME_Event);
      const req = typeof store.getAll === "function" ? store.getAll() : null;
      if (!req) {
        const rows: ChatScopedStateRecordV2Event[] = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            resolve(rows);
            return;
          }
          rows.push(normalizeRecordEvent(cursor.value, "unknown_tavern::character::default_role::fallback_chat"));
          cursor.continue();
        };
        cursorReq.onerror = () => {
          logger.warn("聊天级状态 V2：游标读取失败", cursorReq.error);
          resolve([]);
        };
        return;
      }
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? req.result : [];
        resolve(
          list.map((item) =>
            normalizeRecordEvent(item, "unknown_tavern::character::default_role::fallback_chat")
          )
        );
      };
      req.onerror = () => {
        logger.warn("聊天级状态 V2：批量读取失败", req.error);
        resolve([]);
      };
    } catch (error) {
      logger.warn("聊天级状态 V2：批量读取异常", error);
      resolve([]);
    }
  });
}

/**
 * 功能：写入数据库记录。
 * @param record 目标记录
 * @returns 写入是否成功
 */
async function writeRecordToDbEvent(record: ChatScopedStateRecordV2Event): Promise<boolean> {
  const db = await openDbEvent();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHAT_SCOPED_V2_STORE_NAME_Event, "readwrite");
      const store = tx.objectStore(CHAT_SCOPED_V2_STORE_NAME_Event);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        logger.warn(`聊天级状态 V2：写入失败，chatScopedKey=${record.chatScopedKey}`, tx.error);
        resolve(false);
      };
      tx.onabort = () => {
        logger.warn(`聊天级状态 V2：写入中断，chatScopedKey=${record.chatScopedKey}`, tx.error);
        resolve(false);
      };
    } catch (error) {
      logger.warn(`聊天级状态 V2：写入异常，chatScopedKey=${record.chatScopedKey}`, error);
      resolve(false);
    }
  });
}

/**
 * 功能：刷新待写入缓存到数据库。
 * @param chatScopedKey 新主键
 * @returns 无返回值
 */
async function flushPendingWriteEvent(chatScopedKey: string): Promise<void> {
  const pending = CHAT_SCOPED_V2_PENDING_WRITE_Event.get(chatScopedKey);
  if (!pending) return;
  CHAT_SCOPED_V2_PENDING_WRITE_Event.delete(chatScopedKey);
  const ok = await writeRecordToDbEvent(pending);
  if (!ok) {
    logger.warn(`聊天级状态 V2：已降级为内存缓存，chatScopedKey=${chatScopedKey}`);
  }
}

/**
 * 功能：按防抖策略安排记录持久化。
 * @param record 待持久化记录
 * @returns 无返回值
 */
function schedulePersistEvent(record: ChatScopedStateRecordV2Event): void {
  CHAT_SCOPED_V2_PENDING_WRITE_Event.set(record.chatScopedKey, cloneRecordEvent(record));
  const timer = CHAT_SCOPED_V2_WRITE_TIMER_Event.get(record.chatScopedKey);
  if (timer) {
    clearTimeout(timer);
  }
  const nextTimer = setTimeout(() => {
    CHAT_SCOPED_V2_WRITE_TIMER_Event.delete(record.chatScopedKey);
    void flushPendingWriteEvent(record.chatScopedKey);
  }, CHAT_SCOPED_V2_WRITE_DEBOUNCE_MS_Event);
  CHAT_SCOPED_V2_WRITE_TIMER_Event.set(record.chatScopedKey, nextTimer);
}

/**
 * 功能：加载旧版摘要缓存。
 * @returns 旧版摘要列表
 */
async function loadLegacySummariesEvent(): Promise<LegacySummaryEvent[]> {
  if (LEGACY_SUMMARY_CACHE_Event) return LEGACY_SUMMARY_CACHE_Event;
  const list = await listLegacyChatScopedStateSummariesEvent().catch(() => []);
  LEGACY_SUMMARY_CACHE_Event = (Array.isArray(list) ? list : [])
    .map((item) => ({
      chatKey: String((item as { chatKey?: string }).chatKey ?? "").trim(),
      updatedAt: Number((item as { updatedAt?: number }).updatedAt) || 0,
    }))
    .filter((item) => item.chatKey.length > 0);
  return LEGACY_SUMMARY_CACHE_Event;
}

/**
 * 功能：判断旧版记录是否与定位匹配。
 * @param locator 新版定位
 * @param legacyChatKey 旧版主键
 * @returns 是否匹配
 */
function matchesLegacyKeyForLocatorEvent(locator: ChatScopedLocatorV2Event, legacyChatKey: string): boolean {
  if (isFallbackTavernChatEvent(legacyChatKey)) return false;
  const legacy = parseLegacyTavernChatKeyEvent(legacyChatKey);
  if (legacy.chatId !== locator.chatId) return false;
  if (locator.scopeType === "group") {
    return normalizeTavernKeyPartEvent(legacy.groupId, "no_group") === locator.scopeId;
  }
  if (normalizeTavernKeyPartEvent(legacy.groupId, "no_group") !== "no_group") return false;
  const legacyRoleKey = normalizeTavernRoleKeyEvent(legacy.roleId);
  return Boolean(legacyRoleKey) && legacyRoleKey === locator.roleKey;
}

/**
 * 功能：尝试把旧版记录懒迁移到 V2。
 * @param locator 定位信息
 * @returns 迁移后的记录或空值
 */
async function migrateFromLegacyIfNeededEvent(
  locator: ChatScopedLocatorV2Event
): Promise<ChatScopedStateRecordV2Event | null> {
  const summaries = await loadLegacySummariesEvent();
  const candidates = summaries
    .filter((item) => matchesLegacyKeyForLocatorEvent(locator, item.chatKey))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const best = candidates[0];
  if (!best) return null;
  try {
    const legacyRecord = await loadLegacyChatScopedStateEvent(best.chatKey);
    const now = Date.now();
    const next: ChatScopedStateRecordV2Event = {
      ...locator,
      chatScopedKey: buildTavernChatScopedKeyEvent({
        tavernInstanceId: locator.tavernInstanceId,
        scopeType: locator.scopeType,
        scopeId: locator.scopeId,
        roleKey: locator.roleKey,
        roleId: locator.roleId,
        displayName: locator.displayName,
        avatarUrl: locator.avatarUrl,
        groupId: locator.scopeType === "group" ? locator.scopeId : "no_group",
        characterId: -1,
        currentChatId: locator.chatId,
        chatId: locator.chatId,
      }),
      schemaVersion: CHAT_SCOPED_V2_SCHEMA_VERSION_Event,
      skillPresetStoreText: normalizeSkillPresetStoreTextEvent(legacyRecord.skillPresetStoreText, now),
      activeStatuses: normalizeActiveStatusesEvent(legacyRecord.activeStatuses),
      updatedAt: Number(legacyRecord.updatedAt) || now,
    };
    CHAT_SCOPED_V2_CACHE_Event.set(next.chatScopedKey, cloneRecordEvent(next));
    schedulePersistEvent(next);
    return cloneRecordEvent(next);
  } catch (error) {
    logger.warn("聊天级状态 V2：懒迁移旧记录失败", error);
    return null;
  }
}

/**
 * 功能：按主键读取 V2 聊天状态记录。
 * @param chatScopedKey 新主键
 * @param locatorHint 可选定位提示
 * @returns 读取结果
 */
export async function loadChatScopedStateV2ByKeyEvent(
  chatScopedKey: string,
  locatorHint?: Partial<ChatScopedLocatorV2Event>
): Promise<ChatScopedStateRecordV2Event> {
  const normalizedKey = normalizeTavernKeyPartEvent(chatScopedKey, "unknown_tavern::character::default_role::fallback_chat");
  const cached = CHAT_SCOPED_V2_CACHE_Event.get(normalizedKey);
  if (cached) return cloneRecordEvent(cached);

  const fromDb = await readRecordFromDbEvent(normalizedKey);
  if (fromDb) {
    CHAT_SCOPED_V2_CACHE_Event.set(normalizedKey, cloneRecordEvent(fromDb));
    return cloneRecordEvent(fromDb);
  }

  const locator = buildLocatorFromScopedKeyEvent(normalizedKey, locatorHint);
  const migrated = await migrateFromLegacyIfNeededEvent(locator);
  if (migrated) return migrated;

  const fallback = buildDefaultRecordEvent(locator);
  CHAT_SCOPED_V2_CACHE_Event.set(fallback.chatScopedKey, cloneRecordEvent(fallback));
  schedulePersistEvent(fallback);
  return cloneRecordEvent(fallback);
}

/**
 * 功能：按更新内容上插记录。
 * @param update 更新参数
 * @returns 更新后的记录
 */
export async function upsertChatScopedStateV2Event(
  update: ChatScopedStateUpsertV2Event
): Promise<ChatScopedStateRecordV2Event> {
  const normalizedKey = normalizeTavernKeyPartEvent(
    update.chatScopedKey,
    "unknown_tavern::character::default_role::fallback_chat"
  );
  const base = await loadChatScopedStateV2ByKeyEvent(normalizedKey, update.locatorHint);
  const now = Date.now();
  const next: ChatScopedStateRecordV2Event = {
    ...base,
    schemaVersion: Number.isFinite(Number(update.schemaVersion))
      ? Math.max(1, Math.floor(Number(update.schemaVersion)))
      : base.schemaVersion,
    skillPresetStoreText:
      update.skillPresetStoreText == null
        ? base.skillPresetStoreText
        : normalizeSkillPresetStoreTextEvent(update.skillPresetStoreText, now),
    activeStatuses:
      update.activeStatuses == null
        ? normalizeActiveStatusesEvent(base.activeStatuses)
        : normalizeActiveStatusesEvent(update.activeStatuses),
    updatedAt: Number.isFinite(Number(update.updatedAt)) ? Number(update.updatedAt) : now,
  };
  CHAT_SCOPED_V2_CACHE_Event.set(next.chatScopedKey, cloneRecordEvent(next));
  schedulePersistEvent(next);
  return cloneRecordEvent(next);
}

/**
 * 功能：按主键保存技能预设文本。
 * @param chatScopedKey 新主键
 * @param skillPresetStoreText 技能预设文本
 * @param locatorHint 可选定位提示
 * @returns 无返回值
 */
export async function saveSkillStoreByChatScopedKeyV2Event(
  chatScopedKey: string,
  skillPresetStoreText: string,
  locatorHint?: Partial<ChatScopedLocatorV2Event>
): Promise<void> {
  await upsertChatScopedStateV2Event({
    chatScopedKey,
    locatorHint,
    skillPresetStoreText,
    updatedAt: Date.now(),
  });
}

/**
 * 功能：按主键保存状态列表。
 * @param chatScopedKey 新主键
 * @param activeStatuses 状态列表
 * @param locatorHint 可选定位提示
 * @returns 无返回值
 */
export async function saveStatusesByChatScopedKeyV2Event(
  chatScopedKey: string,
  activeStatuses: ActiveStatusEvent[],
  locatorHint?: Partial<ChatScopedLocatorV2Event>
): Promise<void> {
  await upsertChatScopedStateV2Event({
    chatScopedKey,
    locatorHint,
    activeStatuses: normalizeActiveStatusesEvent(activeStatuses),
    updatedAt: Date.now(),
  });
}

/**
 * 功能：按主键读取状态列表。
 * @param chatScopedKey 新主键
 * @param locatorHint 可选定位提示
 * @returns 状态列表
 */
export async function loadStatusesByChatScopedKeyV2Event(
  chatScopedKey: string,
  locatorHint?: Partial<ChatScopedLocatorV2Event>
): Promise<ActiveStatusEvent[]> {
  const state = await loadChatScopedStateV2ByKeyEvent(chatScopedKey, locatorHint);
  return normalizeActiveStatusesEvent(state.activeStatuses);
}

/**
 * 功能：按当前作用域列出摘要。
 * @param scope 当前作用域
 * @returns 摘要列表
 */
export async function listChatScopedStateSummariesForScopeV2Event(
  scope: SdkTavernScopeLocatorEvent
): Promise<ChatScopedStateSummaryV2Event[]> {
  const targetInstanceId = normalizeTavernKeyPartEvent(scope.tavernInstanceId, "unknown_tavern");
  const targetScopeType = scope.scopeType === "group" ? "group" : "character";
  const targetScopeId = normalizeTavernKeyPartEvent(scope.scopeId, targetScopeType === "group" ? "no_group" : "default_role");
  const merged = new Map<string, ChatScopedStateSummaryV2Event>();

  const collect = (record: ChatScopedStateRecordV2Event): void => {
    if (record.tavernInstanceId !== targetInstanceId) return;
    if (record.scopeType !== targetScopeType) return;
    if (record.scopeId !== targetScopeId) return;
    if (isFallbackTavernChatEvent(record.chatId)) return;
    const next: ChatScopedStateSummaryV2Event = {
      chatScopedKey: record.chatScopedKey,
      tavernInstanceId: record.tavernInstanceId,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      roleKey: record.roleKey,
      roleId: record.roleId,
      chatId: record.chatId,
      displayName: record.displayName,
      avatarUrl: record.avatarUrl,
      updatedAt: Number(record.updatedAt) || 0,
      activeStatusCount: Array.isArray(record.activeStatuses) ? record.activeStatuses.length : 0,
    };
    const current = merged.get(next.chatScopedKey);
    if (!current || next.updatedAt >= current.updatedAt) {
      merged.set(next.chatScopedKey, next);
    }
  };

  for (const record of CHAT_SCOPED_V2_CACHE_Event.values()) {
    collect(record);
  }
  const dbRecords = await readAllRecordsFromDbEvent();
  for (const record of dbRecords) {
    collect(record);
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 功能：按酒馆实例汇总聊天摘要。
 * @param tavernInstanceId 酒馆实例 ID
 * @returns 摘要列表
 */
export async function listChatScopedStateSummariesForTavernV2Event(
  tavernInstanceId: string
): Promise<ChatScopedStateSummaryV2Event[]> {
  const targetInstanceId = normalizeTavernKeyPartEvent(tavernInstanceId, "unknown_tavern");
  const merged = new Map<string, ChatScopedStateSummaryV2Event>();

  const collect = (record: ChatScopedStateRecordV2Event): void => {
    if (record.tavernInstanceId !== targetInstanceId) return;
    if (isFallbackTavernChatEvent(record.chatId)) return;
    const next: ChatScopedStateSummaryV2Event = {
      chatScopedKey: record.chatScopedKey,
      tavernInstanceId: record.tavernInstanceId,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      roleKey: record.roleKey,
      roleId: record.roleId,
      chatId: record.chatId,
      displayName: record.displayName,
      avatarUrl: record.avatarUrl,
      updatedAt: Number(record.updatedAt) || 0,
      activeStatusCount: Array.isArray(record.activeStatuses) ? record.activeStatuses.length : 0,
    };
    const prev = merged.get(next.chatScopedKey);
    if (!prev || next.updatedAt >= prev.updatedAt) {
      merged.set(next.chatScopedKey, next);
    }
  };

  for (const record of CHAT_SCOPED_V2_CACHE_Event.values()) {
    collect(record);
  }
  const dbRecords = await readAllRecordsFromDbEvent();
  for (const record of dbRecords) {
    collect(record);
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
