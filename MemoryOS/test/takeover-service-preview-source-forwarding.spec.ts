import { describe, expect, it, vi } from 'vitest';

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
