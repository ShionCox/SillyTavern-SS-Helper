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

    category?: string;
    tags?: string[];
    sourceSummaryIds?: string[];

    actorKeys?: string[];
    relationKeys?: string[];
    participantActorKeys?: string[];
    locationKey?: string;
    worldKeys?: string[];

    compareKey?: string;
    injectToSystem?: boolean;
}

/**
 * 功能：定义检索请求。
 */
export interface RetrievalQuery {
    query: string;
    activeActorKey?: string;
    candidateTypes?: string[];
    enableEmbedding?: boolean;

    budget: {
        maxCandidates?: number;
        maxChars?: number;
    };

    expectedFacets?: RetrievalFacet[];
}

/**
 * 功能：定义检索语境 facet 类型。
 */
export type RetrievalFacet = 'world' | 'scene' | 'relationship' | 'event' | 'interpretation';

/**
 * 功能：定义检索语境路由结果。
 */
export interface RetrievalContextRoute {
    facets: RetrievalFacet[];
    entityAnchors: {
        actorKeys: string[];
        locationKeys: string[];
        relationKeys: string[];
        worldKeys: string[];
    };
    topicHints: string[];
    confidence: number;
    /** 语境路由的来源解释，提升 diagnostics 可调试性 */
    reasons?: Array<{
        source: 'keyword' | 'pattern' | 'entity' | 'recent-context';
        detail: string;
        weight: number;
    }>;
}

/**
 * 功能：定义检索得分细节。
 */
export interface RetrievalScoreBreakdown {
    bm25: number;
    ngram: number;
    editDistance: number;
    memoryWeight: number;
    recencyWeight?: number;
    graphBoost?: number;
    diversityPenalty?: number;
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

/**
 * 功能：定义编排器返回结果。
 */
export interface RetrievalOrchestratorResult {
    providerId: string;
    contextRoute: RetrievalContextRoute | null;
    items: RetrievalResultItem[];
    diagnostics?: RetrievalDiagnostics;
}

/**
 * 功能：定义检索全链路诊断信息。
 */
export interface RetrievalDiagnostics {
    contextRoute: RetrievalContextRoute | null;
    seedProviderId: string;
    seedCount: number;
    expandedCount: number;
    coverageTriggeredFacets: RetrievalFacet[];
    diversityDroppedCount: number;
}

