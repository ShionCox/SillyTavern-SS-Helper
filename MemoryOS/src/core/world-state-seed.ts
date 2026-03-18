import type { ChatSemanticSeed, WorldStateScopeType, WorldStateType } from '../types';

export interface StructuredSeedWorldStateEntry {
    path: string;
    value: Record<string, unknown>;
}

function normalizeSeedText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slugifySeedText(value: string, fallback: string): string {
    const normalized = normalizeSeedText(value)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return normalized || fallback;
}

function uniqueSeedTexts(limit: number, ...groups: Array<ArrayLike<unknown> | null | undefined>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    groups.forEach((group) => {
        if (!group) {
            return;
        }
        Array.from(group).forEach((item: unknown) => {
            const normalized = normalizeSeedText(item);
            if (!normalized || seen.has(normalized)) {
                return;
            }
            seen.add(normalized);
            result.push(normalized);
        });
    });
    return result.slice(0, limit);
}

function splitSeedSentences(value: string): string[] {
    return value
        .split(/[。！？；;\n]+/)
        .map((item: string): string => normalizeSeedText(item))
        .filter((item: string): boolean => item.length >= 2);
}

const NATION_PATTERN = /国家|政体|王国|帝国|联邦|共和国|王朝|nation|country|kingdom|empire|republic|federation|realm/i;
const REGION_PATTERN = /区域|地理|大陆|边境|北境|南境|西境|东境|州|郡|领|地带|行省|region|area|province|territory|continent|frontier/i;
const CITY_PATTERN = /城市|都城|城邦|主城|镇|村|聚落|港口|港城|城镇|city|capital|metropolis|town|village|settlement|harbor/i;
const LOCATION_PATTERN = /地点|场所|遗迹|据点|神殿|学院|基地|空间站|房间|森林|峡谷|湖泊|location|place|site|ruin|outpost|temple|academy|base|station|room|forest|canyon|lake/i;
const FACTION_PATTERN = /组织|阵营|派系|公会|教团|军团|学派|议会|协会|结社|faction|guild|order|clan|alliance|council|union/i;
const CHARACTER_PATTERN = /角色|人物|主角|同伴|npc|character|companion/i;
const GOAL_PATTERN = /目标|想要|必须|计划|打算|任务|goal|objective|intent|mission|plan/i;
const RELATIONSHIP_PATTERN = /关系|信任|敌对|盟友|同伴|羁绊|恋人|导师|relationship|bond|trust|ally|enemy/i;
const DANGER_PATTERN = /危险|威胁|风险|灾难|危机|danger|threat|risk|crisis/i;
const HISTORY_PATTERN = /历史|往事|旧日|起源|战争|历史事件|history|origin|past|war/i;
const CALENDAR_PATTERN = /历法|纪年|历年|年号|月相|节气|calendar|chronology|era|dating system/i;
const CURRENCY_PATTERN = /货币|钱币|金币|银币|铜币|纸钞|税制|汇兑|面额|currency|coin|money|tax|exchange/i;
const SOCIAL_PATTERN = /阶级|等级|身份制度|政治制度|社会制度|贵族制|君主制|共和制|议会制|social system|hierarchy|caste|class/i;
const CULTURE_PATTERN = /文化|习俗|风俗|礼仪|传统|节庆|祭典|成年礼|婚俗|葬礼|culture|custom|tradition|ritual|festival/i;
const OTHER_WORLD_PATTERN = /宇宙观|哲学|信条|誓约体系|创世观|天命观|世界观核心|设定细节|世界细节|other world/i;

