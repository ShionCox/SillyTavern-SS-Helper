import { describe, expect, it } from 'vitest';
import { SummaryPromptDTOService } from '../src/services/summary-prompt-dto-service';

describe('SummaryPromptDTOService', () => {
    it('会把 summary 候选压缩成短引用，并保留反解映射', () => {
        const service = new SummaryPromptDTOService();
        const result = service.build({
            candidates: [
                {
                    candidateId: 'cand_1',
                    entryId: 'entry:tavern:11111111-1111-1111-1111-111111111111',
                    targetKind: 'relationship',
                    title: '关系状态',
                    summary: '旧关系仍在持续。',
                    compareKey: 'ck:v2:relationship:user:seraphina',
                },
            ],
        });

        expect(result.candidates[0]?.candidateRef).toBe('S1');
        expect(result.candidates[0]?.entryRef).toBe('E1');
        expect(result.candidateRefToCandidateId.get('S1')).toBe('cand_1');
        expect(result.entryRefToEntryId.get('E1')).toBe('entry:tavern:11111111-1111-1111-1111-111111111111');
        expect(JSON.stringify(result.candidates)).not.toContain('entry:tavern:11111111-1111-1111-1111-111111111111');
    });
});
