/**
 * 功能：记录过滤强度。
 */
export type RecordFilterLevel = 'light' | 'balanced' | 'strict';

/**
 * 功能：记录过滤类型。
 */
export type RecordFilterType = 'html' | 'xml' | 'json' | 'codeblock' | 'markdown';

/**
 * 功能：JSON 文本提取模式。
 */
export type JsonExtractMode = 'off' | 'smart' | 'all_strings';

/**
 * 功能：纯代码消息处理策略。
 */
export type PureCodePolicy = 'drop' | 'placeholder' | 'keep';

/**
 * 功能：记录过滤配置。
 */
export type RecordFilterSettings = {
    enabled: boolean;
    level: RecordFilterLevel;
    filterTypes: RecordFilterType[];
    customCodeblockEnabled: boolean;
    customCodeblockTags: string[];
    jsonExtractMode: JsonExtractMode;
    jsonExtractKeys: string[];
    pureCodePolicy: PureCodePolicy;
    placeholderText: string;
    customRegexEnabled: boolean;
    customRegexRules: string;
    maxTextLength: number;
    minEffectiveChars: number;
};

/**
 * 功能：记录过滤结果。
 */
export type RecordFilterResult = {
    originalText: string;
    filteredText: string;
    dropped: boolean;
    reasonCode: 'ok' | 'empty' | 'min_effective' | 'pure_code';
    appliedRules: string[];
    extractedTexts: string[];
};

const DEFAULT_JSON_KEYS: string[] = ['content', 'text', 'message', 'summary', 'description', 'title', 'reason'];

/**
 * 功能：记录过滤默认配置。
 */
export const DEFAULT_RECORD_FILTER_SETTINGS: RecordFilterSettings = {
    enabled: true,
    level: 'balanced',
    filterTypes: ['html', 'xml', 'json', 'codeblock'],
    customCodeblockEnabled: false,
    customCodeblockTags: ['rolljson'],
    jsonExtractMode: 'off',
    jsonExtractKeys: DEFAULT_JSON_KEYS,
    pureCodePolicy: 'drop',
    placeholderText: '[代码内容已过滤]',
    customRegexEnabled: false,
    customRegexRules: '',
    maxTextLength: 4000,
    minEffectiveChars: 2,
};

type JsonSegment = {
    start: number;
    end: number;
    text: string;
    parsed: unknown;
};

/**
 * 功能：判断字符串是否是合法过滤类型。
 * @param value 待判断值。
 * @returns 是否为合法过滤类型。
 */
function isRecordFilterType(value: string): value is RecordFilterType {
    return value === 'html' || value === 'xml' || value === 'json' || value === 'codeblock' || value === 'markdown';
}

/**
 * 功能：将任意输入转换为字符串数组。
 * @param value 原始值。
 * @returns 清理后的字符串数组。
 */
function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item: unknown) => String(item ?? '').trim())
            .filter((item: string) => item.length > 0);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item: string) => item.trim())
            .filter((item: string) => item.length > 0);
    }
    return [];
}

/**
 * 功能：转义正则字面量文本。
 * @param value 原始文本。
 * @returns 可安全用于正则的文本。
 */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 功能：规范化输入文本。
 * @param rawText 原始文本。
 * @returns 规范化文本。
 */
