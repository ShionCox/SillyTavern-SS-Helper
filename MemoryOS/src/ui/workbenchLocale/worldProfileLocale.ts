import { getWorldProfileById } from '../../memory-world-profile';

const WORLD_PROFILE_LABEL_MAP: Record<string, string> = {
    dark_fantasy_steampunk: '黑暗奇幻蒸汽朋克',
};

const WORLD_TYPE_LABEL_MAP: Record<string, string> = {
    urban_modern: '现代现实',
    ancient_traditional: '古风传统',
    fantasy_magic: '奇幻魔法',
    supernatural_hidden: '现代奇幻',
};

const WORLD_SUBTYPE_LABEL_MAP: Record<string, string> = {
    slice_of_life: '日常生活',
    school: '校园',
    workplace: '职场',
    urban_fantasy: '都市奇幻',
    mystery: '悬疑',
    jianghu: '江湖',
    court: '朝堂',
    wuxia: '武侠',
    high_fantasy: '高奇幻',
    adventure: '冒险',
    myth: '神话',
    magic_decline: '魔法衰退',
    industrial_revolution: '工业革命',
};

const WORLD_REASON_CODE_LABEL_MAP: Record<string, string> = {
    magic_industrial_fusion: '魔导工业融合',
    racial_conflict: '种族冲突',
    steampunk_technology: '蒸汽朋克技术',
    dark_atmosphere: '黑暗氛围',
};

const WORLD_GENRE_LABEL_MAP: Record<string, string> = {
    modern: '现代现实',
    ancient: '古风传统',
    fantasy: '奇幻魔法',
    mixed: '混合世界',
};

const IDENTIFIER_TOKEN_LABEL_MAP: Record<string, string> = {
    dark: '黑暗',
    fantasy: '奇幻',
    steampunk: '蒸汽朋克',
    magic: '魔法',
    industrial: '工业',
    fusion: '融合',
    racial: '种族',
    conflict: '冲突',
    technology: '技术',
    atmosphere: '氛围',
    decline: '衰退',
    revolution: '革命',
    urban: '都市',
    modern: '现代',
    ancient: '古风',
    traditional: '传统',
    supernatural: '超自然',
    hidden: '隐秘',
    school: '校园',
    workplace: '职场',
    scenario: '角色设定',
    worldbook: '世界书',
    author: '作者',
    note: '注记',
    recent: '近期',
    event: '事件',
    query: '查询',
    system: '系统',
    prompt: '提示',
    entry: '条目',
    summary: '摘要',
    generic: '通用',
    style: '风格',
    theme: '主题',
    signal: '信号',
    modern_order: '现代秩序',
    urban_structure: '都市结构',
    ancient_order: '古风秩序',
    lineage_hierarchy: '门第尊卑',
    magic_order: '魔法法则',
    epic_elements: '史诗要素',
    hidden_layers: '表里世界',
    concealed_supernatural: '隐藏超自然',
    mystery: '悬疑',
    jianghu: '江湖',
    court: '朝堂',
    wuxia: '武侠',
    high: '高',
    adventure: '冒险',
    myth: '神话',
    slice: '日常',
    of: '',
    life: '生活',
};

/**
 * 功能：将世界画像标识解析为中文显示名。
 * @param profileId 世界画像标识。
 * @returns 中文显示名。
 */
export function resolveWorldProfileLabel(profileId: string): string {
    const normalized = normalizeIdentifier(profileId);
    if (!normalized) {
        return '未知';
    }
    const profile = getWorldProfileById(normalized);
    if (profile?.displayName) {
        return profile.displayName;
    }
    if (WORLD_PROFILE_LABEL_MAP[normalized]) {
        return WORLD_PROFILE_LABEL_MAP[normalized];
    }
    return resolveIdentifierByDictionary(normalized);
}

/**
 * 功能：将世界画像标识解析为中文世界类型。
 * @param profileId 世界画像标识。
 * @returns 中文世界类型。
 */
export function resolveWorldTypeLabel(profileId: string): string {
    const normalized = normalizeIdentifier(profileId);
    if (!normalized) {
        return '未知';
    }
    const profile = getWorldProfileById(normalized);
    const genre = normalizeIdentifier(profile?.genre ?? '');
    if (genre && WORLD_GENRE_LABEL_MAP[genre]) {
        return WORLD_GENRE_LABEL_MAP[genre];
    }
    if (WORLD_TYPE_LABEL_MAP[normalized]) {
        return WORLD_TYPE_LABEL_MAP[normalized];
    }
    return inferWorldTypeLabel(normalized);
}

