import type { RetrievalFacet } from '../../memory-retrieval/types';
import { PEROCORE_ALIAS_GROUPS } from './aliases';

export interface PerocoreMemoryTypeRule {
    id: string;
    label: string;
    memoryType: 'event' | 'fact' | 'preference' | 'promise' | 'inspiration';
    keywords: string[];
    facets: RetrievalFacet[];
}

/**
 * 功能：导出 PeroCore 记忆类型兼容映射。
 */
export const PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET: Record<PerocoreMemoryTypeRule['memoryType'], RetrievalFacet[]> = {
    event: ['event'],
    fact: ['world', 'interpretation'],
    preference: ['interpretation', 'relationship'],
    promise: ['event', 'relationship'],
    inspiration: ['interpretation', 'event'],
};

/**
 * 功能：导出 PeroCore 记忆类型规则。
 */
export const PEROCORE_MEMORY_TYPE_RULES: PerocoreMemoryTypeRule[] = [
    {
        id: 'perocore_memory_type_event',
        label: '事件型记忆',
        memoryType: 'event',
        keywords: ['发生', '后来', '当时', '那次', '经过', '结果', '经历', '事件', '瞬间'],
        facets: PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET.event,
    },
    {
        id: 'perocore_memory_type_fact',
        label: '事实型记忆',
        memoryType: 'fact',
        keywords: ['是什么', '为什么', '如何', '怎么', '事实', '知识', '知识点', '客观事实', ...PEROCORE_ALIAS_GROUPS.worldQa],
        facets: PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET.fact,
    },
    {
        id: 'perocore_memory_type_preference',
        label: '偏好型记忆',
        memoryType: 'preference',
        keywords: PEROCORE_ALIAS_GROUPS.preference,
        facets: PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET.preference,
    },
    {
        id: 'perocore_memory_type_promise',
        label: '承诺计划型记忆',
        memoryType: 'promise',
        keywords: PEROCORE_ALIAS_GROUPS.promise,
        facets: PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET.promise,
    },
    {
        id: 'perocore_memory_type_inspiration',
        label: '灵感型记忆',
        memoryType: 'inspiration',
        keywords: PEROCORE_ALIAS_GROUPS.inspiration,
        facets: PEROCORE_MEMORY_TYPE_TO_MEMORYOS_FACET.inspiration,
    },
];
