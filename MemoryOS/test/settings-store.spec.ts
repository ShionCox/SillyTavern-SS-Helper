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

    it('在向量模式下默认启用 QueryContextBuilder', () => {
        const hybridSettings = normalizeMemoryOSSettings({
            retrievalMode: 'hybrid',
        });
        const vectorSettings = normalizeMemoryOSSettings({
            retrievalMode: 'vector_only',
        });
        const lexicalSettings = normalizeMemoryOSSettings({
            retrievalMode: 'lexical_only',
        });

        expect(hybridSettings.retrievalEnableQueryContextBuilder).toBe(true);
        expect(vectorSettings.retrievalEnableQueryContextBuilder).toBe(true);
        expect(lexicalSettings.retrievalEnableQueryContextBuilder).toBe(false);
    });

    it('QueryContextBuilder helper 会按检索模式回落默认值', () => {
        expect(resolveRetrievalEnableQueryContextBuilder('lexical_only', false)).toBe(false);
        expect(resolveRetrievalEnableQueryContextBuilder('hybrid', false)).toBe(true);
        expect(resolveRetrievalEnableQueryContextBuilder('vector_only', false)).toBe(true);
        expect(resolveRetrievalEnableQueryContextBuilder('lexical_only', true)).toBe(true);
    });
});
