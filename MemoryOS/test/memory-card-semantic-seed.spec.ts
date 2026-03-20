import { describe, expect, it } from 'vitest';
import type { ChatSemanticSeed } from '../src/types/chat-state';
import { buildMemoryCardDraftsFromSemanticSeed } from '../src/core/memory-card-semantic-seed';

/**
 * 功能：构造测试用语义种子。
 * @returns 可用于冷启动卡片构建的语义种子。
 */
function createSeed(): ChatSemanticSeed {
    return {
        collectedAt: Date.now(),
        characterCore: { characterId: 'char-001' },
        systemPrompt: '你是 Alice。',
        firstMessage: '你好。',
        authorNote: '',
        jailbreak: '',
        instruct: '',
        activeLorebooks: ['book-a', 'book-b'],
        lorebookSeed: [],
        groupMembers: ['Alice', 'Bob'],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'alice',
            displayName: 'Alice',
            aliases: ['A'],
            identity: ['她是冷静的调查员'],
            catchphrases: ['先看证据'],
            relationshipAnchors: ['她信任 Bob'],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['白露城'],
            rules: ['公开施法会留下痕迹'],
            hardConstraints: ['贵族不得公开与平民订婚'],
            entities: ['黑塔'],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'narrative',
            cues: ['简短克制'],
            sourceTrace: [],
        },
        aiSummary: {
            roleSummary: 'Alice 以证据优先。',
            worldSummary: '世界存在严格魔法监管。',
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
            relationshipFacts: ['她与 Bob 长期协作。'],
            catchphrases: [],
            relationshipAnchors: ['她保护 Bob'],
            styleCues: ['避免夸张语气'],
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
            generatedAt: Date.now(),
            source: 'ai',
        },
        sourceTrace: [],
    };
}

describe('buildMemoryCardDraftsFromSemanticSeed', (): void => {
    it('会产出身份、风格、关系、规则与会话绑定卡', (): void => {
        const drafts = buildMemoryCardDraftsFromSemanticSeed(createSeed(), {
            fingerprint: 'fp-001',
            reason: 'bootstrap_init',
        });
        const lanes = new Set(drafts.map((item) => item.lane));
        expect(lanes.has('identity')).toBe(true);
        expect(lanes.has('style')).toBe(true);
        expect(lanes.has('relationship')).toBe(true);
        expect(lanes.has('rule')).toBe(true);
        expect(lanes.has('state')).toBe(true);
        expect(drafts.every((item) => item.sourceRecordKind === 'semantic_seed')).toBe(true);
        expect(drafts.every((item) => item.sourceRecordKey === 'semantic_seed:active')).toBe(true);
    });

    it('世界规则会按一条一张卡拆分', (): void => {
        const drafts = buildMemoryCardDraftsFromSemanticSeed(createSeed());
        const ruleCards = drafts.filter((item) => item.lane === 'rule');
        expect(ruleCards.length).toBeGreaterThanOrEqual(2);
        expect(ruleCards.map((item) => item.memoryText).join('\n')).toContain('公开施法会留下痕迹');
        expect(ruleCards.map((item) => item.memoryText).join('\n')).toContain('贵族不得公开与平民订婚');
    });
});
