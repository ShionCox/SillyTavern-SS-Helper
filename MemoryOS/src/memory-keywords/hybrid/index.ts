import type { KeywordDictionary } from '../types';
import { NATIVE_KEYWORD_DICTIONARIES } from '../native';
import { PEROCORE_KEYWORD_DICTIONARIES } from '../perocore';

/**
 * 功能：导出混合关键词包。
 */
export const HYBRID_KEYWORD_DICTIONARIES: KeywordDictionary[] = [
    ...NATIVE_KEYWORD_DICTIONARIES,
    ...PEROCORE_KEYWORD_DICTIONARIES,
];
