/**
 * 功能：定义 compareKey 协议版本。
 */
export const COMPARE_KEY_SCHEMA_VERSION = 'v2';

/**
 * 功能：定义支持 compareKey 协议的实体类型。
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
    'event',
]);

/**
 * 功能：定义 compareKey 协议实体类型。
 */
export type CompareKeyEntityType =
    | 'actor_profile'
    | 'organization'
    | 'city'
    | 'nation'
    | 'location'
    | 'relationship'
    | 'world_global_state'
    | 'task'
    | 'event';

/**
 * 功能：定义 compareKey 解析结果。
 */
export interface ParsedCompareKey {
    raw: string;
    schemaVersion: string;
    entityType: string;
    canonicalName: string;
    qualifiers: string[];
    parts: string[];
    sourceActorKey?: string;
    targetActorKey?: string;
    relationTag?: string;
}

/**
 * 功能：定义 compareKey 构建选项。
 */
export interface BuildCompareKeyOptions {
    aliases?: unknown;
    qualifier?: string;
    qualifiers?: unknown;
    sourceActorKey?: string;
    targetActorKey?: string;
    relationTag?: string;
    canonicalName?: string;
}

/**
 * 功能：判断是否支持 compareKey 协议。
 * @param entryType 条目类型
 * @returns 是否支持
 */
export function supportsCompareKey(entryType: string): boolean {
    return COMPARE_KEY_ENTITY_TYPES.has(normalizeText(entryType));
}

/**
 * 功能：构建 compareKey。
 * @param entityType 实体类型
 * @param title 标题
 * @param fields 字段
 * @returns compareKey
 */
export function buildCompareKey(entityType: string, title: string, fields?: Record<string, unknown>): string {
    const normalizedType = normalizeText(entityType) as CompareKeyEntityType;
    const safeFields = toRecord(fields);
    switch (normalizedType) {
        case 'actor_profile':
            return buildActorCompareKey(String(safeFields.actorKey ?? title ?? ''));
        case 'organization':
            return buildOrganizationCompareKey(title, {
                qualifier: firstNonEmptyText([
                    safeFields.qualifier,
                    safeFields.subtype,
                    safeFields.city,
                    safeFields.nation,
                    safeFields.region,
                ]),
                aliases: safeFields.aliases,
            });
        case 'city':
            return buildCityCompareKey(title, {
                qualifier: firstNonEmptyText([safeFields.nation, safeFields.region]),
                aliases: safeFields.aliases,
            });
        case 'nation':
            return buildNationCompareKey(title, {
                aliases: safeFields.aliases,
            });
        case 'location':
            return buildLocationCompareKey(title, {
                qualifier: firstNonEmptyText([
                    safeFields.city,
                    safeFields.nation,
                    safeFields.region,
                    safeFields.parentLocation,
                ]),
                aliases: safeFields.aliases,
            });
        case 'relationship':
            return buildRelationshipCompareKey(
                String(safeFields.sourceActorKey ?? ''),
                String(safeFields.targetActorKey ?? ''),
                String(safeFields.relationTag ?? safeFields.state ?? ''),
            );
        case 'world_global_state':
            return buildWorldStateCompareKey(title, {
                qualifier: firstNonEmptyText([safeFields.scope, safeFields.region, safeFields.location]),
                aliases: safeFields.aliases,
            });
        case 'task':
            return buildTaskCompareKey(title, {
                qualifier: firstNonEmptyText([safeFields.location, safeFields.stage, safeFields.objective]),
                aliases: safeFields.aliases,
            });
        case 'event':
            return buildEventCompareKey(title, {
                qualifier: firstNonEmptyText([safeFields.time, safeFields.location, safeFields.stage]),
                aliases: safeFields.aliases,
            });
        default:
            return buildFallbackCompareKey(entityType, title, safeFields);
    }
}

/**
 * 功能：构建 actor compareKey。
 * @param actorKey 角色键
 * @returns compareKey
 */
export function buildActorCompareKey(actorKey: string): string {
    const canonicalName = normalizeIdentifier(actorKey);
    return packCompareKey('actor_profile', canonicalName, []);
}

/**
 * 功能：构建 organization compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildOrganizationCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('organization', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：构建 city compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildCityCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('city', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：构建 nation compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildNationCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('nation', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：构建 location compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildLocationCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('location', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：构建 relationship compareKey。
 * @param sourceActorKey 源角色键
 * @param targetActorKey 目标角色键
 * @param relationTag 关系标签
 * @returns compareKey
 */
