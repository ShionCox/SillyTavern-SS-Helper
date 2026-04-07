/**
 * 功能：批次时间评估 — 对旧聊天/总结批次进行时间分析。
 */

import type { BatchTimeAssessment, DurationHint, FallbackTimeRules, MemoryTimelineProfile } from './time-types';
import { DEFAULT_FALLBACK_RULES } from './time-types';
import { extractStoryTimeDescriptor, extractTimeSignals, detectSleepAndWake, detectSceneTransitions, detectHardCuts } from './story-time-parser';

/**
 * 功能：对一个批次文本进行时间评估。
 * @param input 评估输入。
 * @returns 批次时间评估结果。
 */
export function assessBatchTime(input: {
    batchId: string;
    batchText: string;
    startFloor: number;
    endFloor: number;
    previousAnchor?: MemoryTimelineProfile | null;
    rules?: FallbackTimeRules;
}): BatchTimeAssessment {
    const rules = input.rules ?? input.previousAnchor?.fallbackRules ?? DEFAULT_FALLBACK_RULES;
    const text = String(input.batchText ?? '');

    const signals = extractTimeSignals(text, input.startFloor);
    const descriptor = extractStoryTimeDescriptor({
        text,
        sourceFloor: input.startFloor,
        fallbackStoryDayIndex: input.previousAnchor?.currentStoryDayIndex,
    });
    const explicitMentions = signals
        .filter(s => s.kind === 'explicit_date' || s.kind === 'relative_time' || s.kind === 'calendar_hint')
        .map(s => s.text);

    const sceneTransitions = detectSceneTransitions(text);
    const sleepSignals = detectSleepAndWake(text);
    const hardCutSignals = detectHardCuts(text);

    // 优先使用显式时间
    const explicitDateSignals = signals.filter(s => s.kind === 'explicit_date');
    const relativeTimeSignals = signals.filter(s => s.kind === 'relative_time');

    if (explicitDateSignals.length > 0 || relativeTimeSignals.length > 0) {
        const allTimeSignals = [...explicitDateSignals, ...relativeTimeSignals];
        const anchorBefore = allTimeSignals.length > 0 ? allTimeSignals[0].text : undefined;
        const anchorAfter = allTimeSignals.length > 1
            ? allTimeSignals[allTimeSignals.length - 1].text
            : anchorBefore;

        const inferred = inferElapsedFromExplicit(allTimeSignals, sleepSignals, rules);

        return {
            batchId: input.batchId,
            floorRange: { startFloor: input.startFloor, endFloor: input.endFloor },
            explicitMentions,
            anchorBefore,
            anchorAfter,
            storyDayIndex: descriptor.storyDayIndex,
            partOfDay: descriptor.partOfDay,
            anchorEventId: descriptor.eventAnchors[0]?.eventId,
            anchorEventLabel: descriptor.anchorEventLabel,
            anchorRelation: descriptor.anchorRelation,
            relativePhaseLabel: descriptor.relativePhaseLabel,
            eventAnchors: descriptor.eventAnchors,
            inferredElapsed: inferred,
            sceneTransitions,
            fallbackRecommended: false,
            source: 'hybrid',
            confidence: Math.min(0.92, 0.6 + allTimeSignals.length * 0.05),
        };
    }

    // 尝试从事件信号推断
    const inferred = inferElapsedFromSignals({ sceneTransitions, sleepSignals, hardCutSignals, rules });
    if (inferred) {
        return {
            batchId: input.batchId,
            floorRange: { startFloor: input.startFloor, endFloor: input.endFloor },
            explicitMentions,
            storyDayIndex: descriptor.storyDayIndex,
            partOfDay: descriptor.partOfDay,
            anchorEventId: descriptor.eventAnchors[0]?.eventId,
            anchorEventLabel: descriptor.anchorEventLabel,
            anchorRelation: descriptor.anchorRelation,
            relativePhaseLabel: descriptor.relativePhaseLabel,
            eventAnchors: descriptor.eventAnchors,
            sceneTransitions,
            inferredElapsed: inferred,
            fallbackRecommended: false,
            source: 'rule_engine',
            confidence: inferred.confidence,
        };
    }

    // 纯兜底
    return {
        batchId: input.batchId,
        floorRange: { startFloor: input.startFloor, endFloor: input.endFloor },
        explicitMentions: [],
        storyDayIndex: descriptor.storyDayIndex,
        partOfDay: descriptor.partOfDay,
        anchorEventId: descriptor.eventAnchors[0]?.eventId,
        anchorEventLabel: descriptor.anchorEventLabel,
        anchorRelation: descriptor.anchorRelation,
        relativePhaseLabel: descriptor.relativePhaseLabel,
        eventAnchors: descriptor.eventAnchors,
        sceneTransitions: [],
        fallbackRecommended: true,
        source: 'rule_engine',
        confidence: 0.35,
    };
}

