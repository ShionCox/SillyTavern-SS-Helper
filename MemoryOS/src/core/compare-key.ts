/**
 * 功能：统一实体协议 — compareKey 生成与解析。
 * 为所有一等实体提供统一 compareKey，确保跨链路唯一识别。
 */

/**
 * 功能：支持 compareKey 的实体类型。
 */
const COMPARE_KEY_ENTITY_TYPES = new Set([
    'actor_profile',
    'organization',
    'city',
    'nation',
    'location',
    'relationship',
    'world_global_state',
    'task',
]);

/**
 * 功能：解析后的 compareKey 结构。
 */
export interface ParsedCompareKey {
    entityType: string;
    qualifier?: string;
    normalizedTitle: string;
    raw: string;
}

/**
 * 功能：标准化标题文本用于 compareKey。
 * @param title 原始标题。
 * @returns 归一化后的标题。
 */
function normalizeTitle(title: string): string {
    return String(title ?? '').trim().replace(/\s+/g, '');
}

/**
 * 功能：为 actor_profile 生成 compareKey。
 * @param actorKey 角色键。
 * @returns compareKey。
 */
export function buildActorCompareKey(actorKey: string): string {
    return `actor_profile:${String(actorKey ?? '').trim()}`;
}

/**
 * 功能：为 organization 生成 compareKey。
 * @param title 组织名。
 * @param subtype 可选子类型。
 * @returns compareKey。
 */
export function buildOrganizationCompareKey(title: string, subtype?: string): string {
    const normalizedSubtype = String(subtype ?? '').trim();
    if (normalizedSubtype) {
        return `organization:${normalizedSubtype}:${normalizeTitle(title)}`;
    }
    return `organization:${normalizeTitle(title)}`;
}

/**
 * 功能：为 city 生成 compareKey。
 * @param title 城市名。
 * @param nationOrRegion 可选国家/区域。
 * @returns compareKey。
 */
export function buildCityCompareKey(title: string, nationOrRegion?: string): string {
    const qualifier = String(nationOrRegion ?? '').trim();
    if (qualifier) {
        return `city:${normalizeTitle(qualifier)}:${normalizeTitle(title)}`;
    }
    return `city:${normalizeTitle(title)}`;
}

/**
 * 功能：为 nation 生成 compareKey。
 * @param title 国家名。
 * @returns compareKey。
 */
export function buildNationCompareKey(title: string): string {
    return `nation:${normalizeTitle(title)}`;
}

/**
 * 功能：为 location 生成 compareKey。
 * @param title 地点名。
 * @param cityOrRegion 可选城市/区域。
 * @returns compareKey。
 */
export function buildLocationCompareKey(title: string, cityOrRegion?: string): string {
    const qualifier = String(cityOrRegion ?? '').trim();
    if (qualifier) {
        return `location:${normalizeTitle(qualifier)}:${normalizeTitle(title)}`;
    }
    return `location:${normalizeTitle(title)}`;
}

/**
 * 功能：为 relationship 生成 compareKey。
 * @param sourceActorKey 源角色键。
 * @param targetActorKey 目标角色键。
 * @returns compareKey。
 */
export function buildRelationshipCompareKey(sourceActorKey: string, targetActorKey: string): string {
    return `relationship:${String(sourceActorKey ?? '').trim()}:${String(targetActorKey ?? '').trim()}`;
}

/**
 * 功能：为 world_global_state 生成 compareKey。
 * @param title 标题。
 * @param scope 作用域。
 * @returns compareKey。
 */
export function buildWorldStateCompareKey(title: string, scope?: string): string {
    const normalizedScope = String(scope ?? 'global').trim();
    return `world_global_state:${normalizedScope}:${normalizeTitle(title)}`;
}

/**
 * 功能：为 task 生成 compareKey。
 * @param title 任务名。
 * @returns compareKey。
 */
export function buildTaskCompareKey(title: string): string {
    return `task:${normalizeTitle(title)}`;
}

/**
 * 功能：根据实体类型和字段自动生成 compareKey。
 * @param entityType 实体类型。
 * @param title 标题。
 * @param fields 可选字段。
 * @returns compareKey。
 */
export function buildCompareKey(entityType: string, title: string, fields?: Record<string, unknown>): string {
    const type = String(entityType ?? '').trim();
    const safeFields = (fields && typeof fields === 'object') ? fields : {};
    switch (type) {
        case 'actor_profile':
            return buildActorCompareKey(String(safeFields.actorKey ?? title ?? ''));
        case 'organization':
            return buildOrganizationCompareKey(title, String(safeFields.subtype ?? ''));
        case 'city':
            return buildCityCompareKey(title, String(safeFields.nation ?? safeFields.region ?? ''));
        case 'nation':
            return buildNationCompareKey(title);
        case 'location':
            return buildLocationCompareKey(title, String(safeFields.city ?? safeFields.nation ?? ''));
        case 'relationship':
            return buildRelationshipCompareKey(
                String(safeFields.sourceActorKey ?? ''),
                String(safeFields.targetActorKey ?? ''),
            );
        case 'world_global_state':
            return buildWorldStateCompareKey(title, String(safeFields.scope ?? ''));
        case 'task':
            return buildTaskCompareKey(title);
        default:
            return `${type}:${normalizeTitle(title)}`;
    }
}

/**
 * 功能：解析 compareKey 为结构化信息。
 * @param compareKey 原始 compareKey。
 * @returns 解析结果。
 */
export function parseCompareKey(compareKey: string): ParsedCompareKey {
    const raw = String(compareKey ?? '').trim();
    const parts = raw.split(':');
    if (parts.length < 2) {
        return { entityType: '', normalizedTitle: raw, raw };
    }
    const entityType = parts[0];
    if (parts.length === 2) {
        return { entityType, normalizedTitle: parts[1], raw };
    }
    return {
        entityType,
        qualifier: parts[1],
        normalizedTitle: parts.slice(2).join(':'),
        raw,
    };
}

/**
 * 功能：判断两个 compareKey 是否指向同一实体。
 * @param keyA 第一个 compareKey。
 * @param keyB 第二个 compareKey。
 * @returns 是否匹配。
 */
export function compareKeysMatch(keyA: string, keyB: string): boolean {
    const a = String(keyA ?? '').trim();
    const b = String(keyB ?? '').trim();
    if (!a || !b) return false;
    return a === b;
}

/**
 * 功能：判断两个 compareKey 是否高度相近（类型相同且标题近似）。
 * @param keyA 第一个 compareKey。
 * @param keyB 第二个 compareKey。
 * @returns 是否近似。
 */
export function compareKeysNearMatch(keyA: string, keyB: string): boolean {
    const parsedA = parseCompareKey(keyA);
    const parsedB = parseCompareKey(keyB);
    if (parsedA.entityType !== parsedB.entityType) return false;
    if (parsedA.normalizedTitle === parsedB.normalizedTitle) return true;
    if (parsedA.normalizedTitle.includes(parsedB.normalizedTitle) || parsedB.normalizedTitle.includes(parsedA.normalizedTitle)) {
        return true;
    }
    return false;
}

/**
 * 功能：判断类型是否支持 compareKey。
 * @param entryType 条目类型。
 * @returns 是否支持。
 */
export function supportsCompareKey(entryType: string): boolean {
    return COMPARE_KEY_ENTITY_TYPES.has(String(entryType ?? '').trim());
}
