import Dexie from 'dexie';
import {
    db,
    readSdkPluginChatState,
    deleteSdkPluginChatRecords,
    deleteSdkPluginChatState,
    patchSdkChatShared,
    writeSdkPluginChatState,
} from '../../../SDK/db';
import type {
    DBChatPluginRecord,
    DBChatPluginState,
    ChatSharedPatch,
    DBAudit,
    DBEvent,
    DBFact,
    DBFactProvenance,
    DBDerivationSource,
    DBMeta,
    DBSummary,
    DBSummarySource,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunkMetadata,
    DBMemoryCard,
    DBMemoryCardEmbedding,
    DBMemoryCardMeta,
    DBRelationshipMemory,
    DBMemoryMutationHistory,
    DBMemoryRecallLog,
    DBWorldInfoCache,
    DBWorldState,
} from '../../../SDK/db';
import { SSHelperDatabase } from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

export { db, patchSdkChatShared };
export type {
    DBChatPluginRecord,
    DBChatPluginState,
    ChatSharedPatch,
    DBAudit,
    DBEvent,
    DBFact,
    DBFactProvenance,
    DBDerivationSource,
    DBMeta,
    DBSummary,
    DBSummarySource,
    DBTemplate,
    DBTemplateBinding,
    DBVectorChunkMetadata,
    DBMemoryCard,
    DBMemoryCardEmbedding,
    DBMemoryCardMeta,
    DBRelationshipMemory,
    DBMemoryMutationHistory,
    DBMemoryRecallLog,
    DBWorldInfoCache,
    DBWorldState,
};
export { SSHelperDatabase as MemoryOSDatabase };

export interface ClearMemoryChatDataOptions {
    includeAudit?: boolean;
}

export interface MemoryChatDatabaseSnapshot {
    chatKey: string;
    generatedAt: number;
    events: DBEvent[];
    facts: DBFact[];
    worldState: DBWorldState[];
    summaries: DBSummary[];
    templates: DBTemplate[];
    audit: DBAudit[];
    meta: DBMeta | null;
    worldinfoCache: DBWorldInfoCache[];
    templateBindings: DBTemplateBinding[];
    memoryCards: DBMemoryCard[];
    memoryCardEmbeddings: DBMemoryCardEmbedding[];
    memoryCardMeta: DBMemoryCardMeta[];
    relationshipMemory: DBRelationshipMemory[];
    memoryRecallLog: DBMemoryRecallLog[];
    memoryMutationHistory: DBMemoryMutationHistory[];
    pluginState: DBChatPluginState | null;
    pluginRecords: DBChatPluginRecord[];
}

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
    runResult?: Record<string, unknown>;
}

export interface PromptReadyCaptureSnapshot {
    promptFixture: Array<Record<string, unknown>>;
    query: string;
    sourceMessageId?: string;
    capturedAt: number;
    requestMeta?: Record<string, unknown>;
}

export interface ImportMemoryPromptTestBundleResult {
    chatKey: string;
    importedAt: number;
    bundle: MemoryPromptTestBundle;
}

/**
 * 功能：将未知值转换为可用字符串，空值回退为默认值。
 * @param value 待转换值。
 * @param fallback 默认字符串。
 * @returns 规范化后的字符串。
 */
function toSafeString(value: unknown, fallback: string): string {
    const text = String(value ?? '').trim();
    return text || fallback;
}

/**
 * 功能：将未知值转换为有限数值，非法值回退为默认值。
 * @param value 待转换值。
 * @param fallback 默认数值。
 * @returns 有限数值。
 */
function toSafeNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

/**
 * 功能：归一化 summary level，兼容旧导出中的非标准值。
 * @param value 待归一化值。
 * @returns 合法 level。
 */
function normalizeSummaryLevel(value: unknown): DBSummary['level'] {
    const level = String(value ?? '').trim().toLowerCase();
    if (level === 'message' || level === 'scene' || level === 'arc') {
        return level;
    }
    return 'scene';
}

/**
 * 功能：归一化 summary 行，避免导入时因主键或索引字段缺失导致事务中断。
 * @param rows 原始 summary 列表。
 * @param targetChatKey 目标 chatKey。
 * @returns 过滤后的可写入 summary 列表。
 */