export function buildRelationshipCompareKey(sourceActorKey: string, targetActorKey: string, relationTag?: string): string {
    const normalizedSource = normalizeIdentifier(sourceActorKey);
    const normalizedTarget = normalizeIdentifier(targetActorKey);
    const normalizedTag = normalizeCanonicalName(relationTag || 'related');
    return packCompareKey('relationship', `${normalizedSource}~${normalizedTarget}`, [normalizedTag]);
}

/**
 * 功能：构建 world_global_state compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildWorldStateCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('world_global_state', resolveCanonicalName(title, options.aliases), resolveQualifiers({
        ...options,
        qualifier: options.qualifier || 'global',
    }));
}

/**
 * 功能：构建 task compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildTaskCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('task', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：构建 event compareKey。
 * @param title 标题
 * @param options 构建选项
 * @returns compareKey
 */
export function buildEventCompareKey(title: string, options: BuildCompareKeyOptions = {}): string {
    return packCompareKey('event', resolveCanonicalName(title, options.aliases), resolveQualifiers(options));
}

/**
 * 功能：解析 compareKey。
 * @param compareKey 原始 compareKey
 * @returns 解析结果
 */
export function parseCompareKey(compareKey: string): ParsedCompareKey {
    const raw = normalizeText(compareKey);
    const parts = raw.split(':').map((item: string): string => normalizeText(item)).filter(Boolean);
    if (parts.length < 4 || parts[0] !== 'ck') {
        return {
            raw,
            schemaVersion: '',
            entityType: normalizeText(parts[0]),
            canonicalName: normalizeCanonicalName(parts.slice(1).join(':')),
            qualifiers: [],
            parts,
        };
    }
    const [, schemaVersion, entityType, ...rest] = parts;
    const canonicalName = rest[0] ?? '';
    const qualifiers = rest.slice(1);
    const parsed: ParsedCompareKey = {
        raw,
        schemaVersion,
        entityType,
        canonicalName,
        qualifiers,
        parts,
    };
    if (entityType === 'relationship') {
        const [sourceActorKey = '', targetActorKey = ''] = canonicalName.split('~');
        parsed.sourceActorKey = sourceActorKey;
        parsed.targetActorKey = targetActorKey;
        parsed.relationTag = qualifiers[0] ?? '';
    }
    return parsed;
}

/**
 * 功能：判断两个 compareKey 是否完全匹配。
 * @param keyA compareKey A
 * @param keyB compareKey B
 * @returns 是否匹配
 */
export function compareKeysMatch(keyA: string, keyB: string): boolean {
    const left = normalizeText(keyA);
    const right = normalizeText(keyB);
    return Boolean(left) && left === right;
}

/**
 * 功能：判断两个 compareKey 是否近似匹配。
 * @param keyA compareKey A
 * @param keyB compareKey B
 * @returns 是否近似
 */
export function compareKeysNearMatch(keyA: string, keyB: string): boolean {
    const left = parseCompareKey(keyA);
    const right = parseCompareKey(keyB);
    if (!left.entityType || left.entityType !== right.entityType) {
        return false;
    }
    if (left.schemaVersion && right.schemaVersion && left.schemaVersion !== right.schemaVersion) {
        return false;
    }
    if (left.entityType === 'relationship') {
        return left.sourceActorKey === right.sourceActorKey
            && left.targetActorKey === right.targetActorKey
            && normalizeCanonicalName(left.relationTag) === normalizeCanonicalName(right.relationTag);
    }
    if (left.canonicalName !== right.canonicalName) {
        return false;
    }
    if (left.qualifiers.length <= 0 || right.qualifiers.length <= 0) {
        return false;
    }
    return left.qualifiers.some((item: string): boolean => right.qualifiers.includes(item));
}

/**
 * 功能：构建模糊匹配键。
 * @param entityType 实体类型
 * @param title 标题
 * @param aliases 别名
 * @param qualifiers 限定信息
 * @returns 匹配键列表
 */
export function buildMatchKeys(
    entityType: string,
    title: string,
    aliases?: unknown,
    qualifiers?: unknown,
): string[] {
    const normalizedType = normalizeText(entityType);
    const canonicalName = resolveCanonicalName(title, aliases);
    const qualifierList = normalizeStringArray(qualifiers).map(normalizeCanonicalName).filter(Boolean);
    const names = Array.from(new Set([
        canonicalName,
        ...normalizeStringArray(aliases).map(normalizeCanonicalName),
    ].filter(Boolean)));
    const result = new Set<string>();
    for (const name of names) {
        result.add(`mk:${normalizedType}:${name}`);
        for (const qualifier of qualifierList) {
            result.add(`mk:${normalizedType}:${qualifier}:${name}`);
        }
    }
    return [...result];
}

/**
 * 功能：标准化标题文本。
 * @param title 原始标题
 * @returns 标准化结果
 */
