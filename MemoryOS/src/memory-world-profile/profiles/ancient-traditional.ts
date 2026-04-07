import type { WorldProfileDefinition } from '../types';

/**
 * 功能：古风传统世界模板。
 */
export const ANCIENT_TRADITIONAL_PROFILE: WorldProfileDefinition = {
    worldProfileId: 'ancient_traditional',
    displayName: '古风传统',
    genre: 'ancient',
    subGenres: ['jianghu', 'court', 'wuxia'],
    capabilities: {
        hasMagic: false,
        hasCultivation: true,
        hasFantasyRace: false,
        hasModernTechnology: false,
        hasFormalPoliticalOrder: true,
        hasSupernatural: true,
    },
    preferredSchemas: ['event', 'location', 'organization', 'task', 'world_hard_rule'],
    preferredFacets: ['court_order', 'sect_rules', 'honor', 'fate', 'lineage'],
    schemaFieldExtensions: {
        location: ['region', 'sectControl', 'forbiddenZone'],
        organization: ['lineage', 'sects', 'allegiance'],
    },
    summaryBias: {
        boostedTypes: ['event', 'world_hard_rule', 'task'],
        suppressedTypes: ['technology_rule'],
    },
    injectionStyle: 'ancient_traditional',
    styleHintKeywords: ['古风', '江湖', '朝堂', '门派', '赴约'],
    detectionKeywords: [
        '王朝',
        '江湖',
        '门派',
        '宗门',
        '朝堂',
        '修行',
        '内力',
        '武学',
        '皇城',
        '侠',
    ],
};
