import { describe, expect, it } from 'vitest';
import {
    findLastTavernPromptUserIndexEvent,
    findLastTavernPromptSystemIndexEvent,
    insertTavernPromptMessageEvent,
} from '../../SDK/tavern';
import { db, exportMemoryChatDatabaseSnapshot } from '../src/db/db';
import { buildLatestRecallExplanation } from '../src/core/recall-explanation';
import { buildLayeredMemoryContext } from '../src/injection/prompt-memory-renderer';
import { collectStateRecallCandidates } from '../src/recall/sources/state-source';
import { collectFactRecallCandidates } from '../src/recall/sources/fact-source';
import type {
    AdaptivePolicy,
    GroupMemoryState,
    InjectionSectionName,
    LatestRecallExplanation,
    LogicalChatView,
    LorebookGateDecision,
    MemoryLifecycleState,
    MemoryTuningProfile,
    PersonaMemoryProfile,
    RecallCandidate,
    RecallGateDecision,
    RecallPlan,
    RelationshipState,
} from '../src/types';
import { DEFAULT_ADAPTIVE_POLICY } from '../src/types';

/**
 * 功能：在测试内模拟 prompt_ready 的双链注入流程（基础 system + 主链 user）。
 * @param input 流程输入。
 * @returns 注入后的消息数组与最新解释快照。
 */
async function simulatePromptReadyFlow(input: {
    promptMessages: Array<Record<string, unknown>>;
    query: string;
    buildBaseContext: () => Promise<string>;
    buildMainContext: () => Promise<string>;
    latestExplanation: LatestRecallExplanation | null;
}): Promise<{
    promptMessages: Array<Record<string, unknown>>;
    latestExplanation: LatestRecallExplanation | null;
}> {
    const messages = input.promptMessages;
    const baseText = (await input.buildBaseContext()).trim();
    if (baseText.length > 0) {
        insertTavernPromptMessageEvent(messages as any, {
            role: 'system',
            text: baseText,
            insertMode: 'before_index',
            insertBeforeIndex: 1,
            template: messages[0] as any,
        });
    }
    const userInsertIndex = findLastTavernPromptUserIndexEvent(messages as any);
    const mainText = (await input.buildMainContext()).trim();
    if (mainText.length > 0) {
        insertTavernPromptMessageEvent(messages as any, {
            role: 'user',
            text: mainText,
            insertMode: 'before_index',
            insertBeforeIndex: userInsertIndex,
            template: messages[Math.max(0, userInsertIndex - 1)] as any,
        });
    }
    const nextExplanation = buildLatestRecallExplanation({
        generatedAt: Date.now(),
        query: input.query,
        sectionsUsed: ['WORLD_STATE', 'LAST_SCENE', 'EVENTS'],
        reasonCodes: ['simulation_complete'],
        recallEntries: [],
        vectorGate: {
            enabled: true,
            reasonCodes: ['vector_mode:search_rerank', 'memory_card_index_ready'],
            lanes: ['world', 'plot'],
            primaryNeed: 'world_setting',
            vectorMode: 'search_rerank',
        },
        cache: {
            hit: true,
            reasonCodes: ['cache_rank_boost'],
            entityKeys: ['厄尔多利亚', 'seraphina'],
            laneSet: ['world', 'plot'],
            selectedCardIds: ['card_eldoria_1'],
            expiresTurn: 7,
        },
        cheapRecall: {
            primaryNeed: 'world_setting',
            coveredLanes: ['world'],
            structuredCount: 4,
            recentEventCount: 2,
            enough: true,
        },
        baseInjection: {
            enabled: true,
            inserted: baseText.length > 0,
            skippedReason: baseText.length > 0 ? null : 'empty_content',
            preset: 'balanced_enhanced',
            aggressiveness: 'balanced',
            forceDynamicFloor: true,
            selectedOptions: ['world_setting', 'character_setting', 'relationship_state', 'current_scene', 'recent_plot'],
            candidateCounts: {
                total: 3,
                pretrimDropped: 0,
                budgetDropped: 0,
            },
            layerBudgets: [
                { layer: 'background', maxTokens: 120, usedTokens: 90, sections: ['WORLD_STATE', 'CHARACTER_FACTS', 'RELATIONSHIPS'] },
                { layer: 'dynamic', maxTokens: 100, usedTokens: 76, sections: ['LAST_SCENE', 'EVENTS'] },
                { layer: 'reserve', maxTokens: 40, usedTokens: 22, sections: ['SUMMARY'] },
            ],
            finalTextLength: baseText.length,
            finalTokenRatio: 0.67,
            insertedIndex: baseText.length > 0 ? 1 : -1,
            generatedAt: Date.now(),
        },
    });
    return {
        promptMessages: messages,
        latestExplanation: nextExplanation ?? input.latestExplanation,
    };
}

