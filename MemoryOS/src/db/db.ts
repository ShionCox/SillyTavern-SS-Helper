import Dexie from 'dexie';
import {
    appendSdkPluginChatRecord,
    db,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    patchSdkChatShared,
    queryLatestSdkPluginChatRecords,
    querySdkPluginChatRecords,
    rebuildSSHelperDatabase,
    readSdkPluginChatState,
    writeSdkPluginChatState,
} from '../../../SDK/db';
import type {
    ChatSharedPatch,
    DBAudit,
    DBChatPluginRecord,
    DBChatPluginState,
    DBEvent,
    DBMemoryEntry,
    DBMemoryEntryType,
    DBActorMemoryProfile,
    DBRoleEntryMemory,
    DBMemoryRelationship,
    DBMemoryMutationHistory,
    DBMemoryEntryFieldDiff,
    DBMemoryEntryAuditRecord,
    DBMeta,
    DBSummarySnapshot,
    DBWorldProfileBinding,
    DBTemplate,
    DBTemplateBinding,
} from '../../../SDK/db';
import { SSHelperDatabase } from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBaseline,
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverCandidateActorMention,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverPlan,
} from '../types';

export { db, patchSdkChatShared, rebuildSSHelperDatabase };
export type {
    ChatSharedPatch,
    DBAudit,
    DBChatPluginRecord,
    DBChatPluginState,
    DBEvent,
    DBMemoryEntry,
    DBMemoryEntryType,
    DBActorMemoryProfile,
    DBRoleEntryMemory,
    DBMemoryRelationship,
    DBMemoryMutationHistory,
    DBMemoryEntryFieldDiff,
    DBMemoryEntryAuditRecord,
    DBMeta,
    DBSummarySnapshot,
    DBWorldProfileBinding,
    DBTemplate,
    DBTemplateBinding,
};
export { SSHelperDatabase as MemoryOSDatabase };

/**
 * 功能：定义聊天级清理参数。
 */
export interface ClearMemoryChatDataOptions {
    includeAudit?: boolean;
}

/**
 * 功能：定义统一数据库快照结构。
 */
export interface MemoryChatDatabaseSnapshot {
    chatKey: string;
    generatedAt: number;
    events: DBEvent[];
    templates: DBTemplate[];
    audit: DBAudit[];
    meta: DBMeta | null;
    memoryMutationHistory: DBMemoryMutationHistory[];
    memoryEntryAuditRecords: DBMemoryEntryAuditRecord[];
    memoryEntries: DBMemoryEntry[];
    memoryEntryTypes: DBMemoryEntryType[];
    actorMemoryProfiles: DBActorMemoryProfile[];
    roleEntryMemory: DBRoleEntryMemory[];
    memoryRelationships: DBMemoryRelationship[];
    summarySnapshots: DBSummarySnapshot[];
    worldProfileBindings: DBWorldProfileBinding[];
    pluginState: DBChatPluginState | null;
    pluginRecords: DBChatPluginRecord[];
}

/**
 * 功能：定义 Prompt 测试包。
 */
export interface MemoryPromptTestBundle {
    version: '1.0.0';
    exportedAt: number;
    sourceChatKey: string;
    database: MemoryChatDatabaseSnapshot;
    promptFixture: Array<Record<string, unknown>>;
    query: string;
    sourceMessageId?: string;
    settings: Record<string, unknown>;
    captureMeta?: {
        mode: 'exact_replay' | 'simulated_prompt';
        capturedAt?: number;
        source?: string;
        note?: string;
    };
    expectation?: {
        shouldInject?: boolean;
        requiredKeywords?: string[];
    };
    parityBaseline?: MemoryPromptParityBaseline;
    runResult?: Record<string, unknown>;
}

/**
 * 功能：定义严格一致性对比的基准数据结构。
 */
export interface MemoryPromptParityBaseline {
    finalPromptText: string;
    insertIndex: number;
    insertedMemoryBlock: string;
    reasonCodes: string[];
    matchedActorKeys: string[];
    matchedEntryIds: string[];
}

/**
 * 功能：定义 PromptReady 快照结构。
 */
export interface PromptReadyCaptureSnapshot {
    promptFixture: Array<Record<string, unknown>>;
    query: string;
    sourceMessageId?: string;
    capturedAt: number;
    requestMeta?: Record<string, unknown>;
}

