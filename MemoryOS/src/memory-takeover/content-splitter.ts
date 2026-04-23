/**
 * 功能：内容拆分台五模式拆分器。
 * 将 XML / 分隔符 / 正则 / Markdown / JSONPath 统一转换为 ClassifiedContentBlock。
 */

import {
    getContentLabSettings,
    type ContentLabSettings,
    type ContentSplitChannel,
    type ContentSplitMode,
    type ContentSplitRule,
} from '../config/content-tag-registry';
import { parseContentBlocks, type ParsedContentBlock } from './content-block-parser';
import { classifyContentBlocks, type ClassifiedContentBlock } from './content-block-classifier';

interface DraftSplitBlock {
    title?: string;
    text: string;
    startOffset: number;
    endOffset: number;
    channel: ContentSplitChannel;
    reasonCodes: string[];
    diagnostics?: string[];
    metadata?: Record<string, string | number | boolean>;
}

/**
 * 功能：按当前内容拆分台设置拆分一层文本。
 */
export function splitContentBlocks(
    floor: number,
    text: string,
    role: string,
    settings: ContentLabSettings = getContentLabSettings(),
): ClassifiedContentBlock[] {
    const mode = settings.splitMode;
    if (mode === 'xml') {
        const blocks = classifyContentBlocks(parseContentBlocks(floor, text), role);
        return applyCleanupToClassifiedBlocks(floor, mode, blocks, settings);
    }
    const rules = settings.rules
        .filter((rule: ContentSplitRule): boolean => rule.enabled !== false && rule.mode === mode)
        .sort((left: ContentSplitRule, right: ContentSplitRule): number => right.priority - left.priority);
    const drafts = buildDraftBlocksByMode(mode, String(text ?? ''), rules);
    const cleaned = applyCleanupToDraftBlocks(mode, drafts, settings);
    return cleaned.map((block: DraftSplitBlock, index: number): ClassifiedContentBlock => buildClassifiedBlock(floor, mode, block, index));
}

function buildDraftBlocksByMode(mode: ContentSplitMode, text: string, rules: ContentSplitRule[]): DraftSplitBlock[] {
    if (!text.trim()) {
        return [];
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
    if (mode === 'jsonpath') {
        return splitByJsonPath(text, rules);
    }
    return [];
}

function splitByDelimiter(text: string, rules: ContentSplitRule[]): DraftSplitBlock[] {
    const rule = rules[0] ?? {
        channel: 'primary' as ContentSplitChannel,
        delimiters: ['---'],
        keepDelimiter: false,
    };
    const delimiters = (rule.delimiters ?? []).filter(Boolean);
    if (delimiters.length === 0) {
        return [createDraft(text, 0, text.length, rule.channel, 'delimiter_no_rule')];
    }
    const escaped = delimiters.map(resolveDelimiterText).map(escapeRegexSource).join('|');
    const pattern = new RegExp(escaped, 'g');
    const result: DraftSplitBlock[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        const delimiter = match[0] ?? '';
        const end = rule.keepDelimiter ? match.index + delimiter.length : match.index;
        result.push(createDraft(text.slice(cursor, end), cursor, end, resolveRuleBlockChannel(rule, result.length), 'delimiter_split'));
        cursor = rule.keepDelimiter ? match.index + delimiter.length : match.index + delimiter.length;
        if (delimiter.length === 0) {
            pattern.lastIndex += 1;
        }
    }
    result.push(createDraft(text.slice(cursor), cursor, text.length, resolveRuleBlockChannel(rule, result.length), 'delimiter_tail'));
    return result;
}

function splitByRegex(text: string, rules: ContentSplitRule[]): DraftSplitBlock[] {
    const blocks: DraftSplitBlock[] = [];
    for (const rule of rules) {
        if (!rule.regex) {
            continue;
        }
        let pattern: RegExp;
        try {
            pattern = new RegExp(rule.regex, rule.flags || 'g');
        } catch (error) {
            blocks.push({
                text: '',
                startOffset: 0,
                endOffset: 0,
                channel: rule.channel,
                reasonCodes: ['regex_invalid'],
                diagnostics: [`正则无效：${String((error as Error)?.message ?? error)}`],
                title: rule.label,
            });
            continue;
        }
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const captureGroup = Math.max(0, Math.trunc(Number(rule.captureGroup) || 0));
            const value = match[captureGroup] ?? match[0] ?? '';
            const matchStart = match.index + Math.max(0, (match[0] ?? '').indexOf(value));
            blocks.push({
                title: rule.label,
                text: value,
                startOffset: matchStart,
                endOffset: matchStart + value.length,
                channel: rule.channel,
                reasonCodes: ['regex_match'],
                metadata: { captureGroup },
            });
            if ((match[0] ?? '').length === 0) {
                pattern.lastIndex += 1;
            }
        }
    }
    if (blocks.length === 0) {
        return [createDraft(text, 0, text.length, 'primary', 'regex_no_match', ['正则未命中，已保留全文。'])];
    }
    return blocks.sort((left: DraftSplitBlock, right: DraftSplitBlock): number => left.startOffset - right.startOffset);
}