/**
 * 功能：将世界细分类别标识解析为中文。
 * @param subType 细分类别标识。
 * @returns 中文细分类别。
 */
export function resolveWorldSubTypeLabel(subType: string): string {
    const normalized = normalizeIdentifier(subType);
    if (!normalized) {
        return '未知';
    }
    if (WORLD_SUBTYPE_LABEL_MAP[normalized]) {
        return WORLD_SUBTYPE_LABEL_MAP[normalized];
    }
    return resolveIdentifierByDictionary(normalized);
}

/**
 * 功能：将世界画像原因码解析为中文。
 * @param reasonCode 原因码。
 * @returns 中文原因说明。
 */
export function resolveWorldReasonCodeLabel(reasonCode: string): string {
    const normalized = normalizeIdentifier(reasonCode);
    if (!normalized) {
        return '未知';
    }
    if (WORLD_REASON_CODE_LABEL_MAP[normalized]) {
        return WORLD_REASON_CODE_LABEL_MAP[normalized];
    }
    if (normalized.startsWith('kw:')) {
        return `关键词命中：${resolveIdentifierByDictionary(normalized.slice(3))}`;
    }
    if (normalized.startsWith('style:')) {
        return `风格线索：${resolveIdentifierByDictionary(normalized.slice(6))}`;
    }
    if (normalized.startsWith('theme:')) {
        return `主题群命中：${resolveIdentifierByDictionary(normalized.slice(6))}`;
    }
    if (normalized.startsWith('signal:')) {
        return `识别来源：${resolveIdentifierByDictionary(normalized.slice(7))}`;
    }
    if (normalized.startsWith('conflict:')) {
        return `冲突线索：${resolveIdentifierByDictionary(normalized.slice(9))}`;
    }
    if (normalized.startsWith('mixed:')) {
        return `混合题材候选：${resolveWorldProfileLabel(normalized.slice(6))}`;
    }
    return resolveIdentifierByDictionary(normalized);
}

/**
 * 功能：将标识符数组批量转为中文并拼接展示。
 * @param labels 原始标识符数组。
 * @param resolver 单个标识符的转译函数。
 * @returns 拼接后的中文文本。
 */
export function resolveWorldIdentifierList(labels: string[], resolver: (value: string) => string): string {
    const resolved = labels
        .map((label: string): string => resolver(label))
        .map((label: string): string => label.trim())
        .filter(Boolean);
    return resolved.length > 0 ? Array.from(new Set(resolved)).join('、') : '暂无';
}

/**
 * 功能：标准化世界画像相关标识符。
 * @param value 原始值。
 * @returns 标准化后的标识符。
 */
function normalizeIdentifier(value: string): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：按词典将下划线标识符尽量转成可读中文。
 * @param identifier 原始标识符。
 * @returns 中文兜底结果。
 */
function resolveIdentifierByDictionary(identifier: string): string {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
        return '未知';
    }
    const translated = normalized
        .split(/[_-]+/)
        .map((token: string): string => translateIdentifierToken(token))
        .filter((token: string): boolean => Boolean(token));
    if (translated.length > 0 && translated.every((token: string): boolean => !/[a-z]/i.test(token))) {
        return translated.join('');
    }
    return identifier;
}

/**
 * 功能：将单个标识符片段转成中文词。
 * @param token 标识符片段。
 * @returns 中文词或原片段。
 */
function translateIdentifierToken(token: string): string {
    const normalized = normalizeIdentifier(token);
    if (!normalized) {
        return '';
    }
    return IDENTIFIER_TOKEN_LABEL_MAP[normalized] ?? token;
}

/**
 * 功能：根据画像标识推断更上层的世界类型，避免与具体画像名重复。
 * @param profileId 世界画像标识。
 * @returns 中文世界类型。
 */
function inferWorldTypeLabel(profileId: string): string {
    const normalized = normalizeIdentifier(profileId);
    if (!normalized) {
        return '未知';
    }
    if (normalized.includes('ancient') || normalized.includes('jianghu') || normalized.includes('wuxia')) {
        return '古风传统';
    }
    if (normalized.includes('urban') || normalized.includes('modern')) {
        return normalized.includes('fantasy') || normalized.includes('magic') || normalized.includes('supernatural')
            ? '现代奇幻'
            : '现代现实';
    }
    if (normalized.includes('fantasy') || normalized.includes('magic') || normalized.includes('myth')) {
        return '奇幻魔法';
    }
    if (normalized.includes('steampunk') || normalized.includes('industrial')) {
        return '混合世界';
    }
    return '混合世界';
}
