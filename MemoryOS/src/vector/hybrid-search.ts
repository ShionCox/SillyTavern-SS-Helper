import { Logger } from '../../../SDK/logger';
import type { ChatStateManager } from '../core/chat-state-manager';
import type { EventsManager } from '../core/events-manager';
import type { FactsManager } from '../core/facts-manager';
import type { SummariesManager } from '../core/summaries-manager';
import { runRerank } from '../llm/memoryLlmBridge';
import { VectorManager } from './vector-manager';

const logger = new Logger('HybridSearch');

export interface HybridSearchResult {
    content: string;
    score: number;
    source: 'vector' | 'keyword' | 'event';
    meta?: {
        factKey?: string;
        summaryId?: string;
        level?: string;
        chunkId?: string;
    };
}

/**
 * 功能：执行混合检索，并受聊天级自适应策略控制。
 * @param chatKey 当前聊天键。
 * @param eventsManager 事件管理器。
 * @param factsManager 事实管理器。
 * @param summariesManager 摘要管理器。
 * @param chatStateManager 聊天状态管理器。
 * @returns 混合检索管理器实例。
 */
export class HybridSearchManager {
    private vectorManager: VectorManager;
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private summariesManager: SummariesManager;
    private chatStateManager: ChatStateManager | null;

    constructor(
        chatKey: string,
        eventsManager: EventsManager,
        factsManager: FactsManager,
        summariesManager: SummariesManager,
        chatStateManager?: ChatStateManager,
    ) {
        this.vectorManager = new VectorManager(chatKey);
        this.eventsManager = eventsManager;
        this.factsManager = factsManager;
        this.summariesManager = summariesManager;
        this.chatStateManager = chatStateManager ?? null;
    }

    /**
     * 功能：执行混合检索。
     * @param query 查询文本。
     * @param options 结果数量选项。
     * @returns 检索结果列表。
     */
    async search(
        query: string,
        options?: { maxVectorResults?: number; maxKeywordResults?: number; maxEventResults?: number },
    ): Promise<HybridSearchResult[]> {
        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            return [];
        }
        const adaptivePolicy = this.chatStateManager
            ? await this.chatStateManager.getAdaptivePolicy()
            : null;
        const vectorLifecycle = this.chatStateManager
            ? await this.chatStateManager.getVectorLifecycle()
            : null;
        const maxVectorResults = Math.max(0, Number(options?.maxVectorResults ?? 6));
        const maxKeywordResults = Math.max(1, Number(options?.maxKeywordResults ?? 8));
        const maxEventResults = Math.max(1, Number(options?.maxEventResults ?? 4));
        const requestCount = Number(vectorLifecycle?.searchRequestCount ?? 0) + 1;
        const stride = Math.max(1, Number(adaptivePolicy?.vectorSearchStride ?? vectorLifecycle?.lowPrecisionSearchStride ?? 1));
        const vectorMode = adaptivePolicy?.vectorMode ?? 'search_rerank';
        const shouldSearchVector = vectorMode === 'search' || vectorMode === 'search_rerank';
        const shouldThrottleVector = shouldSearchVector && stride > 1 && requestCount % stride !== 0;
        const shouldRunVector = shouldSearchVector && !shouldThrottleVector;

        const [vectorResults, keywordResults, eventResults] = await Promise.all([
            shouldRunVector ? this.searchVector(query, maxVectorResults) : Promise.resolve([]),
            this.searchKeyword(query, maxKeywordResults),
            this.searchEvents(maxEventResults),
        ]);

        const merged = this.mergeResults([...vectorResults, ...keywordResults, ...eventResults]);
        const rerankThreshold = Math.max(2, Number(adaptivePolicy?.rerankThreshold ?? 6));
        const shouldRerank = vectorMode === 'search_rerank' && adaptivePolicy?.rerankEnabled !== false && merged.length >= rerankThreshold;
        const reranked = shouldRerank
            ? await this.rerankResults(query, merged)
            : merged;
        const vectorHit = vectorResults.length > 0;
        const keywordHit = keywordResults.length > 0;
        const precision = reranked.length > 0 && (vectorHit || keywordHit) ? 1 : 0;

