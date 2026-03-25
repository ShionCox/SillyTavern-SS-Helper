import { describe, expect, it } from 'vitest';

import { buildLatestRecallExplanation } from '../src/core/recall-explanation';
import { planRecall } from '../src/recall/recall-planner';
import { cutRecallCandidatesByBudget, rankRecallCandidates } from '../src/recall/recall-ranker';
import { computeExactEntityMatchScore, extractEntityFocusTerms } from '../src/recall/sources/shared';
import {
    DEFAULT_ADAPTIVE_POLICY,
    type GroupMemoryState,
    type InjectionIntent,
    type InjectionSectionName,
    type LogicalChatView,
    type LorebookGateDecision,
    type PersonaMemoryProfile,
    type RecallCandidate,
    type RecallCandidateRecordKind,
    type RecallCandidateSource,
    type RecallPlan,
    type RecallLogEntry,
} from '../src/types';

function createLorebookDecision(overrides?: Partial<LorebookGateDecision>): LorebookGateDecision {
    return {
        mode: 'soft_inject',
        score: 0.72,
        reasonCodes: [],
        matchedEntries: [],
        conflictDetected: false,
        shouldExtractWorldFacts: true,
        shouldWriteback: true,
        generatedAt: 1000,
        ...overrides,
    };
}

function createPlan(
    intent: InjectionIntent,
    maxTokens: number = 180,
    activeActorKey: string | null = null,
    logicalView: LogicalChatView | null = null,
    groupMemory: GroupMemoryState | null = null,
    personaProfiles: Record<string, PersonaMemoryProfile> = {},
): RecallPlan {
    return planRecall({
        intent,
        sections: ['WORLD_STATE', 'FACTS', 'EVENTS', 'SUMMARY', 'RELATIONSHIPS', 'LAST_SCENE'],
        sectionBudgets: {
            WORLD_STATE: 60,
            FACTS: 60,
            EVENTS: 50,
            SUMMARY: 50,
            RELATIONSHIPS: 50,
            LAST_SCENE: 50,
        },
        maxTokens,
        policy: DEFAULT_ADAPTIVE_POLICY,
        lorebookDecision: createLorebookDecision(),
        activeActorKey,
        logicalView,
        groupMemory,
        personaProfiles,
    });
}

function createCandidate(input: {
    candidateId: string;
    recordKey: string;
    recordKind: RecallCandidateRecordKind;
    source: RecallCandidateSource;
    sectionHint: InjectionSectionName;
    title: string;
    rawText: string;
    keywordScore?: number;
    vectorScore?: number;
    recencyScore?: number;
    continuityScore?: number;
    relationshipScore?: number;
    emotionScore?: number;
    finalScore?: number;
    tone?: RecallCandidate['tone'];
    visibilityPool?: RecallCandidate['visibilityPool'];
    privacyClass?: RecallCandidate['privacyClass'];
    viewpointReason?: RecallCandidate['viewpointReason'];
    actorFocusTier?: RecallCandidate['actorFocusTier'];
    actorVisibilityScore?: number;
    actorForgetProbability?: number;
    actorForgotten?: boolean;
    actorRetentionBias?: number;
    reasonCodes?: string[];
    memoryCardId?: string;
}): RecallCandidate {
    return {
        candidateId: input.candidateId,
        recordKey: input.recordKey,
        recordKind: input.recordKind,
        source: input.source,
        sectionHint: input.sectionHint,
        title: input.title,
        rawText: input.rawText,
        renderedLine: `- ${input.rawText}`,
        confidence: 0.82,
        updatedAt: 1000,
        keywordScore: input.keywordScore ?? 0.2,
        vectorScore: input.vectorScore ?? 0,
        recencyScore: input.recencyScore ?? 0.3,
        continuityScore: input.continuityScore ?? 0.2,
        relationshipScore: input.relationshipScore ?? 0,
        emotionScore: input.emotionScore ?? 0,
        conflictPenalty: 0,
        privacyPenalty: 0,
        visibilityPool: input.visibilityPool ?? 'global',
        privacyClass: input.privacyClass ?? 'shared',
        viewpointReason: input.viewpointReason ?? (input.visibilityPool === 'blocked' ? 'foreign_private_suppressed' : 'shared'),
        actorFocusTier: input.actorFocusTier ?? (input.visibilityPool === 'blocked' ? 'blocked' : input.visibilityPool === 'actor' ? 'primary' : 'shared'),
        actorVisibilityScore: input.actorVisibilityScore ?? 0.7,
        actorForgetProbability: input.actorForgetProbability,
        actorForgotten: input.actorForgotten,
        actorRetentionBias: input.actorRetentionBias,
        memoryCardId: input.memoryCardId ?? null,
        finalScore: input.finalScore ?? 0.45,
        tone: input.tone ?? 'stable_fact',
        selected: false,
        reasonCodes: input.reasonCodes ?? [],
    };
}

