import Dexie, { type Table } from 'dexie';
import type { SdkTavernChatRefEvent } from '../tavern/types';

// ─── 公共表：聊天主文档 ───

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

// ─── 公共表：插件×聊天状态快照 ───

export interface DBChatPluginState {
    pluginId: string;
    chatKey: string;
    schemaVersion: number;
    state: Record<string, unknown>;
    summary: Record<string, unknown>;
    updatedAt: number;
}

// ─── 公共表：插件×聊天历史明细 ───

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

// ─── MemoryOS 专属表类型（从 MemoryOS/src/db/db.ts 迁入） ───

export interface DBEvent {
    eventId: string;
    chatKey: string;
    ts: number;
    type: string;
    source: { pluginId: string; version: string };
    payload: any;
    refs?: Record<string, any>;
    tags?: string[];
    hash?: string;
    salience?: number;
    strength?: number;
    decayStage?: 'clear' | 'blur' | 'distorted';
    rehearsalCount?: number;
    lastRecalledAt?: number;
    emotionTag?: string;
    relationScope?: string;
    ownerActorKey?: string | null;
    memoryType?: string;
    memorySubtype?: string;
    sourceScope?: string;
    importance?: number;
    forgetProbability?: number;
    forgotten?: boolean;
    forgottenAt?: number;
    forgottenReasonCodes?: string[];
    lastForgetRollAt?: number;
    reinforcedByEventIds?: string[];
    invalidatedByEventIds?: string[];
    encodeScore?: number;
    profileVersion?: string;
}

export interface DBFact {
    factKey: string;
    chatKey: string;
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
    provenance?: DBFactProvenance;
    updatedAt: number;
    salience?: number;
    strength?: number;
    decayStage?: 'clear' | 'blur' | 'distorted';
    rehearsalCount?: number;
    lastRecalledAt?: number;
    emotionTag?: string;
    relationScope?: string;
    ownerActorKey?: string | null;
    memoryType?: string;
    memorySubtype?: string;
    sourceScope?: string;
    importance?: number;
    forgetProbability?: number;
    forgotten?: boolean;
    forgottenAt?: number;
    forgottenReasonCodes?: string[];
    lastForgetRollAt?: number;
    reinforcedByEventIds?: string[];
    invalidatedByEventIds?: string[];
    encodeScore?: number;
    profileVersion?: string;
}

export interface DBWorldStateValue {
    title?: string;
    summary?: string;
    scopeType?: string;
    stateType?: string;
    subjectId?: string;
    regionId?: string;
    cityId?: string;
    locationId?: string;
    itemId?: string;
    keywords?: string[];
    tags?: string[];
    confidence?: number;
    sourceRefs?: string[];
    [key: string]: unknown;
}

export interface DBWorldState {
    stateKey: string;
    chatKey: string;
    path: string;
    value: DBWorldStateValue | Record<string, unknown> | string | number | boolean | null;
    sourceEventId?: string;
    updatedAt: number;
}

export interface DBSummary {
    summaryId: string;
    chatKey: string;
    level: 'message' | 'scene' | 'arc';
    title?: string;
    content: string;
    keywords?: string[];
    range?: { fromMessageId?: string; toMessageId?: string };
    createdAt: number;
    source?: DBSummarySource;
    salience?: number;
    strength?: number;
    decayStage?: 'clear' | 'blur' | 'distorted';
    rehearsalCount?: number;
    lastRecalledAt?: number;
    emotionTag?: string;
    relationScope?: string;
    ownerActorKey?: string | null;
    memoryType?: string;
    memorySubtype?: string;
    sourceScope?: string;
    importance?: number;
    forgetProbability?: number;
    forgotten?: boolean;
    forgottenAt?: number;
    forgottenReasonCodes?: string[];
    lastForgetRollAt?: number;
    reinforcedByEventIds?: string[];
    invalidatedByEventIds?: string[];
    encodeScore?: number;
    profileVersion?: string;
}

