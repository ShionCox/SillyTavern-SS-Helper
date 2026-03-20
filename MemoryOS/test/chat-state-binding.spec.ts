import { describe, expect, it, vi } from 'vitest';
import { ChatStateManager } from '../src/core/chat-state-manager';

describe('chat-state binding fingerprint', (): void => {
    it('绑定指纹从缺失补全时不会清空冷启动状态', async (): Promise<void> => {
        const state: Record<string, unknown> = {
            characterBindingFingerprint: '-|42',
            coldStartFingerprint: 'fp-001',
            coldStartStage: 'prompt_primed',
            semanticSeed: { collectedAt: 1 },
            memoryLifecycleIndex: {},
            groupMemory: {},
        };
        const fakeThis = {
            chatKey: 'chat-001',
            load: vi.fn(async () => state),
            recordLifecycleMutation: vi.fn(async () => undefined),
            markDirty: vi.fn(),
            parseCharacterBindingFingerprint: (ChatStateManager.prototype as any).parseCharacterBindingFingerprint,
            shouldResetColdStartStateForBindingChange: (ChatStateManager.prototype as any).shouldResetColdStartStateForBindingChange,
        };

        const setBinding = (ChatStateManager.prototype as any).setCharacterBindingFingerprint as (fingerprint: string) => Promise<void>;
        await setBinding.call(fakeThis, 'group-a|42');

        expect(state.coldStartFingerprint).toBe('fp-001');
        expect(state.coldStartStage).toBe('prompt_primed');
        expect(state.semanticSeed).not.toBeUndefined();
    });

    it('明确切换到不同角色时会清空冷启动状态', async (): Promise<void> => {
        const state: Record<string, unknown> = {
            characterBindingFingerprint: 'group-a|42',
            coldStartFingerprint: 'fp-001',
            coldStartStage: 'prompt_primed',
            semanticSeed: { collectedAt: 1 },
            memoryLifecycleIndex: {},
            groupMemory: {},
        };
        const fakeThis = {
            chatKey: 'chat-001',
            load: vi.fn(async () => state),
            recordLifecycleMutation: vi.fn(async () => undefined),
            markDirty: vi.fn(),
            parseCharacterBindingFingerprint: (ChatStateManager.prototype as any).parseCharacterBindingFingerprint,
            shouldResetColdStartStateForBindingChange: (ChatStateManager.prototype as any).shouldResetColdStartStateForBindingChange,
        };

        const setBinding = (ChatStateManager.prototype as any).setCharacterBindingFingerprint as (fingerprint: string) => Promise<void>;
        await setBinding.call(fakeThis, 'group-a|43');

        expect(state.coldStartFingerprint).toBeUndefined();
        expect(state.coldStartStage).toBeUndefined();
        expect(state.semanticSeed).toBeUndefined();
    });
});
