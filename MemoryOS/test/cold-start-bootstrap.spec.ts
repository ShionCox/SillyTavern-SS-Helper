import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    ChatSemanticSeed,
    ColdStartBootstrapStatus,
    ColdStartLorebookSelection,
    ColdStartStage,
} from '../src/types/chat-state';

const { collectChatSemanticSeedWithAi } = vi.hoisted(() => ({
    collectChatSemanticSeedWithAi: vi.fn(),
}));

vi.mock('../src/core/chat-semantic-bootstrap', () => ({
    collectChatSemanticSeedWithAi,
}));

import { MemorySDKImpl } from '../src/sdk/memory-sdk';

/**
 * 功能：构造用于冷启动测试的语义种子。
 * @param 无。
 * @returns 语义种子样本。
 */
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

/**
 * 功能：构造冷启动状态快照。
 * @param state 状态值。
 * @param requestId 请求标识。
 * @param fingerprint 指纹。
 * @param stage 冷启动阶段。
 * @param error 失败原因。
 * @returns 冷启动状态快照。
 */
function buildBootstrapStatus(
    state: ColdStartBootstrapStatus['state'],
    requestId: string | null,
    fingerprint: string | null = null,
    stage: ColdStartStage | null = null,
    error: string | null = null,
): ColdStartBootstrapStatus {
    return {
        state,
        requestId,
        updatedAt: Date.now(),
        error,
        fingerprint,
        stage,
    };
}

