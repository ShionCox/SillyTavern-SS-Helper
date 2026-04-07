const DREAM_WORKBENCH_TEXT_MAP: Record<string, string> = {
    workbench_title: '梦境工作台',
    pipeline_title: '梦境总控台',
    section_title: '梦境中枢',
    section_desc: '在同一屏查看梦境会话、维护队列、调度状态与质量告警。',
    open_workbench: '打开梦境工作台',
    manual_dream: '手动做梦',
    ops_overview: '梦境总览',
    ops_overview_desc: '把会话、维护、调度与质量判断收拢到同一屏，方便快速巡检。',
    style_unrecorded: '未记录风格',
    session_metric: '梦境会话',
    pending_maintenance_metric: '待处理维护',
    active_scheduler_metric: '调度队列',
    quality_report_metric: '质量报告',
    recent_12_sessions: '最近 12 条会话',
    waiting_review_or_auto_apply: '等待审批或自动应用',
    quality_score_latest: '最新分数',
    queue_running_summary: '队列 {queued} / 运行 {running}',
    latest_trigger: '最近触发',
    last_completed: '上次完成',
    blocked_reason: '阻塞原因',
    prompt_version: '提示词版本',
    latest_session: '最新会话',
    dream_echo: '梦境摘要',
    recent_sessions_title: '最近会话',
    recent_sessions_desc: '集中查看版本、风格、质量分和写回结果。',
    no_dream_session: '当前还没有梦境会话。',
    maintenance_queue_title: '维护队列',
    maintenance_queue_desc: '集中查看待处理维护提案、原因和来源条目。',
    maintenance_queue_pending_hint: '待处理提案可直接在此批准应用，或拒绝丢弃；也可前往维护台查看完整上下文。',
    no_pending_maintenance: '当前没有待处理维护提案。',
    scheduler_quality_title: '调度与质量',
    scheduler_status: '调度状态',
    recent_eligibility: '最近资格判断',
    daily_count: '每日计数',
    last_triggered: '上次触发',
    latest_quality_warning: '最新质量告警',
    forced_review: '强制复核',
    no_block_warning: '暂无阻断告警',
    session_tab: '会话',
    diagnostics_tab: '诊断',
    maintenance_tab: '维护',
    applied_tab: '已应用',
    rollback_tab: '回滚',
    session_count: '会话数',
    approved_count: '已批准',
    pending_review_count: '待审批',
    maintenance_pending_count: '待处理维护',
    maintenance_applied_count: '已应用维护',
    scheduler_short: '调度器',
    trigger_reason: '触发',
    time_label: '时间',
    quality_score: '质量分',
    unevaluated: '未评估',
    warning_label: '警告',
    maintenance_applied: '维护已应用',
    maintenance_pending: '待处理',
    status_with_value: '状态 {value}',
    trigger_with_value: '触发 {value}',
    recorded_prompt: '未记录提示词',
    dream_short: '梦境',
    no_narrative: '暂无梦境叙事',
    no_reason: '暂无原因',
    no_written_back: '未写回',
    no_data: '暂无',
    item_count_suffix: '条',
    style_label: '风格',
    schema_label: '结构版本',
    narrative_length: '叙事长度',
    mutation_count: '变更提案',
    explain_coverage: '解释覆盖',
    unified_apply: '统一执行',
    entry_applied: '条目已应用',
    relationship_applied: '关系已应用',
    entry_created: '新建条目',
    entry_updated: '更新条目',
    relationship_created: '新建关系',
    relationship_updated: '更新关系',
    no_output_summary: '无梦境输出摘要',
    mutations_title: '变更提案',
    rollback_whole_dream: '回滚整个梦境',
    rolled_back: '已回滚',
    maintenance_type: '类型',
    confidence: '置信度',
    involved_entries: '涉及条目',
    approve_apply: '批准应用',
    reject: '拒绝',
    open_maintenance_tab: '前往维护台',
    extra_warning_none: '无额外警告',
    blocked_short: '阻断',
    forced_review_short: '强制复核',
    scheduler_uninitialized: '调度器尚未初始化',
    status_label: '状态',
    today_executed: '今日已执行',
    cooldown_minutes: '冷却时间',
    trigger_source: '触发源',
    generation_ended_label: '回复结束触发',
    idle_trigger_label: '空闲触发',
    minute_unit: '分钟',
    never: '从未',
    unknown_dream: '未知梦境',
    unknown_status: '未知状态',
    unknown_trigger: '未知',
    runtime_busy: '运行中',
    runtime_idle: '空闲',
    approved: '已批准',
    pending: '待审批',
    rejected: '已拒绝',
    queued: '排队中',
    generated: '已生成',
    running: '运行中',
    applied_dream_changes: '已应用变更',
    no_applied_changes: '暂无已应用变更。',
    no_change_record: '无条目或关系变更记录。',
    no_quality_report: '暂无质量报告。',
    no_maintenance_proposal: '暂无维护提案。',
    not_connected_memory: '当前聊天未连接记忆主链，无法打开梦境工作台。',
    refresh: '刷新',
    clear_all_dream_records: '清理梦境信息',
    clear_all_dream_records_confirm: '确定要清理当前聊天的全部梦境信息吗？这会删除梦境会话、审批记录、维护提案、质量报告和调度状态，但不会回滚已写入主记忆链的记忆条目。此操作无法恢复。',
    clear_all_dream_records_success: '已清理 {count} 条梦境信息。',
    clear_all_dream_records_failed: '梦境信息清理失败：{reason}',
    mutation_type: '变更类型',
    confidence_short: '置信度',
    rollback: '回滚',
    perform_rollback: '执行回滚',
    rollback_at: '回滚时间',
    rollbackable_sessions: '可回滚会话',
    no_rollback_session: '暂无可回滚会话。',
    created_entry_short: '新增',
    updated_entry_short: '修改',
    relationship_changed_short: '关系',
    affected_entries: '涉及条目',
    affected_relationships: '涉及关系',
    applied_status: '已应用',
    change_fields_summary: '摘要',
    change_fields_detail: '详情',
    change_fields_tags: '标签',
    change_fields_detail_payload: '扩展字段',
    added_entries: '新增条目',
    modified_entries: '修改条目',
    relationship_changes: '关系变更',
    apply_failed_title: '加载梦境工作台失败',
    load_failed_message: '梦境工作台加载失败：{message}',
    unknown_reason: '未知原因',
    rollback_failed: '梦境回滚失败：{reason}',
    rollback_success: '已回滚该次梦境影响。',
    mutation_rollback_failed: '单条变更回滚失败：{reason}',
    mutation_rollback_success: '已回滚该条变更。',
    maintenance_apply_failed: '维护提案应用失败：{reason}',
    maintenance_apply_success: '维护提案已应用。',
    maintenance_reject_failed: '维护提案拒绝失败：{reason}',
    maintenance_reject_success: '维护提案已拒绝。',
    id_label: '标识',
    proposal_key_label: '提案标识',
    mutation_type_entry_create: '新建条目',
    mutation_type_entry_patch: '更新条目',
    mutation_type_relationship_patch: '关系修补',
    proposal_type_memory_compression: '记忆压缩',
    proposal_type_relationship_reinforcement: '关系强化',
    proposal_type_shadow_adjustment: '影子修正',
    proposal_type_summary_candidate_promotion: '总结候选提升',
    proposal_type_entry_create: '新建条目',
    proposal_type_entry_patch: '更新条目',
    proposal_type_relationship_patch: '关系修补',
    review_source_recent: '近期记忆',
    review_source_mid: '中期记忆',
    review_source_deep: '深层记忆',
    review_wave_recent: '近期波',
    review_wave_mid: '中期波',
    review_wave_deep: '深层波',
};

