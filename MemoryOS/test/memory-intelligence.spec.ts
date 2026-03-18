import { describe, expect, it } from 'vitest';
import {
    applyCandidateThresholdBias,
    buildPerActorRetentionMap,
    buildLifecycleState,
    buildScoredMemoryCandidate,
    buildSimpleMemoryPersona,
    computeActorRetentionState,
    inferPersonaMemoryProfile,
    inferPersonaMemoryProfiles,
    resolveInjectedMemoryTone,
    scoreRecallCandidate,
} from '../src/core/memory-intelligence';
import { DEFAULT_CHAT_PROFILE, DEFAULT_GROUP_MEMORY, DEFAULT_MEMORY_TUNING_PROFILE } from '../src/types';

describe('memory-intelligence', (): void => {
    it('会为不同聊天画像推导不同 persona', (): void => {
        const strongProfile = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'high',
                stylePreference: 'story',
                extractStrategy: 'facts_relations_world',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const weakProfile = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'low',
                stylePreference: 'qa',
                extractStrategy: 'facts_only',
            },
            DEFAULT_GROUP_MEMORY,
        );

        expect(strongProfile.totalCapacity).toBeGreaterThan(weakProfile.totalCapacity);
        expect(strongProfile.relationshipSensitivity).toBeGreaterThan(weakProfile.relationshipSensitivity);
        expect(strongProfile.forgettingSpeed).toBeLessThan(weakProfile.forgettingSpeed);
    });

    it('会为多角色种子分别推导 persona map', (): void => {
        const profiles = inferPersonaMemoryProfiles(
            {
                version: 'seed.v2',
                settingSummary: '双角色共同推进剧情。',
                identitySeed: {
                    roleKey: 'alice',
                    displayName: 'Alice',
                    aliases: ['A'],
                    identity: ['调查员'],
                    catchphrases: ['保持冷静'],
                    relationshipAnchors: ['信任 Bob'],
                    sourceTrace: [],
                },
                identitySeeds: {
                    alice: {
                        roleKey: 'alice',
                        displayName: 'Alice',
                        aliases: ['A'],
                        identity: ['调查员'],
                        catchphrases: ['保持冷静'],
                        relationshipAnchors: ['信任 Bob'],
                        sourceTrace: [],
                    },
                    bob: {
                        roleKey: 'bob',
                        displayName: 'Bob',
                        aliases: ['B'],
                        identity: ['护卫'],
                        catchphrases: ['交给我'],
                        relationshipAnchors: ['保护 Alice'],
                        sourceTrace: [],
                    },
                },
                goals: ['调查真相'],
                taboo: [],
                worldRules: [],
                userPersonaHints: [],
                sourceRefs: [],
                updatedAt: Date.now(),
            },
            {
                ...DEFAULT_CHAT_PROFILE,
                stylePreference: 'story',
                extractStrategy: 'facts_relations_world',
            },
            {
                ...DEFAULT_GROUP_MEMORY,
                lanes: [
                    {
                        laneId: 'lane-alice',
                        actorKey: 'alice',
                        displayName: 'Alice',
                        focusWeight: 0.82,
                        memoryWeight: 0.78,
                        lastTone: 'calm',
                        lastStyle: 'narrative',
                        relationshipDelta: '更依赖 Bob',
                        updatedAt: Date.now(),
                    },
                    {
                        laneId: 'lane-bob',
                        actorKey: 'bob',
                        displayName: 'Bob',
                        focusWeight: 0.74,
                        memoryWeight: 0.69,
                        lastTone: 'warm',
                        lastStyle: 'dialogue',
                        relationshipDelta: '更保护 Alice',
                        updatedAt: Date.now(),
                    },
                ],
            },
        );

        expect(Object.keys(profiles)).toEqual(expect.arrayContaining(['alice', 'bob']));
        expect(profiles.alice?.profileVersion).toBe('persona.v2');
        expect(profiles.bob?.profileVersion).toBe('persona.v2');
        expect(profiles.alice?.derivedFrom.some((item: string): boolean => item.includes('identity_seed'))).toBe(true);
        expect(profiles.bob?.derivedFrom.some((item: string): boolean => item.includes('identity_seed'))).toBe(true);
    });

    it('重算画像时会把 assistant 前缀角色归并到同一 actorKey', (): void => {
        const profiles = inferPersonaMemoryProfiles(
            {
                version: 'seed.v2',
                settingSummary: '艾莉卡是主角。',
                identitySeed: {
                    roleKey: '艾莉卡·暮影',
                    displayName: '艾莉卡·暮影',
                    aliases: [],
                    identity: ['法师'],
                    catchphrases: [],
                    relationshipAnchors: [],
                    sourceTrace: [],
                },
                identitySeeds: {
                    'assistant:艾莉卡·暮影': {
                        roleKey: 'assistant:艾莉卡·暮影',
                        displayName: '艾莉卡·暮影',
                        aliases: [],
                        identity: ['法师'],
                        catchphrases: [],
                        relationshipAnchors: [],
                        sourceTrace: [],
                    },
                },
                goals: [],
                taboo: [],
                worldRules: [],
                userPersonaHints: [],
                sourceRefs: [],
                updatedAt: Date.now(),
            },
            {
                ...DEFAULT_CHAT_PROFILE,
                stylePreference: 'story',
            },
            {
                ...DEFAULT_GROUP_MEMORY,
                lanes: [
                    {
                        laneId: 'lane-erika',
                        actorKey: 'assistant:艾莉卡·暮影',
                        displayName: '艾莉卡·暮影',
                        focusWeight: 0.8,
                        memoryWeight: 0.8,
                        updatedAt: Date.now(),
                    },
                ],
            },
        );

        expect(Object.keys(profiles)).toEqual(['艾莉卡·暮影']);
    });

    it('会根据候选内容决定编码层级和是否接受', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'medium',
                stylePreference: 'story',
                extractStrategy: 'facts_relations',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const relationCandidate = buildScoredMemoryCandidate(
            {
                candidateId: 'candidate_relation',
                kind: 'relationship',
                source: 'test',
                summary: '角色明确表示非常信任用户，并愿意继续依赖用户做决定',
                payload: {
                    confidence: 0.88,
                    text: '非常信任用户，并愿意继续依赖用户做决定',
                },
                extractedAt: Date.now(),
            },
            persona,
        );
        const weakWorkingCandidate = buildScoredMemoryCandidate(
            {
                candidateId: 'candidate_noise',
                kind: 'state',
                source: 'test',
                summary: '嗯，好，收到',
                payload: {
                    confidence: 0.2,
                    text: '嗯，好，收到',
                },
                extractedAt: Date.now(),
            },
            persona,
        );

        expect(relationCandidate.encoding.accepted).toBe(true);
        expect(relationCandidate.encoding.targetLayer === 'semantic' || relationCandidate.encoding.targetLayer === 'core_identity').toBe(true);
        expect(weakWorkingCandidate.encoding.totalScore).toBeLessThan(relationCandidate.encoding.totalScore);
    });

    it('会把生命周期从清晰推向模糊和扭曲', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'low',
                stylePreference: 'story',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const freshLifecycle = buildLifecycleState(
            'fact:fresh',
            'fact',
            0.8,
            0.82,
            persona,
            Date.now(),
            2,
            Date.now(),
            'joy',
            'companion',
        );
        const oldLifecycle = buildLifecycleState(
            'fact:old',
            'fact',
            0.42,
            0.35,
            persona,
            Date.now() - 1000 * 60 * 60 * 24 * 40,
            0,
            0,
            '',
            '',
        );

        expect(freshLifecycle.stage).toBe('clear');
        expect(oldLifecycle.stage === 'blur' || oldLifecycle.stage === 'distorted').toBe(true);
        expect(oldLifecycle.distortionRisk).toBeGreaterThan(freshLifecycle.distortionRisk);
    });

    it('会让关系和情绪命中提升召回分数', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                stylePreference: 'story',
                extractStrategy: 'facts_relations',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const lifecycle = buildLifecycleState(
            'summary:bond',
            'summary',
            0.72,
            0.74,
            persona,
            Date.now(),
            1,
            Date.now(),
            'attachment',
            'trust',
        );
        const matched = scoreRecallCandidate({
            text: '她仍然信任用户，并且因为昨天的争执而情绪波动明显',
            keywords: ['信任', '争执'],
            confidence: 0.82,
            recencyScore: 0.9,
            lifecycle,
            profile: persona,
            relationshipWeight: 0.8,
            emotionWeight: 1,
            continuityWeight: 0.9,
            privacyPenalty: 0,
            conflictPenalty: 0,
        });
        const plain = scoreRecallCandidate({
            text: '天气不错，大家继续前进',
            keywords: ['信任', '争执'],
            confidence: 0.42,
            recencyScore: 0.5,
            lifecycle: null,
            profile: persona,
            relationshipWeight: 0,
            emotionWeight: 0,
            continuityWeight: 0.1,
            privacyPenalty: 0,
            conflictPenalty: 0,
        });

        expect(matched.score).toBeGreaterThan(plain.score);
        expect(buildSimpleMemoryPersona(persona).relationshipFocus === 'medium' || buildSimpleMemoryPersona(persona).relationshipFocus === 'high').toBe(true);
    });

    it('会根据调参画像收紧或放宽候选阈值', (): void => {
        const strictThreshold = applyCandidateThresholdBias(0.5, {
            ...DEFAULT_MEMORY_TUNING_PROFILE,
            candidateAcceptThresholdBias: 0.12,
        });
        const relaxedThreshold = applyCandidateThresholdBias(0.5, {
            ...DEFAULT_MEMORY_TUNING_PROFILE,
            candidateAcceptThresholdBias: -0.12,
        });

        expect(strictThreshold).toBeGreaterThan(0.5);
        expect(relaxedThreshold).toBeLessThan(0.5);
    });

    it('会在调参后放大关系召回并抑制扭曲记忆', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'low',
                stylePreference: 'story',
                extractStrategy: 'facts_relations',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const distortedLifecycle = buildLifecycleState(
            'summary:old',
            'summary',
            0.2,
            0.22,
            {
                ...persona,
                allowDistortion: true,
                distortionTendency: 0.8,
            },
            Date.now() - 1000 * 60 * 60 * 24 * 90,
            0,
            0,
            'attachment',
            'trust',
        );
        const softProtected = scoreRecallCandidate({
            text: '她仍然很信任用户，也因为旧冲突有一点迟疑。',
            keywords: ['信任', '冲突'],
            confidence: 0.72,
            recencyScore: 0.6,
            lifecycle: distortedLifecycle,
            profile: persona,
            relationshipWeight: 0.9,
            emotionWeight: 1,
            continuityWeight: 0.8,
            privacyPenalty: 0,
            conflictPenalty: 0.2,
            tuning: {
                ...DEFAULT_MEMORY_TUNING_PROFILE,
                recallRelationshipBias: 1,
                distortionProtectionBias: 0.3,
            },
        });
        const strictProtected = scoreRecallCandidate({
            text: '她仍然很信任用户，也因为旧冲突有一点迟疑。',
            keywords: ['信任', '冲突'],
            confidence: 0.72,
            recencyScore: 0.6,
            lifecycle: distortedLifecycle,
            profile: persona,
            relationshipWeight: 0.9,
            emotionWeight: 1,
            continuityWeight: 0.8,
            privacyPenalty: 0,
            conflictPenalty: 0.2,
            tuning: {
                ...DEFAULT_MEMORY_TUNING_PROFILE,
                recallRelationshipBias: 1,
                distortionProtectionBias: 1,
            },
        });

        expect(softProtected.score).toBeGreaterThan(strictProtected.score);
        expect(resolveInjectedMemoryTone(distortedLifecycle, { ...persona, allowDistortion: true })).toBe('possible_misremember');
        expect(resolveInjectedMemoryTone(distortedLifecycle, { ...persona, allowDistortion: false })).not.toBe('possible_misremember');
    });

    it('会为同一条记录生成按角色区分的遗忘指标', (): void => {
        const ownerProfile = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'high',
                stylePreference: 'story',
                extractStrategy: 'facts_relations_world',
            },
            DEFAULT_GROUP_MEMORY,
            'alice',
        );
        const observerProfile = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'low',
                stylePreference: 'qa',
                extractStrategy: 'facts_only',
            },
            DEFAULT_GROUP_MEMORY,
            'bob',
        );
        const lifecycle = buildLifecycleState(
            'fact:goal',
            'fact',
            0.48,
            0.44,
            ownerProfile,
            Date.now() - 1000 * 60 * 60 * 24 * 48,
            0,
            0,
            'attachment',
            'trust',
        );
        lifecycle.ownerActorKey = 'alice';
        lifecycle.memoryType = 'relationship';
        lifecycle.memorySubtype = 'goal';
        lifecycle.sourceScope = 'self';
        lifecycle.importance = 0.52;

        const perActor = buildPerActorRetentionMap(
            lifecycle,
            {
                recordKey: 'fact:goal',
                recordKind: 'fact',
                text: 'Alice 仍然记得自己要保护 Bob 的目标。',
                fallbackOwnerActorKey: 'alice',
                current: lifecycle,
            },
            {
                alice: ownerProfile,
                bob: observerProfile,
            },
        );

        expect(perActor.alice).toBeDefined();
        expect(perActor.bob).toBeDefined();
        expect(perActor.alice.forgetProbability).toBeLessThan(perActor.bob.forgetProbability);
        expect(perActor.alice.retentionBias).toBeLessThan(perActor.bob.retentionBias);
    });

    it('会在角色侧对已遗忘或高遗忘风险记忆进行召回抑制', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'medium',
                stylePreference: 'story',
            },
            DEFAULT_GROUP_MEMORY,
        );
        const lifecycle = buildLifecycleState(
            'summary:forgotten',
            'summary',
            0.74,
            0.68,
            persona,
            Date.now() - 1000 * 60 * 60 * 24 * 90,
            0,
            0,
            'fear',
            'conflict',
        );
        lifecycle.forgotten = true;
        lifecycle.forgetProbability = 0.93;

        const forgottenScore = scoreRecallCandidate({
            text: '她依稀记得那场背叛。',
            keywords: ['背叛'],
            confidence: 0.9,
            recencyScore: 0.9,
            lifecycle,
            profile: persona,
            relationshipWeight: 0.8,
            emotionWeight: 1,
            continuityWeight: 0.8,
            privacyPenalty: 0,
            conflictPenalty: 0,
        });

        expect(forgottenScore.score).toBeLessThanOrEqual(0.05);
        expect(forgottenScore.reasonCodes).toContain('forgotten_memory_marked');
        expect(forgottenScore.tone).toBe('possible_misremember');
    });

    it('会限制 importance 对遗忘率的抵消，避免变成永久记忆', (): void => {
        const persona = inferPersonaMemoryProfile(
            null,
            {
                ...DEFAULT_CHAT_PROFILE,
                memoryStrength: 'high',
                stylePreference: 'story',
            },
            DEFAULT_GROUP_MEMORY,
            'alice',
        );
        const lifecycle = buildLifecycleState(
            'fact:rumor',
            'fact',
            0.52,
            0.48,
            persona,
            Date.now() - 1000 * 60 * 60 * 24 * 30,
            0,
            0,
            '',
            '',
        );
        lifecycle.ownerActorKey = 'alice';
        lifecycle.memoryType = 'event';
        lifecycle.memorySubtype = 'rumor';
        lifecycle.sourceScope = 'group';
        lifecycle.importance = 1;

        const actorState = computeActorRetentionState(
            lifecycle,
            {
                recordKey: 'fact:rumor',
                recordKind: 'fact',
                text: '这是一个容易失真的流言。',
                fallbackOwnerActorKey: 'alice',
                current: lifecycle,
            },
            'alice',
            persona,
        );

        expect(actorState.forgetProbability).toBeGreaterThan(0);
    });
});
