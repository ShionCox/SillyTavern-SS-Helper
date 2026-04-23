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

import { applyContentLabSettings, resetContentLabSettings } from '../src/config/content-tag-registry';
import { resetBlockIdCounter } from '../src/memory-takeover/content-block-parser';
import { SummaryService } from '../src/services/summary-service';

describe('SummaryService 内容拆分链路', (): void => {
    afterEach((): void => {
        runSummaryOrchestratorMock.mockReset();
        resetBlockIdCounter();
        resetContentLabSettings();
    });

    it('关闭楼层内容拆分时把原楼层内容传给总结编排器', async (): Promise<void> => {
        runSummaryOrchestratorMock.mockResolvedValueOnce({
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: 'none',
                matchedEntryIds: [],
                worldProfile: 'unknown',
                reasonCode: 'ok',
            },
        });
        const service = new SummaryService('chat-key', createRepositoryStub());

        await service.captureSummaryFromChat({
            messages: [
                { role: 'user', content: '<game>总结主线</game>', turnIndex: 1 },
                { role: 'assistant', content: '<details>总结排除</details>', turnIndex: 2 },
            ],
        });

        const input = runSummaryOrchestratorMock.mock.calls[0]?.[0];
        expect(input.messages.map((message: { content?: string }) => message.content)).toEqual([
            '<game>总结主线</game>',
            '<details>总结排除</details>',
        ]);
        expect(input.windowOptions.auxiliaryContextText).toBe('');
    });

    it('开启楼层内容拆分时只把主正文传给总结编排器，并携带辅助上下文', async (): Promise<void> => {
        applyContentLabSettings({ enableContentSplit: true });
        runSummaryOrchestratorMock.mockResolvedValueOnce({
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: 'none',
                matchedEntryIds: [],
                worldProfile: 'unknown',
                reasonCode: 'ok',
            },
        });
        const service = new SummaryService('chat-key', createRepositoryStub());

        await service.captureSummaryFromChat({
            messages: [
                { role: 'user', content: '<game>总结主线</game>', turnIndex: 1 },
                { role: 'assistant', content: '<summary>总结辅助</summary>', turnIndex: 2 },
                { role: 'assistant', content: '<details>总结排除</details>', turnIndex: 3 },
            ],
        });

        const input = runSummaryOrchestratorMock.mock.calls[0]?.[0];
        expect(input.messages.map((message: { content?: string }) => message.content)).toEqual(['总结主线']);
        expect(input.windowOptions.auxiliaryContextText).toContain('总结辅助');
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
