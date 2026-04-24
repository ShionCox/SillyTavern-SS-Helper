import { evaluateMemoryFilterJsonPath } from './memory-filter-jsonpath';
import type {
    MemoryFilterBlock,
    MemoryFilterChannel,
    MemoryFilterMode,
    MemoryFilterRule,
    MemoryFilterSettings,
} from './memory-filter-types';

interface DraftMemoryFilterBlock {
    title?: string;
    text: string;
    startOffset: number;
    endOffset: number;
    channel: MemoryFilterChannel;
    reasonCodes: string[];
    diagnostics?: string[];
}

interface XmlToken {
    fullToken: string;
    tagName: string;
    start: number;
    end: number;
    closing: boolean;
}

const TAG_TOKEN_PATTERN = /<\/?([a-zA-Z\u4e00-\u9fa5][\w~:\-\u4e00-\u9fa5]*)\b[^>]*>/gi;

export function splitMemoryFilterBlocks(
    floor: number,
    text: string,
    settings: MemoryFilterSettings,
): MemoryFilterBlock[] {
    const mode = settings.mode;
    const rules = settings.rules
        .filter((rule): boolean => rule.enabled !== false && rule.mode === mode)
        .sort((left, right): number => right.priority - left.priority);
    const drafts = buildDraftBlocksByMode(mode, String(text ?? ''), rules, settings);
    return applyCleanupToDraftBlocks(mode, drafts, settings)
        .map((block, index): MemoryFilterBlock => ({
            id: `${mode}_${floor}_${index + 1}`,
            floor,
            title: block.title || `${resolveModeLabel(mode)} #${index + 1}`,
            rawText: block.text,
            channel: block.channel,
            startOffset: block.startOffset,
            endOffset: block.endOffset,
            reasonCodes: block.reasonCodes,
            diagnostics: block.diagnostics,
        }));
}

function buildDraftBlocksByMode(
    mode: MemoryFilterMode,
    text: string,
    rules: MemoryFilterRule[],
    settings: MemoryFilterSettings,
): DraftMemoryFilterBlock[] {
    if (!text.trim()) {
        return [];
    }
    if (mode === 'xml') {
        return splitByXml(text, rules, settings);
    }
    if (mode === 'delimiter') {
        return splitByDelimiter(text, rules);
    }
    if (mode === 'regex') {
        return splitByRegex(text, rules);
    }
    if (mode === 'markdown') {
        return splitByMarkdown(text, rules[0]);
    }
    return splitByJson(text, rules);
}

function splitByXml(text: string, rules: MemoryFilterRule[], settings: MemoryFilterSettings): DraftMemoryFilterBlock[] {
    const blocks: DraftMemoryFilterBlock[] = [];
    collectXmlBlocks({
        text,
        rangeStart: 0,
        rangeEnd: text.length,
        inheritedTag: undefined,
        rules,
        settings,
        blocks,
    });
    return blocks.length > 0
        ? blocks.sort((left, right): number => left.startOffset - right.startOffset)
        : [createDraft(text, 0, text.length, settings.unknownPolicy, 'xml_no_block')];
}

function collectXmlBlocks(input: {
    text: string;
    rangeStart: number;
    rangeEnd: number;
    inheritedTag?: string;
    rules: MemoryFilterRule[];
    settings: MemoryFilterSettings;
    blocks: DraftMemoryFilterBlock[];
}): void {
    const tokenPattern = createTagRegex();
    tokenPattern.lastIndex = input.rangeStart;
    let cursor = input.rangeStart;
    let match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(input.text)) !== null) {
        const token = toXmlToken(match);
        if (token.start >= input.rangeEnd) {
            break;
        }
        if (token.closing) {
            continue;
        }
        pushXmlPlainBlock({ ...input, startOffset: cursor, endOffset: token.start, tagName: input.inheritedTag });
        const closing = findMatchingClosingTag(input.text, token.end, input.rangeEnd, token.tagName);
        if (!closing) {
            pushXmlPlainBlock({ ...input, startOffset: token.start, endOffset: input.rangeEnd, tagName: input.inheritedTag });
            return;
        }
        collectXmlBlocks({
            ...input,
            rangeStart: token.end,
            rangeEnd: closing.start,
            inheritedTag: token.tagName,
        });
        cursor = closing.end;
        tokenPattern.lastIndex = cursor;
    }
    pushXmlPlainBlock({ ...input, startOffset: cursor, endOffset: input.rangeEnd, tagName: input.inheritedTag });
}

