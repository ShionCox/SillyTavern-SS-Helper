const ENTRY_TYPE_LABEL_MAP: Record<string, string> = {
    task: '任务',
    relationship: '关系',
    event: '事件',
    location: '地点',
    item: '物品',
    actor_profile: '角色画像',
    character_profile: '角色档案',
    world_rule: '世界规则',
    identity_constraint: '身份约束',
    persistent_goal: '长期目标',
    initial_state: '初始状态',
    location_fact: '地点事实',
    timeline_fact: '时间线事实',
    preference: '偏好',
    other: '其他',
    unknown: '未知',
};

const ACTION_TYPE_LABEL_MAP: Record<string, string> = {
    add: '新增',
    update: '更新',
    merge: '合并',
    invalidate: '失效',
    delete: '删除',
    noop: '无需操作',
    summary_failed: '总结失败',
    unknown: '未知',
};

const FAILURE_REASON_LABEL_MAP: Record<string, string> = {
    unknown: '未知原因',
    validation_failed: '结构校验失败',
    planner_noop: '规划阶段判定无需更新',
};

const IDENTIFIER_TOKEN_LABEL_MAP: Record<string, string> = {
    actor: '角色',
    profile: '画像',
    character: '角色',
    world: '世界',
    rule: '规则',
    core: '核心',
    global: '全局',
    scope: '范围',
    state: '状态',
    scene: '场景',
    shared: '共享',
    visible: '可见',
    visibility: '可见',
    private: '私有',
    interpretation: '理解',
    relation: '关系',
    relationship: '关系',
    event: '事件',
    task: '任务',
    item: '物品',
    location: '地点',
    fact: '事实',
    identity: '身份',
    constraint: '约束',
    persistent: '长期',
    goal: '目标',
    initial: '初始',
    timeline: '时间线',
    preference: '偏好',
    source: '来源',
    summary: '总结',
    binding: '绑定',
    owner: '拥有者',
    mentioned: '提及',
    ref: '引用',
    key: '键',
    participants: '参与者',
    nation: '国家',
    city: '城市',
    organization: '组织',
    add: '新增',
    update: '更新',
    merge: '合并',
    invalidate: '失效',
    delete: '删除',
    failed: '失败',
    planner: '规划',
    validation: '校验',
    legacy: '旧版',
    other: '其他',
    unknown: '未知',
};

/**
 * 功能：将词条类型标识转换为中文。
 * @param entryType 词条类型标识。
 * @returns 中文类型名称。
 */
export function resolveEntryTypeLabel(entryType: string): string {
    const normalized = normalizeEntryIdentifier(entryType);
    if (!normalized) {
        return '未知';
    }
    if (normalized === 'nation') {
        return '国家';
    }
    if (normalized === 'city') {
        return '城市';
    }
    if (normalized === 'organization') {
        return '组织';
    }
    if (normalized === 'world_core_setting') {
        return '世界核心设定';
    }
    if (normalized === 'world_hard_rule') {
        return '世界硬规则';
    }
    if (normalized === 'world_global_state') {
        return '世界全局状态';
    }
    return ENTRY_TYPE_LABEL_MAP[normalized] ?? formatIdentifierLabel(normalized, entryType);
}

/**
 * 功能：将动作类型标识转换为中文。
 * @param actionType 动作类型标识。
 * @returns 中文动作名称。
 */
export function resolveEntryActionTypeLabel(actionType: string): string {
    const normalized = normalizeEntryIdentifier(actionType);
    if (!normalized) {
        return '未记录';
    }
    return ACTION_TYPE_LABEL_MAP[normalized] ?? formatIdentifierLabel(normalized, actionType);
}

/**
 * 功能：将失败原因标识转换为中文。
 * @param reason 失败原因标识。
 * @returns 中文失败原因。
 */
export function resolveFailureReasonLabel(reason: string): string {
    const normalized = normalizeEntryIdentifier(reason);
    if (!normalized) {
        return '未知原因';
    }
    if (normalized.startsWith('validation_failed')) {
        return '结构校验失败';
    }
    if (FAILURE_REASON_LABEL_MAP[normalized]) {
        return FAILURE_REASON_LABEL_MAP[normalized];
    }
    return formatIdentifierLabel(normalized, reason);
}

/**
 * 功能：将通用内部标识转换为可读中文。
 * @param identifier 内部标识。
 * @returns 中文标签或原始值。
 */
export function resolveEntryIdentifierLabel(identifier: string): string {
    const normalized = normalizeEntryIdentifier(identifier);
    if (!normalized) {
        return '未知';
    }
    return formatIdentifierLabel(normalized, identifier);
}

/**
 * 功能：标准化词条相关标识符。
 * @param value 原始值。
 * @returns 标准化后的标识符。
 */
function normalizeEntryIdentifier(value: string): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：将下划线风格的内部标识转换为可读中文。
 * @param normalized 标准化后的标识。
 * @param fallback 原始值。
 * @returns 中文标签或原始值。
 */
function formatIdentifierLabel(normalized: string, fallback: string): string {
    const tokens = normalized
        .split(/[_-]+/)
        .map((token: string): string => token.trim())
        .filter((token: string): boolean => token.length > 0);
    if (tokens.length === 0) {
        return fallback || '未知';
    }
    const translated = tokens.map((token: string): string => IDENTIFIER_TOKEN_LABEL_MAP[token] ?? token);
    const joined = translated.join('');
    return /[a-z]/i.test(joined) ? (fallback || joined) : joined;
}
