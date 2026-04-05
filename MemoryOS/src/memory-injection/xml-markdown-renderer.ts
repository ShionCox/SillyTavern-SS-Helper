import type { ActorVisibleMemoryContext } from './actor-visible-context-builder';
import { renderBulletLines } from './narrative-renderer/base-renderer';
import { getNarrativeStyleProfile } from './narrative-renderer/style-profiles';

/**
 * 功能：定义注入层预算配置。
 */
export interface XmlNarrativeBudgetOptions {
    worldBaseChars: number;
    sceneSharedChars: number;
    actorViewChars: number;
    totalChars: number;
}

const DEFAULT_BUDGET: XmlNarrativeBudgetOptions = {
    worldBaseChars: 900,
    sceneSharedChars: 700,
    actorViewChars: 1400,
    totalChars: 3200,
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
    const worldBaseLines = trimLinesByBudget(context.worldBaseLines, budget.worldBaseChars);
    const sceneSharedLines = trimLinesByBudget(context.sceneSharedLines, budget.sceneSharedChars);
    const entityLines = trimLinesByBudget(context.entityLines ?? [], Math.floor(budget.sceneSharedChars * 0.6));
    const actorViewLines = trimLinesByBudget([
        ...context.actorView.identityLines,
        ...context.actorView.relationshipLines,
        ...context.actorView.eventLines,
        ...context.actorView.shadowEventLines,
        ...context.actorView.interpretationLines,
    ], budget.actorViewChars);

    const identityLines = trimLinesByBudget(context.actorView.identityLines, Math.floor(budget.actorViewChars * 0.22));
    const relationshipLines = trimLinesByBudget(
        context.actorView.relationshipLines,
        Math.floor(budget.actorViewChars * 0.28),
    );
    const eventLines = trimLinesByBudget(context.actorView.eventLines, Math.floor(budget.actorViewChars * 0.32));
    const shadowEventLines = trimLinesByBudget(
        context.actorView.shadowEventLines ?? [],
        Math.floor(budget.actorViewChars * 0.24),
    );
    const interpretationLines = trimLinesByBudget(
        context.actorView.interpretationLines,
        Math.floor(budget.actorViewChars * 0.28),
    );

    const assembled = [
        '<memory_context version="1.0">',
        ...(context.timelineLines.length > 0 ? [
            '  <timeline_overview>',
            '## 当前事件时间线',
            renderBulletLines(context.timelineLines),
            '  </timeline_overview>',
            '',
        ] : []),
        '  <world_base>',
        `## ${style.worldBaseTitle}`,
        renderBulletLines(worldBaseLines),
        '  </world_base>',
        '',
        '  <scene_shared>',
        `## ${style.sceneSharedTitle}`,
        renderBulletLines(sceneSharedLines),
        '  </scene_shared>',
        '',
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

    if (assembled.length <= budget.totalChars) {
        return assembled;
    }
    const hardTrimmed = assembled.slice(0, budget.totalChars).trim();
    return `${hardTrimmed}\n<!-- budget_trimmed -->`;
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
function normalizeBudget(value: Partial<XmlNarrativeBudgetOptions>): XmlNarrativeBudgetOptions {
    const worldBaseChars = Math.max(300, Number(value.worldBaseChars ?? DEFAULT_BUDGET.worldBaseChars) || DEFAULT_BUDGET.worldBaseChars);
    const sceneSharedChars = Math.max(240, Number(value.sceneSharedChars ?? DEFAULT_BUDGET.sceneSharedChars) || DEFAULT_BUDGET.sceneSharedChars);
    const actorViewChars = Math.max(420, Number(value.actorViewChars ?? DEFAULT_BUDGET.actorViewChars) || DEFAULT_BUDGET.actorViewChars);
    const totalChars = Math.max(
        1000,
        Number(value.totalChars ?? DEFAULT_BUDGET.totalChars) || DEFAULT_BUDGET.totalChars,
    );
    return {
        worldBaseChars,
        sceneSharedChars,
        actorViewChars,
        totalChars,
    };
}

/**
 * 功能：按字符预算裁剪条目列表。
 * @param lines 文本行。
 * @param budgetChars 预算字符数。
 * @returns 裁剪后的行列表。
 */
function trimLinesByBudget(lines: string[], budgetChars: number): string[] {
    const result: string[] = [];
    let used = 0;
    for (const line of lines) {
        const normalized = String(line ?? '').trim();
        if (!normalized) {
            continue;
        }
        const next = normalized.length + 2;
        if (result.length > 0 && used + next > budgetChars) {
            break;
        }
        result.push(normalized);
        used += next;
    }
    return result;
}