function runSelection(
    candidates: RecallCandidate[],
    plan: RecallPlan,
    options?: {
        recentVisibleMessages?: string[];
        worldStateText?: string;
        lorebookConflictDetected?: boolean;
        estimateTokens?: (text: string) => number;
    },
): RecallCandidate[] {
    const ranked = rankRecallCandidates({
        candidates,
        plan,
        recentVisibleMessages: options?.recentVisibleMessages,
        worldStateText: options?.worldStateText,
        lorebookConflictDetected: options?.lorebookConflictDetected,
    });
    return cutRecallCandidatesByBudget({
        candidates: ranked,
        plan,
        estimateTokens: options?.estimateTokens ?? ((text: string): number => Math.max(6, Math.ceil(text.length / 8))),
    });
}

describe('phase3 recall mainline', (): void => {
    it('roleplay uses actor bounded viewpoint and falls back when actor is missing', (): void => {
        const actorPlan = createPlan('roleplay', 180, 'hero');
        expect(actorPlan.viewpoint.mode).toBe('actor_bounded');
        expect(actorPlan.viewpoint.activeActorKey).toBe('hero');
        expect(actorPlan.viewpoint.allowForeignPrivateMemory).toBe(false);

        const fallbackPlan = createPlan('roleplay');
        expect(fallbackPlan.viewpoint.mode).toBe('omniscient_director');
        expect(fallbackPlan.viewpoint.activeActorKey).toBeNull();
    });

    it('能从名词问句里提取实体词并识别标题精确命中', (): void => {
        const entityTerms = extractEntityFocusTerms('乾清宫的设定是什么');
        const entityScore = computeExactEntityMatchScore(
            '乾清宫的设定是什么',
            '乾清宫 · 概览',
            '乾清宫在当前设定中的关键信息是：内廷正殿，女帝寝宫。',
        );

        expect(entityTerms).toContain('乾清宫');
        expect(entityScore.score).toBeGreaterThan(0);
        expect(entityScore.reasonCodes).toContain('entity_title_exact_match');
    });

    it('roleplay can infer the current speaker as the primary actor', (): void => {
        const plan = createPlan(
            'roleplay',
            180,
            null,
            {
                chatKey: 'chat',
                visibleMessages: [
                    {
                        nodeId: '1',
                        messageId: 'm1',
                        role: 'assistant',
                        text: 'Alice: 我们先去城门。',
                        textSignature: 'sig1',
                        isVisible: true,
                        lifecycle: 'active',
                        createdAt: 1000,
                        updatedAt: 1000,
                    },
                ],
                visibleUserTurns: [],
                visibleAssistantTurns: [],
                supersededCandidates: [],
                editedRevisions: [],
                deletedTurns: [],
                branchRoots: [],
                viewHash: 'view',
                snapshotHash: 'snap',
                mutationKinds: [],
                activeMessageIds: [],
                invalidatedMessageIds: [],
                rebuiltAt: 1000,
            },
            {
                lanes: [
                    {
                        laneId: 'lane-alice',
                        actorKey: 'alice',
                        displayName: 'Alice',
                        identityHint: 'name_anchor',
                        lastStyle: 'calm',
                        lastEmotion: 'neutral',
                        recentGoal: '',
                        relationshipDelta: '',
                        lastActiveAt: 1000,
                        recentMessageIds: [],
                    },
                ],
                sharedScene: {
                    currentScene: '',
                    currentConflict: '',
                    groupConsensus: [],
                    pendingEvents: [],
                    participantActorKeys: [],
                    updatedAt: 1000,
                },
                actorSalience: [],
                bindingSnapshot: {
                    groupId: 'group',
                    characterIds: [],
                    memberNames: [],
                    updatedAt: 1000,
                },
                updatedAt: 1000,
            },
        );

        expect(plan.viewpoint.mode).toBe('actor_bounded');
        expect(plan.viewpoint.activeActorKey).toBe('alice');
        expect(plan.viewpoint.focus.reasonCodes).toContain('focus:current_speaker');
    });

    it('实体词精确命中的候选会优先排在同类泛化候选前面', (): void => {
        const plan = createPlan('setting_qa', 180);
        const selected = runSelection([
            createCandidate({
                candidateId: 'rule-generic',
                memoryCardId: 'rule-generic',
                recordKey: 'rule-generic',
                recordKind: 'state',
                source: 'memory_card',
                sectionHint: 'SUMMARY',
                title: '世界规则',
                rawText: '该设定中的硬规则是：皇宫分外朝与内廷；外朝听政，内廷为后宫居所。',
                keywordScore: 0.1,
                vectorScore: 0.92,
                continuityScore: 0.72,
                finalScore: 0.64,
                reasonCodes: ['memory_card_hit'],
            }),
            createCandidate({
                candidateId: 'rule-target',
                memoryCardId: 'rule-target',
                recordKey: 'rule-target',
                recordKind: 'state',
                source: 'memory_card',
                sectionHint: 'SUMMARY',
                title: '乾清宫 · 概览',
                rawText: '乾清宫在当前设定中的关键信息是：内廷正殿，女帝寝宫。',
                keywordScore: 0.16,
                vectorScore: 0.88,
                continuityScore: 0.84,
                finalScore: 0.68,
                reasonCodes: ['memory_card_hit', 'entity_title_exact_match', 'entity_exact_match'],
            }),
        ], plan);

        expect(selected[0]?.candidateId).toBe('rule-target');
    });

    it('roleplay uses actor salience to pick primary and secondary actors', (): void => {
        const plan = createPlan(
            'roleplay',
            180,
            null,
            null,
            {
                lanes: [
                    {
                        laneId: 'lane-alice',
                        actorKey: 'alice',
                        displayName: 'Alice',
                        identityHint: 'name_anchor',
                        lastStyle: 'calm',
                        lastEmotion: 'neutral',
                        recentGoal: '',
                        relationshipDelta: '',
                        lastActiveAt: 1000,
                        recentMessageIds: [],
                    },
                    {
                        laneId: 'lane-bob',
                        actorKey: 'bob',
                        displayName: 'Bob',
                        identityHint: 'name_anchor',
                        lastStyle: 'warm',
                        lastEmotion: 'neutral',
                        recentGoal: '',
                        relationshipDelta: '',
                        lastActiveAt: 1000,
                        recentMessageIds: [],
                    },
                    {
                        laneId: 'lane-carol',
                        actorKey: 'carol',
                        displayName: 'Carol',
                        identityHint: 'name_anchor',
                        lastStyle: 'sharp',
                        lastEmotion: 'neutral',
                        recentGoal: '',
                        relationshipDelta: '',
                        lastActiveAt: 1000,
                        recentMessageIds: [],
                    },
                ],
                sharedScene: {
                    currentScene: '',
                    currentConflict: '',
                    groupConsensus: [],
                    pendingEvents: [],
                    participantActorKeys: [],
                    updatedAt: 1000,
                },
                actorSalience: [
                    {
                        actorKey: 'bob',
                        score: 0.92,
                        reasonCodes: ['recent_messages'],
                        updatedAt: 1000,
                    },
                    {
                        actorKey: 'carol',
                        score: 0.84,
                        reasonCodes: ['mentioned_recently'],
                        updatedAt: 1000,
                    },
                ],
                bindingSnapshot: {
                    groupId: 'group',
                    characterIds: [],
                    memberNames: [],
                    updatedAt: 1000,
                },
                updatedAt: 1000,
            },
        );

        expect(plan.viewpoint.activeActorKey).toBe('bob');
        expect(plan.viewpoint.focus.secondaryActorKeys).toEqual(['carol']);
        expect(plan.viewpoint.focus.budgetShare).toEqual({
            global: 0.4,
            primaryActor: 0.45,
            secondaryActors: 0.15,
        });
        expect(plan.viewpoint.focus.reasonCodes).toContain('focus:salience_top1');
    });

    it('director mode keeps only global candidates visible', (): void => {
        const plan = createPlan('setting_qa', 180, 'hero');
        const ranked = rankRecallCandidates({
            candidates: [
                createCandidate({
                    candidateId: 'actor-private',
                    recordKey: 'summary:actor-private',
                    recordKind: 'summary',
                    source: 'summaries',
                    sectionHint: 'SUMMARY',
                    title: 'actor private summary',
                    rawText: 'private content',
                    visibilityPool: 'actor',
                    privacyClass: 'private',
                    viewpointReason: 'owned_by_actor',
                    actorVisibilityScore: 1,
                    finalScore: 0.92,
                }),
                createCandidate({
                    candidateId: 'global-public',
                    recordKey: 'state:global-public',
                    recordKind: 'state',
                    source: 'state',
                    sectionHint: 'WORLD_STATE',
                    title: 'global state',
                    rawText: 'public world info',
                    visibilityPool: 'global',
                    privacyClass: 'shared',
                    viewpointReason: 'shared',
                    actorVisibilityScore: 0.7,
                    finalScore: 0.88,
                }),
            ],
            plan,
        });

        expect(ranked.map((item) => item.recordKey)).toEqual(['state:global-public']);
    });

    it('blocked candidates stay in the tail and are not budget dropped', (): void => {
        const plan = createPlan('roleplay', 180, 'hero');
        const selected = runSelection([
            createCandidate({
                candidateId: 'foreign-private',
                recordKey: 'relationship:foreign-private',
                recordKind: 'relationship',
                source: 'relationships',
                sectionHint: 'RELATIONSHIPS',
                title: 'foreign private relationship',
                rawText: 'this belongs to another actor',
                visibilityPool: 'blocked',
                privacyClass: 'private',
                viewpointReason: 'foreign_private_suppressed',
                finalScore: 0.91,
                reasonCodes: ['viewpoint:foreign_private_suppressed', 'blocked:foreign_private'],
            }),
            createCandidate({
                candidateId: 'shared-scene',
                recordKey: 'state:shared-scene',
                recordKind: 'state',
                source: 'state',
                sectionHint: 'WORLD_STATE',
                title: 'shared scene',
                rawText: 'public scene info',
                visibilityPool: 'global',
                privacyClass: 'shared',
                viewpointReason: 'shared',
                finalScore: 0.88,
            }),
        ], plan);

        const blocked = selected.find((item) => item.recordKey === 'relationship:foreign-private');
        expect(blocked?.selected).toBe(false);
        expect(blocked?.visibilityPool).toBe('blocked');
        expect(blocked?.reasonCodes).toContain('foreign_private_memory_suppressed');
        expect(blocked?.reasonCodes).not.toContain('budget_dropped');
    });

    it('visible duplicate entries are still suppressed', (): void => {
        const plan = createPlan('story_continue');
        const selected = runSelection([
            createCandidate({
                candidateId: 'visible-dup',
                recordKey: 'fact:duplicate',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: 'duplicate fact',
                rawText: 'we already said this tonight',
                keywordScore: 0.88,
                finalScore: 0.79,
            }),
            createCandidate({
                candidateId: 'scene',
                recordKey: 'event:scene',
                recordKind: 'event',
                source: 'events',
                sectionHint: 'LAST_SCENE',
                title: 'recent scene',
                rawText: 'they are still in the tavern',
                keywordScore: 0.42,
                recencyScore: 0.92,
                finalScore: 0.74,
            }),
        ], plan, {
            recentVisibleMessages: ['we already said this tonight'],
        });

        const suppressed = selected.find((item) => item.recordKey === 'fact:duplicate');
        expect(suppressed?.selected).toBe(false);
        expect(suppressed?.reasonCodes).toContain('visible_duplicate_suppressed');
    });

    it('blocked explanation items keep the viewpoint reason codes', (): void => {
        const recallEntries: RecallLogEntry[] = [
            {
                recallId: 'selected:1',
                query: 'old harbor',
                section: 'FACTS',
                recordKey: 'fact:port',
                recordKind: 'fact',
                recordTitle: 'old harbor contract',
                score: 0.91,
                selected: true,
                conflictSuppressed: false,
                tone: 'stable_fact',
                reasonCodes: ['selected'],
                loggedAt: 1000,
            },
            {
                recallId: 'blocked:1',
                query: 'old harbor',
                section: 'RELATIONSHIPS',
                recordKey: 'relationship:foreign-private',
                recordKind: 'relationship',
                recordTitle: 'foreign private relationship',
                score: 0.39,
                selected: false,
                conflictSuppressed: false,
                tone: 'stable_fact',
                reasonCodes: ['viewpoint:foreign_private_suppressed', 'foreign_private_memory_suppressed'],
                loggedAt: 1000,
            },
        ];

        const explanation = buildLatestRecallExplanation({
            generatedAt: 1000,
            query: 'old harbor',
            sectionsUsed: ['FACTS', 'RELATIONSHIPS'],
            reasonCodes: ['intent:story_continue'],
            recallEntries,
            lifecycleIndex: {
                'fact:port': {
                    recordKey: 'fact:port',
                    recordKind: 'fact',
                    stage: 'clear',
                    strength: 0.8,
                    salience: 0.8,
                    rehearsalCount: 1,
                    lastRecalledAt: 1000,
                    distortionRisk: 0.1,
                    emotionTag: '',
                    relationScope: '',
                    updatedAt: 1000,
                },
                'relationship:foreign-private': {
                    recordKey: 'relationship:foreign-private',
                    recordKind: 'relationship',
                    stage: 'clear',
                    strength: 0.6,
                    salience: 0.6,
                    rehearsalCount: 0,
                    lastRecalledAt: 0,
                    distortionRisk: 0.1,
                    emotionTag: '',
                    relationScope: '',
                    updatedAt: 1000,
                },
            },
        });

        expect(explanation?.selected.items.map((item) => item.recordKey)).toEqual(['fact:port']);
        expect(explanation?.rejectedCandidates.items.map((item) => item.recordKey)).toEqual(['relationship:foreign-private']);
        expect(explanation?.rejectedCandidates.items[0]?.reasonCodes).toContain('viewpoint:foreign_private_suppressed');
    });

    it('memory card usage feedback can boost useful cards and suppress unhealthy cards', (): void => {
        const plan = createPlan('roleplay', 220);
        const ranked = rankRecallCandidates({
            candidates: [
                createCandidate({
                    candidateId: 'memory-card:card-good',
                    memoryCardId: 'card-good',
                    recordKey: 'fact:card-good',
                    recordKind: 'fact',
                    source: 'memory_card',
                    sectionHint: 'FACTS',
                    title: 'good card',
                    rawText: 'this card is frequently selected and still relevant',
                    keywordScore: 0.7,
                    vectorScore: 0.68,
                    finalScore: 0.62,
                }),
                createCandidate({
                    candidateId: 'memory-card:card-bad',
                    memoryCardId: 'card-bad',
                    recordKey: 'fact:card-bad',
                    recordKind: 'fact',
                    source: 'memory_card',
                    sectionHint: 'FACTS',
                    title: 'bad card',
                    rawText: 'this card has stale source and duplicate payload',
                    keywordScore: 0.72,
                    vectorScore: 0.7,
                    finalScore: 0.64,
                }),
            ],
            plan,
            memoryCardUsage: {
                'card-good': {
                    selectedHits: 12,
                    lastSelectedAt: Date.now() - 2 * 60 * 60 * 1000,
                    lastScore: 0.93,
                },
                'card-bad': {
                    selectedHits: 0,
                    lastSelectedAt: null,
                    lastScore: 0.4,
                },
            },
            memoryCardDiagnostics: {
                'card-good': {
                    sourceMissing: false,
                    needsRebuild: false,
                    duplicateCount: 1,
                },
                'card-bad': {
                    sourceMissing: true,
                    needsRebuild: true,
                    duplicateCount: 3,
                },
            },
        });
        expect(ranked[0]?.candidateId).toBe('memory-card:card-good');
        const penalized = ranked.find((item) => item.candidateId === 'memory-card:card-bad');
        expect(penalized?.reasonCodes).toContain('feedback_source_missing_penalty');
        expect(penalized?.reasonCodes).toContain('feedback_needs_rebuild_penalty');
    });
});
