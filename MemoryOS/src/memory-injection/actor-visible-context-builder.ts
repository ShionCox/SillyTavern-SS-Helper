import type { MemoryEntry, PromptAssemblyRoleEntry } from '../types';
import { buildMemorySemanticTag, projectMemorySemanticRecord } from '../core/memory-semantic';
import { type RetentionStage } from '../memory-retention';
import { renderEventMemoryNarrative } from './narrative-renderer/event-renderer';
import { renderRelationshipNarrative } from './narrative-renderer/relationship-renderer';
import { renderWorldStateNarrative } from './narrative-renderer/world-renderer';
import { buildPromptTimeMeta } from '../memory-time/time-ranking';
import type { MemoryTimelineProfile, PromptTimeMeta } from '../memory-time/time-types';

/**
 * 功能：角色可见记忆视图。
 */
export interface ActorVisibleMemoryContext {
    timelineLines: string[];
    worldBaseLines: string[];
    sceneActiveLines: string[];
    sceneRecentLines: string[];
    entityLines: string[];
    diagnostics: {
        actorKey: string;
        totalInjectedCount: number;
        estimatedChars: number;
        retentionStageCounts: Record<RetentionStage, number>;
        shadowInjectedCount: number;
        shadowSectionVisible: boolean;
        timeInjectedCount: number;
        timeSourceCounts: Record<string, number>;
    };
    actorView: {
        actorKey: string;
        actorLabel: string;
        identityLines: string[];
        relationshipLines: string[];
        eventLines: string[];
        shadowEventLines: string[];
        interpretationLines: string[];
    };
}

/**
 * 功能：构建角色可见记忆视图输入。
 */
export interface BuildActorVisibleContextInput {
    entries: MemoryEntry[];
    roleEntries: PromptAssemblyRoleEntry[];
    activeActorKey?: string;
    timelineProfile?: MemoryTimelineProfile | null;
    injectionStyle?: string;
}

/**
 * 功能：构建当前角色可见记忆视图。
 * @param input 构建输入。
 * @returns 可见记忆上下文。
 */
