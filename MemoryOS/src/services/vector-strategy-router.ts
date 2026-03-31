/**
 * 功能：向量策略路由器。
 * 说明：根据 query 复杂度判断使用快路径还是深路径，决定候选窗口和 rerank 开关。
 *       只在 vector_only / hybrid 模式下生效，lexical_only 一律跳过。
 */

import type { VectorStrategyDecision, VectorStrategyInput } from '../types/vector-strategy';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';

// ─── 默认参数 ──────────────────────────────

/** 快路径默认候选窗口 */
const FAST_CANDIDATE_WINDOW = 5;
/** 快路径默认 finalTopK */
const FAST_FINAL_TOP_K = 3;
/** 深路径默认候选窗口 */
const DEEP_CANDIDATE_WINDOW = 25;
/** 深路径默认 finalTopK */
const DEEP_FINAL_TOP_K = 5;

/** query 短阈值（字符数） */
const SHORT_QUERY_THRESHOLD = 30;
/** 多 facet 阈值 */
const MULTI_FACET_THRESHOLD = 2;
/** 多锚点阈值 */
const MULTI_ANCHOR_THRESHOLD = 3;

// ─── 复杂度评估 ──────────────────────────────

interface ComplexitySignals {
    queryLength: number;
    facetCount: number;
    anchorCount: number;
    routeConfidence: number;
    isComplex: boolean;
    reasons: string[];
}

function evaluateQueryComplexity(input: VectorStrategyInput): ComplexitySignals {
    const query = String(input.query ?? '').trim();
    const queryLength = query.length;
    const facetCount = (input.expectedFacets ?? []).length;
    const anchorCount = (
        (input.actorAnchorKeys?.length ?? 0) +
        (input.relationAnchorKeys?.length ?? 0) +
        (input.worldAnchorKeys?.length ?? 0)
    );
    const routeConfidence = input.routeConfidence ?? 0.5;

    const reasons: string[] = [];
    let complexityScore = 0;

    // query 长度
    if (queryLength > SHORT_QUERY_THRESHOLD * 3) {
        complexityScore += 2;
        reasons.push('query_very_long');
    } else if (queryLength > SHORT_QUERY_THRESHOLD) {
        complexityScore += 1;
        reasons.push('query_long');
    }

    // 多 facet
    if (facetCount >= MULTI_FACET_THRESHOLD + 1) {
        complexityScore += 2;
        reasons.push('multi_facet');
    } else if (facetCount >= MULTI_FACET_THRESHOLD) {
        complexityScore += 1;
        reasons.push('dual_facet');
    }

    // 多锚点
    if (anchorCount >= MULTI_ANCHOR_THRESHOLD + 2) {
        complexityScore += 2;
        reasons.push('many_anchors');
    } else if (anchorCount >= MULTI_ANCHOR_THRESHOLD) {
        complexityScore += 1;
        reasons.push('multi_anchors');
    }

    // 路由置信度低 -> 说明语义不确定
    if (routeConfidence < 0.3) {
        complexityScore += 1;
        reasons.push('low_route_confidence');
    }

    // 上下文文本长度
    const contextLen = (input.mergedContextText ?? '').length;
    if (contextLen > 500) {
        complexityScore += 1;
        reasons.push('long_context');
    }

    const isComplex = complexityScore >= 2;

    return {
        queryLength,
        facetCount,
        anchorCount,
        routeConfidence,
        isComplex,
        reasons,
    };
}

// ─── 路由器 ──────────────────────────────

/**
 * 功能：向量策略路由配置。
 */
export interface VectorStrategyRouterConfig {
    /** 快路径候选窗口 */
    fastCandidateWindow?: number;
    /** 快路径 finalTopK */
    fastFinalTopK?: number;
    /** 深路径候选窗口 */
    deepCandidateWindow?: number;
    /** 深路径 finalTopK */
    deepFinalTopK?: number;
    /** 是否启用策略路由（false 则始终走快路径） */
    enabled?: boolean;
    /** 是否启用 rerank（false 则深路径也不 rerank） */
    rerankEnabled?: boolean;
}

/**
 * 功能：向量策略路由器。
 */
export class VectorStrategyRouter {
    private readonly config: Required<VectorStrategyRouterConfig>;

    constructor(config?: VectorStrategyRouterConfig) {
        this.config = {
            fastCandidateWindow: config?.fastCandidateWindow ?? FAST_CANDIDATE_WINDOW,
            fastFinalTopK: config?.fastFinalTopK ?? FAST_FINAL_TOP_K,
            deepCandidateWindow: config?.deepCandidateWindow ?? DEEP_CANDIDATE_WINDOW,
            deepFinalTopK: config?.deepFinalTopK ?? DEEP_FINAL_TOP_K,
            enabled: config?.enabled ?? true,
            rerankEnabled: config?.rerankEnabled ?? true,
        };
    }

    /**
     * 功能：判断给定检索模式是否应启用策略路由。
     * @param mode 检索模式。
     * @returns 是否应使用策略路由。
     */
    shouldRoute(mode: RetrievalMode): boolean {
        return this.config.enabled && (mode === 'vector_only' || mode === 'hybrid');
    }

    /**
     * 功能：路由决策。
     * @param input 策略路由输入。
     * @returns 策略决策。
     */
    route(input: VectorStrategyInput): VectorStrategyDecision {
        // lexical_only 不走策略路由
        if (input.retrievalMode !== 'vector_only' && input.retrievalMode !== 'hybrid') {
            return {
                route: 'fast_vector',
                candidateWindow: this.config.fastCandidateWindow,
                finalTopK: this.config.fastFinalTopK,
                rerankEnabled: false,
                reasonCodes: ['lexical_only_bypass'],
            };
        }

        if (!this.config.enabled) {
            return {
                route: 'fast_vector',
                candidateWindow: this.config.fastCandidateWindow,
                finalTopK: this.config.fastFinalTopK,
                rerankEnabled: false,
                reasonCodes: ['strategy_routing_disabled'],
            };
        }

        const signals = evaluateQueryComplexity(input);

        if (signals.isComplex) {
            return {
                route: 'deep_vector',
                candidateWindow: this.config.deepCandidateWindow,
                finalTopK: this.config.deepFinalTopK,
                rerankEnabled: this.config.rerankEnabled,
                reasonCodes: signals.reasons,
            };
        }

        return {
            route: 'fast_vector',
            candidateWindow: this.config.fastCandidateWindow,
            finalTopK: this.config.fastFinalTopK,
            rerankEnabled: false,
            reasonCodes: signals.reasons.length > 0 ? signals.reasons : ['simple_query'],
        };
    }
}
