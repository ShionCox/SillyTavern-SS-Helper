import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet } from './types';
import { matchKeywordSignals, type KeywordMatchResult } from '../memory-keywords';
import { clamp01 } from './scoring';

/**
 * 功能：语境词典注册表，提供实体索引供语境路由使用。
 * actorNames / actorAliases 用于自然语言匹配，actorKeys 用于系统键回写。
 */
export interface ContextDictionaryRegistry {
    actorKeys: string[];
    actorNames: string[];
    actorAliases: string[];
    /** 别名/显示名 → actorKey 的反查表 */
    actorNameToKey: Map<string, string>;
    locationKeys: string[];
    locationNames: string[];
    /** 地点名 → locationKey 反查 */
    locationNameToKey: Map<string, string>;
    relationPairKeys: string[];
    relationAliases: string[];
    worldKeys: string[];
    worldAliases: string[];
}

/**
 * 功能：角色画像信息，用于构建词典。
 */
export interface ActorProfileForDictionary {
    actorKey: string;
    displayName?: string;
    aliases?: string[];
}

/**
 * 功能：从候选记忆列表中动态构建实体词典。
 * @param candidates 候选记忆列表。
 * @param actorProfiles 可选角色画像，提供 displayName/aliases。
 * @returns 词典注册表。
 */
