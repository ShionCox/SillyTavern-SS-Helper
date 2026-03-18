import { describe, expect, it } from 'vitest';
import { mergeAiSummary, normalizeSemanticSeedAiSummary } from '../src/core/chat-semantic-ai-summary';
import type { ChatSemanticSeed } from '../src/types/chat-state';

function buildSeed(): ChatSemanticSeed {
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
            roleKey: 'alice',
            displayName: 'Alice',
            aliases: [],
            identity: ['冒险者'],
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
    it('会识别并保留显式结构分类字段', (): void => {
        const summary = normalizeSemanticSeedAiSummary({
            roleSummary: 'Alice 必须夺回王冠。',
            worldSummary: '晨星王国在旧王战争后秩序脆弱。',
            identityFacts: ['Alice 是失落王室后裔'],
            worldRules: ['王国法律禁止私藏禁术卷轴'],
            hardConstraints: ['任何人不得穿越永夜裂谷'],
            locations: ['白露城'],
            entities: ['白塔议会'],
            nations: ['晨星王国'],
            regions: ['北境冻土'],
            factions: ['白塔议会'],
            historicalEvents: ['旧王战争摧毁了北境补给线'],
            dangers: ['永夜裂谷的裂隙正在扩张'],
            characterGoals: ['Alice 必须赶在敌人前找到失落王冠'],
            relationshipFacts: ['Alice 信任 Bob，但不愿公开底牌'],
            catchphrases: [],
            relationshipAnchors: ['信任 Bob'],
            styleCues: ['冷峻史诗'],
        });

        expect(summary).not.toBeNull();
        expect(summary?.nations).toContain('晨星王国');
        expect(summary?.regions).toContain('北境冻土');
        expect(summary?.factions).toContain('白塔议会');
        expect(summary?.historicalEvents).toContain('旧王战争摧毁了北境补给线');
        expect(summary?.dangers).toContain('永夜裂谷的裂隙正在扩张');
        expect(summary?.characterGoals).toContain('Alice 必须赶在敌人前找到失落王冠');
        expect(summary?.relationshipFacts).toContain('Alice 信任 Bob，但不愿公开底牌');
    });

    it('会把显式分类合并回 seed 供旧链路继续消费', (): void => {
        const merged = mergeAiSummary(buildSeed(), {
            roleSummary: 'Alice 必须夺回王冠。',
            worldSummary: '晨星王国在旧王战争后秩序脆弱。',
            identityFacts: [],
            worldRules: [],
            hardConstraints: [],
            locations: ['白露城'],
            entities: [],
            nations: ['晨星王国'],
            regions: ['北境冻土'],
            factions: ['白塔议会'],
            historicalEvents: ['旧王战争摧毁了北境补给线'],
            dangers: ['永夜裂谷的裂隙正在扩张'],
            characterGoals: ['Alice 必须赶在敌人前找到失落王冠'],
            relationshipFacts: ['Alice 信任 Bob，但不愿公开底牌'],
            catchphrases: [],
            relationshipAnchors: ['信任 Bob'],
            styleCues: [],
        });

        expect(merged.aiSummary?.nations).toContain('晨星王国');
        expect(merged.aiSummary?.characterGoals).toContain('Alice 必须赶在敌人前找到失落王冠');
        expect(merged.worldSeed.locations).toEqual(expect.arrayContaining(['白露城', '北境冻土', '晨星王国']));
        expect(merged.worldSeed.entities).toEqual(expect.arrayContaining(['白塔议会', '晨星王国']));
        expect(merged.identitySeed.relationshipAnchors).toEqual(expect.arrayContaining(['信任 Bob', 'Alice 信任 Bob，但不愿公开底牌']));
    });
});