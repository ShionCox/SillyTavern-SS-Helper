import type { MemoryTakeoverBatchResult } from '../types';

const STRUCTURED_SKIP_KEYS = new Set([
    'actorKey',
    'sourceActorKey',
    'targetActorKey',
    'participants',
    'relationTag',
    'targetType',
    'entityKey',
    'compareKey',
    'matchKeys',
    'schemaVersion',
    'canonicalName',
    'legacyCompareKeys',
    'bindings',
    'reasonCodes',
    'fieldOverrides',
    'selectedPrimaryKey',
    'selectedSnapshot',
    'batchId',
    'takeoverId',
]);

const BANNED_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /当前用户|该用户|用户(?!名)|主角|主人公|对方/g, replacement: '{{user}}' },
    { pattern: /\{\{\s*userDisplayName\s*\}\}/gi, replacement: '{{user}}' },
    { pattern: /本批次|本轮|当前剧情|当前场景|当前设置地点|当前设置|首次识别到|已触发|已确认|结构化|绑定|主链|输出内容|处理结果|待补全|待确认|需要进一步确认/g, replacement: '' },
];

/**
 * 功能：定义文案清洗统计。
 */
export interface NarrativeSanitizerStats {
    userPlaceholderReplacements: number;
    bannedPatternHits: number;
    unsafeFieldPaths: string[];
}

/**
 * 功能：清洗接管批次结果中的自然语言字段。
 * @param result 批次结果。
 * @returns 清洗后的结果与统计。
 */
export function sanitizeTakeoverBatchNarratives(result: MemoryTakeoverBatchResult): {
    result: MemoryTakeoverBatchResult;
    stats: NarrativeSanitizerStats;
} {
    const stats: NarrativeSanitizerStats = {
        userPlaceholderReplacements: 0,
        bannedPatternHits: 0,
        unsafeFieldPaths: [],
    };
    return {
        result: sanitizeUnknownValue(result, stats, '') as MemoryTakeoverBatchResult,
        stats,
    };
}

/**
 * 功能：递归清洗未知值中的叙事字段。
 * @param value 原始值。
 * @param stats 统计对象。
 * @param path 当前路径。
 * @returns 清洗后的值。
 */
function sanitizeUnknownValue(value: unknown, stats: NarrativeSanitizerStats, path: string): unknown {
    if (typeof value === 'string') {
        return sanitizeNarrativeText(value, stats, path);
    }
    if (Array.isArray(value)) {
        return value.map((item: unknown, index: number): unknown => sanitizeUnknownValue(item, stats, `${path}[${index}]`));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (STRUCTURED_SKIP_KEYS.has(key)) {
            output[key] = child;
            continue;
        }
        output[key] = sanitizeUnknownValue(child, stats, nextPath);
    }
    return output;
}

/**
 * 功能：清洗单个叙事文本字段。
 * @param text 原始文本。
 * @param stats 统计对象。
 * @param path 字段路径。
 * @returns 清洗后的文本。
 */
export function sanitizeNarrativeText(text: string, stats?: NarrativeSanitizerStats, path?: string): string {
    let output = String(text ?? '');
    if (!output.trim()) {
        return output;
    }
    for (const rule of BANNED_PATTERNS) {
        const matches = output.match(rule.pattern);
        if (!matches || matches.length <= 0) {
            continue;
        }
        if (rule.replacement === '{{user}}') {
            if (stats) {
                stats.userPlaceholderReplacements += matches.length;
                stats.bannedPatternHits += matches.length;
            }
        } else if (stats) {
            stats.bannedPatternHits += matches.length;
        }
        output = output.replace(rule.pattern, rule.replacement);
    }
    output = output
        .replace(/([，。！？；])\1+/g, '$1')
        .replace(/[，、]{2,}/g, '，')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[，。；、\s]+/g, '')
        .replace(/[，；、\s]+$/g, '')
        .trim();
    if (isHighRiskSystemNarrative(output) && stats && path) {
        stats.unsafeFieldPaths.push(path);
    }
    return output;
}

/**
 * 功能：判断文本是否仍然带有明显系统腔。
 * @param text 文本内容。
 * @returns 是否为高风险系统腔。
 */
export function isHighRiskSystemNarrative(text: string): boolean {
    const source = String(text ?? '').trim();
    if (!source) {
        return false;
    }
    return /主要确认了|围绕|处理|输出|流程|批次|结构化|识别到|设置地点|待补全|待确认|需要确认/.test(source);
}
