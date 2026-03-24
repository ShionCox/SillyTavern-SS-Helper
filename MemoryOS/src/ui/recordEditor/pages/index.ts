import type { RecordEditorViewMeta, ViewMode } from '../types';
import { DIAGNOSTICS_PAGE_META } from './diagnosticsPage';
import { MEMORY_PAGE_META } from './memoryPage';
import { RAW_PAGE_META, RECORD_EDITOR_RAW_TAB_META } from './rawPage';
import { VECTOR_PAGE_META } from './vectorPage';
import { WORLD_PAGE_META } from './worldPage';

/**
 * 功能：聚合记录编辑器所有页面的展示元数据。
 */
export const RECORD_EDITOR_VIEW_META: Record<ViewMode, RecordEditorViewMeta> = {
    world: WORLD_PAGE_META,
    memory: MEMORY_PAGE_META,
    vector: VECTOR_PAGE_META,
    diagnostics: DIAGNOSTICS_PAGE_META,
    raw: RAW_PAGE_META,
};

export { RECORD_EDITOR_RAW_TAB_META };
export { renderMemoryPage } from './memoryPage';
