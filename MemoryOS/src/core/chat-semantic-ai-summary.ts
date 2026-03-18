import type { ChatSemanticSeed, SemanticAiSummary } from '../types/chat-state';
import { Logger } from '../../../SDK/logger';
import { runGeneration, MEMORY_TASKS, type TaskPresentationOverride } from '../llm/memoryLlmBridge';

const logger = new Logger('ColdStartAiSummary');

export interface EnhanceSemanticSeedWithAiOptions {
    force?: boolean;
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
    taskDescription?: string;
}

type SemanticSeedAiSummary = Omit<SemanticAiSummary, 'generatedAt' | 'source'>;

const NATION_PATTERN = /国家|政体|王国|帝国|联邦|共和国|王朝|nation|country|kingdom|empire|republic|federation|realm/i;
const REGION_PATTERN = /区域|地理|大陆|边境|北境|南境|西境|东境|州|郡|领|region|area|province|territory|continent|frontier/i;
const CITY_PATTERN = /城市|都城|城邦|主城|镇|村|聚落|港口|港城|城镇|city|capital|metropolis|town|village|settlement|harbor/i;
const LOCATION_PATTERN = /地点|场所|遗迹|据点|神殿|学院|基地|空间站|房间|森林|峡谷|湖泊|location|place|site|ruin|outpost|temple|academy|base|station|room|forest|canyon|lake/i;
const FACTION_PATTERN = /组织|阵营|派系|公会|教团|军团|学派|议会|协会|结社|faction|guild|order|clan|alliance|council|union/i;
const RULE_PATTERN = /规则|法则|法律|法典|条例|机制|运作规律|法理|rule|law|canon|principle|system/i;
const CONSTRAINT_PATTERN = /限制|禁忌|不能|不可|不得|禁止|绝不|唯一|固定|必须遵守|constraint|taboo|restriction|forbidden|must not/i;
const CALENDAR_PATTERN = /历法|纪年|历年|年号|月相|节气|calendar|chronology|era|dating system/i;
const CURRENCY_PATTERN = /货币|钱币|金币|银币|铜币|纸钞|税制|汇兑|面额|currency|coin|money|tax|exchange/i;
const SOCIAL_PATTERN = /阶级|等级|身份制度|政治制度|社会制度|贵族制|君主制|共和制|议会制|social system|hierarchy|caste|class/i;
const CULTURE_PATTERN = /文化|习俗|风俗|礼仪|传统|节庆|祭典|成年礼|婚俗|葬礼|culture|custom|tradition|ritual|festival/i;
const HISTORY_PATTERN = /历史|往事|旧日|起源|战争|历史事件|history|origin|past|war/i;
const DANGER_PATTERN = /危险|威胁|风险|灾难|危机|danger|threat|risk|crisis/i;
const GOAL_PATTERN = /目标|想要|必须|计划|打算|任务|goal|objective|intent|mission|plan/i;
const RELATIONSHIP_PATTERN = /关系|信任|敌对|盟友|同伴|羁绊|恋人|导师|relationship|bond|trust|ally|enemy/i;
const IDENTITY_PATTERN = /身份|血统|别名|称号|职业|来历|出身|identity|alias|title|background|lineage/i;
const ENTITY_PATTERN = /机构|设施|装置|神器|遗物|系统核心|核心装置|entity|artifact|relic|device|institution/i;

