import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import type { RetrievalCandidate, RetrievalContextRoute, RetrievalFacet, RetrievalMatchedRule, RetrievalRulePackMode } from './types';
import {
    loadKeywordDictionaries,
    matchKeywordSignals,
    type KeywordMatchResult,
    type KeywordPackMode,
    PEROCORE_MEMORY_TYPE_RULES,
    PEROCORE_THOUGHT_CLUSTER_RULES,
    matchPerocoreSystemPrefix,
    splitTextByPerocoreRules,
    stripPerocoreSystemPrefix,
} from '../memory-keywords';
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
 * 功能：最近上下文偏置信息，用于让语境识别不再是孤立句子判定。
 */
export interface RecentContextBias {
    /** 当前场景模式，如 `relationship_conflict` */
    sceneMode?: string;
    /** 当前所在地点 key */
    currentLocationKey?: string;
    /** 当前活跃的关系对 key */
    activeRelationPair?: string;
    /** 上一轮主导的 facet 提示 */
    dominantFacetHints?: RetrievalFacet[];
}

/**
 * 功能：语境路由额外选项。
 */
export interface RouteRetrievalContextOptions {
    rulePackMode?: RetrievalRulePackMode;
    onTrace?: (record: MemoryDebugLogRecord) => void;
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
    organization_politics: ['organization', 'city', 'nation', 'location'],
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
    perocore_relationship_conflict: ['relationship', 'event'],
    perocore_world_qa: ['world', 'interpretation'],
    perocore_scene: ['scene', 'event'],
    perocore_system_event: ['event', 'scene'],
    perocore_social: ['relationship', 'scene', 'event'],
    perocore_environment: ['scene', 'event'],
    perocore_coding: ['world', 'event', 'interpretation'],
    perocore_file_analysis: ['world', 'event', 'interpretation'],
    perocore_work_mode: ['event', 'scene', 'interpretation'],
    perocore_planning: ['event', 'interpretation'],
    perocore_reflection: ['interpretation', 'event'],
    'organization-politics': ['organization_politics', 'world', 'event'],
    perocore_organization: ['organization_politics', 'world', 'event'],
};

const ALL_FACETS: RetrievalFacet[] = ['world', 'scene', 'relationship', 'event', 'interpretation', 'organization_politics'];

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
            if (key) {
                actorKeySet.add(key);
            }
        }
        for (const key of candidate.participantActorKeys ?? []) {
            if (key) {
                actorKeySet.add(key);
            }
        }
        for (const alias of candidate.aliasTexts ?? []) {
            if (alias) {
                actorAliasSet.add(alias);
                const mappedActorKey = candidate.actorKeys?.[0];
                if (mappedActorKey) {
                    actorNameToKey.set(alias.toLowerCase(), mappedActorKey);
                }
            }
        }
        if (candidate.locationKey) {
            locationKeySet.add(candidate.locationKey);
            locationNameSet.add(candidate.locationKey);
            locationNameToKey.set(candidate.locationKey.toLowerCase(), candidate.locationKey);
        }
        for (const key of candidate.relationKeys ?? []) {
            if (!key) {
                continue;
            }
            relationPairKeys.add(key);
            const parts = key.split(':').filter(Boolean);
            for (const part of parts) {
                relationAliasSet.add(part);
            }
        }
        for (const key of candidate.worldKeys ?? []) {
            if (!key) {
                continue;
            }
            worldKeySet.add(key);
            worldAliasSet.add(key);
        }
        if (candidate.schemaId === 'world_core_setting' || candidate.schemaId === 'world_hard_rule' || candidate.schemaId === 'world_global_state') {
            if (candidate.title) {
                worldAliasSet.add(candidate.title);
            }
            for (const tag of candidate.tags ?? []) {
                if (tag) {
                    worldAliasSet.add(tag);
                }
            }
        }
        if (candidate.schemaId === 'location' || candidate.schemaId === 'scene_shared_state') {
            if (candidate.title) {
                locationNameSet.add(candidate.title);
                locationNameToKey.set(candidate.title.toLowerCase(), candidate.locationKey ?? candidate.title);
            }
        }
        if (candidate.schemaId === 'organization' || candidate.schemaId === 'city' || candidate.schemaId === 'nation') {
            if (candidate.title) {
                worldAliasSet.add(candidate.title);
            }
            for (const alias of candidate.aliasTexts ?? []) {
                if (alias) {
                    worldAliasSet.add(alias);
                }
            }
            if (candidate.compareKey) {
                worldKeySet.add(candidate.compareKey);
            }
        }
    }

    for (const profile of actorProfiles ?? []) {
        if (!profile.actorKey) {
            continue;
        }
        actorKeySet.add(profile.actorKey);
        if (profile.displayName) {
            actorNameSet.add(profile.displayName);
            actorNameToKey.set(profile.displayName.toLowerCase(), profile.actorKey);
        }
        for (const alias of profile.aliases ?? []) {
            if (!alias) {
                continue;
            }
            actorAliasSet.add(alias);
            actorNameToKey.set(alias.toLowerCase(), profile.actorKey);
        }
    }

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
 * 功能：执行检索语境路由，识别当前查询的 facet、实体锚点与主题。
 * @param query 用户输入的查询文本。
 * @param candidates 候选记忆列表。
 * @param dictionaries 可选实体词典注册表。
 * @param recentContext 可选最近上下文偏置。
 * @param options 可选路由选项。
 * @returns 检索语境路由结果。
 */
