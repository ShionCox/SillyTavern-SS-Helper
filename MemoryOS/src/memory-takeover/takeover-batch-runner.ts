import type {
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverRange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：统计批次消息的角色分布。
 * @param messages 消息列表。
 * @returns 角色统计对象。
 */
function computeBatchRoleStats(messages: MemoryTakeoverMessageSlice[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const message of messages) {
        stats[message.role] = (stats[message.role] || 0) + 1;
    }
    return stats;
}

/**
 * 功能：计算批次展示编号，避免把最近快照算进历史批次编号里。
 * @param batch 当前批次。
 * @param totalBatches 总批次数。
 * @returns 展示编号。
 */
function resolveBatchDisplayProgress(batch: MemoryTakeoverBatch, totalBatches: number): { current: number; total: number } {
    if (batch.category === 'history') {
        return {
            current: Math.max(1, batch.batchIndex),
            total: Math.max(1, totalBatches - 1),
        };
    }
    return {
        current: 1,
        total: Math.max(1, totalBatches),
    };
}

/**
 * 功能：执行单个历史批次分析。
 * @param input 执行输入。
 * @returns 批次结果。
 */
export async function runTakeoverBatch(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    batch: MemoryTakeoverBatch;
    totalBatches: number;
    messages: MemoryTakeoverMessageSlice[];
}): Promise<MemoryTakeoverBatchResult> {
    const roleStats = computeBatchRoleStats(input.messages);
    const userCount: number = roleStats['user'] || 0;
    const assistantCount: number = roleStats['assistant'] || 0;

    logger.info(`[takeover][batch][${input.batch.batchId}] role校验：`, {
        range: input.batch.range,
        total: input.messages.length,
        roleStats,
        floors: input.messages.slice(0, 10).map((message) => ({
            floor: message.floor,
            role: message.role,
            name: message.name,
        })),
    });

    if (input.messages.length > 0 && (userCount === 0 || assistantCount === 0)) {
        logger.warn(
            `[takeover][batch][${input.batch.batchId}] 单边批次告警：仅包含 ${userCount > 0 ? 'USER' : 'ASSISTANT'} 消息（user=${userCount}, assistant=${assistantCount}）`,
        );
    }

    const summary: string = input.messages
        .slice(0, 6)
        .map((message: MemoryTakeoverMessageSlice): string => `第${message.floor}层 [${message.role}] ${message.content}`)
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
    const displayProgress = resolveBatchDisplayProgress(input.batch, input.totalBatches);
    const structured = await runTakeoverStructuredTask<MemoryTakeoverBatchResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskId: 'memory_takeover_batch',
        taskDescription: `旧聊天处理（${displayProgress.current}/${displayProgress.total}）`,
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
 * 功能：确保批次结果范围存在。
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
        endFloor: Math.max(
            Math.trunc(Number(value.startFloor) || fallback.startFloor),
            Math.trunc(Number(value.endFloor) || fallback.endFloor),
        ),
    };
}
