import type { KeywordDictionary } from '../types';
import { PEROCORE_CONJUNCTIONS } from './conjunctions';
import { PEROCORE_INTENT_SPLITTERS, splitTextByPerocoreRules } from './splitters';
import { PEROCORE_SYSTEM_PREFIXES, matchPerocoreSystemPrefix, stripPerocoreSystemPrefix } from './systemPrefixes';
import { PEROCORE_MEMORY_TYPE_RULES, PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET, type PerocoreMemoryTypeRule } from './memoryTypeRules';
import { PEROCORE_THOUGHT_CLUSTER_RULES, PEROCORE_CLUSTER_TO_ROUTE_HINTS, type PerocoreThoughtClusterRule } from './thoughtClusterRules';
import { PEROCORE_RELATIONSHIP_CONFLICT_DICTIONARY } from './relationshipConflictRules';
import { PEROCORE_WORLD_QA_DICTIONARY } from './worldQaRules';
import { PEROCORE_SCENE_DICTIONARY } from './sceneRules';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

/**
 * 功能：导出 PeroCore 兼容关键词包。
 */
export const PEROCORE_KEYWORD_DICTIONARIES: KeywordDictionary[] = [
    PEROCORE_RELATIONSHIP_CONFLICT_DICTIONARY,
    PEROCORE_WORLD_QA_DICTIONARY,
    PEROCORE_SCENE_DICTIONARY,
];

export {
    PEROCORE_ALIAS_GROUPS,
    PEROCORE_CLUSTER_TO_ROUTE_HINTS,
    PEROCORE_CONJUNCTIONS,
    PEROCORE_INTENT_SPLITTERS,
    PEROCORE_MEMORY_TYPE_RULES,
    PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET,
    PEROCORE_SYSTEM_PREFIXES,
    PEROCORE_THOUGHT_CLUSTER_RULES,
    matchPerocoreSystemPrefix,
    splitTextByPerocoreRules,
    stripPerocoreSystemPrefix,
};
export type {
    PerocoreMemoryTypeRule,
    PerocoreThoughtClusterRule,
};