/**
 * 功能：构建用于 state-source 的最小召回上下文。
 * @param input 测试输入。
 * @returns 可传入 `collectStateRecallCandidates` 的上下文对象。
 */
function createStateRecallContext(input: {
    query: string;
    states: Record<string, unknown>;
    sourceLimit?: number;
}): {
    chatKey: string;
    plan: RecallPlan;
    query: string;
    vectorGate?: RecallGateDecision | null;
    recentEvents: [];
    logicalView: LogicalChatView | null;
    groupMemory: GroupMemoryState | null;
    policy: AdaptivePolicy;
    lorebookDecision: LorebookGateDecision;
    lorebookEntries: [];
    factsManager: any;
    stateManager: { query: (prefix: string) => Promise<Record<string, unknown>> };
    summariesManager: any;
    chatStateManager: null;
    lifecycleIndex: Map<string, MemoryLifecycleState>;
    activeActorKey: null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
    personaProfile: PersonaMemoryProfile | null;
    tuningProfile: MemoryTuningProfile | null;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
} {
    const plan: RecallPlan = {
        intent: 'setting_qa',
        sections: ['WORLD_STATE', 'CHARACTER_FACTS', 'LAST_SCENE'],
        sectionBudgets: {
            WORLD_STATE: 120,
            CHARACTER_FACTS: 80,
            LAST_SCENE: 60,
        },
        maxTokens: 260,
        sourceWeights: {
            facts: 0.6,
            summaries: 0.5,
            state: 0.9,
            relationships: 0.5,
            events: 0.5,
            vector: 0.6,
            lorebook: 0.4,
            memory_card: 0.7,
        },
        sourceLimits: {
            state: Math.max(1, Number(input.sourceLimit ?? 3)),
        },
        sectionWeights: {
            WORLD_STATE: 1,
            CHARACTER_FACTS: 0.8,
            LAST_SCENE: 0.75,
        },
        coarseTopK: 20,
        fineTopK: 10,
        viewpoint: {
            mode: 'omniscient_director',
            activeActorKey: null,
            allowSharedScene: true,
            allowWorldState: true,
            allowForeignPrivateMemory: false,
            focus: {
                primaryActorKey: null,
                secondaryActorKeys: [],
                budgetShare: {
                    global: 1,
                    primaryActor: 0,
                    secondaryActors: 0,
                },
                reasonCodes: ['focus:director_view'],
            },
        },
        reasonCodes: ['test_plan'],
    };

    return {
        chatKey: 'test-chat',
        plan,
        query: input.query,
        vectorGate: null,
        recentEvents: [],
        logicalView: null,
        groupMemory: null,
        policy: DEFAULT_ADAPTIVE_POLICY,
        lorebookDecision: {
            mode: 'soft_inject',
            score: 0.7,
            reasonCodes: [],
            matchedEntries: [],
            conflictDetected: false,
            shouldExtractWorldFacts: true,
            shouldWriteback: true,
            generatedAt: Date.now(),
        },
        lorebookEntries: [],
        factsManager: {} as any,
        stateManager: {
            query: async (): Promise<Record<string, unknown>> => ({ ...input.states }),
        },
        summariesManager: {} as any,
        chatStateManager: null,
        lifecycleIndex: new Map<string, MemoryLifecycleState>(),
        activeActorKey: null,
        personaProfiles: {},
        personaProfile: null,
        tuningProfile: null,
        relationships: [],
        fallbackRelationshipWeight: 0,
    };
}

/**
 * 功能：构建用于 fact-source 的最小召回上下文。
 * @param input 测试输入。
 * @returns 可传入 `collectFactRecallCandidates` 的上下文对象。
 */
