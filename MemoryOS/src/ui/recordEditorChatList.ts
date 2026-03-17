import { db } from '../db/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readSdkPluginChatState } from '../../../SDK/db';
import { buildTavernChatEntityKeyEvent, getTavernContextSnapshotEvent, parseAnyTavernChatRefEvent } from '../../../SDK/tavern';
import { escapeHtml, formatTimeLabel } from './editorShared';

export interface ChatItemMeta {
    chatKey: string;
    canonicalKey: string;
    displayName: string;
    systemName: string;
    avatarHtml: string;
    createdAt: number | null;
    signal: Record<string, unknown> | null;
    archived: boolean;
    hostMissing: boolean;
    archiveReason: string;
}

/**
 * 功能：解析当前聊天的规范 canonical key。
 * @param chatKey 聊天键。
 * @returns 规范化后的 canonical key。
 */
export function resolveChatItemCanonicalKey(chatKey: string): string {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return '';
    }
    const scope = getTavernContextSnapshotEvent();
    const ref = parseAnyTavernChatRefEvent(normalizedChatKey, {
        tavernInstanceId: String(scope?.tavernInstanceId ?? '').trim() || undefined,
        scopeType: scope?.scopeType,
        scopeId: String(scope?.scopeId ?? '').trim() || undefined,
    });
    return buildTavernChatEntityKeyEvent(ref) || normalizedChatKey.toLowerCase();
}

/**
 * 功能：读取当前绑定的 MemoryOS 聊天键。
 * @returns 当前聊天键。
 */
export function getCurrentMemoryChatKey(): string {
    return String((window as any)?.STX?.memory?.getChatKey?.() ?? '').trim();
}

/**
 * 功能：判断某个聊天是否仍有实际数据内容。
 * @param chatKey 聊天键。
 * @returns 是否存在有效持久化数据。
 */
export async function hasMeaningfulChatContent(chatKey: string): Promise<boolean> {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return false;
    }

    const [eventRow, factRow, worldStateRow, summaryRow, templateRow, auditRow] = await Promise.all([
        db.events.where('chatKey').equals(normalizedChatKey).first(),
        db.facts.where('[chatKey+updatedAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.world_state.where('[chatKey+path]').between([normalizedChatKey, ''], [normalizedChatKey, '\uffff']).first(),
        db.summaries.where('[chatKey+level+createdAt]').between([normalizedChatKey, '', 0], [normalizedChatKey, '\uffff', Infinity]).first(),
        db.templates.where('[chatKey+createdAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.audit.where('chatKey').equals(normalizedChatKey).first(),
    ]);

    return Boolean(eventRow || factRow || worldStateRow || summaryRow || templateRow || auditRow);
}

/**
 * 功能：构建聊天摘要文本。
 * @param signal MemoryOS 共享信号。
 * @returns 摘要文本。
 */
export function buildChatSummaryLabel(signal: Record<string, unknown> | null): string {
    if (!signal) {
        return '尚无共享摘要';
    }
    const factCount = Number(signal.factCount ?? 0);
    const eventCount = Number(signal.eventCount ?? 0);
    const activeTemplate = String(signal.activeTemplate ?? '').trim();
    const lastSummaryAt = Number(signal.lastSummaryAt ?? 0);
    const parts = [
        activeTemplate ? `模板 ${activeTemplate}` : '模板未绑定',
        `事实 ${factCount}`,
        `事件 ${eventCount}`,
    ];
    if (lastSummaryAt > 0) {
        parts.push(`摘要 ${formatTimeLabel(lastSummaryAt)}`);
    }
    return parts.join(' · ');
}

/**
 * 功能：把聊天删除/归档原因转换为更友好的中文标签。
 * @param reason 原始原因码。
 * @returns 展示标签。
 */
export function formatArchiveReasonLabel(reason: string): string {
    const normalized = String(reason ?? '').trim().toLowerCase();
    if (!normalized) {
        return '已删除';
    }
    if (normalized.includes('host_chat_deleted') || normalized.includes('host_deleted')) {
        return '已从宿主删除';
    }
    if (normalized.includes('orphaned')) {
        return '原会话已不存在';
    }
    if (normalized.includes('soft_delete')) {
        return '软删除归档';
    }
    return `已删除 · ${reason}`;
}

/**
 * 功能：构造聊天项的展示元数据。
 * @param chatKey 聊天键。
 * @param signal MemoryOS 共享信号。
 * @param hostCanonicalKeySet 宿主 canonical key 集合。
 * @returns 界面展示需要的元数据。
 */
export async function buildChatItemMeta(
    chatKey: string,
    signal: Record<string, unknown> | null,
    hostCanonicalKeySet: Set<string>,
): Promise<ChatItemMeta> {
    const ctx = (window as any).SillyTavern?.getContext?.() || {};
    const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
    const groups = Array.isArray(ctx.groups) ? ctx.groups : [];
    const canonicalKey = resolveChatItemCanonicalKey(chatKey);
    let displayName = chatKey;
    let avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-user"></i></div>`;

    const [firstEvent, pluginStateRow] = await Promise.all([
        db.events.where('chatKey').equals(chatKey).first(),
        readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey).catch(() => null),
    ]);
    const createdAt = firstEvent?.ts ? Number(firstEvent.ts) : null;
    const pluginState = (pluginStateRow?.state ?? {}) as Record<string, unknown>;
    const archived = pluginState.archived === true;
    const archiveReason = String(pluginState.archiveReason ?? '').trim();
    const hostMissing = hostCanonicalKeySet.size > 0 && Boolean(canonicalKey) && !hostCanonicalKeySet.has(canonicalKey);

    const parsedRef = parseAnyTavernChatRefEvent(chatKey);

    if (parsedRef.scopeType === 'group' || chatKey.startsWith('Group_')) {
        const groupId = parsedRef.scopeType === 'group' ? parsedRef.scopeId : chatKey.replace(/^Group_/, '').split('_')[0];
        const group = groups.find((item: Record<string, unknown>): boolean => String(item.id ?? '') === groupId || String(item.name ?? '') === groupId || String(item.avatar ?? '') === groupId);
        if (group) {
            displayName = `[群组] ${String(group.name ?? groupId)}`;
            avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-users"></i></div>`;
        } else {
            displayName = `[群组] ${groupId}`;
            avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-users"></i></div>`;
        }
    } else {
        const characterId = parsedRef.scopeId;
        const matchedCharacter = characters.find((item: Record<string, unknown>): boolean => {
            const avatar = String(item.avatar ?? '');
            const name = String(item.name ?? '');
            if (characterId && (avatar === characterId || name === characterId)) {
                return true;
            }
            return Boolean(avatar) && chatKey.startsWith(`${avatar}_`);
        });

        if (matchedCharacter) {
            displayName = String(matchedCharacter.name ?? characterId);
            avatarHtml = `<img class="stx-re-chat-avatar" src="/characters/${escapeHtml(String(matchedCharacter.avatar ?? ''))}" alt="${escapeHtml(displayName)}" onerror="this.outerHTML='<div class=&quot;stx-re-chat-avatar-icon&quot;><i class=&quot;fa-solid fa-user&quot;></i></div>'">`;
        } else if (characterId && characterId !== 'unknown_scope') {
            displayName = characterId;
        }
    }

    return {
        chatKey,
        canonicalKey,
        displayName,
        systemName: chatKey,
        avatarHtml,
        createdAt,
        signal,
        archived,
        hostMissing,
        archiveReason,
    };
}
