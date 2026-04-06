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
    StoryTime,
} from './time-types';
import { DEFAULT_FALLBACK_RULES } from './time-types';
import { buildSequenceTime } from './sequence-time';
import { extractPreferredStoryTimeText, extractStoryTimeDescriptor } from './story-time-parser';

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
    sourceText?: string;
}): MemoryTimeContext {
    const { assessment, profile, firstFloor, lastFloor, source } = input;
    const preferredText = extractPreferredStoryTimeText(input.sourceText ?? '');
    const storyTimeBase = buildStoryTimeFromAssessment({
        assessment,
        profile,
        preferredText,
    });

    // 规则1：有明确 anchor → story_explicit
    if (assessment.anchorAfter || assessment.anchorBefore || storyTimeBase.absoluteText) {
        return {
            mode: 'story_explicit',
            storyTime: storyTimeBase,
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
            storyTime: storyTimeBase,
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
 * 功能：基于条目自身文本补齐时间上下文，优先补 richer 的 storyTime 字段。
 * @param input 补齐输入。
 * @returns 补齐后的时间上下文。
 */
export function enhanceMemoryTimeContextWithText(input: {
    timeContext: MemoryTimeContext;
    text?: string;
    sourceFloor?: number;
}): MemoryTimeContext {
    const rawText = String(input.text ?? '').trim();
    if (!rawText) {
        return input.timeContext;
    }
    const descriptor = extractStoryTimeDescriptor({
        text: rawText,
        sourceFloor: input.sourceFloor,
        fallbackStoryDayIndex: input.timeContext.storyTime?.storyDayIndex,
    });
    const preferredText = extractPreferredStoryTimeText(rawText);
    const nextStoryTime: StoryTime = compactStoryTime({
        calendarKind: input.timeContext.storyTime?.calendarKind,
        absoluteText: preferredText.absoluteText || input.timeContext.storyTime?.absoluteText,
        relativeText: preferredText.relativeText || input.timeContext.storyTime?.relativeText,
        normalized: descriptor.partOfDay
            ? { ...(input.timeContext.storyTime?.normalized ?? {}), partOfDay: descriptor.partOfDay }
            : input.timeContext.storyTime?.normalized,
        storyDayIndex: descriptor.storyDayIndex ?? input.timeContext.storyTime?.storyDayIndex,
        anchorEventId: descriptor.eventAnchors[0]?.eventId ?? input.timeContext.storyTime?.anchorEventId,
        anchorEventLabel: descriptor.anchorEventLabel ?? input.timeContext.storyTime?.anchorEventLabel,
        anchorRelation: descriptor.anchorRelation ?? input.timeContext.storyTime?.anchorRelation,
        relativePhaseLabel: descriptor.relativePhaseLabel ?? input.timeContext.storyTime?.relativePhaseLabel,
    });
    if (Object.keys(nextStoryTime).length <= 0) {
        return input.timeContext;
    }

    const nextMode = resolveEnhancedMode(input.timeContext.mode, nextStoryTime);
    return {
        ...input.timeContext,
        mode: nextMode,
        storyTime: nextStoryTime,
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
    const absolute = /\d+\s*年|\d+\s*月\s*\d+\s*日|[\u4e00-\u9fff]+年|星期|周[一二三四五六日天]|第[一二三四五六七八九十百千两零\d]+天|(?:清晨|上午|中午|正午|午后|下午|傍晚|夜晚|晚上|深夜)(?:到|至)(?:白日|白天|上午|中午|正午|午后|下午|傍晚|夜晚|晚上|深夜)/u;
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

function buildStoryTimeFromAssessment(input: {
    assessment: BatchTimeAssessment;
    profile?: MemoryTimelineProfile | null;
    preferredText: { absoluteText?: string; relativeText?: string };
}): StoryTime {
    const { assessment, profile, preferredText } = input;
    const anchorText = assessment.anchorAfter ?? assessment.anchorBefore ?? '';
    const explicitMentions = assessment.explicitMentions ?? [];
    const explicitMentionAbsolute = explicitMentions.find((item: string): boolean => isAbsoluteTimeText(item));
    const explicitMentionRelative = explicitMentions.find((item: string): boolean => !isAbsoluteTimeText(item));
    return compactStoryTime({
        calendarKind: profile?.calendarKind,
        normalized: assessment.partOfDay ? { partOfDay: assessment.partOfDay } : undefined,
        absoluteText: preferredText.absoluteText
            || (isAbsoluteTimeText(anchorText) ? anchorText : undefined)
            || explicitMentionAbsolute,
        relativeText: preferredText.relativeText
            || (!isAbsoluteTimeText(anchorText) ? anchorText : undefined)
            || explicitMentionRelative,
        storyDayIndex: assessment.storyDayIndex ?? profile?.currentStoryDayIndex,
        anchorEventId: assessment.anchorEventId ?? assessment.eventAnchors?.[0]?.eventId,
        anchorEventLabel: assessment.anchorEventLabel ?? assessment.eventAnchors?.[0]?.label,
        anchorRelation: assessment.anchorRelation,
        relativePhaseLabel: assessment.relativePhaseLabel,
    });
}

function compactStoryTime(storyTime: StoryTime): StoryTime {
    const result: StoryTime = {};
    if (storyTime.calendarKind) result.calendarKind = storyTime.calendarKind;
    if (String(storyTime.absoluteText ?? '').trim()) result.absoluteText = String(storyTime.absoluteText).trim();
    if (String(storyTime.relativeText ?? '').trim() && String(storyTime.relativeText).trim() !== result.absoluteText) {
        result.relativeText = String(storyTime.relativeText).trim();
    }
    if (storyTime.normalized && Object.keys(storyTime.normalized).length > 0) result.normalized = storyTime.normalized;
    if (storyTime.storyDayIndex) result.storyDayIndex = storyTime.storyDayIndex;
    if (String(storyTime.anchorEventId ?? '').trim()) result.anchorEventId = String(storyTime.anchorEventId).trim();
    if (String(storyTime.anchorEventLabel ?? '').trim()) result.anchorEventLabel = String(storyTime.anchorEventLabel).trim();
    if (storyTime.anchorRelation) result.anchorRelation = storyTime.anchorRelation;
    if (String(storyTime.relativePhaseLabel ?? '').trim()) result.relativePhaseLabel = String(storyTime.relativePhaseLabel).trim();
    return result;
}

function resolveEnhancedMode(currentMode: MemoryTimeMode, storyTime: StoryTime): MemoryTimeMode {
    if (storyTime.absoluteText) {
        return 'story_explicit';
    }
    if (
        storyTime.relativeText
        || storyTime.storyDayIndex
        || storyTime.anchorEventLabel
        || storyTime.anchorRelation
        || storyTime.relativePhaseLabel
        || storyTime.normalized?.partOfDay
    ) {
        return currentMode === 'sequence_fallback' ? 'story_inferred' : currentMode;
    }
    return currentMode;
}
