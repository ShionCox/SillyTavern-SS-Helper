import type { KeywordDictionary } from '../types';
import { PEROCORE_CONJUNCTIONS } from './conjunctions';
import { PEROCORE_INTENT_SPLITTERS, splitTextByPerocoreRules } from './splitters';
import { PEROCORE_SYSTEM_PREFIXES, matchPerocoreSystemPrefix, stripPerocoreSystemPrefix } from './systemPrefixes';
import { PEROCORE_MEMORY_TYPE_RULES, PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET, type PerocoreMemoryTypeRule } from './memoryTypeRules';
import { PEROCORE_THOUGHT_CLUSTER_RULES, PEROCORE_CLUSTER_TO_ROUTE_HINTS, type PerocoreThoughtClusterRule } from './thoughtClusterRules';
import { PEROCORE_CODING_DICTIONARY } from './codingRules';
import { PEROCORE_ENVIRONMENT_DICTIONARY } from './environmentRules';
import { PEROCORE_FILE_ANALYSIS_DICTIONARY } from './fileAnalysisRules';
import { PEROCORE_PLANNING_DICTIONARY } from './planningRules';
import { PEROCORE_RELATIONSHIP_CONFLICT_DICTIONARY } from './relationshipConflictRules';
import { PEROCORE_REFLECTION_DICTIONARY } from './reflectionRules';
import { PEROCORE_SOCIAL_DICTIONARY } from './socialRules';
import { PEROCORE_WORLD_QA_DICTIONARY } from './worldQaRules';
import { PEROCORE_SCENE_DICTIONARY } from './sceneRules';
import { PEROCORE_SYSTEM_EVENT_DICTIONARY } from './systemEventRules';
import { PEROCORE_WORK_MODE_DICTIONARY } from './workModeRules';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 兼容关键词包。
 */
export const PEROCORE_KEYWORD_DICTIONARIES: KeywordDictionary[] = [
    PEROCORE_SYSTEM_EVENT_DICTIONARY,
    PEROCORE_SOCIAL_DICTIONARY,
    PEROCORE_ENVIRONMENT_DICTIONARY,
    PEROCORE_CODING_DICTIONARY,
    PEROCORE_FILE_ANALYSIS_DICTIONARY,
    PEROCORE_WORK_MODE_DICTIONARY,
    PEROCORE_PLANNING_DICTIONARY,
    PEROCORE_REFLECTION_DICTIONARY,
    PEROCORE_RELATIONSHIP_CONFLICT_DICTIONARY,
    PEROCORE_WORLD_QA_DICTIONARY,
    PEROCORE_SCENE_DICTIONARY,
];

export {
    PEROCORE_ALIAS_GROUPS,
    PEROCORE_CLUSTER_TO_ROUTE_HINTS,
    PEROCORE_CODING_DICTIONARY,
    PEROCORE_CONJUNCTIONS,
    PEROCORE_ENVIRONMENT_DICTIONARY,
    PEROCORE_FILE_ANALYSIS_DICTIONARY,
    PEROCORE_INTENT_SPLITTERS,
    PEROCORE_MEMORY_TYPE_RULES,
    PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET,
    PEROCORE_PLANNING_DICTIONARY,
    PEROCORE_REFLECTION_DICTIONARY,
    PEROCORE_SOCIAL_DICTIONARY,
    PEROCORE_SYSTEM_PREFIXES,
    PEROCORE_SYSTEM_EVENT_DICTIONARY,
    PEROCORE_THOUGHT_CLUSTER_RULES,
    PEROCORE_WORK_MODE_DICTIONARY,
    matchPerocoreSystemPrefix,
    splitTextByPerocoreRules,
    stripPerocoreSystemPrefix,
};
export type {
    PerocoreMemoryTypeRule,
    PerocoreThoughtClusterRule,
};
