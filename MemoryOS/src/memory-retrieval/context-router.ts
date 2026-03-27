import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet } from './types';
import { matchKeywordSignals, type KeywordMatchResult } from '../memory-keywords';
import { clamp01 } from './scoring';

/**
 * 功能：语境词典注册表，提供实体索引供语境路由使用。
 */
export interface ContextDictionaryRegistry {
    actorNames: string[];
    actorKeys: string[];
    locationNames: string[];
    relationPairKeys: string[];
    worldKeys: string[];
}

/**
 * 功能：从候选记忆列表中动态构建实体词典。
 * @param candidates 候选记忆列表。
 * @returns 词典注册表。
 */
export function buildContextDictionaryFromCandidates(candidates: RetrievalCandidate[]): ContextDictionaryRegistry {
    const actorKeys = new Set<string>();
    const locationNames = new Set<string>();
    const relationPairKeys = new Set<string>();
    const worldKeys = new Set<string>();

    for (const candidate of candidates) {
        for (const key of candidate.actorKeys ?? []) {
            if (key) actorKeys.add(key);
        }
        for (const key of candidate.participantActorKeys ?? []) {
            if (key) actorKeys.add(key);
        }
        if (candidate.locationKey) {
            locationNames.add(candidate.locationKey);
        }
        for (const key of candidate.relationKeys ?? []) {
            if (key) relationPairKeys.add(key);
        }
        for (const key of candidate.worldKeys ?? []) {
            if (key) worldKeys.add(key);
        }
    }

    return {
        actorNames: [...actorKeys],
        actorKeys: [...actorKeys],
        locationNames: [...locationNames],
        relationPairKeys: [...relationPairKeys],
        worldKeys: [...worldKeys],
    };
}

/**
 * 功能：facet 到 schemaId 映射。
 */
const FACET_SCHEMA_MAP: Record<RetrievalFacet, string[]> = {
    world: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'world_hard_rule_legacy'],
    scene: ['scene_shared_state', 'location'],
    relationship: ['relationship', 'actor_profile'],
    event: ['event', 'actor_visible_event'],
    interpretation: ['actor_private_interpretation'],
};

/**
 * 功能：关键词词典 ID 到 facet 映射。
 */
const DICTIONARY_FACET_MAP: Record<string, RetrievalFacet[]> = {
    conflict: ['relationship', 'event'],
    repair: ['relationship', 'event'],
    'scene-transition': ['scene', 'event'],
    'setting-qa': ['world'],
    'plot-progress': ['event', 'relationship'],
};

/**
 * 功能：执行检索语境路由，识别当前查询的 facet、实体锚点与主题。
 * @param query 用户输入的查询文本。
 * @param candidates 候选记忆列表。
 * @param dictionaries 可选实体词典注册表。
 * @returns 检索语境路由结果。
 */
export function routeRetrievalContext(
    query: string,
    candidates: RetrievalCandidate[],
    dictionaries?: ContextDictionaryRegistry,
): RetrievalContextRoute {
    const normalizedQuery = String(query ?? '').toLowerCase().trim();
    if (!normalizedQuery) {
        return createEmptyRoute();
    }

    const registry = dictionaries ?? buildContextDictionaryFromCandidates(candidates);

    // 第一步：关键词与句式匹配
    const keywordMatches = matchKeywordSignals(normalizedQuery);

    // 第二步：实体锚点匹配
    const entityAnchors = matchEntityAnchors(normalizedQuery, registry);

    // 第三步：facet 打分
    const facetScores = computeFacetScores(normalizedQuery, keywordMatches, entityAnchors, candidates);

    // 第四步：提取 topic hints
    const topicHints = extractTopicHints(keywordMatches);

    // 第五步：选取置信度大于阈值的 facets
    const threshold = 0.15;
    const activeFacets: RetrievalFacet[] = [];
    const allFacets: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation'];
    for (const facet of allFacets) {
        if ((facetScores.get(facet) ?? 0) >= threshold) {
            activeFacets.push(facet);
        }
    }

    // 如果没有任何匹配的 facet，默认给出 event + relationship
    if (activeFacets.length <= 0) {
        activeFacets.push('event', 'relationship');
    }

    // 排序：按分数降序
    activeFacets.sort((a, b) => (facetScores.get(b) ?? 0) - (facetScores.get(a) ?? 0));

    // 计算总体置信度
    const maxScore = Math.max(...activeFacets.map(f => facetScores.get(f) ?? 0), 0);
    const confidence = clamp01(maxScore);

    return {
        facets: activeFacets,
        entityAnchors,
        topicHints,
        confidence,
    };
}

/**
 * 功能：创建空的语境路由结果。
 * @returns 空路由。
 */
function createEmptyRoute(): RetrievalContextRoute {
    return {
        facets: [],
        entityAnchors: { actorKeys: [], locationKeys: [], relationKeys: [], worldKeys: [] },
        topicHints: [],
        confidence: 0,
    };
}

/**
 * 功能：匹配实体锚点。
 * @param query 归一化后的查询。
 * @param registry 实体词典。
 * @returns 匹配到的实体锚点。
 */
