import { ensureTavernInstanceIdEvent } from "./instance";
import { normalizeTavernChatIdEvent, normalizeTavernKeyPartEvent, normalizeTavernRoleKeyEvent } from "./normalize";
import type {
  SdkTavernCharacterEvent,
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernRoleIdentityEvent,
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
function resolveCurrentCharacterEvent(
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
function resolveCurrentChatIdEvent(
  context: SdkTavernContextEvent | null,
  currentCharacter: SdkTavernCharacterEvent | null
): string {
  const rawChatNode = (context as { chat?: unknown } | null)?.chat;
  const chatObjectId =
    rawChatNode && typeof rawChatNode === "object" && !Array.isArray(rawChatNode)
      ? (rawChatNode as { id?: unknown }).id
      : "";
  return normalizeTavernChatIdEvent(
    currentCharacter?.chat ?? context?.chatId ?? context?.chat_id ?? chatObjectId,
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
  const roleId = normalizeTavernKeyPartEvent(avatarName || displayName, "default_role");
  const roleKey = normalizeTavernRoleKeyEvent(roleId) || "default_role";
  const avatarUrl = avatarName ? `/characters/${encodeURIComponent(avatarName)}` : "";

  return {
    roleId,
    roleKey,
    displayName,
    avatarName,
    avatarUrl,
  };
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

  if (group) {
    const groupId = normalizeTavernKeyPartEvent(group.id, "no_group");
    const currentChatId = normalizeTavernChatIdEvent(group.chat_id, "fallback_chat");
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
      currentChatId,
    };
  }

  const resolved = resolveCurrentCharacterEvent(context);
  const role = resolveTavernRoleIdentityEvent(context);
  const currentChatId = resolveCurrentChatIdEvent(context, resolved.character);
  return {
    tavernInstanceId,
    scopeType: "character",
    scopeId: role.roleKey || "default_role",
    roleKey: role.roleKey,
    roleId: role.roleId,
    displayName: role.displayName,
    avatarUrl: role.avatarUrl,
    groupId: "no_group",
    characterId: resolved.index,
    currentChatId,
  };
}
