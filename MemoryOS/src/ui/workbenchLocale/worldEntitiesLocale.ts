import { resolveEntryIdentifierLabel } from './entryLocale';

const WORLD_ENTITY_TEXT_MAP: Record<string, string> = {
    unnamed_field: '未命名字段',
    unnamed_entity: '未命名实体',
    uncategorized: '未分类',
    no_summary: '暂无摘要',
    no_detail: '暂无详细内容',
    no_entities: '当前聊天还没有世界实体条目。',
    section_title: '世界实体',
    section_desc: '这里仅展示真实可用的查看能力，不放未实现的按钮。',
    stats_title: '实体概览',
    stats_total: '总数',
    stats_capability: '当前能力',
    stats_capability_value: '列表浏览、详情查看、结构化字段预览',
    stats_empty: '暂无分类统计',
    list_title: '实体列表',
    list_desc: '支持配合工作台顶部搜索查看国家、城市、组织、地点和世界设定。',
    overview_title_id: '条目 ID',
    overview_title_category: '分类',
    overview_title_created_at: '创建时间',
    overview_title_updated_at: '更新时间',
    overview_title_tags: '标签',
    empty_tags: '暂无',
    summary_title: '摘要',
    detail_title: '详细内容',
    structured_title: '结构化信息',
    structured_empty: '当前条目还没有结构化字段。',
    notes_title: '补充说明',
    notes_empty: '选择实体后，可在这里查看结构化摘要和原始数据。',
    structured_summary_title: '结构化摘要',
    structured_summary_empty: '当前条目还没有可展示的结构化摘要。',
    raw_payload_title: '原始数据预览',
    select_entity_first: '请先在左侧选择一个世界实体。',
    sidebar_empty: '选择世界实体后，可在这里查看补充信息。',
    quick_info_title: '快速信息',
    quick_info_type: '类型',
    quick_info_category: '分类',
    quick_info_updated_at: '更新时间',
    quick_info_tag_count: '标签数',
};

const WORLD_ENTITY_FIELD_LABEL_MAP: Record<string, string> = {
    type: '类型',
    subject: '主体',
    predicate: '关系',
    value: '值',
    confidence: '置信度',
    source: '来源',
    takeover: '接管信息',
    takeoverId: '接管任务 ID',
    batchId: '批次 ID',
    chapterTags: '章节标签',
    recentDigest: '最近摘要',
};

/**
 * 功能：将世界实体字段键名转换为更适合展示的中文标题。
 * @param key 原始字段键名。
 * @returns 中文字段标题。
 */
export function resolveWorldEntityFieldLabel(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return WORLD_ENTITY_TEXT_MAP.unnamed_field;
    }
    if (WORLD_ENTITY_FIELD_LABEL_MAP[normalized]) {
        return WORLD_ENTITY_FIELD_LABEL_MAP[normalized];
    }
    const translated = resolveEntryIdentifierLabel(normalized);
    return translated || normalized;
}

/**
 * 功能：读取世界实体页签的固定中文文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveWorldEntityText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return WORLD_ENTITY_TEXT_MAP[normalized] ?? normalized;
}