function normalizeSummaryRows(rows: unknown[], targetChatKey: string): DBSummary[] {
    const now = Date.now();
    const normalized: DBSummary[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const source = row as Record<string, unknown>;
        const content = String(source.content ?? '').trim();
        if (!content) {
            continue;
        }
        normalized.push({
            ...(source as unknown as DBSummary),
            summaryId: toSafeString(source.summaryId, `summary::${targetChatKey}::${crypto.randomUUID()}`),
            chatKey: targetChatKey,
            level: normalizeSummaryLevel(source.level),
            createdAt: toSafeNumber(source.createdAt, now),
            content,
        });
    }
    return normalized;
}

/**
 * 功能：归一化 event 行，确保 eventId/ts/type 存在并可索引。
 * @param rows 原始 event 列表。
 * @param targetChatKey 目标 chatKey。
 * @returns 可写入 event 列表。
 */
function normalizeEventRows(rows: unknown[], targetChatKey: string): DBEvent[] {
    const now = Date.now();
    const normalized: DBEvent[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const source = row as Record<string, unknown>;
        const payload = source.payload ?? {};
        normalized.push({
            ...(source as unknown as DBEvent),
            eventId: toSafeString(source.eventId, `event::${targetChatKey}::${crypto.randomUUID()}`),
            chatKey: targetChatKey,
            ts: toSafeNumber(source.ts, now),
            type: toSafeString(source.type, 'imported_event'),
            payload,
        });
    }
    return normalized;
}

/**
 * 功能：归一化事实行，兼容缺失主键或更新时间的旧数据。
 * @param rows 原始事实列表。
 * @param targetChatKey 目标 chatKey。
 * @returns 可写入事实列表。
 */
function normalizeFactRows(rows: unknown[], targetChatKey: string): DBFact[] {
    const now = Date.now();
    const normalized: DBFact[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const source = row as Record<string, unknown>;
        normalized.push({
            ...(source as unknown as DBFact),
            factKey: toSafeString(source.factKey, `fact::${targetChatKey}::${crypto.randomUUID()}`),
            chatKey: targetChatKey,
            type: toSafeString(source.type, 'imported_fact'),
            updatedAt: toSafeNumber(source.updatedAt, now),
            value: source.value ?? '',
        });
    }
    return normalized;
}

/**
 * 功能：归一化世界状态行，确保 stateKey/path 可用。
 * @param rows 原始世界状态列表。
 * @param targetChatKey 目标 chatKey。
 * @returns 可写入世界状态列表。
 */
function normalizeWorldStateRows(rows: unknown[], targetChatKey: string): DBWorldState[] {
    const now = Date.now();
    const normalized: DBWorldState[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const source = row as Record<string, unknown>;
        normalized.push({
            ...(source as unknown as DBWorldState),
            stateKey: toSafeString(source.stateKey, `state::${targetChatKey}::${crypto.randomUUID()}`),
            chatKey: targetChatKey,
            path: toSafeString(source.path, 'imported/unknown'),
            updatedAt: toSafeNumber(source.updatedAt, now),
            value: source.value ?? '',
        });
    }
    return normalized;
}

/**
 * 功能：将指定聊天的 MemoryOS 状态标记为归档。
 * 参数：
 *   chatKey (string)：聊天键。
 *   reason (string)：归档原因。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function archiveMemoryChat(chatKey: string, reason: string = 'soft_delete'): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = (row?.state ?? {}) as Record<string, unknown>;
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: true,
        archivedAt: Date.now(),
        archiveReason: reason,
    });
}

/**
 * 功能：恢复指定聊天的归档状态。
 * 参数：
 *   chatKey (string)：聊天键。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function restoreArchivedMemoryChat(chatKey: string): Promise<void> {
    const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey);
    const state = (row?.state ?? {}) as Record<string, unknown>;
    await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, chatKey, {
        ...state,
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
    });
}

/**
 * 功能：执行聊天级立即清理。
 * 参数：
 *   chatKey (string)：聊天键。
 *   options ({ includeAudit?: boolean })：是否连审计一起删除。
 * 返回：
 *   Promise<void>：异步完成。
 */
export async function purgeMemoryChat(
    chatKey: string,
    options: { includeAudit?: boolean } = {},
): Promise<void> {
    await clearMemoryChatData(chatKey, {
        includeAudit: options.includeAudit ?? false,
    });
}

