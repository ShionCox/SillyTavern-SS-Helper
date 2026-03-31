/**
 * 功能：向量存储适配层。
 * 说明：管理 LocalVectorStore 实例，并将变更同步到 vector-db 持久化层。
 */

import type { IndexedVectorDocument, VectorSearchQuery, VectorSearchHit } from '../types/vector-search';
import type { DBMemoryVectorIndex } from '../types/vector-document';
import { LocalVectorStore } from './vector-stores/local-vector-store';
import {
    saveVectorIndex,
    saveVectorIndexBatch,
    loadVectorIndexRecords,
    deleteVectorIndexById,
    clearVectorIndexForChat,
} from '../db/vector-db';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：向量存储适配器服务。
 * 说明：封装 LocalVectorStore + 持久化。
 */
export class VectorStoreAdapterService {
    private readonly localStore: LocalVectorStore;
    private readonly loadedChats: Set<string> = new Set();

    constructor(localStore?: LocalVectorStore) {
        this.localStore = localStore ?? new LocalVectorStore();
    }

    /**
     * 功能：是否可用。
     */
    isAvailable(): boolean {
        return this.localStore.isAvailable();
    }

    /**
     * 功能：获取内部 LocalVectorStore（用于测试）。
     */
    getLocalStore(): LocalVectorStore {
        return this.localStore;
    }

    /**
     * 功能：确保指定聊天的向量索引已加载到内存。
     * @param chatKey 聊天键。
     */
    async ensureLoaded(chatKey: string): Promise<void> {
        if (this.loadedChats.has(chatKey)) {
            return;
        }
        try {
            const records = await loadVectorIndexRecords(chatKey);
            if (records.length > 0) {
                const docs: IndexedVectorDocument[] = records.map((r) => ({
                    vectorDocId: r.vectorDocId,
                    chatKey: r.chatKey,
                    sourceKind: '',
                    sourceId: '',
                    vector: r.vector,
                    dim: r.dim,
                }));
                await this.localStore.upsertDocuments(docs);
                logger.info(`[VectorStore] 已从持久化加载 ${records.length} 条向量索引 (chat=${chatKey})`);
            }
        } catch (err) {
            logger.warn(`[VectorStore] 加载聊天 ${chatKey} 的向量索引失败: ${err instanceof Error ? err.message : String(err)}`);
        }
        this.loadedChats.add(chatKey);
    }

    /**
     * 功能：插入或更新文档（内存+持久化）。
     * @param chatKey 聊天键。
     * @param docs 带向量的文档列表。
     * @param modelInfo 模型信息。
     */
    async upsertDocuments(
        chatKey: string,
        docs: IndexedVectorDocument[],
        modelInfo: { model: string; version: string },
    ): Promise<void> {
        await this.localStore.upsertDocuments(docs);

        const dbRecords: DBMemoryVectorIndex[] = docs.map((doc) => ({
            vectorDocId: doc.vectorDocId,
            chatKey: doc.chatKey || chatKey,
            dim: doc.dim || doc.vector.length,
            model: modelInfo.model,
            version: modelInfo.version,
            vector: doc.vector,
            updatedAt: Date.now(),
        }));
        await saveVectorIndexBatch(chatKey, dbRecords);
    }

    /**
     * 功能：按文档 ID 删除（内存+持久化）。
     * @param chatKey 聊天键。
     * @param ids 文档 ID 列表。
     */
    async deleteByVectorDocIds(chatKey: string, ids: string[]): Promise<void> {
        await this.localStore.deleteByVectorDocIds(ids);
        for (const id of ids) {
            await deleteVectorIndexById(chatKey, id);
        }
    }

    /**
     * 功能：按来源删除（内存+持久化）。
     * @param chatKey 聊天键。
     * @param sourceKind 来源种类。
     * @param sourceIds 来源 ID 列表。
     */
    async deleteBySource(chatKey: string, sourceKind: string, sourceIds: string[]): Promise<void> {
        await this.localStore.deleteBySource(sourceKind, sourceIds);
        // 持久化层的删除需要先查到 vectorDocId
        const { deleteVectorIndexBySource } = await import('../db/vector-db');
        await deleteVectorIndexBySource(chatKey, sourceKind, sourceIds);
    }

    /**
     * 功能：向量搜索。
     * @param chatKey 聊天键（确保已加载）。
     * @param query 搜索查询。
     * @returns 命中列表。
     */
    async search(chatKey: string, query: VectorSearchQuery): Promise<VectorSearchHit[]> {
        await this.ensureLoaded(chatKey);
        return this.localStore.search({ ...query, chatKey });
    }

    /**
     * 功能：全量重建（内存+持久化）。
     * @param chatKey 聊天键。
     * @param docs 全部文档。
     * @param modelInfo 模型信息。
     */
    async rebuildAll(
        chatKey: string,
        docs: IndexedVectorDocument[],
        modelInfo: { model: string; version: string },
    ): Promise<void> {
        await this.localStore.clearByChat(chatKey);
        await clearVectorIndexForChat(chatKey);
        await this.upsertDocuments(chatKey, docs, modelInfo);
        this.loadedChats.add(chatKey);
    }

    /**
     * 功能：按聊天清空（内存+持久化）。
     * @param chatKey 聊天键。
     */
    async clearByChat(chatKey: string): Promise<void> {
        await this.localStore.clearByChat(chatKey);
        await clearVectorIndexForChat(chatKey);
        this.loadedChats.delete(chatKey);
    }

    /**
     * 功能：获取内存中的文档数量。
     */
    getDocumentCount(): number {
        return this.localStore.getDocumentCount();
    }
}
