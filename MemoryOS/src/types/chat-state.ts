/**
 * 聊天级插件状态与策略类型定义
 * 存储在 chat_plugin_state.state 中，每个 chatKey 独立维护
 */

// ─── 总结策略覆盖 ───

export interface SummaryPolicyOverride {
    /** 是否启用 AI 总结 */
    enabled?: boolean;
    /** 楼层单位：固定为角色完整回复 */
    floorUnit?: 'assistant_reply';
    /** 每隔多少楼触发一次总结（默认 12） */
    interval?: number;
    /** 回看窗口大小（默认 40 楼） */
    windowSize?: number;
    /** 是否允许 AI 自动扩展 schema */
    allowAutoSchemaExpansion?: boolean;
}

/** 默认总结策略 */
export const DEFAULT_SUMMARY_POLICY: Required<SummaryPolicyOverride> = {
    enabled: true,
    floorUnit: 'assistant_reply',
    interval: 12,
    windowSize: 40,
    allowAutoSchemaExpansion: true,
};

// ─── 自动 Schema 策略 ───

export interface AutoSchemaPolicy {
    /** 每次 AI 最多新增的表数 */
    maxNewTablesPerRound?: number;
    /** 每次 AI 最多新增的字段数 */
    maxNewFieldsPerRound?: number;
    /** 单表每次最多新增字段数 */
    maxNewFieldsPerTable?: number;
    /** 表名近似冲突阈值（默认 0.90） */
    tableNameConflictThreshold?: number;
    /** 说明文本归一化相似度阈值（默认 0.85） */
    descriptionSimilarityThreshold?: number;
}

export const DEFAULT_AUTO_SCHEMA_POLICY: Required<AutoSchemaPolicy> = {
    maxNewTablesPerRound: 1,
    maxNewFieldsPerRound: 5,
    maxNewFieldsPerTable: 3,
    tableNameConflictThreshold: 0.90,
    descriptionSimilarityThreshold: 0.85,
};

// ─── Schema 草稿会话 ───

export interface SchemaDraftSession {
    /** 当前草稿修订 ID */
    draftRevisionId: string | null;
    /** 草稿创建时间 */
    draftCreatedAt: number | null;
    /** 连续无 schema 变化的成功提取次数 */
    consecutiveNoChangeCount: number;
    /** 合并窗口超时时间（ms，默认 10 分钟） */
    mergeWindowMs: number;
}

export const DEFAULT_SCHEMA_DRAFT_SESSION: SchemaDraftSession = {
    draftRevisionId: null,
    draftCreatedAt: null,
    consecutiveNoChangeCount: 0,
    mergeWindowMs: 10 * 60 * 1000,
};

// ─── 助手楼层跟踪器 ───

export interface AssistantTurnTracker {
    /** 已计入楼层的助手消息 ID 集合 */
    countedAssistantMessageIds: string[];
    /** 近期助手回复的文本签名（用于无 messageId 时去重） */
    recentAssistantTurnSignatures: string[];
    /** 当前已统计的助手楼层总数 */
    assistantTurnCount: number;
    /** tracker 最后更新时间 */
    lastUpdatedAt: number;
}

export const DEFAULT_ASSISTANT_TURN_TRACKER: AssistantTurnTracker = {
    countedAssistantMessageIds: [],
    recentAssistantTurnSignatures: [],
    assistantTurnCount: 0,
    lastUpdatedAt: 0,
};

/** tracker 默认保留最近 200 条记录 */
export const TRACKER_LRU_LIMIT = 200;

/** tracker 节流写回间隔（ms） */
export const TRACKER_FLUSH_INTERVAL_MS = 1000;

// ─── 行别名索引 ───

/** 别名 → 主行 ID 的映射 */
export type RowAliasIndex = Record<string, Record<string, string>>;

// ─── 行重定向 ───

/** 旧行 ID → 新行 ID 的映射（必须压平为单跳） */
export type RowRedirects = Record<string, Record<string, string>>;

// ─── 行墓碑 ───

export interface RowTombstone {
    rowId: string;
    tableKey: string;
    deletedAt: number;
    deletedBy: string;
}

/** tableKey → rowId → RowTombstone */
export type RowTombstones = Record<string, Record<string, RowTombstone>>;

// ─── 聊天级插件状态完整结构 ───

export interface MemoryOSChatState {
    summaryPolicyOverride?: SummaryPolicyOverride;
    autoSchemaPolicy?: AutoSchemaPolicy;
    schemaDraftSession?: SchemaDraftSession;
    assistantTurnTracker?: AssistantTurnTracker;
    rowAliasIndex?: RowAliasIndex;
    rowRedirects?: RowRedirects;
    rowTombstones?: RowTombstones;
}
