import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSemanticSeed, ColdStartLorebookSelection, ColdStartStage } from '../src/types/chat-state';

const { collectChatSemanticSeedWithAi } = vi.hoisted(() => ({
    collectChatSemanticSeedWithAi: vi.fn(),
}));

vi.mock('../src/core/chat-semantic-bootstrap', () => ({
    collectChatSemanticSeedWithAi,
}));

vi.mock('../src/ui/index', () => ({
    openWorldbookInitPanel: vi.fn(),
}));

import { MemorySDKImpl } from '../src/sdk/memory-sdk';

function buildSeed(): ChatSemanticSeed {
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
        groupMembers: [],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'alice',
            displayName: 'Alice',
            aliases: [],
            identity: ['冒险者'],
            catchphrases: [],
            relationshipAnchors: [],
            sourceTrace: [],
        },
        worldSeed: {
            locations: ['白露城'],
            rules: ['不能擅闯内城'],
            hardConstraints: ['不能离开边境'],
            entities: ['晨星王国'],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'narrative',
            cues: ['第三人称'],
            sourceTrace: [],
        },
        aiSummary: {
            roleSummary: 'Alice 是边境冒险者。',
            worldSummary: '故事发生在晨星王国边境。',
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
            generatedAt: Date.now(),
            source: 'ai',
        },
        sourceTrace: [],
    };
}

