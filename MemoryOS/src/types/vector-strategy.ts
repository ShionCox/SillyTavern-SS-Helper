/**
 * 功能：定义向量策略路由相关类型。
 */

/** 向量策略路由决策 */
export type VectorRouteKind = 'fast_vector' | 'deep_vector';

/**
 * 功能：向量策略路由决策。
 */
export interface VectorStrategyDecision {
    /** 路由结果 */
    route: VectorRouteKind;
    /** 候选窗口大小 */
    candidateWindow: number;
    /** 最终 topK */
    finalTopK: number;
    /** 是否启用 rerank */
    rerankEnabled: boolean;
    /** 原因码 */
    reasonCodes: string[];
}

/**
 * 功能：向量策略路由输入。
 */
export interface VectorStrategyInput {
    /** 查询文本 */
    query: string;
    /** 合并后的上下文文本 */
    mergedContextText?: string;
    /** 检索模式 */
    retrievalMode: 'vector_only' | 'hybrid';
    /** 角色锚点 */
    actorAnchorKeys?: string[];
    /** 关系锚点 */
    relationAnchorKeys?: string[];
    /** 世界锚点 */
    worldAnchorKeys?: string[];
    /** 预期 facets */
    expectedFacets?: string[];
    /** 语境路由置信度 */
    routeConfidence?: number;
}
