const UNIFIED_WORKBENCH_TEXT_MAP: Record<string, string> = {
    workbench_brand: 'MemoryOS 工作台',
    nav_entries: '条目中心',
    nav_types: '类型工坊',
    nav_actors: '角色档案',
    nav_world_entities: '世界实体',
    nav_preview: '诊断中心',
    nav_dream: '梦境维护',
    nav_vectors: '向量实验室',
    nav_memory_graph: '可视化记忆',
    nav_takeover: '旧聊天接管',
    nav_memory_filter: '过滤器',
    stat_entries: '条目',
    stat_entries_title: '当前聊天中的记忆条目数量',
    stat_types: '类型',
    stat_types_title: '当前聊天可用的条目类型数量',
    stat_bindings: '绑定',
    stat_bindings_title: '角色与条目之间的真实绑定数量',
};

export function resolveUnifiedWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return UNIFIED_WORKBENCH_TEXT_MAP[normalized] ?? normalized;
}
