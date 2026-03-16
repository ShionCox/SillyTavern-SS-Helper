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
    encodeScore?: number;
    profileVersion?: string;
}

export interface DBWorldState {
    stateKey: string;
    chatKey: string;
    path: string;
    value: any;
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
    lastCandidateFlushAt?: number;
    lastRecallLoggedAt?: number;
    memoryMigrationStage?: 'legacy_compatible' | 'dual_write' | 'db_preferred';
    memoryLifecycleBackfilledAt?: number;
    memoryCandidateMirrorAt?: number;
    memoryRecallMirrorAt?: number;
    memoryRelationshipMirrorAt?: number;
    memoryAutoBackfillEnabled?: boolean;
    memoryAutoBackfillBatchSize?: number;
    memoryLifecycleFactCursor?: number;
    memoryLifecycleSummaryCursor?: number;
    memoryLastAutoBackfillAt?: number;
    memoryLastAutoBackfillReason?: string;
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

export interface DBVectorChunk {
    chunkId: string;
    chatKey: string;
    bookId?: string;
    content: string;
    metadata?: DBVectorChunkMetadata;
    createdAt: number;
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
    [key: string]: unknown;
}

export interface DBVectorEmbedding {
    embeddingId: string;
    chunkId: string;
    chatKey: string;
    vector: number[];
    model: string;
    createdAt: number;
}

export interface DBVectorMeta {
    metaKey: string;
    chatKey: string;
    bookId: string;
    totalChunks: number;
    embeddingModel: string;
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

export interface DBMemoryCandidateBuffer {
    candidateId: string;
    chatKey: string;
    kind: 'fact' | 'summary' | 'state' | 'relationship';
    source: string;
    summary: string;
    payload: Record<string, unknown>;
    encoding: Record<string, unknown>;
    conflictWith?: string[];
    resolvedRecordKey?: string;
    ts: number;
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

// ─── 统一数据库定义 ───

/**
 * SS-Helper 统一聊天数据库
 *
 * 所有插件的聊天级数据统一存储在 `ss-helper-db` 中。
 * - 公共三张表: chat_documents / chat_plugin_state / chat_plugin_records
 * - MemoryOS 专属高索引表: events / facts / world_state / summaries / templates / audit / meta / worldinfo_cache / template_bindings / vector_chunks / vector_embeddings / vector_meta
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
    meta!: Table<DBMeta, string>;
    worldinfo_cache!: Table<DBWorldInfoCache, string>;
    template_bindings!: Table<DBTemplateBinding, string>;
    vector_chunks!: Table<DBVectorChunk, string>;
    vector_embeddings!: Table<DBVectorEmbedding, string>;
    vector_meta!: Table<DBVectorMeta, string>;
    relationship_memory!: Table<DBRelationshipMemory, string>;
    memory_candidate_buffer!: Table<DBMemoryCandidateBuffer, string>;
    memory_recall_log!: Table<DBMemoryRecallLog, string>;

    // LLMHub 凭据表
    llm_credentials!: Table<DBLlmCredential, string>;

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
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            vector_chunks: '&chunkId, chatKey, [chatKey+bookId]',
            vector_embeddings: '&embeddingId, chunkId, chatKey',
            vector_meta: '&metaKey, chatKey, [chatKey+bookId]',

            // ── LLMHub 凭据表 ──
            llm_credentials: '&providerId, updatedAt',
        });

        this.version(2).stores({
            chat_documents: '&chatKey, entityKey, updatedAt',
            chat_plugin_state: '[pluginId+chatKey], pluginId, chatKey, updatedAt',
            chat_plugin_records: '++id, [pluginId+chatKey+collection], [pluginId+chatKey+collection+ts], pluginId, chatKey, collection, recordId, ts',
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            audit: '&auditId, chatKey, ts, action',
            meta: '&chatKey',
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
            vector_chunks: '&chunkId, chatKey, [chatKey+bookId]',
            vector_embeddings: '&embeddingId, chunkId, chatKey',
            vector_meta: '&metaKey, chatKey, [chatKey+bookId]',
            relationship_memory: '&relationshipKey, [chatKey+updatedAt], [chatKey+actorKey+targetKey], chatKey, actorKey, targetKey, updatedAt',
            memory_candidate_buffer: '&candidateId, [chatKey+ts], [chatKey+kind+ts], chatKey, kind, ts',
            memory_recall_log: '&recallId, [chatKey+ts], [chatKey+section+ts], [chatKey+selected+ts], chatKey, section, recordKey, ts',
            llm_credentials: '&providerId, updatedAt',
        });
    }
}

export const db = new SSHelperDatabase();
