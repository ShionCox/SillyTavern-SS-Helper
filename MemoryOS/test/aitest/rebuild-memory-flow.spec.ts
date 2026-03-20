import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSemanticSeed } from '../../src/types/chat-state';

const hoisted = vi.hoisted(() => ({
    clearMock: vi.fn(),
    saveMemoryCardsFromSemanticSeedMock: vi.fn(),
}));

vi.mock('../../src/vector/vector-manager', () => ({
    VectorManager: class {
        public async clear(): Promise<void> {
            await hoisted.clearMock();
        }
    },
}));

vi.mock('../../src/core/memory-card-store', async () => {
    const actual = await vi.importActual<typeof import('../../src/core/memory-card-store')>('../../src/core/memory-card-store');
    return {
        ...actual,
        saveMemoryCardsFromSemanticSeed: hoisted.saveMemoryCardsFromSemanticSeedMock,
    };
});

vi.mock('../../src/db/db', () => ({
    db: {
        facts: {
            where() {
                return {
                    between() {
                        return {
                            reverse() {
                                return {
                                    toArray: async (): Promise<unknown[]> => [],
                                };
                            },
                        };
                    },
                };
            },
        },
        summaries: {
            where() {
                return {
                    between() {
                        return {
                            reverse() {
                                return {
                                    toArray: async (): Promise<unknown[]> => [],
                                };
                            },
                        };
                    },
                };
            },
        },
    },
}));

import { ChatStateManager } from '../../src/core/chat-state-manager';

/**
 * 功能：创建重建测试所需的语义种子。
 * @returns 语义种子对象。
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
        groupMembers: ['Alice'],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'alice',
            displayName: 'Alice',
            aliases: [],
            identity: ['调查员'],
            catchphrases: [],
            relationshipAnchors: [],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['黑塔'],
            rules: ['公开施法会留下可追踪痕迹。'],
            hardConstraints: [],
            entities: ['黑塔'],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'narrative',
            cues: ['简短克制'],
            sourceTrace: [],
        },
        aiSummary: {
            roleSummary: 'Alice 是调查员。',
            worldSummary: '公开施法会留下可追踪痕迹。',
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

describe('rebuild memory flow', (): void => {
    beforeEach((): void => {
        hoisted.clearMock.mockReset();
        hoisted.saveMemoryCardsFromSemanticSeedMock.mockReset();
        hoisted.saveMemoryCardsFromSemanticSeedMock.mockResolvedValue([
            { cardId: 'seed-card-001' },
            { cardId: 'seed-card-002' },
        ]);
    });

    it('重建记忆卡索引时会把 semantic seed 一起重建进去', async (): Promise<void> => {
        const state = {
            semanticSeed: createSeed(),
            coldStartFingerprint: 'fp-rebuild-001',
            vectorIndexVersion: undefined as string | undefined,
            vectorMetadataRebuiltAt: undefined as number | undefined,
        };
        const fakeThis = {
            chatKey: 'chat-rebuild-001',
            indexMemoryCardRecord: vi.fn(async () => []),
            load: vi.fn(async () => state),
            markDirty: vi.fn(),
        };

        const rebuildMemoryCardIndex = (ChatStateManager.prototype as any).rebuildMemoryCardIndex as () => Promise<number>;
        const rebuiltCount = await rebuildMemoryCardIndex.call(fakeThis);

        expect(hoisted.clearMock).toHaveBeenCalledTimes(1);
        expect(hoisted.saveMemoryCardsFromSemanticSeedMock).toHaveBeenCalledWith(
            'chat-rebuild-001',
            state.semanticSeed,
            'fp-rebuild-001',
            'maintenance_memory_card_rebuild',
        );
        expect(rebuiltCount).toBe(2);
        expect(state.vectorIndexVersion).toBe('memory_card_v1');
        expect(typeof state.vectorMetadataRebuiltAt).toBe('number');
        expect(fakeThis.markDirty).toHaveBeenCalledTimes(1);
    });
});
