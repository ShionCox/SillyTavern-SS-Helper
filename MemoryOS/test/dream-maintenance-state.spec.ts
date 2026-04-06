import { describe, expect, it } from 'vitest';
import {
    isDreamMaintenanceClosedSession,
    isDreamMaintenancePending,
    resolveDreamMaintenanceEffectiveStatus,
} from '../src/services/dream-maintenance-state';
import type {
    DreamMaintenanceProposalRecord,
    DreamSessionRecord,
    DreamSessionStatus,
} from '../src/services/dream-types';

function createPendingProposal(): DreamMaintenanceProposalRecord {
    return {
        proposalId: 'dream_maint:test:summary',
        dreamId: 'dream:test',
        chatKey: 'chat:test',
        proposalType: 'summary_candidate_promotion',
        status: 'pending',
        confidence: 0.8,
        reason: 'test',
        sourceEntryIds: [],
        sourceNodeKeys: [],
        preview: 'test',
        payload: {},
        createdAt: 1,
        updatedAt: 1,
    };
}

function createSession(status: DreamSessionStatus): DreamSessionRecord {
    return {
        meta: {
            dreamId: 'dream:test',
            chatKey: 'chat:test',
            status,
            triggerReason: 'manual',
            createdAt: 1,
            updatedAt: 1,
            settingsSnapshot: {
                retrievalMode: 'lexical_only',
                dreamContextMaxChars: 4000,
            },
        },
        recall: null,
        output: null,
        approval: null,
        rollback: null,
        diagnostics: null,
        graphSnapshot: null,
        maintenanceProposals: [],
        qualityReport: null,
        rollbackMetadata: null,
    };
}

describe('dream-maintenance-state', () => {
    it('会把已关闭梦境下的 pending 维护视为已拒绝', () => {
        const proposal = createPendingProposal();
        const rejectedSession = createSession('rejected');

        expect(isDreamMaintenanceClosedSession(rejectedSession)).toBe(true);
        expect(resolveDreamMaintenanceEffectiveStatus(proposal, rejectedSession)).toBe('rejected');
        expect(isDreamMaintenancePending(proposal, rejectedSession)).toBe(false);
    });

    it('会保留活跃梦境中的 pending 维护状态', () => {
        const proposal = createPendingProposal();
        const generatedSession = createSession('generated');

        expect(isDreamMaintenanceClosedSession(generatedSession)).toBe(false);
        expect(resolveDreamMaintenanceEffectiveStatus(proposal, generatedSession)).toBe('pending');
        expect(isDreamMaintenancePending(proposal, generatedSession)).toBe(true);
    });
});