/**
 * 功能：清空指定聊天下的 MemoryOS 数据，并同步删除插件级状态与记录。
 *
 * 参数：
 *   chatKey (string)：要清理的聊天键。
 *   options (ClearMemoryChatDataOptions)：清理选项，可控制是否保留审计记录。
 *
 * 返回：
 *   Promise<void>：清理完成后结束。
 */
export async function clearMemoryChatData(
    chatKey: string,
    options: ClearMemoryChatDataOptions = {},
): Promise<void> {
    const includeAudit = options.includeAudit ?? true;
    const writableTables = includeAudit
        ? [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.audit,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
        ]
        : [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
        ];

    await db.transaction('rw', writableTables, async (): Promise<void> => {
        const deleteTasks: Array<Promise<unknown>> = [
            db.events
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.facts
                .where('[chatKey+updatedAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.world_state
                .where('[chatKey+path]')
                .between([chatKey, ''], [chatKey, '\uffff'])
                .delete(),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([chatKey, '', Dexie.minKey], [chatKey, '\uffff', Dexie.maxKey])
                .delete(),
            db.templates
                .where('[chatKey+createdAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.meta.delete(chatKey),
            db.worldinfo_cache.where('chatKey').equals(chatKey).delete(),
            db.template_bindings.where('chatKey').equals(chatKey).delete(),
            db.memory_cards.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.memory_card_embeddings.where('chatKey').equals(chatKey).delete(),
            db.memory_card_meta.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).delete(),
            db.relationship_memory
                .where('[chatKey+updatedAt]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.memory_recall_log
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
            db.memory_mutation_history
                .where('[chatKey+ts]')
                .between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey])
                .delete(),
        ];

        if (includeAudit) {
            deleteTasks.push(db.audit.where('chatKey').equals(chatKey).delete());
        }

        await Promise.all(deleteTasks);
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
    const chatData = await db.chat_documents.get(chatKey);
    if (chatData?.shared?.signals?.[MEMORY_OS_PLUGIN_ID]) {
        const nextSignals = { ...(chatData.shared.signals ?? {}) };
        delete nextSignals[MEMORY_OS_PLUGIN_ID];
        await db.chat_documents.update(chatKey, {
            shared: {
                ...chatData.shared,
                signals: nextSignals,
            },
        } as unknown as ChatSharedPatch);
    }
}

/**
 * 功能：导出指定聊天在 MemoryOS 全部表中的快照，供测试与诊断使用。
 * @param chatKey 聊天键。
 * @returns 当前聊天数据库快照。
 */
export async function exportMemoryChatDatabaseSnapshot(chatKey: string): Promise<MemoryChatDatabaseSnapshot> {
    const normalizedChatKey = String(chatKey ?? '').trim();
    const [
        events,
        facts,
        worldState,
        summaries,
        templates,
        audit,
        meta,
        worldinfoCache,
        templateBindings,
        memoryCards,
        memoryCardEmbeddings,
        memoryCardMeta,
        relationshipMemory,
        memoryRecallLog,
        memoryMutationHistory,
        pluginState,
        pluginRecords,
    ] = await Promise.all([
        db.events.where('chatKey').equals(normalizedChatKey).toArray(),
        db.facts.where('chatKey').equals(normalizedChatKey).toArray(),
        db.world_state.where('chatKey').equals(normalizedChatKey).toArray(),
        db.summaries.where('chatKey').equals(normalizedChatKey).toArray(),
        db.templates.where('chatKey').equals(normalizedChatKey).toArray(),
        db.audit.where('chatKey').equals(normalizedChatKey).toArray(),
        db.meta.get(normalizedChatKey),
        db.worldinfo_cache.where('chatKey').equals(normalizedChatKey).toArray(),
        db.template_bindings.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_cards.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_card_embeddings.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_card_meta.where('chatKey').equals(normalizedChatKey).toArray(),
        db.relationship_memory.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_recall_log.where('chatKey').equals(normalizedChatKey).toArray(),
        db.memory_mutation_history.where('chatKey').equals(normalizedChatKey).toArray(),
        db.chat_plugin_state.get([MEMORY_OS_PLUGIN_ID, normalizedChatKey]),
        db.chat_plugin_records
            .where('pluginId')
            .equals(MEMORY_OS_PLUGIN_ID)
            .and((row: DBChatPluginRecord): boolean => String(row.chatKey ?? '').trim() === normalizedChatKey)
            .toArray(),
    ]);

    return {
        chatKey: normalizedChatKey,
        generatedAt: Date.now(),
        events,
        facts,
        worldState,
        summaries,
        templates,
        audit,
        meta: meta ?? null,
        worldinfoCache,
        templateBindings,
        memoryCards,
        memoryCardEmbeddings,
        memoryCardMeta,
        relationshipMemory,
        memoryRecallLog,
        memoryMutationHistory,
        pluginState: pluginState ?? null,
        pluginRecords,
    };
}

/**
 * 功能：导出完整提示词测试包，便于在 memory:test 页面复现当前聊天。
 * @param chatKey 聊天键。
 * @param options 导出附加信息（prompt、设置、期望）。
 * @returns 可导入的测试包 JSON 对象。
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
        runResult?: Record<string, unknown>;
    } = {},
): Promise<MemoryPromptTestBundle> {
    const normalizedChatKey = String(chatKey ?? '').trim();
    const database = await exportMemoryChatDatabaseSnapshot(normalizedChatKey);
    const hasOverridePromptFixture = Array.isArray(options.promptFixture);
    const snapshot = options.captureSnapshot;
    const snapshotPromptFixture = Array.isArray(snapshot?.promptFixture) ? snapshot!.promptFixture : [];
    const resolvedPromptFixture = hasOverridePromptFixture
        ? (options.promptFixture as Array<Record<string, unknown>>)
        : snapshotPromptFixture;
    const resolvedQuery = String(
        options.query
        ?? (hasOverridePromptFixture ? '' : snapshot?.query ?? '')
        ?? '',
    ).trim();
    const resolvedSourceMessageId = String(
        options.sourceMessageId
        ?? (hasOverridePromptFixture ? '' : snapshot?.sourceMessageId ?? '')
        ?? '',
    ).trim() || undefined;
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
        runResult: options.runResult,
    };
}

/**
 * 功能：导入完整提示词测试包并写入测试 chatKey，避免污染原聊天数据。
 * @param bundle 测试包对象。
 * @param options 导入选项。
 * @returns 导入结果与实际使用的 chatKey。
 */
export async function importMemoryPromptTestBundle(
    bundle: MemoryPromptTestBundle,
    options: { targetChatKey?: string; skipClear?: boolean } = {},
): Promise<ImportMemoryPromptTestBundleResult> {
    const sourceDatabase = bundle?.database;
    const targetChatKey = String(options.targetChatKey ?? `memory_test::${Date.now()}`).trim();
    if (!sourceDatabase || !String(sourceDatabase.chatKey ?? '').trim()) {
        throw new Error('invalid_bundle_database');
    }

    const mapChatKey = <T extends Record<string, unknown>>(row: T): T => {
        if (row && typeof row === 'object') {
            return {
                ...row,
                chatKey: targetChatKey,
            } as T;
        }
        return ({
            chatKey: targetChatKey,
            value: row,
        } as unknown) as T;
    };

    if (options.skipClear !== true) {
        await clearMemoryChatData(targetChatKey, { includeAudit: true });
    }

    const normalizedEvents = normalizeEventRows(sourceDatabase.events ?? [], targetChatKey);
    const normalizedFacts = normalizeFactRows(sourceDatabase.facts ?? [], targetChatKey);
    const normalizedWorldState = normalizeWorldStateRows(sourceDatabase.worldState ?? [], targetChatKey);
    const normalizedSummaries = normalizeSummaryRows(sourceDatabase.summaries ?? [], targetChatKey);
    const normalizedPluginState = sourceDatabase.pluginState
        ? {
            ...(sourceDatabase.pluginState as Record<string, unknown>),
            pluginId: MEMORY_OS_PLUGIN_ID,
            chatKey: targetChatKey,
            updatedAt: toSafeNumber((sourceDatabase.pluginState as Record<string, unknown>).updatedAt, Date.now()),
        } as DBChatPluginState
        : null;
    const normalizedPluginRecords = (sourceDatabase.pluginRecords ?? [])
        .filter((row: unknown): boolean => Boolean(row) && typeof row === 'object')
        .map((row: unknown): DBChatPluginRecord => {
            const record = row as Record<string, unknown>;
            return {
                ...(record as DBChatPluginRecord),
                id: undefined,
                pluginId: MEMORY_OS_PLUGIN_ID,
                chatKey: targetChatKey,
                collection: toSafeString(record.collection, 'imported'),
                recordId: toSafeString(record.recordId, `record::${crypto.randomUUID()}`),
                ts: toSafeNumber(record.ts, Date.now()),
                updatedAt: toSafeNumber(record.updatedAt, Date.now()),
                payload: (record.payload && typeof record.payload === 'object')
                    ? (record.payload as Record<string, unknown>)
                    : {},
            };
        });

    await db.transaction('rw', [
        db.events,
        db.facts,
        db.world_state,
        db.summaries,
        db.templates,
        db.audit,
        db.meta,
        db.worldinfo_cache,
        db.template_bindings,
        db.memory_cards,
        db.memory_card_embeddings,
        db.memory_card_meta,
        db.relationship_memory,
        db.memory_recall_log,
        db.memory_mutation_history,
    ], async (): Promise<void> => {
        await Promise.all([
            db.events.bulkPut(normalizedEvents),
            db.facts.bulkPut(normalizedFacts),
            db.world_state.bulkPut(normalizedWorldState),
            db.summaries.bulkPut(normalizedSummaries),
            db.templates.bulkPut((sourceDatabase.templates ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBTemplate)),
            db.audit.bulkPut((sourceDatabase.audit ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBAudit)),
            sourceDatabase.meta
                ? db.meta.put({
                    ...(sourceDatabase.meta as Record<string, unknown>),
                    chatKey: targetChatKey,
                } as DBMeta)
                : Promise.resolve(),
            db.worldinfo_cache.bulkPut((sourceDatabase.worldinfoCache ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBWorldInfoCache)),
            db.template_bindings.bulkPut((sourceDatabase.templateBindings ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBTemplateBinding)),
            db.memory_cards.bulkPut((sourceDatabase.memoryCards ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBMemoryCard)),
            db.memory_card_embeddings.bulkPut((sourceDatabase.memoryCardEmbeddings ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBMemoryCardEmbedding)),
            db.memory_card_meta.bulkPut((sourceDatabase.memoryCardMeta ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBMemoryCardMeta)),
            db.relationship_memory.bulkPut((sourceDatabase.relationshipMemory ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBRelationshipMemory)),
            db.memory_recall_log.bulkPut((sourceDatabase.memoryRecallLog ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBMemoryRecallLog)),
            db.memory_mutation_history.bulkPut((sourceDatabase.memoryMutationHistory ?? []).map((row) => mapChatKey(row as unknown as Record<string, unknown>) as DBMemoryMutationHistory)),
        ]);
    });

    if (normalizedPluginState) {
        await db.chat_plugin_state.put(normalizedPluginState);
    }
    if (normalizedPluginRecords.length > 0) {
        await db.chat_plugin_records.bulkPut(normalizedPluginRecords);
    }

    return {
        chatKey: targetChatKey,
        importedAt: Date.now(),
        bundle: {
            ...bundle,
            database: {
                ...sourceDatabase,
                chatKey: targetChatKey,
            },
        },
    };
}

/**
 * 功能：清空整个 MemoryOS 数据分区，用于彻底重置或重建。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   Promise<void>：清理完成后结束。
 */
export async function clearAllMemoryData(): Promise<void> {
    await db.transaction(
        'rw',
        [
            db.events,
            db.facts,
            db.world_state,
            db.summaries,
            db.templates,
            db.audit,
            db.meta,
            db.worldinfo_cache,
            db.template_bindings,
            db.memory_cards,
            db.memory_card_embeddings,
            db.memory_card_meta,
            db.relationship_memory,
            db.memory_recall_log,
            db.memory_mutation_history,
            db.chat_plugin_state,
            db.chat_plugin_records,
        ],
        async (): Promise<void> => {
            await Promise.all([
                db.events.clear(),
                db.facts.clear(),
                db.world_state.clear(),
                db.summaries.clear(),
                db.templates.clear(),
                db.audit.clear(),
                db.meta.clear(),
                db.worldinfo_cache.clear(),
                db.template_bindings.clear(),
                db.memory_cards.clear(),
                db.memory_card_embeddings.clear(),
                db.memory_card_meta.clear(),
                db.relationship_memory.clear(),
                db.memory_recall_log.clear(),
                db.memory_mutation_history.clear(),
                db.chat_plugin_state.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
                db.chat_plugin_records.where('pluginId').equals(MEMORY_OS_PLUGIN_ID).delete(),
            ]);
        },
    );
}
