import { describe, expect, it } from 'vitest';

import { buildLatestRecallExplanation } from '../src/core/recall-explanation';
import { planRecall } from '../src/recall/recall-planner';
import { cutRecallCandidatesByBudget, rankRecallCandidates } from '../src/recall/recall-ranker';
import {
    DEFAULT_ADAPTIVE_POLICY,
    type InjectionIntent,
    type InjectionSectionName,
    type LorebookGateDecision,
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

function createPlan(intent: InjectionIntent, maxTokens: number = 180): RecallPlan {
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
    reasonCodes?: string[];
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
        finalScore: input.finalScore ?? 0.45,
        tone: input.tone ?? 'stable_fact',
        selected: false,
        reasonCodes: input.reasonCodes ?? [],
    };
}

function runSelection(candidates: RecallCandidate[], plan: RecallPlan, options?: {
    recentVisibleMessages?: string[];
    worldStateText?: string;
    lorebookConflictDetected?: boolean;
    estimateTokens?: (text: string) => number;
}): RecallCandidate[] {
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
    it('关键词明确命中 fact 时会优先保留 fact', (): void => {
        const plan = createPlan('story_continue');
        const selected = runSelection([
            createCandidate({
                candidateId: 'fact-hit',
                recordKey: 'fact:port',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: '旧港口约定',
                rawText: '她答应在旧港口再次见面',
                keywordScore: 0.96,
                continuityScore: 0.75,
                finalScore: 0.78,
            }),
            createCandidate({
                candidateId: 'summary-low',
                recordKey: 'summary:1',
                recordKind: 'summary',
                source: 'summaries',
                sectionHint: 'SUMMARY',
                title: '普通摘要',
                rawText: '他们讨论过几次去港口。',
                keywordScore: 0.22,
                vectorScore: 0.18,
                finalScore: 0.41,
            }),
        ], plan);

        expect(selected.find((item) => item.recordKey === 'fact:port')?.selected).toBe(true);
    });

    it('关键词不强但向量命中 summary 时也能进主池', (): void => {
        const plan = createPlan('story_continue');
        const selected = runSelection([
            createCandidate({
                candidateId: 'fact-weak',
                recordKey: 'fact:weak',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: '弱关键词事实',
                rawText: '她去过很多地方。',
                keywordScore: 0.1,
                finalScore: 0.28,
            }),
            createCandidate({
                candidateId: 'summary-vector',
                recordKey: 'summary:vector',
                recordKind: 'summary',
                source: 'vector',
                sectionHint: 'SUMMARY',
                title: '向量命中摘要',
                rawText: '她曾答应下次去旧港口见面',
                keywordScore: 0.08,
                vectorScore: 0.94,
                continuityScore: 0.64,
                finalScore: 0.81,
            }),
        ], plan);

        expect(selected.find((item) => item.recordKey === 'summary:vector')?.selected).toBe(true);
    });

    it('recent message 已明确出现时旧记忆会被压制', (): void => {
        const plan = createPlan('story_continue');
        const selected = runSelection([
            createCandidate({
                candidateId: 'visible-dup',
                recordKey: 'fact:duplicate',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: '已在可见区出现',
                rawText: '她已经明确说过今晚不会去旧港口',
                keywordScore: 0.88,
                finalScore: 0.79,
            }),
            createCandidate({
                candidateId: 'scene',
                recordKey: 'event:scene',
                recordKind: 'event',
                source: 'events',
                sectionHint: 'LAST_SCENE',
                title: '最近场景',
                rawText: '当前仍在旅店房间中整理装备',
                keywordScore: 0.42,
                recencyScore: 0.92,
                finalScore: 0.74,
            }),
        ], plan, {
            recentVisibleMessages: ['她已经明确说过今晚不会去旧港口'],
        });

        const suppressed = selected.find((item) => item.recordKey === 'fact:duplicate');
        expect(suppressed?.selected).toBe(false);
        expect(suppressed?.reasonCodes).toContain('visible_duplicate_suppressed');
    });

    it('distorted 生命周期条目只能以模糊语气注入', (): void => {
        const plan = createPlan('story_continue');
        const ranked = rankRecallCandidates({
            candidates: [createCandidate({
                candidateId: 'distorted',
                recordKey: 'summary:distorted',
                recordKind: 'summary',
                source: 'summaries',
                sectionHint: 'SUMMARY',
                title: '失真摘要',
                rawText: '她确定自己从未到过王都',
                finalScore: 0.73,
                reasonCodes: ['stage:distorted'],
            })],
            plan,
        });

        expect(ranked[0]?.tone).toBe('possible_misremember');
        expect(ranked[0]?.renderedLine).toContain('也许记错了');
    });

    it('setting_qa 会优先 lorebook 与 world state', (): void => {
        const plan = createPlan('setting_qa');

        expect(plan.sourceWeights.lorebook).toBeGreaterThan(plan.sourceWeights.events);
        expect(plan.sourceWeights.state).toBeGreaterThan(plan.sourceWeights.relationships);
        expect(plan.sourceLimits.lorebook).toBeGreaterThan(plan.sourceLimits.events ?? 0);
    });

    it('roleplay 会优先 relationship 与 recent scene', (): void => {
        const plan = createPlan('roleplay');

        expect(plan.sourceWeights.relationships).toBeGreaterThan(plan.sourceWeights.lorebook);
        expect(plan.sourceWeights.events).toBeGreaterThan(plan.sourceWeights.state);
        expect(plan.sourceLimits.relationships).toBeGreaterThan(plan.sourceLimits.lorebook ?? 0);
    });

    it('预算很小时会优先保留约束型记忆', (): void => {
        const plan = createPlan('setting_qa', 55);
        const selected = runSelection([
            createCandidate({
                candidateId: 'constraint',
                recordKey: 'state:rule',
                recordKind: 'state',
                source: 'state',
                sectionHint: 'WORLD_STATE',
                title: '硬约束',
                rawText: '世界规则：任何人都不能在午夜后进入旧港口。',
                keywordScore: 0.88,
                finalScore: 0.84,
            }),
            createCandidate({
                candidateId: 'flavor',
                recordKey: 'fact:flavor',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: '背景风味',
                rawText: '港口边常年弥漫着咸湿的雾气。',
                keywordScore: 0.52,
                finalScore: 0.72,
            }),
        ], plan, {
            estimateTokens: (): number => 12,
        });

        expect(selected.find((item) => item.recordKey === 'state:rule')?.selected).toBe(true);
        expect(selected.find((item) => item.recordKey === 'fact:flavor')?.reasonCodes).toContain('budget_dropped');
    });

    it('latestRecallExplanation 会与 injected text 对齐', (): void => {
        const recallEntries: RecallLogEntry[] = [
            {
                recallId: 'selected:1',
                query: '旧港口',
                section: 'FACTS',
                recordKey: 'fact:port',
                recordKind: 'fact',
                recordTitle: '旧港口约定',
                score: 0.91,
                selected: true,
                conflictSuppressed: false,
                tone: 'stable_fact',
                reasonCodes: ['selected'],
                loggedAt: 1000,
            },
            {
                recallId: 'conflict:1',
                query: '旧港口',
                section: 'SUMMARY',
                recordKey: 'summary:conflict',
                recordKind: 'summary',
                recordTitle: '冲突摘要',
                score: 0.77,
                selected: false,
                conflictSuppressed: true,
                tone: 'stable_fact',
                reasonCodes: ['conflict_suppressed'],
                loggedAt: 1000,
            },
            {
                recallId: 'rejected:1',
                query: '旧港口',
                section: 'WORLD_STATE',
                recordKey: 'state:budget',
                recordKind: 'state',
                recordTitle: '预算淘汰状态',
                score: 0.44,
                selected: false,
                conflictSuppressed: false,
                tone: 'stable_fact',
                reasonCodes: ['budget_dropped'],
                loggedAt: 1000,
            },
        ];
        const explanation = buildLatestRecallExplanation({
            generatedAt: 1000,
            query: '旧港口',
            sectionsUsed: ['FACTS', 'SUMMARY'],
            reasonCodes: ['intent:story_continue'],
            recallEntries,
            lifecycleIndex: {
                'fact:port': { recordKey: 'fact:port', recordKind: 'fact', stage: 'clear', strength: 0.8, salience: 0.8, rehearsalCount: 1, lastRecalledAt: 1000, distortionRisk: 0.1, emotionTag: '', relationScope: '', updatedAt: 1000 },
                'summary:conflict': { recordKey: 'summary:conflict', recordKind: 'summary', stage: 'blur', strength: 0.6, salience: 0.6, rehearsalCount: 1, lastRecalledAt: 1000, distortionRisk: 0.4, emotionTag: '', relationScope: '', updatedAt: 1000 },
                'state:budget': { recordKey: 'state:budget', recordKind: 'state', stage: 'clear', strength: 0.7, salience: 0.7, rehearsalCount: 0, lastRecalledAt: 0, distortionRisk: 0.1, emotionTag: '', relationScope: '', updatedAt: 1000 },
            },
        });

        expect(explanation?.selected.items.map((item) => item.recordKey)).toEqual(['fact:port']);
        expect(explanation?.conflictSuppressed.items.map((item) => item.recordKey)).toEqual(['summary:conflict']);
        expect(explanation?.rejectedCandidates.items.map((item) => item.recordKey)).toEqual(['state:budget']);
    });
});