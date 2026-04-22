import { afterEach, describe, expect, it } from 'vitest';
import { assembleTakeoverBatchPromptAssembly } from '../src/memory-takeover/takeover-batch-runner';
import { resetBlockIdCounter } from '../src/memory-takeover/content-block-parser';
import { applyContentLabSettings, resetContentLabSettings } from '../src/config/content-tag-registry';

describe('assembleTakeoverBatchPromptAssembly', (): void => {
    afterEach((): void => {
        resetBlockIdCounter();
        resetContentLabSettings();
    });

    it('默认关闭内容拆分时把每层完整内容都送进 extractionMessages', async (): Promise<void> => {
        const assembly = await assembleTakeoverBatchPromptAssembly({
            llm: null,
            pluginId: 'MemoryOS',
            messages: [
                {
                    floor: 1,
                    role: 'user',
                    name: '用户',
                    content: '<game>主线剧情推进</game>',
                },
                {
                    floor: 2,
                    role: 'assistant',
                    name: '旁白',
                    content: '<summary>这是总结提示</summary>',
                },
                {
                    floor: 3,
                    role: 'assistant',
                    name: '分析器',
                    content: '<details>这是排除内容</details>',
                },
            ],
        });

        expect(assembly.floorRecords.map((record) => record.floor)).toEqual([1, 2, 3]);
        expect(assembly.extractionMessages).toHaveLength(3);
        expect(assembly.extractionMessages.map((message) => message.content)).toEqual([
            '<game>主线剧情推进</game>',
            '<summary>这是总结提示</summary>',
            '<details>这是排除内容</details>',
        ]);
        expect(assembly.channels.hintText).toBe('');
        expect(assembly.channels.excludedSummary).toEqual([]);
        expect(assembly.floorRecords.every((record) => record.hasPrimaryStory)).toBe(true);
    });

    it('开启内容拆分后只把含 primary block 的楼层送进 extractionMessages，同时保留 hint 与排除通道', async (): Promise<void> => {
        applyContentLabSettings({ enableContentSplit: true });

        const assembly = await assembleTakeoverBatchPromptAssembly({
            llm: null,
            pluginId: 'MemoryOS',
            messages: [
                {
                    floor: 1,
                    role: 'user',
                    name: '用户',
                    content: '<game>主线剧情推进</game>',
                },
                {
                    floor: 2,
                    role: 'assistant',
                    name: '旁白',
                    content: '<summary>这是总结提示</summary>',
                },
                {
                    floor: 3,
                    role: 'assistant',
                    name: '分析器',
                    content: '<details>这是排除内容</details>',
                },
            ],
        });

        expect(assembly.floorRecords.map((record) => record.floor)).toEqual([1, 2, 3]);
        expect(assembly.extractionMessages).toHaveLength(1);
        expect(assembly.extractionMessages[0]).toMatchObject({
            floor: 1,
            role: 'user',
            name: '用户',
            content: '主线剧情推进',
        });
        expect(assembly.extractionMessages.map((message) => message.floor)).toEqual([1]);
        expect(assembly.channels.hintText).toContain('这是总结提示');
        expect(assembly.channels.excludedSummary.join('\n')).toContain('[Floor 3][meta_commentary] 这是排除内容');
        expect(assembly.floorRecords.find((record) => record.floor === 2)?.hasHintOnly).toBe(true);
        expect(assembly.floorRecords.find((record) => record.floor === 3)?.hasExcludedOnly).toBe(true);
    });
});
