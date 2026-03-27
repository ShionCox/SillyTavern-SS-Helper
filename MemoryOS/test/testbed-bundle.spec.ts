import { describe, expect, it } from 'vitest';
import { detectPromptTestBundleMode, normalizePromptTestBundleFromUnknown } from '../testbed/bundle';

function createSnapshot(chatKey: string) {
    return {
        chatKey,
        generatedAt: Date.now(),
        events: [],
        templates: [],
        audit: [],
        meta: null,
        memoryMutationHistory: [],
        memoryEntries: [],
        memoryEntryTypes: [],
        actorMemoryProfiles: [],
        roleEntryMemory: [],
        summarySnapshots: [],
        worldProfileBindings: [],
        pluginState: null,
        pluginRecords: [],
    };
}

describe('testbed bundle normalize', () => {
    it('normalizes wrapped bundle and keeps exact replay metadata', () => {
        const raw = {
            payload: {
                version: '1.0.0',
                exportedAt: 1000,
                sourceChatKey: 'chat::source',
                database: createSnapshot('chat::source'),
                promptFixture: [{ role: 'user', content: 'hello' }],
                query: 'where am i',
                sourceMessageId: 'u-1',
                settings: { contextMaxTokens: 1600 },
                captureMeta: {
                    mode: 'exact_replay',
                    source: 'chat_completion_prompt_ready',
                },
                parityBaseline: {
                    finalPromptText: 'baseline prompt',
                    insertIndex: 1,
                    insertedMemoryBlock: 'memory',
                    reasonCodes: ['a', 'a', 'b'],
                    matchedActorKeys: ['hero'],
                    matchedEntryIds: ['entry-1'],
                },
            },
        };
        const bundle = normalizePromptTestBundleFromUnknown(raw);
        expect(bundle).not.toBeNull();
        expect(bundle?.database.chatKey).toBe('chat::source');
        expect(bundle?.captureMeta?.mode).toBe('exact_replay');
        expect(bundle?.parityBaseline?.reasonCodes).toEqual(['a', 'b']);
        expect(bundle ? detectPromptTestBundleMode(bundle) : 'simulated_prompt').toBe('exact_replay');
    });

    it('supports snapshot-only input and falls back to simulated mode', () => {
        const rawSnapshot = createSnapshot('chat::snapshot');
        const bundle = normalizePromptTestBundleFromUnknown(rawSnapshot, {
            fallbackQuery: 'fallback query',
            fallbackSourceMessageId: 'fallback-msg',
            fallbackSettings: { contextMaxTokens: 900 },
        });
        expect(bundle).not.toBeNull();
        expect(bundle?.database.chatKey).toBe('chat::snapshot');
        expect(bundle?.query).toBe('fallback query');
        expect(bundle?.sourceMessageId).toBe('fallback-msg');
        expect(bundle?.captureMeta?.mode).toBe('simulated_prompt');
    });
});