export function routeRetrievalContext(
    query: string,
    candidates: RetrievalCandidate[],
    dictionaries?: ContextDictionaryRegistry,
    recentContext?: RecentContextBias,
    options: RouteRetrievalContextOptions = {},
): RetrievalContextRoute {
    const originalQuery = String(query ?? '').trim();
    if (!originalQuery) {
        return createEmptyRoute(options.rulePackMode ?? 'hybrid');
    }

    const rulePackMode = options.rulePackMode ?? 'hybrid';
    const onTrace = options.onTrace;
    const registry = dictionaries ?? buildContextDictionaryFromCandidates(candidates);
    const systemEventPrefix = matchPerocoreSystemPrefix(originalQuery);
    const strippedQuery = stripPerocoreSystemPrefix(originalQuery);
    const normalizedQuery = String(strippedQuery || originalQuery).toLowerCase().trim();
    const subQueries = dedupeStrings(
        splitTextByPerocoreRules(strippedQuery || originalQuery).map((item: string): string => item.toLowerCase()),
    );
    const effectiveSubQueries = subQueries.length > 0 ? subQueries : [normalizedQuery];
    const dictionariesForMatch = loadKeywordDictionaries(rulePackMode as KeywordPackMode);
    const keywordMatches = collectKeywordMatches(effectiveSubQueries, dictionariesForMatch);
    const entityAnchors = matchEntityAnchors(normalizedQuery, registry);
    const facetScores = createFacetScoreMap();
    const reasons: NonNullable<RetrievalContextRoute['reasons']> = [];
    const matchedRules: RetrievalMatchedRule[] = [];

    emitContextTrace(onTrace, '开始判定', '开始进行情境判定。', {
        原始长度: originalQuery.length,
        规则包: rulePackMode,
    });

    if (systemEventPrefix) {
        facetScores.set('event', (facetScores.get('event') ?? 0) + 0.2);
        facetScores.set('world', (facetScores.get('world') ?? 0) + 0.08);
        pushMatchedRule(matchedRules, {
            pack: 'perocore',
            ruleId: 'perocore_system_prefix',
            label: '系统事件前缀',
            matchedText: [systemEventPrefix],
        });
        reasons.push({
            source: 'perocore-rule',
            detail: `检测到系统事件前缀 ${systemEventPrefix}，当前输入按系统事件处理。`,
            weight: 0.2,
        });
        emitContextTrace(onTrace, '系统前缀', '检测到系统事件前缀：当前输入不按普通用户自然发言处理。', {
            系统前缀: systemEventPrefix,
        });
    }

    if (effectiveSubQueries.length > 1) {
        emitContextTrace(onTrace, '子句切分', `按兼容规则将输入拆分为 ${effectiveSubQueries.length} 个子句。`, {
            子句列表: effectiveSubQueries,
        });
    }

    applyKeywordSignals(keywordMatches, facetScores, reasons, matchedRules);
    applyEntitySignals(entityAnchors, facetScores, reasons);
    applyPatternScores(normalizedQuery, facetScores, reasons);
    applyPerocoreMemoryTypeInference(effectiveSubQueries, facetScores, reasons, matchedRules);
    applyPerocoreThoughtClusters(effectiveSubQueries, facetScores, reasons, matchedRules);
    applyCandidateDistributionScores(candidates, facetScores, reasons);

    if (recentContext) {
        applyRecentContextBias(normalizedQuery, facetScores, recentContext, entityAnchors, reasons);
    }

    if (entityAnchors.actorKeys.length > 0) {
        emitContextTrace(onTrace, '角色锚点', `命中角色锚点：${entityAnchors.actorKeys.join('、')}。`, {
            角色锚点: entityAnchors.actorKeys,
        });
    }
    if (entityAnchors.locationKeys.length > 0) {
        emitContextTrace(onTrace, '地点锚点', `命中地点锚点：${entityAnchors.locationKeys.join('、')}。`, {
            地点锚点: entityAnchors.locationKeys,
        });
    }
    if (entityAnchors.relationKeys.length > 0) {
        emitContextTrace(onTrace, '关系锚点', `命中关系锚点：${entityAnchors.relationKeys.join('、')}。`, {
            关系锚点: entityAnchors.relationKeys,
        });
    }
    if (keywordMatches.length > 0) {
        const keywordSummary = keywordMatches
            .slice(0, 4)
            .map((match: KeywordMatchResult): string => `${match.label}：${match.matchedKeywords.slice(0, 3).join('、')}`);
        emitContextTrace(onTrace, '规则命中', `已命中 ${keywordSummary.length} 组语义规则。`, {
            命中规则: keywordSummary,
        });
    }

    const topicHints = extractTopicHints(keywordMatches, matchedRules);
    const activeFacets = resolveActiveFacets(facetScores);
    const confidence = clamp01(Math.max(...activeFacets.map((facet: RetrievalFacet): number => facetScores.get(facet) ?? 0), 0));

    emitContextTrace(
        onTrace,
        '判定结果',
        `当前输入被判定为：${activeFacets.join(' > ')}，置信度 ${confidence.toFixed(2)}。`,
        {
            facets: activeFacets,
            confidence,
            matchedRules,
        },
    );

    return {
        facets: activeFacets,
        entityAnchors,
        topicHints,
        confidence,
        subQueries: effectiveSubQueries,
        matchedRulePack: rulePackMode,
        matchedRules,
        systemEventPrefix,
        reasons,
    };
}