        if (this.chatStateManager) {
            const previousWindow = Array.isArray(vectorLifecycle?.recentPrecisionWindow) ? vectorLifecycle.recentPrecisionWindow : [];
            const recentPrecisionWindow = [...previousWindow, precision].slice(-10);
            const existingHealth = await this.chatStateManager.getRetrievalHealth();
            await this.chatStateManager.recordRetrievalHealth({
                totalSearches: Number(existingHealth.totalSearches ?? 0) + 1,
                vectorSearches: Number(existingHealth.vectorSearches ?? 0) + Number(shouldRunVector ? 1 : 0),
                rerankSearches: Number(existingHealth.rerankSearches ?? 0) + Number(shouldRerank ? 1 : 0),
                keywordHits: Number(existingHealth.keywordHits ?? 0) + Number(keywordHit ? 1 : 0),
                vectorHits: Number(existingHealth.vectorHits ?? 0) + Number(vectorHit ? 1 : 0),
                recentPrecisionWindow,
                lastAccessAt: shouldRunVector ? Date.now() : Number(vectorLifecycle?.lastAccessAt ?? 0),
                lastHitAt: vectorHit ? Date.now() : Number(vectorLifecycle?.lastHitAt ?? 0),
            });
            await this.chatStateManager.updateVectorLifecycle({
                searchRequestCount: requestCount,
                recentPrecisionWindow,
                lastPrecision: precision,
            });
        }

