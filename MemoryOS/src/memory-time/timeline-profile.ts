/**
 * 功能：聊天级时间画像检测与管理。
 */

import type {
    CalendarKind,
    MemoryTimelineProfile,
    StoryEventAnchor,
    TimelineProfileMode,
    TimelineSignal,
} from './time-types';
import { DEFAULT_FALLBACK_RULES as DEFAULTS } from './time-types';
import { extractStoryTimeDescriptor, extractTimeSignals } from './story-time-parser';

/**
 * 功能：从一组文本中检测并构建聊天级时间画像。
 * @param input 检测输入。
 * @returns 时间画像。
 */
export function detectTimelineProfile(input: {
    texts: string[];
    anchorFloor?: number;
    existingProfile?: MemoryTimelineProfile | null;
}): MemoryTimelineProfile {
    const allSignals: TimelineSignal[] = [];
    for (const text of input.texts) {
        allSignals.push(...extractTimeSignals(text, input.anchorFloor));
    }

    const explicitDateSignals = allSignals.filter(s => s.kind === 'explicit_date');
    const calendarHintSignals = allSignals.filter(s => s.kind === 'calendar_hint');
    const relativeTimeSignals = allSignals.filter(s => s.kind === 'relative_time');
    const scheduleHintSignals = allSignals.filter(s => s.kind === 'schedule_hint');
    const sceneSignals = allSignals.filter(s => s.kind === 'scene_transition');

    // 第一层：显式时间体系识别
    let mode: TimelineProfileMode = 'sequence_only';
    let calendarKind: CalendarKind = 'unknown';
    let anchorTimeText: string | undefined;
    let confidence = 0.3;
    const fallbackStoryDayIndex = input.existingProfile?.currentStoryDayIndex;
    const descriptors = input.texts.map((text: string) => extractStoryTimeDescriptor({
        text,
        sourceFloor: input.anchorFloor,
        fallbackStoryDayIndex,
    }));
    const currentStoryDayIndex = descriptors.map((item) => item.storyDayIndex).filter((value): value is number => Number.isFinite(value)).at(-1)
        ?? fallbackStoryDayIndex;
    const mergedAnchors = mergeStoryEventAnchors(
        input.existingProfile?.eventAnchors ?? [],
        descriptors.flatMap((item) => item.eventAnchors ?? []),
    );

    if (explicitDateSignals.length > 0) {
        mode = 'explicit_world_time';
        calendarKind = 'gregorian';
        const best = explicitDateSignals.reduce((a, b) => a.confidence > b.confidence ? a : b);
        anchorTimeText = best.text;
        confidence = Math.min(0.95, best.confidence + explicitDateSignals.length * 0.02);
    } else if (calendarHintSignals.length > 0) {
        mode = 'explicit_world_time';
        calendarKind = inferCalendarKind(calendarHintSignals);
        const best = calendarHintSignals.reduce((a, b) => a.confidence > b.confidence ? a : b);
        anchorTimeText = best.text;
        confidence = Math.min(0.92, best.confidence + calendarHintSignals.length * 0.02);
    } else if (scheduleHintSignals.length > 0) {
        mode = 'explicit_world_time';
        calendarKind = 'academic_term';
        const best = scheduleHintSignals.reduce((a, b) => a.confidence > b.confidence ? a : b);
        anchorTimeText = best.text;
        confidence = Math.min(0.85, best.confidence + scheduleHintSignals.length * 0.02);
    } else if (relativeTimeSignals.length >= 2) {
        // 第二层：隐式时间体系
        mode = 'implicit_world_time';
        calendarKind = 'floating';
        const best = relativeTimeSignals.reduce((a, b) => a.confidence > b.confidence ? a : b);
        anchorTimeText = best.text;
        confidence = Math.min(0.78, 0.5 + relativeTimeSignals.length * 0.04);
    } else if (relativeTimeSignals.length === 1 || sceneSignals.length >= 2) {
        mode = 'implicit_world_time';
        calendarKind = 'floating';
        confidence = 0.45;
    }
    // 否则保持 sequence_only

    const profileId = input.existingProfile?.profileId || `tp_${Date.now().toString(36)}`;
    const version = (input.existingProfile?.version ?? 0) + 1;

    return {
        profileId,
        mode,
        calendarKind,
        anchorFloor: input.anchorFloor ?? 0,
        anchorTimeText,
        confidence,
        currentStoryDayIndex,
        eventAnchors: mergedAnchors,
        fallbackRules: input.existingProfile?.fallbackRules ?? { ...DEFAULTS },
        signals: allSignals.length > 20 ? allSignals.slice(0, 20) : allSignals,
        version,
        updatedAt: Date.now(),
    };
}

/**
 * 功能：根据日历提示信号推断历法类型。
 */
function inferCalendarKind(signals: TimelineSignal[]): CalendarKind {
    const texts = signals.map(s => s.text).join(' ');

    if (/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/.test(texts)) {
        return 'lunar';
    }
    if (/[\u4e00-\u9fff]+年/.test(texts) && /[春夏秋冬]|腊月|正月/.test(texts)) {
        return 'ancient_era';
    }
    if (/历\s*\d+\s*年|第[一二三四五六七八九十]+纪/.test(texts)) {
        return 'fantasy_custom';
    }
    if (/[\u4e00-\u9fff]+年/.test(texts)) {
        return 'ancient_era';
    }
    return 'unknown';
}

