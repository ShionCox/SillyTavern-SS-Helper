import type {
    ColdStartDocument,
    ColdStartIdentity,
    ColdStartMemoryRecord,
    ColdStartRelationshipEntry,
    ColdStartWorldBaseEntry,
} from './bootstrap-types';

/**
 * 功能：解析并清洗冷启动输出文档。
 * @param rawDocument 原始文档。
 * @returns 清洗后文档，非法时返回 null。
 */
export function parseColdStartDocument(rawDocument: unknown): ColdStartDocument | null {
    if (!rawDocument || typeof rawDocument !== 'object' || Array.isArray(rawDocument)) {
        return null;
    }
    const source = rawDocument as Record<string, unknown>;
    const schemaVersion = normalizeText(source.schemaVersion);
    const identity = normalizeIdentity(source.identity);
    if (!schemaVersion || !identity) {
        return null;
    }
    return {
        schemaVersion,
        identity,
        worldProfileDetection: normalizeWorldProfileDetection(source.worldProfileDetection),
        worldBase: normalizeWorldBase(source.worldBase),
        relationships: normalizeRelationships(source.relationships),
        memoryRecords: normalizeMemoryRecords(source.memoryRecords),
    };
}

/**
 * 功能：归一化身份对象。
 * @param value 原始值。
 * @returns 身份对象。
 */
function normalizeIdentity(value: unknown): ColdStartIdentity | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const row = value as Record<string, unknown>;
    const actorKey = normalizeText(row.actorKey) || 'actor_main';
    const displayName = normalizeText(row.displayName) || actorKey;
    return {
        actorKey,
        displayName,
        aliases: dedupeStrings(row.aliases),
        identityFacts: dedupeStrings(row.identityFacts),
        originFacts: dedupeStrings(row.originFacts),
        traits: dedupeStrings(row.traits),
    };
}

/**
 * 功能：归一化世界模板识别对象。
 * @param value 原始值。
 * @returns 识别对象。
 */
function normalizeWorldProfileDetection(value: unknown): ColdStartDocument['worldProfileDetection'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const row = value as Record<string, unknown>;
    const primaryProfile = normalizeText(row.primaryProfile);
    if (!primaryProfile) {
        return undefined;
    }
    return {
        primaryProfile,
        secondaryProfiles: dedupeStrings(row.secondaryProfiles),
        confidence: clamp01(Number(row.confidence)),
        reasonCodes: dedupeStrings(row.reasonCodes),
    };
}

/**
 * 功能：归一化 worldBase 列表。
 * @param value 原始值。
 * @returns 归一化列表。
 */
function normalizeWorldBase(value: unknown): ColdStartWorldBaseEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((row: unknown): ColdStartWorldBaseEntry | null => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
                return null;
            }
            const record = row as Record<string, unknown>;
            const schemaId = normalizeText(record.schemaId);
            const title = normalizeText(record.title);
            const summary = normalizeText(record.summary);
            const scope = normalizeText(record.scope) || 'global';
            if (!schemaId || !title || !summary) {
                return null;
            }
            return { schemaId, title, summary, scope };
        })
        .filter(Boolean) as ColdStartWorldBaseEntry[];
}

/**
 * 功能：归一化 relationships 列表。
 * @param value 原始值。
 * @returns 归一化列表。
 */
function normalizeRelationships(value: unknown): ColdStartRelationshipEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((row: unknown): ColdStartRelationshipEntry | null => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
                return null;
            }
            const record = row as Record<string, unknown>;
            const sourceActorKey = normalizeText(record.sourceActorKey);
            const targetActorKey = normalizeText(record.targetActorKey);
            const summary = normalizeText(record.summary);
            if (!sourceActorKey || !targetActorKey || !summary) {
                return null;
            }
            return {
                sourceActorKey,
                targetActorKey,
                summary,
                trust: optionalClampedNumber(record.trust),
                affection: optionalClampedNumber(record.affection),
                tension: optionalClampedNumber(record.tension),
            };
        })
        .filter(Boolean) as ColdStartRelationshipEntry[];
}

/**
 * 功能：归一化初始记忆记录。
 * @param value 原始值。
 * @returns 归一化列表。
 */
function normalizeMemoryRecords(value: unknown): ColdStartMemoryRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((row: unknown): ColdStartMemoryRecord | null => {
            if (!row || typeof row !== 'object' || Array.isArray(row)) {
                return null;
            }
            const record = row as Record<string, unknown>;
            const schemaId = normalizeText(record.schemaId);
            const title = normalizeText(record.title);
            const summary = normalizeText(record.summary);
            if (!schemaId || !title || !summary) {
                return null;
            }
            return {
                schemaId,
                title,
                summary,
                importance: optionalClampedNumber(record.importance),
            };
        })
        .filter(Boolean) as ColdStartMemoryRecord[];
}

/**
 * 功能：归一化文本。
 * @param value 原始值。
 * @returns 文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：数组字符串去重。
 * @param value 原始值。
 * @returns 去重结果。
 */
function dedupeStrings(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const merged: string[] = [];
    for (const item of value) {
        const normalized = normalizeText(item);
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

/**
 * 功能：可选数值 clmap 到 0~1。
 * @param value 原始值。
 * @returns 限制后的值。
 */
function optionalClampedNumber(value: unknown): number | undefined {
    if (value == null || value === '') {
        return undefined;
    }
    return clamp01(Number(value));
}

/**
 * 功能：限制数值到 0~1。
 * @param value 原始值。
 * @returns 限制结果。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

