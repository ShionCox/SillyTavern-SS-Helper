import { describe, expect, it } from 'vitest';
import { inferStructuredSeedWorldStateEntries } from '../src/core/world-state-seed';
import type { ChatSemanticSeed, SemanticAiSummary, SemanticCatalogEntrySummary, SemanticWorldFacetEntry } from '../src/types/chat-state';

/**
 * 功能：创建基础目录条目，便于测试时按需覆盖。
 * @param entry 部分覆盖字段。
 * @returns 完整目录条目。
 */
function createCatalogEntry(entry: Partial<SemanticCatalogEntrySummary> = {}): SemanticCatalogEntrySummary {
    return {
        name: entry.name ?? '',
        summary: entry.summary ?? '',
        knowledgeLevel: entry.knowledgeLevel,
        nationName: entry.nationName,
        nationKnowledgeLevel: entry.nationKnowledgeLevel,
        regionName: entry.regionName,
        regionKnowledgeLevel: entry.regionKnowledgeLevel,
        cityName: entry.cityName,
        cityKnowledgeLevel: entry.cityKnowledgeLevel,
        aliases: entry.aliases,
        tags: entry.tags,
    };
}

/**
 * 功能：创建基础世界分面条目，便于测试时按需覆盖。
 * @param entry 部分覆盖字段。
 * @returns 完整分面条目。
 */
function createFacetEntry(entry: Partial<SemanticWorldFacetEntry> = {}): SemanticWorldFacetEntry {
    return {
        title: entry.title ?? '',
        summary: entry.summary ?? '',
        facet: entry.facet ?? 'other',
        knowledgeLevel: entry.knowledgeLevel ?? 'confirmed',
        scopeType: entry.scopeType ?? 'global',
        nationName: entry.nationName,
        regionName: entry.regionName,
        cityName: entry.cityName,
        locationName: entry.locationName,
        appliesTo: entry.appliesTo,
        tags: entry.tags,
    };
}

/**
 * 功能：创建基础 AI 摘要结构，确保测试输入字段完整。
 * @param overrides 需要覆盖的字段。
 * @returns 完整 AI 摘要对象。
 */
function createAiSummary(overrides: Partial<Omit<SemanticAiSummary, 'generatedAt' | 'source'>> = {}): SemanticAiSummary {
    return {
        roleSummary: '',
        worldSummary: '',
        identityFacts: [],
        worldRules: [],
        hardConstraints: [],
        cities: [],
        locations: [],
        entities: [],
        nations: [],
        regions: [],
        factions: [],
        calendarSystems: [],
        currencySystems: [],
        socialSystems: [],
        culturalPractices: [],
        historicalEvents: [],
        dangers: [],
        otherWorldDetails: [],
        characterGoals: [],
        relationshipFacts: [],
        catchphrases: [],
        relationshipAnchors: [],
        styleCues: [],
        nationDetails: [],
        regionDetails: [],
        cityDetails: [],
        locationDetails: [],
        ruleDetails: [],
        constraintDetails: [],
        socialSystemDetails: [],
        culturalPracticeDetails: [],
        historicalEventDetails: [],
        dangerDetails: [],
        entityDetails: [],
        otherWorldDetailDetails: [],
        ...overrides,
        generatedAt: Date.now(),
        source: 'ai',
    };
}

/**
 * 功能：创建测试用语义种子，减少每个用例样板代码。
 * @param aiSummary AI 摘要内容。
 * @returns 完整语义种子对象。
 */
function createSeed(aiSummary: SemanticAiSummary): ChatSemanticSeed {
    return {
        collectedAt: Date.now(),
        characterCore: {},
        systemPrompt: '',
        firstMessage: '',
        authorNote: '',
        jailbreak: '',
        instruct: '',
        activeLorebooks: [],
        lorebookSeed: [],
        groupMembers: [],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'hero',
            displayName: '主角',
            aliases: [],
            identity: [],
            catchphrases: [],
            relationshipAnchors: [],
            sourceTrace: [],
        },
        worldSeed: {
            locations: [],
            rules: [],
            hardConstraints: [],
            entities: [],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'story',
            cues: [],
            sourceTrace: [],
        },
        aiSummary,
        sourceTrace: [],
    };
}

