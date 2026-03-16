import { describe, expect, it } from 'vitest';
import {
    applyCandidateThresholdBias,
    buildLifecycleState,
    buildScoredMemoryCandidate,
    buildSimpleMemoryPersona,
    inferPersonaMemoryProfile,
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
});
