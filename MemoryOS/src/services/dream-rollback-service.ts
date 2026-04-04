import type { EntryRepository } from '../repository/entry-repository';
import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamMaintenanceProposalRecord,
    DreamRollbackMetadataRecord,
    DreamSessionRecord,
} from './dream-types';

/**
 * 功能：回滚某次 dream session 对主链的影响。
 */
export class DreamRollbackService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly dreamRepository: DreamSessionRepository;

    constructor(input: { chatKey: string; repository: EntryRepository }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.repository = input.repository;
        this.dreamRepository = new DreamSessionRepository(this.chatKey);
    }

    async rollbackDreamSession(dreamId: string): Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[]; }> {
        const session = await this.dreamRepository.getDreamSessionById(dreamId);
        if (!session.rollback) {
            return { ok: false, reasonCode: 'dream_rollback_snapshot_missing', rolledBackEntryIds: [], rolledBackRelationshipIds: [] };
        }
        const rollbackMetadata = session.rollbackMetadata;
        const beforeEntryMap = new Map(session.rollback.before.entries.map((entry) => [entry.entryId, entry]));
        const afterEntryIds = new Set((session.rollback.after?.entries ?? []).map((entry) => entry.entryId));
        const rolledBackEntryIds: string[] = [];
        const rolledBackRelationshipIds: string[] = [];

        for (const entry of session.rollback.before.entries) {
            await this.repository.saveEntry({
                ...entry,
            }, {
                actionType: 'UPDATE',
                sourceLabel: '梦境回滚恢复',
                reasonCodes: ['dream_phase3', 'dream_rollback'],
            });
            rolledBackEntryIds.push(entry.entryId);
        }

        const candidateCreatedEntryIds = (rollbackMetadata?.affectedEntryIds ?? [])
            .filter((entryId: string): boolean => !beforeEntryMap.has(entryId) && afterEntryIds.has(entryId));
        for (const entryId of candidateCreatedEntryIds) {
            await this.repository.deleteEntry(entryId, {
                actionType: 'DELETE',
                sourceLabel: '梦境回滚删除新增条目',
                reasonCodes: ['dream_phase3', 'dream_rollback'],
            });
            rolledBackEntryIds.push(entryId);
        }

        for (const relationship of session.rollback.before.relationships) {
            await this.repository.saveRelationship({
                ...relationship,
            });
            rolledBackRelationshipIds.push(relationship.relationshipId);
        }

        await this.markMaintenanceRolledBack(session.maintenanceProposals);

        const metadata: DreamRollbackMetadataRecord = {
            ...(rollbackMetadata ?? {
                dreamId,
                chatKey: this.chatKey,
                status: 'applied',
                appliedMutationIds: [],
                appliedMaintenanceProposalIds: [],
                affectedEntryIds: rolledBackEntryIds,
                affectedRelationshipIds: rolledBackRelationshipIds,
                summaryCandidateIds: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }),
            status: 'rolled_back',
            affectedEntryIds: Array.from(new Set([...(rollbackMetadata?.affectedEntryIds ?? []), ...rolledBackEntryIds])),
            affectedRelationshipIds: Array.from(new Set([...(rollbackMetadata?.affectedRelationshipIds ?? []), ...rolledBackRelationshipIds])),
            rolledBackAt: Date.now(),
            updatedAt: Date.now(),
        };
        await this.dreamRepository.saveDreamRollbackMetadata(metadata);
        if (session.meta) {
            await this.dreamRepository.saveDreamSessionMeta({
                ...session.meta,
                status: 'rolled_back',
                updatedAt: Date.now(),
            });
        }
        return {
            ok: true,
            rolledBackEntryIds: Array.from(new Set(rolledBackEntryIds)),
            rolledBackRelationshipIds: Array.from(new Set(rolledBackRelationshipIds)),
        };
    }

    async rollbackDreamMutation(dreamId: string, mutationId: string): Promise<{ ok: boolean; reasonCode?: string; rolledBackEntryIds: string[]; rolledBackRelationshipIds: string[] }> {
        const session = await this.dreamRepository.getDreamSessionById(dreamId);
        if (!session.rollback || !session.output) {
            return { ok: false, reasonCode: 'dream_session_missing', rolledBackEntryIds: [], rolledBackRelationshipIds: [] };
        }
        const targetMutation = session.output.proposedMutations.find((item) => item.mutationId === mutationId);
        if (!targetMutation) {
            return { ok: false, reasonCode: 'dream_mutation_missing', rolledBackEntryIds: [], rolledBackRelationshipIds: [] };
        }

        const rolledBackEntryIds: string[] = [];
        const rolledBackRelationshipIds: string[] = [];
        const beforeEntryMap = new Map(session.rollback.before.entries.map((entry) => [entry.entryId, entry]));

        if (targetMutation.mutationType === 'entry_create') {
            const payloadTitle = String(targetMutation.payload.title ?? '').trim().toLowerCase();
            const afterEntries = session.rollback.after?.entries ?? [];
            const createdEntries = afterEntries.filter((entry) => {
                if (beforeEntryMap.has(entry.entryId)) {
                    return false;
                }
                const dp = entry.detailPayload as Record<string, unknown> | undefined;
                if (dp && dp.dreamId === dreamId) {
                    return true;
                }
                if (payloadTitle && entry.title.trim().toLowerCase() === payloadTitle) {
                    return true;
                }
                return false;
            });
            for (const entry of createdEntries) {
                await this.repository.deleteEntry(entry.entryId, {
                    actionType: 'DELETE',
                    sourceLabel: '梦境单条 mutation 回滚', 
                    reasonCodes: ['dream_phase3', 'dream_mutation_rollback'],
                });
                rolledBackEntryIds.push(entry.entryId);
            }
        } else if (targetMutation.mutationType === 'entry_patch') {
            const patchTargetId = String(targetMutation.payload.entryId ?? '').trim();
            if (patchTargetId) {
                const beforeEntry = beforeEntryMap.get(patchTargetId);
                if (beforeEntry) {
                    await this.repository.saveEntry({ ...beforeEntry }, {
                        actionType: 'UPDATE',
                        sourceLabel: '梦境单条 mutation 回滚',
                        reasonCodes: ['dream_phase3', 'dream_mutation_rollback'],
                    });
                    rolledBackEntryIds.push(patchTargetId);
                }
            }
        } else if (targetMutation.mutationType === 'relationship_patch') {
            const patchRelId = String(targetMutation.payload.relationshipId ?? '').trim();
            if (patchRelId) {
                const beforeRel = session.rollback.before.relationships.find((r) => r.relationshipId === patchRelId);
                if (beforeRel) {
                    await this.repository.saveRelationship({ ...beforeRel });
                    rolledBackRelationshipIds.push(beforeRel.relationshipId);
                }
            }
        }

        const rollbackMetadata = session.rollbackMetadata;
        if (rollbackMetadata) {
            await this.dreamRepository.saveDreamRollbackMetadata({
                ...rollbackMetadata,
                affectedEntryIds: Array.from(new Set([...(rollbackMetadata.affectedEntryIds ?? []), ...rolledBackEntryIds])),
                affectedRelationshipIds: Array.from(new Set([...(rollbackMetadata.affectedRelationshipIds ?? []), ...rolledBackRelationshipIds])),
                updatedAt: Date.now(),
            });
        }

        return {
            ok: true,
            rolledBackEntryIds: Array.from(new Set(rolledBackEntryIds)),
            rolledBackRelationshipIds: Array.from(new Set(rolledBackRelationshipIds)),
        };
    }

    private async markMaintenanceRolledBack(proposals: DreamMaintenanceProposalRecord[]): Promise<void> {
        for (const proposal of proposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'applied')) {
            await this.dreamRepository.saveDreamMaintenanceProposal({
                ...proposal,
                status: 'rolled_back',
                rolledBackAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    }
}