describe('cold-start bootstrap persistence', (): void => {
    beforeEach((): void => {
        collectChatSemanticSeedWithAi.mockReset();
    });

    it('会在自动冷启动完成后立即落盘并阻止后续重复初始化', async (): Promise<void> => {
        const seed = buildSeed();
        const selectedLorebooks: ColdStartLorebookSelection = { books: ['book-a'], entries: [] };
        const callOrder: string[] = [];
        const persistedState: {
            semanticSeed: ChatSemanticSeed | null;
            coldStartFingerprint: string | null;
            coldStartStage: ColdStartStage | null;
            selectedLorebooks: ColdStartLorebookSelection;
            skipped: boolean;
            bindingFingerprint: string | null;
        } = {
            semanticSeed: null,
            coldStartFingerprint: null,
            coldStartStage: null,
            selectedLorebooks: { books: [], entries: [] },
            skipped: false,
            bindingFingerprint: null,
        };
        const cacheState = {
            semanticSeed: null as ChatSemanticSeed | null,
            coldStartFingerprint: null as string | null,
            coldStartStage: null as ColdStartStage | null,
            selectedLorebooks: { books: [], entries: [] } as ColdStartLorebookSelection,
            skipped: false,
            bindingFingerprint: null as string | null,
        };

        collectChatSemanticSeedWithAi.mockResolvedValue({
            seed,
            fingerprint: 'fp-001',
            bindingFingerprint: 'binding-001',
        });

        const fakeThis = {
            chatKey_: 'chat-001',
            chatStateManager: {
                getSemanticSeed: vi.fn(async () => persistedState.semanticSeed),
                getColdStartFingerprint: vi.fn(async () => persistedState.coldStartFingerprint),
                getColdStartLorebookSelection: vi.fn(async () => persistedState.selectedLorebooks),
                isColdStartLorebookSelectionSkipped: vi.fn(async () => persistedState.skipped),
                setColdStartLorebookSelection: vi.fn(async (selection: ColdStartLorebookSelection) => {
                    callOrder.push('set-selection');
                    cacheState.selectedLorebooks = selection;
                    cacheState.skipped = false;
                }),
                setColdStartLorebookSelectionSkipped: vi.fn(async (skipped: boolean) => {
                    callOrder.push('set-skip');
                    cacheState.skipped = skipped;
                }),
                setCharacterBindingFingerprint: vi.fn(async (fingerprint: string) => {
                    callOrder.push('set-binding');
                    cacheState.bindingFingerprint = fingerprint;
                }),
                saveSemanticSeed: vi.fn(async (nextSeed: ChatSemanticSeed, fingerprint: string) => {
                    callOrder.push('save-seed');
                    cacheState.semanticSeed = nextSeed;
                    cacheState.coldStartFingerprint = fingerprint;
                    cacheState.coldStartStage = 'seeded';
                }),
                markColdStartStage: vi.fn(async (stage: ColdStartStage, fingerprint: string) => {
                    callOrder.push(`mark-stage:${stage}`);
                    if (cacheState.coldStartFingerprint === fingerprint) {
                        cacheState.coldStartStage = stage;
                    }
                }),
                flush: vi.fn(async () => {
                    callOrder.push('flush');
                    persistedState.semanticSeed = cacheState.semanticSeed;
                    persistedState.coldStartFingerprint = cacheState.coldStartFingerprint;
                    persistedState.coldStartStage = cacheState.coldStartStage;
                    persistedState.selectedLorebooks = cacheState.selectedLorebooks;
                    persistedState.skipped = cacheState.skipped;
                    persistedState.bindingFingerprint = cacheState.bindingFingerprint;
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

        const performBootstrap = (MemorySDKImpl.prototype as any).performBootstrapSemanticSeedIfNeeded as () => Promise<void>;

        await performBootstrap.call(fakeThis);
        await performBootstrap.call(fakeThis);

        expect(collectChatSemanticSeedWithAi).toHaveBeenCalledTimes(1);
        expect(fakeThis.persistSemanticSeed).toHaveBeenCalledTimes(1);
        expect(fakeThis.persistSemanticSeed).toHaveBeenCalledWith(seed, 'fp-001', 'bootstrap_init');
        expect(fakeThis.saveSemanticSeedMemoryCards).toHaveBeenCalledTimes(1);
        expect(fakeThis.saveSemanticSeedMemoryCards).toHaveBeenCalledWith(seed, 'fp-001', 'bootstrap_init');
        expect(fakeThis.chatStateManager.markColdStartStage).toHaveBeenCalledWith('prompt_primed', 'fp-001', expect.any(Object));
        expect(fakeThis.chatStateManager.flush).toHaveBeenCalledTimes(2);
        expect(persistedState.semanticSeed).toEqual(seed);
        expect(persistedState.coldStartFingerprint).toBe('fp-001');
        expect(persistedState.coldStartStage).toBe('prompt_primed');
        expect(callOrder).toEqual([
            'set-selection',
            'flush',
            'set-binding',
            'save-seed',
            'persist:bootstrap_init',
            'seed-cards:bootstrap_init',
            'mark-stage:prompt_primed',
            'flush',
        ]);
    });
    it('prompt prime 会同步写入语义种子记忆卡', async (): Promise<void> => {
        const seed = buildSeed();
        const callOrder: string[] = [];
        const fakeThis = {
            chatKey_: 'chat-001',
            chatStateManager: {
                isChatArchived: vi.fn(async () => false),
                getSemanticSeed: vi.fn(async () => seed),
                getColdStartFingerprint: vi.fn(async () => 'fp-001'),
                getColdStartStage: vi.fn(async () => 'seeded'),
                markColdStartStage: vi.fn(async () => {
                    callOrder.push('mark-stage');
                }),
            },
            persistSemanticSeed: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string) => {
                callOrder.push(`persist:${reason}`);
            }),
            saveSemanticSeedMemoryCards: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string) => {
                callOrder.push(`seed-cards:${reason}`);
            }),
            runColdStartPrimeTask: vi.fn(async (_kind: 'prompt' | 'extract', task: () => Promise<boolean>) => task()),
        };

        const primePrompt = (MemorySDKImpl.prototype as any).primeColdStartPrompt as (reason: string) => Promise<boolean>;
        const result = await primePrompt.call(fakeThis, 'manual_prompt_prime');

        expect(result).toBe(true);
        expect(fakeThis.persistSemanticSeed).toHaveBeenCalledWith(seed, 'fp-001', 'manual_prompt_prime');
        expect(fakeThis.saveSemanticSeedMemoryCards).toHaveBeenCalledWith(seed, 'fp-001', 'manual_prompt_prime');
        expect(callOrder).toEqual([
            'persist:manual_prompt_prime',
            'seed-cards:manual_prompt_prime',
            'mark-stage',
        ]);
    });
});
