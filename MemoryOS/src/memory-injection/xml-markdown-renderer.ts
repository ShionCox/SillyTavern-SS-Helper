import type { ActorVisibleMemoryContext } from './actor-visible-context-builder';
import { renderBulletLines } from './narrative-renderer/base-renderer';
import { getNarrativeStyleProfile } from './narrative-renderer/style-profiles';

/**
 * 功能：定义注入层预算配置。
 */
export interface XmlNarrativeBudgetOptions {
    timelineMaxItems: number;
    worldBaseMaxItems: number;
    sceneActiveMaxItems: number;
    sceneRecentMaxItems: number;
    entityMaxItems: number;
    identityMaxItems: number;
    relationshipMaxItems: number;
    eventMaxItems: number;
    shadowEventMaxItems: number;
    interpretationMaxItems: number;
}

export const DEFAULT_XML_NARRATIVE_BUDGET: XmlNarrativeBudgetOptions = {
    timelineMaxItems: 5,
    worldBaseMaxItems: 4,
    sceneActiveMaxItems: 3,
    sceneRecentMaxItems: 3,
    entityMaxItems: 3,
    identityMaxItems: 3,
    relationshipMaxItems: 4,
    eventMaxItems: 5,
    shadowEventMaxItems: 2,
    interpretationMaxItems: 3,
};

/**
 * 功能：渲染 XML + Markdown 记忆上下文。
 * @param context 角色可见记忆上下文。
 * @param injectionStyle 注入风格 ID。
 * @param budgetOptions 预算配置。
 * @returns 渲染后的上下文文本。
 */
export function renderMemoryContextXmlMarkdown(
    context: ActorVisibleMemoryContext,
    injectionStyle: string,
    budgetOptions: Partial<XmlNarrativeBudgetOptions> = {},
): string {
    const style = getNarrativeStyleProfile(injectionStyle);
    const budget = normalizeBudget(budgetOptions);
    const timelineLines = takeLinesByCount(context.timelineLines, budget.timelineMaxItems);
    const worldBaseLines = takeLinesByCount(context.worldBaseLines, budget.worldBaseMaxItems);
    const sceneActiveLines = takeLinesByCount(context.sceneActiveLines, budget.sceneActiveMaxItems);
    const sceneRecentLines = takeLinesByCount(context.sceneRecentLines, budget.sceneRecentMaxItems);
    const entityLines = takeLinesByCount(context.entityLines ?? [], budget.entityMaxItems);
    const identityLines = takeLinesByCount(context.actorView.identityLines, budget.identityMaxItems);
    const relationshipLines = takeLinesByCount(context.actorView.relationshipLines, budget.relationshipMaxItems);
    const eventLines = takeLinesByCount(context.actorView.eventLines, budget.eventMaxItems);
    const shadowEventLines = takeLinesByCount(context.actorView.shadowEventLines ?? [], budget.shadowEventMaxItems);
    const interpretationLines = takeLinesByCount(context.actorView.interpretationLines, budget.interpretationMaxItems);

    return [
        '<memory_context version="1.0">',
        ...(timelineLines.length > 0 ? [
            '  <timeline_index>',
            '## 当前时间线',
            renderBulletLines(timelineLines),
            '  </timeline_index>',
            '',
        ] : []),
        '  <world_base>',
        `## ${style.worldBaseTitle}`,
        renderBulletLines(worldBaseLines),
        '  </world_base>',
        '',
        ...(sceneActiveLines.length > 0 ? [
            '  <scene_active>',
            `## ${style.sceneActiveTitle ?? style.sceneSharedTitle}`,
            renderBulletLines(sceneActiveLines),
            '  </scene_active>',
            '',
        ] : []),
        ...(sceneRecentLines.length > 0 ? [
            '  <scene_recent>',
            `## ${style.sceneRecentTitle ?? '近期重要场景'}`,
            renderBulletLines(sceneRecentLines),
            '  </scene_recent>',
            '',
        ] : []),
        ...(entityLines.length > 0 ? [
            '  <entity_ledger>',
            '## 已知实体',
            renderBulletLines(entityLines),
            '  </entity_ledger>',
            '',
        ] : []),
        `  <actor_view actor="${escapeXmlAttribute(context.actorView.actorKey)}">`,
        `## ${style.actorViewTitle}`,
        renderBulletLines(identityLines),
        '',
        `### ${style.relationshipTitle}`,
        renderBulletLines(relationshipLines),
        '',
        `### ${style.eventTitle}`,
        renderBulletLines(eventLines),
        '',
        ...(shadowEventLines.length > 0 ? [
            '### 被问题唤起的影子记忆',
            renderBulletLines(shadowEventLines),
            '',
        ] : []),
        `### ${style.interpretationTitle}`,
        renderBulletLines(interpretationLines),
        '  </actor_view>',
        '</memory_context>',
    ].join('\n').trim();
}

