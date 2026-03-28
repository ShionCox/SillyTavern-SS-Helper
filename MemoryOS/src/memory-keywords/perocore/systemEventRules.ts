import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 系统事件规则。
 */
export const PEROCORE_SYSTEM_EVENT_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_system_event',
    label: '系统事件',
    pack: 'perocore',
    description: '识别后台系统提醒、观察触发与主动唤起语境。',
    keywords: PEROCORE_ALIAS_GROUPS.systemEvent,
    candidateTypes: ['event', 'scene_shared_state', 'world_global_state'],
    intentHints: ['system_event', 'scheduled_trigger'],
};
