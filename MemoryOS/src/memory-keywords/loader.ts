import type { KeywordDictionary } from './types';
import type { KeywordPackMode } from './types';
import { NATIVE_KEYWORD_DICTIONARIES } from './native';
import { PEROCORE_KEYWORD_DICTIONARIES } from './perocore';
import { HYBRID_KEYWORD_DICTIONARIES } from './hybrid';

/**
 * 功能：读取指定模式的关键词包。
 * @param mode 关键词包模式。
 * @returns 词典列表。
 */
export function loadKeywordDictionaries(mode: KeywordPackMode = 'hybrid'): KeywordDictionary[] {
    return getActiveKeywordPack(mode).map((dictionary: KeywordDictionary): KeywordDictionary => ({
        ...dictionary,
        pack: dictionary.pack ?? 'native',
        label: dictionary.label ?? dictionary.description ?? dictionary.dictionaryId,
        keywords: dedupeStrings(dictionary.keywords),
        candidateTypes: dedupeStrings(dictionary.candidateTypes),
        intentHints: dedupeStrings(dictionary.intentHints),
    }));
}

/**
 * 功能：返回当前启用的关键词包。
 * @param mode 关键词包模式。
 * @returns 原始词典列表。
 */
export function getActiveKeywordPack(mode: KeywordPackMode = 'hybrid'): KeywordDictionary[] {
    if (mode === 'native') {
        return NATIVE_KEYWORD_DICTIONARIES;
    }
    if (mode === 'perocore') {
        return PEROCORE_KEYWORD_DICTIONARIES;
    }
    return HYBRID_KEYWORD_DICTIONARIES;
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 待处理数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const merged: string[] = [];
    for (const value of Array.isArray(values) ? values : []) {
        const normalized = String(value ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

