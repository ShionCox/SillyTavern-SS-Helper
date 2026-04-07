import type { KeywordDictionary } from '../types';

/**
 * 功能：场景切换类关键词词典。
 */
export const SCENE_TRANSITION_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'scene_transition',
    description: '识别地点变化与场景迁移信号',
    keywords: ['来到', '前往', '离开', '抵达', '切换场景', '转场', '回到', '出发', '进入', '赶到'],
    candidateTypes: ['location', 'event'],
    intentHints: ['scene_transition'],
};