function splitByMarkdown(text: string, rule?: ContentSplitRule): DraftSplitBlock[] {
    const strategy = rule?.markdownStrategy ?? 'heading_or_hr';
    const markers: Array<{ start: number; title: string }> = [];
    const linePattern = /^(#{1,6}\s+.+|[-*_]\s*[-*_]\s*[-*_\s]*)$/gm;
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
    void linePattern;
    if (markers.length === 0) {
        return [createDraft(text, 0, text.length, rule?.channel ?? 'primary', 'markdown_no_marker')];
    }
    const blocks: DraftSplitBlock[] = [];
    for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index]!;
        const next = markers[index + 1]?.start ?? text.length;
        blocks.push({
            title: marker.title,
            text: text.slice(marker.start, next),
            startOffset: marker.start,
            endOffset: next,
            channel: rule?.channel ?? 'primary',
            reasonCodes: ['markdown_marker'],
        });
    }
    if (markers[0]!.start > 0) {
        blocks.unshift(createDraft(text.slice(0, markers[0]!.start), 0, markers[0]!.start, rule?.channel ?? 'primary', 'markdown_preamble'));
    }
    return blocks;
}

function splitByJsonPath(text: string, rules: ContentSplitRule[]): DraftSplitBlock[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return [createDraft(text, 0, text.length, 'primary', 'jsonpath_invalid_json', [`JSON 解析失败：${String((error as Error)?.message ?? error)}`])];
    }
    const blocks: DraftSplitBlock[] = [];
    for (const rule of rules) {
        const path = rule.jsonPath || '$';
        const values = evaluateSimpleJsonPath(parsed, path);
        if (values.length === 0) {
            blocks.push({
                title: rule.label,
                text: '',
                startOffset: 0,
                endOffset: 0,
                channel: rule.channel,
                reasonCodes: ['jsonpath_no_match'],
                diagnostics: [`JSONPath 无命中：${path}`],
                metadata: { path },
            });
            continue;
        }
        for (const value of values) {
            const rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            blocks.push({
                title: rule.label,
                text: rendered,
                startOffset: 0,
                endOffset: text.length,
                channel: rule.channel,
                reasonCodes: ['jsonpath_match'],
                metadata: { path },
            });
        }
    }
    return blocks.length > 0 ? blocks : [createDraft(text, 0, text.length, 'primary', 'jsonpath_no_rules')];
}