/**
 * 功能：定义测试包导入结果。
 */
export interface ImportMemoryPromptTestBundleResult {
    chatKey: string;
    importedAt: number;
    bundle: MemoryPromptTestBundle;
}

/**
 * 功能：定义接管记录集合名称。
 */
export type MemoryTakeoverRecordCollection =
    | 'takeover_batch_meta'
    | 'takeover_batch_result'
    | 'candidate_actor_mentions'
    | 'takeover_logs'
    | 'takeover_preview_runtime'
    | 'takeover_preview_draft'
    | 'comparekey_index';

/**
 * 功能：定义 compareKey 索引记录。
 */
export interface MemoryCompareKeyIndexRecord {
    chatKey: string;
    entryId: string;
    entityKey: string;
    entryType: string;
    compareKey: string;
    matchKeys: string[];
    schemaVersion: string;
    canonicalName: string;
    legacyCompareKeys?: string[];
    title: string;
    updatedAt: number;
}

/**
 * 功能：定义接管日志记录。
 */
export interface MemoryTakeoverLogRecord {
    takeoverId: string;
    level: 'info' | 'warn' | 'error';
    stage: string;
    message: string;
    detail?: Record<string, unknown>;
    ts: number;
}

/**
 * 功能：读取 MemoryOS 当前聊天的插件状态。
 * @param chatKey 聊天键。
 * @returns 插件状态；不存在时返回 null。
 */
export async function readMemoryOSChatState(chatKey: string): Promise<DBChatPluginState | null> {
    return readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey));
}

/**
 * 功能：写入 MemoryOS 当前聊天的插件状态。
 * @param chatKey 聊天键。
 * @param state 状态补丁。
 * @returns 异步完成。
 */
export async function writeMemoryOSChatState(chatKey: string, state: Record<string, unknown>): Promise<void> {
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), state);
}

/**
 * 功能：读取旧聊天接管总状态。
 * @param chatKey 聊天键。
 * @returns 接管计划；不存在时返回 null。
 */
export async function readMemoryTakeoverPlan(chatKey: string): Promise<MemoryTakeoverPlan | null> {
    const stateRow = await readMemoryOSChatState(chatKey);
    const takeover = toRecord(toRecord(stateRow?.state).takeover);
    if (Object.keys(takeover).length <= 0) {
        return null;
    }
    return takeover as unknown as MemoryTakeoverPlan;
}

/**
 * 功能：写入旧聊天接管总状态。
 * @param chatKey 聊天键。
 * @param plan 接管计划。
 * @returns 异步完成。
 */
export async function writeMemoryTakeoverPlan(chatKey: string, plan: MemoryTakeoverPlan): Promise<void> {
    const stateRow = await readMemoryOSChatState(chatKey);
    const state = toRecord(stateRow?.state);
    await writeMemoryOSChatState(chatKey, {
        ...state,
        takeover: plan,
    });
}

/**
 * 功能：写入接管批次元数据。
 * @param chatKey 聊天键。
 * @param batch 批次元数据。
 * @returns 异步完成。
 */
export async function saveMemoryTakeoverBatchMeta(chatKey: string, batch: MemoryTakeoverBatch): Promise<void> {
    await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_batch_meta', {
        recordId: String(batch.batchId ?? '').trim(),
        payload: batch as unknown as Record<string, unknown>,
        ts: batch.finishedAt ?? batch.startedAt ?? Date.now(),
    });
}

/**
 * 功能：读取接管批次元数据列表。
 * @param chatKey 聊天键。
 * @returns 批次元数据列表。
 */
export async function loadMemoryTakeoverBatchMetas(chatKey: string): Promise<MemoryTakeoverBatch[]> {
    const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_batch_meta', {
        order: 'asc',
        limit: 2000,
    });
    return rows.map((row: DBChatPluginRecord): MemoryTakeoverBatch => {
        return row.payload as unknown as MemoryTakeoverBatch;
    });
}

/**
 * 功能：写入接管批次分析结果。
 * @param chatKey 聊天键。
 * @param result 批次分析结果。
 * @returns 异步完成。
 */
