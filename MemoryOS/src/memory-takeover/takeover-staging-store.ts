import type { MemoryTakeoverActiveSnapshot, MemoryTakeoverBatchResult, MemoryTakeoverConsolidationResult } from '../types';
import type { ConflictResolutionPatch, PipelineConflictRecord, PipelineSectionDigestRecord } from '../pipeline/pipeline-types';
import { createInMemoryStagingRepository } from '../pipeline/staging-repository';

/**
 * 功能：定义旧聊天接管统一 staging 快照。
 */
export interface TakeoverSessionStaging {
    takeoverId: string;
    admittedBatchSignature: string;
    status: 'running' | 'paused' | 'failed' | 'completed';
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    batchResults: MemoryTakeoverBatchResult[];
    sectionDigests: PipelineSectionDigestRecord[];
    reducedLedger: {
        actors: unknown[];
        entities: unknown[];
        relationships: unknown[];
        tasks: unknown[];
        world: unknown[];
        facts: unknown[];
    } | null;
    unresolvedConflicts: PipelineConflictRecord[];
    conflictPatches: ConflictResolutionPatch[];
    finalResult: MemoryTakeoverConsolidationResult | null;
}

const takeoverStagingRepository = createInMemoryStagingRepository<TakeoverSessionStaging>();

/**
 * 功能：保存接管 staging 快照。
 * @param takeoverId 接管任务 ID。
 * @param snapshot staging 快照。
 */
export async function saveTakeoverStagingSnapshot(takeoverId: string, snapshot: TakeoverSessionStaging): Promise<void> {
    await takeoverStagingRepository.save(takeoverId, snapshot);
}

/**
 * 功能：读取接管 staging 快照。
 * @param takeoverId 接管任务 ID。
 * @returns staging 快照。
 */
export async function loadTakeoverStagingSnapshot(takeoverId: string): Promise<TakeoverSessionStaging | null> {
    return takeoverStagingRepository.load(takeoverId);
}

/**
 * 功能：追加接管 staging 快照补丁。
 * @param takeoverId 接管任务 ID。
 * @param patch 快照补丁。
 */
export async function appendTakeoverStagingSnapshot(
    takeoverId: string,
    patch: Partial<TakeoverSessionStaging>,
): Promise<void> {
    await takeoverStagingRepository.append(takeoverId, patch);
}

/**
 * 功能：清理接管 staging 快照。
 * @param takeoverId 接管任务 ID。
 */
export async function clearTakeoverStagingSnapshot(takeoverId: string): Promise<void> {
    await takeoverStagingRepository.clear(takeoverId);
}
