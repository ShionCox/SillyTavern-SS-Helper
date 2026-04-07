import type { EntryRepository } from '../repository/entry-repository';
import type { ApplyLedgerMutationBatchResult } from '../types';
import type {
    UnifiedMemoryMutation,
    UnifiedMemoryMutationApplyResult,
    UnifiedMemoryMutationBatchContext,
} from '../types/unified-mutation';
import { RelationshipMutationService } from './relationship-mutation-service';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

export class UnifiedMemoryMutationService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly relationshipMutationService: RelationshipMutationService;

    constructor(input: { chatKey: string; repository: EntryRepository }) {
        this.chatKey = normalizeText(input.chatKey);
        this.repository = input.repository;
        this.relationshipMutationService = new RelationshipMutationService(input);
    }

    async applyMutations(input: {
        mutations: UnifiedMemoryMutation[];
        context: UnifiedMemoryMutationBatchContext;
    }): Promise<UnifiedMemoryMutationApplyResult> {
        const entryMutations = input.mutations.filter((mutation: UnifiedMemoryMutation): boolean => {
            return normalizeText(mutation.targetKind).toLowerCase() !== 'relationship';
        });
        const relationshipMutations = input.mutations.filter((mutation: UnifiedMemoryMutation): boolean => {
            return normalizeText(mutation.targetKind).toLowerCase() === 'relationship';
        });

        let entryResult: ApplyLedgerMutationBatchResult | undefined;
        if (entryMutations.length > 0) {
            entryResult = await this.repository.applyLedgerMutationBatch(entryMutations, input.context);
        }
        const relationshipResult = relationshipMutations.length > 0
            ? await this.relationshipMutationService.applyMutations({
                mutations: relationshipMutations,
                context: input.context,
            })
            : undefined;

        return {
            appliedEntryMutationIds: this.collectAppliedEntryMutationIds(entryMutations, entryResult),
            appliedRelationshipMutationIds: relationshipResult?.appliedRelationshipMutationIds ?? [],
            skippedMutationIds: [
                ...this.collectSkippedEntryMutationIds(entryMutations, entryResult),
                ...(relationshipResult?.skippedMutationIds ?? []),
            ],
            deletedEntryIds: entryResult?.deletedEntryIds ?? [],
            invalidatedEntryIds: entryResult?.invalidatedEntryIds ?? [],
            updatedEntryIds: entryResult?.updatedEntryIds ?? [],
            createdEntryIds: entryResult?.createdEntryIds ?? [],
            createdRelationshipIds: relationshipResult?.createdRelationshipIds ?? [],
            updatedRelationshipIds: relationshipResult?.updatedRelationshipIds ?? [],
            auditWritten: (entryResult?.auditResults.every((item) => item.written) ?? true),
            historyWritten: Boolean((entryResult?.historyWritten ?? true) && (relationshipResult?.historyWritten ?? true)),
            entryResult,
            relationshipResult,
        };
    }

    private collectAppliedEntryMutationIds(
        mutations: UnifiedMemoryMutation[],
        result?: ApplyLedgerMutationBatchResult,
    ): string[] {
        if (!result) {
            return [];
        }
        return mutations
            .map((mutation: UnifiedMemoryMutation, index: number): string | null => {
                const action = normalizeText(result.decisions[index]?.action).toUpperCase();
                const matchMode = normalizeText(result.decisions[index]?.matchMode).toLowerCase();
                if (!action || action === 'NOOP' || matchMode === 'skipped') {
                    return null;
                }
                return this.readMutationId(mutation, index, 'entry');
            })
            .filter((item: string | null): item is string => Boolean(item));
    }

    private collectSkippedEntryMutationIds(
        mutations: UnifiedMemoryMutation[],
        result?: ApplyLedgerMutationBatchResult,
    ): string[] {
        if (!result) {
            return [];
        }
        return mutations
            .map((mutation: UnifiedMemoryMutation, index: number): string | null => {
                const action = normalizeText(result.decisions[index]?.action).toUpperCase();
                const matchMode = normalizeText(result.decisions[index]?.matchMode).toLowerCase();
                if (action === 'NOOP' || matchMode === 'skipped') {
                    return this.readMutationId(mutation, index, 'entry');
                }
                return null;
            })
            .filter((item: string | null): item is string => Boolean(item));
    }

    private readMutationId(mutation: UnifiedMemoryMutation, index: number, prefix: string): string {
        const sourceContext = toRecord(mutation.sourceContext);
        return normalizeText(sourceContext.mutationId) || `${prefix}_mutation_${index + 1}`;
    }
}
