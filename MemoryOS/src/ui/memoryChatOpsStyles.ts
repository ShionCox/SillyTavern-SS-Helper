import memoryChatOpsCssText from './memoryChatOps.css?inline';

const MEMORY_CHAT_OPS_SCOPE_TOKEN = '.__stx-memory-chat-ops-scope__';

/**
 * 功能：返回记忆聊天运维面板的独立样式文本。
 * @param cardId 设置卡片根节点标识。
 * @returns 注入占位作用域后的完整样式字符串。
 */
export function buildMemoryChatOpsStyles(cardId: string): string {
    return memoryChatOpsCssText.replaceAll(MEMORY_CHAT_OPS_SCOPE_TOKEN, `#${cardId}`);
}
