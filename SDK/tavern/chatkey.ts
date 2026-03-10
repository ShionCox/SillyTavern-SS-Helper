import { getTavernContextSnapshotEvent } from "./context";
import { buildTavernChatScopedKeyEvent } from "./normalize";

/**
 * 功能：根据当前酒馆上下文自动构建标准化 chatKey。
 * 输出格式：tavernInstanceId::scopeType::scopeId::chatId
 * 可区分不同酒馆、不同类型（角色/群组）、不同角色、不同聊天。
 * @returns 标准化 chatKey；无上下文时返回空字符串
 */
export function buildSdkChatKeyEvent(): string {
  const scope = getTavernContextSnapshotEvent();
  if (!scope) return "";
  return buildTavernChatScopedKeyEvent({
    ...scope,
    chatId: scope.currentChatId,
  });
}
