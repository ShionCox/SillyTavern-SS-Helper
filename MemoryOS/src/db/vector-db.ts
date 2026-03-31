/**
 * 功能：向量文档数据库访问层。
 * 说明：使用 SDK 的 chat_plugin_records 存储向量文档、索引和召回统计。
 */

import {
    appendSdkPluginChatRecord,
    deleteSdkPluginChatRecords,
    querySdkPluginChatRecords,
    db,
    type DBChatPluginRecord,
} from '../../../SDK/db';
import type {
    DBMemoryVectorDocument,
    DBMemoryVectorIndex,
    DBMemoryVectorRecallStat,
} from '../types/vector-document';

const PLUGIN_ID = 'stx_memory_os';
const COLLECTION_VECTOR_DOCS = 'vector_documents';
const COLLECTION_VECTOR_INDEX = 'vector_index';
const COLLECTION_VECTOR_RECALL = 'vector_recall_stats';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

// ─── 向量文档 CRUD ──────────────────────────────

/**
 * 功能：保存或更新向量文档记录。
 * @param chatKey 聊天键。
 * @param doc 向量文档。
 */
export async function saveVectorDocument(chatKey: string, doc: DBMemoryVectorDocument): Promise<void> {
    const key = normalizeText(chatKey);
    await deleteVectorDocumentById(key, doc.vectorDocId);
    await appendSdkPluginChatRecord(PLUGIN_ID, key, COLLECTION_VECTOR_DOCS, {
        recordId: doc.vectorDocId,
        payload: doc as unknown as Record<string, unknown>,
        ts: doc.updatedAt || Date.now(),
    });
}

/**
 * 功能：批量保存向量文档。
 * @param chatKey 聊天键。
 * @param docs 文档列表。
 */
export async function saveVectorDocuments(chatKey: string, docs: DBMemoryVectorDocument[]): Promise<void> {
    for (const doc of docs) {
        await saveVectorDocument(chatKey, doc);
    }
}

/**
 * 功能：读取聊天的所有向量文档。
 * @param chatKey 聊天键。
 * @returns 文档列表。
 */
export async function loadVectorDocuments(chatKey: string): Promise<DBMemoryVectorDocument[]> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_DOCS, {
        order: 'asc',
        limit: 10000,
    });
    const docMap = new Map<string, DBMemoryVectorDocument>();
    for (const row of rows) {
        const payload = row.payload as unknown as DBMemoryVectorDocument;
        if (payload && payload.vectorDocId) {
            docMap.set(payload.vectorDocId, payload);
        }
    }
    return Array.from(docMap.values());
}

/**
 * 功能：按来源查询向量文档。
 * @param chatKey 聊天键。
 * @param sourceKind 来源种类。
 * @param sourceIds 来源 ID 列表。
 * @returns 文档列表。
 */
export async function loadVectorDocumentsBySource(
    chatKey: string,
    sourceKind: string,
    sourceIds: string[],
): Promise<DBMemoryVectorDocument[]> {
    const all = await loadVectorDocuments(chatKey);
    if (sourceIds.length <= 0) {
        return all.filter((doc) => doc.sourceKind === sourceKind);
    }
    const idSet = new Set(sourceIds);
    return all.filter(
        (doc) => doc.sourceKind === sourceKind && idSet.has(doc.sourceId),
    );
}

/**
 * 功能：按 vectorDocId 删除文档。
 * @param chatKey 聊天键。
 * @param vectorDocId 文档 ID。
 */
export async function deleteVectorDocumentById(chatKey: string, vectorDocId: string): Promise<void> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_DOCS, {
        order: 'asc',
        limit: 10000,
    });
    const targetIds = rows
        .filter((row: DBChatPluginRecord) => normalizeText(row.recordId) === vectorDocId)
        .map((row: DBChatPluginRecord) => Number(row.id))
        .filter((id: number) => Number.isFinite(id));
    if (targetIds.length > 0) {
        await db.chat_plugin_records.bulkDelete(targetIds);
    }
}

/**
 * 功能：按来源删除向量文档。
 * @param chatKey 聊天键。
 * @param sourceKind 来源种类。
 * @param sourceIds 来源 ID 列表。
 */
export async function deleteVectorDocumentsBySource(
    chatKey: string,
    sourceKind: string,
    sourceIds: string[],
): Promise<void> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_DOCS, {
        order: 'asc',
        limit: 10000,
    });
    const targetIds = rows
        .filter((row: DBChatPluginRecord) => {
            const payload = row.payload as unknown as DBMemoryVectorDocument;
            if (!payload || payload.sourceKind !== sourceKind) {
                return false;
            }
            if (sourceIds.length <= 0) {
                return true;
            }
            return sourceIds.includes(payload.sourceId);
        })
        .map((row: DBChatPluginRecord) => Number(row.id))
        .filter((id: number) => Number.isFinite(id));
    if (targetIds.length > 0) {
        await db.chat_plugin_records.bulkDelete(targetIds);
    }
}

/**
 * 功能：清空聊天的所有向量文档。
 * @param chatKey 聊天键。
 */
export async function clearVectorDocumentsForChat(chatKey: string): Promise<void> {
    await deleteSdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_DOCS);
}

// ─── 向量索引 CRUD ──────────────────────────────

/**
 * 功能：保存或更新向量索引。
 * @param chatKey 聊天键。
 * @param record 索引记录。
 */
