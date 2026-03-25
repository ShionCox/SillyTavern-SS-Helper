/**
 * 模板修订体系类型定义
 * 支持表级结构、字段分层、修订链与防膨胀约束
 */

// ─── 字段分层 ───

export type FieldTier = 'core' | 'extension';

export interface TableFieldDef {
    /** 稳定内部键名（snake_case） */
    key: string;
    /** 显示标签 */
    label: string;
    /** 字段层级 */
    tier: FieldTier;
    /** 字段说明 */
    description?: string;
    /** 填写规范 */
    fillSpec?: string;
    /** 是否主键 */
    isPrimaryKey?: boolean;
}

// ─── 表定义 ───

export interface TableDef {
    /** 稳定内部键名 */
    key: string;
    /** 显示标签 */
    label: string;
    /** 是否为基础表 */
    isBase: boolean;
    /** 主键字段名 */
    primaryKeyField: string;
    /** 字段定义列表 */
    fields: TableFieldDef[];
    /** 表用途说明 */
    description?: string;
}

/** 基础表标准集 */
export const BASE_TABLE_KEYS = [
    'characters',
    'locations',
    'organizations',
    'items',
    'relations',
    'quests',
] as const;

export type BaseTableKey = typeof BASE_TABLE_KEYS[number];

// ─── 同义词映射 ───

/** 字段同义词：归一化后的 key → 同义词列表 */
export type FieldSynonyms = Record<string, string[]>;

/** 表同义词：归一化后的 key → 同义词列表 */
export type TableSynonyms = Record<string, string[]>;

// ─── 修订状态 ───

export type RevisionState = 'draft' | 'final';

// ─── 模板修订元数据 ───

export interface TemplateRevisionMeta {
    /** 模板族 ID（同一世界观下所有修订共享） */
    templateFamilyId: string;
    /** 修订序号（递增） */
    revisionNo: number;
    /** 修订状态 */
    revisionState: RevisionState;
    /** 父修订模板 ID */
    parentTemplateId: string | null;
    /** schema 指纹（用于 diff 去重） */
    schemaFingerprint: string;
    /** 最后一次触碰时间 */
    lastTouchedAt: number;
    /** 固化为 final 的时间 */
    finalizedAt: number | null;
}

// ─── Schema 变更提议 ───

export type SchemaChangeKind =
    | 'add_table'
    | 'add_field'
    | 'modify_primary_key'
    | 'modify_description'
    | 'alias_suggestion';

export interface SchemaChangeProposal {
    kind: SchemaChangeKind;
    tableKey: string;
    fieldKey?: string;
    payload: Record<string, unknown>;
    /** 此变更是否为当前 facts 落盘所必需 */
    requiredByFacts?: boolean;
}

// ─── 实体解析提议 ───

export interface EntityResolution {
    tableKey: string;
    fromRowId: string;
    toRowId: string;
    confidence: number;
    reason: string;
}

export type EntityResolutionProposal = EntityResolution;

// ─── 延后 Schema 建议 ───

export interface DeferredSchemaHint {
    change: SchemaChangeProposal;
    deferredAt: number;
    reason: string;
}

// ─── 变更预算 ───

export interface ChangeBudget {
    /** facts 单轮最多处理的单元格更新数 */
    maxFactCellUpdates: number;
    /** facts 单轮最多处理的实体行更新数 */
    maxFactEntityUpdates: number;
    /** facts 达到高密度阈值时 schemaChanges 是否受限 */
    throttleSchemaOnHighDensityFacts: boolean;
}

export const DEFAULT_CHANGE_BUDGET: ChangeBudget = {
    maxFactCellUpdates: 40,
    maxFactEntityUpdates: 12,
    throttleSchemaOnHighDensityFacts: true,
};

// ─── Prompt 裁剪预算 ───

export interface PromptTrimBudget {
    extract: {
        maxTables: number;
        maxRowsPerTable: number;
        maxFieldsPerRow: number;
    };
    summarize: {
        maxTables: number;
        maxRowsPerTable: number;
    };
}

export const DEFAULT_PROMPT_TRIM_BUDGET: PromptTrimBudget = {
    extract: {
        maxTables: 4,
        maxRowsPerTable: 5,
        maxFieldsPerRow: 6,
    },
    summarize: {
        maxTables: 2,
        maxRowsPerTable: 3,
    },
};
