/**
 * 功能：本地内存向量存储实现。
 * 说明：使用余弦相似度进行向量搜索，数据持久化通过 vector-db 层完成。
 */

import type {
    VectorStoreAdapter,
    IndexedVectorDocument,
    VectorSearchQuery,
    VectorSearchHit,
} from '../../types/vector-search';

// ─── 余弦相似度 ──────────────────────────────

function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

function magnitude(v: number[]): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
        sum += v[i] * v[i];
    }
    return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) {
        return 0;
    }
    return dotProduct(a, b) / (magA * magB);
}

// ─── 存储条目 ──────────────────────────────

interface StoredVector {
    vectorDocId: string;
    chatKey: string;
    sourceKind: string;
    sourceId: string;
    vector: number[];
    dim: number;
}

// ─── 本地向量存储 ──────────────────────────────

/**
 * 功能：本地内存向量存储。
 * 说明：在进程内维护向量索引，支持余弦相似度搜索。
 *       启动时需从 vector-db 层加载持久化数据。
 */
export class LocalVectorStore implements VectorStoreAdapter {
    private store: Map<string, StoredVector> = new Map();

    /**
     * 功能：是否可用。
     */
    isAvailable(): boolean {
        return true;
    }

    /**
     * 功能：获取当前索引文档数量。
     */
    getDocumentCount(): number {
        return this.store.size;
    }

    /**
     * 功能：插入或更新文档。
     * @param docs 带向量的文档列表。
     */
    async upsertDocuments(docs: IndexedVectorDocument[]): Promise<void> {
        for (const doc of docs) {
            if (!doc.vectorDocId || !doc.vector || doc.vector.length === 0) {
                continue;
            }
            this.store.set(doc.vectorDocId, {
                vectorDocId: doc.vectorDocId,
                chatKey: doc.chatKey,
                sourceKind: doc.sourceKind,
                sourceId: doc.sourceId,
                vector: doc.vector,
                dim: doc.dim || doc.vector.length,
            });
        }
    }

    /**
     * 功能：按文档 ID 删除。
     * @param ids 文档 ID 列表。
     */
    async deleteByVectorDocIds(ids: string[]): Promise<void> {
        for (const id of ids) {
            this.store.delete(id);
        }
    }

    /**
     * 功能：按来源删除。
     * @param sourceKind 来源种类。
     * @param sourceIds 来源 ID 列表。
     */
    async deleteBySource(sourceKind: string, sourceIds: string[]): Promise<void> {
        const idSet = new Set(sourceIds);
        const toDelete: string[] = [];
        for (const [key, val] of this.store) {
            if (val.sourceKind === sourceKind && idSet.has(val.sourceId)) {
                toDelete.push(key);
            }
        }
        for (const key of toDelete) {
            this.store.delete(key);
        }
    }

    /**
     * 功能：向量搜索。
     * @param query 搜索查询。
     * @returns 命中列表。
     */
    async search(query: VectorSearchQuery): Promise<VectorSearchHit[]> {
        if (!query.vector || query.vector.length === 0) {
            return [];
        }

        const minScore = query.minScore ?? 0;
        const results: VectorSearchHit[] = [];

        for (const item of this.store.values()) {
            if (query.chatKey && item.chatKey !== query.chatKey) {
                continue;
            }
            if (item.vector.length !== query.vector.length) {
                continue;
            }
            const score = cosineSimilarity(query.vector, item.vector);
            if (score >= minScore) {
                results.push({
                    vectorDocId: item.vectorDocId,
                    sourceKind: item.sourceKind,
                    sourceId: item.sourceId,
                    score,
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, query.topK);
    }

    /**
     * 功能：全量重建索引。
     * @param docs 全部文档。
     */
    async rebuildAll(docs: IndexedVectorDocument[]): Promise<void> {
        this.store.clear();
        await this.upsertDocuments(docs);
    }

    /**
     * 功能：按聊天清空。
     * @param chatKey 聊天键。
     */
    async clearByChat(chatKey: string): Promise<void> {
        const toDelete: string[] = [];
        for (const [key, val] of this.store) {
            if (val.chatKey === chatKey) {
                toDelete.push(key);
            }
        }
        for (const key of toDelete) {
            this.store.delete(key);
        }
    }

    /**
     * 功能：清空全部数据。
     */
    clear(): void {
        this.store.clear();
    }
}
