import type { RetrievalMode } from './retrieval-mode';
import type { PayloadFilter } from './payload-filter';

/**
 * 功能：查询级召回配置。
 * 说明：每次检索调用都通过此结构传递行为参数，取代旧的全局散字段。
 */
export type RecallConfig = {
    /** 检索模式 */
    retrievalMode: RetrievalMode;
    /** 最大返回数量 */
    topK: number;
    /** 最低分数阈值 */
    minScore: number;
    /** 图扩展深度（0 表示不扩展） */
    expandDepth: number;
    /** 是否启用混合文本召回 */
    enableHybridText: boolean;
    /** 是否启用图扩展 */
    enableGraphExpansion: boolean;
    /** 是否启用图扩展热点降权 */
    enableGraphPenalty: boolean;
    /** 是否启用多样性裁剪 */
    enableDiversity: boolean;
    /** 候选预过滤 */
    payloadFilter?: PayloadFilter;
    /** 角色范围限定 */
    actorScope?: string[];
    /** schema 范围限定 */
    schemaScope?: string[];
    /** 关系范围限定 */
    relationScope?: string[];
    /** 世界范围限定 */
    worldScope?: string[];
};

/**
 * 功能：构建默认 RecallConfig。
 * @returns 默认配置。
 */
export function buildDefaultRecallConfig(): RecallConfig {
    return {
        retrievalMode: 'lexical_only',
        topK: 18,
        minScore: 0,
        expandDepth: 1,
        enableHybridText: true,
        enableGraphExpansion: true,
        enableGraphPenalty: true,
        enableDiversity: true,
    };
}

/**
 * 功能：用局部覆盖合并 RecallConfig。
 * @param base 基准配置。
 * @param overrides 覆盖项。
 * @returns 合并后的配置。
 */
export function mergeRecallConfig(
    base: RecallConfig,
    overrides?: Partial<RecallConfig>,
): RecallConfig {
    if (!overrides) {
        return { ...base };
    }
    return {
        retrievalMode: overrides.retrievalMode ?? base.retrievalMode,
        topK: overrides.topK ?? base.topK,
        minScore: overrides.minScore ?? base.minScore,
        expandDepth: overrides.expandDepth ?? base.expandDepth,
        enableHybridText: overrides.enableHybridText ?? base.enableHybridText,
        enableGraphExpansion: overrides.enableGraphExpansion ?? base.enableGraphExpansion,
        enableGraphPenalty: overrides.enableGraphPenalty ?? base.enableGraphPenalty,
        enableDiversity: overrides.enableDiversity ?? base.enableDiversity,
        payloadFilter: overrides.payloadFilter ?? base.payloadFilter,
        actorScope: overrides.actorScope ?? base.actorScope,
        schemaScope: overrides.schemaScope ?? base.schemaScope,
        relationScope: overrides.relationScope ?? base.relationScope,
        worldScope: overrides.worldScope ?? base.worldScope,
    };
}