function createFactRecallContext(input: {
    query: string;
    facts: Array<Record<string, unknown>>;
    sourceLimit?: number;
}): {
    chatKey: string;
    plan: RecallPlan;
    query: string;
    vectorGate?: RecallGateDecision | null;
    recentEvents: [];
    logicalView: LogicalChatView | null;
    groupMemory: GroupMemoryState | null;
    policy: AdaptivePolicy;
    lorebookDecision: LorebookGateDecision;
    lorebookEntries: [];
    factsManager: { query: () => Promise<Array<Record<string, unknown>>> };
    stateManager: any;
    summariesManager: any;
    chatStateManager: null;
    lifecycleIndex: Map<string, MemoryLifecycleState>;
    activeActorKey: null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
    personaProfile: PersonaMemoryProfile | null;
    tuningProfile: MemoryTuningProfile | null;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
} {
    const plan: RecallPlan = {
        intent: 'setting_qa',
        sections: ['WORLD_STATE', 'FACTS'],
        sectionBudgets: {
            WORLD_STATE: 120,
            FACTS: 100,
        },
        maxTokens: 240,
        sourceWeights: {
            facts: 0.9,
            summaries: 0.5,
            state: 0.7,
            relationships: 0.5,
            events: 0.5,
            vector: 0.6,
            lorebook: 0.4,
            memory_card: 0.7,
        },
        sourceLimits: {
            facts: Math.max(1, Number(input.sourceLimit ?? 3)),
        },
        sectionWeights: {
            WORLD_STATE: 1,
            FACTS: 0.95,
        },
        coarseTopK: 20,
        fineTopK: 10,
        viewpoint: {
            mode: 'omniscient_director',
            activeActorKey: null,
            allowSharedScene: true,
            allowWorldState: true,
            allowForeignPrivateMemory: false,
            focus: {
                primaryActorKey: null,
                secondaryActorKeys: [],
                budgetShare: {
                    global: 1,
                    primaryActor: 0,
                    secondaryActors: 0,
                },
                reasonCodes: ['focus:director_view'],
            },
        },
        reasonCodes: ['test_plan'],
    };

    return {
        chatKey: 'test-chat',
        plan,
        query: input.query,
        vectorGate: null,
        recentEvents: [],
        logicalView: null,
        groupMemory: null,
        policy: DEFAULT_ADAPTIVE_POLICY,
        lorebookDecision: {
            mode: 'soft_inject',
            score: 0.7,
            reasonCodes: [],
            matchedEntries: [],
            conflictDetected: false,
            shouldExtractWorldFacts: true,
            shouldWriteback: true,
            generatedAt: Date.now(),
        },
        lorebookEntries: [],
        factsManager: {
            query: async (): Promise<Array<Record<string, unknown>>> => [...input.facts],
        },
        stateManager: {} as any,
        summariesManager: {} as any,
        chatStateManager: null,
        lifecycleIndex: new Map<string, MemoryLifecycleState>(),
        activeActorKey: null,
        personaProfiles: {},
        personaProfile: null,
        tuningProfile: null,
        relationships: [],
        fallbackRelationshipWeight: 0,
    };
}

/**
 * 功能：构建注入测试用的候选条目。
 * @param section 区段名。
 * @param text 候选文本。
 * @param id 候选 ID。
 * @returns 召回候选。
 */
function createCandidate(section: InjectionSectionName, text: string, id: string): RecallCandidate {
    return {
        candidateId: id,
        recordKey: id,
        recordKind: section === 'EVENTS' ? 'event' : section === 'WORLD_STATE' ? 'state' : 'fact',
        source: section === 'EVENTS' ? 'events' : section === 'WORLD_STATE' ? 'state' : 'facts',
        sectionHint: section,
        title: id,
        rawText: text,
        renderedLine: `- ${text}`,
        confidence: 0.8,
        updatedAt: Date.now(),
        keywordScore: 0.8,
        vectorScore: 0,
        recencyScore: 0.7,
        continuityScore: 0.8,
        relationshipScore: 0.4,
        emotionScore: 0.2,
        conflictPenalty: 0,
        privacyPenalty: 0,
        visibilityPool: 'global',
        privacyClass: 'shared',
        viewpointReason: 'shared',
        actorFocusTier: 'shared',
        actorVisibilityScore: 0.8,
        finalScore: 0.9,
        tone: 'stable_fact',
        selected: true,
        reasonCodes: ['test_candidate'],
    };
}