function normalizeText(rawText: string): string {
    return String(rawText ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
}

/**
 * 功能：按行拆分文本。
 * @param value 原始文本。
 * @returns 非空行数组。
 */
function splitLines(value: string): string[] {
    return String(value || '')
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
}

/**
 * 功能：规范化代码块语言标签。
 * @param value 原始标签文本。
 * @returns 规范化后的标签；无效时返回空字符串。
 */
function normalizeCodeblockTag(value: string): string {
    const compact = String(value || '')
        .trim()
        .replace(/^`+|`+$/g, '')
        .replace(/^[.]+/, '')
        .toLowerCase();
    if (!compact) return '';
    const firstToken = compact.split(/\s+/).find((item: string) => item.length > 0) || '';
    return firstToken.trim();
}

/**
 * 功能：将任意输入归一化为代码块标签数组。
 * @param value 原始值（字符串或数组）。
 * @returns 去重后的标签数组。
 */
function toCodeblockTagArray(value: unknown): string[] {
    const source = Array.isArray(value)
        ? value.map((item: unknown) => String(item ?? '')).join(',')
        : String(value ?? '');
    const normalized = source
        .split(/[,\n|]/)
        .map((item: string) => normalizeCodeblockTag(item))
        .filter((item: string) => item.length > 0);
    return Array.from(new Set(normalized));
}

/**
 * 功能：去除 HTML 噪声。
 * @param value 原始文本。
 * @returns 清理后文本。
 */
function stripHtml(value: string): string {
    let result = value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

    // 先移除成对标签及其内部内容，例如 <div>...</div>
    const pairedTagPattern = /<([a-z][a-z0-9:-]*)\b[^>]*>[\s\S]*?<\/\1>/gi;
    let previous = '';
    while (previous !== result) {
        previous = result;
        result = result.replace(pairedTagPattern, ' ');
    }

    // 再移除剩余的单标签（包含自闭合标签）
    return result.replace(/<\/?([a-z][a-z0-9:-]*)\b[^>]*\/?>/gi, ' ');
}

/**
 * 功能：去除 XML 标签噪声。
 * @param value 原始文本。
 * @returns 清理后文本。
 */
function stripXml(value: string): string {
    return value.replace(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/g, ' ');
}

/**
 * 功能：去除 Markdown 围栏代码块。
 * @param value 原始文本。
 * @param targetTags 目标标签集合；未提供时移除全部代码块。
 * @returns 清理后文本。
 */
function stripCodeBlocks(value: string, targetTags?: Set<string>): string {
    return value.replace(/```([^\n`]*)\s*[\s\S]*?```/g, (block: string, fenceInfoRaw: string): string => {
        if (!targetTags || targetTags.size <= 0) {
            return ' ';
        }
        const tag = normalizeCodeblockTag(String(fenceInfoRaw ?? ''));
        if (!tag) {
            return block;
        }
        return targetTags.has(tag) ? ' ' : block;
    });
}

/**
 * 功能：清理 Markdown 噪声。
 * @param value 原始文本。
 * @returns 清理后文本。
 */
function stripMarkdownNoise(value: string): string {
    return value
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '');
}

/**
 * 功能：对不同级别执行文本压缩。
 * @param value 原始文本。
 * @param level 过滤级别。
 * @returns 处理后的文本。
 */
function applyLevel(value: string, level: RecordFilterLevel): string {
    if (level === 'light') {
        return value
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    if (level === 'balanced') {
        return value
            .replace(/[ \t]+\n/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[{}\[\]<>]{3,}/g, ' ')
            .trim();
    }

    const lines: string[] = value
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => {
            if (!line) return false;
            const letters = (line.match(/[A-Za-z0-9\u4e00-\u9fff]/g) || []).length;
            const symbols = (line.match(/[^\w\u4e00-\u9fff\s]/g) || []).length;
            return letters > 0 && letters >= Math.max(2, symbols * 0.5);
        });
    return lines.join('\n');
}

/**
 * 功能：统计有效字符数量。
 * @param value 输入文本。
 * @returns 有效字符数量。
 */
function countEffectiveChars(value: string): number {
    return (value.match(/[A-Za-z0-9\u4e00-\u9fff]/g) || []).length;
}

/**
 * 功能：判断文本是否像纯代码。
 * @param value 输入文本。
 * @returns 是否像代码文本。
 */
function isLikelyCodeText(value: string): boolean {
    const trimmed: string = value.trim();
    if (!trimmed) return false;
    const codeHits: number = (trimmed.match(/[{}[\];<>`]/g) || []).length;
    const naturalHits: number = countEffectiveChars(trimmed);
    return codeHits >= 8 && naturalHits <= codeHits;
}

/**
 * 功能：解析并构建自定义正则。
 * @param rulesText 规则文本（多行）。
 * @returns 正则对象数组。
 */