const SEMANTIC_SEED_SUMMARY_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'roleSummary',
        'worldSummary',
        'identityFacts',
        'worldRules',
        'hardConstraints',
        'cities',
        'locations',
        'entities',
        'nations',
        'regions',
        'factions',
        'calendarSystems',
        'currencySystems',
        'socialSystems',
        'culturalPractices',
        'historicalEvents',
        'dangers',
        'otherWorldDetails',
        'characterGoals',
        'relationshipFacts',
        'catchphrases',
        'relationshipAnchors',
        'styleCues',
    ],
    properties: {
        roleSummary: { type: 'string' },
        worldSummary: { type: 'string' },
        identityFacts: { type: 'array', items: { type: 'string' } },
        worldRules: { type: 'array', items: { type: 'string' } },
        hardConstraints: { type: 'array', items: { type: 'string' } },
        cities: { type: 'array', items: { type: 'string' } },
        locations: { type: 'array', items: { type: 'string' } },
        entities: { type: 'array', items: { type: 'string' } },
        nations: { type: 'array', items: { type: 'string' } },
        regions: { type: 'array', items: { type: 'string' } },
        factions: { type: 'array', items: { type: 'string' } },
        calendarSystems: { type: 'array', items: { type: 'string' } },
        currencySystems: { type: 'array', items: { type: 'string' } },
        socialSystems: { type: 'array', items: { type: 'string' } },
        culturalPractices: { type: 'array', items: { type: 'string' } },
        historicalEvents: { type: 'array', items: { type: 'string' } },
        dangers: { type: 'array', items: { type: 'string' } },
        otherWorldDetails: { type: 'array', items: { type: 'string' } },
        characterGoals: { type: 'array', items: { type: 'string' } },
        relationshipFacts: { type: 'array', items: { type: 'string' } },
        catchphrases: { type: 'array', items: { type: 'string' } },
        relationshipAnchors: { type: 'array', items: { type: 'string' } },
        styleCues: { type: 'array', items: { type: 'string' } },
    },
};

type AltSummaryEntry = {
    type?: unknown;
    items?: unknown;
};

