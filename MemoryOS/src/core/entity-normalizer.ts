/**
 * 功能：统一实体协议 — 实体归一化工具。
 * 为冷启动、总结、接管提供统一的实体标准化入口。
 */

import { buildCompareKey } from './compare-key';
import { ENTITY_LEDGER_TYPES, type EntityLedgerType } from './entity-schema';

/**
 * 功能：归一化后的实体卡片。
 */
export interface NormalizedEntityCard {
    entityType: EntityLedgerType;
    compareKey: string;
    title: string;
    aliases: string[];
    summary: string;
    fields: Record<string, unknown>;
    lifecycle: {
        status: string;
        createdAt?: number;
        invalidatedAt?: number;
    };
}

/**
 * 功能：从原始数据归一化实体卡片。
 * @param raw 原始实体数据。
 * @returns 归一化后的实体卡片，无效时返回 null。
 */
export function normalizeEntityCard(raw: unknown): NormalizedEntityCard | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const entityType = safeString(record.entityType);
    if (!ENTITY_LEDGER_TYPES.has(entityType)) return null;
    const title = safeString(record.title);
    if (!title) return null;
    const fields = safeRecord(record.fields);
    const compareKey = safeString(record.compareKey) || buildCompareKey(entityType, title, fields);
    const aliases = safeStringArray(record.aliases ?? (fields.aliases as unknown));
    const summary = safeString(record.summary);
    return {
        entityType: entityType as EntityLedgerType,
        compareKey,
        title,
        aliases,
        summary,
        fields,
        lifecycle: {
            status: safeString(record.status) || 'active',
            createdAt: Date.now(),
        },
    };
}

/**
 * 功能：从 entry 的 detailPayload 提取 compareKey。
 * @param entryType 条目类型。
 * @param title 标题。
 * @param detailPayload detail 载荷。
 * @returns compareKey。
 */
export function extractCompareKeyFromEntry(
    entryType: string,
    title: string,
    detailPayload?: Record<string, unknown> | null,
): string {
    const fields = safeRecord(detailPayload?.fields ?? detailPayload);
    return buildCompareKey(entryType, title, fields);
}

/**
 * 功能：从 entry 的 detailPayload 提取别名列表。
 * @param detailPayload detail 载荷。
 * @returns 别名列表。
 */
export function extractAliasesFromEntry(detailPayload?: Record<string, unknown> | null): string[] {
    if (!detailPayload) return [];
    const fields = safeRecord(detailPayload.fields);
    return safeStringArray(fields.aliases ?? detailPayload.aliases);
}

/**
 * 功能：判断标题或别名是否命中目标。
 * @param title 标题。
 * @param aliases 别名列表。
 * @param target 目标名称。
 * @returns 是否命中。
 */
export function matchesTitleOrAlias(title: string, aliases: string[], target: string): boolean {
    const normalizedTarget = safeString(target).toLowerCase();
    if (!normalizedTarget) return false;
    if (safeString(title).toLowerCase() === normalizedTarget) return true;
    for (const alias of aliases) {
        if (safeString(alias).toLowerCase() === normalizedTarget) return true;
    }
    return false;
}

/**
 * 功能：合并两个实体的字段，新值覆盖旧值（除非为空）。
 * @param existing 现有字段。
 * @param incoming 新字段。
 * @returns 合并后的字段。
 */
export function mergeEntityFields(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        if (Array.isArray(value) && Array.isArray(result[key])) {
            const merged = [...new Set([...(result[key] as unknown[]), ...value])];
            result[key] = merged;
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * 功能：安全字符串化。
 */
function safeString(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：安全字符串数组化。
 */
function safeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item: unknown): string => safeString(item))
        .filter((item: string): boolean => item.length > 0);
}

/**
 * 功能：安全 Record 化。
 */
function safeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}
