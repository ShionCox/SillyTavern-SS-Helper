/**
 * 功能：层内内容分块解析器。
 * 将一层消息文本切分为标签块和普通文本块。
 */

/**
 * 功能：定义解析后的内容块。
 */
export interface ParsedContentBlock {
    /** 块唯一标识 */
    blockId: string;
    /** 来源楼层号 */
    floor: number;
    /** 原始标签名（无标签时为 undefined） */
    rawTagName?: string;
    /** 块原始文本 */
    rawText: string;
    /** 在原始消息中的起始偏移 */
    startOffset: number;
    /** 在原始消息中的结束偏移 */
    endOffset: number;
}

/** 匹配任意开始或结束标签。 */
const TAG_TOKEN_PATTERN = /<\/?([a-zA-Z][\w~:-]*)\b[^>]*>/gi;

/**
 * 功能：计数器，用于生成唯一 blockId。
 */
let _blockIdCounter = 0;

/**
 * 功能：生成唯一的 blockId。
 */
function nextBlockId(floor: number): string {
    _blockIdCounter += 1;
    return `blk_${floor}_${_blockIdCounter}`;
}

/**
 * 功能：重置计数器（用于测试）。
 */
export function resetBlockIdCounter(): void {
    _blockIdCounter = 0;
}

/**
 * 功能：将一层消息文本解析为内容块列表。
 * @param floor 楼层号。
 * @param text 消息原始文本。
 * @returns 解析出的内容块列表。
 */
export function parseContentBlocks(floor: number, text: string): ParsedContentBlock[] {
    const sourceText = String(text ?? '');
    if (!sourceText.trim()) {
        return [];
    }

    const blocks: ParsedContentBlock[] = [];
    collectBlocksInRange({
        floor,
        sourceText,
        rangeStart: 0,
        rangeEnd: sourceText.length,
        inheritedTagName: undefined,
        blocks,
    });
    blocks.sort((a, b) => a.startOffset - b.startOffset);
    return blocks;
}

/**
 * 功能：在指定文本区间内递归收集内容块。
 * @param input 递归输入。
 * @returns 无返回值。
 */
function collectBlocksInRange(input: {
    floor: number;
    sourceText: string;
    rangeStart: number;
    rangeEnd: number;
    inheritedTagName?: string;
    blocks: ParsedContentBlock[];
}): void {
    const {
        floor,
        sourceText,
        rangeStart,
        rangeEnd,
        inheritedTagName,
        blocks,
    } = input;
    const tagPattern = new RegExp(TAG_TOKEN_PATTERN.source, 'gi');
    tagPattern.lastIndex = rangeStart;
    let cursor = rangeStart;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(sourceText)) !== null) {
        const tokenStart = match.index;
        if (tokenStart >= rangeEnd) {
            break;
        }
        const fullToken = match[0] ?? '';
        const tokenEnd = tokenStart + fullToken.length;
        const tagName = match[1] ?? '';
        const isClosingTag = fullToken.startsWith('</');

        if (isClosingTag) {
            continue;
        }

        pushPlainTextBlock({
            floor,
            sourceText,
            startOffset: cursor,
            endOffset: tokenStart,
            rawTagName: inheritedTagName,
            blocks,
        });

        const closingTag = findMatchingClosingTag(sourceText, tokenEnd, rangeEnd, tagName);
        if (!closingTag) {
            pushPlainTextBlock({
                floor,
                sourceText,
                startOffset: tokenStart,
                endOffset: rangeEnd,
                rawTagName: inheritedTagName,
                blocks,
            });
            return;
        }

        collectBlocksInRange({
            floor,
            sourceText,
            rangeStart: tokenEnd,
            rangeEnd: closingTag.startOffset,
            inheritedTagName: tagName,
            blocks,
        });
        cursor = closingTag.endOffset;
        tagPattern.lastIndex = cursor;
    }

    pushPlainTextBlock({
        floor,
        sourceText,
        startOffset: cursor,
        endOffset: rangeEnd,
        rawTagName: inheritedTagName,
        blocks,
    });
}

/**
 * 功能：查找指定开始标签对应的结束标签。
 * @param sourceText 原始文本。
 * @param searchStart 查找起点。
 * @param rangeEnd 当前递归区间终点。
 * @param tagName 标签名。
 * @returns 结束标签区间；未找到时返回 undefined。
 */
function findMatchingClosingTag(
    sourceText: string,
    searchStart: number,
    rangeEnd: number,
    tagName: string,
): { startOffset: number; endOffset: number } | undefined {
    const tagPattern = new RegExp(TAG_TOKEN_PATTERN.source, 'gi');
    tagPattern.lastIndex = searchStart;
    const normalizedTagName = String(tagName ?? '').trim().toLowerCase();
    let depth = 1;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(sourceText)) !== null) {
        const tokenStart = match.index;
        if (tokenStart >= rangeEnd) {
            break;
        }
        const fullToken = match[0] ?? '';
        const currentTagName = String(match[1] ?? '').trim().toLowerCase();
        if (currentTagName !== normalizedTagName) {
            continue;
        }
        if (fullToken.startsWith('</')) {
            depth -= 1;
            if (depth === 0) {
                return {
                    startOffset: tokenStart,
                    endOffset: tokenStart + fullToken.length,
                };
            }
            continue;
        }
        depth += 1;
    }
    return undefined;
}

/**
 * 功能：把指定区间的普通文本写入块列表。
 * @param input 写入输入。
 * @returns 无返回值。
 */
function pushPlainTextBlock(input: {
    floor: number;
    sourceText: string;
    startOffset: number;
    endOffset: number;
    rawTagName?: string;
    blocks: ParsedContentBlock[];
}): void {
    const {
        floor,
        sourceText,
        startOffset,
        endOffset,
        rawTagName,
        blocks,
    } = input;
    if (endOffset <= startOffset) {
        return;
    }
    const rawSlice = sourceText.substring(startOffset, endOffset);
    const trimmedText = rawSlice.trim();
    if (!trimmedText) {
        return;
    }
    const leadingTrimmedLength = rawSlice.length - rawSlice.trimStart().length;
    const trailingTrimmedLength = rawSlice.length - rawSlice.trimEnd().length;
    blocks.push({
        blockId: nextBlockId(floor),
        floor,
        rawTagName,
        rawText: trimmedText,
        startOffset: startOffset + leadingTrimmedLength,
        endOffset: endOffset - trailingTrimmedLength,
    });
}