function normalizeSnippetText(value: unknown): string {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function uniqueSnippetTexts(limit: number, values: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const normalized = normalizeSnippetText(value);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

function toStringArray(value: unknown, limit: number = 16): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return uniqueTexts(limit, value as unknown[]);
}

function pickText(...values: unknown[]): string {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return '';
}

function pickTexts(record: Record<string, unknown> | null | undefined, keys: string[], limit: number): string[] {
    return uniqueTexts(limit, ...keys.map((key: string): unknown[] => toStringArray(record?.[key], limit)));
}

function filterTexts(limit: number, values: string[], pattern: RegExp): string[] {
    return uniqueTexts(limit, values.filter((item: string): boolean => pattern.test(item)));
}

function excludeTexts(limit: number, values: string[], ...classifiedGroups: Array<ArrayLike<unknown> | null | undefined>): string[] {
    const excluded = new Set(uniqueTexts(256, ...classifiedGroups.map((group) => Array.from(group ?? []))));
    return uniqueTexts(limit, values.filter((item: string): boolean => !excluded.has(normalizeText(item))));
}

export function normalizeSemanticSeedAiSummary(value: unknown): SemanticSeedAiSummary | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const direct = value as Record<string, unknown>;
    const directRoleSummary = normalizeText(direct.roleSummary);
    const directWorldSummary = normalizeText(direct.worldSummary);
    if (
        directRoleSummary
        || directWorldSummary
        || Array.isArray(direct.identityFacts)
        || Array.isArray(direct.worldRules)
        || Array.isArray(direct.cities)
        || Array.isArray(direct.nations)
        || Array.isArray(direct.regions)
        || Array.isArray(direct.factions)
        || Array.isArray(direct.calendarSystems)
        || Array.isArray(direct.currencySystems)
        || Array.isArray(direct.socialSystems)
        || Array.isArray(direct.culturalPractices)
        || Array.isArray(direct.otherWorldDetails)
    ) {
        return {
            roleSummary: directRoleSummary,
            worldSummary: directWorldSummary,
            identityFacts: toStringArray(direct.identityFacts, 12),
            worldRules: toStringArray(direct.worldRules, 16),
            hardConstraints: toStringArray(direct.hardConstraints, 12),
            cities: toStringArray(direct.cities, 12),
            locations: toStringArray(direct.locations, 12),
            entities: toStringArray(direct.entities, 12),
            nations: toStringArray(direct.nations, 12),
            regions: toStringArray(direct.regions, 12),
            factions: toStringArray(direct.factions, 12),
            calendarSystems: toStringArray(direct.calendarSystems, 12),
            currencySystems: toStringArray(direct.currencySystems, 12),
            socialSystems: toStringArray(direct.socialSystems, 12),
            culturalPractices: toStringArray(direct.culturalPractices, 12),
            historicalEvents: toStringArray(direct.historicalEvents, 12),
            dangers: toStringArray(direct.dangers, 12),
            otherWorldDetails: toStringArray(direct.otherWorldDetails, 12),
            characterGoals: toStringArray(direct.characterGoals, 8),
            relationshipFacts: toStringArray(direct.relationshipFacts, 8),
            catchphrases: toStringArray(direct.catchphrases, 8),
            relationshipAnchors: toStringArray(direct.relationshipAnchors, 8),
            styleCues: toStringArray(direct.styleCues, 10),
        };
    }

    const characterSummary = ((direct.character_summary ?? direct.characterSummary) || null) as Record<string, unknown> | null;
    const worldSummary = ((direct.world_summary ?? direct.worldSummary) || null) as Record<string, unknown> | null;
    const seedEntries = Array.isArray(direct.seed_key_entries ?? direct.seedKeyEntries)
        ? ((direct.seed_key_entries ?? direct.seedKeyEntries) as AltSummaryEntry[])
        : [];

    if (!characterSummary && !worldSummary && seedEntries.length === 0) {
        return null;
    }

    const roleSummaryParts = [
        pickText(characterSummary?.role_identity, characterSummary?.roleIdentity),
        pickText(characterSummary?.personality),
        pickText(characterSummary?.background),
    ].filter((item: string): boolean => item.length > 0);

    const worldSummaryParts = [
        pickText(worldSummary?.core_concept, worldSummary?.coreConcept),
        pickText(worldSummary?.main_conflict, worldSummary?.mainConflict),
        pickText(worldSummary?.rules_notes, worldSummary?.rulesNotes),
    ].filter((item: string): boolean => item.length > 0);

    const seedTexts = seedEntries.flatMap((entry: AltSummaryEntry): string[] => {
        const title = normalizeText(entry?.type);
        const items = toStringArray(entry?.items, 8);
        if (!title) {
            return items;
        }
        return items.map((item: string): string => `${title}：${item}`);
    });

    const relationshipAnchors = Array.isArray(characterSummary?.relationships)
        ? uniqueTexts(
            8,
            (characterSummary.relationships as unknown[]).map((item: unknown): string => {
                if (!item || typeof item !== 'object') {
                    return normalizeText(item);
                }
                const record = item as Record<string, unknown>;
                return pickText(record.name, record.target, record.relation, record.description);
            }),
        )
        : [];

    const goalTexts = uniqueTexts(
        8,
        toStringArray(characterSummary?.goals, 6),
        filterTexts(8, seedTexts, GOAL_PATTERN),
    );
    const nationTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['nations', 'polities', 'countries', 'kingdoms'], 8),
        filterTexts(12, seedTexts, NATION_PATTERN),
    );
    const regionTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['regions', 'areas', 'territories', 'provinces'], 8),
        filterTexts(12, seedTexts, REGION_PATTERN),
    );
    const cityTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['cities', 'settlements', 'towns', 'villages', 'capitals'], 8),
        filterTexts(12, seedTexts, CITY_PATTERN),
    );
    const factionTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['factions', 'organizations', 'groups'], 8),
        filterTexts(12, seedTexts, FACTION_PATTERN),
    );
    const worldRuleTexts = uniqueTexts(
        16,
        pickTexts(worldSummary, ['world_rules', 'worldRules', 'rules', 'laws', 'rule_notes', 'rules_notes', 'rulesNotes'], 8),
        filterTexts(16, seedTexts, RULE_PATTERN),
    );
    const hardConstraintTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['constraints', 'hard_constraints', 'hardConstraints', 'taboos'], 8),
        filterTexts(12, seedTexts, CONSTRAINT_PATTERN),
    );
    const calendarTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['calendar_systems', 'calendarSystems', 'calendars', 'chronology'], 8),
        filterTexts(12, seedTexts, CALENDAR_PATTERN),
    );
    const currencyTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['currency_systems', 'currencySystems', 'currencies', 'economy'], 8),
        filterTexts(12, seedTexts, CURRENCY_PATTERN),
    );
    const socialTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['social_systems', 'socialSystems', 'institutions', 'hierarchy'], 8),
        filterTexts(12, seedTexts, SOCIAL_PATTERN),
    );
    const culturalTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['cultural_practices', 'culturalPractices', 'cultures', 'customs', 'traditions'], 8),
        filterTexts(12, seedTexts, CULTURE_PATTERN),
    );
    const historyTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['historical_events', 'historicalEvents', 'history'], 8),
        filterTexts(12, seedTexts, HISTORY_PATTERN),
    );
    const dangerTexts = uniqueTexts(
        12,
        pickTexts(worldSummary, ['threats', 'dangers', 'conflicts'], 8),
        filterTexts(12, seedTexts, DANGER_PATTERN),
    );
    const identityFacts = uniqueTexts(
        12,
        toStringArray(characterSummary?.aliases, 6),
        filterTexts(12, seedTexts, IDENTITY_PATTERN),
    );
    const relationshipFacts = uniqueTexts(8, relationshipAnchors, filterTexts(8, seedTexts, RELATIONSHIP_PATTERN));
    const locationTexts = excludeTexts(
        12,
        uniqueTexts(
            24,
            toStringArray(worldSummary?.key_locations ?? worldSummary?.keyLocations, 8),
            pickTexts(worldSummary, ['locations', 'places', 'sites', 'landmarks', 'districts'], 8),
            filterTexts(24, seedTexts, LOCATION_PATTERN),
        ),
        nationTexts,
        regionTexts,
        cityTexts,
        factionTexts,
        calendarTexts,
        currencyTexts,
        socialTexts,
        culturalTexts,
        historyTexts,
        dangerTexts,
    );
    const entityTexts = excludeTexts(
        12,
        uniqueTexts(
            16,
            pickTexts(worldSummary, ['entities', 'objects', 'artifacts', 'institutions'], 8),
            filterTexts(16, seedTexts, ENTITY_PATTERN),
        ),
        nationTexts,
        regionTexts,
        cityTexts,
        locationTexts,
        factionTexts,
        calendarTexts,
        currencyTexts,
        socialTexts,
        culturalTexts,
    );
    const otherWorldDetails = excludeTexts(
        12,
        seedTexts,
        identityFacts,
        worldRuleTexts,
        hardConstraintTexts,
        nationTexts,
        regionTexts,
        cityTexts,
        locationTexts,
        entityTexts,
        factionTexts,
        calendarTexts,
        currencyTexts,
        socialTexts,
        culturalTexts,
        historyTexts,
        dangerTexts,
        goalTexts,
        relationshipFacts,
        relationshipAnchors,
    );

    return {
        roleSummary: roleSummaryParts.join('；'),
        worldSummary: worldSummaryParts.join('；'),
        identityFacts,
        worldRules: worldRuleTexts,
        hardConstraints: hardConstraintTexts,
        cities: cityTexts,
        locations: locationTexts,
        entities: entityTexts,
        nations: nationTexts,
        regions: regionTexts,
        factions: factionTexts,
        calendarSystems: calendarTexts,
        currencySystems: currencyTexts,
        socialSystems: socialTexts,
        culturalPractices: culturalTexts,
        historicalEvents: historyTexts,
        dangers: dangerTexts,
        otherWorldDetails,
        characterGoals: goalTexts,
        relationshipFacts,
        catchphrases: [],
        relationshipAnchors,
        styleCues: uniqueTexts(10, [pickText(worldSummary?.tone_style, worldSummary?.toneStyle)]),
    };
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueTexts(limit: number, ...groups: unknown[][]): string[] {
    return Array.from(new Set(
        groups
            .flat()
            .map((item: unknown): string => normalizeText(item))
            .filter((item: string): boolean => item.length >= 2),
    )).slice(0, limit);
}

