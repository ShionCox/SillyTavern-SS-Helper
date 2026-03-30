const ACTORS_WORKBENCH_TEXT_MAP: Record<string, string> = {
    section_title: '角色档案',
    create_actor: '新建角色',
    search_placeholder: '搜索角色...',
    all_tags: '所有标签',
    stat_desc: '稳定度 ↓',
    stat_asc: '稳定度 ↑',
    name_asc: '名称正序',
    name_desc: '名称倒序',
    memory_stat_badge: '记忆稳定度',
    real_relation_count: '条真实关系',
    no_matched_actor: '没有匹配的角色。',
    tab_attributes: '基础资料',
    tab_memory: '深层记忆',
    tab_items: '装备终端',
    tab_relationships: '拓扑节点',
    actor_key: '角色键',
    display_name: '显示名',
    actor_key_placeholder: '请输入角色键名',
    actor_label_placeholder: '例如：塔拉菲娜',
    user_actor_note_title: '用户角色说明',
    user_actor_note_text: '用户角色名称会优先同步酒馆中的当前用户名，这个角色不需要单独设置记忆稳定度。',
    memory_stat: '记忆稳定度（0-100）',
    current_profile: '当前档案',
    not_created: '未创建',
    unnamed: '未命名',
    created_at: '创建时间',
    updated_at: '更新时间',
    save_actor: '保存角色资料',
    bind_new_entry: '绑定新条目',
    bind_current_actor: '绑定到当前角色',
    deep_memory: '深层记忆',
    current_actor_prefix: '当前角色',
    real_binding_count_suffix: '条真实绑定。',
    no_real_memory: '当前角色还没有任何真实绑定记忆。',
    signal: '信号',
    unbind: '解绑',
    no_detail: '暂无正文',
    structured_facts: '结构化事实',
    item_terminal: '装备终端',
    item_terminal_text: '当前聊天尚未接入真实的物品/装备主链，因此这里只显示只读说明，不再渲染演示背包或伪装备栏。',
    access_state: '接入状态',
    not_connected: '未接入主链',
    current_strategy: '当前策略',
    readonly_empty: '只读空态',
    future_condition: '后续条件',
    future_condition_text: '等待真实物品系统完成',
    relation_to_prefix: '对',
    relation_to_suffix: '的状况',
    not_bound: '未绑定',
    no_related_actor: '无直接关系角色',
    recent_summaries: '最近命中总结',
    no_hit_summary: '无命中总结',
    relation_loading: '关系图加载中…',
    relation_network: '关系网',
    drag_zoom_hint: '可拖拽与滚轮缩放',
    actor_attributes: '角色属性',
    not_selected: '未选择',
    relation_status: '关系状况',
};

/**
 * 功能：读取角色档案固定文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveActorsWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return ACTORS_WORKBENCH_TEXT_MAP[normalized] ?? normalized;
}
