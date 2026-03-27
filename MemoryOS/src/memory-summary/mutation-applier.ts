import type { MemoryEntry, SummaryRefreshBinding, SummarySnapshot, SummaryEntryUpsert } from '../types';
import type { SummaryCandidateRecord } from '../memory-summary-planner';
import type { SummaryMutationDocument, SummaryMutationAction } from './mutation-types';

/**
 * 功能：定义 mutation 应用所需依赖。
 */
export interface MutationApplyDependencies {
    getEntry(entryId: string): Promise<MemoryEntry | null>;
    applySummarySnapshot(input: {
        title?: string;
        content: string;
        actorKeys: string[];
        entryUpserts?: SummaryEntryUpsert[];
        refreshBindings?: SummaryRefreshBinding[];
    }): Promise<SummarySnapshot>;
    deleteEntry?(entryId: string): Promise<void>;
}

/**
 * 功能：定义 mutation 应用输入。
 */
export interface ApplySummaryMutationInput {
    dependencies: MutationApplyDependencies;
    mutationDocument: SummaryMutationDocument;
    candidateRecords: SummaryCandidateRecord[];
    actorKeys: string[];
    summaryTitle?: string;
    summaryContent: string;
}

/**
 * 功能：应用总结 mutation 文档。
 * @param input 应用输入。
 * @returns 总结快照。
 */
export async function applySummaryMutation(input: ApplySummaryMutationInput): Promise<SummarySnapshot> {
    const candidateIdMap = new Map<string, SummaryCandidateRecord>(
        input.candidateRecords.map((candidate: SummaryCandidateRecord): [string, SummaryCandidateRecord] => [candidate.candidateId, candidate]),
    );
    const entryUpserts: SummaryEntryUpsert[] = [];
    const refreshBindings: SummaryRefreshBinding[] = [];

    for (let actionIndex = 0; actionIndex < input.mutationDocument.actions.length; actionIndex += 1) {
        const action = input.mutationDocument.actions[actionIndex];
        await applySingleAction({
            action,
            actionIndex,
            allActions: input.mutationDocument.actions,
            dependencies: input.dependencies,
            candidateIdMap,
            entryUpserts,
            refreshBindings,
            actorKeys: input.actorKeys,
        });
    }

    return input.dependencies.applySummarySnapshot({
        title: input.summaryTitle || '结构化总结',
        content: input.summaryContent,
        actorKeys: input.actorKeys,
        entryUpserts,
        refreshBindings,
    });
}

/**
 * 功能：执行单条 mutation action。
 * @param input action 执行上下文。
 */
async function applySingleAction(input: {
    action: SummaryMutationAction;
    actionIndex: number;
    allActions: SummaryMutationAction[];
    dependencies: MutationApplyDependencies;
    candidateIdMap: Map<string, SummaryCandidateRecord>;
    entryUpserts: SummaryEntryUpsert[];
    refreshBindings: SummaryRefreshBinding[];
    actorKeys: string[];
}): Promise<void> {
    const actionType = input.action.action;
    if (actionType === 'NOOP') {
        return;
    }
    const candidate = input.action.candidateId ? input.candidateIdMap.get(input.action.candidateId) : null;
    const payload = input.action.payload ?? {};
    if (actionType === 'DELETE' && candidate?.recordId && input.dependencies.deleteEntry) {
        await input.dependencies.deleteEntry(candidate.recordId);
        return;
    }
    if (actionType === 'INVALIDATE' && candidate?.recordId) {
        const existing = await input.dependencies.getEntry(candidate.recordId);
        if (existing) {
            const currentDetailPayload = normalizeRecord(existing.detailPayload);
            const currentLifecycle = normalizeRecord(currentDetailPayload.lifecycle);
            const lifecycle = {
                ...currentLifecycle,
                status: 'invalidated',
                invalidatedAt: Date.now(),
                reasonCodes: dedupeStrings([
                    ...toStringArray(currentLifecycle.reasonCodes),
                    ...(Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : []),
                    ...toStringArray(payload.reasonCodes),
                ]),
            };
            const mergedDetailPayload: Record<string, unknown> = {
                ...currentDetailPayload,
                lifecycle,
            };
            const supersededBy = resolveSupersededByHint({
                action: input.action,
                actionIndex: input.actionIndex,
                allActions: input.allActions,
                currentDetailPayload,
            });
            if (supersededBy) {
                mergedDetailPayload.supersededBy = supersededBy;
            }
            input.entryUpserts.push({
                entryId: existing.entryId,
                title: existing.title,
                entryType: existing.entryType,
                category: existing.category,
                tags: dedupeStrings([...(existing.tags ?? []), 'invalidated']),
                summary: String(payload.summary ?? existing.summary ?? existing.detail ?? existing.title).trim(),
                detail: existing.detail,
                detailPayload: mergedDetailPayload,
            });
        }
        return;
    }
    const targetSchemaId = normalizeTargetSchemaId(input.action.targetKind, candidate?.schemaId);
    const upsert = await buildEntryUpsert(input.dependencies, targetSchemaId, payload, candidate?.recordId);
    if (!upsert) {
        return;
    }
    input.entryUpserts.push(upsert);
    for (const actorKey of input.actorKeys) {
        input.refreshBindings.push({
            actorKey,
            entryId: upsert.entryId,
            entryTitle: upsert.title,
        });
    }
}