function buildCustomRegexes(rulesText: string): RegExp[] {
    const lines: string[] = splitLines(rulesText);
    const regexes: RegExp[] = [];
    for (const line of lines) {
        if (line.startsWith('/') && line.lastIndexOf('/') > 0) {
            const lastSlash = line.lastIndexOf('/');
            const body = line.slice(1, lastSlash);
            const flags = line.slice(lastSlash + 1) || 'g';
            try {
                regexes.push(new RegExp(body, flags));
                continue;
            } catch {
                continue;
            }
        }
        regexes.push(new RegExp(escapeRegExp(line), 'g'));
    }
    return regexes;
}

/**
 * 功能：应用自定义正则清理。
 * @param value 输入文本。
 * @param regexes 正则数组。
 * @returns 清理后的文本。
 */
function applyCustomRegexes(value: string, regexes: RegExp[]): string {
    let result: string = value;
    for (const pattern of regexes) {
        result = result.replace(pattern, ' ');
    }
    return result;
}

/**
 * 功能：提取平衡的 JSON 片段并解析。
 * @param text 输入文本。
 * @returns 解析成功的 JSON 片段数组。
 */
function extractBalancedJsonSegments(text: string): JsonSegment[] {
    const segments: JsonSegment[] = [];
    const stack: string[] = [];
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
        const ch = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{' || ch === '[') {
            if (stack.length === 0) {
                start = index;
            }
            stack.push(ch);
            continue;
        }

        if (ch === '}' || ch === ']') {
            if (stack.length === 0) {
                continue;
            }
            const top = stack[stack.length - 1];
            const matched = (top === '{' && ch === '}') || (top === '[' && ch === ']');
            if (!matched) {
                stack.length = 0;
                start = -1;
                continue;
            }
            stack.pop();
            if (stack.length === 0 && start >= 0) {
                const piece = text.slice(start, index + 1);
                try {
                    const parsed = JSON.parse(piece);
                    segments.push({
                        start,
                        end: index + 1,
                        text: piece,
                        parsed,
                    });
                } catch {
                    // 忽略非 JSON 片段
                } finally {
                    start = -1;
                }
            }
        }
    }

    return segments;
}

/**
 * 功能：提取 JSON 中所有字符串叶子节点。
 * @param value JSON 值。
 * @param bucket 结果容器。
 * @returns 无返回值。
 */
function collectAllStrings(value: unknown, bucket: string[]): void {
    if (typeof value === 'string') {
        const normalized = normalizeText(value);
        if (normalized) bucket.push(normalized);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectAllStrings(item, bucket);
        }
        return;
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value as Record<string, unknown>)) {
            collectAllStrings(item, bucket);
        }
    }
}

/**
 * 功能：按键名提取 JSON 字符串值。
 * @param value JSON 值。
 * @param keySet 目标键集合。
 * @param bucket 结果容器。
 * @returns 无返回值。
 */
function collectStringsByKeys(value: unknown, keySet: Set<string>, bucket: string[]): void {
    if (!value || typeof value !== 'object') {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectStringsByKeys(item, keySet, bucket);
        }
        return;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const normalizedKey = String(key).trim().toLowerCase();
        if (typeof item === 'string' && keySet.has(normalizedKey)) {
            const normalized = normalizeText(item);
            if (normalized) bucket.push(normalized);
        } else {
            collectStringsByKeys(item, keySet, bucket);
        }
    }
}

/**
 * 功能：对配置对象做安全归一化。
 * @param rawSettings 原始设置对象。
 * @returns 归一化后的完整设置。
 */
