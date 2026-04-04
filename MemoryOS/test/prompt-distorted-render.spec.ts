import { describe, expect, it } from 'vitest';
import { PromptAssemblyService } from '../src/services/prompt-assembly-service';
import type { MemoryRetentionProjection } from '../src/core/memory-retention-core';

describe('PromptAssemblyService distorted render', () => {
    it('distorted 阶段会使用失真语气而不是模糊记得', () => {
        const service = new PromptAssemblyService('chat-test', {} as never, undefined) as unknown as {
            renderRoleEntryText: (
                entry: { title: string; summary: string; detail?: string; timeContext?: undefined },
                retention: MemoryRetentionProjection,
                currentMaxFloor?: number,
            ) => string;
        };

        const rendered = service.renderRoleEntryText(
            {
                title: '森林中的救援',
                summary: '在野兽袭击后的余痛尚未散尽时，塞拉菲娜把你从森林深处带回林间空地并安置治疗。',
            },
            {
                retentionScore: 22,
                retrievalWeight: 0.12,
                promptRenderStage: 'distorted',
                forgottenLevel: 'shadow_forgotten',
                shadowTriggered: true,
                canRecall: true,
                shadowRecallPenalty: 0.42,
                shadowConfidencePenalty: 0.38,
                rawMemoryPercent: 8,
                effectiveMemoryPercent: 12,
                explainReasonCodes: ['retention_stage_distorted'],
                distortionTemplateId: 'critical_fact_fragmented',
            },
            0,
        );

        expect(rendered).toContain('顺序也对不上');
        expect(rendered).not.toContain('她只模糊记得');
    });
});