/**
 * 功能：构建 SummaryEntryUpsert。
 * @param dependencies 依赖。
 * @param targetSchemaId 目标 schemaId。
 * @param payload action payload。
 * @param recordId 目标记录 ID。
 * @returns upsert 记录。
 */
async function buildEntryUpsert(
    dependencies: MutationApplyDependencies,
    targetSchemaId: string,
    payload: Record<string, unknown>,
    recordId?: string,
): Promise<SummaryEntryUpsert | null> {
    const existing = recordId ? await dependencies.getEntry(recordId) : null;
    const summaryAppend = String(payload.summaryAppend ?? '').trim();
    const summary = String(payload.summary ?? '').trim();
    const payloadSummary = summary || summaryAppend;
    const title = String(payload.title ?? existing?.title ?? '').trim() || '未命名条目';
    const entryType = String(payload.schemaId ?? targetSchemaId ?? existing?.entryType ?? 'other').trim() || 'other';
    const tags = dedupeStrings([
        ...(existing?.tags ?? []),
        ...(Array.isArray(payload.tags) ? (payload.tags as string[]) : []),
    ]);
    const detailPayload = mergeDetailPayload(existing?.detailPayload ?? {}, payload);

    return {
        entryId: existing?.entryId,
        title,
        entryType,
        category: existing?.category,
        tags,
        summary: payloadSummary || existing?.summary || existing?.detail || title,
        detail: String(payload.detail ?? existing?.detail ?? '').trim() || undefined,
        detailPayload,
    };
}

/**
 * 功能：合并 detailPayload。
 * @param base 基础 payload。
 * @param payload 变更 payload。
 * @returns 合并结果。
 */
function mergeDetailPayload(base: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...normalizeRecord(base) };
    const fields = payload.fields;
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        out.fields = {
            ...normalizeRecord(out.fields),
            ...(fields as Record<string, unknown>),
        };
    }
    const scalarKeys = ['importance', 'memorySubtype', 'trust', 'affection', 'tension', 'scope', 'state', 'supersededBy'];
    for (const key of scalarKeys) {
        if (payload[key] !== undefined) {
            out[key] = payload[key];
        }
    }
    return out;
}

/**
 * 功能：归一化目标 schemaId。
 * @param targetKind 目标种类。
 * @param schemaId 候选 schemaId。
 * @returns schemaId。
 */
function normalizeTargetSchemaId(targetKind: string, schemaId?: string): string {
    const target = String(targetKind ?? '').trim();
    const fallback = String(schemaId ?? '').trim();
    return target || fallback || 'other';
}

/**
 * 功能：标准化对象。
 * @param value 原始值。
 * @returns 标准化对象。
 */
function normalizeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：把未知值转换为字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item): string => String(item ?? '').trim()).filter(Boolean);
}

/**
 * 功能：字符串数组去重。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const merged: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

/**
 * 功能：为 INVALIDATE 动作解析 supersededBy 接管标识。
 * @param input 解析输入。
 * @returns 接管标识文本；无法解析时返回空字符串。
 */
function resolveSupersededByHint(input: {
    action: SummaryMutationAction;
    actionIndex: number;
    allActions: SummaryMutationAction[];
    currentDetailPayload: Record<string, unknown>;
}): string {
    const payload = input.action.payload ?? {};
    const explicit = String(payload.supersededBy ?? input.currentDetailPayload.supersededBy ?? '').trim();
    if (explicit) {
        return explicit;
    }
    if (String(input.action.targetKind ?? '').trim() !== 'world_global_state') {
        return '';
    }
    const tailActions = input.allActions.slice(Math.max(0, input.actionIndex + 1));
    const takeover = tailActions.find((action): boolean => {
        if (String(action.targetKind ?? '').trim() !== 'world_global_state') {
            return false;
        }
        return action.action === 'ADD' || action.action === 'UPDATE' || action.action === 'MERGE';
    });
    if (!takeover) {
        return '';
    }
    const takeoverPayload = takeover.payload ?? {};
    return String(
        takeoverPayload.supersededBy
        ?? takeoverPayload.title
        ?? takeoverPayload.state
        ?? '',
    ).trim();
}
