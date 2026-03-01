/**
 * ChatNamespace 工具函数 —— 用于生成稳定的 chatKey
 * 保证同一个聊天永远映射到同一个 namespace
 */

export interface ChatNamespaceInput {
    chatId: string;
    groupId?: string;
    characterId?: string;
}

/**
 * 根据聊天 ID / 群组 ID / 角色 ID 计算唯一的分区键
 * 规则：
 *   - 群组聊天: `Group_${groupId}_${chatId}`
 *   - 角色聊天: `${characterId}_${chatId}`
 *   - 默认:     `${chatId}`
 */
export function buildChatKey(input: ChatNamespaceInput): string {
    if (input.groupId) {
        return `Group_${input.groupId}_${input.chatId}`;
    }
    if (input.characterId) {
        return `${input.characterId}_${input.chatId}`;
    }
    return input.chatId;
}