export async function saveMemoryTakeoverBatchResult(chatKey: string, result: MemoryTakeoverBatchResult): Promise<void> {
    await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_batch_result', {
        recordId: String(result.batchId ?? '').trim(),
        payload: result as unknown as Record<string, unknown>,
        ts: result.generatedAt || Date.now(),
    });
}

/**
 * 功能：写入候选角色提及记录。
 * @param chatKey 聊天键。
 * @param mentions 候选角色提及列表。
 * @returns 异步完成。
 */
export async function saveCandidateActorMentions(
    chatKey: string,
    mentions: MemoryTakeoverCandidateActorMention[],
): Promise<void> {
    const normalizedChatKey = normalizeText(chatKey);
    await Promise.all((mentions ?? []).map((mention: MemoryTakeoverCandidateActorMention): Promise<void> => {
        const recordId = `${String(mention.sourceBatchId ?? '').trim()}::${String(mention.actorKey ?? mention.name ?? '').trim()}`;
        return appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizedChatKey, 'candidate_actor_mentions', {
            recordId,
            payload: {
                ...mention,
                chatKey: normalizedChatKey,
            } as unknown as Record<string, unknown>,
            ts: Date.now(),
        });
    }));
}

/**
 * 功能：读取候选角色提及记录。
 * @param chatKey 聊天键。
 * @returns 候选角色提及列表。
 */
export async function loadCandidateActorMentions(chatKey: string): Promise<MemoryTakeoverCandidateActorMention[]> {
    const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'candidate_actor_mentions', {
        order: 'asc',
        limit: 4000,
    });
    return rows.map((row: DBChatPluginRecord): MemoryTakeoverCandidateActorMention => {
        return row.payload as unknown as MemoryTakeoverCandidateActorMention;
    });
}

/**
 * 功能：读取接管批次分析结果列表。
 * @param chatKey 聊天键。
 * @returns 批次分析结果列表。
 */
export async function loadMemoryTakeoverBatchResults(chatKey: string): Promise<MemoryTakeoverBatchResult[]> {
    const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_batch_result', {
        order: 'asc',
        limit: 2000,
    });
    return rows.map((row: DBChatPluginRecord): MemoryTakeoverBatchResult => {
        return row.payload as unknown as MemoryTakeoverBatchResult;
    });
}

/**
 * 功能：写入接管预览数据。
 * @param chatKey 聊天键。
 * @param recordId 记录标识。
 * @param payload 预览数据。
 * @param scope 预览作用域。
 * @returns 异步完成。
 */
export async function saveMemoryTakeoverPreview(
    chatKey: string,
    recordId: 'baseline' | 'active_snapshot' | 'latest_batch' | 'consolidation',
    payload: MemoryTakeoverBaseline | MemoryTakeoverActiveSnapshot | MemoryTakeoverBatchResult | MemoryTakeoverConsolidationResult,
    scope: 'runtime' | 'draft' = 'runtime',
): Promise<void> {
    await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), resolveTakeoverPreviewCollection(scope), {
        recordId,
        payload: payload as unknown as Record<string, unknown>,
        ts: Date.now(),
    });
}

/**
 * 功能：清空指定聊天的接管预览缓存。
 * @param chatKey 聊天键。
 * @returns 清理完成。
 */
export async function clearMemoryTakeoverPreview(chatKey: string): Promise<void> {
    await deleteSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), resolveTakeoverPreviewCollection('runtime'));
}

/**
 * 功能：按作用域解析接管预览集合名称。
 * @param scope 预览作用域。
 * @returns 对应集合名。
 */
function resolveTakeoverPreviewCollection(scope: 'runtime' | 'draft'): 'takeover_preview_runtime' | 'takeover_preview_draft' {
    return scope === 'draft' ? 'takeover_preview_draft' : 'takeover_preview_runtime';
}

/**
 * 功能：读取最新接管预览数据。
 * @param chatKey 聊天键。
 * @param scope 预览作用域。
 * @returns 预览映射。
 */
