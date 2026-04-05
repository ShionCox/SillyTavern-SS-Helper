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
                const payloadEntryId = this.normalizeText(payload.entryId);
                const sourceEntryIds = Array.isArray(mutation.sourceEntryIds) ? mutation.sourceEntryIds : [];
                return [payloadEntryId, ...sourceEntryIds].filter(Boolean);
            }),
        ));
        const touchedRelationshipIds = Array.from(new Set(
            input.mutations
                .map((mutation: DreamMutationProposal): string => this.normalizeText(this.toRecord(mutation.payload).relationshipId))
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

    private async applySingleMutation(dreamId: string, mutation: DreamMutationProposal, dreamCreatedAt: number): Promise<{
        ok: boolean;
        affectedEntryIds: string[];
        affectedRelationshipIds: string[];
    }> {
        if (!mutation || !mutation.mutationId) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        if (mutation.mutationType === 'entry_create') {
            return this.applyEntryCreate(dreamId, mutation);
        }
        if (mutation.mutationType === 'entry_patch') {
            return this.applyEntryPatch(dreamId, mutation, dreamCreatedAt);
        }
        if (mutation.mutationType === 'relationship_patch') {
            return this.applyRelationshipPatch(dreamId, mutation);
        }
        return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
    }

    private async applyEntryCreate(dreamId: string, mutation: DreamMutationProposal): Promise<{
        ok: boolean;
        affectedEntryIds: string[];
        affectedRelationshipIds: string[];
    }> {
        const payload = this.toRecord(mutation.payload);
        const title = this.normalizeText(payload.title);
        const entryType = this.normalizeText(payload.entryType) || 'other';
        if (!title) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        const tags = this.normalizeTags(payload.tags);
        const saved = await this.repository.saveEntry({
            title,
            entryType,
            summary: this.normalizeText(payload.summary),
            detail: this.normalizeText(payload.detail),
            tags: Array.from(new Set(['dream_phase1', 'dream', ...tags])),
            detailPayload: {
                ...this.toRecord(payload.detailPayload),
                dreamSource: 'dream_phase1',
                dreamId,
                sourceEntryIds: mutation.sourceEntryIds,
            },
            timeContext: this.readOptionalObject(payload.timeContext),
        }, {
            actionType: 'ADD',
            sourceLabel: '梦境审批写回',
            reasonCodes: ['dream_phase1', mutation.sourceWave],
        });
        const actorBindings = this.normalizeTags(payload.actorBindings);
        for (const actorKey of actorBindings) {
            await this.repository.bindRoleToEntry(actorKey, saved.entryId);
        }
        return { ok: true, affectedEntryIds: [saved.entryId], affectedRelationshipIds: [] };
    }

    private async applyEntryPatch(_dreamId: string, mutation: DreamMutationProposal, dreamCreatedAt: number): Promise<{
        ok: boolean;
        affectedEntryIds: string[];
        affectedRelationshipIds: string[];
    }> {
        const payload = this.toRecord(mutation.payload);
        const entryId = this.normalizeText(payload.entryId);
        if (!entryId) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        const existing = await this.repository.getEntry(entryId);
        if (!existing) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        if (dreamCreatedAt > 0 && existing.updatedAt > dreamCreatedAt) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        const nextSummary = this.normalizeText(payload.summary) || existing.summary;
        const nextDetail = this.normalizeText(payload.detail) || existing.detail;
        const nextTags = this.normalizeTags(payload.tags);
        const nextDetailPayload = {
            ...existing.detailPayload,
            ...this.toRecord(payload.detailPayload),
            dreamLastPatchedAt: Date.now(),
        };
        await this.repository.saveEntry({
            entryId: existing.entryId,
            title: existing.title,
            entryType: existing.entryType,
            summary: nextSummary,
            detail: nextDetail,
            tags: nextTags.length > 0 ? Array.from(new Set([...existing.tags, ...nextTags])) : existing.tags,
            detailPayload: nextDetailPayload,
            timeContext: this.readOptionalObject(payload.timeContext) ?? existing.timeContext,
        }, {
            actionType: 'UPDATE',
            sourceLabel: '梦境审批写回',
            reasonCodes: ['dream_phase1', mutation.sourceWave],
        });
        return { ok: true, affectedEntryIds: [existing.entryId], affectedRelationshipIds: [] };
    }

    private async applyRelationshipPatch(dreamId: string, mutation: DreamMutationProposal): Promise<{
        ok: boolean;
        affectedEntryIds: string[];
        affectedRelationshipIds: string[];
    }> {
        const payload = this.toRecord(mutation.payload);
        const relationshipId = this.normalizeText(payload.relationshipId);
        const sourceActorKey = this.normalizeText(payload.sourceActorKey);
        const targetActorKey = this.normalizeText(payload.targetActorKey);
        const relationTag = this.normalizeText(payload.relationTag);
        const relationships = await this.repository.listRelationships();
        const existing = relationshipId
            ? relationships.find((item: MemoryRelationshipRecord): boolean => item.relationshipId === relationshipId)
            : relationships.find((item: MemoryRelationshipRecord): boolean => {
                return item.sourceActorKey === sourceActorKey
                    && item.targetActorKey === targetActorKey
                    && item.relationTag === relationTag;
            });
        if (!existing) {
            return { ok: false, affectedEntryIds: [], affectedRelationshipIds: [] };
        }
        await this.repository.saveRelationship({
            relationshipId: existing.relationshipId,
            sourceActorKey: existing.sourceActorKey,
            targetActorKey: existing.targetActorKey,
            relationTag: relationTag || existing.relationTag,
            state: this.normalizeText(payload.state) || existing.state,
            summary: this.normalizeText(payload.summary) || existing.summary,
            trust: this.normalizeNumber(payload.trust, existing.trust),
            affection: this.normalizeNumber(payload.affection, existing.affection),
            tension: this.normalizeNumber(payload.tension, existing.tension),
            participants: existing.participants,
            timeContext: this.readOptionalObject(payload.timeContext) ?? existing.timeContext,
            validFrom: existing.validFrom,
            validTo: existing.validTo,
            ongoing: existing.ongoing,
        });
        await this.repository.appendMutationHistory({
            action: 'dream_relationship_patch_applied',
            payload: {
                dreamId,
                relationshipId: existing.relationshipId,
                mutationId: mutation.mutationId,
            },
        });
        return { ok: true, affectedEntryIds: [], affectedRelationshipIds: [existing.relationshipId] };
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

    private normalizeTags(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return Array.from(new Set(value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean)));
    }

    private normalizeNumber(value: unknown, fallback: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallback;
        }
        return Math.max(0, Math.min(100, Math.round(numeric)));
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private readOptionalObject<T>(value: unknown): T | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return value as T;
    }
}
