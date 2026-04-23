/**
 * 功能：内容分块管线——把楼层消息拆块、分类、生成 RawFloorRecord。
 * 这是替代旧 source-normalizer + source-segmenter 的新链路。
 */

import { getContentLabSettings, type ContentLabSettings } from '../config/content-tag-registry';
import { type ClassifiedContentBlock } from './content-block-classifier';
import { splitContentBlocks } from './content-splitter';
import type { MemoryTakeoverMessageSlice } from './takeover-source';

export type ContentPreviewSourceMode = 'content' | 'raw_visible_text';

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
    /** 本次预览所依据的文本模式 */
    originalTextMode?: ContentPreviewSourceMode;
    /** 原始角色 */
    originalRole: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
    /** 是否已纳入批次 */
    includedInBatch: true;
    /** 分类后的内容块列表 */
    parsedBlocks: ClassifiedContentBlock[];
    /** 拆分模式 */
    splitMode?: ContentLabSettings['splitMode'];
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
 * 功能：定义通用楼层消息结构。
 */
export interface FloorContentMessage {
    role?: string;
    content?: string;
    name?: string;
    turnIndex?: number;
    floor?: number;
}

/**
 * 功能：定义按内容拆分总开关准备后的楼层内容。
 */
export interface PreparedFloorContentResult<T extends FloorContentMessage = FloorContentMessage> {
    /** 送模消息，开启拆分时 content 只保留主正文。 */
    messages: T[];
    /** 三通道结果。 */
    channels: ContentChannelAssembly;
    /** 完整楼层 manifest。 */
    floorRecords: RawFloorRecord[];
    /** 是否实际启用了拆分规则。 */
    splitEnabled: boolean;
}

/**
 * 功能：对单条消息执行完整的分块分类流程，生成 RawFloorRecord。
 * @param message 消息片段。
 * @param previewSourceMode 预览依据的文本模式。
 * @returns 该楼层的 RawFloorRecord。
 */
export function buildFloorRecord(
    message: MemoryTakeoverMessageSlice,
    previewSourceMode: ContentPreviewSourceMode = 'content',
    settings: ContentLabSettings = getContentLabSettings(),
): RawFloorRecord {
    const floor = message.floor;
    const normalizedPreviewSourceMode: ContentPreviewSourceMode = previewSourceMode === 'raw_visible_text'
        ? 'raw_visible_text'
        : 'content';
    const text = normalizedPreviewSourceMode === 'raw_visible_text'
        ? String(message.rawVisibleText ?? message.content ?? '')
        : String(message.content ?? '');
    const rawText = text;
    const role = normalizeRoleString(message.role);

    const classifiedBlocks = splitContentBlocks(floor, text, role, settings);

    const hasPrimary = classifiedBlocks.some((b) => b.includeInPrimaryExtraction);
    const hasHint = classifiedBlocks.some((b) => b.includeAsHint && !b.includeInPrimaryExtraction);
    const allExcluded = classifiedBlocks.length > 0 && classifiedBlocks.every((b) => !b.includeInPrimaryExtraction && !b.includeAsHint);

    return {
        floor,
        sourceFloor: message.sourceFloor,
        originalText: rawText,
        originalTextSource: normalizedPreviewSourceMode === 'raw_visible_text'
            ? (message.rawVisibleTextSource ?? message.contentSource)
            : message.contentSource,
        originalTextMode: normalizedPreviewSourceMode,
        originalRole: role,
        includedInBatch: true,
        parsedBlocks: classifiedBlocks,
        splitMode: settings.splitMode,
        hasPrimaryStory: hasPrimary,
        hasHintOnly: !hasPrimary && hasHint,
        hasExcludedOnly: allExcluded,
    };
}

/**
 * 功能：按整层原文构建楼层记录，不执行标签拆分或排除。
 * @param message 消息片段。
 * @param previewSourceMode 文本来源模式。
 * @returns 该楼层的整层内容记录。
 */