function shouldUseAiSummary(seed: ChatSemanticSeed): boolean {
    const description = normalizeText((seed.characterCore as Record<string, unknown> | undefined)?.description);
    const scenario = normalizeText((seed.characterCore as Record<string, unknown> | undefined)?.scenario);
    const worldHints = uniqueTexts(
        8,
        seed.worldSeed.locations,
        seed.worldSeed.rules,
        seed.worldSeed.hardConstraints,
        seed.worldSeed.entities,
    );
    return description.length >= 24 || scenario.length >= 24 || worldHints.length >= 3;
}

function buildPromptPayload(seed: ChatSemanticSeed): string {
    const characterCore = (seed.characterCore ?? {}) as Record<string, unknown>;
    const lorebookSnippets = uniqueSnippetTexts(
        18,
        seed.lorebookSeed.flatMap((item) => item.snippets.map((snippet: string): string => `${item.book}：${snippet}`)),
    );
    return [
        `角色名：${normalizeText(seed.identitySeed.displayName) || '未知角色'}`,
        `角色别名：${uniqueTexts(8, seed.identitySeed.aliases).join('；') || '无'}`,
        `角色描述：${normalizeText(characterCore.description) || '无'}`,
        `开场白：${normalizeText(seed.firstMessage) || '无'}`,
        `作者注释：${normalizeText(seed.authorNote) || '无'}`,
        `系统提示：${normalizeText(seed.systemPrompt) || '无'}`,
        `场景 / 世界观：${uniqueTexts(16, [normalizeText(characterCore.scenario)], seed.worldSeed.rules, seed.worldSeed.hardConstraints, seed.worldSeed.locations, seed.worldSeed.entities).join('；') || '无'}`,
        `世界书：${uniqueTexts(12, seed.activeLorebooks).join('；') || '无'}`,
        lorebookSnippets.length > 0
            ? `世界书条目摘录：\n${lorebookSnippets.join('\n\n')}`
            : '世界书条目摘录：无',
        `现有风格线索：${uniqueTexts(10, seed.styleSeed.cues).join('；') || '无'}`,
    ].join('\n');
}

