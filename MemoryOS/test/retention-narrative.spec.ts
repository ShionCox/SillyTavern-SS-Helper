import { describe, expect, it } from 'vitest';
import { computeRetentionState, renderRetentionNarrativePrefix } from '../src/memory-retention';

describe('retention narrative stage', () => {
    it('maps percent to clear/blur/distorted and returns narrative prefix', () => {
        expect(computeRetentionState({ memoryPercent: 95 }).stage).toBe('clear');
        expect(computeRetentionState({ memoryPercent: 50 }).stage).toBe('blur');
        expect(computeRetentionState({ memoryPercent: 10 }).stage).toBe('distorted');

        expect(renderRetentionNarrativePrefix('clear')).toContain('记得');
        expect(renderRetentionNarrativePrefix('blur')).toBe('她隐约记得：');
        expect(renderRetentionNarrativePrefix('distorted')).toBe('她记忆失真，误以为：');
    });
});
