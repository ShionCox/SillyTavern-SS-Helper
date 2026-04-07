import { describe, expect, it } from 'vitest';
import { projectMemoryRetentionCore } from '../src/core/memory-retention-core';

describe('memory retention core', () => {
    it('会统一产出 retrievalWeight、promptRenderStage 与 forgottenLevel', () => {
        const retention = projectMemoryRetentionCore({
            forgotten: false,
            memoryPercent: 68,
            importance: 74,
            rehearsalCount: 2,
            recencyHours: 12,
            actorMemoryStat: 66,
            relationSensitivity: 55,
            title: '林间疗伤',
            summary: '塞拉菲娜正在持续治疗{{user}}的伤势。',
        });

        expect(retention.forgottenLevel).toBe('active');
        expect(retention.promptRenderStage).toBe('blur');
        expect(retention.retrievalWeight).toBeGreaterThan(0.5);
        expect(retention.effectiveMemoryPercent).toBe(Math.round(retention.retrievalWeight * 100));
    });

    it('影子遗忘未被查询唤起时不会参与召回', () => {
        const retention = projectMemoryRetentionCore({
            forgotten: true,
            memoryPercent: 18,
            title: '林间疗伤',
            summary: '塞拉菲娜正在持续治疗{{user}}的伤势。',
            semantic: {
                semanticKind: 'task_progress',
                visibilityScope: 'actor_visible',
                isCharacterVisible: true,
                currentState: '进行中',
                goalOrObjective: '稳定{{user}}的伤势',
                sourceEntryType: 'task',
            },
            query: '今天天气如何',
        });

        expect(retention.forgottenLevel).toBe('shadow_forgotten');
        expect(retention.shadowTriggered).toBe(false);
        expect(retention.canRecall).toBe(false);
        expect(retention.retrievalWeight).toBe(0);
        expect(['blur', 'distorted']).toContain(retention.promptRenderStage);
    });
});