function readText(value: unknown): string {
    return String(value ?? '').trim();
}

function readTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
}

export interface DreamMaintenanceDisplay {
    title: string;
    summary: string;
    impactLabel: string;
    impactItems: string[];
    impactText: string;
    resultHint: string;
    technicalMeta: string[];
}

export function resolveDreamWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return DREAM_WORKBENCH_TEXT_MAP[normalized] ?? normalized;
}

export function formatDreamWorkbenchText(key: string, values: Record<string, string | number | null | undefined>): string {
    const template = resolveDreamWorkbenchText(key);
    return template.replace(/\{(\w+)\}/g, (_, token: string): string => {
        const rawValue = values[token];
        if (rawValue == null) {
            return '';
        }
        return String(rawValue);
    });
}

export function resolveDreamProposalTypeLabel(type: string | null | undefined): string {
    const normalized = String(type ?? '').trim();
    if (!normalized) {
        return '';
    }
    const mapped = resolveDreamWorkbenchText(`proposal_type_${normalized}`);
    return mapped === `proposal_type_${normalized}` ? normalized : mapped;
}

export function resolveDreamMutationTypeLabel(type: string | null | undefined): string {
    const normalized = String(type ?? '').trim();
    if (!normalized) {
        return '';
    }
    const mapped = resolveDreamWorkbenchText(`mutation_type_${normalized}`);
    return mapped === `mutation_type_${normalized}` ? normalized : mapped;
}

export function resolveDreamReviewSourceLabel(source: string | null | undefined): string {
    const normalized = String(source ?? '').trim();
    if (!normalized) {
        return '';
    }
    const mapped = resolveDreamWorkbenchText(`review_source_${normalized}`);
    return mapped === `review_source_${normalized}` ? normalized : mapped;
}

export function resolveDreamReviewWaveLabel(wave: string | null | undefined): string {
    const normalized = String(wave ?? '').trim();
    if (!normalized) {
        return '';
    }
    const mapped = resolveDreamWorkbenchText(`review_wave_${normalized}`);
    return mapped === `review_wave_${normalized}` ? normalized : mapped;
}

