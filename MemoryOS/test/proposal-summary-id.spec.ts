import { describe, expect, it } from 'vitest';
import { buildStableSummaryId } from '../src/proposal/proposal-manager';

describe('stable summary id', () => {
    it('对同一摘要内容生成稳定 ID', () => {
        const baseInput = {
            chatKey: 'char:erika::chat:welcome',
            consumerPluginId: 'stx_memory_os',
            level: 'scene',
            title: '开场摘要',
            content: '艾莉卡在新的对话中再次登场。',
            keywords: ['开场', '艾莉卡'],
            visibleMessageIds: ['m1', 'm2'],
            viewHash: 'vh_1',
            ordinal: 0,
        };

        const first = buildStableSummaryId(baseInput);
        const second = buildStableSummaryId({
            ...baseInput,
            content: '艾莉卡在新的对话中再次登场。',
        });

        expect(first).toBe(second);
    });

    it('在摘要内容变化时生成不同 ID', () => {
        const first = buildStableSummaryId({
            chatKey: 'char:erika::chat:welcome',
            consumerPluginId: 'stx_memory_os',
            level: 'scene',
            title: '开场摘要',
            content: '艾莉卡在新的对话中再次登场。',
            keywords: ['开场', '艾莉卡'],
            visibleMessageIds: ['m1', 'm2'],
            viewHash: 'vh_1',
            ordinal: 0,
        });
        const second = buildStableSummaryId({
            chatKey: 'char:erika::chat:welcome',
            consumerPluginId: 'stx_memory_os',
            level: 'scene',
            title: '开场摘要',
            content: '艾莉卡重新开始了一段不同的对话。',
            keywords: ['开场', '艾莉卡'],
            visibleMessageIds: ['m1', 'm2'],
            viewHash: 'vh_1',
            ordinal: 0,
        });

        expect(first).not.toBe(second);
    });
});
