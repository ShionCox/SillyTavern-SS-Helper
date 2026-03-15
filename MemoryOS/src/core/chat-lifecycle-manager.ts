import {
    db,
    deleteSdkChatDocument,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    invalidateSdkChatDataCache,
} from '../../../SDK/db';
import {
    buildTavernChatScopedKeyEvent,
    getTavernContextSnapshotEvent,
    listTavernChatsForCurrentScopeEvent,
    normalizeTavernChatIdEvent,
    parseAnyTavernChatRefEvent,
    withChatIdForScopeEvent,
} from '../../../SDK/tavern';
import { Logger } from '../../../SDK/logger';
import { clearMemoryChatData } from '../db/db';

const logger = new Logger('记忆聊天生命周期');

const LLMHUB_PLUGIN_ID = 'stx_llmhub';
const MEMORYOS_PLUGIN_ID = 'stx_memory_os';

type ManagedPluginId = typeof LLMHUB_PLUGIN_ID | typeof MEMORYOS_PLUGIN_ID;

function getManagedPluginIds(): ManagedPluginId[] {
    return [MEMORYOS_PLUGIN_ID, LLMHUB_PLUGIN_ID];
}

function buildCurrentScopeEntityKey(): string {
    const scope = getTavernContextSnapshotEvent();
    if (!scope) {
        return '';
    }
    return `${scope.tavernInstanceId}::${scope.scopeType}::${scope.scopeId}`;
}

function isChatInCurrentScope(chatKey: string): boolean {
    const scope = getTavernContextSnapshotEvent();
    if (!scope) {
        return false;
    }
    const ref = parseAnyTavernChatRefEvent(chatKey, {
        tavernInstanceId: String(scope.tavernInstanceId ?? '').trim(),
        scopeType: scope.scopeType,
        scopeId: String(scope.scopeId ?? '').trim(),
    });
    return (
        String(ref.tavernInstanceId ?? '').trim() === String(scope.tavernInstanceId ?? '').trim()
        && ref.scopeType === scope.scopeType
        && String(ref.scopeId ?? '').trim() === String(scope.scopeId ?? '').trim()
    );
}

export class ChatLifecycleManager {
    private purgingChatKeys = new Set<string>();
    private reconcilePromise: Promise<string[]> | null = null;

    /**
     * 功能：根据当前宿主作用域与删除事件 payload 反推出 chatKey。
     * @param chatIdRaw 宿主事件传入的 chatId / 文件名。
     * @returns 结构化 chatKey，无法解析时返回空字符串。
     */
    resolveCurrentScopeChatKey(chatIdRaw: unknown): string {
        const scope = getTavernContextSnapshotEvent();
        const normalizedChatId = normalizeTavernChatIdEvent(chatIdRaw, '');
        if (!scope || !normalizedChatId) {
            return '';
        }
        return buildTavernChatScopedKeyEvent(withChatIdForScopeEvent(scope, normalizedChatId));
    }

    /**
     * 功能：处理宿主发出的聊天删除事件，执行 MemoryOS / LLMHub 清理闭环。
     * @param chatIdRaw 被删除聊天的宿主 chatId。
     * @param reason 清理原因。
     * @returns 实际清理的 chatKey；未命中时返回 null。
     */
    async purgeDeletedChatFromHost(chatIdRaw: unknown, reason: string = 'host_deleted'): Promise<string | null> {
        const chatKey = this.resolveCurrentScopeChatKey(chatIdRaw);
        if (!chatKey) {
            logger.warn(`宿主删除事件未能解析 chatKey, payload=${String(chatIdRaw ?? '')}`);
            return null;
        }
        await this.purgeChatKey(chatKey, reason);
        return chatKey;
    }