export interface DBTemplate {
    templateId: string;
    chatKey: string;
    worldType: 'fantasy' | 'urban' | 'custom';
    name: string;
    factTypes: any[];
    policies: any;
    layout: any;
    tables?: any[];
    fieldSynonyms?: Record<string, string[]>;
    tableSynonyms?: Record<string, string[]>;
    templateFamilyId?: string;
    revisionNo?: number;
    revisionState?: 'draft' | 'final';
    parentTemplateId?: string | null;
    schemaFingerprint?: string;
    lastTouchedAt?: number;
    finalizedAt?: number | null;
    worldInfoHash?: string;
    worldInfoRef?: { book: string; hash: string };
    createdAt: number;
}

export interface DBAudit {
    auditId: string;
    chatKey: string;
    ts: number;
    action: string;
    actor: { pluginId: string; mode: string };
    before: any;
    after: any;
    refs?: any;
}

export interface DBMemoryMutationHistory {
    mutationId: string;
    chatKey: string;
    ts: number;
    source: string;
    consumerPluginId: string;
    targetKind: 'fact' | 'summary' | 'state';
    action: 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE';
    title: string;
    compareKey: string;
    targetRecordKey?: string;
    existingRecordKeys: string[];
    reasonCodes: string[];
    before: any;
    after: any;
    visibleMessageIds: string[];
    derivation?: DBDerivationSource;
}

export interface DBMeta {
    chatKey: string;
    schemaVersion: number;
    lastCompactionTs?: number;
    activeTemplateId?: string;
    lastExtractTs?: number;
    lastExtractEventCount?: number;
    lastExtractUserMsgCount?: number;
    lastExtractWindowHash?: string;
    /** 最近一次提取时的助手楼层计数 */
    lastExtractAssistantTurnCount?: number;
    /** 最近一次刷新聊天画像时的助手楼层计数 */
    lastProfileRefreshAssistantTurnCount?: number;
    /** 最近一次重算记忆质量时的助手楼层计数 */
    lastQualityRefreshAssistantTurnCount?: number;
    lastCommittedTurnCursor?: string;
    lastVisibleTurnSnapshotHash?: string;
    personaProfileVersion?: string;
    lastRecallLoggedAt?: number;
}

export interface DBWorldInfoCache {
    cacheKey: string;
    chatKey: string;
    bookName: string;
    hash: string;
    parsedContent: any;
    updatedAt: number;
}

export interface DBTemplateBinding {
    bindingKey: string;
    chatKey: string;
    activeTemplateId: string;
    worldInfoHash: string;
    isLocked?: boolean;
    boundAt: number;
}

export interface DBDerivationSource {
    kind?: string;
    reason?: string;
    viewHash?: string;
    snapshotHash?: string;
    messageIds?: string[];
    anchorMessageId?: string;
    mutationKinds?: string[];
    repairGeneration?: number;
    ts?: number;
}

export interface DBFactProvenance {
    extractor?: string;
    provider?: string;
    pluginId?: string;
    fingerprint?: string;
    source?: DBDerivationSource;
    [key: string]: unknown;
}

export interface DBSummarySource {
    extractor?: string;
    provider?: string;
    provenance?: DBFactProvenance;
    [key: string]: unknown;
}

export interface DBVectorChunkMetadata {
    index?: number;
    source?: DBDerivationSource;
    sourceRecordKey?: string;
    sourceRecordKind?: string;
    ownerActorKey?: string | null;
    sourceScope?: string;
    memoryType?: string;
    memorySubtype?: string;
    participantActorKeys?: string[];
    [key: string]: unknown;
}

export interface DBMemoryCard {
    cardId: string;
    chatKey: string;
    scope: 'chat' | 'character' | 'world';
    lane: 'identity' | 'style' | 'relationship' | 'rule' | 'event' | 'state' | 'other';
    subject: string;
    title: string;
    memoryText: string;
    evidenceText?: string | null;
    entityKeys: string[];
    keywords: string[];
    importance: number;
    confidence: number;
    ttl: 'short' | 'medium' | 'long';
    replaceKey?: string | null;
    sourceRefs: string[];
    sourceRecordKey: string | null;
    sourceRecordKind: 'fact' | 'summary' | 'state' | 'event' | 'relationship' | 'unknown';
    ownerActorKey?: string | null;
    participantActorKeys: string[];
    validFrom?: number;
    validTo?: number;
    status: 'active' | 'superseded' | 'invalidated';
    createdAt: number;
    updatedAt: number;
}

