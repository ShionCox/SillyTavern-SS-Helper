import type {
    RetrievalCandidate,
    RetrievalProvider,
    RetrievalQuery,
    RetrievalResultItem,
    RetrievalScoreBreakdown,
} from './types';
import { clamp01, computeEditSimilarity, computeMemoryWeight, computeNGramSimilarity, computeRecencyWeight, mergeSeedScoreBreakdown, tokenizeText } from './scoring';

/**
 * 功能：基于 BM25 + n-gram + 编辑距离的词法检索 Provider。
 */
export class LexicalRetrievalProvider implements RetrievalProvider {
    public readonly providerId: string = 'lexical_bm25';

    /**
     * 功能：执行词法检索。
     * @param query 检索请求。
     * @param candidates 候选记录。
     * @returns 检索结果。
     */
    public async search(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]> {
        const normalizedQuery = String(query.query ?? '').trim();
        if (!normalizedQuery) {
            return [];
        }
        const effectiveCandidates = this.filterCandidatesByTypes(candidates, query.candidateTypes);
        if (effectiveCandidates.length <= 0) {
            return [];
        }
        const queryTokens = tokenizeText(normalizedQuery);
        if (queryTokens.length <= 0) {
            return [];
        }
        const documents = effectiveCandidates.map((candidate: RetrievalCandidate): string[] => {
            return tokenizeText(this.buildCandidateText(candidate));
        });
        const averageLength = documents.reduce((sum: number, doc: string[]): number => sum + doc.length, 0) / documents.length;
        const idfMap = this.buildInverseDocumentFrequencyMap(documents);
        const bm25RawScores = documents.map((docTokens: string[]): number => {
            return this.computeBM25Score(queryTokens, docTokens, idfMap, averageLength || 1);
        });
        const maxBm25 = Math.max(...bm25RawScores, 0.0001);

        const scored = effectiveCandidates.map((candidate: RetrievalCandidate, index: number): RetrievalResultItem => {
            const candidateText = this.buildCandidateText(candidate);
            const bm25 = clamp01(bm25RawScores[index] / maxBm25);
            const ngram = computeNGramSimilarity(normalizedQuery, candidateText);
            const editDistance = computeEditSimilarity(normalizedQuery, candidateText);
            const memoryWeight = computeMemoryWeight(candidate.memoryPercent);
            const recencyWeight = computeRecencyWeight(candidate.updatedAt);
            const score = mergeSeedScoreBreakdown({ bm25, ngram, editDistance, memoryWeight, recencyWeight });
            const breakdown: RetrievalScoreBreakdown = { bm25, ngram, editDistance, memoryWeight, recencyWeight };
            return {
                candidate,
                score,
                breakdown,
            };
        });

        const maxCandidates = Math.max(1, Number(query.budget?.maxCandidates ?? 30) || 30);
        return scored
            .sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score)
            .slice(0, maxCandidates);
    }

    /**
     * 功能：按候选类型筛选。
     * @param candidates 全量候选。
     * @param candidateTypes 类型列表。
     * @returns 过滤后的候选。
     */
    private filterCandidatesByTypes(candidates: RetrievalCandidate[], candidateTypes?: string[]): RetrievalCandidate[] {
        const typeSet = new Set((candidateTypes ?? []).map((type: string): string => String(type ?? '').trim()).filter(Boolean));
        if (typeSet.size <= 0) {
            return candidates;
        }
        return candidates.filter((candidate: RetrievalCandidate): boolean => {
            return typeSet.has(candidate.schemaId) || typeSet.has(this.normalizeSchemaAlias(candidate.schemaId));
        });
    }

    /**
     * 功能：把当前候选拼成检索文本。扩展版：包含结构字段。
     * @param candidate 候选记录。
     * @returns 检索文本。
     */
    private buildCandidateText(candidate: RetrievalCandidate): string {
        const parts: string[] = [
            String(candidate.title ?? ''),
            String(candidate.summary ?? ''),
            String(candidate.schemaId ?? ''),
        ];
        if (candidate.category) {
            parts.push(String(candidate.category));
        }
        if (candidate.tags && candidate.tags.length > 0) {
            parts.push(candidate.tags.join(' '));
        }
        if (candidate.relationKeys && candidate.relationKeys.length > 0) {
            parts.push(candidate.relationKeys.join(' '));
        }
        if (candidate.locationKey) {
            parts.push(String(candidate.locationKey));
        }
        if (candidate.actorKeys && candidate.actorKeys.length > 0) {
            parts.push(candidate.actorKeys.join(' '));
        }
        if (candidate.aliasTexts && candidate.aliasTexts.length > 0) {
            parts.push(candidate.aliasTexts.join(' '));
        }
        return parts.join(' ').trim().toLowerCase();
    }

    /**
     * 功能：构建倒排 IDF 表。
     * @param documents 文档 token 集合。
     * @returns IDF 映射表。
     */
    private buildInverseDocumentFrequencyMap(documents: string[][]): Map<string, number> {
        const totalDocs = documents.length;
        const documentFreq = new Map<string, number>();
        for (const tokens of documents) {
            const unique = new Set(tokens);
            unique.forEach((token: string): void => {
                documentFreq.set(token, (documentFreq.get(token) ?? 0) + 1);
            });
        }
        const idfMap = new Map<string, number>();
        documentFreq.forEach((df: number, token: string): void => {
            const value = Math.log(1 + ((totalDocs - df + 0.5) / (df + 0.5)));
            idfMap.set(token, value);
        });
        return idfMap;
    }

    /**
     * 功能：计算 BM25 分数。
     * @param queryTokens 查询 token。
     * @param docTokens 文档 token。
     * @param idfMap IDF 映射。
     * @param averageDocLength 文档平均长度。
     * @returns BM25 分数。
     */
    private computeBM25Score(
        queryTokens: string[],
        docTokens: string[],
        idfMap: Map<string, number>,
        averageDocLength: number,
    ): number {
        const frequency = new Map<string, number>();
        for (const token of docTokens) {
            frequency.set(token, (frequency.get(token) ?? 0) + 1);
        }
        const k1 = 1.2;
        const b = 0.75;
        const docLength = docTokens.length || 1;
        let score = 0;
        for (const token of queryTokens) {
            const tf = frequency.get(token) ?? 0;
            if (tf <= 0) {
                continue;
            }
            const idf = idfMap.get(token) ?? 0;
            const numerator = tf * (k1 + 1);
            const denominator = tf + k1 * (1 - b + b * (docLength / averageDocLength));
            score += idf * (numerator / denominator);
        }
        return score;
    }

    /**
     * 功能：归一化 schema 别名。
     * @param schemaId schema 类型名。
     * @returns 归一化类型。
     */
    private normalizeSchemaAlias(schemaId: string): string {
        return String(schemaId ?? '').trim().toLowerCase();
    }
}
