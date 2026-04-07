import type { KeywordDictionary } from '../types';

/**
 * 功能：设定问答类关键词词典。
 */
export const SETTING_QA_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'setting_qa',
    description: '识别用户在询问设定与背景信息',
    keywords: ['设定', '规则', '是什么', '背景', '介绍', '定义', '来历', '世界观', '位置', '为何'],
    candidateTypes: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'location', 'organization'],
    intentHints: ['setting_qa'],
};

