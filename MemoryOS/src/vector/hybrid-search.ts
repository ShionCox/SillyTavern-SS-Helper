import { Logger } from '../../../SDK/logger';
import { VectorManager } from './vector-manager';
import type { EventsManager } from '../core/events-manager';
import type { FactsManager } from '../core/facts-manager';
import type { SummariesManager } from '../core/summaries-manager';

const logger = new Logger('HybridSearch');

export interface HybridSearchResult {
    content: string;
    score: number;
    source: 'vector' | 'keyword' | 'event';
    meta?: any;
}

/**
 * 三路混合检索管理器
 *
 * 策略（可加权聚合）：
 * 1. 向量召回 (vector)：语义最近邻检索（需要 LLMHub embed 能力，降级透明）
 * 2. 关键词召回 (keyword)：在 facts/summaries 中全文关键词匹配
 * 3. 最近事件召回 (event)：取最新一批 events 作为上下文窗口
 *
 * 超时/失败时任意一路不影响其余两路
 */
export class HybridSearchManager {
    private chatKey: string;
    private vectorManager: VectorManager;
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private summariesManager: SummariesManager;

    constructor(
        chatKey: string,
        eventsManager: EventsManager,
        factsManager: FactsManager,
        summariesManager: SummariesManager
    ) {
        this.chatKey = chatKey;
        this.vectorManager = new VectorManager(chatKey);
        this.eventsManager = eventsManager;
        this.factsManager = factsManager;
        this.summariesManager = summariesManager;
    }

    /**
     * 执行三路混合检索，超时降级安全
     * @param query 查询字符串（对话中的最新用户输入或摘要视角）
     * @param options 配置项
     */
    public async search(
        query: string,
        options: {
            maxVectorResults?: number;
            maxKeywordResults?: number;
            maxEventResults?: number;
            maxTotalTokens?: number;
        } = {}
    ): Promise<HybridSearchResult[]> {
        const {
            maxVectorResults = 5,
            maxKeywordResults = 5,
            maxEventResults = 8,
        } = options;

        // 并行执行三路召回，任意一路出错不影响其余
        const [vectorResults, keywordResults, eventResults] = await Promise.all([
            this.runVectorSearch(query, maxVectorResults),
            this.runKeywordSearch(query, maxKeywordResults),
            this.runEventSearch(maxEventResults),
        ]);

        // 去重合并（按 content hash 去重）
        const seen = new Set<string>();
        const merged: HybridSearchResult[] = [];

        for (const item of [...vectorResults, ...keywordResults, ...eventResults]) {
            const key = item.content.slice(0, 80);
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(item);
            }
        }

        // 排序：向量召回 score 最高优先，其次关键词，事件最后
        merged.sort((a, b) => b.score - a.score);

        // 可选 rerank：若 LLMHub 提供能力，则对合并结果做二次重排
        const reranked = await this.tryRerank(query, merged);

        logger.info(`混合检索完成：向量 ${vectorResults.length} 条，关键词 ${keywordResults.length} 条，事件 ${eventResults.length} 条，合并去重后 ${reranked.length} 条`);

