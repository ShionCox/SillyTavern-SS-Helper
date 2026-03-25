import { describe, expect, it } from 'vitest';
import {
    buildRecordFilterAuditMetadata,
    buildRecordFilterProfileVersion,
    filterRecordText,
    normalizeRecordFilterSettings,
} from '../src/core/record-filter';

describe('record-filter audit metadata', (): void => {
    it('相同过滤配置生成稳定一致的 filterProfileVersion', (): void => {
        const settingsA = normalizeRecordFilterSettings({
            enabled: true,
            level: 'balanced',
            filterTypes: ['json', 'codeblock', 'xml', 'html'],
            jsonExtractMode: 'smart',
            jsonExtractKeys: ['content', 'text'],
            customRegexEnabled: true,
            customRegexRules: '/foo/gi\nbar',
            maxTextLength: 1234,
            minEffectiveChars: 3,
        });
        const settingsB = normalizeRecordFilterSettings({
            minEffectiveChars: 3,
            maxTextLength: 1234,
            customRegexRules: '/foo/gi\nbar',
            customRegexEnabled: true,
            jsonExtractKeys: ['content', 'text'],
            jsonExtractMode: 'smart',
            filterTypes: ['json', 'codeblock', 'xml', 'html'],
            level: 'balanced',
            enabled: true,
        });
        expect(buildRecordFilterProfileVersion(settingsA)).toBe(buildRecordFilterProfileVersion(settingsB));
    });

    it('过滤配置变化会导致 filterProfileVersion 变化', (): void => {
        const left = normalizeRecordFilterSettings({
            level: 'balanced',
            jsonExtractMode: 'off',
        });
        const right = normalizeRecordFilterSettings({
            level: 'strict',
            jsonExtractMode: 'off',
        });
        expect(buildRecordFilterProfileVersion(left)).not.toBe(buildRecordFilterProfileVersion(right));
    });

    it('filterRecordText 会输出 usedJsonExtractMode 与稳定的 usedRegexRuleIds', (): void => {
        const settings = normalizeRecordFilterSettings({
            customRegexEnabled: true,
            customRegexRules: '/foo/gi\nbar',
            jsonExtractMode: 'all_strings',
            filterTypes: ['json'],
        });
        const resultA = filterRecordText('{"content":"foo bar"}', settings);
        const resultB = filterRecordText('{"content":"foo bar"}', normalizeRecordFilterSettings({
            customRegexEnabled: true,
            customRegexRules: 'bar\n/foo/gi',
            jsonExtractMode: 'all_strings',
            filterTypes: ['json'],
        }));
        expect(resultA.usedJsonExtractMode).toBe('all_strings');
        expect(resultA.usedRegexRuleIds.length).toBeGreaterThan(0);
        expect(resultA.usedRegexRuleIds).toEqual([...resultA.usedRegexRuleIds].sort());
        expect(resultA.usedRegexRuleIds).toEqual(resultB.usedRegexRuleIds);
    });

    it('buildRecordFilterAuditMetadata 会生成事件入库审计字段', (): void => {
        const settings = normalizeRecordFilterSettings({
            customRegexEnabled: true,
            customRegexRules: '/foo/g',
            jsonExtractMode: 'smart',
            filterTypes: ['json'],
        });
        const result = filterRecordText('{"content":"foo text"}', settings);
        const audit = buildRecordFilterAuditMetadata({
            rawText: '{"content":"foo text"}',
            filterResult: result,
            normalizedSettings: settings,
            ingestHint: 'normal',
            dedupSource: 'text_signature',
        });
        expect(audit.filterReasonCode).toBe(result.reasonCode);
        expect(audit.filterProfileVersion.startsWith('record_filter.v1:h')).toBe(true);
        expect(audit.rawTextHash.startsWith('h')).toBe(true);
        expect(audit.filteredTextHash.startsWith('h')).toBe(true);
        expect(audit.usedJsonExtractMode).toBe('smart');
        expect(audit.ingestHint).toBe('normal');
        expect(audit.dedupSource).toBe('text_signature');
    });
});