/**
 * 功能：检查画像是否需要更新。
 */
export function shouldUpdateProfile(
    existing: MemoryTimelineProfile | null,
    newSignals: TimelineSignal[],
): boolean {
    if (!existing) return true;
    if (newSignals.length === 0) return false;

    // 如果新信号中有更高置信度的显式时间，则更新
    const maxNew = Math.max(...newSignals.map(s => s.confidence));
    if (maxNew > existing.confidence + 0.1) return true;

    // 如果模式从 sequence_only 可以升级
    if (existing.mode === 'sequence_only') {
        const hasExplicit = newSignals.some(s => s.kind === 'explicit_date' || s.kind === 'calendar_hint');
        const hasRelative = newSignals.filter(s => s.kind === 'relative_time').length >= 2;
        if (hasExplicit || hasRelative) return true;
    }

    return false;
}

/**
 * 功能：根据新文本解析结果决定时间画像是否需要演进，并返回应持久化的画像。
 * @param input 演进输入。
 * @returns 演进结果。
 */
export function resolveTimelineProfileEvolution(input: {
    texts: string[];
    anchorFloor?: number;
    existingProfile?: MemoryTimelineProfile | null;
}): {
    shouldPersist: boolean;
    profile: MemoryTimelineProfile;
    reason: 'init' | 'upgrade' | 'keep';
} {
    const existingProfile = input.existingProfile ?? null;
    const detectedProfile = detectTimelineProfile({
        texts: input.texts,
        anchorFloor: input.anchorFloor,
        existingProfile,
    });
    if (!existingProfile) {
        if (detectedProfile.mode !== 'sequence_only') {
            return {
                shouldPersist: true,
                profile: detectedProfile,
                reason: 'init',
            };
        }
        const fallbackProfile = createSequenceOnlyProfile();
        return {
            shouldPersist: true,
            profile: {
                ...fallbackProfile,
                anchorFloor: detectedProfile.anchorFloor,
                confidence: Math.max(fallbackProfile.confidence, detectedProfile.confidence),
                fallbackRules: detectedProfile.fallbackRules,
                signals: detectedProfile.signals,
            },
            reason: 'init',
        };
    }
    if (!shouldUpdateProfile(existingProfile, detectedProfile.signals ?? [])) {
        const anchorsChanged = (detectedProfile.eventAnchors?.length ?? 0) > (existingProfile.eventAnchors?.length ?? 0);
        const storyDayChanged = Number(detectedProfile.currentStoryDayIndex ?? 0) > Number(existingProfile.currentStoryDayIndex ?? 0);
        if (anchorsChanged || storyDayChanged) {
            return {
                shouldPersist: true,
                profile: detectedProfile,
                reason: 'upgrade',
            };
        }
        return {
            shouldPersist: false,
            profile: existingProfile,
            reason: 'keep',
        };
    }
    return {
        shouldPersist: true,
        profile: detectedProfile,
        reason: 'upgrade',
    };
}

/**
 * 功能：创建空白序列模式画像。
 */
export function createSequenceOnlyProfile(): MemoryTimelineProfile {
    return {
        profileId: `tp_${Date.now().toString(36)}`,
        mode: 'sequence_only',
        calendarKind: 'unknown',
        anchorFloor: 0,
        confidence: 0.3,
        eventAnchors: [],
        fallbackRules: { ...DEFAULTS },
        version: 1,
        updatedAt: Date.now(),
    };
}

export function mergeStoryEventAnchors(existing: StoryEventAnchor[], incoming: StoryEventAnchor[]): StoryEventAnchor[] {
    const map = new Map<string, StoryEventAnchor>();
    [...existing, ...incoming].forEach((anchor: StoryEventAnchor, index: number) => {
        const key = String(anchor.label ?? '').trim();
        if (!key) {
            return;
        }
        const normalized: StoryEventAnchor = {
            ...anchor,
            eventId: String(anchor.eventId ?? '').trim() || `anchor:${index}`,
        };
        const current = map.get(key);
        if (!current) {
            map.set(key, normalized);
            return;
        }
        map.set(key, {
            ...current,
            storyDayIndex: normalized.storyDayIndex ?? current.storyDayIndex,
            partOfDay: normalized.partOfDay ?? current.partOfDay,
            firstFloor: Math.min(current.firstFloor, normalized.firstFloor),
            lastFloor: Math.max(current.lastFloor, normalized.lastFloor),
            confidence: Math.max(current.confidence, normalized.confidence),
        });
    });
    const anchors = Array.from(map.values()).sort((left, right) => left.firstFloor - right.firstFloor);
    return anchors.map((anchor: StoryEventAnchor, index: number) => ({
        ...anchor,
        previousEventId: index > 0 ? anchors[index - 1]?.eventId : undefined,
        nextEventId: index < anchors.length - 1 ? anchors[index + 1]?.eventId : undefined,
    }));
}