export function normalizeRecordFilterSettings(rawSettings?: Partial<RecordFilterSettings> | Record<string, unknown> | null): RecordFilterSettings {
    const raw: Record<string, unknown> = rawSettings && typeof rawSettings === 'object'
        ? (rawSettings as Record<string, unknown>)
        : {};

    const levelRaw = String(raw.level ?? DEFAULT_RECORD_FILTER_SETTINGS.level);
    const level: RecordFilterLevel = levelRaw === 'light' || levelRaw === 'strict'
        ? levelRaw
        : 'balanced';

    const jsonModeRaw = String(raw.jsonExtractMode ?? DEFAULT_RECORD_FILTER_SETTINGS.jsonExtractMode);
    const jsonExtractMode: JsonExtractMode = jsonModeRaw === 'smart' || jsonModeRaw === 'all_strings'
        ? jsonModeRaw
        : 'off';

    const purePolicyRaw = String(raw.pureCodePolicy ?? DEFAULT_RECORD_FILTER_SETTINGS.pureCodePolicy);
    const pureCodePolicy: PureCodePolicy = purePolicyRaw === 'placeholder' || purePolicyRaw === 'keep'
        ? purePolicyRaw
        : 'drop';

    const hasFilterTypes = Object.prototype.hasOwnProperty.call(raw, 'filterTypes');
    const filterTypesRaw = toStringArray(raw.filterTypes);
    const sourceFilterTypes = hasFilterTypes ? filterTypesRaw : DEFAULT_RECORD_FILTER_SETTINGS.filterTypes;
    const filterTypes: RecordFilterType[] = Array.from(
        new Set(sourceFilterTypes.filter((item: string): item is RecordFilterType => isRecordFilterType(item)))
    );

    const jsonExtractKeys = Array.from(
        new Set(
            toStringArray(raw.jsonExtractKeys)
                .map((item: string) => item.toLowerCase())
                .filter((item: string) => item.length > 0)
        )
    );

    const maxTextLength = Math.max(
        200,
        Math.min(20000, Number(raw.maxTextLength ?? DEFAULT_RECORD_FILTER_SETTINGS.maxTextLength) || DEFAULT_RECORD_FILTER_SETTINGS.maxTextLength)
    );
    const minEffectiveChars = Math.max(
        1,
        Math.min(200, Number(raw.minEffectiveChars ?? DEFAULT_RECORD_FILTER_SETTINGS.minEffectiveChars) || DEFAULT_RECORD_FILTER_SETTINGS.minEffectiveChars)
    );

    const customCodeblockEnabled = raw.customCodeblockEnabled === true;
    const customCodeblockTags = toCodeblockTagArray(raw.customCodeblockTags);

    return {
        enabled: raw.enabled !== false,
        level,
        filterTypes,
        customCodeblockEnabled,
        customCodeblockTags: customCodeblockTags.length > 0
            ? customCodeblockTags
            : [...DEFAULT_RECORD_FILTER_SETTINGS.customCodeblockTags],
        jsonExtractMode,
        jsonExtractKeys: jsonExtractKeys.length > 0 ? jsonExtractKeys : DEFAULT_JSON_KEYS,
        pureCodePolicy,
        placeholderText: String(raw.placeholderText ?? DEFAULT_RECORD_FILTER_SETTINGS.placeholderText).trim() || DEFAULT_RECORD_FILTER_SETTINGS.placeholderText,
        customRegexEnabled: raw.customRegexEnabled === true,
        customRegexRules: String(raw.customRegexRules ?? ''),
        maxTextLength,
        minEffectiveChars,
    };
}

/**
 * 功能：对记录文本执行完整过滤流程。
 * @param rawText 原始消息文本。
 * @param rawSettings 原始设置对象。
 * @returns 过滤结果。
 */