export function localizeDreamDisplayText(value: string | null | undefined): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    return text
        .replace(/dream insight/gi, '梦境洞察')
        .replace(/summary pipeline/gi, '总结流程')
        .replace(/summary candidate/gi, '总结候选')
        .replace(/shadow adjustment/gi, '影子修正')
        .replace(/relationship reinforcement/gi, '关系强化')
        .replace(/memory compression/gi, '记忆压缩')
        .replace(/dream maintenance/gi, '梦境维护')
        .replace(/\bdream\b/gi, '梦境');
}

export function resolveDreamMaintenanceDisplay(input: {
    proposalType: string | null | undefined;
    preview?: string | null | undefined;
    reason?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    sourceEntryLabels?: string[] | null | undefined;
    actorLabels?: string[] | null | undefined;
}): DreamMaintenanceDisplay {
    const proposalType = String(input.proposalType ?? '').trim();
    const preview = localizeDreamDisplayText(input.preview);
    const reason = localizeDreamDisplayText(input.reason);
    const payload = input.payload ?? {};
    const sourceEntryLabels = (input.sourceEntryLabels ?? []).map((item: string): string => readText(item)).filter(Boolean);
    const actorLabels = (input.actorLabels ?? []).map((item: string): string => readText(item)).filter(Boolean);

    if (proposalType === 'memory_compression') {
        const primaryLabel = readText((payload as Record<string, unknown>).primaryEntryLabel) || sourceEntryLabels[0] || preview;
        return {
            title: primaryLabel ? `帮你把零散记忆整理成“${primaryLabel}”` : '帮你把零散记忆整理得更清楚',
            summary: reason || '这些记忆内容高度接近，适合合并整理，减少重复。',
            impactLabel: '会整理这些记忆',
            impactItems: sourceEntryLabels,
            impactText: '',
            resultHint: '批准后会把相近内容压缩整合，并把次要记忆标记为已并入。',
            technicalMeta: ['记忆压缩'],
        };
    }

    if (proposalType === 'relationship_reinforcement') {
        const relationLabel = readText((payload as Record<string, unknown>).relationLabel) || preview;
        const participantText = actorLabels.slice(0, 2).join('与');
        return {
            title: participantText ? `准备强化 ${participantText} 的关系线索` : (relationLabel ? `准备强化“${relationLabel}”` : '准备强化一段关系线索'),
            summary: reason || '这段关系在近期梦境里反复出现，适合补强印象和互动线索。',
            impactLabel: actorLabels.length > 0 ? '主要影响这些角色' : '主要影响',
            impactItems: actorLabels,
            impactText: actorLabels.length <= 0 ? relationLabel : '',
            resultHint: '批准后会提高这段关系的强度，并补一条更清楚的关系摘要。',
            technicalMeta: ['关系强化'],
        };
    }

    if (proposalType === 'shadow_adjustment') {
        const entryLabel = readText((payload as Record<string, unknown>).entryLabel) || sourceEntryLabels[0] || preview;
        return {
            title: entryLabel ? `准备把“${entryLabel}”调成更低频的背景记忆` : '准备下调一条记忆的显性权重',
            summary: reason || '这条记忆长期活跃度较低，更适合退到背景，而不是直接删除。',
            impactLabel: '主要影响',
            impactItems: entryLabel ? [entryLabel] : sourceEntryLabels,
            impactText: '',
            resultHint: '批准后会降低这条记忆的显性召回权重，但不会删除它。',
            technicalMeta: ['影子修正'],
        };
    }

    if (proposalType === 'summary_candidate_promotion') {
        const candidateTitle = readText((payload as Record<string, unknown>).candidateTitle);
        const highlights = readTextArray((payload as Record<string, unknown>).sourceHighlights);
        return {
            title: candidateTitle ? `把“${candidateTitle}”整理进总结候选` : '把这轮梦境洞察整理进总结候选',
            summary: reason || '这轮梦境里的亮点已经足够清晰，适合进入后续总结流程。',
            impactLabel: highlights.length > 0 ? '会整理这些洞察' : '会整理这些记忆',
            impactItems: highlights.length > 0 ? highlights : sourceEntryLabels,
            impactText: readText((payload as Record<string, unknown>).candidateSummary),
            resultHint: '批准后会生成一条总结候选，方便后续总结直接复用。',
            technicalMeta: ['总结候选提升'],
        };
    }

    return {
        title: preview || '梦境维护建议',
        summary: reason || '系统认为这条维护建议值得你看一眼。',
        impactLabel: '主要影响',
        impactItems: sourceEntryLabels,
        impactText: '',
        resultHint: '批准后会按这条建议更新相关记忆内容。',
        technicalMeta: [resolveDreamProposalTypeLabel(proposalType) || proposalType],
    };
}
