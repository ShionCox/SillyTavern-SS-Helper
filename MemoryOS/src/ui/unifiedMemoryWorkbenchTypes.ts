/**
 * 功能：统一记忆工作台兼容的底层数据表类型。
 */
export type UnifiedWorkbenchRawTableName =
    | 'events'
    | 'templates'
    | 'audit'
    | 'memory_mutation_history'
    | 'memory_entries'
    | 'memory_entry_types'
    | 'actor_memory_profiles'
    | 'role_entry_memory'
    | 'memory_relationships'
    | 'summary_snapshots';

/**
 * 功能：统一记忆工作台支持的页面视图类型。
 */
export type UnifiedWorkbenchViewMode = 'world' | 'memory' | 'diagnostics' | 'raw' | 'takeover' | 'vectors' | 'content-lab' | 'dream';

/**
 * 功能：统一记忆工作台中可见的原始数据表标签类型。
 */
export type UnifiedWorkbenchVisibleRawTableName = UnifiedWorkbenchRawTableName;

/**
 * 功能：描述统一记忆工作台页面标签的展示信息。
 */
export interface UnifiedWorkbenchViewMeta {
    label: string;
    icon: string;
    title: string;
    subtitle: string;
    tip: string;
}

/**
 * 功能：描述原始数据表标签的展示信息。
 */
export interface UnifiedWorkbenchRawTabMeta {
    label: string;
    tip: string;
}

/**
 * 功能：描述原始表聚焦目标。
 */
export interface UnifiedWorkbenchPendingRawFocus {
    tableName: 'events' | 'memory_entries' | 'summary_snapshots';
    recordId?: string;
    messageId?: string;
}

/**
 * 功能：描述打开统一记忆工作台时的可选参数。
 */
export interface UnifiedMemoryWorkbenchOpenOptions {
    initialView?: UnifiedWorkbenchViewMode;
    rawTable?: UnifiedWorkbenchRawTableName;
    focusRaw?: UnifiedWorkbenchPendingRawFocus | null;
}
