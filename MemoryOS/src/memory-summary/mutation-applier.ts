import type { MemoryEntry, SummaryRefreshBinding, SummarySnapshot, SummaryEntryUpsert } from '../types';
import type { SummaryCandidateRecord } from '../memory-summary-planner';
import { normalizeSummarySnapshot, type NormalizedSummaryDigest } from '../memory-summary-planner';
import type { SummaryMutationDocument, SummaryMutationAction } from './mutation-types';
import { applySummaryPatch } from './mutation-patch-utils';
import { buildCompareKey, supportsCompareKey } from '../core/compare-key';
import { resolveLedgerUpdateDecision } from '../core/ledger-update-rules';
import { normalizeTaskTitle } from '../core/task-title-normalizer';
import { normalizeTaskDescription } from '../core/task-description-normalizer';
import { buildTimeMetaByEntryType } from '../memory-time/time-context';
import {
    normalizeNarrativeValue,
    normalizeUserNarrativeText,
    resolveCurrentNarrativeUserName,
} from '../utils/narrative-user-name';

/**
 * 功能：定义 mutation 应用所需依赖。
 */
export interface MutationApplyDependencies {
    getEntry(entryId: string): Promise<MemoryEntry | null>;
    applySummarySnapshot(input: {
        title?: string;
        content: string;
        normalizedSummary?: NormalizedSummaryDigest;
        actorKeys: string[];
        entryUpserts?: SummaryEntryUpsert[];
        refreshBindings?: SummaryRefreshBinding[];
    }): Promise<SummarySnapshot>;
    deleteEntry?(entryId: string, options?: {
        actionType?: 'DELETE';
        summaryId?: string;
        sourceLabel?: string;
        reasonCodes?: string[];
    }): Promise<void>;
}

/**
 * 功能：定义 mutation 应用输入。
 */
export interface ApplySummaryMutationInput {
    dependencies: MutationApplyDependencies;
    mutationDocument: SummaryMutationDocument;
    candidateRecords: SummaryCandidateRecord[];
    actorKeys: string[];
    userDisplayName?: string;
    summaryTitle?: string;
    summaryContent: string;
}

/**
 * 功能：应用总结 mutation 文档。
 * @param input 应用输入。
 * @returns 总结快照。
 */
