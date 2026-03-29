import { describe, expect, it } from 'vitest';
import { normalizeMemoryOSSettings } from '../src/settings/store';

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
});
