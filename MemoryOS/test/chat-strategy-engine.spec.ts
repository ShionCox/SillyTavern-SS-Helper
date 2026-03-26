import { describe, expect, it } from 'vitest';
import { decideInjectionIntent } from '../src/core/chat-strategy-engine';

describe('chat strategy engine', (): void => {
    it('设定问句会稳定判定为 setting_qa', (): void => {
        const intent = decideInjectionIntent({
            query: '厄尔多利亚是什么地方',
            profile: {
                chatType: 'solo',
                stylePreference: 'story',
                memoryStrength: 'medium',
                extractStrategy: 'facts_relations',
                summaryStrategy: 'layered',
                vectorStrategy: {
                    enabled: true,
                    chunkThreshold: 240,
                    rerankThreshold: 6,
                    idleDecayDays: 14,
                    lowPrecisionSearchStride: 3,
                },
                deletionStrategy: 'soft_delete',
            },
            metrics: null as any,
        });
        expect(intent).toBe('setting_qa');
    });
});
