import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    DreamMaintenanceProposalRecord,
    DreamRollbackMetadataRecord,
    DreamSessionMetaRecord,
    DreamSessionRecord,
} from '../src/services/dream-types';

const maintenanceUpdates: DreamMaintenanceProposalRecord[] = [];
const rollbackMetadataUpdates: DreamRollbackMetadataRecord[] = [];
const metaUpdates: DreamSessionMetaRecord[] = [];
let currentSession: DreamSessionRecord;

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            async getDreamSessionById(): Promise<DreamSessionRecord> {
                return currentSession;
            }

            async saveDreamMaintenanceProposal(record: DreamMaintenanceProposalRecord): Promise<void> {
                maintenanceUpdates.push(record);
            }

            async saveDreamRollbackMetadata(record: DreamRollbackMetadataRecord): Promise<void> {
                rollbackMetadataUpdates.push(record);
            }

            async saveDreamSessionMeta(record: DreamSessionMetaRecord): Promise<void> {
                metaUpdates.push(record);
            }
        },
    };
});

import { DreamRollbackService } from '../src/services/dream-rollback-service';

describe('DreamRollbackService', () => {
    beforeEach(() => {
        maintenanceUpdates.length = 0;
        rollbackMetadataUpdates.length = 0;
        metaUpdates.length = 0;
        currentSession = {
            meta: {
                dreamId: 'dream:test',
                chatKey: 'chat:test',
                status: 'approved',
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
            rollback: {
                dreamId: 'dream:test',
                chatKey: 'chat:test',
                rollbackKey: 'rollback:test',
                createdAt: 1,
                updatedAt: 1,
                touchedEntryIds: [],
                touchedRelationshipIds: [],
                before: {
                    entries: [],
                    relationships: [],
                },
                after: {
                    entries: [],
                    relationships: [],
                },
            },
            diagnostics: null,
            graphSnapshot: null,
            maintenanceProposals: [
                {
                    proposalId: 'dream_maint:dream:test:summary',
                    dreamId: 'dream:test',
                    chatKey: 'chat:test',
                    proposalType: 'summary_candidate_promotion',
                    status: 'pending',
                    confidence: 0.82,
                    reason: 'pending',
                    sourceEntryIds: [],
                    sourceNodeKeys: [],
                    preview: 'pending',
                    payload: {},
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    proposalId: 'dream_maint:dream:test:relation',
                    dreamId: 'dream:test',
                    chatKey: 'chat:test',
                    proposalType: 'relationship_reinforcement',
                    status: 'applied',
                    confidence: 0.9,
                    reason: 'applied',
                    sourceEntryIds: [],
                    sourceNodeKeys: [],
                    preview: 'applied',
                    payload: {},
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            qualityReport: null,
            rollbackMetadata: null,
        };
    });

    it('会在整次回滚时收口未处理和已应用的维护提案', async () => {
        const repository = {
            saveEntry: vi.fn(async () => undefined),
            deleteEntry: vi.fn(async () => undefined),
            saveRelationship: vi.fn(async () => undefined),
        } as any;
        const service = new DreamRollbackService({
            chatKey: 'chat:test',
            repository,
        });

        const result = await service.rollbackDreamSession('dream:test');

        expect(result.ok).toBe(true);
        expect(maintenanceUpdates).toHaveLength(2);
        expect(maintenanceUpdates.find((item) => item.proposalId.endsWith(':summary'))?.status).toBe('rejected');
        expect(maintenanceUpdates.find((item) => item.proposalId.endsWith(':relation'))?.status).toBe('rolled_back');
        expect(metaUpdates[metaUpdates.length - 1]?.status).toBe('rolled_back');
        expect(rollbackMetadataUpdates[rollbackMetadataUpdates.length - 1]?.status).toBe('rolled_back');
    });
});
