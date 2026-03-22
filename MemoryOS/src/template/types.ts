/**
 * 世界模板类型定义
 * 定义模板中的实体、事实类型、抽取策略和注入布局
 */

/** 实体定义（逻辑表的列结构） */
/** 事实类型定义（决定 facts 的 path 模式与注入分区） */
export interface TemplateFactType {
    type: string;
    pathPattern: string;
    slots: string[];
    defaultInjection?: string;
}

/** 抽取策略 */
export interface ExtractPolicies {
    'memory.ingest'?: {
        minConfidence?: number;
        allowWriteFacts?: boolean;
    };
    'world.update'?: {
        allowPatches?: boolean;
        requireDiff?: boolean;
    };
    [task: string]: Record<string, any> | undefined;
}

/** 注入布局（控制各区段的 token/条数限额） */
export interface InjectionLayout {
    WORLD_STATE?: { maxTokens?: number };
    FACTS?: { maxTokens?: number };
    EVENTS?: { maxItems?: number };
    SUMMARY?: { maxTokens?: number };
}

/** 表定义（聊天级多表知识库） */
export interface TemplateTableDef {
    key: string;
    label: string;
    isBase: boolean;
    primaryKeyField: string;
    source?: 'persisted' | 'derived';
    fields: Array<{
        key: string;
        label: string;
        tier: 'core' | 'extension';
        description?: string;
        fillSpec?: string;
        isPrimaryKey?: boolean;
    }>;
    description?: string;
}

/** 完整的世界模板 */
export interface WorldTemplate {
    templateId: string;
    chatKey: string;
    worldType: 'fantasy' | 'urban' | 'custom';
    name: string;
    factTypes: TemplateFactType[];
    extractPolicies: ExtractPolicies;
    injectionLayout: InjectionLayout;
    worldInfoRef?: { book: string; hash: string };
    createdAt: number;

    // ── 聊天级多表记忆扩展 ──
    /** 多表结构化定义 */
    tables: TemplateTableDef[];
    /** 字段同义词映射 */
    fieldSynonyms?: Record<string, string[]>;
    /** 表同义词映射 */
    tableSynonyms?: Record<string, string[]>;

    // ── 修订元数据 ──
    /** 模板族 ID */
    templateFamilyId?: string;
    /** 修订序号 */
    revisionNo?: number;
    /** 修订状态 */
    revisionState?: 'draft' | 'final';
    /** 父修订模板 ID */
    parentTemplateId?: string | null;
    /** schema 指纹 */
    schemaFingerprint?: string;
    /** 最后一次触碰时间 */
    lastTouchedAt?: number;
    /** 固化时间 */
    finalizedAt?: number | null;
}

/** 世界书条目（从 SillyTavern WorldInfo 读入） */
export interface WorldInfoEntry {
    book: string;
    entry: string;
    keywords: string[];
    content: string;
}

/** 世界上下文束（传给 LLM 用于生成模板） */
export interface WorldContextBundle {
    chatKey: string;
    worldInfo: WorldInfoEntry[];
    characterCard?: { name: string; desc: string; tags?: string[] };
    recentMessages?: Array<{ role: string; content: string }>;
}
