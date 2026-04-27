import { buildCompareKey } from './compare-key';

export interface MemoryKeySeed {
    kind?: string;
    title?: string;
    qualifier?: string;
    participants?: string[];
}

export interface ResolvedMemoryKeys {
    entityKey: string;
    compareKey: string;
    matchKeys: string[];
}

/**
 * 功能：根据 AI 提供的 keySeed/newRecord 生成稳定键，避免模型直接编数据库 key。
 */
export function resolveMemoryKeys(input: {
    targetKind: string;
    keySeed?: MemoryKeySeed;
    newRecord?: Record<string, unknown>;
}): ResolvedMemoryKeys {
    const targetKind = normalizeSlug(input.targetKind || input.keySeed?.kind || 'memory');
    const record = input.newRecord ?? {};
    const fields = toRecord(record.fields);
    const title = normalizeText(input.keySeed?.title)
        || normalizeText(record.title)
        || normalizeText(record.summary)
        || targetKind;
    const qualifier = normalizeText(input.keySeed?.qualifier)
        || normalizeText(fields.location)
        || normalizeText(fields.status)
        || normalizeText(fields.objective);
    const compareFields = {
        ...fields,
        qualifier,
        sourceActorKey: fields.sourceActorKey ?? toStringArray(input.keySeed?.participants)[0],
        targetActorKey: fields.targetActorKey ?? toStringArray(input.keySeed?.participants)[1],
    };
    const compareKey = buildCompareKey(targetKind, title, compareFields);
    return {
        entityKey: `entity:${targetKind}:${normalizeSlug(`${title}:${qualifier}`)}`,
        compareKey,
        matchKeys: [`mk:${targetKind}:${normalizeSlug(title)}`],
    };
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function normalizeSlug(value: unknown): string {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[\s:：/\\|]+/gu, '_')
        .replace(/[^\p{L}\p{N}_-]+/gu, '')
        .replace(/_+/gu, '_')
        .replace(/^_+|_+$/gu, '')
        || 'unknown';
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((item: unknown): string => normalizeText(item)).filter(Boolean)
        : [];
}
