/**
 * 功能：检索和注入时的时间加权计算。
 */

import type { MemoryTimeContext, MemoryTimeIndex } from './time-types';

// ── 近期查询关键词 ──

const RECENT_QUERY_KEYWORDS = [
    '现在', '最近', '刚才', '目前', '最新', '当前', '刚刚', '刚', '此刻',
    '这会儿', '眼下', '如今', '正在', '今天', '今日', '方才',
];

// ── 远期查询关键词 ──

const EARLY_QUERY_KEYWORDS = [
    '以前', '小时候', '最早', '当年', '当初', '过去', '从前', '曾经',
    '往日', '旧时', '刚认识', '第一次', '起初', '原本', '一开始',
];

/**
 * 功能：判断查询是否偏近期。
 * @param query 查询文本。
 * @returns 是否偏近期。
 */
export function isRecentQuery(query: string): boolean {
    const text = String(query ?? '').trim();
    return RECENT_QUERY_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * 功能：判断查询是否偏远期。
 * @param query 查询文本。
 * @returns 是否偏远期。
 */
export function isEarlyQuery(query: string): boolean {
    const text = String(query ?? '').trim();
    return EARLY_QUERY_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * 功能：为近期记忆计算增益。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 0~1 增益值。
 */
export function boostRecent(timeCtx: MemoryTimeContext, currentMaxFloor: number): number {
    const floor = timeCtx.sequenceTime.lastFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const recencyRatio = floor / maxFloor;
    return Math.min(1, recencyRatio * 0.8 + 0.1);
}

/**
 * 功能：为远期记忆计算增益。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 0~1 增益值。
 */
export function boostEarly(timeCtx: MemoryTimeContext, currentMaxFloor: number): number {
    const floor = timeCtx.sequenceTime.firstFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const earlyRatio = 1 - (floor / maxFloor);
    return Math.min(1, earlyRatio * 0.7 + 0.15);
}

/**
 * 功能：计算时间敏感检索分数。
 * @param query 查询文本。
 * @param timeCtx 记忆时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间得分（可正可负或为0）。
 */
export function computeTimeBoost(
    query: string,
    timeCtx: MemoryTimeContext,
    currentMaxFloor: number,
): number {
    if (isRecentQuery(query)) {
        return boostRecent(timeCtx, currentMaxFloor);
    }
    if (isEarlyQuery(query)) {
        return boostEarly(timeCtx, currentMaxFloor);
    }
    return 0;
}

/**
 * 功能：生成时间索引辅助字段。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间索引。
 */
export function buildTimeIndex(timeCtx: MemoryTimeContext, currentMaxFloor: number): MemoryTimeIndex {
    const sequenceOrder = timeCtx.sequenceTime.orderIndex;
    const floor = timeCtx.sequenceTime.lastFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const ratio = floor / maxFloor;

    let recencyBucket: 'recent' | 'mid' | 'old';
    if (ratio >= 0.7) {
        recencyBucket = 'recent';
    } else if (ratio >= 0.3) {
        recencyBucket = 'mid';
    } else {
        recencyBucket = 'old';
    }

    const timeLabel = buildTimeLabel(timeCtx, currentMaxFloor);

    return {
        sequenceOrder,
        recencyBucket,
        timeLabel,
    };
}

/**
 * 功能：生成人类可读的时间标签。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间标签文本。
 */
export function buildTimeLabel(timeCtx: MemoryTimeContext, currentMaxFloor: number): string {
    if (timeCtx.mode === 'story_explicit') {
        const st = timeCtx.storyTime;
        if (st?.absoluteText) return st.absoluteText;
        if (st?.relativeText) return st.relativeText;
    }

    if (timeCtx.mode === 'story_inferred') {
        if (timeCtx.durationHint?.text) return `推断：${timeCtx.durationHint.text}`;
        if (timeCtx.storyTime?.relativeText) return `推断：${timeCtx.storyTime.relativeText}`;
    }

    // sequence_fallback
    const floorDiff = currentMaxFloor - timeCtx.sequenceTime.lastFloor;
    if (floorDiff <= 5) return '近期';
    if (floorDiff <= 20) return `较当前早约${floorDiff}层`;
    return `早期内容（约${floorDiff}层前）`;
}
