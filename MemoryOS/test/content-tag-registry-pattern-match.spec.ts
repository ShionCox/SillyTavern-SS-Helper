import { describe, expect, it } from 'vitest';

import {
    DEFAULT_CONTENT_LAB_SETTINGS,
    lookupTagPolicy,
    normalizeContentLabSettings,
    resetContentLabSettings,
    saveContentTagRegistry,
    type ContentBlockPolicy,
} from '../src/config/content-tag-registry';

describe('content tag registry pattern match', (): void => {
    it('内容拆分总开关默认关闭，历史配置缺字段时也保持关闭', (): void => {
        expect(DEFAULT_CONTENT_LAB_SETTINGS.enableContentSplit).toBe(false);
        expect(normalizeContentLabSettings({}).enableContentSplit).toBe(false);
        expect(normalizeContentLabSettings({ enableContentSplit: true }).enableContentSplit).toBe(true);
    });

    it('支持 prefix 和 regex 模式匹配奇怪标签', (): void => {
        const rules: ContentBlockPolicy[] = [
            {
                tagName: 'summary',
                aliases: [],
                pattern: '^summary(?:[-_].+)?$',
                patternMode: 'regex',
                priority: 50,
                kind: 'summary',
                includeInPrimaryExtraction: false,
                includeAsHint: true,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: 'summary regex',
            },
            {
                tagName: 'tableEdit',
                aliases: [],
                pattern: 'tableedit',
                patternMode: 'prefix',
                priority: 60,
                kind: 'tool_artifact',
                includeInPrimaryExtraction: false,
                includeAsHint: true,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: 'table prefix',
            },
            {
                tagName: 'think',
                aliases: [],
                pattern: '^think(?:[_~-].+|\\d+.*)?$',
                patternMode: 'regex',
                priority: 70,
                kind: 'thought',
                includeInPrimaryExtraction: false,
                includeAsHint: false,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: 'think regex',
            },
        ];

        saveContentTagRegistry(rules);

        expect(lookupTagPolicy('summary-extra')?.tagName).toBe('summary');
        expect(lookupTagPolicy('tableEdit2')?.tagName).toBe('tableEdit');
        expect(lookupTagPolicy('think_nya_v2')?.tagName).toBe('think');

        resetContentLabSettings();
    });

    it('多规则命中时按 priority 决定最终策略', (): void => {
        saveContentTagRegistry([
            {
                tagName: 'genericThink',
                aliases: [],
                pattern: '^think.*$',
                patternMode: 'regex',
                priority: 10,
                kind: 'meta_commentary',
                includeInPrimaryExtraction: false,
                includeAsHint: false,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: 'generic',
            },
            {
                tagName: 'specialThink',
                aliases: [],
                pattern: '^think_nya.*$',
                patternMode: 'regex',
                priority: 100,
                kind: 'thought',
                includeInPrimaryExtraction: false,
                includeAsHint: false,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: 'special',
            },
        ]);

        expect(lookupTagPolicy('think_nya_v2')?.tagName).toBe('specialThink');

        resetContentLabSettings();
    });

    it('规范化会补齐 patternMode 与 priority 默认值', (): void => {
        const normalized = normalizeContentLabSettings({
            tagRegistry: [{
                tagName: 'test',
                aliases: ['foo'],
                pattern: 'test',
                kind: 'unknown',
                includeInPrimaryExtraction: false,
                includeAsHint: true,
                allowActorPromotion: false,
                allowRelationPromotion: false,
                notes: '',
            }],
        });

        expect(normalized.tagRegistry[0]?.pattern).toBe('test');
        expect(normalized.tagRegistry[0]?.patternMode).toBeUndefined();
        expect(normalized.tagRegistry[0]?.priority).toBe(0);
    });
});
