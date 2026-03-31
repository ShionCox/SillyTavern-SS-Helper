/**
 * 功能：定义向量搜索相关类型。
 */

/**
 * 功能：带向量的索引文档（upsert 用）。
 */
export interface IndexedVectorDocument {
    /** 向量文档 ID */
    vectorDocId: string;
    /** 聊天键 */
    chatKey: string;
    /** 来源种类 */
    sourceKind: string;
    /** 来源业务 ID */
    sourceId: string;
    /** 向量值 */
    vector: number[];
    /** 维度 */
    dim: number;
    /** 向量文本（用于调试） */
    text?: string;
}

/**
 * 功能：向量搜索查询。
 */
export interface VectorSearchQuery {
    /** 查询向量 */
    vector: number[];
    /** 最大返回数量 */
    topK: number;
    /** 聊天键限定 */
    chatKey?: string;
    /** 最低相似度阈值 */
    minScore?: number;
}

/**
 * 功能：向量搜索命中项。
 */
export interface VectorSearchHit {
    /** 向量文档 ID */
    vectorDocId: string;
    /** 来源种类 */
    sourceKind: string;
    /** 来源业务 ID */
    sourceId: string;
    /** 余弦相似度分数 */
    score: number;
}

/**
 * 功能：向量存储适配器接口。
 */
export interface VectorStoreAdapter {
    /** 插入或更新文档 */
    upsertDocuments(docs: IndexedVectorDocument[]): Promise<void>;
    /** 按文档 ID 删除 */
    deleteByVectorDocIds(ids: string[]): Promise<void>;
    /** 按来源删除 */
    deleteBySource(sourceKind: string, sourceIds: string[]): Promise<void>;
    /** 向量搜索 */
    search(query: VectorSearchQuery): Promise<VectorSearchHit[]>;
    /** 全量重建 */
    rebuildAll(docs: IndexedVectorDocument[]): Promise<void>;
    /** 按聊天清空 */
    clearByChat(chatKey: string): Promise<void>;
    /** 是否可用 */
    isAvailable(): boolean;
}
