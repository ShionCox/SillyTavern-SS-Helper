import { describe, expect, it } from 'vitest';
import { PromptReferenceService } from '../src/services/prompt-reference-service';

describe('PromptReferenceService', () => {
    it('会为同一类型生成稳定 alias，并支持反解', () => {
        const service = new PromptReferenceService();

        const entryRefA = service.encode('entry', 'entry:alpha');
        const entryRefAAgain = service.encode('entry', 'entry:alpha');
        const entryRefB = service.encode('entry', 'entry:beta');
        const relationRef = service.encode('relationship', 'relationship:1');

        expect(entryRefA).toBe('E1');
        expect(entryRefAAgain).toBe('E1');
        expect(entryRefB).toBe('E2');
        expect(relationRef).toBe('R1');
        expect(service.decode('entry', 'E1')).toBe('entry:alpha');
        expect(service.decode('relationship', 'R1')).toBe('relationship:1');
    });

    it('遇到非法 alias 会拒绝解码', () => {
        const service = new PromptReferenceService();
        service.encode('entry', 'entry:alpha');
        expect(() => service.decode('entry', 'R1')).toThrowError(/prompt_reference_decode_failed/);
    });
});
