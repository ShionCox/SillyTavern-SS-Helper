/**
 * 功能：双时间轴记忆时间系统统一导出。
 */

// ── 数据模型 ──
export type {
    TimelineProfileMode,
    CalendarKind,
    PartOfDay,
    NormalizedTime,
    TimeSignalKind,
    TimelineSignal,
    FallbackTimeRules,
    MemoryTimelineProfile,
    TimeUnit,
    DurationHint,
    BatchTimeAssessment,
    MemoryTimeMode,
    StoryTime,
    SequenceTime,
    TimeContextSource,
    MemoryTimeContext,
    StableFactTimeMeta,
    EventTimeMeta,
    IntervalTimeMeta,
    MemoryTimeIndex,
    PromptTimeMeta,
} from './time-types';
export { DEFAULT_FALLBACK_RULES } from './time-types';

// ── 聊天级时间画像 ──
export {
    detectTimelineProfile,
    shouldUpdateProfile,
    resolveTimelineProfileEvolution,
    createSequenceOnlyProfile,
} from './timeline-profile';

// ── 故事时间解析 ──
export {
    extractTimeSignals,
    detectSleepAndWake,
    detectSceneTransitions,
    detectHardCuts,
} from './story-time-parser';

// ── 系统时序 ──
export {
    buildSequenceTime,
    restoreSequenceTime,
    compareSequenceTime,
    nextOrderIndex,
    peekOrderIndex,
    resetGlobalOrderIndex,
} from './sequence-time';

// ── 批次时间评估 ──
export { assessBatchTime } from './batch-time-assessment';

// ── 兜底引擎 ──
export {
    mapBatchToMemoryTimeContext,
    buildFallbackTimeContext,
    mergeTimeContexts,
} from './fallback-time-engine';

// ── 记忆级时间上下文工厂 ──
export {
    buildStableFactTimeMeta,
    buildEventTimeMeta,
    buildIntervalTimeMeta,
    buildTimeMetaByEntryType,
} from './time-context';

// ── 时间排名 ──
export {
    isRecentQuery,
    isEarlyQuery,
    computeTimeBoost,
    boostRecent,
    boostEarly,
    buildTimeIndex,
    buildTimeLabel,
    buildPromptTimeMeta,
} from './time-ranking';

// ── 展示格式化 ──
export {
    formatTimeMode,
    formatTimeSource,
    formatConfidence,
    formatTimeContextForDisplay,
    formatBatchAssessmentForDisplay,
    formatTimelineProfileForDisplay,
} from './time-format';

// ── 调试 ──
export {
    logTimeDebug,
    getTimeDebugLog,
    clearTimeDebugLog,
    explainTimeContext,
    explainBatchAssessment,
    explainTimelineProfile,
    type TimeDebugLogEntry,
} from './time-debug';

// ── 迁移回填 ──
export {
    buildMigrationFallbackTimeContext,
    backfillEntryTimeContexts,
} from './time-migration';
