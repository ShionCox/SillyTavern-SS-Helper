import { afterEach, describe, expect, it } from 'vitest';
import { applyMemoryFilterSettings, resetMemoryFilterSettings } from '../src/memory-filter';
import { DreamWaveRecallService } from '../src/services/dream-wave-recall-service';

describe('MemoryFilter 梦境召回接入', (): void => {
    afterEach((): void => {
        resetMemoryFilterSettings();
    });

    it('梦境召回的 sourceQuery 通过 filterMemoryMessages 过滤', async (): Promise<void> => {
        applyMemoryFilterSettings({ enabled: true, mode: 'xml' });
        const service = new DreamWaveRecallService({
            chatKey: 'chat-key',
            repository: createRepositoryStub(),
            readRecentMessages: async () => [
                { role: 'user', content: '<game>梦境主线</game>', turnIndex: 1 },
                { role: 'assistant', content: '<summary>梦境参考</summary>', turnIndex: 2 },
                { role: 'assistant', content: '<think>梦境排除</think>', turnIndex: 3 },
            ],
        });

        const result = await service.buildRecallBundle();
        const sourceQuery = result.recall.diagnostics.sourceQuery;

        expect(sourceQuery).toContain('梦境主线');
        expect(sourceQuery).toContain('梦境参考');
        expect(sourceQuery).not.toContain('梦境排除');
    });
});

function createRepositoryStub(): never {
    return {
        listEntries: async () => [],
        listRoleMemories: async () => [],
        listRelationships: async () => [],
        listSummarySnapshots: async () => [],
        getWorldProfileBinding: async () => null,
        putWorldProfileBinding: async (input: Record<string, unknown>) => ({
            profileId: 'urban-modern',
            updatedAt: Date.now(),
            sourceHash: '',
            ...input,
        }),
        appendMutationHistory: async () => undefined,
        getWorldStrategyState: async () => null,
    } as never;
}
