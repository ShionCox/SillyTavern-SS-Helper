export type KeywordPackMode = 'native' | 'perocore' | 'hybrid';

/**
 * 功能：关键词词典定义。
 */
export interface KeywordDictionary {
    dictionaryId: string;
    label?: string;
    pack?: Exclude<KeywordPackMode, 'hybrid'>;
    description: string;
    keywords: string[];
    candidateTypes: string[];
    intentHints: string[];
}

/**
 * 功能：关键词匹配结果。
 */
export interface KeywordMatchResult {
    dictionaryId: string;
    label: string;
    pack: Exclude<KeywordPackMode, 'hybrid'>;
    score: number;
    matchedKeywords: string[];
    candidateTypes: string[];
    intentHints: string[];
}

