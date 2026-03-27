/**
 * 功能：定义叙事风格模板。
 */
export interface NarrativeStyleProfile {
    styleId: string;
    worldBaseTitle: string;
    sceneSharedTitle: string;
    actorViewTitle: string;
    relationshipTitle: string;
    eventTitle: string;
    interpretationTitle: string;
}

/**
 * 功能：渲染 Markdown 列表。
 * @param lines 行列表。
 * @returns Markdown 文本。
 */
export function renderBulletLines(lines: string[]): string {
    const normalizedLines = (Array.isArray(lines) ? lines : [])
        .map((line: string): string => String(line ?? '').trim())
        .filter(Boolean);
    if (normalizedLines.length <= 0) {
        return '- 暂无';
    }
    return normalizedLines.map((line: string): string => `- ${line}`).join('\n');
}

