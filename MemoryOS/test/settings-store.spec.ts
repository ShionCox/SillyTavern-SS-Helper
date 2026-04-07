import { describe, expect, it } from 'vitest';
import { normalizeMemoryOSSettings, resolveRetrievalEnableQueryContextBuilder } from '../src/settings/store';

describe('normalizeMemoryOSSettings', () => {
    it('允许第二阶段 rollingDigest 截断长度设置为 0 表示不限长', () => {
        const settings = normalizeMemoryOSSettings({
            summarySecondStageRollingDigestMaxChars: 0,
            summarySecondStageCandidateSummaryMaxChars: 0,
        });
        expect(settings.summarySecondStageRollingDigestMaxChars).toBe(0);
        expect(settings.summarySecondStageCandidateSummaryMaxChars).toBe(0);
    });

    it('会把第二阶段摘要截断长度约束到合法范围', () => {
        const tooSmall = normalizeMemoryOSSettings({
            summarySecondStageRollingDigestMaxChars: 12,
            summarySecondStageCandidateSummaryMaxChars: 8,
        });
        const tooLarge = normalizeMemoryOSSettings({
            summarySecondStageRollingDigestMaxChars: 999999,
            summarySecondStageCandidateSummaryMaxChars: 999999,
        });
        expect(tooSmall.summarySecondStageRollingDigestMaxChars).toBe(60);
        expect(tooSmall.summarySecondStageCandidateSummaryMaxChars).toBe(40);
        expect(tooLarge.summarySecondStageRollingDigestMaxChars).toBe(10000);
        expect(tooLarge.summarySecondStageCandidateSummaryMaxChars).toBe(10000);
    });

    it('QueryContextBuilder helper 会按检索模式回落默认值', () => {
        expect(resolveRetrievalEnableQueryContextBuilder('lexical_only')).toBe(false);
        expect(resolveRetrievalEnableQueryContextBuilder('hybrid')).toBe(true);
        expect(resolveRetrievalEnableQueryContextBuilder('vector_only')).toBe(true);
    });

    it('会归一化梦境执行模式预留字段', () => {
        expect(normalizeMemoryOSSettings({ dreamExecutionMode: 'silent' }).dreamExecutionMode).toBe('silent');
        expect(normalizeMemoryOSSettings({ dreamExecutionMode: 'manual_review' }).dreamExecutionMode).toBe('manual_review');
        expect(normalizeMemoryOSSettings({ dreamExecutionMode: 'unknown' as any }).dreamExecutionMode).toBe('manual_review');
    });
});
