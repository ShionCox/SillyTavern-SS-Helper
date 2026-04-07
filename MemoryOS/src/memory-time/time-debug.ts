/**
 * 功能：时间调试日志与可视化辅助。
 */

import type { BatchTimeAssessment, MemoryTimeContext, MemoryTimelineProfile } from './time-types';

/**
 * 功能：时间调试日志记录。
 */
export interface TimeDebugLogEntry {
    ts: number;
    action: string;
    detail: Record<string, unknown>;
}

/**
 * 存储最近的调试日志。
 */
const _debugLog: TimeDebugLogEntry[] = [];
const MAX_LOG_SIZE = 200;

/**
 * 功能：记录时间调试日志。
 * @param action 动作名。
 * @param detail 详情。
 */
export function logTimeDebug(action: string, detail: Record<string, unknown>): void {
    _debugLog.push({ ts: Date.now(), action, detail });
    if (_debugLog.length > MAX_LOG_SIZE) {
        _debugLog.splice(0, _debugLog.length - MAX_LOG_SIZE);
    }
}

/**
 * 功能：获取调试日志副本。
 */
export function getTimeDebugLog(): TimeDebugLogEntry[] {
    return [..._debugLog];
}

/**
 * 功能：清空调试日志。
 */
export function clearTimeDebugLog(): void {
    _debugLog.length = 0;
}

/**
 * 功能：为工作台生成时间诊断解释。
 * @param timeCtx 记忆时间上下文。
 * @returns 可读的诊断文本。
 */
export function explainTimeContext(timeCtx: MemoryTimeContext): string {
    const lines: string[] = [];

    lines.push(`时间模式：${timeCtx.mode}`);

    if (timeCtx.mode === 'story_explicit') {
        if (timeCtx.storyTime?.absoluteText) {
            lines.push(`识别到显式时间表达："${timeCtx.storyTime.absoluteText}"`);
        }
        if (timeCtx.storyTime?.relativeText) {
            lines.push(`识别到相对时间表达："${timeCtx.storyTime.relativeText}"`);
        }
    } else if (timeCtx.mode === 'story_inferred') {
        lines.push('未找到明确时间锚点，根据场景信号推断');
        if (timeCtx.durationHint?.text) {
            lines.push(`推断经过时长：${timeCtx.durationHint.text}`);
        }
    } else {
        lines.push('未识别到任何时间信号，使用楼层顺序作为时序基准');
    }

    lines.push(`系统时序：第 ${timeCtx.sequenceTime.firstFloor}-${timeCtx.sequenceTime.lastFloor} 层`);
    lines.push(`来源：${timeCtx.source}`);
    lines.push(`置信度：${Math.round(timeCtx.confidence * 100)}%`);

    return lines.join('\n');
}

/**
 * 功能：为工作台生成批次时间诊断解释。
 * @param assessment 批次时间评估。
 * @returns 可读诊断文本。
 */
export function explainBatchAssessment(assessment: BatchTimeAssessment): string {
    const lines: string[] = [];

    lines.push(`批次 ${assessment.batchId} 时间评估：`);
    lines.push(`楼层范围：${assessment.floorRange.startFloor} - ${assessment.floorRange.endFloor}`);

    if (assessment.explicitMentions.length > 0) {
        lines.push(`检测到的时间表达：${assessment.explicitMentions.join('、')}`);
    }
    if (assessment.sceneTransitions.length > 0) {
        lines.push(`场景切换：${assessment.sceneTransitions.join('、')}`);
    }
    if (assessment.inferredElapsed?.text) {
        lines.push(`推断经过时长：${assessment.inferredElapsed.text}`);
    }
    if (assessment.fallbackRecommended) {
        lines.push('建议使用兜底规则（未识别到有效时间信号）');
    }

    lines.push(`判断来源：${assessment.source}`);
    lines.push(`置信度：${Math.round(assessment.confidence * 100)}%`);

    return lines.join('\n');
}

/**
 * 功能：为工作台生成时间画像诊断解释。
 * @param profile 时间画像。
 * @returns 可读诊断文本。
 */
export function explainTimelineProfile(profile: MemoryTimelineProfile): string {
    const lines: string[] = [];

    const modeReadable: Record<string, string> = {
        'explicit_world_time': '显式世界时间体系',
        'implicit_world_time': '隐式时间推进体系',
        'sequence_only': '纯系统时序（无世界时间）',
    };

    lines.push(`当前时间模式：${modeReadable[profile.mode] ?? profile.mode}`);
    lines.push(`历法类型：${profile.calendarKind}`);

    if (profile.anchorTimeText) {
        lines.push(`时间锚点："${profile.anchorTimeText}"（来自第 ${profile.anchorFloor} 层）`);
    }

    lines.push(`置信度：${Math.round(profile.confidence * 100)}%`);

    if (profile.signals && profile.signals.length > 0) {
        lines.push('检测依据：');
        for (const s of profile.signals.slice(0, 8)) {
            lines.push(`  - "${s.text}" (${s.kind}, 置信度 ${Math.round(s.confidence * 100)}%)`);
        }
    }

    return lines.join('\n');
}
