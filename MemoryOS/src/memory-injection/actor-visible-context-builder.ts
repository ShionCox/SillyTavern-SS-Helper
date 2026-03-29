import type { MemoryEntry, PromptAssemblyRoleEntry } from '../types';
import { computeRetentionState, type RetentionStage } from '../memory-retention';
import { renderEventMemoryNarrative } from './narrative-renderer/event-renderer';
import { renderRelationshipNarrative } from './narrative-renderer/relationship-renderer';
import { renderWorldStateNarrative } from './narrative-renderer/world-renderer';

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

    const worldBaseLines = input.entries
        .filter((entry: MemoryEntry): boolean => isWorldBaseType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => renderWorldStateNarrative(`${entry.title}：${entry.summary || entry.detail || '暂无详情'}`));

    const sceneSharedLines = input.entries
        .filter((entry: MemoryEntry): boolean => isSceneSharedType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => `${entry.title}：${entry.summary || entry.detail || '暂无详情'}`);

    const entityLines = input.entries
        .filter((entry: MemoryEntry): boolean => isEntityType(entry.entryType))
        .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
        .map((entry: MemoryEntry): string => renderEntityLine(entry));

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

    return {
        worldBaseLines,
        sceneSharedLines,
        entityLines,
        diagnostics: {
            actorKey: activeActorKey || 'actor',
            totalInjectedCount,
            estimatedChars,
            retentionStageCounts,
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
function renderEntityLine(entry: MemoryEntry): string {
    const typeLabel = resolveEntityTypeLabel(entry.entryType);
    const summary = entry.summary || entry.detail || '暂无详情';
    return `[${typeLabel}] ${entry.title}：${summary}`;
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
    const normalized = normalizeType(entryType);
    return normalized === 'actor_profile';
}

/**
 * 功能：判断是否为关系类型。
 * @param entryType 条目类型。
 * @returns 是否属于关系层。
 */
function isRelationshipType(entryType: string): boolean {
    return normalizeType(entryType) === 'relationship';
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
    return computeRetentionState({ memoryPercent: entry.memoryPercent }).stage;
}

/**
 * 功能：标准化条目类型。
 * @param entryType 原始条目类型。
 * @returns 标准化结果。
 */
function normalizeType(entryType: string): string {
    return String(entryType ?? '').trim().toLowerCase();
}