/**
 * 功能：创建空的语境路由结果。
 * @param rulePackMode 规则包模式。
 * @returns 空路由。
 */
function createEmptyRoute(rulePackMode: RetrievalRulePackMode): RetrievalContextRoute {
    return {
        facets: [],
        entityAnchors: { actorKeys: [], locationKeys: [], relationKeys: [], worldKeys: [] },
        topicHints: [],
        confidence: 0,
        subQueries: [],
        matchedRulePack: rulePackMode,
        matchedRules: [],
        reasons: [],
    };
}

/**
 * 功能：创建 facet 分数表。
 * @returns 分数表。
 */
function createFacetScoreMap(): Map<RetrievalFacet, number> {
    const scores = new Map<RetrievalFacet, number>();
    for (const facet of ALL_FACETS) {
        scores.set(facet, 0);
    }
    return scores;
}

/**
 * 功能：聚合多子句关键词命中结果。
 * @param subQueries 子句列表。
 * @param dictionaries 关键词词典。
 * @returns 去重后的关键词命中列表。
 */
function collectKeywordMatches(subQueries: string[], dictionaries: ReturnType<typeof loadKeywordDictionaries>): KeywordMatchResult[] {
    const resultMap = new Map<string, KeywordMatchResult>();
    for (const subQuery of subQueries) {
        for (const match of matchKeywordSignals(subQuery, dictionaries)) {
            const key = `${match.pack}:${match.dictionaryId}`;
            const existing = resultMap.get(key);
            if (!existing) {
                resultMap.set(key, {
                    ...match,
                    matchedKeywords: [...match.matchedKeywords],
                    candidateTypes: [...match.candidateTypes],
                    intentHints: [...match.intentHints],
                });
                continue;
            }
            existing.score = Math.max(existing.score, match.score);
            existing.matchedKeywords = dedupeStrings([...existing.matchedKeywords, ...match.matchedKeywords]);
            existing.candidateTypes = dedupeStrings([...existing.candidateTypes, ...match.candidateTypes]);
            existing.intentHints = dedupeStrings([...existing.intentHints, ...match.intentHints]);
        }
    }
    return [...resultMap.values()].sort((left: KeywordMatchResult, right: KeywordMatchResult): number => right.score - left.score);
}

