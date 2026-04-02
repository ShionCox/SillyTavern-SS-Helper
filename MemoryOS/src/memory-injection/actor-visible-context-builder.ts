import type { MemoryEntry, PromptAssemblyRoleEntry } from '../types';
import { type RetentionStage } from '../memory-retention';
import { renderEventMemoryNarrative } from './narrative-renderer/event-renderer';
import { renderRelationshipNarrative } from './narrative-renderer/relationship-renderer';
import { renderWorldStateNarrative } from './narrative-renderer/world-renderer';
import { buildPromptTimeMeta } from '../memory-time/time-ranking';
import type { PromptTimeMeta } from '../memory-time/time-types';

/**
 * 功能：角色可见记忆视图。
 */
export interface ActorVisibleMemoryContext {
    worldBaseLines: string[];
    sceneSharedLines: string[];
    entityLines: string[];
    diagnostics: {
        actorKey: string;
        totalInjectedCount: number;
        estimatedChars: number;
        retentionStageCounts: Record<RetentionStage, number>;
        timeInjectedCount: number;
        timeSourceCounts: Record<string, number>;
    };
    actorView: {
        actorKey: string;
        actorLabel: string;
        identityLines: string[];
        relationshipLines: string[];
        eventLines: string[];
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
        .map((entry: MemoryEntry): string => renderWorldStateNarrative(
            prependPromptTimeHeader(`${entry.title}：${entry.summary || entry.detail || '暂无详情'}`, entry.timeContext, currentMaxFloor),
        ));

    const sceneSharedLines = input.entries
        .filter((entry: MemoryEntry): boolean => isSceneSharedType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => prependPromptTimeHeader(
            `${entry.title}：${entry.summary || entry.detail || '暂无详情'}`,
            entry.timeContext,
            currentMaxFloor,
        ));

    const entityLines = input.entries
        .filter((entry: MemoryEntry): boolean => isEntityType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => renderEntityLine(entry, currentMaxFloor));

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

    const eventLines = targetRoleEntries
        .filter((entry: PromptAssemblyRoleEntry): boolean => isVisibleEventType(entry.entryType))
        .slice(0, 30)
        .map((entry: PromptAssemblyRoleEntry): string => renderEventMemoryNarrative(
            entry.renderedText,
            resolveRetentionStageFromRoleEntry(entry),
        ));

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
        + sceneSharedLines.length
        + entityLines.length
        + identityLines.length
        + relationshipLines.length
        + eventLines.length
        + interpretationLines.length;
    const estimatedChars = [
        ...worldBaseLines,
        ...sceneSharedLines,
        ...entityLines,
        ...identityLines,
        ...relationshipLines,
        ...eventLines,
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
                || isInterpretationType(entry.entryType)
            ))
            .map((entry: PromptAssemblyRoleEntry): PromptTimeMeta | undefined => entry.promptTimeMeta),
    ], timeSourceCounts);

    return {
        worldBaseLines,
        sceneSharedLines,
        entityLines,
        diagnostics: {
            actorKey: activeActorKey || 'actor',
            totalInjectedCount,
            estimatedChars,
            retentionStageCounts,
            timeInjectedCount,
            timeSourceCounts,
        },
        actorView: {
            actorKey: activeActorKey || 'actor',
            actorLabel,
            identityLines: identityLines.length > 0 ? identityLines : [`${actorLabel}视角下的可见记忆摘要`],
            relationshipLines,
            eventLines,
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
function renderEntityLine(entry: MemoryEntry, currentMaxFloor: number): string {
    const typeLabel = resolveEntityTypeLabel(entry.entryType);
    const summary = entry.summary || entry.detail || '暂无详情';
    const body = `[${typeLabel}] ${entry.title}：${summary}`;
    return prependPromptTimeHeader(body, entry.timeContext, currentMaxFloor);
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
    return false;
}

/**
 * 功能：判断是否为关系类型。
 * @param entryType 条目类型。
 * @returns 是否属于关系层。
 */
function isRelationshipType(entryType: string): boolean {
    return false;
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

/**
 * 功能：标准化条目类型。
 * @param entryType 原始条目类型。
 * @returns 标准化结果。
 */
function normalizeType(entryType: string): string {
    return String(entryType ?? '').trim().toLowerCase();
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
): string {
    const normalized = String(text ?? '').trim();
    if (!normalized || !timeContext) {
        return normalized;
    }
    const promptTimeMeta = buildPromptTimeMeta(timeContext, currentMaxFloor);
    const header = [
        `时间：${promptTimeMeta.timeLabelForPrompt}`,
        `来源：${promptTimeMeta.timeSourceLabel}`,
        ...(promptTimeMeta.timeConfidenceLabel ? [`置信度：${promptTimeMeta.timeConfidenceLabel}`] : []),
    ].join('｜');
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
