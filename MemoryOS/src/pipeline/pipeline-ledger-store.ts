import type {
    PipelineBatchResultRecord,
    PipelineConflictRecord,
    PipelineDomain,
    PipelineDomainLedgerRecord,
    PipelineSectionDigestRecord,
} from './pipeline-types';

const batchResultStore: Map<string, PipelineBatchResultRecord[]> = new Map();
const ledgerStore: Map<string, PipelineDomainLedgerRecord[]> = new Map();
const sectionDigestStore: Map<string, PipelineSectionDigestRecord[]> = new Map();

/**
 * 功能：写入批次结果暂存记录。
 * @param record 批次结果记录。
 */
export function appendPipelineBatchResultRecord(record: PipelineBatchResultRecord): void {
    const current = batchResultStore.get(record.jobId) ?? [];
    const filtered = current.filter((item: PipelineBatchResultRecord): boolean => !(item.batchId === record.batchId && item.domain === record.domain));
    filtered.push(record);
    batchResultStore.set(record.jobId, filtered);
}

/**
 * 功能：读取任务下的批次结果。
 * @param jobId 任务标识。
 * @returns 批次结果列表。
 */
export function listPipelineBatchResultRecords(jobId: string): PipelineBatchResultRecord[] {
    return [...(batchResultStore.get(jobId) ?? [])];
}

/**
 * 功能：按领域读取批次结果。
 * @param jobId 任务标识。
 * @param domain 领域。
 * @returns 领域批次结果列表。
 */
export function listPipelineBatchResultRecordsByDomain(jobId: string, domain: PipelineDomain): PipelineBatchResultRecord[] {
    return listPipelineBatchResultRecords(jobId).filter((item: PipelineBatchResultRecord): boolean => item.domain === domain);
}

/**
 * 功能：写入领域账本记录。
 * @param record 账本记录。
 */
export function upsertPipelineLedgerRecord(record: PipelineDomainLedgerRecord): void {
    const jobKey = `${record.jobId}:${record.domain}`;
    const current = ledgerStore.get(jobKey) ?? [];
    const filtered = current.filter((item: PipelineDomainLedgerRecord): boolean => item.ledgerKey !== record.ledgerKey);
    filtered.push(record);
    ledgerStore.set(jobKey, filtered);
}

/**
 * 功能：批量写入领域账本记录。
 * @param records 账本记录列表。
 */
export function replacePipelineLedgerRecords(records: PipelineDomainLedgerRecord[]): void {
    if (records.length <= 0) {
        return;
    }
    const grouped = new Map<string, PipelineDomainLedgerRecord[]>();
    for (const record of records) {
        const key = `${record.jobId}:${record.domain}`;
        const current = grouped.get(key) ?? [];
        current.push(record);
        grouped.set(key, current);
    }
    for (const [key, value] of grouped) {
        ledgerStore.set(key, value);
    }
}

/**
 * 功能：读取领域账本。
 * @param jobId 任务标识。
 * @param domain 领域。
 * @returns 账本记录列表。
 */
export function listPipelineLedgerRecords(jobId: string, domain: PipelineDomain): PipelineDomainLedgerRecord[] {
    return [...(ledgerStore.get(`${jobId}:${domain}`) ?? [])];
}

/**
 * 功能：写入分段摘要记录。
 * @param record 分段摘要记录。
 */
export function upsertPipelineSectionDigestRecord(record: PipelineSectionDigestRecord): void {
    const current = sectionDigestStore.get(record.jobId) ?? [];
    const filtered = current.filter((item: PipelineSectionDigestRecord): boolean => item.sectionId !== record.sectionId);
    filtered.push(record);
    sectionDigestStore.set(record.jobId, filtered);
}

/**
 * 功能：读取分段摘要记录。
 * @param jobId 任务标识。
 * @returns 分段摘要列表。
 */
export function listPipelineSectionDigestRecords(jobId: string): PipelineSectionDigestRecord[] {
    return [...(sectionDigestStore.get(jobId) ?? [])];
}

/**
 * 功能：根据冲突列表生成简短摘要文本。
 * @param conflicts 冲突列表。
 * @returns 摘要文本。
 */
export function summarizePipelineConflicts(conflicts: PipelineConflictRecord[]): string {
    if (conflicts.length <= 0) {
        return '无冲突';
    }
    return conflicts
        .map((item: PipelineConflictRecord): string => `${item.domain}:${item.conflictType}:${item.records.length}`)
        .join(' | ');
}

/**
 * 功能：清理任务暂存记录。
 * @param jobId 任务标识。
 */
export function clearPipelineLedgerState(jobId: string): void {
    batchResultStore.delete(jobId);
    sectionDigestStore.delete(jobId);
    for (const key of [...ledgerStore.keys()]) {
        if (key.startsWith(`${jobId}:`)) {
            ledgerStore.delete(key);
        }
    }
}
