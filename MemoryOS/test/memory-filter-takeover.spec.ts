import { afterEach, describe, expect, it } from 'vitest';
import { applyMemoryFilterSettings, resetMemoryFilterSettings } from '../src/memory-filter';
import { assembleTakeoverBatchPromptAssembly } from '../src/memory-takeover/takeover-batch-runner';

describe('MemoryFilter 旧聊天接管接入', (): void => {
    afterEach((): void => {
        resetMemoryFilterSettings();
    });

    it('接管批处理通过 filterMemoryMessages 过滤楼层', async (): Promise<void> => {
        applyMemoryFilterSettings({ enabled: true, mode: 'xml' });

        const assembly = await assembleTakeoverBatchPromptAssembly({
            llm: null,
            pluginId: 'MemoryOS',
            messages: [
                { floor: 1, role: 'user', name: '用户', content: '<game>接管主线</game>' },
                { floor: 2, role: 'assistant', name: '旁白', content: '<summary>接管参考</summary>' },
                { floor: 3, role: 'assistant', name: '分析', content: '<think>接管排除</think>' },
            ],
        });

        expect(assembly.extractionMessages.map((message) => message.content)).toEqual(['接管主线']);
        expect(assembly.channels.contextText).toContain('接管参考');
        expect(assembly.channels.excludedText).toContain('接管排除');
        expect(assembly.floorRecords.find((record) => record.floor === 2)?.hasContextOnly).toBe(true);
    });
});
