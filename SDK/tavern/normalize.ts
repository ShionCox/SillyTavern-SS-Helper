import type {
  SdkTavernChatLocatorEvent,
  SdkTavernChatRefEvent,
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
 * 功能：把任意值规范化为聊天 ID 片段，额外去除常见扩展名。
 * @param raw 原始输入值
 * @param fallback 回退值
 * @returns 规范化后的聊天 ID
 */
export function normalizeTavernChatIdEvent(raw: unknown, fallback: string): string {
  const base = normalizeTavernKeyPartEvent(raw, fallback);
  return base.replace(/\.(jsonl|json)$/i, "");
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
  const chatId = normalizeTavernChatIdEvent(locator.chatId, "fallback_chat");
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

function normalizeEntityScopeIdEvent(scopeType: "character" | "group", scopeId: string): string {
  if (scopeType === "group") {
    return normalizeTavernKeyPartEvent(scopeId, "unknown_scope").toLowerCase();
  }
  const normalizedRole = normalizeTavernRoleKeyEvent(scopeId);
  return normalizeTavernKeyPartEvent(normalizedRole || scopeId, "unknown_scope").toLowerCase();
}

export function buildTavernChatEntityKeyEvent(ref: SdkTavernChatRefEvent): string {
  const tavernInstanceId = normalizeTavernKeyPartEvent(ref.tavernInstanceId, "unknown_tavern").toLowerCase();
  const scopeType = ref.scopeType === "group" ? "group" : "character";
  const scopeId = normalizeEntityScopeIdEvent(scopeType, String(ref.scopeId ?? ""));
  const chatId = normalizeTavernChatIdEvent(ref.chatId, "fallback_chat").toLowerCase();
  if (!tavernInstanceId || !scopeId || !chatId || isFallbackTavernChatEvent(chatId)) return "";
  return `${tavernInstanceId}::${scopeType}::${scopeId}::${chatId}`;
}

interface ParseAnyTavernChatRefOptionsEvent {
  tavernInstanceId?: string;
  scopeType?: "character" | "group";
  scopeId?: string;
}

export function parseAnyTavernChatRefEvent(
  input: string | Partial<SdkTavernChatRefEvent> | null | undefined,
  options?: ParseAnyTavernChatRefOptionsEvent
): SdkTavernChatRefEvent {
  const fallbackTavernInstanceId = normalizeTavernKeyPartEvent(
    options?.tavernInstanceId,
    "unknown_tavern"
  );
  const fallbackScopeType = options?.scopeType === "group" ? "group" : "character";
  const fallbackScopeId = normalizeEntityScopeIdEvent(
    fallbackScopeType,
    String(options?.scopeId ?? "")
  );

  if (typeof input === "string") {
    const key = String(input ?? "").trim();
    const parts = key.split("::");
    if (parts.length >= 4) {
      const parsed = parseTavernChatScopedKeyEvent(key);
      const scopeType = parsed.scopeType === "group" ? "group" : "character";
      return {
        tavernInstanceId: normalizeTavernKeyPartEvent(parsed.tavernInstanceId, fallbackTavernInstanceId),
        scopeType,
        scopeId: normalizeEntityScopeIdEvent(scopeType, parsed.scopeId),
        chatId: normalizeTavernKeyPartEvent(parsed.chatId, "fallback_chat"),
      };
    }
    const legacy = parseLegacyTavernChatKeyEvent(key);
    const scopeType =
      normalizeTavernKeyPartEvent(legacy.groupId, "no_group") !== "no_group" ? "group" : "character";
    const scopeIdRaw = scopeType === "group" ? legacy.groupId : legacy.roleId;
    return {
      tavernInstanceId: fallbackTavernInstanceId,
      scopeType,
      scopeId: normalizeEntityScopeIdEvent(scopeType, scopeIdRaw),
      chatId: normalizeTavernKeyPartEvent(legacy.chatId, "fallback_chat"),
    };
  }

  const raw = (input ?? {}) as Partial<SdkTavernChatRefEvent>;
  const scopeType = raw.scopeType === "group" ? "group" : fallbackScopeType;
  return {
    tavernInstanceId: normalizeTavernKeyPartEvent(raw.tavernInstanceId, fallbackTavernInstanceId),
    scopeType,
    scopeId: normalizeEntityScopeIdEvent(scopeType, String(raw.scopeId ?? fallbackScopeId)),
    chatId: normalizeTavernKeyPartEvent(raw.chatId, "fallback_chat"),
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

