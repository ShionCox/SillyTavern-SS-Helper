/**
 * 功能：定义可检索候选记录。
 */
export interface RetrievalCandidate {
    candidateId: string;
    entryId: string;
    schemaId: string;
    title: string;
    summary: string;
    updatedAt: number;
    memoryPercent: number;
}

/**
 * 功能：定义检索请求。
 */
export interface RetrievalQuery {
    query: string;
    budget: {
        maxCandidates: number;
    };
    candidateTypes?: string[];
    enableEmbedding?: boolean;
}

/**
 * 功能：定义检索得分细节。
 */
export interface RetrievalScoreBreakdown {
    bm25: number;
    ngram: number;
    editDistance: number;
    memoryWeight: number;
}

/**
 * 功能：定义检索结果项。
 */
export interface RetrievalResultItem {
    candidate: RetrievalCandidate;
    score: number;
    breakdown: RetrievalScoreBreakdown;
}

/**
 * 功能：定义检索 provider。
 */
export interface RetrievalProvider {
    providerId: string;
    search(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]>;
}

