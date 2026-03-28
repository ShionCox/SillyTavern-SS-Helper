import type { WorldProfileDefinition } from '../types';

/**
 * 功能：现代都市世界模板。
 */
export const URBAN_MODERN_PROFILE: WorldProfileDefinition = {
    worldProfileId: 'urban_modern',
    displayName: '现代都市',
    genre: 'modern',
    subGenres: ['slice_of_life', 'school', 'workplace'],
    capabilities: {
        hasMagic: false,
        hasCultivation: false,
        hasFantasyRace: false,
        hasModernTechnology: true,
        hasFormalPoliticalOrder: true,
        hasSupernatural: false,
    },
    preferredSchemas: ['actor_profile', 'relationship', 'event', 'location', 'organization', 'task', 'world_global_state'],
    preferredFacets: ['social_order', 'city_life', 'public_rules', 'career', 'daily_relationship'],
    schemaFieldExtensions: {
        location: ['district', 'businessType', 'publicAccess'],
        organization: ['industry', 'legalStatus'],
    },
    summaryBias: {
        boostedTypes: ['relationship', 'event', 'task', 'organization'],
        suppressedTypes: ['artifact_rule', 'race_rule'],
    },
    injectionStyle: 'urban_modern',
    styleHintKeywords: ['现代', '都市', '现实', '公司', '城市'],
    detectionKeywords: [
        '都市',
        '公司',
        '学校',
        '地铁',
        '警察',
        '媒体',
        '互联网',
        '办公',
        '商场',
        '写字楼',
    ],
};
