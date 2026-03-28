import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 据点环境规则。
 */
export const PEROCORE_ENVIRONMENT_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_environment',
    label: '据点环境',
    pack: 'perocore',
    description: '识别据点、房间、设施、环境维护与房间氛围语境。',
    keywords: PEROCORE_ALIAS_GROUPS.environment,
    candidateTypes: ['scene_shared_state', 'location', 'event'],
    intentHints: ['environment_state', 'room_maintenance'],
};
