import Dexie, { type Table } from 'dexie';

// --- 数据结构类型约束 ---

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
}

export interface DBFact {
    factKey: string; // 推荐格式：${chatKey}::${type}::${entityKind}:${entityId}::${path}
    chatKey: string;
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
    provenance?: any;
    updatedAt: number;
}

export interface DBWorldState {
    stateKey: string; // ${chatKey}::${path}
    chatKey: string;
    path: string;
    value: any;
    sourceEventId?: string;
    updatedAt: number;
}

export interface DBSummary {
    summaryId: string;
    chatKey: string;
    level: "message" | "scene" | "arc";
    title?: string;
    content: string;
    keywords?: string[];
    range?: { fromMessageId?: string; toMessageId?: string };
    createdAt: number;
    source?: { extractor?: string; provider?: string };
}

export interface DBTemplate {
    templateId: string;
    chatKey: string;
    worldType: "fantasy" | "urban" | "custom";
    name: string;
    schema: any;
    factTypes: any[];
    policies: any;
    layout: any;
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
}

// --- v2 新增类型 ---

export interface DBWorldInfoCache {
    cacheKey: string; // ${chatKey}::${bookName}
    chatKey: string;
    bookName: string;
    hash: string;
    parsedContent: any;
    updatedAt: number;
}

export interface DBTemplateBinding {
    bindingKey: string; // ${chatKey}
    chatKey: string;
    activeTemplateId: string;
    worldInfoHash: string;
    isLocked?: boolean;
    boundAt: number;
}

// --- v3 新增类型（向量层） ---

export interface DBVectorChunk {
    chunkId: string;
    chatKey: string;
    bookId?: string;
    content: string;
    metadata?: any;
    createdAt: number;
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
    metaKey: string; // ${chatKey}::${bookId}
    chatKey: string;
    bookId: string;
    totalChunks: number;
    embeddingModel: string;
    lastIndexedAt: number;
}

// --- 数据库定义实例 ---

/**
 * 核心持久层：提供针对多对象的 IndexedDB 管理封装
 * `stx_memory_os`
 *
 * 版本迁移策略：
 * v1 - 核心 7 张表（events/facts/world_state/summaries/templates/audit/meta）
 * v2 - 新增 worldinfo_cache + template_bindings
 * v3 - 新增向量层 vector_chunks + vector_embeddings + vector_meta
 * v4 - templates 增加 worldInfoHash/factTypes 持久化与按 hash 查询索引
 */
export class MemoryOSDatabase extends Dexie {
    events!: Table<DBEvent, string>;
    facts!: Table<DBFact, string>;
    world_state!: Table<DBWorldState, string>;
    summaries!: Table<DBSummary, string>;
    templates!: Table<DBTemplate, string>;
    audit!: Table<DBAudit, string>;
    meta!: Table<DBMeta, string>;
    // v2
    worldinfo_cache!: Table<DBWorldInfoCache, string>;
    template_bindings!: Table<DBTemplateBinding, string>;
    // v3
    vector_chunks!: Table<DBVectorChunk, string>;
    vector_embeddings!: Table<DBVectorEmbedding, string>;
    vector_meta!: Table<DBVectorMeta, string>;

    constructor() {
        super('stx_memory_os');

        // v1：核心存储
        this.version(1).stores({
            events: '&eventId, [chatKey+ts], [chatKey+type+ts], [chatKey+source.pluginId+ts]',
            facts: '&factKey, [chatKey+type], [chatKey+entity.kind+entity.id], [chatKey+path], [chatKey+updatedAt]',
            world_state: '&stateKey, [chatKey+path]',
            summaries: '&summaryId, [chatKey+level+createdAt]',
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType]',
            audit: '&auditId, chatKey, ts, action',
            meta: '&chatKey'
        });

        // v2：世界书缓存 + 模板绑定
        this.version(2).stores({
            worldinfo_cache: '&cacheKey, chatKey, [chatKey+bookName]',
            template_bindings: '&bindingKey, chatKey',
        });

        // v3：向量层
        this.version(3).stores({
            vector_chunks: '&chunkId, chatKey, [chatKey+bookId]',
            vector_embeddings: '&embeddingId, chunkId, chatKey',
            vector_meta: '&metaKey, chatKey, [chatKey+bookId]',
        });

        // v4：模板按 worldInfoHash 查询
        this.version(4).stores({
            templates: '&templateId, [chatKey+createdAt], [chatKey+worldType], [chatKey+worldInfoHash]',
            template_bindings: '&bindingKey, chatKey',
        });
    }
}

// 暴露出解耦后的单例服务对象，用于上层存储库代理调用
export const db = new MemoryOSDatabase();

type ClearChatDataOptions = {
    includeAudit?: boolean;
};

/**
 * 功能：按 chatKey 清理 MemoryOS 全量相关数据表。
 * 参数：
 *  - chatKey：会话键
 *  - options.includeAudit：是否同时清理审计表，默认 true
 * 返回：
 *  - Promise<void>
 */
export async function clearChatData(chatKey: string, options?: ClearChatDataOptions): Promise<void> {
    const includeAudit = options?.includeAudit !== false;
    const rwTables: Table<any, any>[] = [
        db.events,
        db.facts,
        db.world_state,
        db.summaries,
        db.templates,
        db.meta,
        db.template_bindings,
        db.worldinfo_cache,
        db.vector_chunks,
        db.vector_embeddings,
        db.vector_meta,
    ];
    if (includeAudit) {
        rwTables.push(db.audit);
    }

    await db.transaction('rw', rwTables, async () => {
        await db.events.where('chatKey').equals(chatKey).delete();
        await db.facts.where('chatKey').equals(chatKey).delete();
        await db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).delete();
        await db.summaries.where('[chatKey+level+createdAt]').between([chatKey, '', 0], [chatKey, '\uffff', Infinity]).delete();
        await db.templates.where('[chatKey+createdAt]').between([chatKey, 0], [chatKey, Infinity]).delete();
        await db.meta.delete(chatKey);
        await db.template_bindings.where('chatKey').equals(chatKey).delete();
        await db.worldinfo_cache.where('chatKey').equals(chatKey).delete();
        await db.vector_chunks.where('chatKey').equals(chatKey).delete();
        await db.vector_embeddings.where('chatKey').equals(chatKey).delete();
        await db.vector_meta.where('chatKey').equals(chatKey).delete();
        if (includeAudit) {
            await db.audit.where('chatKey').equals(chatKey).delete();
        }
    });
}

/**
 * 功能：整库重建，彻底清空所有表数据。
 * 参数：无
 * 返回：Promise<void>
 */
export async function clearAllDataByRebuild(): Promise<void> {
    try {
        db.close();
        await db.delete();
        await db.open();
    } catch (error) {
        throw new Error(`整库重建失败: ${String(error)}`);
    }
}

