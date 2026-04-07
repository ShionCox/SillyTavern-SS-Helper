/**
 * 功能：记忆级时间上下文工厂 — 根据记忆类型分配时间字段。
 */

import type {
    BatchTimeAssessment,
    EventTimeMeta,
    IntervalTimeMeta,
    MemoryTimeContext,
    MemoryTimelineProfile,
    StableFactTimeMeta,
} from './time-types';
import { mapBatchToMemoryTimeContext } from './fallback-time-engine';

/**
 * 功能：为稳定事实类记忆构建时间元数据。
 * @param timeContext 当前时间上下文。
 * @param existing 如已存在的时间元数据。
 * @returns 稳定事实时间元数据。
 */
export function buildStableFactTimeMeta(
    timeContext: MemoryTimeContext,
    existing?: StableFactTimeMeta | null,
): StableFactTimeMeta {
    return {
        firstObservedAt: existing?.firstObservedAt ?? timeContext,
        lastObservedAt: timeContext,
        isStable: true,
    };
}

/**
 * 功能：为事件类记忆构建时间元数据。
 * @param timeContext 当前时间上下文。
 * @param previousTimeContext 上一个事件的时间上下文。
 * @returns 事件时间元数据。
 */
export function buildEventTimeMeta(
    timeContext: MemoryTimeContext,
    previousTimeContext?: MemoryTimeContext | null,
): EventTimeMeta {
    return {
        eventTime: timeContext,
        floorRange: {
            startFloor: timeContext.sequenceTime.firstFloor,
            endFloor: timeContext.sequenceTime.lastFloor,
        },
        elapsedFromPrevious: timeContext.durationHint,
    };
}

/**
 * 功能：为关系/状态类记忆构建时间元数据。
 * @param timeContext 当前时间上下文。
 * @param existing 如已存在的区间元数据。
 * @param isOngoing 是否仍在持续。
 * @returns 区间时间元数据。
 */
export function buildIntervalTimeMeta(
    timeContext: MemoryTimeContext,
    existing?: IntervalTimeMeta | null,
    isOngoing: boolean = true,
): IntervalTimeMeta {
    if (existing && isOngoing) {
        return {
            validFrom: existing.validFrom,
            ongoing: true,
        };
    }
    if (existing && !isOngoing) {
        return {
            validFrom: existing.validFrom,
            validTo: timeContext,
            ongoing: false,
        };
    }
    return {
        validFrom: timeContext,
        ongoing: isOngoing,
    };
}

/**
 * 功能：根据记忆类型自动决定使用哪种时间元数据工厂。
 * @param entryType 记忆条目类型。
 * @param timeContext 当前时间上下文。
 * @returns 扩展时间字段对象。
 */
export function buildTimeMetaByEntryType(
    entryType: string,
    timeContext: MemoryTimeContext,
): Record<string, unknown> {
    const stableTypes = new Set([
        'world_core_setting', 'world_hard_rule', 'world_hard_rule_legacy',
        'nation', 'city', 'location', 'organization', 'item',
    ]);
    const eventTypes = new Set([
        'event', 'actor_visible_event',
    ]);
    const intervalTypes = new Set([
        'world_global_state', 'scene_shared_state',
        'task', 'actor_private_interpretation',
    ]);

    const normalized = String(entryType ?? '').trim();

    if (stableTypes.has(normalized)) {
        const meta = buildStableFactTimeMeta(timeContext);
        return {
            firstObservedAt: meta.firstObservedAt,
            lastObservedAt: meta.lastObservedAt,
            isStable: meta.isStable,
        };
    }

    if (eventTypes.has(normalized)) {
        const meta = buildEventTimeMeta(timeContext);
        return {
            eventTime: meta.eventTime,
            eventFloorRange: meta.floorRange,
            elapsedFromPrevious: meta.elapsedFromPrevious,
        };
    }

    if (intervalTypes.has(normalized)) {
        const meta = buildIntervalTimeMeta(timeContext);
        return {
            validFrom: meta.validFrom,
            ongoing: meta.ongoing,
        };
    }

    // 其他/关系类默认按区间
    return {
        validFrom: timeContext,
        ongoing: true,
    };
}
