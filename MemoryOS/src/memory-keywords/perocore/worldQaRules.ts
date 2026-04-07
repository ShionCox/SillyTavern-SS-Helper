import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 世界问答规则。
 */
export const PEROCORE_WORLD_QA_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_world_qa',
    label: '世界问答',
    pack: 'perocore',
    description: '识别规则、设定、禁令和世界事实问答。',
    keywords: PEROCORE_ALIAS_GROUPS.worldQa,
    candidateTypes: ['world_core_setting', 'world_hard_rule', 'world_global_state', 'actor_private_interpretation'],
    intentHints: ['world_rule', 'setting_qa'],
};