export function mergeAiSummary(seed: ChatSemanticSeed, summary: SemanticSeedAiSummary): ChatSemanticSeed {
    const roleSummary = normalizeText(summary.roleSummary);
    const worldSummary = normalizeText(summary.worldSummary);
    const aiSummary = {
        roleSummary,
        worldSummary,
        identityFacts: uniqueTexts(12, summary.identityFacts),
        worldRules: uniqueTexts(16, summary.worldRules),
        hardConstraints: uniqueTexts(12, summary.hardConstraints),
        cities: uniqueTexts(12, summary.cities),
        locations: uniqueTexts(12, summary.locations),
        entities: uniqueTexts(12, summary.entities),
        nations: uniqueTexts(12, summary.nations),
        regions: uniqueTexts(12, summary.regions),
        factions: uniqueTexts(12, summary.factions),
        calendarSystems: uniqueTexts(12, summary.calendarSystems),
        currencySystems: uniqueTexts(12, summary.currencySystems),
        socialSystems: uniqueTexts(12, summary.socialSystems),
        culturalPractices: uniqueTexts(12, summary.culturalPractices),
        historicalEvents: uniqueTexts(12, summary.historicalEvents),
        dangers: uniqueTexts(12, summary.dangers),
        otherWorldDetails: uniqueTexts(12, summary.otherWorldDetails),
        characterGoals: uniqueTexts(8, summary.characterGoals),
        relationshipFacts: uniqueTexts(8, summary.relationshipFacts),
        catchphrases: uniqueTexts(8, summary.catchphrases),
        relationshipAnchors: uniqueTexts(8, summary.relationshipAnchors),
        styleCues: uniqueTexts(10, summary.styleCues),
        generatedAt: Date.now(),
        source: 'ai' as const,
    };

    return {
        ...seed,
        aiSummary,
        identitySeed: {
            ...seed.identitySeed,
            identity: uniqueTexts(16, roleSummary ? [roleSummary] : [], aiSummary.identityFacts, seed.identitySeed.identity),
            catchphrases: uniqueTexts(8, aiSummary.catchphrases, seed.identitySeed.catchphrases),
            relationshipAnchors: uniqueTexts(8, aiSummary.relationshipAnchors, aiSummary.relationshipFacts, seed.identitySeed.relationshipAnchors),
        },
        worldSeed: {
            ...seed.worldSeed,
            locations: uniqueTexts(12, aiSummary.locations, seed.worldSeed.locations),
            rules: uniqueTexts(16, worldSummary ? [worldSummary] : [], aiSummary.worldRules, seed.worldSeed.rules),
            hardConstraints: uniqueTexts(12, aiSummary.hardConstraints, seed.worldSeed.hardConstraints),
            entities: uniqueTexts(12, aiSummary.entities, seed.worldSeed.entities),
        },
        styleSeed: {
            ...seed.styleSeed,
            cues: uniqueTexts(12, aiSummary.styleCues, seed.styleSeed.cues),
        },
    };
}

/**
 * 功能：在已有 semantic seed 上追加 AI 角色/世界观总结。
 * 参数：
 *   seed：当前冷启动 seed。
 * 返回：
 *   Promise<ChatSemanticSeed>：增强后的 seed；AI 不可用或失败时返回原 seed。
 */
