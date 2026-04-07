import { PEROCORE_CONJUNCTIONS } from './conjunctions';

export const PEROCORE_INTENT_SPLITTERS = {
    punctuation: ['，', ',', '。', '.', '；', ';', '！', '!', '？', '?', '\n'],
    connectors: PEROCORE_CONJUNCTIONS,
} as const;

/**
 * 功能：按 PeroCore 兼容规则切分输入文本。
 * @param text 原始文本。
 * @returns 子句列表。
 */
export function splitTextByPerocoreRules(text: string): string[] {
    const source = String(text ?? '').trim();
    if (!source) {
        return [];
    }
    const escapedPunctuation = PEROCORE_INTENT_SPLITTERS.punctuation
        .map((item: string): string => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const escapedConnectors = PEROCORE_INTENT_SPLITTERS.connectors
        .map((item: string): string => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const splitter = new RegExp(`(?:${escapedPunctuation}|${escapedConnectors})+`, 'u');
    const segments = source
        .split(splitter)
        .map((item: string): string => item.trim())
        .filter((item: string): boolean => item.length > 2);
    return segments.length > 0 ? segments : [source];
}
