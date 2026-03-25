/**
 * 功能：定义抽取策略配置。
 */
export interface ExtractPolicy {
    defaultSummaryInterval: number;
    defaultSummaryWindowSize: number;
    defaultSummaryEnabled: boolean;
    recentEventsQueryLimit: number;
    settledWindowDuplicateMs: number;
    longSummaryCooldownMinTurns: number;
    specialTriggerTypes: string[];
}

/**
 * 功能：定义单个预算档位。
 */
export interface BudgetTierPolicy {
    maxTokens: number;
    maxLatencyMs: number;
    maxCost: number;
}

/**
 * 功能：定义无效 JSON 重试预算策略。
 */
export interface InvalidJsonRetryBudgetPolicy {
    tokenIncrement: number;
    minTokens: number;
    maxTokens: number;
    memoryIngestMinCost: number;
}

/**
 * 功能：定义预算策略配置。
 */
export interface BudgetPolicy {
    ingestTiers: {
        light: BudgetTierPolicy;
        medium: BudgetTierPolicy;
        heavy: BudgetTierPolicy;
    };
    invalidJsonRetry: InvalidJsonRetryBudgetPolicy;
}

/**
 * 功能：定义消息去重策略配置。
 */
export interface DedupPolicy {
    runtimeSignatureWindowMs: number;
    persistedBucketCapacity: number;
    persistedRecentQueryLimit: number;
}

/**
 * 功能：定义记录过滤策略配置。
 */
export interface FilterPolicy {
    defaultFilterTypes: string[];
    defaultJsonExtractKeys: string[];
    defaultCodeblockTags: string[];
    defaultPlaceholderText: string;
    defaultMaxTextLength: number;
    maxTextLengthRange: {
        min: number;
        max: number;
    };
    defaultMinEffectiveChars: number;
    minEffectiveCharsRange: {
        min: number;
        max: number;
    };
}

/**
 * 功能：定义 MemoryOS 统一策略配置。
 */
export interface MemoryOsPolicyConfig {
    extract: ExtractPolicy;
    budget: BudgetPolicy;
    dedup: DedupPolicy;
    filter: FilterPolicy;
}

/**
 * 功能：导出 MemoryOS 当前统一策略配置。
 */
export const MEMORY_OS_POLICY: MemoryOsPolicyConfig = {
    extract: {
        defaultSummaryInterval: 12,
        defaultSummaryWindowSize: 40,
        defaultSummaryEnabled: true,
        recentEventsQueryLimit: 120,
        settledWindowDuplicateMs: 8000,
        longSummaryCooldownMinTurns: 8,
        specialTriggerTypes: [
            'memory.template.changed',
            'world.template.changed',
            'combat.end',
            'combat.round.end',
        ],
    },
    budget: {
        ingestTiers: {
            light: {
                maxTokens: 1800,
                maxLatencyMs: 0,
                maxCost: 0.24,
            },
            medium: {
                maxTokens: 3200,
                maxLatencyMs: 0,
                maxCost: 0.38,
            },
            heavy: {
                maxTokens: 8200,
                maxLatencyMs: 0,
                maxCost: 0.65,
            },
        },
        invalidJsonRetry: {
            tokenIncrement: 400,
            minTokens: 2200,
            maxTokens: 3200,
            memoryIngestMinCost: 0.5,
        },
    },
    dedup: {
        runtimeSignatureWindowMs: 3000,
        persistedBucketCapacity: 64,
        persistedRecentQueryLimit: 200,
    },
    filter: {
        defaultFilterTypes: ['html', 'xml', 'json', 'codeblock'],
        defaultJsonExtractKeys: ['content', 'text', 'message', 'summary', 'description', 'title', 'reason'],
        defaultCodeblockTags: ['rolljson'],
        defaultPlaceholderText: '[代码内容已过滤]',
        defaultMaxTextLength: 4000,
        maxTextLengthRange: {
            min: 200,
            max: 20000,
        },
        defaultMinEffectiveChars: 2,
        minEffectiveCharsRange: {
            min: 1,
            max: 200,
        },
    },
};
