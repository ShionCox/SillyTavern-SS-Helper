/**
 * 功能：统一实体协议 — 实体 Schema 定义。
 * 把角色、组织、教派、城市、国家、地点统一纳入同一套实体协议。
 */

/**
 * 功能：实体类型枚举。
 */
export type EntityLedgerType = 'actor_profile' | 'organization' | 'city' | 'nation' | 'location';

/**
 * 功能：状态账本类型枚举。
 */
export type StateLedgerType =
    | 'relationship'
    | 'task'
    | 'world_core_setting'
    | 'world_hard_rule'
    | 'world_global_state'
    | 'event'
    | 'scene_shared_state';

/**
 * 功能：摘要/索引类型枚举。
 */
export type DigestLedgerType = 'chapterDigest' | 'rollingDigest' | 'activeSnapshot' | 'takeoverBatchOutput';

/**
 * 功能：所有实体账本类型集合。
 */
export const ENTITY_LEDGER_TYPES: ReadonlySet<string> = new Set<EntityLedgerType>([
    'actor_profile',
    'organization',
    'city',
    'nation',
    'location',
]);

/**
 * 功能：所有状态账本类型集合。
 */
export const STATE_LEDGER_TYPES: ReadonlySet<string> = new Set<StateLedgerType>([
    'relationship',
    'task',
    'world_core_setting',
    'world_hard_rule',
    'world_global_state',
    'event',
    'scene_shared_state',
]);

/**
 * 功能：高价值实体类型集合，不允许轻易删除。
 */
export const HIGH_VALUE_ENTITY_TYPES: ReadonlySet<string> = new Set([
    'actor_profile',
    'organization',
    'city',
    'nation',
    'location',
    'relationship',
    'world_core_setting',
    'world_hard_rule',
]);

/**
 * 功能：判断某类型是否属于实体账本。
 * @param entryType 条目类型。
 * @returns 是否属于实体账本。
 */
export function isEntityLedgerType(entryType: string): boolean {
    return ENTITY_LEDGER_TYPES.has(String(entryType ?? '').trim());
}

/**
 * 功能：判断某类型是否属于状态账本。
 * @param entryType 条目类型。
 * @returns 是否属于状态账本。
 */
export function isStateLedgerType(entryType: string): boolean {
    return STATE_LEDGER_TYPES.has(String(entryType ?? '').trim());
}

/**
 * 功能：判断某类型是否属于高价值实体。
 * @param entryType 条目类型。
 * @returns 是否属于高价值实体。
 */
export function isHighValueEntityType(entryType: string): boolean {
    return HIGH_VALUE_ENTITY_TYPES.has(String(entryType ?? '').trim());
}

/**
 * 功能：organization 实体字段定义。
 */
export interface OrganizationEntityFields {
    subtype?: string;
    aliases?: string[];
    alignment?: string;
    influence?: string;
    baseCity?: string;
    baseNation?: string;
    leader?: string;
    traits?: string[];
    status?: string;
}

/**
 * 功能：city 实体字段定义。
 */
export interface CityEntityFields {
    nation?: string;
    region?: string;
    aliases?: string[];
    traits?: string[];
    governance?: string;
    status?: string;
}

/**
 * 功能：nation 实体字段定义。
 */
export interface NationEntityFields {
    region?: string;
    aliases?: string[];
    regime?: string;
    diplomacy?: string;
    traits?: string[];
    status?: string;
}

/**
 * 功能：location 实体字段定义。
 */
export interface LocationEntityFields {
    city?: string;
    nation?: string;
    aliases?: string[];
    function?: string;
    entryCondition?: string;
    traits?: string[];
    status?: string;
}

/**
 * 功能：冷启动实体卡定义。
 */
export interface ColdStartEntityCard {
    entityType: EntityLedgerType;
    compareKey: string;
    title: string;
    aliases?: string[];
    summary: string;
    fields?: Record<string, unknown>;
}
