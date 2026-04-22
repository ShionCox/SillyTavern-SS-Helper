import type { EntryRepository } from '../repository/entry-repository';
import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamMaintenanceProposalRecord,
    DreamRollbackMetadataRecord,
} from './dream-types';
import type { ResolvedDreamExecutionPlan } from './dream-execution-mode';
import type { MemoryEntry, MemoryRelationshipRecord } from '../types';

type ApplyDreamMaintenanceResult = {
    appliedProposalIds: string[];
    affectedEntryIds: string[];
    affectedRelationshipIds: string[];
    summaryCandidateIds: string[];
};

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：把 dream maintenance proposal 纳入统一计划并按需应用。
 */
export class DreamMaintenancePlanner {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly dreamRepository: DreamSessionRepository;

    constructor(input: { chatKey: string; repository: EntryRepository }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.repository = input.repository;
        this.dreamRepository = new DreamSessionRepository(this.chatKey);
    }

    async scheduleDreamMaintenance(input: {
        proposals: DreamMaintenanceProposalRecord[];
    }): Promise<DreamMaintenanceProposalRecord[]> {
        const ordered = [...input.proposals].sort((left, right): number => right.confidence - left.confidence);
        for (const proposal of ordered) {
            await this.dreamRepository.saveDreamMaintenanceProposal(proposal);
        }
        return ordered;
    }

    async applyDreamMaintenanceProposal(proposal: DreamMaintenanceProposalRecord): Promise<DreamMaintenanceProposalRecord> {
        const before = await this.readRollbackBefore(proposal);
        let appliedResult: DreamMaintenanceProposalRecord['appliedResult'] = {
            affectedEntryIds: [],
            affectedRelationshipIds: [],
            summaryCandidateIds: [],
        };

        if (proposal.proposalType === 'memory_compression') {
            appliedResult = await this.applyCompressionProposal(proposal);
        } else if (proposal.proposalType === 'relationship_reinforcement') {
            appliedResult = await this.applyRelationshipReinforcementProposal(proposal);
        } else if (proposal.proposalType === 'shadow_adjustment') {
            appliedResult = await this.applyShadowAdjustmentProposal(proposal);
        } else if (proposal.proposalType === 'summary_candidate_promotion') {
            appliedResult = await this.applySummaryCandidatePromotionProposal(proposal);
        }

        const nextRecord: DreamMaintenanceProposalRecord = {
            ...proposal,
            status: 'applied',
            updatedAt: Date.now(),
            appliedAt: Date.now(),
            rollbackBefore: before,
            appliedResult,
        };
        await this.dreamRepository.saveDreamMaintenanceProposal(nextRecord);
        return nextRecord;
    }

    canAutoApplyProposal(proposal: DreamMaintenanceProposalRecord, input?: {
        plan?: ResolvedDreamExecutionPlan;
        minConfidence?: number;
    }): boolean {
        const minConfidence = input?.minConfidence ?? 0.75;
        if (input?.plan && !input.plan.allowAutoApplyLowRiskMaintenance) {
            return false;
        }
        if (proposal.confidence < minConfidence) {
            return false;
        }
        if (proposal.proposalType === 'memory_compression') {
            return false;
        }
        if (proposal.proposalType === 'summary_candidate_promotion') {
            return proposal.confidence >= Math.max(minConfidence, 0.8);
        }
        return proposal.proposalType === 'shadow_adjustment'
            || proposal.proposalType === 'relationship_reinforcement';
    }

