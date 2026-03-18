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
            cities: ['白露城'],
            locations: ['白露城'],
            entities: ['白塔议会'],
            nations: ['晨星王国'],
            regions: ['北境冻土'],
            factions: ['白塔议会'],
            calendarSystems: ['晨星历以双月循环纪年'],
            currencySystems: ['王国流通银鹿银币与铜羽币'],
            socialSystems: ['王国实行贵族议会共治'],
            culturalPractices: ['冬至举行守夜祭'],
            historicalEvents: ['旧王战争摧毁了北境补给线'],
            dangers: ['永夜裂谷的裂隙正在扩张'],
            otherWorldDetails: ['星门誓约被视为世界秩序的隐性基础'],
            characterGoals: ['Alice 必须赶在敌人前找到失落王冠'],
            relationshipFacts: ['Alice 信任 Bob，但不愿公开底牌'],
            catchphrases: [],
            relationshipAnchors: ['信任 Bob'],
            styleCues: ['冷峻史诗'],
        });

        expect(summary).not.toBeNull();
        expect(summary?.nations).toContain('晨星王国');
        expect(summary?.regions).toContain('北境冻土');
        expect(summary?.cities).toContain('白露城');
        expect(summary?.factions).toContain('白塔议会');
        expect(summary?.calendarSystems).toContain('晨星历以双月循环纪年');
        expect(summary?.currencySystems).toContain('王国流通银鹿银币与铜羽币');
        expect(summary?.socialSystems).toContain('王国实行贵族议会共治');
        expect(summary?.culturalPractices).toContain('冬至举行守夜祭');
        expect(summary?.historicalEvents).toContain('旧王战争摧毁了北境补给线');
        expect(summary?.dangers).toContain('永夜裂谷的裂隙正在扩张');
        expect(summary?.otherWorldDetails).toContain('星门誓约被视为世界秩序的隐性基础');
        expect(summary?.characterGoals).toContain('Alice 必须赶在敌人前找到失落王冠');
        expect(summary?.relationshipFacts).toContain('Alice 信任 Bob，但不愿公开底牌');
    });

    it('会从兼容旧格式里提取城市、系统类和其他设定字段', (): void => {
        const summary = normalizeSemanticSeedAiSummary({
            character_summary: {
                role_identity: 'Alice 是失落王室后裔',
                goals: ['Alice 必须找回王冠'],
            },
            world_summary: {
                core_concept: '晨星王国在裂谷危机中摇摇欲坠',
                key_locations: ['白露城', '月井神殿'],
            },
            seed_key_entries: [
                { type: '区域', items: ['北境冻土'] },
                { type: '城市', items: ['白露城'] },
                { type: '地点', items: ['月井神殿'] },
                { type: '历法', items: ['晨星历以双月循环纪年'] },
                { type: '货币', items: ['王国流通银鹿银币与铜羽币'] },
                { type: '社会制度', items: ['王国实行贵族议会共治'] },
                { type: '习俗', items: ['冬至举行守夜祭'] },
                { type: '其他设定', items: ['星门誓约被视为世界秩序的隐性基础'] },
            ],
        });

        expect(summary).not.toBeNull();
        expect(summary?.regions).toContain('区域：北境冻土');
        expect(summary?.cities).toContain('城市：白露城');
        expect(summary?.locations).toContain('地点：月井神殿');
        expect(summary?.calendarSystems).toContain('历法：晨星历以双月循环纪年');
        expect(summary?.currencySystems).toContain('货币：王国流通银鹿银币与铜羽币');
        expect(summary?.socialSystems).toContain('社会制度：王国实行贵族议会共治');
        expect(summary?.culturalPractices).toContain('习俗：冬至举行守夜祭');
        expect(summary?.otherWorldDetails).toContain('其他设定：星门誓约被视为世界秩序的隐性基础');
    });

    it('会保留显式分类并避免把国家区域系统类重新污染旧字段', (): void => {
        const merged = mergeAiSummary(buildSeed(), {
            roleSummary: 'Alice 必须夺回王冠。',
            worldSummary: '晨星王国在旧王战争后秩序脆弱。',
            identityFacts: [],
            worldRules: [],
            hardConstraints: [],
            cities: ['白露城'],
            locations: ['白露城'],
            entities: [],
            nations: ['晨星王国'],
            regions: ['北境冻土'],
            factions: ['白塔议会'],
            calendarSystems: ['晨星历以双月循环纪年'],
            currencySystems: ['王国流通银鹿银币与铜羽币'],
            socialSystems: ['王国实行贵族议会共治'],
            culturalPractices: ['冬至举行守夜祭'],
            historicalEvents: ['旧王战争摧毁了北境补给线'],
            dangers: ['永夜裂谷的裂隙正在扩张'],
            otherWorldDetails: ['星门誓约被视为世界秩序的隐性基础'],
            characterGoals: ['Alice 必须赶在敌人前找到失落王冠'],
            relationshipFacts: ['Alice 信任 Bob，但不愿公开底牌'],
            catchphrases: [],
            relationshipAnchors: ['信任 Bob'],
            styleCues: [],
        });

        expect(merged.aiSummary?.nations).toContain('晨星王国');
        expect(merged.aiSummary?.cities).toContain('白露城');
        expect(merged.aiSummary?.calendarSystems).toContain('晨星历以双月循环纪年');
        expect(merged.aiSummary?.otherWorldDetails).toContain('星门誓约被视为世界秩序的隐性基础');
        expect(merged.aiSummary?.characterGoals).toContain('Alice 必须赶在敌人前找到失落王冠');
        expect(merged.worldSeed.locations).toEqual(['白露城']);
        expect(merged.worldSeed.entities).toEqual([]);
        expect(merged.identitySeed.relationshipAnchors).toEqual(expect.arrayContaining(['信任 Bob', 'Alice 信任 Bob，但不愿公开底牌']));
    });
});