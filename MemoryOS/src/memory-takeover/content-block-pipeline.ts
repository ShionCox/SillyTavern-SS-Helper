/**
 * 功能：内容分块管线——把楼层消息拆块、分类、生成 RawFloorRecord。
 * 这是替代旧 source-normalizer + source-segmenter 的新链路。
 */

import { parseContentBlocks } from './content-block-parser';
import { classifyContentBlocks, type ClassifiedContentBlock } from './content-block-classifier';
import type { MemoryTakeoverMessageSlice } from './takeover-source';

/**
 * 功能：定义每一层楼的完整记录。
 * 每个选中楼层都必须生成一条 RawFloorRecord，不论其是否含有正文。
 */
export interface RawFloorRecord {
    /** 楼层号 */
    floor: number;
    /** 宿主原始索引楼层 */
    sourceFloor?: number;
    /** 原始消息文本 */
    originalText: string;
    /** 原始文本来源字段 */
    originalTextSource?: string;
    /** 原始角色 */
    originalRole: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
    /** 是否已纳入批次 */
    includedInBatch: true;
    /** 分类后的内容块列表 */
    parsedBlocks: ClassifiedContentBlock[];
    /** 是否含有主正文 block */
    hasPrimaryStory: boolean;
    /** 是否只含 hint block */
    hasHintOnly: boolean;
    /** 是否全部被排除 */
    hasExcludedOnly: boolean;
}

/**
 * 功能：定义三通道组装结果。
 */
export interface ContentChannelAssembly {
    /** 主正文通道 */
    primaryText: string;
    /** 辅助上下文通道 */
    hintText: string;
    /** 被排除内容的摘要列表 */
    excludedSummary: string[];
    /** 完整的楼层 manifest */
    floorManifest: RawFloorRecord[];
}

/**
 * 功能：对单条消息执行完整的分块分类流程，生成 RawFloorRecord。
 * @param message 消息片段。
 * @returns 该楼层的 RawFloorRecord。
 */
export function buildFloorRecord(message: MemoryTakeoverMessageSlice): RawFloorRecord {
    const floor = message.floor;
    const text = String(message.content ?? '');
    const rawText = String(message.rawVisibleText ?? message.content ?? '');
    const role = normalizeRoleString(message.role);

    const parsedBlocks = parseContentBlocks(floor, text);
    const classifiedBlocks = classifyContentBlocks(parsedBlocks, role);

    const hasPrimary = classifiedBlocks.some((b) => b.includeInPrimaryExtraction);
    const hasHint = classifiedBlocks.some((b) => b.includeAsHint && !b.includeInPrimaryExtraction);
    const allExcluded = classifiedBlocks.length > 0 && classifiedBlocks.every((b) => !b.includeInPrimaryExtraction && !b.includeAsHint);

    return {
        floor,
        sourceFloor: message.sourceFloor,
        originalText: rawText,
        originalTextSource: message.rawVisibleTextSource,
        originalRole: role,
        includedInBatch: true,
        parsedBlocks: classifiedBlocks,
        hasPrimaryStory: hasPrimary,
        hasHintOnly: !hasPrimary && hasHint,
        hasExcludedOnly: allExcluded,
    };
}

/**
 * 功能：对一组消息执行完整管线，生成所有 RawFloorRecord。
 * @param messages 消息列表。
 * @returns 所有楼层的 RawFloorRecord 列表。
 */
export function buildFloorRecords(messages: MemoryTakeoverMessageSlice[]): RawFloorRecord[] {
    return messages.map(buildFloorRecord);
}

/**
 * 功能：从 RawFloorRecord 列表组装三通道文本。
 * @param records 楼层记录列表。
 * @returns 三通道组装结果。
 */
export function assembleContentChannels(records: RawFloorRecord[]): ContentChannelAssembly {
    const primaryParts: string[] = [];
    const hintParts: string[] = [];
    const excludedSummary: string[] = [];

    for (const record of records) {
        for (const block of record.parsedBlocks) {
            if (block.includeInPrimaryExtraction) {
                primaryParts.push(block.rawText);
            } else if (block.includeAsHint) {
                hintParts.push(block.rawText);
            } else {
                const preview = block.rawText.length > 80 ? block.rawText.substring(0, 80) + '…' : block.rawText;
                excludedSummary.push(`[Floor ${record.floor}][${block.resolvedKind}] ${preview}`);
            }
        }
    }

    return {
        primaryText: primaryParts.join('\n\n'),
        hintText: hintParts.join('\n\n'),
        excludedSummary,
        floorManifest: records,
    };
}

/**
 * 功能：完整管线入口——消息 → 分块 → 分类 → 三通道组装。
 * @param messages 消息列表。
 * @returns 三通道组装结果。
 */
/**
 * 功能：归一化 role 字符串。
 */
function normalizeRoleString(role: string): RawFloorRecord['originalRole'] {
    const r = String(role ?? '').trim().toLowerCase();
    if (r === 'user') return 'user';
    if (r === 'assistant') return 'assistant';
    if (r === 'system') return 'system';
    if (r === 'tool') return 'tool';
    return 'unknown';
}