function inferScopeAndType(snippet: string, preferredType?: WorldStateType): {
    scopeType: WorldStateScopeType;
    stateType: WorldStateType;
    nationId?: string;
    regionId?: string;
    cityId?: string;
    locationId?: string;
} {
    const normalized = normalizeSeedText(snippet).toLowerCase();
    const hasNation = NATION_PATTERN.test(normalized);
    const hasRegion = REGION_PATTERN.test(normalized);
    const hasCity = CITY_PATTERN.test(normalized);
    const hasLocation = LOCATION_PATTERN.test(normalized);
    const hasFaction = FACTION_PATTERN.test(normalized);
    const hasCharacter = CHARACTER_PATTERN.test(normalized);
    const hasGoal = GOAL_PATTERN.test(normalized);
    const hasRelationship = RELATIONSHIP_PATTERN.test(normalized);
    const hasDanger = DANGER_PATTERN.test(normalized);
    const hasHistory = HISTORY_PATTERN.test(normalized);
    const hasCalendar = CALENDAR_PATTERN.test(normalized);
    const hasCurrency = CURRENCY_PATTERN.test(normalized);
    const hasSocial = SOCIAL_PATTERN.test(normalized);
    const hasCulture = CULTURE_PATTERN.test(normalized);
    const hasOtherWorld = OTHER_WORLD_PATTERN.test(normalized);
    const hasSystem = hasCalendar || hasCurrency || hasSocial || hasCulture;

    let scopeType: WorldStateScopeType = 'location';
    if (hasSystem && !hasNation && !hasRegion && !hasCity && !hasFaction && !hasCharacter && !hasLocation) scopeType = 'global';
    else if (hasNation) scopeType = 'nation';
    else if (hasRegion) scopeType = 'region';
    else if (hasCity) scopeType = 'city';
    else if (hasFaction) scopeType = 'faction';
    else if (hasCharacter) scopeType = 'character';
    else if (hasLocation) scopeType = 'location';

    const lockedPreferredType = preferredType && preferredType !== 'status' ? preferredType : undefined;
    let stateType: WorldStateType = lockedPreferredType ?? 'status';
    if (!lockedPreferredType) {
        if (hasGoal) stateType = 'goal';
        else if (hasRelationship) stateType = 'relationship';
        else if (hasDanger) stateType = 'danger';
        else if (hasHistory) stateType = 'history';
        else if (hasCalendar || hasCurrency) stateType = 'rule';
        else if (hasSocial) stateType = 'constraint';
        else if (hasCulture) stateType = 'culture';
        else if (hasOtherWorld) stateType = 'other';
    }

    return {
        scopeType,
        stateType,
        nationId: scopeType === 'nation' ? slugifySeedText(snippet, 'nation') : undefined,
        regionId: scopeType === 'region' ? slugifySeedText(snippet, 'region') : undefined,
        cityId: scopeType === 'city' ? slugifySeedText(snippet, 'city') : undefined,
        locationId: scopeType === 'location' ? slugifySeedText(snippet, 'location') : undefined,
    };
}

function resolveCatalogBucket(scopeType: WorldStateScopeType): string {
    if (scopeType === 'nation') return 'nations';
    if (scopeType === 'region') return 'regions';
    if (scopeType === 'city') return 'cities';
    if (scopeType === 'faction') return 'factions';
    if (scopeType === 'character') return 'characters';
    return 'locations';
}

function resolveInferredPath(slug: string, inferred: { scopeType: WorldStateScopeType; stateType: WorldStateType }): string {
    if (inferred.stateType === 'rule') {
        return `/semantic/rules/${slug}`;
    }
    if (inferred.stateType === 'constraint') {
        return `/semantic/constraints/${slug}`;
    }
    if (inferred.stateType === 'culture') {
        return `/semantic/world/systems/${slug}`;
    }
    if (inferred.stateType === 'history') {
        return `/semantic/world/history/${slug}`;
    }
    if (inferred.stateType === 'danger') {
        return `/semantic/world/danger/${slug}`;
    }
    if (inferred.stateType === 'other') {
        return `/semantic/world/other/${slug}`;
    }
    if (inferred.scopeType === 'global') {
        return `/semantic/world/other/${slug}`;
    }
    return `/semantic/catalog/${resolveCatalogBucket(inferred.scopeType)}/${slug}`;
}

function buildSeedStateValue(
    snippet: string,
    params: {
        scopeType: WorldStateScopeType;
        stateType: WorldStateType;
        subjectId?: string;
        nationId?: string;
        regionId?: string;
        cityId?: string;
        locationId?: string;
        sourceLabel: string;
    },
): Record<string, unknown> {
    return {
        title: snippet.length > 28 ? `${snippet.slice(0, 28)}…` : snippet,
        summary: snippet,
        scopeType: params.scopeType,
        stateType: params.stateType,
        subjectId: params.subjectId,
        nationId: params.nationId,
        regionId: params.regionId,
        cityId: params.cityId,
        locationId: params.locationId,
        keywords: splitSeedSentences(snippet)
            .flatMap((item: string): string[] => item.split(/[^a-z0-9\u4e00-\u9fa5]+/i))
            .map((item: string): string => normalizeSeedText(item))
            .filter((item: string): boolean => item.length >= 2)
            .slice(0, 12),
        tags: [params.sourceLabel, params.scopeType, params.stateType],
        sourceRefs: [params.sourceLabel],
        confidence: 0.72,
        updatedAt: Date.now(),
    };
}

