import type { WorldProfileDefinition } from '../types';

/**
 * 功能：现代潜藏超自然世界模板。
 */
export const SUPERNATURAL_HIDDEN_PROFILE: WorldProfileDefinition = {
    worldProfileId: 'supernatural_hidden',
    displayName: '现代潜藏超自然',
    genre: 'mixed',
    subGenres: ['urban_fantasy', 'mystery'],
    capabilities: {
        hasMagic: true,
        hasCultivation: false,
        hasFantasyRace: true,
        hasModernTechnology: true,
        hasFormalPoliticalOrder: true,
        hasSupernatural: true,
    },
    preferredSchemas: ['actor_profile', 'relationship', 'event', 'organization', 'location', 'world_global_state', 'world_hard_rule'],
    preferredFacets: ['hidden_society', 'public_order', 'secret_conflict'],
    schemaFieldExtensions: {
        organization: ['publicCover', 'hiddenPurpose'],
        event: ['coverStory', 'publicExposureRisk'],
    },
    summaryBias: {
        boostedTypes: ['relationship', 'event', 'world_global_state'],
        suppressedTypes: ['race_rule'],
    },
    injectionStyle: 'supernatural_hidden',
    detectionKeywords: [
        '异常',
        '怪异',
        '灵异',
        '结界',
        '封印',
        '调查局',
        '都市传说',
        '夜巡',
    ],
};
