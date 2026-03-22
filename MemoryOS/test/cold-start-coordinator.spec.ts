import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemorySDK } from '../../SDK/stx';
import type { ColdStartBootstrapStatus, ColdStartLorebookSelection } from '../src/types/chat-state';

const { openWorldbookInitPanel } = vi.hoisted(() => ({
    openWorldbookInitPanel: vi.fn(),
}));

vi.mock('../src/ui/index', () => ({
    openWorldbookInitPanel,
}));

import { reconcileColdStartBootstrap } from '../src/runtime/coldStartCoordinator';

/**
 * 功能：构造冷启动状态快照。
 * @param state 状态值。
 * @param requestId 请求标识。
 * @returns 冷启动状态快照。
 */
function buildBootstrapStatus(
    state: ColdStartBootstrapStatus['state'],
    requestId: string | null,
): ColdStartBootstrapStatus {
    return {
        state,
        requestId,
        updatedAt: Date.now(),
        error: null,
        fingerprint: null,
        stage: null,
    };
}

describe('cold-start coordinator', (): void => {
    beforeEach((): void => {
        openWorldbookInitPanel.mockReset();
    });

    it('同一聊天重复绑定时只会打开一个冷启动弹窗', async (): Promise<void> => {
        let resolvePanel: ((selection: ColdStartLorebookSelection | null) => void) | null = null;
        openWorldbookInitPanel.mockImplementation(() => new Promise<ColdStartLorebookSelection | null>((resolve): void => {
            resolvePanel = resolve;
        }));

        const memory = {
            getChatKey: (): string => 'chat-001',
            chatState: {
                getColdStartBootstrapStatus: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('selection_required', null)),
                getColdStartLorebookSelection: vi.fn(async (): Promise<ColdStartLorebookSelection> => ({ books: ['book-a'], entries: [] })),
                isColdStartLorebookSelectionSkipped: vi.fn(async (): Promise<boolean> => false),
                beginColdStartBootstrap: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('bootstrapping', 'req-001')),
                bootstrapSemanticSeed: vi.fn(async (): Promise<void> => undefined),
                failColdStartBootstrap: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('failed', null)),
            },
        } as unknown as MemorySDK;

        const firstTask = reconcileColdStartBootstrap(memory, 'chat_bound');
        const secondTask = reconcileColdStartBootstrap(memory, 'chat_bound');
        for (let index = 0; index < 6 && openWorldbookInitPanel.mock.calls.length <= 0; index += 1) {
            await Promise.resolve();
        }

        expect(openWorldbookInitPanel).toHaveBeenCalledTimes(1);
        resolvePanel?.({ books: ['book-a'], entries: [] });
        await Promise.all([firstTask, secondTask]);

        expect(memory.chatState.beginColdStartBootstrap).toHaveBeenCalledTimes(1);
        expect(memory.chatState.bootstrapSemanticSeed).toHaveBeenCalledTimes(1);
        expect(memory.chatState.failColdStartBootstrap).not.toHaveBeenCalled();
    });

    it('冷启动处于 bootstrapping 时不会再次弹窗，只会复用执行任务', async (): Promise<void> => {
        const memory = {
            getChatKey: (): string => 'chat-002',
            chatState: {
                getColdStartBootstrapStatus: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('bootstrapping', 'req-002')),
                getColdStartLorebookSelection: vi.fn(async (): Promise<ColdStartLorebookSelection> => ({ books: [], entries: [] })),
                isColdStartLorebookSelectionSkipped: vi.fn(async (): Promise<boolean> => true),
                beginColdStartBootstrap: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('bootstrapping', 'req-002')),
                bootstrapSemanticSeed: vi.fn(async (): Promise<void> => undefined),
                failColdStartBootstrap: vi.fn(async (): Promise<ColdStartBootstrapStatus> => buildBootstrapStatus('failed', 'req-002')),
            },
        } as unknown as MemorySDK;

        await Promise.all([
            reconcileColdStartBootstrap(memory, 'chat_bound'),
            reconcileColdStartBootstrap(memory, 'chat_bound'),
        ]);

        expect(openWorldbookInitPanel).not.toHaveBeenCalled();
        expect(memory.chatState.bootstrapSemanticSeed).toHaveBeenCalledTimes(1);
    });
});
