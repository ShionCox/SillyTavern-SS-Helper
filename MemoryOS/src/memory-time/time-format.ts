/**
 * 功能：时间格式化 — 工作台展示。
 */

import type { MemoryTimeContext, MemoryTimeMode, BatchTimeAssessment, MemoryTimelineProfile } from './time-types';

// ── 时间模式标签 ──

const MODE_LABELS: Record<MemoryTimeMode, string> = {
    'story_explicit': '明确故事时间',
    'story_inferred': '推断故事时间',
    'sequence_fallback': '系统时序兜底',
};

/**
 * 功能：格式化时间模式标签。
 */
export function formatTimeMode(mode: MemoryTimeMode): string {
    return MODE_LABELS[mode] ?? '未知';
}

/**
 * 功能：格式化时间来源标签。
 */
export function formatTimeSource(source: string): string {
    const map: Record<string, string> = {
        'cold_start': '冷启动',
        'takeover_batch': '旧聊天接管',
        'summary_batch': '总结批次',
        'fallback_engine': '兜底引擎',
        'manual': '手动修正',
    };
    return map[source] ?? source;
}

/**
 * 功能：格式化置信度为百分比显示。
 */
export function formatConfidence(value: number): string {
    return `${Math.round((Number(value) || 0) * 100)}%`;
}

/**
 * 功能：格式化记忆时间上下文为工作台展示卡片数据。
 * @param timeCtx 时间上下文。
 * @returns 展示字段列表。
 */
export function formatTimeContextForDisplay(timeCtx: MemoryTimeContext): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = [];

    rows.push({ label: '时间模式', value: formatTimeMode(timeCtx.mode) });

    if (timeCtx.storyTime) {
        if (timeCtx.storyTime.absoluteText) {
            rows.push({ label: '故事时间', value: timeCtx.storyTime.absoluteText });
        }
        if (timeCtx.storyTime.relativeText) {
            rows.push({ label: '相对时间', value: timeCtx.storyTime.relativeText });
        }
        if (timeCtx.storyTime.calendarKind && timeCtx.storyTime.calendarKind !== 'unknown') {
            rows.push({ label: '历法', value: formatCalendarKind(timeCtx.storyTime.calendarKind) });
        }
    }

    rows.push({ label: '楼层范围', value: `${timeCtx.sequenceTime.firstFloor} - ${timeCtx.sequenceTime.lastFloor}` });
    rows.push({ label: '序号', value: String(timeCtx.sequenceTime.orderIndex) });

    if (timeCtx.sequenceTime.batchId) {
        rows.push({ label: '批次', value: timeCtx.sequenceTime.batchId });
    }

    if (timeCtx.durationHint?.text) {
        rows.push({ label: '经过时长', value: timeCtx.durationHint.text });
    }

    rows.push({ label: '来源', value: formatTimeSource(timeCtx.source) });
    rows.push({ label: '置信度', value: formatConfidence(timeCtx.confidence) });

    return rows;
}

/**
 * 功能：格式化批次时间评估为展示数据。
 * @param assessment 批次时间评估。
 * @returns 展示字段列表。
 */
export function formatBatchAssessmentForDisplay(assessment: BatchTimeAssessment): Array<{ label: string; value: string }> {
    const rows: Array<{ label: string; value: string }> = [];

    rows.push({ label: '批次', value: assessment.batchId });
    rows.push({ label: '楼层', value: `${assessment.floorRange.startFloor} - ${assessment.floorRange.endFloor}` });

    if (assessment.explicitMentions.length > 0) {
        rows.push({ label: '识别到的时间表达', value: assessment.explicitMentions.join('、') });
    }
    if (assessment.anchorBefore) {
        rows.push({ label: '起始锚点', value: assessment.anchorBefore });
    }
    if (assessment.anchorAfter) {
        rows.push({ label: '结束锚点', value: assessment.anchorAfter });
    }
    if (assessment.inferredElapsed?.text) {
        rows.push({ label: '推断经过时长', value: assessment.inferredElapsed.text });
    }
    if (assessment.sceneTransitions.length > 0) {
        rows.push({ label: '场景切换', value: assessment.sceneTransitions.join('、') });
    }

    rows.push({ label: '来源', value: assessment.source });
    rows.push({ label: '置信度', value: formatConfidence(assessment.confidence) });
    rows.push({ label: '使用兜底规则', value: assessment.fallbackRecommended ? '是' : '否' });

    return rows;
}

/**
 * 功能：格式化时间画像总览。
 * @param profile 时间画像。
 * @returns 展示字段列表。
 */
export function formatTimelineProfileForDisplay(profile: MemoryTimelineProfile): Array<{ label: string; value: string }> {
    const modeMap: Record<string, string> = {
        'explicit_world_time': '显式世界时间',
        'implicit_world_time': '隐式时间推进',
        'sequence_only': '纯系统时序',
    };

    const rows: Array<{ label: string; value: string }> = [];

    rows.push({ label: '时间模式', value: modeMap[profile.mode] ?? profile.mode });
    rows.push({ label: '历法类型', value: formatCalendarKind(profile.calendarKind) });

    if (profile.anchorTimeText) {
        rows.push({ label: '当前时间锚点', value: profile.anchorTimeText });
    }

    rows.push({ label: '锚点楼层', value: String(profile.anchorFloor) });
    rows.push({ label: '置信度', value: formatConfidence(profile.confidence) });
    rows.push({ label: '版本', value: String(profile.version) });

    if (profile.signals && profile.signals.length > 0) {
        rows.push({
            label: '检测依据',
            value: profile.signals.slice(0, 5).map(s => `${s.text}(${s.kind})`).join('、'),
        });
    }

    return rows;
}

/**
 * 功能：格式化历法类型。
 */
function formatCalendarKind(kind: string): string {
    const map: Record<string, string> = {
        'gregorian': '公历',
        'lunar': '农历',
        'ancient_era': '古代纪年',
        'fantasy_custom': '奇幻纪年',
        'academic_term': '学期制',
        'floating': '浮动时间',
        'unknown': '未知',
    };
    return map[kind] ?? kind;
}
