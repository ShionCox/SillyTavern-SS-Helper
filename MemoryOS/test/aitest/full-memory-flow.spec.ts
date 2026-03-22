import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    ChatSemanticSeed,
    ColdStartLorebookSelection,
    ColdStartStage,
    SemanticAiSummary,
    SemanticCatalogEntrySummary,
    SemanticWorldFacetEntry,
} from '../../src/types/chat-state';

const hoisted = vi.hoisted(() => ({
    collectChatSemanticSeedWithAi: vi.fn(),
    searchMock: vi.fn(),
    buildScoredCandidateMock: vi.fn(),
}));

vi.mock('../../src/core/chat-semantic-bootstrap', () => ({
    collectChatSemanticSeedWithAi: hoisted.collectChatSemanticSeedWithAi,
}));

vi.mock('../../src/ui/index', () => ({
    openWorldbookInitPanel: vi.fn(),
}));

vi.mock('../../src/vector/vector-manager', () => ({
    VectorManager: class {
        /**
         * 功能：返回模拟的向量检索结果。
         * @returns 检索结果列表
         */
        public async search(): Promise<unknown[]> {
            return hoisted.searchMock();
        }
    },
}));

vi.mock('../../src/recall/sources/shared', () => ({
    clamp01: (value: number): number => Math.max(0, Math.min(1, Number(value ?? 0) || 0)),
    normalizeText: (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim(),
    readSourceLimit: (): number => 5,
    loadFacts: async (): Promise<unknown[]> => [],
    loadRecentSummaries: async (): Promise<unknown[]> => [],
    buildScoredCandidate: (context: unknown, params: Record<string, unknown>): unknown => {
        return hoisted.buildScoredCandidateMock(context, params);
    },
}));

import { MemorySDKImpl } from '../../src/sdk/memory-sdk';
import { mergeAiSummary } from '../../src/core/chat-semantic-ai-summary';
import { buildMemoryCardDraftsFromSemanticSeed } from '../../src/core/memory-card-semantic-seed';
import { collectMemoryCardRecallCandidates } from '../../src/recall/sources/memory-card-source';

/**
 * 功能：打印全流程测试结果。
 * @param label 打印标签
 * @param payload 要输出的数据
 * @returns 无返回值
 */
function printFlowResult(label: string, payload: unknown): void {
    console.log(`\n[${label}]`);
    console.log(JSON.stringify(payload, null, 2));
}

/**
 * 功能：创建目录摘要条目。
 * @param entry 覆盖字段
 * @returns 完整目录条目
 */
function createCatalogEntry(entry: Partial<SemanticCatalogEntrySummary> = {}): SemanticCatalogEntrySummary {
    return {
        name: entry.name ?? '',
        summary: entry.summary ?? '',
        knowledgeLevel: entry.knowledgeLevel,
        nationName: entry.nationName,
        nationKnowledgeLevel: entry.nationKnowledgeLevel,
        regionName: entry.regionName,
        regionKnowledgeLevel: entry.regionKnowledgeLevel,
        cityName: entry.cityName,
        cityKnowledgeLevel: entry.cityKnowledgeLevel,
        aliases: entry.aliases,
        tags: entry.tags,
    };
}

/**
 * 功能：创建世界分面条目。
 * @param entry 覆盖字段
 * @returns 完整分面条目
 */
function createFacetEntry(entry: Partial<SemanticWorldFacetEntry> = {}): SemanticWorldFacetEntry {
    return {
        title: entry.title ?? '',
        summary: entry.summary ?? '',
        facet: entry.facet ?? 'other',
        knowledgeLevel: entry.knowledgeLevel ?? 'confirmed',
        scopeType: entry.scopeType ?? 'global',
        nationName: entry.nationName,
        regionName: entry.regionName,
        cityName: entry.cityName,
        locationName: entry.locationName,
        appliesTo: entry.appliesTo,
        tags: entry.tags,
    };
}

/**
 * 功能：创建 AI 摘要测试数据。
 * @returns AI 摘要对象
 */
function createAiSummary(): SemanticAiSummary {
    return {
        roleSummary: 'Alice 是一名冷静克制的调查员，优先依据证据行动。',
        worldSummary: '这个世界公开施法会留下可追踪痕迹，黑塔掌管核心档案。',
        identityFacts: [],
        worldRules: ['公开施法会留下可追踪痕迹。'],
        hardConstraints: ['贵族不得公开与平民缔结婚约。'],
        cities: [],
        locations: ['黑塔'],
        entities: ['黑塔'],
        nations: ['晨星王国'],
        regions: [],
        factions: [],
        calendarSystems: [],
        currencySystems: [],
        socialSystems: [],
        culturalPractices: [],
        historicalEvents: [],
        dangers: [],
        otherWorldDetails: [],
        characterGoals: [],
        relationshipFacts: ['Alice 与 Bob 长期协作，遇到风险时会优先互相掩护。'],
        catchphrases: ['先看证据'],
        relationshipAnchors: ['Alice 信任 Bob'],
        styleCues: ['简短克制，避免夸张语气'],
        nationDetails: [
            createCatalogEntry({
                name: '晨星王国',
                summary: '边境地区戒备森严，魔法受到严格监管。',
                knowledgeLevel: 'confirmed',
            }),
        ],
        regionDetails: [],
        cityDetails: [],
        locationDetails: [
            createCatalogEntry({
                name: '黑塔',
                summary: '帝都的情报与档案中枢，权限严格分级。',
                knowledgeLevel: 'confirmed',
            }),
        ],
        ruleDetails: [
            createFacetEntry({
                facet: 'rule',
                title: '施法追踪',
                summary: '公开施法会留下可追踪痕迹。',
            }),
        ],
        constraintDetails: [
            createFacetEntry({
                facet: 'constraint',
                title: '婚约限制',
                summary: '贵族不得公开与平民缔结婚约。',
            }),
        ],
        socialSystemDetails: [],
        culturalPracticeDetails: [],
        historicalEventDetails: [],
        dangerDetails: [],
        entityDetails: [],
        otherWorldDetailDetails: [],
        generatedAt: Date.now(),
        source: 'ai',
    };
}

/**
 * 功能：创建基础语义种子。
 * @returns 语义种子对象
 */
function createSeed(): ChatSemanticSeed {
    return {
        collectedAt: Date.now(),
        characterCore: { characterId: 'char-001' },
        systemPrompt: '你是 Alice。',
        firstMessage: '你好。',
        authorNote: '',
        jailbreak: '',
        instruct: '',
        activeLorebooks: ['book-a'],
        lorebookSeed: [],
        groupMembers: ['Alice', 'Bob'],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'alice',
            displayName: 'Alice',
            aliases: ['A'],
            identity: ['边境调查员'],
            catchphrases: ['先看证据'],
            relationshipAnchors: ['Alice 信任 Bob'],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['黑塔'],
            rules: ['公开施法会留下可追踪痕迹。'],
            hardConstraints: ['贵族不得公开与平民缔结婚约。'],
            entities: ['黑塔'],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'narrative',
            cues: ['简短克制'],
            sourceTrace: [],
        },
        aiSummary: createAiSummary(),
        sourceTrace: [],
    };
}

