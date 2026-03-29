import type { SummaryMutationDocument } from './mutation-types';

/**
 * 功能：定义单个 mutation 批次暂存结果。
 */
export interface SummaryMutationBatchResultRecord {
    summaryJobId: string;
    batchId: string;
    focusTypes: string[];
    mutationDocument: SummaryMutationDocument;
}

/**
 * 功能：定义 mutation 阶段暂存快照。
 */
export interface SummaryMutationStagingSnapshot {
    summaryJobId: string;
    batchResults: SummaryMutationBatchResultRecord[];
}

const mutationStagingStore: Map<string, SummaryMutationStagingSnapshot> = new Map();

/**
 * 功能：追加 mutation 批次结果。
 * @param record 批次记录。
 * @returns 最新暂存快照。
 */
export function appendSummaryMutationBatchResult(record: SummaryMutationBatchResultRecord): SummaryMutationStagingSnapshot {
    const current = mutationStagingStore.get(record.summaryJobId) ?? {
        summaryJobId: record.summaryJobId,
        batchResults: [],
    };
    const filtered = current.batchResults.filter((item: SummaryMutationBatchResultRecord): boolean => item.batchId !== record.batchId);
    const nextSnapshot: SummaryMutationStagingSnapshot = {
        summaryJobId: record.summaryJobId,
        batchResults: [...filtered, record],
    };
    mutationStagingStore.set(record.summaryJobId, nextSnapshot);
    return nextSnapshot;
}

/**
 * 功能：读取 mutation 暂存快照。
 * @param summaryJobId 汇总任务标识。
 * @returns 暂存快照。
 */
export function readSummaryMutationStagingSnapshot(summaryJobId: string): SummaryMutationStagingSnapshot | null {
    return mutationStagingStore.get(summaryJobId) ?? null;
}

/**
 * 功能：清理 mutation 暂存快照。
 * @param summaryJobId 汇总任务标识。
 */
export function clearSummaryMutationStagingSnapshot(summaryJobId: string): void {
    mutationStagingStore.delete(summaryJobId);
}
