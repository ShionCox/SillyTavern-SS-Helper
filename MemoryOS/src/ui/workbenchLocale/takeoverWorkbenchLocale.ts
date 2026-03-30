const TAKEOVER_WORKBENCH_TEXT_MAP: Record<string, string> = {
    apply_diagnostics: '统一落盘诊断',
    mutation_source: '来源',
    total_mutations: '输入 mutation 数',
    noop_count: 'NOOP 数',
    add_count: '新增数',
    update_count: '更新数',
    merge_count: '合并数',
    invalidate_count: '失效数',
    delete_count: '删除数',
    no_apply_diagnostics: '当前还没有接管落盘诊断。',
    conflict_resolution: '冲突裁决详情',
    selected_primary: '最终采用主记录',
    selection_reason: '选择原因',
    applied_fields: '覆盖字段',
    selected_snapshot: '最终选中快照',
    no_conflict_resolution: '当前还没有冲突裁决详情。',
    conflict_bucket_count: '冲突桶总数',
    rule_resolved_count: '规则直接解决',
    llm_resolved_count: 'LLM 批量解决',
    batched_request_count: 'LLM 请求次数',
    avg_buckets_per_request: '每次平均桶数',
    skipped_by_rule_count: '规则跳过 LLM',
    resolver_source: '裁决来源',
    rule_resolver: '规则裁决',
    llm_batch_resolver: '批量 LLM 裁决',
    deterministic_fallback: '保守兜底',
};

/**
 * 功能：读取旧聊天接管工作台的固定文案。
 * @param key 文案键名
 * @returns 中文文案
 */
export function resolveTakeoverWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return TAKEOVER_WORKBENCH_TEXT_MAP[normalized] ?? normalized;
}
