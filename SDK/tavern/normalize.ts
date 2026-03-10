import type {
  SdkTavernChatLocatorEvent,
  SdkTavernScopeLocatorEvent,
} from "./types";

/**
 * 功能：把任意值规范化为聊天键片段。
 * @param raw 原始输入值
 * @param fallback 回退值
 * @returns 规范化后的片段
 */
export function normalizeTavernKeyPartEvent(raw: unknown, fallback: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  return text.replace(/\s+/g, "_");
}

/**
 * 功能：把角色标识归一化为可比较的作用域键。
 * @param roleId 原始角色标识
 * @returns 归一化后的角色键
 */
export function normalizeTavernRoleKeyEvent(roleId: string): string {
  return String(roleId ?? "")
    .trim()
    .toLowerCase()
    .replace(/^default_/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 功能：从旧版聊天键中解析三段结构。
 * @param legacyChatKey 旧版聊天键
 * @returns 解析结果
 */
export function parseLegacyTavernChatKeyEvent(legacyChatKey: string): {
  chatId: string;
  groupId: string;
  roleId: string;
} {
  const parts = String(legacyChatKey ?? "").split("::");
  return {
    chatId: String(parts[0] ?? "").trim(),
    groupId: String(parts[1] ?? "").trim() || "no_group",
    roleId: String(parts[2] ?? "").trim(),
  };
}

/**
 * 功能：判断聊天标识是否为 fallback 占位聊天。
 * @param input 聊天键或聊天 ID
 * @returns 是否为 fallback 聊天
 */
export function isFallbackTavernChatEvent(input: string): boolean {
  const text = String(input ?? "").trim();
  if (!text) return true;
  if (text === "fallback_chat") return true;
  const parsed = parseLegacyTavernChatKeyEvent(text);
  if (parsed.chatId === "fallback_chat") return true;
  return false;
}

/**
 * 功能：根据定位信息构建新的聊天级主键。
 * @param locator 聊天定位信息
 * @returns 结构化主键
 */
export function buildTavernChatScopedKeyEvent(locator: SdkTavernChatLocatorEvent): string {
  const tavernInstanceId = normalizeTavernKeyPartEvent(locator.tavernInstanceId, "unknown_tavern");
  const scopeType = normalizeTavernKeyPartEvent(locator.scopeType, "character");
  const scopeId = normalizeTavernKeyPartEvent(locator.scopeId, "unknown_scope");
  const chatId = normalizeTavernKeyPartEvent(locator.chatId, "fallback_chat");
  return `${tavernInstanceId}::${scopeType}::${scopeId}::${chatId}`;
}

/**
 * 功能：从结构化主键解析定位信息片段。
 * @param scopedKey 结构化主键
 * @returns 解析后的片段
 */
export function parseTavernChatScopedKeyEvent(scopedKey: string): {
  tavernInstanceId: string;
  scopeType: "character" | "group";
  scopeId: string;
  chatId: string;
} {
  const parts = String(scopedKey ?? "").split("::");
  const tavernInstanceId = normalizeTavernKeyPartEvent(parts[0], "unknown_tavern");
  const scopeType = String(parts[1] ?? "").trim() === "group" ? "group" : "character";
  const scopeId = normalizeTavernKeyPartEvent(parts[2], "unknown_scope");
  const chatId = normalizeTavernKeyPartEvent(parts.slice(3).join("::"), "fallback_chat");
  return {
    tavernInstanceId,
    scopeType,
    scopeId,
    chatId,
  };
}

/**
 * 功能：把作用域定位扩展为指定聊天的定位信息。
 * @param scope 作用域定位
 * @param chatId 聊天 ID
 * @returns 聊天定位信息
 */
export function withChatIdForScopeEvent(
  scope: SdkTavernScopeLocatorEvent,
  chatId: string
): SdkTavernChatLocatorEvent {
  return {
    ...scope,
    chatId: normalizeTavernKeyPartEvent(chatId, "fallback_chat"),
  };
}

