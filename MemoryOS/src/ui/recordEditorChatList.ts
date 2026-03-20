import { db, restoreArchivedMemoryChat } from '../db/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readSdkPluginChatState } from '../../../SDK/db';
import { buildTavernChatEntityKeyEvent, buildTavernChatScopedKeyEvent, getTavernContextSnapshotEvent, listTavernChatsForCurrentTavernEvent, parseAnyTavernChatRefEvent } from '../../../SDK/tavern';
import { escapeHtml, formatTimeLabel } from './editorShared';
import type { SdkTavernChatLocatorEvent } from '../../../SDK/tavern/types';

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

export interface MemoryChatSidebarItem extends ChatItemMeta {
    hostPresent: boolean;
    hasMeaningfulData: boolean;
    deleted: boolean;
    deletedReason: string;
}

export interface LoadMemoryChatSidebarItemsOptions {
    activeChatKey?: string;
    recoverArchivedIfHostExists?: boolean;
}

export interface RenderMemoryChatSidebarListOptions {
    activeChatKey?: string;
    includeGlobalEntry?: boolean;
    itemClassName?: string;
    includeLegacyItemClassName?: boolean;
    emptyText?: string;
    globalEntryTitle?: string;
    globalEntryMetaLine1?: string;
    globalEntryMetaLine2?: string;
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

