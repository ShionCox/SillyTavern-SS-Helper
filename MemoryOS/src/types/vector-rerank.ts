/**
 * 功能：定义向量重排序相关类型。
 */

import type { RetrievalResultItem } from '../memory-retrieval/types';

/**
 * 功能：重排序输入。
 */
export interface VectorRerankInput {
    /** 查询文本 */
    query: string;
    /** 查询上下文文本 */
    queryContextText: string;
    /** 检索模式 */
    mode: 'vector_only' | 'hybrid';
    /** 候选列表 */
    candidates: RetrievalResultItem[];
    /** 参与重排的候选窗口 */
    candidateWindow?: number;
    /** 最终返回数量 */
    finalTopK: number;
}

/**
 * 功能：重排序输出。
 */
export interface VectorRerankResult {
    /** 重排序后的列表 */
    items: RetrievalResultItem[];
    /** 是否实际执行了重排序 */
    used: boolean;
    /** 原因码 */
    reasonCodes: string[];
}