function matchEntityAnchors(
    query: string,
    registry: ContextDictionaryRegistry,
): RetrievalContextRoute['entityAnchors'] {
    const actorKeys = registry.actorKeys.filter(key => query.includes(key.toLowerCase()));
    const locationKeys = registry.locationNames.filter(name => query.includes(name.toLowerCase()));
    const relationKeys = registry.relationPairKeys.filter(key => {
        const parts = key.toLowerCase().split(':').filter(Boolean);
        return parts.some(part => query.includes(part));
    });
    const worldKeys = registry.worldKeys.filter(key => query.includes(key.toLowerCase()));

    return { actorKeys, locationKeys, relationKeys, worldKeys };
}

/**
 * 功能：计算 5 类 facet 各自的分数。
 * @param query 查询文本。
 * @param keywordMatches 关键词匹配结果。
 * @param entityAnchors 实体锚点。
 * @param candidates 候选列表。
 * @returns facet 分数映射。
 */
function computeFacetScores(
    query: string,
    keywordMatches: KeywordMatchResult[],
    entityAnchors: RetrievalContextRoute['entityAnchors'],
    candidates: RetrievalCandidate[],
): Map<RetrievalFacet, number> {
    const scores = new Map<RetrievalFacet, number>();
    const allFacets: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation'];
    for (const facet of allFacets) {
        scores.set(facet, 0);
    }

    // 1. 关键词词典贡献
    for (const match of keywordMatches) {
        const facets = DICTIONARY_FACET_MAP[match.dictionaryId] ?? [];
        const contribution = clamp01(match.score / 4);
        for (const facet of facets) {
            scores.set(facet, (scores.get(facet) ?? 0) + contribution);
        }
    }

    // 2. 实体锚点贡献
    if (entityAnchors.actorKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.25);
        scores.set('event', (scores.get('event') ?? 0) + 0.1);
    }
    if (entityAnchors.locationKeys.length > 0) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.3);
        scores.set('event', (scores.get('event') ?? 0) + 0.1);
    }
    if (entityAnchors.relationKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.35);
    }
    if (entityAnchors.worldKeys.length > 0) {
        scores.set('world', (scores.get('world') ?? 0) + 0.3);
    }

    // 3. 句式模式贡献
    applyPatternScores(query, scores);

    // 4. 候选类型分布贡献
    applyCandidateDistributionScores(candidates, scores);

    // 限制每个 facet 分数在 0~1
    for (const facet of allFacets) {
        scores.set(facet, clamp01(scores.get(facet) ?? 0));
    }

    return scores;
}

/**
 * 功能：通过句式模式增加 facet 分数。
 * @param query 查询文本。
 * @param scores facet 分数映射。
 */
function applyPatternScores(query: string, scores: Map<RetrievalFacet, number>): void {
    // 世界/规则相关句式
    if (/为什么.*(不能|不行|禁止|规定|规则)/u.test(query) || /.*规则|.*法则|.*禁令/u.test(query)) {
        scores.set('world', (scores.get('world') ?? 0) + 0.3);
    }
    // 关系/情感相关句式
    if (/你.*(还是|为什么|怎么).*(不信|不爱|讨厌|恨|喜欢|在意)/u.test(query) || /我们.*(之间|关系)/u.test(query)) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.35);
    }
    // 事件/回忆相关句式
    if (/那(天|晚|次|时|年|个)/u.test(query) || /还记得|当时|发生了什么|后来/u.test(query)) {
        scores.set('event', (scores.get('event') ?? 0) + 0.25);
    }
    // 场景相关句式
    if (/这(里|个地方|座|条)|到了|来到|走进/u.test(query)) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.2);
    }
    // 主观理解相关句式
    if (/我(觉得|认为|感觉|猜|怀疑)|你(觉得|认为|怎么看)/u.test(query)) {
        scores.set('interpretation', (scores.get('interpretation') ?? 0) + 0.25);
    }
}

/**
 * 功能：通过候选记忆的类型分布微调 facet 分数。
 * @param candidates 候选列表。
 * @param scores facet 分数映射。
 */
function applyCandidateDistributionScores(
    candidates: RetrievalCandidate[],
    scores: Map<RetrievalFacet, number>,
): void {
    if (candidates.length <= 0) return;

    const total = candidates.length;
    const facetCounts = new Map<RetrievalFacet, number>();
    const allFacets: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation'];

    for (const candidate of candidates) {
        for (const facet of allFacets) {
            const schemas = FACET_SCHEMA_MAP[facet];
            if (schemas.includes(candidate.schemaId)) {
                facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
            }
        }
    }

    // 存在越多某类型候选，微弱提升该 facet
    for (const facet of allFacets) {
        const ratio = (facetCounts.get(facet) ?? 0) / total;
        if (ratio > 0.1) {
            scores.set(facet, (scores.get(facet) ?? 0) + ratio * 0.1);
        }
    }
}

/**
 * 功能：从关键词匹配结果中提取主题提示。
 * @param matches 关键词匹配结果。
 * @returns 主题提示列表。
 */
function extractTopicHints(matches: KeywordMatchResult[]): string[] {
    const hints: string[] = [];
    for (const match of matches) {
        for (const hint of match.intentHints) {
            if (hint && !hints.includes(hint)) {
                hints.push(hint);
            }
        }
        for (const keyword of match.matchedKeywords.slice(0, 3)) {
            if (keyword && !hints.includes(keyword)) {
                hints.push(keyword);
            }
        }
    }
    return hints.slice(0, 10);
}
