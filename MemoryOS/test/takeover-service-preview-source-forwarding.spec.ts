import { describe, expect, it, vi } from 'vitest';

const { stateStore } = vi.hoisted(() => ({
    stateStore: new Map<string, Record<string, unknown>>(),
}));

vi.mock('../src/db/db', () => {
    return {
        readMemoryOSChatState: vi.fn(async (chatKey: string) => {
            const state = stateStore.get(chatKey) ?? {};
            return { state };
        }),
        writeMemoryOSChatState: vi.fn(async (chatKey: string, patch: Record<string, unknown>) => {
            const current = stateStore.get(chatKey) ?? {};
            stateStore.set(chatKey, { ...current, ...patch });
        }),
        loadMemoryTakeoverBatchResults: vi.fn(async () => []),
        loadMemoryTakeoverPreview: vi.fn(async () => ({
            baseline: null,
            activeSnapshot: null,
            latestBatch: null,
            consolidation: null,
        })),
        clearMemoryTakeoverPreview: vi.fn(async () => undefined),
        readMemoryTakeoverPlan: vi.fn(async () => null),
        writeMemoryTakeoverPlan: vi.fn(async () => undefined),
        saveMemoryTakeoverPreview: vi.fn(async () => undefined),
    };
});

vi.mock('../../SDK/tavern', () => {
    return {
        ensureTavernInstanceIdEvent: vi.fn(() => 'tavern:test'),
        getCurrentTavernCharacterEvent: vi.fn(() => ({})),
        getCurrentTavernUserNameEvent: vi.fn(() => '用户'),
        getCurrentTavernUserSnapshotEvent: vi.fn(() => ({})),
        getTavernSemanticSnapshotEvent: vi.fn(() => ({})),
        getTavernRuntimeContextEvent: vi.fn(() => ({
            chat: [
                { role: 'user', name: '用户', content: '<game>主线剧情推进</game>' },
                { role: 'assistant', name: '旁白', content: '<summary>这是总结提示</summary>' },
                { role: 'assistant', name: '分析器', content: '<details>这是排除内容</details>' },
            ],
        })),
        extractTavernMessageTextEvent: vi.fn((record: Record<string, unknown>) => ({
            text: String(record.content ?? record.mes ?? ''),
            textSource: 'content',
            normalizedShapeHint: 'content_visible_text',
        })),
        extractTavernMessageOriginalTextEvent: vi.fn((record: Record<string, unknown>) => ({
            text: String(record.content ?? record.mes ?? ''),
            source: 'content',
        })),
        stripRuntimePlaceholderArtifactsEvent: vi.fn((text: string) => String(text ?? '')),
    };
});

vi.mock('../src/memory-summary', () => {
    return {
        readMemoryLLMApi: vi.fn(() => null),
    };
});

import { TakeoverService } from '../src/services/takeover-service';

const repositoryStub = {
    getWorldProfileBinding: vi.fn(async () => null),
    putWorldProfileBinding: vi.fn(async (input) => ({
        chatKey: 'chat:test',
        primaryProfile: input.primaryProfile,
        secondaryProfiles: input.secondaryProfiles,
        confidence: input.confidence,
        reasonCodes: input.reasonCodes,
        detectedFrom: input.detectedFrom,
        sourceHash: 'wp:test',
        bindingMode: input.bindingMode ?? 'auto',
        createdAt: 1,
        updatedAt: 1,
    })),
};

describe('TakeoverService preview source forwarding', (): void => {
    it('实际送模预览会按内容拆分台总开关切换全量内容与拆分通道', async (): Promise<void> => {
        stateStore.clear();
        const service = new TakeoverService('chat:test', repositoryStub as never);

        const disabledPreview = await service.previewActualTakeoverPayload({
            mode: 'full',
            batchSize: 10,
        });

        await service.saveContentLabSettings({ enableContentSplit: true });
        const enabledPreview = await service.previewActualTakeoverPayload({
            mode: 'full',
            batchSize: 10,
        });

        expect(disabledPreview.batches[0]?.sentFloors).toEqual([1, 2, 3]);
        expect(disabledPreview.batches[0]?.hintText).toBe('');
        expect(disabledPreview.batches[0]?.excludedSummary).toEqual([]);
        expect(enabledPreview.batches[0]?.sentFloors).toEqual([1]);
        expect(enabledPreview.batches[0]?.hintText).toContain('这是总结提示');
        expect(enabledPreview.batches[0]?.excludedSummary.join('\n')).toContain('这是排除内容');
    });

    it('单层预览会把 previewSourceMode 继续传给范围预览入口', async (): Promise<void> => {
        const service = new TakeoverService('chat:test', repositoryStub as never);
        const previewFloorRangeSpy = vi.spyOn(service, 'previewFloorRangeContentBlocks').mockResolvedValue([{
            floor: 7,
            originalText: '<details>宿主显示原文</details>',
            originalTextMode: 'raw_visible_text',
            originalTextSource: 'message.extra.display_text',
            originalRole: 'assistant',
            includedInBatch: true,
            parsedBlocks: [],
            hasPrimaryStory: false,
            hasHintOnly: false,
            hasExcludedOnly: true,
        }]);

        const record = await service.previewFloorContentBlocks({
            floor: 7,
            previewSourceMode: 'raw_visible_text',
        });

        expect(previewFloorRangeSpy).toHaveBeenCalledTimes(1);
        expect(previewFloorRangeSpy).toHaveBeenCalledWith({
            startFloor: 7,
            endFloor: 7,
            previewSourceMode: 'raw_visible_text',
            llm: undefined,
            pluginId: undefined,
        });
        expect(record.originalTextMode).toBe('raw_visible_text');
    });
});
