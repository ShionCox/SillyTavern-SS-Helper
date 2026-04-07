import { afterEach, describe, expect, it } from 'vitest';
import { buildFloorRecord } from '../src/memory-takeover/content-block-pipeline';
import { resetBlockIdCounter } from '../src/memory-takeover/content-block-parser';

describe('buildFloorRecord preview source mode', (): void => {
    afterEach((): void => {
        resetBlockIdCounter();
    });

    it('按 content 模式时使用处理链正文进行分块', (): void => {
        const record = buildFloorRecord({
            floor: 1,
            sourceFloor: 7,
            role: 'assistant',
            name: '旁白',
            content: '<game>处理链正文</game>',
            rawVisibleText: '<details>宿主显示原文</details>',
            contentSource: 'message.display_text',
            rawVisibleTextSource: 'message.extra.display_text',
        }, 'content');

        expect(record.originalTextMode).toBe('content');
        expect(record.originalText).toContain('处理链正文');
        expect(record.originalTextSource).toBe('message.display_text');
        expect(record.hasPrimaryStory).toBe(true);
        expect(record.hasExcludedOnly).toBe(false);
    });

    it('按 rawVisibleText 模式时使用宿主可见原文进行分块', (): void => {
        const record = buildFloorRecord({
            floor: 1,
            sourceFloor: 7,
            role: 'assistant',
            name: '旁白',
            content: '<game>处理链正文</game>',
            rawVisibleText: '<details>宿主显示原文</details>',
            contentSource: 'message.display_text',
            rawVisibleTextSource: 'message.extra.display_text',
        }, 'raw_visible_text');

        expect(record.originalTextMode).toBe('raw_visible_text');
        expect(record.originalText).toContain('宿主显示原文');
        expect(record.originalTextSource).toBe('message.extra.display_text');
        expect(record.hasPrimaryStory).toBe(false);
        expect(record.hasExcludedOnly).toBe(true);
    });
});