function pushXmlPlainBlock(input: {
    text: string;
    startOffset: number;
    endOffset: number;
    tagName?: string;
    rules: MemoryFilterRule[];
    settings: MemoryFilterSettings;
    blocks: DraftMemoryFilterBlock[];
}): void {
    if (input.endOffset <= input.startOffset) {
        return;
    }
    const rawSlice = input.text.substring(input.startOffset, input.endOffset);
    const trimmedText = rawSlice.trim();
    if (!trimmedText) {
        return;
    }
    const leadingTrimmedLength = rawSlice.length - rawSlice.trimStart().length;
    const channel = resolveXmlChannel(input.tagName, input.rules, input.settings);
    const wrapperPrefix = input.tagName ? `<${input.tagName}>` : '';
    const wrapperSuffix = input.tagName ? `</${input.tagName}>` : '';
    input.blocks.push({
        title: input.tagName || '无标签内容',
        text: input.settings.cleanup.stripWrapper ? trimmedText : `${wrapperPrefix}${trimmedText}${wrapperSuffix}`,
        startOffset: input.startOffset + leadingTrimmedLength,
        endOffset: input.startOffset + leadingTrimmedLength + trimmedText.length,
        channel,
        reasonCodes: input.tagName ? [`tag:${input.tagName}`] : ['plain_text'],
    });
}

function resolveXmlChannel(tagName: string | undefined, rules: MemoryFilterRule[], settings: MemoryFilterSettings): MemoryFilterChannel {
    const normalized = String(tagName ?? '').trim().toLowerCase();
    if (!normalized) {
        return 'memory';
    }
    for (const rule of rules) {
        const names = [rule.tagName, ...(rule.aliases ?? [])]
            .map((item) => String(item ?? '').trim().toLowerCase())
            .filter(Boolean);
        if (names.includes(normalized)) {
            return rule.channel;
        }
        const pattern = String(rule.pattern ?? '').trim();
        if (!pattern) {
            continue;
        }
        if (rule.patternMode === 'regex') {
            try {
                if (new RegExp(pattern, 'i').test(normalized)) {
                    return rule.channel;
                }
            } catch {
                continue;
            }
        } else if (normalized.startsWith(pattern.toLowerCase())) {
            return rule.channel;
        }
    }
    return settings.unknownPolicy;
}

function splitByDelimiter(text: string, rules: MemoryFilterRule[]): DraftMemoryFilterBlock[] {
    const rule = rules[0] ?? { channel: 'memory' as MemoryFilterChannel, delimiters: ['---'], keepDelimiter: false };
    const delimiters = (rule.delimiters ?? []).filter(Boolean);
    if (delimiters.length === 0) {
        return [createDraft(text, 0, text.length, rule.channel, 'delimiter_no_rule')];
    }
    const pattern = new RegExp(delimiters.map(resolveDelimiterText).map(escapeRegexSource).join('|'), 'g');
    const result: DraftMemoryFilterBlock[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const delimiter = match[0] ?? '';
        const end = rule.keepDelimiter ? match.index + delimiter.length : match.index;
        result.push(createDraft(text.slice(cursor, end), cursor, end, rule.channel, 'delimiter_split'));
        cursor = match.index + delimiter.length;
        if (delimiter.length === 0) {
            pattern.lastIndex += 1;
        }
    }
    result.push(createDraft(text.slice(cursor), cursor, text.length, rule.channel, 'delimiter_tail'));
    return result;
}

