import type { MemoryTakeoverCreateInput, MemoryTakeoverMode } from '../types';

/**
 * 功能：定义接管表单草稿。
 */
export interface MemoryTakeoverFormDraft {
    mode: MemoryTakeoverMode;
    startFloor: string;
    endFloor: string;
    recentFloors: string;
    batchSize: string;
    useActiveSnapshot: boolean;
    activeSnapshotFloors: string;
}

/**
 * 功能：定义接管模式下的字段显隐状态。
 */
export interface MemoryTakeoverFieldVisibility {
    showRecentFloors: boolean;
    showCustomRange: boolean;
    showActiveSnapshotFloors: boolean;
}

/**
 * 功能：定义接管表单解析结果。
 */
export interface MemoryTakeoverParsedDraft {
    config: MemoryTakeoverCreateInput;
    validationError?: string;
}

/**
 * 功能：根据模式解析字段显隐状态。
 * @param mode 当前接管模式。
 * @returns 字段显隐结果。
 */
export function resolveTakeoverFieldVisibility(mode: string): MemoryTakeoverFieldVisibility {
    const normalizedMode: MemoryTakeoverMode = normalizeTakeoverMode(mode);
    return {
        showRecentFloors: normalizedMode === 'recent',
        showCustomRange: normalizedMode === 'custom_range',
        showActiveSnapshotFloors: true,
    };
}

/**
 * 功能：归一化接管模式。
 * @param mode 原始模式。
 * @returns 安全的接管模式。
 */
export function normalizeTakeoverMode(mode: string): MemoryTakeoverMode {
    if (mode === 'recent' || mode === 'custom_range') {
        return mode;
    }
    return 'full';
}

/**
 * 功能：把表单草稿转换为接管配置，并做基础校验。
 * @param draft 接管表单草稿。
 * @returns 解析结果。
 */
export function parseTakeoverFormDraft(draft: MemoryTakeoverFormDraft): MemoryTakeoverParsedDraft {
    const mode: MemoryTakeoverMode = normalizeTakeoverMode(draft.mode);
    const startFloor: number = toPositiveInteger(draft.startFloor);
    const endFloor: number = toPositiveInteger(draft.endFloor);
    const recentFloors: number = toPositiveInteger(draft.recentFloors);
    const batchSize: number = toPositiveInteger(draft.batchSize);
    const activeSnapshotFloors: number = toPositiveInteger(draft.activeSnapshotFloors);

    if (draft.batchSize.trim() && batchSize <= 0) {
        return {
            config: { mode, useActiveSnapshot: draft.useActiveSnapshot },
            validationError: '每批楼层数必须大于 0。',
        };
    }

    if (draft.useActiveSnapshot && draft.activeSnapshotFloors.trim() && activeSnapshotFloors <= 0) {
        return {
            config: {
                mode,
                batchSize: batchSize > 0 ? batchSize : undefined,
                useActiveSnapshot: true,
            },
            validationError: '快照层数必须大于 0。',
        };
    }

    if (mode === 'recent') {
        if (recentFloors <= 0) {
            return {
                config: {
                    mode,
                    batchSize: batchSize > 0 ? batchSize : undefined,
                    useActiveSnapshot: draft.useActiveSnapshot,
                },
                validationError: '最近层数必须大于 0。',
            };
        }
        return {
            config: {
                mode,
                recentFloors,
                batchSize: batchSize > 0 ? batchSize : undefined,
                useActiveSnapshot: draft.useActiveSnapshot,
                activeSnapshotFloors: draft.useActiveSnapshot && activeSnapshotFloors > 0 ? activeSnapshotFloors : undefined,
            },
        };
    }

    if (mode === 'custom_range') {
        if (startFloor <= 0 || endFloor <= 0) {
            return {
                config: {
                    mode,
                    batchSize: batchSize > 0 ? batchSize : undefined,
                    useActiveSnapshot: draft.useActiveSnapshot,
                },
                validationError: '自定义区间需要填写有效的起始楼层和结束楼层。',
            };
        }
        if (startFloor > endFloor) {
            return {
                config: {
                    mode,
                    batchSize: batchSize > 0 ? batchSize : undefined,
                    useActiveSnapshot: draft.useActiveSnapshot,
                },
                validationError: '起始楼层不能大于结束楼层。',
            };
        }
        return {
            config: {
                mode,
                startFloor,
                endFloor,
                batchSize: batchSize > 0 ? batchSize : undefined,
                useActiveSnapshot: draft.useActiveSnapshot,
                activeSnapshotFloors: draft.useActiveSnapshot && activeSnapshotFloors > 0 ? activeSnapshotFloors : undefined,
            },
        };
    }

    return {
        config: {
            mode,
            batchSize: batchSize > 0 ? batchSize : undefined,
            useActiveSnapshot: draft.useActiveSnapshot,
            activeSnapshotFloors: draft.useActiveSnapshot && activeSnapshotFloors > 0 ? activeSnapshotFloors : undefined,
        },
    };
}

/**
 * 功能：把输入值转换为正整数。
 * @param value 输入文本。
 * @returns 正整数；非法时返回 0。
 */
function toPositiveInteger(value: string): number {
    const normalizedValue: number = Math.trunc(Number(String(value ?? '').trim()) || 0);
    return normalizedValue > 0 ? normalizedValue : 0;
}
