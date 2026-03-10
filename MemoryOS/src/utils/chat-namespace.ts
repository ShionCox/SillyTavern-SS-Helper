/**
 * ChatNamespace 工具函数 —— 用于生成稳定的 chatKey
 * @deprecated 请使用 SDK/tavern 中的 buildSdkChatKeyEvent 替代
 */

import { buildSdkChatKeyEvent } from '../../../SDK/tavern';

export interface ChatNamespaceInput {
    chatId: string;
    groupId?: string;
    characterId?: string;
}

/**
 * @deprecated 请使用 SDK/tavern 中的 buildSdkChatKeyEvent() 替代。
 * 此函数保留仅为兼容旧代码引用，内部已转发至 SDK 统一实现。
 */
export function buildChatKey(_input: ChatNamespaceInput): string {
    const sdkKey = buildSdkChatKeyEvent();
    if (sdkKey) return sdkKey;
    // 兜底：SDK 上下文不可用时退回旧逻辑
    if (_input.groupId) {
        return `Group_${_input.groupId}_${_input.chatId}`;
    }
    if (_input.characterId) {
        return `${_input.characterId}_${_input.chatId}`;
    }
    return _input.chatId;
}

