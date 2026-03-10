import { getSillyTavernContextEvent, getTavernContextSnapshotEvent } from "./context";
import { ensureTavernInstanceIdEvent } from "./instance";
import { buildTavernChatScopedKeyEvent, isFallbackTavernChatEvent, normalizeTavernKeyPartEvent } from "./normalize";
import type {
  SdkTavernCharacterEvent,
  SdkTavernChatListItemEvent,
  SdkTavernChatLocatorEvent,
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernScopeLocatorEvent,
} from "./types";

interface CharacterChatInfoEvent {
  file_name?: string;
  last_mes?: number | string;
  message_count?: number;
}

interface GroupChatInfoEvent {
  file_name?: string;
  last_mes?: number | string;
  message_count?: number;
}

/**
 * 功能：解析聊天更新时间。
 * @param raw 原始值
 * @returns 毫秒时间戳
 */
function parseChatUpdatedAtEvent(raw: unknown): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const fromDate = new Date(String(raw ?? "")).getTime();
  if (Number.isFinite(fromDate) && fromDate > 0) return fromDate;
  return 0;
}

/**
 * 功能：读取宿主请求头。
 * @returns 请求头对象
 */
function getRequestHeadersEvent(): Record<string, string> {
  const context = getSillyTavernContextEvent();
  if (context && typeof context.getRequestHeaders === "function") {
    const headers = context.getRequestHeaders();
    if (headers && typeof headers === "object") return headers;
  }
  return {
    "Content-Type": "application/json",
  };
}

/**
 * 功能：请求角色历史聊天列表。
 * @param character 角色对象
 * @returns 历史聊天摘要列表
 */
