import type {
    MemoryTakeoverBatch,
    MemoryTakeoverCreateInput,
    MemoryTakeoverMode,
    MemoryTakeoverPlan,
    MemoryTakeoverRange,
} from '../types';

/**
 * 功能：规范化楼层范围。
 * @param range 原始范围。
 * @param totalFloors 总楼层数。
 * @returns 规范化后的范围。
 */
export function normalizeTakeoverRange(range: MemoryTakeoverRange, totalFloors: number): MemoryTakeoverRange {
    const safeTotalFloors: number = Math.max(1, Math.trunc(Number(totalFloors) || 1));
    const startFloor: number = Math.max(1, Math.min(safeTotalFloors, Math.trunc(Number(range.startFloor) || 1)));
    const endFloor: number = Math.max(startFloor, Math.min(safeTotalFloors, Math.trunc(Number(range.endFloor) || safeTotalFloors)));
    return { startFloor, endFloor };
}

/**
 * 功能：生成接管计划。
 * @param input 创建输入。
 * @returns 接管计划。
 */
export function buildTakeoverPlan(input: {
    chatKey: string;
    chatId: string;
    takeoverId: string;
    totalFloors: number;
    defaults: {
        detectMinFloors: number;
        recentFloors: number;
        batchSize: number;
        prioritizeRecent: boolean;
        autoContinue: boolean;
        autoConsolidate: boolean;
        pauseOnError: boolean;
    };
    config?: MemoryTakeoverCreateInput;
}): MemoryTakeoverPlan {
    const now: number = Date.now();
    const totalFloors: number = Math.max(1, Math.trunc(Number(input.totalFloors) || 1));
    const mode: MemoryTakeoverMode = input.config?.mode ?? 'full';
    const requestedRecentFloors: number = Math.max(1, Math.trunc(Number(input.config?.recentFloors) || input.defaults.recentFloors));
    const requestedBatchSize: number = Math.max(1, Math.trunc(Number(input.config?.batchSize) || input.defaults.batchSize));
    const requestedUseActiveSnapshot: boolean = input.config?.useActiveSnapshot !== false;
    const requestedActiveSnapshotFloors: number = Math.max(
        1,
        Math.trunc(Number(input.config?.activeSnapshotFloors) || requestedRecentFloors),
    );

    const rawRange: MemoryTakeoverRange = mode === 'recent'
        ? {
            startFloor: Math.max(1, totalFloors - requestedRecentFloors + 1),
            endFloor: totalFloors,
        }
        : mode === 'custom_range'
            ? {
                startFloor: Math.trunc(Number(input.config?.startFloor) || 1),
                endFloor: Math.trunc(Number(input.config?.endFloor) || totalFloors),
            }
            : {
                startFloor: 1,
                endFloor: totalFloors,
            };

    const normalizedRange: MemoryTakeoverRange = normalizeTakeoverRange(rawRange, totalFloors);
    const activeWindow: MemoryTakeoverRange | null = requestedUseActiveSnapshot
        ? normalizeTakeoverRange({
            startFloor: Math.max(
                normalizedRange.startFloor,
                normalizedRange.endFloor - Math.max(1, requestedActiveSnapshotFloors) + 1,
            ),
            endFloor: normalizedRange.endFloor,
        }, totalFloors)
        : null;
    const totalBatches: number = buildTakeoverBatches({
        takeoverId: input.takeoverId,
        range: normalizedRange,
        activeWindow,
        batchSize: requestedBatchSize,
    }).length;

    return {
        chatKey: String(input.chatKey ?? '').trim(),
        chatId: String(input.chatId ?? '').trim(),
        takeoverId: String(input.takeoverId ?? '').trim(),
        status: 'idle',
        mode,
        range: normalizedRange,
        totalFloors,
        recentFloors: requestedRecentFloors,
        batchSize: requestedBatchSize,
        useActiveSnapshot: requestedUseActiveSnapshot,
        activeSnapshotFloors: requestedActiveSnapshotFloors,
        prioritizeRecent: input.config?.prioritizeRecent ?? input.defaults.prioritizeRecent,
        autoContinue: input.config?.autoContinue ?? input.defaults.autoContinue,
        autoConsolidate: input.config?.autoConsolidate ?? input.defaults.autoConsolidate,
        pauseOnError: input.config?.pauseOnError ?? input.defaults.pauseOnError,
        activeWindow,
        currentBatchIndex: 0,
        totalBatches,
        completedBatchIds: [],
        failedBatchIds: [],
        isolatedBatchIds: [],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 功能：根据计划生成批次切片。
 * @param input 批次构建输入。
 * @returns 批次列表。
 */
export function buildTakeoverBatches(input: {
    takeoverId: string;
    range: MemoryTakeoverRange;
    activeWindow: MemoryTakeoverRange | null;
    batchSize: number;
}): MemoryTakeoverBatch[] {
    const safeBatchSize: number = Math.max(1, Math.trunc(Number(input.batchSize) || 1));
    const batches: MemoryTakeoverBatch[] = [];
    const activeWindow: MemoryTakeoverRange | null = input.activeWindow
        ? {
            startFloor: input.activeWindow.startFloor,
            endFloor: input.activeWindow.endFloor,
        }
        : null;

    if (activeWindow) {
        batches.push({
            takeoverId: input.takeoverId,
            batchId: `${input.takeoverId}:active`,
            batchIndex: 0,
            range: activeWindow,
            category: 'active',
            status: 'pending',
            attemptCount: 0,
            sourceMessageIds: [],
        });
    }

    let batchIndex: number = 1;
    for (let startFloor: number = input.range.startFloor; startFloor <= input.range.endFloor; startFloor += safeBatchSize) {
        const endFloor: number = Math.min(input.range.endFloor, startFloor + safeBatchSize - 1);
        if (activeWindow && endFloor >= activeWindow.startFloor && startFloor <= activeWindow.endFloor) {
            continue;
        }
        batches.push({
            takeoverId: input.takeoverId,
            batchId: `${input.takeoverId}:history:${String(batchIndex).padStart(4, '0')}`,
            batchIndex,
            range: {
                startFloor,
                endFloor,
            },
            category: 'history',
            status: 'pending',
            attemptCount: 0,
            sourceMessageIds: [],
        });
        batchIndex += 1;
    }

    return batches;
}

/**
 * 功能：校验批次集合是否完整覆盖目标楼层范围。
 * @param range 目标范围。
 * @param batches 批次列表。
 * @returns 校验结果。
 */
export function validateTakeoverBatchCoverage(
    range: MemoryTakeoverRange,
    batches: Array<{ range: MemoryTakeoverRange }>,
): { covered: boolean; uncoveredRanges: MemoryTakeoverRange[] } {
    const uncoveredRanges: MemoryTakeoverRange[] = [];
    const sortedRanges = batches
        .map((item: { range: MemoryTakeoverRange }): MemoryTakeoverRange => ({
            startFloor: item.range.startFloor,
            endFloor: item.range.endFloor,
        }))
        .sort((left: MemoryTakeoverRange, right: MemoryTakeoverRange): number => left.startFloor - right.startFloor);

    let cursor = Math.max(1, Math.trunc(Number(range.startFloor) || 1));
    const endFloor = Math.max(cursor, Math.trunc(Number(range.endFloor) || cursor));

    for (const current of sortedRanges) {
        if (current.endFloor < cursor) {
            continue;
        }
        if (current.startFloor > cursor) {
            uncoveredRanges.push({
                startFloor: cursor,
                endFloor: current.startFloor - 1,
            });
        }
        cursor = Math.max(cursor, current.endFloor + 1);
        if (cursor > endFloor) {
            break;
        }
    }

    if (cursor <= endFloor) {
        uncoveredRanges.push({
            startFloor: cursor,
            endFloor,
        });
    }

    return {
        covered: uncoveredRanges.length === 0,
        uncoveredRanges,
    };
}