export async function loadMemoryTakeoverPreview(chatKey: string, scope: 'runtime' | 'draft' = 'runtime'): Promise<{
    baseline: MemoryTakeoverBaseline | null;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    latestBatch: MemoryTakeoverBatchResult | null;
    consolidation: MemoryTakeoverConsolidationResult | null;
}> {
    const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), resolveTakeoverPreviewCollection(scope), {
        order: 'desc',
        limit: 2000,
    });
    const result = {
        baseline: null as MemoryTakeoverBaseline | null,
        activeSnapshot: null as MemoryTakeoverActiveSnapshot | null,
        latestBatch: null as MemoryTakeoverBatchResult | null,
        consolidation: null as MemoryTakeoverConsolidationResult | null,
    };
    for (const row of rows) {
        if (row.recordId === 'baseline' && !result.baseline) {
            result.baseline = row.payload as unknown as MemoryTakeoverBaseline;
        }
        if (row.recordId === 'active_snapshot' && !result.activeSnapshot) {
            result.activeSnapshot = row.payload as unknown as MemoryTakeoverActiveSnapshot;
        }
        if (row.recordId === 'latest_batch' && !result.latestBatch) {
            result.latestBatch = row.payload as unknown as MemoryTakeoverBatchResult;
        }
        if (row.recordId === 'consolidation' && !result.consolidation) {
            result.consolidation = row.payload as unknown as MemoryTakeoverConsolidationResult;
        }
    }
    return result;
}

/**
 * 功能：写入 compareKey 索引记录。
 * @param chatKey 聊天键。
 * @param record compareKey 索引记录。
 * @returns 异步完成。
 */
export async function saveMemoryCompareKeyIndexRecord(chatKey: string, record: MemoryCompareKeyIndexRecord): Promise<void> {
    const normalizedChatKey = normalizeText(chatKey);
    await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizedChatKey, 'comparekey_index', {
        recordId: String(record.entryId ?? '').trim(),
        payload: ({
            ...record,
            chatKey: normalizedChatKey,
            entryId: String(record.entryId ?? '').trim(),
            entityKey: String(record.entityKey ?? '').trim(),
            entryType: String(record.entryType ?? '').trim(),
            compareKey: String(record.compareKey ?? '').trim(),
            matchKeys: Array.from(new Set((record.matchKeys ?? []).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean))),
            schemaVersion: String(record.schemaVersion ?? '').trim(),
            canonicalName: String(record.canonicalName ?? '').trim(),
            legacyCompareKeys: Array.from(new Set((record.legacyCompareKeys ?? []).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean))),
            title: String(record.title ?? '').trim(),
            updatedAt: Number(record.updatedAt ?? Date.now()) || Date.now(),
        }) as unknown as Record<string, unknown>,
        ts: Number(record.updatedAt ?? Date.now()) || Date.now(),
    });
}

/**
 * 功能：读取当前聊天的 compareKey 索引记录。
 * @param chatKey 聊天键。
 * @returns 索引记录列表。
 */
export async function loadMemoryCompareKeyIndexRecords(chatKey: string): Promise<MemoryCompareKeyIndexRecord[]> {
    const rows = await queryLatestSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'comparekey_index', {
        order: 'asc',
        limit: 5000,
    });
    return rows
        .map((row: DBChatPluginRecord): MemoryCompareKeyIndexRecord | null => {
            const payload = toRecord(row.payload);
            const entryId = normalizeText(payload.entryId);
            if (!entryId) {
                return null;
            }
            return {
                chatKey: normalizeText(payload.chatKey) || normalizeText(chatKey),
                entryId,
                entityKey: normalizeText(payload.entityKey),
                entryType: normalizeText(payload.entryType),
                compareKey: normalizeText(payload.compareKey),
                matchKeys: normalizeStringArray(payload.matchKeys),
                schemaVersion: normalizeText(payload.schemaVersion),
                canonicalName: normalizeText(payload.canonicalName),
                legacyCompareKeys: normalizeStringArray(payload.legacyCompareKeys),
                title: normalizeText(payload.title),
                updatedAt: Number(payload.updatedAt ?? row.ts ?? 0) || 0,
            };
        })
        .filter((item: MemoryCompareKeyIndexRecord | null): item is MemoryCompareKeyIndexRecord => Boolean(item));
}

/**
 * 功能：按 entryId 删除 compareKey 索引记录。
 * @param chatKey 聊天键。
 * @param entryId 条目 ID。
 * @returns 异步完成。
 */