async function fetchCharacterChatsEvent(character: SdkTavernCharacterEvent): Promise<CharacterChatInfoEvent[]> {
  const avatar = String(character.avatar ?? "").trim();
  if (!avatar) return [];
  try {
    const response = await fetch("/api/characters/chats", {
      method: "POST",
      headers: getRequestHeadersEvent(),
      body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as unknown;
    if (!data || typeof data !== "object") return [];
    if ((data as { error?: boolean }).error === true) return [];
    return Object.values(data as Record<string, CharacterChatInfoEvent>) as CharacterChatInfoEvent[];
  } catch {
    return [];
  }
}

/**
 * 功能：请求群组历史聊天列表。
 * @param chatIds 群聊 ID 列表
 * @returns 历史聊天摘要列表
 */
async function fetchGroupChatsEvent(chatIds: string[]): Promise<GroupChatInfoEvent[]> {
  const rows: GroupChatInfoEvent[] = [];
  for (const chatIdRaw of chatIds) {
    const chatId = normalizeTavernKeyPartEvent(chatIdRaw, "");
    if (!chatId) continue;
    try {
      const response = await fetch("/api/chats/group/info", {
        method: "POST",
        headers: getRequestHeadersEvent(),
        body: JSON.stringify({ id: chatId }),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as GroupChatInfoEvent;
      rows.push(data ?? { file_name: chatId });
    } catch {
      // ignore
    }
  }
  return rows;
}

/**
 * 功能：按更新时间排序。
 * @param rows 聊天列表
 * @returns 排序后的列表
 */
function sortChatListEvent(rows: SdkTavernChatListItemEvent[]): SdkTavernChatListItemEvent[] {
  return [...rows].sort((a, b) => {
    const diff = Number(b.updatedAt) - Number(a.updatedAt);
    if (diff !== 0) return diff;
    return String(b.locator.chatId).localeCompare(String(a.locator.chatId));
  });
}

/**
 * 功能：为角色构建作用域定位。
 * @param tavernInstanceId 实例 ID
 * @param character 角色
 * @param index 角色索引
 * @returns 作用域定位
 */
function buildCharacterScopeLocatorEvent(
  tavernInstanceId: string,
  character: SdkTavernCharacterEvent,
  index: number
): SdkTavernScopeLocatorEvent | null {
  const avatar = normalizeTavernKeyPartEvent(character.avatar, "");
  const displayName = String(character.name ?? "").trim();
  const roleId = normalizeTavernKeyPartEvent(avatar || displayName, "default_role");
  if (!roleId || roleId === "default_role") return null;
  const roleKey =
    String(roleId)
      .trim()
      .toLowerCase()
      .replace(/^default_/i, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || roleId;
  return {
    tavernInstanceId,
    scopeType: "character",
    scopeId: roleKey,
    roleKey,
    roleId,
    displayName: displayName || roleId,
    avatarUrl: avatar ? `/characters/${encodeURIComponent(avatar)}` : "",
    groupId: "no_group",
    characterId: index,
    currentChatId: normalizeTavernKeyPartEvent(character.chat, "fallback_chat"),
  };
}

/**
 * 功能：为群组构建作用域定位。
 * @param tavernInstanceId 实例 ID
 * @param group 群组
 * @returns 作用域定位
 */
function buildGroupScopeLocatorEvent(
  tavernInstanceId: string,
  group: SdkTavernGroupEvent
): SdkTavernScopeLocatorEvent | null {
  const groupId = normalizeTavernKeyPartEvent(group.id, "");
  if (!groupId) return null;
  return {
    tavernInstanceId,
    scopeType: "group",
    scopeId: groupId,
    roleKey: `group:${groupId}`,
    roleId: `group:${groupId}`,
    displayName: String(group.name ?? groupId).trim() || groupId,
    avatarUrl: String(group.avatar_url ?? "").trim(),
    groupId,
    characterId: -1,
    currentChatId: normalizeTavernKeyPartEvent(group.chat_id, "fallback_chat"),
  };
}

/**
 * 功能：确保列表至少包含目标聊天项。
 * @param rows 原始列表
 * @param locator 目标聊天定位
 * @returns 补齐后的列表
 */
function ensureChatItemEvent(
  rows: SdkTavernChatListItemEvent[],
  locator: SdkTavernChatLocatorEvent
): SdkTavernChatListItemEvent[] {
  const chatId = normalizeTavernKeyPartEvent(locator.chatId, "fallback_chat");
  if (isFallbackTavernChatEvent(chatId)) return rows;
  const nextLocator: SdkTavernChatLocatorEvent = {
    ...locator,
    chatId,
  };
  const scopedKey = buildTavernChatScopedKeyEvent(nextLocator);
  if (rows.some((item) => buildTavernChatScopedKeyEvent(item.locator) === scopedKey)) {
    return rows;
  }
  return [
    {
      locator: nextLocator,
      updatedAt: 0,
      messageCount: 0,
    },
    ...rows,
  ];
}

/**
 * 功能：收集角色域下的聊天。
 * @param tavernInstanceId 实例 ID
 * @param context 上下文
 * @returns 聊天列表
 */
async function collectCharacterChatsEvent(
  tavernInstanceId: string,
  context: SdkTavernContextEvent
): Promise<SdkTavernChatListItemEvent[]> {
  const characters = Array.isArray(context.characters) ? context.characters : [];
  const allRows: SdkTavernChatListItemEvent[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const scope = buildCharacterScopeLocatorEvent(tavernInstanceId, character, index);
    if (!scope) continue;
    const infos = await fetchCharacterChatsEvent(character);
    const rows = infos
      .map((info) => {
        const chatId = normalizeTavernKeyPartEvent(info.file_name, "");
        if (!chatId || isFallbackTavernChatEvent(chatId)) return null;
        return {
          locator: {
            ...scope,
            chatId,
          },
          updatedAt: parseChatUpdatedAtEvent(info.last_mes),
          messageCount: Number(info.message_count) || 0,
        } as SdkTavernChatListItemEvent;
      })
      .filter((item): item is SdkTavernChatListItemEvent => Boolean(item));
    allRows.push(...ensureChatItemEvent(rows, { ...scope, chatId: scope.currentChatId }));
  }
  return allRows;
}

/**
 * 功能：收集群组域下的聊天。
 * @param tavernInstanceId 实例 ID
 * @param context 上下文
 * @returns 聊天列表
 */
async function collectGroupChatsEvent(
  tavernInstanceId: string,
  context: SdkTavernContextEvent
): Promise<SdkTavernChatListItemEvent[]> {
  const groups = Array.isArray(context.groups) ? context.groups : [];
  const allRows: SdkTavernChatListItemEvent[] = [];
  for (const group of groups) {
    const scope = buildGroupScopeLocatorEvent(tavernInstanceId, group);
    if (!scope) continue;
    const chatIds = new Set(
      (Array.isArray(group.chats) ? group.chats : [])
        .map((item) => normalizeTavernKeyPartEvent(item, ""))
        .filter(Boolean)
    );
    const currentChatId = normalizeTavernKeyPartEvent(group.chat_id, "");
    if (currentChatId) chatIds.add(currentChatId);
    const infos = await fetchGroupChatsEvent(Array.from(chatIds));
    const rows = infos
      .map((info) => {
        const chatId = normalizeTavernKeyPartEvent(info.file_name, "");
        if (!chatId || isFallbackTavernChatEvent(chatId)) return null;
        return {
          locator: {
            ...scope,
            chatId,
          },
          updatedAt: parseChatUpdatedAtEvent(info.last_mes),
          messageCount: Number(info.message_count) || 0,
        } as SdkTavernChatListItemEvent;
      })
      .filter((item): item is SdkTavernChatListItemEvent => Boolean(item));
    allRows.push(...ensureChatItemEvent(rows, { ...scope, chatId: scope.currentChatId }));
  }
  return allRows;
}

/**
 * 功能：按结构化键去重。
 * @param rows 原始列表
 * @returns 去重后的列表
 */
function dedupeChatListEvent(rows: SdkTavernChatListItemEvent[]): SdkTavernChatListItemEvent[] {
  const map = new Map<string, SdkTavernChatListItemEvent>();
  for (const row of rows) {
    const key = buildTavernChatScopedKeyEvent(row.locator);
    const prev = map.get(key);
    if (!prev || Number(row.updatedAt) >= Number(prev.updatedAt)) {
      map.set(key, row);
    }
  }
  return Array.from(map.values());
}

/**
 * 功能：列出当前酒馆下全部聊天。
 * @returns 聊天列表
 */
export async function listTavernChatsForCurrentTavernEvent(): Promise<SdkTavernChatListItemEvent[]> {
  const context = getSillyTavernContextEvent();
  if (!context) return [];
  const tavernInstanceId = ensureTavernInstanceIdEvent();
  const [characterRows, groupRows] = await Promise.all([
    collectCharacterChatsEvent(tavernInstanceId, context),
    collectGroupChatsEvent(tavernInstanceId, context),
  ]);
  return sortChatListEvent(dedupeChatListEvent([...characterRows, ...groupRows]));
}

/**
 * 功能：列出当前作用域下聊天（兼容入口）。
 * @returns 聊天列表
 */
export async function listTavernChatsForCurrentScopeEvent(): Promise<SdkTavernChatListItemEvent[]> {
  const scope = getTavernContextSnapshotEvent();
  if (!scope) return [];
  const allChats = await listTavernChatsForCurrentTavernEvent();
  return allChats.filter(
    (item) =>
      item.locator.scopeType === scope.scopeType &&
      String(item.locator.scopeId ?? "").trim() === String(scope.scopeId ?? "").trim()
  );
}
