import type {
    ColdStartActorCard,
    ColdStartDocument,
    ColdStartIdentity,
    ColdStartMemoryRecord,
    ColdStartRelationshipEntry,
    ColdStartWorldBaseEntry,
} from './bootstrap-types';
import { normalizeRelationTag } from '../constants/relationTags';

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
    const relationshipResult = normalizeRelationships(source.relationships);
    if (!schemaVersion || !identity) {
        return null;
    }
    if (!relationshipResult.valid) {
        return null;
    }
    return {
        schemaVersion,
        identity,
        actorCards: normalizeActorCards(source.actorCards),
        worldProfileDetection: normalizeWorldProfileDetection(source.worldProfileDetection),
        worldBase: normalizeWorldBase(source.worldBase),
        relationships: relationshipResult.relationships,
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
function normalizeRelationships(value: unknown): {
    valid: boolean;
    relationships: ColdStartRelationshipEntry[];
} {
    if (!Array.isArray(value)) {
        return { valid: true, relationships: [] };
    }
    const relationships: ColdStartRelationshipEntry[] = [];
    for (const row of value) {
        const normalized = normalizeRelationship(row);
        if (!normalized) {
            return { valid: false, relationships: [] };
        }
        relationships.push(normalized);
    }
    return { valid: true, relationships };
}

/**
 * 功能：归一化单条关系记录。
 * @param value 原始关系值。
 * @returns 归一化后的关系记录；非法时返回 null。
 */
function normalizeRelationship(value: unknown): ColdStartRelationshipEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const sourceActorKey = normalizeText(record.sourceActorKey);
    const targetActorKey = normalizeText(record.targetActorKey);
    const participants = dedupeStrings(record.participants);
    const relationTag = normalizeRelationTag(record.relationTag);
    const state = normalizeText(record.state);
    const summary = normalizeText(record.summary);
    if (!sourceActorKey || !targetActorKey || !relationTag || !state || !summary) {
        return null;
    }
    const normalizedParticipants = dedupeKnownParticipants(participants, sourceActorKey, targetActorKey);
    return {
        sourceActorKey,
        targetActorKey,
        participants: normalizedParticipants,
        relationTag,
        state,
        summary,
        trust: clamp01(Number(record.trust)),
        affection: clamp01(Number(record.affection)),
        tension: clamp01(Number(record.tension)),
    };
}

/**
 * 功能：归一化关系角色卡列表。
 * @param value 原始值。
 * @returns 可用的关系角色卡列表。
 */
function normalizeActorCards(value: unknown): ColdStartActorCard[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: ColdStartActorCard[] = [];
    const seenActorKeys = new Set<string>();
    for (const row of value) {
        const card = normalizeActorCard(row);
        if (!card) {
            continue;
        }
        const normalizedActorKey = normalizeText(card.actorKey).toLowerCase();
        if (!normalizedActorKey || seenActorKeys.has(normalizedActorKey)) {
            continue;
        }
        seenActorKeys.add(normalizedActorKey);
        result.push(card);
    }
    return result;
}

/**
 * 功能：归一化单个关系角色卡。
 * @param value 原始值。
 * @returns 关系角色卡；非法时返回 null。
 */
function normalizeActorCard(value: unknown): ColdStartActorCard | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const row = value as Record<string, unknown>;
    const actorKey = normalizeText(row.actorKey);
    const displayName = normalizeText(row.displayName);
    if (!actorKey || !displayName) {
        return null;
    }
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
 * 功能：确保关系参与角色列表至少包含源角色与目标角色。
 * @param participants 原始参与角色列表。
 * @param sourceActorKey 源角色键。
 * @param targetActorKey 目标角色键。
 * @returns 归一化后的参与角色列表。
 */
function dedupeKnownParticipants(participants: string[], sourceActorKey: string, targetActorKey: string): string[] {
    const merged: string[] = [];
    for (const value of [sourceActorKey, targetActorKey, ...participants]) {
        const normalized = normalizeText(value);
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

