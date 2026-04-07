import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 编码调试规则。
 */
export const PEROCORE_CODING_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_coding',
    label: '编码调试',
    pack: 'perocore',
    description: '识别代码、报错、调试与实现相关语境。',
    keywords: PEROCORE_ALIAS_GROUPS.coding,
    candidateTypes: ['event', 'actor_private_interpretation', 'world_core_setting'],
    intentHints: ['coding_debug', 'implementation'],
};