    async mergeAppliedMaintenanceIntoRollback(input: {
        dreamId: string;
        appliedProposals: DreamMaintenanceProposalRecord[];
    }): Promise<void> {
        if (input.appliedProposals.length <= 0) {
            return;
        }
        const existing = await this.dreamRepository.getDreamSessionById(input.dreamId);
        const previous: DreamRollbackMetadataRecord = existing.rollbackMetadata ?? {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            status: 'applied',
            appliedMutationIds: [],
            appliedMaintenanceProposalIds: [],
            affectedEntryIds: [],
            affectedRelationshipIds: [],
            summaryCandidateIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const merged: DreamRollbackMetadataRecord = {
            ...previous,
            status: 'applied',
            appliedMaintenanceProposalIds: Array.from(new Set([
                ...previous.appliedMaintenanceProposalIds,
                ...input.appliedProposals.map((proposal: DreamMaintenanceProposalRecord): string => proposal.proposalId),
            ])),
            affectedEntryIds: Array.from(new Set([
                ...previous.affectedEntryIds,
                ...input.appliedProposals.flatMap((proposal: DreamMaintenanceProposalRecord): string[] => proposal.appliedResult?.affectedEntryIds ?? []),
            ])),
            affectedRelationshipIds: Array.from(new Set([
                ...previous.affectedRelationshipIds,
                ...input.appliedProposals.flatMap((proposal: DreamMaintenanceProposalRecord): string[] => proposal.appliedResult?.affectedRelationshipIds ?? []),
            ])),
            summaryCandidateIds: Array.from(new Set([
                ...previous.summaryCandidateIds,
                ...input.appliedProposals.flatMap((proposal: DreamMaintenanceProposalRecord): string[] => proposal.appliedResult?.summaryCandidateIds ?? []),
            ])),
            updatedAt: Date.now(),
        };
        await this.dreamRepository.saveDreamRollbackMetadata(merged);
    }

    private async applyCompressionProposal(proposal: DreamMaintenanceProposalRecord): Promise<ApplyDreamMaintenanceResult['appliedProposalIds'] extends never ? never : DreamMaintenanceProposalRecord['appliedResult']> {
        const payload = toRecord(proposal.payload);
        const primaryEntryId = normalizeText(payload.primaryEntryId);
        const secondaryEntryIds: string[] = Array.isArray(payload.secondaryEntryIds)
            ? payload.secondaryEntryIds.map((id: unknown): string => normalizeText(id)).filter(Boolean)
            : [];
        const entry = primaryEntryId ? await this.repository.getEntry(primaryEntryId) : null;
        if (!entry) {
            return {
                affectedEntryIds: [],
                affectedRelationshipIds: [],
                summaryCandidateIds: [],
            };
        }
        const consolidatedSummary = normalizeText(payload.consolidatedSummary);
        const secondarySummaries: string[] = [];
        const affectedEntryIds: string[] = [entry.entryId];
        for (const secondaryId of secondaryEntryIds) {
            const secondary = await this.repository.getEntry(secondaryId);
            if (!secondary) {
                continue;
            }
            if (secondary.summary) {
                secondarySummaries.push(secondary.summary);
            }
            await this.repository.saveEntry({
                ...secondary,
                tags: Array.from(new Set([...(secondary.tags ?? []), 'dream_compressed_shadow'])),
                detailPayload: {
                    ...toRecord(secondary.detailPayload),
                    retention: {
                        ...toRecord(toRecord(secondary.detailPayload).retention),
                        shadowLevel: 'compressed',
                        compressedIntoPrimaryId: primaryEntryId,
                        updatedAt: Date.now(),
                    },
                },
            }, {
                actionType: 'UPDATE',
                sourceLabel: '梦境维护压缩（次要条目降权）',
                reasonCodes: ['dream_phase3', 'memory_compression'],
            });
            affectedEntryIds.push(secondary.entryId);
        }
        const mergedDetail = [
            entry.detail,
            ...secondarySummaries.filter((s: string): boolean => !entry.detail.includes(s)),
        ].filter(Boolean).join('\n---\n');
        await this.repository.saveEntry({
            ...entry,
            summary: consolidatedSummary || entry.summary,
            detail: mergedDetail || entry.detail,
            tags: Array.from(new Set([...(entry.tags ?? []), 'dream_compression_candidate'])),
            detailPayload: {
                ...toRecord(entry.detailPayload),
                dreamCompression: {
                    secondaryEntryIds,
                    consolidatedSummary,
                    mergedSecondarySummaries: secondarySummaries,
                    updatedAt: Date.now(),
                },
            },
        }, {
            actionType: 'UPDATE',
            sourceLabel: '梦境维护压缩提案',
            reasonCodes: ['dream_phase3', 'memory_compression'],
        });
        return {
            affectedEntryIds,
            affectedRelationshipIds: [],
            summaryCandidateIds: [],
        };
    }

    private async applyRelationshipReinforcementProposal(proposal: DreamMaintenanceProposalRecord): Promise<DreamMaintenanceProposalRecord['appliedResult']> {
        const payload = toRecord(proposal.payload);
        const relationshipId = normalizeText(payload.relationshipId);
        const relationships = await this.repository.listRelationships();
        const existing = relationships.find((item: MemoryRelationshipRecord): boolean => item.relationshipId === relationshipId);
        if (!existing) {
            return {
                affectedEntryIds: [],
                affectedRelationshipIds: [],
                summaryCandidateIds: [],
            };
        }
        await this.repository.saveRelationship({
            ...existing,
            trust: Math.max(0, Math.min(100, existing.trust + Number(payload.trustDelta ?? 0))),
            affection: Math.max(0, Math.min(100, existing.affection + Number(payload.affectionDelta ?? 0))),
            summary: normalizeText(payload.summaryHint) || existing.summary,
        });
        return {
            affectedEntryIds: [],
            affectedRelationshipIds: [existing.relationshipId],
            summaryCandidateIds: [],
        };
    }

    private async applyShadowAdjustmentProposal(proposal: DreamMaintenanceProposalRecord): Promise<DreamMaintenanceProposalRecord['appliedResult']> {
        const payload = toRecord(proposal.payload);
        const entryId = normalizeText(payload.entryId);
        const existing = entryId ? await this.repository.getEntry(entryId) : null;
        if (!existing) {
            return {
                affectedEntryIds: [],
                affectedRelationshipIds: [],
                summaryCandidateIds: [],
            };
        }
        await this.repository.saveEntry({
            ...existing,
            detailPayload: {
                ...toRecord(existing.detailPayload),
                retention: {
                    ...toRecord(toRecord(existing.detailPayload).retention),
                    shadowLevel: normalizeText(payload.shadowLevel) || 'mild',
                    retrievalPenaltyDelta: Number(payload.retrievalPenaltyDelta ?? 0),
                    updatedAt: Date.now(),
                },
            },
        }, {
            actionType: 'UPDATE',
            sourceLabel: '梦境维护 shadow 调整',
            reasonCodes: ['dream_phase3', 'shadow_adjustment'],
        });
        return {
            affectedEntryIds: [existing.entryId],
            affectedRelationshipIds: [],
            summaryCandidateIds: [],
        };
    }

    private async applySummaryCandidatePromotionProposal(proposal: DreamMaintenanceProposalRecord): Promise<DreamMaintenanceProposalRecord['appliedResult']> {
        const payload = toRecord(proposal.payload);
        const saved = await this.repository.saveEntry({
            title: normalizeText(payload.candidateTitle) || '梦境洞察',
            entryType: 'dream_summary_candidate',
            summary: normalizeText(payload.candidateSummary),
            detail: normalizeText(payload.candidateSummary),
            tags: ['dream', 'dream_summary_candidate', 'summary_candidate'],
            detailPayload: {
                dreamSummaryCandidate: true,
                dreamSourceEntryIds: proposal.sourceEntryIds,
                dreamId: proposal.dreamId,
                sourceHighlights: Array.isArray(payload.sourceHighlights) ? payload.sourceHighlights : [],
            },
        }, {
            actionType: 'ADD',
            sourceLabel: '梦境维护总结候选',
            reasonCodes: ['dream_phase3', 'summary_candidate_promotion'],
        });
        return {
            affectedEntryIds: [saved.entryId],
            affectedRelationshipIds: [],
            summaryCandidateIds: [saved.entryId],
        };
    }

    private async readRollbackBefore(proposal: DreamMaintenanceProposalRecord): Promise<NonNullable<DreamMaintenanceProposalRecord['rollbackBefore']>> {
        const payload = toRecord(proposal.payload);
        const entryIds = Array.from(new Set([
            ...proposal.sourceEntryIds,
            normalizeText(payload.primaryEntryId),
            normalizeText(payload.entryId),
        ].filter(Boolean)));
        const relationshipIds = Array.from(new Set([
            normalizeText(payload.relationshipId),
        ].filter(Boolean)));
        const entries: MemoryEntry[] = [];
        for (const entryId of entryIds) {
            const entry = await this.repository.getEntry(entryId);
            if (entry) {
                entries.push(entry);
            }
        }
        const relationships = (await this.repository.listRelationships()).filter((item: MemoryRelationshipRecord): boolean => {
            return relationshipIds.includes(item.relationshipId);
        });
        return { entries, relationships };
    }
}