    /**
     * 功能：按当前作用域对账宿主聊天列表与本地缓存，清理已失联聊天。
     * @param reason 触发原因。
     * @returns 被清理的 chatKey 列表。
     */
    async reconcileCurrentScope(reason: string = 'host_scope_reconcile'): Promise<string[]> {
        if (this.reconcilePromise) {
            return this.reconcilePromise;
        }

        this.reconcilePromise = (async (): Promise<string[]> => {
            const entityKey = buildCurrentScopeEntityKey();
            if (!entityKey) {
                return [];
            }

            const hostChats = await listTavernChatsForCurrentScopeEvent().catch((): unknown[] => []);
            const hostChatKeySet = new Set(
                (Array.isArray(hostChats) ? hostChats : [])
                    .map((item: any): string => buildTavernChatScopedKeyEvent(item.locator))
                    .filter(Boolean)
            );

            const [documents, memoryStates, llmStates] = await Promise.all([
                db.chat_documents.where('entityKey').equals(entityKey).toArray(),
                db.chat_plugin_state.where('pluginId').equals(MEMORYOS_PLUGIN_ID).toArray(),
                db.chat_plugin_state.where('pluginId').equals(LLMHUB_PLUGIN_ID).toArray(),
            ]);

            const candidateChatKeys = new Set<string>();
            for (const row of documents) {
                const chatKey = String(row?.chatKey ?? '').trim();
                if (chatKey) {
                    candidateChatKeys.add(chatKey);
                }
            }
            for (const row of [...memoryStates, ...llmStates]) {
                const chatKey = String(row?.chatKey ?? '').trim();
                if (!chatKey || !isChatInCurrentScope(chatKey)) {
                    continue;
                }
                candidateChatKeys.add(chatKey);
            }

            const purgedChatKeys: string[] = [];
            for (const chatKey of candidateChatKeys) {
                if (hostChatKeySet.has(chatKey)) {
                    continue;
                }
                await this.purgeChatKey(chatKey, `${reason}:orphaned`);
                purgedChatKeys.push(chatKey);
            }

            if (purgedChatKeys.length > 0) {
                logger.info(`已对账清理 ${purgedChatKeys.length} 个失联聊天`, purgedChatKeys);
            }
            return purgedChatKeys;
        })().finally((): void => {
            this.reconcilePromise = null;
        });

        return this.reconcilePromise;
    }

    private async purgeChatKey(chatKey: string, reason: string): Promise<void> {
        const normalizedChatKey = String(chatKey ?? '').trim();
        if (!normalizedChatKey || this.purgingChatKeys.has(normalizedChatKey)) {
            return;
        }

        this.purgingChatKeys.add(normalizedChatKey);
        try {
            const currentMemory = (window as any)?.STX?.memory;
            const isCurrentRuntimeChat = typeof currentMemory?.getChatKey === 'function'
                && String(currentMemory.getChatKey() ?? '').trim() === normalizedChatKey;

            if (isCurrentRuntimeChat) {
                try {
                    await currentMemory?.chatState?.destroy?.();
                } catch (error) {
                    logger.warn(`销毁当前聊天 runtime 失败 chatKey=${normalizedChatKey}`, error);
                }
                try {
                    currentMemory?.template?.destroy?.();
                } catch {
                    // noop
                }
                if ((window as any)?.STX?.memory === currentMemory) {
                    (window as any).STX.memory = null;
                }
            }

            await clearMemoryChatData(normalizedChatKey, { includeAudit: true });
            await Promise.all([
                deleteSdkPluginChatState(LLMHUB_PLUGIN_ID, normalizedChatKey),
                deleteSdkPluginChatRecords(LLMHUB_PLUGIN_ID, normalizedChatKey),
                deleteSdkChatDocument(normalizedChatKey),
            ]);
            invalidateSdkChatDataCache(normalizedChatKey);
            logger.info(`聊天删除闭环清理完成 chatKey=${normalizedChatKey}, reason=${reason}`);
        } catch (error) {
            logger.error(`聊天删除闭环清理失败 chatKey=${normalizedChatKey}, reason=${reason}`, error);
        } finally {
            this.purgingChatKeys.delete(normalizedChatKey);
        }
    }
}