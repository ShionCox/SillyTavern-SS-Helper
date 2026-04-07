import type { KeywordDictionary } from '../types';

/**
 * 功能：剧情推进类关键词词典。
 */
export const PLOT_PROGRESS_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'plot_progress',
    description: '识别任务推进、计划变化、线索推进',
    keywords: ['线索', '推进', '计划', '任务', '目标', '调查', '阶段', '下一步', '完成', '进展'],
    candidateTypes: ['task', 'event', 'relationship'],
    intentHints: ['plot_progress'],
};

