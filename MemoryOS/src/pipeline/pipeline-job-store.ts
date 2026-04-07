import type { PipelineJobRecord, PipelinePhase } from './pipeline-types';

const pipelineJobStore: Map<string, PipelineJobRecord> = new Map();

/**
 * 功能：写入或更新流水线任务记录。
 * @param record 任务记录。
 * @returns 最新任务记录。
 */
export function upsertPipelineJobRecord(record: PipelineJobRecord): PipelineJobRecord {
    const nextRecord: PipelineJobRecord = {
        ...record,
        updatedAt: Date.now(),
    };
    pipelineJobStore.set(record.jobId, nextRecord);
    return nextRecord;
}

/**
 * 功能：读取流水线任务记录。
 * @param jobId 任务标识。
 * @returns 任务记录。
 */
export function readPipelineJobRecord(jobId: string): PipelineJobRecord | null {
    return pipelineJobStore.get(jobId) ?? null;
}

/**
 * 功能：更新流水线阶段。
 * @param jobId 任务标识。
 * @param phase 阶段。
 * @returns 更新后的任务记录。
 */
export function updatePipelineJobPhase(jobId: string, phase: PipelinePhase): PipelineJobRecord | null {
    const current = pipelineJobStore.get(jobId);
    if (!current) {
        return null;
    }
    return upsertPipelineJobRecord({
        ...current,
        phase,
    });
}

/**
 * 功能：删除任务相关记录。
 * @param jobId 任务标识。
 */
export function clearPipelineJobRecord(jobId: string): void {
    pipelineJobStore.delete(jobId);
}
