import type { KeywordDictionary } from '../types';
import { CONFLICT_DICTIONARY } from './conflict';
import { REPAIR_DICTIONARY } from './repair';
import { SCENE_TRANSITION_DICTIONARY } from './scene-transition';
import { SETTING_QA_DICTIONARY } from './setting-qa';
import { PLOT_PROGRESS_DICTIONARY } from './plot-progress';

/**
 * 功能：导出内置关键词词典列表。
 */
export const BUILTIN_KEYWORD_DICTIONARIES: KeywordDictionary[] = [
    CONFLICT_DICTIONARY,
    REPAIR_DICTIONARY,
    SCENE_TRANSITION_DICTIONARY,
    SETTING_QA_DICTIONARY,
    PLOT_PROGRESS_DICTIONARY,
];

