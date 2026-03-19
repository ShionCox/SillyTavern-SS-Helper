import { describe, expect, it } from 'vitest';
import type { ChatStateManager } from '../src/core/chat-state-manager';
import { buildPreparedRecallContext } from '../src/injection/recall-context-builder';
import { buildLayeredMemoryContext, buildSectionText } from '../src/injection/prompt-memory-renderer';
import { buildLatestRecallExplanationSnapshot, buildRecallLogEntries, toRecallLogRecordKind } from '../src/injection/recall-log-mapper';
import type { RecallCandidate, RecallPlan } from '../src/types';
import { insertTavernPromptMessageEvent, findLastTavernPromptUserIndexEvent } from '../../SDK/tavern';

describe('注入重构模块', (): void => {
    it('可以准备稳定的召回上下文', async (): Promise<void> => {
        const chatStateManager = {
            getActiveActorKey: async (): Promise<string> => 'actor_a',
            getPersonaMemoryProfile: async (): Promise<null> => null,
            getPersonaMemoryProfiles: async (): Promise<Record<string, unknown>> => ({}),
            getMemoryTuningProfile: async (): Promise<null> => null,
            getMemoryLifecycleSummary: async (): Promise<Array<{
                recordKey: string;
                stage: 'clear' | 'blur' | 'distorted';
                strength: number;
                salience: number;
                rehearsalCount: number;
                lastRecalledAt: number;
                distortionRisk: number;
                emotionTag: string;
                relationScope: string;
                updatedAt: number;
                updatedAtVersion?: number;
            }>> => ([
                {
                    recordKey: 'r1',
                    stage: 'clear',
                    strength: 0.9,
                    salience: 0.8,
                    rehearsalCount: 3,
                    lastRecalledAt: 100,
                    distortionRisk: 0.1,
                    emotionTag: 'calm',
                    relationScope: 'self_target',
                    updatedAt: 100,
                },
            ]),
            getRelationshipState: async (): Promise<Array<{
                relationshipKey: string;
                actorKey: string;
                targetKey: string;
                scope: 'self_target' | 'group_pair';
                participantKeys: string[];
                familiarity: number;
                trust: number;
                affection: number;
                tension: number;
                dependency: number;
                respect: number;
                unresolvedConflict: number;
                sharedFragments: string[];
                summary: string;
                reasonCodes: string[];
                updatedAt: number;
            }>> => ([
                {
                    relationshipKey: 'rel1',
                    actorKey: 'actor_a',
                    targetKey: 'actor_b',
                    scope: 'self_target',
                    participantKeys: ['actor_a', 'actor_b'],
                    familiarity: 1,
                    trust: 1,
                    affection: 1,
                    tension: 0,
                    dependency: 0,
                    respect: 1,
                    unresolvedConflict: 0,
                    sharedFragments: [],
                    summary: '关系摘要',
                    reasonCodes: [],
                    updatedAt: 100,
                },
            ]),
        } as unknown as ChatStateManager;

        const context = await buildPreparedRecallContext(chatStateManager, '测试查询');
        expect(context.activeActorKey).toBe('actor_a');
        expect(context.lifecycleMap.has('r1')).toBe(true);
        expect(context.fallbackRelationshipWeight).toBeGreaterThan(0);
    });

    it('可以把分区与注入风格渲染成稳定文本', (): void => {
        const candidate: RecallCandidate = {
            candidateId: 'c1',
            recordKey: 'fact-1',
            recordKind: 'fact',
            source: 'facts',
            sectionHint: 'FACTS',
            title: '事实一',
            rawText: '角色曾经见过旧城门',
            renderedLine: '- 角色曾经见过旧城门',
            confidence: 0.8,
            updatedAt: 100,
            keywordScore: 0.8,
            vectorScore: 0,
            recencyScore: 0.7,
            continuityScore: 0.6,
            relationshipScore: 0,
            emotionScore: 0,
            conflictPenalty: 0,
            privacyPenalty: 0,
            visibilityPool: 'global',
            privacyClass: 'shared',
            viewpointReason: 'shared',
            actorFocusTier: 'shared',
            actorVisibilityScore: 0.7,
            finalScore: 0.8,
            tone: 'clear_recall',
            selected: true,
            reasonCodes: [],
        };
        const sectionText = buildSectionText('FACTS', [candidate], 120);
        expect(sectionText).toContain('【事实】');
        expect(sectionText).toContain('旧城门');
        const layeredPlan: RecallPlan = {
            intent: 'story_continue',
            sections: ['FACTS'],
            sectionBudgets: { FACTS: 120 },
            maxTokens: 240,
            sourceWeights: {
                facts: 1,
                summaries: 0.8,
                state: 0.7,
                relationships: 0.5,
                events: 1,
                vector: 0.6,
                lorebook: 0.3,
            },
            sourceLimits: {},
            sectionWeights: { FACTS: 1 },
            coarseTopK: 8,
            fineTopK: 4,
            viewpoint: {
                mode: 'actor_bounded',
                activeActorKey: 'actor_a',
                allowSharedScene: true,
                allowWorldState: true,
                allowForeignPrivateMemory: false,
                focus: {
                    primaryActorKey: 'actor_a',
                    secondaryActorKeys: [],
                    budgetShare: {
                        global: 0.5,
                        primaryActor: 0.5,
                        secondaryActors: 0,
                    },
                    reasonCodes: ['focus:explicit_active_actor'],
                },
            },
            reasonCodes: [],
        };
        const layeredContext = buildLayeredMemoryContext({
            candidates: [
                { ...candidate, visibilityPool: 'global', selected: true },
                {
                    ...candidate,
                    candidateId: 'c2',
                    recordKey: 'fact-2',
                    rawText: '角色 a 记得旧约定',
                    renderedLine: '- 角色 a 记得旧约定',
                    visibilityPool: 'actor',
                    selected: true,
                    sectionHint: 'FACTS',
                    finalScore: 0.82,
                },
            ],
            plan: layeredPlan,
        });
        expect(layeredContext.text).toContain('[Memory Context]');
        expect(layeredContext.text).toContain('<director_context>');
        expect(layeredContext.text).toContain('<active_character_memory actor="actor_a">');
        expect(layeredContext.blocksUsed.map((block) => block.kind)).toEqual(['director_context', 'active_character_memory']);
        expect(layeredContext.text).not.toContain('不存在的块');
    });

    it('可以把 Memory Context 插入到最后一条真实用户消息之前', (): void => {
        const promptMessages = [
            { role: 'system', is_system: true, content: '系统' },
            { role: 'user', is_user: true, content: '第一句' },
            { role: 'assistant', content: '回答一' },
            { role: 'user', is_user: true, content: '最后一句' },
        ];
        const insertIndex = findLastTavernPromptUserIndexEvent(promptMessages);
        insertTavernPromptMessageEvent(promptMessages, {
            role: 'user',
            text: '[Memory Context]\n<director_context>\n【事实】\n- 旧城门\n</director_context>',
            insertMode: 'before_index',
            insertBeforeIndex: insertIndex,
            template: promptMessages[Math.max(0, insertIndex - 1)] ?? promptMessages[0],
        });

        expect(promptMessages[insertIndex]?.content ?? promptMessages[insertIndex]?.mes).toContain('[Memory Context]');
        expect(promptMessages[insertIndex + 1]?.content ?? promptMessages[insertIndex + 1]?.mes).toBe('最后一句');
    });

    it('可以映射召回日志与解释快照', async (): Promise<void> => {
        const candidates = [
            {
                candidateId: 'c1',
                recordKey: 'e1',
                recordKind: 'event',
                source: 'events',
                sectionHint: 'EVENTS',
                title: '事件一',
                rawText: '发生了事件',
                confidence: 0.9,
                updatedAt: 100,
                keywordScore: 0.7,
                vectorScore: 0,
                recencyScore: 0.8,
                continuityScore: 0.6,
                relationshipScore: 0,
                emotionScore: 0,
                conflictPenalty: 0,
                privacyPenalty: 0,
                visibilityPool: 'global',
                privacyClass: 'shared',
                viewpointReason: 'shared',
                actorFocusTier: 'shared',
                actorVisibilityScore: 0.7,
                finalScore: 0.9,
                tone: 'clear_recall',
                selected: true,
                reasonCodes: ['source:events'],
            },
            {
                candidateId: 'c2',
                recordKey: 'l1',
                recordKind: 'lorebook',
                source: 'lorebook',
                sectionHint: 'WORLD_STATE',
                title: '世界书',
                rawText: '世界规则',
                confidence: 0.7,
                updatedAt: 100,
                keywordScore: 0.5,
                vectorScore: 0,
                recencyScore: 0.7,
                continuityScore: 0.6,
                relationshipScore: 0,
                emotionScore: 0,
                conflictPenalty: 0,
                privacyPenalty: 0,
                visibilityPool: 'global',
                privacyClass: 'shared',
                viewpointReason: 'shared',
                actorFocusTier: 'shared',
                actorVisibilityScore: 0.7,
                finalScore: 0.7,
                tone: 'clear_recall',
                selected: false,
                reasonCodes: ['source:lorebook'],
            },
        ] as RecallCandidate[];

        const recallEntries = buildRecallLogEntries(candidates, '查询词', 123);
        expect(toRecallLogRecordKind(candidates[0])).toBe('summary');
        expect(toRecallLogRecordKind(candidates[1])).toBe('state');
        expect(recallEntries[0].recordKind).toBe('summary');

        const explanation = await buildLatestRecallExplanationSnapshot({
            generatedAt: 123,
            query: '查询词',
            sectionsUsed: ['EVENTS'],
            reasonCodes: ['intent:story_continue'],
            recallEntries,
        });
        expect(explanation.selected.items.length).toBeGreaterThan(0);
        expect(explanation.rejectedCandidates.items.length).toBeGreaterThanOrEqual(0);
    });
});