export function buildActorVisibleMemoryContext(input: BuildActorVisibleContextInput): ActorVisibleMemoryContext {
    const activeActorKey = String(input.activeActorKey ?? '').trim();
    const targetRoleEntries = input.roleEntries.filter((entry: PromptAssemblyRoleEntry): boolean => {
        return activeActorKey ? entry.actorKey === activeActorKey : true;
    });
    const actorLabel = targetRoleEntries[0]?.actorLabel || activeActorKey || '当前角色';

    const currentMaxFloor = input.entries.reduce((max: number, e: MemoryEntry): number => {
        return Math.max(max, e.timeContext?.sequenceTime?.lastFloor ?? 0);
    }, 0);

    const worldBaseLines = input.entries
        .filter((entry: MemoryEntry): boolean => isWorldBaseType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => prependPromptTimeHeader(renderWorldStateNarrative({
            text: buildSemanticEntryLine(entry, entry.summary || entry.detail || '暂无详情'),
            injectionStyle: input.injectionStyle,
            entryType: entry.entryType,
            detailPayload: entry.detailPayload,
        }), entry.timeContext, currentMaxFloor));

    const sceneEntries = input.entries
        .filter((entry: MemoryEntry): boolean => isSceneSharedType(entry.entryType))
        .sort(compareEntriesByScenePriority(currentMaxFloor));
    const sceneActiveLines = sceneEntries
        .filter((entry: MemoryEntry): boolean => isActiveSceneEntry(entry, currentMaxFloor))
        .map((entry: MemoryEntry): string => renderSceneEntryLine(entry, currentMaxFloor));
    const sceneRecentLines = sceneEntries
        .filter((entry: MemoryEntry): boolean => !isActiveSceneEntry(entry, currentMaxFloor))
        .map((entry: MemoryEntry): string => renderSceneEntryLine(entry, currentMaxFloor));

    const entityLines = input.entries
        .filter((entry: MemoryEntry): boolean => isEntityType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => renderEntityLine(entry, currentMaxFloor, input.injectionStyle));

    const identityLines = targetRoleEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isIdentityType(entry.entryType))
        .slice(0, 30)
        .map((entry: PromptAssemblyRoleEntry): string => entry.renderedText);

    const relationshipLines = targetRoleEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isRelationshipType(entry.entryType))
        .slice(0, 30)
        .map((entry: PromptAssemblyRoleEntry): string => renderRelationshipNarrative(
            entry.renderedText,
            resolveRetentionStageFromRoleEntry(entry),
        ));

    const visibleEventEntries = targetRoleEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isVisibleEventType(entry.entryType) || isTaskProgressType(entry.entryType))
        .slice(0, 30);

    const eventLines = visibleEventEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => !isShadowTriggeredRoleEntry(entry))
        .slice(0, 30)
        .map((entry: PromptAssemblyRoleEntry): string => renderEventMemoryNarrative(
            entry.renderedText,
            resolveRetentionStageFromRoleEntry(entry),
        ));

    const shadowEventLines = visibleEventEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isShadowTriggeredRoleEntry(entry))
        .map((entry: PromptAssemblyRoleEntry): string => renderShadowEventNarrative(entry));

    const interpretationLines = targetRoleEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isInterpretationType(entry.entryType))
        .slice(0, 30)
        .map((entry: PromptAssemblyRoleEntry): string => entry.renderedText);

    const retentionStageCounts: Record<RetentionStage, number> = {
        clear: 0,
        blur: 0,
        distorted: 0,
    };
    targetRoleEntries.forEach((entry: PromptAssemblyRoleEntry): void => {
        const stage = resolveRetentionStageFromRoleEntry(entry);
        retentionStageCounts[stage] += 1;
    });
    const totalInjectedCount = worldBaseLines.length
        + sceneActiveLines.length
        + sceneRecentLines.length
        + entityLines.length
        + identityLines.length
        + relationshipLines.length
        + eventLines.length
        + shadowEventLines.length
        + interpretationLines.length;
    const estimatedChars = [
        ...worldBaseLines,
        ...sceneActiveLines,
        ...sceneRecentLines,
        ...entityLines,
        ...identityLines,
        ...relationshipLines,
        ...eventLines,
        ...shadowEventLines,
        ...interpretationLines,
    ].join('\n').length;
    const timeSourceCounts: Record<string, number> = {
        explicit_story: 0,
        inferred_story: 0,
        sequence_fallback: 0,
    };
    const timeInjectedCount = countPromptTimeMetaSources([
        ...input.entries
            .filter((entry: MemoryEntry): boolean => (
                isWorldBaseType(entry.entryType)
                || isSceneSharedType(entry.entryType)
                || isEntityType(entry.entryType)
            ))
            .map((entry: MemoryEntry): PromptTimeMeta | undefined => (
                entry.timeContext ? buildPromptTimeMeta(entry.timeContext, currentMaxFloor) : undefined
            )),
        ...targetRoleEntries
            .filter((entry: PromptAssemblyRoleEntry): boolean => (
                isIdentityType(entry.entryType)
                || isRelationshipType(entry.entryType)
                || isVisibleEventType(entry.entryType)
                || isTaskProgressType(entry.entryType)
                || isInterpretationType(entry.entryType)
            ))
            .map((entry: PromptAssemblyRoleEntry): PromptTimeMeta | undefined => entry.promptTimeMeta),
    ], timeSourceCounts);
    const timelineLines = buildTimelineLines(input.timelineProfile);

    return {
        timelineLines,
        worldBaseLines,
        sceneActiveLines,
        sceneRecentLines,
        entityLines,
        diagnostics: {
            actorKey: activeActorKey || 'actor',
            totalInjectedCount,
            estimatedChars,
            retentionStageCounts,
            shadowInjectedCount: shadowEventLines.length,
            shadowSectionVisible: shadowEventLines.length > 0,
            timeInjectedCount,
            timeSourceCounts,
        },
        actorView: {
            actorKey: activeActorKey || 'actor',
            actorLabel,
            identityLines: identityLines.length > 0 ? identityLines : [`${actorLabel}视角下的可见记忆摘要`],
            relationshipLines,
            eventLines,
            shadowEventLines,
            interpretationLines,
        },
    };
}

