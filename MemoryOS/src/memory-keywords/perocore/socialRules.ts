import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 社交群聊规则。
 */
export const PEROCORE_SOCIAL_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_social',
    label: '社交群聊',
    pack: 'perocore',
    description: '识别群聊、私聊、社交互动与插话语境。',
    keywords: PEROCORE_ALIAS_GROUPS.social,
    candidateTypes: ['relationship', 'event', 'scene_shared_state'],
    intentHints: ['social_context', 'group_interaction'],
};
