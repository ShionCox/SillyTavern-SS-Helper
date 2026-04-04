import type { RetrievalResultItem } from '../memory-retrieval/types';
import { buildTimeLabel, computeTemporalIntentBoost, resolveQueryTimeIntent } from '../memory-time/time-ranking';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：LLMHub 重排序输入。
 */
export interface LLMHubRerankInput {
    /** 查询文本 */
    query: string;
    /** 检索模式 */
    mode: 'vector_only' | 'hybrid';
    /** 候选结果 */
    candidates: RetrievalResultItem[];
    /** 最终返回数量 */
    finalTopK: number;
    /** 资源提示 */
    resource?: string;
    /** 模型提示 */
    model?: string;
}

/**
 * 功能：LLMHub 重排序结果。
 */
export interface LLMHubRerankResult {
    /** 是否成功 */
    ok: boolean;
    /** 结果列表 */
    items: RetrievalResultItem[];
    /** 原因码 */
    reasonCodes: string[];
    /** 实际资源 */
    providerResource?: string;
    /** 实际模型 */
    providerModel?: string;
    /** 是否使用回退 */
    fallbackUsed?: boolean;
    /** 错误信息 */
    error?: string;
}

interface LLMRerankApi {
    rerank: (args: {
        consumer: string;
        taskKey: string;
        taskDescription?: string;
        query: string;
        docs: string[];
        topK?: number;
        routeHint?: { resource?: string; model?: string };
        enqueue?: { displayMode?: string };
    }) => Promise<{
        ok: boolean;
        results?: Array<{ index: number; score: number; doc: string }>;
        resource?: string;
        fallbackUsed?: boolean;
        meta?: { model?: string };
        error?: string;
    }>;
}

/**
 * 功能：读取全局 LLMHub rerank 接口。
 * @returns rerank 接口，不可用时返回 null。
 */
function readLLMRerankApi(): LLMRerankApi | null {
    const llm = (window as unknown as { STX?: { llm?: unknown } })?.STX?.llm;
    if (!llm || typeof llm !== 'object') {
        return null;
    }
    const record = llm as Record<string, unknown>;
    if (typeof record.rerank !== 'function') {
        return null;
    }
    return llm as unknown as LLMRerankApi;
}

/**
 * 功能：构造送入 LLMHub 的候选短文本。
 * @param item 检索结果项。
 * @returns 压缩后的文本。
 */
function buildRerankDocText(item: RetrievalResultItem): string {
    const parts: string[] = [];
    const candidate = item.candidate;
    if (candidate.title) {
        parts.push(`标题：${candidate.title}`);
    }
    if (candidate.summary) {
        parts.push(`摘要：${candidate.summary}`);
    }
    if (candidate.compareKey) {
        parts.push(`比较键：${candidate.compareKey}`);
    }
    if ((candidate.actorKeys?.length ?? 0) > 0) {
        parts.push(`角色：${candidate.actorKeys?.join('、')}`);
    }
    if ((candidate.relationKeys?.length ?? 0) > 0) {
        parts.push(`关系：${candidate.relationKeys?.join('、')}`);
    }
    if ((candidate.worldKeys?.length ?? 0) > 0) {
        parts.push(`世界：${candidate.worldKeys?.join('、')}`);
    }
    if ((candidate.tags?.length ?? 0) > 0) {
        parts.push(`标签：${candidate.tags?.join('、')}`);
    }
    if (candidate.timeContext) {
        parts.push(`时间：${buildTimeLabel(candidate.timeContext, candidate.timeContext.sequenceTime.lastFloor)}`);
    }
    if (candidate.ongoing !== undefined) {
        parts.push(`进行中：${candidate.ongoing ? '是' : '否'}`);
    }
    const stateBoost = Number(item.breakdown.stateBoost) || 0;
    const outcomeBoost = Number(item.breakdown.outcomeBoost) || 0;
    if (stateBoost > 0) {
        parts.push(`状态型：${stateBoost.toFixed(3)}`);
    }
    if (outcomeBoost > 0) {
        parts.push(`结果型：${outcomeBoost.toFixed(3)}`);
    }
    return parts.join('\n').slice(0, 1200);
}

/**
 * 功能：对 LLMHub 返回结果追加时间偏置，避免模型重排完全丢失时间方向。
 * @param query 查询文本。
 * @param items 候选项。
 * @returns 加入时间偏置后的候选。
 */