export function buildFullContentFloorRecord(
    message: MemoryTakeoverMessageSlice,
    previewSourceMode: ContentPreviewSourceMode = 'content',
): RawFloorRecord {
    const floor = message.floor;
    const normalizedPreviewSourceMode: ContentPreviewSourceMode = previewSourceMode === 'raw_visible_text'
        ? 'raw_visible_text'
        : 'content';
    const text = normalizedPreviewSourceMode === 'raw_visible_text'
        ? String(message.rawVisibleText ?? message.content ?? '')
        : String(message.content ?? '');
    const normalizedText = text.trim();
    const parsedBlocks: ClassifiedContentBlock[] = normalizedText
        ? [{
            blockId: `raw_${floor}`,
            floor,
            rawText: text,
            startOffset: 0,
            endOffset: text.length,
            resolvedKind: 'story_primary',
            includeInPrimaryExtraction: true,
            includeAsHint: false,
            allowActorPromotion: true,
            allowRelationPromotion: true,
            reasonCodes: ['content_split_disabled'],
        }]
        : [];

    return {
        floor,
        sourceFloor: message.sourceFloor,
        originalText: text,
        originalTextSource: normalizedPreviewSourceMode === 'raw_visible_text'
            ? (message.rawVisibleTextSource ?? message.contentSource)
            : message.contentSource,
        originalTextMode: normalizedPreviewSourceMode,
        originalRole: normalizeRoleString(message.role),
        includedInBatch: true,
        parsedBlocks,
        hasPrimaryStory: parsedBlocks.length > 0,
        hasHintOnly: false,
        hasExcludedOnly: false,
    };
}

/**
 * 功能：对一组消息执行完整管线，生成所有 RawFloorRecord。
 * @param messages 消息列表。
 * @param previewSourceMode 预览依据的文本模式。
 * @returns 所有楼层的 RawFloorRecord 列表。
 */
export function buildFloorRecords(
    messages: MemoryTakeoverMessageSlice[],
    previewSourceMode: ContentPreviewSourceMode = 'content',
    settings: ContentLabSettings = getContentLabSettings(),
): RawFloorRecord[] {
    return messages.map((message: MemoryTakeoverMessageSlice): RawFloorRecord => buildFloorRecord(message, previewSourceMode, settings));
}

/**
 * 功能：对一组消息按整层原文生成楼层记录。
 * @param messages 消息列表。
 * @param previewSourceMode 文本来源模式。
 * @returns 所有楼层的整层内容记录。
 */
export function buildFullContentFloorRecords(
    messages: MemoryTakeoverMessageSlice[],
    previewSourceMode: ContentPreviewSourceMode = 'content',
): RawFloorRecord[] {
    return messages.map((message: MemoryTakeoverMessageSlice): RawFloorRecord => buildFullContentFloorRecord(message, previewSourceMode));
}

/**
 * 功能：按内容拆分总开关准备楼层送模内容。
 * @param messages 原始楼层消息。
 * @param settings 内容拆分设置。
 * @returns 拆分后的消息、三通道与 manifest。
 */
export function prepareFloorContentForSending<T extends FloorContentMessage>(
    messages: T[],
    settings: ContentLabSettings = getContentLabSettings(),
): PreparedFloorContentResult<T> {
    const slices = messages.map((message: T, index: number): MemoryTakeoverMessageSlice => {
        const floor = Math.max(1, Math.trunc(Number(message.floor ?? message.turnIndex ?? index + 1) || index + 1));
        const role = normalizeRoleString(String(message.role ?? 'unknown')) as 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
        return {
            floor,
            sourceFloor: floor,
            role: role === 'tool' || role === 'unknown' ? 'assistant' : role,
            name: String(message.name ?? '').trim(),
            content: String(message.content ?? ''),
        };
    });
    const splitEnabled = settings.enableContentSplit === true;
    const floorRecords = splitEnabled
        ? buildFloorRecords(slices, 'content', settings)
        : buildFullContentFloorRecords(slices, 'content');
    const channels = assembleContentChannels(floorRecords);
    const recordsByFloor = new Map(floorRecords.map((record: RawFloorRecord): [number, RawFloorRecord] => [record.floor, record]));
    const preparedMessages = messages
        .map((message: T, index: number): T => {
            if (!splitEnabled) {
                return { ...message };
            }
            const floor = Math.max(1, Math.trunc(Number(message.floor ?? message.turnIndex ?? index + 1) || index + 1));
            const record = recordsByFloor.get(floor);
            const primaryText = record
                ? record.parsedBlocks
                    .filter((block) => block.includeInPrimaryExtraction)
                    .map((block) => block.rawText)
                    .join('\n\n')
                : '';
            return {
                ...message,
                content: primaryText,
            };
        })
        .filter((message: T): boolean => Boolean(String(message.content ?? '').trim()));
    return {
        messages: preparedMessages,
        channels,
        floorRecords,
        splitEnabled,
    };
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
