import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PERSONA_MEMORY_PROFILE,
    DEFAULT_SIMPLE_MEMORY_PERSONA,
} from '../src/types';
import type { MemoryOSChatState } from '../src/types';
import {
    choosePreferredPersonaActorKey,
    getPrimaryPersonaActorKey,
    migratePersonaState,
    normalizeIdentitySeedMap,
    resolvePersonaProfile,
} from '../src/core/persona-compat';

describe('persona-compat', (): void => {
    it('会把旧单角色画像迁移到 actorKey map', (): void => {
        const state = migratePersonaState({
            semanticSeed: {
                version: 'seed.v2',
                settingSummary: 'Alice 是当前主角。',
                identitySeed: {
                    roleKey: 'alice',
                    displayName: 'Alice',
                    aliases: ['A'],
                    identity: ['调查员'],
                    relationshipAnchors: ['信任 Bob'],
                    catchphrases: ['保持冷静'],
                    sourceTrace: [],
                },
                goals: [],
                taboo: [],
                worldRules: [],
                userPersonaHints: [],
                sourceRefs: [],
                updatedAt: 123,
            },
            personaMemoryProfile: {
                ...DEFAULT_PERSONA_MEMORY_PROFILE,
                profileVersion: 'persona.v1',
                totalCapacity: 0.66,
                updatedAt: 456,
            },
            simpleMemoryPersona: {
                ...DEFAULT_SIMPLE_MEMORY_PERSONA,
                memoryStrength: 'strong',
                updatedAt: 456,
            },
        } as unknown as MemoryOSChatState);

        expect(state.activeActorKey).toBe('alice');
        expect(state.personaMemoryProfiles?.alice?.totalCapacity).toBe(0.66);
        expect(state.simpleMemoryPersonas?.alice?.memoryStrength).toBe('strong');
        expect(resolvePersonaProfile(state, 'alice')?.profileVersion).toBe('persona.v1');
    });

    it('会优先使用 activeActorKey 作为主角色，并规范 identity seed map', (): void => {
        const state = {
            activeActorKey: 'bob',
            semanticSeed: {
                version: 'seed.v2',
                settingSummary: 'Alice 与 Bob 同时参与。',
                identitySeed: {
                    roleKey: 'alice',
                    displayName: 'Alice',
                    aliases: ['A'],
                    identity: ['调查员'],
                    relationshipAnchors: [],
                    catchphrases: [],
                    sourceTrace: [],
                },
                identitySeeds: {
                    bob: {
                        roleKey: ' bob ',
                        displayName: ' Bob ',
                        aliases: ['B'],
                        identity: ['护卫'],
                        relationshipAnchors: ['保护 Alice'],
                        catchphrases: ['交给我'],
                        sourceTrace: [],
                    },
                },
                goals: [],
                taboo: [],
                worldRules: [],
                userPersonaHints: [],
                sourceRefs: [],
                updatedAt: 123,
            },
            personaMemoryProfiles: {
                bob: {
                    ...DEFAULT_PERSONA_MEMORY_PROFILE,
                    profileVersion: 'persona.v2',
                    eventMemory: 0.72,
                    updatedAt: 789,
                },
            },
        } as unknown as MemoryOSChatState;

        const identitySeeds = normalizeIdentitySeedMap(state.semanticSeed);

        expect(getPrimaryPersonaActorKey(state)).toBe('bob');
        expect(identitySeeds.alice?.displayName).toBe('Alice');
        expect(identitySeeds.bob?.roleKey).toBe('bob');
        expect(resolvePersonaProfile(state, null)?.eventMemory).toBe(0.72);
    });

    it('会把 assistant 前缀与裸角色键归并为同一角色', (): void => {
        const state = migratePersonaState({
            semanticSeed: {
                version: 'seed.v2',
                settingSummary: '艾莉卡是主角色。',
                identitySeed: {
                    roleKey: '艾莉卡·暮影',
                    displayName: '艾莉卡·暮影',
                    aliases: [],
                    identity: ['法师'],
                    relationshipAnchors: [],
                    catchphrases: [],
                    sourceTrace: [],
                },
                identitySeeds: {
                    'assistant:艾莉卡·暮影': {
                        roleKey: 'assistant:艾莉卡·暮影',
                        displayName: '艾莉卡·暮影',
                        aliases: [],
                        identity: ['法师'],
                        relationshipAnchors: [],
                        catchphrases: [],
                        sourceTrace: [],
                    },
                },
                goals: [],
                taboo: [],
                worldRules: [],
                userPersonaHints: [],
                sourceRefs: [],
                updatedAt: 123,
            },
            personaMemoryProfiles: {
                'assistant:艾莉卡·暮影': {
                    ...DEFAULT_PERSONA_MEMORY_PROFILE,
                    updatedAt: 10,
                },
                '艾莉卡·暮影': {
                    ...DEFAULT_PERSONA_MEMORY_PROFILE,
                    updatedAt: 20,
                    totalCapacity: 0.77,
                },
            },
        } as unknown as MemoryOSChatState);

        expect(choosePreferredPersonaActorKey('assistant:艾莉卡·暮影', '艾莉卡·暮影')).toBe('艾莉卡·暮影');
        expect(Object.keys(state.personaMemoryProfiles ?? {})).toHaveLength(1);
        expect(state.personaMemoryProfiles?.['艾莉卡·暮影']?.totalCapacity).toBe(0.77);
    });
});
