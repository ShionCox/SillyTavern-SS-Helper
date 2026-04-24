import { afterEach, describe, expect, it } from 'vitest';
import {
    applyMemoryFilterSettings,
    filterMemoryMessages,
    resetMemoryFilterSettings,
} from '../src/memory-filter';

describe('MemoryFilter 统一过滤服务', (): void => {
    afterEach((): void => {
        resetMemoryFilterSettings();
    });

    it('过滤关闭时保持原始楼层消息内容', (): void => {
        const result = filterMemoryMessages([
            { role: 'user', content: '<think>不要改</think>', turnIndex: 1 },
        ]);

        expect(result.enabled).toBe(false);
        expect(result.messagesForMemory[0]?.content).toBe('<think>不要改</think>');
        expect(result.contextText).toBe('');
        expect(result.excludedText).toBe('');
        expect(result.records).toEqual([]);
    });

    it('XML 模式把内容分为进入记忆、仅作参考、完全排除', (): void => {
        const settings = applyMemoryFilterSettings({ enabled: true, mode: 'xml' });
        const result = filterMemoryMessages([
            { role: 'assistant', content: '<game>主线</game><summary>摘要</summary><think>思考</think>', turnIndex: 1 },
        ], settings);

        expect(result.enabled).toBe(true);
        expect(result.messagesForMemory.map((message) => message.content)).toEqual(['主线']);
        expect(result.contextText).toContain('摘要');
        expect(result.excludedText).toContain('思考');
        expect(result.records[0]?.blocks.map((block) => block.channel)).toEqual(['memory', 'context', 'excluded']);
    });

    it('unknownPolicy 控制未知标签进入的通道', (): void => {
        const contextSettings = applyMemoryFilterSettings({ enabled: true, mode: 'xml', unknownPolicy: 'context' });
        const contextResult = filterMemoryMessages([
            { role: 'assistant', content: '<mystery>未知内容</mystery>', turnIndex: 1 },
        ], contextSettings);
        expect(contextResult.messagesForMemory).toEqual([]);
        expect(contextResult.contextText).toContain('未知内容');

        const excludedSettings = applyMemoryFilterSettings({ unknownPolicy: 'excluded' });
        const excludedResult = filterMemoryMessages([
            { role: 'assistant', content: '<mystery>未知内容</mystery>', turnIndex: 1 },
        ], excludedSettings);
        expect(excludedResult.messagesForMemory).toEqual([]);
        expect(excludedResult.excludedText).toContain('未知内容');
    });
});
