import { renderRetentionNarrativePrefix, type RetentionStage } from '../../memory-retention';

/**
 * 功能：渲染关系叙事行。
 * @param text 原始关系文本。
 * @param stage 遗忘阶段。
 * @returns 叙事文本。
 */
export function renderRelationshipNarrative(text: string, stage: RetentionStage): string {
    const normalized = String(text ?? '').trim();
    if (!normalized) {
        return '';
    }
    const prefix = renderRetentionNarrativePrefix(stage);
    return `${prefix}${normalized}`;
}

