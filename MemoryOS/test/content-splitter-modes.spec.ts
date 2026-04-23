import { describe, expect, it } from 'vitest';

import {
    DEFAULT_CONTENT_LAB_SETTINGS,
    normalizeContentLabSettings,
    type ContentLabSettings,
} from '../src/config/content-tag-registry';
import { assembleContentChannels, buildFloorRecord } from '../src/memory-takeover';

function createSettings(patch: Partial<ContentLabSettings>): ContentLabSettings {
    return normalizeContentLabSettings({
        ...DEFAULT_CONTENT_LAB_SETTINGS,
        enableContentSplit: true,
        ...patch,
    });
}

describe('content splitter modes', (): void => {
    it('XML 旧配置迁移后仍按标签进入三通道', (): void => {
        const settings = normalizeContentLabSettings({
            enableContentSplit: true,
            tagRegistry: DEFAULT_CONTENT_LAB_SETTINGS.tagRegistry,
        });
        const record = buildFloorRecord({
            floor: 1,
            role: 'assistant',
            name: '旁白',
            content: '<game>主线剧情</game><details>作者注释</details>',
        }, 'content', settings);
        const channels = assembleContentChannels([record]);

        expect(settings.splitMode).toBe('xml');
        expect(channels.primaryText).toContain('主线剧情');
        expect(channels.excludedSummary.join('\n')).toContain('作者注释');
    });

    it('分隔符模式支持多个分隔符并可丢弃分隔符', (): void => {
        const settings = createSettings({
            splitMode: 'delimiter',
            rules: [{
                id: 'delimiter-test',
                label: '分隔符测试',
                mode: 'delimiter',
                enabled: true,
                channel: 'primary',
                priority: 0,
                delimiters: ['---', '\\n\\n'],
                keepDelimiter: false,
                blockChannels: { 1: 'excluded' },
            }],
        });
        const record = buildFloorRecord({
            floor: 1,
            role: 'assistant',
            name: '旁白',
            content: '第一段---第二段\n\n第三段',
        }, 'content', settings);

        expect(record.parsedBlocks.map((block) => block.rawText)).toEqual(['第一段', '第二段', '第三段']);
        expect(record.parsedBlocks[0]?.includeInPrimaryExtraction).toBe(true);
        expect(record.parsedBlocks[1]?.includeInPrimaryExtraction).toBe(false);
        expect(record.parsedBlocks[1]?.includeAsHint).toBe(false);
    });

    it('正则模式支持捕获组，非法正则返回诊断', (): void => {
        const settings = createSettings({
            splitMode: 'regex',
            rules: [
                {
                    id: 'regex-valid',
                    label: '章节',
                    mode: 'regex',
                    enabled: true,
                    channel: 'hint',
                    priority: 10,
                    regex: '章：(\\S+)',
                    flags: 'g',
                    captureGroup: 1,
                },
                {
                    id: 'regex-invalid',
                    label: '坏正则',
                    mode: 'regex',
                    enabled: true,
                    channel: 'excluded',
                    priority: 0,
                    regex: '(',
                    flags: 'g',
                },
            ],
        });
        const record = buildFloorRecord({
            floor: 1,
            role: 'assistant',
            name: '旁白',
            content: '章：开端\n章：转折',
        }, 'content', settings);

        expect(record.parsedBlocks.some((block) => block.rawText === '开端')).toBe(true);
        expect(record.parsedBlocks.some((block) => block.diagnostics?.join('').includes('正则无效'))).toBe(true);
        expect(record.parsedBlocks.find((block) => block.rawText === '开端')?.includeAsHint).toBe(true);
    });

    it('Markdown 模式按标题切块且不误切代码块里的标题', (): void => {
        const settings = createSettings({
            splitMode: 'markdown',
            rules: [{
                id: 'md',
                label: 'Markdown',
                mode: 'markdown',
                enabled: true,
                channel: 'primary',
                priority: 0,
                markdownStrategy: 'heading',
            }],
        });
        const record = buildFloorRecord({
            floor: 1,
            role: 'assistant',
            name: '旁白',
            content: '# 第一节\n正文\n```\n# 不是标题\n```\n# 第二节\n继续',
        }, 'content', settings);

        expect(record.parsedBlocks).toHaveLength(2);
        expect(record.parsedBlocks[0]?.rawText).toContain('# 不是标题');
        expect(record.parsedBlocks[1]?.title).toBe('第二节');
    });

    it('JSONPath 模式提取命中块，非法 JSON 给出诊断', (): void => {
        const settings = createSettings({
            splitMode: 'jsonpath',
            rules: [{
                id: 'json',
                label: '用户档案',
                mode: 'jsonpath',
                enabled: true,
                channel: 'primary',
                priority: 0,
                jsonPath: '$.users[*].name',
            }],
        });
        const record = buildFloorRecord({
            floor: 1,
            role: 'assistant',
            name: '旁白',
            content: '{"users":[{"name":"艾琳"},{"name":"林远"}]}',
        }, 'content', settings);
        const invalid = buildFloorRecord({
            floor: 2,
            role: 'assistant',
            name: '旁白',
            content: '{bad json',
        }, 'content', settings);

        expect(record.parsedBlocks.map((block) => block.rawText)).toEqual(['艾琳', '林远']);
        expect(invalid.parsedBlocks.some((block) => block.diagnostics?.join('').includes('JSON 解析失败'))).toBe(true);
    });
});
