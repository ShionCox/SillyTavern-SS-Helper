import { describe, expect, it } from 'vitest';
import { PromptAssemblyService } from '../src/services/prompt-assembly-service';
import type { MemoryRetentionProjection } from '../src/core/memory-retention-core';

describe('PromptAssemblyService semantic render', () => {
    it('会在任务推进条目中补充公共语义标签', () => {
        const service = new PromptAssemblyService('chat-test', {} as never, undefined) as unknown as {
            renderRoleEntryText: (
                entry: { title: string; summary: string; detailPayload?: Record<string, unknown>; entryType: string; ongoing?: boolean; timeContext?: undefined },
                retention: MemoryRetentionProjection,
                currentMaxFloor?: number,
            ) => string;
        };

        const rendered = service.renderRoleEntryText(
            {
                title: '林间疗伤',
                entryType: 'task',
                ongoing: true,
                summary: '塞拉菲娜正在持续治疗{{user}}的伤势。',
                detailPayload: {
                    fields: {
                        status: '进行中',
                        objective: '稳定{{user}}的伤势',
                    },
                },
            },
            {
                retentionScore: 88,
                retrievalWeight: 0.88,
                promptRenderStage: 'clear',
                forgottenLevel: 'active',
                shadowTriggered: false,
                canRecall: true,
                shadowRecallPenalty: 0,
                shadowConfidencePenalty: 0,
                rawMemoryPercent: 88,
                effectiveMemoryPercent: 88,
                explainReasonCodes: ['retention_stage_clear'],
            },
            0,
        );

        expect(rendered).toContain('语义：任务推进');
        expect(rendered).toContain('可见：角色可见');
        expect(rendered).toContain('进行中：是');
        expect(rendered).toContain('状态：进行中');
        expect(rendered).toContain('目标：稳定{{user}}的伤势');
    });
});
