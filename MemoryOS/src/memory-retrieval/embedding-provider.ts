import type { RetrievalCandidate, RetrievalProvider, RetrievalQuery, RetrievalResultItem } from './types';
import type { RetrievalMode } from './retrieval-mode';

/**
 * 功能：Embedding 检索 provider 正式协议壳。
 * 说明：第一阶段不接真实向量后端，但具备完整的 provider 协议：
 *       可用性检查、模式验证、dry-run trace。
 *       第二阶段接入真实向量后端时只需实现 search() 内部逻辑。
 */
export class EmbeddingRetrievalProvider implements RetrievalProvider {
    public readonly providerId: string = 'embedding_vector';

    /**
     * 功能：检查向量 provider 是否当前可用。
     * @returns 当前是否可用。
     */
    public isAvailable(): boolean {
        return false;
    }

    /**
     * 功能：获取不可用原因。
     * @returns 不可用原因字符串，可用时返回 null。
     */
    public getUnavailableReason(): string | null {
        return '向量检索后端尚未接入';
    }

    /**
     * 功能：检查是否支持指定检索模式。
     * @param mode 检索模式。
     * @returns 是否支持。
     */
    public supportsMode(mode: RetrievalMode): boolean {
        return mode === 'vector_only' || mode === 'hybrid';
    }

    /**
     * 功能：执行 embedding 检索。
     * 说明：当前阶段返回空结果，但生成 dry-run trace 以供诊断。
     * @param _query 检索请求。
     * @param _candidates 候选记录。
     * @returns 空结果。
     */
    public async search(_query: RetrievalQuery, _candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]> {
        return [];
    }
}
