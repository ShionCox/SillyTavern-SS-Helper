import type { DreamMutationProposal } from './dream-types';
import type { UnifiedMemoryMutation } from '../types/unified-mutation';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
}

export class DreamMutationTranslator {
    translateMutations(input: {
        dreamId: string;
        mutations: DreamMutationProposal[];
    }): UnifiedMemoryMutation[] {
        return input.mutations.map((mutation: DreamMutationProposal): UnifiedMemoryMutation => {
            const payload = toRecord(mutation.payload);
            const targetKind = this.resolveTargetKind(mutation, payload);
            const dreamMeta = {
                dreamId: input.dreamId,
                mutationId: mutation.mutationId,
                mutationType: mutation.mutationType,
                sourceWave: mutation.sourceWave,
                sourceEntryIds: mutation.sourceEntryIds,
                preview: mutation.preview,
                reason: mutation.reason,
                explain: mutation.explain ?? null,
            };
            if (mutation.mutationType === 'relationship_patch') {
                return {
                    targetKind: 'relationship',
                    action: 'UPDATE',
                    title: normalizeText(payload.relationTag ?? mutation.preview) || 'relationship',
                    detailPayload: {
                        relationshipId: normalizeText(payload.relationshipId),
                        sourceActorKey: normalizeText(payload.sourceActorKey),
                        targetActorKey: normalizeText(payload.targetActorKey),
                        relationTag: normalizeText(payload.relationTag),
                        participants: normalizeStringArray(payload.participants),
                        state: normalizeText(payload.state),
                        summary: normalizeText(payload.summary ?? mutation.reason),
                        trust: Number(payload.trust ?? 0),
                        affection: Number(payload.affection ?? 0),
                        tension: Number(payload.tension ?? 0),
                        dreamMeta,
                    },
                    summary: normalizeText(payload.summary ?? mutation.reason),
                    reasonCodes: this.buildReasonCodes(mutation),
                    sourceContext: {
                        ...dreamMeta,
                        relationshipId: normalizeText(payload.relationshipId),
                        sourceActorKey: normalizeText(payload.sourceActorKey),
                        targetActorKey: normalizeText(payload.targetActorKey),
                        relationTag: normalizeText(payload.relationTag),
                    },
                };
            }
            return {
                targetKind,
                action: mutation.mutationType === 'entry_create' ? 'ADD' : 'UPDATE',
                title: normalizeText(payload.title ?? mutation.preview) || '未命名条目',
                entryId: normalizeText(payload.entryId) || undefined,
                summary: normalizeText(payload.summary ?? mutation.reason),
                detail: normalizeText(payload.detail),
                detailPayload: {
                    ...toRecord(payload.detailPayload),
                    dreamMeta,
                },
                tags: normalizeStringArray(payload.tags),
                compareKey: normalizeText(payload.compareKey) || undefined,
                entityKey: normalizeText(payload.entityKey) || undefined,
                matchKeys: normalizeStringArray(payload.matchKeys),
                actorBindings: normalizeStringArray(payload.actorBindings),
                reasonCodes: this.buildReasonCodes(mutation),
                sourceContext: dreamMeta,
                ...(payload.timeContext ? { timeContext: payload.timeContext as UnifiedMemoryMutation['timeContext'] } : {}),
                ...(payload.firstObservedAt ? { firstObservedAt: payload.firstObservedAt as UnifiedMemoryMutation['firstObservedAt'] } : {}),
                ...(payload.lastObservedAt ? { lastObservedAt: payload.lastObservedAt as UnifiedMemoryMutation['lastObservedAt'] } : {}),
                ...(payload.validFrom ? { validFrom: payload.validFrom as UnifiedMemoryMutation['validFrom'] } : {}),
                ...(payload.validTo ? { validTo: payload.validTo as UnifiedMemoryMutation['validTo'] } : {}),
                ...(typeof payload.ongoing === 'boolean' ? { ongoing: payload.ongoing } : {}),
            };
        });
    }

    private resolveTargetKind(mutation: DreamMutationProposal, payload: Record<string, unknown>): string {
        if (mutation.mutationType === 'relationship_patch') {
            return 'relationship';
        }
        return normalizeText(payload.entryType) || 'other';
    }

    private buildReasonCodes(mutation: DreamMutationProposal): string[] {
        const explain = mutation.explain;
        const payload = toRecord(mutation.payload);
        const detailPayload = toRecord(payload.detailPayload);
        return Array.from(new Set([
            'source:dream',
            `wave:${mutation.sourceWave}`,
            mutation.confidence >= 0.75 ? 'risk:low' : 'risk:manual_review_required',
            ...normalizeStringArray(payload.reasonCodes),
            ...normalizeStringArray(detailPayload.reasonCodes),
            ...(explain?.bridgeNodeKeys?.length ? ['bridge:present'] : []),
        ]));
    }
}