export function inferStructuredSeedWorldStateEntries(seed: ChatSemanticSeed): StructuredSeedWorldStateEntry[] {
    const entries = new Map<string, StructuredSeedWorldStateEntry>();
    const roleKey = normalizeSeedText(seed.identitySeed?.roleKey);

    const pushEntry = (path: string, value: Record<string, unknown>): void => {
        const normalizedPath = normalizeSeedText(path);
        if (!normalizedPath) {
            return;
        }
        entries.set(normalizedPath, { path: normalizedPath, value });
    };

    uniqueSeedTexts(16, seed.aiSummary?.nations).forEach((nation: string, index: number): void => {
        const slug = slugifySeedText(nation, `nation-${index + 1}`);
        pushEntry(`/semantic/catalog/nations/${slug}`, buildSeedStateValue(nation, {
            scopeType: 'nation',
            stateType: 'status',
            nationId: slug,
            sourceLabel: 'seed_ai_nation',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.regions).forEach((region: string, index: number): void => {
        const slug = slugifySeedText(region, `region-${index + 1}`);
        pushEntry(`/semantic/catalog/regions/${slug}`, buildSeedStateValue(region, {
            scopeType: 'region',
            stateType: 'status',
            regionId: slug,
            sourceLabel: 'seed_ai_region',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.factions).forEach((faction: string, index: number): void => {
        const slug = slugifySeedText(faction, `faction-${index + 1}`);
        pushEntry(`/semantic/catalog/factions/${slug}`, buildSeedStateValue(faction, {
            scopeType: 'faction',
            stateType: 'status',
            sourceLabel: 'seed_ai_faction',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.cities).forEach((city: string, index: number): void => {
        const slug = slugifySeedText(city, `city-${index + 1}`);
        pushEntry(`/semantic/catalog/cities/${slug}`, buildSeedStateValue(city, {
            scopeType: 'city',
            stateType: 'status',
            cityId: slug,
            sourceLabel: 'seed_ai_city',
        }));
    });

    uniqueSeedTexts(24, seed.worldSeed.locations, seed.aiSummary?.locations).forEach((location: string, index: number): void => {
        const inferred = inferScopeAndType(location, 'status');
        const slug = slugifySeedText(location, `location-${index + 1}`);
        pushEntry(resolveInferredPath(slug, inferred), buildSeedStateValue(location, {
            ...inferred,
            sourceLabel: 'seed_location',
        }));
    });

    uniqueSeedTexts(24, seed.worldSeed.entities, seed.aiSummary?.entities).forEach((entity: string, index: number): void => {
        const inferred = inferScopeAndType(entity, 'status');
        const slug = slugifySeedText(entity, `entity-${index + 1}`);
        pushEntry(resolveInferredPath(slug, inferred), buildSeedStateValue(entity, {
            ...inferred,
            subjectId: inferred.scopeType === 'character' ? roleKey || undefined : undefined,
            sourceLabel: 'seed_entity',
        }));
    });

    uniqueSeedTexts(32, seed.worldSeed.rules, seed.aiSummary?.worldRules).forEach((rule: string, index: number): void => {
        const inferred = inferScopeAndType(rule, 'rule');
        const slug = slugifySeedText(rule, `rule-${index + 1}`);
        pushEntry(`/semantic/rules/${slug}`, buildSeedStateValue(rule, {
            ...inferred,
            sourceLabel: 'seed_rule',
        }));
    });

    uniqueSeedTexts(24, seed.worldSeed.hardConstraints, seed.aiSummary?.hardConstraints).forEach((constraint: string, index: number): void => {
        const inferred = inferScopeAndType(constraint, 'constraint');
        const slug = slugifySeedText(constraint, `constraint-${index + 1}`);
        pushEntry(`/semantic/constraints/${slug}`, buildSeedStateValue(constraint, {
            ...inferred,
            sourceLabel: 'seed_constraint',
        }));
    });

    uniqueSeedTexts(12, seed.aiSummary?.calendarSystems).forEach((calendar: string, index: number): void => {
        const slug = slugifySeedText(calendar, `calendar-${index + 1}`);
        pushEntry(`/semantic/world/systems/${slug}`, buildSeedStateValue(calendar, {
            scopeType: 'global',
            stateType: 'culture',
            sourceLabel: 'seed_ai_calendar',
        }));
    });

    uniqueSeedTexts(12, seed.aiSummary?.currencySystems).forEach((currency: string, index: number): void => {
        const slug = slugifySeedText(currency, `currency-${index + 1}`);
        pushEntry(`/semantic/world/systems/${slug}`, buildSeedStateValue(currency, {
            scopeType: 'global',
            stateType: 'rule',
            sourceLabel: 'seed_ai_currency',
        }));
    });

    uniqueSeedTexts(12, seed.aiSummary?.socialSystems).forEach((social: string, index: number): void => {
        const slug = slugifySeedText(social, `social-${index + 1}`);
        pushEntry(`/semantic/world/systems/${slug}`, buildSeedStateValue(social, {
            scopeType: 'global',
            stateType: 'constraint',
            sourceLabel: 'seed_ai_social',
        }));
    });

    uniqueSeedTexts(12, seed.aiSummary?.culturalPractices).forEach((culture: string, index: number): void => {
        const slug = slugifySeedText(culture, `culture-${index + 1}`);
        pushEntry(`/semantic/world/systems/${slug}`, buildSeedStateValue(culture, {
            scopeType: 'global',
            stateType: 'culture',
            sourceLabel: 'seed_ai_culture',
        }));
    });

    uniqueSeedTexts(16, seed.identitySeed.relationshipAnchors, seed.aiSummary?.relationshipAnchors).forEach((relationship: string, index: number): void => {
        const inferred = inferScopeAndType(relationship, 'relationship');
        const actorSlug = slugifySeedText(roleKey || seed.identitySeed.displayName || 'character', 'character');
        const slug = slugifySeedText(relationship, `relationship-${index + 1}`);
        pushEntry(`/semantic/characters/${actorSlug}/relationships/${slug}`, buildSeedStateValue(relationship, {
            ...inferred,
            scopeType: 'character',
            stateType: inferred.stateType === 'goal' ? 'relationship' : inferred.stateType,
            subjectId: roleKey || actorSlug,
            sourceLabel: 'seed_relationship',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.relationshipFacts).forEach((relationship: string, index: number): void => {
        const actorSlug = slugifySeedText(roleKey || seed.identitySeed.displayName || 'character', 'character');
        const slug = slugifySeedText(relationship, `relationship-fact-${index + 1}`);
        pushEntry(`/semantic/characters/${actorSlug}/relationships/${slug}`, buildSeedStateValue(relationship, {
            scopeType: 'character',
            stateType: 'relationship',
            subjectId: roleKey || actorSlug,
            sourceLabel: 'seed_ai_relationship',
        }));
    });

    uniqueSeedTexts(
        16,
        seed.aiSummary?.identityFacts,
        seed.aiSummary?.characterGoals,
        splitSeedSentences(seed.aiSummary?.roleSummary ?? ''),
    ).filter((item: string): boolean => /目标|想要|必须|计划|打算|任务|goal|objective|intent|mission|plan/i.test(item)).forEach((goal: string, index: number): void => {
        const actorSlug = slugifySeedText(roleKey || seed.identitySeed.displayName || 'character', 'character');
        const slug = slugifySeedText(goal, `goal-${index + 1}`);
        pushEntry(`/semantic/characters/${actorSlug}/goals/${slug}`, buildSeedStateValue(goal, {
            scopeType: 'character',
            stateType: 'goal',
            subjectId: roleKey || actorSlug,
            sourceLabel: 'seed_goal',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.historicalEvents).forEach((event: string, index: number): void => {
        const inferred = inferScopeAndType(event, 'history');
        const slug = slugifySeedText(event, `history-${index + 1}`);
        pushEntry(`/semantic/world/history/${slug}`, buildSeedStateValue(event, {
            ...inferred,
            stateType: 'history',
            sourceLabel: 'seed_ai_history',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.dangers).forEach((danger: string, index: number): void => {
        const inferred = inferScopeAndType(danger, 'danger');
        const slug = slugifySeedText(danger, `danger-${index + 1}`);
        pushEntry(`/semantic/world/danger/${slug}`, buildSeedStateValue(danger, {
            ...inferred,
            stateType: 'danger',
            sourceLabel: 'seed_ai_danger',
        }));
    });

    uniqueSeedTexts(16, seed.aiSummary?.otherWorldDetails).forEach((detail: string, index: number): void => {
        const slug = slugifySeedText(detail, `other-${index + 1}`);
        pushEntry(`/semantic/world/other/${slug}`, buildSeedStateValue(detail, {
            scopeType: 'global',
            stateType: 'other',
            sourceLabel: 'seed_ai_other',
        }));
    });

    uniqueSeedTexts(20, splitSeedSentences(seed.aiSummary?.worldSummary ?? '')).forEach((summaryLine: string, index: number): void => {
        const inferred = inferScopeAndType(summaryLine);
        const section = inferred.stateType === 'history'
            ? 'history'
            : inferred.stateType === 'danger'
                ? 'danger'
                : inferred.scopeType === 'nation'
                    ? 'nations'
                    : inferred.scopeType === 'region'
                        ? 'regions'
                        : 'overview';
        const slug = slugifySeedText(summaryLine, `summary-${index + 1}`);
        pushEntry(`/semantic/world/${section}/${slug}`, buildSeedStateValue(summaryLine, {
            ...inferred,
            sourceLabel: 'seed_world_summary',
        }));
    });

    return Array.from(entries.values());
}