/**
 * 功能：转义 XML 属性值。
 * @param value 属性原始值。
 * @returns 转义后的文本。
 */
function escapeXmlAttribute(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 功能：标准化预算配置。
 * @param value 原始配置。
 * @returns 标准化预算。
 */
export function normalizeBudget(value: Partial<XmlNarrativeBudgetOptions>): XmlNarrativeBudgetOptions {
    const timelineMaxItems = Math.max(0, Math.trunc(Number(value.timelineMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.timelineMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.timelineMaxItems));
    const worldBaseMaxItems = Math.max(0, Math.trunc(Number(value.worldBaseMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.worldBaseMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.worldBaseMaxItems));
    const sceneActiveMaxItems = Math.max(0, Math.trunc(Number(value.sceneActiveMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.sceneActiveMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.sceneActiveMaxItems));
    const sceneRecentMaxItems = Math.max(0, Math.trunc(Number(value.sceneRecentMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.sceneRecentMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.sceneRecentMaxItems));
    const entityMaxItems = Math.max(0, Math.trunc(Number(value.entityMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.entityMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.entityMaxItems));
    const identityMaxItems = Math.max(0, Math.trunc(Number(value.identityMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.identityMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.identityMaxItems));
    const relationshipMaxItems = Math.max(0, Math.trunc(Number(value.relationshipMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.relationshipMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.relationshipMaxItems));
    const eventMaxItems = Math.max(0, Math.trunc(Number(value.eventMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.eventMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.eventMaxItems));
    const shadowEventMaxItems = Math.max(0, Math.trunc(Number(value.shadowEventMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.shadowEventMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.shadowEventMaxItems));
    const interpretationMaxItems = Math.max(0, Math.trunc(Number(value.interpretationMaxItems ?? DEFAULT_XML_NARRATIVE_BUDGET.interpretationMaxItems) || DEFAULT_XML_NARRATIVE_BUDGET.interpretationMaxItems));
    return {
        timelineMaxItems,
        worldBaseMaxItems,
        sceneActiveMaxItems,
        sceneRecentMaxItems,
        entityMaxItems,
        identityMaxItems,
        relationshipMaxItems,
        eventMaxItems,
        shadowEventMaxItems,
        interpretationMaxItems,
    };
}

/**
 * 功能：按条数裁剪条目列表。
 * @param lines 文本行。
 * @param maxItems 最大条数。
 * @returns 裁剪后的行列表。
 */
function takeLinesByCount(lines: string[], maxItems: number): string[] {
    const normalizedLines = (Array.isArray(lines) ? lines : [])
        .map((line: string): string => String(line ?? '').trim())
        .filter(Boolean);
    return normalizedLines.slice(0, Math.max(0, maxItems));
}

export function estimateXmlNarrativeRetrievalMaxChars(budgetOptions: Partial<XmlNarrativeBudgetOptions> = {}): number {
    const budget = normalizeBudget(budgetOptions);
    const totalPlannedItems = budget.worldBaseMaxItems
        + budget.sceneActiveMaxItems
        + budget.sceneRecentMaxItems
        + budget.entityMaxItems
        + budget.identityMaxItems
        + budget.relationshipMaxItems
        + budget.eventMaxItems
        + budget.shadowEventMaxItems
        + budget.interpretationMaxItems;
    return Math.max(2600, totalPlannedItems * 240);
}