export async function deleteMemoryCompareKeyIndexRecord(chatKey: string, entryId: string): Promise<void> {
    const normalizedChatKey = normalizeText(chatKey);
    const normalizedEntryId = String(entryId ?? '').trim();
    const rows = await querySdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizedChatKey, 'comparekey_index', {
        order: 'asc',
        limit: 5000,
    });
    const targetIds = rows
        .filter((row: DBChatPluginRecord): boolean => String(row.recordId ?? '').trim() === normalizedEntryId)
        .map((row: DBChatPluginRecord): number => Number(row.id))
        .filter((id: number): boolean => Number.isFinite(id));
    if (targetIds.length <= 0) {
        return;
    }
    await db.chat_plugin_records.bulkDelete(targetIds);
}

/**
 * 功能：写入接管日志。
 * @param chatKey 聊天键。
 * @param record 日志记录。
 * @returns 异步完成。
 */
export async function appendMemoryTakeoverLog(chatKey: string, record: MemoryTakeoverLogRecord): Promise<void> {
    await appendSdkPluginChatRecord(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_logs', {
        recordId: `${record.takeoverId}:${record.stage}:${record.ts}`,
        payload: record as unknown as Record<string, unknown>,
        ts: record.ts,
    });
}

/**
 * 功能：读取接管日志。
 * @param chatKey 聊天键。
 * @param limit 限制数量。
 * @returns 日志列表。
 */
export async function loadMemoryTakeoverLogs(chatKey: string, limit: number = 120): Promise<MemoryTakeoverLogRecord[]> {
    const rows = await querySdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, normalizeText(chatKey), 'takeover_logs', {
        order: 'desc',
        limit,
    });
    return rows.map((row: DBChatPluginRecord): MemoryTakeoverLogRecord => row.payload as unknown as MemoryTakeoverLogRecord);
}

/**
 * 功能：安全归一化文本。
 * @param value 原始值。
 * @returns 归一化结果。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：将未知输入归一化为字符串数组并去重。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of value) {
        const normalized = normalizeText(row);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：安全归一化对象。
 * @param value 原始值。
 * @returns 对象结果。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：归一化严格一致性基准结构。
 * @param value 原始基准值。
 * @returns 归一化后的基准，无法识别时返回 undefined。
 */
function normalizeMemoryPromptParityBaseline(value: unknown): MemoryPromptParityBaseline | undefined {
    const record = toRecord(value);
    const finalPromptText = normalizeText(record.finalPromptText);
    if (!finalPromptText) {
        return undefined;
    }
    const insertIndex = Number(record.insertIndex);
    return {
        finalPromptText,
        insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
        insertedMemoryBlock: normalizeText(record.insertedMemoryBlock),
        reasonCodes: normalizeStringArray(record.reasonCodes),
        matchedActorKeys: normalizeStringArray(record.matchedActorKeys),
        matchedEntryIds: normalizeStringArray(record.matchedEntryIds),
    };
}

/**
 * 功能：归档指定聊天。
 * @param chatKey 聊天键。
 * @param reason 原因。
 * @returns 执行结果。
 */
export async function archiveMemoryChat(chatKey: string, reason: string = 'soft_delete'): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = toRecord(row?.state);
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: true,
        archivedAt: Date.now(),
        archiveReason: reason,
    });
}

/**
 * 功能：恢复指定聊天归档状态。
 * @param chatKey 聊天键。
 * @returns 执行结果。
 */
export async function restoreArchivedMemoryChat(chatKey: string): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = toRecord(row?.state);
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
    });
}

/**
 * 功能：按聊天清理统一记忆数据。
 * @param chatKey 聊天键。
 * @param options 清理参数。
 * @returns 执行结果。
 */
