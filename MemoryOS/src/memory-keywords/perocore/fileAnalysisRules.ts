import type { KeywordDictionary } from '../types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 文件分析规则。
 */
export const PEROCORE_FILE_ANALYSIS_DICTIONARY: KeywordDictionary = {
    dictionaryId: 'perocore_file_analysis',
    label: '文件分析',
    pack: 'perocore',
    description: '识别文件搜索、路径筛选、代码定位与模块分析语境。',
    keywords: PEROCORE_ALIAS_GROUPS.fileAnalysis,
    candidateTypes: ['event', 'actor_private_interpretation', 'world_core_setting'],
    intentHints: ['file_search', 'code_analysis'],
};
