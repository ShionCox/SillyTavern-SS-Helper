import type { MemoryMigrationBatchStats, MemoryMigrationStatus } from '../types';
import { DEFAULT_MEMORY_MIGRATION_STATUS } from '../types';

/**
 * 功能：把迁移批次统计归一化为安全结构。
 * @param stats 原始批次统计。
 * @returns 归一化后的批次统计。
 */
export function normalizeMemoryMigrationBatchStats(
    stats: Partial<MemoryMigrationBatchStats> | null | undefined,
): MemoryMigrationBatchStats {
    const source: Partial<MemoryMigrationBatchStats> = stats ?? {};
    return {
        lifecycleFacts: Math.max(0, Math.floor(Number(source.lifecycleFacts ?? 0) || 0)),
        lifecycleSummaries: Math.max(0, Math.floor(Number(source.lifecycleSummaries ?? 0) || 0)),
        candidateRows: Math.max(0, Math.floor(Number(source.candidateRows ?? 0) || 0)),
        recallRows: Math.max(0, Math.floor(Number(source.recallRows ?? 0) || 0)),
        relationshipRows: Math.max(0, Math.floor(Number(source.relationshipRows ?? 0) || 0)),
        updatedAt: Math.max(0, Number(source.updatedAt ?? 0) || 0),
    };
}

/**
 * 功能：根据当前镜像与回填状态推导迁移阶段。
 * @param status 当前迁移状态。
 * @returns 应使用的迁移阶段。
 */
export function resolveMemoryMigrationStage(
    status: Pick<
        MemoryMigrationStatus,
        'lifecycleBackfilled' | 'candidateMirrorReady' | 'recallMirrorReady' | 'relationshipMirrorReady' | 'pendingBackfillReasons'
    >,
): MemoryMigrationStatus['stage'] {
    const pendingCount: number = Array.isArray(status.pendingBackfillReasons) ? status.pendingBackfillReasons.length : 0;
    const readyCount: number = [
        status.lifecycleBackfilled,
        status.candidateMirrorReady,
        status.recallMirrorReady,
        status.relationshipMirrorReady,
    ].filter(Boolean).length;
    if (readyCount === 4 && pendingCount === 0) {
        return 'db_preferred';
    }
    if (readyCount > 0) {
        return 'dual_write';
    }
    return 'legacy_compatible';
}

/**
 * 功能：判断当前是否应该执行自动迁移维护。
 * @param status 当前迁移状态。
 * @param now 当前时间戳。
 * @param force 是否强制执行。
 * @returns 是否应当执行自动迁移维护。
 */
export function shouldRunAutomaticMemoryMigration(
    status: MemoryMigrationStatus,
    now: number,
    force: boolean = false,
): boolean {
    if (force) {
        return true;
    }
    if (!status.autoBackfillEnabled) {
        return false;
    }
    const pendingCount: number = Array.isArray(status.pendingBackfillReasons) ? status.pendingBackfillReasons.length : 0;
    if (pendingCount === 0) {
        return now - Math.max(0, Number(status.lastAutoBackfillAt ?? 0) || 0) >= 1000 * 60 * 10;
    }
    return now - Math.max(0, Number(status.lastAutoBackfillAt ?? 0) || 0) >= 1000 * 15;
}

/**
 * 功能：把迁移状态补齐为完整可用结构。
 * @param status 原始迁移状态。
 * @returns 归一化后的迁移状态。
 */
export function normalizeMemoryMigrationStatus(
    status: Partial<MemoryMigrationStatus> | null | undefined,
): MemoryMigrationStatus {
    const source: Partial<MemoryMigrationStatus> = {
        ...DEFAULT_MEMORY_MIGRATION_STATUS,
        ...(status ?? {}),
    };
    const pendingBackfillReasons: string[] = Array.isArray(source.pendingBackfillReasons)
        ? source.pendingBackfillReasons.map((item: string): string => String(item ?? '').trim()).filter(Boolean)
        : [...DEFAULT_MEMORY_MIGRATION_STATUS.pendingBackfillReasons];
    const normalized: MemoryMigrationStatus = {
        ...DEFAULT_MEMORY_MIGRATION_STATUS,
        ...source,
        stage: (source.stage ?? DEFAULT_MEMORY_MIGRATION_STATUS.stage) as MemoryMigrationStatus['stage'],
        schemaVersion: Math.max(1, Math.floor(Number(source.schemaVersion ?? DEFAULT_MEMORY_MIGRATION_STATUS.schemaVersion) || DEFAULT_MEMORY_MIGRATION_STATUS.schemaVersion)),
        lifecycleBackfilled: source.lifecycleBackfilled === true,
        candidateMirrorReady: source.candidateMirrorReady === true,
        recallMirrorReady: source.recallMirrorReady === true,
        relationshipMirrorReady: source.relationshipMirrorReady === true,
        lastBackfillAt: Math.max(0, Number(source.lastBackfillAt ?? 0) || 0),
        autoBackfillEnabled: source.autoBackfillEnabled !== false,
        autoBackfillBatchSize: Math.max(8, Math.min(120, Math.floor(Number(source.autoBackfillBatchSize ?? DEFAULT_MEMORY_MIGRATION_STATUS.autoBackfillBatchSize) || DEFAULT_MEMORY_MIGRATION_STATUS.autoBackfillBatchSize))),
        lifecycleFactCursor: Math.max(0, Math.floor(Number(source.lifecycleFactCursor ?? 0) || 0)),
        lifecycleSummaryCursor: Math.max(0, Math.floor(Number(source.lifecycleSummaryCursor ?? 0) || 0)),
        lastAutoBackfillAt: Math.max(0, Number(source.lastAutoBackfillAt ?? 0) || 0),
        lastAutoBackfillReason: String(source.lastAutoBackfillReason ?? '').trim(),
        lastBatchStats: normalizeMemoryMigrationBatchStats(source.lastBatchStats ?? null),
        pendingBackfillReasons,
        updatedAt: Math.max(0, Number(source.updatedAt ?? 0) || 0),
    };
    normalized.stage = resolveMemoryMigrationStage(normalized);
    return normalized;
}
