import type { EntryRepository } from '../repository/entry-repository';
import type { MemoryEntry, MemoryRelationshipRecord } from '../types';
import { DreamMutationTranslator } from './dream-mutation-translator';
import { DreamSessionRepository } from './dream-session-repository';
import { UnifiedMemoryMutationService } from './unified-memory-mutation-service';
import type {
    DreamMutationProposal,
    DreamRollbackMetadataRecord,
    DreamRollbackSnapshotRecord,
} from './dream-types';

type ApplyDreamMutationsResult = {
    rollbackKey: string;
    appliedMutationIds: string[];
    skippedMutationIds: string[];
    affectedEntryIds: string[];
    affectedRelationshipIds: string[];
};

/**
 * 功能：对审批通过的 dream mutation 做受控写回。
 */
export class DreamMutationApplier {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly dreamRepository: DreamSessionRepository;
    private readonly translator: DreamMutationTranslator;
    private readonly unifiedMutationService: UnifiedMemoryMutationService;

    constructor(chatKey: string, repository: EntryRepository) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = repository;
        this.dreamRepository = new DreamSessionRepository(this.chatKey);
        this.translator = new DreamMutationTranslator();
        this.unifiedMutationService = new UnifiedMemoryMutationService({
            chatKey: this.chatKey,
            repository: this.repository,
        });
    }

    async applyDreamMutations(input: {
        dreamId: string;
        mutations: DreamMutationProposal[];
    }): Promise<ApplyDreamMutationsResult> {
        const rollbackKey = String(input.dreamId ?? '').trim();
        const rollbackSnapshot = await this.buildDreamRollbackSnapshot({
            dreamId: input.dreamId,
            rollbackKey,
            mutations: input.mutations,
        });
        await this.dreamRepository.saveDreamRollbackSnapshot(rollbackSnapshot);

        const translatedMutations = this.translator.translateMutations({
            dreamId: input.dreamId,
            mutations: input.mutations,
        });
        const unifiedResult = await this.unifiedMutationService.applyMutations({
            mutations: translatedMutations,
            context: {
                chatKey: this.chatKey,
                source: 'dream',
                sourceLabel: 'Dream Review 批准写回',
                allowCreate: true,
                allowInvalidate: true,
            },
        });
        const appliedMutationIds = Array.from(new Set([
            ...unifiedResult.appliedEntryMutationIds,
            ...unifiedResult.appliedRelationshipMutationIds,
        ]));
        const skippedMutationIds = Array.from(new Set(unifiedResult.skippedMutationIds));
        const affectedEntryIds = new Set<string>([
            ...unifiedResult.createdEntryIds,
            ...unifiedResult.updatedEntryIds,
            ...unifiedResult.invalidatedEntryIds,
            ...unifiedResult.deletedEntryIds,
        ]);
        const affectedRelationshipIds = new Set<string>([
            ...unifiedResult.createdRelationshipIds,
            ...unifiedResult.updatedRelationshipIds,
        ]);

        const touchedEntryIds = Array.from(new Set([...rollbackSnapshot.touchedEntryIds, ...affectedEntryIds]));
        const touchedRelationshipIds = Array.from(new Set([...rollbackSnapshot.touchedRelationshipIds, ...affectedRelationshipIds]));
        const afterEntries = await this.readEntriesByIds(touchedEntryIds);
        const afterRelationships = await this.readRelationshipsByIds(touchedRelationshipIds);
        await this.dreamRepository.saveDreamRollbackSnapshot({
            ...rollbackSnapshot,
            updatedAt: Date.now(),
            touchedEntryIds,
            touchedRelationshipIds,
            after: {
                entries: afterEntries,
                relationships: afterRelationships,
            },
        });
        const rollbackMetadata: DreamRollbackMetadataRecord = {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            status: 'applied',
            appliedMutationIds,
            appliedMaintenanceProposalIds: [],
            affectedEntryIds: touchedEntryIds,
            affectedRelationshipIds: touchedRelationshipIds,
            summaryCandidateIds: [],
            applyResult: unifiedResult,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await this.dreamRepository.saveDreamRollbackMetadata(rollbackMetadata);
        await this.repository.appendMutationHistory({
            action: 'dream_mutations_applied',
            payload: {
                dreamId: input.dreamId,
                chatKey: this.chatKey,
                rollbackKey,
                appliedMutationIds,
                skippedMutationIds,
                affectedEntryIds: Array.from(affectedEntryIds),
                affectedRelationshipIds: Array.from(affectedRelationshipIds),
            },
        });
        return {
            rollbackKey,
            appliedMutationIds,
            skippedMutationIds,
            affectedEntryIds: Array.from(affectedEntryIds),
            affectedRelationshipIds: Array.from(affectedRelationshipIds),
        };
    }

    async buildDreamRollbackSnapshot(input: {
        dreamId: string;
        rollbackKey: string;
        mutations: DreamMutationProposal[];
    }): Promise<DreamRollbackSnapshotRecord> {
        const now = Date.now();
        const touchedEntryIds = Array.from(new Set(
            input.mutations.flatMap((mutation: DreamMutationProposal): string[] => {
                const payload = this.toRecord(mutation.payload);
                const payloadEntryId = this.normalizeText(payload.targetEntryId ?? payload.entryId);
                const sourceEntryIds = Array.isArray(mutation.sourceEntryIds) ? mutation.sourceEntryIds : [];
                return [payloadEntryId, ...sourceEntryIds].filter(Boolean);
            }),
        ));
        const touchedRelationshipIds = Array.from(new Set(
            input.mutations
                .map((mutation: DreamMutationProposal): string => {
                    const payload = this.toRecord(mutation.payload);
                    return this.normalizeText(payload.targetRelationshipId ?? payload.relationshipId);
                })
                .filter(Boolean),
        ));
        return {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            rollbackKey: input.rollbackKey,
            createdAt: now,
            updatedAt: now,
            touchedEntryIds,
            touchedRelationshipIds,
            before: {
                entries: await this.readEntriesByIds(touchedEntryIds),
                relationships: await this.readRelationshipsByIds(touchedRelationshipIds),
            },
        };
    }

    private async readEntriesByIds(entryIds: string[]): Promise<MemoryEntry[]> {
        const result: MemoryEntry[] = [];
        for (const entryId of entryIds) {
            const entry = await this.repository.getEntry(entryId);
            if (entry) {
                result.push(entry);
            }
        }
        return result;
    }

    private async readRelationshipsByIds(relationshipIds: string[]): Promise<MemoryRelationshipRecord[]> {
        const all = await this.repository.listRelationships();
        const idSet = new Set(relationshipIds);
        return all.filter((item: MemoryRelationshipRecord): boolean => idSet.has(item.relationshipId));
    }

    private normalizeText(value: unknown): string {
        return String(value ?? '').trim();
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }
}