/**
 * 功能：判断是否为世界基础类型。
 * @param entryType 条目类型。
 * @returns 是否属于世界基础层。
 */
function isWorldBaseType(entryType: string): boolean {
    const normalized = normalizeType(entryType);
    return normalized === 'world_core_setting'
        || normalized === 'world_hard_rule'
        || normalized === 'world_global_state';
}

/**
 * 功能：判断是否为共享场景类型。
 * @param entryType 条目类型。
 * @returns 是否属于共享场景层。
 */
function isSceneSharedType(entryType: string): boolean {
    const normalized = normalizeType(entryType);
    return normalized === 'scene_shared_state' || normalized === 'location';
}

/**
 * 功能：判断是否为世界实体类型（组织/城市/国家/地点）。
 * @param entryType 条目类型。
 * @returns 是否属于实体层。
 */
function isEntityType(entryType: string): boolean {
    const normalized = normalizeType(entryType);
    return normalized === 'organization'
        || normalized === 'city'
        || normalized === 'nation';
}

/**
 * 功能：渲染实体条目为注入行。
 * @param entry 记忆条目。
 * @returns 渲染后的文本行。
 */
function renderEntityLine(entry: MemoryEntry, currentMaxFloor: number, injectionStyle?: string): string {
    const typeLabel = resolveEntityTypeLabel(entry.entryType);
    const summary = entry.summary || entry.detail || '暂无详情';
    const baseBody = `${buildMemorySemanticTag(projectMemorySemanticRecord({
        entryType: entry.entryType,
        ongoing: entry.ongoing,
        detailPayload: entry.detailPayload,
    })) || `[${typeLabel}]`} ${entry.title}：${summary}`;
    const body = renderWorldStateNarrative({
        text: baseBody,
        injectionStyle,
        entryType: entry.entryType,
        detailPayload: entry.detailPayload,
    });
    return prependPromptTimeHeader(body, entry.timeContext, currentMaxFloor);
}

function renderSceneEntryLine(entry: MemoryEntry, currentMaxFloor: number): string {
    const summary = entry.summary || entry.detail || '暂无详情';
    const body = buildSemanticEntryLine(entry, summary);
    const primaryLabelOverride = resolveScenePrimaryLabelOverride(entry, summary);
    return prependPromptTimeHeader(body, entry.timeContext, currentMaxFloor, primaryLabelOverride);
}

/**
 * 功能：解析实体类型的中文标签。
 * @param entryType 条目类型。
 * @returns 中文标签。
 */
function resolveEntityTypeLabel(entryType: string): string {
    const normalized = normalizeType(entryType);
    switch (normalized) {
        case 'organization': return '组织';
        case 'city': return '城市';
        case 'nation': return '国家';
        default: return '实体';
    }
}

/**
 * 功能：判断是否为身份类型。
 * @param entryType 条目类型。
 * @returns 是否属于身份层。
 */
function isIdentityType(entryType: string): boolean {
    return resolveTypeGroup(entryType) === 'identity';
}

/**
 * 功能：判断是否为关系类型。
 * @param entryType 条目类型。
 * @returns 是否属于关系层。
 */
function isRelationshipType(entryType: string): boolean {
    return resolveTypeGroup(entryType) === 'relationship';
}

/**
 * 功能：判断是否为可见事件类型。
 * @param entryType 条目类型。
 * @returns 是否属于可见事件层。
 */
function isVisibleEventType(entryType: string): boolean {
    const normalized = normalizeType(entryType);
    return normalized === 'actor_visible_event' || normalized === 'event';
}

function isTaskProgressType(entryType: string): boolean {
    return normalizeType(entryType) === 'task';
}

/**
 * 功能：判断是否为主观理解类型。
 * @param entryType 条目类型。
 * @returns 是否属于主观理解层。
 */
function isInterpretationType(entryType: string): boolean {
    const normalized = normalizeType(entryType);
    return normalized === 'actor_private_interpretation';
}

/**
 * 功能：根据角色条目解析遗忘阶段。
 * @param entry 角色条目。
 * @returns 遗忘阶段。
 */
function resolveRetentionStageFromRoleEntry(entry: PromptAssemblyRoleEntry): RetentionStage {
    return entry.retentionStage;
}

