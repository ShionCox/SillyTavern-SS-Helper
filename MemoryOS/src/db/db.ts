import Dexie from 'dexie';
import {
    db,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    patchSdkChatShared,
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
    DBMemoryMutationHistory,
    DBMeta,
    DBSummarySnapshot,
    DBWorldProfileBinding,
    DBTemplate,
    DBTemplateBinding,
} from '../../../SDK/db';
import { SSHelperDatabase } from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

export { db, patchSdkChatShared };
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
    DBMemoryMutationHistory,
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
    memoryEntries: DBMemoryEntry[];
    memoryEntryTypes: DBMemoryEntryType[];
    actorMemoryProfiles: DBActorMemoryProfile[];
    roleEntryMemory: DBRoleEntryMemory[];
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
            db.memory_entries,
            db.memory_entry_types,
            db.actor_memory_profiles,
            db.role_entry_memory,
            db.summary_snapshots,
            db.world_profile_bindings,
        ]
        : [
            db.events,
            db.templates,
            db.meta,
            db.memory_mutation_history,
            db.memory_entries,
            db.memory_entry_types,
            db.actor_memory_profiles,
            db.role_entry_memory,
            db.summary_snapshots,
            db.world_profile_bindings,
        ];

    await db.transaction('rw', txTables, async (): Promise<void> => {
        const tasks: Array<Promise<unknown>> = [
            db.events.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.templates.where('[chatKey+createdAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.meta.delete(chatKey),
            db.memory_mutation_history.where('[chatKey+ts]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.memory_entries.where('chatKey').equals(chatKey).delete(),
            db.memory_entry_types.where('chatKey').equals(chatKey).delete(),
            db.actor_memory_profiles.where('chatKey').equals(chatKey).delete(),
            db.role_entry_memory.where('chatKey').equals(chatKey).delete(),
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
        memoryEntries,
        memoryEntryTypes,
        actorMemoryProfiles,
        roleEntryMemory,
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
        db.memory_entries.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_entry_types.where('chatKey').equals(normalizedChatKey).toArray(),
        db.actor_memory_profiles.where('chatKey').equals(normalizedChatKey).toArray(),
        db.role_entry_memory.where('chatKey').equals(normalizedChatKey).toArray(),
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
        memoryEntries,
        memoryEntryTypes,
        actorMemoryProfiles,
        roleEntryMemory,
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
        db.memory_entries,
        db.memory_entry_types,
        db.actor_memory_profiles,
        db.role_entry_memory,
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
            db.memory_entries.bulkPut((sourceDatabase.memoryEntries ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryEntry)),
            db.memory_entry_types.bulkPut((sourceDatabase.memoryEntryTypes ?? []).map((row) => mapChatKey(row) as unknown as DBMemoryEntryType)),
            db.actor_memory_profiles.bulkPut((sourceDatabase.actorMemoryProfiles ?? []).map((row) => mapChatKey(row) as unknown as DBActorMemoryProfile)),
            db.role_entry_memory.bulkPut((sourceDatabase.roleEntryMemory ?? []).map((row) => mapChatKey(row) as unknown as DBRoleEntryMemory)),
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
        db.memory_entries,
        db.memory_entry_types,
        db.actor_memory_profiles,
        db.role_entry_memory,
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
            db.memory_entries.clear(),
            db.memory_entry_types.clear(),
            db.actor_memory_profiles.clear(),
            db.role_entry_memory.clear(),
            db.summary_snapshots.clear(),
            db.world_profile_bindings.clear(),
            db.chat_plugin_state.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
            db.chat_plugin_records.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
        ]);
    });
}
