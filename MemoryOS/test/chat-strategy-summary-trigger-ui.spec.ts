import { describe, expect, it } from 'vitest';
import { listSummaryTriggerRules } from '../src/core/summary-trigger-registry';
import {
    buildSummaryTriggerCardsForPanel,
    listSummaryTriggerRulesForPanel,
} from '../src/ui/summary-trigger-ui-model';

describe('chat strategy summary trigger ui', (): void => {
    it('UI 触发器来源与 registry 保持同源', (): void => {
        const rules = listSummaryTriggerRules();
        const panelRules = listSummaryTriggerRulesForPanel();
        expect(panelRules.map((item) => item.id)).toEqual(rules.map((item) => item.id));
    });

    it('UI 卡片会覆盖 registry 中的全部 trigger', (): void => {
        const rules = listSummaryTriggerRules();
        const cards = buildSummaryTriggerCardsForPanel();
        expect(cards.length).toBe(rules.length);
        expect(cards.map((item) => item.triggerId)).toEqual(rules.map((item) => item.id));
        cards.forEach((card): void => {
            expect(card.id).toContain('stx-memoryos-chat-ops-summary-trigger-');
            expect(card.title.length).toBeGreaterThan(0);
            expect(card.description.length).toBeGreaterThan(0);
        });
    });
});
