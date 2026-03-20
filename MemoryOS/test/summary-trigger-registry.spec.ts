import { describe, expect, it } from 'vitest';
import {
    getDefaultSummaryTriggerIds,
    isSummaryTriggerId,
    listSummaryTriggerRules,
} from '../src/core/summary-trigger-registry';

describe('summary-trigger-registry', (): void => {
    it('每个 trigger id 都可以被识别', (): void => {
        const rules = listSummaryTriggerRules();
        expect(rules.length).toBeGreaterThan(0);
        rules.forEach((rule): void => {
            expect(isSummaryTriggerId(rule.id)).toBe(true);
        });
        expect(isSummaryTriggerId('unknown_trigger')).toBe(false);
    });

    it('默认 trigger 列表与 UI 排序保持一致', (): void => {
        const rules = listSummaryTriggerRules();
        const idsFromRuleOrder = rules.map((rule) => rule.id);
        expect(getDefaultSummaryTriggerIds()).toEqual(idsFromRuleOrder);
        expect(idsFromRuleOrder[0]).toBe('scene_end');
        expect(idsFromRuleOrder.includes('archive_finalize')).toBe(true);
    });
});
