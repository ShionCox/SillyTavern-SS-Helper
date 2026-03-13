import Dexie from 'dexie';
import { db } from './database';
import type {
    DBChatDocument,
    DBChatDocumentShared,
    DBChatPluginState,
    DBChatPluginRecord,
} from './database';
import type { SdkTavernChatRefEvent } from '../tavern/types';
import { broadcast } from '../bus/broadcast';
import { Logger } from '../logger';

const logger = new Logger('SDK-ChatData');

const SDK_NAMESPACE = 'stx_sdk';
const WRITE_DEBOUNCE_MS = 180;

// ─── 内存缓存 ───

const documentCache = new Map<string, DBChatDocument>();
const stateCache = new Map<string, DBChatPluginState>(); // key = `${pluginId}::${chatKey}`
const pendingStateWrites = new Map<string, DBChatPluginState>();
const pendingDocWrites = new Map<string, DBChatDocument>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function stateCacheKey(pluginId: string, chatKey: string): string {
    return `${pluginId}::${chatKey}`;
}

// ─── 去抖刷盘 ───

function scheduleFlush(): void {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushPending, WRITE_DEBOUNCE_MS);
}

async function flushPending(): Promise<void> {
    flushTimer = null;

    const docs = Array.from(pendingDocWrites.values());
    const states = Array.from(pendingStateWrites.values());
    pendingDocWrites.clear();
    pendingStateWrites.clear();

    if (docs.length === 0 && states.length === 0) return;

    try {
        await db.transaction('rw', [db.chat_documents, db.chat_plugin_state], async () => {
            for (const doc of docs) {
                await db.chat_documents.put(doc);
            }
            for (const state of states) {
                await db.chat_plugin_state.put(state);
            }
        });
    } catch (err) {
        logger.error('flushPending 写入失败:', err);
    }
}

/** 立即刷盘（用于页面关闭前保存） */
export async function flushSdkChatDataNow(): Promise<void> {
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    await flushPending();
}

function notifyChange(table: string, pluginId: string, chatKey: string): void {
    try {
        broadcast('sdk:chat_data:changed', { table, pluginId, chatKey }, SDK_NAMESPACE);
    } catch {
        // ignore broadcast failures
    }
}

// ─── 默认 shared 结构 ───

function defaultShared(): DBChatDocumentShared {
    return {
        labels: [],
        flags: {},
        notes: '',
        signals: {},
    };
}

function sanitizeShared(raw: unknown): DBChatDocumentShared {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultShared();
    const obj = raw as Record<string, unknown>;
    return {
        labels: Array.isArray(obj.labels) ? obj.labels.filter((l): l is string => typeof l === 'string') : [],
        flags: (obj.flags && typeof obj.flags === 'object' && !Array.isArray(obj.flags)) ? obj.flags as Record<string, boolean> : {},
        notes: typeof obj.notes === 'string' ? obj.notes : '',
        signals: (obj.signals && typeof obj.signals === 'object' && !Array.isArray(obj.signals)) ? obj.signals as Record<string, Record<string, unknown>> : {},
    };
}

// ─── chat_documents API ───

export async function getSdkChatDocument(chatKey: string): Promise<DBChatDocument | null> {
    const cached = documentCache.get(chatKey);
    if (cached) return cached;

    const row = await db.chat_documents.get(chatKey);
    if (row) {
        row.shared = sanitizeShared(row.shared);
        documentCache.set(chatKey, row);
    }
    return row ?? null;
}

export async function ensureSdkChatDocument(
    chatKey: string,
    ref: SdkTavernChatRefEvent,
    meta?: Record<string, unknown>,
): Promise<DBChatDocument> {
    const existing = await getSdkChatDocument(chatKey);
    if (existing) return existing;

    const entityKey = `${ref.tavernInstanceId}::${ref.scopeType}::${ref.scopeId}`;
    const doc: DBChatDocument = {
        chatKey,
        entityKey,
        ref,
        meta: meta ?? {},
        shared: defaultShared(),
        updatedAt: Date.now(),
    };

    await db.chat_documents.put(doc);
    documentCache.set(chatKey, doc);
    notifyChange('chat_documents', '', chatKey);
    return doc;
}

export type ChatSharedPatch = {
    labels?: string[];
    flags?: Record<string, boolean>;
    notes?: string;
    signals?: Record<string, Record<string, unknown>>;
};

export async function patchSdkChatShared(chatKey: string, patch: ChatSharedPatch): Promise<void> {
    const doc = await getSdkChatDocument(chatKey);
    if (!doc) return;

    const shared = { ...doc.shared };
    if (patch.labels !== undefined) shared.labels = patch.labels;
    if (patch.flags !== undefined) shared.flags = { ...shared.flags, ...patch.flags };
    if (patch.notes !== undefined) shared.notes = patch.notes;
    if (patch.signals !== undefined) {
        shared.signals = { ...shared.signals };
        for (const [pluginId, signal] of Object.entries(patch.signals)) {
            shared.signals[pluginId] = { ...(shared.signals[pluginId] ?? {}), ...signal };
        }
    }

    const updated: DBChatDocument = { ...doc, shared, updatedAt: Date.now() };
    documentCache.set(chatKey, updated);
    pendingDocWrites.set(chatKey, updated);
    scheduleFlush();
    notifyChange('chat_documents', '', chatKey);
}

// ─── chat_plugin_state API ───

export interface WriteSdkPluginChatStateOptions {
    schemaVersion?: number;
    summary?: Record<string, unknown>;
}

export async function readSdkPluginChatState(
    pluginId: string,
    chatKey: string,
): Promise<DBChatPluginState | null> {
    const ck = stateCacheKey(pluginId, chatKey);
    const cached = stateCache.get(ck);
    if (cached) return cached;

    const row = await db.chat_plugin_state.get([pluginId, chatKey]);
    if (row) {
        stateCache.set(ck, row);
    }
    return row ?? null;
}

