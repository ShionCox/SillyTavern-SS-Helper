import Dexie from 'dexie';
import {
    db,
    deleteSdkChatDocument,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    invalidateSdkChatDataCache,
    readSdkPluginChatState,
} from '../../../SDK/db';
import {
    buildTavernChatScopedKeyEvent,
    getTavernContextSnapshotEvent,
    listTavernChatsForCurrentScopeEvent,
    normalizeTavernChatIdEvent,
    parseAnyTavernChatRefEvent,
    withChatIdForScopeEvent,
} from '../../../SDK/tavern';
import { logger } from '../index';
import { archiveMemoryChat, clearMemoryChatData } from '../db/db';
import type { DeletionStrategy } from '../types';


const LLMHUB_PLUGIN_ID = 'stx_llmhub';
const MEMORYOS_PLUGIN_ID = 'stx_memory_os';
const ORPHAN_ARTIFACT_BOOTSTRAP_GRACE_MS = 2 * 60 * 1000;

function getManagedStatePluginIds(): string[] {
    return [MEMORYOS_PLUGIN_ID, LLMHUB_PLUGIN_ID];
}

function getManagedRecordPluginIds(): string[] {
    return [MEMORYOS_PLUGIN_ID];
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

    resolveCurrentScopeChatKey(chatIdRaw: unknown): string {
        const scope = getTavernContextSnapshotEvent();
        const normalizedChatId = normalizeTavernChatIdEvent(chatIdRaw, '');
        if (!scope || !normalizedChatId) {
            return '';
        }
        return buildTavernChatScopedKeyEvent(withChatIdForScopeEvent(scope, normalizedChatId));
    }

    async purgeDeletedChatFromHost(chatIdRaw: unknown, reason: string = 'host_deleted'): Promise<string | null> {
        const chatKey = this.resolveCurrentScopeChatKey(chatIdRaw);
        if (!chatKey) {
            logger.warn(`Host chat delete event could not resolve chatKey. payload=${String(chatIdRaw ?? '')}`);
            return null;
        }
        await this.applyChatDeletionLifecycle(chatKey, reason);
        return chatKey;
    }

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
            if (!Array.isArray(hostChats) || hostChats.length <= 0) {
                logger.info(`Skip reconcile because host chats are not ready. reason=${reason}`);
                return [];
            }
            const hostChatKeySet = new Set(
                (Array.isArray(hostChats) ? hostChats : [])
                    .map((item: any): string => buildTavernChatScopedKeyEvent(item.locator))
                    .filter(Boolean),
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
                await this.applyChatDeletionLifecycle(chatKey, `${reason}:orphaned`);
                purgedChatKeys.push(chatKey);
            }

            if (purgedChatKeys.length > 0) {
                logger.info(`Reconcile removed ${purgedChatKeys.length} orphan chats`, purgedChatKeys);
            }
            return purgedChatKeys;
        })().finally((): void => {
            this.reconcilePromise = null;
        });

        return this.reconcilePromise;
    }

    async applyChatDeletionLifecycle(chatKey: string, reason: string): Promise<void> {
        const normalizedChatKey = String(chatKey ?? '').trim();
        if (!normalizedChatKey || this.purgingChatKeys.has(normalizedChatKey)) {
            return;
        }

        this.purgingChatKeys.add(normalizedChatKey);
        try {
            const strategy = await this.resolveDeletionStrategy(normalizedChatKey);
            await this.flushRuntimeAndDetach(normalizedChatKey);
            await this.clearHostFacingSurfaces(normalizedChatKey);
            await this.clearLlmHubArtifacts(normalizedChatKey);
            if (strategy === 'immediate_purge') {
                await clearMemoryChatData(normalizedChatKey, { includeAudit: true });
            } else {
                await archiveMemoryChat(normalizedChatKey, reason || 'soft_delete');
            }
            await this.gcOrphanedArtifacts();
            invalidateSdkChatDataCache(normalizedChatKey);
            logger.info(`Deletion lifecycle completed chatKey=${normalizedChatKey}, strategy=${strategy}, reason=${reason}`);
        } catch (error) {
            logger.error(`Deletion lifecycle failed chatKey=${normalizedChatKey}, reason=${reason}`, error);
        } finally {
            this.purgingChatKeys.delete(normalizedChatKey);
        }
    }

    async gcOrphanedArtifacts(): Promise<void> {
        const hostChats = await listTavernChatsForCurrentScopeEvent().catch((): unknown[] => []);
        const hostChatKeySet = new Set(
            (Array.isArray(hostChats) ? hostChats : [])
                .map((item: any): string => buildTavernChatScopedKeyEvent(item.locator))
                .filter(Boolean),
        );
        const activeRuntimeChatKey = typeof (window as any)?.STX?.memory?.getChatKey === 'function'
            ? String((window as any).STX.memory.getChatKey() ?? '').trim()
            : '';
        const [managedStates, managedRecords, documents] = await Promise.all([
            db.chat_plugin_state.where('pluginId').anyOf(getManagedStatePluginIds()).toArray(),
            db.chat_plugin_records.where('pluginId').anyOf(getManagedRecordPluginIds()).toArray(),
            db.chat_documents.toArray(),
        ]);

        const documentSet = new Set(documents.map((row) => String(row.chatKey ?? '').trim()).filter(Boolean));
        const stateKeySet = new Set(
            managedStates
                .map((row) => `${String(row.pluginId ?? '').trim()}::${String(row.chatKey ?? '').trim()}`)
                .filter((value) => value !== '::'),
        );
        const candidateChatKeys = new Set<string>();
        for (const row of [...managedStates, ...managedRecords, ...documents]) {
            const chatKey = String((row as { chatKey?: unknown }).chatKey ?? '').trim();
            if (chatKey) {
                candidateChatKeys.add(chatKey);
            }
        }

        const coreExistsCache = new Map<string, boolean>();
        const hasCoreData = async (chatKey: string): Promise<boolean> => {
            if (coreExistsCache.has(chatKey)) {
                return coreExistsCache.get(chatKey) === true;
            }
            const [eventCount, factCount, worldStateCount, summaryCount, templateCount, metaExists, worldInfoCount, bindingCount] = await Promise.all([
                db.events.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).count(),
                db.facts.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).count(),
                db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).count(),
                db.summaries.where('[chatKey+level+createdAt]').between([chatKey, Dexie.minKey, Dexie.minKey], [chatKey, Dexie.maxKey, Dexie.maxKey]).count(),
                db.templates.where('[chatKey+createdAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).count(),
                db.meta.get(chatKey).then((row) => Boolean(row)),
                db.worldinfo_cache.where('chatKey').equals(chatKey).count(),
                db.template_bindings.where('chatKey').equals(chatKey).count(),
            ]);
            const exists = eventCount > 0
                || factCount > 0
                || worldStateCount > 0
                || summaryCount > 0
                || templateCount > 0
                || metaExists
                || worldInfoCount > 0
                || bindingCount > 0;
            coreExistsCache.set(chatKey, exists);
            return exists;
        };

        for (const chatKey of candidateChatKeys) {
            const [coreExists, hasDocument] = await Promise.all([
                hasCoreData(chatKey),
                Promise.resolve(documentSet.has(chatKey)),
            ]);
            if (!coreExists && !hasDocument) {
                const belongsToCurrentScope = isChatInCurrentScope(chatKey);
                const hostStillOwnsChat = belongsToCurrentScope && hostChatKeySet.has(chatKey);
                const isActiveRuntimeChat = Boolean(activeRuntimeChatKey) && activeRuntimeChatKey === chatKey;
                const freshestArtifactAt = Math.max(
                    0,
                    ...managedStates
                        .filter((row) => String(row.chatKey ?? '').trim() === chatKey)
                        .map((row) => Number(row.updatedAt ?? 0)),
                    ...managedRecords
                        .filter((row) => String(row.chatKey ?? '').trim() === chatKey)
                        .map((row) => Number(row.updatedAt ?? row.ts ?? 0)),
                );
                const isBootstrapGraceWindow = freshestArtifactAt > 0
                    && (Date.now() - freshestArtifactAt) <= ORPHAN_ARTIFACT_BOOTSTRAP_GRACE_MS;

                if (hostStillOwnsChat || isActiveRuntimeChat || isBootstrapGraceWindow) {
                    logger.info('[GC][SkipChatArtifacts]', {
                        chatKey,
                        reason: hostStillOwnsChat
                            ? 'host_chat_present'
                            : isActiveRuntimeChat
                                ? 'active_runtime_chat'
                                : 'bootstrap_grace_window',
                        freshestArtifactAt,
                        ageMs: freshestArtifactAt > 0 ? Date.now() - freshestArtifactAt : null,
                    });
                    continue;
                }

                await Promise.all([
                    deleteSdkPluginChatState(MEMORYOS_PLUGIN_ID, chatKey),
                    deleteSdkPluginChatRecords(MEMORYOS_PLUGIN_ID, chatKey),
                    deleteSdkPluginChatState(LLMHUB_PLUGIN_ID, chatKey),
                ]);
            }
        }

        for (const document of documents) {
            const chatKey = String(document.chatKey ?? '').trim();
            if (!chatKey) {
                continue;
            }
            const nextSignals = { ...(document.shared?.signals ?? {}) };
            let changed = false;
            for (const pluginId of getManagedStatePluginIds()) {
                const stateKey = `${pluginId}::${chatKey}`;
                if (!stateKeySet.has(stateKey) && Object.prototype.hasOwnProperty.call(nextSignals, pluginId)) {
                    delete nextSignals[pluginId];
                    changed = true;
                }
            }
            for (const pluginId of getManagedRecordPluginIds()) {
                const stateKey = `${pluginId}::${chatKey}`;
                if (!stateKeySet.has(stateKey)) {
                    await deleteSdkPluginChatRecords(pluginId, chatKey);
                }
            }
            if (changed) {
                await db.chat_documents.update(chatKey, {
                    shared: {
                        ...(document.shared ?? { labels: [], flags: {}, notes: '', signals: {} }),
                        signals: nextSignals,
                    },
                });
            }
        }
    }

    private async resolveDeletionStrategy(chatKey: string): Promise<DeletionStrategy> {
        const row = await readSdkPluginChatState(MEMORYOS_PLUGIN_ID, chatKey).catch(() => null);
        const state = (row?.state ?? {}) as Record<string, unknown>;
        const retentionPolicy = (state.retentionPolicy ?? {}) as Record<string, unknown>;
        const chatProfile = (state.chatProfile ?? {}) as Record<string, unknown>;
        const strategy = String(retentionPolicy.deletionStrategy ?? chatProfile.deletionStrategy ?? 'soft_delete').trim();
        return strategy === 'immediate_purge' ? 'immediate_purge' : 'soft_delete';
    }

    private async flushRuntimeAndDetach(chatKey: string): Promise<void> {
        const currentMemory = (window as any)?.STX?.memory;
        const isCurrentRuntimeChat = typeof currentMemory?.getChatKey === 'function'
            && String(currentMemory.getChatKey() ?? '').trim() === chatKey;

        if (!isCurrentRuntimeChat) {
            return;
        }

        try {
            await currentMemory?.chatState?.flush?.();
        } catch (error) {
            logger.warn(`Failed to flush runtime chat state before deletion. chatKey=${chatKey}`, error);
        }
        try {
            await currentMemory?.chatState?.destroy?.();
        } catch (error) {
            logger.warn(`Failed to destroy runtime chat state. chatKey=${chatKey}`, error);
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

    private async clearHostFacingSurfaces(chatKey: string): Promise<void> {
        const document = await db.chat_documents.get(chatKey);
        if (document?.shared?.signals) {
            const nextSignals = { ...(document.shared.signals ?? {}) };
            delete nextSignals[MEMORYOS_PLUGIN_ID];
            delete nextSignals[LLMHUB_PLUGIN_ID];
            await db.chat_documents.update(chatKey, {
                shared: {
                    ...document.shared,
                    signals: nextSignals,
                },
            });
        }
        await deleteSdkChatDocument(chatKey);
    }

    private async clearLlmHubArtifacts(chatKey: string): Promise<void> {
        await deleteSdkPluginChatState(LLMHUB_PLUGIN_ID, chatKey);
    }
}
