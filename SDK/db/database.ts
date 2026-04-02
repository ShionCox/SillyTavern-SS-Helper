import Dexie, { type Table } from 'dexie';
import type { SdkTavernChatRefEvent } from '../tavern/types';

export interface DBChatDocumentShared {
    labels: string[];
    flags: Record<string, boolean>;
    notes: string;
    signals: Record<string, Record<string, unknown>>;
}

export interface DBChatDocument {
    chatKey: string;
    entityKey: string;
    ref: SdkTavernChatRefEvent;
    meta: Record<string, unknown>;
    shared: DBChatDocumentShared;
    updatedAt: number;
}

export interface DBChatPluginState {
    pluginId: string;
    chatKey: string;
    schemaVersion: number;
    state: Record<string, unknown>;
    summary: Record<string, unknown>;
    updatedAt: number;
}

export interface DBChatPluginRecord {
    id?: number;
    pluginId: string;
    chatKey: string;
    collection: string;
    recordId: string;
    payload: Record<string, unknown>;
    ts: number;
    updatedAt: number;
}

export interface DBEvent {
    eventId: string;
    chatKey: string;
    ts: number;
    type: string;
    source?: {
        pluginId?: string;
        version?: string;
    };
    payload: unknown;
    refs?: {
        messageId?: string;
    };
}

export interface DBTemplate {
    templateId: string;
    chatKey: string;
    name: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

export interface DBTemplateBinding {
    bindingId: string;
    chatKey: string;
    roleKey: string;
    templateId: string;
    updatedAt: number;
}

export interface DBAudit {
    auditId: string;
    chatKey: string;
    action: string;
    payload: Record<string, unknown>;
    ts: number;
}

export interface DBMeta {
    chatKey: string;
    updatedAt: number;
    payload: Record<string, unknown>;
}

export interface DBMemoryMutationHistory {
    historyId: string;
    chatKey: string;
    action: string;
    payload: Record<string, unknown>;
    ts: number;
}

export interface DBMemoryEntryFieldDiff {
    path: string;
    label: string;
    before: unknown;
    after: unknown;
}

export interface DBMemoryEntryAuditRecord {
    auditId: string;
    chatKey: string;
    summaryId?: string;
    entryId: string;
    entryTitle: string;
    entryType: string;
    actionType: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    sourceLabel?: string;
    beforeEntry: Record<string, unknown> | null;
    afterEntry: Record<string, unknown> | null;
    changedFields: DBMemoryEntryFieldDiff[];
    reasonCodes: string[];
    ts: number;
}

export interface DBVectorChunkMetadata {
    chunkId: string;
    sourceType: string;
    sourceId: string;
    checksum?: string;
    dims?: number;
    updatedAt: number;
}

export interface DBMemoryEntryTypeField {
    key: string;
    label: string;
    kind: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'tags' | 'enum' | 'json';
    placeholder?: string;
    required?: boolean;
}

export interface DBMemoryEntryType {
    typeId: string;
    chatKey: string;
    key: string;
    label: string;
    category: string;
    description: string;
    fields: DBMemoryEntryTypeField[];
    injectToSystem: boolean;
    bindableToRole: boolean;
    builtIn: boolean;
    icon?: string;
    accentColor?: string;
    createdAt: number;
    updatedAt: number;
}

export interface DBMemoryEntry {
    entryId: string;
    chatKey: string;
    title: string;
    entryType: string;
    category: string;
    tags: string[];
    summary: string;
    detail: string;
    detailSchemaVersion: number;
    detailPayload: Record<string, unknown>;
    sourceSummaryIds: string[];
    /** 时间上下文 */
    timeContext?: Record<string, unknown>;
    /** 稳定事实类：首次观测时间 */
    firstObservedAt?: Record<string, unknown>;
    /** 稳定事实类：最后观测时间 */
    lastObservedAt?: Record<string, unknown>;
    /** 区间类：生效起始时间 */
    validFrom?: Record<string, unknown>;
    /** 区间类：生效结束时间 */
    validTo?: Record<string, unknown>;
    /** 区间类：是否仍在持续 */
    ongoing?: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface DBActorMemoryProfile {
    actorKey: string;
    chatKey: string;
    displayName: string;
    memoryStat: number;
    createdAt: number;
    updatedAt: number;
}

export interface DBRoleEntryMemory {
    roleMemoryId: string;
    chatKey: string;
    actorKey: string;
    entryId: string;
    memoryPercent: number;
    lastRefreshSummaryId?: string;
    lastDecaySummaryId?: string;
    lastMentionSummaryId?: string;
    forgotten: boolean;
    forgottenAt?: number;
    updatedAt: number;
}

export interface DBMemoryRelationship {
    relationshipId: string;
    chatKey: string;
    sourceActorKey: string;
    targetActorKey: string;
    relationTag: string;
    state: string;
    summary: string;
    trust: number;
    affection: number;
    tension: number;
    participants: string[];
    createdAt: number;
    updatedAt: number;
}

export interface DBSummarySnapshot {
    summaryId: string;
    chatKey: string;
    title: string;
    content: string;
    normalizedSummary?: {
        stableContext: string;
        taskState: string[];
        relationState: string[];
        unresolvedQuestions: string[];
    };
    actorKeys: string[];
    entryUpserts: Record<string, unknown>[];
    refreshBindings: Record<string, unknown>[];
    createdAt: number;
    updatedAt: number;
}

export interface DBWorldProfileBinding {
    chatKey: string;
    primaryProfile: string;
    secondaryProfiles: string[];
    confidence: number;
    reasonCodes: string[];
    detectedFrom: string[];
    sourceHash: string;
    createdAt: number;
    updatedAt: number;
}

export interface DBLlmCredential {
    providerId: string;
    apiKeyMasked?: string;
    updatedAt: number;
    payload: Record<string, unknown>;
}

export interface DBLlmRequestLog {
    logId: string;
    llmTaskId: string;
    requestId: string;
    sourcePluginId: string;
    consumer: string;
    taskKey: string;
    taskKind: string;
    state: string;
    taskDescription?: string;
    attemptIndex: number;
    attemptTag: string;
    attemptOutcome: string;
    isFinalAttempt: boolean;
    chatKey?: string;
    sessionId?: string;
    reasonCode?: string;
    sortTs: number;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    payload: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}

export class SSHelperDatabase extends Dexie {
    chat_documents!: Table<DBChatDocument, string>;
    chat_plugin_state!: Table<DBChatPluginState, [string, string]>;
    chat_plugin_records!: Table<DBChatPluginRecord, number>;

