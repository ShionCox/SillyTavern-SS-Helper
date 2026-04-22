import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DreamMaintenancePlanner } from '../src/services/dream-maintenance-planner';
import type { DreamMaintenanceProposalRecord } from '../src/services/dream-types';

const savedMaintenanceRecords: DreamMaintenanceProposalRecord[] = [];

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            async saveDreamMaintenanceProposal(record: DreamMaintenanceProposalRecord): Promise<void> {
                savedMaintenanceRecords.push(record);
            }
        },
    };
});

/**
 * 功能：构建梦境维护提案。
 * @returns 梦境维护提案。
 */
function buildSummaryCandidateProposal(): DreamMaintenanceProposalRecord {
    return {
        proposalId: 'dream_maint:dream_1:summary',
        dreamId: 'dream_1',
        chatKey: 'chat_1',
        proposalType: 'summary_candidate_promotion',
        status: 'pending',
        confidence: 0.86,
        preview: '梦境洞察',
        reason: '这轮梦境洞察适合留给后续总结。',
        sourceEntryIds: ['entry_source'],
        payload: {
            candidateTitle: '梦境洞察 2026/4/22',
            candidateSummary: '实验室基地状态更新。',
            sourceHighlights: ['实验室基地状态更新'],
        },
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('DreamMaintenancePlanner', () => {
    beforeEach((): void => {
        savedMaintenanceRecords.length = 0;
    });

    it('summary_candidate_promotion 会保存为专用总结候选类型，不再创建 other 条目', async () => {
        const savedEntries: Array<Record<string, unknown>> = [];
        const repository = {
            getEntry: vi.fn(async () => null),
            listRelationships: vi.fn(async () => []),
            saveEntry: vi.fn(async (input: Record<string, unknown>) => {
                savedEntries.push(input);
                return {
                    entryId: 'entry_dream_candidate',
                    chatKey: 'chat_1',
                    ...input,
                };
            }),
        } as any;
        const planner = new DreamMaintenancePlanner({
            chatKey: 'chat_1',
            repository,
        });

        const applied = await planner.applyDreamMaintenanceProposal(buildSummaryCandidateProposal());

        expect(savedEntries[0]?.entryType).toBe('dream_summary_candidate');
        expect(savedEntries[0]?.entryType).not.toBe('other');
        expect((savedEntries[0]?.detailPayload as Record<string, unknown>)?.dreamSummaryCandidate).toBe(true);
        expect(applied.appliedResult?.summaryCandidateIds).toEqual(['entry_dream_candidate']);
        expect(savedMaintenanceRecords[0]?.status).toBe('applied');
    });
});