function isShadowTriggeredRoleEntry(entry: PromptAssemblyRoleEntry): boolean {
    return entry.forgettingTier === 'shadow_forgotten' && entry.shadowTriggered === true;
}

function renderShadowEventNarrative(entry: PromptAssemblyRoleEntry): string {
    const stage = resolveRetentionStageFromRoleEntry(entry);
    const penalty = Number(entry.shadowRecallPenalty ?? 0);
    const confidenceLabel = penalty >= 0.35 ? '低' : '偏低';
    const prefix = stage === 'distorted'
        ? '这是被问题唤起的失真记忆线索'
        : '这是被问题唤起的模糊记忆线索';
    return `${prefix}（置信：${confidenceLabel}）：${renderEventMemoryNarrative(entry.renderedText, stage)}`;
}

/**
 * 功能：标准化条目类型。
 * @param entryType 原始条目类型。
 * @returns 标准化结果。
 */
function normalizeType(entryType: string): string {
    return String(entryType ?? '').trim().toLowerCase();
}

/**
 * 功能：把条目类型归并到统一分组。
 * @param entryType 原始条目类型。
 * @returns 类型分组。
 */
function resolveTypeGroup(entryType: string): 'identity' | 'relationship' | 'other' {
    const normalized = normalizeType(entryType);
    const groupMap: Record<string, 'identity' | 'relationship'> = {
        identity: 'identity',
        identity_constraint: 'identity',
        actor_identity: 'identity',
        role_identity: 'identity',
        status_identity: 'identity',
        relationship: 'relationship',
        memory_relationship: 'relationship',
        actor_relation: 'relationship',
        actor_relationship: 'relationship',
        social_relationship: 'relationship',
    };
    return groupMap[normalized] ?? 'other';
}

/**
 * 功能：为注入行追加时间标签后缀。
 * @param text 原始文本行。
 * @param entry 记忆条目。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 追加时间标签后的文本行。
 */
function prependPromptTimeHeader(
    text: string,
    timeContext: MemoryEntry['timeContext'],
    currentMaxFloor: number,
    primaryLabelOverride?: string,
): string {
    const normalized = String(text ?? '').trim();
    if (!normalized || !timeContext) {
        return normalized;
    }
    const promptTimeMeta = buildPromptTimeMeta(timeContext, currentMaxFloor);
    const header = [
        primaryLabelOverride || promptTimeMeta.primaryLabel || promptTimeMeta.timeLabelForPrompt,
        promptTimeMeta.anchorDisplayLabel,
        promptTimeMeta.relativeToNowLabel,
        promptTimeMeta.timeSourceLabel,
        promptTimeMeta.timeConfidenceLabel,
    ].filter((item: string | undefined): item is string => Boolean(String(item ?? '').trim())).join('｜');
    return `[${header}] ${normalized}`;
}

/**
 * 功能：统计注入文本使用的时间来源分布。
 * @param values 时间元信息列表。
 * @param timeSourceCounts 来源统计对象。
 * @returns 带时间头的条目数量。
 */
function countPromptTimeMetaSources(
    values: Array<PromptTimeMeta | undefined>,
    timeSourceCounts: Record<string, number>,
): number {
    let count = 0;
    for (const value of values) {
        if (!value) {
            continue;
        }
        count += 1;
        timeSourceCounts[value.sourceMode] = (timeSourceCounts[value.sourceMode] ?? 0) + 1;
    }
    return count;
}

function buildSemanticEntryLine(entry: MemoryEntry, summary: string): string {
    const semanticTag = buildMemorySemanticTag(projectMemorySemanticRecord({
        entryType: entry.entryType,
        ongoing: entry.ongoing,
        detailPayload: entry.detailPayload,
    }));
    return `${semanticTag ? `${semanticTag} ` : ''}${entry.title}：${summary}`;
}

