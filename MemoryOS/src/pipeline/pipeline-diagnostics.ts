import type { PipelineDiagnostics, PipelineJobType } from './pipeline-types';

/**
 * 功能：创建默认诊断信息。
 * @param jobId 任务标识。
 * @param jobType 任务类型。
 * @returns 诊断信息。
 */
export function createPipelineDiagnostics(jobId: string, jobType: PipelineJobType): PipelineDiagnostics {
    return {
        jobId,
        jobType,
        usedLLM: false,
        batchCount: 0,
        sectionCount: 0,
        conflictBucketCount: 0,
        resolvedConflictCount: 0,
        unresolvedConflictCount: 0,
        fallbackUsed: false,
        applyCount: 0,
        reasonCode: 'ok',
    };
}