/**
 * 功能：从显式时间信号推断经过时长。
 */
function inferElapsedFromExplicit(
    signals: Array<{ text: string; confidence: number }>,
    sleepSignals: string[],
    rules: FallbackTimeRules,
): DurationHint | undefined {
    // 检查相对时间表达
    for (const s of signals) {
        const nextDayMatch = s.text.match(/次日|翌日|第二天|隔[了]?天/);
        if (nextDayMatch) {
            return { text: '约过了一天', amount: 1, unit: 'day', confidence: 0.85 };
        }
        const thirdDayMatch = s.text.match(/第三天/);
        if (thirdDayMatch) {
            return { text: '约过了两天', amount: 2, unit: 'day', confidence: 0.83 };
        }
        const daysMatch = s.text.match(/([一二三四五六七八九十百千万]+|几|\d+)\s*(天|日|周|月|年)/);
        if (daysMatch) {
            const amount = parseChineseNumber(daysMatch[1]);
            const unit = normalizeTimeUnit(daysMatch[2]);
            return {
                text: `约过了${daysMatch[1]}${daysMatch[2]}`,
                amount,
                unit,
                confidence: 0.78,
            };
        }
    }

    if (sleepSignals.length > 0) {
        return {
            text: '约过了一夜',
            amount: rules.sleepAdvance.value,
            unit: rules.sleepAdvance.unit as any,
            confidence: 0.72,
        };
    }

    return undefined;
}

/**
 * 功能：从场景/睡眠/硬切信号推断时长。
 */
function inferElapsedFromSignals(input: {
    sceneTransitions: string[];
    sleepSignals: string[];
    hardCutSignals: string[];
    rules: FallbackTimeRules;
}): DurationHint | undefined {
    const { sceneTransitions, sleepSignals, hardCutSignals, rules } = input;

    if (hardCutSignals.length > 0) {
        return {
            text: hardCutSignals[0],
            amount: rules.hardCutAdvance.value,
            unit: rules.hardCutAdvance.unit as any,
            confidence: 0.6,
        };
    }

    if (sleepSignals.length > 0) {
        return {
            text: '约过了一夜',
            amount: rules.sleepAdvance.value,
            unit: rules.sleepAdvance.unit as any,
            confidence: 0.65,
        };
    }

    if (sceneTransitions.length >= 2) {
        return {
            text: `${sceneTransitions.length}次场景切换`,
            amount: sceneTransitions.length,
            unit: 'scene',
            confidence: 0.5,
        };
    }

    if (sceneTransitions.length === 1) {
        return {
            text: '一次场景切换',
            amount: 1,
            unit: 'scene',
            confidence: 0.45,
        };
    }

    return undefined;
}

/**
 * 功能：将中文数字转为阿拉伯数字（简易版）。
 */
function parseChineseNumber(text: string): number {
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed)) return parsed;

    const map: Record<string, number> = {
        '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '百': 100, '千': 1000, '万': 10000, '几': 3, '数': 5,
    };

    if (text.length === 1) return map[text] ?? 1;

    // 简单处理：十几、几十
    if (text === '十') return 10;
    if (text.startsWith('十')) return 10 + (map[text[1]] ?? 0);
    if (text.endsWith('十')) return (map[text[0]] ?? 1) * 10;

    return map[text[0]] ?? 1;
}

/**
 * 功能：标准化时间单位。
 */
function normalizeTimeUnit(unit: string): 'minute' | 'hour' | 'day' | 'month' | 'year' {
    switch (unit) {
        case '分钟': case '刻': return 'minute';
        case '小时': case '时辰': return 'hour';
        case '天': case '日': return 'day';
        case '周': return 'day'; // 需要乘以7
        case '月': case '个月': return 'month';
        case '年': return 'year';
        default: return 'day';
    }
}
