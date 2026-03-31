import type { RetrievalMode } from './retrieval-mode';
import type { RetrievalContextRoute, RetrievalResultItem, RetrievalFacet } from './types';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';

/**
 * 功能：统一检索输出。
 */
export interface MemoryRetrievalOutput {
    /** 最终结果列表 */
    items: RetrievalResultItem[];
    /** 实际使用的检索模式 */
    retrievalMode: RetrievalMode;
    /** 主 provider 标识 */
    providerId: string;
    /** 语境路由结果 */
    contextRoute: RetrievalContextRoute | null;
    /** 诊断信息 */
    diagnostics: RetrievalOutputDiagnostics;
}

/**
 * 功能：统一检索诊断信息。
 */
export interface RetrievalOutputDiagnostics {
    /** 语境路由 */
    contextRoute: RetrievalContextRoute | null;
    /** 实际使用的检索模式 */
    retrievalMode: RetrievalMode;
    /** 种子 provider 标识 */
    seedProviderId: string;
    /** 种子命中数 */
    seedCount: number;
    /** 图扩展后数量 */
    expandedCount: number;
    /** 补召回触发的 facet */
    coverageTriggeredFacets: RetrievalFacet[];
    /** 多样性裁剪丢弃数 */
    diversityDroppedCount: number;
    /** 最终数量 */
    finalCount: number;
    /** 种子查询文本 */
    seedQueryText: string;
    /** 优先 schema */
    boostSchemaIds: string[];
    /** 补召回子查询 */
    coverageSubQueries: Partial<Record<RetrievalFacet, string>>;
    /** trace 日志 */
    traceRecords: MemoryDebugLogRecord[];
    /** 向量 provider 状态 */
    vectorProviderStatus: VectorProviderStatus;
    /** 各结果项的来源标注 */
    resultSourceLabels: ResultSourceLabel[];
}

/**
 * 功能：向量 provider 状态。
 */
export interface VectorProviderStatus {
    /** 是否可用 */
    available: boolean;
    /** 不可用原因 */
    unavailableReason: string | null;
    /** 是否被当前模式请求 */
    requestedByMode: boolean;
}

/**
 * 功能：结果项来源标注。
 */
export interface ResultSourceLabel {
    /** 候选 ID */
    candidateId: string;
    /** 来源：词法 / 向量 / 图扩展 / 补召回 */
    source: 'lexical' | 'vector' | 'graph_expansion' | 'coverage_supplement';
}
