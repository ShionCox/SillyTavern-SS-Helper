import type { EntryRepository } from '../repository/entry-repository';
import type { MemoryRelationshipRecord } from '../types';
import type {
    UnifiedMemoryMutation,
    UnifiedMemoryMutationBatchContext,
    UnifiedRelationshipMutationApplyResult,
} from '../types/unified-mutation';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
}

export class RelationshipMutationService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;

    constructor(input: { chatKey: string; repository: EntryRepository }) {
        this.chatKey = normalizeText(input.chatKey);
        this.repository = input.repository;
    }

    async applyMutations(input: {
        mutations: UnifiedMemoryMutation[];
        context: UnifiedMemoryMutationBatchContext;
    }): Promise<UnifiedRelationshipMutationApplyResult> {
        const existingRelationships = await this.repository.listRelationships();
        const result: UnifiedRelationshipMutationApplyResult = {
            appliedRelationshipMutationIds: [],
            skippedMutationIds: [],
            createdRelationshipIds: [],
            updatedRelationshipIds: [],
            affectedRelationshipIds: [],
            historyWritten: false,
        };

        for (const [index, mutation] of input.mutations.entries()) {
            const mutationId = this.readMutationId(mutation, index);
            const action = normalizeText(mutation.action).toUpperCase();
            if (!action || action === 'NOOP') {
                result.skippedMutationIds.push(mutationId);
                continue;
            }
            const normalized = this.normalizeRelationshipMutation(mutation, existingRelationships);
            if (!normalized) {
                result.skippedMutationIds.push(mutationId);
                continue;
            }
            await this.repository.ensureActorProfile({ actorKey: normalized.sourceActorKey });
            await this.repository.ensureActorProfile({ actorKey: normalized.targetActorKey });
            for (const actorKey of normalized.participants) {
                await this.repository.ensureActorProfile({ actorKey });
            }
            const saved = await this.repository.saveRelationship(normalized.record);
            const wasExisting = existingRelationships.some((item: MemoryRelationshipRecord): boolean => item.relationshipId === saved.relationshipId);
            if (!wasExisting) {
                existingRelationships.push(saved);
                result.createdRelationshipIds.push(saved.relationshipId);
            } else {
                result.updatedRelationshipIds.push(saved.relationshipId);
            }
            result.appliedRelationshipMutationIds.push(mutationId);
            result.affectedRelationshipIds.push(saved.relationshipId);
        }

        await this.repository.appendMutationHistory({
            action: 'unified_relationship_mutation_batch_applied',
            payload: {
                source: input.context.source,
                sourceLabel: input.context.sourceLabel,
                chatKey: this.chatKey,
                mutationCount: input.mutations.length,
                result,
            },
        });
        result.historyWritten = true;
        result.affectedRelationshipIds = Array.from(new Set(result.affectedRelationshipIds));
        return result;
    }

    private normalizeRelationshipMutation(
        mutation: UnifiedMemoryMutation,
        relationships: MemoryRelationshipRecord[],
    ): {
        sourceActorKey: string;
        targetActorKey: string;
        participants: string[];
        record: Omit<MemoryRelationshipRecord, 'chatKey' | 'createdAt' | 'updatedAt' | 'relationshipId'> & {
            relationshipId?: string;
            createdAt?: number;
            updatedAt?: number;
        };
    } | null {
        const payload = toRecord(mutation.detailPayload);
        const sourceContext = toRecord(mutation.sourceContext);
        const relationshipId = normalizeText(payload.relationshipId ?? sourceContext.relationshipId);
        const sourceActorKey = normalizeText(payload.sourceActorKey ?? sourceContext.sourceActorKey);
        const targetActorKey = normalizeText(payload.targetActorKey ?? sourceContext.targetActorKey);
        const relationTag = normalizeText(payload.relationTag ?? sourceContext.relationTag ?? mutation.title);
        const existing = relationshipId
            ? relationships.find((item: MemoryRelationshipRecord): boolean => item.relationshipId === relationshipId)
            : relationships.find((item: MemoryRelationshipRecord): boolean => {
                return item.sourceActorKey === sourceActorKey
                    && item.targetActorKey === targetActorKey
                    && item.relationTag === relationTag;
            });
        const resolvedSourceActorKey = sourceActorKey || existing?.sourceActorKey || '';
        const resolvedTargetActorKey = targetActorKey || existing?.targetActorKey || '';
        const resolvedRelationTag = relationTag || existing?.relationTag || '';
        if (!resolvedSourceActorKey || !resolvedTargetActorKey || !resolvedRelationTag) {
            return null;
        }
        const action = normalizeText(mutation.action).toUpperCase();
        const participants = toStringArray(payload.participants ?? [resolvedSourceActorKey, resolvedTargetActorKey]);
        const validTo = action === 'INVALIDATE'
            ? (mutation.validTo ?? mutation.timeContext ?? existing?.validTo)
            : (mutation.validTo ?? existing?.validTo);
        return {
            sourceActorKey: resolvedSourceActorKey,
            targetActorKey: resolvedTargetActorKey,
            participants,
            record: {
                relationshipId: existing?.relationshipId ?? (relationshipId || undefined),
                sourceActorKey: resolvedSourceActorKey,
                targetActorKey: resolvedTargetActorKey,
                relationTag: resolvedRelationTag,
                state: normalizeText(payload.state ?? existing?.state),
                summary: normalizeText(mutation.summary ?? payload.summary ?? existing?.summary),
                trust: Number(payload.trust ?? existing?.trust ?? 0),
                affection: Number(payload.affection ?? existing?.affection ?? 0),
                tension: Number(payload.tension ?? existing?.tension ?? 0),
                participants,
                ...(mutation.timeContext ? { timeContext: mutation.timeContext } : (existing?.timeContext ? { timeContext: existing.timeContext } : {})),
                ...(mutation.validFrom ? { validFrom: mutation.validFrom } : (existing?.validFrom ? { validFrom: existing.validFrom } : {})),
                ...(validTo ? { validTo } : {}),
                ongoing: action === 'INVALIDATE' ? false : (mutation.ongoing ?? existing?.ongoing ?? true),
            },
        };
    }

    private readMutationId(mutation: UnifiedMemoryMutation, index: number): string {
        const sourceContext = toRecord(mutation.sourceContext);
        return normalizeText(sourceContext.mutationId) || `relationship_mutation_${index + 1}`;
    }
}
