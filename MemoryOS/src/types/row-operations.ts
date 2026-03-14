/**
 * 功能：定义行级操作与逻辑表查询相关类型。
 */

// --- 行引用解析结果 ---

export type RowRefSource = 'exact' | 'redirect' | 'alias' | 'fuzzy';

export interface RowRefResolution {
    /** 是否成功解析 */
    resolved: boolean;
    /** 最终解析到的行 ID */
    rowId: string | null;
    /** 解析来源 */
    source: RowRefSource;
    /** 原始输入 */
    input: string;
    /** 是否在解析过程中压平了 redirect 链 */
    flattenedRedirect?: boolean;
}

// --- 行合并请求 ---

export interface RowMergeRequest {
    tableKey: string;
    fromRowId: string;
    toRowId: string;
}

// --- 行合并结果 ---

export interface RowMergeResult {
    success: boolean;
    migratedFactKeys: string[];
    updatedRedirects: number;
    updatedAliases: number;
    auditId?: string;
    error?: string;
}

// --- 行删除模式 ---

export type RowDeleteMode = 'soft';

// --- 行创建种子 ---

export interface RowSeedData {
    [fieldKey: string]: unknown;
}

// --- 逻辑表行视图 ---

export interface LogicTableRow {
    rowId: string;
    tableKey: string;
    values: Record<string, unknown>;
    factKeys: Record<string, string>;
    tombstoned: boolean;
    redirectedTo: string | null;
    aliases: string[];
    updatedAt: number;
}

// --- 逻辑表查询选项 ---

export interface LogicTableQueryOpts {
    /** 是否包含 tombstone 行 */
    includeTombstones?: boolean;
    /** 只返回最近 N 行 */
    limit?: number;
    /** 关键字过滤 */
    keywords?: string[];
}
