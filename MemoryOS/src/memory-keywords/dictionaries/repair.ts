import type { KeywordDictionary } from '../types';

/**
 * 功能：修复关系类关键词词典。
 */
export const REPAIR_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'repair',
    description: '识别和解、修复、道歉等信号',
    keywords: ['和解', '修复', '道歉', '解释', '重建', '释怀', '缓和', '安抚', '原谅', '妥协'],
    candidateTypes: ['relationship', 'event'],
    intentHints: ['relationship_repair'],
};

