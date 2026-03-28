import type { KeywordDictionary } from '../types';
import { BUILTIN_KEYWORD_DICTIONARIES } from '../dictionaries';

/**
 * 功能：导出 MemoryOS 原生关键词包。
 */
export const NATIVE_KEYWORD_DICTIONARIES: KeywordDictionary[] = BUILTIN_KEYWORD_DICTIONARIES.map((dictionary: KeywordDictionary): KeywordDictionary => ({
    ...dictionary,
    pack: 'native',
    label: dictionary.label ?? dictionary.description ?? dictionary.dictionaryId,
}));
