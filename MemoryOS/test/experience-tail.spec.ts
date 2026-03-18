import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMORY_TUNING_PROFILE } from '../src/types';
import { normalizeMemoryTuningProfile } from '../src/core/memory-tuning';
import { buildLatestRecallExplanation } from '../src/core/recall-explanation';
import { buildGroupRelationshipSeeds } from '../src/core/relationship-graph';

describe('experience-tail', (): void => {
    it('会把命中、冲突压制和未入选候选分到不同解释分组', (): void => {
        const now: number = Date.now();
        const explanation = buildLatestRecallExplanation({
            generatedAt: now,
            query: '用户还信任我吗',
            sectionsUsed: ['FACTS', 'RELATIONSHIPS'],
            reasonCodes: ['intent:roleplay', 'sections:FACTS,RELATIONSHIPS'],
            recallEntries: [
                {
                    recallId: 'selected-1',
                    query: '用户还信任我吗',
                    section: 'FACTS',
                    recordKey: 'fact:trust',
                    recordKind: 'fact',
                    recordTitle: '信任状态',
                    score: 0.83,
                    selected: true,
                    conflictSuppressed: false,
                    tone: 'clear_recall',
                    reasonCodes: ['relationship_match'],
                    loggedAt: now,
                },
                {
                    recallId: 'suppressed-1',
                    query: '用户还信任我吗',
                    section: 'RELATIONSHIPS',
                    recordKey: 'summary:conflict',
                    recordKind: 'summary',
                    recordTitle: '上次冲突',
                    score: 0.58,
                    selected: false,
                    conflictSuppressed: true,
                    tone: 'blurred_recall',
                    reasonCodes: ['conflict_penalty'],
                    loggedAt: now,
                },
                {
                    recallId: 'rejected-1',
                    query: '用户还信任我吗',
                    section: 'RELATIONSHIPS',
                    recordKey: 'relationship:hesitation',
                    recordKind: 'relationship',
                    recordTitle: '迟疑关系',
                    score: 0.32,
                    selected: false,
                    conflictSuppressed: false,
                    tone: 'blurred_recall',
                    reasonCodes: ['budget_dropped'],
                    loggedAt: now,
                },
            ],
            lifecycleIndex: {
                'fact:trust': {
                    recordKey: 'fact:trust',
                    recordKind: 'fact',
                    stage: 'clear',
                    strength: 0.82,
                    salience: 0.8,
                    rehearsalCount: 2,
                    lastRecalledAt: now,
                    distortionRisk: 0.1,
                    emotionTag: 'trust',
                    relationScope: 'user',
                    updatedAt: now,
                },
                'summary:conflict': {
                    recordKey: 'summary:conflict',
                    recordKind: 'summary',
                    stage: 'distorted',
                    strength: 0.3,
                    salience: 0.42,
                    rehearsalCount: 0,
                    lastRecalledAt: 0,
                    distortionRisk: 0.8,
                    emotionTag: 'conflict',
                    relationScope: 'user',
                    updatedAt: now,
                },
                'relationship:hesitation': {
                    recordKey: 'relationship:hesitation',
                    recordKind: 'relationship',
                    stage: 'blur',
                    strength: 0.25,
                    salience: 0.3,
                    rehearsalCount: 0,
                    lastRecalledAt: 0,
                    distortionRisk: 0.42,
                    emotionTag: 'hesitation',
                    relationScope: 'user',
                    updatedAt: now,
                },
            },
        });

        expect(explanation.selected.items).toHaveLength(1);
        expect(explanation.selected.items[0]?.stage).toBe('clear');
        expect(explanation.conflictSuppressed.items).toHaveLength(1);
        expect(explanation.conflictSuppressed.items[0]?.stage).toBe('distorted');
        expect(explanation.rejectedCandidates.items).toHaveLength(1);
        expect(explanation.rejectedCandidates.items[0]?.recordKey).toBe('relationship:hesitation');
        expect(explanation.rejectedCandidates.items[0]?.stage).toBe('blur');
    });

    it('会按 score 保留最相关的未入选候选', (): void => {
        const now: number = Date.now();
        const explanation = buildLatestRecallExplanation({
            generatedAt: now,
            query: '港口',
            sectionsUsed: ['FACTS'],
            reasonCodes: ['intent:story_continue'],
            recallEntries: Array.from({ length: 10 }, (_, index: number) => ({
                recallId: `rejected-${index}`,
                query: '港口',
                section: 'FACTS' as const,
                recordKey: `fact:${index}`,
                recordKind: 'fact' as const,
                recordTitle: `候选 ${index}`,
                score: 1 - index * 0.05,
                selected: false,
                conflictSuppressed: false,
                tone: 'stable_fact' as const,
                reasonCodes: ['budget_dropped'],
                loggedAt: now,
            })),
        });

        expect(explanation.rejectedCandidates.items).toHaveLength(8);
        expect(explanation.rejectedCandidates.items[0]?.recordKey).toBe('fact:0');
        expect(explanation.rejectedCandidates.items[7]?.recordKey).toBe('fact:7');
    });

    it('会裁剪调参画像并支持默认值恢复', (): void => {
        const normalized = normalizeMemoryTuningProfile({
            candidateAcceptThresholdBias: 2,
            recallRelationshipBias: 3,
            recallEmotionBias: -1,
            recallRecencyBias: 0.66,
            recallContinuityBias: 9,
            distortionProtectionBias: -2,
            recallRetentionLimit: 1,
        });
        const restored = normalizeMemoryTuningProfile(DEFAULT_MEMORY_TUNING_PROFILE);

        expect(normalized.candidateAcceptThresholdBias).toBe(0.2);
        expect(normalized.recallRelationshipBias).toBe(1);
        expect(normalized.recallEmotionBias).toBe(0);
        expect(normalized.recallContinuityBias).toBe(1);
        expect(normalized.distortionProtectionBias).toBe(0);
        expect(normalized.recallRetentionLimit).toBe(40);
        expect(restored.candidateAcceptThresholdBias).toBe(DEFAULT_MEMORY_TUNING_PROFILE.candidateAcceptThresholdBias);
        expect(restored.recallRetentionLimit).toBe(DEFAULT_MEMORY_TUNING_PROFILE.recallRetentionLimit);
    });

    it('会保留最近一轮解释的查询、区段和原因码', (): void => {
        const explanation = buildLatestRecallExplanation({
            generatedAt: 123,
            query: '当前场景',
            sectionsUsed: ['EVENTS', 'SUMMARY'],
            reasonCodes: ['intent:story_continue', 'sections:EVENTS,SUMMARY'],
            recallEntries: [],
        });

        expect(explanation.query).toBe('当前场景');
        expect(explanation.sectionsUsed).toEqual(['EVENTS', 'SUMMARY']);
        expect(explanation.reasonCodes).toContain('intent:story_continue');
        expect(explanation.selected.items).toHaveLength(0);
        expect(explanation.conflictSuppressed.items).toHaveLength(0);
        expect(explanation.rejectedCandidates.items).toHaveLength(0);
    });

    it('会为群聊构建主角色关系和对象对关系种子', (): void => {
        const now: number = Date.now();
        const seeds = buildGroupRelationshipSeeds('assistant:self', {
            lanes: [
                {
                    laneId: 'lane-1',
                    actorKey: 'user',
                    displayName: '用户',
                    identityHint: '',
                    lastStyle: '',
                    lastEmotion: '信任',
                    recentGoal: '和伙伴同步',
                    relationshipDelta: '非常信任',
                    lastActiveAt: now,
                    recentMessageIds: ['1', '2', '3'],
                },
                {
                    laneId: 'lane-2',
                    actorKey: 'ally',
                    displayName: '队友',
                    identityHint: '',
                    lastStyle: '',
                    lastEmotion: '紧张',
                    recentGoal: '保护用户',
                    relationshipDelta: '与用户共同对抗冲突',
                    lastActiveAt: now,
                    recentMessageIds: ['4', '5'],
                },
            ],
            sharedScene: {
                currentScene: '在研究站里加固互相信任',
                currentConflict: '用户和队友正在合作应对威胁',
                groupConsensus: ['大家决定一起推进任务'],
                pendingEvents: ['战后复盘'],
                participantActorKeys: ['assistant:self', 'user', 'ally'],
                updatedAt: now,
            },
            actorSalience: [
                { actorKey: 'user', score: 0.92, reasonCodes: ['recent_speaker'], updatedAt: now },
                { actorKey: 'ally', score: 0.74, reasonCodes: ['goal_pending'], updatedAt: now },
            ],
            bindingSnapshot: {
                groupId: 'group-1',
                characterIds: ['assistant:self', 'ally'],
                memberNames: ['用户', '队友'],
                updatedAt: now,
            },
            updatedAt: now,
        });

        expect(seeds.some((item) => item.scope === 'self_target' && item.targetKey === 'user')).toBe(true);
        expect(seeds.some((item) => item.scope === 'group_pair' && item.participantKeys.includes('user') && item.participantKeys.includes('ally'))).toBe(true);
    });
});