export function buildContextDictionaryFromCandidates(
    candidates: RetrievalCandidate[],
    actorProfiles?: ActorProfileForDictionary[],
): ContextDictionaryRegistry {
    const actorKeySet = new Set<string>();
    const actorNameSet = new Set<string>();
    const actorAliasSet = new Set<string>();
    const actorNameToKey = new Map<string, string>();

    const locationKeySet = new Set<string>();
    const locationNameSet = new Set<string>();
    const locationNameToKey = new Map<string, string>();

    const relationPairKeys = new Set<string>();
    const relationAliasSet = new Set<string>();
    const worldKeySet = new Set<string>();
    const worldAliasSet = new Set<string>();

    for (const candidate of candidates) {
        for (const key of candidate.actorKeys ?? []) {
            if (key) actorKeySet.add(key);
        }
        for (const key of candidate.participantActorKeys ?? []) {
            if (key) actorKeySet.add(key);
        }
        if (candidate.locationKey) {
            locationKeySet.add(candidate.locationKey);
            locationNameSet.add(candidate.locationKey);
            locationNameToKey.set(candidate.locationKey.toLowerCase(), candidate.locationKey);
        }
        for (const key of candidate.relationKeys ?? []) {
            if (key) {
                relationPairKeys.add(key);
                // 从 relation key 中提取可读部分作为 alias
                const parts = key.split(':').filter(Boolean);
                for (const part of parts) {
                    if (part) relationAliasSet.add(part);
                }
            }
        }
        for (const key of candidate.worldKeys ?? []) {
            if (key) {
                worldKeySet.add(key);
                worldAliasSet.add(key);
            }
        }
        // 从 title / tags 中补充世界别名
        if (candidate.schemaId === 'world_core_setting' || candidate.schemaId === 'world_hard_rule' || candidate.schemaId === 'world_global_state') {
            if (candidate.title) worldAliasSet.add(candidate.title);
            for (const tag of candidate.tags ?? []) {
                if (tag) worldAliasSet.add(tag);
            }
        }
        // 从 location 类型的 title 补充地点别名
        if (candidate.schemaId === 'location' || candidate.schemaId === 'scene_shared_state') {
            if (candidate.title) {
                locationNameSet.add(candidate.title);
                locationNameToKey.set(candidate.title.toLowerCase(), candidate.locationKey ?? candidate.title);
            }
        }
    }

    // 从角色画像中提取 displayName 和 aliases
    for (const profile of actorProfiles ?? []) {
        if (!profile.actorKey) continue;
        actorKeySet.add(profile.actorKey);
        if (profile.displayName) {
            actorNameSet.add(profile.displayName);
            actorNameToKey.set(profile.displayName.toLowerCase(), profile.actorKey);
        }
        for (const alias of profile.aliases ?? []) {
            if (alias) {
                actorAliasSet.add(alias);
                actorNameToKey.set(alias.toLowerCase(), profile.actorKey);
            }
        }
    }

    // actorKey 本身也作为 actorName 的备用（兼容无画像场景）
    for (const key of actorKeySet) {
        if (!actorNameToKey.has(key.toLowerCase())) {
            actorNameToKey.set(key.toLowerCase(), key);
        }
    }

    return {
        actorKeys: [...actorKeySet],
        actorNames: [...actorNameSet],
        actorAliases: [...actorAliasSet],
        actorNameToKey,
        locationKeys: [...locationKeySet],
        locationNames: [...locationNameSet],
        locationNameToKey,
        relationPairKeys: [...relationPairKeys],
        relationAliases: [...relationAliasSet],
        worldKeys: [...worldKeySet],
        worldAliases: [...worldAliasSet],
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
 * 功能：最近上下文偏置信息，用于让语境识别不再是孤立句子判定。
 */
export interface RecentContextBias {
    /** 当前场景模式，如 'relationship_conflict' */
    sceneMode?: string;
    /** 当前所在地点 key */
    currentLocationKey?: string;
    /** 当前活跃的关系对 key */
    activeRelationPair?: string;
    /** 上一轮主导的 facet 提示 */
    dominantFacetHints?: RetrievalFacet[];
}

/**
 * 功能：执行检索语境路由，识别当前查询的 facet、实体锚点与主题。
 * @param query 用户输入的查询文本。
 * @param candidates 候选记忆列表。
 * @param dictionaries 可选实体词典注册表。
 * @param recentContext 可选最近上下文偏置。
 * @returns 检索语境路由结果。
 */
export function routeRetrievalContext(
    query: string,
    candidates: RetrievalCandidate[],
    dictionaries?: ContextDictionaryRegistry,
    recentContext?: RecentContextBias,
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

    // 第三步半：收集 reasons
    const reasons: RetrievalContextRoute['reasons'] = [];
    for (const match of keywordMatches) {
        const facets = DICTIONARY_FACET_MAP[match.dictionaryId] ?? [];
        if (facets.length > 0) {
            reasons.push({
                source: 'keyword',
                detail: `词典 ${match.dictionaryId} 命中: ${match.matchedKeywords.slice(0, 3).join(', ')} → ${facets.join(', ')}`,
                weight: clamp01(match.score / 4),
            });
        }
    }
    if (entityAnchors.actorKeys.length > 0) {
        reasons.push({ source: 'entity', detail: `角色锚点: ${entityAnchors.actorKeys.join(', ')}`, weight: 0.25 });
    }
    if (entityAnchors.locationKeys.length > 0) {
        reasons.push({ source: 'entity', detail: `地点锚点: ${entityAnchors.locationKeys.join(', ')}`, weight: 0.3 });
    }
    if (entityAnchors.relationKeys.length > 0) {
        reasons.push({ source: 'entity', detail: `关系锚点: ${entityAnchors.relationKeys.join(', ')}`, weight: 0.35 });
    }
    if (entityAnchors.worldKeys.length > 0) {
        reasons.push({ source: 'entity', detail: `世界锚点: ${entityAnchors.worldKeys.join(', ')}`, weight: 0.3 });
    }

    // 第三步再半：应用最近上下文偏置
    if (recentContext) {
        applyRecentContextBias(normalizedQuery, facetScores, recentContext, entityAnchors, reasons);
    }

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
        reasons,
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
        reasons: [],
    };
}

/**
 * 功能：匹配实体锚点。优先匹配自然语言名称/别名，再回写为系统 key。
 * @param query 归一化后的查询。
 * @param registry 实体词典。
 * @returns 匹配到的实体锚点。
 */
function matchEntityAnchors(
    query: string,
    registry: ContextDictionaryRegistry,
): RetrievalContextRoute['entityAnchors'] {
    // 角色匹配：displayName > aliases > actorKey
    const matchedActorKeys = new Set<string>();
    // 先匹配 displayName
    for (const name of registry.actorNames) {
        if (name && query.includes(name.toLowerCase())) {
            const key = registry.actorNameToKey.get(name.toLowerCase());
            if (key) matchedActorKeys.add(key);
        }
    }
    // 再匹配别名
    for (const alias of registry.actorAliases) {
        if (alias && query.includes(alias.toLowerCase())) {
            const key = registry.actorNameToKey.get(alias.toLowerCase());
            if (key) matchedActorKeys.add(key);
        }
    }
    // 最后回退到 actorKey 直接匹配
    for (const key of registry.actorKeys) {
        if (key && query.includes(key.toLowerCase())) {
            matchedActorKeys.add(key);
        }
    }

    // 地点匹配：locationName > locationKey
    const matchedLocationKeys = new Set<string>();
    for (const name of registry.locationNames) {
        if (name && query.includes(name.toLowerCase())) {
            const key = registry.locationNameToKey.get(name.toLowerCase());
            matchedLocationKeys.add(key ?? name);
        }
    }
    for (const key of registry.locationKeys) {
        if (key && query.includes(key.toLowerCase())) {
            matchedLocationKeys.add(key);
        }
    }

    // 关系匹配：relationAliases + relationPairKeys
    const matchedRelationKeys = new Set<string>();
    for (const key of registry.relationPairKeys) {
        const parts = key.toLowerCase().split(':').filter(Boolean);
        if (parts.some(part => query.includes(part))) {
            matchedRelationKeys.add(key);
        }
    }
    for (const alias of registry.relationAliases) {
        if (alias && query.includes(alias.toLowerCase())) {
            // 找到包含这个 alias 的 relation key
            for (const key of registry.relationPairKeys) {
                if (key.toLowerCase().includes(alias.toLowerCase())) {
                    matchedRelationKeys.add(key);
                }
            }
        }
    }

    // 世界匹配：worldAliases + worldKeys
    const matchedWorldKeys = new Set<string>();
    for (const alias of registry.worldAliases) {
        if (alias && query.includes(alias.toLowerCase())) {
            // 找到匹配的 worldKey
            for (const key of registry.worldKeys) {
                if (key.toLowerCase() === alias.toLowerCase() || alias.toLowerCase().includes(key.toLowerCase())) {
                    matchedWorldKeys.add(key);
                }
            }
            // 如果 alias 本身就是 worldKey 也加入
            if (registry.worldKeys.some(k => k === alias)) {
                matchedWorldKeys.add(alias);
            }
        }
    }
    for (const key of registry.worldKeys) {
        if (key && query.includes(key.toLowerCase())) {
            matchedWorldKeys.add(key);
        }
    }

    return {
        actorKeys: [...matchedActorKeys],
        locationKeys: [...matchedLocationKeys],
        relationKeys: [...matchedRelationKeys],
        worldKeys: [...matchedWorldKeys],
    };
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

/**
 * 功能：应用最近上下文偏置到 facet 分数。
 * @param query 归一化查询。
 * @param scores facet 分数映射。
 * @param recentContext 最近上下文偏置。
 * @param entityAnchors 当前实体锚点。
 * @param reasons 原因数组（追加写入）。
 */
function applyRecentContextBias(
    query: string,
    scores: Map<RetrievalFacet, number>,
    recentContext: RecentContextBias,
    entityAnchors: RetrievalContextRoute['entityAnchors'],
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    // 场景模式偏置
    if (recentContext.sceneMode) {
        const mode = recentContext.sceneMode.toLowerCase();
        if ((mode.includes('conflict') || mode.includes('冲突')) && entityAnchors.actorKeys.length > 0) {
            scores.set('relationship', (scores.get('relationship') ?? 0) + 0.15);
            scores.set('event', (scores.get('event') ?? 0) + 0.1);
            reasons.push({ source: 'recent-context', detail: `场景模式 ${recentContext.sceneMode} + 角色锚点 → 关系/事件偏置`, weight: 0.15 });
        }
        if ((mode.includes('scene') || mode.includes('场景')) && /这里|那里|这地方|这个地方/u.test(query)) {
            scores.set('scene', (scores.get('scene') ?? 0) + 0.2);
            reasons.push({ source: 'recent-context', detail: `场景模式 + 地点代词 → 场景偏置`, weight: 0.2 });
        }
        if (mode.includes('world') || mode.includes('规则') || mode.includes('setting')) {
            scores.set('world', (scores.get('world') ?? 0) + 0.1);
            reasons.push({ source: 'recent-context', detail: `场景模式 ${recentContext.sceneMode} → 世界偏置`, weight: 0.1 });
        }
    }

    // 当前地点偏置
    if (recentContext.currentLocationKey && entityAnchors.locationKeys.length > 0) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.1);
        reasons.push({ source: 'recent-context', detail: `当前地点 ${recentContext.currentLocationKey} 与锚点匹配 → 场景偏置`, weight: 0.1 });
    }

    // 活跃关系对偏置
    if (recentContext.activeRelationPair && entityAnchors.actorKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.12);
        reasons.push({ source: 'recent-context', detail: `活跃关系对 ${recentContext.activeRelationPair} + 角色锚点 → 关系偏置`, weight: 0.12 });
    }

    // 上一轮主导 facet 惯性偏置（较小权重）
    if (recentContext.dominantFacetHints && recentContext.dominantFacetHints.length > 0) {
        for (const hint of recentContext.dominantFacetHints) {
            scores.set(hint, (scores.get(hint) ?? 0) + 0.08);
        }
        reasons.push({ source: 'recent-context', detail: `上轮主导 facet 惯性: ${recentContext.dominantFacetHints.join(', ')}`, weight: 0.08 });
    }
}
