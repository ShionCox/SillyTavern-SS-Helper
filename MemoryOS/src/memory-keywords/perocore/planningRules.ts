import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 计划任务规则。
 */
export const PEROCORE_PLANNING_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_planning',
    label: '计划任务',
    pack: 'perocore',
    description: '识别计划、路线图、待办与项目推进语境。',
    keywords: PEROCORE_ALIAS_GROUPS.planning,
    candidateTypes: ['event', 'actor_private_interpretation', 'relationship'],
    intentHints: ['project_plan', 'todo_progress'],
};
