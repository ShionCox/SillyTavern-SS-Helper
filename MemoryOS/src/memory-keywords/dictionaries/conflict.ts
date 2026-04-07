import type { KeywordDictionary } from '../types';

/**
 * 功能：冲突类关键词词典。
 */
export const CONFLICT_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'conflict',
    description: '识别争执、冲突、战斗等事件信号',
    keywords: ['争执', '冲突', '争吵', '战斗', '对峙', '翻脸', '敌对', '交锋', '矛盾', '误会'],
    candidateTypes: ['event', 'relationship'],
    intentHints: ['conflict_progress'],
};