export async function clearMemoryChatData(
    chatKey: string,
    options: ClearMemoryChatDataOptions = {},
): Promise<void> {
    const includeAudit = options.includeAudit !== false;
    const txTables = includeAudit
        ? [
            db.events,
            db.templates,
            db.audit,
            db.meta,
            db.memory_mutation_history,
            db.memory_entry_audit_records,
            db.memory_entries,
            db.memory_entry_types,
            db.actor_memory_profiles,
            db.role_entry_memory,
            db.memory_relationships,
            db.summary_snapshots,
            db.world_profile_bindings,
        ]
        : [
            db.events,
            db.templates,
            db.meta,
            db.memory_mutation_history,
            db.memory_entry_audit_records,
            db.memory_entries,
            db.memory_entry_types,
            db.actor_memory_profiles,
            db.role_entry_memory,
            db.memory_relationships,
            db.summary_snapshots,
            db.world_profile_bindings,
        ];

    await db.transaction('rw', txTables, async (): Promise<void> => {
        const tasks: Array<Promise<unknown>> = [
            db.events.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.templates.where('[chatKey+createdAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.meta.delete(chatKey),
            db.memory_mutation_history.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.memory_entry_audit_records.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.memory_entries.where('chatKey').equals(chatKey).delete(),
            db.memory_entry_types.where('chatKey').equals(chatKey).delete(),
            db.actor_memory_profiles.where('chatKey').equals(chatKey).delete(),
            db.role_entry_memory.where('chatKey').equals(chatKey).delete(),
            db.memory_relationships.where('chatKey').equals(chatKey).delete(),
            db.summary_snapshots.where('chatKey').equals(chatKey).delete(),
            db.world_profile_bindings.where('chatKey').equals(chatKey).delete(),
        ];
        if (includeAudit) {
            tasks.push(db.audit.where('chatKey').equals(chatKey).delete());
        }
        await Promise.all(tasks);
    });

    await Promise.all([
        deleteSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey),
        deleteSdkPluginChatRecords(MEMORY_OS_PLUGIN_ID, chatKey),
        patchSdkChatShared(chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: {
                    activeTemplate: null,
                    eventCount: 0,
                    factCount: 0,
                    lastSummaryAt: null,
                },
            },
        }),
    ]);
}

/**
 * 功能：导出聊天数据库快照。
 * @param chatKey 聊天键。
 * @returns 快照结果。
 */
export async function exportMemoryChatDatabaseSnapshot(chatKey: string): Promise<MemoryChatDatabaseSnapshot> {
    const normalizedChatKey = normalizeText(chatKey);
    const [
        events,
        templates,
        audit,
        meta,
        memoryMutationHistory,
        memoryEntryAuditRecords,
        memoryEntries,
        memoryEntryTypes,
        actorMemoryProfiles,
        roleEntryMemory,
        memoryRelationships,
        summarySnapshots,
        worldProfileBindings,
        pluginState,
        pluginRecords,
    ] = await Promise.all([
        db.events.where('chatKey').equals(normalizedChatKey).toArray(),
        db.templates.where('chatKey').equals(normalizedChatKey).toArray(),
        db.audit.where('chatKey').equals(normalizedChatKey).toArray(),
        db.meta.get(normalizedChatKey),
        db.memory_mutation_history.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_entry_audit_records.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_entries.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_entry_types.where('chatKey').equals(normalizedChatKey).toArray(),
        db.actor_memory_profiles.where('chatKey').equals(normalizedChatKey).toArray(),
        db.role_entry_memory.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_relationships.where('chatKey').equals(normalizedChatKey).toArray(),
        db.summary_snapshots.where('chatKey').equals(normalizedChatKey).toArray(),
        db.world_profile_bindings.where('chatKey').equals(normalizedChatKey).toArray(),
        db.chat_plugin_state.get([MEMORY_OS_PLUGIN_ID, normalizedChatKey]),
        db.chat_plugin_records
            .where('pluginId')
            .equals(MEMORY_OS_PLUGIN_ID)
            .and((row: DBChatPluginRecord): boolean => normalizeText(row.chatKey) === normalizedChatKey)
            .toArray(),
    ]);

    return {
        chatKey: normalizedChatKey,
        generatedAt: Date.now(),
        events,
        templates,
        audit,
        meta: meta ?? null,
        memoryMutationHistory,
        memoryEntryAuditRecords,
        memoryEntries,
        memoryEntryTypes,
        actorMemoryProfiles,
        roleEntryMemory,
        memoryRelationships,
        summarySnapshots,
        worldProfileBindings,
        pluginState: pluginState ?? null,
        pluginRecords,
    };
}

/**
 * 功能：导出 Prompt 测试包。
 * @param chatKey 聊天键。
 * @param options 导出参数。
 * @returns 测试包结果。
 */