describe('cold-start bootstrap persistence', (): void => {
    beforeEach((): void => {
        collectChatSemanticSeedWithAi.mockReset();
    });

    it('执行器只会处理已登记的冷启动任务，并在成功后进入 ready', async (): Promise<void> => {
        const seed = buildSeed();
        const selectedLorebooks: ColdStartLorebookSelection = { books: ['book-a'], entries: [] };
        const callOrder: string[] = [];
        const persistedState = {
            status: buildBootstrapStatus('bootstrapping', 'req-001'),
            selectedLorebooks,
            skipped: false,
            bindingFingerprint: null as string | null,
            semanticSeed: null as ChatSemanticSeed | null,
            coldStartFingerprint: null as string | null,
            coldStartStage: null as ColdStartStage | null,
        };

        collectChatSemanticSeedWithAi.mockResolvedValue({
            seed,
            fingerprint: 'fp-001',
            bindingFingerprint: 'binding-001',
        });

        const fakeThis = {
            chatKey_: 'chat-001',
            chatStateManager: {
                reload: vi.fn(async (): Promise<typeof persistedState> => persistedState),
                getColdStartBootstrapStatus: vi.fn(async (): Promise<ColdStartBootstrapStatus> => persistedState.status),
                getColdStartLorebookSelection: vi.fn(async (): Promise<ColdStartLorebookSelection> => persistedState.selectedLorebooks),
                isColdStartLorebookSelectionSkipped: vi.fn(async (): Promise<boolean> => persistedState.skipped),
                setCharacterBindingFingerprint: vi.fn(async (fingerprint: string): Promise<void> => {
                    callOrder.push('set-binding');
                    persistedState.bindingFingerprint = fingerprint;
                }),
                saveSemanticSeed: vi.fn(async (nextSeed: ChatSemanticSeed, fingerprint: string): Promise<void> => {
                    callOrder.push('save-seed');
                    persistedState.semanticSeed = nextSeed;
                    persistedState.coldStartFingerprint = fingerprint;
                    persistedState.coldStartStage = 'seeded';
                    persistedState.status = buildBootstrapStatus('ready', null, fingerprint, 'seeded');
                }),
                markColdStartStage: vi.fn(async (stage: ColdStartStage, fingerprint: string): Promise<void> => {
                    callOrder.push(`mark-stage:${stage}`);
                    persistedState.coldStartFingerprint = fingerprint;
                    persistedState.coldStartStage = stage;
                    persistedState.status = buildBootstrapStatus('ready', null, fingerprint, stage);
                }),
                completeColdStartBootstrap: vi.fn(async (requestId: string, fingerprint: string): Promise<ColdStartBootstrapStatus> => {
                    callOrder.push(`complete:${requestId}`);
                    persistedState.status = buildBootstrapStatus('ready', null, fingerprint, persistedState.coldStartStage);
                    return persistedState.status;
                }),
                failColdStartBootstrap: vi.fn(async (_requestId: string | null, reason: string): Promise<ColdStartBootstrapStatus> => {
                    callOrder.push(`fail:${reason}`);
                    persistedState.status = buildBootstrapStatus('failed', 'req-001', null, null, reason);
                    return persistedState.status;
                }),
                flush: vi.fn(async (): Promise<void> => {
                    callOrder.push('flush');
                }),
            },
            persistSemanticSeed: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string): Promise<void> => {
                callOrder.push(`persist:${reason}`);
            }),
            saveSemanticSeedMemoryCards: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string): Promise<void> => {
                callOrder.push(`seed-cards:${reason}`);
            }),
        };

        const performBootstrap = (MemorySDKImpl.prototype as unknown as {
            performBootstrapSemanticSeedIfNeeded: () => Promise<void>;
        }).performBootstrapSemanticSeedIfNeeded;

        await performBootstrap.call(fakeThis);
        await performBootstrap.call(fakeThis);

        expect(collectChatSemanticSeedWithAi).toHaveBeenCalledTimes(1);
        expect(fakeThis.persistSemanticSeed).toHaveBeenCalledWith(seed, 'fp-001', 'bootstrap_init');
        expect(fakeThis.saveSemanticSeedMemoryCards).toHaveBeenCalledWith(seed, 'fp-001', 'bootstrap_init');
        expect(fakeThis.chatStateManager.completeColdStartBootstrap).toHaveBeenCalledWith('req-001', 'fp-001');
        expect(persistedState.status.state).toBe('ready');
        expect(persistedState.coldStartStage).toBe('prompt_primed');
        expect(callOrder).toEqual([
            'set-binding',
            'persist:bootstrap_init',
            'seed-cards:bootstrap_init',
            'save-seed',
            'mark-stage:prompt_primed',
            'complete:req-001',
            'flush',
        ]);
    });

    it('prompt prime 只有在冷启动状态 ready 时才会执行', async (): Promise<void> => {
        const seed = buildSeed();
        const callOrder: string[] = [];
        const fakeThis = {
            chatKey_: 'chat-001',
            chatStateManager: {
                isChatArchived: vi.fn(async (): Promise<boolean> => false),
                getColdStartBootstrapStatus: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('ready', null, 'fp-001', 'seeded')),
                getSemanticSeed: vi.fn(async (): Promise<ChatSemanticSeed> => seed),
                getColdStartFingerprint: vi.fn(async (): Promise<string> => 'fp-001'),
                getColdStartStage: vi.fn(async (): Promise<ColdStartStage> => 'seeded'),
                markColdStartStage: vi.fn(async (): Promise<void> => {
                    callOrder.push('mark-stage');
                }),
            },
            persistSemanticSeed: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string): Promise<void> => {
                callOrder.push(`persist:${reason}`);
            }),
            saveSemanticSeedMemoryCards: vi.fn(async (_seed: ChatSemanticSeed, _fingerprint: string, reason: string): Promise<void> => {
                callOrder.push(`seed-cards:${reason}`);
            }),
            runColdStartPrimeTask: vi.fn(async (_kind: 'prompt' | 'extract', task: () => Promise<boolean>): Promise<boolean> => task()),
        };

        const primePrompt = (MemorySDKImpl.prototype as unknown as {
            primeColdStartPrompt: (reason: string) => Promise<boolean>;
        }).primeColdStartPrompt;
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

    it('缓存落后于持久化状态时不会重新触发冷启动执行', async (): Promise<void> => {
        const persistedSeed = buildSeed();
        const persistedStatus = buildBootstrapStatus('ready', null, 'fp-001', 'prompt_primed');

        const fakeThis = {
            chatKey_: 'chat-001',
            chatStateManager: {
                reload: vi.fn(async (): Promise<{ status: ColdStartBootstrapStatus }> => ({ status: persistedStatus })),
                getColdStartBootstrapStatus: vi.fn(async (): Promise<ColdStartBootstrapStatus> => persistedStatus),
                getColdStartLorebookSelection: vi.fn(async (): Promise<ColdStartLorebookSelection> => ({ books: [], entries: [] })),
                isColdStartLorebookSelectionSkipped: vi.fn(async (): Promise<boolean> => false),
                getSemanticSeed: vi.fn(async (): Promise<ChatSemanticSeed> => persistedSeed),
                getColdStartFingerprint: vi.fn(async (): Promise<string> => 'fp-001'),
                failColdStartBootstrap: vi.fn(async (_requestId: string | null, reason: string): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('failed', null, null, null, reason)),
            },
            persistSemanticSeed: vi.fn(async (): Promise<void> => undefined),
            saveSemanticSeedMemoryCards: vi.fn(async (): Promise<void> => undefined),
        };

        const performBootstrap = (MemorySDKImpl.prototype as unknown as {
            performBootstrapSemanticSeedIfNeeded: () => Promise<void>;
        }).performBootstrapSemanticSeedIfNeeded;

        await performBootstrap.call(fakeThis);

        expect(fakeThis.chatStateManager.reload).toHaveBeenCalledTimes(1);
        expect(fakeThis.chatStateManager.getColdStartBootstrapStatus).toHaveBeenCalledTimes(1);
        expect(collectChatSemanticSeedWithAi).not.toHaveBeenCalled();
        expect(fakeThis.persistSemanticSeed).not.toHaveBeenCalled();
        expect(fakeThis.saveSemanticSeedMemoryCards).not.toHaveBeenCalled();
    });
});
