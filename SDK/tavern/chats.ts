import { getSillyTavernContextEvent, getTavernContextSnapshotEvent } from "./context";
import { ensureTavernInstanceIdEvent } from "./instance";
import {
  buildTavernChatEntityKeyEvent,
  buildTavernChatScopedKeyEvent,
  isFallbackTavernChatEvent,
  normalizeTavernChatIdEvent,
  normalizeTavernKeyPartEvent,
  parseAnyTavernChatRefEvent,
} from "./normalize";
import type {
  SdkTavernCharacterEvent,
  SdkTavernChatListItemEvent,
  SdkTavernChatLocatorEvent,
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernScopeLocatorEvent,
  SdkUnifiedTavernChatDirectoryInputEvent,
  SdkUnifiedTavernChatDirectoryItemEvent,
  SdkUnifiedTavernHostChatEvent,
  SdkUnifiedTavernLocalSummaryEvent,
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
    currentChatId: normalizeTavernChatIdEvent(character.chat, "fallback_chat"),
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
    currentChatId: normalizeTavernChatIdEvent(group.chat_id, "fallback_chat"),
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
  const chatId = normalizeTavernChatIdEvent(locator.chatId, "fallback_chat");
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
        const chatId = normalizeTavernChatIdEvent(info.file_name, "");
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
        const chatId = normalizeTavernChatIdEvent(info.file_name, "");
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

interface UnifiedDirectoryMergeEntryEvent extends SdkUnifiedTavernChatDirectoryItemEvent {
  canonicalPriority: number;
}

function buildFallbackChatNameEvent(chatKey: string): string {
  const parsed = parseAnyTavernChatRefEvent(chatKey);
  return String(parsed.chatId ?? "").trim() || "unknown_chat";
}

function getCanonicalPriorityEvent(source: "host" | "current" | "local" | "draft" | "tagged"): number {
  if (source === "host") return 5;
  if (source === "current") return 4;
  if (source === "local") return 3;
  if (source === "draft") return 2;
  return 1;
}

function normalizeHostChatEvent(host: SdkUnifiedTavernHostChatEvent): SdkUnifiedTavernHostChatEvent {
  const parsed = parseAnyTavernChatRefEvent(host.chatKey);
  return {
    chatKey: String(host.chatKey ?? "").trim(),
    updatedAt: Number(host.updatedAt) || 0,
    chatId: normalizeTavernKeyPartEvent(host.chatId || parsed.chatId, "fallback_chat"),
    displayName: String(host.displayName ?? "").trim(),
    avatarUrl: String(host.avatarUrl ?? "").trim(),
    scopeType: host.scopeType === "group" ? "group" : "character",
    scopeId: normalizeTavernKeyPartEvent(host.scopeId || parsed.scopeId, "unknown_scope"),
    roleKey: String(host.roleKey ?? "").trim(),
  };
}

function normalizeLocalSummaryEvent(local: SdkUnifiedTavernLocalSummaryEvent): SdkUnifiedTavernLocalSummaryEvent {
  return {
    chatKey: String(local.chatKey ?? "").trim(),
    updatedAt: Number(local.updatedAt) || 0,
    activeStatusCount: Number(local.activeStatusCount) || 0,
    displayName: String(local.displayName ?? "").trim(),
    avatarUrl: String(local.avatarUrl ?? "").trim(),
    roleKey: String(local.roleKey ?? "").trim(),
  };
}

export function listUnifiedTavernChatDirectoryEvent(
  input: SdkUnifiedTavernChatDirectoryInputEvent
): SdkUnifiedTavernChatDirectoryItemEvent[] {
  const currentChatKey = String(input.currentChatKey ?? "").trim();
  const fallbackTavernInstanceId = ensureTavernInstanceIdEvent();
  const currentRef = parseAnyTavernChatRefEvent(currentChatKey, {
    tavernInstanceId: fallbackTavernInstanceId,
  });
  const currentEntityKey = buildTavernChatEntityKeyEvent(currentRef);

  const map = new Map<string, UnifiedDirectoryMergeEntryEvent>();
  const taggedKeys = Array.isArray(input.taggedChatKeys) ? input.taggedChatKeys : [];
  const taggedEntitySet = new Set(
    taggedKeys
      .map((item) =>
        buildTavernChatEntityKeyEvent(
          parseAnyTavernChatRefEvent(item, { tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId })
        )
      )
      .filter(Boolean)
  );

  const mergeEntryEvent = (
    entityKey: string,
    source: "host" | "current" | "local" | "draft" | "tagged",
    candidate: SdkUnifiedTavernChatDirectoryItemEvent
  ): void => {
    if (!entityKey) return;
    const prev = map.get(entityKey);
    if (!prev) {
      map.set(entityKey, {
        ...candidate,
        canonicalPriority: getCanonicalPriorityEvent(source),
      });
      return;
    }

    const candidatePriority = getCanonicalPriorityEvent(source);
    const nextChatKey =
      !prev.chatKey || candidatePriority > prev.canonicalPriority ? candidate.chatKey : prev.chatKey;
    map.set(entityKey, {
      chatKey: nextChatKey,
      entityKey,
      chatId: String(prev.chatId ?? "").trim() || String(candidate.chatId ?? "").trim(),
      displayName:
        (prev.fromHost ? String(prev.displayName ?? "").trim() : "") ||
        (source === "host" ? String(candidate.displayName ?? "").trim() : "") ||
        String(prev.displayName ?? "").trim() ||
        String(candidate.displayName ?? "").trim() ||
        buildFallbackChatNameEvent(nextChatKey),
      avatarUrl:
        (prev.fromHost ? String(prev.avatarUrl ?? "").trim() : "") ||
        (source === "host" ? String(candidate.avatarUrl ?? "").trim() : "") ||
        String(prev.avatarUrl ?? "").trim() ||
        String(candidate.avatarUrl ?? "").trim(),
      scopeType: prev.scopeType || candidate.scopeType,
      scopeId: String(prev.scopeId ?? "").trim() || String(candidate.scopeId ?? "").trim(),
      roleKey: String(prev.roleKey ?? "").trim() || String(candidate.roleKey ?? "").trim(),
      updatedAt: Math.max(Number(prev.updatedAt) || 0, Number(candidate.updatedAt) || 0),
      activeStatusCount: Math.max(
        Number(prev.activeStatusCount) || 0,
        Number(candidate.activeStatusCount) || 0
      ),
      isCurrent: Boolean(prev.isCurrent) || Boolean(candidate.isCurrent),
      fromHost: Boolean(prev.fromHost) || Boolean(candidate.fromHost),
      fromLocal: Boolean(prev.fromLocal) || Boolean(candidate.fromLocal),
      fromDraft: Boolean(prev.fromDraft) || Boolean(candidate.fromDraft),
      fromTagged: Boolean(prev.fromTagged) || Boolean(candidate.fromTagged),
      canonicalPriority: Math.max(prev.canonicalPriority, candidatePriority),
    });
  };

  const inCurrentTavernEvent = (key: string): boolean => {
    const parsed = parseAnyTavernChatRefEvent(key, { tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId });
    if (!parsed.chatId || isFallbackTavernChatEvent(parsed.chatId)) return false;
    if (!currentRef.tavernInstanceId || currentRef.tavernInstanceId === "unknown_tavern") {
      return Boolean(parsed.tavernInstanceId && parsed.tavernInstanceId !== "unknown_tavern");
    }
    return parsed.tavernInstanceId === currentRef.tavernInstanceId;
  };

  const hostChats = (Array.isArray(input.hostChats) ? input.hostChats : []).map(normalizeHostChatEvent);
  for (const host of hostChats) {
    if (!host.chatKey || !inCurrentTavernEvent(host.chatKey)) continue;
    if (!host.chatId || isFallbackTavernChatEvent(host.chatId)) continue;
    const ref = parseAnyTavernChatRefEvent(
      {
        tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId,
        scopeType: host.scopeType,
        scopeId: host.scopeId,
        chatId: host.chatId,
      },
      { tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId }
    );
    const entityKey = buildTavernChatEntityKeyEvent(ref);
    mergeEntryEvent(entityKey, "host", {
      chatKey: host.chatKey,
      entityKey,
      chatId: ref.chatId,
      displayName: host.displayName || buildFallbackChatNameEvent(host.chatKey),
      avatarUrl: host.avatarUrl,
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      roleKey: host.roleKey,
      updatedAt: host.updatedAt,
      activeStatusCount: 0,
      isCurrent: host.chatKey === currentChatKey,
      fromHost: true,
      fromLocal: false,
      fromDraft: false,
      fromTagged: taggedEntitySet.has(entityKey),
    });
  }

  const localSummaries = (Array.isArray(input.localSummaries) ? input.localSummaries : []).map(
    normalizeLocalSummaryEvent
  );
  for (const local of localSummaries) {
    if (!local.chatKey || !inCurrentTavernEvent(local.chatKey)) continue;
    const ref = parseAnyTavernChatRefEvent(local.chatKey, {
      tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId,
    });
    if (!ref.chatId || isFallbackTavernChatEvent(ref.chatId)) continue;
    const entityKey = buildTavernChatEntityKeyEvent(ref);
    mergeEntryEvent(entityKey, "local", {
      chatKey: local.chatKey,
      entityKey,
      chatId: ref.chatId,
      displayName: local.displayName || buildFallbackChatNameEvent(local.chatKey),
      avatarUrl: local.avatarUrl || "",
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      roleKey: local.roleKey || "",
      updatedAt: local.updatedAt,
      activeStatusCount: Number(local.activeStatusCount) || 0,
      isCurrent: local.chatKey === currentChatKey,
      fromHost: false,
      fromLocal: true,
      fromDraft: false,
      fromTagged: taggedEntitySet.has(entityKey),
    });
  }

  const draftChatKeys = Array.isArray(input.draftChatKeys) ? input.draftChatKeys : [];
  for (const key of draftChatKeys.map((item) => String(item ?? "").trim()).filter(Boolean)) {
    if (!inCurrentTavernEvent(key)) continue;
    const ref = parseAnyTavernChatRefEvent(key, { tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId });
    if (!ref.chatId || isFallbackTavernChatEvent(ref.chatId)) continue;
    const entityKey = buildTavernChatEntityKeyEvent(ref);
    mergeEntryEvent(entityKey, "draft", {
      chatKey: key,
      entityKey,
      chatId: ref.chatId,
      displayName: buildFallbackChatNameEvent(key),
      avatarUrl: "",
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      roleKey: "",
      updatedAt: 0,
      activeStatusCount: 0,
      isCurrent: key === currentChatKey,
      fromHost: false,
      fromLocal: false,
      fromDraft: true,
      fromTagged: taggedEntitySet.has(entityKey),
    });
  }

  for (const taggedKey of taggedKeys.map((item) => String(item ?? "").trim()).filter(Boolean)) {
    if (!inCurrentTavernEvent(taggedKey)) continue;
    const ref = parseAnyTavernChatRefEvent(taggedKey, {
      tavernInstanceId: currentRef.tavernInstanceId || fallbackTavernInstanceId,
    });
    if (!ref.chatId || isFallbackTavernChatEvent(ref.chatId)) continue;
    const entityKey = buildTavernChatEntityKeyEvent(ref);
    mergeEntryEvent(entityKey, "tagged", {
      chatKey: taggedKey,
      entityKey,
      chatId: ref.chatId,
      displayName: buildFallbackChatNameEvent(taggedKey),
      avatarUrl: "",
      scopeType: ref.scopeType,
      scopeId: ref.scopeId,
      roleKey: "",
      updatedAt: 0,
      activeStatusCount: 0,
      isCurrent: taggedKey === currentChatKey,
      fromHost: false,
      fromLocal: false,
      fromDraft: false,
      fromTagged: true,
    });
  }

  if (currentChatKey && currentEntityKey && !map.has(currentEntityKey) && !isFallbackTavernChatEvent(currentRef.chatId)) {
    mergeEntryEvent(currentEntityKey, "current", {
      chatKey: currentChatKey,
      entityKey: currentEntityKey,
      chatId: currentRef.chatId,
      displayName: buildFallbackChatNameEvent(currentChatKey),
      avatarUrl: "",
      scopeType: currentRef.scopeType,
      scopeId: currentRef.scopeId,
      roleKey: "",
      updatedAt: Date.now(),
      activeStatusCount: 0,
      isCurrent: true,
      fromHost: false,
      fromLocal: false,
      fromDraft: false,
      fromTagged: taggedEntitySet.has(currentEntityKey),
    });
  }

  return Array.from(map.values())
    .map(({ canonicalPriority: _priority, ...row }) => row)
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return Number(b.isCurrent) - Number(a.isCurrent);
      const aDirty = a.fromDraft ? 1 : 0;
      const bDirty = b.fromDraft ? 1 : 0;
      if (aDirty !== bDirty) return bDirty - aDirty;
      if (a.fromHost !== b.fromHost) return Number(b.fromHost) - Number(a.fromHost);
      return Number(b.updatedAt) - Number(a.updatedAt);
    });
}