function splitByRegex(text: string, rules: MemoryFilterRule[]): DraftMemoryFilterBlock[] {
    const blocks: DraftMemoryFilterBlock[] = [];
    for (const rule of rules) {
        if (!rule.regex) {
            continue;
        }
        let pattern: RegExp;
        try {
            pattern = new RegExp(rule.regex, rule.flags || 'g');
        } catch (error) {
            blocks.push({
                title: rule.name,
                text: '',
                startOffset: 0,
                endOffset: 0,
                channel: rule.channel,
                reasonCodes: ['regex_invalid'],
                diagnostics: [`正则无效：${String((error as Error)?.message ?? error)}`],
            });
            continue;
        }
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const captureGroup = Math.max(0, Math.trunc(Number(rule.captureGroup) || 0));
            const value = match[captureGroup] ?? match[0] ?? '';
            const matchStart = match.index + Math.max(0, (match[0] ?? '').indexOf(value));
            blocks.push({
                title: rule.name,
                text: value,
                startOffset: matchStart,
                endOffset: matchStart + value.length,
                channel: rule.channel,
                reasonCodes: ['regex_match'],
            });
            if ((match[0] ?? '').length === 0) {
                pattern.lastIndex += 1;
            }
        }
    }
    return blocks.length > 0
        ? blocks.sort((left, right): number => left.startOffset - right.startOffset)
        : [createDraft(text, 0, text.length, 'memory', 'regex_no_match', ['正则未命中，已保留全文。'])];
}

