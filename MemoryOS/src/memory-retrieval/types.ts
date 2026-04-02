import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import type { RetrievalMode } from './retrieval-mode';
import type { MemoryTimeContext, PromptTimeMeta } from '../memory-time/time-types';

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
    aliasTexts?: string[];
    /** 时间上下文 */
    timeContext?: MemoryTimeContext;
    /** 提示词时间元信息，仅用于运行时注入 */
    promptTimeMeta?: PromptTimeMeta;
}

/**
 * 功能：定义检索请求。
 */
export interface RetrievalQuery {
    query: string;
    activeActorKey?: string;
    candidateTypes?: string[];
    chatKey?: string;
    rulePackMode?: RetrievalRulePackMode;

    budget: {
        maxCandidates?: number;
        maxChars?: number;
    };

    expectedFacets?: RetrievalFacet[];
}

/**
 * 功能：定义检索语境 facet 类型。
 */
export type RetrievalFacet = 'world' | 'scene' | 'relationship' | 'event' | 'interpretation' | 'organization_politics';
export type RetrievalRulePackMode = 'native' | 'perocore' | 'hybrid';

/**
 * 功能：定义命中的可解释规则。
 */
export interface RetrievalMatchedRule {
    pack: Exclude<RetrievalRulePackMode, 'hybrid'>;
    ruleId: string;
    label: string;
    matchedText: string[];
}

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
    subQueries?: string[];
    matchedRulePack?: RetrievalRulePackMode;
    matchedRules?: RetrievalMatchedRule[];
    systemEventPrefix?: string;
    /** 语境路由的来源解释，提升 diagnostics 可调试性 */
    reasons?: Array<{
        source: 'keyword' | 'pattern' | 'entity' | 'recent-context' | 'perocore-rule';
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
    /** 时间敏感加权 */
    timeBoost?: number;
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
 * 功能：定义检索 provider 能力协议。
 */
export interface RetrievalProviderCapability {
    /** provider 标识 */
    providerId: string;
    /** 是否当前可用 */
    available: boolean;
    /** 不可用原因 */
    unavailableReason: string | null;
    /** 支持哪些检索模式 */
    supportedModes: RetrievalMode[];
}

/**
 * 功能：定义检索 provider。
 */
export interface RetrievalProvider {
    providerId: string;
    search(query: RetrievalQuery, candidates: RetrievalCandidate[]): Promise<RetrievalResultItem[]>;
    /** 是否当前可用 */
    isAvailable(): boolean;
    /** 不可用原因 */
    getUnavailableReason(): string | null;
    /** 是否支持指定模式 */
    supportsMode(mode: RetrievalMode): boolean;
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
    retrievalMode: RetrievalMode;
    seedProviderId: string;
    seedCount: number;
    expandedCount: number;
    coverageTriggeredFacets: RetrievalFacet[];
    diversityDroppedCount: number;
    finalCount: number;
    seedQueryText: string;
    boostSchemaIds: string[];
    coverageSubQueries: Partial<Record<RetrievalFacet, string>>;
    traceRecords: MemoryDebugLogRecord[];
    /** 向量 provider 是否可用 */
    vectorProviderAvailable: boolean;
    /** 向量 provider 不可用原因 */
    vectorUnavailableReason: string | null;
}