export async function saveVectorIndex(chatKey: string, record: DBMemoryVectorIndex): Promise<void> {
    const key = normalizeText(chatKey);
    await deleteVectorIndexById(key, record.vectorDocId);
    await appendSdkPluginChatRecord(PLUGIN_ID, key, COLLECTION_VECTOR_INDEX, {
        recordId: record.vectorDocId,
        payload: record as unknown as Record<string, unknown>,
        ts: record.updatedAt || Date.now(),
    });
}

/**
 * 功能：批量保存向量索引。
 * @param chatKey 聊天键。
 * @param records 索引记录列表。
 */
export async function saveVectorIndexBatch(chatKey: string, records: DBMemoryVectorIndex[]): Promise<void> {
    for (const record of records) {
        await saveVectorIndex(chatKey, record);
    }
}

/**
 * 功能：读取聊天的所有向量索引。
 * @param chatKey 聊天键。
 * @returns 索引记录列表。
 */
export async function loadVectorIndexRecords(chatKey: string): Promise<DBMemoryVectorIndex[]> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_INDEX, {
        order: 'asc',
        limit: 10000,
    });
    const indexMap = new Map<string, DBMemoryVectorIndex>();
    for (const row of rows) {
        const payload = row.payload as unknown as DBMemoryVectorIndex;
        if (payload && payload.vectorDocId) {
            indexMap.set(payload.vectorDocId, payload);
        }
    }
    return Array.from(indexMap.values());
}

/**
 * 功能：按 vectorDocId 删除向量索引。
 * @param chatKey 聊天键。
 * @param vectorDocId 文档 ID。
 */
export async function deleteVectorIndexById(chatKey: string, vectorDocId: string): Promise<void> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_INDEX, {
        order: 'asc',
        limit: 10000,
    });
    const targetIds = rows
        .filter((row: DBChatPluginRecord) => normalizeText(row.recordId) === vectorDocId)
        .map((row: DBChatPluginRecord) => Number(row.id))
        .filter((id: number) => Number.isFinite(id));
    if (targetIds.length > 0) {
        await db.chat_plugin_records.bulkDelete(targetIds);
    }
}

/**
 * 功能：按来源删除向量索引。
 * @param chatKey 聊天键。
 * @param sourceKind 来源种类。
 * @param sourceIds 来源 ID 列表。
 */
export async function deleteVectorIndexBySource(
    chatKey: string,
    sourceKind: string,
    sourceIds: string[],
): Promise<void> {
    const rows = await loadVectorIndexRecords(chatKey);
    const docIds = rows
        .filter((row: DBMemoryVectorIndex) => {
            if (row.sourceKind !== sourceKind) {
                return false;
            }
            if (sourceIds.length <= 0) {
                return true;
            }
            return sourceIds.includes(row.sourceId);
        })
        .map((row: DBMemoryVectorIndex) => row.vectorDocId);
    for (const docId of docIds) {
        await deleteVectorIndexById(chatKey, docId);
    }
}

/**
 * 功能：清空聊天的所有向量索引。
 * @param chatKey 聊天键。
 */
export async function clearVectorIndexForChat(chatKey: string): Promise<void> {
    await deleteSdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_INDEX);
}

// ─── 向量召回统计 CRUD ──────────────────────────────

/**
 * 功能：保存向量召回统计。
 * @param chatKey 聊天键。
 * @param stat 统计记录。
 */
export async function saveVectorRecallStat(chatKey: string, stat: DBMemoryVectorRecallStat): Promise<void> {
    const key = normalizeText(chatKey);
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, key, COLLECTION_VECTOR_RECALL, {
        order: 'asc',
        limit: 10000,
    });
    const existing = rows.filter(
        (row: DBChatPluginRecord) => normalizeText(row.recordId) === stat.vectorDocId,
    );
    if (existing.length > 0) {
        const ids = existing.map((r: DBChatPluginRecord) => Number(r.id)).filter((id: number) => Number.isFinite(id));
        if (ids.length > 0) {
            await db.chat_plugin_records.bulkDelete(ids);
        }
    }
    await appendSdkPluginChatRecord(PLUGIN_ID, key, COLLECTION_VECTOR_RECALL, {
        recordId: stat.vectorDocId,
        payload: stat as unknown as Record<string, unknown>,
        ts: stat.lastRecalledAt || Date.now(),
    });
}

/**
 * 功能：读取聊天的所有向量召回统计。
 * @param chatKey 聊天键。
 * @returns 统计记录列表。
 */
export async function loadVectorRecallStats(chatKey: string): Promise<DBMemoryVectorRecallStat[]> {
    const rows = await querySdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_RECALL, {
        order: 'asc',
        limit: 10000,
    });
    const statMap = new Map<string, DBMemoryVectorRecallStat>();
    for (const row of rows) {
        const payload = row.payload as unknown as DBMemoryVectorRecallStat;
        if (payload && payload.vectorDocId) {
            statMap.set(payload.vectorDocId, payload);
        }
    }
    return Array.from(statMap.values());
}

/**
 * 功能：清空聊天的所有向量召回统计。
 * @param chatKey 聊天键。
 */
export async function clearVectorRecallStatsForChat(chatKey: string): Promise<void> {
    await deleteSdkPluginChatRecords(PLUGIN_ID, normalizeText(chatKey), COLLECTION_VECTOR_RECALL);
}

// ─── 统一清空 ──────────────────────────────

/**
 * 功能：清空聊天的所有向量数据（文档+索引+统计）。
 * @param chatKey 聊天键。
 */
export async function clearAllVectorDataForChat(chatKey: string): Promise<void> {
    await clearVectorDocumentsForChat(chatKey);
    await clearVectorIndexForChat(chatKey);
    await clearVectorRecallStatsForChat(chatKey);
}
