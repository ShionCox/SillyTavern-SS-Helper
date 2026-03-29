import { resolveWorldProfileLabel } from './worldProfileLocale';

const MUTATION_ACTION_LABEL_MAP: Record<string, string> = {
    summary_planner_resolved: '总结规划已完成',
    type_schemas_resolved: '类型约束已就绪',
    candidate_records_resolved: '候选记录已筛出',
    mutation_validated: '变更校验已完成',
    mutation_applied: '变更写入已完成',
    summary_failed: '总结链路失败',
};

const TRACE_STAGE_LABEL_MAP: Record<string, string> = {
    memory_recall_started: '开始召回',
    memory_context_built: '召回上下文已构建',
    memory_prompt_inserted: '记忆提示已插入',
    memory_prompt_insert_success: '提示词插入成功',
    memory_ingest_started: '开始写入记忆',
    memory_event_appended: '记忆事件已追加',
    cold_start_started: '冷启动开始',
    cold_start_succeeded: '冷启动成功',
    cold_start_failed: '冷启动失败',
    world_profile_bound: '世界画像已绑定',
    summary_started: '开始生成总结',
    candidate_types_resolved: '候选类型已确定',
    type_schemas_resolved: '类型约束已确定',
    candidate_records_resolved: '候选记录已确定',
    mutation_validated: '变更校验已完成',
    mutation_applied: '变更写入已完成',
    summary_failed: '总结链路失败',
    injection_context_built: '注入上下文已构建',
};

const TRACE_LEVEL_LABEL_MAP: Record<string, string> = {
    info: '信息',
    warn: '警告',
    warning: '警告',
    error: '错误',
    debug: '调试',
};

const SUMMARY_STAGE_LABEL_MAP: Record<string, string> = {
    planner: '规划阶段',
    mutation: '校验阶段',
    apply: '写入阶段',
};

const SUMMARY_PLANNER_FIELD_LABEL_MAP: Record<string, string> = {
    shouldupdate: '是否需要更新',
    focustypes: '聚焦类型',
    entities: '关联实体',
    topics: '核心主题',
};

const NARRATIVE_STYLE_LABEL_MAP: Record<string, string> = {
    modern: '现代',
    ancient: '古风',
    fantasy: '奇幻',
    trpg: '跑团',
    gangster: '黑帮',
    general: '通用',
};

const NARRATIVE_STYLE_SOURCE_LABEL_MAP: Record<string, string> = {
    binding: '已绑定画像',
    detection: '即时识别',
    fallback: '默认回退',
    mixed: '混合判断',
};

const PROMPT_STATS_LABEL_MAP: Record<string, string> = {
    preview_total_chars: '预览总字符数',
    active_schema_count: '活跃类型数',
    schema_list: '类型列表',
};

/**
 * 功能：将原始变更动作标识转换为中文标题。
 * @param action 原始动作标识。
 * @returns 中文动作标题。
 */
export function resolveMutationActionLabel(action: string): string {
    const normalized = normalizeDiagnosticsIdentifier(action);
    if (!normalized) {
        return '未命名动作';
    }
    return MUTATION_ACTION_LABEL_MAP[normalized] ?? action;
}

/**
 * 功能：将变更摘要字段值转换为更适合面板显示的中文。
 * @param fieldKey 字段键名。
 * @param value 原始字段值。
 * @returns 中文显示值。
 */
export function resolveMutationSummaryFieldValue(fieldKey: string, value: unknown): string {
    const normalizedField = normalizeDiagnosticsIdentifier(fieldKey);
    if (normalizedField === 'worldprofile' || normalizedField === 'primaryprofile') {
        return resolveWorldProfileLabel(String(value ?? ''));
    }
    return String(value ?? '').trim();
}

/**
 * 功能：将 Trace 阶段标识转换为中文。
 * @param stage Trace 阶段标识。
 * @returns 中文阶段名称。
 */
