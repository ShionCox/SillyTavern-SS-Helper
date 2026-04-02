/**
 * 功能：定义双时间轴记忆时间系统（Dual-Timeline Memory Time System）的全部数据模型。
 */

// ── 聊天级时间画像 ──

/**
 * 功能：时间画像模式。
 * - explicit_world_time: 文本中存在明确世界时间体系
 * - implicit_world_time: 没有稳定历法，但有明确相对时间推进语义
 * - sequence_only: 基本无法识别世界时间，使用系统时序作为主时间轴
 */
export type TimelineProfileMode = 'explicit_world_time' | 'implicit_world_time' | 'sequence_only';

/**
 * 功能：历法类型。
 */
export type CalendarKind = 'gregorian' | 'lunar' | 'ancient_era' | 'fantasy_custom' | 'academic_term' | 'floating' | 'unknown';

/**
 * 功能：一天中的时段。
 */
export type PartOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'midnight';

/**
 * 功能：归一化时间结构。
 */
export interface NormalizedTime {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    season?: string;
    partOfDay?: PartOfDay;
}

/**
 * 功能：时间信号类型。
 */
export type TimeSignalKind = 'explicit_date' | 'relative_time' | 'calendar_hint' | 'scene_transition' | 'schedule_hint';

/**
 * 功能：时间检测信号。
 */
export interface TimelineSignal {
    text: string;
    sourceFloor?: number;
    kind: TimeSignalKind;
    confidence: number;
}

/**
 * 功能：兜底推进规则。
 */
export interface FallbackTimeRules {
    sameSceneAdvance: { value: number; unit: 'minute' | 'hour' | 'scene' };
    sceneBreakAdvance: { value: number; unit: 'hour' | 'day' | 'scene' };
    sleepAdvance: { value: number; unit: 'hour' };
    hardCutAdvance: { value: number; unit: 'day' };
}

/**
 * 功能：聊天级时间画像。
 */
export interface MemoryTimelineProfile {
    profileId: string;
    mode: TimelineProfileMode;
    calendarKind: CalendarKind;
    anchorFloor: number;
    anchorTimeText?: string;
    anchorNormalized?: NormalizedTime;
    confidence: number;
    fallbackRules: FallbackTimeRules;
    signals?: TimelineSignal[];
    version: number;
    updatedAt: number;
}

// ── 批次级时间评估 ──

/**
 * 功能：时间推断单位。
 */
export type TimeUnit = 'minute' | 'hour' | 'day' | 'month' | 'year' | 'scene' | 'turn';

/**
 * 功能：持续时长提示。
 */
export interface DurationHint {
    text?: string;
    amount?: number;
    unit?: TimeUnit;
    confidence: number;
}

/**
 * 功能：批次级时间评估。
 */
export interface BatchTimeAssessment {
    batchId: string;
    floorRange: {
        startFloor: number;
        endFloor: number;
    };
    explicitMentions: string[];
    anchorBefore?: string;
    anchorAfter?: string;
    inferredElapsed?: DurationHint;
    sceneTransitions: string[];
    fallbackRecommended: boolean;
    source: 'model' | 'rule_engine' | 'hybrid';
    confidence: number;
}

// ── 记忆级时间上下文 ──

/**
 * 功能：记忆时间模式。
 * - story_explicit: 有明确故事时间
 * - story_inferred: 有推断得到的故事时间
 * - sequence_fallback: 没有故事时间，仅保留系统时序
 */
export type MemoryTimeMode = 'story_explicit' | 'story_inferred' | 'sequence_fallback';

/**
 * 功能：故事时间结构。
 */
export interface StoryTime {
    calendarKind?: CalendarKind;
    absoluteText?: string;
    relativeText?: string;
    normalized?: NormalizedTime;
}

/**
 * 功能：系统时序结构（必须始终存在）。
 */
export interface SequenceTime {
    firstFloor: number;
    lastFloor: number;
    batchId?: string;
    orderIndex: number;
}

/**
 * 功能：时间上下文来源。
 */
export type TimeContextSource = 'cold_start' | 'takeover_batch' | 'summary_batch' | 'fallback_engine' | 'manual';

/**
 * 功能：记忆级时间上下文。
 */
export interface MemoryTimeContext {
    mode: MemoryTimeMode;
    storyTime?: StoryTime;
    sequenceTime: SequenceTime;
    durationHint?: DurationHint;
    source: TimeContextSource;
    confidence: number;
}

// ── 按记忆类型的扩展时间字段 ──

/**
 * 功能：稳定事实类时间元数据。
 */
export interface StableFactTimeMeta {
    firstObservedAt: MemoryTimeContext;
    lastObservedAt: MemoryTimeContext;
    isStable: boolean;
}

/**
 * 功能：事件类时间元数据。
 */
export interface EventTimeMeta {
    eventTime: MemoryTimeContext;
    floorRange: { startFloor: number; endFloor: number };
    elapsedFromPrevious?: DurationHint;
}

/**
 * 功能：关系/状态类时间元数据。
 */
export interface IntervalTimeMeta {
    validFrom: MemoryTimeContext;
    validTo?: MemoryTimeContext;
    ongoing: boolean;
}

// ── 时间索引辅助 ──

/**
 * 功能：时间索引辅助字段。
 */
export interface MemoryTimeIndex {
    sortEpoch?: number;
    sequenceOrder: number;
    recencyBucket: 'recent' | 'mid' | 'old';
    timeLabel: string;
}

// ── 默认兜底规则 ──

export const DEFAULT_FALLBACK_RULES: FallbackTimeRules = {
    sameSceneAdvance: { value: 0, unit: 'scene' },
    sceneBreakAdvance: { value: 1, unit: 'scene' },
    sleepAdvance: { value: 8, unit: 'hour' },
    hardCutAdvance: { value: 1, unit: 'day' },
};
