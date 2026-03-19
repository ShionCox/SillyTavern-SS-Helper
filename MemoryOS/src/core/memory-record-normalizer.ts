import type { FactProposal, PatchProposal, SummaryProposal } from '../proposal/types';

/**
 * 功能：描述规范化后的事实提议。
 * @param title 面向界面的短标题。
 * @param compareKey 用于命中旧记录的稳定比较键。
 * @param normalizedText 归一化后的比较文本。
 * @param valueSignature 归一化后的值签名。
 * @returns 事实提议规范化结果。
 */
export interface NormalizedFactMutationRecord {
    title: string;
    compareKey: string;
    normalizedText: string;
    valueSignature: string;
}

/**
 * 功能：描述规范化后的摘要提议。
 * @param title 面向界面的短标题。
 * @param compareKey 用于命中旧记录的稳定比较键。
 * @param normalizedText 归一化后的比较文本。
 * @param contentSignature 归一化后的内容签名。
 * @returns 摘要提议规范化结果。
 */
export interface NormalizedSummaryMutationRecord {
    title: string;
    compareKey: string;
    normalizedText: string;
    contentSignature: string;
}

/**
 * 功能：描述规范化后的世界状态提议。
 * @param title 面向界面的短标题。
 * @param compareKey 用于命中旧记录的稳定比较键。
 * @param normalizedText 归一化后的比较文本。
 * @param valueSignature 归一化后的值签名。
 * @returns 世界状态提议规范化结果。
 */
export interface NormalizedStateMutationRecord {
    title: string;
    compareKey: string;
    normalizedText: string;
    valueSignature: string;
}

/**
 * 功能：把任意文本归一化为稳定的单行字符串。
 * @param value 待归一化的值。
 * @returns 归一化后的文本。
 */
export function normalizeMutationText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：判断一个值是否为普通对象。
 * @param value 待判断的值。
 * @returns 是否为普通对象。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：把字符串数组去重并裁剪为空项。
 * @param values 待处理的字符串数组。
 * @returns 去重后的字符串数组。
 */
function dedupeNormalizedStrings(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = normalizeMutationText(value);
        if (!text) {
            continue;
        }
        const key = text.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(text);
    }
    return result;
}

/**
 * 功能：对任意 JSON 值做稳定序列化，便于比较是否等价。
 * @param value 待序列化的值。
 * @returns 稳定序列化后的字符串。
 */
export function stableSerializeMutationValue(value: unknown): string {
    if (value == null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return normalizeMutationText(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item: unknown): string => stableSerializeMutationValue(item)).join(',')}]`;
    }
    if (isPlainRecord(value)) {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key: string): string => `${key}:${stableSerializeMutationValue(value[key])}`).join(',')}}`;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return normalizeMutationText(value);
    }
}

/**
 * 功能：合并两个记忆值，用于 MERGE 动作生成下一版本内容。
 * @param existingValue 旧值。
 * @param incomingValue 新值。
 * @returns 合并后的值。
 */
export function mergeMutationValues(existingValue: unknown, incomingValue: unknown): unknown {
    if (incomingValue == null || incomingValue === '') {
        return existingValue;
    }
    if (existingValue == null || existingValue === '') {
        return incomingValue;
    }
    if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
        return dedupeNormalizedStrings([...existingValue, ...incomingValue]);
    }
    if (isPlainRecord(existingValue) && isPlainRecord(incomingValue)) {
        const merged: Record<string, unknown> = { ...existingValue };
        for (const [key, value] of Object.entries(incomingValue)) {
            merged[key] = key in merged ? mergeMutationValues(merged[key], value) : value;
        }
        return merged;
    }
    if (typeof existingValue === 'string' && typeof incomingValue === 'string') {
        const current = normalizeMutationText(existingValue);
        const next = normalizeMutationText(incomingValue);
        if (!current) {
            return next;
        }
        if (!next) {
            return current;
        }
        if (current.includes(next)) {
            return current;
        }
        if (next.includes(current)) {
            return next;
        }
        return `${current}\n${next}`.trim();
    }
    return incomingValue;
}

/**
 * 功能：判断两个值是否更适合被视为“冲突替换”而不是普通更新。
 * @param existingValue 旧值。
 * @param incomingValue 新值。
 * @returns 是否应视为失效替换。
 */
export function shouldInvalidateMutationValue(existingValue: unknown, incomingValue: unknown): boolean {
    if (existingValue == null || incomingValue == null) {
        return false;
    }
    if (Array.isArray(existingValue) || Array.isArray(incomingValue) || isPlainRecord(existingValue) || isPlainRecord(incomingValue)) {
        return false;
    }
    const current = stableSerializeMutationValue(existingValue);
    const next = stableSerializeMutationValue(incomingValue);
    return Boolean(current && next && current !== next);
}