export async function exportMemoryPromptTestBundle(
    chatKey: string,
    options: {
        promptFixture?: Array<Record<string, unknown>>;
        captureSnapshot?: PromptReadyCaptureSnapshot;
        query?: string;
        sourceMessageId?: string;
        settings?: Record<string, unknown>;
        expectation?: MemoryPromptTestBundle['expectation'];
        parityBaseline?: MemoryPromptParityBaseline;
        runResult?: Record<string, unknown>;
    } = {},
): Promise<MemoryPromptTestBundle> {
    const normalizedChatKey = normalizeText(chatKey);
    const database = await exportMemoryChatDatabaseSnapshot(normalizedChatKey);
    const hasOverridePromptFixture = Array.isArray(options.promptFixture);
    const snapshot = options.captureSnapshot;
    const snapshotPromptFixture = Array.isArray(snapshot?.promptFixture) ? snapshot.promptFixture : [];
    const resolvedPromptFixture = hasOverridePromptFixture
        ? (options.promptFixture as Array<Record<string, unknown>>)
        : snapshotPromptFixture;
    const resolvedQuery = normalizeText(options.query ?? (hasOverridePromptFixture ? '' : snapshot?.query ?? ''));
    const resolvedSourceMessageId = normalizeText(
        options.sourceMessageId ?? (hasOverridePromptFixture ? '' : snapshot?.sourceMessageId ?? ''),
    ) || undefined;
    const captureMeta: MemoryPromptTestBundle['captureMeta'] = (!hasOverridePromptFixture && snapshot && resolvedPromptFixture.length > 0)
        ? {
            mode: 'exact_replay',
            capturedAt: Number(snapshot.capturedAt ?? 0) || Date.now(),
            source: 'chat_completion_prompt_ready',
        }
        : {
            mode: 'simulated_prompt',
            note: resolvedPromptFixture.length > 0 ? 'manual_prompt_fixture' : 'missing_prompt_fixture',
        };
    const parityBaseline = normalizeMemoryPromptParityBaseline(
        options.parityBaseline
        ?? toRecord(options.runResult).parityBaseline
        ?? options.runResult,
    );

    return {
        version: '1.0.0',
        exportedAt: Date.now(),
        sourceChatKey: normalizedChatKey,
        database,
        promptFixture: resolvedPromptFixture,
        query: resolvedQuery,
        sourceMessageId: resolvedSourceMessageId,
        settings: options.settings && typeof options.settings === 'object' ? options.settings : {},
        captureMeta,
        expectation: options.expectation,
        parityBaseline,
        runResult: options.runResult,
    };
}

/**
 * 功能：导入 Prompt 测试包。
 * @param bundle 测试包。
 * @param options 导入参数。
 * @returns 导入结果。
 */
