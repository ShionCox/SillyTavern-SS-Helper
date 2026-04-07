import type { MemoryCompareKeyIndexRecord } from '../db/db';
import type { MemoryEntry } from '../types';
import {
    buildCompareKey,
    buildMatchKeys,
    compareKeysMatch,
    compareKeysNearMatch,
    COMPARE_KEY_SCHEMA_VERSION,
    normalizeCompareTitle,
    parseCompareKey,
    supportsCompareKey,
} from './compare-key';

/**
 * 功能：定义 compareKey 解析结果。
 */
export interface CompareKeyResolution {
    entityKey: string;
    compareKey: string;
    matchKeys: string[];
    schemaVersion: string;
    canonicalName?: string;
    legacyCompareKeys?: string[];
}

/**
 * 功能：统一处理 compareKey、entityKey 与索引记录。
 */
export class CompareKeyService {
    /**
     * 功能：从条目解析协议化 compareKey 信息。
     * @param entry 记忆条目
     * @returns compareKey 解析结果
     */
    public resolveForEntry(entry: MemoryEntry): CompareKeyResolution {
        const payload = this.toRecord(entry.detailPayload);
        const fields = this.toRecord(payload.fields);
        const legacyCompareKey = this.normalizeText(payload.compareKey);
        const compareKey = supportsCompareKey(entry.entryType)
            ? buildCompareKey(entry.entryType, entry.title, fields)
            : buildCompareKey(entry.entryType, entry.title, {
                ...fields,
                qualifier: payload.scope ?? fields.scope,
            });
        const parsed = parseCompareKey(compareKey);
        const canonicalName = parsed.canonicalName || normalizeCompareTitle(entry.title);
        const entityKey = this.buildEntityKey(entry, parsed);
        const legacyCompareKeys = Array.from(new Set([
            legacyCompareKey,
            this.buildLegacyTitleKey(entry.entryType, entry.title),
        ].filter(Boolean)));
        const matchKeys = Array.from(new Set([
            compareKey,
            ...buildMatchKeys(entry.entryType, entry.title, [
                ...this.normalizeStringArray(payload.aliases),
                ...this.normalizeStringArray(fields.aliases),
                ...legacyCompareKeys,
            ], [
                ...parsed.qualifiers,
                payload.scope,
                fields.scope,
                fields.city,
                fields.nation,
                fields.location,
            ]),
        ]));
        return {
            entityKey,
            compareKey,
            matchKeys,
            schemaVersion: parsed.schemaVersion || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName,
            legacyCompareKeys,
        };
    }

    /**
     * 功能：构建 compareKey 索引记录。
     * @param entry 记忆条目
     * @returns 索引记录
     */
    public buildIndexRecord(entry: MemoryEntry): MemoryCompareKeyIndexRecord {
        const resolved = this.resolveForEntry(entry);
        return {
            chatKey: entry.chatKey,
            entryId: entry.entryId,
            entityKey: resolved.entityKey,
            entryType: entry.entryType,
            compareKey: resolved.compareKey,
            matchKeys: resolved.matchKeys,
            schemaVersion: resolved.schemaVersion,
            canonicalName: resolved.canonicalName || '',
            legacyCompareKeys: resolved.legacyCompareKeys ?? [],
            title: entry.title,
            updatedAt: entry.updatedAt,
        };
    }

    /**
     * 功能：判断两个 compareKey 是否精确匹配。
     * @param left 左侧 compareKey
     * @param right 右侧 compareKey
     * @returns 是否精确匹配
     */
    public isExactMatch(left: string, right: string): boolean {
        return compareKeysMatch(left, right);
    }

    /**
     * 功能：判断两个 compareKey 是否近似匹配。
     * @param left 左侧 compareKey
     * @param right 右侧 compareKey
     * @returns 是否近似匹配
     */
    public isNearMatch(left: string, right: string): boolean {
        return compareKeysNearMatch(left, right);
    }

    /**
     * 功能：判断索引记录是否命中查询键。
     * @param record 索引记录
     * @param queryKey 查询键
     * @returns 是否命中
     */
    public matchesRecord(record: MemoryCompareKeyIndexRecord, queryKey: string): boolean {
        const normalizedQueryKey = this.normalizeText(queryKey);
        if (!normalizedQueryKey) {
            return false;
        }
        if (this.isExactMatch(record.compareKey, normalizedQueryKey)) {
            return true;
        }
        return record.matchKeys.some((item: string): boolean => {
            return this.isExactMatch(item, normalizedQueryKey) || this.isNearMatch(item, normalizedQueryKey);
        });
    }

    /**
     * 功能：根据 compareKey 查找精确候选。
     * @param records 索引记录列表
     * @param compareKey compareKey
     * @returns 索引记录
     */
    public findExactMatch(records: MemoryCompareKeyIndexRecord[], compareKey: string): MemoryCompareKeyIndexRecord | null {
        const normalizedCompareKey = this.normalizeText(compareKey);
        return records.find((record: MemoryCompareKeyIndexRecord): boolean => this.isExactMatch(record.compareKey, normalizedCompareKey)) ?? null;
    }

    /**
     * 功能：根据 compareKey 查找近似候选。
     * @param records 索引记录列表
     * @param compareKey compareKey
     * @returns 索引记录
     */
    public findNearMatch(records: MemoryCompareKeyIndexRecord[], compareKey: string): MemoryCompareKeyIndexRecord | null {
        const normalizedCompareKey = this.normalizeText(compareKey);
        return records.find((record: MemoryCompareKeyIndexRecord): boolean => this.isNearMatch(record.compareKey, normalizedCompareKey)) ?? null;
    }

    /**
     * 功能：构建旧协议标题键，仅用于迁移到 matchKeys。
     * @param entryType 条目类型
     * @param title 标题
     * @returns 旧标题键
     */
    private buildLegacyTitleKey(entryType: string, title: string): string {
        return `${this.normalizeText(entryType)}:${normalizeCompareTitle(title)}`;
    }

    /**
     * 功能：构建 entityKey。
     * @param entry 记忆条目
     * @param parsed 已解析的 compareKey
     * @returns entityKey
     */
    private buildEntityKey(entry: MemoryEntry, parsed: ReturnType<typeof parseCompareKey>): string {
        return `ek:${parsed.entityType || this.normalizeText(entry.entryType) || 'other'}:${parsed.canonicalName || normalizeCompareTitle(entry.title) || entry.entryId}`;
    }

    /**
     * 功能：安全转换对象。
     * @param value 原始值
     * @returns 对象
     */
    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：标准化字符串数组。
     * @param value 原始值
     * @returns 字符串数组
     */
    private normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return Array.from(new Set(value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean)));
    }

    /**
     * 功能：标准化文本。
     * @param value 原始值
     * @returns 标准化文本
     */
    private normalizeText(value: unknown): string {
        return String(value ?? '').trim();
    }
}