/**
 * 功能：构建事实提议的比较键。
 * @param fact 事实提议。
 * @returns 稳定比较键。
 */
export function buildFactMutationCompareKey(fact: FactProposal): string {
    const type = normalizeMutationText(fact.type).toLowerCase() || 'fact';
    const entityKind = normalizeMutationText(fact.entity?.kind).toLowerCase() || '_';
    const entityId = normalizeMutationText(fact.entity?.id).toLowerCase() || '_';
    const path = normalizeMutationText(fact.path).toLowerCase() || '_';
    return `fact::${type}::${entityKind}:${entityId}::${path}`;
}

/**
 * 功能：构建事实提议的短标题。
 * @param fact 事实提议。
 * @returns 短标题。
 */
export function buildFactMutationTitle(fact: FactProposal): string {
    return normalizeMutationText(fact.path) || normalizeMutationText(fact.type) || '事实提议';
}

/**
 * 功能：把事实提议归一化为稳定的比较结果。
 * @param fact 事实提议。
 * @returns 事实提议规范化结果。
 */
export function normalizeFactMutationRecord(fact: FactProposal): NormalizedFactMutationRecord {
    const compareKey = buildFactMutationCompareKey(fact);
    const normalizedText = normalizeMutationText([
        normalizeMutationText(fact.type),
        normalizeMutationText(fact.entity?.kind),
        normalizeMutationText(fact.entity?.id),
        normalizeMutationText(fact.path),
        stableSerializeMutationValue(fact.value),
    ].join(' '));
    return {
        title: buildFactMutationTitle(fact),
        compareKey,
        normalizedText,
        valueSignature: stableSerializeMutationValue(fact.value),
    };
}

/**
 * 功能：构建摘要提议的比较键。
 * @param summary 摘要提议。
 * @returns 稳定比较键。
 */
export function buildSummaryMutationCompareKey(summary: SummaryProposal): string {
    const level = normalizeMutationText(summary.level).toLowerCase() || 'summary';
    const title = normalizeMutationText(summary.title).toLowerCase();
    const contentPreview = normalizeMutationText(summary.content).toLowerCase().slice(0, 96);
    return `summary::${level}::${title || contentPreview || 'untitled'}`;
}

/**
 * 功能：构建摘要提议的短标题。
 * @param summary 摘要提议。
 * @returns 短标题。
 */
export function buildSummaryMutationTitle(summary: SummaryProposal): string {
    return normalizeMutationText(summary.title) || `${normalizeMutationText(summary.level) || 'summary'} 摘要`;
}

/**
 * 功能：把摘要提议归一化为稳定的比较结果。
 * @param summary 摘要提议。
 * @returns 摘要提议规范化结果。
 */
export function normalizeSummaryMutationRecord(summary: SummaryProposal): NormalizedSummaryMutationRecord {
    const keywords = Array.isArray(summary.keywords) ? dedupeNormalizedStrings(summary.keywords) : [];
    const normalizedText = normalizeMutationText([
        normalizeMutationText(summary.level),
        normalizeMutationText(summary.title),
        normalizeMutationText(summary.content),
        keywords.join(' '),
    ].join(' '));
    return {
        title: buildSummaryMutationTitle(summary),
        compareKey: buildSummaryMutationCompareKey(summary),
        normalizedText,
        contentSignature: stableSerializeMutationValue({
            title: normalizeMutationText(summary.title),
            content: normalizeMutationText(summary.content),
            keywords,
        }),
    };
}

/**
 * 功能：构建世界状态提议的比较键。
 * @param patch 世界状态提议。
 * @returns 稳定比较键。
 */
export function buildStateMutationCompareKey(patch: PatchProposal): string {
    return `state::${normalizeMutationText(patch.path).toLowerCase() || '_'}`;
}

/**
 * 功能：构建世界状态提议的短标题。
 * @param patch 世界状态提议。
 * @returns 短标题。
 */
export function buildStateMutationTitle(patch: PatchProposal): string {
    return normalizeMutationText(patch.path) || '世界状态提议';
}

/**
 * 功能：把世界状态提议归一化为稳定的比较结果。
 * @param patch 世界状态提议。
 * @returns 世界状态提议规范化结果。
 */
export function normalizeStateMutationRecord(patch: PatchProposal): NormalizedStateMutationRecord {
    const normalizedText = normalizeMutationText([
        normalizeMutationText(patch.op),
        normalizeMutationText(patch.path),
        stableSerializeMutationValue(patch.value),
    ].join(' '));
    return {
        title: buildStateMutationTitle(patch),
        compareKey: buildStateMutationCompareKey(patch),
        normalizedText,
        valueSignature: stableSerializeMutationValue(patch.value),
    };
}
