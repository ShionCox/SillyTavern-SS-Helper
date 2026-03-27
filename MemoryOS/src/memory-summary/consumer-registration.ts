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
                taskId: 'memory_summary_mutation',
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '增量总结并输出 mutation document',
                backgroundEligible: false,
            },
        ],
    });
}