        return reranked;
    }

    /**
     * 把检索结果格式化为可注入 Prompt 的文本块
     */
    public formatForPrompt(results: HybridSearchResult[]): string {
        if (results.length === 0) return '';
        return results.map(r => {
            const flag = r.source === 'vector' ? '🔍' : r.source === 'keyword' ? '🔑' : '📖';
            return `${flag} [${r.source}] ${r.content}`;
        }).join('\n\n');
    }

    /**
     * 为一段文本（如世界书内容或历史摘要）建立向量索引
     */
    public async indexText(text: string, bookId?: string): Promise<string[]> {
        return this.vectorManager.indexText(text, bookId);
    }

    // ==========================================
    // 三路召回实现
    // ==========================================

    private async runVectorSearch(query: string, topK: number): Promise<HybridSearchResult[]> {
        try {
            const hits = await this.vectorManager.search(query, topK);
            return hits.map(h => ({
                content: h.content,
                score: h.score,
                source: 'vector' as const,
                meta: { chunkId: h.chunkId }
            }));
        } catch (e) {
            logger.warn('向量召回失败，静默降级', e);
            return [];
        }
    }

    private async runKeywordSearch(query: string, limit: number): Promise<HybridSearchResult[]> {
        try {
            const keywords = this.extractKeywords(query);
            if (keywords.length === 0) return [];

            const results: HybridSearchResult[] = [];

            // 在 summaries 中检索
            const allSummaries = await this.summariesManager.query({ limit: 50 });
            for (const s of allSummaries) {
                const text = [s.title ?? '', s.content].join(' ');
                const score = this.keywordScore(text, keywords);
                if (score > 0) {
                    results.push({
                        content: s.content,
                        score: score * 0.8,  // keyword 权重略低于 vector
                        source: 'keyword',
                        meta: { summaryId: s.summaryId, level: s.level }
                    });
                }
            }

            // 在 facts 中检索
            const allFacts = await this.factsManager.query({ limit: 50 });
            for (const f of allFacts) {
                const text = [f.type, JSON.stringify(f.value)].join(' ');
                const score = this.keywordScore(text, keywords);
                if (score > 0) {
                    results.push({
                        content: `[${f.type}] ${JSON.stringify(f.value)}`,
                        score: score * 0.7,
                        source: 'keyword',
                        meta: { factKey: f.factKey }
                    });
                }
            }

            results.sort((a, b) => b.score - a.score);
            return results.slice(0, limit);

        } catch (e) {
            logger.warn('关键词召回失败，静默降级', e);
            return [];
        }
    }

    private async runEventSearch(limit: number): Promise<HybridSearchResult[]> {
        try {
            const events = await this.eventsManager.query({ limit });
            return events.map(e => ({
                content: `[${new Date(e.ts).toLocaleTimeString()}] ${e.type}: ${JSON.stringify(e.payload)}`,
                score: 0.3,  // 事件召回基础分，用于保底上下文
                source: 'event' as const,
                meta: { eventId: e.id, ts: e.ts }
            }));
        } catch (e) {
            logger.warn('事件召回失败，静默降级', e);
            return [];
        }
    }

    // ==========================================
    // 简单关键词工具
    // ==========================================

    private extractKeywords(query: string): string[] {
        // 简单过滤：去掉停用词，保留 2+ 字符词语
        const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '和', 'the', 'a', 'is', 'in', 'of', 'to']);
        return query
            .split(/[\s，。！？,.!?\n]+/)
            .map(w => w.trim())
            .filter(w => w.length >= 2 && !stopWords.has(w));
    }

    private keywordScore(text: string, keywords: string[]): number {
        const lowerText = text.toLowerCase();
        let hits = 0;
        for (const kw of keywords) {
            if (lowerText.includes(kw.toLowerCase())) hits++;
        }
        return keywords.length > 0 ? hits / keywords.length : 0;
    }

    /**
     * 尝试调用 LLMHub 的 rerank，对混合召回结果二次排序。
     * 如果失败则静默降级返回原顺序。
     */
    private async tryRerank(query: string, results: HybridSearchResult[]): Promise<HybridSearchResult[]> {
        const llm = (window as any).STX?.llm;
        if (!llm?.rerank || results.length === 0) {
            return results;
        }

        try {
            const docs = results.map((item) => item.content);
            const rerankResp = await llm.rerank({
                consumer: 'memory_os',
                query,
                docs,
            });
            if (!rerankResp?.ok || !Array.isArray(rerankResp.results)) {
                return results;
            }

            const sorted = rerankResp.results
                .map((entry: any) => {
                    const original = results[entry.index];
                    if (!original) return null;
                    return {
                        ...original,
                        score: typeof entry.score === 'number' ? entry.score : original.score,
                    } as HybridSearchResult;
                })
                .filter(Boolean) as HybridSearchResult[];
            return sorted.length > 0 ? sorted : results;
        } catch (error) {
            logger.warn('rerank 失败，使用原排序结果', error);
            return results;
        }
    }
}
