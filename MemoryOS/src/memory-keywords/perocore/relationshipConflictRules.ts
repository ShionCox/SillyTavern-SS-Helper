import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 关系冲突规则。
 */
export const PEROCORE_RELATIONSHIP_CONFLICT_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_relationship_conflict',
    label: '关系冲突',
    pack: 'perocore',
    description: '识别人与人之间的不信任、争执和冲突语境。',
    keywords: PEROCORE_ALIAS_GROUPS.relationshipConflict,
    candidateTypes: ['relationship', 'event'],
    intentHints: ['relationship_conflict', 'conflict_progress'],
};