describe('prompt injection end-to-end', (): void => {
    it('WORLD_STATE 明确实体命中不会被 source 预裁剪提前丢弃', async (): Promise<void> => {
        const states: Record<string, unknown> = {};
        for (let index = 0; index < 40; index += 1) {
            states[`catalog/regions/region_${index}`] = `普通地区_${index}`;
        }
        states['catalog/regions/厄尔多利亚'] = '厄尔多利亚是魔法森林边境，位于回声溪附近。';
        for (let index = 40; index < 70; index += 1) {
            states[`catalog/regions/region_${index}`] = `普通地区_${index}`;
        }
        const context = createStateRecallContext({
            query: '厄尔多利亚是什么地方',
            states,
            sourceLimit: 3,
        });

        const candidates = await collectStateRecallCandidates(context as any);
        const hasEldoria = candidates.some((candidate: RecallCandidate): boolean => {
            return String(candidate.recordKey).includes('厄尔多利亚') || String(candidate.rawText).includes('厄尔多利亚');
        });
        expect(hasEldoria).toBe(true);
    });

    it('FACTS 明确实体命中不会因 source 预裁剪提前丢弃', async (): Promise<void> => {
        const facts: Array<Record<string, unknown>> = [];
        for (let index = 0; index < 40; index += 1) {
            facts.push({
                factKey: `fact-${index}`,
                type: 'misc',
                path: `catalog.misc.region_${index}`,
                value: `普通设定 ${index}`,
                updatedAt: Date.now() - index,
            });
        }
        facts.push({
            factKey: 'fact-eldoria',
            type: 'region',
            path: 'catalog.regions.厄尔多利亚',
            value: '厄尔多利亚是被古老魔法覆盖的边境森林地带',
            updatedAt: Date.now(),
        });
        for (let index = 40; index < 70; index += 1) {
            facts.push({
                factKey: `fact-tail-${index}`,
                type: 'misc',
                path: `catalog.misc.tail_${index}`,
                value: `尾部设定 ${index}`,
                updatedAt: Date.now() - index,
            });
        }

        const context = createFactRecallContext({
            query: '厄尔多利亚是什么地方',
            facts,
            sourceLimit: 3,
        });

        const candidates = await collectFactRecallCandidates(context as any);
        const hasEldoria = candidates.some((candidate: RecallCandidate): boolean => {
            return String(candidate.recordKey).includes('fact-eldoria') || String(candidate.rawText).includes('厄尔多利亚');
        });
        expect(hasEldoria).toBe(true);
    });

    it('Memory Context 可按顺序插入到最后一条 user 之前', (): void => {
        const plan: RecallPlan = {
            intent: 'story_continue',
            sections: ['WORLD_STATE', 'RELATIONSHIPS', 'LAST_SCENE', 'EVENTS'],
            sectionBudgets: {
                WORLD_STATE: 80,
                RELATIONSHIPS: 70,
                LAST_SCENE: 80,
                EVENTS: 70,
            },
            maxTokens: 300,
            sourceWeights: {
                facts: 0.6,
                summaries: 0.5,
                state: 0.8,
                relationships: 0.8,
                events: 0.9,
                vector: 0.4,
                lorebook: 0.3,
                memory_card: 0.7,
            },
            sourceLimits: {},
            sectionWeights: {
                WORLD_STATE: 1,
                RELATIONSHIPS: 0.9,
                LAST_SCENE: 0.95,
                EVENTS: 0.85,
            },
            coarseTopK: 12,
            fineTopK: 8,
            viewpoint: {
                mode: 'omniscient_director',
                activeActorKey: null,
                allowSharedScene: true,
                allowWorldState: true,
                allowForeignPrivateMemory: false,
                focus: {
                    primaryActorKey: null,
                    secondaryActorKeys: [],
                    budgetShare: {
                        global: 1,
                        primaryActor: 0,
                        secondaryActors: 0,
                    },
                    reasonCodes: ['focus:director_view'],
                },
            },
            reasonCodes: ['test_plan'],
        };
        const memoryContext = buildLayeredMemoryContext({
            candidates: [
                createCandidate('WORLD_STATE', '厄尔多利亚是魔法森林边境。', 'world_eldoria'),
                createCandidate('RELATIONSHIPS', 'Seraphina 对毅毅有强烈保护倾向。', 'rel_guard'),
                createCandidate('LAST_SCENE', '毅毅在林间空地疗愈小屋中苏醒。', 'scene_now'),
                createCandidate('EVENTS', '野兽袭击后被 Seraphina 救下。', 'event_rescue'),
            ],
            plan,
            roleProfiles: {
                seraphina: {
                    actorKey: 'seraphina',
                    displayName: 'Seraphina',
                    aliases: [],
                    identityFacts: ['林间空地守护者'],
                    originFacts: ['会治愈和守护魔法'],
                    relationshipFacts: [],
                    items: [],
                    equipments: [],
                    updatedAt: Date.now(),
                },
            },
            relationships: [],
        });
        const promptMessages = [
            { role: 'system', is_system: true, content: 'system base' },
            { role: 'user', is_user: true, content: '前文 user 1' },
            { role: 'assistant', content: '前文 assistant 1' },
            { role: 'user', is_user: true, content: '最后一个 user 问题' },
        ];
        const userIndex = findLastTavernPromptUserIndexEvent(promptMessages);
        insertTavernPromptMessageEvent(promptMessages, {
            role: 'user',
            text: memoryContext.text,
            insertMode: 'before_index',
            insertBeforeIndex: userIndex,
            template: promptMessages[Math.max(0, userIndex - 1)] ?? promptMessages[0],
        });
        const injected = promptMessages[userIndex] as any;
        const injectedText = String(injected?.content ?? injected?.mes ?? '');
        expect(injectedText).toContain('[Memory Context]');
        expect(injectedText).toContain('厄尔多利亚');
        expect(String((promptMessages[userIndex + 1] as any)?.content ?? '')).toContain('最后一个 user 问题');
    });

    it('LatestRecallExplanation 可携带基础注入诊断快照', (): void => {
        const explanation: LatestRecallExplanation = buildLatestRecallExplanation({
            generatedAt: Date.now(),
            query: '厄尔多利亚是什么地方',
            sectionsUsed: ['WORLD_STATE', 'LAST_SCENE', 'EVENTS'],
            reasonCodes: ['integration_test'],
            recallEntries: [],
            baseInjection: {
                enabled: true,
                inserted: true,
                skippedReason: null,
                preset: 'balanced_enhanced',
                aggressiveness: 'balanced',
                forceDynamicFloor: true,
                selectedOptions: ['world_setting', 'current_scene', 'recent_plot'],
                candidateCounts: {
                    total: 3,
                    pretrimDropped: 0,
                    budgetDropped: 0,
                },
                layerBudgets: [
                    { layer: 'background', maxTokens: 120, usedTokens: 86, sections: ['WORLD_STATE'] },
                    { layer: 'dynamic', maxTokens: 100, usedTokens: 72, sections: ['LAST_SCENE', 'EVENTS'] },
                    { layer: 'reserve', maxTokens: 40, usedTokens: 18, sections: ['SUMMARY'] },
                ],
                finalTextLength: 420,
                finalTokenRatio: 0.68,
                insertedIndex: 2,
                generatedAt: Date.now(),
            },
        });
        expect(explanation.baseInjection?.inserted).toBe(true);
        expect(explanation.baseInjection?.preset).toBe('balanced_enhanced');
        expect(explanation.baseInjection?.layerBudgets?.length).toBe(3);
    });

    it('可完整模拟 prompt_ready 全链路注入并携带向量信息', async (): Promise<void> => {
        const promptMessages: Array<Record<string, unknown>> = [
            { role: 'system', is_system: true, content: 'system base prompt' },
            { role: 'assistant', content: '上一轮回复' },
            { role: 'user', is_user: true, content: '厄尔多利亚是什么地方' },
        ];
        const flowResult = await simulatePromptReadyFlow({
            promptMessages,
            query: '厄尔多利亚是什么地方',
            buildBaseContext: async (): Promise<string> => {
                return [
                    '## 世界与规则',
                    '[Memory Context]',
                    '<memoryos_context>',
                    '<worldinfo><state>厄尔多利亚是魔法森林边境。</state></worldinfo>',
                    '<roles><seraphina><profile><display_name>Seraphina</display_name></profile></seraphina></roles>',
                    '</memoryos_context>',
                ].join('\n');
            },
            buildMainContext: async (): Promise<string> => {
                return [
                    '[Memory Context]',
                    '<memoryos_context>',
                    '<worldinfo><recentScene>毅毅在林间空地疗愈小屋苏醒。</recentScene></worldinfo>',
                    '<roles><seraphina><memories><memory>Seraphina守护厄尔多利亚边境。</memory></memories></seraphina></roles>',
                    '</memoryos_context>',
                ].join('\n');
            },
            latestExplanation: null,
        });

        const systemMessages = flowResult.promptMessages.filter((item: Record<string, unknown>): boolean => {
            return String(item.role ?? '').toLowerCase() === 'system';
        });
        const userMessages = flowResult.promptMessages.filter((item: Record<string, unknown>): boolean => {
            return String(item.role ?? '').toLowerCase() === 'user';
        });
        const injectedSystemText = String(systemMessages[1]?.content ?? systemMessages[1]?.mes ?? '');
        const injectedUserText = String(userMessages[0]?.content ?? userMessages[0]?.mes ?? '');

        expect(systemMessages.length).toBeGreaterThanOrEqual(2);
        expect(injectedSystemText).toContain('世界与规则');
        expect(injectedSystemText).toContain('厄尔多利亚');
        expect(userMessages.length).toBeGreaterThanOrEqual(2);
        expect(injectedUserText).toContain('[Memory Context]');
        expect(injectedUserText).toContain('recentScene');

        expect(flowResult.latestExplanation?.vectorGate?.enabled).toBe(true);
        expect(flowResult.latestExplanation?.vectorGate?.vectorMode).toBe('search_rerank');
        expect(flowResult.latestExplanation?.cache?.hit).toBe(true);
        expect(flowResult.latestExplanation?.baseInjection?.inserted).toBe(true);
        expect(flowResult.latestExplanation?.baseInjection?.preset).toBe('balanced_enhanced');
    });

    it('按用户发送后注入流程执行，并可导出当前聊天全库快照（含向量）', async (): Promise<void> => {
        const chatKey = `test-flow-${Date.now()}`;
        const originalTables = {
            events: db.events,
            facts: db.facts,
            world_state: db.world_state,
            summaries: db.summaries,
            templates: db.templates,
            audit: db.audit,
            meta: db.meta,
            worldinfo_cache: db.worldinfo_cache,
            template_bindings: db.template_bindings,
            memory_cards: db.memory_cards,
            memory_card_embeddings: db.memory_card_embeddings,
            memory_card_meta: db.memory_card_meta,
            relationship_memory: db.relationship_memory,
            memory_recall_log: db.memory_recall_log,
            memory_mutation_history: db.memory_mutation_history,
        } as const;

        /**
         * 功能：构造可链式调用的导出查询桩。
         * @param rows 目标返回行。
         * @returns 兼容 Dexie where/between/toArray 结构的桩对象。
         */
        function createTableStub<T>(rows: T[]): {
            where: () => {
                equals: () => { toArray: () => Promise<T[]> };
                between: () => { toArray: () => Promise<T[]> };
            };
        } {
            return {
                where: () => ({
                    equals: () => ({
                        toArray: async () => rows,
                    }),
                    between: () => ({
                        toArray: async () => rows,
                    }),
                }),
            };
        }

        /**
         * 功能：构造 `meta` 表的读取桩。
         * @param row 目标返回行。
         * @returns 兼容 Dexie get 方法的桩对象。
         */
        function createMetaTableStub<T>(row: T): {
            get: () => Promise<T>;
        } {
            return {
                get: async () => row,
            };
        }

        try {
            (db as any).events = createTableStub([{ eventId: `${chatKey}::event::1`, chatKey, content: '毅毅在森林中遇袭。' }]);
            (db as any).facts = createTableStub([{ factKey: `${chatKey}::fact::eldoria`, chatKey, value: '厄尔多利亚是魔法边境。' }]);
            (db as any).world_state = createTableStub([{ chatKey, path: 'catalog/regions/厄尔多利亚', value: '厄尔多利亚位于回声溪附近。' }]);
            (db as any).summaries = createTableStub([{ summaryId: `${chatKey}::summary::1`, chatKey, content: '近期剧情：受袭后获救。' }]);
            (db as any).templates = createTableStub([]);
            (db as any).audit = createTableStub([]);
            (db as any).meta = createMetaTableStub({ chatKey, flags: { test: true } });
            (db as any).worldinfo_cache = createTableStub([]);
            (db as any).template_bindings = createTableStub([]);
            (db as any).memory_cards = createTableStub([{ cardId: `${chatKey}::card::1`, chatKey, lane: 'world', summary: '厄尔多利亚高风险。' }]);
            (db as any).memory_card_embeddings = createTableStub([
                { embeddingId: `${chatKey}::emb::1`, cardId: `${chatKey}::card::1`, chatKey, model: 'test-embedding-model', vector: [0.11, 0.07, 0.29, 0.53] },
            ]);
            (db as any).memory_card_meta = createTableStub([]);
            (db as any).relationship_memory = createTableStub([]);
            (db as any).memory_recall_log = createTableStub([]);
            (db as any).memory_mutation_history = createTableStub([]);

            const snapshot = await exportMemoryChatDatabaseSnapshot(chatKey);
            expect(snapshot.chatKey).toBe(chatKey);
            expect(snapshot.worldState.length).toBeGreaterThan(0);
            expect(snapshot.facts.length).toBeGreaterThan(0);
            expect(snapshot.memoryCards.length).toBeGreaterThan(0);
            expect(snapshot.memoryCardEmbeddings.length).toBeGreaterThan(0);
            expect(snapshot.memoryCardEmbeddings[0]).toMatchObject({
                cardId: `${chatKey}::card::1`,
                model: 'test-embedding-model',
            });

            const promptMessages: Array<Record<string, unknown>> = [
                { role: 'system', is_system: true, content: 'Write Seraphina next reply' },
                { role: 'assistant', content: '上一轮 assistant 回复' },
                { role: 'user', is_user: true, content: '厄尔多利亚是什么地方', mes_id: 'u-last' },
            ];

            const flowResult = await simulatePromptReadyFlow({
                promptMessages,
                query: '厄尔多利亚是什么地方',
                buildBaseContext: async (): Promise<string> => {
                    return [
                        '## 世界与规则',
                        '[Memory Context]',
                        '<memoryos_context>',
                        `<worldinfo><state>${String(snapshot.worldState[0]?.value ?? '')}</state></worldinfo>`,
                        '</memoryos_context>',
                    ].join('\n');
                },
                buildMainContext: async (): Promise<string> => {
                    return [
                        '[Memory Context]',
                        '<memoryos_context>',
                        `<plot><event>${String(snapshot.events[0]?.content ?? '')}</event></plot>`,
                        `<vector><card>${String(snapshot.memoryCards[0]?.summary ?? '')}</card></vector>`,
                        '</memoryos_context>',
                    ].join('\n');
                },
                latestExplanation: null,
            });

            const fullPrompt = flowResult.promptMessages
                .map((item: Record<string, unknown>): string => String(item.content ?? item.mes ?? ''))
                .join('\n');
            expect(fullPrompt).toContain('厄尔多利亚');
            expect(fullPrompt).toContain('[Memory Context]');
            expect(fullPrompt).toContain('vector');
            expect(flowResult.latestExplanation?.vectorGate?.enabled).toBe(true);
            expect(flowResult.latestExplanation?.vectorGate?.vectorMode).toBe('search_rerank');
        } finally {
            (db as any).events = originalTables.events;
            (db as any).facts = originalTables.facts;
            (db as any).world_state = originalTables.world_state;
            (db as any).summaries = originalTables.summaries;
            (db as any).templates = originalTables.templates;
            (db as any).audit = originalTables.audit;
            (db as any).meta = originalTables.meta;
            (db as any).worldinfo_cache = originalTables.worldinfo_cache;
            (db as any).template_bindings = originalTables.template_bindings;
            (db as any).memory_cards = originalTables.memory_cards;
            (db as any).memory_card_embeddings = originalTables.memory_card_embeddings;
            (db as any).memory_card_meta = originalTables.memory_card_meta;
            (db as any).relationship_memory = originalTables.relationship_memory;
            (db as any).memory_recall_log = originalTables.memory_recall_log;
            (db as any).memory_mutation_history = originalTables.memory_mutation_history;
        }
    });
});
