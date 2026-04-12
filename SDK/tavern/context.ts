import { ensureTavernInstanceIdEvent } from "./instance";
import { isStableTavernRoleKeyEvent, normalizeTavernChatIdEvent, normalizeTavernKeyPartEvent, normalizeTavernRoleKeyEvent } from "./normalize";
import type {
  SdkTavernCharacterEvent,
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernRoleIdentityEvent,
  SdkTavernSemanticSnapshotEvent,
  SdkTavernScopeLocatorEvent,
} from "./types";

interface ResolvedCurrentCharacterEvent {
  character: SdkTavernCharacterEvent | null;
  index: number;
}

/**
 * 功能：安全获取 SillyTavern 上下文对象。
 * @returns 宿主上下文或空值
 */
export function getSillyTavernContextEvent(): SdkTavernContextEvent | null {
  try {
    const globalRef = globalThis as { SillyTavern?: { getContext?: () => unknown } };
    const context = globalRef.SillyTavern?.getContext?.();
    if (!context || typeof context !== "object") return null;
    return context as SdkTavernContextEvent;
  } catch {
    return null;
  }
}

/**
 * 功能：解析当前选中的角色与索引。
 * @param context 宿主上下文
 * @returns 当前角色与索引
 */
export function resolveCurrentCharacterEvent(
  context: SdkTavernContextEvent | null
): ResolvedCurrentCharacterEvent {
  const characters = Array.isArray(context?.characters) ? context.characters : [];
  const indexCandidates = [context?.characterId, context?.this_chid];
  for (const candidate of indexCandidates) {
    const index = Number(candidate);
    if (Number.isInteger(index) && index >= 0 && index < characters.length) {
      return {
        character: characters[index] as SdkTavernCharacterEvent,
        index,
      };
    }
  }

  const nameHint = String(context?.characterName ?? context?.name2 ?? "").trim().toLowerCase();
  if (nameHint) {
    const matchedIndex = characters.findIndex((item) => String(item?.name ?? "").trim().toLowerCase() === nameHint);
    if (matchedIndex >= 0) {
      return {
        character: characters[matchedIndex] as SdkTavernCharacterEvent,
        index: matchedIndex,
      };
    }
  }

  if (characters.length === 1) {
    return {
      character: characters[0] as SdkTavernCharacterEvent,
      index: 0,
    };
  }

  return {
    character: null,
    index: -1,
  };
}

/**
 * 功能：解析当前聊天 ID。
 * @param context 宿主上下文
 * @param currentCharacter 当前角色
 * @returns 当前聊天 ID
 */
export function resolveCurrentChatIdEvent(
  context: SdkTavernContextEvent | null,
  currentCharacter: SdkTavernCharacterEvent | null
): string {
  const rawChatNode = (context as { chat?: unknown } | null)?.chat;
  const liveChatIdCandidates: unknown[] = [
    context?.chatId,
    context?.chat_id,
    rawChatNode && typeof rawChatNode === "object" && !Array.isArray(rawChatNode)
      ? (rawChatNode as { id?: unknown; file_name?: unknown; name?: unknown }).id
      : "",
    rawChatNode && typeof rawChatNode === "object" && !Array.isArray(rawChatNode)
      ? (rawChatNode as { id?: unknown; file_name?: unknown; name?: unknown }).file_name
      : "",
    rawChatNode && typeof rawChatNode === "object" && !Array.isArray(rawChatNode)
      ? (rawChatNode as { id?: unknown; file_name?: unknown; name?: unknown }).name
      : "",
  ];
  const liveChatId = liveChatIdCandidates
    .map((value) => normalizeTavernChatIdEvent(value, ""))
    .find((value) => value && value !== "fallback_chat");
  return normalizeTavernChatIdEvent(
    liveChatId ?? currentCharacter?.chat,
    "fallback_chat"
  );
}

/**
 * 功能：从上下文中提取当前角色身份信息。
 * @param context 宿主上下文
 * @returns 角色身份信息
 */
export function resolveTavernRoleIdentityEvent(
  context: SdkTavernContextEvent | null
): SdkTavernRoleIdentityEvent {
  const resolved = resolveCurrentCharacterEvent(context);
  const matched = resolved.character;

  const avatarName = normalizeTavernKeyPartEvent(matched?.avatar, "");
  const displayName =
    String(matched?.name ?? context?.characterName ?? context?.name2 ?? context?.name1 ?? "").trim() ||
    "未知角色";
  const rawRoleId = normalizeTavernKeyPartEvent(avatarName || displayName, "");
  const roleId = isStableTavernRoleKeyEvent(rawRoleId, { characterId: resolved.index }) ? rawRoleId : "";
  const roleKey = roleId ? normalizeTavernRoleKeyEvent(roleId) : "";
  const avatarUrl = avatarName ? `/characters/${encodeURIComponent(avatarName)}` : "";

  return {
    roleId,
    roleKey,
    displayName,
    avatarName,
    avatarUrl,
  };
}

