import type { ColdStartDocument } from './bootstrap-types';
import { createInMemoryStagingRepository } from '../pipeline/staging-repository';

/**
 * 功能：定义冷启动 staging 快照。
 */
export interface BootstrapStagingSnapshot {
    runId: string;
    status: 'running' | 'paused' | 'failed' | 'completed';
    coreDocument: ColdStartDocument | null;
    stateDocument: ColdStartDocument | null;
    reducedDocument: ColdStartDocument | null;
    finalizedDocument: ColdStartDocument | null;
}

const bootstrapStagingRepository = createInMemoryStagingRepository<BootstrapStagingSnapshot>();

/**
 * 功能：保存冷启动 staging 快照。
 * @param runId 运行 ID。
 * @param snapshot staging 快照。
 */
export async function saveBootstrapStagingSnapshot(runId: string, snapshot: BootstrapStagingSnapshot): Promise<void> {
    await bootstrapStagingRepository.save(runId, snapshot);
}

/**
 * 功能：读取冷启动 staging 快照。
 * @param runId 运行 ID。
 * @returns staging 快照。
 */
export async function loadBootstrapStagingSnapshot(runId: string): Promise<BootstrapStagingSnapshot | null> {
    return bootstrapStagingRepository.load(runId);
}

/**
 * 功能：追加冷启动 staging 快照。
 * @param runId 运行 ID。
 * @param patch staging 补丁。
 */
export async function appendBootstrapStagingSnapshot(runId: string, patch: Partial<BootstrapStagingSnapshot>): Promise<void> {
    await bootstrapStagingRepository.append(runId, patch);
}

/**
 * 功能：清理冷启动 staging 快照。
 * @param runId 运行 ID。
 */
export async function clearBootstrapStagingSnapshot(runId: string): Promise<void> {
    await bootstrapStagingRepository.clear(runId);
}