    const [eventRow, factRow, worldStateRow, summaryRow, templateRow, auditRow, mutationHistoryRow] = await Promise.all([
        db.events.where('chatKey').equals(normalizedChatKey).first(),
        db.facts.where('[chatKey+updatedAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.world_state.where('[chatKey+path]').between([normalizedChatKey, ''], [normalizedChatKey, '\uffff']).first(),
        db.summaries.where('[chatKey+level+createdAt]').between([normalizedChatKey, '', 0], [normalizedChatKey, '\uffff', Infinity]).first(),
        db.templates.where('[chatKey+createdAt]').between([normalizedChatKey, 0], [normalizedChatKey, Infinity]).first(),
        db.audit.where('chatKey').equals(normalizedChatKey).first(),
        db.memory_mutation_history.where('chatKey').equals(normalizedChatKey).first(),
    ]);

    return Boolean(eventRow || factRow || worldStateRow || summaryRow || templateRow || auditRow || mutationHistoryRow);
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
    hostChatKeySet: Set<string>,
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
    const hostPresent = hostChatKeySet.has(chatKey) || (hostCanonicalKeySet.size > 0 && Boolean(canonicalKey) && hostCanonicalKeySet.has(canonicalKey));
    const hostMissing = (hostChatKeySet.size > 0 || hostCanonicalKeySet.size > 0) && !hostPresent;

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

/**
 * 功能：根据宿主聊天列表构建 chatKey/canonicalKey 集合。
 * @param hostChats 宿主聊天列表。
 * @returns 宿主 chatKey 集合与 canonicalKey 集合。
 */
function buildHostChatLookupSets(hostChats: unknown[]): { hostCanonicalKeySet: Set<string>; hostChatKeySet: Set<string> } {
    const hostCanonicalKeySet = new Set(
        (Array.isArray(hostChats) ? hostChats : [])
            .map((item: unknown): string => {
                const locator = (item as { locator?: Record<string, unknown> })?.locator;
                if (!locator || typeof locator !== 'object') {
                    return '';
                }
                const parsed = parseAnyTavernChatRefEvent(locator as any);
                return buildTavernChatEntityKeyEvent(parsed);
            })
            .filter(Boolean),
    );
    const hostChatKeySet = new Set(
        (Array.isArray(hostChats) ? hostChats : [])
            .map((item: unknown): string => {
                const locator = (item as { locator?: SdkTavernChatLocatorEvent })?.locator;
                if (!locator || typeof locator !== 'object') {
                    return '';
                }
                return String(buildTavernChatScopedKeyEvent(locator as SdkTavernChatLocatorEvent) || '').trim();
            })
            .filter(Boolean),
    );
    return { hostCanonicalKeySet, hostChatKeySet };
}

/**
 * 功能：判断聊天是否属于“宿主仍存在但被误判删除”的可恢复状态。
 * @param archived 当前插件状态是否已归档。
 * @param archiveReason 归档原因码。
 * @param hostPresent 宿主是否仍存在。
 * @returns 是否建议恢复归档状态。
 */
function shouldRecoverChatArchiveState(archived: boolean, archiveReason: string, hostPresent: boolean): boolean {
    if (!archived || !hostPresent) {
        return false;
    }
    const normalizedReason = String(archiveReason ?? '').trim().toLowerCase();
    if (!normalizedReason) {
        return false;
    }
    return normalizedReason.includes('orphaned') || normalizedReason.includes('host_deleted') || normalizedReason.includes('host_chat_deleted');
}

/**
 * 功能：按 canonicalKey 去重聊天项，优先保留当前激活项与较新记录。
 * @param items 原始聊天项列表。
 * @param activeChatKey 当前激活聊天键。
 * @returns 去重后的聊天项列表。
 */
function dedupeMemoryChatSidebarItems(items: MemoryChatSidebarItem[], activeChatKey: string): MemoryChatSidebarItem[] {
    const activeCanonicalKey = resolveChatItemCanonicalKey(activeChatKey);
    return Array.from(items.reduce((map: Map<string, MemoryChatSidebarItem>, item: MemoryChatSidebarItem) => {
        const dedupeKey = item.canonicalKey || item.chatKey;
        const existing = map.get(dedupeKey);
        if (!existing) {
            map.set(dedupeKey, item);
            return map;
        }

        const existingIsActive = Boolean(activeCanonicalKey) && existing.canonicalKey === activeCanonicalKey;
        const nextIsActive = Boolean(activeCanonicalKey) && item.canonicalKey === activeCanonicalKey;
        const nextCreatedAt = Number(item.createdAt ?? 0);
        const existingCreatedAt = Number(existing.createdAt ?? 0);
        const preferredItem = nextIsActive && !existingIsActive
            ? item
            : (nextCreatedAt > existingCreatedAt || (!existing.signal && item.signal) ? item : existing);
        const mergedHostPresent = existing.hostPresent || item.hostPresent;
        const mergedArchiveReason = preferredItem.archiveReason || existing.archiveReason || item.archiveReason;
        const mergedArchived = (existing.archived || item.archived)
            && !shouldRecoverChatArchiveState(existing.archived || item.archived, mergedArchiveReason, mergedHostPresent);
        const mergedItem: MemoryChatSidebarItem = {
            ...preferredItem,
            archived: mergedArchived,
            hostMissing: !mergedHostPresent && (existing.hostMissing || item.hostMissing),
            hostPresent: mergedHostPresent,
            hasMeaningfulData: existing.hasMeaningfulData || item.hasMeaningfulData,
            archiveReason: mergedArchived ? mergedArchiveReason : '',
            signal: preferredItem.signal || existing.signal || item.signal,
            deleted: mergedArchived || (!mergedHostPresent && (existing.hostMissing || item.hostMissing)),
            deletedReason: mergedArchived
                ? (mergedArchiveReason || 'host_chat_deleted')
                : ((!mergedHostPresent && (existing.hostMissing || item.hostMissing)) ? 'host_chat_deleted' : ''),
        };
        map.set(dedupeKey, mergedItem);
        return map;
    }, new Map<string, MemoryChatSidebarItem>()).values()).filter((item: MemoryChatSidebarItem): boolean => {
        return item.hostPresent || item.hasMeaningfulData || item.archived;
    });
}

/**
 * 功能：加载可复用的聊天侧栏列表数据（供记录编辑器与策略编辑器共用）。
 * @param options 加载选项。
 * @returns 聊天侧栏项列表。
 */
export async function loadMemoryChatSidebarItems(options: LoadMemoryChatSidebarItemsOptions = {}): Promise<MemoryChatSidebarItem[]> {
    const activeChatKey = String(options.activeChatKey ?? '').trim();
    const shouldRecoverArchived = options.recoverArchivedIfHostExists !== false;
    const [metaKeys, eventKeys, hostChats] = await Promise.all([
        db.meta.toCollection().primaryKeys(),
        db.events.orderBy('chatKey').uniqueKeys(),
        listTavernChatsForCurrentTavernEvent().catch((): unknown[] => []),
    ]);
    const allKeys = Array.from(
        new Set(
            [...metaKeys, ...eventKeys]
                .map((item: unknown): string => String(item ?? '').trim())
                .filter(Boolean),
        ),
    ) as string[];
    const { hostCanonicalKeySet, hostChatKeySet } = buildHostChatLookupSets(hostChats);
    const items = await Promise.all(allKeys.map(async (chatKey: string): Promise<MemoryChatSidebarItem> => {
        const signal = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey).then((row) => {
            const rawSignal = (row?.state as Record<string, unknown> | undefined)?.signals as Record<string, unknown> | undefined;
            const scoped = rawSignal?.[MEMORY_OS_PLUGIN_ID];
            return (scoped && typeof scoped === 'object') ? (scoped as Record<string, unknown>) : null;
        }).catch((): Record<string, unknown> | null => null);
        const [item, hasData] = await Promise.all([
            buildChatItemMeta(chatKey, signal, hostCanonicalKeySet, hostChatKeySet),
            hasMeaningfulChatContent(chatKey),
        ]);
        const hostPresent = hostChatKeySet.has(chatKey) || Boolean(item.canonicalKey && hostCanonicalKeySet.has(item.canonicalKey));
        const deleted = item.archived || item.hostMissing;
        const deletedReason = item.archiveReason || (item.hostMissing ? 'host_chat_deleted' : '');
        return {
            ...item,
            hostPresent,
            hasMeaningfulData: hasData,
            deleted,
            deletedReason,
        };
    }));

    if (shouldRecoverArchived) {
        const recoverableChatKeys = items
            .filter((item: MemoryChatSidebarItem): boolean => shouldRecoverChatArchiveState(item.archived, item.archiveReason, item.hostPresent))
            .map((item: MemoryChatSidebarItem): string => item.chatKey);
        if (recoverableChatKeys.length > 0) {
            await Promise.all(recoverableChatKeys.map((chatKey: string): Promise<void> => restoreArchivedMemoryChat(chatKey)));
            for (const item of items) {
                if (!recoverableChatKeys.includes(item.chatKey)) {
                    continue;
                }
                item.archived = false;
                item.archiveReason = '';
                item.deleted = item.hostMissing;
                item.deletedReason = item.hostMissing ? 'host_chat_deleted' : '';
            }
        }
    }

    return dedupeMemoryChatSidebarItems(items, activeChatKey)
        .sort((left: MemoryChatSidebarItem, right: MemoryChatSidebarItem): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
}

/**
 * 功能：把侧栏聊天项渲染为统一 HTML（支持记录编辑器与策略编辑器共用）。
 * @param items 聊天侧栏项列表。
 * @param options 渲染选项。
 * @returns 侧栏 HTML 字符串。
 */
export function buildMemoryChatSidebarListMarkup(items: MemoryChatSidebarItem[], options: RenderMemoryChatSidebarListOptions = {}): string {
    const activeChatKey = String(options.activeChatKey ?? '').trim();
    const itemClassName = String(options.itemClassName ?? '').trim();
    const includeLegacyItemClassName = options.includeLegacyItemClassName !== false;
    const classNameParts = [
        includeLegacyItemClassName ? 'stx-re-chat-item' : '',
        itemClassName,
    ].filter(Boolean);
    const mergedClassName = classNameParts.join(' ').trim();
    if (items.length === 0 && !options.includeGlobalEntry) {
        return `<div class="stx-re-empty">${escapeHtml(options.emptyText || '当前没有可用聊天。')}</div>`;
    }
    const activeCanonicalKey = resolveChatItemCanonicalKey(activeChatKey);
    const globalHtml = options.includeGlobalEntry
        ? `
            <div class="${mergedClassName}${activeChatKey ? '' : ' is-active'}" data-chat-key="">
                <div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-globe"></i></div>
                <div class="stx-re-chat-info">
                    <div class="stx-re-chat-name-wrap">
                        <div class="stx-re-chat-name">${escapeHtml(options.globalEntryTitle || '全局记录')}</div>
                    </div>
                    <div class="stx-re-chat-sys">${escapeHtml(options.globalEntryMetaLine1 || 'Database Root')}</div>
                    <div class="stx-re-chat-sys">${escapeHtml(options.globalEntryMetaLine2 || '仅原始库表可查看')}</div>
                </div>
            </div>
        `.trim()
        : '';
    const itemHtml = items.map((item: MemoryChatSidebarItem): string => {
        const isActive = item.chatKey === activeChatKey || (activeCanonicalKey && item.canonicalKey === activeCanonicalKey);
        const title = item.deleted
            ? `${item.systemName}\n${formatArchiveReasonLabel(item.deletedReason)}`
            : item.systemName;
        return `
            <div class="${mergedClassName}${isActive ? ' is-active' : ''}${item.deleted ? ' is-archived' : ''}" data-chat-key="${escapeHtml(item.chatKey)}" data-chat-canonical-key="${escapeHtml(item.canonicalKey)}" data-archived="${item.deleted ? 'true' : 'false'}" title="${escapeHtml(title)}">
                ${item.avatarHtml}
                <div class="stx-re-chat-info">
                    <div class="stx-re-chat-name-wrap">
                        <div class="stx-re-chat-name" title="${escapeHtml(item.displayName)}">${escapeHtml(item.displayName)}</div>
                        ${item.deleted ? '<span class="stx-re-chat-status-badge">已删除</span>' : ''}
                    </div>
                    <div class="stx-re-chat-sys" title="${escapeHtml(item.systemName)}">${escapeHtml(item.systemName)}</div>
                    <div class="stx-re-chat-sys">${escapeHtml(buildChatSummaryLabel(item.signal))}</div>
                    ${item.deleted ? `<div class="stx-re-chat-sys stx-re-chat-sys-status">${escapeHtml(formatArchiveReasonLabel(item.deletedReason))}</div>` : ''}
                    ${item.createdAt ? `<div class="stx-re-chat-time">${escapeHtml(formatTimeLabel(item.createdAt))}</div>` : ''}
                </div>
            </div>
        `.trim();
    }).join('');
    return `${globalHtml}${itemHtml}`;
}

/**
 * 功能：将聊天侧栏列表写入容器。
 * @param container 聊天侧栏容器。
 * @param items 聊天侧栏项列表。
 * @param options 渲染选项。
 * @returns 无返回值。
 */
export function renderMemoryChatSidebarList(container: HTMLElement, items: MemoryChatSidebarItem[], options: RenderMemoryChatSidebarListOptions = {}): void {
    container.innerHTML = buildMemoryChatSidebarListMarkup(items, options);
}

/**
 * 功能：同步聊天侧栏激活态。
 * @param container 聊天侧栏容器。
 * @param chatKey 当前激活聊天键。
 * @param selector 列表项选择器。
 * @returns 无返回值。
 */
export function activateMemoryChatSidebarItem(container: ParentNode, chatKey: string, selector: string = '.stx-re-chat-item'): void {
    const normalizedChatKey = String(chatKey ?? '').trim();
    const activeCanonicalKey = normalizedChatKey ? resolveChatItemCanonicalKey(normalizedChatKey) : '';
    container.querySelectorAll(selector).forEach((item: Element): void => {
        const element = item as HTMLElement;
        const itemChatKey = String(element.dataset.chatKey ?? '').trim();
        const itemCanonicalKey = String(element.dataset.chatCanonicalKey ?? '').trim();
        const isActive = !normalizedChatKey
            ? itemChatKey === ''
            : itemChatKey === normalizedChatKey || Boolean(activeCanonicalKey && itemCanonicalKey === activeCanonicalKey);
        element.classList.toggle('is-active', isActive);
    });
}

/**
 * 功能：按关键字过滤聊天侧栏列表项。
 * @param container 聊天侧栏容器。
 * @param keyword 关键字。
 * @param selector 列表项选择器。
 * @returns 无返回值。
 */
export function filterMemoryChatSidebarList(container: ParentNode, keyword: string, selector: string = '.stx-re-chat-item'): void {
    const normalizedKeyword = String(keyword ?? '').trim().toLowerCase();
    container.querySelectorAll(selector).forEach((item: Element): void => {
        const element = item as HTMLElement;
        const text = element.textContent?.toLowerCase() || '';
        element.hidden = Boolean(normalizedKeyword) && !text.includes(normalizedKeyword);
    });
}
