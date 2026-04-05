import type { EntryRepository } from '../repository/entry-repository';
import type { DreamRecallCandidate } from './dream-types';
import type {
    DreamMaintenanceProposalRecord,
    DreamSessionOutputRecord,
    DreamSessionRecallRecord,
} from './dream-types';

/** 各类 maintenance proposal 的基础 confidence */
const BASE_CONFIDENCE_COMPRESSION = 0.65;
const BASE_CONFIDENCE_REINFORCEMENT = 0.68;
const BASE_CONFIDENCE_SHADOW = 0.60;
const BASE_CONFIDENCE_SUMMARY = 0.66;

type CandidateMap = Map<string, DreamRecallCandidate>;

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)));
}

/**
 * 功能：根据 dream 输出生成第三阶段 maintenance proposal。
 */
export class DreamPostProcessingService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;

    constructor(input: { chatKey: string; repository: EntryRepository }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.repository = input.repository;
    }

    async buildDreamMaintenanceProposals(input: {
        dreamId: string;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        output: DreamSessionOutputRecord;
        candidateMap: CandidateMap;
        maxProposals: number;
    }): Promise<DreamMaintenanceProposalRecord[]> {
        const proposals: DreamMaintenanceProposalRecord[] = [];
        const entries = await this.repository.listEntries();
        const relationships = await this.repository.listRelationships();

        const compression = this.buildCompressionProposal(input);
        if (compression) {
            proposals.push(compression);
        }

        const relationProposal = this.buildRelationReinforcementProposal(input, relationships);
        if (relationProposal) {
            proposals.push(relationProposal);
        }

        const shadowProposal = this.buildShadowAdjustmentProposal(input, entries);
        if (shadowProposal) {
            proposals.push(shadowProposal);
        }

        const summaryProposal = this.buildSummaryCandidatePromotion(input);
        if (summaryProposal) {
            proposals.push(summaryProposal);
        }

        return proposals.slice(0, Math.max(1, input.maxProposals));
    }

    buildCompressionProposal(input: {
        dreamId: string;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        output: DreamSessionOutputRecord;
        candidateMap: CandidateMap;
    }): DreamMaintenanceProposalRecord | null {
        const topHits = input.recall.fusedHits.slice(0, 4);
        if (topHits.length < 2) {
            return null;
        }
        const primary = topHits[0]!;
        const sharedTags = topHits.slice(1)
            .flatMap((item) => item.tags)
            .filter((tag: string): boolean => primary.tags.includes(tag));
        if (sharedTags.length <= 0) {
            return null;
        }
        const overlapBonus = Math.min(0.15, sharedTags.length * 0.03);
        const countBonus = Math.min(0.1, (topHits.length - 2) * 0.05);
        return {
            proposalId: `dream_maint:${input.dreamId}:compression`,
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            proposalType: 'memory_compression',
            status: 'pending',
            confidence: Math.min(0.95, BASE_CONFIDENCE_COMPRESSION + overlapBonus + countBonus),
            reason: '多条高重合记忆共享主题标签，适合做压缩整理提案。',
            sourceEntryIds: topHits.map((item) => item.entryId),
            sourceNodeKeys: Array.from(new Set(topHits.flatMap((item) => input.candidateMap.get(item.entryId)?.sourceNodeKeys ?? []))).slice(0, 8),
            preview: `压缩 ${topHits.length} 条相近记忆到 ${primary.title}`,
            payload: {
                primaryEntryId: primary.entryId,
                secondaryEntryIds: topHits.slice(1).map((item) => item.entryId),
                sharedTags: normalizeTags(sharedTags).slice(0, 8),
                consolidatedSummary: input.output.highlights[0] || input.output.narrative.slice(0, 120),
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    buildRelationReinforcementProposal(
        input: {
            dreamId: string;
            recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
            output: DreamSessionOutputRecord;
            candidateMap: CandidateMap;
        },
        relationships: Awaited<ReturnType<EntryRepository['listRelationships']>>,
    ): DreamMaintenanceProposalRecord | null {
        const actorCounter = new Map<string, number>();
        input.recall.fusedHits.forEach((hit) => {
            hit.actorKeys.forEach((actorKey: string): void => {
                actorCounter.set(actorKey, (actorCounter.get(actorKey) ?? 0) + 1);
            });
        });
        const dominantActors = Array.from(actorCounter.entries())
            .filter(([, count]) => count >= 2)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 2)
            .map(([actorKey]) => actorKey);
        if (dominantActors.length < 2) {
            return null;
        }
        const relation = relationships.find((item) => {
            return dominantActors.every((actorKey: string): boolean => item.participants.includes(actorKey));
        });
        if (!relation) {
            return null;
        }
        const coActivationBonus = Math.min(0.15, (dominantActors.length - 1) * 0.05
            + actorCounter.get(dominantActors[0]!)! * 0.02);
        return {
            proposalId: `dream_maint:${input.dreamId}:relation`,
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            proposalType: 'relationship_reinforcement',
            status: 'pending',
            confidence: Math.min(0.95, BASE_CONFIDENCE_REINFORCEMENT + coActivationBonus),
            reason: '同一组角色在梦境回声中被反复激活，适合提高关系权重。',
            sourceEntryIds: input.recall.fusedHits.filter((hit) => hit.actorKeys.some((actorKey) => dominantActors.includes(actorKey))).map((hit) => hit.entryId).slice(0, 6),
            sourceNodeKeys: Array.from(new Set(dominantActors.map((actorKey: string): string => `actor:${actorKey}`))),
            preview: `强化关系 ${relation.relationTag || relation.relationshipId}`,
            payload: {
                relationshipId: relation.relationshipId,
                participants: relation.participants,
                trustDelta: 6,
                affectionDelta: 4,
                summaryHint: input.output.highlights[0] || '梦境检测到该关系长期重复出现。',
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    buildShadowAdjustmentProposal(
        input: {
            dreamId: string;
            recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
            output: DreamSessionOutputRecord;
            candidateMap: CandidateMap;
        },
        entries: Awaited<ReturnType<EntryRepository['listEntries']>>,
    ): DreamMaintenanceProposalRecord | null {
        const deepCandidate = input.recall.deepHits
            .find((hit) => {
                const entry = entries.find((item) => item.entryId === hit.entryId);
                if (!entry) {
                    return false;
                }
                return hit.score < 0.45 && (entry.tags ?? []).length <= 2;
            });
        if (!deepCandidate) {
            return null;
        }
        const depthPenalty = Math.max(0, 0.1 - (deepCandidate.score * 0.15));
        return {
            proposalId: `dream_maint:${input.dreamId}:shadow`,
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            proposalType: 'shadow_adjustment',
            status: 'pending',
            confidence: Math.min(0.95, BASE_CONFIDENCE_SHADOW + depthPenalty),
            reason: '深层记忆长期低活跃且价值较弱，适合做 shadow 调整而不是删除。',
            sourceEntryIds: [deepCandidate.entryId],
            sourceNodeKeys: input.candidateMap.get(deepCandidate.entryId)?.sourceNodeKeys ?? [],
            preview: `降低 ${deepCandidate.title} 的显性召回权重`,
            payload: {
                entryId: deepCandidate.entryId,
                shadowLevel: 'mild',
                retrievalPenaltyDelta: 0.12,
                detailHint: 'dream_phase3_shadow_adjustment',
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    buildSummaryCandidatePromotion(input: {
        dreamId: string;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        output: DreamSessionOutputRecord;
        candidateMap: CandidateMap;
    }): DreamMaintenanceProposalRecord | null {
        const sourceEntryIds = input.output.proposedMutations.flatMap((mutation) => mutation.sourceEntryIds).slice(0, 6);
        if (input.output.highlights.length <= 0 && sourceEntryIds.length <= 0) {
            return null;
        }
        const highlightBonus = Math.min(0.15, input.output.highlights.length * 0.04);
        const sourceBonus = Math.min(0.1, sourceEntryIds.length * 0.02);
        return {
            proposalId: `dream_maint:${input.dreamId}:summary`,
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            proposalType: 'summary_candidate_promotion',
            status: 'pending',
            confidence: Math.min(0.95, BASE_CONFIDENCE_SUMMARY + highlightBonus + sourceBonus),
            reason: '本轮梦境洞察可作为后续总结流程的候选材料。',
            sourceEntryIds,
            sourceNodeKeys: Array.from(new Set(sourceEntryIds.flatMap((entryId: string): string[] => input.candidateMap.get(entryId)?.sourceNodeKeys ?? []))).slice(0, 8),
            preview: `推广 ${Math.max(1, input.output.highlights.length)} 条梦境洞察到总结候选`,
            payload: {
                candidateTitle: `梦境洞察 ${new Date().toLocaleString('zh-CN')}`,
                candidateSummary: input.output.highlights.join('；') || input.output.narrative.slice(0, 160),
                sourceHighlights: input.output.highlights,
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }
}
