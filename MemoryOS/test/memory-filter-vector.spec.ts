import { afterEach, describe, expect, it } from 'vitest';
import { applyMemoryFilterSettings, resetMemoryFilterSettings } from '../src/memory-filter';
import { buildEntryDocument } from '../src/services/vector-document-builder';
import type { MemoryEntry } from '../src/types';

describe('MemoryFilter 向量索引接入', (): void => {
    afterEach((): void => {
        resetMemoryFilterSettings();
    });

    it('向量文档文本通过 filterMemoryMessages 过滤', (): void => {
        applyMemoryFilterSettings({ enabled: true, mode: 'xml' });

        const doc = buildEntryDocument({
            entryId: 'entry-1',
            chatKey: 'chat-key',
            entryType: 'event',
            title: '<game>向量主线</game>',
            summary: '<think>向量排除</think>',
            detail: '',
            tags: [],
            detailPayload: {},
            createdAt: 1,
            updatedAt: 1,
        } as MemoryEntry);

        expect(doc.text).toContain('向量主线');
        expect(doc.text).not.toContain('向量排除');
    });
});
