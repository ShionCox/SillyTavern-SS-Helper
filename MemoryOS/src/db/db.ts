import Dexie from 'dexie';
import {
    db,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    patchSdkChatShared,
} from '../../../SDK/db';
import type {
    ChatSharedPatch,
    DBAudit,
    DBEvent,
    DBFact,
    DBMeta,
    DBSummary,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunk,
    DBVectorEmbedding,
    DBVectorMeta,
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
    DBMeta,
    DBSummary,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunk,
    DBVectorEmbedding,
    DBVectorMeta,
    DBWorldInfoCache,
    DBWorldState,
};
export { SSHelperDatabase as MemoryOSDatabase };

export interface ClearMemoryChatDataOptions {
    includeAudit?: boolean;
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
            db.vector_chunks,
            db.vector_embeddings,
            db.vector_meta,
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
            db.vector_chunks,
            db.vector_embeddings,
            db.vector_meta,
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
            db.vector_chunks.where('chatKey').equals(chatKey).delete(),
            db.vector_embeddings.where('chatKey').equals(chatKey).delete(),
            db.vector_meta.where('chatKey').equals(chatKey).delete(),
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
            db.vector_chunks,
            db.vector_embeddings,
            db.vector_meta,
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
                db.vector_chunks.clear(),
                db.vector_embeddings.clear(),
                db.vector_meta.clear(),
                db.chat_plugin_state.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
                db.chat_plugin_records.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
            ]);
        },
    );
}