export function filterRecordText(rawText: string, rawSettings?: Partial<RecordFilterSettings> | Record<string, unknown> | null): RecordFilterResult {
    const settings = normalizeRecordFilterSettings(rawSettings);
    const originalText = normalizeText(rawText);
    const appliedRules: string[] = [];
    const extractedTexts: string[] = [];

    if (!settings.enabled) {
        const passthrough = originalText.slice(0, settings.maxTextLength);
        return {
            originalText,
            filteredText: passthrough,
            dropped: passthrough.length === 0,
            reasonCode: passthrough.length === 0 ? 'empty' : 'ok',
            appliedRules,
            extractedTexts,
        };
    }

    let workingText = originalText;

    if (settings.filterTypes.includes('codeblock')) {
        if (settings.customCodeblockEnabled) {
            const targetTags = new Set<string>(
                settings.customCodeblockTags
                    .map((item: string) => normalizeCodeblockTag(item))
                    .filter((item: string) => item.length > 0)
            );
            workingText = stripCodeBlocks(workingText, targetTags);
            appliedRules.push(`codeblock_custom:${Array.from(targetTags).join('|') || 'rolljson'}`);
        } else {
            workingText = stripCodeBlocks(workingText);
            appliedRules.push('codeblock');
        }
    }

    if (settings.filterTypes.includes('json')) {
        const segments = extractBalancedJsonSegments(workingText);
        if (segments.length > 0) {
            for (const segment of [...segments].sort((left, right) => right.start - left.start)) {
                workingText = `${workingText.slice(0, segment.start)} ${workingText.slice(segment.end)}`;
                if (settings.jsonExtractMode === 'smart') {
                    const bucket: string[] = [];
                    collectStringsByKeys(segment.parsed, new Set(settings.jsonExtractKeys), bucket);
                    extractedTexts.push(...bucket);
                } else if (settings.jsonExtractMode === 'all_strings') {
                    const bucket: string[] = [];
                    collectAllStrings(segment.parsed, bucket);
                    extractedTexts.push(...bucket);
                }
            }
        }
        appliedRules.push('json');
    }

    if (settings.filterTypes.includes('html')) {
        workingText = stripHtml(workingText);
        appliedRules.push('html');
    }

    if (settings.filterTypes.includes('xml')) {
        workingText = stripXml(workingText);
        appliedRules.push('xml');
    }

    if (settings.filterTypes.includes('markdown')) {
        workingText = stripMarkdownNoise(workingText);
        appliedRules.push('markdown');
    }

    if (extractedTexts.length > 0) {
        const merged = Array.from(new Set(extractedTexts.map((item: string) => normalizeText(item)).filter(Boolean)));
        workingText = `${workingText}\n${merged.join('\n')}`;
    }

    workingText = applyLevel(workingText, settings.level);
    appliedRules.push(`level:${settings.level}`);

    if (settings.customRegexEnabled && settings.customRegexRules.trim()) {
        const customRegexes = buildCustomRegexes(settings.customRegexRules);
        if (customRegexes.length > 0) {
            workingText = applyCustomRegexes(workingText, customRegexes);
            appliedRules.push('custom_regex');
        }
    }

    workingText = normalizeText(
        workingText
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
    );

    if (workingText.length > settings.maxTextLength) {
        workingText = workingText.slice(0, settings.maxTextLength);
        appliedRules.push('max_length');
    }

    const effectiveChars = countEffectiveChars(workingText);
    const likelyCode = isLikelyCodeText(workingText);
    const isEmpty = workingText.trim().length === 0;
    const lessThanMin = effectiveChars < settings.minEffectiveChars;

    if (isEmpty || lessThanMin || likelyCode) {
        if (settings.pureCodePolicy === 'placeholder') {
            return {
                originalText,
                filteredText: settings.placeholderText,
                dropped: false,
                reasonCode: isEmpty ? 'empty' : likelyCode ? 'pure_code' : 'min_effective',
                appliedRules,
                extractedTexts: Array.from(new Set(extractedTexts)),
            };
        }
        if (settings.pureCodePolicy === 'keep') {
            const fallbackText = originalText.slice(0, settings.maxTextLength);
            return {
                originalText,
                filteredText: fallbackText,
                dropped: fallbackText.length === 0,
                reasonCode: fallbackText.length === 0 ? 'empty' : 'ok',
                appliedRules,
                extractedTexts: Array.from(new Set(extractedTexts)),
            };
        }
        return {
            originalText,
            filteredText: '',
            dropped: true,
            reasonCode: isEmpty ? 'empty' : likelyCode ? 'pure_code' : 'min_effective',
            appliedRules,
            extractedTexts: Array.from(new Set(extractedTexts)),
        };
    }

    return {
        originalText,
        filteredText: workingText,
        dropped: false,
        reasonCode: 'ok',
        appliedRules,
        extractedTexts: Array.from(new Set(extractedTexts)),
    };
}
