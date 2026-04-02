/**
 * 功能：系统时序生成 — 楼层/批次/顺序时序生成。
 */

import type { SequenceTime } from './time-types';

/** 全局自增序号 */
let _globalOrderIndex = 0;

/**
 * 功能：重置全局序号（仅用于测试）。
 */
export function resetGlobalOrderIndex(value: number = 0): void {
    _globalOrderIndex = value;
}

/**
 * 功能：获取下一个全局序号。
 * @returns 自增序号。
 */
export function nextOrderIndex(): number {
    _globalOrderIndex += 1;
    return _globalOrderIndex;
}

/**
 * 功能：获取当前全局序号（不自增）。
 */
export function peekOrderIndex(): number {
    return _globalOrderIndex;
}

/**
 * 功能：从楼层范围构建系统时序。
 * @param firstFloor 起始楼层。
 * @param lastFloor 结束楼层。
 * @param batchId 批次ID（可选）。
 * @returns SequenceTime 结构。
 */
export function buildSequenceTime(
    firstFloor: number,
    lastFloor: number,
    batchId?: string,
): SequenceTime {
    return {
        firstFloor: Math.max(0, Number(firstFloor) || 0),
        lastFloor: Math.max(0, Number(lastFloor) || 0),
        batchId,
        orderIndex: nextOrderIndex(),
    };
}

/**
 * 功能：从已有数据恢复系统时序（不自增序号）。
 * @param data 数据载荷。
 * @returns SequenceTime 结构。
 */
export function restoreSequenceTime(data: {
    firstFloor?: number;
    lastFloor?: number;
    batchId?: string;
    orderIndex?: number;
}): SequenceTime {
    return {
        firstFloor: Math.max(0, Number(data.firstFloor) || 0),
        lastFloor: Math.max(0, Number(data.lastFloor) || 0),
        batchId: data.batchId,
        orderIndex: Number(data.orderIndex) || 0,
    };
}

/**
 * 功能：比较两个 SequenceTime 的先后。
 * @returns 负数=a更早，正数=a更晚，0=同时。
 */
export function compareSequenceTime(a: SequenceTime, b: SequenceTime): number {
    const floorDiff = a.firstFloor - b.firstFloor;
    if (floorDiff !== 0) return floorDiff;
    return a.orderIndex - b.orderIndex;
}
