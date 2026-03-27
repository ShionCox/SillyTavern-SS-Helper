import type { RetrievalCandidate, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';

/**
 * 功能：Embedding 检索 provider 占位实现。
 * 说明：第一阶段默认不启用 embedding，仅保留接口位置。
 */
export class EmbeddingRetrievalProvider implements RetrievalProvider {
    public readonly providerId: string = 'embedding_placeholder';

    /**
     * 功能：执行 embedding 检索。
     * @param _query 检索请求。
     * @param _candidates 候选记录。
     * @returns 空结果。
     */
    public async search(_query: RetrievalQuery, _candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]> {
        return [];
    }
}

