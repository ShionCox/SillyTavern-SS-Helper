import { describe, expect, it } from 'vitest';
import { PromptAssemblyService } from '../src/services/prompt-assembly-service';

describe('PromptAssemblyService distorted render', () => {
    it('distorted 阶段会使用失真语气而不是模糊记得', () => {
        const service = new PromptAssemblyService('chat-test', {} as never, undefined) as unknown as {
            renderRoleEntryText: (
                entry: { title: string; summary: string; detail?: string; timeContext?: undefined },
                stage: 'clear' | 'blur' | 'distorted',
                distortionTemplateId?: string,
                currentMaxFloor?: number,
            ) => string;
        };

        const rendered = service.renderRoleEntryText(
            {
                title: '森林中的救援',
                summary: '在野兽袭击后的余痛尚未散尽时，塞拉菲娜把你从森林深处带回林间空地并安置治疗。',
            },
            'distorted',
            'critical_fact_fragmented',
            0,
        );

        expect(rendered).toContain('顺序也对不上');
        expect(rendered).not.toContain('她只模糊记得');
    });
});
