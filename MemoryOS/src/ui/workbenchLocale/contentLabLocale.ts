const CONTENT_LAB_TEXT_MAP: Record<string, string> = {
    section_title: '内容拆分实验室',
    takeover_split_switch: '楼层内容拆分',
    enable_takeover_content_split: '启用楼层内容拆分',
    takeover_split_switch_desc: '关闭时直接发送每层原内容；开启后，楼层送模会按下方规则拆分主正文、辅助上下文与排除内容。',
    floor_split_switch: '楼层内容拆分总开关',
    floor_split_switch_desc: '开启后接管、自动总结、梦境等楼层处理按规则送模；关闭则发送楼层原内容。',
    tag_registry: '标签注册表',
    no_tag_rules: '暂无标签规则。',
    tag_name: '主标签',
    aliases: '兼容别名',
    pattern: '模式匹配',
    pattern_mode: '模式类型',
    priority: '优先级',
    kind: '归类结果',
    primary_extraction: '纳入主正文',
    hint: '纳入辅助区',
    notes: '备注',
    actions: '操作项',
    edit: '编辑',
    save: '保存',
    add_rule: '新增规则',
    reset_rules: '重置默认',
    export_rules: '导出',
    import_rules: '导入',
    unknown_tag_policy: '未知标签处理',
    default_kind: '默认分类',
    unknown_allow_hint: '未知标签允许进入辅助区',
    classifier_toggles: '分类器开关',
    enable_rule_classifier: '启用规则分类器',
    enable_meta_detection: '启用旁白说明检测',
    enable_tool_detection: '启用工具痕迹检测',
    enable_ai_classifier: '启用智能兜底分类',
    floor_selector: '楼层选择',
    start_floor_placeholder: '起始楼层',
    end_floor_placeholder: '结束楼层',
    selected_floor_placeholder: '预览楼层',
    preview_floor: '预览拆分结果',
    preview_range: '预览范围送模',
    preview_loading: '加载中…',
    preview_range_loading: '处理中…',
    preview_source_mode: '分类依据',
    preview_source_content: '按 content 分类',
    preview_source_raw_visible_text: '按 rawVisibleText 分类',
    available_floors: '可用楼层',
    floor_unit: '层',
    load_chat_hint: '请先开始旧聊天接管或加载聊天数据。',
    raw_content: '原始内容',
    raw_content_empty: '选择楼层后点击“预览拆分结果”查看原始内容。',
    floor_number: '楼层号',
    role: '角色',
    source: '来源',
    char_count: '字符数',
    block_count: '块数',
    has_primary_story: '含主正文',
    hint_only: '仅辅助区',
    excluded_only: '全部排除',
    raw_text: '原始文本',
    raw_text_basis: '预览依据',
    block_preview: '拆分预览',
    block_preview_empty: '暂无拆分结果。',
    block_preview_title_suffix: '块',
    block_id: '块标识',
    tag: '标签',
    resolved_kind: '分类',
    reason: '原因',
    channel_preview: '送模预览',
    channel_preview_empty: '预览楼层后显示三通道分离结果。',
    primary_channel: '主正文',
    hint_channel: '辅助区',
    excluded_channel: '已排除内容',
    empty_value: '无',
    unknown: '未知',
    source_mes: '原始消息正文字段',
    source_content: '原始内容字段',
    source_text: '原始文本字段',
    source_message: '原始消息字段',
    source_display_text: '楼层显示文本',
    source_swipe_display_text: '候选回复显示文本',
    source_unavailable: '未命中原始字段',
    delete: '删除',
    pattern_mode_prefix: '前缀',
    pattern_mode_regex: '正则',
    pattern_mode_none: '无',
};

const CONTENT_LAB_KIND_LABEL_MAP: Record<string, string> = {
    story_primary: '主要正文',
    story_secondary: '补充正文',
    summary: '总结内容',
    tool_artifact: '工具痕迹',
    thought: '思考内容',
    meta_commentary: '旁白说明',
    instruction: '指令内容',
    unknown: '未知类型',
};

const CONTENT_LAB_ROLE_LABEL_MAP: Record<string, string> = {
    user: '用户',
    assistant: '助手',
    system: '系统',
    tool: '工具',
    unknown: '未知',
};

const CONTENT_LAB_REASON_LABEL_MAP: Record<string, string> = {
    tag_registry_match: '命中标签注册表',
    unknown_tag: '未知标签',
    rule_tool_artifact: '命中工具痕迹规则',
    rule_meta_analysis: '命中旁白说明规则',
    rule_instruction: '命中指令规则',
    rule_story_dialogue: '命中对话正文规则',
    default_story_secondary: '默认判为补充正文',
};