/**
 * 功能：把关键词信号映射到 facet 分数。
 * @param keywordMatches 关键词命中列表。
 * @param facetScores facet 分数表。
 * @param reasons 原因列表。
 * @param matchedRules 规则命中列表。
 * @returns 无返回值。
 */
function applyKeywordSignals(
    keywordMatches: KeywordMatchResult[],
    facetScores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
    matchedRules: RetrievalMatchedRule[],
): void {
    for (const match of keywordMatches) {
        const facets = DICTIONARY_FACET_MAP[match.dictionaryId] ?? [];
        const contribution = clamp01(match.score / 4);
        for (const facet of facets) {
            facetScores.set(facet, (facetScores.get(facet) ?? 0) + contribution);
        }
        if (facets.length > 0) {
            reasons.push({
                source: 'keyword',
                detail: `命中规则 ${match.label}：${match.matchedKeywords.slice(0, 3).join('、')}。`,
                weight: contribution,
            });
        }
        pushMatchedRule(matchedRules, {
            pack: match.pack,
            ruleId: match.dictionaryId,
            label: match.label,
            matchedText: match.matchedKeywords,
        });
    }
}

/**
 * 功能：根据实体锚点增加 facet 分数。
 * @param entityAnchors 实体锚点。
 * @param scores facet 分数表。
 * @param reasons 原因列表。
 * @returns 无返回值。
 */
function applyEntitySignals(
    entityAnchors: RetrievalContextRoute['entityAnchors'],
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    if (entityAnchors.actorKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.25);
        scores.set('event', (scores.get('event') ?? 0) + 0.1);
        reasons.push({ source: 'entity', detail: `角色锚点命中：${entityAnchors.actorKeys.join('、')}。`, weight: 0.25 });
    }
    if (entityAnchors.locationKeys.length > 0) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.3);
        scores.set('event', (scores.get('event') ?? 0) + 0.1);
        reasons.push({ source: 'entity', detail: `地点锚点命中：${entityAnchors.locationKeys.join('、')}。`, weight: 0.3 });
    }
    if (entityAnchors.relationKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.35);
        reasons.push({ source: 'entity', detail: `关系锚点命中：${entityAnchors.relationKeys.join('、')}。`, weight: 0.35 });
    }
    if (entityAnchors.worldKeys.length > 0) {
        scores.set('world', (scores.get('world') ?? 0) + 0.3);
        reasons.push({ source: 'entity', detail: `世界锚点命中：${entityAnchors.worldKeys.join('、')}。`, weight: 0.3 });
    }
}

/**
 * 功能：通过句式模式增加 facet 分数。
 * @param query 查询文本。
 * @param scores facet 分数表。
 * @param reasons 原因列表。
 * @returns 无返回值。
 */
function applyPatternScores(
    query: string,
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    if (/为什么.*(不能|不行|禁止|规定|规则)/u.test(query) || /规则|法则|禁令/u.test(query)) {
        scores.set('world', (scores.get('world') ?? 0) + 0.3);
        reasons.push({ source: 'pattern', detail: '句式更像规则或设定问答，已提高世界情境权重。', weight: 0.3 });
    }
    if (/你.*(还是|为什么|怎么).*(不信|不爱|讨厌|恨|喜欢|在意)/u.test(query) || /我们.*(之间|关系)/u.test(query)) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.35);
        reasons.push({ source: 'pattern', detail: '句式更像关系追问，已提高关系情境权重。', weight: 0.35 });
    }
    if (/那(天|晚|次|时|年|个)/u.test(query) || /还记得|当时|发生了什么|后来/u.test(query)) {
        scores.set('event', (scores.get('event') ?? 0) + 0.25);
        reasons.push({ source: 'pattern', detail: '句式更像事件回溯，已提高事件情境权重。', weight: 0.25 });
    }
    if (/这(里|个地方|座|条)|到了|来到|走进/u.test(query)) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.2);
        reasons.push({ source: 'pattern', detail: '句式更像场景定位，已提高场景情境权重。', weight: 0.2 });
    }
    if (/我(觉得|认为|感觉|猜|怀疑)|你(觉得|认为|怎么看)/u.test(query)) {
        scores.set('interpretation', (scores.get('interpretation') ?? 0) + 0.25);
        reasons.push({ source: 'pattern', detail: '句式更像主观理解表达，已提高理解情境权重。', weight: 0.25 });
    }
    if (/教派|教团|组织|势力|商会|学院|公会|骑士团|军团|教会|宗门|帮派|派系/u.test(query)) {
        scores.set('organization_politics', (scores.get('organization_politics') ?? 0) + 0.35);
        reasons.push({ source: 'pattern', detail: '句式涉及组织/势力/教派等实体，已提高组织政治情境权重。', weight: 0.35 });
    }
    if (/城市|城邦|王都|首都|港口|边境城/u.test(query)) {
        scores.set('organization_politics', (scores.get('organization_politics') ?? 0) + 0.2);
        scores.set('scene', (scores.get('scene') ?? 0) + 0.15);
        reasons.push({ source: 'pattern', detail: '句式涉及城市级别实体，已提高组织与场景权重。', weight: 0.2 });
    }
    if (/国家|王国|帝国|联邦|政权|教权国|共和国/u.test(query)) {
        scores.set('organization_politics', (scores.get('organization_politics') ?? 0) + 0.25);
        scores.set('world', (scores.get('world') ?? 0) + 0.15);
        reasons.push({ source: 'pattern', detail: '句式涉及国家级别实体，已提高组织与世界权重。', weight: 0.25 });
    }
}

