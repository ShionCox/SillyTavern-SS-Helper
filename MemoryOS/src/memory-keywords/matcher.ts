import type { KeywordDictionary, KeywordMatchResult } from './types';
import { loadKeywordDictionaries } from './loader';

/**
 * 功能：执行关键词匹配并输出候选类型信号。
 * @param inputText 输入文本。
 * @param dictionaries 可选词典列表。
 * @returns 匹配结果列表，按分数降序。
 */
export function matchKeywordSignals(
    inputText: string,
    dictionaries: KeywordDictionary[] = loadKeywordDictionaries(),
): KeywordMatchResult[] {
    const source = normalizeText(inputText);
    if (!source) {
        return [];
    }
    const results: KeywordMatchResult[] = [];
    for (const dictionary of dictionaries) {
        const matchedKeywords = dictionary.keywords
            .map((keyword: string): string => normalizeText(keyword))
            .filter((keyword: string): boolean => Boolean(keyword) && source.includes(keyword));
        if (matchedKeywords.length <= 0) {
            continue;
        }
        const keywordCoverage = matchedKeywords.length / Math.max(1, dictionary.keywords.length);
        const score = Number((matchedKeywords.length + keywordCoverage).toFixed(4));
        results.push({
            dictionaryId: dictionary.dictionaryId,
            label: dictionary.label ?? dictionary.description ?? dictionary.dictionaryId,
            pack: dictionary.pack ?? 'native',
            score,
            matchedKeywords,
            candidateTypes: dedupeStrings(dictionary.candidateTypes),
            intentHints: dedupeStrings(dictionary.intentHints),
        });
    }
    return results.sort((left: KeywordMatchResult, right: KeywordMatchResult): number => right.score - left.score);
}

/**
 * 功能：归一化文本，便于匹配。
 * @param value 原始文本。
 * @returns 归一化文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
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

