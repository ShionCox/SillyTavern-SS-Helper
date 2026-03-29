import type { MemoryLLMApi } from './llm-types';

/**
 * 功能：向 LLMHub 注册 MemoryOS 结构化任务。
 * @param llm LLMHub SDK。
 * @param pluginId 插件 ID。
 */
export function registerMemoryLLMTasks(llm: MemoryLLMApi, pluginId: string): void {
    llm.registerConsumer({
        pluginId,
        displayName: 'Structured Memory Plugin',
        registrationVersion: 1,
        tasks: [
            {
                taskId: 'memory_cold_start',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '冷启动结构化记忆初始化',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_summary_planner',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '增量总结规划输出',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_summary_mutation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '增量总结变更输出',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_baseline',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '旧聊天接管静态基线抽取',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_active_snapshot',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '旧聊天接管最近活跃快照',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_batch',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '旧聊天接管历史批次分析',
                backgroundEligible: false,
            },
            {
                taskId: 'memory_takeover_consolidation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '旧聊天接管最终整合',
                backgroundEligible: false,
            },
        ],
    });
}