        logger.info(`混合检索完成：vector=${vectorResults.length}, keyword=${keywordResults.length}, event=${eventResults.length}, merged=${reranked.length}`);
        return reranked;
    }

    /**
     * 功能：将检索结果格式化为注入文本。
     * @param results 检索结果列表。
     * @returns 格式化后的文本。
     */
    formatForPrompt(results: HybridSearchResult[]): string {
        if (!Array.isArray(results) || results.length === 0) {
            return '';
        }
        const lines = results.map((item: HybridSearchResult): string => {
            const flag = item.source === 'vector' ? '🔍' : item.source === 'keyword' ? '🔑' : '📖';
            return `${flag} (${item.score.toFixed(3)}) ${item.content}`;
        });
        return `【检索命中】\n${lines.join('\n')}`;
    }

    /**
     * 功能：执行向量检索。
     * @param query 查询文本。
     * @param topK 返回数量。
     * @returns 检索结果列表。
     */
    private async searchVector(query: string, topK: number): Promise<HybridSearchResult[]> {
        if (topK <= 0) {
            return [];
        }
        const hits = await this.vectorManager.search(query, topK);
        const results = await Promise.all(
            hits.map(async (hit: { chunkId: string; content: string; score: number }): Promise<HybridSearchResult | null> => {
                const archived = this.chatStateManager ? await this.chatStateManager.isMemoryCardArchived(hit.chunkId) : false;
                if (archived) {
                    return null;
                }
                return {
                    content: hit.content,
                    score: hit.score,
                    source: 'vector',
                    meta: { chunkId: hit.chunkId },
                };
            }),
        );
        return results.filter((item: HybridSearchResult | null): item is HybridSearchResult => item != null);
    }

    /**
     * 功能：执行关键词检索。
     * @param query 查询文本。
     * @param limit 返回数量。
     * @returns 结果列表。
     */
    private async searchKeyword(query: string, limit: number): Promise<HybridSearchResult[]> {
        const keywords = this.extractKeywords(query);
        if (keywords.length === 0) {
            return [];
        }

        const [facts, summaries] = await Promise.all([
            this.factsManager.query({ limit: 120 }),
            this.summariesManager.query({ limit: 60 }),
        ]);

        const factResults = await Promise.all(
            facts.map(async (fact: any): Promise<HybridSearchResult | null> => {
                const factKey = String(fact.factKey ?? '').trim();
                if (this.chatStateManager && factKey && await this.chatStateManager.isFactArchived(factKey)) {
                    return null;
                }
                const content = `${fact.type}${fact.path ? `.${fact.path}` : ''}: ${this.stringifyValue(fact.value)}`;
                const score = this.scoreByKeywords(content, keywords);
                if (score <= 0) {
                    return null;
                }
                return {
                    content,
                    score: score * 0.8,
                    source: 'keyword',
                    meta: { factKey },
                };
            }),
        );

        const summaryResults = await Promise.all(
            summaries.map(async (summary: any): Promise<HybridSearchResult | null> => {
                const summaryId = String(summary.summaryId ?? '').trim();
                if (this.chatStateManager && summaryId && await this.chatStateManager.isSummaryArchived(summaryId)) {
                    return null;
                }
                const content = `${summary.title ? `${summary.title}: ` : ''}${summary.content}`;
                const score = this.scoreByKeywords(content, keywords);
                if (score <= 0) {
                    return null;
                }
                return {
                    content,
                    score: score * 0.9,
                    source: 'keyword',
                    meta: { summaryId, level: summary.level },
                };
            }),
        );

        return [...factResults, ...summaryResults]
            .filter((item: HybridSearchResult | null): item is HybridSearchResult => item != null)
            .sort((left: HybridSearchResult, right: HybridSearchResult): number => right.score - left.score)
            .slice(0, limit);
    }

    /**
     * 功能：取最近事件作为兜底检索结果。
     * @param limit 返回数量。
     * @returns 事件结果列表。
     */
    private async searchEvents(limit: number): Promise<HybridSearchResult[]> {
        const events = await this.eventsManager.query({ limit });
        return events
            .slice(0, limit)
            .map((event: any): HybridSearchResult => ({
                content: this.readEventPayloadText(event.payload),
                score: 0.35,
                source: 'event',
            }))
            .filter((item: HybridSearchResult): boolean => item.content.trim().length > 0);
    }

    /**
     * 功能：合并并去重结果。
     * @param input 原始结果。
     * @returns 去重后的结果。
     */
    private mergeResults(input: HybridSearchResult[]): HybridSearchResult[] {
        const map = new Map<string, HybridSearchResult>();
        for (const item of input) {
            const key = item.content.trim();
            if (!key) {
                continue;
            }
            const existing = map.get(key);
            if (!existing || item.score > existing.score) {
                map.set(key, item);
            }
        }
        return Array.from(map.values()).sort((left: HybridSearchResult, right: HybridSearchResult): number => right.score - left.score);
    }

    /**
     * 功能：对结果执行重排。
     * @param query 查询文本。
     * @param results 原始结果。
     * @returns 重排后的结果。
     */
    private async rerankResults(query: string, results: HybridSearchResult[]): Promise<HybridSearchResult[]> {
        const rerank = await runRerank(
            query,
            results.map((item: HybridSearchResult): string => item.content),
            results.length,
        );
        if (!rerank.ok || !Array.isArray(rerank.results) || rerank.results.length === 0) {
            return results;
        }
        return rerank.results
            .map((item: { index: number; score: number }): HybridSearchResult | null => {
                const original = results[item.index] ?? null;
                if (!original) {
                    return null;
                }
                return {
                    ...original,
                    score: Number(item.score ?? original.score),
                };
            })
            .filter((item: HybridSearchResult | null): item is HybridSearchResult => item != null)
            .sort((left: HybridSearchResult, right: HybridSearchResult): number => right.score - left.score);
    }

    /**
     * 功能：提取关键词。
     * @param query 查询文本。
     * @returns 关键词数组。
     */
    private extractKeywords(query: string): string[] {
        return Array.from(
            new Set(
                String(query ?? '')
                    .toLowerCase()
                    .split(/[\s,，。！？；:：()\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
                    .map((item: string): string => item.trim())
                    .filter((item: string): boolean => item.length >= 2),
            ),
        ).slice(0, 12);
    }

    /**
     * 功能：根据关键词计算相关分数。
     * @param content 目标文本。
     * @param keywords 关键词数组。
     * @returns 分数。
     */
    private scoreByKeywords(content: string, keywords: string[]): number {
        const normalized = content.toLowerCase();
        return keywords.reduce((score: number, keyword: string): number => {
            return score + (normalized.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * 功能：将任意值转成字符串。
     * @param value 任意值。
     * @returns 字符串。
     */
    private stringifyValue(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }
        if (value == null) {
            return '';
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    /**
     * 功能：读取事件负载中的文本。
     * @param payload 事件负载。
     * @returns 文本内容。
     */
    private readEventPayloadText(payload: unknown): string {
        if (typeof payload === 'string') {
            return payload;
        }
        if (payload && typeof payload === 'object') {
            const text = (payload as { text?: unknown; content?: unknown }).text;
            const content = (payload as { text?: unknown; content?: unknown }).content;
            if (typeof text === 'string') {
                return text;
            }
            if (typeof content === 'string') {
                return content;
            }
        }
        return this.stringifyValue(payload);
    }
}
