import type { MemoryLLMApi } from './llm-types';

/**
 * 功能：向 LLMHub 注册 MemoryOS 的结构化任务与默认输出上限。
 * @param llm LLMHub SDK。
 * @param pluginId 插件 ID。
 * @returns 无返回值。
 */
export function registerMemoryLLMTasks(llm: MemoryLLMApi, pluginId: string): void {
    llm.registerConsumer({
        pluginId,
        displayName: '记忆系统',
        registrationVersion: 10,
        tasks: [
            {
                taskKey: 'memory_embedding',
                taskKind: 'embedding',
                requiredCapabilities: ['embeddings'],
                description: '记忆向量批量编码',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_cold_start_core',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '冷启动核心信息抽取',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_cold_start_state',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '冷启动近期状态抽取',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_vector_rerank',
                taskKind: 'rerank',
                requiredCapabilities: ['rerank'],
                description: '记忆向量结果重排序',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_summary_planner',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '增量总结规划输出',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_summary_mutation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '增量总结变更输出',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_dream_phase1',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '梦境第一阶段结构化输出',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_dream_phase2',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '梦境第二阶段结构化输出',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_baseline',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理基础设定整理',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_active_snapshot',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理最近快照整理',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_batch',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理批次分析',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_style_repair',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理文案修复',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_actor_completion',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理角色补全',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_content_block_classifier',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 4096,
                description: '旧聊天内容块兜底分类',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_actor_conflict_resolve',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理角色冲突裁决',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_entity_conflict_resolve',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理实体冲突裁决',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_relation_conflict_resolve',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理关系冲突裁决',
                backgroundEligible: false,
            },
            {
                taskKey: 'memory_takeover_world_conflict_resolve',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理世界状态冲突裁决',
                backgroundEligible: false,
            },
        ],
    });
}