export function normalizeCompareTitle(title: string): string {
    return normalizeCanonicalName(title);
}

/**
 * 功能：封装 compareKey。
 * @param entityType 实体类型
 * @param canonicalName 规范名称
 * @param qualifiers 限定信息
 * @returns compareKey
 */
function packCompareKey(entityType: CompareKeyEntityType, canonicalName: string, qualifiers: string[]): string {
    const safeCanonicalName = normalizeCanonicalName(canonicalName) || 'unknown';
    const safeQualifiers = qualifiers.map(normalizeCanonicalName).filter(Boolean);
    return ['ck', COMPARE_KEY_SCHEMA_VERSION, entityType, safeCanonicalName, ...safeQualifiers].join(':');
}

/**
 * 功能：构建兜底 compareKey。
 * @param entityType 实体类型
 * @param title 标题
 * @param fields 字段
 * @returns compareKey
 */
function buildFallbackCompareKey(entityType: string, title: string, fields: Record<string, unknown>): string {
    const qualifier = firstNonEmptyText([
        fields.qualifier,
        fields.scope,
        fields.location,
        fields.region,
        fields.nation,
        fields.city,
    ]);
    const fallbackType = normalizeText(entityType) || 'other';
    const canonicalName = resolveCanonicalName(title, fields.aliases);
    const safeQualifier = normalizeCanonicalName(qualifier || `tmp_${fallbackType}`);
    return ['ck', COMPARE_KEY_SCHEMA_VERSION, fallbackType, canonicalName || 'unknown', safeQualifier].join(':');
}

/**
 * 功能：解析规范名称。
 * @param title 标题
 * @param aliases 别名
 * @returns 规范名称
 */
function resolveCanonicalName(title: string, aliases?: unknown): string {
    const values = [
        normalizeCanonicalName(title),
        ...normalizeStringArray(aliases).map(normalizeCanonicalName),
    ].filter(Boolean);
    if (values.length <= 0) {
        return 'unknown';
    }
    return values.sort((left: string, right: string): number => {
        if (left.length !== right.length) {
            return left.length - right.length;
        }
        return left.localeCompare(right, 'zh-CN');
    })[0];
}

/**
 * 功能：解析限定信息。
 * @param options 构建选项
 * @returns 限定列表
 */
function resolveQualifiers(options: BuildCompareKeyOptions): string[] {
    return Array.from(new Set([
        ...normalizeStringArray(options.qualifiers),
        normalizeText(options.qualifier),
    ].map(normalizeCanonicalName).filter(Boolean)));
}

/**
 * 功能：标准化规范名称。
 * @param value 原始值
 * @returns 标准化结果
 */
function normalizeCanonicalName(value: unknown): string {
    const normalizedWidth = toHalfWidth(normalizeText(value));
    const unifiedPunctuation = normalizedWidth
        .replace(/[“”„‟＂]/g, '"')
        .replace(/[‘’‚‛＇]/g, '\'')
        .replace(/[，、﹐﹑]/g, ',')
        .replace(/[：﹕]/g, ':')
        .replace(/[；﹔]/g, ';')
        .replace(/[（［【]/g, '(')
        .replace(/[）］】]/g, ')')
        .replace(/[。｡]/g, '.')
        .replace(/[！﹗]/g, '!')
        .replace(/[？﹖]/g, '?')
        .replace(/[·•・]/g, ' ')
        .replace(/[_\-]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ');
    return unifiedPunctuation
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s/g, '');
}

/**
 * 功能：标准化标识符。
 * @param value 原始值
 * @returns 标识符
 */
function normalizeIdentifier(value: unknown): string {
    return toHalfWidth(normalizeText(value))
        .toLowerCase()
        .replace(/[^a-z0-9_\-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'unknown';
}

/**
 * 功能：优先取第一个非空文本。
 * @param values 候选值列表
 * @returns 非空文本
 */
function firstNonEmptyText(values: unknown[]): string {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized) {
            return normalized;
        }
    }
    return '';
}

/**
 * 功能：标准化字符串数组。
 * @param value 原始值
 * @returns 字符串数组
 */
function normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
    }
    const text = normalizeText(value);
    if (!text) {
        return [];
    }
    return Array.from(new Set(text.split(/[,，;；/|]+/).map((item: string): string => normalizeText(item)).filter(Boolean)));
}

/**
 * 功能：安全转换对象。
 * @param value 原始值
 * @returns 对象
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：标准化文本。
 * @param value 原始值
 * @returns 文本
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：将全角字符转换为半角字符。
 * @param value 原始文本
 * @returns 转换结果
 */
function toHalfWidth(value: string): string {
    return value.replace(/[\uFF01-\uFF5E]/g, (char: string): string => {
        return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
}
