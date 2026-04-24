import { afterEach, describe, expect, it, vi } from 'vitest';

const runSummaryOrchestratorMock = vi.hoisted(() => vi.fn());

vi.mock('../src/memory-summary', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/memory-summary')>();
    return {
        ...actual,
        readMemoryLLMApi: vi.fn(() => null),
        runSummaryOrchestrator: runSummaryOrchestratorMock,
    };
});

import { applyMemoryFilterSettings, resetMemoryFilterSettings } from '../src/memory-filter';
import { SummaryService } from '../src/services/summary-service';

describe('MemoryFilter 自动总结接入', (): void => {
    afterEach((): void => {
        runSummaryOrchestratorMock.mockReset();
        resetMemoryFilterSettings();
    });

    it('自动总结通过 filterMemoryMessages 取得送模内容', async (): Promise<void> => {
        applyMemoryFilterSettings({ enabled: true, mode: 'xml' });
        runSummaryOrchestratorMock.mockResolvedValueOnce({ snapshot: null, diagnostics: {} });

        const service = new SummaryService('chat-key', createRepositoryStub());
        await service.captureSummaryFromChat({
            messages: [
                { role: 'user', content: '<game>总结主线</game>', turnIndex: 1 },
                { role: 'assistant', content: '<summary>总结参考</summary>', turnIndex: 2 },
                { role: 'assistant', content: '<think>总结排除</think>', turnIndex: 3 },
            ],
        });

        const input = runSummaryOrchestratorMock.mock.calls[0]?.[0];
        expect(input.messages.map((message: { content?: string }) => message.content)).toEqual(['总结主线']);
        expect(input.windowOptions.auxiliaryContextText).toContain('总结参考');
        expect(JSON.stringify(input)).not.toContain('总结排除');
    });
});

function createRepositoryStub(): never {
    return {
        ensureActorProfile: vi.fn(),
        listEntries: vi.fn(),
        listRoleMemories: vi.fn(),
        listSummarySnapshots: vi.fn(),
        getWorldProfileBinding: vi.fn(),
        getTimelineProfile: vi.fn(),
        putTimelineProfile: vi.fn(),
        appendMutationHistory: vi.fn(),
        getEntry: vi.fn(),
        applySummarySnapshot: vi.fn(),
        deleteEntry: vi.fn(),
    } as never;
}