export async function applySummaryMutation(input: ApplySummaryMutationInput): Promise<SummarySnapshot> {
    const userDisplayName = resolveCurrentNarrativeUserName(input.userDisplayName);
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
            userDisplayName,
        });
    }

    return input.dependencies.applySummarySnapshot({
        title: input.summaryTitle || '结构化总结',
        content: input.summaryContent,
        normalizedSummary: normalizeSummarySnapshot({
            title: input.summaryTitle || '结构化总结',
            content: input.summaryContent,
            entryUpserts,
        }),
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
    userDisplayName: string;
}): Promise<void> {
    const actionType = input.action.action;
    if (actionType === 'NOOP') {
        return;
    }
    const candidate = input.action.candidateId ? input.candidateIdMap.get(input.action.candidateId) : null;
    const resolvedRecordId = String(input.action.targetId ?? candidate?.recordId ?? '').trim();
    const payload = resolveActionPayload(input.action, input.userDisplayName);
    if (actionType === 'DELETE' && resolvedRecordId && input.dependencies.deleteEntry) {
        await input.dependencies.deleteEntry(resolvedRecordId, {
            actionType: 'DELETE',
            sourceLabel: '结构化回合总结',
            reasonCodes: Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : [],
        });
        return;
    }
    if (actionType === 'INVALIDATE' && resolvedRecordId) {
        const existing = await input.dependencies.getEntry(resolvedRecordId);
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
                summary: normalizeUserNarrativeText(
                    String(payload.summary ?? existing.summary ?? existing.detail ?? existing.title).trim(),
                    input.userDisplayName,
                ),
                detail: existing.detail ? normalizeUserNarrativeText(existing.detail, input.userDisplayName) : existing.detail,
                detailPayload: normalizeNarrativeValue(mergedDetailPayload, input.userDisplayName),
                actionType: 'INVALIDATE',
                reasonCodes: dedupeStrings([
                    ...(Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : []),
                    ...toStringArray(payload.reasonCodes),
                ]),
                sourceLabel: '结构化回合总结',
            });
        }
        return;
    }
    if (actionType === 'MERGE') {
        await applyMergeAction({
            dependencies: input.dependencies,
            action: input.action,
            candidateIdMap: input.candidateIdMap,
            payload,
            entryUpserts: input.entryUpserts,
            refreshBindings: input.refreshBindings,
            actorKeys: input.actorKeys,
            userDisplayName: input.userDisplayName,
        });
        return;
    }
    const targetSchemaId = normalizeTargetSchemaId(input.action.targetKind, candidate?.schemaId);
    const upsert = await buildEntryUpsert(
        input.dependencies,
        targetSchemaId,
        payload,
        resolvedRecordId,
        actionType === 'UPDATE' ? 'UPDATE' : 'ADD',
        Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : [],
        '结构化回合总结',
        input.userDisplayName,
    );
    if (!upsert) {
        return;
    }
    if (input.action.timeContext) {
        upsert.timeContext = input.action.timeContext;
        applyEntryUpsertTimeMeta(upsert, upsert.entryType, input.action.timeContext);
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
 * 功能：应用 MERGE 动作。
 * @param input 合并输入。
 */
async function applyMergeAction(input: {
    dependencies: MutationApplyDependencies;
    action: SummaryMutationAction;
    candidateIdMap: Map<string, SummaryCandidateRecord>;
    payload: Record<string, unknown>;
    entryUpserts: SummaryEntryUpsert[];
    refreshBindings: SummaryRefreshBinding[];
    actorKeys: string[];
    userDisplayName: string;
}): Promise<void> {
    const candidateRecordId = input.action.candidateId
        ? input.candidateIdMap.get(input.action.candidateId)?.recordId
        : undefined;
    const sourceIds = dedupeStrings([
        String(candidateRecordId ?? '').trim(),
        ...(input.action.sourceIds ?? []),
    ]);
    const primaryId = String(input.action.targetId ?? sourceIds[0] ?? '').trim();
    if (!primaryId) {
        return;
    }
    const primaryUpsert = await buildEntryUpsert(
        input.dependencies,
        input.action.targetKind,
        input.payload,
        primaryId,
        'MERGE',
        Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : [],
        '结构化回合总结',
        input.userDisplayName,
    );
    if (primaryUpsert) {
        if (input.action.timeContext) {
            primaryUpsert.timeContext = input.action.timeContext;
            applyEntryUpsertTimeMeta(primaryUpsert, primaryUpsert.entryType, input.action.timeContext);
        }
        input.entryUpserts.push(primaryUpsert);
        for (const actorKey of input.actorKeys) {
            input.refreshBindings.push({
                actorKey,
                entryId: primaryUpsert.entryId,
                entryTitle: primaryUpsert.title,
            });
        }
    }
    const mergedAt = Date.now();
    for (const sourceId of sourceIds.filter((item: string): boolean => Boolean(item) && item !== primaryId)) {
        const existing = await input.dependencies.getEntry(sourceId);
        if (!existing) {
            continue;
        }
        const currentDetailPayload = normalizeRecord(existing.detailPayload);
        const currentLifecycle = normalizeRecord(currentDetailPayload.lifecycle);
        input.entryUpserts.push({
            entryId: existing.entryId,
            title: existing.title,
            entryType: existing.entryType,
            category: existing.category,
            tags: dedupeStrings([...(existing.tags ?? []), 'merged']),
            summary: normalizeUserNarrativeText(existing.summary || existing.detail || existing.title, input.userDisplayName),
            detail: existing.detail ? normalizeUserNarrativeText(existing.detail, input.userDisplayName) : existing.detail,
            detailPayload: {
                ...normalizeNarrativeValue(currentDetailPayload, input.userDisplayName),
                mergedInto: primaryId,
                lifecycle: {
                    ...currentLifecycle,
                    status: 'merged',
                    mergedAt,
                },
            },
            actionType: 'MERGE',
            reasonCodes: Array.isArray(input.action.reasonCodes) ? input.action.reasonCodes : [],
            sourceLabel: '结构化回合总结',
        });
    }
}

/**
 * 功能：根据 entryType 与 timeContext 为 upsert 补齐扩展时间字段。
 * @param upsert 待写入的 upsert。
 * @param entryType 条目类型。
 * @param timeContext 时间上下文。
 */
function applyEntryUpsertTimeMeta(
    upsert: SummaryEntryUpsert,
    entryType: string,
    timeContext: NonNullable<SummaryMutationAction['timeContext']>,
): void {
    const timeMeta = buildTimeMetaByEntryType(entryType, timeContext);
    if (timeMeta.firstObservedAt) {
        upsert.firstObservedAt = timeMeta.firstObservedAt as typeof timeContext;
    }
    if (timeMeta.lastObservedAt) {
        upsert.lastObservedAt = timeMeta.lastObservedAt as typeof timeContext;
    }
    if (timeMeta.validFrom) {
        upsert.validFrom = timeMeta.validFrom as typeof timeContext;
    }
    if (timeMeta.validTo) {
        upsert.validTo = timeMeta.validTo as typeof timeContext;
    }
    if (timeMeta.ongoing !== undefined) {
        upsert.ongoing = Boolean(timeMeta.ongoing);
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
    actionType?: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE',
    reasonCodes: string[] = [],
    sourceLabel?: string,
    userDisplayName: string = '你',
): Promise<SummaryEntryUpsert | null> {
    {
        const existing = recordId ? await dependencies.getEntry(recordId) : null;
        const entryType = String(payload.schemaId ?? targetSchemaId ?? existing?.entryType ?? 'other').trim() || 'other';
        const mergedPayload = mergeDetailPayload(existing?.detailPayload ?? {}, payload);
        const detailPayload = buildNormalizedEntryDetailPayload(entryType, mergedPayload, existing, userDisplayName);
        const title = buildNormalizedEntryTitle(entryType, payload, existing, detailPayload, userDisplayName);
        const summary = buildNormalizedEntrySummary(entryType, payload, existing, detailPayload, title, userDisplayName);
        const detail = (() => {
            const value = String(payload.detail ?? existing?.detail ?? '').trim();
            return value ? normalizeUserNarrativeText(value, userDisplayName) : undefined;
        })();
        const ledgerDecision = resolveLedgerUpdateDecision({
            entryType,
            title,
            fields: normalizeRecord(detailPayload.fields),
            existing: existing ? {
                entryId: existing.entryId,
                title: existing.title,
                compareKey: String(normalizeRecord(existing.detailPayload).compareKey ?? '').trim(),
                aliases: toStringArray(normalizeRecord(existing.detailPayload).aliases),
            } : null,
            sourceBatchId: String(normalizeRecord(detailPayload.takeover).sourceBatchId ?? '').trim() || undefined,
        });
        return {
            entryId: existing?.entryId,
            title,
            entryType,
            category: existing?.category,
            tags: dedupeStrings([
                ...(existing?.tags ?? []),
                ...(Array.isArray(payload.tags) ? (payload.tags as string[]) : []),
                ...(entryType === 'task' ? ['任务'] : []),
            ]),
            summary,
            detail,
            detailPayload,
            actionType: actionType ?? (ledgerDecision.action === 'NOOP' ? (existing ? 'UPDATE' : 'ADD') : ledgerDecision.action),
            reasonCodes: dedupeStrings([
                ...reasonCodes,
                ...toStringArray(payload.reasonCodes),
                ...ledgerDecision.reasonCodes,
            ]),
            sourceLabel,
        };
    }
}

/**
 * 功能：解析 action 对应的 payload。
 * @param action mutation action。
 * @returns 归一化 payload。
 */
function resolveActionPayload(action: SummaryMutationAction, userDisplayName: string = '你'): Record<string, unknown> {
    if (action.action === 'ADD') {
        return normalizeNarrativeValue(normalizeRecord(action.newRecord ?? action.payload), userDisplayName);
    }
    if (action.action === 'UPDATE' || action.action === 'MERGE' || action.action === 'INVALIDATE') {
        return normalizeNarrativeValue(normalizeRecord(action.patch ?? action.payload), userDisplayName);
    }
    return normalizeNarrativeValue(normalizeRecord(action.payload), userDisplayName);
}

/**
 * 功能：合并 detailPayload。
 * @param base 基础 payload。
 * @param payload 变更 payload。
 * @returns 合并结果。
 */
function mergeDetailPayload(base: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
    return applySummaryPatch(normalizeRecord(base), normalizeRecord(payload));
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
    const payload = resolveActionPayload(input.action);
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
    const normalizedTakeoverPayload = resolveActionPayload(takeover);
    return String(
        normalizedTakeoverPayload.supersededBy
        ?? normalizedTakeoverPayload.title
        ?? normalizedTakeoverPayload.state
        ?? takeoverPayload.supersededBy
        ?? '',
    ).trim();
}

/**
 * 功能：构建归一化标题，任务会自动补齐稳定标题。
 * @param entryType 条目类型。
 * @param payload 当前补丁。
 * @param existing 已有条目。
 * @param detailPayload 合并后的结构化载荷。
 * @param userDisplayName 当前叙事用户名。
 * @returns 最终标题。
 */
function buildNormalizedEntryTitle(
    entryType: string,
    payload: Record<string, unknown>,
    existing: MemoryEntry | null,
    detailPayload: Record<string, unknown>,
    userDisplayName: string,
): string {
    if (entryType === 'task') {
        const fields = normalizeRecord(detailPayload.fields);
        return normalizeUserNarrativeText(normalizeTaskTitle({
            title: String(payload.title ?? existing?.title ?? '').trim(),
            objective: String(fields.objective ?? detailPayload.objective ?? '').trim(),
            action: String(fields.action ?? detailPayload.action ?? '').trim(),
            target: String(fields.target ?? detailPayload.target ?? '').trim(),
            location: String(fields.location ?? detailPayload.location ?? '').trim(),
            compareKey: String(detailPayload.compareKey ?? fields.compareKey ?? '').trim(),
        }), userDisplayName);
    }
    return normalizeUserNarrativeText(
        String(payload.title ?? existing?.title ?? '').trim() || '未命名条目',
        userDisplayName,
    );
}

/**
 * 功能：构建归一化摘要，任务会生成一句话描述。
 * @param entryType 条目类型。
 * @param payload 当前补丁。
 * @param existing 已有条目。
 * @param detailPayload 合并后的结构化载荷。
 * @param title 最终标题。
 * @param userDisplayName 当前叙事用户名。
 * @returns 最终摘要。
 */
function buildNormalizedEntrySummary(
    entryType: string,
    payload: Record<string, unknown>,
    existing: MemoryEntry | null,
    detailPayload: Record<string, unknown>,
    title: string,
    userDisplayName: string,
): string {
    const summaryAppend = String(payload.summaryAppend ?? '').trim();
    const explicitSummary = String(payload.summary ?? '').trim();
    if (entryType === 'task') {
        const fields = normalizeRecord(detailPayload.fields);
        return normalizeUserNarrativeText(normalizeTaskDescription({
            title,
            summary: explicitSummary || summaryAppend || existing?.summary,
            objective: String(fields.objective ?? detailPayload.objective ?? '').trim(),
            status: String(fields.status ?? detailPayload.status ?? '').trim(),
            stage: String(fields.stage ?? detailPayload.stage ?? '').trim(),
            blocker: String(fields.blocker ?? detailPayload.blocker ?? '').trim(),
            location: String(fields.location ?? detailPayload.location ?? '').trim(),
            lastChange: String(fields.lastChange ?? detailPayload.lastChange ?? '').trim(),
        }), userDisplayName);
    }
    return normalizeUserNarrativeText(
        explicitSummary || summaryAppend || existing?.summary || existing?.detail || title,
        userDisplayName,
    );
}

/**
 * 功能：补齐结构化载荷中的 compareKey、卡片信息和绑定信息。
 * @param entryType 条目类型。
 * @param payload 合并后的载荷。
 * @param existing 已有条目。
 * @param userDisplayName 当前叙事用户名。
 * @returns 归一化后的结构化载荷。
 */
function buildNormalizedEntryDetailPayload(
    entryType: string,
    payload: Record<string, unknown>,
    existing: MemoryEntry | null,
    userDisplayName: string,
): Record<string, unknown> {
    const fields = normalizeRecord(payload.fields);
    const titleSeed = String(payload.title ?? existing?.title ?? '').trim();
    const compareKey = supportsCompareKey(entryType)
        ? buildCompareKey(entryType, titleSeed, fields)
        : String(payload.compareKey ?? normalizeRecord(existing?.detailPayload).compareKey ?? '').trim();
    return normalizeNarrativeValue({
        ...payload,
        compareKey,
        fields: {
            ...fields,
            ...(compareKey ? { compareKey } : {}),
        },
        card: {
            title: String(payload.title ?? existing?.title ?? '').trim(),
            summary: String(payload.summary ?? existing?.summary ?? '').trim(),
            entryType,
        },
        bindings: normalizeBindingsPayload(payload.bindings),
    }, userDisplayName);
}

/**
 * 功能：归一化绑定信息，避免不同链路写入不同结构。
 * @param value 原始绑定数据。
 * @returns 归一化后的绑定信息。
 */
function normalizeBindingsPayload(value: unknown): Record<string, unknown> {
    const payload = normalizeRecord(value);
    return {
        actors: dedupeStrings(toStringArray(payload.actors)),
        organizations: dedupeStrings(toStringArray(payload.organizations)),
        cities: dedupeStrings(toStringArray(payload.cities)),
        locations: dedupeStrings(toStringArray(payload.locations)),
        nations: dedupeStrings(toStringArray(payload.nations)),
        tasks: dedupeStrings(toStringArray(payload.tasks)),
        events: dedupeStrings(toStringArray(payload.events)),
    };
}
