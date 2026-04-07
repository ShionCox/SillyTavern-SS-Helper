import type { RetrievalMode } from './retrieval-mode';
import type { RetrievalContextRoute, RetrievalResultItem, RetrievalFacet } from './types';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import type { VectorStrategyDecision } from '../types/vector-strategy';
import type { QueryTimeIntent } from '../memory-time/time-ranking';

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
    /** 最终链路 provider 标识 */
    finalProviderId: string;
    /** 向量 provider 状态 */
    vectorProviderStatus: VectorProviderStatus;
    /** 各结果项的来源标注 */
    resultSourceLabels: ResultSourceLabel[];
    /** 向量策略决策 */
    strategyDecision?: VectorStrategyDecision | null;
    /** 向量命中数量 */
    vectorHitCount?: number;
    /** 是否执行了 lexical/vector 融合 */
    mergeUsed?: boolean;
    /** 是否执行了重排 */
    rerankUsed?: boolean;
    /** 重排原因码 */
    rerankReasonCodes?: string[];
    /** 重排来源 */
    rerankSource?: 'none' | 'rule' | 'llmhub';
    /** 向量原始 TopN 命中 */
    vectorTopHits?: RetrievalVectorTopHit[];
    /** 词法阶段排序 */
    lexicalRanking?: RetrievalStageRankingItem[];
    /** 融合后、重排前排序 */
    mergedRanking?: RetrievalStageRankingItem[];
    /** 重排后排序 */
    rerankedRanking?: RetrievalStageRankingItem[];
    /** 结果排序变化解释 */
    rankingChanges?: RetrievalRankingChangeItem[];
    /** 最终结果中受到时间偏置影响的条目数量 */
    timeBiasedCount?: number;
    /** 查询时间意图 */
    queryTimeIntent?: QueryTimeIntent;
    /** 当前世界画像 ID */
    worldProfileId?: string;
    /** 受世界画像偏置影响的条目数 */
    worldBiasedCount?: number;
}

/**
 * 功能：定义向量原始 TopN 命中快照。
 */
export interface RetrievalVectorTopHit {
    rank: number;
    sourceId: string;
    score: number;
}

/**
 * 功能：定义单个阶段的排序快照项。
 */
export interface RetrievalStageRankingItem {
    rank: number;
    candidateId: string;
    entryId: string;
    title: string;
    score: number;
    source: 'lexical' | 'vector' | 'graph_expansion' | 'coverage_supplement';
    timeIntent?: QueryTimeIntent;
    timeBoost?: number;
    stateBoost?: number;
    outcomeBoost?: number;
    temporalWeight?: number;
}

/**
 * 功能：定义结果在不同排序阶段中的变化项。
 */
export interface RetrievalRankingChangeItem {
    candidateId: string;
    entryId: string;
    title: string;
    source: 'lexical' | 'vector' | 'graph_expansion' | 'coverage_supplement';
    lexicalRank?: number;
    mergedRank?: number;
    rerankedRank?: number;
    finalRank?: number;
    lexicalScore?: number;
    mergedScore?: number;
    rerankedScore?: number;
    finalScore?: number;
    changeReason: string;
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