function resolveCharacterScopeIdEvent(
  context: SdkTavernContextEvent | null,
  currentCharacter: SdkTavernCharacterEvent | null,
  role: SdkTavernRoleIdentityEvent
): string {
  const stableRoleKey = normalizeTavernKeyPartEvent(role.roleKey, "");
  if (stableRoleKey) {
    return stableRoleKey;
  }

  return normalizeTavernKeyPartEvent(
    role.roleId
    || currentCharacter?.avatar
    || currentCharacter?.name
    || context?.characterName
    || context?.name2
    || context?.name1,
    "unknown_scope"
  );
}

/**
 * 功能：获取当前群组对象。
 * @param context 宿主上下文
 * @returns 群组对象或空值
 */
export function resolveCurrentGroupEvent(context: SdkTavernContextEvent | null): SdkTavernGroupEvent | null {
  const groupId = String(context?.groupId ?? "").trim();
  if (!groupId) return null;
  const groups = Array.isArray(context?.groups) ? context.groups : [];
  const matched = groups.find((item) => String(item?.id ?? "").trim() === groupId);
  return matched ?? null;
}

/**
 * 功能：构建当前酒馆作用域定位信息。
 * @returns 当前作用域定位；无上下文时返回空值
 */
export function getTavernContextSnapshotEvent(): SdkTavernScopeLocatorEvent | null {
  const context = getSillyTavernContextEvent();
  if (!context) return null;
  const tavernInstanceId = ensureTavernInstanceIdEvent();
  const group = resolveCurrentGroupEvent(context);
  const liveContextChatId = resolveCurrentChatIdEvent(context, null);

  if (group) {
    const groupId = normalizeTavernKeyPartEvent(group.id, "no_group");
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
      currentChatId: liveContextChatId,
    };
  }

  const resolved = resolveCurrentCharacterEvent(context);
  const role = resolveTavernRoleIdentityEvent(context);
  const currentChatId = resolveCurrentChatIdEvent(context, resolved.character);
  return {
    tavernInstanceId,
    scopeType: "character",
    scopeId: resolveCharacterScopeIdEvent(context, resolved.character, role),
    roleKey: role.roleKey,
    roleId: role.roleId,
    displayName: role.displayName,
    avatarUrl: role.avatarUrl,
    groupId: "no_group",
    characterId: resolved.index,
    currentChatId,
  };
}

function normalizeSemanticTextEvent(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMemberNamesEvent(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: unknown): string => {
      if (typeof item === "string") return normalizeSemanticTextEvent(item);
      if (item && typeof item === "object") {
        const source = item as Record<string, unknown>;
        return normalizeSemanticTextEvent(source.name ?? source.id);
      }
      return "";
    })
    .filter((name: string): boolean => Boolean(name))
    .slice(0, 32);
}

/**
 * 功能：提取用于语义冷启动的宿主上下文快照。
 * @returns 语义快照；无上下文时返回 null。
 */
export function getTavernSemanticSnapshotEvent(): SdkTavernSemanticSnapshotEvent | null {
  const context = getSillyTavernContextEvent();
  if (!context) return null;
  const role = resolveTavernRoleIdentityEvent(context);
  const group = resolveCurrentGroupEvent(context);
  const contextRecord = context as Record<string, unknown>;
  const groupRecord = (group ?? null) as Record<string, unknown> | null;
  const activeLorebooksRaw = (globalThis as Record<string, unknown>).selected_world_info ?? contextRecord.selected_world_info;
  const activeLorebooks = Array.isArray(activeLorebooksRaw)
    ? activeLorebooksRaw.map((item: unknown): string => normalizeSemanticTextEvent(item)).filter(Boolean).slice(0, 32)
    : [];
  const groupMembers = normalizeMemberNamesEvent(
    contextRecord.groupMembers
    ?? contextRecord.group_members
    ?? groupRecord?.members
    ?? groupRecord?.memberNames
    ?? [],
  );
  return {
    roleKey: role.roleKey,
    roleId: role.roleId,
    displayName: role.displayName,
    groupId: normalizeSemanticTextEvent(groupRecord?.id ?? contextRecord.groupId),
    characterId: normalizeSemanticTextEvent(contextRecord.characterId ?? contextRecord.this_chid),
    systemPrompt: normalizeSemanticTextEvent(
      contextRecord.systemPrompt
      ?? contextRecord.system_prompt
      ?? contextRecord.main_prompt,
    ),
    firstMessage: normalizeSemanticTextEvent(
      contextRecord.firstMessage
      ?? contextRecord.first_mes
      ?? contextRecord.opener,
    ),
    authorNote: normalizeSemanticTextEvent(
      contextRecord.authorNote
      ?? contextRecord.author_note
      ?? contextRecord.creator_notes,
    ),
    jailbreak: normalizeSemanticTextEvent(contextRecord.jailbreak ?? contextRecord.jailbreak_prompt),
    instruct: normalizeSemanticTextEvent(contextRecord.instruct ?? contextRecord.instruct_prompt),
    activeLorebooks,
    groupMembers,
    presetStyle: normalizeSemanticTextEvent(
      contextRecord.preset
      ?? contextRecord.presetName
      ?? contextRecord.chatCompletionPreset
      ?? (contextRecord.chatCompletionSettings as Record<string, unknown> | undefined)?.preset,
    ),
  };
}
