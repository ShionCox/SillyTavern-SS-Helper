import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 场景规则。
 */
export const PEROCORE_SCENE_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_scene',
    label: '场景定位',
    pack: 'perocore',
    description: '识别地点、位置和场景切换语境。',
    keywords: PEROCORE_ALIAS_GROUPS.scene,
    candidateTypes: ['scene_shared_state', 'location', 'event'],
    intentHints: ['scene_location', 'scene_transition'],
};
