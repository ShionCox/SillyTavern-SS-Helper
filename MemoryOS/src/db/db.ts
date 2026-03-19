import Dexie from 'dexie';
import {
    db,
    readSdkPluginChatState,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    patchSdkChatShared,
    writeSdkPluginChatState,
} from '../../../SDK/db';
import type {
    ChatSharedPatch,
    DBAudit,
    DBEvent,
    DBFact,
    DBFactProvenance,
    DBDerivationSource,
    DBMeta,
    DBSummary,
    DBSummarySource,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunkMetadata,
    DBMemoryCard,
    DBMemoryCardEmbedding,
    DBMemoryCardMeta,
    DBRelationshipMemory,
    DBMemoryMutationHistory,
    DBMemoryRecallLog,
    DBWorldInfoCache,
    DBWorldState,
} from '../../../SDK/db';
import { SSHelperDatabase } from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

export { db, patchSdkChatShared };
export type {
    ChatSharedPatch,
    DBAudit,
    DBEvent,
    DBFact,
    DBFactProvenance,
    DBDerivationSource,
    DBMeta,
    DBSummary,
    DBSummarySource,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunkMetadata,
    DBMemoryCard,
    DBMemoryCardEmbedding,
    DBMemoryCardMeta,
    DBRelationshipMemory,
    DBMemoryMutationHistory,
    DBMemoryRecallLog,
    DBWorldInfoCache,
    DBWorldState,
};
export { SSHelperDatabase as MemoryOSDatabase };

export interface ClearMemoryChatDataOptions {
    includeAudit?: boolean;
}

/**
 * 功能：将指定聊天的 MemoryOS 状态标记为归档。
 * 参数：
 *   chatKey (string)：聊天键。
 *   reason (string)：归档原因。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function archiveMemoryChat(chatKey: string, reason: string = 'soft_delete'): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = (row?.state ?? {}) as Record<string, unknown>;
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: true,
        archivedAt: Date.now(),
        archiveReason: reason,
    });
}

/**
 * 功能：恢复指定聊天的归档状态。
 * 参数：
 *   chatKey (string)：聊天键。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function restoreArchivedMemoryChat(chatKey: string): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = (row?.state ?? {}) as Record<string, unknown>;
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
    });
}

/**
 * 功能：执行聊天级立即清理。
 * 参数：
 *   chatKey (string)：聊天键。
 *   options ({ includeAudit?: boolean })：是否连审计一起删除。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function purgeMemoryChat(
    chatKey: string,
    options: { includeAudit?: boolean } = {},
): Promise<void> {
    await clearMemoryChatData(chatKey, {
        includeAudit: options.includeAudit ?? false,
    });
}

/**
 * 功能：清空指定聊天下的 MemoryOS 数据，并同步删除插件级状态与记录。
 *
 * 参数：
 *   chatKey (string)：要清理的聊天键。
 *   options (ClearMemoryChatDataOptions)：清理选项，可控制是否保留审计记录。
 *
 * 返回：
 *   Promise<void>：清理完成后结束。
 */
export async function clearMemoryChatData(
    chatKey: string,
    options: ClearMemoryChatDataOptions = {},
): Promise<void> {
    const includeAudit = options.includeAudit ?? true;
    const writableTables = includeAudit
        ? [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.audit,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
        ]
        : [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
        ];

    await db.transaction('rw', writableTables, async (): Promise<void> => {
        const deleteTasks: Array<Promise<unknown>> = [
            db.events
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.facts
                .where('[chatKey+updatedAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.world_state
                .where('[chatKey+path]')
                .between([chatKey, ''], [chatKey, '\uffff'])
                .delete(),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([chatKey, '', Dexie.minKey], [chatKey, '\uffff', Dexie.maxKey])
                .delete(),
            db.templates
                .where('[chatKey+createdAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.meta.delete(chatKey),
            db.worldinfo_cache.where('chatKey').equals(chatKey).delete(),
            db.template_bindings.where('chatKey').equals(chatKey).delete(),
            db.memory_cards.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.memory_card_embeddings.where('chatKey').equals(chatKey).delete(),
            db.memory_card_meta.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.relationship_memory
                .where('[chatKey+updatedAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.memory_recall_log
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.memory_mutation_history
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
        ];

        if (includeAudit) {
            deleteTasks.push(db.audit.where('chatKey').equals(chatKey).delete());
        }

        await Promise.all(deleteTasks);
    });

    await Promise.all([
        deleteSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey),
        deleteSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, chatKey),
        patchSdkChatShared(chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: {
                    activeTemplate: null,
                    eventCount: 0,
                    factCount: 0,
                    lastSummaryAt: null,
                },
            },
        }),
    ]);
    const chatData = await db.chat_documents.get(chatKey);
    if (chatData?.shared?.signals?.[MEMORY_OS_PLUGIN_ID]) {
        const nextSignals = { ...(chatData.shared.signals ?? {}) };
        delete nextSignals[MEMORY_OS_PLUGIN_ID];
        await db.chat_documents.update(chatKey, {
            shared: {
                ...chatData.shared,
                signals: nextSignals,
            },
        } as unknown as ChatSharedPatch);
    }
}

/**
 * 功能：清空整个 MemoryOS 数据分区，用于彻底重置或重建。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   Promise<void>：清理完成后结束。
 */
export async function clearAllMemoryData(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.audit,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
            db.chat_plugin_state,
            db.chat_plugin_records,
        ],
        async (): Promise<void> => {
            await Promise.all([
                db.events.clear(),
                db.facts.clear(),
                db.world_state.clear(),
                db.summaries.clear(),
                db.templates.clear(),
                db.audit.clear(),
                db.meta.clear(),
                db.worldinfo_cache.clear(),
                db.template_bindings.clear(),
                db.memory_cards.clear(),
                db.memory_card_embeddings.clear(),
                db.memory_card_meta.clear(),
                db.relationship_memory.clear(),
                db.memory_recall_log.clear(),
                db.memory_mutation_history.clear(),
                db.chat_plugin_state.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
                db.chat_plugin_records.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
            ]);
        },
    );
}