describe('world-state-seed', (): void => {
    it('不会把 worldSummary 直接拆句写入 world_state 条目', (): void => {
        const worldSummary = '总览：王朝盛世与礼法并行，此句仅用于总览，不应入法典。';
        const seed = createSeed(createAiSummary({
            worldSummary,
            worldRules: ['法典：后宫男子无诏不得出宫。'],
        }));
        const entries = inferStructuredSeedWorldStateEntries(seed);
        const paths = entries.map((item) => item.path);
        const summaries = entries.map((item) => String(item.value.summary ?? ''));

        expect(paths.some((path) => path.includes('/semantic/world/overview/'))).toBe(false);
        expect(summaries.some((summary) => summary.includes(worldSummary))).toBe(false);
        expect(paths.some((path) => path.startsWith('/semantic/rules/'))).toBe(true);
    });

    it('地点条目不会把地点名错误回填到城市字段', (): void => {
        const seed = createSeed(createAiSummary({
            locationDetails: [
                createCatalogEntry({
                    name: '御花园',
                    summary: '供皇室休憩游玩之所',
                    cityName: '御花园',
                    cityKnowledgeLevel: 'rumor',
                }),
            ],
        }));
        const entries = inferStructuredSeedWorldStateEntries(seed);
        const locationEntry = entries.find((item) => item.path.startsWith('/semantic/catalog/locations/'));

        expect(locationEntry).toBeDefined();
        expect(locationEntry?.value.title).toBe('御花园');
        expect(locationEntry?.value.cityName).toBeUndefined();
        expect(locationEntry?.value.cityId).toBeUndefined();
    });

    it('同名地点会按主键升级合并，传闻可升级为明确', (): void => {
        const seed = createSeed(createAiSummary({
            locationDetails: [
                createCatalogEntry({
                    name: '未央宫',
                    summary: '君后寝宫',
                    knowledgeLevel: 'rumor',
                }),
                createCatalogEntry({
                    name: '未央宫',
                    summary: '君后寝宫，位于凤阙王都',
                    knowledgeLevel: 'confirmed',
                    nationName: '凤阙王朝',
                    cityName: '王都',
                    cityKnowledgeLevel: 'confirmed',
                }),
            ],
        }));
        const entries = inferStructuredSeedWorldStateEntries(seed);
        const locationEntries = entries.filter((item) => item.path.startsWith('/semantic/catalog/locations/'));

        expect(locationEntries).toHaveLength(1);
        expect(locationEntries[0].value.title).toBe('未央宫');
        expect(locationEntries[0].value.knowledgeLevel).toBe('confirmed');
        expect(locationEntries[0].value.cityName).toBe('王都');
        expect(locationEntries[0].value.nationName).toBe('凤阙王朝');
        expect(typeof locationEntries[0].value.canonicalKey).toBe('string');
    });

    it('跨 facet 重复语义会按优先级保留单条记录', (): void => {
        const duplicatedSummary = '女娶男嫁，男子嫁入女方，从妻居，所生子女从母姓';
        const seed = createSeed(createAiSummary({
            ruleDetails: [
                createFacetEntry({
                    facet: 'rule',
                    title: '婚姻继嗣',
                    summary: duplicatedSummary,
                }),
            ],
            socialSystemDetails: [
                createFacetEntry({
                    facet: 'social',
                    title: '婚姻继嗣',
                    summary: duplicatedSummary,
                }),
            ],
            constraintDetails: [
                createFacetEntry({
                    facet: 'constraint',
                    title: '婚姻继嗣',
                    summary: duplicatedSummary,
                }),
            ],
        }));
        const entries = inferStructuredSeedWorldStateEntries(seed);
        const duplicatedEntries = entries.filter((item) => String(item.value.summary ?? '').includes(duplicatedSummary));

        expect(duplicatedEntries).toHaveLength(1);
        expect(duplicatedEntries[0].path.startsWith('/semantic/constraints/')).toBe(true);
        expect(duplicatedEntries[0].value.stateType).toBe('constraint');
    });
});