function evaluateSimpleJsonPath(root: unknown, path: string): unknown[] {
    const normalized = String(path ?? '').trim();
    if (!normalized || normalized === '$') {
        return [root];
    }
    const tokens = normalized.replace(/^\$\.?/, '').match(/[^.[\]]+|\[(\d+|\*)\]/g) ?? [];
    let cursors: unknown[] = [root];
    for (const token of tokens) {
        const next: unknown[] = [];
        const arrayMatch = token.match(/^\[(\d+|\*)\]$/);
        for (const cursor of cursors) {
            if (arrayMatch) {
                if (!Array.isArray(cursor)) continue;
                if (arrayMatch[1] === '*') {
                    next.push(...cursor);
                } else {
                    const value = cursor[Number(arrayMatch[1])];
                    if (value !== undefined) next.push(value);
                }
                continue;
            }
            if (Array.isArray(cursor)) {
                for (const item of cursor) {
                    if (item && typeof item === 'object' && token in item) {
                        next.push((item as Record<string, unknown>)[token]);
                    }
                }
            } else if (cursor && typeof cursor === 'object' && token in cursor) {
                next.push((cursor as Record<string, unknown>)[token]);
            }
        }
        cursors = next;
    }
    return cursors;
}

function applyCleanupToClassifiedBlocks(
    floor: number,
    mode: ContentSplitMode,
    blocks: ClassifiedContentBlock[],
    settings: ContentLabSettings,
): ClassifiedContentBlock[] {
    const drafts = blocks.map((block: ClassifiedContentBlock): DraftSplitBlock => ({
        title: block.rawTagName,
        text: settings.cleanup.stripWrapper ? block.rawText : rebuildXmlWrapper(block),
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        channel: block.includeInPrimaryExtraction ? 'primary' : block.includeAsHint ? 'hint' : 'excluded',
        reasonCodes: block.reasonCodes,
        metadata: block.rawTagName ? { tag: block.rawTagName } : undefined,
    }));
    return applyCleanupToDraftBlocks(mode, drafts, settings)
        .map((block: DraftSplitBlock, index: number): ClassifiedContentBlock => buildClassifiedBlock(floor, mode, block, index));
}

function applyCleanupToDraftBlocks(mode: ContentSplitMode, blocks: DraftSplitBlock[], settings: ContentLabSettings): DraftSplitBlock[] {
    const result: DraftSplitBlock[] = [];
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

function buildClassifiedBlock(
    floor: number,
    mode: ContentSplitMode,
    block: DraftSplitBlock,
    index: number,
): ClassifiedContentBlock {
    const includeInPrimaryExtraction = block.channel === 'primary';
    const includeAsHint = block.channel === 'primary' || block.channel === 'hint';
    return {
        blockId: `${mode}_${floor}_${index + 1}`,
        floor,
        rawText: block.text,
        startOffset: block.startOffset,
        endOffset: block.endOffset,
        splitMode: mode,
        title: block.title || `${resolveModeLabel(mode)} #${index + 1}`,
        channel: block.channel,
        metadata: block.metadata,
        diagnostics: block.diagnostics,
        resolvedKind: includeInPrimaryExtraction ? 'story_primary' : includeAsHint ? 'summary' : 'meta_commentary',
        includeInPrimaryExtraction,
        includeAsHint,
        allowActorPromotion: includeInPrimaryExtraction,
        allowRelationPromotion: includeInPrimaryExtraction,
        reasonCodes: block.reasonCodes,
    };
}

function createDraft(
    text: string,
    startOffset: number,
    endOffset: number,
    channel: ContentSplitChannel,
    reasonCode: string,
    diagnostics?: string[],
): DraftSplitBlock {
    return {
        text,
        startOffset,
        endOffset,
        channel,
        reasonCodes: [reasonCode],
        diagnostics,
    };
}

function rebuildXmlWrapper(block: ParsedContentBlock): string {
    if (!block.rawTagName) {
        return block.rawText;
    }
    return `<${block.rawTagName}>${block.rawText}</${block.rawTagName}>`;
}

function escapeRegexSource(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDelimiterText(value: string): string {
    return value
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}

function resolveModeLabel(mode: ContentSplitMode): string {
    if (mode === 'delimiter') return '分隔符';
    if (mode === 'regex') return '正则';
    if (mode === 'markdown') return 'Markdown';
    if (mode === 'jsonpath') return 'JSONPath';
    return 'XML';
}

function resolveRuleBlockChannel(rule: ContentSplitRule, index: number): ContentSplitChannel {
    return rule.blockChannels?.[String(index)] ?? rule.channel;
}
