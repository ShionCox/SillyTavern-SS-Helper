import { describe, expect, it } from 'vitest';
import { inferStructuredSeedWorldStateEntries } from '../src/core/world-state-seed';
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
            relationshipAnchors: ['信任 Bob，但不愿暴露真正目标'],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['晨星王国边境城市白露城', '北境冻土'],
            rules: ['王国法律禁止私自持有禁术卷轴'],
            hardConstraints: ['任何人不得穿越永夜裂谷'],
            entities: ['晨星王国', '白塔议会', '白露城守夜军'],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'story',
            cues: [],
            sourceTrace: [],
        },
        aiSummary: {
            roleSummary: 'Alice 必须抢在敌人之前找到王冠。',
            worldSummary: '晨星王国正处于旧王战争后的脆弱恢复期。永夜裂谷的威胁持续扩大。',
            identityFacts: ['她的目标是找到失落王冠'],
            worldRules: ['王国法律禁止私自持有禁术卷轴'],
            hardConstraints: ['任何人不得穿越永夜裂谷'],
            cities: ['白露城'],
            locations: ['晨星王国边境城市白露城'],
            entities: ['晨星王国', '白塔议会'],
            nations: ['晨星王国'],
            regions: ['北境冻土'],
            factions: ['白塔议会'],
            calendarSystems: ['晨星历以双月循环纪年'],
            currencySystems: ['王国流通银鹿银币与铜羽币'],
            socialSystems: ['王国实行贵族议会共治'],
            culturalPractices: ['冬至举行守夜祭'],
            historicalEvents: ['旧王战争摧毁了北境的补给线'],
            dangers: ['永夜裂谷的威胁持续扩大'],
            otherWorldDetails: ['星门誓约被视为世界秩序的隐性基础'],
            characterGoals: ['Alice 必须抢在敌人之前找到王冠'],
            relationshipFacts: ['Alice 信任 Bob，但不愿暴露真正目标'],
            catchphrases: [],
            relationshipAnchors: ['信任 Bob，但不愿暴露真正目标'],
            styleCues: [],
            generatedAt: Date.now(),
            source: 'ai',
        },
        sourceTrace: [],
    };
}

describe('world-state-seed', (): void => {
    it('会把 seed 映射成国家、区域、阵营、关系、目标、危险、历史等结构化状态', (): void => {
        const entries = inferStructuredSeedWorldStateEntries(buildSeed());
        const paths = entries.map((item) => item.path);
        const values = entries.map((item) => item.value);

        expect(paths.some((path) => path.includes('/semantic/catalog/nations/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/catalog/regions/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/catalog/cities/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/catalog/factions/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/characters/alice/relationships/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/characters/alice/goals/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/world/history/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/world/danger/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/world/systems/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/world/other/'))).toBe(true);
        expect(paths.some((path) => path.includes('/semantic/catalog/locations/') && path.includes('currency'))).toBe(false);

        expect(values.some((value) => value.scopeType === 'nation')).toBe(true);
        expect(values.some((value) => value.scopeType === 'region')).toBe(true);
        expect(values.some((value) => value.scopeType === 'city')).toBe(true);
        expect(values.some((value) => value.scopeType === 'faction')).toBe(true);
        expect(values.some((value) => value.stateType === 'relationship')).toBe(true);
        expect(values.some((value) => value.stateType === 'goal')).toBe(true);
        expect(values.some((value) => value.stateType === 'history')).toBe(true);
        expect(values.some((value) => value.stateType === 'danger')).toBe(true);
        expect(values.some((value) => value.stateType === 'rule')).toBe(true);
        expect(values.some((value) => value.stateType === 'constraint')).toBe(true);
        expect(values.some((value) => value.stateType === 'culture')).toBe(true);
        expect(values.some((value) => value.stateType === 'other')).toBe(true);
    });
});