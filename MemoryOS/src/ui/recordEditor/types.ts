/**
 * 功能：记录编辑器支持的底层数据表类型。
 */
export type RawTableName = 'events' | 'facts' | 'summaries' | 'world_state' | 'audit' | 'memory_mutation_history';

/**
 * 功能：记录编辑器支持的页面视图类型。
 */
export type ViewMode = 'world' | 'memory' | 'vector' | 'diagnostics' | 'raw';

/**
 * 功能：记录编辑器中可见的原始数据表标签类型。
 */
export type VisibleRawTableName = Exclude<RawTableName, 'world_state'>;

/**
 * 功能：描述记录编辑器页面标签的展示信息。
 */
export interface RecordEditorViewMeta {
    label: string;
    icon: string;
    title: string;
    subtitle: string;
    tip: string;
}

/**
 * 功能：描述原始数据表标签的展示信息。
 */
export interface RecordEditorRawTabMeta {
    label: string;
    tip: string;
}

/**
 * 功能：描述原始表聚焦目标。
 */
export interface PendingRawFocus {
    tableName: 'events' | 'facts' | 'summaries';
    recordId?: string;
    messageId?: string;
}

/**
 * 功能：描述打开记录编辑器时的可选参数。
 */
export interface RecordEditorOpenOptions {
    initialView?: ViewMode;
    rawTable?: RawTableName;
    focusRaw?: PendingRawFocus | null;
}
