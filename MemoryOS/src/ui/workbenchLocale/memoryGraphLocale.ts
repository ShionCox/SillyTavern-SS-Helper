import { resolveEntryIdentifierLabel } from './entryLocale';

const MEMORY_GRAPH_TEXT_MAP: Record<string, string> = {
    node_count: '节点',
    edge_count: '连线',
    all_types: '全部类型',
    search_placeholder: '搜索记忆节点',
    mode_semantic: '语义',
    mode_debug: '调试',
    node_detail: '节点详情',
    edge_detail: '关系详情',
    unresolved: '未解析',
    unnamed_relation: '未命名关系',
    summary_title: '核心摘要',
    debug_meta_title: '分析元数据',
    edge_debug_meta_title: '调试元数据',
    source_batches: '来源批次',
    source_kinds: '来源类型',
    reason_codes: '原因标记',
    waiting_selection: '等待选择',
    waiting_selection_hint: '点击节点查看结构化记忆，点击连线查看关系来源与路径。',
    compare_key: '对比键',
    relation_type: '关系类型',
    confidence: '置信度',
    actorkey: '角色键',
    summary: '摘要',
    description: '说明',
    key: '键名',
    value: '值',
    relationtag: '关系标签',
    state: '状态',
    sourceactorkey: '源角色键',
    targetactorkey: '目标角色键',
    trust: '信任度',
    affection: '好感度',
    tension: '紧张度',
    from: '起始状态',
    to: '目标状态',
    reason: '原因',
    target: '目标',
    targettype: '目标类型',
    jump_to_node: '跳转并聚焦节点',
    bindingkey: '绑定键',
    targetref: '目标引用',
    rawref: '原始引用',
    hydrationstate: '补全状态',
    full: '完整',
    partial: '部分',
    unknown: '未知',
    active: '活跃',
    inactive: '停用',
};

/**
 * 功能：读取可视化记忆页面固定文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveMemoryGraphText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return MEMORY_GRAPH_TEXT_MAP[normalized] ?? normalized;
}

/**
 * 功能：将可视化记忆中的字段键转换为中文标签。
 * @param key 原始字段键名。
 * @returns 中文标签。
 */
export function resolveMemoryGraphFieldLabel(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    const condensed = normalized.toLowerCase().replace(/[_-]+/g, '');
    if (MEMORY_GRAPH_TEXT_MAP[normalized]) {
        return MEMORY_GRAPH_TEXT_MAP[normalized];
    }
    if (MEMORY_GRAPH_TEXT_MAP[condensed]) {
        return MEMORY_GRAPH_TEXT_MAP[condensed];
    }
    const translated = resolveEntryIdentifierLabel(normalized);
    return translated || normalized;
}

/**
 * 功能：转换可视化记忆中少量固定调试值。
 * @param value 原始字段值。
 * @returns 中文字段值。
 */
export function resolveMemoryGraphFieldValue(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '';
    }
    const condensed = normalized.toLowerCase().replace(/[_-]+/g, '');
    if (MEMORY_GRAPH_TEXT_MAP[normalized]) {
        return MEMORY_GRAPH_TEXT_MAP[normalized];
    }
    if (MEMORY_GRAPH_TEXT_MAP[condensed]) {
        return MEMORY_GRAPH_TEXT_MAP[condensed];
    }
    return normalized;
}