export async function importMemoryPromptTestBundle(
    bundle: MemoryPromptTestBundle,
    options: { targetChatKey?: string; skipClear?: boolean } = {},
): Promise<ImportMemoryPromptTestBundleResult> {
    const sourceDatabase = bundle?.database;
    const targetChatKey = normalizeText(options.targetChatKey ?? `memory_test::${Date.now()}`);
    if (!sourceDatabase || !normalizeText(sourceDatabase.chatKey)) {
        throw new Error('invalid_bundle_database');
    }

    const mapChatKey = (row: unknown): Record<string, unknown> => {
        const record = toRecord(row);
        return {
            ...record,
            chatKey: targetChatKey,
        };
    };

    if (options.skipClear !== true) {
        await clearMemoryChatData(targetChatKey, { includeAudit: true });
    }

    await db.transaction('rw', [
        db.events,
        db.templates,
        db.audit,
        db.meta,
        db.memory_mutation_history,
        db.memory_entry_audit_records,
        db.memory_entries,
        db.memory_entry_types,
        db.actor_memory_profiles,
        db.role_entry_memory,
        db.memory_relationships,
        db.summary_snapshots,
        db.world_profile_bindings,
    ], async (): Promise<void> => {
        await Promise.all([
            db.events.bulkPut((sourceDatabase.events ?? []).map((row: DBEvent): DBEvent => ({ ...row, chatKey: targetChatKey }))),
            db.templates.bulkPut((sourceDatabase.templates ?? []).map((row) => mapChatKey(row) as unknown as DBTemplate)),
            db.audit.bulkPut((sourceDatabase.audit ?? []).map((row) => mapChatKey(row) as unknown as DBAudit)),
            sourceDatabase.meta
                ? db.meta.put({ ...toRecord(sourceDatabase.meta), chatKey: targetChatKey } as DBMeta)
                : Promise.resolve(),
            db.memory_mutation_history.bulkPut((sourceDatabase.memoryMutationHistory ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryMutationHistory)),
            db.memory_entry_audit_records.bulkPut((sourceDatabase.memoryEntryAuditRecords ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryEntryAuditRecord)),
            db.memory_entries.bulkPut((sourceDatabase.memoryEntries ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryEntry)),
            db.memory_entry_types.bulkPut((sourceDatabase.memoryEntryTypes ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryEntryType)),
            db.actor_memory_profiles.bulkPut((sourceDatabase.actorMemoryProfiles ?? []).map((row) => mapChatKey(row) as unknown as DBActorMemoryProfile)),
            db.role_entry_memory.bulkPut((sourceDatabase.roleEntryMemory ?? []).map((row) => mapChatKey(row) as unknown as DBRoleEntryMemory)),
            db.memory_relationships.bulkPut((sourceDatabase.memoryRelationships ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryRelationship)),
            db.summary_snapshots.bulkPut((sourceDatabase.summarySnapshots ?? []).map((row) => mapChatKey(row) as unknown as DBSummarySnapshot)),
            db.world_profile_bindings.bulkPut((sourceDatabase.worldProfileBindings ?? []).map((row) => mapChatKey(row) as unknown as DBWorldProfileBinding)),
        ]);
    });

    const pluginStateRecord = toRecord(sourceDatabase.pluginState);
    if (Object.keys(pluginStateRecord).length > 0) {
        await db.chat_plugin_state.put({
            ...(pluginStateRecord as unknown as DBChatPluginState),
            pluginId: MEMORY_OS_PLUGIN_ID,
            chatKey: targetChatKey,
            updatedAt: Number(pluginStateRecord.updatedAt ?? Date.now()),
        });
    }

    const pluginRecords = (sourceDatabase.pluginRecords ?? [])
        .filter((row: unknown): boolean => Boolean(row) && typeof row === 'object')
        .map((row: unknown): DBChatPluginRecord => {
            const record = row as Record<string, unknown>;
            return {
                ...(record as unknown as DBChatPluginRecord),
                id: undefined,
                pluginId: MEMORY_OS_PLUGIN_ID,
                chatKey: targetChatKey,
                collection: normalizeText(record.collection) || 'imported',
                recordId: normalizeText(record.recordId) || `record::${crypto.randomUUID()}`,
                ts: Number(record.ts ?? Date.now()),
                updatedAt: Number(record.updatedAt ?? Date.now()),
                payload: toRecord(record.payload),
            };
        });
    if (pluginRecords.length > 0) {
        await db.chat_plugin_records.bulkPut(pluginRecords);
    }

    return {
        chatKey: targetChatKey,
        importedAt: Date.now(),
        bundle: {
            ...bundle,
            parityBaseline: normalizeMemoryPromptParityBaseline(bundle.parityBaseline),
            database: {
                ...sourceDatabase,
                chatKey: targetChatKey,
            },
        },
    };
}

/**
 * 功能：清空全部统一记忆数据。
 * @returns 执行结果。
 */
export async function clearAllMemoryData(): Promise<void> {
    await db.transaction('rw', [
        db.events,
        db.templates,
        db.audit,
        db.meta,
        db.memory_mutation_history,
        db.memory_entry_audit_records,
        db.memory_entries,
        db.memory_entry_types,
        db.actor_memory_profiles,
        db.role_entry_memory,
        db.memory_relationships,
        db.summary_snapshots,
        db.world_profile_bindings,
        db.chat_plugin_state,
        db.chat_plugin_records,
    ], async (): Promise<void> => {
        await Promise.all([
            db.events.clear(),
            db.templates.clear(),
            db.audit.clear(),
            db.meta.clear(),
            db.memory_mutation_history.clear(),
            db.memory_entry_audit_records.clear(),
            db.memory_entries.clear(),
            db.memory_entry_types.clear(),
            db.actor_memory_profiles.clear(),
            db.role_entry_memory.clear(),
            db.memory_relationships.clear(),
            db.summary_snapshots.clear(),
            db.world_profile_bindings.clear(),
            db.chat_plugin_state.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
            db.chat_plugin_records.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
        ]);
    });
}
