const RECALL_SOURCE_LABEL_MAP: Record<string, string> = {
    unified_memory: '统一记忆',
    prompt_injection_pipeline: '提示词注入链路',
};

const RETRIEVAL_PROVIDER_LABEL_MAP: Record<string, string> = {
    lexical_bm25: '词法检索',
};

const RETRIEVAL_RULE_PACK_LABEL_MAP: Record<string, string> = {
    hybrid: '混合规则包',
    native: '原生规则包',
    perocore: 'PeroCore 兼容包',
};

const RECALL_REASON_CODE_LABEL_MAP: Record<string, string> = {
    inserted: '已插入提示词',
    not_inserted: '未插入提示词',
    prompt_injection_disabled: '提示词注入已禁用',
    preview_disabled: '预览功能已禁用',
    empty_content: '内容为空',
    system_base_present: '存在系统基底文本',
    system_base_empty: '系统基底文本为空',
    prompt_injection_preview: '提示词注入预览',
};

/**
 * 功能：将注入说明来源标识转换为中文。
 * @param source 来源标识。
 * @returns 中文来源名称。
 */
export function resolveRecallSourceLabel(source: string): string {
    const normalized = normalizeLocaleIdentifier(source);
    if (!normalized) {
        return '暂无';
    }
    return RECALL_SOURCE_LABEL_MAP[normalized] ?? source;
}

/**
 * 功能：将检索器标识转换为中文。
 * @param providerId 检索器标识。
 * @returns 中文检索器名称。
 */
export function resolveRetrievalProviderLabel(providerId: string): string {
    const normalized = normalizeLocaleIdentifier(providerId);
    if (!normalized) {
        return '暂无';
    }
    return RETRIEVAL_PROVIDER_LABEL_MAP[normalized] ?? providerId;
}

/**
 * 功能：将规则包标识转换为中文。
 * @param rulePack 规则包标识。
 * @returns 中文规则包名称。
 */
export function resolveRetrievalRulePackLabel(rulePack: string): string {
    const normalized = normalizeLocaleIdentifier(rulePack);
    if (!normalized) {
        return '暂无';
    }
    return RETRIEVAL_RULE_PACK_LABEL_MAP[normalized] ?? rulePack;
}

/**
 * 功能：将注入说明原因码转换为中文。
 * @param reasonCode 原因码。
 * @returns 中文原因说明。
 */
export function resolveRecallReasonCodeLabel(reasonCode: string): string {
    const normalized = normalizeLocaleIdentifier(reasonCode);
    if (!normalized) {
        return '未知';
    }
    if (RECALL_REASON_CODE_LABEL_MAP[normalized]) {
        return RECALL_REASON_CODE_LABEL_MAP[normalized];
    }
    if (normalized.startsWith('prompt:')) {
        return resolveRecallReasonCodeLabel(normalized.slice('prompt:'.length));
    }
    return reasonCode;
}

/**
 * 功能：将注入文本分组标题转换为中文。
 * @param key 原始分组键。
 * @returns 中文标题。
 */
export function resolvePromptBlockTitle(key: string): string {
    const normalized = normalizeLocaleIdentifier(key);
    if (normalized === 'systemtext') {
        return '系统注入文本';
    }
    if (normalized === 'finaltext') {
        return '最终注入文本';
    }
    if (normalized === 'roletext') {
        return '角色注入文本';
    }
    return key;
}

/**
 * 功能：标准化本地化标识符。
 * @param value 原始值。
 * @returns 标准化后的标识符。
 */
function normalizeLocaleIdentifier(value: string): string {
    return String(value ?? '').trim().toLowerCase();
}
