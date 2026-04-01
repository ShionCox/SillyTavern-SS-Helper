import type { MemoryLLMApi } from './llm-types';
import type { SummaryMutationDocument } from './mutation-types';

/**
 * 功能：执行单个 mutation 批次。
 * @param input 批次执行输入。
 * @returns 批次执行结果。
 */
export async function runSummaryMutationBatch(input: {
    llm: MemoryLLMApi;
    pluginId: string;
    taskDescription: string;
    systemPrompt: string;
    userPayload: string;
    schema: unknown;
}): Promise<{ ok: boolean; reasonCode?: string; data?: SummaryMutationDocument }> {
    const result = await input.llm.runTask<SummaryMutationDocument>({
        consumer: input.pluginId,
        taskKey: 'memory_summary_mutation',
        taskDescription: input.taskDescription,
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: input.systemPrompt },
                { role: 'user', content: input.userPayload },
            ],
        },
        schema: input.schema,
        enqueue: { displayMode: 'compact' },
    });
    return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, reasonCode: result.reasonCode || 'summary_llm_failed' };
}
