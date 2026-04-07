import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 工作模式规则。
 */
export const PEROCORE_WORK_MODE_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_work_mode',
    label: '工作模式',
    pack: 'perocore',
    description: '识别工作模式下的代码修改、文件操作与严谨执行语境。',
    keywords: PEROCORE_ALIAS_GROUPS.workMode,
    candidateTypes: ['event', 'actor_private_interpretation', 'scene_shared_state'],
    intentHints: ['work_mode', 'code_editing'],
};
