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
        registrationVersion: 2,
        tasks: [
            {
                taskId: 'memory_cold_start',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '冷启动结构化初始化',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_summary_planner',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '增量总结规划输出',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_summary_mutation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '增量总结变更输出',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_baseline',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理基础设定整理',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_active_snapshot',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理最近快照整理',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_batch',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理批次分析',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_consolidation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                maxTokens: 8192,
                description: '旧聊天处理最终整合',
                backgroundEligible: false,
            },
        ],
    });
}
