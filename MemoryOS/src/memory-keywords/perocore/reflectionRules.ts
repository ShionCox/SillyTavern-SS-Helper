import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 反思复盘规则。
 */
export const PEROCORE_REFLECTION_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_reflection',
    label: '反思复盘',
    pack: 'perocore',
    description: '识别复盘、改进、经验教训与反馈吸收语境。',
    keywords: PEROCORE_ALIAS_GROUPS.reflection,
    candidateTypes: ['actor_private_interpretation', 'event'],
    intentHints: ['reflection', 'improvement'],
};
