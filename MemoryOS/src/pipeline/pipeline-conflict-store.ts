import type { ConflictResolutionPatch, PipelineConflictBucketRecord, PipelineDomain } from './pipeline-types';

const conflictBucketStore: Map<string, PipelineConflictBucketRecord[]> = new Map();

/**
 * 功能：写入冲突桶记录。
 * @param record 冲突桶记录。
 */
export function upsertPipelineConflictBucketRecord(record: PipelineConflictBucketRecord): void {
    const current = conflictBucketStore.get(record.jobId) ?? [];
    const filtered = current.filter((item: PipelineConflictBucketRecord): boolean => item.bucketId !== record.bucketId);
    filtered.push(record);
    conflictBucketStore.set(record.jobId, filtered);
}

/**
 * 功能：读取任务下的冲突桶记录。
 * @param jobId 任务标识。
 * @returns 冲突桶列表。
 */
export function listPipelineConflictBucketRecords(jobId: string): PipelineConflictBucketRecord[] {
    return [...(conflictBucketStore.get(jobId) ?? [])];
}

/**
 * 功能：按领域读取冲突桶。
 * @param jobId 任务标识。
 * @param domain 领域。
 * @returns 冲突桶列表。
 */
export function listPipelineConflictBucketRecordsByDomain(jobId: string, domain: PipelineDomain): PipelineConflictBucketRecord[] {
    return listPipelineConflictBucketRecords(jobId).filter((item: PipelineConflictBucketRecord): boolean => item.domain === domain);
}

/**
 * 功能：写入冲突解决结果。
 * @param jobId 任务标识。
 * @param bucketId 冲突桶标识。
 * @param patch 解决补丁。
 * @param fallback 是否回退。
 */
export function resolvePipelineConflictBucket(jobId: string, bucketId: string, patch: ConflictResolutionPatch, fallback: boolean = false): void {
    const current = conflictBucketStore.get(jobId) ?? [];
    const next = current.map((item: PipelineConflictBucketRecord): PipelineConflictBucketRecord => {
        if (item.bucketId !== bucketId) {
            return item;
        }
        return {
            ...item,
            resolutionStatus: fallback ? 'fallback' : 'resolved',
            resolutionResult: patch,
        };
    });
    conflictBucketStore.set(jobId, next);
}

/**
 * 功能：清理任务冲突桶记录。
 * @param jobId 任务标识。
 */
export function clearPipelineConflictState(jobId: string): void {
    conflictBucketStore.delete(jobId);
}
