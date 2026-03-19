import { describe, expect, it } from 'vitest';
import { mergeAiSummary, normalizeSemanticSeedAiSummary } from '../src/core/chat-semantic-ai-summary';
import type { ChatSemanticSeed, SemanticAiSummary, SemanticCatalogEntrySummary, SemanticWorldFacetEntry } from '../src/types/chat-state';

/**
 * 功能：创建基础目录条目，便于测试中复用。
 * @param entry 需要覆盖的字段。
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
 * 功能：创建基础世界分面条目，便于测试中复用。
 * @param entry 需要覆盖的字段。
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
 * 功能：创建基础 AI 摘要，避免每个测试重复构造完整结构。
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
 * 功能：创建测试语义种子。
 * @returns 语义种子对象。
 */
function createSeed(): ChatSemanticSeed {
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
        sourceTrace: [],
    };
}

describe('chat-semantic-ai-summary', (): void => {
    it('能保留世界明细数组与知识级别字段', (): void => {
        const normalized = normalizeSemanticSeedAiSummary({
            roleSummary: '凤阙王朝女帝',
            worldSummary: '总览：女尊王朝盛世',
            identityFacts: ['姓名：萧明鸾'],
            worldRules: ['女帝掌天下大权'],
            hardConstraints: ['不得违抗主母命令'],
            cities: ['王都'],
            locations: ['御花园'],
            entities: ['凤玺'],
            nations: ['凤阙王朝'],
            regions: ['京畿'],
            factions: ['内阁'],
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
            nationDetails: [
                createCatalogEntry({
                    name: '凤阙王朝',
                    summary: '女尊世袭王朝',
                    knowledgeLevel: 'confirmed',
                    aliases: ['凤阙'],
                    tags: ['nation'],
                }),
            ],
            regionDetails: [],
            cityDetails: [
                createCatalogEntry({
                    name: '京畿王都',
                    summary: '皇城所在',
                    knowledgeLevel: 'rumor',
                    nationName: '凤阙王朝',
                    nationKnowledgeLevel: 'confirmed',
                }),
            ],
            locationDetails: [
                createCatalogEntry({
                    name: '御花园',
                    summary: '供皇室休憩游玩之所',
                    cityName: '京畿王都',
                    cityKnowledgeLevel: 'rumor',
                }),
            ],
            ruleDetails: [
                createFacetEntry({
                    facet: 'rule',
                    title: '女帝统军',
                    summary: '朝堂军政由女性统辖',
                    knowledgeLevel: 'confirmed',
                    scopeType: 'nation',
                    nationName: '凤阙王朝',
                }),
            ],
            constraintDetails: [],
            socialSystemDetails: [],
            culturalPracticeDetails: [],
            historicalEventDetails: [],
            dangerDetails: [],
            entityDetails: [],
            otherWorldDetailDetails: [],
        });

        expect(normalized).not.toBeNull();
        expect(normalized?.nationDetails[0]?.knowledgeLevel).toBe('confirmed');
        expect(normalized?.cityDetails[0]?.knowledgeLevel).toBe('rumor');
        expect(normalized?.locationDetails[0]?.cityKnowledgeLevel).toBe('rumor');
        expect(normalized?.ruleDetails[0]?.facet).toBe('rule');
        expect(normalized?.ruleDetails[0]?.scopeType).toBe('nation');
    });

    it('mergeAiSummary 不会把 worldSummary 直接写入 worldSeed.rules', (): void => {
        const seed = createSeed();
        const merged = mergeAiSummary(seed, createAiSummary({
            worldSummary: '总览：王朝礼法森严，此句仅用于总览展示。',
            worldRules: ['后宫男子无诏不得出宫。'],
        }));

        expect(merged.aiSummary?.worldSummary).toContain('仅用于总览');
        expect(merged.worldSeed.rules).toEqual(['后宫男子无诏不得出宫。']);
        expect(merged.worldSeed.rules.some((item: string): boolean => item.includes('仅用于总览'))).toBe(false);
    });

    it('mergeAiSummary 会把 detail 名称合并进对应目录数组', (): void => {
        const seed = createSeed();
        const merged = mergeAiSummary(seed, createAiSummary({
            nations: [],
            cities: [],
            locations: [],
            nationDetails: [createCatalogEntry({ name: '凤阙王朝', summary: '女尊世袭王朝' })],
            cityDetails: [createCatalogEntry({ name: '京畿王都', summary: '皇城' })],
            locationDetails: [createCatalogEntry({ name: '太和殿', summary: '外朝正殿' })],
        }));

        expect(merged.aiSummary?.nations).toContain('凤阙王朝');
        expect(merged.aiSummary?.cities).toContain('京畿王都');
        expect(merged.aiSummary?.locations).toContain('太和殿');
        expect(merged.worldSeed.locations).toContain('太和殿');
    });
});
