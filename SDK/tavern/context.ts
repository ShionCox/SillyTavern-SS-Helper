import { ensureTavernInstanceIdEvent } from "./instance";
import { normalizeTavernKeyPartEvent, normalizeTavernRoleKeyEvent } from "./normalize";
import type {
  SdkTavernCharacterEvent,
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernRoleIdentityEvent,
  SdkTavernScopeLocatorEvent,
} from "./types";

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
 * 功能：从上下文中提取当前角色身份信息。
 * @param context 宿主上下文
 * @returns 角色身份信息
 */
export function resolveTavernRoleIdentityEvent(
  context: SdkTavernContextEvent | null
): SdkTavernRoleIdentityEvent {
  const characters = Array.isArray(context?.characters) ? context?.characters : [];
  const characterIndex = Number(context?.characterId);
  const matched =
    Number.isInteger(characterIndex) && characterIndex >= 0 && characterIndex < characters.length
      ? (characters[characterIndex] as SdkTavernCharacterEvent)
      : null;

  const avatarName = normalizeTavernKeyPartEvent(matched?.avatar, "");
  const displayName = String(matched?.name ?? context?.name1 ?? "").trim() || "未知角色";
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
    const currentChatId = normalizeTavernKeyPartEvent(group.chat_id, "fallback_chat");
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

  const role = resolveTavernRoleIdentityEvent(context);
  const currentChatId = normalizeTavernKeyPartEvent(context?.chatId, "fallback_chat");
  const characterId = Number.isInteger(Number(context?.characterId)) ? Number(context?.characterId) : -1;
  return {
    tavernInstanceId,
    scopeType: "character",
    scopeId: role.roleKey || "default_role",
    roleKey: role.roleKey,
    roleId: role.roleId,
    displayName: role.displayName,
    avatarUrl: role.avatarUrl,
    groupId: "no_group",
    characterId,
    currentChatId,
  };
}

