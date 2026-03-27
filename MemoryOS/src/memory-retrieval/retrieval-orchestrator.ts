import type { RetrievalCandidate, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';
import { LexicalRetrievalProvider } from './lexical-provider';
import { EmbeddingRetrievalProvider } from './embedding-provider';

/**
 * 功能：检索编排器，负责按配置选择 provider。
 */
export class RetrievalOrchestrator {
    private readonly lexicalProvider: RetrievalProvider;
    private readonly embeddingProvider: RetrievalProvider;

    /**
     * 功能：初始化检索编排器。
     * @param lexicalProvider 可选词法 provider。
     * @param embeddingProvider 可选 embedding provider。
     */
    constructor(
        lexicalProvider: RetrievalProvider = new LexicalRetrievalProvider(),
        embeddingProvider: RetrievalProvider = new EmbeddingRetrievalProvider(),
    ) {
        this.lexicalProvider = lexicalProvider;
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * 功能：执行预算式召回。
     * @param query 检索请求。
     * @param candidates 候选记录。
     * @returns 检索结果与 provider 信息。
     */
    public async retrieve(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<{
        providerId: string;
        items: RetrievalResultItem[];
    }> {
        if (query.enableEmbedding) {
            const embeddingItems = await this.embeddingProvider.search(query, candidates);
            if (embeddingItems.length > 0) {
                return {
                    providerId: this.embeddingProvider.providerId,
                    items: embeddingItems,
                };
            }
        }
        const lexicalItems = await this.lexicalProvider.search(query, candidates);
        return {
            providerId: this.lexicalProvider.providerId,
            items: lexicalItems,
        };
    }
}

