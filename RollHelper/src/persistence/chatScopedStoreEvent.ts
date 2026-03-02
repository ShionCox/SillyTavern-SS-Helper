import type {
  ActiveStatusEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
} from "../types/eventDomainEvent";
import {
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event,
  SKILL_PRESET_DEFAULT_ID_Event,
  SKILL_PRESET_DEFAULT_NAME_Event,
  SKILL_PRESET_STORE_VERSION_Event,
} from "../settings/constantsEvent";
import { normalizeActiveStatusesEvent } from "../events/statusEvent";
import { logger } from "../../index";

const CHAT_SCOPED_DB_NAME_Event = "st_roll_event_chat_scoped_v1";
const CHAT_SCOPED_STORE_NAME_Event = "chat_scoped_state";
const CHAT_SCOPED_SCHEMA_VERSION_Event = 1 as const;
const CHAT_SCOPED_WRITE_DEBOUNCE_MS_Event = 180;

let DB_OPEN_PROMISE_Event: Promise<IDBDatabase | null> | null = null;
const CHAT_SCOPED_CACHE_Event = new Map<string, ChatScopedStateRecordEvent>();
const CHAT_SCOPED_PENDING_WRITE_Event = new Map<string, ChatScopedStateRecordEvent>();
const CHAT_SCOPED_WRITE_TIMER_Event = new Map<string, ReturnType<typeof setTimeout>>();

export interface ChatScopedStateRecordEvent {
  chatKey: string;
  schemaVersion: number;
  skillPresetStoreText: string;
  activeStatuses: ActiveStatusEvent[];
  updatedAt: number;
}

export interface ChatScopedStateUpsertEvent {
  chatKey: string;
  schemaVersion?: number;
  skillPresetStoreText?: string;
  activeStatuses?: ActiveStatusEvent[];
  updatedAt?: number;
}

function normalizeKeyPartEvent(raw: unknown, fallback: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  return text.replace(/\s+/g, "_");
}

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

function isValidSkillPresetStoreTextEvent(raw: string): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (Number((parsed as any).version) !== SKILL_PRESET_STORE_VERSION_Event) return false;
    if (!Array.isArray((parsed as any).presets)) return false;
    if (String((parsed as any).activePresetId ?? "").trim().length <= 0) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeSkillPresetStoreTextEvent(raw: unknown, now: number): string {
  const text = String(raw ?? "").trim();
  if (!isValidSkillPresetStoreTextEvent(text)) {
    return buildDefaultSkillPresetStoreTextEvent(now);
  }
  return text;
}

function buildDefaultRecordEvent(chatKey: string, now = Date.now()): ChatScopedStateRecordEvent {
  return {
    chatKey,
    schemaVersion: CHAT_SCOPED_SCHEMA_VERSION_Event,
    skillPresetStoreText: buildDefaultSkillPresetStoreTextEvent(now),
    activeStatuses: [],
    updatedAt: now,
  };
}

function normalizeRecordEvent(raw: any, fallbackChatKey: string): ChatScopedStateRecordEvent {
  const now = Date.now();
  const chatKey = normalizeKeyPartEvent(raw?.chatKey, fallbackChatKey);
  const schemaVersionRaw = Number(raw?.schemaVersion);
  const schemaVersion = Number.isFinite(schemaVersionRaw)
    ? Math.max(1, Math.floor(schemaVersionRaw))
    : CHAT_SCOPED_SCHEMA_VERSION_Event;
  const skillPresetStoreText = normalizeSkillPresetStoreTextEvent(raw?.skillPresetStoreText, now);
  const activeStatuses = normalizeActiveStatusesEvent(raw?.activeStatuses);
  const updatedAtRaw = Number(raw?.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : now;
  return {
    chatKey,
    schemaVersion,
    skillPresetStoreText,
    activeStatuses,
    updatedAt,
  };
}

function cloneRecordEvent(record: ChatScopedStateRecordEvent): ChatScopedStateRecordEvent {
  return {
    chatKey: record.chatKey,
    schemaVersion: record.schemaVersion,
    skillPresetStoreText: record.skillPresetStoreText,
    activeStatuses: normalizeActiveStatusesEvent(record.activeStatuses),
    updatedAt: record.updatedAt,
  };
}

async function openDbEvent(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (DB_OPEN_PROMISE_Event) return DB_OPEN_PROMISE_Event;
  DB_OPEN_PROMISE_Event = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CHAT_SCOPED_DB_NAME_Event, 1);
    } catch (error) {
      logger.warn("聊天级状态：打开 IndexedDB 失败，降级内存缓存。", error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAT_SCOPED_STORE_NAME_Event)) {
        db.createObjectStore(CHAT_SCOPED_STORE_NAME_Event, { keyPath: "chatKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      logger.warn("聊天级状态：IndexedDB 初始化失败，降级内存缓存。", request.error);
      resolve(null);
    };
  });
  return DB_OPEN_PROMISE_Event;
}

async function readRecordFromDbEvent(chatKey: string): Promise<ChatScopedStateRecordEvent | null> {
  const db = await openDbEvent();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHAT_SCOPED_STORE_NAME_Event, "readonly");
      const store = tx.objectStore(CHAT_SCOPED_STORE_NAME_Event);
      const req = store.get(chatKey);
      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        resolve(normalizeRecordEvent(req.result, chatKey));
      };
      req.onerror = () => {
        logger.warn(`聊天级状态：读取失败，chatKey=${chatKey}`, req.error);
        resolve(null);
      };
    } catch (error) {
      logger.warn(`聊天级状态：读取异常，chatKey=${chatKey}`, error);
      resolve(null);
    }
  });
}

