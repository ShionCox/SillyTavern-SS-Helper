/**
 * 功能：向量链重排序服务。
 * 说明：只在向量链启用时生效（vector_only / hybrid），lexical_only 不触发。
 *       第一版采用规则增强型 rerank。
 */

import type { RetrievalResultItem } from '../memory-retrieval/types';
import { computeTimeBoost } from '../memory-time/time-ranking';
import type { VectorRerankInput, VectorRerankResult } from '../types/vector-rerank';

/**
 * 功能：向量规则重排序配置。
 */
export interface VectorRerankServiceConfig {
    /** 默认参与重排的窗口大小 */
    defaultWindow?: number;
    /** 是否启用 LLMHub 重排标志位，仅用于配置透传 */
    useLLMHubRerank?: boolean;
}

// ─── 权重配置 ──────────────────────────────

/** vector_only 模式下的权重 */
const VECTOR_ONLY_WEIGHTS = {
    vectorScore: 0.70,
    lexicalScore: 0.00,
    graphBoost: 0.15,
    anchorConsistency: 0.10,
    recencyWeight: 0.03,
    memoryWeight: 0.02,
};

/** hybrid 模式下的权重 */
const HYBRID_WEIGHTS = {
    vectorScore: 0.40,
    lexicalScore: 0.35,
    graphBoost: 0.10,
    anchorConsistency: 0.10,
    recencyWeight: 0.03,
    memoryWeight: 0.02,
    timeBoost: 0.08,
};

/** vector_only 模式下的时间偏置权重 */
const VECTOR_ONLY_TIME_WEIGHT = 0.10;

// ─── 辅助函数 ──────────────────────────────

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * 功能：计算锚点一致性分数。
 * 说明：检查候选记录的 actorKeys / relationKeys / worldKeys 是否与查询上下文一致。
 */
function computeAnchorConsistency(
    candidate: RetrievalResultItem,
    queryText: string,
): number {
    const c = candidate.candidate;
    const queryLower = queryText.toLowerCase();
    let matchCount = 0;
    let totalAnchors = 0;

    for (const key of c.actorKeys ?? []) {
        totalAnchors++;
        if (key && queryLower.includes(key.toLowerCase())) {
            matchCount++;
        }
    }
    for (const key of c.relationKeys ?? []) {
        totalAnchors++;
        if (key && queryLower.includes(key.toLowerCase())) {
            matchCount++;
        }
    }
    for (const key of c.worldKeys ?? []) {
        totalAnchors++;
        if (key && queryLower.includes(key.toLowerCase())) {
            matchCount++;
        }
    }
    if (c.compareKey && queryLower.includes(c.compareKey.toLowerCase())) {
        matchCount++;
        totalAnchors++;
    }

    if (totalAnchors === 0) {
        return 0.5;
    }
    return matchCount / totalAnchors;
}

// ─── 重排序服务 ──────────────────────────────

/**
 * 功能：向量链重排序服务。
 */
export class VectorRerankService {
    private config: Required<VectorRerankServiceConfig>;

    constructor(config?: VectorRerankServiceConfig) {
        this.config = {
            defaultWindow: Math.max(1, config?.defaultWindow ?? 25),
            useLLMHubRerank: config?.useLLMHubRerank === true,
        };
    }

    /**
     * 功能：更新运行时配置。
     * @param config 新配置。
     */
    setConfig(config: VectorRerankServiceConfig): void {
        this.config = {
            defaultWindow: Math.max(1, config.defaultWindow ?? this.config.defaultWindow),
            useLLMHubRerank: config.useLLMHubRerank ?? this.config.useLLMHubRerank,
        };
    }

    /**
     * 功能：对候选列表执行重排序。
     * @param input 重排序输入。
     * @returns 重排序结果。
     */
    rerank(input: VectorRerankInput): VectorRerankResult {
        const candidateWindow = Math.max(1, input.candidateWindow ?? this.config.defaultWindow);
        const candidates = input.candidates.slice(0, candidateWindow);

        if (candidates.length === 0) {
            return { items: [], used: false, reasonCodes: ['no_candidates'] };
        }

        if (input.mode !== 'vector_only' && input.mode !== 'hybrid') {
            return {
                items: candidates.slice(0, input.finalTopK),
                used: false,
                reasonCodes: ['lexical_only_bypass'],
            };
        }

        const weights = input.mode === 'vector_only' ? VECTOR_ONLY_WEIGHTS : HYBRID_WEIGHTS;
        const timeWeight = input.mode === 'vector_only' ? VECTOR_ONLY_TIME_WEIGHT : HYBRID_WEIGHTS.timeBoost;
        const queryContext = `${input.query} ${input.queryContextText}`;
        const currentMaxFloor = candidates.reduce((max: number, item: RetrievalResultItem): number => (
            Math.max(max, item.candidate.timeContext?.sequenceTime?.lastFloor ?? 0)
        ), 0);

        const scoredItems = candidates.map((item) => {
            const breakdown = item.breakdown;

            // vectorScore: 用原始综合分作为向量分代理
            // 在真实向量场景下，这里应该是真实的向量余弦相似度
            const vectorScore = clamp01(item.score);

            // lexicalScore: 用 BM25 + ngram 作为词法分
            const lexicalScore = clamp01(
                (breakdown.bm25 ?? 0) * 0.6 +
                (breakdown.ngram ?? 0) * 0.25 +
                (breakdown.editDistance ?? 0) * 0.15,
            );

            // graphBoost
            const graphBoost = clamp01(breakdown.graphBoost ?? 0);

            // 锚点一致性
            const anchorConsistency = computeAnchorConsistency(item, queryContext);

            // 时间衰减
            const recencyWeight = clamp01(breakdown.recencyWeight ?? 0);

            // 记忆度
            const memoryWeight = clamp01(breakdown.memoryWeight ?? 0);

            // 时间方向偏置
            const timeBoost = item.candidate.timeContext
                ? clamp01(computeTimeBoost(queryContext, item.candidate.timeContext, currentMaxFloor))
                : clamp01(breakdown.timeBoost ?? 0);

            // 加权求和
            const rerankScore =
                vectorScore * weights.vectorScore +
                lexicalScore * weights.lexicalScore +
                graphBoost * weights.graphBoost +
                anchorConsistency * weights.anchorConsistency +
                recencyWeight * weights.recencyWeight +
                memoryWeight * weights.memoryWeight +
                timeBoost * timeWeight;

            return {
                item: {
                    ...item,
                    score: clamp01(rerankScore),
                    breakdown: {
                        ...item.breakdown,
                        timeBoost,
                    },
                },
                rerankScore,
            };
        });

        scoredItems.sort((a, b) => b.rerankScore - a.rerankScore);

        const finalItems = scoredItems
            .slice(0, input.finalTopK)
            .map((s) => s.item);

        return {
            items: finalItems,
            used: true,
            reasonCodes: [`rerank_${input.mode}`, `from_${candidates.length}_to_${finalItems.length}`],
        };
    }
}
