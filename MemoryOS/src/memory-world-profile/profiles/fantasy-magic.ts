import type { WorldProfileDefinition } from '../types';

/**
 * 功能：魔幻世界模板。
 */
export const FANTASY_MAGIC_PROFILE: WorldProfileDefinition = {
    worldProfileId: 'fantasy_magic',
    displayName: '魔幻',
    genre: 'fantasy',
    subGenres: ['high_fantasy', 'adventure', 'myth'],
    capabilities: {
        hasMagic: true,
        hasCultivation: false,
        hasFantasyRace: true,
        hasModernTechnology: false,
        hasFormalPoliticalOrder: true,
        hasSupernatural: true,
    },
    preferredSchemas: ['actor_profile', 'relationship', 'event', 'location', 'organization', 'item', 'world_core_setting', 'world_hard_rule'],
    preferredFacets: ['magic_system', 'race_order', 'kingdom', 'prophecy', 'epic_conflict'],
    schemaFieldExtensions: {
        event: ['magicCost', 'artifactImpact', 'prophecyTag'],
        location: ['manaDensity', 'factionControl', 'dangerRank'],
    },
    summaryBias: {
        boostedTypes: ['event', 'relationship', 'world_core_setting', 'world_hard_rule', 'item'],
        suppressedTypes: ['office_task', 'career'],
    },
    injectionStyle: 'fantasy_magic',
    styleHintKeywords: ['奇幻', '冒险', '跑团', '任务板', '地下城'],
    detectionKeywords: [
        '魔法',
        '法术',
        '龙族',
        '王国',
        '魔王',
        '圣殿',
        '祭司',
        '精灵',
        '诅咒',
        '秘银',
    ],
};