function buildTimelineLines(profile?: MemoryTimelineProfile | null): string[] {
    const anchors = Array.isArray(profile?.eventAnchors) ? profile.eventAnchors : [];
    if (anchors.length <= 0) {
        return [];
    }
    return anchors
        .slice(0, 5)
        .sort((left, right) => left.firstFloor - right.firstFloor)
        .map((anchor, index) => {
            const dayLabel = anchor.storyDayIndex ? `第${anchor.storyDayIndex}天` : '';
            const partLabel = resolveTimelinePartLabel(anchor.partOfDay);
            const timeLabel = [dayLabel, partLabel].filter(Boolean).join('');
            return `T${index + 1}：${[timeLabel, anchor.label].filter(Boolean).join('，')}`;
        });
}

function resolveTimelinePartLabel(part?: string): string {
    switch (part) {
        case 'dawn': return '清晨';
        case 'morning': return '上午';
        case 'noon': return '正午';
        case 'afternoon': return '午后';
        case 'evening': return '傍晚';
        case 'night': return '夜晚';
        case 'midnight': return '深夜';
        default: return '';
    }
}

function isActiveSceneEntry(entry: MemoryEntry, currentMaxFloor: number): boolean {
    const floorDiff = Math.max(0, currentMaxFloor - (entry.timeContext?.sequenceTime?.lastFloor ?? 0));
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const visibilityScope = String(fields.visibilityScope ?? payload.visibilityScope ?? '').trim();
    if (entry.ongoing === true) {
        return true;
    }
    if (floorDiff <= 12) {
        return true;
    }
    return /当前|现场|共处|同处|ongoing|active|present/u.test(visibilityScope);
}

function compareEntriesByScenePriority(currentMaxFloor: number): (left: MemoryEntry, right: MemoryEntry) => number {
    return (left: MemoryEntry, right: MemoryEntry): number => {
        const activeDiff = Number(isActiveSceneEntry(right, currentMaxFloor)) - Number(isActiveSceneEntry(left, currentMaxFloor));
        if (activeDiff !== 0) {
            return activeDiff;
        }
        return right.updatedAt - left.updatedAt;
    };
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function resolveScenePrimaryLabelOverride(entry: MemoryEntry, summary: string): string | undefined {
    if (hasRenderableStoryTime(entry.timeContext)) {
        return undefined;
    }
    const partLabel = resolveSceneSemanticPartLabel(`${entry.title} ${summary}`);
    if (!partLabel) {
        return undefined;
    }
    const storyDayIndex = entry.timeContext?.storyTime?.storyDayIndex;
    return storyDayIndex ? `第${storyDayIndex}天${partLabel}` : partLabel;
}

function resolveSceneSemanticPartLabel(text: string): string | undefined {
    const normalized = String(text ?? '').trim();
    if (!normalized) {
        return undefined;
    }
    const orderedMatchers: Array<{ pattern: RegExp; label: string }> = [
        { pattern: /清晨到白日|清晨至白日|清晨到白天|清晨至白天/u, label: '清晨到白日' },
        { pattern: /上午到中午|上午至中午/u, label: '上午到中午' },
        { pattern: /傍晚到深夜|傍晚至深夜/u, label: '傍晚到深夜' },
        { pattern: /深夜稍后|夜晚稍后/u, label: '深夜稍后' },
        { pattern: /清晨|凌晨|拂晓/u, label: '清晨' },
        { pattern: /早上|上午/u, label: '上午' },
        { pattern: /中午|正午/u, label: '正午' },
        { pattern: /午后|下午/u, label: '午后' },
        { pattern: /傍晚|黄昏/u, label: '傍晚' },
        { pattern: /夜晚|入夜|晚上/u, label: '夜晚' },
        { pattern: /深夜|半夜/u, label: '深夜' },
    ];
    return orderedMatchers.find((item) => item.pattern.test(normalized))?.label;
}

function hasRenderableStoryTime(timeContext?: MemoryEntry['timeContext']): boolean {
    const storyTime = timeContext?.storyTime;
    if (!storyTime) {
        return false;
    }
    return Boolean(
        String(storyTime.absoluteText ?? '').trim()
        || String(storyTime.relativeText ?? '').trim()
        || String(storyTime.anchorEventLabel ?? '').trim()
        || String(storyTime.relativePhaseLabel ?? '').trim()
        || storyTime.storyDayIndex
        || storyTime.normalized?.partOfDay,
    );
}
