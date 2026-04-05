/**
 * 功能：时间兜底规则引擎 — 当无法识别精确故事时间时的推进策略。
 */

import type {
    BatchTimeAssessment,
    FallbackTimeRules,
    MemoryTimeContext,
    MemoryTimelineProfile,
    MemoryTimeMode,
    DurationHint,
} from './time-types';
import { DEFAULT_FALLBACK_RULES } from './time-types';
import { buildSequenceTime } from './sequence-time';

/**
 * 功能：从批次时间评估结果映射到记忆级时间上下文。
 * @param input 映射输入。
 * @returns 记忆级时间上下文。
 */
export function mapBatchToMemoryTimeContext(input: {
    assessment: BatchTimeAssessment;
    profile?: MemoryTimelineProfile | null;
    firstFloor: number;
    lastFloor: number;
    source: 'cold_start' | 'takeover_batch' | 'summary_batch' | 'fallback_engine' | 'manual';
}): MemoryTimeContext {
    const { assessment, profile, firstFloor, lastFloor, source } = input;

    // 规则1：有明确 anchor → story_explicit
    if (assessment.anchorAfter || assessment.anchorBefore) {
        return {
            mode: 'story_explicit',
            storyTime: {
                calendarKind: profile?.calendarKind,
                normalized: assessment.partOfDay ? { partOfDay: assessment.partOfDay } : undefined,
                absoluteText: isAbsoluteTimeText(assessment.anchorAfter ?? assessment.anchorBefore ?? '')
                    ? (assessment.anchorAfter ?? assessment.anchorBefore)
                    : undefined,
                relativeText: !isAbsoluteTimeText(assessment.anchorAfter ?? assessment.anchorBefore ?? '')
                    ? (assessment.anchorAfter ?? assessment.anchorBefore)
                    : undefined,
                storyDayIndex: assessment.storyDayIndex ?? profile?.currentStoryDayIndex,
                anchorEventId: assessment.anchorEventId ?? assessment.eventAnchors?.[0]?.eventId,
                anchorEventLabel: assessment.anchorEventLabel ?? assessment.eventAnchors?.[0]?.label,
                anchorRelation: assessment.anchorRelation,
                relativePhaseLabel: assessment.relativePhaseLabel,
            },
            sequenceTime: buildSequenceTime(firstFloor, lastFloor, assessment.batchId),
            durationHint: assessment.inferredElapsed,
            source,
            confidence: assessment.confidence,
        };
    }

    // 规则2：有推断时长但无明确锚点 → story_inferred
    if (assessment.inferredElapsed && !assessment.fallbackRecommended) {
        return {
            mode: 'story_inferred',
            storyTime: assessment.explicitMentions.length > 0 ? {
                calendarKind: profile?.calendarKind,
                relativeText: assessment.explicitMentions[0],
                normalized: assessment.partOfDay ? { partOfDay: assessment.partOfDay } : undefined,
                storyDayIndex: assessment.storyDayIndex ?? profile?.currentStoryDayIndex,
                anchorEventId: assessment.anchorEventId ?? assessment.eventAnchors?.[0]?.eventId,
                anchorEventLabel: assessment.anchorEventLabel ?? assessment.eventAnchors?.[0]?.label,
                anchorRelation: assessment.anchorRelation,
                relativePhaseLabel: assessment.relativePhaseLabel,
            } : {
                calendarKind: profile?.calendarKind,
                normalized: assessment.partOfDay ? { partOfDay: assessment.partOfDay } : undefined,
                storyDayIndex: assessment.storyDayIndex ?? profile?.currentStoryDayIndex,
                anchorEventId: assessment.anchorEventId ?? assessment.eventAnchors?.[0]?.eventId,
                anchorEventLabel: assessment.anchorEventLabel ?? assessment.eventAnchors?.[0]?.label,
                anchorRelation: assessment.anchorRelation,
                relativePhaseLabel: assessment.relativePhaseLabel,
            },
            sequenceTime: buildSequenceTime(firstFloor, lastFloor, assessment.batchId),
            durationHint: assessment.inferredElapsed,
            source,
            confidence: assessment.confidence,
        };
    }

    // 规则3：纯兜底 → sequence_fallback
    return {
        mode: 'sequence_fallback',
        sequenceTime: buildSequenceTime(firstFloor, lastFloor, assessment.batchId),
        durationHint: assessment.inferredElapsed,
        source,
        confidence: assessment.confidence,
    };
}

/**
 * 功能：为老数据创建兜底时间上下文。
 * @param input 迁移输入。
 * @returns 记忆级时间上下文。
 */
export function buildFallbackTimeContext(input: {
    firstFloor?: number;
    lastFloor?: number;
    batchId?: string;
    orderIndex?: number;
}): MemoryTimeContext {
    return {
        mode: 'sequence_fallback',
        sequenceTime: {
            firstFloor: Math.max(0, Number(input.firstFloor) || 0),
            lastFloor: Math.max(0, Number(input.lastFloor) || Number(input.firstFloor) || 0),
            batchId: input.batchId,
            orderIndex: Number(input.orderIndex) || 0,
        },
        source: 'fallback_engine',
        confidence: 0.35,
    };
}

/**
 * 功能：判断文本是否像绝对时间（而非相对时间）。
 */
function isAbsoluteTimeText(text: string): boolean {
    const absolute = /\d+\s*年|\d+\s*月\s*\d+\s*日|[\u4e00-\u9fff]+年|星期|周[一二三四五六日天]/;
    return absolute.test(text);
}

/**
 * 功能：合并两个时间上下文（取最新的）。
 */
export function mergeTimeContexts(a: MemoryTimeContext, b: MemoryTimeContext): MemoryTimeContext {
    // 优先取 story_explicit > story_inferred > sequence_fallback
    const modePriority: Record<MemoryTimeMode, number> = {
        'story_explicit': 3,
        'story_inferred': 2,
        'sequence_fallback': 1,
    };
    if (modePriority[b.mode] > modePriority[a.mode]) return b;
    if (modePriority[a.mode] > modePriority[b.mode]) return a;
    // 同级取置信度更高的
    return b.confidence >= a.confidence ? b : a;
}