export async function writeSdkPluginChatState(
    pluginId: string,
    chatKey: string,
    state: Record<string, unknown>,
    opts?: WriteSdkPluginChatStateOptions,
): Promise<void> {
    const ck = stateCacheKey(pluginId, chatKey);
    const existing = await readSdkPluginChatState(pluginId, chatKey);
    const now = Date.now();

    const record: DBChatPluginState = {
        pluginId,
        chatKey,
        schemaVersion: opts?.schemaVersion ?? existing?.schemaVersion ?? 1,
        state: { ...(existing?.state ?? {}), ...state },
        summary: opts?.summary ?? existing?.summary ?? {},
        updatedAt: now,
    };

    stateCache.set(ck, record);
    pendingStateWrites.set(ck, record);
    scheduleFlush();
    notifyChange('chat_plugin_state', pluginId, chatKey);
}

export async function deleteSdkPluginChatState(
    pluginId: string,
    chatKey: string,
): Promise<boolean> {
    const ck = stateCacheKey(pluginId, chatKey);
    stateCache.delete(ck);
    pendingStateWrites.delete(ck);

    try {
        await db.chat_plugin_state.delete([pluginId, chatKey]);
        notifyChange('chat_plugin_state', pluginId, chatKey);
        return true;
    } catch {
        return false;
    }
}

export interface ListSdkPluginChatStateSummariesOptions {
    chatKeyPrefix?: string;
    limit?: number;
}

export interface SdkPluginChatStateSummaryRow {
    pluginId: string;
    chatKey: string;
    summary: Record<string, unknown>;
    updatedAt: number;
}

export async function listSdkPluginChatStateSummaries(
    pluginId: string,
    opts?: ListSdkPluginChatStateSummariesOptions,
): Promise<SdkPluginChatStateSummaryRow[]> {
    let query = db.chat_plugin_state
        .where('pluginId')
        .equals(pluginId);

    const rows = await query.toArray();

    let filtered = rows;
    if (opts?.chatKeyPrefix) {
        const prefix = opts.chatKeyPrefix;
        filtered = rows.filter((r) => r.chatKey.startsWith(prefix));
    }

    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    if (opts?.limit && opts.limit > 0) {
        filtered = filtered.slice(0, opts.limit);
    }

    return filtered.map((r) => ({
        pluginId: r.pluginId,
        chatKey: r.chatKey,
        summary: r.summary,
        updatedAt: r.updatedAt,
    }));
}

// ─── chat_plugin_records API ───

export interface AppendSdkPluginChatRecordPayload {
    recordId: string;
    payload: Record<string, unknown>;
    ts?: number;
}

export async function appendSdkPluginChatRecord(
    pluginId: string,
    chatKey: string,
    collection: string,
    record: AppendSdkPluginChatRecordPayload,
): Promise<void> {
    const now = Date.now();
    const row: DBChatPluginRecord = {
        pluginId,
        chatKey,
        collection,
        recordId: record.recordId,
        payload: record.payload,
        ts: record.ts ?? now,
        updatedAt: now,
    };

    await db.chat_plugin_records.add(row);
    notifyChange('chat_plugin_records', pluginId, chatKey);
}

export interface QuerySdkPluginChatRecordsOptions {
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
    fromTs?: number;
    toTs?: number;
}

export async function querySdkPluginChatRecords(
    pluginId: string,
    chatKey: string,
    collection: string,
    opts?: QuerySdkPluginChatRecordsOptions,
): Promise<DBChatPluginRecord[]> {
    const order = opts?.order ?? 'desc';
    const fromTs = opts?.fromTs ?? 0;
    const toTs = opts?.toTs ?? Infinity;

    let results = await db.chat_plugin_records
        .where('[pluginId+chatKey+collection+ts]')
        .between(
            [pluginId, chatKey, collection, fromTs],
            [pluginId, chatKey, collection, toTs],
            true,
            true,
        )
        .toArray();

    if (order === 'desc') {
        results.sort((a, b) => b.ts - a.ts);
    } else {
        results.sort((a, b) => a.ts - b.ts);
    }

    if (opts?.offset && opts.offset > 0) {
        results = results.slice(opts.offset);
    }
    if (opts?.limit && opts.limit > 0) {
        results = results.slice(0, opts.limit);
    }

    return results;
}

/** 清除特定 chatKey 的所有 records（用于清理） */
export async function deleteSdkPluginChatRecords(
    pluginId: string,
    chatKey: string,
    collection?: string,
): Promise<number> {
    if (collection) {
        return db.chat_plugin_records
            .where('[pluginId+chatKey+collection]')
            .equals([pluginId, chatKey, collection])
            .delete();
    }
    // 删除该 pluginId + chatKey 下所有 collection
    const all = await db.chat_plugin_records
        .where('[pluginId+chatKey+collection]')
        .between(
            [pluginId, chatKey, Dexie.minKey],
            [pluginId, chatKey, Dexie.maxKey],
        )
        .toArray();
    const ids = all.map((r) => r.id).filter((id): id is number => id !== undefined);
    await db.chat_plugin_records.bulkDelete(ids);
    return ids.length;
}

// ─── 缓存失效 ───

/** 清除指定 chatKey 的所有内存缓存（用于聊天切换时） */
export function invalidateSdkChatDataCache(chatKey?: string): void {
    if (!chatKey) {
        documentCache.clear();
        stateCache.clear();
        return;
    }
    documentCache.delete(chatKey);
    for (const key of stateCache.keys()) {
        if (key.endsWith(`::${chatKey}`)) {
            stateCache.delete(key);
        }
    }
}
