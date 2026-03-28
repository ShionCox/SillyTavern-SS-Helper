import { describe, expect, it } from 'vitest';
import {
    resolveWorldIdentifierList,
    resolveWorldProfileLabel,
    resolveWorldReasonCodeLabel,
    resolveWorldSubTypeLabel,
    resolveWorldTypeLabel,
} from '../src/ui/workbenchLocale';

describe('world profile locale', () => {
    it('优先返回内置世界画像的中文名称', () => {
        expect(resolveWorldProfileLabel('urban_modern')).toBe('现代都市');
        expect(resolveWorldTypeLabel('urban_modern')).toBe('现代现实');
    });

    it('可以转译运行时世界画像与细分类别', () => {
        expect(resolveWorldProfileLabel('dark_fantasy_steampunk')).toBe('黑暗奇幻蒸汽朋克');
        expect(resolveWorldTypeLabel('dark_fantasy_steampunk')).toBe('奇幻魔法');
        expect(resolveWorldSubTypeLabel('magic_decline')).toBe('魔法衰退');
        expect(resolveWorldSubTypeLabel('industrial_revolution')).toBe('工业革命');
    });

    it('可以将原因码数组转成中文说明', () => {
        const text = resolveWorldIdentifierList(
            ['magic_industrial_fusion', 'racial_conflict', 'steampunk_technology', 'dark_atmosphere'],
            resolveWorldReasonCodeLabel,
        );

        expect(text).toContain('魔导工业融合');
        expect(text).toContain('种族冲突');
        expect(text).toContain('蒸汽朋克技术');
        expect(text).toContain('黑暗氛围');
    });

    it('未知标识会尽量按词典转成可读中文', () => {
        expect(resolveWorldProfileLabel('modern_fantasy')).toBe('现代奇幻');
        expect(resolveWorldReasonCodeLabel('kw:dark_magic')).toBe('关键词命中：黑暗魔法');
    });
});