export async function enhanceSemanticSeedWithAi(seed: ChatSemanticSeed): Promise<ChatSemanticSeed> {
    return enhanceSemanticSeedWithAiWithOptions(seed);
}

export async function enhanceSemanticSeedWithAiWithOptions(
    seed: ChatSemanticSeed,
    options?: EnhanceSemanticSeedWithAiOptions,
): Promise<ChatSemanticSeed> {
    if (!seed || (!options?.force && !shouldUseAiSummary(seed))) {
        return seed;
    }

    const systemPrompt = [
        '你是一个角色卡与世界观整理助手。',
        '请根据输入的角色描述、开场白、作者注释、系统提示和世界观资料，提炼适合 MemoryOS 冷启动的角色总结与世界观总结。',
        '只输出符合 schema 的 JSON，不要输出额外说明。',
        '所有自然语言内容使用简体中文。',
        '内容要简洁、可复用、避免编造；如果资料里没有，就返回空字符串或空数组。',
        '严格使用以下 JSON 键名：roleSummary, worldSummary, identityFacts, worldRules, hardConstraints, nations, regions, cities, locations, factions, entities, calendarSystems, currencySystems, socialSystems, culturalPractices, historicalEvents, dangers, otherWorldDetails, characterGoals, relationshipFacts, catchphrases, relationshipAnchors, styleCues。',
        'roleSummary 和 worldSummary 是字符串；其余键都必须是字符串数组。没有内容时返回空字符串或空数组。',
        'nations 只放国家、王国、帝国、联邦、共和国、政体实体。',
        'regions 只放大区、边境、行省、州郡、大陆分区。',
        'cities 只放城市、都城、主城、镇、村、聚落、港口城等聚居地。',
        'locations 只放神殿、遗迹、房间、据点、学院、基地、空间站、森林、峡谷等具体地点节点，不要放国家、区域、城市。',
        'factions 只放组织、派系、公会、教团、军团、家族势力。entities 只放不属于前述分类、但可单独索引的对象或机构。',
        'worldRules 放普遍规则与运行机制；hardConstraints 放绝对禁忌和硬限制。',
        'calendarSystems 放历法、纪年、节气与月份体系；currencySystems 放货币、面额、税制、交易度量；socialSystems 放阶级、身份等级、社会制度；culturalPractices 放礼俗、传统、节庆、仪式习惯。',
        'historicalEvents 放历史事件；dangers 放危险和威胁；characterGoals 放角色目标；relationshipFacts 与 relationshipAnchors 放稳定关系事实与检索锚点。',
        'otherWorldDetails 只放明确属于世界设定、但不适合放入上述任一分类的合法条目；不要把无法理解、残缺或噪音文本放进去。',
        '同一条内容只能进入一个最合适的字段。nation > region > city > location，系统类内容不要放入地点类字段。',
        '不要返回 character_summary、world_summary、seed_key_entries 或任何其他替代键名。',
    ].join('\n');

    const userPrompt = `${buildPromptPayload(seed)}\n\n请输出角色摘要、世界观摘要，以及适合做 seed 的关键条目。`;
    const result = await runGeneration<SemanticSeedAiSummary>(
        MEMORY_TASKS.COLDSTART_SUMMARIZE,
        {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
        },
        {
            maxTokens: 1200,
            maxLatencyMs: 0,
            chatKey: options?.chatKey,
            taskPresentation: options?.taskPresentation,
        },
        SEMANTIC_SEED_SUMMARY_SCHEMA,
        options?.taskDescription || '角色卡与世界观总结',
    );

    if (!result.ok) {
        logger.warn('[ColdStart][AiSummaryFailed]', {
            forced: options?.force === true,
            error: result.error || 'no_data',
            reasonCode: result.reasonCode,
        });
        return seed;
    }

    const normalizedSummary = normalizeSemanticSeedAiSummary(result.data);
    if (!normalizedSummary) {
        logger.warn('[ColdStart][AiSummaryNormalizeFailed]', {
            forced: options?.force === true,
            dataKeys: Object.keys(result.data as Record<string, unknown>).slice(0, 20),
        });
        return seed;
    }

    return mergeAiSummary(seed, normalizedSummary);
}
