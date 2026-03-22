import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSemanticSeed } from '../../src/types/chat-state';

const mockedState = vi.hoisted(() => ({
    memoryCards: [] as Array<Record<string, any>>,
    embeddingRows: [] as Array<{ cardId: string; chatKey: string }>,
    upsertCalls: [] as string[][],
    deleteCalls: [] as string[][],
}));

vi.mock('../../src/db/db', () => {
    const memory_cards = {
        where(index: string) {
            if (index === '[chatKey+status]') {
                return {
                    equals([chatKey, status]: [string, string]) {
                        return {
                            toArray: async (): Promise<Array<Record<string, any>>> => mockedState.memoryCards.filter((card) => card.chatKey === chatKey && card.status === status),
                        };
                    },
                };
            }
            if (index === '[chatKey+sourceRecordKey]') {
                return {
                    equals([chatKey, recordKey]: [string, string]) {
                        return {
                            toArray: async (): Promise<Array<Record<string, any>>> => mockedState.memoryCards.filter((card) => {
                                return card.chatKey === chatKey && card.sourceRecordKey === recordKey;
                            }),
                        };
                    },
                };
            }
            if (index === 'sourceRecordKey') {
                return {
                    equals(recordKey: string) {
                        return {
                            toArray: async (): Promise<Array<Record<string, any>>> => mockedState.memoryCards.filter((card) => card.sourceRecordKey === recordKey),
                        };
                    },
                };
            }
            throw new Error(`未支持的 memory_cards 索引：${index}`);
        },
        async bulkPut(cards: Array<Record<string, any>>): Promise<void> {
            for (const card of cards) {
                const index = mockedState.memoryCards.findIndex((item) => item.cardId === card.cardId);
                if (index >= 0) {
                    mockedState.memoryCards[index] = { ...mockedState.memoryCards[index], ...card };
                } else {
                    mockedState.memoryCards.push({ ...card });
                }
            }
        },
        async bulkDelete(cardIds: string[]): Promise<void> {
            mockedState.memoryCards = mockedState.memoryCards.filter((card) => !cardIds.includes(card.cardId));
        },
    };

    const memory_card_embeddings = {
        where(index: string) {
            if (index === 'cardId') {
                return {
                    anyOf(cardIds: string[]) {
                        return {
                            delete: async (): Promise<void> => {
                                mockedState.embeddingRows = mockedState.embeddingRows.filter((item) => !cardIds.includes(item.cardId));
                            },
                        };
                    },
                };
            }
            throw new Error(`未支持的 embedding 索引：${index}`);
        },
    };

    return {
        db: {
            memory_cards,
            memory_card_embeddings,
            facts: {},
            summaries: {},
        },
    };
});

vi.mock('../../src/vector/vector-manager', () => ({
    VectorManager: class {
        public async upsertMemoryCardEmbeddings(cards: Array<Record<string, any>>): Promise<void> {
            mockedState.upsertCalls.push(cards.map((item) => String(item.cardId)));
            for (const card of cards) {
                if (!mockedState.embeddingRows.some((item) => item.cardId === card.cardId)) {
                    mockedState.embeddingRows.push({
                        cardId: String(card.cardId),
                        chatKey: String(card.chatKey),
                    });
                }
            }
        }

        public async deleteMemoryCardEmbeddings(cardIds: string[]): Promise<void> {
            mockedState.deleteCalls.push([...cardIds]);
            mockedState.embeddingRows = mockedState.embeddingRows.filter((item) => !cardIds.includes(item.cardId));
        }
    },
}));

import { saveMemoryCardsFromSemanticSeed } from '../../src/core/memory-card-store';

/**
 * 功能：创建可用于冷启动卡保存测试的语义种子。
 * @param overrides 需要覆盖的字段。
 * @returns 语义种子对象。
 */
function createSeed(overrides: Partial<ChatSemanticSeed['worldSeed']> = {}): ChatSemanticSeed {
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
            identity: ['冷静克制的调查员'],
            catchphrases: ['先看证据'],
            relationshipAnchors: ['Alice 信任 Bob'],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['黑塔'],
            rules: ['公开施法会留下可追踪痕迹。', ...(overrides.rules ?? [])],
            hardConstraints: ['贵族不得公开与平民缔结婚约。'],
            entities: ['黑塔'],
            sourceTrace: [],
            ...overrides,
        },
        styleSeed: {
            mode: 'narrative',
            cues: ['简短克制'],
            sourceTrace: [],
        },
        aiSummary: {
            roleSummary: 'Alice 是一名冷静克制的调查员。',
            worldSummary: '这个世界公开施法会留下可追踪痕迹。',
            identityFacts: [],
            worldRules: [],
            hardConstraints: [],
            cities: [],
            locations: [],
            entities: [],
            nations: [],
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
            relationshipFacts: [],
            catchphrases: [],
            relationshipAnchors: [],
            styleCues: [],
            nationDetails: [],
            regionDetails: [],
            cityDetails: [],
            locationDetails: [],
            ruleDetails: [],
            constraintDetails: [],
            socialSystemDetails: [],
            culturalPracticeDetails: [],
            historicalEventDetails: [],
            dangerDetails: [],
            entityDetails: [],
            otherWorldDetailDetails: [],
            generatedAt: Date.now(),
            source: 'ai',
        },
        sourceTrace: [],
    };
}

describe('memory persistence flow', (): void => {
    beforeEach((): void => {
        mockedState.memoryCards = [];
        mockedState.embeddingRows = [];
        mockedState.upsertCalls = [];
        mockedState.deleteCalls = [];
    });

    it('会保存冷启动卡，并在种子变更时清理旧卡与旧 embedding', async (): Promise<void> => {
        const firstSeed = createSeed();
        const firstCards = await saveMemoryCardsFromSemanticSeed('chat-persist-001', firstSeed, 'fp-001', 'bootstrap_init');

        expect(firstCards.length).toBeGreaterThan(0);
        expect(mockedState.upsertCalls.length).toBe(1);
        const firstActiveCards = mockedState.memoryCards.filter((card) => card.chatKey === 'chat-persist-001' && card.status === 'active');
        expect(firstActiveCards.length).toBe(firstCards.length);
        expect(mockedState.embeddingRows.length).toBe(firstCards.length);

        const secondSeed = createSeed({
            rules: ['未经许可不得进入黑塔档案区。'],
            locations: ['黑塔', '白露城'],
        });
        const secondCards = await saveMemoryCardsFromSemanticSeed('chat-persist-001', secondSeed, 'fp-002', 'editor_refresh');

        expect(secondCards.length).toBeGreaterThan(0);
        expect(mockedState.upsertCalls.length).toBe(2);
        expect(mockedState.deleteCalls.length).toBeGreaterThan(0);

        const remainingActiveCards = mockedState.memoryCards.filter((card) => card.chatKey === 'chat-persist-001' && card.status === 'active');
        const activeCardIds = new Set(remainingActiveCards.map((item) => String(item.cardId)));
        expect(remainingActiveCards.length).toBeGreaterThan(0);
        expect(remainingActiveCards.some((card) => String(card.memoryText).includes('未经许可不得进入黑塔档案区'))).toBe(true);
        expect(remainingActiveCards.some((card) => String(card.memoryText).includes('公开施法会留下可追踪痕迹') && !secondCards.some((item) => String(item.memoryText).includes('公开施法会留下可追踪痕迹')))).toBe(false);
        expect(new Set(mockedState.embeddingRows.map((item) => item.cardId))).toEqual(activeCardIds);
    });
});