const CONTENT_LAB_IDENTIFIER_TOKEN_MAP: Record<string, string> = {
    tag: '标签',
    registry: '注册表',
    match: '匹配',
    unknown: '未知',
    rule: '规则',
    tool: '工具',
    artifact: '痕迹',
    meta: '元信息',
    analysis: '分析',
    instruction: '指令',
    story: '正文',
    dialogue: '对话',
    secondary: '次源',
    primary: '主源',
    thought: '思考',
    summary: '总结',
    commentary: '注释',
};

/**
 * 功能：读取内容拆分实验室固定文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveContentLabText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return CONTENT_LAB_TEXT_MAP[normalized] ?? normalized;
}

/**
 * 功能：将内容块分类标识转换为中文。
 * @param kind 分类标识。
 * @returns 中文名称。
 */
export function resolveContentLabKindLabel(kind: string): string {
    const normalized = String(kind ?? '').trim().toLowerCase();
    if (!normalized) {
        return resolveContentLabText('unknown');
    }
    return CONTENT_LAB_KIND_LABEL_MAP[normalized] ?? formatContentLabIdentifierLabel(normalized, kind);
}

/**
 * 功能：将角色标识转换为中文。
 * @param role 角色标识。
 * @returns 中文名称。
 */
export function resolveContentLabRoleLabel(role: string): string {
    const normalized = String(role ?? '').trim().toLowerCase();
    if (!normalized) {
        return resolveContentLabText('unknown');
    }
    return CONTENT_LAB_ROLE_LABEL_MAP[normalized] ?? formatContentLabIdentifierLabel(normalized, role);
}

/**
 * 功能：将来源字段路径转换为中文。
 * @param source 来源路径。
 * @returns 中文说明。
 */
export function resolveContentLabSourceLabel(source: string): string {
    const normalized = String(source ?? '').trim();
    if (!normalized) {
        return resolveContentLabText('unknown');
    }
    if (normalized === 'mes') {
        return resolveContentLabText('source_mes');
    }
    if (normalized === 'content') {
        return resolveContentLabText('source_content');
    }
    if (normalized === 'text') {
        return resolveContentLabText('source_text');
    }
    if (normalized === 'message') {
        return resolveContentLabText('source_message');
    }
    if (normalized === 'message.display_text' || normalized === 'message.displayText' || normalized === 'message.extra.display_text' || normalized === 'message.extra.displayText') {
        return resolveContentLabText('source_display_text');
    }
    if (normalized === 'unavailable') {
        return resolveContentLabText('source_unavailable');
    }
    const swipeMatch = normalized.match(/^swipes\[(\d+)\]$/);
    if (swipeMatch) {
        return `候选回复[${swipeMatch[1]}]`;
    }
    const swipeDisplayMatch = normalized.match(/^swipe_info\[(\d+)\](?:\.extra)?\.(?:display_text|displayText)$/);
    if (swipeDisplayMatch) {
        return `候选回复[${swipeDisplayMatch[1]}]${resolveContentLabText('source_swipe_display_text')}`;
    }
    return normalized
        .replace(/\bmessage\b/g, '消息对象')
        .replace(/\bextra\b/g, '附加信息')
        .replace(/\bdisplay_text\b/g, '显示文本')
        .replace(/\bdisplayText\b/g, '显示文本')
        .replace(/\bmes\b/g, '消息正文')
        .replace(/\bcontent\b/g, '消息内容')
        .replace(/\btext\b/g, '文本')
        .replace(/swipe_info\[(\d+)\]/g, '候选回复信息[$1]')
        .replace(/swipes\[(\d+)\]/g, '候选回复[$1]');
}

/**
 * 功能：将原因码转换为中文。
 * @param reasonCode 原因码。
 * @returns 中文原因。
 */
export function resolveContentLabReasonCodeLabel(reasonCode: string): string {
    const normalized = String(reasonCode ?? '').trim();
    if (!normalized) {
        return resolveContentLabText('unknown');
    }
    if (normalized.startsWith('tag:')) {
        return `标签：${normalized.slice(4) || resolveContentLabText('unknown')}`;
    }
    const lower = normalized.toLowerCase();
    return CONTENT_LAB_REASON_LABEL_MAP[lower] ?? formatContentLabIdentifierLabel(lower, normalized);
}

/**
 * 功能：将内部标识转换为更易读的中文。
 * @param normalized 标准化后的标识。
 * @param fallback 原始值。
 * @returns 中文标签。
 */
function formatContentLabIdentifierLabel(normalized: string, fallback: string): string {
    const tokens = normalized
        .split(/[_-]+/)
        .map((token: string): string => token.trim())
        .filter((token: string): boolean => token.length > 0);
    if (tokens.length <= 0) {
        return fallback || resolveContentLabText('unknown');
    }
    const translated = tokens.map((token: string): string => CONTENT_LAB_IDENTIFIER_TOKEN_MAP[token] ?? token);
    const joined = translated.join('');
    return /[a-z]/i.test(joined) ? (fallback || joined) : joined;
}