async function writeRecordToDbEvent(record: ChatScopedStateRecordEvent): Promise<boolean> {
  const db = await openDbEvent();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CHAT_SCOPED_STORE_NAME_Event, "readwrite");
      const store = tx.objectStore(CHAT_SCOPED_STORE_NAME_Event);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        logger.warn(`聊天级状态：写入失败，chatKey=${record.chatKey}`, tx.error);
        resolve(false);
      };
      tx.onabort = () => {
        logger.warn(`聊天级状态：写入中断，chatKey=${record.chatKey}`, tx.error);
        resolve(false);
      };
    } catch (error) {
      logger.warn(`聊天级状态：写入异常，chatKey=${record.chatKey}`, error);
      resolve(false);
    }
  });
}

async function flushPendingWriteEvent(chatKey: string): Promise<void> {
  const pending = CHAT_SCOPED_PENDING_WRITE_Event.get(chatKey);
  if (!pending) return;
  CHAT_SCOPED_PENDING_WRITE_Event.delete(chatKey);
  const ok = await writeRecordToDbEvent(pending);
  if (!ok) {
    logger.warn(`聊天级状态：已降级为内存缓存，chatKey=${chatKey}`);
  }
}

function schedulePersistEvent(record: ChatScopedStateRecordEvent): void {
  CHAT_SCOPED_PENDING_WRITE_Event.set(record.chatKey, cloneRecordEvent(record));
  const timer = CHAT_SCOPED_WRITE_TIMER_Event.get(record.chatKey);
  if (timer) {
    clearTimeout(timer);
  }
  const nextTimer = setTimeout(() => {
    CHAT_SCOPED_WRITE_TIMER_Event.delete(record.chatKey);
    void flushPendingWriteEvent(record.chatKey);
  }, CHAT_SCOPED_WRITE_DEBOUNCE_MS_Event);
  CHAT_SCOPED_WRITE_TIMER_Event.set(record.chatKey, nextTimer);
}

export function resolveChatKey(context?: any): string {
  const chatId = normalizeKeyPartEvent(
    context?.chatId ?? context?.chat_id ?? context?.chat?.id,
    "fallback_chat"
  );
  const groupId = normalizeKeyPartEvent(context?.groupId ?? context?.group_id, "no_group");
  const characters = Array.isArray(context?.characters) ? context.characters : [];
  const characterIndex = Number(context?.characterId);
  let roleId = "";
  if (Number.isInteger(characterIndex) && characterIndex >= 0 && characterIndex < characters.length) {
    const character = characters[characterIndex] ?? {};
    roleId = normalizeKeyPartEvent(character.avatar ?? character.id ?? character.name, "");
  }
  if (!roleId) {
    roleId = normalizeKeyPartEvent(
      context?.characterName ?? context?.name1 ?? context?.characterId,
      "default_role"
    );
  }
  return `${chatId}::${groupId}::${roleId}`;
}

export function getCachedChatScopedState(chatKeyRaw: string): ChatScopedStateRecordEvent | null {
  const chatKey = normalizeKeyPartEvent(chatKeyRaw, "fallback_chat::no_group::default_role");
  const cached = CHAT_SCOPED_CACHE_Event.get(chatKey);
  return cached ? cloneRecordEvent(cached) : null;
}

export async function loadChatScopedState(chatKeyRaw: string): Promise<ChatScopedStateRecordEvent> {
  const chatKey = normalizeKeyPartEvent(chatKeyRaw, "fallback_chat::no_group::default_role");
  const cached = CHAT_SCOPED_CACHE_Event.get(chatKey);
  if (cached) return cloneRecordEvent(cached);

  const fromDb = await readRecordFromDbEvent(chatKey);
  if (fromDb) {
    CHAT_SCOPED_CACHE_Event.set(chatKey, cloneRecordEvent(fromDb));
    return cloneRecordEvent(fromDb);
  }

  const fallback = buildDefaultRecordEvent(chatKey);
  CHAT_SCOPED_CACHE_Event.set(chatKey, cloneRecordEvent(fallback));
  schedulePersistEvent(fallback);
  return cloneRecordEvent(fallback);
}

export async function upsertState(update: ChatScopedStateUpsertEvent): Promise<ChatScopedStateRecordEvent> {
  const chatKey = normalizeKeyPartEvent(update.chatKey, "fallback_chat::no_group::default_role");
  const base = (await loadChatScopedState(chatKey)) ?? buildDefaultRecordEvent(chatKey);
  const now = Date.now();
  const next: ChatScopedStateRecordEvent = {
    chatKey,
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
  CHAT_SCOPED_CACHE_Event.set(chatKey, cloneRecordEvent(next));
  schedulePersistEvent(next);
  return cloneRecordEvent(next);
}

export async function saveSkillStore(chatKey: string, skillPresetStoreText: string): Promise<void> {
  await upsertState({
    chatKey,
    skillPresetStoreText,
    updatedAt: Date.now(),
  });
}

export async function saveStatuses(chatKey: string, activeStatuses: ActiveStatusEvent[]): Promise<void> {
  await upsertState({
    chatKey,
    activeStatuses,
    updatedAt: Date.now(),
  });
}
