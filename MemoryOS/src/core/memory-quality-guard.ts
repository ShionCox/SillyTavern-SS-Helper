export type MemoryTextPollutionKind = 'system_tone' | 'user_alias';

export interface MemoryTextPollutionIssue {
    kind: MemoryTextPollutionKind;
    path: string;
}

export const MEMORY_SYSTEM_TONE_PATTERNS: RegExp[] = [
    /本轮/g,
    /本批次/g,
    /当前系统/g,
    /抽取结果/g,
    /结构化处理/g,
    /已识别/g,
    /该批次/g,
    /输出内容/g,
    /处理结果/g,
];

export const MEMORY_USER_ALIAS_PATTERNS: RegExp[] = [
    /用户/g,
    /主角/g,
    /玩家/g,
    /主人公/g,
    /你/g,
];

/**
 * 功能：收集需要质量守卫扫描的自然语言字段。
 * @param value 原始对象。
 * @param fieldNames 需要扫描的叶子字段名。
 * @param path 当前路径。
 * @returns path 到文本内容的映射。
 */
export function collectMemoryNaturalLanguageFields(
    value: unknown,
    fieldNames: Set<string>,
    path: string = '',
): Record<string, string> {
    const result: Record<string, string> = {};
    if (typeof value === 'string') {
        const leafName = path.split('.').pop() ?? path;
        if (fieldNames.has(leafName) || path.endsWith('sourceEvidence.brief')) {
            result[path || leafName] = value;
        }
        return result;
    }
    if (Array.isArray(value)) {
        value.forEach((item: unknown, index: number): void => {
            Object.assign(result, collectMemoryNaturalLanguageFields(item, fieldNames, `${path}.${index}`.replace(/^\./, '')));
        });
        return result;
    }
    if (!value || typeof value !== 'object') {
        return result;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        Object.assign(result, collectMemoryNaturalLanguageFields(item, fieldNames, path ? `${path}.${key}` : key));
    }
    return result;
}

/**
 * 功能：识别记忆文本中的系统腔和用户指代污染。
 * @param textMap path 到文本内容的映射。
 * @param options 可选禁用项。
 * @returns 污染问题列表。
 */
export function findMemoryTextPollution(
    textMap: Record<string, string>,
    options: { includeSecondPersonAlias?: boolean } = {},
): MemoryTextPollutionIssue[] {
    const issues: MemoryTextPollutionIssue[] = [];
    const userAliasPatterns = options.includeSecondPersonAlias === false
        ? MEMORY_USER_ALIAS_PATTERNS.filter((pattern: RegExp): boolean => pattern.source !== '你')
        : MEMORY_USER_ALIAS_PATTERNS;
    for (const [path, value] of Object.entries(textMap)) {
        for (const pattern of MEMORY_SYSTEM_TONE_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(value)) {
                issues.push({ kind: 'system_tone', path });
                break;
            }
        }
        for (const pattern of userAliasPatterns) {
            pattern.lastIndex = 0;
            if (pattern.test(value)) {
                issues.push({ kind: 'user_alias', path });
                break;
            }
        }
    }
    return issues;
}