/**
 * 功能：应用 PeroCore 记忆类型兼容推断。
 * @param subQueries 子句列表。
 * @param scores facet 分数表。
 * @param reasons 原因列表。
 * @param matchedRules 规则命中列表。
 * @returns 无返回值。
 */
function applyPerocoreMemoryTypeInference(
    subQueries: string[],
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
    matchedRules: RetrievalMatchedRule[],
): void {
    for (const rule of PEROCORE_MEMORY_TYPE_RULES) {
        const matchedText = collectMatchedKeywords(subQueries, rule.keywords);
        if (matchedText.length <= 0) {
            continue;
        }
        for (const facet of rule.facets) {
            scores.set(facet, (scores.get(facet) ?? 0) + 0.12);
        }
        reasons.push({
            source: 'perocore-rule',
            detail: `兼容记忆类型 ${rule.label} 命中：${matchedText.join('、')}。`,
            weight: 0.12,
        });
        pushMatchedRule(matchedRules, {
            pack: 'perocore',
            ruleId: rule.id,
            label: rule.label,
            matchedText,
        });
    }
}

/**
 * 功能：应用 PeroCore 思维簇兼容推断。
 * @param subQueries 子句列表。
 * @param scores facet 分数表。
 * @param reasons 原因列表。
 * @param matchedRules 规则命中列表。
 * @returns 无返回值。
 */
function applyPerocoreThoughtClusters(
    subQueries: string[],
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
    matchedRules: RetrievalMatchedRule[],
): void {
    for (const rule of PEROCORE_THOUGHT_CLUSTER_RULES) {
        const matchedText = collectMatchedKeywords(subQueries, rule.keywords);
        if (matchedText.length <= 0) {
            continue;
        }
        for (const facet of rule.facets) {
            scores.set(facet, (scores.get(facet) ?? 0) + 0.1);
        }
        reasons.push({
            source: 'perocore-rule',
            detail: `兼容思维簇 ${rule.label} 命中：${matchedText.join('、')}。`,
            weight: 0.1,
        });
        pushMatchedRule(matchedRules, {
            pack: 'perocore',
            ruleId: rule.id,
            label: rule.label,
            matchedText,
        });
    }
}

/**
 * 功能：通过候选记忆的类型分布微调 facet 分数。
 * @param candidates 候选列表。
 * @param scores facet 分数表。
 * @param reasons 原因列表。
 * @returns 无返回值。
 */
