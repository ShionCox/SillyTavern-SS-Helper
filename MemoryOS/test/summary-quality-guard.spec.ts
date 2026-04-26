import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateSummaryMutationDocument, type EditableFieldMap } from '../src/memory-summary';

interface SummaryQualityFixture {
    name: string;
    mutationDocument: unknown;
    expected: {
        valid: boolean;
        mustHaveActions?: string[];
        requiredErrors?: string[];
    };
}

/**
 * 功能：读取总结质量守卫测试夹具。
 * @param name 夹具文件名。
 * @returns 夹具内容。
 */
function readFixture(name: string): SummaryQualityFixture {
    const url = new URL(`./fixtures/memory-summary/${name}`, import.meta.url);
    return JSON.parse(readFileSync(url, 'utf8')) as SummaryQualityFixture;
}

/**
 * 功能：构建测试用字段白名单。
 * @returns 字段白名单。
 */
function buildEditableFieldMap(): EditableFieldMap {
    return new Map([
        ['event', new Set(['summary'])],
        ['relationship', new Set(['summary', 'state', 'trust', 'affection', 'tension'])],
    ]);
}

describe('summary quality guard fixtures', () => {
    it('允许无长期价值窗口返回 NOOP', () => {
        const fixture = readFixture('01_no_update_chitchat.json');
        const result = validateSummaryMutationDocument(fixture.mutationDocument, buildEditableFieldMap());

        expect(result.valid).toBe(fixture.expected.valid);
        expect(result.document?.actions.map((action) => action.action)).toEqual(fixture.expected.mustHaveActions);
    });

    it('拒绝同一 compareKey 的重复 ADD', () => {
        const fixture = readFixture('04_duplicate_should_noop.json');
        const result = validateSummaryMutationDocument(fixture.mutationDocument, buildEditableFieldMap());

        expect(result.valid).toBe(fixture.expected.valid);
        for (const error of fixture.expected.requiredErrors ?? []) {
            expect(result.errors).toContain(error);
        }
    });

    it('拒绝工具输出和系统腔污染进入记忆文本', () => {
        const fixture = readFixture('05_meta_pollution_should_ignore.json');
        const result = validateSummaryMutationDocument(fixture.mutationDocument, buildEditableFieldMap());

        expect(result.valid).toBe(fixture.expected.valid);
        for (const error of fixture.expected.requiredErrors ?? []) {
            expect(result.errors).toContain(error);
        }
        expect(result.errors.some((error) => error.startsWith('system_tone_pollution:UPDATE:summary'))).toBe(true);
        expect(result.errors.some((error) => error.startsWith('user_alias_pollution:UPDATE:summary'))).toBe(true);
    });
});