    events!: Table<DBEvent, string>;
    templates!: Table<DBTemplate, string>;
    audit!: Table<DBAudit, string>;
    meta!: Table<DBMeta, string>;
    memory_mutation_history!: Table<DBMemoryMutationHistory, string>;
    memory_entry_audit_records!: Table<DBMemoryEntryAuditRecord, string>;

    memory_entries!: Table<DBMemoryEntry, string>;
    memory_entry_types!: Table<DBMemoryEntryType, string>;
    actor_memory_profiles!: Table<DBActorMemoryProfile, [string, string]>;
    role_entry_memory!: Table<DBRoleEntryMemory, string>;
    memory_relationships!: Table<DBMemoryRelationship, string>;
    summary_snapshots!: Table<DBSummarySnapshot, string>;
    world_profile_bindings!: Table<DBWorldProfileBinding, string>;

    llm_credentials!: Table<DBLlmCredential, string>;
    llm_request_logs!: Table<DBLlmRequestLog, string>;

    constructor() {
        super('SSHelperDatabase');
        this.version(1).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '&[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, pluginId, chatKey, collection, recordId, ts, updatedAt, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts]',
            events: '&eventId, chatKey, ts, type, [chatKey+ts], [chatKey+type+ts]',
            templates: '&templateId, chatKey, [chatKey+createdAt], updatedAt',
            audit: '&auditId, chatKey, ts',
            meta: '&chatKey, updatedAt',
            memory_mutation_history: '&historyId, chatKey, [chatKey+ts], ts',
            memory_entry_audit_records: '&auditId, chatKey, entryId, summaryId, actionType, [chatKey+ts], [chatKey+entryId], ts',
            memory_entries: '&entryId, chatKey, [chatKey+entryType], [chatKey+category], [chatKey+updatedAt], updatedAt',
            memory_entry_types: '&typeId, chatKey, [chatKey+key], [chatKey+updatedAt]',
            actor_memory_profiles: '&actorKey, chatKey, [chatKey+actorKey], [chatKey+updatedAt]',
            role_entry_memory: '&roleMemoryId, chatKey, [chatKey+actorKey], [chatKey+entryId], [chatKey+actorKey+entryId], [chatKey+updatedAt]',
            summary_snapshots: '&summaryId, chatKey, [chatKey+updatedAt]',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, sortTs, state, [sourcePluginId+sortTs], [state+sortTs], updatedAt',
        });
        this.version(2).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '&[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, pluginId, chatKey, collection, recordId, ts, updatedAt, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts]',
            events: '&eventId, chatKey, ts, type, [chatKey+ts], [chatKey+type+ts]',
            templates: '&templateId, chatKey, [chatKey+createdAt], updatedAt',
            audit: '&auditId, chatKey, ts',
            meta: '&chatKey, updatedAt',
            memory_mutation_history: '&historyId, chatKey, [chatKey+ts], ts',
            memory_entry_audit_records: '&auditId, chatKey, entryId, summaryId, actionType, [chatKey+ts], [chatKey+entryId], ts',
            memory_entries: '&entryId, chatKey, [chatKey+entryType], [chatKey+category], [chatKey+updatedAt], updatedAt',
            memory_entry_types: '&typeId, chatKey, [chatKey+key], [chatKey+updatedAt]',
            actor_memory_profiles: '&actorKey, chatKey, [chatKey+actorKey], [chatKey+updatedAt]',
            role_entry_memory: '&roleMemoryId, chatKey, [chatKey+actorKey], [chatKey+entryId], [chatKey+actorKey+entryId], [chatKey+updatedAt]',
            summary_snapshots: '&summaryId, chatKey, [chatKey+updatedAt]',
            world_profile_bindings: '&chatKey, primaryProfile, updatedAt',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, sortTs, state, [sourcePluginId+sortTs], [state+sortTs], updatedAt',
        });
        this.version(3).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '&[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, pluginId, chatKey, collection, recordId, ts, updatedAt, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts]',
            events: '&eventId, chatKey, ts, type, [chatKey+ts], [chatKey+type+ts]',
            templates: '&templateId, chatKey, [chatKey+createdAt], updatedAt',
            audit: '&auditId, chatKey, ts',
            meta: '&chatKey, updatedAt',
            memory_mutation_history: '&historyId, chatKey, [chatKey+ts], ts',
            memory_entry_audit_records: '&auditId, chatKey, entryId, summaryId, actionType, [chatKey+ts], [chatKey+entryId], ts',
            memory_entries: '&entryId, chatKey, [chatKey+entryType], [chatKey+category], [chatKey+updatedAt], updatedAt',
            memory_entry_types: '&typeId, chatKey, [chatKey+key], [chatKey+updatedAt]',
            actor_memory_profiles: '&actorKey, chatKey, [chatKey+actorKey], [chatKey+updatedAt]',
            role_entry_memory: '&roleMemoryId, chatKey, [chatKey+actorKey], [chatKey+entryId], [chatKey+actorKey+entryId], [chatKey+updatedAt]',
            summary_snapshots: '&summaryId, chatKey, [chatKey+updatedAt]',
            world_profile_bindings: '&chatKey, primaryProfile, updatedAt',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, sortTs, state, [sourcePluginId+sortTs], [state+sortTs], updatedAt',
        });
        this.version(4).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '&[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, pluginId, chatKey, collection, recordId, ts, updatedAt, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts]',
            events: '&eventId, chatKey, ts, type, [chatKey+ts], [chatKey+type+ts]',
            templates: '&templateId, chatKey, [chatKey+createdAt], updatedAt',
            audit: '&auditId, chatKey, ts',
            meta: '&chatKey, updatedAt',
            memory_mutation_history: '&historyId, chatKey, [chatKey+ts], ts',
            memory_entry_audit_records: '&auditId, chatKey, entryId, summaryId, actionType, [chatKey+ts], [chatKey+entryId], ts',
            memory_entries: '&entryId, chatKey, [chatKey+entryType], [chatKey+category], [chatKey+updatedAt], updatedAt',
            memory_entry_types: '&typeId, chatKey, [chatKey+key], [chatKey+updatedAt]',
            actor_memory_profiles: '&[chatKey+actorKey], chatKey, actorKey, [chatKey+updatedAt]',
            role_entry_memory: '&roleMemoryId, chatKey, [chatKey+actorKey], [chatKey+entryId], [chatKey+actorKey+entryId], [chatKey+updatedAt]',
            memory_relationships: '&relationshipId, chatKey, [chatKey+sourceActorKey], [chatKey+targetActorKey], [chatKey+sourceActorKey+targetActorKey], [chatKey+updatedAt], updatedAt',
            summary_snapshots: '&summaryId, chatKey, [chatKey+updatedAt]',
            world_profile_bindings: '&chatKey, primaryProfile, updatedAt',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, sortTs, state, [sourcePluginId+sortTs], [state+sortTs], updatedAt',
        });
    }
}

export const db = new SSHelperDatabase();

/**
 * 功能：删除并重建 SS-Helper 本地数据库。
 * @returns 异步完成。
 */
export async function rebuildSSHelperDatabase(): Promise<void> {
    db.close();
    await Dexie.delete(db.name);
}