function applyCandidateDistributionScores(
    candidates: RetrievalCandidate[],
    scores: Map<RetrievalFacet, number>,
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    if (candidates.length <= 0) {
        return;
    }
    const total = candidates.length;
    const facetCounts = new Map<RetrievalFacet, number>();
    for (const candidate of candidates) {
        for (const facet of ALL_FACETS) {
            if ((FACET_SCHEMA_MAP[facet] ?? []).includes(candidate.schemaId)) {
                facetCounts.set(facet, (facetCounts.get(facet) ?? 0) + 1);
            }
        }
    }
    for (const facet of ALL_FACETS) {
        const ratio = (facetCounts.get(facet) ?? 0) / total;
        if (ratio > 0.1) {
            scores.set(facet, (scores.get(facet) ?? 0) + ratio * 0.1);
            reasons.push({
                source: 'pattern',
                detail: `候选库中 ${facet} 类型占比 ${(ratio * 100).toFixed(0)}%，已追加轻量先验。`,
                weight: ratio * 0.1,
            });
        }
    }
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
    const matchedActorKeys = new Set<string>();
    for (const name of registry.actorNames) {
        if (name && query.includes(name.toLowerCase())) {
            const key = registry.actorNameToKey.get(name.toLowerCase());
            if (key) {
                matchedActorKeys.add(key);
            }
        }
    }
    for (const alias of registry.actorAliases) {
        if (alias && query.includes(alias.toLowerCase())) {
            const key = registry.actorNameToKey.get(alias.toLowerCase());
            if (key) {
                matchedActorKeys.add(key);
            }
        }
    }
    for (const key of registry.actorKeys) {
        if (key && query.includes(key.toLowerCase())) {
            matchedActorKeys.add(key);
        }
    }

    const matchedLocationKeys = new Set<string>();
    for (const name of registry.locationNames) {
        if (name && query.includes(name.toLowerCase())) {
            matchedLocationKeys.add(registry.locationNameToKey.get(name.toLowerCase()) ?? name);
        }
    }
    for (const key of registry.locationKeys) {
        if (key && query.includes(key.toLowerCase())) {
            matchedLocationKeys.add(key);
        }
    }

    const matchedRelationKeys = new Set<string>();
    for (const key of registry.relationPairKeys) {
        const parts = key.toLowerCase().split(':').filter(Boolean);
        if (parts.some((part: string): boolean => query.includes(part))) {
            matchedRelationKeys.add(key);
        }
    }
    for (const alias of registry.relationAliases) {
        if (!alias || !query.includes(alias.toLowerCase())) {
            continue;
        }
        for (const key of registry.relationPairKeys) {
            if (key.toLowerCase().includes(alias.toLowerCase())) {
                matchedRelationKeys.add(key);
            }
        }
    }

    const matchedWorldKeys = new Set<string>();
    for (const alias of registry.worldAliases) {
        if (!alias || !query.includes(alias.toLowerCase())) {
            continue;
        }
        for (const key of registry.worldKeys) {
            if (key.toLowerCase() === alias.toLowerCase() || alias.toLowerCase().includes(key.toLowerCase())) {
                matchedWorldKeys.add(key);
            }
        }
        if (registry.worldKeys.some((key: string): boolean => key === alias)) {
            matchedWorldKeys.add(alias);
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
 * 功能：提取主题提示。
 * @param matches 关键词命中列表。
 * @param matchedRules 规则命中列表。
 * @returns 主题提示列表。
 */
function extractTopicHints(matches: KeywordMatchResult[], matchedRules: RetrievalMatchedRule[]): string[] {
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
    for (const rule of matchedRules) {
        for (const text of rule.matchedText.slice(0, 2)) {
            if (text && !hints.includes(text)) {
                hints.push(text);
            }
        }
    }
    return hints.slice(0, 12);
}

/**
 * 功能：应用最近上下文偏置到 facet 分数。
 * @param query 归一化查询。
 * @param scores facet 分数映射。
 * @param recentContext 最近上下文偏置。
 * @param entityAnchors 当前实体锚点。
 * @param reasons 原因数组。
 * @returns 无返回值。
 */
function applyRecentContextBias(
    query: string,
    scores: Map<RetrievalFacet, number>,
    recentContext: RecentContextBias,
    entityAnchors: RetrievalContextRoute['entityAnchors'],
    reasons: NonNullable<RetrievalContextRoute['reasons']>,
): void {
    if (recentContext.sceneMode) {
        const mode = recentContext.sceneMode.toLowerCase();
        if ((mode.includes('conflict') || mode.includes('冲突')) && entityAnchors.actorKeys.length > 0) {
            scores.set('relationship', (scores.get('relationship') ?? 0) + 0.15);
            scores.set('event', (scores.get('event') ?? 0) + 0.1);
            reasons.push({ source: 'recent-context', detail: `最近上下文为 ${recentContext.sceneMode}，已追加关系与事件偏置。`, weight: 0.15 });
        }
        if ((mode.includes('scene') || mode.includes('场景')) && /这里|那里|这地方|这个地方/u.test(query)) {
            scores.set('scene', (scores.get('scene') ?? 0) + 0.2);
            reasons.push({ source: 'recent-context', detail: '最近上下文偏向场景模式，已追加场景偏置。', weight: 0.2 });
        }
        if (mode.includes('world') || mode.includes('规则') || mode.includes('setting')) {
            scores.set('world', (scores.get('world') ?? 0) + 0.1);
            reasons.push({ source: 'recent-context', detail: `最近上下文为 ${recentContext.sceneMode}，已追加世界偏置。`, weight: 0.1 });
        }
    }
    if (recentContext.currentLocationKey && entityAnchors.locationKeys.length > 0) {
        scores.set('scene', (scores.get('scene') ?? 0) + 0.1);
        reasons.push({ source: 'recent-context', detail: `当前地点 ${recentContext.currentLocationKey} 与本轮地点锚点一致，已追加场景偏置。`, weight: 0.1 });
    }
    if (recentContext.activeRelationPair && entityAnchors.actorKeys.length > 0) {
        scores.set('relationship', (scores.get('relationship') ?? 0) + 0.12);
        reasons.push({ source: 'recent-context', detail: `当前活跃关系对 ${recentContext.activeRelationPair} 命中，已追加关系偏置。`, weight: 0.12 });
    }
    if (recentContext.dominantFacetHints && recentContext.dominantFacetHints.length > 0) {
        for (const hint of recentContext.dominantFacetHints) {
            scores.set(hint, (scores.get(hint) ?? 0) + 0.08);
        }
        reasons.push({ source: 'recent-context', detail: `沿用最近主导情境：${recentContext.dominantFacetHints.join('、')}。`, weight: 0.08 });
    }
}

/**
 * 功能：解析高于阈值的 facet。
 * @param scores facet 分数表。
 * @returns 排序后的 facet 列表。
 */
function resolveActiveFacets(scores: Map<RetrievalFacet, number>): RetrievalFacet[] {
    const activeFacets = ALL_FACETS.filter((facet: RetrievalFacet): boolean => (scores.get(facet) ?? 0) >= 0.15);
    if (activeFacets.length <= 0) {
        return ['event', 'relationship'];
    }
    return activeFacets.sort((left: RetrievalFacet, right: RetrievalFacet): number => (scores.get(right) ?? 0) - (scores.get(left) ?? 0));
}

/**
 * 功能：收集子句中实际命中的关键词。
 * @param subQueries 子句列表。
 * @param keywords 关键词列表。
 * @returns 命中文本。
 */
function collectMatchedKeywords(subQueries: string[], keywords: string[]): string[] {
    const matched = new Set<string>();
    for (const subQuery of subQueries) {
        for (const keyword of keywords) {
            const normalizedKeyword = String(keyword ?? '').trim().toLowerCase();
            if (normalizedKeyword && subQuery.includes(normalizedKeyword)) {
                matched.add(keyword);
            }
        }
    }
    return [...matched];
}

/**
 * 功能：写入一条规则命中，自动去重。
 * @param matchedRules 当前规则列表。
 * @param rule 规则对象。
 * @returns 无返回值。
 */
function pushMatchedRule(
    matchedRules: RetrievalMatchedRule[],
    rule: RetrievalMatchedRule,
): void {
    const existing = matchedRules.find((item: RetrievalMatchedRule): boolean => item.pack === rule.pack && item.ruleId === rule.ruleId);
    if (!existing) {
        matchedRules.push({
            ...rule,
            matchedText: dedupeStrings(rule.matchedText),
        });
        return;
    }
    existing.matchedText = dedupeStrings([...existing.matchedText, ...rule.matchedText]);
}

/**
 * 功能：触发一条情境判定 trace。
 * @param onTrace trace 回调。
 * @param title 标题。
 * @param message 消息。
 * @param payload 负载。
 * @returns 无返回值。
 */
function emitContextTrace(
    onTrace: RouteRetrievalContextOptions['onTrace'],
    title: string,
    message: string,
    payload?: Record<string, unknown>,
): void {
    onTrace?.({
        ts: Date.now(),
        level: 'info',
        stage: 'context',
        title,
        message,
        payload,
    });
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 原始数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