export interface DBMemoryCardEmbedding {
    embeddingId: string;
    cardId: string;
    chatKey: string;
    vector: number[];
    model: string;
    createdAt: number;
}

export interface DBMemoryCardMeta {
    metaKey: string;
    chatKey: string;
    updatedAt: number;
    activeCardCount: number;
    activeEmbeddingCount: number;
    lastIndexedAt: number;
}

export interface DBRelationshipMemory {
    relationshipKey: string;
    chatKey: string;
    actorKey: string;
    targetKey: string;
    scope?: 'self_target' | 'group_pair';
    participantKeys?: string[];
    familiarity: number;
    trust: number;
    affection: number;
    tension: number;
    dependency: number;
    respect: number;
    unresolvedConflict: number;
    sharedFragments?: string[];
    summary: string;
    reasonCodes?: string[];
    updatedAt: number;
}

export interface DBMemoryRecallLog {
    recallId: string;
    chatKey: string;
    query: string;
    section: string;
    recordKey: string;
    recordKind: 'fact' | 'summary' | 'state' | 'relationship';
    recordTitle: string;
    score: number;
    selected: boolean;
    conflictSuppressed: boolean;
    tone: string;
    reasonCodes?: string[];
    ts: number;
    updatedAt: number;
}

// ─── LLMHub 凭据表 ───

export interface DBLlmCredential {
    providerId: string;
    key: string;
    createdAt: number;
    updatedAt: number;
}

export interface DBLlmRequestLog {
    logId: string;
    requestId: string;
    sourcePluginId: string;
    consumer: string;
    taskId: string;
    taskKind: string;
    state: string;
    taskDescription?: string;
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

// ─── 统一数据库定义 ───

/**
 * SS-Helper 统一聊天数据库
 *
 * 所有插件的聊天级数据统一存储在 `ss-helper-db` 中。
 * - 公共三张表: chat_documents / chat_plugin_state / chat_plugin_records
 * - MemoryOS 专属高索引表: events / facts / world_state / summaries / templates / audit / memory_mutation_history / meta / worldinfo_cache / template_bindings / memory_cards / memory_card_embeddings / memory_card_meta
 * - LLMHub 凭据表: llm_credentials
 *
 * 全新数据库，版本从 v1 开始一次性定义所有表。
 */
export class SSHelperDatabase extends Dexie {
    // 公共表
    chat_documents!: Table<DBChatDocument, string>;
    chat_plugin_state!: Table<DBChatPluginState, [string, string]>;
    chat_plugin_records!: Table<DBChatPluginRecord, number>;

    // MemoryOS 专属表
    events!: Table<DBEvent, string>;
    facts!: Table<DBFact, string>;
    world_state!: Table<DBWorldState, string>;
    summaries!: Table<DBSummary, string>;
    templates!: Table<DBTemplate, string>;
    audit!: Table<DBAudit, string>;
    memory_mutation_history!: Table<DBMemoryMutationHistory, string>;
    meta!: Table<DBMeta, string>;
    worldinfo_cache!: Table<DBWorldInfoCache, string>;
    template_bindings!: Table<DBTemplateBinding, string>;
    memory_cards!: Table<DBMemoryCard, string>;
    memory_card_embeddings!: Table<DBMemoryCardEmbedding, string>;
    memory_card_meta!: Table<DBMemoryCardMeta, string>;
    relationship_memory!: Table<DBRelationshipMemory, string>;
    memory_recall_log!: Table<DBMemoryRecallLog, string>;