function applyLLMHubTimeBias(query: string, items: RetrievalResultItem[]): RetrievalResultItem[] {
    if (items.length <= 0) {
        return [];
    }
    const currentMaxFloor = items.reduce((max: number, item: RetrievalResultItem): number => (
        Math.max(max, item.candidate.timeContext?.sequenceTime?.lastFloor ?? 0)
    ), 0);
    const queryText = String(query ?? '').trim();
    return items
        .map((item: RetrievalResultItem): RetrievalResultItem => {
            const temporal = computeTemporalIntentBoost(queryText, item.candidate.timeContext, currentMaxFloor, item.candidate);
            const timeBoost = temporal.finalScore || (item.breakdown.timeBoost ?? 0);
            const llmScore = Math.max(0, Math.min(1, Number(item.score) || 0));
            const temporalWeight = temporal.temporalWeight > 0
                ? temporal.temporalWeight
                : (resolveQueryTimeIntent(queryText) === 'none' ? 0 : 0.08);
            const rerankScore = Math.max(0, Math.min(1, Number((
                llmScore * (1 - temporalWeight) + Math.max(0, Number(timeBoost) || 0) * temporalWeight
            ).toFixed(6))));
            return {
                ...item,
                score: rerankScore,
                breakdown: {
                    ...item.breakdown,
                    timeBoost: Math.max(0, Number(timeBoost) || 0),
                    timeIntent: temporal.intent,
                    stateBoost: Math.max(Number(item.breakdown.stateBoost) || 0, temporal.stateBoost),
                    outcomeBoost: Math.max(Number(item.breakdown.outcomeBoost) || 0, temporal.outcomeBoost),
                    temporalWeight,
                    temporalReason: temporal.explanation,
                },
            };
        })
        .sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score);
}

/**
 * 功能：LLMHub 模型重排序服务。
 */
export class LLMHubRerankService {
    /**
     * 功能：检查 rerank 能力是否可用。
     * @returns 是否可用。
     */
    isAvailable(): boolean {
        return readLLMRerankApi() !== null;
    }

    /**
     * 功能：执行模型重排序。
     * @param input 重排序输入。
     * @returns 重排序结果。
     */
    async rerank(input: LLMHubRerankInput): Promise<LLMHubRerankResult> {
        const api = readLLMRerankApi();
        if (!api) {
            return {
                ok: false,
                items: [],
                reasonCodes: ['llmhub_unavailable'],
                error: 'LLMHub rerank 接口不可用',
            };
        }
        if (input.candidates.length <= 0) {
            return {
                ok: false,
                items: [],
                reasonCodes: ['no_candidates'],
                error: '没有可供重排的候选',
            };
        }

        const docs = input.candidates.map(buildRerankDocText);
        try {
            const response = await api.rerank({
                consumer: 'stx_memory_os',
                taskKey: 'memory_vector_rerank',
                taskDescription: '记忆向量结果重排序',
                query: input.query,
                docs,
                topK: input.finalTopK,
                routeHint: input.resource || input.model
                    ? { resource: input.resource, model: input.model }
                    : undefined,
                enqueue: { displayMode: 'silent' },
            });

            if (!response.ok || !Array.isArray(response.results) || response.results.length <= 0) {
                return {
                    ok: false,
                    items: [],
                    reasonCodes: ['llmhub_empty_result'],
                    providerResource: response.resource,
                    providerModel: response.meta?.model,
                    fallbackUsed: response.fallbackUsed === true,
                    error: response.error || 'LLMHub rerank 返回空结果',
                };
            }

            const items: RetrievalResultItem[] = [];
            for (const result of response.results) {
                const item = input.candidates[result.index];
                if (!item) {
                    continue;
                }
                items.push({
                    ...item,
                    score: Math.max(0, Math.min(1, Number(result.score) || item.score)),
                });
            }

            if (items.length <= 0) {
                return {
                    ok: false,
                    items: [],
                    reasonCodes: ['llmhub_mapping_failed'],
                    providerResource: response.resource,
                    providerModel: response.meta?.model,
                    fallbackUsed: response.fallbackUsed === true,
                    error: 'LLMHub rerank 结果无法映射回候选',
                };
            }

            const timeBiasedItems = applyLLMHubTimeBias(input.query, items);
            return {
                ok: true,
                items: timeBiasedItems.slice(0, input.finalTopK),
                reasonCodes: [`llmhub_rerank_${input.mode}`, `from_${input.candidates.length}_to_${Math.min(items.length, input.finalTopK)}`],
                providerResource: response.resource,
                providerModel: response.meta?.model,
                fallbackUsed: response.fallbackUsed === true,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[LLMHubRerank] 重排序失败: ${message}`);
            return {
                ok: false,
                items: [],
                reasonCodes: ['llmhub_exception'],
                error: message,
            };
        }
    }
}
