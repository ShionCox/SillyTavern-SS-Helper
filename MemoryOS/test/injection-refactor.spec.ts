import { describe, expect, it } from 'vitest';
import type { ChatStateManager } from '../src/core/chat-state-manager';
import { buildPreparedRecallContext } from '../src/injection/recall-context-builder';
import { dedupeMemoryContextAgainstSystem } from '../src/injection/injection-manager';
import { buildLayeredMemoryContext } from '../src/injection/prompt-memory-renderer';
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
            getRoleProfiles: async (): Promise<Record<string, unknown>> => ({}),
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
        expect(context.roleProfiles).toEqual({});
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
            roleProfiles: {
                actor_a: {
                    actorKey: 'actor_a',
                    displayName: 'Actor A',
                    aliases: [],
                    identityFacts: ['职业:侦探'],
                    originFacts: ['来自旧城'],
                    relationshipFacts: [],
                    items: [{ kind: 'item', name: '旧地图', detail: '通往旧城门', sourceRefs: [] }],
                    equipments: [{ kind: 'equipment', name: '短刃', detail: '近战武器', sourceRefs: [] }],
                    updatedAt: 1,
                },
            },
            relationships: [],
        });
        expect(layeredContext.text).toContain('[Memory Context]');
        expect(layeredContext.text).toContain('<memoryos_context>');
        expect(layeredContext.text).toContain('<worldinfo>');
        expect(layeredContext.text).toContain('<roles>');
        expect(layeredContext.text).toContain('<actor_a>');
        expect(layeredContext.text).toContain('<items>');
        expect(layeredContext.text).toContain('<equipments>');
        expect(layeredContext.text).toContain('<memories>');
        expect(layeredContext.blocksUsed.map((block) => block.kind)).toEqual(['memoryos_worldinfo', 'memoryos_roles']);
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
            text: '[Memory Context]\n<memoryos_context>\n<worldinfo><summary>旧城门</summary></worldinfo>\n<roles></roles>\n</memoryos_context>',
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

    it('结构化 XML 会输出角色物品和装备并转义特殊字符', (): void => {
        const plan: RecallPlan = {
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
        const context = buildLayeredMemoryContext({
            candidates: [{
                candidateId: 'c1',
                recordKey: 'fact-1',
                recordKind: 'fact',
                source: 'facts',
                sectionHint: 'FACTS',
                title: '事实一',
                rawText: 'Alice 持有 <旧地图>',
                renderedLine: '- Alice 持有 <旧地图>',
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
                visibilityPool: 'actor',
                privacyClass: 'shared',
                viewpointReason: 'owner_actor',
                actorFocusTier: 'primary',
                actorVisibilityScore: 0.9,
                finalScore: 0.9,
                tone: 'clear_recall',
                selected: true,
                ownerActorKey: 'actor_a',
                reasonCodes: ['source:facts'],
            }],
            plan,
            roleProfiles: {
                actor_a: {
                    actorKey: 'actor_a',
                    displayName: 'Alice',
                    aliases: [],
                    identityFacts: ['身份:调查员'],
                    originFacts: [],
                    relationshipFacts: [],
                    items: [{ kind: 'item', name: '旧地图<&>', detail: '含密文', sourceRefs: [] }],
                    equipments: [{ kind: 'equipment', name: '短刃', detail: '近战', sourceRefs: [] }],
                    updatedAt: 1,
                },
            },
            relationships: [],
        });
        expect(context.text).toContain('<memoryos_context>');
        expect(context.text).toContain('<items>');
        expect(context.text).toContain('<equipments>');
        expect(context.text).toContain('旧地图&lt;&amp;&gt;');
    });

    it('无物品和装备时不会输出空集合节点', (): void => {
        const plan: RecallPlan = {
            intent: 'story_continue',
            sections: ['SUMMARY'],
            sectionBudgets: { SUMMARY: 120 },
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
            sectionWeights: { SUMMARY: 1 },
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
        const context = buildLayeredMemoryContext({
            candidates: [{
                candidateId: 'c1',
                recordKey: 's1',
                recordKind: 'summary',
                source: 'summaries',
                sectionHint: 'SUMMARY',
                title: '摘要',
                rawText: '世界规则稳定',
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
                actorVisibilityScore: 0.9,
                finalScore: 0.9,
                tone: 'clear_recall',
                selected: true,
                reasonCodes: ['source:summaries'],
            }],
            plan,
            roleProfiles: {
                actor_a: {
                    actorKey: 'actor_a',
                    displayName: 'Alice',
                    aliases: [],
                    identityFacts: ['身份:调查员'],
                    originFacts: [],
                    relationshipFacts: [],
                    items: [],
                    equipments: [],
                    updatedAt: 1,
                },
            },
            relationships: [],
        });
        expect(context.text).not.toContain('<items></items>');
        expect(context.text).not.toContain('<equipments></equipments>');
    });
    it('XML 文本节点会保留引号，避免输出 &quot; 之类的实体', (): void => {
        const plan: RecallPlan = {
            intent: 'setting_qa',
            sections: ['WORLD_STATE'],
            sectionBudgets: { WORLD_STATE: 120 },
            maxTokens: 240,
            sourceWeights: {
                facts: 1,
                summaries: 0.8,
                state: 1,
                relationships: 0.5,
                events: 1,
                vector: 0.6,
                lorebook: 0.3,
            },
            sourceLimits: {},
            sectionWeights: { WORLD_STATE: 1 },
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
                        global: 0.7,
                        primaryActor: 0.3,
                        secondaryActors: 0,
                    },
                    reasonCodes: ['focus:explicit_active_actor'],
                },
            },
            reasonCodes: [],
        };
        const context = buildLayeredMemoryContext({
            candidates: [{
                candidateId: 'c-world-1',
                recordKey: 'state-1',
                recordKind: 'state',
                source: 'state',
                sectionHint: 'WORLD_STATE',
                title: '规则',
                rawText: '厄尔多利亚规则: {"title":"林间空地的庇护","summary":"不会受到任何伤害"}',
                renderedLine: '- 厄尔多利亚规则',
                confidence: 0.9,
                updatedAt: 100,
                keywordScore: 0.9,
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
                actorVisibilityScore: 0.9,
                finalScore: 0.95,
                tone: 'clear_recall',
                selected: true,
                reasonCodes: ['source:state'],
            }],
            plan,
            roleProfiles: {},
            relationships: [],
        });
        expect(context.text).toContain('"title":"林间空地的庇护"');
        expect(context.text).not.toContain('&quot;');
    });
    it('世界规则数组会展开为多条 rule，状态对象优先使用 summary', (): void => {
        const plan: RecallPlan = {
            intent: 'setting_qa',
            sections: ['WORLD_STATE'],
            sectionBudgets: { WORLD_STATE: 160 },
            maxTokens: 280,
            sourceWeights: {
                facts: 1,
                summaries: 0.8,
                state: 1,
                relationships: 0.5,
                events: 1,
                vector: 0.6,
                lorebook: 0.3,
            },
            sourceLimits: {},
            sectionWeights: { WORLD_STATE: 1 },
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
                        global: 0.8,
                        primaryActor: 0.2,
                        secondaryActors: 0,
                    },
                    reasonCodes: ['focus:explicit_active_actor'],
                },
            },
            reasonCodes: [],
        };
        const context = buildLayeredMemoryContext({
            candidates: [
                {
                    candidateId: 'c-rule-1',
                    recordKey: 'state-rule-1',
                    recordKind: 'state',
                    source: 'state',
                    sectionHint: 'WORLD_STATE',
                    title: 'rule',
                    rawText: '/semantic/world/rules: ["林间空地受古老魔法守护","影牙能散播诅咒"]',
                    renderedLine: '- world rules',
                    confidence: 0.9,
                    updatedAt: 100,
                    keywordScore: 0.9,
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
                    actorVisibilityScore: 0.9,
                    finalScore: 0.95,
                    tone: 'clear_recall',
                    selected: true,
                    reasonCodes: ['source:state'],
                },
                {
                    candidateId: 'c-state-1',
                    recordKey: 'state-rel-1',
                    recordKind: 'state',
                    source: 'state',
                    sectionHint: 'WORLD_STATE',
                    title: 'relationship',
                    rawText: '/semantic/characters/seraphina/relationships/foo: {"title":"塞拉菲娜守护林间空地","summary":"塞拉菲娜守护林间空地，保护所有寻求庇护者"}',
                    renderedLine: '- relationship state',
                    confidence: 0.88,
                    updatedAt: 100,
                    keywordScore: 0.88,
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
                    actorVisibilityScore: 0.9,
                    finalScore: 0.92,
                    tone: 'clear_recall',
                    selected: true,
                    reasonCodes: ['source:state'],
                },
            ],
            plan,
            roleProfiles: {},
            relationships: [],
        });
        expect(context.text).toContain('<rule>林间空地受古老魔法守护</rule>');
        expect(context.text).toContain('<rule>影牙能散播诅咒</rule>');
        expect(context.text).not.toContain('/semantic/world/rules:');
        expect(context.text).toContain('<state>塞拉菲娜守护林间空地，保护所有寻求庇护者</state>');
        expect(context.text).not.toContain('/semantic/characters/seraphina/relationships/foo:');
    });

    it('主链 user 注入会跳过与基础 system 注入重复的记忆叶子节点', (): void => {
        const promptMessages = [
            {
                role: 'system',
                is_system: true,
                content: [
                    '[Memory Context]',
                    '<memoryos_context>',
                    '<worldinfo><rules><rule>林间空地受古老魔法守护</rule></rules><states><state>塞拉菲娜守护林间空地</state></states></worldinfo>',
                    '<roles><seraphina><profile><display_name>Seraphina</display_name><identity><fact>厄尔多利亚林间空地的守护者</fact></identity></profile></seraphina></roles>',
                    '</memoryos_context>',
                ].join('\n'),
            },
        ] as any[];
        const mainlineContext = [
            '[Memory Context]',
            '<memoryos_context>',
            '<worldinfo><rules><rule>林间空地受古老魔法守护</rule><rule>影牙能散播诅咒</rule></rules><states><state>塞拉菲娜守护林间空地</state><state>厄尔多利亚夜晚怪物潜行</state></states></worldinfo>',
            '<roles><seraphina><profile><display_name>Seraphina</display_name><identity><fact>厄尔多利亚林间空地的守护者</fact><fact>拥有治愈、保护、自然魔法能力</fact></identity></profile></seraphina></roles>',
            '</memoryos_context>',
        ].join('\n');

        const deduped = dedupeMemoryContextAgainstSystem(mainlineContext, promptMessages as any);

        expect(deduped).toContain('影牙能散播诅咒');
        expect(deduped).toContain('厄尔多利亚夜晚怪物潜行');
        expect(deduped).toContain('拥有治愈、保护、自然魔法能力');
        expect(deduped).not.toContain('<rule>林间空地受古老魔法守护</rule>');
        expect(deduped).not.toContain('<state>塞拉菲娜守护林间空地</state>');
        expect(deduped).not.toContain('<fact>厄尔多利亚林间空地的守护者</fact>');
    });
});
