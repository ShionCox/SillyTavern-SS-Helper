/**
 * 功能：旧数据迁移 — 为缺少 timeContext 的记忆条目回填序列兜底时间。
 */

import type { MemoryTimeContext } from './time-types';

/**
 * 功能：为旧记忆条目构建兜底 timeContext。
 * @param createdAt 条目创建时间（毫秒级时间戳）。
 * @param orderIndex 排序序号（按创建时间排序后的索引）。
 * @param batchId 可选批次 ID。
 * @returns 序列兜底时间上下文。
 */
export function buildMigrationFallbackTimeContext(
    createdAt: number,
    orderIndex: number,
    batchId?: string,
): MemoryTimeContext {
    return {
        mode: 'sequence_fallback',
        sequenceTime: {
            firstFloor: 0,
            lastFloor: 0,
            batchId,
            orderIndex,
        },
        source: 'fallback_engine',
        confidence: 0.35,
    };
}

/**
 * 功能：批量回填接口 — 调用者提供条目列表和保存函数。
 * @param entries 需要回填的条目（必须缺少 timeContext）。
 * @param saveTimeContext 保存函数。
 * @returns 回填的条目数。
 */
export async function backfillEntryTimeContexts(
    entries: Array<{ entryId: string; createdAt: number; timeContext?: unknown }>,
    saveTimeContext: (entryId: string, timeContext: MemoryTimeContext) => Promise<void>,
): Promise<number> {
    const needBackfill = entries
        .filter(e => !e.timeContext)
        .sort((a, b) => a.createdAt - b.createdAt);

    let backfilledCount = 0;
    for (let i = 0; i < needBackfill.length; i++) {
        const entry = needBackfill[i];
        const timeContext = buildMigrationFallbackTimeContext(entry.createdAt, i);
        await saveTimeContext(entry.entryId, timeContext);
        backfilledCount++;
    }
    return backfilledCount;
}