function splitByMarkdown(text: string, rule?: MemoryFilterRule): DraftMemoryFilterBlock[] {
    const strategy = rule?.markdownStrategy ?? 'heading_or_hr';
    const markers: Array<{ start: number; title: string }> = [];
    let inFence = false;
    let lineStart = 0;
    for (const line of text.split(/(\n)/)) {
        const nextStart = lineStart + line.length;
        if (line !== '\n') {
            const trimmed = line.trim();
            if (/^```/.test(trimmed)) {
                inFence = !inFence;
            } else if (!inFence) {
                const isHeading = /^#{1,6}\s+/.test(trimmed);
                const isHr = /^[-*_](?:\s*[-*_]){2,}\s*$/.test(trimmed);
                if ((strategy === 'heading' && isHeading) || (strategy === 'hr' && isHr) || (strategy === 'heading_or_hr' && (isHeading || isHr))) {
                    markers.push({ start: lineStart, title: isHeading ? trimmed.replace(/^#{1,6}\s+/, '') : '分隔线' });
                }
            }
        }
        lineStart = nextStart;
    }
    if (markers.length === 0) {
        return [createDraft(text, 0, text.length, rule?.channel ?? 'memory', 'markdown_no_marker')];
    }
    const blocks: DraftMemoryFilterBlock[] = [];
    for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index]!;
        const next = markers[index + 1]?.start ?? text.length;
        blocks.push({
            title: marker.title,
            text: text.slice(marker.start, next),
            startOffset: marker.start,
            endOffset: next,
            channel: rule?.channel ?? 'memory',
            reasonCodes: ['markdown_marker'],
        });
    }
    if (markers[0]!.start > 0) {
        blocks.unshift(createDraft(text.slice(0, markers[0]!.start), 0, markers[0]!.start, rule?.channel ?? 'memory', 'markdown_preamble'));
    }
    return blocks;
}

function splitByJson(text: string, rules: MemoryFilterRule[]): DraftMemoryFilterBlock[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return [createDraft(text, 0, text.length, 'memory', 'json_invalid', [`JSON 解析失败：${String((error as Error)?.message ?? error)}`])];
    }
    const blocks: DraftMemoryFilterBlock[] = [];
    for (const rule of rules) {
        const path = rule.jsonPath || '$';
        const values = evaluateMemoryFilterJsonPath(parsed, path);
        if (values.length === 0) {
            blocks.push({
                title: rule.name,
                text: '',
                startOffset: 0,
                endOffset: 0,
                channel: rule.channel,
                reasonCodes: ['json_no_match'],
                diagnostics: [`JSONPath 无命中：${path}`],
            });
            continue;
        }
        for (const value of values) {
            blocks.push({
                title: rule.name,
                text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
                startOffset: 0,
                endOffset: text.length,
                channel: rule.channel,
                reasonCodes: ['json_match'],
            });
        }
    }
    return blocks.length > 0 ? blocks : [createDraft(text, 0, text.length, 'memory', 'json_no_rules')];
}

function applyCleanupToDraftBlocks(mode: MemoryFilterMode, blocks: DraftMemoryFilterBlock[], settings: MemoryFilterSettings): DraftMemoryFilterBlock[] {
    const result: DraftMemoryFilterBlock[] = [];
    for (const block of blocks) {
        const cleanedText = settings.cleanup.trimWhitespace ? block.text.trim() : block.text;
        if (settings.cleanup.dropEmptyBlocks && !cleanedText) {
            if (block.diagnostics?.length) {
                result.push({ ...block, text: cleanedText });
            }
            continue;
        }
        if (cleanedText.length < settings.cleanup.minBlockLength) {
            continue;
        }
        const maxLength = settings.cleanup.maxBlockLength;
        if (maxLength > 0 && cleanedText.length > maxLength) {
            for (let offset = 0; offset < cleanedText.length; offset += maxLength) {
                const part = cleanedText.slice(offset, offset + maxLength);
                result.push({
                    ...block,
                    title: `${block.title ?? resolveModeLabel(mode)}-${Math.floor(offset / maxLength) + 1}`,
                    text: part,
                    startOffset: block.startOffset + offset,
                    endOffset: Math.min(block.startOffset + offset + part.length, block.endOffset),
                    reasonCodes: [...block.reasonCodes, 'cleanup_max_length_split'],
                });
            }
            continue;
        }
        result.push({ ...block, text: cleanedText });
    }
    return result;
}

function findMatchingClosingTag(text: string, searchStart: number, rangeEnd: number, tagName: string): { start: number; end: number } | undefined {
    const tagPattern = createTagRegex();
    tagPattern.lastIndex = searchStart;
    const normalizedTagName = String(tagName ?? '').trim().toLowerCase();
    let depth = 1;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(text)) !== null) {
        const token = toXmlToken(match);
        if (token.start >= rangeEnd) {
            break;
        }
        if (token.tagName.toLowerCase() !== normalizedTagName) {
            continue;
        }
        if (token.closing) {
            depth -= 1;
            if (depth === 0) {
                return { start: token.start, end: token.end };
            }
        } else {
            depth += 1;
        }
    }
    return undefined;
}

function toXmlToken(match: RegExpExecArray): XmlToken {
    const fullToken = match[0] ?? '';
    const start = match.index;
    return {
        fullToken,
        tagName: String(match[1] ?? '').trim(),
        start,
        end: start + fullToken.length,
        closing: fullToken.startsWith('</'),
    };
}

function createTagRegex(): RegExp {
    return new RegExp(TAG_TOKEN_PATTERN.source, 'gi');
}

function createDraft(text: string, startOffset: number, endOffset: number, channel: MemoryFilterChannel, reasonCode: string, diagnostics?: string[]): DraftMemoryFilterBlock {
    return {
        text,
        startOffset,
        endOffset,
        channel,
        reasonCodes: [reasonCode],
        diagnostics,
    };
}

function resolveDelimiterText(value: string): string {
    return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function escapeRegexSource(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveModeLabel(mode: MemoryFilterMode): string {
    if (mode === 'delimiter') return '分隔符';
    if (mode === 'regex') return '正则';
    if (mode === 'markdown') return 'Markdown';
    if (mode === 'json') return 'JSON';
    return 'XML';
}
