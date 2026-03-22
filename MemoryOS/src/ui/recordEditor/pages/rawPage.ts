import type { RecordEditorRawTabMeta, RecordEditorViewMeta, VisibleRawTableName } from '../types';

/**
 * 功能：提供原始数据页的展示元数据。
 */
export const RAW_PAGE_META: RecordEditorViewMeta = {
    label: '原始数据表',
    icon: 'fa-solid fa-table-list',
    title: '原始数据表台',
    subtitle: '直接查看底层事件、事实、摘要和审计表，并支持内联编辑。',
    tip: '用于高级调试和底层编辑，直接查看原始事件、事实、摘要与审计数据。',
};

/**
 * 功能：提供原始数据标签页的展示元数据。
 */
export const RECORD_EDITOR_RAW_TAB_META: Record<VisibleRawTableName, RecordEditorRawTabMeta> = {
    events: {
        label: '事件流',
        tip: '查看当前聊天的原始事件流，适合核对消息事件、来源与写入顺序。',
    },
    facts: {
        label: '事实表',
        tip: '查看底层事实记录，包括主题路径、绑定对象与当前值。',
    },
    summaries: {
        label: '摘要集',
        tip: '查看摘要层原始记录，核对标题、层级、关键词与摘要正文。',
    },
    audit: {
        label: '审计日志',
        tip: '查看数据层的人工和系统修改痕迹，适合排查谁改了什么。',
    },
    memory_mutation_history: {
        label: '变更历史',
        tip: '查看已经执行完成的长期记忆变更，只读不可直接编辑。',
    },
};
