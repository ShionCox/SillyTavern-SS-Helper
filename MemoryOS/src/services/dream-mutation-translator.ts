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

/**
 * 功能：解析 JSON 对象字符串。
 * @param value 原始字符串。
 * @returns 解析后的对象。
 */
function parseJsonObjectText(value: unknown): Record<string, unknown> {
    const text = normalizeText(value);
    if (!text || text === '{}') {
        return {};
    }
    try {
        return toRecord(JSON.parse(text));
    } catch {
        return {};
    }
}

/**
 * 功能：判断任一值是否包含有效文本。
 * @param values 候选值。
 * @returns 是否存在有效文本。
 */
function hasAnyText(...values: unknown[]): boolean {
    return values.some((value: unknown): boolean => {
        if (Array.isArray(value)) {
            return value.some((item: unknown): boolean => normalizeText(item).length > 0);
        }
        return normalizeText(value).length > 0;
    });
}

export class DreamMutationTranslator {
    translateMutations(input: {
        dreamId: string;
        mutations: DreamMutationProposal[];
    }): UnifiedMemoryMutation[] {
        return input.mutations
            .map((mutation: DreamMutationProposal): UnifiedMemoryMutation | null => {
            const payload = toRecord(mutation.payload);
            const targetKind = this.resolveTargetKind(mutation, payload);
            if (!targetKind || targetKind === 'dream_insight_only') {
                return null;
            }
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
        })
            .filter((mutation: UnifiedMemoryMutation | null): mutation is UnifiedMemoryMutation => Boolean(mutation));
    }

    private resolveTargetKind(mutation: DreamMutationProposal, payload: Record<string, unknown>): string {
        if (mutation.mutationType === 'relationship_patch') {
            return 'relationship';
        }
        if (mutation.confidence < 0.65) {
            return 'dream_insight_only';
        }
        const explicitEntryType = normalizeText(payload.entryType);
        if (explicitEntryType && explicitEntryType !== 'other') {
            return explicitEntryType;
        }
        return this.inferEntryType(payload);
    }

    /**
     * 功能：根据梦境载荷推断正式记忆类型，无法确定时返回洞察保留标记。
     * @param payload 梦境载荷。
     * @returns 记忆类型或洞察保留标记。
     */
    private inferEntryType(payload: Record<string, unknown>): string {
        const fields = {
            ...parseJsonObjectText(payload.fieldsJson),
            ...toRecord(payload.fields),
            ...toRecord(toRecord(payload.detailPayload).fields),
            ...parseJsonObjectText(toRecord(payload.detailPayload).fieldsJson),
        };
        const text = [
            payload.title,
            payload.summary,
            payload.detail,
            payload.preview,
            ...Object.values(fields),
        ].map((value: unknown): string => normalizeText(value)).filter(Boolean).join('\n').toLowerCase();
        if (hasAnyText(payload.relationshipId, payload.sourceActorKey, payload.targetActorKey, fields.relationshipId, fields.sourceActorKey, fields.targetActorKey)) {
            return 'dream_insight_only';
        }
        if (hasAnyText(fields.location, fields.locationKey, fields.visibilityScope) || /地点|场景|实验室|仓库|门口|区域|基地/.test(text)) {
            return 'scene_shared_state';
        }
        if (hasAnyText(fields.objective, fields.goal, fields.status) || /任务|目标|调查|推进|完成|待处理|计划|需要/.test(text)) {
            return 'task';
        }
        if (hasAnyText(fields.participants, fields.result, fields.outcome, fields.impact) || /事件|发生|确认|遭遇|相遇|更新|生成|测试/.test(text)) {
            return 'event';
        }
        if (hasAnyText(fields.rule, fields.constraint, fields.scope, fields.enforcement) || /规则|禁令|法则|设定|长期|世界|制度/.test(text)) {
            return /硬规则|禁令|法则|必须|禁止/.test(text) ? 'world_hard_rule' : 'world_global_state';
        }
        if (hasAnyText(fields.owner, fields.holder, fields.ability, fields.rarity) || /物品|道具|装备|神器|资源/.test(text)) {
            return 'item';
        }
        return 'dream_insight_only';
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
