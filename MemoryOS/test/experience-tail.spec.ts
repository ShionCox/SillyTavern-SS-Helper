import { describe, expect, it } from 'vitest';
import { DEFAULT_MEMORY_TUNING_PROFILE } from '../src/types';
import { normalizeMemoryTuningProfile } from '../src/core/memory-tuning';
import { buildLatestRecallExplanation, pickRecentRejectedCandidates } from '../src/core/recall-explanation';
import { normalizeMemoryMigrationStatus, shouldRunAutomaticMemoryMigration } from '../src/core/memory-migration';
import { buildGroupRelationshipSeeds } from '../src/core/relationship-graph';

describe('experience-tail', (): void => {
    it('会把命中、冲突压制和编码拦下分到不同解释分组', (): void => {
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
            ],
            candidates: [
                {
                    candidateId: 'candidate-rejected',
                    kind: 'relationship',
                    source: 'extract',
                    summary: '她还有一点迟疑，不愿完全放下戒备。',
                    payload: {},
                    extractedAt: now,
                    conflictWith: [],
                    encoding: {
                        totalScore: 0.32,
                        accepted: false,
                        targetLayer: 'working',
                        salience: 0.3,
                        strength: 0.25,
                        decayStage: 'blur',
                        emotionTag: 'hesitation',
                        relationScope: 'user',
                        reasonCodes: ['threshold_blocked'],
                        profileVersion: 'persona.v1',
                    },
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
            },
        });

        expect(explanation.selected.items).toHaveLength(1);
        expect(explanation.selected.items[0]?.stage).toBe('clear');
        expect(explanation.conflictSuppressed.items).toHaveLength(1);
        expect(explanation.conflictSuppressed.items[0]?.stage).toBe('distorted');
        expect(explanation.rejectedCandidates.items).toHaveLength(1);
        expect(explanation.rejectedCandidates.items[0]?.layer).toBe('working');
    });

    it('会只保留最近一批被编码拦下的候选', (): void => {
        const now: number = Date.now();
        const rejected = pickRecentRejectedCandidates([
            {
                candidateId: 'old-rejected',
                kind: 'fact',
                source: 'extract',
                summary: '很早之前的落选候选',
                payload: {},
                extractedAt: now - 10 * 60 * 1000,
                conflictWith: [],
                encoding: {
                    totalScore: 0.21,
                    accepted: false,
                    targetLayer: 'working',
                    salience: 0.2,
                    strength: 0.2,
                    decayStage: 'clear',
                    emotionTag: '',
                    relationScope: '',
                    reasonCodes: ['threshold_blocked'],
                    profileVersion: 'persona.v1',
                },
            },
            {
                candidateId: 'fresh-rejected',
                kind: 'fact',
                source: 'extract',
                summary: '最新一批落选候选',
                payload: {},
                extractedAt: now,
                conflictWith: [],
                encoding: {
                    totalScore: 0.24,
                    accepted: false,
                    targetLayer: 'working',
                    salience: 0.24,
                    strength: 0.22,
                    decayStage: 'blur',
                    emotionTag: '',
                    relationScope: '',
                    reasonCodes: ['threshold_blocked'],
                    profileVersion: 'persona.v1',
                },
            },
        ]);

        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.candidateId).toBe('fresh-rejected');
    });

    it('会裁剪调参画像并支持默认值恢复', (): void => {
        const normalized = normalizeMemoryTuningProfile({
            candidateAcceptThresholdBias: 2,
            recallRelationshipBias: 3,
            recallEmotionBias: -1,
            recallRecencyBias: 0.66,
            recallContinuityBias: 9,
            distortionProtectionBias: -2,
            candidateRetentionLimit: 999,
            recallRetentionLimit: 1,
        });
        const restored = normalizeMemoryTuningProfile(DEFAULT_MEMORY_TUNING_PROFILE);

        expect(normalized.candidateAcceptThresholdBias).toBe(0.2);
        expect(normalized.recallRelationshipBias).toBe(1);
        expect(normalized.recallEmotionBias).toBe(0);
        expect(normalized.recallContinuityBias).toBe(1);
        expect(normalized.distortionProtectionBias).toBe(0);
        expect(normalized.candidateRetentionLimit).toBe(240);
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
            candidates: [],
        });

        expect(explanation.query).toBe('当前场景');
        expect(explanation.sectionsUsed).toEqual(['EVENTS', 'SUMMARY']);
        expect(explanation.reasonCodes).toContain('intent:story_continue');
        expect(explanation.selected.items).toHaveLength(0);
        expect(explanation.conflictSuppressed.items).toHaveLength(0);
        expect(explanation.rejectedCandidates.items).toHaveLength(0);
    });

    it('会归一化迁移状态并在条件满足时切到结构化主读', (): void => {
        const status = normalizeMemoryMigrationStatus({
            lifecycleBackfilled: true,
            candidateMirrorReady: true,
            recallMirrorReady: true,
            relationshipMirrorReady: true,
            autoBackfillBatchSize: 999,
            lastBatchStats: {
                lifecycleFacts: 4,
                lifecycleSummaries: 2,
                candidateRows: 1,
                recallRows: 3,
                relationshipRows: 5,
                updatedAt: 456,
            },
            pendingBackfillReasons: [],
        });

        expect(status.stage).toBe('db_preferred');
        expect(status.autoBackfillBatchSize).toBe(120);
        expect(status.lastBatchStats.relationshipRows).toBe(5);
        expect(shouldRunAutomaticMemoryMigration(status, status.lastAutoBackfillAt + 1000, false)).toBe(false);
        expect(shouldRunAutomaticMemoryMigration(status, status.lastAutoBackfillAt + 1000 * 60 * 11, false)).toBe(true);
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