export function resolveTraceStageLabel(stage: string): string {
    const normalized = normalizeDiagnosticsIdentifier(stage);
    if (!normalized) {
        return '未知阶段';
    }
    return TRACE_STAGE_LABEL_MAP[normalized] ?? stage;
}

/**
 * 功能：将 Trace 级别标识转换为中文。
 * @param level Trace 级别标识。
 * @returns 中文级别名称。
 */
export function resolveTraceLevelLabel(level: string): string {
    const normalized = normalizeDiagnosticsIdentifier(level);
    if (!normalized) {
        return '信息';
    }
    return TRACE_LEVEL_LABEL_MAP[normalized] ?? level;
}

/**
 * 功能：按类型返回 Trace 面板标题。
 * @param kind 面板类型。
 * @returns 中文标题。
 */
export function resolveTracePanelTitle(kind: 'currentRecall' | 'latestInjection'): string {
    return kind === 'currentRecall' ? '当前召回跟踪' : '最近注入跟踪';
}

/**
 * 功能：按类型返回 Trace 空状态文案。
 * @param kind 面板类型。
 * @returns 中文空态文案。
 */
export function resolveTraceEmptyText(kind: 'currentRecall' | 'latestInjection'): string {
    return kind === 'currentRecall'
        ? '当前预览还没有召回跟踪记录。'
        : '当前还没有最近一次注入的跟踪记录。';
}

/**
 * 功能：返回总结阶段详情卡片的中文标题。
 * @param kind 阶段类型。
 * @returns 中文标题。
 */
export function resolveSummaryStageLabel(kind: 'planner' | 'mutation' | 'apply'): string {
    return SUMMARY_STAGE_LABEL_MAP[kind] ?? kind;
}

/**
 * 功能：返回规划阶段字段的中文标签。
 * @param key 字段键名。
 * @returns 中文标签。
 */
export function resolveSummaryPlannerFieldLabel(key: string): string {
    const normalized = normalizeDiagnosticsIdentifier(key);
    return SUMMARY_PLANNER_FIELD_LABEL_MAP[normalized] ?? key;
}

/**
 * 功能：将叙事风格标识转换为中文。
 * @param style 风格标识。
 * @returns 中文风格名称。
 */
export function resolveNarrativeStyleLabel(style: string): string {
    const normalized = normalizeDiagnosticsIdentifier(style);
    if (!normalized) {
        return '暂无';
    }
    return NARRATIVE_STYLE_LABEL_MAP[normalized] ?? style;
}

/**
 * 功能：将叙事风格来源转换为中文。
 * @param source 来源标识。
 * @returns 中文来源名称。
 */
export function resolveNarrativeStyleSourceLabel(source: string): string {
    const normalized = normalizeDiagnosticsIdentifier(source);
    if (!normalized) {
        return '暂无';
    }
    return NARRATIVE_STYLE_SOURCE_LABEL_MAP[normalized] ?? source;
}

/**
 * 功能：返回总结失败所处阶段的中文名称。
 * @param reasonCode 原因码。
 * @returns 中文阶段名称。
 */
export function resolveSummaryFailureStageLabel(reasonCode: string): string {
    const normalized = normalizeDiagnosticsIdentifier(reasonCode);
    if (normalized.startsWith('validation_failed')) {
        return '结构校验';
    }
    if (normalized.includes('llm')) {
        return '模型请求';
    }
    return '其他阶段';
}

/**
 * 功能：返回提示词统计区块的中文标签。
 * @param key 标签键名。
 * @returns 中文标签。
 */
export function resolvePromptStatsLabel(key: 'preview_total_chars' | 'active_schema_count' | 'schema_list'): string {
    return PROMPT_STATS_LABEL_MAP[key] ?? key;
}

/**
 * 功能：标准化诊断标识符。
 * @param value 原始值。
 * @returns 标准化后的标识符。
 */
function normalizeDiagnosticsIdentifier(value: string): string {
    return String(value ?? '').trim().toLowerCase();
}
