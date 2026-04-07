/**
 * 功能：定义关系条目使用的固定 TAG 预设集合。
 */
export const RELATION_TAG_PRESETS = [
    '亲人',
    '朋友',
    '盟友',
    '恋人',
    '暧昧',
    '师徒',
    '上下级',
    '竞争者',
    '情敌',
    '宿敌',
    '陌生人',
] as const;

/**
 * 功能：定义关系 TAG 类型。
 */
export type RelationTag = typeof RELATION_TAG_PRESETS[number];

const RELATION_TAG_SET = new Set<string>(RELATION_TAG_PRESETS);

/**
 * 功能：判断输入值是否为合法的关系 TAG。
 * @param value 待判断的输入值。
 * @returns 是否为合法的关系 TAG。
 */
export function isRelationTag(value: unknown): value is RelationTag {
    return RELATION_TAG_SET.has(String(value ?? '').trim());
}

/**
 * 功能：归一化关系 TAG 文本。
 * @param value 原始输入值。
 * @returns 合法关系 TAG；非法时返回 undefined。
 */
export function normalizeRelationTag(value: unknown): RelationTag | undefined {
    const normalized = String(value ?? '').trim();
    return isRelationTag(normalized) ? normalized : undefined;
}

/**
 * 功能：获取关系 TAG 预设集合的副本。
 * @returns 关系 TAG 预设列表。
 */
export function listRelationTagPresets(): RelationTag[] {
    return [...RELATION_TAG_PRESETS];
}
