import { afterEach, describe, expect, it } from 'vitest';

import { applyContentLabSettings, resetContentLabSettings } from '../src/config/content-tag-registry';
import { prepareFloorContentForSending } from '../src/memory-takeover/content-block-pipeline';
import { resetBlockIdCounter } from '../src/memory-takeover/content-block-parser';
import { buildSummaryWindow } from '../src/memory-summary/summary-window';
import { DreamWaveRecallService } from '../src/services/dream-wave-recall-service';

describe('楼层内容拆分总开关', (): void => {
    afterEach((): void => {
        resetBlockIdCounter();
        resetContentLabSettings();
    });

    it('关闭时发送原楼层内容', (): void => {
        const prepared = prepareFloorContentForSending([
            { role: 'assistant', content: '<game>主线剧情</game>', turnIndex: 1 },
            { role: 'assistant', content: '<details>排除信息</details>', turnIndex: 2 },
        ]);

        expect(prepared.splitEnabled).toBe(false);
        expect(prepared.messages.map((message) => message.content)).toEqual([
            '<game>主线剧情</game>',
            '<details>排除信息</details>',
        ]);
        expect(prepared.channels.excludedSummary).toEqual([]);
    });

    it('开启时主正文、辅助上下文、排除内容分离', (): void => {
        applyContentLabSettings({ enableContentSplit: true });

        const prepared = prepareFloorContentForSending([
            { role: 'user', content: '<game>主线剧情</game>', turnIndex: 1 },
            { role: 'assistant', content: '<summary>辅助提示</summary>', turnIndex: 2 },
            { role: 'assistant', content: '<details>排除信息</details>', turnIndex: 3 },
        ]);

        expect(prepared.splitEnabled).toBe(true);
        expect(prepared.messages.map((message) => message.content)).toEqual(['主线剧情']);
        expect(prepared.channels.hintText).toContain('辅助提示');
        expect(prepared.channels.excludedSummary.join('\n')).toContain('排除信息');
    });

    it('自动总结窗口使用主正文并追加辅助上下文，不包含排除块', (): void => {
        applyContentLabSettings({ enableContentSplit: true });

        const prepared = prepareFloorContentForSending([
            { role: 'user', content: '<game>主线剧情</game>', turnIndex: 1 },
            { role: 'assistant', content: '<summary>辅助提示</summary>', turnIndex: 2 },
            { role: 'assistant', content: '<details>排除信息</details>', turnIndex: 3 },
        ]);
        const window = buildSummaryWindow(prepared.messages, {
            auxiliaryContextText: prepared.channels.hintText,
        });

        expect(window.summaryText).toContain('主线剧情');
        expect(window.summaryText).not.toContain('辅助提示');
        expect(window.summaryText).not.toContain('排除信息');
        expect(window.recentContextText).toContain('辅助上下文');
        expect(window.recentContextText).toContain('辅助提示');
        expect(window.recentContextText).not.toContain('排除信息');
    });

    it('梦境最近消息召回 query 使用拆分后的主正文和辅助上下文', async (): Promise<void> => {
        applyContentLabSettings({ enableContentSplit: true });
        const repository = {
            listEntries: async () => [],
            listRoleMemories: async () => [],
            listRelationships: async () => [],
            listSummarySnapshots: async () => [],
            getWorldProfileBinding: async () => null,
            putWorldProfileBinding: async (input: Record<string, unknown>) => input,
        };
        const service = new DreamWaveRecallService({
            chatKey: 'chat-key',
            repository: repository as never,
            readRecentMessages: async () => [
                { role: 'user', content: '<game>梦境主线</game>', turnIndex: 1 },
                { role: 'assistant', content: '<summary>梦境辅助</summary>', turnIndex: 2 },
                { role: 'assistant', content: '<details>梦境排除</details>', turnIndex: 3 },
            ],
        });

        const result = await service.buildRecallBundle();

        expect(result.recall.diagnostics.sourceQuery).toContain('梦境主线');
        expect(result.recall.diagnostics.sourceQuery).toContain('梦境辅助');
        expect(result.recall.diagnostics.sourceQuery).toContain('辅助上下文');
        expect(result.recall.diagnostics.sourceQuery).not.toContain('梦境排除');
    });
});
