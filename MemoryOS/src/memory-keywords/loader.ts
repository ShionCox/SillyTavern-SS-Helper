import type { KeywordDictionary } from './types';
import { BUILTIN_KEYWORD_DICTIONARIES } from './dictionaries';

/**
 * 功能：读取内置关键词词典。
 * @returns 词典列表。
 */
export function loadKeywordDictionaries(): KeywordDictionary[] {
    return BUILTIN_KEYWORD_DICTIONARIES.map((dictionary: KeywordDictionary): KeywordDictionary => ({
        ...dictionary,
        keywords: dedupeStrings(dictionary.keywords),
        candidateTypes: dedupeStrings(dictionary.candidateTypes),
        intentHints: dedupeStrings(dictionary.intentHints),
    }));
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

