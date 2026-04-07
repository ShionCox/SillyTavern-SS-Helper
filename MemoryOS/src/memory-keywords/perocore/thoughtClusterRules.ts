import type { RetrievalFacet } from '../../memory-retrieval/types';

export interface PerocoreThoughtClusterRule {
    id: string;
    label: string;
    keywords: string[];
    facets: RetrievalFacet[];
}

/**
 * 功能：导出 PeroCore 思维簇兼容映射。
 */
export const PEROCORE_CLUSTER_TO_ROUTE_HINTS: Record<string, RetrievalFacet[]> = {
    逻辑推理簇: ['world', 'event'],
    历史报错簇: ['event', 'interpretation'],
    反思簇: ['interpretation'],
    情感偏好簇: ['interpretation', 'relationship'],
    人际关系簇: ['relationship'],
    计划意图簇: ['event'],
    创造灵感簇: ['interpretation', 'event'],
    闲聊簇: [],
};

/**
 * 功能：导出 PeroCore 思维簇规则。
 */
export const PEROCORE_THOUGHT_CLUSTER_RULES: PerocoreThoughtClusterRule[] = [
    {
        id: 'perocore_cluster_logic',
        label: '逻辑推理簇',
        keywords: ['为什么', '如何', '怎么', '是什么', '规则', '设定', '原因', '逻辑', '推理', '知识', '知识点', '事实', '客观事实', '方案', '解决'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.逻辑推理簇,
    },
    {
        id: 'perocore_cluster_error_history',
        label: '历史报错簇',
        keywords: ['报错', '错误', 'bug', 'debug', '异常', '修复', '修正', 'refactor'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.历史报错簇,
    },
    {
        id: 'perocore_cluster_reflection',
        label: '反思簇',
        keywords: ['我觉得', '我认为', '反思', '总结', '复盘', '改进', '修正', '反馈', '学习', '后悔', '怀疑', '哪里错', '教训', '回顾'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.反思簇,
    },
    {
        id: 'perocore_cluster_preference',
        label: '情感偏好簇',
        keywords: ['喜欢', '厌恶', '讨厌', '在意', '害怕', '担心', '情感', '心情', '感受', '性格', '价值观'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.情感偏好簇,
    },
    {
        id: 'perocore_cluster_relationship',
        label: '人际关系簇',
        keywords: ['关系', '朋友', '家人', '同事', '敌人', '信任', '怀疑', '互动', '社交', '群聊', '人际关系', '我们之间'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.人际关系簇,
    },
    {
        id: 'perocore_cluster_plan',
        label: '计划意图簇',
        keywords: ['计划', '方案', '路线图', '步骤', '目标', '规划', '安排', '项目', 'todo', '待办', '待办事项', '打算', '准备', '接下来', '之后', '愿望'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.计划意图簇,
    },
    {
        id: 'perocore_cluster_inspiration',
        label: '创造灵感簇',
        keywords: ['灵感', '创意', '点子', '构思', '脑洞', '写作素材', '艺术构思'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.创造灵感簇,
    },
    {
        id: 'perocore_cluster_smalltalk',
        label: '闲聊簇',
        keywords: ['闲聊', '聊天', '哈哈', '嗯嗯', '好的', '聊聊', '吐槽', '八卦'],
        facets: PEROCORE_CLUSTER_TO_ROUTE_HINTS.闲聊簇,
    },
];
