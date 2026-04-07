/**
 * 功能：定义向量文档相关类型。
 */

/** 向量文档来源类别 */
export type VectorDocSourceKind = 'entry' | 'relationship' | 'actor' | 'summary';

/** 向量 embedding 状态 */
export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed';

/**
 * 功能：定义可向量化文档。
 */
export interface VectorDocument {
    /** 向量文档唯一 ID */
    vectorDocId: string;
    /** 来源种类 */
    sourceKind: VectorDocSourceKind;
    /** 来源业务 ID */
    sourceId: string;
    /** 聊天键 */
    chatKey: string;
    /** schema ID */
    schemaId: string;
    /** 标题 */
    title: string;
    /** 拼接后的可编码文本 */
    text: string;
    /** compareKey */
    compareKey?: string;
    /** 关联角色键 */
    actorKeys: string[];
    /** 关联关系键 */
    relationKeys: string[];
    /** 关联世界键 */
    worldKeys: string[];
    /** 关联地点键 */
    locationKey?: string;
    /** 更新时间戳 */
    updatedAt: number;
}

/**
 * 功能：定义数据库中的向量文档记录（含 embedding 状态）。
 */
export interface DBMemoryVectorDocument extends VectorDocument {
    /** embedding 模型标识 */
    embeddingModel?: string;
    /** embedding 版本 */
    embeddingVersion?: string;
    /** embedding 维度 */
    embeddingDim?: number;
    /** embedding 状态 */
    embeddingStatus: EmbeddingStatus;
    /** 上次失败原因 */
    lastError?: string;
}

/**
 * 功能：定义向量索引记录。
 */
export interface DBMemoryVectorIndex {
    /** 向量文档 ID */
    vectorDocId: string;
    /** 聊天键 */
    chatKey: string;
    /** 来源种类 */
    sourceKind: string;
    /** 来源业务 ID */
    sourceId: string;
    /** 维度 */
    dim: number;
    /** 模型标识 */
    model: string;
    /** 版本 */
    version: string;
    /** 向量值 */
    vector: number[];
    /** 更新时间戳 */
    updatedAt: number;
}

/**
 * 功能：定义向量召回统计记录。
 */
export interface DBMemoryVectorRecallStat {
    /** 向量文档 ID */
    vectorDocId: string;
    /** 召回次数 */
    recallCount: number;
    /** 上次召回时间 */
    lastRecalledAt: number;
    /** 上次召回模式 */
    lastRecallMode: 'vector_only' | 'hybrid';
}
