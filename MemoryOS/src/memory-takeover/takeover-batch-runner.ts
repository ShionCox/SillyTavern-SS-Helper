import type {
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverRange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';

/**
 * 功能：执行单个历史批次分析。
 * @param input 执行输入。
 * @returns 批次结果。
 */
export async function runTakeoverBatch(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    batch: MemoryTakeoverBatch;
    messages: MemoryTakeoverMessageSlice[];
}): Promise<MemoryTakeoverBatchResult> {
    const summary: string = input.messages
        .slice(0, 6)
        .map((message: MemoryTakeoverMessageSlice): string => `第${message.floor}层[${message.role}] ${message.content}`)
        .join('\n');
    const fallback: MemoryTakeoverBatchResult = {
        takeoverId: input.batch.takeoverId,
        batchId: input.batch.batchId,
        summary: summary || `第 ${input.batch.range.startFloor} ~ ${input.batch.range.endFloor} 层没有可提取摘要。`,
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [input.batch.category === 'active' ? '最近活跃' : '历史补建'],
        sourceRange: input.batch.range,
        generatedAt: Date.now(),
    };
    const structured = await runTakeoverStructuredTask<MemoryTakeoverBatchResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskId: 'memory_takeover_batch',
        systemSection: 'TAKEOVER_BATCH_SYSTEM',
        schemaSection: 'TAKEOVER_BATCH_SCHEMA',
        sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
        payload: {
            batchId: input.batch.batchId,
            batchCategory: input.batch.category,
            range: input.batch.range,
            messages: input.messages,
        },
    });
    return structured
        ? {
            ...fallback,
            ...structured,
            takeoverId: input.batch.takeoverId,
            batchId: input.batch.batchId,
            sourceRange: ensureRange(structured.sourceRange, input.batch.range),
            generatedAt: Date.now(),
        }
        : fallback;
}

/**
 * 功能：保证批次结果范围存在。
 * @param value 结构化输出范围。
 * @param fallback 默认范围。
 * @returns 规范化后的范围。
 */
function ensureRange(value: MemoryTakeoverRange | undefined, fallback: MemoryTakeoverRange): MemoryTakeoverRange {
    if (!value) {
        return fallback;
    }
    return {
        startFloor: Math.max(1, Math.trunc(Number(value.startFloor) || fallback.startFloor)),
        endFloor: Math.max(Math.trunc(Number(value.startFloor) || fallback.startFloor), Math.trunc(Number(value.endFloor) || fallback.endFloor)),
    };
}