describe('memory full flow', (): void => {
    beforeEach((): void => {
        hoisted.collectChatSemanticSeedWithAi.mockReset();
        hoisted.searchMock.mockReset();
        hoisted.buildScoredCandidateMock.mockReset();
        hoisted.buildScoredCandidateMock.mockImplementation((_context: unknown, params: Record<string, unknown>): Record<string, unknown> => ({
            ...params,
            reasonCodes: params.extraReasonCodes ?? [],
            finalScore: 0.86,
            selected: false,
        }));
    });

    it('会串起冷启动初始化、AI 摘要合并、语义种子建卡与召回候选生成', async (): Promise<void> => {
        const originalSeed = createSeed();
        const mergedSeed = mergeAiSummary(originalSeed, createAiSummary());
        const selectedLorebooks: ColdStartLorebookSelection = { books: ['book-a'], entries: [] };
        const callOrder: string[] = [];
        const persistedState: {
            semanticSeed: ChatSemanticSeed | null;
            coldStartFingerprint: string | null;
            coldStartStage: ColdStartStage | null;
            bootstrapState: 'bootstrapping' | 'ready' | 'failed';
            bootstrapRequestId: string | null;
            selectedLorebooks: ColdStartLorebookSelection;
            skipped: boolean;
        } = {
            semanticSeed: null,
            coldStartFingerprint: null,
            coldStartStage: null,
            bootstrapState: 'bootstrapping',
            bootstrapRequestId: 'bootstrap-001',
            selectedLorebooks: { books: [], entries: [] },
            skipped: false,
        };
        const cacheState = {
            semanticSeed: null as ChatSemanticSeed | null,
            coldStartFingerprint: null as string | null,
            coldStartStage: null as ColdStartStage | null,
            selectedLorebooks: { books: [], entries: [] } as ColdStartLorebookSelection,
            skipped: false,
        };

        hoisted.collectChatSemanticSeedWithAi.mockResolvedValue({
            seed: mergedSeed,
            fingerprint: 'fp-full-001',
            bindingFingerprint: 'group-a|char-001',
        });

        const fakeThis = {
            chatKey_: 'chat-full-001',
            chatStateManager: {
                reload: vi.fn(async () => {
                    callOrder.push('reload');
                }),
                getColdStartBootstrapStatus: vi.fn(async () => ({
                    state: persistedState.bootstrapState,
                    requestId: persistedState.bootstrapRequestId,
                    updatedAt: Date.now(),
                    error: null,
                    fingerprint: persistedState.coldStartFingerprint,
                    stage: persistedState.coldStartStage,
                })),
                getSemanticSeed: vi.fn(async () => persistedState.semanticSeed),
                getColdStartFingerprint: vi.fn(async () => persistedState.coldStartFingerprint),
                getColdStartLorebookSelection: vi.fn(async () => persistedState.selectedLorebooks),
                isColdStartLorebookSelectionSkipped: vi.fn(async () => persistedState.skipped),
                setCharacterBindingFingerprint: vi.fn(async () => {
                    callOrder.push('set-binding');
                }),
                saveSemanticSeed: vi.fn(async (seed: ChatSemanticSeed, fingerprint: string) => {
                    callOrder.push('save-seed');
                    cacheState.semanticSeed = seed;
                    cacheState.coldStartFingerprint = fingerprint;
                    cacheState.coldStartStage = 'seeded';
                }),
                markColdStartStage: vi.fn(async (stage: ColdStartStage, fingerprint: string) => {
                    callOrder.push(`mark-stage:${stage}`);
                    if (cacheState.coldStartFingerprint === fingerprint) {
                        cacheState.coldStartStage = stage;
                    }
                }),
                completeColdStartBootstrap: vi.fn(async (requestId: string, fingerprint: string) => {
                    callOrder.push(`complete-bootstrap:${requestId}`);
                    persistedState.bootstrapState = 'ready';
                    persistedState.bootstrapRequestId = requestId;
                    persistedState.coldStartFingerprint = fingerprint;
                }),
                failColdStartBootstrap: vi.fn(async (requestId: string | null, reason: string) => {
                    callOrder.push(`fail-bootstrap:${requestId ?? 'null'}:${reason}`);
                    persistedState.bootstrapState = 'failed';
                }),
                flush: vi.fn(async () => {
                    callOrder.push('flush');
                    persistedState.semanticSeed = cacheState.semanticSeed;
                    persistedState.coldStartFingerprint = cacheState.coldStartFingerprint;
                    persistedState.coldStartStage = cacheState.coldStartStage;
                    persistedState.selectedLorebooks = cacheState.selectedLorebooks;
                    persistedState.skipped = cacheState.skipped;
                }),
            },
            resolveColdStartLorebookSelection: vi.fn(async () => selectedLorebooks),
            persistSemanticSeed: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string) => {
                callOrder.push(`persist:${reason}`);
            }),
            saveSemanticSeedMemoryCards: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string) => {
                callOrder.push(`seed-cards:${reason}`);
            }),
        };

        const performBootstrap = (MemorySDKImpl.prototype as unknown as {
            performBootstrapSemanticSeedIfNeeded: () => Promise<void>;
        }).performBootstrapSemanticSeedIfNeeded;
        await performBootstrap.call(fakeThis);

        expect(hoisted.collectChatSemanticSeedWithAi).toHaveBeenCalledTimes(1);
        expect(fakeThis.persistSemanticSeed).toHaveBeenCalledWith(mergedSeed, 'fp-full-001', 'bootstrap_init');
        expect(fakeThis.saveSemanticSeedMemoryCards).toHaveBeenCalledWith(mergedSeed, 'fp-full-001', 'bootstrap_init');
        expect(persistedState.semanticSeed?.aiSummary?.worldSummary).toContain('黑塔');
        expect(persistedState.coldStartStage).toBe('prompt_primed');
        expect(callOrder).toEqual([
            'reload',
            'set-binding',
            'persist:bootstrap_init',
            'seed-cards:bootstrap_init',
            'save-seed',
            'mark-stage:prompt_primed',
            'complete-bootstrap:bootstrap-001',
            'flush',
        ]);

        const drafts = buildMemoryCardDraftsFromSemanticSeed(mergedSeed, {
            fingerprint: 'fp-full-001',
            reason: 'bootstrap_init',
        });
        const ruleCard = drafts.find((item) => item.lane === 'rule' && item.memoryText.includes('公开施法'));
        const relationshipCard = drafts.find((item) => item.lane === 'relationship');

        printFlowResult('冷启动阶段结果', {
            coldStartStage: persistedState.coldStartStage,
            callOrder,
            worldSummary: persistedState.semanticSeed?.aiSummary?.worldSummary ?? '',
        });
        printFlowResult('生成的冷启动卡片', drafts.map((item) => ({
            lane: item.lane,
            subject: item.subject,
            title: item.title,
            memoryText: item.memoryText,
        })));

        expect(drafts.length).toBeGreaterThan(0);
        expect(ruleCard).toBeTruthy();
        expect(relationshipCard).toBeTruthy();

        hoisted.searchMock.mockResolvedValue([
            {
                cardId: 'seed-card-rule-001',
                content: ruleCard?.memoryText,
                score: 0.93,
                metadata: {
                    sourceRecordKind: 'semantic_seed',
                    sourceRecordKey: 'semantic_seed:active',
                    memoryType: 'rule',
                    sourceScope: 'world',
                    participantActorKeys: [],
                },
                createdAt: Date.now(),
            },
        ]);

        const candidates = await collectMemoryCardRecallCandidates({
            chatKey: 'chat-full-001',
            query: '这个世界里公开施法会有什么后果？',
            vectorGate: {
                enabled: true,
                lanes: ['rule', 'relationship'],
            },
            plan: {
                sections: ['SUMMARY', 'FACTS'],
                fineTopK: 8,
            },
        } as never);

        printFlowResult('召回候选结果', candidates.map((item: Record<string, unknown>) => ({
            recordKind: item.recordKind,
            source: item.source,
            score: item.finalScore,
            rawText: item.rawText,
            reasonCodes: item.reasonCodes,
        })));

        expect(candidates.length).toBe(1);
        expect((hoisted.buildScoredCandidateMock.mock.calls[0]?.[1] as Record<string, unknown>).recordKind).toBe('state');
        expect((hoisted.buildScoredCandidateMock.mock.calls[0]?.[1] as Record<string, unknown>).rawText).toContain('公开施法');
        expect((hoisted.buildScoredCandidateMock.mock.calls[0]?.[1] as Record<string, unknown>).extraReasonCodes).toEqual([
            'memory_card_hit',
            'memory_card_seed_hit',
        ]);
    });
});