    // LLMHub 凭据表
    llm_credentials!: Table<DBLlmCredential, string>;
    llm_request_logs!: Table<DBLlmRequestLog, string>;

    constructor() {
        super('ss-helper-db');

        this.version(1).stores({
            // ── 公共三张表 ──
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',

            // ── MemoryOS 专属表（索引与旧 stx_memory_os 完全一致） ──
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            memory_mutation_history: '&mutationId, [chatKey+ts], [chatKey+targetRecordKey+ts], [chatKey+targetKind+ts], [chatKey+action+ts], chatKey, targetRecordKey, targetKind, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',

            // ── LLMHub 凭据表 ──
            llm_credentials: '&providerId, updatedAt',
        });

        this.version(3).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            memory_mutation_history: '&mutationId, [chatKey+ts], [chatKey+targetRecordKey+ts], [chatKey+targetKind+ts], [chatKey+action+ts], chatKey, targetRecordKey, targetKind, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            relationship_memory: '&relationshipKey, [chatKey+updatedAt], [chatKey+actorKey+targetKey], chatKey, actorKey, targetKey, updatedAt',
            memory_recall_log: '&recallId, [chatKey+ts], [chatKey+section+ts], [chatKey+selected+ts], chatKey, section, recordKey, ts',
            llm_credentials: '&providerId, updatedAt',
        });

        this.version(4).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            memory_mutation_history: '&mutationId, [chatKey+ts], [chatKey+targetRecordKey+ts], [chatKey+targetKind+ts], [chatKey+action+ts], chatKey, targetRecordKey, targetKind, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            relationship_memory: '&relationshipKey, [chatKey+updatedAt], [chatKey+actorKey+targetKey], chatKey, actorKey, targetKey, updatedAt',
            memory_recall_log: '&recallId, [chatKey+ts], [chatKey+section+ts], [chatKey+selected+ts], chatKey, section, recordKey, ts',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, consumer, taskId, taskKind, state, reasonCode, sortTs, queuedAt, finishedAt, createdAt, [sourcePluginId+sortTs], [state+sortTs]',
        });

        this.version(5).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            memory_mutation_history: '&mutationId, [chatKey+ts], [chatKey+targetRecordKey+ts], [chatKey+targetKind+ts], [chatKey+action+ts], chatKey, targetRecordKey, targetKind, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            relationship_memory: '&relationshipKey, [chatKey+updatedAt], [chatKey+actorKey+targetKey], chatKey, actorKey, targetKey, updatedAt',
            memory_recall_log: '&recallId, [chatKey+ts], [chatKey+section+ts], [chatKey+selected+ts], chatKey, section, recordKey, ts',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, consumer, taskId, taskKind, state, reasonCode, sortTs, queuedAt, finishedAt, createdAt, [sourcePluginId+sortTs], [state+sortTs]',
        });

        this.version(6).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            memory_mutation_history: '&mutationId, [chatKey+ts], [chatKey+targetRecordKey+ts], [chatKey+targetKind+ts], [chatKey+action+ts], chatKey, targetRecordKey, targetKind, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            memory_cards: '&cardId, chatKey, [chatKey+status], [chatKey+sourceRecordKey], [chatKey+lane], [chatKey+updatedAt]',
            memory_card_embeddings: '&embeddingId, cardId, chatKey',
            memory_card_meta: '&metaKey, chatKey, [chatKey+updatedAt]',
            relationship_memory: '&relationshipKey, [chatKey+updatedAt], [chatKey+actorKey+targetKey], chatKey, actorKey, targetKey, updatedAt',
            memory_recall_log: '&recallId, [chatKey+ts], [chatKey+section+ts], [chatKey+selected+ts], chatKey, section, recordKey, ts',
            llm_credentials: '&providerId, updatedAt',
            llm_request_logs: '&logId, requestId, sourcePluginId, consumer, taskId, taskKind, state, reasonCode, sortTs, queuedAt, finishedAt, createdAt, [sourcePluginId+sortTs], [state+sortTs]',
        });
    }
}

export const db = new SSHelperDatabase();
